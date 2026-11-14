from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Literal
from datetime import datetime

DoctorTier = Literal["JUNIOR_DOCTOR", "SENIOR_DOCTOR"]
DoctorStatus = Literal["AVAILABLE", "BUSY", "ON_BREAK", "OFFLINE"]
EmploymentType = Literal["PERMANENT", "CONTRACT_TEMPORARY"]

class DoctorCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Doctor full name with Dr. prefix")
    department: str = Field(..., description="Clinical department")
    tier: DoctorTier = Field(..., description="Doctor hierarchy: JUNIOR_DOCTOR or SENIOR_DOCTOR")
    designation: str = Field(..., description="Hospital post (e.g., Junior Resident, Senior Resident, Assistant Professor, HOD)")
    qualification: str = Field(..., description="Medical degrees (e.g., MBBS, MD, MS, DNB)")
    experience_years: int = Field(default=1, ge=0, description="Years of clinical practice")
    room_number: str = Field(..., description="OPD desk or chamber room identifier")
    opd_days: List[str] = Field(default=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"])
    shift: str = Field(default="Morning (09:00 - 14:00)", description="Assigned clinical shift")
    email: EmailStr = Field(..., description="Hospital email address")
    phone: Optional[str] = Field(default=None, description="Contact number")
    employment_type: EmploymentType = Field(default="PERMANENT", description="Permanent regular staff or Contract/Temporary")
    status: DoctorStatus = Field(default="AVAILABLE")
    max_active_patients: int = Field(default=15, ge=1, description="Maximum concurrent queue limit")
    hospital_id: str = Field(default="HOSP-BLR-001", description="Assigned government hospital tenant ID")
    hospital_name: Optional[str] = Field(default="Victoria Hospital (BMCRI Apex Medical Center)", description="Assigned government hospital name")

class DoctorUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    department: Optional[str] = None
    tier: Optional[DoctorTier] = None
    designation: Optional[str] = None
    qualification: Optional[str] = None
    experience_years: Optional[int] = Field(default=None, ge=0)
    room_number: Optional[str] = None
    opd_days: Optional[List[str]] = None
    shift: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    employment_type: Optional[EmploymentType] = None
    status: Optional[DoctorStatus] = None
    max_active_patients: Optional[int] = Field(default=None, ge=1)
    hospital_id: Optional[str] = None
    hospital_name: Optional[str] = None

class DoctorStatusUpdateRequest(BaseModel):
    status: DoctorStatus

class DoctorResponse(BaseModel):
    doctor_id: str
    name: str
    department: str
    tier: DoctorTier
    designation: str
    qualification: str
    experience_years: int
    room_number: str
    opd_days: List[str]
    shift: str
    email: str
    phone: Optional[str] = None
    employment_type: EmploymentType = "PERMANENT"
    status: DoctorStatus
    hospital_id: str = "HOSP-BLR-001"
    hospital_name: Optional[str] = "Victoria Hospital (BMCRI Apex Medical Center)"
    current_patient_id: Optional[str] = None
    active_queue_count: int = 0
    total_consultations_today: int = 0
    created_at: str
    updated_at: Optional[str] = None
