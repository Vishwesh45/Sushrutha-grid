"""
OPD Queue & Token Routing Engine Service
Handles sequential token generation, clinical priority rank assignment,
smart doctor chamber matchmaking, and operational telemetry.
Grounded in Master Specification Sections 1, 2, 8, 9, and 17.
"""

import re
from datetime import datetime, date
from typing import Optional, Dict, Any, Tuple
from bson import ObjectId
from app.database import get_database

DEPARTMENT_PREFIX_MAP = {
    "General Medicine": "GM",
    "Cardiology": "CD",
    "Orthopedics": "OR",
    "Pediatrics": "PD",
    "Obstetrics & Gynecology": "OB",
    "Emergency Care Ward": "EM",
    "Emergency / Trauma": "EM",
    "Emergency": "EM",
    "ENT (Ear, Nose, Throat)": "ENT",
    "ENT": "ENT",
    "Dermatology": "DERM",
    "Neurology": "NEUR",
    "Pulmonology": "PULM",
    "Psychiatry": "PSY",
    "Ophthalmology": "OPH",
    "Gastroenterology": "GAST",
    "Urology": "URO",
    "Endocrinology": "ENDO",
}

ROSTER_CANONICAL_DEPARTMENTS = [
    "Obstetrics & Gynecology",
    "General Medicine",
    "Cardiology",
    "Orthopedics",
    "Pulmonology",
    "Neurology",
    "Gastroenterology",
    "Urology",
    "ENT",
    "Ophthalmology",
    "Dermatology",
    "Endocrinology",
]

PRIORITY_RANK_MAP = {
    "RED": 1,     # Highest priority (Emergency / ESI 1-2)
    "AMBER": 2,   # High priority (Urgent / ESI 3)
    "GREEN": 3    # Standard priority (Routine OPD / ESI 4-5)
}


def normalize_roster_department(department: str) -> str:
    """
    Maps composite NLP routed labels (e.g., 'Cardiology / Emergency', 'ENT / General Medicine',
    'Orthopedics / Spine Clinic') to the canonical hospital roster department name.
    Prefer the left-most specialty so 'Dermatology / General Medicine' → Dermatology.
    """
    if not department:
        return "General Medicine"
    # Composite labels: use the primary specialty before slash/pipe
    primary = re.split(r"[/|]", department, maxsplit=1)[0].strip()
    dept_lower = primary.lower()
    full_lower = department.lower()

    # Specific specialties before General Medicine (GM often appears as a secondary tag)
    specialty_order = [d for d in ROSTER_CANONICAL_DEPARTMENTS if d != "General Medicine"]
    for canonical in specialty_order:
        if canonical.lower() in dept_lower or canonical.lower() in full_lower:
            # Ignore GM substring matches on composite strings like "X / General Medicine"
            if canonical == "General Medicine":
                continue
            return canonical

    if "gynec" in full_lower or "obstet" in full_lower or "maternal" in full_lower or "pcod" in full_lower or "pcos" in full_lower:
        return "Obstetrics & Gynecology"
    if "ortho" in full_lower or "spine" in full_lower or "bone" in full_lower or "knee" in full_lower or "ankle" in full_lower:
        return "Orthopedics"
    if "cardio" in full_lower or "heart" in full_lower:
        return "Cardiology"
    if "neuro" in full_lower or "stroke" in full_lower:
        return "Neurology"
    if "gastro" in full_lower or "abdom" in full_lower:
        return "Gastroenterology"
    if "pulmo" in full_lower or "respir" in full_lower or "wheez" in full_lower:
        return "Pulmonology"
    if "uro" in full_lower or "renal" in full_lower or "nephro" in full_lower:
        return "Urology"
    if "ent" in full_lower or re.search(r"\bear\b", full_lower):
        return "ENT"
    if "ophthal" in full_lower or re.search(r"\beye\b", full_lower):
        return "Ophthalmology"
    if "derm" in full_lower or "skin" in full_lower or "rash" in full_lower:
        return "Dermatology"
    if "endo" in full_lower or "diabet" in full_lower or "thyroid" in full_lower:
        return "Endocrinology"
    if "psych" in full_lower or "mental" in full_lower:
        return "Psychiatry"
    if "pedia" in full_lower or "paedia" in full_lower or "neonat" in full_lower:
        return "Pediatrics"
    if "general medicine" in dept_lower or "general medicine" in full_lower:
        return "General Medicine"
    return "General Medicine"


