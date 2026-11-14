"""
Sushrutha Semantic Clinical NLP Service
Phase 5 Core Engine: Academic-grade Semantic Analysis & Robust Clinical Information Extraction.
Grounding: Columbia University Medical Center (CUMC) Disease-Symptom Benchmark,
CDC SymCat Clinical Ontology, and WHO ICD-10 Clinical Modification Standard.

Features:
1. Typo-Tolerant Clinical Preprocessing (Handles conversational errors like 'dizzines', 'tiwst', 'vomitting', 'breathles').
2. Anatomical Dependency & Compositionality Engine (Inversion: 'pain in ankle' <-> 'ankle pain', 'twisted ankle' <-> 'ankle sprain').
3. Contextual Clinical Disambiguation (Trauma vs. Systemic Gating: separates physical bone fractures from hemodynamic/vestibular asthenia).
4. Idiomatic & Colloquial Clinical Phrase Matcher across 12 Hospital Departments.
5. NegEx Clinical Assertion Analysis (Distinguishes confirmed active symptoms from ruled-out/denied findings).
6. Multi-Symptom Differential Condition Correlation with WHO ICD-10 codes.
7. Explainable Triage Urgency (RED / AMBER / GREEN) & Department Routing.
"""

import re
import json
import difflib
from pathlib import Path
from functools import lru_cache
from typing import Dict, List, Any, Optional, Set, Tuple

# Locate corpus path in root data directory
POSSIBLE_PATHS = [
    Path(__file__).resolve().parents[3] / "data" / "nlp" / "clinical_symptom_disease_corpus.json",
    Path(__file__).resolve().parents[2] / "data" / "nlp" / "clinical_symptom_disease_corpus.json",
    Path.cwd() / "data" / "nlp" / "clinical_symptom_disease_corpus.json"
]

@lru_cache(maxsize=1)
def load_clinical_corpus() -> Dict[str, Any]:
    """Loads and caches the verified clinical disease-symptom corpus."""
    for p in POSSIBLE_PATHS:
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
    
    return {
        "metadata": {"title": "Fallback Clinical Corpus"},
        "symptoms": [],
        "negation_cues": ["no", "not", "denies", "without", "negative for"]
    }

# Common clinical typos from patient keyboard or Whisper phonetic transcription
CLINICAL_TYPO_MAP = {
    "tiwst": "twist",
    "twisit": "twist",
    "twsted": "twisted",
    "spriand": "sprained",
    "sprainn": "sprain",
    "breathles": "breathless",
    "breathlesness": "breathlessness",
    "breth": "breath",
    "vomitting": "vomiting",
    "vomitted": "vomited",
    "stmoach": "stomach",
    "stomache": "stomach",
    "stomack": "stomach",
    "headche": "headache",
    "headace": "headache",
    "dizzines": "dizziness",
    "dizzyy": "dizzy",
    "dizy": "dizzy",
    "gidiness": "giddiness",
    "giddines": "giddiness",
    "sweling": "swelling",
    "swolen": "swollen",
    "painfull": "painful",
    "urinationn": "urination",
    "urintation": "urination",
    "peeeing": "peeing",
    "coughh": "cough",
    "caugh": "cough",
    "feever": "fever",
    "fevr": "fever",
    "wakness": "weakness",
    "weaknes": "weakness",
    "exhaused": "exhausted",
    "shiverring": "shivering",
    "blod": "blood",
    "palpitationn": "palpitations"
}

