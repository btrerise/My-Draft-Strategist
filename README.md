# 🏈 My Draft Strategist

**My Draft Strategist** is a mobile-first, high-performance web application designed for fantasy football enthusiasts. It functions as a complete draft companion, offering custom ranking management, real-time market value (ADP) syncing, live platform integrations, advanced roster tracking, and full draft-board grid visualization.

The official repository for [My Draft Strategist](https://mydraftstrategist.com): custom tools and calculators for fantasy football draft preparation and lineup strategy.

## Project Structure

No build step: every file below is served as it is in the repo. Each page loads `js/boot.js` first, then `js/shared/globals.js`, then its own entry module.

```text
index.html               Draft Strategist (the main page of the site)
lineup/                  Lineup Strategist: index.html and its PWA manifest.json
t-score/                 The T-Score page: index.html
sw.js                    Service worker (offline cache; PRECACHE_ASSETS lists every JS and CSS file)
manifest.json            PWA manifest for Draft Strategist
robots.txt, sitemap.xml, llms.txt   Crawler and discovery files

css/
  base.css               Shared by every page: tokens, resets, chrome, forms, buttons, badges, tooltips,
                         toasts, shared cards, and the Lineup Strategist features shared with Draft Strategist
  mds.css                Draft Strategist only
  mls.css                Lineup Strategist only
  tscore.css             T-Score page only

js/
  boot.js                Plain script, first on every page: safe storage reads (readJSON), the fatal-boot
                         banner and the rescue backup
  shared/                Code more than one page uses (ES modules)
    globals.js           Page-wide setup: the shared modules with load-time side effects, and
                         window.showToast for boot.js (everything else is imported)
    names.js, net.js, html.js    Name matching, fetch with a timeout (mdsFetch), HTML escaping
    api/                 Sleeper (sleeper.js, sleeperStats.js), FantasyCalc (market.js), Fantasy Football
                         Calculator (ffc.js)
    rankings/            Rankings file parser (parse.js) and its error messages (diagnostics.js)
    storage/             keys.js (the only place a storage key is spelled), keyMigration.js (pre-6B key
                         names to current ones), idb.js (IndexedDB)
    ui/                  Toasts, confirm dialog, focus trap, tooltips, banners, file drop, script loader,
                         data-action event delegation (delegate.js) and other small helpers
    data/tscore.js       Bundled T-Score data (imported by mds/tracker.js)
    data/byes.js         NFL bye weeks by season, both apps (written by scripts/update-byes.mjs)
  mds/                   Draft Strategist. main.js is the entry point (data-action delegation, and
                         exportMdsSettings on window for boot.js); init.js sets the module load order and runs startup.
                         One module per area: state, storage, import, market, sleeperSync, tracker,
                         board, team, recap, export, handoff, backup, settings, and so on
  mls/                   Lineup Strategist. main.js is the entry point (data-action delegation, and
                         exportMlsSettings on window for boot.js) and its import list sets the load order. Top-level
                         modules (state, helpers, nav, init, backup, settings, players, sos, shortcuts...)
                         plus one folder per area:
    leagues/             League sync, Import All Leagues, the Draft Strategist roster handoff, Add Player
    lineup/              Headshots, game info, early games, injury audit
    rankings/            Rankings engine, ranking sets, the upload preview, ROS auto-fetch
    scout/               Scout tab engine, waiver tools (incl. the pure waiverScanner.js), Waiver Insights,
                         market disconnect, all-leagues search
    power/               Positional power rankings
    trade/               Trade value curve, verdict, waiver value, text/screenshot export
    render/              Roster, Lineup and Dashboard tabs, rookie lookup
    sim/                 Matchup simulator: matchup.js, its UI (ui.js), the stats engine (stats.js) and the
                         Web Worker (worker.js)
  tscore/main.js         The T-Score page's script

functions/api/ffc/       Cloudflare Pages Function: proxies Fantasy Football Calculator's ADP API (no CORS)
images/                  Logos, favicons and app icons
scripts/, tests/         Development checks (see below). Not used by the site
docs/refactor/LOG.md     Notes from the module-structure refactor, and how to run the checks
```

## Hosting
Hosted and deployed statically via Cloudflare Pages. There is no build step: files are served as they are in the repo.

## Development Checks
Run before pushing changes to scripts, styles or `sw.js`:

```sh
node scripts/check-precache.mjs        # sw.js precache list matches what the pages load
node --test                            # unit tests for the pure modules (Node 22+)
cd tests && npm install && npm test    # Playwright smoke tests + screenshot comparisons
```

See [`docs/refactor/LOG.md`](docs/refactor/LOG.md) for details, including how to update screenshot baselines.

## Yearly: bye weeks
Each May, once the NFL publishes the schedule, run `node scripts/update-byes.mjs <season>` (for example `2027`), bump `CACHE_NAME` in `sw.js` (the service worker serves cached files first, so without a bump users keep the old table), and commit both. Until then neither app knows that season's byes (Draft Strategist still shows any bye column a rankings file has). Schedule data comes from [nflverse](https://github.com/nflverse/nfldata) (`data/games.csv`), with thanks.

---

## 🌟 Comprehensive Feature List

### 1. Setup & Data Ingestion

* **Custom Spreadsheet Upload:** Supports parsing `.csv`, `.xlsx`, and `.xls` files with flexible header mapping (Player Name, Position, Tier, Team, Bye Week, ADP/Value).
* **Raw CSV Paste Area:** Allows users to paste raw spreadsheet rows directly into a text box for instant parsing.
* **Fantasy Football Calculator "Quick-Start":** A one-click bootstrap option that populates the entire player pool from [Fantasy Football Calculator](https://fantasyfootballcalculator.com/adp)'s mock-draft ADP, fetched through a small Cloudflare Pages Function (`functions/api/ffc/`) because FFC's API can't be called from a browser.
* **Live Market Value (ADP) Syncing:** Pulls platform-wide ADP trends and market data tailored to specific league formats (Fantasy Football Calculator and Sleeper ADP: 1QB PPR/Half-PPR/Standard, 2QB/Superflex, plus FFC dynasty rookie drafts) and automatically flags rookies with a purple `[R]` badge.
* **Manual Market Paste Fallback:** Allows users to paste custom ADP rows if API access is restricted.
* **Setup Screen Shortcuts & Tooltips:**
* An interactive banner linking directly to the Info & Guide tab.
* Custom CSS hover/tap tooltips (`ℹ️`) next to major sections explaining their functionality.



### 2. Sleeper Platform Integration

* **API Authentication:** Links directly to Sleeper username and Draft ID endpoints.
* **Live Auto-Sync Mode:** Polls the Sleeper draft picks API every 3 seconds to auto-cross players off the tracker as they are drafted league-wide.
* **Interactive Live Indicator:** A clickable `🔴 LIVE` pill in the header that displays active synchronization status and allows users to stop live syncing with a single tap.
* **Automatic League Configuration:** Pulls official league settings (total teams and total rounds) directly from Sleeper's draft metadata.

### 3. The Tracker (Primary Drafting View)

* **Clean Row-Based Header Control:** Stacked layout featuring a live pick counter (`Pick: X.XX`) on the left, a narrower reset picks button on the right, and a 100% width search bar below.
* **Dynamic Position Grid & Tiers:**
* 5-button filter grid (ALL, QB, RB, WR, TE) for instant positional filtering.
* Live tier tracking display (e.g., `QB T2 (3)` indicates the highest available tier is Tier 2 with 3 players remaining).


* **Smart Player Cards:** Displays player rank, name, positional group, display rank, rookie status, team, bye week, and market value.
* **Dynamic Value / Reach Badges:** Automatically calculates whether a player is a value pick (`+12 Value`) or a reach (`-8 Reach`) based on the current overall pick number versus their custom rank.
* **Call-Out Color Coding:** Custom highlight styles and background tints for user-defined **Targets (🟢)**, **Avoids (🔴)**, and **Dart Throws (🔵)**.
* **Stack Highlighting:** Automatically tags available WRs or TEs with a `🔥 Stack` badge if their corresponding quarterback is already on your team roster.
* **Inline Player Editor:** Tapping the pencil icon (`✏️`) on any player card opens an inline editor to adjust rank, tier, team, or bye week on the fly without leaving the tracker.
* **Pick Actions:** Quick action buttons (`Taken` vs. `My Pick`) to update draft state manually or offline.

### 4. The Team Tab (Roster & Lineup Management)

* **Configurable Roster Limits:** Fully customizable starting requirements (QB, RB, WR, TE, FLEX, SFLEX, Bench, Total) with auto-calculating total rounds.
* **Visual Lineup Slotting:** Automatically slots your drafted players into optimal starting and bench positions.
* **Bye Week Collision Warnings:** Built-in 2026 NFL bye week database that triggers an alert banner if 3 or more starting players share the same bye week.
* **Draft History Feed:** Displays a reverse-chronological list of all other drafted players with a quick `Undo` action.

### 5. The Draft Board Tab (Grid View)

* **Ultra-Wide Full-Bleed Grid:** Scales dynamically across columns based on league size (e.g., 10-team, 12-team, 14-team) and round depth.
* **Positional Color Coordination:** Cells are color-coded by position (QB, RB, WR, TE) and display player first/last name abbreviations and pick numbers.
* **My Team Highlighting:** Automatically outlines and highlights your team's drafted columns with a bold white border.
* **Hybrid Mapping Support:** Functions seamlessly with both live Sleeper API sync and sequential manual tracker picks for offline users.

### 6. UI/UX & Mobile Optimization

* **Clickable Header Navigation:** Tapping the app logo or title in the header instantly routes the user back to the Setup screen.
* **Hamburger Menu:** Slide-in navigation drawer with a dark backdrop overlay for switching tabs and accessing the Ko-fi support link.
* **Hybrid Bottom Navigation Bar:** Persistent bottom bar for quick thumb access between the Tracker, Team, and Draft Board tabs.
* **Swipe Gesture Navigation:** Allows swiping left/right between tabs on mobile, complete with a safety guard clause (`if (currentId === 'board') return;`) that suppresses tab-swapping while scrolling horizontally across the Draft Board grid.
* **Responsive Desktop/Mobile Layouts:** Designed with CSS grid and flexbox to utilize full desktop screen space while remaining compact on mobile devices.

### 7. Robust Data Handling & Edge Cases

* **Bulletproof Name Matching & Aliases:** Features a two-way normalization and alias mapping engine to successfully match mismatched names across platforms (e.g., *Kenny Gainwell* $\leftrightarrow$ *Kenneth Gainwell*, *Gabe Davis* $\leftrightarrow$ *Gabriel Davis*, *Tank Dell* $\leftrightarrow$ *Nathaniel Dell*, *Nick Singleton* $\leftrightarrow$ *Nicholas Singleton*).
* **Duplicate Name Collision Resolution:** Prioritizes active NFL players and exact team matches over retired free agents when scanning shared database IDs (e.g., resolving duplicate names like *Kyle Williams*).
* **Local Storage Persistence:** Automatically saves all draft progress, roster settings, call-outs, and custom rankings to the browser's `localStorage` so data is never lost on refresh.
* **Reset Controls:** Offers safe granular control to reset draft picks only or execute a full hard reset wipe.
