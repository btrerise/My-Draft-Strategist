// Touch targets (improvements M2): on every tab of both apps and T-Score at 375px with the fixture data, every visible
// control can be tapped anywhere in a 48x48px square centred on it (Material 3's 48dp target). The small ones get it from
// the invisible ::after in css/base.css ("TOUCH TARGETS"). Measured by hit-testing (document.elementFromPoint), so it
// sees those hit areas, and it fails when a neighbour's hit area takes a point: two targets can't share a spot. A control
// may fall short only if it's on ALLOW below, with the reason. It must still never lose part of its own visible box to a
// neighbour's hit area ("covered"), allowlisted or not.
//
// DISCOVER=1 prints every control that falls short, allowlisted or not, with what took each missed point.
import { test, expect } from '@playwright/test';
import {
    openApp, showTab, showTScoreTab, seedMds, seedMls, loadMlsRankings,
    MDS_TABS, MLS_TABS, TSCORE_TABS,
} from './helpers.mjs';

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });
// One width is the point of this spec, so it runs once, under the phone project.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'phone', 'measures at 375px; runs under the phone project only'));

// Controls allowed under 48x48px, each with its reason (the selector the control matches).
const ALLOW = [
    // Not targets of their own.
    { sel: '[data-inline-link], .mls-scoreboard-credit a', why: "a link inside a sentence (WCAG 2.5.8's inline exception)" },
    // Left as they are by the card.
    { sel: '.lineup-slot .swap-btn, .lineup-slot .lock-btn', why: "the Lineup row's swap and lock, stacked on phones: S32 redoes the rows and gives them room (card M2)" },
    // Can't carry an invisible area.
    { sel: 'input:not([type=checkbox]), select, textarea', why: "text fields and selects (44 to 45px tall; Draft Strategist's header draft menu 32px) can't have an ::after; growing them changes how every form looks (LOG M2, for the owner)" },
    { sel: '.mls-lc-status > .tooltip-container, .mls-power-table td .tooltip-container', why: "League card status chips and Power Rankings cells: position: static so their tooltip is placed against the card or table, which an ::after would follow too" },
    // Neighbours closer than 48px: they split the gap (css/base.css, TOUCH TARGETS; LOG M2).
    { sel: '.header .hamburger-btn, .header .logo-container, #headerSyncBtn', why: 'the phone header is full: the menu button touches the league arrow (Lineup) or sits 8px from the logo (Draft, T-Score), Sync 8px from the draft menu' },
    { sel: '.pos-filter, .badge-legend-link, .badge-legend-link ~ .tooltip-container .tooltip-icon', why: 'position chips in rows 8px apart (Scout) or columns 3px apart (Roster counts), with the Badges link and its "i" right beside them; M4 resizes the chips' },
    { sel: '.mls-root-player, .mls-root-window-head, .mls-week-fold-toggle', why: "Scoreboard lists: rows 2 to 6px apart, each row's full width its target" },
    { sel: '.mls-week-refresh, .mls-week-info .tooltip-icon', why: "the Scoreboard's \"i\" and Refresh sit side by side" },
    { sel: '.mls-lc-fold-all, .mls-lc-fold, .mls-lc-name-btn', why: "League Command Center: Edit and Fold all 14px apart, right above the first card's fold button and name" },
    { sel: '.lineup-needs-title, .lineup-needs-box .mls-btn-sm', why: '"This lineup needs you" sits right above its first fix button' },
    { sel: '.mls-rank-dual-tip, .mls-gap-chip', why: "a dynasty league's Roster row: the In-Season | Dyn badge 3px above the gap chip (not in this spec's fixture; mls-now-and-later.spec.mjs clicks both)" },
    { sel: '.mls-trade-side .mls-btn-sm', why: "the Trade Analyzer's Clear sits right above its player search" },
    { sel: '#teamTab .btn-draft', why: "Draft Strategist's Team tab: Undo buttons in rows closer than 48px" },
    { sel: '#trackerSyncToggle, #boardSyncToggle', why: "Live Sync and Auto-Sync, drawn at 85% (an inline transform): an area past them blurred the scaled switch, so they keep their size; their label beside them toggles them too" },
    { sel: '.player-card [data-action="toggleQueue"], .player-card [data-action="cycleAffinity"]', why: "the Tracker card's star and colour dot, 2px apart: each grows away from the other (to 47px with rounding)" },
];

