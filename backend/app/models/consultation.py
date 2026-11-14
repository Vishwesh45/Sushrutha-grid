from pydantic import BaseModel, Field
from typing import Optional, Literal, List
from datetime import datetime

SeverityType = Literal["mild", "moderate", "severe"]
ConsultationStatus = Literal[
    "submitted",
    "routed",
    "queued",
    "in_consultation",
    "completed",
    "cancelled",
    "referred_external",
]

class ConsultationCreateRequest(BaseModel):
    chief_complaint: str = Field(..., min_length=3, description="Natural language description of the symptoms/problem")
    symptoms: Optional[List[str]] = Field(default=[], description="List of recognized or entered symptoms")
    severity: SeverityType = Field(default="moderate", description="Self-reported symptom severity")
    duration: Optional[str] = Field(default=None, description="Duration of symptoms e.g. '3 days'")
    functional_difficulty: Optional[str] = Field(default=None, description="Difficulty in daily functions e.g. 'unable to walk'")
    additional_notes: Optional[str] = Field(default=None, description="Additional context or history")
    hospital_id: Optional[str] = Field(default="HOSP-BLR-001", description="Target government hospital tenant")
    hospital_name: Optional[str] = Field(default="Victoria Hospital (BMCRI Apex Medical Center)", description="Target government hospital name")

class ConsultationResponse(BaseModel):
    id: str
    patient_id: str
    patient_name: str
    patient_email: str
    chief_complaint: str
    symptoms: List[str] = []
    severity: str
    duration: Optional[str] = None
    functional_difficulty: Optional[str] = None
    additional_notes: Optional[str] = None
    status: str
    hospital_id: Optional[str] = "HOSP-BLR-001"
    hospital_name: Optional[str] = "Victoria Hospital (BMCRI Apex Medical Center)"
    department: Optional[str] = None
    priority: Optional[str] = None
    extracted_entities: Optional[dict] = None
    token_number: Optional[str] = None
    assigned_doctor_name: Optional[str] = None
    assigned_room: Optional[str] = None
    queue_position: Optional[int] = None
    estimated_wait_minutes: Optional[int] = None
    assignment_rationale: Optional[str] = None
    token: Optional[dict] = None
    department_available: Optional[bool] = True
    availability_message: Optional[str] = None
    recommended_hospitals: Optional[List[dict]] = None
    prescription_id: Optional[str] = None
    completed_at: Optional[str] = None
    clinical_diagnosis: Optional[str] = None
    created_at: str
    updated_at: str
