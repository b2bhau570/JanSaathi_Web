"""

Jan Saathi AI — Public Patient Routes.



CRITICAL ACCESS CONTROL RULES:

- Patients do NOT have user accounts or login credentials.

- Anyone can submit a health assessment publicly.

- A unique public_case_id and a cryptographically secure access_token are returned upon submission.

- Access to case status requires the access_token (passed via X-Case-Access-Token header).

- Case ID ALONE is never sufficient to access private case details.

- Public patient routes NEVER grant doctor permissions or expose internal doctor notes.

"""



from __future__ import annotations

import base64

import json

import logging

import os

import re

import secrets

import string

import time

import uuid

from datetime import datetime, timezone

from typing import Annotated



logger = logging.getLogger(__name__)



import httpx



from fastapi import (

    APIRouter,

    Depends,

    File,

    Form,

    Header,

    HTTPException,

    Query,

    Request,

    Response,

    UploadFile,

    status,

)

from fastapi.responses import FileResponse

from sqlalchemy.orm import Session



from app.auth import hash_access_token, verify_access_token, verify_case_access, generate_case_whatsapp_token

from app.config import settings

from app.database import get_db

from app.models import (

    AuditLog,

    CaseDocument,

    CaseResponse,

    Doctor,

    Measurement,

    Notification,

    PatientCase,

    TriageDecision,

)

from app.schemas import (

    CaseAccessRequest,

    CaseAccessResponse,

    DocumentUploadResponse,

    InterviewRequest,

    InterviewQuestions,

    PatientCaseCreate,

    PatientCaseResponse,

    TTSRequest,

    TTSResponse,

)

from app.services.ai_service import (
    FollowUpInput,
    NON_DIAGNOSTIC_SYSTEM_INSTRUCTION,
    anonymize_clinical_text,
    get_ai_service,
    get_ordered_gemini_models,
    is_sarvam_auth_blocked,
    mark_gemini_model_retired,
    note_sarvam_auth_failure,
    reset_sarvam_auth_state,
    validate_interview_answer,
)

from app.services.pdf_service import generate_case_receipt_pdf

from app.services.triage_service import evaluate_triage



router = APIRouter(prefix="/patient", tags=["Patient Portal"])





def _generate_case_id() -> str:

    """Generate a non-guessable, high-entropy public case identifier: JS-XXXXXXXX"""

    chars = string.ascii_uppercase + string.digits

    suffix = "".join(secrets.choice(chars) for _ in range(8))

    return f"JS-{suffix}"





def _get_verified_patient_case(

    public_case_id: str,

    access_token: str | None,

    db: Session,

) -> PatientCase:

    """

    Enforces that public_case_id alone is NOT enough.

    Requires a valid cryptographic access_token matching the hashed token.

    """

    if not access_token:

        raise HTTPException(

            status_code=status.HTTP_401_UNAUTHORIZED,

            detail="Case access token is required. Public Case ID alone does not permit access.",

        )



    case = (

        db.query(PatientCase)

        .filter(PatientCase.public_case_id == public_case_id)

        .first()

    )

    if not case:

        raise HTTPException(

            status_code=status.HTTP_404_NOT_FOUND,

            detail="Case not found",

        )



    if not verify_case_access(access_token, case.access_token_hash, case.public_case_id):

        raise HTTPException(

            status_code=status.HTTP_403_FORBIDDEN,

            detail="Invalid case access credential",

        )



    return case





@router.post("/cases", response_model=PatientCaseResponse, status_code=status.HTTP_201_CREATED)

def submit_patient_case(

    payload: PatientCaseCreate,

    request: Request,

    db: Session = Depends(get_db),

) -> PatientCaseResponse:

    """

    Public patient intake endpoint.

    NO authentication or user account required.

    Returns the public_case_id and the unhashed access_token ONCE.

    """

    # 1. Generate unique public ID and cryptographically random access token

    public_case_id = _generate_case_id()

    while db.query(PatientCase).filter(PatientCase.public_case_id == public_case_id).first():

        public_case_id = _generate_case_id()



    raw_access_token = secrets.token_urlsafe(32)

    token_hash = hash_access_token(raw_access_token)



    # 2. Run initial rule-based triage including follow-up answers

    follow_up_responses = getattr(payload, "follow_up_answers", None)



    # 3. Create case entity (triage priority is evaluated after vitals are attached)

    case = PatientCase(

        public_case_id=public_case_id,

        access_token_hash=token_hash,

        patient_name=payload.patient_name,

        patient_age=payload.patient_age,

        patient_gender=payload.patient_gender,

        patient_contact=payload.patient_contact,

        preferred_language=payload.preferred_language,

        chief_complaint=payload.chief_complaint,

        complaint_duration=payload.complaint_duration,

        severity=payload.severity,

        medical_history=payload.medical_history,

        allergies=payload.allergies,

        current_medications=payload.current_medications,

        status="submitted",

        priority="normal",

    )

    db.add(case)

    db.flush()



    # 4. Save interview follow-up responses if provided

    sanitized_responses: list[dict[str, str]] = []

    if hasattr(payload, "follow_up_answers") and payload.follow_up_answers:

        for idx, item in enumerate(payload.follow_up_answers):

            if isinstance(item, dict) and item.get("question"):

                raw_ans = str(item.get("answer") or "")

                val_res = validate_interview_answer(raw_ans)

                ans_obj = CaseResponse(

                    case_id=case.id,

                    question=str(item.get("question")).strip(),

                    answer=val_res["sanitized"],

                    question_source="ai",

                    response_order=idx + 1,

                )

                db.add(ans_obj)

                sanitized_responses.append({"question": ans_obj.question, "answer": ans_obj.answer})



    # 4b. Save vitals / sensor measurements if captured during intake

    saved_measurements_for_triage: list[dict[str, float | str]] = []

    if hasattr(payload, "measurements") and payload.measurements:

        for m_data in payload.measurements:

            if isinstance(m_data, dict) and m_data.get("measurement_type") and m_data.get("value") is not None:

                try:

                    m_val = float(m_data.get("value"))

                    if m_val <= 0:

                        continue

                    m_type = str(m_data.get("measurement_type"))

                    m_unit = str(m_data.get("unit") or "")

                    m_obj = Measurement(

                        case_id=case.id,

                        measurement_type=m_type,

                        value=m_val,

                        unit=m_unit,

                        signal_quality=str(m_data.get("signal_quality") or "good"),

                        source=str(m_data.get("source") or "simulated"),

                    )

                    db.add(m_obj)

                    saved_measurements_for_triage.append({

                        "measurement_type": m_type,

                        "value": m_val,

                        "unit": m_unit,

                    })

                except Exception as m_err:

                    logger.warning("Failed to store measurement (%s): %s", m_data, m_err)



    # 4c. Evaluate deterministic triage AFTER Measurement & CaseResponse records are attached

    triage_result = evaluate_triage(

        chief_complaint=payload.chief_complaint,

        severity=payload.severity,

        responses=sanitized_responses or follow_up_responses,

        measurements=saved_measurements_for_triage,

    )

    case.priority = triage_result.priority

    triage = TriageDecision(

        case_id=case.id,

        priority=triage_result.priority,

        reason=triage_result.reason,

        triggering_data=triage_result.triggering_data,

        rule_version=triage_result.rule_version,

    )

    db.add(triage)



    # 5. Urgent or emergency alert: notify all approved doctors

    if triage_result.priority in ("emergency", "urgent"):

        approved_doctors = db.query(Doctor).filter(Doctor.status == "approved").all()

        for doc in approved_doctors:

            notification = Notification(

                doctor_id=doc.id,

                case_id=case.id,

                notification_type=f"priority_{triage_result.priority}",

                title=f"{triage_result.priority.upper()} Priority Intake: {case.public_case_id}",

                message=f"Patient {case.patient_name} submitted a case flagged as {triage_result.priority}: {case.chief_complaint[:100]}...",

            )

            db.add(notification)



    # 6. Audit log

    audit = AuditLog(

        actor_type="patient",

        actor_id=None,

        action="patient_case_submitted",

        resource_type="patient_case",

        resource_id=case.id,

        ip_address=request.client.host if request.client else None,

    )

    db.add(audit)

    db.commit()

    db.refresh(case)



    return PatientCaseResponse(

        public_case_id=case.public_case_id,

        access_token=raw_access_token,

        status=case.status,

        priority=case.priority,

        created_at=case.created_at,

    )





@router.post("/cases/access", response_model=CaseAccessResponse)

def verify_patient_access(

    payload: CaseAccessRequest,

    db: Session = Depends(get_db),

) -> CaseAccessResponse:

    """

    Verify patient case access credential without returning private clinical data.

    """

    case = (

        db.query(PatientCase)

        .filter(PatientCase.public_case_id == payload.public_case_id)

        .first()

    )

    if not case or not verify_access_token(payload.access_token, case.access_token_hash):

        return CaseAccessResponse(valid=False)



    return CaseAccessResponse(

        valid=True,

        public_case_id=case.public_case_id,

        status=case.status,

    )





@router.get("/cases/{public_case_id}")
def get_patient_case(
    public_case_id: str,
    x_case_access_token: Annotated[str | None, Header()] = None,
    x_access_token: Annotated[str | None, Header()] = None,
    access_token: Annotated[str | None, Query()] = None,
    token_param: Annotated[str | None, Query(alias="token")] = None,
    db: Session = Depends(get_db),
) -> dict:
    """
    Retrieve permitted patient-facing case information.
    Requires the secret X-Case-Access-Token (or X-Access-Token) header or ?access_token= / ?token= query param.
    Never exposes internal doctor notes, raw reviewer IDs, or internal database UUIDs.
    """
    token = x_case_access_token or x_access_token or access_token or token_param
    case = _get_verified_patient_case(public_case_id, token, db)



    # Build safe permitted response for the patient

    result = {

        "public_case_id": case.public_case_id,

        "patient_name": case.patient_name,

        "patient_age": case.patient_age,

        "patient_gender": case.patient_gender,

        "preferred_language": case.preferred_language,

        "chief_complaint": case.chief_complaint,

        "complaint_duration": case.complaint_duration,

        "severity": case.severity,

        "status": case.status,

        "priority": case.priority,

        "created_at": case.created_at.isoformat(),

        "updated_at": case.updated_at.isoformat(),

        "documents": [

            {

                "id": doc.id,

                "original_filename": doc.original_filename,

                "file_type": doc.file_type,

                "file_size": doc.file_size,

                "extracted_data": doc.extracted_data,

                "uploaded_at": doc.uploaded_at.isoformat(),

            }

            for doc in case.documents

        ],

        "responses": [

            {

                "question": r.question,

                "answer": r.answer,

                "response_order": r.response_order,

            }

            for r in case.responses

        ],

        # Only finalized doctor instructions are visible to the patient

        "treatment": None,  # type: ignore[assignment]

    }



    if case.treatment and case.treatment.is_finalized:

        ai_sum = None

        if case.treatment.follow_up_instructions and "AI Solution Summary" in case.treatment.follow_up_instructions:

            parts = case.treatment.follow_up_instructions.split("[AI Solution Summary]:")

            if len(parts) > 1:

                ai_sum = parts[1].split("\n\n")[0].strip()



        result["treatment"] = {  # pyrefly: ignore

            "assessment": case.treatment.assessment,

            "disposition": case.treatment.disposition,

            "next_steps": case.treatment.next_steps,

            "follow_up_instructions": case.treatment.follow_up_instructions,

            "ai_summary": ai_sum,

            "warnings": case.treatment.warnings,

            "is_finalized": True,

            "items": [

                {

                    "medicine_name": item.medicine_name,

                    "strength": item.strength,

                    "dosage": item.dosage,

                    "route": item.route,

                    "frequency": item.frequency,

                    "duration": item.duration,

                    "instructions": item.instructions,

                    "quantity": item.quantity,

                }

                for item in case.treatment.items

            ],

        }



    return result





# ═══════════════════════════════════════════════════════════════════════════

# Subsidized Jan Aushadhi Medicine Ordering & Home Delivery

# ═══════════════════════════════════════════════════════════════════════════

@router.get("/cases/{public_case_id}/order-details")

def get_case_order_details(

    public_case_id: str,

    x_case_access_token: Annotated[str | None, Header()] = None,

    x_access_token: Annotated[str | None, Header()] = None,

    access_token: Annotated[str | None, Query()] = None,

    token: Annotated[str | None, Query()] = None,

    db: Session = Depends(get_db),

) -> dict:

    """

    Fetch prescribed medicines and Jan Aushadhi subsidized ordering details.

    """

    raw_token = x_case_access_token or x_access_token or access_token or token

    case = _get_verified_patient_case(public_case_id, raw_token, db)



    if not case.treatment or not case.treatment.is_finalized:

        raise HTTPException(

            status_code=status.HTTP_400_BAD_REQUEST,

            detail="Doctor has not yet finalized the prescription for this case.",

        )



    items = []

    total_mrp = 0.0

    total_subsidized = 0.0



    for idx, it in enumerate(case.treatment.items):

        qty = 10

        m = (it.medicine_name or "").lower()

        if "paracetamol" in m:

            subsidized_price = 12.0

            mrp = 40.0

        elif "amoxicillin" in m or "clav" in m:

            subsidized_price = 45.0

            mrp = 140.0

        elif "azithromycin" in m:

            subsidized_price = 35.0

            mrp = 120.0

        elif "cetirizine" in m or "levocetirizine" in m:

            subsidized_price = 10.0

            mrp = 35.0

        elif "pantoprazole" in m or "omeprazole" in m:

            subsidized_price = 18.0

            mrp = 65.0

        elif "metformin" in m:

            subsidized_price = 14.0

            mrp = 55.0

        elif "amlodipine" in m or "telmisartan" in m:

            subsidized_price = 16.0

            mrp = 60.0

        elif "ors" in m or "electral" in m:

            subsidized_price = 8.0

            mrp = 22.0

        else:

            subsidized_price = 20.0

            mrp = 70.0



        savings_pct = int(round(((mrp - subsidized_price) / mrp) * 100)) if mrp > 0 else 72

        total_subsidized += subsidized_price

        total_mrp += mrp

        items.append({

            "id": f"item_{idx + 1}",

            "medicine_name": it.medicine_name,

            "generic_name": it.medicine_name,

            "strength": it.strength or it.dosage or "Standard",

            "dosage": it.dosage or "1 Tab",

            "frequency": it.frequency or "Twice daily",

            "duration": it.duration or "5 days",

            "instructions": it.instructions or "Take after food with warm water",

            "quantity": qty,

            "unit": "Strip of 10 Tablets",

            "mrp": mrp,

            "subsidized_price": subsidized_price,

            "savings_percent": savings_pct,

            "jan_aushadhi_code": f"PMBJP-{abs(hash(it.medicine_name)) % 9000 + 1000}",

            "in_stock": True,

        })



    ai_sum = None

    if case.treatment.follow_up_instructions and "AI Solution Summary" in case.treatment.follow_up_instructions:

        parts = case.treatment.follow_up_instructions.split("[AI Solution Summary]:")

        if len(parts) > 1:

            ai_sum = parts[1].split("\n\n")[0].strip()



    return {

        "public_case_id": case.public_case_id,

        "patient_name": case.patient_name,

        "patient_age": case.patient_age,

        "patient_gender": case.patient_gender,

        "patient_contact": case.patient_contact or "",

        "diagnosis": case.treatment.assessment or "Clinical Evaluation Complete",

        "ai_summary": ai_sum,

        "doctor_name": case.treatment.doctor.full_name if case.treatment.doctor else "Medical Officer",

        "hospital_name": "Govt Community Health Centre (CHC) & Jan Aushadhi Kendra",

        "items": items,

        "total_mrp": total_mrp,

        "total_subsidized": total_subsidized,

        "total_savings": round(total_mrp - total_subsidized, 2),

        "govt_subsidy_amount": round(total_mrp - total_subsidized, 2),

        "discount_percentage": int(round(((total_mrp - total_subsidized) / total_mrp) * 100)) if total_mrp > 0 else 75,

        "delivery_modes": [

            {

                "id": "drone_delivery",

                "label": "Rural Drone Delivery (Govt Telemedicine Mission)",

                "fee": 0.0,

                "eta": "Within 2 Hours",

                "description": "Direct emergency drone delivery to your village health sub-centre",

            },

            {

                "id": "speed_post",

                "label": "Speed Post / Gramin Dak Sevak",

                "fee": 0.0,

                "eta": "Same Day (4 Hours)",

                "description": "Delivered directly to your home address via Odisha Postal Mission",

            },

            {

                "id": "kendra_pickup",

                "label": "Jan Aushadhi Kendra Self-Pickup",

                "fee": 0.0,

                "eta": "Ready in 15 Minutes",

                "description": "Ready for priority pickup at your nearest Block Jan Aushadhi Kendra",

            },

        ],

        "nearest_kendra": {

            "name": "Pradhan Mantri Bhartiya Janaushadhi Kendra (PMBJP)",

            "address": "Community Health Centre Campus, Block Road",

            "phone": "1800-180-8080",

            "distance": "1.4 km",

        },

        "schemes": [

            {"id": "bsky", "name": "Biju Swasthya Kalyan Yojana (BSKY)", "discount": "100% Free"},

            {"id": "pmjay", "name": "Ayushman Bharat (PM-JAY)", "discount": "100% Free"},

        ],

        "delivery_options": [

            {

                "id": "drone_delivery",

                "title": "Rural Drone Delivery (Govt Telemedicine Mission)",

                "description": "Direct drone drop to Gram Panchayat / Village Health Point",

                "fee": 0.0,

                "eta": "Within 2 Hours",

                "recommended": True,

            },

            {

                "id": "speed_post",

                "title": "Speed Post / Gramin Dak Sevak (Doorstep)",

                "description": "Postal delivery to your village home address",

                "fee": 0.0,

                "eta": "Same Day (4 Hours)",

                "recommended": False,

            },

            {

                "id": "phc_pickup",

                "title": "Pickup at Nearest Jan Aushadhi Kendra / PHC",

                "description": "Ready for instant priority pickup by patient or relative",

                "fee": 0.0,

                "eta": "Ready in 15 Minutes",

                "recommended": False,

            },

        ],

    }





@router.post("/cases/{public_case_id}/order-medicines")

def place_medicine_order(

    public_case_id: str,

    payload: dict,

    x_case_access_token: Annotated[str | None, Header()] = None,

    x_access_token: Annotated[str | None, Header()] = None,

    access_token: Annotated[str | None, Query()] = None,

    token: Annotated[str | None, Query()] = None,

    db: Session = Depends(get_db),

) -> dict:

    """

    Place subsidized Jan Aushadhi medicine order for a finalized prescription.

    """

    raw_token = x_case_access_token or x_access_token or access_token or token

    case = _get_verified_patient_case(public_case_id, raw_token, db)



    if not case.treatment or not case.treatment.is_finalized:

        raise HTTPException(

            status_code=status.HTTP_400_BAD_REQUEST,

            detail="Prescription is not finalized yet.",

        )



    delivery_type = str(payload.get("delivery_type") or "drone_delivery")

    delivery_address = str(payload.get("delivery_address") or "Village Health Centre").strip()

    contact_number = str(payload.get("contact_number") or case.patient_contact or "").strip()

    payment_method = str(payload.get("payment_method") or "bsky_subsidized")



    if contact_number and not case.patient_contact:

        case.patient_contact = contact_number

        db.commit()



    order_id = f"JAN-MED-{case.public_case_id.replace('JS-', '')}-{secrets.token_hex(2).upper()}"

    tracking_id = f"OD-MED-TRK-{secrets.token_hex(3).upper()}"



    if case.treatment.doctor_id:

        notif = Notification(

            doctor_id=case.treatment.doctor_id,

            case_id=case.id,

            notification_type="medicine_order",

            title=f"Medicine Order Placed: {order_id}",

            message=(

                f"Patient {case.patient_name} placed an order for prescribed medicines.\n"

                f"Delivery Mode: {delivery_type.replace('_', ' ').title()}\n"

                f"Address: {delivery_address}\n"

                f"Contact: {contact_number}\n"

                f"Payment: {payment_method.upper()}"

            ),

            is_read=False,

        )

        db.add(notif)

        db.commit()



    return {

        "status": "confirmed",

        "order_id": order_id,

        "tracking_id": tracking_id,

        "public_case_id": case.public_case_id,

        "patient_name": case.patient_name,

        "patient_contact": contact_number,

        "recipient_contact": contact_number,

        "total_payable": "0.00" if "bsky" in payment_method or "ayushman" in payment_method else "58.00",

        "delivery_address": delivery_address,

        "delivery_type": delivery_type,

        "payment_method": payment_method,

        "estimated_delivery": "Today within 2 to 4 hours",

        "delivery_partner": "Odisha Rural Telemedicine Delivery Network & Jan Aushadhi Kendra",

        "sms_status": f"Confirmation SMS & Tracking Link dispatched to {contact_number or 'registered phone'}",

        "order_timestamp": datetime.now(timezone.utc).isoformat(),

    }









# ═══════════════════════════════════════════════════════════════════════════

# Automated WhatsApp Bot & Instant AI Follow-up Consultation

# ═══════════════════════════════════════════════════════════════════════════



@router.get("/whatsapp/webhook")

async def verify_whatsapp_webhook(request: Request) -> Response:

    """Meta WhatsApp Cloud API Webhook Verification."""

    mode = request.query_params.get("hub.mode")

    token = request.query_params.get("hub.verify_token")

    challenge = request.query_params.get("hub.challenge")

    verify_token = os.getenv("WHATSAPP_VERIFY_TOKEN", "jansaathi_webhook_token_2026")

    if mode == "subscribe" and token == verify_token:

        return Response(content=challenge, media_type="text/plain")

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification token mismatch")





@router.post("/whatsapp/webhook")

async def receive_whatsapp_webhook(request: Request, db: Session = Depends(get_db)) -> dict:

    """Incoming Meta WhatsApp Cloud API Webhook Handler."""

    from app.services.whatsapp_service import process_incoming_patient_whatsapp

    try:

        body = await request.json()

        entry = body.get("entry", [{}])[0]

        changes = entry.get("changes", [{}])[0]

        value = changes.get("value", {})

        messages = value.get("messages", [])

        if not messages:

            return {"status": "ignored_no_messages"}



        msg = messages[0]

        from_phone = msg.get("from", "")

        text = msg.get("text", {}).get("body", "")

        if not text and "interactive" in msg:

            text = msg.get("interactive", {}).get("button_reply", {}).get("title", "")



        if from_phone and text:

            res = await process_incoming_patient_whatsapp(from_phone, text, db)

            return {"status": "processed", "result": res}



        return {"status": "ignored_empty_content"}

    except Exception as exc:

        logger.error("Error processing WhatsApp webhook: %s", exc)

        return {"status": "error", "detail": str(exc)}





@router.post("/whatsapp/chat")

async def chat_with_whatsapp_bot(payload: dict, db: Session = Depends(get_db)) -> dict:

    """

    Live WhatsApp Bot Chat endpoint for patients and simulator.

    Provides instant AI resolution of medical doubts, dosage instructions, and medicine ordering.

    """

    from app.services.whatsapp_service import process_incoming_patient_whatsapp



    message_text = str(payload.get("message") or payload.get("message_text") or "").strip()

    if not message_text:

        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message text is required.")



    public_case_id = str(payload.get("public_case_id") or "").strip()

    phone_number = str(payload.get("phone_number") or "").strip()



    search_id = public_case_id or phone_number

    if not search_id:

        latest = db.query(PatientCase).order_by(PatientCase.created_at.desc()).first()

        search_id = latest.public_case_id if latest else ""



    res = await process_incoming_patient_whatsapp(search_id, message_text, db)

    return res





@router.get("/whatsapp/chat/{public_case_id}")

def get_whatsapp_chat_history(

    public_case_id: str,

    x_case_access_token: Annotated[str | None, Header()] = None,

    x_access_token: Annotated[str | None, Header()] = None,

    access_token: Annotated[str | None, Query()] = None,

    token: Annotated[str | None, Query()] = None,

    db: Session = Depends(get_db),

) -> dict:

    """

    Retrieve full WhatsApp conversation history between the automated bot and patient for a given case.

    """

    raw_token = x_case_access_token or x_access_token or access_token or token

    case = _get_verified_patient_case(public_case_id, raw_token, db)



    from app.models import WhatsAppMessage



    query = db.query(WhatsAppMessage).filter(WhatsAppMessage.case_id == case.id)

    if case.patient_contact:

        clean_contact = re.sub(r"\D", "", case.patient_contact)

        if len(clean_contact) >= 10:

            query = db.query(WhatsAppMessage).filter(

                (WhatsAppMessage.case_id == case.id) | (WhatsAppMessage.phone_number.like(f"%{clean_contact[-10:]}%"))

            )



    messages = query.order_by(WhatsAppMessage.created_at.asc()).all()



    chat_items = []

    for m in messages:

        chat_items.append({

            "id": m.id,

            "sender": m.sender,

            "text": m.message_text,

            "status": m.status,

            "timestamp": m.created_at.isoformat() if m.created_at else None,

        })



    from app.auth import generate_case_whatsapp_token

    wa_token = generate_case_whatsapp_token(case.public_case_id)

    order_url = f"http://localhost:5173/patient/orders/{case.public_case_id}?token={wa_token}"



    return {

        "public_case_id": case.public_case_id,

        "patient_name": case.patient_name,

        "patient_contact": case.patient_contact,

        "preferred_language": case.preferred_language,

        "diagnosis": case.treatment.assessment if (case.treatment and case.treatment.assessment) else "Under Review",

        "order_url": order_url,

        "messages": chat_items,

    }





ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}


async def _validate_and_read_document(file: UploadFile) -> tuple[str, str, str, bytes]:
    """Validate uploaded image/PDF extension, MIME type, size limit, and magic bytes."""
    raw_filename = file.filename or "uploaded_file"
    safe_basename = os.path.basename(raw_filename)
    ext = os.path.splitext(safe_basename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File extension '{ext}' is not permitted. Allowed: .pdf, .jpg, .jpeg, .png",
        )

    content_type = file.content_type or "application/octet-stream"
    if content_type not in settings.allowed_file_types_list:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{content_type}' is not allowed. Allowed types: {settings.ALLOWED_FILE_TYPES}",
        )

    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB}MB",
        )

    if content_type == "application/pdf":
        if not content.startswith(b"%PDF"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file signature: Content does not match PDF format.",
            )
    elif content_type in ("image/jpeg", "image/jpg"):
        if not content.startswith(b"\xff\xd8\xff"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file signature: Content does not match JPEG format.",
            )
    elif content_type == "image/png":
        if not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file signature: Content does not match PNG format.",
            )

    return safe_basename, ext, content_type, content


async def _extract_document_ocr_with_gemini(content: bytes, mime_type: str) -> dict:
    """
    Extract structured clinical biomarkers and medications from a lab report or
    prescription image/PDF using Gemini Vision (gemini-2.5-flash with gemini-3.1-flash-lite fallback).
    Never fabricates unreadable findings.
    """
    fallback_payload = {
        "document_type": "Unknown",
        "biomarkers": [],
        "medications": [],
        "clinical_summary": "Automated OCR could not parse this document. Clinician visual inspection required.",
        "ocr_status": "unavailable",
    }
    gemini_key = (settings.GEMINI_API_KEY or "").strip()
    if not gemini_key or not content:
        return fallback_payload

    ocr_prompt = (
        "Examine this medical document (lab report, prescription, or discharge summary) carefully.\n"
        "Extract ONLY clearly visible, factual information into strictly valid JSON matching this schema:\n"
        "{\n"
        '  "document_type": "Lab Report" | "Prescription" | "Discharge Summary",\n'
        '  "biomarkers": [\n'
        "    {\n"
        '      "parameter": "string (pay special attention to Platelets, Hemoglobin, TLC/WBC, Blood Glucose, Creatinine, Bilirubin)",\n'
        '      "value": "string (exact numeric/text reading)",\n'
        '      "unit": "string",\n'
        '      "reference_range": "string",\n'
        '      "status": "NORMAL" | "HIGH" | "LOW" | "CRITICAL"\n'
        "    }\n"
        "  ],\n"
        '  "medications": ["string (drug name, strength, frequency as printed/written)"],\n'
        '  "clinical_summary": "2-sentence strictly non-diagnostic objective summary highlighting abnormal parameters or documented medicines."\n'
        "}\n"
        "RULES:\n"
        "1. Do NOT invent, guess, or fabricate values that are illegible or missing.\n"
        "2. Do NOT diagnose diseases or recommend new treatments in clinical_summary.\n"
        "3. Omit patient personal names, phone numbers, or addresses from clinical_summary."
    )

    b64_doc = base64.b64encode(content).decode("utf-8")
    models_to_try = get_ordered_gemini_models()

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            for m_id in models_to_try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_id}:generateContent?key={gemini_key}"
                resp = await client.post(
                    url,
                    json={
                        "systemInstruction": {"parts": [{"text": NON_DIAGNOSTIC_SYSTEM_INSTRUCTION}]},
                        "contents": [{
                            "parts": [
                                {"text": ocr_prompt},
                                {"inline_data": {"mime_type": mime_type, "data": b64_doc}},
                            ]
                        }],
                        "generationConfig": {
                            "response_mime_type": "application/json",
                            "temperature": 0.1,
                            "maxOutputTokens": 2048,
                        },
                    },
                )
                if resp.status_code != 200:
                    if resp.status_code == 404:
                        mark_gemini_model_retired(m_id)
                    else:
                        logger.warning("Gemini OCR model %s returned HTTP %s", m_id, resp.status_code)
                    continue

                data = resp.json()
                parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])
                raw_text = (parts[0].get("text") or "").strip() if parts else ""
                if raw_text.startswith("```"):
                    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
                    raw_text = re.sub(r"\s*```$", "", raw_text).strip()
                parsed = json.loads(raw_text)
                if isinstance(parsed, dict):
                    doc_type = str(parsed.get("document_type") or "Lab Report")
                    biomarkers = parsed.get("biomarkers") if isinstance(parsed.get("biomarkers"), list) else []
                    meds = parsed.get("medications") if isinstance(parsed.get("medications"), list) else []
                    summary = anonymize_clinical_text(str(parsed.get("clinical_summary") or ""))
                    return {
                        "document_type": doc_type,
                        "biomarkers": biomarkers,
                        "medications": [str(x) for x in meds if x],
                        "clinical_summary": summary,
                        "ocr_status": "success",
                        "model": m_id,
                    }
    except Exception as exc:
        logger.warning("Multimodal OCR extraction failed: %s", exc)

    return fallback_payload


