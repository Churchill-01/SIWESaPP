// Cache identifier and static files required to start the app offline.
const CACHE_NAME = 'study-app-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './utils/api.js',
  './utils/auth.js',
  './utils/state.js',
  '../subjects.json'
];

// Pre-cache the application shell during installation.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

// Allow the new worker to control open pages immediately.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Prefer the network and refresh the cache, falling back to cached content.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
