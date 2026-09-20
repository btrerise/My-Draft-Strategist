// Service Worker with Dynamic Runtime Caching for Root and /lineup/ apps
const CACHE_NAME = 'draft-strategist-v2.7.5';  // Update this version to force cache refresh

// Core assets to pre-cache immediately on install
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/mds.js',
    '/js/utils.js',
    '/lineup/',
    '/lineup/index.html',
    '/lineup/mls.js',
    '/lineup/waiverScanner.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, { cache: 'reload' })))
                .catch(err => console.log('Precache partial failure (ignoring offline-only resources):', err));
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('Deleting old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    // Skip cross-origin requests (like Sleeper and LeagueLogs APIs) from failing the offline shell,
    // or let them attempt network-first without crashing app shell caching.
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // If valid response, clone it and store it in the runtime cache
                if (response && response.status === 200) {
                    let responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache if network fails (offline mode)
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Optional fallback for HTML pages if direct path match fails
                    if (event.request.headers.get('accept').includes('text/html')) {
                        return caches.match('/index.html');
                    }
                });
            })
    );
});
