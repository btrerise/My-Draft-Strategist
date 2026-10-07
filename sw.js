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
//
// VERSIONING CACHE_NAME (owner's decision, refactor chunk 8A): it versions this service worker, not
// either app. One cache serves all three pages, and any new name clears the old cache equally.
//   * Last number (v2.8.70 -> v2.8.71): every deploy. Each branch bumps it once, above main's.
//   * Middle number (v2.8.x -> v2.9.0): when this file's own behavior changes -- the caching
//     strategy, what works offline, how old caches are cleared -- as v2.8.0 marked the strategy
//     change above. App features don't move it; they go in CHANGELOG.md and the apps' footer versions.
const CACHE_NAME = 'draft-strategist-v2.8.83';  // Update this version on EVERY deploy - see note above
// While you're here: if this deploy includes a change users will notice, also bump the
// visible version label for whichever app it touched - "Draft Strategist vX.X" in /index.html
// and/or "My Lineup Strategist vX.X" in /lineup/index.html (look for the APP VERSION comment
// above each label for the rule). Those are separate from this cache number and don't
// change on bug-fix-only deploys.

// Core assets to pre-cache immediately on install.
//
// Every file in /lineup/'s module graph (js/mls/main.js and its imports) has to be listed
// here. A module <script> fails as a whole if any static import fails, so a first offline load
// with even one of those imports uncached is a blank Lineup page -- stale-while-revalidate only fills the
// gap after an online visit has already requested each file. When adding an `import` to any
// lineup module, add the file here too. js/mls/sim/worker.js needs listing separately: it's loaded
// by `new Worker(...)` in js/mls/sim/ui.js, not imported, so it's outside the graph.
//
// Note cache.addAll is all-or-nothing: one 404 in this list and NOTHING gets precached (the
// .catch below swallows it silently). Renaming or deleting a file means updating this list.
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/css/base.css',
    '/css/mds.css',
    '/css/mls.css',
    '/css/tscore.css',
    '/js/mds/main.js',               // the root page's app script (a module)
    // main.js's static imports (one missing file and the whole module graph fails):
    '/js/mds/migrateKeys.js',        // first import: the 6B storage-key rename
    '/js/mds/init.js',
    '/js/mds/storage.js',
    '/js/mds/state.js',
    '/js/mds/pwa.js',
    '/js/mds/ui.js',
    '/js/mds/gestures.js',
    '/js/mds/settings.js',
    '/js/mds/backup.js',
    '/js/mds/sleeperSync.js',
    '/js/mds/queue.js',
    '/js/mds/import.js',
    '/js/mds/market.js',
    '/js/mds/tracker.js',
    '/js/mds/board.js',
    '/js/mds/team.js',
    '/js/mds/headshots.js',          // improvements F3: board and Team tab headshots
    '/js/mds/handoff.js',
    '/js/mds/recap.js',
    '/js/mds/export.js',
    '/js/mds/affinity.js',
    '/js/mds/setupGuide.js',
    '/js/mds/uploadPreview.js',       // 8C: rankings upload preview
    '/js/boot.js',                    // plain script, first on every page
    '/js/shared/globals.js',          // module on every page; assigns the shared window.* names
    // globals.js's static imports (a module graph like mls.js's -- one missing file and the
    // module fails as a whole, taking every window.* helper with it):
    '/js/shared/names.js',
    '/js/shared/net.js',
    '/js/shared/html.js',
    '/js/shared/freshness.js',        // 8B: "Updated 3 days ago" labels, all three pages
    '/js/shared/rankings/diagnostics.js',
    '/js/shared/rankings/uploadPreview.js', // 8C: preview shell + unmatched-name wording, both apps
    '/js/shared/ui/banners.js',
    '/js/shared/ui/confirm.js',
    '/js/shared/ui/delegate.js',
    '/js/shared/ui/feedbackForm.js',
    '/js/shared/ui/fileDrop.js',
    '/js/shared/ui/flashButton.js',
    '/js/shared/ui/focusTrap.js',
    '/js/shared/ui/prompt.js',     // S2: text-input dialog (renaming a ranking set)
    '/js/shared/ui/scriptLoader.js',
    '/js/shared/ui/scrollShadows.js',
    '/js/shared/ui/setupChecklist.js',
    '/js/shared/ui/statusFeedback.js', // 8B: "Processing…" / success lines, both apps
    '/js/shared/ui/tabHash.js',
    '/js/shared/ui/toast.js',
    '/js/shared/ui/tooltips.js',
    '/js/shared/storage/keys.js',
    '/js/shared/storage/keyMigration.js', // 6B: old -> new key names, on load and in Restore
    '/js/shared/data/tscore.js',      // classic <script> on the root page; js/mds/ falls back to {} without it
    '/js/shared/data/byes.js',        // 7C: bye weeks by season, both apps (scripts/update-byes.mjs writes it)
    '/t-score/',
    '/t-score/index.html',
    '/js/tscore/main.js',             // the T-Score page's script (refactor 4B; was inline) -> shared names, html, keys
    '/lineup/',
    '/lineup/index.html',
    '/js/mls/main.js',                // the Lineup page's entry point (refactor 3A; was lineup/mls.js)
    '/js/mls/migrateKeys.js',         // first import: the 6B storage-key rename
    '/js/mls/constants.js',
    '/js/mls/state.js',
    '/js/mls/helpers.js',
    '/js/mls/nav.js',
    '/js/mls/backup.js',
    '/js/mls/init.js',
    '/js/mls/lineup/headshots.js',
    '/js/mls/players.js',
    '/js/mls/lineup/earlyGames.js',
    '/js/mls/lineup/gameInfo.js',
    '/js/mls/leagues/sync.js',
    '/js/mls/leagues/scoutResults.js',
    '/js/mls/leagues/handoff.js',
    '/js/mls/leagues/addPlayer.js',
    '/js/mls/leagues/importAll.js',
    '/js/mls/sos.js',
    '/js/mls/trade/verdict.js',
    '/js/mls/scout/engine.js',
    '/js/mls/scout/waivers.js',
    '/js/mls/scout/topAvailable.js',
    '/js/mls/scout/bestAvailable.js',
    '/js/mls/power/allLeagues.js',
    '/js/mls/scout/allLeaguesSearch.js',
    '/js/mls/scout/waiverScanner.js',
    '/js/mls/rankings/engine.js',
    '/js/mls/rankings/sets.js',
    '/js/mls/rankings/uploadPreview.js',
    '/js/mls/scout/marketDisconnect.js',
    '/js/mls/rankings/rosFetch.js',
    '/js/mls/settings.js',
    '/js/mls/trade/valueCurve.js',
    '/js/mls/trade/waiverValue.js',
    '/js/mls/trade/export.js',
    '/js/mls/render/rookies.js',
    '/js/mls/render/roster.js',
    '/js/mls/render/lineup.js',
    '/js/mls/render/dashboard.js',
    '/js/mls/shortcuts.js',
    '/js/mls/power/shared.js',
    '/js/mls/power/futureValue.js',
    '/js/mls/power/directionLabels.js',
    '/js/mls/power/rosterCard.js',
    '/js/mls/power/snapshot.js',
    '/js/mls/lineup/injuryAudit.js',
    '/js/mls/lineup/kickoffOrder.js',
    '/js/mls/scout/waiverInsights.js',
    '/js/mls/sim/matchup.js',
    '/js/mls/sim/ui.js',              // -> sim/stats.js, spawns sim/worker.js
    '/js/mls/sim/stats.js',
    '/js/mls/sim/worker.js',          // new Worker(), not an import -- see above
    // their static imports outside js/mls/, and theirs:
    '/js/shared/rankings/parse.js',   // -> names.js
    '/js/shared/api/sleeper.js',
    '/js/shared/api/market.js',       // -> names.js
    '/js/shared/api/ffc.js',          // Fantasy Football Calculator, via /api/ffc/ (refactor 7A)
    '/js/shared/api/sleeperStats.js', // -> storage/idb.js
    '/js/shared/storage/idb.js'
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

    // Skip cross-origin requests (like the Sleeper and FantasyCalc APIs) so they go straight to
    // the network untouched -- they must never be served from, or written to, the app shell cache.
    // Same for our own API routes (/api/..., Cloudflare Pages Functions such as the Fantasy
    // Football Calculator proxy): live data with its own caching, not part of the app shell.
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
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