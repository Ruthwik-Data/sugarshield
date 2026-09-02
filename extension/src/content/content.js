// SugarShield content script (Amazon / Walmart / Target only, per manifest
// content_scripts matches).
//
// Flow: pick the right site adapter -> extract() a best-effort ingredients
// list -> if found, call the SugarShield API directly -> if that succeeds,
// show a small floating badge. If extraction finds nothing, stay
// completely silent -- we don't want to clutter pages SugarShield can't
// actually analyze.

(function () {
  const SS = window.SugarShield;
  if (!SS || !SS.api || !SS.adapters || !SS.resultView || !SS.renderResult) {
    // One of the shared library files failed to load; nothing to do.
    return;
  }

  async function run() {
    const adapter = SS.pickAdapter(location.hostname);
    if (!adapter) return;

    let extracted;
    try {
      extracted = adapter.extract();
    } catch (err) {
      console.warn('[SugarShield] adapter extraction threw unexpectedly:', err);
      return;
    }

    if (!extracted || !extracted.ingredients) {
      return; // nothing usable found on this page
    }

    let result;
    try {
      result = await SS.api.analyze({
        productName: extracted.productName || undefined,
        ingredients: extracted.ingredients,
        nutrition: extracted.nutrition || undefined,
        mode: 'STRICT',
      });
    } catch (err) {
      console.warn('[SugarShield] analyze() failed:', err.message || err);
      return;
    }

    showBadge(result, extracted);
    rememberResult(result, extracted);
    notifyBackground(result);
  }

  function rememberResult(result, extracted) {
    try {
      chrome.storage.local.set({
        sugarshieldLastResult: {
          result,
          productName: extracted.productName || null,
          ingredients: extracted.ingredients,
          url: location.href,
          at: Date.now(),
        },
      });
    } catch (err) {
      // Non-fatal: the popup simply won't have a pre-filled result to show.
    }
  }

  function notifyBackground(result) {
    try {
      chrome.runtime.sendMessage({ type: 'SUGARSHIELD_RESULT', riskLevel: result.riskLevel }, () => {
        // Swallow "no receiving end" style errors -- the badge on the page
        // already conveys the result even if the toolbar badge update fails.
        void chrome.runtime.lastError;
      });
    } catch (err) {
      // background context can be unavailable during an extension reload; non-fatal
    }
  }

  function showBadge(result, extracted) {
    const previous = document.getElementById('sugarshield-badge');
    if (previous) previous.remove();
    const previousPanel = document.getElementById('sugarshield-panel');
    if (previousPanel) previousPanel.remove();

    const colors = SS.renderResult.riskColors(result.riskLevel);

    const badge = document.createElement('div');
    badge.id = 'sugarshield-badge';
    badge.className = 'sugarshield-badge';
    badge.style.setProperty('--sugarshield-color', colors.bg);
    badge.style.setProperty('--sugarshield-text', colors.fg);
    badge.textContent = 'SugarShield: ' + SS.renderResult.riskLabel(result.riskLevel);
    badge.title = 'Click for full SugarShield analysis';
    badge.setAttribute('role', 'button');
    badge.tabIndex = 0;

    const toggle = () => togglePanel(result, extracted);
    badge.addEventListener('click', toggle);
    badge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') toggle();
    });

    document.body.appendChild(badge);
  }

  function togglePanel(result, extracted) {
    const existing = document.getElementById('sugarshield-panel');
    if (existing) {
      existing.remove();
      return;
    }

    const panel = document.createElement('div');
    panel.id = 'sugarshield-panel';
    panel.className = 'sugarshield-panel';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sugarshield-panel-close';
    closeBtn.setAttribute('aria-label', 'Close SugarShield panel');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => panel.remove());
    panel.appendChild(closeBtn);

    const body = document.createElement('div');
    panel.appendChild(body);

    document.body.appendChild(panel);
    SS.resultView.render(body, result, { productName: extracted.productName });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    run();
  } else {
    window.addEventListener('DOMContentLoaded', run, { once: true });
  }
})();
