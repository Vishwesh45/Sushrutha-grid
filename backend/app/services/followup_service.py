"""Follow-up appointments + in-app reminders (day-before and day-of)."""
from __future__ import annotations

import re
import threading
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId

from app.database import get_database

_scheduler_started = False
_scheduler_lock = threading.Lock()


def _now() -> datetime:
    return datetime.utcnow()


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat() + "Z"


def parse_follow_up_date(
    advice_text: Optional[str],
    issued_at: Optional[datetime] = None,
    explicit_on: Optional[str] = None,
) -> Optional[datetime]:
    """
    Resolve a calendar follow-up day from:
    - explicit YYYY-MM-DD, or
    - free text like 'Review after 5 days', 'follow up in 2 weeks'.
    """
    if explicit_on:
        raw = explicit_on.strip()[:10]
        try:
            return datetime.strptime(raw, "%Y-%m-%d")
        except ValueError:
            pass

    if not advice_text:
        return None

    text = advice_text.strip().lower()
    base = issued_at or _now()

    # Absolute date inside free text: 2026-11-15 or 15/11/2026
    iso_in_text = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", text)
    if iso_in_text:
        try:
            return datetime.strptime(iso_in_text.group(1), "%Y-%m-%d")
        except ValueError:
            pass

    dmy = re.search(r"\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b", text)
    if dmy:
        d, m, y = int(dmy.group(1)), int(dmy.group(2)), int(dmy.group(3))
        try:
            return datetime(y, m, d)
        except ValueError:
            try:
                return datetime(y, d, m)
            except ValueError:
                pass

    rel = re.search(
        r"(?:after|in|within)\s+(\d+)\s*(day|days|week|weeks|month|months)\b",
        text,
    )
    if not rel:
        rel = re.search(r"\b(\d+)\s*(day|days|week|weeks|month|months)\b", text)
    if rel:
        n = int(rel.group(1))
        unit = rel.group(2)
        if unit.startswith("day"):
            return (base + timedelta(days=n)).replace(hour=0, minute=0, second=0, microsecond=0)
        if unit.startswith("week"):
            return (base + timedelta(weeks=n)).replace(hour=0, minute=0, second=0, microsecond=0)
        if unit.startswith("month"):
            return (base + timedelta(days=30 * n)).replace(hour=0, minute=0, second=0, microsecond=0)

    if "tomorrow" in text:
        return (base + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)

    return None


