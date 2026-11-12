import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  User,
  HeartPulse,
  History,
  HelpCircle,
  UploadCloud,
  CheckSquare,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
  FileCheck,
  Info,
  Check,
  Mic,
  Activity,
  Thermometer,
  Bot,
  Volume2,
  Pause,
  Play,
  Zap,
  Loader2,
  RotateCcw,
  Edit2,
  X,
  Key,
  Heart,
  Wind,
  Gauge,
} from 'lucide-react';
import {
  submitCase,
  uploadDocument,
  ocrDocument,
  type OCRExtractedData,
  getFollowUpQuestions,
  transcribeSpeech,
  synthesizeSpeech,
  saveSarvamKey,
  saveElevenLabsKey,
  getTTSStatus,
  analyzeVoiceIntake,
} from '../../api/patientApi';
import { useLanguage, ALL_SUPPORTED_LANGUAGES } from '../../contexts/useLanguage';
import type { SupportedLanguage } from '../../i18n/translations';
import {
  registerActiveAudio,
  registerVoiceCleanup,
  registerActiveStream,
  registerActiveAudioContext,
  registerActiveSpeechRecognition,
  getAudioSessionId,
  isSessionActive,
  getOrCreateSharedAudio,
  setSharedAnnouncementPlaying,
} from '../../services/globalAudio';

const nowMs = () => Date.now();
const formatNowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
import { VoiceAssistantWidget } from '../../components/patient/VoiceAssistantWidget';
import { Esp32HardwareMonitor, type TelemetryData, type Esp32HardwareMonitorRef } from '../../components/hardware/Esp32HardwareMonitor';
import { esp32SerialService } from '../../services/esp32SerialService';

export type VoiceIntakeSlot = 'name' | 'age' | 'gender' | 'whatsapp' | 'problem' | 'followup' | 'report' | 'vitals' | 'confirmation' | 'submitted';

const BCP47_TAGS: Record<string, string> = {
  or: 'or-IN',
  hi: 'hi-IN',
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
  ne: 'ne-NP',
  sa: 'sa-IN',
  mai: 'mai-IN',
  kok: 'kok-IN',
  sd: 'sd-IN',
  doi: 'doi-IN',
  mni: 'mni-IN',
  sat: 'sat-IN',
  brx: 'brx-IN',
  ks: 'ks-IN',
  en: 'en-IN',
};

const normalizeIndicNumerals = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/[୦-୯]/g, (ch) => String(ch.charCodeAt(0) - 0x0b66))
    .replace(/[०-९]/g, (ch) => String(ch.charCodeAt(0) - 0x0966))
    .replace(/[০-৯]/g, (ch) => String(ch.charCodeAt(0) - 0x09e6))
    .replace(/[૦-૯]/g, (ch) => String(ch.charCodeAt(0) - 0x0ae6))
    .replace(/[੦-੯]/g, (ch) => String(ch.charCodeAt(0) - 0x0a66))
    .replace(/[౦-౯]/g, (ch) => String(ch.charCodeAt(0) - 0x0c66))
    .replace(/[௦-௯]/g, (ch) => String(ch.charCodeAt(0) - 0x0be6))
    .replace(/[೦-೯]/g, (ch) => String(ch.charCodeAt(0) - 0x0ce6))
    .replace(/[൦-൯]/g, (ch) => String(ch.charCodeAt(0) - 0x0d66));
};

const isTypingIntent = (text: string | null | undefined): boolean => {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return /(?:typing|type|typed|taip|taiping|taipin|taipig|tiping|tipe|write|writing|written|written\s*mode|manual|manual\s*form|keyboard|form|switch\s*to\s*typing|text\s*mode|i\s*want\s*to\s*type|want\s*typing|prefer\s*typing|likh|likha|likhna|likhe|likho|likhkar|likhi|likhibi|likhiba|lekh|lekha|lekhiba|lekhibi|lekhi|lekhikari|hath\s*se|hathe\s*lekhi|faram|farm|ଲେଖି|ଲେଖିବା|ଲେଖିକରି|ଲେଖିବି|ଲେଖିବୁ|ଲେଖିବାକୁ|ଟାଇପ୍|ଟାଇପ|ଟାଇପିଂ|ଟାଇପିଙ୍ଗ|ଟାଇପିଂଗ|ଫର୍ମ|टाइप|टाइपिंग|टाईपिंग|टाईप|लिखकर|लिखना|लिखे|लिखें|लिखेंगे|लिखूंगा|लिखूंगी|लिखी|हाथ\s*से|मैन्युअल|फॉर्म|লিখে|লিখব|লিখা|লিখিব|টাইপ|টাইপিং|ফরম|ফর্ম|రాయండి|రాయడం|టైపింగ్|టైప్|ఫారమ్|எழுது|எழுதுதல்|டைப்பிங்|டைப்|படிவம்|लिहून|लिहा|टायपिंग|टाईपिंग|टाईप|फॉर्म|લખીને|લખવું|ટાઈપિંગ|ટાઈપ|ફોર્મ|ಬರೆ|ಬರೆಯುವುದು|ಟೈಪಿಂಗ್|ಟೈಪ್|ಫಾರ್ಮ್|എഴുതുക|ടൈപ്പിംഗ്|ടൈപ്പ്|ഫോം|ਲਿਖ|ਲਿਖਣਾ|ਟਾਈਪਿੰਗ|ਟਾਈਪ|ਫਾਰਮ|لکھ\s*کر|لکھना|ٹائپنگ|ٹائپ|فارم)/i.test(lower);
};

const clipToSingleQuestion = (text: string): string => {
  if (!text) return '';
  const parts = text.split(/([?？])/);
  if (parts.length <= 2) return text.trim();
  // Keep up to the first question mark so patient is never asked multiple questions at once
  return (parts[0] + parts[1]).trim();
};

const normalizeGender = (val: string | null | undefined): 'male' | 'female' | 'other' | '' => {
  if (!val) return '';
  const s = String(val).trim().toLowerCase();
  if (s === 'male' || s === 'female' || s === 'other') return s;
  if (s === 'prefer_not_to_say' || /(?:prefer\s*not\s*to\s*say|rather\s*not|skip|dont\s*want|no\s*gender|non-binary|transgender|other|ଅନ୍ୟାନ୍ୟ|अन्य|कहना\s*नहीं)/i.test(s)) return 'other';
  if (/(?:ପୁରୁଷ|ପୁରୁସ|ପୁରୁଶ|ବାବୁ|ଭାଇ|ପୁଅ|पुरुष|आदमी|लड़का|नर|मर्द|\bmale\b|\bman\b|\bboy\b|gentleman|పురుషుడు|ஆண்|পুরুষ)/i.test(s)) return 'male';
  if (/(?:ମହିଳା|ସ୍ତ୍ରୀ|ଝିଅ|ଭଉଣୀ|ନାରୀ|ମାଆ|महिला|औरत|स्त्री|लड़की|नारी|माता|बहन|\bfemale\b|\bwoman\b|\bgirl\b|\blady\b|స్త్రీ|பெண்|মহিলা)/i.test(s)) return 'female';
  return '';
};

const synthesizeClinicalSentence = (
  complaint: string,
  duration: string = "",
  lang: string = "or",
  severity?: string,
  patientName?: string,
): string => {
  if (!complaint || !complaint.trim() || complaint.trim().length < 2) {
    return "";
  }

  const raw = complaint.trim();
  const cleanPName = patientName && patientName.trim() ? patientName.trim() : "";
  const dur = duration ? duration.trim() : "";
  const sevBadge = severity === "severe" ? " (!)" : "";

  // Universal fallback templates for all 23 languages
  const TEMPLATES: Record<string, (p: string, c: string, d: string) => string> = {
    or: (p, c, d) => `${p ? `${p} ଆଜ୍ଞାଙ୍କୁ ` : "ରୋଗୀଙ୍କୁ "}${d ? `ଗତ ${d} ଧରି ` : ""}${c} ସମସ୍ୟା${sevBadge} ହେଉଛି।`,
    hi: (p, c, d) => `${p ? `${p} जी को ` : "मरीज को "}${d ? `पिछले ${d} से ` : ""}${c} की समस्या${sevBadge} महसूस हो रही है।`,
    bn: (p, c, d) => `${p ? `${p}-এর ` : "রোগীর "}${d ? `গত ${d} ধরে ` : ""}${c} সমস্যা${sevBadge} হচ্ছে।`,
    te: (p, c, d) => `${p ? `${p} గారికి ` : "రోగికి "}${d ? `గత ${d} నుండి ` : ""}${c} సమస్య${sevBadge} ఉంది.`,
    ta: (p, c, d) => `${p ? `${p}-க்கு ` : "நோயாளிக்கு "}${d ? `கடந்த ${d} நாட்களாக ` : ""}${c} பிரச்சனை${sevBadge} உள்ளது.`,
    mr: (p, c, d) => `${p ? `${p} यांना ` : "रुग्णाला "}${d ? `मागील ${d} पासून ` : ""}${c} त्रास${sevBadge} होत आहे.`,
    gu: (p, c, d) => `${p ? `${p} ને ` : "દર્દીને "}${d ? `છેલ્લા ${d} થી ` : ""}${c} તકલીફ${sevBadge} થઈ રહી છે.`,
    kn: (p, c, d) => `${p ? `${p} ರವರಿಗೆ ` : "ರೋಗಿಗೆ "}${d ? `ಕಳೆದ ${d} ದಿನಗಳಿಂದ ` : ""}${c} ತೊಂದರೆ${sevBadge} ಕಾಣಿಸಿಕೊಂಡಿದೆ.`,
    ml: (p, c, d) => `${p ? `${p}-ന് ` : "രോഗിക്ക് "}${d ? `കഴിഞ്ഞ ${d} ആയി ` : ""}${c} അസുഖം${sevBadge} അനുഭവപ്പെടുന്നു.`,
    pa: (p, c, d) => `${p ? `${p} ਜੀ ਨੂੰ ` : "ਮਰੀਜ਼ ਨੂੰ "}${d ? `ਪਿਛਲੇ ${d} ਤੋਂ ` : ""}${c} ਦੀ ਤਕਲੀਫ਼${sevBadge} ਹੋ ਰਹੀ ਹੈ।`,
    as: (p, c, d) => `${p ? `${p}ৰ ` : "ৰোগীৰ "}${d ? `যোৱা ${d} ধৰি ` : ""}${c} অসুবিধা${sevBadge} হৈছে।`,
    ur: (p, c, d) => `${p ? `${p} کو ` : "مریض کو "}${d ? `پچھلے ${d} سے ` : ""}${c} کی تکلیف${sevBadge} ہے۔`,
    ne: (p, c, d) => `${p ? `${p} जीलाई ` : "बिरामीलाई "}${d ? `विगत ${d} देखि ` : ""}${c} समस्या${sevBadge} भइरहेको छ।`,
    sa: (p, c, d) => `${p ? `${p} महोदयस्य ` : "रुग्णस्य "}${d ? `विगत ${d} पर्यन्तम् ` : ""}${c} समस्या${sevBadge} वर्तते।`,
    mai: (p, c, d) => `${p ? `${p} जीकें ` : "मरीजकें "}${d ? `पिछला ${d} सं ` : ""}${c} तकलीफ${sevBadge} भऽ रहल अछि।`,
    kok: (p, c, d) => `${p ? `${p} हांकां ` : "दुयेंतीक "}${d ? `फाटल्या ${d} सावन ` : ""}${c} त्रास${sevBadge} जाता.`,
    sd: (p, c, d) => `${p ? `${p} کي ` : "مريض کي "}${d ? `گذريل ${d} کان ` : ""}${c} تڪليف${sevBadge} آهي.`,
    doi: (p, c, d) => `${p ? `${p} गी ` : "मरीज गी "}${d ? `पिच्छले ${d} थमां ` : ""}${c} तकलीफ${sevBadge} ऐ।`,
    mni: (p, c, d) => `${p ? `${p}দা ` : "অনাবদা "}${d ? `হৌখিবা ${d}দগী ` : ""}${c} ৱাবা${sevBadge} ফাওরি।`,
    sat: (p, c, d) => `${p ? `${p} ᱴᱷᱮᱱ ` : "ᱨᱩᱣᱟᱹ ᱦᱚᱲ ᱴᱷᱮᱱ "}${d ? `ᱯᱟᱨᱚᱢᱮᱱ ${d} ᱠᱷᱚᱱ ` : ""}${c} ᱮᱴᱠᱮᱴᱚᱬᱮ${sevBadge} ᱢᱮᱱᱟᱜ-ᱟ᱾`,
    brx: (p, c, d) => `${p ? `${p}नो ` : "बेरामीनो "}${d ? `थांनाय ${d} निफ्राय ` : ""}${c} असुविधा${sevBadge} जादों।`,
    ks: (p, c, d) => `${p ? `${p}س ` : "مٔریٖضَس "}${d ? `گُزٔرِمُت ${d} پؠٹھٕ ` : ""}${c} تٔکلیف${sevBadge} چھےٚ۔`,
    en: (p, c, d) => `${p ? `Patient ${p}` : "Patient"} reports presenting with ${c}${d ? ` persisting for ${d}` : ""}${sevBadge}.`
  };

  const formatter = TEMPLATES[lang] || TEMPLATES.en;
  return formatter(cleanPName, raw, dur);
};

