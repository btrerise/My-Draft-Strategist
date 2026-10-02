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
  cache, Quick-Start, ADP sync, live Sleeper draft, error toasts) and 1 MLS market test
  (`mls-market.spec.mjs`, 7A). Each runs at both widths: 48 Playwright tests in all. The MLS matchup simulator runs in its Web Worker in the
  smoke test, but its output isn't screenshotted because it's random.

### Known gaps (good follow-ups, not blockers)

- MLS has no ranking set loaded in the seeded state, so rank-dependent UI (power rankings,
  scout results, "Unranked" badges replaced by ranks) is only covered in its empty form.
  Chunks 3C–3E would benefit from seeding an MLS rankings upload first.
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
