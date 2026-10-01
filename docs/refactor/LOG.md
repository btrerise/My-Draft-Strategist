# Module-structure refactor log

The plan, the rules every session follows, and a copyable prompt per chunk are in the runbook:
https://claude.ai/artifact/4ZapAQXgsVu96YRkToSJFS (read it with the Artifact tool).

This file is the hand-off between sessions. Read it before starting a chunk; add an entry
(newest at the bottom) when you finish one.

## How to run the checks

From the repo root:

```sh
node scripts/check-precache.mjs              # sw.js PRECACHE_ASSETS vs. what the pages load
node --test                                  # unit tests in tests/unit/ (Node 22+)
cd tests && npm install && npm run check     # precache + unit tests + Playwright smoke + screenshots
```

- `npm test` (in `tests/`) runs Playwright only. `npm run unit` runs only the unit tests.
  `npm run check` runs everything.
- Run `node --test` with no arguments, from the repo root or from `tests/`. Node 22 or newer
  is needed: the tests import the app's `.js` ES modules directly, and the repo root has no
  package.json, so Node has to detect module syntax on its own. `node --test tests/unit/`
  doesn't work, because Node 22 treats a directory argument as a file. To run one suite:
  `node --test tests/unit/rankingsParser.test.mjs`.
- Chromium is preinstalled in Claude Code cloud sessions (`/opt/pw-browsers`). Don't run
  `playwright install` there.

### Accepting an intended visual change

Chunks that only move code must leave every screenshot identical. If a chunk is *meant* to
change how something looks: `cd tests && npm run test:update`, then check the changed PNGs
in `git diff --stat tests/baselines` and mention them in your entry below.

Baselines are per platform (`tests/baselines/linux/...`). Google Fonts is blocked in tests, so
text uses fallback fonts, which differ between OSes. A macOS run won't find baselines and will
write its own under `baselines/darwin/`. Don't commit those unless you mean to keep both.

## How the tests work

- `tests/serve.mjs` serves the repo root with real 404s. Playwright starts it on port 4173.
- `tests/helpers.mjs` intercepts every request that leaves localhost:
  - PapaParse comes from `tests/node_modules`, pinned to the same 5.4.1 the pages use.
  - Sleeper API calls are answered from `tests/fixtures/sleeper/*.json`. These are generated
    by `node tests/fixtures/sleeper/make-fixtures.mjs`, which describes a 2-team "Fixture
    League" for user `mds_test`, 2026 week 2. Edit the generator, not the JSON.
  - A Sleeper URL with no fixture gets a 404 and is recorded in `unmocked`. The MLS sync
    test asserts that list is empty, so a new endpoint fails loudly. Add a route in
    `SLEEPER_FIXTURES` and a file in the generator.
  - Everything else (Google Fonts, MathJax, Ko-fi, LeagueLogs, Google Sheets, headshot
    images) is aborted.
  - The clock is fixed at 2026-09-15T16:00Z.
- A test fails on any uncaught exception, any `console.error`, any local HTTP status 400 or
  higher, or the fatal boot banner (`#mds-boot-error`). `openApp()` checks this right after
  load, so a broken import reports the missing file (for example `HTTP 404: /lineup/dbx.js`).
- Seeded states: `seedMds()` pastes `fixtures/rankings.csv` (24 players) and makes 5 picks.
  `seedMls()` syncs the fixture league by league ID.
- Tabs are opened with `window.showTab(id)` (MDS/MLS) or `window.switchTab(id)` (T-Score).
  These are the same functions the nav buttons call. One test also clicks a real bottom-nav
  button.
- Coverage: 14 smoke tests and 10 screenshot tests (40 PNGs) across desktop (1280×900) and
  phone (390×844). The MLS matchup simulator runs in its Web Worker in the smoke test, but its
  output isn't screenshotted because it's random.

### Known gaps (good follow-ups, not blockers)

- MLS has no ranking set loaded in the seeded state, so rank-dependent UI (power rankings,
  scout results, "Unranked" badges replaced by ranks) is only covered in its empty form.
  Chunks 3C–3E would benefit from seeding an MLS rankings upload first.
