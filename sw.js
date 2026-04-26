/**
 * OrdiveX — Service Worker
 * Cache-first PWA strategy pour fonctionnement 100% offline
 */

const CACHE_NAME = 'pharma-cache-v9.0.0';
const ASSETS = [
  './',
  './index.html',
  './css/main.css',
  './js/db.js',
  './js/auth.js',
  './js/ui.js',
  './js/pages/dashboard.js',
  './js/pages/onboarding.js',
  './js/pages/metrics.js',
  './js/pages/pos.js',
  './js/pages/stock.js',
  './js/pages/products.js',
  './js/pages/sales.js',
  './js/pages/returns.js',
  './js/pages/settings.js',
  './js/pages/prescriptions.js',
  './js/pages/suppliers.js',
  './js/pages/patients.js',
  './js/pages/caisse.js',
  './js/pages/traceability.js',
  './js/pages/alerts-engine.js',
  './js/pages/print.js',
  './js/mobile-money.js',
  './js/ui/command-palette.js',
  './js/ui/feedback.js',
  './js/vendor/lucide.min.js',
  './js/vendor/supabase.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
];

// Install: cache all assets individually to avoid global failure
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log('[SW] Caching app shell individually...');
      for (const url of ASSETS) {
        try {
          const request = new Request(url, { cache: 'reload' });
          const response = await fetch(request);
          if (response.ok) {
            await cache.put(request, response);
          } else {
            console.warn(`[SW] Failed to cache ${url}: ${response.status} ${response.statusText}`);
          }
        } catch (err) {
          console.warn(`[SW] Skip caching ${url} due to error:`, err);
        }
      }
    }).then(() => {
      console.log('[SW] App shell cached. Skipping waiting.');
      return self.skipWaiting();
    })
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => {
      console.log('[SW] Activated — Old caches cleared');
      return self.clients.claim();
    })
  );
});

// Fetch: cache-first strategy
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // 🛡️ REQUÊTES EXTERNES (Supabase, fonts, CDN)
  if (!url.startsWith(self.location.origin)) {
    // FONTS : cache-first, avec catch silencieux
    if (url.includes('fonts.g') || url.endsWith('.woff2') || url.endsWith('.woff') || url.endsWith('.ttf')) {
      event.respondWith(
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
            }
            return response;
          }).catch(() => {
            // Offline + font pas cachée → réponse vide (PAS font/woff2 pour éviter "Failed to decode")
            return new Response('', { status: 200 });
          });
        })
      );
      return;
    }

    // APIS (Supabase, etc.) : try-catch silencieux
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).catch(() => {
          return new Response(JSON.stringify({ data: null, error: 'offline' }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  // Skip non-GET and chrome-extension for normal caching
  if (event.request.method !== 'GET') return;
  if (url.startsWith('chrome-extension')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html') || new Response('Offline', { status: 503 });
        }
        return new Response('', { status: 200 });
      });
    })
  );
});

// Background sync for pending operations
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pending') {
    event.waitUntil(syncPendingOperations());
  }
});

async function syncPendingOperations() {
  console.log('[SW] Background sync triggered');
  // In production: send pending queue to server
}

// Push notifications for alerts
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'OrdiveX', {
      body: data.body || 'Nouvelle alerte',
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%231B4F72'/%3E%3Ctext y='68' font-size='60' text-anchor='middle' x='50'%3E💊%3C/text%3E%3C/svg%3E",
      data: { url: data.url || '/' },
      tag: data.tag || 'pharma-alert',
      requireInteraction: data.critical || false,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
