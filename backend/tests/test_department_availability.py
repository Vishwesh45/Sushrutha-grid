"""Option A: NLP always runs; token only if hospital roster has the routed department."""
import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.services.department_availability_service import check_department_availability
from app.services.semantic_nlp_service import perform_semantic_clinical_analysis

client = TestClient(app)


def _unlock_patient():
    uid = str(uuid.uuid4())[:8]
    email = f"deptavail_{uid}@sushrutha.org"
    password = "TestPassword123!"
    client.post("/api/auth/register", json={
        "name": f"Dept Patient {uid}",
        "email": email,
        "password": password,
        "role": "patient",
    })
    token = client.post("/api/auth/login", json={"email": email, "password": password}).json()["access_token"]
    patient_h = {"Authorization": f"Bearer {token}"}

    admin = client.post("/api/auth/login", json={
        "email": "admin@sushrutha.gov.in",
        "password": "Admin@Sushrutha2026!",
    })
    admin_h = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    code = client.post("/api/reception/code/generate", headers=admin_h).json()["code"]
    redeem = client.post("/api/patient/checkin", json={"code": code, "hospital_id": "HOSP-BLR-001"}, headers=patient_h)
    assert redeem.status_code == 200, redeem.text
    return patient_h


def test_victoria_has_obgyn_for_pcod_path():
    """PCOD routes to OB-GYN; Victoria roster includes OB-GYN → token allowed."""
    nlp = perform_semantic_clinical_analysis(
        "Irregular periods delayed by 2 months, excess facial hair on chin, and sudden weight gain for past 6 months",
        "moderate",
    )
    assert nlp["pcod_evaluation"]["is_pcod_suspected"] is True
    assert "Obstetrics" in nlp["recommended_department"]

    avail = check_department_availability(
        hospital_id="HOSP-BLR-001",
        department=nlp["recommended_department"],
    )
    assert avail["available"] is True
    assert avail["can_issue_token"] is True


def test_psychiatry_unavailable_at_victoria_with_recommendations():
    """Psychiatry is analysed but Victoria has no Psychiatry roster doctors."""
    nlp = perform_semantic_clinical_analysis(
        "I have severe depression and anxiety with panic attacks for three weeks",
        "severe",
    )
    assert nlp["recommended_department"] == "Psychiatry"

    avail = client.get(
        "/api/hospitals/department-availability",
        params={"department": "Psychiatry", "hospital_id": "HOSP-BLR-001"},
    )
    assert avail.status_code == 200, avail.text
    data = avail.json()
    assert data["available"] is False
    assert data["can_issue_token"] is False
    assert len(data["recommended_hospitals"]) >= 1
    assert any("NIMHANS" in (h.get("name") or "") for h in data["recommended_hospitals"])


def test_consultation_referred_external_when_department_missing():
    patient_h = _unlock_patient()
    res = client.post("/api/patient/consultation", json={
        "chief_complaint": "I have severe depression and anxiety with panic attacks for three weeks",
        "severity": "severe",
        "hospital_id": "HOSP-BLR-001",
        "hospital_name": "Victoria Hospital (BMCRI Apex Medical Center)",
    }, headers=patient_h)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "referred_external"
    assert body["department_available"] is False
    assert body["token_number"] is None
    assert body["token"] is None
    assert body["recommended_hospitals"]
    assert "Psychiatry" in (body["department"] or "")


def test_pcod_consultation_still_gets_token_at_victoria():
    patient_h = _unlock_patient()
    res = client.post("/api/patient/consultation", json={
        "chief_complaint": "Irregular periods delayed by 2 months, excess facial hair on chin, and sudden weight gain for past 6 months",
        "severity": "moderate",
        "hospital_id": "HOSP-BLR-001",
    }, headers=patient_h)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["department_available"] is not False
    assert body["token_number"] is not None
    assert "Obstetrics" in (body["department"] or "")