- No test covers backup/restore. Chunk 1B's card asks for a round-trip check.
- `tests/`, `scripts/` and `docs/` are served publicly by Cloudflare Pages, because the site
  deploys the repo root with no build output directory. This is harmless (about 9 MB of
  baselines). To exclude them, point Pages at an output directory, which needs a build step.

## Entries

### 0A — Smoke tests, screenshot baselines, precache checker

- Added `tests/` (Playwright 1.56.1 in its own `package.json`, so the repo root still has
  none and Cloudflare Pages behaves exactly as before), `scripts/check-precache.mjs`, and
  this log.
- `check-precache` fails on: a precached path missing on disk, a script/stylesheet/import/
  `new Worker()` target that a precached page loads but isn't precached, and a precached
  JS/CSS file that nothing loads. I verified it by breaking `sw.js` on purpose, then restored it.
- Housekeeping: removed the duplicated README intro and updated its project structure.
  `.vscode/settings.json` stays tracked; the rest of `.vscode/` is now ignored. The old
  `.gitignore` ignored the whole folder even though one file was tracked.
- No app code changed.
- Observed, not changed: with the fixture league synced, the Scout tab still shows the "Sleeper
  Sync Required" banner. This may be a real quirk or caused by the fixture data (for example
  the "Sync Sleeper Waivers & Trades" step was never run). Check before treating it as a bug.
  The DEF fixture shows an "R" rookie badge because the fixture gives it `years_exp: 0`.
- Next: 0B (unit tests), then 1A.

### 0B — Characterization unit tests for the pure modules

**No app files changed.** Also wired the unit tests into the existing checks: `npm run check`
in `tests/` now runs `node --test` between check-precache and Playwright, `npm run unit` runs
them alone, and the README's check list includes `node --test`. Playwright's
`testMatch: /.*\.spec\.mjs$/` doesn't match `*.test.mjs`, so the two runners don't overlap.

Added:

| File | Covers |
|---|---|
| `tests/unit/statsEngine.test.mjs` | `lineup/statsEngine.js`: every export, all four boom/bust tiers, threshold boundaries, the fallback CV, `actualScore` short-circuit |
| `tests/unit/waiverScanner.test.mjs` | `lineup/waiverScanner.js`: rank-display re-derivation, scan ordering, free-agent filtering, `fillLineup` slotting rules, every `checkAgainstLineup` status |
| `tests/unit/rankingsParser.test.mjs` | `lineup/rankingsParser.js`: vertical, headerless, per-position and horizontal layouts; title lines; odd headers (padded, upper-case, FantasyPros `RK`/`TIERS`/`PLAYER NAME`); SoS; every diagnostic reason; xlsx notes tabs; failure paths |
| `tests/unit/names.test.mjs` | `normalizeName` / `isNameMatch` from `js/utils.js`, including every `NAME_ALIASES` pair (it fails if an alias is added without a test row) |
| `tests/unit/helpers/loadUtils.mjs` | Runs `js/utils.js` in a `node:vm` context with a permissive DOM stub, and returns `normalizeName`, `isNameMatch`, `findCsvQuoteProblem`, `NAME_ALIASES` |
| `tests/unit/helpers/parserEnv.mjs` | Stand-ins for `window`, `Papa`, `XLSX` and `FileReader`, which the parser reads as globals |

I checked the suites by mutating a scratch copy of the modules. Changing a boom comparison to
`>=`, letting SoS keep decimals, changing `MAX_TITLE_ROWS`, editing an alias, changing
`FALLBACK_CV` and swapping FLEX/SFLEX in `SLOT_ORDER` each made at least one test fail.

#### Conventions

- Unit tests go in `tests/unit/*.test.mjs` and helpers in `tests/unit/helpers/`. Helper names
  don't match Node's default test globs, so they aren't run as tests. `*.spec.mjs` (Playwright)
  doesn't match those globs either.
- Each suite imports its module by relative path in one place, near the top. After a move,
  only that import line changes.
- Tests that pin odd behavior are named `CURRENT BEHAVIOR: ...`. A deliberate fix updates the
  test and says so here. A pure move must leave them passing.
