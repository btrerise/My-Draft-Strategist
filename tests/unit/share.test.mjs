// "Share this site" (improvements K2): js/shared/ui/share.js opens the Web Share sheet where the browser has one,
// copies the link and says "Link copied" where it doesn't, stays silent when the person cancels, and falls back to
// copying on any other refusal. The buttons that call it are in tests/support.spec.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareSite, SHARE_DATA } from '../../js/shared/ui/share.js';

function fakes({ share, writeText } = {}) {
    const calls = { share: [], copy: [], toast: [] };
    const nav = {};
    if (share) nav.share = async (data) => { calls.share.push(data); return share(data); };
    if (writeText !== null) {
        nav.clipboard = { writeText: async (text) => { calls.copy.push(text); if (writeText) return writeText(text); } };
    }
    const toast = (msg, opts) => calls.toast.push({ msg, opts });
    return { nav, toast, calls };
}

const named = (name) => Object.assign(new Error(name), { name });

test('each app shares its own title, text and ?ref=share URL (support.md, section 5)', () => {
    assert.equal(SHARE_DATA.mds.url, 'https://mydraftstrategist.com/?ref=share');
    assert.equal(SHARE_DATA.mls.url, 'https://mydraftstrategist.com/lineup/?ref=share');
    assert.equal(SHARE_DATA.tscore.url, 'https://mydraftstrategist.com/t-score/?ref=share');
    assert.equal(SHARE_DATA.mds.text, 'Drafting with my own rankings in My Draft Strategist: live Sleeper sync, free, no ads.');
    assert.equal(SHARE_DATA.mls.text, "All my leagues' lineups, waivers and trades in one place: My Lineup Strategist, free, no ads.");
    assert.equal(SHARE_DATA.tscore.text, 'The T-Score model for WR and RB production.');
});

test('with navigator.share: the share sheet gets the app\'s data; nothing is copied or toasted', async () => {
    for (const app of ['mds', 'mls', 'tscore']) {
        const { nav, toast, calls } = fakes({ share: () => undefined });
        assert.equal(await shareSite(app, { nav, toast }), 'shared');
        assert.deepEqual(calls.share, [{ title: SHARE_DATA[app].title, text: SHARE_DATA[app].text, url: SHARE_DATA[app].url }]);
        assert.deepEqual(calls.copy, []);
        assert.deepEqual(calls.toast, []);
    }
});

test('without navigator.share: the link is copied and "Link copied" shows', async () => {
    const { nav, toast, calls } = fakes();
    assert.equal(await shareSite('mls', { nav, toast }), 'copied');
    assert.deepEqual(calls.copy, [SHARE_DATA.mls.url]);
    assert.deepEqual(calls.toast.map(t => t.msg), ['Link copied']);
});

test('cancelling the share sheet (AbortError) stays silent', async () => {
    const { nav, toast, calls } = fakes({ share: () => { throw named('AbortError'); } });
    assert.equal(await shareSite('mds', { nav, toast }), 'cancelled');
    assert.deepEqual(calls.copy, []);
    assert.deepEqual(calls.toast, []);
});

test('any other refusal falls back to copying', async () => {
    for (const name of ['NotAllowedError', 'InvalidStateError', 'DataError', 'Error']) {
        const { nav, toast, calls } = fakes({ share: () => { throw named(name); } });
        assert.equal(await shareSite('tscore', { nav, toast }), 'copied', name);
        assert.deepEqual(calls.copy, [SHARE_DATA.tscore.url], name);
        assert.deepEqual(calls.toast.map(t => t.msg), ['Link copied'], name);
    }
});

test('when copying fails too (or there is no clipboard), an error toast shows the link', async () => {
    for (const f of [fakes({ writeText: () => { throw named('NotAllowedError'); } }), fakes({ writeText: null })]) {
        assert.equal(await shareSite('mls', { nav: f.nav, toast: f.toast }), 'failed');
        assert.equal(f.calls.toast.length, 1);
        assert.match(f.calls.toast[0].msg, /lineup\/\?ref=share/);
        assert.equal(f.calls.toast[0].opts.isError, true);
    }
});

test('an unknown app shares Draft Strategist', async () => {
    const { nav, toast, calls } = fakes({ share: () => undefined });
    await shareSite('nope', { nav, toast });
    assert.equal(calls.share[0].url, SHARE_DATA.mds.url);
});
