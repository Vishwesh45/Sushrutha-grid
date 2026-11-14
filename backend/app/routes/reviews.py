from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional

from app.middleware.auth import get_current_user, require_roles
from app.models.reviews import ReviewCreateRequest, ReviewResponse, ReviewAnalyticsResponse
from app.services import review_service

router = APIRouter(prefix="/api/reviews", tags=["Ratings & Reviews"])


@router.post("", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
def submit_review(
    request: ReviewCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Patient submits structured facility / department / doctor / ward ratings."""
    if current_user.get("role") not in ("patient", "admin"):
        raise HTTPException(status_code=403, detail="Only patients can submit visit reviews.")

    try:
        doc = review_service.submit_patient_review(
            patient_id=current_user["id"],
            patient_name=current_user.get("name") or "Verified Patient",
            hospital_id=request.hospital_id,
            facility_rating=request.facility_rating,
            department_rating=request.department_rating,
            doctor_rating=request.doctor_rating,
            ward_rating=request.ward_rating,
            department=request.department,
            doctor_id=request.doctor_id,
            doctor_name=request.doctor_name,
            ward_name=request.ward_name,
            consultation_id=request.consultation_id,
            token_number=request.token_number,
            cleanliness_rating=request.cleanliness_rating,
            waiting_time_rating=request.waiting_time_rating,
            staff_behaviour_rating=request.staff_behaviour_rating,
            facility_comment=request.facility_comment,
            department_comment=request.department_comment,
            doctor_comment=request.doctor_comment,
            ward_comment=request.ward_comment,
            overall_comment=request.overall_comment,
        )
    except review_service.ReviewAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already submitted a review for this appointment.",
        ) from exc
    except review_service.ReviewVisitError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return ReviewResponse(**doc)


@router.get("/analytics", response_model=ReviewAnalyticsResponse)
def hospital_review_analytics(
    hospital_id: Optional[str] = Query("HOSP-BLR-001"),
    current_user: dict = Depends(require_roles(["admin", "doctor"])),
):
    data = review_service.get_hospital_review_analytics(hospital_id or "HOSP-BLR-001")
    return ReviewAnalyticsResponse(**data)


@router.get("/emergencies")
def emergency_bad_reviews(
    hospital_id: Optional[str] = Query("HOSP-BLR-001"),
    current_user: dict = Depends(require_roles(["admin", "doctor"])),
):
    """Quick lookup of very bad reviews (any dimension ≤ 2★)."""
    data = review_service.get_hospital_review_analytics(hospital_id or "HOSP-BLR-001")
    return {
        "success": True,
        "hospital_id": data["hospital_id"],
        "emergency_count": data["emergency_count"],
        "alerts": data["emergency_alerts"],
    }


@router.get("/my")
def my_reviews(current_user: dict = Depends(get_current_user)):
    from app.database import get_database
    db = get_database()
    rows = list(db.patient_reviews.find({"patient_id": current_user["id"]}).sort("created_at", -1).limit(30))
    out = []
    for r in rows:
        r["id"] = str(r.pop("_id"))
        out.append(review_service._enrich_review_doc(r))
    return {"success": True, "reviews": out}
