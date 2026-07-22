// bkfc.propsbot.ai — minimal service worker.
// Strategy: network-first for HTML (always show fresh odds/picks), cache-first
// for static assets (CSS/JS/fonts/images). Versioned cache name so bumping
// the version invalidates old assets on the next install.

// VERSION string is stamped by scripts/build.mjs on every rebuild. The
// timestamp ensures old caches self-invalidate the next time a user loads
// the page after we ship — no stale HTML / stale CSS lingering after a
// deploy. Placeholder: __BUILD_VERSION__
const VERSION = 'bkfc-propsbot-202607221244';
const PRECACHE = [
  '/',
  '/picks/',
  '/accuracy/',
  '/assets/css/site.css',
  '/assets/css/tailwind.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get('accept') || '';
  const isHtml = req.mode === 'navigate' || accept.includes('text/html');

  if (isHtml) {
    // Network-first: always try fresh, fall back to cache if offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
    );
    return;
  }

  // Cache-first for static assets. Never cache non-OK responses (avoids
  // poisoning the cache with GH Pages 404 HTML served for missing files).
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
