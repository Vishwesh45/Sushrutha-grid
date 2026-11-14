from pydantic import BaseModel, Field
from typing import List, Optional

class HospitalBase(BaseModel):
    hospital_id: str = Field(..., description="Unique identifier or OSM ID")
    name: str = Field(..., description="Full official hospital name")
    short_code: Optional[str] = Field(None, description="Short code if available")
    category: str = Field("Government Public Hospital", description="Facility type or category")
    address: str = Field(..., description="Physical street address")
    locality: str = Field(..., description="Locality or area name")
    city: str = Field("Bangalore", description="City")
    district: str = Field("Bangalore Urban", description="District")
    state: str = Field("Karnataka", description="State")
    pincode: Optional[str] = Field("560002", description="PIN Code")
    latitude: float = Field(..., description="Latitude coordinate")
    longitude: float = Field(..., description="Longitude coordinate")
    emergency_phone: str = Field("108", description="24x7 Emergency Contact Number")
    reception_phone: Optional[str] = Field(None, description="General OPD Reception Phone")
    opd_timings: str = Field("OPD: 8:30 AM – 4:30 PM (24×7 Emergency Casualty)", description="Operating hours for OPD and casualty")
    departments: List[str] = Field(default_factory=list, description="Available clinical departments")
    has_pcod_specialty_clinic: bool = Field(False, description="Whether specialized PCOD/PCOS clinic is available")
    is_active: bool = Field(True, description="Whether hospital is open and operational")
    is_grid_pilot: bool = Field(False, description="Whether digital queue & doctor chamber desks are live on Sushrutha Grid")
    rating: float = Field(4.2, description="Citizen satisfaction rating out of 5.0")
    total_reviews: int = Field(320, description="Total verified citizen feedback reviews")
    xai_review_summary: str = Field(..., description="Explainable AI synthesis of citizen sentiment, strengths, and wait times")
    xai_key_strengths: List[str] = Field(default_factory=list, description="Top positive clinical aspects")
    xai_patient_alerts: Optional[str] = Field(None, description="Helpful alert regarding peak queue hours or logistics")
    xai_ranking_rationale: Optional[str] = Field(None, description="Explainable AI reason why this facility is recommended")
    source: Optional[str] = Field("live_gis", description="Origin of hospital record: operational_tenant, google_places, or live_osm_gis")


class HospitalReviewCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5, description="Star rating from 1 to 5")
    comment: str = Field(..., min_length=3, max_length=500, description="Patient review comment about hospital experience")
    patient_name: Optional[str] = Field("Verified Citizen", description="Reviewer display name")
    department_visited: Optional[str] = Field(None, description="Department visited")


class HospitalCreate(HospitalBase):
    pass


class HospitalResponse(HospitalBase):
    id: Optional[str] = None
    active_doctors_count: int = 0
    live_waiting_tokens: int = 0


class NearbyHospitalResponse(HospitalResponse):
    distance_km: float = Field(..., description="Calculated Haversine distance in kilometers from patient")
    estimated_travel_minutes: int = Field(..., description="Estimated road travel time in minutes")
    distance_label: str = Field(..., description="Human readable distance (e.g., 2.4 km away)")
