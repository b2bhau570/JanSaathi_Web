"""
Jan Saathi AI — Pydantic v2 request / response schemas.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


# ═══════════════════════════════════════════════════════════════════════════
# Generic helpers
# ═══════════════════════════════════════════════════════════════════════════
T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None


# ═══════════════════════════════════════════════════════════════════════════
# Auth / Token
# ═══════════════════════════════════════════════════════════════════════════
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    doctor_id: str
    email: str


# ═══════════════════════════════════════════════════════════════════════════
# Doctor
# ═══════════════════════════════════════════════════════════════════════════
class DoctorRegister(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=255)
    registration_number: str | None = Field(None, max_length=100)
    issuing_authority: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=20)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email format")
        return v

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class DoctorLogin(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str


class DoctorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    registration_number: str | None = None
    issuing_authority: str | None = None
    phone: str | None = None
    status: str
    is_admin: bool
    created_at: datetime
    updated_at: datetime


class DoctorProfile(BaseModel):
    """Fields a doctor may update on their own profile."""
    full_name: str | None = Field(None, min_length=1, max_length=255)
    phone: str | None = Field(None, max_length=20)
    registration_number: str | None = Field(None, max_length=100)
    issuing_authority: str | None = Field(None, max_length=255)


# ═══════════════════════════════════════════════════════════════════════════
# Patient Case
# ═══════════════════════════════════════════════════════════════════════════
class PatientCaseCreate(BaseModel):
    patient_name: str = Field(..., min_length=1, max_length=255)
    patient_age: int = Field(..., ge=0, le=150)
    patient_gender: str = Field(..., min_length=1, max_length=20)
    patient_contact: str | None = Field(None, max_length=100)
    preferred_language: str = Field("en", max_length=20)
    chief_complaint: str = Field(..., min_length=1, max_length=5000)
    complaint_duration: str | None = Field(None, max_length=100)
    severity: str | None = Field(None, pattern=r"^(mild|moderate|severe)$")
    medical_history: str | None = Field(None, max_length=5000)
    allergies: str | None = Field(None, max_length=2000)
    current_medications: str | None = Field(None, max_length=2000)
    follow_up_answers: list[dict[str, Any]] = Field(default_factory=list)
    measurements: list[dict[str, Any]] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def handle_nested_submission(cls, data: Any) -> Any:
        if isinstance(data, dict) and "personal_info" in data:
            pi = data.get("personal_info", {})
            cc = data.get("chief_complaint", {})
            mh = data.get("medical_history", {})
            
            raw_sev = cc.get("severity") if isinstance(cc, dict) else None
            if isinstance(raw_sev, (int, float)):
                sev_str = "severe" if raw_sev >= 7 else "moderate" if raw_sev >= 4 else "mild"
            elif isinstance(raw_sev, str) and raw_sev.lower() in ("mild", "moderate", "severe"):
                sev_str = raw_sev.lower()
            else:
                sev_str = "mild"

            # Safely normalize gender
            raw_gender = pi.get("gender") if isinstance(pi, dict) else None
            gender_val = str(raw_gender).lower().strip() if raw_gender else "prefer_not_to_say"
            if gender_val not in ("male", "female", "other", "prefer_not_to_say"):
                if "male" in gender_val:
                    gender_val = "male"
                elif "fem" in gender_val:
                    gender_val = "female"
                elif "trans" in gender_val or "other" in gender_val:
                    gender_val = "other"
                else:
                    gender_val = "prefer_not_to_say"

            # Safely normalize name
            raw_name = pi.get("full_name") if isinstance(pi, dict) else None
            name_val = str(raw_name).strip() if raw_name else "Anonymous Patient"
            if not name_val:
                name_val = "Anonymous Patient"

            # Safely normalize age (never fabricate a default age)
            raw_age = pi.get("age") if isinstance(pi, dict) else None
            try:
                age_val = int(raw_age) if raw_age is not None and str(raw_age).strip() != "" else None
            except (ValueError, TypeError):
                age_val = None
            if age_val is not None and (age_val < 0 or age_val > 150):
                age_val = None

            # Safely normalize chief complaint
            raw_cc = cc.get("description") if isinstance(cc, dict) else str(cc or "")
            cc_val = str(raw_cc).strip() if raw_cc else "General health consultation"
            if not cc_val:
                cc_val = "General health consultation"

            flattened = {
                "patient_name": name_val,
                "patient_age": age_val,
                "patient_gender": gender_val,
                "patient_contact": (pi.get("contact_number") or "").strip() or None if isinstance(pi, dict) else None,
                "preferred_language": pi.get("language", "en") if isinstance(pi, dict) else "en",
                "chief_complaint": cc_val,
                "complaint_duration": cc.get("duration") if isinstance(cc, dict) else None,
                "severity": sev_str,
                "medical_history": mh.get("past_conditions") if isinstance(mh, dict) else None,
                "allergies": mh.get("allergies") if isinstance(mh, dict) else None,
                "current_medications": mh.get("current_medications") if isinstance(mh, dict) else None,
                "follow_up_answers": data.get("follow_up_answers", []),
                "measurements": data.get("measurements", []),
            }
            return flattened
        return data

    @field_validator("patient_gender")
    @classmethod
    def validate_gender(cls, v: str) -> str:
        allowed = {"male", "female", "other", "prefer_not_to_say"}
        val = (v or "").lower().strip()
        if val not in allowed:
            return "prefer_not_to_say"
        return val


class PatientCaseResponse(BaseModel):
    """Returned to the patient after case creation."""
    model_config = ConfigDict(from_attributes=True)

    public_case_id: str
    access_token: str  # only returned once, at creation
    status: str
    priority: str
    created_at: datetime
    case_id: str | None = None
    message: str | None = None

    @model_validator(mode="after")
    def populate_aliases(self) -> PatientCaseResponse:
        self.case_id = self.public_case_id
        self.message = "Case submitted successfully"
        return self


class CaseStatusResponse(BaseModel):
    """Safe public view of case status (requires access_token)."""
    model_config = ConfigDict(from_attributes=True)

    public_case_id: str
    patient_name: str
    status: str
    priority: str
    created_at: datetime
    updated_at: datetime


class CaseDetailResponse(BaseModel):
    """Full case detail for doctors."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    public_case_id: str
    patient_name: str
    patient_age: int
    patient_gender: str
    patient_contact: str | None
    preferred_language: str
    chief_complaint: str
    complaint_duration: str | None
    severity: str | None
    medical_history: str | None
    allergies: str | None
    current_medications: str | None
    status: str
    priority: str
    assigned_doctor_id: str | None
    created_at: datetime
    updated_at: datetime
    responses: list[CaseResponseOut] = []
    documents: list[DocumentOut] = []
    triage_decisions: list[TriageDecisionResponse] = []
    notes: list[DoctorNoteResponse] = []
    measurements: list[MeasurementResponse] = []
    treatment: TreatmentRecordOut | None = None


class CaseListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    public_case_id: str
    patient_name: str
    patient_age: int
    patient_gender: str
    patient_contact: str | None = None
    preferred_language: str = "en"
    chief_complaint: str
    complaint_duration: str | None = None
    severity: str | None
    status: str
    priority: str
    assigned_doctor_id: str | None
    latest_vitals: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


# ═══════════════════════════════════════════════════════════════════════════
# Case Responses (Interview Q&A)
# ═══════════════════════════════════════════════════════════════════════════
class CaseResponseCreate(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    answer: str = Field(..., min_length=1, max_length=5000)
    question_source: str = Field("system", pattern=r"^(system|ai|doctor)$")


class CaseResponseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    question: str
    answer: str
    question_source: str
    response_order: int
    created_at: datetime


# ═══════════════════════════════════════════════════════════════════════════
# Documents
# ═══════════════════════════════════════════════════════════════════════════
class DocumentUploadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    original_filename: str
    file_type: str
    file_size: int
    extracted_data: str | None = None
    uploaded_at: datetime


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    original_filename: str
    file_type: str
    file_size: int
    extracted_data: str | None = None
    uploaded_at: datetime


# ═══════════════════════════════════════════════════════════════════════════
# Triage
# ═══════════════════════════════════════════════════════════════════════════
class TriageDecisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    priority: str
    reason: str
    triggering_data: str | None
    rule_version: str
    reviewed: bool
    reviewer_id: str | None
    reviewer_notes: str | None
    created_at: datetime


# ═══════════════════════════════════════════════════════════════════════════
# Doctor Notes
# ═══════════════════════════════════════════════════════════════════════════
class DoctorNoteCreate(BaseModel):
    note_type: str = Field("general", pattern=r"^(assessment|plan|follow_up|general)$")
    content: str = Field(..., min_length=1, max_length=10000)


class DoctorNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    doctor_id: str
    note_type: str
    content: str
    created_at: datetime
    updated_at: datetime


# ═══════════════════════════════════════════════════════════════════════════
# Treatment
# ═══════════════════════════════════════════════════════════════════════════
class TreatmentItemCreate(BaseModel):
    medicine_name: str = Field(..., min_length=1, max_length=255)
    strength: str | None = Field(None, max_length=100)
    dosage: str | None = Field(None, max_length=100)
    route: str | None = Field(None, max_length=50)
    frequency: str | None = Field(None, max_length=100)
    duration: str | None = Field(None, max_length=100)
    instructions: str | None = Field(None, max_length=2000)
    quantity: int | None = Field(None, ge=0)
    unit_price: float | None = Field(None, ge=0)
    total_price: float | None = Field(None, ge=0)
    sort_order: int = Field(0, ge=0)


class TreatmentRecordCreate(BaseModel):
    assessment: str | None = Field(None, max_length=10000)
    disposition: str | None = Field(None, max_length=100)
    next_steps: str | None = Field(None, max_length=5000)
    follow_up_instructions: str | None = Field(None, max_length=5000)
    warnings: str | None = Field(None, max_length=5000)
    items: list[TreatmentItemCreate] = []


class TreatmentItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    medicine_name: str
    strength: str | None
    dosage: str | None
    route: str | None
    frequency: str | None
    duration: str | None
    instructions: str | None
    quantity: int | None
    unit_price: float | None
    total_price: float | None
    sort_order: int


class TreatmentRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    doctor_id: str
    assessment: str | None
    disposition: str | None
    next_steps: str | None
    follow_up_instructions: str | None
    warnings: str | None
    is_finalized: bool
    items: list[TreatmentItemOut] = []
    created_at: datetime
    updated_at: datetime
    ai_summary: str | None = None
    whatsapp_message: str | None = None
    whatsapp_link: str | None = None
    order_url: str | None = None
    case_url: str | None = None
    recipient_contact: str | None = None
    whatsapp_bot_url: str | None = None
    whatsapp_bot_dispatched: bool | None = True


# ═══════════════════════════════════════════════════════════════════════════
# Measurements
# ═══════════════════════════════════════════════════════════════════════════
class MeasurementCreate(BaseModel):
    measurement_type: str = Field(..., min_length=1, max_length=50)
    value: float
    unit: str = Field(..., min_length=1, max_length=20)
    signal_quality: str | None = Field(None, pattern=r"^(good|fair|poor)$")
    source: str = Field("manual", pattern=r"^(device|simulated|manual)$")
    device_id: str | None = Field(None, max_length=100)
    recorded_at: datetime | None = None


class MeasurementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    measurement_type: str
    value: float
    unit: str
    signal_quality: str | None
    source: str
    device_id: str | None
    recorded_at: datetime
    created_at: datetime


# ═══════════════════════════════════════════════════════════════════════════
# Notifications
# ═══════════════════════════════════════════════════════════════════════════
class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    doctor_id: str
    case_id: str | None
    notification_type: str
    title: str
    message: str
    is_read: bool
    acknowledged_at: datetime | None
    created_at: datetime


# ═══════════════════════════════════════════════════════════════════════════
# Case Access
# ═══════════════════════════════════════════════════════════════════════════
class CaseAccessRequest(BaseModel):
    public_case_id: str
    access_token: str


class CaseAccessResponse(BaseModel):
    valid: bool
    public_case_id: str | None = None
    status: str | None = None


# ═══════════════════════════════════════════════════════════════════════════
# Misc
# ═══════════════════════════════════════════════════════════════════════════
class StatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(submitted|awaiting_review|under_review|awaiting_info|response_submitted|follow_up|closed)$")


class InterviewRequest(BaseModel):
    chief_complaint: str = Field(..., min_length=1, max_length=5000)
    responses: list[CaseResponseCreate] = []


class InterviewQuestions(BaseModel):
    questions: list[str]
    source: str = "deterministic_rules"
    language: str = "en"
    detected_symptoms: list[str] = []
    disclaimer: str | None = None


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    language: str = Field("hi", max_length=10)
    speaker: str | None = None
    model: str | None = None
    api_key: str | None = None
    provider: str | None = None
    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str | None = None


class TTSResponse(BaseModel):
    status: str
    provider: str
    model: str | None = None
    language: str | None = None
    speaker: str | None = None
    audio: str | None = None
    format: str | None = None
    message: str | None = None


class DashboardStats(BaseModel):
    total_cases: int
    submitted: int
    under_review: int
    closed: int
    emergency: int
    urgent: int
    elevated: int = 0
    normal: int = 0
    today_cases: int = 0
    language_breakdown: dict[str, int] = Field(default_factory=dict)
    my_active_cases: int = 0


class TriageOverrideRequest(BaseModel):
    priority: str = Field(..., pattern=r"^(normal|elevated|urgent|emergency)$")
    reason: str = Field(..., min_length=3, max_length=2000)


# Rebuild forward refs for models that reference types defined later
CaseDetailResponse.model_rebuild()
