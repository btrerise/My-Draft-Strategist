// Keeps each app's badge legend (the Guide's "What the badges mean", improvements S10) from drifting:
// every badge class an app uses must appear in the legend's HTML, so a new badge or symbol gets a legend
// line in the same change (CLAUDE.md, "Rules that bite").
//
// What counts as a badge class, from the app's JS (js/mls or js/mds) and its page:
//   1. Every class in a class="..." attribute that has an ANCHOR class (badge, *-badge, scout-status,
//      a chip...). Classes inside ${...} are dynamic and skipped here; 3 covers them.
//   2. The class strings passed to the pill and tier-gap helpers (scoutPillMarkup, tierGapMarkup and the
//      local pill() aliases) and the `cls: '...'` entries of status maps (LEAGUE_SEARCH_STATUS).
//   3. From the app's CSS (its own file and css/base.css): the other classes in a compound selector with
//      an anchor (.pos-badge.QB, .slot-badge.slot-FLEX, .mls-move-chip.is-up), when the app's source
//      spells that class or builds it from a prefix (`slot-${...}`). That catches values filled in at
//      run time.
// Then minus ALLOWED: classes that aren't symbols of their own (layout, sizing, filter state).
//
// The legend is built by the app's own module (js/mls/legend.js, js/mds/legend.js), loaded here in Node:
// both import only modules with no app state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const ANCHOR = /^(badge|.+-badge|badge-.+|scout-status|status-icon|mls-move-chip|mls-power-chip|mls-tier|mls-ta-tier|mls-ta-trend|mls-ta-starts|mls-tier-gap|mls-change-tier|lineup-injury-warning|bye-warning-banner|freshness-stale|sync-failed|tier-divider|roster-label|draft-cell|mls-verdict-.+)$/;

// Not symbols of their own: where a badge sits, its size, or a filter button's state.
const ALLOWED = new Set([
    'pos-filter', 'active-filter',                       // the position filter buttons' state
    'tooltip-container', 'tooltip-text',                 // hover text holders
    'mls-pos-badge-sizing', 'mls-ta-title-badge',        // sizing of a position badge in a row or title
    'mls-player-badges-row', 'mls-name-badges', 'card-badges-row', 'mls-nowrap', 'mls-scan-pill-stack',
    'mls-rank-badge-sizing',
    'status-badge', 'status-badge-meta',                 // the upload cards' "Updated ..." lines (text)
    'mls-rank-parts', 'mls-rank-part', 'mls-rank-bar', 'is-stacked', // a split rank badge's halves
    'sos-badge-label', 'sos-badge-icon',                 // parts of the SoS badge (in the legend anyway)
    'header-freshness', 'mls-ba-sync',                   // where a freshness label sits
    'roster-label-text',
    'mls-verdict-nums',                                  // the numbers after a Waiver Wire verdict (text)
    'sos-status-warn',                                   // the SoS card's warning sentence
    'slot-ROS',                                          // styled in css/mls.css, but no lineup slot is named ROS today
]);

const APPS = {
    mls: { name: 'Lineup Strategist', src: ['js/mls'], pages: ['lineup/index.html'], css: ['css/mls.css', 'css/base.css'], legend: 'js/mls/legend.js' },
    mds: { name: 'Draft Strategist', src: ['js/mds'], pages: ['index.html'], css: ['css/mds.css', 'css/base.css'], legend: 'js/mds/legend.js' },
};

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (name.endsWith('.js')) out.push(p);
    }
    return out;
}