export const AssessmentPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language, setLanguage, t } = useLanguage();

  const initialUrlName = (searchParams.get('name') || '').trim();
  const initialCleanName = (() => {
    if (!initialUrlName || isTypingIntent(initialUrlName)) return '';
    let cleaned = initialUrlName
      .replace(/^[,.।!?\s]+|[,.।!?\s]+$/g, '')
      .replace(/^(?:my name is|i am|this is|mera naam hai|mera naam|naam hai|naam|mo naa|mote|mate|amar naam|na peru|yen peyar|mazhe nav|maru naam|nanna hesaru|ente peru|ମୋର ନାମ|ମୋ ନାମ|ମୋ ନାଁ|ମୋର ପୂରା ନାମ|ମୁଁ|ମୁଁ ହେଉଛି|मेरा नाम है|मेरा नाम|नाम है|नाम)\s+/i, '');
    for (let i = 0; i < 3; i++) {
      cleaned = cleaned
        .replace(/\s+(?:achi|heuchi|hela|bolte|hai|hun|hoon|agyan|sir|ji|garu|avargal|ହେଲା|ଅଟେ|ବାବୁ|ଆଜ୍ଞା|है|हूँ|हूं|अछि|आहे|છે|ఉంది|ఇದೆ|ആണ്|is|are|am)$/i, '')
        .replace(/^[,.।!?\s]+|[,.।!?\s]+$/g, '');
    }
    return cleaned.trim();
  })();

  // Multi-step tracker (1 to 7: Info, Problem, History, Follow-up, Reports, Vitals, Review)
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Personal Info
  const [name, setName] = useState(initialCleanName);
  const [age, setAge] = useState<number | ''>('');
  const [gender, setGender] = useState<string>('');
  const [contact, setContact] = useState('');

  // Step 2: Chief Complaint
  const [complaint, setComplaint] = useState('');
  const [duration, setDuration] = useState('');
  const [severity, setSeverity] = useState('mild');

  // Dynamic Mid-Conversation Intake Fields Editing
  const [isEditingIntakeFields, setIsEditingIntakeFields] = useState(false);
  const [editTempName, setEditTempName] = useState('');
  const [editTempAge, setEditTempAge] = useState<number | ''>('');
  const [editTempGender, setEditTempGender] = useState('');
  const [editTempContact, setEditTempContact] = useState('');
  const [editTempComplaint, setEditTempComplaint] = useState('');

  // Step 3: Medical History
  const [medicalHistory, setMedicalHistory] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medications, setMedications] = useState('');

  // Step 4: Follow-up Questions & Voice
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<number, string>>({});
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [detectedSymptoms, setDetectedSymptoms] = useState<string[]>([]);
  const [clinicalDisclaimer, setClinicalDisclaimer] = useState<string | null>(null);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);

  // Step 5: Document Upload (Multi-file support)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [ocrResults, setOcrResults] = useState<Record<string, OCRExtractedData>>({});
  const [ocrLoadingFiles, setOcrLoadingFiles] = useState<Record<string, boolean>>({});

  // Step 6: Live Vitals & ESP32 Telemetry (no fake defaults)
  const [vitals, setVitals] = useState({
    heart_rate: 0,
    spo2: 0,
    systolic_bp: 0,
    diastolic_bp: 0,
    temperature: 0,
  });
  const [isReadingVitals, setIsReadingVitals] = useState(false);
  const [vitalsCaptured, setVitalsCaptured] = useState(false);
  const [esp32Telemetry, setEsp32Telemetry] = useState<TelemetryData | null>(null);
  const esp32TelemetryRef = useRef<TelemetryData | null>(null);
  const [vitalsCountdown, setVitalsCountdown] = useState(0);
  const [vitalsSampleCount, setVitalsSampleCount] = useState(0);
  const isVitalsSamplingRef = useRef<boolean>(false);
  const vitalsSamplesRef = useRef<{
    hr: number[];
    spo2: number[];
    sbp: number[];
    dbp: number[];
    temp: number[];
  }>({ hr: [], spo2: [], sbp: [], dbp: [], temp: [] });
  const vitalsTimerRef = useRef<any>(null);

  // Step 7: Review & Agreement
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  // Full-Flow Autonomous Conversational Voice Agent State
  const [isVoiceAgentActive, setIsVoiceAgentActive] = useState(
    !['text', 'manual'].includes(searchParams.get('mode') || '')
  );
  const isVoiceAgentActiveRef = useRef<boolean>(!['text', 'manual'].includes(searchParams.get('mode') || ''));
  useEffect(() => {
    isVoiceAgentActiveRef.current = isVoiceAgentActive;
  }, [isVoiceAgentActive]);
  const [voiceState, setVoiceState] = useState<'idle' | 'assistant_speaking' | 'listening' | 'processing' | 'ready' | 'paused'>('ready');
  const voiceStateRef = useRef<'idle' | 'assistant_speaking' | 'listening' | 'processing' | 'ready' | 'paused'>('ready');
  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);
  const [voiceAgentStatusText, setVoiceAgentStatusText] = useState('');
  const [agentSpeakingText, setAgentSpeakingText] = useState('');
  const [loadingStepText, setLoadingStepText] = useState<string | null>(null);
  const [isVoicePaused, setIsVoicePaused] = useState(false);
  const isVoicePausedRef = useRef<boolean>(false);
  useEffect(() => {
    isVoicePausedRef.current = isVoicePaused;
  }, [isVoicePaused]);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const pendingAudioRef = useRef<HTMLAudioElement | null>(null);
  const isAssistantSpeakingRef = useRef<boolean>(false);
  const lastAiSpeechEndedAtRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  const handleUnlockAudio = () => {
    setIsAudioBlocked(false);
    if (pendingAudioRef.current) {
      const p = pendingAudioRef.current;
      pendingAudioRef.current = null;
      try {
        p.volume = 1.0;
        p.muted = false;
        p.play().catch((err) => console.warn('Unlock audio play error:', err));
      } catch { }
    }
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        ctx.resume().then(() => ctx.close()).catch(() => { });
      }
    } catch { }
  };

  // Auto-unlock audio on any page interaction (click or touch)
  useEffect(() => {
    const handleFirstGesture = () => {
      if (pendingAudioRef.current) {
        handleUnlockAudio();
      }
    };
    window.addEventListener('click', handleFirstGesture, { capture: true, once: true });
    window.addEventListener('touchstart', handleFirstGesture, { capture: true, once: true });
    return () => {
      window.removeEventListener('click', handleFirstGesture, { capture: true });
      window.removeEventListener('touchstart', handleFirstGesture, { capture: true });
    };
  }, []);
  const [vitalsProgress, setVitalsProgress] = useState(0);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  // Audio Input Source: Strictly defaults to 'hardware' (ESP32 INMP441 USB). Laptop mic is only used as fallback if hardware is offline.
  const isGlobalSerialOpen = esp32SerialService.getState().isConnected || (typeof window !== 'undefined' && Boolean(window.__JANSAATHI_ESP32_PORT__?.readable));
  const [audioSource, setAudioSource] = useState<'hardware' | 'laptop'>('hardware');
  const audioSourceRef = useRef<'hardware' | 'laptop'>('hardware');
  useEffect(() => {
    audioSourceRef.current = audioSource;
  }, [audioSource]);
  const [isHardwareConnected, setIsHardwareConnected] = useState<boolean>(isGlobalSerialOpen);
  const isHardwareConnectedRef = useRef<boolean>(isGlobalSerialOpen);
  const esp32MonitorRef = useRef<Esp32HardwareMonitorRef | null>(null);
  const hardwarePcmBuffersRef = useRef<Float32Array[]>([]);
  const hardwareSilenceTimerRef = useRef<any>(null);
  const hardwareNoiseFloorRef = useRef<number>(0.014);
  const hasDetectedSpeechRef = useRef<boolean>(false);
  const isTranscribingHardwareRef = useRef<boolean>(false);
  const firstSpeechTimeRef = useRef<number>(0);
  const lastSpeechTimeRef = useRef<number>(0);
  const listenStartTimeRef = useRef<number>(0);
  const noiseCalibrationSamplesRef = useRef<number[]>([]);
  const preSpeechRingBufferRef = useRef<Float32Array[]>([]);
  const browserPcmBuffersRef = useRef<Float32Array[]>([]);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const idleWatchdogTimerRef = useRef<any>(null);
  const hardwareMaxDurationTimerRef = useRef<any>(null);
  const whatsappSkippedRef = useRef<boolean>(false);

  // In-field speech dictation and audio references
  const [isListeningComplaint, setIsListeningComplaint] = useState(false);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const audioContextRef = useRef<any>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<any>(null);
  const handleVoiceDoneSpeakingRef = useRef<(() => void) | null>(null);
  const lastSpokenStepRef = useRef<string>('');
  const currentStepListeningHandlerRef = useRef<((text: string) => void) | null>(null);
  const hasSubmittedRef = useRef(false);
  const disclaimerAcceptedRef = useRef(false);
  const handleSubmitRef = useRef<(() => void) | null>(null);

  // Synchronized clinical patient data refs to eliminate React stale closure in async voice loops
  const patientNameRef = useRef<string>(initialCleanName);
  const patientAgeRef = useRef<number | ''>('');
  const patientGenderRef = useRef<string>('');
  const patientContactRef = useRef<string>('');
  const patientComplaintRef = useRef<string>('');
  const patientDurationRef = useRef<string>('');
  const patientMedicalHistoryRef = useRef<string>('');
  const patientMedicationsRef = useRef<string>('');
  const patientAllergiesRef = useRef<string>('');
  const currentDoctorQuestionRef = useRef<string>('');
  const hasStartedConversationRef = useRef<boolean>(false);
  const [intakeSlot, setIntakeSlot] = useState<VoiceIntakeSlot>(initialCleanName ? 'age' : 'name');
  const currentIntakeSlotRef = useRef<VoiceIntakeSlot>(initialCleanName ? 'age' : 'name');
  useEffect(() => { currentIntakeSlotRef.current = intakeSlot; }, [intakeSlot]);
  const aiUnderstoodSentence = useMemo(() => {
    if (complaint.trim().length < 3) return '';
    return synthesizeClinicalSentence(complaint, duration, language, severity, name);
  }, [complaint, duration, language, severity, name]);
  const aiUnderstoodSentenceRef = useRef<string>('');
  useEffect(() => {
    aiUnderstoodSentenceRef.current = aiUnderstoodSentence;
  }, [aiUnderstoodSentence]);
  const speechIdRef = useRef<number>(0);

  useEffect(() => { patientNameRef.current = name; }, [name]);
  useEffect(() => { patientAgeRef.current = age; }, [age]);
  useEffect(() => { patientGenderRef.current = gender; }, [gender]);
  useEffect(() => { patientContactRef.current = contact; }, [contact]);
  useEffect(() => { patientComplaintRef.current = complaint; }, [complaint]);
  useEffect(() => { patientDurationRef.current = duration; }, [duration]);
  useEffect(() => { patientMedicalHistoryRef.current = medicalHistory; }, [medicalHistory]);
  useEffect(() => { patientMedicationsRef.current = medications; }, [medications]);
  useEffect(() => { patientAllergiesRef.current = allergies; }, [allergies]);
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ sender: 'ai' | 'patient'; text: string; time: string }>
  >([]);
  const conversationHistoryRef = useRef<
    Array<{ sender: 'ai' | 'patient'; text: string; time: string }>
  >([]);
  const consultationTurnCountRef = useRef<number>(0);
  const followUpTurnCountRef = useRef<number>(0);
  const currentConsultationStepRef = useRef<number>(1);
  const currentQuestionIdxRef = useRef<number>(0);

  const addConversationMessage = (sender: 'ai' | 'patient', text: string) => {
    const time = formatNowTime();
    const msg = { sender, text, time };
    conversationHistoryRef.current.push(msg);
    setConversationHistory((prev) => [...prev, msg]);
  };

  // Dual Voice Engine (Sarvam AI & ElevenLabs) Configuration State
  const [showVoiceModal, setShowVoiceModal] = useState<boolean>(false);
  const [voiceModalTab, setVoiceModalTab] = useState<'sarvam' | 'elevenlabs'>('sarvam');
  const [activeVoiceProvider, setActiveVoiceProvider] = useState<'sarvam' | 'elevenlabs'>(() => {
    const saved = localStorage.getItem('jansaathi_voice_provider');
    if (!saved || saved === 'elevenlabs') {
      localStorage.setItem('jansaathi_voice_provider', 'sarvam');
      return 'sarvam';
    }
    return (saved as 'sarvam' | 'elevenlabs');
  });

  // Sarvam AI State
  const [sarvamApiKeyInput, setSarvamApiKeyInput] = useState<string>(() => localStorage.getItem('jansaathi_sarvam_key') || '');
  const [sarvamConfigured, setSarvamConfigured] = useState<boolean>(false);
  const [sarvamStatusMsg, setSarvamStatusMsg] = useState<string>('');
  const [isVerifyingSarvamKey, setIsVerifyingSarvamKey] = useState<boolean>(false);

  // ElevenLabs State
  const [elevenlabsApiKeyInput, setElevenlabsApiKeyInput] = useState<string>(() => localStorage.getItem('jansaathi_elevenlabs_key') || '');
  const [elevenlabsVoiceIdInput, setElevenlabsVoiceIdInput] = useState<string>(() => localStorage.getItem('jansaathi_elevenlabs_voice_id') || 'EXAVITQu4vr4xnSDxMaL');
  const [elevenlabsConfigured, setElevenlabsConfigured] = useState<boolean>(false);
  const [elevenlabsStatusMsg, setElevenlabsStatusMsg] = useState<string>('');
  const [isVerifyingElevenLabsKey, setIsVerifyingElevenLabsKey] = useState<boolean>(false);

  // Check TTS configuration status and unlock browser audio on user gesture
  useEffect(() => {
    // Unlock HTML5 Audio playback on first user gesture
    const unlockAudio = () => {
      try {
        const dummy = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
        dummy.play().catch(() => { });
      } catch { }
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });

    const savedSarvam = localStorage.getItem('jansaathi_sarvam_key') || undefined;
    const savedEleven = localStorage.getItem('jansaathi_elevenlabs_key') || undefined;
    getTTSStatus(savedSarvam, savedEleven)
      .then((res) => {
        setSarvamConfigured(res.sarvam_configured);
        setElevenlabsConfigured(res.elevenlabs_configured);
        if (res.elevenlabs_voice_id && !localStorage.getItem('jansaathi_elevenlabs_voice_id')) {
          setElevenlabsVoiceIdInput(res.elevenlabs_voice_id);
        }
      })
      .catch(() => { });

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  const handleSelectActiveProvider = (provider: 'sarvam' | 'elevenlabs') => {
    setActiveVoiceProvider(provider);
    localStorage.setItem('jansaathi_voice_provider', provider);
  };

  const handleSaveSarvamKey = async () => {
    const trimmed = sarvamApiKeyInput.trim();
    if (!trimmed) {
      localStorage.removeItem('jansaathi_sarvam_key');
      setSarvamConfigured(false);
      setSarvamStatusMsg('Key cleared. JanSaathi will use Natural Studio Neural Voice Engine.');
      return;
    }
    setIsVerifyingSarvamKey(true);
    setSarvamStatusMsg('');
    try {
      const res = await saveSarvamKey(trimmed);
      if (res.status === 'success') {
        localStorage.setItem('jansaathi_sarvam_key', trimmed);
        setSarvamConfigured(true);
        setSarvamStatusMsg('✓ Sarvam AI Verified! Bulbul native voices (v3/v4-flash) are now active.');
        setTimeout(() => setShowVoiceModal(false), 1500);
      } else {
        setSarvamStatusMsg(`✗ ${res.message || 'Key validation failed'}`);
      }
    } catch (e: any) {
      setSarvamStatusMsg(`✗ Error: ${e?.response?.data?.message || e.message || 'Unable to connect to Sarvam'}`);
    } finally {
      setIsVerifyingSarvamKey(false);
    }
  };

  const handleSaveElevenLabsKey = async () => {
    const trimmed = elevenlabsApiKeyInput.trim();
    const voiceTrimmed = elevenlabsVoiceIdInput.trim() || 'EXAVITQu4vr4xnSDxMaL';
    if (!trimmed) {
      localStorage.removeItem('jansaathi_elevenlabs_key');
      setElevenlabsConfigured(false);
      setElevenlabsStatusMsg('Key cleared. JanSaathi will fall back to other engines.');
      return;
    }
    setIsVerifyingElevenLabsKey(true);
    setElevenlabsStatusMsg('');
    try {
      const res = await saveElevenLabsKey(trimmed, voiceTrimmed);
      if (res.status === 'success') {
        localStorage.setItem('jansaathi_elevenlabs_key', trimmed);
        localStorage.setItem('jansaathi_elevenlabs_voice_id', voiceTrimmed);
        setElevenlabsConfigured(true);
        setElevenlabsStatusMsg(`✓ ElevenLabs Verified! ${res.message}`);
        setTimeout(() => setShowVoiceModal(false), 1500);
      } else {
        setElevenlabsStatusMsg(`✗ ${res.message || 'Key validation failed'}`);
      }
    } catch (e: any) {
      setElevenlabsStatusMsg(`✗ Error: ${e?.response?.data?.message || e.message || 'Unable to connect to ElevenLabs'}`);
    } finally {
      setIsVerifyingElevenLabsKey(false);
    }
  };

  // Check if patient selected a language, redirect to language selection if not
  useEffect(() => {
    const urlLang = searchParams.get('lang') as SupportedLanguage;
    const savedLang = localStorage.getItem('jansaathi_lang');
    if (!urlLang && !savedLang) {
      navigate('/patient/language', { replace: true });
      return;
    }
    if (urlLang && ALL_SUPPORTED_LANGUAGES.includes(urlLang) && urlLang !== language) {
      setLanguage(urlLang);
    }
  }, [searchParams, language, navigate, setLanguage]);

  // Activate voice or text mode and handle pre-filled name from query params
  useEffect(() => {
    const urlMode = searchParams.get('mode');
    const urlName = searchParams.get('name');

    let cleanUrlName = '';
    if (urlName && urlName.trim()) {
      const raw = urlName.trim();
      if (!isTypingIntent(raw)) {
        const lower = raw.toLowerCase().replace(/[\s.,!?;:।~_/\-'"()[\]{}]+/g, ' ').trim();
        const INVALID = new Set([
          'hello', 'hi', 'hey', 'namaste', 'namaskar', 'pranam', 'good morning', 'yes', 'no', 'ok', 'okay',
          'talking', 'typing', 'type', 'typed', 'voice', 'patient', 'doctor', 'test', 'unknown', 'none', 'null', 'undefined',
          'manual', 'form', 'keyboard', 'write', 'writing',
          'ନମସ୍କାର', 'ପ୍ରଣାମ', 'ହଁ', 'ନା', 'ହେଲୋ', 'ହାଏ', 'ଲେଖିବା', 'ଲେଖି', 'ଟାଇପିଙ୍ଗ', 'ଟାଇପିଂ', 'ଟାଇପ୍', 'ଟାଇପ', 'ଫର୍ମ',
          'नमस्ते', 'नमस्कार', 'प्रणाम', 'हाँ', 'टाइप', 'टाइपिंग', 'टाईपिंग', 'टाईप', 'लिखकर', 'लिखना', 'फॉर्म',
          'টাইপ', 'টাইপিং', 'লিখে', 'ফরম', 'ফর্ম', 'టైపింగ్', 'టైప్', 'రాయండి', 'டைப்பிங்', 'டைப்', 'எழுது', 'टायपिंग'
        ]);
        if (!INVALID.has(lower) && !isTypingIntent(lower) && raw.length >= 2 && raw.length <= 35 && !/\d|[୦-୯]|[०-९]/.test(raw)) {
          cleanUrlName = raw
            .replace(/^(?:my name is|i am|this is|mera naam hai|mera naam|naam hai|naam|mo naa|mote|mate|amar naam|na peru|yen peyar|mazhe nav|maru naam|nanna hesaru|ente peru|ମୋର ନାମ|ମୋ ନାମ|ମୋ ନାଁ|ମୋର ପୂରା ନାମ|ମୁଁ|ମୁଁ ହେଉଛି|मेरा नाम है|मेरा नाम|नाम है|नाम)\s+/i, '')
            .replace(/\s+(?:achi|heuchi|hela|bolte|hai|hun|hoon|agyan|sir|ji|garu|avargal|ହେଲା|ଅଟେ|ବାବୁ|ଆଜ୍ଞା|है|हूँ|हूं|अछि|आहे|છે|ఉంది|ఇದೆ|ആണ്|is|are|am)$/i, '')
            .replace(/^[,.।!?]+|[,.।!?]+$/g, '')
            .trim();
        }
      }
    }

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (cleanUrlName) {
        setName(cleanUrlName);
        patientNameRef.current = cleanUrlName;
      }

      // If mode is text or user arrived with typing intent as name, switch strictly to text mode
      if (urlMode === 'text' || (urlName && isTypingIntent(urlName))) {
        setIsVoiceAgentActive(false);
        setStep(1);
      } else if (urlMode === 'voice') {
        if (cleanUrlName) {
          currentIntakeSlotRef.current = 'age';
          setIntakeSlot('age');
        } else {
          currentIntakeSlotRef.current = 'name';
          setIntakeSlot('name');
        }
        setIsVoiceAgentActive(true);
        setStep(1);
      }
    });
    return () => {
      active = false;
    };
  }, [searchParams]);

  // Pre-unlock browser audio context on first user interaction so neural voices play instantly
  useEffect(() => {
    const unlockAudio = () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          ctx.resume().then(() => ctx.close()).catch(() => { });
        }
      } catch { }
      if (pendingAudioRef.current) {
        handleUnlockAudio();
      }
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const stopAllVoiceActivityRef = useRef<() => void>(() => { });

  // Register complete voice teardown on component unmount and cross-page navigation
  useEffect(() => {
    isMountedRef.current = true;
    const unregister = registerVoiceCleanup(() => {
      stopAllVoiceActivityRef.current();
    });

    return () => {
      isMountedRef.current = false;
      unregister();
      stopAllVoiceActivityRef.current();
    };
  }, []);

  // Client-side Emergency Symptom Detection (Trilingual: EN, HI, OR)
  const isEmergencyComplaint = (text: string) => {
    if (!text) return false;
    const lower = text.toLowerCase();
    const emergencyTerms = [
      // English
      'chest pain', 'heart attack', 'unconscious', 'not breathing', 'severe bleeding',
      'stroke', 'anaphylaxis', 'choking', 'collapsed', 'seizure', 'cardiac arrest',
      'difficulty breathing', 'shortness of breath',
      // Hindi
      'सीने में दर्द', 'छाती में दर्द', 'दिल का दौरा', 'बेहोश',
      'सांस नहीं आ रही', 'सांस फूलना', 'खून बह रहा', 'दौरा', 'लकवा', 'सीने में भारीपन',
      // Odia
      'ଛାତି ଯନ୍ତ୍ରଣା', 'ଛାତିରେ ଯନ୍ତ୍ରଣା', 'ଶ୍ୱାସକଷ୍ଟ', 'ନିଶ୍ୱାସ ବନ୍ଦ', 'ଅଚେତ',
      'ପ୍ରବଳ ରକ୍ତସ୍ରାବ', 'ହୃଦଘାତ', 'ମୂର୍ଚ୍ଛା', 'ଛାତିରେ ଭାରୀପଣ', 'ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ'
    ];
    return emergencyTerms.some((term) => lower.includes(term.toLowerCase()));
  };

  // Stop all active voice playback and recording streams
  const stopAllVoiceActivity = () => {
    isAssistantSpeakingRef.current = false;
    speechIdRef.current++;
    setAudioLevel(0);

    if (pendingAudioRef.current) {
      try {
        pendingAudioRef.current.pause();
        pendingAudioRef.current.currentTime = 0;
        pendingAudioRef.current.src = '';
      } catch { }
      pendingAudioRef.current = null;
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (idleWatchdogTimerRef.current) {
      clearTimeout(idleWatchdogTimerRef.current);
      idleWatchdogTimerRef.current = null;
    }
    if (hardwareSilenceTimerRef.current) {
      clearTimeout(hardwareSilenceTimerRef.current);
      hardwareSilenceTimerRef.current = null;
    }
    if (hardwareMaxDurationTimerRef.current) {
      clearTimeout(hardwareMaxDurationTimerRef.current);
      hardwareMaxDurationTimerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch { }
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => { });
        }
      } catch { }
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    hardwarePcmBuffersRef.current = [];
    preSpeechRingBufferRef.current = [];
    hasDetectedSpeechRef.current = false;
    firstSpeechTimeRef.current = 0;
    lastSpeechTimeRef.current = 0;
    browserPcmBuffersRef.current = [];

    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = '';
      } catch { }
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch { }
    }
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch { }
      mediaRecorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch { }
      mediaStreamRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch { }
      try {
        recognitionRef.current.stop();
      } catch { }
      recognitionRef.current = null;
    }
    handleVoiceDoneSpeakingRef.current = null;
    if (isMountedRef.current) {
      setVoiceState('ready');
      setLoadingStepText(null);
    }
    // Route-level teardown handles global audio session, do not invalidate internal sessions here
  };

  useEffect(() => {
    stopAllVoiceActivityRef.current = stopAllVoiceActivity;
  });

  // Clean 16-bit PCM WAV Blob Encoder
  const encodeWavBlob = (samples: Float32Array, sampleRate: number): Blob => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + samples.length * 2, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    // fmt sub-chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
    view.setUint16(22, 1, true); // NumChannels (1 = mono)
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate
    view.setUint16(32, 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    // data sub-chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, samples.length * 2, true);

    // Write 16-bit signed PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  // Convert base64 audio string to a binary Blob URL for fast, native browser audio playback
  const base64ToBlobUrl = (base64: string, mimeType: string): string => {
    try {
      const clean = base64.replace(/[\s\r\n]+/g, '');
      const binaryString = window.atob(clean);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.warn('base64ToBlobUrl conversion error, falling back to data URL:', e);
      return `data:${mimeType};base64,${base64}`;
    }
  };

  // Forward hoisted declarations for voice intake loops to satisfy lexical scope in strict TS
  let startListeningVoice: (onTranscript: (text: string) => void) => void;
  let handleVoiceInput: (transcript: string) => Promise<void>;

  // Browser SpeechSynthesis fallback with full Indic regional language support
  // Guarantees voice audio is ALWAYS heard aloud, never playing silence
  const fallbackBrowserSpeak = (text: string, onDone?: () => void, onStart?: () => void) => {
    if (!isMountedRef.current) return;
    const currentSessionId = getAudioSessionId();
    let completed = false;
    let fallbackTimer: any = null;
    let startEmitted = false;

    const emitStart = () => {
      if (!isMountedRef.current || !isSessionActive(currentSessionId)) return;
      if (startEmitted) return;
      startEmitted = true;
      setLoadingStepText(null);
      if (onStart) onStart();
    };

    const finalize = () => {
      if (completed) return;
      completed = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      setLoadingStepText(null);
      isAssistantSpeakingRef.current = false;
      lastAiSpeechEndedAtRef.current = nowMs();
      if (!isMountedRef.current || !isSessionActive(currentSessionId)) return;
      if (onDone) {
        onDone();
      } else if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
        startListeningVoice(handleVoiceInputRef.current);
      } else {
        voiceStateRef.current = 'ready';
        setVoiceState('ready');
      }
    };

    emitStart();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = BCP47_TAGS[language] || 'en-IN';
        utterance.rate = 0.95;
        utterance.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices() || [];
        const langPrefix = BCP47_TAGS[language]?.split('-')[0] || (language === 'or' ? 'hi' : language);
        const allowedNames = ['Google हिन्दी', 'Google UK English Female', 'Microsoft Swara', 'Microsoft Neerja'];
        const naturalVoice = voices.find(
          (v) => allowedNames.some((name) => v.name.includes(name)) && v.lang.toLowerCase().startsWith(langPrefix.toLowerCase())
        );
        if (!naturalVoice) {
          finalize();
          return;
        }
        utterance.voice = naturalVoice;

        utterance.onstart = () => {
          if (!isMountedRef.current || !isSessionActive(currentSessionId)) {
            try { window.speechSynthesis.cancel(); } catch { }
            return;
          }
          emitStart();
        };
        utterance.onend = () => {
          finalize();
        };
        utterance.onerror = (e) => {
          console.warn('SpeechSynthesis error:', e);
          finalize();
        };

        if (!isMountedRef.current || !isSessionActive(currentSessionId)) return;
        fallbackTimer = setTimeout(finalize, Math.min(Math.max(text.length * 55, 3000), 7000));
        window.speechSynthesis.speak(utterance);
        return;
      } catch (err) {
        console.warn('SpeechSynthesis initialization error:', err);
      }
    }

    fallbackTimer = setTimeout(finalize, 2000);
  };

  // Speak aloud via Sarvam AI Bulbul Voice Engine with binary Blob streaming
  const speakText = async (text: string, onDone?: () => void) => {
    if (!isMountedRef.current) return;
    stopAllVoiceActivity();
    const currentSpeechId = speechIdRef.current;
    const currentSessionId = getAudioSessionId();
    isAssistantSpeakingRef.current = true;
    voiceStateRef.current = 'processing';

    // Clean markdown symbols, bullets, brackets, and structural punctuation for smooth human speech
    const cleanSpokenText = text
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
    const spokenText = cleanSpokenText || text;

    // Show preparing voice state until audio is loaded
    setVoiceState('processing');
    setLoadingStepText(
      language === 'or'
        ? 'ଡାକ୍ତର ଏଆଇ ସ୍ୱର ପ୍ରସ୍ତୁତ କରୁଛନ୍ତି...'
        : language === 'hi'
          ? 'डॉक्टर एआई आवाज़ तैयार कर रहे हैं...'
          : 'JanSaathi AI is preparing speech...'
    );

    let completed = false;
    let safetyTimer: any = null;
    let speechRevealed = false;
    let activeBlobUrl: string | null = null;

    // Master safety watchdog: if synthesis or playback hangs for > 12.0s, force recover cleanly
    const synthesisWatchdog = setTimeout(() => {
      if (speechIdRef.current === currentSpeechId && (voiceStateRef.current === 'processing' || isAssistantSpeakingRef.current)) {
        console.warn('speakText master watchdog triggered; starting listening.');
        setLoadingStepText(null);
        isAssistantSpeakingRef.current = false;
        lastAiSpeechEndedAtRef.current = nowMs();
        if (onDone) {
          onDone();
        } else if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
          startListeningVoice(handleVoiceInputRef.current);
        } else {
          voiceStateRef.current = 'ready';
          setVoiceState('ready');
        }
      }
    }, 12000);

    const cleanupAudioBlob = () => {
      if (activeBlobUrl) {
        try {
          URL.revokeObjectURL(activeBlobUrl);
        } catch { }
        activeBlobUrl = null;
      }
    };

    const finalize = () => {
      if (completed) return;
      completed = true;
      if (synthesisWatchdog) clearTimeout(synthesisWatchdog);
      cleanupAudioBlob();
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      setLoadingStepText(null);
      isAssistantSpeakingRef.current = false;
      lastAiSpeechEndedAtRef.current = nowMs();

      if (!isMountedRef.current || speechIdRef.current !== currentSpeechId || !isSessionActive(currentSessionId)) {
        cleanupAudioBlob();
        return;
      }
      // Clear mic buffers to eliminate acoustic reverberation from assistant speaker
      hardwarePcmBuffersRef.current = [];
      preSpeechRingBufferRef.current = [];
      hasDetectedSpeechRef.current = false;
      if (hardwareSilenceTimerRef.current) {
        clearTimeout(hardwareSilenceTimerRef.current);
        hardwareSilenceTimerRef.current = null;
      }
      // 350ms acoustic echo cooldown before enabling mic listening
      setTimeout(() => {
        if (!isMountedRef.current || speechIdRef.current !== currentSpeechId || !isSessionActive(currentSessionId)) {
          return;
        }
        isAssistantSpeakingRef.current = false;
        setLoadingStepText(null);
        if (onDone) {
          onDone();
        } else if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
          startListeningVoice(handleVoiceInputRef.current);
        } else {
          voiceStateRef.current = 'ready';
          setVoiceState('ready');
        }
      }, 350);
    };

    // Reveal text in sync when high-definition neural audio starts playing
    const markSpeakingStarted = () => {
      if (!isMountedRef.current || speechIdRef.current !== currentSpeechId || !isSessionActive(currentSessionId)) return;
      if (synthesisWatchdog) clearTimeout(synthesisWatchdog);
      if (speechRevealed) return;
      speechRevealed = true;
      isAssistantSpeakingRef.current = true;
      voiceStateRef.current = 'assistant_speaking';
      setVoiceState('assistant_speaking');
      setAgentSpeakingText(spokenText);
      setVoiceAgentStatusText(spokenText);
      setLoadingStepText(null);
      if (
        conversationHistoryRef.current.length === 0 ||
        conversationHistoryRef.current[conversationHistoryRef.current.length - 1].text !== spokenText
      ) {
        addConversationMessage('ai', spokenText);
      }
    };

    try {
      const savedSarvamKey = localStorage.getItem('jansaathi_sarvam_key') || undefined;
      const savedElevenKey = localStorage.getItem('jansaathi_elevenlabs_key') || undefined;
      const savedVoiceId = localStorage.getItem('jansaathi_elevenlabs_voice_id') || undefined;
      // Per user instruction: Indian regional languages always use Sarvam AI Bulbul
      const preferredProvider = 'sarvam';

      const res = await synthesizeSpeech(
        spokenText,
        language,
        savedSarvamKey,
        undefined,
        preferredProvider,
        savedElevenKey,
        savedVoiceId
      );

      if (!isMountedRef.current || speechIdRef.current !== currentSpeechId || !isSessionActive(currentSessionId)) {
        if (synthesisWatchdog) clearTimeout(synthesisWatchdog);
        setLoadingStepText(null);
        isAssistantSpeakingRef.current = false;
        cleanupAudioBlob();
        return;
      }

      if (res && res.status === 'success' && res.audio) {
        const mimeType = res.format || (res.provider === 'sarvam' ? 'audio/wav' : 'audio/mp3');
        const blobUrl = base64ToBlobUrl(res.audio, mimeType);
        activeBlobUrl = blobUrl;
        const audio = new Audio(blobUrl);
        registerActiveAudio(audio);
        audioRef.current = audio;
        audio.volume = 1.0;
        audio.muted = false;
        audio.onended = finalize;
        audio.onerror = (audioErr) => {
          console.warn('HTML5 Audio playback error:', audioErr);
          cleanupAudioBlob();
          if (speechIdRef.current === currentSpeechId) {
            finalize();
          }
        };

        audio.onloadedmetadata = () => {
          if (safetyTimer) clearTimeout(safetyTimer);
          const durSec = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 10;
          safetyTimer = setTimeout(finalize, Math.round((durSec + 8.0) * 1000));
        };

        // 18s fallback safety timer for full human sentences
        safetyTimer = setTimeout(finalize, 18000);

        audio.onplay = () => {
          if (!isMountedRef.current || speechIdRef.current !== currentSpeechId || !isSessionActive(currentSessionId)) {
            try { audio.pause(); } catch { }
            return;
          }
          setIsAudioBlocked(false);
          markSpeakingStarted();
        };

        try {
          if (!isMountedRef.current || speechIdRef.current !== currentSpeechId || !isSessionActive(currentSessionId)) {
            cleanupAudioBlob();
            return;
          }
          audio.volume = 1.0;
          audio.muted = false;
          await audio.play();
          setIsAudioBlocked(false);
          markSpeakingStarted();
          return;
        } catch (playErr: any) {
          console.warn('audio.play() blocked by browser autoplay policy:', playErr);
          if (synthesisWatchdog) clearTimeout(synthesisWatchdog);
          setLoadingStepText(null);
          markSpeakingStarted();
          pendingAudioRef.current = audio;
          setIsAudioBlocked(true);
          // If browser blocked autoplay, reveal text and automatically start listening after 2.0s
          // so patient can simply answer and hands-free flow proceeds smoothly!
          setTimeout(() => {
            if (isMountedRef.current && isVoiceAgentActiveRef.current && !isVoicePausedRef.current && voiceStateRef.current !== 'listening') {
              isAssistantSpeakingRef.current = false;
              lastAiSpeechEndedAtRef.current = nowMs();
              if (onDone) {
                onDone();
              } else {
                startListeningVoice(handleVoiceInputRef.current);
              }
            }
          }, 1800);
          return;
        }
      }
    } catch (ttsErr) {
      console.warn('Neural TTS synthesis error, using fallback:', ttsErr);
    }

    if (isMountedRef.current && isSessionActive(currentSessionId)) {
      fallbackBrowserSpeak(spokenText, finalize, markSpeakingStarted);
    }
  };

  // Clinical symptom & medical trouble stopwords across all supported Indian languages
  // Ensures medical troubles, symptoms, and pain descriptions are NEVER mistaken for patient names!
  const CLINICAL_SYMPTOM_WORDS = [
    // Odia
    'ଛାତି', 'ବ୍ୟଥା', 'ଯନ୍ତ୍ରଣା', 'କାଟୁଛି', 'ବିନ୍ଧୁଛି', 'ବିନ୍ଧା', 'ପେଟ', 'ମୁଣ୍ଡ', 'ଜ୍ୱର', 'କାଶ',
    'ଥଣ୍ଡା', 'ବାନ୍ତି', 'ଝାଡ଼ା', 'ଦେହ', 'ଅସୁବିଧା', 'କଷ୍ଟ', 'ରୋଗ', 'ସମସ୍ୟା', 'ରକ୍ତ', 'ଘା',
    'ପୋଡ଼ା', 'ଶ୍ୱାସ', 'ଶ୍ୱାସକଷ୍ଟ', 'ଦୁର୍ବଳ', 'ଭଲ', 'ଲାଗୁନାହିଁ', 'ଲାଗୁଛି', 'ହେଉଛି', 'ହେଲାଣି',
    'ଦିନ', 'ସପ୍ତାହ', 'ମାସ', 'ଘଣ୍ଟା', 'ପାଖାପାଖି', 'ଏହି', 'ଗୋଟେ', 'ଦୁଇ', 'ପ୍ରବଳ', 'ବହୁତ',
    'ଚିକିତ୍ସା', 'ଔଷଧ', 'ଡାକ୍ତର', 'ହସ୍ପିଟାଲ', 'ରୋଗୀ', 'ରିପୋର୍ଟ', 'ପ୍ରେସକ୍ରିପସନ୍', 'ବିଷ',
    // Bengali & Assamese
    'ছাতি', 'বুক', 'বুকে', 'যন্ত্রণা', 'ব্যাথা', 'ব্যথা', 'কষ্ট', 'অসুবিধা', 'সমস্যা', 'জ্বর',
    'কাশি', 'কফ', 'সর্দি', 'ঠান্ডা', 'পেট', 'পেটে', 'মাথা', 'মাথাব্যথা', 'বমি', 'দুর্বল',
    'মাথাঘোরা', 'শ্বাসকষ্ট', 'গলা', 'হাড়', 'রক্ত', 'অসুস্থ', 'অসুখ', 'বেদনা', 'বিষ', 'জ্বৰ', 'কাহ',
    'হচ্ছে', 'লাগছে', 'ওষুধ', 'ডাক্তার',
    // Hindi & Marathi
    'दर्द', 'तकलीफ', 'परेशानी', 'बीमारी', 'समस्या', 'पेट', 'छाती', 'सीने', 'सिर', 'बुखार',
    'खांसी', 'जुकाम', 'उल्टी', 'दस्त', 'कमजोरी', 'दिन', 'हफ्ते', 'महीने', 'घंटे', 'दवा',
    'डॉक्टर', 'अस्पताल', 'मरीज', 'तबीयत', 'खराब', 'हो रहा', 'लग रहा',
    'त्रास', 'दुखणे', 'कळ', 'ताप', 'खोकला', 'सर्दी', 'पोट', 'डोकं', 'घसा',
    // Telugu, Tamil, Gujarati, Kannada, Malayalam, Punjabi, Urdu
    'నొప్పి', 'బాధ', 'సమస్య', 'జ్వరం', 'దగ్గు', 'ఛాతీ', 'కడుపు', 'తల',
    'வலி', 'வேதனை', 'பிரச்சனை', 'காய்ச்சல்', 'இருமல்', 'நெஞ்சு', 'வயிறு',
    'દુખાવો', 'તકલીફ', 'તાવ', 'ખાંસી', 'પેટ', 'છાતી',
    'ನೋವು', 'ಸಮಸ್ಯೆ', 'ಜ್ವರ', 'ಕೆಮ್ಮು', 'ಎದೆ', 'ಹೊಟ್ಟೆ',
    'വേദന', 'പനി', 'ചുമ', 'നെഞ്ച്', 'വയറ്',
    'ਦਰਦ', 'ਤਕਲੀਫ਼', 'ਬੁਖ਼ਾਰ', 'ਖੰਘ', 'ਛਾਤੀ', 'ਢਿੱਡ',
    'درد', 'تکلیف', 'بخار', 'کھانسی', 'سینے', 'پیٹ',
    // English
    'pain', 'ache', 'hurting', 'hurt', 'fever', 'cough', 'cold', 'vomit', 'vomiting',
    'chest', 'stomach', 'headache', 'throat', 'trouble', 'problem', 'discomfort',
    'severe', 'mild', 'days', 'weeks', 'months', 'hours', 'illness', 'feeling',
    'sick', 'doctor', 'hospital', 'medicine', 'patient', 'symptom', 'symptoms'
  ];

  const isClinicalOrSymptomText = (text: string | null | undefined): boolean => {
    if (!text) return false;
    const lower = text.toLowerCase();
    return CLINICAL_SYMPTOM_WORDS.some((word) => lower.includes(word.toLowerCase()));
  };

  const hasClinicalSymptomKeyword = (text: string | null | undefined): boolean => {
    if (!text) return false;
    const s = text.toLowerCase().trim();
    if (s.length < 2) return false;
    if (CLINICAL_SYMPTOM_WORDS.some((word) => s.includes(word.toLowerCase()))) {
      return true;
    }
    return /(?:ଜ୍ୱର|କାଶ|କଫ|ଥଣ୍ଡା|କଷ୍ଟ|ଯନ୍ତ୍ରଣା|ଅସୁବିଧା|ବିନ୍ଧା|ବିନ୍ଧୁଛି|କାଟୁଛି|ପେଟ|ମୁଣ୍ଡ|ଛାତି|ବାନ୍ତି|ଝାଡ଼ା|ଦୁର୍ବଳ|ଚକ୍କର|ଘା|ପୋଡ଼ା|ଶ୍ୱାସ|ଶ୍ୱାସକଷ୍ଟ|ଗଳା|କଣ୍ଠ|ହାଡ଼|ଗଣ୍ଠି|ଖଣ୍ଡିଆ|ରକ୍ତ|ବ୍ୟଥା|ଦେହ\s*ଖରାପ|ଅସୁସ୍ଥ|ଦାନ୍ତ|କାନ|ଆଖି|বুক|বুকে|ছাতি|যন্ত্রণা|ব্যাথা|ব্যথা|কষ্ট|অসুবিধা|সমস্যা|জ্বর|কাশি|কফ|পেট|মাথা|বমি|দুর্বল|শ্বাসকষ্ট|दर्द|तकलीफ|बीमारी|समस्या|बुखार|खांसी|जुकाम|उल्टी|दस्त|कमजोरी|चक्कर|पेट|सीने|छाती|सिरदर्द|सिर|गला|बदन|fever|cough|cold|pain|ache|headache|stomach|chest|vomit|diarrhea|dizzy|weakness|breath|throat|hurt|sore|infection|wound|bleeding|నొప్పి|வலி|દુખાવો|ನೋವು|വേദന|ਦਰਦ|درد)/i.test(s);
  };

  const isPureDemographicIntro = (text: string | null | undefined): boolean => {
    if (!text) return false;
    const s = text.toLowerCase();
    const hasIntro = /(?:ମୋର\s*ନାମ|ମୋ\s*ନାମ|ନାମ\s*ହେଲା|ନାଁ|আমার\s*নাম|আমার\s*বয়স|mera\s*naam|my\s*name\s*is|नाम\s*है|ମୋ\s*ବୟସ|ମୋର\s*ବୟସ|ଉମ୍ର|उम्र|বয়স|বয়স|age|years\s*old|ଲିଙ୍ଗ|ପୁରୁଷ|ମହିଳା|gender|male|female|পুরুষ|মহিলা|হোয়াটসঅ্যাপ|ହ୍ୱାଟସ୍ଆପ୍|whatsapp|mobile|phone|নম্বর|ନମ୍ବର)/i.test(s);
    return hasIntro && !hasClinicalSymptomKeyword(text);
  };

  const isGenuineClinicalSymptom = (text: string | null | undefined, checkProblemSlot: boolean = true): boolean => {
    if (!text) return false;
    const s = text.toLowerCase().trim();
    if (hasClinicalSymptomKeyword(text)) {
      return true;
    }
    // Any speech during the problem intake slot that isn't a pure intro, greeting, or yes/no is a clinical statement
    if (checkProblemSlot && (currentIntakeSlotRef.current === 'problem' || intakeSlot === 'problem')) {
      if (!isPureDemographicIntro(text) && !isGreetingOnly(text) && !isAffirmativeOrNegative(text) && s.length >= 3) {
        return true;
      }
    }
    return false;
  };

  const isGenderWord = (text: string | null | undefined): boolean => {
    if (!text) return false;
    return /(?:ପୁରୁଷ|ପୁରୁସ|ପୁରୁଶ|ମହିଳା|ସ୍ତ୍ରୀ|ଝିଅ|ଭଉଣୀ|ନାରୀ|ବାବୁ|ଭାଇ|ପୁଅ|पुरुष|महिला|स्त्री|लड़का|लड़की|পুরুষ|মহিলা|ছেলে|মেয়ে|মেয়ে|নর|मर्द|male|female|other|transgender|man|woman|boy|girl)/i.test(text);
  };

  const isAgeOrNumberWord = (text: string | null | undefined): boolean => {
    if (!text) return false;
    return /(?:ବୟସ|ବର୍ଷ|ଉମ୍ର|उम्र|साल|वर्ष|বয়স|বছর|age|years?|yr|yrs|\d)/i.test(text);
  };

  const isAffirmativeOrNegative = (text: string | null | undefined): boolean => {
    if (!text) return false;
    return /^(?:ହଁ|ହାଁ|ନା|ନାହିଁ|ନାଇଁ|ନାହି|କିଛି|କିଛିନାହିଁ|হ্যাঁ|হ্যা|না|কিছু|কিছুনা|নেই|हाँ|ना|नहीं|कुछ|कुछनहीं|जी|जीहाँ|yes|no|none|nope|yeah|yep|ok|okay)$/i.test(text.trim());
  };

  // Trilingual WhatsApp/Mobile phone number extractor (Odia numerals, Hindi numerals, spoken words, standard 10-digit)
  const parsePhoneNumber = (transcript: string): string => {
    if (!transcript) return '';
    let norm = normalizeIndicNumerals(transcript);

    const wordToDigitMap: Record<string, string> = {
      'ଶୂନ': '0', 'ଶୂନ୍ୟ': '0', 'ଏକ': '1', 'ଦୁଇ': '2', 'ତିନି': '3', 'ଚାରି': '4', 'ପାଞ୍ଚ': '5', 'ଛଅ': '6', 'ଛ': '6', 'ସାତ': '7', 'ଆଠ': '8', 'ନଅ': '9',
      'शून्य': '0', 'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4', 'पाँच': '5', 'पांच': '5', 'छह': '6', 'सात': '7', 'आठ': '8', 'नौ': '9',
      'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
    };

    const tokens = norm.split(/[\s,।!?.:;-]+/);
    const mapped = tokens.map((tok) => wordToDigitMap[tok.trim()] !== undefined ? wordToDigitMap[tok.trim()] : tok);
    norm = mapped.join(' ');
    const cleaned = norm.replace(/[\s-]+/g, '');
    const match = cleaned.match(/(?:\+?91|0)?([6-9]\d{9})/);
    if (match) return match[1];

    const allDigits = (norm.match(/\d/g) || []).join('');
    if (allDigits.length >= 10) {
      const dm = allDigits.match(/(?:\+?91|0)?([6-9]\d{9})/);
      if (dm) return dm[1];
    }
    return '';
  };

  const isGreetingOnly = (text: string): boolean => {
    if (!text) return false;
    const cleanTxt = text.trim().toLowerCase().replace(/[.,!?;:।~_/\-'"()[\]{}]+/g, " ").replace(/\s+/g, " ").trim();
    const greetings = [
      "good morning", "good afternoon", "good evening", "good day", "good night",
      "morning", "evening", "afternoon",
      "hello", "hi", "hey", "greetings", "welcome",
      "namaste", "namaskar", "pranam", "radhe radhe", "jai jagannath", "jay jagannath",
      "ନମସ୍କାର", "ପ୍ରଣାମ", "ଜୟ ଜଗନ୍ନାଥ", "ହେଲୋ", "ହାଏ", "ନମସ୍ତେ", "ଶୁଭ ସକାଳ", "ଶୁଭ ସନ୍ଧ୍ୟା",
      "नमस्ते", "प्रणाम", "नमस्कार", "जय जगन्नाथ", "हेलो", "हाय", "गुड मॉर्निंग", "गुड आफ्टरनून", "गुड इवनिंग", "शुभ प्रभात"
    ];
    return greetings.some((g) => cleanTxt === g || cleanTxt === g.replace(/\s+/g, ""));
  };

  interface ExtractedNameResult {
    name: string;
    isCorrection: boolean;
  }

  // Robust trilingual patient name extractor and correction detector
  const extractNameAndCorrection = (transcript: string, isAskingName: boolean): ExtractedNameResult => {
    if (!transcript || isTypingIntent(transcript)) return { name: '', isCorrection: false };
    const t = transcript.trim();
    const isCorrectionIntent = /(?:ନୁହେଁ|ନୁହେ|ନାଇଁ|ନାହିଁ|नहीं|ना|not|wrong|गलत|ଭୁଲ|correct|correction)/i.test(t);

    const clean = (n: string | null | undefined): string => {
      if (!n) return '';
      let res = n.trim();
      res = res.replace(/^(?:good\s*morning|good\s*afternoon|good\s*evening|hello|hi|hey|namaste|namaskar|pranam|jai\s*jagannath|ନମସ୍କାର|ପ୍ରଣାମ|ଜୟ\s*ଜଗନ୍ନାଥ|ହେଲୋ|ହାଏ|ନମସ୍ତେ|नमस्ते|प्रणाम|नमस्कार|गुड\s*मॉर्निंग)\s*[,।!?]?\s*/gi, '');
      res = res.replace(/^(?:is|it\s*is|my\s*name\s*is|name\s*is|ମୋ\s*ନାମ|ମୋ\s*ନାଁ|ମୋର\s*ନାମ|ମୋ\s*ନାମଟି|ନାମ|ନାଁ|ମୁଁ\s*ହେଉଛି|ମୁଁ|मेरा\s*नाम\s*है|मेरा\s*नाम|नाम)\s+/gi, '');
      res = res.replace(/^(?:ହେଲା|ହେଉଛି|ଅଟେ|ବା|है|is|are)\s+/gi, '');
      res = res.replace(/\s+(?:କରନ୍ତୁ|ରଖନ୍ତୁ|ଦିଅନ୍ତୁ|କର|କରି|करो|कर|करदो|ଅଟେ|ହେଉଛି|ହେଲା|ହେଲେ|କହୁଛି|କହୁଚି|ହଁ|है|हूँ|हूं|please|ji|babu|ଆଜ୍ଞା|ବାବୁ|अटे)$/gi, '');
      res = res.split(/[,।!?.:;-]|\s+(?:ଏବଂ|ଓ|ଆଉ|ବୟସ|aur|and|my\s*age)\s+/i)[0].trim();
      res = res.replace(/^[ ,.।!?]+|[ ,.।!?]+$/g, '');

      if (
        res.length >= 2 &&
        res.length <= 30 &&
        !isGenderWord(res) &&
        !isAgeOrNumberWord(res) &&
        !isClinicalOrSymptomText(res) &&
        !isAffirmativeOrNegative(res) &&
        !isGreetingOnly(res)
      ) {
        return res;
      }
      return '';
    };

    // 0. Explicit change command: "change my name to X" / "update name to X" / "ମୋ ନାମ ବଦଳାଇ X କରନ୍ତୁ" / "ନାମ X କରନ୍ତୁ" / "नाम बदलकर X कर दो"
    const mChange = t.match(/(?:(?:change|update|make)\s+(?:my\s+)?name\s+(?:to|as)?|call\s+me|(?:ମୋର|ମୋ)?\s*ନାମ\s*(?:ବଦଳାଇ|ସୁଧାରି)?|ନାମ\s*(?:ବଦଳାଇ|ସୁଧାରି)?|(?:मेरा\s+)?नाम\s*(?:बदलकर|बदल\s+के|सुधार\s+कर)?)\s*([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})\s*(?:କରନ୍ତୁ|ରଖନ୍ତୁ|ଦିଅନ୍ତୁ|करो|कर\s*दो)?/i);
    if (mChange && mChange[1]) {
      const cand = clean(mChange[1]);
      if (cand) return { name: cand, isCorrection: true };
    }

    // 1. English correction: 'is not X, (it is / it's) Y' or 'not X, (it is) Y'
    const mEn = t.match(/(?:is\s+not|not|isn't)\s+[^\s,।0-9]+(?:\s+[^\s,।0-9]+)?\s*[,।!?]?\s*(?:(?:but|it\s+is|it's|my\s+name\s+is|name\s+is)\s+)?([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})/i);
    if (mEn && mEn[1]) {
      const cand = clean(mEn[1]);
      if (cand) return { name: cand, isCorrection: true };
    }

    // 2. Indic correction: 'X nuhein Y' / 'X nahi Y'
    const mIndic = t.match(/[^\s,।0-9]+(?:\s+[^\s,।0-9]+)?\s+(?:ନୁହେଁ|ନୁହେ|ନାହିଁ|ନାଇଁ|नहीं)\s*[,।!?]?\s*(?:(?:ମୋ\s*ନାମ|ମୋ\s*ନାଁ|ମୋର\s*ନାମ|मेरा\s*नाम|ନାମ)\s+)?([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})/i);
    if (mIndic && mIndic[1]) {
      const cand = clean(mIndic[1]);
      if (cand) return { name: cand, isCorrection: true };
    }

    // 3. Rejection followed by name intro: 'nahi, mo nama X' or 'No, my name is X' or 'bhul, mo nama X'
    const mRej = t.match(/(?:ନାହିଁ|ନାଇଁ|no|nahin|nahi|नहीं|ଭୁଲ|गलत|wrong)\s*[,।!?]?\s*(?:ମୋ\s*ନାମ|ମୋ\s*ନାଁ|ମୋର\s*ନାମ|ମୁଁ\s*ହେଉଛି|ମୁଁ|मेरा\s*नाम\s*है|मेरा\s*नाम|my\s*name\s*is|name\s*is)\s+([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})/i);
    if (mRej && mRej[1]) {
      const cand = clean(mRej[1]);
      if (cand) return { name: cand, isCorrection: true };
    }

    // 4. Standard intro: 'mo nama X' / 'mera naam X' / 'my name is X' / 'mu X kahuchi' / 'mo nama hela X' / 'moro sampurna nama X'
    const mIntro = t.match(/(?:(?:ମୋର|ମୋ)\s+(?:ସମ୍ପୂର୍ଣ୍ଣ\s+|ପୂରା\s+|ଶୁଭ\s+)?(?:ନାମ|ନାଁ)|ମୋ\s*ଶୁଭ\s*ନାମ|ମୁଁ\s*ହେଉଛି|ମୁଁ|(?:मेरा|मेरा\s+पूरा)\s+नाम|my\s+(?:full\s+)?name(?:\s+is)?|i\s+am|i'm)\s*(?:ହେଲା|ହେଉଛି|ଅଟେ|ବା|है|होगा|is|:|–|-)?\s*([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})/i);
    if (mIntro && mIntro[1]) {
      const cand = clean(mIntro[1]);
      if (cand) return { name: cand, isCorrection: isCorrectionIntent || !isAskingName };
    }

    // 5. If assistant is currently asking for name in Step 1, take direct 1-3 word name
    if (isAskingName) {
      const words = t.split(/[\s,।!?.]+/).filter((w) => w.length >= 2);
      if (words.length >= 1 && words.length <= 3) {
        const cand = clean(words.join(' '));
        if (cand) return { name: cand, isCorrection: false };
      }
    }

    return { name: '', isCorrection: false };
  };

  // Robust trilingual patient name and age extractor
  // Strictly isolates personal names from symptoms and prevents arbitrary transcripts from poisoning name fields
  const parsePatientDemographics = (
    transcript: string,
    lang: string
  ): { name: string; age: number | ''; gender: 'male' | 'female' | 'other' | ''; contact: string } => {
    const na = parsePatientNameAndAge(transcript, lang);
    const g = normalizeGender(transcript);
    const c = parsePhoneNumber(transcript);
    return {
      name: na.name,
      age: na.age,
      gender: g,
      contact: c,
    };
  };

  const parsePatientNameAndAge = (
    transcript: string,
    _lang: string
  ): { name: string; age: number | '' } => {
    // 1. Normalize Indic numerals to ASCII digits
    const normalized = normalizeIndicNumerals(transcript);

    const wordToNumMap: Record<string, number> = {
      // Odia numerals
      'ଏକ': 1, 'ଦୁଇ': 2, 'ତିନି': 3, 'ଚାରି': 4, 'ପାଞ୍ଚ': 5, 'ଛଅ': 6, 'ସାତ': 7, 'ଆଠ': 8, 'ନଅ': 9, 'ଦଶ': 10,
      'ଏଗାର': 11, 'ବାର': 12, 'ତେର': 13, 'ଚଉଦ': 14, 'ପନ୍ଦର': 15, 'ଷୋହଳ': 16, 'ସତର': 17, 'ଅଠର': 18, 'ଉଣେଇଶ': 19,
      'କୋଡିଏ': 20, 'କୋଡ଼ିଏ': 20, 'ଏକୋଇଶି': 21, 'ବାଇଶି': 22, 'ତେଇଶି': 23, 'ଚବିଶ': 24, 'ପଚିଶ': 25, 'ଛବିଶ': 26, 'ସତାଇଶ': 27, 'ଅଠାଇଶ': 28, 'ଅଣତିରିଶ': 29,
      'ତିରିଶ': 30, 'ଏକତିରିଶ': 31, 'ବତିଶ': 32, 'ପଇଁତିରିଶ': 35, 'ଚାଳିଶ': 40, 'ପଇଁଚାଳିଶ': 45, 'ପଞ୍ଚଚାଳିଶ': 45, 'ପଚାଶ': 50,
      'ପଚପନ': 55, 'ଷାଠିଏ': 60, 'ପାଞ୍ଚଷଠି': 65, 'ସତୁରୀ': 70, 'ପଞ୍ଚସ୍ତରୀ': 75, 'ଅଶୀ': 80, 'ପଞ୍ଚାଅଶୀ': 85, 'ନବ୍ବେ': 90,
      // Hindi numerals
      'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
      'ग्यारह': 11, 'बारह': 12, 'तेरह': 13, 'चौदह': 14, 'पंद्रह': 15, 'सोलह': 16, 'सत्रह': 17, 'अठारह': 18, 'उन्नीस': 19,
      'बीस': 20, 'इक्कीस': 21, 'बाईस': 22, 'तेईस': 23, 'चौबीस': 24, 'पच्चीस': 25, 'तीस': 30, 'पैंतीस': 35, 'चालीस': 40, 'पैंतालीस': 45, 'पचास': 50,
      'पचपन': 55, 'साठ': 60, 'पैंसठ': 65, 'सत्तर': 70, 'पचहत्तर': 75, 'अस्सी': 80, 'पचासी': 85, 'नब्बे': 90,
      // English compound & base numerals
      'twenty-one': 21, 'twenty-two': 22, 'twenty-five': 25, 'thirty-five': 35,
      'forty-five': 45, 'fifty-five': 55, 'sixty-five': 65, 'seventy-five': 75,
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
      'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
      'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
    };

    const engTens: Record<string, number> = {
      twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    };
    const engOnes: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    };

    let extractedAge: number | '' = '';
    const tokens = normalized.toLowerCase().split(/[\s,।.-]+/).filter(Boolean);
    const durationWords = ['ଦିନ', 'ଦିନର', 'ଦିନହେଲା', 'ସପ୍ତାହ', 'ମାସ', 'दिन', 'दिनों', 'महीने', 'day', 'days', 'week', 'weeks', 'month', 'months', 'hours', 'hour'];
    for (let i = 0; i < tokens.length; i++) {
      const cleanToken = tokens[i].trim();
      const nextW = (tokens[i + 1] || '').toLowerCase();
      if (engTens[cleanToken] !== undefined && engOnes[nextW] !== undefined) {
        const afterCompound = (tokens[i + 2] || '').toLowerCase();
        if (!durationWords.includes(afterCompound)) {
          extractedAge = engTens[cleanToken] + engOnes[nextW];
          break;
        }
      }
      if (wordToNumMap[cleanToken] !== undefined && !durationWords.includes(nextW)) {
        extractedAge = wordToNumMap[cleanToken];
        break;
      }
    }

    if (!extractedAge) {
      const digitMatch = normalized.match(/(?:ବୟସ|ମୋ ବୟସ|ଉମ୍ର|उम्र|age|years? old)?\s*(\d{1,3})\s*(?:ବର୍ଷ|years?|yr|yrs|varsh|saal)?(?!\s*(?:ଦିନ|दिन|days?|hours?))/i);
      if (digitMatch && digitMatch[1]) {
        const parsed = parseInt(digitMatch[1], 10);
        if (parsed > 0 && parsed <= 125) {
          extractedAge = parsed;
        }
      }
    }

    const isAskingName = currentIntakeSlotRef.current === 'name' || (!patientNameRef.current && step === 1);
    const nameResult = extractNameAndCorrection(transcript, isAskingName);
    return {
      name: nameResult.name,
      age: extractedAge,
    };
  };

      // Immediate stop when user finishes speaking (tapping Done Speaking)
      const handleVoiceDoneSpeaking = () => {
        if (handleVoiceDoneSpeakingRef.current) {
          handleVoiceDoneSpeakingRef.current();
        } else {
          stopAllVoiceActivity();
        }
      };

      // Process streaming 16kHz PCM audio packets from ESP32-S3 INMP441 Microphone over USB Serial
      // Incorporates Dynamic Noise Floor Tracking & Adaptive Speech Gate to eliminate room noise & perpetual listening loops
      const handleIncomingHardwareAudioChunk = (b64Pcm: string, _isSpeaking: boolean) => {
        // HARD ECHO GATE: Discard everything if unmounted or assistant is preparing, speaking, or in echo cooldown
        if (
          !isMountedRef.current ||
          isTranscribingHardwareRef.current ||
          audioSourceRef.current !== 'hardware' ||
          isAssistantSpeakingRef.current ||
          voiceStateRef.current === 'assistant_speaking' ||
          voiceStateRef.current === 'processing' ||
          voiceStateRef.current === 'ready' ||
          voiceStateRef.current === 'paused' ||
          !isVoiceAgentActiveRef.current ||
          isVoicePausedRef.current
        ) {
          hardwarePcmBuffersRef.current = [];
          preSpeechRingBufferRef.current = [];
          hasDetectedSpeechRef.current = false;
          if (hardwareSilenceTimerRef.current) {
            clearTimeout(hardwareSilenceTimerRef.current);
            hardwareSilenceTimerRef.current = null;
          }
          return;
        }

        if (voiceStateRef.current !== 'listening') return;

        try {
          const raw = atob(b64Pcm);
          const u8 = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
          const i16 = new Int16Array(u8.buffer);
          const f32 = new Float32Array(i16.length);
          for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768.0;

          // 1. Calculate chunk energy metrics
          let sumSq = 0;
          let peak = 0;
          for (let i = 0; i < f32.length; i++) {
            const val = f32[i];
            sumSq += val * val;
            const abs = Math.abs(val);
            if (abs > peak) peak = abs;
          }
          const chunkRms = Math.sqrt(sumSq / f32.length);

          // 2. Calibrate ambient noise floor during first 400ms: noiseFloor = clamp(avgRms * 1.6, 0.025, 0.08)
          const now = nowMs();
          const elapsedListenMs = now - (listenStartTimeRef.current || now);
          if (!hasDetectedSpeechRef.current && elapsedListenMs <= 400) {
            noiseCalibrationSamplesRef.current.push(chunkRms);
            const avgRms = noiseCalibrationSamplesRef.current.reduce((a, b) => a + b, 0) / noiseCalibrationSamplesRef.current.length;
            hardwareNoiseFloorRef.current = Math.min(0.08, Math.max(0.025, avgRms * 1.6));
          } else {
            hardwareNoiseFloorRef.current = Math.min(0.08, Math.max(0.025, hardwareNoiseFloorRef.current));
          }

          // Continuous live speech energy meter relative to calibrated noise floor
          const meterLevel = Math.min(
            100,
            Math.max(4, Math.round((chunkRms / Math.max(0.025, hardwareNoiseFloorRef.current * 1.8)) * 55))
          );
          setAudioLevel(meterLevel);

          // 3. Only treat audio as speech when chunkRms > calibrated noiseFloor
          const isChunkSpeech = chunkRms > hardwareNoiseFloorRef.current;

          // Un-resettable strict 5000ms total hard stop regardless of background noise
          if (elapsedListenMs >= 5000 && voiceStateRef.current === 'listening') {
            if (hardwareSilenceTimerRef.current) {
              clearTimeout(hardwareSilenceTimerRef.current);
              hardwareSilenceTimerRef.current = null;
            }
            if (hardwarePcmBuffersRef.current.length === 0) {
              hardwarePcmBuffersRef.current.push(f32);
            }
            finishHardwareRecording();
            return;
          }

          if (isChunkSpeech) {
            if (!hasDetectedSpeechRef.current) {
              hasDetectedSpeechRef.current = true;
              firstSpeechTimeRef.current = now;
              for (const pre of preSpeechRingBufferRef.current) {
                hardwarePcmBuffersRef.current.push(pre);
              }
              preSpeechRingBufferRef.current = [];
              if (idleWatchdogTimerRef.current) {
                clearTimeout(idleWatchdogTimerRef.current);
                idleWatchdogTimerRef.current = null;
              }
            }
            lastSpeechTimeRef.current = now;
            hardwarePcmBuffersRef.current.push(f32);

            // Auto-stop after 1000ms of continuous silence once speech has started
            if (hardwareSilenceTimerRef.current) {
              clearTimeout(hardwareSilenceTimerRef.current);
            }
            hardwareSilenceTimerRef.current = setTimeout(() => {
              if (hasDetectedSpeechRef.current && hardwarePcmBuffersRef.current.length > 0 && voiceStateRef.current === 'listening') {
                finishHardwareRecording();
              }
            }, 1000);
          } else {
            if (!hasDetectedSpeechRef.current) {
              preSpeechRingBufferRef.current.push(f32);
              if (preSpeechRingBufferRef.current.length > 6) {
                preSpeechRingBufferRef.current.shift();
              }
            } else {
              hardwarePcmBuffersRef.current.push(f32);
              if (now - lastSpeechTimeRef.current >= 1000 && hardwarePcmBuffersRef.current.length > 0 && voiceStateRef.current === 'listening') {
                if (hardwareSilenceTimerRef.current) {
                  clearTimeout(hardwareSilenceTimerRef.current);
                  hardwareSilenceTimerRef.current = null;
                }
                finishHardwareRecording();
              }
            }
          }
        } catch (e) {
          console.warn('Hardware audio chunk decode error:', e);
        }
      };

            // Agentic idle timeout: If user is silent for 9-10 seconds, politely nudge and keep listening
            const finishHardwareRecording = async () => {
              if (!isMountedRef.current || isTranscribingHardwareRef.current) return;
              if (
                isAssistantSpeakingRef.current ||
                voiceStateRef.current === 'assistant_speaking' ||
                voiceStateRef.current === 'processing'
              ) {
                hardwarePcmBuffersRef.current = [];
                preSpeechRingBufferRef.current = [];
                hasDetectedSpeechRef.current = false;
                firstSpeechTimeRef.current = 0;
                lastSpeechTimeRef.current = 0;
                return;
              }

              if (hardwareSilenceTimerRef.current) {
                clearTimeout(hardwareSilenceTimerRef.current);
                hardwareSilenceTimerRef.current = null;
              }
              if (hardwareMaxDurationTimerRef.current) {
                clearTimeout(hardwareMaxDurationTimerRef.current);
                hardwareMaxDurationTimerRef.current = null;
              }
              if (idleWatchdogTimerRef.current) {
                clearTimeout(idleWatchdogTimerRef.current);
                idleWatchdogTimerRef.current = null;
              }

              if (hardwarePcmBuffersRef.current.length === 0) {
                if (!isMountedRef.current) return;
                voiceStateRef.current = 'listening';
                setVoiceState('listening');
                armIdleWatchdog();
                return;
              }

              isTranscribingHardwareRef.current = true;
              try {
                let total = 0;
                for (const b of hardwarePcmBuffersRef.current) total += b.length;
                const flat = new Float32Array(total);
                let offset = 0;
                for (const b of hardwarePcmBuffersRef.current) {
                  flat.set(b, offset);
                  offset += b.length;
                }
                hardwarePcmBuffersRef.current = [];
                preSpeechRingBufferRef.current = [];
                hasDetectedSpeechRef.current = false;
                firstSpeechTimeRef.current = 0;
                lastSpeechTimeRef.current = 0;

                // Stage 0.5: 95Hz IIR High-Pass Filter (strips fan hum, table rumble, 50Hz mains hum)
                const rc = 1.0 / (2.0 * Math.PI * 95.0);
                const dt = 1.0 / 16000.0;
                const alpha = rc / (rc + dt);
                let prevIn = 0;
                let prevOut = 0;
                for (let i = 0; i < flat.length; i++) {
                  const curIn = flat[i];
                  const curOut = alpha * (prevOut + curIn - prevIn);
                  prevIn = curIn;
                  prevOut = curOut;
                  flat[i] = curOut;
                }

                // Stage 1 DSP Filter: Minimum Audio Duration (16kHz audio: >= 0.10s)
                if (flat.length < 1600) {
                  voiceStateRef.current = 'listening';
                  setVoiceState('listening');
                  armIdleWatchdog();
                  return;
                }

                // Calculate RMS energy to detect pure background noise or table taps
                let sumSq = 0;
                for (let i = 0; i < flat.length; i++) sumSq += flat[i] * flat[i];
                const rms = Math.sqrt(sumSq / flat.length);

                if (rms < 0.003) {
                  voiceStateRef.current = 'listening';
                  setVoiceState('listening');
                  setLoadingStepText(null);
                  armIdleWatchdog();
                  return;
                }

                // Stage 2 DSP: Intelligent Speech Peak Normalization
                let peak = 0;
                for (let i = 0; i < flat.length; i++) {
                  const a = Math.abs(flat[i]);
                  if (a > peak) peak = a;
                }
                if (peak > 0.02 && peak < 0.75) {
                  const boost = Math.min(4.0, 0.85 / peak);
                  for (let i = 0; i < flat.length; i++) {
                    flat[i] = Math.max(-1.0, Math.min(1.0, flat[i] * boost));
                  }
                }

                if (!isMountedRef.current) return;
                // Immediately switch to processing state so user gets instant visual confirmation!
                voiceStateRef.current = 'processing';
                setVoiceState('processing');
                setAudioLevel(0);
                setLoadingStepText(
                  language === 'or'
                    ? 'ଆପଣଙ୍କ କଥା ବିଶ୍ଳେଷଣ କରାଯାଉଛି...'
                    : language === 'hi'
                      ? 'आपकी बात समझी जा रही है...'
                      : 'Analyzing your response...'
                );

                const wavBlob = encodeWavBlob(flat, 16000);
                const res = await transcribeSpeech(wavBlob, language);
                if (!isMountedRef.current) return;
                const cleanCandidate = (res?.transcript || '').trim();
                if (res && res.status === 'success' && cleanCandidate.length > 0 && cleanCandidate.toUpperCase() !== 'EMPTY') {
                  const cleanTxt = cleanCandidate;

                    // Stage 3: Strict Anti-Hallucination Filter
                    const normTxt = cleanTxt.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
                    const HALLUCINATIONS = [
                      'thank you for watching', 'thanks for watching', 'subscribe',
                      'subtitles by', 'amaraorg', 'amara org'
                    ];
                    if (HALLUCINATIONS.includes(normTxt) && flat.length < 32000) {
                      if (!isMountedRef.current) return;
                      voiceStateRef.current = 'listening';
                      setVoiceState('listening');
                      setLoadingStepText(null);
                      armIdleWatchdog();
                      return;
                    }

                    voiceStateRef.current = 'ready';
                    setVoiceState('ready');
                    setLoadingStepText(null);
                    setError(null);
                    addConversationMessage('patient', cleanTxt);
                    if (currentStepListeningHandlerRef.current) {
                      currentStepListeningHandlerRef.current(cleanTxt);
                    }
                    return;
                  }
                } catch (e) {
                  console.warn('Hardware audio transcription error:', e);
                } finally {
                  isTranscribingHardwareRef.current = false;
                }

                if (!isMountedRef.current) return;
                if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
                  setVoiceAgentStatusText(
                    language === 'or'
                      ? 'ଆପଣଙ୍କ ସ୍ୱର ସ୍ପଷ୍ଟ ଶୁଣାଗଲା ନାହିଁ — ଦୟାକରି ଆଉଥରେ ସ୍ପଷ୍ଟ ଭାବେ କୁହନ୍ତୁ।'
                      : language === 'hi'
                        ? 'आवाज़ साफ़ समझ नहीं आई — कृपया फिर से स्पष्ट बोलें।'
                        : "Didn't catch that clearly — please speak again."
                  );
                  voiceStateRef.current = 'listening';
                  setVoiceState('listening');
                  setLoadingStepText(null);
                  armIdleWatchdog();
                } else {
                  voiceStateRef.current = 'ready';
                  setVoiceState('ready');
                  setLoadingStepText(null);
                }
              };

              // Agentic Conversational Listening & Unified Voice Slot Engine
              // Dual Engine: Seamlessly listens through ESP32 Hardware Mic (when connected)
              // or Browser Microphone (laptop/mobile/kiosk Web Speech & MediaRecorder fallback)

              // Clinical Studio-Grade Noise-Immunity Listening Pipeline
              // Features: Safe Universal Hardware Constraints, Web Audio DSP Filter Graph,
              // Adaptive Dynamic Noise Floor VAD, Parallel Web Speech, and Sarvam saaras:v4 Primary Neural STT
              // Laptop microphone disabled - system operates EXCLUSIVELY via ESP32 INMP441 Hardware Mic

              const startBrowserRecording = async (onTranscript: (text: string) => void) => {
                if (!isMountedRef.current) return;
                try {
                  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    console.warn('Browser getUserMedia not supported');
                    return;
                  }
                  const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                      echoCancellation: true,
                      noiseSuppression: true,
                      autoGainControl: true,
                    },
                  });
                  if (!isMountedRef.current) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                  }
                  registerActiveStream(stream);
                  mediaStreamRef.current = stream;

      const listenStartedAt = nowMs();
      let hasSpoken = false;
      let lastVoiceTime = 0;
      let noiseFloor = 0.035;
      const noiseSamples: number[] = [];
      let vadSilenceTimer: ReturnType<typeof setTimeout> | null = null;
      let hardStopTimer: ReturnType<typeof setTimeout> | null = null;
      let accumulatedSpeechText = '';
      let persistentSpeechHistory = '';
      let isFinishedRecording = false;
      let finishBrowserRecordingFn: (() => Promise<void>) | null = null;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        registerActiveAudioContext(audioCtx);
        audioContextRef.current = audioCtx;
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => { });
        }
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const timeData = new Uint8Array(analyser.fftSize);

        const updateLevel = () => {
          if (!isMountedRef.current || isFinishedRecording || !analyserRef.current || voiceStateRef.current !== 'listening') return;
          analyserRef.current.getByteTimeDomainData(timeData);
          let sumSq = 0;
          for (let i = 0; i < timeData.length; i++) {
            const s = (timeData[i] - 128) / 128.0;
            sumSq += s * s;
          }
          const rms = Math.sqrt(sumSq / timeData.length);
          setAudioLevel(Math.min(100, Math.round(rms * 400)));

          const now = nowMs();
          // Calibrate ambient noise floor during first 400ms: clamp(avgRms * 1.6, 0.025, 0.08)
          if (now - listenStartedAt < 400) {
            noiseSamples.push(rms);
            const avgRms = noiseSamples.reduce((a, b) => a + b, 0) / noiseSamples.length;
            noiseFloor = Math.min(0.08, Math.max(0.025, avgRms * 1.6));
          } else if (rms > noiseFloor) {
            hasSpoken = true;
            lastVoiceTime = now;
            if (vadSilenceTimer) {
              clearTimeout(vadSilenceTimer);
              vadSilenceTimer = null;
            }
          }

          // Strict hard stop at 5000ms total regardless of background noise
          if (now - listenStartedAt >= 5000) {
            if (vadSilenceTimer) {
              clearTimeout(vadSilenceTimer);
              vadSilenceTimer = null;
            }
            void finishBrowserRecordingFn?.();
            return;
          }

          // Auto-stop after 1000ms continuous silence once speech has started
          if (hasSpoken && now - lastVoiceTime >= 1000 && !vadSilenceTimer) {
            vadSilenceTimer = setTimeout(() => {
              if (voiceStateRef.current === 'listening' && hasSpoken && !isFinishedRecording) {
                void finishBrowserRecordingFn?.();
              }
            }, 40);
          }

          animFrameRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      }

      const chunks: Blob[] = [];
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/wav';
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const finishBrowserRecording = async () => {
        if (!isMountedRef.current || isFinishedRecording) return;
        isFinishedRecording = true;
        handleVoiceDoneSpeakingRef.current = null;

        if (vadSilenceTimer) {
          clearTimeout(vadSilenceTimer);
          vadSilenceTimer = null;
        }
        if (hardStopTimer) {
          clearTimeout(hardStopTimer);
          hardStopTimer = null;
        }
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }

        const recorderStopped =
          recorder.state === 'recording'
            ? new Promise<void>((resolve) => {
              const timeout = setTimeout(resolve, 450);
              recorder.onstop = () => {
                clearTimeout(timeout);
                resolve();
              };
              try {
                recorder.stop();
              } catch {
                clearTimeout(timeout);
                resolve();
              }
            })
            : Promise.resolve();

        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch { }
          recognitionRef.current = null;
        }
        if (audioContextRef.current) {
          try { audioContextRef.current.close().catch(() => { }); } catch { }
          audioContextRef.current = null;
        }
        analyserRef.current = null;

        voiceStateRef.current = 'processing';
        setVoiceState('processing');
        setAudioLevel(0);
        setLoadingStepText(
          language === 'or'
            ? 'ଆପଣଙ୍କ କଥା ବୁଝାଯାଉଛି...'
            : language === 'hi'
              ? 'आपकी बात समझी जा रही है...'
              : 'Getting that down for you...'
        );

        await recorderStopped;
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        if (!isMountedRef.current) return;

        let finalTranscript = '';
        const audioBlob = new Blob(chunks, { type: mime });
        try {
          if (audioBlob.size > 1200) {
            const res = await transcribeSpeech(audioBlob, language);
            const candidate = (res?.transcript || '').trim();
            if (res && res.status === 'success' && candidate && candidate.toUpperCase() !== 'EMPTY') {
              finalTranscript = candidate;
            }
          }
        } catch (err) {
          console.warn('Browser neural STT error, falling back to Web Speech backup:', err);
        }

        // Parallel SpeechRecognition backup when backend returns empty / "EMPTY"
        const webSpeechText = (accumulatedSpeechText || '').trim();
        if (!finalTranscript && webSpeechText) {
          finalTranscript = webSpeechText;
        }

        if (finalTranscript) {
          voiceStateRef.current = 'ready';
          setVoiceState('ready');
          setLoadingStepText(null);
          addConversationMessage('patient', finalTranscript);
          onTranscript(finalTranscript);
          return;
        }

        // Empty transcript after mic flush: restart a live mic session instead of sitting stuck
        setLoadingStepText(null);
        if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
          if (audioBlob.size > 1200) {
            setVoiceAgentStatusText(
              language === 'or'
                ? 'ଆପଣଙ୍କ ସ୍ୱର ସ୍ପଷ୍ଟ ଶୁଣାଗଲା ନାହିଁ — ଦୟାକରି ଆଉଥରେ କୁହନ୍ତୁ।'
                : language === 'hi'
                  ? 'आवाज़ साफ़ समझ नहीं आई — कृपया फिर से बोलें।'
                  : "Didn't catch that clearly — whenever you're ready, please say it again."
            );
          }
          startListeningVoice(handleVoiceInputRef.current);
        } else {
          voiceStateRef.current = 'ready';
          setVoiceState('ready');
        }
      };

      finishBrowserRecordingFn = finishBrowserRecording;
      handleVoiceDoneSpeakingRef.current = finishBrowserRecording;

      // Strict un-resettable 5000ms hard stop timer
      hardStopTimer = setTimeout(() => {
        void finishBrowserRecording();
      }, 5000);
      recorder.start(200);

      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const bcpTag = BCP47_TAGS[language] || 'en-IN';
      // Chrome Web Speech rejects unsupported codes like 'or-IN'; skip safely so MediaRecorder + /patient/stt handle them cleanly
      const webSpeechSupported = bcpTag !== 'or-IN';
      if (SpeechRec && webSpeechSupported) {
        try {
          const rec = new SpeechRec();
          registerActiveSpeechRecognition(rec);
          recognitionRef.current = rec;
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = bcpTag;
          rec.onresult = (e: any) => {
            if (!isMountedRef.current || isFinishedRecording || voiceStateRef.current !== 'listening') return;
            const now = nowMs();
            hasSpoken = true;
            lastVoiceTime = now;
            if (vadSilenceTimer) {
              clearTimeout(vadSilenceTimer);
              vadSilenceTimer = null;
            }
            let interim = '';
            let currentSessionFinal = '';
            for (let i = 0; i < e.results.length; i++) {
              if (e.results[i].isFinal) {
                currentSessionFinal += e.results[i][0].transcript + ' ';
              } else {
                interim += e.results[i][0].transcript;
              }
            }
            const currentSession = (currentSessionFinal + interim).trim();
            const combined = (persistentSpeechHistory + ' ' + currentSession).trim();
            if (combined) {
              accumulatedSpeechText = combined;
            }
          };
          rec.onend = () => {
            if (!isMountedRef.current || isFinishedRecording || voiceStateRef.current !== 'listening') return;
            persistentSpeechHistory = accumulatedSpeechText;
            try {
              rec.start();
            } catch { }
          };
          rec.onerror = () => { };
          rec.start();
        } catch { }
      }
    } catch (e) {
      console.warn('Browser microphone initialization failed:', e);
    }
  };