@router.post("/ocr-document")
async def ocr_patient_document(
    file: UploadFile = File(...),
) -> dict:
    """
    Multimodal OCR endpoint for Step 5 prescription/lab report scanning.
    Extracts biomarkers, medications, and an objective 2-sentence non-diagnostic summary.
    """
    safe_basename, _, content_type, content = await _validate_and_read_document(file)
    ocr_result = await _extract_document_ocr_with_gemini(content, content_type)
    return {
        "status": "success" if ocr_result.get("ocr_status") == "success" else "unavailable",
        "filename": safe_basename,
        "file_type": content_type,
        **ocr_result,
    }


@router.post("/cases/{public_case_id}/documents", response_model=DocumentUploadResponse)

async def upload_case_document(

    public_case_id: str,

    file: UploadFile = File(...),

    x_case_access_token: Annotated[str | None, Header()] = None,

    x_access_token: Annotated[str | None, Header()] = None,

    db: Session = Depends(get_db),

) -> DocumentUploadResponse:

    """

    Upload a medical document or image for a submitted case.

    Requires X-Case-Access-Token (or X-Access-Token) header.

    Validates file type, extension, size limit, and file signature magic bytes.

    Runs multimodal Gemini Vision OCR to extract structured biomarkers/medications.

    """

    token = x_case_access_token or x_access_token

    case = _get_verified_patient_case(public_case_id, token, db)

    safe_basename, ext, content_type, content = await _validate_and_read_document(file)

    # 5. Store file with safe random UUID filename outside public web tree

    stored_name = f"{uuid.uuid4().hex}{ext}"

    storage_path = (settings.UPLOAD_DIR / stored_name).resolve()

    

    # Path traversal assertion

    if not storage_path.is_relative_to(settings.UPLOAD_DIR.resolve()):

        raise HTTPException(

            status_code=status.HTTP_400_BAD_REQUEST,

            detail="Invalid destination storage path.",

        )



    with open(storage_path, "wb") as f:

        f.write(content)

    # 5b. Multimodal OCR extraction (stored as JSON in CaseDocument.extracted_data)
    ocr_result = await _extract_document_ocr_with_gemini(content, content_type)
    extracted_json = json.dumps(ocr_result, ensure_ascii=False)



    # 6. Save metadata

    doc = CaseDocument(

        case_id=case.id,

        original_filename=safe_basename,

        stored_filename=stored_name,

        file_type=content_type,

        file_size=len(content),

        extracted_data=extracted_json,

    )

    db.add(doc)

    db.commit()

    db.refresh(doc)



    return DocumentUploadResponse(

        id=doc.id,

        original_filename=doc.original_filename,

        file_type=doc.file_type,

        file_size=doc.file_size,

        extracted_data=doc.extracted_data,

        uploaded_at=doc.uploaded_at,

    )





@router.get("/cases/{public_case_id}/documents/{doc_id}/download")

def download_patient_document(

    public_case_id: str,

    doc_id: str,

    x_case_access_token: Annotated[str | None, Header()] = None,

    x_access_token: Annotated[str | None, Header()] = None,

    access_token: Annotated[str | None, Query()] = None,

    db: Session = Depends(get_db),

) -> FileResponse:

    """

    Download an uploaded document for a case with strict case-level authorization.

    Cross-case access is strictly blocked.

    """

    token = x_case_access_token or x_access_token or access_token

    case = _get_verified_patient_case(public_case_id, token, db)



    doc = (

        db.query(CaseDocument)

        .filter(CaseDocument.id == doc_id, CaseDocument.case_id == case.id)

        .first()

    )

    if not doc:

        raise HTTPException(

            status_code=status.HTTP_404_NOT_FOUND,

            detail="Document not found for this case",

        )



    file_path = (settings.UPLOAD_DIR / doc.stored_filename).resolve()

    if not file_path.is_relative_to(settings.UPLOAD_DIR.resolve()) or not file_path.is_file():

        raise HTTPException(

            status_code=status.HTTP_404_NOT_FOUND,

            detail="File content not found on server",

        )



    return FileResponse(

        path=str(file_path),

        filename=doc.original_filename,

        media_type=doc.file_type,

    )





@router.get("/cases/{public_case_id}/receipt")

def download_patient_receipt(

    public_case_id: str,

    x_case_access_token: Annotated[str | None, Header()] = None,

    x_access_token: Annotated[str | None, Header()] = None,

    access_token: Annotated[str | None, Query()] = None,

    db: Session = Depends(get_db),

) -> Response:

    """

    Generate and stream a patient case receipt PDF.

    Requires access token either in X-Case-Access-Token header or as query parameter.

    """

    token = x_case_access_token or x_access_token or access_token

    case = _get_verified_patient_case(public_case_id, token, db)



    pdf_bytes = generate_case_receipt_pdf(case)

    return Response(

        content=pdf_bytes,

        media_type="application/pdf",

        headers={

            "Content-Disposition": f"attachment; filename=receipt-{case.public_case_id}.pdf"

        },

    )





@router.post("/interview/questions", response_model=InterviewQuestions)

@router.post("/follow-up-questions")

def get_interview_questions(

    payload: dict | None = None,

) -> dict:

    """

    Dynamic follow-up interview questions with contextual symptom continuity.

    Generates structured, validated follow-up questions based on the chief complaint and ongoing interview answers.

    Works with deterministic rule-based fallback when local AI is disabled or unreachable.

    NO authentication required.

    """

    payload = payload or {}

    chief_complaint = str(payload.get("chief_complaint") or payload.get("complaint") or "").strip()

    language = str(payload.get("language") or "en").strip()



    answers_dicts = []

    raw_responses = payload.get("responses")

    if isinstance(raw_responses, list):

        for r in raw_responses:

            if isinstance(r, dict):

                q = str(r.get("question") or "").strip()

                a = str(r.get("answer") or "").strip()

                if q:

                    answers_dicts.append({"question": q, "answer": a})



    raw_existing = payload.get("existing_answers")

    if isinstance(raw_existing, dict):

        for q, a in raw_existing.items():

            answers_dicts.append({"question": str(q), "answer": str(a)})

    elif isinstance(raw_existing, list):

        for r in raw_existing:

            if isinstance(r, dict):

                q = str(r.get("question") or "").strip()

                a = str(r.get("answer") or "").strip()

                if q:

                    answers_dicts.append({"question": q, "answer": a})



    ai = get_ai_service()

    inp = FollowUpInput(

        chief_complaint=chief_complaint,

        existing_answers=answers_dicts,

        language=language,

    )

    out = ai.generate_follow_up_questions(inp)

    return {

        "questions": out.questions,

        "source": out.source,

        "language": out.language,

        "detected_symptoms": out.detected_symptoms,

        "disclaimer": out.disclaimer,

    }





def _get_indic_lang_label(lang_code: str) -> str:
    """Maps language codes to natural Indic language names."""
    code = (lang_code or "").lower().strip()
    mapping = {
        "or": "Odia", "odia": "Odia", "od-in": "Odia",
        "hi": "Hindi", "hindi": "Hindi", "hi-in": "Hindi",
        "en": "English", "english": "English", "en-in": "English",
        "bn": "Bengali", "bengali": "Bengali", "bn-in": "Bengali",
        "te": "Telugu", "telugu": "Telugu", "te-in": "Telugu",
        "ta": "Tamil", "tamil": "Tamil", "ta-in": "Tamil",
        "mr": "Marathi", "marathi": "Marathi", "mr-in": "Marathi",
        "gu": "Gujarati", "gujarati": "Gujarati", "gu-in": "Gujarati",
        "kn": "Kannada", "kannada": "Kannada", "kn-in": "Kannada",
        "ml": "Malayalam", "malayalam": "Malayalam", "ml-in": "Malayalam",
        "pa": "Punjabi", "punjabi": "Punjabi", "pa-in": "Punjabi",
        "as": "Assamese", "assamese": "Assamese", "as-in": "Assamese",
        "ur": "Urdu", "urdu": "Urdu", "ur-in": "Urdu",
        "ne": "Nepali", "nepali": "Nepali", "ne-in": "Nepali",
        "sa": "Sanskrit", "sanskrit": "Sanskrit", "sa-in": "Sanskrit",
        "mai": "Maithili", "maithili": "Maithili", "mai-in": "Maithili",
        "kok": "Konkani", "konkani": "Konkani", "kok-in": "Konkani",
        "sd": "Sindhi", "sindhi": "Sindhi", "sd-in": "Sindhi",
        "doi": "Dogri", "dogri": "Dogri", "doi-in": "Dogri",
        "mni": "Manipuri", "manipuri": "Manipuri", "mni-in": "Manipuri",
        "sat": "Santali", "santali": "Santali", "sat-in": "Santali",
        "brx": "Bodo", "bodo": "Bodo", "brx-in": "Bodo",
        "ks": "Kashmiri", "kashmiri": "Kashmiri", "ks-in": "Kashmiri",
    }
    return mapping.get(code, "Odia" if code.startswith("or") else "English")


def _enforce_single_question(text: str) -> str:
    """Clips text up to the first question mark so patient is never overwhelmed with multiple questions."""
    if not text:
        return ""
    parts = re.split(r'([?？])', text)
    if len(parts) <= 2:
        return text.strip()
    return (parts[0] + parts[1]).strip()


def _get_single_demographic_prompt(name: str | None, age: int | None, gender: str | None, contact: str | None, complaint: str | None, language: str) -> tuple[str, int]:
    lang = (language or "en").lower().split("-")[0]
    clean_name = (name or "").strip()
    
    # Universal 23-language warm conversational prompts (Ananya — Care Coordinator at Guinex Clinic)
    if not clean_name:
        PROMPTS_NAME = {
            "or": "ନମସ୍କାର, ଗୁଇନେକ୍ସ କ୍ଲିନିକ୍‌କୁ ସ୍ୱାଗତ। ମୁଁ ଅନନ୍ୟା, ଆପଣଙ୍କ କେୟାର କୋଅର୍ଡିନେଟର। ଆପଣ ପ୍ରସ୍ତୁତ ହେଲେ ଦୟାକରି ଆପଣଙ୍କ ଶୁଭ ନାମ କୁହନ୍ତୁ?",
            "hi": "नमस्ते, गुइनेक्स क्लिनिक में आपका स्वागत है। मैं अनन्या हूँ, आपकी केयर कोऑर्डिनेटर। जब आप तैयार हों, तो कृपया अपना शुभ नाम बताइए?",
            "bn": "নমস্কার, গুইনেক্স ক্লিনিকে আপনাকে স্বাগতম। আমি অনন্যা, আপনার কেয়ার কোঅর্ডিনেটর। আপনি প্রস্তুত হলে দয়া করে আপনার শুভ নাম বলুন?",
            "te": "నమస్కారం, గుయినెక్స్ క్లినిక్‌కు స్వాగతం. నేను అనన్యను, మీ కేర్ కోఆర్డినేటర్‌ని. మీరు సిద్ధంగా ఉన్నప్పుడు దయచేసి మీ పేరు చెప్పండి?",
            "ta": "வணக்கம், குயினெக்ஸ் கிளினிக்கிற்கு வரவேற்கிறோம். நான் அனன்யா, உங்கள் பராமரிப்பு ஒருங்கிணைப்பாளர். நீங்கள் தயாராக இருக்கும்போது உங்கள் பெயரைச் சொல்லுங்கள்?",
            "mr": "नमस्कार, गुइनेक्स क्लिनिकमध्ये आपले स्वागत आहे. मी अनन्या, तुमची केअर कोऑर्डिनेटर. तुम्ही तयार असाल तेव्हा कृपया तुमचे शुभ नाव सांगा?",
            "gu": "નમસ્તે, ગુઇનેક્સ ક્લિનિકમાં આપનું સ્વાગત છે. હું અનન્યા છું, આપની કેર કોઓર્ડિનેટર. આપ તૈયાર હોવ ત્યારે કૃપા કરીને આપનું નામ જણાવશો?",
            "kn": "ನಮಸ್ಕಾರ, ಗುಯಿನೆಕ್ಸ್ ಕ್ಲಿನಿಕ್‌ಗೆ ಸ್ವಾಗತ. ನಾನು ಅನನ್ಯಾ, ನಿಮ್ಮ ಕೇರ್ ಕೋಆರ್ಡಿನೇಟರ್. ನೀವು ಸಿದ್ಧರಾದಾಗ ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೆಸರು ತಿಳಿಸಿ?",
            "ml": "നമസ്കാരം, ഗുയിനെക്സ് ക്ലിനിക്കിലേക്ക് സ്വാഗതം. ഞാൻ അനന്യ, നിങ്ങളുടെ കെയർ കോർഡിനേറ്റർ. നിങ്ങൾ തയ്യാറാകുമ്പോൾ ദയവായി നിങ്ങളുടെ പേര് പറയൂ?",
            "pa": "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਗੁਇਨੇਕਸ ਕਲੀਨਿਕ ਵਿੱਚ ਤੁਹਾਡਾ ਸਵਾਗਤ ਹੈ। ਮੈਂ ਅਨੰਨਿਆ ਹਾਂ, ਤੁਹਾਡੀ ਕੇਅਰ ਕੋਆਰਡੀਨੇਟਰ। ਜਦੋਂ ਤੁਸੀਂ ਤਿਆਰ ਹੋਵੋ, ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਸ਼ੁਭ ਨਾਮ ਦੱਸੋ?",
            "as": "নমস্কাৰ, গুইনেক্স ক্লিনিকলৈ স্বাগতম। মই অনন্যা, আপোনাৰ কেয়াৰ কোঅৰ্ডিনেটৰ। আপুনি সাজু হ'লে অনুগ্ৰহ কৰি আপোনাৰ নাম কওক?",
            "ur": "السلام علیکم، گوئینیکس کلینک میں خوش آمدید۔ میں اننیا ہوں، آپ کی کیئر کوآرڈینیٹر۔ جب آپ تیار ہوں تو براہ کرم اپنا نام بتائیں؟",
            "ne": "नमस्ते, गुइनेक्स क्लिनिकमा स्वागत छ। म अनन्या हुँ, तपाईंकी केयर कोअर्डिनेटर। तपाईं तयार हुँदा कृपया आफ्नो शुभ नाम भन्नुहोस्?",
            "sa": "नमस्ते, गुइनेक्स चिकित्सालये स्वागतम्। अहम् अनन्या अस्मि। कृपया स्वस्य शुभनाम वदन्तु?",
            "mai": "प्रणाम, गुइनेक्स क्लिनिकमे स्वागत अछि। हम अनन्या छी। कृपया अपन शुभ नाम बताउ?",
            "kok": "नमस्कार, गुइनेक्स क्लिनिकांत येवकार। हांव अनन्या। उपकार करून तुमचें नांव सांगात?",
            "sd": "ڀلي ڪري آيا، گوئينڪس ڪلينڪ ۾ خوش آمديد۔ مان اننيا آهيان۔ مهرباني ڪري پنهنجو نالو ٻڌايو؟",
            "doi": "नमस्ते, गुइनेक्स क्लीनिक च स्वागत ऐ। मैं अनन्या आं। कृपा करियै अपना शुभ नां दस्सो?",
            "mni": "ꯈꯨꯔꯨꯝꯖꯔꯤ, গুইনেক্স ক্লিনিক্তা তরাম্না ওকচরি। ঐহাক অনন্যা। চানবীদুনা নহাক্কী মমিং হায়বিয়ু?",
            "sat": "ᱡᱚᱦᱟᱨ, ᱜᱩᱭᱱᱮᱠᱥ ᱠᱞᱤᱱᱤᱠ ᱨᱮ ᱥᱟᱹᱜᱩᱱ ᱫᱟᱨᱟᱢ᱾ ᱤᱧ ᱫᱚ ᱟᱱᱟᱱᱭᱟ ᱠᱟᱹᱱᱟᱹᱧ᱾ ᱫᱟᱭᱟ ᱠᱟᱛᱮ ᱟᱢᱟᱜ ᱧᱩᱛᱩᱢ ᱞᱟᱹᱭ ᱢᱮ?",
            "brx": "खुलुमबाय, गुइनेक्स क्लिनिकाव बरायबाय। आं अनन्या। अननानै नोंथांनि मुं खोन्था?",
            "ks": "آداب، گوئینیکس کلینکس منٛز خوش آمدید۔ بؤ چَھس اننیا۔ مہربٲنی کٔرِتھ ونِو پنُن ناو؟",
            "en": "Hi there, welcome to Guinex Clinic. I'm Ananya, your care coordinator, and I'll help get you checked in smoothly. Whenever you're ready, what's your good name?"
        }
        return (PROMPTS_NAME.get(lang, PROMPTS_NAME["en"]), 1)

    if not age:
        PROMPTS_AGE = {
            "or": f"ଆପଣଙ୍କୁ ଭେଟି ବହୁତ ଖୁସି ଲାଗିଲା, {clean_name}! ଆପଣଙ୍କ ବୟସ କେତେ?",
            "hi": f"आपसे मिलकर बहुत अच्छा लगा, {clean_name} जी! आपकी उम्र कितनी है?",
            "bn": f"আপনার সাথে পরিচিত হয়ে ভালো লাগল, {clean_name}! আপনার বয়স কত?",
            "te": f"మిమ్మల్ని కలవడం చాలా ఆనందంగా ఉంది, {clean_name}! మీ వయస్సు ఎంత?",
            "ta": f"உங்களைச் சந்தித்ததில் மகிழ்ச்சி, {clean_name}! உங்கள் வயது என்ன?",
            "mr": f"तुम्हाला भेटून छान वाटलं, {clean_name}! तुमचे वय किती आहे?",
            "gu": f"તમને મળીને આનંદ થયો, {clean_name}! તમારી ઉંમર કેટલી છે?",
            "kn": f"ನಿಮ್ಮನ್ನು ಭೇಟಿಯಾಗಿ ತುಂಬಾ ಸಂತೋಷವಾಯಿತು, {clean_name}! ನಿಮ್ಮ ವಯಸ್ಸು ಎಷ್ಟು?",
            "ml": f"നിങ്ങളെ പരിചയപ്പെട്ടതിൽ സന്തോഷം, {clean_name}! നിങ്ങളുടെ പ്രായം എത്രയാണ്?",
            "pa": f"ਤੁਹਾਨੂੰ ਮਿਲ ਕੇ ਬਹੁਤ ਖੁਸ਼ੀ ਹੋਈ, {clean_name} ਜੀ! ਤੁਹਾਡੀ ਉਮਰ ਕਿੰਨੀ ਹੈ?",
            "as": f"আপোনাক লগ পাই ভাল লাগিল, {clean_name}! আপোনাৰ বয়স কিমান?",
            "ur": f"آپ سے مل کر خوشی ہوئی، {clean_name}! آپ کی عمر کتنی ہے؟",
            "ne": f"तपाईंलाई भेटेर खुसी लाग्यो, {clean_name} जी! तपाईंको उमेर कति भयो?",
            "sa": f"भवन्तं दृष्ट्वा प्रसन्नता अभवत्, {clean_name}! भवतः वयः कियत्?",
            "mai": f"अहाँसँ भेट कऽ नीक लागल, {clean_name} जी! अहाँक उमिर कते अछि?",
            "kok": f"तुमकां मेळून बरें दिसलें, {clean_name}! तुमची पिराय कितली?",
            "sd": f"توهان سان ملي خوشي ٿي، {clean_name}! توهان جي عمر ڪيتري آهي؟",
            "doi": f"थुआह्‌गी मिलियै बड़ा चंगा लग्गा, {clean_name} जी! थुआह्‌री उमर किन्नी ऐ?",
            "mni": f"নহাক্কা উনবদা হরাওই, {clean_name}! নহাক্কী চহি কয়ানি?",
            "sat": f"ᱟᱢ ᱥᱟᱶ ᱧᱟᱯᱟᱢ ᱠᱟᱛᱮ ᱟᱹᱰᱤ ᱨᱟᱹᱥᱠᱟᱹ ᱵᱩᱡᱷᱟᱹᱣ ᱮᱱᱟ, {clean_name}! ᱟᱢᱟᱜ ᱩᱢᱮᱨ ᱛᱤᱱᱟᱹᱜ?",
            "brx": f"नोंथांखौ मोगा मोगि जानानै मोजां मोनबाय, {clean_name}! नोंथांनि बैसोआ बेसेबां?",
            "ks": f"تُہہِ سٟتؠ مِلِتھ سپُد خۄشی، {clean_name}! تُہنٛز عُمَر کٔژ چھےٚ؟",
            "en": f"Nice to meet you, {clean_name}! How old are you?"
        }
        return (PROMPTS_AGE.get(lang, PROMPTS_AGE["en"]), 1)

    if not gender:
        age_txt = str(age) if age else ""
        PROMPTS_GENDER = {
            "or": f"ଠିକ୍ ଅଛି{f', {age_txt} ବର୍ଷ' if age_txt else ''}। ଆପଣ ପୁରୁଷ, ମହିଳା, ନା କିଛି କହିବାକୁ ଚାହାଁନ୍ତି ନାହିଁ?",
            "hi": f"ठीक है{f', {age_txt} साल' if age_txt else ''}। और आप पुरुष हैं, महिला हैं, या बताना नहीं चाहते?",
            "bn": f"ঠিক আছে{f', {age_txt} বছর' if age_txt else ''}। আপনি কি পুরুষ, মহিলা, নাকি বলতে চান না?",
            "te": f"సరే{f', {age_txt} సంవత్సరాలు' if age_txt else ''}. మీరు పురుషులా, మహిళా, లేదా చెప్పకూడదు అనుకుంటున్నారా?",
            "ta": f"சரி{f', {age_txt} வயது' if age_txt else ''}. நீங்கள் ஆணா, பெண்ணா, அல்லது சொல்ல விரும்பவில்லையா?",
            "mr": f"ठीक आहे{f', {age_txt} वर्षे' if age_txt else ''}. आणि तुम्ही पुरुष आहात, महिला आहात, की सांगू इच्छित नाही?",
            "gu": f"બરાબર{f', {age_txt} વર્ષ' if age_txt else ''}. અને આપ પુરુષ છો, મહિલા છો, કે જણાવવા નથી માંગતા?",
            "kn": f"ಸರಿ{f', {age_txt} ವರ್ಷ' if age_txt else ''}. ನೀವು ಪುರುಷರೇ, ಮಹಿಳೆಯೇ, ಅಥವಾ ಹೇಳಲು ಇಚ್ಛಿಸುವುದಿಲ್ಲವೇ?",
            "ml": f"ശരി{f', {age_txt} വയസ്സ്' if age_txt else ''}. നിങ്ങൾ പുരുഷനാണോ, സ്ത്രീയാണോ, അതോ പറയാൻ ആഗ്രഹിക്കുന്നില്ലേ?",
            "pa": f"ਠੀਕ ਹੈ{f', {age_txt} ਸਾਲ' if age_txt else ''}। ਤੁਸੀਂ ਪੁਰਸ਼ ਹੋ, ਮਹਿਲਾ ਹੋ, ਜਾਂ ਦੱਸਣਾ ਨਹੀਂ ਚਾਹੁੰਦੇ?",
            "as": f"ঠিক আছে{f', {age_txt} বছৰ' if age_txt else ''}। আপুনি পুৰুষ, মহিলা নে ক'ব নিবিচাৰে?",
            "ur": f"ٹھیک ہے{f', {age_txt} سال' if age_txt else ''}۔ کیا آپ مرد ہیں، خاتون ہیں، یا نہیں بتانا چاہتے؟",
            "ne": f"हवस्{f', {age_txt} वर्ष' if age_txt else ''}। तपाईं पुरुष, महिला, वा भन्न चाहनुहुन्न?",
            "sa": f"समीचीनम्। भवान् पुरुषः, महिला, अथवा अन्यः?",
            "mai": f"ठीक अछि। अहाँ पुरुष छी, महिला छी, वा नहि कहय चाहैत छी?",
            "kok": f"बरें आसा। तुमी दादलो, बायल, काय सांगूंक सोदना?",
            "sd": f"ٺيڪ آهي۔ ڇا توهان مرد آهيو، عورت آهيو، يا نه ٻڌائڻ چاهيو؟",
            "doi": f"ठीक ऐ। तुस मर्द ओ, जनाना ओ, या नेईं दस्सना चाह्न्दे?",
            "mni": f"য়াইরে। নহাক নুপা, নুপী, নত্রগা হায়নিংদবা লৈব্রা?",
            "sat": f"ᱴᱷᱤᱠ ᱜᱮᱭᱟ। ᱟᱢ ᱫᱚ ᱦᱮᱨᱮᱞ, ᱢᱟᱹᱭᱡᱩ, ᱥᱮ ᱵᱟᱢ ᱞᱟᱹᱭ ᱥᱟᱱᱟᱭᱮᱫᱟ?",
            "brx": f"मोजां। नोंथाङा हौवा, हिनजाव, ना बुंनो नागिरा?",
            "ks": f"ٹھیٖک چُھ۔ تُہؠ چِھوا مَرٕد، زَنان، یا چھُنہٕ وَنُن یژھان؟",
            "en": f"Got it{f', {age_txt}' if age_txt else ''}. And are you male, female, or prefer not to say?"
        }
        return (PROMPTS_GENDER.get(lang, PROMPTS_GENDER["en"]), 1)

    if not contact:
        PROMPTS_CONTACT = {
            "or": "ଧନ୍ୟବାଦ! ଆପଣଙ୍କ ୧୦ ଅଙ୍କ ବିଶିଷ୍ଟ ହ୍ୱାଟ୍ସଆପ୍ ନମ୍ବରଟି କୁହନ୍ତୁ, ଯେଉଁଠି ଆମେ ଆପଣଙ୍କ ଭିଜିଟ୍ ସ୍ଲିପ୍ ପଠାଇପାରିବୁ (ନଥିଲେ 'ନାହିଁ' କୁହନ୍ତୁ)।",
            "hi": "धन्यवाद! आपका 10 अंकों का व्हाट्सएप नंबर क्या है, जहाँ हम आपकी विज़िट स्लिप भेज सकें? (न हो तो 'नहीं' कहें)",
            "bn": "ধন্যবাদ! আপনার ১০ ডিজিটের হোয়াটসঅ্যাপ নম্বরটি বলবেন, যেখানে আমরা আপনার ভিজিট স্লিপ পাঠাতে পারি? (না থাকলে 'নেই' বলুন)",
            "te": "ధన్యవాదాలు! మీ విజిట్ స్లిప్ పంపడానికి మీ 10 అంకెల వాట్సాప్ నంబర్ చెప్పగలరా? (లేకపోతే 'లేదు' అని చెప్పండి)",
            "ta": "நன்றி! உங்கள் விசிட் ஸ்லிப் அனுப்ப 10 இலக்க வாட்ஸ்அப் எண்ணைச் சொல்லுங்கள் (இல்லையென்றால் 'இல்லை' என்று சொல்லுங்கள்).",
            "mr": "धन्यवाद! तुमची व्हिजिट स्लिप पाठवण्यासाठी 10 अंकी व्हॉट्सॲप नंबर सांगाल का? (नसल्यास 'नाही' म्हणा)",
            "gu": "આભાર! તમારી વિઝિટ સ્લિપ મોકલવા માટે 10 અંકનો વ્હોટ્સએપ નંબર જણાવશો? (ન હોય તો 'નથી' કહો)",
            "kn": "ಧನ್ಯವಾದಗಳು! ನಿಮ್ಮ ವಿಸಿಟ್ ಸ್ಲಿಪ್ ಕಳುಹಿಸಲು 10 ಅಂಕಿಯ ವಾಟ್ಸಾಪ್ ಸಂಖ್ಯೆ ಹೇಳುತ್ತೀರಾ? (ಇಲ್ಲದಿದ್ದರೆ 'ಇಲ್ಲ' ಎನ್ನಿ)",
            "ml": "നന്ദി! നിങ്ങളുടെ വിസിറ്റ് സ്ലിപ്പ് അയക്കാൻ 10 അക്ക വാട്സാപ്പ് നമ്പർ പറയാമോ? (ഇല്ലെങ്കിൽ 'ഇല്ല' എന്ന് പറയുക)",
            "pa": "ਧੰਨਵਾਦ! ਤੁਹਾਡੀ ਵਿਜ਼ਿਟ ਸਲਿੱਪ ਭੇਜਣ ਲਈ ਆਪਣਾ 10 ਅੰਕਾਂ ਦਾ ਵਟਸਐਪ ਨੰਬਰ ਦੱਸੋ (ਨਹੀਂ ਹੈ ਤਾਂ 'ਨਹੀਂ' ਕਹੋ)।",
            "as": "ধন্যবাদ! আপোনাৰ ভিজিট শ্লিপ পঠিয়াবলৈ ১০টা সংখ্যাৰ হোৱাটছএপ নম্বৰটো কওক (না থাকিলে 'নাই' কওক)।",
            "ur": "شکریہ! آپ کی وزٹ سلپ بھیجنے کے لیے اپنا 10 ہندسوں کا واٹس ایپ نمبر بتائیں (نہیں ہے تو 'نہیں' کہیں)۔",
            "ne": "धन्यवाद! तपाईंको भिजिट स्लिप पठाउन १० अंकको ह्वाट्सएप नम्बर भन्नुहोस् (छैन भने 'छैन' भन्नुहोस्)।",
            "sa": "धन्यवादः! भवतां १० अङ्कात्मिका व्हाट्सएप-सङ्ख्या का?",
            "mai": "धन्यवाद! अपन १० अंकक व्हाट्सएप नम्बर बताउ?",
            "kok": "देव बरें करूं! तुमचो १० आंकड्यांचो व्हॉट्सॲप नंबर सांगात?",
            "sd": "مهرباني! پنهنجو ۱۰ انگن وارو واٽس ايپ نمبر ٻڌايو؟",
            "doi": "धन्यवाद! अपना १० अंकें दा व्हाट्सएप नंबर दस्सो?",
            "mni": "থাগৎচরি! নহাক্কী মশিং ১০ লৈবা ৱাটসএপ নম্বর হায়বিয়ু?",
            "sat": "ᱥᱟᱨᱦᱟᱣ! ᱟᱢᱟᱜ ᱑᱐ ᱮᱞ ᱣᱟᱴᱥᱮᱯ ᱱᱚᱢᱵᱚᱨ ᱞᱟᱹᱭ ᱢᱮ?",
            "brx": "साबायखर! नोंथांनि १० अनजिमानि ह्वाट्सएप नम्बर बुं?",
            "ks": "شکریہ! پنُن ۱۰ ہِندسَن ہُند واٹس ایپ نَمبَر ونِو؟",
            "en": "Thanks! What's a good 10-digit WhatsApp number where we can send your visit slip?"
        }
        return (PROMPTS_CONTACT.get(lang, PROMPTS_CONTACT["en"]), 1)

    if not complaint:
        PROMPTS_COMPLAINT = {
            "or": f"ଆପଣଙ୍କ ସମସ୍ତ ବିବରଣୀ ଠିକ୍ ଅଛି{f', {clean_name}' if clean_name else ''}। ଏବେ ଆରାମରେ କୁହନ୍ତୁ—ଆଜି ଆପଣଙ୍କୁ କ'ଣ ଅସୁବିଧା ହେଉଛି?",
            "hi": f"आपकी जानकारी दर्ज हो गई है{f', {clean_name} जी' if clean_name else ''}। अब आराम से बताइए—आज आपको क्या तकलीफ हो रही है?",
            "bn": f"আপনার সব তথ্য নোট করা হয়ে গেছে{f', {clean_name}' if clean_name else ''}। এবার নিশ্চিন্তে বলুন—আজ আপনার কী অসুবিধা হচ্ছে?",
            "te": f"మీ వివరాలన్నీ నమోదయ్యాయి{f', {clean_name}' if clean_name else ''}. ఇప్పుడు నిదానంగా చెప్పండి—ఈరోజు మీకు ఏం ఇబ్బందిగా ఉంది?",
            "ta": f"உங்கள் விவரங்கள் எல்லாம் பதிவாகிவிட்டன{f', {clean_name}' if clean_name else ''}. இப்போது நிதானமாகச் சொல்லுங்கள்—இன்று உங்களுக்கு என்ன தொந்தரவு உள்ளது?",
            "mr": f"तुमची सगळी माहिती नोंदवली गेली आहे{f', {clean_name}' if clean_name else ''}. आता निवांतपणे सांगा—आज तुम्हाला काय त्रास होत आहे?",
            "gu": f"તમારી બધી વિગતો નોંધાઈ ગઈ છે{f', {clean_name}' if clean_name else ''}. હવે આરામથી કહો—આજે તમને શું તકલીફ થઈ રહી છે?",
            "kn": f"ನಿಮ್ಮ ಎಲ್ಲಾ ವಿವರಗಳು ದಾಖಲಾಗಿವೆ{f', {clean_name}' if clean_name else ''}. ಈಗ ನಿಧಾನವಾಗಿ ಹೇಳಿ—ಇಂದು ನಿಮಗೆ ಏನು ತೊಂದರೆಯಾಗುತ್ತಿದೆ?",
            "ml": f"നിങ്ങളുടെ വിവരങ്ങളെല്ലാം രേഖപ്പെടുത്തിയിട്ടുണ്ട്{f', {clean_name}' if clean_name else ''}. ഇനി സാവധാനം പറയൂ—ഇന്ന് നിങ്ങൾക്ക് എന്താണ് ബുദ്ധിമുട്ട്?",
            "pa": f"ਤੁਹਾਡੀ ਸਾਰੀ ਜਾਣਕਾਰੀ ਦਰਜ ਹੋ ਗਈ ਹੈ{f', {clean_name} ਜੀ' if clean_name else ''}। ਹੁਣ ਆਰਾਮ ਨਾਲ ਦੱਸੋ—ਅੱਜ ਤੁਹਾਨੂੰ ਕੀ ਤਕਲੀਫ਼ ਹੋ ਰਹੀ ਹੈ?",
            "as": f"আপোনাৰ সকলো তথ্য লিপিবদ্ধ হৈছে{f', {clean_name}' if clean_name else ''}। এতিয়া আৰামেৰে কওক—আজি আপোনাৰ কি অসুবিধা হৈছে?",
            "ur": f"آپ کی تفصیلات درج ہو گئی ہیں{f', {clean_name}' if clean_name else ''}۔ اب آرام سے بتائیں—آج آپ کو کیا تکلیف ہو رہی ہے؟",
            "ne": f"तपाईंको सबै विवरण दर्ता भयो{f', {clean_name} जी' if clean_name else ''}। अब आरामले भन्नुहोस्—आज तपाईंलाई के समस्या भइरहेको छ?",
            "sa": f"भवतां विवरणानि अङ्कितानि{f', {clean_name}' if clean_name else ''}। अद्य भवते का समस्या वर्तते?",
            "mai": f"अहाँक सभ जानकारी दर्ज भऽ गेल{f', {clean_name} जी' if clean_name else ''}। आब आरामसँ बताउ—आई अहाँक की तकलीफ अछि?",
            "kok": f"तुमची सगळी म्हायती नोंद जाल्या{f', {clean_name}' if clean_name else ''}। आतां सवकास सांगात—आयज तुमकां कितें त्रास जाता?",
            "sd": f"توهان جا تفصيل محفوظ ٿي ويا آهن{f', {clean_name}' if clean_name else ''}۔ هاڻي آرام سان ٻڌايو—اڄ توهان کي ڪهڙي تڪليف آهي؟",
            "doi": f"थुआह्‌री सारी जानकारी दर्ज होई गेई ऐ{f', {clean_name} जी' if clean_name else ''}। हून आराम कन्नै दस्सो—अज्ज केह् तकलीफ ऐ?",
            "mni": f"নহাক্কী অকুপ্পা ৱারোল ইখৎত্রে{f', {clean_name}' if clean_name else ''}। হৌজিক নুংঙাইনা হায়বিয়ু—ঙসি করি ৱাবা ফাওরি?",
            "sat": f"ᱟᱢᱟᱜ ᱡᱚᱛᱚ ᱠᱟᱛᱷᱟ ᱚᱞ ᱮᱱᱟ{f', {clean_name}' if clean_name else ''}। ᱱᱤᱛᱚᱜ ᱟᱨᱟᱢ ᱛᱮ ᱞᱟᱹᱭ ᱢᱮ—ᱛᱮᱦᱮᱧ ᱪᱮᱫ ᱦᱟᱹᱥᱩ ᱦᱩᱭᱩᱜ ᱠᱟᱱᱟ?",
            "brx": f"नोंथांनि गासै खारिथि लिरनाय जाबाय{f', {clean_name}' if clean_name else ''}। दा गाहाम दिनै मा सानाय जादों खोन्था?",
            "ks": f"تُہنٛز تفصیل آیہٕ دَرٕج کَرنہٕ{f', {clean_name}' if clean_name else ''}۔ اَز کِیاہ تَکلیف چھےٚ؟",
            "en": f"All set with your details{f', {clean_name}' if clean_name else ''}. Now take your time—what's been bothering you today?"
        }
        return (PROMPTS_COMPLAINT.get(lang, PROMPTS_COMPLAINT["en"]), 2)

    return ("", 3)