def get_department_prefix(department: str) -> str:
    """Returns the standardized 2-4 character prefix for token generation."""
    canonical = normalize_roster_department(department)
    if canonical in DEPARTMENT_PREFIX_MAP:
        return DEPARTMENT_PREFIX_MAP[canonical]
    for key, prefix in DEPARTMENT_PREFIX_MAP.items():
        if key.lower() in department.lower() or department.lower() in key.lower():
            return prefix
    return "OPD"


def select_doctor_and_room(
    department: str, 
    priority: str = "GREEN", 
    hospital_id: Optional[str] = "HOSP-BLR-001"
) -> Tuple[Optional[str], Optional[str], Optional[str], str, str]:
    """
    Explainable, workload-aware department doctor allocation strictly scoped to the hospital tenant.
    1. Normalizes department to match hospital roster.
    2. Filters doctors belonging to target hospital_id.
    3. Prioritizes AVAILABLE doctors over BUSY/ON_BREAK.
    4. For RED emergencies, prioritizes SENIOR_DOCTOR tier; otherwise balances by lowest active_queue_count.
    Returns (doctor_obj_id, doctor_name, doctor_tier, room_number, assignment_rationale).
    """
    db = get_database()
    canonical_dept = normalize_roster_department(department)
    dept_regex = {"$regex": f"^{canonical_dept}$", "$options": "i"}
    target_hid = (hospital_id or "HOSP-BLR-001").strip()
    priority_clean = "RED" if "RED" in str(priority).upper() else ("AMBER" if "AMBER" in str(priority).upper() else "GREEN")

    if target_hid == "HOSP-BLR-001":
        hosp_query: Dict[str, Any] = {"$or": [{"hospital_id": "HOSP-BLR-001"}, {"hospital_id": {"$exists": False}}, {"hospital_id": None}]}
    else:
        hosp_query = {"hospital_id": target_hid}

    # 1. Search for matching department doctors in the target hospital
    doctors_cursor = list(db.doctors.find({
        "$and": [hosp_query, {"department": dept_regex}]
    }))

    # 2. Fallback to General Medicine in the target hospital if specialty not staffed
    if not doctors_cursor:
        doctors_cursor = list(db.doctors.find({
            "$and": [hosp_query, {"department": {"$regex": "General Medicine", "$options": "i"}}]
        }))

    # 3. Fallback to any doctor in the target hospital
    if not doctors_cursor:
        doctors_cursor = list(db.doctors.find(hosp_query))

    if doctors_cursor:
        def doctor_rank_key(doc: Dict[str, Any]):
            status_val = (doc.get("status") or "AVAILABLE").upper()
            status_score = 0 if status_val == "AVAILABLE" else (1 if status_val == "BUSY" else 2)
            tier_val = (doc.get("tier") or "JUNIOR_DOCTOR").upper()
            # Emergency RED prefers Senior Consultant; Routine GREEN prefers Junior Resident / lowest load
            if priority_clean == "RED":
                tier_score = 0 if tier_val == "SENIOR_DOCTOR" else 1
            else:
                tier_score = 0
            queue_load = max(0, int(doc.get("active_queue_count") or 0))
            return (status_score, tier_score, queue_load, doc.get("doctor_id", ""))

        doctors_sorted = sorted(doctors_cursor, key=doctor_rank_key)
        assigned_doc = doctors_sorted[0]
        doc_id = str(assigned_doc["_id"])
        doc_name = assigned_doc.get("name", "Doctor On Duty")
        doc_tier = assigned_doc.get("tier", "JUNIOR_DOCTOR")
        room = assigned_doc.get("room_number", "Room 101 - OPD Consultation")
        doc_status = assigned_doc.get("status", "AVAILABLE")
        active_load = max(0, int(assigned_doc.get("active_queue_count") or 0))
        tier_label = "Senior Consultant" if doc_tier == "SENIOR_DOCTOR" else "Resident Medical Officer"
        rationale = (
            f"XAI Chamber Routing: Assigned to {doc_name} ({tier_label}, {room}) in {canonical_dept} "
            f"— Status: {doc_status}, lowest active chamber load ({active_load} in queue)"
            + (" with Senior Specialist priority for RED emergency triage." if priority_clean == "RED" else ".")
        )
        return doc_id, doc_name, doc_tier, room, rationale

    default_prefix = get_department_prefix(department)
    return (
        None,
        "OPD Medical Officer On Duty",
        "JUNIOR_DOCTOR",
        f"Room 101 - {default_prefix} Consultation Desk",
        f"Assigned to default {canonical_dept} duty chamber at facility {target_hid}."
    )


