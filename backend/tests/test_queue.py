import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_database

client = TestClient(app)

import uuid

@pytest.fixture(scope="module")
def setup_test_auth():
    """Generates auth headers for admin and a registered test patient."""
    uid = str(uuid.uuid4())[:8]
    p_email = f"queue_patient_{uid}@sushrutha.org"
    p_pass = "TestPassword123!"

    # Register patient
    client.post("/api/auth/register", json={
        "name": "Queue Test Patient",
        "email": p_email,
        "password": p_pass,
        "role": "patient"
    })

    # Patient login
    patient_res = client.post("/api/auth/login", json={
        "email": p_email,
        "password": p_pass
    })
    patient_token = patient_res.json().get("access_token")
    patient_headers = {"Authorization": f"Bearer {patient_token}"}

    # Admin login
    admin_res = client.post("/api/auth/login", json={
        "email": "admin@sushrutha.gov.in",
        "password": "Admin@Sushrutha2026!"
    })
    admin_token = admin_res.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    return {
        "patient": patient_headers,
        "admin": admin_headers
    }

def test_token_creation_and_routing_lifecycle(setup_test_auth):
    headers_patient = setup_test_auth["patient"]
    headers_admin = setup_test_auth["admin"]

    # 1. Direct Token Creation via /api/queue/tokens
    create_payload = {
        "patient_name": "Test Patient Queue",
        "chief_complaint": "Acute crushing retrosternal chest pain with diaphoresis",
        "symptoms": ["chest pain", "sweating", "shortness of breath"],
        "department": "Cardiology",
        "priority": "RED"
    }
    res = client.post("/api/queue/tokens", json=create_payload, headers=headers_patient)
    assert res.status_code == 201, res.text
    token_data = res.json()
    
    assert token_data["token_number"].startswith("CD-")
    assert token_data["priority"] == "RED"
    assert token_data["priority_rank"] == 1
    assert token_data["status"] == "WAITING"
    assert token_data["assigned_room"] is not None
    assert token_data["hospital_id"] == "HOSP-BLR-001"
    assert token_data["queue_position"] >= 1
    assert token_data["estimated_wait_minutes"] is not None
    assert "XAI Chamber Routing" in (token_data.get("assignment_rationale") or "")
    token_id = token_data["token_id"]

    # 2. Verify in Live Queue
    live_res = client.get("/api/queue/live?department=Cardiology")
    assert live_res.status_code == 200
    live_tokens = live_res.json()
    assert any(t["token_id"] == token_id for t in live_tokens)

    # 3. Call Token (WAITING -> CALLED)
    call_res = client.post(f"/api/queue/tokens/{token_id}/call", json={"counter_or_room": "Cardiac Chamber 102"}, headers=headers_admin)
    assert call_res.status_code == 200
    called_data = call_res.json()
    assert called_data["status"] == "CALLED"
    assert called_data["called_at"] is not None

    # 4. Start Consultation (CALLED -> IN_CONSULTATION)
    start_res = client.post(f"/api/queue/tokens/{token_id}/start", headers=headers_admin)
    assert start_res.status_code == 200
    start_data = start_res.json()
    assert start_data["status"] == "IN_CONSULTATION"
    assert start_data["consultation_started_at"] is not None
    assert start_data["actual_wait_minutes"] is not None

    # 5. Complete Consultation (IN_CONSULTATION -> COMPLETED)
    comp_res = client.post(f"/api/queue/tokens/{token_id}/complete", json={"doctor_notes": "ECG performed, admitted to ICCU"}, headers=headers_admin)
    assert comp_res.status_code == 200
    comp_data = comp_res.json()
    assert comp_data["status"] == "COMPLETED"
    assert comp_data["completed_at"] is not None
    assert comp_data["actual_consult_minutes"] is not None

