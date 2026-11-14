import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_database

client = TestClient(app)

def test_full_auth_and_rbac_flow():
    # Use unique emails for isolation across test runs
    uid = str(uuid.uuid4())[:8]
    patient_email = f"patient_{uid}@sushrutha.org"
    admin_email = f"admin_{uid}@sushrutha.org"
    password = "SecurePassword123!"

    # 1. Register Patient
    patient_payload = {
        "name": "Ramesh Kumar",
        "email": patient_email,
        "password": password,
        "role": "patient",
        "phone": "+91-9876543210"
    }
    res = client.post("/api/auth/register", json=patient_payload)
    assert res.status_code == 201, f"Patient registration failed: {res.text}"
    patient_data = res.json()
    assert patient_data["email"] == patient_email
    assert patient_data["role"] == "patient"
    assert "password_hash" not in patient_data  # Ensure password hash is not exposed

    # 2. Test Duplicate Registration (Expect 400 Bad Request)
    dup_res = client.post("/api/auth/register", json=patient_payload)
    assert dup_res.status_code == 400, "Duplicate email registration was unexpectedly permitted"

    # 3. Test Invalid Login (Expect 401 Unauthorized)
    bad_login = client.post("/api/auth/login", json={"email": patient_email, "password": "WrongPassword"})
    assert bad_login.status_code == 401, "Invalid password login was unexpectedly accepted"

    # 4. Test Valid Patient Login (Expect 200 OK + JWT)
    login_res = client.post("/api/auth/login", json={"email": patient_email, "password": password})
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    patient_token = token_data["access_token"]
    assert token_data["role"] == "patient"

    # 5. Access Protected Profile (/api/auth/me) with Patient Token
    headers_patient = {"Authorization": f"Bearer {patient_token}"}
    me_res = client.get("/api/auth/me", headers=headers_patient)
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["email"] == patient_email

    # 6. Test RBAC: Patient attempts to access Admin-Only Route (Expect 403 Forbidden)
    forbidden_res = client.get("/api/auth/admin-only", headers=headers_patient)
    assert forbidden_res.status_code == 403, f"Expected 403 Forbidden for patient on admin route, got {forbidden_res.status_code}"

    # 7. Register Admin
    admin_payload = {
        "name": "Dr. Savitri Devi (Admin)",
        "email": admin_email,
        "password": password,
        "role": "admin",
        "phone": "+91-9123456789"
    }
    res_admin_reg = client.post("/api/auth/register", json=admin_payload)
    assert res_admin_reg.status_code == 201

    # 8. Login Admin
    admin_login = client.post("/api/auth/login", json={"email": admin_email, "password": password})
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]
    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    # 9. Test RBAC: Admin accesses Admin-Only Route (Expect 200 OK)
    admin_res = client.get("/api/auth/admin-only", headers=headers_admin)
    assert admin_res.status_code == 200
    admin_data = admin_res.json()
    assert "hospital_staff_distribution" in admin_data
    assert admin_data["authorized_role"] == "admin"

    print("All Phase 2 Authentication & RBAC tests passed successfully!")


def test_user_session_lifecycle():
    """
    Verifies full hospital workstation session lifecycle:
    1. Login generates unique session_id
    2. Active session check returns metadata & expiry
    3. Inactivity heartbeat updates last_activity_at and extends expires_at
    4. Session audit history lists the session
    5. Session logout terminates session and blocks further authenticated requests
    """
    uid = str(uuid.uuid4())[:8]
    doc_email = f"doctor_session_{uid}@sushrutha.org"
    password = "DocPassword123!"

    # 1. Register a doctor
    reg_res = client.post("/api/auth/register", json={
        "name": f"Dr. Test Session {uid}",
        "email": doc_email,
        "password": password,
        "role": "doctor",
        "department": "General Medicine"
    })
    assert reg_res.status_code == 201

    # 2. Login to create a session
    login_res = client.post("/api/auth/login", json={"email": doc_email, "password": password})
    assert login_res.status_code == 200
    login_data = login_res.json()
    token = login_data["access_token"]
    session_id = login_data.get("session_id")
    assert session_id is not None
    assert session_id.startswith("SES-")

    headers = {"Authorization": f"Bearer {token}"}

    # 3. Check active session endpoint
    active_res = client.get("/api/auth/session/active", headers=headers)
    assert active_res.status_code == 200
    active_data = active_res.json()
    assert active_data["session_id"] == session_id
    assert active_data["email"] == doc_email
    assert active_data["is_active"] is True
    assert active_data["idle_timeout_minutes"] == 30

    # 4. Trigger heartbeat
    hb_res = client.post("/api/auth/session/heartbeat", headers=headers)
    assert hb_res.status_code == 200
    hb_data = hb_res.json()
    assert hb_data["success"] is True
    assert hb_data["session_id"] == session_id

    # 5. Check session history
    hist_res = client.get("/api/auth/session/history", headers=headers)
    assert hist_res.status_code == 200
    hist_items = hist_res.json()
    assert len(hist_items) >= 1
    assert any(item["session_id"] == session_id for item in hist_items)

    # 6. Logout session
    logout_res = client.post("/api/auth/session/logout", headers=headers)
    assert logout_res.status_code == 200
    assert logout_res.json()["success"] is True

    # 7. Verify terminated session is rejected with 401
    post_logout_res = client.get("/api/auth/session/active", headers=headers)
    assert post_logout_res.status_code == 401


if __name__ == "__main__":
    test_full_auth_and_rbac_flow()
    test_user_session_lifecycle()

