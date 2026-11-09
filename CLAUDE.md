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

While iterating, run only what you touched (a minute or two), and push:

```sh
cd tests && node ../scripts/check-precache.mjs && node --test && npx playwright test <spec> …
```

Run the full suite (about 20 minutes in a cloud session) once, before your card's last push; CI runs it again on the
pull request. See "While iterating" in `docs/TESTING.md`.

```sh
cd tests && npm ci && npm run check   # check-precache + node --test + Playwright (smoke, features, screenshots)
```

CI (`.github/workflows/check.yml`) runs the same on every pull request. Screenshots must stay pixel-identical
unless the change is meant to be visible; see "Accepting an intended visual change" in `docs/TESTING.md`.
In cloud sessions Chromium is preinstalled at `/opt/pw-browsers`: don't run `playwright install`. The pinned Playwright
(1.63.0, Chromium 153, revision 1243) matches the image's build since 2026-11-05, so specs run on the same browser as CI.
If the image moves ahead again, the tests launch the preinstalled one by themselves (`tests/browser.mjs`). Screenshots
still can't match in a cloud session: the image adds font rules CI doesn't have, and `visual.spec.mjs` fails with one
message saying so. Compare main and your branch in the same container ("When your machine can't reproduce the
baselines" in `docs/TESTING.md`) and let CI judge. `cd tests && node render-env.mjs` shows the browser and fonts.
Baselines are tied to Playwright 1.63.0 on Ubuntu 24.04 with CI's fonts (`tests/render-env.mjs`); upgrading either means
re-taking all of them ("Upgrading Playwright or the CI runner" in `docs/TESTING.md`).

## Rules that bite

- Add, rename or delete a JS or CSS file → update `PRECACHE_ASSETS` in `sw.js` in the same commit.
- Bump `CACHE_NAME` in `sw.js` (last number, above main's) whenever a file the site serves changes.
- Every storage key is spelled only in `js/shared/storage/keys.js`, with its app's prefix (`mds_` / `mls_`).
- No inline `on*=` handlers: use `data-action` and `delegate()`.
- Icons are inline SVG (`aria-hidden="true"`, `stroke="currentColor"`), never emoji, in anything users see (owner's rule).
- User-visible change → a line under the app's "Unreleased" in `CHANGELOG.md`.
- New badge, chip, pill or symbol → a line in that app's Guide legend (`js/mls/legend.js` or `js/mds/legend.js`) in the
  same change, drawn with the same markup (`tests/unit/badgeLegend.test.mjs` fails on a badge class it doesn't list).
- Keep the public URLs (`/`, `/lineup/`, `/t-score/`) and `sw.js` at the root.
- Old key names (pre-6B `ds_*`, `mds_season_*`): each page copies its own to the new names, then deletes them
  (`js/shared/storage/keyMigration.js`; marker `*_key_names_version` = `'1'` copied, `'2'` deleted). Keep the OLD
  NAMES table, `renameLegacyKeys` and the `*OrLegacy` filters for good (old browsers, old backup files). A key nothing
  uses any more goes in `RETIRED_KEYS` (`keys.js`), not just deleted. Tests: `tests/unit/keyMigration.test.mjs`,
  `tests/key-migration.spec.mjs`.

Details and the reasons for each rule: `docs/TESTING.md`.

Optional work nobody has scheduled is under "Open follow-ups" in `docs/TESTING.md`. If your change touches one of
those areas, mention the item to the owner; remove an item's line when it's done or dropped.
