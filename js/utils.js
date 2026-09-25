// --- SHARED UTILITIES ---

// --- APP RESILIENCE: SAFE STORAGE READS + FATAL BOOT ERROR SAFETY NET ---
// This block is deliberately the first thing in this file, and utils.js is deliberately the
// first <script> on every page -- ahead of js/mds.js, and ahead of lineup/mls.js, which is an
// ES module with six sibling imports. That ordering is the entire point of putting it here.
//
// The failure it exists for: if anything throws while the app's main script is being
// EVALUATED -- one corrupt localStorage key, a 404 on any file in mls.js's import graph, a
// syntax error -- that script never finishes. None of its window.* functions ever get
// defined, so every button on the page is inert and every tab stays empty. The page isn't
// obviously broken, it's worse: the HTML parsed fine, so it looks normal and simply does
// nothing, with the only evidence sitting in a console the person will never open. The code
// that would normally report a problem (showToast, further down this file) is part of the
// app that just died, so it can't report this one.
//
// utils.js is a plain classic script with no imports and no dependencies, so it survives all
// of that and can say something. Everything below is written to hold up under those
// conditions: inline styles with literal colors rather than classes from styles.css (if the
// stylesheet is what failed, a banner styled by the stylesheet is an invisible banner), and
// no calls into the rest of this file.
(function () {
    let appReady = false;
    let bannerShown = false;
    const corruptKeys = [];
    let corruptToastTimer = null;

    // Called by mds.js and mls.js once their first render has completed -- see the
    // markAppReady() call at the end of each app's init. After that point the app is
    // demonstrably usable, so an uncaught error is a bug in one feature rather than a dead
    // page, and the handlers below go quiet (console only) instead of throwing a full-width
    // "the app didn't load" banner over a screen the person is happily using.
    window.markAppReady = function () {
        appReady = true;
    };

    // Backstop for any page that never calls markAppReady() -- t-score/index.html runs its
    // own inline script and has no init function to hang it off, and a page added later
    // shouldn't have to remember. Without this, such a page stays armed forever and shows a
    // fatal "didn't load" banner for an ordinary runtime error twenty minutes into a session.
    //
    // setTimeout rather than the load handler itself, because this listener is registered
    // before any app code runs and would otherwise fire FIRST -- marking the page ready a
    // moment before mls.js's own window.onload init gets a chance to throw. Deferring by a
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
            // Same key filters as getMlsOwnedKeys() in mls.js and getMdsOwnedKeys() in mds.js.
            const keys = Object.keys(localStorage).filter(function (k) {
                if (k === 'mds_handoff_roster') return false;
                return mls
                    ? (k.indexOf('mds_season_') === 0 || k.indexOf('mls_') === 0)
                    : (k.indexOf('ds_') === 0 || k === 'mds_show_headshots');
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
    // during capture. That is exactly the "one of mls.js's seven modules 404s" case, so a
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
        // html2canvas/SheetJS that loadScriptOnce injects further down this file) costs one
        // optional feature, and each of those already has its own failure path; announcing
        // "the app didn't load" because an ad blocker ate a CDN would be a false alarm on a
        // page that works. A same-origin script failing is the real case this exists for --
        // that's mds.js, or any of the seven files in mls.js's module graph.
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

// Cache of raw name -> normalized result. normalizeName() is called repeatedly on the
// same player names during sorting/matching (roster syncs, rankings uploads, waiver
// scans), so this avoids re-running the Unicode normalize + regex chain on inputs
// we've already seen. Keyed on the raw input string, since that's what every caller
// actually has on hand.
const _normalizeNameCache = new Map();

// Known cross-platform name mismatches, mapping the variant spelling to the canonical one.
// Hoisted to module scope from inside normalizeName and isNameMatch, which each declared their
// own identical copy of this object literal -- meaning a fresh 11-key object was allocated on
// every cache miss and on every isNameMatch call. Building an index over Sleeper's ~11,000
// -player map (mls.js does this in several places) is thousands of those allocations for an
// object that never changes.
const NAME_ALIASES = {
    'kennygainwell': 'kennethgainwell',
    'gabedavis': 'gabrieldavis',
    'joshpalmer': 'joshuapalmer',
    'mitchtrubisky': 'mitchelltrubisky',
    'tankdell': 'nathanieldell',
    'hollywoodbrown': 'marquisebrown',
    'scottymiller': 'scottmiller',
    'djchark': 'djcharkjr',
    'jeffwilson': 'jefferywilson',
    'nicholassingleton': 'nicksingleton',
    'kennethwalker': 'kenwalker'
};

function normalizeName(name) {
    if (!name) return "";

    const cached = _normalizeNameCache.get(name);
    if (cached !== undefined) return cached;

    let n = String(name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .replace(/(jr|sr|iii|ii|iv|v)$/, '');

    const result = NAME_ALIASES[n] || n;
    _normalizeNameCache.set(name, result);
    return result;
}

// NOTE: normalizeName already applies NAME_ALIASES, so by the time n1/n2 exist here they are
// both canonical -- and since no alias VALUE is also an alias KEY, NAME_ALIASES[n1] is always
// undefined at this point. The two lookups below are therefore unreachable in practice and the
// function is equivalent to comparing the two normalized names. They're kept because they cost
// nothing and would start mattering again the moment someone adds an alias whose value is
// itself another alias's key, which is an easy thing to do to the table above by accident.
function isNameMatch(name1, name2) {
    if (!name1 || !name2) return false;
    let n1 = normalizeName(name1);
    let n2 = normalizeName(name2);

    if (n1 === n2) return true;

    if (NAME_ALIASES[n1] === n2 || NAME_ALIASES[n2] === n1) return true;
    if (NAME_ALIASES[n1] && NAME_ALIASES[n1] === NAME_ALIASES[n2]) return true;

    return false;
}
// --- NETWORK FETCH WITH A TIMEOUT ---
// Every remote call this app makes -- Sleeper, LeagueLogs, FantasyCalc, ESPN -- used to be a
// bare fetch(), and fetch() has no timeout of any kind. A connection that FAILS rejects
// promptly, and every call site already handles that. A connection that STALLS never settles
// at all: the promise just sits there, forever, and so does everything awaiting it.
//
// That's not a hypothetical here -- it's the environment sw.js's own header comment describes
// as this app's real one: a phone, mid-draft or minutes before kickoff, on congested stadium
// or cellular data. With no timeout, a stall left syncActiveLeague's button spinning,
// runScout's "Looking up player positions..." on screen, and autoFindWaiverUpgrades' Scan
// button disabled -- no error, no toast, no way back except reloading the page.
//
// mdsFetch is the one place that fixes that, for all three apps. It's a drop-in for fetch():
// same arguments, same Response, same rejection on a genuine network failure. Two additions:
//
//   1. Every request carries an abort signal that fires after `ms`. The signal covers the
//      response BODY too, not just the headers, so a download that dies halfway through is
//      caught by the same clock as one that never starts.
//   2. A timeout rejects with a message naming the service that went quiet ("Sleeper didn't
//      respond in time."). This matters because the existing call sites interpolate
//      err.message straight into a toast -- a raw "signal is aborted without reason" there
//      reads like a bug in the app rather than a connection worth retrying.

// 12s is the ceiling for an ordinary JSON response (a league, a roster, a week of stats --
// tens to hundreds of KB). Long enough that a merely slow connection still succeeds, short
// enough that a person staring at a spinner gets an answer while they're still waiting on it.
const MDS_FETCH_TIMEOUT_MS = 12000;

// Sleeper's players/nfl payload is close to 5MB (see sleeperApi.js's cache comment). The
// default above would abort a perfectly healthy download of it on a slow connection, so its
// callers pass this instead. Still bounded -- the point of this whole wrapper is that there
// is always a ceiling, not that some requests are exempt from one.
window.MDS_LONG_FETCH_TIMEOUT_MS = 30000;

// Used only to name the service in a timeout message. Matched against the hostname (exact, or
// as a suffix after a dot) rather than searched for anywhere in the URL, so a profile key or
// query param that happens to contain one of these strings can't mislabel the error.
const MDS_FETCH_SERVICES = [
    ['sleeper.app', 'Sleeper'],
    ['sleeper.com', 'Sleeper'],
    ['leaguelogs.com', 'LeagueLogs'],
    ['fantasycalc.com', 'FantasyCalc'],
    ['espn.com', 'ESPN'],
    ['google.com', 'Google Sheets']
];

function mdsFetchServiceName(url) {
    let host;
    try {
        host = new URL(String(url), window.location.href).hostname;
    } catch (e) {
        return 'The server'; // unparseable URL -- still better than naming the wrong service
    }
    const match = MDS_FETCH_SERVICES.find(([domain]) => host === domain || host.endsWith('.' + domain));
    return match ? match[1] : 'The server';
}

// Builds the signal for one request. Returns { signal, timedOut } where timedOut is read
// AFTER the request settles, to tell our own timeout apart from a caller's cancellation.
function mdsFetchSignal(ms, callerSignal) {
    const state = { signal: null, timedOut: false };

    // AbortSignal.timeout aborts with a DOMException named 'TimeoutError', which is what the
    // catch below keys on -- state.timedOut stays false on this path and doesn't need to be
    // set. AbortSignal.any is what lets a caller's own signal coexist with the timeout instead
    // of one silently replacing the other.
    const hasTimeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
    const hasAny = typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function';
    if (hasTimeout && (!callerSignal || hasAny)) {
        const timeoutSignal = AbortSignal.timeout(ms);
        state.signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
        return state;
    }

    // Fallback for browsers without those two (and for the one combination they don't cover):
    // identical behavior wired by hand. The timer is deliberately never cleared -- aborting an
    // already-settled request is a no-op, and leaving it armed is precisely what keeps the
    // timeout covering the body stream after the headers have arrived.
    const controller = new AbortController();
    setTimeout(() => { state.timedOut = true; controller.abort(); }, ms);
    if (callerSignal) {
        if (callerSignal.aborted) controller.abort();
        else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    state.signal = controller.signal;
    return state;
}

/**
 * fetch() with a timeout. Drop-in replacement -- same arguments, same Response.
 *
 * @param {string} url
 * @param {RequestInit} [opts] - passed through; a `signal` here is honored alongside the timeout
 * @param {number} [ms=12000] - pass window.MDS_LONG_FETCH_TIMEOUT_MS for multi-megabyte payloads
 * @returns {Promise<Response>} rejects with a TimeoutError whose .message is user-facing
 *   ("Sleeper didn't respond in time...") and whose .isTimeout is true, so a call site that
 *   wants to distinguish a timeout from a 404 can, while one that just toasts err.message
 *   gets something readable for free.
 */
window.mdsFetch = async function(url, opts = {}, ms = MDS_FETCH_TIMEOUT_MS) {
    const req = mdsFetchSignal(ms, opts.signal);

    // A timeout on the AbortSignal.timeout path arrives as a DOMException named 'TimeoutError'.
    // On the hand-wired fallback it's a plain 'AbortError', so that one is read as a timeout
    // only when our own timer is what fired -- otherwise an unrelated failure that happens to
    // land after the timer (a malformed-JSON SyntaxError, say) would be reported as one.
    const translate = (err) => {
        const name = err && err.name;
        if (name !== 'TimeoutError' && !(req.timedOut && name === 'AbortError')) return err;
        const timeoutErr = new Error(`${mdsFetchServiceName(url)} didn't respond in time. Check your connection and try again.`);
        timeoutErr.name = 'TimeoutError';
        timeoutErr.isTimeout = true;
        timeoutErr.cause = err;
        return timeoutErr;
    };

    let res;
    try {
        res = await fetch(url, { ...opts, signal: req.signal });
    } catch (err) {
        throw translate(err);
    }

    // The body is read at the call site (res.json()), outside the try above -- so a stall that
    // happens AFTER the headers arrive would otherwise surface there as a raw abort. Shadow
    // the two readers this app uses with versions that run the same translation, rather than
    // asking twenty call sites to each remember to handle it. These are own properties sitting
    // in front of Response.prototype; nothing else about the Response changes.
    ['json', 'text'].forEach(method => {
        const original = res[method].bind(res);
        res[method] = () => original().catch(err => { throw translate(err); });
    });

    return res;
};

function injectFeedbackForm() {
    const container = document.getElementById('shared-feedback-container');
    if (!container) return;

    container.innerHTML = `
        <div style="padding: 1rem 1.5rem; border-top: 1px solid var(--border); margin-top: 1rem;">
            <h4 style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.75rem;">Report a Bug / Feedback</h4>
            <form action="https://formspree.io/f/xaewqqkq" method="POST" style="display: flex; flex-direction: column; gap: 0.5rem;">
                <input type="email" name="email" class="form-input" placeholder="Your email (optional)" style="padding: 0.5rem; font-size: 0.85rem;">
                <textarea name="message" class="form-input" placeholder="What went wrong?" required style="padding: 0.5rem; font-size: 0.85rem; min-height: 80px; resize: vertical;"></textarea>
                <button type="submit" class="btn btn-primary btn-sm">Submit</button>
            </form>
        </div>
    `;
}

// Automatically run this when the page loads
// --- FOCUS TRAPPING FOR OVERLAYS ---
// Shared by the hamburger drawer and the rankings preview modal (both in mls.js) so a
// keyboard user Tabbing through an open overlay stays inside it instead of tabbing into the
// page behind it -- previously neither one did this, despite the preview modal's markup
// already declaring role="dialog" aria-modal="true", a promise the JS wasn't keeping.
//
// Focusable elements are queried fresh every time the trap engages (open, and every Tab
// press) rather than cached once at open-time, because the drawer's feedback form is
// injected asynchronously into #shared-feedback-container and its inputs need to be
// included once they exist.
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter(el => el.offsetParent !== null); // skip anything hidden (display:none ancestor)
}

/**
 * Creates a focus trap scoped to `container`. Returns { activate, deactivate }; activate()
 * remembers what had focus beforehand, moves focus to the first focusable element inside
 * the container, and keeps Tab/Shift+Tab cycling within it. deactivate() removes that
 * listener and restores focus to whatever had it before activate() was called, so closing
 * an overlay puts a keyboard user right back where they were (e.g. the hamburger button).
 *
 * @param {HTMLElement} container
 * @param {{ onEscape?: Function }} [options] - onEscape, if given, is called (with no
 *   arguments) when Escape is pressed while the trap is active, instead of the trap doing
 *   anything itself with that key -- the caller decides what "close" means for it.
 */
window.createFocusTrap = function(container, options = {}) {
    let previouslyFocused = null;
    let active = false;

    function handleKeydown(e) {
        if (e.key === 'Escape' && typeof options.onEscape === 'function') {
            options.onEscape();
            return;
        }
        if (e.key !== 'Tab') return;

        const focusable = getFocusableElements(container);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    return {
        activate() {
            if (active) return;
            active = true;
            previouslyFocused = document.activeElement;
            container.addEventListener('keydown', handleKeydown);

            const focusable = getFocusableElements(container);
            if (focusable.length > 0) focusable[0].focus();
        },
        deactivate() {
            if (!active) return;
            active = false;
            container.removeEventListener('keydown', handleKeydown);
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus();
            }
            previouslyFocused = null;
        }
    };
};

// --- SHARED IN-APP CONFIRM DIALOG ---
// window.showConfirm() replaces window.confirm() across all three pages. Native confirm()
// freezes the whole page, can't be styled to match the app, and on mobile browsers renders
// with the site's origin in its title bar, which reads like a security warning rather than
// a question the app is asking. This keeps the same "stop and answer" semantics but inside
// the app, reusing the same overlay treatment as the rankings preview modal.
//
// Returns a Promise<boolean>, so call sites become `if (!await showConfirm(...)) return;`
// and the enclosing function picks up an `async`. Every caller is an onclick handler whose
// return value is discarded, so nothing downstream had to change.
//
// The markup is built here on first use rather than written into index.html, lineup/index.html
// and t-score/index.html, so all three apps get the dialog from this one shared script - the
// same reason showToast further down builds its own element.
let confirmDialogEls = null;
let confirmDialogOpen = false;

function escapeForDialog(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// A blank line starts a new paragraph, a single newline is a line break - matching how the
// confirm() messages this replaces were already formatted. Escaped first: these messages
// interpolate names the user typed (ranking sets, leagues, filenames) and names that came
// back from Sleeper, and unlike confirm() an innerHTML sink would treat those as markup.
function dialogMessageHTML(message) {
    return String(message)
        .split(/\n{2,}/)
        .map(block => `<p>${escapeForDialog(block).replace(/\n/g, '<br>')}</p>`)
        .join('');
}

function buildConfirmDialog() {
    const overlay = document.createElement('div');
    overlay.id = 'mds-confirm-overlay';
    overlay.className = 'mds-modal-overlay';
    overlay.style.display = 'none';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mds-confirm-title');
    overlay.setAttribute('aria-describedby', 'mds-confirm-body');
    overlay.innerHTML = `
        <div class="mds-modal mds-confirm-modal">
            <h3 id="mds-confirm-title"></h3>
            <div id="mds-confirm-body" class="mds-confirm-body"></div>
            <div class="mds-modal-actions">
                <button type="button" class="btn btn-secondary" data-confirm-action="cancel"></button>
                <button type="button" class="btn" data-confirm-action="ok"></button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    return {
        overlay,
        titleEl: overlay.querySelector('#mds-confirm-title'),
        bodyEl: overlay.querySelector('#mds-confirm-body'),
        cancelBtn: overlay.querySelector('[data-confirm-action="cancel"]'),
        okBtn: overlay.querySelector('[data-confirm-action="ok"]')
    };
}

/**
 * In-app replacement for window.confirm(). Resolves true if the person confirms, false if
 * they cancel, press Escape, or click the backdrop.
 *
 * @param {string} message - Body text. Blank lines become separate paragraphs.
 * @param {{ title?: string, confirmText?: string, cancelText?: string, danger?: boolean }} [options]
 *   danger styles the confirm button red (.btn-danger) for anything that destroys data;
 *   everything else gets the normal green primary button.
 * @returns {Promise<boolean>}
 */
window.showConfirm = function(message, options = {}) {
    // Two open dialogs would stack two focus traps on each other, and the second one's
    // deactivate() would restore focus into the first. The overlay covers the page while it's
    // open so this should be unreachable - answer "no" rather than half-open a second copy.
    if (confirmDialogOpen) return Promise.resolve(false);
    if (!confirmDialogEls) confirmDialogEls = buildConfirmDialog();

    const { overlay, titleEl, bodyEl, cancelBtn, okBtn } = confirmDialogEls;
    titleEl.textContent = options.title || 'Are you sure?';
    bodyEl.innerHTML = dialogMessageHTML(message);
    cancelBtn.textContent = options.cancelText || 'Cancel';
    okBtn.textContent = options.confirmText || 'Confirm';
    okBtn.className = options.danger ? 'btn btn-danger' : 'btn btn-primary';

    confirmDialogOpen = true;
    overlay.style.display = 'flex';

    return new Promise(resolve => {
        let trap = null;

        function settle(result) {
            if (!confirmDialogOpen) return;
            confirmDialogOpen = false;
            overlay.style.display = 'none';
            cancelBtn.removeEventListener('click', onCancel);
            okBtn.removeEventListener('click', onOk);
            overlay.removeEventListener('mousedown', onBackdrop);
            if (trap) trap.deactivate();
            resolve(result);
        }

        function onCancel() { settle(false); }
        function onOk() { settle(true); }

        // Clicking the dimmed area outside the card cancels, same as Escape. mousedown rather
        // than click so a drag that starts on the card and ends on the backdrop (selecting the
        // message text, say) isn't read as a dismissal.
        function onBackdrop(e) { if (e.target === overlay) settle(false); }

        cancelBtn.addEventListener('click', onCancel);
        okBtn.addEventListener('click', onOk);
        overlay.addEventListener('mousedown', onBackdrop);

        // Cancel is first in the DOM, so the trap lands initial focus there rather than on a
        // destructive confirm button - Enter on an unread dialog does the safe thing.
        if (typeof window.createFocusTrap === 'function') {
            trap = window.createFocusTrap(overlay, { onEscape: () => settle(false) });
            trap.activate();
        }
    });
};

document.addEventListener('DOMContentLoaded', injectFeedbackForm);

// --- SCROLL-SHADOW CUE FOR WIDE TABLES ---
// Toggles .has-scroll-shadow (styles.css) on/off based on actual scroll position, rather
// than a static always-on shadow -- a shadow that's still showing after the user has
// scrolled all the way to the right would be actively misleading (implying there's more to
// see when there isn't). Applies to .table-responsive (Command Center) and .sos-table-wrapper
// (SoS grid) only; the Power Rankings heatmap intentionally doesn't use overflow-x: auto
// (see its own comment in mls.js -- tooltips would get clipped), so it's excluded here too.
function initScrollShadows() {
    const SCROLL_SHADOW_SELECTOR = '.table-responsive, .sos-table-wrapper';

    function updateShadow(el) {
        const hasOverflow = el.scrollWidth > el.clientWidth + 1;
        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
        el.classList.toggle('has-scroll-shadow', hasOverflow && !atEnd);
    }

    const containers = Array.from(document.querySelectorAll(SCROLL_SHADOW_SELECTOR));
    containers.forEach(el => {
        updateShadow(el);
        el.addEventListener('scroll', () => updateShadow(el), { passive: true });

        // Both containers' inner tables are (re)built dynamically after load -- the Command
        // Center table on league/week changes, the SoS grid whenever new SoS data is
        // uploaded -- which can change scrollWidth without ever firing a 'scroll' event.
        // A MutationObserver re-checks whenever that inner content actually changes, rather
        // than this needing every render call site to remember to re-run the check itself.
        if (window.MutationObserver) {
            new MutationObserver(() => updateShadow(el)).observe(el, { childList: true, subtree: true });
        }
    });

    window.addEventListener('resize', () => containers.forEach(updateShadow));
}
document.addEventListener('DOMContentLoaded', initScrollShadows);
function dismissBanner(bannerId, storageKey) {
    const banner = document.getElementById(bannerId);
    if (banner) banner.style.display = 'none';
    if (storageKey) localStorage.setItem(storageKey, 'true');
}

// Dismisses one banner and, in the same action, reveals a second banner that's staggered
// behind it -- used so the MLS dashboard's guide banner and cross-promo banner don't both
// stack on first load. nextBanner only appears once its own dismiss flag says it hasn't
// already been dismissed on some earlier visit (e.g. before this staggering existed).
window.dismissBannerAndReveal = function(bannerId, storageKey, nextBannerId, nextStorageKey) {
    dismissBanner(bannerId, storageKey);
    if (localStorage.getItem(nextStorageKey) === 'true') return;
    const nextBanner = document.getElementById(nextBannerId);
    if (nextBanner) nextBanner.style.display = 'flex';
};

// Hide on load if previously dismissed
document.addEventListener('DOMContentLoaded', () => {
    // Helper function to check storage and hide
    const checkAndHideBanner = (bannerId, storageKey) => {
        if (localStorage.getItem(storageKey) === 'true') {
            const banner = document.getElementById(bannerId);
            if (banner) banner.style.display = 'none';
        }
    };

    // Check all your app banners
    // NOTE: 'guideBanner' was previously checked against 'ds_hide_guide_banner' -- a leftover
    // from before app-scoped storage keys (see the localStorage key scoping principle) -- while
    // its own dismiss button has always written 'mls_hide_guide_banner'. That mismatch meant
    // dismissing the guide banner never actually stuck across reloads; fixed to check the same
    // key the button writes.
    checkAndHideBanner('guideBanner', 'mls_hide_guide_banner');
    checkAndHideBanner('mlsBanner', 'ds_hide_mls_banner');
    checkAndHideBanner('draftBanner', 'mls_hide_draft_banner');
    checkAndHideBanner('sleeperSyncBanner', 'mls_hide_sleeper_sync_banner');
    checkAndHideBanner('installCard', 'ds_hide_install_banner');

    // Staggered reveal: draftBanner starts hidden (see its inline style in index.html) so it
    // never stacks with guideBanner on a first visit. Once guideBanner has been dismissed
    // (whether just now or on some earlier visit), and draftBanner itself hasn't been
    // dismissed, draftBanner takes its place.
    if (localStorage.getItem('mls_hide_guide_banner') === 'true' && localStorage.getItem('mls_hide_draft_banner') !== 'true') {
        const draftBanner = document.getElementById('draftBanner');
        if (draftBanner) draftBanner.style.display = 'flex';
    }
});
// --- TOAST NOTIFICATIONS ---
// Batch operations (optimizeAllLineups, syncAllLeagues) call a per-league routine that toasts
// on its own, so firing N of them in a row is spam. Those callers suppress toasts for the
// length of the loop and report one summary at the end. They flip this flag rather than
// reassigning window.showToast to a no-op: a monkey-patch that never gets restored -- a throw
// mid-loop, an early return that skips the restore line -- silently kills every toast in the
// app for the rest of the session, including the error toast that would have explained why.
let toastsSuppressed = false;
window.setToastsSuppressed = function(suppressed) {
  toastsSuppressed = !!suppressed;
};

window.showToast = function(message, options = {}) {
  // options.force lets a batch caller surface something that genuinely matters (its summary,
  // or a failure) without having to unsuppress around the call.
  if (toastsSuppressed && !options.force) return;

  const isError = options.isError || false;
  const duration = options.duration || (isError ? 6000 : 3500);

  let toast = document.getElementById('mds-toast');
  
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mds-toast';
    toast.className = 'mds-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }

  toast.classList.toggle('toast-error', isError);
  toast.setAttribute('aria-live', isError ? 'assertive' : 'polite');

  // The message is plain text, never HTML. Toasts regularly carry names from outside the app:
  // league names set by other people on Sleeper, player names and file names from uploaded
  // files, draft names. Rendering them as HTML let markup in any of those run as script on
  // this site. \n still becomes a line break (as in the alert() messages this replaces),
  // added as <br> elements between text nodes rather than spliced into an HTML string.
  const target = isError ? document.createElement('span') : toast;
  toast.textContent = '';
  String(message).split('\n').forEach((line, i) => {
    if (i > 0) target.appendChild(document.createElement('br'));
    target.appendChild(document.createTextNode(line));
  });
  if (isError) {
    target.className = 'toast-message';
    const dismiss = document.createElement('button');
    dismiss.className = 'toast-dismiss-btn';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.textContent = '✕';
    dismiss.addEventListener('click', () => toast.classList.remove('show'));
    toast.append(target, dismiss);
  }

  void toast.offsetWidth; // Force CSS reflow to ensure animation replays
  toast.classList.add('show');
  
  clearTimeout(toast.hideTimeout);
  toast.hideTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
};

// --- RANKINGS UPLOAD DIAGNOSTICS ---
// Turns one per-file diagnostic into the message the user sees. Diagnostics come from
// rankingsParser.js's parseRankingsFiles (MLS) and from mds.js's processData (MDS), both
// shaped { fileName, reason, headersFound, missing, sheetName? } -- see parseRankingsFiles for
// what each reason means. Kept here so both apps describe the same problem in the same words.
//
// Returns plain text, not HTML. The file name and headers come straight from the user's file,
// so callers must render it as text: showToast (above) does, and the MLS preview box sets
// textContent.
window.formatRankingsDiagnostic = function(diag) {
  const MAX_HEADERS_SHOWN = 8;
  const headers = diag.headersFound || [];
  const foundList = headers.slice(0, MAX_HEADERS_SHOWN).map(String).join(', ') +
    (headers.length > MAX_HEADERS_SHOWN ? `, +${headers.length - MAX_HEADERS_SHOWN} more` : '');
  // No fileName means the rankings were pasted rather than uploaded (MDS's paste box).
  const file = diag.fileName ? `"${diag.fileName}"` : 'your pasted rankings';
  const where = diag.sheetName ? `the "${diag.sheetName}" tab of ${file}` : file;

  switch (diag.reason) {
    case 'no-name-column':
      // The side-by-side, one-section-per-position layout looks for different column names.
      if ((diag.missing || []).includes('qb player')) {
        return `No player-name columns in ${where}. Found: ${foundList}. For a sheet with positions side by side, head each name column like 'QB Player', 'RB Player' or 'FLEX Player'.`;
      }
      return `No player-name column in ${where}. Found: ${foundList}. Rename one column to 'Player' or 'Name'.`;
    case 'no-names-in-column':
      return `The player-name column in ${where} is blank on every row. Check that the names are in that column and not the one next to it.`;
    case 'no-rows':
      return `${where.charAt(0).toUpperCase() + where.slice(1)} has a header row${foundList ? ` (${foundList})` : ''} but no players under it.`;
    case 'empty-file':
      return `${where.charAt(0).toUpperCase() + where.slice(1)} is empty.`;
    case 'unreadable':
      return `Couldn't read ${where}.`;
    case 'unclosed-quote': {
      const lost = diag.rowsLost || 0;
      return lost > 0
        ? `Row ${diag.row} of ${where} opens a quote (") that never closes, so the ${lost} row${lost === 1 ? '' : 's'} after it ${lost === 1 ? 'was' : 'were'} swallowed into one cell and ${lost === 1 ? 'is' : 'are'} missing. Add the closing quote and upload again.`
        : `Row ${diag.row} of ${where} opens a quote (") that never closes, so that row may be garbled. Add the closing quote and upload again.`;
    }
    case 'tab-without-header':
      // Always a single tab, so `where` already reads 'the "Notes" tab of "x.xlsx"'.
      return `Skipped ${where}: it has no header row, and the file's other tabs do, so it was treated as notes. If it holds rankings, add a header row with a 'Player' or 'Name' column.`;
    default:
      return `Couldn't find any players in ${where}.`;
  }
};

// --- DRAG-AND-DROP FILE UPLOAD ---
// Lets a file be dropped onto an upload area instead of going through the file picker. A
// dropped file is handed to the area's existing <input type="file"> and a 'change' event is
// fired, so everything downstream (parsing, the preview, every error message) runs exactly as
// if the file had been picked. Nothing about the upload paths themselves had to change.
//
// zone:      the element that accepts drops (usually the whole upload card, a big target).
// pickInput: (event) => the <input type="file"> this drop should go to, or null to refuse it.
//            A function rather than a fixed input so a zone can route by state (MLS: the
//            single-file input, or in multi-file mode the position box the file landed on).
// refuseMessage: (event) => text for a refused drop, when pickInput returned null.
//
// The dropped file is checked against the input's `accept` extensions. The file picker
// enforces those; a drop bypasses them, and the rankings parser would otherwise read a
// dropped PDF or image as CSV.
window.enableFileDrop = function(zone, { pickInput, refuseMessage } = {}) {
  if (!zone || typeof pickInput !== 'function') return;
  let depth = 0; // dragenter/dragleave fire for every child element crossed; count them
  const hasFiles = e => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  const clear = () => { depth = 0; zone.classList.remove('mds-drop-active'); };

  zone.addEventListener('dragenter', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    zone.classList.add('mds-drop-active');
  });
  zone.addEventListener('dragover', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); // required, or the browser never fires 'drop' here
    e.dataTransfer.dropEffect = 'copy';
  });
  zone.addEventListener('dragleave', e => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) zone.classList.remove('mds-drop-active');
  });
  zone.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation(); // handled here; keeps the page-level guard below out of it
    clear();

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const input = pickInput(e);
    if (!input) {
      const msg = typeof refuseMessage === 'function' ? refuseMessage(e) : '';
      if (msg) window.showToast(msg, { isError: true });
      return;
    }
    if (input.disabled) {
      window.showToast('Wait for the current upload to finish, then drop the file again.', { isError: true });
      return;
    }
    if (files.length > 1) {
      window.showToast(`Drop one file at a time here (you dropped ${files.length}).`, { isError: true });
      return;
    }
    const file = files[0];
    const exts = String(input.accept || '').split(',').map(s => s.trim().toLowerCase()).filter(s => s.startsWith('.'));
    if (exts.length && !exts.some(ext => file.name.toLowerCase().endsWith(ext))) {
      const list = exts.length > 1 ? `${exts.slice(0, -1).join(', ')} or ${exts[exts.length - 1]}` : exts[0];
      window.showToast(`"${file.name}" isn't a file this upload can read. Drop a ${list} file.`, { isError: true });
      return;
    }
    try {
      input.files = files; // shows the file's name in the input, same as picking it
    } catch (err) {
      console.error('Could not attach dropped file:', err);
      window.showToast("Your browser didn't accept the dropped file. Use the file picker instead.", { isError: true });
      return;
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // A drag cancelled with Escape, or dropped elsewhere, never fires dragleave on the zone.
  document.addEventListener('dragend', clear);
  document.addEventListener('drop', clear);
};

// A file dropped anywhere OUTSIDE an upload area would make the browser open it in place of
// the app, leaving the page and throwing away anything unsaved. That's easy to do by missing
// the target by a few pixels, so the default is blocked page-wide for file drags. The cursor
// shows "not allowed" there, and drops on real upload areas are handled above. Text drags
// (e.g. into the paste box) aren't files and are left alone.
(function guardStrayFileDrops() {
  const isFileDrag = e => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  window.addEventListener('dragover', e => {
    if (!isFileDrag(e) || e.defaultPrevented) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'none';
  });
  window.addEventListener('drop', e => {
    if (isFileDrag(e)) e.preventDefault();
  });
})();

// --- HTML ESCAPING ---
// The one copy for both apps: mds.js (a plain script) calls it directly, and mls.js's own
// escapeHtml forwards here. Use it on any outside text placed into an HTML string: player
// names, teams, tiers and the like from uploaded or pasted rankings (and inline edits), plus
// names from Sleeper. Safe in element text and in quoted attribute values ("..." or '...').
// Not enough on its own inside an unquoted attribute, a URL, or inline JS/CSS.
window.escapeHtml = function(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// --- CSV QUOTE DAMAGE ---
// Papa's results.errors is NOT a list of skipped rows. Papa never skips a row, and most of
// what it reports is harmless: every single-column file gets an "UndetectableDelimiter"
// notice, and rows with too many or too few fields are still returned. The one entry that
// means data was lost is a quote error. An opening quote that never closes makes Papa read
// the rest of the file as a single cell, so every row after it disappears into that cell
// (e.g. a player named "Josh Allen,BUF\n2,Lamar Jackson,BAL").
//
// Returns null, or { row, rowsLost }: `row` is the 1-based line of the damaged row, counting
// the lines Papa kept (blank lines are skipped, so it can be off in a file with blank lines).
// `rowsLost` is how many rows ended up inside the swallowed cell. lineOffset converts Papa's
// row index to a line number: 1 for header: false, 2 (+ any title lines dropped) for
// header: true, where Papa's index doesn't count the header line.
window.findCsvQuoteProblem = function(results, lineOffset = 1) {
  const err = (results.errors || []).find(e => e.type === 'Quotes' && typeof e.row === 'number');
  if (!err) return null;
  const row = results.data[err.row];
  const cells = row == null ? [] : (Array.isArray(row) ? row : Object.values(row)).flat();
  const swallowed = cells.map(c => String(c ?? '')).find(c => /[\r\n]/.test(c)) || '';
  const rowsLost = swallowed.split(/\r\n|\n|\r/).slice(1).filter(l => l.trim()).length;
  return { row: err.row + lineOffset, rowsLost };
};

// --- ON-DEMAND SCRIPT LOADING ---
// Loads a third-party script the first time something actually needs it, and returns the same
// promise on every later call so a second request never triggers a second download.
//
// Both apps previously loaded html2canvas (~200KB) from a <script defer> tag on every single
// page load, for a screenshot-export button most sessions never press. `defer` kept it off the
// critical rendering path, but it still cost the download, the parse and the memory on a phone
// every time either app opened. mls.js already had exactly this pattern for SheetJS
// (loadSheetJS, used only when someone uploads an .xlsx) -- this generalizes it so the same
// reasoning can apply to any heavy, rarely-used dependency, and so both apps share one copy.
//
// `globalName` is what the script defines on window; an already-present global short-circuits
// the whole thing, which also means this is safe if a <script> tag for the same library is
// ever added back.
const _loadedScriptPromises = new Map();
window.loadScriptOnce = function(src, globalName) {
    if (globalName && typeof window[globalName] !== 'undefined') return Promise.resolve();
    if (_loadedScriptPromises.has(src)) return _loadedScriptPromises.get(src);

    const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        // Clear the cached promise on failure so a later attempt (after reconnecting, or
        // after an ad-blocker is paused) genuinely retries instead of replaying this
        // rejection forever. Same reasoning as getPlayerSearchIndex's error path in mls.js.
        script.onerror = () => {
            script.remove();
            _loadedScriptPromises.delete(src);
            reject(new Error(`Failed to load ${src}`));
        };
        document.head.appendChild(script);
    });

    _loadedScriptPromises.set(src, promise);
    return promise;
};

