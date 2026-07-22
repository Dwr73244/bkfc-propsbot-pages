// Shared client helpers (currently minimal — pages are server-rendered at build time).

// Countdown ticker: any element with data-event-date triggers a 1s interval
// that renders a human-readable "2d 4h 12m" countdown in the child
// [data-role="countdown"] element until the event date passes.
(function () {
  const roots = document.querySelectorAll('[data-event-date]');
  if (!roots.length) return;
  function render() {
    roots.forEach((root) => {
      const iso = root.getAttribute('data-event-date');
      const target = root.querySelector('[data-role="countdown"]');
      if (!target || !iso) return;
      const diff = new Date(iso) - Date.now();
      if (diff <= 0) {
        target.textContent = 'Live';
        target.style.color = '#ff1552';
        return;
      }
      const s = Math.floor(diff / 1000);
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      let out = '';
      if (d > 0) out = d + 'd ' + h + 'h ' + m + 'm';
      else if (h > 0) out = h + 'h ' + m + 'm ' + sec + 's';
      else out = m + 'm ' + sec + 's';
      target.textContent = '· ' + out;
    });
  }
  render();
  setInterval(render, 1000);
})();

(function () {
  window.BKFC = window.BKFC || {};

  window.BKFC.fmtDate = function (iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  window.BKFC.fmtTime = function (iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  window.BKFC.daysUntil = function (iso) {
    if (!iso) return null;
    const diff = new Date(iso) - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return null;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return 'In ' + days + ' days';
  };
})();

// PWA: register the service worker on HTTPS only (localhost file:// has no SW
// and GH Pages previews use HTTP for some paths). Silent failure — a missing
// SW should never break page load.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Newsletter signup JS intentionally removed — BKFC-specific list doesn't
// exist yet on Elastic Email. When ready, reinstate with the real endpoint.
