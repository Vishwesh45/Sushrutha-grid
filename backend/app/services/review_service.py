"""Structured patient ratings: facility, department, doctor, ward + emergency alerts."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app.database import get_database
from app.services.hospital_service import OPERATIONAL_TENANT_HOSPITAL, get_hospital_by_id


def _iso_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def severity_band(avg: float) -> str:
    """green = good, yellow = average, red = bad."""
    if avg is None:
        return "yellow"
    if avg >= 4.0:
        return "green"
    if avg >= 3.0:
        return "yellow"
    return "red"


def _distribution(ratings: List[int]) -> List[Dict[str, int]]:
    counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for r in ratings:
        if r in counts:
            counts[r] += 1
    return [{"stars": s, "count": counts[s]} for s in range(5, 0, -1)]


def _avg(vals: List[float]) -> float:
    return round(sum(vals) / len(vals), 2) if vals else 0.0


def _xai_band_phrase(band: str) -> str:
    return {
        "green": "GOOD (≥4★)",
        "yellow": "AVERAGE (~3★)",
        "red": "BAD (≤2★ / critical)",
    }.get(band, band.upper())


def build_doctor_xai(doc: Dict[str, Any]) -> str:
    band = doc.get("severity_band") or severity_band(doc.get("avg_rating") or 0)
    parts = [
        f"XAI · {doc.get('doctor_name')}: {_xai_band_phrase(band)} at {doc.get('avg_rating')}★ "
        f"from {doc.get('review_count')} patient review(s)"
    ]
    if doc.get("department"):
        parts.append(f"in {doc['department']}")
    bad = int(doc.get("bad_review_count") or 0)
    if bad:
        parts.append(f"— {bad} emergency-level rating(s) ≤2★")
    if doc.get("latest_bad_comment"):
        parts.append(f". Patient signal: “{doc['latest_bad_comment'][:160]}”")
    elif band == "green":
        parts.append(". No critical complaints; communication/care scores are strong.")
    elif band == "yellow":
        parts.append(". Mixed feedback — monitor wait experience and consult clarity.")
    else:
        parts.append(". Escalate to department head for counselling / roster review.")
    return " ".join(parts)


def build_department_xai(dept: Dict[str, Any]) -> str:
    band = dept.get("severity_band") or severity_band(dept.get("avg_department_rating") or 0)
    docs = dept.get("doctors") or []
    red_docs = [d for d in docs if d.get("severity_band") == "red"]
    green_docs = [d for d in docs if d.get("severity_band") == "green"]
    parts = [
        f"XAI · {dept.get('department')}: {_xai_band_phrase(band)} — "
        f"department {dept.get('avg_department_rating')}★, doctors {dept.get('avg_doctor_rating')}★, "
        f"ward {dept.get('avg_ward_rating')}★, facility touch {dept.get('avg_facility_rating')}★ "
        f"across {dept.get('review_count')} review(s)."
    ]
    if red_docs:
        names = ", ".join(d.get("doctor_name", "Doctor") for d in red_docs[:3])
        parts.append(f" Critical doctor signal: {names}.")
    elif green_docs and band != "red":
        names = ", ".join(d.get("doctor_name", "Doctor") for d in green_docs[:2])
        parts.append(f" Strong clinicians: {names}.")
    bad = int(dept.get("bad_review_count") or 0)
    if bad:
        parts.append(f" {bad} review(s) carried an emergency flag (facility/dept/doctor/ward ≤2★).")
    if band == "red":
        parts.append(" Recommended action: same-day HO / MS review of queue, chamber load, and named clinicians.")
    elif band == "yellow":
        parts.append(" Recommended action: weekly quality huddle; watch waiting-time and ward comments.")
    else:
        parts.append(" Recommended action: keep current roster pattern; sample praise for training.")
    return "".join(parts)


def build_facility_xai(facility: Dict[str, Any], emergency_count: int, dept_red: int) -> str:
    band = facility.get("severity_band") or "yellow"
    return (
        f"XAI · Hospital facility: {_xai_band_phrase(band)} at {facility.get('avg_rating')}★ "
        f"from {facility.get('review_count')} ratings. "
        f"{emergency_count} emergency alert(s) active; {dept_red} department(s) in RED. "
        f"Drivers are patient scores on cleanliness, waiting, staff behaviour, and ward areas — "
        f"not Google Maps ratings."
    )


def build_hospital_xai(overall: Dict[str, Any], facility: Dict[str, Any], departments: List[Dict[str, Any]], emergency_count: int) -> str:
    red_depts = [d["department"] for d in departments if d.get("severity_band") == "red"]
    yellow_depts = [d["department"] for d in departments if d.get("severity_band") == "yellow"]
    green_depts = [d["department"] for d in departments if d.get("severity_band") == "green"]
    bits = [
        f"XAI hospital brief: overall {_xai_band_phrase(overall.get('severity_band'))} "
        f"({overall.get('avg_rating')}★) · facility {facility.get('avg_rating')}★."
    ]
    if red_depts:
        bits.append(f" Priority departments: {', '.join(red_depts)}.")
    if yellow_depts:
        bits.append(f" Watchlist: {', '.join(yellow_depts)}.")
    if green_depts:
        bits.append(f" Stable: {', '.join(green_depts)}.")
    bits.append(f" Emergency lookup queue: {emergency_count} item(s).")
    return " ".join(bits)


def _emergency_targets(doc: Dict[str, Any]) -> List[str]:
    targets = []
    if int(doc.get("facility_rating") or 5) <= 2:
        targets.append("facility")
    if int(doc.get("department_rating") or 5) <= 2:
        targets.append("department")
    if int(doc.get("doctor_rating") or 5) <= 2:
        targets.append("doctor")
    if int(doc.get("ward_rating") or 5) <= 2:
        targets.append("ward")
    return targets


def _enrich_review_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    targets = _emergency_targets(doc)
    scores = [
        int(doc.get("facility_rating") or 0),
        int(doc.get("department_rating") or 0),
        int(doc.get("doctor_rating") or 0),
        int(doc.get("ward_rating") or 0),
    ]
    scores = [s for s in scores if s > 0]
    overall = _avg(scores)
    doc["severity_band"] = severity_band(overall)
    doc["has_emergency_flag"] = len(targets) > 0
    doc["emergency_targets"] = targets
    # Back-compat aliases for older simple reviews
    if "hospital_rating" in doc and not doc.get("facility_rating"):
        doc["facility_rating"] = doc["hospital_rating"]
    return doc


class ReviewAlreadyExistsError(Exception):
    """Patient already reviewed this consultation / appointment."""

    def __init__(self, existing: Dict[str, Any]):
        self.existing = existing
        super().__init__("Review already submitted for this visit.")


class ReviewVisitError(Exception):
    """Invalid or unauthorized consultation for review."""


def submit_patient_review(
    *,
    patient_id: str,
    patient_name: str,
    hospital_id: str,
    facility_rating: int,
    department_rating: int,
    doctor_rating: int,
    ward_rating: int,
    department: Optional[str] = None,
    doctor_id: Optional[str] = None,
    doctor_name: Optional[str] = None,
    ward_name: Optional[str] = None,
    consultation_id: Optional[str] = None,
    token_number: Optional[str] = None,
    cleanliness_rating: Optional[int] = None,
    waiting_time_rating: Optional[int] = None,
    staff_behaviour_rating: Optional[int] = None,
    facility_comment: Optional[str] = None,
    department_comment: Optional[str] = None,
    doctor_comment: Optional[str] = None,
    ward_comment: Optional[str] = None,
    overall_comment: Optional[str] = None,
    db=None,
) -> Dict[str, Any]:
    if db is None:
        db = get_database()

    cid = (consultation_id or "").strip()
    if not cid:
        raise ReviewVisitError("Select a completed visit to review. One review is allowed per appointment.")

    from bson import ObjectId
    try:
        consult = db.consultations.find_one({"_id": ObjectId(cid)})
    except Exception as exc:
        raise ReviewVisitError("Invalid visit id.") from exc
    if not consult:
        raise ReviewVisitError("Visit not found.")
    if consult.get("patient_id") != patient_id:
        raise ReviewVisitError("You can only review your own visits.")

    # Lock hospital / department / doctor / token from the visit — not free-text edits
    hid = (consult.get("hospital_id") or hospital_id or OPERATIONAL_TENANT_HOSPITAL["hospital_id"]).strip()
    hosp = get_hospital_by_id(hid, db) or OPERATIONAL_TENANT_HOSPITAL
    locked_department = consult.get("department") or department or "General Medicine"
    locked_doctor_id = consult.get("assigned_doctor_id") or doctor_id
    locked_doctor_name = consult.get("assigned_doctor_name") or doctor_name
    locked_token = consult.get("token_number") or token_number
    locked_ward = (
        f"Chamber {consult['assigned_room']}"
        if consult.get("assigned_room")
        else (ward_name or "OPD Chamber / Waiting Area")
    )

    existing = db.patient_reviews.find_one({
        "patient_id": patient_id,
        "consultation_id": cid,
    })
    if existing:
        existing["id"] = str(existing.pop("_id"))
        raise ReviewAlreadyExistsError(_enrich_review_doc(existing))

    doc = {
        "hospital_id": hid,
        "hospital_name": hosp.get("name") or consult.get("hospital_name"),
        "patient_id": patient_id,
        "patient_name": patient_name or "Verified Patient",
        "consultation_id": cid,
        "token_number": locked_token,
        "department": locked_department,
        "doctor_id": locked_doctor_id,
        "doctor_name": locked_doctor_name,
        "ward_name": locked_ward,
        "facility_rating": int(facility_rating),
        "department_rating": int(department_rating),
        "doctor_rating": int(doctor_rating),
        "ward_rating": int(ward_rating),
        "cleanliness_rating": int(cleanliness_rating) if cleanliness_rating is not None else None,
        "waiting_time_rating": int(waiting_time_rating) if waiting_time_rating is not None else None,
        "staff_behaviour_rating": int(staff_behaviour_rating) if staff_behaviour_rating is not None else None,
        "facility_comment": (facility_comment or "").strip() or None,
        "department_comment": (department_comment or "").strip() or None,
        "doctor_comment": (doctor_comment or "").strip() or None,
        "ward_comment": (ward_comment or "").strip() or None,
        "overall_comment": (overall_comment or "").strip() or None,
        # legacy mirror for older UI paths
        "hospital_rating": int(facility_rating),
        "comment": (overall_comment or "").strip() or None,
        "created_at": _iso_now(),
        "schema_version": 2,
    }
    doc = _enrich_review_doc(doc)

    result = db.patient_reviews.insert_one(dict(doc))
    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)

    db.hospital_events.insert_one({
        "event_type": "PATIENT_REVIEW_SUBMITTED",
        "hospital_id": hid,
        "patient_id": patient_id,
        "doctor_id": locked_doctor_id,
        "department": doc["department"],
        "facility_rating": doc["facility_rating"],
        "department_rating": doc["department_rating"],
        "doctor_rating": doc["doctor_rating"],
        "ward_rating": doc["ward_rating"],
        "has_emergency_flag": doc["has_emergency_flag"],
        "emergency_targets": doc["emergency_targets"],
        "consultation_id": cid,
        "timestamp": doc["created_at"],
    })
    try:
        from app.routes.ws import broadcast_event
        broadcast_event("PATIENT_REVIEW_SUBMITTED", {
            "hospital_id": hid,
            "patient_id": patient_id,
            "doctor_id": locked_doctor_id,
            "doctor_name": locked_doctor_name,
            "department": doc["department"],
            "consultation_id": cid,
            "has_emergency_flag": doc["has_emergency_flag"],
            "emergency_targets": doc["emergency_targets"],
            "severity_band": doc["severity_band"],
            "timestamp": doc["created_at"],
        })
    except Exception:
        pass
    return doc


def get_hospital_review_analytics(hospital_id: str, db=None) -> Dict[str, Any]:
    if db is None:
        db = get_database()

    hid = (hospital_id or OPERATIONAL_TENANT_HOSPITAL["hospital_id"]).strip()
    hosp = get_hospital_by_id(hid, db) or OPERATIONAL_TENANT_HOSPITAL
    raw = list(db.patient_reviews.find({"hospital_id": hid}).sort("created_at", -1))

    reviews = []
    for r in raw:
        item = dict(r)
        item["id"] = str(item.pop("_id"))
        # migrate legacy simple reviews into structured shape for analytics
        if item.get("facility_rating") is None and item.get("hospital_rating") is not None:
            item["facility_rating"] = item["hospital_rating"]
            item["department_rating"] = item.get("department_rating") or item["hospital_rating"]
            item["doctor_rating"] = item.get("doctor_rating") or item["hospital_rating"]
            item["ward_rating"] = item.get("ward_rating") or item["hospital_rating"]
        item = _enrich_review_doc(item)
        reviews.append(item)

    # Fold legacy hospital_reviews (simple 1–5 + comment) into the same analytics pool
    legacy = list(db.hospital_reviews.find({"hospital_id": hid}).sort("created_at", -1))
    for r in legacy:
        stars = r.get("rating") or r.get("hospital_rating") or r.get("facility_rating")
        if stars is None:
            continue
        try:
            stars = int(stars)
        except (TypeError, ValueError):
            continue
        item = {
            "id": f"legacy-{r.get('_id')}",
            "hospital_id": hid,
            "hospital_name": hosp.get("name"),
            "patient_id": r.get("patient_id"),
            "patient_name": r.get("patient_name"),
            "consultation_id": r.get("consultation_id"),
            "token_number": r.get("token_number"),
            "department": r.get("department") or r.get("department_visited") or "General Medicine",
            "doctor_id": r.get("doctor_id"),
            "doctor_name": r.get("doctor_name"),
            "ward_name": r.get("ward_name") or "OPD Chamber / Waiting Area",
            "facility_rating": stars,
            "department_rating": int(r.get("department_rating") or stars),
            "doctor_rating": int(r.get("doctor_rating") or stars),
            "ward_rating": int(r.get("ward_rating") or stars),
            "facility_comment": r.get("comment") or r.get("facility_comment"),
            "overall_comment": r.get("comment"),
            "created_at": r.get("created_at") or _iso_now(),
        }
        reviews.append(_enrich_review_doc(item))
    reviews.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)

    fac = [int(r["facility_rating"]) for r in reviews if r.get("facility_rating")]
    dep = [int(r["department_rating"]) for r in reviews if r.get("department_rating")]
    doc_r = [int(r["doctor_rating"]) for r in reviews if r.get("doctor_rating") is not None]
    ward = [int(r["ward_rating"]) for r in reviews if r.get("ward_rating")]
    overall_scores = []
    for r in reviews:
        parts = [r.get("facility_rating"), r.get("department_rating"), r.get("doctor_rating"), r.get("ward_rating")]
        parts = [int(p) for p in parts if p is not None]
        if parts:
            overall_scores.append(sum(parts) / len(parts))

    facility_summary = {
        "dimension": "facility",
        "avg_rating": _avg(fac),
        "review_count": len(fac),
        "severity_band": severity_band(_avg(fac)),
        "rating_distribution": _distribution(fac),
    }
    overall_summary = {
        "dimension": "overall",
        "avg_rating": _avg(overall_scores),
        "review_count": len(reviews),
        "severity_band": severity_band(_avg(overall_scores)),
        "rating_distribution": _distribution([int(round(x)) for x in overall_scores]),
    }
    # xai_summary filled after departments/emergencies computed

    # Doctors first (then nest under departments)
    by_doctor: Dict[str, Dict[str, Any]] = {}
    for r in reviews:
        if r.get("doctor_rating") is None:
            continue
        key = r.get("doctor_id") or r.get("doctor_name") or "unknown"
        b = by_doctor.setdefault(key, {
            "doctor_id": r.get("doctor_id"),
            "doctor_name": r.get("doctor_name") or "Doctor",
            "department": r.get("department") or "General Medicine",
            "ratings": [],
            "bad": 0,
            "latest_bad_comment": None,
        })
        b["ratings"].append(int(r["doctor_rating"]))
        if r.get("department"):
            b["department"] = r["department"]
        if int(r["doctor_rating"]) <= 2:
            b["bad"] += 1
            comment = r.get("doctor_comment") or r.get("overall_comment") or r.get("comment")
            if comment and not b["latest_bad_comment"]:
                b["latest_bad_comment"] = comment

    doctors = []
    for b in by_doctor.values():
        avg = _avg(b["ratings"])
        doc_row = {
            "doctor_id": b.get("doctor_id"),
            "doctor_name": b["doctor_name"],
            "department": b.get("department"),
            "avg_rating": avg,
            "review_count": len(b["ratings"]),
            "severity_band": severity_band(avg),
            "bad_review_count": b["bad"],
            "latest_bad_comment": b["latest_bad_comment"],
        }
        doc_row["xai_summary"] = build_doctor_xai(doc_row)
        doctors.append(doc_row)
    doctors.sort(key=lambda x: (x["severity_band"] != "red", x["avg_rating"], -x["review_count"]))

    doctors_by_dept: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for d in doctors:
        doctors_by_dept[d.get("department") or "General Medicine"].append(d)

    # By department (with nested doctors + XAI)
    by_dept: Dict[str, Dict[str, Any]] = {}
    for r in reviews:
        dname = r.get("department") or "General Medicine"
        b = by_dept.setdefault(dname, {
            "department": dname,
            "dept": [], "fac": [], "doc": [], "ward": [], "bad": 0,
        })
        if r.get("department_rating"):
            b["dept"].append(int(r["department_rating"]))
        if r.get("facility_rating"):
            b["fac"].append(int(r["facility_rating"]))
        if r.get("doctor_rating") is not None:
            b["doc"].append(int(r["doctor_rating"]))
        if r.get("ward_rating"):
            b["ward"].append(int(r["ward_rating"]))
        if r.get("has_emergency_flag"):
            b["bad"] += 1

    departments = []
    for b in by_dept.values():
        avg_d = _avg(b["dept"])
        nested_docs = sorted(
            doctors_by_dept.get(b["department"], []),
            key=lambda x: (x["severity_band"] != "red", x["avg_rating"]),
        )
        dept_row = {
            "department": b["department"],
            "avg_department_rating": avg_d,
            "avg_facility_rating": _avg(b["fac"]),
            "avg_doctor_rating": _avg(b["doc"]),
            "avg_ward_rating": _avg(b["ward"]),
            "review_count": max(len(b["dept"]), len(b["fac"]), 1),
            "severity_band": severity_band(avg_d),
            "bad_review_count": b["bad"],
            "doctors": nested_docs,
        }
        dept_row["xai_summary"] = build_department_xai(dept_row)
        departments.append(dept_row)
    departments.sort(key=lambda x: (x["severity_band"] != "red", x["avg_department_rating"]))

    # Wards
    by_ward: Dict[str, Dict[str, Any]] = {}
    for r in reviews:
        wname = r.get("ward_name") or "OPD Chamber / Waiting Area"
        b = by_ward.setdefault(wname, {"ward_name": wname, "ratings": [], "bad": 0})
        if r.get("ward_rating"):
            b["ratings"].append(int(r["ward_rating"]))
        if int(r.get("ward_rating") or 5) <= 2:
            b["bad"] += 1
    wards = []
    for b in by_ward.values():
        avg = _avg(b["ratings"])
        wards.append({
            "ward_name": b["ward_name"],
            "avg_rating": avg,
            "review_count": len(b["ratings"]),
            "severity_band": severity_band(avg),
            "bad_review_count": b["bad"],
        })
    wards.sort(key=lambda x: (x["severity_band"] != "red", x["avg_rating"]))

    # Emergency lookup — any dimension rated <= 2
    emergency_alerts = []
    for r in reviews:
        created = r.get("created_at") or ""
        mapping = [
            ("facility", "facility", r.get("hospital_name") or "Hospital facility", r.get("facility_rating"), r.get("facility_comment")),
            ("department", "department", r.get("department") or "Department", r.get("department_rating"), r.get("department_comment")),
            ("doctor", "doctor", r.get("doctor_name") or "Doctor", r.get("doctor_rating"), r.get("doctor_comment")),
            ("ward", "ward", r.get("ward_name") or "Ward", r.get("ward_rating"), r.get("ward_comment")),
        ]
        for target_type, _key, target_name, rating, comment in mapping:
            if rating is None:
                continue
            if int(rating) <= 2:
                emergency_alerts.append({
                    "id": f"{r['id']}-{target_type}",
                    "severity": "red",
                    "target_type": target_type,
                    "target_name": target_name,
                    "rating": int(rating),
                    "department": r.get("department"),
                    "doctor_name": r.get("doctor_name"),
                    "ward_name": r.get("ward_name"),
                    "patient_name": r.get("patient_name"),
                    "comment": comment or r.get("overall_comment") or r.get("comment"),
                    "created_at": created,
                    "token_number": r.get("token_number"),
                })
    emergency_alerts.sort(key=lambda a: a["created_at"], reverse=True)

    # 14-day trend
    today = datetime.utcnow().date()
    trend_map = defaultdict(lambda: {"reviews": 0, "sum": 0.0, "bad": 0})
    for r in reviews:
        raw_ts = str(r.get("created_at") or "")
        try:
            day = datetime.fromisoformat(raw_ts.replace("Z", "")).date()
        except Exception:
            continue
        if day < today - timedelta(days=13):
            continue
        key = day.isoformat()
        parts = [r.get("facility_rating"), r.get("department_rating"), r.get("doctor_rating"), r.get("ward_rating")]
        parts = [int(p) for p in parts if p is not None]
        if not parts:
            continue
        avg = sum(parts) / len(parts)
        trend_map[key]["reviews"] += 1
        trend_map[key]["sum"] += avg
        if r.get("has_emergency_flag"):
            trend_map[key]["bad"] += 1

    trend = []
    for i in range(13, -1, -1):
        day = (today - timedelta(days=i)).isoformat()
        cell = trend_map[day]
        trend.append({
            "date": day,
            "reviews": cell["reviews"],
            "avg_overall_rating": round(cell["sum"] / cell["reviews"], 2) if cell["reviews"] else 0,
            "bad_reviews": cell["bad"],
        })

    emergency_count = len(emergency_alerts)
    dept_red = sum(1 for d in departments if d.get("severity_band") == "red")
    facility_summary["xai_summary"] = build_facility_xai(facility_summary, emergency_count, dept_red)
    overall_summary["xai_summary"] = build_hospital_xai(overall_summary, facility_summary, departments, emergency_count)
    xai_hospital_summary = overall_summary["xai_summary"]

    return {
        "hospital_id": hid,
        "hospital_name": hosp.get("name"),
        "total_reviews": len(reviews),
        "overall": overall_summary,
        "facility": facility_summary,
        "departments": departments,
        "doctors": doctors,
        "wards": wards,
        "emergency_alerts": emergency_alerts[:50],
        "emergency_count": emergency_count,
        "recent_reviews": reviews[:25],
        "trend_last_14_days": trend,
        "xai_hospital_summary": xai_hospital_summary,
        # keep light aliases so older UI does not crash during transition
        "avg_hospital_rating": facility_summary["avg_rating"],
        "avg_doctor_rating": _avg(doc_r) if doc_r else None,
        "hospital_rating_distribution": facility_summary["rating_distribution"],
        "top_doctors": doctors[:12],
    }