// The value of each class="..." / class='...' attribute, with any ${...} inside kept whole (so a quote
// in `${on ? ' active' : ''}` doesn't end it early).
function classAttributes(text) {
    const out = [];
    const re = /class\s*=\s*(["'])/g;
    let m;
    while ((m = re.exec(text))) {
        const quote = m[1];
        let i = re.lastIndex, depth = 0, value = '';
        for (; i < text.length; i++) {
            const c = text[i];
            if (depth === 0 && c === quote) break;
            if (c === '\n' && depth === 0) break;
            if (c === '$' && text[i + 1] === '{') { depth++; value += '${'; i++; continue; }
            if (c === '}' && depth > 0) depth--;
            value += c;
        }
        out.push(value);
        re.lastIndex = i + 1;
    }
    return out;
}

// The literal class tokens of one attribute value (the ${...} parts dropped).
function literalTokens(value) {
    let out = '', depth = 0;
    for (let i = 0; i < value.length; i++) {
        if (value[i] === '$' && value[i + 1] === '{') { depth++; i++; out += ' '; continue; }
        if (depth > 0) { if (value[i] === '{') depth++; else if (value[i] === '}') depth--; continue; }
        out += value[i];
    }
    // A token cut by ${...} ("slot-" from slot-${type}) is a prefix, not a class; the legend's own classes
    // (badge-legend*) and the link that opens it aren't badges.
    return out.split(/\s+/).filter(t => /^[A-Za-z]([\w-]*[A-Za-z0-9])?$/.test(t) && !t.startsWith('badge-legend'));
}

function sourceFiles(app) {
    const legend = join(ROOT, app.legend);
    return [...app.src.flatMap(d => walk(join(ROOT, d))), ...app.pages.map(p => join(ROOT, p))].filter(f => f !== legend);
}

// The badge classes an app uses, each with one place it was found.
// extra: { where: text } of more source to scan (the self-check below).
function usedBadgeClasses(app, extra = {}) {
    const used = new Map();
    const add = (cls, where) => { if (!ALLOWED.has(cls) && !used.has(cls)) used.set(cls, where); };
    const sources = [...sourceFiles(app).map(f => [relative(ROOT, f), readFileSync(f, 'utf8')]), ...Object.entries(extra)];
    const allText = sources.map(([, text]) => text).join('\n');
    for (const [where, text] of sources) {
        for (const value of classAttributes(text)) {
            const tokens = literalTokens(value);
            if (tokens.some(t => ANCHOR.test(t))) tokens.forEach(t => add(t, where));
        }
        for (const m of text.matchAll(/\b(?:pill|scoutPillMarkup|tierGapMarkup)\(\s*'([\w-]+)'/g)) add(m[1], where);
        for (const m of text.matchAll(/\bcls:\s*'([\w-]+)'/g)) add(m[1], where);
    }
    // Prefixes the source builds classes from: class="... slot-${slotType}".
    const prefixes = new Set();
    for (const value of classAttributes(allText)) {
        for (const m of value.matchAll(/(?:^|\s)([A-Za-z][\w-]*-)\$\{/g)) prefixes.add(m[1]);
    }
    for (const cssFile of app.css) {
        const css = readFileSync(join(ROOT, cssFile), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const selector of css.matchAll(/([^{}]+)\{/g)) {
            for (const compound of selector[1].split(/[\s,>+~]+/)) {
                const classes = [...compound.replace(/::?[\w-]+(\([^)]*\))?/g, '').matchAll(/\.([A-Za-z][\w-]*)/g)].map(c => c[1]);
                if (classes.length < 2 || !classes.some(c => ANCHOR.test(c))) continue;
                for (const c of classes) {
                    const spelled = new RegExp(`(^|[^\\w-])${c}([^\\w-]|$)`).test(allText);
                    const built = [...prefixes].some(p => c.startsWith(p));
                    if (spelled || built) add(c, cssFile);
                }
            }
        }
    }
    return used;
}

async function legendClasses(app) {
    const mod = await import(new URL(`../../${app.legend}`, import.meta.url).href);
    const html = mod.buildBadgeLegendHTML();
    return { html, classes: new Set(classAttributes(html).flatMap(literalTokens)) };
}

for (const app of Object.values(APPS)) {
    test(`${app.name}: every badge class is in the Guide's badge legend (${app.legend})`, async () => {
        const { classes } = await legendClasses(app);
        const missing = [...usedBadgeClasses(app)].filter(([cls]) => !classes.has(cls)).map(([cls, where]) => `${cls} (${where})`);
        assert.deepEqual(missing, [], `Add a line to ${app.legend} for each (or, if it isn't a symbol users see, to ALLOWED in this test)`);
    });

    test(`${app.name}: the legend's samples aren't interactive`, async () => {
        const { html } = await legendClasses(app);
        assert.doesNotMatch(html, /data-action=|<button|onclick=/i);
    });

    test(`${app.name}: the coverage check reports a badge the legend doesn't have`, async () => {
        const { classes } = await legendClasses(app);
        const used = usedBadgeClasses(app, { 'made-up.js': 'const x = `<span class="badge s10-made-up-badge">X</span>`;' });
        assert.ok(used.has('s10-made-up-badge') && !classes.has('s10-made-up-badge'));
    });
}
