// Amazon product-page adapter (heuristic, best-effort).
//
// Amazon renders product pages very differently across categories (grocery
// vs. general merchandise) and constantly tweaks markup, so nothing here is
// guaranteed to exist on any given listing. Strategy, in order:
//   1. The "Important information" module often has a literal "Ingredients"
//      heading followed by the ingredient text -- #productTitle is the one
//      near-universal selector for the product name.
//   2. Product description / feature bullets sometimes include it instead.
//   3. Fall back to scanning the whole visible page text for an
//      "Ingredients:" label.
// Every step fails soft; extract() never throws.

(function () {
  window.SugarShield = window.SugarShield || {};
  SugarShield.adapters = SugarShield.adapters || {};

  function findIngredientsUnderHeading(root, utils) {
    if (!root) return null;
    const headingEls = root.querySelectorAll('h1, h2, h3, h4, h5, b, span, div');
    for (const el of headingEls) {
      const text = (el.textContent || '').trim();
      if (/^ingredients\s*:?$/i.test(text)) {
        const next = el.nextElementSibling;
        if (next && next.textContent && next.textContent.trim().length > 5) {
          return next.textContent.trim().slice(0, 2000);
        }
        if (el.parentElement) {
          const parentText = el.parentElement.textContent.replace(text, '').trim();
          if (parentText.length > 5) return parentText.slice(0, 2000);
        }
      }
    }
    return utils.findIngredientsFromText(root.textContent);
  }

  SugarShield.adapters.amazon = {
    extract() {
      try {
        const utils = SugarShield.adapterUtils;
        const productName = utils.firstMatch(['#productTitle', 'span#productTitle', 'h1.a-size-large']);

        let ingredients = null;

        const importantInfo = document.querySelector('#importantInformation, #important-information');
        if (importantInfo) {
          ingredients = findIngredientsUnderHeading(importantInfo, utils);
        }

        if (!ingredients) {
          const descNodes = document.querySelectorAll(
            '#productDescription, #feature-bullets, #detailBullets_feature_div'
          );
          for (const node of descNodes) {
            ingredients = findIngredientsUnderHeading(node, utils) || utils.findIngredientsFromText(node.textContent);
            if (ingredients) break;
          }
        }

        if (!ingredients) {
          ingredients = utils.findIngredientsFromText(document.body.innerText);
        }

        const nutrition = utils.extractNutritionFromText(document.body.innerText);

        return { productName: productName || null, ingredients: ingredients || null, nutrition };
      } catch (err) {
        console.warn('[SugarShield] Amazon adapter failed:', err);
        return { productName: null, ingredients: null, nutrition: null };
      }
    },
  };
})();