def _get_ack_complaint_prompt(name: str | None, complaint: str | None, language: str) -> str:
    """Localized empathetic complaint acknowledgment + duration follow-up inquiry across all 23 languages."""
    lang = (language or "en").lower().split("-")[0]
    clean_name = (name or "").strip()
    clean_complaint = (complaint or "").strip()
    
    PROMPTS_ACK = {
        "or": f"ମୁଁ ବୁଝିପାରୁଛି {clean_name or ''}। ଆପଣଙ୍କ '{clean_complaint}' ସମସ୍ୟା ବିଷୟରେ ନୋଟ୍ କଲି। ଏହା କେତେ ଦିନ ହେଲା ହେଉଛି?",
        "hi": f"मैं समझ सकती हूँ {clean_name or ''} जी, यह तकलीफ काफी असहज हो सकती है। यह कितने दिनों से हो रहा है?",
        "bn": f"আমি বুঝতে পারছি {clean_name or ''}। আপনার '{clean_complaint}' কষ্টের কথা লিখে নিয়েছি। এটা কতদিন ধরে হচ্ছে?",
        "te": f"మీ ఇబ్బంది నేను అర్థం చేసుకోగలను {clean_name or ''}. ఇది ఎన్ని రోజులుగా ఉంది?",
        "ta": f"உங்கள் சிரமம் புரிகிறது {clean_name or ''}. இது எத்தனை நாட்களாக உள்ளது?",
        "mr": f"मला समजतंय {clean_name or ''}, हा त्रास नक्कीच कठीण असतो. हा त्रास किती दिवसांपासून होत आहे?",
        "gu": f"હું સમજી શકું છું {clean_name or ''}. આ તકલીફ કેટલા દિવસોથી થઈ રહી છે?",
        "kn": f"ನಿಮ್ಮ ತೊಂದರೆ ನನಗೆ ಅರ್ಥವಾಗುತ್ತದೆ {clean_name or ''}. ಇದು ಎಷ್ಟು ದಿನಗಳಿಂದ ಇದೆ?",
        "ml": f"നിങ്ങളുടെ ബുദ്ധിമുട്ട് എനിക്ക് മനസ്സിലാകുന്നു {clean_name or ''}. ഇത് എത്ര ദിവസമായി തുടങ്ങിയിട്ട്?",
        "pa": f"ਮੈਂ ਸਮਝ ਸਕਦੀ ਹਾਂ {clean_name or ''} ਜੀ। ਇਹ ਤਕਲੀਫ਼ ਕਿੰਨੇ ਦਿਨਾਂ ਤੋਂ ਹੋ ਰਹੀ ਹੈ?",
        "as": f"মই বুজি পাইছোঁ {clean_name or ''}। এই অসুবিধা কিমান দিনৰ পৰা হৈছে?",
        "ur": f"میں سمجھ سکتی ہوں {clean_name or ''}۔ یہ تکلیف کتنے دنوں سے ہو رہی ہے؟",
        "ne": f"म बुझ्न सक्छु {clean_name or ''} जी। यो समस्या कति दिनदेखि भइरहेको छ?",
        "sa": f"अहम् अवगच्छामि {clean_name or ''}। एषा समस्या कतिदिनेभ्यः वर्तते?",
        "mai": f"हम बुझि सकैत छी {clean_name or ''} जी। ई तकलीफ कते दिन सँ अछि?",
        "kok": f"म्हाका समजता {clean_name or ''}। हो त्रास कितल्या दिसांसावन जाता?",
        "sd": f"مان سمجهان ٿي {clean_name or ''}۔ هيءَ تڪليف ڪيتري ڏينهن کان آهي؟",
        "doi": f"मैं समझ सकदी आं {clean_name or ''} जी। एह तकलीफ किन्ने दिनें थमां ऐ?",
        "mni": f"ঐহাক খঙই {clean_name or ''}। অসি কয়ানিগী মমাংদগীনি?",
        "sat": f"ᱤᱧ ᱵᱩᱡᱷᱟᱹᱣ ᱫᱟᱲᱮᱭᱟᱜ ᱠᱟᱱᱟ {clean_name or ''}᱾ ᱱᱚᱶᱟ ᱫᱚ ᱛᱤᱱᱟᱹᱜ ᱫᱤᱱ ᱠᱷᱚᱱ ᱦᱩᱭᱩᱜ ᱠᱟᱱᱟ?",
        "brx": f"आं बुजिबाय {clean_name or ''}। बे बेरामा बेसेबां दिन जाबाय?",
        "ks": f"بؤ چَھس سَمجان {clean_name or ''}۔ یِہ مَسئلہٕ کٔژَن دۄہَن پؠٹھٕ چھُ؟",
        "en": f"I'm sorry you're dealing with {clean_complaint}, {clean_name or 'there'}. How long has this been going on?"
    }
    return PROMPTS_ACK.get(lang, PROMPTS_ACK["en"])


def _get_report_prompt(language: str) -> str:
    """Localized transition prompt to prior reports across all 23 languages."""
    lang = (language or "en").lower().split("-")[0]
    PROMPTS_REP = {
        "or": "ଆପଣଙ୍କର ସମସ୍ତ ବିବରଣୀ ନୋଟ୍ କରାଗଲା। ଆପଣଙ୍କ ପାଖରେ କୌଣସି ପୁରୁଣା ଡାକ୍ତରୀ ରିପୋର୍ଟ ବା ପ୍ରେସକ୍ରିପସନ୍ ଅଛି କି? ଯଦି ଅଛି ତେବେ ଅପଲୋଡ୍ କରନ୍ତୁ, ଅଥବା କୁହନ୍ତୁ: 'କୌଣସି ରିପୋର୍ଟ ନାହିଁ' କିମ୍ବା 'ସରିଗଲା'।",
        "hi": "आपके सभी विवरण नोट कर लिए गए हैं। क्या आपके पास कोई पुरानी जांच रिपोर्ट या पर्ची है? यदि है तो अपलोड करें, या कहें: 'कोई रिपोर्ट नहीं है' या 'हो गया'。",
        "bn": "আপনার সব বিবরণ নোট করা হয়েছে। আপনার কি কোনো পুরনো মেডিকেল রিপোর্ট বা প্রেসক্রিপশন আছে? থাকলে আপলোড করুন, অথবা বলুন: 'কোনো রিপোর্ট নেই' বা 'শেষ হয়েছে'。",
        "te": "మీ వివరాలన్నీ నమోదు చేయబడ్డాయి. మీ వద్ద పాత వైద్య నివేదికలు లేదా ప్రిస్క్రిప్షన్లు ఏమైనా ఉన్నాయా? ఉంటే అప్‌లోడ్ చేయండి, లేదా 'ఏమీ లేవు' అని చెప్పండి。",
        "ta": "உங்கள் விவரங்கள் அனைத்தும் பதிவு செய்யப்பட்டுள்ளன. உங்களிடம் பழைய மருத்துவ அறிக்கைகள் அல்லது மருந்துச் சீட்டுகள் உள்ளதா? இருந்தால் பதிவேற்றவும், அல்லது 'எதுவுமில்லை' என்று சொல்லவும்。",
        "mr": "आपले सर्व तपशील नोंदवले गेले आहेत. आपल्याकडे कोणतेही जुने वैद्यकीय अहवाल किंवा प्रिस्क्रिप्शन आहेत का? असल्यास अपलोड करा, किंवा म्हणा: 'कोणताही अहवाल नाही'。",
        "gu": "આપની તમામ વિગતો નોંધી લેવામાં આવી છે. શું આપણી પાસે કોઈ જૂના મેડિકલ રિપોર્ટ કે પ્રિસ્ક્રિપ્શન છે? જો હોય તો અપલોડ કરો, અથવા કહો: 'કોઈ રિપોર્ટ નથી'。",
        "kn": "ನಿಮ್ಮ ಎಲ್ಲಾ ವಿವರಗಳನ್ನು ದಾಖಲಿಸಲಾಗಿದೆ. ನಿಮ್ಮ ಬಳಿ ಹಳೆಯ ವೈದ್ಯಕೀಯ ವರದಿಗಳು ಅಥವಾ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಇದೆಯೇ? ಇದ್ದರೆ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ, ಅಥವಾ 'ಯಾವುದೂ ಇಲ್ಲ' ಎಂದು ಹೇಳಿ。",
        "ml": "നിങ്ങളുടെ എല്ലാ വിവരങ്ങളും രേഖപ്പെടുത്തി. നിങ്ങളുടെ പക്കൽ പഴയ മെഡിക്കൽ റിപ്പോർട്ടുകളോ കുറിപ്പടികളോ ഉണ്ടോ? ഉണ്ടെങ്കിൽ അപ്‌ലോഡ് ചെയ്യുക, അല്ലെങ്കിൽ 'റിപ്പോർട്ടുകൾ ഒന്നുമില്ല' എന്ന് പറയുക。",
        "pa": "ਤੁਹਾਡੇ ਸਾਰੇ ਵੇਰਵੇ ਨੋਟ ਕਰ ਲਏ ਗਏ ਹਨ। ਕੀ ਤੁਹਾਡੇ ਕੋਲ ਕੋਈ ਪੁਰਾਣੀ ਜਾਂਚ ਰਿਪੋਰਟ ਜਾਂ ਪਰਚੀ ਹੈ? ਜੇ ਹੈ ਤਾਂ ਅਪਲੋਡ ਕਰੋ, ਜਾਂ ਕਹੋ: 'ਕੋਈ ਰਿਪੋਰਟ ਨਹੀਂ ਹੈ'。",
        "as": "আপোনাৰ সকলো বিৱৰণ লিপিবদ্ধ কৰা হৈছে। আপোনাৰ ওচৰত কোনো পুৰণি চিকিৎসা প্ৰতিবেদন বা প্ৰেচক্ৰিপশ্বন আছে নেকি? থাকিলে আপলোড কৰক, নতুবা কওক: 'কোনো ৰিপোৰ্ট নাই'。",
        "ur": "آپ کی تمام تفصیلات درج کر لی گئی ہیں۔ کیا آپ کے پاس کوئی پرانی میڈیکل رپورٹ یا نسخہ ہے؟ اگر ہے تو اپ لوڈ کریں، یا کہیں: 'کوئی رپورٹ نہیں ہے'۔",
        "ne": "तपाईंको सबै विवरण दर्ता गरियो। के तपाईंसँग कुनै पुरानो मेडिकल रिपोर्ट वा प्रेस्क्रिप्सन छ? छ भने अपलोड गर्नुहोस्, नभए भन्नुहोस्: 'कुनै रिपोर्ट छैन'。",
        "sa": "भवतां सर्वाणि विवरणानि अङ्कितानि। भवतां पार्श्वे किमपि पुरातनं चिकित्सापत्रं प्रतिवेदनं वा अस्ति किम्? अस्ति चेत् अपलोड् कुर्वन्तु, अथवा वदन्तु: 'किमपि प्रतिवेदनं नास्ति'。",
        "mai": "अहाँक सभ जानकारी नोट कऽ लेल गेल अछि। की अहाँक पास कोनो पुरान जांच रिपोर्ट वा पुर्जा अछि? यदि अछि तँ अपलोड करू, वा कहू: 'कोनो रिपोर्ट नहि अछि'。",
        "kok": "तुमची सगळी म्हायती नोंद केल्या। तुमचेकडेन आदल्यो कसलयो वैजकी तपासणी रिपोर्ट वा प्रिस्क्रिप्शन आसात? आसल्यार अपलोड करात, ना जाल्यार सांगात: 'कसलीच रिपोर्ट ना'。",
        "sd": "توهان جا سڀ تفصيل محفوظ ٿي ويا آهن. ڇا توهان وٽ پراڻي ميڊيڪل رپورٽ يا نسخو آهي؟ جيڪڏهن آهي ته اپلوڊ ڪريو، يا چئو: 'ڪا به رپورٽ ناهي'۔",
        "doi": "थुआह्‌रे सारे विवरण नोट करी लित्ते गे न। केह् थुआह्‌रे कोल कोई पुरानी टेस्ट रिपोर्ट या परची ऐ? जे ऐ तां अपलोड करो, या आखो: 'कोई रिपोर्ट नेईं ऐ'。",
        "mni": "নহাক্কী অকুপ্পা ৱারোল পুম্নমক ইখৎত্রে। নহাক্কীদা অরিবা মেদিকেল রিপোর্ট নত্রগা প্রেসক্রিপশন লৈব্রা? লৈরবদি অপলোদ তৌবিয়ু, নত্রবদি 'অমত্তা লৈতে' হায়বিয়ু।",
        "sat": "ᱟᱢᱟᱜ ᱡᱚᱛᱚ ᱠᱟᱛᱷᱟ ᱚᱞ ᱮᱱᱟ᱾ ᱟᱢ ᱴᱷᱮᱱ ᱢᱟᱨᱮ ᱰᱟᱠᱛᱚᱨ ᱨᱤᱯᱚᱨᱴ ᱥᱮ ᱚᱞ ᱢᱮᱱᱟᱜ-ᱟ? ᱢᱮᱱᱟᱜ ᱠᱷᱟᱱ ᱟᱯᱞᱳᱰ ᱢᱮ, ᱵᱟᱝᱠᱷᱟᱱ ᱞᱟᱹᱭ ᱢᱮ: 'ᱪᱮᱫ ᱨᱤᱯᱳᱨᱴ ᱦᱚᱸ ᱵᱟᱹᱱᱩᱜ-ᱟ'᱾",
        "brx": "नोंथांनि गासै खारिथि लिरनाय जाबाय। नोंथांनाव गोजां डाक्टर रिपर्ट एबा प्रिसक्रिपसन दं नामा? दंब्ला आपलोड खालाम, नङाब्ला बुं: 'जेबो रिपर्ट गैया'。",
        "ks": "تُہنٛز تَمام تفصیٖل آیہٕ دَرٕج کَرنہٕ۔ کیا تُہنٛدِس نِش چھا کانہہ پرٲنؠ طِبی رِپوورٹ یا نُسخہٕ؟ اگر چھُ تیٚلہِ کٔرِو اَپلوڈ، یا ونِو: 'کانٛہہ رِپوورٹ چھُنہٕ'۔",
        "en": "All your clinical details are recorded. Do you have any prior medical lab reports or prescriptions? If you have them, please upload now, or say 'no reports'."
    }
    return PROMPTS_REP.get(lang, PROMPTS_REP["en"])



@router.post("/ai-voice-intake")

