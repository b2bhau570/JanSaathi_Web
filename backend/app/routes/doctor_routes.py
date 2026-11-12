"""
Jan Saathi AI — Doctor Clinical Management Routes.

CRITICAL ACCESS CONTROL RULES:
- Every endpoint in this router requires a valid JWT bearer token.
- Every endpoint strictly enforces require_approved_doctor.
- Pending, rejected, or suspended doctors are immediately denied (HTTP 403).
- Patients can never access these endpoints.
"""

from __future__ import annotations

import json
import logging
import os

logger = logging.getLogger("jansaathi.doctor")
import re
from datetime import datetime, timezone
from typing import Annotated
from urllib.parse import quote_plus

import httpx

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import case as sa_case, or_
from sqlalchemy.orm import Session

from app.auth import (
    bearer_scheme,
    decode_access_token,
    generate_case_whatsapp_token,
    require_approved_doctor,
)
from fastapi.security import HTTPAuthorizationCredentials
from app.config import settings
from app.database import get_db
from app.models import (
    AuditLog,
    CaseDocument,
    CaseResponse,
    Doctor,
    DoctorNote,
    Measurement,
    Notification,
    PatientCase,
    TreatmentItem,
    TreatmentRecord,
    TriageDecision,
)
from app.schemas import (
    CaseDetailResponse,
    CaseListItem,
    DashboardStats,
    DoctorNoteCreate,
    DoctorNoteResponse,
    DoctorProfile,
    DoctorResponse,
    MeasurementCreate,
    MeasurementResponse,
    NotificationResponse,
    PaginatedResponse,
    StatusUpdate,
    TreatmentRecordCreate,
    TreatmentRecordOut,
    TriageDecisionResponse,
    TriageOverrideRequest,
)
from app.services.pdf_service import generate_full_report_pdf, generate_referral_pdf
from app.services.triage_service import evaluate_triage

router = APIRouter(prefix="/doctor", tags=["Doctor Workspace"])


def _find_case(case_id: str, db: Session) -> PatientCase:
    """Find case by either internal ID or public_case_id."""
    case = (
        db.query(PatientCase)
        .filter(
            or_(
                PatientCase.id == case_id,
                PatientCase.public_case_id == case_id,
            )
        )
        .first()
    )
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case '{case_id}' not found",
        )
    return case


# ── Dashboard Statistics ────────────────────────────────────────────────────
def _extract_latest_vitals(case: PatientCase) -> dict[str, Any] | None:
    """Extract the most recent reading for each measurement type for quick preview."""
    if not case.measurements:
        return None
    vitals: dict[str, Any] = {}
    for m in sorted(case.measurements, key=lambda x: x.recorded_at, reverse=True):
        if m.measurement_type not in vitals:
            vitals[m.measurement_type] = {
                "value": m.value,
                "unit": m.unit,
                "signal_quality": m.signal_quality,
                "source": m.source,
            }
    return vitals or None


