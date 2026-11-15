from fastapi import APIRouter, HTTPException, Query, status, Depends
from typing import List, Optional
from datetime import datetime
from app.database import get_database
from app.middleware.auth import require_roles
from app.routes.ws import broadcast_event
from app.models.admin_ops import (
    VolunteerRequisitionCreate,
    VolunteerRequisitionResponse,
    VolunteerApplicationResponse,
    ApplicationStatusUpdate,
    CSRRequirementCreate,
    CSRRequirementResponse,
    CSRPledgeRequest
)

router = APIRouter(prefix="/api/admin", tags=["Hospital Administration Operations: Volunteer & CSR"])
OPERATIONAL_HID = "HOSP-BLR-001"
OPERATIONAL_HNAME = "Victoria Hospital (BMCRI Apex Medical Center)"


def _log_event(db, event_type: str, payload: dict):
    try:
        db.hospital_events.insert_one({
            "event_type": event_type,
            "hospital_id": payload.get("hospital_id") or OPERATIONAL_HID,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            **{k: v for k, v in payload.items() if k != "hospital_id"},
        })
    except Exception:
        pass


# ==========================================================
# 1. VOLUNTEER & NGO REQUISITIONS & APPLICATIONS
# ==========================================================

@router.get("/volunteers/requisitions")
def get_volunteer_requisitions(current_user: dict = Depends(require_roles(["admin"]))):
    """
    Retrieves all volunteer requisitions posted by the hospital administration.
    """
    try:
        db = get_database()
        cursor = db.volunteer_requisitions.find({}, {"_id": 0}).sort("created_at", -1)
        reqs = list(cursor)
        return {
            "success": True,
            "total_count": len(reqs),
            "data": reqs
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch volunteer requisitions: {str(e)}"
        )


@router.post("/volunteers/requisitions", status_code=status.HTTP_201_CREATED)
def create_volunteer_requisition(
    payload: VolunteerRequisitionCreate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Posts a new volunteer requirement for the hospital.
    Specifies number of volunteers, duration per day, total days, and department.
    """
    try:
        db = get_database()
        count = db.volunteer_requisitions.count_documents({})
        req_id = f"VREQ-2026-{count + 1:03d}"
        now = datetime.utcnow().isoformat() + "Z"
        hid = OPERATIONAL_HID
        hname = OPERATIONAL_HNAME

        doc = {
            "requisition_id": req_id,
            "hospital_id": hid,
            "hospital_name": hname,
            "title": payload.title.strip(),
            "department": payload.department.strip(),
            "number_of_volunteers": payload.number_of_volunteers,
            "duration_per_day": payload.duration_per_day.strip(),
            "total_days": payload.total_days,
            "description": payload.description.strip() if payload.description else None,
            "status": "OPEN",
            "applications_count": 0,
            "created_at": now,
            "updated_at": now,
            "posted_by": current_user.get("name"),
        }

        db.volunteer_requisitions.insert_one(doc)
        doc.pop("_id", None)

        _log_event(db, "VOLUNTEER_REQUISITION_POSTED", {
            "hospital_id": hid,
            "requisition_id": req_id,
            "title": doc["title"],
            "department": doc["department"],
            "posted_by": current_user.get("name"),
        })
        broadcast_event("VOLUNTEER_REQUISITION_POSTED", {
            "hospital_id": hid,
            "requisition_id": req_id,
            "title": doc["title"],
            "department": doc["department"],
        })

        return {
            "success": True,
            "message": f"Volunteer requisition '{req_id}' posted successfully.",
            "data": doc
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create volunteer requisition: {str(e)}"
        )


@router.delete("/volunteers/requisitions/{req_id}")
def delete_volunteer_requisition(
    req_id: str,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Cancels / deletes a volunteer requisition.
    """
    try:
        db = get_database()
        res = db.volunteer_requisitions.delete_one({"requisition_id": req_id.strip()})
        if res.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Volunteer requisition '{req_id}' not found."
            )
        _log_event(db, "VOLUNTEER_REQUISITION_DELETED", {
            "hospital_id": OPERATIONAL_HID,
            "requisition_id": req_id.strip(),
            "posted_by": current_user.get("name"),
        })
        return {
            "success": True,
            "message": f"Requisition '{req_id}' removed."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete requisition: {str(e)}"
        )


@router.get("/volunteers/applications")
def get_volunteer_applications(current_user: dict = Depends(require_roles(["admin"]))):
    """
    Retrieves volunteer/NGO applications for admin review.
    """
    try:
        db = get_database()
        cursor = db.volunteer_applications.find({}, {"_id": 0}).sort("applied_at", -1)
        apps = list(cursor)
        return {
            "success": True,
            "total_count": len(apps),
            "data": apps
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch volunteer applications: {str(e)}"
        )