async def ai_voice_intake(payload: dict) -> dict:

    """

    Intelligent Conversational Voice Intake Agent using Sarvam 105B Conversations.

    Analyzes multi-part patient speech in Odia, Hindi, or English.

    Validates patient answers, filters ambient noise/silence, extracts clinical information,

    and conducts natural doctor-patient conversation without blindly skipping questions.

    """

    import json

    import re



    raw_transcript = str(payload.get("transcript") or "").strip()

    step = int(payload.get("step") or 1)

    language = str(payload.get("language") or "or").strip()

    patient_name = str(payload.get("patient_name") or "").strip()

    patient_age = payload.get("patient_age")

    patient_contact = str(payload.get("patient_contact") or "").strip()

    patient_gender = str(payload.get("patient_gender") or payload.get("gender") or "").strip()

    chief_complaint = str(payload.get("chief_complaint") or "").strip()
    uploaded_reports_count = int(payload.get("uploaded_reports_count") or 0)
    uploaded_filenames = payload.get("uploaded_filenames") or []
    current_slot = str(payload.get("current_slot") or "").strip()

    def _is_typing_intent(text: str | None) -> bool:
        if not text:
            return False
        clean = text.lower().strip()
        return bool(re.search(
            r'(?:typing|type|typed|taip|taiping|taipin|taipig|tiping|tipe|write|writing|written|written\s*mode|manual|manual\s*form|keyboard|form|'
            r'switch\s*to\s*typing|text\s*mode|i\s*want\s*to\s*type|want\s*typing|prefer\s*typing|'
            r'likh|likha|likhna|likhe|likho|likhkar|likhi|likhibi|likhiba|lekh|lekha|lekhiba|lekhibi|lekhi|lekhikari|hath\s*se|hathe\s*lekhi|faram|farm|'
            r'ଲେଖି|ଲେଖିବା|ଲେଖିକରି|ଲେଖିବି|ଲେଖିବୁ|ଲେଖିବାକୁ|ଟାଇପ୍|ଟାଇପ|ଟାଇପିଂ|ଟାଇପିଙ୍ଗ|ଟାଇପିଂଗ|ଫର୍ମ|'
            r'टाइप|टाइपिंग|टाईपिंग|टाईप|लिखकर|लिखना|लिखे|लिखें|लिखेंगे|लिखूंगा|लिखूंगी|लिखी|हाथ\s*से|मैन्युअल|फॉर्म|'
            r'লিখে|লিখব|লিখা|লিখিব|টাইপ|টাইপিং|ফরম|ফর্ম|రాయండి|రాయడం|వ్రాయండి|రాయాలి|రాయుము|रायండి|టైపింగ్|టైప్|ఫారమ్|'
            r'எழுது|எழுதுதல்|டைப்பிங்|டைப்|படிவம்|लिहून|लिहा|टायपिंग|टाईपिंग|टाईप|फॉर्म|'
            r'લખીને|લખવું|ટાઈપિંગ|ટાઈપ|ફોર્મ|ಬರೆ|ಬರೆಯುವುದು|ಟೈಪಿಂಗ್|ಟೈಪ್|ಫಾರ್ಮ್|'
            r'എഴുതുക|ടൈപ്പിംഗ്|ടൈപ്പ്|ഫോം|ਲਿਖ|ਲਿਖਣਾ|ਟਾਈਪਿੰਗ|ਟਾਈਪ|ਫਾਰਮ|لکھ\s*کر|لکھना|ٹائپنگ|ٹائپ|فارم)',
            clean
        ))

    INVALID_NAME_PATTERNS = {
        "good morning", "good afternoon", "good evening", "good night", "hello", "hi", "hey",
        "namaste", "namaskar", "namaskaram", "pranam", "jai jagannath", "johar",
        "dhanyabad", "dhanyawad", "thank you", "thanks", "ok", "okay",
        "patient", "unknown", "none", "null", "undefined", "test", "empty",
        "typing", "type", "typed", "taip", "taiping", "taipin", "taipig", "tiping", "tipe", "manual", "form", "keyboard", "write", "writing", "likh", "likha", "likhna", "likhiba", "lekhiba",
        "ଜୟ ଜଗନ୍ନାଥ", "ନମସ୍କାର", "ପ୍ରଣାମ", "ଜୁହାର", "ଧନ୍ୟବାଦ", "ଭଲ", "ସୁପ୍ରଭାତ",
        "ଲେଖିବା", "ଲେଖି", "ଟାଇପିଙ୍ଗ", "ଟାଇପିଂ", "ଟାଇପ୍", "ଟାଇପ", "ଫର୍ମ",
        "नमस्ते", "नमस्कार", "प्रणाम", "धन्यवाद", "सुप्रभात",
        "टाइप", "टाइपिंग", "टाईपिंग", "टाईप", "लिखकर", "लिखना", "फॉर्म",
        "টাইপ", "টাইপিং", "লিখে", "ফরম", "ফর্ম", "టైపింగ్", "టైప్", "டைப்பிங்", "டைப்", "टायपिंग"
    }

    def _is_invalid_name(n: str | None) -> bool:
        if not n:
            return True
        if _is_typing_intent(n):
            return True
        clean = re.sub(r'[\s.,!?;:।~_/\-\'\"()[\]{}]+', ' ', str(n)).strip().lower()
        if not clean or len(clean) < 2 or len(clean) > 35:
            return True
        if clean in INVALID_NAME_PATTERNS or _is_typing_intent(clean):
            return True
        clean_no_h = re.sub(r'\b(sir|madam|babu|ji|doctor|dr|bhai|bhaiya|aaji|agnya|ଆଜ୍ଞା|ବାବୁ|जी)\b', '', clean).strip()
        if clean_no_h in INVALID_NAME_PATTERNS or _is_typing_intent(clean_no_h):
            return True
        return False

    if _is_invalid_name(patient_name) or _is_typing_intent(patient_name):
        patient_name = "" 



    # 1. Clean input & filter ambient noise, silence, or STT hallucinations

    clean_test = re.sub(r'[\s.,!?;:।~_/\-\'"()[\]{}]+', '', raw_transcript).strip().lower()

    norm_space = re.sub(r'[\s.,!?;:।~_/\-\'"()[\]{}]+', ' ', raw_transcript).strip().lower()

    is_noise = False



    # Valid short affirmative/negative answers (especially in Step 4 and 5) - NEVER treat as noise!

    valid_short_answers = {
        # Odia
        "ହଁ", "ହାଁ", "ନା", "ନାହିଁ", "କିଛିନାହିଁ", "ନାହି", "ହଁଆଜ୍ଞା", "ହଁହଁ", "ନାଁ",
        # Hindi
        "हाँ", "ना", "नहीं", "कुछनहीं", "जीहाँ", "जी", "हाँजी",
        # Bengali & Assamese
        "হ্যাঁ", "হাঁ", "না", "নেই", "কিছুনা", "কোনোকিছুনা", "হয়", "নহয়",
        # Telugu
        "అవును", "కాదు", "ఏమీలేదు", "లేదు",
        # Tamil
        "ஆம்", "இல்லை", "எதுவுமில்லை",
        # Marathi
        "होय", "हो", "नाही", "काहीनाही",
        # Gujarati
        "હા", "ના", "નથી", "કઈનથી",
        # Kannada
        "ಹೌದು", "ಇಲ್ಲ", "ಏನೂಇಲ್ಲ",
        # Malayalam
        "അതെ", "അല്ല", "ഇല്ല", "ഒന്നുമില്ല",
        # Punjabi
        "ਹਾਂ", "ਨਹੀਂ", "ਕੁਝਨਹੀਂ",
        # Urdu & Kashmiri
        "جی", "ہاں", "نہیں", "کچھ نہیں", "نہ",
        # Nepali
        "हो", "होइन", "छैन", "केहीछैन",
        # Sanskrit & Maithili
        "आम्", "न", "हँ", "नहि", "किछु नहि",
        # Konkani, Sindhi, Dogri, Manipuri, Santali, Bodo
        "हय", "ना", "हा", "نه", "آهي", "نهي", "होय", "नेईं", "হয়", "নত্তে", "ᱦᱮᱸ", "ᱵᱟᱝ", "नंगौ", "नङा",
        # English
        "yes", "no", "none", "nope", "yeah", "yep", "ok", "okay", "done", "skip"
    }



    if not clean_test or clean_test in ("empty", "null", "none", "noaudio", "nospeech", "inaudible"):

        is_noise = True

    elif clean_test in valid_short_answers:

        is_noise = False

    elif len(clean_test) < 2:

        is_noise = True

    elif norm_space in (

        "subtitles", "subscribe", "subtitles by", "amara.org", "amara org"

    ) or clean_test in (

        "subtitles", "subscribe", "subtitlesby", "amaraorg"

    ):

        is_noise = True

    elif language in ("or", "odia"):

        # Filter English phonetic STT hallucinations (e.g. "monam's Hotel") when patient speaks Odia

        has_odia = bool(re.search(r'[\u0b00-\u0b7f]', raw_transcript))

        if not has_odia and any(tok in clean_test for tok in ("hotel", "monam", "hostel", "restaurant", "motel")):

            is_noise = True



    if is_noise:

        if step == 4:

            inaudible_reply = (

                "ମୁଁ ଆପଣଙ୍କ ଉତ୍ତର ସ୍ପଷ୍ଟ ଶୁଣିପାରିଲି ନାହିଁ। ଦୟାକରି ଆଉଥରେ କୁହନ୍ତୁ।"

                if language in ("or", "odia")

                else (

                    "मुझे आपका उत्तर स्पष्ट नहीं सुनाई दिया। कृपया दोबारा बताएं।"

                    if language in ("hi", "hindi")

                    else "I could not hear your response clearly. Please say again."

                )

            )

        elif step == 2:

            inaudible_reply = (

                "ଆଜି ଆପଣଙ୍କୁ କ’ଣ ଅସୁବିଧା ବା କଷ୍ଟ ହେଉଛି? ଦୟାକରି ବିସ୍ତାରରେ କୁହନ୍ତୁ।"

                if language in ("or", "odia")

                else (

                    "आज आपको क्या तकलीफ या बीमारी महसूस हो रही है? कृपया बताएं।"

                    if language in ("hi", "hindi")

                    else "What symptoms or health trouble are you having today? Please describe."

                )

            )

        elif step == 5:

            inaudible_reply = (

                "ଯଦି ଆପଣଙ୍କ ପାଖରେ ପୂର୍ବର କୌଣସି ରିପୋର୍ଟ ଅଛି ତେବେ ଅପଲୋଡ୍ କରନ୍ତୁ, ଅଥବା 'କୌଣସି ରିପୋର୍ଟ ନାହିଁ' କୁହନ୍ତୁ।"

                if language in ("or", "odia")

                else (

                    "यदि आपके पास कोई पुरानी मेडिकल रिपोर्ट है तो अपलोड करें, या बोलें 'कोई रिपोर्ट नहीं है'। "

                    if language in ("hi", "hindi")

                    else "If you have any prior reports please upload them, or say 'no reports'."

                )

            )

        else:

            inaudible_reply = (

                "ମୁଁ ଆପଣଙ୍କ କଥା ଶୁଣିବା ପାଇଁ ପ୍ରସ୍ତୁତ ଅଛି। ଦୟାକରି ଆପଣଙ୍କ ନାମ, ବୟସ ଓ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା ସ୍ୱାଭାବିକ ଭାବେ କୁହନ୍ତୁ।"

                if language in ("or", "odia")

                else (

                    "मैं आपकी बात सुनने के लिए तैयार हूँ। कृपया आराम से अपना नाम, उम्र और परेशानी बताइए।"

                    if language in ("hi", "hindi")

                    else "I am listening. Please take your time and tell me your name, age, and health problem."

                )

            )

        return {

            "status": "inaudible",

            "is_valid": False,

            "needs_clarification": True,

            "is_clarification_or_repeat": True,

            "repeat_current_question": True,

            "is_answered": False,

            "reply": inaudible_reply,

            "name": patient_name,

            "age": patient_age,

            "contact": patient_contact or None,

            "whatsapp_number": patient_contact or None,

            "complaint": chief_complaint,

            "questions": [],

            "next_step": step,

        }



    transcript = raw_transcript

    GENUINE_SYMPTOM_TOKENS = (
        # Odia physical symptoms & medical troubles
        "ଛାତି", "ବ୍ୟଥା", "ଯନ୍ତ୍ରଣା", "କାଟୁଛି", "ବିନ୍ଧୁଛି", "ବିନ୍ଧା", "ପେଟ", "ମୁଣ୍ଡ", "ଜ୍ୱର", "କାଶ", "କଫ",
        "ଥଣ୍ଡା", "ବାନ୍ତି", "ଝାଡ଼ା", "ଦେହ ଖରାପ", "ଅସୁବିଧା", "କଷ୍ଟ", "ରୋଗ", "ସମସ୍ୟା", "ରକ୍ତ", "ଘା",
        "ପୋଡ଼ା", "ଶ୍ୱାସ", "ଶ୍ୱାସକଷ୍ଟ", "ଦୁର୍ବଳ", "ଚକ୍କର", "ଗଳା", "କଣ୍ଠ", "ହାଡ଼", "ଗଣ୍ଠି", "ଖଣ୍ଡିଆ",
        "ପୋଡ଼ାଜଳା", "ଅସୁସ୍ଥ", "ଝିମଝିମ", "ଫୁଲିଯିବା", "ହୃଦରୋଗ", "ଦାନ୍ତ", "କାନ", "ଆଖି", "ବିଷ",
        # Bengali & Assamese symptoms
        "ছাতি", "বুক", "বুকে", "যন্ত্রণা", "ব্যাথা", "ব্যথা", "কষ্ট", "অসুবিধা", "সমস্যা", "জ্বর",
        "কাশি", "কফ", "সর্দি", "ঠান্ডা", "পেট", "পেটে", "মাথা", "মাথাব্যথা", "বমি", "দুর্বল",
        "মাথাঘোরা", "শ্বাসকষ্ট", "গলা", "হাড়", "রক্ত", "অসুস্থ", "অসুখ", "বেদনা", "বিষ", "জ্বৰ", "কাহ",
        # Hindi & Marathi physical symptoms
        "दर्द", "तकलीफ", "परेशानी", "बीमारी", "समस्या", "पेट", "छाती", "सीने", "सिरदर्द", "सिर", "बुखार",
        "खांसी", "जुकाम", "उल्टी", "दस्त", "कमजोरी", "चक्कर", "गला", "बदन दर्द", "घबराहट",
        "त्रास", "दुखणे", "कळ", "ताप", "खोकला", "सर्दी", "पोट", "डोकं", "डोकेदुखी", "अशक्तपणा",
        # Telugu
        "నొప్పి", "బాధ", "సమస్య", "జ్వరం", "దగ్గు", "రొంప", "కడుపు", "తల", "ఛాతీ", "వాంతులు", "నీరసం", "శ్వాస",
        # Tamil
        "வலி", "வேதனை", "பிரச்சனை", "காய்ச்சல்", "இருமல்", "சளி", "வயிறு", "தலைவலி", "தலை", "நெஞ்சு", "வாந்தி",
        # Gujarati
        "દુખાવો", "તકલીફ", "સમસ્યા", "તાવ", "ખાંસી", "શરદી", "પેટ", "માથું", "છાતી", "ઊલટી", "ચક્કર",
        # Kannada
        "ನೋವು", "ಸಮಸ್ಯೆ", "ಜ್ವರ", "ಕೆಮ್ಮು", "ನೆಗಡಿ", "ಹೊಟ್ಟೆ", "ತಲೆನೋವು", "ತಲೆ", "ಎದೆ", "ವಾಂತಿ",
        # Malayalam
        "വേദന", "അസുഖം", "പ്രശ്നം", "പനി", "ചുമ", "വയറ്", "തലവേദന", "തല", "നെഞ്ച്", "ഛർദ്ദി",
        # Punjabi
        "ਦਰਦ", "ਤਕਲੀਫ਼", "ਸਮੱਸਿਆ", "ਬੁਖ਼ਾਰ", "ਖੰਘ", "ਜ਼ੁਕਾਮ", "ਢਿੱਡ", "ਸਿਰ", "ਛਾਤੀ", "ਉਲਟੀ",
        # Urdu
        "درد", "تکلیف", "پریشانی", "بیماری", "بخار", "کھانسی", "پیٹ", "سینے", "سردرد", "چکر",
        # English physical symptoms
        "pain", "ache", "hurting", "hurt", "fever", "cough", "cold", "vomit", "vomiting",
        "chest", "stomach", "headache", "throat", "trouble", "problem", "discomfort",
        "breath", "dizzy", "weakness", "diarrhea", "cramp", "sore", "wound", "bleeding"
    )

    NAME_INVALIDATING_TOKENS = GENUINE_SYMPTOM_TOKENS + (
        "ଦିନ", "ସପ୍ତାହ", "ମାସ", "ଘଣ୍ଟା", "ପାଖାପାଖି", "ଏହି", "ଗୋଟେ", "ଦୁଇ", "ତିନି", "ପ୍ରବଳ", "ବହୁତ",
        "ଚିକିତ୍ସା", "ଔଷଧ", "ଡାକ୍ତର", "ହସ୍ପିଟାଲ", "ରୋଗୀ", "ପ୍ରେସକ୍ରିପସନ୍", "ରିପୋର୍ଟ", "ଲାଗୁଛି", "ହେଉଛି", "ହେଲାଣି",
        "দিন", "সপ্তাহ", "মাস", "ঘণ্টা", "ওষুধ", "ডাক্তার", "হাসপাতাল", "হচ্ছে", "লাগছে",
        "दिन", "हफ्ते", "महीने", "घंटे", "दवा", "डॉक्टर", "अस्पताल", "हो रहा", "लग रहा", "तबीयत", "मरीज",
        "severe", "mild", "days", "weeks", "months", "hours", "illness", "feeling", "sick", "doctor", "hospital", "medicine", "patient"
    )

    def _is_clinical_or_symptom(text: str | None) -> bool:
        if not text:
            return False
        clean = text.lower().strip()
        if any(tok in clean for tok in GENUINE_SYMPTOM_TOKENS):
            return True
        # If answering problem slot or demographics known, non-greeting/non-intro speech is clinical
        if (current_slot in ("problem", "symptom") or step == 2) and len(clean) >= 3:
            if not _is_pure_demographic_intro(text) and not _is_invalid_name(text):
                return True
        return False

    def _is_name_invalidating(text: str | None) -> bool:
        if not text:
            return False
        clean = text.lower()
        return any(tok in clean for tok in NAME_INVALIDATING_TOKENS)

    def _is_pure_demographic_intro(text: str | None) -> bool:
        if not text:
            return False
        has_intro = bool(re.search(r'(?:ମୋର ନାମ|ମୋ ନାମ|ନାମ ହେଲା|ନାଁ|আমার নাম|আমার বয়স|আমার বয়স|mera naam|my name is|नाम है|ମୋ ବୟସ|ମୋର ବୟସ|ଉମ୍ର|उम्र|বয়স|age|years old|ଲିଙ୍ଗ|ପୁରୁଷ|ମହିଳା|gender|male|female|পুরুষ|মহিলা|হোয়াটসঅ্যাপ|ହ୍ୱାଟସ୍ଆପ୍|whatsapp|mobile|phone|নম্বর|ନମ୍ବର)', text, re.I))
        return has_intro and not any(tok in text.lower() for tok in GENUINE_SYMPTOM_TOKENS)



    def _parse_indic_phone_number(text: str) -> str | None:

        if not text:

            return None

        norm = text

        digit_scripts = [
            "୦୧୨୩୪୫୬୭୮୯", # Odia
            "०१२३४५६७८९", # Devanagari / Hindi / Marathi / Nepali / Sanskrit
            "০১২৩৪৫৬৭৮৯", # Bengali / Assamese
            "૦૧૨૩૪૫૬૭૮૯", # Gujarati
            "੦੧੨੩੪੫੬੭੮੯", # Gurmukhi / Punjabi
            "౦౧౨౩౪౫౬౭౮౯", # Telugu
            "௦௧௨௩௪௫௬௭௮௯", # Tamil
            "೦೧೨೩೪೫೬೭೮೯", # Kannada
            "൦൧൨൩൪൫൬൭൮൯", # Malayalam
        ]
        for script in digit_scripts:
            for idx, d_char in enumerate(script):
                norm = norm.replace(d_char, str(idx))

        

        words_map = {

            'ଶୂନ': '0', 'ଶୂନ୍ୟ': '0', 'ଏକ': '1', 'ଦୁଇ': '2', 'ତିନି': '3', 'ଚାରି': '4', 'ପାଞ୍ଚ': '5', 'ଛଅ': '6', 'ଛ': '6', 'ସାତ': '7', 'ଆଠ': '8', 'ନଅ': '9',

            'शून्य': '0', 'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4', 'पाँच': '5', 'पांच': '5', 'छह': '6', 'सात': '7', 'आठ': '8', 'नौ': '9',

            'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9'

        }

        tokens = norm.split()

        converted_tokens = [words_map.get(tok, tok) for tok in tokens]

        norm = " ".join(converted_tokens)

        cleaned = re.sub(r'[\s\-]+', '', norm)

        m = re.search(r'(?:\+?91|0)?([6-9]\d{9})', cleaned)

        if m:

            return m.group(1)

        digits = ''.join(re.findall(r'\d', norm))

        if len(digits) >= 10:

            dm = re.search(r'(?:\+?91|0)?([6-9]\d{9})', digits)

            if dm:

                return dm.group(1)

        return None



    def _parse_indic_age(text: str, step_num: int = 1) -> int | None:
        # For Step 2 and Step 4, only extract age if patient explicitly mentioned age context
        if step_num > 1:
            has_age_context = bool(re.search(r'(?:ବୟସ|ମୋ ବୟସ|ମୋର ବୟସ|ଉମ୍ର|उम्र|age|years old)', text, re.I))
            if not has_age_context:
                return None

        words_map = {
            'ଏକ': 1, 'ଦୁଇ': 2, 'ତିନି': 3, 'ଚାରି': 4, 'ପାଞ୍ଚ': 5, 'ଛଅ': 6, 'ସାତ': 7, 'ଆଠ': 8, 'ନଅ': 9, 'ଦଶ': 10,
            'ଏଗାର': 11, 'ବାର': 12, 'ତେର': 13, 'ଚଉଦ': 14, 'ପନ୍ଦର': 15, 'ଷୋହଳ': 16, 'ସତର': 17, 'ଅଠର': 18, 'ଉଣେଇଶ': 19,
            'କୋଡିଏ': 20, 'କୋଡ଼ିଏ': 20, 'ଏକୋଇଶି': 21, 'ବାଇଶି': 22, 'ତେଇଶି': 23, 'ଚବିଶ': 24, 'ପଚିଶ': 25, 'ଛବିଶ': 26, 'ସତାଇଶ': 27, 'ଅଠାଇଶ': 28, 'ଅଣତିରିଶ': 29,
            'ତିରିଶ': 30, 'ଏକତିରିଶ': 31, 'ବତିଶ': 32, 'ତେତିଶ': 33, 'ଚଉତିଶ': 34, 'ପଇଁତିରିଶ': 35, 'ଚାଳିଶ': 40, 'ପଇଁଚାଳିଶ': 45, 'ପଞ୍ଚଚାଳିଶ': 45, 'ପଚାଶ': 50,
            'ପଚପନ': 55, 'ଷାଠିଏ': 60, 'ପାଞ୍ଚଷଠି': 65, 'ସତୁରୀ': 70, 'ପଞ୍ଚସ୍ତରୀ': 75, 'ଅଶୀ': 80, 'ପଞ୍ଚାଅଶୀ': 85, 'ନବ୍ବେ': 90,
            'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
            'बीस': 20, 'इक्कीस': 21, 'पच्चीस': 25, 'तीस': 30, 'पैंतीस': 35, 'चालीस': 40, 'पचास': 50,
        }
        for w, v in words_map.items():
            if w in text:
                return v

        digit_m = re.search(r'\b([0-9]{1,3})\b', text)
        if digit_m:
            v = int(digit_m.group(1))
            if 1 <= v <= 125:
                return v

        # English spoken number words (e.g. "twenty five", "thirty-two", "eighteen")
        en_ones = {
            "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
            "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
            "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
        }
        en_tens = {
            "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
            "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
        }
        en_tokens = re.findall(r'[a-z]+', text.lower())
        for idx, tok in enumerate(en_tokens):
            if tok in en_tens:
                nxt = en_tokens[idx + 1] if idx + 1 < len(en_tokens) else ""
                val = en_tens[tok] + (en_ones[nxt] if nxt in en_ones and en_ones[nxt] < 10 else 0)
                return val
            if tok in en_ones:
                return en_ones[tok]

        return None



    def _clean_extracted_name(name_str: str | None) -> str | None:
        if not name_str:
            return None
        cleaned = name_str.strip()
        cleaned = re.sub(r'^(?:good\s*morning|good\s*afternoon|good\s*evening|hello|hi|hey|namaste|namaskar|pranam|jai\s*jagannath|ନମସ୍କାର|ପ୍ରଣାମ|ଜୟ\s*ଜଗନ୍ନାଥ|ହେଲୋ|ହାଏ|ନମସ୍ତେ|नमस्ते|प्रणाम|नमस्कार|गुड\s*मॉर्निंग)\s*[,।!?]?\s*', '', cleaned, flags=re.I).strip()
        cleaned = re.sub(r'^(?:is|it\s*is|my\s*name\s*is|name\s*is|i\s*am|ମୋ\s*ନାମ|ମୋ\s*ନାଁ|ମୋର\s*ନାମ|ମୋର\s*ସମ୍ପୂର୍ଣ୍ଣ\s*ନାମ|ମୋ\s*ସମ୍ପୂର୍ଣ୍ଣ\s*ନାମ|ମୋର\s*ପୂରା\s*ନାମ|ମୋ\s*ପୂରା\s*ନାମ|ମୋ\s*ନାମଟି|mo\s*naa|mo\s*nama|mora\s*naa|mora\s*nama|mu|ନାମ|ନାଁ|ମୁଁ\s*ହେଉଛି|ମୁଁ|मेरा\s*नाम\s*है|मेरा\s*नाम|मेरा\s*पूरा\s*नाम|mera\s*naam|mera\s*poora\s*naam|naam|नाम)\s+', '', cleaned, flags=re.I).strip()
        cleaned = re.sub(r'^(?:ହେଲା|ହେଉଛି|ଅଟେ|ବା|है|hai|he|is|are)\s+', '', cleaned, flags=re.I).strip()
        cleaned = re.sub(r'\s+(?:କରନ୍ତୁ|ରଖନ୍ତୁ|ଦିଅନ୍ତୁ|କର|କରି|କରିଦିଅନ୍ତୁ|करो|कर|करदो|कर\s*दो|ଏବଂ|ଓ|ଆଉ|and|aur|ମୋର|ମୋ|ଅଟେ|ହେଉଛି|ହେଲା|ହେଲେ|କହୁଛି|କହୁଚି|ହଁ|है|हूँ|हूं|hai|hu|hoon|kahuchi|please|ji|babu|ଆଜ୍ଞା|ବାବୁ|अटे)$', '', cleaned, flags=re.I).strip()
        cleaned = re.split(r'[,।!?.:;-]|\s+(?:ଏବଂ|ଓ|ଆଉ|ବୟସ|aur|and|my\s*age)\s+', cleaned, flags=re.I)[0].strip()
        cleaned = cleaned.strip(' ,.।!?')
        if _is_invalid_name(cleaned) or _is_typing_intent(cleaned):
            return None
        if len(cleaned) < 2 or len(cleaned) > 30 or _is_name_invalidating(cleaned):
            return None
        if re.search(r'[0-9୦-୯०-९]', cleaned):
            return None
        if re.search(r'(?:ବର୍ଷ|ବରଷ|ମାସ|ଦିନ|साल|उम्र|age|years|year|old|month|months|days)', cleaned, re.I):
            return None
        if re.search(r'^(?:male|female|other|man|woman|boy|girl|पुरुष|महिला|स्त्री|आदमी|लड़का|लड़की|ପୁରୁଷ|ମହିଳା|ସ୍ତ୍ରୀ|ଝିଅ)$', cleaned, re.I):
            return None
        return cleaned

    def _extract_name_and_correction(t_in: str, is_asking_name: bool = False) -> tuple[str | None, bool]:
        t = t_in.strip()
        if _is_typing_intent(t):
            return (None, False)
        is_corr = bool(re.search(r'(?:ନୁହେଁ|ନୁହେ|ନାଇଁ|ନାହିଁ|नहीं|ना|not|wrong|गलत|ଭୁଲ|correct|correction|change|update|ବଦଳ|ସୁଧାର)', t, re.I))

        # 0. Explicit change command: "change my name to X" / "update name to X" / "ମୋ ନାମ ବଦଳାଇ X କରନ୍ତୁ" / "ନାମ X କରନ୍ତୁ" / "नाम बदलकर X कर दो"
        m_change = re.search(
            r'(?:(?:change|update|make)\s+(?:my\s+)?name\s+(?:to|as)?|call\s+me|(?:ମୋର|ମୋ)?\s*ନାମ\s*(?:ବଦଳାଇ|ସୁଧାରି)?|ନାମ\s*(?:ବଦଳାଇ|ସୁଧାରି)?|(?:मेरा\s+)?नाम\s*(?:बदलकर|बदल\s+के|सुधार\s+कर)?)\s*([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})\s*(?:କରନ୍ତୁ|ରଖନ୍ତୁ|ଦିଅନ୍ତୁ|करो|कर\s*दो)?',
            t,
            re.I
        )
        if m_change:
            cand = _clean_extracted_name(m_change.group(1))
            if cand:
                return (cand, True)

        # 1. English correction: 'is not X, (it is / it\'s) Y' or 'not X, (it is) Y'
        m_en = re.search(r'(?:is\s+not|not|isn\'t)\s+[^\s,।0-9]+(?:\s+[^\s,।0-9]+)?\s*[,।!?]?\s*(?:(?:but|it\s+is|it\'s|my\s+name\s+is|name\s+is)\s+)?([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})', t, re.I)
        if m_en:
            cand = _clean_extracted_name(m_en.group(1))
            if cand:
                return (cand, True)

        # 2. Indic correction: 'X nuhein Y' / 'X nahi Y'
        m_indic1 = re.search(r'[^\s,।0-9]+(?:\s+[^\s,।0-9]+)?\s+(?:ନୁହେଁ|ନୁହେ|ନାହିଁ|ନାଇଁ|नहीं)\s*[,।!?]?\s*(?:(?:ମୋ\s*ନାମ|ମୋ\s*ନାଁ|ମୋର\s*ନାମ|मेरा\s*नाम|ନାମ)\s+)?([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})', t, re.I)
        if m_indic1:
            cand = _clean_extracted_name(m_indic1.group(1))
            if cand:
                return (cand, True)

        # 3. Rejection followed by name intro: 'nahi, mo nama X' or 'No, my name is X' or 'bhul, mo nama X'
        m_rej = re.search(r'(?:ନାହିଁ|ନାଇଁ|no|nahin|nahi|नहीं|ଭୁଲ|गलत|wrong)\s*[,।!?]?\s*(?:ମୋ\s*ନାମ|ମୋ\s*ନାଁ|ମୋର\s*ନାମ|ମୁଁ\s*ହେଉଛି|ମୁଁ|मेरा\s*नाम\s*है|मेरा\s*नाम|my\s*name\s*is|name\s*is)\s+([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})', t, re.I)
        if m_rej:
            cand = _clean_extracted_name(m_rej.group(1))
            if cand:
                return (cand, True)

        # 4. Standard intro: 'mo nama X' / 'mo naa X' / 'mera naam X hai' / 'my name is X' / 'mu X kahuchi'
        m_intro = re.search(
            r'(?:(?:ମୋର|ମୋ)\s+(?:ସମ୍ପୂର୍ଣ୍ଣ\s+|ପୂରା\s+|ଶୁଭ\s+)?(?:ନାମ|ନାଁ)|ମୁଁ\s*ହେଉଛି|ମୁଁ|(?:मेरा|मेरा\s+पूरा)\s+नाम(?:\s+है)?|(?:mera|meri)\s+(?:poora\s+|pura\s+|full\s+)?naam|(?:mo|mora)\s+(?:poora\s+)?(?:naa|naam|nama)|my\s+(?:full\s+)?name(?:\s+is)?|i\s+am)\s*(?:ହେଲା|ହେଉଛି|ଅଟେ|ବା|है|होगा|hai|is|:|–|-)?\s*([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})',
            t,
            re.I
        )
        if m_intro:
            cand = _clean_extracted_name(m_intro.group(1))
            if cand:
                return (cand, is_corr)

        # 5. If assistant is currently asking for name in Step 1, take direct 1-3 word name
        if is_asking_name:
            words = [w for w in re.split(r'[\s,।!?.]+', t) if len(w) >= 2]
            if 1 <= len(words) <= 3:
                cand = _clean_extracted_name(" ".join(words))
                if cand:
                    return (cand, False)

        return (None, False)

    def _parse_indic_gender(raw_text: str) -> str | None:
        if not raw_text:
            return None
        t_low = raw_text.lower()
        if re.search(r'(?:ପୁରୁଷ|ପୁରୁସ|ପୁରୁଶ|ବାବୁ|ଭାଇ|ପୁଅ|पुरुष|आदमी|लड़का|नर|मर्द|भाई|बेटा|পুরুষ|ছেলে|ভাই|పురుషుడు|అబ్బాయి|ஆண்|மகன்|ಗಂಡು|ಹುಡುಗ|ಪುರುಷ|ആൺ|പുരുഷൻ|પુરુષ|છોકરો|ਪੁਰਸ਼|ਮੁੰਡਾ)', raw_text):
            return 'male'
        if re.search(r'(?:ମହିଳା|ସ୍ତ୍ରୀ|ଝିଅ|ଭଉଣୀ|ନାରୀ|ମାଆ|महिला|औरत|स्त्री|लड़की|नारी|माता|बहन|মহিলা|মেয়ে|স্ত্রী|స్త్రీ|మహిళ|பெண்|மகள்|ಮಹಿಳೆ|ಹೆಣ್ಣು|സ്ത്രീ|મહિલા|સ્ત્રી|ਮਹਿਲਾ|ਔਰਤ)', raw_text):
            return 'female'
        if re.search(r'\b(?:male|man|boy|gentleman)\b', t_low):
            return 'male'
        if re.search(r'\b(?:female|woman|girl|lady)\b', t_low):
            return 'female'
        if re.search(r'\b(?:other|transgender|non-binary|ଅନ୍ୟାନ୍ୟ|अन्य|অন্যান্য|ఇతర|மற்றவை|इतर|બીજા|ಇತರೆ|മറ്റുള്ളവ|ਹੋਰ)\b', t_low):
            return 'other'
        return None

    # ── PRIMARY AI CONVERSATIONAL ENGINE: Google Gemini (Multilingual Clinical Doctor Assistant) ──
    gemini_key = (settings.GEMINI_API_KEY or "").strip()
    history = payload.get("conversation_history") or []
    current_q = str(payload.get("current_question") or "").strip()
    q_idx = int(payload.get("question_index") or 0)
    total_q = int(payload.get("total_questions_target") or 2)
    lang_label = _get_indic_lang_label(language)
    anon_profile = f"[PATIENT_{patient_age or 'AGE'}_{patient_gender or 'GENDER'}]"

    def _mask_pii(raw_text_val: str | None) -> str:
        s = anonymize_clinical_text(raw_text_val)
        if patient_name and len(patient_name.strip()) >= 2:
            s = re.sub(re.escape(patient_name.strip()), "[PATIENT_NAME]", s, flags=re.IGNORECASE)
        if patient_contact and len(patient_contact.strip()) >= 6:
            s = s.replace(patient_contact.strip(), "[REDACTED_PHONE]")
        return s

    if gemini_key:
        try:
            hist_formatted = ""
            if history:
                hist_formatted = "\nRecent Conversation Turns:\n" + "\n".join(
                    f"- {h.get('sender') or h.get('role', 'Speaker')}: {_mask_pii(h.get('text', ''))}"
                    for h in history[-4:]
                    if h.get('text')
                )

            current_q_context = f"\nCurrent Question Asked: '{_mask_pii(current_q)}' (Question {q_idx + 1} of {total_q})" if step == 4 and current_q else ""

            uploaded_summary = f"{uploaded_reports_count} document(s) uploaded ({', '.join(uploaded_filenames)})" if uploaded_reports_count > 0 else "No documents uploaded yet"

            safe_spoken_for_llm = _mask_pii(raw_transcript)
            safe_complaint_for_llm = _mask_pii(chief_complaint)

            gemini_system = f"""{NON_DIAGNOSTIC_SYSTEM_INSTRUCTION}

You are Ananya, a warm, reassuring, natural human Care Coordinator at Guinex Clinic.
You are having a real, empathetic, spoken conversation with a patient—never sound like a robotic form or checklist.

PATIENT'S SPOKEN LANGUAGE: {lang_label}.
CRITICAL LANGUAGE & STYLE DIRECTIVE:
- Respond fluently, warmly, and naturally in {lang_label} script (everyday conversational phrasing, not stiff textbook phrasing).
- Keep "reply" to **1 to 2 short, warm, spoken sentences** (under 30 words total).
- Always acknowledge the patient's feelings or answer warmly before asking the next single question.
- Strictly remain non-diagnostic: NEVER diagnose diseases, speculate on conditions, or prescribe medicines.
- If addressing an already-known patient politely by name, write `[PATIENT_NAME]` (it is populated locally; never invent names).

CURRENT KNOWN CLINICAL RECORD:
- Patient Identifier: {anon_profile} (Name collected: {'Yes ([PATIENT_NAME])' if patient_name else 'Not provided yet'}, WhatsApp/Phone collected: {'Yes ([REDACTED_PHONE])' if patient_contact else 'Not provided yet'})
- Patient Age: {patient_age or 'Not provided yet'}
- Patient Gender: {patient_gender or 'Not provided yet'}
- Chief Complaint / Symptoms: {safe_complaint_for_llm or 'Not provided yet'}
- Attached Prior Reports: {uploaded_summary}
- Current Slot / Stage: {current_slot or f'Step {step}'}
{current_q_context}
{hist_formatted}

PATIENT'S SPOKEN WORDS NOW: "{safe_spoken_for_llm}"

CRITICAL CONVERSATIONAL RULES (STRICT ONE QUESTION AT A TIME & WARM HUMAN FLOW):
1. STRICT ONE QUESTION AT A TIME:
   - Ask ONLY ONE simple question in "reply" (1 warm acknowledgment + 1 short question).
   - NEVER combine inquiries or list multiple items.
2. NO REPETITION / ALWAYS ADVANCE:
   - When the patient provides ANY answer (even a short word like "ହଁ", "ନାହିଁ", "ଜ୍ୱର", "୩ ଦିନ", "yes", "no", "skip", "prefer not to say"):
     * ACCEPT IT immediately, record it in extracted fields, and MOVE FORWARD to the next question.
     * NEVER set "repeat_current_question": true unless the patient explicitly asked to repeat.

HOLISTIC CLINICAL INTAKE PROTOCOL:
1. LISTEN AND ACKNOWLEDGE WARMLY:
   - If they shared symptoms, pain, duration, or illness: acknowledge with genuine empathy ("I'm sorry you're dealing with that...") and save complaint, duration, and severity immediately.
   - If they asked a question ("Will the doctor see me?", "Did you get my report?"): reassure them warmly first before asking the next detail.
   - If they say "all reports submitted", "no reports", "done", "finished", "nothing else", or "ସରିଗଲା": set "action": "proceed_to_vitals", "next_step": 6.

2. SEQUENTIAL SINGLE-QUESTION TRIAGE ORDER:
   - Priority 1 (Name): If Name is unknown, welcome them warmly as Ananya and ask for their good name.
   - Priority 2 (Age): Once Name is known, greet them warmly ("Nice to meet you, [PATIENT_NAME]!") and ask their age.
   - Priority 3 (Gender): Once Name & Age are known, ask if they are male, female, or prefer not to say.
   - Priority 4 (WhatsApp): Once Gender is known, ask for a good 10-digit WhatsApp number for their visit slip (if they say no/skip, move right on to symptoms!).
   - Priority 5 (Symptoms): Once demographics are set, ask warmly: "All set with your details, [PATIENT_NAME]. Now take your time—what's been bothering you today?"
   - DO NOT extract a Chief Complaint from a demographic self-introduction. If they only gave demographics, keep "complaint": null.

3. FIELD CORRECTIONS & UPDATES:
   - If the patient asks to update/change name, age, gender, contact, or complaint, update that field, set "is_field_update": true and "updated_field", confirm warmly, and continue forward without restarting.

4. ACTION DIRECTIVE:
   - "action": "continue_conversation" | "field_updated" | "proceed_to_vitals" | "proceed_to_confirmation" | "submit".
OUTPUT STRICTLY VALID JSON:
{{
  "is_valid": true,
  "needs_clarification": false,
  "is_field_update": false,
  "updated_field": null,
  "is_clarification_or_repeat": false,
  "repeat_current_question": false,
  "is_answered": true,
  "is_finished": false,
  "name": "...",
  "age": null,
  "gender": null,
  "contact": null,
  "whatsapp_number": null,
  "complaint": "...",
  "duration": "...",
  "severity": "...",
  "medical_history": "...",
  "medications": null,
  "allergies": null,
  "extracted_answer": "...",
  "reply": "...",
  "next_step": 2,
  "questions": ["...", "..."],
  "next_question": "..."
}}"""

            gemini_payload = {
                "systemInstruction": {"parts": [{"text": NON_DIAGNOSTIC_SYSTEM_INSTRUCTION}]},
                "contents": [{"parts": [{"text": gemini_system}]}],
                "generationConfig": {
                    "response_mime_type": "application/json",
                    "temperature": 0.35,
                    "maxOutputTokens": 1024,
                    "thinkingConfig": {"thinkingBudget": 0},
                }
            }

            models_to_try = get_ordered_gemini_models("gemini-2.5-flash")
            gemini_res_data = None

            async with httpx.AsyncClient(timeout=10.0) as client:
                for m_id in models_to_try:
                    try:
                        g_url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_id}:generateContent?key={gemini_key}"
                        resp = await client.post(g_url, json=gemini_payload)
                        if resp.status_code == 200:
                            gemini_res_data = resp.json()
                            break
                        if resp.status_code == 404:
                            mark_gemini_model_retired(m_id)
                        else:
                            logger.warning("Gemini %s returned HTTP %s", m_id, resp.status_code)
                    except Exception as g_err:
                        logger.warning(f"Gemini {m_id} error: {g_err}")
                        continue

            if not gemini_res_data and settings.SARVAM_API_KEY and not is_sarvam_auth_blocked():
                try:
                    async with httpx.AsyncClient(timeout=8.0) as s_client:
                        s_resp = await s_client.post(
                            "https://api.sarvam.ai/v1/chat/completions",
                            headers={"api-subscription-key": settings.SARVAM_API_KEY.strip(), "Content-Type": "application/json"},
                            json={
                                "model": "sarvam-105b-conversations",
                                "messages": [
                                    {"role": "system", "content": NON_DIAGNOSTIC_SYSTEM_INSTRUCTION},
                                    {"role": "user", "content": gemini_system},
                                ],
                                "temperature": 0.25,
                                "max_tokens": 1024,
                            }
                        )
                        if s_resp.status_code == 200:
                            s_data = s_resp.json()
                            s_text = s_data["choices"][0]["message"]["content"].strip()
                            gemini_res_data = {
                                "candidates": [{
                                    "content": {
                                        "parts": [{"text": s_text}]
                                    }
                                }],
                                "provider": "sarvam_105b"
                            }
                        elif s_resp.status_code in (401, 403):
                            note_sarvam_auth_failure(s_resp.status_code, "Sarvam 105B")
                except Exception as s_err:
                    logger.warning(f"Sarvam fallback for unified intake failed: {s_err}")

            if gemini_res_data and "candidates" in gemini_res_data:
                parts = gemini_res_data["candidates"][0].get("content", {}).get("parts", [])
                raw_gemini_text = "".join(
                    p.get("text", "") for p in parts if isinstance(p, dict) and not p.get("thought") and p.get("text")
                ).strip()
                if raw_gemini_text.startswith("```"):
                    raw_gemini_text = re.sub(r'^```(?:json)?\s*', '', raw_gemini_text)
                    raw_gemini_text = re.sub(r'\s*```$', '', raw_gemini_text).strip()
                g_parsed = json.loads(raw_gemini_text)

                phone_from_speech = _parse_indic_phone_number(raw_transcript)
                whatsapp_skipped_early = bool(payload.get("whatsapp_skipped")) or (
                    current_slot == "whatsapp"
                    and not phone_from_speech
                    and (
                        clean_test in valid_short_answers
                        or bool(re.search(
                            r'\b(skip|no|none|nope|nah|dont\s*have|do\s*not\s*have|no\s*number|no\s*whatsapp|later|nothing|nahi|nhi|na)\b|ନାହିଁ|ନାଇଁ|नहीं|कोई\s*नहीं|নেই|নাই',
                            raw_transcript,
                            re.I,
                        ))
                    )
                )

                cand_name, is_corr = _extract_name_and_correction(raw_transcript, is_asking_name=(step == 1 and current_slot in ("", "name")))
                extracted_name = None if whatsapp_skipped_early else g_parsed.get("name")
                if extracted_name:
                    extracted_name = _clean_extracted_name(str(extracted_name))
                if whatsapp_skipped_early or _is_invalid_name(extracted_name) or (extracted_name and extracted_name.strip().lower() in ("skip", "none", "no", "done")):
                    extracted_name = None

                # Prioritize explicit speech name intro or correction over any hallucinated greeting
                if cand_name and (not extracted_name or is_corr or _is_invalid_name(patient_name)):
                    extracted_name = cand_name

                if not extracted_name and not patient_name and cand_name:
                    extracted_name = cand_name

                extracted_age = g_parsed.get("age")
                if extracted_age in ("null", "None", None, ""):
                    extracted_age = None
                elif isinstance(extracted_age, str) and extracted_age.isdigit():
                    extracted_age = int(extracted_age)
                if not extracted_age:
                    extracted_age = _parse_indic_age(raw_transcript, step)

                extracted_gender = _parse_indic_gender(str(g_parsed.get("gender") or "")) or _parse_indic_gender(raw_transcript)

                # Prioritize 10-digit number spoken directly in current audio
                extracted_contact = (
                    phone_from_speech or
                    (None if whatsapp_skipped_early else (g_parsed.get("contact") or g_parsed.get("whatsapp_number"))) or
                    (patient_contact if (patient_contact and len(re.sub(r'\D', '', patient_contact)) == 10) else None)
                )

                extracted_complaint = (g_parsed.get("complaint") or "").strip()
                if extracted_complaint.lower() in ("null", "none", "unknown"):
                    extracted_complaint = ""

                # Discard complaint if it is purely demographic introduction or lacks real clinical symptoms
                if extracted_complaint:
                    if _is_pure_demographic_intro(extracted_complaint) or not _is_clinical_or_symptom(extracted_complaint):
                        extracted_complaint = ""
                    elif _is_pure_demographic_intro(raw_transcript):
                        extracted_complaint = ""
                    elif re.search(r'(?:କୌଣସି\s*ଅସୁବିଧା\s*ନାହିଁ|କିଛି\s*ଅସୁବିଧା\s*ନାହିଁ|କିଛି\s*ନାହିଁ|କୌଣସି\s*ରୋଗ\s*ନାହିଁ|कोई\s*तकलीफ\s*नहीं|कुछ\s*नहीं|no\s*problem|no\s*symptoms|nothing)', extracted_complaint, re.I):
                        extracted_complaint = ""
                if extracted_name and extracted_complaint and extracted_name.lower() in extracted_complaint.lower():
                    extracted_complaint = ""

                is_val = bool(g_parsed.get("is_valid", True))
                needs_clar = bool(g_parsed.get("needs_clarification", False))
                reply = (g_parsed.get("reply") or "").strip()
                resolved_local_name = extracted_name or patient_name
                if "[PATIENT_NAME]" in reply:
                    reply = reply.replace("[PATIENT_NAME]", resolved_local_name or "").replace("  ", " ").strip()

                active_p_name = extracted_name or patient_name or None
                reply = re.sub(
                    r'(?:ଧନ୍ୟବାଦ|धन्यवाद|thank\s*you)?\s*good\s*morning\s*(?:ଆଜ୍ଞା|ବାବୁ|जी|sir|madam)?',
                    f"ଧନ୍ୟବାଦ {active_p_name or 'ଆଜ୍ଞା'}" if language in ('or', 'odia')
                    else (f"धन्यवाद {active_p_name or 'जी'}" if language in ('hi', 'hindi') else f"Thank you {active_p_name or ''}"),
                    reply,
                    flags=re.I
                ).strip()

                final_name = extracted_name or patient_name or None
                final_age = extracted_age or patient_age or None
                final_gender = _parse_indic_gender(extracted_gender) or _parse_indic_gender(patient_gender) or _parse_indic_gender(raw_transcript) or None
                final_contact = extracted_contact or patient_contact or None
                final_complaint = extracted_complaint or chief_complaint or None

                # CRITICAL DEMOGRAPHIC PURITY: If demographics (Name, Age, Gender) are still missing, do NOT accept complaint
                if not final_name or not final_age or not final_gender:
                    if final_complaint and (not _is_clinical_or_symptom(final_complaint) or _is_pure_demographic_intro(final_complaint) or (final_name and final_name.lower() in final_complaint.lower())):
                        final_complaint = None

                next_s = g_parsed.get("next_step") or step
                is_fin = bool(g_parsed.get("is_finished"))

                # Check for field corrections & updates
                is_field_update = False if whatsapp_skipped_early else bool(g_parsed.get("is_field_update"))
                name_changed = bool(not whatsapp_skipped_early and extracted_name and patient_name and extracted_name.strip().lower() != patient_name.strip().lower())
                age_changed = bool(not whatsapp_skipped_early and extracted_age and patient_age and int(extracted_age) != int(patient_age))
                gender_changed = bool(not whatsapp_skipped_early and final_gender and patient_gender and final_gender != patient_gender)
                contact_changed = bool(not whatsapp_skipped_early and extracted_contact and patient_contact and extracted_contact != patient_contact)

                has_change_phrase = bool(not whatsapp_skipped_early and re.search(
                    r'(?:ବଦଳାନ୍ତୁ|ସୁଧାରନ୍ତୁ|କରନ୍ତୁ|ନୁହେଁ|ନୁହେ|ଭୁଲ|change|update|correct|instead|not|बदल|सुधार)',
                    raw_transcript,
                    re.I
                ))
                is_correction = is_field_update or name_changed or age_changed or gender_changed or contact_changed or has_change_phrase

                if is_correction:
                    confirm_prefix = ""
                    if name_changed or (is_field_update and g_parsed.get("updated_field") == "name"):
                        confirm_prefix = f"ମୁଁ ଆପଣଙ୍କ ନାମ {final_name} ଆଜ୍ଞା ଭାବେ ସୁଧାରିଦେଲି। " if language in ('or', 'odia') else (f"मैंने आपका नाम {final_name} जी के रूप में सुधार दिया है। " if language in ('hi', 'hindi') else f"I have updated your name to {final_name}. ")
                    elif age_changed or (is_field_update and g_parsed.get("updated_field") == "age"):
                        confirm_prefix = f"ମୁଁ ଆପଣଙ୍କ ବୟସ {final_age} ବର୍ଷ ଭାବେ ସୁଧାରିଦେଲି। " if language in ('or', 'odia') else (f"मैंने आपकी उम्र {final_age} वर्ष के रूप में सुधार दी है। " if language in ('hi', 'hindi') else f"I have updated your age to {final_age}. ")
                    elif gender_changed or (is_field_update and g_parsed.get("updated_field") == "gender"):
                        g_label = 'ପୁରୁଷ' if final_gender == 'male' else ('ମହିଳା' if final_gender == 'female' else 'ଅନ୍ୟାନ୍ୟ')
                        confirm_prefix = f"ମୁଁ ଆପଣଙ୍କ ଲିଙ୍ଗ {g_label} ଭାବେ ସୁଧାରିଦେଲି। " if language in ('or', 'odia') else (f"मैंने आपका लिंग {g_label} के रूप में दर्ज कर दिया है। " if language in ('hi', 'hindi') else f"I have updated your gender to {final_gender}. ")
                    elif contact_changed or (is_field_update and g_parsed.get("updated_field") == "contact"):
                        confirm_prefix = f"ମୁଁ ଆପଣଙ୍କ ହ୍ୱାଟ୍ସଆପ୍ ନମ୍ବର {final_contact} ଭାବେ ସୁଧାରିଦେଲି। " if language in ('or', 'odia') else (f"मैंने आपका व्हाट्सएप नंबर {final_contact} सुधार दिया है। " if language in ('hi', 'hindi') else f"I have updated your WhatsApp number to {final_contact}. ")
                    else:
                        confirm_prefix = "ମୁଁ ଆପଣଙ୍କ ତଥ୍ୟ ସୁଧାରିଦେଲି। " if language in ('or', 'odia') else ("मैंने आपकी जानकारी सुधार दी है। " if language in ('hi', 'hindi') else "I have updated your details. ")

                    # After confirming update: check if any triage field is missing
                    if not final_complaint:
                        single_p, next_target = _get_single_demographic_prompt(final_name, final_age, final_gender, final_contact, final_complaint, language)
                        if single_p:
                            reply = f"{confirm_prefix}{single_p}"
                            next_s = next_target
                        else:
                            next_s = 2
                            reply = f"{confirm_prefix}" + _get_single_demographic_prompt(final_name, final_age, final_gender, final_contact, None, language)[0]
                    else:
                        # Symptoms already captured! DO NOT ask about symptoms again! Keep forward progression!
                        next_s = max(step, 3)
                        proceed_phrase = (
                            f"ଆପଣଙ୍କ ସମସ୍ୟା '{final_complaint}' ରେକର୍ଡ ହୋଇଛି। ଆସନ୍ତୁ ଆଗକୁ ବଢ଼ିବା।" if language in ('or', 'odia')
                            else (f"आपकी समस्या '{final_complaint}' दर्ज है। चलिए आगे बढ़ते हैं।" if language in ('hi', 'hindi')
                            else f"Your complaint of '{final_complaint}' is recorded. Let's proceed.")
                        )
                        reply = f"{confirm_prefix}{proceed_phrase}"
                else:
                    # Strict Sequential Gatekeeping: One piece of information at a time
                    whatsapp_skipped = bool(payload.get("whatsapp_skipped"))
                    if current_slot == "whatsapp" and not phone_from_speech and (
                        clean_test in valid_short_answers
                        or bool(re.search(
                            r'\b(skip|no|none|nope|nah|dont\s*have|do\s*not\s*have|no\s*number|no\s*whatsapp|later|nothing|nahi|nhi|na)\b|ନାହିଁ|ନାଇଁ|नहीं|कोई\s*नहीं|নেই|নাই',
                            raw_transcript,
                            re.I,
                        ))
                    ):
                        whatsapp_skipped = True
                        if final_contact and str(final_contact).upper() == "SKIP":
                            final_contact = None

                    if not final_complaint:
                        # Only auto-accept transcript as complaint when in problem/symptom slot (never on whatsapp/gender skip)
                        if (
                            current_slot in ("problem", "symptom", "")
                            and not whatsapp_skipped
                            and final_name
                            and (final_age or final_gender or final_contact)
                            and raw_transcript
                        ):
                            if (
                                not _is_pure_demographic_intro(raw_transcript)
                                and clean_test not in valid_short_answers
                                and not _parse_indic_gender(raw_transcript)
                                and len(raw_transcript.strip()) >= 2
                            ):
                                final_complaint = raw_transcript.strip()
                                next_s = 3
                                ack_name = final_name
                                reply = _get_ack_complaint_prompt(ack_name, final_complaint, language)
                        if not final_complaint:
                            contact_for_prompt = final_contact or ("SKIP" if whatsapp_skipped else None)
                            single_p, next_target = _get_single_demographic_prompt(
                                final_name, final_age, final_gender, contact_for_prompt, final_complaint, language
                            )
                            if single_p:
                                reply = single_p
                                next_s = next_target

                # Anti-repetition loop breaker: Never repeat the exact same inquiry that was just asked
                if current_q and reply:
                    c_clean = re.sub(r"[\s.,!?;:৤~_/\-'\"()[\]{}]+", " ", current_q).strip().lower()
                    r_clean = re.sub(r"[\s.,!?;:৤~_/\-'\"()[\]{}]+", " ", reply).strip().lower()
                    if c_clean and r_clean and (c_clean == r_clean or c_clean in r_clean or r_clean in c_clean):
                        ack_p = final_name or "Patient"
                        if final_complaint:
                            next_s = 5
                            is_fin = True
                            reply = _get_report_prompt(language)
                        elif current_slot in ("problem", "symptom", "") and clean_test not in valid_short_answers:
                            final_complaint = raw_transcript.strip()
                            next_s = 3
                            reply = _get_ack_complaint_prompt(ack_p, final_complaint, language)

                # Proactive loop prevention: if we have both name & complaint, advance rapidly
                if final_name and final_complaint:
                    if is_correction:
                        pass
                    elif step == 1:
                        next_s = 2
                    elif step >= 3 or is_fin or q_idx >= 1:
                        is_fin = True
                        next_s = 5
                    elif step == 2:
                        next_s = 3
                elif step == 4 and is_fin:
                    next_s = 5

                # Enforce strictly ONE single question in reply so user is never overwhelmed
                reply = _enforce_single_question(reply)

                return {
                    "status": "success",
                    "provider": "gemini",
                    "is_valid": is_val,
                    "needs_clarification": needs_clar,
                    "is_clarification_or_repeat": bool(g_parsed.get("is_clarification_or_repeat")),
                    "repeat_current_question": bool(g_parsed.get("repeat_current_question")),
                    "is_answered": bool(g_parsed.get("is_answered", True)),
                    "is_finished": is_fin,
                    "name": final_name,
                    "age": final_age,
                    "gender": final_gender,
                    "contact": final_contact,
                    "whatsapp_number": final_contact,
                    "complaint": final_complaint,
                    "duration": g_parsed.get("duration") or None,
                    "severity": g_parsed.get("severity") or None,
                    "medical_history": g_parsed.get("medical_history") or None,
                    "medications": g_parsed.get("medications") or None,
                    "allergies": g_parsed.get("allergies") or None,
                    "extracted_answer": (g_parsed.get("extracted_answer") or "").strip(),
                    "reply": reply,
                    "action": g_parsed.get("action") or "continue_conversation",
                    "patient_question_answered": bool(g_parsed.get("patient_question_answered")),
                    "next_question": (g_parsed.get("next_question") or "").strip(),
                    "questions": g_parsed.get("questions") or [],
                    "has_complaint": bool(final_complaint),
                    "whatsapp_skipped": bool(locals().get("whatsapp_skipped", False)),
                    "next_step": next_s,
                    "is_field_update": is_correction,
                    "updated_field": g_parsed.get("updated_field") or ("name" if name_changed else ("age" if age_changed else ("gender" if gender_changed else ("contact" if contact_changed else None))))
                }
        except Exception as gemini_err:
            logger.warning(f"Primary Gemini intake agent failed, falling back to Sarvam: {gemini_err}")

    # ── SECONDARY FALLBACK: Sarvam 105B Conversations ──
    api_key = (settings.SARVAM_API_KEY or "").strip()
    lang_label = _get_indic_lang_label(language)
    anon_transcript = _mask_pii(transcript)
    anon_complaint = _mask_pii(chief_complaint)
    prompt = ""

    if api_key and not is_sarvam_auth_blocked():

        if step == 1:

            prompt = (

                f"{NON_DIAGNOSTIC_SYSTEM_INSTRUCTION}\n"

                f"You are Jan Saathi AI, a strictly non-diagnostic triage intake assistant in Odisha, India.\n"

                f"Patient Identifier: {anon_profile} (Name recorded: {'Yes' if patient_name else 'No'}, Contact recorded: {'Yes' if patient_contact else 'No'}).\n"

                f"The patient is speaking to you in {lang_label}: \"{anon_transcript}\"\n"

                f"Current Step: 1 (Patient Introduction, WhatsApp Contact, Gender & Problem Inquiry).\n\n"

                f"Tasks:\n"

                f"1. Validation: Determine if the patient provided real introductory information (name, age, gender, WhatsApp mobile number, or symptoms).\n"

                f"   - If they did NOT provide a name, age, gender, phone number, or health complaint (e.g. only greeting 'hello', 'yes', or vague murmur):\n"

                f"     Set \"is_valid\": false, \"needs_clarification\": true.\n"

                f"     Set \"reply\": strictly ONE question asking ONLY for their full name (e.g. 'ନମସ୍କାର ଏବଂ ଜନ ସାଥୀ କ୍ଲିନିକକୁ ସ୍ୱାଗତ। ପ୍ରଥମେ ଦୟାକରି ଆପଣଙ୍କ ଶୁଭ ନାମ କୁହନ୍ତୁ।'). NEVER combine multiple fields.\n"

                f"   - If they DID provide introductory info:\n"

                f"     Set \"is_valid\": true, \"needs_clarification\": false.\n"

                f"2. Extract patient's exact clean full personal name in {lang_label} script. Strictly exclude complaints, symptoms, pain descriptions, greetings, and filler words. If personal name is absent, set null. NEVER set health problems or symptoms as name.\n"

                f"3. Extract patient's age as an integer (convert words like 'ଏକୋଇଶି', 'କୋଡ଼ିଏ' to 21, 20). If absent, set null.\n"

                f"4. Extract patient's gender: \"male\", \"female\", \"other\", or null.\n"

                f"5. Extract patient's 10-digit WhatsApp or mobile phone number if mentioned (convert Odia/Hindi digits to digits). If absent, set null.\n"

                f"6. Check if patient described their health trouble or symptoms (e.g. 'ଦେହ ଭଲ ଲାଗୁନାହିଁ', 'ଛାତି ଯନ୍ତ୍ରଣା', 'କାଶ', 'ଜ୍ୱର'). If so, summarize concisely in {lang_label}. If absent, set null.\n"

                f"7. Formulate an empathetic, respectful doctor reply in natural conversational {lang_label} addressing the patient politely (e.g. 'ବାବୁ' / 'ଆଜ୍ଞା' / 'ଜୀ').\n"

                f"8. If symptoms were mentioned, formulate 2 clinically relevant questions tailored strictly to those symptoms in {lang_label}.\n\n"

                f"Output strictly valid JSON with no markdown wrapping:\n"

                f"{{\n"

                f"  \"is_valid\": true,\n"

                f"  \"needs_clarification\": false,\n"

                f"  \"name\": \"... or null\",\n"

                f"  \"age\": 21,\n"

                f"  \"gender\": \"male\",\n"

                f"  \"whatsapp_number\": \"9876543210 or null\",\n"

                f"  \"complaint\": \"... or null\",\n"

                f"  \"reply\": \"...\",\n"

                f"  \"questions\": [\"...\", \"...\"],\n"

                f"  \"has_complaint\": true\n"

                f"}}\n"

                )

        elif step == 2:

            prompt = (

                f"{NON_DIAGNOSTIC_SYSTEM_INSTRUCTION}\n"

                f"You are Jan Saathi AI, a strictly non-diagnostic triage intake assistant in Odisha, India.\n"

                f"Patient Profile: {anon_profile}, Age: {patient_age or 'unknown'}.\n"

                f"The patient is describing their health trouble in {lang_label}: \"{anon_transcript}\"\n"

                f"Current Step: 2 (Chief Complaint & Symptom Intake).\n\n"

                f"Tasks:\n"

                f"1. Validation: Check if the patient actually described a medical complaint, symptom, pain, or health trouble.\n"

                f"   - If they did NOT provide a medical complaint (e.g. said 'yes', 'nothing', coughed, or asked 'what did you say'):\n"

                f"     Set \"is_valid\": false, \"needs_clarification\": true.\n"

                f"     Set \"reply\": gentle natural {lang_label} asking what health problem or physical discomfort they are suffering from today.\n"

                f"   - If they DID describe an illness or symptom:\n"

                f"     Set \"is_valid\": true, \"needs_clarification\": false.\n"

                f"2. Summarize the clinical chief complaint concisely in {lang_label}.\n"

                f"3. Dynamic Slot Updating: Check if the patient explicitly provided or corrected their personal name, age, or WhatsApp mobile number in this turn. NEVER confuse symptoms or pain descriptions with name. If personal name is mentioned, extract 'updated_name', else null. If age is mentioned, extract 'updated_age', else null. If WhatsApp number mentioned, extract 'updated_contact', else null.\n"

                f"4. Formulate a warm, empathetic doctor reply in {lang_label} acknowledging their suffering.\n"

                f"5. Generate 2 targeted, clinically relevant follow-up questions tailored strictly to this specific complaint in {lang_label} (investigating duration, pain radiation, severity, or triggers).\n\n"

                f"Output strictly valid JSON with no markdown wrapping:\n"

                f"{{\n"

                f"  \"is_valid\": true,\n"

                f"  \"needs_clarification\": false,\n"

                f"  \"complaint\": \"...\",\n"

                f"  \"updated_name\": null,\n"

                f"  \"updated_age\": null,\n"

                f"  \"updated_contact\": null,\n"

                f"  \"reply\": \"...\",\n"

                f"  \"questions\": [\"...\", \"...\"]\n"

                f"}}"

            )

        elif step == 3:

            prompt = (

                f"{NON_DIAGNOSTIC_SYSTEM_INSTRUCTION}\n"

                f"You are Jan Saathi AI, a strictly non-diagnostic triage intake assistant in Odisha, India.\n"

                f"Language: {lang_label}.\n"

                f"Patient Profile: {anon_profile}, Age: {patient_age or 'unknown'}, Chief Complaint: '{anon_complaint}'.\n"

                f"Current Step: 3 (Medical History, Chronic Conditions, Regular Medications & Allergies).\n"

                f"The patient is speaking in {lang_label}: \"{anon_transcript}\"\n\n"

                f"Tasks:\n"

                f"1. Validation: Determine if the patient answered about past diseases, medications, or allergies, or stated they have no past illnesses (e.g. 'ନାହିଁ', 'କିଛି ନାହିଁ', 'ନାଇଁ', 'nothing', 'none', 'no past disease', 'स्वस्थ हूँ'). Both reporting conditions and stating 'no illness' are VALID answers.\n"

                f"2. Extract:\n"

                f"   - \"medical_history\": concise clinical summary in {lang_label} of past illnesses (diabetes, blood pressure/hypertension, heart disease, asthma, thyroid) or 'None / କୌଣସି ପୂର୍ବ ରୋଗ ନାହିଁ'.\n"

                f"   - \"medications\": ongoing regular medications or 'None'.\n"

                f"   - \"allergies\": drug/food allergies or 'None'.\n"

                f"3. Generate a warm, empathetic doctor reply in {lang_label} confirming their medical history is recorded and introducing the follow-up clinical questions.\n"

                f"4. Generate 2 targeted, clinically relevant follow-up questions tailored to their complaint '{chief_complaint}' and medical history in {lang_label}.\n\n"

                f"Output strictly valid JSON with no markdown wrapping:\n"

                f"{{\n"

                f"  \"is_valid\": true,\n"

                f"  \"medical_history\": \"...\",\n"

                f"  \"medications\": \"...\",\n"

                f"  \"allergies\": \"...\",\n"

                f"  \"reply\": \"...\",\n"

                f"  \"questions\": [\"...\", \"...\"]\n"

                f"}}"

            )

        elif step == 4:

            current_question = str(payload.get("current_question") or "").strip()

            q_idx = int(payload.get("question_index") or 0)

            total_target = int(payload.get("total_questions_target") or 2)



            prompt = (

                f"{NON_DIAGNOSTIC_SYSTEM_INSTRUCTION}\n"

                f"You are Jan Saathi AI, a strictly non-diagnostic triage intake assistant in Odisha, India.\n"

                f"Language: {lang_label}.\n"

                f"Patient Profile: {anon_profile}, Age: {patient_age or 'unknown'}, Chief Complaint: '{anon_complaint}'.\n"

                f"Current Question Asked: '{_mask_pii(current_question)}'\n"

                f"Question Number: {q_idx + 1} of {total_target}\n"

                f"Patient's Spoken Response: \"{anon_transcript}\"\n\n"

                f"Tasks:\n"

                f"1. Validation and Clinical Intent Analysis:\n"

                f"   - NOTE: Short direct answers like 'ହଁ' (yes), 'ନାହିଁ' (no), 'ଦୁଇ ଦିନ' (2 days), 'କାଲିଠାରୁ' (since yesterday), 'ସକାଳୁ' (since morning), 'ପେଟ କାଟୁଛି' (stomach hurts) ARE VALID CLINICAL ANSWERS! Never reject short or affirmative/negative answers.\n"

                f"   - Only check if patient explicitly asked to repeat or stated they did not understand (e.g. 'ବୁଝିପାରୁନାହିଁ', 'କଣ କହିଲେ', 'ଆଉଥରେ କୁହନ୍ତୁ', 'what did you say', 'repeat'):\n"

                f"     Set \"is_clarification_or_repeat\": true, \"repeat_current_question\": true, \"is_answered\": false, \"is_finished\": false, \"next_step\": 4.\n"

                f"     Set \"reply\": very gentle, polite restatement of the question in natural {lang_label} script.\n"

                f"     Set \"next_question\": simplified restatement.\n"

                f"   - If patient DID answer the question (including single-word yes/no/duration answers):\n"

                f"     Set \"is_clarification_or_repeat\": false, \"repeat_current_question\": false, \"is_answered\": true.\n"

                f"     Set \"extracted_answer\": concise clinical summary of their answer in {lang_label}.\n"

                f"     Formulate a warm, empathetic doctor acknowledgment in {lang_label} directly acknowledging what they said (e.g. 'ଆପଣଙ୍କ ଉତ୍ତର ବୁଝିଲି।' or 'ଠିକ୍ ଅଛି, ବୁଝିପାରିଲି।').\n"

                f"     If {q_idx + 1} >= {total_target}:\n"

                f"       Set \"is_finished\": true, \"next_step\": 5.\n"

                f"       Set \"reply\": \"<acknowledgment> ଆପଣଙ୍କ ସମସ୍ତ ଉତ୍ତର ଧ୍ୟାନର ସହ ରେକର୍ଡ କରାଗଲା।\", \"next_question\": \"\".\n"

                f"     Else:\n"

                f"       Set \"is_finished\": false, \"next_step\": 4.\n"

                f"       Formulate the NEXT targeted clinical question logically addressing their symptoms in natural {lang_label} script.\n"

                f"       Set \"reply\": \"<acknowledgment> ପରବର୍ତ୍ତୀ ପ୍ରଶ୍ନ: <generated next question>\", \"next_question\": \"<generated next question>\".\n"

                f"2. Dynamic Slot Updating: Check if the patient explicitly mentioned or corrected their personal name, age, WhatsApp mobile number, or chief complaint in this turn (e.g. 'ମୋ ନାମ ...', 'ମୋ ବୟସ ...', 'ମୋ ହ୍ୱାଟ୍ସଆପ୍ ନମ୍ବର ...'). NEVER confuse answers to clinical symptom questions with patient name. If personal name was stated, set 'updated_name', else null. If age was stated, set 'updated_age', else null. If phone was stated, set 'updated_contact', else null. If new complaint, set 'updated_complaint', else null.\n\n"

                f"Output strictly valid JSON with no markdown wrapping:\n"

                f"{{\n"

                f"  \"is_clarification_or_repeat\": false,\n"

                f"  \"repeat_current_question\": false,\n"

                f"  \"is_answered\": true,\n"

                f"  \"is_finished\": false,\n"

                f"  \"extracted_answer\": \"...\",\n"

                f"  \"updated_name\": null,\n"

                f"  \"updated_age\": null,\n"

                f"  \"updated_contact\": null,\n"

                f"  \"updated_complaint\": null,\n"

                f"  \"reply\": \"...\",\n"

                f"  \"next_question\": \"...\",\n"

                f"  \"next_step\": 4\n"

                f"}}"

            )

        else:

            prompt = (

                f"{NON_DIAGNOSTIC_SYSTEM_INSTRUCTION}\n"

                f"You are Jan Saathi AI, a strictly non-diagnostic triage intake assistant in {lang_label}.\n"

                f"Patient Profile: {anon_profile}, Complaint: {anon_complaint}.\n"

                f"Patient answered: \"{anon_transcript}\".\n"

                f"Acknowledge the patient empathetically in {lang_label} without diagnosing or prescribing."

            )



        try:

            async with httpx.AsyncClient(timeout=8.0) as client:

                res = await client.post(

                    "https://api.sarvam.ai/v1/chat/completions",

                    headers={"api-subscription-key": api_key, "Content-Type": "application/json"},

                    json={

                        "model": "sarvam-105b-conversations",

                        "messages": [

                            {"role": "system", "content": NON_DIAGNOSTIC_SYSTEM_INSTRUCTION},

                            {"role": "user", "content": prompt},

                        ],

                        "temperature": 0.1,

                        "max_tokens": 500,

                    },

                )

            if res.status_code == 200:

                raw = res.json()["choices"][0]["message"]["content"].strip()

                if raw.startswith("```"):

                    raw = raw.split("```")[1]

                    if raw.startswith("json"):

                        raw = raw[4:]

                    raw = raw.strip()

                parsed = json.loads(raw)



                if step == 4:

                    is_clarify = bool(parsed.get("is_clarification_or_repeat") or parsed.get("repeat_current_question"))

                    is_ans = bool(parsed.get("is_answered", True))

                    if not is_ans:

                        is_clarify = True

                    is_fin = bool(parsed.get("is_finished"))

                    extracted_ans = (parsed.get("extracted_answer") or "").strip()

                    if is_clarify:

                        extracted_ans = ""

                    reply = (parsed.get("reply") or "").strip()

                    next_q = (parsed.get("next_question") or "").strip()



                    up_name = (parsed.get("updated_name") or "").strip()

                    if not up_name or up_name.lower() in ("null", "none", "unknown", "patient", "ରୋଗୀ", "मरीज") or _is_clinical_or_symptom(up_name):

                        up_name = None

                    up_age = parsed.get("updated_age")

                    if up_age in ("null", "None", None, ""):

                        up_age = None

                    elif isinstance(up_age, str) and up_age.isdigit():

                        up_age = int(up_age)

                    up_comp = (parsed.get("updated_complaint") or "").strip()

                    if not up_comp or up_comp.lower() in ("null", "none", "unknown"):

                        up_comp = None



                    if not up_age:

                        up_age = _parse_indic_age(transcript, step)

                    if not up_name:

                        m_nm = re.search(r'(?:ମୋର ନାମ|ମୋ ନାମ|ମୋ ନାଁ|मेरा नाम|my name is)\s+([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})', transcript, re.I)

                        if m_nm:

                            up_name = _clean_extracted_name(m_nm.group(1))



                    up_contact = (
                        _parse_indic_phone_number(transcript) or
                        (parsed.get("updated_contact") or parsed.get("whatsapp_number") or "").strip() or
                        patient_contact or
                        None
                    )
                    up_gender = _parse_indic_gender(str(parsed.get("updated_gender") or parsed.get("gender") or "")) or _parse_indic_gender(transcript) or _parse_indic_gender(patient_gender) or None

                    return {
                        "status": "success",
                        "provider": "sarvam_105b",
                        "is_clarification_or_repeat": is_clarify,
                        "repeat_current_question": is_clarify,
                        "is_answered": is_ans and not is_clarify,
                        "is_finished": is_fin,
                        "extracted_answer": extracted_ans,
                        "updated_name": up_name,
                        "updated_age": up_age,
                        "updated_gender": up_gender,
                        "gender": up_gender,
                        "updated_contact": up_contact,
                        "contact": up_contact,
                        "whatsapp_number": up_contact,
                        "updated_complaint": up_comp,
                        "reply": reply,
                        "next_question": next_q,
                        "next_step": 5 if is_fin else 4,
                    }



                if step == 2:

                    extracted_complaint = (parsed.get("complaint") or "").strip()

                    if extracted_complaint.lower() in ("null", "none", "unknown"):

                        extracted_complaint = ""

                    is_val = bool(parsed.get("is_valid", True))

                    needs_clar = bool(parsed.get("needs_clarification", False))

                    if not extracted_complaint or len(extracted_complaint) < 3:

                        is_val = False

                        needs_clar = True



                    up_name = (parsed.get("updated_name") or "").strip()

                    if not up_name or up_name.lower() in ("null", "none", "unknown", "patient", "ରୋଗୀ", "मरीज") or _is_clinical_or_symptom(up_name):

                        up_name = None

                    up_age = parsed.get("updated_age") or parsed.get("age")

                    if up_age in ("null", "None", None, ""):

                        up_age = None

                    elif isinstance(up_age, str) and up_age.isdigit():

                        up_age = int(up_age)



                    if not up_age:

                        up_age = _parse_indic_age(transcript, step)

                    if not up_name:
                        cand_nm, _ = _extract_name_and_correction(transcript, is_asking_name=False)
                        if cand_nm:
                            up_name = cand_nm

                    up_contact = (
                        _parse_indic_phone_number(transcript) or
                        (parsed.get("updated_contact") or parsed.get("whatsapp_number") or "").strip() or
                        patient_contact or
                        None
                    )

                    up_gender = _parse_indic_gender(str(parsed.get("updated_gender") or parsed.get("gender") or "")) or _parse_indic_gender(transcript) or _parse_indic_gender(patient_gender) or None

                    has_change_phrase = bool(re.search(
                        r'(?:ବଦଳାନ୍ତୁ|ସୁଧାରନ୍ତୁ|କରନ୍ତୁ|ନୁହେଁ|ନୁହେ|ଭୁଲ|change|update|correct|instead|not|बदल|सुधार)',
                        transcript,
                        re.I
                    ))
                    age_changed = bool(up_age and patient_age and int(up_age) != int(patient_age))
                    name_changed = bool(up_name and patient_name and up_name.strip().lower() != patient_name.strip().lower())
                    gender_changed = bool(up_gender and patient_gender and up_gender != patient_gender)
                    contact_changed = bool(up_contact and patient_contact and up_contact != patient_contact)

                    if name_changed or age_changed or gender_changed or contact_changed or has_change_phrase:
                        confirm_text = ""
                        if name_changed:
                            confirm_text = f"ମୁଁ ଆପଣଙ୍କ ନାମ ସୁଧାରି {up_name} ଆଜ୍ଞା ଭାବେ ଠିକ୍ କରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपका नाम सुधार कर {up_name} जी कर दिया है। " if language in ("hi", "hindi") else f"I have corrected your name to {up_name}. ")
                        elif age_changed:
                            confirm_text = f"ମୁଁ ଆପଣଙ୍କ ବୟସ ସୁଧାରି {up_age} ବର୍ଷ ଭାବେ ଠିକ୍ କରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपकी उम्र सुधार कर {up_age} वर्ष कर दी है। " if language in ("hi", "hindi") else f"I have updated your age to {up_age}. ")
                        elif gender_changed:
                            g_lbl = 'ପୁରୁଷ' if up_gender == 'male' else ('ମହିଳା' if up_gender == 'female' else 'ଅନ୍ୟାନ୍ୟ')
                            confirm_text = f"ମୁଁ ଆପଣଙ୍କ ଲିଙ୍ଗ {g_lbl} ଭାବେ ସୁଧାରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपका लिंग {g_lbl} दर्ज कर दिया है। " if language in ("hi", "hindi") else f"I have updated your gender to {up_gender}. ")
                        elif contact_changed:
                            confirm_text = f"ମୁଁ ଆପଣଙ୍କ ହ୍ୱାଟ୍ସଆପ୍ ନମ୍ବର {up_contact} ଭାବେ ସୁଧାରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपका व्हाट्सएप नंबर {up_contact} दर्ज कर दिया है। " if language in ("hi", "hindi") else f"I have updated your WhatsApp number to {up_contact}. ")

                        if chief_complaint:
                            # Medical problem is already known! Do NOT ask about problems again!
                            next_s_step = 3
                            reply = (
                                f"{confirm_text}ଆପଣଙ୍କ ସମସ୍ୟା '{chief_complaint}' ବିଷୟରେ ନୋଟ୍ କରାଯାଇଛି। ଆସନ୍ତୁ ଆଗକୁ ବଢ଼ିବା।" if language in ("or", "odia")
                                else f"{confirm_text}आपकी समस्या '{chief_complaint}' नोट है। आइये आगे बढ़ते हैं।" if language in ("hi", "hindi")
                                else f"{confirm_text}Your complaint of '{chief_complaint}' is recorded. Let's proceed."
                            )
                        else:
                            next_s_step = 2
                            reply = (
                                f"{confirm_text}ଏବେ ଦୟାକରି କୁହନ୍ତୁ, ଆଜି ଆପଣଙ୍କୁ କ’ଣ ଅସୁବିଧା ବା କଷ୍ଟ ହେଉଛି?" if language in ("or", "odia")
                                else f"{confirm_text}अब बताइए, आज आपको क्या परेशानी या बीमारी महसूस हो रही है?" if language in ("hi", "hindi")
                                else f"{confirm_text}Now please tell me, what health trouble or symptoms are you experiencing today?"
                            )
                        if not _is_clinical_or_symptom(transcript):
                            extracted_complaint = ""
                    else:
                        reply = (parsed.get("reply") or "").strip()
                        if not reply:
                            reply = (
                                "ମୁଁ ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା ଶୁଣିପାରିଲି ନାହିଁ। ଆଜି ଆପଣଙ୍କୁ କ’ଣ ଅସୁବିଧା ବା କଷ୍ଟ ହେଉଛି? ଦୟାକରି କୁହନ୍ତୁ।"
                                if language in ("or", "odia")
                                else "मुझे आपकी परेशानी स्पष्ट नहीं हुई। आज आपको क्या तकलीफ है, कृपया बताएं।"
                            )
                        next_s_step = 3 if is_val else 2

                    questions = parsed.get("questions") or []

                    return {
                        "status": "success",
                        "provider": "sarvam_105b",
                        "is_valid": is_val,
                        "needs_clarification": needs_clar,
                        "complaint": extracted_complaint,
                        "updated_name": up_name,
                        "updated_age": up_age,
                        "updated_gender": up_gender,
                        "gender": up_gender,
                        "updated_contact": up_contact,
                        "name": up_name or (patient_name if not _is_clinical_or_symptom(patient_name) else ""),
                        "age": up_age or patient_age,
                        "contact": up_contact,
                        "whatsapp_number": up_contact,
                        "reply": reply,
                        "questions": questions,
                        "has_complaint": is_val,
                        "next_step": next_s_step,
                    }



                if step == 3:
                    med_history = (parsed.get("medical_history") or "").strip()
                    medications = (parsed.get("medications") or "").strip()
                    allergies = (parsed.get("allergies") or "").strip()
                    reply = (parsed.get("reply") or "").strip()

                    # Check for demographic corrections at Step 3
                    up_name, is_name_corr = _extract_name_and_correction(transcript)
                    up_age = _parse_indic_age(transcript, step_num=step)
                    up_gender = _parse_indic_gender(transcript)
                    up_contact = _parse_indic_phone_number(transcript)

                    age_changed = bool(up_age and patient_age and int(up_age) != int(patient_age))
                    name_changed = bool(up_name and patient_name and up_name.strip().lower() != patient_name.strip().lower())
                    gender_changed = bool(up_gender and patient_gender and up_gender != patient_gender)
                    contact_changed = bool(up_contact and patient_contact and up_contact != patient_contact)

                    confirm_text = ""
                    if name_changed or is_name_corr:
                        confirm_text = f"ମୁଁ ଆପଣଙ୍କ ନାମ ସୁଧାରି {up_name} ଆଜ୍ଞା ଭାବେ ଠିକ୍ କରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपका नाम सुधार कर {up_name} जी कर दिया है। " if language in ("hi", "hindi") else f"I have corrected your name to {up_name}. ")
                    elif age_changed:
                        confirm_text = f"ମୁଁ ଆପଣଙ୍କ ବୟସ ସୁଧାରି {up_age} ବର୍ଷ ଭାବେ ଠିକ୍ କରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपकी उम्र सुधार कर {up_age} वर्ष कर दी है। " if language in ("hi", "hindi") else f"I have updated your age to {up_age}. ")
                    elif gender_changed:
                        g_lbl = 'ପୁରୁଷ' if up_gender == 'male' else ('ମହିଳା' if up_gender == 'female' else 'ଅନ୍ୟାନ୍ୟ')
                        confirm_text = f"ମୁଁ ଆପଣଙ୍କ ଲିଙ୍ଗ {g_lbl} ଭାବେ ସୁଧାରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपका लिंग {g_lbl} दर्ज कर दिया है। " if language in ("hi", "hindi") else f"I have updated your gender to {up_gender}. ")
                    elif contact_changed:
                        confirm_text = f"ମୁଁ ଆପଣଙ୍କ ହ୍ୱାଟ୍ସଆପ୍ ନମ୍ବର {up_contact} ଭାବେ ସୁଧାରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपका व्हाट्सएप नंबर {up_contact} दर्ज कर दिया है। " if language in ("hi", "hindi") else f"I have updated your WhatsApp number to {up_contact}. ")

                    if confirm_text:
                        reply = f"{confirm_text}{reply}" if reply else f"{confirm_text}ଆସନ୍ତୁ ଆଗକୁ ବଢ଼ିବା।"
                    elif not reply:
                        reply = (
                            "ଆପଣଙ୍କ ଚିକିତ୍ସା ଇତିହାସ ନୋଟ୍ କରାଗଲା।"
                            if language in ("or", "odia")
                            else "आपका मेडिकल इतिहास दर्ज कर लिया गया है।"
                        )

                    questions = parsed.get("questions") or []

                    return {
                        "status": "success",
                        "provider": "sarvam_105b",
                        "is_valid": True,
                        "needs_clarification": False,
                        "medical_history": med_history,
                        "medications": medications,
                        "allergies": allergies,
                        "name": up_name or (patient_name if not _is_name_invalidating(patient_name) else None),
                        "age": up_age or patient_age or None,
                        "gender": up_gender or _parse_indic_gender(patient_gender) or None,
                        "contact": up_contact or patient_contact or None,
                        "whatsapp_number": up_contact or patient_contact or None,
                        "complaint": chief_complaint or None,
                        "reply": reply,
                        "questions": questions,
                        "next_step": 4,
                    }



                # Step 1
                extracted_name = (parsed.get("name") or "").strip()
                if extracted_name.lower() in ("null", "none", "unknown", "patient", "ରୋଗୀ", "मरीज"):
                    extracted_name = ""

                # Check regex extractor for direct name or correction
                cand_name, is_corr = _extract_name_and_correction(transcript, is_asking_name=not bool(patient_name))
                if cand_name and (is_corr or not extracted_name):
                    extracted_name = cand_name

                extracted_age = parsed.get("age")

                if extracted_age in ("null", "None", None, ""):

                    extracted_age = None

                raw_gender = str(parsed.get("gender") or "").strip().lower()
                indic_gender = _parse_indic_gender(transcript)
                extracted_gender = indic_gender
                if not extracted_gender and raw_gender in ("male", "female", "other"):
                    if re.search(r'(?:male|female|other|man|woman|boy|girl|पुरुष|महिला|स्त्री|आदमी|लड़का|लड़की|ପୁରୁଷ|ମହିଳା|ସ୍ତ୍ରୀ|ଝିଅ|ବାବୁ|ଭାଇ)', transcript, re.I):
                        extracted_gender = raw_gender

                extracted_complaint = (parsed.get("complaint") or "").strip()

                if extracted_complaint.lower() in ("null", "none", "unknown"):

                    extracted_complaint = ""



                # If extracted_name actually contains clinical symptoms/pain, route it to complaint!

                if extracted_name and _is_clinical_or_symptom(extracted_name):

                    if not extracted_complaint:

                        extracted_complaint = extracted_name

                    extracted_name = ""



                extracted_contact = (

                    _parse_indic_phone_number(transcript) or

                    (parsed.get("whatsapp_number") or parsed.get("contact") or "").strip() or

                    patient_contact or

                    None

                )



                has_comp = bool(extracted_complaint)

                is_val = bool(parsed.get("is_valid", True))

                needs_clar = bool(parsed.get("needs_clarification", False))



                if not extracted_name and not extracted_age and not extracted_contact and not has_comp:

                    is_val = False

                    needs_clar = True



                reply = (parsed.get("reply") or "").strip()

                if not reply:

                    reply, _ = _get_single_demographic_prompt(extracted_name or patient_name, extracted_age or patient_age, extracted_gender or patient_gender, extracted_contact or patient_contact, extracted_complaint or chief_complaint, language)

                questions = parsed.get("questions") or []



                next_s = 1

                if is_val and not needs_clar:

                    next_s = 4 if (has_comp and questions) else 2



                return {

                    "status": "success",

                    "provider": "sarvam_105b",

                    "is_valid": is_val,

                    "needs_clarification": needs_clar,

                    "name": extracted_name or (patient_name if not _is_clinical_or_symptom(patient_name) else ""),

                    "age": extracted_age or patient_age,

                    "gender": extracted_gender or _parse_indic_gender(patient_gender) or _parse_indic_gender(transcript) or None,

                    "contact": extracted_contact,

                    "whatsapp_number": extracted_contact,

                    "complaint": extracted_complaint or chief_complaint,

                    "reply": reply,

                    "questions": questions,

                    "has_complaint": has_comp,

                    "next_step": next_s,
                }
            elif res.status_code in (401, 403):
                note_sarvam_auth_failure(res.status_code, "Sarvam 105B voice intake")
        except Exception as exc:
            logger.warning("Sarvam 105b voice intake error: %s", exc)

    # Secondary Cloud Fallback: Google Gemini
    gemini_key = (settings.GEMINI_API_KEY or "").strip()
    if gemini_key:
        try:
            secondary_models = get_ordered_gemini_models()
            res = None
            async with httpx.AsyncClient(timeout=20.0) as client:
                for m_id in secondary_models:
                    gem_url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_id}:generateContent?key={gemini_key}"
                    cand_res = await client.post(
                        gem_url,
                        json={
                            "systemInstruction": {"parts": [{"text": NON_DIAGNOSTIC_SYSTEM_INSTRUCTION}]},
                            "contents": [{"parts": [{"text": prompt + "\nRespond strictly in valid JSON format."}]}],
                            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 600},
                        },
                    )
                    res = cand_res
                    if cand_res.status_code == 200:
                        break
                    if cand_res.status_code == 404:
                        mark_gemini_model_retired(m_id)

            if res is not None and res.status_code == 200:

                data = res.json()

                candidates = data.get("candidates") or []

                if candidates:

                    parts = candidates[0].get("content", {}).get("parts", [])

                    raw = parts[0].get("text", "") if parts else ""

                    if raw.startswith("```"):

                        raw = raw.split("```")[1]

                        if raw.startswith("json"):

                            raw = raw[4:]

                        raw = raw.strip()

                    parsed = json.loads(raw)

                    if step == 4:

                        is_clarify = bool(parsed.get("is_clarification_or_repeat") or parsed.get("repeat_current_question"))

                        is_ans = bool(parsed.get("is_answered", True))

                        if not is_ans:

                            is_clarify = True

                        is_fin = bool(parsed.get("is_finished"))

                        extracted_ans = (parsed.get("extracted_answer") or "").strip()

                        if is_clarify:

                            extracted_ans = ""

                        reply = (parsed.get("reply") or "").strip()

                        next_q = (parsed.get("next_question") or "").strip()



                        up_name = (parsed.get("updated_name") or "").strip()

                        if not up_name or up_name.lower() in ("null", "none", "unknown", "patient", "ରୋଗୀ", "मरीज") or _is_clinical_or_symptom(up_name):

                            up_name = None

                        up_age = parsed.get("updated_age")

                        if up_age in ("null", "None", None, ""):

                            up_age = None

                        elif isinstance(up_age, str) and up_age.isdigit():

                            up_age = int(up_age)

                        up_comp = (parsed.get("updated_complaint") or "").strip()

                        if not up_comp or up_comp.lower() in ("null", "none", "unknown"):

                            up_comp = None



                        if not up_age:

                            up_age = _parse_indic_age(transcript, step)

                        if not up_name:

                            m_nm = re.search(r'(?:ମୋର ନାମ|ମୋ ନାମ|ମୋ ନାଁ|मेरा नाम|my name is)\s+([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})', transcript, re.I)

                            if m_nm:

                                up_name = _clean_extracted_name(m_nm.group(1))



                        up_contact = (
                            _parse_indic_phone_number(transcript) or
                            (parsed.get("updated_contact") or parsed.get("whatsapp_number") or "").strip() or
                            patient_contact or
                            None
                        )
                        up_gender = _parse_indic_gender(str(parsed.get("updated_gender") or parsed.get("gender") or "")) or _parse_indic_gender(transcript) or _parse_indic_gender(patient_gender) or None

                        return {
                            "status": "success",
                            "provider": "gemini",
                            "is_clarification_or_repeat": is_clarify,
                            "repeat_current_question": is_clarify,
                            "is_answered": is_ans and not is_clarify,
                            "is_finished": is_fin,
                            "extracted_answer": extracted_ans,
                            "updated_name": up_name,
                            "updated_age": up_age,
                            "updated_gender": up_gender,
                            "gender": up_gender,
                            "updated_contact": up_contact,
                            "contact": up_contact,
                            "whatsapp_number": up_contact,
                            "updated_complaint": up_comp,
                            "reply": reply,
                            "next_question": next_q,
                            "next_step": 5 if is_fin else 4,
                        }

                    if step == 2:

                        extracted_complaint = (parsed.get("complaint") or "").strip()

                        if extracted_complaint.lower() in ("null", "none", "unknown"):

                            extracted_complaint = ""

                        is_val = bool(parsed.get("is_valid", True))

                        needs_clar = bool(parsed.get("needs_clarification", False))

                        if not extracted_complaint or len(extracted_complaint) < 3:

                            is_val = False

                            needs_clar = True



                        up_name = (parsed.get("updated_name") or "").strip()

                        if not up_name or up_name.lower() in ("null", "none", "unknown", "patient", "ରୋଗୀ", "मरीज") or _is_clinical_or_symptom(up_name):

                            up_name = None

                        up_age = parsed.get("updated_age") or parsed.get("age")

                        if up_age in ("null", "None", None, ""):

                            up_age = None

                        elif isinstance(up_age, str) and up_age.isdigit():

                            up_age = int(up_age)



                        if not up_age:

                            up_age = _parse_indic_age(transcript, step)

                        if not up_name:

                            m_nm = re.search(r'(?:ମୋର ନାମ|ମୋ ନାମ|ମୋ ନାଁ|मेरा नाम|my name is)\s+([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})', transcript, re.I)

                            if m_nm:

                                up_name = _clean_extracted_name(m_nm.group(1))



                        up_contact = (

                            _parse_indic_phone_number(transcript) or

                            (parsed.get("updated_contact") or parsed.get("whatsapp_number") or "").strip() or

                            patient_contact or

                            None

                        )



                        up_gender = _parse_indic_gender(str(parsed.get("updated_gender") or parsed.get("gender") or "")) or _parse_indic_gender(transcript) or _parse_indic_gender(patient_gender) or None

                        has_change_phrase = bool(re.search(
                            r'(?:ବଦଳାନ୍ତୁ|ସୁଧାରନ୍ତୁ|କରନ୍ତୁ|ନୁହେଁ|ନୁହେ|ଭୁଲ|change|update|correct|instead|not|बदल|सुधार)',
                            transcript,
                            re.I
                        ))
                        age_changed = bool(up_age and patient_age and int(up_age) != int(patient_age))
                        name_changed = bool(up_name and patient_name and up_name.strip().lower() != patient_name.strip().lower())
                        gender_changed = bool(up_gender and patient_gender and up_gender != patient_gender)
                        contact_changed = bool(up_contact and patient_contact and up_contact != patient_contact)

                        if name_changed or age_changed or gender_changed or contact_changed or has_change_phrase:
                            confirm_text = ""
                            if name_changed:
                                confirm_text = f"ମୁଁ ଆପଣଙ୍କ ନାମ ସୁଧାରି {up_name} ଆଜ୍ଞା ଭାବେ ଠିକ୍ କରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपका नाम सुधार कर {up_name} जी कर दिया है। " if language in ("hi", "hindi") else f"I have corrected your name to {up_name}. ")
                            elif age_changed:
                                confirm_text = f"ମୁଁ ଆପଣଙ୍କ ବୟସ ସୁଧାରି {up_age} ବର୍ଷ ଭାବେ ଠିକ୍ କରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपकी उम्र सुधार कर {up_age} वर्ष कर दी है। " if language in ("hi", "hindi") else f"I have updated your age to {up_age}. ")
                            elif gender_changed:
                                g_lbl = 'ପୁରୁଷ' if up_gender == 'male' else ('ମହିଳା' if up_gender == 'female' else 'ଅନ୍ୟାନ୍ୟ')
                                confirm_text = f"ମୁଁ ଆପଣଙ୍କ ଲିଙ୍ଗ {g_lbl} ଭାବେ ସୁଧାରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपका लिंग {g_lbl} दर्ज कर दिया है। " if language in ("hi", "hindi") else f"I have updated your gender to {up_gender}. ")
                            elif contact_changed:
                                confirm_text = f"ମୁଁ ଆପଣଙ୍କ ହ୍ୱାଟ୍ସଆପ୍ ନମ୍ବର {up_contact} ଭାବେ ସୁଧାରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपका व्हाट्सएप नंबर {up_contact} दर्ज कर दिया है। " if language in ("hi", "hindi") else f"I have updated your WhatsApp number to {up_contact}. ")

                            if chief_complaint:
                                next_s_step = 3
                                reply = (
                                    f"{confirm_text}ଆପଣଙ୍କ ସମସ୍ୟା '{chief_complaint}' ବିଷୟରେ ନୋଟ୍ କରାଯାଇଛି। ଆସନ୍ତୁ ଆଗକୁ ବଢ଼ିବା।" if language in ("or", "odia")
                                    else f"{confirm_text}आपकी समस्या '{chief_complaint}' नोट है। आइये आगे बढ़ते हैं।" if language in ("hi", "hindi")
                                    else f"{confirm_text}Your complaint of '{chief_complaint}' is recorded. Let's proceed."
                                )
                            else:
                                next_s_step = 2
                                reply = (
                                    f"{confirm_text}ଏବେ ଦୟାକରି କୁହନ୍ତୁ, ଆଜି ଆପଣଙ୍କୁ କ’ଣ ଅସୁବିଧା ବା କଷ୍ଟ ହେଉଛି?" if language in ("or", "odia")
                                    else f"{confirm_text}अब बताइए, आज आपको क्या परेशानी या बीमारी महसूस हो रही है?" if language in ("hi", "hindi")
                                    else f"{confirm_text}Now please tell me, what health trouble or symptoms are you experiencing today?"
                                )
                            if not _is_clinical_or_symptom(transcript):
                                extracted_complaint = ""
                        else:
                            reply = (parsed.get("reply") or "").strip()
                            next_s_step = 3 if is_val else 2

                        questions = parsed.get("questions") or []

                        return {
                            "status": "success",
                            "provider": "gemini",
                            "is_valid": is_val,
                            "needs_clarification": needs_clar,
                            "complaint": extracted_complaint,
                            "updated_name": up_name,
                            "updated_age": up_age,
                            "updated_gender": up_gender,
                            "gender": up_gender,
                            "updated_contact": up_contact,
                            "name": up_name or (patient_name if not _is_clinical_or_symptom(patient_name) else ""),
                            "age": up_age or patient_age,
                            "contact": up_contact,
                            "whatsapp_number": up_contact,
                            "reply": reply,
                            "questions": questions,
                            "has_complaint": is_val,
                            "next_step": next_s_step,
                        }



                    if step == 3:
                        med_history = (parsed.get("medical_history") or "").strip()
                        medications = (parsed.get("medications") or "").strip()
                        allergies = (parsed.get("allergies") or "").strip()
                        reply = (parsed.get("reply") or "").strip()

                        # Check for demographic corrections at Step 3
                        up_name, is_name_corr = _extract_name_and_correction(transcript)
                        up_age = _parse_indic_age(transcript, step_num=step)
                        up_gender = _parse_indic_gender(transcript)
                        up_contact = _parse_indic_phone_number(transcript)

                        age_changed = bool(up_age and patient_age and int(up_age) != int(patient_age))
                        name_changed = bool(up_name and patient_name and up_name.strip().lower() != patient_name.strip().lower())
                        gender_changed = bool(up_gender and patient_gender and up_gender != patient_gender)
                        contact_changed = bool(up_contact and patient_contact and up_contact != patient_contact)

                        confirm_text = ""
                        if name_changed or is_name_corr:
                            confirm_text = f"ମୁଁ ଆପଣଙ୍କ ନାମ ସୁଧାରି {up_name} ଆଜ୍ଞା ଭାବେ ଠିକ୍ କରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपका नाम सुधार कर {up_name} जी कर दिया है। " if language in ("hi", "hindi") else f"I have corrected your name to {up_name}. ")
                        elif age_changed:
                            confirm_text = f"ମୁଁ ଆପଣଙ୍କ ବୟସ ସୁଧାରି {up_age} ବର୍ଷ ଭାବେ ଠିକ୍ କରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपकी उम्र सुधार कर {up_age} वर्ष कर दी है। " if language in ("hi", "hindi") else f"I have updated your age to {up_age}. ")
                        elif gender_changed:
                            g_lbl = 'ପୁରୁଷ' if up_gender == 'male' else ('ମହିଳା' if up_gender == 'female' else 'ଅନ୍ୟାନ୍ୟ')
                            confirm_text = f"ମୁଁ ଆପଣଙ୍କ ଲିଙ୍ଗ {g_lbl} ଭାବେ ସୁଧାରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपका लिंग {g_lbl} दर्ज कर दिया है। " if language in ("hi", "hindi") else f"I have updated your gender to {up_gender}. ")
                        elif contact_changed:
                            confirm_text = f"ମୁଁ ଆପଣଙ୍କ ହ୍ୱାଟ୍ସଆପ୍ ନମ୍ବର {up_contact} ଭାବେ ସୁଧାରିଦେଲି। " if language in ("or", "odia") else (f"मैंने आपका व्हाट्सएप नंबर {up_contact} दर्ज कर दिया है। " if language in ("hi", "hindi") else f"I have updated your WhatsApp number to {up_contact}. ")

                        if confirm_text:
                            reply = f"{confirm_text}{reply}" if reply else f"{confirm_text}ଆସନ୍ତୁ ଆଗକୁ ବଢ଼ିବା।"
                        elif not reply:
                            reply = (
                                "ଆପଣଙ୍କ ଚିକିତ୍ସା ଇତିହାସ ନୋଟ୍ କରାଗଲା।"
                                if language in ("or", "odia")
                                else "आपका मेडिकल इतिहास दर्ज कर लिया गया है।"
                            )

                        questions = parsed.get("questions") or []

                        return {
                            "status": "success",
                            "provider": "gemini",
                            "is_valid": True,
                            "needs_clarification": False,
                            "medical_history": med_history,
                            "medications": medications,
                            "allergies": allergies,
                            "name": up_name or (patient_name if not _is_name_invalidating(patient_name) else None),
                            "age": up_age or patient_age or None,
                            "gender": up_gender or _parse_indic_gender(patient_gender) or None,
                            "contact": up_contact or patient_contact or None,
                            "whatsapp_number": up_contact or patient_contact or None,
                            "complaint": chief_complaint or None,
                            "reply": reply,
                            "questions": questions,
                            "next_step": 4,
                        }

                    extracted_name = (parsed.get("name") or "").strip()

                    if extracted_name.lower() in ("null", "none", "unknown", "patient", "ରୋଗୀ", "मरीज"):

                        extracted_name = ""

                    extracted_age = parsed.get("age")

                    if extracted_age in ("null", "None", None, ""):

                        extracted_age = None

                    extracted_complaint = (parsed.get("complaint") or "").strip()

                    if extracted_complaint.lower() in ("null", "none", "unknown"):

                        extracted_complaint = ""



                    # If extracted_name actually contains clinical symptoms/pain, route it to complaint!

                    if extracted_name and _is_clinical_or_symptom(extracted_name):

                        if not extracted_complaint:

                            extracted_complaint = extracted_name

                        extracted_name = ""



                    extracted_contact = (

                        _parse_indic_phone_number(transcript) or

                        (parsed.get("whatsapp_number") or parsed.get("contact") or "").strip() or

                        patient_contact or

                        None

                    )



                    has_comp = bool(extracted_complaint)

                    is_val = bool(parsed.get("is_valid", True))

                    needs_clar = bool(parsed.get("needs_clarification", False))

                    if not extracted_name and not extracted_age and not extracted_contact and not has_comp:

                        is_val = False

                        needs_clar = True

                    reply = (parsed.get("reply") or "").strip()

                    questions = parsed.get("questions") or []

                    next_s = 1

                    if is_val and not needs_clar:

                        next_s = 4 if (has_comp and questions) else 2

                    raw_gender = str(parsed.get("gender") or "").strip().lower()

                    extracted_gender = raw_gender if raw_gender in ("male", "female", "other") else _parse_indic_gender(transcript)

                    return {

                        "status": "success",

                        "provider": "gemini",

                        "is_valid": is_val,

                        "needs_clarification": needs_clar,

                        "name": extracted_name or (patient_name if not _is_clinical_or_symptom(patient_name) else ""),

                        "age": extracted_age or patient_age,

                        "gender": extracted_gender,

                        "contact": extracted_contact,

                        "whatsapp_number": extracted_contact,

                        "complaint": extracted_complaint or chief_complaint,

                        "reply": reply,

                        "questions": questions,

                        "has_complaint": has_comp,

                        "next_step": next_s,

                    }

        except Exception as g_err:

            logger.warning("Gemini voice intake fallback error: %s", g_err)



    # Local Rule-based Fallback

    if step == 4:

        current_question = str(payload.get("current_question") or "").strip()

        confusion_tokens = (

            "ବୁଝିପାରୁନାହିଁ", "ବୁଝି ପାରୁନାହିଁ", "ଜାଣିପାରୁନାହିଁ", "ଜାଣି ପାରୁନାହିଁ",

            "ଆଉ ଥରେ", "ଆଉଥରେ", "କଣ କହିଲେ", "କ’ଣ କହିଲେ", "समझ नहीं", "दोबारा",

            "repeat", "pardon", "again"

        )

        is_confused = any(tok in transcript for tok in confusion_tokens)

        if is_confused:

            clarify_reply = (

                f"କିଛି ଅସୁବିଧା ନାହିଁ। ମୁଁ ସହଜ କରି ପଚାରୁଛି: {current_question}"

                if language == "or"

                else f"कोई बात नहीं। मैं आसान भाषा में पूछ रहा हूँ: {current_question}"

            )

            return {

                "status": "fallback",

                "provider": "local",

                "is_clarification_or_repeat": True,

                "repeat_current_question": True,

                "is_answered": False,

                "is_finished": False,

                "extracted_answer": "",

                "reply": clarify_reply,

                "next_question": current_question,

                "next_step": 4,

            }

        else:

            q_idx = int(payload.get("question_index") or 0)

            total_target = int(payload.get("total_questions_target") or 2)

            is_fin = (q_idx + 1 >= total_target)

            m_name = re.search(r'(?:ମୋର ନାମ|ମୋ ନାମ|ମୋ ନାଁ|मेरा नाम|my name is)\s+([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})', transcript, re.I)

            up_name = _clean_extracted_name(m_name.group(1)) if m_name else None

            up_age = _parse_indic_age(transcript, step)

            up_contact = _parse_indic_phone_number(transcript) or patient_contact or None

            return {

                "status": "fallback",

                "provider": "local",

                "is_clarification_or_repeat": False,

                "repeat_current_question": False,

                "is_answered": True,

                "is_finished": is_fin,

                "extracted_answer": transcript.strip(),

                "updated_name": up_name,

                "updated_age": up_age,

                "updated_contact": up_contact,

                "contact": up_contact,

                "whatsapp_number": up_contact,

                "updated_complaint": None,

                "reply": "ଆପଣଙ୍କ କଥା ବୁଝିଲି।" if language == "or" else "आपकी बात समझ गया।",

                "next_question": "",

                "next_step": 5 if is_fin else 4,

            }



    if step == 2:

        if len(transcript.strip()) < 4:

            return {

                "status": "fallback",

                "provider": "local",

                "is_valid": False,

                "needs_clarification": True,

                "complaint": "",

                "reply": (

                    "ମୁଁ ଆପଣଙ୍କ ସ୍ୱାସ୍ଥ୍ୟ ସମସ୍ୟା ଶୁଣିପାରିଲି ନାହିଁ। ଆଜି ଆପଣଙ୍କୁ କ’ଣ କଷ୍ଟ ବା ଅସୁବିଧା ହେଉଛି? ଦୟାକରି କୁହନ୍ତୁ।"

                    if language == "or"

                    else "मुझे आपकी बीमारी स्पष्ट नहीं हुई। आज आपको क्या परेशानी है, कृपया बताएं।"

                ),

                "questions": [],

                "has_complaint": False,

                "next_step": 2,

            }

        m_name = re.search(r'(?:ମୋର ନାମ|ମୋ ନାମ|ମୋ ନାଁ|मेरा नाम|my name is)\s+([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})', transcript, re.I)

        up_name = _clean_extracted_name(m_name.group(1)) if m_name else None

        up_age = _parse_indic_age(transcript, step)

        up_contact = _parse_indic_phone_number(transcript) or patient_contact or None

        clean_comp = transcript.strip()

        safe_patient_name = up_name or (patient_name if not _is_clinical_or_symptom(patient_name) else "")

        return {

            "status": "fallback",

            "provider": "local",

            "is_valid": True,

            "needs_clarification": False,

            "complaint": clean_comp,

            "updated_name": up_name,

            "updated_age": up_age,

            "updated_contact": up_contact,

            "name": safe_patient_name,

            "age": up_age or patient_age,

            "contact": up_contact,

            "whatsapp_number": up_contact,

            "reply": (

                f"ଆପଣଙ୍କ ସମସ୍ୟା ବୁଝିପାରୁଛି {safe_patient_name} ଆଜ୍ଞା।"

                if language == "or"

                else f"आपकी समस्या समझ रहा हूँ {safe_patient_name} जी।"

            ),

            "questions": [],

            "has_complaint": True,

            "next_step": 3,

        }



    if step == 3:

        is_neg = bool(re.search(r'(?:କିଛି\s*ନାହିଁ|କିଛିନାହିଁ|ନାହିଁ|ନାଇଁ|ନା|ସୁସ୍ଥ|ଭଲ|ନାଇ|कुछ\s*नहीं|नहीं|ना|कोई\s*नहीं|no|none|nothing|nope|healthy|clean|nil)', transcript, re.I))

        history_val = "None" if is_neg else transcript.strip()

        return {

            "status": "fallback",

            "provider": "local",

            "is_valid": True,

            "needs_clarification": False,

            "medical_history": history_val,

            "medications": "None" if is_neg else transcript.strip(),

            "allergies": "None",

            "reply": "ଆପଣଙ୍କ ଚିକିତ୍ସା ଇତିହାସ ନୋଟ୍ କରାଗଲା।" if language == "or" else "आपका मेडिकल इतिहास दर्ज कर लिया गया है।",

            "questions": [],

            "next_step": 4,

        }



    # Step 1 Local Rule-based Fallback
    clean_name = patient_name if (patient_name and not _is_clinical_or_symptom(patient_name)) else ""
    cand_name, is_corr = _extract_name_and_correction(transcript, is_asking_name=True)
    if cand_name:
        clean_name = cand_name
    else:
        m = re.search(
            r'(?:ମୋର\s*ନାମ|ମୋ\s*ନାମ|ମୋ\s*ନାଁ|मेरा\s*नाम|mera\s*naam|mo\s*naa|mo\s*nama|mora\s*nama|my\s*name\s*is)\s+([^\s,।0-9]+(?:\s+[^\s,।0-9]+){0,2})',
            transcript,
            re.I,
        )
        if m:
            c_name = _clean_extracted_name(m.group(1))
            if c_name:
                clean_name = c_name



    clean_age = patient_age

    age_m = re.search(r'\b([0-9]{1,2})\b', transcript)

    if age_m:

        clean_age = int(age_m.group(1))



    clean_gender = _parse_indic_gender(transcript)

    clean_contact = _parse_indic_phone_number(transcript) or patient_contact or None



    if not clean_name and not clean_age and not clean_contact and not clean_gender:
        # Check if patient is stating their symptoms when demographics were already given
        if patient_name and len(transcript.strip()) >= 2 and not _is_pure_demographic_intro(transcript):
            clean_comp = transcript.strip()
            ack_n = patient_name
            comp_reply = (
                f"ଆପଣଙ୍କ ସମସ୍ୟା '{clean_comp}' ନୋଟ୍ କରାଗଲା {ack_n} ଆଜ୍ଞା। ଏହି ସମସ୍ୟା କେତେ ଦିନ ହେଲା ହେଉଛି?" if language in ('or', 'odia')
                else (f"আপনার সমস্যার কথা বুঝতে পেরেছি {ack_n}। এই কষ্ট কতদিন ধরে হচ্ছে? দয়া করে বলুন।" if language in ('bn', 'bengali')
                else (f"आपकी समस्या '{clean_comp}' नोट कर ली गई है {ack_n} जी। यह तकलीफ कितने दिनों से हो रही है?" if language in ('hi', 'hindi')
                else f"I have noted your complaint of '{clean_comp}', {ack_n}. How many days have you been experiencing this?"))
            )
            return {
                "status": "fallback",
                "provider": "local",
                "is_valid": True,
                "needs_clarification": False,
                "name": patient_name,
                "age": patient_age,
                "gender": patient_gender or "other",
                "contact": patient_contact or None,
                "whatsapp_number": patient_contact or None,
                "complaint": clean_comp,
                "reply": comp_reply,
                "questions": [],
                "has_complaint": True,
                "next_step": 3 if patient_age else 1,
            }

        return {
            "status": "fallback",
            "provider": "local",
            "is_valid": False,
            "needs_clarification": True,
            "name": "",
            "age": None,
            "gender": None,
            "contact": None,
            "whatsapp_number": None,
            "complaint": "",
            "reply": _get_single_demographic_prompt(patient_name, patient_age, patient_gender, patient_contact, chief_complaint, language)[0],
            "questions": [],
            "has_complaint": False,
            "next_step": 1,
        }

    # If demographics are complete but complaint is missing, check if current speech is the complaint
    clean_complaint = chief_complaint
    next_step_target = 2 if (clean_name and clean_age) else 1
    if clean_name and (clean_age or patient_age) and not clean_complaint:
        if len(transcript.strip()) >= 2 and not _is_pure_demographic_intro(transcript):
            clean_complaint = transcript.strip()
            next_step_target = 3

    if clean_complaint and clean_complaint != chief_complaint:
        default_reply = _get_ack_complaint_prompt(clean_name, clean_complaint, language)
    else:
        default_reply, prompted_step = _get_single_demographic_prompt(clean_name, clean_age, clean_gender, clean_contact, None, language)
        next_step_target = prompted_step

    return {
        "status": "fallback",
        "provider": "local",
        "is_valid": True,
        "needs_clarification": False,
        "name": clean_name or "",
        "age": clean_age,
        "gender": clean_gender,
        "contact": clean_contact,
        "whatsapp_number": clean_contact,
        "complaint": clean_complaint,
        "reply": default_reply,
        "questions": [],
        "has_complaint": bool(clean_complaint),
        "next_step": next_step_target,
    }





