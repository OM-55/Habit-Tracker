// disable aggressive caching during development
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
    // Network first for all requests
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
