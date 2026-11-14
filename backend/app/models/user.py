from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal
from datetime import datetime

# Permitted roles in Sushrutha Grid
RoleType = Literal["patient", "doctor", "nurse", "admin", "volunteer", "csr"]

class UserRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Full name")
    email: EmailStr = Field(..., description="Unique email address")
    password: str = Field(..., min_length=6, description="Password (at least 6 characters)")
    role: RoleType = Field(default="patient", description="User role in hospital platform")
    phone: Optional[str] = Field(default=None, description="Contact phone number")
    department: Optional[str] = Field(default=None, description="Department (for doctors/staff)")

class PatientRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100, description="Patient full name")
    phone: str = Field(..., min_length=10, max_length=15, description="10-digit mobile number for login & alerts")
    email: EmailStr = Field(..., description="Email address for appointment alerts & password resets")
    password: str = Field(..., min_length=6, description="Password (min 6 characters)")
    age: Optional[int] = Field(default=None, ge=0, le=130, description="Patient age")
    gender: Optional[str] = Field(default="Other", description="Gender (Male/Female/Other)")
    address: Optional[str] = Field(default=None, description="Residential district/address")

class UserLoginRequest(BaseModel):
    email: Optional[EmailStr] = None
    identifier: Optional[str] = Field(default=None, description="Email or 10-digit Phone Number")
    password: str = Field(..., description="Account password")

class PatientLoginRequest(BaseModel):
    identifier: str = Field(..., description="Mobile number (10 digits) or Email address")
    password: str = Field(..., description="Password")

class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., description="Registered email address to receive reset code")

class ResetPasswordRequest(BaseModel):
    email: EmailStr = Field(..., description="Registered email address")
    otp: str = Field(..., min_length=6, max_length=6, description="6-digit reset code received on email")
    new_password: str = Field(..., min_length=6, description="New account password")

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    name: str
    email: str
    phone: Optional[str] = None
    uhid: Optional[str] = None
    role: str
    session_id: Optional[str] = None

class SessionInfoResponse(BaseModel):
    session_id: str
    user_id: str
    name: str
    email: str
    role: str
    uhid: Optional[str] = None
    department: Optional[str] = None
    login_at: str
    last_activity_at: str
    expires_at: str
    idle_timeout_minutes: int = 30
    is_active: bool = True

class SessionHeartbeatResponse(BaseModel):
    success: bool
    session_id: str
    last_activity_at: str
    expires_at: str
    message: str = "Session heartbeat acknowledged"

class SessionRecordItem(BaseModel):
    session_id: str
    login_at: str
    last_activity_at: str
    expires_at: str
    ip_address: Optional[str] = "127.0.0.1"
    status: str = "active"

class UserProfileResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    phone: Optional[str] = None
    uhid: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    department: Optional[str] = None
    created_at: str
