// Moved verbatim from js/utils.js in refactor chunk 1A. Loaded as an ES module through
// js/shared/globals.js, which assigns its exports to the same window.* names utils.js set.
// Comments below that say "this file" or "utils.js" were written when this was one file.

// --- NETWORK FETCH WITH A TIMEOUT ---
// Every remote call this app makes -- Sleeper, FFC, FantasyCalc, ESPN -- used to be a
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
export const MDS_LONG_FETCH_TIMEOUT_MS = 30000;

// Used only to name the service in a timeout message. Matched against the hostname (exact, or
// as a suffix after a dot) rather than searched for anywhere in the URL, so a profile key or
// query param that happens to contain one of these strings can't mislabel the error.
const MDS_FETCH_SERVICES = [
    ['sleeper.app', 'Sleeper'],
    ['sleeper.com', 'Sleeper'],
    ['fantasycalc.com', 'FantasyCalc'],
    ['espn.com', 'ESPN'],
    ['google.com', 'Google Sheets']
];

function mdsFetchServiceName(url) {
    let host, path;
    try {
        ({ hostname: host, pathname: path } = new URL(String(url), window.location.href));
    } catch (e) {
        return 'The server'; // unparseable URL -- still better than naming the wrong service
    }
    // Our own proxy for Fantasy Football Calculator (functions/api/ffc/, refactor 7A).
    if (host === window.location.hostname && path.startsWith('/api/ffc/')) return 'Fantasy Football Calculator';
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
export const mdsFetch = async function(url, opts = {}, ms = MDS_FETCH_TIMEOUT_MS) {
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
