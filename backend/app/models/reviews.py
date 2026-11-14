from pydantic import BaseModel, Field
from typing import Optional, List, Literal


SeverityBand = Literal["green", "yellow", "red"]


class ReviewCreateRequest(BaseModel):
    """Structured patient feedback used for hospital / dept / doctor / ward analytics."""
    hospital_id: str = Field(default="HOSP-BLR-001")
    consultation_id: str = Field(..., description="Completed visit id — one review per appointment")
    token_number: Optional[str] = None
    department: Optional[str] = None
    doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None
    ward_name: Optional[str] = Field(
        default="OPD Chamber / Waiting Area",
        description="Ignored if visit has assigned_room — locked from consultation",
    )

    # Core dimensions (1–5) — required for analysis
    facility_rating: int = Field(..., ge=1, le=5, description="Overall hospital facility")
    department_rating: int = Field(..., ge=1, le=5, description="Department experience")
    doctor_rating: int = Field(..., ge=1, le=5, description="Consulting doctor")
    ward_rating: int = Field(..., ge=1, le=5, description="Ward / waiting / chamber area")

    # Optional facility sub-signals (help admin drill-down)
    cleanliness_rating: Optional[int] = Field(None, ge=1, le=5)
    waiting_time_rating: Optional[int] = Field(None, ge=1, le=5)
    staff_behaviour_rating: Optional[int] = Field(None, ge=1, le=5)

    facility_comment: Optional[str] = Field(None, max_length=500)
    department_comment: Optional[str] = Field(None, max_length=500)
    doctor_comment: Optional[str] = Field(None, max_length=500)
    ward_comment: Optional[str] = Field(None, max_length=500)
    overall_comment: Optional[str] = Field(None, max_length=800)


class ReviewResponse(BaseModel):
    id: str
    hospital_id: str
    hospital_name: Optional[str] = None
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    consultation_id: Optional[str] = None
    token_number: Optional[str] = None
    department: Optional[str] = None
    doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None
    ward_name: Optional[str] = None
    facility_rating: int
    department_rating: int
    doctor_rating: int
    ward_rating: int
    cleanliness_rating: Optional[int] = None
    waiting_time_rating: Optional[int] = None
    staff_behaviour_rating: Optional[int] = None
    facility_comment: Optional[str] = None
    department_comment: Optional[str] = None
    doctor_comment: Optional[str] = None
    ward_comment: Optional[str] = None
    overall_comment: Optional[str] = None
    severity_band: Optional[SeverityBand] = None
    has_emergency_flag: bool = False
    emergency_targets: List[str] = []
    created_at: str


class DimensionSummary(BaseModel):
    dimension: str
    avg_rating: float
    review_count: int
    severity_band: SeverityBand
    rating_distribution: List[dict] = []
    xai_summary: Optional[str] = None


class DoctorSummary(BaseModel):
    doctor_id: Optional[str] = None
    doctor_name: str
    department: Optional[str] = None
    avg_rating: float
    review_count: int
    severity_band: SeverityBand
    bad_review_count: int = 0
    latest_bad_comment: Optional[str] = None
    xai_summary: Optional[str] = None


class DepartmentSummary(BaseModel):
    department: str
    avg_department_rating: float
    avg_facility_rating: float
    avg_doctor_rating: float
    avg_ward_rating: float
    review_count: int
    severity_band: SeverityBand
    bad_review_count: int = 0
    doctors: List[DoctorSummary] = []
    xai_summary: Optional[str] = None


class EmergencyAlert(BaseModel):
    id: str
    severity: SeverityBand = "red"
    target_type: Literal["facility", "department", "doctor", "ward"]
    target_name: str
    rating: int
    department: Optional[str] = None
    doctor_name: Optional[str] = None
    ward_name: Optional[str] = None
    patient_name: Optional[str] = None
    comment: Optional[str] = None
    created_at: str
    token_number: Optional[str] = None


class ReviewAnalyticsResponse(BaseModel):
    hospital_id: str
    hospital_name: Optional[str] = None
    total_reviews: int
    overall: DimensionSummary
    facility: DimensionSummary
    departments: List[DepartmentSummary]
    doctors: List[DoctorSummary]
    wards: List[dict] = []
    emergency_alerts: List[EmergencyAlert]
    emergency_count: int
    recent_reviews: List[ReviewResponse]
    trend_last_14_days: List[dict] = []
    xai_hospital_summary: Optional[str] = None
