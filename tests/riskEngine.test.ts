import { describe, it, expect } from 'vitest';
import { analyzeIngredientsText } from '@/lib/riskEngine';

describe('riskEngine — obvious cases', () => {
  it('flags a soda with a prominent added sugar as high risk', () => {
    const result = analyzeIngredientsText(
      'Carbonated Water, High Fructose Corn Syrup, Caramel Color, Phosphoric Acid, Natural Flavors, Caffeine.'
    );
    expect(result.containsAddedSugar).toBe(true);
    expect(result.detectedSugars).toContain('high fructose corn syrup');
    expect(['HIGH', 'VERY_HIGH']).toContain(result.riskLevel);
  });

  it('flags multiple hidden sugar sources as very high risk', () => {
    const result = analyzeIngredientsText('Soy Protein Isolate, Brown Rice Syrup, Cane Sugar, Palm Oil, Cocoa.');
    expect(result.containsHiddenSugar).toBe(true);
    // "cane sugar" canonicalizes to "sugar" — see lib/lexicon.ts's canonical mapping.
    expect(result.detectedSugars).toEqual(expect.arrayContaining(['brown rice syrup', 'sugar']));
    expect(result.riskLevel).not.toBe('SAFE');
  });
});

describe('riskEngine — must not over-warn on genuinely safe/natural products', () => {
  it('rates plain rolled oats as SAFE', () => {
    const result = analyzeIngredientsText('100% Whole Grain Rolled Oats.');
    expect(result.riskLevel).toBe('SAFE');
    expect(result.containsAddedSugar).toBe(false);
    expect(result.containsArtificialSweetener).toBe(false);
  });

  it('rates plain Greek yogurt as SAFE despite naturally occurring lactose', () => {
    const result = analyzeIngredientsText('Cultured Pasteurized Nonfat Milk.');
    expect(result.riskLevel).toBe('SAFE');
    expect(result.containsNaturalSugar).toBe(true);
    expect(result.containsAddedSugar).toBe(false);
  });

  it('rates pure coconut water as SAFE', () => {
    const result = analyzeIngredientsText('100% Coconut Water.');
    expect(result.riskLevel).toBe('SAFE');
  });

  it('does not rate diet soda (artificial sweetener only) as VERY_HIGH', () => {
    const result = analyzeIngredientsText(
      'Carbonated Water, Caramel Color, Aspartame, Phosphoric Acid, Potassium Benzoate, Natural Flavors, Caffeine.'
    );
    expect(result.containsArtificialSweetener).toBe(true);
    expect(result.containsAddedSugar).toBe(false);
    expect(result.riskLevel).not.toBe('VERY_HIGH');
    expect(result.riskLevel).not.toBe('HIGH');
  });
});

describe('riskEngine — never drops a known sugar term (false-negative protection)', () => {
  it('always includes maltodextrin when present, regardless of surrounding text', () => {
    const result = analyzeIngredientsText('Whey Protein, Maltodextrin, Natural Flavors, Sucralose.');
    expect(result.detectedSugars).toContain('maltodextrin');
    expect(result.containsHiddenSugar).toBe(true);
    expect(result.artificialSweeteners).toContain('sucralose');
  });
});

describe('riskEngine — strict vs lenient', () => {
  it('weighs debated ingredients (stevia) less heavily in lenient mode than strict mode', () => {
    const ingredients = 'Filtered Water, Organic Stevia Leaf Extract, Natural Flavors.';
    const strict = analyzeIngredientsText(ingredients, { mode: 'STRICT' });
    const lenient = analyzeIngredientsText(ingredients, { mode: 'LENIENT' });
    expect(strict.score).toBeGreaterThanOrEqual(lenient.score);
    // Both modes must still surface that a sweetener is present — lenient
    // changes the risk weighting, never the underlying detection.
    expect(strict.artificialSweeteners.some((t) => t.includes('stevia'))).toBe(true);
    expect(lenient.artificialSweeteners.some((t) => t.includes('stevia'))).toBe(true);
  });
});

describe('riskEngine — missing ingredients', () => {
  it('flags missing ingredients as needing more information rather than SAFE', () => {
    const result = analyzeIngredientsText('');
    expect(result.needsIngredients).toBe(true);
    expect(result.riskLevel).not.toBe('SAFE');
  });
});