// Runs in the page: { short, covered } for every visible control. A control is "short" when a point of the 48x48px
// square centred on it lands on something else; "covered" when a point just inside its own box lands on another control.
function measure([discover, scope]) {
    const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [tabindex]:not([tabindex="-1"])';
    const vw = innerWidth, vh = innerHeight;
    const describe = (el) => {
        const id = el.id ? '#' + el.id : '';
        const cls = [...el.classList].slice(0, 3).map(c => '.' + c).join('');
        const text = (el.getAttribute('aria-label') || el.textContent || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 30);
        return `${el.tagName.toLowerCase()}${id}${cls} "${text}"`;
    };
    // A link shown inline among other words of its paragraph is "inside a sentence".
    const inline = (el) => {
        if (el.tagName !== 'A' || getComputedStyle(el).display !== 'inline' || !el.parentElement) return false;
        const own = el.textContent.trim();
        return own.length > 0 && el.parentElement.textContent.replace(own, '').trim().length > 0;
    };
    const fixedOrSticky = (el) => {
        for (let e = el; e && e !== document.body; e = e.parentElement) {
            const p = getComputedStyle(e).position;
            if (p === 'fixed' || p === 'sticky') return true;
        }
        return false;
    };
    // Does a tap at (x, y) reach el? Its own box or a child, its label, or (for the "i" icon) its tooltip container.
    const reaches = (el, x, y) => {
        const hit = document.elementFromPoint(Math.min(Math.max(x, 0), vw - 1), Math.min(Math.max(y, 0), vh - 1));
        if (!hit || el.contains(hit)) return [true];
        const label = hit.closest('label');
        if (label && (label.control === el || label.contains(el))) return [true];
        const tt = el.closest('.tooltip-container');
        if (tt && tt.contains(hit) && !hit.closest('.tooltip-text')) return [true];
        return [false, hit];
    };
    const controls = [...document.querySelectorAll(scope ? `${scope} :is(${SEL})` : SEL)].filter(el =>
        !el.matches('.skip-link') && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        && !el.closest('[inert], [aria-hidden="true"], .tooltip-text') && (scope || !el.closest('#mds-toast')));
    // Fixed and sticky ones first, before anything scrolls (the bars can move while a scroll settles).
    window.scrollTo({ top: 0, behavior: 'instant' });
    controls.sort((a, b) => fixedOrSticky(b) - fixedOrSticky(a));
    const short = [], covered = [];
    for (const el of controls) {
        if (!fixedOrSticky(el)) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        if (r.width <= 2 || r.height <= 2) continue; // visually hidden (file inputs behind their buttons)
        if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue; // a closed drawer, or a pane scrolled away
        if (inline(el)) el.setAttribute('data-inline-link', '');
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const name = (hit) => discover ? `=${describe(hit)}` : '';
        // The 48px square may sit off-centre (a close button grows away from what it closes, a pair splits its gap
        // unevenly): try it centred, then pushed to either side as far as the control still fills it.
        const ax = Math.max(0, 24 - r.width / 2), ay = Math.max(0, 24 - r.height / 2);
        let miss = null;
        for (const dx of [0, ax, -ax]) for (const dy of [0, ay, -ay]) {
            if (miss && !miss.length) break;
            const sx = cx + dx, sy = cy + dy, m = [];
            for (const [where, x, y] of [['left', sx - 23.5, sy], ['right', sx + 23.5, sy], ['top', sx, sy - 23.5],
                ['bottom', sx, sy + 23.5], ['top-left', sx - 23.5, sy - 23.5], ['bottom-right', sx + 23.5, sy + 23.5],
                ['top-right', sx + 23.5, sy - 23.5], ['bottom-left', sx - 23.5, sy + 23.5]]) {
                const [ok, hit] = reaches(el, x, y);
                if (!ok) m.push(where + name(hit));
            }
            if (!miss || m.length < miss.length) miss = m;
        }
        const lost = [];
        const ix = Math.min(2, r.width / 4), iy = Math.min(2, r.height / 4);
        for (const [where, x, y] of [['centre', cx, cy], ['left edge', r.left + ix, cy], ['right edge', r.right - ix, cy],
            ['top edge', cx, r.top + iy], ['bottom edge', cx, r.bottom - iy]]) {
            const [ok, hit] = reaches(el, x, y);
            // Only another control counts: an overlay or a later card painted on top isn't this measurement's business.
            const other = !ok && hit.closest(SEL);
            if (other && !other.contains(el)) lost.push(`${where} by ${describe(other)}`);
        }
        const size = `${Math.round(r.width)}x${Math.round(r.height)}`;
        if (miss.length) { el.setAttribute('data-target-short', ''); short.push({ control: describe(el), size, miss: miss.join(' ') }); }
        if (lost.length) covered.push({ control: describe(el), size, lost: lost.join('; ') });
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    return { short, covered };
}

async function check(page, where, scope = null) {
    // Toasts come and go with timing; their close button is measured on its own (scope '#mds-toast').
    const hide = await page.addStyleTag({ content: scope ? '/* measuring the toast */' : '#mds-toast { display: none !important; }' });
    const { short, covered } = await page.evaluate(measure, [!!process.env.DISCOVER, scope]);
    const allowed = await page.evaluate((sel) => {
        const marked = [...document.querySelectorAll('[data-target-short]')];
        marked.forEach(e => e.removeAttribute('data-target-short'));
        return marked.map(e => e.matches(sel));
    }, ALLOW.map(a => a.sel).join(', '));
    // A hit area must never reach past the screen's edge: the page would scroll sideways.
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await hide.evaluate(t => t.remove());
    expect.soft(wide, `${where} scrolls sideways (a hit area past the screen's edge?)`).toBeLessThanOrEqual(0);
    if (process.env.DISCOVER) {
        for (const s of short) console.log(`${where}\t${s.size}\t${s.miss}\t${s.control}`);
        for (const c of covered) console.log(`${where}\tCOVERED ${c.size}\t${c.lost}\t${c.control}`);
        return;
    }
    expect.soft(short.filter((_, i) => !allowed[i]), `controls under 48x48px on ${where} (give it a hit area, or an ALLOW entry with its reason)`).toEqual([]);
    expect.soft(covered, `controls partly covered by a neighbour's hit area on ${where}`).toEqual([]);
}

test('Draft Strategist: every control has a 48px target', async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page, '/');
    for (const tab of MDS_TABS) { await showTab(page, tab); await check(page, `MDS empty ${tab}`); }
    await showTab(page, 'setup');
    await seedMds(page);
    for (const tab of ['tracker', 'team', 'board']) { await showTab(page, tab); await check(page, `MDS draft ${tab}`); }
});

test('Lineup Strategist: every control has a 48px target', async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page, '/lineup/');
    await check(page, 'MLS empty setup');
    await seedMls(page);
    await loadMlsRankings(page);
    await expect(page.locator('#mds-toast .toast-dismiss-btn')).toBeVisible(); // "Weekly Rankings loaded successfully!"
    await check(page, 'the toast', '#mds-toast');
    for (const tab of MLS_TABS) { await showTab(page, tab); await check(page, `MLS ${tab}`); }
});

test('T-Score: every control has a 48px target', async ({ page }) => {
    await openApp(page, '/t-score/');
    for (const tab of TSCORE_TABS) { await showTScoreTab(page, tab); await check(page, `T-Score ${tab}`); }
});
