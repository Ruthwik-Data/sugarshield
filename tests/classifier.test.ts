import { describe, it, expect } from 'vitest';
import { classifyIngredients } from '@/lib/classifier';

// Regression tests for the frozen SugarShield v1 legacy rule engine. This
// engine is intentionally preserved unchanged as the historical baseline
// (see /eval) — these tests exist to catch anyone accidentally "fixing" it.
describe('legacy classifier (v1, frozen baseline)', () => {
  it('still detects a basic sugar term when given a high-confidence (pasted) source', () => {
    // Confidence factors into v1's verdict, so a short/UNKNOWN-source input
    // legitimately resolves to WARN ("need ingredients") rather than FAIL —
    // that is frozen v1 behavior, not something these tests should change.
    const result = classifyIngredients('Water, Sugar, Natural Flavors, Citric Acid, Sodium Benzoate', 'PASTED');
    expect(result.matchedTerms.map((t) => t.term)).toContain('sugar');
    expect(result.verdict).toBe('FAIL');
  });

  it('still passes a product with no matched terms', () => {
    const result = classifyIngredients('Water, Natural Flavors, Citric Acid, Sodium Benzoate, Potassium Sorbate', 'PASTED');
    expect(result.matchedTerms.length).toBe(0);
    expect(result.verdict).toBe('PASS');
  });

  it('does not match "sugar" inside "sugarfree" (word boundary check)', () => {
    const result = classifyIngredients('Sugarfree Gum, Xylitol');
    expect(result.matchedTerms.map((t) => t.term)).not.toContain('sugar');
  });
});
