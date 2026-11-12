export interface Esp32TelemetryData {
  device: string;
  heart_rate: number;
  spo2: number;
  temperature: number;
  blood_pressure_systolic: number;
  blood_pressure_diastolic: number;
  signal_quality: string;
  last_updated?: string;
  connected?: boolean;
}

export interface Esp32SerialPublicState {
  isConnected: boolean;
  isConnecting: boolean;
  devicePort: string | null;
  errorMsg: string | null;
  baudRate: number;
  micLevel: number;
  isSpeaking: boolean;
  telemetry: Esp32TelemetryData;
}

export interface Esp32SerialSubscriber {
  onStateChange?: (state: Esp32SerialPublicState) => void;
  onTelemetry?: (telemetry: Esp32TelemetryData) => void;
  onMicLevel?: (level: number, speaking: boolean) => void;
  onAudioPcm?: (b64Pcm: string, isSpeaking: boolean) => void;
  onEcgSample?: (val: number) => void;
}

interface InternalSingletonState {
  port: any | null;
  reader: any | null;
  isReading: boolean;
  stopRequested: boolean;
  readGeneration: number;
  connectPromise: Promise<boolean> | null;
  autoConnectAttempted: boolean;
  listenersAttached: boolean;
  subscribers: Set<Esp32SerialSubscriber>;
  publicState: Esp32SerialPublicState;
}

declare global {
  interface Window {
    __JANSAATHI_ESP32_SINGLETON__?: InternalSingletonState;
    __JANSAATHI_ESP32_PORT__?: any;
    __JANSAATHI_ESP32_READER__?: any;
  }
}

const DEFAULT_TELEMETRY: Esp32TelemetryData = {
  device: 'ESP32-S3-N16R8',
  heart_rate: 0,
  spo2: 0,
  temperature: 0,
  blood_pressure_systolic: 0,
  blood_pressure_diastolic: 0,
  signal_quality: 'no_finger',
  connected: false,
};

function getSingleton(): InternalSingletonState {
  if (typeof window !== 'undefined' && window.__JANSAATHI_ESP32_SINGLETON__) {
    return window.__JANSAATHI_ESP32_SINGLETON__;
  }

  const state: InternalSingletonState = {
    port: null,
    reader: null,
    isReading: false,
    stopRequested: false,
    readGeneration: 0,
    connectPromise: null,
    autoConnectAttempted: false,
    listenersAttached: false,
    subscribers: new Set<Esp32SerialSubscriber>(),
    publicState: {
      isConnected: false,
      isConnecting: false,
      devicePort: null,
      errorMsg: null,
      baudRate: 921600,
      micLevel: 0,
      isSpeaking: false,
      telemetry: { ...DEFAULT_TELEMETRY },
    },
  };

  if (typeof window !== 'undefined') {
    window.__JANSAATHI_ESP32_SINGLETON__ = state;
  }
  return state;
}

function notifyStateChange(s: InternalSingletonState) {
  const snapshot: Esp32SerialPublicState = {
    ...s.publicState,
    telemetry: { ...s.publicState.telemetry },
  };
  s.subscribers.forEach((sub) => {
    try {
      sub.onStateChange?.(snapshot);
    } catch (err) {
      console.warn('[Esp32Serial] Subscriber state callback error:', err);
    }
  });
}

function selectPreferredPort(ports: any[]): any | null {
  if (!ports || ports.length === 0) return null;
  // Prefer Espressif / WCH CH343 / Silicon Labs CP210x USB vendor IDs
  const preferredVids = new Set([0x303a, 0x1a86, 0x10c4, 0x0403]);
  const preferred = ports.find((p) => {
    try {
      const info = p.getInfo?.();
      return info && preferredVids.has(info.usbVendorId);
    } catch {
      return false;
    }
  });
  return preferred || ports[0];
}

async function releaseReaderAndPort(s: InternalSingletonState, closePort = true) {
  s.stopRequested = true;
  s.readGeneration += 1;

  const activeReader = s.reader || (typeof window !== 'undefined' ? window.__JANSAATHI_ESP32_READER__ : null);
  s.reader = null;
  if (typeof window !== 'undefined') {
    window.__JANSAATHI_ESP32_READER__ = null;
  }

  if (activeReader) {
    try {
      await activeReader.cancel();
    } catch {}
    try {
      activeReader.releaseLock();
    } catch {}
  }

  s.isReading = false;

  if (closePort) {
    const activePort = s.port || (typeof window !== 'undefined' ? window.__JANSAATHI_ESP32_PORT__ : null);
    s.port = null;
    if (typeof window !== 'undefined') {
      window.__JANSAATHI_ESP32_PORT__ = null;
    }
    if (activePort) {
      try {
        await activePort.close();
      } catch {}
    }
  }
}