- The Papa stub is not PapaParse. It splits simple unquoted CSV the way Papa does with
  `header: false, skipEmptyLines: true`, and it throws on quoted input. When a test needs
  Papa output that plain splitting can't produce, such as quote errors, it passes
  `papaResult` verbatim. Real Papa parses File input asynchronously, but the stub is
  synchronous, so multi-file batches always finish in upload order in these tests.

#### When later chunks move these modules

- **1A** (utils.js split): point `UTILS_PATH` in `helpers/loadUtils.mjs` at whatever still
  defines these as plain-script globals. If `normalizeName`/`isNameMatch` become an ES module
  (`js/shared/names.js`), import them directly in `names.test.mjs` instead.
  `NAME_ALIASES` needs to stay reachable for the coverage check: export it, or read it the
  way the helper does now. `parserEnv.mjs` also takes `findCsvQuoteProblem` from that helper.
- **1B**: `rankingsParser.js` → `js/shared/rankings/parse.js`. Update the import in
  `rankingsParser.test.mjs`. If `parse.js` imports `normalizeName` instead of reading
  `window.normalizeName`, the `window.normalizeName` stub in `parserEnv.mjs` is no longer
  used but does no harm.
- **2C**: add MDS's title-line inputs to `rankingsParser.test.mjs` before merging
  `findHeaderRowIndex`/`stripTitleLines` in.
- **3C**: update the `waiverScanner.js` import. **3F**: update the `statsEngine.js` import.

#### Behavior that looked wrong (tested as-is, not fixed)

1. **Boom/bust thresholds are strict** (`statsEngine.js`). The comment describes boom as
   "20+ points from a WR", but the empirical count uses `> boomThreshold`. Exactly 20 (WR/RB),
   24 (QB) or 15 (TE) is not a boom. Exactly at the bust line is not a bust either (`<`).
2. **Pos Rank cells like `WR2` are ignored** (`rankingsParser.js`). An explicit Pos Rank
   column is read with `parseInt`, so the common `WR2`/`RB14` format gives NaN. The row then
   falls back to the overall rank, as if the column weren't there. Only bare numbers work.
3. **SoS values keep only their digits** (`rankingsParser.js`). The value goes through
   `.replace(/[^0-9]/g, '')`, so `4.5` becomes `"45"` and `-2` becomes `"2"`. Values are
   stored as strings.
4. **FantasyPros headers are only partly recognized** (`rankingsParser.js`). `RK` is in
   `KNOWN_NON_NAME_HEADERS` but isn't used as a rank column, and `TIERS` isn't `tier`. Rank
   then comes from row order, which is right only when the file is sorted, and tiers are
   dropped. `SOS SEASON` isn't read as SoS.
5. **Position-named name headers depend on upload mode** (`rankingsParser.js`).
   `VALID_NAME_HEADERS` includes `quarterback`, `running back` and `flex` for per-position
   lists. In a single-file upload, those headers switch on the horizontal layout, which finds
   no `... player` column and reports `no-name-column`. `Wide Receiver`, `Tight End`,
   `Kicker` and `Defense` work in both modes.
6. **Horizontal sheets: FLEX overwrites rank and tier** (`rankingsParser.js`). The FLEX
   column sets `rank` and `tier`. Current exports have no `FLEX Tier` column, so any player
   listed under FLEX loses the tier from their position section (it becomes `null`). QBs
   (and K/DEF) get `rank` equal to their positional rank. waiverScanner's comments already
   account for that, so it may be intended, but it's recorded here.
7. **Name suffix stripping has no word boundary** (`js/utils.js`). The regex
   `(jr|sr|iii|ii|iv|v)$` runs after spaces are removed, so any surname ending in those
   letters is cut: `Ivanov` becomes `ivano`. Two different players could collide.
8. **`isNameMatch` matches two names that both normalize to `""`** (`js/utils.js`). The
   falsy check runs on the raw inputs, so `isNameMatch('Jr.', '123')` is `true`.
9. **`fillLineup` ignores slot types it doesn't know** (`waiverScanner.js`). Slots outside
   `SLOT_ORDER` (for example IDP `DL`, or `BN`) are dropped from `starters` without a
   warning. mls.js builds its slot requirements from the app's own types (REC_FLEX and
   WRRB_FLEX count as FLEX, SUPER_FLEX as SFLEX; see `autoReqs` in mls.js), and the scanner
   passes `st.slot.replace(/[0-9]/g, '')`, so this probably can't happen today. I only
   grepped this and didn't trace it fully. If an unknown slot did get through,
   `checkAgainstLineup` could name that slot's player as "displaced".

