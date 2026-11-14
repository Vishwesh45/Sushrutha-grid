from fastapi.testclient import TestClient
from app.main import app
from app.database import get_database

client = TestClient(app)

def test_nlp_extraction():
    test_text = "I have severe pain in my right knee for three days and I cannot walk properly."
    
    response = client.post("/api/nlp/extract", json={"text": test_text})
    assert response.status_code == 200, f"NLP extraction failed: {response.text}"
    
    data = response.json()
    assert data["success"] is True
    structured = data["structured_data"]
    
    assert "pain" in structured["symptoms"]
    assert any("knee" in bp for bp in structured["body_parts"])
    assert structured["severity"] == "severe"
    assert "three days" in structured["duration"] or "day" in str(structured["duration"])
    assert "difficulty walking" in structured["functional_difficulties"]
    
    # Assert raw entities exist with character offsets
    raw_ents = structured["entities"]
    labels = [e["label"] for e in raw_ents]
    assert "SYMPTOM" in labels
    assert "BODY_PART" in labels
    assert "SEVERITY" in labels
    assert "DURATION" in labels
    
    # Verify event logged in MongoDB
    db = get_database()
    event_doc = db.hospital_events.find_one({"event_type": "NLP_EXTRACTION_PERFORMED"})
    assert event_doc is not None
    assert "entity_count" in event_doc
    
    print("All Phase 5 NLP Extraction tests passed successfully!")

if __name__ == "__main__":
    test_nlp_extraction()
