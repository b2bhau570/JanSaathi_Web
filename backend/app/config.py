"""
Jan Saathi AI — Application Configuration
Loads settings from environment variables / .env file using pydantic-settings.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_DIR = DATA_DIR / "db"

# Ensure critical directories exist
for _d in (DATA_DIR, UPLOAD_DIR, DB_DIR):
    _d.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    """Central configuration — every field is documented with its default."""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ────────────────────────────────────────────────────
    APP_NAME: str = "Jan Saathi AI"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    # ── Security ───────────────────────────────────────────────────────
    SECRET_KEY: str = "CHANGE-ME-IN-PRODUCTION"
    """JWT signing key. MUST be changed from the default before production use."""

    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480          # 8 hours

    # ── CORS ───────────────────────────────────────────────────────────
    FRONTEND_URL: str = "http://localhost:3000"
    """Comma-separated origins are also accepted (e.g. http://a.com,http://b.com)."""

    # ── Database ───────────────────────────────────────────────────────
    DATABASE_URL: str = f"sqlite:///{DB_DIR / 'jansaathi.db'}"

    # ── File Uploads ───────────────────────────────────────────────────
    MAX_UPLOAD_SIZE_MB: int = 10
    ALLOWED_FILE_TYPES: str = "image/jpeg,image/png,application/pdf"

    # ── Rate Limiting (in-memory, per-IP) ──────────────────────────────
    LOGIN_RATE_LIMIT_ATTEMPTS: int = 5
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 300       # 5 minutes

    # ── Logging ────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"

    # ── Local AI / LLM Configuration ──────────────────────────────────
    LOCAL_AI_ENABLED: bool = False
    LOCAL_AI_URL: str = "http://127.0.0.1:11434"
    LOCAL_AI_TIMEOUT_SECONDS: float = 2.0

    # ── Sarvam AI Voice Configuration ──────────────────────────────────
    SARVAM_API_KEY: str | None = None
    """Sarvam AI subscription key for bulbul:v3 Text-to-Speech voice synthesis."""
    SARVAM_TTS_URL: str = "https://api.sarvam.ai/text-to-speech"
    SARVAM_STT_URL: str = "https://api.sarvam.ai/speech-to-text"
    SARVAM_DEFAULT_SPEAKER: str = "priya"
    SARVAM_STT_MODEL: str = "saaras:v4"

    # ── ElevenLabs Studio Voice Configuration ──────────────────────────
    ELEVENLABS_API_KEY: str | None = None
    """ElevenLabs API key for ultra-realistic studio Text-to-Speech voice synthesis."""
    ELEVENLABS_VOICE_ID: str = "EXAVITQu4vr4xnSDxMaL"
    """Default ElevenLabs Voice ID (Sarah - Reassuring & Confident Physician / Free Tier Allowed)."""
    ELEVENLABS_MODEL_ID: str = "eleven_multilingual_v2"
    ELEVENLABS_TTS_URL: str = "https://api.elevenlabs.io/v1/text-to-speech"

    # ── Cloud Conversational Agent (Gemini) ────────────────────────────
    GEMINI_API_KEY: str | None = None
    """Google Gemini API key for free conversational agent reasoning."""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # ── Validators ─────────────────────────────────────────────────────
    @field_validator("SECRET_KEY")
    @classmethod
    def _validate_secret_key(cls, v: str, info) -> str:  # noqa: N805
        # In non-development environments the default key is rejected.
        # We can't access other fields from a field_validator, so we rely
        # on an explicit startup check in __init__.py as well.
        if v == "CHANGE-ME-IN-PRODUCTION":
            env = os.getenv("ENVIRONMENT", "development")
            if env != "development":
                raise ValueError(
                    "SECRET_KEY must be changed from the default "
                    "in non-development environments."
                )
        return v

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.FRONTEND_URL.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def allowed_file_types_list(self) -> list[str]:
        return [t.strip() for t in self.ALLOWED_FILE_TYPES.split(",") if t.strip()]

    @property
    def UPLOAD_DIR(self) -> Path:
        return UPLOAD_DIR

    @property
    def BASE_DIR(self) -> Path:
        return BASE_DIR


settings = Settings()
