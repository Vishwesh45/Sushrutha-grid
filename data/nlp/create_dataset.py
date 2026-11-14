import json
import random
from pathlib import Path

# Clinical templates across hospital departments representing voice & text intake
PATIENT_TEMPLATES = [
    # Orthopaedics
    ("I have {SEVERITY} {SYMPTOM} in my {BODY_PART} for {DURATION}.", ["SEVERITY", "SYMPTOM", "BODY_PART", "DURATION"]),
    ("My {BODY_PART} has {SEVERITY} {SYMPTOM} and {SYMPTOM} since {DURATION}.", ["BODY_PART", "SEVERITY", "SYMPTOM", "SYMPTOM", "DURATION"]),
    ("Experiencing {SYMPTOM} in {BODY_PART} {FREQUENCY}, with {ONSET} onset.", ["SYMPTOM", "BODY_PART", "FREQUENCY", "ONSET"]),
    ("There is {SYMPTOM} in the {BODY_PART} for {DURATION}, but {NEGATION}.", ["SYMPTOM", "BODY_PART", "DURATION", "NEGATION"]),
    ("I feel {SEVERITY} {SYMPTOM} in my {BODY_PART} {FREQUENCY}, {UNCERTAINTY} a sprain.", ["SEVERITY", "SYMPTOM", "BODY_PART", "FREQUENCY", "UNCERTAINTY"]),

    # General Medicine / Infection
    ("Suffering from {SEVERITY} {SYMPTOM} and {SYMPTOM} for {DURATION}.", ["SEVERITY", "SYMPTOM", "SYMPTOM", "DURATION"]),
    ("Patient reports {ONSET} {SYMPTOM} accompanied by {SYMPTOM} since {DURATION}.", ["ONSET", "SYMPTOM", "SYMPTOM", "DURATION"]),
    ("Having {SYMPTOM} in {BODY_PART} for {DURATION} with {NEGATION}.", ["SYMPTOM", "BODY_PART", "DURATION", "NEGATION"]),
    ("Continuous {SYMPTOM} with {SEVERITY} {SYMPTOM} {FREQUENCY} for {DURATION}.", ["SYMPTOM", "SEVERITY", "SYMPTOM", "FREQUENCY", "DURATION"]),
    ("I have {SYMPTOM} and {SYMPTOM}, {UNCERTAINTY} a viral fever.", ["SYMPTOM", "SYMPTOM", "UNCERTAINTY"]),

    # Cardiology / Respiratory / Emergency
    ("Severe {SYMPTOM} in {BODY_PART} with {ONSET} onset since {DURATION}.", ["SYMPTOM", "BODY_PART", "ONSET", "DURATION"]),
    ("Experiencing {SEVERITY} {SYMPTOM} in the {BODY_PART} radiating to {BODY_PART}.", ["SEVERITY", "SYMPTOM", "BODY_PART", "BODY_PART"]),
    ("Acute {SYMPTOM} in {BODY_PART} for {DURATION} and {NEGATION}.", ["SYMPTOM", "BODY_PART", "DURATION", "NEGATION"]),
    ("Patient has {SYMPTOM} and {SEVERITY} {SYMPTOM} in {BODY_PART} {FREQUENCY}.", ["SYMPTOM", "SEVERITY", "SYMPTOM", "BODY_PART", "FREQUENCY"]),

    # ENT / Ophthalmology / Dermatology / Neurology
    ("Having {SEVERITY} {SYMPTOM} in {BODY_PART} for {DURATION}.", ["SEVERITY", "SYMPTOM", "BODY_PART", "DURATION"]),
    ("Redness and {SYMPTOM} in {BODY_PART} since {DURATION} with {NEGATION}.", ["SYMPTOM", "BODY_PART", "DURATION", "NEGATION"]),
    ("Patient complains of {SYMPTOM} in {BODY_PART} {FREQUENCY} for {DURATION}.", ["SYMPTOM", "BODY_PART", "FREQUENCY", "DURATION"]),
    ("Sudden {SYMPTOM} and {SYMPTOM} in {BODY_PART} with {SEVERITY} intensity.", ["SYMPTOM", "SYMPTOM", "BODY_PART", "SEVERITY"]),
    ("Persistent {SYMPTOM} in {BODY_PART} for {DURATION}, {NEGATION}.", ["SYMPTOM", "BODY_PART", "DURATION", "NEGATION"]),
    ("Feeling {SYMPTOM} and {SYMPTOM} in {BODY_PART} {FREQUENCY}.", ["SYMPTOM", "SYMPTOM", "BODY_PART", "FREQUENCY"])
]

