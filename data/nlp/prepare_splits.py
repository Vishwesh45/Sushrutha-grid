import json
import random
from pathlib import Path
import spacy
from spacy.tokens import DocBin

# Hard real-world challenging test cases (colloquial phrasing, run-on sentences, voice artifacts)
REAL_WORLD_CHALLENGING_TEST = [
    {
        "text": "Doctor actually from 3 days I have heavy fever and whole body is paining badly.",
        "entities": [[21, 27, "DURATION"], [35, 46, "SYMPTOM"], [51, 65, "BODY_PART"], [69, 76, "SYMPTOM"], [77, 82, "SEVERITY"]]
    },
    {
        "text": "I fell from bike yesterday and my right shoulder has severe swelling and pain.",
        "entities": [[17, 26, "DURATION"], [34, 48, "BODY_PART"], [53, 59, "SEVERITY"], [60, 68, "SYMPTOM"], [73, 77, "SYMPTOM"]]
    },
    {
        "text": "Experiencing sudden sharp pain in chest since morning, no cough and no fever.",
        "entities": [[13, 19, "ONSET"], [20, 25, "SEVERITY"], [26, 30, "SYMPTOM"], [34, 39, "BODY_PART"], [40, 53, "DURATION"], [55, 63, "NEGATION"], [68, 76, "NEGATION"]]
    },
    {
        "text": "Child has continuous vomiting and loose motions for 24 hours, feeling very weak.",
        "entities": [[10, 20, "FREQUENCY"], [21, 29, "SYMPTOM"], [34, 47, "SYMPTOM"], [52, 60, "DURATION"], [70, 79, "SYMPTOM"]]
    },
    {
        "text": "Having terrible headache on left side of head since 2 days, feels like migraine.",
        "entities": [[7, 15, "SEVERITY"], [16, 24, "SYMPTOM"], [28, 45, "BODY_PART"], [46, 58, "DURATION"], [60, 70, "UNCERTAINTY"]]
    },
    {
        "text": "Pain in right knee comes and goes since one week, unable to walk properly.",
        "entities": [[0, 4, "SYMPTOM"], [8, 18, "BODY_PART"], [19, 33, "FREQUENCY"], [34, 48, "DURATION"]]
    },
    {
        "text": "Patient denies chest pain and no vomiting, but has high fever for 3 days.",
        "entities": [[8, 25, "NEGATION"], [30, 41, "NEGATION"], [51, 61, "SYMPTOM"], [66, 72, "DURATION"]]
    },
    {
        "text": "Severe burning sensation in stomach after food since yesterday.",
        "entities": [[0, 6, "SEVERITY"], [7, 24, "SYMPTOM"], [28, 35, "BODY_PART"], [47, 62, "DURATION"]]
    }
]

def convert_to_spacy_bin(nlp, dataset):
    doc_bin = DocBin()
    valid_count = 0
    total_spans = 0

    for item in dataset:
        doc = nlp.make_doc(item["text"])
        ents = []
        for s, e, l in item["entities"]:
            total_spans += 1
            span = doc.char_span(s, e, label=l, alignment_mode="contract")
            if span is not None:
                ents.append(span)
                valid_count += 1
            else:
                span = doc.char_span(s, e, label=l, alignment_mode="expand")
                if span is not None:
                    ents.append(span)
                    valid_count += 1

        doc.ents = ents
        doc_bin.add(doc)

    return doc_bin, valid_count, total_spans

def prepare():
    nlp_dir = Path(__file__).resolve().parent
    data_dir = nlp_dir / "data"
    master_file = data_dir / "clinical_ner_realistic_master.json"

    with open(master_file, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    random.seed(42)
    random.shuffle(dataset)

    n = len(dataset)
    n_train = int(n * 0.70)
    n_dev = int(n * 0.15)

    train_data = dataset[:n_train]
    dev_data = dataset[n_train:n_train + n_dev]
    test_data = dataset[n_train + n_dev:]

    # Add challenging test cases to the test split
    test_data.extend(REAL_WORLD_CHALLENGING_TEST)

    print(f"Dataset Partitions: Train={len(train_data)}, Dev={len(dev_data)}, Test={len(test_data)}")

    nlp = spacy.blank("en")

    train_bin, t_v, t_tot = convert_to_spacy_bin(nlp, train_data)
    dev_bin, d_v, d_tot = convert_to_spacy_bin(nlp, dev_data)
    test_bin, te_v, te_tot = convert_to_spacy_bin(nlp, test_data)

    train_bin.to_disk(data_dir / "train.spacy")
    dev_bin.to_disk(data_dir / "dev.spacy")
    test_bin.to_disk(data_dir / "test.spacy")

    with open(data_dir / "test_raw.json", "w", encoding="utf-8") as f:
        json.dump(test_data, f, indent=2)

    print(f"Train spans aligned: {t_v}/{t_tot}")
    print(f"Dev spans aligned: {d_v}/{d_tot}")
    print(f"Test spans aligned: {te_v}/{te_tot}")
    print("Exported train.spacy, dev.spacy, test.spacy, and test_raw.json successfully.")

if __name__ == "__main__":
    prepare()
