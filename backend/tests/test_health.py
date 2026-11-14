from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert data["message"] == "Welcome to Sushrutha Grid API"

def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["healthy", "degraded"]
    assert "database" in data
    assert data["database"]["status"] == "connected"
    assert data["database"]["database"] == "sushrutha_grid"

if __name__ == "__main__":
    test_root_endpoint()
    test_health_endpoint()
    print("All Phase 1 tests passed successfully!")
