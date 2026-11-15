from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _admin_headers():
    res = client.post("/api/auth/login", json={
        "email": "admin@sushrutha.gov.in",
        "password": "Admin@Sushrutha2026!",
    })
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_volunteer_requisitions_and_check_requests():
    """
    Validates Volunteer Requisition creation and Check Requests with admin auth.
    """
    headers = _admin_headers()
    payload = {
        "title": "OPD Elderly Navigation & Wheelchair Assistance",
        "department": "Main OPD Lobby",
        "number_of_volunteers": 5,
        "duration_per_day": "4 Hours / Day (Morning Shift)",
        "total_days": 14,
        "description": "Assist elderly and differently-abled patients from main hospital gate to respective OPD chambers."
    }
    create_res = client.post("/api/admin/volunteers/requisitions", json=payload, headers=headers)
    assert create_res.status_code == 201
    created_data = create_res.json()["data"]
    assert created_data["requisition_id"].startswith("VREQ-2026-")
    assert created_data["number_of_volunteers"] == 5
    assert created_data["total_days"] == 14
    assert created_data["status"] == "OPEN"
    req_id = created_data["requisition_id"]

    list_res = client.get("/api/admin/volunteers/requisitions", headers=headers)
    assert list_res.status_code == 200
    assert any(r["requisition_id"] == req_id for r in list_res.json()["data"])

    apps_res = client.get("/api/admin/volunteers/applications", headers=headers)
    assert apps_res.status_code == 200
    assert isinstance(apps_res.json()["data"], list)

    del_res = client.delete(f"/api/admin/volunteers/requisitions/{req_id}", headers=headers)
    assert del_res.status_code == 200


def test_csr_multi_item_requirements_lifecycle():
    """
    Validates CSR Multi-Item Requirements Lifecycle with admin auth.
    """
    headers = _admin_headers()
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

    create_res = client.post("/api/admin/csr/requirements", json=payload, headers=headers)
    assert create_res.status_code == 201
    data = create_res.json()["data"]
    req_id = data["requirement_id"]
    assert req_id.startswith("CSR-2026-")
    assert data["priority"] == "CRITICAL"
    assert len(data["items"]) == 2
    assert data["total_estimated_cost"] == 345000.0
    assert data["status"] == "POSTED"

    bad_fulfill = client.post(f"/api/admin/csr/requirements/{req_id}/fulfill", headers=headers)
    assert bad_fulfill.status_code == 400

    pledge_payload = {
        "company_name": "Infosys Foundation",
        "contact_person": "CSR Health Initiatives Officer",
        "email": "csr@infosys.com",
        "pledged_amount": 345000.0,
        "notes": "Approved under FY26 Public Healthcare grant program."
    }
    pledge_res = client.post(
        f"/api/admin/csr/requirements/{req_id}/pledge",
        json=pledge_payload,
        headers=headers,
    )
    assert pledge_res.status_code == 200
    pledged_data = pledge_res.json()["data"]
    assert pledged_data["status"] == "CSR_PLEDGED"
    assert pledged_data["csr_sponsor"]["company_name"] == "Infosys Foundation"

    fulfill_res = client.post(f"/api/admin/csr/requirements/{req_id}/fulfill", headers=headers)
    assert fulfill_res.status_code == 200
    assert fulfill_res.json()["data"]["status"] == "FULFILLED"

    del_res = client.delete(f"/api/admin/csr/requirements/{req_id}", headers=headers)
    assert del_res.status_code == 200


