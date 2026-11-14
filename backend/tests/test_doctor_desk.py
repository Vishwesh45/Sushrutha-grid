import pytest
from fastapi.testclient import TestClient
from app.main import app, seed_doctor_accounts
from app.database import get_database

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_doctor_accounts():
    """Ensure doctor accounts are seeded in users collection."""
    seed_doctor_accounts()

def get_doctor_auth_header():
    """Helper to log in as a doctor and get Authorization header."""
    db = get_database()
    doc = db.doctors.find_one({"status": "AVAILABLE"})
    assert doc is not None, "At least one doctor must exist"
    email = doc["email"]

    # Login via /api/auth/login
    res = client.post("/api/auth/login", json={
        "email": email,
        "password": "Doctor@Sushrutha2026!"
    })
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, doc

def test_roster_quick_list():
    """Verify public roster quick list endpoint returns active doctors."""
    res = client.get("/api/doctor-desk/roster-quick-list")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "doctors" in data
    assert len(data["doctors"]) > 0
    first = data["doctors"][0]
    assert "name" in first
    assert "email" in first
    assert "department" in first
    assert "room_number" in first

def test_doctor_me_profile():
    """Verify /api/doctor-desk/me returns clinical profile of logged-in doctor."""
    headers, doc = get_doctor_auth_header()
    res = client.get("/api/doctor-desk/me", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "doctor" in data
    assert "metrics" in data
    assert data["doctor"]["email"].lower() == doc["email"].lower()

def test_doctor_chamber_queue():
    """Verify /api/doctor-desk/queue returns tokens for doctor's department."""
    headers, doc = get_doctor_auth_header()
    res = client.get("/api/doctor-desk/queue", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "tokens" in data
    assert "department" in data
    assert data["department"] == doc["department"]

def test_call_and_start_consultation_flow():
    """Verify doctor can call a token into chamber and start consultation."""
    headers, doc = get_doctor_auth_header()
    
    # Create a fresh test token
    from app.services.queue_service import issue_opd_token
    token_doc = issue_opd_token(
        patient_id="test_patient_doctor_flow",
        patient_name="Praveen Kumar",
        department=doc["department"],
        priority="RED",
        chief_complaint="Severe chest discomfort and dizziness"
    )
    token_id = token_doc["token_id"]

    # 1. Call patient
    call_res = client.post(f"/api/doctor-desk/call/{token_id}", headers=headers)
    assert call_res.status_code == 200
    assert call_res.json()["status"] == "CALLED"

    # 2. Start consultation
    start_res = client.post(f"/api/doctor-desk/start/{token_id}", headers=headers)
    assert start_res.status_code == 200
    assert start_res.json()["status"] == "IN_CONSULTATION"

def test_issue_digital_prescription_and_complete():
    """Verify doctor can build and issue a structured digital prescription."""
    headers, doc = get_doctor_auth_header()
    db = get_database()

    # 1. Register a test patient and consultation
    import time
    t_num = str(int(time.time()))[-8:]
    test_phone = f"98{t_num}"

    p_res = client.post("/api/auth/patient/register", json={
        "full_name": f"Nandini Rao {t_num}",
        "phone": test_phone,
        "email": f"nandini_{t_num}@example.com",
        "password": "Patient@Secure123!",
        "age": 34,
        "gender": "Female",
        "address": "Bangalore"
    })
    assert p_res.status_code == 201, f"Patient registration failed: {p_res.text}"
    p_token = p_res.json()["access_token"]
    patient_id = p_res.json()["user_id"]
    patient_headers = {"Authorization": f"Bearer {p_token}"}

    # Reception check-in required before consultation
    admin_login = client.post("/api/auth/login", json={
        "email": "admin@sushrutha.gov.in",
        "password": "Admin@Sushrutha2026!",
    })
    assert admin_login.status_code == 200, admin_login.text
    admin_h = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}
    gen = client.post("/api/reception/code/generate", headers=admin_h)
    assert gen.status_code == 201, gen.text
    redeem = client.post(
        "/api/patient/checkin",
        json={"code": gen.json()["code"], "hospital_id": "HOSP-BLR-001"},
        headers=patient_headers,
    )
    assert redeem.status_code == 200, redeem.text

    # 2. Patient submits consultation
    consult_res = client.post(
        "/api/patient/consultation",
        headers=patient_headers,
        json={
            "chief_complaint": "High fever, chills, severe body ache and sore throat for 3 days",
            "severity": "severe",
            "duration": "3 days",
            "functional_difficulty": "unable to swallow",
            "additional_notes": "Allergic to penicillin"
        }
    )
    assert consult_res.status_code in [200, 201]
    consult_data = consult_res.json()
    consultation_id = consult_data["id"]
    token_id = consult_data["token"]["token_id"]

    # 3. Doctor prescribes medications
    rx_payload = {
        "consultation_id": consultation_id,
        "token_id": token_id,
        "patient_id": patient_id,
        "patient_name": "Nandini Rao",
        "clinical_diagnosis": "Acute Pharyngotonsillitis with High Pyrexia",
        "icd10_code": "J02.9",
        "clinical_notes": "Pharyngeal erythema with tonsillar exudate. Lungs clear. Vitals: SpO2 98%, Temp 102F.",
        "medications": [
            {
                "medicine_name": "Paracetamol 650mg",
                "dosage": "650 mg",
                "frequency": "1-0-1",
                "timing": "After Food",
                "duration": "5 Days",
                "instructions": "Take with full glass of water. SOS if fever exceeds 100F."
            },
            {
                "medicine_name": "Azithromycin 500mg",
                "dosage": "500 mg",
                "frequency": "1-0-0",
                "timing": "Before Food",
                "duration": "3 Days",
                "instructions": "Complete 3-day antibiotic course strictly."
            },
            {
                "medicine_name": "Cetirizine 10mg",
                "dosage": "10 mg",
                "frequency": "0-0-1",
                "timing": "At Bedtime",
                "duration": "5 Days",
                "instructions": "May cause mild drowsiness."
            }
        ],
        "investigations_advised": [
            "Complete Blood Count (CBC)",
            "Throat Swab Culture"
        ],
        "diet_lifestyle_advice": "Warm salt water gargle 3 times a day. Hydrate with warm fluids and electral.",
        "follow_up_date": "Review after 5 days if fever persists"
    }

    rx_res = client.post("/api/doctor-desk/prescribe", headers=headers, json=rx_payload)
    assert rx_res.status_code == 201, f"Prescription failed: {rx_res.text}"
    rx_data = rx_res.json()
    assert rx_data["prescription_id"].startswith("RX-")
    assert rx_data["clinical_diagnosis"] == "Acute Pharyngotonsillitis with High Pyrexia"
    assert len(rx_data["medications"]) == 3
    assert rx_data["status"] == "ISSUED"

    # 4. Verify token is marked COMPLETED
    from bson import ObjectId
    updated_token = db.opd_tokens.find_one({"_id": ObjectId(token_id)})
    assert updated_token["status"] == "COMPLETED"
    assert updated_token["prescription_id"] == rx_data["prescription_id"]

    # 5. Verify fetch by consultation ID
    fetch_res = client.get(f"/api/doctor-desk/prescriptions/by-consultation/{consultation_id}")
    assert fetch_res.status_code == 200
    assert fetch_res.json()["success"] is True
    assert fetch_res.json()["prescription"]["prescription_id"] == rx_data["prescription_id"]
