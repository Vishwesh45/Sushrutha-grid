import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_database
client = TestClient(app)

def _unlock_victoria(patient_headers):
    """Admin desk code → patient redeem (reception check-in gate)."""
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

def test_patient_consultation_workflow():
    uid1 = str(uuid.uuid4())[:8]
    uid2 = str(uuid.uuid4())[:8]
    email1 = f"patient1_{uid1}@sushrutha.org"
    email2 = f"patient2_{uid2}@sushrutha.org"
    password = "TestPassword123!"

    # 1. Register two patients
    client.post("/api/auth/register", json={"name": "Patient One", "email": email1, "password": password, "role": "patient"})
    client.post("/api/auth/register", json={"name": "Patient Two", "email": email2, "password": password, "role": "patient"})

    # 2. Login as Patient 1
    t1 = client.post("/api/auth/login", json={"email": email1, "password": password}).json()["access_token"]
    h1 = {"Authorization": f"Bearer {t1}"}

    # 3. Login as Patient 2
    t2 = client.post("/api/auth/login", json={"email": email2, "password": password}).json()["access_token"]
    h2 = {"Authorization": f"Bearer {t2}"}

    # 3b. Reception check-in required before consultation
    _unlock_victoria(h1)

    # 4. Patient 1 submits a consultation
    consultation_payload = {
        "chief_complaint": "I have severe pain in my right knee for three days and I cannot walk properly.",
        "symptoms": ["knee pain", "difficulty walking"],
        "severity": "severe",
        "duration": "3 days",
        "functional_difficulty": "difficulty walking",
        "additional_notes": "No prior injury reported."
    }
    submit_res = client.post("/api/patient/consultation", json=consultation_payload, headers=h1)
    assert submit_res.status_code == 201, f"Failed: {submit_res.text}"
    consultation_data = submit_res.json()
    assert consultation_data["chief_complaint"] == consultation_payload["chief_complaint"]
    assert consultation_data["severity"] == "severe"
    assert consultation_data["status"] == "submitted"
    cid = consultation_data["id"]

    # 5. Check MongoDB directly to verify database persistence & hospital event logging
    db = get_database()
    saved_doc = db.consultations.find_one({"_id": db.consultations.find_one({"patient_email": email1})["_id"]})
    assert saved_doc is not None
    assert saved_doc["severity"] == "severe"

    event_doc = db.hospital_events.find_one({"consultation_id": cid, "event_type": "CONSULTATION_SUBMITTED"})
    assert event_doc is not None

    # 6. Patient 1 retrieves their consultation list
    my_res = client.get("/api/patient/consultations/my", headers=h1)
    assert my_res.status_code == 200
    my_list = my_res.json()
    assert len(my_list) >= 1
    assert any(c["id"] == cid for c in my_list)

    # 7. Security check: Patient 2 tries to view Patient 1's consultation (Expect 403 Forbidden)
    forbidden_res = client.get(f"/api/patient/consultations/{cid}", headers=h2)
    assert forbidden_res.status_code == 403, f"Expected 403 for unauthorized patient, got {forbidden_res.status_code}"

    # 8. Patient 1 views their own consultation (Expect 200 OK)
    own_res = client.get(f"/api/patient/consultations/{cid}", headers=h1)
    assert own_res.status_code == 200
    assert own_res.json()["id"] == cid

    print("All Phase 3 Patient Consultation tests passed successfully!")

if __name__ == "__main__":
    test_patient_consultation_workflow()
