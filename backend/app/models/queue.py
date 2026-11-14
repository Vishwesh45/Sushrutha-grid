from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime

TokenStatus = Literal["WAITING", "CALLED", "IN_CONSULTATION", "COMPLETED", "SKIPPED", "CANCELLED"]
PriorityTier = Literal["RED", "AMBER", "GREEN"]

class TokenCreateRequest(BaseModel):
    consultation_id: Optional[str] = Field(default=None, description="Linked consultation ID")
    patient_id: Optional[str] = Field(default=None, description="Patient User ID")
    patient_name: str = Field(..., description="Patient full name")
    patient_email: Optional[str] = None
    chief_complaint: str = Field(..., description="Primary reason for visit")
    symptoms: List[str] = Field(default=[], description="Extracted symptom list")
    department: str = Field(default="General Medicine", description="Routed clinical department")
    priority: PriorityTier = Field(default="GREEN", description="RED (Emergency), AMBER (Urgent), GREEN (Routine)")
    severity_notes: Optional[str] = None
    hospital_id: Optional[str] = Field(default="HOSP-BLR-001", description="Hospital tenant identifier")
    hospital_name: Optional[str] = Field(default="Victoria Hospital (BMCRI Apex Medical Center)", description="Hospital tenant name")

class TokenCallRequest(BaseModel):
    counter_or_room: Optional[str] = Field(default=None, description="Override room if called from specific desk")

class TokenCompleteRequest(BaseModel):
    doctor_notes: Optional[str] = Field(default=None, description="Optional brief consult summary")

class OPDTokenResponse(BaseModel):
    token_id: str
    token_number: str
    sequence_number: int
    patient_id: str
    patient_name: str
    patient_email: Optional[str] = None
    consultation_id: Optional[str] = None
    chief_complaint: str
    symptoms: List[str] = []
    department: str
    priority: PriorityTier
    priority_rank: int
    assigned_doctor_id: Optional[str] = None
    assigned_doctor_name: Optional[str] = None
    assigned_doctor_tier: Optional[str] = None
    assigned_room: str
    status: TokenStatus
    hospital_id: Optional[str] = "HOSP-BLR-001"
    hospital_name: Optional[str] = "Victoria Hospital (BMCRI Apex Medical Center)"
    queue_position: Optional[int] = None
    patients_ahead: Optional[int] = None
    estimated_wait_minutes: Optional[int] = None
    assignment_rationale: Optional[str] = None
    created_at: str
    called_at: Optional[str] = None
    consultation_started_at: Optional[str] = None
    completed_at: Optional[str] = None
    skipped_at: Optional[str] = None
    rejoined_at: Optional[str] = None
    actual_wait_minutes: Optional[float] = None
    actual_consult_minutes: Optional[float] = None
    notes: Optional[str] = None

class QueueSummaryResponse(BaseModel):
    total_tokens_today: int
    waiting_count: int
    called_count: int
    in_consultation_count: int
    completed_count: int
    skipped_count: int
    emergency_red_count: int
    urgent_amber_count: int
    routine_green_count: int
    avg_wait_minutes: float
    department_breakdown: dict

class QueueAnalyticsResponse(BaseModel):
    timeframe: str
    target_date: Optional[str] = None
    target_month: Optional[str] = None
    department_filter: Optional[str] = None
    total_tokens: int
    department_distribution: dict
    severity_distribution: dict
    status_distribution: dict
    hourly_distribution: dict
    tokens: List[OPDTokenResponse]