def issue_opd_token(
    patient_id: str,
    patient_name: str,
    chief_complaint: str,
    department: str,
    priority: str,
    patient_email: Optional[str] = None,
    consultation_id: Optional[str] = None,
    symptoms: Optional[list] = None,
    hospital_id: Optional[str] = "HOSP-BLR-001",
    hospital_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Creates a new sequential OPD token for the patient and department, scoped to hospital tenant.
    Calculates live queue_position, estimated_wait_minutes, and XAI assignment_rationale.
    """
    db = get_database()
    today_str = date.today().isoformat()
    now_iso = datetime.utcnow().isoformat() + "Z"
    target_hid = (hospital_id or "HOSP-BLR-001").strip()

    # Resolve hospital name
    if not hospital_name:
        h_doc = db.hospitals.find_one({"hospital_id": target_hid})
        target_hname = h_doc["name"] if h_doc else "Victoria Hospital (BMCRI Apex Medical Center)"
    else:
        target_hname = hospital_name

    prefix = get_department_prefix(department)
    raw_prio = str(priority or "GREEN").upper()
    if "RED" in raw_prio:
        priority_clean = "RED"
    elif "AMBER" in raw_prio or "YELLOW" in raw_prio:
        priority_clean = "AMBER"
    else:
        priority_clean = "GREEN"
    priority_rank = PRIORITY_RANK_MAP.get(priority_clean, 3)

    # Sequential daily number for the department within this hospital
    existing_today_count = db.opd_tokens.count_documents({
        "hospital_id": target_hid,
        "department_prefix": prefix,
        "date": today_str
    })
    sequence_number = 101 + existing_today_count
    token_number = f"{prefix}-{sequence_number}"

    # Match doctor and room based on department, priority, and hospital
    doc_id, doc_name, doc_tier, room, assignment_rationale = select_doctor_and_room(
        department, priority_clean, target_hid
    )

    # Live patients-ahead / queue position for this hospital & department
    ahead_probe = {
        "hospital_id": target_hid,
        "department": department,
        "status": "WAITING",
        "priority": priority_clean,
        "priority_rank": priority_rank,
        "created_at": now_iso,
    }
    patients_ahead, queue_position = compute_patients_ahead(db, ahead_probe)
    if priority_clean == "RED":
        estimated_wait_minutes = max(2, min(5, patients_ahead * 3))
    elif priority_clean == "AMBER":
        estimated_wait_minutes = max(5, patients_ahead * 5 + 5)
    else:
        estimated_wait_minutes = max(8, patients_ahead * 6 + 6)

    token_doc = {
        "token_number": token_number,
        "sequence_number": sequence_number,
        "department_prefix": prefix,
        "date": today_str,
        "hospital_id": target_hid,
        "hospital_name": target_hname,
        "patient_id": patient_id,
        "patient_name": patient_name,
        "patient_email": patient_email,
        "consultation_id": consultation_id,
        "chief_complaint": chief_complaint,
        "symptoms": symptoms or [],
        "department": department,
        "priority": priority_clean,
        "priority_rank": priority_rank,
        "assigned_doctor_id": doc_id,
        "assigned_doctor_name": doc_name,
        "assigned_doctor_tier": doc_tier,
        "assigned_room": room,
        "assignment_rationale": assignment_rationale,
        "status": "WAITING",
        "queue_position": queue_position,
        "patients_ahead": patients_ahead,
        "estimated_wait_minutes": estimated_wait_minutes,
        "created_at": now_iso,
        "called_at": None,
        "consultation_started_at": None,
        "completed_at": None,
        "actual_wait_minutes": None,
        "actual_consult_minutes": None,
        "notes": None
    }

    insert_result = db.opd_tokens.insert_one(token_doc)
    token_id = str(insert_result.inserted_id)
    token_doc["token_id"] = token_id
    token_doc.pop("_id", None)

    # If a doctor was assigned, increment their active queue count
    if doc_id:
        try:
            db.doctors.update_one(
                {"_id": ObjectId(doc_id)},
                {"$inc": {"active_queue_count": 1}}
            )
        except Exception:
            pass

    # Log telemetry event
    db.hospital_events.insert_one({
        "event_type": "OPD_TOKEN_ISSUED",
        "token_id": token_id,
        "token_number": token_number,
        "patient_id": patient_id,
        "department": department,
        "priority": priority_clean,
        "assigned_room": room,
        "timestamp": now_iso
    })

    return token_doc


def hospital_department_filter(hospital_id: Optional[str], department: str) -> Dict[str, Any]:
    """Match tokens for the same hospital tenant + clinical department."""
    hid = hospital_id or "HOSP-BLR-001"
    canonical = normalize_roster_department(department) or department or "General Medicine"
    if hid == "HOSP-BLR-001":
        hosp: Dict[str, Any] = {
            "$or": [
                {"hospital_id": "HOSP-BLR-001"},
                {"hospital_id": {"$exists": False}},
                {"hospital_id": None},
            ]
        }
    else:
        hosp = {"hospital_id": hid}
    return {
        "$and": [
            hosp,
            {"department": {"$regex": re.escape(canonical), "$options": "i"}},
        ]
    }


def compute_patients_ahead(db, token: Dict[str, Any]) -> Tuple[int, int]:
    """
    Live count of patients who will be seen before this token in the same
    hospital + department (priority order, then arrival time).

    Returns (patients_ahead, queue_position).
    """
    status = str(token.get("status") or "WAITING").upper()
    if status in ("CALLED", "IN_CONSULTATION"):
        return 0, 1
    if status != "WAITING":
        qp = int(token.get("queue_position") or 1)
        return max(0, qp - 1), qp

    hid = token.get("hospital_id") or "HOSP-BLR-001"
    dept = token.get("department") or "General Medicine"
    my_rank = int(
        token.get("priority_rank")
        or PRIORITY_RANK_MAP.get(str(token.get("priority", "GREEN")).upper(), 3)
    )
    my_created = str(token.get("created_at") or "")
    base = hospital_department_filter(hid, dept)

    self_ne: Dict[str, Any] = {}
    raw_id = token.get("_id") or token.get("token_id")
    if raw_id is not None:
        try:
            self_ne = {"_id": {"$ne": raw_id if isinstance(raw_id, ObjectId) else ObjectId(str(raw_id))}}
        except Exception:
            self_ne = {}

    chamber_q: Dict[str, Any] = {
        "$and": [base, {"status": {"$in": ["CALLED", "IN_CONSULTATION"]}}]
    }
    waiting_q: Dict[str, Any] = {
        "$and": [
            base,
            {"status": "WAITING"},
            {
                "$or": [
                    {"priority_rank": {"$lt": my_rank}},
                    {"priority_rank": my_rank, "created_at": {"$lt": my_created}},
                ]
            },
        ]
    }
    if self_ne:
        chamber_q["$and"].append(self_ne)
        waiting_q["$and"].append(self_ne)

    patients_ahead = db.opd_tokens.count_documents(chamber_q) + db.opd_tokens.count_documents(waiting_q)
    return patients_ahead, patients_ahead + 1


def get_next_waiting_token(db, hospital_id: Optional[str], department: str) -> Optional[Dict[str, Any]]:
    """Head of the WAITING line for this department (priority, then created_at)."""
    base = hospital_department_filter(hospital_id, department)
    return db.opd_tokens.find_one(
        {"$and": [base, {"status": "WAITING"}]},
        sort=[("priority_rank", 1), ("created_at", 1)],
    )


def assert_sequential_call_allowed(
    db,
    token: Dict[str, Any],
    *,
    allow_override: bool = False,
) -> None:
    """
    Doctors must call one-after-another: only the current head of WAITING,
    or recall a token already in CALLED. Raises ValueError on violation.

    allow_override=True is for admin/ops only (not the doctor desk).
    """
    if allow_override:
        return
    status = str(token.get("status") or "").upper()
    if status == "CALLED":
        return
    if status != "WAITING":
        raise ValueError(
            f"Only waiting patients can be called in order (this token is {status})."
        )

    nxt = get_next_waiting_token(db, token.get("hospital_id"), token.get("department") or "")
    if not nxt:
        raise ValueError("No waiting patients in this department queue.")

    if str(nxt.get("_id")) != str(token.get("_id")):
        raise ValueError(
            f"Call next in line only. Next is {nxt.get('token_number')}, "
            f"not {token.get('token_number')}."
        )
