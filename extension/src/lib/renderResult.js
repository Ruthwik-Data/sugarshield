// Shared risk-level -> color/label mapping. Used by components/resultView.js
// (the full card) and directly by content.js (for the small floating badge).

(function () {
  window.SugarShield = window.SugarShield || {};

  const RISK_META = {
    SAFE: { label: 'SAFE', bg: '#16a34a', fg: '#ffffff' },
    LOW: { label: 'LOW', bg: '#0d9488', fg: '#ffffff' },
    MODERATE: { label: 'MODERATE', bg: '#d97706', fg: '#ffffff' },
    HIGH: { label: 'HIGH', bg: '#ea580c', fg: '#ffffff' },
    VERY_HIGH: { label: 'VERY HIGH', bg: '#7f1d1d', fg: '#ffffff' },
  };
  const FALLBACK_META = { label: 'UNKNOWN', bg: '#6b7280', fg: '#ffffff' };

  function riskColors(riskLevel) {
    const meta = RISK_META[riskLevel] || FALLBACK_META;
    return { bg: meta.bg, fg: meta.fg };
  }

  function riskLabel(riskLevel) {
    return (RISK_META[riskLevel] || FALLBACK_META).label;
  }

  function formatPercent(fraction) {
    if (typeof fraction !== 'number' || Number.isNaN(fraction)) return 'N/A';
    return Math.round(fraction * 100) + '%';
  }

  window.SugarShield.renderResult = { riskColors, riskLabel, formatPercent, RISK_META };
})();
