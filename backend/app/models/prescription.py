from pydantic import BaseModel, Field
from typing import List, Optional

class MedicationItem(BaseModel):
    medicine_name: str = Field(..., description="Commercial or generic drug name e.g. Paracetamol 650mg")
    dosage: str = Field("1 Tablet", description="Unit dosage e.g. 500mg, 10ml, 1 Capsule")
    frequency: str = Field("1-0-1", description="Intake schedule: 1-0-1, 1-0-0, 0-0-1, 1-1-1, SOS")
    timing: str = Field("After Food", description="After Food, Before Food, With Food, At Bedtime")
    duration: str = Field("5 Days", description="Treatment duration e.g. 3 Days, 5 Days, 10 Days, 1 Month")
    instructions: Optional[str] = Field(None, description="Special instructions e.g. Take with warm water")

class PrescriptionCreateRequest(BaseModel):
    consultation_id: str
    token_id: Optional[str] = None
    patient_id: str
    patient_name: str
    patient_uhid: Optional[str] = None
    clinical_diagnosis: str = Field(..., description="Primary clinical impression or confirmed diagnosis")
    icd10_code: Optional[str] = Field(None, description="WHO ICD-10 Classification Code")
    clinical_notes: Optional[str] = Field(None, description="Doctor clinical findings & physical examination notes")
    medications: List[MedicationItem] = Field(default_factory=list, description="Prescribed medications list")
    investigations_advised: Optional[List[str]] = Field(default_factory=list, description="Ordered diagnostic lab or radiology tests")
    diet_lifestyle_advice: Optional[str] = Field(None, description="Dietary and lifestyle instructions")
    follow_up_date: Optional[str] = Field(None, description="Recommended follow-up review date or duration")
    follow_up_on: Optional[str] = Field(None, description="Structured next-visit calendar date YYYY-MM-DD")

class PrescriptionResponse(BaseModel):
    prescription_id: str
    consultation_id: str
    token_number: Optional[str] = None
    doctor_id: str
    doctor_name: str
    doctor_qualification: Optional[str] = None
    doctor_registration_no: Optional[str] = None
    department: str
    room_number: Optional[str] = None
    patient_id: str
    patient_name: str
    patient_uhid: Optional[str] = None
    hospital_id: Optional[str] = "HOSP-BLR-001"
    hospital_name: Optional[str] = None
    hospital_address: Optional[str] = None
    hospital_phone: Optional[str] = None
    hospital_locality: Optional[str] = None
    clinical_diagnosis: str
    icd10_code: Optional[str] = None
    clinical_notes: Optional[str] = None
    medications: List[MedicationItem]
    investigations_advised: List[str] = []
    diet_lifestyle_advice: Optional[str] = None
    follow_up_date: Optional[str] = None
    follow_up_on: Optional[str] = None
    digital_signature: Optional[str] = None
    status: str = "ISSUED"
    issued_at: str