# Anatomical body part mappings to canonical symptom IDs & departments
ANATOMICAL_COMPOSITION_RULES = {
    # Musculoskeletal Lower Extremities
    "ankle": {
        "descriptors": ["pain", "hurt", "hurting", "ache", "twist", "twisted", "sprain", "sprained", "swollen", "swelling", "fracture", "injured", "injury", "tender", "stiff"],
        "sym_id": "SYM_JOINT_PAIN",
        "canonical_name": "Joint Pain / Arthralgia / Sprain",
        "region": "Musculoskeletal",
        "department": "Orthopedics",
        "urgency": "urgent"
    },
    "knee": {
        "descriptors": ["pain", "hurt", "hurting", "ache", "twist", "twisted", "sprain", "sprained", "swollen", "swelling", "fracture", "injured", "injury", "tender", "stiff", "popped"],
        "sym_id": "SYM_JOINT_PAIN",
        "canonical_name": "Joint Pain / Arthralgia / Sprain",
        "region": "Musculoskeletal",
        "department": "Orthopedics",
        "urgency": "urgent"
    },
    "shoulder": {
        "descriptors": ["pain", "hurt", "hurting", "ache", "twist", "sprain", "dislocation", "swollen", "stiff", "frozen"],
        "sym_id": "SYM_JOINT_PAIN",
        "canonical_name": "Joint Pain / Arthralgia / Sprain",
        "region": "Musculoskeletal",
        "department": "Orthopedics",
        "urgency": "urgent"
    },
    "wrist": {
        "descriptors": ["pain", "hurt", "hurting", "ache", "twist", "sprain", "swollen", "fracture", "stiff"],
        "sym_id": "SYM_JOINT_PAIN",
        "canonical_name": "Joint Pain / Arthralgia / Sprain",
        "region": "Musculoskeletal",
        "department": "Orthopedics",
        "urgency": "urgent"
    },
    "foot": {
        "descriptors": ["pain", "hurt", "hurting", "ache", "twist", "swollen", "swelling", "sprain"],
        "sym_id": "SYM_JOINT_PAIN",
        "canonical_name": "Joint Pain / Arthralgia / Sprain",
        "region": "Musculoskeletal",
        "department": "Orthopedics",
        "urgency": "urgent"
    },
    "feet": {
        "descriptors": ["pain", "hurt", "hurting", "ache", "swollen", "swelling", "numbness", "burning"],
        "sym_id": "SYM_EDEMA_LEGS",
        "canonical_name": "Bilateral Leg Swelling / Peripheral Edema",
        "region": "Cardiovascular / Lower Extremities",
        "department": "Cardiology / Nephrology",
        "urgency": "urgent"
    },
    "leg": {
        "descriptors": ["pain", "hurt", "hurting", "ache", "swollen", "swelling", "fracture", "broken"],
        "sym_id": "SYM_JOINT_PAIN",
        "canonical_name": "Joint Pain / Arthralgia / Sprain",
        "region": "Musculoskeletal",
        "department": "Orthopedics",
        "urgency": "urgent"
    },
    "arm": {
        "descriptors": ["drooping", "cannot lift", "unable to lift", "weak", "weakness", "paralyzed", "slurred"],
        "sym_id": "SYM_HEMIPARESIS",
        "canonical_name": "Focal Weakness / Paralysis / Stroke Symptoms",
        "region": "Neurological / Musculoskeletal",
        "department": "Neurology / Emergency",
        "urgency": "emergency"
    },
    "hip": {
        "descriptors": ["pain", "hurt", "hurting", "ache", "fracture", "swollen", "stiff", "limping", "dislocation"],
        "sym_id": "SYM_JOINT_PAIN",
        "canonical_name": "Joint Pain / Arthralgia / Sprain",
        "region": "Musculoskeletal",
        "department": "Orthopedics",
        "urgency": "urgent"
    },
    "back": {
        "descriptors": ["pain", "hurt", "hurting", "ache", "stiff", "stiffness", "spasm", "sciatica", "lumbago"],
        "sym_id": "SYM_BACK_PAIN",
        "canonical_name": "Back Pain / Lumbago / Sciatica",
        "region": "Spine / Lumbar",
        "department": "Orthopedics / Spine Clinic",
        "urgency": "routine"
    },
    "spine": {
        "descriptors": ["pain", "hurt", "ache", "stiff", "injury", "disc"],
        "sym_id": "SYM_BACK_PAIN",
        "canonical_name": "Back Pain / Lumbago / Sciatica",
        "region": "Spine / Lumbar",
        "department": "Orthopedics / Spine Clinic",
        "urgency": "routine"
    },
    "neck": {
        "descriptors": ["pain", "hurt", "ache", "stiff", "stiffness", "spasm", "injury", "cervical"],
        "sym_id": "SYM_NECK_PAIN",
        "canonical_name": "Neck Pain / Cervical Spondylosis",
        "region": "Cervical Spine / Neck",
        "department": "Orthopedics / Spine Clinic",
        "urgency": "routine"
    },
    # Cardiovascular & Thorax
    "chest": {
        "descriptors": ["pain", "hurt", "hurting", "ache", "tightness", "tight", "pressure", "heaviness", "burning", "crushing", "discomfort", "constriction"],
        "sym_id": "SYM_CHEST_PAIN",
        "canonical_name": "Chest Pain / Angina",
        "region": "Thorax / Precordium",
        "department": "Cardiology / Emergency",
        "urgency": "emergency"
    },
    "heart": {
        "descriptors": ["pain", "racing", "fluttering", "palpitation", "palpitations", "beating fast", "heavy", "skipping"],
        "sym_id": "SYM_PALPITATIONS",
        "canonical_name": "Palpitations / Tachycardia",
        "region": "Cardiovascular",
        "department": "Cardiology",
        "urgency": "urgent"
    },
    # Gastrointestinal
    "stomach": {
        "descriptors": ["pain", "hurt", "hurting", "ache", "aches", "cramp", "cramps", "cramping", "burning", "upset", "bloated", "vomit"],
        "sym_id": "SYM_ABDOMINAL_PAIN",
        "canonical_name": "Abdominal Pain / Stomach Ache",
        "region": "Abdomen",
        "department": "Gastroenterology / General Surgery",
        "urgency": "urgent"
    },
    "abdomen": {
        "descriptors": ["pain", "hurt", "ache", "cramp", "cramps", "cramping", "distended", "burning", "tender"],
        "sym_id": "SYM_ABDOMINAL_PAIN",
        "canonical_name": "Abdominal Pain / Stomach Ache",
        "region": "Abdomen",
        "department": "General Surgery / Gastroenterology",
        "urgency": "urgent"
    },
    "belly": {
        "descriptors": ["pain", "hurt", "ache", "cramp", "cramps", "swollen"],
        "sym_id": "SYM_ABDOMINAL_PAIN",
        "canonical_name": "Abdominal Pain / Stomach Ache",
        "region": "Abdomen",
        "department": "Gastroenterology",
        "urgency": "urgent"
    },
    # Neurological
    "head": {
        "descriptors": ["pain", "hurt", "hurting", "ache", "throbbing", "splitting", "spinning", "heavy", "migraine", "pounding"],
        "sym_id": "SYM_HEADACHE",
        "canonical_name": "Headache / Cephalea",
        "region": "Head / Cranium",
        "department": "Neurology",
        "urgency": "urgent"
    },
    "face": {
        "descriptors": ["droop", "drooping", "numb", "numbness", "weak", "weakness", "paralysis", "asymmetry"],
        "sym_id": "SYM_HEMIPARESIS",
        "canonical_name": "Focal Weakness / Paralysis / Stroke Symptoms",
        "region": "Neurological / Musculoskeletal",
        "department": "Neurology / Emergency",
        "urgency": "emergency"
    },
    # ENT & Ophthalmic
    "throat": {
        "descriptors": ["pain", "sore", "hurt", "scratchy", "burning", "swallowing", "swollen", "infection"],
        "sym_id": "SYM_SORE_THROAT",
        "canonical_name": "Sore Throat / Pharyngitis / Tonsillitis",
        "region": "ENT / Throat",
        "department": "ENT / General Medicine",
        "urgency": "routine"
    },
    "nose": {
        "descriptors": ["bleed", "bleeding", "discharge", "blocked", "congestion", "blood", "runny"],
        "sym_id": "SYM_EPISTAXIS",
        "canonical_name": "Epistaxis / Nosebleed",
        "region": "ENT / Nasal",
        "department": "ENT / Emergency",
        "urgency": "urgent"
    },
    "eye": {
        "descriptors": ["pain", "red", "redness", "burning", "watery", "vision", "blur", "blurred", "discharge", "foreign body", "scratch"],
        "sym_id": "SYM_EYE_PAIN",
        "canonical_name": "Eye Pain / Ocular Ache",
        "region": "Ophthalmology / Eyes",
        "department": "Ophthalmology",
        "urgency": "urgent"
    },
    "eyes": {
        "descriptors": ["pain", "red", "redness", "burning", "watery", "vision", "blur", "blurred", "discharge", "foreign body", "yellow"],
        "sym_id": "SYM_EYE_PAIN",
        "canonical_name": "Eye Pain / Ocular Ache",
        "region": "Ophthalmology / Eyes",
        "department": "Ophthalmology",
        "urgency": "urgent"
    },
    "ear": {
        "descriptors": ["pain", "ache", "aching", "discharge", "pus", "ringing", "blocked", "hearing"],
        "sym_id": "SYM_EAR_PAIN",
        "canonical_name": "Ear Pain / Otalgia / Ear Discharge",
        "region": "ENT / Ear",
        "department": "ENT",
        "urgency": "routine"
    },
    "ears": {
        "descriptors": ["pain", "ache", "aching", "discharge", "pus", "ringing", "blocked", "hearing", "buzzing"],
        "sym_id": "SYM_EAR_PAIN",
        "canonical_name": "Ear Pain / Otalgia / Ear Discharge",
        "region": "ENT / Ear",
        "department": "ENT",
        "urgency": "routine"
    },
    # Urological & Renal
    "urine": {
        "descriptors": ["burning", "pain", "painful", "blood", "frequent", "dark", "cloudy", "difficulty", "frequently"],
        "sym_id": "SYM_DYSURIA",
        "canonical_name": "Dysuria / Painful Urination",
        "region": "Urological / Urinary Tract",
        "department": "Urology / General Medicine",
        "urgency": "urgent"
    },
    "peeing": {
        "descriptors": ["burning", "pain", "painful", "blood", "frequent", "hurt", "blood", "stinging"],
        "sym_id": "SYM_DYSURIA",
        "canonical_name": "Dysuria / Painful Urination",
        "region": "Urological / Urinary Tract",
        "department": "Urology / General Medicine",
        "urgency": "urgent"
    },
    "kidney": {
        "descriptors": ["pain", "ache", "stones", "flank", "side pain"],
        "sym_id": "SYM_FLANK_PAIN",
        "canonical_name": "Flank Pain / Renal Colic",
        "region": "Renal / Flank / Loin",
        "department": "Urology / Emergency",
        "urgency": "urgent"
    },
    "flank": {
        "descriptors": ["pain", "ache", "severe", "stabbing"],
        "sym_id": "SYM_FLANK_PAIN",
        "canonical_name": "Flank Pain / Renal Colic",
        "region": "Renal / Flank / Loin",
        "department": "Urology / Emergency",
        "urgency": "urgent"
    },
    # Dermatology
    "skin": {
        "descriptors": ["rash", "itching", "itchy", "blister", "blisters", "red", "spots", "hives", "peeling", "yellow"],
        "sym_id": "SYM_SKIN_RASH",
        "canonical_name": "Skin Rash / Eruption",
        "region": "Dermatological / Integumentary",
        "department": "Dermatology",
        "urgency": "routine"
    },
    # OB-GYN & Pelvic
    "pelvis": {
        "descriptors": ["pain", "cramps", "cramping", "sharp", "ache"],
        "sym_id": "SYM_PELVIC_PAIN",
        "canonical_name": "Pelvic Pain / Lower Abdominal Gynecological Pain",
        "region": "Pelvic Cavity",
        "department": "Obstetrics & Gynecology",
        "urgency": "urgent"
    }
}

