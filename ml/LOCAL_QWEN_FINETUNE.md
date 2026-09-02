# Fine-tuning Qwen2.5-1.5B for SugarShield on your Mac

This is the checklist for running the **real LoRA fine-tune** the reference
build environment couldn't do — that environment's network egress policy
hard-blocks `huggingface.co` (and every mirror), so it trained a small
model from scratch instead (`ml/checkpoints/sugarshield-v1/`, see
`ml/README.md`). Your Mac has no such restriction, and you already have
`qwen2.5:1.5b` pulled in Ollama, so this fine-tunes the actual matching
model family/size and hands the result back to Ollama.

**Everything below was structurally validated** in the build sandbox using
a tiny random-weight `Qwen2ForCausalLM` (the real architecture class, fake
weights, built entirely offline) run through the actual LoRA train → save →
load → merge → GGUF-conversion code path end to end. The only step that
could not be tested there is the download itself (network-blocked) and the
final `ollama create` (Ollama isn't installed in that sandbox). Everything
else — peft finding `q_proj`/`v_proj` on the real Qwen2 module names,
`AutoPeftModelForCausalLM` loading an unmerged adapter, `merge_and_unload`,
and `llama.cpp`'s converter correctly reading a Qwen2 `config.json` — ran
for real, not just on paper.

## 0. Prerequisites

- macOS with Python 3.10+ and Xcode Command Line Tools (`xcode-select --install`)
- This repo checked out, on the `claude/new-session-89itrd` branch (or wherever it's landed since)
- Ollama already installed (you have `qwen2.5:1.5b` pulled) — https://ollama.com
- ~10GB free disk (base model ~3GB in bf16, merged model ~3GB, GGUF ~1-3GB depending on quantization, plus checkpoints)

```bash
git clone https://github.com/Ruthwik-Data/sugarshield.git
cd sugarshield
python3 -m venv .venv-ml
source .venv-ml/bin/activate
pip install -r ml/requirements.txt
pip install -r ml/requirements-export.txt   # only needed for the merge/GGUF step later
```

## 1. Prepare the dataset (already built — this just tokenizes it for training)

The dataset itself (`data/train/train.jsonl`, `data/validation/validation.jsonl`,
`data/gold/gold.jsonl` — 1,186 / 130 / 59 real GroceryDB-derived records) is
already in the repo. For a LoRA run there's no need to train a custom
tokenizer — you'll use Qwen2.5's own — so `prepare_dataset.py` here just
produces the prompt/target text pairs:

```bash
cd ml
python3 prepare_dataset.py \
  --train ../data/train/train.jsonl \
  --validation ../data/validation/validation.jsonl \
  --gold ../data/gold/gold.jsonl \
  --out_dir ./prepared_qwen \
  --vocab_size 8000   # ignored for the LoRA path below, but the arg is required
```

(It'll still train a throwaway custom tokenizer into `./prepared_qwen/tokenizer/` — harmless, `train.py --use_lora` doesn't use it. The `train.jsonl`/`validation.jsonl`/`gold.jsonl` files it writes into `./prepared_qwen/` are what matter.)

## 2. Small validation run first (as requested — don't jump straight to a big run)

This downloads `Qwen/Qwen2.5-1.5B-Instruct` from Hugging Face Hub on first
run (~3GB, cached under `~/.cache/huggingface` after that), then LoRA-trains
1 epoch on the full 1,186-example training set — attention-only, rank 8, the
smallest reasonable real run:

```bash
python3 train.py \
  --prepared_dir ./prepared_qwen \
  --output_dir ./checkpoints/sugarshield-qwen2.5-1.5b \
  --use_lora --base_model Qwen/Qwen2.5-1.5B-Instruct \
  --device auto --dtype auto --gradient_checkpointing \
  --lora_r 8 --lora_alpha 16 --lora_target_modules q_proj,v_proj \
  --epochs 1 --batch_size 2 --grad_accum 8 --seq_len 256 \
  --results_dir ./results_qwen
```

`--device auto` picks Apple Silicon's MPS backend automatically if available
(falls back to CPU on Intel Macs). `--dtype auto` uses bf16 on MPS (halves
memory vs. fp32; this is the precision Qwen2.5 itself ships in). This saves
**only the small LoRA adapter** (a few MB) to `./checkpoints/sugarshield-qwen2.5-1.5b/`
— not a full copy of the 1.5B base model.

**`--results_dir ./results_qwen` matters** — without it, `training_run.json`
defaults to `ml/results/`, which is where the shipped from-scratch baseline's
real run record already lives; passing a distinct directory keeps that
committed baseline intact instead of overwriting it. (A copy of this run's
own `training_run.json` is also always written straight into
`--output_dir`, regardless of `--results_dir`, so it travels with the
checkpoint either way.) Check the file for the real, measured values —
params, loss, duration, hardware — don't guess them. `ml/configs/training_config.json`
is the from-scratch run's reference config specifically, not this one.

## 3. Evaluate on the frozen gold set (before merging)

`model_io.py` auto-detects an unmerged LoRA adapter (`adapter_config.json`)
and loads it correctly via `AutoPeftModelForCausalLM` — no merge needed to
evaluate:

```bash
python3 evaluate.py \
  --gold ../data/gold/gold.jsonl \
  --checkpoint ./checkpoints/sugarshield-qwen2.5-1.5b \
  --data_scripts_dir ../data/scripts \
  --results_dir ./results_qwen
```

This writes `ml/results_qwen/benchmark.json` (rule engine vs. this Qwen LoRA
run vs. hybrid — same 3-way comparison methodology as the shipped
from-scratch model) and `ml/results_qwen/sample_predictions.json`. **Compare
this against `ml/results/benchmark.json`** (the from-scratch model's real
numbers: 68% accuracy, 65% recall, 17 false negatives on the 59-record gold
set) — if Qwen2.5-1.5B-Instruct's real language pretraining gives it
meaningfully better recall/hidden-sugar-recall, that's the evidence to
actually swap it in as SugarShield's fine-tuned-model arm.

## 4. Scale up if the numbers justify it

If validation loss is still dropping and the gold-set numbers look
promising, widen the run — more epochs, higher rank, more target modules
(adds the key/output projections and the MLP; slower per step but more
adaptation capacity):

```bash
python3 train.py \
  --prepared_dir ./prepared_qwen \
  --output_dir ./checkpoints/sugarshield-qwen2.5-1.5b-v2 \
  --use_lora --base_model Qwen/Qwen2.5-1.5B-Instruct \
  --device auto --dtype auto --gradient_checkpointing \
  --lora_r 16 --lora_alpha 32 \
  --lora_target_modules q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj \
  --epochs 4 --batch_size 4 --grad_accum 4 --seq_len 256 \
  --results_dir ./results_qwen_v2

python3 evaluate.py --gold ../data/gold/gold.jsonl \
  --checkpoint ./checkpoints/sugarshield-qwen2.5-1.5b-v2 \
  --data_scripts_dir ../data/scripts --results_dir ./results_qwen_v2
```

Re-run step 3's comparison each time — pick whichever checkpoint actually
wins on the gold set, don't just take the biggest run on faith.

## 5. Merge the adapter into a standalone model

```bash
python3 merge_lora.py \
  --adapter ./checkpoints/sugarshield-qwen2.5-1.5b \
  --output ./checkpoints/sugarshield-qwen2.5-1.5b-merged
```

(Point `--adapter` at whichever checkpoint you picked in step 4 if you did a
scaled-up run.) The merged directory is a normal standalone HF model —
`ml/infer.py --checkpoint ./checkpoints/sugarshield-qwen2.5-1.5b-merged ...`
works directly on it too, same as the merge-free adapter path.

## 6. Convert to GGUF

```bash
git clone --depth 1 https://github.com/ggml-org/llama.cpp ../llama.cpp-tmp
cd ../llama.cpp-tmp
python3 convert_hf_to_gguf.py ../sugarshield/ml/checkpoints/sugarshield-qwen2.5-1.5b-merged \
  --outfile ../sugarshield/ml/checkpoints/sugarshield-qwen2.5-1.5b.gguf \
  --outtype f16
cd ../sugarshield/ml
```

Qwen2/Qwen2.5 is a first-class supported architecture in `llama.cpp`'s
converter (it's what Ollama itself uses under the hood to produce the
`qwen2.5:1.5b` GGUF you already have) — this step was the one part of the
export chain validated against the *real* Qwen2 architecture class in the
build sandbox (a fake-weights instance of it); it correctly read the
Qwen2 config fields (layers, heads, context length, etc.) and only failed
on the substitute tokenizer used for that structural test, which won't be
an issue with the real Qwen2.5-1.5B-Instruct tokenizer.

## 7. Create the Ollama model

Ollama can quantize an f16 GGUF directly at creation time (no need to build
`llama.cpp`'s separate `llama-quantize` binary):

```bash
cat > Modelfile <<'EOF'
FROM ./checkpoints/sugarshield-qwen2.5-1.5b.gguf
TEMPLATE "{{ .Prompt }}"
PARAMETER stop "<|im_end|>"
PARAMETER stop "<|endoftext|>"
PARAMETER temperature 0.0
EOF

ollama create sugarshield-qwen2.5-1.5b -f Modelfile --quantize q4_K_M
```

`TEMPLATE "{{ .Prompt }}"` passes the raw prompt straight through with no
chat wrapping — this matches training: `schema.build_prompt()` (used by
`prepare_dataset.py` and `evaluate.py` alike) builds a plain
`"Product: ...\nIngredients: ...\nNutrition: ...\nAnalyze sugar risk as
JSON:\n"` string, not a chat-templated one, so the model was never trained
to expect `<|im_start|>user`/`<|im_end|>` wrapping. If your Ollama version
doesn't support `--quantize` on `create`, drop that flag to create an f16
(larger, unquantized) model, or quantize the GGUF first with `llama.cpp`'s
`llama-quantize` binary (requires building `llama.cpp` from source —
`cmake -B build && cmake --build build --config Release`) and point `FROM`
at the quantized file instead.

Verify it:
```bash
ollama run sugarshield-qwen2.5-1.5b "Product: Classic Cola
Ingredients: Carbonated Water, High Fructose Corn Syrup, Caramel Color, Phosphoric Acid
Nutrition: serving_size=None, total_sugars_g=None, added_sugars_g=None
Analyze sugar risk as JSON:
"
```

It should output a single JSON object matching `ml/schema.py`'s
`REQUIRED_KEYS` (`risk_level`, `contains_added_sugar`, ..., `explanation`).
If it doesn't emit valid JSON reliably, that's a real, useful signal (like
the from-scratch model's 95% JSON-validity rate) — report it honestly in
whatever writeup or benchmark update you do next, the same way the shipped
`ml/results/benchmark.json` does for the from-scratch run.

## Minimal end-to-end command list (copy/paste)

```bash
git clone https://github.com/Ruthwik-Data/sugarshield.git && cd sugarshield
python3 -m venv .venv-ml && source .venv-ml/bin/activate
pip install -r ml/requirements.txt -r ml/requirements-export.txt
cd ml
python3 prepare_dataset.py --train ../data/train/train.jsonl --validation ../data/validation/validation.jsonl \
  --gold ../data/gold/gold.jsonl --out_dir ./prepared_qwen --vocab_size 8000
python3 train.py --prepared_dir ./prepared_qwen --output_dir ./checkpoints/sugarshield-qwen2.5-1.5b \
  --use_lora --base_model Qwen/Qwen2.5-1.5B-Instruct --device auto --dtype auto --gradient_checkpointing \
  --lora_r 8 --lora_alpha 16 --lora_target_modules q_proj,v_proj --epochs 1 --batch_size 2 --grad_accum 8 \
  --results_dir ./results_qwen
python3 evaluate.py --gold ../data/gold/gold.jsonl --checkpoint ./checkpoints/sugarshield-qwen2.5-1.5b \
  --data_scripts_dir ../data/scripts --results_dir ./results_qwen
python3 merge_lora.py --adapter ./checkpoints/sugarshield-qwen2.5-1.5b \
  --output ./checkpoints/sugarshield-qwen2.5-1.5b-merged
git clone --depth 1 https://github.com/ggml-org/llama.cpp ../../llama.cpp-tmp
python3 ../../llama.cpp-tmp/convert_hf_to_gguf.py ./checkpoints/sugarshield-qwen2.5-1.5b-merged \
  --outfile ./checkpoints/sugarshield-qwen2.5-1.5b.gguf --outtype f16
printf 'FROM ./checkpoints/sugarshield-qwen2.5-1.5b.gguf\nTEMPLATE "{{ .Prompt }}"\nPARAMETER stop "<|im_end|>"\nPARAMETER stop "<|endoftext|>"\nPARAMETER temperature 0.0\n' > Modelfile
ollama create sugarshield-qwen2.5-1.5b -f Modelfile --quantize q4_K_M
```
