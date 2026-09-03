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
      SS.resultView.render(resultEl, result, { productName, ingredientsText: ingredients });
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

  const SUPPORTED_SITE_RE = /(^|\.)(amazon|walmart|target)\./i;

  /** True if `url`'s host is one of the three sites the extension can auto-scan. */
  function isSupportedSite(url) {
    try {
      return SUPPORTED_SITE_RE.test(new URL(url).hostname);
    } catch (err) {
      return false;
    }
  }

  // If a content script on the active tab already analyzed the page (badge
  // click, or simply the most recently visited product page), show that
  // result immediately instead of an empty form. If the active tab is a
  // supported retailer but nothing was auto-detected there, say so plainly
  // instead of leaving the user guessing why nothing appeared (Part 6-10:
  // clean "unavailable" messaging, never silent failure on a page we claim
  // to support).
  async function tryShowLastResult() {
    const activeUrl = await getActiveTabUrl();

    try {
      const stored = await chrome.storage.local.get('sugarshieldLastResult');
      const last = stored && stored.sugarshieldLastResult;
      const fresh = last && last.result && Date.now() - (last.at || 0) <= 30 * 60 * 1000;
      // Prefer to only auto-show the result if it matches the tab the user is looking at.
      const matchesActiveTab = !activeUrl || !last || !last.url || activeUrl === last.url;

      if (fresh && matchesActiveTab) {
        if (last.productName) nameInput.value = last.productName;
        if (last.ingredients) ingredientsInput.value = last.ingredients;

        setStatus('', null);
        SS.resultView.render(resultEl, last.result, { productName: last.productName, ingredientsText: last.ingredients });
        showForm(false);
        newBtn.hidden = false;
        return;
      }
    } catch (err) {
      // Storage unavailable -- fall through to the plain empty-form state below.
    }

    if (activeUrl && isSupportedSite(activeUrl)) {
      setStatus("Couldn't automatically find an ingredients list on this page. Paste it below instead.", 'info');
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