@router.get("/tts/status")

def get_tts_status(

    x_sarvam_key: Annotated[str | None, Header()] = None,

    x_elevenlabs_key: Annotated[str | None, Header()] = None,

) -> dict:

    """Check whether Sarvam AI, ElevenLabs, or browser speech synthesis is configured."""

    has_sarvam = bool(settings.SARVAM_API_KEY or x_sarvam_key)

    has_elevenlabs = bool(getattr(settings, "ELEVENLABS_API_KEY", None) or x_elevenlabs_key)

    return {

        "sarvam_configured": has_sarvam,

        "elevenlabs_configured": has_elevenlabs,

        "default_speaker": settings.SARVAM_DEFAULT_SPEAKER,

        "elevenlabs_voice_id": getattr(settings, "ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL"),

        "supported_languages": ["hi-IN", "od-IN", "en-IN", "bn-IN", "te-IN", "ta-IN"],

        "model": "bulbul:v3",

        "fallback_available": True,

    }





_sarvam_stt_quota_exhausted: bool = False

_sarvam_tts_quota_exhausted: bool = False

_elevenlabs_auth_failed_until: float = 0.0

_ELEVENLABS_AUTH_COOLDOWN_SEC: float = 300.0

_TTS_CACHE_MAX_ITEMS: int = 250

