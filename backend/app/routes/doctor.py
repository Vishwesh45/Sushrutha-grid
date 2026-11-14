from fastapi import APIRouter, HTTPException, Query, status
from typing import Optional, List
from datetime import datetime
from app.database import get_database
from app.models.doctor import (
    DoctorCreateRequest, 
    DoctorUpdateRequest, 
    DoctorStatusUpdateRequest
)
from app.routes.ws import broadcast_event

router = APIRouter(prefix="/api/doctors", tags=["Doctor Profiles & Roster Management"])

def _hospital_filter(hospital_id: Optional[str]) -> dict:
    """Builds a tenant filter for hospital_id (defaults to HOSP-BLR-001)."""
    hid = (hospital_id or "HOSP-BLR-001").strip()
    if hid == "ALL":
        return {}
    if hid == "HOSP-BLR-001":
        return {"$or": [{"hospital_id": "HOSP-BLR-001"}, {"hospital_id": {"$exists": False}}, {"hospital_id": None}]}
    return {"hospital_id": hid}

@router.get("/")
def get_all_doctors(
    hospital_id: Optional[str] = Query("HOSP-BLR-001", description="Hospital tenant ID (default HOSP-BLR-001)"),
    department: Optional[str] = Query(None, description="Filter by clinical department"),
    tier: Optional[str] = Query(None, description="Filter by tier: JUNIOR_DOCTOR or SENIOR_DOCTOR"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status: AVAILABLE, BUSY, ON_BREAK, OFFLINE"),
    employment_type: Optional[str] = Query(None, description="Filter by PERMANENT or CONTRACT_TEMPORARY"),
    search: Optional[str] = Query(None, description="Search by doctor name, ID, qualification or designation")
):
    """
    Retrieves all doctor profiles stored in MongoDB scoped to hospital_id with flexible filtering and search.
    """
    try:
        db = get_database()
        and_conditions = []
        h_filter = _hospital_filter(hospital_id)
        if h_filter:
            and_conditions.append(h_filter)

        if department:
            and_conditions.append({"department": {"$regex": f"^{department.strip()}$", "$options": "i"}})
        if tier:
            and_conditions.append({"tier": tier.strip().upper()})
        if status_filter:
            and_conditions.append({"status": status_filter.strip().upper()})
        if employment_type:
            and_conditions.append({"employment_type": employment_type.strip().upper()})
        if search and search.strip():
            s = search.strip()
            and_conditions.append({"$or": [
                {"name": {"$regex": s, "$options": "i"}},
                {"doctor_id": {"$regex": s, "$options": "i"}},
                {"designation": {"$regex": s, "$options": "i"}},
                {"qualification": {"$regex": s, "$options": "i"}},
                {"department": {"$regex": s, "$options": "i"}},
                {"room_number": {"$regex": s, "$options": "i"}}
            ]})

        query = {"$and": and_conditions} if len(and_conditions) > 1 else (and_conditions[0] if and_conditions else {})

        doctors_cursor = db.doctors.find(query, {"_id": 0}).sort([("department", 1), ("tier", 1), ("name", 1)])
        doctors_list = list(doctors_cursor)
        
        # Ensure default employment_type and hospital_id if legacy record
        for d in doctors_list:
            if "employment_type" not in d or not d["employment_type"]:
                d["employment_type"] = "PERMANENT"
            if not d.get("hospital_id"):
                d["hospital_id"] = "HOSP-BLR-001"
            if not d.get("hospital_name"):
                d["hospital_name"] = "Victoria Hospital (BMCRI Apex Medical Center)"

        return {
            "success": True,
            "hospital_id": hospital_id or "HOSP-BLR-001",
            "total_count": len(doctors_list),
            "data": doctors_list
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch doctor profiles: {str(e)}"
        )


@router.get("/summary")
def get_doctors_department_summary(
    hospital_id: Optional[str] = Query("HOSP-BLR-001", description="Hospital tenant ID")
):
    """
    Returns department-wise summary of doctors (total, junior, senior, available, permanent, temporary)
    scoped to the specified hospital tenant.
    """
    try:
        db = get_database()
        match_stage = _hospital_filter(hospital_id)
        pipeline = []
        if match_stage:
            pipeline.append({"$match": match_stage})
        pipeline.extend([
            {
                "$group": {
                    "_id": "$department",
                    "total_doctors": {"$sum": 1},
                    "junior_doctors": {
                        "$sum": {"$cond": [{"$eq": ["$tier", "JUNIOR_DOCTOR"]}, 1, 0]}
                    },
                    "senior_doctors": {
                        "$sum": {"$cond": [{"$eq": ["$tier", "SENIOR_DOCTOR"]}, 1, 0]}
                    },
                    "available_doctors": {
                        "$sum": {"$cond": [{"$eq": ["$status", "AVAILABLE"]}, 1, 0]}
                    },
                    "permanent_doctors": {
                        "$sum": {"$cond": [{"$eq": ["$employment_type", "PERMANENT"]}, 1, 0]}
                    },
                    "temporary_doctors": {
                        "$sum": {"$cond": [{"$eq": ["$employment_type", "CONTRACT_TEMPORARY"]}, 1, 0]}
                    }
                }
            },
            {"$sort": {"_id": 1}}
        ])
        
        results = list(db.doctors.aggregate(pipeline))
        base_q = match_stage or {}
        total_all = db.doctors.count_documents(base_q)
        jr_all = db.doctors.count_documents({**base_q, "tier": "JUNIOR_DOCTOR"})
        sr_all = db.doctors.count_documents({**base_q, "tier": "SENIOR_DOCTOR"})
        avail_all = db.doctors.count_documents({**base_q, "status": "AVAILABLE"})
        perm_all = db.doctors.count_documents({"$and": [base_q, {"$or": [{"employment_type": "PERMANENT"}, {"employment_type": {"$exists": False}}]}]} if base_q else {"$or": [{"employment_type": "PERMANENT"}, {"employment_type": {"$exists": False}}]})
        temp_all = db.doctors.count_documents({**base_q, "employment_type": "CONTRACT_TEMPORARY"})
        
        formatted_summary = [
            {
                "department": r["_id"],
                "total_doctors": r["total_doctors"],
                "junior_doctors": r["junior_doctors"],
                "senior_doctors": r["senior_doctors"],
                "available_doctors": r["available_doctors"],
                "permanent_doctors": r.get("permanent_doctors", 0),
                "temporary_doctors": r.get("temporary_doctors", 0)
            }
            for r in results
        ]

        return {
            "success": True,
            "hospital_id": hospital_id or "HOSP-BLR-001",
            "hospital_totals": {
                "total_doctors": total_all,
                "junior_doctors": jr_all,
                "senior_doctors": sr_all,
                "available_doctors": avail_all,
                "permanent_doctors": perm_all,
                "temporary_doctors": temp_all,
                "departments_count": len(formatted_summary)
            },
            "departments": formatted_summary
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compute doctors summary: {str(e)}"
        )


@router.get("/{doctor_id}")
def get_doctor_by_id(doctor_id: str):
    """
    Fetches a specific doctor profile by doctor_id (e.g. DOC_MED_SR_01).
    """
    try:
        db = get_database()
        doc = db.doctors.find_one({"doctor_id": doctor_id.strip()}, {"_id": 0})
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Doctor with ID '{doctor_id}' not found."
            )
        if "employment_type" not in doc:
            doc["employment_type"] = "PERMANENT"
        if not doc.get("hospital_id"):
            doc["hospital_id"] = "HOSP-BLR-001"
        if not doc.get("hospital_name"):
            doc["hospital_name"] = "Victoria Hospital (BMCRI Apex Medical Center)"
        return {
            "success": True,
            "data": doc
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch doctor: {str(e)}"
        )


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_doctor(doc_in: DoctorCreateRequest):
    """
    Registers a new doctor profile into MongoDB scoped to hospital_id.
    """
    try:
        db = get_database()
        target_hid = (doc_in.hospital_id or "HOSP-BLR-001").strip()
        hosp_doc = db.hospitals.find_one({"hospital_id": target_hid})
        target_hname = hosp_doc["name"] if hosp_doc else (doc_in.hospital_name or "Victoria Hospital (BMCRI Apex Medical Center)")

        # Generate custom sequential doctor ID
        clean_dept = "".join(filter(str.isalnum, doc_in.department))[:4].upper()
        tier_code = "JR" if doc_in.tier == "JUNIOR_DOCTOR" else "SR"
        existing_count = db.doctors.count_documents({"department": doc_in.department, "tier": doc_in.tier})
        doc_id = f"DOC_{clean_dept}_{tier_code}_{existing_count + 1:02d}"

        # Prevent duplicate emails
        if db.doctors.find_one({"email": doc_in.email.lower().strip()}):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A doctor with email '{doc_in.email}' is already registered."
            )

        new_doc = {
            "doctor_id": doc_id,
            **doc_in.model_dump(),
            "hospital_id": target_hid,
            "hospital_name": target_hname,
            "email": doc_in.email.lower().strip(),
            "current_patient_id": None,
            "active_queue_count": 0,
            "total_consultations_today": 0,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        db.doctors.insert_one(new_doc)
        new_doc.pop("_id", None)

        broadcast_event("DOCTOR_ROSTER_UPDATED", {
            "action": "created",
            "hospital_id": target_hid,
            "doctor_id": doc_id,
            "name": new_doc["name"],
            "department": new_doc["department"],
            "room_number": new_doc["room_number"],
            "status": new_doc["status"]
        })

        return {
            "success": True,
            "message": f"Doctor profile created for {doc_in.name} ({doc_id})",
            "data": new_doc
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create doctor profile: {str(e)}"
        )


@router.put("/{doctor_id}")
def update_doctor(doctor_id: str, doc_update: DoctorUpdateRequest):
    """
    Updates doctor profile fields (designation, shift, room, status, employment type, etc.).
    """
    try:
        db = get_database()
        doc_id_clean = doctor_id.strip()

        existing = db.doctors.find_one({"doctor_id": doc_id_clean})
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Doctor with ID '{doctor_id}' not found."
            )

        # Build update fields excluding None
        update_data = {k: v for k, v in doc_update.model_dump().items() if v is not None}
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No update fields provided."
            )

        if "email" in update_data:
            update_data["email"] = update_data["email"].lower().strip()
            duplicate = db.doctors.find_one({
                "email": update_data["email"], 
                "doctor_id": {"$ne": doc_id_clean}
            })
            if duplicate:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Email '{update_data['email']}' is already in use by another doctor."
                )

        update_data["updated_at"] = datetime.utcnow().isoformat()

        db.doctors.update_one(
            {"doctor_id": doc_id_clean},
            {"$set": update_data}
        )

        updated_doc = db.doctors.find_one({"doctor_id": doc_id_clean}, {"_id": 0})
        if updated_doc:
            broadcast_event("DOCTOR_ROSTER_UPDATED", {
                "action": "updated",
                "hospital_id": updated_doc.get("hospital_id", "HOSP-BLR-001"),
                "doctor_id": doc_id_clean,
                "name": updated_doc.get("name"),
                "department": updated_doc.get("department"),
                "room_number": updated_doc.get("room_number"),
                "status": updated_doc.get("status")
            })
        return {
            "success": True,
            "message": f"Doctor profile '{doc_id_clean}' updated successfully.",
            "data": updated_doc
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update doctor: {str(e)}"
        )


