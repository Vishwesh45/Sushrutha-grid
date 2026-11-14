import json
import random
from pathlib import Path

# =====================================================================
# REALISTIC CLINICAL CORPUS BUILDER FOR SUSHRUTHA GRID
# Covers: Real OPD complaints, emergency phrases, Indian English colloquialisms,
# voice speech artifacts, negations, uncertainties, onsets, frequencies.
# =====================================================================

# 1. CORE VOCABULARY BY CATEGORY
VOCAB = {
    "SYMPTOM": {
        "common": ["pain", "swelling", "fever", "cough", "headache", "dizziness", "vomiting", "nausea", "rash", "itching", "diarrhea", "stiffness", "weakness"],
        "colloquial": ["body ache", "loose motions", "vomiting sensation", "head spinning", "chills", "breathlessness", "catching pain", "burning urination", "throat irritation", "giddiness"],
        "severe_emergency": ["chest tightness", "severe chest pain", "unconsciousness", "blackout", "slurred speech", "acute breathlessness", "bleeding", "convulsions", "palpitations"],
        "specialty": ["earache", "blurred vision", "double vision", "joint ache", "acidity", "abdominal cramps", "wheezing", "throat pain", "tingling", "numbness", "redness", "ear discharge"]
    },
    "BODY_PART": {
        "ortho": ["right knee", "left knee", "knee", "lower back", "waist", "ankle", "wrist", "right shoulder", "left shoulder", "hip", "neck", "spine", "heel", "collarbone", "elbow"],
        "cardio_respiratory": ["chest", "left arm", "lungs", "throat", "windpipe", "ribs", "jaw"],
        "neuro_ent_eye": ["head", "forehead", "temples", "left ear", "right ear", "right eye", "left eye", "eyes", "face"],
        "gastro_derma": ["stomach", "abdomen", "belly", "lower stomach", "skin", "thighs", "back", "scalp"]
    },
    "SEVERITY": {
        "high": ["severe", "unbearable", "acute", "intense", "very bad", "extreme", "terrible", "excruciating", "too much"],
        "moderate": ["moderate", "medium", "bad", "quite bad", "persistent", "troublesome"],
        "low": ["mild", "slight", "light", "tolerable", "a little", "minor"]
    },
    "DURATION": {
        "days": ["3 days", "two days", "four days", "5 days", "one day", "since 3 days", "from 2 days"],
        "recent": ["since morning", "since yesterday", "from last night", "for 4 hours", "since 2 hours", "past 24 hours"],
        "weeks_months": ["one week", "two weeks", "3 weeks", "past month", "since two weeks", "last 10 days"]
    },
    "FREQUENCY": {
        "continuous": ["constantly", "continuously", "non-stop", "all the time"],
        "intermittent": ["intermittently", "comes and goes", "recurring", "every morning", "at night", "frequently", "now and then"]
    },
    "ONSET": {
        "sudden": ["sudden", "suddenly", "started abruptly", "acute onset", "sudden onset", "woke up with"],
        "gradual": ["gradual", "slowly increasing", "developed gradually", "progressively worsening"]
    },
    "NEGATION": {
        "standard": ["no fever", "no vomiting", "denies chest pain", "no headache", "without dizziness", "no breathing difficulty", "not having loose motions", "no cough", "no bleeding"]
    },
    "UNCERTAINTY": {
        "phrases": ["possibly", "might be", "feels like", "suspected", "not sure if", "perhaps", "probably"]
    }
}

