"""
Jan Saathi AI — Secure Local CLI Management.
Provides commands for administrator bootstrap without hardcoded credentials.
"""

from __future__ import annotations

import argparse
import getpass
import sys

from app.auth import hash_password
from app.database import Base, SessionLocal, engine
from app.models import AuditLog, Doctor


def create_admin():
    parser = argparse.ArgumentParser(description="Create, bootstrap, or rotate a Jan Saathi AI administrator.")
    parser.add_argument("--email", help="Administrator email address")
    parser.add_argument("--name", help="Administrator full name")
    parser.add_argument("--password", help="Administrator password (if not provided, will prompt securely)")
    parser.add_argument("--rotate-password", action="store_true", help="Explicitly rotate password for existing administrator")
    args = parser.parse_args()

    email = args.email or input("Admin Email: ").strip()
    if not email:
        print("Error: Email is required.")
        sys.exit(1)

    name = args.name or input("Admin Full Name: ").strip()
    if not name:
        print("Error: Name is required.")
        sys.exit(1)

    password = args.password
    if not password:
        password = getpass.getpass("Admin Password (min 8 chars): ")
        password_confirm = getpass.getpass("Confirm Admin Password: ")
        if password != password_confirm:
            print("Error: Passwords do not match.")
            sys.exit(1)

    if len(password) < 8:
        print("Error: Password must be at least 8 characters long.")
        sys.exit(1)

    # Ensure DB tables exist
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        existing = db.query(Doctor).filter(Doctor.email == email.lower()).first()
        if existing:
            if existing.is_admin:
                existing.password_hash = hash_password(password)
                if name and name != existing.full_name:
                    existing.full_name = name
                audit = AuditLog(
                    actor_type="system",
                    actor_id=existing.id,
                    action="cli_admin_password_rotated",
                    resource_type="doctor",
                    resource_id=existing.id,
                    details=f"Admin {email} password rotated via local CLI",
                )
                db.add(audit)
                db.commit()
                print(f"Successfully rotated password for administrator: {email}")
                return
            existing.is_admin = True
            existing.status = "approved"
            existing.password_hash = hash_password(password)
            audit = AuditLog(
                actor_type="system",
                actor_id=existing.id,
                action="cli_promoted_to_admin",
                resource_type="doctor",
                resource_id=existing.id,
                details=f"Doctor {email} promoted to administrator via local CLI",
            )
            db.add(audit)
            db.commit()
            print(f"Updated existing doctor {email} to approved administrator.")
            return

        admin = Doctor(
            email=email.lower(),
            full_name=name,
            password_hash=hash_password(password),
            status="approved",
            is_admin=True,
        )
        db.add(admin)
        db.flush()

        audit = AuditLog(
            actor_type="system",
            actor_id=admin.id,
            action="cli_bootstrap_admin",
            resource_type="doctor",
            resource_id=admin.id,
            details=f"Admin {email} created via local CLI bootstrap",
        )
        db.add(audit)
        db.commit()
        print(f"Successfully created administrator: {email}")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "create-admin":
        sys.argv.pop(1)
        create_admin()
    else:
        create_admin()