# Idiomatic regex patterns for conversational clinical statements across all 12 departments
DESCRIPTIVE_IDIOMATIC_PATTERNS = [
    # 1. Systemic Asthenia / Fatigue & Vitality
    (r"\b(low\s+(?:in\s+)?energy|no\s+energy|feeling\s+low\s+(?:in\s+)?energy|energy\s+is\s+low|feeling\s+drained|drained\s+out|completely\s+exhausted|body\s+(?:is\s+)?weak|feeling\s+weak|loss\s+of\s+strength|unable\s+to\s+stand|cannot\s+stand|hard\s+to\s+stand)\b",
     "SYM_FATIGUE", "Generalized Fatigue / Asthenia / Low Energy", "Systemic", "routine"),
     
    # 2. Dizziness & Vertigo
    (r"\b(diziness|dizziness|feeling\s+dizzy|feeling\s+giddy|giddiness|room\s+spinning|head\s+spinning|spinning\s+sensation|lightheaded(?:ness)?|loss\s+of\s+balance|unsteady\s+walk(?:ing)?|feeling\s+unsteady)\b",
     "SYM_DIZZINESS", "Dizziness / Vertigo / Lightheadedness", "Neurological / Vestibular", "urgent"),
     
    # 3. Gastrointestinal: Diarrhea / Loose motions
    (r"\b(loose\s+motions?|watery\s+motions?|watery\s+stools?|frequent\s+motions?|stomach\s+purging|runny\s+stomach)\b",
     "SYM_DIARRHEA", "Diarrhea / Loose Motions", "Gastrointestinal", "routine"),
     
    # 4. Gastrointestinal: Throwing up / Vomiting
    (r"\b(throwing\s+up|felt\s+like\s+throwing\s+up|feel\s+like\s+throwing\s+up|puking|feeling\s+sick\s+to\s+stomach|vomiting\s+bile|vomiting\s+food)\b",
     "SYM_VOMITING", "Nausea / Vomiting / Emesis", "Gastrointestinal", "routine"),
     
    # 5. Gastrointestinal: Rectal bleeding / Blood in stool
    (r"\b(blood\s+in\s+stool|bleeding\s+(?:from\s+)?rectum|black\s+tarry\s+stool|bleeding\s+piles|blood\s+when\s+passing\s+stool)\b",
     "SYM_RECTAL_BLEEDING", "Rectal Bleeding / Melena / Hematochezia", "Lower GI / Colorectal", "urgent"),
     
    # 6. Gastrointestinal: Jaundice / Yellow eyes
    (r"\b(yellow\s+eyes|yellow\s+skin|yellowish\s+eyes|dark\s+yellow\s+urine|jaundice)\b",
     "SYM_JAUNDICE", "Jaundice / Hyperbilirubinemia", "Hepatic / Systemic", "urgent"),

    # 7. Respiratory: Dyspnea / Breathlessness
    (r"\b(difficulty\s+(?:in\s+)?breathing|hard\s+to\s+breathe|trouble\s+(?:in\s+)?breathing|out\s+of\s+breath|gasping(?:\s+for\s+air)?|breathless(?:ness)?|cannot\s+catch\s+breath|unable\s+to\s+breathe)\b",
     "SYM_DYSPNEA", "Shortness of Breath / Dyspnea", "Pulmonology / Respiratory", "emergency"),

    # 8. Respiratory: Wheezing
    (r"\b(whistling\s+sound\s+in\s+chest|wheezing\s+sound|musical\s+breathing|wheezing)\b",
     "SYM_WHEEZING", "Wheezing / Stridor", "Pulmonology / Respiratory", "urgent"),

    # 9. Respiratory: Coughing blood
    (r"\b(coughing\s+(?:up\s+)?blood|blood\s+in\s+sputum|blood\s+in\s+cough|blood\s+phlegm|spitting\s+blood)\b",
     "SYM_HEMOPTYSIS", "Hemoptysis / Coughing Blood", "Pulmonology / Respiratory", "emergency"),

    # 10. Cardiology: Chest pain / Heaviness
    (r"\b(crushing\s+chest\s+pain|heavy\s+(?:weight|stone|pressure)\s+on\s+chest|pain\s+radiating\s+to\s+(?:left\s+)?arm|chest\s+tightness|squeezing\s+chest\s+pain)\b",
     "SYM_CHEST_PAIN", "Chest Pain / Angina", "Thorax / Precordium", "emergency"),

    # 11. Cardiology: Palpitations
    (r"\b(palpitations|rapid\s+heartbeat|fluttering\s+heart|racing\s+heart|irregular\s+pulse|skipping\s+beats|heart\s+racing|pounding\s+heart)\b",
     "SYM_PALPITATIONS", "Palpitations / Tachycardia", "Cardiovascular", "urgent"),

    # 12. Neurology: Stroke symptoms
    (r"\b(face\s+(?:is\s+)?drooping|facial\s+droop(?:ing)?|face\s+is\s+weak|slurred\s+speech|cannot\s+speak|unable\s+to\s+speak|arm\s+is\s+(?:completely\s+)?weak|cannot\s+lift\s+arm|one\s+side\s+(?:is\s+)?weak|one\s+sided\s+weakness)\b",
     "SYM_HEMIPARESIS", "Focal Weakness / Paralysis / Stroke Symptoms", "Neurological / Musculoskeletal", "emergency"),

    # 13. Neurology: Seizures
    (r"\b(seizure|convulsions|epileptic\s+fit|fits|shaking\s+uncontrollably|frothing\s+at\s+mouth)\b",
     "SYM_SEIZURE", "Seizure / Convulsions / Epilepsy", "Neurological", "emergency"),

    # 14. Orthopedics: Joint sprain & twist
    (r"\b(ankle\s+(?:tiwst|twist|sprain|injury)|twisted\s+(?:my\s+)?ankle|sprained\s+(?:my\s+)?ankle|pain\s+in\s+ankle)\b",
     "SYM_JOINT_PAIN", "Joint Pain / Arthralgia / Sprain", "Musculoskeletal", "urgent"),
    (r"\b(knee\s+(?:tiwst|twist|sprain|injury)|twisted\s+(?:my\s+)?knee|sprained\s+(?:my\s+)?knee|pain\s+in\s+knee)\b",
     "SYM_JOINT_PAIN", "Joint Pain / Arthralgia / Sprain", "Musculoskeletal", "urgent"),

    # 15. Urology: Dysuria & Hematuria
    (r"\b(burning\s+(?:while|when)\s+peeing|burning\s+(?:while|when)\s+urination|hurts\s+to\s+pee|burning\s+urine|pain\s+passing\s+urine)\b",
     "SYM_DYSURIA", "Dysuria / Painful Urination", "Urological / Urinary Tract", "urgent"),
    (r"\b(blood\s+in\s+urine|red\s+urine|pink\s+urine|passing\s+blood\s+in\s+urine)\b",
     "SYM_HEMATURIA", "Hematuria / Blood in Urine", "Urological / Renal", "urgent"),
    (r"\b(kidney\s+pain|flank\s+pain|severe\s+side\s+pain\s+near\s+back|renal\s+colic)\b",
     "SYM_FLANK_PAIN", "Flank Pain / Renal Colic", "Renal / Flank / Loin", "urgent"),

    # 16. ENT: Epistaxis & Ear
    (r"\b(bleeding\s+(?:from\s+)?nose|nosebleed(?:ing)?|nasal\s+bleed(?:ing)?|blood\s+from\s+nose)\b",
     "SYM_EPISTAXIS", "Epistaxis / Nosebleed", "ENT / Nasal", "urgent"),
    (r"\b(pus\s+(?:from|in)\s+ear|fluid\s+leaking\s+from\s+ear|ear\s+discharge)\b",
     "SYM_EAR_PAIN", "Ear Pain / Otalgia / Ear Discharge", "ENT / Ear", "routine"),
    (r"\b(ringing\s+in\s+ears?|buzzing\s+in\s+ears?|tinnitus)\b",
     "SYM_TINNITUS", "Tinnitus / Ringing in Ears", "ENT / Vestibulocochlear", "routine"),

    # 17. Ophthalmology: Red eye & Vision loss
    (r"\b(red\s+eye|bloodshot\s+eye|yellow\s+pus\s+in\s+eye|crusty\s+eye|pink\s+eye)\b",
     "SYM_RED_EYE", "Red Eye / Conjunctivitis / Eye Discharge", "Ophthalmology / Sclera", "routine"),
    (r"\b(vision\s+loss|cannot\s+see|sudden\s+blindness|dark\s+curtain\s+over\s+eye|blurred\s+vision)\b",
     "SYM_VISION_LOSS", "Vision Loss / Blurred Vision / Scotoma", "Ophthalmology / Retina", "emergency"),
    (r"\b(foreign\s+body\s+(?:in\s+)?eye|something\s+in\s+(?:my\s+)?eye|scratch\s+in\s+eye)\b",
     "SYM_CORNEAL_FOREIGN_BODY", "Foreign Body in Eye / Eye Trauma", "Ophthalmology / Cornea", "urgent"),

    # 18. Dermatology: Hives & Blisters
    (r"\b(red\s+welts|hives|urticaria|allergic\s+bumps|raised\s+itchy\s+wheals)\b",
     "SYM_URTICARIA_HIVES", "Urticaria / Hives / Welts", "Dermatological / Immune", "urgent"),
    (r"\b(band\s+of\s+blisters|shingles|painful\s+blisters|water\s+blisters)\b",
     "SYM_SKIN_BLISTERS", "Blisters / Vesicular Eruption", "Dermatological", "urgent"),

    # 19. OB-GYN: Menstrual & Pelvic
    (r"\b(severe\s+period\s+(?:pain|cramps)|cramping\s+during\s+periods|painful\s+periods|menstrual\s+cramps)\b",
     "SYM_DYSMENORRHEA", "Severe Menstrual Pain / Dysmenorrhea", "Pelvis / Reproductive", "routine"),
    (r"\b(heavy\s+(?:period|menstrual)\s+bleeding|bleeding\s+between\s+periods|clots\s+in\s+menstrual)\b",
     "SYM_ABNORMAL_UTERINE_BLEEDING", "Abnormal Uterine Bleeding / Menorrhagia", "Pelvis / Gynecological", "urgent"),
    (r"\b(white\s+discharge|foul\s+smelling\s+vaginal\s+discharge|itching\s+in\s+private\s+area)\b",
     "SYM_VAGINAL_DISCHARGE", "Abnormal Vaginal Discharge / Pruritus Vulvae", "Gynecological", "routine"),

    # 19a. Rotterdam Cluster 1: Oligo-/Anovulation & Irregular Cycles
    (r"\b(irregular\s+(?:periods?|cycles?|menses|menstruation)|delayed\s+(?:periods?|cycles?|menses)|missed\s+(?:periods?|cycles?)|periods?\s+(?:delayed|irregular|skipped|late|missed)|cycles?\s+(?:>|more\s+than|longer\s+than)\s+35\s+days|periods?\s+(?:every|once\s+in)\s+[2-6]\s+months|periods?\s+not\s+regular|infrequent\s+(?:periods?|menstruation)|oligomenorrhea|amenorrhea|no\s+periods?\s+for\s+months)\b",
     "SYM_OLIGOMENORRHEA", "Oligo-/Anovulation (Irregular / Delayed Menstrual Cycles >35 Days)", "Pelvis / Reproductive", "routine"),

    # 19b. Rotterdam Cluster 2: Clinical Hyperandrogenism & Hirsutism
    (r"\b(facial\s+hair|chin\s+hair|hair\s+on\s+(?:my\s+)?(?:face|chin|jawline|upper\s+lip)|coarse\s+(?:facial\s+)?hair|excess(?:ive)?\s+(?:facial|body)\s+hair|hirsutism|jawline\s+acne|cystic\s+acne|severe\s+acne|stubborn\s+acne|adult\s+acne|acne\s+along\s+jawline|male\s+pattern\s+hair\s+loss|scalp\s+hair\s+thinning)\b",
     "SYM_HYPERANDROGENISM", "Clinical Hyperandrogenism (Facial Hair / Hirsutism / Jawline Acne)", "Endocrine / Dermatology", "routine"),

    # 19c. Rotterdam Cluster 3: Metabolic Dysregulation & Polycystic Morphology
    (r"\b(pcod|pcos|polycystic\s+ovar(?:y|ies|ian)|cysts\s+in\s+ovar(?:y|ies)|sudden\s+weight\s+gain|unexplained\s+weight\s+gain|rapid\s+weight\s+gain|difficulty\s+losing\s+weight|belly\s+fat\s+accumulation|acanthosis\s+nigricans|dark\s+(?:velvety\s+)?(?:patches|skin)\s+(?:on\s+)?(?:neck|underarms)|pelvic\s+heaviness|dull\s+pelvic\s+ache|lower\s+belly\s+heaviness)\b",
     "SYM_METABOLIC_PCOD", "Metabolic Dysregulation / Acanthosis Nigricans / Polycystic Marker", "Endocrine / Metabolic", "routine"),

    # 20. Endocrinology: Polydipsia / Polyuria & Hypoglycemia
    (r"\b(excessive\s+thirst|drinking\s+(?:lots\s+of|huge\s+amount\s+of)\s+water|unquenchable\s+thirst|peeing\s+(?:huge|large)\s+volumes)\b",
     "SYM_POLYDIPSIA_POLYURIA", "Excessive Thirst & Frequent Urination (Polydipsia/Polyuria)", "Endocrine / Systemic", "urgent"),
    (r"\b(shaking\s+and\s+sweating|sudden\s+sweating\s+with\s+dizziness|cold\s+sweat\s+and\s+shaking|trembling\s+and\s+dizzy)\b",
     "SYM_HYPOGLYCEMIC_SHAKE", "Hypoglycemia Symptoms / Shaking & Sweating", "Endocrine / Neurological", "emergency")
]

