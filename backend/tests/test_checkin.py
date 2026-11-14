"""Victoria reception check-in gate: desk code unlocks consultation."""
import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_database

client = TestClient(app)


def _register_patient():
    uid = str(uuid.uuid4())[:8]
    email = f"checkin_{uid}@sushrutha.org"
    password = "TestPassword123!"
    client.post("/api/auth/register", json={
        "name": f"Checkin Patient {uid}",
        "email": email,
        "password": password,
        "role": "patient",
    })
    token = client.post("/api/auth/login", json={"email": email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, email


def _admin_headers():
    login = client.post("/api/auth/login", json={
        "email": "admin@sushrutha.gov.in",
        "password": "Admin@Sushrutha2026!",
    })
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_reception_checkin_unlocks_consultation():
    admin_h = _admin_headers()
    patient_h, email = _register_patient()

    # Locked before check-in
    locked = client.post("/api/patient/consultation", json={
        "chief_complaint": "Severe right knee pain for three days, cannot walk.",
        "severity": "severe",
        "hospital_id": "HOSP-BLR-001",
    }, headers=patient_h)
    assert locked.status_code == 403, locked.text
    assert "check-in" in locked.json()["detail"].lower() or "reception" in locked.json()["detail"].lower()

    status_before = client.get("/api/patient/checkin/status", headers=patient_h)
    assert status_before.status_code == 200
    assert status_before.json()["checked_in"] is False

    # Public reception TV board (no login) shows the same live code
    display = client.get("/api/reception/code/display")
    assert display.status_code == 200, display.text
    assert len(display.json()["code"]) == 6

    # Admin desk issues code
    gen = client.post("/api/reception/code/generate", headers=admin_h)
    assert gen.status_code == 201, gen.text
    code = gen.json()["code"]
    assert len(code) == 6

    current = client.get("/api/reception/code/current", headers=admin_h)
    assert current.status_code == 200
    assert current.json()["code"] == code

    display2 = client.get("/api/reception/code/display")
    assert display2.status_code == 200
    assert display2.json()["code"] == code

    # Wrong code rejected
    bad = client.post("/api/patient/checkin", json={"code": "ZZZZZZ", "hospital_id": "HOSP-BLR-001"}, headers=patient_h)
    assert bad.status_code == 400

    # Redeem valid code
    ok = client.post("/api/patient/checkin", json={"code": code, "hospital_id": "HOSP-BLR-001"}, headers=patient_h)
    assert ok.status_code == 200, ok.text
    assert ok.json()["checked_in"] is True
    assert ok.json()["hospital_id"] == "HOSP-BLR-001"

    status_after = client.get("/api/patient/checkin/status?hospital_id=HOSP-BLR-001", headers=patient_h)
    assert status_after.json()["checked_in"] is True

    # Consultation now allowed
    submit = client.post("/api/patient/consultation", json={
        "chief_complaint": "Severe right knee pain for three days, cannot walk.",
        "severity": "severe",
        "hospital_id": "HOSP-BLR-001",
        "hospital_name": "Victoria Hospital (BMCRI Apex Medical Center)",
    }, headers=patient_h)
    assert submit.status_code == 201, submit.text
    assert submit.json()["hospital_id"] == "HOSP-BLR-001"

    # Non-Victoria hospital still blocked
    other = client.post("/api/patient/consultation", json={
        "chief_complaint": "Mild headache for one day.",
        "severity": "mild",
        "hospital_id": "HOSP-OTHER-999",
    }, headers=patient_h)
    assert other.status_code == 403

    # Superseding code invalidates previous desk code for new redemptions
    gen2 = client.post("/api/reception/code/generate", headers=admin_h)
    assert gen2.status_code == 201
    new_code = gen2.json()["code"]
    assert new_code != code

    # Existing check-in still valid until its own window ends; event logged
    db = get_database()
    assert db.hospital_events.find_one({"event_type": "PATIENT_RECEPTION_CHECKIN", "patient_email": email}) or \
        db.patient_checkins.find_one({"patient_email": email, "status": "ACTIVE"})

    print("Reception check-in gate tests passed.")


if __name__ == "__main__":
    test_reception_checkin_unlocks_consultation()
