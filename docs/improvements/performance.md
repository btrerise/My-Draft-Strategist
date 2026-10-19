# Load speed and tab switches (improvements S17)

Measurements for runbook card S17 ("Faster first load and tab switches"). Every number here comes from the two
opt-in tools below, run the same way each time, so a later session can rerun them and compare.

## How it's measured

**Page loads: `cd tests && npm run perf`** (`tests/tools/perf.mjs`). Lighthouse 13.5, the version PageSpeed Insights
ran on 2026-10-12, in PageSpeed's mobile setup: a Moto G Power sized screen, slow 4G (150 ms round trips, 1.6 Mbps
down) and the CPU slowed 4x. Each of `/`, `/lineup/` and `/t-score/`, 3 runs, median.

- **Visits.** *First*: empty cache, no service worker, Lighthouse's simulated throttling, as PageSpeed does (the headline
  number). *Cold*: the same first visit with real throttling (Chrome slows the network and CPU), so its filmstrip shows
  what a phone shows, white frames included. *Repeat*: the page loaded once (service worker installed and in control),
  then measured with real throttling.
- **Servers** (both in the tool, not tests/serve.mjs's port): *plain* does what tests/serve.mjs does (no compression,
  `Cache-Control: no-store`); *cf* is closer to Cloudflare Pages: brotli for text files, `public, max-age=0,
  must-revalidate` with an ETag (Pages' default), and the repo's `_headers` file if there is one.
- **Third parties** answer locally, the same bytes every run: Google Fonts (fetched once into `tests/tools/.perf-cache/`),
  PapaParse from tests/node_modules. Ko-fi's image, MathJax and headshots are blocked, as in the specs.
- `--ref <git ref>` serves a commit instead of the working tree, `--root <dir>` another folder (a prototype).

**How serving skews it.** tests/serve.mjs doesn't compress, so the plain server sends about 3x the bytes Cloudflare
does (`/lineup/`: 1,573 KB against 495 KB), and on a 1.6 Mbps link that's most of the difference between the two
servers' numbers. The live PageSpeed run (Performance 69, FCP 3.7 s, LCP 6.0 s) sits between them: Cloudflare compresses
like *cf*, but the live run also pays real DNS, TLS and server time to two origins (the site and Google Fonts) and
Cloudflare's own injected scripts, which a local server can't reproduce. Compare a change's numbers with the same
server's baseline, never with the live run.

**Tab switches: `cd tests && npm run perf:tabs`** (`tests/tools/tab-switch.tool.mjs`), S16's method: Lineup Strategist
with the fixture league synced and ranked, cloned 20 times in storage (21 leagues), the CPU slowed 4x. Each switch is
made 5 times through `showTab` (what the tab bar calls); the table gives the median time until the new tab's work has
run, the longest main-thread task, the total time in long tasks, and the time until the transition ends.
`PERF_REF=<ref>` measures a commit; `PERF_PROFILE=1` adds the functions that took the most time.

## Baseline: main on 2026-10-19 (`origin/main` at ec038ad)

First visit, PageSpeed's method (simulated slow 4G and 4x CPU), median of 3. Score / First Contentful Paint / Largest
Contentful Paint / Time to Interactive. Total Blocking Time is under 15 ms and layout shift 0 (T-Score 0.044) in all.

| Page | plain server (like serve.mjs) | cf server (like Cloudflare) |
|---|---|---|
| `/` | 73 · 2.83 s · 6.68 s · 6.69 s (1,077 KB) | 84 · 2.46 s · 3.95 s · 3.97 s (447 KB) |
| `/lineup/` | 82 · 3.15 s · 3.83 s · 9.86 s (1,573 KB) | 92 · 2.46 s · 2.61 s · 4.38 s (495 KB) |
| `/t-score/` | 85 · 2.91 s · 3.53 s · 3.55 s (774 KB) | 94 · 2.31 s · 2.69 s · 2.69 s (261 KB) |

- **Largest paint:** `/` and `/lineup/` paint their hero logo (images/logo.svg, images/mls-logo.svg), T-Score its subtitle.
- **Render-blocking:** Google Fonts' stylesheet, base.css and the page's own CSS hold the first paint back by 1.2–1.5 s
  on every page (Lighthouse's estimate).
- **Cold visit** (cf, real throttling): first paint `/` 1.81 s, `/lineup/` 1.70 s, `/t-score/` 1.59 s. Every frame of
  the filmstrip before the first paint is blank white (T-Score's first 4 of 8). With real throttling `/` shifts its
  layout by 0.20: the setup page's "Load Rankings" card moves down when the app draws what's above it. PageSpeed's
  simulated run can't see it, which is why the live run said 0.
- **Repeat visit** (cf, service worker in control): scores `/` 100, `/lineup/` 98, `/t-score/` 77. T-Score blocks the
  main thread for about 1.1 s on every load (Total Blocking Time 1,102 ms), cached or not.
- **Not reproduced locally:** "legacy JavaScript" (Lighthouse finds none in our files or PapaParse; on the live site it's
  most likely a script Cloudflare adds), and the forced-reflow insight at load (empty here).

**Tab switches** (21 leagues, 4x CPU), longest main-thread task, median ms:

| Switch | phone | desktop |
|---|---|---|
| Lineup → Dashboard | 104 | 138 |
| Dashboard → Lineup | 152 | 123 |
| Lineup → Roster | 69 | 94 |
| Roster → Dashboard | 90 | 92 |
| Dashboard → Roster | 85 | 74 |
| Roster → Lineup | 137 | 123 |

Runs differ by about ±20 ms. Profiled, a switch to Lineup spent ~90 ms laying out the lineup (forced by
`fitRankBadges`, which measures the rank badges after drawing them) and ~20 ms redrawing the hidden Dashboard's 21
cards; a switch to the Dashboard rebuilt 21 identical cards and then their Best Available sections.

## Each change, measured the same way

cf server, first visit, unless noted. Each row is measured on its own commit.

| Change | `/` | `/lineup/` | `/t-score/` | Kept? |
|---|---|---|---|---|
| Baseline (main) | 84 · 2.46 · 3.95 | 92 · 2.46 · 2.61 | 94 · 2.31 · 2.69 | |
| Inline page background (ad0eaf8) | 84 · 2.46 · 4.01 | 93 · 2.46 · 2.61 | 93 · 2.31 · 2.71 | for the owner |
| modulepreload lists in `<head>` (7a320e7) | 77 · 3.06 · 4.73 | **68 · 4.76 · 5.38** | 92 · 2.31 · 3.00 | no, reverted |
| modulepreload at the end of `<body>` | 80 · 3.06 · 4.23 | 69 · 4.22 · 4.72 | | no |
| Smaller logos (482afe0, preload removed) | 85 · 2.46 · 3.86 | 93 · 2.46 · 2.61 | 94 · 2.31 · 2.61 | yes |

(score · FCP s · LCP s)

- **Inline background:** no measurable effect. Chrome paints nothing before the blocking stylesheets arrive, so the
  white frames are the empty page before the first paint, which no style can colour (a `<meta name="color-scheme"
  content="dark">` didn't change them either). What shortens them is an earlier first paint (the font, below).
- **modulepreload:** slower everywhere, with real throttling too (`/lineup/` largest paint 1.70 s → 10.93 s with the
  list in `<head>`). Asking for all ~95 modules at once shares the slow-4G bandwidth with the stylesheets and the hero
  logo, which then arrive later. The import chain (5 levels) isn't what holds the page back; the bytes are. The
  generator (check-precache `--write`) is in commit 7a320e7 if it's ever wanted.
- **Logos:** the editor's content-credentials manifest removed and the embedded PNG masks re-encoded losslessly
  (5775.svg 134 → 81 KB brotli, logo.svg 79 → 68 KB). Rendered at 16–500 px and 1x–3x, both are pixel-identical to
  the originals. Rounding the path numbers would save 24–33 KB more but changes anti-aliased pixels, so it isn't done.
  `/` transfers 64 KB less.

### Prototypes (not on the branch; for the owner's choices)

Each is the branch at 614e934 (main + smaller logos + the marker change) plus one change. Branch itself: `/` 89 · 2.31
· 3.38, `/lineup/` 94 · 2.46 · 2.54 (TTI 4.38), `/t-score/` 92 · 2.46 · 2.61.

| Prototype | `/` | `/lineup/` | `/t-score/` |
|---|---|---|---|
| Outfit self-hosted (woff2 in the repo, preloaded) | 88 · **1.40** · 3.83 | 99 · **1.32** · 2.03 | 99 · **1.18** · 2.10 |
| Google Fonts without blocking (`media="print"`, boot.js applies it) | 85 · **1.43** · 3.53 | 88 · **1.53** · 1.87 | 93 · **1.44** · 1.96 |
| Every JS and CSS file minified (esbuild) | 88 · 2.31 · 3.08 (TTI 3.09) | 94 · 2.46 · 2.46 (TTI **3.67**) | 93 · 2.46 · 2.61 |
| Self-hosted font + minified | 92 · 1.28 · 3.30 | 99 · 1.26 · 1.89 (TTI 3.56) | 99 · 1.11 · 2.10 |
| No stylesheet blocks the paint (upper bound for "critical CSS inline") | 80 · 0.90 · 2.48 | 80 · 1.11 · 1.96 | 89 · 1.09 · 2.18 |
| No PapaParse at all (upper bound for loading it on first use) | no measurable change | | |

- **Fonts:** either option takes about 1.1 s off the first paint in PageSpeed's simulation, by not opening two more
  connections (fonts.googleapis.com, then fonts.gstatic.com) before it. With real throttling here the difference
  doesn't show, because the tool answers Google Fonts locally with no connection cost.
- **Minifying:** brotli sizes of all 130 JS files 498 → 220 KB, the 4 CSS files 61 → 27 KB (the source is heavily
  commented, so minifying saves more than usual even after compression). The first paint doesn't move (CSS is a small
  part of it); the pages are usable sooner (`/lineup/` TTI −0.7 s) and transfer less (`/lineup/` 495 → 285 KB).
- **Critical CSS:** on top of the font change it would gain 0.2–0.5 s of first paint, at the cost of a flash of unstyled
  page and a second copy of the CSS to keep in step. Not worth it.
- **Unused CSS** (first visit, empty storage): base.css 66–84% unused at load, mls.css 98%, mds.css 92%, tscore.css
  77%. Most of it styles tabs and states a first visit hasn't opened. A split would save at most the CSS part of the
  bound above; not worth its own card.
- **PapaParse** (`defer`, 7 KB brotli) doesn't block the paint; loading it on first use would touch about a dozen
  call sites for no measurable gain.
- **`_headers`:** a longer cache life can't help a first visit (nothing is cached yet). Repeat visits are already served
  by the service worker. A long life on images would delay a changed logo for anyone without the service worker, since
  images aren't precached. Not added.

### Tab switches after the changes

Longest task, median ms, phone / desktop (main → branch):

| Switch | phone | desktop |
|---|---|---|
| Lineup → Dashboard | 104 → 106 | 138 → 84 |
| Dashboard → Lineup | 152 → 100 | 123 → 81 |
| Lineup → Roster | 69 → 69 | 94 → 70 |
| Roster → Dashboard | 90 → 87 | 92 → 94 |
| Dashboard → Roster | 85 → 84 | 74 → 72 |
| Roster → Lineup | 137 → 79 | 123 → 104 |

- The tab bar's marker measures its buttons once, and again when the bar changes size, instead of on every switch.
- A Lineup render redraws the Dashboard's cards only while the Dashboard shows.
- The Dashboard keeps its cards when a redraw comes out identical, and Best Available leaves unchanged sections.
- What's left of a Dashboard switch (~100 ms) is mostly the browser laying out 21 cards that `display: none` had
  dropped. Keeping hidden tabs laid out (`content-visibility: hidden` instead of `display: none`) could remove it, but
  it changes how every tab is hidden; a possible follow-up, not done here.

## The branch at the end (f3e51f1: self-hosted font, smaller logos, the tab-switch changes)

First visit, score · FCP · LCP · TTI, against main's baseline above:

| Page | cf server | plain server |
|---|---|---|
| `/` | 84 → **88** · 2.46 → **1.05 s** · 3.95 → **3.38 s** · 3.97 → 3.39 s | 73 → 72 · 2.83 → 2.80 s · 6.68 → 6.78 s |
| `/lineup/` | 92 → **99** · 2.46 → **1.20 s** · 2.61 → **1.95 s** · 4.38 → 4.41 s | 82 → 86 · 3.15 → 2.85 s · 3.83 → 3.53 s |
| `/t-score/` | 94 → **98** · 2.31 → **1.18 s** · 2.69 → **2.10 s** · 2.69 → 2.10 s | 85 → 89 · 2.91 → 2.33 s · 3.53 → 3.38 s |

- With the plain server (no compression) the 1.6 Mbps link is the limit and the font change matters less: the uncompressed
  CSS and JS take most of the time either way.
- **Cold visit** (real throttling, where third parties cost nothing here): first paint `/` 1.89 s, `/lineup/` 1.77 s,
  `/t-score/` 1.66 s, as before; the gain is the two Google connections, which only the simulation (and a real phone)
  pays. **Repeat visit:** `/` 100, `/lineup/` 98, `/t-score/` 76, transferring 19 KB instead of 54 KB (Google's font
  stylesheet was the only thing fetched again).
- **Tab switches**, longest task (phone / desktop, ms): Dashboard → Lineup 152 → 95 / 123 → 90, Roster → Lineup 137 → 98 /
  123 → 91, Lineup → Dashboard 104 → 98 / 138 → 106; the Roster and Dashboard switches within the ±20–30 ms noise
  (Lineup → Roster on phones read 69 at baseline and 69–107 in later runs).
## PageSpeed Insights on the branch preview (owner's run, 2026-10-19 11:13)

`https://3a49fd9f.my-draft-strategist.pages.dev/` (the root page, Draft Strategist; the 2026-10-12 run was `/lineup/` on
the live site, so the two pages differ), mobile, Lighthouse 13.5.0, HeadlessChromium 153:

| | Live `/lineup/`, 2026-10-12 (before) | Preview `/`, 2026-10-19 (branch) |
|---|---|---|
| Performance | 69 | **88** |
| First Contentful Paint | 3.7 s | **1.5 s** |
| Largest Contentful Paint | 6.0 s | 3.4 s |
| Speed Index | 4.3 s | 4.6 s |
| Total Blocking Time / CLS | 0 ms / 0 | 0 ms / 0 |
| Render-blocking requests | ~920 ms | **330 ms** (base.css and mds.css only; Google Fonts gone) |
| Legacy JavaScript | 11 KiB | not listed |
| Cache lifetimes | 9 KiB | 5 KiB (Ko-fi's image, a third party) |

- **The filmstrip** still opens with three blank white frames (before the first paint at 1.5 s), then the dark page.
- **Largest paint on `/` is the header's draft drop-down text ("Main Draft")**, not the hero logo it is locally, with
  2,330 ms of render delay: the app's script fills the drop-down in. Writing a default name into the HTML would flash
  "Main Draft" for anyone whose draft is named otherwise, so it's left (noted in docs/TESTING.md's follow-ups).
- **Forced reflow:** `scrollShadows.js` 73 ms (the scroll-shadow check at DOMContentLoaded read `scrollWidth` before the
  first layout) and `viewTransition.js` 6 ms (the tab-bar marker's first measurement, kept: measuring later would make the
  marker slide in on load). **Fixed after this run:** the scroll-shadow check now runs from a ResizeObserver, after the
  browser's own layout (below).
- **Minify CSS 17 KiB / JS 34 KiB** (the owner chose no build step), **unused CSS 15 KiB** (base.css), a long-task note
  for `feedbackForm.js` (57 ms), and "unused preconnect" to sleepercdn.com (the headshots load only once a draft has
  players, so it is unused on a first visit; kept for the board).
- Not relevant on a preview URL: SEO 69 (`x-robots-tag: noindex`, which Cloudflare sets on previews) and the
  "Agentic Browsing" `ai-catalog.json` check (the site has none; the 404 answer is the HTML fallback).
