import json
from pathlib import Path
import spacy

def evaluate_test_set():
    nlp_dir = Path(__file__).resolve().parent
    model_path = nlp_dir / "models" / "sushrutha_ner_v1"
    test_file = nlp_dir / "data" / "test_raw.json"
    report_file = nlp_dir / "evaluation_report.json"

    print(f"Loading trained model from: {model_path}")
    nlp = spacy.load(str(model_path))

    with open(test_file, "r", encoding="utf-8") as f:
        test_samples = json.load(f)

    labels = ["SYMPTOM", "BODY_PART", "SEVERITY", "DURATION", "FREQUENCY", "ONSET", "NEGATION", "UNCERTAINTY"]
    stats = {lbl: {"tp": 0, "fp": 0, "fn": 0} for lbl in labels}

    for sample in test_samples:
        text = sample["text"]
        gold_entities = set((s, e, l) for s, e, l in sample["entities"])
        
        doc = nlp(text)
        pred_entities = set((ent.start_char, ent.end_char, ent.label_) for ent in doc.ents)

        for gold in gold_entities:
            s, e, l = gold
            if l in stats:
                if gold in pred_entities:
                    stats[l]["tp"] += 1
                else:
                    stats[l]["fn"] += 1

        for pred in pred_entities:
            s, e, l = pred
            if l in stats:
                if pred not in gold_entities:
                    stats[l]["fp"] += 1

    report = {"per_entity": {}, "macro_avg": {}, "micro_avg": {}, "total_test_samples": len(test_samples)}
    total_tp = sum(stats[l]["tp"] for l in labels)
    total_fp = sum(stats[l]["fp"] for l in labels)
    total_fn = sum(stats[l]["fn"] for l in labels)

    print("\n" + "=" * 70)
    print("SUSHRUTHA GRID — CLINICAL NER EVALUATION REPORT (TEST SET)")
    print("=" * 70)
    print(f"{'Entity':<16} | {'Precision (%)':<14} | {'Recall (%)':<12} | {'F1-Score (%)':<12} | {'Support':<8}")
    print("-" * 70)

    p_list, r_list, f1_list = [], [], []

    for l in labels:
        tp = stats[l]["tp"]
        fp = stats[l]["fp"]
        fn = stats[l]["fn"]
        support = tp + fn

        precision = (tp / (tp + fp)) * 100 if (tp + fp) > 0 else 0.0
        recall = (tp / (tp + fn)) * 100 if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

        p_list.append(precision)
        r_list.append(recall)
        f1_list.append(f1)

        report["per_entity"][l] = {
            "precision": round(precision, 2),
            "recall": round(recall, 2),
            "f1_score": round(f1, 2),
            "support": support
        }

        print(f"{l:<16} | {precision:>13.2f}% | {recall:>11.2f}% | {f1:>11.2f}% | {support:>8}")

    print("-" * 70)
    micro_p = (total_tp / (total_tp + total_fp)) * 100 if (total_tp + total_fp) > 0 else 0.0
    micro_r = (total_tp / (total_tp + total_fn)) * 100 if (total_tp + total_fn) > 0 else 0.0
    micro_f1 = (2 * micro_p * micro_r / (micro_p + micro_r)) if (micro_p + micro_r) > 0 else 0.0

    macro_p = sum(p_list) / len(p_list)
    macro_r = sum(r_list) / len(r_list)
    macro_f1 = sum(f1_list) / len(f1_list)

    report["micro_avg"] = {"precision": round(micro_p, 2), "recall": round(micro_r, 2), "f1_score": round(micro_f1, 2)}
    report["macro_avg"] = {"precision": round(macro_p, 2), "recall": round(macro_r, 2), "f1_score": round(macro_f1, 2)}

    print(f"{'MICRO AVERAGE':<16} | {micro_p:>13.2f}% | {micro_r:>11.2f}% | {micro_f1:>11.2f}% | {total_tp + total_fn:>8}")
    print(f"{'MACRO AVERAGE':<16} | {macro_p:>13.2f}% | {macro_r:>11.2f}% | {macro_f1:>11.2f}% | {total_tp + total_fn:>8}")
    print("=" * 70)

    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"Saved evaluation report to: {report_file}")
    return report

if __name__ == "__main__":
    evaluate_test_set()
