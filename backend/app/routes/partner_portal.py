"""Public NGO volunteer + CSR company partner portals (cross-linked with admin ops)."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database import get_database
from app.middleware.auth import get_current_user, require_roles
from app.models.admin_ops import VolunteerApplicationCreate, CSRPledgeRequest
from app.routes.ws import broadcast_event
from app.services.hospital_service import get_hospital_by_id, get_all_hospitals

router = APIRouter(prefix="/api/partners", tags=["NGO Volunteer & CSR Partner Portals"])

OPERATIONAL_HID = "HOSP-BLR-001"


def _hospital_name(db, hospital_id: str) -> str:
    h = get_hospital_by_id(hospital_id, db)
    return (h or {}).get("name") or "Victoria Hospital (BMCRI Apex Medical Center)"


@router.get("/hospitals")
def partner_hospital_directory():
    """Hospitals NGOs/CSR can select when volunteering or sponsoring."""
    db = get_database()
    rows = get_all_hospitals(db) or []
    out = []
    for h in rows:
        out.append({
            "hospital_id": h.get("hospital_id"),
            "name": h.get("name"),
            "city": h.get("city") or h.get("district"),
            "address": h.get("address"),
        })
    if not any(r.get("hospital_id") == OPERATIONAL_HID for r in out):
        out.insert(0, {
            "hospital_id": OPERATIONAL_HID,
            "name": "Victoria Hospital (BMCRI Apex Medical Center)",
            "city": "Bengaluru",
            "address": "Fort Road, Bengaluru",
        })
    return {"success": True, "data": out}


@router.get("/volunteers/open")
def list_open_volunteer_requisitions(
    hospital_id: Optional[str] = Query(None, description="Filter by hospital tenant"),
):
    """Open volunteer requisitions for NGO portal (optionally by hospital)."""
    db = get_database()
    query = {"status": {"$in": ["OPEN", "ACTIVE"]}}
    if hospital_id:
        hid = hospital_id.strip()
        if hid == OPERATIONAL_HID:
            query["$or"] = [
                {"hospital_id": OPERATIONAL_HID},
                {"hospital_id": {"$exists": False}},
                {"hospital_id": None},
            ]
        else:
            query["hospital_id"] = hid

    rows = list(db.volunteer_requisitions.find(query, {"_id": 0}).sort("created_at", -1))
    for r in rows:
        hid = r.get("hospital_id") or OPERATIONAL_HID
        r["hospital_id"] = hid
        r["hospital_name"] = r.get("hospital_name") or _hospital_name(db, hid)
    return {"success": True, "total_count": len(rows), "data": rows}


@router.post("/volunteers/apply", status_code=status.HTTP_201_CREATED)
def apply_for_volunteer_requisition(
    payload: VolunteerApplicationCreate,
    current_user: dict = Depends(require_roles(["volunteer", "admin"])),
):
    """NGO / volunteer applies against an open hospital requisition."""
    db = get_database()
    req = db.volunteer_requisitions.find_one({"requisition_id": payload.requisition_id.strip()})
    if not req:
        raise HTTPException(status_code=404, detail="Volunteer requisition not found.")
    if str(req.get("status") or "").upper() not in ("OPEN", "ACTIVE"):
        raise HTTPException(status_code=400, detail="This requisition is no longer open for applications.")

    hid = (payload.hospital_id or req.get("hospital_id") or OPERATIONAL_HID).strip()
    existing = db.volunteer_applications.find_one({
        "requisition_id": payload.requisition_id.strip(),
        "applicant_user_id": current_user["id"],
        "status": {"$in": ["PENDING", "ACCEPTED", "DEPLOYED"]},
    })
    if existing:
        raise HTTPException(status_code=409, detail="You already applied for this requisition.")

    count = db.volunteer_applications.count_documents({})
    app_id = f"VAPP-2026-{count + 1:04d}"
    now = datetime.utcnow().isoformat() + "Z"
    # Account is the NGO org (user.name). applicant_name is liaison only.
    ngo_name = (payload.ngo_name or current_user.get("name") or "NGO").strip()
    liaison = (
        (payload.applicant_name or "").strip()
        or (current_user.get("department") or "").strip()
        or ngo_name
    )
    email = str(payload.email or current_user.get("email") or "").strip().lower() or None
    doc = {
        "application_id": app_id,
        "requisition_id": payload.requisition_id.strip(),
        "requisition_title": req.get("title"),
        "hospital_id": hid,
        "hospital_name": req.get("hospital_name") or _hospital_name(db, hid),
        "department": req.get("department"),
        "applicant_user_id": current_user["id"],
        "applicant_name": liaison,
        "ngo_name": ngo_name,
        "phone": (payload.phone or current_user.get("phone") or "").strip() or None,
        "email": email,
        "volunteers_offered": int(payload.volunteers_offered),
        "skills": [s.strip() for s in (payload.skills or []) if s and str(s).strip()],
        "notes": payload.notes.strip() if payload.notes else None,
        "status": "PENDING",
        "applied_at": now,
        "updated_at": now,
    }
    db.volunteer_applications.insert_one(doc)
    db.volunteer_requisitions.update_one(
        {"requisition_id": payload.requisition_id.strip()},
        {"$inc": {"applications_count": 1}, "$set": {"updated_at": now}},
    )
    doc.pop("_id", None)

    broadcast_event("VOLUNTEER_APPLICATION_SUBMITTED", {
        "hospital_id": hid,
        "application_id": app_id,
        "requisition_id": payload.requisition_id.strip(),
        "ngo_name": doc["ngo_name"],
        "volunteers_offered": doc["volunteers_offered"],
    })

    return {
        "success": True,
        "message": f"Application {app_id} submitted to hospital administration.",
        "data": doc,
    }


@router.get("/volunteers/my-applications")
def my_volunteer_applications(current_user: dict = Depends(require_roles(["volunteer", "admin"]))):
    db = get_database()
    rows = list(db.volunteer_applications.find(
        {"applicant_user_id": current_user["id"]},
        {"_id": 0},
    ).sort("applied_at", -1))
    return {"success": True, "total_count": len(rows), "data": rows}


@router.get("/csr/listings")
def list_csr_requirement_listings(
    hospital_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    """Hospital CSR requirement listings visible to companies."""
    db = get_database()
    query = {}
    if hospital_id:
        hid = hospital_id.strip()
        if hid == OPERATIONAL_HID:
            query["$or"] = [
                {"hospital_id": OPERATIONAL_HID},
                {"hospital_id": {"$exists": False}},
                {"hospital_id": None},
            ]
        else:
            query["hospital_id"] = hid
    if status_filter:
        query["status"] = status_filter.strip().upper()
    else:
        query["status"] = {"$in": ["POSTED", "CSR_PLEDGED", "FULFILLED"]}

    rows = list(db.csr_requirements.find(query, {"_id": 0}).sort("created_at", -1))
    for r in rows:
        hid = r.get("hospital_id") or OPERATIONAL_HID
        r["hospital_id"] = hid
        r["hospital_name"] = r.get("hospital_name") or _hospital_name(db, hid)
    return {"success": True, "total_count": len(rows), "data": rows}


@router.post("/csr/listings/{req_id}/pledge", status_code=status.HTTP_200_OK)
def partner_csr_pledge(
    req_id: str,
    pledge: CSRPledgeRequest,
    current_user: dict = Depends(require_roles(["csr", "admin"])),
):
    """CSR company pledges against a posted hospital requirement."""
    db = get_database()
    req_id_clean = req_id.strip()
    existing = db.csr_requirements.find_one({"requirement_id": req_id_clean})
    if not existing:
        raise HTTPException(status_code=404, detail=f"Requirement '{req_id}' not found.")
    if existing.get("status") not in ("POSTED",):
        raise HTTPException(
            status_code=400,
            detail=f"Requirement is already {existing.get('status')}. Only POSTED lists accept new pledges.",
        )

    now = datetime.utcnow().isoformat() + "Z"
    # Account is the company (user.name). contact_person is liaison only.
    company = (pledge.company_name or current_user.get("name") or "CSR Sponsor").strip()
    sponsor_data = {
        "company_name": company,
        "contact_person": (
            (pledge.contact_person or "").strip()
            or (current_user.get("department") or "").strip()
            or None
        ),
        "email": str(pledge.email or current_user.get("email") or "").strip() or None,
        "pledged_amount": pledge.pledged_amount or existing.get("total_estimated_cost", 0),
        "pledged_at": now,
        "notes": pledge.notes.strip() if pledge.notes else None,
        "csr_user_id": current_user["id"],
    }
    hid = existing.get("hospital_id") or OPERATIONAL_HID
    db.csr_requirements.update_one(
        {"requirement_id": req_id_clean},
        {"$set": {"status": "CSR_PLEDGED", "csr_sponsor": sponsor_data, "updated_at": now, "hospital_id": hid}},
    )
    updated = db.csr_requirements.find_one({"requirement_id": req_id_clean}, {"_id": 0})

    broadcast_event("CSR_PLEDGE_RECORDED", {
        "hospital_id": hid,
        "requirement_id": req_id_clean,
        "company_name": company,
        "pledged_amount": sponsor_data["pledged_amount"],
    })

    return {
        "success": True,
        "message": f"Pledge from {company} recorded. Hospital admin will verify fulfillment.",
        "data": updated,
    }
