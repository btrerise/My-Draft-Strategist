// A basic service worker to satisfy PWA install requirements
const CACHE_NAME = 'draft-strategist-v1.2';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Basic network-first strategy, falling back to cache
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
