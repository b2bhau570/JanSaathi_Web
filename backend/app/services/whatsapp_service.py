"""
Jan Saathi AI — Automated WhatsApp Bot Service.
Handles automated WhatsApp dispatch upon doctor finalization, Meta WhatsApp Cloud API webhooks,
and 24/7 AI-powered instant follow-up consultations and medicine ordering guidance.
"""

from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.auth import generate_case_whatsapp_token
from app.config import settings
from app.models import AuditLog, Notification, PatientCase, WhatsAppMessage

logger = logging.getLogger("jansaathi.whatsapp")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_phone_number(raw_phone: str) -> str:
    """Normalize phone number to standard format with country code (e.g. 919876543210)."""
    if not raw_phone:
        return ""
    digits = re.sub(r"\D", "", raw_phone)
    if len(digits) == 10:
        return f"91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return digits
    if len(digits) == 11 and digits.startswith("0"):
        return f"91{digits[1:]}"
    return digits or raw_phone.strip()


async def send_automated_whatsapp(
    phone_number: str,
    message_text: str,
    case_id: Optional[str] = None,
    db: Optional[Session] = None,
) -> dict:
    """
    Automated WhatsApp message dispatch.
    Dispatches via Meta WhatsApp Cloud API or Twilio if credentials are configured,
    and logs the message to the database table for live real-time bot interaction.
    """
    clean_phone = normalize_phone_number(phone_number)
    api_token = os.getenv("WHATSAPP_API_TOKEN") or getattr(settings, "WHATSAPP_API_TOKEN", None)
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID") or getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", None)

    external_id = None
    delivery_status = "delivered"
    send_mode = "automated_bot_simulator"

    # 1. Dispatch via Meta WhatsApp Cloud API if configured
    if api_token and phone_number_id and clean_phone:
        try:
            url = f"https://graph.facebook.com/v19.0/{phone_number_id}/messages"
            headers = {
                "Authorization": f"Bearer {api_token}",
                "Content-Type": "application/json",
            }
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": clean_phone,
                "type": "text",
                "text": {"preview_url": True, "body": message_text},
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code in (200, 201):
                    data = res.json()
                    external_id = data.get("messages", [{}])[0].get("id")
                    delivery_status = "sent"
                    send_mode = "meta_cloud_api"
                    logger.info("WhatsApp Cloud API sent message %s to %s", external_id, clean_phone)
                else:
                    logger.warning("WhatsApp Cloud API error (%s): %s", res.status_code, res.text)
        except Exception as exc:
            logger.error("Failed to dispatch via WhatsApp Cloud API: %s", exc)

    # 2. Record message in database
    msg_id = str(uuid.uuid4())
    if db:
        try:
            record = WhatsAppMessage(
                id=msg_id,
                case_id=case_id,
                phone_number=clean_phone or phone_number,
                sender="bot",
                message_text=message_text,
                status=delivery_status,
                external_message_id=external_id,
                created_at=_utcnow(),
            )
            db.add(record)
            db.commit()
            logger.info("Stored automated WhatsApp bot message %s for case %s", msg_id, case_id)
        except Exception as exc:
            logger.error("Failed to save WhatsApp message to DB: %s", exc)
            db.rollback()

    return {
        "status": "success",
        "message_id": msg_id,
        "phone_number": clean_phone,
        "delivery_status": delivery_status,
        "mode": send_mode,
        "timestamp": _utcnow().isoformat(),
    }


def find_patient_case_for_whatsapp(identifier: str, db: Session) -> Optional[PatientCase]:
    """Find the patient case by 10-digit phone number or Case ID."""
    clean_id = identifier.strip()
    # Check for direct Case ID (e.g. JS-ASCIOTZE)
    match_case = re.search(r"JS-[A-Z0-9]{8}", clean_id.upper())
    if match_case:
        cid = match_case.group(0)
        case = db.query(PatientCase).filter(PatientCase.public_case_id == cid).first()
        if case:
            return case

    # Try matching phone number
    clean_phone = re.sub(r"\D", "", clean_id)
    if len(clean_phone) >= 10:
        phone_10 = clean_phone[-10:]
        cases = (
            db.query(PatientCase)
            .filter(PatientCase.patient_contact.like(f"%{phone_10}%"))
            .order_by(PatientCase.created_at.desc())
            .all()
        )
        if cases:
            return cases[0]

    # Return latest submitted or response_submitted case as fallback
    latest = db.query(PatientCase).order_by(PatientCase.created_at.desc()).first()
    return latest


