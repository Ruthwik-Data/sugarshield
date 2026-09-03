import { describe, it, expect } from 'vitest';
import { LEXICON, getLexiconEntry } from '@/lib/lexicon';

describe('lexicon size and canonical mapping', () => {
  it('has at least 100 distinct aliases', () => {
    expect(LEXICON.length).toBeGreaterThanOrEqual(100);
  });

  it('has no duplicate raw terms', () => {
    const terms = LEXICON.map((e) => e.term);
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('collapses true label synonyms to one canonical name', () => {
    for (const term of ['hfcs', 'high-fructose corn syrup', 'high fructose corn syrup']) {
      expect(getLexiconEntry(term)?.canonical).toBe('high fructose corn syrup');
    }
    for (const term of ['cane sugar', 'granulated sugar', 'table sugar', 'sucrose']) {
      expect(getLexiconEntry(term)?.canonical).toBe('sugar');
    }
    for (const term of ["confectioner's sugar", 'icing sugar', 'powdered sugar']) {
      expect(getLexiconEntry(term)?.canonical).toBe('powdered sugar');
    }
  });

  it('keeps materially different sugars as distinct canonical names', () => {
    const names = new Set(
      ['brown sugar', 'turbinado sugar', 'demerara sugar', 'muscovado sugar'].map(
        (t) => getLexiconEntry(t)?.canonical
      )
    );
    expect(names.size).toBe(4);
  });

  it('covers all 8 requested subcategories', () => {
    const subcategories = new Set(LEXICON.map((e) => e.subcategory));
    expect(subcategories).toEqual(
      new Set([
        'added_sugar_basic',
        'syrup',
        'glucose_fructose_derivative',
        'malt_derived',
        'fruit_concentrate_sweetener',
        'sugar_alcohol',
        'artificial_nonnutritive',
        'natural_sugar_context',
      ])
    );
  });
});

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
