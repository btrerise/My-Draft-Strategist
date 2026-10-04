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
- `npm run compare-css` (in `tests/`, added in 4D) is opt-in and not part of `check`: it compares every
  element's computed style between `origin/main` (or `COMPARE_REF=<ref>`) and the working tree, in about
  7 minutes. Use it for any change that must not be visible, such as moving CSS. See the 4D entry.

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
    League" for user `mds_test`, 2026 week 2. Edit the generator, not the JSON. Since 3G the
    player map also has six free agents (on no roster; `tests/fixtures/rankings-waivers.csv` ranks
    them), and each team's week-2 matchup lists Sleeper starters, so the in-app simulator runs end
    to end.
  - A Sleeper URL with no fixture gets a 404 and is recorded in `unmocked`. The MLS sync
    test asserts that list is empty, so a new endpoint fails loudly. Add a route in
    `SLEEPER_FIXTURES` and a file in the generator.
  - Everything else (Google Fonts, MathJax, Ko-fi, FantasyCalc, Google Sheets, headshot
    images) is aborted. `/api/ffc/*` (the Cloudflare Pages Function added in 7A) isn't run by
    `serve.mjs`, so it 404s unless a spec stubs it (`stubFfc` in `mds-sync.spec.mjs`).
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
  phone (390×844), plus 2 backup → restore round trips (`backup.spec.mjs`, added in 1B), 9
  MDS network tests (`mds-sync.spec.mjs`, added in 2C, FFC cases rewritten in 7A: player-map
  cache, Quick-Start, ADP sync, live Sleeper draft, error toasts), 1 MLS market test
  (`mls-market.spec.mjs`, 7A) and 3 MLS league-entry tests (`mls-leagues.spec.mjs`, 3B: Import
  All Leagues, the Draft Strategist roster handoff, dismissing it) and 1 MLS Scout test
  (`mls-scout.spec.mjs`, 3C: rankings upload, Scan Pasted List in both scopes, Auto-Find in both
  lenses, a trade scout) and 1 MLS ranking-set test (`mls-rankings.spec.mjs`, 3D: one upload applied
  to a second league from the preview, then a third through "Choose leagues...") and 2 MLS keyboard
  tests (`mls-keyboard.spec.mjs`, 3E: tab shortcuts, Escape, lock/undo/redo/swap by keyboard and where
  focus lands after the lineup rebuilds) and 1 MLS simulator test (`mls-sim.spec.mjs`, 3F: fixed
  teams through the real UI module and Web Worker with `Math.random` seeded, exact numbers pinned)
  and 3 MLS Waiver Insights tests (`mls-waiver-insights.spec.mjs`, 3G: the in-app simulator with
  Waiver Insights on, after a Scout scan, in a fresh page, and with no free agent that has a position)
  and 3 T-Score Refresh tests (`tscore-refresh.spec.mjs`, 4B: Google Sheets stubbed with small CSVs,
  then the cached render on reload; an HTTP 500 and a blocked request for the error path).
  Each runs at both widths: 78 Playwright tests in all. `seedSimRandom` and `loadMlsRankings` in
  `helpers.mjs` seed the simulator and upload rankings for any spec. The smoke test's simulator run
  only checks that the results box isn't empty; `mls-sim.spec.mjs` and `mls-waiver-insights.spec.mjs`
  check the numbers.

### Known gaps (good follow-ups, not blockers)

- MLS has no ranking set loaded in the seeded state, so rank-dependent UI (power rankings,
  scout results, "Unranked" badges replaced by ranks) is only covered in its empty form.
  Chunks 3C–3E would benefit from seeding an MLS rankings upload first. (3C's `mls-scout.spec.mjs`
  uploads the fixture rankings through the real file inputs; reuse its `loadRankings` for 3D/3E.)
- ~~No test covers backup/restore.~~ Covered since 1B by `tests/backup.spec.mjs` (round trip in
  both apps).
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

### 1B — Move lineup modules to js/shared; storage-key registry

Moved with `git mv`, so `git log --follow` works and the diffs are small. Five of the moved
files use CRLF line endings; I kept them that way (watch out: Python's text mode or an editor
can silently convert a whole file to LF, which shows up as a whole-file diff).

| From | To | Edits beyond the import path |
|---|---|---|
| `lineup/db.js` | `js/shared/storage/idb.js` | header comment only |
| `lineup/sleeperApi.js` | `js/shared/api/sleeper.js` | comment: mdsFetch now comes from net.js/globals.js |
| `lineup/sleeperService.js` | `js/shared/api/sleeperStats.js` | imports `../storage/idb.js` |
| `lineup/marketDataApi.js` | `js/shared/api/market.js` | `window.normalizeName` shim → `import { normalizeName } from '../names.js'` |
| `lineup/rankingsParser.js` | `js/shared/rankings/parse.js` | same shim replacement; three "js/utils.js" comments repointed |
| `t-score/tscore_data.js` | `js/shared/data/tscore.js` | header comment only; still a plain script defining `tScoreData` |

I kept Sleeper as two files (`sleeper.js` = the endpoint client and the IndexedDB player-map
cache, `sleeperStats.js` = weekly stats/projections/score history on `idb.js`). The card allowed
either. Merging them would mean rewriting one file's import of the other, and 2C will likely add
endpoints to `sleeper.js` anyway.

`mls.js` imports the new paths (`../js/shared/...`). `monteCarloUi.js`, `statsEngine.js`,
`waiverScanner.js` and `worker.js` stay in `lineup/` (3C/3F). `window.mdsFetch` and
`window.showToast` are still read through `window.` inside the moved modules: the card only
asked for the `normalizeName` shims, so switching them to imports is left for later (see 1A's
"shared modules don't import each other yet").

**tscore.js: only one page loads it.** The card says "both pages load it from the new path",
but only `/` (for mds.js) ever loaded `tscore_data.js`. The T-Score page builds its tables from
Google Sheets and its own `tscore_page_cache`, and never referenced the file. I updated the one
`<script>` tag in `/index.html` and did not add it to the T-Score page, since that would be new
behavior. 2A decides whether it becomes a module export.

#### Storage-key registry: `js/shared/storage/keys.js`

- Lists every localStorage key in use (found by grepping every literal and key builder across
  `js/`, `lineup/`, `t-score/` and the HTML), grouped `mds` / `mls` / `unowned`, plus the
  prefixes and both IndexedDB databases (`LineupStrategistDB`/`sleeperData`,
  `mls_sleeper_cache`/`players`). No key was renamed. The call sites still spell their keys
  inline; the registry is a list, not yet their source.
- `isMdsOwnedKey` / `isMlsOwnedKey` are the filters from `getMdsOwnedKeys()` (mds.js) and
  `getMlsOwnedKeys()` (mls.js), moved verbatim except that the string literals became the
  registry's constants. Both functions now call `Object.keys(localStorage).filter(<predicate>)`.
  Backup, Restore, Hard Reset and Factory Reset all go through them.
- mls.js imports `isMlsOwnedKey`. mds.js is a classic script, so `globals.js` assigns
  `window.isMdsOwnedKey`, which is the only new window name (checked: exactly +1 own property
  per page compared with main).
- **`js/boot.js` keeps its own copy of both filters on purpose.** Its rescue backup has to work
  when no module loaded, so it can't import keys.js. keys.js says so; keep them in step by hand.
- Found on the way, unchanged: `shared_sleeper_league_id` is a legacy key MLS only deletes now.
  `mds_tscore_cache*` and `tscore_page_cache` are written by the T-Score page and backed up by
  neither app. For MDS, the `!== 'mds_handoff_roster'` exclusion is redundant, since that key
  doesn't start with `ds_`, but it's kept as-is.

#### New test: `tests/backup.spec.mjs`

Fills the gap 0A noted. For each app (desktop + phone) it seeds state, plants the other app's
keys plus `mds_handoff_roster`, clicks the real Export Backup, checks the file holds exactly the
app's keys (using an independent copy of the filter, so a change to keys.js fails here), drops
one owned key and adds a junk one, restores through the real file input and confirm dialog, and
after the reload checks values, the junk key's removal, untouched foreign keys, and the UI.
MLS's Backup & Restore is a collapsed `<details>` on Setup, so the test opens it. MLS consumes
and removes `mds_handoff_roster` on page load, so that key's survival is only asserted on MDS.

Verified: the spec passes unchanged against main's code (behavior identical); it fails if
keys.js drops the `mls_` prefix or `mds_show_headshots`.

#### Other changes

- `sw.js`: the six paths swapped, `keys.js` added. CACHE_NAME `v2.8.40` → `v2.8.41`. No visible
  change, so no app version label bump.
- Unit tests: `rankingsParser.test.mjs` imports `js/shared/rankings/parse.js`. `parserEnv.mjs`
  still installs `window.normalizeName`, which is unused now but harmless.
- README project-structure lines for `/js` and `/t-score`.

#### Checks run

`node scripts/check-precache.mjs` OK (35 precached). `node --test` 117/117.
`cd tests && npm run check`: 28 Playwright tests pass (24 existing + 4 new), screenshots
identical (no baseline changed).

#### Left for later chunks

- **2A**: tScoreData is still a global from a plain script. Make it a module export or keep it
  global, as the 2A card says.
- **2C**: add MDS's Sleeper calls (user, draft, draft picks) to `js/shared/api/sleeper.js`.
- Switching call sites to the registry constants and replacing `window.mdsFetch`/`showToast`
  in shared modules with imports. Neither is assigned to a chunk yet; 5D is the natural place.
- Comments in `mls.js` that say "see rankingsParser.js" / "sleeperApi.js" are left (rule 3:
  I only changed the import lines and two "Moved to …" pointers). Fix them as 3x moves code.

### 1B follow-up — Line endings normalized to LF (outside the runbook, commit `4f12339`)

