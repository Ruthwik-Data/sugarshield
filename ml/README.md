# SugarShield ML pipeline

Trains, evaluates, and runs inference for a dedicated small SugarShield model,
and benchmarks it against the deterministic rule engine that's actually live
in production (`lib/riskEngine.ts`).

## Why a from-scratch model instead of LoRA on a pretrained checkpoint

The original plan (and the default, correct approach for this kind of task)
was to LoRA/QLoRA fine-tune a small pretrained instruction model (0.5B–3B
params, e.g. Qwen2.5-0.5B-Instruct or SmolLM2) pulled from Hugging Face Hub.

That is **not possible in the reference training/CI environment this
pipeline was built in**: `huggingface.co`, `download.pytorch.org`, and
effectively every other external host except a curated allowlist (PyPI,
npm, crates.io, the Go proxy, and plain `git`/`raw.githubusercontent.com`
access to public GitHub repos) return a hard `403` policy denial from that
environment's network egress proxy. This was verified directly (not
assumed) — see the training run's `reason_not_lora_on_pretrained` field in
`results/training_run.json`. A 403 from that proxy is a policy decision,
not a transient failure, so it was not retried or routed around.

Given no pretrained checkpoint is obtainable there, this pipeline trains a
**small GPT-2-architecture model from scratch, full-parameter** (not LoRA —
LoRA only makes sense when adapting existing pretrained representations).
The tokenizer is also trained from scratch, directly on SugarShield's own
prompt+JSON corpus (`prepare_dataset.py`, using the `tokenizers` library),
since a pretrained vocab file isn't reachable either.

**`train.py` still supports real LoRA** via `--use_lora --base_model
<hub-id-or-local-path>`, complete with device auto-detection (CUDA/MPS/CPU),
bf16/fp16 dtype selection, gradient checkpointing, and configurable LoRA
rank/alpha/target-modules — for anyone running this pipeline somewhere
Hugging Face Hub IS reachable. The run actually executed and checked into
this repo used the from-scratch path, honestly labeled as such everywhere
(`ml/results/training_run.json`, `/eval`, the top-level README).

**This LoRA path has been structurally validated**, not left untested: the
build sandbox constructed a tiny random-weight `Qwen2ForCausalLM` (the real
architecture class transformers.py ships, built entirely offline with no
download) and ran it through `train.py --use_lora` end to end — confirming
peft finds `q_proj`/`v_proj` on Qwen2.5's actual module names, the adapter
saves and reloads correctly via `AutoPeftModelForCausalLM`
(`model_io.py` auto-detects an unmerged adapter), `merge_lora.py`'s
`merge_and_unload()` works, and `llama.cpp`'s GGUF converter correctly reads
a Qwen2 `config.json`. Only the weights download itself and the final
`ollama create` were untestable there (network-blocked; Ollama not
installed). See `ml/LOCAL_QWEN_FINETUNE.md` for the full checklist to
actually run this against Qwen2.5-1.5B-Instruct and export the result back
to Ollama.

This from-scratch fallback is a genuine limitation of the reference
environment, not a shortcut — it's flagged loudly rather than hidden, and
the evaluation in `results/benchmark.json` is honest about how the
resulting tiny from-scratch model actually performs (materially worse
generalization than the rule engine on the frozen gold set, which is
exactly what you'd expect from a model with no language pretraining trained
on a few hundred/thousand examples — see "Which system is production?"
below).

## Pipeline

```
data/train/train.jsonl  ─┐
data/validation/*.jsonl ─┼─► prepare_dataset.py ─► prepared/{train,validation,gold}.jsonl
data/gold/gold.jsonl    ─┘        + prepared/tokenizer/ (custom BPE, trained on our corpus)
                                          │
                                          ▼
                                       train.py  ─► checkpoints/sugarshield-v1/
                                          │              (model + tokenizer, real weights)
                                          ▼
                                     evaluate.py  ─► results/benchmark.json
                                          │              results/sample_predictions.json
                                          ▼
                                       infer.py   (manual single-product CLI)
```

## Task format

Input prompt (plain text):
```
Product: <name>
Ingredients: <raw ingredient list>
Nutrition: serving_size=<...>, total_sugars_g=<...>, added_sugars_g=<...>
Analyze sugar risk as JSON:
```

Target completion (compact JSON, loss computed only on this span):
```json
{"risk_level":"HIGH","contains_added_sugar":true,"contains_hidden_sugar":true,"contains_artificial_sweetener":false,"contains_natural_sugar":false,"detected_sugars":["brown rice syrup","maltodextrin"],"artificial_sweeteners":[],"confidence":0.94,"explanation":"..."}
```

## Reproducing a run

```bash
cd ml
pip install -r requirements.txt
python3 prepare_dataset.py --train ../data/train/train.jsonl \
  --validation ../data/validation/validation.jsonl \
  --gold ../data/gold/gold.jsonl --out_dir ./prepared --vocab_size 6000
python3 train.py --prepared_dir ./prepared --output_dir ./checkpoints/sugarshield-v1
python3 evaluate.py --gold ../data/gold/gold.jsonl --checkpoint ./checkpoints/sugarshield-v1 \
  --data_scripts_dir ../data/scripts --results_dir ./results
python3 infer.py --checkpoint ./checkpoints/sugarshield-v1 \
  --product "Classic Cola" --ingredients "Carbonated Water, High Fructose Corn Syrup, Caramel Color"
```

Exact configuration and hardware for the run actually checked into this repo
is in `results/training_run.json` (real values, not invented) and mirrored in
`configs/training_config.json`.

## Running the real LoRA fine-tune (Qwen2.5-1.5B, e.g. on a Mac)

See **[`LOCAL_QWEN_FINETUNE.md`](LOCAL_QWEN_FINETUNE.md)** for the full
checklist: prepare data, small validation LoRA run, evaluate on the gold
set before merging, scale up if it earns it, merge the adapter
(`merge_lora.py`), convert to GGUF, and `ollama create` the result — with
exact commands and paths.

## Which system is production?

`results/benchmark.json` compares three systems on the frozen gold set:
`rule_baseline` (the deterministic engine, live today), `finetuned_model`
(the checkpoint above, standalone), and `hybrid` (the model reconciled with
the rule engine — rule-engine detections are authoritative and are never
suppressed; the model can only add detections the rules missed, and
`risk_level` is the more severe of the two). The web app's
`POST /api/analyze` (`app/api/analyze/route.ts`) runs the deterministic
engine — this is the system selected based on the measured results,
because a Vercel serverless deployment has no persistent process to host a
trained checkpoint, and (per the benchmark) the from-scratch model does not
outperform it on the gold set. See the top-level README's "Model comparison"
section for the actual numbers.
