from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime
from bson import ObjectId
from typing import List
from app.database import get_database
from app.models.consultation import ConsultationCreateRequest, ConsultationResponse
from app.models.checkin import PatientCheckInRequest, PatientCheckInStatus
from app.models.patient_assistant import PatientAssistantAskRequest, PatientAssistantAskResponse
from app.middleware.auth import get_current_user, require_roles
from app.routes.ws import broadcast_event
from app.services import checkin_service
from app.services.patient_assistant_service import answer_patient_question, llm_is_configured
from app import config as app_config

router = APIRouter(prefix="/api/patient", tags=["Patient Module"])


@router.get("/checkin/status", response_model=PatientCheckInStatus)
def get_my_checkin_status(
    hospital_id: str = Query(default="HOSP-BLR-001"),
    current_user: dict = Depends(get_current_user),
):
    """Whether Today's visit is unlocked for this patient at the given hospital."""
    if current_user.get("role") != "patient":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only patients use reception check-in status.",
        )
    data = checkin_service.get_patient_checkin_status(
        patient_id=current_user["id"],
        hospital_id=hospital_id or checkin_service.OPERATIONAL_HOSPITAL_ID,
    )
    return PatientCheckInStatus(**data)


@router.post("/checkin", response_model=PatientCheckInStatus)
def redeem_reception_checkin(
    request: PatientCheckInRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Patient enters the Victoria desk code. Unlocks Today's visit (form + voice)
    for a limited window so intake cannot be started from home.
    """
    if current_user.get("role") != "patient":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only patients can redeem a reception check-in code.",
        )
    try:
        data = checkin_service.redeem_checkin_code(
            patient_id=current_user["id"],
            patient_name=current_user.get("name", "Patient"),
            patient_email=current_user.get("email"),
            code=request.code,
            hospital_id=request.hospital_id or checkin_service.OPERATIONAL_HOSPITAL_ID,
        )
        broadcast_event("PATIENT_CHECKED_IN", {
            "patient_id": current_user["id"],
            "patient_name": current_user.get("name"),
            "hospital_id": data["hospital_id"],
            "checked_in_at": data["checked_in_at"],
        })
        return PatientCheckInStatus(**data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/consultation", response_model=ConsultationResponse, status_code=status.HTTP_201_CREATED)
def submit_consultation(
    request: ConsultationCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Submits a new patient consultation intake record.
    Requires an active Victoria reception check-in for the target hospital.
    """
    db = get_database()
    now = datetime.utcnow().isoformat()

    target_hid = getattr(request, "hospital_id", None) or "HOSP-BLR-001"
    target_hname = getattr(request, "hospital_name", None)
    if not target_hname:
        h_rec = db.hospitals.find_one({"hospital_id": target_hid})
        target_hname = h_rec["name"] if h_rec else "Victoria Hospital (BMCRI Apex Medical Center)"

    # Gate: only Victoria digital OPD, and only after reception check-in
    if target_hid != checkin_service.OPERATIONAL_HOSPITAL_ID:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Digital OPD consultation is only live at Victoria Hospital. Other nearby hospitals are map-only for now.",
        )
    try:
        checkin_service.assert_patient_checked_in(current_user["id"], target_hid)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    # Run Semantic Clinical Analysis grounded in Columbia/CDC knowledge base
    from app.services.semantic_nlp_service import perform_semantic_clinical_analysis
    from app.services.department_availability_service import check_department_availability
    semantic_result = perform_semantic_clinical_analysis(
        narrative=request.chief_complaint,
        reported_severity=request.severity
    )

    # Use confirmed active symptoms if not manually overridden
    confirmed_symptom_names = [s["canonical_name"] for s in semantic_result.get("confirmed_symptoms", [])]
    resolved_symptoms = request.symptoms if (request.symptoms and len(request.symptoms) > 0) else confirmed_symptom_names

    resolved_duration = request.duration.strip() if request.duration else semantic_result.get("duration")
    resolved_functional_diff = request.functional_difficulty.strip() if request.functional_difficulty else (
        semantic_result.get("functional_difficulties", [None])[0] if semantic_result.get("functional_difficulties") else None
    )

    dept_routed = semantic_result.get("recommended_department") or "General Medicine"
    priority_routed = semantic_result.get("triage_urgency") or "GREEN"
    availability = check_department_availability(
        hospital_id=target_hid,
        department=dept_routed,
        hospital_name=target_hname,
    )

    consultation_doc = {
        "patient_id": current_user["id"],
        "patient_name": current_user["name"],
        "patient_email": current_user["email"],
        "hospital_id": target_hid,
        "hospital_name": target_hname,
        "chief_complaint": request.chief_complaint.strip(),
        "symptoms": resolved_symptoms,
        "severity": request.severity,
        "duration": resolved_duration,
        "functional_difficulty": resolved_functional_diff,
        "additional_notes": request.additional_notes.strip() if request.additional_notes else None,
        "extracted_entities": semantic_result,
        "status": "submitted" if availability["can_issue_token"] else "referred_external",
        "department": dept_routed,
        "priority": priority_routed,
        "department_available": availability["available"],
        "availability_message": availability["message"],
        "recommended_hospitals": availability.get("recommended_hospitals") or [],
        "created_at": now,
        "updated_at": now
    }

    result = db.consultations.insert_one(consultation_doc)
    consultation_id = str(result.inserted_id)

    # Department missing on this hospital's roster → keep NLP result, do not issue token
    if not availability["can_issue_token"]:
        db.hospital_events.insert_one({
            "event_type": "CONSULTATION_REFERRED_EXTERNAL",
            "hospital_id": target_hid,
            "patient_id": current_user["id"],
            "consultation_id": consultation_id,
            "department": dept_routed,
            "canonical_department": availability.get("canonical_department"),
            "severity": request.severity,
            "timestamp": now
        })
        consultation_doc["id"] = consultation_id
        return ConsultationResponse(**consultation_doc)

    # Automatically issue OPD Token and route to doctor chamber
    from app.services.queue_service import issue_opd_token
    token_doc = issue_opd_token(
        patient_id=current_user["id"],
        patient_name=current_user["name"],
        patient_email=current_user.get("email"),
        consultation_id=consultation_id,
        chief_complaint=request.chief_complaint.strip(),
        symptoms=resolved_symptoms,
        department=dept_routed,
        priority=priority_routed,
        hospital_id=target_hid,
        hospital_name=target_hname
    )

    consultation_doc["token_number"] = token_doc["token_number"]
    consultation_doc["assigned_doctor_name"] = token_doc["assigned_doctor_name"]
    consultation_doc["assigned_room"] = token_doc["assigned_room"]
    consultation_doc["queue_position"] = token_doc["queue_position"]
    consultation_doc["estimated_wait_minutes"] = token_doc["estimated_wait_minutes"]
    consultation_doc["assignment_rationale"] = token_doc.get("assignment_rationale")
    consultation_doc["token"] = token_doc
    consultation_doc["status"] = "submitted"

    db.consultations.update_one(
        {"_id": result.inserted_id},
        {"$set": {
            "token_number": token_doc["token_number"],
            "assigned_doctor_name": token_doc["assigned_doctor_name"],
            "assigned_room": token_doc["assigned_room"],
            "queue_position": token_doc["queue_position"],
            "estimated_wait_minutes": token_doc["estimated_wait_minutes"],
            "assignment_rationale": token_doc.get("assignment_rationale"),
            "token_id": token_doc["token_id"]
        }}
    )

    db.hospital_events.insert_one({
        "event_type": "CONSULTATION_SUBMITTED",
        "hospital_id": target_hid,
        "patient_id": current_user["id"],
        "consultation_id": consultation_id,
        "token_number": token_doc["token_number"],
        "severity": request.severity,
        "timestamp": now
    })

    broadcast_event("TOKEN_ISSUED", {
        "token_id": token_doc["token_id"],
        "token_number": token_doc["token_number"],
        "hospital_id": target_hid,
        "hospital_name": target_hname,
        "patient_name": current_user.get("name", "Patient"),
        "patient_id": current_user["id"],
        "department": dept_routed,
        "assigned_doctor_name": token_doc["assigned_doctor_name"],
        "assigned_room": token_doc["assigned_room"],
        "assignment_rationale": token_doc.get("assignment_rationale"),
        "priority": priority_routed,
        "queue_position": token_doc["queue_position"],
        "estimated_wait_minutes": token_doc["estimated_wait_minutes"],
        "created_at": now
    })

    consultation_doc["id"] = consultation_id
    return ConsultationResponse(**consultation_doc)


