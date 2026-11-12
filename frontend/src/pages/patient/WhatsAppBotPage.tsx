import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  getWhatsAppChatHistory,
  sendWhatsAppChatMessage,
  synthesizeSpeech,
  transcribeSpeech,
} from '../../api/patientApi';
import type { WhatsAppChatMessage } from '../../api/patientApi';
import {
  registerActiveAudio,
  registerActiveStream,
  registerVoiceCleanup,
} from '../../services/globalAudio';

const nowMs = () => Date.now();
const nowIso = () => new Date().toISOString();

export const WhatsAppBotPage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const [searchParams] = useSearchParams();

  const token =
    searchParams.get('token') ||
    localStorage.getItem(`case_token_${caseId}`) ||
    '';

  const [messages, setMessages] = useState<WhatsAppChatMessage[]>([]);
  const [patientName, setPatientName] = useState<string>('');
  const [patientContact, setPatientContact] = useState<string>('');
  const [diagnosis, setDiagnosis] = useState<string>('');
  const [orderUrl, setOrderUrl] = useState<string>('');
  const [preferredLang, setPreferredLang] = useState<string>('or');

  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioLoadingId, setAudioLoadingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchChat = React.useCallback(async () => {
    if (!caseId) return;
    try {
      const data = await getWhatsAppChatHistory(caseId, token);
      setMessages(data.messages || []);
      setPatientName(data.patient_name || '');
      setPatientContact(data.patient_contact || '');
      setDiagnosis(data.diagnosis || '');
      setOrderUrl(data.order_url || '');
      setPreferredLang(data.preferred_language || 'or');
    } catch (err) {
      console.error('Failed to load WhatsApp chat history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [caseId, token]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void fetchChat();
    });
    return () => {
      active = false;
    };
  }, [fetchChat]);

  useEffect(() => {
    const unregister = registerVoiceCleanup(() => {
      if (currentAudioRef.current) {
        try {
          currentAudioRef.current.pause();
          currentAudioRef.current.src = '';
        } catch {}
        currentAudioRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
        mediaRecorderRef.current = null;
      }
      setIsListening(false);
      setPlayingAudioId(null);
    });

    return () => {
      unregister();
      if (currentAudioRef.current) {
        try {
          currentAudioRef.current.pause();
          currentAudioRef.current.src = '';
        } catch {}
        currentAudioRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
        mediaRecorderRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending || !caseId) return;

    const tempId = `temp-${nowMs()}`;
    const newMsg: WhatsAppChatMessage = {
      id: tempId,
      sender: 'patient',
      text,
      status: 'delivered',
      timestamp: nowIso(),
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputText('');
    setIsSending(true);

    try {
      const res = await sendWhatsAppChatMessage({
        public_case_id: caseId,
        phone_number: patientContact,
        message: text,
        token,
      });

      if (res && res.reply) {
        const botReply: WhatsAppChatMessage = {
          id: res.bot_message_id || `bot-${nowMs()}`,
          sender: 'bot',
          text: res.reply,
          status: 'delivered',
          timestamp: res.timestamp || nowIso(),
        };
        setMessages((prev) => [...prev, botReply]);
      }
    } catch (err) {
      console.error('Error sending WhatsApp message:', err);
      const fallbackReply: WhatsAppChatMessage = {
        id: `bot-fallback-${nowMs()}`,
        sender: 'bot',
        text: preferredLang === 'or'
          ? 'ଦୟାକରି କ୍ଷମା କରିବେ, ଏଆଇ ସର୍ଭର ବର୍ତ୍ତମାନ ବ୍ୟସ୍ତ ଅଛି। ଆପଣ ଡାକ୍ତରଙ୍କ ପ୍ରେସକ୍ରିପସନ୍ ଲିଙ୍କ୍ ଦେଖିପାରିବେ କିମ୍ବା ଔଷଧ ଅର୍ଡର କରିପାରିବେ।'
          : 'I apologize, the AI assistant is experiencing high volume. You can check your prescription or order medicines directly.',
        status: 'delivered',
        timestamp: nowIso(),
      };
      setMessages((prev) => [...prev, fallbackReply]);
    } finally {
      setIsSending(false);
    }
  };

  const quickQuestions = [
    {
      label: preferredLang === 'or' ? '💊 ଔଷଧ କିପରି ଖାଇବି?' : preferredLang === 'hi' ? '💊 दवा कैसे लें?' : '💊 How to take medicines?',
      query: preferredLang === 'or' ? 'ମୁଁ ଔଷଧ କେବେ ଏବଂ କିପରି ଖାଇବି? ନିୟମ ବୁଝାଇ ଦିଅନ୍ତୁ।' : preferredLang === 'hi' ? 'दवाइयां कब और कैसे लेनी हैं? नियम बताएं।' : 'When and how should I take my prescribed medicines?',
    },
    {
      label: preferredLang === 'or' ? '🛒 ଔଷଧ ଅର୍ଡର ଲିଙ୍କ୍' : preferredLang === 'hi' ? '🛒 दवा ऑर्डर लिंक' : '🛒 Order medicines link',
      query: preferredLang === 'or' ? 'ମୁଁ ସରକାରୀ ରିହାତି ଦରରେ ଔଷଧ କିପରି ଅର୍ଡର କରିବି? ଲିଙ୍କ୍ ଦିଅନ୍ତୁ।' : preferredLang === 'hi' ? 'मैं सरकारी सब्सिडी दर पर दवा कैसे ऑर्डर करूं? लिंक दें।' : 'How can I order subsidized medicines? Please give link.',
    },
    {
      label: preferredLang === 'or' ? '🥛 କ୍ଷୀର ବା ଖାଦ୍ୟ ସହିତ?' : preferredLang === 'hi' ? '🥛 दूध या खाने के साथ?' : '🥛 With milk or food?',
      query: preferredLang === 'or' ? 'ମୁଁ ଏହି ଔଷଧ କ୍ଷୀର କିମ୍ବା ଖାଦ୍ୟ ସହିତ ଖାଇପାରିବି କି?' : preferredLang === 'hi' ? 'क्या मैं यह दवा दूध या भोजन के साथ ले सकता हूँ?' : 'Can I take these medications with milk or food?',
    },
    {
      label: preferredLang === 'or' ? '⚠️ କଷ୍ଟ ବଢ଼ିଲେ କଣ କରିବି?' : preferredLang === 'hi' ? '⚠️ दर्द बढ़े तो क्या करें?' : '⚠️ Worsening symptoms?',
      query: preferredLang === 'or' ? 'ଯଦି ମୋର କଷ୍ଟ କିମ୍ବା ଛାତି ବ୍ୟଥା ବଢ଼ିଯାଏ, ତେବେ ମୁଁ କଣ କରିବି?' : preferredLang === 'hi' ? 'अगर दर्द या छाती की तकलीफ बढ़ जाए तो क्या करूँ?' : 'What should I do if my pain or chest discomfort worsens?',
    },
  ];

  const toggleListening = async () => {
    if (isListening) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      registerActiveStream(stream);
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 1000) {
          try {
            const sttRes = await transcribeSpeech(audioBlob, preferredLang);
            if (sttRes && sttRes.transcript) {
              setInputText(sttRes.transcript);
              handleSendMessage(sttRes.transcript);
            }
          } catch (err) {
            console.error('STT Transcription error:', err);
          }
        }
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.warn('Microphone permission or audio capture failed:', err);
      alert('Microphone access is needed for voice input.');
    }
  };

  const handlePlayTTS = async (msgId: string, text: string) => {
    if (playingAudioId === msgId) {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      setPlayingAudioId(null);
      return;
    }

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    setAudioLoadingId(msgId);
    try {
      const tts = await synthesizeSpeech(text.slice(0, 300), preferredLang);
      if (tts && tts.audio) {
        const audio = new Audio(`data:audio/wav;base64,${tts.audio}`);
        registerActiveAudio(audio);
        currentAudioRef.current = audio;
        audio.onended = () => {
          setPlayingAudioId(null);
          currentAudioRef.current = null;
        };
        audio.onerror = () => {
          setPlayingAudioId(null);
          currentAudioRef.current = null;
        };
        await audio.play();
        setPlayingAudioId(msgId);
      }
    } catch (err) {
      console.error('TTS playback failed:', err);
    } finally {
      setAudioLoadingId(null);
    }
  };

  const renderMessageContent = (text: string) => {
    const hasOrderLink = text.includes('/patient/orders/') || text.includes('🛒 *ଔଷଧ ଅର୍ଡର') || text.includes('दवा ऑर्डर');
    const hasCaseLink = text.includes('/patient/case/');

    const formatted = text
      .split('\n')
      .map((line, idx) => {
        const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().startsWith('*');
        return (
          <p key={idx} className={`${isBullet ? 'pl-2' : ''} ${line.trim() === '' ? 'h-2' : 'min-h-[1.2rem]'}`}>
            {line}
          </p>
        );
      });

    return (
      <div className="space-y-1">
        <div className="whitespace-pre-wrap">{formatted}</div>

        {hasOrderLink && (orderUrl || caseId) && (
          <div className="mt-3 pt-2 border-t border-ink/10">
            <Link
              to={orderUrl ? orderUrl.replace('http://localhost:5173', '') : `/patient/orders/${caseId}?token=${token}`}
              className="pill pill-magenta px-3.5 py-1.5 text-xs font-semibold"
            >
              <iconify-icon icon="ph:shopping-bag-bold" width="14" height="14"></iconify-icon>
              <span>🛒 Order Prescribed Medicines (70–90% Off)</span>
            </Link>
          </div>
        )}

        {hasCaseLink && (
          <div className="mt-2">
            <Link
              to={`/patient/case/${caseId}?token=${token}`}
              className="pill pill-secondary px-3 py-1.5 text-xs font-medium"
            >
              <iconify-icon icon="ph:file-text-bold" width="14" height="14"></iconify-icon>
              <span>📄 View Full Prescription Records</span>
            </Link>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto h-[88vh] flex flex-col bg-creamdeep rounded-2xl shadow-xl border border-ink/10 overflow-hidden font-sans">
      {/* ── Editorial Top Header ── */}
      <div className="bg-ink text-cream px-5 py-3.5 flex items-center justify-between shadow-sm shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Link
            to={`/patient/case/${caseId}?token=${token}`}
            className="p-1 hover:bg-cream/10 rounded-full transition-colors text-cream"
            title="Back to Case Records"
          >
            <iconify-icon icon="ph:arrow-left-bold" width="18" height="18"></iconify-icon>
          </Link>

          {/* Bot Avatar */}
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-magenta flex items-center justify-center font-bold text-cream">
              <iconify-icon icon="ph:robot-bold" width="20" height="20"></iconify-icon>
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-magenta border-2 border-ink rounded-full" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif opsz-72 font-semibold text-sm text-cream tracking-tight">Jan Saathi AI Health Bot</h1>
              <span className="bg-magenta text-cream text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                Verified
              </span>
            </div>
            <p className="text-[11px] text-cream/60 flex items-center gap-1">
              <span>Online • 24/7 AI Telemedicine Assistant</span>
              {patientName && (
                <span className="text-cream/80 font-medium">({patientName})</span>
              )}
            </p>
          </div>
        </div>

        {/* Quick Emergency / Help Actions */}
        <div className="flex items-center gap-2">
          <a
            href="tel:108"
            className="hidden sm:inline-flex items-center gap-1.5 pill pill-magenta px-3 py-1 text-[11px]"
            title="Emergency 108 Ambulance"
          >
            <iconify-icon icon="ph:phone-fill" width="12" height="12"></iconify-icon>
            <span>108 Ambulance</span>
          </a>

          <button
            onClick={fetchChat}
            disabled={isLoading}
            className="p-1.5 hover:bg-cream/10 rounded-full text-cream/70 hover:text-cream transition-colors"
            title="Refresh Chat"
          >
            <iconify-icon icon="ph:arrows-clockwise-bold" width="16" height="16" className={isLoading ? 'animate-spin' : ''}></iconify-icon>
          </button>
        </div>
      </div>

      {/* ── Security & Case Context Banner ── */}
      <div className="bg-cream border-b border-ink/8 px-5 py-2 flex items-center justify-between text-[11px] text-inkmute">
        <div className="flex items-center gap-1.5">
          <iconify-icon icon="ph:shield-check-fill" width="15" height="15" style={{ color: '#d6246e' }}></iconify-icon>
          <span>Case: <strong className="font-mono text-ink">{caseId}</strong></span>
          {diagnosis && (
            <span className="hidden md:inline text-inkmute">
              • Diagnosis: <strong>{diagnosis}</strong>
            </span>
          )}
        </div>
        <Link
          to={`/patient/orders/${caseId}?token=${token}`}
          className="text-magenta hover:underline font-semibold flex items-center gap-1"
        >
          <iconify-icon icon="ph:shopping-bag-bold" width="13" height="13"></iconify-icon>
          <span>Order Jan Aushadhi Medicines</span>
        </Link>
      </div>

      {/* ── Chat Messages Container ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-cream/40">
        {/* Encryption notice */}
        <div className="flex justify-center">
          <div className="bg-creamdeep text-inkmute text-[11px] px-4 py-2 rounded-xl border border-ink/8 max-w-md text-center flex items-center gap-2">
            <iconify-icon icon="ph:lock-simple-fill" width="14" height="14" style={{ color: '#5a544a', flexShrink: 0 } as any}></iconify-icon>
            <span>
              Messages are private, secure, and ABDM compliant. Responses are generated based on your licensed clinician's prescription.
            </span>
          </div>
        </div>

        {/* Date separator */}
        <div className="flex justify-center my-2">
          <span className="text-inkmute/60 text-[10px] font-semibold uppercase tracking-widest">
            Today
          </span>
        </div>

        {/* Loading state */}
        {isLoading && messages.length === 0 && (
          <div className="flex justify-center items-center py-10 space-x-2 text-inkmute text-xs">
            <div className="w-5 h-5 border-2 border-magenta border-t-transparent rounded-full animate-spin" />
            <span>Loading WhatsApp conversation...</span>
          </div>
        )}

        {/* Messages stream */}
        {messages.map((msg) => {
          const isBot = msg.sender === 'bot';
          const timeStr = msg.timestamp
            ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '';

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}
            >
              <div
                className={`relative px-4 py-3 rounded-2xl text-xs max-w-[88%] sm:max-w-[78%] ${
                  isBot
                    ? 'bg-cream text-ink rounded-tl-sm border border-ink/8 shadow-xs'
                    : 'bg-ink text-cream rounded-tr-sm shadow-xs'
                }`}
              >
                {/* Sender badge for Bot */}
                {isBot && (
                  <div className="flex items-center justify-between gap-3 mb-1.5 text-[11px] text-magenta font-semibold border-b border-ink/8 pb-1">
                    <span className="flex items-center gap-1">
                      <iconify-icon icon="ph:sparkle-fill" width="12" height="12"></iconify-icon>
                      <span>Jan Saathi AI Bot</span>
                    </span>

                    <button
                      onClick={() => handlePlayTTS(msg.id, msg.text)}
                      disabled={audioLoadingId === msg.id}
                      className="p-1 hover:bg-creamdeep rounded-lg text-inkmute hover:text-magenta transition-colors"
                      title="Listen in human voice"
                    >
                      {audioLoadingId === msg.id ? (
                        <div className="w-3 h-3 border-2 border-magenta border-t-transparent rounded-full animate-spin" />
                      ) : playingAudioId === msg.id ? (
                        <iconify-icon icon="ph:speaker-x-bold" width="14" height="14" style={{ color: '#d6246e' }}></iconify-icon>
                      ) : (
                        <iconify-icon icon="ph:speaker-high-bold" width="14" height="14"></iconify-icon>
                      )}
                    </button>
                  </div>
                )}

                {/* Message body */}
                <div className={`leading-relaxed text-[12.5px] ${isBot ? 'text-ink' : 'text-cream'}`}>
                  {renderMessageContent(msg.text)}
                </div>

                {/* Footer: Time & Status ticks */}
                <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] select-none ${isBot ? 'text-inkmute/60' : 'text-cream/50'}`}>
                  <span>{timeStr}</span>
                  {!isBot && (
                    <iconify-icon icon="ph:checks-bold" width="12" height="12" style={{ color: '#d6246e' }}></iconify-icon>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* AI Typing Indicator */}
        {isSending && (
          <div className="flex items-start">
            <div className="bg-cream px-4 py-2.5 rounded-2xl rounded-tl-sm border border-ink/8 text-xs flex items-center gap-2 text-inkmute">
              <span className="text-[11px] font-semibold text-magenta">Jan Saathi AI is typing</span>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-magenta rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-magenta rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-magenta rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Suggested Doubt Chips ── */}
      <div className="bg-creamdeep px-4 py-2.5 border-t border-ink/8 overflow-x-auto whitespace-nowrap flex items-center gap-2">
        <span className="text-[11px] text-inkmute font-semibold flex items-center gap-1 shrink-0">
          <iconify-icon icon="ph:sparkle-fill" width="12" height="12" style={{ color: '#d6246e' }}></iconify-icon>
          <span>Quick:</span>
        </span>
        {quickQuestions.map((chip, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendMessage(chip.query)}
            disabled={isSending}
            className="shrink-0 bg-cream hover:bg-magenta/10 hover:text-magenta text-ink border border-ink/10 hover:border-magenta text-xs px-3.5 py-1.5 rounded-full transition-all disabled:opacity-50"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* ── Bottom Input Bar ── */}
      <div className="bg-creamdeep p-3.5 border-t border-ink/10 flex items-center gap-2.5 shrink-0">
        {/* Voice Input Mic */}
        <button
          type="button"
          onClick={toggleListening}
          className={`p-2.5 rounded-full transition-all ${
            isListening
              ? 'bg-magenta text-cream animate-pulse'
              : 'bg-cream hover:bg-creamdeep text-ink border border-ink/14'
          }`}
          title={isListening ? 'Stop Listening' : 'Speak doubt in Odia/Hindi/English'}
        >
          <iconify-icon icon={isListening ? 'ph:microphone-slash-bold' : 'ph:microphone-bold'} width="16" height="16"></iconify-icon>
        </button>

        {/* Text Input */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={
              preferredLang === 'or'
                ? 'ଆପଣଙ୍କ ସନ୍ଦେହ ବା ପ୍ରଶ୍ନ ପଚାରନ୍ତୁ... (Type your medical doubt)'
                : preferredLang === 'hi'
                ? 'अपनी शंका या सवाल पूछें... (Type your medical doubt)'
                : 'Ask your medicine dosage, food doubts, or order medicines...'
            }
            disabled={isSending}
            className="w-full bg-cream border border-ink/14 rounded-full px-4 py-2.5 text-xs text-ink placeholder:text-inkmute/50 focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all"
          />
        </div>

        {/* Send Button */}
        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim() || isSending}
          className="p-2.5 bg-ink hover:bg-magenta disabled:opacity-40 text-cream rounded-full transition-all cursor-pointer"
          title="Send"
        >
          <iconify-icon icon="ph:paper-plane-tilt-bold" width="16" height="16"></iconify-icon>
        </button>
      </div>
    </div>
  );
};
