import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_doctors_summary():
    """
    Validates GET /api/doctors/summary endpoint.
    Ensures all 12 departments have Junior and Senior doctors populated in MongoDB.
    """
    response = client.get("/api/doctors/summary")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    
    totals = data["hospital_totals"]
    assert totals["total_doctors"] >= 40
    assert totals["junior_doctors"] >= 24
    assert totals["senior_doctors"] >= 15
    assert totals["departments_count"] == 12

def test_filter_doctors_by_department():
    """
    Validates filtering doctors by department (e.g. Orthopedics).
    """
    response = client.get("/api/doctors?department=Orthopedics")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["total_count"] >= 4
    
    for doc in data["data"]:
        assert doc["department"] == "Orthopedics"
        assert doc["tier"] in ["JUNIOR_DOCTOR", "SENIOR_DOCTOR"]

def test_filter_doctors_by_tier():
    """
    Validates filtering doctors by tier (JUNIOR_DOCTOR vs SENIOR_DOCTOR).
    """
    response = client.get("/api/doctors?tier=SENIOR_DOCTOR")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["total_count"] >= 15
    for doc in data["data"]:
        assert doc["tier"] == "SENIOR_DOCTOR"

def test_get_doctor_by_id():
    """
    Validates fetching a specific doctor profile by doctor_id.
    """
    response = client.get("/api/doctors/DOC_MED_SR_01")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    doc = data["data"]
    assert doc["doctor_id"] == "DOC_MED_SR_01"
    assert "Rajesh Sharma" in doc["name"]
    assert doc["department"] == "General Medicine"

def test_update_doctor_status():
    """
    Validates updating a doctor's availability status.
    """
    patch_res = client.patch("/api/doctors/DOC_MED_JR_01/status", json={"status": "BUSY"})
    assert patch_res.status_code == 200
    
    get_res = client.get("/api/doctors/DOC_MED_JR_01")
    assert get_res.json()["data"]["status"] == "BUSY"
    
    # Revert back
    revert_res = client.patch("/api/doctors/DOC_MED_JR_01/status", json={"status": "AVAILABLE"})
    assert revert_res.status_code == 200

def test_doctor_crud_lifecycle():
    """
    Validates complete dynamic CRUD lifecycle:
    1. Create new Doctor (Permanent / Contract)
    2. Retrieve by ID
    3. Update doctor details (qualification, shift, employment_type)
    4. Delete doctor from roster
    """
    new_doc_payload = {
        "name": "Dr. Test Specialist",
        "department": "Cardiology",
        "tier": "SENIOR_DOCTOR",
        "designation": "Visiting Consultant",
        "qualification": "MBBS, MD, DM",
        "experience_years": 8,
        "room_number": "Chamber 205",
        "opd_days": ["Monday", "Wednesday", "Friday"],
        "shift": "Morning (09:00 - 14:00)",
        "email": "dr.test.specialist@sushrutha.gov.in",
        "phone": "+91-9876543210",
        "employment_type": "CONTRACT_TEMPORARY",
        "status": "AVAILABLE",
        "max_active_patients": 12
    }

    # 1. Create
    create_res = client.post("/api/doctors/", json=new_doc_payload)
    assert create_res.status_code == 201
    created_data = create_res.json()["data"]
    doc_id = created_data["doctor_id"]
    assert doc_id.startswith("DOC_CARD_SR_")
    assert created_data["employment_type"] == "CONTRACT_TEMPORARY"

    # 2. Get by ID
    get_res = client.get(f"/api/doctors/{doc_id}")
    assert get_res.status_code == 200
    assert get_res.json()["data"]["name"] == "Dr. Test Specialist"

    # 3. Update
    update_payload = {
        "designation": "Permanent Professor & Head",
        "employment_type": "PERMANENT",
        "room_number": "Chamber 301",
        "experience_years": 10
    }
    put_res = client.put(f"/api/doctors/{doc_id}", json=update_payload)
    assert put_res.status_code == 200
    updated_data = put_res.json()["data"]
    assert updated_data["designation"] == "Permanent Professor & Head"
    assert updated_data["employment_type"] == "PERMANENT"
    assert updated_data["room_number"] == "Chamber 301"
    assert updated_data["experience_years"] == 10

    # 4. Delete
    delete_res = client.delete(f"/api/doctors/{doc_id}")
    assert delete_res.status_code == 200
    assert delete_res.json()["success"] is True

    # 5. Confirm Deleted
    not_found_res = client.get(f"/api/doctors/{doc_id}")
    assert not_found_res.status_code == 404

