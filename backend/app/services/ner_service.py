import re
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Any

# Locate model path within workspace data directory
WORKSPACE_ROOT = Path(__file__).resolve().parents[3]
MODEL_PATH = WORKSPACE_ROOT / "data" / "nlp" / "models" / "sushrutha_ner_v1"


@lru_cache(maxsize=1)
def get_ner_model():
    """
    Loads and caches the trained Sushrutha spaCy NER model in memory.
    spaCy is optional on cloud deploys — main intake uses semantic_nlp_service.
    """
    try:
        import spacy
    except ImportError:
        print("Warning: spaCy not installed; NER endpoints return empty entities.")
        return None

    if MODEL_PATH.exists():
        print(f"Loading Sushrutha NER model from: {MODEL_PATH}")
        return spacy.load(str(MODEL_PATH))

    print(f"Warning: Model not found at {MODEL_PATH}, falling back to blank en model.")
    return spacy.blank("en")


def preprocess_text(text: str) -> str:
    """Cleans and standardizes input text while preserving punctuation for entity recognition."""
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_clinical_entities(text: str) -> Dict[str, Any]:
    """
    Extracts structured clinical entities from patient narrative.
    Strictly answers: 'What did the patient say?'
    Does NOT diagnose or assign departments.
    """
    clean_text = preprocess_text(text)
    empty = {
        "text": clean_text,
        "entities": [],
        "symptoms": [],
        "body_parts": [],
        "severity": None,
        "duration": None,
        "frequencies": [],
        "onsets": [],
        "negations": [],
        "uncertainties": [],
        "functional_difficulties": [],
    }
    if not clean_text:
        empty["text"] = ""
        return empty

    model = get_ner_model()
    if model is None:
        return empty

    doc = model(clean_text)

    raw_entities = []
    symptoms = []
    body_parts = []
    severities = []
    durations = []
    frequencies = []
    onsets = []
    negations = []
    uncertainties = []

    for ent in doc.ents:
        raw_entities.append({
            "text": ent.text,
            "label": ent.label_,
            "start": ent.start_char,
            "end": ent.end_char,
        })

        lbl = ent.label_.upper()
        ent_text = ent.text.lower().strip()

        if lbl == "SYMPTOM":
            if len(ent_text) > 1 and ent_text not in ["i", "me", "my", "we", "he", "she", "it"]:
                if ent_text not in symptoms:
                    symptoms.append(ent_text)
        elif lbl == "BODY_PART":
            if ent_text not in body_parts:
                body_parts.append(ent_text)
        elif lbl == "SEVERITY":
            if ent_text not in severities:
                severities.append(ent_text)
        elif lbl == "DURATION":
            if ent_text not in durations:
                durations.append(ent_text)
        elif lbl == "FREQUENCY":
            if ent_text not in frequencies:
                frequencies.append(ent_text)
        elif lbl == "ONSET":
            if ent_text not in onsets:
                onsets.append(ent_text)
        elif lbl == "NEGATION":
            if ent_text not in negations:
                negations.append(ent_text)
        elif lbl == "UNCERTAINTY":
            if ent_text not in uncertainties:
                uncertainties.append(ent_text)

    functional_difficulties = []
    lower_text = clean_text.lower()
    if any(phrase in lower_text for phrase in ["cannot walk", "unable to walk", "difficulty walking", "limping"]):
        functional_difficulties.append("difficulty walking")
    if any(phrase in lower_text for phrase in ["difficulty breathing", "unable to breathe", "short of breath", "breathless"]):
        functional_difficulties.append("difficulty breathing")

    primary_severity = severities[0] if severities else None
    primary_duration = durations[0] if durations else None

    return {
        "text": clean_text,
        "entities": raw_entities,
        "symptoms": symptoms,
        "body_parts": body_parts,
        "severity": primary_severity,
        "duration": primary_duration,
        "frequencies": frequencies,
        "onsets": onsets,
        "negations": negations,
        "uncertainties": uncertainties,
        "functional_difficulties": functional_difficulties,
    }
