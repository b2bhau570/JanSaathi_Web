import React, { useState, useEffect, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { getReceipt, synthesizeSpeech } from '../../api/patientApi';
import {
  getOrCreateSharedAudio,
  getSharedAudio,
  setSharedAnnouncementPlaying,
} from '../../services/globalAudio';

export const AssessmentCompletePage: React.FC = () => {
  const location = useLocation();
  const state = (location.state as any) || {};

  const publicCaseId = state.public_case_id || 'JS-SAMPLE123';
  const accessToken = state.access_token || 'sample-token-save-this';
  const patientName = state.patient_name || 'Patient';
  const _fromVoiceAgent = Boolean(state.fromVoiceAgent ?? true);
  void _fromVoiceAgent;
  const language = state.language || 'hi';

  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const audioInstanceRef = useRef<HTMLAudioElement | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);
  const hasStartedAudioRef = useRef(false);

  const base64ToBlobUrl = (base64: string, mimeType?: string): string => {
    try {
      const clean = base64.replace(/^data:[^;]+;base64,/, '').trim();
      const binaryString = window.atob(clean);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const isWav = clean.startsWith('UklGR');
      const isMp3 = clean.startsWith('SUQz') || clean.startsWith('/+MY');
      const resolvedMime = mimeType || (isWav ? 'audio/wav' : isMp3 ? 'audio/mp3' : 'audio/mp3');
      const blob = new Blob([bytes], { type: resolvedMime });
      return URL.createObjectURL(blob);
    } catch {
      return `data:${mimeType || 'audio/mp3'};base64,${base64}`;
    }
  };

  const stopActiveAudio = () => {
    if (audioInstanceRef.current) {
      try {
        audioInstanceRef.current.pause();
        audioInstanceRef.current.currentTime = 0;
      } catch {}
      audioInstanceRef.current = null;
    }
    if (activeBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      } catch {}
      activeBlobUrlRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setIsPlayingAudio(false);
  };

  const playAnnouncement = (textToSpeak?: string, directAudioBase64?: string) => {
    stopActiveAudio();
    setIsPlayingAudio(true);

    const cleanIdToSpeak = publicCaseId.split('').join(' ');
    const text =
      textToSpeak ||
      state.announcement_text ||
      (language === 'or'
        ? `ଆପଣଙ୍କ କେସ୍ ସଫଳତାର ସହିତ ଡାକ୍ତରଙ୍କ ପାଖରେ ପହଞ୍ଚିଛି! ଆପଣଙ୍କ ରୋଗୀ ନମ୍ବର ହେଉଛି: ${cleanIdToSpeak} । ଦୟାକରି ଏହି ନମ୍ବର ନୋଟ୍ କରନ୍ତୁ ଏବଂ ଅପେକ୍ଷା କକ୍ଷରେ ବସନ୍ତୁ, ଡାକ୍ତର ଖୁବ୍ ଶୀଘ୍ର ଆପଣଙ୍କୁ ଡାକିବେ।`
        : language === 'hi'
        ? `आपका केस सफलतापूर्वक डॉक्टर के पास दर्ज हो गया है! आपका पेशेंट आईडी है: ${cleanIdToSpeak} । कृपया यह नंबर नोट कर लें और प्रतीक्षा कक्ष में बैठें, डॉक्टर आपको शीघ्र बुलाएंगे।`
        : `Your health assessment has been submitted to the clinic doctor! Your Patient ID is ${cleanIdToSpeak}. Please take a seat in the waiting area.`);

    const startPlayingBlob = (blobUrl: string) => {
      activeBlobUrlRef.current = blobUrl;
      const audio = getOrCreateSharedAudio();
      audioInstanceRef.current = audio;
      audio.onended = () => {
        setIsPlayingAudio(false);
        setSharedAnnouncementPlaying(false);
      };
      audio.onerror = (e: any) => {
        console.warn('Audio playback error:', e);
        setIsPlayingAudio(false);
      };

      audio.src = blobUrl;
      audio
        .play()
        .then(() => {
          setIsPlayingAudio(true);
          setAutoplayBlocked(false);
        })
        .catch((playErr: any) => {
          console.warn('Autoplay restricted by browser, ready for immediate tap:', playErr);
          setAutoplayBlocked(true);
          setIsPlayingAudio(false);

          const unlockAndPlay = () => {
            window.removeEventListener('click', unlockAndPlay);
            window.removeEventListener('touchstart', unlockAndPlay);
            window.removeEventListener('pointerdown', unlockAndPlay);
            audio
              .play()
              .then(() => {
                setIsPlayingAudio(true);
                setAutoplayBlocked(false);
              })
              .catch(() => {});
          };
          window.addEventListener('click', unlockAndPlay, { once: true });
          window.addEventListener('touchstart', unlockAndPlay, { once: true });
          window.addEventListener('pointerdown', unlockAndPlay, { once: true });
        });
    };

    // 1. Check if high-quality neural audio was already synthesized
    const candidateAudio = directAudioBase64 || state.announcement_audio;
    if (candidateAudio) {
      const isWav = candidateAudio.startsWith('UklGR');
      const mimeType = state.announcement_format || (isWav ? 'audio/wav' : 'audio/mp3');
      const blobUrl = base64ToBlobUrl(candidateAudio, mimeType);
      startPlayingBlob(blobUrl);
      return;
    }

    // 2. Fetch fresh natural audio from Sarvam AI / Studio Neural Voice Engine
    const savedSarvamKey = localStorage.getItem('jansaathi_sarvam_key') || undefined;
    const savedElevenKey = localStorage.getItem('jansaathi_elevenlabs_key') || undefined;
    const savedVoiceId = localStorage.getItem('jansaathi_elevenlabs_voice_id') || undefined;

    synthesizeSpeech(text, language, savedSarvamKey, undefined, 'sarvam', savedElevenKey, savedVoiceId)
      .then((res) => {
        if (res?.status === 'success' && res.audio) {
          const isWav = res.audio.startsWith('UklGR');
          const mimeType = res.format || (isWav ? 'audio/wav' : 'audio/mp3');
          const blobUrl = base64ToBlobUrl(res.audio, mimeType);
          startPlayingBlob(blobUrl);
        } else {
          fallbackSpeech(text);
        }
      })
      .catch((err) => {
        console.warn('synthesizeSpeech error, using natural fallback:', err);
        fallbackSpeech(text);
      });
  };

  // Replay studio neural voice without falling back to robotic desktop TTS
  const fallbackSpeech = (_text?: string) => {
    // Keep playback clean without mechanical Windows SAPI voices
    setIsPlayingAudio(false);
  };

  const playAnnouncementRef = useRef(playAnnouncement);
  const stopActiveAudioRef = useRef(stopActiveAudio);
  useEffect(() => {
    playAnnouncementRef.current = playAnnouncement;
    stopActiveAudioRef.current = stopActiveAudio;
  });

  useEffect(() => {
    if (hasStartedAudioRef.current) return;
    hasStartedAudioRef.current = true;

    // 1. If audio is already actively playing from the submission transition, seamlessly link to it
    const sharedAudio = getSharedAudio();
    if (sharedAudio && !sharedAudio.paused) {
      queueMicrotask(() => {
        audioInstanceRef.current = sharedAudio;
        setIsPlayingAudio(true);
        setAutoplayBlocked(false);
        sharedAudio.onended = () => {
          setIsPlayingAudio(false);
          setSharedAnnouncementPlaying(false);
        };
      });
      return;
    }

    // 2. Otherwise play immediately
    queueMicrotask(() => {
      playAnnouncementRef.current(undefined, state.announcement_audio);
    });
    return () => {
      stopActiveAudioRef.current();
    };
  }, [state.announcement_audio]);

  const handleCopy = () => {
    navigator.clipboard.writeText(accessToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDownloadReceipt = async () => {
    if (!publicCaseId || !accessToken) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await getReceipt(publicCaseId, accessToken);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JanSaathi-Receipt-${publicCaseId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      setDownloadError(
        language === 'or'
          ? 'ରସିଦ୍ ଡାଉନଲୋଡ୍ କରିବାରେ ଅସୁବିଧା ହେଲା। ଆପଣ ପରେ ମଧ୍ୟ କେସ୍ ଷ୍ଟାଟସ୍ ପେଜରୁ ଏହା ପାଇପାରିବେ।'
          : language === 'hi'
          ? 'रसीद डाउनलोड करने में समस्या आई। आप बाद में भी केस स्टेटस पेज से इसे प्राप्त कर सकते हैं।'
          : 'Could not download receipt. You can retrieve it from the Case Status page later.'
      );
    } finally {
      setDownloading(false);
    }
  };

  const cleanIdToSpeak = publicCaseId.split('').join(' ');
  const announcementText =
    language === 'or'
      ? `ଆପଣଙ୍କ କେସ୍ ସଫଳତାର ସହିତ ଡାକ୍ତରଙ୍କ ପାଖରେ ପହଞ୍ଚିଛି! ଆପଣଙ୍କ ରୋଗୀ ନମ୍ବର ହେଉଛି: ${cleanIdToSpeak} । ଦୟାକରି ଏହି ନମ୍ବର ନୋଟ୍ କରନ୍ତୁ ଏବଂ ଅପେକ୍ଷା କକ୍ଷରେ ବସନ୍ତୁ, ଡାକ୍ତର ଖୁବ୍ ଶୀଘ୍ର ଆପଣଙ୍କୁ ଡାକିବେ।`
      : language === 'hi'
      ? `आपका केस सफलतापूर्वक डॉक्टर के पास दर्ज हो गया है! आपका पेशेंट आईडी है: ${cleanIdToSpeak} । कृपया यह नंबर नोट कर लें और प्रतीक्षा कक्ष में बैठें, डॉक्टर आपको शीघ्र बुलाएंगे।`
      : `Your health assessment has been submitted to the clinic doctor! Your Patient ID is ${cleanIdToSpeak}. Please take a seat in the waiting area.`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Success Card */}
      <div className="bg-creamdeep rounded-2xl border border-ink/8 p-8 md:p-10 text-center space-y-6">
        <div className="w-16 h-16 bg-magenta/10 text-magenta rounded-full flex items-center justify-center mx-auto">
          <iconify-icon icon="ph:check-circle-fill" width="36" height="36"></iconify-icon>
        </div>

        <div className="space-y-2">
          <span className="eyebrow block">Submission Confirmed</span>
          <h1 className="font-serif opsz-96 font-medium text-2xl md:text-3xl text-ink">
            {language === 'or'
              ? 'ସ୍ୱାସ୍ଥ୍ୟ ପରାମର୍ଶ ସଫଳତାର ସହିତ ଦାଖଲ ହୋଇଛି'
              : language === 'hi'
              ? 'स्वास्थ्य परामर्श सफलतापूर्वक सबमिट हो गया है'
              : 'Health Assessment Submitted Successfully'}
          </h1>
          <p className="text-sm text-inkmute max-w-lg mx-auto leading-relaxed">
            {language === 'or'
              ? <>ଧନ୍ୟବାଦ <strong className="text-ink">{patientName}</strong> ଆଜ୍ଞା। ଆପଣଙ୍କ ସମସ୍ତ ଚିକିତ୍ସା ତଥ୍ୟ ଡାକ୍ତରଙ୍କ ସମୀକ୍ଷା ପାଇଁ ପଞ୍ଜୀକୃତ ହୋଇଛି।</>
              : language === 'hi'
              ? <>धन्यवाद <strong className="text-ink">{patientName}</strong> जी। आपकी सभी चिकित्सीय जानकारी डॉक्टर के पास सफलतापूर्वक दर्ज हो गई है।</>
              : <>Thank you, <strong className="text-ink">{patientName}</strong>. Your clinical information has been safely registered and added to the hospital review queue.</>}
          </p>
        </div>

        {/* Autoplay unlock banner */}
        {autoplayBlocked && (
          <div
            onClick={() => playAnnouncement(announcementText, state.announcement_audio)}
            className="bg-cream border border-magenta/30 text-ink px-4 py-3 rounded-xl flex items-center justify-between cursor-pointer hover:border-magenta transition-all"
          >
            <div className="flex items-center gap-2.5 text-xs md:text-sm font-medium">
              <iconify-icon icon="ph:speaker-high-fill" width="18" height="18" style={{ color: '#d6246e' }}></iconify-icon>
              <span>
                {language === 'or'
                  ? '🔊 ସ୍ୱର ନିର୍ଦ୍ଦେଶ ଶୁଣିବା ପାଇଁ ଏଠାରେ ଥରେ ଟ୍ୟାପ୍ କରନ୍ତୁ'
                  : language === 'hi'
                  ? '🔊 आवाज़ सुनने के लिए कृपया यहाँ टैप करें'
                  : '🔊 Tap anywhere to hear confirmation audio guide'}
              </span>
            </div>
            <span className="text-xs font-semibold text-magenta underline">
              {language === 'or' ? 'ଶୁଣନ୍ତୁ' : language === 'hi' ? 'सुनें' : 'Play'}
            </span>
          </div>
        )}

        {/* Public Case ID Box */}
        <div className="bg-ink text-cream rounded-2xl p-6 inline-block text-center min-w-[300px]">
          <span className="eyebrow text-cream/70 block mb-1">
            {language === 'or'
              ? 'ଆପଣଙ୍କ ରୋଗୀ ନମ୍ବର (Patient Case ID)'
              : language === 'hi'
              ? 'आपका पेशेंट आईडी (Patient Case ID)'
              : 'Your Public Patient Case ID'}
          </span>
          <span className="font-mono text-3xl md:text-4xl font-bold text-cream tracking-widest block my-1">
            {publicCaseId}
          </span>
          <span className="text-[11px] text-cream/55 block">
            {language === 'or'
              ? '⚠️ ଡାକ୍ତର ଆପଣଙ୍କୁ ଏହି ନମ୍ବରରେ ଡାକିବେ'
              : language === 'hi'
              ? '⚠️ डॉक्टर आपको इसी नंबर से बुलाएंगे'
              : '⚠️ The doctor will call you using this ID'}
          </span>
        </div>

        {/* Audio Guide Player Banner */}
        <div>
          <button
            type="button"
            onClick={() => playAnnouncement(announcementText, state.announcement_audio)}
            className="pill pill-ink px-5 py-2.5 text-xs font-medium inline-flex items-center gap-2"
            title="Click to hear confirmation announcement"
          >
            <iconify-icon icon="ph:speaker-high-fill" width="16" height="16"></iconify-icon>
            <span>
              {isPlayingAudio
                ? (language === 'or' ? 'ଘୋଷଣା ଶୁଣାଯାଉଛି...' : language === 'hi' ? 'घोषणा सुनाई जा रही है...' : 'Announcing...')
                : (language === 'or' ? '🔊 ନିର୍ଦ୍ଦେଶ ଓ କେସ୍ ଆଇଡି ଶୁଣନ୍ତୁ' : language === 'hi' ? '🔊 निर्देश और केस आईडी सुनें' : '🔊 Listen to Audio Guide & Case ID')}
            </span>
          </button>
        </div>
      </div>

      {/* Secret Access Token Card */}
      <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-magenta/10 text-magenta flex items-center justify-center shrink-0 mt-0.5">
            <iconify-icon icon="ph:key-fill" width="16" height="16"></iconify-icon>
          </div>
          <div className="space-y-1">
            <h2 className="font-serif opsz-72 text-sm font-semibold text-ink">
              {language === 'or'
                ? 'ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ: ଆପଣଙ୍କ ଗୁପ୍ତ କେସ୍ ଟୋକନ୍ (Secret Token) ସାଇତି ରଖନ୍ତୁ'
                : language === 'hi'
                ? 'महत्वपूर्ण: अपना गुप्त केस एक्सेस टोकन सहेज कर रखें'
                : 'Important: Save Your Secret Case Access Token'}
            </h2>
            <p className="text-xs text-inkmute leading-relaxed">
              {language === 'or'
                ? 'ଜନସାଥୀ ଏଆଇରେ କୌଣସି ପାସୱାର୍ଡ ଦରକାର ନାହିଁ। ଏହି ଟୋକନ୍ ମାଧ୍ୟମରେ ହିଁ ଆପଣ ଡାକ୍ତରଙ୍କ ପ୍ରେସକ୍ରିପସନ୍ ଦେଖିପାରିବେ ଏବଂ ରିପୋର୍ଟ ଡାଉନଲୋଡ୍ କରିପାରିବେ।'
                : language === 'hi'
                ? 'जन साथी एआई में किसी पासवर्ड की आवश्यकता नहीं है। इस टोकन के माध्यम से ही आप डॉक्टर का पर्चा देख सकते हैं और रसीद डाउनलोड कर सकते हैं।'
                : 'Because Jan Saathi AI does not use patient passwords or accounts, this cryptographically secure token is your only key to look up your doctor’s response, view finalized medicines, or download medical receipts later.'}
            </p>
          </div>
        </div>

        <div className="bg-cream border border-ink/10 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-auto overflow-hidden">
            <span className="text-[10px] text-inkmute block uppercase tracking-wider mb-0.5 font-medium">
              Access Token
            </span>
            <code className="text-xs md:text-sm font-mono text-ink font-semibold break-all">
              {accessToken}
            </code>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="pill pill-secondary px-4 py-2 text-xs font-medium w-full sm:w-auto shrink-0"
          >
            <iconify-icon icon={copied ? 'ph:check-bold' : 'ph:copy-bold'} width="14" height="14"></iconify-icon>
            <span>{copied ? 'Copied!' : 'Copy Token'}</span>
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleDownloadReceipt}
          disabled={downloading}
          className="pill pill-ink flex-1 py-3 text-xs md:text-sm font-medium justify-center"
        >
          <iconify-icon icon="ph:download-simple-bold" width="16" height="16"></iconify-icon>
          <span>
            {downloading
              ? (language === 'or' ? 'ଡାଉନଲୋଡ୍ ଚାଲିଛି...' : language === 'hi' ? 'डाउनलोड हो रहा है...' : 'Downloading PDF...')
              : (language === 'or' ? 'ଚିକିତ୍ସା ରସିଦ୍ ଡାଉନଲୋଡ୍ କରନ୍ତୁ (PDF)' : language === 'hi' ? 'चिकित्सीय रसीद डाउनलोड करें (PDF)' : 'Download Medical Receipt (PDF)')}
          </span>
        </button>

        <Link
          to={`/patient/case/${publicCaseId}?token=${accessToken}`}
          className="pill pill-magenta flex-1 py-3 text-xs md:text-sm font-semibold justify-center"
        >
          <span>
            {language === 'or' ? 'କେସ୍ ସ୍ଥିତି ଦେଖନ୍ତୁ →' : language === 'hi' ? 'केस स्थिति देखें →' : 'View Case Status →'}
          </span>
        </Link>
      </div>

      {downloadError && (
        <div className="bg-magenta/10 border border-magenta/25 text-magentadeep px-4 py-3 rounded-xl text-xs text-center font-medium">
          {downloadError}
        </div>
      )}
    </div>
  );
};
