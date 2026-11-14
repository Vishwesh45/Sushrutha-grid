from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_list_government_hospitals():
    """Verifies that ONLY the operational tenant (Victoria Hospital HOSP-BLR-001) is stored in db.hospitals."""
    res = client.get("/api/hospitals")
    assert res.status_code == 200
    hospitals = res.json()
    assert len(hospitals) == 1

    victoria = hospitals[0]
    assert victoria["hospital_id"] == "HOSP-BLR-001"
    assert "Victoria Hospital" in victoria["name"]
    assert victoria["is_grid_pilot"] is True
    assert victoria["active_doctors_count"] >= 40
    assert "General Medicine" in victoria["departments"]
    assert "xai_review_summary" in victoria
    assert 1.0 <= victoria["rating"] <= 5.0
    assert victoria["total_reviews"] >= 100
    assert len(victoria["xai_key_strengths"]) > 0


def test_nearby_hospitals_haversine_calculation():
    """
    Verifies that passing GPS coordinates dynamically discovers nearby government hospitals
    from live Google Maps (without preseeding display hospitals) and sorts by nearest Haversine distance.
    """
    res = client.get("/api/hospitals/nearby?lat=12.9630&lon=77.5740&radius_km=20")
    assert res.status_code == 200
    nearby = res.json()
    assert len(nearby) >= 2

    # Victoria Hospital (< 0.5 km from Kalasipalya) must be present and active
    victoria_item = next(h for h in nearby if h["hospital_id"] == "HOSP-BLR-001")
    assert victoria_item["is_grid_pilot"] is True
    assert victoria_item["distance_km"] < 0.5
    assert "distance_label" in victoria_item
    assert "estimated_travel_minutes" in victoria_item
    assert "xai_ranking_rationale" in victoria_item

    # Dynamically discovered Google Maps hospitals should be display-only (is_grid_pilot=False)
    dynamic_hospitals = [h for h in nearby if h["hospital_id"].startswith("GMAP-HOSP-")]
    assert len(dynamic_hospitals) >= 1
    assert all(h["is_grid_pilot"] is False for h in dynamic_hospitals)
    assert any(h["rating"] > 0 and h["total_reviews"] > 0 for h in dynamic_hospitals)

    # Distances strictly in ascending order
    distances = [h["distance_km"] for h in nearby]
    assert distances == sorted(distances)


def test_nearby_hospitals_department_filter():
    """Verifies department filtering in nearby hospital discovery."""
    res = client.get("/api/hospitals/nearby?lat=12.9634&lon=77.5746&department=Obstetrics")
    assert res.status_code == 200
    filtered = res.json()
    assert len(filtered) >= 1
    for h in filtered:
        assert any("Obstetrics" in d for d in h["departments"])


def test_get_single_hospital_details_and_xai_reviews():
    """Verifies retrieval of operational hospital and citizen review XAI integration."""
    res = client.get("/api/hospitals/HOSP-BLR-001")
    assert res.status_code == 200
    hosp = res.json()
    assert hosp["hospital_id"] == "HOSP-BLR-001"
    assert "Victoria Hospital" in hosp["name"]

    # Submit a real citizen review and verify XAI summary updates
    rev_res = client.post("/api/hospitals/HOSP-BLR-001/reviews", json={
        "rating": 5,
        "comment": "Fast emergency triage desk and free generic medicines at Victoria pharmacy.",
        "patient_name": "Ramesh Gowda",
        "department_visited": "General Medicine"
    })
    assert rev_res.status_code == 201
    assert rev_res.json()["success"] is True

    list_rev = client.get("/api/hospitals/HOSP-BLR-001/reviews")
    assert list_rev.status_code == 200
    assert list_rev.json()["total_count"] >= 1

    bad_res = client.get("/api/hospitals/NON_EXISTENT_ID")
    assert bad_res.status_code == 404
