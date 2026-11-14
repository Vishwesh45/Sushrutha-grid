import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.semantic_nlp_service import perform_semantic_clinical_analysis

client = TestClient(app)

def test_negation_detection_and_assertion():
    """
    Validates NegEx clinical assertion:
    Active symptoms must be separated from negated/ruled-out findings.
    """
    text = "Patient reports severe chest pain and breathlessness, but no fever and denies vomiting."
    result = perform_semantic_clinical_analysis(text)
    
    confirmed_names = [s["canonical_name"] for s in result["confirmed_symptoms"]]
    negated_names = [s["canonical_name"] for s in result["negated_symptoms"]]
    
    # Chest Pain and Dyspnea should be confirmed active
    assert any("Chest Pain" in name for name in confirmed_names), f"Expected Chest Pain in {confirmed_names}"
    assert any("Dyspnea" in name or "Shortness of Breath" in name for name in confirmed_names), f"Expected Dyspnea in {confirmed_names}"
    
    # Fever and Vomiting should be marked as denied/ruled-out
    assert any("Fever" in name for name in negated_names), f"Expected Fever in {negated_names}"
    assert any("Vomiting" in name for name in negated_names), f"Expected Vomiting in {negated_names}"

def test_cardiac_emergency_triage_correlation():
    """
    Validates differential condition ranking for cardiac symptoms:
    Chest pain with breathlessness should yield Acute Coronary Syndrome and RED priority.
    """
    text = "Crushing chest pain radiating to left arm and shortness of breath for 1 hour."
    result = perform_semantic_clinical_analysis(text)
    
    assert result["triage_urgency"].startswith("RED")
    assert "Cardiology" in result["recommended_department"] or "Emergency" in result["recommended_department"]
    
    top_conditions = [c["condition"] for c in result["correlated_conditions"]]
    assert any("Coronary" in c or "Infarction" in c or "Angina" in c for c in top_conditions)

def test_respiratory_asthma_correlation():
    """
    Validates respiratory symptoms and functional difficulty extraction.
    """
    text = "Severe wheezing and cannot breathe properly since yesterday."
    result = perform_semantic_clinical_analysis(text)
    
    confirmed = [s["canonical_name"] for s in result["confirmed_symptoms"]]
    assert any("Wheezing" in c for c in confirmed)
    assert "difficulty breathing" in result["functional_difficulties"]
    assert "Pulmonology" in result["recommended_department"] or "Emergency" in result["recommended_department"]

