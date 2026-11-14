from typing import List, Optional
import secrets
from datetime import datetime, timedelta
from bson import ObjectId
from fastapi import APIRouter, HTTPException, status, Depends, Request
from app.database import get_database
from app.models.user import (
    UserRegisterRequest,
    UserLoginRequest,
    PatientRegisterRequest,
    PatientLoginRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserProfileResponse,
    SessionInfoResponse,
    SessionHeartbeatResponse,
    SessionRecordItem
)
from app.utils.security import hash_password, verify_password, create_access_token
from app.middleware.auth import get_current_user, require_roles
from app.services.email_service import send_password_reset_email

router = APIRouter(prefix="/api/auth", tags=["Authentication & RBAC"])


def _create_user_session(db, user_doc: dict, ip: str = "127.0.0.1", user_agent: str = "Web Client") -> str:
    """
    Creates an active hospital user session record in MongoDB.
    Tracks session login time, client IP, user agent, and auto-idle timeout.
    """
    session_id = f"SES-{datetime.utcnow().year}-{secrets.token_hex(5).upper()}"
    now_dt = datetime.utcnow()
    now_iso = now_dt.isoformat() + "Z"
    role = user_doc.get("role", "patient")

    # In hospital environments: clinical workstations timeout in 30 mins, patients in 60 mins
    timeout_mins = 30 if role in ["doctor", "admin", "nurse"] else 60
    expires_at = (now_dt + timedelta(minutes=timeout_mins)).isoformat() + "Z"

    session_record = {
        "session_id": session_id,
        "user_id": str(user_doc.get("_id") or user_doc.get("id")),
        "email": user_doc.get("email"),
        "name": user_doc.get("name"),
        "role": role,
        "uhid": user_doc.get("uhid"),
        "department": user_doc.get("department"),
        "ip_address": ip,
        "user_agent": user_agent,
        "login_at": now_iso,
        "last_activity_at": now_iso,
        "expires_at": expires_at,
        "idle_timeout_minutes": timeout_mins,
        "status": "active"
    }
    db.user_sessions.insert_one(session_record)

    # Operational audit log
    db.hospital_events.insert_one({
        "event_type": "USER_SESSION_STARTED",
        "session_id": session_id,
        "user_id": session_record["user_id"],
        "role": role,
        "timestamp": now_iso
    })
    return session_id


def generate_unique_uhid(db) -> str:
    """
    Generates a human-readable Unique Hospital ID (UHID), e.g., SG-2026-0001
    """
    current_year = datetime.utcnow().year
    count = db.patients.count_documents({}) + db.users.count_documents({"role": "patient"}) + 1
    return f"SG-{current_year}-{count:04d}"


# ==========================================
# PATIENT REGISTRATION & AUTHENTICATION
# ==========================================

@router.post("/patient/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register_patient(request: PatientRegisterRequest):
    """
    Registers a new citizen patient with mobile number, email, and demographics.
    Automatically assigns a permanent UHID and returns a signed JWT token.
    """
    import re
    db = get_database()
    full_name = (request.full_name or "").strip()
    email_clean = str(request.email).lower().strip()
    phone_digits = "".join(filter(str.isdigit, request.phone or ""))
    phone_clean = phone_digits[-10:] if len(phone_digits) >= 10 else phone_digits
    password = request.password or ""

    if len(full_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter your full name (at least 2 characters).",
        )
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email_clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a valid email address.",
        )
    if len(phone_clean) != 10 or phone_clean[0] not in "6789":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a valid 10-digit Indian mobile number.",
        )
    if len(password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters.",
        )

    # Check for existing user with same phone or email
    existing_phone = db.users.find_one({"phone": phone_clean})
    if existing_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A patient with this mobile number is already registered. Please sign in instead.",
        )

    existing_email = db.users.find_one({"email": email_clean})
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A patient with this email address is already registered. Please sign in or use Forgot password.",
        )

    now = datetime.utcnow().isoformat()
    uhid = generate_unique_uhid(db)
    hashed_pwd = hash_password(password)

    # 1. Store in users collection (for credentials & RBAC)
    new_user = {
        "name": full_name,
        "email": email_clean,
        "phone": phone_clean,
        "password_hash": hashed_pwd,
        "role": "patient",
        "uhid": uhid,
        "age": request.age,
        "gender": request.gender,
        "address": request.address.strip() if request.address else None,
        "created_at": now,
        "updated_at": now
    }
    user_res = db.users.insert_one(new_user)
    user_id = str(user_res.inserted_id)

    # 2. Store in patients collection (for clinical history & demographic records)
    new_patient = {
        "user_id": user_id,
        "uhid": uhid,
        "full_name": full_name,
        "phone": phone_clean,
        "email": email_clean,
        "age": request.age,
        "gender": request.gender,
        "address": request.address.strip() if request.address else None,
        "registered_at": now
    }
    db.patients.insert_one(new_patient)

    # 3. Create signed JWT access token & active session record
    session_id = _create_user_session(db, new_user)
    token_payload = {
        "sub": user_id,
        "email": email_clean,
        "name": new_user["name"],
        "phone": phone_clean,
        "uhid": uhid,
        "role": "patient",
        "session_id": session_id
    }
    token = create_access_token(token_payload)

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user_id=user_id,
        name=new_user["name"],
        email=email_clean,
        phone=phone_clean,
        uhid=uhid,
        role="patient",
        session_id=session_id
    )


