// SugarShield API client.
//
// Talks ONLY to SugarShield's own /api/analyze endpoint. There is no
// OpenAI/model API key anywhere in this extension, by construction -- the
// extension has no direct access to any model credential; it only ever
// calls SugarShield's own server, which owns that concern.
//
// The base URL defaults to production and can be overridden for local
// development via chrome.storage.local (see README "Pointing at a local
// dev server"). Plain script (no build step) sharing state through the
// window.SugarShield namespace so it can be loaded directly by both the
// popup and the content scripts.

(function () {
  window.SugarShield = window.SugarShield || {};

  const DEFAULT_API_BASE = 'https://sugarshield.vercel.app';
  const STORAGE_KEY = 'sugarshieldApiBase';

  /** Reads the developer override for the API base URL, if any. */
  async function getApiBase() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const override = stored && stored[STORAGE_KEY];
      if (override && typeof override === 'string' && override.trim()) {
        return override.trim().replace(/\/+$/, '');
      }
    } catch (err) {
      // chrome.storage can be unavailable in rare contexts (e.g. an
      // invalidated extension context); fall back to production silently.
    }
    return DEFAULT_API_BASE;
  }

  /**
   * Calls POST /api/analyze.
   * @param {{productName?: string, ingredients: string, nutrition?: object, mode?: 'STRICT'|'LENIENT'}} input
   * @returns {Promise<object>} the AnalyzeResponseBody
   */
  async function analyze(input) {
    input = input || {};
    const ingredients = input.ingredients;
    if (!ingredients || !String(ingredients).trim()) {
      throw new Error('Ingredients are required.');
    }

    const base = await getApiBase();
    const body = {
      ingredients: String(ingredients),
      mode: input.mode === 'LENIENT' ? 'LENIENT' : 'STRICT',
    };
    if (input.productName && String(input.productName).trim()) {
      body.productName = String(input.productName).trim();
    }
    if (input.nutrition && typeof input.nutrition === 'object') {
      body.nutrition = input.nutrition;
    }

    let response;
    try {
      response = await fetch(base + '/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        'Could not reach SugarShield at ' + base + '. Check your connection or the configured API base URL.'
      );
    }

    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error('SugarShield returned an unreadable response (HTTP ' + response.status + ').');
    }

    if (!response.ok) {
      throw new Error((data && data.error) || 'SugarShield request failed (HTTP ' + response.status + ').');
    }

    return data;
  }

  window.SugarShield.api = { getApiBase, analyze, DEFAULT_API_BASE, STORAGE_KEY };
})();