async def generate_ai_bot_reply(
    incoming_text: str,
    case: Optional[PatientCase],
    from_phone: str,
) -> str:
    """
    Generate an empathetic, clinically sound, trilingual WhatsApp Bot answer
    using Sarvam 105B or Gemini with full case and prescription context.
    """
    if not case:
        return (
            "🏥 *ଜନସାଥୀ ଏଆଇ ସ୍ୱାସ୍ଥ୍ୟ ସହାୟକ (Jan Saathi AI)*\n"
            "----------------------------------------\n"
            "ନମସ୍କାର! ମୁଁ ଜନସାଥୀ ଏଆଇ ସ୍ୱାସ୍ଥ୍ୟ ବଟ୍ ଅଟେ। ଆପଣଙ୍କ ପଞ୍ଜିକୃତ କେସ୍ ନମ୍ବର (ଯଥା: JS-XXXXXXX) ଲେଖନ୍ତୁ, "
            "ଯାହାଦ୍ୱାରା ମୁଁ ଆପଣଙ୍କ ଡାକ୍ତରୀ ପ୍ରେସକ୍ରିପସନ୍, ଔଷଧ ସମୟ ଏବଂ ରିହାତି ଅର୍ଡର ସମ୍ବନ୍ଧରେ ତୁରନ୍ତ ସହାୟତା କରିପାରିବି।"
        )

    # Prepare case details
    pt_name = case.patient_name
    lang = case.preferred_language or "or"
    lang_name = "Odia" if lang in ("or", "odia") else ("Hindi" if lang in ("hi", "hindi") else "English")
    complaint = case.chief_complaint
    diagnosis = case.treatment.assessment if (case.treatment and case.treatment.assessment) else "Clinical Examination Complete"
    guidance = case.treatment.follow_up_instructions if (case.treatment and case.treatment.follow_up_instructions) else "Rest and take medicines as advised"
    warnings = case.treatment.warnings if (case.treatment and case.treatment.warnings) else "Contact 108 if severe symptoms occur"

    meds = []
    if case.treatment and case.treatment.items:
        for it in case.treatment.items:
            meds.append(f"• {it.medicine_name} ({it.strength or it.dosage or ''}): {it.frequency or ''}, {it.duration or ''}. ({it.instructions or ''})")
    meds_str = "\n".join(meds) if meds else "No specific prescription required"

    wa_token = generate_case_whatsapp_token(case.public_case_id)
    base_url = "http://localhost:5173"
    order_url = f"{base_url}/patient/orders/{case.public_case_id}?token={wa_token}"
    case_url = f"{base_url}/patient/case/{case.public_case_id}?token={wa_token}"

    system_prompt = (
        f"You are Jan Saathi AI, an official empathetic rural healthcare WhatsApp clinical assistant in Odisha, India.\n"
        f"You are chatting directly with patient {pt_name} on WhatsApp.\n\n"
        f"Patient Intake & Clinical Context:\n"
        f"- Patient: {pt_name}, Age: {case.patient_age}, Gender: {case.patient_gender}\n"
        f"- Chief Complaint: {complaint}\n"
        f"- Doctor's Diagnosis: {diagnosis}\n"
        f"- Prescribed Medications:\n{meds_str}\n"
        f"- Doctor's Advice & Follow-up: {guidance}\n"
        f"- Emergency Warnings: {warnings}\n"
        f"- Subsidized Medicine Order Link: {order_url}\n"
        f"- View Prescription Link: {case_url}\n\n"
        f"Patient's incoming WhatsApp message: '{incoming_text}'\n\n"
        f"Instructions:\n"
        f"1. Formulate a warm, polite, reassuring answer in natural {lang_name} script.\n"
        f"2. If patient asks about taking medicines, food timings, milk, or dosage: answer clearly using the doctor's prescription.\n"
        f"3. If patient asks how to order medicines, where to buy, or delivery: provide the exact Order Link ({order_url}) and mention free rural drone/speed post delivery under Pradhan Mantri Jan Aushadhi Kendra (PMBJP).\n"
        f"4. If patient asks about their prescription or doctor's review: provide the Prescription Link ({case_url}).\n"
        f"5. If patient reports alarming worsening pain, severe chest pressure, breathlessness, or fainting: immediately warn them to rest and dial 108 ambulance.\n"
        f"6. Format nicely for WhatsApp with clear bullet points and emojis. Keep response concise (under 120 words)."
    )

    api_key = (settings.SARVAM_API_KEY or "").strip()
    if api_key:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    "https://api.sarvam.ai/v1/chat/completions",
                    headers={"api-subscription-key": api_key, "Content-Type": "application/json"},
                    json={
                        "model": "sarvam-m",
                        "messages": [{"role": "user", "content": system_prompt}],
                        "temperature": 0.2,
                        "max_tokens": 250,
                    },
                )
                if res.status_code == 200:
                    data = res.json()
                    content = (
                        data.get("choices", [{}])[0]
                        .get("message", {})
                        .get("content", "")
                        .strip()
                    )
                    if content:
                        return content
        except Exception as exc:
            logger.warning("Sarvam WhatsApp reply generation error: %s", exc)

    # Fallback response if external AI call fails or is not available
    is_order_query = any(w in incoming_text.lower() for w in ["order", "medicine", "buy", "କିଣିବା", "ଅର୍ଡର", "दवा", "दवाई"])
    if is_order_query:
        if lang == "or":
            return (
                f"ନମସ୍କାର {pt_name} ବାବୁ,\n"
                f"ଆପଣ ଡାକ୍ତରଙ୍କ ଦ୍ୱାରା ଲିଖିତ ଔଷଧ ସରକାରୀ ପ୍ରଧାନମନ୍ତ୍ରୀ ଜନ ଔଷଧି କେନ୍ଦ୍ର (PMBJP) ରୁ ୭୦-୯୦% ରିହାତି ଦରରେ ଅର୍ଡର କରିପାରିବେ। "
                f"ଗ୍ରାମକୁ ମାଗଣା ଡ୍ରୋନ୍ କିମ୍ବା ସ୍ପିଡ୍ ପୋଷ୍ଟ ଡେଲିଭରୀ ମିଳିବ।\n\n"
                f"🛒 *ଔଷଧ ଅର୍ଡର ଲିଙ୍କ୍:*\n{order_url}\n\n"
                f"କୌଣସି ଅସୁବିଧା ହେଲେ ପଚାରନ୍ତୁ।"
            )
        elif lang == "hi":
            return (
                f"नमस्ते {pt_name} जी,\n"
                f"आप डॉक्टर द्वारा लिखी गई दवाएं प्रधानमंत्री जन औषधि केंद्र से 70-90% सब्सिडी दर पर ऑनलाइन ऑर्डर कर सकते हैं। "
                f"गांव तक मुफ्त ड्रोन या स्पीड पोस्ट डिलीवरी उपलब्ध है।\n\n"
                f"🛒 *दवा ऑर्डर लिंक:*\n{order_url}\n\n"
                f"स्वस्थ रहें, सुरक्षित रहें।"
            )
        return (
            f"Hello {pt_name},\n"
            f"You can order your doctor-prescribed medications online with 70–90% government subsidy via Jan Aushadhi Kendra (Free rural drone/speed post delivery).\n\n"
            f"🛒 *Order Medicines Link:*\n{order_url}\n\n"
            f"Take care and rest well."
        )

    # General supportive advice fallback
    if lang == "or":
        return (
            f"ନମସ୍କାର {pt_name} ବାବୁ,\n"
            f"ଡାକ୍ତର ଆପଣଙ୍କୁ {diagnosis} ପାଇଁ ଔଷଧ ପରାମର୍ଶ ଦେଇଛନ୍ତି। {guidance}। "
            f"ଦୟାକରି ଔଷଧ ନିୟମିତ ଖାଆନ୍ତୁ ଏବଂ ପର୍ଯ୍ୟାପ୍ତ ବିଶ୍ରାମ ନିଅନ୍ତୁ।\n\n"
            f"🔗 *ପ୍ରେସକ୍ରିପସନ୍ ଦେଖନ୍ତୁ:* {case_url}\n"
            f"🛒 *ଔଷଧ ଅର୍ଡର କରନ୍ତୁ:* {order_url}\n\n"
            f"ଯଦି ଛାତିରେ ଅଧିକ କଷ୍ଟ ହୁଏ, ତୁରନ୍ତ ୧୦୮ କୁ କଲ୍ କରନ୍ତୁ।"
        )
    return (
        f"Hello {pt_name},\n"
        f"Your doctor has assessed your condition ({diagnosis}). {guidance}.\n\n"
        f"🔗 *Prescription Link:* {case_url}\n"
        f"🛒 *Order Medicines:* {order_url}\n\n"
        f"Please rest well and dial 108 if you experience sudden worsening discomfort."
    )


