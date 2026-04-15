// sw.js — MNRFoodBill Service Worker v4.0.0
// iOS PWA Production Fix — bullet-proof loading on all platforms
// Strategy:
//   App Shell (HTML pages) → Network First with Cache Fallback
//   Static Assets (JS/CSS) → Stale While Revalidate
//   Images                 → Cache First
//   Firebase / CDN URLs    → Network Only (never cache dynamic data)

const CACHE_VERSION = 'v4.1.0';
const SHELL_CACHE   = `mnr-shell-${CACHE_VERSION}`;
const STATIC_CACHE  = `mnr-static-${CACHE_VERSION}`;
const IMAGE_CACHE   = `mnr-images-v1`;

// Dynamically resolve base from the SW's own URL so it works on any host/path
// e.g. https://example.com/MNRFoodBill/sw.js → BASE = '/MNRFoodBill/'
const SW_URL  = new URL(self.location.href);
const BASE    = SW_URL.pathname.replace(/sw\.js$/, ''); // ends with /

// ── App Shell: HTML pages ──────────────────────────────────────────────────
const SHELL_ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'dashboard.html',
  BASE + 'billing.html',
  BASE + 'orders.html',
  BASE + 'products.html',
  BASE + 'settings.html',
  BASE + 'staff.html',
  BASE + 'tables.html',
  BASE + 'contact.html',
  BASE + 'privacy.html',
  BASE + 'terms.html',
  BASE + 'components/header.html',
  BASE + 'components/sidebar.html',
  BASE + 'manifest.json',
];

// ── Static Assets: JS + CSS ───────────────────────────────────────────────
const STATIC_ASSETS = [
  BASE + 'css/styles.css',
  BASE + 'firebase-config.js',
  BASE + 'js/layout.js',
  BASE + 'js/app-shell.js',
  BASE + 'js/auth.js',
  BASE + 'js/billing.js',
  BASE + 'js/dashboard.js',
  BASE + 'js/orders.js',
  BASE + 'js/tables.js',
  BASE + 'js/settings.js',
  BASE + 'js/print.js',
  BASE + 'js/order-counter.js',
  BASE + 'js/pwa-install.js',
  BASE + 'js/products.js',
  BASE + 'js/staff.js',
  BASE + 'js/table-responsive.js',
  BASE + 'js/preload-auth.js',
  BASE + 'js/storage.js',
  BASE + 'icons/icon-192x192.png',
];

// ── URLs that should NEVER be served from cache ───────────────────────────
const NO_CACHE_PATTERNS = [
  'firestore.googleapis.com',
  'firebaseapp.com',
  'googleapis.com',
  'identitytoolkit',
  'securetoken',
  'gstatic.com/firebasejs',
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'api.qrserver.com',
  'imgbb.com',
  'ibb.co',
  '/api/',
];

// ── Install: cache app shell + static assets ──────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing', CACHE_VERSION, '| BASE:', BASE);
  self.skipWaiting(); // Activate immediately

  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then(cache =>
        // Add one-by-one so a single 404 doesn't fail the entire install
        Promise.allSettled(
          SHELL_ASSETS.map(url =>
            cache.add(url).catch(err =>
              console.warn('[SW] Shell cache miss:', url, err.message)
            )
          )
        )
      ),
      caches.open(STATIC_CACHE).then(cache =>
        Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err =>
              console.warn('[SW] Static cache miss:', url, err.message)
            )
          )
        )
      ),
    ])
  );
});

// ── Activate: delete old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating', CACHE_VERSION);

  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== STATIC_CACHE && k !== IMAGE_CACHE)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: route to correct strategy ──────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== 'GET') return;

  // Skip browser extensions
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return;

  // Skip blob: and data: URIs
  if (url.protocol === 'blob:' || url.protocol === 'data:') return;

  // Skip Firebase, CDN, and API calls — always network
  if (NO_CACHE_PATTERNS.some(p => request.url.includes(p))) return;

  // Images → Cache First
  if (
    request.destination === 'image' ||
    /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // JS / CSS → Stale While Revalidate (serve cached instantly, update in bg)
  if (/\.(js|css)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // HTML pages → Network First with Cache Fallback (works offline)
  if (
    request.headers.get('Accept')?.includes('text/html') ||
    url.pathname.endsWith('.html') ||
    url.pathname === BASE ||
    url.pathname === BASE.slice(0, -1)
  ) {
    event.respondWith(networkFirstWithCache(request, SHELL_CACHE));
    return;
  }

  // Everything else → Network First
  event.respondWith(networkFirstWithCache(request, SHELL_CACHE));
});

// ── Strategy: Network First, fallback to Cache ────────────────────────────
async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const networkResponse = await fetch(request, { cache: 'no-cache' });
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone()); // Update cache silently
    }
    return networkResponse;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      console.log('[SW] Offline — serving from cache:', request.url);
      return cached;
    }

    // Offline fallback for HTML pages: serve the cached index
    if (request.headers.get('Accept')?.includes('text/html')) {
      const fallback = await cache.match(BASE + 'index.html') ||
                       await cache.match(new URL(BASE + 'index.html', self.location.origin).href);
      if (fallback) return fallback;
    }

    return new Response('Offline — page not cached yet. Please visit while online first.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

// ── Strategy: Stale While Revalidate ─────────────────────────────────────
// FIXED: never returns null — always returns a valid Response
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Start network fetch in background regardless
  const networkPromise = fetch(request)
    .then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(err => {
      console.warn('[SW] SWR network fail:', request.url, err.message);
      return null; // Will be handled below
    });

  // Return cached copy immediately if we have one
  if (cached) {
    return cached;
  }

  // No cache — must wait for network
  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  // Both cache and network failed — return a proper error response
  return new Response('Resource unavailable offline.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' },
  });
}

// ── Strategy: Cache First ─────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Return a transparent 1x1 pixel for failed image requests
    if (request.destination === 'image') {
      return new Response(
        new Uint8Array([
          0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
          0x01, 0x00, 0x80, 0x00, 0x00, 0xFF, 0xFF, 0xFF,
          0x00, 0x00, 0x00, 0x21, 0xF9, 0x04, 0x01, 0x00,
          0x00, 0x00, 0x00, 0x2C, 0x00, 0x00, 0x00, 0x00,
          0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
          0x01, 0x00, 0x3B
        ]),
        { status: 200, headers: { 'Content-Type': 'image/gif' } }
      );
    }
    return new Response('', { status: 404, statusText: 'Not Found' });
  }
}

// ── Message Handler ───────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'GET_VERSION') {
    event.source?.postMessage({
      type: 'VERSION_INFO',
      version: CACHE_VERSION,
      timestamp: new Date().toISOString(),
    });
  }

  if (event.data.type === 'CLEAR_CACHE') {
    Promise.all([
      caches.delete(SHELL_CACHE),
      caches.delete(STATIC_CACHE),
    ]).then(() => {
      event.source?.postMessage({ type: 'CACHE_CLEARED', success: true });
    });
  }
});

self.addEventListener('error', e => console.error('[SW] Error:', e.error));
self.addEventListener('unhandledrejection', e => console.error('[SW] Unhandled rejection:', e.reason));