def test_csr_interest_accept_reject_pipeline():
    """
    CSR portal Express interest → admin Accept locks CSR_PLEDGED;
    sibling PENDING interests are rejected; then FULFILLED.
    """
    import uuid

    headers = _admin_headers()
    uid = uuid.uuid4().hex[:8]
    csr_email = f"csr_pipeline_{uid}@example.com"
    csr_pw = "CsrTest123!"

    reg = client.post("/api/auth/register", json={
        "name": f"Test Foundation {uid}",
        "email": csr_email,
        "password": csr_pw,
        "role": "csr",
        "department": "CSR Desk",
    })
    assert reg.status_code in (200, 201), reg.text
    csr_login = client.post("/api/auth/login", json={"email": csr_email, "password": csr_pw})
    assert csr_login.status_code == 200, csr_login.text
    csr_headers = {"Authorization": f"Bearer {csr_login.json()['access_token']}"}

    # Second company for sibling reject
    csr2_email = f"csr_pipeline_b_{uid}@example.com"
    reg2 = client.post("/api/auth/register", json={
        "name": f"Alt Foundation {uid}",
        "email": csr2_email,
        "password": csr_pw,
        "role": "csr",
    })
    assert reg2.status_code in (200, 201), reg2.text
    csr2_login = client.post("/api/auth/login", json={"email": csr2_email, "password": csr_pw})
    assert csr2_login.status_code == 200
    csr2_headers = {"Authorization": f"Bearer {csr2_login.json()['access_token']}"}

    create_res = client.post("/api/admin/csr/requirements", json={
        "title": f"CSR Interest Pipeline Kit {uid}",
        "department": "General Medicine",
        "description": "Pipeline test equipment list for interest accept/reject sync.",
        "priority": "HIGH",
        "items": [{"item_name": "Pulse Oximeter Pack", "quantity": 5, "estimated_cost": 4000.0}],
    }, headers=headers)
    assert create_res.status_code == 201, create_res.text
    req_id = create_res.json()["data"]["requirement_id"]

    interest1 = client.post(
        f"/api/partners/csr/listings/{req_id}/interest",
        json={"pledged_amount": 20000.0, "notes": "Primary interest"},
        headers=csr_headers,
    )
    assert interest1.status_code == 201, interest1.text
    i1 = interest1.json()["data"]
    assert i1["status"] == "PENDING"
    interest_id = i1["interest_id"]

    # Duplicate pending blocked
    dup = client.post(
        f"/api/partners/csr/listings/{req_id}/interest",
        json={"notes": "dup"},
        headers=csr_headers,
    )
    assert dup.status_code == 400

    interest2 = client.post(
        f"/api/partners/csr/listings/{req_id}/interest",
        json={"pledged_amount": 18000.0},
        headers=csr2_headers,
    )
    assert interest2.status_code == 201, interest2.text
    i2_id = interest2.json()["data"]["interest_id"]

    inbox = client.get("/api/admin/csr/interests", headers=headers)
    assert inbox.status_code == 200
    ids = {row["interest_id"] for row in inbox.json()["data"]}
    assert interest_id in ids and i2_id in ids

    mine = client.get("/api/partners/csr/my-interests", headers=csr_headers)
    assert mine.status_code == 200
    assert any(r["interest_id"] == interest_id for r in mine.json()["data"])

    accept = client.post(f"/api/admin/csr/interests/{interest_id}/accept", headers=headers)
    assert accept.status_code == 200, accept.text
    body = accept.json()["data"]
    assert body["requirement"]["status"] == "CSR_PLEDGED"
    assert body["requirement"]["csr_sponsor"]["company_name"].startswith("Test Foundation")
    assert body["interest"]["status"] == "ACCEPTED"

    # Sibling rejected
    inbox2 = client.get("/api/admin/csr/interests", headers=headers)
    by_id = {r["interest_id"]: r for r in inbox2.json()["data"]}
    assert by_id[i2_id]["status"] == "REJECTED"

    # Requirement no longer accepts interest
    late = client.post(
        f"/api/partners/csr/listings/{req_id}/interest",
        json={"notes": "too late"},
        headers=csr2_headers,
    )
    assert late.status_code == 400

    fulfill = client.post(f"/api/admin/csr/requirements/{req_id}/fulfill", headers=headers)
    assert fulfill.status_code == 200
    assert fulfill.json()["data"]["status"] == "FULFILLED"

    client.delete(f"/api/admin/csr/requirements/{req_id}", headers=headers)
