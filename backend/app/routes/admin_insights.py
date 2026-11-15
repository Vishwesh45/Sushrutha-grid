"""Admin beds, hospital analytics, and audit logs — live DB backed."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.middleware.auth import require_roles
from app.services import bed_service, admin_insights_service

router = APIRouter(prefix="/api/admin", tags=["Admin Insights: Beds · Analytics · Audit"])
OPERATIONAL_HID = "HOSP-BLR-001"


class BedOccupancyUpdate(BaseModel):
    occupied_beds: int = Field(..., ge=0)
    total_beds: Optional[int] = Field(default=None, ge=1)


@router.get("/beds")
def get_bed_inventory(
    hospital_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_roles(["admin"])),
):
    hid = (hospital_id or current_user.get("hospital_id") or OPERATIONAL_HID).strip()
    data = bed_service.summary(hospital_id=hid)
    return {"success": True, "data": data}


@router.patch("/beds/{ward_id}")
def patch_bed_occupancy(
    ward_id: str,
    payload: BedOccupancyUpdate,
    hospital_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_roles(["admin"])),
):
    hid = (hospital_id or current_user.get("hospital_id") or OPERATIONAL_HID).strip()
    try:
        updated = bed_service.update_ward_occupancy(
            ward_id.strip(),
            occupied_beds=payload.occupied_beds,
            total_beds=payload.total_beds,
            hospital_id=hid,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"success": True, "message": f"Ward {ward_id} occupancy updated.", "data": updated}


@router.get("/hospital-analytics")
def get_hospital_analytics(
    hospital_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_roles(["admin"])),
):
    hid = (hospital_id or current_user.get("hospital_id") or OPERATIONAL_HID).strip()
    data = admin_insights_service.hospital_analytics(hospital_id=hid)
    return {"success": True, "data": data}


@router.get("/audit-logs")
def get_audit_logs(
    hospital_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    limit: int = Query(80, ge=1, le=200),
    current_user: dict = Depends(require_roles(["admin"])),
):
    hid = (hospital_id or current_user.get("hospital_id") or OPERATIONAL_HID).strip()
    data = admin_insights_service.audit_logs(hospital_id=hid, limit=limit, event_type=event_type)
    return {"success": True, "data": data}