**Why this happened outside a chunk.** During 1B, an edit script silently converted five
CRLF (Windows line ending) files to LF, which made each one look completely rewritten in the diff. I caught
it and restored them before committing (see the 1B entry). Afterwards the repo owner asked
whether the endings should be made consistent everywhere, and approved doing it as its own
small change right after 1B merged (PR #140, merge commit `759a1c8`) and **before** the
parallel tracks (2A / 3A / 4A) start. It isn't in the runbook. Doing it before the tracks
start means no other session's branch has these files open, so nobody gets a whole-file merge
conflict. It's separate from 1B because a file move and a full-file rewrite in one squashed
commit can stop Git from recognizing the move.

**What changed.**
- New `.gitattributes`: `* text=auto eol=lf`, plus explicit `binary` for images and fonts.
  Git now stores every text file with LF and checks it out with LF on every OS. Someone
  editing on Windows with an editor that writes CRLF gets converted back to LF on commit,
  so this can't come back.
- Renormalized the only 10 tracked files that were CRLF. Each was CRLF throughout (none
  mixed): `js/shared/api/{market,sleeper,sleeperStats}.js`, `js/shared/rankings/parse.js`,
  `js/shared/storage/idb.js`, `lineup/{monteCarloUi,statsEngine,worker}.js`, `robots.txt`,
  `.vscode/settings.json`. The other 80 text files were already LF. Binaries (42, including
  every screenshot baseline) are detected as binary and untouched. The four SVGs are
  one-line files with no line endings.
- `git diff --ignore-cr-at-eol` against main shows **no content change** in those 10 files.
  Their diff is every line, but only the invisible line ending changed.
- `sw.js` CACHE_NAME `v2.8.41` → `v2.8.42`. No file was added or renamed, so rule 6 doesn't
  require it, but sw.js's own deploy note says to bump on every deploy, and served JS bytes
  changed.

**For later sessions.**
- `git blame` on those 10 files will point at this commit for every line. Use
  `git blame --ignore-rev 4f1233969225efd99826c52d7af2b8d5e4e36457`, or list that hash in a `.git-blame-ignore-revs` file
  if you want it permanent.
- A branch that was cut **before** this commit and edits one of those 10 files will conflict
  on every line when merging main. Re-cut from main instead (rule 9 already says to branch
  from the latest main).
- New files are LF automatically. No editor setting needed.

**Checks run.** `node scripts/check-precache.mjs` OK, `node --test` 117/117,
`cd tests && npm run check` (28 Playwright tests, screenshots identical).

### Planned as runbook chunks 6A / 6B — Rename storage keys to consistent prefixes

**Why this is here.** After 1B, the repo owner asked to make the localStorage prefixes
consistent: Lineup Strategist uses both `mls_` and `mds_season_`, and Draft Strategist uses
`ds_` while its app name is "MDS". The original runbook had no chunk for this, and rule 4
forbade it. The owner asked for the plan to be recorded here, then approved adding it to the
runbook. Nothing has been renamed yet.

**Runbook changes (made by the 1B session, at the owner's request, after #140 merged):**
- New **Phase 6 "Storage keys"** with two cards: **6A** "Route every storage key through
  keys.js" (move only; needs 2C and 3F) and **6B** "Rename storage keys to mds_ / mls_
  prefixes" (behavior change; needs 6A). A "Storage keys" lane and a row in the sizing
  table were added too; the job count went from 19 to 21.
- **Rule 4 amended:** "every localStorage and IndexedDB key (until 6B, which renames the
  localStorage keys on purpose)". The exception covers only 6B, and only localStorage keys.
  Every other chunk still must not rename a key.
- **Order-and-tracks note:** start the MDS, MLS and Styles tracks only after the line-ending
  change ("1B follow-up" above) is on main.
- The 6A/6B cards carry the essentials. The detail below (the old → new table, the risks)
  is what they point to, so keep this entry in step with them.

**Agreed naming (owner's choice, which I agreed with).** Prefixes per app:
- Lineup Strategist: `mls_`.
- Draft Strategist: `mds_`.

| Today | Proposed |
|---|---|
| `mds_season_*` (13 keys: `active_league`, `early_teams`, `leagues`, `locks_map`, `manual_bench`, `manual_starters`, `market`, `market_updated`, `ros`, `ros_updated`, `sos`, `weekly`, `weekly_updated`) | `mls_*` with the same suffix |
| `ds_*` (every MDS key, including dynamic `ds_players_<draftId>`, `ds_storage_version`, `ds_drafts_premigration_backup` and the `ds_hide_*_banner` keys) | `mds_*` with the same suffix |
| `mds_show_headshots` | unchanged (already `mds_`) |
| `mds_handoff_roster` (MDS → MLS hand-off) | a cross-app name, e.g. `shared_handoff_roster`, so it can't fall under either app's prefix |
| `mds_tscore_cache`, `mds_tscore_cache_updated` (written by T-Score, read by MDS) | `tscore_cache`, `tscore_cache_updated`, grouped with `tscore_page_cache` |
| IndexedDB `LineupStrategistDB`, `mls_sleeper_cache` | leave as they are (re-fetchable caches; renaming only throws the cache away) |

Checked in 1B: no proposed name collides with an existing key. Full key list:
`js/shared/storage/keys.js`.

**Why it's more than find-and-replace.** These names are where users' saved data lives.
- **Migration.** On first load the new code must copy every old key to its new name, or
  existing users open an empty app. Follow MDS's existing `ds_storage_version` migration
  pattern (`js/mds.js`, DRAFT PLAYER-POOL STORAGE). During a transition period, copy
  instead of moving, or keep reading the old name as a fallback. Service-worker
  stale-while-revalidate and already-open tabs can briefly run old code that only knows
  the old names. Delete the old keys in a later release.
- **Order.** MLS must leave `mds_season_` (and the hand-off and T-Score keys must be
  renamed) **before** MDS's filter becomes "starts with `mds_`". Otherwise MDS backups and
  Hard Reset would scoop up MLS's data.
- **Old backup files.** Backups already downloaded contain old names. Restore
  (`importMdsSettings` / `importMlsSettings`) needs a permanent old→new translation table.
- **`js/boot.js`** keeps its own copy of both filters (see 1B) and must be updated too.
- **Precedent for the risk.** A comment at `lineup/mls.js` (search `'mls_season_market'`)
  records a past bug where data was saved under one name and read under another, so it
  silently vanished on reload.

**The split (runbook cards 6A and 6B, after Phases 2 and 3).**
1. *6A: keys through the registry (move only).* Replace every inline key string with
   `keys.js` constants. This is easiest once MDS storage lives in `js/mds/storage.js` (2A)
   and MLS state in `js/mls/state.js` (3A–3F). Key names inside HTML attributes (the
   `dismissBanner('ds_hide_…')` handlers) may stay as text; 6A lists them for 6B. `boot.js`
   keeps its literal filters, and 6A adds a unit test checking them against `keys.js`.
2. *6B: rename (behavior change).* Change the names in `keys.js`, add the one-time migration,
   the restore translation table and the `boot.js` filter update. Extend
   `tests/backup.spec.mjs` with an old-format backup fixture and add a migration test
   (old keys in → new keys out, nothing lost, other app untouched). Bump CACHE_NAME.
   Keep the old keys after copying them; deleting them is a later release, once a
   CACHE_NAME bump has been live.

Users never see these names. The payoff is clarity for whoever works on the code, so it's
worth doing only with the migration done carefully.

### 2A — MDS to ES module; extract the first half

`git mv js/mds.js js/mds/legacy.js`, then the IIFE wrapper and its `'use strict'` were dropped
(modules are always strict, and mds.js already was). Everything above `// --- RENDER DRAFT MATRIX ---`
moved into the modules below. A script cut the code by line range and added `export` and `import` lines.
No other line was retyped or changed. I checked that every non-blank line of the old mds.js
appears exactly once across `js/mds/*.js`, once those two edits are undone. Indentation is unchanged
(the IIFE's 4 spaces), so a line from the old file greps the same in the new one.

| New file | From mds.js (by section marker) |
|---|---|
| `js/mds/main.js` | New. Entry point (`<script type="module">` in index.html, where the mds.js tag was). Imports `legacy.js` first, then holds the single `window.*` block: all 35 names mds.js assigned |
| `js/mds/compat.js` | The four stale-utils.js fallbacks at the top (`readJSON`, `escapeHtml`, `formatRankingsDiagnostic`, `findCsvQuoteProblem`). 5D deletes this file |
| `js/mds/storage.js` | DRAFT PLAYER-POOL STORAGE (v2), including the load-time `migrateDraftStorage()` call |
| `js/mds/state.js` | STATE MANAGEMENT + INITIALIZE DEFAULT DRAFT FALLBACK (`State`, `BYE_WEEKS_2026`, draft-profile helpers, `switchDraftProfile`), plus `draftPlayer` / `undoDraft` |
| `js/mds/pwa.js` | PWA & SERVICE WORKER |
| `js/mds/ui.js` | UI HELPERS (`debounce`, `toggleMenu`), plus the unmarked block after BACKUP & RESTORE: `showTab`, the `popstate` handler, `setPosFilter`, `toggleEditBar`, `toggleCardDetails`, `saveInlineEdit` |
| `js/mds/gestures.js` | GESTURE HANDLING |
| `js/mds/settings.js` | INITIALIZE SETTINGS INPUTS (`initSettingsUI`, `updateTotalRounds`, `updateMetaDisplay`, `saveSettings`, `resetPicksOnly`) |
| `js/mds/backup.js` | BACKUP & RESTORE (`getMdsOwnedKeys`, export, import, `hardReset`) |
| `js/mds/sleeperSync.js` | SLEEPER & MANUAL DRAFT CREATION, SESSION CACHE FOR SLEEPER'S STATIC DRAFT METADATA, the live-sync pill (`renderLiveSyncStatus`) and `toggleAutoSync` |
| `js/mds/queue.js` | `toggleQueue` + QUEUE REORDERING LOGIC |
| `js/mds/import.js` | FILE PARSING & DATA IMPORT |
| `js/mds/market.js` | LEAGUE LOGS INTEGRATION |
| `js/mds/legacy.js` | Everything from RENDER DRAFT MATRIX on, plus three call-out/tier helpers (below) |

**Placements that don't follow the markers exactly.** Some code sat under a section marker but doesn't
belong to that section, so I placed it by content:
- `showTab`, the back-button `popstate` listener and the four player-card handlers sat between
  BACKUP & RESTORE and the Sleeper section with no marker of their own. They went to `ui.js`. 2B can
  move the card handlers to `board.js` / `tracker.js` if it prefers.
- `draftPlayer` / `undoDraft` sat at the end of the Sleeper section. They went to `state.js`, next to
  `saveAndRenderDraftState`, which they call. `toggleQueue`, which sat with them, went to `queue.js`.
- `getCallOutLists`, `getCallOutStyle` and `getTierTrackerData` sat under QUEUE REORDERING but are
  render helpers for `buildPlayerCardHTML` / `renderBoard`. **They stay in legacy.js** for 2B's
  `tracker.js`.

#### The pattern (2B and 3A follow it)

1. **`window.x = function …` becomes `export const x = function …`** in its module, with the same body.
   `main.js` imports `x` and assigns `window.x = x;` in one block. That block is the only place a
   `window.*` name is created. Phase 5 deletes lines from it. Code that calls `window.x(...)` keeps
   doing so. A bare `x(...)` in another module now imports `x`.
2. **Every top-level name another module uses gets an `export` prefix, and nothing else.** Each module
   starts with a "Moved from js/mds.js in refactor chunk 2A" header, then one `import { … }` line per
   source module (names sorted, `legacy.js` last).
3. **Load order is set in one place: legacy.js's import list.** `main.js` imports `legacy.js` first.
   legacy.js imports every extracted module in the order its code sat in mds.js (side-effect-only
   `import './pwa.js'` where it uses nothing from it). ES modules evaluate their dependencies
   depth-first, so with this list the code that runs at load keeps its mds.js order:
   storage migration → `State` → PWA listeners → popstate → touch listeners → file-input listener →
   legacy's `DOMContentLoaded` init. The rest (settings, backup, sleeperSync, queue, market) only
   declares things. **One trap:** `state.js` must come **before** `storage.js` in that list. storage.js
   uses `State` (at call time), so if it were entered first it would pull state.js in and evaluate it
   first, building `State` from `ds_drafts` before the v2 migration ran. With state.js first, its
   import of storage.js makes storage.js evaluate first. storage.js's header says so. When 2B deletes
   legacy.js, move this import list to main.js (or init.js) unchanged.
4. **Rule 5 holds:** only `State`'s initializer (needs `readJSON`, from `compat.js`, which has no
   imports) uses another module's binding at load time. All other cross-module use happens at call time.
   I checked this with a parser rather than by eye. No load-time code calls a `window.*` name defined in
   mds.js, which matters because `main.js` now assigns those names only after every module has run
   (still before `DOMContentLoaded`).
5. **`let`s are reassigned only by their own module** (`menuFocusTrap` in ui, `lastAnnouncedSyncState` in
   sleeperSync, `draggedQueueIndex` in queue, `cachedEffectiveTScoreData` / `isQueueCollapsed` in
   legacy). Imported bindings are read-only, so keep it that way: a module that needs to set
   another module's `let` needs a setter, which is a code change.
6. **Shadowing:** a parameter or local with the same name as another module's top-level name must not
   become an import. The only case was `importMdsSettings(fileInput)` vs. import.js's `const fileInput`.

**How I did it (reusable for 2B/3A).** I ran `npm i acorn` in a scratch directory, outside the
repo, and wrote a throwaway Node script that:
- parsed the file and listed the top-level statements with their line ranges;
- assigned line ranges to modules and failed if a statement straddled two ranges or a non-blank line
  was left unassigned;
- collected each statement's identifier references, skipping non-computed property names;
- built the imports and exports from those references;
- simulated depth-first module evaluation from `main.js` to print the load order;
- flagged load-time cross-module references, nested declarations that shadow a top-level name, and
  assignments to top-level names.

After writing the files, a second script checked that every original line is present exactly once.
Grepping indentation doesn't work for finding top-level code in these files, because the original
indentation is inconsistent. **3A differs:** mls.js is already a module, so it has no strict-mode
change and no `'use strict'` to drop, but the rest applies.

**tScoreData stays a global.** `js/shared/data/tscore.js` is still a plain `defer` script that loads
before `main.js`. The only reader is `getEffectiveTScoreData()` in legacy.js, through
`typeof tScoreData !== 'undefined'`, which a module resolves to the same global lexical binding.
Making it a module export would change how it loads, for no gain in this chunk. Reconsider it in 2B,
when its reader moves.

#### Checks run

- `node scripts/check-precache.mjs` OK (48 precached). `node --test` 117/117.
  `cd tests && npm run check`: 28 Playwright tests pass, **screenshots identical** (no baseline changed).
- Manual draft, scripted against this branch **and** against main, with identical results on desktop
  and phone: paste rankings, then Pick / Taken ×2 / Pick / Taken through the real buttons (5 drafted,
  2 mine), real Undo button on the Team tab (4 drafted, 1 mine, "returned to pool" toast), queue a
  player, reload (picks and queue persist), hamburger menu open/close, then switch tabs and use the
  browser Back button (back to Tracker). No console errors.
- `Object.getOwnPropertyNames(window)` on `/` is identical to main (1,250 names). Nothing was added
  or lost.

#### Other changes

- `index.html`: `<script src="js/mds.js" defer>` → `<script type="module" src="js/mds/main.js">`, same
  position. Module scripts run in document order with defer scripts, so it still runs after boot.js,
  globals.js and tscore.js. Comments that pointed at js/mds.js now point at the new files.
- `sw.js`: `/js/mds.js` replaced by the 14 `js/mds/*.js` files. CACHE_NAME `v2.8.42` → `v2.8.43`.
  There's no user-visible change, so I didn't bump the app version label.
- README `/js` line.

#### Left for later chunks

- **2B:** the three call-out/tier helpers in legacy.js (see above); moving legacy.js's ordered
  import list when legacy.js goes; tScoreData (above).
- Comments inside the moved code still say "this file", "mds.js" or "utils.js". Comments in
  `js/shared/globals.js` (calls mds.js "a classic script"), `js/boot.js`, `js/shared/storage/keys.js`,
  `js/shared/html.js` and `lineup/mls.js` still name `js/mds.js`. I left them to keep this a pure move.
  Fix them when those files are next touched. `grep -rn "mds\.js"` finds them all.
  **Owned by 5D:** at the owner's request, the runbook's 5D card now includes a comment sweep
  (grep for `mds.js`, `mls.js`, `utils.js` and the old lineup/ file names in comments and point
  them at the current files, comments only). Anything still stale at 5D gets fixed there.
- `js/mds/*` modules still read the shared helpers through `window.` / bare globals (`showToast`,
  `mdsFetch`, `normalizeName`, `isMdsOwnedKey`…), not imports from `js/shared/`. Same reason as 1A's
  "shared modules don't import each other yet". 2C is the natural place for the API ones.

### 2B — MDS: extract the second half and delete legacy.js

`js/mds/legacy.js` is gone. A script cut it by line range (top-level statements found with acorn,
ranges placed by section marker) into the files below, and checked that every non-blank line of
legacy.js landed in exactly one new file. The only lines dropped are legacy.js's own two-line
"What's left of js/mds.js" note and its import block, which init.js now holds (see below). No
function body changed. Edits beyond the cut: `export` added to `renderDraftMatrix`,
`renderFantasyRoster` and `renderDraftRecap` (the only legacy-local names another file now
needs); a "Moved from ... in refactor chunk 2B" header and `import` lines in each new file; the
`from './legacy.js'` import lines in `main.js`, `state.js`, `storage.js`'s comment, `ui.js`,
`settings.js`, `sleeperSync.js`, `queue.js` and `market.js` repointed. Indentation is unchanged.

| New file | From legacy.js |
|---|---|
| `js/mds/tracker.js` | The player pool / queue / tier-tracker rendering: `getCallOutLists`, `getCallOutStyle`, `getTierTrackerData` (the three helpers 2A left above RENDER DRAFT MATRIX), the T-Score cache reader (`cachedEffectiveTScoreData`, `getEffectiveTScoreData`), `buildPlayerCardHTML`, `buildQueueCardHTML`, `isQueueCollapsed` + `toggleQueueCollapse`, `renderBoard`, `toggleHeadshots` |
| `js/mds/board.js` | RENDER DRAFT MATRIX (`renderDraftMatrix`) |
| `js/mds/team.js` | Team tab roster (`renderFantasyRoster`), which sat at the end of RENDER DRAFT MATRIX |
| `js/mds/handoff.js` | SEND ROSTER TO LINEUP STRATEGIST |
| `js/mds/recap.js` | `buildPickNumberIndex` / `getPickNumberForPlayer` (unmarked, just above the recap), DRAFT RECAP & ANALYSIS RENDERER, RECAP MATH TOGGLE HELPER |
| `js/mds/export.js` | TEAM EXPORT LOGIC (`exportTeam`; it uses no other module's names, so no imports) |
| `js/mds/affinity.js` | 5-COLOR AFFINITY SYSTEM (`cycleAffinity` only) |
| `js/mds/init.js` | INITIALIZATION (the `DOMContentLoaded` handler, which contains POWER-USER KEYBOARD SHORTCUTS and MOBILE COLLAPSE TOGGLE), the original mds.js file header, and legacy.js's ordered import list |

**Placements by content, not marker.** `getEffectiveTScoreData` sat under TEAM EXPORT LOGIC and
`buildPlayerCardHTML`/`buildQueueCardHTML`/`renderBoard` under 5-COLOR AFFINITY SYSTEM, but they are
pool rendering, so they're in tracker.js; affinity.js holds only `cycleAffinity`. `toggleHeadshots`
(after renderBoard, no marker; it toggles the body class the player cards read) is in tracker.js
too. The four player-card handlers 2A put in `ui.js` stay there: moving them wasn't needed.

#### Load order

`main.js` now imports `./init.js` first, where it used to import `./legacy.js`. init.js has
legacy.js's import list unchanged in order (named imports trimmed to what init.js uses; the rest
became side-effect imports), with the seven new modules appended. Simulated depth-first
evaluation: `compat → storage → board → team → recap → tracker → settings → state → pwa → ui →
gestures → backup → sleeperSync → queue → import → market → handoff → export → affinity → init →
main`. The new modules evaluate earlier than legacy.js did (state.js now reaches tracker.js), but
none of them has load-time code beyond `let x = null/false`, so the modules with load-time code
still run in mds.js order: storage migration → `State` → PWA listeners → popstate → touch
listeners → file-input listener → init's `DOMContentLoaded`. The state-before-storage trap from
2A still holds; storage.js's comment now names init.js. No shadowing, and no module assigns
another module's binding (same parser checks as 2A).

**tScoreData stays a global** (2A left this to 2B). Its only reader, `getEffectiveTScoreData`,
moved to tracker.js unchanged; turning `js/shared/data/tscore.js` into a module would change how
it loads.

#### Checks run

- `node scripts/check-precache.mjs` OK (55 precached). `node --test` 117/117.
  `cd tests && npx playwright test`: 28 pass, **screenshots identical** (no baseline changed).
- **Live sync against a stubbed draft**, run with a throwaway Playwright spec (not committed)
  against this branch **and** origin/main, desktop and phone, with identical JSON snapshots: stub
  `/v1/draft/<id>` and `/v1/draft/<id>/picks` (user from the fixtures), paste rankings, Sync Sleeper
  Draft with a draft URL (2 picks applied, Team and Board render), turn on the Setup Live Sync
  toggle (all three toggles checked, header `is-live`, announcer "Live sync on."), add 2 picks on
  the stub (the 3s poll applies them, including a synthesized unranked player), stop from the
  header button (toggles off, "Live sync off.", **0 picks requests in the 4s after stop**). No
  console errors.
- `Object.getOwnPropertyNames(window)` on `/` identical to main (1,249 names).

#### Other changes

- `sw.js`: `/js/mds/legacy.js` replaced by `init.js`, plus the seven new modules. CACHE_NAME
  `v2.8.43` → `v2.8.44`. No user-visible change, so no app version label bump.
- README `/js` line: describes `main.js` / `init.js` instead of legacy.js.

#### Left for later chunks

- Comments in the moved code still say "this file", "mds.js", "utils.js" or "tscore_data.js"
  (5D's comment sweep).
- `compat.js` (the stale-cache fallbacks) stays for 5D, as the card says.
- `js/mds/*` still reads shared helpers via `window.*` / bare globals; 2C replaces the Sleeper,
  market and parser ones.
- The live-sync check above isn't a committed test. If 2C wants it as a regression test for its
  Sleeper changes, add `draft/<id>` and `draft/<id>/picks` fixtures to
  `tests/fixtures/sleeper/make-fixtures.mjs` and `SLEEPER_FIXTURES` in `tests/helpers.mjs`.

### 2C — MDS uses the shared Sleeper, market and parser code (behavior change)

**What the user sees.**
- **The Sleeper player database (~5 MB) is now cached in IndexedDB for a day**, in the same
  `mls_sleeper_cache` database Lineup Strategist already used, and shared with it. Before, MDS
  downloaded it on every rankings upload/paste and every Quick-Start, even twice in a row. Now
  the first of those in a day downloads it and later ones (including after a reload, or after
  using Lineup Strategist) read it from IndexedDB. Uploads and Quick-Start are faster and work
  offline once the map is cached.
- **Trade-off:** the injury status and rookie flag MDS copies from that map can now be up to a
  day old (the age MLS already accepted; it matches Sleeper's "call at most once a day"
  guidance). A fresh download happens once the cache is 24 h old.
- **Quick-Start makes one request fewer.** It also fetched LeagueLogs' `/v1/players`, but only
  as a rookie-status fallback for rows with no Sleeper entry, and those rows are skipped before
  the fallback is read, so it never changed a result. The request and `playerMetaMap` are gone.
  Checked: Quick-Start builds the identical pool on main and on this branch from the same stubs.
- No wording changed. Every toast and button message is the same, including the error texts,
  which the shared functions now take as options where they differed between the apps. Live
  poll timing (3 s), the draft-metadata session cache and the "stalled" pill are unchanged.

**What moved where.**

| From | To | Notes |
|---|---|---|
| `js/mds/sleeperSync.js`: direct fetches of `user`, `draft`, `league`, `league/users`, `draft/picks` | `js/shared/api/sleeper.js` | New `getSleeperDraft`, `getSleeperDraftPicks` (they throw MDS's existing "Could not fetch Draft ID details." / "...picks." on a non-ok response). Extended, defaults unchanged for MLS: `getSleeperUser(username, { notFoundMessage })`, `getSleeperLeague(id, { nullIfNotOk })`, `getSleeperLeagueUsers(id, { nullIfNotOk })` |
| `js/mds/import.js` + `js/mds/market.js`: `players/nfl` fetches | `getSleeperPlayerMap()` (existing) | Both MDS callers already caught failures and fell back to `{}`; they still do |
| `js/mds/market.js`: LeagueLogs `/v1/market/<profile>` (Quick-Start, ADP sync) | `fetchLeagueLogsMarket(profileKey, { errorPrefix })` in `js/shared/api/market.js` | Split out of `fetchMarketConsensusData`, whose LeagueLogs branch now calls it. MDS needs raw rows with Sleeper IDs and the half-PPR profile, which `fetchMarketConsensusData` can't give, so it was extended this way rather than forked. ADP passes `errorPrefix: 'LeagueLogs Market Error'` to keep its toast |
| `js/mds/import.js`: `MDS_NAME_HEADERS`, `normalizeHeader`, `hasNameHeader`, `isBlankRow`, `filledCells`, `findHeaderRowIndex`, `stripTitleLines` | `js/shared/rankings/parse.js`, new section `TITLE LINES ABOVE THE HEADER ROW (DRAFT STRATEGIST)` | Cut by line range with a script and dedented 4 spaces (the old IIFE indent); bodies unchanged. The first four are exported and imported back by import.js. MDS's duplicate `const MAX_TITLE_ROWS = 10` was dropped in favour of parse.js's identical one |

`sleeperSync.js`'s `fetchSleeperMeta(url, opts)` became `fetchSleeperMeta(key, fetcher, opts)`:
same cache, same `force`/`shouldCache` rules, keyed by endpoint path (`user/<name>`,
`draft/<id>`, …) instead of the full URL. Its `required`/`errorMsg` options went away because
the required endpoints' shared functions throw those same messages themselves; the optional
league endpoints ask for `nullIfNotOk`, so a non-ok response still returns null and isn't cached.
A 200 response with a `null` body (what Sleeper sends for an unknown username) behaves exactly
as before.

**Why the two title-line scans weren't unified.** parse.js now has MLS's `dropTitleRows` and
MDS's `findHeaderRowIndex` side by side. They differ on purpose: MDS only reads a Player / Name /
Player Name column, while MLS also accepts position-named columns ("Quarterback") and treats
rows of known non-name headers ("Rank,Tm,Bye") as a header; MDS works on raw rows with blank
lines and falls back to the first 2+-cell row for its error message. Making one call the other
would change one app's results. A later chunk can unify them as a deliberate behavior change.

#### Tests

- `tests/unit/rankingsParser.test.mjs`: 15 new cases for MDS's title lines (written first and
  run against a scratch copy of the original import.js functions, where they all passed, then
  pointed at parse.js): header in row 0, blank rows first, title + blank + credit line, quoted /
  padded / upper-case headers, position-named columns not counting, the no-name-column fallback,
  empty input, the 11-row search depth with and without blank rows, `stripTitleLines` identity /
  cut / preview limit, and one with **real PapaParse** for quoted cells. That one runs only when
  `tests/node_modules` exists (`cd tests && npm install`) and is skipped otherwise, so plain
  `node --test` still needs no install. The `exports` test now lists parse.js's five exports
  (deliberate).
- `tests/unit/helpers/parserEnv.mjs`: the Papa stub now honours `skipEmptyLines` (without it,
  blank lines are `['']` rows, as real Papa gives), `preview`, and has `unparse`; it returns its
  result for string input. Checked against PapaParse 5.4.1. parse.js always passes
  `skipEmptyLines: true`, so the existing cases see no difference.
- New `tests/unit/market.test.mjs`: `fetchLeagueLogsMarket` and MLS's LeagueLogs path through
  `fetchMarketConsensusData` (same output and error wording as before), with a stubbed
  `window.mdsFetch`.
- New `tests/mds-sync.spec.mjs` (Playwright, desktop + phone), Sleeper and LeagueLogs stubbed
  in the spec: the player map is fetched once across two uploads and a reload and is in
  IndexedDB; Quick-Start's pool (order, posDisplay, ADP, rookie flag, Sleeper IDs, meta label)
  and its request list; Quick-Start and ADP error toasts; ADP applied by Sleeper ID; a live
  draft (URL-form draft ID, Sync, live toggle, a new pick of an unranked player applied by the
  3 s poll, user/draft/league/users requested once per forced sync and not on silent ticks, no
  polling after stop, board shows the pick); the unknown-user toast. **Run against main too:**
  the only failures were the two intended changes (a second `players/nfl` download, and the
  extra `/v1/players` request). Everything else, including the Quick-Start pool, matched.

#### Checks run

- `node scripts/check-precache.mjs` OK (55 precached). `node --test` 136/136 (117 + 19 new).
  `cd tests && npm run check`: 42 Playwright tests pass (28 existing + 14 new), **screenshots
  identical** (no baseline changed).
- **Live check against the real APIs** (after the owner opened the environment's network to
  Sleeper and LeagueLogs), using the owner's real, paused draft `1410504549269053440` (12 teams,
  14 rounds, 3rd-round reversal, 37 picks) and username `btrerise`. Ran a throwaway Playwright
  script (not committed) on this branch **and on main**, desktop:
  - Rankings paste: the player map (now **14.6 MB**, 12,229 players, not the ~5 MB the code
    comments say) was downloaded once, then read from IndexedDB after a reload. Main downloaded
    it again after the reload and has no `mls_sleeper_cache` database.
  - Fetch Market Value, Sleeper Native ADP (PPR): applied, identical values on both.
  - Quick-Start: fails on both with "Market Error: 410". **LeagueLogs has retired its public
    API** (see below).
  - Sync Sleeper Draft with the draft URL: "Sync Complete!", 37 picks, 3 on the owner's team,
    slot names from the league members, roster limits from the league. Identical on both.
  - Live Sync for 10 s: user/draft/league/users fetched once (the toggle's forced sync), picks
    fetched every 3 s, pill reads LIVE; no requests after stopping. Identical on both.
- **How to run a live check here:** Playwright's Chromium doesn't trust the egress proxy's CA, so
  `route.continue()` to a real host fails with `ERR_CERT_AUTHORITY_INVALID`. Instead, fetch the
  real URL from the test runner and `route.fulfill()` the page with it, running Playwright with
  `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` (certificate checks stay
  on). cdnjs is still blocked, so serve PapaParse from `tests/node_modules` as `helpers.mjs` does.

#### LeagueLogs' public API is retired (found during 2C, not caused by it)

Every `developer.leaguelogs.com` URL, on main as on this branch, now answers **HTTP 410** with
`{"error":"deprecated","message":"The LeagueLogs public API has been retired and is no longer
available. It may return in the future."}`. On the live site that breaks MDS's **Quick-Start**
("Failed to load Quick-Start. Market Error: 410"), MDS's three **LeagueLogs** Fetch Market Value
options, and MLS's **LeagueLogs** market source. FantasyCalc (MLS) and Sleeper Native ADP (MDS)
still work. Not changed here: what to replace it with (hide the options, switch Quick-Start to
Sleeper ADP or FantasyCalc, or wait for it to return) is the owner's call.

#### Other changes

- `sw.js`: CACHE_NAME `v2.8.44` → `v2.8.45`. No file added or removed (parse.js and the API
  modules were already precached for MLS), so rule 6 didn't require it; served JS changed.
- `js/shared/storage/keys.js`: the `mls_sleeper_cache` comment says both apps read it. The
  database name is unchanged (rule 4).
- **Follow-up in the same branch, at the owner's request:** ADP sync's "Sleeper Native ADP"
  request (`api.sleeper.com/projections/nfl/2026?...&order_by=<key>`, a different host from the
  v1 API) moved to `getSleeperSeasonAdp(season, orderBy)` in `js/shared/api/sleeper.js`, same
  URL and same "Sleeper API Error: <status>" message. No runbook chunk covered it. `js/mds/` now
  makes no direct network calls. New test in `mds-sync.spec.mjs` (stubbed), and checked live.

#### Left for later chunks

- ~~**`getSleeperPlayerMap` doesn't check `res.ok`**~~ Fixed in "2C follow-up — player-map cache" below. (pre-existing; MLS's error toasts rely on
  the resulting SyntaxError, see the comments at its two catch sites in mls.js). With MDS on it
  too, a non-ok response whose body happens to be JSON would be cached in IndexedDB for a day as
  if it were the player map, in both apps. Not fixed here because it would change MLS's toasts.
  A follow-up could check `res.ok` and throw a SyntaxError-compatible error, or skip caching
  non-ok bodies. Seen live during 2C: Sleeper does send JSON error bodies (`api.sleeper.com`
  answered a bad request with 400 `{"error":"bad-request"}`), so this isn't only theoretical.
  It's a bug fix, not a module move, so it isn't a runbook chunk: do it as a small standalone
  change after 2C merges (it touches `js/shared/api/sleeper.js`, which 2C edits).
- `js/mds/*` still reads `showToast`, `flashButton`, `normalizeName`, `isNameMatch`,
  `formatRankingsDiagnostic` etc. through `window.*` / bare globals. Only the Sleeper, market
  and parser code moved to imports here.
- Comments in `js/mds/import.js` still mention `lineup/rankingsParser.js` and `js/utils.js`
  (5D's comment sweep).
- Unifying `dropTitleRows` and `findHeaderRowIndex` (see above) if wanted, as its own
  behavior change.
- Next on the MDS track: 5A (needs 2C). 6A also needs 2C (and 3F).

### 2C follow-up — Sleeper player-map cache no longer stores error replies (bug fix, outside the runbook)

**The bug.** `getSleeperPlayerMap` (`js/shared/api/sleeper.js`) parsed and cached whatever
`players/nfl` returned. An HTML error page failed in `res.json()` and was never cached, but a
non-ok reply with a JSON body (Sleeper does send these, e.g. 400 `{"error":"bad-request"}`) or
a 200 with something other than a player map was stored in IndexedDB for a day. Both apps then
treated every player as unknown until the day passed. Pre-existing for MLS; since 2C MDS reads
the same cache. Done as its own change, like the line-ending fix: it's a bug fix, not a move.

**The fix.**
- A non-ok status, or a body that isn't a player map (an object whose values are records with
  `player_id`; `isSleeperPlayerMap`), throws an error with `name: 'SleeperResponseError'` and
  `isSleeperResponseError: true`, and nothing is cached. The last good map stays in memory and
  in IndexedDB.
- A cached IndexedDB entry is used only if it passes the same check, so a bad entry saved by
  the old code is ignored and replaced on the next load.
- `lineup/mls.js`: the two catch blocks that said "Sleeper sent back an unexpected response"
  for a `SyntaxError` (Global Injury Audit, Matchup Simulator) now also do so for
  `isSleeperResponseError`. Same wording as before; their comments updated. Other MLS callers
  of `getSleeperPlayerMap` already handled a rejection (an HTML error page rejected before too);
  where they show `err.message`, it now reads "Sleeper's player list request failed (HTTP 503)."
  instead of a JSON parse error.
- MDS: no change needed. Its two callers catch, warn and fall back to an empty map, as before.
- Comments: the player map is ~15 MB now (14.6 MB, 12,229 players), not ~5 MB.
- `sw.js` CACHE_NAME `v2.8.45` → `v2.8.46`.

**Tests.** New `tests/unit/sleeperPlayerMap.test.mjs` (6 tests, with a small in-memory
IndexedDB fake): a stale bad IndexedDB entry is replaced; a good map is served from memory;
503 HTML, 429 JSON, and 200 with `{"error"}` / `null` / `[]` are rejected with the new error and
leave the good map in IndexedDB. All 6 fail against the old code. `market.test.mjs`'s fake
Sleeper records gained the `player_id` real ones have (all 12,229 live records have it; checked).

**Checks run.** `check-precache` OK; `node --test` 142/142; Playwright 42/42, screenshots
identical.

### Planned as runbook chunk 7A — Replace LeagueLogs (owner's direction, recorded after 2C)

Runbook card **7A** (new Phase 7 "Data sources", added at the owner's request) carries the
essentials and a session prompt; the detail is here.

**Why.** LeagueLogs retired its public API (every URL answers 410; see 2C's entry). That breaks
MDS's Quick-Start and its three LeagueLogs Fetch Market Value options, and MLS's LeagueLogs
market source. Not urgent: it's outside draft season, so the owner chose to plan it rather than
rush it in.

**Owner's decisions.**
- **MDS → Fantasy Football Calculator (FFC).** Quick-Start is meant to stand in for an uploaded
  rankings file, not just to fill an ADP column, and FFC is the closest fit to what LeagueLogs
  gave MDS: a full ranked player list per scoring format, K and DEF included. FFC also replaces
  the three LeagueLogs options in Fetch Market Value. The Sleeper Native ADP options stay.
- **MLS → FantasyCalc only.** It's already MLS's default. Remove the LeagueLogs choice.
- **MDS gets no trade values** (no FantasyCalc option in MDS).

**What a session doing this should know.**
- FFC's documented free API ([ADP REST API](https://help.fantasyfootballcalculator.com/article/42-adp-rest-api),
  e.g. `fantasyfootballcalculator.com/api/v1/adp/ppr?teams=12&year=2026`) returns ADP from mock
  drafts, keyed by **player name**, not Sleeper ID. Not yet verified from a session: the
  environment's network allowlist doesn't include `fantasyfootballcalculator.com`, so add it
  first, then check the formats offered (standard / half-ppr / ppr / 2qb / dynasty / rookie?),
  the response fields, K/DEF coverage, CORS for a browser call, and the terms (the help page's
  title says free for personal and commercial use; check whether attribution is required).
- If "rankings" should mean *expert* rankings rather than ADP, FFC's API isn't that. The
  closest free source found is DynastyProcess's `values-players.csv` on GitHub (FantasyPros ECR,
  1QB and 2QB, weekly, CORS allowed, ~350 players, needs its `db_playerids.csv` for Sleeper IDs).
  Ask the owner before switching.
- Suggested build for Quick-Start: turn FFC's rows into the same rows a rankings upload produces
  (name, pos, team, bye, ADP) and send them through `processData` in `js/mds/import.js`. That
  reuses its name → Sleeper ID matching, injuries, rookie flags and diagnostics instead of a
  second copy. Put the fetch in `js/shared/api/` (new `ffc.js`, or in `market.js`), with the
  `mdsFetch` timeout and an error message per caller like the other API modules.
- Keep the `window.quickStartLeagueLogs` / `window.fetchLeagueLogsADP` names the inline
  handlers call (rule 4) and change only the button text; 5A can rename them. Update the
  LeagueLogs attribution blocks in both HTML files.
- MLS: drop the `leaguelogs` `<option>` from both Market Source selects in `lineup/index.html`,
  map a saved `mls_market_settings.source === 'leaguelogs'` to `'fantasycalc'` on load (keep the
  key name, rule 4), fix the attribution link (mls.js, search `leaguelogs.com`), and remove the
  LeagueLogs branch of `fetchMarketConsensusData` plus `fetchLeagueLogsMarket` and its tests.
- It's a behavior change: the MDS Setup screenshots will change on purpose (update baselines
  and list them). Bump CACHE_NAME. Rewrite the LeagueLogs tests in `tests/mds-sync.spec.mjs`
  for FFC.

**When.** One session, right after 2C. The runbook encodes this: 7A needs 2C, and 3A and 5A
need 7A (7A sits between 2C and 5A in the MDS lane). The reasons:
- **Before 3A.** The MLS part edits `lineup/mls.js`, which 3A–3F slice up by line
  range; editing it first avoids conflicts. The MDS part is unaffected by the remaining chunks
  except 5A, which rewrites the Quick-Start and Fetch Market Value `onclick` handlers, so it
  should come before 5A too.
- If 3A has started anyway: do the MDS part any time before 5A, and the MLS part right after 3D
  (which moves the market code into its own file).

### Revisit after the runbook — nflmeta.org (owner's request; runbook card 7B)

Runbook card **7B** (needs 5D and 6B, so it runs last) turns this into a research session that
ends in a proposal; no app changes until the owner approves it.

Not a LeagueLogs replacement (no ADP, rankings, projections or trade values). Worth a look once
every runbook chunk is done. From its official SDKs (`@nflmeta/sdk` on npm, `nflmeta` on PyPI;
the site itself was blocked from the session):
- **Provides:** teams, rosters, player bios/careers, games, play-by-play, stats, standings,
  history; current-season official injury reports (reported vs. game status), game-day
  inactives, live player stats, cap space, bye weeks by season, team power rankings.
- **Constraints:** needs an API key sent as a header, and the SDK says to use it server-side, so
  the site would need a small proxy holding the key (a Cloudflare Pages Function fits, since the
  site is on Pages). Responses carry no Sleeper IDs (outside IDs are stripped), so players match
  by name (`normalizeName`). Pricing and quotas not checked.
- **Possible uses:** bye weeks per season to replace the hard-coded `BYE_WEEKS_2026` in both
  apps (needed by the 2027 season anyway); MLS warnings when a starter is inactive or ruled
  out; power rankings or rosters for context.

### 7A — Replace LeagueLogs: Fantasy Football Calculator for MDS, FantasyCalc only for MLS (behavior change)

**Timing.** 3A hadn't started (main ended at the 7A planning commits), so both the MDS and the
MLS parts are done here, before 3A and 5A as planned.

**What the user sees.**
- **Draft Strategist, Quick-Start** ("Quick-Start: Fantasy Football Calculator ADP", was
  "Quick-Start: LeagueLogs Market") builds the player pool from Fantasy Football Calculator's
  mock-draft ADP for the format picked in Step 3: Redraft 1QB PPR, Half-PPR or Standard, or
  2QB/Superflex. It used to fail with "Market Error: 410". The rows go through the same code
  as a rankings upload, so players get Sleeper IDs, injury tags and rookie flags as before. Team
  defenses show Sleeper's names ("Seattle Seahawks"), as LeagueLogs' Quick-Start did. Quick-Start
  still replaces the pool, even with Aggregate Rankings on.
  - **Out of season the toast says where the list came from.** FFC's lists come from mock
    drafts on its site, so they're full in the summer and thin after kickoff. If today's list
    is short (under 150 players), Quick-Start uses the last full list the server saved and says
    so ("This is Fantasy Football Calculator's last full PPR list, from Sep 12, 2026. Today's list
    only has 29 players…"). The ADP status line then reads "FFC: Redraft - 1QB (PPR) (list from
    Sep 12, 2026)". With no full list saved yet, it loads the short list with an error-style
    toast: "Quick-Start loaded only 29 players… Upload your own rankings for a full player pool."
  - With a Sleeper option selected, Quick-Start now says it needs a Fantasy Football Calculator
    format (was: a LeagueLogs format).
- **Draft Strategist, Fetch Market Value:** the three LeagueLogs options are replaced by an
  "Fantasy Football Calculator (Mock-Draft ADP)" group with the same four formats. The four
  Sleeper Native ADP options are unchanged. FFC rows have no Sleeper ID, so ADP is matched by
  name (`normalizeName`, which ignores punctuation and suffixes such as "III") and defenses by
  team code. The label reads "Select ADP Source & Format" (was "Select LeagueLogs Profile"),
  and the attribution reads "ADP by Fantasy Football Calculator", linking to its ADP page.
- **Lineup Strategist:** LeagueLogs is gone from both Market Source selects, so FantasyCalc is
  the only choice. A saved `mls_market_settings.source` of `'leaguelogs'` (or any other value)
  reads as `'fantasycalc'` on load; the other saved settings are kept, and the key name is
  unchanged. The PPR/TEP controls always show, and the attribution always says FantasyCalc.
  Help texts, tooltips and the Power Rankings source option no longer mention LeagueLogs.
- Removed: the "ad-blockers block URLs containing 'logs'" tip from MDS's two error toasts and
  MLS's two market toasts. It was about LeagueLogs' URL.
- Both pages' SEO `featureList` and the README feature list name the new sources.

**FFC's API, verified from this session** (fantasyfootballcalculator.com was already reachable;
its help site, help.fantasyfootballcalculator.com, is blocked, so the terms come from search
results quoting that page):
- `GET https://fantasyfootballcalculator.com/api/v1/adp/<format>?teams=<n>&year=<yyyy>` →
  `{ status: "Success", meta: { type, teams, rounds, total_drafts, start_date, end_date },
  players: [{ player_id, name, position, team, adp, adp_formatted, times_drafted, high, low,
  stdev, bye }] }`. `adp` is the overall pick number. `player_id` is FFC's own ID, not Sleeper's.
  Positions are QB/RB/WR/TE/**PK**/**DEF**. Defenses are named "Seattle Defense" / "LA Rams
  Defense". Team codes match Sleeper's exactly (all 32 checked).
- Formats: `standard`, `half-ppr`, `ppr`, `2qb`, `dynasty`, `rookie`. **`teams` makes no
  difference**: 8, 10, 12 and 14 return identical lists and draft counts. **There is no date
  parameter**: start/end/date/days/from/since are all ignored. FFC picks its own recent window.
- **List sizes.** End of 2025 preseason: PPR 249 (20 K, 23 DEF), Standard 221, 2QB 215,
  Half-PPR 156 (only 4 K, 8 DEF), Dynasty 85, Rookie 34. Today, 2026-10-02: PPR 29, Half 54,
  Standard 118, 2QB 200 (its window is a whole month), Dynasty and Rookie 0. So MDS offers the
  four redraft formats and, since the follow-up below, rookie drafts; startup dynasty is left out. FFC's per-player ADP history (an undocumented graph feed on its
  site, not used by the app) shows 2026 PPR had 226–240 players a day from July through
  September 15, then fell off after kickoff.
- **CORS: none.** Replies carry no `Access-Control-Allow-Origin`, with or without an `Origin`
  header, so a browser on mydraftstrategist.com can't read them. This is why the server function
  below exists (the owner chose it over DynastyProcess or Sleeper-only Quick-Start).
- **Terms:** "free for personal and commercial use"; FFC asks for attribution "in the form of a
  link or mention" (done next to both buttons) and asks not to call the API too often because
  the data updates once a day (the function caches it).

**What was added or moved where.**

| File | What |
|---|---|
| `functions/api/ffc/[format].js` (new) | **The repo's first server code: a Cloudflare Pages Function** at `GET /api/ffc/<format>`. It fetches FFC (current UTC year, `teams=12`), keeps an edge-cache copy for 6 h (browser: 1 h), and saves each full list (150+ players) to the KV namespace bound as `FFC_LISTS`, at most once per 20 h per format. When today's list is short, or FFC is down, it serves the saved list (`source: 'saved'`, `savedAt`). With nothing saved it serves the short list (`short: true`), or answers 502 when FFC is down. Without the KV binding it still works but can't fall back. Response shape is in its header comment |
| `js/shared/api/ffc.js` (new) | `fetchFfcAdp(format, { errorPrefix })` through `window.mdsFetch`, plus `FFC_FORMAT_LABELS` and `formatFfcDate`. Errors read "Fantasy Football Calculator Error: <proxy message or status>" |
| `js/shared/net.js` | A timeout on `/api/ffc/` now says "Fantasy Football Calculator didn't respond in time"; the `leaguelogs.com` row is gone |
| `js/mds/market.js` | `quickStartLeagueLogs` / `fetchLeagueLogsADP` rewritten for FFC; the window names are unchanged (rule 4; 5A can rename them). New local helpers `describeFfcList`, `ffcRowsForImport` and `selectedFfcFormat` |
| `js/mds/import.js` | `processData` is exported and takes three new `source` options, used only by Quick-Start: `replace`, `successLabel` and `successToast`. It returns true or false. Upload and paste behave as before |
| `js/shared/api/market.js` | `fetchLeagueLogsMarket` and `fetchMarketConsensusData`'s LeagueLogs branch removed (an unknown source now throws), along with the `getSleeperPlayerMap` import |
| `lineup/mls.js` | `State.marketSettings` initializer maps the source to `'fantasycalc'` (and now fills missing fields from the defaults); `applyMarketSettingsToUI` hard-codes FantasyCalc; two comments; the two "logs" tips |
| `index.html`, `lineup/index.html`, `README.md` | Labels, options, attribution and help text as above |
| `sw.js` | `/js/shared/api/ffc.js` precached; **`/api/*` requests bypass the service worker** like cross-origin ones, so live data never lands in the app-shell cache. CACHE_NAME `v2.8.46` → `v2.8.47` |

The CSS class `.leaguelogs-attribution` keeps its name (4A splits styles.css; renaming it is
cosmetic).

#### Owner action needed: the KV namespace (the saved-list fallback)

The function runs as soon as this deploys: Cloudflare Pages finds `functions/` in the repo on
its own, with no build step or settings change. Its requests count against the Workers free
plan (100,000 a day). To turn on **"save the last full list"**, bind a KV namespace once:

1. Cloudflare dashboard → **Storage & Databases → KV → Create** a namespace, e.g. `ffc-lists`.
2. **Workers & Pages →** the site's Pages project **→ Settings → Bindings → Add → KV
   namespace**. Variable name **`FFC_LISTS`**, namespace `ffc-lists`. Add it for Production
   (and Preview if wanted).
3. Redeploy (or push any commit) so the binding takes effect.

