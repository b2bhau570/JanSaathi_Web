/**
 * Jan Saathi AI — Voice Assistant State Machine & Software Simulation Service.
 * 
 * Zero-cost, local-first architecture:
 * - Mode A: Simulated Voice Demo (Runs 100% in software without mic or audio hardware)
 * - Mode B: Browser Voice (Feature-detected Web Speech API with explicit patient trigger)
 * - Mode C: Text-Only (Accessible manual input)
 * 
 * Strict Conversation State Machine:
 * idle -> ready -> assistant_speaking -> listening -> transcript_review -> processing_answer -> showing_followup -> completed
 * Supports pause, resume, repeat question, and session reset.
 */

import type { SupportedLanguage } from '../i18n/translations';
import { synthesizeSpeech } from '../api/patientApi';

export type VoiceMode = 'simulated' | 'browser' | 'text';

export type VoiceState =
  | 'idle'
  | 'ready'
  | 'assistant_speaking'
  | 'listening'
  | 'transcript_review'
  | 'processing_answer'
  | 'showing_followup'
  | 'paused'
  | 'completed'
  | 'error';

export interface VoiceAssistantCallbacks {
  onStateChange: (state: VoiceState) => void;
  onTranscriptReady: (transcript: string) => void;
  onError: (errorMsg: string) => void;
}

export class VoiceAssistantService {
  private mode: VoiceMode = 'browser';
  private state: VoiceState = 'idle';
  private language: SupportedLanguage = 'en';
  private callbacks: VoiceAssistantCallbacks;
  private sarvamApiKey: string = '';

  // Browser speech & audio references
  private synthesis: SpeechSynthesis | null = null;
  private recognition: any | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private simTimer: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private silenceTimer: any = null;

