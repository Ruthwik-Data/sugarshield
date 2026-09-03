# Fine-tune V2, Loop 3: training `sugarshield-qwen-v2-run1`

This is a follow-on to [`LOCAL_QWEN_FINETUNE.md`](LOCAL_QWEN_FINETUNE.md) —
read that first if you haven't already (venv setup, why LoRA-on-Qwen has to
run on your Mac, the MPS device-placement fix, the smoke-test step). This
file covers only what changed for the V2 run: a much larger, better-
calibrated training set (see
[`FAILURE_ANALYSIS_LOOP1.md`](FAILURE_ANALYSIS_LOOP1.md) for what changed
and why), a new checkpoint name so `sugarshield-qwen2.5-1.5b` (the v1
checkpoint you already trained and benchmarked) is never touched or
overwritten, and a resumable training command since local sessions have
been dropping.

## What's different in the data

| | v1 (already trained) | v2 (this run) |
|---|---|---|
| Train / validation | ~1,182 / ~134 | **6,188 / 689** |
| Sugar-free / artificially-sweetened examples | 20 / 46 | **64 / 191** |
| Sweetener-only training label | rule engine's raw (miscalibrated) score | corrected to SAFE (see `FAILURE_ANALYSIS_LOOP1.md` addendum) |
| Lexicon | 145 aliases, apostrophe-matching bug present | 145+ aliases, bug fixed, generic fruit-juice-concentrate fallback |

Pull the latest before starting:

```bash
cd ~/sugarshield
git pull origin claude/new-session-89itrd
source .venv-ml/bin/activate
cd ml
```

## Step 1 — prepare the dataset (new directory, doesn't touch `./prepared_qwen`)

```bash
python3 prepare_dataset.py \
  --train ../data/train/train.jsonl \
  --validation ../data/validation/validation.jsonl \
  --gold ../data/gold/gold.jsonl \
  --out_dir ./prepared_qwen_v2 \
  --vocab_size 8000
```

(As before: this also trains a throwaway custom tokenizer into
`./prepared_qwen_v2/tokenizer/` that `--use_lora` never uses — harmless.
The `train.jsonl`/`validation.jsonl`/`gold.jsonl` it writes into
`./prepared_qwen_v2/` are what `train.py` actually reads.)

## Step 2 — smoke-test before committing to the full run

Same rule as v1: never launch a multi-hour run without confirming the
device and a couple of steps actually work first.

```bash
python3 train.py \
  --prepared_dir ./prepared_qwen_v2 \
  --output_dir ./checkpoints/_smoketest_v2 \
  --use_lora --base_model Qwen/Qwen2.5-1.5B-Instruct \
  --device auto --dtype auto --gradient_checkpointing \
  --lora_r 16 --lora_alpha 32 --lora_dropout 0.05 \
  --lora_target_modules q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj \
  --epochs 1 --batch_size 4 --grad_accum 4 --seq_len 320 --seed 42 \
  --max_train_examples 40 \
  --results_dir ./results_smoketest_v2
```

Check for `device=mps` (or your actual device) in the log, that it
completes without a CUDA/MPS OOM, and that `./checkpoints/_smoketest_v2/`
gets written. Then delete the smoke-test checkpoint — it's not a real run:

```bash
rm -rf ./checkpoints/_smoketest_v2 ./results_smoketest_v2
```

## Step 3 — the real run: `sugarshield-qwen-v2-run1`

