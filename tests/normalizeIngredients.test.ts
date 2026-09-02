import { describe, it, expect } from 'vitest';
import { splitIngredients, normalizeIngredients } from '@/lib/normalizeIngredients';

describe('normalizeIngredients', () => {
  it('splits a comma-separated ingredient list', () => {
    const list = splitIngredients('Water, Sugar, Natural Flavors.');
    expect(list).toEqual(['water', 'sugar', 'natural flavors']);
  });

  it('flattens parenthetical sub-ingredients into the sequence', () => {
    const list = splitIngredients('Milk (Cultured, Enzymes), Salt');
    expect(list).toEqual(['milk', 'cultured', 'enzymes', 'salt']);
  });

  it('handles a single ingredient with no commas', () => {
    const list = splitIngredients('100% Whole Grain Rolled Oats');
    expect(list).toEqual(['100 whole grain rolled oats']);
  });

  it('returns an empty list for empty input', () => {
    expect(splitIngredients('')).toEqual([]);
    expect(normalizeIngredients('').list).toEqual([]);
  });
});
