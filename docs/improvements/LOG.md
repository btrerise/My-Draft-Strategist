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
- **What counts as an upgrade:** a ranked free agent in a better tier than your weakest player at his position when
  the rankings have tiers, otherwise at least 3 spots better (rounds 4 and 5).
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
- **Badge:** a player in Sleeper's 50 most-added of the last 24 hours gets a small orange Feather `trending-up` icon
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
  `.mls-trend-icon` and `#waiverTopViewWrap[hidden]`. The icon uses `--stack-color` (orange) to stand apart from the
  green Starts flag.
- `sw.js`: `CACHE_NAME` v2.8.79 → v2.8.80. No new files, so `PRECACHE_ASSETS` is unchanged. CHANGELOG line under
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

**Left over / notes.**
- Phones show the icon without a count (owner's choice). If that reads too bare, the next step is the "8.2k" text
  beside it.
- A trending player whose name collides with another Sleeper player picks up the team, injury and Starts check of the
  name-index winner (`getSleeperMetaByName`). Rare, and the same rule the rest of the Waiver Wire Assistant uses.
- Trending drops, and trending on the Dashboard's Best Available card, are out of scope (runbook: later ideas).