async function startReadLoop(s: InternalSingletonState, port: any) {
  // If we are already actively reading this exact open port, keep the existing loop alive!
  if (s.isReading && s.port === port && s.reader) {
    return;
  }

  // Stop any previous stale reader on another port/generation
  if (s.reader) {
    await releaseReaderAndPort(s, false);
  }

  s.stopRequested = false;
  const myGen = ++s.readGeneration;

  // Brief backoff if Chrome is still finalizing cancel() on port.readable
  let retries = 0;
  while (port.readable?.locked && retries < 6) {
    await new Promise((r) => setTimeout(r, 120));
    retries++;
  }

  if (myGen !== s.readGeneration) return;

  if (!port.readable) {
    s.publicState.errorMsg = 'USB serial stream is not readable.';
    s.publicState.isConnected = false;
    notifyStateChange(s);
    return;
  }

  if (port.readable.locked) {
    s.publicState.errorMsg = 'Serial port locked by another tab or Arduino Serial Monitor.';
    notifyStateChange(s);
    return;
  }

  const reader = port.readable.getReader();
  s.port = port;
  s.reader = reader;
  s.isReading = true;
  if (typeof window !== 'undefined') {
    window.__JANSAATHI_ESP32_PORT__ = port;
    window.__JANSAATHI_ESP32_READER__ = reader;
  }

  const decoder = new TextDecoder('utf-8');
  let lineBuffer = '';

  try {
    while (!s.stopRequested && myGen === s.readGeneration) {
      const { value, done } = await reader.read();
      if (done || s.stopRequested || myGen !== s.readGeneration) break;
      if (!value) continue;

      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';

      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        const startIdx = trimmed.indexOf('{');
        const endIdx = trimmed.lastIndexOf('}');
        if (startIdx === -1 || endIdx <= startIdx) continue;

        try {
          const data = JSON.parse(trimmed.slice(startIdx, endIdx + 1));

          if (data.type === 'ecg' && typeof data.val === 'number') {
            s.subscribers.forEach((sub) => sub.onEcgSample?.(data.val));
          } else if (data.type === 'mic_level') {
            const lvl = Math.min(100, Math.max(0, Number(data.val || 0)));
            const spk = Boolean(data.speaking);
            s.publicState.micLevel = lvl;
            s.publicState.isSpeaking = spk;
            s.subscribers.forEach((sub) => sub.onMicLevel?.(lvl, spk));
          } else if (data.type === 'audio_pcm' && typeof data.b64 === 'string' && data.b64.length > 0) {
            const spk = s.publicState.isSpeaking;
            s.subscribers.forEach((sub) => sub.onAudioPcm?.(data.b64, spk));
          } else if (data.type === 'telemetry') {
            const updated: Esp32TelemetryData = {
              device: data.device || 'ESP32-S3-N16R8',
              heart_rate: data.hr !== undefined ? Number(data.hr) : 0,
              spo2: data.spo2 !== undefined ? Number(data.spo2) : 0,
              temperature: data.temp !== undefined ? Number(data.temp) : 0,
              blood_pressure_systolic: data.bp_sys !== undefined ? Number(data.bp_sys) : 0,
              blood_pressure_diastolic: data.bp_dia !== undefined ? Number(data.bp_dia) : 0,
              signal_quality: data.quality || 'no_finger',
              last_updated: new Date().toLocaleTimeString(),
              connected: true,
            };
            s.publicState.telemetry = updated;
            s.subscribers.forEach((sub) => sub.onTelemetry?.(updated));
          } else if (data.type === 'device_info') {
            if (typeof data.baud === 'number' && data.baud > 0) {
              s.publicState.baudRate = data.baud;
              s.publicState.devicePort = `USB Port (${data.baud} baud)`;
              notifyStateChange(s);
            }
          }
        } catch {
          // Ignore partial boot messages or truncated JSON lines right after USB connect
        }
      }
    }
  } catch (err: any) {
    if (!s.stopRequested && myGen === s.readGeneration) {
      console.warn('[Esp32Serial] Read loop ended unexpectedly:', err);
      s.publicState.isConnected = false;
      s.publicState.devicePort = null;
      s.publicState.micLevel = 0;
      s.publicState.isSpeaking = false;
      s.publicState.errorMsg = err?.message || 'USB connection interrupted.';
      notifyStateChange(s);
    }
  } finally {
    if (myGen === s.readGeneration) {
      s.isReading = false;
      try {
        reader.releaseLock();
      } catch {}
      if (s.reader === reader) {
        s.reader = null;
      }
      if (typeof window !== 'undefined' && window.__JANSAATHI_ESP32_READER__ === reader) {
        window.__JANSAATHI_ESP32_READER__ = null;
      }
    }
  }
}

