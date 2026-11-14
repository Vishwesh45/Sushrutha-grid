"""Seed a demo follow-up appointment + due reminder for a Victoria patient."""
from datetime import datetime, timedelta
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import get_database
from app.services.followup_service import create_follow_up_from_prescription, process_due_reminders


def main():
    db = get_database()
    # Prefer a real patient user if present
    patient = db.users.find_one({"role": "patient", "hospital_id": "HOSP-BLR-001"}) or db.users.find_one({"role": "patient"})
    if not patient:
        print("No patient user found")
        return

    pid = str(patient["_id"])
    tomorrow = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%d")
    day_after = (datetime.utcnow() + timedelta(days=5)).strftime("%Y-%m-%d")

    # Clean prior demo seeds
    db.follow_up_appointments.delete_many({"source": "demo_seed_followup"})
    db.follow_up_reminders.delete_many({"source": "demo_seed_followup"})

    samples = [
        {
            "prescription_id": "RX-DEMO-FOLLOW-1",
            "consultation_id": "demo-consult-follow-1",
            "patient_id": pid,
            "patient_name": patient.get("name") or "Demo Patient",
            "patient_uhid": patient.get("uhid"),
            "doctor_id": "DOC_MED_JR_01",
            "doctor_name": "Dr. Sneha Hegde",
            "department": "General Medicine",
            "hospital_id": "HOSP-BLR-001",
            "hospital_name": "Victoria Hospital (BMCRI Apex Medical Center)",
            "clinical_diagnosis": "Viral fever — resolving",
            "follow_up_date": f"Review on {tomorrow} if fever persists",
            "follow_up_on": tomorrow,
            "issued_at": datetime.utcnow().isoformat() + "Z",
            "source": "demo_seed_followup",
        },
        {
            "prescription_id": "RX-DEMO-FOLLOW-2",
            "consultation_id": "demo-consult-follow-2",
            "patient_id": pid,
            "patient_name": patient.get("name") or "Demo Patient",
            "patient_uhid": patient.get("uhid"),
            "doctor_id": "DOC_CARD_SR_01",
            "doctor_name": "Dr. Vikramaditya Joshi",
            "department": "Cardiology",
            "hospital_id": "HOSP-BLR-001",
            "hospital_name": "Victoria Hospital (BMCRI Apex Medical Center)",
            "clinical_diagnosis": "Chest discomfort — observation",
            "follow_up_date": f"Review after 5 days ({day_after})",
            "follow_up_on": day_after,
            "issued_at": datetime.utcnow().isoformat() + "Z",
            "source": "demo_seed_followup",
        },
    ]

    for s in samples:
        # Keep prescription mirror for Rx view links
        db.prescriptions.update_one(
            {"prescription_id": s["prescription_id"]},
            {"$set": {**s, "medications": [], "status": "ISSUED"}},
            upsert=True,
        )
        appt = create_follow_up_from_prescription(db, s, follow_up_on=s["follow_up_on"])
        if appt:
            db.follow_up_appointments.update_one(
                {"_id": __import__("bson").ObjectId(appt["id"])},
                {"$set": {"source": "demo_seed_followup"}},
            )
            db.follow_up_reminders.update_many(
                {"appointment_id": appt["id"]},
                {"$set": {"source": "demo_seed_followup"}},
            )
            print(f"Scheduled {s['prescription_id']} → {appt['follow_up_on']}")

    n = process_due_reminders(db)
    dash_count = db.follow_up_appointments.count_documents({"patient_id": pid, "status": "scheduled"})
    due = db.follow_up_reminders.count_documents({"patient_id": pid, "status": "due"})
    print(f"patient={patient.get('email') or patient.get('phone')} id={pid}")
    print(f"upcoming_appts={dash_count} due_reminders={due} processed_now={n}")


if __name__ == "__main__":
    main()
