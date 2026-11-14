from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime, date
from bson import ObjectId
from typing import List, Optional
from app.database import get_database
from app.models.queue import (
    TokenCreateRequest,
    TokenCallRequest,
    TokenCompleteRequest,
    OPDTokenResponse,
    QueueSummaryResponse,
    QueueAnalyticsResponse
)
from app.middleware.auth import get_current_user, require_roles
from app.routes.ws import broadcast_event
from app.services.queue_service import (
    issue_opd_token,
    PRIORITY_RANK_MAP,
    get_department_prefix,
    compute_patients_ahead,
    assert_sequential_call_allowed,
)

router = APIRouter(prefix="/api/queue", tags=["OPD Queue Engine"])


def _format_token_doc(doc: dict) -> OPDTokenResponse:
    """Helper to convert MongoDB doc into OPDTokenResponse."""
    doc_copy = dict(doc)
    if "_id" in doc_copy:
        doc_copy["token_id"] = str(doc_copy["_id"])
        del doc_copy["_id"]
    elif "token_id" not in doc_copy:
        doc_copy["token_id"] = str(doc_copy.get("id", ""))

    # Normalize priority to valid literal
    raw_p = str(doc_copy.get("priority", "GREEN")).upper()
    if "RED" in raw_p:
        doc_copy["priority"] = "RED"
    elif "AMBER" in raw_p or "YELLOW" in raw_p:
        doc_copy["priority"] = "AMBER"
    else:
        doc_copy["priority"] = "GREEN"

    # Normalize status to valid literal
    raw_st = str(doc_copy.get("status", "WAITING")).upper()
    if raw_st in ["WAITING", "CALLED", "IN_CONSULTATION", "COMPLETED", "SKIPPED", "CANCELLED"]:
        doc_copy["status"] = raw_st
    else:
        doc_copy["status"] = "WAITING"

    # Ensure ISO string has UTC designator so browsers convert to local time (e.g. IST +05:30)
    raw_created = str(doc_copy.get("created_at", ""))
    if raw_created and not raw_created.endswith("Z") and "+" not in raw_created:
        doc_copy["created_at"] = raw_created + "Z"

    return OPDTokenResponse(**doc_copy)