async function openPortWithBaud(port: any, baud: number): Promise<boolean> {
  try {
    if (port.readable) {
      // Port is already open in this browser session
      return true;
    }
    await port.open({ baudRate: baud });
    return true;
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (msg.toLowerCase().includes('already open')) {
      return true;
    }
    throw err;
  }
}

function attachBrowserUsbEvents(s: InternalSingletonState) {
  if (s.listenersAttached) return;
  if (typeof navigator === 'undefined' || !('serial' in navigator)) return;
  s.listenersAttached = true;

  const serial = (navigator as any).serial;
  serial.addEventListener('disconnect', async () => {
    await releaseReaderAndPort(s, false);
    s.port = null;
    if (typeof window !== 'undefined') {
      window.__JANSAATHI_ESP32_PORT__ = null;
    }
    s.publicState.isConnected = false;
    s.publicState.devicePort = null;
    s.publicState.micLevel = 0;
    s.publicState.isSpeaking = false;
    s.publicState.telemetry = { ...DEFAULT_TELEMETRY };
    s.publicState.errorMsg = 'ESP32 USB cable disconnected.';
    notifyStateChange(s);
  });

  serial.addEventListener('connect', () => {
    setTimeout(() => {
      esp32SerialService.tryAutoConnect();
    }, 500);
  });
}

