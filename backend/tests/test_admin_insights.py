"""Admin beds / analytics / audit — require admin JWT."""
import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_database

client = TestClient(app)


def _admin_token():
    # Prefer seeded admin; fall back to register+promote not needed if seed works
    res = client.post("/api/auth/login", json={
        "email": "admin@sushrutha.gov.in",
        "password": "Admin@Sushrutha2026!",
    })
    if res.status_code == 200:
        return res.json()["access_token"]
    # Create admin-like via general register then force role in DB for test
    uid = str(uuid.uuid4())[:8]
    email = f"admin_test_{uid}@sushrutha.org"
    client.post("/api/auth/register", json={
        "name": "Test Admin",
        "email": email,
        "password": "AdminTest123!",
        "role": "admin",
    })
    db = get_database()
    db.users.update_one({"email": email}, {"$set": {"role": "admin"}})
    login = client.post("/api/auth/login", json={"email": email, "password": "AdminTest123!"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def test_beds_analytics_audit_require_auth():
    assert client.get("/api/admin/beds").status_code in (401, 403)
    assert client.get("/api/admin/hospital-analytics").status_code in (401, 403)
    assert client.get("/api/admin/audit-logs").status_code in (401, 403)


def test_admin_insights_live():
    token = _admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    beds = client.get("/api/admin/beds", headers=headers)
    assert beds.status_code == 200, beds.text
    body = beds.json()["data"]
    assert body["total_beds"] >= 1
    assert len(body["wards"]) >= 1

    ward_id = body["wards"][0]["ward_id"]
    total = body["wards"][0]["total_beds"]
    patch = client.patch(
        f"/api/admin/beds/{ward_id}",
        headers=headers,
        json={"occupied_beds": min(1, total), "total_beds": total},
    )
    assert patch.status_code == 200, patch.text

    analytics = client.get("/api/admin/hospital-analytics", headers=headers)
    assert analytics.status_code == 200, analytics.text
    assert "doctors" in analytics.json()["data"]
    assert "opd_today" in analytics.json()["data"]

    audit = client.get("/api/admin/audit-logs", headers=headers)
    assert audit.status_code == 200, audit.text
    assert "events" in audit.json()["data"]


def test_volunteer_list_requires_admin():
    assert client.get("/api/admin/volunteers/requisitions").status_code in (401, 403)
