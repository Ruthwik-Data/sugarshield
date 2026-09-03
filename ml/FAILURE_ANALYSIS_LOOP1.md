# Loop 1 failure analysis (Fine-tune V2)

Ran entirely against the frozen 132-record independent benchmark
(`data/independent_gold/independent_gold.jsonl`), which was never touched.
The rule engine's own failures are analyzed directly (deterministic Python,
no GPU needed); Qwen-specific per-sample failure detail needs a fresh
`--sample_n 132` run on the Mac (see the request at the bottom).

## Two real bugs found and fixed (not just data gaps)

1. **Apostrophe-normalization bug (`lib/riskEngine.ts` / `data/scripts/risk_engine.py`).**
   `normalizeText` strips punctuation (including apostrophes) to a space
   before matching, but `matchToken`/`match_token` compiled the *raw*
   lexicon term into its regex. Any term containing an apostrophe —
   `"confectioner's sugar"`, `"refiner's syrup"` — could never match,
   silently, in production. Fixed by normalizing the lexicon term the same
   way before compiling its regex. Verified both terms now match.
2. **Generic fruit-juice-concentrate coverage gap.** The lexicon enumerated
   specific fruits (`apple juice concentrate`, `grape juice concentrate`,
   ...) but real labels name dozens more (`black carrot juice concentrate`,
   `cranberry juice concentrate`, `strawberry juice concentrate`, `raisin
   juice`, `grape juice from concentrate`). Added generic `juice
   concentrate` / `juice from concentrate` fallback terms (shorter than
   every specific entry, so a specific match still wins when present) plus
   `date paste`, `fig paste`, `molasse`/`molasse powder` (real spelling
   variants seen in scraped GroceryDB text).

## Rule engine, before vs. after these fixes (132-record independent set)

| | Before | After |
|---|---|---|
| Accuracy | 90.9% | **91.7%** |
| False negatives | 4 | **2** |
| False positives | 8 | 9 (see below) |
| Hidden-sugar recall | 50.0% | **54.2%** |
| Trigger-match accuracy | 58.3% | **60.4%** |

The one new false positive (`indep_013`, Ocean Spray 100% Pure Cranberry
Juice) is a genuine ambiguous edge case, not a regression to walk back: its
ingredient list is `cranberry juice (water, cranberry juice concentrate)` —
reconstituted from its own concentrate, which the independent labeler
judged SAFE (self-reconstitution, not an *added* sweetener), but the new
generic `juice concentrate` term can't distinguish that from concentrate
added as a foreign sweetener to an unrelated product. Given this product's
false-negatives-are-worse-than-false-positives design, net +1 FP for -2 FN
is the right trade, but it's flagged here as a real, unresolved case for
the model to learn what keyword matching cannot.

## Failure buckets on the independent set (after fixes)

| Bucket | Count | Examples |
|---|---|---|
| False positive — artificial sweetener only | 7 | Diet sodas / sugar-free syrups / stevia drops sweetened solely with aspartame, sucralose, acesulfame-K, or stevia. STRICT mode's sweetener scoring pushes these to LOW/MODERATE/VERY_HIGH; the independent labelers scored them SAFE because *zero real sugar* is present — this dataset explicitly answers the sugar-specific question, not the general "is this sweetener healthy" debate. **This is the single largest, most consistent failure pattern found.** |
| False positive — fruit-concentrate self-reconstitution ambiguity | 1 | 100% juice reconstituted from its own concentrate (see above). |
| False positive — trace fermentation aid over-flagged | 1 | 5-ingredient sourdough bread listing `barley malt` as a trace ingredient with 0.0g/100g measured sugar; independent labeler judged it functionally unsweetened bread. |
| False negative — "no sugar added" claim with only whole-fruit/dairy sugar | 2 | A "no sugar added" cereal sweetened only by date powder (whole dried fruit); a "no sugar added" yogurt whose only sugars are milk lactose + strawberry. Independent labeler scored these LOW (not SAFE) because the sugar is real, even though no isolated sweetener is present — a finer distinction than the rule engine's binary SAFE/flagged split currently draws. |

**Evaluation-methodology note, not a product bug:** several apparent "term
misses" in an earlier pass of this analysis (`rebaudioside a`, `gur`,
`refiner's syrup`, the specific fruit-juice-concentrate names) turned out
to be an artifact of comparing the independent set's *raw* alias strings
against the rule engine's *canonical* output names (e.g. `rebaudioside a`
is correctly detected but reported under its canonical name `stevia`).
This is worth flagging because `ml/evaluate.py`'s `trigger_match_accuracy`
metric has the same raw-vs-canonical comparison, meaning it likely
undercounts term-level correctness whenever a specific alias canonicalizes
into a shared bucket name. Not fixed here (out of Loop 1's scope, and
changing the metric would break comparability with every existing
benchmark file) — noted for whoever next revisits `evaluate.py`'s metrics.

