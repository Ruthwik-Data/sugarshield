// SugarShield background service worker (MV3).
//
// The extension does almost everything from the popup and content-script
// contexts, which already have chrome.storage access on their own (the
// "storage" permission applies there too). The one thing that genuinely
// needs a background context is the toolbar action badge: chrome.action is
// only available to extension pages / the service worker, not to a content
// script, so when a content script finds a result it messages this worker
// to color the toolbar icon for that tab. No "tabs" permission is used or
// needed here -- sender.tab is provided automatically for messages coming
// from a content script.

const BADGE_COLORS = {
  SAFE: '#16a34a',
  LOW: '#0d9488',
  MODERATE: '#d97706',
  HIGH: '#ea580c',
  VERY_HIGH: '#7f1d1d',
};

const BADGE_SHORT_LABEL = {
  SAFE: 'SAFE',
  LOW: 'LOW',
  MODERATE: 'MOD',
  HIGH: 'HIGH',
  VERY_HIGH: 'V.HI',
};

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'SUGARSHIELD_RESULT') return false;
  const tabId = sender && sender.tab && sender.tab.id;
  if (typeof tabId !== 'number') return false;

  const color = BADGE_COLORS[message.riskLevel] || '#6b7280';
  const label = BADGE_SHORT_LABEL[message.riskLevel] || '';

  try {
    chrome.action.setBadgeBackgroundColor({ color, tabId });
    chrome.action.setBadgeText({ text: label, tabId });
  } catch (err) {
    // Best-effort only; the in-page badge already shows the result.
  }

  return false;
});