@router.post("/tokens", response_model=OPDTokenResponse, status_code=status.HTTP_201_CREATED)
def create_token(
    request: TokenCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Issues a new OPD token for a patient.
    Can be called directly or linked to an existing consultation intake.
    """
    token_doc = issue_opd_token(
        patient_id=request.patient_id or current_user["id"],
        patient_name=request.patient_name or current_user.get("name", "Registered Patient"),
        patient_email=request.patient_email or current_user.get("email"),
        consultation_id=request.consultation_id,
        chief_complaint=request.chief_complaint,
        symptoms=request.symptoms,
        department=request.department,
        priority=request.priority,
        hospital_id=request.hospital_id or "HOSP-BLR-001",
        hospital_name=request.hospital_name
    )
    return _format_token_doc(token_doc)


def _hospital_token_filter(hospital_id: Optional[str]) -> dict:
    """Builds a tenant filter for opd_tokens (defaults to HOSP-BLR-001)."""
    hid = (hospital_id or "HOSP-BLR-001").strip()
    if hid == "ALL":
        return {}
    if hid == "HOSP-BLR-001":
        return {"$or": [{"hospital_id": "HOSP-BLR-001"}, {"hospital_id": {"$exists": False}}, {"hospital_id": None}]}
    return {"hospital_id": hid}


@router.get("/analytics", response_model=QueueAnalyticsResponse)
def get_queue_analytics(
    timeframe: str = Query("today", description="today, date, month, or all"),
    target_date: Optional[str] = Query(None, description="Specific YYYY-MM-DD date"),
    target_month: Optional[str] = Query(None, description="Specific YYYY-MM month"),
    department: Optional[str] = Query(None, description="Department filter or ALL"),
    hospital_id: Optional[str] = Query("HOSP-BLR-001", description="Hospital tenant ID (default HOSP-BLR-001)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Returns hospital administrative analytics and monitoring ledger for patient tokens.
    Supports filtering by Today, Specific Date, Month, Department, and Hospital Tenant.
    """
    db = get_database()
    today_str = date.today().isoformat()
    current_month_str = today_str[:7]

    and_conditions = []
    h_filter = _hospital_token_filter(hospital_id)
    if h_filter:
        and_conditions.append(h_filter)

    effective_date = None
    effective_month = None

    if timeframe == "today":
        effective_date = today_str
        and_conditions.append({"date": today_str})
    elif timeframe == "date" and target_date:
        effective_date = target_date
        and_conditions.append({"date": target_date})
    elif timeframe == "month" and target_month:
        effective_month = target_month
        and_conditions.append({"date": {"$regex": f"^{target_month}"}})
    elif timeframe == "month" and not target_month:
        effective_month = current_month_str
        and_conditions.append({"date": {"$regex": f"^{current_month_str}"}})

    if department and department != "ALL":
        and_conditions.append({"department": {"$regex": department, "$options": "i"}})

    query = {"$and": and_conditions} if len(and_conditions) > 1 else (and_conditions[0] if and_conditions else {})

    # Sort tokens newest first for administrative monitoring ledger
    tokens_cursor = list(db.opd_tokens.find(query).sort("created_at", -1))
    total_tokens = len(tokens_cursor)

    dept_dist = {}
    severity_dist = {"RED": 0, "AMBER": 0, "GREEN": 0}
    status_dist = {}
    hourly_dist = {}

    formatted_tokens = []
    for doc in tokens_cursor:
        d = doc.get("department", "General Medicine")
        dept_dist[d] = dept_dist.get(d, 0) + 1

        p = (doc.get("priority") or "GREEN").upper()
        if p in severity_dist:
            severity_dist[p] += 1
        else:
            severity_dist[p] = 1

        st = doc.get("status", "WAITING")
        status_dist[st] = status_dist.get(st, 0) + 1

        created = doc.get("created_at", "")
        if len(created) >= 13:
            hour_str = f"{created[11:13]}:00"
            hourly_dist[hour_str] = hourly_dist.get(hour_str, 0) + 1

        formatted_tokens.append(_format_token_doc(doc))

    return QueueAnalyticsResponse(
        timeframe=timeframe,
        target_date=effective_date,
        target_month=effective_month,
        department_filter=department or "ALL",
        total_tokens=total_tokens,
        department_distribution=dept_dist,
        severity_distribution=severity_dist,
        status_distribution=status_dist,
        hourly_distribution=hourly_dist,
        tokens=formatted_tokens
    )


@router.get("/live", response_model=List[OPDTokenResponse])
def get_live_queue(
    hospital_id: Optional[str] = Query("HOSP-BLR-001", description="Hospital tenant ID (default HOSP-BLR-001)"),
    department: Optional[str] = Query(None, description="Filter by clinical department"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by token status (WAITING, CALLED, etc.)"),
    limit: int = Query(100, ge=1, le=500)
):
    """
    Returns live OPD queue tokens scoped to hospital_id, sorted by clinical priority (RED first, then AMBER, then GREEN)
    and then first-come-first-served creation timestamp.
    """
    db = get_database()
    and_conditions = []
    h_filter = _hospital_token_filter(hospital_id)
    if h_filter:
        and_conditions.append(h_filter)
    
    if department and department != "ALL":
        and_conditions.append({"department": {"$regex": department, "$options": "i"}})
        
    if status_filter and status_filter != "ALL":
        and_conditions.append({"status": status_filter})

    query = {"$and": and_conditions} if len(and_conditions) > 1 else (and_conditions[0] if and_conditions else {})

    # Sort priority: priority_rank ASC (1=RED, 2=AMBER, 3=GREEN), then created_at ASC
    cursor = db.opd_tokens.find(query).sort([
        ("priority_rank", 1),
        ("created_at", 1)
    ]).limit(limit)

    tokens = []
    for doc in cursor:
        tokens.append(_format_token_doc(doc))
    return tokens


@router.get("/patient/my-token", response_model=Optional[OPDTokenResponse])
def get_patient_active_token(current_user: dict = Depends(get_current_user)):
    """
    Returns the current active token for the authenticated patient.
    """
    db = get_database()
    # Check for active token
    active_token = db.opd_tokens.find_one({
        "patient_id": current_user["id"],
        "status": {"$in": ["WAITING", "CALLED", "IN_CONSULTATION"]}
    }, sort=[("created_at", -1)])

    if active_token:
        # Live patients-ahead + queue position (decrements as chamber progresses)
        ahead, pos = compute_patients_ahead(db, active_token)
        active_token["patients_ahead"] = ahead
        active_token["queue_position"] = pos
        if str(active_token.get("status", "")).upper() == "WAITING":
            pr = str(active_token.get("priority", "GREEN")).upper()
            if "RED" in pr:
                active_token["estimated_wait_minutes"] = max(2, min(5, ahead * 3))
            elif "AMBER" in pr:
                active_token["estimated_wait_minutes"] = max(5, ahead * 5 + 5)
            else:
                active_token["estimated_wait_minutes"] = max(8, ahead * 6 + 6)
        else:
            active_token["estimated_wait_minutes"] = 0
        return _format_token_doc(active_token)

    # COMPLETED / SKIPPED / CANCELLED must NOT block a new visit.
    # Past visits stay in /patient/consultations/my and records.
    skipped = db.opd_tokens.find_one({
        "patient_id": current_user["id"],
        "status": "SKIPPED",
    }, sort=[("created_at", -1)])
    if skipped:
        return _format_token_doc(skipped)

    return None


@router.get("/summary", response_model=QueueSummaryResponse)
def get_queue_summary(
    hospital_id: Optional[str] = Query("HOSP-BLR-001", description="Hospital tenant ID (default HOSP-BLR-001)")
):
    """
    Returns real-time OPD queue summary metrics for Hospital Administration scoped to hospital_id.
    """
    db = get_database()
    today_str = date.today().isoformat()
    h_filter = _hospital_token_filter(hospital_id)

    def _q(extra: dict) -> dict:
        if not h_filter:
            return extra
        if not extra:
            return h_filter
        return {"$and": [h_filter, extra]}
    
    total_today = db.opd_tokens.count_documents(_q({"date": today_str}))
    if total_today == 0:
        # Fall back to all tokens count if demo seeded earlier
        total_today = db.opd_tokens.count_documents(_q({}))

    waiting = db.opd_tokens.count_documents(_q({"status": "WAITING"}))
    called = db.opd_tokens.count_documents(_q({"status": "CALLED"}))
    in_consult = db.opd_tokens.count_documents(_q({"status": "IN_CONSULTATION"}))
    completed = db.opd_tokens.count_documents(_q({"status": "COMPLETED"}))
    skipped = db.opd_tokens.count_documents(_q({"status": "SKIPPED"}))

    red_count = db.opd_tokens.count_documents(_q({"priority": "RED", "status": {"$in": ["WAITING", "CALLED", "IN_CONSULTATION"]}}))
    amber_count = db.opd_tokens.count_documents(_q({"priority": "AMBER", "status": {"$in": ["WAITING", "CALLED", "IN_CONSULTATION"]}}))
    green_count = db.opd_tokens.count_documents(_q({"priority": "GREEN", "status": {"$in": ["WAITING", "CALLED", "IN_CONSULTATION"]}}))

    # Calculate average wait time from completed tokens
    completed_tokens = list(db.opd_tokens.find(_q({"actual_wait_minutes": {"$ne": None}})).limit(50))
    if completed_tokens:
        avg_wait = sum(t["actual_wait_minutes"] for t in completed_tokens) / len(completed_tokens)
    else:
        avg_wait = 12.5 # baseline default hospital average

    # Department breakdown
    pipeline = []
    if h_filter:
        pipeline.append({"$match": h_filter})
    pipeline.append({"$group": {"_id": "$department", "count": {"$sum": 1}}})
    dept_counts = {}
    try:
        for group in db.opd_tokens.aggregate(pipeline):
            dept_counts[group["_id"] or "General Medicine"] = group["count"]
    except Exception:
        dept_counts = {}

    return QueueSummaryResponse(
        total_tokens_today=total_today,
        waiting_count=waiting,
        called_count=called,
        in_consultation_count=in_consult,
        completed_count=completed,
        skipped_count=skipped,
        emergency_red_count=red_count,
        urgent_amber_count=amber_count,
        routine_green_count=green_count,
        avg_wait_minutes=round(avg_wait, 1),
        department_breakdown=dept_counts
    )


@router.post("/tokens/{token_id}/call", response_model=OPDTokenResponse)
def call_token(
    token_id: str,
    request: Optional[TokenCallRequest] = None,
    current_user: dict = Depends(require_roles(["doctor", "admin"]))
):
    """
    Doctor or Admin calls the token to enter the chamber (WAITING -> CALLED).
    """
    db = get_database()
    try:
        oid = ObjectId(token_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid token ID format.")

    doc = db.opd_tokens.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Token not found.")

    try:
        # Admin may override; doctors must stay sequential
        assert_sequential_call_allowed(
            db,
            doc,
            allow_override=str(current_user.get("role", "")).lower() == "admin",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    now_iso = datetime.utcnow().isoformat()
    update_data = {
        "status": "CALLED",
        "called_at": now_iso
    }
    if request and request.counter_or_room:
        update_data["assigned_room"] = request.counter_or_room

    db.opd_tokens.update_one({"_id": oid}, {"$set": update_data})
    
    # Telemetry
    db.hospital_events.insert_one({
        "event_type": "TOKEN_CALLED",
        "token_id": token_id,
        "token_number": doc.get("token_number"),
        "called_by": current_user.get("email"),
        "timestamp": now_iso
    })

    broadcast_event("TOKEN_CALLED", {
        "token_id": token_id,
        "token_number": doc.get("token_number"),
        "hospital_id": doc.get("hospital_id") or "HOSP-BLR-001",
        "hospital_name": doc.get("hospital_name") or "Victoria Hospital (BMCRI Apex Medical Center)",
        "patient_name": doc.get("patient_name"),
        "patient_id": doc.get("patient_id"),
        "doctor_name": current_user.get("name"),
        "room_number": update_data.get("assigned_room") or doc.get("assigned_room", "OPD Chamber"),
        "department": doc.get("department"),
        "called_at": now_iso
    })

    updated_doc = db.opd_tokens.find_one({"_id": oid})
    return _format_token_doc(updated_doc)


@router.post("/tokens/{token_id}/start", response_model=OPDTokenResponse)
def start_consultation(
    token_id: str,
    current_user: dict = Depends(require_roles(["doctor", "admin"]))
):
    """
    Patient enters the chamber and consultation begins (CALLED/WAITING -> IN_CONSULTATION).
    Calculates actual waiting duration ($T_2 - T_1$).
    """
    db = get_database()
    try:
        oid = ObjectId(token_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid token ID format.")

    doc = db.opd_tokens.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Token not found.")

    now_dt = datetime.utcnow()
    now_iso = now_dt.isoformat()

    # Calculate actual waiting minutes
    actual_wait_mins = 0.0
    try:
        created_dt = datetime.fromisoformat(doc["created_at"])
        actual_wait_mins = round((now_dt - created_dt).total_seconds() / 60.0, 1)
    except Exception:
        actual_wait_mins = 5.0

    update_data = {
        "status": "IN_CONSULTATION",
        "consultation_started_at": now_iso,
        "actual_wait_minutes": actual_wait_mins
    }

    db.opd_tokens.update_one({"_id": oid}, {"$set": update_data})

    # Update linked consultation if present
    if doc.get("consultation_id"):
        try:
            db.consultations.update_one(
                {"_id": ObjectId(doc["consultation_id"])},
                {"$set": {"status": "in_consultation"}}
            )
        except Exception:
            pass

    # Telemetry event
    db.hospital_events.insert_one({
        "event_type": "CONSULTATION_STARTED",
        "token_id": token_id,
        "token_number": doc.get("token_number"),
        "actual_wait_minutes": actual_wait_mins,
        "timestamp": now_iso
    })

    broadcast_event("CONSULTATION_STARTED", {
        "token_id": token_id,
        "token_number": doc.get("token_number"),
        "hospital_id": doc.get("hospital_id") or "HOSP-BLR-001",
        "patient_name": doc.get("patient_name"),
        "patient_id": doc.get("patient_id"),
        "doctor_name": current_user.get("name"),
        "started_at": now_iso
    })

    updated_doc = db.opd_tokens.find_one({"_id": oid})
    return _format_token_doc(updated_doc)


@router.post("/tokens/{token_id}/complete", response_model=OPDTokenResponse)
def complete_consultation(
    token_id: str,
    request: Optional[TokenCompleteRequest] = None,
    current_user: dict = Depends(require_roles(["doctor", "admin"]))
):
    """
    Doctor completes consultation (IN_CONSULTATION -> COMPLETED).
    Calculates actual consultation duration ($T_3 - T_2$) and frees doctor queue.
    """
    db = get_database()
    try:
        oid = ObjectId(token_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid token ID format.")

    doc = db.opd_tokens.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Token not found.")

    now_dt = datetime.utcnow()
    now_iso = now_dt.isoformat()

    # Calculate actual consult minutes
    actual_consult_mins = 0.0
    start_time_str = doc.get("consultation_started_at") or doc.get("created_at")
    try:
        start_dt = datetime.fromisoformat(start_time_str)
        actual_consult_mins = round((now_dt - start_dt).total_seconds() / 60.0, 1)
    except Exception:
        actual_consult_mins = 10.0

    update_data = {
        "status": "COMPLETED",
        "completed_at": now_iso,
        "actual_consult_minutes": actual_consult_mins
    }
    if request and request.doctor_notes:
        update_data["notes"] = request.doctor_notes

    db.opd_tokens.update_one({"_id": oid}, {"$set": update_data})

    # Decrement doctor active workload & increment total consultations
    if doc.get("assigned_doctor_id"):
        try:
            db.doctors.update_one(
                {"_id": ObjectId(doc["assigned_doctor_id"])},
                {
                    "$inc": {
                        "active_queue_count": -1,
                        "total_consultations_today": 1
                    }
                }
            )
        except Exception:
            pass

    # Update linked consultation
    if doc.get("consultation_id"):
        try:
            db.consultations.update_one(
                {"_id": ObjectId(doc["consultation_id"])},
                {"$set": {"status": "completed"}}
            )
        except Exception:
            pass

    # Telemetry event
    db.hospital_events.insert_one({
        "event_type": "CONSULTATION_COMPLETED",
        "token_id": token_id,
        "token_number": doc.get("token_number"),
        "actual_consult_minutes": actual_consult_mins,
        "timestamp": now_iso
    })

    broadcast_event("CONSULTATION_COMPLETED", {
        "token_id": token_id,
        "token_number": doc.get("token_number"),
        "hospital_id": doc.get("hospital_id") or "HOSP-BLR-001",
        "patient_name": doc.get("patient_name"),
        "patient_id": doc.get("patient_id"),
        "actual_consult_minutes": actual_consult_mins,
        "completed_at": now_iso
    })

    updated_doc = db.opd_tokens.find_one({"_id": oid})
    return _format_token_doc(updated_doc)


@router.post("/tokens/{token_id}/skip", response_model=OPDTokenResponse)
def skip_token(
    token_id: str,
    current_user: dict = Depends(require_roles(["doctor", "admin"]))
):
    """
    Marks patient as skipped / absent after multiple calls.
    """
    db = get_database()
    try:
        oid = ObjectId(token_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid token ID format.")

    doc = db.opd_tokens.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Token not found.")

    now_iso = datetime.utcnow().isoformat() + "Z"
    db.opd_tokens.update_one({"_id": oid}, {"$set": {"status": "SKIPPED", "skipped_at": now_iso}})

    if doc.get("assigned_doctor_id"):
        try:
            db.doctors.update_one(
                {"_id": ObjectId(doc["assigned_doctor_id"])},
                {"$inc": {"active_queue_count": -1}}
            )
        except Exception:
            pass

    broadcast_event("PATIENT_SKIPPED", {
        "token_id": token_id,
        "token_number": doc.get("token_number"),
        "hospital_id": doc.get("hospital_id") or "HOSP-BLR-001",
        "patient_name": doc.get("patient_name"),
        "patient_id": doc.get("patient_id"),
        "skipped_at": now_iso
    })

    updated_doc = db.opd_tokens.find_one({"_id": oid})
    return _format_token_doc(updated_doc)


@router.post("/tokens/{token_id}/rejoin", response_model=OPDTokenResponse)
def rejoin_queue(
    token_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Patient who was skipped within grace period re-activates their token back to WAITING.
    """
    db = get_database()
    try:
        oid = ObjectId(token_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid token ID format.")

    token = db.opd_tokens.find_one({"_id": oid})
    if not token:
        raise HTTPException(status_code=404, detail="Token not found.")

    now_iso = datetime.utcnow().isoformat() + "Z"
    db.opd_tokens.update_one(
        {"_id": oid},
        {"$set": {
            "status": "WAITING",
            "rejoined_at": now_iso
        }}
    )

    broadcast_event("TOKEN_REJOINED", {
        "token_id": token_id,
        "token_number": token.get("token_number"),
        "hospital_id": token.get("hospital_id") or "HOSP-BLR-001",
        "patient_name": token.get("patient_name"),
        "patient_id": token.get("patient_id"),
        "department": token.get("department")
    })

    updated_doc = db.opd_tokens.find_one({"_id": oid})
    return _format_token_doc(updated_doc)
