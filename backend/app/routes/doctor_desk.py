from fastapi import APIRouter, HTTPException, Depends, status, Query
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from bson import ObjectId
from app.database import get_database
from app.middleware.auth import get_current_user, require_roles
from app.models.prescription import (
    PrescriptionCreateRequest,
    PrescriptionResponse,
    MedicationItem
)
from app.routes.ws import broadcast_event

router = APIRouter(prefix="/api/doctor-desk", tags=["Doctor Clinical Desk & Digital Prescription"])


def _generate_prescription_id(db) -> str:
    """Generates unique sequential prescription number e.g. RX-2026-0001"""
    year = datetime.utcnow().year
    count = db.prescriptions.count_documents({}) + 1
    return f"RX-{year}-{count:04d}"


def _doctor_match_keys(doctor: Optional[dict], current_user: Optional[dict] = None) -> set:
    """Identity keys for a doctor (DOC_* id, Mongo _id, and normalized name)."""
    keys = set()
    if doctor:
        if doctor.get("doctor_id"):
            keys.add(str(doctor["doctor_id"]).strip())
        if doctor.get("_id") is not None:
            keys.add(str(doctor["_id"]).strip())
        if doctor.get("name"):
            keys.add(str(doctor["name"]).strip().lower())
        if doctor.get("email"):
            keys.add(str(doctor["email"]).strip().lower())
    if current_user:
        if current_user.get("doctor_id"):
            keys.add(str(current_user["doctor_id"]).strip())
        if current_user.get("name"):
            keys.add(str(current_user["name"]).strip().lower())
        if current_user.get("email"):
            keys.add(str(current_user["email"]).strip().lower())
    return {k for k in keys if k}


def _token_belongs_to_doctor(token: dict, match_keys: set) -> bool:
    """True if this OPD token / completion is owned by the logged-in doctor."""
    if not match_keys:
        return False
    aid = str(token.get("assigned_doctor_id") or "").strip()
    aname = str(token.get("assigned_doctor_name") or "").strip().lower()
    if aid and aid in match_keys:
        return True
    if aname and aname in match_keys:
        return True
    return False


def _enrich_prescription_hospital(db, doc: dict) -> dict:
    """Attach dynamic hospital letterhead fields from the visit's hospital tenant."""
    from app.services.hospital_service import OPERATIONAL_TENANT_HOSPITAL, get_hospital_by_id

    hid = doc.get("hospital_id") or "HOSP-BLR-001"
    hosp = get_hospital_by_id(hid, db) or OPERATIONAL_TENANT_HOSPITAL
    doc["hospital_id"] = hid
    doc["hospital_name"] = doc.get("hospital_name") or hosp.get("name") or OPERATIONAL_TENANT_HOSPITAL["name"]
    doc["hospital_address"] = doc.get("hospital_address") or hosp.get("address") or OPERATIONAL_TENANT_HOSPITAL["address"]
    doc["hospital_phone"] = doc.get("hospital_phone") or hosp.get("reception_phone") or hosp.get("emergency_phone")
    doc["hospital_locality"] = doc.get("hospital_locality") or hosp.get("locality")
    if not doc.get("digital_signature"):
        doc["digital_signature"] = (
            f"Digitally signed by {doc.get('doctor_name', 'Medical Officer')} "
            f"({doc.get('doctor_registration_no') or 'KMC'}) via Sushrutha Grid"
        )
    return doc


def _format_prescription_doc(doc: dict) -> PrescriptionResponse:
    """Formats MongoDB prescription document into Pydantic PrescriptionResponse."""
    d = dict(doc)
    if "_id" in d:
        del d["_id"]
    db = get_database()
    d = _enrich_prescription_hospital(db, d)
    return PrescriptionResponse(**d)