Free-plan KV allows 100,000 reads and 1,000 writes a day; this uses at most about 4 writes a
day. **The fallback can only save what it sees once it's live.** Deployed in October, today's
lists are short, so Quick-Start loads the short list with the warning until mock drafts pick up
next summer (FFC's 2026 history starts in January). Then it saves each full list and serves the
last one after kickoff.

Without the binding everything else works. Quick-Start just never has a saved list to fall
back to.

#### Tests

- New `tests/unit/ffc.test.mjs` (13): the function with in-memory stand-ins for Cloudflare
  (global fetch, `caches.default`, KV). It covers: formats and threshold; unknown format 404s
  without calling FFC; a full list is served and saved; a second request comes from the edge
  cache; no re-save within 20 h; a short list falls back to the saved one and is never saved
  over it; a short list with nothing saved is served, marked short; works without the binding;
  FFC down with and without a saved list (502 not cached); a non-FFC reply counts as down. Also
  the client: proxy body, error wording, an HTML 404 reports the status.
- `tests/unit/market.test.mjs` rewritten: the LeagueLogs cases are gone; FantasyCalc's
  normalization and error wording; `'leaguelogs'` is rejected without a request;
  `fetchLeagueLogsMarket` no longer exported.
- `tests/mds-sync.spec.mjs`: the three LeagueLogs tests replaced by five FFC ones (stubbed
  `/api/ffc/`). Quick-Start through the upload path covers order, PK→K, a defense matched by
  team to Sleeper's ID and name, a player missing from Sleeper kept with a `custom_` ID, bye
  and ADP. Also: replaces the pool even with Aggregate on; the saved-list and short-list
  toasts, with the short one shown as an error; the error toast and the non-FFC-format toast;
  ADP sync by name, including "AJ Brown" → "A.J. Brown", and its error toast.
- New `tests/mls-market.spec.mjs`: a saved `{ source: 'leaguelogs', type: 'dynasty', qbs: '2',
  ppr: '0.5', tep: true }` loads as FantasyCalc. Neither select offers LeagueLogs, the
  attribution says FantasyCalc, and Fetch Market Value requests FantasyCalc with the saved
  dynasty/superflex/half/TEP settings and stores the result. Changing a setting then saves
  `source: 'fantasycalc'` under the same key.

#### Checks run

- `node scripts/check-precache.mjs` OK (56 precached). `node --test` 155/155. Playwright 48/48
  (`npx playwright test` in `tests/`).
- **Intended screenshot changes** (`tests/baselines/linux/`), updated with
  `--update-snapshots=all` for the visual spec. A redraw of `phone/tscore-avoidsTab.png` within
  tolerance was reverted, so every other baseline is byte-identical:
  - `desktop/mds-empty-setup.png`, `phone/mds-empty-setup.png`: Quick-Start text and button,
    "Select ADP Source & Format", the first FFC option selected, "ADP by Fantasy Football
    Calculator". The desktop one was within the 0.2% tolerance but is updated so the baseline
    doesn't still show LeagueLogs.
  - `desktop/mds-empty-guide.png`, `phone/mds-empty-guide.png`: Guide steps 1 and 3.
  - `desktop/mls-league-guide.png`, `phone/mls-league-guide.png`: the Auto-Fetch ROS and
    Market Disconnect help text.
- **Live check against the real FFC and Sleeper APIs** (throwaway script, not committed). The real
  function ran in Node against fantasyfootballcalculator.com, the page was served by
  `serve.mjs` in Chromium, `/api/ffc/*` was answered by the function, and the real Sleeper
  player map was passed through. Real Quick-Start clicks, one per format:
  - **Today's 2026 lists, no KV:** PPR 29, Half 54, Standard 118 → short-list warning toast;
    2QB 200 (14 K, 14 DEF) → normal toast. Every player matched a Sleeper ID.
  - **In-season lists** (the same run with FFC's `year` rewritten to 2025, KV bound): **PPR
    249** (20 K, 23 DEF), **Standard 221** (17 K, 20 DEF), **2QB 215** (17 K, 19 DEF),
    **Half-PPR 156** (4 K, 8 DEF; FFC's own Half-PPR list is thin on K/DEF). All four were
    saved to KV. All but one player per format matched a Sleeper ID. The exception was Travis
    Hunter: FFC lists him as WR, Sleeper as DB (`fantasy_positions` ['DB', 'WR']), so the position
    check in `processData` rejected him (fixed in the follow-up below). Defenses come out as "Dallas Cowboys"/DAL etc., kickers as
    K with Sleeper IDs, byes from FFC, injuries from Sleeper.
  - **Then today again with that KV:** PPR, Half and Standard fall back to the saved lists
    (249/156/221) with the "last full list, from <date>. Today's list only has N players" toast
    and the "(list from …)" ADP label. 2QB (200, full) is served live.
  - Only console errors: the aborted Google Fonts / Ko-fi requests.
- Not checked live: the function on Cloudflare itself (edge cache, real KV). It only runs once
  this deploys; the unit tests use stand-ins with the same API.

#### Left for later chunks

- **Owner:** create and bind `FFC_LISTS` (above), then try Quick-Start on the live site.
- **5A:** rename `window.quickStartLeagueLogs` / `window.fetchLeagueLogsADP` (they now call
  FFC) along with their handlers.
- **5D's comment sweep:** a few comments still mention LeagueLogs (`lineup/mls.js` near ROS
  auto-fetch and the rookie-pick detector; the 2A header in `js/mds/market.js` names the old
  LEAGUE LOGS INTEGRATION marker). Also the `.leaguelogs-attribution` class name.
- ~~Two-way players such as Travis Hunter fail `processData`'s position check.~~ Fixed in the
  follow-up below.
- `tests/`, `docs/`, `scripts/` (and now `functions/`) are served as static files by Pages; the
  function file has no secrets.

#### 7A follow-up (same branch, at the owner's request): rookie drafts, two-way players

- **Rookie drafts.** Fetch Market Value and Quick-Start offer **"Dynasty - Rookie Draft"**
  (`ffc|rookie`). Rookie drafts are only 3-4 rounds (30-48 picks in 10-12 team leagues), so
  `FULL_LIST_MIN` in the function is now per format: 150 for the redraft formats and **30 for
  rookie**. FFC's rookie lists from past summers ran 32 (2021), 40 (2022), 45 (2023) and 34
  (2025); 2024 had only 14 mock drafts and an empty list. Their last ADP sits around pick 31-36,
  so FFC covers about three rounds of a 12-team rookie draft. Picks after that are players FFC
  didn't list. Startup dynasty (`dynasty`) is still left out: 85 players at its 2025 peak.
- **Two-way players.** `processData` (`js/mds/import.js`) now accepts a Sleeper match when the
  row's position is any of the player's `fantasy_positions`, not only `position`. Travis Hunter
  (Sleeper position DB, fantasy_positions DB and WR) matches as a WR, with his Sleeper ID,
  rookie flag and injury status. This covers rankings uploads and pastes too, not only
  Quick-Start.
- **FFC's defensive players are dropped** from Quick-Start (its 2022 rookie list had a DB, an OT
  and an OLB): only QB/RB/WR/TE/PK/DEF rows are kept, as LeagueLogs' Quick-Start kept only
  those six.
- An empty FFC list now says why ("…is empty right now because few mock drafts happen this
  time of year. Upload your own rankings instead."), and the saved-list toast says "Today's
  list is empty" instead of "only has 0 players".
- **Tests:** `ffc.test.mjs` +2 (a 34-player rookie list is full and saved; an empty one falls
  back to the saved list). `mds-sync.spec.mjs` gained a rookie Quick-Start test. It serves the
  fixture player map plus a Hunter-shaped player from the spec only, so the shared fixtures and
  MLS screenshots don't change. It checks the `/api/ffc/rookie` request, Hunter matched as WR1
  with ID 12530 and the rookie flag, an OLB dropped, and the "FFC: Dynasty - Rookie Draft"
  label. **It fails without the import.js change.** The FFC error test also covers the
  empty-list toast. No screenshot changed: the new option is inside the dropdown.
- **Live check** (same throwaway script): with the 2025 lists, PPR now matches **249/249**
  players to Sleeper (Hunter included), and the rookie list loads **34 players**, all matched,
  as a full list, and is saved. Today's rookie list is empty: with nothing saved, Quick-Start
  shows the empty-list error; with the saved list, it loads those 34 players with the "Today's
  list is empty" toast.
- Checks: `check-precache` OK, `node --test` 157/157, Playwright 50/50. CACHE_NAME stays
  `v2.8.47` (the branch isn't merged yet, so it's still above main's `v2.8.46`); no file added
  or removed.
- **Owner:** the `FFC_LISTS` KV binding is set up (Production and Preview, done with
  Cloudflare's AI agent on 2026-10-02). It takes effect with the first deployment that includes
  `functions/`, i.e. when this branch is merged to main (or a Preview deployment of it).

### 3A — MLS groundwork: entry point, state, navigation, init

`git mv lineup/mls.js js/mls/legacy.js`, then the IIFE wrapper (`(function () {`, `'use strict';`,
`})();`) was dropped; the file was already a module, so nothing else about strictness changes.
Everything above `// --- PLAYER HEADSHOTS ---` moved into the modules below. A script cut it by
line range (top-level statements found with acorn, as in 2A) and added `export`/`import` lines;
no other line was retyped. Checked: every non-blank line of the old mls.js (except the three IIFE
lines and the import lines, whose paths changed) is present **exactly once** across `js/mls/*.js`
once the `export` edits are undone (8,302 lines). Indentation is unchanged (mls.js mixes the
IIFE's 4 spaces and column 0), so a line from the old file greps the same in the new one.

| New file | From mls.js (by section marker) |
|---|---|
| `js/mls/main.js` | New. Entry point (`<script type="module" src="../js/mls/main.js">` in `lineup/index.html`, where the mls.js tag was). Imports `legacy.js` first, then holds the single `window.*` block: all **72** names mls.js assigned |
| `js/mls/compat.js` | The stale-utils.js fallbacks: `readJSON` (top of the IIFE) and the `escapeHtml` forwarder (end of INITIALIZATION). Same role as `js/mds/compat.js`; 5D deletes it |
| `js/mls/constants.js` | CONSTANTS & CONFIGURATION (`NFL_TEAMS`, `TEAM_BYES`, `ESPN_TEAM_ALIASES`, `tierTag`, `posRankTag`, the lineup-stats TTLs, `RANKING_TYPE_CONFIG`) |
| `js/mls/state.js` | STATE MANAGEMENT: `State` (including the first LINEUP OPTIMIZER SETTINGS block, which is inside it), lineup undo/redo (`snapshotLineupState` … `redoLineupChange`), `refreshCurrentNflWeek`, `refreshGameTimes` |
| `js/mls/helpers.js` | The status predicates at the end of STATE MANAGEMENT (`HARD_OUT_STATUSES`, `isUnavailableThisWeek`, `getShortInjuryStatus`, `SIM_EXCLUDE_STATUSES`, `isExcludedFromSimulation`, `isBestBallLeague`), UTILITY HELPERS (comments only), RANKINGS LOOKUP INDEX (`rankingIndex`), and `showStatusFeedback` / `renderHTMLInto` (unmarked, end of INITIALIZATION) |
| `js/mls/nav.js` | DRAWER & SWIPE LOGIC, NAVIGATION LOGIC (`toggleDrawer`, `navigateFromDrawer`, the `#mainApp` touch listeners, `handleSwipe`, `updateDrawerActiveState`, `showTab`, the `popstate` listener) |
| `js/mls/backup.js` | BACKUP & RESTORE (`getMlsOwnedKeys`, export, import, `factoryReset`) |
| `js/mls/init.js` | INITIALIZATION: `SETUP_STEPS`, `goToSetupStep`, `renderSetupStep`, `updatePulsePrompts` |
| `js/mls/legacy.js` | Everything from PLAYER HEADSHOTS on, unchanged apart from the edits below |

**Placements by content, not marker** (as 2A did): the six status predicates sat under STATE
MANAGEMENT but don't hold state, so they're in helpers.js. `escapeHtml`, `showStatusFeedback` and
`renderHTMLInto` sat at column 0 after INITIALIZATION's last function, with no marker; the first is a
stale-cache fallback (compat.js), the other two are general DOM helpers (helpers.js).

**Edits in legacy.js beyond the cut:** a three-line note under the file header; import paths
(`../js/shared/…` → `../shared/…`, `./monteCarloUi.js` etc. → `../../lineup/…`); the
`isMlsOwnedKey` import moved to backup.js with its only caller; one import line per extracted
module; the 63 `window.x = function` lines became `export const x = function`; `export` added to
the six legacy functions extracted modules call (`renderLineupUI`, `gameStatusMayBeStale`,
`loadRosterTab`, `refreshLeagueDropdown`, `getActiveLeague`, `setRankingsCardExpanded`). The old
"Pilot ES module extraction … above the IIFE" comment is stale but left for 5D's sweep.

#### window.* names

The card estimated ~119; mls.js has **72** top-level `window.x = …` statements, all functions,
no duplicates, and none that collides with another top-level name. main.js assigns all 72 in
mls.js order, including **`window.onload`** (the page's startup handler, still in legacy.js; see
below). main.js runs before the `load` event and before `DOMContentLoaded`, so it still fires.
The one other `window.x =` in mls.js, `window.sleeperPosByName = {}`, is a runtime data write
inside a function and stays as it is. `Object.getOwnPropertyNames(window)` on `/lineup/`, empty
and after a sync, is identical to main (1,290 names).

#### Load order

`legacy.js`'s import list sets it: the shared/lineup imports as before, then `compat → constants →
state → helpers → nav → backup → init` (mls.js order; `nav`/`backup`/`init` are side-effect imports
where legacy uses nothing from them). Simulated depth-first evaluation: `compat → constants →
state → helpers → init → nav → backup → legacy → main`. **init evaluates before nav** because nav
imports `updatePulsePrompts` from init. init's only load-time code is the `SETUP_STEPS` object
literal, so nothing observable moves: the load-time effects still run in mls.js order: `State`
built from localStorage → `#mainApp` touch listeners → `popstate` listener → legacy's top level
(headshot setting, file-input listeners, `DOMContentLoaded`/`keydown` listeners) → main's
`window.*` block.

Parser checks (same as 2A): the only load-time cross-module reference in an extracted module is
`State`'s use of `readJSON` (compat.js has no imports, so it is always evaluated first). No
load-time code anywhere reads one of the 72 `window.*` names (main.js now assigns them last).
No module assigns another module's binding. No new import is shadowed by a nested declaration.

#### Conventions for 3B–3F

- **What goes where.** `state.js` holds `State` and the code that owns its non-UI fields (undo
  stacks, the NFL week and kickoff-time refreshers). New shared mutable state goes in `State`,
  not in a module-level `let` another module needs. 3D merges the second LINEUP OPTIMIZER SETTINGS
  block (legacy.js, search the marker) into state.js. `helpers.js` holds small functions many
  sections call: predicates and lookups that may *read* `State` but don't render a tab or write
  storage. `constants.js` holds plain data and the tiny `tierTag`/`posRankTag` formatters.
  Section code goes in its own file (3B's `headshots.js`, `leagues/sync.js`, …), not into helpers.
- **Reaching legacy-only functions.** An extracted module imports them by name from
  `./legacy.js` (a circular import, rule 5), and legacy.js gets `export` on that declaration.
  That's the only edit legacy.js gets outside the cut. Use them only at call time. When a later
  chunk moves such a function out of legacy.js, repoint every `from './legacy.js'` line that
  names it (`grep -n "from './legacy.js'" js/mls/*.js`).
- **window.* names.** `window.x = function` becomes `export const x = function` in its module,
  and main.js's import line for it names that module. Moving a window function means moving its
  name between main.js's import lines; the `window.x = x;` line stays put.
- **Load order.** When adding a module, add its import to legacy.js's list at the point its code
  sat in mls.js. Order only matters for modules with load-time code, but keeping mls.js order
  makes that automatic. Re-run the evaluation simulation if a module has load-time effects.
- **Paths** from `js/mls/`: shared code is `../shared/…`; the modules still in `lineup/` are
  `../../lineup/…` until 3C/3F move them. `monteCarloUi.js` still starts the worker with
  `new Worker('./worker.js')`, which resolves against the page URL (`/lineup/`), so the worker
  loads exactly as before (the smoke test's simulator run covers it).
- **Tooling.** Same as 2A: acorn in a scratch directory (`npm i acorn` outside the repo), a
  throwaway script that assigns line ranges to modules, refuses a statement that straddles two
  ranges or a code line left unassigned, builds imports/exports from a scope-aware walk, simulates
  evaluation order and flags load-time cross-module references; then a second script that checks
  every original line lands exactly once.

#### Checks run

- `node scripts/check-precache.mjs` OK (64 precached). `node --test` 157/157.
  `cd tests && npx playwright test`: 50/50, **screenshots identical** (no baseline changed),
  including the smoke test's matchup simulator in its Web Worker.
- Throwaway Playwright spec (not committed), run against this branch **and** origin/main at both
  widths, with identical JSON results: window property names (empty and synced), hamburger open
  (aria-expanded, overlay, focus) and Escape close, drawer navigation to Lineup, browser Back,
  `goToSetupStep('ros'/'weekly')` (tab switch, card reveal, focus), swipe left/right on
  `#mainApp`, a lineup lock toggle then undo and redo (lineup text and toasts), Factory Reset
  cancelled (localStorage untouched), checklist text and pulse classes. No console errors.
  Backup → restore is covered by `backup.spec.mjs` (passes).

#### Other changes

- `lineup/index.html`: the script tag, plus the comments that named mls.js now name the file
  that has the code (`nav.js`, `init.js` or `legacy.js`).
- `sw.js`: `/lineup/mls.js` replaced by the nine `js/mls/*.js` files; comment updated.
  CACHE_NAME `v2.8.47` → `v2.8.48`. No user-visible change, so no app version label bump.
- README: `/js` and `/lineup` lines.

#### Left for later chunks

- **`window.onload` → init.js.** The page's startup handler (`export const onload`, legacy.js,
  just above `// --- EARLY GAMES LOGIC ---`) sits after PLAYER HEADSHOTS, which this card put out
  of scope, so it's still in legacy.js. 3B (whose range it's in) or 3E (STARTUP CLEANUP → init.js)
  should move it next to the rest of init.js. Its main.js import line moves with it.
- Comments inside moved code still say "this file", "mls.js", "utils.js" or
  "rankingsParser.js"; legacy.js's top-of-file comments describe the old IIFE (5D's sweep).
- `js/mls/*` still read the shared helpers through `window.*` / bare globals (`showToast`,
  `mdsFetch`, `normalizeName`, `createFocusTrap`…), as `js/mds/*` does.
- Next on the MLS track: 3B.

### 3B — MLS: leagues, sync, headshots, SoS

Everything from `// --- PLAYER HEADSHOTS ---` up to `// --- SCOUT TAB ENGINE ---` left
`js/mls/legacy.js` (2,060 lines), **except `window.onload`** (see below). Same tooling as 3A: acorn +
eslint-scope in a scratch directory, a throwaway script that assigns each top-level statement (with
the comments and blank lines above it) to a module by line range, refuses an unassigned line or a
statement that straddles a range, builds the import lines from a scope-aware walk, adds `export`
where another module now needs a name, and simulates the evaluation order. Checked afterwards:
every non-blank, non-import line of `js/mls/*.js` at main is present **exactly once** across
`js/mls/**/*.js` once the added `export ` prefixes are undone; the only new lines are the header
comments. Every named import resolves to an export (acorn link check). Indentation unchanged.

| New file (under `js/mls/`) | From legacy.js |
|---|---|
| `lineup/headshots.js` | PLAYER HEADSHOTS (incl. its load-time `applyHeadshotSetting()` call) |
| `players.js` | Everything under the INDEXEDDB CACHE FOR THE SLEEPER PLAYER MAP marker: the player-map indexes (`getPlayerSearchIndex`, `getCleanNameToIdIndex`), `attachPlayerAutocomplete`, `levenshtein`, `findClosestRankedName`, `attachScoutSuggestionHandler` |
| `lineup/earlyGames.js` | EARLY GAMES LOGIC, the early-teams part (`populateEarlyGameDropdown` … `isEarlyPlayer`) |
| `lineup/gameInfo.js` | The rest of that section, which has no marker of its own: bye/kickoff/opponent badges, `hasKickedOff`, `isGameFinal`, `gameStatusMayBeStale`, projections and points, `refreshLineupStats`, `getNextLockCountdownHTML`, `getLineupInjuryWarningHTML`, `getValidSleeperStarterIds` |
| `leagues/sync.js` | LEAGUE & SYNC LOGIC (dropdown, League Manager, switching), the league functions after LEAGUE-SCOPED SCOUT RESULTS (`applyLeagueDefaultsToMarketSettings`, `loadActiveLeagueData`, `saveRequirements`, `createManualLeague`), and the Sleeper sync, which sat under ADD PLAYER MANUALLY / IMPORT ALL LEAGUES (`diffRosterChanges`, `formatNameList`, `processSleeperData`, `addAndSyncLeague`, `syncActiveLeague`) |
| `leagues/scoutResults.js` | LEAGUE-SCOPED SCOUT RESULTS (`_scoutResultsLeagueId`, `clearLeagueScopedResults`) |
| `leagues/handoff.js` | DRAFT STRATEGIST ROSTER HANDOFF |
| `leagues/addPlayer.js` | ADD PLAYER MANUALLY (and `deletePlayer`, which sat with it) |
| `leagues/importAll.js` | IMPORT ALL LEAGUES (`importAllSleeperLeagues`) |
| `sos.js` | SOS ENGINE (incl. the load-time `#sosFileInput` listener) |
| `helpers.js` (appended) | `getActiveLeague`, from LEAGUE & SYNC LOGIC. Reason below |

The card said "lineup/headshots.js and players.js"; `players.js` is at the top of `js/mls/`, not in
`lineup/`, because the player-map indexes and autocomplete serve every tab (Setup, Scout, the
simulator's player lookup). `lineup/` and `leagues/` are new subfolders of `js/mls/`; don't confuse
`js/mls/lineup/` with the page folder `/lineup/`.

#### Why `getActiveLeague` went to helpers.js

Load order forced it. `state.js` imports `gameStatusMayBeStale`, so `lineup/gameInfo.js` now
evaluates *before* `state.js`'s body. gameInfo needs `getActiveLeague`; had that stayed in
`leagues/sync.js`, gameInfo would pull in sync → scoutResults, whose top level reads
`State.activeLeagueId` (`let _scoutResultsLeagueId = State.activeLeagueId;`), and that read would
hit `State` in its TDZ. `getActiveLeague` is a one-line lookup on `State`, which is what 3A's
conventions put in helpers.js. With it there, gameInfo's imports reach only helpers/constants/
compat/state, none of which has load-time cross-module reads.

#### Why `window.onload` is still in legacy.js

3A suggested 3B move it to init.js. Doing so makes init.js import sos.js, handoff.js etc., and
since nav.js imports init.js, `sos.js` (with its load-time `#sosFileInput` listener) would then
evaluate before nav.js and headshots.js. Harmless (different elements), but it breaks 3A's
"load-time effects run in mls.js order" invariant, so it stays put. 3E (STARTUP CLEANUP → init.js)
should move it and re-run the evaluation simulation, or accept and record the reorder.

#### Load order

legacy.js's import list gains, after `./init.js`: `./lineup/headshots.js`, `./players.js`,
`./lineup/earlyGames.js`, `./lineup/gameInfo.js`, `./leagues/sync.js`, `./leagues/scoutResults.js`,
`./leagues/handoff.js`, `./leagues/addPlayer.js`, `./leagues/importAll.js`, `./sos.js` (mls.js
order; side-effect imports where legacy uses nothing from them). Simulated evaluation:
`compat → constants → helpers → lineup/gameInfo → state → init → lineup/earlyGames →
leagues/scoutResults → players → leagues/addPlayer → leagues/sync → nav → backup →
lineup/headshots → leagues/handoff → leagues/importAll → sos → legacy → main`. helpers and gameInfo
now run before state, but neither has load-time code beyond declarations. Load-time effects, in
order: `State` built → nav's `#mainApp` touch + `popstate` listeners → headshot setting → SoS file
listener → legacy's own top level: the same order as mls.js. The only load-time cross-module read
in the moved code is scoutResults' `State.activeLeagueId`, and state.js has finished by then.

**Repointed imports:** `nav.js` (`refreshLeagueDropdown` → `leagues/sync.js`), `state.js`
(`gameStatusMayBeStale` → `lineup/gameInfo.js`), `init.js` (`getActiveLeague` → `helpers.js`),
`main.js` (the 17 window names that moved now import from their new modules; the `window.x = x;`
block is untouched). legacy.js gets `export` on 4 more functions the new modules call
(`getRankingsFreshness`, `updateRankingsMetaDisplay`, `applyMarketSettingsToUI`,
`getPowerLeagueKind`), and drops the imports it no longer uses.

#### Checks run

- `node scripts/check-precache.mjs` OK (74 precached). `node --test` 157 pass (1 skips only when
  `tests/node_modules` isn't installed). `cd tests && npm run check`: **56/56**, screenshots
  identical (no baseline changed).
- New `tests/mls-leagues.spec.mjs` (kept): Import All Leagues (missing-username toast, then a
  full import of the fixture user's league and its roster), Draft Strategist → Lineup Strategist
  handoff end to end (draft in MDS, Send to Lineup Strategist, banner, Import as New League, roster
  shows the drafted player, key removed), and dismissing the banner. Passes on this branch **and**
  on origin/main unchanged.
- Throwaway spec (not committed), run on this branch and origin/main at both widths with
  byte-identical JSON: window property names (empty and synced), add/remove early teams (chips,
  banner), Lineup tab text, create a manual league + add a player manually, Roster tab text,
  `cycleLeague`, save a manual SoS value, headshots toggle (body class), `moveLeague`, and every
  remaining localStorage key and value. No console errors.

#### Other changes

- `sw.js`: the ten new files added to PRECACHE_ASSETS after `/js/mls/init.js`. CACHE_NAME
  `v2.8.48` → `v2.8.49`.
- README: the `/js` line mentions `js/mls/lineup/` and `js/mls/leagues/`.
- Header comment on each new file; legacy.js's top note mentions 3B.

#### Left for later chunks

- `window.onload` → init.js (3E), as above.
- Paths from the subfolders: shared code is `../../shared/…`, the modules still in the page
  folder are `../../../lineup/…` (`leagues/sync.js` imports `clearSimResults` that way), and
  legacy is `../legacy.js`. 3C/3F should repoint those when they move `monteCarloUi.js` etc.
- Comments inside moved code still say "mls.js", "mds.js" or "rankingsParser.js" (5D's sweep).
- Next on the MLS track: 3C (SCOUT TAB ENGINE onward). `runScout` is still in legacy.js;
  `leagues/sync.js` imports it from `../legacy.js`, so 3C repoints that line.

### 3C — MLS: Scout tab and waiver tools

Everything from `// --- SCOUT TAB ENGINE ---` up to `// --- RANKINGS ENGINE ---` left
`js/mls/legacy.js` (1,695 lines; legacy.js is now 4,657). **All of 3C's scope moved; no marker in
the card's range is left in legacy.js.** Same tooling as 3A/3B (acorn + eslint-scope in a scratch
directory): a throwaway script assigned line ranges to modules, refused a statement straddling two
ranges or a non-blank line left unassigned, built each module's imports from the original file's
module-scope references, added `export` where another module now needs a name, rejected any
cross-module write to a moved binding, and repointed the other modules' `from './legacy.js'` lines.
Checked afterwards: every non-blank, non-import line of `js/mls/*.js` at main is present **exactly
once** across `js/mls/**/*.js` once the added `export ` prefixes are undone; the only new lines are
header comments. Every named import resolves to an export, no import is unused, and the set of bare
globals the js/mls code reads is unchanged. Indentation unchanged.

| New file (under `js/mls/`) | From legacy.js |
|---|---|
| `scout/engine.js` | SCOUT TAB ENGINE: `runScout` (its inner DYNAMIC WAIVER ADJUSTMENT, POSITION RESOLVER FOR CARD BADGES, TRADE FAIRNESS VERDICT(S) and WAIVER ADJUSTMENT blocks are inside it) and `renderTradeVerdict` |
| `scout/waivers.js` | WAIVER WIRE ASSISTANT: AUTO-FIND, incl. its SCAN PASTED LIST and LOOKING TO sub-markers (`getSleeperMetaByName`, the waiver-scan settings, `buildWaiverContext`, the card/verdict builders, `setWaiverCompare/Scope/Intent`), **plus `autoFindWaiverUpgrades`**, which sat unmarked after ALL-LEAGUES PLAYER SEARCH |
| `scout/waiverScanner.js` | `git mv lineup/waiverScanner.js` (content identical) |
| `power/allLeagues.js` | ALL-LEAGUES POSITIONAL POWER RANKS (`getLeaguePowerRankings` … `renderPowerSourceNote`) |
| `scout/allLeaguesSearch.js` | ALL-LEAGUES PLAYER SEARCH (`isFullyMappedLeague`, `LEAGUE_SEARCH_STATUS`, `scoutGoToLeague`, `runAllLeaguesSearch`) |
| `helpers.js` (appended) | `isConnectionError`, which sat unmarked between `runAllLeaguesSearch` and `autoFindWaiverUpgrades`. Auto-Find, the Global Injury Audit and the simulator's error path all call it, so it's a shared predicate (3A's helpers.js rule), not waiver code |

The trade-verdict logic stays inside `runScout` in `scout/engine.js`, as the card said; engine.js
imports `rankToTradeValue`, `getMarketValue`, `isDraftPickName` and
`getDynamicWaiverAdjustmentValue` from `../legacy.js`, so 3D repoints that line when it moves the
value curve. `power/` is a new subfolder; 3F's POSITIONAL POWER RANKINGS modules go beside
`allLeagues.js`, which imports `computePositionalPower`, `powerRankFor`, `powerTier`,
`powerValueForRank` and `POWER_UNRANKED_RANK` from `../legacy.js` today.

#### Load order

legacy.js's import list gains, after `./sos.js`: `./scout/engine.js` (side-effect import),
`./scout/waivers.js`, `./power/allLeagues.js`, `./scout/allLeaguesSearch.js`. Its old
`../../lineup/waiverScanner.js` import is gone (nothing left in legacy.js uses it); `scout/waivers.js`
is the only importer of `./waiverScanner.js` now. Because `leagues/sync.js` now imports `runScout`
from `../scout/engine.js`, the four new modules and waiverScanner evaluate inside sync's subtree:
`… leagues/addPlayer → scout/waiverScanner → power/allLeagues → scout/allLeaguesSearch →
scout/waivers → scout/engine → leagues/sync → nav → …`. None of them has load-time code beyond
function declarations and literal constants (`WAIVER_SCAN_POSITIONS`, `POWER_RANK_KEY`, `ordinal`,
`LEAGUE_SEARCH_STATUS`, `_sleeperMetaByNamePromise = null`), so the load-time effects still run in
the same order: `State` → scoutResults → nav's listeners → keys → headshots → SoS listener →
legacy's top level → main's `window.*` block. legacy.js's own load-time code (file-input listeners,
`DOMContentLoaded`/`keydown`, `POWER_AGE_CURVES`) references none of the moved names.

**Repointed imports:** `main.js` (`runScout` → `scout/engine.js`; `autoFindWaiverUpgrades`,
`setWaiverCompare/Scope/Intent`, `updateWaiverScanSetting` → `scout/waivers.js`; `scoutGoToLeague`
→ `scout/allLeaguesSearch.js`; the new import lines go after the existing ones so legacy.js stays
first; the `window.x = x;` block is untouched) and `leagues/sync.js` (`runScout`). legacy.js gets
`export` on 10 more names the new modules call (`rankToTradeValue`, `isDraftPickName`,
`getMarketValue`, `getDynamicWaiverAdjustmentValue`, `isAutoLockOverridden`, and the five power-math
names above), imports `isConnectionError` from helpers.js, and imports back the moved names it still
calls (`analyzeRankingsFile`, `applyWaiverScanSettingsToUI`, `derivedRanksWording`,
`formatUnmatchedNames`, `getSleeperMetaByName`, `ordinal`, `isFullyMappedLeague`).

#### Checks run

- `node scripts/check-precache.mjs` OK (78 precached). `node --test` 157/157.
  `cd tests && npx playwright test`: **58/58**, screenshots identical (no baseline changed).
- New `tests/mls-scout.spec.mjs` (kept): uploads the fixture rankings as ROS and Weekly through the
  real file inputs and the preview's Save, then Scan Pasted List (this league, then All My Leagues),
  Auto-Find (Whole Roster, then Starting Lineup) and a trade scout. Passes on this branch **and**
  on main's code.
- Throwaway spec (not committed), run on this branch and origin/main at both widths, with
  byte-identical JSON: both rankings previews, Scan Pasted List in the lineup and roster lenses, the
  scope switch to All My Leagues (buy, then sell intent), Auto-Find in both lenses, a trade scout
  with an unmatched name, then again with the waiver-adjust toggle flipped, the whole Scout tab's
  text, and every localStorage key. No console errors.

#### Other changes

- `sw.js`: the four new modules and `/js/mls/scout/waiverScanner.js` added after `/js/mls/sos.js`;
  `/lineup/waiverScanner.js` removed. CACHE_NAME `v2.8.49` → `v2.8.50`.
- `tests/unit/waiverScanner.test.mjs` imports `../../js/mls/scout/waiverScanner.js`.
- README: the `/js` line mentions `scout/` and `power/`; the `/lineup` line no longer lists
  waiverScanner.js.
- legacy.js's top note mentions 3C.

#### Left for later chunks

- `window.onload` → init.js (3E), unchanged from 3B's note.
- 3D: repoint `scout/engine.js`'s `../legacy.js` import when the TRADE VALUE CURVE / DYNAMIC WAIVER
  ADJUSTMENT VALUE functions move, and `scout/waivers.js`'s (`isAutoLockOverridden`,
  `isDraftPickName`). Moving the trade-verdict code out of `runScout` is still optional for 3D.
- 3F: `power/allLeagues.js` imports the power math from `../legacy.js`; repoint it to
  `power/shared.js` etc. `lineup/` still holds `monteCarloUi.js`, `statsEngine.js`, `worker.js`.
- Comments inside moved code still say "mls.js", "utils.js", "this file", or point at
  `waiverScanner.js` / `rankingsParser.js` by their old locations (5D's sweep).
- Next on the MLS track: 3D (RANKINGS ENGINE onward).

### 3D — MLS: rankings, market, trade value, exports

Everything from `// --- RANKINGS ENGINE ---` up to `// --- RENDERERS ---` left `js/mls/legacy.js`
(1,756 lines; legacy.js is now 2,901), **except `lookupSimPlayer`** (see below). All of 3D's scope
moved; no marker in the card's range is left in legacy.js. Same tooling as 3A–3C (acorn +
eslint-scope in a scratch directory): a throwaway script assigned line ranges to modules, refused a
statement straddling two ranges or a non-comment line outside any statement, built each module's
imports from the original file's module-scope references, added `export` where another module now
needs a name, rejected any cross-module write to a moved binding, and repointed the other modules'
`from './legacy.js'` lines. Checked afterwards: every non-blank, non-import line of `js/mls/*.js` at
main is present **exactly once** across `js/mls/**/*.js` once `export ` prefixes are ignored; the
only new lines are header comments. Every named import resolves to an export, no import is unused,
and the set of bare globals the js/mls code reads is unchanged. Indentation unchanged.

| New file (under `js/mls/`) | From legacy.js |
|---|---|
| `rankings/engine.js` | RANKINGS ENGINE (`getRankingsFreshness`), plus the unmarked rankings-card helpers that sat after `deleteRankingSet`: `toggleRankingsCard`, `setRankingsCardExpanded`, `updateRankingsMetaDisplay`, `toggleUploadMode`, `togglePosInput` |
| `rankings/sets.js` | NAMED RANKING SETS and CHOOSING WHICH LEAGUES USE A RANKING SET (`resolveRankingsTarget` … `deleteRankingSet`, incl. the league picker and its dialog) |
| `rankings/uploadPreview.js` | `parseFiles` (unmarked, just above the preview), RANKINGS UPLOAD PREVIEW, UPLOAD PROCESSING INDICATOR, and the load-time `#rosFileInput`/`#weeklyFileInput` listeners and drag-and-drop setup that followed them |
| `scout/marketDisconnect.js` | MARKET DISCONNECT ENGINE (incl. its load-time `#marketFileInput` listener, the threshold controls, `processMarketUpload`), `fetchLeagueLogsADP` (the Trade Finder's market fetch; the window name is kept), `parseMarketData`, and the unmarked Trade Finder code after DYNAMIC WAIVER ADJUSTMENT VALUE: `getMarketPositionalRanks`, `updateMarketMetaDisplay`, `runMarketDisconnectAnalysis` |
| `rankings/rosFetch.js` | SHARED MARKET-CONSENSUS FETCH (a comment only) and ROS RANKINGS AUTO-FETCH (`autoFetchRosRankings`) |
| `settings.js` | SHARED MARKET SETTINGS, TRADE ANALYZER SETTINGS, the simulator's `updateSimSetting`/`applySimSettingsToUI` (unmarked, inside the second LINEUP OPTIMIZER SETTINGS block), `applyTradeSettingsToUI`, `applyMarketSettingsToUI` |
| `state.js` (inserted right after `State`) | The second LINEUP OPTIMIZER SETTINGS block (`updateLineupSetting`, with its marker) and `applyLineupSettingsToUI` |
| `trade/valueCurve.js` | TRADE VALUE CURVE (`rankToTradeValue`, `isDraftPickName`, `getMarketValue`) |
| `trade/waiverValue.js` | DYNAMIC WAIVER ADJUSTMENT VALUE (`getDynamicWaiverAdjustmentValue`, `getTopWaiverCandidatesByPosition`) |
| `trade/export.js` | TEXT EXPORT (DISCORD/GROUP CHAT), SCREENSHOT EXPORT (`copyLineupAsText`, `exportLineup`) |
| `lineup/gameInfo.js` (appended) | `toggleLockCountdown`, which sat unmarked between `deleteRankingSet` and the rankings-card helpers. It expands the lock-countdown card that `getNextLockCountdownHTML` (already in gameInfo.js) renders |

#### Placement decisions

- **The two LINEUP OPTIMIZER SETTINGS blocks.** The card says both "merge into state.js" and
  "optimizer settings → settings.js". I took the explicit merge: the first block is the
  `lineupSettings` field inside `State` (key `mls_lineup_settings`, default
  `{ flexKickoffOptimization: true }`, unchanged); the second block's `updateLineupSetting` and its
  `applyLineupSettingsToUI` now sit right after `State` in state.js. That widens 3A's "state.js holds
  non-UI code" rule a little (the updater writes storage and sets one checkbox). Market, trade and sim
  settings went to `settings.js`.
- **`parseFiles` → uploadPreview.js, not engine.js.** It sat just above RANKINGS UPLOAD PREVIEW and
  only `processSingleRankingUpload`/`processMultiRankings` call it. Load order also needs it there: in
  engine.js it would have made engine.js import uploadPreview.js. `init.js` and `leagues/sync.js`
  import engine.js, so uploadPreview.js (and `sos.js`, which it imports) would then have run before
  nav.js, and their load-time file-input listeners would have registered out of mls.js order.
- **`lookupSimPlayer` stays in legacy.js.** It sat between the sim setting and the apply*SettingsToUI
  functions, but it's the simulator's player lookup, so it belongs in 3F's `sim/matchup.js`.
- **The trade-verdict code stays inside `runScout`** (`scout/engine.js`). 3C left this optional for
  3D; splitting it would mean editing `runScout`, not moving whole statements.

#### Load order

legacy.js's import list gains, after `./scout/allLeaguesSearch.js`: `./rankings/engine.js`,
`./rankings/sets.js`, `./rankings/uploadPreview.js`, `./scout/marketDisconnect.js`,
`./rankings/rosFetch.js`, `./settings.js`, `./trade/valueCurve.js`, `./trade/waiverValue.js`,
`./trade/export.js` (mls.js order, side-effect imports where legacy uses nothing from them), and
`applyLineupSettingsToUI` on the `./state.js` line. legacy.js dropped the imports nothing left in it
uses (`parseRankingsFiles`, `fetchMarketConsensusData`, `posRankTag`, and three names from
`scout/waivers.js`). Simulated evaluation:
`compat → constants → helpers → lineup/gameInfo → state → lineup/earlyGames → leagues/scoutResults →
players → leagues/addPlayer → scout/waiverScanner → power/allLeagues → scout/allLeaguesSearch →
trade/valueCurve → scout/waivers → trade/waiverValue → scout/engine → settings → leagues/sync →
rankings/sets → rankings/engine → init → nav → backup → lineup/headshots → leagues/handoff →
leagues/importAll → sos → rankings/uploadPreview → scout/marketDisconnect → rankings/rosFetch →
trade/export → legacy → main`. The modules that now run early (valueCurve, waiverValue, settings,
sets, engine) have no load-time code beyond declarations and literals (`let leaguePickerOpen = false`).
Load-time effects, in order: `State` → scoutResults → nav's listeners → headshot setting → SoS file
listener → rankings file-input listeners and drag-and-drop → market file listener → legacy's own top
level → main's `window.*` block: the same order as mls.js. No load-time code reads an import from a
module that evaluates later.

**Repointed imports:** `main.js` (35 window names now import from their new modules; new import lines
after the existing ones, `updateLineupSetting` added to the `./state.js` line; the `window.x = x;`
block is untouched), `init.js` (`setRankingsCardExpanded` → `rankings/engine.js`), `leagues/sync.js`
(`getRankingsFreshness`, `updateRankingsMetaDisplay` → `rankings/engine.js`;
`applyMarketSettingsToUI` → `settings.js`), `scout/engine.js` (value curve and waiver value →
`trade/`), `scout/waivers.js` (`isDraftPickName` → `trade/valueCurve.js`). The new modules import
`loadRosterTab` from `../legacy.js`; `isAutoLockOverridden`, `getPowerLeagueKind` and `loadRosterTab`
are the legacy names other modules still import.

#### Checks run

- `node scripts/check-precache.mjs` OK (87 precached). `node --test` 157/157.
  `cd tests && npm run check`: **60/60**, screenshots identical (no baseline changed).
- New `tests/mls-rankings.spec.mjs` (kept) for the card's "ranking upload → apply to multiple
  leagues": syncs the fixture league, creates two manual leagues, uploads ROS rankings and ticks one
  league in the preview's "Also use this set in", checks both leagues point at the set and the third
  doesn't, adds the third through "Choose leagues...", then switches to it and checks the set
  dropdown and header. Passes on this branch **and** on main's code. Note for later specs: manual
  league ids are `'manual_' + Date.now()` and the test clock is fixed, so the spec steps the clock
  between creations (otherwise both leagues share one id).
- Throwaway spec (not committed), run on this branch and an origin/main worktree at both widths, with
  identical JSON apart from stack-trace file locations in two expected `console.error`s: window
  property names, multi-file mode and position toggles, a multi-file upload preview (cancelled), ROS
  and Weekly previews and cards, a new Weekly set shared from the preview, the "Choose leagues..."
  dialog with Select all, switching sets, deleting a set, a market CSV upload and its meta line, the
  Trade Finder in three mode/basis combinations (labels, thresholds, output HTML), a trade scout
  before and after flipping the trade/market/lineup/sim settings, the settings controls, ROS
  auto-fetch and the market fetch (both blocked, so their error paths), the lock-countdown toggle,
  copy-as-text and screenshot export (library blocked), the Lineup tab text, and every localStorage
  key and value. Tooltip ids (`mds-tip-N`) in the trade verdict differed once when both widths ran in
  parallel; run singly, main and the branch match, so that's timing, not the move.

#### Other changes

- `sw.js`: the nine new modules added after `/js/mls/scout/waiverScanner.js`. CACHE_NAME
  `v2.8.50` → `v2.8.51`.
- README: the `/js` line mentions `rankings/` and `trade/`.
- Header comment on each new file; one-line notes on state.js and lineup/gameInfo.js headers;
  legacy.js's top note mentions 3D.

#### Left for later chunks

- `window.onload` → init.js (3E), unchanged from 3B's note. It now also calls
  `updateRankingsMetaDisplay`, `updateMarketMetaDisplay` and the apply*SettingsToUI functions from
  the 3D modules; all at call time, so moving it doesn't change that.
- 3E: RENDERERS onward. `rankings/sets.js`, `rankings/uploadPreview.js` and `rankings/rosFetch.js`
  import `loadRosterTab` from `../legacy.js`; repoint them when it moves.
- 3F: `lookupSimPlayer` (legacy.js, between `onload` and `// --- RENDERERS ---`) goes to
  `sim/matchup.js` with the simulator.
  `trade/waiverValue.js`'s `getTopWaiverCandidatesByPosition` is used only by WAIVER INSIGHTS.
- 7A's card allowed doing its MLS part "right after 3D" if 3A had started first. 7A ran before 3A
  and did the MLS part itself (LOG: 7A), so nothing is pending; the market code is now in
  `scout/marketDisconnect.js` and `settings.js` if anyone revisits it. `fetchLeagueLogsADP` keeps its
  name for the inline handler (5C can rename it).
- legacy.js's "Pilot ES module extraction" comment now sits above the Sleeper import, since the
  `parseRankingsFiles` import it described moved to `rankings/uploadPreview.js`. Comments inside moved
  code still say "this file", "mls.js", "utils.js" or "rankingsParser.js" (5D's sweep).
- Next on the MLS track: 3E (RENDERERS onward).

### 3E — MLS: renderers

Everything from `// --- RENDERERS ---` up to `// --- POSITIONAL POWER RANKINGS: SHARED MATH ---` left
`js/mls/legacy.js`, **plus `window.onload`**, which 3A–3D left at the top of legacy.js for this chunk
(1,364 lines in all; legacy.js is now 1,548). All of 3E's scope moved; no marker in the card's range
is left in legacy.js. Same tooling as 3A–3D (acorn + eslint-scope in a scratch directory): a
throwaway script assigned line ranges to modules, refused a statement straddling two ranges or a
code line outside any statement, built each module's imports from legacy.js's module-scope
references, added `export` where another module now needs a name, rejected any cross-module write to
a moved binding, and simulated the evaluation order with a check for load-time reads of
not-yet-evaluated imports. Checked afterwards against origin/main: every non-blank, non-import line of
`js/mls/**/*.js` is present **exactly once**, once `export ` prefixes are ignored. The only lines that
differ are comments: the new file headers, the re-export note below, and the updated top notes of
legacy.js and init.js. Every named import resolves to an export, no import is unused, and the set of
bare globals the js/mls code reads is unchanged. Indentation is unchanged.

**Split by tab, not one render.js.** The functions share no local state beyond the rookie index
(one module-level `let`, read only by the Roster tab), so per-tab files work. There's no
`render/scout.js`: nothing in RENDERERS renders the Scout tab (3C moved that code to `scout/`). What
the section held was each tab's renderer *and* its controls, so those moved together:

| New file (under `js/mls/`) | From legacy.js |
|---|---|
| `render/rookies.js` | ROOKIE LOOKUP (`_rookieIndex`, `getRookieIndex`, `isRookiePlayer`) |
| `render/roster.js` | The `// --- RENDERERS ---` marker and `loadRosterTab` (Roster tab) |
| `render/lineup.js` | Lineup tab: `setPlayerLockState`, `toggleLock`, `isAutoLockOverridden`, `overrideAutoLock`, `unlockAllPlayers`, `slotAcceptsPos`, `initiateSwap`, `optimizeFlexKickoffOrder`, `optimizeLineup`, then (after the Dashboard block) `lineupRankBadge`, `renderLineupUI` |
| `render/dashboard.js` | Dashboard (Setup tab), one contiguous block: `renderSyncLogs` (the sync-log accordion), `optimizeAllLineups` and `syncAllLeagues` (their buttons are on the Dashboard) |
| `init.js` (appended) | `window.onload` (`export const onload`, from the top of legacy.js) and STARTUP CLEANUP (its `DOMContentLoaded` listener), in that order |
| `shortcuts.js` | POWER-USER KEYBOARD SHORTCUTS (MLS), the document `keydown` listener |

#### New convention: early modules reach moved names through legacy.js

3A's rule says to repoint every `from './legacy.js'` line that names a moved function. **3E doesn't
do that.** The modules that import `loadRosterTab`, `renderLineupUI` or `isAutoLockOverridden`
(`state.js`, `nav.js`, `sos.js`, `lineup/gameInfo.js`, `lineup/earlyGames.js`, `leagues/addPlayer.js`,
`leagues/sync.js`, `scout/waivers.js`, `rankings/sets.js`, `rankings/uploadPreview.js`,
`rankings/rosFetch.js`) all evaluate *before* the point where the new modules belong. Importing
from legacy.js never triggers an evaluation, because legacy.js is always on the stack. Importing
from `render/*.js` does: that module and its imports would evaluate ahead of the importer. The
simulation showed the effect when everything was repointed. `state.js` → `render/lineup.js` →
`leagues/sync.js` → `leagues/scoutResults.js`, whose top level reads `State.activeLeagueId` while
`State` is still in its TDZ (a load-time crash). The headshot setting and the SoS file listener
would also have run ahead of nav.js's listeners.

So those modules keep their `../legacy.js` import lines unchanged. legacy.js imports the moved names
and **re-exports** them, in one `export { … };` line with a comment, right after its import list.
init.js's new `onload` imports four names the same way (`checkForDraftStrategistHandoff`,
`generateSoSGrid`, `updateMarketMetaDisplay`, `renderSyncLogs`). Their modules (handoff, sos,
marketDisconnect, render/dashboard) evaluate after init.js, and a direct import would pull them in
front of nav.js. The rule for 3F and later: **a module may import a name directly only if the
exporting module, and its whole import subtree, already evaluates before the importer. Otherwise go
through legacy.js's re-export line.** Re-run the evaluation simulation after any import change.
`main.js` evaluates last, so it imports directly (the 9 window names moved to its `./render/lineup.js`,
`./render/dashboard.js` and `./init.js` lines; the `window.x = x;` block is untouched).

#### Load order

legacy.js's import list gains, after `./trade/export.js`: `./render/rookies.js`, `./render/roster.js`,
`./render/lineup.js`, `./render/dashboard.js`, `./shortcuts.js` (mls.js order). Simulated evaluation
is main's order exactly, with the five new modules just before legacy.js:
`… scout/marketDisconnect → rankings/rosFetch → trade/export → render/rookies → render/roster →
render/lineup → render/dashboard → shortcuts → legacy → main`. No pre-existing module moved. None of
the new render modules has load-time code beyond declarations (`let _rookieIndex = null` etc.). Two
load-time effects changed where they register:
- STARTUP CLEANUP's `DOMContentLoaded` listener now registers when init.js evaluates (before nav.js)
  instead of in legacy.js's body. It's the only `DOMContentLoaded` listener in the MLS module graph.
  The shared ones (banners, feedback form, scroll shadows, tooltips) come from `js/shared/globals.js`,
  a separate module script that always runs first. All of them still run in the same order, and
  this one only removes an unused localStorage key.
- The shortcuts `keydown` listener registers in `shortcuts.js`, right before legacy.js's body
  instead of inside it. It's the only document `keydown` listener in the MLS module graph, and it
  still registers during module evaluation, so it still runs before the shared tooltips one (which
  `js/shared/ui/tooltips.js` adds at `DOMContentLoaded`).

#### Checks run

- `node scripts/check-precache.mjs` OK (92 precached). `node --test` 157/157 (with
  `tests/node_modules` installed). `cd tests && npm run check`: **64/64**, screenshots identical (no
  baseline changed).
- New `tests/mls-keyboard.spec.mjs` (kept), for the card's keyboard check: tab shortcuts 1–5,
  a digit typed in a field doesn't switch tabs, Escape closes the drawer, lock by Enter, then Tab,
  Ctrl+Z / Ctrl+Y, swap start and cancel by Enter, and where focus lands after each rebuild. Passes
  on this branch **and** on main's code.
- Throwaway spec (not committed), run on this branch and an origin/main worktree at both widths, with
  **byte-identical** JSON: STARTUP CLEANUP removing a seeded `shared_sleeper_league_id`, window
  property names, every shortcut (tab and hash), Escape (and the focus after it), the empty Roster
  and Lineup states, the Roster HTML (rookie/taxi/SoS badges) and header, the Lineup and Bench HTML,
  and focus plus toasts after each keyboard action: Optimize Lineup, lock, Tab, undo/redo, swap
  start/cancel, an invalid swap (error toast), a valid starter↔bench swap, Unlock All through its
  confirm dialog, override auto-lock, Optimize All and Sync All (toasts, button state, sync-log
  accordion), Shift+→, then a reload (the onload path: tab, Lineup, Roster) and every localStorage
  key and value. "Focus retention on pool rebuilds" is unchanged. After each lineup rebuild,
  focus is on `<body>` on both trees, and Tab goes to the next control.
  Run-to-run noise to know about: headshot `<img>` tags in the Roster HTML come and go between runs
  on *both* trees. The test router aborts them, and `onerror="this.remove()"` races the snapshot. The
  spec strips them before comparing.

#### Other changes

- `sw.js`: the five new modules added after `/js/mls/trade/export.js`. CACHE_NAME
  `v2.8.51` → `v2.8.52`.
- README: the `/js` line mentions `render/`.
- Header comment on each new file. init.js's header no longer says onload is in legacy.js.
  legacy.js's top note mentions 3E.

#### Left for later chunks

- **3F (delete legacy.js) inherits the re-export line.** When legacy.js goes, the early modules
  above need another way to reach `loadRosterTab`, `renderLineupUI` and `isAutoLockOverridden`
  (and init.js its four names) without pulling `render/*.js` ahead of them. The hard constraint is
  `state.js`. It must not have `leagues/scoutResults.js` in its import subtree, or
  `let _scoutResultsLeagueId = State.activeLeagueId;` reads `State` in its TDZ. Options: move the
  re-export line to `main.js` (also always on the stack, so it never triggers an evaluation; the
  importers would then import from `main.js`), or accept a reordered load and prove it safe by
  simulation. Whatever 3F picks, record it as the convention.
- 3F's code still in legacy.js imports `slotAcceptsPos` (Waiver Insights), `loadRosterTab`,
  `isAutoLockOverridden` and `renderLineupUI` from `render/lineup.js` / `render/roster.js`, and
  `render/roster.js` imports `refreshPowerRankings` from `../legacy.js` (now exported). Repoint that
  when POSITIONAL POWER RANKINGS moves. `lookupSimPlayer` is still in legacy.js for 3F's
  `sim/matchup.js`.
- Comments inside moved code still say "above"/"below" about functions that are now in other files
  (for example "see undoLineupChange/redoLineupChange above" in shortcuts.js), or name "this file",
  `mls.js` or `utils.js` (5D's sweep).
- 5B rewrites the inline handlers in these templates (`toggleLock`, `initiateSwap`,
  `overrideAutoLock`, `unlockAllPlayers`, `deletePlayer`, Optimize/Sync All), which are now in
  `js/mls/render/*`, as its card expects. `mls-keyboard.spec.mjs` should keep passing through that.
- Next on the MLS track: 3F.

### 3F — MLS: power rankings, simulator; delete legacy.js

Everything left in `js/mls/legacy.js` (from `lookupSimPlayer` through the end of `runMatchupSim`)
moved out, and **legacy.js is deleted**. The three simulator files moved from `lineup/` to
`js/mls/sim/` with `git mv`. `lineup/` now holds only `index.html` and `manifest.json`. Same tooling
as 3A–3E (acorn + eslint-scope in a scratch directory): a throwaway script assigned legacy.js's line
ranges to modules, refused a statement straddling two ranges or a code line outside every range,
built each module's imports from legacy.js's module-scope references, added `export` where another
new module needs a name, and rejected any cross-module write to a moved binding. Checked afterwards
against origin/main: every non-blank, non-import line of `js/mls/**/*.js` plus the three old
`lineup/*.js` files is present **exactly once** under `js/mls/`, once `export ` prefixes are
ignored. The only lines that differ are comments (legacy.js's file header and its "Pilot ES module
extraction" note, both dropped; main.js's header and the re-export comment, rewritten; the new file
headers) and the one Worker URL line below. Every named import resolves to an export, and no import
is unused. The set of bare globals the code reads is unchanged: the only new entries (`Worker`,
`self`, `performance`, `requestAnimationFrame`, `cancelAnimationFrame`) come from the moved sim files,
which the check didn't scan when they lived in `lineup/`. Indentation unchanged.

| New file (under `js/mls/`) | From legacy.js |
|---|---|
| `power/shared.js` | POSITIONAL POWER RANKINGS: SHARED MATH (`POWER_POSITIONS` … `pickPowerStarters`), plus `computePositionalPower` and `powerTier`, which sat under FUTURE VALUE |
| `power/futureValue.js` | FUTURE VALUE (`POWER_AGE_CURVES`, `powerAgeFactor`), plus the Sleeper age index (`_powerAgeIndex`, `_powerAgeState`, `ageFromMeta`, `ensurePowerAgeIndex`) and `resolvePowerFuture`, which sat under TEAM DIRECTION LABELS |
| `power/directionLabels.js` | TEAM DIRECTION LABELS (`getPowerLeagueKind`, `assignPowerLabels`, `powerLabelAdvice`) |
| `power/rosterCard.js` | POSITIONAL POWER RANKINGS: ROSTER TAB CARD (`updatePowerSetting`, `resolvePowerRankingsSource`, `refreshPowerRankings`), plus `goToPowerRankings`, `runPositionalStrength` and `renderPowerRankingsTable`, which sat after the SNAPSHOT block |
| `power/snapshot.js` | ACTIVE ROSTER: POWER RANKINGS SNAPSHOT (`renderRosterPowerStrip`, `scrollToPowerRankings`) |
| `lineup/injuryAudit.js` | The Global Injury Auditor (`isAuditOut`, `buildCleanNameCandidateIndex`, `resolveManualPlayer`, `runGlobalInjuryAudit`), which sat unmarked after the SNAPSHOT block. Not on the card; its button is on the Lineup tab |
| `sim/matchup.js` | MATCHUP SIMULATOR (MONTE CARLO) (`runMatchupSim`, including its WAIVER INSIGHTS block), then `lookupSimPlayer` (3D left it at the top of legacy.js; it now sits after `runMatchupSim`, where its "the matchup simulation above it" comment says it is) |
| `sim/ui.js` | `git mv lineup/monteCarloUi.js`. Two edits: its import is `./stats.js`, and the Worker URL (below) |
| `sim/stats.js` | `git mv lineup/statsEngine.js` (content identical) |
| `sim/worker.js` | `git mv lineup/worker.js` (content identical) |
| `rankings/uploadPreview.js` (appended) | legacy.js's last four lines, an orphan comment about `loadSheetJS` ("The call sites above use it"). Its call site is in this file, so the comment went with it |
| `main.js` | legacy.js's import list (in the same order) and its re-export line (see below) |

#### Placement decisions

- **By content, not marker**, as 2A and 3A did. `computePositionalPower` and `powerTier` sat under
  `// --- FUTURE VALUE ---`, but SHARED MATH's own comment describes `computePositionalPower`, and
  `power/allLeagues.js` imports both. The age index and `resolvePowerFuture` sat under TEAM
  DIRECTION LABELS, but they supply the card's Future column. The card's table renderer and its
  Scout-tab pointer sat after SNAPSHOT, but they belong to the card.
- **WAIVER INSIGHTS stays inside `runMatchupSim`**, so there's no `scout/waiverInsights.js`. The
  marker is indented: the block is part of `runMatchupSim`'s body and uses its locals (`league`,
  the rosters, the score histories), so splitting it out means writing a new function, not moving
  statements. This is the same call 3C made for the trade verdict inside `runScout`. It's the only
  caller of `getTopWaiverCandidatesByPosition` (`trade/waiverValue.js`).
- **The Worker URL.** `new Worker()` resolves against the page URL (`/lineup/`), not the module's,
  so `new Worker('./worker.js')` became `new Worker('../js/mls/sim/worker.js')`, with a one-line
  comment saying why. `scripts/check-precache.mjs` resolves Worker targets the same way, so it checks
  the new path. I kept a plain string instead of `new URL('./worker.js', import.meta.url)`, because
  the checker's regex only reads string literals.

#### New convention: main.js is the load-order list and the re-export point

With legacy.js gone, `main.js` holds what legacy.js did for the module graph:
- **Its import list sets the load order.** It's legacy.js's list, in the same order (shared
  modules included, so `sim/ui.js` still constructs the Worker at the same point, before `State`),
  then the seven new modules. Each line names what main.js needs from that module (window names,
  re-exported names). A module it needs nothing from is a side-effect import (`import './x.js';`),
  kept only for the order. When adding a module, add its line where its code sat in mls.js.
- **3E's re-export line moved to main.js**, as 3E suggested. Modules that evaluate before the
  module holding a name now import it from `main.js` (`./main.js` or `../main.js`). main.js is the
  entry, so it's mid-evaluation for the whole graph, and importing from it never triggers an
  evaluation. The line has 14 names: 3E's seven, plus the five power-math names
  (`power/allLeagues.js`), `getPowerLeagueKind` (`leagues/sync.js`) and `refreshPowerRankings`
  (`render/roster.js`). All three importers evaluate before `power/*.js`. A direct import would pull
  `power/shared.js` → `futureValue.js` → `rosterCard.js` → … in front of them. The rule from 3E
  still holds: **import a name directly only if its module and that module's whole import subtree
  already evaluate before the importer; otherwise import it from main.js.** The new modules
  themselves evaluate last, so they import directly.

#### Load order

Simulated evaluation from `main.js` (a throwaway script: depth-first over static imports; lists every
top-level statement that isn't a function or literal declaration; flags a load-time read of an
import whose module hasn't finished). The result is main's order exactly, with `lineup/monteCarloUi.js`
/ `statsEngine.js` renamed and the seven new modules where legacy.js was:
`… render/dashboard → shortcuts → power/directionLabels → power/snapshot → power/rosterCard →
power/futureValue → power/shared → lineup/injuryAudit → sim/matchup → main`. The list of load-time
effects is identical, in the same order, and the TDZ check finds nothing. None of the new modules has
load-time code beyond declarations and literals (`POWER_AGE_CURVES`, `let _powerAgeIndex = null`, …).

**Repointed imports:** 14 modules' `from './legacy.js'` / `'../legacy.js'` lines now say `main.js`
(names unchanged). `leagues/sync.js` imports `clearSimResults` from `../sim/ui.js`. main.js's
window-name imports now come from their modules (the `window.x = x;` block is untouched: still 72
names, same order).

#### Checks run

- `node scripts/check-precache.mjs` OK (98 precached). `node --test` 157/157.
  `cd tests && npx playwright test`: **66/66**, screenshots identical (no baseline changed).
- New `tests/mls-sim.spec.mjs` (kept) for the card's "sim results match pre-move output for a fixed
  seed". It seeds `Math.random` in the page (init script) and in the worker (the test rewrites the
  worker script on its way in), runs `runMatchupSimulation` from the app's own `sim/ui.js` with fixed
  teams (history, projection, actual score, short-sample fallback, bench and waiver insights), and
  posts a raw message to a fresh worker. It pins the exact numbers (93.71% / 6.29%, every player's
  boom/bust and range, the worker's 89.7 / 10.3). It passes on this branch, **and on origin/main's
  code** with only the two paths swapped back to `lineup/monteCarloUi.js` / `lineup/worker.js`.
- Throwaway spec (not committed), run on origin/main and this branch at both widths with the same
  seed. The JSON is **identical** apart from the expected file paths: window property names, the
  power strip and the power-rankings table (rankings source, then market), `runPositionalStrength`,
  `goToPowerRankings`, three in-app simulator runs (the last with Waiver Insights on), the fixed-team
  simulator HTML, the raw worker result, `lookupSimPlayer` (found and not found), the Global Injury
  Audit output, toasts, and every localStorage key and value. Run twice on main, it gave
  byte-identical output, so the seeding is deterministic.
- Found while doing this: with the fixture league, **"Run Simulation" never reaches the worker**. It
  stops at "Not enough roster data to simulate this matchup yet", on main too. The smoke test only
  checks that the results box isn't empty, so it passed without exercising the worker.
  `mls-sim.spec.mjs` closes that gap. Making the fixture league simulate end to end would need
  matchups and weekly stats in the Sleeper fixtures. That's a test-fixture follow-up, not an app bug.

#### Other changes

- `sw.js`: removed `/js/mls/legacy.js` and the three `/lineup/*.js` sim files; added the seven new
  modules and `/js/mls/sim/{ui,stats,worker}.js` after `/js/mls/shortcuts.js`. The PRECACHE comment
  now names `js/mls/sim/worker.js`. CACHE_NAME `v2.8.52` → `v2.8.53`.
- `tests/unit/statsEngine.test.mjs` imports `../../js/mls/sim/stats.js` (header comment says so, in
  waiverScanner.test.mjs's style). The file keeps its name.
- `lineup/index.html`: three comments that pointed at `js/mls/legacy.js` now name
  `power/snapshot.js` / `power/rosterCard.js`. Comments only, so screenshots are unaffected.
- README: the `/js` line mentions `sim/` and says main.js's import list sets the load order; the
  `/lineup` line no longer lists the sim files.

#### Left for later chunks

- **The MLS track's split is done.** Next on it: 5B (inline handlers, part 1). The 72-name `window.*`
  block in main.js is unchanged. 5B/5C remove names from it as the handlers go. A window name that
  is also in the re-export line (`renderSyncLogs`) must stay exported after its window line goes.
- `scout/waiverInsights.js` doesn't exist (see above). The owner added runbook card **3G** for it
  (with the trade-verdict block inside `runScout`). Step 1 turns both blocks into functions with no
  user-visible change; step 2 fixes the Waiver Insights bug described in "3F follow-up" below.
- Comments inside the moved sim files still start `// monteCarloUi.js`, `// statsEngine.js`,
  `// worker.js` and name each other by the old file names. `js/shared/api/sleeperStats.js` refers
  to "statsEngine.js". Moved power code says "this file" about things now in other files (for
  example "Same fallback lineup the rest of this file uses" in power/shared.js). These are for 5D's
  comment sweep, along with the ones 3A–3E listed.
- 6A (storage keys through keys.js) can start once 2C (merged) and 3F are on main.

### 3F follow-up — Waiver Insights finds no free agents until the Scout tab has run (found; 3G fixes it)

**Reported by the owner while testing 3F.** In the same Sleeper league with the same ROS and Weekly
rankings, Run Matchup Simulations with Waiver Insights on said "Checked the top 9 available free
agents across RB WR TE…" on main, and "No free agents could be compared against a starter you can
still change this week…" on the 3F branch, every time.

**Not caused by 3F.** The code is identical on both trees. A throwaway Playwright check called
`getTopWaiverCandidatesByPosition` on origin/main and on the 3F branch with the same rankings. Both
returned **0 candidates** with `window.sleeperPosByName` unset, and the **same 12** candidates, in
the same order, once it was filled.

**What it depends on.** Rankings files carry no positions, so `getTopWaiverCandidatesByPosition`
(`js/mls/trade/waiverValue.js`) takes each free agent's position from `window.sleeperPosByName` and
otherwise from loaded Market data (`State.marketRankings`, saved in localStorage under
`mds_season_market`). A player with neither is skipped. `window.sleeperPosByName` isn't saved and
isn't built by a Sleeper sync. Only `runScout` (`js/mls/scout/engine.js`) builds it, so it exists
only after Scan Pasted List, Analyze Trade or another Scout action that calls it has run in this page
session, or after switching leagues while the Scan Pasted List box still holds names
(`switchActiveLeague` in `leagues/sync.js` re-runs the scan then).
With neither the cache nor Market data, Waiver Insights gets zero candidates. It then shows the
"No free agents could be compared" message, which blames game history and kickoffs instead.

So the result depends on what else the person did in that tab, and on which origin they're on (a
preview deploy has its own localStorage, so no saved Market data). The most likely explanation for
the report: the main session had run a Scout scan or had Market data saved, and the branch session
had neither. To confirm in the app, run Scan Pasted List with any name on the branch, then run the
simulation again; it should check free agents. Or reload main and run the simulation first thing;
it should show the empty message.

**Fix: runbook card 3G, step 2** (the owner's call: 3G already opens Waiver Insights). Have Waiver
Insights build the position lookup when it's missing, the same way `runScout` does (a shared
`ensureSleeperPosByName()`), or read positions from the Sleeper player map `runMatchupSim` already
loads. Also, when there are zero candidates, say why ("no ranked free agents with a known
position") instead of the history/kickoff message. Add a test that runs Waiver Insights in a fresh
page with no Scout run first. Note for that test: the fixture league rosters all 24 players in
`tests/fixtures/rankings.csv`, so it has no free agents at all. The test needs extra unrostered
names in its rankings.

### 3G — MLS: Waiver Insights and the trade verdict as their own functions; fix Waiver Insights' free-agent positions (step 2 is a behavior change)

Three commits, in this order: the baseline spec and fixtures (run against main's app code), step 1
(two inline blocks become functions, no user-visible change) and step 2 (the Waiver Insights fix).
No `// --- WAIVER INSIGHTS ---` or `// --- TRADE FAIRNESS VERDICT(S) ---` marker is left inside
`runMatchupSim` or `runScout`; each now sits above its new function.

| New file (under `js/mls/`) | From |
|---|---|
| `scout/waiverInsights.js` | `runMatchupSim`'s WAIVER INSIGHTS block (`sim/matchup.js`) → `export async function getWaiverInsights({ … })`, returning `{ waiverInsights, waiverInsightsStatus }` |
| `trade/verdict.js` | `runScout`'s TRADE FAIRNESS VERDICT(S) block (`scout/engine.js`) → `export function buildTradeVerdictHTML(getResults, giveResults)`, returning `verdictHTML`; plus `renderTradeVerdict` (and its WAIVER ADJUSTMENT sub-marker), which nothing else called |
| `players.js` (added) | Step 2: `ensureSleeperPosByName()`, the code from `runScout` that builds `window.sleeperPosByName` |

#### Step 1: how the blocks became functions

- **Parameters by scope walk** (acorn + eslint-scope in a scratch directory, as 3A–3F): the Waiver
  Insights block reads nine `runMatchupSim` locals (`team1Players`, `lockedStarterIds`, `rosterMap`,
  `playerMap`, `season`, `currentWeek`, `scoringKey`, `getProjectedMean`, `compareAgainstWeakestStarter`),
  writes none of them, and only `waiverInsights` / `waiverInsightsStatus` are read after it. Nine
  positional parameters read badly, so `getWaiverInsights` takes one object and destructures those
  exact names; the call passes them by shorthand (`getWaiverInsights({ team1Players, … })`). The
  verdict block reads `getResults`, `giveResults` and writes `verdictHTML`, which the function now
  declares (`let verdictHTML;`) and returns.
- **Lines unchanged.** A script cut each block by line range (located by its marker, boundaries
  asserted) and wrapped it. The Waiver Insights lines are byte-identical: `scout/` files indent their
  top level by 4 (the old IIFE), so the body lands at the same 8 spaces. The verdict block was at
  16 spaces inside two `if`s, so it's re-indented by 8, nothing else. Checked afterwards against
  origin/main: the multiset of trimmed non-blank lines over `js/mls/**` differs only in the file
  headers, the imports, the wrappers (signature, `let verdictHTML;`, the two `return`s) and the two
  call sites. No import is unused, and the set of bare globals is unchanged. Each marker moved to
  just above its function (one comment line each, re-indented to the function's level).
- **Imports.** `sim/matchup.js` imports `getWaiverInsights` and no longer imports
  `getTopWaiverCandidatesByPosition`; `scout/engine.js` imports `buildTradeVerdictHTML`. Both
  importers evaluate after every module the new files import, so the 3E/3F rule allows direct
  imports. main.js lists each new module as a side-effect import just before the module that calls
  it (`./trade/verdict.js` before `./scout/engine.js`, `./scout/waiverInsights.js` before
  `./sim/matchup.js`).
- **Evaluation order** (re-simulated: depth-first over static imports from main.js, load-time
  statements listed, TDZ reads flagged): identical to main's, except the two new modules, each just
  before its importer (`… trade/waiverValue → trade/verdict → scout/engine …`,
  `… lineup/injuryAudit → scout/waiverInsights → sim/matchup → main`). Same load-time effects, no
  TDZ reads. Neither new module has load-time code beyond imports and function declarations.

#### Step 2: the fix (user-visible)

**Before:** with Waiver Insights on, Run Matchup Simulations found no free agents in a page where no
Scout action had run yet (Scan Pasted List, Analyze Trade, …) and no Market data was loaded, and
said "No free agents could be compared against a starter you can still change this week. They
either don't have enough game history yet…", which blamed the wrong thing (see "3F follow-up" above).

**After:**
- Waiver Insights compares free agents on a fresh page load. `getWaiverInsights` calls
  `ensureSleeperPosByName()` before `getTopWaiverCandidatesByPosition`. That function is the code
  `runScout` used to run inline (one `console.warn` reworded from "for position badges" to "for
  player positions", since it now serves both). `runScout` calls it in the same place, after the
  same "Looking up player positions…" placeholder. `window.sleeperPosByName` is still the store
  (`getTopWaiverCandidatesByPosition` and `runScout`'s `getPos` read it), still not saved anywhere,
  and still left unset when the player map can't load, so both callers fall back to Market data as
  before and the next call retries.
- When no unrostered ranked player can be given a position (zero candidates before the id, history
  and kickoff checks), the card says: "No free agents to compare: none of the unrostered players in
  your rankings could be matched to a position. Waiver Insights looks each name up in Sleeper's player
  list (or Market Consensus data), so check that your rankings use the names Sleeper does. If every
  ranked player is already on a roster in this league, there's no one to check." This is a new
  `noCandidates` flag on `waiverInsightsStatus`, checked in `sim/ui.js` after the failed, no-rankings
  and all-starters-kicked-off cases (those keep their messages and their precedence) and before the
  history/kickoff message.
- Also visible: with Market data loaded, free agents the market file gave no position (or doesn't
  list) used to be skipped unless a Scout action had run; Sleeper's positions now cover them.
- Unchanged: thresholds, 3 candidates per position, the win-probability math, every other message,
  the visible app version label (bug fix only, per its comment in `lineup/index.html`).

#### Tests

- **Fixtures** (`make-fixtures.mjs`): six free agents (`FREE_AGENTS`, on no roster) in the player
  map, stats and projections; each team's matchup now lists Sleeper starters, filled slot by slot.
  The JSON diff only adds entries (and the starters); no existing player's numbers changed.
  `mds-sync.spec.mjs`'s player-cache count reads the fixture instead of hard-coding 28.
  `tests/fixtures/rankings-waivers.csv` is rankings.csv plus the six free agents (ranks 25–30).
- **`helpers.mjs`**: `seedSimRandom` (the seeded page and worker from `mls-sim.spec.mjs`) and
  `loadMlsRankings` (the ROS + Weekly upload from `mls-scout.spec.mjs`), shared now; both specs use them.
- **New `tests/mls-waiver-insights.spec.mjs`** (kept, 3 tests × 2 widths): the real simulator with
  Waiver Insights on (1) after Scan Pasted List, pinning the four free agents compared and the win
  probability (committed and passing before step 1, i.e. on main's app code); (2) in a fresh page
  with no Scout action, which must compare the same four (fails before step 2); (3) with two
  unrostered names Sleeper doesn't know and no Market data, which must show the new message.
- **Throwaway comparison spec** (not committed), on an origin/main worktree and on this branch at
  both widths: in-app simulator results HTML, the position-lookup size and toasts for Waiver Insights
  after a scan (on, then off), in a fresh page, with no rankings, with Market data only, and with
  unknown free agents; Trade Analyzer output for 13 trades (no rankings, ROS only, one-sided either
  way, unmatched names, a fair trade, waiver adjustment off, a bigger adjustment, Market data with
  and without ROS); and every localStorage key. Two runs on main were byte-identical (after waiting
  for the tooltip upgrade, which otherwise races the snapshot). **Step 1: byte-identical to main.**
  **Step 2:** only the intended differences: the fresh-page and Market-only runs now list all four
  free agents (the lookup exists: 34 names), the unknown-names run shows the new message, and the
  lookup exists after the no-rankings run. All trade output is identical.

#### Checks run

- `node scripts/check-precache.mjs` OK (100 precached). `node --test` 157/157.
  `cd tests && npx playwright test`: **72/72** on the final tree (68/68 before the step-2 tests were
  added, after the baseline commit and after step 1). **No screenshot changed.**

#### Other changes

- `sw.js`: `/js/mls/trade/verdict.js` before `/js/mls/scout/engine.js`, `/js/mls/scout/waiverInsights.js`
  before `/js/mls/sim/matchup.js`. CACHE_NAME `v2.8.53` → `v2.8.54` (step 1's commit).
- Header comments of `sim/matchup.js`, `scout/engine.js` and the two new files say what moved.
  `trade/waiverValue.js`'s comment no longer claims the lookup is "populated during Sleeper sync".
  `sim/ui.js`'s JSDoc for `waiverInsightsStatus` lists `noCandidates`.

#### Left for later chunks

- Comments inside the moved lines still point "above"/"below" at code in other files now ("Same
  comparison as Lineup Insights above", "see lockedStarterIds above", "(Trade Finder section below)"),
  `runScout` says "renderTradeVerdict below", and `trade/waiverValue.js` says "see renderTradeVerdict
  above". For 5D's comment sweep.
- The position lookup still isn't saved (it would need a storage key; 6A/6B own those), so each new
  page builds it once from the cached player map.
- 5C (MLS handlers, part 2) can start once 5B and this chunk are on main. Neither new file has inline
  handlers; `sim/ui.js`'s new message has none either.

### 5A — MDS: inline handlers → event delegation

**No `on*=` attribute is left in Draft Strategist.** `grep -nE '\bon[a-z]+=' index.html js/mds/*.js`
finds only a comment. The card counted 44 + 22; the real counts were **45** in `index.html` (the hero
logo's `onerror` wasn't counted) and **28** in template strings (24 in `tracker.js`, counting the four
drag handlers on a queue card; 3 in `team.js`; 1 in `board.js`). Each attribute was swapped by a
script doing exact string replacements, with the expected count asserted per pattern. Markup
structure is unchanged; only attributes changed.

#### The pattern (5B and 5C reuse it)

- **Markup:** `data-action="name"`, plus `data-*` attributes for the arguments the handler used to
  pass as literals: `data-tab="setup"`, `data-id="${p.id}"`, `data-mine="true"`, `data-index="${idx}"`,
  `data-direction="-1"`, `data-pos`, `data-banner` + `data-storage-key`.
- **`js/shared/ui/delegate.js`** (new): `delegate(container, type, actions)` adds one listener. On each
  event it walks `event.composedPath()` from the target up to the container and calls every matching
  action nearest first, with `this` = the element and arguments `(event, element)`. That's the order
  the inline handlers fired in while the event bubbled. It stops if an action stops propagation.
  Read its header before reusing it. Things to know:
  - **Capture phase.** It listens in the capture phase, so it also sees events that don't bubble: an
    `<img>`'s `error`, and a script's `new Event('change')` without `bubbles: true`.
    `tests/mds-sync.spec.mjs` dispatches exactly that on `#autoSyncToggle`, and a bubble-phase listener
    on `#main` missed it, so that test failed until the listener moved to the capture phase.
  - **`event.currentTarget` is the container.** Two handlers read it (`handleQueueDragStart` /
    `handleQueueDragEnd` in `queue.js`, `toggleCardDetails` in `ui.js`). They now take the element as
    a parameter: the only body edits, one line each plus the signature.
  - **Detached elements.** An event fired on an element that an earlier handler detached never
    reaches a container. The case that matters is the queue card's `dragend`. It fires after
    `handleQueueDrop`'s `renderBoard()` has replaced the queue. The inline `ondragend` still ran on
    the detached card and reset `draggedQueueIndex`; without it, a later stray drop on the queue
    (dragged text, say) reordered it with the stale index. Found with a scripted drag sequence: main
    `231 → 231`, branch `231 → 321`. So the `dragstart` action gives the card its own
    `{ once: true }` dragend listener. **5B/5C: look for the same case** wherever a handler
    re-renders the element its event came from.
  - **Action names are unique per page across event types.** A checkbox's change action must not
    also be a click action. That's why `tscoreToggle`'s `onchange="saveSettings()"` became
    `autoSaveSettings` (no button argument), separate from the Save buttons' `saveSettings`
    (`saveSettings(this)`).
- **`js/mds/main.js`** now holds the action tables (`clickActions`, `changeActions`, `inputActions`,
  `errorActions`, `dragActions`). Each entry is the inline handler's code: `this` stays `this`, and
  literals become `this.dataset.*`, with `Number()` for ids and indexes, since the handlers compare
  ids with `===`. The two inline-only code snippets (aggregate toggle, weight-slider labels) and the
  Import Backup button's `.click()` moved into entries verbatim. There's one listener per container
  and event type, on the page's five static regions: `body > header.header` (click, change),
  `#menuOverlay`, `#hamburgerMenu`, `#main` (click, change, input, dragstart/dragover/drop, error) and
  `body > nav.nav-bar`. They're never re-rendered, so the listeners survive every `renderBoard()`.
- **The hero logo's early error.** The inline `onerror` was attached during parsing, and main.js runs
  after parsing, so the logo may already have failed by then. main.js hides any
  `img[data-action="hideImage"]` that is already `complete` with `naturalWidth === 0`. Checked with
  the logo routed to a 404: hidden on main and on the branch.

#### window.* names

Removed **28**, which nothing references any more: `switchDraftProfile resetPicksOnly importMdsSettings
hardReset toggleEditBar toggleCardDetails saveInlineEdit createManualDraft addAndSyncSleeperDraft
handleSmartSync draftPlayer undoDraft toggleQueue handleQueueDragStart handleQueueDragOver
handleQueueDragEnd handleQueueDrop moveQueueItem processPaste quickStartLeagueLogs fetchLeagueLogsADP
processManualADP sendRosterToLineupStrategist toggleRecapMath exportTeam cycleAffinity
toggleQueueCollapse toggleHeadshots`. A diff of `Object.getOwnPropertyNames(window)` on `/` shows
exactly these 28 missing compared with main, and nothing new (1,248 → 1,220).

Kept **7**, because something still reads them through `window` (main.js lists who):
`toggleMenu` (ui.js, init.js), `saveSettings` and `renderLiveSyncStatus` (sleeperSync.js),
`exportMdsSettings` (**js/boot.js's rescue backup**, external to the module graph), `showTab`
(ui.js, gestures.js, init.js, **tests/helpers.mjs**), `setPosFilter` (init.js), `toggleAutoSync`
(state.js, sleeperSync.js). Turning the module-internal `window.x(...)` calls into imports would
retire `toggleMenu`, `saveSettings`, `renderLiveSyncStatus`, `setPosFilter` and `toggleAutoSync`, but
that edits bodies, so it's left for 5D (or later). `exportMdsSettings` and `showTab` must stay
regardless.

`window.dismissBanner` (globals.js) is still called by the `dismissBanner` action and by MLS's inline
handlers; it isn't MDS's to remove.

**Renamed (7A left this to 5A):** `quickStartLeagueLogs` → `quickStartFfc`, `fetchLeagueLogsADP` →
`fetchMarketValue` (named after its button, since it also handles the Sleeper ADP options;
`fetchFfcAdp` was taken by the shared client in `js/shared/api/ffc.js`). These are the declarations in
`market.js` and the import in main.js. Bodies are unchanged. MLS's own `window.fetchLeagueLogsADP`
(`js/mls/scout/marketDisconnect.js`) is a different function and is untouched; 5C can rename it.

#### For 6A/6B

The three banner storage keys now sit in `index.html` as `data-storage-key="ds_hide_mls_banner"`,
`"ds_hide_guide_banner"` and `"ds_hide_install_banner"` (they used to be `dismissBanner(...)`
arguments). They're still plain text in HTML, which 6A's card allows; 6B edits them by hand.

#### Checks run

- `node scripts/check-precache.mjs` OK (101 precached). `node --test` 157/157.
  `cd tests && npx playwright test`: **72/72**. **No screenshot changed.**
- **Throwaway spec (not committed), run on main and on this branch at both widths:** it presses every
  control that had an inline handler and records the active tab, menu/overlay state, focus,
  toast, confirm dialog, body class, every localStorage value, and per-step details. Covered: header,
  hamburger, overlay, close button, menu nav, bottom nav (phone), logo, guide banner, the three banner
  dismissals, Smart Sync, the aggregate toggle and slider (mouse and arrow keys), paste, manual ADP,
  Quick-Start, Fetch Market Value, Sync, the T-Score/headshot toggles, both Save buttons, Create
  Manual Draft, the draft switcher, Export/Import Backup (download, file chooser, file input), both
  Reset dialogs, the empty-state "Go to Setup" buttons on three tabs, the queue star, color label,
  card expand (phone), the pencil/edit bar (focus moves into the editor), Save/Cancel, the position
  filters, queue up/down/remove/collapse, Pick/Taken from the queue and the pool, the tracker/board
  live-sync toggles, recap math, Export Team, Undo (team and others), Send to Lineup Strategist (the
  handoff payload and navigation), Board thumbnails and Team avatars hiding when their images fail, and
  the hero logo's 404. It also covers **keyboard paths** (Enter on the hamburger, Escape, Enter/Space on
  Pick, the queue star and the color label, Enter on the pencil, arrow keys on the slider) and an
  **accessibility-tree snapshot (`ariaSnapshot`) of every tab**, empty and seeded. **Result:
  identical** on both widths. The only difference is the renamed function in the stack trace of the
  console error Quick-Start logs for its stubbed 404.
- Drag and drop: Playwright's `dragTo` gives the same order on both (`123 → 231`, 3 runs per width
  each). The hand-dispatched sequence above (dragstart, drop, dragend on the detached card, then a
  stray drop) is identical after the fix. One unobservable ordering difference remains: the card's
  `dragend` listener is now added at dragstart, so a listener someone else attached to the card
  earlier runs before it (the inline handler always ran first).
- **Trap for whoever runs a comparison like this:** `playwright.config.mjs` has
  `reuseExistingServer: true`. A run killed from outside (I used `timeout`) leaves `node serve.mjs`
  running on port 4173, and every later run, from any checkout, silently tests *that* tree. For a
  while my "branch" runs served main's code. Check `ps aux | grep serve.mjs` between runs, and have
  the throwaway spec record which build it loaded.

#### Other changes

- `sw.js`: `/js/shared/ui/delegate.js` added. CACHE_NAME `v2.8.54` → `v2.8.55`.
- `js/mds/market.js` header comment: the rename. README `/js` line: what `mds/main.js` holds now.

#### Left for later chunks

- **5B/5C:** reuse `delegate.js`; read the two caveats in its header (listeners on elements between
  target and container; events on detached elements). MLS's `main.js` can hold its tables the same way.
- **5D:** the module-internal `window.x(...)` calls above could become imports, after which
  `window.toggleMenu/saveSettings/renderLiveSyncStatus/setPosFilter/toggleAutoSync` can go too.
  `js/shared/globals.js`'s header still mentions "onclick handlers in the HTML", which stays true until
  5C.
- **5D (added to its runbook card after 5A, at the owner's request):** rename the `#fetchAdpBtn` id and
  the `.leaguelogs-attribution` class, which kept their LeagueLogs-era names (ids and classes are
  markup, out of scope here). Both pages use them (`index.html`, `lineup/index.html`), the class is
  styled in `css/styles.css` (or wherever 4A puts it), and `tests/mds-sync.spec.mjs` and
  `tests/mls-market.spec.mjs` click `#fetchAdpBtn`. The 5D card has the details.

### 5B — MLS handlers, part 1: shell, Setup, Roster, Lineup

**83 inline handlers became `data-action` attributes**: 70 in `lineup/index.html` and 13 in template
strings. No `on*=` attribute is left in 5B's sections. Same method as 5A: a script made exact string
replacements and asserted the expected count for each pattern. Markup structure is unchanged; only
attributes changed. `js/mls/main.js` holds the action tables. **5C reuses `js/shared/ui/delegate.js` as
it is** (5A's helper; read 5A's "The pattern" above and the file's header).

#### Which sections (where the card was ambiguous)

The page has no Trade, Power, Sim or Settings tab, so I took the card's out-of-scope list as sections
inside the tabs:

| Done in 5B | Left for 5C (still inline) |
|---|---|
| Drawer overlay, drawer, header (hamburger, logo, league prev/next/select), hero logo, bottom nav | — |
| Setup tab: guide/draft banners, the Draft Strategist handoff, Command Center (Sync All, Optimize All), Add/Sync League, Import All, Active League Requirements | Setup tab: the **Advanced Settings** card (headshots toggle, Add Player Manually, Backup & Restore, Factory Reset): 6 handlers |
| Roster tab: the ROS rankings card (including its market-consensus controls), Sync roster, Strength of Schedule | Roster tab: the **Positional Power Rankings** card's source select: 1 |
| Lineup tab: the Weekly rankings card, Optimize/Copy/Export, FLEX kickoff toggle, Early Games, Global Injury Auditor | Lineup tab: the **Monte Carlo** card (Waiver Insights toggle, Run Simulation): 2 |
| The rankings upload preview modal (Cancel, Save) | The **Scout tab** (Waiver Wire Assistant, Trade Analyzer, the Power Rankings pointer, Trade Finder, Sleeper sync banner): 29 |
| Templates: `render/lineup.js` (5), `render/roster.js` (1), plus the ones rendered into these sections from outside `render/`: `leagues/sync.js` (4, the Command Center league rows), `lineup/earlyGames.js` (1), `lineup/gameInfo.js` (1, the lock countdown), `lineup/headshots.js` (1, the headshot `onerror`) | Templates: `scout/allLeaguesSearch.js` (1), `scout/waivers.js` (1), `power/snapshot.js` (1), `power/rosterCard.js` (1, an empty `ontouchstart=""`, the iOS `:hover` trick; 5C decides whether it counts) |

The card's 107 was low: MLS had **108** in `lineup/index.html` and **18** in `js/mls/` (one of them a
comment in `sim/matchup.js`). 5C has **38 + 4** left. `grep -nE '\bon[a-z]+=' lineup/index.html` lists
lines in only those four out-of-scope regions now.

#### Action tables (`js/mls/main.js`, end of the file)

- `clickActions` (40), `changeActions` (8), `errorActions` (2). Each entry is the inline handler's
  code: `this` stays `this`, literals became `this.dataset.*`. `Number()` for `cycleLeague`'s direction
  and `moveLeague`'s index and direction. Player, league and team ids stay strings, because the handlers
  passed them quoted (`toggleLock('${p.id}')`). The values are Sleeper digits, `p_<timestamp>`,
  `manual_<timestamp>` and team codes, so the HTML-decoded `data-*` value is the same string the JS
  literal was.
- **New `data-*` names:** `data-tab`, `data-direction`, `data-index`, `data-id`, `data-league-id`,
  `data-team`, `data-card`, `data-type` (`'ros'`/`'weekly'`), `data-pos`, `data-success-msg-id`,
  `data-setting`, and for the banners `data-banner`, `data-storage-key`, `data-next-banner`,
  `data-next-storage-key`. Nothing in `css/`, `js/` or the tests selected on any of these before.
- **Names that differ from the function** (the "unique per page across event types" rule):
  `selectActiveLeague` is the header `<select>`'s change action, while `switchActiveLeague` is the
  Command Center row button's click action; `updateMarketSettingChecked` is the TEP checkbox
  (`this.checked`), and `updateMarketSetting` is the selects (`this.value`). `removeImage` is the
  headshot's `this.remove()`; `hideImage` is the hero logo's (same as MDS).
- **Containers:** `#drawerOverlay`, `#drawer`, `body > header.header`, `#mainApp`, `body > nav.nav-bar`
  and `#rankingsPreviewOverlay`, all in the static HTML and never replaced. Click on all six; change on
  the header and `#mainApp`; error on `#mainApp`. 5C needs no new container for the Scout tab, the
  Advanced Settings card or the Power and Monte Carlo cards (all inside `#mainApp`). Add a table entry,
  and add `input` to the delegated types if a handler needs it.
- **The hero logo's early error:** handled as in 5A (an already-failed `img[data-action="hideImage"]` is
  hidden when main.js runs). Checked with the logo routed to a 404: hidden on main and on the branch.
- **delegate.js's two caveats, checked for MLS:**
  - *Listeners between the target and the container:* none for 5B's controls. The `addEventListener`
    calls in `js/mls` and `js/shared` are on file inputs, the manual-add box (Advanced Settings), the
    Scout output, the setup checklist's buttons, the league picker modal and toasts. None of these is
    a 5B control or an ancestor of one. The tooltip click/keydown listeners are capture listeners on
    `document`, so they still run first, and their `stopPropagation()` still keeps a tooltip tap from
    reaching an action.
  - *Events on detached elements:* none. Every 5B action handles the one event that re-renders its
    element (lock, swap, override, the league rows, chips). No follow-up event (like MDS's `dragend`)
    is handled.
  - **5C:** the Scout tab's `attachScoutSuggestionHandler` (`players.js`) adds a click listener to
    `#waiverOutput` / `#tradeOutput`. Before you add actions inside those outputs, check the ordering
    it would change.

#### window.* names

Removed **30**, which nothing references any more: `navigateFromDrawer importDraftStrategistRoster
dismissDraftStrategistHandoff syncAllLeagues optimizeAllLineups addAndSyncLeague importAllSleeperLeagues
saveRequirements onRankingSetSelectChange deleteRankingSet toggleUploadMode togglePosInput
processMultiRankings autoFetchRosRankings syncActiveLeague saveManualSoS copyLineupAsText exportLineup
updateLineupSetting addEarlyTeam runGlobalInjuryAudit moveLeague deleteLeagueManager removeEarlyTeam
toggleLockCountdown unlockAllPlayers overrideAutoLock toggleLock initiateSwap deletePlayer`. Found with a
scope analysis (acorn + eslint-scope, scratch directory) over every file in `js/`: no module reads any of
the 72 names as a bare global, so only `window.x` member reads count. Then I grepped the tests, the HTML
and the template strings that are still inline. On `/lineup/`, a diff of `Object.getOwnPropertyNames(window)`,
empty and after a sync, shows exactly these 30 missing compared with main, and nothing new (1,286 → 1,256).

Kept, of the names 5B's handlers called (main.js's comment lists them): `toggleDrawer`, `showTab`,
`cycleLeague`, `switchActiveLeague`, `optimizeLineup`, `cancelRankingsPreview` (other modules call them
through `window`); `confirmRankingsPreview`, `createManualLeague`, `openRankingSetLeagues` (only the tests
call them, through `page.evaluate`; I left the tests unchanged); `toggleRankingsCard` and
`updateMarketSetting` (inline handlers 5C still has to move). `window.dismissBanner` and
`window.dismissBannerAndReveal` belong to `js/shared/globals.js`; MLS's Scout tab still uses the first.

**For 5C:** four names in the block already have no reader at all, no inline handler, no
`window.x` read and no test: `processSingleRankingUpload` (the file inputs' listeners call the import),
`renderSyncLogs` (keep it in the re-export line), `runPositionalStrength` and `renderPowerRankingsTable`.
They weren't 5B's handlers, so I left them. `window.onload` also shows up as unread, but the browser
reads it, so it stays. Re-run the scan rather than trusting this list; build the name list with
`sed -n 's/^window\.\([A-Za-z]*\) = .*/\1/p' js/mls/main.js`.

#### Checks run

- `node scripts/check-precache.mjs` OK (101 precached). `node --test` 157/157.
  `cd tests && npx playwright test`: **72/72**. **No screenshot changed.** `mls-keyboard.spec.mjs`
  (lock, swap and focus by keyboard) passes unchanged.
- **Throwaway spec (not committed), run on an origin/main worktree and on this branch at both widths:**
  it presses every control 5B moved and records the active tab, drawer/overlay/hamburger state, the
  active nav button, focus, every `showToast` message (wrapped by an init script), the copied text,
  the confirm dialog, the preview and league-picker overlays, the header league list, the prev/next
  state, the rankings cards' and lock countdown's `aria-expanded`, the HTML of ten regions (Command
  Center rows, sync log, roster, lineup, bench, early-games chips, injury audit, the three banners)
  with only the swapped attributes stripped, and every localStorage key and value. It ends with an
  `ariaSnapshot` of the three tabs, the header, the drawer and the bottom nav. It covers the hamburger
  (click, Enter), the overlay, the close button, all five drawer links, Escape, the logo, the four
  bottom-nav buttons (phone), the guide banner (go, dismiss and reveal), the draft banner dismissal,
  Sync (empty and the fixture league), Create Manual (empty and named), prev/next, the header
  select, Import All, Sync All, Optimize All, the league rows (switch, move down, move up by keyboard,
  remove: cancel then OK), Save Requirements, handoff import and dismiss, both rankings cards (toggle
  by click and keyboard, upload with the preview's Cancel and Save buttons, set select, Choose leagues,
  delete set with cancel, multi-file mode, position checkboxes by click and Space, Combine & Process),
  the five ROS market controls (and the Scout copies they sync), Auto-Fetch (error path), Sync roster,
  Save Manual SoS, Remove Player (cancel, OK), Optimize, Copy, Export (error path), the FLEX toggle,
  early games (add twice, remove), the injury audit, lock (click, Enter), Unlock All, swap (start,
  cancel, starter↔bench, by Space and Enter), and the hero logo's 404. With kickoff times set through
  the app's own `State` (one team past, the rest future), the lock countdown appears (toggled by Enter
  and by click) and so does the override-lock button (cancel, then OK). These two never render with the
  plain fixture. **Result: identical** on both widths (107 and 111 steps). The only difference is the
  handler's frame name in the stack trace of the console error Auto-Fetch logs for its aborted fetch.
  Two runs on main were byte-identical. No headshot `<img>` that failed to load was left in the page on
  either tree.
- 5A's trap applies: `reuseExistingServer: true` means a leftover `node serve.mjs` serves whichever tree
  started it. I checked `ps aux | grep serve.mjs` between runs, and the spec recorded which build it loaded.

#### Other changes

- `sw.js`: CACHE_NAME `v2.8.55` → `v2.8.56`. No file added (`delegate.js` is already precached since 5A).
- README `/js` line: MLS's `main.js` holds the delegation too.

#### Left for later chunks

- **5C:** the 38 + 4 handlers in the table above; the 5C comments under "Action tables" and
  "window.* names". `tests/mls-scout.spec.mjs` clicks `[onclick^="autoFindWaiverUpgrades"]` (twice), so
  5C must change that selector when it moves Auto-Find (for example to `[data-action="autoFindWaiverUpgrades"]`
  or a role/name locator). That's a test edit, not an app change. `sim/matchup.js`'s header comment
  still says `#run-sim-btn` is bound via `onclick`, and `js/shared/globals.js` still mentions onclick
  handlers; update both when the last one goes.
- **5D:** the module-internal `window.x(...)` calls (`window.optimizeLineup`, `window.showTab`,
  `window.toggleDrawer`, `window.cycleLeague`, `window.switchActiveLeague`, `window.cancelRankingsPreview`
  …) could become imports. Watch the 3E/3F load-order rule: import from `main.js` when the exporter
  evaluates later. The tests' three `window.*` calls could become clicks. Also a comment nit in
  `js/shared/ui/delegate.js`'s header: "The walk still calls actions nearest first. One" runs into the
  next sentence ("Two differences…"). Remove the stray "One".

### 5C — MLS handlers, part 2: Scout, Trade, Power, Sim

**No `on*=` attribute is left in Lineup Strategist.** `grep -rnE '\bon[a-z]+=' lineup/index.html js/mls`
finds nothing, not even a comment. The 38 + 4 that 5B left became `data-action` attributes the same way: a script made exact string
replacements and asserted the expected count for each pattern. Markup structure is unchanged; only
attributes changed. The action-table entries are in `js/mls/main.js`, next to 5B's. `delegate.js` is unchanged.

#### What moved

| Where | Handlers |
|---|---|
| Setup tab, Advanced Settings card | 6: headshots toggle, Add Player, Export Backup, the backup file input, Import Backup (`chooseBackupFile`, same name as MDS), Factory Reset |
| Roster tab, Positional Power Rankings card | 1: the source select (`updatePowerSetting`, `data-setting="source"`) |
| Lineup tab, Monte Carlo card | 2: Waiver Insights toggle (`updateSimSetting`), Run Simulation (`runMatchupSim`) |
| Scout tab | 29: Sleeper sync banner (5B's `dismissBanner` action), the three Clear buttons (`clearWaiverScout`, `clearBuyInput`, `clearSellInput`, each the inline code verbatim), compare/scope/intent buttons, the four waiver-scan controls, Auto-Find, Scan Pasted List, the two trade settings, Analyze Trade, Go to Power Rankings, the five market controls (5B's `updateMarketSetting` / `updateMarketSettingChecked`), Fetch Market Value (`fetchLeagueLogsADP`, not renamed), the two disconnect selects, Find Trade Targets |
| Templates | `scout/allLeaguesSearch.js` (Switch → `scoutGoToLeague`, `data-league-id`), `scout/waivers.js` (section toggle → 5B's `toggleRankingsCard`, `data-card`), `power/snapshot.js` (`scrollToPowerRankings`), `power/rosterCard.js` (see below) |

- **Arguments:** the compare, scope and intent buttons already carried `data-compare`, `data-scope` and
  `data-intent` with the same value as their literal, so the actions read those and no attribute was added.
  `runScout` reads `data-scout-type` (the name the "Did you mean" link already uses). New action names that
  differ from their function (the "unique per page across event types" rule, and one per conversion):
  `updateWaiverScanSettingInt` (the limit select's `parseInt(this.value, 10)`),
  `updateWaiverScanSettingChecked`, `updateTradeSettingChecked`.
- **`ontouchstart=""` on the power-table cells (`power/rosterCard.js`) is removed, not converted.** 5B left
  the call to 5C. It was the old iOS trick that makes Safari treat an element as tappable so `:hover` and
  taps work. That's already provided twice over: `js/shared/ui/tooltips.js` gives every tooltip trigger
  its own click listener for exactly this reason (the cells are `data-tt-self` triggers), and `#mainApp`
  has click listeners (5B's delegation) and touch listeners (`nav.js`'s swipe), and an ancestor below
  `<body>` counts. No screenshot or recorded state changed. On the phone project in the comparison below,
  tapping a cell opens its tooltip the same way on both trees. **Not checked on a real iPhone**, so if a
  power-table tooltip stops opening on iOS, that's the place to look.
- **delegate.js's caveats, checked for 5C's controls.** *Listeners between target and container:* the only
  one is `attachScoutSuggestionHandler`'s click listener on `#waiverOutput` / `#tradeOutput` (`players.js`),
  above the Switch buttons and the waiver-section toggles. It runs in the bubble phase, so it still runs after
  the action (as it ran after the inline handler), and it only acts on `.scout-suggest-link`, which has no
  `data-action`. The "Did you mean" link was pressed in the comparison too. *Events on detached
  elements:* none. Each 5C action handles one event, with no follow-up like MDS's `dragend`.

#### window.* names

Removed **21**: `importMlsSettings factoryReset toggleMlsHeadshots setWaiverIntent scoutGoToLeague
autoFindWaiverUpgrades toggleRankingsCard processSingleRankingUpload toggleDisconnectMode
toggleDisconnectRankBasis fetchLeagueLogsADP updateMarketSetting updateTradeSetting updateSimSetting
runMarketDisconnectAnalysis renderSyncLogs updatePowerSetting goToPowerRankings runPositionalStrength
renderPowerRankingsTable runMatchupSim`. The four 5B flagged (`processSingleRankingUpload`,
`renderSyncLogs`, `runPositionalStrength`, `renderPowerRankingsTable`) are among them; their imports in
main.js went too, except `renderSyncLogs`, which stays in the re-export line. Found with the same scope
analysis as 5B (acorn + eslint-scope over every file in `js/` plus `sw.js`: bare global reads, and
`window.x` / `globalThis.x` / `self.x` member reads). No module reads any of the names as a bare global.
Then I grepped the tests and the HTML. On `/lineup/`, a diff of `Object.getOwnPropertyNames(window)`,
empty and after a sync, shows exactly these 21 missing compared with main, and nothing new (1,256 → 1,235).

Kept **21** (main.js's comment says who reads each): `undoLineupChange`, `redoLineupChange`, `cycleLeague`
(shortcuts.js); `toggleDrawer`, `showTab` (modules and the tests); `exportMlsSettings` (**js/boot.js's
rescue backup**); `goToSetupStep`, `lookupSimPlayer` (init.js); `onload` (the browser); `switchActiveLeague`;
`addManualPlayer` (addPlayer.js's Enter key); `runScout` (players.js); `updateWaiverScanSetting`
(scout/waivers.js); `cancelRankingsPreview`; `scrollToPowerRankings` (power/rosterCard.js);
`optimizeLineup` (many modules); and five that only the tests call through `page.evaluate`:
`createManualLeague`, `openRankingSetLeagues`, `confirmRankingsPreview`, `setWaiverCompare`,
`setWaiverScope` (5B also left the tests unchanged).

#### Checks run

- `node scripts/check-precache.mjs` OK (101 precached). `node --test` 157/157.
  `cd tests && npx playwright test`: **72/72**. **No screenshot changed.**
- **Test edit:** `tests/mls-scout.spec.mjs` clicked `[onclick^="autoFindWaiverUpgrades"]` (twice) and
  `[onclick="runScout('trade')"]`. These are now `[data-action="autoFindWaiverUpgrades"]` and
  `[data-action="runScout"][data-scout-type="trade"]`. Only the selectors changed; the test is otherwise unchanged.
- **Throwaway spec (not committed), run on an origin/main worktree and on this branch, both widths, each
  tree twice:** seeded simulator, the fixture league synced, `rankings-waivers.csv` loaded, and FantasyCalc
  stubbed with all 30 players (ranks reversed so Market Disconnect finds gaps). It presses every control 5C
  moved and records after each step: the active tab, hash, scroll position, focus, toasts, the confirm dialog,
  the header league, every localStorage key and value, every form value in `#mainApp`, and `#mainApp`'s
  whole HTML with only the swapped attributes stripped. 100 steps: the headshots toggle; Add Player (empty and
  typed); Export (the downloaded file); Import (the file chooser, Cancel, and finally OK and its reload);
  Factory Reset (Cancel, and finally OK); every Power Rankings source; the snapshot link; tapping a power
  cell (`tap()` on phone); Waiver Insights on, Run Simulation, off; the sync banner; Scan, Clear; compare,
  scope and intent by click, Enter and Space; every basis/position/limit option and starters-only; Auto-Find
  in FLEX and in All (four sections), a section toggle by click and by Enter; the "Did you mean" link; a
  second (manual) league, then All My Leagues and its Switch button; both trade Clears, the waiver
  adjustment toggle and value, Analyze Trade, Go to Power Rankings; every market option and TEP, Fetch Market
  Value; both disconnect selects, Find Trade Targets in two modes. It ends with an `ariaSnapshot` of the four
  tabs. **Result: identical.** Two runs of the same tree differ only in scroll positions caught mid-smooth-scroll
  under two parallel workers (one step, either tree), and main and the branch differ in nothing else. I first
  saw two other differences that turned out to be timing: `#rosSuccessMsg` hides on a 2.5 s wall-clock timer
  that one step raced, and a 1 px `scrollY` after Go to Power Rankings, a smooth scroll still finishing; with the
  phone project run alone, main lands on the same 1940 as the branch. The spec now waits those out.
- 5A's server trap applies: I checked `ps aux | grep serve.mjs` between runs, and the spec recorded the
  `CACHE_NAME` it loaded (`v2.8.56` on main, `v2.8.57` on the branch).

#### Other changes

- `sw.js`: CACHE_NAME `v2.8.56` → `v2.8.57`. No file added or removed.
- `js/mls/sim/matchup.js` header comment: `#run-sim-btn` is bound through its `data-action` now. `main.js`'s
  comments on the window block and the delegation tables are rewritten for the end state.
- README `/js` line: MLS's `main.js` holds the delegation and the few remaining `window.*` exports.

#### Left for later chunks

- **5D:** the module-internal `window.x(...)` calls (5B's list, plus `window.runScout` in players.js,
  `window.updateWaiverScanSetting` in scout/waivers.js, `window.addManualPlayer` in addPlayer.js,
  `window.scrollToPowerRankings` in power/rosterCard.js, `window.lookupSimPlayer` and `window.goToSetupStep`
  in init.js, `window.undoLineupChange` / `redoLineupChange` / `cycleLeague` in shortcuts.js) could become
  imports (mind the 3E/3F load-order rule). Each name whose last reader goes can then leave main.js's block.
  `exportMlsSettings` (boot.js) and `onload` must stay. The five test-only names could go if the tests
  click instead. `js/shared/globals.js`'s header still says its names serve "onclick handlers in the
  HTML", which is now true only of the T-Score page (18 inline handlers; no runbook card covers them), and
  it still names `mds.js` / `mls.js`. That belongs to 5D's comment sweep. The stray "One" in
  `delegate.js`'s header (5B's note) is still there.
- **Optional rename:** MLS's `fetchLeagueLogsADP` (`scout/marketDisconnect.js`, now a module-internal name
  and a `data-action` value only) could become `fetchMarketValue` like MDS's. It isn't on window any more,
  so only the declaration, main.js's import and table entry, and the attribute would change.

### 6A — Route every storage key through keys.js

**`js/shared/storage/keys.js` is now the only place a storage key is spelled**, apart from
`js/boot.js` and six HTML attributes (both listed below). No key was renamed and no stored value
changed; the registry's key list is identical to 1B's (checked by comparing the old literal list
with the new `STORAGE_KEYS`, per owner).

#### What keys.js exports now

- **`KEYS`**: one named constant per key, grouped by owner: `KEYS.mds.*` (26, e.g. `KEYS.mds.drafts`,
  `KEYS.mds.showHeadshots` for `mds_show_headshots`), `KEYS.mls.*` (30, e.g. `KEYS.mls.leagues` for
  `mds_season_leagues`), `KEYS.shared.*` (`handoffRoster`, `sleeperLeagueId`) and `KEYS.tscore.*`
  (`cache`, `cacheUpdated`, `pageCache`). Property names are the key minus its prefix, camelCased.
- **`mdsDraftPoolKey(draftId)`** and `MDS_DRAFT_POOL_PREFIX` for the one dynamic key,
  `ds_players_<draftId>`. `js/mds/storage.js`'s `draftPoolKey` is now `= mdsDraftPoolKey` (same name kept
  for its importers).
- Unchanged names: `MDS_PREFIX`, `MLS_PREFIXES`, `IDB_DATABASES`, `isMdsOwnedKey`, `isMlsOwnedKey`
  (bodies untouched). `MDS_SHOW_HEADSHOTS` / `MDS_HANDOFF_ROSTER` are now aliases of the `KEYS` entries.
  `STORAGE_KEYS` (the flat lists per owner) is derived from `KEYS`, so it can't drift.

#### Call sites

A script replaced each quoted key literal with its `KEYS.*` path, looked up from the registry itself
(so a typo is impossible), and added the import after each file's last import line. Per-file counts
matched the pre-change grep: 30 files in `js/mds`, `js/mls`, `js/shared/ui/banners.js`. By hand:

- `js/mds/storage.js`: `DRAFT_POOL_KEY_PREFIX` removed (see above). Its migration `console.log` now
  interpolates `${KEYS.mds.drafts}`; the logged text is the same.
- **IndexedDB names** (in the registry since 1B) also come from `IDB_DATABASES` now: `js/shared/storage/idb.js`
  (`LineupStrategistDB` / `sleeperData`) and `js/shared/api/sleeper.js` (`mls_sleeper_cache` /
  `players`). Record keys inside those stores (`nfl_player_map`, the stats cache keys) aren't in the
  registry and stay where they are; they're cache-internal and 6B doesn't touch them.
- **T-Score page** (`t-score/index.html`, still an inline classic script because 4B hasn't run): it
  can't import, so `js/shared/globals.js` assigns **`window.KEYS`** (the one new window name, on all
  three pages) and the script reads `window.KEYS.tscore.*`. All five uses run at event time (Refresh,
  DOMContentLoaded), after the globals module has run. 4B can switch it to an import.
- **Comments** that spelled a key name now name the constant instead (`js/mds/{backup,storage,state,sleeperSync}.js`,
  `js/mls/{backup,init}.js`, `js/mls/lineup/headshots.js`, `js/mls/scout/marketDisconnect.js`,
  `js/shared/ui/banners.js`), so 6B's grep stays clean. The marketDisconnect comment keeps
  `'mls_season_market'`: it's the name of an old bug, not a key in use.
- **Convention:** importing `keys.js` is safe from any module, at top level too (MLS's `state.js` and
  `constants.js` read `KEYS` while evaluating). It imports nothing, so it always evaluates before its
  importer, and rule 5's TDZ concern doesn't apply. Keep it import-free.

#### Left as text, for 6B to edit by hand

- **HTML attributes** (5A turned the `dismissBanner('…')` arguments into `data-*`):
  - `index.html`: `data-storage-key="ds_hide_mls_banner"`, `"ds_hide_guide_banner"`, `"ds_hide_install_banner"`
    (the three MDS banner close buttons).
  - `lineup/index.html`: `data-storage-key="mls_hide_guide_banner"` + `data-next-storage-key="mls_hide_draft_banner"`
    (guide banner), `data-storage-key="mls_hide_draft_banner"` (draft banner),
    `data-storage-key="mls_hide_sleeper_sync_banner"` (Scout tab's sync banner).
  - Only the three `ds_` ones change in 6B (the `mls_` names keep their names under the agreed table).
    The same keys are read on load through `KEYS` in `js/shared/ui/banners.js`, so the HTML and keys.js
    must change together.
- **`js/boot.js`**: its rescue-backup filter (`downloadRescueBackup`) still spells `mds_handoff_roster`,
  `mds_season_`, `mls_`, `ds_`, `mds_show_headshots`. New **`tests/unit/bootKeyFilters.test.mjs`** pulls that
  filter out of boot.js's source and checks it against `isMdsOwnedKey` / `isMlsOwnedKey` for every
  registry key (the pool key with three sample draft ids) and a few look-alike keys. It also checks each
  app owns exactly its registry group and no key name repeats. Verified it fails when boot.js's filter
  drifts (changed `mds_show_headshots` in boot.js: 1 failure). If 6B restructures that filter, update
  the test's regex.
- `ds_mobile_collapse` in `index.html` / `js/mds/init.js` is an element id, not a storage key (the key
  is `ds_mobile_collapse_pref`). Left alone.

Grep used for the done check (every registry value plus the two IDB names, whole word):
`grep -rnwF -f <(node -e "…STORAGE_KEYS…") js index.html lineup t-score sw.js` finds only keys.js,
boot.js and the six attributes above.

#### Checks run

- `node scripts/check-precache.mjs` OK (101 precached). `node --test` 162 (161 pass, 1 skipped as
  before; 5 new). `cd tests && npx playwright test`: **72/72**, including `backup.spec.mjs` unchanged.
  **No screenshot changed.**
- **Throwaway spec (not committed), on an origin/main worktree and on this branch, both widths:** the
  T-Score page with a seeded `tscore_page_cache` / `mds_tscore_cache_updated` (freshness label, tables),
  its Refresh error path (toast, localStorage after), MDS's v1 → v2 draft-storage migration from a
  seeded inline-pool `ds_drafts` (every key and value after reload), and MLS's first load (every key and
  value). **Identical.** No leftover `serve.mjs` between runs (5A's trap).

#### Other changes

- `sw.js`: CACHE_NAME `v2.8.57` → `v2.8.58`. No file added or removed (the new file is a test).
- README `/js` line: keys.js is the only place a storage key is spelled.

#### Left for later chunks

- **6B:** rename in `keys.js` only (plus the three `ds_hide_*` attributes and boot.js's filter, which
  the new unit test will flag). `KEYS` property names don't change with the rename, so no call site
  needs editing. The restore translation table and migration go in their own module; take the old names
  from git or spell them there (that table is the one legitimate second spelling).
- **6B and the T-Score page:** the page reads `mds_tscore_cache_updated` on load for its "Sheet data:
  Updated …" label (`tscore_page_cache` keeps its name). If only MDS migrates, a user who opens T-Score
  before MDS after the update sees no label until they visit MDS or press Refresh. So the T-Score page
  needs its own copy-on-load too. **Run 4B before 6B if you can**: once the T-Score script is a module,
  6B can import the same migration there. Otherwise 6B has to put it in the inline classic script or in
  `globals.js`.
- **4B:** the T-Score script can import `KEYS` once it's a module; then `window.KEYS` can go (nothing
  else reads it).
- `js/mds/backup.js` still reads `window.isMdsOwnedKey` although MDS is ES modules since 2A; an import
  would retire that window name (5D-style cleanup, not done here).


### 4A — Split styles.css into base, mds and mls

**`css/styles.css` is gone.** Its 814 top-level rules (a rule, or a whole `@media` / `@keyframes` block)
now live in `css/base.css` (264 rules, ~1,940 lines), `css/mds.css` (126, ~1,030) and `css/mls.css`
(424, ~1,970). No rule was edited and no class renamed. Within each file the rules keep their original
relative order. `index.html` links `base.css` then `mds.css`; `lineup/index.html` links `base.css` then
`mls.css`; `t-score/index.html` links `base.css` only (4B adds `tscore.css` after it).

#### How rules were sorted

The section markers were the starting point, but most sections turned out to be mixed (e.g. BUTTONS
holds 12 MDS-only rules among the shared ones; LAYOUT PRIMITIVES and BADGES hold dozens of MLS-only
utilities), so the unit of moving is the top-level rule, not the section. A throwaway script (not
committed) did the cut:

1. Split the file into top-level rules, each carrying the comments above it. Concatenating them gives the
   original file byte for byte (checked).
2. For every selector, a page "can use" it if every class/id in it appears (whole word) in that page's
   sources: MDS = `index.html` + `js/mds/**` + `js/shared/**` + `js/boot.js`; MLS = `lineup/index.html` +
   `js/mls/**` + shared; T-Score = `t-score/index.html` + shared. A rule goes to `mds.css`/`mls.css` only
   if that app is the **only** page that can use it; anything usable by two pages, by T-Score, or by no
   class at all (element selectors, `:root`) stays in `base.css`.
3. Dynamic class names were checked separately (a prefix of the class followed by `${` or `' +` in another
   app's sources). One real case: MLS builds `pos-text-${pos}` (`js/mls/render/lineup.js`), so the
   `.pos-text-*` rules (TEAM TAB UTILITIES) stay in base. MLS-only dynamic names (`.slot-badge.slot-*`,
   `.mls-power-label-*`, `.mls-power-summary-*`, `.mls-league-search-free`, `.mls-power-cell-middle`) went to `mls.css`.
4. Rules no page uses (dead selectors) follow their section: into the app file if the section is wholly
   that app's, otherwise base. `@keyframes` go with the rules that use them (`btn-pulse-anim`,
   `border-pulse-anim`, `nav-pulse-anim` → mls; `fadeIn`, `pulse`, `spin` → base).
5. **Cascade guard.** The app file loads after `base.css`, so a moved rule now comes after every base rule,
   including base rules that used to come after it and override it (same element, same property, equal
   specificity). Example: the phone `@media (max-width: 480px)` block in "Lineup Slots & Roster Rows" mixes
   shared and MLS selectors and overrides `.lineup-slot .slot-badge`, `.swap-btn`, `.player-name-wrap`
   from earlier MLS rules; the reduced-motion block overrides `.pulse-dot`/`.btn-pulse`/`.pulse-border`/`.nav-pulse`.
   A shared block can't be split without editing it, so instead every app rule that a later base rule could
   override **stays in base at its original position** (checked to a fixpoint; "could" = same property or
   shorthand, equal specificity, same pseudo-element, and the two subjects' classes appear together in some
   `class="…"` in the sources, with `classList`-toggled classes pinned to the elements they're toggled on).
   This keeps 30 app-only rules in base (listed below). It's conservative: a couple are false positives
   (e.g. `.sim-team-column h4` vs the dead `.player-info h4`).
6. The section marker comment (`/* --- NAME --- */`) is copied into each file that gets rules from that
   section, so every file stays navigable by marker. Each file got a 2–3 line header comment. No other
   comment changed.

Mechanical check (also throwaway): parsing the three new files back into rules finds each of the 814
original rules exactly once, byte-identical apart from the copied markers, in increasing original order
per file. Comment open/close counts balance in all three files.

#### What's in base.css

**Used by two or more pages** (207 rules), by section:

- **SHARED CSS VARIABLES & ROOT DESIGN TOKENS**: `:root`
- **GLOBAL RESETS**: `*`, `.sr-only`, `.skip-link`, `.skip-link:focus-visible`, `body`, `.container`
- **STICKY HEADER**: `.header`, `.header-left`
- **Header League Select**: `@media (max-width: 767px) { .header, .header-left, .logo-text, .hide-on-mobile, #draftProfileSelect, #headerLeagueSelect, .league-nav-btn, .league-nav-btn svg }`
- **HAMBURGER MENU & DRAWER**: `.menu-overlay`, `.hamburger-menu`, `html`
- **MODAL OVERLAY CHROME (shared) + RANKINGS UPLOAD PREVIEW MODAL (MLS only)**: `.mls-preview-overlay, .mds-modal-overlay`, `.mls-preview-modal, .mds-modal`, `.mls-preview-modal h3, .mds-modal h3`, `.mls-preview-actions, .mds-modal-actions`, `.mls-preview-actions .btn, .mds-modal-actions .btn`
- **SHARED IN-APP CONFIRM DIALOG (showConfirm in utils.js)**: `.mds-confirm-body p`, `.mds-confirm-body p:last-child`, `.mds-modal-actions`, `.hamburger-menu.open`, `.menu-header`, `.menu-logo-section`, `.menu-logo-section span strong`, `.menu-logo-img`, `.close-menu-btn`, `.close-menu-btn:hover`, `.menu-nav-links`, `.hamburger-menu .nav-btn`, `.hamburger-menu .nav-btn svg`, `.hamburger-menu .nav-btn:hover`, `.hamburger-menu .nav-btn:hover svg`, `.hamburger-menu .nav-btn.active, .hamburger-menu .nav-btn.active-link`, `.hamburger-menu .nav-btn.active svg`, `.premium-link-btn`, `.premium-link-btn::before`, `.hamburger-menu .premium-link-btn:hover`, `.hamburger-menu .premium-link-btn:hover svg`, `.menu-footer`, `.kofi-link`, `.kofi-link:hover`, `.kofi-img`
- **LOGO & TITLE**: `.logo-container`, `.logo-img`, `.logo-text`, `.logo-text span`, `.header-controls`
- **BOTTOM TAB NAVIGATION**: `.nav-bar`, `.nav-bar .nav-btn`, `.nav-btn *`, `.nav-bar .nav-btn svg`, `.nav-bar .nav-btn:hover`, `.nav-bar .nav-btn:active`, `.nav-bar .nav-btn.active`, `.nav-bar .nav-btn.active svg`
- **TAB CONTENT ANIMATIONS**: `.tab-content`, `.tab-content.active`
- **SETUP TAB & HERO**: `.setup-hero`, `.hero-logo`, `.hero-kofi`
- **GUIDE BANNER**: `.guide-banner`, `.guide-banner:hover`, `.guide-arrow`, `.guide-banner:hover .guide-arrow`
- **CARDS & LAYOUT**: `.settings-card`, `.highlight-card`, `.card-header`, `.card-header h3`, `.step-num`, `.card-desc`, `.card-divider`, `.divider-text`
- **FORMS & INPUTS**: `.input-group`, `.input-group label`, `.flex-label`, `.form-input`, `.form-input:focus`, `.text-center`, `.roster-grid`, `.roster-grid .input-group`, `.roster-grid label`, `.settings-grid`
- **PREMIUM TOGGLE SWITCHES (Replaces checkboxes)**: `.toggle-row`, `.toggle-info`, `.toggle-title`, `label.toggle-title, .toggle-title > label`, `.toggle-desc`, `.toggle-switch`, `.toggle-switch::after`, `.toggle-switch:checked`, `.toggle-switch:checked::after`, `.toggle-switch:focus-visible`
- **BUTTONS**: `.btn`, `.btn:hover`, `.btn:active`, `.btn-primary`, `.btn-primary:hover`, `.btn-secondary`, `.btn-secondary:hover`, `.btn-blue`, `.btn-purple`, `.btn-danger`, `.btn-danger:hover`, `.btn-sm`
- **HAMBURGER BUTTON**: `.hamburger-btn`, `.hamburger-btn:hover`, `.hamburger-btn:active`
- **UTILITIES**: `.flex-column`, `.gap-2`, `.mt-2`, `.mt-4`, `.mb-4`
- **LAYOUT PRIMITIVES**: `.stack`, `.settings-grid .input-group`, `.app-version`, `.dot`, `.bg-target`, `.bg-avoid`, `.leaguelogs-attribution`, `.leaguelogs-attribution a`, `.leaguelogs-attribution span:first-child`, `.leaguelogs-attribution em`, `.dot-accent`
- **BADGES & POSITIONAL STYLING**: `.badge`, `.lineup-slot .pos-badge, .roster-item .pos-badge, .draft-cell .pos-badge`, `.pos-badge.QB`, `.pos-badge.RB`, `.pos-badge.WR`, `.pos-badge.TE`, `.pos-badge.K`, `.pos-badge.DEF`, `.badge-rookie`, `.inj-badge`
- **TOOLTIPS (Refined for Dark Mode)**: `.tooltip, .tooltip-container`, `.tooltip-icon`, `.tooltip-container:hover .tooltip-icon`, `.tooltip .tooltip-text, .tooltip-container .tooltip-text`, `.tooltip:hover .tooltip-text, .tooltip-container:hover .tooltip-text`, `.tooltip-icon`, `.tooltip-icon:focus-visible`, `.tooltip-icon:focus-visible + .tooltip-text:not(.tt-dismissed)`, `.tooltip-container:hover .tooltip-text.tt-dismissed:not(.mobile-visible)`, `.tooltip-container[data-tt-self]:focus-visible`, `.tooltip-container[data-tt-self]:focus-visible > .tooltip-text:not(.tt-dismissed)`, `.tooltip-text.mobile-visible`
- **Lineup Slots & Roster Rows**: `.lineup-slot, .roster-item`, `.lineup-slot:hover, .roster-item:hover`, `.roster-item .pos-badge`, `.roster-item > *:not(:first-child):not(:last-child), .lineup-slot > *:not(:first-child):not(:last-child)`, `@media (max-width: 480px) { .lineup-slot, .roster-item, .roster-item .pos-badge, .lineup-slot .slot-badge, .player-name-wrap, .badge, .swap-btn, .lock-btn }`
- **COLLAPSIBLE WAIVER UPGRADE SECTIONS (Scout tab, Auto-Find Upgrades)**: `.sos-table-wrapper`
- **MLS SETUP TAB SPECIFIC STYLES**: `.button-row-dual`
- **COLLAPSIBLE RANKINGS CARDS (Roster/Lineup tabs)**: `.sos-details-accordion`, `.sos-details-accordion[open]`, `.sos-summary`, `.sos-summary:hover`
- **MDS SPECIFIC STYLES (Tracker, Board, Limits)**: `.flex-grow`
- **TEAM TAB UTILITIES**: `.table-responsive`, `.table-responsive.has-scroll-shadow, .sos-table-wrapper.has-scroll-shadow`, `.pos-text-qb`, `.pos-text-rb`, `.pos-text-wr`, `.pos-text-te`, `.pos-text-k`, `.pos-text-def`, `.header-subtitle`
- **LIVE INDICATOR**: `@media (prefers-reduced-motion: reduce) { .pulse-dot, .btn-pulse, .pulse-border, .nav-pulse, .tab-content.active }`, `.sync-spinner`
- **INFO & GUIDE TAB**: `.guide-content`, `.guide-step`, `.step-title`, `.blue-step`, `.step-desc`, `.guide-list`, `.guide-list li`, `.text-main`
- **DARK MODE SELECT DROPDOWNS**: `select.form-input, select`, `select.form-input:focus, select:focus`, `select option`, `optgroup`
- **MODERNIZED FILE UPLOAD BUTTON**: `input[type="file"]::file-selector-button`, `input[type="file"]::file-selector-button:hover`, `input[type="file"]::-webkit-file-upload-button`, `input[type="file"]::-webkit-file-upload-button:hover`, `.close-banner-btn`, `.close-banner-btn:hover`, `@media (max-width: 767px) { .container, .settings-card, .lineup-empty-state, .bench-empty-state, .roster-empty-state }`
- **ACCESSIBILITY & MICRO-INTERACTIONS**: `:where(.btn-bare)`, `.btn-bare:focus-visible`
- **TOAST NOTIFICATIONS**: `.mds-toast`, `.mds-toast.show`, `.mds-toast.show.toast-error, .mds-toast.show .toast-dismiss-btn`, `.mds-toast.toast-error`, `.mds-toast .toast-dismiss-btn`, `.mds-toast .toast-dismiss-btn:hover`, `@media (max-width: 767px) { .mds-toast, .mds-toast.show }`
- **MOBILE COLLAPSIBLE CARDS**: `.chevron-icon`
- **PLAYER CARD GRID LAYOUT**: `.actions`
- **MOBILE COLLAPSIBLE CARDS CONDITIONAL LAYOUT**: `.tooltip-container, .tooltip-icon, .tooltip-text`
- **FULL-WIDTH DRAFT BOARD FOR DESKTOP**: `.close-banner-btn, .close-menu-btn, .btn-expand, .edit-icon, .close-chip`, `.close-banner-btn`, `.close-banner-btn::after`, `a.nav-btn, .nav-btn`
- **Drag-and-drop file upload (see window.enableFileDrop in js/utils.js)**: `.mds-drop-active`, `.mds-drop-hint`, `@media (hover: none) { .mds-drop-hint }`

**Used only by T-Score** (7 rules) — 4B should move these to `css/tscore.css`:

- **DENSE DATA TABLE STICKY SCROLLING (SCOPED)**: `.table-container th`, `.table-container th:first-child, .table-container td:first-child`, `.table-container th:first-child`
- **TABLE HEADER TOOLTIP FIXES**: `.table-header-tooltip`, `.table-header-tooltip .tooltip-text`, `.table-header-tooltip:hover .tooltip-text`, `.table-header-tooltip.align-right .tooltip-text`

**App-only, kept in base for the cascade** (30 rules, step 5). Original styles.css line in brackets:
MLS: `.mt-0` [1145], `.pl-6` [1159], `.close-banner-btn-sm` [1257], `.early-badge` [1321], `.bye-badge` [1323],
`.taxi-badge` [1327], `.kickoff-badge` [1334], `.mls-lock-badge` [1343], `.mls-autolock-badge` [1349],
`.status-icon` [1460], `.mls-pos-badge-sizing` [1550], `.mls-name-badges .badge` [1605],
`.lineup-empty-state, .bench-empty-state` [1646], `.lineup-slot .slot-badge` [1774], `.player-name-wrap` [1828],
`.swap-btn` [1901], `.sim-team-column h4` [2087], `.sim-bench-insights h4` [2157],
`.trade-verdict-source-label .tooltip-text` [2354], `.sos-grid th` [2492], `.danger-card` [2662],
`.text-danger` [2668], `.roster-empty-state` [2678], `.btn-pulse` [3498], `.pulse-border` [3508], `.nav-pulse` [3519].
MDS: `.tracker-controls-card` [2924], `.pulse-dot` [3477], `.btn-expand` [4074],
`@media (min-width: 768px) { .card-details, .hide-on-desktop }` [4121].
Moving any of these to its app file needs the later shared rule that overrides it moved or split first,
which is an edit (out of scope here).

**Unused by any page** (17 rules; dead, left where their section put them):

- **GUIDE BANNER**: `.guide-banner-content`
- **UTILITIES**: `.gap-1`, `.gap-3`
- **LAYOUT PRIMITIVES**: `.stack-xs`, `.stack-md`, `.stack-lg`, `.cluster-wrap`, `.cluster-xs`, `.cluster-lg`
- **MDS SPECIFIC STYLES (Tracker, Board, Limits)**: `.player-card-main`, `.player-info h4`, `.toggle-container`
- **LIVE INDICATOR**: `.live-indicator`, `.live-indicator:hover`
- **MODERNIZED FILE UPLOAD BUTTON**: `.draft-cell-content`
- **PLAYER CARD GRID LAYOUT**: `.player-info`, `.player-info h4`

`@keyframes fadeIn`, `pulse` and `spin` are in base too.

#### Other changes

- `sw.js`: PRECACHE_ASSETS drops `/css/styles.css`, adds `/css/base.css`, `/css/mds.css`, `/css/mls.css`.
  CACHE_NAME `v2.8.58` → `v2.8.59`. Every page precaches all three CSS files (the list is site-wide).
- Comments that pointed at `styles.css` now name the file that holds the rule: `js/boot.js`,
  `js/shared/ui/toast.js`, `js/shared/ui/scrollShadows.js` (→ base.css), `js/mls/power/snapshot.js` and the
  `.mls-hero` note in `lineup/index.html` (→ mls.css), and the APP VERSION notes in both HTML files
  ("shared css/base.css"). `sw.js`'s historical "~3,900-line styles.css" comment is left as is.
- README `/css` line describes the three files.

#### Checks run

- `node scripts/check-precache.mjs` OK (103 precached). `node --test` 162/162.
  `cd tests && npx playwright test`: **72/72. No screenshot changed.**
- **Computed-style comparison (throwaway spec, not committed), on an origin/main worktree and on this
  branch:** in 132 page states (MDS empty and mid-draft on every tab, MLS empty / synced / with rankings
  loaded on every tab, T-Score on every tab, plus the drag-and-drop highlight on both apps), at both
  widths and with `prefers-reduced-motion` both off and on, every element's full computed style plus its
  `::before`/`::after` (~230,000 elements). **0 differences.** The only unmatched element per MDS/MLS state
  is the extra `<link>` in `<head>`. Two traps for whoever repeats this: Chromium lists custom properties
  in stylesheet order, so sort property names before comparing; and let each state settle (move the
  mouse off, blur focus, wait for network idle) or hover/focus and late image loads show up as noise.
  Hover-only and other untested states are covered by the static cascade guard (step 5), not by this run.

#### Left for later chunks

- **4B:** link `css/tscore.css` after `base.css` on the T-Score page, and move the 7 T-Score-only rules
  above into it (the 4B card now says so). They need the same cascade check: no later base rule may override them.
- **5D:** `.leaguelogs-attribution` (its rules are in `css/base.css`, LAYOUT PRIMITIVES) is the class 5D renames.
- **4C / 4D (added to the runbook after this chunk):** the 30 cascade-kept rules and 17 dead rules are 4D's job,
  after 4C finds out which MLS features the owner wants shared with MDS. See "Planned as runbook chunks 4C / 4D"
  below.
- New CSS should go in the app file when only one app uses it, or in base.css when both do. If you add a
  shared rule meant to override an app rule, remember the app file loads later: equal specificity no
  longer wins by being later in base.css.

### Planned as runbook chunks 4C / 4D (owner's request, recorded after 4A)

After 4A the owner pointed out that Lineup Strategist (MLS) got most of the new features this season, and
several will likely come to Draft Strategist (MDS) later. One example is the pulsing "do this next" highlights MLS
shows during setup. Styles for such features should stay in `css/base.css` rather than be moved into `css/mls.css`
now and moved back later. So the cleanup proposed at the end of 4A was split in two, and both cards are in the
runbook:

- **4C — research only (needs 4A).** Rank the MLS features whose styling has a 50%+ chance of being shared with
  MDS, and for each one say what sharing takes: which CSS rules and what they depend on, and which JS adds the
  classes or builds the markup, plus what of that would have to move to `js/shared/`. Findings go to the owner in
  plain language and into a "4C — findings" LOG entry with an "Owner's decision" line per feature. No app file
  changes.
- **4D — CSS cleanup with no visible change (needs 4B and 4C).** Delete the 17 unused rules, move the 5 false
  positives to `mls.css`, split the four mixed shared blocks so the app-only parts can move, and leave in base the
  14 rules where a shared rule wins on the same element. Anything the owner marked as shared in 4C stays in, or
  moves to, base. The card lists every rule by name.

Notes for those sessions:

- **Known gap, for 4C to report:** `.btn-pulse`, `.pulse-border` and `.nav-pulse` (and the reduced-motion block)
  are in `css/base.css`, kept there by 4A's cascade guard. Their animations (`@keyframes btn-pulse-anim`,
  `border-pulse-anim`, `nav-pulse-anim`) went to `css/mls.css`, because only MLS rules use them. If MDS used these
  classes today, it would get the static highlight but never the pulse. Moving the three `@keyframes` to base.css
  is safe: keyframes don't depend on order as long as each name is defined once.
- **Moving a rule from an app file back to base.css** (whatever 4C decides) means: (1) put it at the end of
  base.css, or anywhere in base.css after every shared rule it used to beat; (2) check that no earlier rule in the
  app file overrides it once it loads before that file (the reverse of 4A's cascade guard); (3) bring its
  `@keyframes`, phone-width and reduced-motion versions with it, and grep the other app for the same class names.
  Prove it with the computed-style comparison: zero differences on MLS and T-Score.
- **The 4A analysis tools weren't committed.** They lived in that session's scratchpad: the rule splitter, the
  cascade-conflict checker and the computed-style comparison spec. 4D rebuilds the comparison from the method in
  the 4A entry and commits it as an opt-in tool. The 4A entry's step list is enough to rebuild the checker too.
- **Two utilities that do nothing today** (found while planning 4D, not fixed): `.mt-0` on `.leaguelogs-attribution`
  and `.pl-6` on `.guide-list` lose to the shared rule (`margin-top: 1rem`, `padding-left: 1.25rem`). Making them
  work is a visible change and the owner's call; 5D's rename of `.leaguelogs-attribution` is a natural moment.

### 4B — T-Score page: extract inline CSS and JS

The T-Score page now loads like the other two: `base.css` then its own `css/tscore.css`, and
`js/boot.js` → `js/shared/globals.js` → its own module `js/tscore/main.js`. Cut by line range with a
script (throwaway, not committed) that asserted each range's first and last line before cutting.

| From | To | Edits |
|---|---|---|
| `t-score/index.html` inline `<style>` (lines 20–261) | `css/tscore.css`, after the two sections below | dedented by the `<style>`'s 8 spaces; nothing else |
| `css/base.css` DENSE DATA TABLE STICKY SCROLLING (3 rules) and TABLE HEADER TOOLTIP FIXES (4 rules), with their markers and comments | top of `css/tscore.css`, in that order | none |
| `t-score/index.html` inline `<script>` (lines 1191–1502) | `js/tscore/main.js` (`type="module"`, in `<head>` right after globals.js) | listed below |

Changes inside the moved JS (the diff against the old inline script is exactly these):

- `tscoreNormalize` and `tscoreEscapeHtml` deleted; their 1 + 9 call sites call `normalizeName`
  (`js/shared/names.js`) and `escapeHtml` (`js/shared/html.js`), imported. `tscoreNormalize` already
  forwarded to the shared `normalizeName` whenever it existed (always, after 1A). The shared `escapeHtml`
  also escapes `'` as `&#39;`, which renders the same.
- `window.KEYS.tscore.*` (5 uses) → `KEYS.tscore.*`, imported from `js/shared/storage/keys.js`, as 6A
  suggested. **`window.KEYS` is gone**: nothing else read it, so `js/shared/globals.js` no longer assigns
  it (and no longer imports `KEYS`). keys.js's header comment updated to match.
- A `// --- WINDOW EXPORTS ---` block at the end assigns `window.switchTab`, `switchPosition` and
  `toggleMenu`, the names the page's inline `onclick`s call (and `tests/helpers.mjs` calls `switchTab`).
  `window.refreshTScoreData` already assigned itself. The classic script also made seven internal helpers
  implicit globals (`fetchTScoreSheet`, `renderTScoreTables`, `tscoreTop50RowHTML`,
  `tscoreFilteredRowHTML`, `updateTscoreFreshnessLabel`, plus the two deleted helpers); they're module-
  private now. A grep finds no reference to any of them outside main.js.
- A 6-line header. Comments in the moved code that say "this inline script" weren't edited (the header
  says so); 5D's comment sweep can fix them.

**Timing.** The inline script ran during parsing; main.js now runs after parsing, after globals.js, and
before DOMContentLoaded. Its top level only defines functions and adds `DOMContentLoaded` / `popstate`
listeners, so nothing it does moves earlier or later in a way the page sees. Its two DOMContentLoaded
listeners now register after globals.js's (feedback form, banners, scroll shadows, tooltips) instead of
before; none of those touch the T-Score tables, tabs or freshness label (checked, and the comparison
below shows no difference). The code is strict-mode clean (modules are strict).

**Cascade check for the 7 rules.** tscore.css loads after base.css, so a later base.css rule that used to
override them would now lose. The only rules after them in base.css were MOBILE COLLAPSIBLE CARDS
(`.btn-expand`, `.card-details`/`.hide-on-desktop`), PLAYER CARD GRID LAYOUT, the `user-select` block
for `.tooltip-container/.tooltip-icon/.tooltip-text`, the 44px touch-target block, `.close-banner-btn`,
`a.nav-btn, .nav-btn` and the drag-and-drop rules. None sets a property the 7 rules set on the same elements.
The rules stay ahead of the former inline CSS, as they were, so their order against it is unchanged too.
`.table-container` and `.table-header-tooltip` appear only in `t-score/index.html` (grep of both HTML
files, `js/` and `css/`); MLS keeps its own TABLE HEADER TOOLTIP FIXES marker in mls.css for its other rules.

**Service worker.** The page now registers `/sw.js`, using the same inline classic block as
`lineup/index.html` (end of `<body>`: it still runs if a module fails, and the path must be absolute).
`sw.js` precaches `/css/tscore.css`, `/t-score/`, `/t-score/index.html` and `/js/tscore/main.js` (its
imports were already listed). CACHE_NAME `v2.8.59` → `v2.8.60`. MathJax and PapaParse CDN tags unchanged.

#### New test: `tests/tscore-refresh.spec.mjs`

Written and run against main **before** the move, then unchanged after it. Three tests, both widths:

- **Refresh, success:** Google Sheets stubbed with a small WR and RB CSV (an out-of-order rank, an
  unknown label, a name with `<b>` and one with `'`, blank and notes rows, the `T-Score` vs `T-Score (A)`
  header). Checks the toast, the exact HTML of the rebuilt rows, that all 8 table bodies changed, the
  freshness label, the button's restored state, and the exact contents of `mds_tscore_cache`,
  `mds_tscore_cache_updated` and `tscore_page_cache` (the shape MDS reads). Then reloads with the stub
  removed: no sheet request, tables rebuilt from `tscore_page_cache` identically.
- **Error paths:** an HTTP 500 for the RB sheet, and the default blocked request (`Failed to fetch`).
  Each checks the error toast text, the re-enabled button, untouched tables, no storage written, and that
  the one `console.error` is the expected error (first line only; the stack names the script's location).

#### Checks run

- `node scripts/check-precache.mjs` OK (107 precached). `node --test` 162/162.
  `cd tests && npx playwright test`: **78/78** (72 existing + 6 new). **No screenshot changed.**
- **Before/after comparison (throwaway spec, not committed), main vs this branch:** the T-Score page at both
  widths, `prefers-reduced-motion` off and on, with and without a seeded `tscore_page_cache`; in each, load
  via `#valuesTab`, every tab, the RB side of each WR/RB pair, a hovered header tooltip and a hovered
  right-aligned one, the menu open, closed with Escape, and Back. 176 states, ~221,000 elements: every
  element's computed style (and `::before`/`::after` where present) **identical**. Body HTML identical
  apart from the new service-worker comment (+281 characters in every state: the 280-character comment and
  a newline). No page errors in either. `Object.getOwnPropertyNames(window)`: only `KEYS` and the seven
  helpers above are gone, nothing new.

#### Left for later chunks

- **6B:** the T-Score page is a module now, so its copy-on-load migration for `mds_tscore_cache_updated`
  (see 6A's note) can be an import in `js/tscore/main.js`.
- **5E (new runbook card, added after this chunk at the owner's request):** the T-Score page still has
  its 18 inline `onclick`s (`switchTab`, `switchPosition`, `toggleMenu`, `refreshTScoreData`), and no
  Phase 5 card covered this page. `switchTab` finds its nav button with `[onclick*="tabId"]`, so converting
  those handlers needs that selector changed too. main.js still reads `window.mdsFetch`, `window.showToast`,
  `window.createFocusTrap` and `window.getTabFromHash` (unchanged code); 5E makes them imports and fixes
  the stale "inline script" comments in main.js. 5D now waits for 5E, and its comment sweep includes
  `js/tscore/`.
- **4D:** the 7 T-Score-only rules are out of base.css, so 4D can skip them.

### 4C — findings: Lineup Strategist styles Draft Strategist will likely share

**Research only. No app file, CSS file or test changed.** Started from `css/mls.css` and the MLS rules 4A kept in
`css/base.css`, grouped the classes into features users see, found each one's markup and JS by grepping its class
names in `lineup/index.html` and `js/mls/`, and estimated how likely MDS is to use it from what MDS has today
(`index.html`, `js/mds/`). The owner decided per feature; 4D carries out the decisions.

#### Ranked list (50% or more)

| # | Feature | Chance | CSS | JS | Size | Owner's decision |
|---|---|---|---|---|---|---|
| 1 | Smaller ✕ on dismissible banners | 90% | already in base (1 rule) | none | small | share now in CSS |
| 2 | Pulsing "do this next" highlights | 85% | 3 rules + reduced-motion block in base; 3 `@keyframes` in mls.css | `updatePulsePrompts` (MLS state) | small | share now in CSS |
| 3 | Setup checklist | 70% | 11 class rules in mls.css (+1 MLS-id rule that stays) | `renderSetupStep`, `goToSetupStep`, `updatePulsePrompts` | medium | share now in CSS |
| 4 | "Updated 3 days ago" freshness labels | 65% | 3 rules in mls.css | `getRankingsFreshness` (pure) + 3 callers | small–medium | share now in CSS |
| 5 | Danger Zone card | 60% | already in base (2 rules) | none | small | share now in CSS |
| 6 | Blue info banner with a round "i" | 55% | 2 rules in mls.css | none (static markup + 1 template string) | small | share now in CSS |

"Share now in CSS" means: these rules stay in, or move to, `css/base.css` in 4D. No MDS markup or JS is added
until a later chunk builds the MDS version (out of scope for 4C and 4D).

#### 1. Smaller ✕ on dismissible banners — 90% — Owner's decision: share now in CSS

- **What it is:** a smaller close button for banners with little vertical room.
- **Why MDS:** MDS already gets the same look by hand: `#mlsBanner` and `#guideBanner`'s ✕ in `index.html` carry
  `style="font-size: 0.85rem; padding: 0.25rem;"`, which is exactly this rule (`--space-1` is `0.25rem`).
- **CSS:** `css/base.css`, LAYOUT PRIMITIVES: `.close-banner-btn-sm` (1 rule). Kept in base by 4A's cascade guard;
  4D's card already leaves it there. Tokens: `--space-1`. No phone, reduced-motion or animation versions.
  Move: none needed.
- **JS:** none. Banner dismissal is already shared (`js/shared/ui/banners.js`, `dismissBanner`).
- **Names:** fine.

#### 2. Pulsing "do this next" highlights — 85% — Owner's decision: share now in CSS

- **What it is:** a pulsing ring or border on whatever setup step comes next: MLS pulses the Sync button, the next
  card (Sync, ROS rankings, Weekly rankings) and the logo while you're on another tab.
- **Why MDS:** MDS has the same kind of setup, five numbered cards (Load Rankings, Add / Sync Draft, ADP, Roster
  Limits, Call Outs) and a "Ready to Draft?" card; MDS's logo is the same `.logo-container` button.
- **CSS:** `css/base.css`, LIVE INDICATOR: `.btn-pulse`, `.pulse-border`, `.nav-pulse` (3 rules) and the
  `@media (prefers-reduced-motion: reduce)` block, which also holds `.pulse-dot` (MDS) and `.tab-content.active`
  (shared). `css/mls.css`, LIVE INDICATOR: `@keyframes btn-pulse-anim`, `border-pulse-anim`, `nav-pulse-anim`.
  No tokens (hard-coded blue and green). Reduced-motion version: yes (the block above). Phone version: none.
- **Move:** the three `@keyframes` to base.css. Plain cut and paste: keyframes don't depend on order, each name is
  defined once, and no other file defines these names (base has `fadeIn`, `pulse`, `spin`). In 4D step 3, keep
  `.btn-pulse`/`.pulse-border`/`.nav-pulse` in base's reduced-motion block and move only `.pulse-dot` to mds.css.
- **Known gap, measured:** I added the three classes to MDS's first Setup card, `#syncBtn` and `.logo-container` in a
  headless Chromium (throwaway script, not committed). With normal motion, `animation-name` resolves to the MLS
  names but `document.getAnimations()` lists only `fadeIn` and `pulse`: **no highlight at all**, not even a
  static one, because `.btn-pulse` sets nothing but the animation. Only with reduced motion on do the static
  highlights show (green border and glow on the card, green tint on the logo). The runbook's "static highlight
  but never pulse" holds only for reduced-motion users. Moving the keyframes fixes it.
- **Observed, not changed:** `.pulse-border` sets `border-radius: 8px`, so a pulsing `.settings-card` goes from
  12px to 8px corners (both MLS and MDS; its comment says it "matches the card"). **Owner's decision (after
  4C): fix it**, so a pulsing card keeps its own corners. This is a visible change, so it can't go in 4D (no visible
  change allowed). Do it as a small follow-up after 4D: drop `border-radius: 8px` from `.pulse-border` in base.css
  (its only users are `.settings-card`s, 12px), update the comment, accept the changed screenshots if any show a
  pulsing card, and list them in LOG. Leave `.nav-pulse`'s 8px: the logo button has no radius of its own, so the
  8px rounds the highlight.
- **JS:** `js/mls/init.js`, `updatePulsePrompts()`: toggles `btn-pulse` on `#mainSyncBtn`, `pulse-border` on
  `#setupSyncCard` / `#rosRankingsCard` / `#weeklyRankingsCard`, `nav-pulse` on `.logo-container`. Depends on MLS
  state (`State.leagues`, `State.rosRankings`, `State.weeklyRankings`, `isBestBallLeague(getActiveLeague())`).
  Called from 7 places (`nav.js`, `rankings/engine.js`, `leagues/importAll.js`, `leagues/sync.js`, `init.js`).
  Shared: nothing is needed, as each toggle is one `classList.toggle(name, condition)`. A tiny
  `setPulse(el, kind, on)` in `js/shared/ui/` is optional. Stays per app: which element pulses when.
- **Names:** fine (`btn-pulse`, `pulse-border`, `nav-pulse`).

#### 3. Setup checklist — 70% — Owner's decision: share now in CSS

- **What it is:** a "Setup Progress · 1 of 3 done" box at the top of the Dashboard listing the steps with ✓ or —;
  unfinished steps get a sentence of instructions and a "Show me ↓" / "Go to Roster tab →" link that switches tab,
  opens the card, scrolls to it and focuses its first control.
- **Why MDS:** MDS's setup is five numbered cards in one long scroll with no summary of what's done.
- **CSS:** `css/mls.css`, LIVE INDICATOR (lines ~1508–1574): `.setup-checklist`, `.setup-checklist-title`,
  `.setup-checklist-list`, `.setup-checklist-list li`, `li.is-done`, `.setup-step-mark`, `li.is-done .setup-step-mark`,
  `.setup-step-body`, `li.is-actionable .setup-step-label`, `.setup-step-how`, `.setup-step-go` (11 rules). The 12th,
  `#setupSyncCard, #rosRankingsCard, #weeklyRankingsCard, #powerRankingsCard { scroll-margin-top }`, names MLS card
  ids and **stays in mls.css** (MDS would add its own). Tokens: `--card-bg`, `--border`, `--space-4`, `--text-muted`,
  `--text-main`, `--primary-green`; uses base's `.sr-only`. No phone, reduced-motion or animation versions.
- **Move: needs the cascade check.** The jump link is `<button class="mls-btn-sm btn-link-inline setup-step-go">`.
  Today `.setup-step-go` (font-size 0.8rem) beats `.mls-btn-sm` (0.75rem, mls.css line ~1090) by coming later. In
  base.css it would load before mls.css and lose: the link text on MLS would shrink. `.mls-btn-sm` can't simply
  move with it, because `.lock-btn` (mls.css, earlier) shares an element with it (`class="mls-btn-sm lock-btn"`)
  and would then win. Options for 4D: (a) raise `.setup-step-go` to `.setup-checklist .setup-step-go` (an edit, still
  no visible change), or (b) leave `.setup-step-go` in mls.css and give MDS's link its own class. **Owner's decision
  (after 4C): (a).** The other 10 rules are
  plain cut and paste: their classes appear nowhere else in the CSS. `.btn-link-inline` (mls.css LAYOUT
  PRIMITIVES) can also move as is, if wanted: it already loses padding to `.mls-btn-sm` by order, and stays earlier.
- **JS:** `js/mls/init.js`:
  - `renderSetupStep(id, step, done, text, how, activeTabId)` builds each `<li>` (mark, sr-only status, label, how
    text, jump button). Generic apart from reading `SETUP_STEPS` and calling `window.goToSetupStep`.
  - `goToSetupStep(step)` uses `window.showTab`, `updateDrawerActiveState` (`js/mls/nav.js`) and
    `setRankingsCardExpanded` (`js/mls/rankings/engine.js`); the reduced-motion-aware scroll and focus part is generic.
  - `updatePulsePrompts()` decides which steps show on which tab, from MLS state.
  - Shared candidates: a `js/shared/ui/setupChecklist.js` with `renderSetupStep(li, { done, label, how, goLabel,
    onGo })` and `scrollToCard(card, focusEl)`. Stays per app: the step list, the done conditions, the per-tab
    visibility, the tab switch.
- **Names:** `mls-btn-sm` on the jump link would read oddly in shared markup.

#### 4. "Updated 3 days ago" freshness labels — 65% — Owner's decision: share now in CSS

- **What it is:** a short age label after loaded data: muted "Updated today", amber "Updated 9 days ago —
  consider refreshing", red "Last sync failed · roster from 3 days ago".
- **Why MDS:** MDS shows fixed dates ("Loaded: 220 players on 9/15/2026 at 10:00 AM", "Fetched: FFC … on …")
  in `#metaDisplay` / `#adpStatusDisplay`. ADP moves daily in draft season, so an amber "Fetched 9 days ago" fits.
- **CSS:** `css/mls.css`, MLS ROSTER TAB SPECIFIC STYLES: `.rankings-fresh`, `.rankings-stale`, `.sync-failed`
  (3 rules). Tokens: `--text-muted`. No media versions. Not part of the decision, staying in mls.css:
  `.status-badge-meta` (MLS's meta line; MDS has its own `.status-badge` in mds.css) and, under COLLAPSIBLE RANKINGS
  CARDS, `.header-freshness` and `.header-freshness.rankings-stale` (card-header copy of the label).
- **Move:** plain cut and paste. The only other rules on the same elements are `.header-freshness` (already beats
  `.rankings-stale` on color by order today, and still would) and `.header-freshness.rankings-stale` (higher
  specificity). Spans in league rows also carry inline styles, which win either way.
- **JS:** `getRankingsFreshness(timestamp, staleAfterDays, verb)` in `js/mls/rankings/engine.js` is pure (no
  `State`). Callers: `updateRankingsMetaDisplay` (same file), `renderLeagueManager` (`js/mls/leagues/sync.js`, the
  "Synced …" / "Last sync failed" line), `updateMarketMetaDisplay` (`js/mls/scout/marketDisconnect.js`). The same day
  math is copied in `js/tscore/main.js` (`updateTscoreFreshnessLabel`). Shared candidate: move the function to
  `js/shared/` (for example `js/shared/freshness.js`), which T-Score could use too. MDS would also need to save a
  timestamp: `State.rankingsMeta` / `State.adpMeta` (`js/mds/import.js`, `js/mds/market.js`) store only a formatted
  date string. That's a new field inside the existing `mds_` objects, not a new key; old saved data has no
  timestamp and falls back to the neutral text, as MLS does.
- **Names:** `rankings-fresh` / `rankings-stale` (already used for league sync and market data, not only
  rankings) and `getRankingsFreshness` would read oddly in shared code. Rename candidates only.

#### 5. Danger Zone card — 60% — Owner's decision: share now in CSS

- **What it is:** a card with a red dashed border and red title for destructive actions (MLS: "Danger Zone" with
  Factory Reset, and the Global Injury Auditor card).
- **Why MDS:** MDS's "Reset Controls" card (Reset Draft Picks Only, Reset Everything) is a plain `settings-card`;
  adding `danger-card` would match.
- **CSS:** `css/base.css`, MLS SETUP TAB SPECIFIC STYLES: `.danger-card`, `.text-danger` (2 rules; `.text-danger`
  uses `!important`). Kept in base by 4A's cascade guard; 4D's card already leaves them there. Tokens: `--card-bg`.
  Move: none needed.
- **JS:** none (static markup in `lineup/index.html`).
- **Names:** fine.

#### 6. Blue info banner with a round "i" — 55% — Owner's decision: share now in CSS

- **What it is:** a blue notice box with a round "i" badge: MLS's "Roster found from My Draft Strategist" handoff
  banner, "Sleeper Sync Required" on Scout, and red/amber versions on the Injury Auditor.
- **Why MDS:** MDS has no in-page notice style today. It uses toasts, the green `.status-badge` line, and small italic
  inline-styled notes (the manual-draft kicker note under Add / Sync Draft).
- **CSS:** `css/mls.css`, `.info-banner` and `.info-banner-icon` (2 rules). They sit under the MATCHUP SIMULATOR
  (MONTE CARLO) RESULTS marker, because their "Info Banner Component" comment ended up above that marker under MLS
  SCOUT TAB SPECIFIC STYLES. No tokens, no media versions. The red and amber versions are inline styles (in
  `lineup/index.html` and `js/mls/lineup/injuryAudit.js`), not classes. The banner markup also uses `.cluster`,
  `.cluster-sm`, `.ml-3` (mls.css, not shared by this decision) and `.close-banner-btn-sm` (base).
- **Move:** plain cut and paste to the end of base.css. Elements carrying it also carry only `mb-4` (base, earlier),
  which it already beats and still would.
- **JS:** none needed. Static markup in `lineup/index.html` (`#handoffBanner`, `#sleeperSyncBanner`, Injury
  Auditor); one template string in `js/mls/lineup/injuryAudit.js` (`runGlobalInjuryAudit`). `#handoffBanner` is
  shown and hidden by `js/mls/leagues/handoff.js`; dismissal goes through the shared `dismissBanner`. A dismissible
  MDS banner needs its own storage key (registry in `js/shared/storage/keys.js`).
- **Names:** fine.

#### Under 50%: owner's second round

The first presentation listed these in one line each with no decision. The owner then went back over them; their
decisions are below. Two corrections to that first list:

- **Player headshots**: MDS already shows headshots on the draft board, with its own styles (`.draft-cell-img`,
  `body.hide-headshots` in mds.css) and its own show/hide setting (`toggleHeadshots`, `js/mds/tracker.js`).
  MLS's are separate (`.mls-headshot*`, `body.mls-hide-headshots`). Two implementations; no decision asked.
- **MDS's "collapsible cards"** are not the same feature as MLS's: in MDS, Tracker player cards hide their extra
  details on phones when the "mobile collapse" setting is on (`body.enable-mobile-collapse`, mds.css; `js/mds/init.js`).

| Feature | Chance (first round) | Owner's decision |
|---|---|---|
| Rankings upload preview window | 40% | share now in CSS |
| "Processing…" line and "Uploaded successfully" message | 35% | share now in CSS |
| Player-name autocomplete | 25% | share now in CSS |
| Keyboard hint ("press Enter to add") | 25% | share now in CSS |
| Layout and spacing helpers (keep the full set, move `.mb-1` to base) | n/a (not seen by users) | share now in CSS |
| Collapsible rankings cards | 30% | later |
| Two-option segmented toggle | 30% | later |
| Hide the hero off the Dashboard | 5% | later |
| Round status icons | 40% | not asked (no) |
| Everything in-season-only (Lineup, Roster, Scout, Trade, Sim, Power, Waivers, SoS, league picker, manual-add log, lock countdown, injury pill, kickoff/bye/taxi/lock badges) | under 10% | not asked (no) |

I re-ran the 4A-style static cascade check (throwaway script) on every rule below: for each moved rule, any
staying rule in the same app file with equal specificity, the same pseudo-element, a property in common, and classes
that appear together in some `class="…"`, that comes *before* it today (it wins now, would lose once the moved rule
loads earlier). Nothing came up apart from `.setup-step-go` vs `.mls-btn-sm` (feature 3 above) and a few hits on
element selectors (`kbd`, `li`) against different elements, which are false positives. So every move below is a
plain cut and paste to the end of base.css.

**Rankings upload preview window — share now in CSS.** A window that opens after picking a rankings file: player
count, the top players, files or tabs that were skipped, names that matched no player, a note when position ranks
will be worked out, where the set will be saved (red when it replaces one), then "Looks Good, Save It" / Cancel.
- CSS (15 rules, mls.css): under MODAL OVERLAY CHROME (shared) + RANKINGS UPLOAD PREVIEW MODAL (MLS only):
  `.mls-preview-count`, `.mls-preview-list`, `.mls-preview-list li`, `.mls-preview-list li:last-child`,
  `.rankings-preview-rank`, `.mls-preview-note`, `.mls-preview-target`, `.mls-preview-target.is-replace`; at the end of
  ALL-LEAGUES PLAYER SEARCH: `.mls-preview-unmatched`, `-title`, `-list`, `-hint`, `.mls-preview-derived`, `-title`,
  `-body`. The overlay, box, heading and button row are already shared (`.mls-preview-overlay, .mds-modal-overlay`
  and friends in base). Tokens: `--text-muted`, `--border`, `--primary-green`, `--text-main`, `--avoid-border`,
  `--dart-border`. No media versions. The league checklist inside it (`.mls-league-picker*`) **stays in mls.css**:
  MDS has no leagues.
- JS (large): `js/mls/rankings/uploadPreview.js`: `parseFiles`, `openRankingsPreview`, `confirmRankingsPreview`,
  `cancelRankingsPreview`. Tied to MLS: `State`, ranking sets and league targets (`rankings/sets.js`), SoS, ROS/Weekly.
  Pure and shareable: `formatUnmatchedNames`, `derivedRanksWording` (`js/mls/scout/waivers.js`); `analyzeRankingsFile`
  (same file) needs only the shared Sleeper player map. The open/close with a focus trap is a generic shell. MDS
  side: `processData` (`js/mds/import.js`) applies an upload at once, so MDS would have to parse, show the preview,
  and apply on confirm. MDS parses through its own path, not `parseRankingsFiles`.
- Names: every `mls-preview-*` class and `rankings-preview-rank` would read oddly in shared code.

**"Processing…" line and "Uploaded successfully" message — share now in CSS.** MLS shows a line with a spinning
icon while a file is read, then a green "Uploaded Successfully!" line. MDS does it differently: it writes
"Processing players and building database…" into its green `#metaDisplay` status box (`.status-badge`, mds.css)
and changes the button text (`js/mds/import.js`, `processData`). Nothing is common today; sharing MLS's look lets MDS
switch to it later.
- CSS (3 rules, mls.css): `.weekly-success-feedback` (blue variant, MLS LINEUP & ROSTER TAB SPECIFIC STYLES),
  `.success-feedback` and `.mls-upload-processing` (COLLAPSIBLE RANKINGS CARDS). The spinner uses `.sync-spinner`
  (already in base). Tokens: `--primary-green`, `--text-muted`. No media versions.
- JS (small): `showStatusFeedback(el, text, hideAfterMs)` (`js/mls/helpers.js`) is generic; `setUploadStatus(type, …)`
  and `UPLOAD_SPINNER_SVG` (`js/mls/rankings/uploadPreview.js`) are generic apart from finding the element by a
  `${type}ProcessingStatus` id. Shared candidate: a `js/shared/ui/` module with `showStatusFeedback` and a
  `setProcessingStatus(el, on, label)` that takes the element.
- Names: `mls-upload-processing`, and `weekly-success-feedback` (it's just the blue variant).

**Player-name autocomplete — share now in CSS.** Type two letters of a name and a list of matching players (with
position and team) drops down; arrow keys and Enter pick one. MLS uses it in Add Player Manually and the
Simulator's player lookup.
- CSS (6 rules, mls.css, under the TABLE HEADER TOOLTIP FIXES marker, comment "Player-name autocomplete
  dropdown"): `.autocomplete-wrap`, `.autocomplete-dropdown`, `.autocomplete-item`, `.autocomplete-item:hover,
  .autocomplete-item.highlighted`, `.autocomplete-meta`. Tokens: `--border`, `--text-muted`. No media versions.
- JS (small): `attachPlayerAutocomplete(inputEl, onSelect)` and `getPlayerSearchIndex()` in `js/mls/players.js`. No
  `State`: they need only `getSleeperPlayerMap` (already `js/shared/api/sleeper.js`, which MDS loads since 2C),
  `escapeHtml` and `window.showToast`. Could move whole to `js/shared/ui/` (for example `playerAutocomplete.js`).
  Callers: `initManualAddForm` (`js/mls/leagues/addPlayer.js`) and the page `onload` (`js/mls/init.js`).
- Names: fine.

**Keyboard hint — share now in CSS.** The small "Press Enter to add" line with a key drawn as a keycap, shown only
on devices with a mouse or trackpad.
- CSS (3 rules, mls.css, MLS SETUP TAB SPECIFIC STYLES): `.mls-manual-key-hint`, `.mls-manual-key-hint kbd`,
  `@media (hover: none) { .mls-manual-key-hint }`. Tokens: `--text-muted`, `--border`, `--text-main`.
- JS: none (static markup in `lineup/index.html`; the Enter behavior is in the autocomplete and `addPlayer.js`).
- Names: `mls-manual-key-hint`.

**Layout and spacing helpers — share now in CSS; keep the full set and move `.mb-1` to base.** Small helpers for
spacing and rows, not something users see.
- CSS (26 rules, mls.css UTILITIES and LAYOUT PRIMITIVES): `.mt-1`, `.mt-3`, `.mb-0`, `.mb-2`, `.mb-3`, `.ml-3`,
  `.mr-2`, `.pt-3`, `.pl-2`, `.stack-sm`, `.cluster`, `.cluster-sm`, `.cluster-md`, `.text-helper`, `.accordion-body`,
  `.card-header-flush`, `.or-divider` (3 rules), `.settings-subsection` (3), `.toggle-row-flush` (2),
  `.input-group-end`, `.btn-link-inline`. Not included: `.multi-upload-panel`, `.pos-checkbox-row`,
  `.pos-checkbox-label`, `.pos-fieldset`, `.pos-fieldset-legend`, which belong to MLS's per-position upload, and stay.
  Note: `.mt-3 { … }.mb-0 { … }` share one line in mls.css; cut by rule, not by line.
- `.mb-1` (mds.css, the only MDS-only spacing size; used once in `index.html`) moves to base too. Same check:
  nothing in mds.css would start beating it.
- Already in base: `.flex-column`, `.gap-2`, `.mt-2`, `.mt-4`, `.mb-4`, `.stack` (both apps use them), and the 8 unused
  sizes `.gap-1`, `.gap-3`, `.stack-xs`, `.stack-md`, `.stack-lg`, `.cluster-wrap`, `.cluster-xs`, `.cluster-lg`
  (4A's dead-rule list). The owner chose to keep these: **4D doesn't delete them**, which answers the card's
  "ask the owner whether to keep the full scale" question.
- JS: none (`.cluster`, `.text-helper` appear in a few MLS template strings; nothing toggles them).

**Later** (stay in mls.css; 4D moves nothing for them):
- **Collapsible rankings cards**: MLS's ROS (Roster tab) and Weekly (Lineup tab) rankings cards fold to one header
  line with the title, set name and "Updated…"; the Scout waiver sections reuse the toggle. COLLAPSIBLE RANKINGS
  CARDS rules, `.header-freshness`, `.rankings-header-*`; JS `toggleRankingsCard`, `setRankingsCardExpanded`
  (`js/mls/rankings/engine.js`).
- **Two-option segmented toggle**: "Compare Against: Starting Lineup | Whole Roster" and "Search In: This League |
  All My Leagues" in Scout's Waiver Wire Assistant. 5 rules (`.mls-segmented*`, mls.css WAIVER WIRE ASSISTANT); JS in
  `js/mls/scout/waivers.js`.
- **Hide the hero off the Dashboard**: 1 rule (`.container:not(:has(> #setupTab.active)) > .mls-hero`, mls.css SETUP
  TAB & HERO). MDS gets the same effect by keeping its hero inside `#setupTab`; it would only need the rule if its
  hero moved out of the tab.

#### For 4D

- Keep in base: `.close-banner-btn-sm`, `.danger-card`, `.text-danger` (already planned), and
  `.btn-pulse`/`.pulse-border`/`.nav-pulse` with their part of the reduced-motion block. When splitting that block,
  only `.pulse-dot` goes to mds.css. Also keep the 8 unused spacing sizes (step 1 now deletes only the other 9
  unused rules).
- Move from mls.css to the end of base.css: the three pulse `@keyframes`; the 11 setup-checklist rules (with
  `.setup-step-go` raised to `.setup-checklist .setup-step-go`, the owner's choice (a)); `.rankings-fresh`,
  `.rankings-stale`, `.sync-failed`; `.info-banner`, `.info-banner-icon`; the 15 upload-preview rules; the 3
  processing/success rules; the 6 autocomplete rules; the 3 keyboard-hint rules; the 26 layout helpers. Move `.mb-1`
  from mds.css too. Keep their relative order and their comments, and copy the section marker each comes from.
  Prove each move with the computed-style comparison (0 differences on all three pages).
- Stays in mls.css: the checklist's MLS-id `scroll-margin-top` rule, `.status-badge-meta`, `.header-freshness` (both
  rules), `.mls-btn-sm`, `.mls-league-picker*`, the per-position upload rules, and the three "later" features.
- 4D is a bigger move than its card planned (about 60 more rules). If it runs long, session rule 1 applies: stop at
  a clean step and log what's left.

#### Checks run

- `node scripts/check-precache.mjs` OK (107 precached). `node --test` 162/162. `cd tests && npx playwright test`
  78/78, no screenshot changed. Only `docs/refactor/LOG.md` changed. No CACHE_NAME bump: no JS or CSS file was
  added, renamed or deleted.

#### Left for later chunks

- **Follow-up after 4D (owner's decision):** the pulsing-card corner fix described under feature 2. It's a visible
  change, so it isn't part of 4D.

### 4D — CSS cleanup: delete unused rules, move app-only rules out of base.css

No visible change. Afterwards `css/base.css` holds the rules more than one page uses, the features the owner
chose to share in 4C, and 14 app rules that have to stay for the cascade (listed below). No CSS file holds a
rule nothing uses, apart from the 8 spacing sizes the owner chose to keep. Rule counts (top-level rules):
base 257 → 307, mds 126 → 130, mls 424 → 365. CACHE_NAME `v2.8.60` → `v2.8.61`. No file added or removed
under `css/` or `js/`, so PRECACHE_ASSETS is unchanged.

Commits, one per step: the comparison tool; step 1 (delete); step 2 (5 false positives); step 3 (split the
mixed blocks); a tool fix (lazy images); step 4 (4C's shared features to base); one more unused rule.

#### New tool: `tests/tools/css-compare.tool.mjs` (`cd tests && npm run compare-css`)

4A's computed-style comparison, rebuilt and committed. It has its own config (`tests/tools/playwright.config.mjs`,
`testMatch: *.tool.mjs`, 4 workers), so the default `npx playwright test` doesn't run it (still 78 tests).

- Each scenario runs twice in Chromium: once with every local request answered from a git ref
  (`COMPARE_REF`, default `origin/main`, via `git show`), once from the working tree via `serve.mjs`. No
  worktree is needed, and you don't have to commit first.
- After each step it records every element's full computed style, sorted by property name, plus `::before` /
  `::after` (when they render), `::marker`, `::placeholder` and `::file-selector-button`, and fails on any difference,
  naming the element, its id/classes and the changed properties.
- 7 scenarios × 2 widths × `prefers-reduced-motion` off/on = 28 tests, 69 states per width and motion setting
  (about 127,000 elements and pseudo-elements per width and motion setting, ~508,000 per run): MDS empty (every tab,
  the drag-and-drop highlight, the menu, a normal and an error toast, the confirm dialog), MDS mid-draft (every tab,
  then every `<details>` open, then the phone "mobile collapse" setting with one Tracker card expanded), MLS empty
  (same set as MDS empty), MLS synced (every tab, every `<details>` open, the Add Player autocomplete open), MLS with
  rankings (both upload previews, both "saved" states, every tab, every `<details>` open, a Scan Pasted List, Auto-Find,
  a trade verdict, simulator results with the seeded worker), the MLS handoff banner, and T-Score (every tab, menu).
- Settling, so timing doesn't show up as differences: network idle, mouse parked at (0,0), focus blurred, fonts and
  images loaded (lazy images are switched to eager first: blocked headshots get swapped for initials whenever they
  load, which made the element tree timing-dependent), transitions and finite animations finished, endless ones
  paused at 0. Toasts are hidden before each snapshot except in the toast steps, and MLS's self-hiding "Uploaded
  Successfully!" line is waited out. Elements are keyed by tag and position, not id: tooltips get `mds-tip-N` ids
  in whatever order they're set up.
- Checked that it catches a change: one padding value changed in `.sos-grid th` gave 443 differences.
- `SIM_SEED` in `tests/helpers.mjs` is now exported (the tool seeds the simulator with it).
- Known flake, seen once in the baseline runs before any CSS changed: one MDS mid-draft button's background
  differed (`rgb(16, 185, 129)` vs `rgb(74, 222, 128)`) under load. It never came back once the report started naming
  the element. If it reappears, the report says which button; rerun that test before suspecting the CSS.

Static check (throwaway, in the session scratchpad, like 4A's): for each page, every (media, selector,
declarations) unit in main vs the branch; it reports pairs whose relative order flipped and that could fight (a
common property counting shorthands, equal specificity, same pseudo-element, subject classes that appear together
in some `class="…"` in that page's own sources, with `classList`-toggled classes pinned to the elements they're
toggled on), and newly loaded rules whose classes a page uses. Across the whole branch it reports only
`.mls-name-badges .badge` vs `.roster-item .pos-badge` (the false positive 4A described: the name badges never
carry `pos-badge`) and the intended `.setup-checklist .setup-step-go` (below). This covers hover, focus and other
states the comparison doesn't reach.

#### Step 1: deleted (9 rules, base.css)

`.guide-banner-content` (GUIDE BANNER); `.player-card-main`, `.player-info h4`, `.toggle-container` (MDS SPECIFIC
STYLES); `.live-indicator`, `.live-indicator:hover` (LIVE INDICATOR); `.draft-cell-content` (MODERNIZED FILE UPLOAD
BUTTON); `.player-info`, `.player-info h4` (PLAYER CARD GRID LAYOUT). Rechecked first with a grep of `index.html`,
`lineup/index.html`, `t-score/`, `js/` and `functions/` (the only hit, `sim-player-info`, is a different class).
Kept, per the owner's 4C decision: `.gap-1`, `.gap-3`, `.stack-xs`, `.stack-md`, `.stack-lg`, `.cluster-wrap`,
`.cluster-xs`, `.cluster-lg` (UTILITIES, LAYOUT PRIMITIVES; still unused). The card's "17 unused" = these 9 + those 8.

Also deleted, in its own commit: `.mls-table-header-cell` (mls.css, MLS LINEUP & ROSTER TAB SPECIFIC STYLES).
Nothing has used it since before 4A (`git grep` at the 4A commit and on main); 4A's dead-rule list missed it.

#### Step 2: 5 false positives, base.css → mls.css, unchanged

`.mls-name-badges .badge`, `.sim-team-column h4`, `.sim-bench-insights h4`, `.trade-verdict-source-label .tooltip-text`,
`.sos-grid th`, each at its original relative position (next to `.mls-name-badges`, `.sim-team-column`,
`.sim-bench-insights`, `.trade-verdict-source-label .tooltip-icon` and `.sos-grid`). The COLLAPSIBLE WAIVER UPGRADE
SECTIONS marker comment stays in base.css on `.sos-table-wrapper`, which stays.

#### Step 3: the four mixed blocks, split

Each split-off block is new, holds the moved selectors' declarations verbatim, sits at the original block's relative
position in the app file, and has a one-line comment saying it was split from base.css in 4D.

| Shared block (base.css) | Now in base.css | Split off to |
|---|---|---|
| LIVE INDICATOR, `@media (prefers-reduced-motion: reduce)` | `.btn-pulse`, `.pulse-border`, `.nav-pulse` (shared, 4C) and `.tab-content.active` | `.pulse-dot { animation: none }` → mds.css |
| Lineup Slots & Roster Rows, `@media (max-width: 480px)` | `.lineup-slot, .roster-item`, `.roster-item .pos-badge`, `.badge` | `.lineup-slot .slot-badge`, `.player-name-wrap`, `.swap-btn`, `.lock-btn` → mls.css |
| end of MODERNIZED FILE UPLOAD BUTTON, `@media (max-width: 767px)` | `.container`, `.settings-card` | `.lineup-empty-state, .bench-empty-state, .roster-empty-state` → mls.css |
| FULL-WIDTH DRAFT BOARD FOR DESKTOP, the 44px touch-target block | `.close-banner-btn, .close-menu-btn` | `.btn-expand` → mds.css, `.close-chip` → mls.css; `.edit-icon` dropped (no page uses it) |

Then the app rules those blocks overrode moved to their app file, at their original relative position:
`.pulse-dot`, `.btn-expand`, `@media (min-width: 768px) { .card-details, .hide-on-desktop }` → mds.css;
`.lineup-empty-state, .bench-empty-state`, `.roster-empty-state`, `.lineup-slot .slot-badge`, `.player-name-wrap`,
`.swap-btn` → mls.css. The reduced-motion block's comment now says the pulses (not "four pulses") and points to
mds.css for `.pulse-dot`. The pulse cues are shared (4C), so that part of step 3 was skipped as the card says.

#### Step 4: the features the owner chose to share (4C), mls.css → base.css

- **The three pulse `@keyframes`** (`btn-pulse-anim`, `border-pulse-anim`, `nav-pulse-anim`) → base.css LIVE
  INDICATOR, at their original place next to `.btn-pulse`, `.pulse-border`, `.nav-pulse`. Keyframes don't depend on
  order, and each name is defined once. On a page that adds these classes the cues now animate (4C's "known gap").
- **To the end of base.css**, in original order, with their own comments and the section marker each came from:
  the rankings upload preview (15: `.mls-preview-count`, `-list`, `-list li`, `-list li:last-child`,
  `.rankings-preview-rank`, `.mls-preview-note`, `-target`, `-target.is-replace`, `.mls-preview-unmatched`, `-title`,
  `-list`, `-hint`, `.mls-preview-derived`, `-title`, `-body`); the layout and spacing helpers (26: `.mt-1`, `.mt-3`,
  `.mb-0`, `.mb-2`, `.mb-3`, `.ml-3`, `.mr-2`, `.pt-3`, `.pl-2`, `.stack-sm`, `.cluster`, `.cluster-sm`, `.cluster-md`,
  `.text-helper`, `.accordion-body`, `.card-header-flush`, `.or-divider` ×3, `.settings-subsection` ×3,
  `.toggle-row-flush` ×2, `.input-group-end`, `.btn-link-inline`) plus `.mb-1` from mds.css; `.weekly-success-feedback`,
  `.success-feedback`, `.mls-upload-processing`; `.info-banner`, `.info-banner-icon`; the keyboard hint
  (`.mls-manual-key-hint`, `… kbd`, its `@media (hover: none)`); `.rankings-fresh`, `.rankings-stale`, `.sync-failed`;
  the setup checklist (11); the autocomplete (`.autocomplete-wrap`, `-dropdown`, `-item`, `-item:hover, .highlighted`,
  `-meta`: 5 rules, 6 selectors). 69 rules. At the end of base.css they still beat every shared rule, as they did from
  mls.css; the static check found no mls.css rule that starts beating them.
- **`.setup-step-go` → `.setup-checklist .setup-step-go`** (owner's choice (a) in 4C): the jump link also carries
  `.mls-btn-sm`, which now loads after it; the extra class keeps the link's 0.8rem font size. No other rule with
  that specificity sets a font property on that button (checked).
- Stays in mls.css, as 4C said: the checklist's MLS-id `scroll-margin-top` rule, `.status-badge-meta`,
  `.header-freshness` (both rules), `.mls-btn-sm`, `.mls-league-picker*`, the per-position upload rules, and the
  three "later" features. `.mt-3 { … }.mb-0 { … }` had ended up on one line in mls.css (4A gave `.mb-1`'s newline to
  mds.css); with `.mb-1` back between them in base.css they're on separate lines again, as in styles.css.
- The header comment of base.css says what's at its end and why; the README's `/css` line mentions the shared features.

#### What stays in base.css, and why (14 app-only rules)

In each case a shared rule later in base.css sets the same property on the same element with equal specificity and
wins today. In mls.css or mds.css the app rule would load later and win instead.

| Rule | App | The later shared rule that wins today |
|---|---|---|
| `.early-badge`, `.bye-badge`, `.taxi-badge`, `.kickoff-badge`, `.mls-lock-badge`, `.mls-autolock-badge`, `.mls-pos-badge-sizing` | MLS | `.badge` in the phone `@media (max-width: 480px)` block (Lineup Slots & Roster Rows): `padding: 2px 4px; font-size: 0.65rem`. These badges are written `class="badge …"` (`.early-badge`'s 0.70rem, for example, is 0.65rem on phones today). |
| `.tracker-controls-card` | MDS | `.settings-card` in the phone `@media (max-width: 767px)` block (`padding: 1rem 0.75rem`); the card is `class="settings-card tracker-controls-card"`. |
| `.close-banner-btn-sm` | MLS (shared, 4C) | `.close-banner-btn` twice: MODERNIZED FILE UPLOAD BUTTON (`font-size: 1.1rem; padding: 0.25rem 0.5rem`) and FULL-WIDTH DRAFT BOARD (`padding: 0.5rem`). Every element with the class also has `.close-banner-btn`. |
| `.status-icon` | MLS | `.tooltip, .tooltip-container` (TOOLTIPS, right after it): `display`, `align-items`. Same values today, but it's the later rule. |
| `.danger-card` | MLS (shared, 4C) | `.sos-details-accordion` (`border`, `background`) on the Danger Zone accordion, `<details class="sos-details-accordion danger-card">` (Setup, Advanced Settings). The Injury Auditor card (`settings-card danger-card`) does show the style. |
| `.text-danger` | MLS (shared, 4C) | `.sos-summary { color }` on `class="sos-summary text-danger"`. `.text-danger` is `!important`, so it wins either way; kept anyway (the card lists it, and moving it gains nothing). |
| `.mt-0` | MLS | `.leaguelogs-attribution { margin-top: 1rem }`. |
| `.pl-6` | MLS | `.guide-list { padding-left: 1.25rem }`. |

#### For the owner (not changed: each would be visible)

- `.mt-0` on `.leaguelogs-attribution` and `.pl-6` on `.guide-list` do nothing today (above). 5D's rename of
  `.leaguelogs-attribution` is a natural moment to decide.
- **New: `.close-banner-btn-sm` does nothing on MLS either.** All four ✕ buttons that carry it (`#guideBanner`,
  `#draftBanner`, `#sleeperSyncBanner`, the handoff banner) measure 17.6px / 8px padding, the plain `.close-banner-btn`
  size, not 0.85rem / 0.25rem (checked in Chromium). The later `.close-banner-btn` rules win. 4C shared it because MDS
  sets the same small size inline; for MDS to get it from the class, the class has to win first, and that's visible on MLS.
- **New: `.danger-card` does nothing on the Danger Zone accordion** (Factory Reset, `<details class="sos-details-accordion
  danger-card">` in Setup's Advanced Settings: solid border, no red gradient, checked in Chromium). The accordion's own
  border and background win, so only the Global Injury Auditor card (`settings-card danger-card`) shows the red dashed
  style. Making it show on the Danger Zone is a visible change. (Corrected after 4D: an earlier version of this note
  said "Injury Auditor accordion".)

#### Checks run

- Computed-style comparison vs `origin/main` before each commit: **0 differences in all 28 runs** after steps 1, 2,
  3 and 4 (after the extra deletion, 0 in the 16 MLS runs, then all 28 again before pushing).
- `node scripts/check-precache.mjs` OK (107 precached). `node --test` 162/162. `cd tests && npx playwright test`
  **78/78 after every step. No screenshot changed.**

#### Left for later chunks

- **Follow-up after 4D (owner's decision in 4C):** the pulsing-card corner fix (drop `border-radius: 8px` from
  `.pulse-border` in base.css, LIVE INDICATOR). A visible change; accept the screenshots that show a pulsing card.
- New CSS: one app only → its app file; both apps, or a feature meant to be shared → base.css, and when it's an
  app-feature rule that has to beat earlier shared rules, at the end of base.css, as step 4 did. Before moving rules,
  run `npm run compare-css`.

### Planned as runbook chunks 4E and 8A–8C (owner's request, recorded after 4D)

Cleaning up the CSS turned up two kinds of follow-up work that sit outside a "no visible change" refactor. The owner
wants both planned, so they don't become leftovers when the runbook is done:

1. **Visible fixes (4E).** 4D found classes that do nothing because a later shared rule in `css/base.css` wins
   over them. Fixing them changes how those elements look, so 4D had to leave them.
2. **Draft Strategist versions of the shared features (Phase 8).** 4C's "share now in CSS" decisions only kept the
   styles in `css/base.css`. Nothing in Draft Strategist (MDS) uses them yet.

Both are runbook cards now. Order: 4E alongside 5E and 6B → 5D → 7B → Phase 8.

#### 4E — Visible CSS fixes found in 4C and 4D (needs 4D; alongside 5E and 6B)

Touches only CSS, a few class attributes in the two app pages, and the screenshot baselines. 5E (T-Score page) and
6B (storage) don't touch those, so they can run at the same time. **5D now needs 4E**: 5D renames
`.leaguelogs-attribution`, which one fix touches. 5D and 7B can then still promise no visible change.

Owner's decisions (4E does only the approved fixes; for anything still pending, it asks first):

| Fix | What changes | Owner's decision |
|---|---|---|
| Pulsing-card corners | Drop `border-radius: 8px` from `.pulse-border`, so a pulsing card keeps its 12px corners (MLS Setup cards). | fix (decided after 4C) |
| Smaller ✕ (`.close-banner-btn-sm`) | MLS's four ✕ buttons go from 1.1rem / 8px padding to 0.85rem / 0.25rem (touch target unchanged). MDS's two ✕ swap their inline style for the class, with no visible change. | pending |
| `.danger-card` on the Danger Zone accordion | Red dashed border and red tint on MLS's Danger Zone accordion (Factory Reset; Setup, Advanced Settings), like the Global Injury Auditor card already has. | pending |
| `.mt-0` on `.leaguelogs-attribution` | (a) Make it work: the attribution line under MLS's market data loses its 1rem top margin; or (b) delete the dead `mt-0` from the markup: no visible change. | pending |
| `.pl-6` on the two `.guide-list`s | (a) Make it work: those two lists on MLS's Guide tab get a wider indent (1.25rem → 2rem); or (b) delete the dead `pl-6`: no visible change. | pending |

`npm run compare-css` proves the scope: every difference it reports must be on an element a fix targets. The
screenshot changes get accepted with `npm run test:update` and listed.

#### Phase 8 — Shared features for Draft Strategist (after 7B)

Each card moves the MLS code it needs into `js/shared/` without changing MLS (compare-css: 0 differences on MLS
and T-Score), then builds the MDS version, and proposes the MDS details to the owner before building. Why after 7B:

- **After 5D (Phase 5 done):** new markup uses `data-action` from the start, and shared code lands in the final
  `js/shared/` layout rather than one 5D is still shrinking.
- **After 6B:** a dismissible MDS banner needs a storage key, and freshness labels need a timestamp saved in MDS's
  data. After 6B both are created under the new names and never need migrating.
- **After 7B:** freshness labels change how MDS saves its rankings and ADP metadata (`js/mds/import.js`,
  `js/mds/market.js`), which 7B may also touch.

If the owner wants something sooner, 8A doesn't touch the data code and could start once 5D and 6B are merged.

| Card | Features (4C numbering) | Shared code it creates | Size |
|---|---|---|---|
| **8A** setup guidance (needs 7B; alongside 8B) | Pulse cues (2), setup checklist (3), Danger Zone style on MDS's Reset Controls (5), info banner where the owner picks a use (6) | `js/shared/ui/setupChecklist.js` (step `<li>` builder, scroll-and-focus) | ~25k |
| **8B** freshness and processing lines (needs 7B; alongside 8A) | "Updated 3 days ago" labels (4), "Processing…" / "Uploaded successfully" lines | `js/shared/freshness.js` (also replaces T-Score's copy of the day math), `showStatusFeedback` / `setProcessingStatus` in `js/shared/ui/` | ~20k |
| **8C** upload preview and autocomplete (needs 8B) | Rankings upload preview; player-name autocomplete and keyboard hint, only if the owner picks a place (MDS's only name field is the Tracker search, which already filters) | preview shell and pure helpers; `attachPlayerAutocomplete` | ~30k |

Already done or nothing to build: the smaller ✕ (4E), the layout and spacing helpers (CSS only). The three "later"
features (collapsible rankings cards, segmented toggle, hide-the-hero) and the "no" items stay out of Phase 8.
Class renames that 4C listed (`mls-preview-*`, `rankings-fresh` / `rankings-stale`, `mls-upload-processing`,
`mls-manual-key-hint`…) happen in the card that first uses the class on MDS.

Owner's decisions for Phase 8 (each card builds only what's marked "build"):

| Feature | Card | Owner's decision |
|---|---|---|
| Pulsing "do this next" highlights | 8A | pending |
| Setup checklist | 8A | pending |
| Danger Zone style on Reset Controls | 8A | pending |
| Blue info banner (and where) | 8A | pending |
| Freshness labels (and the stale threshold for rankings and ADP) | 8B | pending |
| "Processing…" / "Uploaded successfully" lines | 8B | pending |
| Rankings upload preview | 8C | pending |
| Player-name autocomplete + keyboard hint (and where) | 8C | pending |