startListeningVoice = (onTranscript: (text: string) => void) => {
  if (!isMountedRef.current) return;
  currentStepListeningHandlerRef.current = onTranscript;
  stopAllVoiceActivity();
  if (!isMountedRef.current) return;
  setError(null);
  setLoadingStepText(null);

  voiceStateRef.current = 'listening';
  setVoiceState('listening');
  setAudioLevel(0);
  listenStartTimeRef.current = nowMs();
  noiseCalibrationSamplesRef.current = [];

  const hasHardware =
    esp32SerialService.getState().isConnected ||
    isHardwareConnectedRef.current ||
    Boolean(typeof window !== 'undefined' && window.__JANSAATHI_ESP32_PORT__?.readable);

  // When ESP32 hardware is connected, STRICTLY route audio exclusively through the ESP32 Hardware Mic!
  if (hasHardware && audioSourceRef.current !== 'laptop') {
    isHardwareConnectedRef.current = true;
    setIsHardwareConnected(true);
    setAudioSource('hardware');
    audioSourceRef.current = 'hardware';
    hardwarePcmBuffersRef.current = [];
    hasDetectedSpeechRef.current = false;
    firstSpeechTimeRef.current = 0;
    lastSpeechTimeRef.current = 0;
    preSpeechRingBufferRef.current = [];
    hardwareNoiseFloorRef.current = 0.035;
    handleVoiceDoneSpeakingRef.current = finishHardwareRecording;
    if (hardwareMaxDurationTimerRef.current) {
      clearTimeout(hardwareMaxDurationTimerRef.current);
    }
    // Strict 5000ms hard stop on hardware capture so it never listens forever
    hardwareMaxDurationTimerRef.current = setTimeout(() => {
      if (voiceStateRef.current === 'listening' && !isTranscribingHardwareRef.current) {
        finishHardwareRecording();
      }
    }, 5000);
  } else {
    // Fallback to laptop mic ONLY when ESP32 is unplugged or user explicitly chose laptop
    startBrowserRecording(onTranscript);
  }
  armIdleWatchdog();
};