@router.get("/roster-quick-list")
def get_roster_quick_list(
    hospital_id: Optional[str] = Query("HOSP-BLR-001", description="Hospital tenant ID (default HOSP-BLR-001)")
):
    """
    Public lightweight roster list for Doctor Login & Quick Duty selector,
    scoped to the operational hospital tenant.
    """
    db = get_database()
    hid = (hospital_id or "HOSP-BLR-001").strip()
    if hid == "HOSP-BLR-001":
        hosp_q = {"$or": [{"hospital_id": "HOSP-BLR-001"}, {"hospital_id": {"$exists": False}}, {"hospital_id": None}]}
    else:
        hosp_q = {"hospital_id": hid}

    doctors = list(db.doctors.find(
        {"$and": [hosp_q, {"status": {"$in": ["AVAILABLE", "BUSY", "ON_BREAK", "OFFLINE"]}}]},
        {"_id": 0, "name": 1, "doctor_id": 1, "email": 1, "department": 1, "room_number": 1, "designation": 1, "tier": 1, "status": 1, "hospital_id": 1, "hospital_name": 1}
    ).sort([("department", 1), ("name", 1)]))

    # If no doctors found, provide fallback standard roster
    if not doctors:
        return {"success": True, "hospital_id": hid, "doctors": []}

    return {"success": True, "hospital_id": hid, "doctors": doctors}


@router.get("/me")
def get_doctor_my_profile(current_user: dict = Depends(require_roles(["doctor", "admin"]))):
    """
    Retrieves the clinical profile and current chamber queue stats for the logged-in doctor,
    strictly scoped to the doctor's hospital tenant.
    """
    db = get_database()
    email_clean = current_user.get("email", "").lower().strip()
    
    # Try finding matching doctor profile
    # Keep Mongo _id — OPD tokens often store assigned_doctor_id as ObjectId string
    doctor = db.doctors.find_one({"email": {"$regex": f"^{email_clean}$", "$options": "i"}})
    if not doctor:
        # Fallback profile from user record
        doctor = {
            "doctor_id": current_user.get("doctor_id", "DOC-DUTY-001"),
            "name": current_user.get("name", "Medical Officer On Duty"),
            "email": current_user.get("email"),
            "department": current_user.get("department", "General Medicine"),
            "room_number": current_user.get("room_number", "Chamber 101"),
            "designation": current_user.get("designation", "Duty Medical Officer"),
            "qualification": "MBBS",
            "tier": "SENIOR_DOCTOR",
            "status": "AVAILABLE",
            "hospital_id": current_user.get("hospital_id", "HOSP-BLR-001"),
            "hospital_name": current_user.get("hospital_name", "Victoria Hospital (BMCRI Apex Medical Center)")
        }
    else:
        doctor = dict(doctor)
        doctor["_id"] = str(doctor["_id"])
        if not doctor.get("hospital_id"):
            doctor["hospital_id"] = "HOSP-BLR-001"
        if not doctor.get("hospital_name"):
            doctor["hospital_name"] = "Victoria Hospital (BMCRI Apex Medical Center)"

    dept = doctor.get("department", "General Medicine")
    doc_hid = doctor.get("hospital_id", "HOSP-BLR-001")
    today_str = date.today().isoformat()
    match_keys = _doctor_match_keys(doctor, current_user)

    if doc_hid == "HOSP-BLR-001":
        hosp_filter = {"$or": [{"hospital_id": "HOSP-BLR-001"}, {"hospital_id": {"$exists": False}}, {"hospital_id": None}]}
    else:
        hosp_filter = {"hospital_id": doc_hid}

    # Waiting / in-consult: department chamber pool (shared OPD board)
    waiting_count = db.opd_tokens.count_documents({
        "$and": [
            hosp_filter,
            {"department": {"$regex": dept, "$options": "i"}},
            {"status": "WAITING"}
        ]
    })
    in_consult_count = db.opd_tokens.count_documents({
        "$and": [
            hosp_filter,
            {"department": {"$regex": dept, "$options": "i"}},
            {"status": {"$in": ["CALLED", "IN_CONSULTATION"]}}
        ]
    })
    # Done today: ONLY this doctor's completions (not whole department)
    completed_today_docs = list(db.opd_tokens.find({
        "$and": [
            hosp_filter,
            {"department": {"$regex": dept, "$options": "i"}},
            {"status": "COMPLETED"},
            {"date": today_str}
        ]
    }, {"assigned_doctor_id": 1, "assigned_doctor_name": 1}))
    completed_today_count = sum(1 for t in completed_today_docs if _token_belongs_to_doctor(t, match_keys))

    return {
        "success": True,
        "doctor": doctor,
        "metrics": {
            "waiting": waiting_count,
            "in_consultation": in_consult_count,
            "completed_today": completed_today_count
        }
    }


