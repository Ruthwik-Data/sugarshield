// Target product-page adapter (heuristic, best-effort).
//
// Target's PDP markup and data-test attributes change between deployments,
// so this looks for a small set of plausible containers first, then falls
// back to scanning the whole visible page text for an "Ingredients:" label.
// Fails soft; extract() never throws.

(function () {
  window.SugarShield = window.SugarShield || {};
  SugarShield.adapters = SugarShield.adapters || {};

  SugarShield.adapters.target = {
    extract() {
      try {
        const utils = SugarShield.adapterUtils;
        const productName = utils.firstMatch([
          'h1[data-test="product-title"]',
          'h1[id^="pdp-product-title"]',
          'h1',
        ]);

        let ingredients = null;
        const candidateSelectors = [
          '[data-test="item-details-ingredients"]',
          '[data-test="ingredients"]',
          '#ingredients',
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
        console.warn('[SugarShield] Target adapter failed:', err);
        return { productName: null, ingredients: null, nutrition: null };
      }
    },
  };
})();