@router.post("/patient/login", response_model=TokenResponse)
def login_patient(request: PatientLoginRequest):
    """
    Authenticates a patient using either their 10-digit mobile number or email address.
    """
    import re
    db = get_database()
    raw_ident = (request.identifier or "").strip()
    password = request.password or ""

    if not raw_ident:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter your mobile number or email.",
        )
    if not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is required.",
        )

    digits_only = "".join(filter(str.isdigit, raw_ident))

    # Match by phone number (if 10 digits) or by email
    if len(digits_only) >= 10 and (len(raw_ident) <= 13 or raw_ident.replace("+", "").replace(" ", "").isdigit()):
        query = {"phone": digits_only[-10:]}
    else:
        email_ident = raw_ident.lower()
        if "@" in email_ident and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email_ident):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Enter a valid email address or 10-digit mobile number.",
            )
        query = {"email": email_ident}

    user = db.users.find_one(query)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not found. Check mobile/email, or register a new patient account.",
        )

    # Verify bcrypt password
    if not verify_password(password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Use Forgot password if you need to reset it.",
        )

    user_id = str(user["_id"])
    session_id = _create_user_session(db, user)
    token_payload = {
        "sub": user_id,
        "email": user.get("email"),
        "name": user.get("name"),
        "phone": user.get("phone"),
        "uhid": user.get("uhid"),
        "role": user.get("role", "patient"),
        "session_id": session_id
    }
    token = create_access_token(token_payload)

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user_id=user_id,
        name=user["name"],
        email=user["email"],
        phone=user.get("phone"),
        uhid=user.get("uhid"),
        role=user.get("role", "patient"),
        session_id=session_id
    )


# ==========================================
# FORGOT & RESET PASSWORD FLOW
# ==========================================

@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest):
    """
    Password reset request:
    - Validate email
    - Reject unregistered emails immediately (clear form feedback)
    - Rate-limit resends
    - Send OTP by SMTP; never return OTP in the API body
    - Surface SMTP failures instead of fake success
    """
    import re
    db = get_database()
    email_clean = (request.email or "").lower().strip()

    if not email_clean or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email_clean):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a valid email address.",
        )

    user = db.users.find_one({"email": email_clean})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This email is not registered. Enter the correct email used for signup.",
        )

    last_req = user.get("reset_otp_requested_at")
    if last_req:
        try:
            last_dt = datetime.fromisoformat(str(last_req).replace("Z", ""))
            wait_left = 60 - int((datetime.utcnow() - last_dt).total_seconds())
            if wait_left > 0:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Please wait {wait_left} seconds before requesting another code.",
                )
        except HTTPException:
            raise
        except Exception:
            pass

    otp_code = str(secrets.randbelow(900000) + 100000)
    expires_at = datetime.utcnow() + timedelta(minutes=15)
    now = datetime.utcnow().isoformat()

    db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {
            "reset_otp": otp_code,
            "reset_otp_expires_at": expires_at.isoformat(),
            "reset_otp_requested_at": now,
            "reset_otp_attempts": 0,
        }},
    )

    try:
        email_result = send_password_reset_email(
            to_email=email_clean,
            patient_name=user.get("name", "Patient"),
            otp_code=otp_code,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    masked = email_clean.split("@")
    masked_email = (
        (masked[0][:2] + "***@" + masked[1]) if len(masked) == 2 and len(masked[0]) > 2
        else email_clean
    )

    return {
        "status": "success",
        "message": (
            f"A 6-digit reset code was sent to {masked_email}. "
            "Check inbox and spam. The code expires in 15 minutes."
        ),
        "mode": email_result.get("mode"),
        "email_hint": masked_email,
    }


@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest):
    """
    Verifies the 6-digit reset OTP and updates the user's password.
    Only the latest requested code is valid (older emails are cancelled).
    """
    db = get_database()
    email_clean = str(request.email).lower().strip()
    otp_clean = "".join(ch for ch in str(request.otp or "") if ch.isdigit())

    user = db.users.find_one({"email": email_clean})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this email. Use the same email you entered for 'Forgot password'.",
        )

    stored_otp = str(user.get("reset_otp") or "").strip()
    expires_str = user.get("reset_otp_expires_at")

    if not stored_otp or not expires_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active reset code. Go back and click Send code again.",
        )

    try:
        expires_at = datetime.fromisoformat(str(expires_str).replace("Z", ""))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset code is invalid. Please request a new one.",
        )

    if datetime.utcnow() > expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This code has expired (15 minutes). Request a new code.",
        )

    if len(otp_clean) != 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter the 6-digit verification code from your email.",
        )

    if len(request.new_password or "") < 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="New password must be at least 6 characters.",
        )

    attempts = int(user.get("reset_otp_attempts") or 0)
    if attempts >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many wrong codes. Request a new reset code.",
        )

    if stored_otp != otp_clean:
        db.users.update_one({"_id": user["_id"]}, {"$inc": {"reset_otp_attempts": 1}})
        left = max(0, 4 - attempts)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Wrong code. Use only the newest email — older codes stop working "
                f"after you request again. ({left} tries left)"
            ),
        )

    # Hash new password and clear OTP
    new_hash = hash_password(request.new_password)
    now = datetime.utcnow().isoformat()

    db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": new_hash,
                "updated_at": now
            },
            "$unset": {
                "reset_otp": "",
                "reset_otp_expires_at": "",
                "reset_otp_attempts": "",
                "reset_otp_requested_at": "",
            }
        }
    )

    return {
        "status": "success",
        "message": "Password reset successfully! You can now log in with your new password."
    }


