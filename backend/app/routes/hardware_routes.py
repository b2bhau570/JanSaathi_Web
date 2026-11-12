"""
Jan Saathi AI — ESP32-S3 Hardware Telemetry & Vital Signs API.
Handles real-time telemetry streaming (SpO2, Heart Rate, Temperature, Blood Pressure, ECG)
from the ESP32-S3 microcontroller to the clinical database and frontend monitors.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.auth import bearer_scheme, decode_access_token, hash_access_token, verify_case_access
from app.database import get_db
from app.models import Doctor, Measurement, PatientCase, TriageDecision
from app.schemas import MeasurementResponse
from app.services.triage_service import evaluate_triage

logger = logging.getLogger("jansaathi.hardware")

router = APIRouter(prefix="/hardware", tags=["Hardware Telemetry"])

# In-memory buffer of latest telemetry received from ESP32-S3 (no fabricated normal vitals)
_latest_hardware_telemetry: dict[str, Any] = {
    "device": "ESP32-S3-N16R8",
    "connected": False,
    "last_seen": None,
    "heart_rate": None,
    "spo2": None,
    "temperature": None,
    "blood_pressure_systolic": None,
    "blood_pressure_diastolic": None,
    "signal_quality": "no_finger",
    "ecg_sample": None,
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_float_or_none(val: Any) -> float | None:
    if val is None or val == "":
        return None
    try:
        num = float(val)
        return num if num > 0 else None
    except (TypeError, ValueError):
        return None


def _normalize_temp_c(val: float | None, unit: str | None = None) -> float | None:
    """Convert Fahrenheit readings (> 45.0 or unit=degF/F) to Celsius."""
    if val is None or val <= 0:
        return None
    u = str(unit or "").lower().strip()
    if val > 45.0 or u in ("f", "degf", "°f", "fahrenheit"):
        return round((val - 32.0) * 5.0 / 9.0, 2)
    return round(val, 2)


def _require_hardware_auth(
    db: Session,
    credentials: HTTPAuthorizationCredentials | None,
    case_token: str | None,
    public_case_id: str | None = None,
) -> PatientCase | Doctor:
    """
    Enforce authentication on all /hardware/* endpoints using either:
      - Approved Doctor JWT Bearer token, or
      - Valid Patient Case Access Token (X-Case-Access-Token / X-Access-Token / ?token=).
    """
    if credentials and credentials.credentials:
        token_data = decode_access_token(credentials.credentials)
        doctor = db.query(Doctor).filter(Doctor.id == token_data.doctor_id).first()
        if not doctor:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Doctor account not found")
        if doctor.status != "approved":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account not approved. Current status: {doctor.status}",
            )
        return doctor

    if case_token:
        if public_case_id:
            case = db.query(PatientCase).filter(PatientCase.public_case_id == public_case_id).first()
            if not case:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
            if not verify_case_access(case_token, case.access_token_hash, case.public_case_id):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid case access token")
            return case

        token_hash = hash_access_token(case_token)
        case = db.query(PatientCase).filter(PatientCase.access_token_hash == token_hash).first()
        if case:
            return case
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid case access token")

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required: provide an approved Doctor Bearer token or valid Patient Case Access Token.",
    )


@router.post("/telemetry")
def receive_esp32_telemetry(
    payload: dict[str, Any],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
    x_case_access_token: Annotated[str | None, Header()] = None,
    x_access_token: Annotated[str | None, Header()] = None,
    token: str | None = Query(None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Ingest live telemetry packet from ESP32-S3 (via Web Serial, USB bridge, or WiFi).
    Preserves None/0 for detached sensors and normalizes Fahrenheit temperatures to Celsius.
    """
    case_tok = x_case_access_token or x_access_token or token
    _require_hardware_auth(db, credentials, case_tok, payload.get("public_case_id"))

    global _latest_hardware_telemetry

    hr = _to_float_or_none(payload.get("hr") if payload.get("hr") is not None else payload.get("heart_rate"))
    spo2 = _to_float_or_none(payload.get("spo2"))
    raw_temp = _to_float_or_none(payload.get("temp") if payload.get("temp") is not None else payload.get("temperature"))
    temp_unit = payload.get("temperature_unit") or payload.get("unit")
    temp_c = _normalize_temp_c(raw_temp, temp_unit)

    raw_sys = payload.get("systolic_bp")
    if raw_sys is None:
        raw_sys = payload.get("blood_pressure")
    if raw_sys is None:
        raw_sys = payload.get("blood_pressure_systolic")
    if raw_sys is None:
        raw_sys = payload.get("bp_sys")
    bp_sys = _to_float_or_none(raw_sys)

    raw_dia = payload.get("diastolic_bp")
    if raw_dia is None:
        raw_dia = payload.get("blood_pressure_diastolic")
    if raw_dia is None:
        raw_dia = payload.get("bp_dia")
    bp_dia = _to_float_or_none(raw_dia)

    device = payload.get("device") or "ESP32-S3-N16R8"
    quality = payload.get("quality") or payload.get("signal_quality") or ("good" if (hr or spo2 or temp_c) else "no_finger")
    raw_ecg = payload.get("ecg") if payload.get("ecg") is not None else payload.get("ecg_sample")
    ecg = int(raw_ecg) if isinstance(raw_ecg, (int, float)) else None

    _latest_hardware_telemetry = {
        "device": str(device),
        "connected": True,
        "last_seen": _utcnow().isoformat(),
        "heart_rate": hr,
        "spo2": spo2,
        "temperature": temp_c,
        "temperature_unit": "°C",
        "blood_pressure_systolic": int(bp_sys) if bp_sys is not None else None,
        "blood_pressure_diastolic": int(bp_dia) if bp_dia is not None else None,
        "signal_quality": str(quality),
        "ecg_sample": ecg,
    }

    return {"status": "ok", "telemetry": _latest_hardware_telemetry}


@router.get("/telemetry/live")
def get_live_hardware_telemetry(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
    x_case_access_token: Annotated[str | None, Header()] = None,
    x_access_token: Annotated[str | None, Header()] = None,
    token: str | None = Query(None),
    public_case_id: str | None = Query(None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Retrieve current live telemetry streamed by the ESP32-S3 (requires doctor or case token auth).
    """
    case_tok = x_case_access_token or x_access_token or token
    _require_hardware_auth(db, credentials, case_tok, public_case_id)
    return _latest_hardware_telemetry


@router.post("/cases/{public_case_id}/measurements", response_model=list[MeasurementResponse])
def save_hardware_measurements_to_case(
    public_case_id: str,
    payload: dict[str, Any],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
    x_case_access_token: Annotated[str | None, Header()] = None,
    x_access_token: Annotated[str | None, Header()] = None,
    token: str | None = Query(None),
    db: Session = Depends(get_db),
) -> list[MeasurementResponse]:
    """
    Record valid telemetry from the ESP32-S3 directly into the patient case in the database.
    Requires approved Doctor JWT or valid Patient Case Access Token.
    Preserves None/0 for unattached probes (never injects fake vitals) and normalizes degF -> degC.
    """
    case_tok = x_case_access_token or x_access_token or token
    actor = _require_hardware_auth(db, credentials, case_tok, public_case_id)
    case = (
        actor
        if isinstance(actor, PatientCase)
        else db.query(PatientCase).filter(PatientCase.public_case_id == public_case_id).first()
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    hr = _to_float_or_none(payload.get("heart_rate") if payload.get("heart_rate") is not None else payload.get("hr"))
    spo2 = _to_float_or_none(payload.get("spo2"))
    raw_temp = _to_float_or_none(payload.get("temperature") if payload.get("temperature") is not None else payload.get("temp"))
    temp_unit = payload.get("temperature_unit") or payload.get("unit")
    temp_c = _normalize_temp_c(raw_temp, temp_unit)

    raw_sys = payload.get("systolic_bp")
    if raw_sys is None:
        raw_sys = payload.get("blood_pressure")
    if raw_sys is None:
        raw_sys = payload.get("blood_pressure_systolic")
    if raw_sys is None:
        raw_sys = payload.get("bp_sys")
    bp_sys = _to_float_or_none(raw_sys)

    raw_dia = payload.get("diastolic_bp")
    if raw_dia is None:
        raw_dia = payload.get("blood_pressure_diastolic")
    if raw_dia is None:
        raw_dia = payload.get("bp_dia")
    bp_dia = _to_float_or_none(raw_dia)

    device_id = str(payload.get("device") or "ESP32-S3-N16R8")
    quality = str(payload.get("signal_quality") or "good")

    now = _utcnow()
    readings: list[tuple[str, float, str]] = []
    if hr is not None:
        readings.append(("heart_rate", hr, "bpm"))
    if spo2 is not None:
        readings.append(("spo2", spo2, "%"))
    if temp_c is not None:
        readings.append(("temperature", temp_c, "°C"))
    if bp_sys is not None:
        dia_note = f"mmHg (sys/{int(bp_dia)} dia)" if bp_dia is not None else "mmHg"
        readings.append(("systolic_bp", bp_sys, dia_note))

    if not readings:
        return []

    saved_measurements: list[Measurement] = []
    meas_dicts: list[dict[str, float | str]] = []

    for m_type, val, unit in readings:
        m = Measurement(
            case_id=case.id,
            measurement_type=m_type,
            value=val,
            unit=unit,
            signal_quality=quality,
            source="esp32",
            device_id=device_id,
            recorded_at=now,
        )
        db.add(m)
        saved_measurements.append(m)
        meas_dicts.append({"measurement_type": m_type, "value": val, "unit": unit})

    # Re-evaluate triage using actual ESP32 vitals
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
            reason=f"Priority updated via ESP32-S3 hardware vitals: {new_triage.reason}",
            triggering_data=new_triage.triggering_data,
            rule_version=new_triage.rule_version,
        )
        db.add(triage_rec)

    db.commit()
    for m in saved_measurements:
        db.refresh(m)

    logger.info("Saved %d ESP32 hardware measurements to case %s", len(saved_measurements), public_case_id)
    return [MeasurementResponse.model_validate(m) for m in saved_measurements]

