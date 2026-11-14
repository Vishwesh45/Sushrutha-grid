import json
import random
from pathlib import Path
import spacy
from spacy.tokens import DocBin

def convert_to_spacy_docbin(nlp, dataset):
    doc_bin = DocBin()
    skipped_spans = 0
    total_spans = 0

    for sample in dataset:
        text = sample["text"]
        entities = sample["entities"]
        doc = nlp.make_doc(text)
        ents = []

        for start, end, label in entities:
            total_spans += 1
            span = doc.char_span(start, end, label=label, alignment_mode="contract")
            if span is not None:
                ents.append(span)
            else:
                # Try expand alignment if contract was None
                span = doc.char_span(start, end, label=label, alignment_mode="expand")
                if span is not None:
                    ents.append(span)
                else:
                    skipped_spans += 1

        doc.ents = ents
        doc_bin.add(doc)

    print(f"Processed {len(dataset)} documents. Valid spans: {total_spans - skipped_spans}/{total_spans}")
    return doc_bin

def split_and_convert():
    nlp_dir = Path(__file__).resolve().parent
    data_dir = nlp_dir / "data"
    master_file = data_dir / "clinical_ner_master.json"

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

    print(f"Dataset Split: Train={len(train_data)}, Dev={len(dev_data)}, Test={len(test_data)}")

    nlp = spacy.blank("en")

    # Convert to DocBin
    train_bin = convert_to_spacy_docbin(nlp, train_data)
    dev_bin = convert_to_spacy_docbin(nlp, dev_data)
    test_bin = convert_to_spacy_docbin(nlp, test_data)

    train_bin.to_disk(data_dir / "train.spacy")
    dev_bin.to_disk(data_dir / "dev.spacy")
    test_bin.to_disk(data_dir / "test.spacy")

    # Save raw test json for exact entity-level evaluation
    with open(data_dir / "test_raw.json", "w", encoding="utf-8") as f:
        json.dump(test_data, f, indent=2)

    print("Successfully generated train.spacy, dev.spacy, test.spacy, and test_raw.json")

if __name__ == "__main__":
    split_and_convert()