Config choices and why:
- **`--lora_r 16 --lora_alpha 32`** (double v1's `--lora_r 8 --lora_alpha 16`)
  and **broader target modules** (all attention projections + the full MLP,
  not just `q_proj,v_proj`) — v1 was deliberately a small first run; with
  ~5x more training data now, a higher-capacity adapter has more signal to
  actually use. This matches the "scale-up" config already sketched in
  `LOCAL_QWEN_FINETUNE.md`.
- **`--epochs 3`** — enough passes to learn from the larger set without
  the overfitting risk of v1's headroom-heavy epoch count on a much
  smaller set. Watch the epoch-by-epoch eval loss in the log; if it's
  still dropping at epoch 3, a `run2` with more epochs is a reasonable
  next iteration (see Loop 5's decision criteria).
- **`--seq_len 320`** (up from v1's 256) — the expanded pool's p95
  ingredient-text length alone is ~637 characters (~210+ tokens); 256 was
  cutting it close once the prompt template and JSON target are added.
- **`--seed 42`** — same seed as every other run in this repo, for
  reproducibility.
- **`--gradient_checkpointing`** — trades compute for memory, recommended
  on Mac for a rank-16, broader-target-modules LoRA run.

Run it resumably, logged to a file, in the background:

```bash
nohup python3 train.py \
  --prepared_dir ./prepared_qwen_v2 \
  --output_dir ./checkpoints/sugarshield-qwen-v2-run1 \
  --use_lora --base_model Qwen/Qwen2.5-1.5B-Instruct \
  --device auto --dtype auto --gradient_checkpointing \
  --lora_r 16 --lora_alpha 32 --lora_dropout 0.05 \
  --lora_target_modules q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj \
  --epochs 3 --batch_size 4 --grad_accum 4 --seq_len 320 --seed 42 \
  --results_dir ./results_qwen_v2_run1 \
  > ./train_v2_run1.log 2>&1 &

echo "Started with PID $!"
disown
```

Watch progress any time with:

```bash
tail -f ./train_v2_run1.log
```

**If your session drops or the process gets killed mid-run**, re-attach
and resume from the last saved epoch checkpoint instead of starting over —
`train.py` now supports this (added specifically because of this
session's terminal drops):

```bash
nohup python3 train.py \
  --prepared_dir ./prepared_qwen_v2 \
  --output_dir ./checkpoints/sugarshield-qwen-v2-run1 \
  --use_lora --base_model Qwen/Qwen2.5-1.5B-Instruct \
  --device auto --dtype auto --gradient_checkpointing \
  --lora_r 16 --lora_alpha 32 --lora_dropout 0.05 \
  --lora_target_modules q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj \
  --epochs 3 --batch_size 4 --grad_accum 4 --seq_len 320 --seed 42 \
  --results_dir ./results_qwen_v2_run1 \
  --resume_from_checkpoint \
  >> ./train_v2_run1.log 2>&1 &

echo "Resumed with PID $!"
disown
```

(`--resume_from_checkpoint` with no value auto-finds the latest
`checkpoint-*` subdir already inside `--output_dir`; `save_strategy=epoch`
means at most one epoch of progress is ever lost. `>>` instead of `>` so
the resumed run appends to the same log instead of truncating it.)

## Step 4 — evaluate `run1` the moment it finishes

Both gold sets, exactly like v1 and the from-scratch model were evaluated,
into their own results directories (never overwriting `run1`'s siblings if
a `run2` happens later):

```bash
python3 evaluate.py \
  --gold ../data/gold/gold.jsonl \
  --checkpoint ./checkpoints/sugarshield-qwen-v2-run1 \
  --data_scripts_dir ../data/scripts \
  --results_dir ./results_qwen_v2_run1_original \
  --device mps

python3 evaluate.py \
  --gold ../data/independent_gold/independent_gold.jsonl \
  --checkpoint ./checkpoints/sugarshield-qwen-v2-run1 \
  --data_scripts_dir ../data/scripts \
  --results_dir ./results_qwen_v2_run1_independent \
  --device mps \
  --sample_n 132
```

The second command's `--sample_n 132` (not the default 12) captures a
complete `sample_predictions.json` across all 132 independent records —
needed for real failure-bucket analysis on this checkpoint's own misses,
not just its aggregate numbers.

Then push both new `results_qwen_v2_run1_*` directories (not the
checkpoint itself — LoRA adapters are large; the benchmark JSON files are
what's needed here) and paste the terminal output back. That closes Loop 4
(evaluation) and starts Loop 5's decision: does `run1` clear the bar the
existing rule engine, v1 Qwen, and hybrid already set on the independent
benchmark?
