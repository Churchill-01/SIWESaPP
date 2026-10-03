// Cache identifier and static files required to start the app offline.
const CACHE_NAME = 'bravoh-app-v15';
const APP_SHELL = [
  './',
  './index.html',
  './auth.html',
  './auth.js',
  './styles.css',
  './app.js',
  './utils/api.js',
  './utils/auth.js',
  './utils/state.js',
  './utils/aiController.js',
  './utils/ai.js',
  './subjects.json'
];

// Pre-cache the application shell during installation.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url).catch((err) => console.warn(`Failed to precache ${url}:`, err)))
      );
    })
  );
  self.skipWaiting();
});

// Clear previous caches and allow the new worker to control open pages immediately.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

// Prefer the network and refresh the cache, falling back to cached content.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache valid static responses; do not cache dynamic /api/ calls
        if (response && response.ok && response.status === 200 && !event.request.url.includes('/api/')) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        // If an API catalog request failed while offline, serve cached subjects.json
        if (event.request.url.includes('/api/catalog')) {
          return caches.match('./subjects.json', { ignoreSearch: true }).then((cached) => {
            if (cached) return cached;
            return caches.match('/subjects.json', { ignoreSearch: true });
          });
        }

        return caches.match(event.request, { ignoreSearch: true }).then((cached) => {
          if (cached) return cached;
          // Only fallback to index.html for page navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html', { ignoreSearch: true });
          }
          return new Response('Network error occurred', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
  );
});