def _enrich_consultation_for_patient(db, doc: dict) -> dict:
    """Ensure prescription_id / completed_at are present for patient history cards."""
    doc = dict(doc)
    doc["id"] = str(doc["_id"])
    if not doc.get("prescription_id"):
        rx = db.prescriptions.find_one(
            {"consultation_id": doc["id"]},
            {"prescription_id": 1, "issued_at": 1},
        )
        if rx:
            doc["prescription_id"] = rx.get("prescription_id")
            if not doc.get("completed_at"):
                doc["completed_at"] = rx.get("issued_at")
    # Drop nested ObjectId-heavy prescription blob from response model path
    doc.pop("prescription", None)
    doc.pop("_id", None)
    return doc


@router.get("/consultations/my", response_model=List[ConsultationResponse])
def get_my_consultations(current_user: dict = Depends(get_current_user)):
    """
    Returns all consultations belonging to the authenticated patient,
    ordered by creation date (newest first).
    """
    db = get_database()
    cursor = db.consultations.find({"patient_id": current_user["id"]}).sort("created_at", -1)

    consultations = []
    for doc in cursor:
        enriched = _enrich_consultation_for_patient(db, doc)
        consultations.append(ConsultationResponse(**enriched))

    return consultations


@router.get("/prescriptions/by-consultation/{consultation_id}")
def get_my_prescription_for_consultation(
    consultation_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Patient-owned digital prescription lookup (view / print / download)."""
    db = get_database()
    try:
        obj_id = ObjectId(consultation_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid consultation ID.")

    consult = db.consultations.find_one({"_id": obj_id})
    if not consult:
        raise HTTPException(status_code=404, detail="Consultation not found.")
    if current_user.get("role") == "patient" and consult.get("patient_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your consultation.")

    from app.routes.doctor_desk import _format_prescription_doc
    rx = db.prescriptions.find_one({"consultation_id": consultation_id.strip()})
    if not rx and consult.get("prescription_id"):
        rx = db.prescriptions.find_one({"prescription_id": consult["prescription_id"]})
    if not rx:
        return {"success": False, "prescription": None}
    return {"success": True, "prescription": _format_prescription_doc(rx)}


@router.get("/consultations/{consultation_id}", response_model=ConsultationResponse)
def get_consultation_by_id(
    consultation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Retrieves a specific consultation.
    Patients can only view their own consultations; doctors and admins can view any.
    """
    db = get_database()
    try:
        obj_id = ObjectId(consultation_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid consultation ID format.")

    doc = db.consultations.find_one({"_id": obj_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Consultation record not found.")

    # Authorization check
    if current_user["role"] == "patient" and doc["patient_id"] != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view another patient's consultation."
        )

    enriched = _enrich_consultation_for_patient(db, doc)
    return ConsultationResponse(**enriched)


@router.post("/assistant/ask", response_model=PatientAssistantAskResponse)
def ask_patient_visit_assistant(
    request: PatientAssistantAskRequest,
    current_user: dict = Depends(require_roles(["patient"])),
):
    """
    Rule-gated helper: answers only about this patient's Rx / dose / follow-up / visit.
    Supports multiple treatment records via prescription_id focus + short chat history.
    """
    db = get_database()
    history = [{"role": t.role, "text": t.text} for t in (request.history or [])[-6:]]
    result = answer_patient_question(
        db,
        current_user["id"],
        request.question,
        prescription_id=request.prescription_id,
        history=history,
    )
    return PatientAssistantAskResponse(**result)


@router.get("/assistant/status")
def patient_assistant_status(current_user: dict = Depends(require_roles(["patient"]))):
    """Whether the LLM key is configured (never returns the key)."""
    return {
        "success": True,
        "llm_configured": llm_is_configured(),
        "provider": app_config.PATIENT_LLM_PROVIDER,
        "scope": [
            "prescription_medicines",
            "dosage_timing",
            "missed_dose",
            "follow_up",
            "investigations_on_slip",
            "diet_advice_on_slip",
            "token_queue",
            "department_visit",
        ],
    }


@router.get("/metrics/summary")
def get_hospital_metrics():
    """
    Returns real-time hospital triage metrics for the hero telemetry bar.
    Dynamically queried from MongoDB.
    """
    db = get_database()
    try:
        total_intakes = db.consultations.count_documents({})
        emergency_cases = db.consultations.count_documents({"priority": {"$regex": "RED"}})
        urgent_cases = db.consultations.count_documents({"priority": {"$regex": "AMBER"}})
    except Exception:
        total_intakes = 0
        emergency_cases = 0
        urgent_cases = 0

    return {
        "total_consultations": total_intakes,
        "emergency_triage_count": emergency_cases,
        "urgent_cases_count": urgent_cases,
        "departments_active": 10,
        "symptoms_ontology_count": 24,
        "platform_status": "Operational"
    }

