# Improvements log

Work from the [Strategist Improvements Runbook](https://claude.ai/artifact/SF5xjaoxUyzPJM7WKCmohN): one entry per card,
with what changed, the owner's decisions and anything left over. [`docs/refactor/LOG.md`](../refactor/LOG.md) is the
history of the module-structure refactor.

## S1 — Top available players in your league

**User-visible effect.** The Scout tab has a new **Top Available** card above the Waiver Wire Assistant. It has a
Weekly/ROS Rank By toggle, position chips (All, QB, RB, WR, TE, FLEX, K, DEF) and a Show Top Available button. The list
shows the best-ranked players nobody in the active league has rostered. All is grouped by position, top 5 each, with a
"See all N" link per position. One position or FLEX shows 15 at a time ("Showing 15 of 25 available.") with a Show 15
more button. Each row has the position badge, name, team, injury/bye/game badges, the same rank line Auto-Find shows
(Wk Pos / Wk Flex / ROS, or ROS Pos / ROS Overall, with tiers) and a Would Start pill when he'd make your lineup this
week. Nothing else on the tab changed.

**Owner's decisions** (asked before building):
- Placement: its own card above the Waiver Wire Assistant, not a button beside Auto-Find.
- Count: All = top 5 per position; a position or FLEX = top 15 plus "Show 15 more". (A flat top-25 list was turned
  down: with per-position or FLEX Weekly sheets, the parser's `rank` is a FLEX or position rank, not an overall one.)
- Rank By: shares the waiver scan's existing setting (`State.waiverScanSettings.basis`, key `mls_waiver_scan_settings`),
  so the card's toggle and the Waiver Wire Assistant's dropdown always agree. It falls back to the other set, with
  `resolveWaiverBasis`'s note, when the chosen one isn't loaded.
- No "All my leagues" mode in this card (see Left over).

**What changed and where.**
- `js/mls/scout/topAvailable.js` (new, in `PRECACHE_ASSETS`): `showTopAvailable`, `setTopAvailablePos`,
  `setTopAvailableBasis`, `showMoreTopAvailable`, `refreshTopAvailable`. The position chip and paging are in memory
  (reset to All on reload): no new storage key.
- Reuse, no second copy of the candidate logic: `buildWaiverContext` (positions from the cached Sleeper player map,
  display ranks, the Would Start check), `resolveWaiverBasis`, `findFreeAgents` (available = not in
  `globalRosterMap`; draft picks out; unmatched names reported), `waiverRanksRowHTML`, `waiverVerdictParts`,
  `waiverDerivedNotes` and `isFullyMappedLeague`. `getTopWaiverCandidatesByPosition` isn't used: it ranks by ROS or
  Market only (it can't follow Weekly) and drops unmatched names silently. `ensureSleeperPosByName` isn't needed:
  `buildWaiverContext` reads the same cached player map through `getSleeperMetaByName`. No new network calls.
- The Would Start pill is only shown for `starts`: Bench/Out/Played pills would turn the list back into Auto-Find.
  Players whose game already kicked off stay in the list (it's about who's available, not this week's help).
- Manual and Draft Strategist hand-off leagues: summary "Top players not on your roster in …", group counts "N not on
  your roster", a "Not on your roster" tag on each row and Auto-Find's manual-league note, word for word.
- Synced leagues: "Ownership is from this league's last sync (synced today). Re-run Sync All on the Dashboard if a
  recent add or drop is missing." (the all-leagues search's wording, with `getFreshness` on `lastSyncedAt`).
- Empty and error states: no league ("No league yet. Sync a Sleeper league on the Dashboard first…"), no rankings
  ("No rankings loaded. Upload Weekly rankings (Lineup tab) or ROS rankings (Roster tab) first."), everyone ranked is
  rostered ("Every player in your Weekly rankings (24 ranked) is already rostered in this league. A deeper rankings
  file would show who's left.", also per position), a position the file doesn't rank, and a thrown error (Auto-Find's
  two messages, reworded for this card).
- `lineup/index.html`: the card (data-action only). `css/mls.css`: `.mls-chip-row`/`.mls-chip` and `.mls-topavail-*`.
- `js/mls/main.js`: four click actions; the Rank By dropdown's change also calls `refreshTopAvailable`.
  `js/mls/leagues/sync.js` (`switchActiveLeague`): redraws the list for the new league when it's showing.
  `js/mls/scout/waivers.js` (`applyWaiverScanSettingsToUI`): keeps the card's Rank By toggle in step. Auto-Find, Scan
  Pasted List and All-Leagues output are unchanged.
- `sw.js`: `CACHE_NAME` v2.8.73 → v2.8.74. CHANGELOG line under Lineup Strategist's Unreleased.

**Tests.** `tests/mls-top-available.spec.mjs` (both widths), using the 3G free agents in `rankings-waivers.csv`:
no league, no rankings, everyone rostered (`rankings.csv`), All grouped and ordered, the RB/FLEX/K chips, Rank By
toggle ↔ dropdown, then a manual league (wording, "Not on your roster", 15 of 25 then Show 10 more, See all) and a
league switch redrawing the list.

**Screenshots re-taken** (the new card on the Scout tab, collapsed state; everything below it moves down):
- `tests/baselines/linux/desktop/mls-league-scout.png`
- `tests/baselines/linux/phone/mls-league-scout.png`

`npm run pxdiff -- --runs 1` afterwards: all 40 PNGs pixel-identical to the new baselines.

**Left over.**
- "All my leagues" mode (where each player is free across synced leagues). Each league can use a different rankings
  set, so a follow-up card has to decide whose rankings order the list.
- Sleeper trending adds as a second source (out of scope: new network call).
- The list doesn't redraw itself after a rankings upload or a re-sync of the same league; tap Show Top Available again.