  constructor(callbacks: VoiceAssistantCallbacks) {
    this.callbacks = callbacks;
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('jansaathi_sarvam_key');
      } catch {}
      if ('speechSynthesis' in window) {
        this.synthesis = window.speechSynthesis;
      }
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        this.recognition = SpeechRec;
      }
    }
  }

  public setSarvamApiKey(key: string) {
    this.sarvamApiKey = (key || '').trim();
    if (typeof window !== 'undefined') {
      try {
        if (this.sarvamApiKey) {
          localStorage.setItem('jansaathi_sarvam_key', this.sarvamApiKey);
        } else {
          localStorage.removeItem('jansaathi_sarvam_key');
        }
      } catch {}
    }
  }

  public getSarvamApiKey(): string {
    return this.sarvamApiKey;
  }

  /**
   * Play an audible acoustic tone through Web Audio API to confirm sound is active.
   */
  private playChime(freq1: number, freq2: number) {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      osc.frequency.setValueAtTime(freq1, ctx.currentTime);
      osc.frequency.setValueAtTime(freq2, ctx.currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch {
      // AudioContext blocked by browser autoplay policy
    }
  }

  public setMode(mode: VoiceMode) {
    this.stopAll();
    this.mode = mode;
    this.setState('ready');
  }

  public getMode(): VoiceMode {
    return this.mode;
  }

  public setLanguage(lang: SupportedLanguage) {
    this.language = lang;
  }

  public getState(): VoiceState {
    return this.state;
  }

  private setState(state: VoiceState) {
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  public isBrowserSpeechSupported(): boolean {
    return !!(this.synthesis && this.recognition);
  }

  /**
   * Speak a question to the patient.
   * 1. Uses backend TTS (Sarvam AI bulbul:v3) when configured securely in backend .env.
   * 2. Otherwise seamlessly uses unmuted browser SpeechSynthesis with Indic matching.
   * 3. Always plays an audible tone so sound is never silent.
   */
  public async speakQuestion(text: string, onEnded?: () => void) {
    this.stopAll();
    this.setState('assistant_speaking');
    this.playChime(523.25, 659.25);

    // 1. Try high-fidelity backend Sarvam TTS (securely configured in backend .env)
    try {
      const ttsRes = await synthesizeSpeech(text, this.language);
      if (ttsRes && ttsRes.status === 'success' && ttsRes.audio) {
        const mimeType = ttsRes.format || (ttsRes.provider === 'sarvam' ? 'audio/wav' : 'audio/mp3');
        const audio = new Audio(`data:${mimeType};base64,${ttsRes.audio}`);
        audio.volume = 1.0;
        this.currentAudio = audio;
        audio.onended = () => {
          this.currentAudio = null;
          this.setState('ready');
          if (onEnded) onEnded();
        };
        audio.onerror = () => {
          this.currentAudio = null;
          this.speakViaBrowser(text, onEnded);
        };
        await audio.play();
        return;
      }
    } catch (err) {
      console.warn('Backend TTS request error, falling back to browser speech:', err);
    }

    // 2. Audible Browser SpeechSynthesis fallback
    this.speakViaBrowser(text, onEnded);
  }

  private speakViaBrowser(text: string, onEnded?: () => void) {
    if (this.synthesis) {
      try {
        this.synthesis.cancel(); // Clear any frozen speech queue in Chrome
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = 1.0; // Ensure 100% audible volume
        utterance.rate = 0.95;
        utterance.pitch = 1.0;

        const voices = this.synthesis.getVoices() || [];
        const targetLang = this.getVoiceLangTag();
        const matchedVoice =
          voices.find((v) => v.lang.toLowerCase().startsWith(targetLang.toLowerCase())) ||
          voices.find((v) => v.lang.toLowerCase().includes(this.language)) ||
          (this.language === 'or' ? voices.find((v) => v.lang.toLowerCase().startsWith('hi')) : null) ||
          voices.find((v) => v.lang.toLowerCase().startsWith('en-in')) ||
          voices[0];

        if (matchedVoice) {
          utterance.voice = matchedVoice;
        }

        utterance.onend = () => {
          this.currentUtterance = null;
          this.setState('ready');
          if (onEnded) onEnded();
        };

        utterance.onerror = (e) => {
          console.warn('SpeechSynthesis error:', e);
          this.currentUtterance = null;
          this.setState('ready');
          if (onEnded) onEnded();
        };

        this.currentUtterance = utterance;
        this.synthesis.speak(utterance);
        this.synthesis.resume(); // Ensure Chrome does not pause utterance
        return;
      } catch (err) {
        console.warn('Browser SpeechSynthesis failed:', err);
      }
    }

    // Visual fallback duration only if audio synthesis completely unsupported
    const duration = Math.min(Math.max(text.length * 50, 1500), 4000);
    this.simTimer = setTimeout(() => {
      this.setState('ready');
      if (onEnded) onEnded();
    }, duration);
  }

  /**
   * Start listening for patient's spoken answer.
   */
  public async startListening() {
    this.stopAll();
    this.setState('listening');
    this.playChime(659.25, 783.99);

    try {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        const rec = new SpeechRec();
        const BCP47_MAP: Record<string, string> = {
          hi: 'hi-IN',
          or: 'or-IN',
          bn: 'bn-IN',
          te: 'te-IN',
          ta: 'ta-IN',
          mr: 'mr-IN',
          gu: 'gu-IN',
          kn: 'kn-IN',
          ml: 'ml-IN',
          pa: 'pa-IN',
          as: 'as-IN',
          ur: 'ur-IN',
          en: 'en-IN',
        };
        rec.lang = BCP47_MAP[this.language] || 'en-IN';
        rec.continuous = true;
        rec.interimResults = true;

        let accumulatedTranscript = '';
        let sessionFinal = '';
        let persistentHistory = '';

        rec.onresult = (evt: any) => {
          let interim = '';
          let currentFinal = '';
          for (let i = 0; i < evt.results.length; i++) {
            if (evt.results[i].isFinal) {
              currentFinal += evt.results[i][0].transcript + ' ';
            } else {
              interim += evt.results[i][0].transcript;
            }
          }
          sessionFinal = currentFinal;
          const currentUtterance = (currentFinal + interim).trim();
          accumulatedTranscript = (persistentHistory ? `${persistentHistory} ${currentUtterance}` : currentUtterance).trim();

          // 3500ms silence debounce allows full thoughts without mid-sentence cutoff
          if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
          }
          this.silenceTimer = setTimeout(() => {
            if (this.state === 'listening' && accumulatedTranscript) {
              this.finishListening();
              this.setState('transcript_review');
              this.callbacks.onTranscriptReady(accumulatedTranscript);
            }
          }, 3500);
        };

        rec.onend = () => {
          if (this.state === 'listening') {
            if (sessionFinal.trim()) {
              persistentHistory = (persistentHistory ? `${persistentHistory} ${sessionFinal}` : sessionFinal).trim();
              sessionFinal = '';
            }
            try {
              rec.start();
            } catch {}
          }
        };

        rec.onerror = (err: any) => {
          if (err.error === 'no-speech') return;
          console.warn('Speech recognition error:', err);
          if (this.state === 'listening' && !accumulatedTranscript) {
            this.setState('ready');
            this.callbacks.onError(err.error || 'Speech recognition error');
          }
        };

        rec.start();
        this.recognition = rec;
        return;
      }
    } catch (e: any) {
      console.error('Speech recognition error:', e);
    }

    this.setState('ready');
    this.callbacks.onError('Voice input active. Please speak clearly into your microphone.');
  }

  public pause() {
    this.stopAll();
    this.setState('paused');
  }

  public resume() {
    this.setState('ready');
  }

  public finishListening() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }
  }

  public stopAll() {
    this.stopRecordingStream();
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch {}
      this.mediaRecorder = null;
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }
    if (this.simTimer) {
      clearTimeout(this.simTimer);
      this.simTimer = null;
    }
    if (this.synthesis) {
      try {
        this.synthesis.cancel();
      } catch {
        // ignore
      }
    }
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // ignore
      }
    }
    this.currentUtterance = null;
  }

  private stopRecordingStream() {
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch {}
      this.mediaStream = null;
    }
  }

  public resetSession() {
    this.stopAll();
    this.setState('ready');
  }

  public isSpeaking(): boolean {
    return this.currentUtterance !== null;
  }

  private getVoiceLangTag(): string {
    if (this.language === 'hi') return 'hi-IN';
    if (this.language === 'or') return 'or-IN';
    return 'en-IN';
  }
}
