// Keeps every transition and animation on Material 3's motion tokens (improvements M18; css/base.css, MOTION in :root).
//
// 1. The tokens are Material 3 Expressive's springs: each linear() easing is sampled from the spring androidx Compose
//    names in ExpressiveMotionTokens (damping ratio and stiffness), over the time it takes to settle; this test
//    re-derives them, so a hand edit that drifts fails here. The fast spatial one also equals material-web labs/gb's
//    button-group easing.
// 2. In the four stylesheets, a transition or animation names its curve and time through a var(--motion-…) token (or
//    a var() that resolves to one), never a literal cubic-bezier(), ease or time. Allowed literals: `linear` (Material's
//    linear easing: state layers, discrete visibility flips, a spinner's turn), 0s, the 1 ms view-transition cut (S16),
//    and the endless "look here" pulses and the spinner listed in ALLOWED_ANIMATIONS.
// 3. Media queries use Material 3's window sizes (600, 840) or the few content-sized tweaks in ALLOWED_WIDTHS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = (f) => readFileSync(new URL(`../../css/${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const FILES = ['base.css', 'mds.css', 'mls.css', 'tscore.css'];

const spring = (z, k, t) => {
    const w = Math.sqrt(k);
    if (z < 1) {
        const wd = w * Math.sqrt(1 - z * z);
        return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w * t) * (1 + w * t);
};
const SPRINGS = {
    'spatial-fast': [0.6, 800, 350], 'spatial-default': [0.8, 380, 500], 'spatial-slow': [0.8, 200, 650],
    'effects-fast': [1, 3800, 150], 'effects-default': [1, 1600, 200], 'effects-slow': [1, 800, 300],
};

test('the motion tokens are Compose\'s Expressive springs, sampled into linear()', () => {
    const base = css('base.css');
    const root = base.slice(base.indexOf(':root'), base.indexOf('}', base.indexOf('--motion-spatial-fast:')));
    for (const [name, [z, k, ms]] of Object.entries(SPRINGS)) {
        const m = root.match(new RegExp(`--motion-${name}:\\s*linear\\(([^)]*)\\)`));
        assert.ok(m, `--motion-${name} is a linear() easing`);
        const pts = m[1].split(',').map(Number);
        pts.forEach((v, i) => {
            const want = i === pts.length - 1 ? 1 : spring(z, k, (i / (pts.length - 1)) * ms / 1000);
            assert.ok(Math.abs(v - want) < 0.0015, `--motion-${name} point ${i}: ${v}, the spring gives ${want.toFixed(3)}`);
        });
        assert.match(root, new RegExp(`--motion-${name}-ms:\\s*${ms}ms`));
    }
    // material-web labs/gb/components/buttongroup/_button-group-tokens.scss, --motion-spring-fast-spatial.
    const labs = [0, 0.099, 0.317, 0.561, 0.775, 0.934, 1.034, 1.083, 1.095, 1.084, 1.063, 1.04, 1.02, 1.005, 0.996, 0.992, 0.991, 0.992, 0.994, 0.996, 1];
    assert.match(root, new RegExp(`--motion-spatial-fast:\\s*linear\\(${labs.join(', ').replace(/\./g, '\\.')}\\)`));
});

// Endless animations that aren't a change of state: they keep their own rhythm.
const ALLOWED_ANIMATIONS = [
    /^btn-pulse-anim 2s infinite$/, /^border-pulse-anim 2\.5s infinite$/, /^nav-pulse-anim 2s infinite$/,
    /^pulse 2s infinite$/, /^spin 1s linear infinite$/, /^spin-reduced 1s var\(--motion-emphasized\) infinite alternate$/,
];

test('every transition and animation uses the motion tokens', () => {
    const bad = [];
    for (const f of FILES) {
        const src = css(f);
        for (const m of src.matchAll(/(?<![-\w])(transition|animation)(-duration|-timing-function|-delay)?\s*:\s*([^;{}]+)/g)) {
            const [, prop, sub = '', raw] = m;
            const value = raw.trim().replace(/\s+/g, ' ');
            if (value === 'none' || /^none\b/.test(value)) continue;
            if (prop === 'animation' && !sub && ALLOWED_ANIMATIONS.some((re) => re.test(value))) continue;
            const stripped = value.replace(/var\([^()]*\)/g, ' ');
            const problems = [];
            if (/cubic-bezier|steps\(|\bease(-in|-out|-in-out)?\b/.test(stripped)) problems.push('a literal curve');
            const times = stripped.match(/(?<![\w.-])\d*\.?\d+m?s\b/g) || [];
            for (const t of times) if (!['0s', '1ms'].includes(t)) problems.push(`the time ${t}`);
            if (problems.length) bad.push(`${f}: ${prop}${sub}: ${value} (${problems.join(', ')})`);
        }
    }
    assert.deepEqual(bad, [], `Use the motion tokens (css/base.css, MOTION):\n${bad.join('\n')}`);
});

// Material 3's window sizes: compact under 600, medium 600–839, expanded from 840. 599.98 / 839.98 so a window exactly
// 600 or 840 wide gets one set of rules, not both. 480 and 520 tune very narrow phones inside compact; 900 and 1024
// widen grids inside expanded.
const ALLOWED_WIDTHS = ['max-width: 599.98px', 'min-width: 600px', 'max-width: 839.98px', 'min-width: 840px',
    'max-width: 480px', 'max-width: 520px', 'min-width: 900px', 'min-width: 1024px'];

test('media queries use Material 3\'s window sizes', () => {
    const bad = [];
    for (const f of FILES) {
        for (const m of css(f).matchAll(/@media[^{]*/g)) {
            for (const w of m[0].matchAll(/(min|max)-width:\s*([\d.]+px)/g)) {
                const q = `${w[1]}-width: ${w[2]}`;
                if (!ALLOWED_WIDTHS.includes(q)) bad.push(`${f}: ${m[0].trim()}`);
            }
        }
    }
    assert.deepEqual(bad, []);
});