// Prompt generator for each exact sequential slot
const getSlotPrompt = (slot: VoiceIntakeSlot, qIdx: number = 0): string => {
  const curName = patientNameRef.current || name.trim();
  const curAge = patientAgeRef.current !== '' ? patientAgeRef.current : age;
  const curGender = patientGenderRef.current || gender;
  const curContact = patientContactRef.current || contact;
  const curComplaint = patientComplaintRef.current || complaint;

  if (slot === 'name') {
    const NATIVE_GREETINGS: Record<string, string> = {
      or: 'ନମସ୍କାର, ଗୁଇନେକ୍ସ କ୍ଲିନିକ୍‌କୁ ସ୍ୱାଗତ। ମୁଁ ଅନନ୍ୟା, ଆପଣଙ୍କ ଚେକ୍-ଇନ୍ ସହଜରେ କରିବାରେ ସାହାଯ୍ୟ କରିବି। ପ୍ରଥମେ ଦୟାକରି ଆପଣଙ୍କ ଶୁଭ ନାମ କୁହନ୍ତୁ।',
      hi: 'नमस्ते, गुइनेक्स क्लिनिक में आपका स्वागत है। मैं अनन्या हूँ, और मैं आपका चेक-इन आसानी से पूरा करने में मदद करूँगी। जब आप तैयार हों, बस अपना शुभ नाम बताइए।',
      bn: 'নমস্কার, গুইনেক্স ক্লিনিকে স্বাগত। আমি অনন্যা, আপনার চেক-ইন সহজে করতে সাহায্য করব। আপনি প্রস্তুত হলে আপনার শুভ নাম বলুন।',
      te: 'నమస్కారం, గుయినెక్స్ క్లినిక్‌కు స్వాగతం. నేను అనన్య, మీ చెక్-ఇన్ సులభంగా పూర్తి చేయడంలో సహాయం చేస్తాను. దయచేసి మీ పేరు చెప్పండి.',
      ta: 'வணக்கம், குயினெக்ஸ் கிளினிக்கிற்கு வரவேற்கிறோம். நான் அனன்யா, உங்கள் பதிவு எளிதாக முடிய உதவுவேன். தயவுசெய்து உங்கள் பெயரைச் சொல்லுங்கள்.',
      mr: 'नमस्कार, गुइनेक्स क्लिनिकमध्ये आपले स्वागत आहे। मी अनन्या आहे। कृपया तुमचे शुभ नाव सांगा.',
      gu: 'નમસ્તે, ગુઇનેક્સ ક્લિનિકમાં આપનું સ્વાગત છે. હું અનન્યા છું. કૃપા કરીને તમારું નામ કહો.',
      kn: 'ನಮಸ್ಕಾರ, ಗುಯಿನೆಕ್ಸ್ ಕ್ಲಿನಿಕ್‌ಗೆ ಸ್ವಾಗತ. ನಾನು ಅನನ್ಯ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರನ್ನು ಹೇಳಿ.',
      ml: 'നമസ്കാരം, ഗുയിനെക്സ് ക്ലിനിക്കിലേക്ക് സ്വാഗതം. ഞാൻ അനന്യ. ദയവായി നിങ്ങളുടെ പേര് പറയൂ.',
      pa: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਗੁਇਨੇक्स ਕਲਿਨਿਕ ਵਿੱਚ ਤੁਹਾਡਾ ਸਵਾਗਤ ਹੈ। ਮੈਂ ਅਨੰਨਿਆ ਹਾਂ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਨਾਮ ਦੱਸੋ।',
      as: 'নমস্কাৰ, গুইনেক্স ক্লিনিকলৈ স্বাগতম। মই অনন্যা। অনুগ্ৰহ কৰি আপোনাৰ নাম কওক।',
      ur: 'خوش آمدید، گوئنیکس کلینک میں آپ کا خیر مقدم ہے۔ میں اننیا ہوں۔ براہ کرم اپنا نام بتائیں۔',
      ne: 'नमस्ते, गुइनेक्स क्लिनिकमा स्वागत छ। म अनन्या हुँ। कृपया आफ्नो नाम भन्नुहोस्।',
      sa: 'नमस्ते, गुइनेक्स-चिकित्सालये स्वागतम्। अहम् अनन्या। कृपया स्वनाम वदन्तु।',
      mai: 'प्रणाम, गुइनेक्स क्लिनिक मे स्वागत अछि। हम अनन्या छी। कृपया अपन नाम कहू।',
      kok: 'नमस्कार, गुइनेक्स क्लिनिकांत येवकार। हांव अनन्या। कृपया तुमचें नांव सांगात।',
      sd: 'ڀلي ڪري آيا، گوئنيڪس کلينڪ ۾ توهان جو آڌرڀاءُ آهي. مان اننيا آهيان. پنهنجو نالو ٻڌايو.',
      doi: 'नमस्ते, गुइनेक्स क्लिनिक च स्वागत ऐ। मैं अनन्या आं। कृपया अपना नां दस्सो।',
      mni: 'খুরুমজরি, গুইনেক্স ক্লিনিকতা তরাম্না ওকচরি। ঐ অনন্যানি। নহাক্কী মমিং হায়বিয়ু।',
      sat: 'ᱡᱚᱦᱟᱨ, Guinex Clinic ᱨᱮ ᱥᱟᱹᱜᱩᱱ ᱫᱟᱨᱟᱢ᱾ ᱤᱧ Ananya ᱠᱟᱹᱱᱟᱹᱧ᱾ ᱟᱢᱟᱜ ᱧᱩᱛᱩᱢ ᱞᱟᱹᱭ ᱢᱮ᱾',
      brx: 'खुलुमबाय, Guinex Clinic आव बरायबाय। आं अनन्या। नोंथांनि मुं खोन्था।',
      ks: 'خوش آمدید، گوئنیکس کلینکس مَنٛز خوش آمدید۔ بہٕ چھَس اننیا۔ پنُن ناو وَنِو۔',
      en: "Hi there, welcome to Guinex Clinic. I'm Ananya, and I'll help get you checked in smoothly. Tell me your good name whenever you're ready."
    };
    return NATIVE_GREETINGS[language] || NATIVE_GREETINGS.en;
  }

  if (slot === 'age') {
    const AGE_PROMPTS: Record<string, string> = {
      or: `ଆପଣଙ୍କ ସହ ପରିଚୟ ହୋଇ ବହୁତ ଖୁସି ଲାଗିଲା${curName ? `, ${curName}` : ''}! ଆପଣଙ୍କ ବୟସ କେତେ ବର୍ଷ?`,
      hi: `आपसे मिलकर बहुत अच्छा लगा${curName ? `, ${curName}` : ''}! आपकी उम्र कितनी है?`,
      bn: `আপনার সাথে কথা বলে ভালো লাগল${curName ? `, ${curName}` : ''}! আপনার বয়স কত?`,
      te: `మిమ్మల్ని కలవడం చాలా ఆనందంగా ఉంది${curName ? `, ${curName}` : ''}! మీ వయస్సు ఎంత?`,
      ta: `உங்களை சந்தித்ததில் மகிழ்ச்சி${curName ? `, ${curName}` : ''}! உங்கள் வயது என்ன?`,
      mr: `तुम्हाला भेटून छान वाटले${curName ? `, ${curName}` : ''}! तुमचे वय किती आहे?`,
      gu: `તમને મળીને આનંદ થયો${curName ? `, ${curName}` : ''}! તમારી ઉંમર કેટલી છે?`,
      kn: `ನಿಮ್ಮನ್ನು ಭೇಟಿಯಾಗಿ ಸಂತೋಷವಾಯಿತು${curName ? `, ${curName}` : ''}! ನಿಮ್ಮ ವಯಸ್ಸು ಎಷ್ಟು?`,
      ml: `പരിചയപ്പെട്ടതിൽ സന്തോഷം${curName ? `, ${curName}` : ''}! നിങ്ങളുടെ പ്രായം എത്രയാണ്?`,
      pa: `ਤੁਹਾਨੂੰ ਮਿਲ ਕੇ ਖੁਸ਼ੀ ਹੋਈ${curName ? `, ${curName}` : ''}! ਤੁਹਾਡੀ ਉਮਰ ਕਿੰਨੀ ਹੈ?`,
      as: `আপোনাক লগ পাই ভাল লাগিল${curName ? `, ${curName}` : ''}! আপোনাৰ বয়স কিমান?`,
      ur: `آپ سے مل کر خوشی ہوئی${curName ? `, ${curName}` : ''}! آپ کی عمر کتنی ہے؟`,
      ne: `तपाईंलाई भेटेर खुसी लाग्यो${curName ? `, ${curName}` : ''}! तपाईंको उमेर कति भयो?`,
      sa: `भवता सह परिचयेन प्रीतोऽस्मि${curName ? `, ${curName}` : ''}! भवतां वयः कियत्?`,
      mai: `अहाँ सं भेंट कऽ नीक लागल${curName ? `, ${curName}` : ''}! अहाँक उमिर कते अछि?`,
      kok: `तुमकां मेळून बरें दिसलें${curName ? `, ${curName}` : ''}! तुमचें पिराय कितलें?`,
      sd: `توهان سان ملي خوشي ٿي${curName ? `, ${curName}` : ''}! توهان جي عمر ڪيتري آهي?`,
      doi: `तुंदे कन्नै मिली के बड़ी खुशी होई${curName ? `, ${curName}` : ''}! तुंदी उमर किन्नी ऐ?`,
      mni: `নহাক্কা উনবদা হরাওজরি${curName ? `, ${curName}` : ''}! নহাক্কী চহি কয়ানি?`,
      sat: `ᱟᱢ ᱥᱟᱶ ᱧᱟᱯᱟᱢ ᱠᱟᱛᱮ ᱟᱹᱰᱤ ᱨᱟᱹᱥᱠᱟᱹ ᱵᱩᱡᱷᱟᱹᱣ ᱮᱱᱟ${curName ? `, ${curName}` : ''}! ᱟᱢᱟᱜ ᱩᱢᱮᱨ ᱛᱤᱱᱟᱹᱜ?`,
      brx: `नोंथांजों लोगो मोननानै मोजां मोनबाय${curName ? `, ${curName}` : ''}! नोंथांनि बैसोआ बेसेबां?`,
      ks: `تۄہؠ سۭتؠ مِلِتھ سپُد خۄشی${curName ? `, ${curName}` : ''}! تُہنٛز عُمَر کٔژ چھےٚ؟`,
      en: `Nice to meet you${curName ? `, ${curName}` : ''}! How old are you?`
    };
    return AGE_PROMPTS[language] || AGE_PROMPTS.en;
  }

  if (slot === 'gender') {
    const ageAck = curAge ? String(curAge) : '';
    const GENDER_PROMPTS: Record<string, string> = {
      or: `${ageAck ? `ଠିକ୍ ଅଛି, ${ageAck} ବର୍ଷ। ` : 'ଠିକ୍ ଅଛି। '}ଆପଣ ପୁରୁଷ, ମହିଳା, ନା ଅନ୍ୟ କୌଣସି ବର୍ଗରେ ଉଲ୍ଲେଖ କରିବାକୁ ଚାହିଁବେ?`,
      hi: `${ageAck ? `ठीक है, ${ageAck} साल। ` : 'ठीक है। '}आप पुरुष हैं, महिला हैं, या न बताना चाहें तो भी ठीक है?`,
      bn: `${ageAck ? `বেশ, ${ageAck} বছর। ` : 'বেশ। '}আপনি কি পুরুষ, মহিলা, নাকি বলতে চান না?`,
      te: `${ageAck ? `సరే, ${ageAck} ఏళ్ళు. ` : 'సరే. '}మీరు పురుషులా, మహిళా, లేదా చెప్పకూడదు అనుకుంటున్నారా?`,
      ta: `${ageAck ? `சரி, ${ageAck} வயது. ` : 'சரி. '}நீங்கள் ஆணா, பெண்ணா, அல்லது குறிப்பிட விரும்பவில்லையா?`,
      mr: `${ageAck ? `ठीक आहे, ${ageAck} वर्षे. ` : 'ठीक आहे. '}तुम्ही पुरुष आहात, महिला आहात, की सांगायचे नाही?`,
      gu: `${ageAck ? `સરસ, ${ageAck} વર્ષ. ` : 'સરસ. '}તમે પુરુષ છો, મહિલા છો, કે કહેવા નથી માંગતા?`,
      kn: `${ageAck ? `ಸರಿ, ${ageAck} ವರ್ಷ. ` : 'ಸರಿ. '}ನೀವು ಪುರುಷ, ಮಹಿಳೆ, ಅಥವಾ ಹೇಳಲು ಇಚ್ಛಿಸುವುದಿಲ್ಲವೇ?`,
      ml: `${ageAck ? `ശരി, ${ageAck} വയസ്സ്. ` : 'ശരി. '}നിങ്ങൾ പുരുഷനാണോ, സ്ത്രീയാണോ, അതോ പറയാൻ ആഗ്രഹിക്കുന്നില്ലേ?`,
      pa: `${ageAck ? `ਠੀਕ ਹੈ, ${ageAck} ਸਾਲ। ` : 'ਠੀਕ ਹੈ। '}ਤੁਸੀਂ ਪੁਰਸ਼ ਹੋ, ਮਹਿਲਾ ਹੋ, ਜਾਂ ਨਹੀਂ ਦੱਸਣਾ ਚਾਹੁੰਦੇ?`,
      as: `${ageAck ? `ঠিক আছে, ${ageAck} বছৰ। ` : 'ঠিক আছে। '}আপুনি পুৰুষ, মহিলা নে উল্লেখ কৰিব নিবিচাৰে?`,
      ur: `${ageAck ? `ٹھیک ہے، ${ageAck} سال۔ ` : 'ٹھیک ہے۔ '}آپ مرد ہیں، خاتون ہیں، یا نہیں بتانا چاہتے؟`,
      ne: `${ageAck ? `ल ठीक छ, ${ageAck} वर्ष। ` : 'ल ठीक छ। '}तपाईं पुरुष, महिला, वा भन्न चाहनुहुन्न?`,
      sa: `अस्तु${ageAck ? `, ${ageAck} वर्षाणि` : ''}। भवान् पुरुषः, महिला, उत अन्यत्?`,
      mai: `ठीक अछि${ageAck ? `, ${ageAck} वर्ष` : ''}। अहाँ पुरुष छी, महिला छी, वा नहि कहय चाहैत छी?`,
      kok: `बरें${ageAck ? `, ${ageAck} वर्सां` : ''}। तुमी दादलो, बायल काय सांगूंक ना?`,
      sd: `ٺيڪ آهي${ageAck ? `, ${ageAck} سال` : ''}। توهان مرد آهيو، عورت آهيو، يا نه ٻڌائڻ چاهيو؟`,
      doi: `ठीक ऐ${ageAck ? `, ${ageAck} साल` : ''}। तुस मर्द ओ, जनाना ओ, जा नेईं दस्सना चाह्न्दे?`,
      mni: `য়াই${ageAck ? `, চহি ${ageAck}` : ''}। নহাক নুপা, নুপী, নত্রগা হায়দবা পাম্ব্রা?`,
      sat: `ᱴᱷᱤᱠ ᱜᱮᱭᱟ${ageAck ? `, ${ageAck} ᱥᱮᱨᱢᱟ` : ''}। ᱟᱢ ᱫᱚ ᱠᱚᱲᱟ, ᱠᱩᱲᱤ ᱥᱮ ᱵᱟᱢ ᱞᱟᱹᱭᱟ?`,
      brx: `मोजां${ageAck ? `, ${ageAck} बोसोर` : ''}। नोंथाङा हौवा, हिनजाव ना बुंनो नागिरा?`,
      ks: `ٹھیک چُھ${ageAck ? `, ${ageAck} وٕری` : ''}। تُہؠ چِھوا مَرٕد، زَنان کِنہِ وَنُن چھُ نہٕ؟`,
      en: `${ageAck ? `Got it, ${ageAck}. ` : 'Got it. '}And are you male, female, or prefer not to say?`
    };
    return GENDER_PROMPTS[language] || GENDER_PROMPTS.en;
  }

  if (slot === 'whatsapp') {
    const WHATSAPP_PROMPTS: Record<string, string> = {
      or: 'ଧନ୍ୟବାଦ! ଆପଣଙ୍କ ଭିଜିଟ୍ ସ୍ଲିପ୍ ପଠାଇବା ପାଇଁ ଏକ ଭଲ ୧୦ ଅଙ୍କ ବିଶିଷ୍ଟ ହ୍ୱାଟ୍ସଆପ୍ ନମ୍ବର କୁହନ୍ତୁ। ଯଦି ଦେବାକୁ ଚାହୁଁନାହାନ୍ତି, ତେବେ କେବଳ "ନାହିଁ" କୁହନ୍ତୁ।',
      hi: 'धन्यवाद! आपकी विज़िट स्लिप भेजने के लिए एक 10 अंकों का व्हाट्सएप नंबर बताइए—या अगर नहीं देना चाहते तो बस "स्किप" या "नहीं" कहें।',
      bn: 'ধন্যবাদ! আপনার ভিজিট স্লিপ পাঠানোর জন্য একটি ১০ সংখ্যার হোয়াটসঅ্যাপ নম্বর বলুন—অথবা না দিতে চাইলে শুধু "স্কিপ" বা "নেই" বলুন।',
      te: 'ధన్యవాదాలు! మీ విజిట్ స్లిప్ పంపడానికి మీ 10 అంకెల వాట్సాప్ నంబర్ చెప్పండి—లేదా "స్కిప్" అని చెప్పండి.',
      ta: 'நன்றி! உங்கள் விசிட் ஸ்லிப்பை அனுப்ப 10 இலக்க வாட்ஸ்அப் எண்ணைச் சொல்லுங்கள்—அல்லது "ஸ்கிப்" என்று சொல்லலாம்.',
      mr: 'धन्यवाद! तुमची व्हिजिट स्लिप पाठवण्यासाठी 10 अंकी व्हॉट्सॲप नंबर सांगा—किंवा नको असल्यास "स्किप" म्हणा.',
      gu: 'આભાર! તમારી વિઝિટ સ્લિપ મોકલવા માટે 10 અંકનો વ્હોટ્સએપ નંબર કહો—અથવા "સ્કિપ" કહો.',
      kn: 'ಧನ್ಯವಾದಗಳು! ನಿಮ್ಮ ವಿಸಿಟ್ ಸ್ಲಿಪ್ ಕಳುಹಿಸಲು 10 ಅಂಕಿಯ ವಾಟ್ಸಾಪ್ ಸಂಖ್ಯೆ ಹೇಳಿ—ಅಥವಾ "ಸ್ಕಿಪ್" ಎನ್ನಿ.',
      ml: 'നന്ദി! നിങ്ങളുടെ വിസിറ്റ് സ്ലിപ്പ് അയക്കാൻ 10 അക്ക വാട്സാപ്പ് നമ്പർ പറയൂ—അല്ലെങ്കിൽ "സ്കിപ്പ്" എന്ന് പറയൂ.',
      pa: 'ਧੰਨਵਾਦ! ਤੁਹਾਡੀ ਵਿਜ਼ਿਟ ਪਰਚੀ ਭੇਜਣ ਲਈ 10 ਅੰਕਾਂ ਦਾ ਵਟਸਐਪ ਨੰਬਰ ਦੱਸੋ—ਜਾਂ "ਸਕਿਪ" ਕਹੋ।',
      as: 'ধন্যবাদ! আপোনাৰ ভিজিট শ্লিপ পঠিয়াবলৈ ১০টা সংখ্যাৰ হোৱাটছএপ নম্বৰ কওক—অথবা "নাই" কওক।',
      ur: 'شکریہ! آپ کی وزٹ سلپ بھیجنے کے لیے 10 ہندسوں کا واٹس ایپ نمبر بتائیں—یا "اسکپ" کہیں۔',
      ne: 'धन्यवाद! तपाईंको भिजिट स्लिप पठाउन १० अंकको ह्वाट्सएप नम्बर भन्नुहोस्—वा "स्किप" भन्नुहोस्।',
      sa: 'धन्यवादः! कृपया १० अङ्कात्मकं व्हाट्सएप-सङ्ख्यां वदन्तु, अथवा "नास्ति" इति वदन्तु।',
      mai: 'धन्यवाद! १० अंकक व्हाट्सएप नम्बर बताउ, वा "स्किप" कहू।',
      kok: 'देव बरें करूं! १० आंकड्यांचो व्हॉट्सॲप नंबर सांगात, वा "ना" म्हणात।',
      sd: 'مهرباني! ۱۰ انگن وارو واٽس ايپ نمبر ٻڌايو، يا "اسڪپ" چئو.',
      doi: 'धन्यवाद! १० अंकें दा व्हाट्सएप नंबर दस्सो, जा "नेईं" आखो।',
      mni: 'থাগৎচরি! মশিং ১০ লৈবা ৱাটসএপ নম্বর হায়বিয়ু, নত্রগা "স্কিপ" হায়বিয়ু।',
      sat: 'ᱥᱟᱨᱦᱟᱣ! ᱑᱐ ᱮᱞ ᱣᱟᱴᱥᱮᱯ ᱱᱚᱢᱵᱚᱨ ᱞᱟᱹᱭ ᱢᱮ, ᱵᱟᱝᱠᱷᱟᱱ "skip" ᱢᱮᱱ ᱢᱮ᱾',
      brx: 'मोजां! १० अनजिमानि ह्वाट्सएप नम्बर बुं, एबा "गैया" बुं।',
      ks: 'شکریہ! ۱۰ ہِندسَن ہُند واٹس ایپ نَمبَر وَنِو، یا "نہٕ" وَنِو۔',
      en: "Thanks! What's a good 10-digit WhatsApp number where we can send your visit slip? You can also say skip if you'd rather not."
    };
    return WHATSAPP_PROMPTS[language] || WHATSAPP_PROMPTS.en;
  }

  if (slot === 'problem') {
    const NATIVE_PROBLEM_PROMPTS: Record<string, string> = {
      or: `ଆପଣଙ୍କ ସମସ୍ତ ତଥ୍ୟ ଠିକ୍ ହୋଇଗଲା${curName ? `, ${curName}` : ''}। ଏବେ ଆରାମରେ କୁହନ୍ତୁ—ଆଜି ଆପଣଙ୍କୁ କ’ଣ ଅସୁବିଧା ହେଉଛି?`,
      hi: `आपकी सारी जानकारी नोट हो गई है${curName ? `, ${curName}` : ''}। अब आराम से बताइए—आज आपको क्या परेशानी हो रही है?`,
      bn: `আপনার সব তথ্য লেখা হয়ে গেছে${curName ? `, ${curName}` : ''}। এবার নিশ্চিন্তে বলুন—আজ আপনার কী কষ্ট বা সমস্যা হচ্ছে?`,
      te: `మీ వివరాలన్నీ పూర్తయ్యాయి${curName ? `, ${curName}` : ''}. ఇప్పుడు ప్రశాంతంగా చెప్పండి—ఈ రోజు మీకు ఎలాంటి ఇబ్బంది ఉంది?`,
      ta: `உங்கள் விவரங்கள் அனைத்தும் பதிவாகிவிட்டன${curName ? `, ${curName}` : ''}. இப்போது நிதானமாகச் சொல்லுங்கள்—இன்று உங்களுக்கு என்ன சிரமம் உள்ளது?`,
      mr: `तुमची सर्व माहिती भरून झाली आहे${curName ? `, ${curName}` : ''}. आता निवांत सांगा—आज तुम्हाला काय त्रास होत आहे?`,
      gu: `તમારી બધી વિગતો નોંધાઈ ગઈ છે${curName ? `, ${curName}` : ''}. હવે નિરાંતે કહો—આજે તમને શું તકલીફ થઈ રહ્યો છે?`,
      kn: `ನಿಮ್ಮ ಎಲ್ಲಾ ವಿವರಗಳು ಸಿದ್ಧವಾಗಿವೆ${curName ? `, ${curName}` : ''}. ಈಗ ನಿಧಾನವಾಗಿ ಹೇಳಿ—ಇಂದು ನಿಮಗೆ ಏನು ತೊಂದರೆಯಾಗುತ್ತಿದೆ?`,
      ml: `നിങ്ങളുടെ വിവരങ്ങൾ എല്ലാം ശരിയായിട്ടുണ്ട്${curName ? `, ${curName}` : ''}. ഇനി സാവധാനം പറയൂ—ഇന്ന് എന്താണ് അസ്വസ്ഥത?`,
      pa: `ਤੁਹਾਡੇ ਸਾਰੇ ਵੇਰਵੇ ਤਿਆਰ ਹਨ${curName ? `, ${curName}` : ''}। ਹੁਣ ਆਰਾਮ ਨਾਲ ਦੱਸੋ—ਅੱਜ ਤੁਹਾਨੂੰ ਕੀ ਤਕਲੀਫ਼ ਹੋ ਰਹੀ ਹੈ?`,
      as: `আপোনাৰ সকলো তথ্য ঠিক হৈ গ’ল${curName ? `, ${curName}` : ''}। এতিয়া আৰামেৰে কওক—আজি আপোনাৰ কি অসুবিধা হৈছে?`,
      ur: `آپ کی تمام تفصیلات مکمل ہو گئی ہیں${curName ? `, ${curName}` : ''}۔ اب آرام سے بتائیں—آج آپ کو کیا تکلیف ہے؟`,
      ne: `तपाईंको सबै विवरण तयार भयो${curName ? `, ${curName}` : ''}। अब आरामले भन्नुहोस्—आज तपाईंलाई के समस्या भइरहेको छ?`,
      sa: `भवतां विवरणं सम्पूर्णम्${curName ? `, ${curName}` : ''}। अधुना शान्त्या वदन्तु—अद्य का पीड़ा वर्तते?`,
      mai: `अहाँक सभ जानकारी ठीक भऽ गेल${curName ? `, ${curName}` : ''}। आब आराम सं बताउ—आई की तकलीफ भऽ रहल अछि?`,
      kok: `तुमची सगळी म्हायती नोंद जाली${curName ? `, ${curName}` : ''}। आतां शांतपणान सांगात—आयज कितें त्रास जाता?`,
      sd: `توهان جا سڀ تفصيل تيار آهن${curName ? `, ${curName}` : ''}। هاڻي آرام سان ٻڌايو—اڄ توهان کي ڪهڙي تڪليف آهي؟`,
      doi: `तुंदी सारी जानकारी तैयार ऐ${curName ? `, ${curName}` : ''}। हुन आराम कन्नै दस्सो—अज्ज केह् तकलीफ ऐ?`,
      mni: `নহাক্কী অকুপ্পা পুম্নমক লোইরে${curName ? `, ${curName}` : ''}। হৌজিক ঙসি করি নুংঙাইতবা লৈ হায়বিয়ু?`,
      sat: `ᱟᱢᱟᱜ ᱡᱚᱛᱚ ᱠᱟᱛᱷᱟ ᱥᱟᱯᱲᱟᱣ ᱮᱱᱟ${curName ? `, ${curName}` : ''}। ᱱᱤᱛᱚᱜ ᱱᱤᱨᱟᱹᱭ ᱛᱮ ᱞᱟᱹᱭ ᱢᱮ—ᱛᱮᱦᱮᱧ ᱪᱮᱫ ᱦᱟᱹᱥᱩ ᱠᱟᱱᱟ?`,
      brx: `नोंथांनि गासै खारिथि जाबाय${curName ? `, ${curName}` : ''}। दा आरामसे बुं—दिनै मा असुविधा जादों?`,
      ks: `تُہنٛز تَمام تفصیٖل گٔیہِ مُکمل${curName ? `, ${curName}` : ''}۔ وۄنؠ وَنِو آرام سان—اَز کِیاہ تَکلیف چھےٚ؟`,
      en: `All set with your details${curName ? `, ${curName}` : ''}. Now take your time—what's been bothering you today?`
    };
    return NATIVE_PROBLEM_PROMPTS[language] || NATIVE_PROBLEM_PROMPTS.en;
  }

  if (slot === 'followup') {
    const q = followUpQuestions[qIdx] || (
      language === 'or' ? 'ଏହି ସମସ୍ୟା କେତେ ଦିନ ହେଲା ହେଉଛି?' :
        language === 'hi' ? 'यह तकलीफ कितने दिनों से हो रही है?' :
          language === 'bn' ? 'এই কষ্ট কতদিন ধরে হচ্ছে? দয়া করে বলুন।' :
            'How many days have you been experiencing this trouble?'
    );
    if (qIdx === 0) {
      const ACK_PRE: Record<string, string> = {
        or: `ଆପଣଙ୍କ ସମସ୍ୟା ବୁଝିଲି। ସଠିକ୍ ନିଦାନ ପାଇଁ ମୋତେ କିଛି ଜରୁରୀ କଥା ପଚାରିବାକୁ ହେବ। ପ୍ରଥମ ପ୍ରଶ୍ନ: ${q}`,
        hi: `आपकी समस्या समझ गई। डॉक्टर के सही निदान के लिए मुझे एक-दो ज़रूरी बातें पूछनी हैं। पहला सवाल: ${q}`,
        bn: `আপনার সমস্যার কথা বুঝতে পেরেছি। সঠিক চিকিৎসার জন্য আমার কিছু জানার আছে। প্রথম প্রশ্ন: ${q}`,
        te: `మీ సమస్య అర్థమైంది. ఖచ్చితమైన రోగ నిర్ధారణ కోసం: ${q}`,
        ta: `உங்கள் பிரச்சனை புரிந்தது. சரியான சிகிச்சைக்கு: ${q}`,
        mr: `आपली समस्या समजली. योग्य निदानासाठी: ${q}`,
        gu: `આપની સમસ્યા સમજાઈ ગઈ. યોગ્ય નિદાન માટે: ${q}`,
        kn: `ನಿಮ್ಮ ಸಮಸ್ಯೆ ಅರ್ಥವಾಯಿತು. ನಿಖರವಾದ ಚಿಕಿತ್ಸೆಗಾಗಿ: ${q}`,
        ml: `നിങ്ങളുടെ ബുദ്ധിമുട്ട് മനസ്സിലായി. കൃത്യമായ രോഗനിർണ്ണയത്തിന്: ${q}`,
        pa: `ਤੁਹਾਡੀ ਸਮੱਸਿਆ ਸਮਝ ਆ ਗਈ। ਸਹੀ ਇਲਾਜ ਲਈ: ${q}`,
        as: `আপোনাৰ সমস্যা বুজি পালোঁ। সঠিক নিদানৰ বাবে: ${q}`,
        ur: `آپ کی پریشانی سمجھ آگئی۔ درست تشخیص کے لیے: ${q}`,
        en: `I understand your condition. To assist the doctor with accurate diagnosis: ${q}`
      };
      return ACK_PRE[language] || `I understand. To assist the doctor: ${q}`;
    } else {
      const NEXT_PRE: Record<string, string> = {
        or: `ବୁଝିପାରିଲି। ପରବର୍ତ୍ତୀ ପ୍ରଶ୍ନ: ${q}`,
        hi: `समझ गई। अगला सवाल: ${q}`,
        bn: `বুঝতে পেরেছি। পরবর্তী প্রশ্ন: ${q}`,
        te: `అర్థమైంది. తదుపరి ప్రశ్న: ${q}`,
        ta: `புரிந்தது. அடுத்த கேள்வி: ${q}`,
        mr: `समजले. पुढचा प्रश्न: ${q}`,
        gu: `સમજાઈ ગયું. આગળનો પ્રશ્ન: ${q}`,
        kn: `ಅರ್ಥವಾಯಿತು. ಮುಂದಿನ ಪ್ರಶ್ನೆ: ${q}`,
        ml: `മനസ്സിലായി. അടുത്ത ചോദ്യം: ${q}`,
        pa: `ਸਮਝ ਗਿਆ। ਅਗਲਾ ਸਵਾਲ: ${q}`,
        as: `বুজিলোঁ। পৰৱৰ্তী প্ৰশ্ন: ${q}`,
        ur: `سمجھ گیا۔ اگلا سوال: ${q}`,
        en: `Understood. Next question: ${q}`
      };
      return NEXT_PRE[language] || `Understood. Next question: ${q}`;
    }
  }

  if (slot === 'report') {
    const REPORT_PROMPTS: Record<string, string> = {
      or: 'ଆପଣଙ୍କର ସମସ୍ତ ବିବରଣୀ ନୋଟ୍ କରାଗଲା। ଆପଣଙ୍କ ପାଖରେ କୌଣସି ପୁରୁଣା ଡାକ୍ତରୀ ରିପୋର୍ଟ ବା ପ୍ରେସକ୍ରିପସନ୍ ଅଛି କି? ଯଦି ଅଛି ତେବେ ଅପଲୋଡ୍ କରନ୍ତୁ, ଅଥବା କୁହନ୍ତୁ: "କୌଣସି ରିପୋର୍ଟ ନାହିଁ" କିମ୍ବା "ସରିଗଲା"।',
      hi: 'आपके सभी उत्तर नोट कर लिए गए हैं। क्या आपके पास कोई पुरानी जांच रिपोर्ट या डॉक्टर की पर्ची है? यदि है तो अपलोड करें, या कहें: "कोई रिपोर्ट नहीं है" या "हो गया"।',
      bn: 'আপনার সব বিবরণ নোট করা হয়েছে। আপনার কি কোনো পুরনো মেডিকেল রিপোর্ট বা প্রেসক্রিপশন আছে? থাকলে আপলোড করুন, অথবা বলুন: "কোনো রিপোর্ট নেই" বা "শেষ হয়েছে"।',
      te: 'మీ వివరాలన్నీ నమోదు చేయబడ్డాయి. మీ వద్ద పాత వైద్య నివేదికలు లేదా ప్రిస్క్రిప్షన్లు ఏమైనా ఉన్నాయా? ఉంటే అప్‌లోడ్ చేయండి, లేదా "ఏమీ లేవు" అని చెప్పండి.',
      ta: 'உங்கள் விவரங்கள் அனைத்தும் பதிவு செய்யப்பட்டுள்ளன. உங்களிடம் பழைய மருத்துவ அறிக்கைகள் அல்லது மருந்துச் சீட்டுகள் உள்ளதா? இருந்தால் பதிவேற்றவும், அல்லது "எதுவுமில்லை" என்று சொல்லவும்.',
      mr: 'आपले सर्व तपशील नोंदवले गेले आहेत. आपल्याकडे कोणतेही जुने वैद्यकीय अहवाल किंवा प्रिस्क्रिप्शन आहेत का? असल्यास अपलोड करा, किंवा म्हणा: "कोणताही अहवाल नाही".',
      gu: 'આપની તમામ વિગતો નોંધી લેવામાં આવી છે. શું આપણી પાસે કોઈ જૂના મેડિકલ રિપોર્ટ કે પ્રિસ્ક્રિપ્શન છે? જો હોય તો અપલોડ કરો, અથવા કહો: "કોઈ રિપોર્ટ નથી".',
      kn: 'ನಿಮ್ಮ ಎಲ್ಲಾ ವಿವರಗಳನ್ನು ದಾಖಲಿಸಲಾಗಿದೆ. ನಿಮ್ಮ ಬಳಿ ಹಳೆಯ ವೈದ್ಯಕೀಯ ವರದಿಗಳು ಅಥವಾ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಇದೆಯೇ? ಇದ್ದರೆ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ, ಅಥವಾ "ಯಾವುದೂ ಇಲ್ಲ" ಎಂದು ಹೇಳಿ.',
      ml: 'നിങ്ങളുടെ എല്ലാ വിവരങ്ങളും രേഖപ്പെടുത്തി. നിങ്ങളുടെ പക്കൽ പഴയ മെഡിക്കൽ റിപ്പോർട്ടുകളോ കുറിപ്പടികളോ ഉണ്ടോ? ഉണ്ടെങ്കിൽ അപ്‌ലോഡ് ചെയ്യുക, അല്ലെങ്കിൽ "റിപ്പോർട്ടുകൾ ഒന്നുമില്ല" എന്ന് പറയുക.',
      pa: 'ਤੁਹਾਡੇ ਸਾਰੇ ਵੇਰਵੇ ਨੋਟ ਕਰ ਲਏ ਗਏ ਹਨ। ਕੀ ਤੁਹਾਡੇ ਕੋਲ ਕੋਈ ਪੁਰਾਣੀ ਜਾਂਚ ਰਿਪੋਰਟ ਜਾਂ ਪਰਚੀ ਹੈ? ਜੇ ਹੈ ਤਾਂ ਅਪਲੋਡ ਕਰੋ, ਜਾਂ ਕਹੋ: "ਕੋਈ ਰਿਪੋਰਟ ਨਹੀਂ ਹੈ"।',
      as: 'আপোনাৰ সকলো বিৱৰণ লিপিবদ্ধ কৰা হৈছে। আপোনাৰ ওচৰত কোনো পুৰণি চিকিৎসা প্ৰতিবেদন বা প্ৰেচক্ৰিপশ্বন আছে নেকি? থাকিলে আপলোড কৰক, নতুবা কওক: "কোনো ৰিপোৰ্ট নাই"।',
      ur: 'آپ کی تمام تفصیلات درج کر لی گئی ہیں۔ کیا آپ کے پاس کوئی پرانی میڈیکل رپورٹ یا نسخہ ہے؟ اگر ہے تو اپ لوڈ کریں، یا کہیں: "کوئی رپورٹ نہیں ہے"۔',
      ne: 'तपाईंको सबै विवरण दर्ता गरियो। के तपाईंसँग कुनै पुरानो मेडिकल रिपोर्ट वा प्रेस्क्रिप्सन छ? छ भने अपलोड गर्नुहोस्, नभए भन्नुहोस्: "कुनै रिपोर्ट छैन"।',
      sa: 'भवतां सर्वाणि विवरणानि अङ्कितानि। भवतां पार्श्वे किमपि पुरातनं चिकित्सापत्रं प्रतिवेदनं वा अस्ति किम्? अस्ति चेत् अपलोड् कुर्वन्तु, अथवा वदन्तु: "किमपि प्रतिवेदनं नास्ति"।',
      mai: 'अहाँक सभ जानकारी नोट कऽ लेल गेल अछि। की अहाँक पास कोनो पुरान जांच रिपोर्ट वा पुर्जा अछि? यदि अछि तँ अपलोड करू, वा कहू: "कोनो रिपोर्ट नहि अछि"।',
      kok: 'तुमची सगळी म्हायती नोंद केल्या। तुमचेकडेन आदल्यो कसलयो वैजकी तपासणी रिपोर्ट वा प्रिस्क्रिप्शन आसात? आसल्यार अपलोड करात, ना जाल्यार सांगात: "कसलीच रिपोर्ट ना".',
      sd: 'توهان جا سڀ تفصيل محفوظ ٿي ويا آهن. ڇا توهان وٽ پراڻي ميڊيڪل رپورٽ يا نسخو آهي؟ جيڪڏهن آهي ته اپلوڊ ڪريو، يا چئو: "ڪا به رپورٽ ناهي".',
      doi: 'थुआह्‌रे सारे विवरण नोट करी लित्ते गे न। केह् थुआह्‌रे कोल कोई पुरानी टेस्ट रिपोर्ट या परची ऐ? जे ऐ तां अपलोड करो, या आखो: "कोई रिपोर्ट नेईं ऐ"।',
      mni: 'নহাক্কী অকুপ্পা ৱারোল পুম্নমক ইখৎত্রে। নহাক্কীদা অরিবা মেদিকেল রিপোর্ট নত্রগা প্রেসক্রিপশন লৈব্রা? লৈরবদি অপলোদ তৌবিয়ু, নত্রবদি "অমত্তা লৈতে" হায়বিয়ু।',
      sat: 'ᱟᱢᱟᱜ ᱡᱚᱛᱚ ᱠᱟᱛᱷᱟ ᱚᱞ ᱮᱱᱟ᱾ ᱟᱢ ᱴᱷᱮᱱ ᱢᱟᱨᱮ ᱰᱟᱠᱛᱚᱨ ᱨᱤᱯᱚᱨᱴ ᱥᱮ ᱚᱞ ᱢᱮᱱᱟᱜ-ᱟ? ᱢᱮᱱᱟᱜ ᱠᱷᱟᱱ ᱟᱯᱞᱳᱰ ᱢᱮ, ᱵᱟᱝᱠᱷᱟᱱ ᱞᱟᱹᱭ ᱢᱮ: "ᱪᱮᱫ ᱨᱤᱯᱳᱨᱴ ᱦᱚᱸ ᱵᱟᱹᱱᱩᱜ-ᱟ"᱾',
      brx: 'नोंथांनि गासै खारिथि लिरनाय जाबाय। नोंथांनाव गोजां डाक्टर रिपर्ट एबा प्रिसक्रिपसन दं नामा? दंब्ला आपलोड खालाम, नङाब्ला बुं: "जेबो रिपर्ट गैया"।',
      ks: 'تُہنٛز تَمام تفصیٖل آیہٕ دَرٕج کَرنہٕ۔ کیا تُہنٛدِس نِش چھا کانہہ پرٲنؠ طِبی رِپوورٹ یا نُسخہٕ؟ اگر چھُ تیٚلہِ کٔرِو اَپلوڈ، یا ونِو: "کانٛہہ رِپوورٹ چھُنہٕ"۔',
      en: 'All your clinical details are recorded. Do you have any previous medical lab reports or prescriptions? If you have them, you can upload them now, or say: no reports.'
    };
    return REPORT_PROMPTS[language] || REPORT_PROMPTS.en;
  }

  if (slot === 'vitals') {
    const hr = (esp32Telemetry && esp32Telemetry.connected) ? esp32Telemetry.heart_rate : vitals.heart_rate;
    const sp = (esp32Telemetry && esp32Telemetry.connected) ? esp32Telemetry.spo2 : vitals.spo2;
    const bpSys = (esp32Telemetry && esp32Telemetry.connected) ? esp32Telemetry.blood_pressure_systolic : vitals.systolic_bp;
    const bpDia = (esp32Telemetry && esp32Telemetry.connected) ? esp32Telemetry.blood_pressure_diastolic : vitals.diastolic_bp;
    const tp = (esp32Telemetry && esp32Telemetry.connected) ? esp32Telemetry.temperature : vitals.temperature;
    const hasAny = hr > 0 || sp > 0 || tp > 0 || bpSys > 0;
    if (!hasAny) {
      if (language === 'or') return 'ସେନସରରୁ କୌଣସି ଭାଇଟାଲ୍ସ ତଥ୍ୟ ମିଳିଲା ନାହିଁ (ଆଙ୍ଗୁଠି କିମ୍ବା ପ୍ରୋବ୍ ଚିହ୍ନଟ ହେଲା ନାହିଁ)। ଆଗକୁ ବଢ଼ିବାକୁ କୁହନ୍ତୁ: ଠିକ୍ ଅଛି।';
      if (language === 'hi') return 'सेंसर से कोई वाइटल्स रीडिंग नहीं मिली। आगे बढ़ने के लिए कहें: ठीक है।';
      if (language === 'bn') return 'সেন্সর থেকে কোনো ভাইটালস পাওয়া যায়নি। এগিয়ে যেতে বলুন: ঠিক আছে।';
      return 'No active sensor probe reading detected. Say "continue" to proceed.';
    }
    if (language === 'or') {
      return `ଆପଣଙ୍କ ୩୦ ସେକେଣ୍ଡ ହାରାହାରି ଭାଇଟାଲ୍ସ ସ୍କାନ ହୋଇଛି: ହୃଦସ୍ପନ୍ଦନ ${hr > 0 ? `${hr} bpm` : 'ଚିହ୍ନଟ ହୋଇନାହିଁ'}, ଅମ୍ଳଜାନ ${sp > 0 ? `${sp} ପ୍ରତିଶତ` : 'ଚିହ୍ନଟ ହୋଇନାହିଁ'}, ତାପମାତ୍ରା ${tp > 0 ? `${tp} ଡିଗ୍ରୀ` : 'ଚିହ୍ନଟ ହୋଇନାହିଁ'}। ସବୁ ଠିକ୍ ଅଛି କି? କୁହନ୍ତୁ: ଠିକ୍ ଅଛି।`;
    }
    if (language === 'hi') {
      return `आपके 30 सेकंड औसत वाइटल्स जांचे गए हैं: हृदय गति ${hr > 0 ? `${hr} bpm` : 'उपलब्ध नहीं'}, ऑक्सीजन ${sp > 0 ? `${sp} प्रतिशत` : 'उपलब्ध नहीं'}, तापमान ${tp > 0 ? `${tp} डिग्री` : 'उपलब्ध नहीं'}। आगे बढ़ने के लिए कहें: ठीक है।`;
    }
    if (language === 'bn') {
      return `আপনার ৩০ সেকেন্ড গড় ভাইটালস পরিমাপ করা হয়েছে: পালস ${hr > 0 ? `${hr} bpm` : 'শনাক্ত হয়নি'}, অক্সিজেন ${sp > 0 ? `${sp} শতাংশ` : 'শনাক্ত হয়নি'}, তাপমাত্রা ${tp > 0 ? `${tp} ডিগ্রি` : 'শনাক্ত হয়নি'}। এগিয়ে যেতে বলুন: ঠিক আছে।`;
    }
    return `Your 30-second averaged vitals are captured: Heart rate ${hr > 0 ? `${hr} bpm` : 'not detected'}, Oxygen ${sp > 0 ? `${sp} percent` : 'not detected'},${bpSys > 0 ? ` Blood Pressure ${bpSys} over ${bpDia},` : ''} Temperature ${tp > 0 ? `${tp} degrees Fahrenheit` : 'not detected'}. Say "all good" or "continue" to proceed.`;
  }

  if (slot === 'confirmation') {
    const gText = curGender === 'male' ? (language === 'or' ? 'ପୁରୁଷ' : language === 'hi' ? 'पुरुष' : language === 'bn' ? 'পুরুষ' : 'Male') : curGender === 'female' ? (language === 'or' ? 'ମହିଳା' : language === 'hi' ? 'महिला' : language === 'bn' ? 'মহিলা' : 'Female') : (language === 'or' ? 'ଅନ୍ୟାନ୍ୟ' : language === 'hi' ? 'अन्य' : 'Other');
    const clinicalProblemText = aiUnderstoodSentenceRef.current || curComplaint || (language === 'or' ? 'ସାଧାରଣ ସ୍ୱାସ୍ଥ୍ୟ ପରାମର୍ଶ' : language === 'hi' ? 'सामान्य स्वास्थ्य परामर्श' : language === 'bn' ? 'সাধারণ স্বাস্থ্য পরামর্শ' : 'General clinical consultation');
    const ageDisp = curAge ? String(curAge) : (language === 'or' ? 'ଉଲ୍ଲେଖ ହୋଇନାହିଁ' : language === 'hi' ? 'उल्लेख नहीं है' : language === 'bn' ? 'উল্লেখ নেই' : 'Not provided');
    if (language === 'or') {
      return `ଦୟାକରି ଆପଣଙ୍କ ସମସ୍ତ ବିବରଣୀ ନିଶ୍ଚିତ କରନ୍ତୁ: ରୋଗୀଙ୍କ ନାମ: ${curName || 'ରୋଗୀ'}, ବୟସ: ${ageDisp}, ଲିଙ୍ଗ: ${gText}, ହ୍ୱାଟ୍ସଆପ୍: ${curContact || 'ନାହିଁ'}। ଏଆଇ ଦ୍ୱାରା ବୁଝାଯାଇଥିବା ସମସ୍ୟା: ${clinicalProblemText}। ଟିପ୍ପଣୀ: ଏହା କେବଳ ପ୍ରାଥମିକ ଟ୍ରାୟାଜ୍ ସ୍କ୍ରିନିଂ (ରୋଗ ନିର୍ଣ୍ଣୟ ନୁହେଁ)। ସହମତି ଦେଇ ଡାକ୍ତରଙ୍କ ନିକଟକୁ ପଠାଇବା ପାଇଁ କୁହନ୍ତୁ: ସବମିଟ୍ କରନ୍ତୁ।`;
    }
    if (language === 'hi') {
      return `कृपया अपनी सभी जानकारी की पुष्टि कर लें: मरीज का नाम: ${curName || 'मरीज'}, उम्र: ${ageDisp}, लिंग: ${gText}, व्हाट्सएप: ${curContact || 'नहीं है'}। एआई द्वारा समझी गई समस्या: ${clinicalProblemText}। नोट: यह गैर-निदान ट्रायेज स्क्रीनिंग है। सहमति देकर डॉक्टर को भेजने के लिए कहें: सबमिट करें।`;
    }
    if (language === 'bn') {
      return `দয়া করে আপনার বিবরণ নিশ্চিত করুন: রোগীর নাম: ${curName || 'রোগী'}, বয়স: ${ageDisp}, লিঙ্গ: ${gText}, হোয়াটসঅ্যাপ: ${curContact || 'নেই'}। এআই দ্বারা বিশ্লেষিত সমস্যা: ${clinicalProblemText}। নোট: এটি একটি নন-ডায়াগনস্টিক ট্রায়াজ স্ক্রিনিং। সম্মতি দিয়ে ডাক্তারের কাছে পাঠাতে বলুন: সাবমিট করুন।`;
    }
    return `Please confirm all your details: Patient Name: ${curName || 'Patient'}, Age: ${ageDisp}, Gender: ${gText}, WhatsApp: ${curContact || 'None'}. Problem understood by AI: ${clinicalProblemText}. Note: This is a non-diagnostic triage screening for clinician review. To consent and send this to the doctor, please say: submit.`;
  }

  return '';
};

// Agentic idle timeout: If user is silent for 9.5s, gently nudge according to current intake slot
const armIdleWatchdog = () => {
  if (idleWatchdogTimerRef.current) clearTimeout(idleWatchdogTimerRef.current);
  if (!isMountedRef.current) return;
  idleWatchdogTimerRef.current = setTimeout(() => {
    if (!isMountedRef.current) return;
    if (isTranscribingHardwareRef.current) {
      armIdleWatchdog();
      return;
    }
    if (hasDetectedSpeechRef.current) {
      // Patient has active buffered speech; finish it cleanly instead of speaking over them
      handleVoiceDoneSpeakingRef.current?.();
      return;
    }
    if (voiceStateRef.current === 'listening' && !isAssistantSpeakingRef.current && isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
      const slot = currentIntakeSlotRef.current;
      const nudge = getSlotPrompt(slot, activeQuestionIdx);
      if (nudge) {
        speakText(nudge, () => {
          if (!isMountedRef.current) return;
          if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
            startListeningVoice(handleVoiceInputRef.current);
          }
        });
      } else {
        armIdleWatchdog();
      }
    }
  }, 9500);
};

// Check if patient said "all reports submitted" or done
const isAllReportsSubmitted = (text: string): boolean => {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  const phrases = [
    'all report submitted', 'all reports submitted', 'all report submit', 'all reports submit',
    'all reports are submitted', 'all report are submitted', 'all submitted', 'all submit',
    'report submitted', 'reports submitted', 'submitted', 'done', 'finished', 'finish',
    'complete', 'completed', 'no more reports', 'no more report', 'no report', 'no reports',
    // Odia
    'ସମସ୍ତ ରିପୋର୍ଟ ସବମିଟ୍', 'ସମସ୍ତ ରିପୋର୍ଟ ସବମିଟ୍ ହେଲା', 'ସମସ୍ତ ରିପୋର୍ଟ', 'ସରିଗଲା', 'ସରି ଗଲା',
    'ଆଉ ନାହିଁ', 'ଆଉ ନାହି', 'ସବୁ ଦିଆଗଲା', 'ହୋଇଗଲା', 'ନଥି ସରିଗଲା', 'ନଥି ସବୁ ଦିଆଗଲା',
    'ରିପୋର୍ଟ ସରିଗଲା', 'ରିପୋର୍ଟ ଦିଆଗଲା', 'ସବୁ ରିପୋର୍ଟ',
    // Hindi
    'सभी रिपोर्ट सबमिट', 'सभी रिपोर्ट सबमिट हो गई', 'सबमिट हो गया', 'सब रिपोर्ट दे दिया',
    'हो गया', 'और नहीं है', 'खत्म हो गया', 'रिपोर्ट दे दिया', 'सब हो गया'
  ];
  return phrases.some((p) => lower.includes(p)) || isNegativeReportIntent(text);
};

// Keep telemetry ref synced and subscribe directly to ESP32 serial telemetry packets
useEffect(() => {
  esp32TelemetryRef.current = esp32Telemetry;
}, [esp32Telemetry]);

const syncEsp32Telemetry = (data: TelemetryData) => {
  esp32TelemetryRef.current = data;
  setEsp32Telemetry(data);
  if (isVitalsSamplingRef.current && data.connected) {
    if (data.heart_rate > 0) vitalsSamplesRef.current.hr.push(data.heart_rate);
    if (data.spo2 > 0) vitalsSamplesRef.current.spo2.push(data.spo2);
    if (data.blood_pressure_systolic > 0) vitalsSamplesRef.current.sbp.push(data.blood_pressure_systolic);
    if (data.blood_pressure_diastolic > 0) vitalsSamplesRef.current.dbp.push(data.blood_pressure_diastolic);
    if (data.temperature > 0) vitalsSamplesRef.current.temp.push(data.temperature);
    const totalPackets = Math.max(
      vitalsSamplesRef.current.hr.length,
      vitalsSamplesRef.current.spo2.length,
      vitalsSamplesRef.current.temp.length
    );
    setVitalsSampleCount(totalPackets);
  }
};

useEffect(() => {
  const unsubscribe = esp32SerialService.subscribe({
    onTelemetry: (t) => {
      syncEsp32Telemetry({
        device: t.device || 'ESP32-S3 Medical Kiosk',
        heart_rate: t.heart_rate,
        spo2: t.spo2,
        temperature: t.temperature,
        blood_pressure_systolic: t.blood_pressure_systolic,
        blood_pressure_diastolic: t.blood_pressure_diastolic,
        signal_quality: t.signal_quality || 'good',
        connected: Boolean(t.connected),
      });
    },
  });
  return () => {
    unsubscribe();
    if (vitalsTimerRef.current) {
      clearInterval(vitalsTimerRef.current);
      vitalsTimerRef.current = null;
    }
  };
}, []);

const avgPositive = (arr: number[], decimals: number = 0): number => {
  const valid = arr.filter((v) => typeof v === 'number' && !Number.isNaN(v) && v > 0);
  if (valid.length === 0) return 0;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  if (decimals > 0) {
    const factor = Math.pow(10, decimals);
    return Math.round(mean * factor) / factor;
  }
  return Math.round(mean);
};

