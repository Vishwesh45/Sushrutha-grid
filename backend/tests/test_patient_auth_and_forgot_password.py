import uuid
import random
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_database

client = TestClient(app)


def test_patient_registration_and_login_flow():
    uid = str(uuid.uuid4())[:6]
    phone = str(random.randint(9100000000, 9999999999))  # Guaranteed 10 digits starting 9
    email = f"patient_{uid}@sushrutha.org"
    password = "MySecurePassword123"

    # 1. Register Patient
    reg_payload = {
        "full_name": "Suresh Gowda",
        "phone": phone,
        "email": email,
        "password": password,
        "age": 42,
        "gender": "Male",
        "address": "Malleshwaram, Bangalore",
    }
    reg_res = client.post("/api/auth/patient/register", json=reg_payload)
    assert reg_res.status_code == 201, f"Registration failed: {reg_res.text}"
    data = reg_res.json()
    assert "access_token" in data
    assert data["name"] == "Suresh Gowda"
    assert data["phone"] == phone
    assert data["uhid"].startswith("SG-")
    assert data["role"] == "patient"
    assigned_uhid = data["uhid"]

    # 2. Duplicate Mobile Prevention (Expect 400)
    dup_res = client.post("/api/auth/patient/register", json=reg_payload)
    assert dup_res.status_code == 400

    # 2b. Bad phone rejected
    bad_phone = client.post("/api/auth/patient/register", json={
        **reg_payload,
        "phone": "12345",
        "email": f"bad_{uid}@sushrutha.org",
    })
    assert bad_phone.status_code in (400, 422)

    # 3. Login using Phone Number
    login_phone_res = client.post("/api/auth/patient/login", json={
        "identifier": phone,
        "password": password,
    })
    assert login_phone_res.status_code == 200
    phone_token_data = login_phone_res.json()
    assert phone_token_data["uhid"] == assigned_uhid
    assert phone_token_data["name"] == "Suresh Gowda"

    # 4. Login using Email Address
    login_email_res = client.post("/api/auth/patient/login", json={
        "identifier": email,
        "password": password,
    })
    assert login_email_res.status_code == 200
    assert login_email_res.json()["uhid"] == assigned_uhid

    # 4b. Empty password rejected
    empty_pw = client.post("/api/auth/patient/login", json={
        "identifier": email,
        "password": "",
    })
    assert empty_pw.status_code in (400, 422)

    # 5. Forgot Password — unregistered rejected
    unknown = client.post("/api/auth/forgot-password", json={"email": f"missing_{uid}@sushrutha.org"})
    assert unknown.status_code == 404

    # 6. Forgot Password — registered sends (OTP never in API body)
    forgot_res = client.post("/api/auth/forgot-password", json={"email": email})
    assert forgot_res.status_code == 200, forgot_res.text
    forgot_data = forgot_res.json()
    assert forgot_data["status"] == "success"
    assert "dev_otp" not in forgot_data
    assert "otp" not in forgot_data

    db = get_database()
    user = db.users.find_one({"email": email})
    assert user and user.get("reset_otp")
    otp = user["reset_otp"]
    assert len(otp) == 6

    # 7. Reset Password with OTP
    new_password = "BrandNewPassword2026!"
    reset_res = client.post("/api/auth/reset-password", json={
        "email": email,
        "otp": otp,
        "new_password": new_password,
    })
    assert reset_res.status_code == 200
    assert "successfully" in reset_res.json()["message"].lower()

    # 8. Old Password Fails
    old_login = client.post("/api/auth/patient/login", json={
        "identifier": phone,
        "password": password,
    })
    assert old_login.status_code == 401

    # 9. New Password Succeeds
    new_login = client.post("/api/auth/patient/login", json={
        "identifier": phone,
        "password": new_password,
    })
    assert new_login.status_code == 200
    assert new_login.json()["uhid"] == assigned_uhid
