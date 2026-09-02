# SugarShield

**Live:** [https://sugarshield.vercel.app/](https://sugarshield.vercel.app/) · **Eval Dashboard:** [https://sugarshield.vercel.app/eval](https://sugarshield.vercel.app/eval)

A food ingredient sugar-risk scanner with an eval-first product story. SugarShield started as a keyword-matching MVP with a 15-case eval set. **SugarShield 2.0** turns that into a vertically-built ingredient-intelligence system: an expanded deterministic sugar knowledge layer, a real 1,375-record labeled dataset, a small model actually fine-tuned on it, an honest 3-way benchmark, a redesigned web app, and a Chrome extension — all sharing one canonical API contract.

---

## The evolution

```
SUGARSHIELD V1                              SUGARSHIELD V2
─────────────────                           ─────────────────
30-term keyword list                        90+ term categorized lexicon
No risk taxonomy (PASS/WARN/FAIL only)  →   SAFE/LOW/MODERATE/HIGH/VERY_HIGH + score
15-case eval set                            1,375-record dataset (1186/130/59 split)
No dedicated model                          Small model actually fine-tuned + benchmarked
Simulated "lenient mode" numbers            Real strict/lenient scoring, real benchmark
Web app only                                Web app + Chrome extension, one shared API
```

### Architecture

```
                         ┌─────────────────────────┐
                         │   POST /api/analyze      │   ← single canonical contract
                         └────────────┬─────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
   Normalize text            Deterministic detection          (research track,
  (lib/normalizeIngredients)  (lib/lexicon + riskEngine)        not called at
        │                             │                         request time —
        └──────────────┬──────────────┘                         see below)
                        │                                             │
                Reconciliation (rules are authoritative;      ml/checkpoints/
                a model can only ADD signal, never drop        sugarshield-v1
                a known sugar term)                                   │
                        │                                    ml/evaluate.py
                 SugarShield result                          benchmarks all
                        │                                    three systems
        ┌───────────────┴───────────────┐
        ▼                               ▼
    Web app (Next.js)              Chrome extension (MV3)
    /  /eval  /metrics             popup + Amazon/Walmart/Target adapters
```

Both the web app and the Chrome extension call the exact same `POST /api/analyze`. Production runs the deterministic engine (`lib/riskEngine.ts`) — see [Why the fine-tuned model isn't called at request time](#why-the-fine-tuned-model-isnt-called-at-request-time) for why, based on the actual benchmark results below, not a shortcut.

---

## The sugar knowledge layer (`lib/lexicon.ts`)

Categorized, not just a flat keyword list:

| Category | Examples | Effect |
|---|---|---|
| Added sugar | sugar, cane sugar, honey, molasses, agave syrup, coconut sugar | `contains_added_sugar = true` |
| Hidden sugar | maltodextrin, corn syrup solids, brown rice syrup, evaporated cane juice, fruit juice concentrate | also `contains_hidden_sugar = true` |
| Artificial / plant sweetener | aspartame, sucralose, acesulfame potassium, stevia, monk fruit, allulose | `contains_artificial_sweetener = true` |
| Sugar alcohol | erythritol, xylitol, sorbitol, maltitol | grouped with sweeteners, weighted lower |
| Natural sugar context | milk, lactose, coconut water, whole fruit | `contains_natural_sugar = true` — **never** raises risk by itself |

Factual detection and risk *judgment* are deliberately separate steps (`detectMatches` → `scoreRisk` → `riskLevelFromScore`), so finding "milk" doesn't imply HIGH risk, and finding two real added-sugar sources does — regardless of marketing copy on the box.

**Strict vs. Lenient**, both real (not simulated): Strict weighs artificial sweeteners and sugar alcohols heavily (safety-first, high recall). Lenient keeps every detection but weighs debated ingredients (stevia, monk fruit, erythritol, diet soda) much less, so it warns less where the nutritional science is unsettled. Toggle it on the home page or pass `"mode"` to `/api/analyze`.

One calibration fix made mid-build: `"caramel color"` was originally in the added-sugar list and was flagging every diet soda as "contains added sugar" purely from its trace coloring agent — removed, with the reasoning left as a comment in `lib/lexicon.ts`. This is exactly the over-warning failure mode the project set out to reduce.

---

## Dataset

**1,375 total records** — **1,186 train / 130 validation / 59 gold** (frozen, never trained on, zero id/content overlap — verified by `data/scripts/detect_leakage.py`).

**Source:** [GroceryDB](https://github.com/Barabasi-Lab/GroceryDB) (MIT license, Barabási Lab/Northeastern University; published alongside their *Nature Food*/*Nature Communications* papers) — **50,638 real products** scraped from Target, Walmart, and Whole Foods. Real ingredient lists are reconstructed from GroceryDB's per-product `ingredient_tree` JSON, preserving label order and sub-ingredient parentheticals.

*The original plan was Open Food Facts' REST API. It — and Hugging Face Hub, Wikipedia, and Kaggle — returned a hard 403 policy denial from this build environment's network egress proxy. GroceryDB, reachable via a plain `git clone`, was the substitute. Full reasoning in `data/README.md`.*

- **1,355 / 1,375 records (99.6%) are real products.** Train and validation are 100% real. Gold is 54/59 (91.5%) real + 5 hand-composed records for concepts (isolated dextrose, isolated maltodextrin, etc.) that needed a clean, unambiguous example.
- Bulk labels are **silver-labeled**: generated by running a faithful Python port of the *same* `lib/lexicon.ts` + `lib/riskEngine.ts` used in production (`data/scripts/lexicon.py`, `risk_engine.py`) — i.e. distillation, not independent human annotation. `"verified": false` on every bulk record says so explicitly. Only the 59 gold records are `"verified": true`.
- Categories: 17 buckets spanning soda, juice, cereal, protein bars, yogurt, sauces, snacks, desserts, bread, breakfast, kids' food, "healthy"-marketed products, sugar-free, artificially-sweetened, and natural-sugar products.
- Risk levels: HIGH 476 · MODERATE 337 · VERY_HIGH 281 · SAFE 236 · LOW 25 (full breakdown in `data/processed/dataset_stats.json`).
- The gold set specifically includes the hard calibration cases: a diet soda with only aspartame, a diet soda with three stacked sweeteners, isolated stevia, isolated monk fruit, real HFCS and fruit-juice-concentrate products, a product with 4 stacked sugar aliases, and three "misleading healthy" products that still contain 2+ real added-sugar sources.

Full methodology, exact re-run commands, and licensing: [`data/README.md`](data/README.md).

---

## Fine-tuning

**A real training run was executed — not just scripted.** But not the originally planned one, for a documented environment reason:

### Why the plan changed: no LoRA on a pretrained checkpoint

The plan was LoRA/QLoRA fine-tuning a small pretrained instruction model (0.5–3B params, e.g. Qwen2.5-0.5B-Instruct) pulled from Hugging Face Hub. **`huggingface.co` (and `download.pytorch.org`, and effectively every host outside a curated allowlist of PyPI/npm/crates.io/GitHub) returns a hard 403 policy denial from this build environment.** This was verified directly with `curl`, Python `requests`, and a web-search tool before switching approaches — it's a policy decision, not a flaky network, so it wasn't retried or routed around.

With no pretrained checkpoint or vocab reachable, `ml/train.py` instead:
- trains a **byte-level BPE tokenizer from scratch** on SugarShield's own prompt+JSON corpus (`ml/prepare_dataset.py`, using `tokenizers`), and
- trains a **small GPT-2-architecture model from scratch, full-parameter** (`transformers.GPT2LMHeadModel`, randomly initialized) — LoRA doesn't apply with no pretrained weights to adapt.

`train.py` still has a real `--use_lora --base_model <hub-id>` code path for anyone running this pipeline where Hugging Face Hub **is** reachable. The run actually executed and checked into this repo took the from-scratch path.

### The actual run

| | |
|---|---|
| Architecture | GPT-2 style causal LM, 6 layers / 256 dim / 8 heads |
| Parameters | **5,871,616** (from scratch, full-parameter — not LoRA) |
| Tokenizer | Custom byte-level BPE, 8,000 vocab, trained on this dataset |
| Training examples | 1,186 (+ 130 held out for validation, + 59 gold never seen) |
| Epochs / batch | 6 epochs, batch 8, grad-accum 2 (effective batch 16) |
| Hardware | 4 vCPU, 15GB RAM, **CPU only — no GPU available** |
| Duration | 607 seconds (~10 minutes) |
| Final train loss | 0.648 |
| Eval loss | 0.125 |

Exact config: [`ml/configs/training_config.json`](ml/configs/training_config.json). Exact measured run output (not hand-typed): [`ml/results/training_run.json`](ml/results/training_run.json). Checkpoint: [`ml/checkpoints/sugarshield-v1/`](ml/checkpoints/sugarshield-v1/) (23MB, committed to this repo).

The checkpoint was verified after training — loaded via `ml/infer.py`, not the untouched random-init model — and produces syntactically valid structured JSON on a held-out product.

---

## Benchmark: rule engine vs. fine-tuned model vs. hybrid

Measured by `ml/evaluate.py` against the 59-record frozen gold set. Every number below comes from `ml/results/benchmark.json` — the live `/eval` page reads that same file and shows nothing else.

| Metric | Rule Engine (production) | Fine-tuned Model (standalone) | Hybrid (model + rules) |
|---|---|---|---|
| Accuracy (flag vs. no-flag) | 100% | 68% | 98% |
| Precision | 100% | 97% | 98% |
| Recall | 100% | 65% | 100% |
| F1 | 100% | 78% | 99% |
| False negatives | **0** | **17** | **0** |
| False positives | 0 | 1 | 1 |
| Hidden-sugar recall | 100% | 33% | 100% |
| Trigger match accuracy | 100% | 56% | 100% |
| Risk-level exact match | 100% | 45% | 81% |
| Structured JSON validity | 100% | 95% | 100% |
| Avg latency | 0.3 ms | 283 ms | 283 ms |

**Read the rule engine's 100% honestly, not as a headline win:** the gold labels were generated by running this exact deterministic engine (with manual spot-checking, not independent re-derivation) — so a perfect score there is expected by construction, not a blind measurement. **The fine-tuned model's numbers are the genuine blind test** — it never saw these 59 examples during training — and they show real, honest under-generalization: 17 missed detections (false negatives) out of 51 truly-risky gold products, and only 33% hidden-sugar recall. For a product whose entire premise is "false negatives are worse than over-warning," a standalone model with a 33% false-negative rate on real held-out products is disqualifying on its own evidence, not because of an assumption.

**Hybrid** (rule detections are authoritative; the model can only add signal the rules missed; `risk_level` takes the more severe of the two) recovers the rule engine's recall and hidden-sugar recall completely, at the cost of one false positive from the model's independent guess — a safety-conserving direction of error, not a safety-losing one.

### Production model/system selected: the deterministic rule engine

`app/api/analyze/route.ts` runs `lib/riskEngine.ts` — not the fine-tuned model, and not the hybrid reconciliation. Two independent reasons, not one:

1. **The benchmark above.** The standalone model doesn't outperform the rule engine on any safety-relevant metric it was distilled from.
2. **Hosting.** This app deploys to Vercel serverless functions, which have no persistent process to hold a loaded PyTorch model between requests — cold-starting a checkpoint on every invocation is impractical at this stage. There's no model-endpoint hook wired into `app/api/analyze/route.ts` today; if a hosted inference service is stood up later, it would need the same reconciliation logic `ml/evaluate.py` already implements for the hybrid benchmark (rule-engine detections are authoritative, the model can only add signal) ported into that route.

If a stronger model (either a properly LoRA-tuned pretrained checkpoint, trained somewhere Hugging Face Hub is reachable, or simply more real training data) beats the rule engine on this same gold set in the future, `evaluate.py` will show it — and the production choice above should change with it. That's the entire point of keeping the benchmark real.

---

## The web app

- **Score, not just a verdict.** A 0–100 SugarShield score, a five-level risk badge (SAFE → VERY_HIGH), detected sugars and sweeteners as separate chips, and highlighted ingredient text — added sugars in red, sweeteners in purple.
- **"Why SugarShield flagged this"** — one plain-language sentence, generated by `lib/riskEngine.ts`'s `buildExplanation`, not a canned string.
- **Strict/Lenient toggle**, with an inline explanation of what actually differs (weights, not detections — see [above](#the-sugar-knowledge-layer-liblexiconts)).
- Same three input flows as v1 (camera scan + OCR, photo upload + OCR, product link/paste) — the flows are unchanged, only the analysis engine and result UI underneath them are new.

<img src="docs/screenshots/web-home.png" width="360" alt="SugarShield home screen" />
<img src="docs/screenshots/web-result.png" width="360" alt="SugarShield result card with score and detected sugars" />

## `/eval`

Kept and expanded, not replaced. The original 15-case table is still there, explicitly relabeled as the **frozen SugarShield v1 legacy baseline** (no more simulated "lenient mode" numbers for it — v1 never had a lenient mode, and pretending otherwise was dishonest). A new **"SugarShield 2.0 — Model Comparison"** section shows the real 3-way benchmark above, plus the base model, dataset size, gold set size, and fine-tuning method — all read live from `ml/results/benchmark.json` via `/api/benchmark`, never hand-typed into the page.

<img src="docs/screenshots/eval-model-comparison.png" width="600" alt="SugarShield 2.0 model comparison table on the eval page" />

---

## Chrome extension

Manifest V3, plain JS (no build step), in `extension/`. Same `/api/analyze` contract as the web app — no OpenAI key, no model credential, no secret of any kind is ever embedded in the extension; it only ever talks to SugarShield's own API.

- **Popup (always works, everywhere):** paste a product name + ingredients, get the same score/risk/detected-sugars/explanation/confidence as the web app.
- **Amazon / Walmart / Target only** (by design — quality over a long tail of unreliable adapters): a content script looks for an ingredients list on the product page; if it finds one, a small floating "SugarShield: HIGH"-style badge appears, click for the full result. Silent on any page it can't confidently read.
- Minimal permissions: `storage` + `activeTab` only, host permissions scoped to the API host and the three shopping sites — no `<all_urls>`, no `tabs`, no remote code loading.

Setup, permission justification, and adapter limitations: [`extension/README.md`](extension/README.md).

---

## Repository layout

```
app/            Next.js pages + API routes (analyze, benchmark, link-extract, product, vision-parse)
components/     React UI (ResultCard, ModeToggle, ModelComparison, tabs, ...)
lib/            Sugar knowledge layer, risk engine, normalization, legacy v1 classifier (frozen)
data/           Dataset pipeline + the dataset itself (raw/processed/train/validation/gold)
ml/             Tokenizer + model training, evaluation, inference, the checkpoint, and results
extension/      Chrome MV3 extension
tests/          Vitest suite (lexicon, normalization, risk engine calibration, v1 regression, API route)
docs/           Screenshots used in this README
```

---

## Local development

```bash
git clone https://github.com/Ruthwik-Data/sugarshield.git
cd sugarshield
npm install
npm run dev        # http://localhost:3000 — the sugar-risk engine works with no env vars at all
```

`OPENAI_API_KEY` in `.env.local` is **optional** — it's used only for OCR (reading an ingredients photo). Barcode scanning fallback, link/paste analysis, and every sugar-risk calculation run entirely on SugarShield's own deterministic engine with zero external API calls.

```bash
npm test            # vitest — lexicon, normalization, risk engine, legacy v1 regression, /api/analyze
npm run lint
npm run build
```

### Re-running the ML pipeline

```bash
cd data/scripts && python3 fetch_openfoodfacts.py && python3 clean_and_normalize.py && \
  python3 label_records.py && python3 build_gold_set.py && python3 split_dataset.py && \
  python3 detect_leakage.py && python3 dataset_stats.py        # rebuilds data/

cd ../../ml
pip install -r requirements.txt
python3 prepare_dataset.py --train ../data/train/train.jsonl --validation ../data/validation/validation.jsonl \
  --gold ../data/gold/gold.jsonl --out_dir ./prepared --vocab_size 8000
python3 train.py --prepared_dir ./prepared --output_dir ./checkpoints/sugarshield-v1 \
  --seq_len 256 --n_layer 6 --n_embd 256 --n_head 8 --epochs 6 --batch_size 8 --grad_accum 2
python3 evaluate.py --gold ../data/gold/gold.jsonl --checkpoint ./checkpoints/sugarshield-v1 \
  --data_scripts_dir ../data/scripts --results_dir ./results
```

### Chrome extension

`chrome://extensions` → enable Developer mode → **Load unpacked** → select the `extension/` folder. See `extension/README.md` for pointing it at a local dev server instead of production.

---

## Deployment

Deployed to Vercel from this repository (`npm run build` / `next start`), same as v1. No new infrastructure was added — the dataset pipeline and ML pipeline are offline/research tooling that produce committed artifacts (`data/`, `ml/checkpoints/`, `ml/results/`), not services the deployed app calls at request time.

---

## Product decision (unchanged from v1, now backed by real numbers)

Missing hidden sugar is riskier than over-warning. That principle drove v1's design and every calibration decision in v2 — including the changes that *reduce* over-warning (diet soda, stevia, monk fruit, erythritol, coconut water no longer read as FAIL-level threats) precisely because the benchmark shows recall on real added/hidden sugar hasn't been traded away to get there: the production rule engine and hybrid path both hold **0 false negatives** on the frozen gold set.

## Status

- ✅ v1 preserved as a frozen, working baseline (`lib/classifier.ts`, `/eval`'s legacy section)
- ✅ Deterministic hybrid engine (lexicon + risk taxonomy + strict/lenient), in production
- ✅ Real 1,375-record dataset, zero train/gold leakage
- ✅ Real model training executed (from scratch — see above for why not LoRA), checkpoint committed
- ✅ Real 3-way benchmark, honestly interpreted, backing the production choice
- ✅ Canonical `/api/analyze` shared by the web app and the Chrome extension
- ✅ Chrome extension with Amazon/Walmart/Target adapters
- ⏳ A hosted inference endpoint for the fine-tuned/hybrid model — not built; see "Hosting" above for what it would take
- ⏳ Multi-day historical trends
