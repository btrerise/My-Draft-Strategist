// Downloads Sleeper's player file and slims it, off the page's main thread (improvements F26). Unpacking the 14.7 MB
// file froze the screen for 0.6 to 0.8 s on a phone; here it doesn't, and only the slim map (playerMapSlim.js) comes
// back. Started by getSleeperPlayerMap in sleeper.js, one message per download:
//   in:  { url, knownEtag, timeoutMs }
//   out: { unchanged: true, etag }  Sleeper's version tag matches the saved copy's: nothing was unpacked
//        { data, etag }             the slim map
//        { status }                 Sleeper answered with an error status
//        { timeout: true } | { error } the download didn't finish
// cache: 'no-cache' asks the browser to check with Sleeper before using its own cached copy: when the file hasn't
// changed, Sleeper answers 304 and nothing is downloaded. (The app can't send that question itself: Sleeper's CORS rules
// don't allow If-None-Match from a page, but the browser's cache may.)
import { slimPlayerMap } from './playerMapSlim.js';

self.onmessage = async (e) => {
    const { url, knownEtag, timeoutMs } = e.data || {};
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 30000);
    try {
        const res = await fetch(url, { cache: 'no-cache', signal: ctrl.signal });
        if (!res.ok) { self.postMessage({ status: res.status }); return; }
        const etag = res.headers.get('etag');
        if (etag && knownEtag && etag === knownEtag) {
            if (res.body) res.body.cancel().catch(() => {});
            self.postMessage({ unchanged: true, etag });
            return;
        }
        const raw = await res.json();
        self.postMessage({ data: slimPlayerMap(raw), etag });
    } catch (err) {
        self.postMessage(ctrl.signal.aborted ? { timeout: true } : { error: String((err && err.message) || err) });
    } finally {
        clearTimeout(timer);
    }
};
