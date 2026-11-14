from pydantic import BaseModel, Field
from typing import List, Optional, Literal


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(..., max_length=800)


class PatientAssistantAskRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=500, description="Patient question about their own visit/Rx")
    prescription_id: Optional[str] = Field(
        default=None,
        description="Focus on this Rx when the patient has multiple treatments",
    )
    history: List[ChatTurn] = Field(
        default_factory=list,
        description="Last few turns for natural conversation (max ~6)",
    )


class VisitOption(BaseModel):
    prescription_id: str
    label: str
    issued_at: Optional[str] = None
    department: Optional[str] = None
    diagnosis: Optional[str] = None


class PatientAssistantAskResponse(BaseModel):
    allowed: bool
    intent: str
    answer: str
    source: Literal["rules_refuse", "rules_template", "llm", "llm_fallback"]
    used_llm: bool = False
    context_used: List[str] = Field(default_factory=list)
    focused_prescription_id: Optional[str] = None
    visit_options: List[VisitOption] = Field(default_factory=list)
    needs_visit_pick: bool = False
    disclaimer: str = (
        "This helper only explains your Sushrutha visit and prescription. "
        "It is not a doctor. For new symptoms or emergencies call 108."
    )
    llm_configured: bool = False
