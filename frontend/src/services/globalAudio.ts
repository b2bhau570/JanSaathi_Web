/**
 * Jan Saathi AI — Global Audio & Speech Manager
 * Completely eliminates audio overlapping and background mic recording
 * across navigation, back buttons, and language switches.
 */

let activeAudioElement: HTMLAudioElement | null = null;
let currentAudioSessionId = 0;
let isCleaningUp = false;

type VoiceCleanupFn = () => void;
const voiceCleanupCallbacks = new Set<VoiceCleanupFn>();
const activeMediaStreams = new Set<MediaStream>();
const activeAudioContexts = new Set<AudioContext>();
const activeSpeechRecognitions = new Set<any>();

export function registerVoiceCleanup(fn: VoiceCleanupFn): () => void {
  voiceCleanupCallbacks.add(fn);
  return () => {
    voiceCleanupCallbacks.delete(fn);
  };
}

export function registerActiveStream(stream: MediaStream): () => void {
  activeMediaStreams.add(stream);
  return () => {
    activeMediaStreams.delete(stream);
  };
}

export function registerActiveAudioContext(ctx: AudioContext): () => void {
  activeAudioContexts.add(ctx);
  return () => {
    activeAudioContexts.delete(ctx);
  };
}

export function registerActiveSpeechRecognition(rec: any): () => void {
  activeSpeechRecognitions.add(rec);
  return () => {
    activeSpeechRecognitions.delete(rec);
  };
}

export function stopGlobalAudio(): void {
  if (isCleaningUp) return;
  isCleaningUp = true;
  try {
    // Advance session ID to instantly invalidate all in-flight asynchronous TTS requests
    currentAudioSessionId++;

    // Execute all registered page/component voice teardown handlers
    voiceCleanupCallbacks.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn('Voice cleanup callback error:', err);
      }
    });

    // Stop active HTML5 Audio Element
    if (activeAudioElement) {
      try {
        activeAudioElement.pause();
        activeAudioElement.currentTime = 0;
        activeAudioElement.src = '';
      } catch {}
      activeAudioElement = null;
    }

    // Force stop all registered media stream tracks (turns off microphone indicator in browser)
    activeMediaStreams.forEach((stream) => {
      try {
        stream.getTracks().forEach((track) => track.stop());
      } catch {}
    });
    activeMediaStreams.clear();

    // Close all registered AudioContexts
    activeAudioContexts.forEach((ctx) => {
      try {
        if (ctx.state !== 'closed') {
          ctx.close().catch(() => {});
        }
      } catch {}
    });
    activeAudioContexts.clear();

    // Abort all registered SpeechRecognition instances
    activeSpeechRecognitions.forEach((rec) => {
      try {
        rec.abort();
      } catch {}
      try {
        rec.stop();
      } catch {}
    });
    activeSpeechRecognitions.clear();

    // Stop browser SpeechSynthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  } finally {
    isCleaningUp = false;
  }
}

export function registerActiveAudio(audio: HTMLAudioElement): void {
  if (activeAudioElement && activeAudioElement !== audio) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
      activeAudioElement.src = '';
    } catch {}
  }
  activeAudioElement = audio;
}

export function getAudioSessionId(): number {
  return currentAudioSessionId;
}

export function isSessionActive(sessionId: number): boolean {
  return sessionId === currentAudioSessionId;
}

let sharedAudioEl: HTMLAudioElement | null = null;
let sharedAnnouncementPlaying = false;

export function getSharedAudio(): HTMLAudioElement | null {
  return sharedAudioEl;
}

export function getOrCreateSharedAudio(): HTMLAudioElement {
  if (!sharedAudioEl) {
    sharedAudioEl = new Audio();
  }
  return sharedAudioEl;
}

export function setSharedAnnouncementPlaying(playing: boolean): void {
  sharedAnnouncementPlaying = playing;
}

export function isSharedAnnouncementPlaying(): boolean {
  return sharedAnnouncementPlaying;
}
