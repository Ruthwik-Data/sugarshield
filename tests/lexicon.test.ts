import { describe, it, expect } from 'vitest';
import { LEXICON, getLexiconEntry } from '@/lib/lexicon';

describe('lexicon', () => {
  it('classifies well-known added sugar aliases', () => {
    for (const term of ['sugar', 'cane sugar', 'high fructose corn syrup', 'dextrose', 'honey', 'molasses']) {
      const entry = getLexiconEntry(term);
      expect(entry, `expected "${term}" to be in the lexicon`).toBeDefined();
      expect(['added_sugar', 'hidden_sugar']).toContain(entry!.category);
    }
  });

  it('classifies hidden sugars distinctly from plain added sugars', () => {
    for (const term of ['maltodextrin', 'corn syrup solids', 'brown rice syrup', 'evaporated cane juice', 'fruit juice concentrate']) {
      const entry = getLexiconEntry(term);
      expect(entry, `expected "${term}" to be in the lexicon`).toBeDefined();
      expect(entry!.category).toBe('hidden_sugar');
    }
  });

  it('classifies artificial and plant-derived sweeteners', () => {
    for (const term of ['aspartame', 'sucralose', 'acesulfame potassium', 'stevia', 'monk fruit']) {
      const entry = getLexiconEntry(term);
      expect(entry, `expected "${term}" to be in the lexicon`).toBeDefined();
      expect(entry!.category).toBe('artificial_sweetener');
    }
  });

  it('classifies sugar alcohols separately', () => {
    for (const term of ['erythritol', 'xylitol', 'sorbitol']) {
      const entry = getLexiconEntry(term);
      expect(entry, `expected "${term}" to be in the lexicon`).toBeDefined();
      expect(entry!.category).toBe('sugar_alcohol');
    }
  });

  it('recognizes natural sugar context without treating it as an added sugar', () => {
    for (const term of ['milk', 'lactose', 'coconut water']) {
      const entry = getLexiconEntry(term);
      expect(entry, `expected "${term}" to be in the lexicon`).toBeDefined();
      expect(entry!.category).toBe('natural_sugar_context');
    }
  });

  it('has no duplicate terms', () => {
    const terms = LEXICON.map((e) => e.term);
    expect(new Set(terms).size).toBe(terms.length);
  });
});
