// Moved verbatim from the top of js/utils.js in refactor chunk 1A. Still a plain classic
// script with no dependencies, and still the first local <script> on every page. The rest of
// what was utils.js now lives in js/shared/ (showToast in js/shared/ui/toast.js, loadScriptOnce in
// js/shared/ui/scriptLoader.js).

// --- APP RESILIENCE: SAFE STORAGE READS + FATAL BOOT ERROR SAFETY NET ---
// This block is deliberately the first thing in this file, and boot.js is deliberately the
// first <script> on every page -- ahead of each page's ES module graph (js/mds/main.js,
// js/mls/main.js, js/tscore/main.js). That ordering is the entire point of putting it here.
//
// The failure it exists for: if anything throws while the app's main script is being
// EVALUATED -- one corrupt localStorage key, a 404 on any file in the app's import graph, a
// syntax error -- that script never finishes. None of its window.* functions ever get
// defined, so every button on the page is inert and every tab stays empty. The page isn't
// obviously broken, it's worse: the HTML parsed fine, so it looks normal and simply does
// nothing, with the only evidence sitting in a console the person will never open. The code
// that would normally report a problem (showToast, in js/shared/ui/toast.js) is part of the
// app that just died, so it can't report this one.
//
// boot.js is a plain classic script with no imports and no dependencies, so it survives all
// of that and can say something. Everything below is written to hold up under those
// conditions: inline styles with literal colors rather than classes from css/base.css (if the
// stylesheet is what failed, a banner styled by the stylesheet is an invisible banner), and
// no calls into js/shared/.
(function () {
    let appReady = false;
    let bannerShown = false;
    const corruptKeys = [];
    let corruptToastTimer = null;

    // Called by js/mds/init.js and js/mls/init.js once their first render has completed -- see
    // the markAppReady() call at the end of each app's init. After that point the app is
    // demonstrably usable, so an uncaught error is a bug in one feature rather than a dead
    // page, and the handlers below go quiet (console only) instead of throwing a full-width
    // "the app didn't load" banner over a screen the person is happily using.
    window.markAppReady = function () {
        appReady = true;
    };

    // Backstop for any page that never calls markAppReady() -- the T-Score page
    // (js/tscore/main.js) has no init function to hang it off, and a page added later
    // shouldn't have to remember. Without this, such a page stays armed forever and shows a
    // fatal "didn't load" banner for an ordinary runtime error twenty minutes into a session.
    //
    // setTimeout rather than the load handler itself, because this listener is registered
    // before any app code runs and would otherwise fire FIRST -- marking the page ready a
    // moment before js/mls/init.js's window.onload init gets a chance to throw. Deferring by a
    // tick puts it behind every synchronous load handler on the page.
    //
    // This does not weaken the case this block exists for: a script that dies during
    // evaluation, or a module that 404s, raises its error well before `load`, and the
    // resource-load branch below doesn't consult appReady at all.
    window.addEventListener('load', function () {
        setTimeout(function () { appReady = true; }, 0);
    });

    // --- SAFE LOCALSTORAGE READS ---
    // Replaces the bare `JSON.parse(localStorage.getItem(k)) || []` expressions that used to
    // run unguarded at State-construction time in both apps. Those parses happen during
    // script evaluation, so a single unreadable key -- one write truncated by a quota error
    // mid-setItem, one hand-edit in devtools, one half-finished sync -- took down the entire
    // app instead of resetting one feature.
    //
    // Returns `fallback` (and logs the key) for anything it can't turn into the expected
    // shape. It never deletes or rewrites the bad value: if the raw string is salvageable at
    // all, it's still sitting in localStorage for Export Backup to pick up.
    window.readJSON = function (key, fallback) {
        let raw;
        try {
            raw = localStorage.getItem(key);
        } catch (e) {
            // localStorage access itself can throw -- Safari private mode, storage disabled
            // by policy, blocked storage in an embedded context. Nothing to recover and
            // nothing the person can act on, so this one stays silent.
            return fallback;
        }
        if (raw === null || raw === '') return fallback;

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            noteCorruptKey(key, 'could not be parsed as JSON', raw);
            return fallback;
        }

        // Shape guard. A write truncated at the wrong byte can still parse cleanly (`123`,
        // `"abc"`), as can a value left behind by an older format. Every call site below
        // immediately .forEach/.find/Object.keys the result, so handing back the wrong type
        // only moves the crash a few lines down. Checking against the fallback's own type
        // lets each call site declare what it expects without a second argument.
        if (Array.isArray(fallback) && !Array.isArray(parsed)) {
            noteCorruptKey(key, 'was not the expected list', raw);
            return fallback;
        }
        if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)
            && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))) {
            noteCorruptKey(key, 'was not the expected object', raw);
            return fallback;
        }

        // `parsed || fallback` rather than a null check, to exactly preserve the behavior of
        // the `JSON.parse(...) || []` expressions this replaced: a stored `null`, `0`, `false`
        // or `""` fell through to the default there and still does here. None of the keys in
        // use legitimately store a falsy JSON value, so this is about not changing behavior
        // while changing safety, not about a case anyone relies on.
        return parsed || fallback;
    };

    function noteCorruptKey(key, reason, raw) {
        console.error(
            `Saved data in localStorage["${key}"] ${reason} -- falling back to the default for it. ` +
            `The raw value has NOT been deleted; it is still there for Export Backup.`,
            typeof raw === 'string' ? raw.slice(0, 200) : raw
        );
        if (corruptKeys.indexOf(key) !== -1) return;
        corruptKeys.push(key);

        // One toast covering however many keys turn out to be bad, not one per key -- these
        // are all read in a burst during State construction, so per-key toasts would just
        // overwrite each other. Deferred past the app's first render, which would otherwise
        // scroll and redraw over the toast the moment it appeared.
        if (corruptToastTimer) return;
        corruptToastTimer = setTimeout(function () {
            if (typeof window.showToast !== 'function') return;
            const one = corruptKeys.length === 1;
            window.showToast(
                `${corruptKeys.length} saved setting${one ? '' : 's'} couldn't be read and ` +
                `${one ? 'was' : 'were'} reset to defaults.\nEverything else is intact. ` +
                `(${corruptKeys.join(', ')})`,
                { isError: true, force: true, duration: 10000 }
            );
        }, 2500);
    }

    // --- FATAL BOOT ERROR BANNER ---
    function showBootErrorBanner(detail) {
        if (bannerShown) return;
        bannerShown = true;

        const host = document.body || document.documentElement;
        if (!host) return;

        const bar = document.createElement('div');
        bar.id = 'mds-boot-error';
        bar.setAttribute('role', 'alert');
        bar.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
            'box-sizing:border-box', 'padding:14px 16px',
            'background:#7f1d1d', 'color:#ffffff', 'border-bottom:2px solid #ef4444',
            'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif', 'font-size:0.95rem',
            'line-height:1.45', 'box-shadow:0 4px 18px rgba(0,0,0,0.45)',
            'max-height:60vh', 'overflow-y:auto'
        ].join(';');

        const wrap = document.createElement('div');
        wrap.style.cssText = 'max-width:900px;margin:0 auto';

        const heading = document.createElement('strong');
        heading.style.cssText = 'display:block;font-size:1.05rem;margin-bottom:4px';
        heading.textContent = 'Something went wrong loading the app';
        wrap.appendChild(heading);

        const body = document.createElement('div');
        body.style.cssText = 'margin-bottom:10px';
        body.textContent = 'Your saved data is intact — nothing was deleted. Reload the page to try again, '
            + 'and download a backup first if you want a copy on disk before anything else happens.';
        wrap.appendChild(body);

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
        row.appendChild(makeButton('Reload', '#ffffff', '#7f1d1d', function () { location.reload(); }));
        row.appendChild(makeButton('Download Backup', 'rgba(255,255,255,0.15)', '#ffffff', downloadRescueBackup));
        row.appendChild(makeButton('Dismiss', 'transparent', '#fecaca', function () { bar.remove(); }));
        wrap.appendChild(row);

        // The actual error text, collapsed. Useless to most people and essential to whoever is
        // debugging this with the page open, which for this app is the same person.
        if (detail) {
            const det = document.createElement('details');
            det.style.cssText = 'margin-top:10px';
            const sum = document.createElement('summary');
            sum.style.cssText = 'cursor:pointer;color:#fecaca;font-size:0.85rem';
            sum.textContent = 'Technical details';
            det.appendChild(sum);
            const pre = document.createElement('pre');
            pre.style.cssText = 'margin:6px 0 0;white-space:pre-wrap;word-break:break-word;'
                + 'font-size:0.78rem;color:#fee2e2;font-family:ui-monospace,SFMono-Regular,Menlo,monospace';
            pre.textContent = detail;
            det.appendChild(pre);
            wrap.appendChild(det);
        }

        bar.appendChild(wrap);
        host.appendChild(bar);
    }

    function makeButton(label, bg, fg, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText = 'padding:7px 14px;border:1px solid rgba(255,255,255,0.35);border-radius:6px;'
            + 'cursor:pointer;font:inherit;font-weight:600;background:' + bg + ';color:' + fg;
        b.addEventListener('click', onClick);
        return b;
    }

    // The banner's own Export Backup. It prefers the app's real exporter when that happens to
    // be defined, but cannot rely on it: the whole premise of this banner is that the script
    // owning exportMdsSettings/exportMlsSettings may never have finished evaluating. The
    // fallback reproduces the same payload shape those two write (app / appName / exportedAt /
    // data), so a file rescued from a dead page imports through the normal Import Backup
    // button once the app is running again.
    function downloadRescueBackup() {
        const mls = isLineupApp();
        if (mls && typeof window.exportMlsSettings === 'function') return window.exportMlsSettings();
        if (!mls && typeof window.exportMdsSettings === 'function') return window.exportMdsSettings();

        try {
            // Same key filters as isMlsOwnedOrLegacyKey / isMdsOwnedOrLegacyKey in
            // js/shared/storage/keys.js: the app's keys under today's names and their pre-6B ones
            // (ds_*, mds_season_*), because a page that failed to load may never have run the
            // 6B rename. Restore renames the old ones; where a file has both, the new one wins.
            // MDS's mds_ prefix also covers MLS's old mds_season_* keys and the old hand-off and
            // T-Score cache names, which belong to neither backup.
            const keys = Object.keys(localStorage).filter(function (k) {
                if (mls) return k.indexOf('mls_') === 0 || k.indexOf('mds_season_') === 0;
                if (k.indexOf('ds_') === 0) return true;
                return k.indexOf('mds_') === 0 && k.indexOf('mds_season_') !== 0
                    && k !== 'mds_handoff_roster' && k !== 'mds_tscore_cache' && k !== 'mds_tscore_cache_updated';
            });
            const data = {};
            keys.forEach(function (k) { data[k] = localStorage.getItem(k); });

            const payload = {
                app: mls ? 'MLS' : 'MDS',
                appName: mls ? 'My Lineup Strategist' : 'My Draft Strategist',
                exportedAt: new Date().toISOString(),
                data: data
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (mls ? 'my-lineup-strategist' : 'my-draft-strategist')
                + '-backup-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Rescue backup failed:', e);
            alert('Could not build a backup file. Your data is still saved in this browser — try reloading.');
        }
    }

    function isLineupApp() {
        return location.pathname.indexOf('/lineup/') !== -1 || /\/lineup$/.test(location.pathname);
    }

    // Capture phase, because a <script> or <link> that fails to load fires its error event on
    // the element itself and that event does not bubble -- it is only reachable from window
    // during capture. That is exactly the "one of js/mls/'s modules 404s" case, so a
    // bubble-phase-only listener would miss the failure this block was written for.
    window.addEventListener('error', function (e) {
        const target = e.target;
        const tag = target && target.tagName ? target.tagName.toUpperCase() : '';

        // A failed resource load rather than a thrown error. Two filters here, both load-
        // bearing:
        //
        // Only scripts and stylesheets can be fatal. Images 404 routinely in this app --
        // player headshots come from third-party CDNs and go missing all the time -- and must
        // never raise this banner.
        //
        // And only SAME-ORIGIN ones. A blocked or offline CDN (PapaParse, MathJax, and the
        // html2canvas/SheetJS that loadScriptOnce in js/shared/ui/scriptLoader.js injects) costs one
        // optional feature, and each of those already has its own failure path; announcing
        // "the app didn't load" because an ad blocker ate a CDN would be a false alarm on a
        // page that works. A same-origin script failing is the real case this exists for --
        // that's any file in js/mds/'s, js/mls/'s or js/tscore/'s module graph.
        if (tag === 'SCRIPT' || tag === 'LINK') {
            const url = target.src || target.href || '';
            if (!isSameOrigin(url)) {
                console.warn('Optional third-party resource failed to load:', url);
                return;
            }
            showBootErrorBanner('Failed to load: ' + (url || tag));
            return;
        }
        if (tag) return;

        // A genuine uncaught exception. Before markAppReady() it almost certainly means the
        // app's init died partway through; after it, the app is up and one feature misbehaved,
        // which that feature's own error handling is responsible for reporting.
        console.error('Uncaught error:', e.error || e.message);
        if (appReady) return;
        showBootErrorBanner(describeError(e.error) || e.message || 'Unknown error');
    }, true);

    // Unhandled rejections are logged but deliberately do NOT raise the banner on their own.
    // A promise can only reject after the synchronous evaluation that defines the app's
    // functions has already finished, so a rejection means "one async task failed", not "the
    // page is dead" -- and covering a working screen with a fatal banner because a Sleeper
    // request hiccuped would be worse than the problem this block exists to solve. The one
    // exception is a module that failed to load, which surfaces here rather than as an error
    // event in some browsers and genuinely is fatal; that is what the pattern match is for.
    window.addEventListener('unhandledrejection', function (e) {
        const text = describeError(e.reason) || String(e.reason);
        console.error('Unhandled promise rejection:', e.reason);
        if (appReady) return;
        if (/module|Failed to fetch dynamically|import/i.test(text)) {
            showBootErrorBanner(text);
        }
    });

    function describeError(err) {
        if (!err) return '';
        if (err instanceof Error) return (err.name || 'Error') + ': ' + err.message;
        return '';
    }

    // An unresolvable or relative URL is treated as same-origin: everything this app serves
    // itself is referenced relatively, and erring toward "ours" means a real boot failure
    // still gets reported.
    function isSameOrigin(url) {
        if (!url) return true;
        try {
            return new URL(url, location.href).origin === location.origin;
        } catch (e) {
            return true;
        }
    }
})();
