// Adapter registry + shared scraping heuristics.
//
// Everything in `adapterUtils` is best-effort text scanning over live DOM /
// visible text. Retailers restructure their markup constantly and A/B test
// product pages, so none of this is guaranteed to find anything -- every
// helper fails soft (returns null) instead of throwing, and the per-site
// adapter files (amazon.js, walmart.js, target.js) wrap their own extract()
// in try/catch on top of that as a second layer of safety.

(function () {
  window.SugarShield = window.SugarShield || {};
  SugarShield.adapters = SugarShield.adapters || {};

  /** Returns the trimmed textContent of the first matching selector, or null. */
  function firstMatch(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim()) {
          return el.textContent.trim();
        }
      } catch (err) {
        // invalid selector on this page's DOM shape; try the next one
      }
    }
    return null;
  }

  // Section headings that typically follow an ingredient list on a product
  // label. Used to cut the captured text off before it runs into the next
  // section instead of scooping up the whole page.
  const STOP_WORDS = [
    'allergen',
    'allergy information',
    'contains:',
    'may contain',
    'nutrition facts',
    'nutritional information',
    'directions',
    'warning',
    'storage instructions',
    'manufactured by',
    'distributed by',
    'best if used',
    'net wt',
    'net weight',
    'product description',
    'customer reviews',
  ];

  /**
   * Given a blob of page text, finds text following an "Ingredients:" (or
   * "Ingredient:") label and trims it down to a plausible ingredient list.
   * Returns null if no such label is found.
   */
  function findIngredientsFromText(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/\r/g, '');
    const match = cleaned.match(/ingredients?\s*[:\-]\s*([\s\S]{5,4000})/i);
    if (!match) return null;

    let candidate = match[1];

    // Cut off at the first double newline (ingredient lists are usually a
    // single paragraph/run of text).
    const paraBreak = candidate.search(/\n\s*\n/);
    if (paraBreak !== -1 && paraBreak > 5) {
      candidate = candidate.slice(0, paraBreak);
    }

    // Cut off at the first known "next section" keyword.
    const lower = candidate.toLowerCase();
    let cutIndex = candidate.length;
    for (const word of STOP_WORDS) {
      const idx = lower.indexOf(word);
      if (idx !== -1 && idx > 5 && idx < cutIndex) cutIndex = idx;
    }
    candidate = candidate.slice(0, cutIndex);

    candidate = candidate.replace(/\s+/g, ' ').trim().replace(/[.:\-]+$/, '').trim();

    if (candidate.length < 5) return null;
    return candidate.slice(0, 2000);
  }

  /**
   * Best-effort extraction of nutrition facts (serving size / total sugars /
   * added sugars) from a blob of page text. Returns null if nothing is found.
   */
  function extractNutritionFromText(text) {
    if (!text) return null;
    const totalMatch = text.match(/total sugars?[^0-9]{0,12}(\d+(?:\.\d+)?)\s*g/i);
    const addedMatch =
      text.match(/(\d+(?:\.\d+)?)\s*g\s+added sugars?/i) ||
      text.match(/added sugars?[^0-9]{0,12}(\d+(?:\.\d+)?)\s*g/i);
    const servingMatch = text.match(/serving size[:\s]*([^\n<]{1,40})/i);

    if (!totalMatch && !addedMatch && !servingMatch) return null;

    return {
      servingSize: servingMatch ? servingMatch[1].trim() : null,
      totalSugarsG: totalMatch ? parseFloat(totalMatch[1]) : null,
      addedSugarsG: addedMatch ? parseFloat(addedMatch[1]) : null,
    };
  }

  SugarShield.adapterUtils = { firstMatch, findIngredientsFromText, extractNutritionFromText };

  /** Picks the adapter for a hostname (defaults to location.hostname). */
  SugarShield.pickAdapter = function pickAdapter(hostname) {
    hostname = hostname || location.hostname;
    if (/(^|\.)amazon\./i.test(hostname)) return SugarShield.adapters.amazon || null;
    if (/(^|\.)walmart\./i.test(hostname)) return SugarShield.adapters.walmart || null;
    if (/(^|\.)target\./i.test(hostname)) return SugarShield.adapters.target || null;
    return null;
  };
})();
