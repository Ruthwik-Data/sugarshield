// Renders a SugarShield analysis result into a container element.
//
// Shared verbatim by the popup (src/popup/popup.js) and the in-page panel
// injected by the content script (src/content/content.js), so both surfaces
// look and behave the same way. Builds DOM nodes with textContent (never
// innerHTML on result/user data) so nothing scraped off a product page or
// typed by the user can inject markup.

(function () {
  window.SugarShield = window.SugarShield || {};

  function renderLoading(container, message) {
    container.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'ss-loading';
    el.textContent = message || 'Analyzing...';
    container.appendChild(el);
  }

  function renderError(container, message) {
    container.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'ss-error';
    el.textContent = message || 'Something went wrong.';
    container.appendChild(el);
  }

  /**
   * Renders the original ingredient text with any detected sugar/sweetener
   * term highlighted in place, so a user can see exactly what was flagged
   * and where -- not just a separate summary list. Splits on commas/
   * semicolons (ingredient lists are comma-separated) and highlights a
   * segment if it contains one of the detected canonical terms. Mirrors
   * components/ResultCard.tsx's HighlightedIngredients so the web app and
   * extension agree on what "highlighted" means.
   */
  function renderHighlightedIngredients(text, detectedSugars, artificialSweeteners) {
    const wrap = document.createElement('div');
    wrap.className = 'ss-ingredients-block';

    const heading = document.createElement('div');
    heading.className = 'ss-list-title';
    heading.textContent = 'Ingredients (flagged terms highlighted)';
    wrap.appendChild(heading);

    const sugarSet = (detectedSugars || []).map((t) => t.toLowerCase());
    const sweetenerSet = (artificialSweeteners || []).map((t) => t.toLowerCase());

    const p = document.createElement('p');
    p.className = 'ss-ingredients-text';
    const parts = String(text).split(/([,;])/);
    parts.forEach((part) => {
      const lower = part.trim().toLowerCase();
      const isSugar = lower && sugarSet.some((t) => lower.includes(t));
      const isSweetener = !isSugar && lower && sweetenerSet.some((t) => lower.includes(t));
      const span = document.createElement('span');
      if (isSugar) span.className = 'ss-ing-sugar';
      else if (isSweetener) span.className = 'ss-ing-sweetener';
      span.textContent = part;
      p.appendChild(span);
    });
    wrap.appendChild(p);
    return wrap;
  }

  function renderList(title, items) {
    const wrap = document.createElement('div');
    wrap.className = 'ss-list-block';

    const heading = document.createElement('div');
    heading.className = 'ss-list-title';
    heading.textContent = title;
    wrap.appendChild(heading);

    if (!items || items.length === 0) {
      const none = document.createElement('div');
      none.className = 'ss-list-empty';
      none.textContent = 'None detected';
      wrap.appendChild(none);
      return wrap;
    }

    const ul = document.createElement('ul');
    ul.className = 'ss-list';
    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    return wrap;
  }

  /**
   * @param {HTMLElement} container
   * @param {object} result the AnalyzeResponseBody from POST /api/analyze
   * @param {{productName?: string|null, ingredientsText?: string|null}} [extra]
   */
  function render(container, result, extra) {
    extra = extra || {};
    container.innerHTML = '';

    const helpers = window.SugarShield.renderResult;
    const colors = helpers.riskColors(result.riskLevel);

    const card = document.createElement('div');
    card.className = 'ss-card';

    if (extra.productName) {
      const title = document.createElement('div');
      title.className = 'ss-product-name';
      title.textContent = extra.productName;
      card.appendChild(title);
    }

    const scoreRow = document.createElement('div');
    scoreRow.className = 'ss-score-row';

    const scoreEl = document.createElement('div');
    scoreEl.className = 'ss-score';
    scoreEl.textContent = String(result.score);
    const scoreUnit = document.createElement('span');
    scoreUnit.className = 'ss-score-unit';
    scoreUnit.textContent = '/100';
    scoreEl.appendChild(scoreUnit);
    scoreRow.appendChild(scoreEl);

    const badge = document.createElement('div');
    badge.className = 'ss-badge';
    badge.style.backgroundColor = colors.bg;
    badge.style.color = colors.fg;
    badge.textContent = helpers.riskLabel(result.riskLevel);
    scoreRow.appendChild(badge);

    card.appendChild(scoreRow);

    if (result.explanation) {
      const explanation = document.createElement('p');
      explanation.className = 'ss-explanation';
      explanation.textContent = result.explanation;
      card.appendChild(explanation);
    }

    const flagsRow = document.createElement('div');
    flagsRow.className = 'ss-flags';
    [
      ['Added sugar', result.containsAddedSugar],
      ['Hidden sugar', result.containsHiddenSugar],
      ['Artificial sweetener', result.containsArtificialSweetener],
      ['Natural sugar', result.containsNaturalSugar],
    ].forEach(([label, on]) => {
      const chip = document.createElement('span');
      chip.className = 'ss-flag ' + (on ? 'ss-flag--on' : 'ss-flag--off');
      chip.textContent = (on ? '✓ ' : '– ') + label;
      flagsRow.appendChild(chip);
    });
    card.appendChild(flagsRow);

    card.appendChild(renderList('Detected sugars', result.detectedSugars));
    card.appendChild(renderList('Artificial sweeteners', result.artificialSweeteners));

    if (extra.ingredientsText && extra.ingredientsText.trim()) {
      card.appendChild(
        renderHighlightedIngredients(extra.ingredientsText, result.detectedSugars, result.artificialSweeteners)
      );
    }

    const meta = document.createElement('div');
    meta.className = 'ss-meta';
    meta.textContent =
      'Confidence: ' + helpers.formatPercent(result.confidence) +
      ' · Mode: ' + result.mode +
      ' · Model: ' + result.model;
    card.appendChild(meta);

    container.appendChild(card);
  }

  window.SugarShield.resultView = { render, renderLoading, renderError };
})();
