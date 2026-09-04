# Tooling decision: PEFT vs. LLaMA-Factory vs. Easy Dataset

Evaluated by actually cloning and reading all three repos (`huggingface/peft`,
`hiyouga/LLaMA-Factory`, `ConardLi/easy-dataset` — full commit trees, not
just READMEs), against SugarShield's actual current pipeline and the bug
that was blocking training when this evaluation started (a device-placement
bug in `ml/train.py` sending an MPS-requested run to CPU, causing 256s/step
— ~83 hours projected for a 3-epoch run that should take a fraction of that).

## 1. Recommendation

**Use:** Hugging Face PEFT (already in use) — keep it, and use two flags it
already supports that our own wrapper wasn't exposing.

**Do not use (for now):** LLaMA-Factory. Evaluated seriously, has real
strengths, but doesn't clear the bar over just fixing the actual bug — see
§3 and §7 for the specific reasons and the condition under which this
should be revisited.

**Do not use:** Easy Dataset. Wrong tool for this task's data shape — see
§3.

## 2. What NOT to use, and why

**Easy Dataset** is a document→QA-dataset generator: it ingests domain
documents (PDF/Markdown/DOCX) and uses an LLM API to auto-generate
question-answer pairs, with export to Alpaca/ShareGPT/LLaMA-Factory
formats. That's a fundamentally different data-generation shape than
SugarShield's actual problem. SugarShield's task is structured extraction/
classification from **real product ingredient lists**, and the entire
Fine-tune V2 effort so far (the independent 132-record benchmark, the
failure-analysis-driven lexicon fixes, the sweetener-only calibration
correction) has been about *eliminating* circular/self-generated labels in
favor of real data and independently-verified ground truth. Piping our
product data through an LLM-based "Answer Generation" step to synthesize
more training labels would reintroduce exactly the kind of unverified,
potentially-hallucinated labeling this project has spent real effort
removing. It should not be used for dataset preparation OR evaluation
ground truth — the independent benchmark's manual-labeling methodology is
already the more rigorous version of what this tool would provide, and the
actual bottleneck (see §6) is curating more of the ~44,000 untouched real
GroceryDB products around known failure patterns, not synthesizing more
text. Its "LLaMA-Factory config generation" / export features are also
moot given the LLaMA-Factory decision below.

## 3. PEFT: keep it, use more of it

SugarShield's `ml/train.py --use_lora` path already **is** built on real
`peft` (`from peft import LoraConfig, get_peft_model`, pinned
`peft>=0.10` in `requirements.txt`) — there is no "custom PEFT pipeline"
to replace; the custom part is only the ~350-line CLI/data-loading/Trainer
wrapper around it. That framing matters: the question isn't "PEFT vs. not
PEFT," it's "is our wrapper around PEFT good enough."

