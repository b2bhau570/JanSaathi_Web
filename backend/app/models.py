"""
Jan Saathi AI — SQLAlchemy ORM Data Models.
Reflects the database schema described in SYSTEM_ARCHITECTURE.md.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Doctor
# ---------------------------------------------------------------------------
class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(String(36), primary_key=True, default=_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    registration_number = Column(String(100), unique=True, nullable=True)
    issuing_authority = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)
    status = Column(
        String(20), nullable=False, default="pending"
    )  # pending | approved | rejected | suspended
    is_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    # relationships
    notes = relationship("DoctorNote", back_populates="doctor", cascade="all, delete-orphan")
    treatments = relationship("TreatmentRecord", back_populates="doctor", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="doctor", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# PatientCase
# ---------------------------------------------------------------------------
class PatientCase(Base):
    __tablename__ = "patient_cases"

    id = Column(String(36), primary_key=True, default=_uuid)
    public_case_id = Column(String(20), unique=True, nullable=False, index=True)
    access_token_hash = Column(String(255), nullable=False)

    # patient info
    patient_name = Column(String(255), nullable=False)
    patient_age = Column(Integer, nullable=False)
    patient_gender = Column(String(20), nullable=False)
    patient_contact = Column(String(100), nullable=True)
    preferred_language = Column(String(20), default="en", nullable=False)

    # complaint
    chief_complaint = Column(Text, nullable=False)
    complaint_duration = Column(String(100), nullable=True)
    severity = Column(String(20), nullable=True)  # mild / moderate / severe

    # history
    medical_history = Column(Text, nullable=True)
    allergies = Column(Text, nullable=True)
    current_medications = Column(Text, nullable=True)

    # workflow
    status = Column(
        String(30),
        nullable=False,
        default="submitted",
        index=True,
    )
    # submitted | awaiting_review | under_review | awaiting_info |
    # response_submitted | follow_up | closed

    priority = Column(String(20), default="normal", nullable=False)
    # normal | elevated | urgent | emergency

    assigned_doctor_id = Column(
        String(36), ForeignKey("doctors.id"), nullable=True, index=True
    )

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    # relationships
    assigned_doctor = relationship("Doctor", foreign_keys=[assigned_doctor_id])
    responses = relationship(
        "CaseResponse", back_populates="case", cascade="all, delete-orphan",
        order_by="CaseResponse.response_order",
    )
    documents = relationship("CaseDocument", back_populates="case", cascade="all, delete-orphan")
    triage_decisions = relationship(
        "TriageDecision", back_populates="case", cascade="all, delete-orphan",
        order_by="TriageDecision.created_at.desc()",
    )
    notes = relationship("DoctorNote", back_populates="case", cascade="all, delete-orphan")
    treatment = relationship(
        "TreatmentRecord", back_populates="case", cascade="all, delete-orphan", uselist=False
    )
    measurements = relationship("Measurement", back_populates="case", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="case", cascade="all, delete-orphan")
    whatsapp_messages = relationship("WhatsAppMessage", back_populates="case", cascade="all, delete-orphan", order_by="WhatsAppMessage.created_at")


# ---------------------------------------------------------------------------
# WhatsAppMessage
# ---------------------------------------------------------------------------
class WhatsAppMessage(Base):
    __tablename__ = "whatsapp_messages"

    id = Column(String(36), primary_key=True, default=_uuid)
    case_id = Column(
        String(36), ForeignKey("patient_cases.id"), nullable=True, index=True
    )
    phone_number = Column(String(25), nullable=False, index=True)
    sender = Column(String(10), nullable=False)  # "bot" or "patient"
    message_text = Column(Text, nullable=False)
    status = Column(String(20), default="delivered", nullable=False)  # sent | delivered | read | failed
    external_message_id = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    case = relationship("PatientCase", back_populates="whatsapp_messages")


# ---------------------------------------------------------------------------
# CaseResponse (interview Q&A)
# ---------------------------------------------------------------------------
class CaseResponse(Base):
    __tablename__ = "case_responses"

    id = Column(String(36), primary_key=True, default=_uuid)
    case_id = Column(String(36), ForeignKey("patient_cases.id"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    question_source = Column(
        String(20), nullable=False, default="system"
    )  # system | ai | doctor
    response_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    case = relationship("PatientCase", back_populates="responses")


# ---------------------------------------------------------------------------
# CaseDocument
# ---------------------------------------------------------------------------
class CaseDocument(Base):
    __tablename__ = "case_documents"

    id = Column(String(36), primary_key=True, default=_uuid)
    case_id = Column(String(36), ForeignKey("patient_cases.id"), nullable=False, index=True)
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False)
    file_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    extracted_data = Column(Text, nullable=True)  # JSON blob from OCR extraction
    uploaded_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    case = relationship("PatientCase", back_populates="documents")


# ---------------------------------------------------------------------------
# TriageDecision
# ---------------------------------------------------------------------------
class TriageDecision(Base):
    __tablename__ = "triage_decisions"

    id = Column(String(36), primary_key=True, default=_uuid)
    case_id = Column(String(36), ForeignKey("patient_cases.id"), nullable=False, index=True)
    priority = Column(String(20), nullable=False)
    reason = Column(Text, nullable=False)
    triggering_data = Column(Text, nullable=True)   # JSON blob
    rule_version = Column(String(20), nullable=False, default="0.1.0")
    reviewed = Column(Boolean, default=False, nullable=False)
    reviewer_id = Column(String(36), ForeignKey("doctors.id"), nullable=True)
    reviewer_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    case = relationship("PatientCase", back_populates="triage_decisions")
    reviewer = relationship("Doctor", foreign_keys=[reviewer_id])


# ---------------------------------------------------------------------------
# DoctorNote
# ---------------------------------------------------------------------------
class DoctorNote(Base):
    __tablename__ = "doctor_notes"

    id = Column(String(36), primary_key=True, default=_uuid)
    case_id = Column(String(36), ForeignKey("patient_cases.id"), nullable=False, index=True)
    doctor_id = Column(String(36), ForeignKey("doctors.id"), nullable=False, index=True)
    note_type = Column(
        String(20), nullable=False, default="general"
    )  # assessment | plan | follow_up | general
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    case = relationship("PatientCase", back_populates="notes")
    doctor = relationship("Doctor", back_populates="notes")


# ---------------------------------------------------------------------------
# TreatmentRecord
# ---------------------------------------------------------------------------
class TreatmentRecord(Base):
    __tablename__ = "treatment_records"

    id = Column(String(36), primary_key=True, default=_uuid)
    case_id = Column(String(36), ForeignKey("patient_cases.id"), unique=True, nullable=False, index=True)
    doctor_id = Column(String(36), ForeignKey("doctors.id"), nullable=False, index=True)
    assessment = Column(Text, nullable=True)
    disposition = Column(String(100), nullable=True)
    next_steps = Column(Text, nullable=True)
    follow_up_instructions = Column(Text, nullable=True)
    warnings = Column(Text, nullable=True)
    is_finalized = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    case = relationship("PatientCase", back_populates="treatment")
    doctor = relationship("Doctor", back_populates="treatments")
    items = relationship(
        "TreatmentItem", back_populates="treatment", cascade="all, delete-orphan",
        order_by="TreatmentItem.sort_order",
    )


# ---------------------------------------------------------------------------
# TreatmentItem
# ---------------------------------------------------------------------------
class TreatmentItem(Base):
    __tablename__ = "treatment_items"

    id = Column(String(36), primary_key=True, default=_uuid)
    treatment_id = Column(
        String(36), ForeignKey("treatment_records.id"), nullable=False, index=True
    )
    medicine_name = Column(String(255), nullable=False)
    strength = Column(String(100), nullable=True)
    dosage = Column(String(100), nullable=True)
    route = Column(String(50), nullable=True, default="oral")
    frequency = Column(String(100), nullable=True)
    duration = Column(String(100), nullable=True)
    instructions = Column(Text, nullable=True)
    quantity = Column(Integer, nullable=True, default=10)
    unit_price = Column(Float, nullable=True, default=0.0)
    total_price = Column(Float, nullable=True, default=0.0)
    sort_order = Column(Integer, nullable=False, default=0)

    treatment = relationship("TreatmentRecord", back_populates="items")


# ---------------------------------------------------------------------------
# Measurement (Telemetry / Vitals)
# ---------------------------------------------------------------------------
class Measurement(Base):
    __tablename__ = "measurements"

    id = Column(String(36), primary_key=True, default=_uuid)
    case_id = Column(String(36), ForeignKey("patient_cases.id"), nullable=False, index=True)
    measurement_type = Column(
        String(50), nullable=False
    )  # heart_rate | spo2 | temperature | blood_pressure
    value = Column(Float, nullable=False)
    unit = Column(String(20), nullable=False)
    signal_quality = Column(String(20), nullable=True)  # good | fair | poor
    source = Column(String(20), nullable=False, default="simulated")  # esp32 | simulated | manual
    device_id = Column(String(100), nullable=True)
    recorded_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    case = relationship("PatientCase", back_populates="measurements")


# ---------------------------------------------------------------------------
# Notification
# ---------------------------------------------------------------------------
class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=_uuid)
    doctor_id = Column(String(36), ForeignKey("doctors.id"), nullable=False, index=True)
    case_id = Column(
        String(36), ForeignKey("patient_cases.id"), nullable=True, index=True
    )
    notification_type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    doctor = relationship("Doctor", back_populates="notifications")
    case = relationship("PatientCase", back_populates="notifications")


# ---------------------------------------------------------------------------
# AuditLog
# ---------------------------------------------------------------------------
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=_uuid)
    actor_type = Column(
        String(20), nullable=False
    )  # system | doctor | patient
    actor_id = Column(String(36), nullable=True)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(50), nullable=True)
    resource_id = Column(String(36), nullable=True)
    details = Column(Text, nullable=True)          # JSON blob
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
