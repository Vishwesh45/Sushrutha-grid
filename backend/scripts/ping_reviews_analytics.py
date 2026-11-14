import requests

base = "http://127.0.0.1:8001"
# discover an admin from DB-backed login attempts
candidates = [
    ("admin.victoria@sushrutha.gov.in", "Admin@Sushrutha2026!"),
    ("admin@sushrutha.gov.in", "Admin@Sushrutha2026!"),
    ("prasiddhi.admin@sushrutha.gov.in", "Admin@Sushrutha2026!"),
]

token = None
for email, pw in candidates:
    r = requests.post(f"{base}/api/auth/login", json={"email": email, "password": pw}, timeout=10)
    print("login", email, r.status_code)
    if r.status_code == 200:
        token = r.json()["access_token"]
        break

if not token:
    # fall back: list one admin email via pymongo
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.database import get_database
    admin = get_database().users.find_one({"role": "admin"}, {"email": 1})
    print("db admin email sample:", admin)
    raise SystemExit("no admin login")

h = {"Authorization": f"Bearer {token}"}
a = requests.get(f"{base}/api/reviews/analytics?hospital_id=HOSP-BLR-001", headers=h, timeout=15)
print("analytics", a.status_code)
print(a.json())
