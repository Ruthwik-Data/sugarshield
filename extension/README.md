# SugarShield Chrome Extension (2.0)

A Manifest V3 Chrome extension that scans ingredient lists for hidden
sugars, added sugars, and artificial sweeteners using the same
[SugarShield](https://sugarshield.vercel.app/) analysis engine as the web
app, via its public `POST /api/analyze` endpoint.

It has two ways to work:

1. **Popup (always works, everywhere).** Click the toolbar icon, paste an
   ingredient list, hit Analyze. No page detection required.
2. **Automatic page detection (Amazon / Walmart / Target only).** On a
   product page on one of those three sites, a content script makes a
   best-effort attempt to scrape the product name and ingredients straight
   off the page and analyze it automatically. If it finds something, a
   small floating badge appears in the bottom-right corner; click it for
   the full result. If it can't find an ingredients list, nothing is
   shown on the page itself — no badge clutter on pages SugarShield can't
   actually read. Opening the popup on such a page instead shows a plain
   "couldn't auto-detect ingredients here" message pointing at the manual
   form, rather than leaving you guessing why nothing happened.

## Structure (MV3)

```
extension/
  manifest.json                 # MV3 manifest
  src/
    popup/         popup.html, popup.js, popup.css        # toolbar popup UI
    content/       content.js, content.css                # runs on product pages
    background/    background.js                          # MV3 service worker
    adapters/      amazon.js, walmart.js, target.js, index.js  # per-site scraping heuristics
    lib/           api.js, renderResult.js                 # API client + color/label helpers
    components/    resultView.js                           # shared result-card renderer
  icons/           icon16.png, icon48.png, icon128.png
```

Everything is plain, dependency-free JavaScript loaded directly by the
browser (classic `<script>` tags in `popup.html`, and an ordered `js` list
in `manifest.json` for the content script) — there is **no build step**.
Shared code (the API client, the color/label helpers, and the result-card
renderer) lives under a single `window.SugarShield` namespace object so the
same files can be loaded by both the popup and the content script and stay
in sync automatically.

## Permissions requested, and why

| Permission | Why |
|---|---|
| `storage` | To read the optional local-dev API base URL override (`sugarshieldApiBase`), and to hand a just-completed page analysis from the content script to the popup (`sugarshieldLastResult`) so opening the popup on a page that was already scanned shows that result immediately instead of an empty form. |
| `activeTab` | Used only inside the popup, only once it's opened by the user, to read the current tab's URL (`chrome.tabs.query`) so a stored analysis is only auto-shown if it matches the tab you're actually looking at. Grants no background/persistent access to tabs. |
| `host_permissions`: `https://sugarshield.vercel.app/*` | The extension's own `fetch()` calls to `POST /api/analyze` (from the popup and from the content script) are cross-origin requests that need this host permission. |
| `host_permissions` / `content_scripts` matches: `*://*.amazon.com/*`, `*://*.walmart.com/*`, `*://*.target.com/*` | The only three sites the content script runs on, for the best-effort automatic scan. No broader host access (no `<all_urls>`) is requested. |

Nothing else is requested: no `tabs`, no `scripting`, no `<all_urls>`, no
`webRequest`, no `externally_connectable`, and there is no remote code
loading anywhere (MV3 disallows it in any case) — every script that runs is
bundled inside the extension package.

## Security notes

- The extension talks **only** to SugarShield's own `/api/analyze`
  endpoint. There is no OpenAI key, model API key, or any other secret
  anywhere in this code — by construction, the extension has no
  client-callable path to a model provider; only SugarShield's own server
  does.
- Text scraped off product pages (and text typed into the popup) is always
  inserted into the DOM via `textContent`/DOM APIs, never `innerHTML`, so
  nothing on a scanned page (or typed by a user) can inject markup into the
  extension's UI.
- No `eval`, no dynamically constructed script tags, no remote script
  sources.

## Loading it unpacked in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this `extension/` folder.
5. The SugarShield icon appears in the toolbar. Click it to open the popup.

After editing any file, click the refresh icon on the extension's card in
`chrome://extensions` to reload it.

## Pointing it at a local dev server

By default the extension calls `https://sugarshield.vercel.app`. To point
it at a local `npm run dev` server (typically `http://localhost:3000`)
instead, open the extension's popup, then open the DevTools console for it
(right-click the popup → Inspect) and run:

```js
chrome.storage.local.set({ sugarshieldApiBase: 'http://localhost:3000' });
```

Reload any open product-page tabs (or reopen the popup) after setting
this. To go back to production:

```js
chrome.storage.local.remove('sugarshieldApiBase');
```

(There's intentionally no UI for this yet — it's a developer-only escape
hatch, read by `src/lib/api.js`.)

## Known limitations of the Amazon / Walmart / Target adapters

These are **heuristic, best-effort** DOM/text scrapers, not official
integrations, and they will not work on every listing:

- Retailers change their page markup and A/B test layouts frequently;
  selectors that work today may stop working tomorrow.
- Many listings simply don't publish an ingredients list on the page at
  all (or only publish it as an image, which none of these adapters can
  read).
- The fallback strategy scans visible page text for an "Ingredients:"
  label and grabs the text that follows, cutting it off at the next
  likely section heading (allergens, nutrition facts, directions, etc.).
  This can occasionally grab too much, too little, or the wrong section
  entirely on an unusual page layout.
- Nutrition-fact extraction (serving size / total sugars / added sugars)
  uses the same kind of best-effort regex scanning and is often `null`.
- If nothing plausible is found, the content script does nothing — no
  badge, no API call — rather than showing a low-confidence or wrong
  result.

If a product page doesn't get a badge, the popup's manual paste flow
always works as a fallback.
