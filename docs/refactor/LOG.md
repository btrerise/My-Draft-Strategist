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
  teams through the real UI module and Web Worker with `Math.random` seeded, exact numbers pinned).
  Each runs at both widths: 66 Playwright tests in all. The smoke test's simulator run stops at "Not
  enough roster data" with the fixture league (it never reaches the worker), so `mls-sim.spec.mjs`
  is the one that checks the simulation itself.

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
  (with the trade-verdict block inside `runScout`): it turns both blocks into functions, so it's
  marked as a logic edit, with no user-visible change allowed.
- Comments inside the moved sim files still start `// monteCarloUi.js`, `// statsEngine.js`,
  `// worker.js` and name each other by the old file names. `js/shared/api/sleeperStats.js` refers
  to "statsEngine.js". Moved power code says "this file" about things now in other files (for
  example "Same fallback lineup the rest of this file uses" in power/shared.js). These are for 5D's
  comment sweep, along with the ones 3A–3E listed.
- 6A (storage keys through keys.js) can start once 2C (merged) and 3F are on main.

### 3F follow-up — Waiver Insights finds no free agents until the Scout tab has run (found, not fixed)

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

**Fix (a behavior change, so its own small chunk or a 3G follow-up, not 3G itself).** Have Waiver
Insights build the position lookup when it's missing, the same way `runScout` does (a shared
`ensureSleeperPosByName()`), or read positions from the Sleeper player map `runMatchupSim` already
loads. Also, when there are zero candidates, say why ("no ranked free agents with a known
position") instead of the history/kickoff message. Add a test that runs Waiver Insights in a fresh
page with no Scout run first. Note for that test: the fixture league rosters all 24 players in
`tests/fixtures/rankings.csv`, so it has no free agents at all. The test needs extra unrostered
names in its rankings.