ENTITIES = {
    "SYMPTOM": [
        "pain", "swelling", "fever", "cough", "headache", "dizziness", "vomiting", "nausea",
        "stiffness", "burning sensation", "rash", "shortness of breath", "chest tightness",
        "abdominal cramps", "throat irritation", "earache", "blurred vision", "numbness",
        "fatigue", "chills", "breathlessness", "itching", "diarrhea", "joint ache", "weakness"
    ],
    "BODY_PART": [
        "right knee", "left knee", "chest", "throat", "head", "stomach", "lower back",
        "left shoulder", "right shoulder", "right eye", "left eye", "left ear", "right ear",
        "neck", "abdomen", "ankle", "wrist", "hip", "upper back", "fingers", "ribs", "lungs"
    ],
    "SEVERITY": [
        "severe", "mild", "moderate", "acute", "intense", "slight", "unbearable",
        "very severe", "sharp", "dull", "high", "extreme"
    ],
    "DURATION": [
        "3 days", "two days", "one week", "four hours", "24 hours", "since morning",
        "two weeks", "five days", "last night", "three weeks", "several days", "48 hours"
    ],
    "FREQUENCY": [
        "constantly", "intermittently", "recurring", "every morning", "at night",
        "comes and goes", "frequently", "continuously", "episodic"
    ],
    "ONSET": [
        "sudden", "gradual", "acute", "sudden onset", "started abruptly", "slowly progressing"
    ],
    "NEGATION": [
        "no fever", "denies chest pain", "no vomiting", "no headache", "without dizziness",
        "no shortness of breath", "no bleeding", "denies cough", "without nausea"
    ],
    "UNCERTAINTY": [
        "possibly", "might be", "suspected", "not sure if", "feels like", "perhaps"
    ]
}

def generate_annotated_sample(template_tuple):
    template, slots = template_tuple
    filled_values = {}
    
    # Track used items to avoid immediate repeats in multi-slot utterances
    used_items = {k: set() for k in ENTITIES}

    for slot in slots:
        choices = [item for item in ENTITIES[slot] if item not in used_items[slot]]
        if not choices:
            choices = ENTITIES[slot]
        chosen = random.choice(choices)
        used_items[slot].add(chosen)
        filled_values[slot] = chosen

    # Format text by replacing sequentially
    text = template
    entities = []
    
    # We build the text and compute exact character offsets
    for slot in slots:
        val = filled_values[slot]
        token = "{" + slot + "}"
        pos = text.find(token)
        if pos != -1:
            start = pos
            end = pos + len(val)
            text = text[:pos] + val + text[pos + len(token):]
            entities.append((start, end, slot))

    # Verify entity spans strictly match substring
    clean_entities = []
    for s, e, l in sorted(entities, key=lambda x: x[0]):
        actual_sub = text[s:e]
        if actual_sub.strip():
            clean_entities.append((s, e, l))

    return text, clean_entities

def build_full_dataset(target_count=850):
    random.seed(42)
    samples = []
    seen_texts = set()

    while len(samples) < target_count:
        tmpl = random.choice(PATIENT_TEMPLATES)
        text, ents = generate_annotated_sample(tmpl)
        if text not in seen_texts:
            seen_texts.add(text)
            samples.append({
                "text": text,
                "entities": ents
            })

    return samples

if __name__ == "__main__":
    out_dir = Path(__file__).resolve().parent / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    
    dataset = build_full_dataset(850)
    out_file = out_dir / "clinical_ner_master.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2)

    print(f"Generated master clinical NER dataset with {len(dataset)} verified samples.")
    print(f"Saved to: {out_file}")
