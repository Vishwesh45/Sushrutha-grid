"""Live hospital analytics + audit log reads for admin module."""
from collections import Counter, defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.database import get_database
from app.services.bed_service import summary as bed_summary

OPERATIONAL_HID = "HOSP-BLR-001"


def _today_prefix() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


def hospital_analytics(db=None, hospital_id: str = OPERATIONAL_HID) -> Dict[str, Any]:
    db = db if db is not None else get_database()
    hid = hospital_id or OPERATIONAL_HID
    today = _today_prefix()

    doctor_q = {"$or": [{"hospital_id": hid}, {"hospital_id": {"$exists": False}}, {"hospital_id": None}]}
    doctors = list(db.doctors.find(doctor_q, {"_id": 0, "department": 1, "tier": 1, "status": 1, "name": 1}))
    by_dept: Dict[str, Counter] = defaultdict(Counter)
    status_counts = Counter()
    for d in doctors:
        dept = d.get("department") or "Unknown"
        tier = d.get("tier") or "UNKNOWN"
        by_dept[dept][tier] += 1
        by_dept[dept]["TOTAL"] += 1
        status_counts[d.get("status") or "UNKNOWN"] += 1

    staffing = [
        {
            "department": dept,
            "total": counts.get("TOTAL", 0),
            "senior": counts.get("SENIOR_DOCTOR", 0),
            "junior": counts.get("JUNIOR_DOCTOR", 0),
        }
        for dept, counts in sorted(by_dept.items(), key=lambda x: -x[1].get("TOTAL", 0))
    ]

    token_match = {
        "$and": [
            {"$or": [{"hospital_id": hid}, {"hospital_id": {"$exists": False}}, {"hospital_id": None}]},
            {"$or": [
                {"created_at": {"$regex": f"^{today}"}},
                {"issued_at": {"$regex": f"^{today}"}},
            ]},
        ]
    }
    tokens_today = list(db.opd_tokens.find(token_match, {"_id": 0, "priority": 1, "status": 1, "department": 1}))
    triage = Counter((t.get("priority") or "GREEN").upper() for t in tokens_today)
    token_status = Counter((t.get("status") or "UNKNOWN").upper() for t in tokens_today)
    by_token_dept = Counter((t.get("department") or "General Medicine") for t in tokens_today)

    consult_q = {
        "$and": [
            {"$or": [{"hospital_id": hid}, {"hospital_id": {"$exists": False}}, {"hospital_id": None}]},
            {"$or": [
                {"created_at": {"$regex": f"^{today}"}},
                {"timestamp": {"$regex": f"^{today}"}},
            ]},
        ]
    }
    consults_today = db.consultations.count_documents(consult_q)

    vol_open = db.volunteer_requisitions.count_documents({
        "status": {"$in": ["OPEN", "ACTIVE"]},
        "$or": [{"hospital_id": hid}, {"hospital_id": {"$exists": False}}, {"hospital_id": None}],
    })
    vol_pending = db.volunteer_applications.count_documents({
        "status": "PENDING",
        "$or": [{"hospital_id": hid}, {"hospital_id": {"$exists": False}}, {"hospital_id": None}],
    })
    csr_open = db.csr_requirements.count_documents({
        "status": {"$in": ["POSTED", "CSR_PLEDGED"]},
        "$or": [{"hospital_id": hid}, {"hospital_id": {"$exists": False}}, {"hospital_id": None}],
    })

    beds = bed_summary(db, hid)

    return {
        "hospital_id": hid,
        "as_of": datetime.utcnow().isoformat() + "Z",
        "day": today,
        "doctors": {
            "total": len(doctors),
            "by_status": dict(status_counts),
            "staffing_by_department": staffing,
        },
        "opd_today": {
            "tokens": len(tokens_today),
            "consultations": consults_today,
            "triage": {
                "RED": triage.get("RED", 0),
                "AMBER": triage.get("AMBER", 0),
                "GREEN": triage.get("GREEN", 0),
            },
            "token_status": dict(token_status),
            "by_department": [
                {"department": k, "count": v}
                for k, v in by_token_dept.most_common(12)
            ],
        },
        "partners": {
            "open_volunteer_requisitions": vol_open,
            "pending_volunteer_applications": vol_pending,
            "open_csr_requirements": csr_open,
        },
        "beds": {
            "total_beds": beds["total_beds"],
            "occupied_beds": beds["occupied_beds"],
            "available_beds": beds["available_beds"],
            "occupancy_pct": beds["occupancy_pct"],
        },
    }


def audit_logs(
    db=None,
    hospital_id: str = OPERATIONAL_HID,
    limit: int = 80,
    event_type: Optional[str] = None,
) -> Dict[str, Any]:
    db = db if db is not None else get_database()
    hid = hospital_id or OPERATIONAL_HID
    limit = max(1, min(int(limit or 80), 200))

    query: Dict[str, Any] = {
        "$or": [
            {"hospital_id": hid},
            {"hospital_id": {"$exists": False}},
            {"hospital_id": None},
        ]
    }
    if event_type and event_type.strip() and event_type.strip().upper() != "ALL":
        query["event_type"] = event_type.strip().upper()

    cursor = db.hospital_events.find(query).sort("timestamp", -1).limit(limit)
    rows: List[Dict[str, Any]] = []
    for doc in cursor:
        et = doc.get("event_type") or "EVENT"
        ts = doc.get("timestamp") or doc.get("created_at") or ""
        summary_bits = []
        for key in ("patient_name", "doctor_name", "department", "token_number", "requisition_id",
                    "application_id", "requirement_id", "ward_id", "prescription_id", "title", "status"):
            if doc.get(key) not in (None, ""):
                summary_bits.append(f"{key}={doc.get(key)}")
        rows.append({
            "id": str(doc.get("_id")),
            "event_type": et,
            "timestamp": ts,
            "hospital_id": doc.get("hospital_id") or hid,
            "summary": ", ".join(summary_bits[:6]) if summary_bits else et,
            "actor": doc.get("actor") or doc.get("posted_by") or doc.get("admin_name") or doc.get("user_email"),
        })

    # Recent admin/doctor sessions as security context
    sessions = list(
        db.user_sessions.find({}, {"_id": 0})
        .sort("login_at", -1)
        .limit(15)
    )
    session_rows = []
    for s in sessions:
        session_rows.append({
            "session_id": s.get("session_id"),
            "user_id": s.get("user_id"),
            "name": s.get("name"),
            "email": s.get("email"),
            "role": s.get("role"),
            "login_at": s.get("login_at"),
            "last_activity_at": s.get("last_activity_at"),
            "ip_address": s.get("ip_address"),
            "status": s.get("status") or ("active" if s.get("is_active", True) else "ended"),
        })

    types = sorted({r["event_type"] for r in rows})
    return {
        "hospital_id": hid,
        "total": len(rows),
        "event_types": types,
        "events": rows,
        "recent_sessions": session_rows,
    }