## What this means for Loop 2 (data expansion targets)

1. **Artificial-sweetener-only "SAFE" calibration is the #1 gap** — the
   expanded dataset needs many more real sugar-free/artificially-sweetened
   products so a fine-tuned model can learn "sweetener present, zero real
   sugar → not flagged" directly from labeled examples, rather than
   inheriting the rule engine's STRICT-mode sweetener scoring by imitation.
2. **Natural-vs-added ambiguity around fruit concentrates and dried-fruit
   pastes** needs explicit paired hard examples: self-reconstituted 100%
   juice (SAFE) vs. concentrate added to an unrelated product (flagged);
   "no sugar added" claims that are truthful but still contain real
   fruit/dairy sugar (LOW, not SAFE, not VERY_HIGH).
3. **Long, noisy, real-world ingredient lists** (compound sub-ingredients
   in parentheses, typos, regional spelling variants) are already present
   throughout GroceryDB's ~50k real products and should stay well
   represented rather than favoring clean, short lists.

## Qwen-specific failure detail — needs one more Mac run

The real Qwen2.5-1.5B-Instruct checkpoint's aggregate numbers are already
known (`ml/results_qwen_independent/benchmark.json`: 19 false negatives,
15.2% hidden-sugar recall, 3 invalid-JSON outputs), but per-sample detail
(which specific products it got wrong, and what it actually generated)
wasn't captured — `evaluate.py`'s `--sample_n` defaults to 12, far short of
all 132. To do proper root-cause bucketing on the model's own failures
(distinct from the rule engine's), run:

```bash
cd ml
python3 evaluate.py \
  --gold ../data/independent_gold/independent_gold.jsonl \
  --checkpoint ./checkpoints/sugarshield-qwen2.5-1.5b \
  --data_scripts_dir ../data/scripts \
  --results_dir ./results_qwen_independent \
  --device mps \
  --sample_n 132
```

This is the exact same command as before with one addition —
`--sample_n 132` — so it recomputes the identical `benchmark.json` (no
change expected there) but this time writes a complete
`sample_predictions.json` covering every record instead of the first 12.
Push that file back and it'll be folded into a Qwen-specific bucket
breakdown alongside this one.

## Addendum: acting on the #1 finding, and a second bug it surfaced

Given the artificial-sweetener-only miscalibration was the single largest,
most consistent failure bucket above, `data/scripts/label_records.py` now
applies `_apply_sweetener_only_calibration()`: when a record has zero real
sugar signal (no added, hidden, or natural sugar) but at least one
artificial/plant sweetener, its **training-target** `risk_level` is
overridden to `SAFE`, matching the independent benchmark's empirically
validated convention. This touches only the silver labels used to build
`data/train/train.jsonl` / `data/validation/validation.jsonl` — it does
**not** touch `lib/riskEngine.ts` or `risk_engine.py`'s
`analyze_ingredients_text()`, which keep scoring live production traffic
exactly as before. Training on the rule engine's own miscalibration would
just teach a model to repeat the same false positives; this lets the model
actually improve on the known gap instead of imitating it. Result: bulk
`risk_level` breakdown shifts from 165 LOW / 1,209 MODERATE / 1,448 SAFE to
55 LOW / 1,074 MODERATE / 1,693 SAFE (out of 6,916 records) — exactly the
direction the independent-benchmark evidence calls for.

This surfaced a second, real bug: `data/scripts/build_gold_set.py`'s
curated/isolated/general-coverage picks all copied their fields straight
from the labeled pool (`data/processed/all_records.jsonl`), so once that
pool started carrying the calibration override, 4 gold records (all
diet-soda/sweetener-only cases) silently inherited the calibrated `SAFE`
label while `ml/evaluate.py`'s `rule_baseline` kept scoring them fresh
(uncalibrated) — producing 4 false positives on a benchmark that is
supposed to be circular by construction. Fixed by adding an explicit
recompute pass in `build_gold_set.py`: every GroceryDB-sourced gold record
gets its `risk_level` (and everything derived from it) recalculated via a
fresh, uncalibrated `analyze_ingredients_text()` call right before
writing, restoring the gold set's own documented invariant ("every record
is run through the SAME ported risk_engine used for the bulk data").
Regression-tested in
[`data/scripts/test_label_calibration.py`](../data/scripts/test_label_calibration.py)
— `python3 data/scripts/test_label_calibration.py`.