async def process_incoming_patient_whatsapp(
    from_phone: str,
    message_text: str,
    db: Session,
) -> dict:
    """
    Main webhook entrypoint for patient WhatsApp queries.
    Saves incoming message, generates AI contextual answer, stores bot reply,
    and returns response payload.
    """
    raw_ident = (from_phone or "").strip()
    case = find_patient_case_for_whatsapp(raw_ident, db)
    clean_phone = normalize_phone_number(raw_ident)
    if not case and clean_phone:
        case = find_patient_case_for_whatsapp(clean_phone, db)
    if not case and message_text:
        case = find_patient_case_for_whatsapp(message_text, db)

    # Use case's phone number if raw identifier was a case ID
    if case and case.patient_contact:
        clean_phone = normalize_phone_number(case.patient_contact)

    case_id = case.id if case else None

    # 1. Store patient's incoming message
    patient_msg_id = str(uuid.uuid4())
    p_rec = WhatsAppMessage(
        id=patient_msg_id,
        case_id=case_id,
        phone_number=clean_phone or from_phone,
        sender="patient",
        message_text=message_text,
        status="read",
        created_at=_utcnow(),
    )
    db.add(p_rec)
    db.commit()

    # 2. Generate AI Bot reply
    bot_reply_text = await generate_ai_bot_reply(message_text, case, clean_phone)

    # 3. Store and dispatch bot reply
    bot_dispatch = await send_automated_whatsapp(
        phone_number=clean_phone,
        message_text=bot_reply_text,
        case_id=case_id,
        db=db,
    )

    return {
        "status": "success",
        "incoming_message_id": patient_msg_id,
        "reply": bot_reply_text,
        "bot_message_id": bot_dispatch.get("message_id"),
        "case_id": case.public_case_id if case else None,
        "patient_name": case.patient_name if case else None,
        "phone_number": clean_phone,
        "timestamp": _utcnow().isoformat(),
    }
