"""
Victoria Hospital reception check-in.

Desk shows a short rotating code (15 minutes). Patient enters it to unlock
Today's visit for HOSP-BLR-001 only. Gate QR later opens this same flow.
"""
from __future__ import annotations

import secrets
import string
from datetime import datetime, timedelta
from typing import Optional

from app.database import get_database

OPERATIONAL_HOSPITAL_ID = "HOSP-BLR-001"
OPERATIONAL_HOSPITAL_NAME = "Victoria Hospital (BMCRI Apex Medical Center)"
CODE_TTL_MINUTES = 15
VISIT_UNLOCK_HOURS = 4
# Ambiguous 0/O/1/I/L excluded for desk readability
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _utcnow() -> datetime:
    return datetime.utcnow()


def _iso(dt: datetime) -> str:
    return dt.isoformat() + "Z"


def _parse_iso(value: str) -> datetime:
    raw = value[:-1] if value.endswith("Z") else value
    return datetime.fromisoformat(raw)


def _make_code(length: int = 6) -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))


def generate_reception_code(
    hospital_id: str = OPERATIONAL_HOSPITAL_ID,
    generated_by: Optional[str] = None,
) -> dict:
    """
    Issues a fresh desk code for Victoria. Previous active codes for that
    hospital are deactivated immediately.
    """
    if hospital_id != OPERATIONAL_HOSPITAL_ID:
        raise ValueError("Reception check-in is only live for Victoria Hospital (HOSP-BLR-001).")

    db = get_database()
    now = _utcnow()
    expires = now + timedelta(minutes=CODE_TTL_MINUTES)
    code = _make_code(6)

    db.reception_codes.update_many(
        {"hospital_id": hospital_id, "status": "ACTIVE"},
        {"$set": {"status": "SUPERSEDED", "superseded_at": _iso(now)}},
    )

    doc = {
        "code": code,
        "hospital_id": hospital_id,
        "hospital_name": OPERATIONAL_HOSPITAL_NAME,
        "status": "ACTIVE",
        "generated_at": _iso(now),
        "expires_at": _iso(expires),
        "generated_by": generated_by,
        "redeem_count": 0,
    }
    result = db.reception_codes.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)

    db.hospital_events.insert_one({
        "event_type": "RECEPTION_CODE_GENERATED",
        "hospital_id": hospital_id,
        "code": code,
        "expires_at": doc["expires_at"],
        "generated_by": generated_by,
        "timestamp": doc["generated_at"],
    })

    return {
        "hospital_id": hospital_id,
        "hospital_name": OPERATIONAL_HOSPITAL_NAME,
        "code": code,
        "expires_at": doc["expires_at"],
        "generated_at": doc["generated_at"],
        "expires_in_seconds": CODE_TTL_MINUTES * 60,
        "is_active": True,
    }


def get_current_reception_code(hospital_id: str = OPERATIONAL_HOSPITAL_ID) -> Optional[dict]:
    """Returns the active non-expired desk code, or None."""
    db = get_database()
    now = _utcnow()
    doc = db.reception_codes.find_one(
        {"hospital_id": hospital_id, "status": "ACTIVE"},
        sort=[("generated_at", -1)],
    )
    if not doc:
        return None

    expires_at = _parse_iso(doc["expires_at"])
    if now > expires_at:
        db.reception_codes.update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": "EXPIRED"}},
        )
        return None

    remaining = int((expires_at - now).total_seconds())
    return {
        "hospital_id": doc["hospital_id"],
        "hospital_name": doc.get("hospital_name", OPERATIONAL_HOSPITAL_NAME),
        "code": doc["code"],
        "expires_at": doc["expires_at"],
        "generated_at": doc["generated_at"],
        "expires_in_seconds": max(0, remaining),
        "is_active": True,
    }


def get_or_create_reception_code(
    hospital_id: str = OPERATIONAL_HOSPITAL_ID,
    generated_by: Optional[str] = None,
) -> dict:
    current = get_current_reception_code(hospital_id)
    if current:
        return current
    return generate_reception_code(hospital_id=hospital_id, generated_by=generated_by)


