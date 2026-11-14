from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from app.database import get_database
from app.services.semantic_nlp_service import (
    perform_semantic_clinical_analysis,
    load_clinical_corpus
)
from app.services.ner_service import extract_clinical_entities

router = APIRouter(prefix="/api/nlp", tags=["Clinical NLP & Semantic Analysis Module"])

class SemanticNLPRequest(BaseModel):
    text: str = Field(..., min_length=2, description="Patient symptom narrative or transcribed voice text")
    reported_severity: Optional[str] = Field(None, description="Optional patient-reported severity (mild, moderate, severe)")

class LegacyNLPRequest(BaseModel):
    text: str = Field(..., min_length=2, description="Patient symptom narrative")

@router.post("/semantic-extract")
def extract_semantic_clinical_data(request: SemanticNLPRequest):
    """
    Phase 5 Core Research Component:
    Executes Clinical Semantic Analysis on patient narrative:
    1. Clinical Negation Detection (e.g. 'no fever' -> marked as ruled out).
    2. Maps confirmed active symptoms to canonical medical ontology.
    3. Multi-Symptom Differential Condition Correlation grounded in Columbia CUMC & CDC SymCat Benchmark.
    4. Computes explainable triage priority and recommended hospital department with ICD-10 codes.
    """
    if not request.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Narrative text cannot be empty."
        )

    try:
        result = perform_semantic_clinical_analysis(
            narrative=request.text,
            reported_severity=request.reported_severity
        )

        # Log audit event in MongoDB
        try:
            db = get_database()
            db.hospital_events.insert_one({
                "event_type": "CLINICAL_SEMANTIC_ANALYSIS_PERFORMED",
                "confirmed_symptoms_count": len(result["confirmed_symptoms"]),
                "negated_symptoms_count": len(result["negated_symptoms"]),
                "top_condition": result["correlated_conditions"][0]["condition"] if result["correlated_conditions"] else None,
                "recommended_department": result["recommended_department"],
                "triage_urgency": result["triage_urgency"],
                "timestamp": datetime.utcnow().isoformat()
            })
        except Exception as db_err:
            print(f"Warning: MongoDB audit event log failed: {db_err}")

        return {
            "success": True,
            "data": result
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Semantic clinical analysis failed: {str(e)}"
        )

@router.post("/extract")
def extract_entities_from_text(request: LegacyNLPRequest):
    """
    Standard extraction endpoint: combines NER service with Semantic Clinical Analysis.
    """
    if not request.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text cannot be empty."
        )

    try:
        # Run semantic analysis
        semantic_data = perform_semantic_clinical_analysis(request.text)
        
        # Legacy NER fallback
        legacy_data = extract_clinical_entities(request.text)

        # Merge for backwards compatibility
        structured_data = {
            **legacy_data,
            "semantic_analysis": semantic_data,
            "confirmed_symptoms": [s["canonical_name"] for s in semantic_data["confirmed_symptoms"]],
            "negated_symptoms": [s["canonical_name"] for s in semantic_data["negated_symptoms"]],
            "correlated_conditions": semantic_data["correlated_conditions"],
            "triage_urgency": semantic_data["triage_urgency"],
            "recommended_department": semantic_data["recommended_department"]
        }

        return {
            "success": True,
            "structured_data": structured_data
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Entity extraction failed: {str(e)}"
        )

@router.get("/knowledge-base/summary")
def get_knowledge_base_summary():
    """
    Returns metadata about the verified clinical knowledge corpus.
    Can be cited in project PPT presentations and research documentation.
    """
    corpus = load_clinical_corpus()
    symptoms = corpus.get("symptoms", [])
    
    # Calculate stats
    all_conditions = set()
    all_departments = set()
    for s in symptoms:
        for c in s.get("associated_conditions", []):
            all_conditions.add(c["condition"])
            all_departments.add(c["department"])

    return {
        "title": corpus.get("metadata", {}).get("title"),
        "academic_grounding": corpus.get("metadata", {}).get("academic_grounding"),
        "citation": corpus.get("metadata", {}).get("citation"),
        "total_canonical_symptoms": len(symptoms),
        "total_correlated_diseases": len(all_conditions),
        "departments_covered": list(all_departments),
        "negation_cues_indexed": len(corpus.get("negation_cues", []))
    }
