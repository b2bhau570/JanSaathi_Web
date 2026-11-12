"""
Jan Saathi AI — Replaceable Local AI & Deterministic Interview Service.

All AI-generated content is clearly labelled as such.
⚠ DEVELOPMENT PROTOTYPE — Clinician review required.
Zero-cost, local-first architecture: no paid APIs, no external cloud dependencies.
"""

from __future__ import annotations

import logging
import re
import time
from abc import ABC, abstractmethod
from typing import Any

import httpx
from pydantic import BaseModel, Field

from app.config import settings

logger = logging.getLogger(__name__)

# Runtime model & auth state so retired 404 Gemini models and invalid 401/403 Sarvam keys
# do not spam error logs on every subsequent request while preserving clean fallback.
_RETIRED_GEMINI_MODELS: set[str] = set()
_DEPRECATED_GEMINI_MODELS: set[str] = {
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-001",
    "gemini-1.5-flash-002",
    "gemini-1.5-pro",
    "gemini-1.5-pro-latest",
    "gemini-2.0-flash",
    "gemini-2.0-flash-exp",
    "gemini-2.0-flash-lite",
}
_SARVAM_AUTH_COOLDOWN_SECONDS: float = 300.0
_sarvam_auth_failed_until: float = 0.0
_sarvam_auth_warned: bool = False