Checked `peft`'s actual `LoraConfig` (`src/peft/tuners/lora/config.py`):
it already supports `use_rslora` (rank-stabilized LoRA — scales
`lora_alpha` by `1/sqrt(r)` instead of `1/r`, which helps higher-rank
adapters like `run1`'s `r=16` train more stably) and `use_dora`
(weight-decomposed LoRA — decomposes each adapted weight into magnitude +
direction, closer to full fine-tuning behavior at modest extra compute).
Both were available in the pinned version the whole time; `train.py`
simply never exposed them as CLI flags. **Now fixed** — `--use_rslora` and
`--use_dora` are wired straight into the existing `LoraConfig` call, zero
new dependencies. QLoRA (4-bit quantization via `bitsandbytes`) is the one
"advanced" option genuinely **not** available here, but that's a hardware
fact, not a PEFT gap: `bitsandbytes` is CUDA-only, so QLoRA isn't usable on
a Mac in *any* framework, LLaMA-Factory included (its QLoRA path needs the
same `bitsandbytes` requirements file).

## 4. LLaMA-Factory: real strengths, and why they don't tip the scale here

Checked its actual source for the questions that matter for this project:

- **Qwen2.5 support**: yes, real, registered under its `qwen2` architecture
  family with dedicated chat templates (`qwen`, `qwen2_5_vl`, etc.).
- **Device handling**: genuinely more mature than what broke in our own
  wrapper. `src/llamafactory/extras/misc.py` has explicit,
  well-exercised CUDA/MPS/NPU/XPU detection (`is_torch_mps_available()`,
  branches for `"mps:{LOCAL_RANK}"` etc.) — this is very likely why a
  much larger, longer-running project doesn't hit the exact silent-CPU-
  fallback bug this session just hit twice (once in `evaluate.py`,
  already fixed; once in `train.py`, fixed in this same pass — see §7).
- **Config format**: YAML-driven (`examples/train_lora/qwen3_lora_sft.yaml`)
  — directly addresses "easier repeatable training configs," and its
  dataset format (`data/dataset_info.json`, Alpaca-style
  `{instruction, input, output}` records) maps cleanly onto SugarShield's
  existing prompt/target JSON shape.
- **Compatibility with our own checkpoint/eval pipeline**: real, and
  important. LLaMA-Factory's LoRA training still produces a standard
  `peft` adapter directory (`adapter_config.json` +
  `adapter_model.safetensors`) — `ml/model_io.py`'s existing
  `AutoPeftModelForCausalLM.from_pretrained()` loader, `ml/evaluate.py`,
  the hallucination guard, and hybrid reconciliation would all keep
  working against a LLaMA-Factory-trained checkpoint with **zero code
  changes**. If this were adopted, only the training step (Loop 3) would
  change — Loops 1, 2, 4, 5, and 6 stay exactly as they are.

Real costs and risks, checked directly rather than assumed:

- **Dependency footprint and version pins are meaningfully heavier and
  narrower** than what's already working: `transformers>=4.55.0,<=5.8.0`,
  `accelerate>=1.3.0,<=1.11.0`, `peft>=0.18.0,<=0.18.1`, plus `trl`,
  `torchvision`, `torchaudio`, `gradio` (its GUI), `matplotlib` — a large
  install for what is currently a single-command training step on one
  machine. `requires-python = ">=3.11.0"`.
- **QLoRA is CUDA-only here too** (`requirements/bitsandbytes.txt`), so it
  brings zero additional capability on this Mac-only project over what
  plain LoRA via our own `peft` usage already does.
- **Unverified on this exact machine.** The Mac in this project is running
  Python 3.14 at the system level (seen in an earlier traceback) — very
  new, and LLaMA-Factory's `torch>=2.4.0` / `transformers` pins were not
  validated against it as part of this evaluation. A fresh
  `pip install llamafactory` attempt could hit wheel-availability issues
  that cost real setup time to resolve, on top of the migration itself.
- **The actual blocking problem had a 15-line fix, not an architecture
  problem.** The device bug that prompted re-examining tooling in the
  first place turned out to be exactly the same class of bug already
  fixed once in `evaluate.py`'s `model_io.py` this session: `Trainer`/
  `Accelerate` compute their own device placement internally from
  `TrainingArguments`, independent of an explicit `model.to(device)` call
  made beforehand, and can silently disagree with it. Forcing the model
  back onto the intended device immediately after `Trainer(...)`
  construction (now added to `ml/train.py`, with the mismatch logged so
  it's never silent again) is a direct fix for the actual failure, not a
  workaround.

Given "prefer the smallest change that gives the biggest improvement" and
"do not rewrite working code just because these frameworks exist" — a
solid working pipeline had one real, now-fixed bug. That does not clear
the bar for a framework migration whose main draw (mature device handling)
is exactly what a 15-line fix already delivers, at zero new dependencies
and zero risk to the existing eval/hallucination-guard/hybrid pipeline
that already works.

## 5. What stays custom in SugarShield

Everything except the one training invocation: the entire failure-analysis
methodology (Loop 1), the GroceryDB fetch/clean/label/split/leakage
pipeline including the sweetener-only calibration correction (Loop 2), the
independent-benchmark construction and its non-circularity guarantees,
`ml/evaluate.py`, `ml/hallucination_guard.py`, hybrid reconciliation, and
the rule engine that's still what's actually in production. None of these
are things any of the three evaluated tools do, or should do — they're
this project's actual differentiated work.

## 6. What's actually the bottleneck (not tooling)

Per the evidence gathered in Loop 1: GroceryDB has ~44,000 real products
still untouched by any split in this project. The training loop's speed
problem was a device bug, now fixed. The real lever for a better V2 model
is what Loop 2 already started — curating more real examples specifically
around observed failure patterns (artificial-sweetener-only calibration,
fruit-concentrate self-reconstitution ambiguity, "no sugar added" claims
with real natural sugar) — not a training-framework swap.

## 7. Expected time savings / risk summary

| | Fix the bug in `train.py` (done) | Migrate to LLaMA-Factory |
|---|---|---|
| Time to unblock Loop 3 | ~15 minutes (this pass) | Hours: install, verify Python 3.14/torch compatibility, write a data-format converter, write YAML config, verify checkpoint loads back into `evaluate.py` |
| Risk to existing eval/hallucination-guard/hybrid pipeline | None (untouched) | Low if the adapter format assumption holds, but unverified on this exact stack until tried |
| New dependencies | None | `transformers`/`accelerate`/`peft` version pins narrower than current; `trl`, `torchvision`, `torchaudio`, `gradio`, `matplotlib` |
| Advanced LoRA options gained | `use_rslora`, `use_dora` (peft already had them) | Same options, via YAML instead of CLI flags |
| QLoRA gained | None (CUDA-only either way) | None (CUDA-only either way) |

## 8. When to revisit this decision

Re-run this evaluation, seriously, if either becomes true after the fix
above:
1. The `train.py` device fix doesn't actually resolve the slow-training
   symptom (i.e. the diagnostic in the next section of this session's
   conversation reveals something the forced re-placement doesn't catch),
   or
2. Loop 4/5 finds a real need for a capability neither `peft` nor this
   pipeline has today — e.g. multi-GPU/distributed training, a training
   feature like sample packing or sequence-length grouping that
   meaningfully speeds up iteration once the dataset grows well past what
   Loop 2 built, or a need to run many parallel small experiments where
   LLaMA-Factory's config-driven repeatability starts to clearly outweigh
   its heavier setup cost.

Until then: same pipeline, same checkpoints, same eval — just the one bug
fixed and two dormant `peft` flags turned on.
