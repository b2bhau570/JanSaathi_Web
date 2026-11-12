"""
Jan Saathi AI — FastAPI Application Factory.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routes.admin_routes import router as admin_router
from app.routes.auth_routes import router as auth_router
from app.routes.doctor_routes import router as doctor_router
from app.routes.patient_routes import router as patient_router
from app.routes.hardware_routes import router as hardware_router

logger = logging.getLogger("jansaathi")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup validation: Ensure secure configuration
    if settings.ENVIRONMENT == "production":
        insecure_keys = ("CHANGE-ME-IN-PRODUCTION", "CHANGE_ME_GENERATE_WITH_secrets_token_urlsafe_64")
        if not settings.SECRET_KEY or settings.SECRET_KEY in insecure_keys or len(settings.SECRET_KEY) < 32:
            raise RuntimeError("CRITICAL SECURITY ERROR: Insecure or default SECRET_KEY in production.")
        if settings.DEBUG:
            raise RuntimeError("CRITICAL SECURITY ERROR: DEBUG must be False in production.")

    # Ensure DB tables and upload directories exist
    Base.metadata.create_all(bind=engine)
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        if inspector.has_table("case_documents"):
            existing_cols = {c["name"] for c in inspector.get_columns("case_documents")}
            if "extracted_data" not in existing_cols:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE case_documents ADD COLUMN extracted_data TEXT"))
                logger.info("Auto-migrated case_documents: added extracted_data column")
    except Exception as exc:
        logger.warning("Auto-migration check failed: %s", exc)
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    yield
    # Shutdown logic if needed


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="Jan Saathi AI — Telemedicine healthcare intake & clinical assistance platform.",
        lifespan=lifespan,
    )

    # CORS configuration
    origins = list(set([
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        *settings.cors_origins,
    ]))

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health Check
    @app.get("/api/v1/health", tags=["System"])
    def health_check():
        return {
            "status": "healthy",
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
        }

    # Register API v1 Routers
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(patient_router, prefix="/api/v1")
    app.include_router(doctor_router, prefix="/api/v1")
    app.include_router(admin_router, prefix="/api/v1")
    app.include_router(hardware_router, prefix="/api/v1")

    return app


app = create_app()

