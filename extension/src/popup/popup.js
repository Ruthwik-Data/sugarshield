// SugarShield popup logic.
//
// Always works standalone (paste any ingredient list, anywhere) -- this is
// the MVP surface that never depends on page detection. If a content script
// on the currently active tab already produced a result (see content.js),
// that result is shown immediately instead of an empty form.

(function () {
  const SS = window.SugarShield;

  const form = document.getElementById('ss-form');
  const nameInput = document.getElementById('ss-product-name');
  const ingredientsInput = document.getElementById('ss-ingredients');
  const analyzeBtn = document.getElementById('ss-analyze-btn');
  const newBtn = document.getElementById('ss-new-btn');
  const statusEl = document.getElementById('ss-status');
  const resultEl = document.getElementById('ss-result');
  const apiBaseEl = document.getElementById('ss-api-base');

  function setStatus(message, kind) {
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = 'ss-status' + (kind ? ' ss-status--' + kind : '');
  }

  function showForm(show) {
    form.hidden = !show;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const productName = nameInput.value.trim();
    const ingredients = ingredientsInput.value.trim();
    const modeInput = form.querySelector('input[name="ss-mode"]:checked');
    const mode = modeInput ? modeInput.value : 'STRICT';

    if (!ingredients) {
      setStatus('Please enter an ingredients list.', 'error');
      return;
    }

    setStatus('Analyzing...', 'loading');
    resultEl.innerHTML = '';
    analyzeBtn.disabled = true;

    try {
      const result = await SS.api.analyze({
        productName: productName || undefined,
        ingredients,
        mode,
      });
      setStatus('', null);
      SS.resultView.render(resultEl, result, { productName });
      showForm(false);
      newBtn.hidden = false;
    } catch (err) {
      setStatus((err && err.message) || 'Something went wrong. Please try again.', 'error');
    } finally {
      analyzeBtn.disabled = false;
    }
  }

  function resetToForm() {
    resultEl.innerHTML = '';
    setStatus('', null);
    showForm(true);
    newBtn.hidden = true;
  }

  form.addEventListener('submit', handleSubmit);
  newBtn.addEventListener('click', resetToForm);

  /** Returns the active tab's URL, using the activeTab permission granted
   * by the user opening this popup. Returns null if unavailable. */
  async function getActiveTabUrl() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return (tabs && tabs[0] && tabs[0].url) || null;
    } catch (err) {
      return null;
    }
  }

  // If a content script on the active tab already analyzed the page (badge
  // click, or simply the most recently visited product page), show that
  // result immediately instead of an empty form.
  async function tryShowLastResult() {
    try {
      const stored = await chrome.storage.local.get('sugarshieldLastResult');
      const last = stored && stored.sugarshieldLastResult;
      if (!last || !last.result) return;

      // Ignore stale results (older than 30 minutes) so a long-closed tab's
      // data doesn't resurface unexpectedly.
      if (Date.now() - (last.at || 0) > 30 * 60 * 1000) return;

      // Prefer to only auto-show the result if it matches the tab the user
      // is currently looking at.
      const activeUrl = await getActiveTabUrl();
      if (activeUrl && last.url && activeUrl !== last.url) return;

      if (last.productName) nameInput.value = last.productName;
      if (last.ingredients) ingredientsInput.value = last.ingredients;

      setStatus('', null);
      SS.resultView.render(resultEl, last.result, { productName: last.productName });
      showForm(false);
      newBtn.hidden = false;
    } catch (err) {
      // No stored result, or storage unavailable -- just show the empty form.
    }
  }

  async function showApiBase() {
    try {
      const base = await SS.api.getApiBase();
      apiBaseEl.textContent = base === SS.api.DEFAULT_API_BASE ? '' : 'API: ' + base;
    } catch (err) {
      apiBaseEl.textContent = '';
    }
  }

  tryShowLastResult();
  showApiBase();
})();
