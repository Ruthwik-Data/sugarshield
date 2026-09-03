// Tests the Chrome extension's pure parsing/dispatch logic (Part 16: extension
// parsing coverage). The extension is plain, dependency-free browser JS with
// no build step and no test runner of its own (see extension/README.md), so
// these tests load the real source files with Node's built-in `vm` module
// instead of adding a browser test toolchain just for a handful of pure
// functions. Only functions that don't touch `document` are exercised here
// (findIngredientsFromText, extractNutritionFromText, pickAdapter dispatch,
// and the color/label helpers) — DOM-scraping code (firstMatch, the actual
// per-site extract()s) is inherently untestable without a live page and is
// covered by the try/catch "fail soft" design documented in adapters/index.js.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';

function loadExtensionScript(relPath: string, sandbox: { window: Record<string, any> }) {
  // The extension's scripts assign `window.SugarShield = ...` and then refer
  // to the bare identifier `SugarShield` later in the same file — which only
  // works because in a real browser `window` IS the global object. Make
  // `window` self-referential here so the same is true inside this sandbox.
  sandbox.window = sandbox as unknown as Record<string, any>;
  const code = readFileSync(path.resolve(__dirname, '..', 'extension', relPath), 'utf-8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: relPath });
  return sandbox.window.SugarShield;
}

describe('extension adapters/index.js — adapterUtils', () => {
  const sandbox = { window: {} };
  const SS = loadExtensionScript('src/adapters/index.js', sandbox);

  it('extracts text following an "Ingredients:" label', () => {
    const text = 'Some header. Ingredients: Water, Sugar, Salt. Allergen info: none.';
    // Trailing punctuation left over from the stop-word cut is stripped.
    expect(SS.adapterUtils.findIngredientsFromText(text)).toBe('Water, Sugar, Salt');
  });

  it('cuts the captured text off at a known "next section" stop word', () => {
    const text = 'Ingredients: Water, High Fructose Corn Syrup, Caramel Color\nNutrition Facts\nCalories 140';
    const result = SS.adapterUtils.findIngredientsFromText(text);
    expect(result).toBe('Water, High Fructose Corn Syrup, Caramel Color');
    expect(result).not.toMatch(/Nutrition Facts|Calories/);
  });

  it('cuts at the first double newline (paragraph break)', () => {
    const text = 'Ingredients: Water, Sugar, Salt\n\nCustomer reviews say this is great.';
    expect(SS.adapterUtils.findIngredientsFromText(text)).toBe('Water, Sugar, Salt');
  });

  it('returns null when there is no "ingredients" label in the text', () => {
    expect(SS.adapterUtils.findIngredientsFromText('Just a product description with no label.')).toBeNull();
  });

  it('returns null for empty/falsy input instead of throwing', () => {
    expect(SS.adapterUtils.findIngredientsFromText('')).toBeNull();
    expect(SS.adapterUtils.findIngredientsFromText(null as unknown as string)).toBeNull();
  });

  it('extracts total sugars, added sugars, and serving size from nutrition text', () => {
    const text = 'Serving size: 1 bottle (355mL)\nTotal Sugars 39g\n5g Added Sugars';
    const result = SS.adapterUtils.extractNutritionFromText(text);
    expect(result).toMatchObject({
      servingSize: '1 bottle (355mL)',
      totalSugarsG: 39,
      addedSugarsG: 5,
    });
  });

  it('returns null when no nutrition figures are present', () => {
    expect(SS.adapterUtils.extractNutritionFromText('Water, Sugar, Salt, Natural Flavors.')).toBeNull();
  });

  it('pickAdapter dispatches by hostname to the registered per-site adapter', () => {
    const fakeAmazon = { extract: () => ({ ingredients: 'fake' }) };
    const fakeWalmart = { extract: () => ({ ingredients: 'fake' }) };
    const fakeTarget = { extract: () => ({ ingredients: 'fake' }) };
    sandbox.window.SugarShield.adapters = { amazon: fakeAmazon, walmart: fakeWalmart, target: fakeTarget };

    expect(SS.pickAdapter('www.amazon.com')).toBe(fakeAmazon);
    expect(SS.pickAdapter('smile.amazon.co.uk')).toBe(fakeAmazon);
    expect(SS.pickAdapter('www.walmart.com')).toBe(fakeWalmart);
    expect(SS.pickAdapter('www.target.com')).toBe(fakeTarget);
    expect(SS.pickAdapter('www.example.com')).toBeNull();
    // A hostname that merely contains "amazon" as a substring, not as a
    // dot-delimited label, must not match (e.g. a phishing-adjacent domain).
    expect(SS.pickAdapter('notamazon.com')).toBeNull();
  });
});

describe('extension lib/renderResult.js — risk color/label helpers', () => {
  const sandbox = { window: {} };
  const SS = loadExtensionScript('src/lib/renderResult.js', sandbox);

  it('maps every known risk level to a label and colors', () => {
    for (const level of ['SAFE', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH']) {
      const colors = SS.renderResult.riskColors(level);
      expect(colors.bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(colors.fg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof SS.renderResult.riskLabel(level)).toBe('string');
    }
  });

  it('falls back to a neutral UNKNOWN label/color for an unrecognized level, never throwing', () => {
    expect(SS.renderResult.riskLabel('NOT_A_REAL_LEVEL')).toBe('UNKNOWN');
    expect(() => SS.renderResult.riskColors(undefined)).not.toThrow();
  });

  it('formats a 0-1 fraction as a rounded percent', () => {
    expect(SS.renderResult.formatPercent(0.873)).toBe('87%');
    expect(SS.renderResult.formatPercent(0)).toBe('0%');
    expect(SS.renderResult.formatPercent(NaN)).toBe('N/A');
    expect(SS.renderResult.formatPercent('0.5' as unknown as number)).toBe('N/A');
  });
});

describe('extension lib/api.js — request body construction', () => {
  it('rejects an empty ingredients string before ever calling fetch', async () => {
    const sandbox: { window: Record<string, any>; chrome: any; fetch?: any } = {
      window: {},
      chrome: { storage: { local: { get: async () => ({}) } } },
    };
    let fetchCalled = false;
    sandbox.fetch = async () => {
      fetchCalled = true;
      throw new Error('fetch should not have been called');
    };
    const SS = loadExtensionScript('src/lib/api.js', sandbox);

    await expect(SS.api.analyze({ ingredients: '   ' })).rejects.toThrow(/ingredients are required/i);
    expect(fetchCalled).toBe(false);
  });

  it('defaults to the production API base and posts STRICT mode by default', async () => {
    let capturedUrl = '';
    let capturedBody: any = null;
    const sandbox: { window: Record<string, any>; chrome: any; fetch?: any } = {
      window: {},
      chrome: { storage: { local: { get: async () => ({}) } } },
    };
    sandbox.fetch = async (url: string, init: any) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ riskLevel: 'SAFE' }) };
    };
    const SS = loadExtensionScript('src/lib/api.js', sandbox);

    const result = await SS.api.analyze({ ingredients: 'Water, Sugar' });
    expect(capturedUrl).toBe('https://sugarshield.vercel.app/api/analyze');
    expect(capturedBody).toMatchObject({ ingredients: 'Water, Sugar', mode: 'STRICT' });
    expect(result).toEqual({ riskLevel: 'SAFE' });
  });
});
