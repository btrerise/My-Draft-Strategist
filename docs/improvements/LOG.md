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

## S5 — Best available in every league (Dashboard)

**User-visible effect.** A new **Best available in your leagues** card on the Dashboard, under the League Command
Center (a card of its own, not a fifth column in the Command Center's table). It works as a to-do list across your
Sleeper leagues:
- **Header:** the title, a summary line that stays visible when the card is collapsed ("Upgrades in 2 of 5 leagues ·
  1 league without rankings"), a tooltip, and a chevron. The card collapses with a tap on the header and remembers it.
- **A Weekly | ROS switch**, beside a one-line note: "Each league by its own Weekly rankings. Ownership is from the
  last sync: Sync All Leagues refreshes it." The switch is the Scout tab's Rank By (below).
- **One line per Sleeper-synced league:**
  - the league's name, a short source label ("Weekly · 9/15/2026", "ROS · Dynasty PPR", or "Weekly (no ROS set)"
    when the league lacks the picked type), and an amber "Synced 4 days ago" (or "Last sync failed") when its
    ownership is more than 2 days old;
  - its 3 players, each with a position-rank chip in the position colors and Sleeper's injury badge if any. The
    **upgrades** come first (at most one per position), each with a green up-arrow and "over Derrick Henry RB8";
    the rest of the 3 are the best other available RB/WR/TE. Each has a small × ("not interested") that hides him from
    that league's line for the rest of the NFL week; "1 dismissed this week · Restore" brings them back;
  - a **View** button that makes that league active and opens the Scout tab's Top Available filtered like the line
    (same rankings, FLEX chip), and, on desktop only, a **Sleeper** link (external-link icon) that opens the league on
    sleeper.com in a new tab.
- **What counts as an upgrade:** a ranked free agent who beats one of your players at his position. On Weekly, the
  player is a starter in your best lineup this week, the one he'd push out (round 7). On ROS, he's your weakest
  rostered player. Either way: a better tier when the rankings have tiers, otherwise at least 3 spots better (rounds
  4 and 5).
- **Order:** leagues with an upgrade come first, the biggest one first. Leagues with no upgrade, then leagues with no
  rankings, fold under **Show N more leagues** (chevron; it reads "Hide" while open). If no league has an upgrade, a line says
  so above the fold. If no league has rankings, the lines show unfolded.
- **Manual and Draft Strategist hand-off leagues are left out**, with one line at the bottom: "1 manual league not
  included: the app only knows your own roster there, not who's on the waiver wire."

**Empty states:**
- With no leagues, the card still shows, saying where to add one.
- With only manual leagues, it says best available needs a league synced from Sleeper.

**Owner's decisions.**
- Before building:
  - **Top 3** per league.
  - **RB/WR/TE only.** Weekly sheets give QB, K and DEF only a position rank, so a mixed top 3 has no true order. The
    line uses Top Available's FLEX order (`findFreeAgents` with `posFilter: 'FLEX'`, so `compareForScan`: FLEX rank,
    which is the overall rank for a single-file ROS upload). QBs, Ks and DEFs are in View's full list.
  - **Position-rank chip, no tier** ("RB8").
  - Always open (changed in round 2).
- Round 2, after the first push: the upgrade check, upgrades first and the rest folded, a collapse that's remembered,
  and a shorter source label and note.
- Round 3, after the second push:
  - **Leave manual leagues out**, since the app can't read their waiver wire.
  - **A switch between ROS and Weekly rankings.**
- Round 4, after my second review as a user: build all six points (below). On relevance, the owner added that **tiers
  are the cutoff when the rankings have them**: a free agent ranked ahead of your player but in the same tier isn't
  an upgrade.
- Round 5, after the fourth push:
  - **No startable-range cutoff.** Any ranked player can count, so the card still recommends players in dynasty or
    18-team guillotine leagues. The tier and 3-spot rules are enough.
  - **"over Derrick Henry RB8"**, without "your" (I agreed: the line already names the league).
  - **The Sleeper link on desktop only.** On phones it opens the Sleeper app's home, not the league, which felt
    misleading. I offered remove / desktop only / keep everywhere; the owner chose desktop only.
  - **View matches the line's filter.**
- Round 6, after my third review as a user:
  - **"Your weakest" leaves out IR, Out and taxi players, everywhere** (not just on this card), plus PUP, NFI,
    suspended and did-not-report.
  - **Dismissing a player.** The owner asked whether syncing would count as the new saved setting. No: dismissals
    are stored in their own key, and sync only knows rosters. The owner also wanted bringing a player back to be easy.
    I offered a Restore link and/or a weekly reset; the owner chose **both**, and **any player on the line** can be
    dismissed (not only upgrades).

**Round 2: from a list to a to-do list.** After the first push, I reviewed the card as a user with many leagues would.
My points:
- It showed the best free agent in each league, but not whether he's better than what you have, so you couldn't tell
  which leagues need action.
- With 10+ leagues it grew past a phone screen, repeating the same names.
- The source label and note were wordy.

The owner picked my recommendation: an upgrade check, leagues sorted by it with the rest folded, a remembered
collapse, and a shorter label and note. Changes:
- **Upgrade check:**
  - At each of RB, WR and TE, the league's best free agent is compared with your weakest rostered player there.
    "Weakest" comes from Check a List's Whole Roster benchmark, `rosterBenchmark` (now exported from
    `js/mls/scout/waivers.js`), by that league's rankings. `compareForScan` decides who is ahead, as Check a List
    does.
  - It needs only your roster and rankings, not a lineup, so it works without making the league active. That's why
    it's allowed where Would Start isn't.
  - **Size:** the gap in position ranks (Henry RB8 − Cook RB5 = 3). The biggest gap across the three positions is the
    league's upgrade, and leagues sort by it, largest first; ties keep the Command Center's order. A rostered player
    your rankings don't include counts as one spot below the last ranked player at his position, and reads "RB,
    unranked".
  - No player of yours at a position means no upgrade there; an empty spot isn't an upgrade claim.
- **Folding:** a `<details>` "Show N more leagues" (or "Show N leagues" when nothing is above it). Its open state isn't
  kept: a redraw closes it.
- **Collapse:** the card reuses the rankings cards' collapsible markup and CSS (`rankings-card`, `.expanded`,
  `setRankingsCardExpanded`).
  - It's remembered in a new key, `KEYS.mls.bestAvailableCollapsed` (`mls_best_available_collapsed`, '1' while
    collapsed), so Backup/Restore and Factory Reset include it. Reads and writes are wrapped in try/catch.
  - The summary is `#bestAvailableSummary`. It uses the rankings cards' header style but wraps instead of cutting off.
- **Shorter text:** the source label drops the default set-name prefix ("Weekly Rankings – 9/15/2026" →
  "Weekly · 9/15/2026") and keeps custom names. The note is one sentence. The no-rankings line reads "Upload Weekly
  rankings on the Lineup tab (or ROS on the Roster tab) with this league active."

