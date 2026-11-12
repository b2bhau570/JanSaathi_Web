import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  Mic,
  RotateCcw,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useLanguage } from '../../contexts/useLanguage';
import { synthesizeSpeech } from '../../api/patientApi';
import {
  registerActiveAudio,
  registerActiveStream,
  registerActiveAudioContext,
  registerActiveSpeechRecognition,
  registerVoiceCleanup,
} from '../../services/globalAudio';

interface VoiceAssistantWidgetProps {
  currentQuestion: string;
  questionIndex: number;
  totalQuestions: number;
  onAnswerConfirmed: (answer: string) => void;
  autoStart?: boolean;
}

export const VoiceAssistantWidget: React.FC<VoiceAssistantWidgetProps> = ({
  currentQuestion,
  questionIndex,
  totalQuestions,
  onAnswerConfirmed,
}) => {
  const { language } = useLanguage();

  const [voiceState, setVoiceState] = useState<'idle' | 'speaking' | 'listening' | 'reviewing' | 'processing'>('idle');
  const [draftTranscript, setDraftTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const draftTranscriptRef = useRef<string>('');
  const isListeningRef = useRef<boolean>(false);
  const silenceTimerRef = useRef<any>(null);
  const recognitionGenerationRef = useRef(0);

  // Stop any active audio and speech recognition on unmount or question change
  const stopAllActivity = () => {
    isListeningRef.current = false;
    recognitionGenerationRef.current += 1;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {}
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((trk) => trk.stop());
      } catch {}
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);
  };

  useEffect(() => {
    const unregister = registerVoiceCleanup(() => {
      stopAllActivity();
    });
    return () => {
      unregister();
      stopAllActivity();
    };
  }, []);

  // Reset transcript and state when moving to a new question
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      stopAllActivity();
      setDraftTranscript('');
      setVoiceError(null);
      setVoiceState('idle');
    });
    return () => {
      active = false;
    };
  }, [questionIndex]);

  // Clean text helper for natural speech
  const cleanSpokenText = (raw: string) => {
    return raw
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#{1,6}\s+/g, '')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^[-*•]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/[:;]/g, ',')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Convert base64 audio to Blob URL
  const base64ToBlobUrl = (base64: string, mimeType: string = 'audio/wav') => {
    try {
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch {
      return `data:${mimeType};base64,${base64}`;
    }
  };

  // High-fidelity natural voice readout (Sarvam Bulbul / Studio Neural)
  const handleSpeakQuestion = async () => {
    if (!currentQuestion) return;
    stopAllActivity();
    setVoiceError(null);
    setVoiceState('processing');

    const textToSpeak = cleanSpokenText(currentQuestion);

    try {
      const savedSarvamKey = localStorage.getItem('jansaathi_sarvam_key') || undefined;
      const savedElevenKey = localStorage.getItem('jansaathi_elevenlabs_key') || undefined;
      const savedVoiceId = localStorage.getItem('jansaathi_elevenlabs_voice_id') || undefined;

      const res = await synthesizeSpeech(
        textToSpeak,
        language,
        savedSarvamKey,
        undefined,
        'sarvam',
        savedElevenKey,
        savedVoiceId
      );

      if (res && res.status === 'success' && res.audio) {
        const isWav = res.audio.startsWith('UklGR');
        const mimeType = res.format || (isWav ? 'audio/wav' : 'audio/mp3');
        const blobUrl = base64ToBlobUrl(res.audio, mimeType);
        const audio = new Audio(blobUrl);
        registerActiveAudio(audio);
        audioRef.current = audio;

        audio.onended = () => {
          setVoiceState('idle');
          audioRef.current = null;
        };
        audio.onerror = () => {
          fallbackNaturalSpeech(textToSpeak);
        };

        setVoiceState('speaking');
        await audio.play();
        return;
      }
      // If backend TTS did not return audio, use natural browser speech
      fallbackNaturalSpeech(textToSpeak);
    } catch (err: any) {
      console.warn('synthesizeSpeech error:', err);
      fallbackNaturalSpeech(textToSpeak);
    }
  };

  // Browser fallback with strict selection of natural/neural voices (never legacy robotic SAPI)
  const fallbackNaturalSpeech = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = language === 'hi' ? 'hi-IN' : language === 'or' ? 'or-IN' : 'en-IN';
        u.rate = 0.95;
        u.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices() || [];
        const langPrefix = language === 'hi' ? 'hi' : language === 'or' ? 'or' : 'en';
        const naturalVoice =
          voices.find(
            (v) =>
              (v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Online')) &&
              v.lang.toLowerCase().startsWith(langPrefix)
          ) ||
          voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix) && !v.name.includes('Desktop'));

        if (naturalVoice) {
          u.voice = naturalVoice;
        }

        // Chrome may return an empty voice list until voiceschanged fires. Speak
        // only after that event so the fallback does not silently choose a
        // low-quality legacy voice.
        if (!naturalVoice && voices.length === 0) {
          const speakWhenReady = () => {
            window.speechSynthesis.removeEventListener('voiceschanged', speakWhenReady);
            fallbackNaturalSpeech(text);
          };
          window.speechSynthesis.addEventListener('voiceschanged', speakWhenReady, { once: true });
          window.setTimeout(() => {
            window.speechSynthesis.removeEventListener('voiceschanged', speakWhenReady);
            setVoiceState('idle');
          }, 1500);
          setVoiceState('speaking');
          return;
        }

        u.onend = () => setVoiceState('idle');
        u.onerror = () => setVoiceState('idle');
        setVoiceState('speaking');
        window.speechSynthesis.speak(u);
      } catch {
        setVoiceState('idle');
      }
    } else {
      setVoiceState('idle');
    }
  };

  // Start speech recognition & microphone meter
  const handleStartListening = async () => {
    stopAllActivity();
    setVoiceError(null);
    setDraftTranscript('');
    draftTranscriptRef.current = '';

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    // Set up audio visualization meter
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            googEchoCancellation: true,
            googAutoGainControl: true,
            googNoiseSuppression: true,
            googHighpassFilter: true,
          } as any,
        });
        registerActiveStream(stream);
        mediaStreamRef.current = stream;
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          registerActiveAudioContext(ctx);
          audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateMeter = () => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
            animFrameRef.current = requestAnimationFrame(updateMeter);
          };
          updateMeter();
        }
      }
    } catch (micErr) {
      console.warn('Microphone stream access error (for meter):', micErr);
    }

    if (!SpeechRec) {
      setVoiceError(
        language === 'hi'
          ? 'आपके ब्राउज़र में आवाज़ पहचान उपलब्ध नहीं है। कृपया नीचे लिखकर उत्तर दें।'
          : language === 'or'
          ? 'ଆପଣଙ୍କ ବ୍ରାଉଜରରେ ସ୍ୱର ଚିହ୍ନଟ ଉପଲବ୍ଧ ନାହିଁ। ଦୟାକରି ତଳେ ଉତ୍ତର ଲେଖନ୍ତୁ।'
          : 'Speech recognition is not available in your browser. Please type your answer below.'
      );
      setVoiceState('idle');
      return;
    }

    try {
      const recognition = new SpeechRec();
      registerActiveSpeechRecognition(recognition);
      recognitionRef.current = recognition;
      isListeningRef.current = true;
      const recognitionGeneration = recognitionGenerationRef.current;
      recognition.continuous = true;
      recognition.interimResults = true;

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
      recognition.lang = BCP47_MAP[language] || 'en-IN';

      let sessionFinal = '';
      let persistentHistory = '';

      recognition.onstart = () => {
        setVoiceState('listening');
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let currentFinal = '';
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            currentFinal += event.results[i][0].transcript + ' ';
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        sessionFinal = currentFinal;
        const currentUtterance = (currentFinal + interim).trim();
        const full = (persistentHistory ? `${persistentHistory} ${currentUtterance}` : currentUtterance).trim();
        if (full) {
          setDraftTranscript(full);
          draftTranscriptRef.current = full;
        }

        // Natural 3500ms silence debounce allows patient to breathe and finish full sentences without cutoff
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        silenceTimerRef.current = setTimeout(() => {
          if (isListeningRef.current && draftTranscriptRef.current) {
            handleDoneSpeaking();
          }
        }, 3500);
      };

      recognition.onerror = (e: any) => {
        if (e.error === 'no-speech') {
          return;
        }
        console.warn('SpeechRecognition error:', e);
        if (e.error !== 'aborted') {
          setVoiceError(
            e.error === 'audio-capture'
              ? 'Microphone input was lost. Check the microphone and try again.'
              : `Voice error: ${e.error || 'Speech capture failed'}`
          );
        }
        isListeningRef.current = false;
        setVoiceState(draftTranscriptRef.current ? 'reviewing' : 'idle');
      };

      recognition.onend = () => {
        if (isListeningRef.current && recognitionGeneration === recognitionGenerationRef.current) {
          // Chrome may stop recognition on silent pauses even with continuous=true.
          // Save session finals to history and restart seamlessly to capture full thoughts!
          if (sessionFinal.trim()) {
            persistentHistory = (persistentHistory ? `${persistentHistory} ${sessionFinal}` : sessionFinal).trim();
            sessionFinal = '';
          }
          // Restart on the next task. Calling start() synchronously from onend
          // intermittently throws InvalidStateError and leaves the UI stuck.
          window.setTimeout(() => {
            if (!isListeningRef.current || recognitionGeneration !== recognitionGenerationRef.current) return;
            try {
              recognition.start();
            } catch (err) {
              console.warn('Speech recognition restart failed:', err);
              isListeningRef.current = false;
              setVoiceState(draftTranscriptRef.current ? 'reviewing' : 'idle');
            }
          }, 150);
        } else {
          if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
          }
          setAudioLevel(0);
          setVoiceState('reviewing');
        }
      };

      recognition.start();
    } catch (err: any) {
      setVoiceError(`Could not start microphone: ${err.message}`);
      setVoiceState('idle');
    }
  };

  // Finish listening manually
  const handleDoneSpeaking = () => {
    isListeningRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    stopAllActivity();
    setVoiceState('reviewing');
  };

  // Confirm and save spoken answer
  const handleConfirmAnswer = (customText?: string) => {
    const finalAnswer = (customText ?? draftTranscript).trim();
    if (!finalAnswer) return;
    stopAllActivity();
    onAnswerConfirmed(finalAnswer);
    setDraftTranscript('');
    setVoiceState('idle');
  };

  return (
    <section
      aria-label="Clinical Voice Interview Assistant"
      className="bg-creamdeep border border-ink/10 rounded-2xl p-5 md:p-6 space-y-5 shadow-sm"
    >
      {/* ── Top Header Row ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-ink/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-ink text-cream flex items-center justify-center shrink-0">
            <Volume2 className="w-4 h-4 text-magenta" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif opsz-72 text-sm md:text-base font-semibold text-ink">
                {language === 'or'
                  ? 'ଡାକ୍ତରୀ ପ୍ରଶ୍ନୋତ୍ତର ସହାୟକ'
                  : language === 'hi'
                  ? 'चिकित्सीय वॉइस पूछताछ'
                  : 'Clinical Voice Assistant'}
              </h3>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-semibold bg-magenta/15 text-magentadeep border border-magenta/20">
                {language === 'or' ? 'ପ୍ରଶ୍ନ' : language === 'hi' ? 'प्रश्न' : 'Question'} {questionIndex + 1} / {totalQuestions}
              </span>
            </div>
            <p className="text-[11px] text-inkmute mt-0.5 font-sans">
              {language === 'or'
                ? 'ପ୍ରଶ୍ନ ଶୁଣନ୍ତୁ ଏବଂ ମାଇକ୍ରୋଫୋନରେ ସ୍ୱାଭାବିକ ଭାବେ କୁହନ୍ତୁ'
                : language === 'hi'
                ? 'प्रश्न सुनें और माइक में स्वाभाविक रूप से उत्तर बोलें'
                : 'Listen to the clinical question and speak naturally'}
            </p>
          </div>
        </div>

        {/* Dialect / Natural Audio Indicator */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-inkmute font-medium px-3 py-1 rounded-full bg-cream border border-ink/10 inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-magenta" />
            <span>
              {language === 'or' ? 'ଓଡ଼ିଆ ଭଏସ୍ (Sarvam AI)' : language === 'hi' ? 'हिन्दी वॉइस (Sarvam AI)' : 'English Voice'}
            </span>
          </span>
        </div>
      </div>

      {/* ── Prominent Question Display Card ── */}
      <div className="bg-cream rounded-2xl border border-ink/10 p-5 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 flex-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-magenta">
              {language === 'or' ? 'ଚଳିତ ଡାକ୍ତରୀ ପ୍ରଶ୍ନ' : language === 'hi' ? 'वर्तमान नैदानिक प्रश्न' : 'Current Clinical Question'}
            </span>
            <p className="font-serif opsz-72 text-base md:text-xl font-semibold text-ink leading-relaxed">
              "{currentQuestion}"
            </p>
          </div>

          {/* Voice State Badge */}
          {voiceState === 'speaking' && (
            <span className="shrink-0 px-3 py-1 rounded-full bg-ink text-cream text-xs font-medium inline-flex items-center gap-1.5 animate-pulse">
              <Volume2 className="w-3.5 h-3.5 text-magenta" />
              <span>{language === 'or' ? 'ପଢ଼ାଯାଉଛି...' : language === 'hi' ? 'सुनाया जा रहा है...' : 'Reading aloud...'}</span>
            </span>
          )}
          {voiceState === 'listening' && (
            <span className="shrink-0 px-3 py-1 rounded-full bg-magenta text-cream text-xs font-semibold inline-flex items-center gap-1.5 animate-pulse">
              <Mic className="w-3.5 h-3.5" />
              <span>{language === 'or' ? 'ଶୁଣୁଛୁ...' : language === 'hi' ? 'सुन रहे हैं...' : 'Listening...'}</span>
            </span>
          )}
        </div>

        {/* Dynamic Acoustic Level Wave (when listening) */}
        {voiceState === 'listening' && (
          <div className="pt-2 flex items-center gap-3">
            <div className="flex items-center gap-1 h-6">
              {[0.4, 0.7, 1.0, 0.8, 0.5, 0.9, 0.6].map((mult, idx) => (
                <div
                  key={idx}
                  className="w-1.5 bg-magenta rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(6, Math.min(24, 6 + audioLevel * mult * 0.35))}px` }}
                />
              ))}
            </div>
            <span className="text-xs text-magentadeep font-medium">
              {language === 'or'
                ? 'ଆପଣଙ୍କ ଉତ୍ତର କୁହନ୍ତୁ... (କହିସାରିବା ପରେ "ସମାପ୍ତ" ଚିପନ୍ତୁ)'
                : language === 'hi'
                ? 'अपना उत्तर बोलें... (बोलने के बाद "हो गया" दबाएं)'
                : 'Speaking your answer... (Click "Done Speaking" when finished)'}
            </span>
          </div>
        )}

        {/* ── Action Buttons Row ── */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-ink/8">
          <div className="flex items-center gap-2.5">
            {/* Listen to Question */}
            <button
              type="button"
              onClick={handleSpeakQuestion}
              disabled={voiceState === 'speaking' || voiceState === 'listening' || voiceState === 'processing'}
              className="pill pill-secondary px-4 py-2 text-xs font-medium inline-flex items-center gap-2"
            >
              {voiceState === 'processing' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-magenta" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-magenta" />
              )}
              <span>
                {language === 'or'
                  ? '🔊 ପ୍ରଶ୍ନ ଶୁଣନ୍ତୁ'
                  : language === 'hi'
                  ? '🔊 प्रश्न सुनें'
                  : '🔊 Listen to Question'}
              </span>
            </button>

            {/* Speak Answer Button */}
            {voiceState !== 'listening' ? (
              <button
                type="button"
                onClick={handleStartListening}
                disabled={voiceState === 'speaking'}
                className="pill pill-magenta px-5 py-2 text-xs font-semibold inline-flex items-center gap-2 shadow-sm"
              >
                <Mic className="w-3.5 h-3.5 text-cream" />
                <span>
                  {language === 'or'
                    ? '🎙️ ଉତ୍ତର ବୋଲନ୍ତୁ'
                    : language === 'hi'
                    ? '🎙️ उत्तर बोलें'
                    : '🎙️ Speak Answer'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDoneSpeaking}
                className="pill pill-ink px-5 py-2 text-xs font-semibold inline-flex items-center gap-2 shadow-sm"
              >
                <Check className="w-3.5 h-3.5 text-magenta" />
                <span>
                  {language === 'or'
                    ? '✓ କହିବା ଶେଷ ହେଲା (Done)'
                    : language === 'hi'
                    ? '✓ बोलना पूरा हुआ (Done)'
                    : '✓ Done Speaking'}
                </span>
              </button>
            )}
          </div>

          {/* Reset / Stop */}
          {(voiceState === 'speaking' || voiceState === 'listening' || draftTranscript) && (
            <button
              type="button"
              onClick={() => {
                stopAllActivity();
                setDraftTranscript('');
                setVoiceState('idle');
              }}
              className="text-xs text-inkmute hover:text-ink inline-flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{language === 'or' ? 'ପୁଣି କରନ୍ତୁ (Reset)' : language === 'hi' ? 'रीसेट करें' : 'Reset'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Voice Error Display */}
      {voiceError && (
        <div
          role="alert"
          className="bg-magenta/10 border border-magenta/25 rounded-xl p-3 text-xs text-magentadeep flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-magenta shrink-0" />
          <span>{voiceError}</span>
        </div>
      )}

      {/* ── Spoken Answer Confirmation Box ── */}
      {(draftTranscript || voiceState === 'reviewing') && (
        <div className="bg-cream rounded-2xl border border-magenta/30 p-4 md:p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink flex items-center gap-2">
              <Check className="w-4 h-4 text-magenta" />
              <span>
                {language === 'or'
                  ? 'ଆପଣଙ୍କ ବୋଲାଯାଇଥିବା ଉତ୍ତର (ସମୀକ୍ଷା କରନ୍ତୁ):'
                  : language === 'hi'
                  ? 'आपका बोला गया उत्तर (समीक्षा करें):'
                  : 'Your Spoken Answer (Review & Confirm):'}
              </span>
            </span>
            <span className="text-[11px] text-inkmute">
              {language === 'or' ? 'ଆପଣ ଲେଖା ବଦଳାଇ ପାରିବେ' : language === 'hi' ? 'आप आवश्यकतानुसार बदलाव कर सकते हैं' : 'You can edit before saving'}
            </span>
          </div>

          <textarea
            value={draftTranscript}
            onChange={(e) => setDraftTranscript(e.target.value)}
            rows={2}
            className="w-full text-xs md:text-sm p-3 rounded-xl border border-ink/14 bg-creamdeep/40 text-ink focus:outline-none focus:border-magenta font-medium"
            placeholder={
              language === 'or'
                ? 'ଆପଣଙ୍କ ଉତ୍ତର ଏଠାରେ ଦେଖାଯିବ...'
                : language === 'hi'
                ? 'आपका उत्तर यहाँ दिखाई देगा...'
                : 'Your spoken answer will appear here...'
            }
          />

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setDraftTranscript('');
                setVoiceState('idle');
              }}
              className="pill pill-secondary px-3.5 py-1.5 text-xs text-inkmute hover:text-ink"
            >
              {language === 'or' ? 'ରଦ୍ଦ କରନ୍ତୁ' : language === 'hi' ? 'रद्द करें' : 'Discard'}
            </button>
            <button
              type="button"
              onClick={() => handleConfirmAnswer()}
              disabled={!draftTranscript.trim()}
              className="pill pill-magenta px-5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {language === 'or'
                  ? '✓ ଉତ୍ତର ସଂରକ୍ଷଣ କରନ୍ତୁ'
                  : language === 'hi'
                  ? '✓ उत्तर सहेजें और आगे बढ़ें'
                  : '✓ Save & Continue'}
              </span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
