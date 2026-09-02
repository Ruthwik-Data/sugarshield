// Walmart product-page adapter (heuristic, best-effort).
//
// Walmart's PDP markup and data-testid attributes change between
// deployments, so this looks for a small set of plausible containers first,
// then falls back to scanning the whole visible page text for an
// "Ingredients:" label. Fails soft; extract() never throws.

(function () {
  window.SugarShield = window.SugarShield || {};
  SugarShield.adapters = SugarShield.adapters || {};

  SugarShield.adapters.walmart = {
    extract() {
      try {
        const utils = SugarShield.adapterUtils;
        const productName = utils.firstMatch([
          'h1[itemprop="name"]',
          'h1[data-testid="product-title"]',
          'h1.prod-ProductTitle',
          'h1',
        ]);

        let ingredients = null;
        const candidateSelectors = [
          '[data-testid="product-description"]',
          '[data-testid="ingredients"]',
          '#ingredients-content',
          '.ingredients',
        ];
        for (const sel of candidateSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            ingredients = utils.findIngredientsFromText(el.textContent);
            if (ingredients) break;
          }
        }

        if (!ingredients) {
          ingredients = utils.findIngredientsFromText(document.body.innerText);
        }

        const nutrition = utils.extractNutritionFromText(document.body.innerText);

        return { productName: productName || null, ingredients: ingredients || null, nutrition };
      } catch (err) {
        console.warn('[SugarShield] Walmart adapter failed:', err);
        return { productName: null, ingredients: null, nutrition: null };
      }
    },
  };
})();