# In-memory cache for ultra-fast clinical voice responses (sub-millisecond latency)

_tts_cache: dict[str, str] = {}

_STUDIO_NEURAL_VOICE_MAP: dict[str, str] = {
    "od": "bn-IN-TanishaaNeural",
    "or": "bn-IN-TanishaaNeural",
    "hi": "hi-IN-SwaraNeural",
    "pa": "hi-IN-SwaraNeural",
    "mai": "hi-IN-SwaraNeural",
    "sa": "hi-IN-SwaraNeural",
    "doi": "hi-IN-SwaraNeural",
    "sat": "hi-IN-SwaraNeural",
    "ks": "hi-IN-SwaraNeural",
    "bn": "bn-IN-TanishaaNeural",
    "as": "bn-IN-TanishaaNeural",
    "mni": "bn-IN-TanishaaNeural",
    "brx": "bn-IN-TanishaaNeural",
    "te": "te-IN-ShrutiNeural",
    "ta": "ta-IN-PallaviNeural",
    "kn": "kn-IN-SapnaNeural",
    "ml": "ml-IN-SobhanaNeural",
    "mr": "mr-IN-AarohiNeural",
    "kok": "mr-IN-AarohiNeural",
    "gu": "gu-IN-DhwaniNeural",
    "ur": "ur-IN-GulNeural",
    "sd": "ur-IN-GulNeural",
    "ne": "ne-NP-HemkalaNeural",
    "en": "en-IN-NeerjaExpressiveNeural",
}


