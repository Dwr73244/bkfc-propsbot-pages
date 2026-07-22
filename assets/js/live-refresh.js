// Live refresh for event + research pages.
// The HTML is served with a snapshot of odds at last build time. This script
// fetches the current JSON files, hot-swaps moneylines/probabilities if newer,
// and computes a "line moved X pts in Nh" chip from the odds-history log.
//
// Never rebuilds the page — fires silently every 60s as long as the tab is
// visible. Degrades gracefully if JSON isn't reachable.

// Sticky in-article betting bar — IntersectionObserver tracks the
// currently-visible bout on event + research pages and floats a compact
// summary above the bottom tab bar (mobile) or bottom-right (desktop).
// Shows: fighter names, consensus moneylines, model-favored side, link
// out to the research anchor, "copy ML" action.
(function () {
  'use strict';
  if (!document.body.dataset.eventSlug) return;
  // Only render on event page (NOT research — research IS the bettor's view)
  const isResearchPage = /\/research\/?$/.test(location.pathname);
  if (isResearchPage) return;

  // Find all bout cards with market odds
  const boutCards = Array.from(document.querySelectorAll('[data-bout-key][data-variant="market-tiles"]'));
  if (!boutCards.length) return;

  // Build the sticky bar once
  const bar = document.createElement('div');
  bar.className = 'sticky-bet-bar';
  bar.innerHTML = `
    <div class="sbb-content">
      <div class="sbb-bout" data-role="sbb-bout">
        <span class="sbb-fighters">—</span>
      </div>
      <div class="sbb-lines">
        <span class="sbb-ml" data-role="sbb-ml-a">—</span>
        <span class="sbb-sep">/</span>
        <span class="sbb-ml" data-role="sbb-ml-b">—</span>
      </div>
      <a href="research/" class="sbb-cta">Research ↗</a>
    </div>`;
  document.body.appendChild(bar);

  const fmtAmerican = (ml) => (ml > 0 ? '+' + ml : ml);

  const updateBar = (card) => {
    const article = card.closest('article');
    if (!article) return;
    const names = article.querySelectorAll('.adv-name');
    const namesText = names.length >= 2
      ? (names[0].textContent.trim() + ' vs ' + names[1].textContent.trim())
      : '—';
    const mlA = card.querySelector('[data-role="ml-a"]')?.textContent?.trim();
    const mlB = card.querySelector('[data-role="ml-b"]')?.textContent?.trim();
    bar.querySelector('[data-role="sbb-bout"] .sbb-fighters').textContent = namesText;
    bar.querySelector('[data-role="sbb-ml-a"]').textContent = mlA || '—';
    bar.querySelector('[data-role="sbb-ml-b"]').textContent = mlB || '—';
    bar.classList.add('visible');
  };

  const io = new IntersectionObserver((entries) => {
    // Find the most-visible bout card
    const visible = entries
      .filter((e) => e.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) updateBar(visible.target);
    // Hide bar when no bout is visible (above the fold)
    const anyVisible = boutCards.some((c) => {
      const r = c.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    });
    if (!anyVisible) bar.classList.remove('visible');
  }, {
    root: null,
    threshold: [0, 0.2, 0.5, 0.8, 1],
    rootMargin: '-30% 0px -30% 0px', // Activate when card is near center
  });
  boutCards.forEach((c) => io.observe(c));
})();