def test_semantic_extract_api_endpoint():
    """
    Validates POST /api/nlp/semantic-extract endpoint.
    """
    payload = {
        "text": "Severe pain in right knee after fall, unable to walk for 2 days. No fever.",
        "reported_severity": "severe"
    }
    response = client.post("/api/nlp/semantic-extract", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    
    res_data = data["data"]
    assert len(res_data["confirmed_symptoms"]) > 0
    assert len(res_data["negated_symptoms"]) > 0
    assert "Orthopedics" in res_data["recommended_department"]
    assert res_data["duration"] == "2 days"
    assert "difficulty walking" in res_data["functional_difficulties"]

def test_knowledge_base_summary_api():
    """
    Validates GET /api/nlp/knowledge-base/summary endpoint for PPT & thesis citation.
    """
    response = client.get("/api/nlp/knowledge-base/summary")
    assert response.status_code == 200
    data = response.json()
    assert data["total_canonical_symptoms"] >= 20
    assert data["total_correlated_diseases"] >= 30
    assert "academic_grounding" in data
    assert "Columbia University" in data["academic_grounding"]

def test_conversational_ankle_sprain_case():
    """
    Validates conversational inversion and typo: 'PAIN IN ANKLE AFTER I GOT ANKLE TIWST'
    """
    payload = {
        "text": "PAIN IN ANKLE AFTER I GOT ANKLE TIWST 2 TIMES CONSECUTIVELY IN PAST 15 DAYS",
        "reported_severity": "moderate"
    }
    response = client.post("/api/nlp/semantic-extract", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    res_data = data["data"]
    
    confirmed = [s["canonical_name"] for s in res_data["confirmed_symptoms"]]
    assert any("Joint Pain" in s for s in confirmed)
    assert res_data["recommended_department"] == "Orthopedics"
    assert res_data["duration"] == "15 days"
    assert res_data["triage_urgency"].startswith("AMBER")
    
    conditions = [c["condition"] for c in res_data["correlated_conditions"]]
    assert any("Ligament Sprain" in c or "Ankle" in c for c in conditions)

def test_dizziness_asthenia_general_medicine_disambiguation():
    """
    Validates clinical disambiguation:
    Dizziness with low energy and inability to stand/walk without physical trauma
    must correlate to General Medicine / Hematology (Low BP / Anemia), NOT Orthopedics / Bone Fracture.
    """
    payload = {
        "text": "hello doctor i am having diziness from long time, i dont know what may be the reason. i am feeling low in energy always. unable to walk, unable to stand",
        "reported_severity": "moderate"
    }
    response = client.post("/api/nlp/semantic-extract", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    res_data = data["data"]
    
    # Must route to General Medicine, NOT Orthopedics
    assert "General Medicine" in res_data["recommended_department"]
    assert "Orthopedics" not in res_data["recommended_department"]
    
    # Verify symptoms detected
    confirmed_names = [s["canonical_name"] for s in res_data["confirmed_symptoms"]]
    assert any("Dizziness" in s for s in confirmed_names)
    assert any("Fatigue" in s or "Asthenia" in s for s in confirmed_names)
    
    # Fracture must be completely suppressed
    assert not any("Fracture" in s for s in confirmed_names)
    
    # Top conditions must include Orthostatic Hypotension or Anemia
    conditions = [c["condition"] for c in res_data["correlated_conditions"]]
    assert any("Orthostatic Hypotension" in c or "Anemia" in c for c in conditions)

def test_rotterdam_pcod_three_clusters_consensus():
    """
    Validates Step 2 Rotterdam 2003 International Clinical Consensus for PCOS/PCOD:
    3 diagnostic feature clusters:
    - Cluster 1: Oligo-/Anovulation (delayed periods > 35 days)
    - Cluster 2: Clinical Hyperandrogenism (facial/chin hair, acne)
    - Cluster 3: Metabolic markers (unexplained weight gain, acanthosis)
    Must route to Obstetrics & Gynecology, promote urgency to AMBER,
    and attach standardized diagnostic workup & designated pilot centers.
    """
    narrative = "Irregular periods delayed by 2 months, excess facial hair on chin, and sudden weight gain for past 6 months"
    result = perform_semantic_clinical_analysis(narrative)
    
    assert "pcod_evaluation" in result
    pcod = result["pcod_evaluation"]
    assert pcod["is_pcod_suspected"] is True
    assert pcod["rotterdam_consensus_met"] is True
    assert pcod["rotterdam_cluster_count"] == 3
    assert pcod["confidence_score"] >= 90.0
    assert result["recommended_department"] == "Obstetrics & Gynecology"
    assert result["triage_urgency"].startswith("AMBER")
    
    # Top correlated condition must be PCOS with ICD-10 E28.2
    assert len(result["correlated_conditions"]) > 0
    top_cond = result["correlated_conditions"][0]
    assert "Polycystic" in top_cond["condition"] or "PCOS" in top_cond["condition"]
    assert top_cond["icd10"] == "E28.2"
    assert top_cond["department"] == "Obstetrics & Gynecology"
    
    # Validate designated centers of excellence (Vani Vilas & KC General)
    facilities = pcod["recommended_facilities"]
    assert any("Vani Vilas" in f["name"] for f in facilities)
    assert any("K.C. General" in f["name"] for f in facilities)
    
    # Validate 5 standardized diagnostic tests
    panel = pcod["recommended_diagnostic_panel"]
    assert len(panel) == 5
    test_names = [t["test_name"] for t in panel]
    assert any("Pelvic Ultrasound" in t for t in test_names)
    assert any("LH : FSH" in t for t in test_names)
    assert any("Testosterone" in t for t in test_names)
    assert any("Insulin" in t for t in test_names)
    assert any("Anti-Müllerian Hormone" in t or "AMH" in t for t in test_names)

def test_rotterdam_pcod_two_clusters_consensus():
    """
    Validates Rotterdam diagnostic threshold with 2 clusters (Oligo/anovulation + Hyperandrogenism)
    without metabolic weight gain.
    """
    narrative = "Delayed menstrual cycles longer than 35 days and cystic acne on jawline with excess facial hair"
    result = perform_semantic_clinical_analysis(narrative)
    
    pcod = result["pcod_evaluation"]
    assert pcod["is_pcod_suspected"] is True
    assert pcod["rotterdam_consensus_met"] is True
    assert pcod["rotterdam_cluster_count"] == 2
    assert result["recommended_department"] == "Obstetrics & Gynecology"

def test_rotterdam_pcod_negation_cycle_regularity():
    """
    Validates clinical NegEx negation handling for menstrual history:
    If patient explicitly states periods are regular, Cluster 1 MUST be ruled out.
    """
    narrative = "Patient has stubborn chin hair, but periods are regular and normal cycles"
    result = perform_semantic_clinical_analysis(narrative)
    
    pcod = result["pcod_evaluation"]
    criteria = pcod["rotterdam_criteria_met"]
    # Cluster 1 must NOT be satisfied
    assert not any("Cluster 1" in c for c in criteria)
    # Only Cluster 2 (Hyperandrogenism) is matched -> 1 cluster -> rotterdam_consensus_met is False
    assert pcod["rotterdam_cluster_count"] == 1
    assert pcod["rotterdam_consensus_met"] is False
    assert pcod["rotterdam_classification"].startswith("Moderate Clinical Suspicion")

def test_rotterdam_pcod_api_endpoint():
    """
    Validates POST /api/nlp/semantic-extract for PCOD case.
    """
    payload = {
        "text": "Irregular periods delayed by 2 months, excess facial hair on chin, and sudden weight gain for past 6 months",
        "reported_severity": "moderate"
    }
    response = client.post("/api/nlp/semantic-extract", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    res = data["data"]
    
    assert res["recommended_department"] == "Obstetrics & Gynecology"
    assert res["pcod_evaluation"]["rotterdam_consensus_met"] is True
    assert res["pcod_evaluation"]["rotterdam_cluster_count"] == 3