@router.get("/queue")
def get_doctor_chamber_queue(
    current_user: dict = Depends(require_roles(["doctor", "admin"])),
    department_override: Optional[str] = Query(None),
    hospital_id: Optional[str] = Query(None)
):
    """
    Retrieves live patient tokens for the doctor's active clinical department, chamber, and hospital tenant.
    Includes patient clinical intake findings and triage severity for clinical decision support.
    """
    db = get_database()
    email_clean = current_user.get("email", "").lower().strip()
    doctor = db.doctors.find_one({"email": {"$regex": f"^{email_clean}$", "$options": "i"}})
    
    dept = department_override or (doctor.get("department") if doctor else current_user.get("department", "General Medicine"))
    doc_hid = hospital_id or (doctor.get("hospital_id") if doctor else current_user.get("hospital_id")) or "HOSP-BLR-001"

    if doc_hid == "HOSP-BLR-001":
        hosp_filter: Dict[str, Any] = {"$or": [{"hospital_id": "HOSP-BLR-001"}, {"hospital_id": {"$exists": False}}, {"hospital_id": None}]}
    else:
        hosp_filter = {"hospital_id": doc_hid}

    # Match tokens for this department and hospital
    query: Dict[str, Any] = {
        "$and": [
            hosp_filter,
            {"department": {"$regex": dept, "$options": "i"}}
        ]
    }

    match_keys = _doctor_match_keys(doctor, current_user)

    # Fetch tokens
    raw_tokens = list(db.opd_tokens.find(query).sort("created_at", -1))
    
    # If no tokens for today, fallback to all recent tokens for this department so test tokens show
    tokens_enriched = []
    for t in raw_tokens:
        t_copy = dict(t)
        t_id = str(t_copy["_id"])
        t_copy["token_id"] = t_id
        del t_copy["_id"]

        # Ensure created_at has UTC Z
        cat = str(t_copy.get("created_at", ""))
        if cat and not cat.endswith("Z") and "+" not in cat:
            t_copy["created_at"] = cat + "Z"

        # Attach linked consultation details if available
        cid = t_copy.get("consultation_id")
        if cid:
            try:
                consult_doc = db.consultations.find_one({"_id": ObjectId(cid)})
                if consult_doc:
                    t_copy["chief_complaint"] = consult_doc.get("chief_complaint", t_copy.get("chief_complaint"))
                    t_copy["extracted_entities"] = consult_doc.get("extracted_entities")
                    t_copy["symptom_duration"] = consult_doc.get("duration")
                    t_copy["functional_difficulty"] = consult_doc.get("functional_difficulty")
                    t_copy["additional_notes"] = consult_doc.get("additional_notes")
                    t_copy["patient_id"] = consult_doc.get("patient_id")
                    if consult_doc.get("prescription_id") and not t_copy.get("prescription_id"):
                        t_copy["prescription_id"] = consult_doc.get("prescription_id")
                    if consult_doc.get("completed_at") and not t_copy.get("completed_at"):
                        t_copy["completed_at"] = consult_doc.get("completed_at")
                    if consult_doc.get("clinical_diagnosis"):
                        t_copy["clinical_diagnosis"] = consult_doc.get("clinical_diagnosis")
            except Exception:
                pass
        # Fallback completed_at from linked prescription when token only has COMPLETED status
        if str(t_copy.get("status", "")).upper() == "COMPLETED" and not t_copy.get("completed_at"):
            rx_q = {"consultation_id": cid} if cid else None
            if not rx_q and t_copy.get("prescription_id"):
                rx_q = {"prescription_id": t_copy["prescription_id"]}
            if rx_q:
                rx_doc = db.prescriptions.find_one(rx_q, {"issued_at": 1, "prescription_id": 1})
                if rx_doc:
                    t_copy["completed_at"] = rx_doc.get("issued_at")
                    if not t_copy.get("prescription_id"):
                        t_copy["prescription_id"] = rx_doc.get("prescription_id")

        # Also fetch patient phone/email or UHID if available
        pid = t_copy.get("patient_id")
        if pid:
            try:
                p_user = db.users.find_one({"_id": ObjectId(pid)})
                if p_user:
                    t_copy["patient_phone"] = p_user.get("phone")
                    t_copy["patient_uhid"] = p_user.get("uhid")
            except Exception:
                pass

        # COMPLETED history is doctor-specific (do not show other consultants' finishes)
        status_u = str(t_copy.get("status") or "").upper()
        if status_u == "COMPLETED" and not _token_belongs_to_doctor(t_copy, match_keys):
            continue

        tokens_enriched.append(t_copy)

    # Sort priorities:
    # 1. IN_CONSULTATION first
    # 2. CALLED second
    # 3. WAITING (RED first, AMBER second, GREEN third)
    # 4. COMPLETED / SKIPPED
    def sort_key(t):
        st = t.get("status", "WAITING")
        prio = t.get("priority", "GREEN")
        
        status_rank = 3
        if st == "IN_CONSULTATION":
            status_rank = 0
        elif st == "CALLED":
            status_rank = 1
        elif st == "WAITING":
            status_rank = 2
        else:
            status_rank = 4

        prio_rank = 2
        if "RED" in prio:
            prio_rank = 0
        elif "AMBER" in prio or "YELLOW" in prio:
            prio_rank = 1

        return (status_rank, prio_rank, t.get("created_at", ""))

    tokens_sorted = sorted(tokens_enriched, key=sort_key)

    from app.services.queue_service import get_next_waiting_token
    next_waiting = get_next_waiting_token(db, doc_hid, dept)
    next_waiting_id = str(next_waiting["_id"]) if next_waiting else None
    for t in tokens_sorted:
        tid = str(t.get("token_id") or "")
        st = str(t.get("status") or "").upper()
        t["is_next_callable"] = (st == "WAITING" and tid == next_waiting_id) or st == "CALLED"

    return {
        "success": True,
        "hospital_id": doc_hid,
        "hospital_name": (doctor.get("hospital_name") if doctor else None) or "Victoria Hospital (BMCRI Apex Medical Center)",
        "department": dept,
        "doctor_name": doctor.get("name") if doctor else current_user.get("name"),
        "room_number": doctor.get("room_number") if doctor else current_user.get("room_number", "Chamber 101"),
        "next_callable_token_id": next_waiting_id,
        "total_count": len(tokens_sorted),
        "tokens": tokens_sorted
    }