(function () {
  'use strict';
  const slug = document.body.dataset.eventSlug;
  if (!slug) return; // Only event + research pages have this set.

  const DATA_PREFIX = document.body.dataset.assetPrefix || '/';

  // Skip polling for completed events — results are static, no reason to
  // hammer the server for JSON that won't change. Also silences the
  // inevitable 404s for stubs with no odds/predictions/history files.
  const eventStatus = document.body.dataset.eventStatus;
  const hasOdds = document.body.dataset.hasOdds === '1';
  const hasPred = document.body.dataset.hasPred === '1';
  const hasHistory = document.body.dataset.hasHistory === '1';
  if (eventStatus === 'completed') return;
  if (!hasOdds && !hasPred) return;

  function fmtRel(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const diff = Date.now() - d.getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return m + ' min ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function fmtAmerican(ml) {
    if (ml == null) return '—';
    return ml > 0 ? '+' + ml : String(ml);
  }

  function impliedProb(ml) {
    if (ml == null) return null;
    return ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);
  }

  function boutKey(a, b) {
    return [a, b].sort().join('|');
  }

  // Tracks the snapshot embedded in the HTML at build time. Prevents redundant
  // DOM writes when the fetched JSON hasn't advanced.
  let lastFetchedAt = null;

  async function fetchJson(path) {
    try {
      const r = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  async function fetchText(path) {
    try {
      const r = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return '';
      return await r.text();
    } catch {
      return '';
    }
  }

  function updateMarketBars(odds) {
    if (!odds?.bouts) return;
    const boutMap = new Map();
    for (const b of odds.bouts) boutMap.set(boutKey(b.fighter_a_slug, b.fighter_b_slug), b);

    document.querySelectorAll('[data-bout-key][data-variant="market"]').forEach((row) => {
      const key = row.getAttribute('data-bout-key');
      const bout = boutMap.get(key);
      if (!bout) return;
      const segs = row.querySelectorAll('.seg[data-fighter-slug]');
      segs.forEach((seg) => {
        const fs = seg.getAttribute('data-fighter-slug');
        const isA = fs === bout.fighter_a_slug;
        const ml = isA ? bout.moneyline_a : bout.moneyline_b;
        const sum = bout.implied_prob_a + bout.implied_prob_b;
        const fairA = bout.implied_prob_a / sum;
        const fairB = bout.implied_prob_b / sum;
        const prob = isA ? fairA : fairB;
        const pct = Math.round(prob * 100);

        const minShow = 14;
        const wRaw = isA ? pct : 100 - pct;
        const w = Math.max(minShow, Math.min(100 - minShow, wRaw));
        seg.style.width = w + '%';

        const pctSpan = seg.querySelector('[data-role^="pct-"]');
        if (pctSpan) pctSpan.textContent = (isA ? pct : 100 - pct) + '%';
        const mlSpan = seg.querySelector('[data-role^="ml-"]');
        if (mlSpan) mlSpan.textContent = fmtAmerican(ml);
      });
    });

    // Market "tile" variant on event page
    document.querySelectorAll('[data-bout-key][data-variant="market-tiles"]').forEach((row) => {
      const key = row.getAttribute('data-bout-key');
      const bout = boutMap.get(key);
      if (!bout) return;
      const tiles = row.querySelectorAll('[data-fighter-slug]');
      tiles.forEach((tile) => {
        const fs = tile.getAttribute('data-fighter-slug');
        const isA = fs === bout.fighter_a_slug;
        const ml = isA ? bout.moneyline_a : bout.moneyline_b;
        const p = impliedProb(ml);
        const mlEl = tile.querySelector('[data-role^="ml-"]');
        const ipEl = tile.querySelector('[data-role^="ip-"]');
        if (mlEl) mlEl.textContent = fmtAmerican(ml);
        if (ipEl && p != null) ipEl.textContent = (p * 100).toFixed(1) + '%';
      });
    });
  }

  function updateModelBars(pred) {
    if (!pred?.bouts) return;
    const predMap = new Map();
    for (const b of pred.bouts) predMap.set(boutKey(b.fighter_a_slug, b.fighter_b_slug), b);

    document.querySelectorAll('[data-bout-key][data-variant="model"]').forEach((row) => {
      const key = row.getAttribute('data-bout-key');
      const p = predMap.get(key);
      if (!p?.prediction) return;
      const segs = row.querySelectorAll('.seg[data-fighter-slug]');
      segs.forEach((seg) => {
        const fs = seg.getAttribute('data-fighter-slug');
        const isA = fs === p.fighter_a_slug;
        const prob = isA ? p.prediction.prob_a : p.prediction.prob_b;
        const pct = Math.round(prob * 100);
        const minShow = 14;
        const w = Math.max(minShow, Math.min(100 - minShow, pct));
        seg.style.width = w + '%';
        const pctSpan = seg.querySelector('[data-role^="pct-"]');
        if (pctSpan) pctSpan.textContent = pct + '%';
      });
    });
  }

  function renderLineMovementChips(odds, history) {
    if (!odds?.bouts || !history.length) return;
    // Find the earliest snapshot that is at least 30 min older than current.
    const nowMs = new Date(odds.fetched_at).getTime();
    const cutoff = nowMs - 30 * 60 * 1000;
    const priorList = history.filter((h) => new Date(h.t).getTime() < cutoff);
    if (!priorList.length) return;
    // Use the earliest available prior within 6h
    const recentWindow = nowMs - 6 * 60 * 60 * 1000;
    const candidates = priorList.filter((h) => new Date(h.t).getTime() >= recentWindow);
    const prior = candidates.length ? candidates[0] : priorList[priorList.length - 1];
    if (!prior) return;
    const priorMs = new Date(prior.t).getTime();
    const hoursAgo = Math.max(0.5, (nowMs - priorMs) / (60 * 60 * 1000));
    const hoursLabel = hoursAgo < 1 ? Math.round(hoursAgo * 60) + 'm' : hoursAgo.toFixed(1) + 'h';

    const priorMap = new Map();
    for (const b of prior.b || []) priorMap.set(boutKey(b.a, b.b), b);

    for (const b of odds.bouts) {
      const k = boutKey(b.fighter_a_slug, b.fighter_b_slug);
      const p = priorMap.get(k);
      if (!p) continue;
      const deltaA = b.moneyline_a - p.ma;
      // Which side did the line move toward? Moneyline becoming more negative = favorite's price shortens.
      if (Math.abs(deltaA) < 5) continue; // ignore <5pt noise
      const favoredSlug = deltaA < 0 ? b.fighter_a_slug : b.fighter_b_slug;
      const favoredName = favoredSlug.split('-').slice(-1)[0];
      const displayName = favoredName.charAt(0).toUpperCase() + favoredName.slice(1);
      // Find bout card to inject chip
      const targets = document.querySelectorAll(
        '[data-bout-key="' + k + '"][data-variant="market"], [data-bout-key="' + k + '"][data-variant="market-tiles"]'
      );
      targets.forEach((t) => {
        // Skip if chip already there
        if (t.parentElement.querySelector('[data-role="line-move-chip"]')) return;
        const chip = document.createElement('span');
        chip.setAttribute('data-role', 'line-move-chip');
        chip.style.cssText =
          'display:inline-flex;align-items:center;gap:0.3rem;margin-top:0.5rem;padding:0.2rem 0.55rem;border-radius:999px;font-family:\"JetBrains Mono\",monospace;font-size:0.6rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;background:rgba(34,169,236,0.1);border:1px solid rgba(34,169,236,0.3);color:#22a9ec;';
        chip.innerHTML =
          '<span>↘ Line moved ' + Math.abs(deltaA) + 'pt to ' + displayName + ' · ' + hoursLabel + '</span>';
        t.parentElement.insertBefore(chip, t.nextSibling);
      });
    }
  }

  function updateTimestamps(odds, pred) {
    document.querySelectorAll('[data-role="odds-ts"]').forEach((el) => {
      if (odds?.fetched_at) el.textContent = fmtRel(odds.fetched_at);
    });
    document.querySelectorAll('[data-role="model-ts"]').forEach((el) => {
      if (pred?.generated_at) el.textContent = fmtRel(pred.generated_at);
    });
  }

  async function refresh() {
    if (document.visibilityState !== 'visible') return;
    // Gate each fetch on build-time presence flags to avoid 404 noise.
    const [odds, pred, historyText] = await Promise.all([
      hasOdds ? fetchJson(DATA_PREFIX + 'data/odds/' + slug + '.json') : Promise.resolve(null),
      hasPred ? fetchJson(DATA_PREFIX + 'data/predictions/' + slug + '.json') : Promise.resolve(null),
      hasHistory ? fetchText(DATA_PREFIX + 'data/odds-history/' + slug + '.jsonl') : Promise.resolve(''),
    ]);

    // Only update if odds snapshot actually advanced
    if (odds?.fetched_at && odds.fetched_at !== lastFetchedAt) {
      lastFetchedAt = odds.fetched_at;
      updateMarketBars(odds);
    }
    if (pred) updateModelBars(pred);
    updateTimestamps(odds, pred);

    const history = historyText
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (odds && history.length) renderLineMovementChips(odds, history);
  }

  // Initial fire + 60s poll + on visibility change
  refresh();
  setInterval(refresh, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
})();
