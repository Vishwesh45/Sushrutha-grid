"""Seed mixed good / average / bad structured reviews for analysis demo."""
from datetime import datetime, timedelta
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import get_database
from app.services.review_service import get_hospital_review_analytics, _enrich_review_doc

SAMPLES = [
    # GOOD
    {
        "patient_name": "Ananya R", "department": "General Medicine", "doctor_name": "Dr. Sneha Rao", "doctor_id": "DOC-GM-01",
        "ward_name": "OPD Waiting Hall A", "facility_rating": 5, "department_rating": 5, "doctor_rating": 5, "ward_rating": 4,
        "cleanliness_rating": 5, "waiting_time_rating": 4, "staff_behaviour_rating": 5,
        "facility_comment": "Clean corridors and clear boards.", "department_comment": "GM desk was organised.",
        "doctor_comment": "Explained medicines carefully.", "ward_comment": "Seating enough.",
        "overall_comment": "Very good overall experience.", "days_ago": 0, "token_number": "GM-301",
    },
    {
        "patient_name": "Lakshmi T", "department": "Cardiology", "doctor_name": "Dr. Karthik Iyer", "doctor_id": "DOC-CD-01",
        "ward_name": "Cardiac OPD Chamber 2", "facility_rating": 5, "department_rating": 5, "doctor_rating": 5, "ward_rating": 5,
        "cleanliness_rating": 5, "waiting_time_rating": 5, "staff_behaviour_rating": 5,
        "facility_comment": "Easy to find cardiology wing.", "doctor_comment": "Excellent cardiac guidance.",
        "overall_comment": "Would recommend.", "days_ago": 1, "token_number": "CD-210",
    },
    # AVERAGE
    {
        "patient_name": "Rahul K", "department": "General Medicine", "doctor_name": "Dr. Sneha Rao", "doctor_id": "DOC-GM-01",
        "ward_name": "OPD Waiting Hall A", "facility_rating": 3, "department_rating": 3, "doctor_rating": 4, "ward_rating": 3,
        "cleanliness_rating": 3, "waiting_time_rating": 2, "staff_behaviour_rating": 3,
        "facility_comment": "Average crowd management.", "department_comment": "Slow but okay.",
        "doctor_comment": "Doctor was fine.", "ward_comment": "Hall was packed.",
        "overall_comment": "Average morning rush.", "days_ago": 2, "token_number": "GM-288",
    },
    {
        "patient_name": "Meera S", "department": "Dermatology", "doctor_name": "Dr. Arjun Nair", "doctor_id": "DOC-DERM-01",
        "ward_name": "Dermatology Waiting Bay", "facility_rating": 3, "department_rating": 4, "doctor_rating": 3, "ward_rating": 3,
        "cleanliness_rating": 3, "waiting_time_rating": 3, "staff_behaviour_rating": 4,
        "facility_comment": "Signage could be clearer.", "doctor_comment": "Consultation was short.",
        "overall_comment": "Neither great nor poor.", "days_ago": 3, "token_number": "DERM-144",
    },
    {
        "patient_name": "Imran H", "department": "Cardiology", "doctor_name": "Dr. Karthik Iyer", "doctor_id": "DOC-CD-01",
        "ward_name": "Cardiac OPD Chamber 2", "facility_rating": 4, "department_rating": 3, "doctor_rating": 3, "ward_rating": 4,
        "waiting_time_rating": 3, "staff_behaviour_rating": 3,
        "department_comment": "ECG counter delay.", "overall_comment": "Average wait for ECG.",
        "days_ago": 4, "token_number": "CD-198",
    },
    # BAD — facility / ward / doctor / department emergencies
    {
        "patient_name": "Suresh M", "department": "Obstetrics & Gynecology", "doctor_name": "Dr. Priya Menon", "doctor_id": "DOC-OB-01",
        "ward_name": "OB Waiting Wing", "facility_rating": 2, "department_rating": 2, "doctor_rating": 3, "ward_rating": 2,
        "cleanliness_rating": 2, "waiting_time_rating": 1, "staff_behaviour_rating": 2,
        "facility_comment": "Toilets unclean near gate.", "department_comment": "OB desk chaotic.",
        "ward_comment": "No seating left, very crowded.", "overall_comment": "Bad facility experience today.",
        "days_ago": 1, "token_number": "OB-077",
    },
    {
        "patient_name": "Fatima B", "department": "Obstetrics & Gynecology", "doctor_name": "Dr. Priya Menon", "doctor_id": "DOC-OB-01",
        "ward_name": "OB Waiting Wing", "facility_rating": 3, "department_rating": 3, "doctor_rating": 1, "ward_rating": 3,
        "doctor_comment": "Doctor dismissed questions and rushed me out.",
        "overall_comment": "Very unhappy with doctor behaviour.", "days_ago": 2, "token_number": "OB-081",
    },
    {
        "patient_name": "Vikram P", "department": "Dermatology", "doctor_name": "Dr. Arjun Nair", "doctor_id": "DOC-DERM-01",
        "ward_name": "Dermatology Waiting Bay", "facility_rating": 2, "department_rating": 4, "doctor_rating": 4, "ward_rating": 1,
        "facility_comment": "Broken water cooler and dirty floor.",
        "ward_comment": "Waiting bay smelled bad and fans not working.",
        "overall_comment": "Ward area needs urgent attention.", "days_ago": 0, "token_number": "DERM-159",
    },
    {
        "patient_name": "Joseph D", "department": "General Medicine", "doctor_name": "Dr. Neha Capoor", "doctor_id": "DOC-GM-02",
        "ward_name": "OPD Waiting Hall B", "facility_rating": 4, "department_rating": 1, "doctor_rating": 2, "ward_rating": 3,
        "department_comment": "Wrong counter guidance twice.", "doctor_comment": "Felt ignored during consult.",
        "overall_comment": "Department process failed me.", "days_ago": 3, "token_number": "GM-255",
    },
    {
        "patient_name": "Kavya N", "department": "Cardiology", "doctor_name": "Dr. Neha Capoor", "doctor_id": "DOC-GM-02",
        "ward_name": "OPD Waiting Hall B", "facility_rating": 1, "department_rating": 2, "doctor_rating": 2, "ward_rating": 2,
        "facility_comment": "No wheelchair access near entrance ramp.",
        "ward_comment": "Unsafe crowding near chamber door.",
        "doctor_comment": "Rushed and unclear advice.",
        "overall_comment": "Multiple serious issues — facility, ward, doctor.", "days_ago": 5, "token_number": "GM-240",
    },
]