@router.post("/call/{token_id}")
def call_patient_to_chamber(
    token_id: str,
    current_user: dict = Depends(require_roles(["doctor", "admin"]))
):
    """
    Calls patient from waiting area into doctor's examination room (status: CALLED).
    """
    db = get_database()
    try:
        oid = ObjectId(token_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid token ID format.")

    token = db.opd_tokens.find_one({"_id": oid})
    if not token:
        raise HTTPException(status_code=404, detail="Token record not found.")

    from app.services.queue_service import assert_sequential_call_allowed
    try:
        assert_sequential_call_allowed(db, token)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    now_iso = datetime.utcnow().isoformat() + "Z"
    tok_hid = token.get("hospital_id") or "HOSP-BLR-001"
    tok_hname = token.get("hospital_name") or "Victoria Hospital (BMCRI Apex Medical Center)"
    
    # Update token
    db.opd_tokens.update_one(
        {"_id": oid},
        {"$set": {
            "status": "CALLED",
            "called_at": now_iso,
            "assigned_doctor_name": current_user.get("name"),
            "assigned_room": current_user.get("room_number", token.get("assigned_room", "OPD Chamber"))
        }}
    )

    # Log workflow event
    db.hospital_events.insert_one({
        "event_type": "DOCTOR_CALLED_PATIENT",
        "hospital_id": tok_hid,
        "token_number": token.get("token_number"),
        "doctor_email": current_user.get("email"),
        "doctor_name": current_user.get("name"),
        "room": current_user.get("room_number"),
        "timestamp": now_iso
    })

    # Broadcast live event to all connected portals (Patient, Doctor, Lobby TV)
    broadcast_event("TOKEN_CALLED", {
        "token_id": token_id,
        "token_number": token.get("token_number"),
        "hospital_id": tok_hid,
        "hospital_name": tok_hname,
        "patient_name": token.get("patient_name"),
        "patient_id": token.get("patient_id"),
        "doctor_name": current_user.get("name"),
        "department": token.get("department"),
        "room_number": current_user.get("room_number", token.get("assigned_room", "OPD Chamber")),
        "called_at": now_iso
    })

    return {
        "success": True,
        "message": f"Token {token.get('token_number')} called to chamber.",
        "status": "CALLED",
        "called_at": now_iso
    }


@router.post("/start/{token_id}")
def start_patient_consultation(
    token_id: str,
    current_user: dict = Depends(require_roles(["doctor", "admin"]))
):
    """
    Patient enters doctor chamber and clinical examination begins (status: IN_CONSULTATION).
    """
    db = get_database()
    try:
        oid = ObjectId(token_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid token ID format.")

    token = db.opd_tokens.find_one({"_id": oid})
    if not token:
        raise HTTPException(status_code=404, detail="Token record not found.")

    now_iso = datetime.utcnow().isoformat() + "Z"
    tok_hid = token.get("hospital_id") or "HOSP-BLR-001"

    db.opd_tokens.update_one(
        {"_id": oid},
        {"$set": {
            "status": "IN_CONSULTATION",
            "consultation_started_at": now_iso,
            "assigned_doctor_name": current_user.get("name")
        }}
    )

    # Mark doctor BUSY with current_patient_id
    email_clean = (current_user.get("email") or "").lower().strip()
    if email_clean:
        db.doctors.update_one(
            {"email": {"$regex": f"^{email_clean}$", "$options": "i"}},
            {"$set": {"status": "BUSY", "current_patient_id": token.get("patient_id")}}
        )

    # Update consultation status if linked
    cid = token.get("consultation_id")
    if cid:
        try:
            db.consultations.update_one(
                {"_id": ObjectId(cid)},
                {"$set": {
                    "status": "in_consultation",
                    "assigned_doctor_name": current_user.get("name"),
                    "consultation_started_at": now_iso
                }}
            )
        except Exception:
            pass

    # Broadcast live consultation start
    broadcast_event("CONSULTATION_STARTED", {
        "token_id": token_id,
        "token_number": token.get("token_number"),
        "hospital_id": tok_hid,
        "patient_name": token.get("patient_name"),
        "patient_id": token.get("patient_id"),
        "doctor_name": current_user.get("name"),
        "room_number": current_user.get("room_number", token.get("assigned_room")),
        "department": token.get("department"),
        "started_at": now_iso
    })

    return {
        "success": True,
        "message": f"Consultation started for Token {token.get('token_number')}.",
        "status": "IN_CONSULTATION",
        "started_at": now_iso
    }


@router.post("/skip/{token_id}")
def skip_patient_in_chamber(
    token_id: str,
    current_user: dict = Depends(require_roles(["doctor", "admin"]))
):
    """
    Doctor marks patient as SKIPPED / absent after calling (with 15-min grace window).
    Broadcasts PATIENT_SKIPPED so the patient's portal shows a re-join prompt.
    """
    db = get_database()
    try:
        oid = ObjectId(token_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid token ID format.")

    token = db.opd_tokens.find_one({"_id": oid})
    if not token:
        raise HTTPException(status_code=404, detail="Token record not found.")

    now_iso = datetime.utcnow().isoformat() + "Z"

    db.opd_tokens.update_one(
        {"_id": oid},
        {"$set": {
            "status": "SKIPPED",
            "skipped_at": now_iso,
            "skip_reason": "Patient not present in chamber (15-min grace window active)"
        }}
    )

    # Decrement active queue count for doctor
    email_clean = current_user.get("email", "").lower().strip()
    db.doctors.update_one(
        {"email": {"$regex": f"^{email_clean}$", "$options": "i"}},
        {"$inc": {"active_queue_count": -1}}
    )

    # Log workflow event
    db.hospital_events.insert_one({
        "event_type": "DOCTOR_SKIPPED_PATIENT",
        "token_number": token.get("token_number"),
        "doctor_email": current_user.get("email"),
        "timestamp": now_iso
    })

    # Broadcast event
    broadcast_event("PATIENT_SKIPPED", {
        "token_id": token_id,
        "token_number": token.get("token_number"),
        "hospital_id": token.get("hospital_id") or "HOSP-BLR-001",
        "patient_name": token.get("patient_name"),
        "patient_id": token.get("patient_id"),
        "skipped_at": now_iso
    })

    return {
        "success": True,
        "message": f"Token {token.get('token_number')} marked as SKIPPED (Grace period active).",
        "status": "SKIPPED",
        "skipped_at": now_iso
    }



@router.post("/prescribe", response_model=PrescriptionResponse, status_code=status.HTTP_201_CREATED)
def issue_digital_prescription(
    request: PrescriptionCreateRequest,
    current_user: dict = Depends(require_roles(["doctor", "admin"]))
):
    """
    Issues official digital prescription (Rx) with structured medications, clinical diagnosis,
    ordered lab tests, dietary advice, and follow-up scheduling.
    Completes the consultation and marks the OPD token as COMPLETED.
    """
    db = get_database()
    now_iso = datetime.utcnow().isoformat() + "Z"

    # Fetch doctor details
    email_clean = current_user.get("email", "").lower().strip()
    doc_profile = db.doctors.find_one({"email": {"$regex": f"^{email_clean}$", "$options": "i"}})
    
    doctor_id = doc_profile.get("doctor_id") if doc_profile else current_user.get("doctor_id", "DOC-001")
    doctor_name = doc_profile.get("name") if doc_profile else current_user.get("name", "Medical Officer")
    doctor_qualification = doc_profile.get("qualification") if doc_profile else "MBBS, MD"
    doctor_reg_no = doc_profile.get("registration_number", "KMC-2024-88910")
    department = doc_profile.get("department") if doc_profile else current_user.get("department", "General Medicine")
    room_number = doc_profile.get("room_number") if doc_profile else current_user.get("room_number", "Room 101")

    # Generate sequential prescription ID
    rx_id = _generate_prescription_id(db)

    # Convert medications to clean dicts
    meds_clean = [m.model_dump() for m in request.medications]

    prescription_doc = {
        "prescription_id": rx_id,
        "consultation_id": request.consultation_id,
        "token_number": None,
        "doctor_id": doctor_id,
        "doctor_name": doctor_name,
        "doctor_qualification": doctor_qualification,
        "doctor_registration_no": doctor_reg_no,
        "department": department,
        "room_number": room_number,
        "patient_id": request.patient_id,
        "patient_name": request.patient_name,
        "patient_uhid": request.patient_uhid,
        "clinical_diagnosis": request.clinical_diagnosis.strip(),
        "icd10_code": request.icd10_code.strip() if request.icd10_code else None,
        "clinical_notes": request.clinical_notes.strip() if request.clinical_notes else None,
        "medications": meds_clean,
        "investigations_advised": request.investigations_advised or [],
        "diet_lifestyle_advice": request.diet_lifestyle_advice.strip() if request.diet_lifestyle_advice else None,
        "follow_up_date": request.follow_up_date.strip() if request.follow_up_date else None,
        "follow_up_on": request.follow_up_on.strip() if getattr(request, "follow_up_on", None) else None,
        "status": "ISSUED",
        "issued_at": now_iso
    }

    # Fetch token number if token_id is provided or from consultation
    token_doc = None
    if request.token_id:
        try:
            token_doc = db.opd_tokens.find_one({"_id": ObjectId(request.token_id)})
        except Exception:
            pass
    elif request.consultation_id:
        try:
            token_doc = db.opd_tokens.find_one({"consultation_id": request.consultation_id})
        except Exception:
            pass

    if token_doc:
        prescription_doc["token_number"] = token_doc.get("token_number")

    tok_hid = (token_doc.get("hospital_id") if token_doc else None) or (doc_profile.get("hospital_id") if doc_profile else None) or "HOSP-BLR-001"
    tok_hname = (token_doc.get("hospital_name") if token_doc else None) or (doc_profile.get("hospital_name") if doc_profile else None)
    prescription_doc["hospital_id"] = tok_hid
    prescription_doc["hospital_name"] = tok_hname
    prescription_doc["digital_signature"] = (
        f"Digitally signed by {doctor_name} ({doctor_reg_no}) via Sushrutha Grid"
    )
    prescription_doc = _enrich_prescription_hospital(db, prescription_doc)

    # Insert into prescriptions collection
    db.prescriptions.insert_one(prescription_doc)

    # Mark linked consultation completed — stamp consulting doctor for reviews lock
    try:
        db.consultations.update_one(
            {"_id": ObjectId(request.consultation_id)},
            {"$set": {
                "status": "completed",
                "prescription_id": rx_id,
                "clinical_diagnosis": request.clinical_diagnosis,
                "doctor_notes": request.clinical_notes,
                "completed_at": now_iso,
                "prescription": prescription_doc,
                "assigned_doctor_id": doctor_id,
                "assigned_doctor_name": doctor_name,
            }}
        )
    except Exception:
        pass

    # Mark OPD token completed — ownership = prescribing doctor (not another dept colleague)
    if token_doc:
        db.opd_tokens.update_one(
            {"_id": token_doc["_id"]},
            {"$set": {
                "status": "COMPLETED",
                "completed_at": now_iso,
                "prescription_id": rx_id,
                "assigned_doctor_id": doctor_id,
                "assigned_doctor_name": doctor_name,
            }}
        )

    # Increment doctor consultation count and restore AVAILABLE status
    if doc_profile:
        new_q_count = max(0, int(doc_profile.get("active_queue_count") or 1) - 1)
        db.doctors.update_one(
            {"_id": doc_profile["_id"]},
            {
                "$inc": {"total_consultations_today": 1},
                "$set": {
                    "status": "AVAILABLE",
                    "current_patient_id": None,
                    "active_queue_count": new_q_count
                }
            }
        )

    # Log workflow event
    db.hospital_events.insert_one({
        "event_type": "DIGITAL_PRESCRIPTION_ISSUED",
        "hospital_id": tok_hid,
        "prescription_id": rx_id,
        "consultation_id": request.consultation_id,
        "doctor_name": doctor_name,
        "patient_name": request.patient_name,
        "department": department,
        "timestamp": now_iso
    })

    # Schedule next appointment + day-before / day-of in-app reminders
    follow_up_appt = None
    try:
        from app.services.followup_service import create_follow_up_from_prescription
        follow_up_appt = create_follow_up_from_prescription(
            db,
            prescription_doc,
            follow_up_on=prescription_doc.get("follow_up_on"),
        )
        if follow_up_appt:
            prescription_doc["follow_up_on"] = follow_up_appt.get("follow_up_on")
            db.prescriptions.update_one(
                {"prescription_id": rx_id},
                {"$set": {"follow_up_on": follow_up_appt.get("follow_up_on")}},
            )
    except Exception as exc:
        print(f"Follow-up schedule skipped: {exc}")

    # Broadcast live prescription issuance event to patient portal and pharmacy
    broadcast_event("PRESCRIPTION_ISSUED", {
        "prescription_id": rx_id,
        "consultation_id": request.consultation_id,
        "token_id": request.token_id,
        "token_number": prescription_doc.get("token_number"),
        "hospital_id": tok_hid,
        "patient_id": request.patient_id,
        "patient_name": request.patient_name,
        "patient_uhid": request.patient_uhid,
        "doctor_name": doctor_name,
        "doctor_qualification": doctor_qualification,
        "department": department,
        "room_number": room_number,
        "clinical_diagnosis": request.clinical_diagnosis,
        "medications_count": len(meds_clean),
        "issued_at": now_iso,
        "follow_up_on": (follow_up_appt or {}).get("follow_up_on") or prescription_doc.get("follow_up_on"),
    })

    return _format_prescription_doc(prescription_doc)


@router.get("/prescriptions/{prescription_id}", response_model=PrescriptionResponse)
def get_prescription_by_id(prescription_id: str):
    """
    Retrieves full digital prescription details by prescription ID.
    """
    db = get_database()
    doc = db.prescriptions.find_one({"prescription_id": prescription_id.strip()})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prescription with ID '{prescription_id}' not found."
        )
    return _format_prescription_doc(doc)


@router.get("/prescriptions/by-consultation/{consultation_id}")
def get_prescription_by_consultation(consultation_id: str):
    """
    Retrieves prescription issued for a given consultation ID (used by patient portal).
    """
    db = get_database()
    doc = db.prescriptions.find_one({"consultation_id": consultation_id.strip()})
    if not doc:
        return {"success": False, "prescription": None}
    return {"success": True, "prescription": _format_prescription_doc(doc)}


@router.get("/patient-history/{patient_id}")
def get_patient_clinical_history(
    patient_id: str,
    current_user: dict = Depends(require_roles(["doctor", "admin"]))
):
    """
    Retrieves previous clinical consultations and prescriptions for the patient
    so the consulting doctor has full longitudinal patient context.
    """
    db = get_database()
    consultations = list(db.consultations.find({"patient_id": patient_id}).sort("created_at", -1).limit(10))
    for c in consultations:
        c["id"] = str(c["_id"])
        del c["_id"]
        if not c.get("prescription_id") or not c.get("completed_at"):
            rx = db.prescriptions.find_one(
                {"consultation_id": c["id"]},
                {"prescription_id": 1, "issued_at": 1, "clinical_diagnosis": 1},
            )
            if rx:
                c.setdefault("prescription_id", rx.get("prescription_id"))
                if not c.get("completed_at"):
                    c["completed_at"] = rx.get("issued_at")
                if not c.get("clinical_diagnosis") and rx.get("clinical_diagnosis"):
                    c["clinical_diagnosis"] = rx.get("clinical_diagnosis")

    prescriptions = list(db.prescriptions.find({"patient_id": patient_id}).sort("issued_at", -1).limit(10))
    for p in prescriptions:
        if "_id" in p:
            del p["_id"]

    return {
        "success": True,
        "patient_id": patient_id,
        "total_past_consultations": len(consultations),
        "consultations": consultations,
        "prescriptions": prescriptions
    }
