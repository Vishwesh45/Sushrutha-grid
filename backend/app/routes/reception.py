from fastapi import APIRouter, HTTPException, status, Depends, Query
from app.middleware.auth import require_roles
from app.models.checkin import ReceptionCodeResponse
from app.services import checkin_service

router = APIRouter(prefix="/api/reception", tags=["Reception Check-In"])


@router.get("/code/current", response_model=ReceptionCodeResponse)
def get_current_desk_code(
    hospital_id: str = Query(default="HOSP-BLR-001"),
    current_user: dict = Depends(require_roles("admin")),
):
    """
    Returns the active Victoria reception desk code.
    Generates one automatically if none is active (first open of the desk screen).
    """
    try:
        hid = (current_user.get("hospital_id") or hospital_id or checkin_service.OPERATIONAL_HOSPITAL_ID)
        data = checkin_service.get_or_create_reception_code(
            hospital_id=hid,
            generated_by=current_user.get("id"),
        )
        return ReceptionCodeResponse(**data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load reception code: {exc}",
        )


@router.get("/code/display", response_model=ReceptionCodeResponse)
def get_desk_display_code(
    hospital_id: str = Query(default="HOSP-BLR-001"),
):
    """
    Public board for the Victoria reception TV / tablet.
    Patients read this screen at the hospital, then type the code in Today's visit.
    The patient phone app does not show this code (that would unlock visits from home).
    """
    try:
        hid = hospital_id or checkin_service.OPERATIONAL_HOSPITAL_ID
        data = checkin_service.get_or_create_reception_code(
            hospital_id=hid,
            generated_by="desk-display",
        )
        return ReceptionCodeResponse(**data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load desk display code: {exc}",
        )


@router.post("/code/generate", response_model=ReceptionCodeResponse, status_code=status.HTTP_201_CREATED)
def generate_desk_code(
    hospital_id: str = Query(default="HOSP-BLR-001"),
    current_user: dict = Depends(require_roles("admin")),
):
    """
    Forces a new desk code. Previous code stops working immediately.
    Use when the 15-minute window ends or the desk wants a fresh board.
    """
    try:
        hid = (current_user.get("hospital_id") or hospital_id or checkin_service.OPERATIONAL_HOSPITAL_ID)
        data = checkin_service.generate_reception_code(
            hospital_id=hid,
            generated_by=current_user.get("id"),
        )
        return ReceptionCodeResponse(**data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate reception code: {exc}",
        )
