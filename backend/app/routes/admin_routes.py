"""
Jan Saathi AI — Administrator Routes.

CRITICAL ACCESS CONTROL RULES:
- Every endpoint in this router requires require_admin.
- Regular doctors and patients are denied (HTTP 403 / 401).
- Approves, suspends, or rejects doctor accounts.
- Provides access to system audit logs.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import AuditLog, Doctor
from app.schemas import DoctorResponse

router = APIRouter(prefix="/admin", tags=["Administrator Operations"])


@router.get("/doctors", response_model=list[DoctorResponse])
def list_all_doctors(
    status_filter: str | None = Query(None, alias="status"),
    admin: Doctor = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[DoctorResponse]:
    """List registered doctors with optional status filter."""
    query = db.query(Doctor)
    if status_filter:
        query = query.filter(Doctor.status == status_filter)
    doctors = query.order_by(Doctor.created_at.desc()).all()
    return [DoctorResponse.model_validate(d) for d in doctors]


@router.patch("/doctors/{doctor_id}/approve", response_model=DoctorResponse)
@router.post("/doctors/{doctor_id}/approve", response_model=DoctorResponse)
def approve_doctor(
    doctor_id: str,
    request: Request,
    admin: Doctor = Depends(require_admin),
    db: Session = Depends(get_db),
) -> DoctorResponse:
    """Approve a pending doctor account."""
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found",
        )

    doctor.status = "approved"

    audit = AuditLog(
        actor_type="doctor",
        actor_id=admin.id,
        action="approve_doctor",
        resource_type="doctor",
        resource_id=doctor.id,
        details=f"Doctor {doctor.email} approved by admin {admin.email}",
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    db.commit()
    db.refresh(doctor)
    return DoctorResponse.model_validate(doctor)


@router.patch("/doctors/{doctor_id}/suspend", response_model=DoctorResponse)
@router.post("/doctors/{doctor_id}/suspend", response_model=DoctorResponse)
def suspend_doctor(
    doctor_id: str,
    request: Request,
    admin: Doctor = Depends(require_admin),
    db: Session = Depends(get_db),
) -> DoctorResponse:
    """Suspend an active doctor account."""
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found",
        )

    if doctor.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrator cannot suspend their own account",
        )

    doctor.status = "suspended"

    audit = AuditLog(
        actor_type="doctor",
        actor_id=admin.id,
        action="suspend_doctor",
        resource_type="doctor",
        resource_id=doctor.id,
        details=f"Doctor {doctor.email} suspended by admin {admin.email}",
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    db.commit()
    db.refresh(doctor)
    return DoctorResponse.model_validate(doctor)


@router.patch("/doctors/{doctor_id}/reject", response_model=DoctorResponse)
@router.post("/doctors/{doctor_id}/reject", response_model=DoctorResponse)
def reject_doctor(
    doctor_id: str,
    request: Request,
    admin: Doctor = Depends(require_admin),
    db: Session = Depends(get_db),
) -> DoctorResponse:
    """Reject a pending doctor registration."""
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found",
        )

    doctor.status = "rejected"

    audit = AuditLog(
        actor_type="doctor",
        actor_id=admin.id,
        action="reject_doctor",
        resource_type="doctor",
        resource_id=doctor.id,
        details=f"Doctor {doctor.email} rejected by admin {admin.email}",
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    db.commit()
    db.refresh(doctor)
    return DoctorResponse.model_validate(doctor)


@router.get("/audit-logs")
def get_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    admin: Doctor = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Retrieve security audit events."""
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": l.id,
            "actor_type": l.actor_type,
            "actor_id": l.actor_id,
            "action": l.action,
            "resource_type": l.resource_type,
            "resource_id": l.resource_id,
            "details": l.details,
            "ip_address": l.ip_address,
            "created_at": l.created_at.isoformat(),
        }
        for l in logs
    ]