@router.patch("/{doctor_id}/status")
def update_doctor_status(doctor_id: str, payload: DoctorStatusUpdateRequest):
    """
    Updates doctor availability status (AVAILABLE, BUSY, ON_BREAK, OFFLINE)
    and broadcasts live update to Lobby Display and Admin Center.
    """
    try:
        db = get_database()
        doc_id_clean = doctor_id.strip()
        existing = db.doctors.find_one({"doctor_id": doc_id_clean})
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Doctor with ID '{doctor_id}' not found."
            )
        db.doctors.update_one(
            {"doctor_id": doc_id_clean},
            {"$set": {"status": payload.status, "updated_at": datetime.utcnow().isoformat()}}
        )
        broadcast_event("DOCTOR_STATUS_UPDATED", {
            "hospital_id": existing.get("hospital_id", "HOSP-BLR-001"),
            "doctor_id": doc_id_clean,
            "name": existing.get("name"),
            "department": existing.get("department"),
            "room_number": existing.get("room_number"),
            "status": payload.status
        })
        return {
            "success": True,
            "message": f"Status updated to '{payload.status}' for doctor '{doc_id_clean}'",
            "doctor_id": doc_id_clean,
            "status": payload.status
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update doctor status: {str(e)}"
        )


@router.delete("/{doctor_id}")
def delete_doctor(doctor_id: str):
    """
    Deletes a doctor profile from the hospital directory.
    """
    try:
        db = get_database()
        doc_id_clean = doctor_id.strip()
        res = db.doctors.delete_one({"doctor_id": doc_id_clean})
        if res.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Doctor with ID '{doctor_id}' not found."
            )
        return {
            "success": True,
            "message": f"Doctor profile '{doc_id_clean}' successfully deleted from the roster.",
            "doctor_id": doc_id_clean
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete doctor profile: {str(e)}"
        )