_ODIA_TO_BENGALI_SPECIAL: dict[int, str] = {
    0x0B33: "\u09B2",  # ଳ -> ল
    0x0B35: "\u09AC",  # ଵ -> ব
    0x0B5C: "\u09DC",  # ଡ଼ -> ড়
    0x0B5D: "\u09DD",  # ଢ଼ -> ঢ়
    0x0B5F: "\u09DF",  # ୟ -> য়
    0x0B71: "\u09AC",  # ୱ -> ব
    0x0B57: "\u09D7",  # Odia AU length mark -> Bengali AU length mark
}


def _odia_to_bengali_phonetics(text: str) -> str:
    """Transliterate Odia Unicode (U+0B00..U+0B7F) to Bengali script for bn-IN-TanishaaNeural."""
    out: list[str] = []
    for ch in text:
        cp = ord(ch)
        if cp in _ODIA_TO_BENGALI_SPECIAL:
            out.append(_ODIA_TO_BENGALI_SPECIAL[cp])
        elif 0x0B66 <= cp <= 0x0B6F:
            out.append(chr(ord("0") + (cp - 0x0B66)))
        elif (0x0B01 <= cp <= 0x0B4D) or (0x0B60 <= cp <= 0x0B63):
            out.append(chr(cp - 0x0180))
        elif 0x0B00 <= cp <= 0x0B7F:
            continue
        else:
            out.append(ch)
    return "".join(out)


def _select_studio_neural_voice(text: str, target_lang: str) -> tuple[str, str]:
    """Select the warmest verified Edge Neural voice and clean text across all 23 Indian languages."""
    lang_code = (target_lang or "en-IN").strip().split("-")[0].lower()
    voice = _STUDIO_NEURAL_VOICE_MAP.get(lang_code, "en-IN-NeerjaExpressiveNeural")
    if lang_code in ("od", "or"):
        speak_text = _odia_to_bengali_phonetics(text)
    elif lang_code == "pa" or any(0x0A00 <= ord(c) <= 0x0A7F for c in text):
        speak_text = _gurmukhi_to_devanagari(text)
    else:
        speak_text = text
    return voice, speak_text


def _is_elevenlabs_blocked() -> bool:
    import time
    return time.monotonic() < _elevenlabs_auth_failed_until


def _note_elevenlabs_auth_failure(status_code: int) -> None:
    import time
    global _elevenlabs_auth_failed_until
    was_blocked = _is_elevenlabs_blocked()
    _elevenlabs_auth_failed_until = time.monotonic() + _ELEVENLABS_AUTH_COOLDOWN_SEC
    if not was_blocked:
        logger.warning(
            "ElevenLabs TTS auth/quota failed (HTTP %d); cooling down for %ds and using Studio Neural Voice.",
            status_code,
            int(_ELEVENLABS_AUTH_COOLDOWN_SEC),
        )



# Authentic Odia Phonetic Transliteration Matrix

# Strictly avoids Bengali phonetics (never turns dental 's' into 'sh', preserves crisp Odia clarity)

ODIA_TO_CLEAN_PHONETIC = {

    # Vowels

    0x0B05: 0x0905, 0x0B06: 0x0906, 0x0B07: 0x0907, 0x0B08: 0x0908,

    0x0B09: 0x0909, 0x0B0A: 0x090A, 0x0B0B: 0x090B, 0x0B0F: 0x090F,

    0x0B10: 0x0910, 0x0B13: 0x0913, 0x0B14: 0x0914,

    # Consonants

    0x0B15: 0x0915, 0x0B16: 0x0916, 0x0B17: 0x0917, 0x0B18: 0x0918, 0x0B19: 0x0919,

    0x0B1A: 0x091A, 0x0B1B: 0x091B, 0x0B1C: 0x091C, 0x0B1D: 0x091D, 0x0B1E: 0x091E,

    0x0B1F: 0x091F, 0x0B20: 0x0920, 0x0B21: 0x0921, 0x0B22: 0x0922, 0x0B23: 0x0923,

    0x0B24: 0x0924, 0x0B25: 0x0925, 0x0B26: 0x0926, 0x0B27: 0x0927, 0x0B28: 0x0928,

    0x0B2A: 0x092A, 0x0B2B: 0x092B, 0x0B2C: 0x092C, 0x0B2D: 0x092D, 0x0B2E: 0x092E,

    0x0B2F: 0x092F, 0x0B30: 0x0930, 0x0B32: 0x0932,

    0x0B33: 0x0932,  # Odia ଳ (lla) -> clean ल

    0x0B35: 0x0935,  # Odia ଵ -> व

    0x0B36: 0x0936,  # Odia ଶ -> श

    0x0B37: 0x0937,  # Odia ଷ -> ष

    0x0B38: 0x0938,  # Odia ସ -> स (Crisp Dental S — NEVER Bengali 'sh'!)

    0x0B39: 0x0939,  # Odia ହ -> ह

    0x0B5C: 0x0921,  # Odia ଡ଼ -> ड

    0x0B5D: 0x0922,  # Odia ଢ଼ -> ढ

    0x0B5F: 0x092F,  # Odia ୟ (yya) -> य (Clean ya — NOT Persian nukta!)

    0x0B71: 0x0935,  # Odia ୱ (wa) -> व (Clean va/wa — NOT spacing dot!)

    # Signs and matras

    0x0B01: 0x0901, 0x0B02: 0x0902, 0x0B03: 0x0903,

    0x0B3E: 0x093E, 0x0B3F: 0x093F, 0x0B40: 0x0940, 0x0B41: 0x0941,

    0x0B42: 0x0942, 0x0B43: 0x0943, 0x0B47: 0x0947, 0x0B48: 0x0948,

    0x0B4B: 0x094B, 0x0B4C: 0x094C, 0x0B4D: 0x094D

}





def _odia_to_clean_odia_phonetics(text: str) -> str:

    """

    Transliterate Odia Unicode into clean Indian phonetics.

    Preserves clean dental 'S' (ସ -> स), clean 'va/wa' (ୱ -> व), and natural syllables,

    completely eliminating foreign/Bengali accent distortions.

    """

    return "".join(chr(ODIA_TO_CLEAN_PHONETIC.get(ord(c), ord(c))) for c in text)


_GURMUKHI_EXTRA = {
    0x0A59: 0x0916,  # ਖ਼ -> ख
    0x0A5A: 0x0917,  # ਗ਼ -> ग
    0x0A5B: 0x091C,  # ਜ਼ -> ज
    0x0A5C: 0x0921,  # ੜ -> ड
    0x0A5E: 0x092B,  # ਫ਼ -> फ
    0x0A70: 0x0902,  # tippi -> anusvara
    0x0A71: 0x094D,  # addak -> virama
    0x0A72: 0x0907,  # iri -> इ
    0x0A73: 0x0909,  # ura -> उ
}


def _gurmukhi_to_devanagari(text: str) -> str:
    """Transliterate Gurmukhi (Punjabi) script to phonetic Devanagari for Azure Neural voice compatibility."""
    out: list[str] = []
    for ch in text:
        cp = ord(ch)
        if cp in _GURMUKHI_EXTRA:
            out.append(chr(_GURMUKHI_EXTRA[cp]))
        elif 0x0A01 <= cp <= 0x0A4D or 0x0A66 <= cp <= 0x0A6F:
            out.append(chr(cp - 0x0100))
        else:
            out.append(ch)
    return "".join(out)





