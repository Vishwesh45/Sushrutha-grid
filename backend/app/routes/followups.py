from fastapi import APIRouter, Depends, HTTPException, status
from app.middleware.auth import get_current_user, require_roles
from app.models.followup import (
    AcknowledgeReminderRequest,
    FollowUpDashboardResponse,
    FollowUpReminderItem,
)
from app.services import followup_service

router = APIRouter(prefix="/api/followups", tags=["Follow-ups & Reminders"])


@router.get("/my", response_model=FollowUpDashboardResponse)
def my_follow_ups(current_user: dict = Depends(require_roles("patient"))):
    """Patient dashboard: upcoming review visits + due in-app reminders."""
    data = followup_service.get_patient_follow_up_dashboard(current_user["id"])
    return FollowUpDashboardResponse(**data)


@router.post("/reminders/acknowledge", response_model=FollowUpReminderItem)
def acknowledge_my_reminder(
    body: AcknowledgeReminderRequest,
    current_user: dict = Depends(require_roles("patient")),
):
    try:
        item = followup_service.acknowledge_reminder(current_user["id"], body.reminder_id)
        return FollowUpReminderItem(**item)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/process-due")
def process_due_now(current_user: dict = Depends(require_roles("admin", "doctor"))):
    """Staff/manual trigger — flip scheduled reminders that are past due_at."""
    n = followup_service.process_due_reminders()
    return {"processed": n, "ok": True}
