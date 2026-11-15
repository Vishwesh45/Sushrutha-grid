"""Ward bed inventory — live admin bed tab (no hardcoded UI counts)."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.database import get_database

OPERATIONAL_HID = "HOSP-BLR-001"
OPERATIONAL_HNAME = "Victoria Hospital (BMCRI Apex Medical Center)"

DEFAULT_WARDS = [
    {"ward_id": "WARD-GEN-01", "ward_name": "General Medical Wards", "ward_type": "GENERAL", "total_beds": 220, "occupied_beds": 180},
    {"ward_id": "WARD-ICU-01", "ward_name": "ICU Critical Care", "ward_type": "ICU", "total_beds": 24, "occupied_beds": 22},
    {"ward_id": "WARD-ER-01", "ward_name": "Emergency Observation", "ward_type": "EMERGENCY", "total_beds": 15, "occupied_beds": 8},
    {"ward_id": "WARD-SUR-01", "ward_name": "Surgical Recovery", "ward_type": "SURGICAL", "total_beds": 40, "occupied_beds": 28},
    {"ward_id": "WARD-MAT-01", "ward_name": "Maternity / Labour", "ward_type": "MATERNITY", "total_beds": 36, "occupied_beds": 21},
]


def _iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def ensure_default_wards(db=None, hospital_id: str = OPERATIONAL_HID) -> int:
    db = db if db is not None else get_database()
    created = 0
    for w in DEFAULT_WARDS:
        existing = db.ward_beds.find_one({"hospital_id": hospital_id, "ward_id": w["ward_id"]})
        if existing:
            continue
        db.ward_beds.insert_one({
            **w,
            "hospital_id": hospital_id,
            "hospital_name": OPERATIONAL_HNAME,
            "updated_at": _iso(),
            "created_at": _iso(),
        })
        created += 1
    return created


def list_wards(db=None, hospital_id: str = OPERATIONAL_HID) -> List[Dict[str, Any]]:
    db = db if db is not None else get_database()
    ensure_default_wards(db, hospital_id)
    rows = list(db.ward_beds.find({"hospital_id": hospital_id}, {"_id": 0}).sort("ward_name", 1))
    for r in rows:
        total = int(r.get("total_beds") or 0)
        occ = int(r.get("occupied_beds") or 0)
        avail = max(0, total - occ)
        r["available_beds"] = avail
        r["occupancy_pct"] = round((occ / total) * 100, 1) if total else 0
        if r["occupancy_pct"] >= 95:
            r["pressure"] = "critical"
        elif r["occupancy_pct"] >= 80:
            r["pressure"] = "high"
        else:
            r["pressure"] = "normal"
    return rows


def summary(db=None, hospital_id: str = OPERATIONAL_HID) -> Dict[str, Any]:
    wards = list_wards(db, hospital_id)
    total = sum(int(w.get("total_beds") or 0) for w in wards)
    occupied = sum(int(w.get("occupied_beds") or 0) for w in wards)
    available = max(0, total - occupied)
    return {
        "hospital_id": hospital_id,
        "hospital_name": OPERATIONAL_HNAME,
        "ward_count": len(wards),
        "total_beds": total,
        "occupied_beds": occupied,
        "available_beds": available,
        "occupancy_pct": round((occupied / total) * 100, 1) if total else 0,
        "wards": wards,
    }


def update_ward_occupancy(
    ward_id: str,
    *,
    occupied_beds: Optional[int] = None,
    total_beds: Optional[int] = None,
    hospital_id: str = OPERATIONAL_HID,
    db=None,
) -> Dict[str, Any]:
    db = db if db is not None else get_database()
    ensure_default_wards(db, hospital_id)
    doc = db.ward_beds.find_one({"hospital_id": hospital_id, "ward_id": ward_id})
    if not doc:
        raise ValueError(f"Ward '{ward_id}' not found.")

    total = int(total_beds if total_beds is not None else doc.get("total_beds") or 0)
    occ = int(occupied_beds if occupied_beds is not None else doc.get("occupied_beds") or 0)
    if total < 1:
        raise ValueError("total_beds must be at least 1.")
    if occ < 0 or occ > total:
        raise ValueError(f"occupied_beds must be between 0 and {total}.")

    db.ward_beds.update_one(
        {"hospital_id": hospital_id, "ward_id": ward_id},
        {"$set": {"total_beds": total, "occupied_beds": occ, "updated_at": _iso()}},
    )
    db.hospital_events.insert_one({
        "event_type": "BED_OCCUPANCY_UPDATED",
        "hospital_id": hospital_id,
        "ward_id": ward_id,
        "occupied_beds": occ,
        "total_beds": total,
        "timestamp": _iso(),
    })
    updated = db.ward_beds.find_one({"hospital_id": hospital_id, "ward_id": ward_id}, {"_id": 0})
    total_u = int(updated.get("total_beds") or 0)
    occ_u = int(updated.get("occupied_beds") or 0)
    updated["available_beds"] = max(0, total_u - occ_u)
    updated["occupancy_pct"] = round((occ_u / total_u) * 100, 1) if total_u else 0
    return updated