def main():
    db = get_database()
    db.patient_reviews.delete_many({"source": {"$in": ["demo_seed_ratings_tab", "demo_seed_structured_v2"]}})

    now = datetime.utcnow()
    for i, s in enumerate(SAMPLES):
        created = now - timedelta(days=s["days_ago"], hours=i % 5)
        doc = {
            "hospital_id": "HOSP-BLR-001",
            "hospital_name": "Victoria Hospital (BMCRI Apex Medical Center)",
            "patient_id": f"demo-patient-v2-{i+1}",
            "patient_name": s["patient_name"],
            "consultation_id": f"demo-consult-v2-{i+1}",
            "token_number": s["token_number"],
            "department": s["department"],
            "doctor_id": s["doctor_id"],
            "doctor_name": s["doctor_name"],
            "ward_name": s["ward_name"],
            "facility_rating": s["facility_rating"],
            "department_rating": s["department_rating"],
            "doctor_rating": s["doctor_rating"],
            "ward_rating": s["ward_rating"],
            "cleanliness_rating": s.get("cleanliness_rating"),
            "waiting_time_rating": s.get("waiting_time_rating"),
            "staff_behaviour_rating": s.get("staff_behaviour_rating"),
            "facility_comment": s.get("facility_comment"),
            "department_comment": s.get("department_comment"),
            "doctor_comment": s.get("doctor_comment"),
            "ward_comment": s.get("ward_comment"),
            "overall_comment": s.get("overall_comment"),
            "hospital_rating": s["facility_rating"],
            "comment": s.get("overall_comment"),
            "created_at": created.isoformat() + "Z",
            "schema_version": 2,
            "source": "demo_seed_structured_v2",
        }
        doc = _enrich_review_doc(doc)
        db.patient_reviews.insert_one(doc)

    summary = get_hospital_review_analytics("HOSP-BLR-001", db)
    print(f"Seeded {len(SAMPLES)} structured reviews")
    print(f"total={summary['total_reviews']} overall={summary['overall']['avg_rating']} ({summary['overall']['severity_band']})")
    print(f"facility={summary['facility']['avg_rating']} ({summary['facility']['severity_band']})")
    print(f"emergency_count={summary['emergency_count']}")
    print("departments:")
    for d in summary["departments"]:
        print(f"  - {d['department']}: {d['avg_department_rating']}★ [{d['severity_band']}] bad={d['bad_review_count']}")
    print("doctors:")
    for d in summary["doctors"]:
        print(f"  - {d['doctor_name']}: {d['avg_rating']}★ [{d['severity_band']}] bad={d['bad_review_count']}")
    print("sample emergencies:")
    for a in summary["emergency_alerts"][:6]:
        print(f"  - {a['target_type']} {a['target_name']} {a['rating']}★")


if __name__ == "__main__":
    main()