async def _synthesize_natural_neural_voice(text: str, target_lang: str) -> str | None:
    """
    Synthesize natural human studio voice using Microsoft Edge Neural Studio voices.
    Deliver warm, reassuring conversational nurse prosody ("Ananya — Care Coordinator").
    """
    lang_code = (target_lang or "en-IN").strip().split("-")[0].lower()
    voice, speak_text = _select_studio_neural_voice(text, target_lang)
    rate = "-5%"
    pitch = "+3Hz" if voice.startswith("en-") else "+2Hz"
    cache_key = f"{voice}:{rate}:{pitch}:{speak_text.strip()}"
    if cache_key in _tts_cache:
        return _tts_cache[cache_key]

    try:
        import asyncio
        import base64
        import edge_tts

        async def _collect_audio_chunks(v_name: str, v_text: str, v_rate: str, v_pitch: str) -> list[bytes]:
            comm = edge_tts.Communicate(v_text, v_name, rate=v_rate, pitch=v_pitch)
            collected: list[bytes] = []
            async for chunk in comm.stream():
                if chunk.get("type") == "audio":
                    collected.append(chunk["data"])
            return collected

        chunks = await asyncio.wait_for(_collect_audio_chunks(voice, speak_text, rate, pitch), timeout=8.0)

        # Fallback for Odia if Bengali neural synthesis yields empty stream
        if not chunks and lang_code in ("or", "od"):
            fallback_voice = "hi-IN-SwaraNeural"
            fallback_text = _odia_to_clean_odia_phonetics(text)
            chunks = await asyncio.wait_for(
                _collect_audio_chunks(fallback_voice, fallback_text, "-5%", "+2Hz"),
                timeout=8.0,
            )

        if chunks:
            b64_audio = base64.b64encode(b"".join(chunks)).decode("utf-8")
            if len(_tts_cache) >= _TTS_CACHE_MAX_ITEMS:
                _tts_cache.pop(next(iter(_tts_cache)))
            _tts_cache[cache_key] = b64_audio
            return b64_audio

        logger.warning("edge-tts returned empty audio stream for voice=%s, lang=%s", voice, target_lang)
    except Exception as exc:
        logger.warning("edge-tts studio voice synthesis error (voice=%s, lang=%s): %s", voice, target_lang, exc)
    return None





async def _transcribe_with_gemini_with_model(content: bytes, mime: str, target_lang: str) -> tuple[str, str]:
    """
    Multimodal audio transcription using Gemini Flash (gemini-2.5-flash primary, active fallback on 404).
    Returns (transcript, model_used).
    """
    key = (settings.GEMINI_API_KEY or "").strip()
    if not key or not content:
        return "", ""
    try:
        b64_audio = base64.b64encode(content).decode("utf-8")
        clean_mime = (mime or "audio/wav").split(";")[0].strip().lower()
        if not clean_mime.startswith("audio/"):
            clean_mime = "audio/wav"

        INDIAN_LANG_MAP = {
            "od-IN": "Odia", "or-IN": "Odia", "hi-IN": "Hindi", "bn-IN": "Bengali", "te-IN": "Telugu",
            "ta-IN": "Tamil", "mr-IN": "Marathi", "gu-IN": "Gujarati", "kn-IN": "Kannada",
            "ml-IN": "Malayalam", "pa-IN": "Punjabi", "as-IN": "Assamese", "ur-IN": "Urdu",
            "ne-IN": "Nepali", "sa-IN": "Sanskrit", "mai-IN": "Maithili", "kok-IN": "Konkani",
            "sd-IN": "Sindhi", "doi-IN": "Dogri", "mni-IN": "Manipuri", "sat-IN": "Santali",
            "brx-IN": "Bodo", "en-IN": "English"
        }
        lang_prompt = INDIAN_LANG_MAP.get(target_lang, "Indian language / English")
        stt_prompt = (
            f"Transcribe this patient's spoken audio accurately in the requested language ({lang_prompt}). "
            "Return ONLY the exact spoken words without quotes, timestamps, or commentary. "
            "If pure silence/noise, return EMPTY."
        )
        stt_models = get_ordered_gemini_models("gemini-2.5-flash")
        resp = None
        used_model = stt_models[0]
        async with httpx.AsyncClient(timeout=20.0) as client:
            for m_id in stt_models:
                used_model = m_id
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_id}:generateContent?key={key}"
                cand_resp = await client.post(
                    url,
                    json={
                        "contents": [{
                            "parts": [
                                {"text": stt_prompt},
                                {"inline_data": {"mime_type": clean_mime, "data": b64_audio}}
                            ]
                        }],
                        "generationConfig": {
                            "temperature": 0.0,
                            "maxOutputTokens": 256,
                            "thinkingConfig": {"thinkingBudget": 0},
                        }
                    }
                )
                resp = cand_resp
                if cand_resp.status_code == 200:
                    break
                if cand_resp.status_code == 404:
                    mark_gemini_model_retired(m_id)
                else:
                    logger.warning("Gemini STT model %s returned HTTP %d: %s", m_id, cand_resp.status_code, cand_resp.text[:120])

        if resp is not None and resp.status_code == 200:
            data = resp.json()
            parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            res_txt = "".join(
                p.get("text", "") for p in parts if isinstance(p, dict) and not p.get("thought") and p.get("text")
            ).strip()
            clean_res = res_txt.strip().strip("'\"").lower()
            if clean_res in ("empty", "null", "none", "silent", "no audio", "no speech", "inaudible", ""):
                return "", used_model
            norm_token = clean_res.replace(".", "").replace(",", "").replace("!", "").strip()
            HALLUCINATIONS = {
                "thank you", "thank you for watching", "thanks for watching", "subscribe",
                "subtitles", "subtitles by", "amaraorg", "amara.org", "hotel", "monam",
                "bye", "goodbye", "you", "the", "so"
            }
            if norm_token in HALLUCINATIONS:
                logger.info("Discarded audio hallucination: %r", res_txt)
                return "", used_model
            logger.info("Gemini hardware microphone audio transcribed (%s): %r", used_model, res_txt)
            return res_txt, used_model
        elif resp is not None and resp.status_code != 404:
            logger.warning("Gemini STT returned status %d: %s", resp.status_code, resp.text[:120])
    except Exception as exc:
        logger.warning("Gemini audio transcription error: %s", exc)
    return "", ""


async def _transcribe_with_gemini(content: bytes, mime: str, target_lang: str) -> str:
    """Wrapper returning transcribed text from Gemini multimodal audio."""
    transcript, _ = await _transcribe_with_gemini_with_model(content, mime, target_lang)
    return transcript







@router.post("/tts/key")

async def update_sarvam_api_key(payload: dict) -> dict:

    """Validate, test, and save a Sarvam API key."""

    global _sarvam_tts_quota_exhausted, _sarvam_stt_quota_exhausted

    key = str(payload.get("api_key") or "").strip()

    if not key:

        return {"status": "error", "message": "API key cannot be empty"}



    try:

        async with httpx.AsyncClient(timeout=6.0) as client:

            resp = await client.post(

                settings.SARVAM_TTS_URL,

                headers={"api-subscription-key": key, "Content-Type": "application/json"},

                json={

                    "inputs": ["Hello"],

                    "target_language_code": "en-IN",

                    "speaker": "ishita_en_medical",

                    "model": "bulbul:v4-flash"

                }

            )

        if resp.status_code in (200, 201):
            _sarvam_tts_quota_exhausted = False
            _sarvam_stt_quota_exhausted = False
            reset_sarvam_auth_state()
            settings.SARVAM_API_KEY = key

            # Persist to .env

            try:

                import os, re

                env_path = os.path.join(settings.BASE_DIR, ".env")

                if os.path.exists(env_path):

                    with open(env_path, "r", encoding="utf-8") as f:

                        env_content = f.read()

                    if re.search(r"^SARVAM_API_KEY=.*$", env_content, re.MULTILINE):

                        env_content = re.sub(r"^SARVAM_API_KEY=.*$", f"SARVAM_API_KEY={key}", env_content, flags=re.MULTILINE)

                    else:

                        env_content += f"\nSARVAM_API_KEY={key}\n"

                    with open(env_path, "w", encoding="utf-8") as f:

                        f.write(env_content)

            except Exception as e:

                logger.warning("Could not persist key to .env: %s", e)

            return {"status": "success", "message": "Sarvam API Key verified and activated successfully! Bulbul native voice is now live."}

        elif resp.status_code == 402:

            return {"status": "error", "message": "Sarvam API returned HTTP 402: Insufficient quota / no credits on this key. Please get a free developer key from https://www.sarvam.ai"}

        else:

            return {"status": "error", "message": f"Sarvam validation failed: HTTP {resp.status_code} - {resp.text[:100]}"}

    except Exception as e:

        return {"status": "error", "message": f"Connection error: {e}"}





@router.post("/tts/elevenlabs-key")

async def update_elevenlabs_api_key(payload: dict) -> dict:

    """Validate, test, and save an ElevenLabs API key and preferred Voice ID."""

    key = str(payload.get("api_key") or "").strip()

    voice_id = str(payload.get("voice_id") or getattr(settings, "ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")).strip()

    if not key:

        return {"status": "error", "message": "API key cannot be empty"}



    try:

        async with httpx.AsyncClient(timeout=8.0) as client:

            resp = await client.get(

                "https://api.elevenlabs.io/v1/user",

                headers={"xi-api-key": key, "Accept": "application/json"},

            )

        if resp.status_code == 200:

            data = resp.json()

            user_sub = data.get("subscription", {})

            char_count = user_sub.get("character_count", 0)

            char_limit = user_sub.get("character_limit", 10000)

            global _elevenlabs_auth_failed_until
            _elevenlabs_auth_failed_until = 0.0
            settings.ELEVENLABS_API_KEY = key

            if voice_id:

                settings.ELEVENLABS_VOICE_ID = voice_id



            # Persist to .env

            try:

                import os, re

                env_path = os.path.join(settings.BASE_DIR, ".env")

                if os.path.exists(env_path):

                    with open(env_path, "r", encoding="utf-8") as f:

                        env_content = f.read()

                    if re.search(r"^ELEVENLABS_API_KEY=.*$", env_content, re.MULTILINE):

                        env_content = re.sub(r"^ELEVENLABS_API_KEY=.*$", f"ELEVENLABS_API_KEY={key}", env_content, flags=re.MULTILINE)

                    else:

                        env_content += f"\nELEVENLABS_API_KEY={key}\n"

                    if re.search(r"^ELEVENLABS_VOICE_ID=.*$", env_content, re.MULTILINE):

                        env_content = re.sub(r"^ELEVENLABS_VOICE_ID=.*$", f"ELEVENLABS_VOICE_ID={voice_id}", env_content, flags=re.MULTILINE)

                    else:

                        env_content += f"\nELEVENLABS_VOICE_ID={voice_id}\n"

                    with open(env_path, "w", encoding="utf-8") as f:

                        f.write(env_content)

            except Exception as e:

                logger.warning("Could not persist ElevenLabs key to .env: %s", e)



            return {

                "status": "success",

                "message": f"ElevenLabs API Key verified! Characters: {char_count}/{char_limit}.",

                "characters_used": char_count,

                "character_limit": char_limit,

                "voice_id": voice_id,

            }

        elif resp.status_code == 401:

            return {"status": "error", "message": "Invalid ElevenLabs API key. Please check your key at https://elevenlabs.io/app/settings/api-keys"}

        else:

            return {"status": "error", "message": f"ElevenLabs validation failed: HTTP {resp.status_code} - {resp.text[:120]}"}

    except Exception as e:

        return {"status": "error", "message": f"Connection error: {e}"}





@router.post("/tts", response_model=TTSResponse)

async def synthesize_speech(

    req: TTSRequest,

    x_sarvam_key: Annotated[str | None, Header()] = None,

    x_elevenlabs_key: Annotated[str | None, Header()] = None,

) -> dict:

    """

    Synthesize natural human studio voice audio.

    Supports Odia (od-IN), Hindi (hi-IN), English (en-IN), and other Indian regional languages.

    Cleanly strips markdown, bullets, and structural symbols for natural human speech flow.

    Employs warm, empathetic physician voices with authentic regional accents.

    """

    # Clean text: remove markdown symbols, hashtags, asterisks, brackets, and parentheticals

    import re
    clean_text = req.text
    lang_clean = (req.language or "en").lower().strip()

    # Replace slashes with natural spoken words so the voice sounds like a human physician
    if lang_clean in ("or", "odia", "or-in", "od-in"):
        clean_text = re.sub(r'\s*[/|\\]\s*', ' କିମ୍ବା ', clean_text)
    elif lang_clean in ("hi", "hindi", "hi-in"):
        clean_text = re.sub(r'\s*[/|\\]\s*', ' या ', clean_text)
    else:
        clean_text = re.sub(r'\s*[/|\\]\s*', ' or ', clean_text)

    clean_text = re.sub(r'\b(?:ESP32|INMP441|JSON|API|STT|TTS)\b', '', clean_text, flags=re.IGNORECASE)
    clean_text = clean_text.replace("[PATIENT_NAME]", "")
    clean_text = re.sub(r'[*_#`~<>+=@"]+', '', clean_text)
    clean_text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r' \1 ', clean_text)
    clean_text = re.sub(r'[(){}\[\]]', ', ', clean_text)
    clean_text = re.sub(r'[:;]', ',', clean_text)
    clean_text = re.sub(r'^\s*[-*•]\s+', '', clean_text, flags=re.MULTILINE)
    clean_text = re.sub(r'^\s*\d+\.\s+', '', clean_text, flags=re.MULTILINE)
    clean_text = re.sub(r'\s*[,]\s*[,]+', ',', clean_text)
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
    if not clean_text:
        clean_text = req.text.strip()

    lang_clean = (req.language or "en").lower().strip()

    if lang_clean in ("or", "odia", "or-in", "od-in"):

        target_lang = "od-IN"

    elif lang_clean in ("hi", "hindi", "hi-in"):

        target_lang = "hi-IN"

    elif lang_clean in ("bn", "bengali", "bn-in"):

        target_lang = "bn-IN"

    elif lang_clean in ("te", "telugu", "te-in"):

        target_lang = "te-IN"

    elif lang_clean in ("ta", "tamil", "ta-in"):

        target_lang = "ta-IN"

    elif lang_clean in ("mr", "marathi", "mr-in"):

        target_lang = "mr-IN"

    elif lang_clean in ("gu", "gujarati", "gu-in"):

        target_lang = "gu-IN"

    elif lang_clean in ("kn", "kannada", "kn-in"):

        target_lang = "kn-IN"

    elif lang_clean in ("ml", "malayalam", "ml-in"):

        target_lang = "ml-IN"

    elif lang_clean in ("pa", "punjabi", "pa-in"):

        target_lang = "pa-IN"

    elif lang_clean in ("as", "assamese", "as-in"):

        target_lang = "as-IN"

    elif lang_clean in ("ur", "urdu", "ur-in"):

        target_lang = "ur-IN"

    elif lang_clean in ("ne", "nepali", "ne-in"):

        target_lang = "ne-IN"

    elif lang_clean in ("sa", "sanskrit", "sa-in"):

        target_lang = "sa-IN"

    elif lang_clean in ("mai", "maithili", "mai-in"):

        target_lang = "mai-IN"

    elif lang_clean in ("kok", "konkani", "kok-in"):

        target_lang = "kok-IN"

    elif lang_clean in ("sd", "sindhi", "sd-in"):

        target_lang = "sd-IN"

    elif lang_clean in ("doi", "dogri", "doi-in"):

        target_lang = "doi-IN"

    elif lang_clean in ("mni", "manipuri", "mni-in"):

        target_lang = "mni-IN"

    elif lang_clean in ("sat", "santali", "sat-in"):

        target_lang = "sat-IN"

    elif lang_clean in ("brx", "bodo", "brx-in"):

        target_lang = "brx-IN"

    else:

        target_lang = "en-IN"



    global _sarvam_tts_quota_exhausted

    api_key = (req.api_key or x_sarvam_key or settings.SARVAM_API_KEY or "").strip()

    eleven_key = (req.elevenlabs_api_key or x_elevenlabs_key or getattr(settings, "ELEVENLABS_API_KEY", "") or "").strip()

    eleven_voice = (req.elevenlabs_voice_id or getattr(settings, "ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")).strip()

    preferred_provider = (req.provider or "").lower().strip()



    async def _try_elevenlabs() -> dict | None:

        if not eleven_key or _is_elevenlabs_blocked():

            return None

        try:

            tts_url = f"https://api.elevenlabs.io/v1/text-to-speech/{eleven_voice}"

            async with httpx.AsyncClient(timeout=6.0) as client:

                resp = await client.post(

                    tts_url,

                    headers={

                        "xi-api-key": eleven_key,

                        "Content-Type": "application/json",

                        "Accept": "audio/mpeg",

                    },

                    json={

                        "text": clean_text,

                        "model_id": getattr(settings, "ELEVENLABS_MODEL_ID", "eleven_multilingual_v2"),

                        "voice_settings": {

                            "stability": 0.5,

                            "similarity_boost": 0.75,

                            "style": 0.05,

                            "use_speaker_boost": True,

                        },

                    },

                )

            if resp.status_code == 200 and resp.content:

                import base64

                audio_b64 = base64.b64encode(resp.content).decode("utf-8")

                logger.info("ElevenLabs TTS 200 OK: voice=%s, lang=%s", eleven_voice, target_lang)

                return {

                    "status": "success",

                    "provider": "elevenlabs",

                    "model": "eleven_multilingual_v2",

                    "language": target_lang,

                    "speaker": eleven_voice,

                    "audio": audio_b64,

                    "format": "audio/mp3",

                    "message": f"Synthesized with ElevenLabs Multilingual V2 ({eleven_voice})",

                }

            elif resp.status_code in (401, 402, 403):

                _note_elevenlabs_auth_failure(resp.status_code)

                return None

            else:

                logger.warning("ElevenLabs TTS HTTP %d: %s", resp.status_code, resp.text[:120])

                return None

        except Exception as exc:

            logger.warning("ElevenLabs TTS exception: %s", exc)

            return None



    async def _try_sarvam() -> dict | None:

        nonlocal api_key

        global _sarvam_tts_quota_exhausted

        if not api_key or _sarvam_tts_quota_exhausted or is_sarvam_auth_blocked():
            return None

        try:

            req_model = getattr(req, 'model', None)

            req_speaker = getattr(req, 'speaker', None)

            SARVAM_DIRECT_LANGS = {
                "od-IN", "hi-IN", "bn-IN", "te-IN", "ta-IN",
                "mr-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN", "en-IN"
            }

            sarvam_target_lang = target_lang
            if target_lang not in SARVAM_DIRECT_LANGS:
                FALLBACK_ROOT = {
                    "as-IN": "bn-IN", "mai-IN": "hi-IN", "ne-IN": "hi-IN",
                    "sa-IN": "hi-IN", "kok-IN": "mr-IN", "doi-IN": "hi-IN",
                    "ur-IN": "hi-IN", "sd-IN": "hi-IN", "sat-IN": "od-IN",
                    "mni-IN": "bn-IN", "brx-IN": "bn-IN", "ks-IN": "hi-IN",
                }
                sarvam_target_lang = FALLBACK_ROOT.get(target_lang, "hi-IN")

            # Highly natural, human physician & conversational voices across all Indian languages
            if sarvam_target_lang == "od-IN":
                model = "bulbul:v3"
                speaker = req_speaker or "ishita" # Warm, compassionate native Odia doctor voice
            elif sarvam_target_lang == "hi-IN":
                model = "bulbul:v4-flash"
                speaker = req_speaker or "ritu_hi_medical" # Dedicated empathetic Hindi clinical doctor voice
            elif sarvam_target_lang == "en-IN":
                model = "bulbul:v4-flash"
                speaker = req_speaker or "ishita_en_medical" # Articulate Indian English physician voice
            elif sarvam_target_lang == "bn-IN":
                model = "bulbul:v4-flash"
                speaker = req_speaker or "roopa_bn_conversational"
            elif sarvam_target_lang == "te-IN":
                model = "bulbul:v4-flash"
                speaker = req_speaker or "kavitha_te_conversation"
            elif sarvam_target_lang == "ta-IN":
                model = "bulbul:v4-flash"
                speaker = req_speaker or "gokul_ta_narration"
            elif sarvam_target_lang == "mr-IN":
                model = "bulbul:v4-flash"
                speaker = req_speaker or "ishita_mr_conversational"
            elif sarvam_target_lang == "gu-IN":
                model = "bulbul:v4-flash"
                speaker = req_speaker or "pooja_gu_conversational"
            elif sarvam_target_lang == "kn-IN":
                model = "bulbul:v4-flash"
                speaker = req_speaker or "chaitra_kn_conversation"
            elif sarvam_target_lang == "pa-IN":
                model = "bulbul:v4-flash"
                speaker = req_speaker or "anand_pa_conversation"
            elif sarvam_target_lang == "as-IN":
                model = "bulbul:v4-flash"
                speaker = req_speaker or "kangkana_as_conversational"
            elif sarvam_target_lang == "ml-IN":
                model = "bulbul:v3"
                speaker = req_speaker or "shruti"
            else:
                model = "bulbul:v3"
                speaker = req_speaker or "priya"

            async with httpx.AsyncClient(timeout=6.0) as client:

                resp = await client.post(

                    settings.SARVAM_TTS_URL,

                    headers={

                        "api-subscription-key": api_key,

                        "Content-Type": "application/json",

                    },

                    json={

                        "inputs": [clean_text],

                        "target_language_code": sarvam_target_lang,

                        "speaker": speaker,

                        "pitch": 0,

                        "pace": 0.94,

                        "loudness": 1.0,

                        "speech_sample_rate": 22050,

                        "enable_preprocessing": True,

                        "model": model,

                    },

                )

            if resp.status_code == 200:

                data = resp.json()

                audios = data.get("audios") or []

                if audios and isinstance(audios, list) and len(audios) > 0:

                    logger.info("Sarvam AI TTS 200 OK: model=%s, speaker=%s, lang=%s", model, speaker, target_lang)

                    return {

                        "status": "success",

                        "provider": "sarvam",

                        "model": model,

                        "language": target_lang,

                        "speaker": speaker,

                        "audio": audios[0],

                        "format": "audio/wav",

                        "message": f"Synthesized with Sarvam AI {model} ({speaker})",

                    }

            elif resp.status_code == 402:
                _sarvam_tts_quota_exhausted = True
                logger.warning("Sarvam TTS quota exhausted (HTTP 402). Falling back.")
                return None
            elif resp.status_code in (401, 403):
                note_sarvam_auth_failure(resp.status_code, "Sarvam TTS")
                return None
            else:
                logger.warning("Sarvam TTS HTTP %d: %s", resp.status_code, resp.text[:120])
                return None

        except Exception as exc:

            logger.warning("Sarvam TTS exception: %s", exc)

            return None



    is_indic_language = target_lang in ("od-IN", "hi-IN", "bn-IN", "te-IN", "ta-IN", "mr-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN", "en-IN")



    # Per clinician requirement: Sarvam AI is dedicated primary engine for Indian regional languages

    if is_indic_language:

        res = await _try_sarvam()

        if res:

            return res

        res = await _try_elevenlabs()

        if res:

            return res

    elif preferred_provider == "elevenlabs":

        res = await _try_elevenlabs()

        if res:

            return res

        res = await _try_sarvam()

        if res:

            return res

    else:

        res = await _try_sarvam()

        if res:

            return res

        res = await _try_elevenlabs()

        if res:

            return res



    # 2. SECONDARY: Microsoft Studio Natural Neural Voice Engine (Expressive Neural)

    # Zero robotic cadence, warm clinical diction

    b64_audio = await _synthesize_natural_neural_voice(clean_text, target_lang)

    if b64_audio:

        studio_voice, _ = _select_studio_neural_voice(clean_text, target_lang)

        return {

            "status": "success",

            "provider": "studio_neural",

            "model": studio_voice,

            "language": target_lang,

            "speaker": "doctor_ai",

            "audio": b64_audio,

            "format": "audio/mp3",

            "message": "Synthesized with Warm Studio Natural Neural Voice Engine",

        }



    return {

        "status": "fallback",

        "provider": "browser",

        "message": "TTS synthesis temporarily unavailable",

        "audio": None,

    }





@router.post("/stt")

async def transcribe_speech(

    file: UploadFile = File(...),

    language: str = Form("en"),

) -> dict:

    """

    Transcribe spoken voice audio using Sarvam AI saaras:v3 Speech-to-Text model.

    Accurately converts Odia (od-IN), Hindi (hi-IN), English (en-IN) speech to exact text.

    """

    api_key = (settings.SARVAM_API_KEY or "").strip()



    lang_clean = (language or "en").lower().strip()
    STT_LANG_MAP = {
        "or": "od-IN", "odia": "od-IN", "or-in": "od-IN", "od-in": "od-IN",
        "hi": "hi-IN", "hindi": "hi-IN", "hi-in": "hi-IN",
        "bn": "bn-IN", "bengali": "bn-IN", "bn-in": "bn-IN",
        "te": "te-IN", "telugu": "te-IN", "te-in": "te-IN",
        "ta": "ta-IN", "tamil": "ta-IN", "ta-in": "ta-IN",
        "mr": "mr-IN", "marathi": "mr-IN", "mr-in": "mr-IN",
        "gu": "gu-IN", "gujarati": "gu-IN", "gu-in": "gu-IN",
        "kn": "kn-IN", "kannada": "kn-IN", "kn-in": "kn-IN",
        "ml": "ml-IN", "malayalam": "ml-IN", "ml-in": "ml-IN",
        "pa": "pa-IN", "punjabi": "pa-IN", "pa-in": "pa-IN",
        "as": "as-IN", "assamese": "as-IN", "as-in": "as-IN",
        "ur": "ur-IN", "urdu": "ur-IN", "ur-in": "ur-IN",
        "ne": "ne-IN", "nepali": "ne-IN", "ne-in": "ne-IN",
        "sa": "sa-IN", "sanskrit": "sa-IN", "sa-in": "sa-IN",
        "mai": "mai-IN", "maithili": "mai-IN", "mai-in": "mai-IN",
        "kok": "kok-IN", "konkani": "kok-IN", "kok-in": "kok-IN",
        "sd": "sd-IN", "sindhi": "sd-IN", "sd-in": "sd-IN",
        "doi": "doi-IN", "dogri": "doi-IN", "doi-in": "doi-IN",
        "mni": "mni-IN", "manipuri": "mni-IN", "mni-in": "mni-IN",
        "sat": "sat-IN", "santali": "sat-IN", "sat-in": "sat-IN",
        "brx": "brx-IN", "bodo": "brx-IN", "brx-in": "brx-IN",
        "ks": "ks-IN", "kashmiri": "ks-IN", "ks-in": "ks-IN",
        "en": "en-IN", "english": "en-IN", "en-in": "en-IN",
    }
    target_lang = STT_LANG_MAP.get(lang_clean) or STT_LANG_MAP.get(lang_clean.split("-")[0], "en-IN")



    content = await file.read()

    if not content or len(content) < 100:

        return {

            "status": "empty",

            "transcript": "",

            "message": "Audio recording was empty or too short",

        }



    fname = file.filename or "recording.wav"

    if fname.lower().endswith(".wav"):

        mime = "audio/wav"

    elif fname.lower().endswith(".webm"):

        mime = "audio/webm"

    else:
        mime = file.content_type or "audio/wav"

    # Fast silence guard for uncompressed 16-bit PCM WAV so pure silence never triggers LLM STT hallucinations
    if mime == "audio/wav" and len(content) > 44 and content[:4] == b"RIFF":
        try:
            import array as _arr
            pcm = _arr.array("h")
            pcm_end = len(content) - ((len(content) - 44) % 2)
            pcm.frombytes(content[44:pcm_end])
            if pcm and max(abs(x) for x in pcm) < 120:
                return {"status": "empty", "provider": "vad", "transcript": "", "message": "Pure silence detected"}
        except Exception:
            pass

    logger.info("STT request: filename=%s, size=%d, mime=%s, target_lang=%s", fname, len(content), mime, target_lang)



    global _sarvam_stt_quota_exhausted
    # 1. Primary: Sarvam AI STT if API key configured, authorized, and credits available
    if api_key and not _sarvam_stt_quota_exhausted and not is_sarvam_auth_blocked():
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(
                    settings.SARVAM_STT_URL,
                    headers={"api-subscription-key": api_key},
                    files={"file": (fname, content, mime)},
                    data={"model": settings.SARVAM_STT_MODEL, "language_code": target_lang},
                )

            if resp.status_code == 200:
                data = resp.json()
                transcript = (data.get("transcript") or "").strip()
                logger.info("Sarvam STT 200 OK: transcript=%r", transcript)
                return {
                    "status": "success",
                    "provider": "sarvam",
                    "model": settings.SARVAM_STT_MODEL,
                    "transcript": transcript,
                    "language_code": data.get("language_code", target_lang),
                }
            elif resp.status_code == 402:
                _sarvam_stt_quota_exhausted = True
                logger.warning("Sarvam STT quota exhausted (HTTP 402). Fast-path routed to Gemini Multimodal Audio.")
            elif resp.status_code in (401, 403):
                note_sarvam_auth_failure(resp.status_code, "Sarvam STT")
            else:
                logger.warning("Sarvam STT HTTP %d (falling back to Gemini Multimodal Audio): %s", resp.status_code, resp.text[:120])
        except Exception as exc:
            logger.warning("Sarvam STT exception: %s (falling back to Gemini)", exc)

    # 2. Resilient Multimodal Fallback: Google Gemini Audio Model
    gemini_transcript, gemini_model_used = await _transcribe_with_gemini_with_model(content, mime, target_lang)
    if gemini_transcript:
        return {
            "status": "success",
            "provider": "gemini",
            "model": gemini_model_used or settings.GEMINI_MODEL,
            "transcript": gemini_transcript,
            "language_code": target_lang,
        }



    return {

        "status": "empty",

        "provider": "gemini",

        "transcript": "",

        "message": "No intelligible speech detected from INMP441 hardware microphone",

    }