#### Checks run

`node scripts/check-precache.mjs` OK. `node --test` 117/117 from both the repo root and
`tests/`. `cd tests && npm run check` passes: 24 Playwright tests, screenshots unchanged.

#### Not done / for later chunks

- No `CACHE_NAME` bump and no `sw.js` change: the only new files are tests and docs, which
  aren't served or precached.
- The parser's xlsx path uses an `XLSX` stub, not real SheetJS. Real-file fidelity, such as
  how SheetJS writes dates or merged cells to CSV, isn't covered.
- The unit tests use a Papa stub so that `node --test` needs no `npm install`. 0A installs the
  real `papaparse` 5.4.1 in `tests/node_modules`. A later chunk could run the parser
  fixtures through it as well, which would cover quoting and tokenization. That would make
  those tests depend on the install.
- 0A and 0B share the branch `perf/render-storage-pass`: 0B was rebased onto 0A's commit
  there, so merging that branch merges both chunks.
- Next: 1A. It must update `tests/unit/helpers/loadUtils.mjs` (see above).

### 1A — Split utils.js into boot.js and shared modules

`js/utils.js` is gone. Its code was cut by line range with a script, located by its
`// --- SECTION ---` comments. I checked that every non-blank line of utils.js landed in
exactly one new file; the only dropped line is the `// --- SHARED UTILITIES ---` title. No
function body changed. The only rewritten lines are declarations: `window.x = function` became
`export const x = function`, and `function normalizeName` / `isNameMatch` / `dismissBanner`
and `const NAME_ALIASES` gained `export`. Each new file starts with a short "moved from
utils.js" header. The moved comments still say "this file" / "utils.js" and weren't edited.

| New file | From utils.js |
|---|---|
| `js/boot.js` (plain script) | APP RESILIENCE block: `readJSON`, `markAppReady`, fatal banner, error listeners |
| `js/shared/names.js` | `NAME_ALIASES`, `normalizeName`, `isNameMatch` (+ cache) |
| `js/shared/net.js` | NETWORK FETCH WITH A TIMEOUT: `mdsFetch`, `MDS_LONG_FETCH_TIMEOUT_MS` |
| `js/shared/html.js` | HTML ESCAPING: `escapeHtml` |
| `js/shared/rankings/diagnostics.js` | RANKINGS UPLOAD DIAGNOSTICS + CSV QUOTE DAMAGE: `formatRankingsDiagnostic`, `findCsvQuoteProblem` |
| `js/shared/ui/toast.js` | TOAST NOTIFICATIONS: `showToast`, `setToastsSuppressed` |
| `js/shared/ui/confirm.js` | SHARED IN-APP CONFIRM DIALOG: `showConfirm` |
| `js/shared/ui/focusTrap.js` | FOCUS TRAPPING FOR OVERLAYS: `createFocusTrap` |
| `js/shared/ui/tooltips.js` | TOOLTIPS (side effects only) |
| `js/shared/ui/fileDrop.js` | DRAG-AND-DROP FILE UPLOAD: `enableFileDrop` + the page-wide stray-drop guard |
| `js/shared/ui/scriptLoader.js` | ON-DEMAND SCRIPT LOADING: `loadScriptOnce`, `ensureHtml2Canvas`, `loadSheetJS` |
| `js/shared/ui/banners.js` | `dismissBanner`, `dismissBannerAndReveal`, the DOMContentLoaded hide-if-dismissed pass |
| `js/shared/ui/feedbackForm.js` | `injectFeedbackForm` + its DOMContentLoaded hook (they were 200 lines apart) |
| `js/shared/ui/scrollShadows.js` | SCROLL-SHADOW CUE FOR WIDE TABLES |
| `js/shared/ui/flashButton.js` | FLASH BUTTON FEEDBACK: `flashButton` |
| `js/shared/ui/tabHash.js` | TAB DEEP LINKS: `getTabFromHash` |
| `js/shared/globals.js` | New. Imports all of the above and assigns the `window.*` names |

