// Service Worker with Dynamic Runtime Caching for Root and /lineup/ apps
//
// CACHING STRATEGY (changed in v2.8.0)
// -----------------------------------
// This used to be network-first for EVERY same-origin GET, with the cache consulted only
// when the network threw. That made the precache list below almost pointless: the assets were
// downloaded and stored on install, and then every subsequent page load still waited on the
// network for each of them anyway, using the cache purely as an offline backstop. On the
// connection this app is actually used on -- a phone, mid-draft or minutes before kickoff,
// often on congested stadium or cellular data -- that meant waiting on the network for a
// ~6,700-line mls.js and a ~3,900-line styles.css before anything could render.
//
// Now the strategy is split by request type:
//
//   * Navigations (HTML documents) stay NETWORK-FIRST. The document is the thing that
//     references everything else, so fetching it fresh is how a deploy gets picked up at all.
//     It's also the smallest of these requests. Falls back to cache, then to the app shell.
//
//   * Static assets (CSS, JS, images, fonts) are STALE-WHILE-REVALIDATE. The cached copy is
//     returned immediately -- no network wait on the render-blocking path -- while a fresh
//     copy is fetched in the background and stored for next time. A returning visitor gets an
//     instant paint; a deploy is picked up on the following load at the latest.
//
//   * Anything else same-origin keeps the old network-first behavior.
//
// DEPLOY NOTE: because assets are served from cache first, bumping CACHE_NAME on every deploy
// is now load-bearing rather than optional. The activate handler deletes every cache whose key
// doesn't match, so a bump forces all clients onto the new files on their next load instead of
// letting stale-while-revalidate take an extra visit to catch up.
const CACHE_NAME = 'draft-strategist-v2.8.10';  // Update this version on EVERY deploy - see note above

// Core assets to pre-cache immediately on install.
//
// Every file in /lineup/'s module graph has to be listed here, not just mls.js. A module
// <script> fails as a whole if any static import fails, so a first offline load with even one
// of mls.js's imports uncached is a blank Lineup page -- stale-while-revalidate only fills the
// gap after an online visit has already requested each file. When adding an `import` to any
// lineup module, add the file here too. worker.js needs listing separately: it's loaded by
// `new Worker('./worker.js')` in monteCarloUi.js, not imported, so it's outside the graph.
//
// Note cache.addAll is all-or-nothing: one 404 in this list and NOTHING gets precached (the
// .catch below swallows it silently). Renaming or deleting a file means updating this list.
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/mds.js',
    '/js/utils.js',
    '/t-score/tscore_data.js',        // classic <script> on the root page; mds.js falls back to {} without it
    '/lineup/',
    '/lineup/index.html',
    '/lineup/mls.js',
    // mls.js's static imports, and theirs:
    '/lineup/rankingsParser.js',
    '/lineup/sleeperApi.js',
    '/lineup/marketDataApi.js',       // -> sleeperApi.js
    '/lineup/monteCarloUi.js',        // -> statsEngine.js, spawns worker.js
    '/lineup/sleeperService.js',      // -> db.js
    '/lineup/statsEngine.js',
    '/lineup/waiverScanner.js',
    '/lineup/db.js',
    '/lineup/worker.js'               // new Worker(), not an import -- see above
];

// Extensions served straight from cache while refreshing behind the scenes. Deliberately
// excludes .html (see the navigation branch below) and anything that could be a data endpoint.
const STATIC_ASSET_RE = /\.(css|js|mjs|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)$/i;

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

// Stores a successful response without blocking whatever is waiting on the response itself.
// Cache writes are best-effort: a failure here (quota, storage disabled) must never turn into
// a failed page load, which is why nothing awaits this.
function cachePut(request, response) {
    if (!response || response.status !== 200) return;
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
}

// Last-resort HTML fallback when a navigation can't be served from network or its own cache
// entry -- e.g. a deep link opened offline that was never visited before. `accept` can be
// absent on some requests, hence the guard (the previous code called .includes() on it
// directly and would throw on a null header).
function htmlFallback(request) {
    const accept = request.headers.get('accept') || '';
    if (request.mode === 'navigate' || accept.includes('text/html')) {
        return caches.match('/index.html');
    }
    return undefined;
}

self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    // Skip cross-origin requests (like Sleeper and LeagueLogs APIs) so they go straight to the
    // network untouched -- they must never be served from, or written to, the app shell cache.
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) {
        return;
    }

    const isNavigation = event.request.mode === 'navigate';
    const isStaticAsset = !isNavigation && STATIC_ASSET_RE.test(url.pathname);

    if (isStaticAsset) {
        // --- STALE-WHILE-REVALIDATE ---
        event.respondWith(
            caches.match(event.request).then((cached) => {
                const networkFetch = fetch(event.request)
                    .then((response) => {
                        cachePut(event.request, response);
                        return response;
                    })
                    .catch(() => cached);

                // Cached copy wins the race when there is one; the fetch above still runs to
                // completion in the background so the next load gets the fresh bytes.
                return cached || networkFetch;
            })
        );
        return;
    }

    // --- NETWORK-FIRST (navigations, and anything not recognised as a static asset) ---
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                cachePut(event.request, response);
                return response;
            })
            .catch(() => {
                // Fallback to cache if network fails (offline mode)
                return caches.match(event.request).then((cachedResponse) => {
                    return cachedResponse || htmlFallback(event.request);
                });
            })
    );
});