# ==========================================
# GENERAL USER & RBAC ROUTES (BACKWARD COMPATIBLE)
# ==========================================

@router.post("/register", response_model=UserProfileResponse, status_code=status.HTTP_201_CREATED)
def register_user(request: UserRegisterRequest):
    """General user registration (backward compatible)."""
    import re
    db = get_database()
    name_clean = (request.name or "").strip()
    email_clean = str(request.email).lower().strip()
    password = request.password or ""

    if len(name_clean) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a name (at least 2 characters).",
        )
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email_clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a valid email address.",
        )
    if len(password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters.",
        )

    existing_user = db.users.find_one({"email": email_clean})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists. Sign in instead.",
        )

    hashed = hash_password(password)
    now = datetime.utcnow().isoformat()
    phone_val = None
    if request.phone:
        digits = "".join(filter(str.isdigit, request.phone))
        phone_val = digits[-10:] if len(digits) >= 10 else (digits or None)
    new_user = {
        "name": name_clean,
        "email": email_clean,
        "password_hash": hashed,
        "role": request.role,
        "phone": phone_val,
        "department": request.department.strip() if request.department else None,
        "created_at": now,
        "updated_at": now
    }

    result = db.users.insert_one(new_user)
    user_id = str(result.inserted_id)

    return UserProfileResponse(
        id=user_id,
        name=new_user["name"],
        email=new_user["email"],
        role=new_user["role"],
        phone=new_user["phone"],
        department=new_user["department"],
        created_at=new_user["created_at"]
    )


@router.post("/login", response_model=TokenResponse)
def login_user(request: UserLoginRequest):
    """General login supporting email or identifier."""
    db = get_database()
    ident = request.email or request.identifier
    password = request.password or ""
    if not ident or not str(ident).strip():
        raise HTTPException(status_code=400, detail="Email or mobile number is required.")
    if not password:
        raise HTTPException(status_code=400, detail="Password is required.")

    clean_ident = str(ident).lower().strip()
    digits = "".join(filter(str.isdigit, clean_ident))

    query = {"phone": digits[-10:]} if len(digits) >= 10 else {"email": clean_ident}
    user = db.users.find_one(query)

    if not user or not verify_password(password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/mobile or password.",
        )

    user_id = str(user["_id"])
    session_id = _create_user_session(db, user)
    token_payload = {
        "sub": user_id,
        "email": user["email"],
        "name": user["name"],
        "phone": user.get("phone"),
        "uhid": user.get("uhid"),
        "role": user["role"],
        "session_id": session_id
    }
    token = create_access_token(token_payload)

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user_id=user_id,
        name=user["name"],
        email=user["email"],
        phone=user.get("phone"),
        uhid=user.get("uhid"),
        role=user["role"],
        session_id=session_id
    )


# ==========================================
# ACTIVE SESSION MANAGEMENT (ABDM / HOSPITAL)
# ==========================================