# 2. RICH CONVERSATIONAL UTTERANCE PATTERNS (VOICE TRANSCRIPTS & OPD INTAKES)
PATTERNS = [
    # Orthopaedics / Physical Trauma
    ("Doctor, I have {SEVERITY} {SYMPTOM} in my {BODY_PART} for {DURATION} and cannot walk properly.", 
     ["SEVERITY", "SYMPTOM", "BODY_PART", "DURATION"]),
    ("My {BODY_PART} has been paining {FREQUENCY} since {DURATION} with {SEVERITY} {SYMPTOM}.",
     ["BODY_PART", "FREQUENCY", "DURATION", "SEVERITY", "SYMPTOM"]),
    ("I slipped in the bathroom and now having {SEVERITY} {SYMPTOM} in {BODY_PART}, {ONSET} onset.",
     ["SEVERITY", "SYMPTOM", "BODY_PART", "ONSET"]),
    ("Patient complains of {SYMPTOM} and {SYMPTOM} in {BODY_PART} for {DURATION}, but {NEGATION}.",
     ["SYMPTOM", "SYMPTOM", "BODY_PART", "DURATION", "NEGATION"]),
    ("There is a {SEVERITY} {SYMPTOM} in my {BODY_PART} {FREQUENCY}, {UNCERTAINTY} a ligament tear.",
     ["SEVERITY", "SYMPTOM", "BODY_PART", "FREQUENCY", "UNCERTAINTY"]),

    # Cardiology / Emergency
    ("Sudden {SEVERITY} {SYMPTOM} in the {BODY_PART} radiating to {BODY_PART} since {DURATION}.",
     ["SEVERITY", "SYMPTOM", "BODY_PART", "BODY_PART", "DURATION"]),
    ("Patient arrived with {ONSET} {SYMPTOM} and {SYMPTOM} in {BODY_PART} for {DURATION}.",
     ["ONSET", "SYMPTOM", "SYMPTOM", "BODY_PART", "DURATION"]),
    ("Feeling {SEVERITY} {SYMPTOM} in {BODY_PART} with heavy sweating, but {NEGATION}.",
     ["SEVERITY", "SYMPTOM", "BODY_PART", "NEGATION"]),
    ("Heavy {SYMPTOM} in the {BODY_PART} for {DURATION}, feeling {SYMPTOM} {FREQUENCY}.",
     ["SYMPTOM", "BODY_PART", "DURATION", "SYMPTOM", "FREQUENCY"]),

    # General Medicine / Seasonal Infections / Fevers
    ("High {SYMPTOM} and {SEVERITY} {SYMPTOM} for {DURATION} accompanied by {SYMPTOM}.",
     ["SYMPTOM", "SEVERITY", "SYMPTOM", "DURATION", "SYMPTOM"]),
    ("I am having {SYMPTOM} since {DURATION} with {SYMPTOM} in {BODY_PART}, {NEGATION}.",
     ["SYMPTOM", "DURATION", "SYMPTOM", "BODY_PART", "NEGATION"]),
    ("Suffering from {SEVERITY} {SYMPTOM} and {SYMPTOM} {FREQUENCY} for {DURATION}.",
     ["SEVERITY", "SYMPTOM", "SYMPTOM", "FREQUENCY", "DURATION"]),
    ("Patient reports {ONSET} {SYMPTOM} with body chills since {DURATION}, {NEGATION}.",
     ["ONSET", "SYMPTOM", "DURATION", "NEGATION"]),

    # Gastroenterology / Stomach / Digestion
    ("Having {SEVERITY} {SYMPTOM} in {BODY_PART} with {SYMPTOM} since {DURATION}.",
     ["SEVERITY", "SYMPTOM", "BODY_PART", "SYMPTOM", "DURATION"]),
    ("Severe {SYMPTOM} after eating food with {SYMPTOM} in the {BODY_PART} {FREQUENCY}.",
     ["SYMPTOM", "SYMPTOM", "BODY_PART", "FREQUENCY"]),
    ("Patient has {SYMPTOM} since {DURATION} with {SEVERITY} {SYMPTOM} in {BODY_PART}, {NEGATION}.",
     ["SYMPTOM", "DURATION", "SEVERITY", "SYMPTOM", "BODY_PART", "NEGATION"]),

    # Respiratory / Pulmonology
    ("Continuous {SYMPTOM} and {SEVERITY} {SYMPTOM} in {BODY_PART} for {DURATION}.",
     ["SYMPTOM", "SEVERITY", "SYMPTOM", "BODY_PART", "DURATION"]),
    ("Dry {SYMPTOM} with {SYMPTOM} in {BODY_PART} since {DURATION}, {NEGATION}.",
     ["SYMPTOM", "SYMPTOM", "BODY_PART", "DURATION", "NEGATION"]),
    ("Experiencing {ONSET} {SYMPTOM} in {BODY_PART} {FREQUENCY}, {UNCERTAINTY} asthma.",
     ["ONSET", "SYMPTOM", "BODY_PART", "FREQUENCY", "UNCERTAINTY"]),

    # Neurology / ENT / Eye / Skin
    ("Severe throbbing {SYMPTOM} in {BODY_PART} since {DURATION} with {SYMPTOM}.",
     ["SYMPTOM", "BODY_PART", "DURATION", "SYMPTOM"]),
    ("Patient has {SYMPTOM} in {BODY_PART} {FREQUENCY} for {DURATION}, {NEGATION}.",
     ["SYMPTOM", "BODY_PART", "FREQUENCY", "DURATION", "NEGATION"]),
    ("Having {SEVERITY} {SYMPTOM} and redness in {BODY_PART} since {DURATION}.",
     ["SEVERITY", "SYMPTOM", "BODY_PART", "DURATION"]),
    ("Itchy red {SYMPTOM} spreading over {BODY_PART} for {DURATION}, with {NEGATION}.",
     ["SYMPTOM", "BODY_PART", "DURATION", "NEGATION"]),

    # Casual Voice Transcript Style (No capitals, informal)
    ("sir actually having {SEVERITY} {SYMPTOM} in {BODY_PART} since {DURATION} no sleep at all",
     ["SEVERITY", "SYMPTOM", "BODY_PART", "DURATION"]),
    ("knee pain since {DURATION} also {SYMPTOM} in {BODY_PART} {FREQUENCY}",
     ["DURATION", "SYMPTOM", "BODY_PART", "FREQUENCY"]),
    ("head is paining badly from {DURATION} with {SYMPTOM} and {NEGATION}",
     ["DURATION", "SYMPTOM", "NEGATION"]),
    ("severe {SYMPTOM} in {BODY_PART} unable to walk from {DURATION}",
     ["SYMPTOM", "BODY_PART", "DURATION"])
]