@router.get("/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> DashboardStats:
    """Real database-backed stats for the doctor overview."""
    from sqlalchemy import func

    total = db.query(PatientCase).count()
    submitted = db.query(PatientCase).filter(PatientCase.status == "submitted").count()
    under_review = db.query(PatientCase).filter(PatientCase.status == "under_review").count()
    closed = db.query(PatientCase).filter(PatientCase.status == "closed").count()
    emergency = db.query(PatientCase).filter(PatientCase.priority == "emergency").count()
    urgent = db.query(PatientCase).filter(PatientCase.priority == "urgent").count()
    elevated = db.query(PatientCase).filter(PatientCase.priority == "elevated").count()
    normal = db.query(PatientCase).filter(PatientCase.priority == "normal").count()

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_cases = db.query(PatientCase).filter(PatientCase.created_at >= today_start).count()

    my_active = db.query(PatientCase).filter(
        PatientCase.assigned_doctor_id == current_doctor.id,
        PatientCase.status.in_(["under_review", "submitted", "response_submitted"]),
    ).count()

    lang_counts: dict[str, int] = {}
    for lang, count in db.query(PatientCase.preferred_language, func.count(PatientCase.id)).group_by(PatientCase.preferred_language).all():
        lang_counts[lang or "en"] = count

    return DashboardStats(
        total_cases=total,
        submitted=submitted,
        under_review=under_review,
        closed=closed,
        emergency=emergency,
        urgent=urgent,
        elevated=elevated,
        normal=normal,
        today_cases=today_cases,
        language_breakdown=lang_counts,
        my_active_cases=my_active,
    )


@router.get("/dashboard/recent-cases", response_model=list[CaseListItem])
def get_recent_cases(
    limit: int = Query(8, ge=1, le=50),
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> list[CaseListItem]:
    """Get the most recent cases for quick doctor dashboard review."""
    items = (
        db.query(PatientCase)
        .order_by(PatientCase.created_at.desc())
        .limit(limit)
        .all()
    )
    items_out = []
    for item in items:
        dto = CaseListItem.model_validate(item)
        dto.latest_vitals = _extract_latest_vitals(item)
        items_out.append(dto)
    return items_out


# ── Case Queue / List ───────────────────────────────────────────────────────
@router.get("/cases", response_model=PaginatedResponse[CaseListItem])
def list_cases(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    priority_filter: str | None = Query(None, alias="priority"),
    search: str | None = Query(None),
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> PaginatedResponse[CaseListItem]:
    """Search and filter patient intake cases with pagination."""
    query = db.query(PatientCase)

    if status_filter:
        query = query.filter(PatientCase.status == status_filter)
    if priority_filter:
        query = query.filter(PatientCase.priority == priority_filter)
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                PatientCase.public_case_id.ilike(search_pattern),
                PatientCase.patient_name.ilike(search_pattern),
                PatientCase.chief_complaint.ilike(search_pattern),
            )
        )

    # Sort by urgency tier (emergency -> urgent -> elevated -> normal), then FIFO (created_at asc)
    priority_order = sa_case(
        (PatientCase.priority == "emergency", 1),
        (PatientCase.priority == "urgent", 2),
        (PatientCase.priority == "elevated", 3),
        (PatientCase.priority == "normal", 4),
        else_=5,
    )
    total = query.count()
    offset = (page - 1) * page_size
    items = (
        query.order_by(priority_order.asc(), PatientCase.created_at.asc())
        .offset(offset)
        .limit(page_size)
        .all()
    )
    pages = (total + page_size - 1) // page_size if total > 0 else 1

    items_out = []
    for item in items:
        dto = CaseListItem.model_validate(item)
        dto.latest_vitals = _extract_latest_vitals(item)
        items_out.append(dto)

    return PaginatedResponse(
        items=items_out,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


# ── Case Detail ─────────────────────────────────────────────────────────────
@router.get("/cases/{case_id}", response_model=CaseDetailResponse)
def get_case_detail(
    case_id: str,
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> CaseDetailResponse:
    """Full clinical case details for the authorized doctor."""
    case = _find_case(case_id, db)
    return CaseDetailResponse.model_validate(case)


# ── Update Case Status ──────────────────────────────────────────────────────
@router.patch("/cases/{case_id}/status", response_model=CaseDetailResponse)
@router.post("/cases/{case_id}/status", response_model=CaseDetailResponse)
def update_case_status(
    case_id: str,
    payload: StatusUpdate,
    request: Request,
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> CaseDetailResponse:
    """Update case lifecycle status (e.g., under_review, closed)."""
    case = _find_case(case_id, db)
    old_status = case.status
    case.status = payload.status
    if payload.status == "under_review" and not case.assigned_doctor_id:
        case.assigned_doctor_id = current_doctor.id

    audit = AuditLog(
        actor_type="doctor",
        actor_id=current_doctor.id,
        action="update_case_status",
        resource_type="patient_case",
        resource_id=case.id,
        details=f"Status changed from {old_status} to {payload.status}",
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    db.commit()
    db.refresh(case)
    return CaseDetailResponse.model_validate(case)


@router.post("/cases/{case_id}/assign", response_model=CaseDetailResponse)
def assign_case_to_doctor(
    case_id: str,
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> CaseDetailResponse:
    """Assign case to the current doctor and advance status to under_review if submitted."""
    case = _find_case(case_id, db)
    case.assigned_doctor_id = current_doctor.id
    if case.status == "submitted":
        case.status = "under_review"
    db.commit()
    db.refresh(case)
    return CaseDetailResponse.model_validate(case)


# ── Doctor Notes ────────────────────────────────────────────────────────────
@router.post("/cases/{case_id}/notes", response_model=DoctorNoteResponse, status_code=status.HTTP_201_CREATED)
def add_doctor_note(
    case_id: str,
    payload: DoctorNoteCreate,
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> DoctorNoteResponse:
    """Add a clinical note to a case."""
    case = _find_case(case_id, db)
    note = DoctorNote(
        case_id=case.id,
        doctor_id=current_doctor.id,
        note_type=payload.note_type,
        content=payload.content,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return DoctorNoteResponse.model_validate(note)


@router.get("/cases/{case_id}/notes", response_model=list[DoctorNoteResponse])
def get_doctor_notes(
    case_id: str,
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> list[DoctorNoteResponse]:
    """Retrieve all doctor notes for a case."""
    case = _find_case(case_id, db)
    notes = (
        db.query(DoctorNote)
        .filter(DoctorNote.case_id == case.id)
        .order_by(DoctorNote.created_at.desc())
        .all()
    )
    return [DoctorNoteResponse.model_validate(n) for n in notes]


# ── Treatment & Medicine Records ────────────────────────────────────────────
@router.post("/cases/{case_id}/treatment", response_model=TreatmentRecordOut)
def upsert_treatment_record(
    case_id: str,
    payload: TreatmentRecordCreate,
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> TreatmentRecordOut:
    """Create or update draft treatment record and prescribed medicines."""
    case = _find_case(case_id, db)
    treatment = (
        db.query(TreatmentRecord)
        .filter(TreatmentRecord.case_id == case.id)
        .first()
    )

    if not treatment:
        treatment = TreatmentRecord(
            case_id=case.id,
            doctor_id=current_doctor.id,
            assessment=payload.assessment,
            disposition=payload.disposition,
            next_steps=payload.next_steps,
            follow_up_instructions=payload.follow_up_instructions,
            warnings=payload.warnings,
            is_finalized=False,
        )
        db.add(treatment)
        db.flush()
    else:
        treatment.doctor_id = current_doctor.id
        treatment.assessment = payload.assessment
        treatment.disposition = payload.disposition
        treatment.next_steps = payload.next_steps
        treatment.follow_up_instructions = payload.follow_up_instructions
        treatment.warnings = payload.warnings
        # Clear existing items for replacement
        db.query(TreatmentItem).filter(TreatmentItem.treatment_id == treatment.id).delete()

    for item_data in payload.items:
        item = TreatmentItem(
            treatment_id=treatment.id,
            medicine_name=item_data.medicine_name,
            strength=item_data.strength,
            dosage=item_data.dosage,
            route=item_data.route,
            frequency=item_data.frequency,
            duration=item_data.duration,
            instructions=item_data.instructions,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            total_price=item_data.total_price,
            sort_order=item_data.sort_order,
        )
        db.add(item)

    db.commit()
    db.refresh(treatment)
    return TreatmentRecordOut.model_validate(treatment)


@router.get("/cases/{case_id}/treatment", response_model=TreatmentRecordOut)
def get_treatment_record(
    case_id: str,
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> TreatmentRecordOut:
    """Get the treatment record for a case."""
    case = _find_case(case_id, db)
    treatment = (
        db.query(TreatmentRecord)
        .filter(TreatmentRecord.case_id == case.id)
        .first()
    )
    if not treatment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No treatment record found for this case",
        )
    return TreatmentRecordOut.model_validate(treatment)


@router.post("/cases/{case_id}/treatment/finalize", response_model=TreatmentRecordOut)
async def finalize_treatment_record(
    case_id: str,
    request: Request,
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> TreatmentRecordOut:
    """
    Finalize the treatment record.
    Marks treatment as finalized, generates an empathetic AI-summarized clinical solution in patient's preferred language,
    constructs an automated WhatsApp SMS message containing direct case & medicine ordering links,
    and dispatches a notification record.
    """
    case = _find_case(case_id, db)
    treatment = (
        db.query(TreatmentRecord)
        .filter(TreatmentRecord.case_id == case.id)
        .first()
    )
    if not treatment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot finalize empty treatment record",
        )

    treatment.is_finalized = True
    case.status = "response_submitted"

    # 1. Prepare clinical medicine orders for summary
    meds_list = []
    for it in treatment.items:
        meds_list.append(
            f"- {it.medicine_name} ({it.strength or it.dosage or ''}): {it.frequency or ''}, {it.duration or ''}. {it.instructions or ''}"
        )
    meds_text = "\n".join(meds_list) if meds_list else "Standard supportive care"

    lang = case.preferred_language or "or"
    lang_label = "Odia" if lang in ("or", "odia") else ("Hindi" if lang in ("hi", "hindi") else "English")

    # 2. Generate Empathetic AI Clinical Summary
    ai_summary = ""
    api_key = (settings.SARVAM_API_KEY or "").strip()
    ai_prompt = (
        f"You are Jan Saathi AI, an empathetic rural healthcare clinical specialist in Odisha, India.\n"
        f"The treating physician has finalized the official medical prescription for patient [PATIENT_{case.patient_age}_{case.patient_gender}]:\n"
        f"Patient Profile: Age: {case.patient_age}, Gender: {case.patient_gender}\n"
        f"Chief Complaint: {case.chief_complaint}\n"
        f"Doctor's Diagnosis: {treatment.assessment or 'Assessment complete'}\n"
        f"Doctor's Guidance: {treatment.follow_up_instructions or treatment.next_steps or 'Take medicines as prescribed'}\n"
        f"Precautions & Warnings: {treatment.warnings or 'None'}\n"
        f"Prescribed Medications:\n{meds_text}\n\n"
        f"Task:\n"
        f"Formulate a warm, clear, 2-3 sentence clinical resolution summary in natural {lang_label} script for the patient.\n"
        f"Reassure the patient, explain their condition in simple words without scary jargon, and explain clearly how to take their medicines and rest.\n"
        f"Output strictly the plain summary paragraph with no quotes, greetings, or markdown headers."
    )

    if api_key:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(
                    "https://api.sarvam.ai/v1/chat/completions",
                    headers={"api-subscription-key": api_key, "Content-Type": "application/json"},
                    json={
                        "model": "sarvam-m",
                        "messages": [{"role": "user", "content": ai_prompt}],
                        "temperature": 0.2,
                        "max_tokens": 250,
                    },
                )
                if res.status_code == 200:
                    ai_summary = res.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.warning("Sarvam AI treatment summary generation error: %s", e)

    if not ai_summary:
        if lang in ("or", "odia"):
            ai_summary = f"ଡାକ୍ତର ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ଯାଞ୍ଚ କରିଛନ୍ତି। ଆପଣଙ୍କୁ {treatment.assessment or 'ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା'} ଅନୁଯାୟୀ ଔଷଧ ଏବଂ ପରାମର୍ଶ ଦିଆଯାଇଛି। ଦୟାକରି ସମୟ ମୁତାବକ ଔଷଧ ସେବନ କରନ୍ତୁ, ପ୍ରଚୁର ପାଣି ପିଅନ୍ତୁ ଏବଂ ପର୍ଯ୍ୟାପ୍ତ ବିଶ୍ରାମ ନିଅନ୍ତୁ।"
        elif lang in ("hi", "hindi"):
            ai_summary = f"डॉक्टर ने आपके स्वास्थ्य की जांच कर ली है। आपके लिए {treatment.assessment or 'स्वास्थ्य समस्या'} के अनुसार दवाएं और परामर्श दिया गया है। कृपया समय पर दवाएं लें, पर्याप्त पानी पिएं और आराम करें।"
        else:
            ai_summary = f"The physician has evaluated your health condition ({treatment.assessment or 'clinical condition'}) and prescribed the necessary medications. Please follow the dosage schedule strictly, stay well hydrated, and rest."

    # 3. Generate Tamper-Proof 1-Click WhatsApp Access Links
    whatsapp_token = generate_case_whatsapp_token(case.public_case_id)
    case_url = f"http://localhost:5173/patient/case/{case.public_case_id}?token={whatsapp_token}"
    order_url = f"http://localhost:5173/patient/orders/{case.public_case_id}?token={whatsapp_token}"
    whatsapp_bot_url = f"http://localhost:5173/patient/whatsapp/{case.public_case_id}?token={whatsapp_token}"

    # 4. Construct Trilingual Structured WhatsApp SMS Message
    if lang in ("or", "odia"):
        meds_lines = "\n".join([f"• {it.medicine_name} - {it.dosage or it.strength or ''} ({it.frequency or ''})" for it in treatment.items]) or "• ଡାକ୍ତରଙ୍କ ପରାମର୍ଶ ମୁତାବକ ଔଷଧ"
        whatsapp_message = (
            f"🏥 *ଜନସାଥୀ ଏଆଇ ସ୍ୱାସ୍ଥ୍ୟ ସେବା (Jan Saathi AI)*\n"
            f"----------------------------------------\n"
            f"ନମସ୍କାର *{case.patient_name}* ଆଜ୍ଞା,\n"
            f"ଡାକ୍ତର ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ଯାଞ୍ଚ କରି ଚିକିତ୍ସା ପରାମର୍ଶ ଓ ପ୍ରେସକ୍ରିପସନ୍ ପ୍ରଦାନ କରିଛନ୍ତି।\n\n"
            f"📋 *କେସ୍ ନମ୍ବର (Case ID):* {case.public_case_id}\n"
            f"👨‍⚕️ *ଡାକ୍ତରୀ ନିର୍ଣ୍ଣୟ (Diagnosis):* {treatment.assessment or 'ପରାମର୍ଶ ଉପଲବ୍ଧ'}\n\n"
            f"✨ *ଏଆଇ ସମାଧାନ ସାରାଂଶ (AI Solution Summary):*\n"
            f"{ai_summary}\n\n"
            f"💊 *ପ୍ରଦାନ କରାଯାଇଥିବା ଔଷଧ (Medicines):*\n"
            f"{meds_lines}\n\n"
            f"🔗 *ପ୍ରେସକ୍ରିପସନ୍ ଦେଖନ୍ତୁ (View Prescription):*\n"
            f"{case_url}\n\n"
            f"🛒 *ରିହାତି ଦରରେ ଔଷଧ ଅର୍ଡର କରନ୍ତୁ (Order Medicines Online):*\n"
            f"{order_url}\n\n"
            f"💬 *ପ୍ରଶ୍ନ ବା ସନ୍ଦେହ ଅଛି କି? (Any Doubts?):*\n"
            f"ଔଷଧ ସମୟ, ଖାଦ୍ୟ ନିୟମ କିମ୍ବା ଅର୍ଡର ସମ୍ବନ୍ଧରେ ଯେକୌଣସି ପ୍ରଶ୍ନ ଏଠାରେ ପଚାରନ୍ତୁ। ଜନସାଥୀ ଏଆଇ ବଟ୍ ତୁରନ୍ତ ଉତ୍ତର ଦେବ।\n"
            f"🤖 *ଲାଇଭ୍ ଏଆଇ ବଟ୍ ସହିତ କଥା ହୁଅନ୍ତୁ:*\n"
            f"{whatsapp_bot_url}\n\n"
            f"ସୁସ୍ଥ ରୁହନ୍ତୁ, ସୁରକ୍ଷିତ ରୁହନ୍ତୁ। ଜରୁରୀକାଳୀନ ସହାୟତା ପାଇଁ ୧୦୮ କୁ ଫୋନ୍ କରନ୍ତୁ।"
        )
    elif lang in ("hi", "hindi"):
        meds_lines = "\n".join([f"• {it.medicine_name} - {it.dosage or it.strength or ''} ({it.frequency or ''})" for it in treatment.items]) or "• डॉक्टर के निर्देशानुसार दवा"
        whatsapp_message = (
            f"🏥 *जन साथी एआई स्वास्थ्य सेवा (Jan Saathi AI)*\n"
            f"----------------------------------------\n"
            f"नमस्ते *{case.patient_name}* जी,\n"
            f"डॉक्टर ने आपके स्वास्थ्य की जांच कर परामर्श एवं प्रिस्क्रिप्शन तैयार कर दिया है।\n\n"
            f"📋 *केस संख्या (Case ID):* {case.public_case_id}\n"
            f"👨‍⚕️ *डॉक्टर का निदान (Diagnosis):* {treatment.assessment or 'परामर्श उपलब्ध'}\n\n"
            f"✨ *एआई संक्षिप्त समाधान (AI Solution Summary):*\n"
            f"{ai_summary}\n\n"
            f"💊 *निर्धारित दवाइयां (Medicines):*\n"
            f"{meds_lines}\n\n"
            f"🔗 *प्रिस्क्रिप्शन देखें (View Prescription):*\n"
            f"{case_url}\n\n"
            f"🛒 *सस्ती जन औषधि दवाएं ऑर्डर करें (Order Medicines):*\n"
            f"{order_url}\n\n"
            f"💬 *कोई प्रश्न या संदेह है? (Any Questions?):*\n"
            f"दवा का समय, भोजन नियम या डिलीवरी के बारे में कुछ भी पूछें। जन साथी एआई बॉट तुरंत उत्तर देगा।\n"
            f"🤖 *लाइव एआई बॉट से बात करें:*\n"
            f"{whatsapp_bot_url}\n\n"
            f"स्वस्थ रहें, सुरक्षित रहें। आपातकालीन स्थिति में 108 पर कॉल करें।"
        )
    else:
        meds_lines = "\n".join([f"• {it.medicine_name} - {it.dosage or it.strength or ''} ({it.frequency or ''})" for it in treatment.items]) or "• Prescribed medicines as directed"
        whatsapp_message = (
            f"🏥 *Jan Saathi AI Health Service*\n"
            f"----------------------------------------\n"
            f"Hello *{case.patient_name}*,\n"
            f"The physician has evaluated your case and signed your clinical prescription.\n\n"
            f"📋 *Case ID:* {case.public_case_id}\n"
            f"👨‍⚕️ *Doctor Diagnosis:* {treatment.assessment or 'Evaluation complete'}\n\n"
            f"✨ *AI Clinical Solution Summary:*\n"
            f"{ai_summary}\n\n"
            f"💊 *Prescribed Medications:*\n"
            f"{meds_lines}\n\n"
            f"🔗 *View Prescription:* {case_url}\n\n"
            f"🛒 *Order Subsidized Jan Aushadhi Medicines Online:*\n"
            f"{order_url}\n\n"
            f"💬 *Any Questions or Doubts? (24/7 AI Bot):*\n"
            f"Reply directly here for instant AI guidance on dosage timings, diet, or delivery.\n"
            f"🤖 *Chat with Live AI Bot:*\n"
            f"{whatsapp_bot_url}\n\n"
            f"Stay healthy and safe. For medical emergencies, please call 108."
        )

    # 5. Build Direct wa.me WhatsApp URL
    recipient_phone = re.sub(r'\D', '', case.patient_contact or '')
    if len(recipient_phone) == 10:
        recipient_phone = f"91{recipient_phone}"
    elif recipient_phone.startswith("0") and len(recipient_phone) == 11:
        recipient_phone = f"91{recipient_phone[1:]}"

    wa_link = (
        f"https://wa.me/{recipient_phone}?text={quote_plus(whatsapp_message)}"
        if recipient_phone
        else f"https://wa.me/?text={quote_plus(whatsapp_message)}"
    )

    # 6. Save Notification Record for System Audit & Dispatch Gateway
    notif = Notification(
        doctor_id=current_doctor.id,
        case_id=case.id,
        notification_type="whatsapp_sms",
        title=f"WhatsApp SMS Dispatched to {case.patient_name} ({case.patient_contact or 'Registered Link'})",
        message=whatsapp_message,
        is_read=False,
    )
    db.add(notif)

    # 7. Update instructions with AI Summary
    if ai_summary and not (treatment.follow_up_instructions and "AI Solution Summary" in treatment.follow_up_instructions):
        treatment.follow_up_instructions = (
            f"✨ [AI Solution Summary]: {ai_summary}\n\n"
            f"{treatment.follow_up_instructions or ''}"
        ).strip()

    audit = AuditLog(
        actor_type="doctor",
        actor_id=current_doctor.id,
        action="finalize_treatment_and_dispatch_whatsapp",
        resource_type="treatment_record",
        resource_id=treatment.id,
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    db.commit()
    db.refresh(treatment)

    # 8. Automated WhatsApp Bot Dispatch
    bot_dispatched = False
    target_phone = recipient_phone or case.patient_contact
    if target_phone:
        try:
            from app.services.whatsapp_service import send_automated_whatsapp
            await send_automated_whatsapp(
                phone_number=target_phone,
                message_text=whatsapp_message,
                case_id=case.id,
                db=db,
            )
            bot_dispatched = True
            logger.info("Automated WhatsApp bot dispatched to %s for case %s", target_phone, case.public_case_id)
        except Exception as exc:
            logger.error("Automated WhatsApp bot dispatch error: %s", exc)

    record_out = TreatmentRecordOut.model_validate(treatment)
    record_out.ai_summary = ai_summary
    record_out.whatsapp_message = whatsapp_message
    record_out.whatsapp_link = wa_link
    record_out.order_url = order_url
    record_out.case_url = case_url
    record_out.recipient_contact = case.patient_contact
    record_out.whatsapp_bot_url = whatsapp_bot_url
    record_out.whatsapp_bot_dispatched = bot_dispatched
    return record_out


# ── Document Download & In-Browser Photo Viewing ───────────────────────────
@router.get("/cases/{case_id}/documents/{doc_id}/download")
@router.get("/cases/{case_id}/documents/{doc_id}/view")
def download_case_document(
    case_id: str,
    doc_id: str,
    token: str | None = Query(None),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> FileResponse:
    """Download or view an uploaded medical document with access validation."""
    raw_token = credentials.credentials if credentials else token
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    token_data = decode_access_token(raw_token)
    doctor = db.query(Doctor).filter(Doctor.id == token_data.doctor_id).first()
    if not doctor or doctor.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Approved doctor access required",
        )

    case = _find_case(case_id, db)
    doc = (
        db.query(CaseDocument)
        .filter(CaseDocument.id == doc_id, CaseDocument.case_id == case.id)
        .first()
    )
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    file_path = settings.UPLOAD_DIR / doc.stored_filename
    if not os.path.isfile(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File content missing on server",
        )

    return FileResponse(
        path=str(file_path),
        filename=doc.original_filename,
        media_type=doc.file_type,
        content_disposition_type="inline",
    )


# ── Measurements & Simulator ────────────────────────────────────────────────
@router.get("/cases/{case_id}/measurements", response_model=list[MeasurementResponse])
def get_measurements(
    case_id: str,
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> list[MeasurementResponse]:
    """Retrieve recorded vital signs for a case."""
    case = _find_case(case_id, db)
    measurements = (
        db.query(Measurement)
        .filter(Measurement.case_id == case.id)
        .order_by(Measurement.recorded_at.desc())
        .all()
    )
    return [MeasurementResponse.model_validate(m) for m in measurements]


@router.post("/cases/{case_id}/measurements", response_model=list[MeasurementResponse])
def record_measurements(
    case_id: str,
    payload: dict[str, Any],
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> list[MeasurementResponse]:
    """
    Record real clinical vital readings (heart rate, SpO2, temp, BP) entered by the clinician.
    """
    case = _find_case(case_id, db)
    now = _utcnow()
    created_measurements: list[Measurement] = []

    readings = []
    if "readings" in payload and isinstance(payload["readings"], list):
        readings = payload["readings"]
    else:
        for k, v in payload.items():
            if v is not None and str(v).strip() != "":
                try:
                    num_val = float(v)
                    unit = "bpm" if "heart" in k or "pulse" in k else "%" if "spo2" in k else "°C" if "temp" in k else "mmHg"
                    readings.append({"measurement_type": k, "value": num_val, "unit": unit})
                except (ValueError, TypeError):
                    pass

    for r in readings:
        m = Measurement(
            case_id=case.id,
            measurement_type=r["measurement_type"],
            value=float(r["value"]),
            unit=r.get("unit", ""),
            signal_quality=r.get("signal_quality", "good"),
            source="clinical_examination",
            device_id=f"DR-{current_doctor.id[:8]}",
            recorded_at=now,
        )
        db.add(m)
        created_measurements.append(m)

    # Re-evaluate triage with new measurements (Can escalate, NEVER auto-downgrade)
    if readings:
        meas_dicts = [{"measurement_type": r["measurement_type"], "value": float(r["value"])} for r in readings]
        new_triage = evaluate_triage(
            chief_complaint=case.chief_complaint,
            severity=case.severity,
            measurements=meas_dicts,
        )
        priority_order = {"normal": 0, "elevated": 1, "urgent": 2, "emergency": 3}
        if priority_order.get(new_triage.priority, 0) > priority_order.get(case.priority, 0):
            case.priority = new_triage.priority
            triage_rec = TriageDecision(
                case_id=case.id,
                priority=new_triage.priority,
                reason=f"Priority escalated via clinical vital readings: {new_triage.reason}",
                triggering_data=new_triage.triggering_data,
                rule_version=new_triage.rule_version,
            )
            db.add(triage_rec)

    db.commit()
    for m in created_measurements:
        db.refresh(m)

    return [MeasurementResponse.model_validate(m) for m in created_measurements]


# ── Full Doctor PDF Report ──────────────────────────────────────────────────
@router.get("/cases/{case_id}/report")
def generate_case_report(
    case_id: str,
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> Response:
    """Generate a comprehensive clinical A4 PDF report."""
    case = _find_case(case_id, db)
    responses = (
        db.query(CaseResponse)
        .filter(CaseResponse.case_id == case.id)
        .order_by(CaseResponse.response_order)
        .all()
    )
    measurements = (
        db.query(Measurement)
        .filter(Measurement.case_id == case.id)
        .order_by(Measurement.recorded_at.desc())
        .all()
    )
    treatment = (
        db.query(TreatmentRecord)
        .filter(TreatmentRecord.case_id == case.id)
        .first()
    )
    treatment_items = (
        db.query(TreatmentItem)
        .filter(TreatmentItem.treatment_id == treatment.id)
        .order_by(TreatmentItem.sort_order)
        .all()
        if treatment
        else []
    )
    notes = (
        db.query(DoctorNote)
        .filter(DoctorNote.case_id == case.id)
        .order_by(DoctorNote.created_at)
        .all()
    )
    triage_decisions = (
        db.query(TriageDecision)
        .filter(TriageDecision.case_id == case.id)
        .order_by(TriageDecision.created_at.desc())
        .all()
    )

    pdf_bytes = generate_full_report_pdf(
        case=case,
        responses=responses,
        measurements=measurements,
        treatment=treatment,
        treatment_items=treatment_items,
        notes=notes,
        triage_decisions=triage_decisions,
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=report-{case.public_case_id}.pdf"
        },
    )


# ── Triage Tier Override (Audited) ──────────────────────────────────────────
@router.post("/cases/{case_id}/override-triage")
def override_triage_priority(
    case_id: str,
    body: TriageOverrideRequest,
    request: Request,
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> dict:
    """Allow an approved clinician to override automated triage priority with an immutable audit entry."""
    case = _find_case(case_id, db)
    old_priority = case.priority
    new_priority = body.priority.strip().lower()
    reason = body.reason.strip()

    case.priority = new_priority
    decision = TriageDecision(
        case_id=case.id,
        priority=new_priority,
        reason=f"Clinician override ({old_priority} -> {new_priority}): {reason}",
        triggering_data=json.dumps({"old_priority": old_priority, "new_priority": new_priority, "doctor_id": current_doctor.id}),
        rule_version="doctor_override_v1",
        reviewed=True,
        reviewer_id=current_doctor.id,
        reviewer_notes=reason,
    )
    db.add(decision)

    audit = AuditLog(
        actor_type="doctor",
        actor_id=current_doctor.id,
        action="triage_tier_override",
        resource_type="patient_case",
        resource_id=case.id,
        details=json.dumps({
            "public_case_id": case.public_case_id,
            "old_priority": old_priority,
            "new_priority": new_priority,
            "reason": reason,
        }),
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    db.commit()
    db.refresh(decision)

    return {
        "status": "ok",
        "old_priority": old_priority,
        "new_priority": new_priority,
        "triage_decision": TriageDecisionResponse.model_validate(decision),
    }


# ── 1-Click Inter-Facility Referral Slip PDF (108 Ambulance / DHH) ──────────
@router.get("/cases/{case_id}/referral-pdf")
def generate_case_referral_pdf(
    case_id: str,
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> Response:
    """Generate a 108 Ambulance / DHH / Medical College inter-facility referral slip PDF."""
    case = _find_case(case_id, db)
    measurements = (
        db.query(Measurement)
        .filter(Measurement.case_id == case.id)
        .order_by(Measurement.recorded_at.desc())
        .all()
    )
    documents = (
        db.query(CaseDocument)
        .filter(CaseDocument.case_id == case.id)
        .order_by(CaseDocument.uploaded_at.desc())
        .all()
    )
    notes = (
        db.query(DoctorNote)
        .filter(DoctorNote.case_id == case.id)
        .order_by(DoctorNote.created_at.desc())
        .all()
    )
    triage_decisions = (
        db.query(TriageDecision)
        .filter(TriageDecision.case_id == case.id)
        .order_by(TriageDecision.created_at.desc())
        .all()
    )

    pdf_bytes = generate_referral_pdf(
        case=case,
        measurements=measurements,
        documents=documents,
        notes=notes,
        triage_decisions=triage_decisions,
        doctor=current_doctor,
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=referral-{case.public_case_id}.pdf"
        },
    )


# ── Notifications ───────────────────────────────────────────────────────────
@router.get("/notifications/unread-count")
def get_unread_notification_count(
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    """Return count of unread notifications and active emergencies for real-time badge alerts."""
    unread = (
        db.query(Notification)
        .filter(Notification.doctor_id == current_doctor.id, Notification.is_read.is_(False))
        .count()
    )
    emergencies = db.query(PatientCase).filter(
        PatientCase.priority == "emergency",
        PatientCase.status.in_(["submitted", "under_review"]),
    ).count()
    return {"unread": unread, "emergencies": emergencies}


@router.get("/notifications", response_model=list[NotificationResponse])
def get_notifications(
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> list[NotificationResponse]:
    """Retrieve notifications and priority alerts for the authenticated doctor."""
    notifications = (
        db.query(Notification)
        .filter(Notification.doctor_id == current_doctor.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return [NotificationResponse.model_validate(n) for n in notifications]


@router.patch("/notifications/{notification_id}/acknowledge", response_model=NotificationResponse)
@router.post("/notifications/{notification_id}/acknowledge", response_model=NotificationResponse)
def acknowledge_notification(
    notification_id: str,
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> NotificationResponse:
    """Acknowledge a priority alert."""
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.doctor_id == current_doctor.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    notification.is_read = True
    notification.acknowledged_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(notification)
    return NotificationResponse.model_validate(notification)


# ── Profile ─────────────────────────────────────────────────────────────────
@router.get("/profile", response_model=DoctorResponse)
def get_profile(
    current_doctor: Doctor = Depends(require_approved_doctor),
) -> DoctorResponse:
    return DoctorResponse.model_validate(current_doctor)


@router.patch("/profile", response_model=DoctorResponse)
def update_profile(
    payload: DoctorProfile,
    current_doctor: Doctor = Depends(require_approved_doctor),
    db: Session = Depends(get_db),
) -> DoctorResponse:
    """Update profile details."""
    if payload.full_name is not None:
        current_doctor.full_name = payload.full_name
    if payload.phone is not None:
        current_doctor.phone = payload.phone
    if payload.registration_number is not None:
        current_doctor.registration_number = payload.registration_number
    if payload.issuing_authority is not None:
        current_doctor.issuing_authority = payload.issuing_authority

    db.commit()
    db.refresh(current_doctor)
    return DoctorResponse.model_validate(current_doctor)