# Physical mechanical trauma markers
TRAUMA_MARKERS = {
    "fall", "fell", "fallen", "accident", "hit", "crash", "collision", "twisted", "twist",
    "crack", "cracked", "popped", "broken", "fracture", "fractured", "bone deformity",
    "deformity", "impact", "injury", "injured", "slipped", "sprain", "sprained", "snapped"
}

# Systemic asthenia / hemodynamic markers
SYSTEMIC_ASTHENIA_MARKERS = {
    "dizziness", "diziness", "dizzy", "vertigo", "lightheaded", "lightheadedness", "spinning",
    "low in energy", "low energy", "no energy", "weakness", "faint", "fainting", "blackout",
    "pale", "tired", "exhausted", "fatigue", "lethargy", "loss of balance", "unsteady", "giddy", "giddiness"
}

def correct_token(match: re.Match) -> str:
    word = match.group(0)
    w_lower = word.lower()
    if w_lower in CLINICAL_TYPO_MAP:
        fixed = CLINICAL_TYPO_MAP[w_lower]
        return fixed.upper() if word.isupper() else fixed
    if len(w_lower) >= 5:
        for typo, fix in CLINICAL_TYPO_MAP.items():
            if difflib.SequenceMatcher(None, w_lower, typo).ratio() >= 0.84:
                return fix.upper() if word.isupper() else fix
    return word

def preprocess_and_correct_typos(text: str) -> str:
    """Normalizes text and corrects common clinical typos while preserving all punctuation, numbers, and clauses."""
    cleaned = re.sub(r"\s+", " ", text).strip()
    return re.sub(r"\b[a-zA-Z]+\b", correct_token, cleaned)

def split_into_clauses(text: str) -> List[str]:
    """Splits narrative into clinical clauses at punctuation marks and contrastive conjunctions."""
    pattern = r"[,;.\n]|(?:\b(?:but|however|although|except|yet|while|nevertheless)\b)"
    clauses = re.split(pattern, text, flags=re.IGNORECASE)
    return [c.strip() for c in clauses if c.strip()]

def extract_duration_from_text(text: str) -> Optional[str]:
    """Extracts temporal duration patterns (English + common Indian OPD phrasing)."""
    # Prefer "for/since X days" over bare age like "2 year old"
    for_match = re.search(
        r"\b(?:for|since|from|last|past)\s+(\d+\s*(?:days?|weeks?|months?|hours?|years?|mins?|minutes?))\b",
        text,
        re.IGNORECASE,
    )
    if for_match:
        return for_match.group(1).lower()

    # "3 days se" / "2 din se" / "1 week se"
    hinglish_se = re.search(
        r"\b(\d+\s*(?:days?|din|weeks?|mahine|months?|hours?|ghante))\s*se\b",
        text,
        re.IGNORECASE,
    )
    if hinglish_se:
        raw = hinglish_se.group(1).lower().replace("din", "days").replace("mahine", "months").replace("ghante", "hours")
        return raw

    word_num = re.search(
        r"\b(?:for|since|from|last|past)\s+"
        r"((?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?|months?|hours?))\b",
        text,
        re.IGNORECASE,
    )
    if word_num:
        return word_num.group(1).lower()

    match = re.search(r"\b(\d+\s*(?:days?|weeks?|months?|hours?|mins?|minutes?))\b", text, re.IGNORECASE)
    if match:
        return match.group(1).lower()

    since_match = re.search(
        r"\b((?:since|from)\s+(?:yesterday(?:\s+night)?|last\s+\w+|morning|evening|childhood))\b",
        text,
        re.IGNORECASE,
    )
    if since_match:
        return since_match.group(1).lower()

    past_match = re.search(r"\b(?:past|last)\s+(\d+\s*(?:days?|weeks?|months?|hours?))\b", text, re.IGNORECASE)
    if past_match:
        return past_match.group(1).lower()

    if re.search(r"\b(?:from\s+long\s+time|for\s+a\s+long\s+time|long\s+time|since\s+months)\b", text, re.IGNORECASE):
        return "chronic (> 1 month)"

    return None

