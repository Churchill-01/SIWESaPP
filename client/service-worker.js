// Cache identifier and static files required to start the app offline.
const CACHE_NAME = 'study-app-v7';
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
  '/subjects.json'
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
        // Only cache valid, successful responses so we don't cache 4xx/5xx errors
        if (response && response.ok && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Only fallback to index.html for page navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
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