def redeem_checkin_code(
    *,
    patient_id: str,
    patient_name: str,
    patient_email: Optional[str],
    code: str,
    hospital_id: str = OPERATIONAL_HOSPITAL_ID,
) -> dict:
    """
    Validates the desk code and unlocks Today's visit for this patient
    at Victoria for VISIT_UNLOCK_HOURS.
    """
    if hospital_id != OPERATIONAL_HOSPITAL_ID:
        raise ValueError("Digital OPD check-in is only available at Victoria Hospital.")

    clean = (code or "").strip().upper()
    if len(clean) < 4:
        raise ValueError("Enter the full reception desk code.")

    db = get_database()
    now = _utcnow()
    desk = db.reception_codes.find_one({
        "hospital_id": hospital_id,
        "code": clean,
        "status": "ACTIVE",
    })
    if not desk:
        raise ValueError("Invalid reception code. Ask the Victoria OPD desk for the current code.")

    expires_at = _parse_iso(desk["expires_at"])
    if now > expires_at:
        db.reception_codes.update_one({"_id": desk["_id"]}, {"$set": {"status": "EXPIRED"}})
        raise ValueError("That reception code has expired. Ask the desk for a fresh code.")

    valid_until = now + timedelta(hours=VISIT_UNLOCK_HOURS)
    # One active visit unlock per patient+hospital; refresh if already checked in
    db.patient_checkins.update_many(
        {"patient_id": patient_id, "hospital_id": hospital_id, "status": "ACTIVE"},
        {"$set": {"status": "SUPERSEDED", "superseded_at": _iso(now)}},
    )

    checkin_doc = {
        "patient_id": patient_id,
        "patient_name": patient_name,
        "patient_email": patient_email,
        "hospital_id": hospital_id,
        "hospital_name": OPERATIONAL_HOSPITAL_NAME,
        "code_used": clean,
        "reception_code_id": str(desk["_id"]),
        "status": "ACTIVE",
        "checked_in_at": _iso(now),
        "valid_until": _iso(valid_until),
    }
    result = db.patient_checkins.insert_one(checkin_doc)
    db.reception_codes.update_one(
        {"_id": desk["_id"]},
        {"$inc": {"redeem_count": 1}},
    )
    db.hospital_events.insert_one({
        "event_type": "PATIENT_RECEPTION_CHECKIN",
        "hospital_id": hospital_id,
        "patient_id": patient_id,
        "code": clean,
        "valid_until": checkin_doc["valid_until"],
        "timestamp": checkin_doc["checked_in_at"],
    })

    return {
        "checked_in": True,
        "hospital_id": hospital_id,
        "hospital_name": OPERATIONAL_HOSPITAL_NAME,
        "checked_in_at": checkin_doc["checked_in_at"],
        "valid_until": checkin_doc["valid_until"],
        "code_used": clean,
        "checkin_id": str(result.inserted_id),
        "message": "Checked in at Victoria Hospital. Today's visit is unlocked.",
    }


def get_patient_checkin_status(
    patient_id: str,
    hospital_id: str = OPERATIONAL_HOSPITAL_ID,
) -> dict:
    db = get_database()
    now = _utcnow()
    doc = db.patient_checkins.find_one(
        {"patient_id": patient_id, "hospital_id": hospital_id, "status": "ACTIVE"},
        sort=[("checked_in_at", -1)],
    )
    if not doc:
        return {
            "checked_in": False,
            "hospital_id": hospital_id,
            "hospital_name": OPERATIONAL_HOSPITAL_NAME,
            "message": "Enter the Victoria reception desk code to unlock Today's visit.",
        }

    valid_until = _parse_iso(doc["valid_until"])
    if now > valid_until:
        db.patient_checkins.update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": "EXPIRED"}},
        )
        return {
            "checked_in": False,
            "hospital_id": hospital_id,
            "hospital_name": OPERATIONAL_HOSPITAL_NAME,
            "message": "Your check-in expired. Ask reception for a fresh code.",
        }

    return {
        "checked_in": True,
        "hospital_id": doc["hospital_id"],
        "hospital_name": doc.get("hospital_name", OPERATIONAL_HOSPITAL_NAME),
        "checked_in_at": doc["checked_in_at"],
        "valid_until": doc["valid_until"],
        "code_used": doc.get("code_used"),
        "message": "Checked in. Symptom form and voice intake are unlocked.",
    }


def assert_patient_checked_in(patient_id: str, hospital_id: str) -> dict:
    """Raises ValueError if the patient has no active check-in for the hospital."""
    status = get_patient_checkin_status(patient_id, hospital_id)
    if not status.get("checked_in"):
        raise ValueError(
            status.get("message")
            or "Reception check-in required before submitting a consultation."
        )
    return status
