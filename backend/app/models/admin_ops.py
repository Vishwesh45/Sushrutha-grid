from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Literal
from datetime import datetime

# ==========================================
# VOLUNTEER & NGO MODELS
# ==========================================

class VolunteerRequisitionCreate(BaseModel):
    title: str = Field(..., min_length=3, description="Requisition title e.g. Outpatient Queue Assistance")
    department: str = Field(..., description="Hospital department")
    number_of_volunteers: int = Field(..., ge=1, description="Number of volunteers required")
    duration_per_day: str = Field(..., description="Duration per day e.g. 4 Hours / Day or Morning Shift")
    total_days: int = Field(..., ge=1, description="Total days e.g. 7, 14, 30 days")
    description: Optional[str] = Field(default=None, description="Detailed task requirements or preferred languages")

class VolunteerRequisitionResponse(BaseModel):
    requisition_id: str
    title: str
    department: str
    number_of_volunteers: int
    duration_per_day: str
    total_days: int
    description: Optional[str] = None
    status: Literal["OPEN", "ACTIVE", "COMPLETED", "CLOSED"] = "OPEN"
    applications_count: int = 0
    created_at: str
    updated_at: Optional[str] = None

class VolunteerApplicationResponse(BaseModel):
    application_id: str
    requisition_id: Optional[str] = None
    applicant_name: str
    ngo_name: str
    phone: str
    email: str
    volunteers_offered: int
    skills: List[str] = []
    status: Literal["PENDING", "ACCEPTED", "REJECTED", "DEPLOYED"] = "PENDING"
    applied_at: str

class ApplicationStatusUpdate(BaseModel):
    status: Literal["PENDING", "ACCEPTED", "REJECTED", "DEPLOYED"]


class VolunteerApplicationCreate(BaseModel):
    requisition_id: str = Field(..., min_length=3)
    hospital_id: str = Field(default="HOSP-BLR-001")
    ngo_name: str = Field(..., min_length=2, description="Registered NGO / organization name (core applicant)")
    applicant_name: Optional[str] = Field(default=None, min_length=2, description="NGO liaison name (optional)")
    phone: Optional[str] = None
    email: Optional[EmailStr] = Field(default=None, description="NGO contact email")
    volunteers_offered: int = Field(..., ge=1, le=500)
    skills: List[str] = Field(default_factory=list)
    notes: Optional[str] = Field(default=None, max_length=500)

# ==========================================
# CSR HOSPITAL REQUIREMENTS MODELS
# ==========================================

class CSRItem(BaseModel):
    item_name: str = Field(..., min_length=2, description="Medical equipment or supply item")
    quantity: int = Field(..., ge=1, description="Quantity required")
    estimated_cost: float = Field(..., ge=0, description="Estimated cost per item in INR")

class CSRRequirementCreate(BaseModel):
    title: str = Field(..., min_length=3, description="List title or project name")
    department: str = Field(..., description="Hospital department")
    description: str = Field(..., min_length=5, description="Clinical justification for CSR funding")
    priority: Literal["CRITICAL", "HIGH", "MEDIUM"] = Field(..., description="Priority of the complete list")
    items: List[CSRItem] = Field(..., min_length=1, description="List of equipment/supply items")

class CSRPledgeRequest(BaseModel):
    company_name: str = Field(..., min_length=2, description="CSR Corporate / Foundation name")
    contact_person: Optional[str] = Field(default=None, description="CSR representative name")
    email: Optional[EmailStr] = Field(default=None, description="Corporate contact email")
    pledged_amount: Optional[float] = Field(default=None, ge=0, description="Pledged amount in INR")
    notes: Optional[str] = None

class CSRRequirementResponse(BaseModel):
    requirement_id: str
    title: str
    department: str
    description: str
    priority: Literal["CRITICAL", "HIGH", "MEDIUM"]
    items: List[CSRItem]
    total_estimated_cost: float
    status: Literal["POSTED", "CSR_PLEDGED", "FULFILLED"] = "POSTED"
    csr_sponsor: Optional[dict] = None
    created_at: str
    updated_at: Optional[str] = None