const run30SecVitalsAveraging = (
  onComplete?: (averaged: {
    heart_rate: number;
    spo2: number;
    systolic_bp: number;
    diastolic_bp: number;
    temperature: number;
  }) => void
) => {
  if (vitalsTimerRef.current) {
    clearInterval(vitalsTimerRef.current);
    vitalsTimerRef.current = null;
  }
  vitalsSamplesRef.current = { hr: [], spo2: [], sbp: [], dbp: [], temp: [] };
  isVitalsSamplingRef.current = true;
  setIsReadingVitals(true);
  setVitalsCaptured(false);
  setVitalsSampleCount(0);
  setVitalsCountdown(30);
  setVitalsProgress(0);

  let remaining = 30;
  vitalsTimerRef.current = setInterval(() => {
    if (!isMountedRef.current) {
      clearInterval(vitalsTimerRef.current);
      vitalsTimerRef.current = null;
      isVitalsSamplingRef.current = false;
      return;
    }
    remaining -= 1;
    setVitalsCountdown(Math.max(0, remaining));
    setVitalsProgress(Math.min(100, Math.round(((30 - remaining) / 30) * 100)));

    if (remaining <= 0) {
      clearInterval(vitalsTimerRef.current);
      vitalsTimerRef.current = null;
      isVitalsSamplingRef.current = false;
      setIsReadingVitals(false);
      setVitalsProgress(100);

      const s = vitalsSamplesRef.current;
      const curT = esp32TelemetryRef.current;
      const averaged = {
        heart_rate: avgPositive(s.hr) || (curT?.connected && curT.heart_rate > 0 ? Math.round(curT.heart_rate) : 0),
        spo2: avgPositive(s.spo2) || (curT?.connected && curT.spo2 > 0 ? Math.round(curT.spo2) : 0),
        systolic_bp:
          avgPositive(s.sbp) ||
          (curT?.connected && curT.blood_pressure_systolic > 0 ? Math.round(curT.blood_pressure_systolic) : 0),
        diastolic_bp:
          avgPositive(s.dbp) ||
          (curT?.connected && curT.blood_pressure_diastolic > 0 ? Math.round(curT.blood_pressure_diastolic) : 0),
        temperature:
          avgPositive(s.temp, 1) || (curT?.connected && curT.temperature > 0 ? Math.round(curT.temperature * 10) / 10 : 0),
      };

      setVitals(averaged);
      setVitalsCaptured(
        averaged.heart_rate > 0 || averaged.spo2 > 0 || averaged.temperature > 0 || averaged.systolic_bp > 0
      );
      if (onComplete) onComplete(averaged);
    }
  }, 1000);
};

// Helper to add multiple files, run Multimodal Gemini OCR, and speak guidance turn
const handleAddFiles = (files: FileList | File[]) => {
  const incoming = Array.from(files || []);
  const newFiles: File[] = [];
  for (let i = 0; i < incoming.length; i++) {
    const f = incoming[i];
    if (!selectedFiles.some((existing) => existing.name === f.name && existing.size === f.size)) {
      newFiles.push(f);
    }
  }
  if (newFiles.length === 0) return;
  const updated = [...selectedFiles, ...newFiles];
  setSelectedFiles(updated);

  // Run Multimodal Prescription & Lab Report OCR asynchronously for images and PDFs
  newFiles.forEach((f) => {
    const isOcrEligible =
      f.type.startsWith('image/') ||
      f.type === 'application/pdf' ||
      /\.(jpg|jpeg|png|webp|gif|bmp|pdf)$/i.test(f.name);
    if (!isOcrEligible) return;
    const fileKey = `${f.name}:${f.size}`;
    setOcrLoadingFiles((prev) => ({ ...prev, [fileKey]: true }));
    ocrDocument(f)
      .then((ocrData) => {
        if (!isMountedRef.current) return;
        setOcrResults((prev) => ({ ...prev, [fileKey]: ocrData }));
      })
      .catch((err) => {
        console.warn('Multimodal OCR preview error for', f.name, err);
      })
      .finally(() => {
        if (!isMountedRef.current) return;
        setOcrLoadingFiles((prev) => ({ ...prev, [fileKey]: false }));
      });
  });

  if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
    const totalCount = updated.length;
    const uploadSpeech = language === 'or'
      ? `ଆପଣଙ୍କ ${totalCount} ଟି ରିପୋର୍ଟ ଯୋଡ଼ାଗଲା। ଯଦି ଆଉ କିଛି ରିପୋର୍ଟ ଅଛି ତେବେ ଅପଲୋଡ୍ କରନ୍ତୁ, ଅଥବା ସରିଗଲେ କୁହନ୍ତୁ: "ସମସ୍ତ ରିପୋର୍ଟ ସବମିଟ୍ ହେଲା" କିମ୍ବା "ସରିଗଲା"।`
      : language === 'hi'
        ? `आपकी ${totalCount} रिपोर्ट जोड़ दी गई हैं। यदि और भी रिपोर्ट हैं तो अपलोड करें, या समाप्त होने पर कहें: "सभी रिपोर्ट सबमिट हो गई" या "हो गया"।`
        : `Your ${totalCount} document${totalCount > 1 ? 's are' : ' is'} attached. You can attach more files, or when finished, please say: "all reports submitted" or "done".`;

    currentDoctorQuestionRef.current = uploadSpeech;
    setVoiceAgentStatusText(uploadSpeech);
    speakText(uploadSpeech, () => {
      if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
        startListeningVoice(handleVoiceInput);
      }
    });
  }
};

const handleRemoveFile = (index: number) => {
  const targetFile = selectedFiles[index];
  setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  if (targetFile) {
    const fileKey = `${targetFile.name}:${targetFile.size}`;
    setOcrResults((prev) => {
      const next = { ...prev };
      delete next[fileKey];
      return next;
    });
    setOcrLoadingFiles((prev) => {
      const next = { ...prev };
      delete next[fileKey];
      return next;
    });
  }
};

const renderFileOcrPreview = (file: File, darkTheme: boolean = false) => {
  const fileKey = `${file.name}:${file.size}`;
  const isLoading = Boolean(ocrLoadingFiles[fileKey]);
  const ocr = ocrResults[fileKey];
  if (!isLoading && !ocr) return null;

  if (isLoading) {
    return (
      <div
        className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-[11px] flex items-center gap-1.5 ${darkTheme ? 'bg-cream/10 text-cream/80 border border-cream/15' : 'bg-cream text-inkmute border border-ink/10'
          }`}
      >
        <Loader2 className="w-3 h-3 animate-spin text-magenta shrink-0" />
        <span>Running Gemini Vision OCR on {file.name}...</span>
      </div>
    );
  }

  const biomarkers = Array.isArray(ocr?.biomarkers) ? ocr.biomarkers : [];
  const abnormalFlags = biomarkers.filter((b) => (b.status || 'NORMAL').toUpperCase() !== 'NORMAL');
  const meds = Array.isArray(ocr?.medications) ? ocr.medications : [];

  return (
    <div
      className={`mt-1.5 rounded-xl p-2.5 text-[11px] space-y-1.5 ${darkTheme ? 'bg-cream/10 text-cream border border-cream/20' : 'bg-cream text-ink border border-ink/12'
        }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="font-semibold text-magenta">
          OCR: {ocr?.document_type || 'Medical Document'}
        </span>
        <div className="flex items-center gap-1.5">
          {abnormalFlags.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-magenta text-cream">
              {abnormalFlags.length} Abnormal
            </span>
          )}
          <span className="text-[10px] opacity-75">
            {biomarkers.length} markers • {meds.length} meds
          </span>
        </div>
      </div>
      {ocr?.clinical_summary && (
        <p className={`text-[11px] leading-snug ${darkTheme ? 'text-cream/85' : 'text-inkmute'}`}>
          {ocr.clinical_summary}
        </p>
      )}
      {biomarkers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {biomarkers.slice(0, 6).map((b, bi) => {
            const st = (b.status || 'NORMAL').toUpperCase();
            const isAbn = st !== 'NORMAL';
            return (
              <span
                key={bi}
                className={`px-2 py-0.5 rounded-md text-[10px] border ${isAbn
                    ? 'bg-magenta/20 border-magenta/40 font-semibold'
                    : darkTheme
                      ? 'bg-cream/10 border-cream/15'
                      : 'bg-creamdeep border-ink/10'
                  }`}
              >
                {b.parameter}: {b.value} {b.unit || ''} ({st})
              </span>
            );
          })}
        </div>
      )}
      {meds.length > 0 && (
        <p className="text-[10px] opacity-85">
          <strong>Rx:</strong> {meds.slice(0, 4).join(', ')}
        </p>
      )}
    </div>
  );
};

// Trigger live 30-second averaged ESP32 vitals telemetry acquisition sequence
const startLiveVitalsAcquisition = () => {
  currentIntakeSlotRef.current = 'vitals';
  setIntakeSlot('vitals');
  setStep(6);

  const curT = esp32TelemetryRef.current;
  const isConnected = Boolean((curT && curT.connected) || esp32SerialService.getState().isConnected);

  if (!isConnected) {
    setIsReadingVitals(false);
    setVitalsCaptured(false);
    setVitalsProgress(0);
    setVitalsCountdown(0);
    setVitals({
      heart_rate: 0,
      spo2: 0,
      systolic_bp: 0,
      diastolic_bp: 0,
      temperature: 0,
    });

    const sensorNotice = language === 'or'
      ? 'ESP32 ହାର୍ଡୱେର ସେନ୍ସର ସଂଯୋଗ ହୋଇନାହିଁ। ଆମେ ବିନା ସେନ୍ସର ଭାଇଟାଲ୍ସରେ ସିଧାସଳଖ ଡାକ୍ତରଙ୍କ ପରାମର୍ଶ ପାଇଁ ଆଗକୁ ବଢ଼ୁଛୁ।'
      : language === 'hi'
        ? 'ESP32 हार्डवेयर सेंसर जुड़ा नहीं है। हम बिना सेंसर वाइटल्स के सीधे डॉक्टर परामर्श के लिए आगे बढ़ रहे हैं।'
        : 'ESP32 hardware sensor is not connected. We will proceed directly with the doctor consultation.';

    currentDoctorQuestionRef.current = sensorNotice;
    setVoiceAgentStatusText(sensorNotice);

    speakText(sensorNotice, () => {
      handleProceedToConfirmation();
    });
    return;
  }

  const sensorInstruction = language === 'or'
    ? 'ଆପଣଙ୍କ ସମସ୍ତ ରିପୋର୍ଟ ସଂଗୃହୀତ ହେଲା। ଏବେ ଦୟାକରି ESP32 ସେନସର ଉପରେ ଆପଣଙ୍କ ଆଙ୍ଗୁଠି ରଖନ୍ତୁ। ଆମେ ୩୦ ସେକେଣ୍ଡ ପାଇଁ ଲାଇଭ୍ ଭାଇଟାଲ୍ସର ହାରାହାରି ସ୍କାନ କରୁଛୁ...'
    : language === 'hi'
      ? 'आपकी सभी रिपोर्ट प्राप्त हो गई हैं। अब कृपया ESP32 सेंसर पर अपनी उंगली रखें। हम 30 सेकंड तक आपके लाइव वाइटल्स का औसत रिकॉर्ड कर रहे हैं...'
      : 'All reports recorded. Please place your finger on the ESP32 sensor for 30-second live vitals averaging...';

  currentDoctorQuestionRef.current = sensorInstruction;
  setVoiceAgentStatusText(sensorInstruction);

  speakText(sensorInstruction, () => {
    run30SecVitalsAveraging((averaged) => {
      const hasValid =
        averaged.heart_rate > 0 ||
        averaged.spo2 > 0 ||
        averaged.temperature > 0 ||
        averaged.systolic_bp > 0;
      const completionVoice = !hasValid
        ? language === 'or'
          ? 'ESP32 ସେନସରରେ କୌଣସି ଆଙ୍ଗୁଠି କିମ୍ବା ପ୍ରୋବ୍ ଚିହ୍ନଟ ହେଲା ନାହିଁ। ଆଗକୁ ବଢ଼ିବାକୁ କୁହନ୍ତୁ: ଠିକ୍ ଅଛି।'
          : language === 'hi'
            ? 'ESP32 सेंसर पर उंगली या प्रोब नहीं मिला। आगे बढ़ने के लिए कहें: ठीक है।'
            : 'No finger or probe reading detected on the ESP32 sensor. Please say okay or continue to proceed.'
        : language === 'or'
          ? `୩୦ ସେକେଣ୍ଡ ESP32 ଭାଇଟାଲ୍ସ ସ୍କାନ ସମ୍ପୂର୍ଣ୍ଣ ହେଲା: ହୃଦସ୍ପନ୍ଦନ ${averaged.heart_rate > 0 ? `${averaged.heart_rate} bpm` : 'ଚିହ୍ନଟ ହୋଇନାହିଁ'}, ଅମ୍ଳଜାନ ${averaged.spo2 > 0 ? `${averaged.spo2} ପ୍ରତିଶତ` : 'ଚିହ୍ନଟ ହୋଇନାହିଁ'}, ତାପମାତ୍ରା ${averaged.temperature > 0 ? `${averaged.temperature} ଡିଗ୍ରୀ` : 'ଚିହ୍ନଟ ହୋଇନାହିଁ'}। ଆଗକୁ ବଢ଼ିବାକୁ କୁହନ୍ତୁ: ଠିକ୍ ଅଛି।`
          : language === 'hi'
            ? `30 सेकंड ESP32 वाइटल्स औसत जांच पूरी हुई: हृदय गति ${averaged.heart_rate > 0 ? `${averaged.heart_rate} bpm` : 'उपलब्ध नहीं'}, ऑक्सीजन ${averaged.spo2 > 0 ? `${averaged.spo2} प्रतिशत` : 'उपलब्ध नहीं'}, तापमान ${averaged.temperature > 0 ? `${averaged.temperature} डिग्री` : 'उपलब्ध नहीं'}। आगे बढ़ने के लिए कहें: ठीक है।`
            : `30-second ESP32 vitals averaging complete: Heart rate ${averaged.heart_rate > 0 ? `${averaged.heart_rate} bpm` : 'not detected'}, Oxygen ${averaged.spo2 > 0 ? `${averaged.spo2} percent` : 'not detected'},${averaged.systolic_bp > 0 ? ` Blood Pressure ${averaged.systolic_bp} over ${averaged.diastolic_bp},` : ''} Temperature ${averaged.temperature > 0 ? `${averaged.temperature} degrees` : 'not detected'}. Say okay or continue to proceed.`;

      currentDoctorQuestionRef.current = completionVoice;
      setVoiceAgentStatusText(completionVoice);

      speakText(completionVoice, () => {
        if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
          startListeningVoice(handleVoiceInput);
        }
      });
    });
  });
};

const handleAllReportsSubmittedClick = () => {
  startLiveVitalsAcquisition();
};

const handleProceedToConfirmation = () => {
  currentIntakeSlotRef.current = 'confirmation';
  setIntakeSlot('confirmation');
  setStep(7);

  const curName = patientNameRef.current || name.trim();
  const curAge = patientAgeRef.current !== '' ? patientAgeRef.current : age;
  const curGender = patientGenderRef.current || gender;
  const curContact = patientContactRef.current || contact;
  const gText = curGender === 'male' ? (language === 'or' ? 'ପୁରୁଷ' : language === 'hi' ? 'पुरुष' : 'Male') : curGender === 'female' ? (language === 'or' ? 'ମହିଳା' : language === 'hi' ? 'महिला' : 'Female') : (language === 'or' ? 'ଅନ୍ୟାନ୍ୟ' : language === 'hi' ? 'अन्य' : 'Other');
  const clinicalProblemText = aiUnderstoodSentenceRef.current || patientComplaintRef.current || complaint || (language === 'or' ? 'ସାଧାରଣ ସ୍ୱାସ୍ଥ୍ୟ ପରାମର୍ଶ' : language === 'hi' ? 'सामान्य स्वास्थ्य परामर्श' : 'General clinical consultation');

  const ageDisp = curAge ? String(curAge) : (language === 'or' ? 'ଉଲ୍ଲେଖ ହୋଇନାହିଁ' : language === 'hi' ? 'उल्लेख नहीं है' : 'Not provided');
  const cPrompt = language === 'or'
    ? `ଦୟାକରି ଆପଣଙ୍କ ସମସ୍ତ ବିବରଣୀ ନିଶ୍ଚିତ କରନ୍ତୁ: ରୋଗୀଙ୍କ ନାମ: ${curName || 'ରୋଗୀ'}, ବୟସ: ${ageDisp}, ଲିଙ୍ଗ: ${gText}, ହ୍ୱାଟ୍ସଆପ୍: ${curContact || 'ନାହିଁ'}। ସମସ୍ୟା: ${clinicalProblemText}। ସେନସର ଭାଇଟାଲ୍ସ ସଂଲଗ୍ନ ହୋଇଛି। ଟିପ୍ପଣୀ: ଏହା କେବଳ ଟ୍ରାୟାଜ୍ ସ୍କ୍ରିନିଂ (ରୋଗ ନିର୍ଣ୍ଣୟ ନୁହେଁ)। ସହମତି ଦେଇ ଡାକ୍ତରଙ୍କ ନିକଟକୁ ପଠାଇବା ପାଇଁ କୁହନ୍ତୁ: ସବମିଟ୍ କରନ୍ତୁ।`
    : language === 'hi'
      ? `कृपया अपनी सभी जानकारी की पुष्टि कर लें: मरीज का नाम: ${curName || 'मरीज'}, उम्र: ${ageDisp}, लिंग: ${gText}, व्हाट्सएप: ${curContact || 'नहीं है'}। समस्या: ${clinicalProblemText}। सेंसर वाइटल्स संलग्न हैं। नोट: यह गैर-निदान ट्रायेज स्क्रीनिंग है। सहमति देकर डॉक्टर को भेजने के लिए कहें: सबमिट करें।`
      : `Please confirm all your details: Patient Name: ${curName || 'Patient'}, Age: ${ageDisp}, Gender: ${gText}, WhatsApp: ${curContact || 'None'}. Problem: ${clinicalProblemText}. Sensor vitals attached. Note: This is a non-diagnostic triage screening for clinician review. To consent and send this to the doctor, please say: submit.`;

  currentDoctorQuestionRef.current = cPrompt;
  setVoiceAgentStatusText(cPrompt);
  speakText(cPrompt, () => {
    if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
      startListeningVoice(handleVoiceInputRef.current);
    }
  });
};

// Detect negative report intent ("I don't have", "ନାହିଁ", "नहीं है", etc.)
const isNegativeReportIntent = (text: string) => {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  const negativeTerms = [
    'ନାହିଁ', 'ନାହି', 'ମୋ ପାଖରେ ନାହିଁ', 'ମୋ ପାଖରେ ନାହି', 'କିଛି ନାହିଁ', 'ନାଇଁ', 'ନାଇ',
    'କିଛି ନାଇଁ', 'ଦରକାର ନାହିଁ', 'କାଗଜ ନାହିଁ', 'ରିପୋର୍ଟ ନାହିଁ', 'ନାହିଁ କିଛି', 'କିଛି ନାଇ',
    'କିଛି ନାହି', 'ରିପୋର୍ଟ ନାଇଁ', 'ରିପୋର୍ଟ ନାଇ', 'ଦରକାର ନାଇଁ', 'ମୋର କିଛି ନାହିଁ', 'ମୋର କିଛି ନାଇଁ',
    'नहीं', 'नहीं है', 'मेरे पास नहीं है', 'कुछ नहीं है', 'कोई रिपोर्ट नहीं', 'नही', 'नही है',
    'कोई कागज़ नहीं', 'रिपोर्ट नहीं है', 'कोई पर्ची नहीं', 'कुछ नहीं', 'नहीं मिला',
    'no', 'none', "don't have", 'dont have', "i don't have", 'no report', 'no reports',
    'ନା', 'ନାଇଁ ଆଜ୍ଞା', 'ନାହିଁ ଆଜ୍ଞା', 'କିଛି ନାଇ', 'କିଛି ନାଇଁ ଆଜ୍ଞା', 'କୌଣସି ରିପୋର୍ଟ ନାହିଁ',
    'नहीं जी', 'कोई रिपोर्ट नहीं है', 'कुछ नहीं', 'आगे बढ़ें', 'आगे', 'చాలు', 'లేదు',
    'nope', 'nah', 'skip it', 'proceed', 'continue', 'all good',
    'skip', 'nothing', 'i have no reports', "don't have any", 'no documents', 'no document',
    'no prescription', 'without report'
  ];
  return negativeTerms.some((term) => lower.includes(term.toLowerCase()));
};

