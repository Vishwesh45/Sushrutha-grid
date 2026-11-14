from fastapi import APIRouter, HTTPException, Query, status
from typing import List, Optional
from app.models.hospital import HospitalResponse, NearbyHospitalResponse, HospitalReviewCreate
from app.services.hospital_service import (
    get_all_hospitals,
    get_nearby_hospitals,
    get_hospital_by_id,
    seed_government_hospitals,
    add_hospital_review
)
from app.database import get_database

router = APIRouter(prefix="/api/hospitals", tags=["Government Hospitals Directory & Geolocation"])


@router.get("", response_model=List[HospitalResponse])
def list_hospitals():
    """
    Returns the operational government hospital tenant(s) registered on Sushrutha Grid.
    Display-only nearby hospitals are fetched dynamically via GET /api/hospitals/nearby.
    """
    db = get_database()
    return get_all_hospitals(db)


@router.get("/nearby", response_model=List[NearbyHospitalResponse])
def find_nearby_hospitals(
    lat: Optional[float] = Query(None, description="Patient GPS latitude coordinate (e.g. 12.9716)"),
    lon: Optional[float] = Query(None, description="Patient GPS longitude coordinate (e.g. 77.5946)"),
    department: Optional[str] = Query(None, description="Filter by clinical department (e.g., 'Obstetrics & Gynecology')"),
    radius_km: float = Query(20.0, description="Discovery search radius in kilometers (default 20 km)")
):
    """
    Dynamically discovers government hospitals around the patient's GPS coordinates
    using live OpenStreetMap Overpass + Nominatim GIS, ranks them by Haversine distance,
    and attaches Explainable AI (XAI) review & ranking summaries.
    """
    db = get_database()
    return get_nearby_hospitals(user_lat=lat, user_lon=lon, department=department, radius_km=radius_km, db=db)


@router.get("/department-availability")
def department_availability(
    department: str = Query(..., description="NLP-routed or requested clinical department"),
    hospital_id: str = Query("HOSP-BLR-001", description="Operational hospital tenant to check"),
    lat: Optional[float] = Query(None, description="Optional patient GPS latitude for nearby referrals"),
    lon: Optional[float] = Query(None, description="Optional patient GPS longitude for nearby referrals"),
):
    """
    Checks whether the hospital doctor roster includes the routed department.
    NLP should still run; this gate only decides token eligibility + referrals.
    """
    from app.services.department_availability_service import check_department_availability
    return check_department_availability(
        hospital_id=hospital_id,
        department=department,
        lat=lat,
        lon=lon,
    )


@router.get("/{hospital_id}", response_model=HospitalResponse)
def get_hospital_details(hospital_id: str):
    """
    Returns detailed configuration, contact info, and department roster for a specific hospital.
    """
    db = get_database()
    seed_government_hospitals(db)
    hosp = get_hospital_by_id(hospital_id, db=db)
    if not hosp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Government hospital with ID '{hospital_id}' not found."
        )
    return hosp


@router.post("/{hospital_id}/reviews", status_code=status.HTTP_201_CREATED)
def submit_hospital_review(hospital_id: str, payload: HospitalReviewCreate):
    """
    Records a citizen rating and review for a hospital and updates its XAI review summary.
    """
    db = get_database()
    review = add_hospital_review(
        hospital_id=hospital_id,
        rating=payload.rating,
        comment=payload.comment,
        patient_name=payload.patient_name or "Verified Citizen",
        department_visited=payload.department_visited,
        db=db
    )
    return {
        "success": True,
        "message": "Citizen review recorded and incorporated into XAI hospital summary.",
        "review": review
    }


@router.get("/{hospital_id}/reviews")
def list_hospital_reviews(hospital_id: str):
    """Returns verified citizen reviews for a hospital."""
    db = get_database()
    reviews = list(db.hospital_reviews.find({"hospital_id": hospital_id}, {"_id": 0}).sort("created_at", -1).limit(25))
    return {
        "success": True,
        "hospital_id": hospital_id,
        "total_count": len(reviews),
        "reviews": reviews
    }
