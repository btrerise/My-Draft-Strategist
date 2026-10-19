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
