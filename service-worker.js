/**
 * service-worker.js
 * CalTrack PWA service worker.
 * Strategy: cache-first for app shell, network-first for USDA API calls.
 */

const CACHE_NAME = 'caltrack-v1';

// App shell — everything needed to run offline
const SHELL = [
  '/caltrack/',
  '/caltrack/index.html',
  '/caltrack/css/style.css',
  '/caltrack/js/storage.js',
  '/caltrack/js/usda.js',
  '/caltrack/js/sheets.js',
  '/caltrack/js/app.js',
  '/caltrack/manifest.json',
  '/caltrack/icons/icon-192.png',
  '/caltrack/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
];

// ── Install: cache the app shell ─────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first for shell, network-first for APIs ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go to network for API calls
  const isAPI = url.hostname.includes('googleapis.com') ||
                url.hostname.includes('nal.usda.gov') ||
                url.hostname.includes('anthropic.com') ||
                url.hostname.includes('accounts.google.com') ||
                url.hostname.includes('openfoodfacts.org');

  if (isAPI) {
    // Network-first, no caching for API responses
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Cache-first for everything else (app shell, fonts)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/caltrack/index.html');
        }
        return new Response('', { status: 503 });
      });
    })
  );
});