// Master Conversational AI Doctor Turn Handler (Human-to-Human Clinical Flow)
handleVoiceInput = async (transcript: string) => {
  if (!isMountedRef.current || !transcript || !transcript.trim()) return;

  // Highest priority: If patient says "typing" / "write" / "manual form", immediately transition to manual mode!
  if (isTypingIntent(transcript)) {
    handleStopVoiceAgent();
    return;
  }

  // Discard acoustic echo ONLY immediately (<2200ms) after AI finished speaking and when substantial AI text matches
  const normTrans = transcript.toLowerCase().replace(/[\s.,!?;:।]+/g, ' ').trim();
  const lastAiText = (agentSpeakingText || currentDoctorQuestionRef.current || '').toLowerCase().replace(/[\s.,!?;:।]+/g, ' ').trim();
  const msSinceAiSpeech = lastAiSpeechEndedAtRef.current > 0 ? nowMs() - lastAiSpeechEndedAtRef.current : 999999;
  const isShortValidAction =
    isNegativeReportIntent(transcript) ||
    isAllReportsSubmitted(transcript) ||
    /\b(submit|confirm|done|yes|ok|okay|continue|next)\b/i.test(normTrans);
  if (
    !isShortValidAction &&
    msSinceAiSpeech < 2200 &&
    lastAiText &&
    normTrans.length >= Math.max(20, Math.round(lastAiText.length * 0.65)) &&
    (lastAiText.includes(normTrans) || normTrans.includes(lastAiText))
  ) {
    console.warn('Discarded acoustic echo of assistant speech:', transcript);
    if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
      startListeningVoice(handleVoiceInputRef.current);
    } else {
      voiceStateRef.current = 'ready';
      setVoiceState('ready');
    }
    return;
  }

  // Immediately extract any demographic fields present in patient speech
  const demo = parsePatientDemographics(transcript, language);
  if (demo.name && (!patientNameRef.current || !name)) {
    patientNameRef.current = demo.name;
    setName(demo.name);
  }
  if (demo.age !== '' && (patientAgeRef.current === '' || !age)) {
    patientAgeRef.current = demo.age;
    setAge(demo.age);
  }
  if (demo.gender) {
    patientGenderRef.current = demo.gender;
    setGender(demo.gender);
  }
  if (demo.contact && (!patientContactRef.current || !contact)) {
    patientContactRef.current = demo.contact;
    setContact(demo.contact);
  }

  voiceStateRef.current = 'processing';
  setVoiceState('processing');
  setLoadingStepText(
    language === 'or'
      ? 'ଏଆଇ ଡାକ୍ତର ବିଶ୍ଳେଷଣ କରୁଛନ୍ତି...'
      : language === 'hi'
        ? 'एआई डॉक्टर विश्लेषण कर रहे हैं...'
        : 'AI Doctor is analyzing...'
  );

  const curSlot = currentIntakeSlotRef.current;

  // ── 1. REPORT SLOT (Handling uploaded report or "all reports submitted" / "no reports" / skip) ──
  if (curSlot === 'report') {
    const isNeg = isNegativeReportIntent(transcript);
    const isSubmitted = isAllReportsSubmitted(transcript);

    if (!isNeg && !isSubmitted) {
      // Patient spoke something other than "all reports submitted" or "no reports"
      const reminder = language === 'or'
        ? 'ଯଦି ଆପଣଙ୍କ ପାଖରେ ଆଉ କୌଣସି ରିପୋର୍ଟ ଅଛି ତେବେ ଅପଲୋଡ୍ କରନ୍ତୁ, ଅଥବା ସରିଗଲେ କୁହନ୍ତୁ: "ସମସ୍ତ ରିପୋର୍ଟ ସବମିଟ୍ ହେଲା" କିମ୍ବା "ସରିଗଲା"।'
        : language === 'hi'
          ? 'यदि आपके पास और भी रिपोर्ट हैं तो अपलोड करें, या समाप्त होने पर कहें: "सभी रिपोर्ट सबमिट हो गई" या "हो गया"।'
          : 'Please upload any medical reports, or say: "all reports submitted" or "done" to proceed.';

      currentDoctorQuestionRef.current = reminder;
      setVoiceAgentStatusText(reminder);
      speakText(reminder, () => {
        if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
          startListeningVoice(handleVoiceInputRef.current);
        }
      });
      return;
    }

    startLiveVitalsAcquisition();
    return;
  }

  // ── 2. VITALS SLOT (Affirmation to proceed to final confirmation) ──
  if (curSlot === 'vitals') {
    if (isReadingVitals) {
      const waitNotice = language === 'or'
        ? 'ଦୟାକରି ESP32 ସେନସର ଉପରେ ଆଙ୍ଗୁଠି ରଖି ଅପେକ୍ଷା କରନ୍ତୁ, ସ୍କାନ ଚାଲିଛି...'
        : language === 'hi'
          ? 'कृपया ESP32 सेंसर पर उंगली रखकर प्रतीक्षा करें, जांच जारी है...'
          : 'Please keep your finger on the ESP32 sensor, scan in progress...';
      setVoiceAgentStatusText(waitNotice);
      speakText(waitNotice, () => {
        if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
          startListeningVoice(handleVoiceInputRef.current);
        }
      });
      return;
    }

    const lower = transcript.toLowerCase();
    const vitalsOkKeywords = [
      'ok', 'okay', 'continue', 'proceed', 'next', 'yes', 'fine', 'good', 'done',
      'ଠିକ୍ ଅଛି', 'ହଁ', 'ଆଗକୁ ବଢ଼ନ୍ତୁ', 'ଠିକ', 'ଆଗକୁ', 'ହଉ',
      'ठीक है', 'हाँ', 'आगे बढ़ें', 'आगे', 'अच्छा'
    ];
    const isConfirmed = vitalsOkKeywords.some(k => lower.includes(k.toLowerCase()));
    if (isConfirmed || vitalsCaptured) {
      handleProceedToConfirmation();
      return;
    }
    const vitalsRetryPrompt = language === 'or'
      ? 'ଆଗକୁ ବଢ଼ିବା ପାଇଁ "ଆଗକୁ ବଢ଼ନ୍ତୁ" କିମ୍ବା "ଠିକ୍ ଅଛି" କୁହନ୍ତୁ।'
      : language === 'hi'
        ? 'आगे बढ़ने के लिए कृपया "ठीक है" या "आगे बढ़ें" कहें।'
        : 'Please keep your finger on the sensor or say "continue" to proceed.';
    setVoiceAgentStatusText(vitalsRetryPrompt);
    speakText(vitalsRetryPrompt, () => {
      if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
        startListeningVoice(handleVoiceInputRef.current);
      }
    });
    return;
  }

  // ── 3. CONFIRMATION SLOT (Submission or verbal corrections) ──
  if (curSlot === 'confirmation') {
    const lower = transcript.toLowerCase();
    const submitKeywords = [
      'submit', 'yes', 'confirm', 'consult', 'doctor', 'start', 'done', 'ok', 'okay',
      'ସବମିଟ୍', 'ହଁ', 'ଡାକ୍ତର', 'ଆରମ୍ଭ କରନ୍ତୁ', 'ଠିକ୍ ଅଛି', 'ପଠାନ୍ତୁ', 'କରନ୍ତୁ',
      'सबमिट', 'हाँ', 'परामर्श', 'डॉक्टर', 'शुरू करें', 'कंसल्टेशन', 'भेज दीजिए', 'कर दो'
    ];
    const isConfirmed = submitKeywords.some((kw) => lower.includes(kw.toLowerCase()));
    if (isConfirmed) {
      currentIntakeSlotRef.current = 'submitted';
      setIntakeSlot('submitted');
      const submitAck = language === 'or'
        ? 'ଧନ୍ୟବାଦ! ଆପଣଙ୍କ କେସ୍ ଡାକ୍ତରଙ୍କ ନିକଟକୁ ସବମିଟ୍ କରାଯାଉଛି...'
        : language === 'hi'
          ? 'धन्यवाद! आपका केस डॉक्टर के पास सबमिट किया जा रहा है...'
          : 'Thank you! Submitting your consultation to the doctor now...';
      setVoiceAgentStatusText(submitAck);
      speakText(submitAck, () => {
        setDisclaimerAccepted(true);
        disclaimerAcceptedRef.current = true;
        handleSubmit();
      });
      return;
    }
    const confirmRetryPrompt = language === 'or'
      ? 'ଆପଣଙ୍କ କେସ୍ ଡାକ୍ତରଙ୍କ ପାଖକୁ ପଠାଇବା ପାଇଁ ଦୟାକରି "ସବମିଟ୍" କୁହନ୍ତୁ।'
      : language === 'hi'
        ? 'अपना केस डॉक्टर को भेजने के लिए कृपया "सबमिट" कहें।'
        : 'To send your triage summary to the doctor, please say "submit".';
    setVoiceAgentStatusText(confirmRetryPrompt);
    speakText(confirmRetryPrompt, () => {
      if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
        startListeningVoice(handleVoiceInputRef.current);
      }
    });
    return;
  }

  // ── 4. REAL-TIME AI CLINICAL CONVERSATION (Gemini + Sarvam 105B) ──
  const computeNextIntakeSlot = (nextStepNum: number): VoiceIntakeSlot => {
    if (!patientNameRef.current) return 'name';
    if (patientAgeRef.current === '' || !patientAgeRef.current) return 'age';
    if (!patientGenderRef.current) return 'gender';
    if (!patientContactRef.current && !whatsappSkippedRef.current) return 'whatsapp';
    if (!patientComplaintRef.current) return 'problem';
    if (nextStepNum <= 4) return 'followup';
    return 'report';
  };

  const handleVoiceTurnResult = (turnTranscript: string, aiRes: any) => {
    const isCorrectionSpoken = /(?:ବଦଳାନ୍ତୁ|ସୁଧାରନ୍ତୁ|କରନ୍ତୁ|ନୁହେଁ|ନୁହେ|ଭୁଲ|change|update|correct|instead|not|बदलो|बदलें|सुधारें|गलत|नहीं)/i.test(turnTranscript);
    if (isCorrectionSpoken) {
      const parsedCorrection = extractNameAndCorrection(turnTranscript, false);
      if (parsedCorrection.name) {
        patientNameRef.current = parsedCorrection.name;
        setName(parsedCorrection.name);
      }
      const parsedNA = parsePatientNameAndAge(turnTranscript, language);
      if (parsedNA.name && !parsedCorrection.name) {
        patientNameRef.current = parsedNA.name;
        setName(parsedNA.name);
      }
      if (parsedNA.age !== '') {
        patientAgeRef.current = parsedNA.age;
        setAge(parsedNA.age);
      }
      const gFromSpeech = normalizeGender(turnTranscript);
      if (gFromSpeech) {
        patientGenderRef.current = gFromSpeech;
        setGender(gFromSpeech);
      }
      const parsedPhone = parsePhoneNumber(turnTranscript);
      if (parsedPhone) {
        patientContactRef.current = parsedPhone;
        setContact(parsedPhone);
      }
    }

    // Resolve fields from AI response
    const resolvedName = (aiRes.updated_name || aiRes.name || '').trim();
    if (resolvedName && !isGreetingOnly(resolvedName) && !isClinicalOrSymptomText(resolvedName)) {
      patientNameRef.current = resolvedName;
      setName(resolvedName);
    }

    const rawAge = aiRes.updated_age !== undefined && aiRes.updated_age !== null ? aiRes.updated_age : aiRes.age;
    if (rawAge && Number(rawAge) >= 1 && Number(rawAge) <= 125) {
      const a = Number(rawAge);
      patientAgeRef.current = a;
      setAge(a);
    }

    const rawGender = aiRes.updated_gender || aiRes.gender;
    const normGender = normalizeGender(rawGender) || normalizeGender(turnTranscript);
    if (normGender) {
      patientGenderRef.current = normGender;
      setGender(normGender);
    }

    const pContact = aiRes.updated_contact || aiRes.contact || aiRes.whatsapp_number;
    if (pContact) {
      const cleanDigits = String(pContact).replace(/\D/g, '');
      if (cleanDigits.length === 10) {
        patientContactRef.current = cleanDigits;
        setContact(cleanDigits);
      }
    }

    if (!patientContactRef.current) {
      const parsedPhone = parsePhoneNumber(turnTranscript);
      if (parsedPhone) {
        patientContactRef.current = parsedPhone;
        setContact(parsedPhone);
      } else if (
        curSlot === 'whatsapp' &&
        (aiRes.whatsapp_skipped ||
          /\b(skip|no|none|nope|nah|dont\s*have|do\s*not\s*have|no\s*number|later|nahi|nhi)\b|ନାହିଁ|ନାଇଁ|नहीं|নেই|নাই/i.test(turnTranscript))
      ) {
        whatsappSkippedRef.current = true;
      }
    }

    if (!patientNameRef.current || patientAgeRef.current === '' || !patientGenderRef.current) {
      const parsedNA = parsePatientNameAndAge(turnTranscript, language);
      if (!patientNameRef.current && parsedNA.name) {
        patientNameRef.current = parsedNA.name;
        setName(parsedNA.name);
      }
      if (patientAgeRef.current === '' && parsedNA.age !== '') {
        patientAgeRef.current = parsedNA.age;
        setAge(parsedNA.age);
      }
      if (!patientGenderRef.current) {
        const gFromSpeech = normalizeGender(turnTranscript);
        if (gFromSpeech) {
          patientGenderRef.current = gFromSpeech;
          setGender(gFromSpeech);
        }
      }
    }

    const isSpokenTranscriptIntro = isPureDemographicIntro(turnTranscript);
    const isProblemTurn =
      curSlot === 'problem' ||
      (!patientComplaintRef.current &&
        curSlot !== 'whatsapp' &&
        curSlot !== 'gender' &&
        Boolean(patientNameRef.current) &&
        (patientAgeRef.current !== '' || Boolean(patientContactRef.current) || whatsappSkippedRef.current));

    if (isProblemTurn && turnTranscript.trim().length >= 2 && !isSpokenTranscriptIntro && !isGreetingOnly(turnTranscript)) {
      const compToSave = aiRes.complaint && aiRes.complaint.trim().length >= 2 ? aiRes.complaint.trim() : turnTranscript.trim();
      patientComplaintRef.current = compToSave;
      setComplaint(compToSave);
    }

    if (aiRes.complaint && aiRes.complaint.trim()) {
      const cComplaint = aiRes.complaint.trim();
      const isIntro = isPureDemographicIntro(cComplaint);
      const isOnlyGreeting = isGreetingOnly(cComplaint);
      const isClinical = isGenuineClinicalSymptom(cComplaint);
      const hasPatientNameInComp = Boolean(patientNameRef.current && cComplaint.toLowerCase().includes(patientNameRef.current.toLowerCase()));
      const isNegativeComp = /(?:କୌଣସି\s*ଅସୁବିଧା\s*ନାହିଁ|କିଛି\s*ଅସୁବିଧା\s*ନାହିଁ|କିଛି\s*ନାହିଁ|କୌଣସି\s*ରୋଗ\s*ନାହିଁ|কোনো\s*সমস্যা\s*নেই|কিছু\s*না|নেই|कोई\s*तकलीफ\s*नहीं|कुछ\s*नहीं|no\s*problem|no\s*symptoms|nothing)/i.test(cComplaint);

      if (!isSpokenTranscriptIntro && !isOnlyGreeting && !isIntro && isClinical && !hasPatientNameInComp && !isNegativeComp) {
        patientComplaintRef.current = cComplaint;
        setComplaint(cComplaint);
      }
    }

          if (aiRes.duration && aiRes.duration.trim()) {
            const cDuration = aiRes.duration.trim();
            patientDurationRef.current = cDuration;
            setDuration(cDuration);
          }

          if (aiRes.severity && ['mild', 'moderate', 'severe'].includes(aiRes.severity)) {
            setSeverity(aiRes.severity as 'mild' | 'moderate' | 'severe');
          }

          if (aiRes.medical_history && aiRes.medical_history.trim()) {
            patientMedicalHistoryRef.current = aiRes.medical_history.trim();
            setMedicalHistory(aiRes.medical_history.trim());
          }

          // Synthesize AI understood clinical summary sentence ONLY if a clinical complaint is recorded
          if (patientComplaintRef.current && patientComplaintRef.current.trim().length >= 3) {
            const comp = patientComplaintRef.current;
            const dur = patientDurationRef.current || aiRes.duration || (language === 'or' ? 'କିଛି ଦିନ' : language === 'hi' ? 'कुछ दिन' : 'A few days');
            const sev = (aiRes.severity as any) || severity;
            const synSentence = synthesizeClinicalSentence(comp, dur, language, sev, patientNameRef.current || name);
            if (synSentence) {
              aiUnderstoodSentenceRef.current = synSentence;
            }
          }

          if (aiRes.questions && aiRes.questions.length > 0) {
            setFollowUpQuestions(aiRes.questions);
          }

          // Determine Doctor's verbal response and advance sequential slot cleanly
          const candidateStep = aiRes.next_step || currentConsultationStepRef.current + 1;
          // If complaint is already recorded, DO NOT retreat back to Step 1 or 2!
          const nextStepNum =
            patientComplaintRef.current && candidateStep < 3 && currentConsultationStepRef.current >= 3
              ? currentConsultationStepRef.current
              : candidateStep;
          currentConsultationStepRef.current = nextStepNum;
          setStep(nextStepNum);
          currentQuestionIdxRef.current += 1;

          const nextSlot = computeNextIntakeSlot(nextStepNum);
          currentIntakeSlotRef.current = nextSlot;
          setIntakeSlot(nextSlot);

          if (curSlot === 'followup') {
            followUpTurnCountRef.current += 1;
          }

          let doctorText = (aiRes.reply || '').trim();
          if (!doctorText) {
            doctorText = getSlotPrompt(nextSlot, currentQuestionIdxRef.current);
          }

          // Check if consultation is complete and ready for prior reports (Loop Breaker)
          const hasIdentity = Boolean(patientNameRef.current && (patientAgeRef.current || patientContactRef.current || whatsappSkippedRef.current));
          const hasClinicalProblem = Boolean(
            patientComplaintRef.current &&
            isGenuineClinicalSymptom(patientComplaintRef.current) &&
            !isPureDemographicIntro(patientComplaintRef.current)
          );
          const shouldFinishIntake = Boolean(
            !isCorrectionSpoken &&
            hasClinicalProblem &&
            (
              aiRes.is_finished ||
              nextStepNum >= 5 ||
              followUpTurnCountRef.current >= 2 ||
              (hasIdentity && consultationTurnCountRef.current >= 5) ||
              consultationTurnCountRef.current >= 7
            )
          );

          if (hasIdentity && hasClinicalProblem && shouldFinishIntake) {
            currentConsultationStepRef.current = 5;
            setStep(5);
            currentIntakeSlotRef.current = 'report';
            setIntakeSlot('report');

            // Extract preamble acknowledgment from doctorText if any, and transition cleanly to report inquiry
            const ackMatch = doctorText.match(/^([^.?।!]+[।!.]\s*)/);
            const ackPreamble = ackMatch ? ackMatch[0].trim() + ' ' : '';

            const reportInquiry = language === 'or'
              ? `${ackPreamble}ଆପଣଙ୍କର ସମସ୍ତ ବିବରଣୀ ନୋଟ୍ କରାଗଲା। ଆପଣଙ୍କ ପାଖରେ କୌଣସି ପୁରୁଣା ଡାକ୍ତରୀ ରିପୋର୍ଟ ବା ପ୍ରେସକ୍ରିପସନ୍ ଅଛି କି? ଯଦି ଅଛି ତେବେ ଅପଲୋଡ୍ କରନ୍ତୁ, ଅଥବା କୁହନ୍ତୁ: 'କୌଣସି ରିପୋର୍ଟ ନାହିଁ' କିମ୍ବା 'ସରିଗଲା'।`
              : language === 'hi'
                ? `${ackPreamble}आपके सभी विवरण नोट कर लिए गए हैं। क्या आपके पास कोई पुरानी जांच रिपोर्ट या डॉक्टर की पर्ची है? यदि है तो अपलोड करें, या कहें: 'कोई रिपोर्ट नहीं है' या 'हो गया'।`
                : `${ackPreamble}All your details are noted. Do you have any previous medical lab reports or prescriptions to upload? If not, just say 'no reports' or 'done'.`;

    doctorText = reportInquiry;
  } else {
    // Enforce strictly ONE single question in doctorText so user is never overwhelmed
    doctorText = clipToSingleQuestion(doctorText);
  }

  // Anti-Repetition Guard
  if (doctorText && currentDoctorQuestionRef.current) {
    const normCurrent = currentDoctorQuestionRef.current.replace(/[\s.,!?;:।~_/\-'"()[\]{}]+/g, ' ').trim().toLowerCase();
    const normNew = doctorText.replace(/[\s.,!?;:।~_/\-'"()[\]{}]+/g, ' ').trim().toLowerCase();
    const isRepeatingCurrent = normCurrent && normNew && (normCurrent === normNew || normNew.includes(normCurrent) || normCurrent.includes(normNew));
    const isRepeatingProblemInquiry = Boolean(patientComplaintRef.current && (
      normNew.includes('ଅସୁବିଧା') || normNew.includes('କଷ୍ଟ') ||
      normNew.includes('तकलीफ') || normNew.includes('बीमारी') || normNew.includes('परेशानी') ||
      normNew.includes('অসুবিধা') || normNew.includes('শারীরিক কষ্ট') ||
      normNew.includes('సమస్య') || normNew.includes('నొప్పి') ||
      normNew.includes('உபாத') || normNew.includes('symptoms') || normNew.includes('trouble') || normNew.includes('bothering')
    ));
    if (isRepeatingCurrent || isRepeatingProblemInquiry) {
      if (!patientComplaintRef.current && curSlot === 'problem' && turnTranscript.trim().length >= 2) {
        patientComplaintRef.current = turnTranscript.trim();
        setComplaint(turnTranscript.trim());
      }
      if (patientComplaintRef.current) {
        // Advance unconditionally to prior reports in patient's authentic native language
        doctorText = getSlotPrompt('report');
        currentIntakeSlotRef.current = 'report';
        setIntakeSlot('report');
        currentConsultationStepRef.current = 5;
        setStep(5);
      } else {
        const forcedSlot = computeNextIntakeSlot(nextStepNum);
        doctorText = getSlotPrompt(forcedSlot, currentQuestionIdxRef.current);
        currentIntakeSlotRef.current = forcedSlot;
        setIntakeSlot(forcedSlot);
      }
    }
  }

    setLoadingStepText(null);
    currentDoctorQuestionRef.current = doctorText;
    setVoiceAgentStatusText(doctorText);

    speakText(doctorText, () => {
      if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
        startListeningVoice(handleVoiceInputRef.current);
      }
    });
  };

  // ── 4. REAL-TIME AI CLINICAL CONVERSATION (Gemini + Sarvam 105B) ──
  try {
    consultationTurnCountRef.current += 1;

    const historyPayload = conversationHistoryRef.current.slice(-10).map((msg) => ({
      sender: msg.sender === 'ai' ? 'assistant' : 'patient',
      text: msg.text,
    }));

    const curStepNum = currentConsultationStepRef.current || step;
    const curQIdx = currentQuestionIdxRef.current || activeQuestionIdx;

    const aiRes = await analyzeVoiceIntake({
      transcript: transcript.trim(),
      step: curStepNum,
      language: language,
      patient_name: patientNameRef.current || name.trim(),
      patient_age: patientAgeRef.current !== '' ? patientAgeRef.current : (age !== '' ? age : undefined),
      patient_gender: patientGenderRef.current || gender || undefined,
      patient_contact: patientContactRef.current || contact.trim(),
      chief_complaint: patientComplaintRef.current || complaint.trim(),
      current_question: currentDoctorQuestionRef.current,
      question_index: curQIdx,
      total_questions_target: 2,
      conversation_history: historyPayload,
      current_slot: curSlot,
    });

    handleVoiceTurnResult(transcript.trim(), aiRes);
  } catch (err) {
    console.warn('AI Voice Intake Error:', err);
    // Local recovery fallback: advance cleanly to the next slot and ask Ananya's next question
    if (
      curSlot === 'whatsapp' &&
      /\b(skip|no|none|nope|nah|dont\s*have|do\s*not\s*have|no\s*number|later|nahi|nhi)\b|ନାହିଁ|ନାଇଁ|नहीं|নেই|নাই/i.test(transcript)
    ) {
      whatsappSkippedRef.current = true;
    } else if (curSlot === 'problem' && !patientComplaintRef.current && transcript.trim().length >= 2) {
      patientComplaintRef.current = transcript.trim();
      setComplaint(transcript.trim());
    }
    const nextFallbackSlot = computeNextIntakeSlot((currentConsultationStepRef.current || step) + 1);
    currentIntakeSlotRef.current = nextFallbackSlot;
    setIntakeSlot(nextFallbackSlot);
    const fallbackReply = getSlotPrompt(nextFallbackSlot, currentQuestionIdxRef.current);

    setLoadingStepText(null);
    currentDoctorQuestionRef.current = fallbackReply;
    setVoiceAgentStatusText(fallbackReply);
    speakText(fallbackReply, () => {
      if (isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
        startListeningVoice(handleVoiceInputRef.current);
      }
    });
  }
};

const getSlotPromptRef = useRef(getSlotPrompt);
const speakTextRef = useRef(speakText);
const startListeningVoiceRef = useRef(startListeningVoice);
const handleVoiceInputRef = useRef(handleVoiceInput);

useEffect(() => {
  getSlotPromptRef.current = getSlotPrompt;
  speakTextRef.current = speakText;
  startListeningVoiceRef.current = startListeningVoice;
  handleVoiceInputRef.current = handleVoiceInput;
});

// Conversational Doctor Greeting & Orchestrator
useEffect(() => {
  if (!isVoiceAgentActive || isVoicePaused) return;

  // 150ms debounce guarantees safe execution in real mounted DOM, shielding against React 18 StrictMode double-mounting
  const timer = setTimeout(() => {
    if (!isMountedRef.current || !isVoiceAgentActiveRef.current || isVoicePausedRef.current) return;
    if (hasStartedConversationRef.current) return;
    hasStartedConversationRef.current = true;

    const initialGreeting = getSlotPromptRef.current(currentIntakeSlotRef.current || 'name');

    currentDoctorQuestionRef.current = initialGreeting;
    setVoiceAgentStatusText(initialGreeting);
    speakTextRef.current(initialGreeting, () => {
      if (isMountedRef.current && isVoiceAgentActiveRef.current && !isVoicePausedRef.current) {
        startListeningVoiceRef.current(handleVoiceInputRef.current);
      }
    });
  }, 150);

  return () => {
    clearTimeout(timer);
  };
}, [isVoiceAgentActive, isVoicePaused, language]);


// Handle in-field voice dictation for Chief Complaint (for non-voice-agent mode)
const handleDictateComplaint = async () => {
  if (isListeningComplaint) {
    stopAllVoiceActivity();
    setIsListeningComplaint(false);
    return;
  }
  setIsListeningComplaint(true);
  startListeningVoice((transcript) => {
    setComplaint((prev) => (prev ? `${prev} ${transcript}` : transcript));
    setIsListeningComplaint(false);
  });
};

// Replay current step doctor prompt
const handleRepeatCurrentPrompt = () => {
  lastSpokenStepRef.current = '';
  stopAllVoiceActivity();
  const prompt = currentDoctorQuestionRef.current || (language === 'or' ? 'ଦୟାକରି ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା ବିଷୟରେ କୁହନ୍ତୁ।' : 'Please describe your symptoms.');
  if (prompt) {
    setVoiceAgentStatusText(prompt);
    speakText(prompt, () => {
      startListeningVoice(handleVoiceInput);
    });
  }
};

const handleSwitchLanguage = (newLang: SupportedLanguage) => {
  setLanguage(newLang);
  lastSpokenStepRef.current = '';
  stopAllVoiceActivity();
  const switchGreeting = newLang === 'or'
    ? 'ନମସ୍କାର, ମୁଁ ଆପଣଙ୍କ ଏଆଇ ଡାକ୍ତର ସହାୟକ। ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା ବିଷୟରେ ଦୟାକରି କୁହନ୍ତୁ।'
    : newLang === 'hi'
      ? 'नमस्ते, मैं आपकी एआई डॉक्टर सहायक हूँ। कृपया अपनी स्वास्थ्य समस्या के बारे में बताइए।'
      : 'Hello, I am your AI clinical doctor assistant. Please describe your health symptoms.';
  currentDoctorQuestionRef.current = switchGreeting;
  setVoiceAgentStatusText(switchGreeting);
  speakText(switchGreeting, () => {
    startListeningVoice(handleVoiceInput);
  });
};

const handleOrbClick = () => {
  try {
    const dummy = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    dummy.play().catch(() => { });
  } catch { }

  if (isAudioBlocked && pendingAudioRef.current) {
    handleUnlockAudio();
    return;
  }

  if (voiceState === 'listening') {
    handleVoiceDoneSpeaking();
    return;
  }

  // Instantly interrupt assistant speech or processing and start listening
  stopAllVoiceActivity();
  if (isVoicePaused) setIsVoicePaused(false);
  startListeningVoice(currentStepListeningHandlerRef.current || handleVoiceInput);
};

// Direct activation of Voice Agent from Step 1
const handleJumpToVoice = () => {
  lastSpokenStepRef.current = '';
  currentIntakeSlotRef.current = 'name';
  setIntakeSlot('name');
  try {
    const dummy = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    dummy.play().catch(() => { });
  } catch { }
  setIsVoiceAgentActive(true);
  setStep(1);
};

const handleToggleVoicePause = () => {
  if (isVoicePaused) {
    lastSpokenStepRef.current = '';
    setIsVoicePaused(false);
    setVoiceState('ready');
  } else {
    setIsVoicePaused(true);
    stopAllVoiceActivity();
    setVoiceState('paused');
  }
};

const handleStopVoiceAgent = () => {
  lastSpokenStepRef.current = '';
  setIsVoiceAgentActive(false);
  setIsVoicePaused(false);
  stopAllVoiceActivity();
};


// Real 30-second ESP32 vitals averaging re-scan (no synthetic defaults)
const handleRescanVitals = () => {
  if (!esp32TelemetryRef.current?.connected && !esp32SerialService.getState().isConnected) {
    setIsReadingVitals(false);
    setVitalsCaptured(false);
    setVitalsProgress(0);
    setVitalsCountdown(0);
    setVitalsSampleCount(0);
    setVitals({
      heart_rate: 0,
      spo2: 0,
      systolic_bp: 0,
      diastolic_bp: 0,
      temperature: 0,
    });
    return;
  }
  run30SecVitalsAveraging();
};

// Validation per step
const handleNext = async () => {
  setError(null);
  if (step === 1) {
    if (!name.trim()) {
      setError(language === 'hi' ? 'कृपया अपना पूरा नाम दर्ज करें।' : language === 'or' ? 'ଦୟାକରି ଆପଣଙ୍କ ପୂରା ନାମ ଲେଖନ୍ତୁ।' : 'Please enter your full name or preferred identifier.');
      return;
    }
    if (age === '' || Number(age) < 0 || Number(age) > 130) {
      setError(language === 'hi' ? 'कृपया 0 से 130 के बीच एक मान्य आयु दर्ज करें।' : language === 'or' ? 'ଦୟାକରି ୦ ରୁ ୧୩୦ ମଧ୍ୟରେ ଏକ ବୈଧ ବୟସ ଦିଅନ୍ତୁ।' : 'Please enter a valid age between 0 and 130.');
      return;
    }
    setStep(2);
  } else if (step === 2) {
    if (!complaint.trim() || complaint.trim().length < 4) {
      setError(language === 'hi' ? 'कृपया अपनी मुख्य स्वास्थ्य समस्या का वर्णन कम से कम 4 अक्षरों में करें।' : language === 'or' ? 'ଦୟାକରି ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା ଅତି କମରେ ୪ ଅକ୍ଷରରେ ବର୍ଣ୍ଣନା କରନ୍ତୁ।' : 'Please describe your chief health complaint in at least 4 characters.');
      return;
    }
    setStep(3);
  } else if (step === 3) {
    // Fetch dynamic follow-up questions
    setLoadingQuestions(true);
    try {
      const res = await getFollowUpQuestions(complaint, language);
      if (res.questions && res.questions.length > 0) {
        setFollowUpQuestions(res.questions);
      } else {
        setFollowUpQuestions(
          language === 'hi'
            ? [
              'ये लक्षण सबसे पहले कब शुरू हुए थे?',
              'क्या किसी स्थिति से परेशानी कम या ज़्यादा महसूस होती है?',
            ]
            : language === 'or'
              ? [
                'ଏହି ଲକ୍ଷଣଗୁଡ଼ିକ ପ୍ରଥମେ କେବେ ଆରମ୍ଭ ହୋଇଥିଲା?',
                'କୌଣସି ସ୍ଥିତି ବା କାର୍ଯ୍ୟ ଦ୍ୱାରା ସମସ୍ୟା କମ ବା ବେଶୀ ହେଉଛି କି?',
              ]
              : [
                'When did you first notice these symptoms?',
                'Has anything made the symptoms feel noticeably better or worse?',
              ]
        );
      }
      if (res.detected_symptoms) setDetectedSymptoms(res.detected_symptoms);
      if (res.disclaimer) setClinicalDisclaimer(res.disclaimer);
    } catch {
      setFollowUpQuestions(
        language === 'hi'
          ? [
            'ये लक्षण सबसे पहले कब शुरू हुए थे?',
            'क्या किसी स्थिति से परेशानी कम या ज़्यादा महसूस होती है?',
          ]
          : language === 'or'
            ? [
              'ଏହି ଲକ୍ଷଣଗୁଡ଼ିକ ପ୍ରଥମେ କେବେ ଆରମ୍ଭ ହୋଇଥିଲା?',
              'କୌଣସି ସ୍ଥିତି ବା କାର୍ଯ୍ୟ ଦ୍ୱାରା ସମସ୍ୟା କମ ବା ବେଶୀ ହେଉଛି କି?',
            ]
            : [
              'When did you first notice these symptoms?',
              'Has anything made the symptoms feel noticeably better or worse?',
            ]
      );
    } finally {
      setLoadingQuestions(false);
      setActiveQuestionIdx(0);
      setStep(4);
    }
  } else if (step === 4) {
    setStep(5);
  } else if (step === 5) {
    setStep(6);
  } else if (step === 6) {
    setStep(7);
  }
};

const handleVoiceAnswerConfirmed = (answerText: string) => {
  setFollowUpAnswers((prev) => ({
    ...prev,
    [activeQuestionIdx]: answerText,
  }));
  // Move to next question if available
  if (activeQuestionIdx + 1 < followUpQuestions.length) {
    setActiveQuestionIdx((prev) => prev + 1);
  }
};

const handleSubmit = async () => {
  handleSubmitRef.current = handleSubmit;
  if (hasSubmittedRef.current) return;

  const isAccepted = disclaimerAcceptedRef.current || disclaimerAccepted;
  if (!isAccepted) {
    setError(
      language === 'hi'
        ? 'कृपया आगे बढ़ने से पहले अस्वीकरण स्वीकार करें।'
        : language === 'or'
          ? 'ଦୟାକରି ଆଗକୁ ବଢ଼ିବା ପୂର୍ବରୁ ସର୍ତ୍ତାବଳୀ ସ୍ୱୀକାର କରନ୍ତୁ।'
          : 'Please accept the clinical disclaimer before submitting.'
    );
    return;
  }

  const activeAgeRaw = patientAgeRef.current !== '' ? patientAgeRef.current : age;
  const activeAge =
    activeAgeRaw !== '' && !Number.isNaN(Number(activeAgeRaw)) && Number(activeAgeRaw) > 0
      ? Number(activeAgeRaw)
      : undefined;
  if (!activeAge) {
    setError(
      language === 'or'
        ? 'ଦୟାକରି ଆପଣଙ୍କ ବୟସ ଦିଅନ୍ତୁ।'
        : language === 'hi'
          ? 'कृपया अपनी उम्र दर्ज करें।'
          : 'Please provide patient age before submitting.'
    );
    return;
  }

  hasSubmittedRef.current = true;
  setIsSubmitting(true);
  setError(null);

  // Prime/unlock shared audio element within user interaction gesture
  if (typeof window !== 'undefined') {
    try {
      const sharedAudio = getOrCreateSharedAudio();
      sharedAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      sharedAudio.play().catch(() => { });
    } catch { }
  }

  const answersList = followUpQuestions.map((q, idx) => ({
    question: q,
    answer: followUpAnswers[idx] || (language === 'hi' ? 'उत्तर नहीं दिया' : language === 'or' ? 'ଉତ୍ତର ଦିଆଯାଇନାହିଁ' : 'Not answered'),
  }));

  const liveT = esp32TelemetryRef.current;
  const isHardwareActive = Boolean(liveT && liveT.connected);
  const hrVal = vitals.heart_rate > 0 ? vitals.heart_rate : isHardwareActive && liveT!.heart_rate > 0 ? liveT!.heart_rate : 0;
  const spo2Val = vitals.spo2 > 0 ? vitals.spo2 : isHardwareActive && liveT!.spo2 > 0 ? liveT!.spo2 : 0;
  const sbpVal =
    vitals.systolic_bp > 0
      ? vitals.systolic_bp
      : isHardwareActive && liveT!.blood_pressure_systolic > 0
        ? liveT!.blood_pressure_systolic
        : 0;
  const dbpVal =
    vitals.diastolic_bp > 0
      ? vitals.diastolic_bp
      : isHardwareActive && liveT!.blood_pressure_diastolic > 0
        ? liveT!.blood_pressure_diastolic
        : 0;
  const tempVal =
    vitals.temperature > 0 ? vitals.temperature : isHardwareActive && liveT!.temperature > 0 ? liveT!.temperature : 0;

  const rawMeasurements = [
    {
      measurement_type: 'heart_rate',
      value: hrVal,
      unit: 'bpm',
      signal_quality: 'good',
      source: isHardwareActive ? 'esp32' : 'patient_reported',
    },
    {
      measurement_type: 'spo2',
      value: spo2Val,
      unit: '%',
      signal_quality: 'good',
      source: isHardwareActive ? 'esp32' : 'patient_reported',
    },
    {
      measurement_type: 'systolic_bp',
      value: sbpVal,
      unit: 'mmHg',
      signal_quality: 'good',
      source: isHardwareActive ? 'esp32' : 'patient_reported',
    },
    {
      measurement_type: 'diastolic_bp',
      value: dbpVal,
      unit: 'mmHg',
      signal_quality: 'good',
      source: isHardwareActive ? 'esp32' : 'patient_reported',
    },
    {
      measurement_type: 'temperature',
      value: tempVal,
      unit: tempVal > 45 ? 'degF' : 'degC',
      signal_quality: 'good',
      source: isHardwareActive ? 'esp32' : 'patient_reported',
    },
  ];
  const measurementsPayload = rawMeasurements.filter(
    (m) => typeof m.value === 'number' && !Number.isNaN(m.value) && m.value > 0
  );

  try {
    const activeName = (patientNameRef.current || name || '').trim() || 'Patient';
    const rawGender = (patientGenderRef.current || gender || '').toLowerCase().trim();
    const activeGender = ['male', 'female', 'other'].includes(rawGender) ? rawGender : 'prefer_not_to_say';
    const activeContact = (patientContactRef.current || contact || '').trim();
    const activeComplaint = (aiUnderstoodSentenceRef.current || patientComplaintRef.current || complaint || '').trim() || 'General health consultation';
    const activeDuration = (patientDurationRef.current || duration || '').trim() || 'Not specified';
    const activeHistory = (patientMedicalHistoryRef.current || medicalHistory || '').trim();
    const activeMeds = (patientMedicationsRef.current || medications || '').trim();
    const activeAllergies = (patientAllergiesRef.current || allergies || '').trim();

    const res = await submitCase({
      personal_info: {
        full_name: activeName,
        age: activeAge,
        gender: activeGender as any,
        contact_number: activeContact,
        language: language as any,
      },
      chief_complaint: {
        description: activeComplaint,
        duration: activeDuration,
        severity: severity === 'severe' ? 9 : severity === 'moderate' ? 6 : 3,
      },
      medical_history: {
        past_conditions: activeHistory,
        allergies: activeAllergies,
        current_medications: activeMeds,
      },
      follow_up_answers: answersList,
      measurements: measurementsPayload as any,
    });

    const caseId = (res as any).public_case_id || res.case_id;
    const accessToken = res.access_token;

    // Signal onboard ESP32-S3 NeoPixel LED with computed triage priority color
    const finalPriority = String((res as any).priority || 'normal').toLowerCase();
    const triageCommand =
      finalPriority === 'emergency'
        ? 'TRIAGE:RED'
        : finalPriority === 'urgent' || finalPriority === 'elevated'
          ? 'TRIAGE:YELLOW'
          : 'TRIAGE:GREEN';
    esp32SerialService.sendCommand(triageCommand).catch(() => { });

    // Upload all selected files
    if (selectedFiles.length > 0 && caseId && accessToken) {
      for (const f of selectedFiles) {
        try {
          await uploadDocument(caseId, accessToken, f);
        } catch (uploadErr) {
          console.warn('File upload issue for:', f.name, uploadErr);
        }
      }
    }

    // Pre-synthesize the confirmation audio immediately with caseId
    let initialAudioBase64 = '';
    let initialAudioFormat = 'audio/wav';
    const cleanIdToSpeak = String(caseId).split('').join(' ');
    const announcementText =
      language === 'or'
        ? `ଆପଣଙ୍କ କେସ୍ ସଫଳତାର ସହିତ ଡାକ୍ତରଙ୍କ ପାଖରେ ପହଞ୍ଚିଛି! ଆପଣଙ୍କ ରୋଗୀ ନମ୍ବର ହେଉଛି: ${cleanIdToSpeak} । ଦୟାକରି ଏହି ନମ୍ବର ନୋଟ୍ କରନ୍ତୁ ଏବଂ ଅପେକ୍ଷା କକ୍ଷରେ ବସନ୍ତୁ, ଡାକ୍ତର ଖୁବ୍ ଶୀଘ୍ର ଆପଣଙ୍କୁ ଡାକିବେ।`
        : language === 'hi'
          ? `आपका केस सफलतापूर्वक डॉक्टर के पास दर्ज हो गया है! आपका पेशेंट आईडी है: ${cleanIdToSpeak} । कृपया यह नंबर नोट कर लें और प्रतीक्षा कक्ष में बैठें, डॉक्टर आपको शीघ्र बुलाएंगे।`
          : `Your health assessment has been submitted to the clinic doctor! Your Patient ID is ${cleanIdToSpeak}. Please take a seat in the waiting area.`;

    try {
      const savedSarvamKey = localStorage.getItem('jansaathi_sarvam_key') || undefined;
      const savedElevenKey = localStorage.getItem('jansaathi_elevenlabs_key') || undefined;
      const savedVoiceId = localStorage.getItem('jansaathi_elevenlabs_voice_id') || undefined;
      const ttsRes = await synthesizeSpeech(
        announcementText,
        language,
        savedSarvamKey,
        undefined,
        'sarvam',
        savedElevenKey,
        savedVoiceId
      );
      if (ttsRes?.status === 'success' && ttsRes.audio) {
        initialAudioBase64 = ttsRes.audio;
        initialAudioFormat = ttsRes.format || (ttsRes.audio.startsWith('UklGR') ? 'audio/wav' : 'audio/mp3');

        // Immediately start playing the human confirmation announcement on the unlocked shared audio player!
        try {
          const cleanBase64 = initialAudioBase64.replace(/^data:[^;]+;base64,/, '').trim();
          const binaryString = window.atob(cleanBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: initialAudioFormat });
          const blobUrl = URL.createObjectURL(blob);

          const sharedAudio = getOrCreateSharedAudio();
          sharedAudio.src = blobUrl;
          sharedAudio.play().catch((playErr: any) => console.warn('Announcement auto-play notice:', playErr));
          setSharedAnnouncementPlaying(true);
        } catch (prepErr) {
          console.warn('Prep confirmation audio error:', prepErr);
        }
      }
    } catch (ttsErr) {
      console.warn('Pre-synthesis of confirmation audio had an issue:', ttsErr);
    }

    // Stop recording/mic without killing the newly playing confirmation audio
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch { }
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { }
      recognitionRef.current = null;
    }

    setVoiceState('ready');

    // Navigate to completion with pre-synthesized audio and metadata
    navigate('/patient/assessment/complete', {
      state: {
        public_case_id: caseId,
        access_token: accessToken,
        patient_name: activeName,
        language: language,
        fromVoiceAgent: true,
        announcement_audio: initialAudioBase64,
        announcement_format: initialAudioFormat,
        announcement_text: announcementText,
        is_announcing: Boolean(initialAudioBase64),
      },
    });
  } catch (err: any) {
    hasSubmittedRef.current = false;
    console.error(err);
    setError(
      err.response?.data?.detail ||
      (language === 'hi'
        ? 'केस जमा करने में समस्या आई। कृपया पुनः प्रयास करें।'
        : language === 'or'
          ? 'କେସ୍ ଦାଖଲ କରିବାରେ ତ୍ରୁଟି ଘଟିଲା। ଦୟାକରି ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।'
          : 'Failed to submit health assessment. Please try again.')
    );
  } finally {
    setIsSubmitting(false);
  }
};

