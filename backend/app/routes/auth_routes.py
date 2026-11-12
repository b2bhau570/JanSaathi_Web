"""
Jan Saathi AI — Doctor Authentication Routes.
Only doctors register and login. Patients do NOT have accounts.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    get_current_doctor,
    hash_password,
    login_rate_limiter,
    verify_password,
)
from app.database import get_db
from app.models import AuditLog, Doctor
from app.schemas import DoctorLogin, DoctorRegister, DoctorResponse, Token

router = APIRouter(prefix="/auth/doctor", tags=["Doctor Auth"])


@router.post("/register", response_model=DoctorResponse, status_code=status.HTTP_201_CREATED)
def register_doctor(
    payload: DoctorRegister,
    request: Request,
    db: Session = Depends(get_db),
) -> Doctor:
    """
    Register a new doctor account in 'pending' status.
    Must be approved by an administrator before logging in.
    """
    existing = db.query(Doctor).filter(Doctor.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    doctor = Doctor(
        email=payload.email.lower(),
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        registration_number=payload.registration_number,
        issuing_authority=payload.issuing_authority,
        phone=payload.phone,
        status="pending",  # strictly pending until admin approval
        is_admin=False,
    )
    db.add(doctor)

    # Audit log
    audit = AuditLog(
        actor_type="doctor",
        actor_id=doctor.id,
        action="doctor_registered",
        resource_type="doctor",
        resource_id=doctor.id,
        ip_address=request.client.host if request.client else None,
    )
    db.add(audit)
    db.commit()
    db.refresh(doctor)
    return doctor


@router.post("/login", response_model=Token)
def login_doctor(
    payload: DoctorLogin,
    request: Request,
    db: Session = Depends(get_db),
) -> Token:
    """
    Authenticate a doctor. Only approved and active accounts are permitted.
    Rate limited by client IP.
    """
    client_ip = request.client.host if request.client else "unknown"
    login_rate_limiter.check(client_ip)

    search_email = payload.email.lower().strip()
    doctor = db.query(Doctor).filter(Doctor.email == search_email).first()

    if not doctor or not verify_password(payload.password, str(doctor.password_hash)):
        login_rate_limiter.record(client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Successful login: reset rate limit attempts
    login_rate_limiter.reset(client_ip)

    # Check status
    if doctor.status == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account pending administrator approval. Please wait for approval.",
        )
    elif doctor.status == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been suspended. Please contact an administrator.",
        )
    elif doctor.status == "rejected":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account registration was rejected.",
        )
    elif doctor.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account status is '{doctor.status}'. Access denied.",
        )

    # Successful login: reset rate limit attempts
    login_rate_limiter.reset(client_ip)

    token = create_access_token(
        data={"sub": doctor.id, "email": doctor.email, "is_admin": doctor.is_admin}
    )

    audit = AuditLog(
        actor_type="doctor",
        actor_id=doctor.id,
        action="doctor_login_success",
        resource_type="doctor",
        resource_id=doctor.id,
        ip_address=client_ip,
    )
    db.add(audit)
    db.commit()

    return Token(access_token=token, token_type="bearer")


@router.post("/logout")
def logout_doctor(
    request: Request,
    current_doctor: Doctor = Depends(get_current_doctor),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """
    Logs out the authenticated doctor.
    """
    client_ip = request.client.host if request and request.client else None
    audit = AuditLog(
        actor_type="doctor",
        actor_id=current_doctor.id,
        action="doctor_logout",
        resource_type="doctor",
        resource_id=current_doctor.id,
        ip_address=client_ip,
    )
    db.add(audit)
    db.commit()
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=DoctorResponse)
def get_current_doctor_profile(
    current_doctor: Doctor = Depends(get_current_doctor),
) -> Doctor:
    """
    Returns current authenticated doctor's profile.
    """
    return current_doctor

