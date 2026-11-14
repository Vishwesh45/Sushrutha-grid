import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import PORT, HOST, CORS_ORIGINS
from app.routes.health import router as health_router
from app.routes.auth import router as auth_router
from app.routes.patient import router as patient_router
from app.routes.speech import router as speech_router
from app.routes.nlp import router as nlp_router
from app.routes.doctor import router as doctor_router
from app.routes.admin_ops import router as admin_ops_router
from app.routes.partner_portal import router as partner_portal_router
from app.routes.queue import router as queue_router
from app.routes.doctor_desk import router as doctor_desk_router
from app.routes.ws import router as ws_router, set_main_loop
from app.routes.hospitals import router as hospitals_router
from app.routes.reception import router as reception_router
from app.routes.reviews import router as reviews_router
from app.routes.followups import router as followups_router

app = FastAPI(
    title="Sushrutha Grid API",
    description="Intelligent Real-Time Government Hospital Workflow and Patient Coordination Platform",
    version="1.0.0"
)

# CORS middleware for React frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(patient_router)
app.include_router(speech_router)
app.include_router(nlp_router)
app.include_router(doctor_router)
app.include_router(admin_ops_router)
app.include_router(partner_portal_router)
app.include_router(queue_router)
app.include_router(doctor_desk_router)
app.include_router(ws_router)
app.include_router(hospitals_router)
app.include_router(reception_router)
app.include_router(reviews_router)
app.include_router(followups_router)

@app.on_event("startup")
def start_followup_reminder_poller():
    """In-app follow-up reminders: day-before and day-of poller."""
    try:
        from app.services.followup_service import start_followup_scheduler
        start_followup_scheduler(interval_seconds=60)
    except Exception as e:
        print(f"Warning: Follow-up scheduler skipped: {e}")

@app.on_event("startup")
def seed_hospitals_data():
    """Ensures government hospital directory is seeded and available."""
    try:
        from app.services.hospital_service import seed_government_hospitals
        seed_government_hospitals()
    except Exception as e:
        print(f"Warning: Hospital seeding skipped: {e}")

@app.on_event("startup")
async def initialize_ws_event_loop():
    """Captures the running event loop for real-time WebSocket event broadcasting."""
    import asyncio
    try:
        set_main_loop(asyncio.get_running_loop())
    except Exception:
        pass

@app.on_event("startup")
def seed_default_admin():
    """Ensures standard hospital administrator account exists for admin module access."""
    try:
        from app.database import get_database
        from app.routes.auth import hash_password
        db = get_database()
        admin = db.users.find_one({"email": "admin@sushrutha.gov.in"})
        if not admin:
            db.users.insert_one({
                "name": "Medical Superintendent (Admin)",
                "email": "admin@sushrutha.gov.in",
                "password_hash": hash_password("Admin@Sushrutha2026!"),
                "role": "admin",
                "phone": "9880011223",
                "department": "Hospital Administration",
                "hospital_id": "HOSP-BLR-001",
                "hospital_name": "Victoria Hospital (BMCRI Apex Medical Center)",
                "created_at": "2026-10-06T00:00:00",
                "updated_at": "2026-10-06T00:00:00"
            })
        else:
            db.users.update_one(
                {"_id": admin["_id"]},
                {"$set": {
                    "hospital_id": admin.get("hospital_id") or "HOSP-BLR-001",
                    "hospital_name": admin.get("hospital_name") or "Victoria Hospital (BMCRI Apex Medical Center)"
                }}
            )
    except Exception as e:
        print(f"Warning: Admin seeding skipped: {e}")

@app.on_event("startup")
def seed_doctor_accounts():
    """Ensures all doctors in the hospital roster have corresponding user login accounts scoped to their hospital tenant."""
    try:
        from datetime import datetime
        from app.database import get_database
        from app.routes.auth import hash_password
        db = get_database()
        standard_doc_hash = hash_password("Doctor@Sushrutha2026!")
        now_str = datetime.utcnow().isoformat() + "Z"

        # Normalize any legacy tokens and consultations missing hospital_id to Victoria Hospital
        db.opd_tokens.update_many(
            {"$or": [{"hospital_id": {"$exists": False}}, {"hospital_id": None}]},
            {"$set": {
                "hospital_id": "HOSP-BLR-001",
                "hospital_name": "Victoria Hospital (BMCRI Apex Medical Center)"
            }}
        )
        db.consultations.update_many(
            {"$or": [{"hospital_id": {"$exists": False}}, {"hospital_id": None}]},
            {"$set": {
                "hospital_id": "HOSP-BLR-001",
                "hospital_name": "Victoria Hospital (BMCRI Apex Medical Center)"
            }}
        )

        for doc in db.doctors.find():
            email_clean = (doc.get("email") or "").lower().strip()
            if not email_clean:
                continue

            doc_hid = doc.get("hospital_id") or "HOSP-BLR-001"
            doc_hname = doc.get("hospital_name") or "Victoria Hospital (BMCRI Apex Medical Center)"

            user = db.users.find_one({"email": email_clean})
            if not user:
                db.users.insert_one({
                    "name": doc.get("name"),
                    "email": email_clean,
                    "password_hash": standard_doc_hash,
                    "role": "doctor",
                    "doctor_id": doc.get("doctor_id"),
                    "hospital_id": doc_hid,
                    "hospital_name": doc_hname,
                    "phone": doc.get("phone", "9880001122"),
                    "department": doc.get("department", "General Medicine"),
                    "room_number": doc.get("room_number", "Room 101"),
                    "designation": doc.get("designation", "Resident Doctor"),
                    "qualification": doc.get("qualification", "MBBS"),
                    "tier": doc.get("tier", "JUNIOR_DOCTOR"),
                    "created_at": now_str,
                    "updated_at": now_str
                })
            else:
                # Update role and metadata to ensure doctor privileges and tenant linkage
                db.users.update_one(
                    {"_id": user["_id"]},
                    {"$set": {
                        "role": "doctor",
                        "doctor_id": doc.get("doctor_id"),
                        "hospital_id": doc_hid,
                        "hospital_name": doc_hname,
                        "department": doc.get("department"),
                        "room_number": doc.get("room_number"),
                        "designation": doc.get("designation")
                    }}
                )
    except Exception as e:
        print(f"Warning: Doctor accounts seeding skipped: {e}")

@app.get("/")
def root():
    return {
        "message": "Welcome to Sushrutha Grid API",
        "docs_url": "/docs",
        "health_check": "/api/health",
        "auth_routes": "/api/auth",
        "patient_routes": "/api/patient",
        "speech_routes": "/api/speech",
        "nlp_routes": "/api/nlp",
        "doctor_routes": "/api/doctors"
    }

if __name__ == "__main__":
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