@router.get("/session/active", response_model=SessionInfoResponse)
def get_active_session(current_user: dict = Depends(get_current_user)):
    """
    Returns the currently active clinical/patient session, remaining time, and idle timeout.
    """
    db = get_database()
    sess_id = current_user.get("session_id")
    query = {"session_id": sess_id} if sess_id else {"user_id": current_user["id"], "status": "active"}
    session_doc = db.user_sessions.find_one(query, sort=[("login_at", -1)])

    if not session_doc:
        new_id = _create_user_session(db, current_user)
        session_doc = db.user_sessions.find_one({"session_id": new_id})

    return SessionInfoResponse(
        session_id=session_doc["session_id"],
        user_id=session_doc["user_id"],
        name=session_doc["name"],
        email=session_doc["email"],
        role=session_doc["role"],
        uhid=session_doc.get("uhid"),
        department=session_doc.get("department"),
        login_at=session_doc["login_at"],
        last_activity_at=session_doc.get("last_activity_at", session_doc["login_at"]),
        expires_at=session_doc["expires_at"],
        idle_timeout_minutes=session_doc.get("idle_timeout_minutes", 30),
        is_active=(session_doc.get("status") == "active")
    )


@router.post("/session/heartbeat", response_model=SessionHeartbeatResponse)
def heartbeat_session(current_user: dict = Depends(get_current_user)):
    """
    Periodic heartbeat from frontend: extends idle session expiry while user is active.
    """
    db = get_database()
    sess_id = current_user.get("session_id")
    query = {"session_id": sess_id} if sess_id else {"user_id": current_user["id"], "status": "active"}
    session_doc = db.user_sessions.find_one(query, sort=[("login_at", -1)])

    now_dt = datetime.utcnow()
    now_iso = now_dt.isoformat() + "Z"
    timeout_mins = session_doc.get("idle_timeout_minutes", 30) if session_doc else 30
    new_expires = (now_dt + timedelta(minutes=timeout_mins)).isoformat() + "Z"

    if session_doc:
        db.user_sessions.update_one(
            {"_id": session_doc["_id"]},
            {"$set": {"last_activity_at": now_iso, "expires_at": new_expires}}
        )
        sid = session_doc["session_id"]
    else:
        sid = _create_user_session(db, current_user)

    return SessionHeartbeatResponse(
        success=True,
        session_id=sid,
        last_activity_at=now_iso,
        expires_at=new_expires,
        message="Session heartbeat acknowledged"
    )


@router.post("/session/logout")
def logout_session(current_user: dict = Depends(get_current_user)):
    """
    Explicitly terminates the user's active session in the database.
    """
    db = get_database()
    now_iso = datetime.utcnow().isoformat() + "Z"
    sess_id = current_user.get("session_id")

    if sess_id:
        db.user_sessions.update_one(
            {"session_id": sess_id},
            {"$set": {"status": "terminated", "terminated_at": now_iso}}
        )
    else:
        db.user_sessions.update_many(
            {"user_id": current_user["id"], "status": "active"},
            {"$set": {"status": "terminated", "terminated_at": now_iso}}
        )

    db.hospital_events.insert_one({
        "event_type": "USER_SESSION_TERMINATED",
        "session_id": sess_id,
        "user_id": current_user["id"],
        "role": current_user["role"],
        "timestamp": now_iso
    })

    return {"success": True, "message": "Session terminated successfully."}


@router.get("/session/history", response_model=List[SessionRecordItem])
def get_session_history(current_user: dict = Depends(get_current_user)):
    """
    Returns recent login sessions for audit and terminal security review.
    """
    db = get_database()
    docs = list(db.user_sessions.find({"user_id": current_user["id"]}).sort("login_at", -1).limit(10))
    records = []
    for d in docs:
        records.append(SessionRecordItem(
            session_id=d["session_id"],
            login_at=d["login_at"],
            last_activity_at=d.get("last_activity_at", d["login_at"]),
            expires_at=d["expires_at"],
            ip_address=d.get("ip_address", "127.0.0.1"),
            status=d.get("status", "active")
        ))
    return records


@router.get("/me", response_model=UserProfileResponse)
def get_my_profile(current_user: dict = Depends(get_current_user)):
    """Returns the authenticated user's profile details."""
    return UserProfileResponse(
        id=current_user["id"],
        name=current_user["name"],
        email=current_user["email"],
        role=current_user["role"],
        phone=current_user.get("phone"),
        uhid=current_user.get("uhid"),
        department=current_user.get("department"),
        created_at=current_user.get("created_at", "")
    )


@router.get("/admin-only")
def admin_only_endpoint(admin_user: dict = Depends(require_roles("admin"))):
    """Admin-only status endpoint."""
    db = get_database()
    pipeline = [{"$group": {"_id": "$role", "count": {"$sum": 1}}}]
    counts = {doc["_id"]: doc["count"] for doc in db.users.aggregate(pipeline)}

    return {
        "message": f"Welcome Administrator {admin_user['name']}. Access granted.",
        "authorized_role": admin_user["role"],
        "hospital_staff_distribution": counts,
        "system_status": "All hospital security and operational services operational."
    }