export const esp32SerialService = {
  getState(): Esp32SerialPublicState {
    const s = getSingleton();
    return {
      ...s.publicState,
      telemetry: { ...s.publicState.telemetry },
    };
  },

  subscribe(sub: Esp32SerialSubscriber): () => void {
    const s = getSingleton();
    attachBrowserUsbEvents(s);
    s.subscribers.add(sub);

    // Immediately deliver live connection & telemetry state on mount/navigation
    try {
      sub.onStateChange?.(this.getState());
      if (s.publicState.isConnected) {
        sub.onTelemetry?.({ ...s.publicState.telemetry });
      }
    } catch {}

    // If port is open in window state without an active read loop, recover it cleanly
    if (s.port && s.port.readable && !s.isReading) {
      void startReadLoop(s, s.port);
    }

    return () => {
      // ONLY detach UI listener on unmount; KEEP port + reader alive across route changes!
      s.subscribers.delete(sub);
    };
  },

  async tryAutoConnect(): Promise<boolean> {
    const s = getSingleton();
    attachBrowserUsbEvents(s);

    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      return false;
    }

    if (s.publicState.isConnected && s.port?.readable) {
      if (!s.isReading) {
        void startReadLoop(s, s.port);
      }
      notifyStateChange(s);
      return true;
    }

    if (s.connectPromise) {
      return s.connectPromise;
    }

    const work = (async () => {
      try {
        const serial = (navigator as any).serial;
        const ports: any[] = await serial.getPorts();
        const port = s.port || selectPreferredPort(ports);
        if (!port) return false;

        s.publicState.isConnecting = true;
        s.publicState.errorMsg = null;
        notifyStateChange(s);

        await openPortWithBaud(port, s.publicState.baudRate);

        s.port = port;
        s.publicState.isConnected = true;
        s.publicState.isConnecting = false;
        s.publicState.devicePort = `USB Port (${s.publicState.baudRate} baud)`;
        s.publicState.errorMsg = null;
        notifyStateChange(s);

        void startReadLoop(s, port);
        return true;
      } catch (err: any) {
        s.publicState.isConnecting = false;
        // Silent failure on auto-connect so disconnected kiosks stay calm
        console.debug('[Esp32Serial] Auto-connect deferred:', err?.message || err);
        notifyStateChange(s);
        return false;
      } finally {
        s.connectPromise = null;
      }
    })();

    s.connectPromise = work;
    return work;
  },

  async connect(requestedBaud?: number): Promise<boolean> {
    const s = getSingleton();
    attachBrowserUsbEvents(s);

    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      s.publicState.errorMsg = 'Web Serial API requires Chrome or Edge desktop browser.';
      notifyStateChange(s);
      return false;
    }

    if (s.connectPromise) {
      return s.connectPromise;
    }

    if (requestedBaud && requestedBaud > 0) {
      s.publicState.baudRate = requestedBaud;
    }

    const work = (async () => {
      s.publicState.isConnecting = true;
      s.publicState.errorMsg = null;
      notifyStateChange(s);

      try {
        const serial = (navigator as any).serial;
        let port = s.port;
        if (!port) {
          const existing: any[] = await serial.getPorts();
          const candidate = selectPreferredPort(existing);
          if (candidate) {
            try {
              await openPortWithBaud(candidate, s.publicState.baudRate);
              port = candidate;
            } catch {
              port = null;
            }
          }
        }

        if (!port) {
          port = await serial.requestPort();
          await openPortWithBaud(port, s.publicState.baudRate);
        }

        s.port = port;
        s.publicState.isConnected = true;
        s.publicState.isConnecting = false;
        s.publicState.devicePort = `USB Port (${s.publicState.baudRate} baud)`;
        s.publicState.errorMsg = null;
        notifyStateChange(s);

        void startReadLoop(s, port);
        return true;
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (err?.name === 'NotFoundError' || msg.includes('No port selected')) {
          s.publicState.errorMsg = null;
        } else if (msg.includes('Failed to open serial port')) {
          s.publicState.errorMsg = 'Port busy — close Arduino Serial Monitor or other serial tabs, then click Reset Port.';
        } else {
          s.publicState.errorMsg = msg || 'Unable to connect ESP32 USB port.';
        }
        s.publicState.isConnecting = false;
        notifyStateChange(s);
        return false;
      } finally {
        s.connectPromise = null;
      }
    })();

    s.connectPromise = work;
    return work;
  },

  async disconnect(): Promise<void> {
    const s = getSingleton();
    await releaseReaderAndPort(s, true);
    s.publicState.isConnected = false;
    s.publicState.isConnecting = false;
    s.publicState.devicePort = null;
    s.publicState.micLevel = 0;
    s.publicState.isSpeaking = false;
    s.publicState.telemetry = { ...DEFAULT_TELEMETRY };
    notifyStateChange(s);
  },

  async forceReset(): Promise<void> {
    const s = getSingleton();
    s.publicState.errorMsg = null;
    await releaseReaderAndPort(s, true);
    try {
      const ports: any[] = await (navigator as any).serial.getPorts();
      for (const p of ports) {
        if (p.readable) {
          try { await p.close(); } catch {}
        }
      }
    } catch {}
    s.publicState.isConnected = false;
    s.publicState.devicePort = null;
    s.publicState.micLevel = 0;
    s.publicState.isSpeaking = false;
    notifyStateChange(s);
    await new Promise((r) => setTimeout(r, 200));
    await this.connect();
  },

  async setBaudRate(newBaud: number): Promise<void> {
    const s = getSingleton();
    const wasConnected = s.publicState.isConnected;
    s.publicState.baudRate = newBaud;
    notifyStateChange(s);
    if (wasConnected) {
      await this.disconnect();
      await new Promise((r) => setTimeout(r, 150));
      await this.connect(newBaud);
    }
  },

  async sendCommand(command: string): Promise<boolean> {
    const s = getSingleton();
    const port = s.port;
    if (!port || !port.writable || !s.publicState.isConnected) {
      return false;
    }
    let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    try {
      const payload = command.endsWith('\n') ? command : `${command}\n`;
      const encoder = new TextEncoder();
      const activeWriter = port.writable.getWriter();
      if (!activeWriter) return false;
      writer = activeWriter;
      await activeWriter.write(encoder.encode(payload));
      return true;
    } catch (err) {
      console.warn('[ESP32Serial] sendCommand failed:', err);
      return false;
    } finally {
      if (writer) {
        try {
          writer?.releaseLock();
        } catch {}
      }
    }
  },
};

