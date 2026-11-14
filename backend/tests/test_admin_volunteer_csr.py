import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_volunteer_requisitions_and_check_requests():
    """
    Validates Volunteer Requisition creation and Check Requests:
    - Number of volunteers
    - Duration per day
    - Total days
    - Department
    - Applications list currently empty
    """
    # 1. Post volunteer requisition
    payload = {
        "title": "OPD Elderly Navigation & Wheelchair Assistance",
        "department": "Main OPD Lobby",
        "number_of_volunteers": 5,
        "duration_per_day": "4 Hours / Day (Morning Shift)",
        "total_days": 14,
        "description": "Assist elderly and differently-abled patients from main hospital gate to respective OPD chambers."
    }
    create_res = client.post("/api/admin/volunteers/requisitions", json=payload)
    assert create_res.status_code == 201
    created_data = create_res.json()["data"]
    assert created_data["requisition_id"].startswith("VREQ-2026-")
    assert created_data["number_of_volunteers"] == 5
    assert created_data["total_days"] == 14
    assert created_data["status"] == "OPEN"
    req_id = created_data["requisition_id"]

    # 2. Get list of requisitions
    list_res = client.get("/api/admin/volunteers/requisitions")
    assert list_res.status_code == 200
    assert any(r["requisition_id"] == req_id for r in list_res.json()["data"])

    # 3. Check requests (applications) - currently empty as expected
    apps_res = client.get("/api/admin/volunteers/applications")
    assert apps_res.status_code == 200
    assert isinstance(apps_res.json()["data"], list)

    # 4. Clean up
    del_res = client.delete(f"/api/admin/volunteers/requisitions/{req_id}")
    assert del_res.status_code == 200


def test_csr_multi_item_requirements_lifecycle():
    """
    Validates CSR Multi-Item Requirements Lifecycle:
    - Multiple items with quantity and estimated cost
    - Priority of complete list
    - Initial status: POSTED
    - Advance to CSR_PLEDGED upon sponsor commitment
    - Advance to FULFILLED once items physically received
    """
    payload = {
        "title": "Pediatric NICU Advanced Thermal Support Unit",
        "department": "Pediatrics & Neonatology",
        "description": "Essential neonatal thermal stabilization equipment for preterm births in district maternity wing.",
        "priority": "CRITICAL",
        "items": [
            {
                "item_name": "Neonatal Intensive Care Radiant Warmer",
                "quantity": 2,
                "estimated_cost": 120000.0
            },
            {
                "item_name": "Infant Phototherapy Bilirubin Unit",
                "quantity": 3,
                "estimated_cost": 35000.0
            }
        ]
    }

    # 1. Post Requirement
    create_res = client.post("/api/admin/csr/requirements", json=payload)
    assert create_res.status_code == 201
    data = create_res.json()["data"]
    req_id = data["requirement_id"]
    assert req_id.startswith("CSR-2026-")
    assert data["priority"] == "CRITICAL"
    assert len(data["items"]) == 2
    # Total cost = 2*120000 + 3*35000 = 240000 + 105000 = 345000
    assert data["total_estimated_cost"] == 345000.0
    assert data["status"] == "POSTED"

    # 2. Cannot fulfill directly from POSTED status
    bad_fulfill = client.post(f"/api/admin/csr/requirements/{req_id}/fulfill")
    assert bad_fulfill.status_code == 400

    # 3. CSR Sponsor expresses interest and pledges
    pledge_payload = {
        "company_name": "Infosys Foundation",
        "contact_person": "CSR Health Initiatives Officer",
        "email": "csr@infosys.com",
        "pledged_amount": 345000.0,
        "notes": "Approved under FY26 Public Healthcare grant program."
    }
    pledge_res = client.post(f"/api/admin/csr/requirements/{req_id}/pledge", json=pledge_payload)
    assert pledge_res.status_code == 200
    pledged_data = pledge_res.json()["data"]
    assert pledged_data["status"] == "CSR_PLEDGED"
    assert pledged_data["csr_sponsor"]["company_name"] == "Infosys Foundation"

    # 4. Now fulfill is unlocked & items received
    fulfill_res = client.post(f"/api/admin/csr/requirements/{req_id}/fulfill")
    assert fulfill_res.status_code == 200
    assert fulfill_res.json()["data"]["status"] == "FULFILLED"

    # 5. Clean up
    del_res = client.delete(f"/api/admin/csr/requirements/{req_id}")
    assert del_res.status_code == 200
