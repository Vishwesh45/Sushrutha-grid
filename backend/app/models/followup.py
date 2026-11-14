from pydantic import BaseModel, Field
from typing import List, Optional, Literal


class FollowUpCreateFromRx(BaseModel):
    """Optional structured date from doctor desk alongside free-text advice."""
    follow_up_on: Optional[str] = Field(
        None,
        description="ISO calendar date YYYY-MM-DD for the next review visit",
    )


class FollowUpReminderItem(BaseModel):
    id: str
    reminder_type: str
    title: str
    message: str
    due_at: Optional[str] = None
    status: Literal["scheduled", "due", "sent", "acknowledged", "cancelled", "expired"] = "scheduled"
    appointment_id: Optional[str] = None
    follow_up_on: Optional[str] = None
    department: Optional[str] = None
    doctor_name: Optional[str] = None
    prescription_id: Optional[str] = None


class FollowUpAppointmentItem(BaseModel):
    id: str
    follow_up_on: str
    follow_up_advice: Optional[str] = None
    status: Literal["scheduled", "completed", "cancelled", "missed"] = "scheduled"
    department: Optional[str] = None
    doctor_name: Optional[str] = None
    hospital_name: Optional[str] = None
    prescription_id: Optional[str] = None
    clinical_diagnosis: Optional[str] = None
    created_at: Optional[str] = None
    reminders: List[FollowUpReminderItem] = []


class FollowUpDashboardResponse(BaseModel):
    upcoming: List[FollowUpAppointmentItem] = []
    past: List[FollowUpAppointmentItem] = []
    due_reminders: List[FollowUpReminderItem] = []
    total_upcoming: int = 0
    total_past: int = 0
    total_due_reminders: int = 0
    today: Optional[str] = None


class AcknowledgeReminderRequest(BaseModel):
    reminder_id: str