def get_ordered_gemini_models(primary: str | None = None, fallback: str = "gemini-3.1-flash-lite") -> list[str]:
    """Return candidate Gemini model IDs prioritizing active (non-404) models (never 1.5/2.0)."""
    raw_primary = (primary or getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash") or "gemini-2.5-flash").strip()
    if raw_primary in _DEPRECATED_GEMINI_MODELS:
        raw_primary = "gemini-2.5-flash"
    candidates = list(dict.fromkeys([
        raw_primary,
        "gemini-2.5-flash",
        fallback,
        "gemini-3.8-flash",
    ]))
    active = [
        m for m in candidates
        if m and m not in _RETIRED_GEMINI_MODELS and m not in _DEPRECATED_GEMINI_MODELS
    ]
    return active or [fallback]


def mark_gemini_model_retired(model_id: str, fallback: str = "gemini-3.1-flash-lite") -> None:
    """Cache HTTP 404 Gemini model retirement once per runtime to avoid repeated 404 failures."""
    if model_id and model_id != fallback and model_id not in _RETIRED_GEMINI_MODELS:
        _RETIRED_GEMINI_MODELS.add(model_id)
        logger.warning(
            "Gemini model '%s' returned HTTP 404 (unavailable/retired); switching subsequent calls directly to '%s'.",
            model_id,
            fallback,
        )


def is_sarvam_auth_blocked() -> bool:
    """Return True when Sarvam API recently failed auth (401/403) within cooldown."""
    return time.time() < _sarvam_auth_failed_until


def note_sarvam_auth_failure(status_code: int, context: str = "Sarvam API") -> None:
    """Record 401/403 Sarvam auth failure and warn once per cooldown window."""
    global _sarvam_auth_failed_until, _sarvam_auth_warned
    if status_code not in (401, 403):
        return
    now = time.time()
    was_blocked = now < _sarvam_auth_failed_until
    _sarvam_auth_failed_until = now + _SARVAM_AUTH_COOLDOWN_SECONDS
    if not was_blocked or not _sarvam_auth_warned:
        _sarvam_auth_warned = True
        logger.warning(
            "%s returned HTTP %d (invalid/unauthorized SARVAM_API_KEY in .env). "
            "Bypassing Sarvam for %.0fs and using Gemini/gTTS fallback cleanly.",
            context,
            status_code,
            _SARVAM_AUTH_COOLDOWN_SECONDS,
        )


def reset_sarvam_auth_state() -> None:
    """Clear Sarvam auth cooldown after an updated API key is verified."""
    global _sarvam_auth_failed_until, _sarvam_auth_warned
    _sarvam_auth_failed_until = 0.0
    _sarvam_auth_warned = False

_INDIC_LANG_LABELS: dict[str, str] = {
    "en": "English",
    "english": "English",
    "hi": "Hindi",
    "hindi": "Hindi",
    "or": "Odia",
    "od": "Odia",
    "odia": "Odia",
    "bn": "Bengali",
    "bengali": "Bengali",
    "te": "Telugu",
    "telugu": "Telugu",
    "ta": "Tamil",
    "tamil": "Tamil",
    "mr": "Marathi",
    "marathi": "Marathi",
    "gu": "Gujarati",
    "gujarati": "Gujarati",
    "kn": "Kannada",
    "kannada": "Kannada",
    "ml": "Malayalam",
    "malayalam": "Malayalam",
    "pa": "Punjabi",
    "punjabi": "Punjabi",
    "as": "Assamese",
    "assamese": "Assamese",
    "ur": "Urdu",
    "urdu": "Urdu",
    "ne": "Nepali",
    "nepali": "Nepali",
    "sa": "Sanskrit",
    "sanskrit": "Sanskrit",
    "mai": "Maithili",
    "maithili": "Maithili",
    "kok": "Konkani",
    "konkani": "Konkani",
    "sd": "Sindhi",
    "sindhi": "Sindhi",
    "doi": "Dogri",
    "dogri": "Dogri",
    "mni": "Manipuri",
    "manipuri": "Manipuri",
    "sat": "Santali",
    "santali": "Santali",
    "brx": "Bodo",
    "bodo": "Bodo",
    "ks": "Kashmiri",
    "kashmiri": "Kashmiri",
}

NON_DIAGNOSTIC_SYSTEM_INSTRUCTION = (
    "You are a strictly non-diagnostic triage intake assistant. NEVER diagnose diseases, "
    "prescribe medications, or advise taking specific drugs. If asked 'Is this serious?' or "
    "'Can I take medicine?', state that only a qualified Medical Officer can diagnose or "
    "prescribe after examination."
)


def _get_lang_label(language: str | None) -> str:
    raw = (language or "en").strip().lower()
    base = raw.split("-")[0]
    return _INDIC_LANG_LABELS.get(raw) or _INDIC_LANG_LABELS.get(base) or "English"


def anonymize_clinical_text(text: str | None) -> str:
    """Strip phones, emails, IDs, and self-introduced names before external LLM calls."""
    if not text:
        return ""
    cleaned = re.sub(r"\b[\w\.-]+@[\w\.-]+\.\w+\b", "[REDACTED_EMAIL]", text)
    cleaned = re.sub(r"(?<!\d)(?:\+?\d[\d\-\s]{7,}\d)(?!\d)", "[REDACTED_PHONE]", cleaned)
    cleaned = re.sub(
        r"\b(?:my\s+(?:full\s+)?name\s+is|i\s+am|mera\s+(?:poora\s+)?naam|mo\s+naa)\s+[A-Za-z]+(?:\s+[A-Za-z]+){0,2}",
        "[PATIENT_NAME]",
        cleaned,
        flags=re.IGNORECASE,
    )
    return cleaned


# ═══════════════════════════════════════════════════════════════════════════
# Strict I/O schemas
# ═══════════════════════════════════════════════════════════════════════════
class FollowUpInput(BaseModel):
    chief_complaint: str
    existing_answers: list[dict[str, str]] = Field(
        default_factory=list,
        description="List of {'question': ..., 'answer': ...} dicts from the interview so far.",
    )
    language: str = Field("en", max_length=20)


class FollowUpOutput(BaseModel):
    questions: list[str]
    source: str = "deterministic_rules"  # deterministic_rules | local_llm | deterministic_rule_fallback
    language: str = "en"
    detected_symptoms: list[str] = Field(default_factory=list)
    disclaimer: str = (
        "AI-GENERATED — These follow-up questions are produced by an automated "
        "system and have NOT been reviewed by a qualified clinician."
    )


class SymptomSummaryInput(BaseModel):
    chief_complaint: str
    responses: list[dict[str, str]] = Field(default_factory=list)
    severity: str | None = None
    language: str = "en"


class SymptomSummaryOutput(BaseModel):
    summary: str
    source: str = "deterministic_rules"
    disclaimer: str = (
        "AI-GENERATED — This summary is produced by an automated system "
        "and must be reviewed by a qualified clinician before any clinical use. "
        "It does NOT constitute a diagnosis or a prescription."
    )


# ═══════════════════════════════════════════════════════════════════════════
# Helpers: Normalization, Deduplication, Answer Validation
# ═══════════════════════════════════════════════════════════════════════════
def _normalize_q(q: str) -> str:
    """Normalize question string for deduplication (strip punctuation, whitespace, lowercase)."""
    if not q:
        return ""
    clean = re.sub(r"[^\w\s]", "", q.lower())
    return " ".join(clean.split())


class AnswerValidationResult(dict):
    """Dict-compatible result that also unpacks as (valid, sanitized)."""
    def __iter__(self):
        yield self["valid"]
        yield self["sanitized"]


def validate_interview_answer(answer: Any) -> AnswerValidationResult:
    """
    Validate a patient's interview answer.
    Checks for empty, single-character, or non-substantive text.
    Strips HTML tags and bounds length to 1000 characters.
    Provides sanitized recovery value.
    """
    if answer is None or not isinstance(answer, str):
        return AnswerValidationResult(valid=False, reason="empty", sanitized="Not answered")
    
    # Strip script blocks completely
    cleaned = re.sub(r"<script[^>]*>.*?</script>", "", answer, flags=re.IGNORECASE | re.DOTALL)
    # Strip remaining HTML tags
    cleaned = re.sub(r"<[^>]*>", "", cleaned).strip()
    if len(cleaned) > 1000:
        cleaned = cleaned[:1000].strip()

    if not cleaned:
        return AnswerValidationResult(valid=False, reason="empty", sanitized="Not answered")
    if len(cleaned) < 2 and cleaned.lower() not in ("no", "na", "हाँ", "ना", "ହଁ", "ନା"):
        return AnswerValidationResult(valid=False, reason="too_short", sanitized=cleaned)
    return AnswerValidationResult(valid=True, reason="ok", sanitized=cleaned)


# ═══════════════════════════════════════════════════════════════════════════
# Comprehensive Trilingual Clinical Interview Dictionaries (EN / HI / OR)
# ═══════════════════════════════════════════════════════════════════════════
# ⚠ DEVELOPMENT HEURISTICS — Must be certified by institutional clinicians.
_SYMPTOM_DICTIONARY: dict[str, dict[str, Any]] = {
    "chest_pain": {
        "keywords_en": ["chest pain", "chest", "tightness", "pressure", "angina"],
        "keywords_hi": ["छाती में दर्द", "सीने में दर्द", "छाती", "सीना", "सीने में भारीपन", "जकड़न"],
        "keywords_or": ["ଛାତି ଯନ୍ତ୍ରଣା", "ଛାତିରେ ଯନ୍ତ୍ରଣା", "ଛାତି", "ଛାତିରେ ଭାରୀପଣ", "ଛାତି ଚିପି ହେବା", "ହୃଦୟ"],
        "questions_en": [
            "Is the pain sharp, dull, or pressure-like?",
            "Does the pain radiate to your left arm, shoulder, jaw, or back?",
            "Does the pain worsen with exertion, walking, or deep breathing?",
            "Have you experienced shortness of breath, sweating, or nausea with this pain?",
        ],
        "questions_hi": [
            "क्या दर्द तेज़ है, भारीपन जैसा है या दबाव जैसा महसूस हो रहा है?",
            "क्या दर्द आपकी बाईं बांह, कंधे, जबड़े या पीठ की तरफ फैल रहा है?",
            "क्या चलने-फिरने या गहरी सांस लेने पर दर्द बढ़ जाता है?",
            "क्या दर्द के साथ सांस फूलना, पसीना आना या घबराहट हो रही है?",
        ],
        "questions_or": [
            "ଯନ୍ତ୍ରଣା ତୀବ୍ର, ଭାରୀ ବା ଚାପ ଭଳି ଅନୁଭବ ହେଉଛି କି?",
            "ଯନ୍ତ୍ରଣା ଆପଣଙ୍କ ବାମ ବାହୁ, କାନ୍ଧ, ବେକ କିମ୍ବା ପିଠି ଆଡ଼କୁ ବ୍ୟାପୁଛି କି?",
            "ଚାଲିବା କିମ୍ବା ଗଭୀର ନିଶ୍ୱାସ ନେବା ଦ୍ୱାରା ଯନ୍ତ୍ରଣା ବଢ଼ିଯାଉଛି କି?",
            "ଯନ୍ତ୍ରଣା ସହିତ ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ, ପ୍ରବଳ ଝାଳ କିମ୍ବା ବାନ୍ତି ଲାଗୁଛି କି?",
        ],
    },
    "breathing": {
        "keywords_en": ["breathing", "breathlessness", "shortness of breath", "dyspnea", "wheezing", "asthma"],
        "keywords_hi": ["सांस", "सांस फूलना", "सांस लेने में तकलीफ", "दमा", "घरघराहट"],
        "keywords_or": ["ନିଶ୍ୱାସ", "ନିଶ୍ୱାସ କଷ୍ଟ", "ଶ୍ୱାସକଷ୍ଟ", "ଦମ", "ଘଁ ଘଁ ଶବ୍ଦ", "ହୃଦ୍ରୋଗ"],
        "questions_en": [
            "Do you feel short of breath while resting, or only during physical activity?",
            "Do you hear a whistling or wheezing sound when breathing out?",
            "Do you have a history of asthma, COPD, or chronic lung illness?",
            "Does breathlessness wake you up from sleep or worsen when lying flat?",
        ],
        "questions_hi": [
            "क्या सांस आराम करते समय भी फूलती है या सिर्फ चलने-फिरने पर?",
            "क्या सांस छोड़ते समय सीने से सीटी जैसी या घरघराहट की आवाज आती है?",
            "क्या आपको पहले से दमा (अस्थमा) या फेफड़ों की कोई बीमारी है?",
            "क्या सीधे लेटने पर सांस लेने में तकलीफ बढ़ जाती है?",
        ],
        "questions_or": [
            "ଆପଣ ବିଶ୍ରାମ ନେବା ସମୟରେ ମଧ୍ୟ ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ ଅନୁଭବ କରୁଛନ୍ତି କି?",
            "ନିଶ୍ୱାସ ଛାଡ଼ିବା ସମୟରେ ଛାତିରୁ ଘଁ ଘଁ ବା ହୁଇସିଲ୍ ଭଳି ଶବ୍ଦ ଆସୁଛି କି?",
            "ଆପଣଙ୍କର ପୂର୍ବରୁ ଆଜ୍‌ମା, ଶ୍ୱାସ ବା ଫୁସଫୁସ ଜନିତ କୌଣସି ରୋଗ ଅଛି କି?",
            "ସିଧା ଶୋଇବା ଦ୍ୱାରା ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ ଅଧିକ ହେଉଛି କି?",
        ],
    },
    "headache": {
        "keywords_en": ["headache", "head pain", "migraine", "temple pain"],
        "keywords_hi": ["सिरदर्द", "सिर में दर्द", "सिर दर्द", "माइग्रेन", "आधासीसी"],
        "keywords_or": ["ମୁଣ୍ଡବିନ୍ଧା", "ମୁଣ୍ଡ ବିନ୍ଧା", "ମୁଣ୍ଡ ଯନ୍ତ୍ରଣା", "ମାଇଗ୍ରେନ", "ଅଧକପାଳୀ"],
        "questions_en": [
            "Where exactly is the headache located (forehead, sides, back of head)?",
            "On a scale of 1 to 10, how severe is the headache right now?",
            "Are you experiencing nausea, vomiting, dizziness, or sensitivity to bright light?",
            "Did the headache start suddenly like a 'thunderclap', or develop gradually?",
        ],
        "questions_hi": [
            "सिर में दर्द किस हिस्से में है (माथा, दोनों तरफ, या सिर के पीछे)?",
            "1 से 10 के पैमाने पर दर्द की तीव्रता कितनी है?",
            "क्या आपको उल्टी जैसा लगना, चक्कर आना या रोशनी से परेशानी हो रही है?",
            "क्या यह दर्द अचानक बहुत तेज़ी से शुरू हुआ या धीरे-धीरे बढ़ा?",
        ],
        "questions_or": [
            "ମୁଣ୍ଡର କେଉଁ ଅଂଶରେ ଯନ୍ତ୍ରଣା ହେଉଛି (କପାଳ, ଦୁଇ ପାଖ, ବା ମୁଣ୍ଡ ପଛପଟେ)?",
            "୧ ରୁ ୧୦ ମଧ୍ୟରେ ଯନ୍ତ୍ରଣାର ତୀବ୍ରତା କେତେ ହେବ?",
            "ଆପଣଙ୍କୁ ବାନ୍ତି ଲାଗିବା, ମୁଣ୍ଡ ବୁଲାଇବା କିମ୍ବା ଉଜ୍ଜ୍ୱଳ ଆଲୋକରେ ଅସୁବିଧା ହେଉଛି କି?",
            "ଏହି ଯନ୍ତ୍ରଣା ହଠାତ୍ ଅତି ତୀବ୍ର ଭାବରେ ଆରମ୍ଭ ହେଲା କି ଧୀରେ ଧୀରେ ବଢ଼ିଲା?",
        ],
    },
    "fever": {
        "keywords_en": ["fever", "chills", "high temperature", "pyrexia"],
        "keywords_hi": ["बुखार", "ताप", "कंपकंपी", "ठंड लगना", "हरारत"],
        "keywords_or": ["ଜ୍ୱର", "ଉତ୍ତାପ", "ଥଣ୍ଡା ଲାଗିବା", "ଥରିବା", "ଗରମ"],
        "questions_en": [
            "Have you measured your body temperature with a thermometer? If so, what was the reading?",
            "How many days have you had the fever?",
            "Do you have chills, body aches, joint pain, or a severe sore throat?",
            "Have you taken any fever-reducing medication (like Paracetamol)? Did it reduce the fever?",
        ],
        "questions_hi": [
            "क्या आपने थर्मामीटर से बुखार नापा है? तापमान कितना था?",
            "बुखार कितने दिनों से आ रहा है?",
            "क्या ठंड लगकर कंपकंपी, बदन दर्द या गले में तेज़ दर्द भी है?",
            "क्या आपने बुखार के लिए कोई दवा (जैसे पैरासिटामोल) ली है? क्या उससे आराम मिला?",
        ],
        "questions_or": [
            "ଆପଣ ଥର୍ମୋମିଟରରେ ତାପମାତ୍ରା ମାପିଛନ୍ତି କି? କେତେ ଡିଗ୍ରୀ ଥିଲା?",
            "କେତେ ଦିନ ହେଲା ଜ୍ୱର ଲାଗି ରହିଛି?",
            "ଥଣ୍ଡା ସହ କମ୍ପନ, ଶରୀର ବ୍ୟଥା, ଗଣ୍ଠି ଯନ୍ତ୍ରଣା କିମ୍ବା ଗଳା ଯନ୍ତ୍ରଣା ଅଛି କି?",
            "ଆପଣ ଜ୍ୱର ପାଇଁ କୌଣସି ଔଷଧ (ଯେପରି ପାରାସିଟାମୋଲ) ନେଇଛନ୍ତି କି? ସେଥିରେ ଉପଶମ ମିଳିଲା କି?",
        ],
    },
    "cough": {
        "keywords_en": ["cough", "coughing", "phlegm", "sputum"],
        "keywords_hi": ["खांसी", "कफ", "बलगम", "धसका"],
        "keywords_or": ["କାଶ", "କଫ", "ଶ୍ଲେଷ୍ମା", "ସୁଖିଲା କାଶ"],
        "questions_en": [
            "Is the cough dry, or are you bringing up phlegm/mucus?",
            "If bringing up phlegm, what colour is it (clear, yellow, green, or blood-tinged)?",
            "How many days or weeks have you been coughing?",
            "Do you have chest tightness, fever, or difficulty taking a deep breath?",
        ],
        "questions_hi": [
            "क्या सूखी खांसी है या बलगम आ रहा है?",
            "यदि बलगम आ रहा है, तो उसका रंग कैसा है (सफेद, पीला, हरा या खून के छींटे)?",
            "खांसी कितने दिनों या हफ्तों से चल रही है?",
            "क्या सीने में जकड़न, बुखार या सांस लेने में परेशानी हो रही है?",
        ],
        "questions_or": [
            "କାଶ ଶୁଖିଲା ଅଛି କି କଫ ବାହାରୁଛି?",
            "ଯଦି କଫ ବାହାରୁଛି, ତେବେ ତାର ରଙ୍ଗ କିପରି (ଧଳା, ହଳଦିଆ, ସବୁଜ ବା ରକ୍ତ ମିଶା)?",
            "କାଶ କେତେ ଦିନ କିମ୍ବା ସପ୍ତାହ ଧରି ଚାଲିଛି?",
            "ଛାତିରେ ଜକଡ଼ା ଭାବ, ଜ୍ୱର କିମ୍ବା ଗଭୀର ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ ଅଛି କି?",
        ],
    },
    "abdominal": {
        "keywords_en": ["abdominal", "stomach pain", "belly ache", "cramps"],
        "keywords_hi": ["पेट", "पेट दर्द", "पेट में दर्द", "मरोड़", "पेट में जलन"],
        "keywords_or": ["ପେଟ ଯନ୍ତ୍ରଣା", "ପେଟ ବିନ୍ଧା", "ପେଟ ଖରାପ", "ପେଟ କାମୁଡ଼ା", "ପେଟ ଜଳାପୋଡ଼ା"],
        "questions_en": [
            "Where in your abdomen is the pain (upper right, lower right, around navel)?",
            "Is the pain constant, or does it come and go in waves (cramping)?",
            "Are you experiencing nausea, vomiting, fever, or diarrhea?",
            "When did you last have a bowel movement, and was there any blood in the stool?",
        ],
        "questions_hi": [
            "पेट में दर्द किस जगह हो रहा है (ऊपर, नीचे दाईं तरफ, या नाभि के पास)?",
            "क्या दर्द लगातार बना रहता है या रुक-रुक कर मरोड़ जैसा उठता है?",
            "क्या उल्टी, जी मिचलाना, बुखार या दस्त की समस्या भी है?",
            "क्या शौच में खून या कालापन दिखाई दिया है?",
        ],
        "questions_or": [
            "ପେଟର କେଉଁ ସ୍ଥାନରେ ଯନ୍ତ୍ରଣା ହେଉଛି (ଉପର, ତଳ ଡାହାଣ ପାଖ, ବା ନାଭି ଚାରିପାଖରେ)?",
            "ଯନ୍ତ୍ରଣା କ୍ରମାଗତ ଲାଗି ରହିଛି କି ଛାଡ଼ି ଛାଡ଼ି ମୋଡ଼ି ହେବା ଭଳି ହେଉଛି?",
            "ବାନ୍ତି, ଓକାଳି, ଜ୍ୱର କିମ୍ବା ଝାଡ଼ା ହେଉଛି କି?",
            "ଶେଷ ଥର କେବେ ମଳତ୍ୟାଗ କରିଥିଲେ ଏବଂ ମଳରେ ରକ୍ତ ଆସିଥିଲା କି?",
        ],
    },
    "gastrointestinal": {
        "keywords_en": ["vomiting", "diarrhea", "loose motion", "nausea"],
        "keywords_hi": ["उल्टी", "दस्त", "दस्त लगना", "जी मिचलाना", "पतले दस्त"],
        "keywords_or": ["ବାନ୍ତି", "ଝାଡ଼ା", "ପତଳା ଝାଡ଼ା", "ବାନ୍ତି ଲାଗିବା", "ପେଟ ଖରାପ"],
        "questions_en": [
            "How many episodes of vomiting or loose stools have you had today?",
            "Are you able to keep fluids (water, ORS) down without vomiting?",
            "Do you feel excessively thirsty, weak, or dizzy when standing up?",
            "Has anyone else in your family or meal group fallen ill with similar symptoms?",
        ],
        "questions_hi": [
            "आज कितनी बार उल्टी या पतले दस्त हुए हैं?",
            "क्या आप पानी, ओआरएस या तरल पदार्थ पी पा रहे हैं या वे भी उल्टी में निकल रहे हैं?",
            "क्या बहुत अधिक प्यास, कमजोरी या खड़े होने पर चक्कर आ रहे हैं?",
            "क्या परिवार में किसी अन्य व्यक्ति को भी यही परेशानी हुई है?",
        ],
        "questions_or": [
            "ଆଜି କେତେ ଥର ବାନ୍ତି କିମ୍ବା ପତଳା ଝାଡ଼ା ହୋଇଛି?",
            "ଆପଣ ପାଣି କିମ୍ବା ଓଆରଏସ (ORS) ପିଇ ପାରୁଛନ୍ତି ନା ତାହା ବି ବାନ୍ତି ହୋଇଯାଉଛି?",
            "ଅତ୍ୟଧିକ ଶୋଷ, ଦୁର୍ବଳତା କିମ୍ବା ଛିଡ଼ା ହେଲେ ମୁଣ୍ଡ ବୁଲାଇବା ଭଳି ଲାଗୁଛି କି?",
            "ପରିବାରର ଅନ୍ୟ କୌଣସି ସଦସ୍ୟଙ୍କର ଏହିପରି ସମସ୍ୟା ହୋଇଛି କି?",
        ],
    },
    "dizziness": {
        "keywords_en": ["dizziness", "vertigo", "lightheaded", "faint"],
        "keywords_hi": ["चक्कर", "सिर घूमना", "कमजोरी से चक्कर", "बेहोशी जैसी स्थिति"],
        "keywords_or": ["ମୁଣ୍ଡ ବୁଲାଇବା", "ଚକ୍କର", "ଦୁର୍ବଳତା", "ଅଚେତ ହେବା", "ମୁଣ୍ଡ ହାଲୁକା ଲାଗିବା"],
        "questions_en": [
            "Does the room feel like it is spinning around you (vertigo), or do you feel faint/lightheaded?",
            "Have you completely passed out or lost consciousness, even for a few seconds?",
            "Does the dizziness occur when standing up suddenly from a bed or chair?",
            "Are you currently taking medications for blood pressure or diabetes?",
        ],
        "questions_hi": [
            "क्या ऐसा लगता है कि कमरा घूम रहा है, या कमजोरी से सिर हल्का लग रहा है?",
            "क्या आप कुछ सेकंड के लिए भी पूरी तरह बेहोश हुए हैं?",
            "क्या अचानक बिस्तर या कुर्सी से उठने पर चक्कर आते हैं?",
            "क्या आप ब्लड प्रेशर या शुगर की कोई नियमित दवा ले रहे हैं?",
        ],
        "questions_or": [
            "ଘର ଚାରିପାଖ ବୁଲିବା ଭଳି ଲାଗୁଛି କି ମୁଣ୍ଡ ହାଲୁକା ଓ ଦୁର୍ବଳ ଲାଗୁଛି?",
            "ଆପଣ କିଛି ସେକେଣ୍ଡ ପାଇଁ ସମ୍ପୂର୍ଣ୍ଣ ଅଚେତ ବା ବେହୋଶ ହୋଇଯାଇଥିଲେ କି?",
            "ହଠାତ୍ ବିଛଣା ବା ଚୌକିରୁ ଉଠି ଛିଡ଼ା ହେଲେ ମୁଣ୍ଡ ବୁଲାଉଛି କି?",
            "ଆପଣ ରକ୍ତଚାପ (BP) କିମ୍ବା ମଧୁମେହ (Diabetes) ପାଇଁ କୌଣସି ନିୟମିତ ଔଷଧ ଖାଉଛନ୍ତି କି?",
        ],
    },
    "injury": {
        "keywords_en": ["injury", "fall", "wound", "trauma", "accident", "fracture"],
        "keywords_hi": ["चोट", "गिरना", "दुर्घटना", "घाव", "मोच", "हड्डी"],
        "keywords_or": ["ଆଘାତ", "ପଡ଼ିଯିବା", "ଦୁର୍ଘଟଣା", "କ୍ଷତ", "ଭଙ୍ଗା", "ହାଡ଼"],
        "questions_en": [
            "How and when did the injury happen?",
            "Is there visible deformity, rapid swelling, or an open bleeding wound?",
            "Are you able to put weight on or move the injured limb/joint?",
            "Did you hit your head or lose consciousness during the incident?",
        ],
        "questions_hi": [
            "चोट कब और कैसे लगी (गिरने से, दुर्घटना से)?",
            "क्या चोट वाली जगह पर कोई विकृति, भारी सूजन या खुला घाव है?",
            "क्या आप चोटिल अंग या पैर पर वजन दे पा रहे हैं और उसे हिला पा रहे हैं?",
            "क्या चोट के दौरान सिर टकराया था या आप बेहोश हुए थे?",
        ],
        "questions_or": [
            "ଆଘାତ କେବେ ଏବଂ କିପରି ଲାଗିଲା (ପଡ଼ିଯିବା, ଦୁର୍ଘଟଣା ଯୋଗୁଁ)?",
            "ଆଘାତ ସ୍ଥାନରେ କୌଣସି ବିକୃତି, ପ୍ରବଳ ଫୁଲା ବା ଖୋଲା ରକ୍ତସ୍ରାବ କ୍ଷତ ଅଛି କି?",
            "ଆପଣ ଆହତ ଅଙ୍ଗ ଉପରେ ଭାର ଦେଇ ପାରୁଛନ୍ତି କିମ୍ବା ତାହା ହଲାଇ ପାରୁଛନ୍ତି କି?",
            "ଆଘାତ ସମୟରେ ମୁଣ୍ଡରେ ମାଡ଼ ହୋଇଥିଲା କି କିମ୍ବା ଆପଣ ଅଚେତ ହୋଇଥିଲେ କି?",
        ],
    },
}

_GENERIC_QUESTIONS_EN: list[str] = [
    "When exactly did you first notice these symptoms, and have they been worsening?",
    "Has a similar health issue occurred in the past? If so, what treatment helped?",
    "Are you currently taking any prescription medications, home remedies, or supplements?",
    "Do you have any known drug allergies or medical conditions (such as diabetes, heart disease, or asthma)?",
    "Is there any specific activity, position, or food that makes your symptoms noticeably better or worse?",
]

_GENERIC_QUESTIONS_HI: list[str] = [
    "ये लक्षण सबसे पहले कब शुरू हुए थे, और क्या ये समय के साथ बढ़ते जा रहे हैं?",
    "क्या पहले भी कभी ऐसी स्वास्थ्य समस्या हुई थी? यदि हाँ, तो किस इलाज से आराम मिला था?",
    "क्या आप वर्तमान में कोई नियमित अंग्रेजी, आयुर्वेदिक या घरेलू दवा ले रहे हैं?",
    "क्या आपको किसी दवा से कोई एलर्जी है या कोई पुरानी बीमारी (जैसे शुगर, बीपी, दमा) है?",
    "क्या कोई ऐसी स्थिति, काम या खान-पान है जिससे परेशानी कम या ज़्यादा महसूस होती है?",
]

_GENERIC_QUESTIONS_OR: list[str] = [
    "ଏହି ଲକ୍ଷଣଗୁଡ଼ିକ ପ୍ରଥମେ କେବେ ଆରମ୍ଭ ହୋଇଥିଲା, ଏବଂ ଏହା କ୍ରମଶଃ ବଢ଼ୁଛି କି?",
    "ପୂର୍ବରୁ କେବେ ଏପରି ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା ହୋଇଥିଲା କି? ଯଦି ହଁ, କେଉଁ ଚିକିତ୍ସାରେ ଉପଶମ ମିଳିଥିଲା?",
    "ଆପଣ ବର୍ତ୍ତମାନ କୌଣସି ଡାକ୍ତରୀ, ଆୟୁର୍ବେଦିକ କିମ୍ବା ଘରୋଇ ଔଷଧ ସେବନ କରୁଛନ୍ତି କି?",
    "ଆପଣଙ୍କର କୌଣସି ଔଷଧରୁ ଆଲର୍ଜି କିମ୍ବା ପୁରୁଣା ରୋଗ (ଯେପରି ମଧୁମେହ, ଉଚ୍ଚ ରକ୍ତଚାପ, ଶ୍ୱାସ) ଅଛି କି?",
    "କୌଣସି ନିର୍ଦ୍ଦିଷ୍ଟ କାର୍ଯ୍ୟ, ସ୍ଥିତି କିମ୍ବା ଖାଦ୍ୟ ଦ୍ୱାରା ଆପଣଙ୍କ ସମସ୍ୟା କମ ବା ବେଶୀ ହେଉଛି କି?",
]


# ═══════════════════════════════════════════════════════════════════════════
# Abstract Interface
# ═══════════════════════════════════════════════════════════════════════════
class AIService(ABC):
    """Abstract base for clinical interview follow-up and summary generation."""

    @abstractmethod
    def generate_follow_up_questions(
        self,
        inp: FollowUpInput | None = None,
        *,
        chief_complaint: str | None = None,
        language: str = "en",
        existing_answers: list[dict[str, str]] | dict[str, str] | None = None,
    ) -> FollowUpOutput:
        """Generate structured follow-up interview questions."""
        ...

    @abstractmethod
    def generate_symptom_summary(self, inp: SymptomSummaryInput) -> SymptomSummaryOutput:
        """Generate clinical intake summary from patient responses."""
        ...

    @abstractmethod
    def health_check(self) -> dict[str, Any]:
        """Verify service operational state."""
        ...


# ═══════════════════════════════════════════════════════════════════════════
# RuleBasedAIService — Deterministic, Local-First, Zero-Cost Engine
# ═══════════════════════════════════════════════════════════════════════════
class RuleBasedAIService(AIService):
    """
    Deterministic rule-based clinical interview engine.
    Features:
    - Contextual follow-up generation scanning both chief complaint and past answers.
    - Robust deduplication preventing duplicate questions.
    - True bilingual English & Hindi question banks.
    - Zero external network dependency, zero RAM overhead.
    """

    def _detect_symptoms(self, text: str, lang: str = "en") -> list[str]:
        return self._extract_symptoms(text, lang)

    def _extract_symptoms(self, text: str, lang: str) -> list[str]:
        """Identify matched symptom categories from combined text in the requested language."""
        text_lower = text.lower()
        matched: list[str] = []

        is_odia = lang in ("or", "odia")
        is_hindi = lang in ("hi", "hindi")

        for symptom_cat, data in _SYMPTOM_DICTIONARY.items():
            if is_odia:
                keywords = data.get("keywords_or", [])
            elif is_hindi:
                keywords = data["keywords_hi"]
            else:
                keywords = data["keywords_en"]
            # Also check English keywords as cross-lingual fallback
            if any(kw in text_lower for kw in keywords) or any(kw in text_lower for kw in data["keywords_en"]):
                if symptom_cat not in matched:
                    matched.append(symptom_cat)

        return matched

    def _generate_dynamic_symptom_questions(self, text: str, lang: str) -> list[str]:
        """
        Dynamically synthesize personalized clinical questions targeting the exact
        anatomical body parts, sensation qualities, or triggers mentioned by the patient.
        Works across English, Hindi, and Odia.
        """
        text_lower = text.lower()
        is_odia = lang in ("or", "odia")
        is_hindi = lang in ("hi", "hindi")

        anatomy_map = [
            (["ear", "कान", "କାନ"], "ear", "कान", "କାନ"),
            (["eye", "आंख", "ଆଖି"], "eye", "आंख", "ଆଖି"),
            (["throat", "swallow", "गला", "निगलना", "ଗଳା", "ଢୋକିବା"], "throat", "गला", "ଗଳା"),
            (["tooth", "teeth", "dental", "दांत", "दंत", "ଦାନ୍ତ"], "tooth", "दांत", "ଦାନ୍ତ"),
            (["neck", "गर्दन", "बगल", "ବେକ"], "neck", "गर्दन", "ବେକ"),
            (["shoulder", "कंधा", "କାନ୍ଧ"], "shoulder", "कंधा", "କାନ୍ଧ"),
            (["back", "spine", "कमर", "पीठ", "ପିଠି", "କମର"], "back", "पीठ / कमर", "କମର / ପିଠି"),
            (["knee", "leg", "ankle", "foot", "घुटना", "पैर", "टखना", "ଆଣ୍ଠୁ", "ଗୋଡ଼", "ଗଣ୍ଠି"], "knee / leg", "घुटना या पैर", "ଆଣ୍ଠୁ ବା ଗୋଡ଼"),
            (["wrist", "hand", "arm", "elbow", "हाथ", "कलाई", "बांह", "ହାତ", "ମଣିବନ୍ଧ", "ବାହୁ"], "arm / wrist", "हाथ या कलाई", "ହାତ ବା ମଣିବନ୍ଧ"),
            (["stomach", "abdomen", "belly", "पेट", "ପେଟ"], "abdomen", "पेट", "ପେଟ"),
            (["chest", "heart", "सीना", "छाती", "ଛାତି"], "chest", "छाती", "ଛାତି"),
            (["head", "temple", "सिर", "सर", "ମୁଣ୍ଡ"], "head", "सिर", "ମୁଣ୍ଡ"),
            (["skin", "rash", "itch", "त्वचा", "चमड़ी", "खुजली", "ଚର୍ମ", "କୁଣ୍ଡାଇ"], "skin", "त्वचा", "ଚର୍ମ"),
        ]

        found_part = None
        for keywords, en_name, hi_name, or_name in anatomy_map:
            if any(k in text_lower for k in keywords):
                found_part = (en_name, hi_name, or_name)
                break

        dynamic_qs: list[str] = []
        if found_part:
            en_name, hi_name, or_name = found_part
            if is_odia:
                dynamic_qs.append(f"ଆପଣଙ୍କ {or_name} ରେ ହେଉଥିବା ସମସ୍ୟା କୌଣସି ଆଘାତ ବା କାରଣରୁ ହଠାତ୍ ଆରମ୍ଭ ହେଲା ନା ଧୀରେ ଧୀରେ ବୃଦ୍ଧି ପାଇଲା?")
                dynamic_qs.append(f"ଆପଣଙ୍କର {or_name} ର ଯନ୍ତ୍ରଣା ବା ଅସ୍ୱସ୍ତି ଆଖପାଖର ଅନ୍ୟ କୌଣସି ଅଂଶକୁ ବ୍ୟାପୁଛି କି?")
                dynamic_qs.append(f"{or_name} କୁ ହଲାଇଲେ, ଚାପିଲେ ବା କୌଣସି ନିର୍ଦ୍ଦିଷ୍ଟ କାର୍ଯ୍ୟ କଲେ କଷ୍ଟ କମ ବା ବେଶୀ ହେଉଛି କି?")
                dynamic_qs.append(f"ସେଠାରେ କୌଣସି ଫୁଲା, ଲାଲ୍ ପଡ଼ିବା, ଜ୍ୱର କିମ୍ବା ପୂଜ ବାହାରିବା ଦେଖିଛନ୍ତି କି?")
            elif is_hindi:
                dynamic_qs.append(f"क्या आपके {hi_name} की समस्या अचानक किसी चोट या गतिविधि के बाद शुरू हुई या धीरे-धीरे बढ़ी?")
                dynamic_qs.append(f"क्या आपके {hi_name} का दर्द या परेशानी आसपास के किसी अन्य हिस्से में भी फैल रही है?")
                dynamic_qs.append(f"क्या {hi_name} को दबाने, हिलाने या किसी खास स्थिति में रखने से तकलीफ़ कम या ज़्यादा होती है?")
                dynamic_qs.append(f"क्या उस स्थान पर कोई सूजन, लाली, बुखार या असामान्य रिसाव दिखाई दिया है?")
            else:
                dynamic_qs.append(f"Did the symptoms in your {en_name} start suddenly after an injury/exertion, or develop gradually over time?")
                dynamic_qs.append(f"Does the pain or discomfort in your {en_name} radiate or spread to any surrounding areas?")
                dynamic_qs.append(f"Does pressing, moving, or resting your {en_name} make the discomfort feel noticeably better or worse?")
                dynamic_qs.append(f"Have you noticed any visible swelling, redness, fever, or discharge related to your {en_name}?")

        return dynamic_qs

    def generate_follow_up_questions(
        self,
        inp: FollowUpInput | str | None = None,
        *,
        chief_complaint: str | None = None,
        language: str = "en",
        existing_answers: list[dict[str, str]] | dict[str, str] | None = None,
    ) -> FollowUpOutput:
        if inp is None or isinstance(inp, str):
            comp = inp if isinstance(inp, str) else (chief_complaint or "")
            formatted_answers: list[dict[str, str]] = []
            if isinstance(existing_answers, dict):
                for q, a in existing_answers.items():
                    formatted_answers.append({"question": str(q), "answer": str(a)})
            elif isinstance(existing_answers, list):
                for item in existing_answers:
                    if isinstance(item, dict):
                        formatted_answers.append({
                            "question": str(item.get("question") or ""),
                            "answer": str(item.get("answer") or ""),
                        })
            inp = FollowUpInput(
                chief_complaint=comp,
                existing_answers=formatted_answers,
                language=language,
            )

        # 1. Error Recovery from Missing / Malformed Inputs
        complaint = (inp.chief_complaint or "").strip()
        answers = inp.existing_answers or []
        lang = (inp.language or "en").lower().strip()
        is_odia = lang in ("or", "odia")
        is_hindi = lang in ("hi", "hindi")

        # 2. Build set of normalized questions already asked to prevent duplicates
        asked_normalized: set[str] = set()
        for a in answers:
            if isinstance(a, dict):
                q_text = str(a.get("question") or "")
                norm = _normalize_q(q_text)
                if norm:
                    asked_normalized.add(norm)

        # 3. Contextual Continuity: Combine chief complaint and answers text
        combined_text = complaint
        for a in answers:
            if isinstance(a, dict):
                ans_text = str(a.get("answer") or "")
                if ans_text and ans_text.lower() not in ("not provided", "not answered"):
                    combined_text += " " + ans_text

        # 4. Detect contextual symptoms
        detected_categories = self._extract_symptoms(combined_text, lang)

        candidate_questions: list[str] = []
        if is_odia:
            q_key = "questions_or"
            generic_bank = _GENERIC_QUESTIONS_OR
        elif is_hindi:
            q_key = "questions_hi"
            generic_bank = _GENERIC_QUESTIONS_HI
        else:
            q_key = "questions_en"
            generic_bank = _GENERIC_QUESTIONS_EN

        for cat in detected_categories:
            questions_for_cat = _SYMPTOM_DICTIONARY[cat].get(q_key, _SYMPTOM_DICTIONARY[cat]["questions_en"])
            for q in questions_for_cat:
                norm_candidate = _normalize_q(q)
                # Strict duplicate prevention
                if norm_candidate not in asked_normalized and q not in candidate_questions:
                    candidate_questions.append(q)
                    asked_normalized.add(norm_candidate)

        # 5. Dynamic contextual questions based on patient's exact anatomical symptoms
        dynamic_qs = self._generate_dynamic_symptom_questions(combined_text, lang)
        for dq in dynamic_qs:
            norm_dq = _normalize_q(dq)
            if norm_dq not in asked_normalized and dq not in candidate_questions:
                candidate_questions.append(dq)
                asked_normalized.add(norm_dq)
            if len(candidate_questions) >= 4:
                break

        # 6. Fallback: If fewer than 3 questions found, supplement with generic screening
        if len(candidate_questions) < 3:
            for g_q in generic_bank:
                norm_g = _normalize_q(g_q)
                if norm_g not in asked_normalized and g_q not in candidate_questions:
                    candidate_questions.append(g_q)
                    asked_normalized.add(norm_g)
                if len(candidate_questions) >= 5:
                    break

        selected_questions = candidate_questions[:5]

        return FollowUpOutput(
            questions=selected_questions,
            source="deterministic_rules",
            language=lang,
            detected_symptoms=detected_categories,
        )

    def generate_symptom_summary(self, inp: SymptomSummaryInput) -> SymptomSummaryOutput:
        lang_clean = (inp.language or "en").lower().strip()
        is_odia = lang_clean in ("or", "odia")
        is_hindi = lang_clean in ("hi", "hindi")

        if is_odia:
            header = "[ନିୟମ-ଆଧାରିତ ସାରାଂଶ — ଡାକ୍ତରଙ୍କ ସମୀକ୍ଷା ଆବଶ୍ୟକ]"
            complaint_label = "ମୁଖ୍ୟ ସମସ୍ୟା (Chief Complaint):"
            sev_label = "ଗମ୍ଭୀରତା (Reported Severity):"
            sec_label = "ପ୍ରଶ୍ନୋତ୍ତର ଉତ୍ତର (Interview Responses):"
        elif is_hindi:
            header = "[नियम-आधारित सारांश — चिकित्सक समीक्षा आवश्यक]"
            complaint_label = "मुख्य समस्या (Chief Complaint):"
            sev_label = "गंभीरता (Reported Severity):"
            sec_label = "प्रश्नोत्तरी उत्तर (Interview Responses):"
        else:
            header = "[RULE-BASED INTAKE SUMMARY — CLINICIAN REVIEW REQUIRED]"
            complaint_label = "Chief Complaint:"
            sev_label = "Self-reported Severity:"
            sec_label = "Interview Responses:"

        parts: list[str] = [header, ""]
        parts.append(f"{complaint_label} {inp.chief_complaint or 'N/A'}")

        if inp.severity:
            parts.append(f"{sev_label} {inp.severity}")

        if inp.responses:
            parts.append("")
            parts.append(sec_label)
            for idx, item in enumerate(inp.responses, 1):
                if isinstance(item, dict):
                    q = item.get("question", "N/A")
                    a = item.get("answer", "N/A")
                    parts.append(f"  {idx}. Q: {q}")
                    parts.append(f"     A: {a}")

        return SymptomSummaryOutput(
            summary="\n".join(parts),
            source="deterministic_rules",
        )

    def health_check(self) -> dict[str, Any]:
        return {
            "status": "healthy",
            "type": "deterministic_rules",
            "supported_languages": ["en", "hi", "or"],
            "categories_supported": list(_SYMPTOM_DICTIONARY.keys()),
        }


# ═══════════════════════════════════════════════════════════════════════════
# LocalLLMAIService — Replaceable Local Model Adapter with Fallback
# ═══════════════════════════════════════════════════════════════════════════
class LocalLLMAIService(AIService):
    """
    Replaceable adapter for local offline LLMs (e.g. Ollama or llama-cpp running on localhost).
    Strictly isolated: zero paid APIs, zero cloud internet access.
    Guaranteed Fallback:
    If local LLM server is unreachable, times out, or produces unparseable output,
    it automatically delegates to RuleBasedAIService without user impact.
    """

    def __init__(
        self,
        base_url: str = settings.LOCAL_AI_URL,
        timeout_seconds: float = settings.LOCAL_AI_TIMEOUT_SECONDS,
        fallback_service: AIService | None = None,
        ollama_url: str | None = None,
        model_name: str | None = None,
        **kwargs,
    ):
        target_url = ollama_url or base_url
        self.base_url = target_url.rstrip("/")
        self.timeout = timeout_seconds
        self.fallback = fallback_service or RuleBasedAIService()
        self.model_name = model_name or "local-model"

    def generate_follow_up_questions(
        self,
        inp: FollowUpInput | str | None = None,
        *,
        chief_complaint: str | None = None,
        language: str = "en",
        existing_answers: list[dict[str, str]] | dict[str, str] | None = None,
    ) -> FollowUpOutput:
        if inp is None or isinstance(inp, str):
            comp = inp if isinstance(inp, str) else (chief_complaint or "")
            formatted_answers: list[dict[str, str]] = []
            if isinstance(existing_answers, dict):
                for q, a in existing_answers.items():
                    formatted_answers.append({"question": str(q), "answer": str(a)})
            elif isinstance(existing_answers, list):
                for item in existing_answers:
                    if isinstance(item, dict):
                        formatted_answers.append({
                            "question": str(item.get("question") or ""),
                            "answer": str(item.get("answer") or ""),
                        })
            inp = FollowUpInput(
                chief_complaint=comp,
                existing_answers=formatted_answers,
                language=language,
            )

        # Check if local AI is disabled in settings
        if not settings.LOCAL_AI_ENABLED:
            return self.fallback.generate_follow_up_questions(inp)

        try:
            # Prepare minimal prompt for local offline model
            lang_label = "Odia" if inp.language in ("or", "odia") else ("Hindi" if inp.language in ("hi", "hindi") else "English")
            prompt = (
                f"You are a medical triage assistant. Output 3 to 4 clinical follow-up questions in {lang_label} "
                f"for a patient presenting with: '{inp.chief_complaint}'. Output only the questions separated by newlines."
            )

            client = httpx.Client(timeout=self.timeout)
            response = client.post(
                f"{self.base_url}/api/generate",
                json={"prompt": prompt, "stream": False},
            )

            if response.status_code == 200:
                raw_text = response.json().get("response", "")
                parsed_qs = [
                    line.strip("- *0123456789.").strip()
                    for line in raw_text.splitlines()
                    if len(line.strip()) > 8 and "?" in line
                ]
                if parsed_qs:
                    return FollowUpOutput(
                        questions=parsed_qs[:5],
                        source="local_llm",
                        language=inp.language,
                        detected_symptoms=[],
                    )

            logger.warning("Local LLM returned non-200 or empty parsed questions; invoking deterministic fallback.")
            res = self.fallback.generate_follow_up_questions(inp)
            res.source = "deterministic_rule_fallback"
            return res

        except Exception as exc:
            logger.info("Local LLM unavailable (%s); using deterministic rule-based fallback.", str(exc))
            res = self.fallback.generate_follow_up_questions(inp)
            res.source = "deterministic_rule_fallback"
            return res

    def generate_symptom_summary(self, inp: SymptomSummaryInput) -> SymptomSummaryOutput:
        # Clinical safety rule: deterministic summarizer is always safer for intake records
        return self.fallback.generate_symptom_summary(inp)

    def health_check(self) -> dict[str, Any]:
        try:
            r = httpx.get(f"{self.base_url}/api/tags", timeout=1.0)
            llm_ok = r.status_code == 200
        except Exception:
            llm_ok = False

        return {
            "status": "healthy" if llm_ok else "fallback_active",
            "type": "local_llm" if llm_ok else "deterministic_rule_fallback",
            "local_llm_online": llm_ok,
            "fallback_available": True,
        }


# ═══════════════════════════════════════════════════════════════════════════
# SarvamAIService — Indian LLM Conversational Agent (Sarvam 105B Conversations)
# ═══════════════════════════════════════════════════════════════════════════
class SarvamAIService(AIService):
    """
    Adapter for Sarvam AI (sarvam-105b-conversations).
    Native deep comprehension of Odia, Hindi, Bengali, Telugu, Tamil, and English.
    Generates tailored, empathetic clinical follow-up questions for rural healthcare intake.
    """
    def __init__(
        self,
        api_key: str | None = None,
        model_name: str | None = None,
        fallback_service: AIService | None = None,
    ):
        self.api_key = api_key or settings.SARVAM_API_KEY or ""
        self.model_name = model_name or "sarvam-105b-conversations"
        self.fallback = fallback_service or RuleBasedAIService()

    def generate_follow_up_questions(
        self,
        inp: FollowUpInput | str | None = None,
        *,
        chief_complaint: str | None = None,
        language: str = "en",
        existing_answers: list[dict[str, str]] | dict[str, str] | None = None,
    ) -> FollowUpOutput:
        if inp is None or isinstance(inp, str):
            comp = inp if isinstance(inp, str) else (chief_complaint or "")
            formatted_answers: list[dict[str, str]] = []
            if isinstance(existing_answers, dict):
                for q, a in existing_answers.items():
                    formatted_answers.append({"question": str(q), "answer": str(a)})
            elif isinstance(existing_answers, list):
                for item in existing_answers:
                    if isinstance(item, dict):
                        formatted_answers.append({
                            "question": str(item.get("question") or ""),
                            "answer": str(item.get("answer") or ""),
                        })
            inp = FollowUpInput(
                chief_complaint=comp,
                existing_answers=formatted_answers,
                language=language,
            )

        if not self.api_key or is_sarvam_auth_blocked() or not inp.chief_complaint.strip():
            return self.fallback.generate_follow_up_questions(inp)

        try:
            lang_label = _get_lang_label(inp.language)
            safe_complaint = anonymize_clinical_text(inp.chief_complaint)
            history_text = ""
            if inp.existing_answers:
                history_text = "\nPrevious questions answered:\n" + "\n".join(
                    f"- Q: {anonymize_clinical_text(item.get('question'))} | A: {anonymize_clinical_text(item.get('answer'))}"
                    for item in inp.existing_answers
                )

            prompt = (
                f"{NON_DIAGNOSTIC_SYSTEM_INSTRUCTION}\n"
                f"Patient Context: [PATIENT_AGE_GENDER]\n"
                f"Patient's Chief Complaint: '{safe_complaint}'\n"
                f"{history_text}\n\n"
                f"Task: Generate 2 to 3 concise, empathetic follow-up intake questions in {lang_label} script "
                f"tailored strictly to this specific complaint (investigating duration, pain radiation, severity, or red flags).\n"
                f"Rules:\n"
                f"1. Output ONLY the questions separated by newlines, with no intro, numbers, or bullet points.\n"
                f"2. Use respectful natural {lang_label} script.\n"
                f"3. Strictly NEVER diagnose, name diseases, or suggest medications."
            )

            with httpx.Client(timeout=8.0) as client:
                res = client.post(
                    "https://api.sarvam.ai/v1/chat/completions",
                    headers={"api-subscription-key": self.api_key, "Content-Type": "application/json"},
                    json={
                        "model": self.model_name,
                        "messages": [
                            {"role": "system", "content": NON_DIAGNOSTIC_SYSTEM_INSTRUCTION},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.1,
                        "max_tokens": 400,
                    },
                )

            if res.status_code == 200:
                raw_text = res.json()["choices"][0]["message"]["content"].strip()
                parsed_qs = [
                    line.strip("- *0123456789. \t").strip()
                    for line in raw_text.splitlines()
                    if len(line.strip()) > 6 and (
                        "?" in line
                        or any(token in line for token in ("କି", "କ’ଣ", "କଣ", "କେବେ", "क्या", "कब", "कहाँ", "how", "what", "when", "where", "is", "are", "do", "does", "have"))
                    )
                ]
                if not parsed_qs:
                    parsed_qs = [
                        line.strip("- *0123456789. \t").strip()
                        for line in raw_text.splitlines()
                        if len(line.strip()) > 8
                    ]
                combined_text = inp.chief_complaint + " " + " ".join(
                    str(item.get("answer") or "") for item in inp.existing_answers
                )
                detected = self.fallback._detect_symptoms(combined_text, inp.language)
                if parsed_qs:
                    return FollowUpOutput(
                        questions=parsed_qs[:4],
                        source="ai",
                        language=inp.language,
                        detected_symptoms=detected,
                    )
            elif res.status_code in (401, 403):
                note_sarvam_auth_failure(res.status_code, "Sarvam 105B")
        except Exception as exc:
            logger.warning("Sarvam 105b error (%s); falling back to rule engine.", str(exc))

        res = self.fallback.generate_follow_up_questions(inp)
        res.source = "deterministic_rules"
        return res

    def generate_symptom_summary(self, inp: SymptomSummaryInput) -> SymptomSummaryOutput:
        return self.fallback.generate_symptom_summary(inp)

    def health_check(self) -> dict[str, Any]:
        return {
            "status": "configured" if self.api_key else "no_key",
            "type": "sarvam_agent",
            "model": self.model_name,
            "fallback_available": True,
        }


# ═══════════════════════════════════════════════════════════════════════════
# GeminiAIService — Conversational Cloud Agent (Free Tier Google Gemini)
# ═══════════════════════════════════════════════════════════════════════════
class GeminiAIService(AIService):
    """
    Adapter for Google Gemini API (gemini-2.5-flash with fallback gemini-3.1-flash-lite).
    Provides natural conversational clinical inquiry in Odia, Hindi, and English.
    Guaranteed fallback to RuleBasedAIService on network or quota errors with fast circuit breaker.
    """
    _circuit_open_until: float = 0.0
    _FALLBACK_MODEL: str = "gemini-3.1-flash-lite"

    def __init__(
        self,
        api_key: str | None = None,
        model_name: str | None = None,
        fallback_service: AIService | None = None,
    ):
        self.api_key = api_key or settings.GEMINI_API_KEY or ""
        raw_model = (model_name or settings.GEMINI_MODEL or "gemini-2.5-flash").strip()
        self.model_name = "gemini-2.5-flash" if raw_model in _DEPRECATED_GEMINI_MODELS else raw_model
        self.fallback = fallback_service or RuleBasedAIService()

    def generate_follow_up_questions(
        self,
        inp: FollowUpInput | str | None = None,
        *,
        chief_complaint: str | None = None,
        language: str = "en",
        existing_answers: list[dict[str, str]] | dict[str, str] | None = None,
    ) -> FollowUpOutput:
        import time

        if inp is None or isinstance(inp, str):
            comp = inp if isinstance(inp, str) else (chief_complaint or "")
            formatted_answers: list[dict[str, str]] = []
            if isinstance(existing_answers, dict):
                for q, a in existing_answers.items():
                    formatted_answers.append({"question": str(q), "answer": str(a)})
            elif isinstance(existing_answers, list):
                for item in existing_answers:
                    if isinstance(item, dict):
                        formatted_answers.append({
                            "question": str(item.get("question") or ""),
                            "answer": str(item.get("answer") or ""),
                        })
            inp = FollowUpInput(
                chief_complaint=comp,
                existing_answers=formatted_answers,
                language=language,
            )

        if not self.api_key or time.time() < GeminiAIService._circuit_open_until:
            return self.fallback.generate_follow_up_questions(inp)

        try:
            lang_label = _get_lang_label(inp.language)
            safe_complaint = anonymize_clinical_text(inp.chief_complaint)
            history_text = ""
            if inp.existing_answers:
                history_text = "\nPrevious questions answered:\n" + "\n".join(
                    f"- Q: {anonymize_clinical_text(item.get('question'))} | A: {anonymize_clinical_text(item.get('answer'))}"
                    for item in inp.existing_answers
                )

            prompt = (
                f"{NON_DIAGNOSTIC_SYSTEM_INSTRUCTION}\n"
                f"Patient Context: [PATIENT_AGE_GENDER]\n"
                f"Patient's Chief Complaint: '{safe_complaint}'\n"
                f"{history_text}\n\n"
                f"Task: Generate 3 to 4 concise, empathetic, targeted triage intake questions in {lang_label} "
                f"to understand symptom duration, severity, location/radiation, and red flags.\n"
                f"Rules:\n"
                f"1. Respond ONLY in {lang_label} script.\n"
                f"2. NEVER diagnose diseases, speculate on diagnoses, or recommend medicines.\n"
                f"3. Return only the questions separated by newlines, with no intro or explanation."
            )

            models_to_try = get_ordered_gemini_models(self.model_name, self._FALLBACK_MODEL)
            res = None
            with httpx.Client(timeout=4.0) as client:
                for m_id in models_to_try:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_id}:generateContent?key={self.api_key}"
                    candidate_res = client.post(
                        url,
                        json={
                            "systemInstruction": {"parts": [{"text": NON_DIAGNOSTIC_SYSTEM_INSTRUCTION}]},
                            "contents": [{"parts": [{"text": prompt}]}],
                            "generationConfig": {
                                "temperature": 0.3,
                                "maxOutputTokens": 1000,
                                "thinkingConfig": {"thinkingBudget": 0},
                            },
                        },
                    )
                    res = candidate_res
                    if candidate_res.status_code == 200:
                        break
                    if candidate_res.status_code == 404:
                        mark_gemini_model_retired(m_id, self._FALLBACK_MODEL)
                    else:
                        logger.warning("Gemini model %s returned HTTP %s", m_id, candidate_res.status_code)

            if res is not None and res.status_code == 200:
                data = res.json()
                candidates = data.get("candidates") or []
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    raw_text = parts[0].get("text", "") if parts else ""
                    parsed_qs = [
                        line.strip("- *0123456789. \t").strip()
                        for line in raw_text.splitlines()
                        if len(line.strip()) > 6 and (
                            "?" in line
                            or any(token in line for token in ("କି", "କ’ଣ", "କଣ", "କେବେ", "क्या", "कब", "कहाँ", "कितना", "how", "what", "when", "where", "is", "are", "do", "does", "have", "can"))
                        )
                    ]
                    if not parsed_qs:
                        parsed_qs = [
                            line.strip("- *0123456789. \t").strip()
                            for line in raw_text.splitlines()
                            if len(line.strip()) > 8
                        ]
                    combined_text = inp.chief_complaint + " " + " ".join(
                        str(item.get("answer") or "") for item in inp.existing_answers
                    )
                    detected = self.fallback._detect_symptoms(combined_text)
                    if parsed_qs:
                        return FollowUpOutput(
                            questions=parsed_qs[:5],
                            source="ai",
                            language=inp.language,
                            detected_symptoms=detected,
                        )

            logger.warning("Gemini returned non-200 or empty parsed questions; falling back to rule engine.")
            res = self.fallback.generate_follow_up_questions(inp)
            res.source = "deterministic_rules"
            return res

        except Exception as exc:
            # Trip circuit breaker for 60 seconds on connection/timeout error to keep intake snappy
            GeminiAIService._circuit_open_until = time.time() + 60.0
            logger.info("Gemini API error (%s); tripped circuit breaker for 60s, using deterministic rule-based fallback.", str(exc))
            res = self.fallback.generate_follow_up_questions(inp)
            res.source = "deterministic_rules"
            return res

    def generate_symptom_summary(self, inp: SymptomSummaryInput) -> SymptomSummaryOutput:
        return self.fallback.generate_symptom_summary(inp)

    def health_check(self) -> dict[str, Any]:
        return {
            "status": "configured" if self.api_key else "no_key",
            "type": "gemini_agent",
            "model": self.model_name,
            "fallback_available": True,
        }


# ═══════════════════════════════════════════════════════════════════════════
# Service Factory & Singleton
# ═══════════════════════════════════════════════════════════════════════════
def get_ai_service() -> AIService:
    """Return the active AI service instance based on configuration."""
    if settings.SARVAM_API_KEY:
        return SarvamAIService()
    if settings.GEMINI_API_KEY:
        return GeminiAIService()
    if settings.LOCAL_AI_ENABLED:
        return LocalLLMAIService()
    return RuleBasedAIService()


# Aliases for backwards compatibility with tests and existing imports
MockAIService = RuleBasedAIService
ai_service: AIService = get_ai_service()