The card didn't name a home for the last five rows or for the rankings diagnostics. Move them
if a later chunk finds a better place.

#### Load order (all three pages)

`<script src="…/js/boot.js" defer>` then `<script type="module" src="…/js/shared/globals.js">`,
in the exact spot where the utils.js tag was, so before `mds.js` / `mls.js` / in T-Score's
`<head>`. boot.js keeps utils.js's `defer`. Module scripts run in document order with defer
scripts, so globals.js has assigned everything before mds.js (defer) or mls.js (module) runs,
and before DOMContentLoaded. The T-Score inline script runs during parsing and only touches
these globals from DOMContentLoaded handlers or click handlers, so nothing changes for it.
globals.js imports modules in their old utils.js order, so the load-time side effects
(DOMContentLoaded listeners, drop guard, tooltip delegation) register in the same order.

#### Conventions

- **Shared modules don't import each other yet.** Bodies that called `window.showToast`,
  `window.createFocusTrap` or `window.loadScriptOnce` still do; those calls happen at call time,
  after globals.js has run. Switching them to imports would change bodies, so it waits for a
  later chunk (5D or whoever touches them).
- **New shared code goes in `js/shared/`, exported.** Add a `window.*` line to globals.js only
  for something a non-module caller (mds.js, inline handlers, the T-Score inline script) needs.
  Add the file to `sw.js` PRECACHE_ASSETS too: globals.js is a module graph, so one uncached
  import kills every shared helper on a first offline load.
- `lineup/*.js` still read `window.normalizeName` etc. through their shims. 1B replaces those
  with imports from `js/shared/names.js` and friends.

#### window.* check

I loaded `/`, `/lineup/` and `/t-score/` from main and from this branch in Chromium and diffed
`Object.getOwnPropertyNames(window)`. Nothing is new. Every explicit `window.x =` from utils.js
is still there, plus `normalizeName`, `isNameMatch` and `dismissBanner`. Those three were
implicit globals (classic-script function declarations) that callers use as bare names.
Twelve implicit globals are gone. They were internal helpers, and a grep finds no reference
outside utils.js (the two `dialogMessageHTML` hits in mls.js are comments):
`buildConfirmDialog dialogMessageHTML escapeForDialog getFocusableElements getToastElement
hideToast initScrollShadows injectFeedbackForm mdsFetchServiceName mdsFetchSignal
pauseToastTimer resumeToastTimer`. utils.js's top-level `const`/`let`s (`NAME_ALIASES`,
`MDS_FETCH_TIMEOUT_MS` …) were never window properties, and no other script used them.

Also checked by hand on both builds: T-Score's Refresh with Google blocked gives the same error
toast and re-enables the button; its inline `tscoreNormalize` reaches the shared
`normalizeName`; `showConfirm` opens with focus on Cancel and Escape resolves `false`. With
`js/shared/ui/toast.js` forced to 404, boot.js shows the fatal banner on all three pages.

#### Other changes

- `sw.js`: `/js/utils.js` replaced by boot.js, globals.js and its 15 imports. CACHE_NAME
  `v2.8.39` → `v2.8.40`.
- Unit tests: `names.test.mjs` imports `js/shared/names.js` directly, and `parserEnv.mjs`
  imports `normalizeName` and `findCsvQuoteProblem` from js/shared. I deleted
  `tests/unit/helpers/loadUtils.mjs` (the node:vm loader), since nothing needs it now.
- The HTML comments that pointed at utils.js now point at the new files. README `/js` line updated.

#### Checks run

`node scripts/check-precache.mjs` OK (34 precached). `node --test` 117/117.
`cd tests && npm run check`: 24 Playwright tests pass, screenshots identical (no baseline changed).

#### Left for later chunks

- Comments in `js/mds.js`, `lineup/mls.js`, `lineup/rankingsParser.js`, `sleeperApi.js` and
  `marketDataApi.js` still say "utils.js". I didn't touch them: rule 3, and those files move in
  1B/2x/3x. Fix them as each file moves (grep `utils.js`).
- The "stale cached utils.js" fallbacks at the top of mds.js/mls.js stay as they are (5D).
- Next: 1B.
