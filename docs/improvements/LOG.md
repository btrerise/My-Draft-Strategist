# Improvements log

Work from the [Strategist Improvements Runbook](https://claude.ai/artifact/SF5xjaoxUyzPJM7WKCmohN): one entry per card,
with what changed, the owner's decisions and anything left over. [`docs/refactor/LOG.md`](../refactor/LOG.md) is the
history of the module-structure refactor.

## Standing rules from the owner (apply to every card)

- **Icons are SVG, never emoji** (set during S1). Anything users see uses an inline `<svg aria-hidden="true">` with
  `stroke="currentColor"`, Feather-style like the rest of the site. Recorded in `CLAUDE.md` ("Rules that bite") and
  `docs/TESTING.md` (Conventions). Plain text glyphs already in use (✕, ★) are fine. Enforced by
  `tests/unit/noEmoji.test.mjs`, which scans every served file and fails naming the file and line.

## S1 — Top available players in your league

**User-visible effect.** The Scout tab's **Waiver Wire Assistant** is now one card with three modes, switched by a
segmented control at the top: **Top Available** (the default), **Auto-Find** and **Check a List**. All three share
one Rank By dropdown, one row of position chips (All, QB, RB, WR, TE, FLEX, K, DEF; it replaces the Position dropdown)
and one results area. Each mode shows only its own controls: Compare Against for Auto-Find and Check a List; Show Top
and Only Would-Starts for Auto-Find; Search In, Looking To and the textarea for Check a List. In Check a List the position
chips show only with Whole Roster, as "Compare Within" (round 3 below).

Top Available draws as soon as the Scout tab opens (no button). It's a compact list in the spirit of FantasyCalc's
waiver card:
- **All:** one small box per position (top 5 each), in a grid (three across on desktop, stacked on phones), each with a
  "See all N" link when more are available.
- **One position or FLEX:** one box, 15 at a time, with a Show 15 more button.
- **Each row:** number, name, team, a position-rank chip with tier ("RB8", "WR4 T2"), injury and bye badges, a green
  "Starts" flag with an SVG check when he'd make your lineup this week, and on the right the cross-position number for
  the Rank By choice ("Wk Flex" #21 for RB/WR/TE, a dash for QB/K/DEF; "ROS Ovr" for ROS), labeled in each box's
  header.

The Auto-Find and Check a List results themselves are unchanged.

**History of the card's design.** The first push put Top Available in its own card above the Waiver Wire Assistant,
with a Show button and full-size rows. The owner found the two cards clunky side by side and chose, from three options
(cards side by side on desktop; one card with modes; a compact board above), **one card with modes, using the compact
rows**. This entry describes the final version.

**Round 3 (owner's answers after the second push):**
- **Check a List shows the chips (option 3 of 3).** Before, the chips were hidden in Check a List, but its Whole Roster
  verdict still read the hidden Position setting. Now `#waiverPosWrap` shows in Check a List only when Compare Against
  is Whole Roster, the one case where Position changes the result. It's labeled "Compare Within", with a hint: FLEX
  compares a pasted RB, WR or TE against your weakest RB, WR or TE together; any other choice compares within the
  player's own position. Changing a chip re-runs a pasted This League list already on screen. The verdict logic
  (`pastedRosterVerdict`) is unchanged.
- **All is the default position**, for Top Available and Auto-Find alike, since they share the setting:
  `pos: 'ALL'` in `js/mls/state.js`, with the All chip active in the markup. People who already have a saved Position
  (any waiver setting change stores the whole settings object) keep it.
- **Position colors:** each row's rank chip ("RB8") and each box's position heading use the site's position-badge
  classes (`badge pos-badge RB`, the colors in `css/base.css`). FLEX headings stay plain text, since FLEX has no color
  of its own.
- Tests: `mls-top-available.spec.mjs` checks the All default, the badge classes, and Compare Within: hidden for
  Starting Lineup; shown for Whole Roster; "Chase Brown" checked against "Derrick Henry (your weakest RB)" with RB,
  then re-checked against "George Kittle (your weakest FLEX)" with FLEX.
- Screenshots re-taken again (the All chip is now the active one): the same two `mls-league-scout.png` files.

**Round 4: position buttons styled like Draft Strategist's** (owner's request).
- The Waiver Wire Assistant's position chips are now Draft Strategist's Tracker filter buttons:
  `badge pos-badge <POS> pos-filter`, with `badge badge-all pos-filter` for ALL. Unpicked buttons are faded and
  grayed, the picked one is full color, and ALL lights every button, as in the Tracker (`js/mds/tracker.js`).
  aria-pressed marks only the picked one. The layout is one row of eight, two rows of four on phones
  (`.mls-pos-filter-grid`). FLEX has no position color: lit by ALL it reads plain, and picked itself it turns green
  (`.mls-pos-filter-flex` in `css/mls.css`; replaced in round 5).
- **CSS move:** the `.pos-filter` rules (base, hover, active, ALL's green, the button reset and focus ring) moved
  from `css/mds.css` to the end of `css/base.css`, so both apps load them. They sit at the end so `.pos-filter` still
  beats the shared `.badge` rule. `button.edit-link` keeps its half of the old shared rule in `css/mds.css`. The
  `.mls-chip` styles are gone.
- **Checked:**
  - Draft Strategist's screenshots are pixel-identical.
  - `npm run compare-css` against main: every MDS state matches. One phone run showed `#rankingsSuccessMsg`
    `display: none -> block`, which is the "Loaded N players" message a timer hides, not a style; re-runs show 0
    differences. MLS differs as intended.
- Screenshots re-taken: the same two `mls-league-scout.png` files.

**Round 5: one look for FLEX everywhere** (owner's choice from four rendered options: violet like the Lineup tab,
neutral slate, an RB/WR/TE blend, or round 4's gray-then-green; the owner picked the blend and asked for it everywhere
FLEX is shown).
- **Shared definition** in `css/base.css`:
  - `:root` variables `--flex-blend` (RB→WR→TE), `--sflex-blend` (QB→RB→WR→TE) and `--wt-blend` (WR→TE), built from
    the existing `--pos-*-border` colors, plus `--blend-fill` (the dark fill inside the border).
  - Classes `.flex-blend`, `.sflex-blend` and `.wt-blend` at the end of the file: a transparent 1px border with the
    gradient behind it (`padding-box` fill over a `border-box` gradient), kept on `.pos-filter` hover.
- **Where it's used:**
  - The Waiver Wire Assistant's FLEX button (`badge pos-filter flex-blend`). Like every other position button, it
    looks the same whether ALL lit it or it was picked; round 4's green-on-pick is gone.
  - Top Available's FLEX box heading.
  - The Lineup tab's `.slot-badge.slot-FLEX` and `.slot-badge.slot-SFLEX`, which were violet (`css/mls.css`).
  - Draft Strategist's Team tab: filled FLX, SFLX and W/T labels are gradient text (`.roster-label.flex-blend-text`
    etc. in `css/mds.css`, two classes to beat `.roster-label`'s gray). `buildSlotHTML` in `js/mds/team.js` takes
    an optional text class. They were green, red and teal, borrowed from single positions. Empty slots keep the
    muted label.
- **SFLEX and W/T** were not named by the owner. They got the same treatment with their own positions, because
  SFLEX shared FLEX's violet badge and W/T is the other flex slot. Each is one rule to revert.
- **Not changed:** the "FLEX" badge Draft Strategist shows for players uploaded without a position, and the Scout
  tab's "FA" badge for unknown positions (`badgeClass = 'FLEX'` in `scout/engine.js` and `allLeaguesSearch.js`). Both
  mean "unknown position", not the FLEX slot, and neither uses these classes.
- **Screenshots re-taken:** `mls-league-lineup.png` (the fixture's FLEX slot badge) and `mls-league-scout.png`, both
  widths. Draft Strategist's screenshots are unchanged: their FLX slot is empty.

**Round 6: W/T and W/R slots in Lineup Strategist** (bug fix; owner's request after round 5 mentioned Draft
Strategist's W/T slot).
- **The bug:**
  - Lineup Strategist's league sync (`processSleeperData`, `js/mls/leagues/sync.js`) counted Sleeper's `REC_FLEX`
    (WR/TE only) and `WRRB_FLEX` (WR/RB only) as a full FLEX. The optimizer could start an RB in a W/T slot or a TE
    in a W/R slot, a lineup Sleeper rejects; the swap check allowed the same.
  - The Draft Strategist hand-off (`js/mds/handoff.js`) folded W/T into FLEX, and its comment said so.
  - Draft Strategist's own league sync (`js/mds/sleeperSync.js`) looked for `'W/T'`, but Sleeper's `roster_positions`
    says `REC_FLEX`, so a league's W/T slot was never counted at all.
- **Tests written first and seen failing:**
  - `tests/unit/waiverScanner.test.mjs`: W/T and W/R in `slotAcceptsPos` and `fillLineup`.
  - `tests/restricted-flex.spec.mjs`, which serves the fixture league with its FLEX swapped for Sleeper's slot names:
    - Lineup Strategist syncs W/R and W/T, and the W/R slot gets Lamb (WR), not McBride (TE). On main, McBride was
      in that slot.
    - A Draft Strategist W/T slot arrives in Lineup Strategist as W/T.
    - Draft Strategist counts `REC_FLEX` as W/T.
- **The fix.** Two new slot types: `WRTE` (shown "W/T") and `WRRB` (shown "W/R"). `SLOT_POSITIONS` and
  `slotDisplayName` live in `js/mls/constants.js`. They are used by:
  - sync's mapping;
  - the requirements editor (two new inputs, `reqWRTE` and `reqWRRB`);
  - `optimizeLineup`, which fills W/R and W/T after the fixed slots and before FLEX, by the FLEX comparator;
  - `slotAcceptsPos`, for swaps and Waiver Insights;
  - the waiver scanner's mirror (`SLOT_ORDER`, `fillLineup`, `slotAcceptsPos`), so Auto-Find's Would Start agrees
    with the optimizer;
  - Power Rankings' starter slots;
  - Auto-Find's comparison wording ("your W/T"), Copy as Text and the Power Rankings tooltip;
  - the hand-off, which sends W/T as `WRTE`;
  - the slot badges, which use the W/T (WR→TE) and W/R (RB→WR) color blends.
- **Kickoff relabeling.** `optimizeFlexKickoffOrder` already leaves any slot other than RB/WR/TE/FLEX alone, so W/T
  and W/R players stay where the fill put them and never trade places with FLEX for a later kickoff. Runbook card F1
  (SFLEX kickoff) rewrites that function and now notes this.
- **Existing leagues:** re-sync rewrites `league.reqs` from Sleeper (the sync builds `reqs` from scratch each
  time), so Sync All fixes a league synced before this. No storage key changed; `reqs` just has two more fields.
- **Draft Strategist W/R** (owner's follow-up request, same round). A new `WRRB` limit beside `WT`:
  - `js/mds/sleeperSync.js` counts Sleeper's `WRRB_FLEX` (and `'W/R'`); the draft-settings fallback reads
    `slots_wrrb_flex`, named like `slots_rec_flex` and 0 when absent. Unverified against a live Sleeper draft.
  - `js/mds/settings.js` keeps `WRRB` on save (like `WT`, it's set by sync and not editable) and counts it in TOTAL.
  - `js/mds/team.js` fills W/R slots before W/T and FLEX, with a W/R label in the RB→WR blend
    (`.roster-label.wr-blend-text`, `--wr-blend` in `css/base.css`).
  - `js/mds/handoff.js` sends it as `WRRB`.
  - The Team tab's roster-limits FLX column (drawn by `renderBoard` in `js/mds/tracker.js`) now counts W/R, W/T and FLEX together. It only
    counted FLEX before, so a filled W/T never showed. Extra RB/WR/TE fill W/R (RBs first), then W/T (TEs first),
    then FLEX, which fills the most slots since WRs fit all three. The `<th>` has a title saying so.
  - Tests, written first and seen failing (`tests/restricted-flex.spec.mjs`):
    - Draft Strategist counts `WRRB_FLEX` as W/R.
    - A W/R limit gives a Team tab W/R slot and an FLX of "2 / 2" in the roster-limits row (was "1 / 1").
    - The hand-off sends `WRRB`.
- **Left over:**
  - Power Rankings fills W/R before W/T greedily; in a league with both, a lineup can come out slightly below its
    best (noted in `power/shared.js`).
- **Screenshots re-taken:** `mls-empty-setup.png` and `mls-league-setup.png`, both widths (the two new
  requirement inputs; the grid is now two rows of five).

**Round 7: the empty roster-limits row** (owner's request; found during round 6). Before any rankings are loaded,
`renderBoard`'s empty-state branch (`js/mds/tracker.js`) drew the Team tab's roster-limits row with seven cells under
nine headers (no K or DEF), so the total sat under K. It now has K and DEF cells. Test written first and seen failing:
`tests/mds-limits-table.spec.mjs` (headers and all nine cells). Screenshots re-taken: `mds-empty-team.png`, both
widths (the row now lines up).

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
- **Position chips:** they write the existing `pos` field, which Auto-Find already read (default FLEX until round 3,
  now All). Paging lives in memory only.
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
- Follow-up cards S5 and S6 below; both are on the runbook page too (added in this session, Needs: S1).

### S1 extra: the last emoji replaced (owner's request after the icons rule)

Found while recording the icons rule; fixed in this session at the owner's request.
- **Lineup Strategist** (`js/mls/render/lineup.js`): the first Optimize Lineup toast read "🎉 Lineup Optimized! …".
  Toasts are set with `textContent` (`js/shared/ui/toast.js`), so they can't hold an SVG; the emoji is dropped and the
  words are unchanged.
- **Draft Strategist** (`js/mds/team.js`): the Team tab's bye-week banner ("⚠️ WARNING: You have 3 starting players on
  Bye in Week 8!") now starts with a Feather `alert-triangle` SVG in the banner's own color. It only shows with Bye
  Week Warnings on (off by default), so no screenshot changed.
- `js/mds/sleeperSync.js`: a code comment said "🔴 LIVE pill"; now "red LIVE pill".
- **Tests, failing first:** `tests/unit/noEmoji.test.mjs` (the scan; it listed exactly these three lines before the
  fix) and `tests/svg-icons.spec.mjs` (the toast's text, and the banner's SVG and text, both widths).
- CHANGELOG lines under both apps' Unreleased.

### Card S5 — Best available in every league (Dashboard)

The owner liked this in S1's discussion. Not built; on the runbook as S5 (Needs: S1).
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

### Card S6 — Sleeper trending adds

The owner liked this in S1's discussion. Not built; on the runbook as S6 (Needs: S1). **Icons must be SVG** (owner's rule above).
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

## F1 — FLEX Kickoff Optimization covers SFLEX slots

**User-visible effect.** With FLEX Kickoff Optimization on (the default), a superflex lineup now puts the latest
kickoffs in SFLEX first, then FLEX:
- A QB who plays later than your QB-slot QB moves to SFLEX, and the earlier QB takes the QB slot. With two QBs
  starting and one QB slot, SFLEX always keeps a QB.
- An RB/WR/TE in SFLEX trades places with a later-playing FLEX or strict-slot starter, as long as the slots still
  fit (an RB stays in an RB slot if the other RB slots need him).
- W/T and W/R slots get the same treatment within their positions, after FLEX: a W/T can trade with a later WR or TE,
  never an RB.
- Who starts never changes. With the toggle off, slots are exactly the rank-based fill, as before.
- Lineups without SFLEX, W/T or W/R are unchanged, slot for slot.
- Wording: the toggle's tooltip, the Optimize Lineup tooltip and the Guide's help text now name SFLEX (and W/T, W/R).

**Owner's decisions.**
- "Asks you" (a real league and week to test against): no real case. The tests use the runbook's two made-up cases.
- W/T and W/R: included (the card left it to the session). They're more flexible than a strict WR/RB/TE slot, so the
  same late-swap reasoning applies. They're settled after FLEX, W/T before W/R (later in fill order, so with no
  kickoff data nothing moves).

**Reproduced on main first** (`tests/mls-sflex-kickoff.spec.mjs`, both widths). It serves the fixture league with a
SUPER_FLEX slot (QB 1, RB 2, WR 2, TE 1, FLEX 1, SFLEX 1, K 1, DEF 1), gives mds_test Hurts (QB) and Gibbs (RB) from
the rival's roster, and sets `State.gameTimesByTeam` in the page (ESPN is blocked in tests). On main:
- (a) Allen (BUF, Sunday night) in QB, Hurts (PHI, 1pm) in SFLEX. Now: QB Hurts, SFLEX Allen.
- (b) Hurts unranked, so the fill puts Nacua (WR) in SFLEX. Main had WR Jefferson, WR Lamb, FLEX Chase (CIN, Monday
  night), SFLEX Nacua (LAR, 4:05). Now: WR Jefferson, WR Nacua, FLEX Lamb (4:25), SFLEX Chase (Monday night).
- (c) Toggle off: the rank-based fill (WR Chase, WR Jefferson, FLEX Lamb, SFLEX Nacua), on main and now.

**What changed and where.**
- `js/mls/lineup/kickoffOrder.js` (new, in `PRECACHE_ASSETS`): `optimizeFlexKickoffOrder(starters, kickoffMs)`, moved
  out of `js/mls/render/lineup.js` and made pure (no State), so Node can test it. How it works:
  - The pool is every unlocked starter in a QB/RB/WR/TE/W/R/W/T/FLEX/SFLEX slot. Locked players and their slots stay
    out, as before; empty slots stay empty; K and DEF never move.
  - Slot types are settled in order SFLEX, FLEX, W/T, W/R, then the strict slots. Each slot takes the latest-kickoff
    player it accepts (`SLOT_POSITIONS`) for whom the remaining players can still fill the remaining slots. The check
    is a small bipartite matching; a lineup has about a dozen movable starters at most.
  - This covers the runbook's suggested approach: the number of QBs in SFLEX is forced, the QB slots end up with the
    earliest QBs, and the strict RB/WR/TE slots keep the earliest per position.
  - Unknown kickoff still counts as latest. Ties keep the rank-based fill (the player the fill placed lower counts as
    later).
  - Display rule kept: several slots of one type read earliest to latest, top to bottom (ties RB, WR, TE, as FLEX did).
  - QB slots only take part when an SFLEX slot is open, so a 2-QB league without SFLEX keeps QB1/QB2 in rank order,
    as on main.
- `js/mls/render/lineup.js`: calls it with a kickoff lookup on `State.gameTimesByTeam`; the old function is gone.
  Comments in `optimizeLineup` and in `js/mls/state.js` (the setting) updated.
- `lineup/index.html`: the three wording changes above.
- `sw.js`: `CACHE_NAME` v2.8.74 → v2.8.75. CHANGELOG line under Lineup Strategist's Unreleased.

**Waiver scanner** (`js/mls/scout/waiverScanner.js`). Slot labels don't matter there, so it's unchanged. Its
`fillLineup` re-slots the current starters plus the free agent from scratch by rank, using only the multiset of slot
types, and this step never changes which slots exist or who starts. The labels only feed the wording of Auto-Find's
"(your SUPERFLEX)" / "(your FLEX)" on the displaced or bubble starter, which now names the slot the Lineup tab shows.

**Tests.**
- `tests/unit/kickoffOrder.test.mjs`:
  - 1 and 2 SFLEX slots, 3 QBs, a locked player in SFLEX, a locked QB in the QB slot, no kickoff time, no kickoff
    data at all (nothing moves), and empty slots.
  - W/T and W/R cases.
  - Random superflex lineups checked against a brute-force search: same starters, legal slots, locks fixed, and SFLEX
    holds the latest kickoff any valid seating could give it.
  - 500 random lineups without SFLEX/W/T/W/R (1-2 QBs, 0-3 FLEX, ties, unknowns, locks), compared slot for slot with
    a copy of main's function. While writing this, it caught two differences that are now fixed: main sorts strict
    slots by kickoff even when no FLEX is movable, and never moved QBs.
- The toggle-off case is in the spec (the function isn't called then).
- All existing specs pass unchanged.

**Screenshots.**
- No fixture is superflex, and the 38 lineup/other PNGs render identically to main.
- `mls-league-guide.png` (desktop and phone) changes: the Guide's FLEX Kickoff Optimization help text is a line longer
  (+23px).
- **Re-taken from CI**, since this session's container can't reproduce the committed baselines: every screenshot,
  on main too, differs in text rendering. Since 2026-10-03 the image has `56-prefer-inter.conf`,
  `12-unhinted-grayscale.conf` and extra fonts (Inter, Caladea/Carlito, LibreOffice's); removing those got close but
  not pixel-identical. Before re-taking, main and this branch were compared rendered in this container
  (`npm run pxdiff`): only the two guide PNGs differ. The new PNGs are the `mls-league-guide-actual.png` files from
  the first CI run on the PR (`playwright-results` artifact, uploaded by the owner because the session's network
  policy blocks GitHub's artifact host). Checked before committing:
  - Each artifact's `-expected.png` is pixel-identical to the committed baseline.
  - Desktop differs only in the help-text paragraph (y 1667-1704, same height).
  - Phone is 23px taller from the paragraph down. Below it, a few text rows differ slightly after the shift, but they
    read the same, with no content change.

## F2 — Sync All spinner keeps spinning

**User-visible effect.** While Sync All Leagues runs, the button's spinner now turns smoothly the whole time. Before,
it jumped back to the start of its turn every time the count moved on ("Syncing 1/5…" to "Syncing 2/5…"), because the
button's whole HTML, spinner included, was rewritten for each league. The text still counts league by league, and the
button is restored as before when the run ends. The Combine & Process Files button on the multi-file rankings upload
("Processing 2/3…") had the same restart and is fixed the same way. Nothing else on screen changed.

**Owner's decisions.** None needed (no "Asks you" on this card).

**What changed and where.**
- `js/mls/render/dashboard.js` (`syncAllLeagues`): builds the spinner SVG and a `.sync-progress-label` span once, and
  the loop sets only that span's `textContent`. The finally block still restores the button's saved HTML, disables
  and opacity as before.
- `js/mls/rankings/uploadPreview.js` (`processMultiRankings`): `updateProgress` builds the spinner and a
  `.busy-label` span on its first call, then updates only the span's text. Restore is unchanged.
- `sw.js`: `CACHE_NAME` v2.8.75 → v2.8.76. CHANGELOG line under Lineup Strategist's Unreleased.

**Was the button replaced during the loop?** No. `#syncAllBtn` is static markup in `lineup/index.html` and no render
touches it, so `processSleeperData` → `switchActiveLeague` → dashboard render leaves the same button element on
screen. The spec asserts this (same button element before and after), so nothing needed updating beyond the text.

**The same pattern elsewhere, checked:**
- `importAllSleeperLeagues` (`js/mls/leagues/importAll.js`): sets `innerText` only, with no spinner element, so there is
  nothing to restart. Unchanged.
- `optimizeAllLineups` (`dashboard.js`): sets the spinner once ("Optimizing All…") and has no count. Unchanged.
- Simulator progress (`js/mls/sim/ui.js`, `renderProgress`): already writes the spinner once and updates only
  `.sim-progress-count`. Unchanged.
- Multi-file upload (`uploadPreview.js`): restarted the spinner for every file. Fixed (above).
- Draft Strategist: the only spinner on a button is the draft sync's "Syncing…" in `js/mds/sleeperSync.js`, set once
  with no count, and the "Processing…" lines use `setProcessingStatus`, also once. Nothing to fix.
- Other single-text spinners ("Syncing…" in `js/mls/leagues/sync.js`, "Simulating…" in `js/mls/sim/matchup.js`) have
  no count and are set once.

**Helper.** Only two places needed the fix (the card asks for a shared helper at three or more), so each is fixed in
place and `js/shared/ui/` is unchanged. No new file, so `PRECACHE_ASSETS` is unchanged.

**Tests, written first and seen failing on main** (`tests/mls-busy-spinner.spec.mjs`, both widths):
- Sync All over two Fixture League syncs (the fixture server answers any league id with the Fixture League, so a second
  id makes a second league). Each league's rosters request is held in turn. It checks the `.sync-spinner` element
  at "Syncing 1/2…" is the same one on screen at "Syncing 2/2…" and that the button element is unchanged, then that
  the button ends restored (label back, no spinner, enabled). On main the spinner at 2/2 was a new element.
- Multi-file rankings upload with two position files: a MutationObserver counts the distinct spinner elements the
  button gets during the run. On main it was 3 (0/2, 1/2, 2/2); now 1.

**Screenshots.** None re-taken; no screenshot shows either button mid-run. This session's container can't reproduce the
committed baselines (the same 10 `visual.spec.mjs` tests fail on clean main here, as F1's entry describes), so I
rendered all 40 screenshots on main and on this branch in the same container and compared them with `npm run pxdiff`:
every PNG is pixel-identical, desktop and phone. CI's own screenshot step is the check against the committed baselines.

**Checks run.** `npm run check` here: check-precache and the unit tests pass, and 150 Playwright tests pass, including
the new spec at both widths. The only failures are those 10 environment-related screenshot comparisons, identical on
clean main.

**Left over.** Nothing.

## F3 — Hide the initials when a headshot is showing

**User-visible effect.** On Lineup Strategist's Roster and Lineup tabs, a player's photo now covers their initials
completely. Before, the letters showed through every see-through part of the photo (around the head and shoulders of
a cutout headshot) and filled the circle while the photo was still loading, then the photo landed on top of them. Now
the circle stays plain (the card color) until the photo appears. Initials still show when there's no photo: no Sleeper
id, a 404, the CDN blocked, offline. DEF rows still show the team code. Nothing else on screen changed.

**Owner's decisions.** None needed (no "Asks you" on this card).

**The cause, confirmed.**
- A real Sleeper thumbnail couldn't be checked: this session's network policy blocks `sleepercdn.com` (the proxy
  answers 403), so I couldn't see whether Sleeper's `.jpg` thumbnails carry transparency. Two hints that some do:
  the owner saw letters behind photos, and Draft Strategist's photo rules (`.draft-cell-img`, `.roster-avatar`)
  already set `background-color: var(--card-bg)`, which only matters for a see-through image.
- Either way the cause is the same, and the spec shows both sides on main with a stand-in image: `.mls-headshot-img`
  had no background, so a partly transparent PNG showed the initials through it, and a photo whose request was still
  open showed the initials too (an `<img>` that hasn't loaded paints nothing).

**The two options, and the pick.**
- **A, picked: give the photo the circle's background** (`background-color: var(--card-bg)` on `.mls-headshot-img`
  in `css/mls.css`). CSS only. The photo covers the initials from the moment it's laid out, loaded or not. While it
  loads, the circle is empty; if it fails, the existing `data-action="removeImage"` error handler removes it and the
  initials come back. Lazy loading starts well before a row scrolls into view, the thumbnails are small, and a blocked
  or offline request fails quickly, so in practice the empty circle is brief. Only a stalled request (very slow
  network) leaves it empty longer, as any loading image would be.
- **B, not picked: hide the initials once the photo's load event fires** (a delegated `load` handler adding a class to
  the circle). The initials would show while loading, then the photo would replace them: a flash of letters on every
  render, which is close to what the owner reported, and it needs JS plus the same background anyway for the
  see-through parts. A is simpler and gives the cleaner result.

**What changed and where.**
- `css/mls.css`: `background-color: var(--card-bg)` on `.mls-headshot-img`, and the comment above `.mls-headshot`.
- `js/mls/lineup/headshots.js`: the header comment says the photo hides the initials until it removes itself. No code
  change.
- `sw.js`: `CACHE_NAME` v2.8.76 → v2.8.77. CHANGELOG line under Lineup Strategist's Unreleased.

**Checked.**
- **Draft Strategist:** no change needed. Its photos (`.draft-cell-img` on the board, `.roster-avatar` on the Team tab)
  sit in the normal flow, above the name in a board cell and beside it in a roster slot, with no initials behind them,
  and both already have the card background. A failed photo hides itself and nothing replaces it. So letters can't
  show behind a photo there.
- **Themes:** the site has one theme (dark; `color-scheme: dark` in `css/base.css`, no light variant or
  `prefers-color-scheme` rules anywhere), so there was only one to check. The fix uses `var(--card-bg)`, the same
  variable as the circle, so a future light theme would follow it.
- **The 28px phone size:** the spec runs at both widths and asserts the circle is 28px on phone and 32px on desktop.
  I also rendered the Roster tab on phone with a cutout-shaped stand-in photo on main and on this branch: on main the
  letters show beside the cutout's neck; now the photo is clean.

**Tests, written first and seen failing on main** (`tests/mls-headshots.spec.mjs`, both widths). It serves its own
images for the CDN (helpers.mjs aborts it otherwise): a 64×64 PNG that's transparent in its top two thirds for Josh
Allen, a 404 for Justin Jefferson, and a held request for Ja'Marr Chase. "Initials visible" is measured by
screenshotting the avatar as rendered and again with the initials set to `visibility: hidden`; equal shots mean the
letters can't be seen.
- Loaded, partly transparent photo: initials not visible. Failed on main.
- Photo still loading: initials not visible. Also failed on main (checked with the first assertion removed).
- The held photo then 404s: it removes itself and its initials show.
- 404: no `<img>`, initials showing (the two shots differ).
- DEF row: shows BAL, never an `<img>`.

**Screenshots.** None re-taken. The screenshot tests block the CDN, so their avatars show initials only, as before.
This container still can't reproduce the committed baselines (the same 10 `visual.spec.mjs` failures as on clean
main, see F1), so I rendered all 40 on main and on this branch here and compared them with `npm run pxdiff`: every PNG
is pixel-identical.

**Checks run.** `npm run check`: check-precache OK, 238 unit tests pass, 152 Playwright tests pass including the new
spec at both widths. The only failures are those 10 environment-related screenshot comparisons, identical on clean
main.

**Left over.**
- Check a real Sleeper thumbnail for transparency when a session can reach `sleepercdn.com` (allow it in the
  environment's network settings). Optional: the fix covers both causes either way.

### F3, round 2: initials in Draft Strategist too (owner's request)

**Owner's request** (after the first push): "add the letters to Draft Strategist when a photo doesn't load, for
consistency".

**User-visible effect.** On the Draft Board and the Team tab, every drafted player now has a circle with their initials
(DEF: the team code), with the Sleeper photo on top. Before, a photo that failed hid itself: the board cell showed only
the name, and on the Team tab the name slid left, out of line with the empty slots. Now a missing photo leaves the
initials, and the names stay lined up. Custom players from an uploaded file (no Sleeper id) and Sleeper picks the app
can't match to a ranked player used to get no picture at all; they get initials too, as in Lineup Strategist. A photo
that loads covers the initials completely, the same as round 1. Show Player Headshots off still hides the board's
circles (initials included); the Team tab's avatars were never covered by that toggle and still aren't. Export Team
still leaves the avatars out of the image (it hides `.roster-avatar`, which the new circle keeps as its class).

**What changed and where.**
- `js/mds/headshots.js` (new, in `PRECACHE_ASSETS`): `headshotHTML({ id, name, pos, team }, sizeClass)` builds the
  circle, `<span class="<sizeClass> mds-headshot">` with `.mds-headshot-initials` and, for a Sleeper id (not
  `custom_…`), `<img class="mds-headshot-img" data-action="removeImage">`.
- `js/mds/board.js` and `js/mds/team.js` use it, with the size classes they already had (`draft-cell-img`,
  `roster-avatar`); those now style the circle instead of the `<img>`. The Team tab's empty-slot spacer is unchanged.
- `js/mds/main.js`: a `removeImage` error action, like Lineup Strategist's. `hideImage` stays for the hero logo.
- `css/mds.css`: `.mds-headshot`, `.mds-headshot-initials` (0.62rem on the Team tab's 32px circle, 0.45rem on the
  board's 22px, 0.75rem on its 38px desktop size) and `.mds-headshot-img` (with the circle's background, as in MLS).
- `js/shared/names.js`: `headshotInitials(name, pos, team)`, moved out of `js/mls/lineup/headshots.js` so both apps
  use one rule. Lineup Strategist's output is unchanged (its screenshots are pixel-identical).
- `sw.js`: `CACHE_NAME` v2.8.77 → v2.8.78. CHANGELOG line under Draft Strategist's Unreleased.

**Tests.**
- `tests/mds-headshots.spec.mjs` (both widths, written first and seen failing): serves a partly transparent photo for
  Chase and 404s for everyone else. On the board, Gibbs and Robinson show "JG" and "BR" with no `<img>`, and Chase's
  photo hides "JC"; the headshot toggle hides and restores the circles. On the Team tab, the same for Gibbs and Chase,
  and empty slots keep their spacer.
- The "initials visible" check (both specs) now compares only the middle of the circle: on the board's 38px circle
  the anti-aliased rim differed between two shots with nothing else changed. The MLS spec still fails without round 1's
  CSS fix (re-checked).
- `tests/unit/names.test.mjs`: `headshotInitials` cases (suffixes, one word, empty, DEF with and without a team).

**Screenshots: four change, as intended.** The screenshot tests block the CDN, so these avatars used to hide
themselves and now show initials. Rendered before and after in this container (`npm run pxdiff`), only these differ:
- `desktop/mds-draft-board.png`, `phone/mds-draft-board.png`: initials circles in the five picked cells (taller by
  7px and 18px, since the circle now keeps its space).
- `desktop/mds-draft-team.png`, `phone/mds-draft-team.png`: "JG" and "JC" circles beside Gibbs and Chase; their names
  move right to line up with the empty slots.

These four baselines are CI's own renders (this container renders text differently from CI, see F1), taken from the
PR's `playwright-results` artifact. The owner allowed `*.blob.core.windows.net` in the environment's network settings,
so the session downloads the artifact itself (`download_workflow_run_artifact` in the GitHub tools gives a short-lived
link on a `productionresultssaN.blob.core.windows.net` host, whose number changes between runs).
- `mds-draft-team.png` (desktop, phone): from the first CI run on PR #181. Checked before committing: each artifact
  `-expected.png` is pixel-identical to the old baseline, and the new PNG differs only around the Gibbs and Chase rows
  (desktop box x 142-290, y 589-762; phone x 74-222, y 520-693).
- `mds-draft-board.png` (desktop, phone): from the second CI run (the screenshot test stops at its first mismatch, so
  the board was compared only once the Team tab passed). Each artifact `-expected.png` is pixel-identical to the old
  baseline. The new PNGs are 7px (desktop) and 18px (phone) taller, the same growth as rendered in this container:
  the first board row keeps room for the circles. Everything above that row is identical; below it, the page is the
  same shifted down, apart from the fixed bottom nav bar, which a full-page screenshot draws at the same viewport
  position and so now covers different grid rows, and one grid-line pixel row on desktop (rounding).
