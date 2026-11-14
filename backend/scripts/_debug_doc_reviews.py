from pymongo import MongoClient

db = MongoClient("mongodb://localhost:27017")["sushrutha_grid"]
print("opd_tokens", db.opd_tokens.count_documents({}))
print("prescriptions", db.prescriptions.count_documents({}))
print("patient_reviews", db.patient_reviews.count_documents({}))

print("\n--- recent COMPLETED tokens ---")
for t in db.opd_tokens.find({"status": "COMPLETED"}).sort("completed_at", -1).limit(10):
    print(
        {
            "token": t.get("token_number"),
            "dept": t.get("department"),
            "doc_id": t.get("assigned_doctor_id"),
            "doc_name": t.get("assigned_doctor_name"),
            "date": t.get("date"),
            "completed_at": t.get("completed_at"),
            "rx": t.get("prescription_id"),
        }
    )

print("\n--- OB-GYN doctors ---")
for d in db.doctors.find(
    {"department": {"$regex": "Obstetrics", "$options": "i"}},
    {"name": 1, "doctor_id": 1, "email": 1, "room_number": 1, "_id": 0},
):
    print(d)

print("\n--- recent prescriptions ---")
for p in db.prescriptions.find().sort("issued_at", -1).limit(8):
    print(
        {
            "rx": p.get("prescription_id"),
            "token": p.get("token_number"),
            "doctor_id": p.get("doctor_id"),
            "doctor_name": p.get("doctor_name"),
            "issued_at": p.get("issued_at"),
        }
    )

print("\n--- recent patient_reviews ---")
for r in db.patient_reviews.find().sort("created_at", -1).limit(6):
    print(
        {
            "dept": r.get("department"),
            "doctor": r.get("doctor_name"),
            "facility": r.get("facility_rating"),
            "consult": r.get("consultation_id"),
            "created": r.get("created_at"),
            "patient": r.get("patient_name"),
        }
    )