// Convenience wrapper for the one library both apps lazy-load. Resolves true when html2canvas
// is ready to call, false when it couldn't be fetched -- callers surface that as a toast
// rather than silently doing nothing.
window.ensureHtml2Canvas = async function() {
    try {
        await window.loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
        return typeof html2canvas !== 'undefined';
    } catch (err) {
        return false;
    }
};

// Lazy-loads SheetJS (XLSX) on first use, so the many sessions that never upload an .xlsx
// don't pay for it. Previously lived only inside mls.js; mds.js had its own inline copy with
// no failure path at all, so a blocked/offline CDN left an .xlsx upload dead-ended in total
// silence. Shared here so both apps get the same error handling.
//
// Keeps the (callback, onError) signature rather than returning the promise, because
// rankingsParser.js takes this function as an injected parameter and documents that shape.
window.loadSheetJS = function(callback, onError) {
    window.loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX')
        .then(
            () => callback(),
            // Two arguments rather than .then().catch() on purpose: onError means "the library
            // didn't load", so it must not also fire when the library loaded fine and the
            // callback itself threw -- that would report a CDN failure for a parsing bug.
            () => { if (typeof onError === 'function') onError(); }
        );
};

// --- FLASH BUTTON FEEDBACK ---
// Shared by mds.js and mls.js (previously two separate near-identical copies).
// Uses innerHTML rather than innerText: some buttons' resting state includes icon markup
// (callers capture btn.innerHTML beforehand as the fallback to restore), and plain-text
// flash messages render identically either way, so innerHTML is the safe common choice.
window.flashButton = function(btn, text, isError = false, fallbackContent = null, duration = 2500) {
    if (!btn) return;
    const originalContent = fallbackContent || btn.innerHTML;
    const originalBg = btn.style.backgroundColor;

    btn.innerHTML = text;
    btn.style.backgroundColor = isError ? "var(--error-color, #ea4335)" : "var(--success-color, #4ade80)";
    btn.style.color = isError ? "white" : "var(--bg-main, #0b132b)";

    clearTimeout(btn.flashTimeout);
    btn.flashTimeout = setTimeout(() => {
        btn.innerHTML = originalContent;
        btn.style.backgroundColor = originalBg;
        btn.style.color = "";
    }, duration);
};