def extract_severity_from_text(text: str) -> Optional[str]:
    """Detects explicit clinical severity indicators."""
    lower = text.lower()
    if any(w in lower for w in ["severe", "unbearable", "excruciating", "crushing", "acute", "extreme", "worst"]):
        return "severe"
    if any(w in lower for w in ["moderate", "medium", "persistent", "troublesome", "intense"]):
        return "moderate"
    if any(w in lower for w in ["mild", "slight", "minor", "little", "dull", "intermittent"]):
        return "mild"
    return None

def extract_functional_difficulties(text: str) -> List[str]:
    """Detects functional limitations reported by the patient."""
    lower = text.lower()
    difficulties = []
    
    patterns = {
        "difficulty walking": ["cannot walk", "unable to walk", "difficulty walking", "limping", "can't walk", "hard to walk", "inability to bear weight"],
        "inability to stand": ["cannot stand", "unable to stand", "can't stand", "hard to stand", "difficulty standing"],
        "difficulty breathing": ["cannot breathe", "unable to breathe", "short of breath", "breathless", "can't breathe", "hard to breathe"],
        "difficulty swallowing": ["cannot swallow", "pain swallowing", "difficulty swallowing", "unable to swallow"],
        "inability to move limb": ["unable to move arm", "unable to move leg", "cannot lift arm", "paralyzed", "cannot move right arm", "cannot move left arm"],
        "vision impairment": ["cannot see", "unable to see", "blurred vision", "loss of vision"]
    }
    
    for label, phrases in patterns.items():
        if any(p in lower for p in phrases):
            difficulties.append(label)
            
    return difficulties


# ============================================================================
# ROTTERDAM 2003 INTERNATIONAL CLINICAL CONSENSUS ENGINE FOR PCOD / PCOS
# ============================================================================

ROTTERDAM_DIAGNOSTIC_WORKUP = [
    {
        "test_name": "Pelvic Ultrasound (USG Pelvis / Transvaginal Sonography)",
        "clinical_rationale": "Assess ovarian morphology (>=12 follicles measuring 2-9 mm, ovarian volume >10 mL, peripheral string-of-pearls distribution).",
        "turnaround_time": "Same Day (OPD Sonography)"
    },
    {
        "test_name": "Serum LH : FSH Ratio (Cycle Day 2-3)",
        "clinical_rationale": "Identifies characteristic neuroendocrine hypersecretion of Luteinizing Hormone with LH:FSH ratio > 2:1.",
        "turnaround_time": "24 Hours (Biochemistry Lab)"
    },
    {
        "test_name": "Total & Free Serum Testosterone / DHEAS",
        "clinical_rationale": "Biochemical confirmation of hyperandrogenemia (ovarian/adrenal androgen excess).",
        "turnaround_time": "24-48 Hours"
    },
    {
        "test_name": "Fasting Blood Glucose & Fasting Serum Insulin (HOMA-IR)",
        "clinical_rationale": "Evaluates peripheral insulin resistance and hyperinsulinemic compensatory drive.",
        "turnaround_time": "12 Hours (Fasting Specimen)"
    },
    {
        "test_name": "Anti-Müllerian Hormone (Serum AMH)",
        "clinical_rationale": "Marker of elevated pre-antral follicular reserve and granulosa cell hyperactivity.",
        "turnaround_time": "24 Hours"
    }
]

RECOMMENDED_PCOD_FACILITIES = [
    {
        "hospital_id": "HOSP-BLR-002",
        "name": "Vani Vilas Women & Children Hospital (BMCRI)",
        "specialty": "Apex Maternal & Adolescent PCOD/PCOS Specialty Clinic",
        "location": "Kalasipalya / Victoria Enclave",
        "status": "Designated Center of Excellence"
    },
    {
        "hospital_id": "HOSP-BLR-004",
        "name": "K.C. General Hospital (District Hospital)",
        "specialty": "District Women's Health & Endocrine Clinic",
        "location": "Malleshwaram",
        "status": "District Pilot Center"
    }
]