def test_auto_token_issue_on_consultation_submission(setup_test_auth):
    headers_patient = setup_test_auth["patient"]
    headers_admin = setup_test_auth["admin"]

    # Reception check-in unlocks consultation intake
    gen = client.post("/api/reception/code/generate", headers=headers_admin)
    assert gen.status_code == 201, gen.text
    redeem = client.post(
        "/api/patient/checkin",
        json={"code": gen.json()["code"], "hospital_id": "HOSP-BLR-001"},
        headers=headers_patient,
    )
    assert redeem.status_code == 200, redeem.text

    consult_payload = {
        "chief_complaint": "Persistent high fever and joint pain for three days",
        "severity": "moderate",
        "duration": "3 days",
        "functional_difficulty": "unable to walk briskly"
    }
    res = client.post("/api/patient/consultation", json=consult_payload, headers=headers_patient)
    assert res.status_code == 201, res.text
    data = res.json()

    # Verify that token was automatically generated and returned
    assert data["token_number"] is not None
    assert data["assigned_room"] is not None
    assert data["status"] in ["submitted", "queued"]

    # Verify Summary Endpoint
    summary_res = client.get("/api/queue/summary")
    assert summary_res.status_code == 200
    sum_data = summary_res.json()
    assert sum_data["total_tokens_today"] >= 1
    assert "waiting_count" in sum_data
    assert "avg_wait_minutes" in sum_data

def test_admin_token_analytics_filters(setup_test_auth):
    headers_admin = setup_test_auth["admin"]

    # Test Today filter
    res_today = client.get("/api/queue/analytics?timeframe=today", headers=headers_admin)
    assert res_today.status_code == 200, res_today.text
    data_today = res_today.json()
    assert data_today["timeframe"] == "today"
    assert data_today["total_tokens"] >= 1
    assert "department_distribution" in data_today
    assert "severity_distribution" in data_today
    assert isinstance(data_today["tokens"], list)

    # Test Month filter
    res_month = client.get("/api/queue/analytics?timeframe=month", headers=headers_admin)
    assert res_month.status_code == 200
    data_month = res_month.json()
    assert data_month["timeframe"] == "month"
    assert data_month["total_tokens"] >= 1

    # Test Department filter
    res_dept = client.get("/api/queue/analytics?timeframe=all&department=Cardiology", headers=headers_admin)
    assert res_dept.status_code == 200
    data_dept = res_dept.json()
    assert all("Cardiology" in t["department"] for t in data_dept["tokens"])

def test_token_skip_and_rejoin_grace_lifecycle(setup_test_auth):
    """
    Validates Step 3 Interactive Queue Engine:
    - Doctor marks absent patient as SKIPPED (with grace period).
    - Patient re-joins active queue back to WAITING without losing their consultation registration.
    """
    headers_patient = setup_test_auth["patient"]
    headers_admin = setup_test_auth["admin"]

    create_payload = {
        "patient_name": "Grace Period Patient",
        "chief_complaint": "Persistent headache and blurred vision for 1 day",
        "department": "Neurology",
        "priority": "AMBER"
    }
    res = client.post("/api/queue/tokens", json=create_payload, headers=headers_patient)
    assert res.status_code == 201
    token_id = res.json()["token_id"]

    # 1. Doctor calls token
    call_res = client.post(f"/api/queue/tokens/{token_id}/call", headers=headers_admin)
    assert call_res.status_code == 200
    assert call_res.json()["status"] == "CALLED"

    # 2. Patient absent -> Doctor marks SKIPPED
    skip_res = client.post(f"/api/queue/tokens/{token_id}/skip", headers=headers_admin)
    assert skip_res.status_code == 200
    skip_data = skip_res.json()
    assert skip_data["status"] == "SKIPPED"
    assert skip_data["skipped_at"] is not None

    # 3. Patient re-joins queue within grace window
    rejoin_res = client.post(f"/api/queue/tokens/{token_id}/rejoin", headers=headers_patient)
    assert rejoin_res.status_code == 200
    rejoin_data = rejoin_res.json()
    assert rejoin_data["status"] == "WAITING"
    assert rejoin_data["rejoined_at"] is not None

