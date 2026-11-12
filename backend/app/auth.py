"""
Jan Saathi AI — Authentication & authorization utilities.

- Password hashing (bcrypt via passlib)
- JWT token creation / verification
- FastAPI dependencies: get_current_doctor, require_approved_doctor, require_admin
- In-memory per-IP login rate limiter
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Doctor
from app.schemas import TokenData

# ---------------------------------------------------------------------------
# Password hashing (native bcrypt)
# ---------------------------------------------------------------------------
def hash_password(plain: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain.encode("utf-8")[:72], salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode("utf-8"))
    except Exception:
        return False


# Access token hashing uses SHA-256 with constant-time comparison
def hash_access_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_access_token(token: str, hashed: str) -> bool:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return secrets.compare_digest(token_hash, hashed)


def generate_case_whatsapp_token(public_case_id: str) -> str:
    """Generate a tamper-proof HMAC access token for 1-click WhatsApp prescription/order links."""
    key = (settings.SECRET_KEY or "jansaathi-telemedicine-secret-2026").encode("utf-8")
    sig = hmac.new(key, f"wa_link_{public_case_id}".encode("utf-8"), hashlib.sha256).hexdigest()
    return f"wa_{sig[:24]}"


def verify_case_access(token: str, hashed: str, public_case_id: str) -> bool:
    """Verify either raw access token against hash OR valid WhatsApp HMAC token."""
    if not token:
        return False
    if verify_access_token(token, hashed):
        return True
    if token.startswith("wa_"):
        expected = generate_case_whatsapp_token(public_case_id)
        if secrets.compare_digest(token, expected):
            return True
    return False


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------
def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> TokenData:
    """Decode & validate a JWT. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        doctor_id: str | None = payload.get("sub")
        email: str | None = payload.get("email")
        if doctor_id is None or email is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
            )
        return TokenData(doctor_id=doctor_id, email=email)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
        )


# ---------------------------------------------------------------------------
# In-memory rate limiter (per IP)
# ---------------------------------------------------------------------------
class _LoginRateLimiter:
    """Sliding-window counter keyed by IP address."""

    def __init__(self) -> None:
        # ip -> list of timestamps
        self._attempts: dict[str, list[float]] = defaultdict(list)

    def check(self, ip: str) -> None:
        now = time.time()
        window = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS
        max_attempts = settings.LOGIN_RATE_LIMIT_ATTEMPTS

        # Prune old entries
        self._attempts[ip] = [
            t for t in self._attempts[ip] if now - t < window
        ]
        if len(self._attempts[ip]) >= max_attempts:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Please try again later.",
            )

    def record(self, ip: str) -> None:
        self._attempts[ip].append(time.time())

    def reset(self, ip: str) -> None:
        self._attempts.pop(ip, None)


login_rate_limiter = _LoginRateLimiter()


# ---------------------------------------------------------------------------
# FastAPI security scheme
# ---------------------------------------------------------------------------
bearer_scheme = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
async def get_current_doctor(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Session = Depends(get_db),
) -> Doctor:
    """Extract and validate the JWT, return the Doctor row."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    token_data = decode_access_token(credentials.credentials)
    doctor = db.query(Doctor).filter(Doctor.id == token_data.doctor_id).first()
    if doctor is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Doctor account not found",
        )
    return doctor


async def require_approved_doctor(
    doctor: Doctor = Depends(get_current_doctor),
) -> Doctor:
    """Ensure the authenticated doctor's account is approved."""
    if doctor.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account not approved. Current status: {doctor.status}",
        )
    return doctor


async def require_admin(
    doctor: Doctor = Depends(require_approved_doctor),
) -> Doctor:
    """Ensure the authenticated doctor is an admin."""
    if not doctor.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return doctor
