import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Heart,
  Thermometer,
  Wind,
  Gauge,
  Usb,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Power,
  Mic,
} from 'lucide-react';
import { esp32SerialService } from '../../services/esp32SerialService';

export interface TelemetryData {
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

declare global {
  interface Window {
    __JANSAATHI_ESP32_PORT__?: any;
    __JANSAATHI_ESP32_READER__?: any;
  }
}

interface Esp32HardwareMonitorProps {
  publicCaseId?: string;
  caseAccessToken?: string;
  onTelemetryUpdate?: (data: TelemetryData) => void;
  showSaveButton?: boolean;
  onSaveToCase?: (data: TelemetryData) => Promise<void>;
  compact?: boolean;
  onConnectionChange?: (connected: boolean) => void;
  onMicLevelUpdate?: (level: number, speaking: boolean) => void;
  onHardwareAudioChunk?: (b64Pcm: string, isSpeaking: boolean) => void;
}

export interface Esp32HardwareMonitorRef {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  isConnected: boolean;
}

export const Esp32HardwareMonitor = React.forwardRef<Esp32HardwareMonitorRef, Esp32HardwareMonitorProps>(({
  publicCaseId,
  caseAccessToken,
  onTelemetryUpdate,
  showSaveButton = false,
  onSaveToCase,
  compact = false,
  onConnectionChange,
  onMicLevelUpdate,
  onHardwareAudioChunk,
}, ref) => {
  const initialSerialState = esp32SerialService.getState();
  const [isUsbConnected, setIsUsbConnected] = useState<boolean>(initialSerialState.isConnected);
  const [devicePort, setDevicePort] = useState<string | null>(initialSerialState.devicePort);
  const [isConnecting, setIsConnecting] = useState<boolean>(initialSerialState.isConnecting);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialSerialState.errorMsg);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [baudRate, setBaudRate] = useState<number>(initialSerialState.baudRate);
  const [micLevel, setMicLevel] = useState<number>(initialSerialState.micLevel);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(initialSerialState.isSpeaking);
  const [isExpanded, setIsExpanded] = useState<boolean>(!compact);
  const [prevCompact, setPrevCompact] = useState<boolean>(compact);

  // Sync expanded state when compact prop updates (e.g. step changes)
  if (prevCompact !== compact) {
    setPrevCompact(compact);
    setIsExpanded(!compact);
  }

  // Active physiological state (driven by persistent ESP32 serial singleton across routes)
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    ...initialSerialState.telemetry,
    device: initialSerialState.isConnected ? initialSerialState.telemetry.device : 'ESP32-S3 (Disconnected)',
    signal_quality: initialSerialState.isConnected ? initialSerialState.telemetry.signal_quality : 'disconnected',
    last_updated: initialSerialState.telemetry.last_updated || (initialSerialState.isConnected ? 'Live' : 'Not Connected'),
  });

  // Canvas ECG References
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorXRef = useRef<number>(0);
  const prevYRef = useRef<number | null>(null);
  const lastValidSampleRef = useRef<number>(512);
  const animFrameRef = useRef<number | null>(null);
  const ecgQueueRef = useRef<number[]>([]);

  // Fresh callback refs to eliminate stale closure issues in long-running serial singleton
  const onHardwareAudioChunkRef = useRef(onHardwareAudioChunk);
  const onMicLevelUpdateRef = useRef(onMicLevelUpdate);
  const onTelemetryUpdateRef = useRef(onTelemetryUpdate);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onHardwareAudioChunkRef.current = onHardwareAudioChunk;
    onMicLevelUpdateRef.current = onMicLevelUpdate;
    onTelemetryUpdateRef.current = onTelemetryUpdate;
    onConnectionChangeRef.current = onConnectionChange;
  });

  // Check Web Serial support
  const hasWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;

  // Sync to parent callback
  useEffect(() => {
    onTelemetryUpdateRef.current?.(telemetry);
  }, [telemetry]);

  const handleConnectSerial = async () => {
    await esp32SerialService.connect(baudRate);
  };

  const handleDisconnectSerial = async () => {
    await esp32SerialService.disconnect();
  };

  const handleForceResetPort = async () => {
    await esp32SerialService.forceReset();
  };

  const handleBaudRateChange = async (newBaud: number) => {
    setBaudRate(newBaud);
    await esp32SerialService.setBaudRate(newBaud);
  };

  // Expose methods to parent components via ref
  React.useImperativeHandle(ref, () => ({
    connect: handleConnectSerial,
    disconnect: handleDisconnectSerial,
    isConnected: isUsbConnected,
  }));

  // Subscribe to persistent ESP32 Web Serial singleton (survives StrictMode & SPA route transitions)
  useEffect(() => {
    if (!hasWebSerial) return;

    const unsubscribe = esp32SerialService.subscribe({
      onStateChange: (state) => {
        setIsUsbConnected(state.isConnected);
        setIsConnecting(state.isConnecting);
        setDevicePort(state.devicePort);
        setErrorMsg(state.errorMsg);
        setBaudRate(state.baudRate);
        setMicLevel(state.micLevel);
        setIsSpeaking(state.isSpeaking);
        setTelemetry({
          ...state.telemetry,
          device: state.isConnected ? state.telemetry.device : 'ESP32-S3 (Disconnected)',
          signal_quality: state.isConnected ? state.telemetry.signal_quality : 'disconnected',
          last_updated: state.telemetry.last_updated || (state.isConnected ? 'Live' : 'Not Connected'),
        });
        onConnectionChangeRef.current?.(state.isConnected);
      },
      onTelemetry: (t) => {
        setTelemetry(t);
      },
      onMicLevel: (lvl, spk) => {
        setMicLevel(lvl);
        setIsSpeaking(spk);
        onMicLevelUpdateRef.current?.(lvl, spk);
      },
      onAudioPcm: (b64Pcm, spk) => {
        onHardwareAudioChunkRef.current?.(b64Pcm, spk);
      },
      onEcgSample: (val) => {
        ecgQueueRef.current.push(val);
        if (ecgQueueRef.current.length > 300) {
          ecgQueueRef.current.shift();
        }
      },
    });

    void esp32SerialService.tryAutoConnect();

    return () => {
      // Unsubscribes only this UI view; background USB port & reader stay open across pages!
      unsubscribe();
    };
  }, [hasWebSerial]);

  const isUsbConnectedRef = useRef<boolean>(isUsbConnected);
  useEffect(() => {
    isUsbConnectedRef.current = isUsbConnected;
  }, [isUsbConnected]);

  // Continuous Lead-II Canvas Sweep Loop (60 FPS)
  useEffect(() => {
    const drawEcg = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const connected = isUsbConnectedRef.current;
      const width = canvas.width;
      const height = canvas.height;

      // Grid Renderer
      const renderGrid = () => {
        ctx.fillStyle = '#020b05';
        ctx.fillRect(0, 0, width, height);

        // Fine grid
        ctx.strokeStyle = 'rgba(0, 255, 100, 0.08)';
        ctx.lineWidth = 1;
        for (let x = 0; x < width; x += 10) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y < height; y += 10) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }

        // Major grid (50px)
        ctx.strokeStyle = 'rgba(0, 255, 100, 0.18)';
        ctx.lineWidth = 1.2;
        for (let x = 0; x < width; x += 50) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y < height; y += 50) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
      };

      if (cursorXRef.current === 0) {
        renderGrid();
        prevYRef.current = null;
      }

      // Hold last valid 50 Hz sample smoothly between serial frames when connected; flat baseline 512 when disconnected
      let rawSample: number;
      if (connected && ecgQueueRef.current.length > 0) {
        rawSample = ecgQueueRef.current.shift()!;
        lastValidSampleRef.current = rawSample;
      } else if (connected) {
        rawSample = lastValidSampleRef.current;
      } else {
        rawSample = 512;
        lastValidSampleRef.current = 512;
      }

      // Map 0-1023 to canvas height
      const normalized = (rawSample - 512) / 512;
      const y = height / 2 - normalized * (height * 0.42);
      const nextX = cursorXRef.current + 2;
      const startY = prevYRef.current !== null ? prevYRef.current : y;

      // Clear sweep bar ahead
      ctx.fillStyle = '#16130f';
      ctx.fillRect(nextX, 0, 16, height);

      // Redraw fine grid on clear sweep bar
      ctx.strokeStyle = 'rgba(250, 246, 239, 0.08)';
      ctx.lineWidth = 1;
      for (let gx = Math.floor(nextX / 10) * 10; gx <= nextX + 16; gx += 10) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, height);
        ctx.stroke();
      }

      // Draw high-precision continuous hot-magenta ECG segment
      ctx.strokeStyle = connected ? '#d6246e' : 'rgba(214, 36, 110, 0.3)';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = connected ? 'rgba(214, 36, 110, 0.45)' : 'transparent';
      ctx.shadowBlur = connected ? 3 : 0;
      ctx.beginPath();
      ctx.moveTo(cursorXRef.current, startY);
      ctx.lineTo(nextX, y);
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (nextX >= width) {
        cursorXRef.current = 0;
        prevYRef.current = null;
      } else {
        cursorXRef.current = nextX;
        prevYRef.current = y;
      }
      animFrameRef.current = requestAnimationFrame(drawEcg);
    };

    animFrameRef.current = requestAnimationFrame(drawEcg);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Serial port & reader ownership now live in esp32SerialService singleton across SPA routes.

  // Save to case action
  const handleSave = async () => {
    if (!publicCaseId && !onSaveToCase) return;
    setIsSaving(true);
    try {
      if (onSaveToCase) {
        await onSaveToCase(telemetry);
      } else if (publicCaseId) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const docToken = localStorage.getItem('doctor_token');
        if (docToken) headers['Authorization'] = `Bearer ${docToken}`;
        if (caseAccessToken) headers['X-Case-Access-Token'] = caseAccessToken;
        const res = await fetch(`/api/v1/hardware/cases/${publicCaseId}/measurements`, {
          method: 'POST',
          headers,
          body: JSON.stringify(telemetry),
        });
        if (!res.ok) throw new Error('Failed to save measurements');
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-creamdeep border border-ink/10 rounded-2xl overflow-hidden shadow-sm text-ink font-sans transition-all">
      {/* ── Top Header / Device Status ── */}
      <div className="bg-cream/70 border-b border-ink/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-ink text-cream flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-magenta" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif opsz-72 font-semibold text-sm text-ink">
                ESP32-S3 Medical Kiosk & Telemetry
              </h3>
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1.5 ${
                isUsbConnected
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isUsbConnected ? 'bg-emerald-600 animate-pulse' : 'bg-rose-500'}`} />
                {isUsbConnected ? `USB LIVE: ${devicePort || 'CONNECTED'}` : 'ESP32 DISCONNECTED'}
              </span>
            </div>
            <p className="text-[11px] text-inkmute mt-0.5 font-sans">
              Hardware: <strong className="font-mono text-ink">ESP32-S3</strong> • INMP441 MEMS Mic & Real-time Physiological Stream
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {showSaveButton && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="pill pill-magenta px-3 py-1.5 text-xs font-semibold"
            >
              {saveSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Saved to Case!</span>
                </>
              ) : (
                <>
                  <Activity className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Saving...' : 'Save Readings'}</span>
                </>
              )}
            </button>
          )}

          {!isUsbConnected ? (
            <div className="flex items-center gap-1.5">
              <select
                value={baudRate}
                onChange={(e) => handleBaudRateChange(Number(e.target.value))}
                className="bg-cream text-[11px] text-ink border border-ink/14 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-magenta"
                title="Baud Rate"
              >
                <option value={921600}>921600 (S3 Voice & Vitals)</option>
                <option value={115200}>115200 (Standard)</option>
              </select>

              <button
                type="button"
                onClick={handleConnectSerial}
                disabled={isConnecting}
                className="pill pill-ink px-3.5 py-1.5 text-xs font-semibold"
              >
                {isConnecting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Usb className="w-3.5 h-3.5" />
                )}
                <span>Connect ESP32 USB</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleDisconnectSerial}
              className="pill pill-secondary px-3 py-1.5 text-xs font-medium text-magentadeep border-magenta/30 hover:border-magenta"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Disconnect USB</span>
            </button>
          )}

          {/* Toggle Expand / Collapse Scope */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="pill pill-secondary px-3 py-1.5 text-xs font-medium"
            title={isExpanded ? 'Collapse telemetry scope' : 'Expand full telemetry scope'}
          >
            <span>{isExpanded ? 'Hide Scope ▲' : 'Show Scope ▼'}</span>
          </button>
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="bg-magenta/10 border-b border-magenta/25 text-magentadeep text-xs px-4 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-magenta shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={handleForceResetPort}
            className="px-2.5 py-1 rounded-full bg-magenta text-cream text-[11px] font-semibold transition-colors cursor-pointer"
          >
            Reset Port
          </button>
        </div>
      )}

      {/* ── Summary Bar when Collapsed ── */}
      {!isExpanded && (
        <div className="px-4 py-2.5 flex items-center justify-between text-xs text-ink bg-cream/30 flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 font-medium">
              <Heart className={`w-3.5 h-3.5 ${isUsbConnected ? 'text-magenta animate-pulse' : 'text-inkmute/40'}`} />
              <span>HR: <strong className="font-mono text-ink">{isUsbConnected && telemetry.heart_rate > 0 ? telemetry.heart_rate : '--'}</strong> BPM</span>
            </span>
            <span className="text-inkmute/30">•</span>
            <span className="flex items-center gap-1.5 font-medium">
              <Wind className={`w-3.5 h-3.5 ${isUsbConnected ? 'text-inkmute' : 'text-inkmute/40'}`} />
              <span>SpO2: <strong className="font-mono text-ink">{isUsbConnected && telemetry.spo2 > 0 ? `${telemetry.spo2}%` : '--%'}</strong></span>
            </span>
            <span className="text-inkmute/30">•</span>
            <span className="flex items-center gap-1.5 font-medium">
              <Thermometer className={`w-3.5 h-3.5 ${isUsbConnected ? 'text-inkmute' : 'text-inkmute/40'}`} />
              <span>Temp: <strong className="font-mono text-ink">{isUsbConnected && telemetry.temperature > 0 ? `${telemetry.temperature}°F` : '--°F'}</strong></span>
            </span>
            <span className="text-inkmute/30">•</span>
            <span className="flex items-center gap-1.5 font-medium">
              <Gauge className={`w-3.5 h-3.5 ${isUsbConnected ? 'text-inkmute' : 'text-inkmute/40'}`} />
              <span>BP: <strong className="font-mono text-ink">{isUsbConnected && telemetry.blood_pressure_systolic > 0 ? `${telemetry.blood_pressure_systolic}/${telemetry.blood_pressure_diastolic}` : '--/--'}</strong></span>
            </span>
            <span className="text-inkmute/30">•</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              isUsbConnected ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
            }`}>
              {isUsbConnected ? 'Live Telemetry' : 'Hardware Disconnected'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="text-[11px] text-magenta font-semibold hover:underline"
          >
            View Live ECG & Mic →
          </button>
        </div>
      )}

      {/* ── Main Vital Signs & Live ECG (Shown when Expanded) ── */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Vital Signs Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Heart Rate */}
            <div className="bg-cream border border-ink/10 rounded-xl p-3.5 relative overflow-hidden">
              <div className="flex items-center justify-between text-inkmute text-xs mb-1">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Heart Rate</span>
                <Heart className={`w-4 h-4 ${isUsbConnected ? 'text-magenta animate-pulse' : 'text-inkmute/40'}`} />
              </div>
              <div className="text-2xl font-serif opsz-72 font-semibold text-magenta">
                {isUsbConnected && telemetry.heart_rate > 0 ? (
                  <>
                    {telemetry.heart_rate} <span className="text-xs font-sans font-normal text-inkmute">BPM</span>
                  </>
                ) : (
                  <span className="text-inkmute/40">-- <span className="text-xs font-sans font-normal text-inkmute">BPM</span></span>
                )}
              </div>
              <div className="text-[10px] text-inkmute mt-1 flex items-center justify-between">
                <span>
                  {!isUsbConnected
                    ? 'Sensor Offline'
                    : telemetry.heart_rate > 0
                      ? 'Pulse Active'
                      : 'Finger/Probe Not Detected'}
                </span>
                <span className={isUsbConnected && telemetry.heart_rate > 0 ? 'text-magenta font-semibold' : 'text-inkmute/60 font-semibold'}>
                  {!isUsbConnected ? '○ Disconnected' : telemetry.heart_rate > 0 ? '● Live' : '○ Awaiting Finger'}
                </span>
              </div>
            </div>

            {/* SpO2 */}
            <div className="bg-cream border border-ink/10 rounded-xl p-3.5 relative overflow-hidden">
              <div className="flex items-center justify-between text-inkmute text-xs mb-1">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Blood Oxygen</span>
                <Wind className={`w-4 h-4 ${isUsbConnected && telemetry.spo2 > 0 ? 'text-inkmute' : 'text-inkmute/40'}`} />
              </div>
              <div className="text-2xl font-serif opsz-72 font-semibold text-ink">
                {isUsbConnected && telemetry.spo2 > 0 ? (
                  <>
                    {telemetry.spo2} <span className="text-xs font-sans font-normal text-inkmute">%</span>
                  </>
                ) : (
                  <span className="text-inkmute/40">-- <span className="text-xs font-sans font-normal text-inkmute">%</span></span>
                )}
              </div>
              <div className="text-[10px] text-inkmute mt-1 flex items-center justify-between">
                <span>
                  {!isUsbConnected
                    ? 'Sensor Offline'
                    : telemetry.spo2 > 0
                      ? 'SpO2 Pulse Ox'
                      : 'Finger/Probe Not Detected'}
                </span>
                <span className={isUsbConnected && telemetry.spo2 > 0 ? 'text-ink font-semibold' : 'text-inkmute/60 font-semibold'}>
                  {!isUsbConnected
                    ? '○ Disconnected'
                    : telemetry.spo2 > 0
                      ? telemetry.spo2 < 94 ? '⚠ Low SpO2' : '● Live'
                      : '○ No Finger'}
                </span>
              </div>
            </div>

            {/* Temperature */}
            <div className="bg-cream border border-ink/10 rounded-xl p-3.5 relative overflow-hidden">
              <div className="flex items-center justify-between text-inkmute text-xs mb-1">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Body Temp</span>
                <Thermometer className={`w-4 h-4 ${isUsbConnected && telemetry.temperature > 0 ? 'text-inkmute' : 'text-inkmute/40'}`} />
              </div>
              <div className="text-2xl font-serif opsz-72 font-semibold text-ink">
                {isUsbConnected && telemetry.temperature > 0 ? (
                  <>
                    {telemetry.temperature} <span className="text-xs font-sans font-normal text-inkmute">°F</span>
                  </>
                ) : (
                  <span className="text-inkmute/40">-- <span className="text-xs font-sans font-normal text-inkmute">°F</span></span>
                )}
              </div>
              <div className="text-[10px] text-inkmute mt-1 flex items-center justify-between">
                <span>
                  {!isUsbConnected
                    ? 'Sensor Offline'
                    : telemetry.temperature > 0
                      ? 'DS18B20 Probe'
                      : 'Finger/Probe Not Detected'}
                </span>
                <span className="text-inkmute">
                  {isUsbConnected && telemetry.temperature > 0 ? `${((telemetry.temperature - 32) * 5 / 9).toFixed(1)} °C` : '-- °C'}
                </span>
              </div>
            </div>

            {/* Blood Pressure */}
            <div className="bg-cream border border-ink/10 rounded-xl p-3.5 relative overflow-hidden">
              <div className="flex items-center justify-between text-inkmute text-xs mb-1">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Blood Pressure</span>
                <Gauge className={`w-4 h-4 ${isUsbConnected && telemetry.blood_pressure_systolic > 0 ? 'text-inkmute' : 'text-inkmute/40'}`} />
              </div>
              <div className="text-xl font-serif opsz-72 font-semibold text-ink">
                {isUsbConnected && telemetry.blood_pressure_systolic > 0 ? (
                  <>
                    {telemetry.blood_pressure_systolic}/{telemetry.blood_pressure_diastolic}{' '}
                    <span className="text-xs font-sans font-normal text-inkmute">mmHg</span>
                  </>
                ) : (
                  <span className="text-inkmute/40">--/-- <span className="text-xs font-sans font-normal text-inkmute">mmHg</span></span>
                )}
              </div>
              <div className="text-[10px] text-inkmute mt-1 flex items-center justify-between">
                <span>
                  {!isUsbConnected
                    ? 'Sensor Offline'
                    : telemetry.blood_pressure_systolic > 0
                      ? 'Cuff / Oscillometric'
                      : 'Finger/Probe Not Detected'}
                </span>
                <span className={isUsbConnected && telemetry.blood_pressure_systolic > 0 ? 'text-ink font-semibold' : 'text-inkmute/60 font-semibold'}>
                  {!isUsbConnected ? '○ Disconnected' : telemetry.blood_pressure_systolic > 0 ? '● Measured' : '○ Awaiting Cuff'}
                </span>
              </div>
            </div>
          </div>

          {/* ── INMP441 MEMS Microphone Level Meter ── */}
          <div className="bg-cream border border-ink/10 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl transition-colors ${
                isUsbConnected && isSpeaking ? 'bg-magenta text-cream animate-pulse' : 'bg-ink/6 text-inkmute'
              }`}>
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-ink">INMP441 MEMS Hardware Microphone</span>
                  {isUsbConnected ? (
                    isSpeaking ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-magenta/15 text-magentadeep border border-magenta/25 animate-pulse">
                        VOICE DETECTED
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full text-inkmute bg-ink/6">
                        Awaiting Speech...
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full text-rose-700 bg-rose-50 border border-rose-200 font-semibold">
                      DISCONNECTED
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-inkmute">
                  {isUsbConnected
                    ? '16 kHz 24-bit I2S Digital Stream from ESP32-S3 Kiosk'
                    : 'Connect ESP32 USB to enable hardware microphone stream'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-xs">
              <div className="w-full bg-creamdeep rounded-full h-2 overflow-hidden border border-ink/10">
                <div
                  className={`h-full transition-all duration-100 rounded-full ${
                    !isUsbConnected ? 'bg-transparent' :
                    micLevel > 60 ? 'bg-magenta' : micLevel > 12 ? 'bg-magenta/80' : 'bg-ink/20'
                  }`}
                  style={{ width: `${isUsbConnected ? Math.max(4, micLevel) : 0}%` }}
                />
              </div>
              <span className="text-[11px] font-mono text-inkmute w-10 text-right">{isUsbConnected ? `${micLevel}%` : '--'}</span>
            </div>
          </div>

          {/* ── Live ECG Lead-II Canvas Strip (Refined Ink/Magenta Scope) ── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-inkmute px-1">
              <div className="flex items-center gap-1.5">
                <Activity className={`w-3.5 h-3.5 ${isUsbConnected ? 'text-magenta animate-pulse' : 'text-inkmute/40'}`} />
                <span className="font-semibold text-ink">
                  LEAD II CARDIAC RHYTHM MONITOR
                </span>
                <span className="text-inkmute/40">•</span>
                <span className="font-mono text-[10px] text-inkmute">
                  {isUsbConnected ? '25 mm/s | 10 mm/mV | Continuous Stream' : 'Offline | Connect ESP32 USB'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  isUsbConnected ? 'bg-magenta/15 text-magentadeep' : 'bg-ink/10 text-inkmute'
                }`}>
                  {isUsbConnected ? 'QRS DETECTED' : 'DISCONNECTED'}
                </span>
                <span className="text-inkmute font-mono text-[10px]">
                  {isUsbConnected ? telemetry.last_updated : 'Not Connected'}
                </span>
              </div>
            </div>

            {/* Canvas Screen */}
            <div className="rounded-xl overflow-hidden border border-ink/15 shadow-inner bg-ink">
              <canvas
                ref={canvasRef}
                width={700}
                height={125}
                className="w-full h-28 sm:h-32 block"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