def create_follow_up_from_prescription(
    db,
    prescription: Dict[str, Any],
    follow_up_on: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Create appointment + day-before / day-of reminder docs when Rx has a resolvable date."""
    advice = prescription.get("follow_up_date")
    issued_raw = prescription.get("issued_at")
    issued_at = None
    if issued_raw:
        try:
            issued_at = datetime.fromisoformat(str(issued_raw).replace("Z", ""))
        except Exception:
            issued_at = _now()
    else:
        issued_at = _now()

    target = parse_follow_up_date(advice, issued_at=issued_at, explicit_on=follow_up_on)
    if not target:
        return None

    # Avoid duplicates for same Rx
    existing = db.follow_up_appointments.find_one({"prescription_id": prescription.get("prescription_id")})
    if existing:
        return _serialize_appointment(existing, db)

    follow_up_day = target.strftime("%Y-%m-%d")
    now = _now()
    appt = {
        "patient_id": prescription.get("patient_id"),
        "patient_name": prescription.get("patient_name"),
        "patient_uhid": prescription.get("patient_uhid"),
        "doctor_id": prescription.get("doctor_id"),
        "doctor_name": prescription.get("doctor_name"),
        "department": prescription.get("department"),
        "hospital_id": prescription.get("hospital_id") or "HOSP-BLR-001",
        "hospital_name": prescription.get("hospital_name"),
        "prescription_id": prescription.get("prescription_id"),
        "consultation_id": prescription.get("consultation_id"),
        "clinical_diagnosis": prescription.get("clinical_diagnosis"),
        "follow_up_on": follow_up_day,
        "follow_up_advice": advice,
        "status": "scheduled",
        "created_at": _iso(now),
        "updated_at": _iso(now),
    }
    result = db.follow_up_appointments.insert_one(appt)
    appt_id = str(result.inserted_id)

    day_before = (target - timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
    day_of = target.replace(hour=7, minute=0, second=0, microsecond=0)

    reminders = [
        {
            "appointment_id": appt_id,
            "patient_id": appt["patient_id"],
            "patient_name": appt.get("patient_name"),
            "hospital_id": appt["hospital_id"],
            "hospital_name": appt.get("hospital_name"),
            "prescription_id": appt["prescription_id"],
            "follow_up_on": follow_up_day,
            "department": appt.get("department"),
            "doctor_name": appt.get("doctor_name"),
            "reminder_type": "day_before",
            "title": "Follow-up tomorrow",
            "message": (
                f"Reminder: review visit tomorrow ({follow_up_day}) with "
                f"{appt.get('doctor_name') or 'your doctor'} · {appt.get('department') or 'OPD'}. "
                f"{advice or 'Please bring prior reports and this prescription.'}"
            ),
            "due_at": _iso(day_before),
            "status": "scheduled",
            "email_sent": False,
            "created_at": _iso(now),
        },
        {
            "appointment_id": appt_id,
            "patient_id": appt["patient_id"],
            "patient_name": appt.get("patient_name"),
            "hospital_id": appt["hospital_id"],
            "hospital_name": appt.get("hospital_name"),
            "prescription_id": appt["prescription_id"],
            "follow_up_on": follow_up_day,
            "department": appt.get("department"),
            "doctor_name": appt.get("doctor_name"),
            "reminder_type": "day_of",
            "title": "Follow-up today",
            "message": (
                f"Today is your follow-up day ({follow_up_day}) at "
                f"{appt.get('hospital_name') or 'the hospital'}. "
                f"Department: {appt.get('department') or 'OPD'}."
            ),
            "due_at": _iso(day_of),
            "status": "scheduled",
            "email_sent": False,
            "created_at": _iso(now),
        },
    ]

    # Always insert as scheduled; process_due_reminders flips + emails (incl. already-past due_at)
    for rem in reminders:
        db.follow_up_reminders.insert_one(rem)
    process_due_reminders(db)

    db.hospital_events.insert_one({
        "event_type": "FOLLOW_UP_SCHEDULED",
        "hospital_id": appt["hospital_id"],
        "patient_id": appt["patient_id"],
        "prescription_id": appt["prescription_id"],
        "follow_up_on": follow_up_day,
        "timestamp": _iso(now),
    })

    appt["_id"] = ObjectId(appt_id)
    return _serialize_appointment(appt, db)


def _today_str(now: Optional[datetime] = None) -> str:
    return (now or _now()).strftime("%Y-%m-%d")


def _refresh_reminder_copy(doc: Dict[str, Any], today: Optional[str] = None) -> Dict[str, Any]:
    """
    Titles were baked in as 'Follow-up today/tomorrow' at create time.
    Recompute from follow_up_on vs calendar today so Nov 14 does not still
    show 'today/tomorrow' for a Nov 5 appointment.
    """
    today = today or _today_str()
    fu = (doc.get("follow_up_on") or "")[:10]
    dept = doc.get("department") or "OPD"
    doctor = doc.get("doctor_name") or "your doctor"
    hospital = doc.get("hospital_name") or "the hospital"
    out = dict(doc)

    if not fu:
        return out

    if fu < today:
        out["title"] = f"Missed follow-up ({fu})"
        out["message"] = (
            f"Your follow-up was scheduled for {fu} ({dept}). "
            f"That day has passed — ask the hospital desk to reschedule if needed."
        )
    elif fu == today:
        out["title"] = "Follow-up today"
        out["message"] = (
            f"Today ({fu}) is your follow-up day at {hospital}. Department: {dept}."
        )
    else:
        try:
            fu_dt = datetime.strptime(fu, "%Y-%m-%d")
            tod = datetime.strptime(today, "%Y-%m-%d")
            days = (fu_dt - tod).days
        except ValueError:
            days = None
        if days == 1:
            out["title"] = "Follow-up tomorrow"
            out["message"] = (
                f"Reminder: review visit tomorrow ({fu}) with {doctor} · {dept}."
            )
        else:
            out["title"] = f"Upcoming follow-up · {fu}"
            out["message"] = (
                f"Your next follow-up is on {fu} with {doctor} · {dept}."
            )
    return out


def expire_stale_follow_ups(db=None) -> int:
    """
    Past appointment dates should not keep ringing 'today/tomorrow'.
    Mark overdue appointments + their due/scheduled reminders as missed/expired.
    """
    db = db if db is not None else get_database()
    today = _today_str()
    now_iso = _iso(_now())
    n = 0

    past_appts = list(
        db.follow_up_appointments.find({
            "status": "scheduled",
            "follow_up_on": {"$lt": today},
        }).limit(200)
    )
    for appt in past_appts:
        db.follow_up_appointments.update_one(
            {"_id": appt["_id"]},
            {"$set": {"status": "missed", "updated_at": now_iso}},
        )
        n += 1

    stale = list(
        db.follow_up_reminders.find({
            "status": {"$in": ["due", "scheduled"]},
            "follow_up_on": {"$lt": today},
        }).limit(400)
    )
    for rem in stale:
        db.follow_up_reminders.update_one(
            {"_id": rem["_id"]},
            {"$set": {"status": "expired", "expired_at": now_iso}},
        )
        n += 1
    return n


def process_due_reminders(db=None) -> int:
    """Flip scheduled → due when due_at has passed; expire past dates; broadcast once."""
    db = db if db is not None else get_database()
    expire_stale_follow_ups(db)
    now = _now()
    now_iso = _iso(now)
    today = _today_str(now)
    due_docs = list(
        db.follow_up_reminders.find({
            "status": "scheduled",
            "due_at": {"$lte": now_iso},
            "follow_up_on": {"$gte": today},
        }).limit(100)
    )
    if not due_docs:
        return 0

    try:
        from app.routes.ws import broadcast_event
    except Exception:
        broadcast_event = None

    count = 0
    for rem in due_docs:
        refreshed = _refresh_reminder_copy(rem, today)
        email_meta = {"email_sent": False, "email_mode": None, "email_error": None}
        # Resolve patient email for inbox delivery (in-app reminder still always fires)
        patient_email = None
        patient_name = rem.get("patient_name")
        pid = rem.get("patient_id")
        if pid:
            try:
                from bson import ObjectId
                user = None
                if ObjectId.is_valid(str(pid)):
                    user = db.users.find_one({"_id": ObjectId(str(pid))})
                if not user:
                    user = db.users.find_one({"$or": [{"uhid": pid}, {"email": pid}]})
                if user:
                    patient_email = (user.get("email") or "").strip().lower() or None
                    patient_name = patient_name or user.get("name")
            except Exception:
                pass

        if patient_email and not rem.get("email_sent"):
            try:
                from app.services.email_service import send_followup_reminder_email
                mail = send_followup_reminder_email(
                    to_email=patient_email,
                    patient_name=patient_name,
                    title=refreshed.get("title") or "Follow-up reminder",
                    message=refreshed.get("message") or "",
                    follow_up_on=rem.get("follow_up_on"),
                    department=rem.get("department"),
                    doctor_name=rem.get("doctor_name"),
                    hospital_name=rem.get("hospital_name"),
                    prescription_id=rem.get("prescription_id"),
                )
                email_meta = {
                    "email_sent": bool(mail.get("sent")),
                    "email_mode": mail.get("mode"),
                    "email_to": patient_email,
                    "email_error": mail.get("error"),
                    "email_sent_at": now_iso,
                }
            except Exception as exc:
                email_meta = {
                    "email_sent": False,
                    "email_mode": "error",
                    "email_to": patient_email,
                    "email_error": str(exc)[:200],
                    "email_sent_at": now_iso,
                }

        db.follow_up_reminders.update_one(
            {"_id": rem["_id"]},
            {"$set": {
                "status": "due",
                "sent_at": now_iso,
                "title": refreshed.get("title"),
                "message": refreshed.get("message"),
                **email_meta,
            }},
        )
        count += 1
        if broadcast_event:
            try:
                broadcast_event("FOLLOW_UP_REMINDER", {
                    "reminder_id": str(rem["_id"]),
                    "patient_id": rem.get("patient_id"),
                    "hospital_id": rem.get("hospital_id"),
                    "title": refreshed.get("title"),
                    "message": refreshed.get("message"),
                    "follow_up_on": rem.get("follow_up_on"),
                    "prescription_id": rem.get("prescription_id"),
                    "due_at": rem.get("due_at"),
                    "email_sent": email_meta.get("email_sent"),
                })
            except Exception:
                pass
    return count


def _serialize_reminder(doc: Dict[str, Any], today: Optional[str] = None) -> Dict[str, Any]:
    refreshed = _refresh_reminder_copy(doc, today)
    return {
        "id": str(refreshed["_id"]),
        "reminder_type": refreshed.get("reminder_type"),
        "title": refreshed.get("title"),
        "message": refreshed.get("message"),
        "due_at": refreshed.get("due_at"),
        "status": refreshed.get("status") or "scheduled",
        "appointment_id": refreshed.get("appointment_id"),
        "follow_up_on": refreshed.get("follow_up_on"),
        "department": refreshed.get("department"),
        "doctor_name": refreshed.get("doctor_name"),
        "prescription_id": refreshed.get("prescription_id"),
    }


def _serialize_appointment(doc: Dict[str, Any], db=None, today: Optional[str] = None) -> Dict[str, Any]:
    appt_id = str(doc["_id"])
    today = today or _today_str()
    reminders = []
    if db is not None:
        reminders = [
            _serialize_reminder(r, today)
            for r in db.follow_up_reminders.find({"appointment_id": appt_id}).sort("due_at", 1)
        ]
    return {
        "id": appt_id,
        "follow_up_on": doc.get("follow_up_on"),
        "follow_up_advice": doc.get("follow_up_advice"),
        "status": doc.get("status") or "scheduled",
        "department": doc.get("department"),
        "doctor_name": doc.get("doctor_name"),
        "hospital_name": doc.get("hospital_name"),
        "prescription_id": doc.get("prescription_id"),
        "clinical_diagnosis": doc.get("clinical_diagnosis"),
        "created_at": doc.get("created_at"),
        "reminders": reminders,
    }


def get_patient_follow_up_dashboard(patient_id: str, db=None) -> Dict[str, Any]:
    db = db if db is not None else get_database()
    process_due_reminders(db)
    today = _today_str()
    appts = list(
        db.follow_up_appointments.find({
            "patient_id": patient_id,
            "status": {"$in": ["scheduled"]},
            "follow_up_on": {"$gte": today},
        }).sort("follow_up_on", 1).limit(30)
    )
    upcoming = [_serialize_appointment(a, db, today) for a in appts]
    # Past / missed: kept for history (linked to each Rx / consultation)
    past_appts = list(
        db.follow_up_appointments.find({
            "patient_id": patient_id,
            "$or": [
                {"status": {"$in": ["missed", "completed", "cancelled"]}},
                {"status": "scheduled", "follow_up_on": {"$lt": today}},
            ],
        }).sort("follow_up_on", -1).limit(30)
    )
    past = [_serialize_appointment(a, db, today) for a in past_appts]
    # Only surface due reminders that are still for today or later
    due = list(
        db.follow_up_reminders.find({
            "patient_id": patient_id,
            "status": "due",
            "follow_up_on": {"$gte": today},
        }).sort("due_at", -1).limit(20)
    )
    due_items = [_serialize_reminder(r, today) for r in due]
    return {
        "upcoming": upcoming,
        "past": past,
        "due_reminders": due_items,
        "total_upcoming": len(upcoming),
        "total_past": len(past),
        "total_due_reminders": len(due_items),
        "today": today,
    }


def acknowledge_reminder(patient_id: str, reminder_id: str, db=None) -> Dict[str, Any]:
    db = db if db is not None else get_database()
    try:
        oid = ObjectId(reminder_id)
    except Exception:
        raise ValueError("Invalid reminder id")
    rem = db.follow_up_reminders.find_one({"_id": oid, "patient_id": patient_id})
    if not rem:
        raise ValueError("Reminder not found")
    db.follow_up_reminders.update_one(
        {"_id": oid},
        {"$set": {"status": "acknowledged", "acknowledged_at": _iso(_now())}},
    )
    rem["status"] = "acknowledged"
    return _serialize_reminder(rem)


def start_followup_scheduler(interval_seconds: int = 60) -> None:
    """Lightweight background poller — no APScheduler dependency."""
    global _scheduler_started
    with _scheduler_lock:
        if _scheduler_started:
            return
        _scheduler_started = True

    def _loop():
        try:
            process_due_reminders()
        except Exception as exc:
            print(f"Follow-up reminder poller: {exc}")
        t = threading.Timer(interval_seconds, _loop)
        t.daemon = True
        t.start()

    t = threading.Timer(5, _loop)
    t.daemon = True
    t.start()
