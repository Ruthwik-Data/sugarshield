#!/usr/bin/env python3
"""Benchmarks three SugarShield systems on the frozen gold set:

  A. rule_baseline    — the deterministic engine (lib/riskEngine.ts, ported
                         to Python in data/scripts/risk_engine.py). This is
                         what's actually live in production today.
  B. finetuned_model   — the checkpoint trained by train.py, run standalone.
  C. hybrid             — finetuned_model reconciled with rule_baseline:
                         rule-engine detections are authoritative and can
                         never be suppressed by the model (Part 13's "known
                         high-confidence sugar terms should not disappear
                         because the model missed them"); the model can only
                         ADD detections the rules missed, and risk_level is
                         the more severe of the two.

Writes ml/results/benchmark.json and ml/results/sample_predictions.json.
Every number here comes from actually running both systems against
data/gold/gold.jsonl — nothing is hand-typed.
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from schema import RISK_LEVELS, RISK_RANK, is_valid_prediction  # noqa: E402
from model_io import load_model, generate_json  # noqa: E402


def load_jsonl(path):
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def import_rule_engine(data_scripts_dir):
    sys.path.insert(0, data_scripts_dir)
    import risk_engine  # type: ignore

    return risk_engine


def rule_predict(risk_engine_mod, record, mode="STRICT"):
    start = time.time()
    out = risk_engine_mod.analyze_ingredients_text(record.get("ingredients_raw", ""), mode=mode)
    latency_ms = (time.time() - start) * 1000
    return {
        "riskLevel": out["riskLevel"],
        "containsAddedSugar": out["containsAddedSugar"],
        "containsHiddenSugar": out["containsHiddenSugar"],
        "containsArtificialSweetener": out["containsArtificialSweetener"],
        "containsNaturalSugar": out["containsNaturalSugar"],
        "detectedSugars": out["detectedSugars"],
        "artificialSweeteners": out["artificialSweeteners"],
        "explanation": out["explanation"],
        "latency_ms": latency_ms,
        "valid_json": True,
    }


def model_predict(model, tokenizer, record, max_new_tokens=128):
    result = generate_json(
        model,
        tokenizer,
        record.get("product_name"),
        record.get("ingredients_raw"),
        record.get("nutrition"),
        max_new_tokens=max_new_tokens,
    )
    parsed = result["parsed"]
    valid = is_valid_prediction(parsed)
    if not valid:
        return {
            "riskLevel": None,
            "containsAddedSugar": None,
            "containsHiddenSugar": None,
            "containsArtificialSweetener": None,
            "containsNaturalSugar": None,
            "detectedSugars": [],
            "artificialSweeteners": [],
            "explanation": None,
            "latency_ms": result["latency_ms"],
            "valid_json": False,
            "raw_output": result["raw_output"],
        }
    return {
        "riskLevel": parsed["risk_level"],
        "containsAddedSugar": bool(parsed["contains_added_sugar"]),
        "containsHiddenSugar": bool(parsed["contains_hidden_sugar"]),
        "containsArtificialSweetener": bool(parsed["contains_artificial_sweetener"]),
        "containsNaturalSugar": bool(parsed["contains_natural_sugar"]),
        "detectedSugars": list(parsed.get("detected_sugars") or []),
        "artificialSweeteners": list(parsed.get("artificial_sweeteners") or []),
        "explanation": parsed.get("explanation"),
        "latency_ms": result["latency_ms"],
        "valid_json": True,
        "raw_output": result["raw_output"],
    }


def reconcile_hybrid(rule_pred, model_pred):
    """Deterministic detections always win; the model can only add signal."""
    if not model_pred["valid_json"]:
        # Model produced nothing usable — fall back entirely to the rule engine.
        out = dict(rule_pred)
        out["valid_json"] = True
        out["latency_ms"] = rule_pred["latency_ms"] + model_pred["latency_ms"]
        return out

    detected_sugars = list(dict.fromkeys(rule_pred["detectedSugars"] + model_pred["detectedSugars"]))
    artificial = list(dict.fromkeys(rule_pred["artificialSweeteners"] + model_pred["artificialSweeteners"]))

    rule_rank = RISK_RANK.get(rule_pred["riskLevel"], 0)
    model_rank = RISK_RANK.get(model_pred["riskLevel"], 0)
    risk_level = RISK_LEVELS[max(rule_rank, model_rank)]

    return {
        "riskLevel": risk_level,
        "containsAddedSugar": rule_pred["containsAddedSugar"] or model_pred["containsAddedSugar"],
        "containsHiddenSugar": rule_pred["containsHiddenSugar"] or model_pred["containsHiddenSugar"],
        "containsArtificialSweetener": rule_pred["containsArtificialSweetener"] or model_pred["containsArtificialSweetener"],
        "containsNaturalSugar": rule_pred["containsNaturalSugar"] and model_pred["containsNaturalSugar"],
        "detectedSugars": detected_sugars,
        "artificialSweeteners": artificial,
        "explanation": rule_pred["explanation"],
        "latency_ms": rule_pred["latency_ms"] + model_pred["latency_ms"],
        "valid_json": True,
    }


def compute_metrics(gold_records, preds):
    """preds: list aligned with gold_records, each a prediction dict (may have riskLevel=None if invalid)."""
    n = len(gold_records)
    valid_preds = [(g, p) for g, p in zip(gold_records, preds) if p["riskLevel"] is not None]
    invalid_count = n - len(valid_preds)

    tp = fp = tn = fn = 0
    exact_risk_match = 0
    hidden_gold_total = 0
    hidden_recall_hits = 0
    trigger_gold_total = 0
    trigger_hits = 0

    for g, p in valid_preds:
        gold_flag = g["risk_level"] != "SAFE"
        pred_flag = p["riskLevel"] != "SAFE"
        if gold_flag and pred_flag:
            tp += 1
        elif gold_flag and not pred_flag:
            fn += 1
        elif not gold_flag and pred_flag:
            fp += 1
        else:
            tn += 1

        if p["riskLevel"] == g["risk_level"]:
            exact_risk_match += 1

        if g.get("contains_hidden_sugar"):
            hidden_gold_total += 1
            if p["containsHiddenSugar"]:
                hidden_recall_hits += 1

        gold_terms = {t.lower() for t in (g.get("detected_sugars") or [])}
        if gold_terms:
            trigger_gold_total += 1
            pred_terms = {t.lower() for t in (p.get("detectedSugars") or [])}
            if gold_terms & pred_terms:
                trigger_hits += 1

    total_scored = len(valid_preds)
    accuracy = (tp + tn) / total_scored if total_scored else None
    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    f1 = (2 * precision * recall / (precision + recall)) if (precision and recall and (precision + recall) > 0) else None

    latencies = [p["latency_ms"] for p in preds if p.get("latency_ms") is not None]

    return {
        "n_gold": n,
        "n_scored_valid_json": total_scored,
        "n_invalid_json": invalid_count,
        "json_validity_rate": round((n - invalid_count) / n, 4) if n else None,
        "accuracy": round(accuracy, 4) if accuracy is not None else None,
        "precision": round(precision, 4) if precision is not None else None,
        "recall": round(recall, 4) if recall is not None else None,
        "f1": round(f1, 4) if f1 is not None else None,
        "true_positives": tp,
        "false_positives": fp,
        "true_negatives": tn,
        "false_negatives": fn,
        "risk_level_exact_match_accuracy": round(exact_risk_match / total_scored, 4) if total_scored else None,
        "hidden_sugar_recall": round(hidden_recall_hits / hidden_gold_total, 4) if hidden_gold_total else None,
        "trigger_match_accuracy": round(trigger_hits / trigger_gold_total, 4) if trigger_gold_total else None,
        "avg_latency_ms": round(sum(latencies) / len(latencies), 3) if latencies else None,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gold", default="../data/gold/gold.jsonl")
    ap.add_argument("--checkpoint", default="./checkpoints/sugarshield-v1")
    ap.add_argument("--data_scripts_dir", default="../data/scripts")
    ap.add_argument("--results_dir", default="./results")
    ap.add_argument(
        "--sample_n",
        type=int,
        default=12,
        help="How many records go into sample_predictions.json. Does NOT change how many gold "
        "records are actually evaluated for the benchmark metrics — use --limit for that.",
    )
    ap.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Evaluate only the first N gold records (0 = all). For a fast smoke-test of a slow "
        "model/device before committing to the full run, e.g. --limit 5.",
    )
    ap.add_argument("--device", default="auto", choices=["auto", "cpu", "mps", "cuda"])
    ap.add_argument(
        "--max_new_tokens",
        type=int,
        default=128,
        help="Generation cap per sample. 128 covers the schema's realistic JSON+explanation "
        "length with headroom — see model_io.generate_json's docstring for the sizing.",
    )
    args = ap.parse_args()

    gold_records = load_jsonl(args.gold)
    if not gold_records:
        print(f"ERROR: no gold records at {args.gold}", file=sys.stderr)
        sys.exit(1)
    if args.limit and args.limit > 0:
        gold_records = gold_records[: args.limit]

    risk_engine_mod = import_rule_engine(os.path.abspath(args.data_scripts_dir))

    print(f"Loading checkpoint from {args.checkpoint} ...", flush=True)
    load_start = time.time()
    model, tokenizer = load_model(args.checkpoint, device=args.device)
    resolved_device = getattr(model, "_sugarshield_device", "unknown")
    print(f"Checkpoint loaded in {time.time() - load_start:.1f}s on device={resolved_device}", flush=True)

    n_total = len(gold_records)
    rule_preds, model_preds, hybrid_preds = [], [], []
    eval_start = time.time()
    for i, g in enumerate(gold_records, start=1):
        sample_start = time.time()
        rp = rule_predict(risk_engine_mod, g, mode="STRICT")
        mp = model_predict(model, tokenizer, g, max_new_tokens=args.max_new_tokens)
        hp = reconcile_hybrid(rp, mp)
        rule_preds.append(rp)
        model_preds.append(mp)
        hybrid_preds.append(hp)

        elapsed = time.time() - eval_start
        avg_per_sample = elapsed / i
        eta_s = avg_per_sample * (n_total - i)
        status = "valid" if mp["valid_json"] else f"INVALID JSON, raw={mp.get('raw_output', '')[:60]!r}"
        print(
            f"[{i}/{n_total}] {g.get('id', '?')} — model {mp['latency_ms']:.0f}ms ({status}) "
            f"— sample {time.time() - sample_start:.1f}s, elapsed {elapsed:.0f}s, ETA {eta_s:.0f}s",
            flush=True,
        )

    benchmark = {
        "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "gold_set_size": len(gold_records),
        "systems": {
            "rule_baseline": compute_metrics(gold_records, rule_preds),
            "finetuned_model": compute_metrics(gold_records, model_preds),
            "hybrid": compute_metrics(gold_records, hybrid_preds),
        },
    }

    os.makedirs(args.results_dir, exist_ok=True)
    with open(os.path.join(args.results_dir, "benchmark.json"), "w", encoding="utf-8") as f:
        json.dump(benchmark, f, indent=2)

    sample_n = min(args.sample_n, len(gold_records))
    samples = []
    for i in range(sample_n):
        g = gold_records[i]
        samples.append(
            {
                "id": g.get("id"),
                "product_name": g.get("product_name"),
                "ingredients_raw": g.get("ingredients_raw"),
                "gold": {
                    "risk_level": g.get("risk_level"),
                    "detected_sugars": g.get("detected_sugars"),
                    "artificial_sweeteners": g.get("artificial_sweeteners"),
                },
                "rule_baseline_prediction": rule_preds[i],
                "finetuned_model_prediction": model_preds[i],
                "hybrid_prediction": hybrid_preds[i],
            }
        )
    with open(os.path.join(args.results_dir, "sample_predictions.json"), "w", encoding="utf-8") as f:
        json.dump(samples, f, indent=2)

    print(json.dumps(benchmark, indent=2))


if __name__ == "__main__":
    main()