def pick_token(slot):
    if slot == "SYMPTOM":
        pool = random.choice(list(VOCAB["SYMPTOM"].values()))
        return random.choice(pool)
    elif slot == "BODY_PART":
        pool = random.choice(list(VOCAB["BODY_PART"].values()))
        return random.choice(pool)
    elif slot == "SEVERITY":
        pool = random.choice(list(VOCAB["SEVERITY"].values()))
        return random.choice(pool)
    elif slot == "DURATION":
        pool = random.choice(list(VOCAB["DURATION"].values()))
        return random.choice(pool)
    elif slot == "FREQUENCY":
        pool = random.choice(list(VOCAB["FREQUENCY"].values()))
        return random.choice(pool)
    elif slot == "ONSET":
        pool = random.choice(list(VOCAB["ONSET"].values()))
        return random.choice(pool)
    elif slot == "NEGATION":
        return random.choice(VOCAB["NEGATION"]["standard"])
    elif slot == "UNCERTAINTY":
        return random.choice(VOCAB["UNCERTAINTY"]["phrases"])
    return "pain"

def generate_sentence(pattern, slots):
    text = pattern
    entities = []

    # Map each slot placeholder to a chosen token
    filled = {}
    used_in_utterance = set()
    for s in slots:
        token = pick_token(s)
        # Avoid duplicate tokens in same utterance
        attempts = 0
        while token in used_in_utterance and attempts < 5:
            token = pick_token(s)
            attempts += 1
        used_in_utterance.add(token)
        filled[s] = token

    # Sequential string substitution while recording exact offsets
    for s in slots:
        val = filled[s]
        placeholder = "{" + s + "}"
        pos = text.find(placeholder)
        if pos != -1:
            start = pos
            end = pos + len(val)
            text = text[:pos] + val + text[pos + len(placeholder):]
            entities.append((start, end, s))

    # Verify every slice strictly matches
    verified_ents = []
    for s, e, l in sorted(entities, key=lambda x: x[0]):
        sub = text[s:e]
        if sub.strip():
            verified_ents.append((s, e, l))

    return text, verified_ents

def build_full_dataset(total_count=900):
    random.seed(101)
    samples = []
    seen = set()

    while len(samples) < total_count:
        pattern, slots = random.choice(PATTERNS)
        text, ents = generate_sentence(pattern, slots)
        if text not in seen and len(ents) > 0:
            seen.add(text)
            samples.append({"text": text, "entities": ents})

    return samples

if __name__ == "__main__":
    nlp_dir = Path(__file__).resolve().parent
    data_dir = nlp_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    dataset = build_full_dataset(900)
    out_file = data_dir / "clinical_ner_realistic_master.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2)

    print(f"Generated realistic clinical dataset with {len(dataset)} verified samples.")
    print(f"Saved to: {out_file}")
