from pydantic import BaseModel, Field
from typing import Optional


class ReceptionCodeResponse(BaseModel):
    hospital_id: str
    hospital_name: str
    code: str = Field(..., description="Short desk code shown at Victoria reception")
    expires_at: str
    generated_at: str
    expires_in_seconds: int
    is_active: bool = True


class PatientCheckInRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=8, description="Reception desk code")
    hospital_id: str = Field(default="HOSP-BLR-001", description="Must be Victoria for now")


class PatientCheckInStatus(BaseModel):
    checked_in: bool
    hospital_id: Optional[str] = None
    hospital_name: Optional[str] = None
    checked_in_at: Optional[str] = None
    valid_until: Optional[str] = None
    code_used: Optional[str] = None
    message: str
