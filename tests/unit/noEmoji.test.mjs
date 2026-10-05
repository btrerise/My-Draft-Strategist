// The owner's rule (improvements S1): icons users see are inline SVG, never emoji. This scans every
// file the site serves as app code (the three pages, js/, css/, functions/) for characters that
// render as emoji: anything with Emoji_Presentation, plus the U+FE0F selector that turns a text
// symbol such as ⚠ into its emoji form. Plain text glyphs already used on purpose (✕ on close
// buttons, ★, ✓) have no emoji presentation, so they pass. Comments are scanned too: an emoji in a
// comment is the easiest one to copy into markup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EMOJI = /\p{Emoji_Presentation}|️/u;

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(js|mjs|css|html)$/.test(name)) out.push(p);
    }
    return out;
}

const FILES = [
    ...['index.html', 'lineup/index.html', 't-score/index.html', 'sw.js'].map(f => join(ROOT, f)),
    ...['js', 'css', 'functions'].flatMap(d => walk(join(ROOT, d))),
];

test('no emoji in the files the site serves', () => {
    const found = [];
    for (const file of FILES) {
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
            const m = line.match(EMOJI);
            if (m) found.push(`${relative(ROOT, file)}:${i + 1}: ${JSON.stringify(m[0])} in ${line.trim().slice(0, 80)}`);
        });
    }
    assert.deepEqual(found, [], 'Use an inline SVG icon instead (CLAUDE.md, "Rules that bite")');
});