def evaluate_rotterdam_pcod_consensus(
    narrative: str,
    confirmed_symptoms: List[Dict[str, Any]],
    negated_symptoms: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Evaluates patient narrative against the Rotterdam 2003 International Clinical Consensus for PCOS/PCOD:
    Diagnostic criteria requires at least 2 of 3 clinical feature clusters:
    1. Oligo- or Anovulation (Menstrual Irregularities / Cycles > 35 days)
    2. Clinical or Biochemical Hyperandrogenism (Hirsutism / Acne / Androgenic Alopecia)
    3. Polycystic Ovarian Morphology & Secondary Metabolic Markers (Acanthosis Nigricans / Rapid Weight Gain)
    """
    text_lower = narrative.lower()
    negated_ids = {s["id"] for s in negated_symptoms}
    confirmed_ids = {s["id"] for s in confirmed_symptoms}

    # Negation rules for specific Rotterdam clusters
    # 1. Cluster 1: Oligo- or Anovulation
    cluster1_negated = (
        "SYM_OLIGOMENORRHEA" in negated_ids or
        bool(re.search(r"\b(periods?\s+(?:are\s+)?regular|normal\s+(?:periods?|cycles?|menses)|no\s+(?:irregular|delayed|missed)\s+periods?|denies\s+(?:irregular|delayed)\s+periods?|periods?\s+on\s+time)\b", text_lower))
    )
    cluster1_matched = False
    if not cluster1_negated:
        if "SYM_OLIGOMENORRHEA" in confirmed_ids or re.search(
            r"\b(irregular\s+(?:periods?|cycles?|menses|menstruation)|delayed\s+(?:periods?|cycles?|menses)|missed\s+(?:periods?|cycles?)|periods?\s+(?:delayed|irregular|skipped|late|missed)|cycles?\s+(?:>|more\s+than|longer\s+than)\s+35\s+days|periods?\s+(?:every|once\s+in)\s+[2-6]\s+months|periods?\s+not\s+regular|infrequent\s+(?:periods?|menstruation)|oligomenorrhea|amenorrhea|no\s+periods?\s+for\s+months)\b",
            text_lower
        ):
            cluster1_matched = True

    # 2. Cluster 2: Hyperandrogenism
    cluster2_negated = (
        "SYM_HYPERANDROGENISM" in negated_ids or
        bool(re.search(r"\b(no\s+(?:facial\s+hair|chin\s+hair|hair\s+on\s+face|acne|hirsutism)|denies\s+(?:facial\s+hair|acne|hirsutism)|skin\s+is\s+clear)\b", text_lower))
    )
    cluster2_matched = False
    if not cluster2_negated:
        if "SYM_HYPERANDROGENISM" in confirmed_ids or re.search(
            r"\b(facial\s+hair|chin\s+hair|hair\s+on\s+(?:my\s+)?(?:face|chin|jawline|upper\s+lip)|coarse\s+(?:facial\s+)?hair|excess(?:ive)?\s+(?:facial|body)\s+hair|hirsutism|jawline\s+acne|cystic\s+acne|severe\s+acne|stubborn\s+acne|adult\s+acne|male\s+pattern\s+hair\s+loss|scalp\s+hair\s+thinning)\b",
            text_lower
        ):
            cluster2_matched = True

    # 3. Cluster 3: Metabolic & Polycystic Morphology
    cluster3_negated = (
        "SYM_METABOLIC_PCOD" in negated_ids or
        bool(re.search(r"\b(no\s+weight\s+gain|weight\s+is\s+normal|no\s+pelvic\s+pain)\b", text_lower))
    )
    cluster3_matched = False
    if not cluster3_negated:
        if "SYM_METABOLIC_PCOD" in confirmed_ids or re.search(
            r"\b(pcod|pcos|polycystic\s+ovar(?:y|ies|ian)|cysts\s+in\s+ovar(?:y|ies)|(?:sudden|unexplained|rapid)\s+weight\s+gain|difficulty\s+losing\s+weight|belly\s+fat|acanthosis\s+nigricans|dark\s+(?:velvety\s+)?(?:patches|skin)\s+(?:on\s+)?(?:neck|underarms)|pelvic\s+heaviness|dull\s+pelvic\s+ache)\b",
            text_lower
        ):
            cluster3_matched = True

    matched_criteria = []
    if cluster1_matched:
        matched_criteria.append("Cluster 1: Ovulatory Dysfunction (Irregular / Delayed Menstrual Cycles >35 Days)")
    if cluster2_matched:
        matched_criteria.append("Cluster 2: Clinical Hyperandrogenism (Facial Hair / Hirsutism / Jawline Cystic Acne)")
    if cluster3_matched:
        matched_criteria.append("Cluster 3: Metabolic & Pelvic Markers (Unexplained Weight Gain / Acanthosis Nigricans / Pelvic Heaviness)")

    cluster_count = len(matched_criteria)

    # Rotterdam 2003 diagnostic threshold
    if cluster_count >= 2:
        return {
            "is_pcod_suspected": True,
            "rotterdam_consensus_met": True,
            "rotterdam_classification": "High Clinical Probability — Fulfills Rotterdam 2003 International Consensus (2+ Clusters Met)",
            "rotterdam_criteria_met": matched_criteria,
            "rotterdam_cluster_count": cluster_count,
            "confidence_score": 96.0 if cluster_count == 3 else 92.0,
            "recommended_department": "Obstetrics & Gynecology",
            "recommended_facilities": RECOMMENDED_PCOD_FACILITIES,
            "recommended_diagnostic_panel": ROTTERDAM_DIAGNOSTIC_WORKUP,
            "xai_clinical_rationale": f"Patient symptoms fulfill the Rotterdam 2003 International Clinical Consensus with {cluster_count} confirmed diagnostic clusters ({', '.join([c.split(':')[0] for c in matched_criteria])}). Automatically routed to Obstetrics & Gynecology for pelvic sonography and neuroendocrine profile. Specialized adolescent PCOD clinics are active at Vani Vilas and KC General Hospital."
        }
    elif cluster_count == 1:
        return {
            "is_pcod_suspected": True,
            "rotterdam_consensus_met": False,
            "rotterdam_classification": "Moderate Clinical Suspicion — Single Primary Cluster Presentation",
            "rotterdam_criteria_met": matched_criteria,
            "rotterdam_cluster_count": 1,
            "confidence_score": 74.0,
            "recommended_department": "Obstetrics & Gynecology",
            "recommended_facilities": RECOMMENDED_PCOD_FACILITIES,
            "recommended_diagnostic_panel": ROTTERDAM_DIAGNOSTIC_WORKUP[:3],
            "xai_clinical_rationale": "Single-cluster presentation detected under Rotterdam criteria. Primary referral to Obstetrics & Gynecology recommended for early pelvic sonography and cycle evaluation."
        }
    else:
        return {
            "is_pcod_suspected": False,
            "rotterdam_consensus_met": False,
            "rotterdam_classification": "Rotterdam Criteria Negative (No PCOD Clusters Identified)",
            "rotterdam_criteria_met": [],
            "rotterdam_cluster_count": 0,
            "confidence_score": 0.0,
            "recommended_department": None,
            "recommended_facilities": [],
            "recommended_diagnostic_panel": [],
            "xai_clinical_rationale": None
        }


def perform_semantic_clinical_analysis(narrative: str, reported_severity: Optional[str] = None) -> Dict[str, Any]:
    """
    Robust Semantic NLP Analysis Pipeline.
    Answers:
    1. What symptoms does the patient have (Active)?
    2. What symptoms were ruled out / denied (Negated)?
    3. What anatomical regions are involved?
    4. What are the correlated clinical conditions based on the Columbia/CDC ontology?
    5. What is the recommended hospital department and triage priority?
    """
    # Force reload of corpus to ensure latest definitions
    load_clinical_corpus.cache_clear()
    corpus = load_clinical_corpus()
    symptoms_corpus = corpus.get("symptoms", [])
    negation_cues = corpus.get("negation_cues", [
        "no", "not", "denies", "denied", "without", "negative for", "rules out", "ruled out", "free of"
    ])
    
    clean_text = preprocess_and_correct_typos(narrative)
    clauses = split_into_clauses(clean_text)
    
    confirmed_symptoms = []
    negated_symptoms = []
    anatomical_regions = set()
    matched_symptom_ids = set()
    
    # Check text-level trauma markers vs systemic asthenia markers
    lower_full_text = clean_text.lower()
    has_trauma = any(re.search(r"\b" + re.escape(w) + r"\b", lower_full_text) for w in TRAUMA_MARKERS)
    has_systemic = any(re.search(r"\b" + re.escape(w) + r"\b", lower_full_text) for w in SYSTEMIC_ASTHENIA_MARKERS)
    
    # Process each clause
    for clause in clauses:
        clause_lower = clause.lower()
        clause_tokens = re.findall(r"\b[a-zA-Z]+\b", clause_lower)
        
        # Check if clause contains a negation trigger
        has_negation = False
        negation_trigger = None
        for cue in negation_cues:
            if re.search(r"\b" + re.escape(cue) + r"\b", clause_lower):
                has_negation = True
                negation_trigger = cue
                break
                
        clause_matches = []
        
        # 1. Direct Knowledge Base Synonym & Substring Matching
        for sym in symptoms_corpus:
            matched_synonym = None
            for syn in sym["synonyms"]:
                syn_lower = syn.lower()
                # Exact regex word boundary
                if re.search(r"\b" + re.escape(syn_lower) + r"\b", clause_lower):
                    matched_synonym = syn
                    break
                # Inversion: e.g. "pain in [body]" vs "[body] pain"
                if " pain" in syn_lower:
                    part = syn_lower.replace(" pain", "").strip()
                    if f"pain in {part}" in clause_lower or f"pain in my {part}" in clause_lower:
                        matched_synonym = syn
                        break
            
            if matched_synonym:
                clause_matches.append({
                    "id": sym["id"],
                    "canonical_name": sym["name"],
                    "matched_mention": matched_synonym,
                    "anatomical_region": sym["anatomical_region"],
                    "urgency": sym["urgency"]
                })

        # 2. Descriptive & Idiomatic Regex Patterns
        for pat, sym_id, name, region, urgency in DESCRIPTIVE_IDIOMATIC_PATTERNS:
            m = re.search(pat, clause_lower)
            if m:
                corpus_sym = next((s for s in symptoms_corpus if s["id"] == sym_id), None)
                canonical_name = corpus_sym["name"] if corpus_sym else name
                c_region = corpus_sym["anatomical_region"] if corpus_sym else region
                c_urgency = corpus_sym["urgency"] if corpus_sym else urgency
                
                clause_matches.append({
                    "id": sym_id,
                    "canonical_name": canonical_name,
                    "matched_mention": m.group(0),
                    "anatomical_region": c_region,
                    "urgency": c_urgency
                })

        # 3. Anatomical Compositionality Engine (Inversion Parser)
        for i, tok in enumerate(clause_tokens):
            if tok in ANATOMICAL_COMPOSITION_RULES:
                rule = ANATOMICAL_COMPOSITION_RULES[tok]
                start_win = max(0, i - 6)
                end_win = min(len(clause_tokens), i + 7)
                window_tokens = clause_tokens[start_win:end_win]
                window_text = " ".join(window_tokens)
                
                for desc in rule["descriptors"]:
                    if desc in window_tokens or desc in window_text:
                        corpus_sym = next((s for s in symptoms_corpus if s["id"] == rule["sym_id"]), None)
                        canonical_name = corpus_sym["name"] if corpus_sym else rule["canonical_name"]
                        c_region = corpus_sym["anatomical_region"] if corpus_sym else rule["region"]
                        c_urgency = corpus_sym["urgency"] if corpus_sym else rule["urgency"]
                        
                        clause_matches.append({
                            "id": rule["sym_id"],
                            "canonical_name": canonical_name,
                            "matched_mention": f"{tok} {desc}",
                            "anatomical_region": c_region,
                            "urgency": c_urgency
                        })
                        break

        # Process negation assertion for all candidates in this clause
        for candidate in clause_matches:
            mention = candidate["matched_mention"]
            is_negated = False
            
            if has_negation and negation_trigger:
                neg_pos = clause_lower.find(negation_trigger)
                mention_pos = clause_lower.find(mention)
                if neg_pos != -1 and mention_pos != -1:
                    # Negation occurs before mention within 45 characters
                    if neg_pos < mention_pos and (mention_pos - neg_pos) < 45:
                        is_negated = True
                    # Negation occurs immediately after (e.g. "fever is absent")
                    elif neg_pos > mention_pos and (neg_pos - mention_pos) < 25:
                        is_negated = True
            
            if is_negated:
                if not any(s["id"] == candidate["id"] for s in negated_symptoms):
                    candidate["assertion"] = "DENIED / RULED OUT"
                    negated_symptoms.append(candidate)
            else:
                if candidate["id"] not in matched_symptom_ids:
                    matched_symptom_ids.add(candidate["id"])
                    candidate["assertion"] = "CONFIRMED ACTIVE"
                    confirmed_symptoms.append(candidate)
                    anatomical_regions.add(candidate["anatomical_region"])

    # 4. Contextual Clinical Disambiguation (Trauma vs. Systemic Gating)
    functional_diffs = extract_functional_difficulties(narrative)
    has_mobility_issue = "difficulty walking" in functional_diffs or "inability to stand" in functional_diffs
    
    if has_mobility_issue and not has_trauma and has_systemic:
        # Mobility limitation is non-traumatic; it is an expression of hemodynamic or asthenic collapse
        # Remove erroneously matched bone fracture
        confirmed_symptoms = [s for s in confirmed_symptoms if s["id"] != "SYM_FRACTURE_TRAUMA"]
        matched_symptom_ids.discard("SYM_FRACTURE_TRAUMA")
        
        # Ensure SYM_FATIGUE is confirmed
        if "SYM_FATIGUE" not in matched_symptom_ids:
            corpus_sym = next((s for s in symptoms_corpus if s["id"] == "SYM_FATIGUE"), None)
            canonical_name = corpus_sym["name"] if corpus_sym else "Generalized Fatigue / Asthenia / Low Energy"
            c_region = corpus_sym["anatomical_region"] if corpus_sym else "Systemic"
            c_urgency = corpus_sym["urgency"] if corpus_sym else "routine"
            
            matched_symptom_ids.add("SYM_FATIGUE")
            confirmed_symptoms.append({
                "id": "SYM_FATIGUE",
                "canonical_name": canonical_name,
                "matched_mention": "inability to stand / walk (systemic asthenia)",
                "anatomical_region": c_region,
                "urgency": c_urgency,
                "assertion": "CONFIRMED ACTIVE"
            })
            anatomical_regions.add(c_region)

    # Multi-Symptom Differential Condition Correlation Scoring
    condition_scores: Dict[str, Dict[str, Any]] = {}
    
    for conf_sym in confirmed_symptoms:
        corpus_sym = next((s for s in symptoms_corpus if s["id"] == conf_sym["id"]), None)
        if not corpus_sym:
            continue
            
        for cond_info in corpus_sym.get("associated_conditions", []):
            c_name = cond_info["condition"]
            if c_name not in condition_scores:
                condition_scores[c_name] = {
                    "condition": c_name,
                    "icd10": cond_info.get("icd10", "Unspecified"),
                    "department": cond_info["department"],
                    "priority": cond_info["priority"],
                    "cumulative_weight": 0.0,
                    "matched_symptoms": [],
                    "evidence_count": 0
                }
            
            condition_scores[c_name]["cumulative_weight"] += cond_info["weight"]
            condition_scores[c_name]["matched_symptoms"].append(conf_sym["canonical_name"])
            condition_scores[c_name]["evidence_count"] += 1
            
            if cond_info["priority"] == "RED":
                condition_scores[c_name]["priority"] = "RED"

    # Clinical Syndromic Synergy Boosts
    conf_ids = {s["id"] for s in confirmed_symptoms}
    
    # Pair 1: Dizziness + Fatigue (Orthostatic Hypotension / Severe Anemia)
    if "SYM_DIZZINESS" in conf_ids and "SYM_FATIGUE" in conf_ids:
        for c_name, c_data in condition_scores.items():
            if "Orthostatic Hypotension" in c_name or "Severe Anemia" in c_name:
                c_data["cumulative_weight"] += 0.45
                
    # Pair 2: Chest Pain + Dyspnea (Cardiology Emergency)
    if "SYM_CHEST_PAIN" in conf_ids and "SYM_DYSPNEA" in conf_ids:
        for c_name, c_data in condition_scores.items():
            if "Coronary" in c_name or "Infarction" in c_name or "Heart Failure" in c_name:
                c_data["cumulative_weight"] += 0.50
                
    # Pair 3: Fever + Dysuria / Flank Pain (Pyelonephritis / UTI)
    if "SYM_FEVER" in conf_ids and ("SYM_DYSURIA" in conf_ids or "SYM_FLANK_PAIN" in conf_ids):
        for c_name, c_data in condition_scores.items():
            if "Pyelonephritis" in c_name or "Urinary Tract Infection" in c_name:
                c_data["cumulative_weight"] += 0.45

    # Pair 4: Vomiting + Diarrhea (Acute Gastroenteritis)
    if "SYM_VOMITING" in conf_ids and "SYM_DIARRHEA" in conf_ids:
        for c_name, c_data in condition_scores.items():
            if "Gastroenteritis" in c_name:
                c_data["cumulative_weight"] += 0.40

    # Compute normalized match percentages and sort conditions
    ranked_conditions = []
    for c_data in condition_scores.values():
        synergy_multiplier = 1.0 + (0.30 * (c_data["evidence_count"] - 1))
        final_score = min(98.0, round(c_data["cumulative_weight"] * synergy_multiplier * 50.0, 1))
        
        ranked_conditions.append({
            "condition": c_data["condition"],
            "icd10": c_data["icd10"],
            "department": c_data["department"],
            "priority": c_data["priority"],
            "match_score_pct": final_score,
            "supporting_symptoms": list(dict.fromkeys(c_data["matched_symptoms"])),
            "evidence_grounding": "Columbia CUMC / CDC SymCat Benchmark"
        })
        
    ranked_conditions.sort(key=lambda x: x["match_score_pct"], reverse=True)
    
    # Extract duration and explicit severity
    duration = extract_duration_from_text(narrative)
    detected_severity = extract_severity_from_text(narrative)
    effective_severity = reported_severity or detected_severity or "moderate"
    
    # Triage Urgency Determination
    has_emergency_sym = any(s["urgency"] == "emergency" for s in confirmed_symptoms)
    has_red_condition = any(c["priority"] == "RED" for c in ranked_conditions[:2])
    
    if has_emergency_sym or has_red_condition or (effective_severity == "severe" and len(confirmed_symptoms) > 0):
        triage_urgency = "RED (Immediate Emergency)"
        triage_color = "#dc2626"
    elif any(s["urgency"] == "urgent" for s in confirmed_symptoms) or effective_severity == "moderate" or len(confirmed_symptoms) > 0:
        triage_urgency = "AMBER (Urgent Clinical Evaluation)"
        triage_color = "#d97706"
    else:
        triage_urgency = "GREEN (Routine Consultation)"
        triage_color = "#16a34a"

    # Primary Department Routing
    if ranked_conditions:
        primary_department = ranked_conditions[0]["department"]
    elif any("Musculoskeletal" in r for r in anatomical_regions) and has_trauma:
        primary_department = "Orthopedics"
    elif any("Thorax" in r for r in anatomical_regions):
        primary_department = "Cardiology / Emergency"
    elif any("Pulmonary" in r for r in anatomical_regions):
        primary_department = "Pulmonology"
    elif any("Abdomen" in r for r in anatomical_regions):
        primary_department = "Gastroenterology"
    elif any("Head" in r for r in anatomical_regions):
        primary_department = "Neurology"
    elif any("Eyes" in r or "Ophthalmology" in r for r in anatomical_regions):
        primary_department = "Ophthalmology"
    elif any("ENT" in r for r in anatomical_regions):
        primary_department = "ENT"
    elif any("Dermatology" in r for r in anatomical_regions):
        primary_department = "Dermatology"
    elif any("Urological" in r or "Renal" in r for r in anatomical_regions):
        primary_department = "Urology"
    elif any("Pelvis" in r for r in anatomical_regions):
        primary_department = "Obstetrics & Gynecology"
    elif any("Endocrine" in r for r in anatomical_regions):
        primary_department = "Endocrinology"
    else:
        primary_department = "General Medicine"

    # Explicit specialty overrides when narrative clearly needs a department
    # that may or may not exist on the current hospital roster (availability checked later).
    # Includes common Indian English / Hinglish OPD phrasing.
    narrative_lower = (narrative or "").lower()
    if re.search(
        r"\b(depress(?:ion|ed)|anxiety|panic\s+attack|suicid(?:al|e)|hearing\s+voices|"
        r"psychosis|schizophren|mental\s+health|psychiatric)\b",
        narrative_lower,
    ):
        primary_department = "Psychiatry"
        if triage_urgency.startswith("GREEN"):
            triage_urgency = "AMBER (Urgent Clinical Evaluation)"
            triage_color = "#d97706"
    elif re.search(
        r"\b((?:my|our)\s+(?:baby|infant|child|kid|toddler)|"
        r"(?:baby|infant|toddler)\s+(?:has|with|is)|"
        r"\d+\s*(?:month|year|yr|mo)s?\s*old|"
        r"pediatric|paediatric)\b",
        narrative_lower,
    ):
        primary_department = "Pediatrics"
    elif re.search(
        r"(periods?\s+not\s+coming|irregular\s+periods?|delayed\s+periods?|"
        r"face\s+pe\s+baal|facial\s+hair|hirsut|weight\s+(?:bhi\s+)?(?:suddenly\s+)?(?:badh|gain)|"
        r"\bpcod\b|\bpcos\b|polycystic)",
        narrative_lower,
    ):
        primary_department = "Obstetrics & Gynecology"
    elif re.search(
        r"(knee|ankle|hadaa|haddi|twist|fracture|had\s+di|bone\s+pain|"
        r"dard.*(knee|ankle|leg|had)|mein\s+bahut\s+dard)",
        narrative_lower,
    ) and re.search(r"(knee|ankle|leg|bone|ortho|twist|walk)", narrative_lower):
        primary_department = "Orthopedics"
    elif re.search(
        r"(seene\s+mein|chest\s+pain|left\s+arm|heart\s+pain|cardiac|"
        r"crushing\s+chest|tez\s+dard.*arm)",
        narrative_lower,
    ):
        primary_department = "Cardiology / Emergency"
    elif re.search(
        r"(wheez|saans\s+phool|breathless|shortness\s+of\s+breath|tightness\s+in\s+chest|"
        r"cannot\s+breathe|asthma)",
        narrative_lower,
    ) and not re.search(r"(left\s+arm|crushing|radiat)", narrative_lower):
        primary_department = "Pulmonology"
    elif re.search(
        r"(peeing|urine|jalan.*(pee|urine|susu)|burning\s+(?:sensation\s+)?(?:when\s+)?(?:pass(?:ing)?\s+)?urine|"
        r"susu\s+mein\s+jalan|flank\s+pain|side\s+pain.*pee)",
        narrative_lower,
    ):
        primary_department = "Urology"
    elif re.search(
        r"(aankh|eye\s+red|red\s+eye|blurred\s+vision|dikhai\s+blur|vision\s+loss)",
        narrative_lower,
    ):
        primary_department = "Ophthalmology"
    elif re.search(
        r"(rash|blister|khujli|daane|itch(?:y|ing)?|skin\s+rash|herpes)",
        narrative_lower,
    ):
        primary_department = "Dermatology"
    elif re.search(
        r"(\bear\b|kaan|pus.*ear|ear.*pus|otitis)",
        narrative_lower,
    ):
        primary_department = "ENT"

    # 5. Rotterdam 2003 International Clinical Consensus Evaluation for PCOD / PCOS
    pcod_evaluation = evaluate_rotterdam_pcod_consensus(narrative, confirmed_symptoms, negated_symptoms)
    if pcod_evaluation["is_pcod_suspected"]:
        # Prepend PCOD as primary clinical condition
        pcod_cond = {
            "condition": "Polycystic Ovary Syndrome (PCOS / PCOD)",
            "icd10": "E28.2",
            "department": "Obstetrics & Gynecology",
            "priority": "AMBER",
            "match_score_pct": pcod_evaluation["confidence_score"],
            "supporting_symptoms": [c.split(":")[1].strip().split(" (")[0] for c in pcod_evaluation["rotterdam_criteria_met"]],
            "evidence_grounding": "Rotterdam 2003 International Clinical Consensus / WHO ICD-10 E28.2"
        }
        ranked_conditions = [c for c in ranked_conditions if "Polycystic" not in c["condition"] and "PCOS" not in c["condition"]]
        ranked_conditions.insert(0, pcod_cond)
        
        primary_department = "Obstetrics & Gynecology"
        if triage_urgency.startswith("GREEN"):
            triage_urgency = "AMBER (Urgent Clinical Evaluation)"
            triage_color = "#d97706"

    top_match = ranked_conditions[0] if ranked_conditions else None
    routing_xai = {
        "recommended_department": primary_department,
        "top_condition": top_match.get("condition") if top_match else None,
        "top_match_score_pct": top_match.get("match_score_pct") if top_match else None,
        "top_icd10": top_match.get("icd10") if top_match else None,
        "evidence_grounding": (
            top_match.get("evidence_grounding")
            if top_match
            else "Columbia CUMC / CDC SymCat ontology + NegEx + vernacular specialty rules"
        ),
        "supporting_symptoms": (top_match.get("supporting_symptoms") if top_match else []) or [
            s.get("canonical_name") for s in confirmed_symptoms[:5]
        ],
        "corpus_conditions_ranked": [
            {
                "condition": c.get("condition"),
                "match_score_pct": c.get("match_score_pct"),
                "icd10": c.get("icd10"),
                "department": c.get("department"),
                "supporting_symptoms": c.get("supporting_symptoms") or [],
            }
            for c in ranked_conditions[:5]
        ],
        "summary": (
            f"Routed to {primary_department}"
            + (
                f" because ontology matched '{top_match.get('condition')}' at {top_match.get('match_score_pct')}%"
                if top_match
                else " from confirmed symptoms / specialty narrative rules (no ranked ontology hit above threshold)"
            )
        ),
    }

    return {
        "text": clean_text,
        "confirmed_symptoms": confirmed_symptoms,
        "negated_symptoms": negated_symptoms,
        "anatomical_regions": list(anatomical_regions),
        "duration": duration,
        "severity": effective_severity,
        "functional_difficulties": functional_diffs,
        "correlated_conditions": ranked_conditions[:5],
        "routing_xai": routing_xai,
        "triage_urgency": triage_urgency,
        "triage_color": triage_color,
        "recommended_department": primary_department,
        "pcod_evaluation": pcod_evaluation,
        "academic_citation": {
            "knowledge_base": "Columbia University Medical Center Disease-Symptom Benchmark & CDC SymCat Ontology",
            "clinical_assertion_engine": "NegEx Clinical Negation Standard",
            "pcod_consensus": "Rotterdam 2003 International Clinical Consensus for PCOS",
            "icd10_mapping": "WHO ICD-10 Clinical Modification",
            "citeable_for_thesis": True
        }
    }