return (
  <div className="max-w-3xl mx-auto space-y-6">
    {/* Accessible Step Header */}
    <header className="bg-creamdeep rounded-2xl border border-ink/10 p-5 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <span className="eyebrow block mb-1">Clinical Intake</span>
        <h1 className="font-serif opsz-72 font-medium text-xl md:text-2xl text-ink">
          {t('appName')} — {t('interviewTitle')}
        </h1>
        <p className="text-xs text-inkmute font-medium mt-1" aria-live="polite">
          {t('stepOf', { current: step, total: 7 })}
        </p>
      </div>

      {/* Step Circles (7 Steps) */}
      <div className="flex items-center gap-1.5" aria-label="Assessment progress">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            aria-current={i === step ? 'step' : undefined}
            className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center transition-all ${i === step
                ? 'bg-ink text-cream ring-2 ring-magenta'
                : i < step
                  ? 'bg-magenta text-cream'
                  : 'bg-cream text-inkmute border border-ink/10'
              }`}
          >
            {i < step ? '✓' : i}
          </div>
        ))}
      </div>
    </header>

    {/* ── ESP32-S3 Hardware Kiosk Connection & Live Telemetry Bar ── */}
    <Esp32HardwareMonitor
      ref={esp32MonitorRef}
      compact={step !== 6}
      onTelemetryUpdate={(t) => syncEsp32Telemetry(t)}
      onConnectionChange={(connected) => {
        setIsHardwareConnected(connected);
        isHardwareConnectedRef.current = connected;
        if (connected) {
          setAudioSource('hardware');
          audioSourceRef.current = 'hardware';
          // Reset hardware capture & noise calibration buffers cleanly on USB/Serial connect
          hardwarePcmBuffersRef.current = [];
          preSpeechRingBufferRef.current = [];
          hasDetectedSpeechRef.current = false;
          firstSpeechTimeRef.current = 0;
          lastSpeechTimeRef.current = 0;
          listenStartTimeRef.current = nowMs();
          noiseCalibrationSamplesRef.current = [];
          // Terminate any active laptop browser recording / WebAudio nodes to strictly release laptop mic
          if (animFrameRef.current) {
            try { cancelAnimationFrame(animFrameRef.current); } catch { }
            animFrameRef.current = null;
          }
          if (processorRef.current) {
            try { processorRef.current.disconnect(); } catch { }
            processorRef.current = null;
          }
          if (audioContextRef.current) {
            try { audioContextRef.current.close(); } catch { }
            audioContextRef.current = null;
          }
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try { mediaRecorderRef.current.stop(); } catch { }
            mediaRecorderRef.current = null;
          }
          if (mediaStreamRef.current) {
            try { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); } catch { }
            mediaStreamRef.current = null;
          }
          if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch { }
            recognitionRef.current = null;
          }
          handleVoiceDoneSpeakingRef.current = finishHardwareRecording;
          if (voiceStateRef.current === 'listening') {
            armIdleWatchdog();
          }
        }
      }}
      onMicLevelUpdate={(level, speaking) => {
        if (
          isTranscribingHardwareRef.current ||
          isAssistantSpeakingRef.current ||
          voiceStateRef.current === 'assistant_speaking' ||
          voiceStateRef.current === 'processing' ||
          voiceStateRef.current === 'ready' ||
          voiceStateRef.current === 'paused'
        ) {
          setAudioLevel(0);
          return;
        }

        if (audioSourceRef.current === 'hardware') {
          setAudioLevel(speaking ? level : 0);
          // When user was speaking and hardware confirms speech has finished:
          if (hasDetectedSpeechRef.current && !speaking && hardwarePcmBuffersRef.current.length > 0 && voiceStateRef.current === 'listening') {
            const now = nowMs();
            if (lastSpeechTimeRef.current > 0 && now - lastSpeechTimeRef.current >= 1000) {
              if (hardwareSilenceTimerRef.current) {
                clearTimeout(hardwareSilenceTimerRef.current);
                hardwareSilenceTimerRef.current = null;
              }
              finishHardwareRecording();
            } else if (!hardwareSilenceTimerRef.current) {
              hardwareSilenceTimerRef.current = setTimeout(() => {
                if (hasDetectedSpeechRef.current && !isTranscribingHardwareRef.current && voiceStateRef.current === 'listening') {
                  finishHardwareRecording();
                }
              }, 1000);
            }
          }
        }
      }}
    onHardwareAudioChunk={(b64Pcm, isSpeaking) => {
      handleIncomingHardwareAudioChunk(b64Pcm, isSpeaking);
    }}
      />

    {/* Autonomous Conversational Voice Doctor — Guinex Live Voice Stage */}
    {isVoiceAgentActive ? (
      <div className="relative overflow-hidden rounded-3xl bg-ink text-cream p-6 sm:p-8 shadow-xl border border-ink/20 mb-6 transition-all">
        <style>{`
            @keyframes voicePulse {
              0% { transform: scale(0.96); opacity: 0.6; }
              50% { transform: scale(1.08); opacity: 0.2; }
              100% { transform: scale(0.96); opacity: 0.6; }
            }
            @keyframes geminiWave {
              0%, 100% { height: 6px; opacity: 0.5; }
              50% { height: 28px; opacity: 1; }
            }
          `}</style>

        {/* Ambient Background Glow in warm magenta */}
        <div
          className="absolute -top-24 -right-24 w-80 h-80 rounded-full opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #d6246e 0%, transparent 70%)' }}
        />

        {/* Top Header Bar */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-cream/10">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cream/10 border border-cream/15 text-cream text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-magenta animate-pulse" />
              <span>Guinex Voice Assistant</span>
            </div>

            <div className="text-xs text-cream/80 font-medium">
              {isVoiceAgentActive ? (
                <span>
                  {intakeSlot === 'name' && (language === 'or' ? 'ପ୍ରଶ୍ନ ୧/୧୦: ରୋଗୀଙ୍କ ନାମ' : language === 'hi' ? 'प्रश्न 1/10: मरीज का नाम' : 'Step 1/10: Patient Full Name')}
                  {intakeSlot === 'age' && (language === 'or' ? 'ପ୍ରଶ୍ନ ୨/୧୦: ବୟସ' : language === 'hi' ? 'प्रश्न 2/10: उम्र' : 'Step 2/10: Patient Age')}
                  {intakeSlot === 'gender' && (language === 'or' ? 'ପ୍ରଶ୍ନ ୩/୧୦: ଲିଙ୍ଗ' : language === 'hi' ? 'प्रश्न 3/10: लिंग' : 'Step 3/10: Gender')}
                  {intakeSlot === 'whatsapp' && (language === 'or' ? 'ପ୍ରଶ୍ନ ୪/୧୦: ହ୍ୱାଟ୍ସଆପ୍ ନମ୍ବର' : language === 'hi' ? 'प्रश्न 4/10: WhatsApp नंबर' : 'Step 4/10: WhatsApp Mobile')}
                  {intakeSlot === 'problem' && (language === 'or' ? 'ପ୍ରଶ୍ନ ୫/୧୦: ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା' : language === 'hi' ? 'प्रश्न 5/10: स्वास्थ्य समस्या' : 'Step 5/10: Chief Complaint')}
                  {intakeSlot === 'followup' && (language === 'or' ? `ପ୍ରଶ୍ନ ୬/୧୦: ଡାକ୍ତରୀ ପ୍ରଶ୍ନ (${activeQuestionIdx + 1}/${followUpQuestions.length || 2})` : language === 'hi' ? `प्रश्न 6/10: डॉक्टर के सवाल (${activeQuestionIdx + 1}/${followUpQuestions.length || 2})` : `Step 6/10: Follow-up Questions (${activeQuestionIdx + 1}/${followUpQuestions.length || 2})`)}
                  {intakeSlot === 'report' && (language === 'or' ? 'ପ୍ରଶ୍ନ ୭/୧୦: ପୂର୍ବ ରିପୋର୍ଟ ବା ପ୍ରେସକ୍ରିପସନ୍' : language === 'hi' ? 'प्रश्न 7/10: पुरानी रिपोर्ट / पर्ची' : 'Step 7/10: Prior Reports or Prescription')}
                  {intakeSlot === 'vitals' && (language === 'or' ? 'ପ୍ରଶ୍ନ ୮/୧୦: ଭାଇଟାଲ୍ସ ସ୍କାନ' : language === 'hi' ? 'प्रश्न 8/10: वाइटल्स जांच' : 'Step 8/10: Patient Vitals')}
                  {intakeSlot === 'confirmation' && (language === 'or' ? 'ପ୍ରଶ୍ନ ୯/୧୦: ସମସ୍ତ ବିବରଣୀ ନିଶ୍ଚିତକରଣ' : language === 'hi' ? 'प्रश्न 9/10: सभी विवरण पुष्टि' : 'Step 9/10: Confirm Details')}
                  {intakeSlot === 'submitted' && (language === 'or' ? '୧୦/୧୦: ଡାକ୍ତରଙ୍କ ନିକଟକୁ ଦାଖଲ' : language === 'hi' ? '10/10: डॉक्टर को प्रेषण' : 'Step 10/10: Submitting to Doctor')}
                </span>
              ) : (
                <span>
                  {step === 1 && (language === 'or' ? 'ପର୍ଯ୍ୟାୟ ୧: ରୋଗୀ ପରିଚୟ' : language === 'hi' ? 'चरण 1: पहचान' : 'Step 1: Patient Identity')}
                  {step === 2 && (language === 'or' ? 'ପର୍ଯ୍ୟାୟ ୨: ମୁଖ୍ୟ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା' : language === 'hi' ? 'चरण 2: मुख्य लक्षण' : 'Step 2: Chief Complaint')}
                  {step === 3 && (language === 'or' ? 'ପର୍ଯ୍ୟାୟ ୩: ଚିକିତ୍ସା ଇତିହାସ' : language === 'hi' ? 'चरण 3: चिकित्सा इतिहास' : 'Step 3: Medical History')}
                  {step === 4 && (language === 'or' ? `ପର୍ଯ୍ୟାୟ ୪: ଡାକ୍ତରୀ ପ୍ରଶ୍ନ (${activeQuestionIdx + 1}/${followUpQuestions.length || 2})` : language === 'hi' ? `चरण 4: लक्षित प्रश्न (${activeQuestionIdx + 1}/${followUpQuestions.length || 2})` : `Step 4: Clinical Questions (${activeQuestionIdx + 1}/${followUpQuestions.length || 2})`)}
                  {step === 5 && (language === 'or' ? 'ପର୍ଯ୍ୟାୟ ୫: ପୂର୍ବ ରିପୋର୍ଟ' : language === 'hi' ? 'चरण 5: मेडिकल रिपोर्ट' : 'Step 5: Prior Documents')}
                  {step === 6 && (language === 'or' ? 'ପର୍ଯ୍ୟାୟ ୬: ସେନ୍ସର୍ ମାପ' : language === 'hi' ? 'चरण 6: वाइटल्स' : 'Step 6: Live Telemetry')}
                  {step === 7 && (language === 'or' ? 'ପର୍ଯ୍ୟାୟ ୭: ସମୀକ୍ଷା ଓ ଦାଖଲ' : language === 'hi' ? 'चरण 7: समीक्षा और प्रेषण' : 'Step 7: Final Review & Submit')}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Dialect Switcher */}
            <div className="flex items-center bg-cream/10 rounded-full p-1 border border-cream/15 text-xs">
              <button
                type="button"
                onClick={() => handleSwitchLanguage('or')}
                className={`px-2.5 py-1 rounded-full font-medium transition-all ${language === 'or' ? 'bg-cream text-ink font-semibold shadow-sm' : 'text-cream/70 hover:text-cream'
                  }`}
              >
                ଓଡ଼ିଆ
              </button>
              <button
                type="button"
                onClick={() => handleSwitchLanguage('hi')}
                className={`px-2.5 py-1 rounded-full font-medium transition-all ${language === 'hi' ? 'bg-cream text-ink font-semibold shadow-sm' : 'text-cream/70 hover:text-cream'
                  }`}
              >
                हिन्दी
              </button>
              <button
                type="button"
                onClick={() => handleSwitchLanguage('en')}
                className={`px-2.5 py-1 rounded-full font-medium transition-all ${language === 'en' ? 'bg-cream text-ink font-semibold shadow-sm' : 'text-cream/70 hover:text-cream'
                  }`}
              >
                EN
              </button>
            </div>

            {/* Voice Engine Settings Gear */}
            <button
              type="button"
              onClick={() => {
                setSarvamApiKeyInput(localStorage.getItem('jansaathi_sarvam_key') || '');
                setElevenlabsApiKeyInput(localStorage.getItem('jansaathi_elevenlabs_key') || '');
                setSarvamStatusMsg('');
                setElevenlabsStatusMsg('');
                setShowVoiceModal(true);
              }}
              className="p-2 rounded-full bg-cream/10 border border-cream/15 text-cream/75 hover:text-cream hover:bg-cream/20 transition-colors"
              title="Voice Engine Settings (Sarvam AI / ElevenLabs)"
            >
              <Key className="w-3.5 h-3.5" />
            </button>

            {/* Mic Source Indicator & Toggle */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cream/10 border border-cream/15 text-xs text-cream">
              <span className={`w-2 h-2 rounded-full ${audioSource === 'hardware' && isHardwareConnected
                  ? 'bg-emerald-400 animate-pulse'
                  : audioSource === 'laptop'
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-amber-400'
                }`} />
              <span className="font-medium">
                {audioSource === 'hardware'
                  ? (isHardwareConnected ? 'ESP32 Mic' : 'ESP32 Offline')
                  : 'Laptop Mic (Active)'}
              </span>
              {audioSource === 'hardware' && !isHardwareConnected && (
                <button
                  type="button"
                  onClick={() => esp32MonitorRef.current?.connect()}
                  className="underline text-amber-200 hover:text-cream ml-1 cursor-pointer font-semibold"
                >
                  Connect USB
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (audioSource === 'hardware') {
                    setAudioSource('laptop');
                    if (voiceStateRef.current === 'listening') {
                      startBrowserRecording(handleVoiceInput);
                    }
                  } else {
                    setAudioSource('hardware');
                    if (mediaStreamRef.current) {
                      try { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); } catch { }
                      mediaStreamRef.current = null;
                    }
                    if (recognitionRef.current) {
                      try { recognitionRef.current.abort(); } catch { }
                      recognitionRef.current = null;
                    }
                    handleVoiceDoneSpeakingRef.current = finishHardwareRecording;
                  }
                }}
                className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-cream/15 hover:bg-cream/25 text-cream transition-colors cursor-pointer"
                title="Toggle between ESP32 Hardware Mic and Laptop Mic"
              >
                {audioSource === 'hardware' ? 'Use Laptop' : 'Use ESP32'}
              </button>
            </div>

            {/* Switch to Typing */}
            <button
              type="button"
              onClick={handleStopVoiceAgent}
              className="pill pill-secondary px-3.5 py-1.5 text-xs font-medium text-cream/80 border-cream/20 hover:text-cream"
            >
              <span>Switch to Typing</span>
            </button>
          </div>
        </div>

        {/* Central Interactive Voice Stage */}
        <div className="relative z-10 py-6 flex flex-col items-center justify-center text-center">
          {/* Outer Pulse Rings & Glowing Interactive Orb */}
          <div className="relative my-4 flex items-center justify-center">
            {voiceState === 'listening' && (
              <div
                className="absolute rounded-full pointer-events-none bg-magenta/25 blur-xl w-44 h-44 sm:w-52 sm:h-52 transition-all duration-200"
                style={{ transform: `scale(${1 + (audioLevel / 100) * 0.45})` }}
              />
            )}

            <button
              type="button"
              onClick={handleOrbClick}
              title={
                voiceState === 'listening'
                  ? 'Tap to complete speaking'
                  : voiceState === 'assistant_speaking'
                    ? 'Tap to interrupt and speak'
                    : 'Tap to speak'
              }
              className={`relative z-20 w-24 h-24 sm:w-28 sm:h-28 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-200 transform hover:scale-105 active:scale-95 focus:outline-none ${voiceState === 'listening'
                  ? 'bg-magenta text-cream shadow-[0_0_50px_rgba(214,36,110,0.55)] border-2 border-magenta'
                  : voiceState === 'assistant_speaking'
                    ? 'bg-cream text-ink shadow-[0_0_40px_rgba(250,246,239,0.3)] border-2 border-cream'
                    : voiceState === 'processing'
                      ? 'bg-magentadeep text-cream border-2 border-magenta animate-pulse'
                      : 'bg-cream/10 text-cream border border-cream/20'
                }`}
            >
              {voiceState === 'listening' && (
                <div className="flex flex-col items-center justify-center">
                  <div className="flex items-center gap-1 h-7 mb-1">
                    {[0.4, 0.75, 1.0, 0.75, 0.4].map((f, i) => (
                      <div
                        key={i}
                        className="w-1 bg-cream rounded-full transition-all duration-75"
                        style={{ height: `${Math.max(5, Math.min(28, 5 + (audioLevel * f * 0.35)))}px` }}
                      />
                    ))}
                  </div>
                  <Mic className="w-5 h-5 text-cream animate-pulse" />
                </div>
              )}
              {voiceState === 'assistant_speaking' && (
                <div className="flex flex-col items-center justify-center">
                  <Volume2 className="w-6 h-6 text-ink" />
                </div>
              )}
              {voiceState === 'processing' && (
                <Loader2 className="w-7 h-7 text-cream animate-spin" />
              )}
              {(voiceState === 'ready' || voiceState === 'paused' || voiceState === 'idle') && (
                <Mic className="w-7 h-7 text-cream/70" />
              )}
            </button>
          </div>

          {/* Voice Status Pill & Manual Send Control */}
          <div className="mt-2 flex flex-col items-center gap-2.5 w-full max-w-xs mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cream/10 border border-cream/15 text-cream text-xs font-medium">
              <span className={`w-2 h-2 rounded-full ${voiceState === 'listening' ? 'bg-magenta animate-ping' : 'bg-cream/60'}`} />
              <span>
                {voiceState === 'listening'
                  ? (language === 'or' ? 'ଅନନ୍ୟା ଶୁଣୁଛନ୍ତି... (ସ୍ୱାଭାବିକ ଭାବେ କୁହନ୍ତୁ)' : language === 'hi' ? 'अनन्या सुन रही हैं... (स्वाभाविक बोलें)' : 'Ananya is listening... (Speak naturally)')
                  : voiceState === 'assistant_speaking'
                    ? (language === 'or' ? 'ଅନନ୍ୟା କହୁଛନ୍ତି... (ଅଟକାଇବାକୁ ଅର୍ବ୍ ଛୁଅନ୍ତୁ)' : language === 'hi' ? 'अनन्या बोल रही हैं... (रोकने के लिए टैप करें)' : 'Ananya is speaking... (Tap orb to interrupt)')
                    : voiceState === 'processing'
                      ? (loadingStepText || (language === 'or' ? 'ଆପଣଙ୍କ କଥା ବୁଝୁଛୁ...' : language === 'hi' ? 'आपकी बात समझी जा रही है...' : 'Understanding your response...'))
                      : (language === 'or' ? 'କୁହନ୍ତୁ ବା ଅର୍ବ୍ ଛୁଅନ୍ତୁ' : language === 'hi' ? 'बोलें या टैप करें' : 'Tap orb to speak')}
              </span>
            </div>

              {voiceState === 'listening' && (
                <button
                  type="button"
                  onClick={handleVoiceDoneSpeaking}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold shadow-lg transition-all cursor-pointer active:scale-95"
                >
                  <span>
                    {language === 'hi'
                      ? 'बोलना पूरा हुआ — भेजें ✓'
                      : language === 'or'
                        ? 'କହିବା ସରିଲା — ପଠାନ୍ତୁ ✓'
                        : 'Tap to Send / Done Speaking ✓'}
                  </span>
                </button>
              )}

              {voiceState === 'listening' && (
                <div className="w-full px-2 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-cream/70">
                    <span>{language === 'or' ? 'ସ୍ୱର ଶକ୍ତି (Speech Energy)' : language === 'hi' ? 'आवाज़ स्तर (Speech Energy)' : 'Speech Energy Meter'}</span>
                    <span className="font-mono">{audioLevel}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-cream/15 overflow-hidden border border-cream/15">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-magenta transition-all duration-75 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(4, audioLevel))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Spoken Prompt / Assistant Dialogue */}
            <div className="mt-5 max-w-xl w-full px-6 py-4 rounded-2xl bg-cream/5 border border-cream/10 text-center shadow-sm">
              <p className="font-serif opsz-72 italic text-base md:text-lg text-cream/95 leading-relaxed">
                "{agentSpeakingText || voiceAgentStatusText || (language === 'or' ? 'ଜନ ସାଥୀ ଏଆଇ ଆପଣଙ୍କୁ ସାହାଯ୍ୟ କରିବାକୁ ପ୍ରସ୍ତୁତ।' : 'Jan Saathi AI is ready to assist you.')}"
              </p>
            </div>

            {/* Direct Audio Unlocker Pill whenever Autoplay is blocked or audio is pending */}
            {isAudioBlocked && (
              <button
                type="button"
                onClick={handleUnlockAudio}
                className="mt-4 px-6 py-3 rounded-full bg-magenta text-cream font-bold text-sm shadow-2xl animate-bounce hover:bg-magenta/90 cursor-pointer border-2 border-cream/50 inline-flex items-center gap-2 transition-all z-30"
              >
                <Volume2 className="w-5 h-5 text-cream" />
                <span>
                  {language === 'or'
                    ? '🔊 ଡାକ୍ତରଙ୍କ ସ୍ୱର ଶୁଣିବା ପାଇଁ ଏଠାରେ ଚିପନ୍ତୁ (Tap to Hear Doctor)'
                    : language === 'hi'
                      ? '🔊 डॉक्टर की आवाज़ सुनने के लिए यहाँ क्लिक करें (Tap to Hear Doctor)'
                      : "🔊 Tap here to hear Doctor's Voice"}
                </span>
              </button>
            )}
          </div>

          {/* Conversational Dialogue Stream (Calm Editorial Cards) */}
          {conversationHistory.length > 0 && (
            <div className="relative z-10 max-w-2xl mx-auto my-3 max-h-44 overflow-y-auto space-y-2.5 p-3 rounded-2xl bg-cream/5 border border-cream/10">
              {conversationHistory.slice(-4).map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-2.5 text-xs ${msg.sender === 'patient' ? 'justify-end' : 'justify-start'
                    }`}
                >
                  {msg.sender === 'ai' && (
                    <div className="w-6 h-6 rounded-full bg-cream text-ink flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-magenta" />
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-3.5 py-2 max-w-[85%] leading-relaxed ${msg.sender === 'patient'
                        ? 'bg-magenta text-cream rounded-tr-none shadow-sm'
                        : 'bg-cream text-ink rounded-tl-none shadow-sm'
                      }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-[10px] mb-0.5 opacity-75">
                      <span className="font-semibold">
                        {msg.sender === 'patient' ? (language === 'or' ? 'ଆପଣ' : language === 'hi' ? 'आप' : 'You') : (language === 'or' ? 'ଜନ ସାଥୀ ଏଆଇ ଡାକ୍ତର' : language === 'hi' ? 'जन साथी एआई डॉक्टर' : 'Jan Saathi AI Doctor')}
                      </span>
                      <span>{msg.time}</span>
                    </div>
                    <p className="font-normal text-[12px]">{msg.text}</p>
                  </div>
                  {msg.sender === 'patient' && (
                    <div className="w-6 h-6 rounded-full bg-cream/20 text-cream flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Voice Mode Dedicated ESP32 Live Vitals Scanner Box */}
          {intakeSlot === 'vitals' && (
            <div className="relative z-10 max-w-2xl mx-auto my-3 p-5 rounded-2xl bg-cream/10 border-2 border-emerald-500/50 text-cream text-xs space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-cream/10 pb-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
                  <span className="font-semibold text-sm text-emerald-300">
                    {language === 'or' ? 'ESP32-S3 ଲାଇଭ୍ ଭାଇଟାଲ୍ସ ସେନସର ସ୍କାନର' : language === 'hi' ? 'ESP32-S3 लाइव वाइटल्स सेंसर स्कैनर' : 'ESP32-S3 Live Medical Vitals Telemetry'}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                  {isReadingVitals
                    ? (language === 'or'
                      ? `ସ୍କାନ ଚାଲିଛି (${vitalsCountdown}s ବାକି • ${vitalsSampleCount} ସାମ୍ପଲ୍)...`
                      : `Averaging (${vitalsCountdown}s left • ${vitalsSampleCount} samples)...`)
                    : vitalsCaptured
                      ? (language === 'or' ? `୩୦ସେ ହାରାହାରି ସଂଗୃହୀତ (${vitalsSampleCount} ସାମ୍ପଲ୍)` : `30s Averaged & Attached (${vitalsSampleCount} samples)`)
                      : (language === 'or' ? 'ସେନସର ପ୍ରସ୍ତୁତ' : 'Probe Standby / Not Captured')}
                </span>
              </div>

              {/* Acquisition Progress Bar */}
              {isReadingVitals && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-emerald-200">
                    <span className="flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                      <span>{language === 'or' ? 'ESP32 ସେନସରରୁ ଅପ୍ଟିକାଲ୍ ପଲ୍ସ ଓ ଅମ୍ଳଜାନ ମାପ ଚାଲିଛି...' : 'Acquiring optical pulse & SpO2 from ESP32...'}</span>
                    </span>
                    <span className="font-mono font-bold">{vitalsProgress}%</span>
                  </div>
                  <div className="w-full bg-cream/20 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-400 h-2 rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(52,211,153,0.8)]"
                      style={{ width: `${vitalsProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 4 Telemetry Metrics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Heart Rate */}
                <div className="p-3 rounded-xl bg-ink/50 border border-cream/15 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-cream/70 mb-1">
                    <Heart className={`w-3.5 h-3.5 text-red-400 ${vitalsCaptured ? 'animate-pulse' : ''}`} />
                    <span>{language === 'or' ? 'ହୃଦସ୍ପନ୍ଦନ' : 'Heart Rate'}</span>
                  </div>
                  {vitals.heart_rate > 0 ? (
                    <>
                      <div className="text-xl font-bold font-mono text-red-400">{vitals.heart_rate}</div>
                      <div className="text-[10px] text-cream/50">bpm</div>
                    </>
                  ) : (
                    <div className="text-[11px] font-semibold text-amber-300 py-1">Finger/Probe Not Detected</div>
                  )}
                </div>

                {/* SpO2 */}
                <div className="p-3 rounded-xl bg-ink/50 border border-cream/15 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-cream/70 mb-1">
                    <Wind className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{language === 'or' ? 'ଅମ୍ଳଜାନ (SpO2)' : 'Oxygen SpO2'}</span>
                  </div>
                  {vitals.spo2 > 0 ? (
                    <>
                      <div className="text-xl font-bold font-mono text-cyan-400">{vitals.spo2}%</div>
                      <div className="text-[10px] text-cream/50">measured</div>
                    </>
                  ) : (
                    <div className="text-[11px] font-semibold text-amber-300 py-1">Finger/Probe Not Detected</div>
                  )}
                </div>

                {/* Blood Pressure */}
                <div className="p-3 rounded-xl bg-ink/50 border border-cream/15 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-cream/70 mb-1">
                    <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{language === 'or' ? 'ରକ୍ତଚାପ (BP)' : 'Blood Pressure'}</span>
                  </div>
                  {vitals.systolic_bp > 0 && vitals.diastolic_bp > 0 ? (
                    <>
                      <div className="text-xl font-bold font-mono text-emerald-400">{vitals.systolic_bp}/{vitals.diastolic_bp}</div>
                      <div className="text-[10px] text-cream/50">mmHg</div>
                    </>
                  ) : (
                    <div className="text-[11px] font-semibold text-amber-300 py-1">Finger/Probe Not Detected</div>
                  )}
                </div>

                {/* Temperature */}
                <div className="p-3 rounded-xl bg-ink/50 border border-cream/15 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-cream/70 mb-1">
                    <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                    <span>{language === 'or' ? 'ତାପମାତ୍ରା' : 'Temperature'}</span>
                  </div>
                  {vitals.temperature > 0 ? (
                    <>
                      <div className="text-xl font-bold font-mono text-amber-400">{vitals.temperature}</div>
                      <div className="text-[10px] text-cream/50">{vitals.temperature > 45 ? '°F' : '°C'}</div>
                    </>
                  ) : (
                    <div className="text-[11px] font-semibold text-amber-300 py-1">Finger/Probe Not Detected</div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-cream/10 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={startLiveVitalsAcquisition}
                  className="pill pill-secondary text-xs px-3.5 py-1.5 text-cream/80 border-cream/20 hover:text-cream inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{language === 'or' ? 'ପୁଣି ସ୍କାନ କରନ୍ତୁ (Re-scan)' : language === 'hi' ? 'दोबारा स्कैन करें' : 'Re-scan Sensors'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleProceedToConfirmation}
                  className="pill pill-magenta text-xs font-semibold px-5 py-2 inline-flex items-center gap-2 shadow-lg"
                >
                  <Check className="w-4 h-4" />
                  <span>{language === 'or' ? 'ଠିକ୍ ଅଛି / ଆଗକୁ ବଢ଼ନ୍ତୁ (Proceed)' : language === 'hi' ? 'ठीक है / आगे बढ़ें (Proceed)' : 'Vitals Confirmed / Proceed'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Voice Mode Dedicated Multi-Document Upload Box */}
          {intakeSlot === 'report' && (
            <div className="relative z-10 max-w-2xl mx-auto my-3 p-4 rounded-2xl bg-cream/10 border-2 border-dashed border-magenta/50 text-cream text-xs space-y-3 shadow-xl">
              <div className="flex items-center justify-between border-b border-cream/10 pb-2">
                <div className="flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-magenta" />
                  <span className="font-semibold text-sm">
                    {language === 'or' ? 'ଡାକ୍ତରୀ ରିପୋର୍ଟ ବା ପ୍ରେସକ୍ରିପସନ୍ ଅପଲୋଡ୍ କରନ୍ତୁ' : language === 'hi' ? 'मेडिकल रिपोर्ट या पर्ची अपलोड करें' : 'Upload Medical Reports or Prescription'}
                  </span>
                </div>
                <span className="text-[11px] text-cream/70">
                  {selectedFiles.length > 0 ? `${selectedFiles.length} file(s) attached` : 'PDF, JPG, PNG'}
                </span>
              </div>

              <input
                type="file"
                id="voiceDocUpload"
                multiple
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleAddFiles(e.target.files);
                  }
                }}
                className="hidden"
              />

              <label htmlFor="voiceDocUpload" className="cursor-pointer block py-4 px-3 rounded-xl bg-ink/40 border border-cream/20 hover:border-magenta text-center transition-all">
                <FileCheck className="w-7 h-7 text-magenta mx-auto mb-1.5" />
                <span className="text-xs font-semibold text-cream underline">
                  {language === 'or' ? '+ ଏକାଧିକ ଫାଇଲ୍ ବାଛନ୍ତୁ / ଯୋଡ଼ନ୍ତୁ (Browse Files)' : language === 'hi' ? '+ एक या अधिक फाइलें चुनें (Browse Files)' : '+ Select Multiple Files or Photos'}
                </span>
                <p className="text-[11px] text-cream/60 mt-1">
                  {language === 'or' ? 'ଆପଣ ଏକାଧିକ ରିପୋର୍ଟ କିମ୍ବା ଫଟୋ ଅପଲୋଡ୍ କରିପାରିବେ' : language === 'hi' ? 'आप कई रिपोर्ट या पर्चियाँ जोड़ सकते हैं' : 'You can attach multiple PDFs or photos'}
                </p>
              </label>

              {selectedFiles.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-medium text-cream/80">
                    {language === 'or' ? 'ସଂଲଗ୍ନ ଫାଇଲ୍ ସମୂହ:' : language === 'hi' ? 'संलग्न फाइलें:' : 'Attached Files:'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="bg-cream/15 border border-cream/25 rounded-xl px-2.5 py-1.5 text-[11px] max-w-full">
                        <div className="flex items-center gap-2">
                          <FileCheck className="w-3.5 h-3.5 text-magenta shrink-0" />
                          <span className="truncate max-w-[140px] font-medium" title={file.name}>{file.name}</span>
                          <span className="text-[10px] text-cream/60">({(file.size / (1024 * 1024)).toFixed(1)}MB)</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx)}
                            className="text-red-300 hover:text-red-100 p-0.5"
                            title="Remove"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {renderFileOcrPreview(file, true)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Spoken confirmation instruction & proceed button */}
              <div className="pt-2 border-t border-cream/10 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-cream/80 italic">
                  {language === 'or'
                    ? '👉 ସବୁ ରିପୋର୍ଟ ଦେବା ପରେ କୁହନ୍ତୁ: "ସମସ୍ତ ରିପୋର୍ଟ ସବମିଟ୍ ହେଲା"'
                    : language === 'hi'
                      ? '👉 सभी रिपोर्ट देने के बाद बोलें: "सभी रिपोर्ट सबमिट हो गई"'
                      : '👉 When done, say: "all reports submitted" or tap proceed'}
                </p>
                <button
                  type="button"
                  onClick={handleAllReportsSubmittedClick}
                  className="pill pill-magenta text-xs font-semibold px-4 py-1.5 inline-flex items-center gap-1.5 shadow-md"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{language === 'or' ? 'ସମସ୍ତ ରିପୋର୍ଟ ସବମିଟ୍ ହେଲା (ଆଗକୁ ବଢ଼ନ୍ତୁ)' : language === 'hi' ? 'सभी रिपोर्ट सबमिट हो गई (आगे बढ़ें)' : 'All Reports Submitted (Proceed)'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Live Clinical Intake Snapshot Mirror */}
          {!isEditingIntakeFields ? (
            <div className="relative z-10 max-w-2xl mx-auto my-3 p-3.5 rounded-2xl bg-cream/5 border border-cream/10 text-xs">
              <div className="text-[10px] uppercase font-semibold tracking-wider text-cream/70 mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-magenta" />
                  <span>{language === 'or' ? 'ଲାଇଭ୍ କ୍ଲିନିକାଲ୍ ରେକର୍ଡ' : language === 'hi' ? 'लाइव क्लिनिकल रिकॉर्ड' : 'Live Clinical Record'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditTempName(name);
                    setEditTempAge(age);
                    setEditTempGender(gender);
                    setEditTempContact(contact);
                    setEditTempComplaint(complaint);
                    setIsEditingIntakeFields(true);
                  }}
                  className="pill pill-secondary text-[11px] px-2.5 py-1 text-cream/80 border-cream/20 hover:text-cream hover:border-magenta transition-colors cursor-pointer inline-flex items-center gap-1"
                  title="Edit patient details"
                >
                  <Edit2 className="w-2.5 h-2.5" />
                  <span>{language === 'or' ? 'ବଦଳାନ୍ତୁ (Edit)' : language === 'hi' ? 'बदलें (Edit)' : 'Edit Details'}</span>
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-cream">
                <div
                  onClick={() => {
                    setEditTempName(name);
                    setEditTempAge(age);
                    setEditTempGender(gender);
                    setEditTempContact(contact);
                    setEditTempComplaint(complaint);
                    setIsEditingIntakeFields(true);
                  }}
                  className="bg-cream/10 hover:bg-cream/15 cursor-pointer p-2 rounded-xl border border-cream/10 transition-all group"
                  title="Click to edit Name"
                >
                  <div className="flex items-center justify-between text-[10px] text-cream/60">
                    <span>{language === 'or' ? 'ରୋଗୀ' : 'Patient'}:</span>
                    <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-magenta transition-opacity" />
                  </div>
                  <strong className="text-cream truncate block text-[11px] mt-0.5">{name || '—'}</strong>
                </div>
                <div
                  onClick={() => {
                    setEditTempName(name);
                    setEditTempAge(age);
                    setEditTempGender(gender);
                    setEditTempContact(contact);
                    setEditTempComplaint(complaint);
                    setIsEditingIntakeFields(true);
                  }}
                  className="bg-cream/10 hover:bg-cream/15 cursor-pointer p-2 rounded-xl border border-cream/10 transition-all group"
                  title="Click to edit Age"
                >
                  <div className="flex items-center justify-between text-[10px] text-cream/60">
                    <span>{language === 'or' ? 'ବୟସ' : 'Age'}:</span>
                    <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-magenta transition-opacity" />
                  </div>
                  <strong className="text-cream block text-[11px] mt-0.5">{age !== '' ? `${age} yrs` : '—'}</strong>
                </div>
                <div
                  onClick={() => {
                    setEditTempName(name);
                    setEditTempAge(age);
                    setEditTempGender(gender);
                    setEditTempContact(contact);
                    setEditTempComplaint(complaint);
                    setIsEditingIntakeFields(true);
                  }}
                  className="bg-cream/10 hover:bg-cream/15 cursor-pointer p-2 rounded-xl border border-cream/10 transition-all group"
                  title="Click to edit Gender"
                >
                  <div className="flex items-center justify-between text-[10px] text-cream/60">
                    <span>{language === 'or' ? 'ଲିଙ୍ଗ' : language === 'hi' ? 'लिंग' : 'Gender'}:</span>
                    <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-magenta transition-opacity" />
                  </div>
                  <strong className="text-cream capitalize block text-[11px] mt-0.5">
                    {(() => {
                      const gVal = gender;
                      if (!gVal) return '—';
                      const GENDER_LABELS: Record<string, { male: string; female: string; other: string }> = {
                        or: { male: 'ପୁରୁଷ', female: 'ମହିଳା', other: 'ଅନ୍ୟାନ୍ୟ' },
                        hi: { male: 'पुरुष', female: 'महिला', other: 'अन्य' },
                        bn: { male: 'পুরুষ', female: 'মহিলা', other: 'অন্যান্য' },
                        te: { male: 'పురుషుడు', female: 'స్త్రీ', other: 'ఇతర' },
                        ta: { male: 'ஆண்', female: 'பெண்', other: 'மற்றவை' },
                        mr: { male: 'पुरुष', female: 'स्त्री', other: 'इतर' },
                        gu: { male: 'પુરુષ', female: 'સ્ત્રી', other: 'બીજા' },
                        kn: { male: 'ಪುರುಷ', female: 'ಮಹಿಳೆ', other: 'ಇತರೆ' },
                        ml: { male: 'പുരുഷൻ', female: 'സ്ത്രീ', other: 'മറ്റുള്ളവ' },
                        pa: { male: 'ਪੁਰਸ਼', female: 'ਔਰਤ', other: 'ਹੋਰ' },
                        as: { male: 'পুৰুষ', female: 'মহিলা', other: 'অন্যান্য' },
                        ur: { male: 'مرد', female: 'خاتون', other: 'دیگر' },
                        en: { male: 'Male', female: 'Female', other: 'Other' },
                      };
                      const labels = GENDER_LABELS[language] || GENDER_LABELS.en;
                      return gVal === 'male' ? labels.male : gVal === 'female' ? labels.female : labels.other;
                    })()}
                  </strong>
                </div>
                <div
                  onClick={() => {
                    setEditTempName(name);
                    setEditTempAge(age);
                    setEditTempGender(gender);
                    setEditTempContact(contact);
                    setEditTempComplaint(complaint);
                    setIsEditingIntakeFields(true);
                  }}
                  className="bg-cream/10 hover:bg-cream/15 cursor-pointer p-2 rounded-xl border border-cream/10 transition-all group"
                  title="Click to edit WhatsApp Number"
                >
                  <div className="flex items-center justify-between text-[10px] text-cream/60">
                    <span>{language === 'or' ? 'ହ୍ୱାଟ୍ସଆପ୍' : language === 'hi' ? 'व्हाट्सएप' : 'WhatsApp'}:</span>
                    <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-magenta transition-opacity" />
                  </div>
                  <strong className="text-cream truncate block text-[11px] mt-0.5">{contact ? `+91 ${contact}` : '—'}</strong>
                </div>
                <div
                  onClick={() => {
                    setEditTempName(name);
                    setEditTempAge(age);
                    setEditTempGender(gender);
                    setEditTempContact(contact);
                    setEditTempComplaint(complaint);
                    setIsEditingIntakeFields(true);
                  }}
                  className="bg-cream/10 hover:bg-cream/15 cursor-pointer p-2 rounded-xl border border-cream/10 transition-all group"
                  title="Click to edit Complaint"
                >
                  <div className="flex items-center justify-between text-[10px] text-cream/60">
                    <span>{language === 'or' ? 'ଏଆଇ ଆକଳନ' : language === 'hi' ? 'एआई समझ' : 'AI Understanding'}:</span>
                    <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-magenta transition-opacity" />
                  </div>
                  <span className="text-cream truncate block text-[11px] mt-0.5" title={(() => {
                    const c = complaint;
                    if (!c || c.trim().length < 3 || isPureDemographicIntro(c)) return '—';
                    return aiUnderstoodSentence || c;
                  })()}>
                    {(() => {
                      const c = complaint;
                      if (!c || c.trim().length < 3 || isPureDemographicIntro(c)) return '—';
                      return aiUnderstoodSentence || c;
                    })()}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative z-10 max-w-2xl mx-auto my-3 p-4 rounded-2xl bg-ink border border-cream/20 shadow-2xl text-xs space-y-3">
              <div className="flex items-center justify-between border-b border-cream/10 pb-2">
                <span className="font-semibold text-cream text-xs flex items-center gap-2">
                  <Edit2 className="w-3.5 h-3.5 text-magenta" />
                  {language === 'or' ? 'ରୋଗୀଙ୍କ ବିବରଣୀ ସମ୍ପାଦନା କରନ୍ତୁ' : language === 'hi' ? 'मरीज विवरण बदलें' : 'Edit Patient Details'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingIntakeFields(false)}
                  className="text-cream/60 hover:text-cream p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                <div>
                  <label className="text-[10px] text-cream/60 block mb-1">
                    {language === 'or' ? 'ରୋଗୀଙ୍କ ନାମ' : language === 'hi' ? 'रोगी का नाम' : 'Patient Name'}
                  </label>
                  <input
                    type="text"
                    value={editTempName}
                    onChange={(e) => setEditTempName(e.target.value)}
                    className="w-full bg-cream/10 border border-cream/20 rounded-xl px-2.5 py-1.5 text-xs text-cream focus:outline-none focus:border-magenta"
                    placeholder="Patient name"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-cream/60 block mb-1">
                    {language === 'or' ? 'ବୟସ' : language === 'hi' ? 'उम्र' : 'Age'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="130"
                    value={editTempAge}
                    onChange={(e) => setEditTempAge(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-cream/10 border border-cream/20 rounded-xl px-2.5 py-1.5 text-xs text-cream focus:outline-none focus:border-magenta"
                    placeholder="Age"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-cream/60 block mb-1">
                    {language === 'or' ? 'ଲିଙ୍ଗ' : language === 'hi' ? 'लिंग' : 'Gender'}
                  </label>
                  <select
                    value={editTempGender}
                    onChange={(e) => setEditTempGender(e.target.value)}
                    className="w-full bg-ink border border-cream/20 rounded-xl px-2.5 py-1.5 text-xs text-cream focus:outline-none focus:border-magenta"
                  >
                    <option value="">{language === 'or' ? 'ବାଛନ୍ତୁ' : language === 'hi' ? 'चुनें' : 'Select'}</option>
                    <option value="male">{language === 'or' ? 'ପୁରୁଷ (Male)' : language === 'hi' ? 'पुरुष' : 'Male'}</option>
                    <option value="female">{language === 'or' ? 'ମହିଳା (Female)' : language === 'hi' ? 'महिला' : 'Female'}</option>
                    <option value="other">{language === 'or' ? 'ଅନ୍ୟାନ୍ୟ' : language === 'hi' ? 'अन्य' : 'Other'}</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-cream/60 block mb-1">
                    {language === 'or' ? 'ହ୍ୱାଟ୍ସଆପ୍ ନମ୍ବର' : language === 'hi' ? 'व्हाट्सएप नंबर' : 'WhatsApp Mobile'}
                  </label>
                  <input
                    type="tel"
                    value={editTempContact}
                    onChange={(e) => setEditTempContact(e.target.value)}
                    className="w-full bg-cream/10 border border-cream/20 rounded-xl px-2.5 py-1.5 text-xs text-cream focus:outline-none focus:border-magenta"
                    placeholder="10-digit number"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-cream/60 block mb-1">
                    {language === 'or' ? 'ମୁଖ୍ୟ ସମସ୍ୟା' : language === 'hi' ? 'मुख्य समस्या' : 'Complaint'}
                  </label>
                  <input
                    type="text"
                    value={editTempComplaint}
                    onChange={(e) => setEditTempComplaint(e.target.value)}
                    className="w-full bg-cream/10 border border-cream/20 rounded-xl px-2.5 py-1.5 text-xs text-cream focus:outline-none focus:border-magenta"
                    placeholder="Chief symptom"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-cream/10">
                <button
                  type="button"
                  onClick={() => setIsEditingIntakeFields(false)}
                  className="pill pill-secondary text-xs px-3 py-1.5 text-cream/70 border-cream/20 hover:text-cream"
                >
                  {language === 'or' ? 'ବାତିଲ୍ (Cancel)' : language === 'hi' ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editTempName.trim()) {
                      setName(editTempName.trim());
                      patientNameRef.current = editTempName.trim();
                    }
                    if (editTempAge !== '') {
                      setAge(editTempAge);
                      patientAgeRef.current = editTempAge;
                    }
                    if (editTempGender) {
                      setGender(editTempGender);
                      patientGenderRef.current = editTempGender;
                    }
                    if (editTempContact.trim()) {
                      setContact(editTempContact.trim());
                      patientContactRef.current = editTempContact.trim();
                    }
                    if (editTempComplaint.trim()) {
                      setComplaint(editTempComplaint.trim());
                      patientComplaintRef.current = editTempComplaint.trim();
                    }
                    setIsEditingIntakeFields(false);
                  }}
                  className="pill pill-magenta text-xs font-semibold px-4 py-1.5"
                >
                  {language === 'or' ? 'ସଂରକ୍ଷଣ (Save)' : language === 'hi' ? 'सहेजें' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* Bottom Control Bar */}
          <div className="relative z-10 pt-4 border-t border-cream/10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRepeatCurrentPrompt}
                className="pill pill-secondary px-3.5 py-1.5 text-xs text-cream/90 border-cream/20 hover:border-magenta inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5 text-magenta" />
                <span>{language === 'or' ? 'ପୁଣି ଶୁଣନ୍ତୁ' : language === 'hi' ? 'दोबारा सुनें' : 'Repeat Question'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleVoicePause}
                className="pill pill-secondary px-3.5 py-1.5 text-xs text-cream/90 border-cream/20 hover:border-magenta inline-flex items-center gap-1.5"
              >
                {isVoicePaused ? <Play className="w-3.5 h-3.5 text-cream" /> : <Pause className="w-3.5 h-3.5 text-cream/70" />}
                <span>{isVoicePaused ? 'Resume' : 'Pause'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {voiceState === 'listening' ? (
                <button
                  type="button"
                  onClick={handleVoiceDoneSpeaking}
                  className="pill pill-magenta px-5 py-2 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 shadow-lg"
                >
                  <Check className="w-4 h-4" />
                  <span>Done Speaking</span>
                </button>
              ) : voiceState === 'assistant_speaking' ? (
                <button
                  type="button"
                  onClick={() => {
                    stopAllVoiceActivity();
                    if (currentStepListeningHandlerRef.current) {
                      startListeningVoice(currentStepListeningHandlerRef.current);
                    }
                  }}
                  className="pill pill-magenta px-4 py-2 text-xs font-semibold inline-flex items-center gap-2 shadow"
                >
                  <Mic className="w-4 h-4" />
                  <span>Interrupt & Speak</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOrbClick}
                  className="pill pill-cream px-4 py-2 text-xs font-semibold inline-flex items-center gap-2 shadow"
                >
                  <Mic className="w-4 h-4 text-magenta" />
                  <span>Tap to Speak</span>
                </button>
              )}
            </div>
          </div>
        </div>
        ) : (
        /* Voice Assistant Launch Banner */
        <div className="bg-creamdeep border border-ink/10 rounded-2xl p-4 sm:p-5 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-ink text-cream flex items-center justify-center shrink-0">
              <Mic className="w-4 h-4 text-magenta animate-pulse" aria-hidden="true" />
            </div>
            <div>
              <p className="font-serif opsz-72 font-semibold text-ink text-sm sm:text-base">
                {t('voiceAssistantTitle')} (ଓଡ଼ିଆ / हिन्दी / English)
              </p>
              <p className="text-inkmute text-xs mt-0.5">
                Complete your entire clinical intake hands-free by speaking naturally with the AI voice physician assistant.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleJumpToVoice}
            className="pill pill-magenta px-4 py-2 text-xs font-semibold shrink-0 self-stretch sm:self-auto justify-center inline-flex items-center gap-1.5"
          >
            <Bot className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Start Voice Intake Agent →</span>
          </button>
        </div>
      )}

        {/* Prominent Global Real-time Processing Notification */}
        {loadingStepText && (
          <div
            role="status"
            aria-live="polite"
            className="bg-indigo-50 border-2 border-indigo-400 text-indigo-950 rounded-xl p-4 shadow-md flex items-center gap-3 animate-pulse"
          >
            <div className="w-9 h-9 rounded-full bg-ink text-white flex items-center justify-center shrink-0 shadow">
              <Loader2 className="w-5 h-5 animate-spin text-amber-300" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs uppercase tracking-wider text-indigo-800">
                  {language === 'or' ? 'କାର୍ଯ୍ୟକାରୀ ହେଉଛି (Processing)' : language === 'hi' ? 'प्रक्रिया जारी है' : 'Realtime Processing'}
                </span>
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <p className="text-xs md:text-sm font-semibold text-indigo-950 mt-0.5">
                {loadingStepText}
              </p>
            </div>
          </div>
        )}

        {/* Error alert */}
        {error && (
          <div
            role="alert"
            className="bg-red-50 border-2 border-red-300 text-red-900 px-4 py-3 rounded-lg text-xs md:text-sm flex items-start gap-2 shadow-sm"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {/* Main Step Container */}
        <div className="bg-creamdeep rounded-2xl border border-ink/10 p-6 md:p-8 space-y-6">
          {/* Step 1: Personal Information */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-ink/10 pb-3 text-ink font-serif opsz-72 font-semibold text-base">
                <User className="w-4 h-4" aria-hidden="true" />
                <span>{t('personalInfoTitle')}</span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                {t('personalInfoSubtitle')}
              </p>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="patient-name" className="block text-xs font-semibold text-ink">
                    {t('fullNameLabel')} <span className="text-red-500">*</span>
                  </label>
                  {isVoiceAgentActive && intakeSlot === 'name' && (
                    <span className="text-[11px] text-magenta font-semibold animate-pulse flex items-center gap-1">
                      <Mic className="w-3.5 h-3.5 text-magenta" /> {language === 'or' ? 'ଶୁଭ ନାମ ଶୁଣୁଛି...' : language === 'hi' ? 'शुभ नाम सुन रहे हैं...' : 'Listening for full name...'}
                    </span>
                  )}
                </div>
                <input
                  id="patient-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('fullNamePlaceholder')}
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-sm bg-cream text-ink focus:outline-none transition-all ${isVoiceAgentActive && intakeSlot === 'name'
                      ? 'border-magenta ring-2 ring-magenta/40 bg-magenta/5'
                      : 'border-ink/14 focus:ring-2 focus:ring-magenta/30 focus:border-magenta'
                    }`}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="patient-age" className="block text-xs font-semibold text-ink">
                      {t('ageLabel')} <span className="text-red-500">*</span>
                    </label>
                    {isVoiceAgentActive && intakeSlot === 'age' && (
                      <span className="text-[11px] text-magenta font-semibold animate-pulse flex items-center gap-1">
                        <Mic className="w-3.5 h-3.5 text-magenta" /> {language === 'or' ? 'ବୟସ ଶୁଣୁଛି...' : language === 'hi' ? 'उम्र सुन रहे हैं...' : 'Listening for age...'}
                      </span>
                    )}
                  </div>
                  <input
                    id="patient-age"
                    type="number"
                    min="0"
                    max="130"
                    value={age}
                    onChange={(e) => setAge(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder={t('agePlaceholder')}
                    className={`w-full border rounded-xl px-3.5 py-2.5 text-sm bg-cream text-ink focus:outline-none transition-all ${isVoiceAgentActive && intakeSlot === 'age'
                        ? 'border-magenta ring-2 ring-magenta/40 bg-magenta/5'
                        : 'border-ink/14 focus:ring-2 focus:ring-magenta/30 focus:border-magenta'
                      }`}
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="patient-gender" className="block text-xs font-semibold text-ink">
                      {t('genderLabel')} <span className="text-red-500">*</span>
                    </label>
                    {isVoiceAgentActive && intakeSlot === 'gender' && (
                      <span className="text-[11px] text-magenta font-semibold animate-pulse flex items-center gap-1">
                        <Mic className="w-3.5 h-3.5 text-magenta" /> {language === 'or' ? 'ଲିଙ୍ଗ ଶୁଣୁଛି...' : language === 'hi' ? 'लिंग सुन रहे हैं...' : 'Listening for gender...'}
                      </span>
                    )}
                  </div>
                  <select
                    id="patient-gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className={`w-full border rounded-xl px-3.5 py-2.5 text-sm bg-cream text-ink focus:outline-none transition-all ${isVoiceAgentActive && intakeSlot === 'gender'
                        ? 'border-magenta ring-2 ring-magenta/40 bg-magenta/5'
                        : 'border-ink/14 focus:ring-2 focus:ring-magenta/30 focus:border-magenta'
                      }`}
                    required
                  >
                    <option value="" disabled>{language === 'or' ? 'ଲିଙ୍ଗ ଚୟନ କରନ୍ତୁ' : language === 'hi' ? 'लिंग चुनें' : 'Select Gender'}</option>
                    <option value="male">{t('genderMale')}</option>
                    <option value="female">{t('genderFemale')}</option>
                    <option value="other">{t('genderOther')}</option>
                    <option value="prefer_not_to_say">{t('genderPreferNot')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="patient-contact" className="block text-xs font-semibold text-ink">
                      {t('contactLabel')}
                    </label>
                    {isVoiceAgentActive && intakeSlot === 'whatsapp' && (
                      <span className="text-[11px] text-magenta font-semibold animate-pulse flex items-center gap-1">
                        <Mic className="w-3.5 h-3.5 text-magenta" /> {language === 'or' ? 'ହ୍ୱାଟ୍ସଆପ୍ ଶୁଣୁଛି...' : language === 'hi' ? 'व्हाट्सएप सुन रहे हैं...' : 'Listening for WhatsApp...'}
                      </span>
                    )}
                  </div>
                  <input
                    id="patient-contact"
                    type="tel"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder={t('contactPlaceholder')}
                    className={`w-full border rounded-xl px-3.5 py-2.5 text-sm bg-cream text-ink focus:outline-none transition-all ${isVoiceAgentActive && intakeSlot === 'whatsapp'
                        ? 'border-magenta ring-2 ring-magenta/40 bg-magenta/5'
                        : 'border-ink/14 focus:ring-2 focus:ring-magenta/30 focus:border-magenta'
                      }`}
                  />
                  <span className="text-[11px] text-slate-500 mt-0.5 block">{t('contactHelp')}</span>
                </div>

                <div>
                  <label htmlFor="preferred-language" className="block text-xs font-semibold text-ink mb-1.5">
                    {t('selectLanguage')}
                  </label>
                  <select
                    id="preferred-language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                    className="w-full border border-ink/14 rounded-xl px-3.5 py-2.5 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/30 focus:border-magenta"
                  >
                    <option value="en">English</option>
                    <option value="hi">हिन्दी (Hindi)</option>
                    <option value="or">ଓଡ଼ିଆ (Odia)</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-slate-700">
                <span className="flex items-center gap-1.5 font-medium">
                  <Mic className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                  <span>Want to skip typing and use Voice Assistant directly?</span>
                </span>
                <button
                  type="button"
                  onClick={handleJumpToVoice}
                  className="text-emerald-700 hover:text-emerald-900 font-bold underline underline-offset-2 shrink-0"
                >
                  Start Voice Interview →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Chief Complaint */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-ink/10 pb-3 text-ink font-serif opsz-72 font-semibold text-base">
                <HeartPulse className="w-4 h-4 text-red-600" aria-hidden="true" />
                <span>{t('chiefComplaintTitle')}</span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                {t('chiefComplaintSubtitle')}
              </p>

              {/* Emergency Alert Banner */}
              {isEmergencyComplaint(complaint) && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="p-4 bg-red-50 border-2 border-red-500 rounded-lg text-red-900 space-y-1 shadow-sm"
                >
                  <div className="flex items-center gap-2 font-bold text-red-800 text-sm">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />
                    <span>{t('emergencyNotice')} {t('emergencyCall')}</span>
                  </div>
                  <p className="text-xs leading-relaxed font-semibold">
                    {t('emergencyWarning')}
                  </p>
                </div>
              )}

              {/* In-Step Realtime Question Generation Loading */}
              {loadingQuestions && (
                <div className="p-4 bg-blue-50 border-2 border-blue-400 rounded-lg text-blue-900 flex items-center gap-3 shadow-sm animate-pulse">
                  <Loader2 className="w-5 h-5 text-blue-700 animate-spin shrink-0" />
                  <div>
                    <h4 className="font-bold text-xs md:text-sm">{t('generatingQuestions')}</h4>
                    <p className="text-[11px] text-blue-700">Jan Saathi AI clinical intelligence is analyzing symptoms...</p>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="chief-complaint-input" className="block text-xs font-semibold text-slate-700">
                    {t('complaintLabel')} <span className="text-red-500">*</span>
                  </label>
                  {isVoiceAgentActive && intakeSlot === 'problem' && (
                    <span className="text-[11px] text-magenta font-semibold animate-pulse flex items-center gap-1">
                      <Mic className="w-3.5 h-3.5 text-magenta" /> {language === 'or' ? 'ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା ଶୁଣୁଛି...' : language === 'hi' ? 'समस्या सुन रहे हैं...' : 'Listening for symptoms...'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleDictateComplaint}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all shadow-sm ${isListeningComplaint
                        ? 'bg-red-600 text-white animate-pulse'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                      }`}
                  >
                    <Mic className={`w-3.5 h-3.5 ${isListeningComplaint ? 'animate-bounce' : 'text-emerald-700'}`} />
                    <span>{isListeningComplaint ? 'Listening...' : t('dictateComplaint')}</span>
                  </button>
                </div>
                <textarea
                  id="chief-complaint-input"
                  rows={4}
                  value={complaint}
                  onChange={(e) => setComplaint(e.target.value)}
                  placeholder={t('complaintPlaceholder')}
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-sm bg-cream text-ink focus:outline-none transition-all ${isVoiceAgentActive && intakeSlot === 'problem'
                      ? 'border-magenta ring-2 ring-magenta/40 bg-magenta/5'
                      : 'border-ink/14 focus:ring-2 focus:ring-magenta/30 focus:border-magenta'
                    }`}
                  required
                />
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>Click <strong>{t('dictateComplaint')}</strong> above to speak symptoms.</span>
                  <button
                    type="button"
                    onClick={handleJumpToVoice}
                    className="text-emerald-700 hover:text-emerald-900 font-semibold underline underline-offset-2 flex items-center gap-1"
                  >
                    <Mic className="w-3 h-3" />
                    <span>Launch Voice Interview →</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="complaint-duration" className="block text-xs font-semibold text-ink mb-1.5">
                    {t('durationLabel')}
                  </label>
                  <input
                    id="complaint-duration"
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder={t('durationPlaceholder')}
                    className="w-full border border-ink/14 rounded-xl px-3.5 py-2.5 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/30 focus:border-magenta"
                  />
                </div>

                <div>
                  <label htmlFor="reported-severity" className="block text-xs font-semibold text-ink mb-1.5">
                    {t('severityLabel')}
                  </label>
                  <select
                    id="reported-severity"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    className="w-full border border-ink/14 rounded-xl px-3.5 py-2.5 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/30 focus:border-magenta"
                  >
                    <option value="mild">{t('severityMild')}</option>
                    <option value="moderate">{t('severityModerate')}</option>
                    <option value="severe">{t('severitySevere')}</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Medical History */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-ink/10 pb-3 text-ink font-serif opsz-72 font-semibold text-base">
                <History className="w-4 h-4" aria-hidden="true" />
                <span>{t('medicalHistoryTitle')}</span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                {t('medicalHistorySubtitle')}
              </p>

              <div>
                <label htmlFor="past-conditions" className="block text-xs font-semibold text-ink mb-1.5">
                  {t('conditionsLabel')}
                </label>
                <textarea
                  id="past-conditions"
                  rows={2}
                  value={medicalHistory}
                  onChange={(e) => setMedicalHistory(e.target.value)}
                  placeholder={t('conditionsPlaceholder')}
                  className="w-full border border-ink/14 rounded-xl px-3.5 py-2.5 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/30 focus:border-magenta"
                />
              </div>

              <div>
                <label htmlFor="known-allergies" className="block text-xs font-semibold text-ink mb-1.5">
                  {t('allergiesLabel')}
                </label>
                <input
                  id="known-allergies"
                  type="text"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder={t('allergiesPlaceholder')}
                  className="w-full border border-ink/14 rounded-xl px-3.5 py-2.5 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/30 focus:border-magenta"
                />
              </div>

              <div>
                <label htmlFor="current-medications" className="block text-xs font-semibold text-ink mb-1.5">
                  {t('medicationsLabel')}
                </label>
                <input
                  id="current-medications"
                  type="text"
                  value={medications}
                  onChange={(e) => setMedications(e.target.value)}
                  placeholder={t('medicationsPlaceholder')}
                  className="w-full border border-ink/14 rounded-xl px-3.5 py-2.5 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/30 focus:border-magenta"
                />
              </div>
            </div>
          )}

          {/* Step 4: AI Clinical Interview & Voice Assistant */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-ink/10 pb-3 text-ink font-serif opsz-72 font-semibold text-base">
                <HelpCircle className="w-4 h-4 text-magenta" aria-hidden="true" />
                <span>{t('interviewTitle')}</span>
              </div>

              {/* Clinical Protocol Disclaimer */}
              <div className="bg-creamdeep border border-ink/10 text-inkmute rounded-2xl p-4 text-xs leading-relaxed flex items-start gap-3">
                <Info className="w-4 h-4 text-magenta shrink-0 mt-0.5" aria-hidden="true" />
                <span>{clinicalDisclaimer || t('interviewDisclaimer')}</span>
              </div>

              {loadingQuestions && (
                <div className="py-6 text-center text-inkmute text-xs font-semibold animate-pulse flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-magenta" />
                  <span>{t('loadingQuestions')}</span>
                </div>
              )}

              {detectedSymptoms.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap text-xs text-inkmute">
                  <span className="font-semibold text-ink">Clinical Focus Areas:</span>
                  {detectedSymptoms.map((sym, idx) => (
                    <span key={idx} className="bg-cream text-ink border border-ink/12 px-3 py-1 rounded-full text-xs font-semibold">
                      {sym}
                    </span>
                  ))}
                </div>
              )}

              {/* Voice Assistant Interactive Widget */}
              {followUpQuestions.length > 0 && (
                <VoiceAssistantWidget
                  currentQuestion={followUpQuestions[activeQuestionIdx] || ''}
                  questionIndex={activeQuestionIdx}
                  totalQuestions={followUpQuestions.length}
                  onAnswerConfirmed={handleVoiceAnswerConfirmed}
                  autoStart={false}
                />
              )}

              {/* All Questions Answered Completion Banner */}
              {followUpQuestions.length > 0 &&
                Object.keys(followUpAnswers).length >= followUpQuestions.length && (
                  <div className="bg-creamdeep border border-ink/12 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-magenta text-cream flex items-center justify-center font-bold shadow-sm shrink-0">
                        ✓
                      </div>
                      <div>
                        <h4 className="font-serif opsz-72 font-semibold text-sm md:text-base text-ink">
                          All Interview Questions Answered
                        </h4>
                        <p className="text-xs text-inkmute mt-0.5">
                          {t('noQuestionsLeft')}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleNext}
                      className="w-full sm:w-auto pill pill-ink px-6 py-2.5 text-xs font-semibold shrink-0"
                    >
                      <span>{t('next')} →</span>
                    </button>
                  </div>
                )}

              {/* Questions List & Manual Answers */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between pb-1 border-b border-ink/8">
                  <h4 className="font-serif opsz-72 text-sm font-semibold text-ink">
                    {language === 'or' ? 'ଲିଖିତ ପ୍ରଶ୍ନୋତ୍ତର ବିବରଣୀ' : language === 'hi' ? 'लिखित प्रश्न व उत्तर विवरण' : 'Clinical Questions & Written Responses'}
                  </h4>
                  <span className="text-xs text-inkmute">
                    {Object.keys(followUpAnswers).length} / {followUpQuestions.length} answered
                  </span>
                </div>

                {followUpQuestions.map((q, idx) => (
                  <div
                    key={idx}
                    className={`rounded-2xl p-4 md:p-5 transition-all ${idx === activeQuestionIdx
                        ? 'border border-magenta bg-cream ring-2 ring-magenta/15 shadow-sm'
                        : 'border border-ink/10 bg-creamdeep/60'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <label
                        htmlFor={`q-answer-${idx}`}
                        className="block text-xs md:text-sm font-semibold text-ink leading-snug flex-1"
                      >
                        <span className="font-mono text-magenta mr-1.5">{idx + 1}.</span> {q}
                      </label>
                      {followUpAnswers[idx] && (
                        <span className="text-[11px] font-semibold text-magentadeep bg-magenta/10 border border-magenta/20 px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0">
                          <Check className="w-3 h-3 text-magenta" aria-hidden="true" />
                          <span>{language === 'or' ? 'ଉତ୍ତର ଦିଆଯାଇଛି' : language === 'hi' ? 'उत्तर दर्ज' : 'Answered'}</span>
                        </span>
                      )}
                    </div>

                    <textarea
                      id={`q-answer-${idx}`}
                      rows={2}
                      value={followUpAnswers[idx] || ''}
                      onFocus={() => setActiveQuestionIdx(idx)}
                      onChange={(e) =>
                        setFollowUpAnswers({
                          ...followUpAnswers,
                          [idx]: e.target.value,
                        })
                      }
                      placeholder={t('yourAnswerPlaceholder')}
                      className="w-full border border-ink/14 rounded-xl px-3.5 py-2.5 text-xs md:text-sm bg-cream text-ink placeholder-inkmute/50 focus:outline-none focus:border-magenta focus:ring-2 focus:ring-magenta/20"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Document Upload */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-ink/10 pb-3 text-ink font-serif opsz-72 font-semibold text-base">
                <UploadCloud className="w-4 h-4" aria-hidden="true" />
                <span>{t('documentUploadTitle')}</span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {t('documentUploadSubtitle')}
              </p>

              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center bg-slate-50 hover:bg-slate-100 transition-colors">
                <input
                  type="file"
                  id="docUpload"
                  multiple
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleAddFiles(e.target.files);
                    }
                  }}
                  className="hidden"
                />
                <label htmlFor="docUpload" className="cursor-pointer block">
                  <FileCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" aria-hidden="true" />
                  <span className="text-xs font-medium text-ink underline">
                    {selectedFiles.length > 0 ? `+ Add More Documents (${selectedFiles.length} attached)` : t('uploadFileLabel')}
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1">
                    PDF, JPG, or PNG up to 10MB (Multiple files allowed)
                  </p>
                </label>
                {selectedFiles.length > 0 && (
                  <div className="mt-3 space-y-2 text-left max-w-lg mx-auto">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 truncate">
                            <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="truncate font-medium">{file.name}</span>
                            <span className="text-[10px] text-slate-400">({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx)}
                            className="text-red-500 hover:text-red-700 text-xs font-semibold ml-2 shrink-0"
                          >
                            Remove
                          </button>
                        </div>
                        {renderFileOcrPreview(file, false)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Negative Intent / Skip Reports Button */}
              <div className="pt-2 border-t border-slate-100 text-center space-y-2">
                <p className="text-xs text-slate-500 font-medium">
                  {t('noReportsVoicePrompt')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (isVoiceAgentActive) {
                      const ack =
                        language === 'or'
                          ? 'ଠିକ୍ ଅଛି, କୌଣସି ଅସୁବିଧା ନାହିଁ। ଆସନ୍ତୁ ଏବେ ଆପଣଙ୍କ ଶରୀରର ମାପ (vitals) ନେବା।'
                          : language === 'hi'
                            ? 'कोई बात नहीं। चलिए अब आपके वाइटल्स मापते हैं।'
                            : 'No problem! Let us now proceed to record your live vitals.';
                      speakText(ack, () => setStep(6));
                    } else {
                      setStep(6);
                    }
                  }}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg border border-slate-300 text-xs shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  <span>{t('iDontHaveReportsBtn')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Live Vitals & Sensor Guidance */}
          {step === 6 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-ink/10 pb-3 text-ink font-serif opsz-72 font-semibold text-base">
                <Activity className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                <span>{t('vitalsTitle')}</span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {t('sensorGuidance')}
              </p>

              {/* Hardware Status Banner */}
              <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 text-xs flex items-center justify-between text-emerald-900 shadow-sm">
                <span className="flex items-center gap-2 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                  <span>ESP32-S3 Medical Sensor Simulation Active</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRescanVitals}
                    disabled={isReadingVitals}
                    className="text-xs text-emerald-800 underline font-semibold hover:text-emerald-950 disabled:opacity-50"
                  >
                    {isReadingVitals ? `Scanning (${vitalsCountdown}s)...` : 'Start 30s Scan'}
                  </button>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                    {isReadingVitals ? `Averaging Vitals (${vitalsCountdown}s • ${vitalsSampleCount} samples)...` : vitalsCaptured ? `30s Averaged & Attached (${vitalsSampleCount} samples)` : 'Hardware Telemetry Standby'}
                  </span>
                </div>
              </div>

              {/* Live Telemetry Acquisition Bar */}
              {isReadingVitals && (
                <div className="space-y-1.5 p-3.5 bg-emerald-50 rounded-xl border border-emerald-300">
                  <div className="flex justify-between text-xs font-bold text-emerald-900">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                      <span>
                        {t('readingTelemetry')} ({vitalsCountdown}s remaining • {vitalsSampleCount} samples collected)
                      </span>
                    </span>
                    <span>{vitalsProgress}%</span>
                  </div>
                  <div className="w-full bg-emerald-200 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${vitalsProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Live Telemetry Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* Heart Rate */}
                <div className="bg-white border-2 border-red-200 rounded-xl p-4 text-center shadow-sm relative overflow-hidden">
                  <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-2 animate-pulse">
                    <HeartPulse className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                    {t('heartRateLabel')}
                  </span>
                  <span className="text-2xl font-extrabold text-slate-800">
                    {vitals.heart_rate > 0 ? (
                      <>{vitals.heart_rate} <span className="text-xs font-semibold text-slate-400">bpm</span></>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700">Finger/Probe Not Detected</span>
                    )}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold block mt-1">Normal (60–100)</span>
                </div>

                {/* SpO2 */}
                <div className="bg-white border-2 border-blue-200 rounded-xl p-4 text-center shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-2">
                    <Zap className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                    {t('bloodOxygenLabel')}
                  </span>
                  <span className="text-2xl font-extrabold text-slate-800">
                    {vitals.spo2 > 0 ? (
                      <>{vitals.spo2} <span className="text-xs font-semibold text-slate-400">%</span></>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700">Finger/Probe Not Detected</span>
                    )}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold block mt-1">Optimal (95–100%)</span>
                </div>

                {/* Blood Pressure */}
                <div className="bg-white border-2 border-indigo-200 rounded-xl p-4 text-center shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-2">
                    <Activity className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                    {t('bloodPressureLabel')}
                  </span>
                  <span className="text-2xl font-extrabold text-slate-800">
                    {vitals.systolic_bp > 0 && vitals.diastolic_bp > 0 ? (
                      `${vitals.systolic_bp}/${vitals.diastolic_bp}`
                    ) : (
                      <span className="text-xs font-semibold text-amber-700">Finger/Probe Not Detected</span>
                    )}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold block mt-1">Standard (120/80)</span>
                </div>

                {/* Body Temperature */}
                <div className="bg-white border-2 border-amber-200 rounded-xl p-4 text-center shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-2">
                    <Thermometer className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                    {t('temperatureLabel')}
                  </span>
                  <span className="text-2xl font-extrabold text-slate-800">
                    {vitals.temperature > 0 ? (
                      <>{vitals.temperature} <span className="text-xs font-semibold text-slate-400">{vitals.temperature > 45 ? '°F' : '°C'}</span></>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700">Finger/Probe Not Detected</span>
                    )}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold block mt-1">Normal (98.6°F / 37°C)</span>
                </div>
              </div>

              {/* Live Sensor Wave Simulation Bar */}
              <div className="bg-slate-900 text-white p-4 rounded-xl shadow space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono">ESP32_PULSE_CH1 [REALTIME_PPG]</span>
                  <span className="text-emerald-400 font-bold">● Streaming</span>
                </div>
                <div className="h-10 bg-slate-800 rounded flex items-center justify-center overflow-hidden border border-slate-700">
                  <div className="w-full flex items-center justify-center gap-1">
                    {[40, 65, 30, 85, 95, 20, 60, 45, 90, 70, 35, 80, 50, 95, 30, 60].map((h, i) => (
                      <div
                        key={i}
                        style={{ height: `${h}%` }}
                        className="w-1.5 bg-emerald-400 rounded-full animate-pulse transition-all"
                      />
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 text-center">
                  Physiological vitals recorded & attached to patient case file for doctor review.
                </p>
              </div>
            </div>
          )}

          {/* Step 7: Review & Final Submission */}
          {step === 7 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-ink/10 pb-3 text-ink font-serif opsz-72 font-semibold text-base">
                <CheckSquare className="w-4 h-4" aria-hidden="true" />
                <span>{t('reviewTitle')}</span>
              </div>

              <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-2 border-b border-slate-200">
                  <div className="flex items-center justify-between pr-2">
                    <div>
                      <span className="text-slate-500 font-medium">{language === 'or' ? 'ରୋଗୀ' : 'Patient'}:</span>{' '}
                      <strong className="text-slate-800">{name}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-[11px] text-ink hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      title="Edit Name"
                    >
                      <Edit2 className="w-3 h-3 text-ink" />
                      <span>{language === 'or' ? 'ବଦଳାନ୍ତୁ' : 'Edit'}</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between pr-2">
                    <div>
                      <span className="text-slate-500 font-medium">{language === 'or' ? 'ବୟସ' : 'Age'}:</span>{' '}
                      <span className="text-slate-800">{age} yrs, {gender}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-[11px] text-ink hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      title="Edit Age"
                    >
                      <Edit2 className="w-3 h-3 text-ink" />
                      <span>{language === 'or' ? 'ବଦଳାନ୍ତୁ' : 'Edit'}</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between pr-2">
                    <div>
                      <span className="text-slate-500 font-medium">{language === 'or' ? 'ହ୍ୱାଟ୍ସଆପ୍ / ଫୋନ୍' : 'WhatsApp'}:</span>{' '}
                      <strong className="text-emerald-700">{contact ? `+91 ${contact}` : '—'}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-[11px] text-ink hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      title="Edit WhatsApp"
                    >
                      <Edit2 className="w-3 h-3 text-ink" />
                      <span>{language === 'or' ? 'ବଦଳାନ୍ତୁ' : 'Edit'}</span>
                    </button>
                  </div>
                </div>

                {/* AI Understood Clinical Sentence Display */}
                <div className="bg-magenta/5 border border-magenta/25 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-magenta font-semibold text-xs">
                      <Bot className="w-4 h-4 text-magenta" />
                      <span>
                        {language === 'or'
                          ? 'ଏଆଇ ଦ୍ୱାରା ବୁଝାଯାଇଥିବା କ୍ଲିନିକାଲ୍ ସାରାଂଶ (AI Understood Clinical Sentence)'
                          : language === 'hi'
                            ? 'एआई द्वारा समझा गया क्लिनिकल विवरण (AI Understood Clinical Sentence)'
                            : 'Clinical Sentence Understood by AI'}
                      </span>
                    </div>
                    <span className="text-[10px] bg-magenta/10 text-magenta font-semibold px-2.5 py-0.5 rounded-full border border-magenta/20">
                      AI Synthesized
                    </span>
                  </div>
                  <p className="text-slate-900 bg-white p-3 rounded-xl border border-magenta/20 font-medium text-sm leading-relaxed shadow-xs">
                    "{aiUnderstoodSentence || complaint || (language === 'or' ? 'ରୋଗୀ ସାଧାରଣ ସ୍ୱାସ୍ଥ୍ୟ ପରାମର୍ଶ ପାଇଁ ଆସିଛନ୍ତି।' : language === 'hi' ? 'मरीज सामान्य परामर्श के लिए आए हैं।' : 'Patient is presenting for routine general medical consultation.')}"
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pt-1">
                    <span>
                      <strong className="text-slate-700">{language === 'or' ? 'ରୋଗୀଙ୍କ କଥିତ ଶବ୍ଦ:' : language === 'hi' ? 'रोगी द्वारा कहे गए शब्द:' : 'Patient raw words:'}</strong>{' '}
                      <em>"{complaint}"</em>
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="text-magenta hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      title="Edit Complaint"
                    >
                      <Edit2 className="w-3 h-3 text-magenta" />
                      <span>{language === 'or' ? 'ବଦଳାନ୍ତୁ (Edit)' : language === 'hi' ? 'बदलें' : 'Edit'}</span>
                    </button>
                  </div>
                </div>

                {/* Recorded Vitals Summary */}
                <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded text-emerald-950 space-y-1">
                  <span className="font-bold text-[11px] block text-emerald-900">Recorded Live Vitals (30s Averaged Sensor Telemetry):</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <span>Heart Rate: <strong>{vitals.heart_rate > 0 ? `${vitals.heart_rate} bpm` : 'Finger/Probe Not Detected'}</strong></span>
                    <span>SpO2: <strong>{vitals.spo2 > 0 ? `${vitals.spo2}%` : 'Finger/Probe Not Detected'}</strong></span>
                    <span>Blood Pressure: <strong>{vitals.systolic_bp > 0 && vitals.diastolic_bp > 0 ? `${vitals.systolic_bp}/${vitals.diastolic_bp} mmHg` : 'Finger/Probe Not Detected'}</strong></span>
                    <span>Temp: <strong>{vitals.temperature > 0 ? `${vitals.temperature}${vitals.temperature > 45 ? '°F' : '°C'}` : 'Finger/Probe Not Detected'}</strong></span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500 font-medium">Duration:</span>{' '}
                    <span className="text-slate-800">{duration || 'Not specified'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Reported Severity:</span>{' '}
                    <span className="text-slate-800 capitalize font-bold">{severity}</span>
                  </div>
                </div>

                {followUpQuestions.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 space-y-1">
                    <span className="text-slate-500 font-medium block mb-1">Interview Responses:</span>
                    {followUpQuestions.map((q, idx) => (
                      <div key={idx} className="bg-white p-2 rounded border border-slate-200 text-[11px]">
                        <span className="font-semibold text-slate-700">Q: {q}</span>
                        <p className="text-slate-900 mt-0.5">A: {followUpAnswers[idx] || 'Not answered'}</p>
                      </div>
                    ))}
                  </div>
                )}

                {selectedFiles.length > 0 ? (
                  <div>
                    <span className="text-slate-500 font-medium">Attached Documents ({selectedFiles.length}):</span>
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      {selectedFiles.map((f, idx) => (
                        <li key={idx} className="text-slate-800 font-semibold text-xs">
                          {f.name} <span className="text-slate-400 font-normal">({(f.size / (1024 * 1024)).toFixed(2)} MB)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-slate-500 italic">No previous documents attached (Skipped per patient statement).</div>
                )}
              </div>

              {/* Realtime Submission Loading */}
              {isSubmitting && (
                <div className="p-4 bg-emerald-50 border-2 border-emerald-500 rounded-xl flex items-center gap-3 text-emerald-950 shadow-md animate-pulse">
                  <Loader2 className="w-6 h-6 text-emerald-700 animate-spin shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm">{t('submittingToDoctor')}</h4>
                    <p className="text-xs text-emerald-800">Encrypting case and notifying clinic doctor triage queue...</p>
                  </div>
                </div>
              )}

              {/* Disclaimer Checkbox */}
              <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3.5 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-amber-950 font-medium">
                  <input
                    type="checkbox"
                    checked={disclaimerAccepted}
                    onChange={(e) => {
                      const c = e.target.checked;
                      setDisclaimerAccepted(c);
                      disclaimerAcceptedRef.current = c;
                    }}
                    className="mt-0.5 w-4 h-4 rounded text-ink focus:ring-magenta"
                    required
                  />
                  <span className="leading-relaxed">
                    {t('disclaimerAgreement')}
                  </span>
                </label>

                {isVoiceAgentActive && (
                  <div className="flex items-center gap-2 pt-1 border-t border-amber-200 text-[11px] font-semibold text-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>
                      {language === 'or'
                        ? 'ସ୍ୱୟଂଚାଳିତ ଏଆଇ ଦାଖଲ ସକ୍ରିୟ ଅଛି। କେସ୍ ସ୍ୱତଃପ୍ରବୃତ୍ତ ଭାବେ ଡାକ୍ତରଙ୍କ ପାଖକୁ ପଠାଯାଉଛି।'
                        : language === 'hi'
                          ? 'स्वचालित एआई सबमिशन सक्रिय है। केस अपने आप डॉक्टर के पास भेजा जा रहा है।'
                          : 'Autonomous Voice Doctor auto-submission active. Your case will automatically transmit to the doctor.'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step Navigation Buttons */}
          <div className="pt-6 border-t border-ink/10 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(step - 1);
                }}
                className="pill pill-secondary px-5 py-2.5 text-xs font-medium"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>{t('back')}</span>
              </button>
            ) : (
              <div />
            )}

            {step < 7 ? (
              <button
                type="button"
                onClick={handleNext}
                className="pill pill-ink px-6 py-2.5 text-xs font-medium"
              >
                <span>{t('next')}</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting || !disclaimerAccepted}
                onClick={() => handleSubmit()}
                className="pill pill-magenta px-7 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('submitting')}</span>
                  </>
                ) : (
                  <span>{t('submit')}</span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* ── Dual Voice Engine Configuration Modal (Sarvam AI & ElevenLabs) ── */}
        {showVoiceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="relative w-full max-w-lg bg-slate-900 border border-cyan-500/40 rounded-2xl p-6 shadow-2xl text-white space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/30 text-cyan-400">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      Voice Engine Settings
                      <span className="text-[10px] bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-mono">
                        Sarvam & ElevenLabs
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Switch between Indian regional and Studio conversational speech anytime
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVoiceModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Active Provider Selector */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Active Speech Engine (Choose which speaks to patients):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectActiveProvider('sarvam')}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${activeVoiceProvider === 'sarvam'
                        ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 shadow-md ring-1 ring-cyan-400/50'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span>🇮🇳</span>
                      <span>Sarvam AI</span>
                    </span>
                    {activeVoiceProvider === 'sarvam' && (
                      <span className="text-[10px] bg-cyan-500 text-slate-950 px-1.5 py-0.2 rounded font-bold">
                        ACTIVE
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectActiveProvider('elevenlabs')}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${activeVoiceProvider === 'elevenlabs'
                        ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200 shadow-md ring-1 ring-emerald-400/50'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span>🎙️</span>
                      <span>ElevenLabs</span>
                    </span>
                    {activeVoiceProvider === 'elevenlabs' && (
                      <span className="text-[10px] bg-emerald-500 text-slate-950 px-1.5 py-0.2 rounded font-bold">
                        ACTIVE
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Provider Configuration Tabs */}
              <div className="flex border-b border-slate-800 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setVoiceModalTab('sarvam')}
                  className={`flex-1 py-2 text-center border-b-2 transition-all cursor-pointer ${voiceModalTab === 'sarvam'
                      ? 'border-cyan-400 text-cyan-300 font-bold'
                      : 'border-transparent text-slate-400 hover:text-white'
                    }`}
                >
                  🇮🇳 Sarvam AI Configuration
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceModalTab('elevenlabs')}
                  className={`flex-1 py-2 text-center border-b-2 transition-all cursor-pointer ${voiceModalTab === 'elevenlabs'
                      ? 'border-emerald-400 text-emerald-300 font-bold'
                      : 'border-transparent text-slate-400 hover:text-white'
                    }`}
                >
                  🎙️ ElevenLabs Configuration
                </button>
              </div>

              {/* Tab 1: Sarvam AI */}
              {voiceModalTab === 'sarvam' && (
                <div className="space-y-3.5">
                  <div className="text-xs text-slate-300 space-y-1.5">
                    <p className="text-[11px] text-slate-400">
                      Sarvam AI delivers 100% authentic native Indic accents (Odia bulbul:v3 with speaker ishita, Hindi bulbul:v4-flash with ritu).
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                      Sarvam AI Subscription Key:
                    </label>
                    <input
                      type="password"
                      value={sarvamApiKeyInput}
                      onChange={(e) => setSarvamApiKeyInput(e.target.value)}
                      placeholder="sk_..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                    />
                    <div className="flex items-center justify-between mt-1.5 text-[11px]">
                      <a
                        href="https://www.sarvam.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 underline font-medium"
                      >
                        Get free key at sarvam.ai →
                      </a>
                      <span className="text-slate-400">{sarvamConfigured ? '✓ Configured' : 'No Key'}</span>
                    </div>
                  </div>

                  {sarvamStatusMsg && (
                    <div
                      className={`p-2.5 rounded-xl text-xs font-medium ${sarvamStatusMsg.startsWith('✓')
                          ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
                          : 'bg-rose-950/80 border border-rose-500/50 text-rose-300'
                        }`}
                    >
                      {sarvamStatusMsg}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      disabled={isVerifyingSarvamKey}
                      onClick={handleSaveSarvamKey}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white shadow-lg disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {isVerifyingSarvamKey ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Testing Sarvam Key...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Verify & Save Sarvam Key</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: ElevenLabs */}
              {voiceModalTab === 'elevenlabs' && (
                <div className="space-y-3.5">
                  <div className="text-xs text-slate-300 space-y-1.5">
                    <p className="text-[11px] text-slate-400">
                      ElevenLabs produces world-class emotional human voices using <code className="text-emerald-400 bg-slate-800 px-1 rounded">eleven_multilingual_v2</code>. Free tier gives <strong>10,000 characters/month</strong>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                      ElevenLabs API Key:
                    </label>
                    <input
                      type="password"
                      value={elevenlabsApiKeyInput}
                      onChange={(e) => setElevenlabsApiKeyInput(e.target.value)}
                      placeholder="Enter your ElevenLabs API key (e.g. sk_...)"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 font-mono"
                    />
                    <div className="flex items-center justify-between mt-1.5 text-[11px]">
                      <a
                        href="https://elevenlabs.io/app/settings/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 underline font-medium"
                      >
                        Get your key at elevenlabs.io/app/settings/api-keys →
                      </a>
                      <span className="text-slate-400">{elevenlabsConfigured ? '✓ Configured' : 'No Key'}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                      Preferred Voice ID (Optional):
                    </label>
                    <input
                      type="text"
                      value={elevenlabsVoiceIdInput}
                      onChange={(e) => setElevenlabsVoiceIdInput(e.target.value)}
                      placeholder="EXAVITQu4vr4xnSDxMaL (Rachel - Multilingual)"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 font-mono"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Default is <code className="text-emerald-300">EXAVITQu4vr4xnSDxMaL</code> (Rachel). You can also use any voice ID from your ElevenLabs voice library.
                    </p>
                  </div>

                  {elevenlabsStatusMsg && (
                    <div
                      className={`p-2.5 rounded-xl text-xs font-medium ${elevenlabsStatusMsg.startsWith('✓')
                          ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
                          : 'bg-rose-950/80 border border-rose-500/50 text-rose-300'
                        }`}
                    >
                      {elevenlabsStatusMsg}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      disabled={isVerifyingElevenLabsKey}
                      onClick={handleSaveElevenLabsKey}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {isVerifyingElevenLabsKey ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Testing ElevenLabs Key...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Verify & Save ElevenLabs Key</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
};
