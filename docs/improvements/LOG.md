# Improvements log

Work from the [Strategist Improvements Runbook](https://claude.ai/artifact/SF5xjaoxUyzPJM7WKCmohN): one entry per card,
with what changed, the owner's decisions and anything left over. [`docs/refactor/LOG.md`](../refactor/LOG.md) is the
history of the module-structure refactor.

## Standing rules from the owner (apply to every card)

- **Icons are SVG, never emoji** (set during S1). Anything users see uses an inline `<svg aria-hidden="true">` with
  `stroke="currentColor"`, Feather-style like the rest of the site. Recorded in `CLAUDE.md` ("Rules that bite") and
  `docs/TESTING.md` (Conventions). Plain text glyphs already in use (✕, ★) are fine.

## S1 — Top available players in your league

**User-visible effect.** The Scout tab's **Waiver Wire Assistant** is now one card with three modes, switched by a
segmented control at the top: **Top Available** (the default), **Auto-Find** and **Check a List**. All three share
one Rank By dropdown, one row of position chips (All, QB, RB, WR, TE, FLEX, K, DEF; it replaces the Position dropdown)
and one results area. Each mode shows only its own controls: Compare Against for Auto-Find and Check a List; Show Top
and Only Would-Starts for Auto-Find; Search In, Looking To and the textarea for Check a List. The position chips are
hidden in Check a List.

Top Available draws as soon as the Scout tab opens (no button). It's a compact list in the spirit of FantasyCalc's
waiver card:
- **All:** one small box per position (top 5 each), in a grid (three across on desktop, stacked on phones), each with a
  "See all N" link when more are available.
- **One position or FLEX:** one box, 15 at a time, with a Show 15 more button.
- **Each row:** number, name, team, a position-rank chip with tier ("RB8", "WR4 T2"), injury and bye badges, a green
  "Starts" flag with an SVG check when he'd make your lineup this week, and on the right the cross-position number for
  the Rank By choice ("Wk Flex" #21 for RB/WR/TE, a dash for QB/K/DEF; "ROS Ovr" for ROS), labelled in each box's
  header.

The Auto-Find and Check a List results themselves are unchanged.

**History of the card's design.** The first push put Top Available in its own card above the Waiver Wire Assistant,
with a Show button and full-size rows. The owner found the two cards clunky side by side and chose, from three options
(cards side by side on desktop; one card with modes; a compact board above), **one card with modes, using the compact
rows**. This entry describes the final version.

**Owner's decisions:**
- Before building: All = top 5 per position; a position or FLEX = top 15 plus "Show 15 more". A flat top-25 list was
  turned down because, with per-position or FLEX Weekly sheets, the parser's `rank` is a FLEX or position rank, not an
  overall one.
- Before building: Rank By is the waiver scan's existing setting (`State.waiverScanSettings.basis`), so there's one
  Rank By for all three modes. It falls back to the other set, with `resolveWaiverBasis`'s note, when the chosen one
  isn't loaded.
- Before building: no "All my leagues" mode in this card. The follow-up is proposed as card S5 below.
- After the first push: one card with three modes and compact rows (above).
- After the first push: fix the missing redraws (below), and Sleeper trending as a follow-up (S6 below), using SVG icons.

**What changed and where.**
- `js/mls/scout/topAvailable.js` (new, in `PRECACHE_ASSETS`): `renderTopAvailable`, `setWaiverMode`, `setWaiverPos`,
  `showMoreTopAvailable`, `refreshTopAvailable`, `onScoutTabShown`.
- **Reuse, no second copy of the candidate logic:** `buildWaiverContext` (positions from the cached Sleeper player map,
  display ranks, the Would Start check), `resolveWaiverBasis`, `findFreeAgents` (available = not in `globalRosterMap`;
  draft picks out; unmatched names reported), `waiverDerivedNotes` and `isFullyMappedLeague`.
- **Not reused:** `getTopWaiverCandidatesByPosition` ranks by ROS or Market only (it can't follow Weekly) and drops
  unmatched names silently. `ensureSleeperPosByName` isn't needed, because `buildWaiverContext` reads the same cached
  player map through `getSleeperMetaByName`. No new network calls.
- **Settings:** the mode is stored as a new `mode` field ('top' | 'auto' | 'list') inside the existing
  `mls_waiver_scan_settings` value. Default 'top'. No new storage key.
- **Position chips:** they write the existing `pos` field, which Auto-Find already read (default FLEX). Paging lives in
  memory only.
- **Would Start:** only `starts` gets a flag. Bench/Out/Played would turn the list back into Auto-Find. Players whose
  game already kicked off stay in the list, since it's about who's available, not about this week.
- **Manual and Draft Strategist hand-off leagues:** the summary reads "Top … not on your roster in …", each box's count
  reads "N not on your roster", and Auto-Find's manual-league note is shown word for word. The compact rows carry no
  per-row tag; the box header labels them.
- **Synced leagues:** "Ownership is from this league's last sync (synced today). Re-run Sync All on the Dashboard if a
  recent add or drop is missing." (`getFreshness` on `lastSyncedAt`).
- **Empty and error states:**
  - No league: "No league yet. Sync a Sleeper league on the Dashboard first…"
  - No rankings: "No rankings loaded. Upload Weekly rankings (Lineup tab) or ROS rankings (Roster tab) first."
  - Everyone ranked is rostered, overall and per position: "Every player in your Weekly rankings (24 ranked) is already
    rostered in this league. A deeper rankings file would show who's left."
  - A position the file doesn't rank.
  - A thrown error: Auto-Find's two messages, reworded for this mode.
- **Redraw fix:** the first version only redrew on a league switch. Now Top Available draws whenever the Scout tab is
  shown in that mode (`nav.js` → `onScoutTabShown`), on a league switch, and on a mode, chip or Rank By change.
  - Rankings uploads, set changes and deletes happen on the Roster and Lineup tabs, and syncs on the Dashboard or
    Roster tab, so coming back to the Scout tab picks them all up. No hook was needed in each of those paths.
  - Before, Sync All happened to redraw (it ends with `switchActiveLeague`), but the Roster tab's single-league
    re-sync and rankings uploads did not.
  - Nothing renders while the Scout tab is hidden, so Sync All's loop over leagues triggers no renders.
- **`lineup/index.html`:** the Waiver Wire Assistant card rebuilt with `data-waiver-modes` blocks, the mode toggle and
  chips (data-action only). The earlier separate Top Available card is gone. The tooltip now covers all three modes.
  The Clear button shows in Auto-Find and Check a List only.
- **`js/mls/scout/waivers.js`** (`applyWaiverScanSettingsToUI`): syncs the mode toggle, the hidden blocks, the mode
  hint and the chips. The `WAIVER_MODES` list is exported from there.
- **`js/mls/state.js`:** `mode: 'top'` default.
- **`js/mls/main.js`:** the setWaiverMode / setWaiverPos / showMoreTopAvailable actions. The Rank By dropdown also
  calls `refreshTopAvailable`.
- **`js/mls/leagues/sync.js`** (`switchActiveLeague`): the results area follows the mode. Top Available redraws, Check
  a List re-runs a pasted list as before, and anything else is cleared.
- **`css/mls.css`:** `[data-waiver-modes][hidden]`, `.mls-chip*` and `.mls-ta-*`.
- **`sw.js`:** `CACHE_NAME` v2.8.73 → v2.8.74. CHANGELOG line under Lineup Strategist's Unreleased.

**Tests.**
- `tests/mls-top-available.spec.mjs` (both widths), using the 3G free agents in `rankings-waivers.csv`. It covers:
  - the default mode and the empty states;
  - an upload on another tab showing up on return (the redraw fix);
  - All grouped and ordered, with row contents (team, RB8, #21, Starts, a dash for QB);
  - the RB, FLEX and K chips;
  - the Rank By dropdown redrawing (ROS Ovr #25);
  - switching modes;
  - a manual league (wording, 15 of 25 then Show 10 more, See all) and a league switch redrawing the list.
- `mls-scout.spec.mjs` and `mls-waiver-insights.spec.mjs` now switch to Check a List or Auto-Find before using those
  controls. The opt-in `tests/tools/css-compare.tool.mjs` does the same, through `setWaiverMode?.()` so it still runs
  against a main from before S1.

**Screenshots re-taken:** the Waiver Wire Assistant is now the mode toggle plus Top Available's "No rankings loaded"
state, since the seeded screenshot league has no rankings.
- `tests/baselines/linux/desktop/mls-league-scout.png`
- `tests/baselines/linux/phone/mls-league-scout.png`

**Left over.**
- Check a List hides the position chips, but its Whole Roster verdict still reads the Position setting (FLEX groups
  RB/WR/TE together; anything else compares within the player's own position), as it did when the dropdown was visible.
- **Older emoji to replace with SVG** (found while recording the icons rule; a small polish card):
  - `js/mls/render/lineup.js:536`: the "🎉 Lineup Optimized!" toast at the end of the setup flow.
  - `js/mds/team.js:118`: the "⚠️ WARNING" bye-week banner in Draft Strategist.
  - `js/mds/sleeperSync.js:400`: 🔴 appears only in a code comment; the LIVE pill itself is CSS.
- Proposed follow-up cards S5 and S6 below. They aren't on the runbook page yet.

### Proposed card S5 — Best available in every league (Dashboard)

The owner liked this in S1's discussion. Not built.
- A "Best available in your leagues" card under the League Command Center, rather than a column in its table (already
  four columns, scrolling inside 400px, cramped on phones).
- One line per league: its top 3 available by **that league's own assigned rankings** (Weekly, else ROS), for example
  "Fixture League: James Cook RB8 · Jaxon Smith-Njigba WR11 · Jayden Daniels QB5", plus a View button that switches to
  the league and opens the Scout tab's Top Available.
- Manual and hand-off leagues read "not on your roster".
- No Would Start there: that check needs the active league's lineup.
- Read each league's rankings from its saved set (`State.rankingSets`, by `rosRankingSetId` / `weeklyRankingSetId`,
  falling back the way `hydrateRankingsForLeague` does) without switching leagues.
- `findFreeAgents` needs only a position lookup and the league's `globalRosterMap`, so it can be reused per league.
  Build positions once from `getSleeperMetaByName`, like `runAllLeaguesSearch`.
- A player-first version ("free in 3 of 5 leagues") was considered and set aside: one list across leagues with
  different rankings has no single order.
- Tests: two fixture leagues (one manual), each with its own set; the per-league lines and View.

### Proposed card S6 — Sleeper trending adds

The owner liked this in S1's discussion. Not built. **Icons must be SVG** (owner's rule above).
- **Source:** Sleeper's public `GET https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=50`
  (`[{ player_id, count }]`, no auth). Add it to `js/shared/api/sleeper.js` and cache it for about an hour.
- **Tests:** add the route to `SLEEPER_FIXTURES` and a file in `make-fixtures.mjs`. The MLS sync test fails on any
  unmocked Sleeper URL.
- **Don't blend** trending into the rank order: "by your rankings" stays exactly that.
- **(a) Badge:** on Top Available rows, a small SVG trending-up icon (Feather `trending-up`) with the add count, for
  example "+8.2k", on any player in the trending list.
- **(b) Trending chip or toggle:** in Top Available, the trending adds still free in this league, ordered by add count,
  each with your rank or "UR". That surfaces players the crowd is chasing whose value your rankings disagree with.
- A failed fetch hides the badge and chip quietly (no `console.error`, which fails tests). Offline still works.