**Round 3: Sleeper leagues only, and a Weekly | ROS switch** (owner's requests after round 2).
- **Manual leagues left out:**
  - The card lists only leagues `isFullyMappedLeague` accepts (synced from Sleeper, so their `globalRosterMap` holds
    every team). Manual and hand-off leagues know only your roster. Their "best available" was really "best not on
    your roster", and any upgrade line there might name a player already on another team.
  - One line at the bottom counts what was left out and why. If every league is manual, the card says it needs a
    Sleeper league; the summary reads "No Sleeper-synced leagues".
  - Round 2's "manual: not on your roster" label is gone, since those lines no longer exist.
- **Weekly | ROS switch:**
  - A segmented control (`.mls-segmented`, like the Waiver Wire Assistant's mode toggle) at the top of the card's
    body.
  - **It is the Waiver Wire Assistant's Rank By** (`State.waiverScanSettings.basis`, set through
    `updateWaiverScanSetting`). It's already saved, so no new key is needed, and the Scout tab's dropdown follows it.
    That also fixes round 1's View mismatch: View now opens Top Available in the same rankings the line used. The
    flip side is that changing it on the Dashboard changes the Scout tab's Rank By too; the tooltip says they're
    shared.
  - **Default Weekly**, as before.
  - **Fallback:** a league without the picked type uses its other one, and its label says so ("Weekly (no ROS set)").
    That matches Top Available's own fallback, which View lands on with its "No ROS rankings loaded for this league -
    using Weekly rank instead." note.
  - The upgrade check uses the picked type too, so ROS answers "who's better for the rest of the season".

**Round 4: upgrades that matter, and a tighter line** (after my second review as a user; the owner asked for all six
points).
1. **Relevance.** On real rosters your weakest RB/WR/TE is usually a deep stash, often missing from a Weekly file.
   Without a cutoff, nearly every league would flag "an upgrade" and the flag would mean nothing. (Round 5 removed
   the startable range below; the tier and gap rules stayed.) The rule is now one pure function, `upgradeGap` in `js/mls/scout/waiverScanner.js`, unit-tested in `tests/unit/waiverScanner.test.mjs`
   (and added to that file's export list). It returns the gap in position spots, or null:
   - **Startable range** (`UPGRADE_RANK_CUTOFF`): the free agent must be inside it. Weekly: top 36 RB, 36 WR, 12 TE.
     ROS: top 48 RB, 60 WR, 18 TE. These suit a 10–12 team league; league size isn't used.
   - **Unranked player of yours:** any free agent inside the range is an upgrade.
   - **Both tiered** (owner's rule): only a better tier counts. A one-spot gap across a tier break counts; a 10-spot
     gap inside one tier doesn't. The tier is the file's position tier, else its list tier (a single-file upload's Tier
     column), read from the raw rankings, since the derived display ranks drop tiers.
   - **Otherwise** (a file without tiers, or one side untiered): at least `UPGRADE_MIN_GAP` = 3 position spots.

   Leagues still sort by the gap in spots.
2. **No name twice.** The separate "Upgrade: …" sentence is gone. Upgrade players are marked inside the line's list
   (up-arrow, bold name, "over your X RB8"). On phones each upgrade takes its own row, with that comparison under the
   name.
3. **Every upgrade shows.** One per position at most (the best free agent there), biggest gap first, filling the 3
   spots before the best other free agents.
4. **Old syncs:** lines whose league synced more than 2 days ago (the Command Center's rule, `getFreshness`), or whose
   last sync failed, say so in amber beside the source.
5. **Open in Sleeper:** a link per line to `https://sleeper.com/leagues/<id>` in a new tab. It's a plain link, not a
   data call. The owner confirmed it opens the league on desktop; on phones it opens the Sleeper app's home, so
   round 5 hides it there.
6. **Polish:**
   - Injury badges (Q, OUT, IR…) from the cached Sleeper player map, as Top Available shows them.
   - The fold's default triangle is replaced with the site's chevron SVG, which turns when it opens.
   - The tooltip now says what counts as an upgrade.

**Round 5: no cutoff, shorter wording, desktop-only Sleeper link, View matches the line** (owner's requests after
round 4).
- **No startable-range cutoff:**
  - `UPGRADE_RANK_CUTOFF` is gone, and `upgradeGap` no longer takes `pos` or `basis`. The free agent only has to be
    ranked.
  - The tier rule, the 3-spot gap without tiers, and "an unranked player of yours loses to any ranked free agent" stay.
  - Round 4's worry (every league flagging a deep stash) now rests on those rules alone. With a Weekly file that
    doesn't rank your bench stash, any ranked free agent at his position is still flagged. The owner chose that over
    missing real pickups in deep formats.
  - Unit tests: the cutoff cases are replaced by deep-rank cases (WR80 over an unranked player; TE40 tier 9 over TE52
    tier 11).
- **Wording:** "over Derrick Henry RB8".
- **Sleeper link, desktop only:** hidden by CSS at phone widths (max-width 600px) and on touch-only devices
  (`(hover: none) and (pointer: coarse)`), so tablets don't get it either. The tooltip now says "On a computer,
  Sleeper opens the league's page on sleeper.com" instead of promising a claim. The spec checks it's visible on
  desktop and hidden on the phone width.
- **View matches the line:** it now also sets the position chip to FLEX (RB/WR/TE in FLEX order, the line's own
  filter), along with Top Available mode and the shared Rank By. That replaces your last chip choice; the line is
  what you tapped from. The line puts upgrades first, while Top Available's FLEX list stays in pure FLEX order. So an
  upgrade at TE can sit lower in the full list than on the line; the list itself is unchanged (it's out of scope to
  change Top Available's output).

**Round 6: an active-roster benchmark everywhere, and dismissing players** (owner's requests after my third review).
- **The bug** (a bug fix, so the test came first):
  - `rosterBenchmark` (`js/mls/scout/waivers.js`) picked "your weakest" from your whole synced roster, taxi squad,
    IR and Out players included.
  - An injured star on IR, or an Out player, is missing from accurate Weekly rankings because he isn't playing. So
    he became the drop candidate, and every free agent "beat" him: on this card, in Check a List's Whole Roster
    verdicts, and in Auto-Find's Whole Roster benchmark.
  - `tests/mls-weakest-player.spec.mjs` was written first and failed on this branch before the fix. It said "Garrett
    Wilson (your weakest WR)" with Wilson Out, and compared with Derrick Henry on IR.
- **The fix, one place for all three tools:**
  - `rosterBenchmark` skips players with `isTaxi`, or whose short injury status (`inj`, from the last sync) is IR,
    OUT, PUP, NFI, SUS or DNR. Questionable and Doubtful still count.
  - It returns the skipped players, and the tools say so:
    - Auto-Find's Whole Roster benchmark adds "Not counted: A.J. Brown (taxi), Garrett Wilson (OUT)." (new
      `skippedPlayersText`).
    - When every player at a position is skipped, Check a List and Auto-Find say "You have no active RB on your
      roster to compare against", and Check a List adds "(not counted: Derrick Henry, IR)".
  - **Out applies to ROS too** (the owner asked for Out in general). A player out for a week usually keeps his ROS
    rank, so skipping him there can only make the benchmark the next-weakest player, which flags a little less, not
    more.
- **Dismissing players:**
  - **A × on each player on a line** (Feather `x` SVG, aria-label "Not interested in James Cook (hide him here this
    week)") hides him from that league's line. He's left out through `findFreeAgents`' `isExcluded`, so the next-best
    free agent takes his place and goes through the same upgrade check. The league can lose its upgrade and fold, as
    in the spec.
  - **Restore:** "1 dismissed this week · Restore" on the line brings back every player dismissed there.
  - **Weekly reset:** dismissals carry the NFL season and week (`State.currentNflWeek`, from Sleeper). A league's list
    clears itself once the week changes. A list saved before the week was known takes the next known week instead of
    clearing. `refreshCurrentNflWeek` (`js/mls/state.js`) redraws the card when the week arrives, so last week's
    dismissals clear even on the first draw.
  - **Only this card hides them.** Top Available, Auto-Find and Check a List still list everyone; Sync doesn't touch
    dismissals (a claimed player drops off the line on his own).
  - **Storage:** a new key, `KEYS.mls.bestAvailableDismissed` (`mls_best_available_dismissed`):
    `{ leagueId: { week: '2026:2', players: [cleanName] } }`. It's removed when empty, so Backup/Restore and Factory
    Reset cover it.
  - Spec: dismiss Cook, after which Fixture League loses its upgrade and folds, and Cook still shows in Second League;
    still dismissed after a reload; Restore; and a dismissal saved for week 1 is gone on load in week 2.

**Round 7: Weekly compares with your starters** (after #182 merged; on a new branch from main). The owner's real
leagues showed "Upgrades in 20 of 20 leagues", including "Dohnte Meyers WR31 over Tee Higgins (unranked)" and "Tyler
Higbee TE25 over Travis Kelce (unranked)":
- **Why it happened:** Higgins was Questionable, not Out, so round 6's skip didn't apply. The analyst's Weekly sheet
  left him out because he wasn't expected to play. In a Weekly sheet, unranked means "not expected to play" or "too
  deep for the list", not "your worst player". Combined with "an unranked player of yours loses to any ranked free
  agent" and no rank cutoff, nearly every league flagged.
- **The owner's decision** (from three options I offered: starters on Weekly; skip unranked on Weekly; check
  unranked players against ROS): **Weekly asks "who'd start for me this week?"**, so it compares with your lineup.
  ROS keeps "who's worth a spot over my weakest player?". The line stays short ("over Jaylen Waddle WR44"), with no
  slot name, since which slot he takes depends on kickoff times.
- **How:**
  - On Weekly, each position's best free agent goes through Auto-Find's own would-start check
    (`checkAgainstLineup`). It runs with the league's Weekly rankings, locks, kickoff auto-locks, byes and
    hard-outs (`lineupCheckDeps`, now shared from `waivers.js`).
  - If he'd start, he's measured with `upgradeGap` against the starter he pushes out. Same position: position ranks
    and tiers. Another position, after a FLEX reshuffle: FLEX ranks and tiers. If he'd fill an empty starting spot
    instead, the line reads "fills an empty lineup spot".
- **Your best lineup, built fresh, not the saved one.** I first planned to use each league's saved lineup
  (`State.manualStartersMap`). But that's only re-optimized when the league's Lineup tab opens or Optimize All runs,
  so after a new upload it can still start a player the new rankings leave out, which brings the Higgins problem
  back.
  - So a new pure `bestLineup(reqs, roster, deps)` in `waiverScanner.js` fills the league's slots from your whole
    roster with the optimizer's own `fillLineup`, leaving out taxi players.
  - An unranked or Out player only starts when nobody else fits, so he isn't the comparison otherwise.
  - Leagues never optimized work too, so the "no saved lineup" fallback I'd proposed isn't needed.
  - Manual lineup swaps aren't reflected; the question is "would he start in your best lineup".
- **Shared code:** `freeAgentPlayer` (the free agent's team and injury from the player map) and `lineupCheckDeps` are
  now shared helpers in `waivers.js` that Auto-Find's `buildWaiverContext` uses too. Auto-Find's output is unchanged.
- **Tests:**
  - Unit (`waiverScanner.test.mjs`): `bestLineup` (ranked over unranked, no taxi, Out only as a last resort, an empty
    slot stays empty) and a free agent checked against it.
  - Spec:
    - The fixture league is served with one RB slot (its team has one RB), so most cases aren't "fills an empty
      spot". A separate test keeps Sleeper's two RB slots for that case.
    - The Higgins case: a bench WR missing from the Weekly sheet is no comparison on Weekly, and is on ROS ("over
      Garrett Wilson (unranked)").
    - Second League's rankings now beat its actual starters: Flowers WR3 over Puka Nacua WR4, LaPorta TE1 over Trey
      McBride TE2.
- **`sw.js`:** `CACHE_NAME` v2.8.79 → v2.8.80. The CHANGELOG line and the card's tooltip describe both meanings of
  "upgrade".
- **Screenshots:** none change. All 40, rendered here on main and on this branch, are pixel-identical; the screenshot
  league has no rankings, so the card shows no players.

**What changed and where.**
- `js/mls/scout/bestAvailable.js` (new, in `PRECACHE_ASSETS`): `renderBestAvailable`, `setBestAvailableBasis`,
  `toggleBestAvailable`, `dismissBestAvailable`, `restoreBestAvailable`, `viewLeagueTopAvailable`, `bestAvailableUpload`.
- **Reuse, no second copy of the candidate logic:**
  - `findFreeAgents` (available = not in the league's `globalRosterMap`; draft picks out; unresolvable names left
    out), called once for the FLEX list and once per position for the upgrade check;
  - `rosterBenchmark` (whose weakest player an upgrade is measured against);
  - `buildRankDisplayIndex` (the RB8 numbers, derived the same way Top Available derives them);
  - `isFullyMappedLeague` (which leagues count).
- **New shared helpers** (each replaces code that was inline, so there's still one copy):
  - `getLeagueRankings(league, type)` in `js/mls/leagues/sync.js`: a league's named set, else its legacy per-league
    upload, else null. `hydrateRankingsForLeague` now uses it, so the card reads each league's rankings exactly the
    way switching to it would, without switching.
  - `makeLeagueGetPos(league, meta)` in `js/mls/scout/waivers.js`: the position lookup (league positions, then the
    Sleeper player map, then market values) that `buildWaiverContext` had inline.
- **Positions:** the Sleeper player map is read once per render (`getSleeperMetaByName`, cached), as
  `runAllLeaguesSearch` does. If it can't load, positions fall back to league and market data with a `console.warn`.
  No new network calls.
- **When it draws:** from `renderLeagueManager` (the Command Center's render), only while the Dashboard is the active
  tab. That covers:
  - the Dashboard being shown (nav.js → `refreshLeagueDropdown`);
  - Sync All (its finally re-renders the Command Center);
  - adding, importing or deleting a league;
  - the switch.

  Rankings change on the Lineup and Roster tabs, so coming back to the Dashboard picks them up. Renders are async
  (the player map); a counter makes sure only the newest one writes, since Sync All asks for one per league.
- **Empty states:**
  - No leagues: "No leagues yet. Sync a Sleeper league or import all of yours under Add/Sync League below…"
  - Only manual leagues: "Best available needs a league synced from Sleeper…"
  - A league with no rankings: source "No rankings", the upload hint, and an **Upload** button (makes the league
    active and opens the Lineup tab) instead of View.
  - Everyone ranked is rostered: "Every RB, WR and TE in its Weekly rankings (20 ranked) is already rostered in this
    league. A deeper rankings file would show who's left."
  - Rankings with no RB/WR/TE: "Its ROS rankings don't include any RB, WR or TE."
  - No upgrade anywhere: "No free agent is ranked ahead of your weakest RB, WR or TE in any league."
- **`lineup/index.html`:** the card's static frame: a collapsible header with a Feather `user-plus` SVG and a chevron,
  the summary line, the tooltip (which defines an upgrade, says the switch is shared with the Scout tab, and says
  manual leagues are left out), and `#bestAvailableBody`. It's hidden until the first render. Buttons use
  data-action; `js/mls/main.js` has the four actions.
- **`js/mls/scout/waiverScanner.js`:** `upgradeGap` and `UPGRADE_MIN_GAP` (round 4; the cutoff table went in round 5).
- **`css/mls.css`:** `.mls-ba-*`. The rank chips reuse `.mls-ta-pos` and the position badge classes, the injury badge
  `.inj-badge`, the switch `.mls-segmented`, and the sync note `.freshness-stale` / `.sync-failed`.
- **`js/shared/storage/keys.js`:** `bestAvailableCollapsed` and `bestAvailableDismissed`.
- **`js/mls/scout/waivers.js`:** `rosterBenchmark` skips inactive players and returns them; `skippedPlayersText`;
  the Whole Roster wording in Check a List and Auto-Find (round 6).
- **`js/mls/state.js`:** `refreshCurrentNflWeek` redraws the card on the Dashboard (round 6).
- **`sw.js`:** `CACHE_NAME` v2.8.78 → v2.8.79. CHANGELOG line under Lineup Strategist's Unreleased.

**Tests:** `tests/unit/waiverScanner.test.mjs` covers `upgradeGap`: tiers (better, same, a one-spot gap across a
break), the 3-spot gap without tiers, ranked behind or level, an unranked player of yours (and an unranked free agent
never), and deep ranked players with no cutoff. `tests/mls-best-available.spec.mjs` (both widths):
- **Empty states, manual leagues and Sync All:**
  - no leagues;
  - only a manual league ("No Sleeper-synced leagues", no switch);
  - a synced league with no rankings beside a manual one: only the synced line, the "1 manual league not included"
    line, nothing folded, and Upload opens the Lineup tab;
  - rankings.csv, where every ranked RB/WR/TE is rostered: "No upgrades in your 1 league", the no-upgrade line, and
    the fold reading Show, then Hide;
  - rankings-waivers.csv, which has free agents but none ahead of your weakest;
  - **same tier:** Cook ranked RB5 ahead of Henry RB8, both tier 3, is no upgrade;
  - a league synced today has no sync note, and its Sleeper link points at its league page in a new tab, visible on
    desktop and hidden on the phone width;
  - Sync All redraws the card.
- **Two synced leagues, the switch, View and collapse:**
  - **Fixture League:** ROS from rankings-waivers.csv (no upgrade), Weekly with Cook and Henry swapped, tiers
    included. Weekly marks Cook RB5 "over your Derrick Henry RB8" (gap 3), followed by Jaxon Smith-Njigba WR11 and
    Chase Brown RB9.
  - **Second League:** a synced copy of the fixture league written into storage (only one Sleeper fixture league
    exists; it's never synced in this test, so it needs no new fixture). It was last synced 4 days ago, so it shows
    "Synced 4 days ago". Its legacy Weekly rankings swap Zay Flowers with Garrett Wilson and Sam LaPorta with George
    Kittle, tiers included. That gives two upgrades, biggest first: Flowers WR10 over Wilson WR12 (gap 2), then
    LaPorta TE3 over Kittle TE4 (gap 1), then Cook RB8. It sorts second.
  - **Injury badge:** the spec overrides the player map so Flowers is Questionable, and his badge reads Q.
  - **A manual league,** left out with its line.
  - **ROS:** Fixture League folds (no upgrade; "ROS · 9/15/2026", RB8/WR11/RB9). Second League falls back ("Weekly (no
    ROS set)") and leads. The Scout tab's Rank By reads ROS.
  - **Collapse:** hides the lines, keeps the summary, and survives a reload, as does the ROS choice.
  - **View:** from Auto-Find with the QB chip picked, it lands on Second League's Top Available with the FLEX chip
    ("Top available RB/WR/TE in Second League by Weekly rank") and its fallback note.
  - **Also checked:** drawing every line doesn't change the active league; switching back to Weekly restores the
    order and the Scout tab's Rank By.
- **Test-only wrinkle:** set and manual-league ids are `'rset_' + Date.now()` and `'manual_' + Date.now()`, and the
  tests fix the clock, so a second one created in the same test would reuse the first one's id. This spec creates only
  one manual league per test, and its ROS and Weekly sets live in separate pools.

**Screenshots.** This container still can't reproduce the committed baselines (the same 10 `visual.spec.mjs`
failures as on clean main; see F1). So I rendered all 40 on main and on this branch here and compared them with
`npm run pxdiff`. Exactly four differ, all from the new card:
- `desktop/mls-empty-setup.png`, `phone/mls-empty-setup.png`: the card with its no-leagues line (+164px, +180px).
- `desktop/mls-league-setup.png`, `phone/mls-league-setup.png`: the card with its summary ("1 league without
  rankings"), the Weekly | ROS switch and note, and Fixture League's no-rankings line with its Upload button and, on desktop, Sleeper link (+246px, +291px).

The other 36 are pixel-identical.

**Re-taken from CI.** The four baselines are CI's own renders: the `-actual.png` files from the first CI run on
[btrerise/My-Draft-Strategist#182](https://github.com/btrerise/My-Draft-Strategist/pull/182) (run 37548144119, head
dc7855e, `playwright-results` artifact 11451950413). That run failed only on these four, with 166 tests passing. The
session downloaded the artifact itself, through the GitHub tools' short-lived link (see F3). Checked before committing:
- Each artifact `-expected.png` is pixel-identical to the old baseline.
- Each new PNG is identical to the old one above the card. It grows by +163px and +177px (`mls-empty-setup`, desktop
  and phone) and +242px and +274px (`mls-league-setup`), close to this container's +164/+180/+246/+291 (different
  fonts).
- Below the card, the page is the old page shifted down by that amount, except for:
  - the fixed bottom nav bar, which a full-page screenshot draws at the same position, so it now covers different
    rows;
  - a few text rows in `mls-league-setup` that differ by anti-aliasing after the shift and read the same.
- The card itself, viewed in each PNG: the no-leagues line, and the summary, Weekly | ROS switch, note and Fixture
  League's no-rankings line with Upload and, on desktop only, the Sleeper link.

The "MLS synced league tabs" screenshot test stops at its first mismatch (the Dashboard), so CI compared that test's
other tabs only after this push. This container found them pixel-identical to main.

**Left over.**
- The bug below (runbook card F4). It no longer reaches this card, since manual leagues are left out, but it still
  affects the manual league's own lineup and Top Available.
- Unmatched ranked names aren't listed on the card (Top Available lists them); the line just skips them.
- Per-position Weekly uploads without a FLEX file have no FLEX rank, so the line's order there falls back to position
  rank (RB1 and WR1 tie). Same as Top Available's FLEX view. The upgrade check compares within one position, so it
  isn't affected.
- Top Available's FLEX list (where View lands) is in pure FLEX order, so an upgrade the line shows first can sit lower
  there. Marking upgrades in Top Available itself would change its output, which this card leaves alone.

## Bug found during S5: a new manual league starts with another league's rankings (runbook card F4)

Found while writing S5's spec; not fixed there (outside that card). The owner asked for it to be logged, and it's on
the runbook as **F4** (Fix now group).
- **What happens:** `createManualLeague` (`js/mls/leagues/sync.js`) adds the league and makes it active, but never
  loads its rankings (`hydrateRankingsForLeague`). So `State.rosRankings` / `State.weeklyRankings` still hold the
  previous league's.
- **How the data gets copied:** the next `saveActiveLeagueState` (any rankings upload or save in the new league)
  copies them into the new league's legacy per-league slots (`league.rosRankings` / `league.weeklyRankings`), because
  the league has no set assigned yet.
- **What you see:**
  - the new league shows "Unassigned Upload (legacy)" holding rankings you never gave it;
  - its lineup and Top Available use them. The Dashboard's Best Available card used them too until round 3 left manual
    leagues out.
- **Reproduce:** sync the fixture league and upload rankings, create a manual league, upload only ROS there. The new
  league now has the fixture league's Weekly rankings as legacy data.
- **Likely fix:** call `switchActiveLeague(newId)` at the end of `createManualLeague`. Also check the hand-off import,
  first-time Sleeper sync and Import All for the same gap.
- **Existing data:** don't delete it. Copied rankings can't be told apart from a real legacy upload, and picking a set
  or uploading replaces them.
- **Test note:** S5's spec no longer needs a workaround (manual leagues are off the card), so F4's own spec is the
  test.

## S6 — Sleeper trending adds in Top Available

**User-visible effect.** On the Scout tab's Waiver Wire Assistant, in Top Available:
- **Badge:** a player in Sleeper's 50 most-added of the last 24 hours gets a small green Feather `trending-up` icon
  right after his rank chip. The icon only; its tooltip and aria-label give the count ("Added in 8,214 Sleeper leagues
  in the last 24 hours"). Rank order is unchanged: "by your rankings" stays exactly that.
- **Show: Your rankings | Trending:** a new switch above the position buttons. Trending lists the trending adds still
  free in the active league, most adds first, as one list. Each row shows name, team, your position rank chip with
  tier ("RB9", "TE4") or "WR UR" when the chosen rankings leave him out, the injury and bye badges, and the Starts flag.
  On the right is the add count ("8.2k", full count on hover) under an "Adds 24h" heading. The position buttons filter
  it too (Trending + WR = most-added free WRs). The summary names the Rank By set the ranks come from.
- **Manual and hand-off leagues** read "Sleeper's most-added players … not on your roster in X", with S1's manual
  note. Only your own roster is known there, so a rostered-elsewhere player can show.
- **When it shows:** the switch and the icons appear once the trending data has loaded and there's a list to show
  (a league and rankings). Offline or after a failed fetch, neither shows and the ranked list looks exactly like S1's.
  There's no toast and no `console.error`; a single `console.warn` notes the failure.

**Owner's decisions (asked before building):**
- Lookback and size: **24 hours, top 50** (recommended; also offered: 24h/100, 48h/50).
- Badge wording: **icon only**, with the count on hover (also offered: icon + "8.2k", icon + "+8.2k adds"). Phones have
  no hover, so the count there comes from the Trending view's Adds column, plus the badge's aria-label for screen
  readers.
- **A separate toggle** ("Show: Your rankings | Trending"), not a ninth chip after the positions, so the position
  buttons still work inside Trending.

**What changed and where.**
- `js/shared/api/sleeper.js`: `getSleeperTrendingAdds({ lookbackHours, limit })` fetches
  `players/nfl/trending/add` and returns `[{ player_id, count }]`. It's cached **in memory** for an hour per
  lookback/limit, with no IndexedDB and no new storage key: the response is a few KB. A non-ok status or a body that
  isn't an array throws a `SleeperResponseError`, and nothing is cached.
- `js/mls/scout/topAvailable.js`:
  - `ensureTrending()` starts the fetch in the background after the list draws, so a slow Sleeper never holds Top
    Available up. A success redraws if the list is still on screen. A failure clears the data and backs off 5 minutes
    before asking again, so redraws while offline don't re-ask each time.
  - The badge in `rowHTML`. Ids come from `ctx.meta[cleanName].id`, the same cached player map
    `buildWaiverContext` already reads.
  - `trendRowHTML` / `trendingBodyHTML` for the view. Ids map to names and positions through `getSleeperPlayerMap()`
    (`fantasyPosition`, fantasy positions only). "Free" is the same `globalRosterMap` test as the ranked list. Ranks
    come from `ctx.scanDisplay`, and "ranked" means present in the Rank By set (`scan.byName`).
  - `setTopAvailableView` and `updateTopViewToggle`. The view choice lives **in memory** (resets to Your rankings on
    reload): no new key, and nothing added to `mls_waiver_scan_settings`.
- `lineup/index.html`: the toggle (`#waiverTopViewWrap` inside a `data-waiver-modes="top"` block, data-action
  `setTopAvailableView`, inline SVG with `aria-hidden`/`currentColor`), and a sentence in the card's tooltip.
- `js/mls/main.js`: the `setTopAvailableView` action. `css/mls.css`: `.mls-ta-trend`, `.mls-ta-trend-title`,
  `.mls-trend-icon` and `#waiverTopViewWrap[hidden]`. The icon is `--primary-green` (round 2).
- `sw.js`: `CACHE_NAME` v2.8.80 → v2.8.81 (main reached v2.8.80 with S5 round 7 while this was open). No new files, so `PRECACHE_ASSETS` is unchanged. CHANGELOG line under
  Lineup Strategist's Unreleased.

**Tests.**
- `tests/fixtures/sleeper/make-fixtures.mjs` writes `trending-add.json`: Chase Brown 8214 (free), Ja'Marr Chase 7012
  (rostered), Tre Tucker 5120 (free, in no rankings file), Sam LaPorta 2010, an unknown id 1500 and Zay Flowers 640.
  Tre Tucker (`10229`, WR LV) is new in the player map only, with no stats or projections. The route is in
  `SLEEPER_FIXTURES` (`tests/helpers.mjs`).
- `tests/mls-trending.spec.mjs` (both widths):
  - The toggle stays hidden with no league or no rankings.
  - The badges: which rows, the tooltip and aria-label, the SVG's attributes, and the ranked order unchanged.
  - The Trending view: order, rostered and unknown ids left out, `RB9`/`TE4`/`WR12`/`WR UR`, the add counts, a
    position filter and the empty-position message, back to Your rankings, and the toggle hidden in Auto-Find.
  - A manual league's wording, where Ja'Marr Chase is listed because only your empty roster is known.
  - Offline (aborted) and HTTP 500: no badge, no toggle, no "Trending" text, no error toast or console error, and no
    second request on a redraw.

**Screenshots: none re-taken.** The screenshot league has no rankings, so the toggle never shows and nothing is
fetched. This container's fonts don't match the committed baselines: all 10 visual tests fail on unchanged main
too (page heights differ). So I rendered main's 40 screenshots here and ran this branch's visual tests against those
renders. All 40 matched. The committed baselines are untouched. CI (the real baseline environment) is the final word.

**Round 2 (owner's review of the first push):**
- **Green arrow.** The icon (and the Trending view's heading) was orange (`--stack-color`), chosen to stand apart from
  the green Starts flag. The owner asked for green, a more positive color and the one Sleeper uses for its trending
  arrow. Now `--primary-green`, the site's green, the same as the Starts flag; the shapes (arrow vs. check and the
  word "Starts") tell them apart. The spec checks the computed color.
- **Millions as M.** `compactCount` (now exported) abbreviates a million and up as "1.2M" / "3M", with the same rule as
  thousands: one decimal below 10, none above. A value that rounds up to the next unit moves to it (999,600 → "1M",
  not "1000k"). A spec runs it over 640 to 12.6M.
- Screenshots: still none to re-take (the screenshot league has no rankings, so no icon).

**Left over / notes.**
- Phones show the icon without a count (owner's choice). If that reads too bare, the next step is the "8.2k" text
  beside it.
- A trending player whose name collides with another Sleeper player picks up the team, injury and Starts check of the
  name-index winner (`getSleeperMetaByName`). Rare, and the same rule the rest of the Waiver Wire Assistant uses.
- Trending drops, and trending on the Dashboard's Best Available card, are out of scope (runbook: later ideas).

## F4 — A new league starts with no rankings

Found during S5 (see "Bug found during S5" above).

**User-visible effect.** A league you add starts with no rankings: its Lineup tab's Weekly set dropdown and the Roster
tab's ROS dropdown read "+ Create New Set", no "Loaded: N players" line shows, and the rankings cards open to ask for
an upload. Uploading only ROS there no longer adds a Weekly "Unassigned Upload (legacy)" holding another league's
Weekly rankings. Its first lineup is built from its own rankings (none), not from the league you were on. After a
reload, a league with no rankings of its own loads none too, as when you switch to it, unless no league has rankings
of that type of its own (owner's choice, below).

**What was wrong, per way of adding a league.** All four made the new league active without loading its rankings
(`hydrateRankingsForLeague`), so `State.rosRankings` / `State.weeklyRankings` kept the previous league's. The next
`saveActiveLeagueState` (any upload, or picking a set) copied them into the new league's legacy slots for each type it
had no set for. The spec reproduced all four on main.
- **Manual league** (`createManualLeague`, `js/mls/leagues/sync.js`): the gap as described in the card.
- **Draft Strategist hand-off** (`importDraftStrategistRoster`, `js/mls/leagues/handoff.js`): the same code shape,
  the same gap.
- **First-time Sleeper sync** (`addAndSyncLeague` → `processSleeperData`): the same gap, plus `processSleeperData`'s
  `optimizeLineup(true)` built and stamped the new league's first lineup from the previous league's rankings.
- **Import All** (`js/mls/leagues/importAll.js`): each league went through `processSleeperData` without hydrating, so
  every league in the loop (re-imported ones too) was optimized with the rankings of the league active before the
  import, and the league the loop ended on kept them in State. If that league was re-imported and had a legacy
  upload of its own, its next save could overwrite it with them.
- Sync All already hydrated each league before `processSleeperData` (dashboard.js) and was fine.

**What changed and where.**
- `js/mls/leagues/sync.js`:
  - `addLeagueAndOpen(leagueObj)`: adds a league, saves `mls_leagues`, redraws the header's league `<select>`
    (`renderHeaderLeagueSelect`, split out of `refreshLeagueDropdown`) and calls `switchActiveLeague`.
    `createManualLeague` and the hand-off both use it. Only `switchActiveLeague` draws the Dashboard's league table,
    so it still draws once (main: `refreshLeagueDropdown` once, then `loadActiveLeagueData`). The "Manual League 'X'
    Created" message is set after the switch, so nothing clears it; the hand-off's toast also follows it.
  - `processSleeperData` hydrates the synced league (`leagueObj`, which keeps a re-synced league's assignment) right
    after making it active, before `optimizeLineup`. For a re-sync of the active league that reloads the same
    rankings. It refreshes the rankings cards (`updateRankingsMetaDisplay`) only for single-league syncs
    (`!skipSave`): that function opens a card whose type has no rankings and never closes it, so calling it per league
    in Sync All would leave your league's cards open. Bulk callers refresh once after their loop (Sync All through its
    closing `switchActiveLeague`).
- `js/mls/leagues/importAll.js`: after the loop, hydrates the active league and calls `updateRankingsMetaDisplay`
  before `loadActiveLeagueData`.
- `js/mls/init.js` (start-up, owner's choice): a league with no rankings of a type of its own now loads none of that
  type when any league has rankings of that type of its own (a set that exists, or a legacy upload). The flat
  `mls_ros` / `mls_weekly` copy (the latest upload from any league) is used only when no league has any of that type,
  i.e. a setup from before per-league rankings, where it's the only copy. Per type, so the two are decided separately.
  Uses `getLeagueRankings`, the same priority as before. Nothing is deleted; the flat keys are still written on every
  upload.
- `sw.js`: `CACHE_NAME` v2.8.81 → v2.8.82. No new files. CHANGELOG line under Lineup Strategist's Unreleased.

**Owner's decision (asked during the card).** I found that a reload brought the leak back: start-up gave a league with
nothing of its own the flat "last upload, any league" copy, so a new league showed other rankings after a reload and
its first ROS upload copied the Weekly ones in again. Offered: ignore that copy at start-up when any league has
rankings of its own; always ignore it; or leave it for a follow-up card. The owner picked **ignore it when any league
has rankings of its own** (recommended). This also changes an existing league with nothing of its own: after a reload
it now shows no rankings instead of the latest upload from another league, which is what switching to it already did.

**Existing data.** Not deleted or migrated: copied rankings can't be told apart from a real legacy upload. A league
that got them shows "Unassigned Upload (legacy) — N players" in that type's dropdown. To clear it, pick a set there (a
league's set wins over its legacy data), or upload new rankings, which saves them as a set for that league. The legacy
copy stays stored on the league but is no longer used while a set is assigned.

**Tests.** `tests/mls-new-league-rankings.spec.mjs` (both widths):
- One test per way of adding a league: a first league with ROS and Weekly rankings, then a second added (manual,
  first-time Sleeper sync, Import All, Draft Strategist hand-off). Right after: both dropdowns read "+ Create New Set"
  and no "Loaded" line shows (soft checks, so the stored-data checks still run). After a ROS-only upload: the Weekly
  dropdown reads "+ Create New Set" with no legacy option, the stored league's `weeklyRankings` is empty and has no
  Weekly set, and it has its own ROS set. The manual test also checks the "Created" message and that the first
  league keeps its Weekly set. All four failed on main with "Unassigned Upload (legacy) — 24 players".
- After a reload: a new league still starts with no rankings (fails without the init.js change), and the flat copy
  still loads when no league has rankings of its own.
- Test-only: the manual league ids (`'manual_' + Date.now()`) are why each test moves `page.clock` on a second before
  adding the second league.

**Screenshots: none re-taken.** As in S6, this container's fonts don't match the committed baselines (all 10 visual
tests fail on unchanged main too, page heights differ). I rendered origin/main's 40 screenshots here and ran this
branch's visual tests against them: all 40 matched. The committed baselines are untouched; CI is the final word.

**Left over / notes.**
- Sync All's own `hydrateRankingsForLeague` before each `processSleeperData` (`js/mls/render/dashboard.js`) is now
  redundant but harmless; left as it is.
- `saveRankingsAsSet`'s comment says the flat keys serve "a brand new league with nothing assigned yet". After this
  card they serve only the pre-per-league case at start-up; the comment wasn't changed (`js/mls/rankings/sets.js` is
  S2/S3's file).

## S2 — Rename a ranking set

**User-visible effect.** A saved ranking set now has a **Rename** button (a pencil icon and the word Rename, in the
site's secondary button style) to the left of the red ✕ Delete button: the Weekly set on the Lineup tab, the ROS set
on the Roster tab. It shows only while a saved set is selected, like Delete: not for "+ Create New Set" or
"Unassigned Upload (legacy)". It opens an in-page dialog, "Rename Weekly set" / "Rename ROS set", with a "Set name"
field holding the current name (selected, so typing replaces it), and Cancel / Rename buttons. Enter saves; Escape,
Cancel or a click outside the card closes it with nothing changed. On save the dropdown and the card header show the
new name at once, with a toast `Renamed to "…"`; every league using the set keeps it. An unchanged name closes with
"No changes made.".
- **Validation:** surrounding spaces are trimmed. An empty name shows "Enter a name for this set." in red under the
  field and the dialog stays open. The field takes at most 60 characters (a set already named longer than that, from
  before, gets a red "Keep it to 60 characters or fewer"). A name another set of the same type already has
  (ignoring case) shows an amber "Another ROS set already has this name. You can still use it." and saves anyway.
- **Also:** the "New Set Name (optional)" fields now take at most 60 characters too, so new and renamed sets follow
  the same limit. Nothing else about creating a set changed.
- On phones the set dropdown is about 90px narrower while Rename shows, so a long set name is cut off a little sooner
  in the closed dropdown; the card header above it still shows the whole name.

**What changed and where.**
- `js/shared/ui/prompt.js` (new, in `PRECACHE_ASSETS`): `showPrompt(label, { title, value, placeholder, maxLength,
  confirmText, cancelText, validate })`, the text-input sibling of `showConfirm` for both apps. Same overlay and card
  (`.mds-modal-overlay` / `.mds-modal`), focus trap, Escape and backdrop handling; one dialog at a time. Resolves the
  trimmed text or null. `validate(text)` runs on every keystroke and on save: `{ error }` blocks saving,
  `{ warning }` doesn't; the message line is `aria-live`, and an error sets `aria-invalid`. Everything goes in through
  textContent / `.value`, never innerHTML. Styles: `.mds-prompt-*` in `css/base.css` after the confirm dialog's.
- `js/mls/rankings/sets.js`: `renameRankingSet(type)` changes only the selected set's `name`, saves the same key
  (`cfg.localStorageSetsKey`) and redraws the dropdown (`populateRankingSetDropdown`, which also redraws the header and
  the "Used in N of M leagues" row). The id, `data` and `updatedAt` are untouched (`updatedAt` dates the rankings and
  feeds the freshness labels and `getLeagueRankingsStamp`, so a rename doesn't make anything look re-uploaded).
  `checkRankingSetName(type, setId, text)` is the validator; `RANKING_SET_NAME_MAX = 60`. `showSavedSetButtons`
  replaces the three places that showed or hid Delete, so Rename and Delete always show together.
- `js/mls/constants.js`: `renameBtnId` in `RANKING_TYPE_CONFIG`. `js/mls/main.js`: the `renameRankingSet` click
  action. `lineup/index.html`: the two buttons (inline SVG, Feather `edit-2`, `aria-hidden="true"`) and `maxlength`
  on the two New Set Name inputs. `css/mls.css`: `.mls-rename-set-btn`.
- `sw.js`: `CACHE_NAME` v2.8.82 → v2.8.83. CHANGELOG line under Lineup Strategist's Unreleased.

**Where a set's name shows, and how each picks up a rename.** All of them look the set up in `State.rankingSets` by id
when they draw, so none keeps a stale copy:
- The set dropdown, the card header ("Set: …", via `describeLeagueRankings`) and the leagues row: redrawn by the rename.
- The league picker (its title `Leagues using "…"` and other leagues' "Currently: …" notes), the upload preview's
  "Replaces the saved set …", Auto-Fetch's "… is saved for this league" dialog: drawn when opened.
- The Dashboard's Best Available line ("Weekly · …", `sourceLabel` in `js/mls/scout/bestAvailable.js`) and the Waiver
  Wire Assistant's notes (`Weekly rankings ("…")`, `rankingSetLabel` in `js/mls/scout/waivers.js`): redrawn when their
  tab is shown or the search runs. Rename is on the Lineup and Roster tabs, so neither is on screen during a rename.
- Not set names, despite the card's list: the power-rank source note (`renderPowerSourceNote`) and Auto-Find's basis
  name (`resolveWaiverBasis().name`) say only "ROS" / "Weekly"; nothing to update there.
- Escaping: every one of these already escaped the name (`escapeHtml`) or set it as text (toasts, dialog titles). The
  spec renames to `Borischen <b>Wk 2</b> & "PPR"` and checks it shows as typed.

**Tests.** `tests/mls-rename-ranking-set.spec.mjs` (both widths, 16 runs), for Weekly and ROS each:
- Rename (spaces trimmed, saved with Enter), then the dropdown and header show it; the stored set keeps its id and
  24 players; the league picker's title names it and Bench League is added to it; after a reload the dropdown, header
  and "Used in 2 of 2 leagues" show it, both leagues still hold the set's id, Bench League's dropdown shows it, and
  the upload preview reads "Replaces the saved set <new name> (24 players). Used by 2 leagues."; for Weekly, the
  Dashboard's Best Available line reads "Weekly · <new name>".
- Cancel, Escape, and saving the unchanged name ("No changes made.") leave the stored sets exactly as they were.
- An empty (all spaces) name: the error, `aria-invalid`, focus back in the field, nothing stored; typing clears the
  error; typing 70 characters leaves 60, which save.
- Plus: a duplicate name within ROS warns and saves (the Weekly set's name is no clash; the check ignores case), and
  Rename is hidden for "+ Create New Set" and for legacy data.

**Screenshots: none re-taken.** The card expected new ones for the button, but Rename shows only with a saved set
selected, and no screenshot has rankings loaded (the visual spec's MLS states are the empty Setup tab and the synced
league with no uploads), so the button is hidden in all 40. As in S6 and F4, this container's fonts don't match the
committed baselines (all 10 visual tests fail on unchanged main), so I rendered origin/main's 40 screenshots here and
ran this branch's visual tests against them: all 40 matched. The committed baselines are untouched. Adding a new
screenshot of the card with a set loaded would need a baseline rendered with CI's fonts, which this container can't
make; I checked the button and dialog by eye at both widths instead.

**Owner's decisions.** None asked: the card has no "Asks you". Choices I made: the button shows a pencil icon *and* the
word Rename (an icon alone next to ✕ was less clear); a 60-character cap, also applied to the New Set Name fields;
duplicates compared ignoring case and surrounding spaces, within the same type only (ROS and Weekly are separate pools).

**Left over / notes.**
- F4's note on `saveRankingsAsSet`'s comment (the flat keys no longer serve "a brand new league") still stands; I
  left it for S3, which rewrites that function.
- `showPrompt` is available to Draft Strategist and T-Score but nothing there uses it yet.

## S3 — What changed: a summary after replacing a ranking set

**User-visible effect.** When a saved ranking set is overwritten (Replace Set in the upload preview, or Replace Set in the
ROS Auto-Fetch's "Replace saved set?" dialog), a **What changed** card now appears right under that set's rankings card:
the Lineup tab for Weekly, the Roster tab for ROS. It sits outside the rankings card, so it shows while that card is
collapsed (it collapses after every save). It has:
- a title naming the set ("What changed: Weekly Rankings – 9/15/2026") and a ✕ to dismiss it;
- a counts line ("4 moved · 3 added · 2 dropped", plus "· 1 changed position" when that happens) and a note: "Moves of
  3 or more spots in position rank. 22 players in both versions.";
- **Risers** and **Fallers**, the top 5 each, as "Garrett Wilson WR10 → WR2 +8 T4 → T1" (green up arrow / red down
  arrow, tier change as a small pill when the tier changed);
- **Show all N moves**, a fold listing every move grouped by position (QB, RB, WR, TE, K, DEF);
- **Added** and **Dropped**, by name in overall-rank order (top 10 each, then "and N more"): "James Cook RB3", "Joe
  Burrow was QB4";
- **Changed position**, only when a player's position differs between the two versions;
- **Your players**: every move, add or drop for players on your rosters in the leagues that use this set, each with the
  league names under it, or a line saying none of them changed;
- **Starters changed in <league>** (Weekly only): who came into and went out of the active league's starting lineup,
  with their slot, then "Lineups in Bench League update when you open them." for the other leagues on the set.
  "Same starters in Fixture League." when nothing changed.

With nothing over the threshold it says "No player moved 3 or more spots, and no one was added or dropped." Saving a new
set shows nothing (and removes an earlier summary for that type). The card is never stored: ✕ removes it, and a reload
has none. Nothing else on screen changed.

**Owner's decisions (asked before building).**
- **Contents:** all four offered parts: counts plus top 5 risers and fallers; Your players; a "Show all moves" link;
  added and dropped players by name (not just counts).
- **Starters changed:** the active league only (I reported that only the active league is re-optimized on replace; see
  below). A Weekly replace lists In and Out for the active league and names the other leagues using the set, whose
  lineups update when opened. A ROS replace has no starters part.
- **ROS Auto-Fetch:** yes, its replace shows the card too.
- **Rank basis:** position rank ("RB18 → RB9"), threshold 3 spots, as the card suggested.

**Does replacing a set re-optimize the leagues using it?** Only the active league, and only for a Weekly upload:
`confirmRankingsPreview` calls `optimizeLineup(true)` when the Lineup tab is showing (where the Weekly card is); a ROS
upload on the Roster tab calls `loadRosterTab()`, and the auto-fetch the same. Other leagues on the set aren't touched:
their saved lineup's `lineupRankingsStamps` entry no longer matches `getLeagueRankingsStamp` (it includes the set's
`updatedAt`), so `optimizeLineup` recomputes each one when it's next opened (or by Optimize All). Not changed here, per
the card; the card says so in one line instead. A follow-up could re-optimize those leagues on replace and list their
starter changes too.

**What changed and where.**
- `js/shared/rankings/compare.js` (new, in `PRECACHE_ASSETS`), pure, for Draft Strategist's S4 too:
  - `compareRankings(oldList, newList, { posOf, threshold = 3 })` matches players by `normalizeName(name)` plus
    position (rename-safe: suffixes, punctuation, case and the alias table, and it ignores the stored `cleanName`),
    then pairs what's left by name alone. A known position on both sides that differs is a position change
    (`posChanged`, not a move); a position known on one side only is the same player. The rest are added or dropped.
    The first row for a name + position in a list wins.
  - Moves are in position rank (falls back to overall rank when neither side has one); only moves of at least
    `threshold` spots count. Each move carries old/new rank, position rank and tier, `delta` (positive = rose),
    `overallDelta` and `tierChanged`. A tier change alone doesn't count as a move.
  - Order: biggest move first; ties by the better new rank, then file order (deterministic). Added and dropped are by
    overall rank, since they mix positions.
  - Also `changesByName`, `findPlayerChange` (a roster position must agree, so a WR doesn't pick up a same-named RB's
    move), `rankLabel`, `DEFAULT_MOVE_THRESHOLD`.
- `js/mls/rankings/changeSummary.js` (new, in `PRECACHE_ASSETS`): `noteRankingsReplace`, `clearRankingsChange`,
  `showRankingsChange`, `dismissRankingsChange`, and the card's markup.
  - Position ranks: a single-file upload with no Pos Rank column stores its **overall** rank as `posRank`. So both lists
    go through `buildRankDisplayIndex` (`js/mls/scout/waiverScanner.js`), the derivation the Waiver Wire Assistant
    shows, with positions from `makeLeagueGetPos` (league positions, then the cached Sleeper player map). A derived
    position rank has no tier of its own, so the file's overall tier stands in.
  - Starters: `noteRankingsReplace` snapshots the active league's saved starters (Weekly only); `showRankingsChange`
    reads them again after the caller has re-optimized and diffs by player id.
- `js/mls/rankings/sets.js` (`saveRankingsAsSet`): calls `noteRankingsReplace` with the set's old array just before
  `existing.data = parsedData` (the old array stays as it was, since the set gets a new one), and `clearRankingsChange`
  when it makes a new set. The flat-keys comment now says what F4 left them for (F4/S2's leftover note).
- `js/mls/rankings/uploadPreview.js` (`confirmRankingsPreview`) and `js/mls/rankings/rosFetch.js`
  (`autoFetchRosRankings`): call `showRankingsChange(type)` after their re-optimize / `loadRosterTab`. It's async (the
  Sleeper player map), and errors go to `console.warn`, never `console.error`.
- `js/mls/main.js`: the `dismissRankingsChange` click action (data-action, delegate()).
- `lineup/index.html`: `#weeklyRankingsChange` and `#rosRankingsChange`, empty and `hidden`, right after each rankings
  card. `css/mls.css`: `.mls-change-*` at the end. Icons are inline Feather SVGs (arrow-up, arrow-down, plus, minus,
  repeat, x, chevron).
- **No storage:** the old rankings live in memory only until the card is drawn; no new key, no undo.
- `sw.js`: `CACHE_NAME` v2.8.83 → v2.8.84. CHANGELOG line under Lineup Strategist's Unreleased.

**Tests.**
- `tests/unit/rankingsCompare.test.mjs` (13): the threshold; risers/fallers with tiers; added and dropped in overall
  order; rename-safe matching (Walker III / Walker, D.J. / DJ, Kenny / Kenneth Gainwell, case and punctuation); two
  players sharing a name at different positions; a player changing position (QB40 → TE14); positions from `posOf` and a
  position known on one side only; ties (equal moves, and tied ranks within a file, same order whichever way the file
  was written); overall-rank fallback; duplicates, empty and missing lists, nameless rows; identical lists; roster
  look-ups.
- `tests/mls-rankings-change.spec.mjs` (both widths, 10 runs): uploads rankings.csv as ROS and Weekly sets (no card),
  then replaces with a reordered copy:
  - **Weekly:** counts, risers (Wilson WR10 → WR2 +8 T4 → T1, A.J. Brown WR9 → WR4 +5), fallers (Barkley RB3 → RB8 −5,
    St. Brown WR6 → WR10 −4), Show all moves by position, added and dropped by name, Your players (Wilson, A.J.
    Brown, St. Brown, each "Fixture League"), Starters In Wilson / Out Lamb (FLEX), "Lineups in Bench League update
    when you open them."; then ✕, a reload, and no new storage key.
  - **ROS:** the same summary on the Roster tab, with no starters part.
  - **New set:** "+ Create New Set" and an upload clear an earlier card and show none.
  - **Same rankings:** the empty wording for the counts, Your players and starters.
  - **Auto-Fetch** (FantasyCalc stubbed): Cancel shows nothing; Replace Set shows the card (Wilson +8).

**Screenshots: none re-taken.** The card only appears after a replace, and the screenshot states have no rankings, so
the hidden containers change nothing. As in S2, S6 and F4, this container's fonts don't match the committed baselines
(the 10 visual tests fail on unchanged main too), so I rendered origin/main's 40 screenshots here and ran this branch's
visual tests against them: all 40 matched. The committed baselines are untouched. I checked the card by eye at both
widths, closed and with Show all moves open.

**Checks run.** `npm run check`: check-precache OK, every unit test passes, 210 Playwright tests pass including the new
spec at both widths. The only failures are those 10 environment-related screenshot comparisons, identical on main.

**Left over / notes.**
- Other leagues on a replaced set aren't re-optimized until opened (above); a possible follow-up card.
- **For S4 (Draft Strategist):** `compareRankings` is ready to reuse. MDS rows carry `pos`, so no `posOf` is needed.
  Check whether MDS's stored `posRank` is a real position rank or the overall-rank fallback for single files: the
  derivation used here (`buildRankDisplayIndex`) lives in `js/mls/`, so S4 would need its own (or a move of that
  function to `js/shared/`).

### S3, round 2: chips on player rows, a shorter card, a relevance range, free agents, the week rule

**Owner's review after the first push.** The owner asked me to think like a typical user: would the moves read better
on each player's card, and what else felt clunky? My answer: yes to chips on the rows; the card was 2-3 phone screens
tall every week, led with league-wide risers and fallers of players you mostly don't own, and buried the two parts you
act on (your players and the lineup) at the bottom; Weekly files are noisy (matchups move dozens of players, and a
3-spot move means the same at WR2 and WR70); Added/Dropped is mostly bye-week noise for Weekly. I proposed four changes
and the owner took all four, on this card:
1. **Rank-change chips on the player rows** (Lineup and Roster tabs), **kept until the set's next upload** (owner's
   choice over "until reload").
2. **A shorter card:** your players, the lineup, and free agents first; league-wide details behind one fold.
3. **A relevance range** so deep moves don't count.
4. **Free agents moving up**, with a link to Top Available.

The owner also asked whether Weekly changes could be tied to the NFL week, since week-to-week changes are noise but
updates during a week are useful. The app knows the current week (Sleeper's state endpoint, on each page load) but
never recorded which week a set was uploaded for. Offered: by date, or by saving Sleeper's week number on the set. The
owner picked **by date, with a Tuesday cutoff** (works for existing sets and offline; Sleeper's week number may not
switch until after the next week's rankings are out), and for a new week's first upload **no card plus a note in the
toast**.

**User-visible effect (replaces the card description above).**
- **The card**, under the rankings card that owns the set, top to bottom:
  - **Your players**: one wrapping line, biggest move first: "↑ Garrett Wilson +8 · ↑ A.J. Brown +5 · ↓ Amon-Ra St.
    Brown −4" (hover shows "WR10 → WR2"); adds read "new, RB3". Or "None of your players moved 3 or more spots,
    joined or left these rankings."
  - **<League> lineup** (Weekly): "+ Garrett Wilson WR − CeeDee Lamb FLEX", then "Lineups in Bench League update
    when you open them." Or "Same starters." / "There was no saved lineup to compare with."
  - **Free agents moving up**: per Sleeper-synced league using the set, up to 3 risers or newly ranked players nobody
    rosters there, best new rank first ("Chase Brown RB7 +9", "James Cook new, RB3"), and a **View** button that
    opens that league's Top Available (the Dashboard card's `viewLeagueTopAvailable`). Manual leagues are left out (their
    waiver wire can't be read); no line at all when there's nothing.
  - "Rank changes also show on your player cards until the next upload of this set." when any of yours moved.
  - **Details** (folded), with the counts on its summary line ("Details 4 moved · 3 added · 2 dropped"): the range
    note, top 5 risers and fallers, "Show all N moves" by position, added and dropped by name, changed position, and
    "Your players by league".
- **Chips**: on the Lineup tab (by the rankings the lineup uses: Weekly, else ROS) and the Roster tab (ROS), between
  the team badge and the rank badge: a green up-arrow "8", a red down-arrow "4", or "New" for a rostered player newly
  in the rankings. Tooltip: "Up 8 spots in your Weekly rankings since the last update (WR10 → WR2)"; screen readers get
  the same words. Dismissing the card leaves them; the set's next upload replaces or clears them. On a phone's Roster
  tab, a row with a chip can push its rank badge onto a second line (that line was already near full).
- **Range:** a move, add, drop or position change counts only when the player is in the top 24 QB/TE, 48 RB/WR or 16
  K/DEF at his position (or top 150 overall, without a position rank) in either version.
- **Weekly week rule:** a Weekly replace is compared only when the old upload was in the same rankings week, Tuesday
  10:00 UTC (6am Eastern in daylight time) to the next Tuesday. The first upload of a new week shows no card, clears the
  set's chips, and its toast adds "New week: changes will show when you update these rankings." ROS sets are always
  compared.

**What changed and where (round 2).**
- `js/shared/rankings/compare.js`: `RELEVANT_RANKS` and a `limits` option (out-of-range changes counted in
  `ignored`); `rankingsWeekStart` and `isSameRankingsWeek`.
- `js/mls/rankings/changeSummary.js`: the new card layout; `risingFreeAgents` (risers and adds not in the league's
  `globalRosterMap`, `isFullyMappedLeague` leagues only); after comparing, saves `set.lastChanges` (`{ moves:
  { cleanName: { d, f, t } }, added: { cleanName: label } }`) in the set's existing key and redraws the Lineup / Roster
  rows; `noteRankingsReplace` takes `previousUpdatedAt` and marks a new week's first Weekly upload (`isNewWeekReplace`).
- `js/mls/rankings/moveChips.js` (new, in `PRECACHE_ASSETS`): `rankMoveChip(type, cleanName)`. Its own small module so
  the row renderers don't import the card's dependencies (main.js's import list sets MLS's load order).
- `js/mls/rankings/sets.js`: passes `previousUpdatedAt`; deletes the set's `lastChanges` on every upload into it.
- `js/mls/rankings/uploadPreview.js`: the new-week note in both upload toasts.
- `js/mls/render/lineup.js`, `js/mls/render/roster.js`: the chip in each row's meta line.
- `css/mls.css`: the `.mls-change-*` block rewritten (inline items, free-agent lines, folds) and `.mls-move-chip`.
- **Storage:** no new key. `lastChanges` is a field inside each set in `mls_ranking_sets_weekly` / `_ros`, so Backup
  and Restore carry it; it holds only the moves (a few dozen short entries), never the old rankings. This goes past the
  card's first "don't store it" line by the owner's choice (chips until the next upload).
- `CACHE_NAME` stays v2.8.84 (one bump per branch, still above main's v2.8.83).

**Tests (round 2).**
- Unit (17 now): the range (in either version counts; TE's 24; overall fallback; adds and drops; `ignored`), and the
  week boundaries (Tuesday afternoon, Monday Night Football still in the old week, exactly 10:00, unknown times).
- `tests/mls-rankings-change.spec.mjs` (both widths, 12 runs): rewritten for the layout. Adds the chips (count, classes,
  tooltip and screen-reader text; still there after dismiss and reload; what's stored on the set), the free-agent line
  and View, the Details fold, and a week test: a replace next Tuesday shows no card, has the toast note and clears the
  chips; a replace that Saturday shows the card and chips again. ROS: a week later still compares, chips on the Roster
  tab and none on the Lineup tab (Weekly unchanged). New set: no chips.

**Screenshots: none re-taken**, same method as round 1: main's 40 rendered in this container, and this branch's visual
tests matched all 40. The card and chips only appear after a replace, which no screenshot does. Checked by eye at
both widths: the card, and the chips on Lineup and Roster rows.

**Checks run.** `npm run check`: check-precache OK, all unit tests pass, 212 Playwright tests pass; the only failures
are the 10 environment-related screenshot comparisons, identical on main.

**Left over / notes (round 2).**
- Other leagues on a replaced set still aren't re-optimized until opened (round 1's note stands).
- Chips show only for the active league's set and only on the Lineup and Roster tabs; Top Available rows and the
  Dashboard's Best Available don't show them. A possible follow-up.
- A Weekly set last uploaded before this change has no `lastChanges`, so it shows chips only after its next same-week
  replace.

### S3, round 3: Your players shows the top 5

**Owner's request** (after round 2, "close"): Your players should work like Risers and Fallers: the 5 biggest changes,
and a way to see all of them.

**User-visible effect.** The Your players line now shows the 5 biggest changes (biggest move first; equal moves by
name; adds, drops and position changes after the moves), and under it a **Show all N** fold (it reads "Hide" while
open) listing every one of them with its ranks ("WR10 → WR1 +9") and the leagues he's in. That full list replaces the
"Your players by league" section that round 2 had inside Details, so nothing is listed twice. The count stays in the
heading ("Your players 7"). Like Risers and Fallers' "Show all moves", the fold shows even when there are 5 or fewer,
since it adds the ranks and leagues.

**What changed and where.** `renderYourPlayers` in `js/mls/rankings/changeSummary.js` (top 5 plus the
`.mls-change-yours-all` fold; the Details section removed); one CSS rule in `css/mls.css`; the CHANGELOG line.

**Tests.** `tests/mls-rankings-change.spec.mjs` (14 runs): the existing tests open "Show all 3" and check its rows and
leagues; a new test reverses rankings.csv's WRs and QBs so seven of mds_test's players move, and checks the top 5
(Wilson +9, Chase −9, A.J. Brown +7, Jefferson −7, Lamb −5), "Show all 7" with all seven rows (Allen and Nacua −3
after them), and seven chips on the Lineup tab. Checked by eye at both widths, closed and open.

**Checks run.** `npm run check`: check-precache OK, 267 unit tests pass, 214 Playwright tests pass; the only failures
are the 10 environment-related screenshot comparisons, identical on main. No screenshot changes (the card only appears
after a replace).

### S3, round 4: chips on Top Available; the free-agent section removed

**Owner's question and choice.** The owner asked whether the card should be more permanent, at least on the Roster
tab, so each league shows its changes while it's active. My view: the chips already give a per-league, lasting view of
your own players; what's lost after a reload is free agents moving up. I suggested putting the chips where waiver
decisions happen (Top Available, and possibly the Dashboard's Best Available) rather than a new lasting card, which
would repeat the chips, go stale quietly and need a second copy for Weekly. The owner chose **chips on the Scout tab's
Top Available rows**, **not** on the Dashboard's Best Available lines (already busy), and **removing the "Free agents
moving up" section** from the card, since that information is now in the Scout tab.

**User-visible effect.**
- **Top Available rows** (Scout tab, Waiver Wire Assistant) show the same chip after the player's position-rank badge:
  green up-arrow and the spots moved, red down-arrow, or "New", by the rankings Top Available is using (Rank By,
  including its fallback). The Trending view's rows get it too when the player is in your rankings. It lasts until that
  set's next upload, per league, like the Lineup and Roster chips.
- **The card** no longer has "Free agents moving up". Its note now reads "Rank changes also show as chips on your
  player cards and in the Scout tab's Top Available (free agents) until the next upload of this set." and shows
  whenever anything moved or was added (not only when one of your players did).

**What changed and where.** `js/mls/scout/topAvailable.js`: `rankMoveChip(ctx.scan.basis, cleanName)` in `rowHTML`
and `trendRowHTML`. `js/mls/rankings/changeSummary.js`: `risingFreeAgents`, `renderFreeAgents` and the
`isFullyMappedLeague` import removed; the note's wording and condition. `css/mls.css`: the `.mls-change-fa*` rules
removed. CHANGELOG line updated.

**Tests.** `tests/mls-rankings-change.spec.mjs` (16 runs): the card has no free-agent section and the new note; a new
test replaces the Weekly set with rankings-waivers.csv (six "New" chips on Top Available, tooltip "New in your Weekly
rankings since the last update (RB8)"), then moves Chase Brown from RB9 to RB2 (one up chip, "Up 7 spots ... (RB9 →
RB2)"), then switches Rank By to ROS (no chips: the ROS set wasn't replaced). Checked by eye on a phone: the chip sits
beside the trending icon and wraps with the row's other badges.

**Checks run.** `npm run check`: check-precache OK, 267 unit tests pass, 216 Playwright tests pass; the only failures are the 10 environment-related screenshot comparisons, identical on main. No screenshot changes.

### S3, round 5: tap to explain, "Compared with", the week's baseline, chips that expire

**My review as a user, and the owner's choices.** After round 4 I listed what still bothered me: (1) chips explain
themselves only on hover, which phones don't have; (2) the card doesn't say what it's compared with, and a default
set name is its creation date, so a Friday replace reads like old news; (3) mid-week updates compare only with the
upload just before, so Tuesday -> Wednesday -> Friday shows only Wednesday-to-Friday moves; (4) ROS chips can sit
for weeks. The owner took 1, 2 and 4, and asked whether 3's saved rank list would use much storage with 20+ leagues.
My answer: no. It's one list per Weekly **set**, not per league; about 45 bytes a player, so about 13 KB for a
300-player file, next to the about 40 KB the set's own data already takes; replaced each week, never accumulating; a
handful of Weekly sets add well under 1% of the browser's roughly 5 MB. The owner then said to proceed with 3.

**User-visible effect.**
- **Tap a chip** (Lineup, Roster, Top Available) and a toast explains it: "Up 8 spots in your Weekly rankings since
  Tue 9/15, 4:00 PM (WR10 → WR2)". Desktop hover shows the same text. The chip is now a small button (keyboard
  focusable, with the same screen-reader text). The site's tooltip component wasn't used: player rows hide overflow,
  which would clip it.
- **The card's first line** says what it compares with: "Compared with this week's first upload, Tue 9/15, 4:00 PM."
  (Weekly) or "Compared with your previous upload, Tue 9/15, 4:00 PM." (ROS, and a Weekly set saved before this
  change, the first time).
- **Weekly sets compare with the week's first upload.** Tuesday's upload is quiet; Wednesday's and Friday's both show
  changes since Tuesday, on the card and the chips. The Lineup In/Out part still compares the lineup just before and
  after this upload.
- **Chips expire:** Weekly ones when their rankings week ends (Tuesday 10:00 UTC), ROS ones 7 days after the upload
  that made them. The set's next upload still replaces them sooner. Chip texts say "since <date>".

**What changed and where.**
- `js/mls/rankings/changeSummary.js`: `noteRankingsReplace(type, { set, newData })` picks the comparison: a Weekly
  set's `weekBaseline` (`{ at, rows: [[name, cleanName, rank, posRank, posTier, tier], ...] }`) when it's from this
  week; on a new week's first upload, the new data becomes the baseline (no card); a Weekly set without a baseline
  this week uses its previous upload, which becomes the baseline. `noteNewRankingsSet` starts a new Weekly set's
  baseline. `lastChanges` gains `at` and `since`. The card's `.mls-change-since` line.
- `js/mls/rankings/moveChips.js`: the chip is a `<button data-action="explainRankMove">` with `data-tip` and `title`;
  `explainRankMove` (toast); `formatUploadTime` ("Tue 9/15, 4:00 PM", the browser's locale and time zone);
  `chipsExpired` (Weekly: `isSameRankingsWeek`; ROS: 7 days).
- `js/mls/rankings/sets.js`: calls the two functions above. `js/mls/main.js`: the `explainRankMove` action.
- `css/mls.css`: `.mls-change-since`; the chip's button reset and focus ring.
- **Storage:** no new key. `weekBaseline` and `lastChanges` live inside each set in its existing key.

**Tests.** `tests/mls-rankings-change.spec.mjs` (22 runs; the file pins UTC and en-US, since dates now show): the
"Compared with" line for Weekly and ROS; chip texts with "since Tue 9/15, 4:00 PM", and a tap showing the toast;
the stored `weekBaseline` (24 rows, first `["Ja'Marr Chase", 'jamarrchase', 1, 1, 1, 1]`); Tuesday -> Wednesday
(Wilson +4) -> Friday (Wilson +8, compared with Tuesday); a set without a baseline (compared with its previous upload,
then the next update labeled as the week's first); chips expiring (Weekly still there Monday night and gone Tuesday
afternoon; ROS there at 6 days 23 hours, gone after 7 days); Top Available rewritten so the week's first upload
already has the free agents (Chase Brown up 7 "since Tue 9/22", and a tap).

**Left over.** None from this round.


**Checks run.** `npm run check`: check-precache OK, 267 unit tests pass, 222 Playwright tests pass; the only failures are the 10 environment-related screenshot comparisons, identical on main. No screenshot changes (the card and chips only appear after a replace).

### S3, round 6: the lineup part's label

After round 5 my review as a user found one small mismatch: Your players counts from the week's first upload, but the
lineup's In/Out compares with the lineup just before this upload. On a Friday, a player can read "+8" under Your players
and not appear under the lineup, because he moved into it on Wednesday. Correct, but puzzling. The owner agreed to
relabel it: the heading is now "<League> lineup, this update" (`renderStarters` in `js/mls/rankings/changeSummary.js`;
the spec checks the new heading). Nothing else changed.

**Owner's question: hold the PR until a real mid-week update can be tried?** My view: no. The mid-week flow is covered
by the spec with the clock moved through a week (Tuesday, Wednesday, Friday, the next Tuesday). What only real files can
show is tuning, not correctness: how many moves a 300-player mid-week update produces, and whether the 3-spot cutoff
and the ranges feel right. Those are single numbers (`DEFAULT_MOVE_THRESHOLD`, `RELEVANT_RANKS` in
`js/shared/rankings/compare.js`) that a later change can adjust. The feature only adds data inside each set's existing
key and removes nothing, so trying it on real data after merging is low-risk.


## F5 — Export Team draws the Flex slot labels as color bars

**User-visible effect.**
- **Draft Strategist, Export Team:** filled FLX, SFLX, W/T and W/R labels in the exported image were solid color
  bars with no letters. They're now readable, in the same blended colors and font as on the Team tab.
- **Lineup Strategist, Export Lineup** (found while checking, fixed the same way): the FLEX, SFLEX, W/T and W/R slot
  badges lost their blended border in the image and showed as plain dark boxes. They now look as they do on the
  Lineup tab.
- Nothing on either page changed for the export fixes; only the exported PNGs. (The follow-up below changes the
  Team tab's flex labels on the page.)

**Owner's decision.** Shown test exports of five looks, each made with html2canvas 1.4.1 (A: the gradient drawn on
a canvas; B: the gradient as SVG text; C: each letter one color, sampled where it sits on the gradient; D: one
position's color per letter; E: solid white). **The owner picked A, the canvas gradient.** B looked the same in the
tests, but html2canvas turns inline SVG into an image, which can't use the page's Outfit font, so real exports would
have shown the labels in a fallback font.

**The cause.**
- Team tab labels: `background-clip: text` (css/mds.css, from S1 round 5). html2canvas 1.4.1 doesn't support it and
  painted the label's whole box with the gradient. Its text is `color: transparent`, so nothing showed on top.
- Lineup tab badges: two background layers, a 92%-opaque fill clipped to the padding box over the gradient clipped
  to the border box (css/mls.css). html2canvas painted the fill over the border box too, so the 1px gradient border
  only showed through at 8%. Readable, but the border was gone.

**What changed and where.** Export-only, in each export's `onclone`; css/ is untouched.
- `js/mds/export.js`: `drawFlexLabelsOnCanvas` replaces each `.roster-label` with a `*-blend-text` class in the clone
  with a canvas the size of the label. The canvas draws the label's text with the label's computed font, at the
  text's own left edge and baseline (measured in the clone), filled with a canvas gradient made from the label's
  computed `background-image` colors across the label's box, as the page paints it. It's drawn at the export's
  scale (`EXPORT_SCALE`, 2, now shared with the html2canvas call). It waits for the font (`document.fonts.load`);
  html2canvas already awaits an async `onclone`. It runs after the existing width change, so labels are measured
  at the export width. The rest of `onclone` (avatars hidden, branding shown, recap toggle, 480px) is unchanged.
- `js/mls/trade/export.js`: `splitBlendedBorders` in the clone keeps the gradient on the badge (`background-clip`
  and `background-origin: border-box`; without the origin, html2canvas repeated the gradient from the padding
  box's edge and the top-left corner came out orange) and moves the fill to an inner span covering the padding
  box (negative margins, same padding, radius minus the border). The layers are read from the badge's computed
  style, so a color change in css/base.css carries over.
- `sw.js`: `CACHE_NAME` v2.8.84 → v2.8.85. CHANGELOG lines under both apps' Unreleased.
- `tests/package.json`: `html2canvas` 1.4.1 as a pinned devDependency (like PapaParse), so the spec can serve the
  same build the pages load from cdnjs. `docs/TESTING.md`'s Stubs list says so.

**Tests.** `tests/export-flex.spec.mjs` (both widths). It serves html2canvas with a wrapper that records, after the
app's `onclone`, where each label and badge sits in the clone (the image's origin):
- Draft Strategist: four picks in a draft whose only starting slots are W/R, W/T, FLX and SFLX. It runs Export Team
  and decodes the PNG. Each label's box must be 5–50% ink against the card background: on main it was 97–100%, a
  solid block. No element in the clone may still use `background-clip: text`, and the page's labels still do after
  the export.
- Lineup Strategist: the fixture league's FLEX badge in Export Lineup. The border's middle must be RB green on the
  left and TE orange on the right (the closest of a few pixels, since html2canvas snaps edges): on main both were
  200+ away (the dark fill). The page's badge keeps its two layers.
- Both fail on main and pass with the fix.

**Checked, nothing else to fix.**
- `grep background-clip css/`: only the Team tab's labels use `background-clip: text`.
- Only two places use html2canvas: Export Team (`#exportableTeamContainer`) and Export Lineup
  (`#optimalLineupContainer`, in `js/mls/trade/export.js`; there's no separate trade export). In Export Lineup's
  area the only gradient was the FLEX slot badge; SFLEX, W/T and W/R badges use the same rule and the same fix.
  Export Team's area had only the four labels.
- The other gradients in css/ are single-layer backgrounds, which html2canvas draws correctly (`.guide-banner`,
  `.highlight-card`, `.danger-card`, the board's tier divider), and none is inside either captured area. The Waiver
  Wire's FLEX button and Top Available's FLEX heading (`.flex-blend`) are never exported.

**Follow-up in the same session: the labels run through all their colors** (owner's request after the summary;
no runbook card covered it).
- **The problem.** The Team tab's gradient was painted on the `.roster-label` itself, whose box is a fixed 45px
  (it keeps the player names lined up), but "FLX" is only about 25px wide. So the letters showed only the first half of
  the blend: FLX ran green to blue and never reached TE's yellow, W/T ran blue to gray, SFLX stopped at blue.
- **The fix.** `buildSlotHTML` in `js/mds/team.js` wraps a flex label's text in `<span class="roster-label-text">`,
  an inline span as wide as the letters, and css/mds.css's rules (`.roster-label.flex-blend-text >
  .roster-label-text` etc.) put the gradient there. The outer label keeps its classes and 45px width, so nothing
  moves. The export follows: `drawFlexLabelsOnCanvas` reads the gradient from the inner span and spans it across
  the letters. The comment in css/base.css that points at these rules is updated.
- **Test.** The Export Team test now also checks that, on the page and in the export, each label's first letter is
  nearest its first position's color and its last letter nearest its last's, among the label's positions. On the
  previous code it failed ("page: FLX ends in TE's color"). The page check runs at 1x, where the edge pixels are partly
  background, hence "nearest" rather than an exact match.
- **Seen by eye.** Before/after renders of the page at 2x: same layout; FLX, W/T and SFLX now end in yellow, W/R in
  blue.
- **No screenshot changes.** No baseline has a filled flex slot on the Team tab. The 30 screenshots that pass here
  still pass; the 10 that fail in this session are pixel-identical to this branch's earlier renders.
- CHANGELOG line under Draft Strategist. `CACHE_NAME` stays v2.8.85 (one bump per branch, still above main's).

**Screenshots.** None re-taken: no screenshot runs an export or has a filled flex label.

**Checks run.** `npm run check`: check-precache OK, 267 unit tests pass, 226 Playwright tests pass (the new spec's 4
included). The 10 screenshot comparisons that fail in this cloud session (`visual.spec.mjs`, image heights differ from
the baselines) fail the same way on main; the branch's renders are pixel-identical to main's (`npm run pxdiff` on both
runs' actual PNGs, the one size difference gone when re-run alone on each).

**Left over.** None.

## S7 — SoS badge in the Waiver Wire Assistant

**User-visible effect.** With SoS loaded (the Roster tab's upload or manual grid), the Scout tab's Waiver Wire
Assistant shows the Roster tab's "SoS: 7" badge:
- **Top Available** (the ranked list): last in each row's badges, after the rank chip, rank-change chip, trending
  icon, injury and bye.
- **Auto-Find:** last in each card's badge row (after injury, bye and kickoff).
- **Check a List** (This League): at the end of each card's name line, for every listed player whose team Sleeper
  knows (free agent, yours or another team's: a schedule is the same whoever has him).
- **The player a free agent is compared with:** right after his name in Auto-Find's and Check a List's verdict line
  ("Would need to pass Josh Allen SoS: 2 (your QB)", "Doesn't pass Derrick Henry SoS: 25 (your weakest RB)") and in
  Auto-Find's Whole Roster drop candidate ("Your weakest RB is Derrick Henry SoS: 25 (Wk RB5)").

Its title says what the number means: "Strength of schedule: 3 of 32 for RBs on BUF (1 = easiest, 32 = hardest)".
The upload's help text only says "matchup ranks (1-32)"; the badge has always colored 1 green and 32 red, so 1 is
read as the easiest. With no SoS loaded, or for a player with no team or at K/DEF (the grid has no column for them),
there's no badge and the rows look exactly as before. SoS is one grid, so the badge is the same for either Rank By.
Display only: no rank, order, upgrade verdict or score uses it.

**Owner's decisions (asked before building).**
- **Views:** Top Available, Auto-Find and Check a List. **Not the Trending view** (I'd suggested all four).
- **Placement in the compact rows:** at the end of the badges, so nothing that's there today moves (rather than right
  after the rank chip). I said it would be the first thing to wrap on a phone.
- **The compared player shows his badge too**, beside his name, so the two schedules sit side by side.
- **Not on the Dashboard's Best Available lines.**

**What changed and where.**
- `js/mls/sos.js`: `getSoSBadgeHTML(team, pos, { compact, explain })`. The inline style is now the class
  `.badge.sos-badge` in `css/mls.css`, with the per-rank colors passed as `--sos-color` / `--sos-bg`. `compact`
  adds `.sos-badge-compact` (padding 1px 4px, like the injury and bye badges beside it); `explain` adds the title. The
  Roster tab calls it as before (no options), so its badge has the same look and no title. Checked: every computed
  style of all 12 Roster badges in the fixture league (colors, border, font, padding, margin, size) is identical to
  main's at both widths.
- `js/mls/scout/waivers.js`: `WAIVER_SOS_OPTS` (`{ compact: true, explain: true }`, exported), the badge in
  `renderWaiverScanCard`'s badge row, in `waiverCompareLine` after the compared player's name (Auto-Find's Replaces /
  Would need to pass, Whole Roster's Upgrade over, Check a List's verdicts) and in `renderRosterGroup`'s drop
  candidate line. Teams come from the roster entry for your players and from the cached Sleeper player map for free
  agents (`freeAgentPlayer`), as the rows already did.
- `js/mls/scout/topAvailable.js`: the badge at the end of `rowHTML`'s badges. `trendRowHTML` is unchanged.
- `js/mls/scout/engine.js`: Check a List's card (waiver path only, so the Trade Analyzer's cards are unchanged),
  team from `waiverCtx.meta`.
- `sw.js`: `CACHE_NAME` v2.8.85 → v2.8.86. No new files. CHANGELOG line under Lineup Strategist.

**Phone width (375px), what wraps.** The compact rows were already full at 375px, so the badge goes onto a second line:
- **Top Available:** every row wraps at 375px (30px → 52px tall), including the shortest ("Jayden Daniels WAS QB5").
  At 390px (the tests' phone width), rows with a Starts flag or a long name wrap and the rest stay on one line. On
  desktop, the FLEX or single-position list stays on one line; in All's three-across boxes, rows with a Starts flag
  or a long name wrap.
- **Auto-Find:** in the fixture league the card's badge row is otherwise empty (no kickoff info), so the badge adds
  a line (about 18px). With kickoff info it joins that line. In a verdict line it sits beside the name and wraps
  with the text.
- **Check a List:** joins the name line; a long name ("Jaxon Smith-Njigba") wraps onto two lines with it.
- A wrapped badge starts 4px in from the line, like a wrapped injury or bye badge (they share `margin-left: 4px`).

**Tests.** `tests/mls-waiver-sos.spec.mjs` (both widths), loading SoS through the upload (a team-by-position grid):
- With no SoS: no badge in Top Available, Auto-Find or Check a List.
- Top Available: each free agent's value for his team and position (CIN RB 28 for Chase Brown, CIN WR 10 for
  Ja'Marr Chase), the title, the compact class, last in the row, 1 green and 32 red; the same badges with Rank By ROS;
  none in the Trending view.
- Auto-Find: the card's badge, the compared starter's (Josh Allen SoS: 2, CeeDee Lamb SoS: 30) and the drop
  candidates' (Derrick Henry, Garrett Wilson).
- Check a List: a free agent's badge and his comparison's, a rostered player's, none for a kicker.
- The Roster tab's badge: same text, no compact class, no title.
- A free agent with no NFL team (Chase Brown's team removed from the player map): no badge in Top Available or
  Auto-Find.

**Screenshots.** None re-taken: the screenshot league has no SoS, so no badge shows, and the Roster tab's badge
looks the same.

**Checks run.** `npm run check`: check-precache OK, 267 unit tests pass, 230 Playwright tests pass (the new spec's 4
included). The 10 screenshot comparisons that fail in this cloud session (`visual.spec.mjs`, the font environment
noted in earlier entries) fail the same way on main: I rendered all 40 screenshots on main and on this branch here and
`npm run pxdiff` found them all pixel-identical. CI (the baseline environment) is the final word.

**Left over.**
- ~~Rows wrap on phones~~: round 2 below shows only the number on phones.
- Check a List's **All my leagues** search (where a player is rostered across leagues) has no badge; it answers a
  different question and wasn't asked about.
- The Roster tab's badge has no title. Adding the same one there is one word in `js/mls/render/roster.js`
  (`{ explain: true }`), left alone because the card kept the Roster badge out of scope.

### S7, round 2: tap to explain, and only the number on phones (owner's request)

**Owner's request.** After the first push the owner asked for a tooltip on the badge, so phones can show just the
number and a tap says what it is. Asked for in this session, outside the card's first scope.

**User-visible effect.** In the Waiver Wire Assistant (Top Available, Auto-Find, Check a List, and the compared
player's badge):
- **Tap or click the badge** and a toast says what it is: "Strength of schedule: 3 of 32 for RBs on BUF (1 = easiest,
  32 = hardest)". Desktop hover shows the same text, as before.
- **Phones and touch screens show only the number** ("3" in the green-to-red SoS colors) instead of "SoS: 3".
  Desktop still shows "SoS: 3". The breakpoint is the one the Dashboard's Sleeper link uses: `(max-width: 600px),
  (hover: none) and (pointer: coarse)`, so a touch tablet gets the number too, since a tap explains it there.
- The Roster tab's badge is unchanged (a plain badge, "SoS: 25" at every width, no title or tap).

**What changed and where.**
- `js/mls/sos.js`: with `explain`, `getSoSBadgeHTML` returns a `<button data-action="explainSoS">` with `data-tip`,
  `title` and `aria-label` (screen readers hear the whole sentence even when only the number shows), its "SoS: " in a
  `.sos-badge-label` span. `explainSoS` shows the tip as a toast. This is the rank-change chips' pattern
  (`rankings/moveChips.js`, S3 round 5); like them it uses a toast, not the site's tooltip component, which the rows
  would clip. Without `explain` (the Roster tab) the badge is the same `<span>` as before.
- `js/mls/main.js`: the `explainSoS` action.
- `css/mls.css`: the button reset (`font-family`, `font-variant-numeric`, `line-height`, `text-align` inherited, so
  it's the span's size exactly: every computed style and the size of all 15 badges in Top Available and Auto-Find
  match round 1's span on desktop), a focus ring, the phone rule hiding `.sos-badge-label` in compact badges, and
  `margin-left: 0` inside Top Available's rows, which already space their badges with a flex gap (4px saved).
- CHANGELOG line updated. `CACHE_NAME` stays v2.8.86 (one bump per branch, still above main's).

**Phone width now.** Row heights in the fixture league's Top Available (All and FLEX):
- **390px** (the tests' phone, and most current phones): one line again, except Chase Brown's row, which already
  wrapped before S7 (trending icon plus Starts).
- **375px and 360px** (iPhone SE/mini, small Androids): the James Cook row is 4px short of one line and Jaxon
  Smith-Njigba's (long name) 11px, so those still wrap; QB, TE and rows without Starts fit. Going further would mean
  tightening the spacing of every badge in the row, which I left alone.
- Desktop is unchanged from round 1.

**Checks run.** `npm run check`: check-precache OK, 267 unit tests, 230 Playwright tests pass; the same 10
environment-only screenshot failures as round 1, and all 40 renders pixel-identical to main's.

**Tests.** `tests/mls-waiver-sos.spec.mjs` adds: the badge shows "3" on the phone project and "SoS: 3" on desktop
(rendered text), its `aria-label`, a click showing the toast, the compared player's badge showing "2" / "SoS: 2", and
the Roster tab's badge still a `<span>` reading "SoS: 25" at both widths.

**Follow-up: a legend for the badges (runbook card S10).** The owner noted the app may need a legend for all its symbols
and badges, and asked for a runbook card (added the same day; Needs: S7). Not built here. The card adds one "What the badges mean" list (position-rank chip and tier,
rank-change chips, trending icon, Starts, injury and bye, SoS, TAXI, R, the FLEX blends), probably as a section of
the Guide tab plus a small info link on the Scout tab's Waiver Wire Assistant, drawn with the real badge markup so it
can't drift from what the rows show.

### S7, round 3: not on Top Available; a calendar icon on phones (owner's choices)

**The question.** The owner asked me to judge, as a user, whether the badge helps on Top Available or clutters it. My
answer: mostly clutter there. Top Available is a list to browse; schedule matters where you decide, a free agent
against your player, which Auto-Find and Check a List show side by side. Weekly rankings already price in the week's
matchup. Most values (a 14, a 19) say nothing, yet each row got a bright badge that pulled the eye from the rank chip
the list is sorted by, in colors that compete with the position colors. On phones the bare number read like another
rank ("RB8 3 … #21"). And the grid has no K or DEF, where weekly schedule matters most. I offered: badges only for
standout schedules (1–8, 25–32), remove it from Top Available, a calendar icon so it can't be read as a rank, or
leave it. **The owner chose to remove it from Top Available, and to add the calendar icon on phones where it stays.**

**User-visible effect.**
- **Top Available** rows have no SoS badge, with or without SoS loaded: exactly as before S7.
- **Auto-Find and Check a List** keep it, including the compared player's. On phones and touch screens it's now a
  small calendar icon and the number (Feather `calendar`, in the badge's own green-to-red color) instead of the bare
  number. Desktop still shows "SoS: 7", unchanged.
- The Roster tab is unchanged (full "SoS: 25" at every width, no icon).

**What changed and where.**
- `js/mls/scout/topAvailable.js`: the badge and its imports removed from `rowHTML`; the comment says why.
- `js/mls/sos.js`: the explaining badge starts with an inline SVG (`.sos-badge-icon`, `aria-hidden="true"`,
  `stroke="currentColor"`, 10px).
- `css/mls.css`: `.sos-badge-icon` hidden by default and shown in compact badges inside the phone rule that hides
  "SoS: "; round 2's `margin-left: 0` for Top Available rows removed (nothing there now).
- CHANGELOG line reworded. `CACHE_NAME` stays v2.8.86.

**Phone width.** Top Available's rows are back to their pre-S7 heights. In Auto-Find the badge sits in the card's
badge row (with kickoff info when there is any) and in the verdict line beside the compared name; the icon adds
about 12px to the badge.

**Tests.** `tests/mls-waiver-sos.spec.mjs` rewritten around Auto-Find: no badge on Top Available with SoS loaded; each
free agent's value, title, aria-label, tap toast and colors on Auto-Find cards; the icon visible on the phone project
and hidden on desktop, with `aria-hidden` and `currentColor`; the same badges under ROS; the drop candidates, Check a
List, the no-team case and the Roster tab as before.

**Checks run.** `npm run check`: check-precache OK, 267 unit tests, 230 Playwright tests pass; the same 10
environment-only screenshot failures, and all 40 renders pixel-identical to main's.

### S7, round 4: the Roster tab's badge works the same way (owner's request)

**The question.** The owner asked whether the Roster tab's badge should match on phones. My view: yes, mainly because
it had no explanation at all there (no title, no tap) and the Roster tab is where SoS shows most; a single look also
gives the S10 legend one badge to explain. It saves no space: at 375px the badge already sat on its own line under
the rank badge before S7, and the narrower version still doesn't fit beside it. The owner: **go ahead, the whole site
should be consistent.**

**User-visible effect.** Every SoS badge on the site (the Roster tab, Auto-Find, Check a List; Draft Strategist and
T-Score have none) is the same badge:
- **Tap or click** for "Strength of schedule: 25 of 32 for RBs on BAL (1 = easiest, 32 = hardest)"; desktop hover
  shows it too.
- **Phones and touch screens:** the calendar icon and the number. Desktop: "SoS: 25".
- The Roster tab keeps its usual size (not the compact cards' padding), so it still matches the team and rank badges
  beside it. On desktop it's unchanged: every computed style and the size of all 12 Roster badges in the fixture
  league match main's. On phones it's about 14px narrower.

**What changed and where.**
- `js/mls/sos.js`: `getSoSBadgeHTML` always returns the explaining button; the `explain` option is gone (every caller
  wanted it), `compact` stays. `js/mls/render/roster.js` is unchanged: its call already had no options.
- `js/mls/scout/waivers.js`: `WAIVER_SOS_OPTS` is `{ compact: true }`.
- `css/mls.css`: the phone rule swapping "SoS: " for the icon applies to every `.sos-badge`, not only compact ones;
  comments updated.
- CHANGELOG: the explaining and phone look are their own line, covering both tabs. `CACHE_NAME` stays v2.8.86.

**Tests.** `tests/mls-waiver-sos.spec.mjs`: the Roster tab's badge reads "25" with a visible icon on the phone
project and "SoS: 25" with the icon hidden on desktop, has the title, isn't compact, and a tap shows the toast.
`tests/mls-sos.spec.mjs` (the upload) still passes.

**Checks run.** `npm run check`: check-precache OK, 267 unit tests, 230 Playwright tests pass; the same 10
environment-only screenshot failures, and all 40 renders pixel-identical to main's.

### S7, round 5: which end is easy, how old it is, and a "1 = hardest" switch (owner's choices)

**The question.** Asked to review the badge again as a user, I listed: (1) nothing said which end of the scale is easy,
and sources disagree (some rank by defense strength, 1 = toughest), so a reversed file would color everything
backwards with no warning; the upload also accepted 1-5 ratings as if they were ranks; (2) SoS never showed its age,
though a weekly grid is wrong a week later; (3) no K/DEF columns. The owner chose **1 and 2, plus a flip switch**, and
said the switch must cover **SoS inside ROS rankings files** too. (3) stays a possible card.

**User-visible effect.** On the Roster tab's SoS card, once SoS is loaded:
- **A status line:** "SoS updated today · 1 = easiest, 32 = hardest". Amber with "- consider refreshing" after 7 days
  (`getFreshness`, as the rankings cards do). SoS saved before this change reads "Upload date unknown (saved before
  dates were kept)".
- **"My SoS files rank 1 = hardest"** (a checkbox, remembered). Turning it on flips the SoS saved now (it's always
  stored as 1 = easiest, so one tap fixes a file that turned out to be reversed, no re-upload) and every later SoS file,
  and SoS column in a ROS or Weekly rankings upload. Turning it off flips back. The manual grid is always 1 = easiest
  and is never flipped; its new note says so.
- **A warning** when the numbers look like 1-5 ratings (at least 8 values, none above 5): a toast on upload and a line on
  the card that stays until real ranks replace them.
- **The badge's tap text** ends with the date: "..., as of Tue, 9/15".
- **The rankings upload preview** says how a file's SoS column will be read: flipped (switch on) or "read as 1 = easiest,
  32 = hardest" with a pointer to the switch.
- The card's tooltip says which end is easy.

**Two fixes found on the way.**
- A rankings file with an SoS column merged its SoS into memory when the file was parsed, before the preview, so
  Cancel still changed the badges until a reload (the saved copy was untouched). It's now merged on Save, with the flip.
- Uploading an SoS file didn't redraw the open tab, so the Roster tab's badges kept the old values until you switched
  tabs. It now redraws like Save Manual SoS.

**Screenshots: why everything new shows only once SoS is loaded.** The SoS card is in the Roster tab's full-page
screenshot, and this container can't render baselines that match CI's fonts (see S2, S6, F4). So the status line and
the switch live in `#sosStatus`, hidden with no SoS (the screenshot league has none), the grid note is inside the
collapsed "Edit Manual SoS Grid", and the scale is added to the card's tooltip, which is hidden and absolutely
positioned. That's also when they matter. (A first render here made the Roster screenshot 12px taller: `.sos-status`'s `display: grid` beat the
`hidden` attribute, leaving its margin. `.sos-status[hidden] { display: none; }` fixed it, and the spec checks it.) **Not changed for the same reason:** the Guide tab's SoS bullets still say
only "(1-32)". Runbook card S10 re-takes the Guide screenshots anyway, so it now carries that line.

**What changed and where.**
- `js/mls/sosScale.js` (new, in `PRECACHE_ASSETS`): `SOS_SCALE_TEXT`, `reverseSosValue` (1-32 → 33 − n, decimals kept,
  anything else unchanged), `looksLikeRatings`, `sosValues`. No imports, so it's unit-tested directly.
- `js/mls/sos.js`: `importSoSUpdates` (flip, warn, merge), `saveImportedSoS` / `saveSoS` (saves the map and today's
  date, then redraws the grid and the status), `renderSoSStatus` (called from `generateSoSGrid`, so every data change
  and page load draws it), `setSosReversed`, the dated badge title. The SoS file upload collects its values and imports
  them through `importSoSUpdates`.
- `js/mls/rankings/uploadPreview.js`: the parsed SoS waits in `pendingRankingsUpload` and is imported on Save; the
  preview note's text follows the switch.
- `js/shared/storage/keys.js`: **two new keys**, `mls_sos_updated` (ms) and `mls_sos_reversed` ('1'/'0'). Both have the
  `mls_` prefix, so Backup/Restore and Factory Reset include them. `js/mls/state.js` reads them.
- `lineup/index.html`: `#sosStatus`, the grid note, the tooltip text. `js/mls/main.js`: the `setSosReversed` change
  action. `css/mls.css`: `.sos-status*`, `.sos-flip*`, `.sos-grid-note`.
- `sw.js`: `sosScale.js` added to `PRECACHE_ASSETS`. `CACHE_NAME` stays v2.8.86 (one bump per branch, above main's).
- CHANGELOG: two lines.

**Tests.**
- `tests/unit/sosScale.test.mjs`: flipping (1↔32, 4.5→28.5, twice is the identity, junk unchanged), the ratings test
  (8 values, a 6, blanks), `sosValues`.
- `tests/mls-sos-scale.spec.mjs` (both widths): the card unchanged with no SoS; after an upload, "SoS updated today",
  the scale, the switch off, the saved date and the badge's dated title; the switch flipping saved values, the grid and
  a Roster badge without touching the date; an upload with the switch on flipped on the way in; the switch surviving a
  reload and flipping back; 8 days old in amber; an unknown date; 1-5 ratings (toast and card note); Save Manual SoS
  dating it and clearing the warning; a ROS rankings upload's SoS column flipped per the preview note, nothing merged on
  Cancel, merged on Save; the other preview wording with the switch off.
- `tests/mls-waiver-sos.spec.mjs`: tap texts now end with the date.

**Checks run.** `npm run check`: check-precache OK, 271 unit tests, 236 Playwright tests pass; the same 10
environment-only screenshot failures, and all 40 renders pixel-identical to main's.

### S7, round 6: where SoS came from, and the switch asks before flipping grid edits (owner's choice)

**The question.** Reviewing round 5 as a user, I found a trap and a gap. The trap: everything saved is stored as
1 = easiest, so with the switch on, grid edits (always 1 = easiest) got flipped when you later turned it off, a typed 5
becoming 28, silently. The gap: SoS can come from an SoS file, a Weekly rankings file's Matchup column or a ROS rankings
file's SoS column, the latest quietly overwriting the rest, and nothing said which one the badges showed. The owner
chose to **fix both now**. (One switch for all sources stays as is: files from one site rank the same way.)

**User-visible effect.**
- **The status line names the source:** "SoS updated today from sos-week6.csv", "...from your ROS rankings
  (rankings.csv)", "...from your Weekly rankings (...)" or "...from the manual grid". SoS saved before this round
  shows no source.
- **The switch asks first when the grid was saved after the last upload:** "You've edited the manual grid since your
  last upload, and the grid is always 1 = easiest, 32 = hardest. Flip the SoS you have now too?" **Flip saved SoS**
  flips as before; **Keep as is** (or Escape) leaves the saved numbers alone, and the switch still applies to later
  uploads. Each says so in a toast. After an upload, the switch flips without asking, as in round 5.

**What changed and where.**
- `js/shared/storage/keys.js`: **a third new key**, `mls_sos_source` (`{ kind: 'file' | 'rankings' | 'grid', name?,
  type? }`), read into `State.sosSource` (`js/mls/state.js`).
- `js/mls/sos.js`: `saveSoS(source)` records the date and source together (a flip passes none, so both stay);
  `sosSourceText` (file names escaped); `setSosReversed` is async and uses the site's `showConfirm` when the source is
  the grid.
- `js/mls/rankings/uploadPreview.js`: the upload's file names travel with the pending preview and are saved as the
  source on Save.
- CHANGELOG line updated. `CACHE_NAME` stays v2.8.86.

**Tests.** `tests/mls-sos-scale.spec.mjs`: the source in the status line for an SoS file, the manual grid and a ROS
rankings upload; the stored source; after a grid save, the switch's dialog, Keep as is (numbers unchanged, switch on,
toast), then Flip saved SoS (numbers flipped, date and source kept).

**Checks run.** `npm run check`: check-precache OK, 271 unit tests, 236 Playwright tests pass; the same 10
environment-only screenshot failures, and all 40 renders pixel-identical to main's.


## S8 — Show the tier of the player free agents are compared against

**User-visible effect.** When your rankings have tiers, the Waiver Wire Assistant (Scout tab) now shows the tier of
the player a free agent is measured against, in the same "(T4)" form free agents' ranks already use:
- **Auto-Find, Whole Roster:** the drop candidate, "Your weakest RB is Derrick Henry (ROS RB8 (T4))", and each name
  in "Next weakest: George Kittle (ROS Overall #23 (T4)), …".
- **The numbers line under every comparison verdict**, in Auto-Find and Check a List (Upgrade over, Doesn't pass,
  Replaces, Would need to pass): both numbers get their tier, so the two sit side by side: "ROS Pos: Cook RB5 (T3),
  Henry RB8 (T4)", "Wk Flex: Smith-Njigba #22 (T6), Lamb #5 (T2)".

Each tier is the one for the number shown: position tier beside "RB8", the FLEX list's beside "Wk Flex #22", the
overall list's beside "ROS Overall #23". What this means in practice:
- **A single rankings file with a Tier column** (the common upload) has tiers for its overall list only. The app
  already sets them aside for position ranks it derives, and for FLEX ranks when the file also ranks QBs. So with one
  file, tiers show beside ROS Overall numbers (Whole Roster with FLEX, ROS Rank By) and not beside position or Wk Flex
  numbers. That's how free agents' own rank rows and Top Available's chips already behave.
- **Per-position files** (and a Weekly FLEX file) carry position and FLEX tiers, and those show everywhere.
- **Rankings without tiers:** nothing changes. The markup is the same as before, with no added wrapper.

Display only: no rank, order or upgrade verdict changed.

**Owner's decisions (asked before building).**
1. **Format:** the same "(T9)" tag free agents use (`tierTag`, js/mls/constants.js).
2. **Which tier:** "the same settings used elsewhere for tiers". I read that as the Waiver Wire's existing rule for
   free agents' tiers: the tier that belongs to the number shown, from the same display maps
   (`buildRankDisplayIndex`: `posTier`, `flexTier`, `tier`). The other option was falling back to the overall tier
   when there's no position tier, as S5's Dashboard upgrade check does (`posTier ?? tier`). That would have put an
   overall-list tier beside a position rank, while the free agent's own chip showed none.
3. **The free agent's number in the verdict line gets its tier too:** yes.
4. **Dashboard Best Available lines:** no, for now. S5 chose chips without tiers there, so only the compared player
   would have had one.
5. **Verdict rule:** unchanged. Auto-Find and Check a List still count any better rank as an upgrade; only the
   Dashboard uses S5's better-tier rule.

**A correction to the card.** The card listed "the 'over …' text in js/mls/scout/topAvailable.js". Top Available
rows don't name a compared player. "over Derrick Henry RB8" is the Dashboard's Best Available line
(`js/mls/scout/bestAvailable.js`), which decision 4 left alone. Top Available is unchanged; the spec checks that its
chip shows the same position tier as the verdict lines ("RB5 T3").

**What changed and where.**
- `js/mls/scout/waivers.js`:
  - `DISPLAY_TIER_FIELD` maps a display rank field to its tier field (`rank` → `tier`, `flexRank` → `flexTier`,
    `posRank` → `posTier`).
  - `waiverCompareLine`: each number in `.mls-verdict-nums` carries `tierTag(...)` inside its existing
    `.mls-nowrap` pair, so name, rank and tier never split on a phone.
  - `renderRosterGroup`'s `rankText` (the drop candidate and Next weakest): appends the tier and, only when there is
    one, wraps the rank and tier in `.mls-nowrap`. Without a tier the text is exactly as before.
- `sw.js`: `CACHE_NAME` v2.8.86 → v2.8.87. No new files. CHANGELOG line under Lineup Strategist.

**Tests.** `tests/mls-waiver-tiers.spec.mjs` (both widths):
- **Tiered:** `rankings-waivers.csv` alone shows the overall tier beside ROS Overall ("George Kittle (ROS Overall #23
  (T4))", Next weakest too) and none beside "ROS RB5". Then both saved sets are rewritten the way per-position
  uploads store them (position ranks, `posTier` = ceil(posRank / 2), a Weekly FLEX list with `flexTier`), with James
  Cook moved ahead of Derrick Henry. The spec checks:
  - Auto-Find Whole Roster RB: the header "(ROS RB8 (T4))" and Cook's "ROS Pos: Cook RB5 (T3), Henry RB8 (T4)".
  - FLEX: Overall ranks and tiers.
  - Starting Lineup: "Wk Flex: Smith-Njigba #22 (T6), Lamb #5 (T2)" and "Wk Pos: LaPorta TE4 (T2), Bowers TE1 (T1)".
  - Check a List: Upgrade over (Cook) and Doesn't pass (Chase Brown).
  - Top Available: Cook's chip shows the same "RB5 T3".
  - Every tier sits inside a `.mls-nowrap` that renders on one line.
- **Untiered** (the same file without its Tier column): the same views show no `.mls-tier`, the header has no added
  wrapper, and the verdict lines read as before ("Wk Pos: LaPorta TE4, Bowers TE1").
- With the waivers.js change reverted, the tiered test fails and the untiered one passes, as intended.

**Screenshots.** None re-taken. The screenshot league's rankings come from `rankings.csv`, and no screenshot shows an
Auto-Find or Check a List result.

**Checks run.** `npm run check`: check-precache OK, 271 unit tests pass, 240 Playwright tests pass (the new spec's 4
included). The 10 screenshot comparisons that fail in this cloud session (`visual.spec.mjs`, the font environment
noted in earlier entries) also fail on main: I rendered all 40 screenshots on main and on this branch here, and
`npm run pxdiff` found them all pixel-identical. CI (the baseline environment) is the final word.

**Left over.**
- The Dashboard's "over Derrick Henry RB8" has no tier (decision 4). If it's added later, the free agents' chips
  there should get tiers too, so the line reads alike.
- With the single-file uploads most people use, position comparisons show no tier, because the file's Tier column
  belongs to its overall list. Showing that tier beside a position rank was the alternative to decision 2.
- S10 (the badge legend) should describe "(T4)" beside the compared player as the same tier tag.

### S8, round 2: the verdict says the tier gap, a cleaner header, Next weakest kept whole (owner's choices)

**Why.** Asked to review the first push as a user, I took screenshots of each view at both widths and raised four
points. The owner chose 1, 3 and 4:
1. The verdict made you compare two small gray tags by eye; the card's point was to tell a tier jump at a glance.
2. (Not chosen) On phones the two numbers under a verdict now wrap onto two lines.
3. "(ROS RB8 (T4))" read clumsily with parentheses inside parentheses.
4. On phones "Next weakest" left a name at the end of one line and his rank on the next.

**User-visible effect.**
- **The tier gap in words**, after every comparison verdict in Auto-Find and Check a List, when both players are
  tiered: "Upgrade over Derrick Henry · 1 tier up" (green), "· same tier", "· 2 tiers down" (both muted). The gap
  comes from the same two tiers as the numbers under it. Hover shows "Tier 3 against tier 4". Display only: the
  verdict and what counts as an upgrade are unchanged.
- **The drop-candidate header and Next weakest** read "(ROS RB8 · T4)", using the "·" separator the rank rows already
  use ("ROS: #15 (T3) · RB5"). The verdict's numbers line keeps "(T4)", matching the free agents' rank rows above it.
- **Next weakest:** each "name (rank)" wraps as a whole. This applies with or without tiers. Without tiers it changes
  only where the line breaks on a narrow screen ("A.J. Brown (Wk WR9), Amon-Ra / St. Brown (Wk WR6)" now moves
  "Amon-Ra St. Brown (Wk WR6)" to the next line).

**What changed and where.**
- `js/mls/scout/waivers.js`:
  - `tierGapHTML(faTier, otherTier)`: the gap span, or "" unless both players are tiered.
  - `waiverCompareLine` appends the gap after the slot text.
  - `rankText` writes "· T4" (a `.mls-tier` with its "Tier 4" title) inside the same `.mls-nowrap`.
  - Next weakest items are `.mls-scan-next-item` spans, each carrying its own comma.
- `css/mls.css`: `.mls-scan-next-item` (inline-block, so each piece wraps whole and only breaks inside when it's
  wider than a line), and `.mls-tier-gap` (nowrap, muted, green with `.is-up`).
- CHANGELOG line updated, plus a line for Next weakest. `CACHE_NAME` stays v2.8.87 (this branch's bump).

**Tests.** `tests/mls-waiver-tiers.spec.mjs`:
- The new header wording, and "· 1 tier up" with the up class and its title.
- "· 4 tiers down" (Smith-Njigba against Lamb by Wk Flex) and "· 1 tier down" (Chase Brown).
- A "same tier" upgrade, with position tiers four players wide so Cook RB5 and Henry RB8 are both T2.
- Every Next weakest piece on one line, with and without tiers.
- No gap without tiers.

**Left over.** Point 2: on a phone the verdict's two numbers still wrap onto two lines when tiered. The gap in words
now carries the answer, so I left it.

**Checks run.** `npm run check`: check-precache OK, 271 unit tests, 240 Playwright tests pass; the same 10
environment-only screenshot failures as round 1, and all 40 renders are still pixel-identical to main's.

### S8, round 3: "Ranked ahead of" in the same tier, and the overall tier beside every rank (owner's choices)

**Why.** In a second review as a user I raised two things:
- **Auto-Find and the Dashboard could now visibly disagree.** A free agent ranked ahead of your player but in the
  same tier read "Upgrade over Derrick Henry · same tier", while the Dashboard (S5's rule) said that league had no
  upgrade.
- **The common upload rarely showed tiers.** With a single rankings file (one Tier column, its overall list's), the
  feature showed up only in ROS with FLEX.

The owner chose to **reword the same-tier case** and to **show the overall tier beside position ranks everywhere**.

**User-visible effect.**
- **"Ranked ahead of Derrick Henry · same tier"** replaces "Upgrade over" when both players are in the same tier, in
  Auto-Find's Whole Roster cards and Check a List's Whole Roster verdict. "Upgrade over" is kept for a tier jump.
  Only the wording changes: the same players are listed, in the same order, Check a List still sorts them first, and
  Auto-Find's section count still says "N upgrades" (left over, below).
- **A rank with no tier of its own shows the file's overall tier,** everywhere in Lineup Strategist:
  - **Waiver Wire Assistant and Top Available:** position and FLEX ranks derived from a single file, and ranks from a
    Pos Rank column. A single tiered file now shows tiers on every number: "Your weakest RB/WR/TE is George Kittle
    (Wk Flex #19 · T4)", "Wk Flex: Smith-Njigba #22 (T4), Lamb #5 (T1)", Top Available "RB8 T4", and the tier gap
    in words with them.
  - **Lineup and Roster tabs,** and the Scout and All-Leagues cards' "Pos:" tag (`posRankTag`): a Pos Rank column's
    position ranks now show the overall tier ("Ovr: #15 (T3) | Pos: #5 (T3)"). A single file without a Pos Rank
    column already showed it there.
  - **Trade Finder:** the positional basis's tier falls back the same way.
  - Files with their own position or FLEX tiers (per-position uploads, horizontal Weekly sheets, a FLEX file) keep
    them; the overall tier only fills a gap.
  - Draft Strategist is unchanged (it has its own tiers), and so is the Dashboard's Best Available (no tiers on its
    chips, S5). Its upgrade check already used this fallback (`posTier ?? tier`), as does S3's What changed
    (compare.js), so all three now read tiers the same way.

**Why a single file's overall tier works beside a position rank.** The file's overall tier rises with its order, and
derived position and FLEX ranks follow that same order, so within RBs (or within FLEX) a better rank never has a
worse tier. It describes the whole list, so "T4" means the same thing for an RB and a WR.

**What changed and where.**
- `js/mls/scout/waiverScanner.js` `buildRankDisplayIndex`: `posTier` and `flexTier` fall back to `tier`, at the start
  and after deriving. Before, a derived rank cleared its tier. The header comment says so.
- `js/mls/scout/waivers.js` `waiverCompareLine`: "Upgrade over" becomes "Ranked ahead of" when both tiers are equal.
- `js/mls/render/lineup.js`, `js/mls/render/roster.js`: `posTier` (and Lineup's `flexTier`) fall back to `tier`.
- `js/mls/constants.js` `posRankTag`: the tier falls back too, and the "Pos:" part still hides when it would repeat the
  overall rank and tier.
- `js/mls/scout/marketDisconnect.js`: the positional `userTier` falls back.
- The parser (`js/shared/rankings/parse.js`, shared with Draft Strategist) and stored data are unchanged; the fallback
  is applied where Lineup Strategist displays ranks. CHANGELOG lines updated. `CACHE_NAME` stays v2.8.87.

**Tests.**
- `tests/unit/waiverScanner.test.mjs`: the derived-rank cases now expect the overall tier; a FLEX case with and without
  an overall tier; a Pos Rank column case.
- `tests/mls-waiver-tiers.spec.mjs`:
  - A single file shows tiers on Wk Flex, position and Overall numbers, the "3 tiers down" and "1 tier down" verdicts,
    and Top Available's "RB8 T4".
  - The same-tier case reads "Ranked ahead of" and never "Upgrade over".
  - A new test: a Pos Rank column shows "Pos: #5 (T3)" on the Roster and Lineup tabs, and the tier on Top Available.

- `tests/mls-top-available.spec.mjs`: S1's check that James Cook's chip reads "RB8" now expects "RB8 T4", the intended
  change.

**Checks run.** `npm run check`: check-precache OK, 272 unit tests pass; Playwright as in round 2 apart from the
Top Available line above, which I updated and re-ran (passes at both widths). The same 10 environment-only screenshot
failures, and all 40 renders are still pixel-identical to main's (the screenshot league has no rankings).

**Left over.**
- Auto-Find's section header (All mode) still counts same-tier entries as "N upgrades", and Check a List still sorts
  them with the upgrades. Changing either is the verdict decision the owner kept separate.
- The Guide doesn't explain tiers or "· 1 tier up". That's for S10's legend.

### S8, round 4: one meaning of "upgrade" across the Waiver Wire (owner's request)

**Owner's request.** "Make the 'upgrade' language consistent everywhere with what we decided this session." Round 3
reworded the same-tier verdict, but two places still counted a same-tier free agent as an upgrade: Auto-Find's
section count and Check a List's upgrades-first sort.

**The rule now, everywhere in Lineup Strategist:** a free agent ranked ahead of your player is an **upgrade** only
when he's in a better tier, when both are tiered; with either untiered, any better rank. Everyone ranked ahead is
still listed, in rank order. The same tier reads "Ranked ahead of".

**User-visible effect.**
- **Auto-Find, Whole Roster:** each card's verb is decided by the rule, and the All view's section count counts only
  upgrades: "RB · 1 upgrade", "RB · 1 upgrade · 2 same tier", "RB · no upgrades · 1 same tier". The count is green
  only when there's an upgrade.
- **Check a List, Whole Roster:** the verdict follows the rule, and only real upgrades sort ahead of other free agents.
  A same-tier player now sorts by rank with the rest.
- **The Scout tab's help tooltip** adds: "When your rankings have tiers, only a player in a better tier is an upgrade
  ("Upgrade over"); one ranked ahead in the same tier reads "Ranked ahead of", as on the Dashboard."
- The Dashboard's Best Available is unchanged: it already used this rule (`upgradeGap`).

**What changed and where.**
- `js/mls/scout/waivers.js`:
  - `comparedTiers` works out which number a comparison shows and its two tiers, shared by `waiverCompareLine` and
    `isTierUpgrade`, the rule above.
  - `pastedRosterVerdict`'s `upgrade` and verb, and `renderRosterGroup`'s verbs and `countText`, use it.
  - `waiverCompareLine` no longer rewrites the verb; callers pass the right one.
  - Within one rankings list, tiers never get worse as ranks get better, so "ranked ahead, not an upgrade" is always
    the same tier, and the count can say "same tier".
- `lineup/index.html`: the Waiver Wire Assistant's tooltip sentence on Whole Roster. The tooltip is hidden until
  opened, so screenshots don't change.
- CHANGELOG line added. `CACHE_NAME` stays v2.8.87.

**Tests.** `tests/mls-waiver-tiers.spec.mjs`:
- "RB · 1 upgrade" for a tier jump, and "RB · no upgrades · 1 same tier" plus the "Ranked ahead of" card for a
  same-tier one.
- Check a List's order: Jayden Daniels (not ahead of Josh Allen, but ROS overall #10) lists before a same-tier Cook
  (#15). With the old rule, Cook sorted first.
- With "any better rank counts" put back in `pastedRosterVerdict`, the spec fails.

**Left over.**
- ~~**Without tiers, the Dashboard still needs 3+ spots**~~ (done in round 5) (`UPGRADE_MIN_GAP`), while Auto-Find and Check a List count any
  better rank. A 1–2 spot gap reads "Upgrade over" in Auto-Find and isn't flagged on the Dashboard. This session only
  decided the tier rule; making them match is one line in `isTierUpgrade` if the owner wants it.
- **The Guide tab's line on Whole Roster** ("checks whether he's better than your weakest player") doesn't mention
  tiers. It's in the Guide screenshot, which this cloud environment can't re-take to match CI; S10 re-takes the Guide
  screenshots and can add it.

**Checks run.** `npm run check`: check-precache OK, 272 unit tests, 242 Playwright tests pass; the same 10
environment-only screenshot failures, and all 40 renders are pixel-identical to main's.

### S8, round 5: without tiers, an upgrade is 3+ spots better, as on the Dashboard (owner's choice)

**Owner's choice.** Round 4 left one difference: without tiers the Dashboard needs a free agent at least 3 spots
better (`UPGRADE_MIN_GAP`), while Auto-Find and Check a List counted any better rank. The owner said to match them.

**User-visible effect (rankings without tiers).**
- **A free agent 1–2 spots ahead of your player** reads "Ranked ahead of Derrick Henry" in Auto-Find and Check a
  List. He's still listed, but not counted as an upgrade or sorted first.
- **3 or more spots ahead** reads "Upgrade over" as before.
- **The All view's count names both groups:** "RB · no upgrades · 1 within 2 spots", or "RB · 1 upgrade · 2 same tier"
  with tiers.
- **Your unranked player** still loses to any ranked free agent, as on the Dashboard.
- **The tooltip** now says: "An upgrade ("Upgrade over") must be in a better tier when your rankings have tiers, or at
  least 3 spots better when they don't, as on the Dashboard; anyone else ranked ahead reads "Ranked ahead of"."

**What changed and where.**
- `js/mls/scout/waivers.js` `isTierUpgrade` now calls the Dashboard's own rule, `upgradeGap` (waiverScanner.js), on the
  numbers the line shows (position, Flex or Overall), so the two can't drift apart.
  - The 3 spots are counted in the number shown: position spots for a single position, Flex or Overall spots in
    Auto-Find's FLEX view. The Dashboard compares per position.
  - `renderRosterGroup`'s count splits the non-upgrades into "same tier" and "within 2 spots".
- `lineup/index.html`: the tooltip sentence. CHANGELOG line updated. `CACHE_NAME` stays v2.8.87.

**Tests.** `tests/mls-waiver-tiers.spec.mjs`, new test on an untiered file:
- Cook moved to RB5, one spot ahead of Henry (RB6): "Ranked ahead of" in Auto-Find and Check a List, and "RB · no
  upgrades · 1 within 2 spots".
- Cook moved to RB2: "Upgrade over" and "RB · 1 upgrade".
- With round 4's "any better rank without tiers" put back, the test fails.

**Checks run.** `npm run check`: check-precache OK, 272 unit tests, 244 Playwright tests pass; the same 10
environment-only screenshot failures, and all 40 renders are pixel-identical to main's.

## Bug found during S8: the Lineup and Roster tabs show the overall rank as the position rank (runbook card F6)

Found in the round-5 review as a user. With a single rankings file that has no Pos Rank column (one overall list
with a Pos column), the parser stores each player's overall rank as his position and FLEX rank (its "Fallback"
branch). The Waiver Wire Assistant corrects that with `buildRankDisplayIndex`, so Derrick Henry (overall #15) reads
"RB5" there. The Roster tab (`loadRosterTab`) and the Lineup tab's rows print the raw numbers: "Ovr: #15 (T3) | Pos:
#15 (T3)" and "Pos: #15 (T3) | Flex: #15 (T3)". It was already like this on main; S8 didn't change it. Trade Finder's
Positional Rank basis (`marketDisconnect.js`) also reads the raw `posRank` and needs checking. Not fixed here (outside
S8). The owner added it to the runbook as card F6 (Needs: S8), which keeps the fix display-only so the optimizer's
inputs, and who starts, stay the same.

## F6 — Lineup and Roster tabs show the overall rank as the position rank

**User-visible effect.** With a single rankings file that has no Pos Rank column (one overall list with a Pos
column, the most common upload), the Lineup and Roster tabs now show the same position and FLEX ranks as the
Waiver Wire Assistant, instead of each player's overall rank:
- **Roster tab:** Derrick Henry reads "Ovr: #15 (T3) | Pos: #5 (T3)" (was "Pos: #15 (T3)").
- **Lineup tab, Weekly loaded:** "Pos: #5 (T3) | Flex: #13 (T3)" (was "Pos: #15 (T3) | Flex: #15 (T3)"). Flex counts
  RB/WR/TE only, as the Waiver Wire's "Wk Flex" does (George Kittle "Flex: #19", as in S8's spec). QBs, kickers and
  defenses show only "Pos:", as before ("Pos: #1 (T3)" for Josh Allen, was "#13").
- **Lineup tab, ROS only:** "Pos: #5 (T3) | Overall: #15 (T3)". The second number is the Overall rank and stays it.
- **A file with a Pos Rank column** keeps its position ranks. Its FLEX rank was also the overall rank (the parser
  writes the overall rank to flexRank for every single file), so its Lineup "Flex:" number is now derived too, as the
  Waiver Wire already showed it ("Flex: #13", was "#15"). The card didn't name this case; it's the same bug, and the
  position numbers it asked to keep are kept.
- **Trade Finder, Positional Rank basis:** with a single file it compared your overall rank with the market's
  position rank, so most of your list looked like a disconnect ("RB #15" against the market's "RB #5"). It now uses
  the same position ranks. In the spec, a market that agrees with the file except for Henry flags only Henry
  ("Your Board: RB #5 (T3) · Ovr: #15 (T3)", "Market: RB #1"); on main it flagged 10 players at threshold 2.
- Tiers are unchanged: a derived rank shows the file's overall tier, as S8 round 3 already did.
- **Who starts doesn't change**, nor bench order, slot order or FLEX Kickoff Optimization.

**What changed and where.**
- `js/mls/rankings/displayRanks.js` (new, in `PRECACHE_ASSETS`):
  - `singleFileFallback(rankings)` recognises the parser's fallback without positions: **positions** when every
    ranked player's posRank and flexRank equal his rank (a single file, no Pos Rank column); **flex** when every
    ranked player's flexRank equals his rank, QBs included (any single file).
  - `leagueRankDisplayIndex(league, rankings, rerender)` builds `buildRankDisplayIndex` once per render, only when
    one of those holds, with the Waiver Wire's positions (`makeLeagueGetPos`: the league's `globalPosMap`, then
    Sleeper's player map, then market data) plus the roster's own `pos` for anyone those don't know.
  - `displayRanksFor(index, cleanName, raw)` gives the numbers to show: derived where the index applies and knows
    the player's position, otherwise the raw ones.
- **Why the extra test rather than `buildRankDisplayIndex` alone:** per-position uploads also have posRank equal to
  rank, so `buildRankDisplayIndex` renumbers them 1..N per group. That gives the same numbers back only when every
  player's position is known; a name Sleeper can't match would shift everyone below him. The Waiver Wire has that
  edge today (out of scope here, it's the reference); the Lineup and Roster tabs now show per-position, FLEX-file
  and horizontal-sheet numbers exactly as stored.
- **Sleeper's player map:** free agents' positions come from it (a free-agent RB ranked ahead of Henry counts toward
  "RB5"). The renders can't wait for it, so `getSleeperMetaByName` (waivers.js) now keeps the resolved index
  (`sleeperMetaByNameIfLoaded`), and a render that finds it missing re-runs once when it lands, the same
  render-now, redraw-once pattern as the rookie badges and headshots. It's cached in IndexedDB and memory, so this
  is the first render of a page load at most. Rankings with their own position ranks never ask for it.
- `js/mls/render/roster.js` `loadRosterTab` and `js/mls/render/lineup.js` `renderLineupUI` / `lineupRankBadge`:
  the rows read display ranks. The Lineup tab's index uses the rankings the optimizer used (Weekly when loaded, else
  ROS); ROS's "Overall:" number stays the raw flexRank (the overall rank).
- **The optimizer is untouched.** `optimizeLineup`'s `scoredRoster` and `compareFlexCandidates` read the raw
  `posRank` / `flexRank`, and the saved lineup objects keep them. Display ranks are looked up at render time, never
  stored, so no stored data or storage key changed.
- `js/mls/scout/marketDisconnect.js`: the Positional Rank basis reads `displayRanksFor` (rank and tier). The Overall
  basis is unchanged.
- `sw.js`: `CACHE_NAME` v2.8.87 → v2.8.88. CHANGELOG: two lines under Lineup Strategist.

**Checked, not changed.**
- `posRankTag` (js/mls/constants.js, the Scout and All-Leagues cards' "Pos:" tag): with a single file posRank equals
  rank and the tiers match, so it shows nothing; nothing wrong is on screen. Confirmed. Showing the derived rank
  there would be new information, not a fix, so I left it.
- Top Available, the Dashboard's Best Available, Auto-Find, Check a List and S3's What changed already use
  `buildRankDisplayIndex`.
- **The Waiver Wire's "derived from the file's order" note:** not added to the Lineup and Roster tabs. Their numbers
  now match the Scout tab, which says it, and a note on two tabs opened every week would repeat it for most users.

**Tests.**
- `tests/mls-display-ranks.spec.mjs` (new, both widths), all four fail on main:
  - Single file as ROS and Weekly: Roster and Lineup numbers for Henry, Allen, Kittle and A.J. Brown; the saved
    starters and bench order equal the ones recorded on main before the fix (`STARTERS`, `BENCH`), and Henry's
    saved raw ranks are still 15 / 15.
  - ROS only: "Pos: #5 (T3) | Overall: #15 (T3)", same starters.
  - Own position ranks: a Pos Rank column with RB numbers doubled (so renumbering would show) reads "Pos: #10";
    sets rewritten as per-position uploads, also with gaps, read as stored ("Pos: #10", Allen "Pos: #2").
  - Trade Finder, as above.
- `tests/unit/displayRanks.test.mjs` (new): the fallback test on each file shape, Pos Rank column (positions kept,
  FLEX derived), the roster-position stand-in, and one re-render while the Sleeper map loads.

**Screenshots.** None re-taken; the screenshot league has no rankings, so these renders return before building
anything.

**Checks run.** `npm run check`: check-precache OK, 282 unit tests pass. Playwright: 242 passed and the 10
screenshot comparisons failed on the first run (MDS, T-Score and MLS pages alike, the environment-only failures
earlier entries describe); two later full runs passed all 252 with no baseline rewritten.

**Left over.** ~~The Waiver Wire renumbers per-position uploads when a player's position is unknown~~ (fixed in
round 2, below).

### F6, round 2: the Waiver Wire keeps per-position files' numbers (owner's request)

**Owner's request.** After round 1 I described a Waiver Wire bug found while reading `buildRankDisplayIndex`. The
owner asked for a test to confirm it, and a fix on this branch if needed.

**The bug.** `buildRankDisplayIndex` treated a file as the single-file fallback when every player whose position it
could look up had posRank equal to rank. Per-position uploads (one file per position) pass that test too: each file
numbers its own players, and the parser sets rank from the first file a player is in. So it renumbered each position
1..N from the positions it could look up. A player no source places (league, Sleeper's player map, market data),
such as a name Sleeper doesn't match, dropped out, and everyone below him moved up a spot. The same happened to a
horizontal Weekly sheet without a FLEX column.

**Confirmed in the app first** (`tests/mls-display-ranks.spec.mjs`, "keeps the files' position ranks when a
player's position is unknown"): per-position sets, untiered, with an unplaced RB at RB5, James Cook (free agent)
RB4 and Derrick Henry (your RB) RB7. Before the fix, Auto-Find said "Your weakest RB is Derrick Henry (ROS RB6)",
"ROS Pos: Cook RB4, Henry RB6", and the verdict was **"Ranked ahead of Derrick Henry"**: the gap shrank from 3 spots
to 2, below the 3-spot upgrade rule. The Roster tab (round 1) already said "Pos: #7".

**User-visible effect.** With per-position uploads, or a horizontal Weekly sheet without a FLEX column, the Waiver
Wire Assistant (Top Available, Auto-Find, Check a List), the Dashboard's Best Available and S3's What changed show
the numbers the files give. Verdicts follow them: Cook is "Upgrade over Derrick Henry" again. Single files are
unchanged (still derived). For per-position files whose players' positions are all known, nothing changes: the
renumbering handed the same numbers back. The "derived from the file's order" note no longer appears for
per-position files; it only appeared when renumbering changed a number, which is now never.

**What changed and where.**
- `js/mls/scout/waiverScanner.js`: `singleFileFallback(rankings)` (moved here from `displayRanks.js`) tells the
  fallback from the numbers alone: position ranks are derived only when every ranked player's posRank and flexRank
  equal his rank. `buildRankDisplayIndex` uses it instead of its own test. The FLEX test (a QB/K/DEF carrying a
  flexRank) is unchanged. Header comment updated.
- `js/mls/rankings/displayRanks.js` imports `singleFileFallback`, so the Lineup and Roster tabs and the Waiver Wire
  use one rule.
- **What changed's Weekly baseline** (`js/mls/rankings/changeSummary.js`, S3): it keeps a compact copy of the week's
  first upload, and those rows had no FLEX rank. With the new rule a single file's baseline stopped looking like a
  single file, so its position ranks weren't derived and the comparison reported false moves (S3's spec caught it:
  "Your players 11" instead of 7). Two changes:
  - New baselines store the FLEX rank as a 7th element (`baselineRows` / `rowsFromBaseline`), so they're judged
    exactly like the upload. A few bytes a player, in the existing `weekBaseline` field; no new key.
  - A row with no FLEX rank field at all (a baseline saved before this) is judged by its position ranks alone, the
    old rule. So an old baseline from per-position files is still renumbered until the next week's first upload
    replaces it. That only matters with a player the app can't place, and for at most a week.
- CHANGELOG line under Lineup Strategist. `CACHE_NAME` stays v2.8.88 (this branch's bump).

**Tests.**
- The spec above, which failed before the fix on the header, the verdict and its numbers; it also checks Top
  Available's "RB4" and the Roster tab's "Pos: #7".
- `tests/unit/waiverScanner.test.mjs`: per-position ranks with an unplaced player stay as stored;
  `singleFileFallback` added to the export list. It fails on the old scanner. `tests/unit/displayRanks.test.mjs`
  imports `singleFileFallback` from its new home, and checks the baseline shapes: rows without FLEX ranks judged by
  position ranks, per-position rows with them kept as stored.
- `tests/mls-display-ranks.spec.mjs`: a new Weekly set's baseline row ends with the FLEX rank.
- `tests/mls-rankings-change.spec.mjs` (S3): its pinned baseline row gains the FLEX rank, the intended change.

**Checks run.** `npm run check`: check-precache OK, 284 unit tests pass. Playwright: 256 passed in a full run after
the S3 fix, screenshots included (the first full run of the session again failed the same 10 screenshots, on every
page; no baseline rewritten).

### F6, round 3: the Lineup tab's rank badge fits on phones (owner's choice)

**Why.** Asked how F6 looks from a user's side, I screenshotted the Roster and Lineup tabs, Auto-Find and Trade
Finder at both widths. The numbers agree everywhere (A.J. Brown WR9, Kittle TE3, Henry RB5). One problem: on a phone
the Lineup tab cut off the end of the rank badge ("Pos: #5 (T3) | Flex: #13 (T", the FLEX tier lost on every RB, WR
and TE). Main does the same, slightly worse ("Flex: #15 ("): the badge was one piece that couldn't wrap, and the row
hides what doesn't fit. I offered **A**, splitting the badge onto two lines at the "|" when it doesn't fit, or **B**,
shorter phone wording ("RB5 · T3 | Flex 13 · T3"). The owner chose **A**.

**User-visible effect.** On phones, a Lineup row with two numbers shows "Pos: #5 (T3)" above "Flex: #13 (T3)" (or
"Overall:" with ROS only), so nothing is cut off; those rows are one line taller. One-number badges ("Pos: #1 (T3)",
"Unranked") are unchanged. On a computer the badge stays on one line and looks as before: a desktop badge compared
with main's differs in 2 anti-aliasing pixels of the bar. At 320px wide (the narrowest old phones) the halves can
still be cut, as players' names already are there; that's the row's layout, not this badge.

**What changed and where.**
- `js/mls/render/lineup.js`: `rankBadgeParts(first, second)` wraps the two halves (`.mls-rank-part`, each kept whole)
  with the bar as real text (`.mls-rank-bar`), so the badge's text is still "Pos: #5 (T3) | Flex: #13 (T3)" and the
  specs reading it are unchanged.
- `css/mls.css`: `.mls-rank-parts` is a wrapping inline-flex. Each part has a 0.908em gap on its left (the old " | "
  text's width in this font) with the bar centred in it; the wrapper starts one gap to the left and clips that strip
  (`clip-path`), so a part that wraps to the start of a line loses its bar while one beside another keeps it. The
  badge allows wrapping only when it holds parts (`:has(.mls-rank-parts)`).
- Roster tab unchanged: its badge fits at phone width. CHANGELOG line. `CACHE_NAME` stays v2.8.88.

**Tests.** `tests/mls-display-ranks.spec.mjs`, "nothing is cut off; one line on desktop, two parts on phones": every
Lineup badge ends inside its row; on desktop each is one line with the bar showing; on a phone Henry's halves sit on
two lines with no bar. Before the change it failed at both widths (cut off on the phone).

**Screenshots.** None re-taken; the screenshot league has no rankings, so its badges read "Unranked".

**Checks run.** `npm run check`: check-precache OK, 284 unit tests pass; Playwright: the same 10 first-run screenshot
failures on every page, then a full rerun passed all 258 with no baseline changed.

### F6, round 4: a split badge's box fits its text (owner's go-ahead)

**Why.** In another review as a user (Roster, Lineup, Auto-Find and Trade Finder at both widths), everything read
right except one thing: when a Lineup badge split onto two lines on a phone, its dark box stayed as wide as the row
allowed, leaving an empty block beside the text. CSS sizes a box whose contents wrap to the space available, not to
its longest line, so CSS alone can't fix it. I showed a mock-up with the box fitted to the text; the owner said go.

**User-visible effect.** On phones, a split badge's box is just wide enough for its two lines. Narrower, most of them
now fit beside the team badge (Chase, Jefferson, Bowers, Lamb in the fixture), so those rows are a line shorter than
in round 3. A badge too wide for that spot (Henry's "Flex: #13 (T3)") takes the line below, as before. Rotating the
phone or widening the window puts a badge back on one line when it fits. Desktop is unchanged (nothing splits there).

**What changed and where.**
- `js/mls/render/lineup.js`:
  - `fitRankBadges(roots)` runs after each Lineup render. It clears `.is-stacked` from every badge, then marks the
    ones whose two halves landed on different lines; clearing all before measuring any lets a badge with room go
    back on one line.
  - `watchRankBadgeWidths(roots)` sets up one `ResizeObserver` for the page's lifetime on the starters and bench
    containers. It refits when their width changes: rotation, a resize, or the tab shown after being hidden (hidden,
    nothing measures as split). Height changes are ignored, and the refit waits a frame so it never resizes what the
    observer is reporting on while it reports.
- `css/mls.css`: `.mls-rank-parts.is-stacked { flex-direction: column; }`, so the box fits its widest line.
- CHANGELOG line updated. `CACHE_NAME` stays v2.8.88.

**Tests.** `tests/mls-display-ranks.spec.mjs`, the fit test now also checks on a phone that Henry's split badge is no
wider than its wider half plus its own padding and border (it was 56px wider before this round), that widening the
window to 1280px puts it on one line, and that narrowing it again splits it with the box fitted.

**CI fix (PR #191).** The first CI run failed this test on the phone, at its last step: after narrowing the window
back, it measured the box as soon as the halves wrapped, but the refit runs a frame later (the observer waits a frame
on purpose), and CI's runner hadn't drawn that frame yet. Not reproducible here as-is (30/30), but delaying frames by
200ms made the old check fail the same way (56px; 60px on CI) and the fixed one pass. The test now waits for the box to
fit (`expect.poll`) instead of checking once; it still fails if the refit never happens. Test only, no app change.

**Screenshots.** None re-taken; the screenshot league has no rankings.

**Checks run.** `npm run check`: check-precache OK, 284 unit tests pass; Playwright: the same 10 first-run screenshot
failures on every page, then a full rerun passed all 258 with no baseline changed.


## S9 — Position counts on the Roster tab

**User-visible effect.** Lineup Strategist's Roster tab has a row of chips directly above the player list, under
the Power Rankings strip and the Sync button: **All 14 · QB 1 · RB 1 · WR 7 · TE 3 · K 1 · DEF 1** for the fixture
league. Each chip stacks the position, the count and, when it applies, a small note: "1 IR", "1 taxi", or both
("1 IR · 1 taxi"). They're colored like the list's position badges and look and light up like the Waiver Wire
Assistant's position chips. Tapping a chip shows only that position (still in ROS order); the picked chip stays lit
and the rest fade. Tapping it again, or All, shows everyone. The counts always cover the whole roster, whichever chip
is picked.
- A position you have none of shows as **0** when the league starts one (any slot that takes it, flex slots
  included, so a QB shows in a superflex league with no QB slot). Those chips can't be tapped. It's left out when no
  slot takes it: a league without kickers shows no K. Positions outside QB/RB/WR/TE/K/DEF (a roster player whose
  Sleeper position the app doesn't map) get a plain chip after DEF.
- The counts follow every roster change: add, remove (on the Roster tab), sync, league switch, and saving the
  league's starting requirements (Setup tab), so a new K slot shows "K 0" right away.
- Empty roster (or no league): no chips; the welcome box is unchanged. Manual and Draft Strategist hand-off leagues
  count the same way (no taxi notes, since only a Sleeper sync sets `isTaxi`).
- The filter lives in memory, per league: a reload or a league switch shows everyone. Removing the last player at
  the picked position shows everyone too.
- The Active Roster card's (i) tooltip says what the chips do.

**Owner's decisions (asked before building).**
- **Where:** its own strip directly above the list, not in the header.
- **Starting slots:** counts only ("RB 6"), not "RB 6 / 2". So flex slots (FLEX, SFLEX, W/T, W/R) aren't shown at
  all; they only decide whether a zero position shows (above).
- **Taxi and IR:** counted, with a note. IR means in your Sleeper IR slot or on NFL IR (round 2 below; the first
  push counted NFL IR status only). PUP, NFI and suspensions aren't noted unless the player is in the IR slot.
- **Tap to filter:** yes, with an All chip; in memory, no new storage key.

**What changed and where.**
- `js/mls/render/roster.js`: `rosterPositionCounts(roster, reqs)` (the counts, exported), `setRosterPosFilter(pos)`
  (the tap) and `renderRosterPosCounts`. `loadRosterTab` draws the strip and filters the list after sorting; the
  empty-roster path hides the strip and clears the filter. Sort order and row layout unchanged.
- `lineup/index.html`: `#rosterPosCounts` (a `role="group"`, hidden until filled) above `.roster-container-wrapper`;
  the tooltip sentence.
- `js/mls/main.js`: the `setRosterPos` action. Each chip is a `<button>` with `data-action`, `data-pos`,
  `aria-pressed` (only the picked chip, or All) and an `aria-label` that reads like the card's example ("RB 1 (1 IR)").
- `js/mls/leagues/sync.js`: `saveRequirements` re-renders the Roster tab (it already re-ran the lineup).
- `css/mls.css`: `.mls-roster-poscounts` (one row, an equal column per chip) and `.mls-poscount-*`, with a phone size
  like the Power Rankings strip's. The chips reuse `.pos-filter` from css/base.css.
- Draft Strategist's Roster Limits row (Team tab) shows "count / limit" per position with an FLX column; with the
  owner's "counts only" there's nothing to share beyond the position order and colors, which match. No shared code.
- `sw.js`: `CACHE_NAME` v2.8.88 → v2.8.89. No new file, no new storage key. CHANGELOG line under Lineup Strategist.

**Tests.** `tests/mls-roster-counts.spec.mjs` (new, both widths):
- The fixture league's counts; removing Derrick Henry on the Roster tab ("RB 0", not tappable, "All 13"); adding
  James Cook from Setup's Add Player Manually ("RB 1").
- Filtering: WR shows the 7 WRs with the counts unchanged; a second tap and All show everyone; the filter holds
  through a remove; removing the last QB while QB is picked shows everyone.
- League switch: a new manual league shows no chips and the welcome box; straight back to the Fixture League shows
  everyone (this step failed before the empty-roster path cleared the filter); the manual league with K slots set to
  0 and a QB and a DEF added shows no K chip; switching back resets a filter.
- Taxi and IR: Sleeper stubs with Henry on IR and McBride on the taxi squad give "RB 1 (1 IR)" and "TE 3 (1 taxi)";
  a re-sync after McBride leaves the taxi squad drops the TE note.

**Screenshots.** `mls-league-roster.png` (desktop and phone) is the only screenshot this card changes: the chip row
above the list (desktop 61px taller, phone 56px). **Not re-taken in this commit**, so CI's two Roster comparisons
fail until it is. Same as F1: since 2026-10-03 this container renders text differently from CI (`56-prefer-inter.conf`,
`12-unhinted-grayscale.conf`, Inter and other extra fonts). With both rules removed through a private fontconfig the
text matches, but symbol glyphs such as the ✕ on every roster row still differ by tens to thousands of pixels per PNG,
so a PNG re-taken here would fail on CI. What was checked here instead: main (`origin/main`) and this branch rendered
in this container with `--update-snapshots=all`, compared with `npm run pxdiff`: only the two `mls-league-roster.png`
differ, and the tooltip edit leaves them unchanged. The re-taken PNGs should be the `mls-league-roster-actual.png`
files from this branch's first CI run (the `playwright-results` artifact), checked as F1's were: each
`-expected.png` identical to the committed baseline, and the difference only from the chip row down.

**Checks run.** `npm run check`: check-precache OK, 284 unit tests pass, Playwright 266 passed; the 10 screenshot
tests failed, on every page, as they do for main in this container (main's own render differs from all 20 committed
desktop baselines here).

**Left over.**
- Commit CI's two `mls-league-roster.png` renders (above).
- The Guide tab has no Roster-tab section, so the chips are explained only in the card's tooltip. S10 (the legend)
  should include them.

### S9, round 2: Sleeper's IR slot (owner's request)

**Why.** My summary said "IR" in the notes meant the NFL status only, because the app didn't record Sleeper's IR
slot. The owner thought it did. It read the slot in one place only: the Global Injury Auditor
(`js/mls/lineup/injuryAudit.js`) fetches rosters live and uses the `reserve` array so it doesn't say "Move to IR"
for someone already there. League sync never stored it. I offered to record it at sync, count it in the note, add a
row badge, and (separately) keep IR-slot players out of the Lineup tab's starters.

**Owner's decisions.**
- **Record the IR slot, and count "IR" as the IR slot or NFL IR**, each player once.
- **An IR badge** on the Roster tab's rows for IR-slot players.
- **Not now:** keeping IR-slot players out of the Lineup tab's starters. Noted below.

**User-visible effect.**
- A Sleeper sync records who's in your IR slot. The chips' "IR" note counts a player in that slot or on NFL IR:
  Jefferson (Out, in the IR slot), Kittle (NFL IR, in the slot) and Henry (NFL IR, on the bench) each count once.
- A player in your IR slot has an **IR** badge beside his name on the Roster tab, styled like TAXI (both are
  roster-status markers). If he's also on NFL IR, that one badge says it, so the red injury "IR" is left off. With
  any other status both show ("IR" then "OUT"). A bench player on NFL IR keeps the red injury "IR" only.
- Leagues synced before this have no IR-slot data until their next sync; until then the note counts NFL IR only.
  Manual and hand-off leagues have no IR slot, so NFL IR is all they count.

**What changed and where.**
- `js/mls/leagues/sync.js` (`processSleeperData`): each roster player gets `isReserve`, from your roster's `reserve`
  array, beside `isTaxi`. A field on the stored roster, no new storage key.
- `js/mls/render/roster.js`: the IR count reads `isReserve || inj === 'IR'`; the `.ir-slot-badge` row badge after
  TAXI, with the duplicate injury "IR" dropped.
- `css/base.css`: `.ir-slot-badge` shares `.taxi-badge`'s rule.
- CHANGELOG line updated and one added. `CACHE_NAME` stays v2.8.89 (this branch's bump).

**Tests.** `tests/mls-roster-counts.spec.mjs`, the taxi and IR test: Sleeper stubs put Jefferson (Out) and Kittle
(NFL IR) in the IR slot, Henry on NFL IR on the bench, McBride on taxi. Notes "RB 1 (1 IR)", "WR 7 (1 IR)",
"TE 3 (1 IR · 1 taxi)"; badges as above; a re-sync with Jefferson out of the slot and McBride off taxi drops their
notes and his badge.

**Screenshots.** None beyond round 1's two `mls-league-roster.png` (the screenshot league has no IR-slot players).

**Left over (for later).**
- **IR-slot players in the Lineup tab's starters** (owner: consider later). The optimizer still treats `isReserve`
  players as available. One who's Out or on NFL IR is never started anyway (his status), but one back to Questionable
  or healthy while still in your IR slot can be picked as a starter, though Sleeper won't start him until he's moved
  out. Fix: leave `isReserve` players out of the pool like taxi players (`js/mls/render/lineup.js`, `pool` /
  `taxiPlayers`), with a divider or badge on the bench. Changes who starts, so it needs its own card.
- Related, same decision: the Waiver Wire's "your weakest" skips IR, Out and taxi players by status
  (`js/mls/scout/waivers.js`, `INACTIVE_STATUSES`; `js/mls/scout/bestAvailable.js`), not by the IR slot. It could
  read `isReserve` in the same follow-up. (The Lineup tab's IR badge was added in round 4.)

### S9, round 3: the IR badge explains itself on tap (owner's request)

**User-visible effect.** The Roster tab's IR badge works like the SoS badge and the rank-change chips: hovering shows
what it means, and a tap or click shows the same text as a toast (phones have no hover). The text: "In your IR slot on
Sleeper. A player there can't start until you move him out of it.", with ", and on NFL injured reserve" after
"Sleeper" when that's true too. The badge looks exactly as before.

**What changed and where.**
- `js/mls/render/roster.js`: the badge is a `<button>` with `data-action="explainIrSlot"`, `data-tip`, `title` and
  `aria-label`; `explainIrSlot` shows `data-tip` as a toast, the same few lines as `explainSoS` and
  `explainRankMove`. `js/mls/main.js` registers the action.
- `css/mls.css`: `button.ir-slot-badge` drops the button's own font and line height (as `button.sos-badge` does) and
  gets the same focus ring.
- Checked in the browser at both widths: the button badge and a plain `<span>` copy with the same classes have the
  same size, position and computed styles (font, padding, border, colors, margin, alignment).
- CHANGELOG line updated. `CACHE_NAME` stays v2.8.89.

**Tests.** The taxi and IR test taps Jefferson's badge (slot only) and Kittle's (slot and NFL IR) and checks each
toast, and Kittle's `title`.

**Screenshots.** None changed (the screenshot league has no IR-slot players).

### S9, round 4: a review as a user; the IR badge on the Lineup tab (owner's choices)

**Why.** Asked how the feature feels from a user's side, I used the Roster tab at both widths with rankings loaded
and players on IR and taxi: reading the counts, filtering, removing, tapping the IR badge, and using the keyboard.
It answers "how many RBs do I have?" at a glance, but three things were rough. The owner asked for all three fixes,
plus the IR badge on the Lineup tab.

**User-visible effect.**
- **Filtered, the other counts stay readable.** With one position picked, the other chips fade to 60% with a little
  color left (they were at the Waiver Wire's 35% and nearly gray, so "TE 3, 1 IR · 1 taxi" was hard to read). Hover
  brings them up to 85%. The picked chip is unchanged.
- **Notes sit one per line.** "1 IR" over "1 taxi", so a phone chip no longer breaks a note in two ("1 IR · 1" over
  "taxi"). On a computer the notes are a little larger (0.68rem, was 0.6rem); phones keep 0.6rem. Screen readers
  still hear "TE 3 (1 IR · 1 taxi)".
- **Keyboard focus stays on the chip you chose.** Choosing a chip redraws the strip, and focus used to fall back to
  the top of the page. Now the new copy of that chip gets focus, so Tab and Shift+Tab carry on from it. Mouse and
  touch use look the same as before.
- **The IR badge on the Lineup tab:** starter and bench rows show the same IR badge for players in your Sleeper IR
  slot, before the injury badge (Jefferson: "IR" then "OUT"), with the same hover and tap explanation. A starter in
  the IR slot shows it too, which makes the round 2 leftover visible: the optimizer can still start an IR-slot player
  who is healthy again, and his row now says he's in the IR slot.

**Left as it is (my review; the owner asked only for the three fixes).** Counts only, without slot numbers, is the owner's round 1 choice, and
"too few" warnings were out of the card's scope; a 0 still shows for a position the league starts. The empty band
under the chips on desktop is the list's existing frame.

**What changed and where.**
- `js/mls/lineup/gameInfo.js` (beside `getByeBadgeHTML`, already shared by the two tabs): `getIrSlotBadgeHTML(p)`,
  `getInjuryBadgeHTML(p)` (drops the red "IR" when the IR-slot badge says it) and `explainIrSlot` (moved here from
  roster.js). The Roster tab and both Lineup row types use them; `js/mls/main.js` imports the action from here.
- `js/mls/render/lineup.js`: starter rows `[lock, IR slot, injury, bye, ...]`, bench rows `[IR slot, injury, TAXI,
  bye, ...]`.
- `js/mls/render/roster.js`: notes as one `.mls-poscount-note` per line inside `.mls-poscount-notes`;
  `setRosterPosFilter` puts focus back on the chosen chip when one had it.
- `css/mls.css`: `.mls-poscount-notes`, the note sizes, and the lighter fade
  (`.mls-poscount.pos-filter:not(.active-filter)`). The Waiver Wire's chips are unchanged. `css/base.css`: comment
  only.
- CHANGELOG line updated. `CACHE_NAME` stays v2.8.89.

**Tests.** `tests/mls-roster-counts.spec.mjs`, both widths, 12 tests:
- New: with the keyboard, Enter or Space on a chip keeps focus on it (TE, TE again, Shift+Tab to WR, All). The
  walk-through found focus on `<body>` before the fix.
- New: the Lineup tab, with Jefferson (Out), Kittle (NFL IR) and Chase (healthy) in the IR slot: bench badges for
  the first two (Jefferson keeps OUT, Kittle shows one IR), Chase starting with the badge, and its tap explanation.
- Updated: the TE chip's notes are two lines, each one line high; an unpicked chip's opacity is 0.6, the picked one 1.

**Screenshots.** None changed beyond round 1's two Roster PNGs: all 40 renders here match round 1's (the
screenshot league has no notes, filter or IR-slot players).

**Left over.**
- The Guide has no Roster-tab section, so the chips and the IR badge are explained only by the card's tooltip and the
  badge's own tap. S10 (the legend) should include both.
