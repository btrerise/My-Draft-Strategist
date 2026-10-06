# My Draft Strategist

Fantasy football tools at mydraftstrategist.com: a static site on Cloudflare Pages with **no build step**.
Every file is served as it is in the repo (including tests/ and docs/, which is fine).

## The three pages

- `/` (`index.html`): **Draft Strategist** (MDS), the draft companion. Code in `js/mds/`, styles in `css/mds.css`.
- `/lineup/` (`lineup/index.html`): **Lineup Strategist** (MLS), in-season lineups, waivers, trades, simulator.
  Code in `js/mls/`, styles in `css/mls.css`.
- `/t-score/` (`t-score/index.html`): the **T-Score** page. Code in `js/tscore/main.js`, styles in `css/tscore.css`.

All three share one origin, so one localStorage and one service worker (`sw.js`, at the site root).

## Layout

- `js/boot.js`: plain script, first on every page (safe storage reads, fatal-error banner, rescue backup).
- `js/shared/`: code more than one page uses (ES modules): `api/` (Sleeper, FantasyCalc, FFC), `rankings/`
  (parser, upload preview), `storage/` (`keys.js`, `idb.js`, `keyMigration.js`), `ui/` (toasts, dialogs,
  `delegate.js`), `data/` (T-Score data, bye weeks), `globals.js` (loaded second on every page).
- `js/mds/`, `js/mls/`: one module per area; `main.js` is each app's entry point. In MLS, `main.js`'s import list
  sets the load order.
- `css/base.css` (shared) plus one file per page. `functions/api/ffc/`: a Pages Function (FFC proxy).
- `tests/`: Playwright specs, `tests/unit/` (node --test), fixtures, screenshot baselines, opt-in tools.
- `scripts/`: `check-precache.mjs`, `update-byes.mjs`. `docs/TESTING.md`: the testing and conventions guide.
- `CHANGELOG.md`: user-visible changes. `docs/refactor/LOG.md`: history of the module-structure refactor.

## Before pushing

```sh
cd tests && npm ci && npm run check   # check-precache + node --test + Playwright (smoke, features, screenshots)
```

CI (`.github/workflows/check.yml`) runs the same on every pull request. Screenshots must stay pixel-identical
unless the change is meant to be visible; see "Accepting an intended visual change" in `docs/TESTING.md`.
In cloud sessions Chromium is preinstalled at `/opt/pw-browsers`: don't run `playwright install`.
Baselines are tied to Playwright 1.56.1 on Ubuntu 24.04 (`tests/render-env.mjs`); upgrading either means re-taking
all of them ("Upgrading Playwright or the CI runner" in `docs/TESTING.md`).

## Rules that bite

- Add, rename or delete a JS or CSS file → update `PRECACHE_ASSETS` in `sw.js` in the same commit.
- Bump `CACHE_NAME` in `sw.js` (last number, above main's) whenever a file the site serves changes.
- Every storage key is spelled only in `js/shared/storage/keys.js`, with its app's prefix (`mds_` / `mls_`).
- No inline `on*=` handlers: use `data-action` and `delegate()`.
- Icons are inline SVG (`aria-hidden="true"`, `stroke="currentColor"`), never emoji, in anything users see (owner's rule).
- User-visible change → a line under the app's "Unreleased" in `CHANGELOG.md`.
- Keep the public URLs (`/`, `/lineup/`, `/t-score/`) and `sw.js` at the root.
- **Refactor chunk 6C is pending** (not before 2026-10-17): don't rename or remove storage keys, and don't edit
  `js/shared/storage/keyMigration.js` or its tests.

Details and the reasons for each rule: `docs/TESTING.md`.
