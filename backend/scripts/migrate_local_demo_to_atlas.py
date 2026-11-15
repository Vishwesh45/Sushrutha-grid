"""
One-shot: copy local demo collections → Atlas.
Usage (PowerShell):
  $env:ATLAS_URI="mongodb+srv://..."; python scripts/migrate_local_demo_to_atlas.py
"""
import os
import sys
from pymongo import MongoClient

LOCAL_URI = os.getenv("LOCAL_MONGO_URI", "mongodb://127.0.0.1:27017")
ATLAS_URI = os.getenv("ATLAS_URI", "").strip()
DB_NAME = os.getenv("DB_NAME", "sushrutha_grid")

# Demo data that makes admin Ratings / roster / OPD look real on production
COLLECTIONS = [
    "patient_reviews",
    "hospital_reviews",
    "doctors",
    "opd_tokens",
    "consultations",
    "prescriptions",
    "hospitals",
    "follow_up_appointments",
    "follow_up_reminders",
]


def copy_collection(src_db, dst_db, name: str) -> int:
    src = src_db[name]
    dst = dst_db[name]
    docs = list(src.find({}))
    if not docs:
        print(f"  {name}: 0 local docs — skip")
        return 0
    # Replace demo collections wholesale so Atlas matches local demo
    dst.delete_many({})
    for d in docs:
        d.pop("_id", None)
    if docs:
        dst.insert_many(docs)
    print(f"  {name}: copied {len(docs)}")
    return len(docs)


def main():
    if not ATLAS_URI or "localhost" in ATLAS_URI or "127.0.0.1" in ATLAS_URI:
        print("Set ATLAS_URI to your mongodb+srv:// connection string.")
        sys.exit(1)

    print("Connecting local…")
    local = MongoClient(LOCAL_URI, serverSelectionTimeoutMS=8000)
    local.admin.command("ping")
    src = local[DB_NAME]

    print("Connecting Atlas…")
    atlas = MongoClient(ATLAS_URI, serverSelectionTimeoutMS=20000)
    atlas.admin.command("ping")
    dst = atlas[DB_NAME]

    total = 0
    for name in COLLECTIONS:
        total += copy_collection(src, dst, name)

    print(f"Done. Documents copied: {total}")
    print("Note: users were NOT overwritten (keeps live signups). Doctor logins still seeded from doctors roster on API start.")


if __name__ == "__main__":
    main()