@router.patch("/volunteers/applications/{app_id}/status")
def update_volunteer_application_status(
    app_id: str,
    payload: ApplicationStatusUpdate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Updates status of an NGO/volunteer application (ACCEPTED, REJECTED, DEPLOYED).
    """
    try:
        db = get_database()
        now = datetime.utcnow().isoformat() + "Z"
        app_doc = db.volunteer_applications.find_one({"application_id": app_id.strip()})
        if not app_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Volunteer application '{app_id}' not found."
            )
        current = str(app_doc.get("status") or "PENDING").upper()
        nxt = payload.status
        allowed = {
            "PENDING": {"ACCEPTED", "REJECTED"},
            "ACCEPTED": {"DEPLOYED", "REJECTED"},
            "DEPLOYED": set(),
            "REJECTED": set(),
        }
        if nxt != current and nxt not in allowed.get(current, set()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot move application from {current} to {nxt}.",
            )
        res = db.volunteer_applications.update_one(
            {"application_id": app_id.strip()},
            {"$set": {"status": nxt, "updated_at": now, "reviewed_by": current_user.get("name")}}
        )
        if res.matched_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Volunteer application '{app_id}' not found."
            )
        _log_event(db, "VOLUNTEER_APPLICATION_STATUS", {
            "hospital_id": (app_doc or {}).get("hospital_id") or OPERATIONAL_HID,
            "application_id": app_id.strip(),
            "requisition_id": (app_doc or {}).get("requisition_id"),
            "status": nxt,
            "posted_by": current_user.get("name"),
        })
        broadcast_event("VOLUNTEER_APPLICATION_STATUS", {
            "hospital_id": (app_doc or {}).get("hospital_id") or OPERATIONAL_HID,
            "application_id": app_id.strip(),
            "status": nxt,
        })
        return {
            "success": True,
            "message": f"Application '{app_id}' status updated to {nxt}."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update application status: {str(e)}"
        )


# ==========================================================
# 2. CSR HOSPITAL REQUIREMENTS & FUNDING LIFECYCLE
# ==========================================================

@router.get("/csr/requirements")
def get_csr_requirements(current_user: dict = Depends(require_roles(["admin"]))):
    """
    Retrieves all hospital requirement lists for CSR funding.
    """
    try:
        db = get_database()
        cursor = db.csr_requirements.find({}, {"_id": 0}).sort("created_at", -1)
        reqs = list(cursor)
        return {
            "success": True,
            "total_count": len(reqs),
            "data": reqs
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch CSR requirements: {str(e)}"
        )


@router.post("/csr/requirements", status_code=status.HTTP_201_CREATED)
def create_csr_requirement(
    payload: CSRRequirementCreate,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Posts a multi-item hospital requirement list for CSR sponsorship.
    Priority applies to the complete list.
    """
    try:
        db = get_database()
        count = db.csr_requirements.count_documents({})
        req_id = f"CSR-2026-{count + 1:03d}"
        now = datetime.utcnow().isoformat() + "Z"

        # Calculate total estimated cost as sum of item quantity * estimated_cost
        items_dict = [it.model_dump() for it in payload.items]
        total_cost = sum(it["quantity"] * it["estimated_cost"] for it in items_dict)

        doc = {
            "requirement_id": req_id,
            "hospital_id": OPERATIONAL_HID,
            "hospital_name": OPERATIONAL_HNAME,
            "title": payload.title.strip(),
            "department": payload.department.strip(),
            "description": payload.description.strip(),
            "priority": payload.priority,
            "items": items_dict,
            "total_estimated_cost": total_cost,
            "status": "POSTED",
            "csr_sponsor": None,
            "created_at": now,
            "updated_at": now,
            "posted_by": current_user.get("name"),
        }

        db.csr_requirements.insert_one(doc)
        doc.pop("_id", None)

        _log_event(db, "CSR_REQUIREMENT_POSTED", {
            "hospital_id": OPERATIONAL_HID,
            "requirement_id": req_id,
            "title": doc["title"],
            "priority": doc["priority"],
            "posted_by": current_user.get("name"),
        })
        broadcast_event("CSR_REQUIREMENT_POSTED", {
            "hospital_id": OPERATIONAL_HID,
            "requirement_id": req_id,
            "title": doc["title"],
            "priority": doc["priority"],
            "total_estimated_cost": total_cost,
        })

        return {
            "success": True,
            "message": f"Hospital requirement list '{req_id}' posted for CSR sponsorship.",
            "data": doc
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create CSR requirement: {str(e)}"
        )


@router.delete("/csr/requirements/{req_id}")
def delete_csr_requirement(
    req_id: str,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Deletes a CSR requirement list.
    """
    try:
        db = get_database()
        res = db.csr_requirements.delete_one({"requirement_id": req_id.strip()})
        if res.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"CSR requirement '{req_id}' not found."
            )
        _log_event(db, "CSR_REQUIREMENT_DELETED", {
            "hospital_id": OPERATIONAL_HID,
            "requirement_id": req_id.strip(),
            "posted_by": current_user.get("name"),
        })
        return {
            "success": True,
            "message": f"Requirement list '{req_id}' deleted."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete CSR requirement: {str(e)}"
        )


@router.post("/csr/requirements/{req_id}/pledge")
def record_csr_pledge(
    req_id: str,
    pledge: CSRPledgeRequest,
    current_user: dict = Depends(require_roles(["admin", "csr"])),
):
    """
    Records corporate CSR sponsor interest / pledge.
    Advances status from POSTED -> CSR_PLEDGED.
    Admin desk or CSR company account.
    """
    try:
        db = get_database()
        req_id_clean = req_id.strip()
        existing = db.csr_requirements.find_one({"requirement_id": req_id_clean})
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Requirement '{req_id}' not found."
            )
        if str(existing.get("status") or "").upper() not in ("POSTED", "OPEN"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only POSTED requirements can receive a new pledge.",
            )

        now = datetime.utcnow().isoformat() + "Z"
        sponsor_data = {
            "company_name": pledge.company_name.strip(),
            "contact_person": pledge.contact_person.strip() if pledge.contact_person else None,
            "email": str(pledge.email).strip() if pledge.email else None,
            "pledged_amount": pledge.pledged_amount or existing.get("total_estimated_cost", 0),
            "pledged_at": now,
            "notes": pledge.notes.strip() if pledge.notes else None
        }

        db.csr_requirements.update_one(
            {"requirement_id": req_id_clean},
            {
                "$set": {
                    "status": "CSR_PLEDGED",
                    "csr_sponsor": sponsor_data,
                    "updated_at": now
                }
            }
        )
        _log_event(db, "CSR_PLEDGED", {
            "hospital_id": existing.get("hospital_id") or OPERATIONAL_HID,
            "requirement_id": req_id_clean,
            "title": existing.get("title"),
            "status": "CSR_PLEDGED",
            "posted_by": current_user.get("name"),
        })

        updated_doc = db.csr_requirements.find_one({"requirement_id": req_id_clean}, {"_id": 0})
        return {
            "success": True,
            "message": f"CSR pledge recorded from '{pledge.company_name}'. Status updated to CSR_PLEDGED.",
            "data": updated_doc
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record CSR pledge: {str(e)}"
        )


@router.post("/csr/requirements/{req_id}/fulfill")
def fulfill_csr_requirement(
    req_id: str,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Marks pledged equipment as physically received and verified.
    Can ONLY be triggered after CSR_PLEDGED status has occurred.
    Advances status from CSR_PLEDGED -> FULFILLED.
    """
    try:
        db = get_database()
        req_id_clean = req_id.strip()
        existing = db.csr_requirements.find_one({"requirement_id": req_id_clean})
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Requirement '{req_id}' not found."
            )

        if existing.get("status") != "CSR_PLEDGED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A requirement must first have a committed sponsor (CSR_PLEDGED) before it can be fulfilled."
            )

        now = datetime.utcnow().isoformat() + "Z"
        db.csr_requirements.update_one(
            {"requirement_id": req_id_clean},
            {
                "$set": {
                    "status": "FULFILLED",
                    "fulfilled_at": now,
                    "updated_at": now,
                    "fulfilled_by": current_user.get("name"),
                }
            }
        )
        _log_event(db, "CSR_FULFILLED", {
            "hospital_id": existing.get("hospital_id") or OPERATIONAL_HID,
            "requirement_id": req_id_clean,
            "title": existing.get("title"),
            "status": "FULFILLED",
            "posted_by": current_user.get("name"),
        })

        updated_doc = db.csr_requirements.find_one({"requirement_id": req_id_clean}, {"_id": 0})
        return {
            "success": True,
            "message": f"Requirement '{req_id_clean}' marked as FULFILLED! Items received at hospital.",
            "data": updated_doc
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to mark requirement fulfilled: {str(e)}"
        )
