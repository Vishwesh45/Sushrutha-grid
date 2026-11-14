import random
from pathlib import Path
import spacy
from spacy.tokens import DocBin
from spacy.training import Example
from spacy.util import minibatch, compounding

def train_ner_model(epochs=25):
    nlp_dir = Path(__file__).resolve().parent
    data_dir = nlp_dir / "data"
    models_dir = nlp_dir / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    best_model_path = models_dir / "sushrutha_ner_v1"

    train_path = data_dir / "train.spacy"
    dev_path = data_dir / "dev.spacy"

    # Initialize blank English pipeline
    nlp = spacy.blank("en")
    ner = nlp.add_pipe("ner", last=True)

    # Load train and dev data
    train_doc_bin = DocBin().from_disk(train_path)
    dev_doc_bin = DocBin().from_disk(dev_path)

    train_docs = list(train_doc_bin.get_docs(nlp.vocab))
    dev_docs = list(dev_doc_bin.get_docs(nlp.vocab))

    # Add all unique labels to NER pipe
    for doc in train_docs:
        for ent in doc.ents:
            ner.add_label(ent.label_)

    # Create Example objects for training
    train_examples = []
    for doc in train_docs:
        pred_doc = nlp.make_doc(doc.text)
        entities = [(e.start_char, e.end_char, e.label_) for e in doc.ents]
        train_examples.append(Example.from_dict(pred_doc, {"entities": entities}))

    dev_examples = []
    for doc in dev_docs:
        pred_doc = nlp.make_doc(doc.text)
        entities = [(e.start_char, e.end_char, e.label_) for e in doc.ents]
        dev_examples.append(Example.from_dict(pred_doc, {"entities": entities}))

    print(f"Training NER Model: {len(train_examples)} train examples, {len(dev_examples)} dev examples.")
    print(f"Labels ({len(ner.labels)}): {ner.labels}")

    # Initialize training optimizer
    optimizer = nlp.begin_training()
    best_f1 = 0.0

    batch_sizes = compounding(4.0, 32.0, 1.001)

    for epoch in range(1, epochs + 1):
        random.shuffle(train_examples)
        losses = {}
        batches = minibatch(train_examples, size=batch_sizes)

        for batch in batches:
            nlp.update(batch, drop=0.2, sgd=optimizer, losses=losses)

        # Evaluate on dev set
        scores = nlp.evaluate(dev_examples)
        dev_f1 = scores.get("ents_f", 0.0)
        dev_p = scores.get("ents_p", 0.0)
        dev_r = scores.get("ents_r", 0.0)

        print(f"Epoch {epoch:02d}/{epochs:02d} | Loss: {losses.get('ner', 0.0):.2f} | Dev P: {dev_p*100:.2f}% | Dev R: {dev_r*100:.2f}% | Dev F1: {dev_f1*100:.2f}%")

        if dev_f1 > best_f1:
            best_f1 = dev_f1
            nlp.to_disk(best_model_path)

    print(f"\nTraining Complete! Best Validation F1: {best_f1*100:.2f}%")
    print(f"Saved best model to: {best_model_path}")
    return best_model_path

if __name__ == "__main__":
    train_ner_model(epochs=20)
