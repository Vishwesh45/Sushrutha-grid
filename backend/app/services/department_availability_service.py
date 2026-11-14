"""
Department availability at an operational hospital (roster-based).

NLP always runs. Token issue is allowed only when the routed department
exists on that hospital's doctor roster. Otherwise the patient is told
the specialty is not offered here and is pointed to other centres.
Ready for additional operational hospitals later.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.database import get_database
from app.services.queue_service import normalize_roster_department

# Fallback referral centres when no other operational roster / nearby match exists yet.
KNOWN_REFERRAL_CENTRES: Dict[str, List[Dict[str, Any]]] = {
    "Psychiatry": [
        {
            "name": "NIMHANS (National Institute of Mental Health & Neurosciences)",
            "hospital_id": None,
            "reason": "Apex psychiatry & neurosciences referral centre",
            "is_grid_pilot": False,
            "address": "Hosur Road, Bengaluru",
        }
    ],
    "Pediatrics": [
        {
            "name": "Indira Gandhi Institute of Child Health (IGICH)",
            "hospital_id": None,
            "reason": "Dedicated government children's hospital",
            "is_grid_pilot": False,
            "address": "South Hospital Complex, Bengaluru",
        },
        {
            "name": "Vani Vilas Women & Children Hospital (BMCRI)",
            "hospital_id": None,
            "reason": "Women & children specialty hospital under BMCRI",
            "is_grid_pilot": False,
            "address": "Near Victoria Hospital, Bengaluru",
        },
    ],
    "Obstetrics & Gynecology": [
        {
            "name": "Vani Vilas Women & Children Hospital (BMCRI)",
            "hospital_id": None,
            "reason": "Dedicated OB-GYN / PCOD adolescent clinics",
            "is_grid_pilot": False,
            "address": "Near Victoria Hospital, Bengaluru",
        },
        {
            "name": "K.C. General Hospital",
            "hospital_id": None,
            "reason": "District hospital with OB-GYN OPD",
            "is_grid_pilot": False,
            "address": "Malleshwaram, Bengaluru",
        },
    ],
    "Cardiology": [
        {
            "name": "Sri Jayadeva Institute of Cardiovascular Sciences",
            "hospital_id": None,
            "reason": "Government cardiac super-specialty institute",
            "is_grid_pilot": False,
            "address": "Bannerghatta Road / other Jayadeva campuses, Bengaluru",
        }
    ],
    "Neurology": [
        {
            "name": "NIMHANS",
            "hospital_id": None,
            "reason": "Apex neurology & neurosurgery centre",
            "is_grid_pilot": False,
            "address": "Hosur Road, Bengaluru",
        }
    ],
    "Ophthalmology": [
        {
            "name": "Minto Ophthalmic Hospital",
            "hospital_id": None,
            "reason": "Government regional eye hospital",
            "is_grid_pilot": False,
            "address": "Near Victoria campus, Bengaluru",
        }
    ],
}


def _hospital_doctor_query(hospital_id: str) -> dict:
    hid = (hospital_id or "HOSP-BLR-001").strip()
    if hid == "HOSP-BLR-001":
        return {"$or": [{"hospital_id": "HOSP-BLR-001"}, {"hospital_id": {"$exists": False}}, {"hospital_id": None}]}
    return {"hospital_id": hid}


def get_roster_departments(hospital_id: str) -> List[str]:
    db = get_database()
    depts = db.doctors.distinct("department", _hospital_doctor_query(hospital_id))
    cleaned = sorted({(d or "").strip() for d in depts if d and str(d).strip()})
    return cleaned


def hospital_has_department(hospital_id: str, department: str) -> bool:
    """True if at least one roster doctor matches the canonical department."""
    canonical = normalize_roster_department(department)
    db = get_database()
    count = db.doctors.count_documents({
        "$and": [
            _hospital_doctor_query(hospital_id),
            {"department": {"$regex": f"^{canonical}$", "$options": "i"}},
        ]
    })
    return count > 0


def _recommendations_from_other_operational(
    canonical_dept: str,
    exclude_hospital_id: str,
) -> List[Dict[str, Any]]:
    """Future-ready: other hospitals that already have doctors in this department."""
    db = get_database()
    pipeline = [
        {
            "$match": {
                "department": {"$regex": f"^{canonical_dept}$", "$options": "i"},
                "hospital_id": {"$nin": [exclude_hospital_id, None]},
            }
        },
        {
            "$group": {
                "_id": "$hospital_id",
                "hospital_name": {"$first": "$hospital_name"},
                "doctor_count": {"$sum": 1},
            }
        },
        {"$sort": {"doctor_count": -1}},
        {"$limit": 5},
    ]
    out = []
    for row in db.doctors.aggregate(pipeline):
        hid = row.get("_id")
        if not hid or hid == exclude_hospital_id:
            continue
        out.append({
            "name": row.get("hospital_name") or hid,
            "hospital_id": hid,
            "reason": f"Digital roster has {row.get('doctor_count', 0)} doctor(s) in {canonical_dept}",
            "is_grid_pilot": True,
            "doctor_count": row.get("doctor_count", 0),
            "address": None,
            "distance_km": None,
        })
    return out


def _recommendations_from_nearby(
    canonical_dept: str,
    lat: Optional[float],
    lon: Optional[float],
    exclude_hospital_id: str,
) -> List[Dict[str, Any]]:
    if lat is None or lon is None:
        return []
    try:
        from app.services.hospital_service import get_nearby_hospitals
        nearby = get_nearby_hospitals(
            user_lat=lat,
            user_lon=lon,
            department=canonical_dept,
            radius_km=20.0,
        )
    except Exception:
        return []

    out = []
    for h in nearby:
        hid = h.get("hospital_id")
        if hid == exclude_hospital_id:
            continue
        out.append({
            "name": h.get("name"),
            "hospital_id": hid,
            "reason": f"Listed departments include {canonical_dept}",
            "is_grid_pilot": bool(h.get("is_grid_pilot")),
            "address": h.get("address"),
            "distance_km": h.get("distance_km"),
            "latitude": h.get("latitude"),
            "longitude": h.get("longitude"),
        })
        if len(out) >= 5:
            break
    return out


def check_department_availability(
    *,
    hospital_id: str,
    department: str,
    hospital_name: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> Dict[str, Any]:
    canonical = normalize_roster_department(department)
    db = get_database()
    hosp = db.hospitals.find_one({"hospital_id": hospital_id}) or {}
    hname = hospital_name or hosp.get("name") or hospital_id

    available = hospital_has_department(hospital_id, canonical)
    roster = get_roster_departments(hospital_id)

    if available:
        return {
            "available": True,
            "can_issue_token": True,
            "hospital_id": hospital_id,
            "hospital_name": hname,
            "requested_department": department,
            "canonical_department": canonical,
            "roster_departments": roster,
            "message": f"{canonical} is available at {hname}. You can continue for a digital OPD token.",
            "recommended_hospitals": [],
        }

    recommendations: List[Dict[str, Any]] = []
    seen = set()

    def _add(items: List[Dict[str, Any]]):
        for item in items:
            key = (item.get("hospital_id") or item.get("name") or "").lower()
            if not key or key in seen:
                continue
            seen.add(key)
            recommendations.append(item)

    _add(_recommendations_from_other_operational(canonical, hospital_id))
    _add(_recommendations_from_nearby(canonical, lat, lon, hospital_id))
    _add(KNOWN_REFERRAL_CENTRES.get(canonical, []))

    return {
        "available": False,
        "can_issue_token": False,
        "hospital_id": hospital_id,
        "hospital_name": hname,
        "requested_department": department,
        "canonical_department": canonical,
        "roster_departments": roster,
        "message": (
            f"{hname} does not currently have a live {canonical} department on the digital roster. "
            f"Your symptoms were still analysed. Please visit one of the recommended centres below "
            f"(or ask reception for a paper referral)."
        ),
        "recommended_hospitals": recommendations[:6],
    }
