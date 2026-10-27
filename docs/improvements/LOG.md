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
- ~~**IR-slot players in the Lineup tab's starters**~~ (decided in round 6: they stay eligible, as a prompt to activate
  them). The optimizer still treats `isReserve`
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

### S9, round 5: IR-slot players at the bottom of the Lineup tab's bench (owner's request)

**Why.** The owner asked for players with the IR badge to sit at the bottom of the bench, where fantasy apps show
IR players.

**User-visible effect.** The Lineup tab's bench reads like Sleeper's: the healthy bench (best first, as before), then
an **Injured Reserve** divider with the players in your IR slot, then the **Taxi Squad**. IR rows say "IR" in the slot
column (like "TX" for taxi, with the same dashed look) besides the IR badge, and keep their swap button. A swap keeps
the groups: swapping an IR player into a starting slot sends the starter he replaces to the healthy bench, not into
the IR group. Who starts doesn't change. A healthy IR-slot player can still be picked as a starter, the round 2
leftover; if he is, his row stays with the starters and shows the IR badge.

**What changed and where.**
- `js/mls/render/lineup.js`: `groupBench(bench)`, a stable partition (bench, IR slot, taxi), applied at the end of
  `optimizeLineup` and after every swap in `initiateSwap` (a swap drops the outgoing player into the other's bench
  spot). The bench render adds the "Injured Reserve" divider (the taxi divider's style) and the "IR" slot code.
- `css/mls.css`: `.slot-badge.slot-IR` shares `.slot-TX`'s rule.
- Saved lineups from before round 2 have no IR-slot data on their bench copies; the next sync re-runs the optimizer
  (it always does) and groups them. CHANGELOG line updated. `CACHE_NAME` stays v2.8.89.

**Tests.** `tests/mls-roster-counts.spec.mjs`, new, both widths: with rankings loaded, Jefferson (Out) and Kittle (NFL IR)
in the IR slot and McBride on taxi, the bench reads healthy players, the "Injured Reserve" divider, Jefferson and
Kittle, the "Taxi Squad" divider, McBride, with slot codes BN, IR and TX; swapping Jefferson into a WR slot puts the
benched WR above the IR divider and leaves Kittle alone in the IR group. Fails before this round (no IR divider).

**Screenshots.** None changed (the screenshot league has no IR-slot or taxi players).

### S9, round 6: a healthy IR-slot starter is a prompt to activate him (owner's decision)

**Why.** In a second review as a user, Chase (healthy, in the IR slot) was the optimal lineup's WR1, while his own IR
badge said "A player there can't start until you move him out of it": the app contradicted itself. I suggested keeping
IR-slot players out of the optimizer's pool, like taxi players.

**Owner's decision.** Keep the logic. An optimal lineup says who should start; if that's a healthy player in the IR
slot, the recommendation means "activate him", and Sleeper makes you do that before it lets you start him. The Waiver
Wire's "your weakest" stays as it is for the same reason (a healthy IR-slot player is a real asset). Then, of two
wording options, the owner chose **both**: an instruction on the starter row's badge **and** a line above the lineup.

**User-visible effect.**
- When the lineup starts a player who's in your Sleeper IR slot, a purple line above the lineup (the IR badge's colors,
  in the injury warning's place and shape) says: "Ja'Marr Chase is in your IR slot on Sleeper. Move him to your active
  roster there before kickoff to start him." With several: "A and B are in your IR slot on Sleeper. Move them to your
  active roster there before kickoff to start them." It follows the injury warning's rules: not in Best Ball leagues,
  and a player whose game has kicked off is left out. A manual swap that starts an IR-slot player shows it too.
- On a starter row the IR badge's hover and tap text says what to do: "In your IR slot on Sleeper. Move him to your
  active roster there to start him." Bench and Roster rows keep "A player there can't start until you move him out
  of it."
- Who starts doesn't change.

**What changed and where.**
- `js/mls/lineup/gameInfo.js`: `getLineupIrSlotWarningHTML(starters, league)` (new), and `getIrSlotBadgeHTML(p,
  { starting })` for the starter wording. `js/mls/render/lineup.js` draws the line after the injury warning and
  passes `{ starting: true }` on starter rows.
- `css/mls.css`: `.lineup-injury-warning.lineup-ir-warning` (purple) and its icon kept full size when the text wraps.
- CHANGELOG line updated. `CACHE_NAME` stays v2.8.89.

**Tests.** `tests/mls-roster-counts.spec.mjs`: with Chase in the IR slot and starting, the line's exact text, his
badge's new toast, and a bench badge's unchanged `title`; in the bench-order test, no line while no IR-slot player
starts, then Jefferson named in it after he's swapped into a WR slot.

**Screenshots.** None changed (the screenshot league has no IR-slot players).

### S9, round 7: the lineup image leaves out the warnings (owner's choice); a runbook card for Optimize All

**Why.** In a third review as a user I exported the Lineup tab's PNG with an IR-slot player starting: the image's
first line was the purple "move him to your active roster" reminder. The image is made for league chats, so a personal
to-do went to league mates. The red injury warning ("X is Out ... consider swapping") had always done the same. The
owner asked for both to come out of the image.

**User-visible effect.** Export (the Lineup tab's PNG button) draws the lineup without the warnings above it: neither
the red injured-starter warning nor the purple IR-slot reminder. The rows' badges (IR, OUT, Q...) stay in the image,
and the page still shows both warnings.

**What changed and where.** `js/mls/trade/export.js` (`exportLineup`'s `onclone`): removes every
`.lineup-injury-warning` from the clone (the purple line carries that class too). CHANGELOG line. `CACHE_NAME` stays
v2.8.89.

**Tests.** `tests/mls-roster-counts.spec.mjs`, new, both widths: with Chase (healthy) in the IR slot and Allen
Doubtful, both starting, an export's clone (html2canvas served from `tests/node_modules`, wrapped to record what
`onclone` leaves) has no warnings, one IR badge and one injury badge; the page still shows both warnings. It failed
before the change (the IR reminder was in the clone). `tests/export-flex.spec.mjs` is unchanged.

**Runbook card for the other gap.** The same review found that the Dashboard's Optimize All only says the leagues were
optimized: a starter in your IR slot (or an injured one) shows only on that league's Lineup tab. The owner asked for a
runbook card rather than more S9 work: **S11, "Optimize All names the lineups that need you"**, added to the runbook.

### S9: the Roster screenshots re-taken from CI

**Re-taken PNGs** (the only screenshots this card changes):
- `tests/baselines/linux/desktop/mls-league-roster.png`: the position-count strip above the roster list, 2872 → 2931px
  tall.
- `tests/baselines/linux/phone/mls-league-roster.png`: the same, 2674 → 2730px tall.

**Where they come from.** Both are CI's own renders: the `mls-league-roster-actual.png` files from PR #192's first
run (run 37862803285, `playwright-results` artifact), the run that failed only on these two comparisons. Unlike F1,
this session downloaded the artifact itself with `gh run download` (the owner had opened access; the artifact host is
no longer blocked). `docs/TESTING.md` now describes this route under "Accepting an intended visual change".

**Checked before committing.**
- Each run's `-expected.png` is identical to the baseline committed before this change, so CI compared against what
  was in the repo.
- Desktop: rows 0–1074 are identical (everything above the strip); the rest is the same content 59px lower (phone:
  rows 0–1050, 56px lower). Below the strip, a few text and border rows differ by anti-aliasing only: the strip's
  height isn't a whole number of pixels, so the rows under it are drawn at a slightly different sub-pixel offset. A
  side-by-side of those bands shows the same rows (players, badges, buttons). This container's render made the strip
  61px tall on desktop rather than CI's 59px, for the same reason plus its fonts.
- The strip itself, as CI draws it, at both widths: All 14, QB 1, RB 1, WR 7, TE 3, K 1, DEF 1, each in its position's
  color.

## S10 — A legend for the badges and symbols

**Owner's answers before building** (asked with a sketch; all four were my recommendations):
1. **Where:** a section in each app's Guide tab, plus a "What do these mean?" link that opens the Guide at it, on the
   Scout tab's Waiver Wire Assistant and on the Lineup and Roster tabs. Not a popover per card.
2. **Which apps:** both. Draft Strategist's list is short, and the coverage test checks both.
3. **Grouping:** by kind (positions and slots, ranks and tiers, changes and trends, availability and status, schedule),
   each badge once. Not by screen.
4. **Colors:** one line per color set (position colors, the flex blends, SoS 1/16/32, amber and red freshness, the
   Power Rankings colors), not a line per color.

**What users see.**
- Lineup Strategist's Guide has a new step 13, **What the badges mean** (before Keyboard Shortcuts): 37 lines in five
  groups, each a sample drawn as it looks on the rows and one sentence on what it means. The ones that explain
  themselves on a tap (rank-change chips, the IR slot badge, SoS) say "Tap for more".
- Draft Strategist's Guide has a new last step 12, the same for its 15 lines in three groups.
- **"What do these mean?"** (an info icon and green text; on phones, **"Badges"**) opens the Guide scrolled to the
  legend, with focus on its heading: in the Waiver Wire Assistant's and the Optimal Lineup's card headers, on a line
  of its own above the Roster tab's position counts (in the header, a league name and its format plus the link
  wrapped the title on a phone), and on a line of its own above Draft Strategist's Tracker chips (no card header
  there).
- The Guide's two SoS lines (step 3) now say 1 = easiest, 32 = hardest, and mention the SoS card's
  "My SoS files rank 1 = hardest" switch (left over from S7 round 5).

**How the samples stay real.** Each sample is drawn with the markup the rows use:
- `js/mls/badges.js` and `js/mds/badges.js` (new, no app state) hold the markup of every badge that had a helper or
  inline styles, and the rows now call them: SoS (`sosBadgeMarkup`, from `getSoSBadgeHTML`), rank-change chips
  (`moveChipMarkup`, from `rankMoveChip`), the IR slot, injury, bye and kickoff badges, the Lineup tab's two warning
  icons and the split rank badge's halves, the trending and Starts icons, Best Available's upgrade and dismiss icons,
  the Roster tab's position-count chip, the Dashboard's league status icons and BB, Bench/Starting in Sleeper, the
  verdict and ownership pills, the tier gap, the Trade Finder's Edge badge; in Draft Strategist the Value/Reach/At Rank
  badge, T-Score labels, Stack, the Tracker's tier chip, the Team tab's slot labels and the bye-week banner. The markup
  they return is the markup the rows built before (moved, not rewritten), and the screenshots of every tab without a
  link are pixel-identical to main's.
- Badges with no helper and no inline style (TAXI, R, LOCKED, EARLY, position badges...) use the same classes.
- `{ sample: true }` gives a tappable badge as a `<span>` with no `data-action`, tip or title, and
  `.badge-legend-sample` turns off pointer events: nothing in the legend can be tapped or tabbed to.
- One CSS selector widened with no change on screen: the stalled LIVE pill's amber dot was keyed on `#liveIconWrap`,
  now on `.is-stalled .pulse-dot`, so the legend's stalled pill uses the same rule (`css/mds.css`).
- `js/mls/legend.js` and `js/mds/legend.js` build the list the first time the Guide tab is shown (`showTab` in
  `js/mls/nav.js` and `js/mds/ui.js`), not at start-up: built eagerly, its hidden samples matched page-wide locators
  in other specs (`.mls-move-chip`, the bye banner), which is also a hint that users' own find-in-page would trip on
  them. The CSS for both is at the end of `css/base.css` (`.badge-legend-*`). No storage key.

**Keeping it from drifting.** `tests/unit/badgeLegend.test.mjs` loads each legend module in Node and collects every
badge class the app uses: classes in a `class="..."` with a badge-like class (badge, `*-badge`, `scout-status`, the
chips...), the class strings passed to the pill and tier-gap helpers and status maps, and from the CSS the classes in a
compound with a badge class (`.slot-badge.slot-FLEX`, `.pos-badge.K`) that the source spells or builds
(`slot-${...}`). It fails naming any the legend lacks; `ALLOWED` lists the ones that aren't symbols (filter state,
sizing, layout). Dropping the TAXI line made it fail on `taxi-badge`. The rule is in `CLAUDE.md` ("Rules that bite") and
`docs/TESTING.md` (Conventions, "Badge legend"). `tests/badge-legend.spec.mjs` opens the Guide from each link (click,
and Enter from the keyboard), checks the legend is in view with focus on its heading, and checks samples by their real
classes (SoS 1 green, the rank-change chips, the injury badges, IR, SFLEX; Value, Reach, SFLX, the stalled LIVE pill),
that nothing in it is interactive, the phone's calendar icon, and no overflow at phone width. The legend is static, so
its empty state is the normal one: the specs open it with no league or rankings loaded.

**Inventory: left out, and why.**
- Plain-word labels that say what they are: the Trade Analyzer's Receiving/Giving tag, the Injury Auditor's location
  badge, the manual-add log's "Last added", the simulator's "Final" next to points.
- Controls rather than symbols: the Early Games team chips and their ✕, Draft Strategist's queue star and affinity
  circle (Guide step 6 explains both), the Tracker's ALL/position filter buttons beyond the one tier-chip line.
- Draft Strategist has no "early" badge (the card listed one; EARLY is Lineup Strategist's), and its bye is the text
  "Bye: 7" on a card plus the Team tab's banner, which is in.
- `slot-ROS`: styled in `css/mls.css`, but nothing builds a slot named ROS today (allowed in the test; possibly dead
  CSS, a follow-up to check).

**Follow-ups noted, not changed (out of scope).**
- The Edge, Bench/Starting in Sleeper, BB and At Rank badges carry inline styles; now that they live in `badges.js`
  they could become classes.
- "Started" (kickoff) and "AUTO-LOCKED" on the same row say nearly the same thing.
- The single-letter injury codes (Q, D) aren't explained anywhere on the rows; the legend now covers them, but a
  title on the badge would help on desktop.

**Screenshots.** This container can't render CI-matching baselines (F1, S9), so I rendered main and this branch here
the same way and compared them with `npm run pxdiff`. The PNGs this change touches, each for the reason given (the
rest are identical):
- `desktop/mls-league-guide.png`, `phone/mls-league-guide.png`: the new legend step (taller) and the SoS wording.
- `desktop/mds-empty-guide.png`, `phone/mds-empty-guide.png`: the new legend step.
- `desktop/mls-league-scout.png`, `phone/mls-league-scout.png`: the Waiver Wire Assistant's link in its header.
- `desktop/mls-league-lineup.png`, `phone/mls-league-lineup.png`: the Optimal Lineup's link in its header.
- `desktop/mls-league-roster.png`, `phone/mls-league-roster.png`: the link's line above the position counts.
- `desktop/mds-empty-tracker.png`, `phone/mds-empty-tracker.png`, `desktop/mds-draft-tracker.png`,
  `phone/mds-draft-tracker.png`: the link's line above the Tracker chips.
**The 14, re-taken from PR #193's CI.** Each is CI's own `-actual.png` from a `playwright-results` artifact
(`gh run download`), and in every run each `-expected.png` was identical to the committed baseline. It took four runs,
not one: `toHaveScreenshot` stops a test at its first failing shot, and each test in `visual.spec.mjs` shoots several
tabs, so a run renders only the first changed PNG of each test (now in `docs/TESTING.md`). Each run failed on exactly
the PNGs below and nothing else:
- Run 37894644331: `{desktop,phone}/mds-empty-tracker.png`, `mds-draft-tracker.png`, `mls-league-roster.png`. Above
  the new link line, identical; below it, the same content 19px lower (desktop `mds-draft-tracker`: page +18px), with
  anti-aliasing differences only, from the sub-pixel offset (as in S9).
- Run 37931976944: `{desktop,phone}/mds-empty-guide.png` (the legend step: desktop +1038px, phone +1680px; everything
  above it identical) and `mls-league-lineup.png` (same size; only the Optimal Lineup header row differs).
- Run 37932692082: `{desktop,phone}/mls-league-scout.png` (same size; only the Waiver Wire Assistant header row).
- Run 37933514590: `{desktop,phone}/mls-league-guide.png`: the SoS wording in an earlier step and the new step 13 (desktop
  +2104px, phone +3905px).

## S11 — Optimize All names the lineups that need you

**User-visible effect.** After **Optimize All Lineups** or **Sync All Leagues** on the Dashboard, a box appears under
the two buttons when any lineup needs something from you before kickoff: "2 lineups need you before kickoff", then one
line per league with its name, what to do and an **Open lineup** button:
- Fixture League · "Activate Ja'Marr Chase from IR · Josh Allen is Doubtful · RB slot is empty" · Open lineup
- Activations come first, then injured starters (statuses spelled out: Doubtful, Out, on IR, on PUP, suspended, on
  NFI, hasn't reported), starters on bye ("Tee Higgins is on bye") and empty starting slots ("TE slot is empty",
  "2 FLEX and W/T slots are empty").
- Open lineup makes that league active and shows its Lineup tab, where the matching red or purple warning is above
  the lineup (bye starters show their BYE badge, and empty slots show as "[ Empty Slot ]" rows).
- The box stays until the next Optimize All or Sync All, or until you close it with ✕. It's kept in memory only, so a
  reload clears it.
- Clean run: no box, and the toast is unchanged ("Successfully optimized N lineups!" / "Successfully synced N
  leagues!"). Failed run: the same error toast as before, and no box (the previous run's box goes as the run starts).
- Phones: one league per line, with the button at the right and the to-do wrapping under the league's name. Player
  names never break across lines (no-break spaces), long league names wrap between words, and nothing runs past
  the edge at 375px.
- Best Ball leagues are never listed. Manual and hand-off leagues have no IR slot, so they can only show injured, bye
  or empty-slot items. After Sync All, manual leagues and leagues it couldn't reach are listed from their last lineup.

**Owner's decisions (asked before building).**
- **Where:** a small dismissible box under the Dashboard's Optimize All button, one line per league, staying until the
  next run (not a longer toast, not a Command Center column).
- **What counts:** injured and IR-slot starters, as on the Lineup tab, **plus empty starting slots and starters on
  bye**. The Lineup tab has no warning for either of those two, and its two warnings stay exactly as they were, so
  only the Dashboard lists them.
- **Sync All:** yes, the same list after it syncs, covering every league (not only the ones it synced).

**What changed and where.**
- `js/mls/lineup/issues.js` (new, pure, in `PRECACHE_ASSETS`): `lineupIssues(starters, ctx)` returns
  `{ injured, irSlot, bye, empty }` with the warnings' old filters (`SIM_EXCLUDE_STATUSES`, `isReserve`, left out once
  his game has kicked off, nothing in Best Ball). A player already listed as injured isn't also listed on bye. A player
  who is both injured and in the IR slot is in both lists, as the Lineup tab shows both lines.
  `lineupIssueItems(issues)` gives the Dashboard's wording.
- `js/mls/lineup/gameInfo.js`: `getLineupIssues(starters, league)` supplies State (statuses, `hasKickedOff`, this
  week's byes) to `lineupIssues`. `getLineupInjuryWarningHTML` and `getLineupIrSlotWarningHTML` now take their players
  from it; their markup and wording are unchanged. `getByeBadgeHTML` shares the new `isOnByeThisWeek`.
- `js/mls/render/dashboard.js`: `collectLineupNeeds` reads every non-Best-Ball league's lineup from
  `State.manualStartersMap` after the run, without switching leagues. `renderLineupNeeds` draws the box (names
  escaped). `openLeagueLineup` (`switchActiveLeague`, then `showTab('lineup')`) and `dismissLineupNeeds`, both via
  `data-action` in `js/mls/main.js`. `optimizeAllLineups` and `syncAllLeagues` clear the list as they start and fill
  it only on success. For Sync All, that's after the finally's re-optimize of your league.
- `js/mls/state.js`: `State.lineupNeeds` (in memory, no storage key). `lineup/index.html`: `#lineupNeedsBox` after the
  button row. `css/mls.css`: `.mls-needs-*`, in the red of the Lineup tab's injury warning.
- Not a badge, chip or pill, so no legend line (`badgeLegend.test.mjs` passes). CHANGELOG line under Lineup
  Strategist. `CACHE_NAME` v2.8.91.

**Tests.**
- `tests/mls-lineup-needs.spec.mjs` (new, both widths) uses two leagues from the one fixture: "Fixture League" with
  Chase (healthy, starting) in the IR slot, and a second league, renamed, whose only QB is Lamar Jackson (Doubtful).
  Both rosters get a second RB, since the fixture roster has one RB for two RB slots.
  - Optimize All lists "Fixture League: Activate Ja'Marr Chase from IR" and "…: Lamar Jackson is Doubtful". Each
    Open lineup shows that league's Lineup tab with the matching warning, and ✕ hides the box.
  - Sync All shows the same list.
  - A clean run shows no box and the usual toast.
  - A failed run (the lineups' save throws) shows its error toast and clears the previous box.
  - At 375px: no page overflow, each league name whole, each button inside the box and on its league's line.
- `tests/unit/lineupIssues.test.mjs` (new): each list, kickoff, Best Ball, the injured-and-IR and injured-and-bye
  overlaps, and the wording (every status, several activations, empty-slot counts with W/T).

**Screenshots.** None changed: the box appears only after Optimize All or Sync All, and `visual.spec.mjs` runs
neither. This container can't render CI-matching baselines (F1, S9). Here, `visual.spec.mjs` rendered main and this
branch the same way, and `npm run pxdiff` found all 40 PNGs pixel-identical.

**Left over / noticed.**
- The fixture league's roster has one RB for two RB slots, so its lineup always has an empty RB slot. Any spec that
  runs Optimize All or Sync All on the plain fixture now gets the box ("RB slot is empty"). No existing spec asserts
  against it.
- ~~The box is a snapshot~~ and ~~the Command Center's (i) doesn't mention it~~: both done in round 2.

### S11, round 2: fixed leagues drop off, and the (i) explains the box (owner's request)

**Why.** The first version drew the box once, at the end of the run, so a league stayed listed after you fixed its
lineup. The Command Center's (i) didn't mention the box either. The owner asked for both.

**User-visible effect.**
- The box follows your lineups. Fix one (swap the injured or IR-slot starter out, fill the empty slot) and its line
  is gone the next time you see the Dashboard, and the count in the title follows ("1 lineup needs you before
  kickoff"). A starter whose game kicks off drops off the same way, as on the Lineup tab.
- Once no league is left, the box closes, and it stays closed until the next Optimize All or Sync All, even if a
  lineup changes back (a new problem doesn't reopen it on its own). ✕ closes it the same way.
- The League Command Center's (i) now ends: "Afterwards, and after 'Sync All Leagues', any lineup that needs you before
  kickoff (a starter who's injured, in your Sleeper IR slot or on bye, or an empty starting slot) is listed under these
  buttons with a button to open it. A league drops off once you've fixed it."

**What changed and where.**
- `js/mls/render/dashboard.js`: the box keeps no list, only whether it's open (`State.lineupNeedsOpen`, in memory;
  replaces round 1's `State.lineupNeeds`). `renderLineupNeeds` recomputes the lines from `State.manualStartersMap`
  each time it draws, and closes the box when none are left. A successful run opens it, the next run's start and ✕
  close it.
- `js/mls/leagues/sync.js` (`renderLeagueManager`): calls `renderLineupNeeds` beside `renderBestAvailable`, so the box
  redraws whenever the Dashboard does: after every lineup render (swap, lock, re-optimize), every sync, and when the
  Dashboard is shown. Exported through `js/mls/main.js` (the import pattern `renderBestAvailable` uses).
- `lineup/index.html`: the (i) text. CHANGELOG line updated. `CACHE_NAME` stays v2.8.91 (this branch's bump).

**Tests.** `tests/mls-lineup-needs.spec.mjs`, two new, both widths:
- Fixing the Fixture League (Garrett Wilson swapped in for Chase) leaves only the second league, under "1 lineup
  needs you before kickoff".
- With Chase the only issue, fixing him closes the box. Swapping him back by hand doesn't reopen it. The next Optimize
  All lists him again.
- The first test also checks the (i) text.

**Screenshots.** None changed: the (i) text is hidden until hovered. As in round 1, main and this branch rendered here
the same way are pixel-identical.

### S11, round 3: a review as a user; swaps, pickups, urgency, the Sleeper drop-down, always on (owner's choices)

**Why.** I tried the box as a user (two leagues: a healthy Chase in the IR slot, Henry Out with no RB depth,
Jefferson Doubtful with healthy WRs on the bench) and reported what felt off:
- The optimizer starts a Doubtful player over a healthy bench player by rank (only Out, IR, suspended, PUP, NFI and
  byes count as unavailable in `isUnavailableThisWeek`), then warns about him.
- "Open lineup" can't fix an Out or bye starter with no backup, or an empty slot: those need a pickup.
- The Command Center's red Lineup triangles ("differs from your Sleeper lineup") look like the box but mean
  something else.
- The box was tied to a run.
- "Successfully optimized" appeared next to "2 lineups need you".
- No urgency.
- "Activate X from IR · X is Out" was a mixed signal.
- IR activation was red in the box, purple on the Lineup tab.

**Owner's decisions.**
- **Suggest, don't decide:** "Jefferson is Doubtful: start CeeDee Lamb instead?" on the Dashboard, and on the Lineup
  tab the red warning names him **with a Swap button**. Who the optimizer starts doesn't change.
- **Buttons per line:** Open lineup when a swap or an activation fixes it, Find <pos> when nobody on the bench can,
  and both when a line needs both.
- **One list for the Sleeper mismatches:** the owner's idea, a drop-down at the bottom of the box, like the "What
  changed?" card's folds: the urgent items on top, the details a tap away.
- **Always on**, ✕ for the session. The toast says how many need you. Urgency (each line's first kickoff, soonest
  league first, amber within a day). Injured wins over the IR activation, on both tabs. Neutral box, each item in
  its Lineup tab color.

**User-visible effect.**
- **Always on.** The box shows whenever a lineup needs you, on any visit, not only after a run. It's drawn from the
  lineups as they are now on every Dashboard render, so a fixed league drops off and an empty box hides. ✕ hides it
  for the session until a league it didn't list needs you (or the next Optimize All or Sync All, which bring it
  back).
- **Lines:** "Fixture League  Tue 9:00 PM" (the earliest kickoff among the starters it names, amber within 24 hours;
  leagues with none known, only byes or empty slots, go last in league order), then the items. Activations are
  purple, injuries red, byes and empty slots muted.
- **Swaps:** for an injured or bye starter, the best healthy bench player who can take his slot. Same position first
  (best position rank), then anyone else the slot takes (best FLEX rank). Never someone injured, on bye, already
  kicked off, in the IR slot or on taxi, and each bench player only once. "Justin Jefferson is Doubtful: start Puka
  Nacua instead?" (Lamb was already starting at FLEX.)
- **Buttons:** Open lineup when a line has an activation or a swap. **Find RB** (or the slot's position: FLEX for
  FLEX, W/T and W/R, "Find players" for SFLEX) when an injured or bye starter has no swap, or a slot is empty. Find
  opens that league's Top Available on the Scout tab at that position (as the Best Available card's View does;
  manual leagues get Top Available's own note).
- **Sleeper drop-down:** "N leagues differ from your Sleeper lineup", folded, with a note "As of your last sync: set
  these on Sleeper, then sync to clear them." One line per league: "Start Ja'Marr Chase · Bench Garrett Wilson" and
  Open lineup. It keeps its open state across re-renders. With nothing urgent, the title reads "1 lineup to set on
  Sleeper". The table's Lineup column now uses the same comparison (`sleeperLineupChanges`), so the two agree.
- **Toasts:** Optimize All says "Optimized 5 lineups · 2 need you (listed under the buttons)" when any do, and the
  old "Successfully optimized 5 lineups!" when none do. Sync All adds "2 lineups need you (listed under the
  buttons)." A failed run keeps its error toast.
- **Lineup tab:**
  - With one injured starter and a healthy bench option, the red warning reads "Justin Jefferson is D and currently
    in your starting lineup. Start Puka Nacua instead? [Swap in Puka Nacua]".
  - With several, the old sentence is followed by a button per swap ("Puka Nacua for Justin Jefferson").
  - The button runs the ordinary swap (it locks him in, and can be undone).
  - Without a swap, the wording is unchanged.
  - An IR-slot starter who's also injured gets only the red line now, not the purple one too.
  - The warning's icon keeps its full size when the text wraps (it was squeezed to a dot).

**What changed and where.**
- `js/mls/lineup/issues.js`:
  - `lineupIssues(starters, ctx, bench)` adds `swaps`, `find` (Top Available chips) and `firstKickoffMs`.
  - Injured wins over the IR slot, and injured over bye.
  - `lineupIssueItems` returns `{ kind, text }`.
  - New: `needsLineupButton`, `swapFor`, `findChipFor` and `sleeperLineupChanges`.
- `js/mls/lineup/gameInfo.js`:
  - `getLineupIssues(starters, league, bench)` adds kickoff times.
  - `getLineupInjuryWarningHTML` takes the bench and adds the suggestion and its button.
  - `formatKickoffLabel` is exported.
- `js/mls/render/lineup.js`: passes the bench; `swapInSuggested(outId, inId)` (two `initiateSwap` calls).
- `js/mls/render/dashboard.js`:
  - The box is rebuilt: always on, `State.lineupNeedsDismissed` (in memory; replaces round 2's `lineupNeedsOpen`).
  - Lines, buttons, the Sleeper fold, the toasts.
  - `findLeaguePlayers`.
- `js/mls/leagues/sync.js`: the matrix uses `sleeperLineupChanges`.
- `js/mls/main.js`: the `swapInSuggested` and `findLeaguePlayers` actions.
- `css/mls.css`: the neutral box, item colors, the time, the button column, the swap button, and
  `.lineup-injury-warning > svg` kept full size (was `.lineup-ir-warning` only).
- CHANGELOG lines rewritten. `CACHE_NAME` stays v2.8.91.

**Tests.**
- `tests/unit/lineupIssues.test.mjs` (22 tests): swaps (position first, skipping the unavailable, flex slots, each
  bench player once, byes), pickups and their chips, injured over IR and bye, kickoff, the button rule and the
  Sleeper comparison.
- `tests/mls-lineup-needs.spec.mjs` (9, both widths), with the second league's QBs now Lamar (Doubtful, starting)
  and Hurts:
  - shown without a run, with the new toast;
  - Open lineup, then the Lineup tab's Swap in Jalen Hurts;
  - each fixed league dropping off until the box hides;
  - soonest first and amber (kickoffs set in `State`);
  - an empty RB slot's Find RB opening Top Available on RB;
  - the Sleeper drop-down (contents, kept open, Open lineup);
  - ✕ staying closed until a new league needs you, and the next run;
  - Sync All's toast, a clean run, a failed run, 375px.
- `tests/mls-roster-counts.spec.mjs`: in the bench-order test, Jefferson (Out, IR slot) swapped in now gets the red
  warning, not the purple one (the owner's injured-wins rule).

**Screenshots: three change, to be re-taken from the PR's CI run.** This container can't render CI-matching
baselines. Rendered here, main and this branch differ in exactly these PNGs (`npm run pxdiff`):
- `desktop/mls-league-setup.png` and `phone/mls-league-setup.png`: the box, now always on. The screenshot league's
  roster has one RB for two RB slots, so it reads "1 lineup needs you before kickoff · Fixture League · RB slot is
  empty · Find RB" (+133px).
- `desktop/mls-league-guide.png`: the legend's sample of the red warning, whose icon is now full size (it was
  squeezed, as on the Lineup tab).

No PR is open yet, so CI hasn't run. Push, let the PR's first run fail on these, and commit CI's renders
("Accepting an intended visual change" in `docs/TESTING.md`).

**Left over.**
- A Doubtful player you've chosen to start keeps his league listed until kickoff. ✕ covers the session; a per-item
  "keep him" was offered and not asked for.
- The Sleeper drop-down is only as fresh as the last sync (said in its note).
- ~~Whether the optimizer should prefer a healthy player over a Doubtful one~~: decided, see below.

**Owner's decision after round 3: Doubtful players stay eligible to start.** The optimizer keeps treating Doubtful
(and Did Not Report) as available, ranked like anyone else. Only Out, IR, suspended, PUP, NFI and byes count as
unavailable (`isUnavailableThisWeek`). The reason: the user's rankings should already account for it. An analyst who
doesn't expect a player to play ranks him lower, or leaves him unranked. The round 3 suggestion ("start Puka Nacua
instead?" and the Lineup tab's Swap in button) stays as the way to act on it, so the choice is the user's. Don't
change who starts for Doubtful players without asking the owner.

### S11, round 4: one box on the Lineup tab, the IR slot's rules, kept starters muted, the Auditor folded in (owner's choices)

**Why.** A second review as a user found:
- two cross-league injury checks (the box and the Global Injury Auditor);
- a stack of four lines above the Lineup tab's lineup;
- the Lineup tab saying "consider swapping" with nobody to swap in, and "is D" where the Dashboard said "is
  Doubtful";
- a Doubtful player you chose to start nagging every visit;
- "Activate from IR" not knowing the roster was full.

**Owner's decisions.**
1. **Fold the Auditor into Sync All:** fresh injury news, manual leagues looked up by name. A "Check Sleeper now" link
   with one line saying what it does, and a pointer card where the Auditor was (like the Power Rankings one on the
   Scout tab).
2. **Don't merge the box into the Command Center table.** On phones that trades a vertical problem for a horizontal
   one. A card-per-league Dashboard on phones would be its own runbook card. For now: separate, with the tooltips
   pointing to each other.
3. **Tooltip updates:** the Command Center's (i) and its Lineup column now point to the box.
4. **One box on the Lineup tab**, as sketched.
5. **The Lineup tab's Find button** for a starter nobody can replace.
6. **Statuses spelled out on both tabs.**
7. **Starters you locked in: shown muted, not counted.**
8. **The IR slot's rules**, after checking they can be read (they can: Sleeper's league settings have `reserve_slots`
   and `reserve_allow_out` / `_doubtful` / `_sus` / `_cov` / `_na` / `_dnr`, confirmed on live leagues).
   `roster_positions` gives the roster size. The owner picked all three uses:
   - the roster-full hint on activations;
   - "Move X to IR";
   - an IR-slot player who's no longer eligible there.

**User-visible effect.**
- **Lineup tab:** one box, "This lineup needs you", replaces the red injury warning, the purple IR-slot line and the
  amber "Differs from Sleeper lineup" line. The green "Matches your active Sleeper lineup" line stays.
  - One item per line, in the Dashboard's colors: activations purple, injuries red, the rest muted.
  - Buttons: "Swap in Puka Nacua" (the ordinary swap) and "Find RB" (that league's Top Available, at RB).
  - With only kept starters: "Nothing needs you · 1 starter you kept".
  - A fold: "Differs from your Sleeper lineup: 3 changes" → "Start Ja'Marr Chase · Bench Puka Nacua, Garrett Wilson".
  - The PNG export leaves the whole box out. The Guide's legend shows one sample of the box instead of the two lines.
- **Items** (both tabs, one per thing):
  - "Activate Ja'Marr Chase from IR on Sleeper before kickoff", plus " (roster full: drop someone first)" when the
    active roster has no open spot.
  - "Activate George Kittle from IR: he's no longer eligible there, and Sleeper blocks adds and drops until you do",
    for a bench player in the IR slot who's healthy, Questionable, or has a status this league's IR doesn't take.
  - "Justin Jefferson is Doubtful: start Puka Nacua instead?" (swap) or "Derrick Henry is Out: no healthy RB on your
    bench" (Find). A flex slot says every position it takes ("no healthy RB, WR or TE").
  - "Tee Higgins is on bye: …", the same way.
  - "RB slot is empty" (Find), and "2 FLEX slots are empty".
  - "Move Trey McBride to IR to free a roster spot", for a bench player whose status this league's IR takes, while a
    slot is open. When more qualify than slots are open, each says "(1 IR slot open)".
  - "Lamar Jackson is Doubtful (you locked him in)": muted and not counted. A lock, or a swap (which locks).
    Activations are never muted.
  - Statuses are spelled out ("is Doubtful", "is Out", "is on IR", "is suspended"…).
  - Injured wins over the IR activation: one item, never both.
- **Dashboard:**
  - The same items, now one per line under each league (a league with six read as a run-on sentence).
  - The Sleeper drop-down marks injured players ("Bench George Kittle (Out)"): the Auditor's "injured starter in your
    Sleeper lineup".
  - A footer line: "**Check Sleeper now** gets the latest injury news and your current Sleeper lineups for every
    league."
  - With only kept starters the title reads "Nothing needs you · 1 lineup with starters you kept". Those leagues go
    last.
- **Sync All:**
  - It gets a fresh player map every time (`forceRefresh`, as the Auditor did).
  - It also runs with only manual leagues.
  - It looks up each manual or hand-off league's players by name (team or position when several share a name; a team
    defense by its code) and records their status.
  - It re-optimizes those leagues (locks kept), so an Out player there is benched when someone can replace him.
  - The toast adds "Checked injuries in N manual leagues."
  - Its button's title: "Syncs rosters, injury news and lineups across all your leagues".
- **Global Injury Auditor removed.** Its Lineup tab card is now a one-line pointer: "The Global Injury Auditor is now
  part of the Dashboard's list of lineups that need you… [Go to the Dashboard →]". Guide step 7 is now "Lineups that
  need you". The Command Center's (i) describes the box, the drop-down and Sync All's injury check. Its Lineup column
  says "Differs from your Sleeper lineup: the changes are in the list above".
- **Not changed:** who the optimizer starts (Doubtful stays eligible, the owner's decision after round 3).

**What changed and where.**
- `js/mls/lineup/issues.js`:
  - `lineupIssues` adds `kept`, `irStuck`, `moveToIr`, `irSlotsOpen`, `rosterFull` and `noSwap`.
  - `lineupIssueItems` returns one item per thing (`kind`, `text`, `muted`, `swap`, `find`).
  - New: `irEligible`, `needsYou`, `findChips`.
- `js/mls/lineup/gameInfo.js`:
  - `getLineupNeedsHTML` replaces `getLineupInjuryWarningHTML` and `getLineupIrSlotWarningHTML`.
  - New: `getSleeperLineupChanges` / `sleeperChangesHTML` (shared with the Dashboard) and `FOLD_CHEVRON`.
  - `getLineupIssues` passes locks (`State.lockedPlayersMap`), `irRules`, `rosterSize` and the roster.
- `js/mls/render/lineup.js`: the box in place of the three lines.
- `js/mls/render/dashboard.js`: the box on the new items, stacked; `checkSleeperNow`, `goToLineupNeeds`; Sync All's
  manual-league step, `forceRefresh` and toast.
- `js/mls/leagues/sync.js`: `irRules` and `rosterSize` on the stored league (no new storage key); the matrix's
  tooltip.
- `js/mls/leagues/manualInjuries.js` (new, in `PRECACHE_ASSETS`): the by-name lookup, moved from the Auditor.
- `js/mls/lineup/injuryAudit.js`: deleted (removed from `PRECACHE_ASSETS`).
- `js/mls/main.js`: actions `checkSleeperNow` and `goToLineupNeeds`; `runGlobalInjuryAudit` removed.
- `js/mls/legend.js` and `css/base.css`: one legend sample.
- `js/mls/trade/export.js`: removes `.lineup-needs-box`.
- `lineup/index.html`: the pointer card, Guide step 7, Sync All's title, the Command Center's (i).
- `css/mls.css`: `.lineup-needs-*` replaces `.lineup-injury-warning` / `.lineup-ir-warning`; stacked items; kept and
  check-link styles.
- CHANGELOG lines rewritten. `CACHE_NAME` stays v2.8.91.
- Leagues synced before this round have no IR rules or roster size until their next sync, so they get no IR moves,
  no "no longer eligible" items and no roster-full hint until then. Manual leagues never get them.

**Tests.**
- `tests/unit/lineupIssues.test.mjs` (23): adds kept starters, `irEligible`, IR moves with open slots and their count,
  no-longer-eligible IR players (healthy, Q, a refused status; PUP left alone), the roster-full hint, item order, the
  flex "who".
- `tests/mls-lineup-needs.spec.mjs` (12, both widths):
  - the Lineup tab's box and its Swap in;
  - a locked starter muted on both tabs;
  - the IR rules (league settings routed, one bench spot fewer so the roster is full);
  - Find RB from the Lineup tab too;
  - the Sleeper fold on both tabs, with "(Out)";
  - Check Sleeper now;
  - a manual league's Henry found Out by name at Sync All;
  - the Auditor's pointer.

  The fixture league now trades A.J. Brown for Bijan, so it still fits its 14 spots.
- `tests/mls-roster-counts.spec.mjs`:
  - the S9 IR tests read the box: Chase's activation item;
  - Jefferson swapped in is Out, so he's muted, not activated;
  - the PNG export drops the box (3 items with the empty RB slot).
- `tests/mls-keyboard.spec.mjs`: Tab from the lineup reaches the box's Find RB before Unlock All.

**Screenshots: six change, to be re-taken from the PR's CI run** (they supersede round 3's three). Rendered here,
main and this branch differ in exactly these:
- `{desktop,phone}/mls-league-setup.png`: the Dashboard box ("1 lineup needs you before kickoff · Fixture League · RB
  slot is empty · Find RB", and the Check Sleeper now line).
- `{desktop,phone}/mls-league-lineup.png`: "This lineup needs you · RB slot is empty [Find RB]" above the lineup; the
  Auditor's card replaced by the one-line pointer (the page is shorter).
- `{desktop,phone}/mls-league-guide.png`: Guide step 7's new text and the legend's one box sample.

**Left over.**
- A season-long lock counts as "you kept him": a stud you locked in August who's Out now shows muted. The lock list
  is ids only, so the box can't tell when the lock was set. If that bites, a lock could be ignored once the status
  changes after it (needs storing the status at lock time, a new key).
- PUP and NFI in the IR slot: no move suggested and no "no longer eligible", since it's unclear which Sleeper flag
  covers them.
- Runbook card idea: a phone Dashboard with one card per league (status icons, to-dos and buttons together) in place
  of the table plus the box (owner's #2).
- The Lineup tab's button row (Optimize / Copy / PNG) is already wider than 375px on the desktop project's layout;
  not this card's.

### S11, round 5: manual locks clear each NFL week (owner's decision)

**Why.** Round 4 shows an injured starter you locked as your call, muted and not counted. But the lock list was
season-long and holds only ids, so a star locked in August who's Out now would be muted too. I offered to record the
status at lock time. The owner chose something simpler: **clear all locks at the start of each NFL week.**

**User-visible effect.**
- A lock (the padlock, or a swap, which locks) lasts until Sleeper's NFL state reports a new week. On the first load
  in a new week, every league's manual locks are cleared, the saved lineups' LOCKED badges with them, and a toast
  says "New NFL week: cleared 3 locks from last week." Game-time auto-locks and their overrides are separate and
  unchanged.
- The first load after this ships only records the week. The app can't tell when the locks it finds were set, and
  clearing ones set this morning would be worse than keeping old ones until the next week starts (a few days).
- Wording: Unlock All's title, the Optimal Lineup's (i), the Guide's lock line and the legend's LOCKED line say locks
  last for the week.

**What changed and where.**
- `js/shared/storage/keys.js`: **new key `mls_locks_week`** (`KEYS.mls.locksWeek`): the week, "2026-5", that the
  locks were last checked in. It's written only once there's a lock to track: at the first lock, or on load when
  locks exist and no week is recorded. A browser with no locks never gets it, so the pre-6B backup restore test
  still sees only its own keys.
- `js/mls/render/lineup.js`: `clearLocksForNewWeek(season, week)`; `setPlayerLockState` records the week at the first
  lock. `js/mls/state.js`: `refreshCurrentNflWeek` calls it once Sleeper's week is known, before the tabs redraw.
  `js/mls/main.js` re-exports it.
- `lineup/index.html`, `js/mls/legend.js`: wording. CHANGELOG line. `CACHE_NAME` stays v2.8.91.

**Tests.** `tests/mls-weekly-locks.spec.mjs` (new, both widths):
- a lock with week 1 recorded clears on a week-2 load, with the toast, and the padlock shows unlocked;
- the same week keeps it;
- the first time (no week recorded) keeps it and records week 2.

**Found, not fixed (pre-existing, also on main).** Locking a player saves the lock list but not the saved lineup, so
after a reload the LOCKED badge and padlock show unlocked until the lineup is next recomputed (a sync, Optimize, a
rankings change), though the lock itself is kept and applied then. Fix: persist `manualStartersMap` /
`manualBenchMap` in `setPlayerLockState` (js/mls/render/lineup.js). A one-line follow-up; not this card's.

**Screenshots.** No change beyond round 4's six: `mls-league-guide.png` (both widths) already changes, and now also
carries the lock wording.

### S11, round 6: the padlock after a reload, Dashboard buttons on phones, IR moves as notes, shorter items, a foldable Lineup box (owner's choices)

**Why.** A review as a user after round 5 found five things, and the owner added a sixth (the Lineup tab box should
be collapsible or dismissible):
1. After a reload the padlock read unlocked while the box said "you locked him in" (the pre-existing bug noted in
   round 5).
2. On phones the Dashboard's buttons sat beside whichever item lined up with them.
3. An IR move alone made a league count as "needs you before kickoff".
4. Two items ran four lines on a phone.
5. "Check Sleeper now" sat under the Sync All button and did the same thing.

**Owner's decisions.**
- 1–4: fix them, with IR moves counted like kept starters (shown, not counted).
- 5: name it **"Sync All again"**, so it's clear why it's there twice.
- The box: I recommended **collapsible** (folded, it still shows its count, so a new problem can't hide), remembered
  like the Best Available card. The owner offered either, so this is my call; it's easy to switch to a dismiss.

**User-visible effect.**
- **Locks survive a reload:** a lock saves the lineup as well as the lock list, so the padlock and LOCKED badge show
  after a reload.
- **Dashboard, phones (≤600px):** each league's buttons go in a row under its items, and the items get the full
  width. On desktop the buttons stay on the right, now aligned to the top of the league.
- **IR moves are notes:** "Move Trey McBride to IR to free a spot" is still listed (purple) but doesn't count. With
  only notes and kept starters:
  - Dashboard: "Nothing needs you before kickoff · 1 league with notes".
  - Lineup tab: "Nothing needs you before kickoff".
- **Shorter items:**
  - "Activate Ja'Marr Chase from IR on Sleeper" (was "… on Sleeper before kickoff"; the title already says "before
    kickoff").
  - "Activate George Kittle from IR: no longer eligible, and it blocks your adds and drops" (was "…: he's no longer
    eligible there, and Sleeper blocks adds and drops until you do").
- **The footer link** reads "**Sync All again** to get the latest injury news and your current Sleeper lineups for
  every league."
- **The Lineup tab's box folds:**
  - Its title line is a button with a chevron. Tap it to fold the box to that line, which then shows the count
    ("This lineup needs you · 3").
  - Folded is remembered across visits and leagues, until you tap it again.
  - With only the Sleeper fold, the title reads "Set this lineup on Sleeper".

**What changed and where.**
- `js/mls/render/lineup.js` (`setPlayerLockState`): writes `manualStartersMap` / `manualBenchMap` with the lock list.
- `js/mls/lineup/issues.js`: `note` on IR moves; `needsYou` skips notes; the shorter texts.
- `js/mls/lineup/gameInfo.js`: the title button, `toggleLineupNeeds`, the titles.
- `js/mls/render/dashboard.js`: the titles and the footer link.
- `css/mls.css`: the title button and chevron; the phone layout of `.mls-needs-line`.
- **New key `mls_lineup_needs_collapsed`** (`KEYS.mls.lineupNeedsCollapsed`, '1' while folded), read into
  `State.lineupNeedsCollapsed`.
- `js/mls/main.js`: the `toggleLineupNeeds` action.
- `lineup/index.html`: the Guide's mention of the link.
- CHANGELOG updated. `CACHE_NAME` stays v2.8.91.

**Tests.**
- The padlock: the weekly-locks spec now checks the LOCKED badge after a same-week reload. It failed before the fix,
  the bug shown on main in round 5.
- The fold: a new test in `tests/mls-lineup-needs.spec.mjs` (fold, count, kept across a reload, unfold).
- Notes don't count: the IR-rules test and the unit tests.
- Phones: the 375px test now checks each league's button sits under its items and inside the box.
- `tests/mls-keyboard.spec.mjs`: Tab reaches the box's title, then Find RB, then Unlock All.
- Unit tests and the S9 test updated for the new texts.

**Screenshots.** The same six PNGs as round 4 (now with these changes): `mls-league-setup`, `mls-league-lineup` and
`mls-league-guide`, both widths. Main and this branch rendered here differ in exactly those.

**Runbook card added for the owner's #2 (round 4): S12**, a phone Dashboard with one card per league. See the
runbook.

### S11, round 7: unmatched manual names, a one-line Sync All message, then the PR (owner's choices)

**Why.** In the last review as a user:
- Since the Auditor's removal, a manual-league player whose name Sleeper doesn't know gets no injury check, and
  nothing says so. The Auditor reported "N unmatched". The owner noted the Add Player autocomplete makes it rarer, but
  wanted a fallback.
- Sync All's message had grown to four parts on four lines, too long on a phone.

**User-visible effect.**
- After Sync All, a manual league with a name Sleeper doesn't know shows a note in both boxes: "No injury news for
  Zack Nobody: name not found on Sleeper" (several: "Zack Nobody and Kenneth Walker: names …"). It's greyed out like a
  kept starter and not counted. It goes once the player is removed or matches at the next Sync All.
- Sync All's message is one line:
  - "Synced 2 leagues + 1 manual · 1 with roster changes · 2 lineups need you";
  - with only manual leagues: "Checked injuries in 1 manual league · …";
  - with nothing else to say, still "Successfully synced 2 leagues!";
  - a failed league keeps its own sentence, with the rest on a second line.

  The Sync Logs still open by themselves, and the box lists the lineups.
- Optimize All: "Optimized 5 lineups · 2 need you" (no "(listed under the buttons)").

**What changed and where.**
- `js/mls/leagues/manualInjuries.js`: `refreshManualInjuries` records `injuryUnmatched` (names) on each manual league.
  It's a field on the stored league, not a new key.
- `js/mls/lineup/gameInfo.js`: `getLineupIssues` passes the names still on the roster.
- `js/mls/lineup/issues.js`: an `unmatched` note item.
- `js/mls/render/dashboard.js`: the summary built from parts.
- `css/mls.css`: the note's muted style.
- CHANGELOG updated.

**Tests.**
- The manual-league test adds "Zack Nobody" and checks the note.
- The Sync All tests check the one-line message.
- `tests/mls-busy-spinner.spec.mjs` matches "Synced 2 leagues": the fixture's empty RB slot adds "2 lineups need
  you".
- A unit test for the note.

**Screenshots.** Unchanged from round 6's six. The PR's CI renders them (next).

### S11: the six screenshots re-taken from CI (PR #194)

Each is CI's own `-actual.png` from the `playwright-results` artifact (`gh run download`). In every run, each
`-expected.png` was identical to the committed baseline, and each run failed on exactly the PNGs below and nothing
else (318 other tests passed). It took three runs: a test stops at its first failing shot.
- Run 37995181627: `{desktop,phone}/mls-league-setup.png`. Identical above the new "lineups need you" box ("1 lineup
  needs you before kickoff · Fixture League · RB slot is empty · Find RB", the "Sync All again" line). Below it, the
  same content is 154px (desktop) / 195px (phone) lower, with anti-aliasing differences and the fixed bottom nav
  drawn over different content.
- Run 37996021538: `{desktop,phone}/mls-league-lineup.png`. The "This lineup needs you" box above the lineup (RB slot
  is empty, Find RB). The Global Injury Auditor card is now the one-line pointer, so the page is shorter (desktop
  3112 → 2976px, phone 3026 → 2886px).
- Run 37996843439: `{desktop,phone}/mls-league-guide.png`. The lock line ("Manual locks (and swaps, which lock) last
  for the week…"), step 7 "Lineups that need you" and the legend's box sample (desktop 6229 → 6350px, phone
  12707 → 12930px).

## S12 — A phone Dashboard: one card per league

**User-visible effect.** The Dashboard's League Command Center lists your leagues as cards, one per league, in your
league order, at every width. Each card holds everything about that league, so each league shows once:
- **Header:** a chevron that folds the card, the league's name (tap it to make it the active league; the active one
  has the table's green edge), its format and last sync ("Redraft 1QB PPR · Synced 4 days ago", amber when old, red
  when the last sync failed), and ▲ ▼ ✕ (reorder, remove, with the same confirm naming the league).
- **Status row:** a chip each for **Rankings** (Weekly rankings fresh in the last 6 days: green; stale or missing:
  amber) and **Lineup** (matches Sleeper: green; differs: red; not optimized yet: grey; no Sleeper lineup on record
  yet: amber), EARLY or BB as before, then "2 to do" (amber) and "1 upgrade" (green), which stay readable with the card
  folded. Each chip carries a word, so a phone shows what it's about without hover, and tapping it opens the
  table's tooltip text, under the status row so it never runs off the screen.
- **Body:** the league's to-dos from S11 ("Needs you · Sun 1:00 PM", one item per line, Open lineup / Find RB), its
  Sleeper changes in a fold ("Differs from your Sleeper lineup: 4 changes"), and its Best Available section from S5
  (open when the league has an upgrade, folded otherwise, with View, ×, Restore and, on desktop, the Sleeper link). A
  manual league's card says why it has no best available. On a wide screen the to-dos and best available sit side by
  side; on a phone they stack.
- **Above the cards:** the box under Sync All / Optimize All is now one line ("2 lineups need you before kickoff · 1
  to set on Sleeper", ✕, "Sync All again"); its ✕ hides the cards' to-dos for the session until another league needs
  you, or the next Optimize All or Sync All, as before. Then a toolbar: "Best available by [Weekly | ROS]", the summary
  ("Upgrades in 2 of 5 leagues") and **Fold all / Unfold all**.
- **Gone:** the League / Rankings / Lineup / Settings table, the box's per-league lines and its Sleeper drop-down, and
  the Best Available card (its tooltip text moved into the Command Center's (i)).
- At 375px and 390px nothing runs past the edge, names are whole (they wrap between words), and every button sits
  inside its card.

**Owner's decisions (asked before building, with a sketch).**
1. **Phones only or desktop too:** I suggested phones only, up to 600px. The owner asked whether it would make more
   sense to have it all fit in one League Command Center, consistent everywhere. I took that as **cards at every width**:
   the table, the box and the Best Available card go on desktop too, and a wide card puts its to-dos and best available
   side by side.
2. **What each card holds:** status chips, S11's to-dos and buttons, its Sleeper changes (folded) and its Best
   Available line, as I proposed. The owner added: **every card can fold, even with to-dos**, to move through many
   leagues quickly. Folding is remembered per league (new key below), and I added Fold all / Unfold all for the same
   reason. A folded card keeps its header, chips and counts, so a new to-do still shows.
3. **The separate box and the Best Available card go:** yes (my recommendation). The box's header stays as the strip.
4. **Order:** your league order (▲▼), not soonest kickoff first. Urgency shows as the strip's count, an amber border
   on each card that needs you, and the kickoff time (amber within a day).

**What changed and where.**
- `js/mls/render/leagueCards.js` (new, in `PRECACHE_ASSETS`): `renderLeagueCards` (the cards, the strip, Fold all),
  `leagueStatus` (the table's Rankings / Lineup / EARLY / format / sync logic, moved from `renderLeagueManager`),
  `toggleLeagueCard`, `foldAllLeagueCards`. A redraw keeps focus on the same control (or the league's name), each
  card's Sleeper fold state, and its Best Available section until that redraws (no flash).
- `js/mls/leagues/sync.js`: `renderLeagueManager` now calls `renderLeagueCards` (all its callers unchanged); the table
  code and its imports are gone.
- `js/mls/render/dashboard.js`: `collectLineupNeeds` (exported) returns the lines in league order plus `byLeague`, so
  the strip and the cards read one computation per render. `leagueNeedsHTML` / `leagueSleeperFoldHTML` (the box's line
  markup, per card), `lineupNeedsHidden` (the ✕ rule), `renderLineupNeeds` draws the strip. ✕, Optimize All and Sync All
  redraw through `renderLeagueManager`.
- `js/mls/scout/bestAvailable.js`: `renderBestAvailable` fills each card's `.mls-lc-ba` and upgrade count, the toolbar's
  switch and summary; `leagueSectionHTML` replaces the line (a fold whose state survives redraws unless the league
  gains or loses an upgrade). `toggleBestAvailable` and the "Show N more leagues" fold are gone. The upgrade rule,
  dismissals and View are unchanged.
- `js/mls/lineup/issues.js`: `needsYouCount` (the "2 to do" count; `needsYou` uses it).
- `js/mls/badges.js`: `leagueStatusChipMarkup` (the chip; legend sample from the same helper). `js/mls/legend.js`: the
  status line now shows the chips; the sync-age sample drops `.mls-ba-sync`.
- `lineup/index.html`: the strip, toolbar and `#leagueCards` in place of the table; the Best Available card removed;
  the Command Center's (i), Guide steps 2 and 7.
- `css/mls.css`: `.mls-lc-*` (cards, chips, toolbar), `.status-pending`; the Best Available and needs rules trimmed to
  what the cards use; the old `.mls-league-row-btn` and `.mls-ba-more` rules removed.
- **New key `mls_league_cards_collapsed`** (`KEYS.mls.leagueCardsCollapsed`): the ids of folded cards, removed when
  none is folded. `mls_best_available_collapsed` is no longer read but stays in `keys.js` (no key removals before 6C).
- `js/mls/main.js`: actions `toggleLeagueCard`, `foldAllLeagueCards`; `toggleBestAvailable` removed.
- CHANGELOG: a new line, and the S5 and S11 Unreleased lines updated to the cards. `CACHE_NAME` v2.8.91 → v2.8.92.

**One behavior change in the status.** The table showed a red "Differs from your Sleeper lineup" icon for a synced
league with no Sleeper lineup on record (the fixture league, for one), though there was nothing to compare. The card
shows an amber Lineup chip, "No Sleeper lineup to compare yet: Sync All gets it". Red now means exactly that the
card has Sleeper changes to show (`getSleeperLineupChanges`, the same comparison as before).

**Tests.**
- `tests/mls-league-cards.spec.mjs` (new, both projects): two fixture leagues at **375px and 390px**: one card each in
  league order, each name once in the Command Center, the strip's count, each card's chips and tones, meta, "1 to do",
  to-dos, Sleeper fold, Best Available section; no overflow (page and every element), names whole, every button inside
  its card; the Lineup chip's tooltip opens on a tap and stays on screen; Open lineup works. Then **reorder** (▲ keeps
  focus on the league, storage order), **switch** by name, **fold** a card with to-dos (header, chips and count stay;
  remembered across a reload and a redraw), **Fold all / Unfold all** (key removed), a **manual league's** grey and
  amber chips and no-best-available line, and **delete** via the confirm dialog. And at 1280px the to-dos and best
  available sit side by side, stacking at 375px.
- `tests/mls-lineup-needs.spec.mjs`: reads the to-dos from the cards (league order now, so the kickoff test checks
  order stays and the amber time), the Sleeper fold in the card with the red chip, ✕ hiding the cards' to-dos.
- `tests/mls-best-available.spec.mjs`: the sections in the cards: empty states (no leagues: no Command Center; only a
  manual league: its note, no switch), open/folded by upgrade, the counts, the sync age in the header, a folded card
  remembered (replacing the card's collapse).
- `tests/mls-rename-ranking-set.spec.mjs`: the Best Available source label in the card.
- The tooltip test caught a real problem: the site-wide tooltip hangs left from its trigger, so a chip's tooltip ran
  51px off a phone's left edge. The status row now anchors its tooltips (`css/mls.css`).

**Screenshots: six change, to be re-taken from the PR's CI run.** This container can't render CI-matching baselines
(F1, S9). Rendered here, main and this branch differ in exactly these six (`npm run pxdiff`); the other 34 are
pixel-identical:
- `{desktop,phone}/mls-league-setup.png`: the Command Center as cards: the strip ("1 lineup needs you before
  kickoff"), the toolbar (Weekly | ROS, "1 league without rankings", Fold all) and the Fixture League's card (amber
  Rankings and Lineup chips, "1 to do", "RB slot is empty · Find RB", Best available open with its Upload button and,
  on desktop, the Sleeper link). The table and the Best Available card are gone (desktop 2639 → 2461px, phone
  2934 → 2761px here).
- `{desktop,phone}/mls-empty-setup.png`: no Best Available card with no leagues (the Command Center was already hidden;
  desktop 2067 → 1903px, phone 2185 → 2005px here).
- `{desktop,phone}/mls-league-guide.png`: Guide steps 2 and 7's new text and the legend's status-chip line.

No PR is open yet, so CI hasn't run. Once one is: let its first run fail on these, and commit CI's renders ("Accepting
an intended visual change" in `docs/TESTING.md`).

**Left over.**
- The six screenshots above, from the PR's CI.
- With many leagues the list is long; Fold all and the per-card fold are the answer for now. A "show only leagues
  that need me" filter was not asked for.
- The Best Available card's old collapse key (`mls_best_available_collapsed`) is unread; remove it with the other
  key work after 6C if wanted.

### S12, round 2: FLEX picks without FLEX ranks (a bug), and "Show" on the strip (owner's requests)

**The bug** (found by the owner in "Fantasy Leftovers", with a backup; likely older than S12, fixed here because the
cards are about lineups that need setting). The league's Weekly rankings were per-position files, so nobody had a
FLEX rank. For FLEX slots, `compareFlexCandidates` (js/mls/render/lineup.js) then compared any two players by Sleeper
projection, same position or not, ranked or not. So the lineup started Kendrick Bourne (WR55, 8.6 projected) over
Treylon Burks (WR53, 3.5), and an unranked Kyle Pitts (7.7) in a FLEX slot (relabeled to SFLEX by kickoff) over ranked
WRs. Traced from the backup: FLEX 2 and 3 went to Bourne and Pitts by projection; Gadsden (TE24) took SFLEX.

**The owner's rule:** FLEX rank, then any rank, then projected points; projections decide between different positions
(a TE24 isn't necessarily better than a WR50).

**The fix.**
- `js/mls/lineup/flexChoice.js` (new, pure, in `PRECACHE_ASSETS`): `pickFlexStarter(candidates, projOf)`.
  1. Anyone with a FLEX rank: the best FLEX rank (as before).
  2. Else, among ranked players: the best-ranked left at each position (so WR53 always before WR55, whatever they
     project), then the higher projection among those leaders. A projected player beats an unprojected one; with no
     projection, the better position rank.
  3. Else (nobody ranked): the higher projection.

  Also `bestBy`. The order is a strict lexicographic one, so the pick doesn't depend on roster order (the old pairwise
  mix of rank and projection could have formed a cycle).
- `optimizeLineup` uses it for W/R, W/T, FLEX and SFLEX's RB/WR/TE step (a QB with a position rank still comes first in
  SFLEX, and SFLEX still never takes an unranked RB/WR/TE). Strict slots are unchanged.
- `fillLineup` (js/mls/scout/waiverScanner.js), the copy Auto-Find, Check a List and the Dashboard's Best Available use
  for "would he start?", uses the same function. It never used projections before, and now takes each candidate's
  `proj` from a new optional `projOf` dep (`lineupCheckDeps` in waivers.js passes `getLineupProjection`). So the
  optimizer and the waiver tools agree again.
- With the backup's league (projections from the owner's screenshot, run through `fillLineup`), the rule gives: FLEX
  Luther Burden (the one FLEX rank left), Oronde Gadsden (TE24, 7.0, over Burks WR53, 3.5) and Burks, then SFLEX
  Kendrick Bourne (WR55, next at WR). Burks now starts before Bourne, and Pitts (unranked) sits.

**Tests** (rule 4: the spec first, failing on the old code). `tests/mls-flex-choice.spec.mjs`: the fixture league
with two FLEX slots, position-only Weekly ranks and routed projections. Before the fix FLEX went to A.J. Brown (WR6,
30 projected) and George Kittle (unranked, 20); after it, Trey McBride (TE2, 6) and CeeDee Lamb (WR3, 2).
`tests/unit/flexChoice.test.mjs` (9): FLEX rank first, Burks over Bourne, ranked over unranked, leaders by projection,
the projection fallbacks, order independence, and `fillLineup`'s FLEX and SFLEX.

**"Show" on the strip** (the owner asked how hard a link to the league needing attention would be; it's small, so it's
built). Next to "1 lineup to set on Sleeper" (or "2 lineups need you…"), a **Show** link with a down arrow scrolls to
that league's card. With several leagues it reads **Show next** and steps through them in league order, wrapping
around. A folded card unfolds (remembered, as its chevron would). A card whose only item is its Sleeper changes opens
that fold. Focus moves to the league's name. `jumpToLeagueNeeds` in render/leagueCards.js; the page's own
`scroll-padding-top` keeps the card clear of the sticky header. Spec: both cards folded, Show next goes to each in turn
and around again, unfolding each.

**Left over / noticed.**
- The Lineup tab's "Bench Priorities" order still sorts by FLEX rank, then position rank across positions. That's
  display only, and who starts is unchanged by it.
- The S11 swap suggestions ("start X instead?") pick the same position by rank first, then anyone by FLEX rank; no
  projections. Not changed.
- SFLEX leaves its slot empty rather than start an unranked RB/WR/TE (FLEX starts one). Pre-existing; not changed.
- `CACHE_NAME` stays v2.8.92 (this branch's bump). The six screenshots listed above still change; the strip in
  `mls-league-setup` now also has "Show".
- Seen once in the full run: `mls-display-ranks.spec.mjs` ("keeps the files' position ranks…", desktop) failed with
  "Execution context was destroyed": its setup reloads the page and the next `callApp` can land mid-reload. It passed
  12 of 12 on repeat (`--repeat-each=6`); it doesn't touch the Dashboard. A follow-up could wait for the load after
  that reload.

### S12, round 3: one slot rule everywhere, SFLEX, and players whose game has started (owner's requests)

**Asked:** make the S11 "start X instead?" suggestions consistent with round 2's rule; have SFLEX use projections
too; and explain why the Dashboard said "Mike Washington over Zay Flowers" in "How I Met Your Punter" while Auto-Find
(FLEX) said he'd replace George Kittle (backup and Sleeper username supplied).

**The mismatch, traced** (backup, plus Sleeper's week 5 matchup for the league: Chris Godwin, TB, already had 5.5
points from Thursday). Auto-Find checks your saved lineup. Best Available builds a fresh best lineup from the whole
roster (S5 round 7), and its deps (`lineupCheckDeps`) counted every player whose game had kicked off as locked in,
bench players too. So the benched, unranked Godwin was locked into a WR slot. That pushed Nabers to W/T and Flowers to
FLEX, and left Kittle out of the lineup it compared against. With Washington added, Flowers was the one left out.
Rerun on the backup with the fix, both say Kittle. The optimizer itself only auto-locks a kicked-off *starter*, but it
let a kicked-off bench player be picked to start, which Sleeper won't allow.

**What changed.**
- **One rule for a player whose game has kicked off:** `kickoffFreeze(league, p)` in `js/mls/lineup/gameInfo.js`
  returns 'in' if he started (Sleeper's last-synced lineup; with none, the saved lineup, as the auto-lock always read
  it), 'out' if he didn't, and null before kickoff or when you overrode the auto-lock.
  - The optimizer auto-locks 'in' (as before) and now holds 'out' players out of the starter pool; they rejoin the
    bench.
  - `lineupCheckDeps` uses it: `isLocked` only for 'in', and a new `cannotStart` for 'out'. `bestLineup` leaves those
    players out, as it does taxi players; `checkAgainstLineup` counts them unavailable.
- **One slot rule:** `pickForSlot(slotType, candidates, projOf)` in `js/mls/lineup/flexChoice.js`:
  - strict slots by position rank;
  - W/R, W/T and FLEX by `pickFlexStarter`;
  - SFLEX: a ranked QB first, then a ranked RB/WR/TE by `pickFlexStarter`, then **anyone it takes by projection**.
  `optimizeLineup` (its fillSlot and the SFLEX loop are now one fillSlot over the slot order) and `fillLineup` both
  call it, with the available players first and everyone as the fallback.
  - **SFLEX bug 1:** with nobody ranked left, SFLEX stayed empty. Now it takes the higher projection.
  - **SFLEX bug 2,** found while doing this: the QB step ran the "unavailable as a last resort" fallback on its own, so
    an Out ranked QB beat a healthy ranked RB/WR/TE. Now availability applies to the slot as a whole.
  - The owner kept "a ranked QB first" in SFLEX (F1's scope note). Projections don't decide QB against FLEX while a
    QB is ranked; say if they should.
- **"Start X instead?"** (`lineupIssues` in `js/mls/lineup/issues.js`): the swap is `pickForSlot` over the healthy
  bench players the slot takes, with projections (`projOf` in ctx, from `getLineupIssues`). It used to take his own
  position first, then the best FLEX rank. In a FLEX slot that's now whoever the optimizer would start: an injured WR's
  FLEX spot can go to a better-ranked RB. Strict slots still take only their position.
- `js/mls/scout/waivers.js`: `lineupCheckDeps` as above (its own `hasKickedOff` / override check moved into
  `kickoffFreeze`).

**Tests** (each bug shown on the old code first).
- `tests/unit/flexChoice.test.mjs`: SFLEX with nobody ranked (empty before), a healthy ranked WR over an Out ranked QB
  (the QB before), and `pickForSlot` per slot type.
- `tests/unit/lineupIssues.test.mjs`: the swap in a FLEX slot by the FLEX rule (before: "his position first"); no
  FLEX ranks (leaders by projection, rank within a position, ranked over unranked); SFLEX.
- `tests/unit/waiverScanner.test.mjs`: the old "a QB with no rank never fills SFLEX" is now "SFLEX takes him" (the
  owner's change).
- `tests/mls-flex-choice.spec.mjs`: SFLEX with nobody ranked left takes A.J. Brown (30 projected; empty before). Then,
  with his game (PHI) kicked off and him not in your Sleeper lineup, it takes Kittle instead.
- `tests/mls-best-available.spec.mjs`: a benched Puka Nacua whose game has started doesn't change "over CeeDee Lamb
  WR4" (before: the line changed, as in the owner's league).

**Left over.** Screenshots: unchanged from round 2's six. The fixture lineups have no unranked SFLEX and no kicked-off
games.

### S12, round 4: a quieter Command Center, and Lineup Strategist v2.15.0 (owner's go-ahead after my review as a user)

**Why.** I loaded the owner's backup (21 leagues) into the app at 390px and 1280px and reviewed it as a user. Liked:
one place per league, chips with words, counts that survive folding, Show next, desktop's side by side, Best Ball
leagues still getting upgrades, and lines that now agree with Auto-Find. Disliked, worst first:
1. Length: about 5,100px on a phone (six screens); about 10 cards had nothing to do and still took a full card.
2. The Sunday job ("9 lineups to set on Sleeper") sat behind a fold in each card, and those cards got no "to do"
   count or border.
3. ▲ ▼ ✕ on every card (63 buttons, 21 red ✕s) for once-a-season actions, squeezing names.
4. "Synced today" ×21 and "Weekly · Wk5" on every best available line.
5. "3 upgrades" in Slow Mock Draft that were three options for one spot (all "over Kenny Gainwell").
6. On desktop the left column was mostly empty when the only to-do was the folded Sleeper line.

**Owner's decisions.**
- Build 1–5 as proposed.
- On #4: keep the rankings set's own name ("Wk5" is the name the owner gave that upload); drop only the repeated
  "Weekly".
- Bump the visible version: Lineup Strategist **v2.15.0**. The changelog's Unreleased list, everything since v2.14.0
  (S1 through S12), becomes v2.15.0 — 2026-10-11.

**User-visible effect.**
- **Quiet cards fold.** A card with nothing to do starts folded to its header: no to-dos, no Sleeper changes, no
  upgrade, no rankings to upload while no league has any. Your own fold or unfold of a card wins and is remembered;
  Fold all / Unfold all set every card. "Show" unfolds the card it goes to, remembered as an unfold.
- **Sleeper changes inline.** They're one more item in the card's to-dos, in amber: "Start Terry McLaurin · Bench
  Jacory Croskey-Merritt" under the label "Set on Sleeper" when that's all there is, or "On Sleeper: Start …" beside
  other items. One Open lineup button serves both. They count toward "N to do" and the amber border. This also fixes
  #6: on desktop the left column holds the line.
- **Reorder mode.** ▲ ▼ ✕ show only after tapping **Reorder** in the toolbar (it reads **Done** while on; in memory,
  so it starts off on every visit).
- **Less repetition.**
  - The header shows the sync only when it's old, unknown or failed.
  - Best available shows the set's name alone ("Wk5", "9/15/2026"), or nothing for a legacy upload. A fallback still
    says "Weekly · Wk5 (no ROS set)".
- **Shared targets.** Upgrades that would replace the same player (or fill the same empty spot) count once ("1
  upgrade"), and the line says "2 options for one spot: each over Puka Nacua WR4" above the players instead of
  repeating it on each.
- **Footer:** "My Lineup Strategist v2.15.0".

Checked again on the backup: Legends of the Pocket Dynasty, Late Round Lame Legends, May the Receptions Be With You
and LRD Cucks start folded; the 9 Sleeper leagues show their changes inline. The page is no shorter on this Sunday
morning, because those 9 lines are now visible rather than folded; on a quiet day it is.

**What changed and where.**
- `js/mls/render/leagueCards.js`:
  - `readFolds` / `writeFolds`: `KEYS.mls.leagueCardsCollapsed` now holds `{ folded, open }` (round 1's array, which
    the owner's live data has, is read as folded).
  - `applyDefaultFolds`, run after each draw and by `renderBestAvailable` once upgrades are known (through main.js).
  - Reorder mode (`toggleLeagueReorder`); the sync note rule.
- `js/mls/render/dashboard.js`: `leagueTodoHTML(line, sleeper)` replaces `leagueNeedsHTML` and
  `leagueSleeperFoldHTML`.
- `js/mls/scout/bestAvailable.js`: `sourceLabel` without the type; `target` on each upgrade, `upgradeCount` by
  distinct target, the `.mls-ba-shared` note.
- `lineup/index.html`: the Reorder button; the (i) and Guide step 2 mention Reorder and folding; the footer version.
- `css/mls.css`: the toolbar buttons, the Sleeper item, the shared note. `js/mls/main.js`: the
  `toggleLeagueReorder` action, the `applyDefaultFolds` re-export.
- CHANGELOG: the v2.15.0 heading, the cards line rewritten for what ships, and the S11 line's drop-down sentence.

**Tests.**
- `mls-league-cards.spec.mjs`: Reorder mode around ▲▼ and ✕; the Sleeper changes as a to-do item ("2 to do", one Open
  lineup); the `{ folded, open }` key; a quiet manual league starting folded, and opening it remembered.
- `mls-lineup-needs.spec.mjs`: the Sleeper test reads the card's to-do item.
- `mls-best-available.spec.mjs`:
  - the source labels;
  - no "Synced today";
  - `openFold` opens a folded card first;
  - new: two upgrades over the same player counted once and said once (a third free agent, WR3 over WR4, isn't an
    upgrade under S5's 3-spot rule).
- `mls-rename-ranking-set.spec.mjs`: the source label is the set's name.

**Noticed, not changed.** A lineup saved before an optimizer change isn't recomputed until its rankings change or
you optimize. So after this deploys, the owner's saved Fantasy Leftovers lineup (from before round 2's FLEX fix)
still says "Start Kendrick Bourne, Kyle Pitts" on Sleeper until Optimize All runs. Tapping Optimize All Lineups once
after the deploy fixes every league. An automatic one-time re-optimize (a rules version in the lineup stamp) is
possible; I've offered it.

**Screenshots (round 4).** Rendered here, main and this branch still differ in exactly the six PNGs listed in round 1.
They now also show the Reorder button, no "Synced today", and v2.15.0 in the footer (`mls-empty-setup`,
`mls-league-setup`); `mls-league-guide` has Guide step 2's new text. All six are to be re-taken from the PR's CI run.
Checks: 328 passed; the 10 that fail are `visual.spec.mjs`'s screenshots, which this container can't render to CI's
baselines (as on main).

### S12, round 5: projections for Optimize All, amber only for real problems, the strip's next step (owner's go-ahead after my second review as a user)

**Why.** I loaded the owner's newest backup, tapped Optimize All on the Dashboard (as they would after the deploy) and
read every card.
- **The good:** the Sleeper lines read as instructions; quiet Best Ball leagues fold; names get the full width; "2
  options for one spot" reads right. I also checked that Fantasy Leftovers starting Bourne and Pitts is correct for
  the new Wk5 set: Bourne is WR43 with a FLEX rank (91) and Pitts is TE25.
- **Found:**
  1. **Optimize All from the Dashboard ran without projections.** They loaded only with the Lineup tab. All 14 lineup
     leagues were marked projection-less, and when projections arrived only the active one was redone. Since round 2,
     projections decide FLEX picks between positions when there's no FLEX rank.
  2. **Amber everywhere:** 13 of 14 cards were amber with "1 to do", nearly all just Sleeper differences.
  3. **The strip's second line** ("Sync All again to get the latest injury news…") wasn't the next step.
- The owner said build 1–3.

**What changed.**
1. **Projections first.**
   - `ensureLineupProjections()` (js/mls/lineup/gameInfo.js) loads this week's Sleeper projections if they aren't in
     yet. It never throws: a failure leaves the position-rank fallback.
   - Optimize All awaits it before its loop. Sync All loads it alongside the player map.
   - `reoptimizeProjectionlessLeagues()` (js/mls/render/dashboard.js, re-exported by main.js) quietly re-optimizes
     every league in `State.projectionlessLineups` other than the active one. Locks are kept, as in Optimize All's
     loop, and the active league is restored with `switchActiveLeague`. `refreshLineupStats` calls it once projections
     are loaded; the active league keeps its existing redo there.
   - This touches Optimize All and Sync All, which the card had out of scope; the owner approved it.
2. **Amber only for what needs you before kickoff.**
   - A card's amber border and "N to do" count only its S11 items.
   - Sleeper changes show "1 to set" in muted text (`.mls-lc-count-sleeper`). The item itself is in the main text
     color, and a Sleeper-only card's "Set on Sleeper" label is muted.
   - On the backup after Optimize All: 0 of 21 cards amber (nothing needed them before kickoff) and 13 reading
     "1 to set".
3. **The strip's next step.** With lineups to set it reads "Set the lineups on Sleeper, then Sync All again to clear
   them." ("Set the lineup … clear it." for one). Otherwise it keeps "Sync All again to get the latest injury news…".

**Tests** (#1 shown failing on the old code first).
- `tests/mls-flex-choice.spec.mjs`:
  - "Optimize All from the Dashboard loads projections first": one FLEX slot, Lamb projected 10 against McBride TE2.
    McBride on the old code, Lamb now.
  - "projections that arrive late redo every league optimized without them": a second league, projections answering
    503 during Optimize All, then a Lineup tab visit. With the new hook off, the other league stays on McBride.
  - The `proj` option of `setup` was renamed `extraProj`; it shadowed the route's own variable.
- `tests/mls-league-cards.spec.mjs`: "1 to do" plus "1 to set", and the strip's line.
- `tests/mls-lineup-needs.spec.mjs`: the Sleeper-only card is neutral ("1 to set", no amber border), and the strip's
  line.
- CHANGELOG (v2.15.0): a line for the projections, and the cards line's counts and strip.
- `tests/mls-display-ranks.spec.mjs`: its per-position helper now waits for the reload to settle (`networkidle`, as
  the other specs do). The "Execution context was destroyed" flake noted in round 2 failed on both widths in this
  round's full run. With the wait, the spec passed 84 of 84 (`--repeat-each=6`).

**Checks.** 330 passed in the full run. Apart from the two `mls-display-ranks` failures (fixed above), the only
failures are `visual.spec.mjs`'s 10 screenshots, which this container can't render to CI's baselines. Screenshots: the
same six PNGs as before differ from main; the fixture's Dashboard has no Sleeper changes, so round 5 adds nothing
there.

### S12, round 6: injured players still starting on Sleeper, kickoff times for Optimize All, the toast, a shorter card (owner's go-ahead after my third review as a user)

**Why.** In the review I marked D'Andre Swift (How I Met Your Punter) Out in a copy of the backup and tapped Optimize
All.
1. **The urgent case looked routine (my round-5 regression).** The optimizer benched Swift, but he was still in the
   Sleeper lineup, and the card read "Set on Sleeper · Bench D'Andre Swift (Out)" as a neutral "1 to set". That's the
   old Global Injury Auditor's case.
2. **The toast contradicted the page:** "Successfully optimized 14 lineups!" over 14 lineups to set on Sleeper.
3. **A "Best available · Wk5 · No upgrade" row** in every card open for its to-dos.

**The owner's point on CeeDee Lamb and Dak Prescott** ("they played TNF; my updated rankings take them out; they
should be auto-locked"). That was the disconnect, and it came from this container: ESPN's scoreboard is blocked here,
so my review runs had no kickoff times, nothing was auto-locked, and the optimizer benched the unranked Lamb and Dak.
- In the backup every one of them is in the league's last-synced Sleeper lineup. Re-run with Dallas's and Tampa Bay's
  kickoffs on Thursday, they're all locked in, and three leagues drop off the list.
- In the owner's browser the kickoff times load at startup, but in the background, and Optimize All didn't wait for
  them. A tap before ESPN answered, or after it failed, would have benched them the same way. Fixed below.

**What changed.**
1. **Injured or bye players starting on Sleeper.**
   - `getSleeperLineupChanges` (js/mls/lineup/gameInfo.js) now returns `bench` as names, with `benchNotes` (his
     status when he's unlikely to play, or "on bye"; byes weren't noted before) and `urgent`.
   - `sleeperChangesHTML` shows a note as "(Out)" in the injury red (`.mls-needs-hurt`).
   - An urgent change makes the card need you: amber border, "1 to do" (not "1 to set"), the "Needs you" label and
     "On Sleeper: …" in the item. It counts in `collectLineupNeeds().needCount`, so the strip reads "1 lineup needs
     you before kickoff · 10 to set on Sleeper" and the toasts count it.
2. **Kickoff times and the toasts.**
   - Optimize All awaits `refreshGameTimes()` along with the projections; Sync All loads it with the player map. It's
     cached for the week, and a hang is cut at 12 seconds (`mdsFetch`).
   - Optimize All's toast adds "N to set on Sleeper" ("Optimized 14 lineups · 1 needs you · 10 to set on Sleeper";
     unchanged when there's nothing to say). Sync All's adds the same.
3. **No empty best available row.** In a card with to-dos, a best available that's folded by default (no upgrade) is
   hidden by CSS. A card with nothing else still shows it, so opening a quiet card still shows its best available.

On the backup (Swift Out; Dallas and Tampa Bay kicked off Thursday) after Optimize All: one amber card, 10 "1 to set",
and the toast "Optimized 14 lineups · 1 needs you · 10 to set on Sleeper". The phone page went from about 5,700px to
4,400px.

**Tests** (#1 and the kickoff wait shown failing on the old code first).
- `tests/mls-lineup-needs.spec.mjs`: the Sleeper test splits in two.
  - Routine changes stay neutral ("1 to set"), with the toast "Optimized 2 lineups · 1 to set on Sleeper".
  - An Out player starting on Sleeper needs you: the title, the "Needs you" label, "(Out)" marked, "1 to do", the
    amber border, and the toast "Optimized 2 lineups · 1 needs you · 1 to set on Sleeper".
- `tests/mls-flex-choice.spec.mjs`: ESPN down while the app starts and back by the tap. Lamb, in your Sleeper lineup
  and missing from the rankings, stays locked in. On the old code he's benched.
- `tests/mls-league-cards.spec.mjs`: best available is shown in a to-do card only with an upgrade.

**Left over.**
- A per-card "Sync this league" to clear a card after setting it on Sleeper (raised in round 5). The owner agreed to
  leave it for its own card.
- The kickoff times still load in the background at startup for everything else (the Lineup tab re-renders when they
  arrive, the Dashboard on its next render).

**Checks.** `npm run check`: precache OK, 328 unit tests pass, 336 Playwright tests pass; the 10 failures are only
visual.spec, which can't match the CI renderer in this container. Rendered here, main against this branch: the same six
MLS screenshots differ as in the earlier rounds (`{desktop,phone}/mls-empty-setup`, `mls-league-setup`,
`mls-league-guide`), all intended. Every other one is identical. They're re-taken from the PR's CI run.

### S12, round 7: best available waits for projections and kickoff times; "Open lineup" back at the right edge (owner's go-ahead after my fourth review as a user)

**Why.** In the review (the owner's latest backup, phone, Sunday 10:30 ET with Dallas and Tampa Bay played Thursday):
1. **Best available changed its answer for no visible reason.** Apex said "2 options for one spot: each over Kimani
   Vidal" on opening the Dashboard and "Darius Cooper over Jaylin Noel" after Optimize All, which changed no lineup;
   Slow Mock did the same. The projections only loaded with the Lineup tab, Optimize All or Sync All, so best
   available picked the weakest FLEX starter by rank alone until then (confirmed: `lineupProjectionsLoaded()` false
   before the tap). The kickoff times, which decide who's frozen in place, weren't awaited either.
2. **On desktop, a to-do card's "Open lineup" sat in the middle of the row.** My round 6 rule hid best available's
   fold in a to-do card with no upgrade, but its section kept its half of the row.

**The owner's decisions.** Build 1, and the button fix. Keep the red "Lineup" chip ("the icon is small... since a large
part of the app is setting lineups, the quick visual scan is nice") and the "Rankings" chip on every card. The per-card
"Sync this league" goes into the runbook as a card to revisit: **S13, "Sync one league from its card"** (Later, Asks
you whether it's wanted at all), with S12's decisions added to the runbook's "Your answers so far".

**What changed.**
1. `renderBestAvailable` (js/mls/scout/bestAvailable.js) awaits `ensureLineupProjections()` and `refreshGameTimes()`
   with the Sleeper player map (`Promise.allSettled`, so a failure of either just leaves today's fallback). The cards
   draw at once as before; their best available sections fill in when these arrive.
   - Both now share a fetch already on its way for the same week (`ensureLineupProjections` in
     js/mls/lineup/gameInfo.js, `refreshGameTimes` in js/mls/state.js), since the Dashboard redraws often and the
     startup fetch of the kickoff times can still be pending.
2. css/mls.css: in a to-do card, a best available section with no upgrade is hidden as a whole
   (`.mls-lc-todo + .mls-lc-ba:has(> .mls-ba-fold[data-default="false"])`), so the to-dos take the row.

**Tests** (both shown failing on the old code first).
- `tests/mls-flex-choice.spec.mjs`: "the Dashboard's best available uses projections from its first draw". Zay
  Flowers (free agent, WR1) is an upgrade over CeeDee Lamb only with projections (Lamb at FLEX over Trey McBride).
  On the old code: "No upgrade". The two Optimize All projection tests now keep Sleeper's projections at 503 until
  the tap (a `projUp` option on `setup`), since the Dashboard loads them itself now.
- `tests/mls-league-cards.spec.mjs`, "on a wide screen…": a to-do card with no upgrade has its to-dos across the
  whole row and "Open lineup" at the card's right edge (old code: half the row). The side-by-side check now uses a
  card that does have an upgrade; before, it was measuring the empty section.

On the owner's backup the Dashboard's best available now reads the same before and after Optimize All (Apex: "Darius
Cooper over Jaylin Noel" from the first draw).

**Checks.** `npm run check`: precache OK, 328 unit tests, 338 Playwright tests pass; the 10 failures are only
visual.spec (this container can't match CI's renderer). Rendered here, the screenshots are pixel-identical to round 6's,
so main against this branch differs in the same six MLS screenshots as before, all intended.

### S12, round 8: roster changes on each card after Sync All; a reason beside a routine bench change (owner's go-ahead after my fifth review as a user)

**Why.** The review ran a real Sync All on the owner's 21 leagues (read-only, 16 seconds): the strip went from 9
lineups to set to 1, which works. Two things didn't.
1. **"3 with roster changes"... which three?** The toast pointed at the Sync Logs, which open by themselves, but since
   S12 they sit under all 21 cards: about 4,700px down on a phone. (They were Mike Washington pickups in two leagues,
   best available's suggestion, and one in Gridiron Best Ball.)
2. **"Bench Ashton Jeanty" with no reason.** The one change left told the owner to bench his RB1: right (Jeanty is
   Questionable and not in Wk5), but unexplained, so you double-check everything.

**What changed.**
1. js/mls/render/dashboard.js: Sync All's log entries also record the league's id (no storage key changed), and the
   run's changes are kept in memory for the visit (`syncChangesFor`, `syncChangesHTML`). Each card
   (js/mls/render/leagueCards.js) shows its own under the status row, so a folded card shows it too:
   "Synced: + Zay Flowers · − Garrett Wilson · Derrick Henry (Out)", in the Sync Logs' colors (`.mls-lc-synced*` in
   css/mls.css). A newly out player reads "(Out)", not the log's "Out: … (OUT)"; another status stays ("(IR)"). After
   a reload the cards are quiet; the Sync Logs keep the history as before.
2. `getSleeperLineupChanges` (js/mls/lineup/gameInfo.js) returns `benchWhy` beside `benchNotes`: for a routine bench
   change, the player's status when it still lets him play ("Q") and/or "not in <set>" when the rankings the optimizer
   used (Weekly, else ROS) leave him out. The set's own name when it's short ("Wk5"), else "your Weekly rankings" (the
   default name, "Weekly Rankings – 9/15/2026", would crowd the line). `sleeperChangesHTML` shows it muted
   (`.mls-needs-why`); an urgent note stays red, and the change stays routine. The Lineup tab's drop-down says the
   same. `getLeagueRankings` is re-exported by js/mls/main.js for it.

**Tests** (both shown failing on the old code first), in `tests/mls-lineup-needs.spec.mjs`:
- "a routine bench change says why…": Kittle Questionable, Garrett Wilson left out of the rankings: "(Q)", "(not in
  your Weekly rankings)", then "(not in Wk5)" once the set is named Wk5; still "1 to set", no amber; the Lineup tab
  says the same.
- "Sync All's roster changes show on each league's card": between syncs Derrick Henry is ruled out and Zay Flowers is
  picked up for Garrett Wilson; the Fixture League's card says all three (folded too), the second league's only Henry,
  and after a reload only the Sync Logs do.

No legend line: these are text lines, not badges (tests/unit/badgeLegend.test.mjs agrees).

On the owner's backup after a real Sync All: 13 cards say what changed ("Synced: + Mike Washington · − Chris Godwin",
"Synced: Jordan Addison (Out)"), and the reasons read "Bench CeeDee Lamb (Q · not in Wk5)". (ESPN is blocked here, so
the Thursday players weren't locked; in the owner's browser they are.)

**A flake seen once, not from this change:** in one full run, `tests/mls-waiver-tiers.spec.mjs` "a Pos Rank column
shows the overall tier…" failed with "Execution context was destroyed" in `showTab` right after `seedMls` /
`loadMlsRankings` (the page was still navigating). It passed 6 of 6 alone, and this round doesn't touch that spec or
the code it runs. If CI hits it, the fix is the one mls-display-ranks got in round 4: wait for `networkidle` before
the first `showTab`. (Superseded: the real cause and fix are under "S12, pull request" below.)

**Checks.** `npm run check`: precache OK, 328 unit tests, 342 Playwright tests pass; the 10 failures are only
visual.spec (this container can't match CI's renderer). Rendered here, the screenshots are pixel-identical to round 7's
(the screenshot leagues never Sync All, and their Sleeper changes have no reasons to give).

### S12, round 9: Best Ball lineups lost their kicked-off players (a round 3 regression, found by the owner)

**What the owner saw** (Sunday afternoon, a preview of this branch on a phone): LRD Cucks' card said it had an empty
spot, though the roster has 16 of 16, and the Lineup tab had empty starting slots.

**Reproduced** with the owner's 3:11 pm backup and the real week 5 kickoffs (Sleeper's schedule:
`api.sleeper.app/schedule/nfl/regular/2026`; DAL–TB Thursday, PHI–JAX in the morning, nine 1 pm games under way).
LRD Cucks' Lineup tab showed six "[ Empty Slot ]" rows (QB, WR, TE, two FLEX, DEF), and best available offered free
agents in five best-ball leagues: "3 options for one spot: each fills an empty lineup spot". The saved lineups had the
holes: LRD Cucks 6, Slow Mock Draft 9, BB Ying 3, three others 1 each.

**Cause.** Round 3's `kickoffFreeze` (js/mls/lineup/gameInfo.js) keeps a player whose game has kicked off where he
is: 'in' if he started, 'out' (held out of the pool) if not. "Started" is Sleeper's lineup, or with none this app's
saved lineup. Best Ball has no Sleeper lineup (`getValidSleeperStarterIds` returns []: nobody sets one), so the saved
lineup stood in, and once a kicked-off player was missing from it he was 'out' for good: the next optimize saved his
slot empty. By the afternoon 11 of LRD Cucks' 16 players had kicked off, both QBs included (Kyler Murray is on
Minnesota now). Main doesn't have round 3, so the live site is fine.

**Fix.**
1. `kickoffFreeze` returns null in Best Ball: every player stays in the pool, as before round 3. That fixes the
   optimizer and best available (which uses the same rule).
2. js/mls/render/lineup.js: a saved lineup with an empty slot is rebuilt when it's shown, not re-shown as-is, so the
   lineups the bug already saved heal when opened. Optimize All skips Best Ball leagues, so without this they'd have
   kept their holes until a sync.

On the owner's backup LRD Cucks now opens full (Maye at QB, Watson, Warren and the Patriots "Started"), and no card
mentions an empty spot.

**Test** (`tests/mls-flex-choice.spec.mjs`, "Best Ball: a player whose game has kicked off still fills his slot, and a
lineup saved with a hole heals"): a best-ball league, Buffalo and Philadelphia kicked off, Josh Allen and A.J. Brown
missing from the saved lineup. Optimize: Allen at QB, no empty slot (before the fix: "QB:-"). Then a saved hole fills
on the next showing of the Lineup tab (fails without fix 2).

**Checks.** `npm run check`: precache OK, 328 unit tests, 344 Playwright tests pass; the 10 failures are only
visual.spec (this container can't match CI's renderer). Rendered here, the screenshots are pixel-identical to round 8's.

### S12, round 10: newly out players muted in the "Synced:" line (owner's choice)

From my sixth review as a user: after a real Sync All, 14 calm, folded cards carried a red line ("Synced: Jordan
Addison (Out)", a bench player), in the same red as a to-do's "Bench Will Shipley (Out)". The owner saw the side-by-side
(red now, muted proposed) and chose muted. css/mls.css: `.mls-lc-synced-out` is `var(--text-muted)`. Pickups stay
green; red stays for what needs acting on. Test: `tests/mls-lineup-needs.spec.mjs`, "Sync All's roster changes show on
each league's card", now checks the newly out name is the line's muted color, not the injury red (fails on round 9). Checks: precache OK, 328 unit and 344 Playwright tests pass (only visual.spec fails here, as
always); screenshots pixel-identical to round 9.

### S12, pull request (btrerise/My-Draft-Strategist#195): screenshots from CI, and the waiver-tiers flake's real cause

**Screenshots.** As planned, CI's first runs failed only on the six intended MLS PNGs (each test stops at its first
failing shot, so two runs). Each was taken from the run's `playwright-results` artifact after checking its
`-expected.png` was identical to the committed baseline and the change was S12's: `{desktop,phone}/mls-empty-setup` and
`mls-league-setup` (run 38169361425; the cards replace the table, box and Best Available card), and
`{desktop,phone}/mls-league-guide` (run 38169904585; Guide step 2's new text, everything below shifted). Phone heights
differ from this container's renders by a few lines of wrapping (CI's font is narrower); the content is the same.

**The flake was this branch's, and wasn't a navigation.** The second run also failed `mls-waiver-tiers.spec.mjs` "a Pos
Rank column shows the overall tier…" on phone, the "Execution context was destroyed" seen once locally in round 8.
- Reproduced: about 1 in 20 here (2 of 50, 4 of 50, 5 of 40); main 0 of 50. Bisected: round 1 0 of 60, round 2 1 of 60,
  every later round failing.
- No navigation: no load, unload, reload or form submit, only `#scout`'s `history.pushState`. Playwright's protocol log
  shows the browser's answer to the `page.evaluate`: `"Promise was collected"`. Chrome's garbage collector dropped the
  promise the evaluate was waiting on, and Playwright words that as a destroyed context. `callApp` (tests/helpers.mjs)
  awaited `import('/js/mls/main.js')` with nothing in the page holding that promise; round 2 made tab switches
  allocate more, so a collection inside that window became likely.
- First fix (tests only): `callApp` kept its `import()` promise on `window`. 200 runs of that test passed, but the next
  full run failed another test in the same spec the same way, and the whole spec under load still failed 2 in 120.
  So the promise collected wasn't (only) the import's: it was the evaluate's own, pending while the tab switch ran.
- Fix: `callApp` (tests/helpers.mjs) makes two calls. The first imports the module and keeps it on
  `window.__callAppModules`; the second calls the function synchronously, so no evaluate is waiting on a promise while
  the app works (a function that returns a promise is still awaited). The whole spec under load: 360 of 360.

**And a second race, in the tests' uploads.** CI's third run (38173606583) failed `mls-sos-scale.spec.mjs` "an SoS
column in a ROS rankings upload follows the switch…" on desktop: the saved SoS was empty. Here 1 in 80; main 0 in 120.
After one upload's preview closes, its "24 players parsed" stays in the hidden overlay, so the next upload's
`toContainText` passed at once, Save ran before the new preview existed and did nothing (the failure's snapshot shows
the upload button still disabled, its parse running). S12 makes the page busier during a parse, which widened it.
Fix: every wait for "players parsed" (`loadMlsRankings` in tests/helpers.mjs and six specs) first waits for the overlay
to be visible. 160 of 160 after.

Full check after both: precache OK, 328 unit and 344 Playwright tests pass (only visual.spec fails here).

## S16 — Smooth transitions between tabs and leagues

**User-visible effect.** Both apps animate between screens with the browser's View Transitions API, plain CSS and no
library:
- **Tabs:** on a phone (under 768px) the old tab slides 48px toward where you're going and fades while the new one
  slides in from the other side; wider screens fade through (the old screen fades out, then the new one fades in). 275 ms on phones, 375 ms wider. The header and the tab bar
  stay still. Every way of changing tab gets it: the tab bar, swipes, number keys, the menu drawer, Back and Forward,
  and the buttons that jump to a tab (Open lineup, Find RB, View, the setup checklist's jumps). Direction comes from
  the tab bar's order, Guide last (a swipe left is forward).
- **The tab bar's marker:** a short green bar along the top of the active tab-bar button, which slides to the new tab.
  On a tab that isn't in the bar (Draft Strategist's Setup, either Guide) there's no marker.
- **League switch (Lineup Strategist):** the page fades through to the new league and the league's name slides up in the
  header, when you switch yourself: the header's drop-down and ‹ › arrows, a league's name on a Dashboard card, Switch on
  a Scout result. Sync All, Optimize All, adding a league and the Dashboard's buttons that also change tab switch at
  once, as before.
- **League Command Center cards:** folding or unfolding a card, Fold all / Unfold all, Reorder / Done and ▲ ▼ grow, shrink
  and slide the cards (and what's below them) into place. The card's chevron turns at the same speed (it was 0.15s).
- **Toasts** already slid up and out; with Reduce Motion they now appear and go without moving.
- **Without the API** (older Safari and Firefox) everything switches as before, including the tab's old 0.3s fade-up.
  **With Reduce Motion** nothing animates: no transition starts and the switch is immediate.

**Owner's decisions (asked before building, with recordings and a branch preview).**
1. **Tab style:** a slide on phones and a fade on desktop (of slide, crossfade, or that mix).
2. **Speed:** 275 ms on phones, 375 ms on desktop (I'd suggested 200–250 ms).
3. **Extras:** (a) the sliding tab-bar marker, yes; (b) the league fade with the name sliding, yes; (c) the Dashboard cards,
   yes, after a second demo (it wasn't in the first, which the owner rightly noticed), with two fixes asked for: Fold
   all blinked black on the owner's phone (below), and the chevron should turn slower; (d) toasts: they already slid,
   so only the Reduce Motion fix; (e) a glow on the Guide's legend after "What do these mean?": built for the second
   demo, then **dropped** ("the navigation to that section is enough").
4. **After a review as a user** (round 3): the desktop fade and the league fade showed both screens at half strength for a
   moment (the same layout's text ghosting in place on a league switch). The owner chose **fade-through**: the old screen
   fades out over the first 40% of the time and the new one fades in after (`vt-fade-out` / `vt-fade-in` in css/base.css),
   for tabs on wider screens and every league switch. Phones keep the slide. The owner also asked for **S17**, a runbook
   card for speed (their PageSpeed Insights run: mobile Performance 69, FCP 3.7 s, LCP 6.0 s, a white first frame), added
   to the runbook on 2026-10-12.

**What changed and where.**
- `js/shared/ui/viewTransition.js` (new, in `PRECACHE_ASSETS`): `withViewTransition(update, { kind, direction, instant,
  onEnd })` runs `update` inside `document.startViewTransition` when the browser has it, the page is visible and Reduce
  Motion is off, else at once; it marks `<html>` with `data-vt` (tab / league / cards), `data-vt-dir` and `data-vt-busy`
  until the transition ends, and returns a promise that resolves once `update` has run. `tabDirection`, `vtName` (a
  view-transition-name from an outside id: letters, digits and "-" kept, anything else `_` plus four hex digits, so it's
  a valid identifier and unique per id), `placeTabMarker`.
- `js/mls/nav.js`, `js/mds/ui.js`: `showTab(tabId, skipHistory, { instant })` runs the old body (now `applyTab`) through
  the helper and returns its promise. Page load uses `instant`.
- Callers that scroll or focus inside the new tab wait for that promise: `openBadgeLegend` (both apps), `goToSetupStep`
  (both), `goToLineupNeeds`, `goToPowerRankings`, `scoutGoToLeague`. Without it, showTab's scroll to the top (now a frame
  later) undid their scroll.
- `js/mls/leagues/sync.js`: `switchActiveLeague(id, { animate })`; the body is `applyActiveLeague`. `cycleLeague` no
  longer sets the drop-down first (the switch does, inside the transition, so the old picture shows the old name);
  `selectActiveLeague` (main.js) puts the old value back before switching, for the same reason.
- `js/mls/render/leagueCards.js`: `withCardsTransition` for `toggleLeagueCard`, `foldAllLeagueCards`,
  `toggleLeagueReorder` and (from main.js) `moveLeague`. While it runs, each card is named `vt-lc-<league id>` (class
  `vt-card`), plus the Command Center box and what follows the list, so they move together; names come off when the last
  such transition ends.
- `css/base.css`, "VIEW TRANSITIONS": the durations, the header / tab bar / league-name names (only while `data-vt` is
  set, so nothing changes outside a transition), the phone slide keyframes, the cards' pictures clipped to their box
  instead of stretched, the marker, toasts under Reduce Motion. `css/mls.css`: the chevron's speed.
- CHANGELOG: lines under both apps. `docs/TESTING.md`: `transitionsDone`. `CACHE_NAME` v2.8.92 → v2.8.93.

**Things found on the way.**
- **Tabs weren't instant before:** `.tab-content.active` ran a 0.3s fade-up (`fadeIn`). Inside a transition it played a
  second time, and when the transition's attributes came off it restarted (a visible second fade in the first demo).
  With View Transitions the fade-in is cut to 1 ms (`@supports (view-transition-name: none)`). Not `none` or 0s: those
  leave the tab composited differently from a finished fade-in, and main's and this branch's screenshots then differed
  by 44 to 370,000 pixels of anti-aliasing on every screen, T-Score included. With 1 ms they're identical.
- **Fold all blinked black on the owner's phone.** Headless Chromium here never showed a dark frame, but the first
  version named every card and everything below the list, so the browser photographed the whole Dashboard several
  times over before animating: at a 4x CPU slowdown with 21 leagues that was 105–126 ms of long tasks before the first
  frame. Large pictures like that can run out of graphics memory on a phone and show black. Now only what's on or near
  the screen (half a screen above to one and a half below) is named, before and after the change, and the Command Center
  box only while it's under two screens tall. Same test: long tasks 50 ms, frames about every 25–35 ms on the phone
  size. **Owner: please check Fold all on your phone again**; if it still blinks, say which phone and browser.
- **Rapid taps:** a second `startViewTransition` before the first has drawn skips the first, but its update still runs,
  first. So three taps run three updates in order (three history entries, one announcement each, the work after each
  switch once), and the page ends on the last tab tapped. The spec checks it.
- **Tests read the DOM a frame too early:** two specs (`mls-keyboard`, `mls-lineup-needs`) evaluated the active tab
  straight after a key or click. `transitionsDone(page)` (tests/helpers.mjs) waits for `data-vt-busy` to clear; the
  `showTab` helper and `visual.spec`'s `shot()` call it. No spec turns transitions off.
- **Performance on phones (the card's check):** tab switches with 21 leagues at a 4x CPU slowdown, phone and desktop
  sizes: each switch has a 100–230 ms long task, and the same run with View Transitions removed has the same (85–232
  ms): it's each tab's own drawing (the lineup, the 21 cards), not the transition. During it the old picture stays on
  screen, then the slide runs. The root picture is only the viewport, so a long page doesn't make tab switches slower;
  only the cards needed limiting (above).

**Tests.**
- `tests/view-transitions.spec.mjs` (new, both widths): MLS: a tab tap starts one "tab" transition and ends on the tab;
  three taps in one go end on the last with three updates, three history entries and its announcement; the marker ends
  under the active tab; Back animates too; a switch from code (as Sync All makes) starts none; the header's arrow and
  drop-down start a "league" transition; a card's fold starts a "cards" transition with `vt-lc-<id>` on the card during
  it and no name after; with Reduce Motion no transition starts and showTab and a fold are immediate; without the API
  taps switch at once and the marker still lands. MDS: rapid taps end on the last tab, no marker on Setup; Reduce Motion.
  70 of 70 over five repeats.
- `tests/unit/viewTransition.test.mjs` (new): `tabDirection`, and `vtName` escaping, validity and uniqueness.

**Screenshots: the marker changes 22, to be re-taken from the PR's CI.** Rendered here, main and this branch differ
only by the marker (3px under the active tab-bar button, 141–633 pixels each) in these, at both widths; the others are
pixel-identical:
`mds-draft-board`, `mds-draft-team`, `mds-draft-tracker`, `mds-empty-board`, `mds-empty-team`, `mds-empty-tracker`,
`mls-empty-setup`, `mls-league-lineup`, `mls-league-roster`, `mls-league-scout`, `mls-league-setup`
(`{desktop,phone}/`). Unchanged: MDS Setup and Guide, the MLS Guide (not in the tab bar), all of T-Score. No PR is open,
so CI hasn't run; when one is, take CI's renders as in "Accepting an intended visual change" in docs/TESTING.md (each
test stops at its first failing shot, so it takes a few runs).

**Left over.**
- The 22 screenshots above, from the PR's CI.
- Draft Strategist has no league switch; switching drafts (the header's draft drop-down) isn't animated. Easy to add with
  the same helper if wanted.
- **Cross-page transitions** (between /, /lineup/ and /t-score/): possible with `@view-transition { navigation: auto; }`
  in CSS alone (same origin), in Chrome and Safari 18.2+. Small, but each page's header differs, so it needs its own look
  and a check that the service worker's cached navigations still animate. Worth a small card if you move between the apps
  often; I'd rate it low.

### S16, round 4: the league name in the header (owner's choice), and a softer fade (asked)

**The league name.** On phones the header's league drop-down was held to 130px (css/base.css, a `max-width: 130px
!important` shared with Draft Strategist's draft drop-down), so "Dynasty Champs 2026" read "Dynasty C", cut mid-letter: a
`<select>` can't end its text in "…". The rolling name in a league switch drew the eye to it. I showed three options with
pictures; the owner chose **B + C** and asked whether the width could follow the screen:
- **B:** on phones the small MLS logo button hides (the tab bar's Dashboard does the same) and the drop-down takes all the
  room the menu button and the arrows leave, at any width (168px at 320px, 238px at 390px). On desktop it fits the longest
  league name, up to 22rem. So it's dynamic both ways; the menu button is untouched.
- **C:** the name is drawn by a label laid over the drop-down (`#headerLeagueLabel`, `aria-hidden`; the drop-down's own
  text is transparent and its options keep their color), so a long name ends in "…". Tapping still opens the native
  picker; the drop-down keeps its `aria-label` for screen readers. `syncHeaderLeagueLabel` (js/mls/leagues/sync.js) sets the
  label wherever the drop-down's value is set (its render, a league switch, page load). The league-switch roll now animates
  the label.
- Where: lineup/index.html (the wrap and label), css/mls.css ("Header league picker"), css/base.css (the 130px rule now
  covers only `#draftProfileSelect`), js/mls/leagues/sync.js, js/mls/init.js. Draft Strategist's draft drop-down is
  unchanged (not asked).
- Found while measuring: the label measured a few pixels tighter than Chrome sizes the drop-down, so a name the drop-down
  fit still got "…" on desktop; the label's right edge has 7px of slack before the arrow.
- Tests: `view-transitions.spec.mjs` checks the label follows each league switch, and a new test checks a fitting name
  shows whole, a long one ends in "…" inside the drop-down, the drop-down stays left of the › button, and nothing runs
  past the screen (both widths).
- Screenshots: this changes the header in Lineup Strategist's screenshots (phones: no logo, a wider drop-down; desktop:
  the label's text); listed with the marker's when they're compared at the end of the card.

### S16, round 5: "soft + rise", and a bug in transitions to the Lineup tab on phones (found with the owner's data)

**The fade.** The owner found the fade-through jarring: the screen went dark mid-way. Measured, it dipped to the page
background (`#0a0e17`, rgb 7,12,20), which reads as black; what looks navy on screen is the cards (`--card-bg`, `#131b2c`).
I showed three versions side by side (today, "soft", "soft + rise"); the owner chose **soft + rise**: the old screen
fades out over the first 60%, the new one fades in from 25% while rising 8px (`vt-fade-in-rise`), and the backdrop
between them is the card navy (`::view-transition { background: var(--card-bg) }`). The middle of a switch now dims
the screen from a mean brightness of about 25 to 23 (the fade-through went to 11), with only a faint overlap. Desktop tabs
and every league switch; phones keep the slide (its backdrop is the card navy too).

**The bug: no transition into the Lineup tab on a phone.** The owner saw it on their phone and sent a backup
(my-lineup-strategist-backup-2026-10-12.json, 21 leagues). Loaded into a phone-emulated Chromium at its export time,
every switch to Lineup ended in 100–180 ms, too fast to have animated, while the others took the 275 ms plus their
drawing. The transition's `ready` promise rejected: "Transition was aborted because of invalid state". No duplicate
`view-transition-name` was on the page; the cause was the Lineup tab being **398px wide on a 390px screen**: the
Optimize / Copy / PNG row (`.lineup-action-row`) kept each button's 1.5rem side padding and wouldn't shrink. A mobile
browser widens the page to fit (the layout viewport grows) only while that tab shows, so the viewport changed size
between the two pictures and Chrome aborted the transition. It was on main too: the phone baseline
`mls-league-lineup.png` is 398px wide. Without mobile emulation (the specs' phone project) the page doesn't widen, which is
why the specs and my recordings never showed it.
- Fix (css/mls.css): up to 480px, the row's gap is 0.5rem and its buttons have 0.75rem side padding and may shrink. The tab
  fits at 320, 360, 375 and 390px, and with the owner's data every switch to Lineup now animates (380–490 ms), none skipped.
- Test first: `view-transitions.spec.mjs`, "Lineup Strategist on a phone (mobile emulation)" (390px, `isMobile`): taps
  through Roster, Lineup, Scout, Lineup, Dashboard and checks each tab is no wider than the screen and that no transition
  was skipped. It failed on this branch before the fix ("lineup tab is wider than the screen", 398 > 390).
- Screenshots: `phone/mls-league-lineup.png` changes (390px wide instead of 398, the buttons narrower); with the
  header's, re-taken from CI.

### S16, round 6: the page navy behind the fade, and a slower desktop fade (owner's choices)

The owner kept "soft + rise" but asked for **the page's navy behind it** (`--bg-color`, #0a0e17) instead of the card navy,
and **a slower desktop fade**. New variable `--vt-fade-ms` (css/base.css): the tab and league fades and the tab bar's
marker use it; **500 ms on wider screens** (was 375), the phone speed (275 ms) on phones. The Dashboard cards keep
`--vt-ms` (375 ms wider), since a fold at 500 ms felt slow in the recordings. Measured mid-switch, the screen dims from a
mean brightness of about 25 to 11 again (the card navy held it at 23), but more slowly and with the two screens briefly
overlapping, so it doesn't drop all at once.

### S16: the final screenshot comparison, before the pull request

Full check: precache OK, 331 unit and 361 Playwright tests pass (1 skipped: the phone-only mobile-emulation test on the
desktop project); only visual.spec fails, as it does here on main (this container can't render CI's baselines).

Rendered here, main and this branch differ in **24 PNGs, 12 per width**, each for one of three reasons; the other 16
(Draft Strategist's Setup and Guide, all of T-Score) are pixel-identical. This replaces the list of 22 in the first entry,
which was taken before rounds 4 and 5:
- **The tab bar marker** (3px under the active tab-bar button): `mds-draft-board`, `mds-draft-team`, `mds-draft-tracker`,
  `mds-empty-board`, `mds-empty-team`, `mds-empty-tracker` (189 px on phone, 633 on desktop).
- **The marker and the header's league label** (phones: no logo, the wider drop-down): `mls-empty-setup`,
  `mls-league-roster`, `mls-league-scout`, `mls-league-setup`; and `mls-league-guide`, where only the header changes (the
  Guide isn't in the tab bar).
- **`mls-league-lineup`**: the marker and header, and on phones the button row, so the PNG is 390px wide instead of 398.

All at `{desktop,phone}/`. To be taken from the pull request's CI renders ("Accepting an intended visual change").

### S16, pull request (btrerise/My-Draft-Strategist#196): the 24 screenshots from CI in one run

The owner asked whether there was a faster way than one CI round per changed shot. `visual.spec.mjs` now checks each
screenshot with `expect.soft` (tests/visual.spec.mjs, `shot()`; docs/TESTING.md updated): a mismatch still fails the test,
but the test goes on and renders its other tabs. So CI run 38288136796 (commit a20a9f8) failed on exactly the 24 PNGs
listed above and rendered all of them; nothing else failed (T-Score passed). For each one, its `-expected.png` was
byte-identical to the committed baseline, and CI's change sat where this container's main-vs-branch comparison put it: the
marker (y 827–829 on desktop, 771–773 on phone), the MLS header (the top 60px), and `phone/mls-league-lineup` at 390px
wide (CI's previous baseline was 396). Committed CI's `-actual.png` renders as the baselines.

## S14 — Trade Analyzer: how your team changes

**User-visible effect.** Under the Scout tab's trade verdict there's a new section. In a Sleeper-synced league it's
**"Power Rankings after the trade"**: your row of the Positional Power Rankings (Start, Ovr, QB, RB, WR, TE) with each
rank shown as before → after (green when it improves, red when it drops, one number when it doesn't move), and a
sentence above it ("Starting lineup 5th → 3rd of 12. Stronger at WR (8th → 4th); weaker at RB (2nd → 7th)."). Hover or
tap a number for that room after the trade, as on the Roster tab: players coming in are green with a "+", the ones
leaving are listed underneath. When everyone you'd get comes from one team, **"Their team: <name>"** folds open to the
same view of their side. Notes under it say when the trade **leaves a starting slot empty** ("Leaves your RB empty."),
name draft picks ("no lineup spot"), unranked players ("counts as unranked (almost no value)"), names it can't match and
players who aren't yours, and that injuries and byes are left out. In a **manual league** (only your roster known) it's
**"Your lineup after the trade"** instead: each slot whose starter changes, with who goes out (−, red) and who comes in
(+, green) and their position rank, and a sentence per slot ("Better at RB; worse at FLEX; WR left empty.";
"Can't compare at RB (Bijan Robinson is unranked)."). Picks only (or nothing) on either side: no section. No rankings:
one line saying what to load; a manual league without lineup slots: one line saying where to set them.

**The owner's decisions (Asks you).**
1. **Rankings: ROS**, since a trade is for the rest of the season. In a Sleeper league, Market Consensus stands in with a
   note when no ROS rankings are loaded (the Power Rankings card's own fallback). The manual view needs ROS.
2. **Format: not a list of starters, but the Positional Power Rankings before and after**, each number hoverable for its
   players like the Roster tab (the owner's own idea, in place of the two options offered). So in Sleeper leagues the
   lineup is the Power Rankings' best legal lineup (`pickPowerStarters`, by overall-rank value), not the Lineup tab's
   optimizer: the numbers match the Roster tab's table, which is the point. No third lineup builder was written.
3. **Summary: per slot in words.** In Power Rankings form that's the Start rank and each room that moves; in the manual
   view, one phrase per changed slot, with "can't compare at RB (X is unranked)" when a rank is missing. A QB against an
   RB/WR/TE in Superflex is compared by overall rank, the only number spanning both.
4. **The other team: yes, folded** (`<details>`, closed by default), when all the players you'd get come from one team.
5. **Manual leagues** (asked after the sketch): show your starters before and after, by `bestLineup`.

**What changed and where.**
- `js/mls/trade/lineupImpact.js` (new, pure, in `PRECACHE_ASSETS`): `tradePartner`, `leagueAfterTrade` (a copy of the
  league with the players moved; your players go to the partner, or off every roster when there's no single partner),
  `openPowerSlots`, `powerTradeImpact` (scores before and after with an injected `computePositionalPower`, and the
  slots the trade newly leaves empty), `powerSummaryText`, `lineupTradeChanges` (two `bestLineup` runs, nobody locked or
  unavailable), `lineupSummaryText`, `lineupSlotCount`, `ordinalOf`.
- `js/mls/trade/lineupSection.js` (new, in `PRECACHE_ASSETS`): `buildTradeImpactHTML(league, getNames, giveNames)`
  resolves names (positions from the league, then `getSleeperMetaByName`, then market data), sorts out picks, unmatched
  names, players not yours and players already yours, and draws either view. The Sleeper view reuses the Power Rankings
  table's classes (`.mls-power-table`), so its tooltips open and close as there (tap, keyboard, Escape).
- `js/mls/scout/engine.js`: the trade branch appends the section after the verdict, inside a try/catch so a failure
  leaves the verdict and cards as they were. The verdicts' math is unchanged.
- `js/mls/power/shared.js`: `POWER_DEFAULT_REQS` is exported (no change to the math).
- `css/mls.css`: `.mls-trade-impact*`, `.mls-trade-rank-up/down`, `.mls-trade-lineup-*`, `.mls-trade-in/out`.
- `sw.js`: the two files in `PRECACHE_ASSETS`; `CACHE_NAME` v2.8.93 → v2.8.94.
- `CHANGELOG.md`: a line under Lineup Strategist, Unreleased.
- **Legend:** nothing new is a badge, chip or pill (the ranks are the Power Rankings' own cells, recolored by direction;
  + and − are text), so no legend line; `badgeLegend.test.mjs` passes.

**Tests.**
- Unit (`tests/unit/tradeImpact.test.mjs`, with `tests/unit/helpers/powerEnv.mjs`, which loads `power/shared.js` in Node
  with its two app imports stubbed): the partner rule, the league copy, a 2-for-1 that empties both RB slots (power and
  manual), a hole that was already there isn't reported, a QB swap in a Superflex league (QB and SFLEX both change; the
  QB room goes 2nd → 1st), a QB against a WR in SFLEX, an unranked incoming player (manual: can't compare; power: rank
  300), and a bench swap that changes nothing.
- Spec (`tests/mls-trade-impact.spec.mjs`, both widths, the phone one at 375px): the fixture league trading your three
  best WRs for their three best RBs (RB 2→1 green, WR 1→2 red, the RB tooltip with three "+" rows, "Leaving:" in the WR
  one, a tap opens it, the partner fold, the pick note, no sideways scroll, the table inside its box), a 2-for-1 that
  takes your only RB ("Leaves your RB empty."), picks-only on either side (no section), unmatched names and players not
  yours, no rankings (one line), a manual league (one changed slot, slot/name/rank on one line), a manual league with no
  slots, and an unranked incoming starter in a manual league.

**Checks.** Precache OK; 346 unit tests and 369 Playwright tests pass (1 skipped, the phone-only emulation test on
desktop). visual.spec fails here as it does on main (this container can't render CI's baselines).

**Screenshots.** None change: the screenshot league has no rankings and the trade form is empty. All 40, rendered here
on main and on this branch, are pixel-identical (`npm run pxdiff`). The Guide's Trade
Analyzer step is unchanged on purpose (a sentence there would re-take `mls-league-guide` at both widths).

**Left over.**
- A three-way trade (players from more than one team) shows only your team, with a note; who gets your players isn't
  known.
- The manual view doesn't show a partner (the app doesn't know other rosters there).

### S14, round 2: the Guide, and Future value in dynasty leagues

**The owner asked** for the Guide sentence (left out of round 1 to keep the screenshots) and for dynasty Future value.

**User-visible effect.**
- **Future column in dynasty leagues.** In a dynasty or keeper league, "Power Rankings after the trade" gets the Roster
  tab's **Future** column (before → after, colored like the others), and the summary ends with "Future value 1st → 2nd."
  (or "stays 3rd"). Tap the number for the roster's top future values after the trade, each with its age, the incoming
  players marked and the ones leaving listed. A note says what Future means; if Sleeper's player ages can't load, it
  uses dynasty Market Consensus (as the Roster tab does) or says there's no Future column. The partner's fold has it too.
  Redraft leagues are unchanged. "Dynasty" is the Roster tab's own rule (`getPowerLeagueKind`: Sleeper's dynasty and
  keeper types), so the trade section and the Roster tab's table always show the same columns.
- **Guide:** step 9 (Scout: Trade Analyzer) now describes the section, the Future column and the manual-league view.

**What changed and where.**
- `js/mls/power/futureValue.js`: `whenPowerAgesLoaded()` starts the age load if needed and resolves when it's done (the
  Roster tab renders first and re-renders when ages land; the trade section can wait instead).
- `js/mls/trade/lineupSection.js`: in a dynasty league, waits for ages, scores with `resolvePowerFuture()`'s source,
  adds the column and its tooltip (`futureTooltip`) and the note. `js/mls/trade/lineupImpact.js`: `FUTURE_COLUMN`, and
  `powerSummaryText` adds the future sentence when both sides have a future rank.
- `lineup/index.html` (Guide step 9), `CHANGELOG.md` (the Unreleased line extended). `CACHE_NAME` stays v2.8.94 (once
  per branch; main is still v2.8.93).

**Tests.** Unit: future ranks before and after an old-RBs-for-young-RBs trade (scored from dynasty Market Consensus
ranks, since `powerEnv.mjs` stubs the age curve), the summary's future sentence, and none without future value. Spec: the
fixture league is redraft (no Future column), then marked dynasty in memory: five WRs for three RBs shows Future 1→2 in
red, the tooltip with "+ Bijan Robinson", "24 yrs" and the five leaving, the note, the partner's Future column, and no
sideways scroll at 375px with eight columns.

**Checks.** Precache OK; 350 unit and 371 Playwright tests pass (visual.spec fails here as on main).

**Screenshots.** Rendered here on main and this branch: only **`mls-league-guide.png`** changes, at both widths
(`desktop/` 1280×6607 → 1280×6676, `phone/` 390×13963 → 390×14170), from the Guide sentence. All 38 others are
pixel-identical. To be taken from this branch's CI renders ("Accepting an intended visual change").

### S14, round 3: Export Trade

**The owner asked** for an "Export Trade" button like the Lineup tab's PNG.

**User-visible effect.** Under the verdict and "Power Rankings after the trade" (when both sides have players), an
**Export Trade** button (camera icon, purple like the Lineup tab's PNG) saves `My_Trade_Lineup_Strategist.png`, 480px
wide at 2x:
- a header only the image shows: "Trade · <league>", "You get: …", "You give: …" (names as your rankings spell them);
- the value verdict(s), then the Power Rankings section (or a manual league's starters), with the partner's fold open;
- no tooltips, "i" icons or dotted underlines, and none of the notes written for you (injuries left out, typos, players
  not yours, the Market Consensus fallback, the Future explanation): those are marked `.mls-trade-impact-help` in
  `lineupSection.js`. Notes the league should see stay: an empty slot, draft picks, unranked players.
The page itself doesn't change. A one-sided entry has no verdict and no button.

**What changed and where.**
- `js/mls/scout/engine.js`: the verdict and the section sit in `#tradeExportArea` with the hidden header, and the
  button follows.
- `js/mls/trade/export.js`: `exportTrade`, Export Lineup's pattern (html2canvas on first use, a clone made for the
  image). html2canvas draws a `<summary>` as a numbered list item ("1. Their team"), so the clone swaps it for a div.
- `js/mls/main.js`: the `exportTrade` action. `css/mls.css`: `.mls-trade-export-*`, `.mls-trade-impact-partner-title`.
- `lineup/index.html` (Guide step 9 mentions it), `CHANGELOG.md`.

**Tests.** `mls-trade-impact.spec.mjs` serves html2canvas 1.4.1 from tests/node_modules (as `export-flex.spec.mjs`
does), records the clone after the app's own `onclone`, and checks: the file name, a 960px-wide PNG, the header, the
verdict and the summary in it, the partner's section open with no `<summary>`, no tooltips, the pick note kept and the
injury note dropped, the page unchanged afterwards, and no button for a one-sided entry. I looked at the PNG at both
widths.

**Checks.** Precache OK; 350 unit and 373 Playwright tests pass (visual.spec fails here as on main).

**Screenshots.** Still only `mls-league-guide.png` at both widths (desktop 1280×6676, phone now 390×14216 with the
longer Guide sentence); the other 38 are pixel-identical to main. To be taken from CI.

### S14, round 4: the export reworked; a headline, the percent of league average, a key

**The owner asked** (after my review as a user): move Export Trade to the bottom of the card; leave Power Rankings out
of the image or make them optional ("not normally discussed when sharing trades"); show each asset's value in the image.
And yes to three of my review points: the percent of league average when the rank doesn't move, one headline for value
and lineup together, and a note that 1 = strongest.

**User-visible effect.**
- **Export Trade** now sits at the bottom of the Trade Analyzer, after the player cards, with an **Include Power
  Rankings** switch beside it (off by default; remembered as `exportPower` inside the existing `mls_tradeSettings`
  value, so no new storage key). The image (480px at 2x) is put together for sharing rather than copied from the page:
  "Trade · <league>", then **You get** and **You give**, each player or pick on one line with its position badge and
  its **Value** by your rankings (a draft pick borrows the market's value, marked *; UR when unranked), plus a **Mkt**
  column when market data is loaded, a one-line key to the columns, then the value verdict(s). With the switch on, the
  "Power Rankings after the trade" section follows, as in round 3 (partner open, notes for you left out). The page
  itself no longer carries a hidden header or a wrapper.
- **Headline** at the top of "Power Rankings after the trade" (Sleeper leagues): the value verdict by the same rankings
  as the ranks, and the lineup change, in one sentence: "You pay in value (−4,389 pts) to make your starting lineup
  stronger (100% → 115% of league average).", "You gain value (+2,100 pts), but your starting lineup gets weaker (…): a
  move for later, not now.", "A fair trade by value that doesn't change your starting lineup." (nine cases; the lineup
  counts as changed at 1 point of league average or more). No value verdict, no headline.
- **Percent of league average** in the Start sentence: "Starting lineup 5th → 3rd of 12 (96% → 108% of league
  average)", "stays 5th of 12, but stronger: 96% → 108% of league average", "stays 5th of 12 (96% …)". Under a
  headline (which already gives the percents) the sentence keeps only the words ("stays 1st of 2, but stronger."). The
  percent is the Power Rankings' own Start score (`starterScore`, 1 = league average), the number behind the Start rank.
- **Key** under your table: "Ranks of 12 teams: 1 = strongest. Green = better after the trade, red = worse."

**What changed and where.**
- `js/mls/trade/verdict.js`: `tradeVerdictNumbers` (the banner's totals, waiver adjustment and Fair/You/Them, moved out
  of `renderTradeVerdict` unchanged) so the headline and the banner can't disagree. The banners' output is the same.
- `js/mls/trade/lineupImpact.js`: `startPct`, `tradeHeadline`, and `powerSummaryText`'s percent and `{ pct }` option.
- `js/mls/trade/lineupSection.js`: the headline (from the cards' values, passed in by `runScout`) and the key.
- `js/mls/scout/engine.js`: each card's `exportRow` (name, position or "Pick", value, market value); the switch and
  the button after the cards; `setTradeExport` hands the assets to the export.
- `js/mls/trade/export.js`: `setTradeExport`, and `exportTrade` builds the image's HTML and swaps it into
  html2canvas's clone of `#tradeOutput`.
- `css/mls.css`, `CHANGELOG.md`, `lineup/index.html` (Guide step 9).

**Tests.** Unit: the headline (pay for a stronger lineup, gain value but weaker, fair and unchanged under a point,
none without a verdict) and the percent sentences. Spec: the button after the cards, the switch off by default, the
image's assets (seven lines, "Pick 2027 1st UR"), no player cards and no Power Rankings in it by default, then with the
switch on the section, the partner open, the pick note in and the injury note out; the switch remembered on the next
trade; the headline, the key and the sentence without percents on screen. I looked at the image at phone width.

**Checks.** Precache OK; 355 unit and 373 Playwright tests pass (visual.spec fails here as on main).

**Screenshots.** Still only `mls-league-guide.png` at both widths (the Guide sentence is longer again).

**Proposed, waiting for the owner** (not built):
- *The Trade Analyzer on phones is long* (my review, point 4). Suggestions: (a) fold Waiver Adjustment into a closed
  "Value settings" row under Analyze Trade; (b) after Analyze, scroll to the result on phones; (c) make the "You
  Receive / You Give Up" cards compact rows (badge, name, ROS rank, value, owner), like the export's asset lines,
  instead of three-line cards with a big status circle.
- *Picking players instead of typing them* (owner's idea): replace the two textareas with the Add Player Manually
  search (`attachPlayerAutocomplete`, js/mls/players.js) that adds each pick as a removable chip, plus a "+ Draft pick"
  control (year and round). Names always match, so no "Did you mean". Big enough for its own card (S19).

### S14, round 5: picking players, compact rows, Value settings folded

**The owner's answers** to round 4's proposals: (a) fold Waiver Adjustment, yes; (b) scroll to the result after
Analyze, no (people adjust and re-run, and scrolling back up each time would annoy); (c) compact rows, yes; and the
player picker (their idea) on this branch rather than a new card.

**User-visible effect.**
- **Picking players.** Each side of the Trade Analyzer is a search box (Add Player Manually's, `attachPlayerAutocomplete`)
  with the side's players as tokens above it: name, position and team in small print, and ✕ to remove. Tap a suggestion
  (or Enter on the only one) to add; a name the search doesn't know is added as typed on Enter; a pasted list ("A, B"
  or one per line) adds one token each; the same name twice is ignored. **+ Draft pick** adds "2027 1st" from a year
  (the next three drafts: from March on, next year's first) and a round (1st-4th). Clear empties a side. "Did you
  mean" still works, and fixes the token.
- **Compact rows.** In the results each player is one line: position badge ("Pick" for a draft pick), name (and SoS
  badge), "ROS 2 (T1) · Wk 2 · Rostered by Rival" (or "Yours", "Free agent", "Already yours" / "Not yours (Team)" in
  red when something's off), and his value on the right with "Mkt 8,500" under it when market data is loaded. They
  replace the three-line cards with the big status circle; the waiver list keeps its cards.
- **Value settings.** Waiver Adjustment (toggle, value and the auto-calculated hint) is in a closed "Value settings" fold
  under Analyze Trade.

**What changed and where.**
- `js/mls/trade/picker.js` (new, in `PRECACHE_ASSETS`): `initTradePicker` (called from `js/mls/init.js` beside the
  manual-add form), `addTradeNames`, `setTradePlayers`, `removeTradeToken`, `addTradePick`. The textareas `#buyInput`
  and `#sellInput` stay, hidden, as the list `runScout` reads; the picker keeps them in step, and anything else that
  edits them fires an `input` event the tokens redraw from (Clear, "Did you mean" in `js/mls/players.js`, a league
  switch in `js/mls/leagues/scoutResults.js`).
- `js/mls/scout/engine.js`: `buildCard`'s trade branch returns the compact row (names escaped now).
- `js/mls/main.js`: the `removeTradeToken` / `addTradePick` actions, Clear through `setTradePlayers`, and
  `setTradePlayers` exported for tests. `lineup/index.html`: the picker markup, the Value settings fold, Guide step 9.
- `css/mls.css`: `.mls-trade-picker`, `.mls-trade-token*`, `.mls-trade-pick-row`, `.mls-trade-value-settings`,
  `.mls-trade-row*`. The tokens are an input control, not a symbol with a meaning, so no legend line.
- Tests type into the picker or call `setTradePlayers` (a hidden textarea can't be filled): `mls-scout.spec.mjs`, this
  card's spec, and `tests/tools/css-compare.tool.mjs` (sets the values, so it works on main and on the branch).

**Tests.** A new spec at 375px: search and tap (token with "RB · ATL", search cleared), no duplicate, a 2027 2nd pick
from the selects (years 2027-2029 under the fixed clock), a pasted list, a typed unknown name on Enter, the hidden
textarea's value, "Did you mean" fixing the token, removing a token, four compact rows ("ROS 2", "Rostered by Rival",
the pick, "Yours"), the Value settings fold closed and opening, Clear, no sideways scroll.

**Checks.** Precache OK; 355 unit and 375 Playwright tests pass (visual.spec fails here as on main). The legend test
flagged `mls-trade-row-warn` (red owner text, not a symbol): added to its `ALLOWED` with that reason.

**Screenshots.** Rendered here on main and on this branch, four PNGs change, all to be taken from CI:
- `desktop/mls-league-guide.png` (1280×6607 → 1280×6745) and `phone/mls-league-guide.png` (390×13963 → 390×14423):
  Guide step 9's longer text;
- `desktop/mls-league-scout.png` (1280×2267 → 1280×2131) and `phone/mls-league-scout.png` (390×2380 → 390×2243): the
  Trade Analyzer's picker in place of the textareas, and Waiver Adjustment folded.
The other 36 are pixel-identical.

### S14, round 6: team drop-down, roster lists, owner tags, live re-run, picks only in dynasty, market age

**The owner's answers** to my second review as a user: (1) re-run a changed trade, yes, and date the market values
(a notice when they're over a day old); (2) yes to owner tags and your roster first, and, like FantasyCalc and Dynasty
Daddy, a drop-down of the league's teams above the player input: choose the team first and the input lists its players,
or pick a player and the drop-down selects his manager; (3) the draft-pick row only where picks trade; (4) say why a
pick has no value.

**User-visible effect.**
- **From** (Sleeper leagues): a drop-down above Players You Receive with "Any team" and every other manager. With a
  team chosen, tapping the search lists its roster (best ROS rank first) and typing searches only it; with Any team,
  typing searches everyone (other teams' players first, then free agents, then yours), and picking a player sets the
  drop-down to his manager. Hidden in manual leagues.
- **Players You Give Up** lists your roster when you tap it (best ROS rank first), and your players first as you type.
- **Owner tags** on every suggestion: "Yours", the manager's name, or "Free agent" (in Sleeper leagues).
- After a pick the list opens again, so taking several players from one roster is a tap each.
- **Live re-run:** once a trade has been analyzed, adding, removing or clearing a player re-runs it where it is (after a
  quarter second, so a pasted list runs once); nothing scrolls. Before the first Analyze, nothing runs.
- **Draft-pick row** only in dynasty and keeper leagues (`getPowerLeagueKind`, as the Future column).
- **Picks without a value:** the row shows "–" and "Needs market data" (or "Not in market data"), the image a dash with
  a key line, and the verdict says "2027 1st has no value without Market Consensus data (Trade Finder below), so it's
  left out of this total." (or "isn't in the Market Consensus data") instead of counting it as "player not found".
- **Market age:** under the verdicts, whenever market data is loaded, "Market values: Updated today." or, once a day or
  more old, in amber: "Market values: Updated 3 days ago. Refresh them in Trade Finder (below) before you trade." On
  screen only (not in the image).

**What changed and where.**
- `js/mls/players.js` (`attachPlayerAutocomplete`): optional `opts` (`pool`, `tag`, `limit`), a list on focus or tap
  of an empty field when a pool offers one, and `refresh()`. Without opts it behaves as before (Add Player Manually, the
  simulator's search).
- `js/mls/trade/picker.js`: the pools, owner tags, `syncTradePicker` (managers and the pick rows; called when the
  Scout tab shows, from `js/mls/nav.js`, and on a league change, from `js/mls/leagues/scoutResults.js`),
  `tradeTeamChanged`, `clearTradeSide`, and the debounced re-run. `setTradePlayers` (tests) doesn't re-run.
- `js/mls/trade/verdict.js`: the pick wording and the market-age line (`getFreshness`, js/shared/freshness.js).
- `js/mls/scout/engine.js` (the pick row's dash and reason), `js/mls/trade/export.js` (the dash and key), `js/mls/main.js`
  (actions), `lineup/index.html` (the drop-down, the pick rows' ids, the Give placeholder, Guide step 9), `css/mls.css`.

**Tests.** A new spec at 375px: the drop-down's teams; your roster on tapping Give (14, "Yours", Chase first); Bijan
tagged "Rival" and the drop-down following him; Rival's roster on tapping Get; analyze, then adding and removing a
player re-runs (rows 2 → 3 → 2); a pick's dash, reason and verdict wording; market data three days old (amber) and
today (plain). The picker spec now checks the pick row is hidden in a redraft league and shown in dynasty. Tests close
an open suggestion list before tapping Analyze, as a tap elsewhere does on a phone.

Two races found while testing round 6, both fixed: (1) `attachPlayerAutocomplete` closed its list 150 ms after the field
lost focus even if it had focus again by then, so refocusing quickly closed the new list as it opened (it now closes only
if the field still doesn't have focus; this applies to every search that uses it); (2) a pick made just before tapping
Analyze scheduled a re-run that fired after the first analysis, running the trade twice (a re-run is now scheduled only
for a trade analyzed before the change). The round 6 spec ran 16 times in a row without a failure after the fixes.

**Checks.** Precache OK; 355 unit and 377 Playwright tests pass (visual.spec fails here as on main).

**Screenshots.** Still the same four, to be taken from CI: `mls-league-guide.png` (desktop 1280×6792, phone 390×14539,
step 9's text) and `mls-league-scout.png` (desktop 1280×2102, phone 390×2214: the From drop-down added, the draft-pick
rows hidden in the screenshot league, which is redraft). The other 36 are pixel-identical to main.

### S14, round 7: switching the From team clears the players you'd receive

**The owner asked:** when the team in the From drop-down changes, clear the players already picked.

**User-visible effect.** Choosing a different team under From clears Players You Receive when they belong to another
manager (a new partner is a new trade); an analyzed trade re-runs, now one-sided. "Any team", or going back to the team
the players came from, keeps them, and so do tokens no manager has (free agents, draft picks). A pick that sets the
drop-down itself (with Any team) never clears anything. Players You Give Up never changes.

**Where.** `tradeTeamChanged` in `js/mls/trade/picker.js`. My first version compared with the drop-down's previous value,
which cleared on Any team → Rival with Rival's players picked; it now compares with the players' own managers.

**Tests.** A third manager added in memory (the fixture league has two): pick Bijan (drop-down follows to Rival),
analyze, Any team keeps him, back to Rival keeps him, Third clears him and re-runs one-sided, your side stays.
Checks: precache OK; 355 unit and 379 Playwright tests pass (visual.spec fails here as on main). No screenshot changes
beyond the four already listed.

### S14, round 8: your rank in suggestions, injuries on rows, two columns on desktop; S19 in the runbook

**The owner's answers** to my third review as a user: yes to (1) the rank in suggestions, (2) injuries on the rows and
(3) Receive and Give side by side on desktop; (4) "what would make it fair" goes in the runbook as its own card (S19).

**User-visible effect.**
- **Suggestions show your ROS rank** after the owner: "RB · ATL · Rival · ROS 2", "Yours · ROS 1".
- **Injuries on the result rows:** the red injury badge (Q, D, OUT, IR…, `injuryBadgeMarkup` from js/mls/badges.js,
  already in the Guide's legend) after the name, from the Sleeper player map. Still left out of the lineup math.
- **Two columns from 768px:** Players You Receive and Players You Give Up side by side in the form, and You Receive /
  You Give Up side by side in the results; phones stay stacked as before.
- **A suggestion list no longer reopens by itself after a pick** (added in round 6). Found while testing this round: on a
  phone the reopened list covered the Give side's search, where a tap meant for that box picked a player. Tapping the
  search again shows the list.

**What changed and where.** `js/mls/trade/picker.js` (`ownerTag` adds the rank; the reopen removed),
`js/mls/scout/engine.js` (the player map read once per trade run for injuries; the results wrapped in
`.mls-trade-sides`), `lineup/index.html` (the form's two sides wrapped the same way), `css/mls.css` (`.mls-trade-sides`,
`.mls-trade-side-title`), `CHANGELOG.md`.

**Runbook.** S19 "Trade Analyzer: what would make it fair" added (needs S14; Asks you: which values decide the gap,
where suggestions come from, how many, and whether to spare the other team's starters), with a table row, a lane
(Trades: S14 → S19), a parallel-tracks note, and this card's decisions under "Your answers so far". 30 cards now.

**Tests.** A spec: "Rival · ROS 2" and "Yours · ROS 1" in the suggestions, Bijan's Q badge (set in the session's player
map) and none on Henry, and the two sides' tops equal on desktop and stacked on the phone width, in the form and in
the results.

**Checks.** Precache OK; 355 unit and 381 Playwright tests pass (visual.spec fails here as on main). Screenshots: still
the same four to take from CI, `mls-league-guide.png` (desktop 1280×6792, phone 390×14539) and `mls-league-scout.png`
(desktop now 1280×2015 with the two columns, phone 390×2214); the other 36 are pixel-identical to main.

### S14, pull request (btrerise/My-Draft-Strategist#197): the four screenshots from CI

CI run 38815932926 (commit 05dcc1f) failed only `visual.spec.mjs` "MLS synced league tabs" at both widths, on exactly the
four PNGs listed above; 389 tests passed. For each, CI's `-expected.png` was byte-identical to the committed baseline, and
the height change from main matched this container's main-vs-branch comparison (desktop scout −252 both; phone guide +576
both; desktop guide +161 vs +185 and phone scout −169 vs −166, from text wrapping under CI's fonts). Committed CI's
`-actual.png` renders as the baselines: `{desktop,phone}/mls-league-guide.png` and `{desktop,phone}/mls-league-scout.png`.

## S19 — Trade Analyzer: what would make it fair

**User-visible effect.** When the Trade Analyzer's verdict is Favors Them or Favors You, a box between the verdict
banners and "Power Rankings after the trade" says who would have to add and about how much: **"To make it fair, they'd
add about 9,800"** (or "you'd add"), then "By Your Rankings, from Rival's roster. Any one of these brings it within
10%." and up to three suggestions, closest to even first, one per line: position badge, name, value, **Add**. Add puts
the player on the right side of the trade through the picker (a token appears) and the trade re-runs in place; the
box then updates, or disappears when the trade is Fair. When no single player is enough: "No single player on Rival's
roster closes a 19,100 gap. By Your Rankings, these pairs would:" and up to three pairs with **Add both**. When nothing
fits: "No player or pair on Rival's roster closes a 18,600 gap by Your Rankings." When one more player on that side
moves the waiver adjustment (so "about" differs from the banner's gap), the line adds "Counts the waiver adjustment,
which changes with one more player." In dynasty and keeper leagues with Market Consensus loaded, that team's own picks
("2027 2nd", marked *) can be suggested, with "* Draft pick: market value. Assumes Rival still has its own picks (traded
picks aren't synced)." No box for a Fair Trade, a one-sided entry or no rankings. Other cases say why in one line: a
manual league when they'd add ("the app knows only your roster"), players from more than one team, or only free agents
or picks on your side with "Any team" under From ("Choose their team under From"). Phones: one suggestion per line,
names kept whole (a pair wraps as "Gibbs" / "+ Barkley"), Add at the right edge; from 768px the suggestions sit in two
columns, like the trade's two sides. Export Trade's image leaves the box out.

Also: the Guide's badge legend has a line for the **Pick** badge (a FLEX-colored position badge reading "Pick"), which
the trade rows have shown since S14 without one; see Screenshots.

**The owner's decisions (Asks you).**
1. **Values: Your Rankings** (the first verdict); Market Consensus only when no ROS rankings are loaded (as S14's
   headline). The line names which.
2. **Pool: the adding side's roster plus its own picks** in dynasty and keeper leagues: the From team's roster when
   the trade favors them (Sleeper leagues), yours when it favors you. No free agents. Pick ownership isn't synced, so
   each team is assumed to hold its own next three drafts' picks, rounds 1-4 (the picker's years), valued by the market.
3. **3 suggestions, pairs as a fallback**: up to 3 single players; only when none fits, up to 3 pairs with one "Add
   both".
4. **Ignore the lineup**: closest fit first, starter or not (the Power Rankings section shows the lineup effect after
   the add).

**What changed and where.**
- `js/mls/trade/makeFair.js` (new, pure, in `PRECACHE_ASSETS`): `verdictFromValues` (the verdict's math, moved from
  `tradeVerdictNumbers` unchanged, so a suggestion is checked with exactly the banner's numbers, waiver adjustment
  included), `gapToClose` (who adds, and the value one more piece would need, waiver change included), `fairSuggestions`
  (each candidate re-checked with the whole verdict as if added; singles closest to even first; pairs from the 40 most
  valuable candidates under the gap when no single fits), `fairCandidates` (ranked roster players; picks only in
  dynasty), `nextDraftYears`, `ownPickNames`, `roundGap`.
- `js/mls/trade/fairSection.js` (new, in `PRECACHE_ASSETS`): `buildMakeFairHTML` picks the values, the adding team (the
  one team the players you'd get come from, else the From drop-down), its roster from `globalRosterMap` (yours also
  from `league.roster`), and draws the box. Never suggests a player already in the trade, an unranked player, or a pick
  already on the adding side.
- `js/mls/trade/verdict.js`: `tradeVerdictNumbers` calls `verdictFromValues`; the banners' output is unchanged.
- `js/mls/scout/engine.js`: the box between the verdicts and the impact section (try/catch, like the section); the Pick
  badge from `PICK_BADGE_HTML`. `js/mls/badges.js`: `PICK_BADGE_HTML`. `js/mls/legend.js`: its line.
- `js/mls/trade/picker.js`: the pick years from `nextDraftYears` (same years). `js/mls/main.js`: the
  `addFairSuggestion` action (`addTradeNames`). `css/mls.css`: `.mls-trade-fair*`.
- `lineup/index.html`: Guide step 9 gets a sentence on "To make it fair" (the legend line already changes that screenshot).
- `sw.js`: the two files; `CACHE_NAME` v2.8.95 → v2.8.96. `CHANGELOG.md`: a line under Lineup Strategist.
- No storage key.

**Tests.**
- Unit (`tests/unit/makeFair.test.mjs`, 13): the moved verdict math and waiver credit; fair or valueless trades get
  nothing; favors them adds to Get and favors you to Give; closest to even first, at most 3; the waiver adjustment
  recomputed (a 1-for-2 needs 5,000, not the raw 4,000, and a candidate that looks fair with the old credit isn't);
  players in the trade skipped, a pick only on the same side; unranked never suggested; pairs only when no single fits;
  nothing fits; picks only in dynasty and only with market values; the pick years; rounding.
- Spec (`tests/mls-trade-fair.spec.mjs`, both widths, the phone at 375px): Bijan for Chase + Jefferson shows up to 3 of
  Rival's players (none in the trade), between the verdicts and Power Rankings, one per line with names whole and Add on
  screen, no sideways scroll; Add makes a token, re-runs (4 rows) and the verdict turns Fair with no box. Favors you:
  from your roster, Add on Give, Fair. A pair with "Add both". Nobody fits: the one line. Fair, one-sided and no
  rankings: no box. A manual league: the note when they'd add, suggestions when you'd add. Export Trade's clone has the
  verdict and not the box. (The tests that prune rosters turn the waiver adjustment off: its auto value comes from the
  best free agents, which pruned players become.)

**Checks.** Precache OK; 380 unit tests and 397 Playwright tests pass (1 skipped, the phone-only emulation test on
desktop). visual.spec fails here as it does on main (this container can't render CI's baselines).

**Screenshots.** Rendered here on main and on this branch: only **`mls-league-guide.png`** changes, at both widths
(`desktop/` 1280×6792 → 1280×6854, `phone/` 390×14539 → 390×14761), from the Pick badge's legend line and Guide step
9's new sentence. The other 38 are pixel-identical (the screenshot league has no rankings and an empty trade form). To be
taken from the pull request's CI renders ("Accepting an intended visual change").

**Left over.** Picks assumed nobody had traded theirs; round 2 syncs them.

### S19, round 2: traded picks synced from Sleeper; a bug in pick values (owner's request)

**The owner asked** to start syncing Sleeper's picks on rosters, within this card, so the suggestions use them.

**User-visible effect.**
- **Sync reads traded picks** (dynasty and keeper leagues only; redraft picks don't trade, so no extra request on Sync
  All for them). Each team holds its own pick in each round (the league's `draft_rounds`, at most 4) of the next three
  drafts (the picker's years), moved by Sleeper's `league/<id>/traded_picks`. Stored on the league object as
  `league.picks` (`{ owner: [{ name, season, round, from }] }`, owners named as in `globalRosterMap`), so no new storage
  key; Backup/Restore carries it with the league. If the request fails the league still syncs, with `picks: null`.
- **"To make it fair"** suggests only the picks that team holds, once per name, marked "via Rival" (or "via you") when
  it came in a trade; the note reads "Picks Rival holds as of this league's last sync." A dynasty league synced before
  this keeps the old assumption, and the note says to sync it.
- **The trade rows** say who holds a pick: on Give, "Yours" or, in red, "Not yours (you don't hold it)"; on Get, the From
  team's ("Rival's") or "Rival doesn't hold it" in red, or with Any team "Held by A, B" ("Already yours" / "No team holds
  it" in red). Without synced picks, "Pick" as before.
- **Bug fixed: pick values.** Names are matched by `normalizeName`, which drops digits, so every "20xx 1st" was the same
  key (`st`): the market lookup gave every 1st one value, whatever its year (and every 2nd another), and round 1's
  suggestions would have deduplicated a team's 2027 and 2028 2nds into one. Found while writing this round's spec. A
  spec showing it was run on main first (a 2029 1st ranked 40th by the market showed the 2027 1st's 8,492 instead of
  4,924), then fixed: picks are matched by year and round (`pickKey`).

**What changed and where.**
- `js/mls/leagues/picks.js` (new, pure, in `PRECACHE_ASSETS`): `pickOwnership`, `pickHolders`, `pickKey`, `pickName`.
- `js/shared/api/sleeper.js`: `getSleeperTradedPicks` (null on a non-ok response). `js/mls/leagues/sync.js`: reads it for
  dynasty and keeper leagues and stores `picks` on the league.
- `js/mls/trade/valueCurve.js`: `getMarketValue(cleanName, name)` looks a pick up by `pickKey` (an index of the market's
  picks, cached per array); `js/mls/scout/engine.js` passes the name, and its pick rows use `pickOwnerText`.
- `js/mls/trade/makeFair.js` (`fairCandidates` takes the synced `picks`, else assumes; picks valued by name) and
  `js/mls/trade/fairSection.js` (the team's synced picks, "via", the note, picks keyed by `pickKey`). `css/mls.css`:
  `.mls-trade-fair-from`.
- Tests: `tests/fixtures/sleeper/make-fixtures.mjs` writes `league-traded-picks.json` (Rival's 2027 1st is yours, your
  2027 2nd is Rival's; read only when a spec makes the league dynasty), routed in `tests/helpers.mjs`.
- `CHANGELOG.md`: two lines. `CACHE_NAME` stays v2.8.96 (once per branch; main is v2.8.95).

**Tests.** Unit (`tests/unit/pickOwnership.test.mjs`, 6): own picks, traded both ways and onward, the rounds cap,
a pick traded to a roster nobody owns, `pickHolders`, `pickKey`; `makeFair.test.mjs`: synced picks only, once per name,
with `from`, none for a team holding none. Spec: the fixture league synced as dynasty has the expected picks per team;
with market values for a 2027 1st and 2nd, a gap only a pick closes suggests Rival's 2027 2nd (via you), never the 1st it
traded away, and Add makes it Fair; the four row texts; and the pick-value bug (each pick its own Mkt value).

**Checks.** Precache OK; 387 unit and 401 Playwright tests pass (1 skipped; visual.spec fails here as on main).
Screenshots: rendered here, all 40 pixel-identical to round 1's (the screenshot league is redraft, so no traded picks are
read); still only `mls-league-guide.png` at both widths differs from main.

**Left over (other places traded picks could be used; not built):**
- The picker's lists (tapping Give or a From team) could offer that team's picks along with its players.
- Power Rankings' Future column and the Roster tab count players only; picks held could add to a team's future value.
- The Dashboard's league cards don't show picks.

### S19, round 3: draft picks in the Future column (owner's request)

**The owner asked** to include picks in the Power Rankings' Future column, since it bears on trade decisions.
**Asked:** how to value a pick there. **Answer:** dynasty Market Consensus's value for that pick (its year and round)
when loaded, else a set table.

**User-visible effect.** In dynasty and keeper leagues whose picks were synced (round 2):
- **Future** (Roster tab and "Power Rankings after the trade") adds each team's picks to its future value, on the same
  power curve as players: a pick counts like a player of the market's rank for it, or, without dynasty market data (or
  for a pick the market doesn't price), the table's rank: 1st = 48, 2nd = 100, 3rd = 160, 4th = 230, each draft further
  out 15% further down (a 2029 1st counts like the 62nd player). No age factor. A note under the table says which.
- **Tooltips:** picks sit among the top rows by value ("2027 1st (via Rival)", "Pick · like #48"); any that don't make the
  top 8 are named on a "Picks:" line, so they never hide behind "+ 10 more" (now "+ 4 more players").
- **Trades:** picks in a trade move between the teams before scoring (yours to the partner; theirs, or with Any team
  whoever holds one, to you), marked "+" in the Future tooltip and listed under "Leaving:". A side of picks only is
  now enough for the section in such a league (S14 skipped those, when picks had no lineup or future effect); with no
  player to name the partner, the From team is it. Redraft and manual leagues, and dynasty leagues not synced since
  round 2, are unchanged.
- Guide (Power Rankings step) and the Roster card's (i) mention picks.

**What changed and where.**
- `js/mls/leagues/picks.js`: `tablePickRank`, `picksAfterTrade`.
- `js/mls/power/shared.js`: `computePositionalPower` adds `league.picks` to `futurePlayers` / `futureScore` when
  `opts.future.pickRank` is given (no change otherwise: All My Leagues passes no future).
- `js/mls/power/futureValue.js`: `powerPickRank` (market, else table), attached to `resolvePowerFuture`'s sources with a
  `picks` label; `powerPicksNote`, `futureRankText`, `futureMoreHTML` (shared by both tables).
- `js/mls/power/rosterCard.js` (note, tooltip), `js/mls/trade/lineupImpact.js` (`leagueAfterTrade` / `powerTradeImpact`
  take the traded picks), `js/mls/trade/lineupSection.js` (picks-only sides, partner from From, notes, tooltips).
- `lineup/index.html` (Guide step, card tooltip), `CHANGELOG.md`.

**Tests.** Unit: `tablePickRank`, `picksAfterTrade` (to the partner, from any holder, skipped when nobody holds it,
original untouched); picks add to future value and rank and are listed with "via"; none without `pickRank`; a pick swap
moves future ranks and marks the moved pick. Spec (fixture league synced as dynasty): the Roster tab's Future column,
its note and the "Picks:" line; a 2027 1st for 2027 2nd trade shows the section with "+ 2027 2nd (via you)" and
"Leaving: 2027 1st".

**Checks.** Precache OK; 391 unit and 403 Playwright tests pass (1 skipped; visual.spec fails here as on main).
Screenshots: against round 2's renders only `mls-league-guide.png` changes (desktop 1280×6854 → 1280×6877, phone
390×14761 → 390×14830, the Guide sentence on picks); the Roster screenshots don't move (the screenshot league is redraft,
and the card's (i) text is hidden). Against main, still only `mls-league-guide.png` at both widths, to take from CI.

### S19, round 4: a plain "2027 1st" took the market's Early 1st value (found by the owner)

**The owner found** a 2027 1st worth about 6,100 on this branch against about 2,900 on main. Not the set table (round 3
uses it only in the Future column, and only for picks the market doesn't price): round 2's `pickKey`. FantasyCalc prices
each pick four ways: today, for 12-team 1QB PPR dynasty, "2027 1st (Early)" is ranked 26th, "(Mid)" 53rd, plain "2027 1st"
63rd and "(Late)" 78th. `pickKey` ignored the "(Early)", so all four were one pick, and the market index kept the
best-ranked, the Early 1st, for every plain "2027 1st" (rows, verdicts, "To make it fair", the Future column). Main gave
the plain 2027 1st its right value, but only because its digit-less key ("st") happened to land on the 2027 1st first in
FantasyCalc's order; it still gave a 2028 or 2029 1st the 2027 1st's value (round 2's fix).

**Fix.** `pickKey` keeps Early / Mid / Late ("pick 2027 1st early"), so a plain pick gets the market's plain value and a
pick typed "2027 1st (Early)" its Early value; `{ tier: false }` drops it where only the slot matters: who holds a pick
(`pickHolders`, `picksAfterTrade`; Sleeper's picks are plain) and "already on this side" in `fairSection.js`. The market's
pick index keeps the first row per key (no more "best of several").

**Tests.** The spec "each draft pick has its own market value" now uses FantasyCalc's names (Early, plain, Late for 2027
1sts; Early and plain 2nds; a 2029 1st): run on round 3's commit first, it failed (the plain 2027 1st showed the Early 1st's
9,299 for 8,492), then passed with the fix. Unit: `pickKey` with and without the tier, `pickHolders` ignoring it.

**Left over.** The picker and Sleeper name picks plainly, so every pick is valued as FantasyCalc's plain one. The owner
wants specific pick values after the season, when FantasyCalc starts pricing specific picks (names to check then); not
needed in season. Written into `docs/TESTING.md`'s "Open follow-ups" (On a date: after the regular season).

**Checks.** Precache OK; 391 unit and 403 Playwright tests pass (1 skipped; visual.spec fails here as on main). No
screenshot effect (no visible text or layout changed).

### S19, round 5: a review as a user; suggestions across prices, Remove, Undo, quieter notes (owner: "do all four")

**My review** (on the fixture league as a phone user, dynasty, FantasyCalc-named picks): the loop works (lopsided → one
tap → Fair), but (1) "closest to even" always suggested the other team's stars, (2) a suggestion didn't say where it
lands the trade, (3) the only way back from an Add was the token's ✕ far up the page, (4) the Power Rankings section
ended in four bullets of explanation; missing: (5) taking a piece off your own side, the usual counter, and (6) a pick
when a player is closer to even. The owner asked for all four proposals (spread with a pick and landing, Remove, Undo,
quieter notes).

**User-visible effect.**
- **Suggestions across prices:** the closest to even, the least valuable that still fits (the least they'd give), and in
  dynasty the pick closest to even, then the next closest; shown most valuable first. Under each name, where it lands:
  "Fair · even", "Fair · 2% your way", "Fair · 9% their way" (a fair 9.6% reads 9%, never "Fair · 10%"). Pairs unchanged.
- **Remove:** "Or take off your side:" (favors them: from what you give) or "Or ask for less:" (favors you: from what you
  get), up to two pieces whose removal alone makes it fair, closest first, each with its value, landing and **Remove**.
  Never a side's last piece. It needs no other roster, so it shows in a manual league too, and wherever adding is
  blocked (several teams, no team under From). Remove doesn't focus the search (a phone keyboard would cover the result).
- **Undo:** after Add or Remove, "Added Bijan Robinson. Undo" / "Took off Ja'Marr Chase. Undo" under the verdict puts the
  whole trade back and re-runs it. It stays while the trade is unchanged; any other change drops it. In memory only.
- **Quieter notes:** in "Power Rankings after the trade", the explanations (Market Consensus fallback, what Future means,
  picks in Future, no ages, injuries and byes left out) sit behind one "How this is worked out" (i) (tap on phones);
  notes that need you (a name not matched, a player not yours, already yours) and the ones about the trade (an empty
  slot, picks have no lineup spot, unranked players) stay as bullets. Export Trade leaves the (i) line out.
- Shorter box text: "(waiver adjustment included)"; "* Market value. Picks as of the last sync."

**What changed and where.** `js/mls/trade/makeFair.js` (`spreadFits`, `fairRemovals`, `landing`; `fairSuggestions`
returns `removals`), `js/mls/trade/fairSection.js` (landing line, the removal list, the Undo state and line,
`data-fair-adds` / `data-fair-removals`), `js/mls/trade/picker.js` (`tradeNames`, `removeTradeNames`, `restoreTrade`),
`js/mls/main.js` (`removeFairPiece`, `undoFairChange`; Add remembers the trade), `js/mls/trade/lineupSection.js` (`about`
notes and the (i) line), `js/mls/trade/export.js` (drops the (i) line; removes only `li` help notes), `css/mls.css`,
`CHANGELOG.md`.

**Tests.** Unit: the spread (closest, least, then next; most valuable first), a pick getting a place, removals (each side,
never the last piece, the waiver credit recomputed, none when fair), `landing` (even, both ways, 9.6% → 9%). Spec: landing
lines and the price order; Undo after Add (back to Favors Them, box back, line gone); Remove (token gone, Fair, "Took
off …", search not focused); another change drops the Undo; "Or ask for less" when it favors you; removals in a manual
league; the notes' (i) holding "Injuries and byes" and the bullets not; the export without the (i) line.


**Checks.** Precache OK; 394 unit and 403 Playwright tests pass (1 skipped; visual.spec fails here as on main). Screenshots:
all 40 pixel-identical to round 3's renders; against main still only `mls-league-guide.png` at both widths, to take from CI.

### S19, round 6: the market's value on each suggestion (owner's request)

**User-visible effect.** In "To make it fair", each suggestion and each "Or take off your side" piece shows "Mkt 8,500"
under its value when Market Consensus is loaded (a pair: the sum; "Mkt –" when the market has no value for it), in the
rows' own style. Not shown when Market Consensus is what decides (no ROS rankings), since the two numbers would match.
**Where.** `js/mls/trade/fairSection.js` (`valueHTML`, `marketOf`), `css/mls.css` (`.mls-trade-fair-val` as a column),
`CHANGELOG.md`. **Tests.** Spec: no Mkt line without market data; with it, Saquon's market value, "Mkt –" for players
the market lacks, and Chase's on the removal.

**Found while here (owner's report): tooltips run off the screen on phones, site-wide.** Every `.tooltip-text` is 260px
wide at `right: -10px` from its trigger (css/base.css), so it always opens leftward; a trigger within ~250px of the left
edge of a 375px screen puts it off-screen. Measured at 375px with every tooltip opened: 2 on the Lineup tab (the
optimizer settings), 1 in the Trade Analyzer's Value settings, and round 5's "How this is worked out" (i). Fixed in round 7.

### S19, round 7: tooltips stay on the screen, site-wide (owner's report; owner chose this branch)

**Bug.** Every `.tooltip-text` is 260px wide at `right: -10px` from its trigger (css/base.css), so it always opens
leftward, and nothing measured the window. **Test first:** `tests/tooltips-onscreen.spec.mjs` taps every tooltip trigger
on every tab of both apps (folds opened; the Trade Analyzer with a lopsided trade analyzed) at 375px and 1280px and
checks each box. On the code before the fix it failed with five: at 375px the Lineup tab's two optimizer settings
(−32 and −79px off the left), the Trade Analyzer's Value settings (−37px) and round 5's "How this is worked out" (−59px);
and at 1280px the optimizer setting again (−11px). Draft Strategist and T-Score (no tooltips) had none in the states
reached.

**Fix.** `js/shared/ui/tooltips.js`: `place(text)` measures a tooltip as it opens (a tap through `toggle`, a mouse
through `mouseover`, the keyboard through `focusin`) and sets `--tt-dx` to slide it inside an 8px margin; `css/base.css`
applies it with `translate` (so the fade's `transform` is untouched) and caps the width at `calc(100vw - 16px)`. A
tooltip that already fits gets no shift, so nothing moves where things were fine; the Power Rankings tooltips' own
left/right/center classes still apply first. `docs/TESTING.md` (Conventions) notes the rule and the spec.

**User-visible effect.** Any tooltip opened near a screen edge slides back on screen (both apps). CHANGELOG lines under
both apps.


**Checks (rounds 6 and 7).** Precache OK; 394 unit and 409 Playwright tests pass (1 skipped; visual.spec fails here as on
main). Screenshots: all 40 pixel-identical to round 5's renders (tooltips are closed in them); against main still only
`mls-league-guide.png` at both widths, to take from CI.

### S19, round 8: a capital "I" on info icons (owner's report)

**Bug.** `.tooltip-icon` (css/base.css) never set `text-transform`, so an (i) inside an uppercase label inherits it: the
Trade Analyzer verdict's "BY YOUR RANKINGS" / "BY MARKET CONSENSUS" (`.trade-verdict-source-label`, css/mls.css) showed
"I". **Test first:** `tooltips-onscreen.spec.mjs` now also fails on any (i) whose rendered text (innerText, which applies
text-transform) isn't "i", and on any tooltip text that's transformed; before the fix it failed on the verdict's (i) at
both widths, the only one in the states it reaches. **Fix:** `text-transform: none; letter-spacing: normal` on
`.tooltip-icon` and `.tooltip-text` in css/base.css, so it holds for any (i) in any label, site-wide.


**Checks.** Precache OK; 394 unit and 409 Playwright tests pass (1 skipped; visual.spec fails here as on main). Screenshots:
all 40 pixel-identical to round 7's (no (i) in a capitalized label is on them).

### S19, round 9: the fair range, the market's view, verdicts side by side (owner: "do 1, 2 and 3" of my second review)

**My second review as a user** (round 8): (1) "about 3,000" next to a 1,950 pick marked Fair read as a contradiction;
(2) nothing said when the market disagrees with Your Rankings; (3) on desktop the two verdicts stacked full-width filled
the first screen; (4) the desktop list reads across, not down (skipped, the owner's choice).

**User-visible effect.**
- **The fair range:** "To make it fair, they'd add 7,650–11,590": every value one more piece could have and leave the
  trade within 10%, waiver change included, rounded outward to 10s so every fair suggestion falls inside it (rounding to
  100 put the review's fair 1,950 pick under "2,000"). "up to N" when even nothing added is fair; "about N" if no range.
- **The market's view:** when Your Rankings decide, Market Consensus is loaded and values every piece, and its verdict
  differs: one amber line. Inside the box when the trade is lopsided by yours ("By Market Consensus it's already fair as
  it stands."), on its own under a verdict that's fair by yours ("By Market Consensus this favors you (29%): they may ask
  you to add about 2,900." / "...favors them (12%): they may be open to adding about 1,200."). On screen only.
- **Verdicts side by side** from 768px (`.trade-verdict-pair`, a grid); stacked on phones. Export Trade still copies both.

**What changed and where.** `js/mls/trade/makeFair.js` (`fairRange`; `gapToClose` and `fairSuggestions` return
`range`), `js/mls/trade/fairSection.js` (the range head, `marketLine`), `js/mls/trade/verdict.js` (the pair wrapper),
`js/mls/trade/export.js` (its selector reaches into the pair), `css/mls.css`, `CHANGELOG.md`.

**Tests.** Unit: the range's ends (just inside fair, just outside not), the review's 1,950 pick inside its range, the
waiver change in it. Spec: every suggestion's value inside the range shown; the market line alone under a fair verdict,
inside the box when only yours is lopsided, absent when the market lacks a piece; the verdicts' tops equal on desktop
and stacked on the phone; the export with both verdicts and without the market line.


**Checks.** Precache OK; 395 unit and 411 Playwright tests pass (1 skipped; visual.spec fails here as on main). Screenshots:
all 40 pixel-identical to round 8's (the screenshot league has no rankings, so no verdict); against main still only
`mls-league-guide.png` at both widths, to take from CI.

### S19, round 10: my third review as a user; two fixes

**Reviewed** (phone at 375px and desktop, market data for every player): a trade fair by both lenses; a 1-for-3 only pairs
can close; a typo'd name with a player the market lacks; the verdicts side by side.

**Fixed (both in this card's code, test first):**
- **A pair's names ran over its value on phones** ("+ Christian McCaffrey" 73px past its column, over "17,962"). The
  pairs spec now measures each name's text against its column at 375px (the column's box stays narrow, min-width 0,
  while its text spills, so the first version of the check, on the box, passed); it failed on all three pairs, then
  passed. Fix: below 768px a pair takes two lines (badges stacked, names across, the value and Add both under them on
  the right); singles and desktop unchanged.
- **Two numbers for one gap:** "No single player on Rival's roster closes a 19,100 gap" sat under "they'd add
  16,220–22,340". Now "...is worth 16,220 or more" and "No player or pair on Rival's roster adds up to 16,220–22,340".

**Seen, not changed (from S14, outside this card; for the owner):**
- With a typo'd or unmatched name, the market banner reads "est. 0 ... Favors Them (100%)" when the market has none of
  your side's players, and Your Rankings can say "Fair Trade" while a name counts as 0 ("1 player not found"). Holding
  the verdict until every name matches (or muting the banner) would be clearer.


**Checks.** Precache OK; 395 unit and 411 Playwright tests pass (1 skipped; visual.spec fails here as on main). Screenshots:
all 40 pixel-identical to round 9's.

### S19, round 11: verdicts wait for every name; "Incomplete" by the market (owner: fix them now, not as a card)

**The bugs** (round 10's "seen, not changed"): a name that matches no player (a typo) counts as 0 in every total, so
the Trade Analyzer still said "Fair Trade" (and built "To make it fair" and the value headline on it); and the market
banner read "est. 0 ... Favors Them (100%)" when the market had none of one side's players.
**Test first:** `tests/mls-trade-verdict-held.spec.mjs` (both widths): a typo'd Gibbs gets no Fair/Favors banner, no
box and no headline, then the verdicts once fixed; Saquon missing from the market makes its banner "Incomplete" and
names him while Your Rankings still decides; Tre Tucker (a real player, unranked) counts as 0 with a sentence saying so.
All six failed before the fix.

**Fix.**
- `js/mls/scout/engine.js`: each trade row carries `known` (a pick, or a name with a position: Sleeper, the league or
  market data). `js/mls/trade/verdict.js`: `unknownNames`; with any, one muted banner ("No verdict yet. Couldn't match X
  to a player. Fix the name (Did you mean, below) to get a verdict.", `data-verdict-held`) instead of both verdicts.
  Per source: a real player the market lacks makes that banner "Incomplete" (no diff, `verdict-incomplete`) with "X
  isn't in the Market Consensus data, so this total is missing him."; one your ROS rankings lack keeps the verdict (an
  unranked player is worth 0 on your board, the card's rule) with "X isn't in your ROS rankings, so he counts as 0."
  (was "1 player not found, excluded from this total"). The market-age line moved into `marketAgeHTML`.
- `js/mls/trade/fairSection.js` and `js/mls/trade/lineupSection.js`: no box and no value headline while a name is
  unknown, or while the market decides and lacks a piece. The Power Rankings section itself still compares the players
  it can match and notes the one it can't (S14). `css/mls.css`: `.verdict-incomplete`.


**Checks.** Precache OK; 395 unit and 417 Playwright tests pass (1 skipped; visual.spec fails here as on main). Screenshots:
all 40 pixel-identical to round 10's; against main still only `mls-league-guide.png` at both widths, to take from CI.

### S19, round 12: my fourth review as a user; gaps after numbers in exported images

**Reviewed** (phone and desktop): building a trade with the picker, the Roster tab's Future column with picks (its
tooltip on screen at 375px, picks named), the saved Export Trade image, a manual league. Proposed (1) the picker offering
the picks each side holds and (2) the export's odd spacing.

**The owner's decisions.** (1) **No**: restricting or steering the pick row to held picks would make hypotheticals
harder, and the owner's devy league tracks devy picks separately; the picker stays open to any pick. (2) **Yes.**

**Bug and fix.** Every page sets `font-variant-numeric: tabular-nums` on body (css/base.css). html2canvas 1.4.1 places
each word at the browser's position but draws it with the canvas's text, which ignores that, so words with digits came
out narrower than their slots and left gaps: Export Trade showed "(0- 10,000 )" and "(- 868 pts, 9%)", values stopped
short of the right edge, and Export Lineup and Draft Strategist's Export Team had the same after ranks ("RB1"). Confirmed
by exporting with the setting off in the image only (the gaps went away). **Test first:** `tests/export-numerals.spec.mjs`
records the clone html2canvas draws from, after each export's own onclone, and fails on any text with digits still
asking for tabular digits; it failed on all three exports, then passed. **Fix:** `js/shared/ui/exportImage.js` (new, in
`PRECACHE_ASSETS`) `useProportionalDigits(root)` adds a style to the clone; called by Export Trade and Export Lineup
(`js/mls/trade/export.js`) and Export Team (`js/mds/export.js`). The page keeps its tabular digits. I looked at all three
images. `docs/TESTING.md` (Conventions) notes it for new exports; CHANGELOG lines under both apps.


**Checks.** Precache OK; 395 unit and 421 Playwright tests pass (1 skipped; visual.spec fails here as on main). Screenshots:
all 40 pixel-identical to round 11's; against main still only `mls-league-guide.png` at both widths, to take from CI.

### S19, round 13: my fifth review as a user; keyboard focus, the Guide

**Reviewed:** the Guide against what the feature does now, the Pick legend line, the box from the keyboard (Tab, Enter
on Add, Undo, Remove). **Found and fixed:**
- **Focus fell to the top of the page** after Add, Remove or Undo by keyboard: the re-run replaces the box, and the
  focused button with it. Test first (`mls-trade-fair.spec.mjs`, "keyboard: focus stays with the box", failed on BODY):
  `js/mls/trade/fairSection.js` remembers the next focus (`_focusNext`: Undo after a change, the first suggestion after
  Undo) and `placeFairFocus`, called by `runScout` once the results are in, moves it there with `preventScroll`.
- **The Guide was stale** (step 9 still said "about how much", with no Remove, Undo, range, market line or held
  verdict). Rewritten; `mls-league-guide.png` was already on the CI re-take list for this branch.


**Checks.** Precache OK; 395 unit and 423 Playwright tests pass (1 skipped; visual.spec fails here as on main). Screenshots:
against round 12 only `mls-league-guide.png` (desktop 1280×6877 → 1280×6923, phone 390×14830 → 390×14969, the Guide
sentence); against main still only that PNG at both widths, to take from CI.

### S19, round 14: my sixth review as a user; a 12-team league, long names on phones

**Reviewed:** a realistically sized league built in memory (12 teams of 25, a 300-player board, market values for all,
real-length names): Analyze takes ~0.1s, Add to re-run ~0.4s (0.25s of it the deliberate debounce), "To make it fair"
and Power Rankings for 12 teams read fine. No light theme exists to check.

**Found and fixed:** at 375px a single long name ran over its value, worst on a Remove row (the wider button):
"Marcus Henderson M12" over "8,042"; with a fixture player, "Amon-Ra St. Brown" 4px past its column. Round 10 had only
fixed pairs. **Test first:** the overlap check became `rowOverlaps` in `mls-trade-fair.spec.mjs`, run on suggestions
and removals, and also fails when a value and its button end up on different lines; the new test "long names on single
rows fit at 375px" failed on the phone, then passed. **Fix** (`css/mls.css`, `js/mls/trade/fairSection.js`): every row
may wrap, names never shrink below their own width (`min-width: min-content`, each player nowrap), and the value and
its button sit in one `.mls-trade-fair-act` group pushed right, so when a name doesn't fit beside them they move
together to a second line; rows that fit stay on one line. The pair rule keeps only its stacked badges and full-width
names.


**Checks.** Precache OK; 395 unit and 425 Playwright tests pass (1 skipped; visual.spec fails here as on main). Screenshots:
all 40 pixel-identical to round 13's; against main still only `mls-league-guide.png` at both widths, to take from CI.

**S19, pull request ([#200](https://github.com/btrerise/My-Draft-Strategist/pull/200)):** re-took the two screenshots
from CI run 39208970674 (its `-actual.png`, after checking each `-expected.png` was byte-identical to the committed
baseline and the first changed row is the Power Rankings Guide's picks sentence):
`tests/baselines/linux/desktop/mls-league-guide.png` (1280×6599 → 1280×6731) and
`tests/baselines/linux/phone/mls-league-guide.png` (390×13786 → 390×14191).

## S17 — Faster first load and tab switches

**User-visible effect.** On a phone's first visit every page (Draft Strategist, Lineup Strategist, T-Score) appears about a
second sooner: the font comes from this site, so the browser no longer waits on two connections to Google before the
first paint, and the blank white screen before it is that much shorter. Draft Strategist's logos download smaller
(5775.svg and logo.svg) and look the same. In Lineup Strategist with many leagues, switching to the Lineup tab pauses
less before it slides in (on a 4x-slowed CPU with 21 leagues, its longest task went from ~125–150 ms to ~80–105 ms),
because it no longer redraws the hidden Dashboard, and the Dashboard keeps its league cards when nothing on them changed.
Nothing looks different once loaded.

**Measured first.** Two opt-in tools, both in docs/TESTING.md: `npm run perf` (`tests/tools/perf.mjs`: Lighthouse 13.5,
the version PageSpeed ran, as a devDependency in tests/package.json; PageSpeed's mobile setup; first, cold and repeat
visits; a serve.mjs-like and a Cloudflare-like server; any git ref or folder) and `npm run perf:tabs`
(`tests/tools/tab-switch.tool.mjs`: S16's 21 leagues at 4x CPU, with an optional profile). Every number, the baseline and
each change measured on its own commit are in **docs/improvements/performance.md**. The PageSpeed API's anonymous quota
was used up and this container can't reach the live site, so the owner's PageSpeed run on the branch preview is still
to add there (below).

**Owner's decisions (asked with the measurements).**
1. **Minifying:** keep no build step. Measured: JS 498 → 220 KB after brotli, `/lineup/` time-to-interactive −0.7 s, first
   paint unchanged. Noted under "Open follow-ups" in docs/TESTING.md in case a build step is wanted one day.
2. **The font:** self-host Outfit (over Google Fonts loaded without blocking; both measured ~1.1 s sooner first paint,
   self-hosting slightly more and offline too).
3. **Keep:** the smaller logos and the tab-switch changes. **Dropped:** the inline page background (built, measured no
   effect, reverted).

**What changed and where.**
- `fonts/outfit-latin.woff2`, `fonts/outfit-latin-ext.woff2` (Google's own Outfit v15 files, one variable font per
  subset), `fonts/OFL.txt`. `css/base.css` starts with their `@font-face` (weights 400–700, `font-display: swap`,
  Google's subsets); each page's `<head>` preloads the latin file instead of linking Google Fonts' stylesheet and its two
  preconnects. Both files are in `PRECACHE_ASSETS`. `CACHE_NAME` v2.8.96 → v2.8.97.
- `images/5775.svg` (226 → 125 KB; 134 → 81 KB brotli) and `images/logo.svg` (191 → 160 KB; 79 → 68 KB): the editor's
  content-credentials manifest (`<metadata>`) removed and the embedded PNG masks re-encoded losslessly, with a one-off
  script (not kept: Python + Pillow, verified by rendering old and new at 16–500 px and 1x–3x in Chromium, 0 pixels
  different). Rounding the path numbers would have saved more but moved anti-aliased pixels, so it isn't done.
- `js/shared/ui/viewTransition.js`: `placeTabMarker` measures the tab bar's buttons once and again only when the bar
  changes size (a ResizeObserver, which also catches a desktop scrollbar coming or going), instead of reading
  `offsetWidth`/`offsetLeft` right after showTab had shown the new tab, which forced a layout of it mid-switch.
- `js/boot.js`: a failed `<link>` raises the "Something went wrong loading the app" banner only when it's a stylesheet.
  Found by the full check: the specs block the font, and its failed preload (a same-origin `<link>`) raised the banner
  whenever it failed after boot.js was listening, which a real phone on a flaky connection could hit too. Test first:
  `fonts.spec.mjs`, "a font that fails to load is not a fatal error", failed before the fix.
- `js/mls/render/lineup.js`: `renderLineupUI` redraws the Dashboard's league cards only while the Dashboard shows
  (showing it redraws them anyway, through showTab's `refreshLeagueDropdown`).
- `js/mls/render/leagueCards.js`: `renderLeagueCards` keeps the cards when the new HTML is identical and the list still
  holds the cards it last wrote. `js/mls/scout/bestAvailable.js`: a Best Available section whose HTML is unchanged isn't
  rewritten. S16's rules hold: the work after a switch runs once, rapid taps end on the last tab
  (view-transitions.spec passes unchanged).
- Tests: `fonts.spec.mjs` (new: each page loads the self-hosted Outfit at 400–700 and asks nothing of Google Fonts);
  `mls-tab-redraws.spec.mjs` (new: an unchanged Dashboard keeps its card elements, a change redraws them, a Lineup render
  leaves the hidden Dashboard alone and showing it brings it up to date; the first test fails on main). `helpers.mjs`
  blocks `fonts/*.woff2` as it blocked Google Fonts, so screenshots keep the fallback fonts; `serve.mjs` serves `.woff2`
  as `font/woff2`; `css-compare` keeps the font blocked on both sides; `compare-css`'s npm script names its own file now
  that `tests/tools/` has another `*.tool.mjs`.
- CHANGELOG: lines under both apps. docs/TESTING.md: the two tools, the font stub, and four speed follow-ups.

**Tried and not kept (measured, in performance.md).**
- **modulepreload lists** for every module a page imports, generated from the import graph and checked by
  check-precache (`--write`): slower everywhere. `/lineup/`'s largest paint went from 2.61 s to 5.38 s simulated and from
  1.70 s to 10.93 s with real throttling: ~95 downloads started with the stylesheets and the hero logo share slow 4G's
  bandwidth with them. At the end of `<body>` still slower simulated. The chain of imports (5 levels) isn't the
  bottleneck; the bytes are. Reverted; the generator is in commit 7a320e7.
- **Inline page background** in each `<head>`: no effect. Chrome paints nothing until the blocking stylesheets arrive,
  so the white frames are the empty page before the first paint (a `<meta name="color-scheme" content="dark">` didn't
  change them either). The way to shorten them was an earlier first paint, which the font change gives.
- **Critical CSS inline:** its upper bound (no stylesheet blocking at all) gains only 0.2–0.5 s over the font change,
  for a flash of unstyled page and a second copy of the CSS. Not built.
- **PapaParse on first use:** removing it entirely changed nothing measurable (it's `defer`, 7 KB brotli). Lighthouse
  finds no legacy JavaScript locally; the live run's 11 KiB is most likely a script Cloudflare adds to the live pages.
  The owner can check the URL in PageSpeed's "Legacy JavaScript" section.
- **`_headers`:** can't help a first visit, the service worker already covers repeat visits, and a long cache life on
  images would hold back a changed logo for anyone without it. Not added.
- **Unused CSS:** 66–98% of each file is unused at a first visit's load (styles for tabs and states not yet opened);
  a split would save at most part of the critical-CSS bound above. Not worth a card.

**Third-party and other findings, left for later** (also under "Open follow-ups" in docs/TESTING.md): T-Score blocks the
main thread ~1.1 s on every load (its PageSpeed score stays near 77 on repeat visits); Draft Strategist's setup page
shifts its layout (0.20) on a slow first visit when the app draws above the "Load Rankings" card (the live PageSpeed
run's simulation can't see it); the rest of a Dashboard switch (~100 ms with 21 leagues) is layout that
`content-visibility: hidden` could keep. No third-party forced reflow showed up in the traces.

### S17, round 2: the owner's PageSpeed run on the preview, and the scroll-shadow reflow

The owner ran PageSpeed Insights (mobile) on the branch preview's `/`: **Performance 88, First Contentful Paint 1.5 s,
Largest Contentful Paint 3.4 s**, TBT 0, CLS 0; render-blocking down from ~920 ms to 330 ms (Google Fonts gone), no legacy
JavaScript. Full comparison in performance.md's last section (their 2026-10-12 run was `/lineup/` on the live site).

**Fixed from it: a forced reflow at load (73 ms).** `js/shared/ui/scrollShadows.js` checked its two wide tables
(Draft Strategist's Roster Limits, Lineup Strategist's SoS grid) at DOMContentLoaded and after every change inside them
by reading `scrollWidth`, which made the browser lay the page out on the spot, before its first paint. It now checks from
a ResizeObserver on each container and its children (after the browser's own layout); the MutationObserver only hands new
content to it and lets go of removed elements. **User-visible:** that also catches a table that only gets a size when
it's shown: Lineup Strategist's SoS grid, opened from its folded "Edit Manual SoS Grid" on a phone, now shows the shadow
on its right edge that says there's more to scroll (on main it never did until you scrolled). Test first:
`tests/scroll-shadows.spec.mjs` failed on main (no shadow after opening the grid at 360px), passes now. Screenshots: all
40 pixel-identical to main's, rendered here the same way. CHANGELOG line under Lineup Strategist.

**Left alone, with reasons (performance.md):** the largest paint on `/` is the header's draft drop-down, which the script
fills in (a default name in the HTML would flash the wrong name for some); the tab-bar marker's first measurement (6 ms);
minify (no build step); unused CSS; Ko-fi's cache life (theirs); SEO 69 and the `ai-catalog.json` check (a preview's
`noindex` header; the site has no such file).

**Left over.** Nothing for S17. The speed follow-ups (T-Score's 1.1 s of blocking script at load, Draft Strategist's
setup-card layout shift on slow first visits, the Dashboard's layout after `display: none`, the drop-down as largest
paint, minifying if a build step is ever wanted) are under "Open follow-ups" in docs/TESTING.md.

### S17, round 3: PageSpeed on `/lineup/` and `/` of the final preview; the marker's first measurement

The owner re-ran PageSpeed on the preview for both pages: **`/lineup/` 74** (FCP 2.6 s, LCP 5.7 s; live was 69 / 3.7 s /
6.0 s) and **`/` 86** (FCP 1.6 s, LCP 3.3 s). Details and why `/lineup/`'s largest paint barely moved are in
performance.md's last section: PageSpeed counts every request started before the logo paints, and on `/lineup/` that's
~100 modules (277 KB of JavaScript) plus Sleeper's and ESPN's start-up requests, so the bytes loaded before the first
paint, not the logo, set it.

**Fixed:** the remaining forced reflow on `/` (74 ms): `placeTabMarker` (js/shared/ui/viewTransition.js) measured the tab
bar during init. With a ResizeObserver, the marker is now first placed from its first report, after the browser's own
layout; later calls use the stored spots as before. view-transitions, keyboard and setup specs pass; screenshots
identical to main's.

**Put to the owner** (they offered to revisit earlier decisions): the minify build step (PageSpeed: 148.5 of `/lineup/`'s
277.7 KiB of JavaScript), loading the Scout / Trade / Simulator code on first use instead of at start-up, and deferring
the start-up Sleeper/ESPN requests until after the first paint.

**Owner's answer:** only **delay the ESPN/Sleeper fetch**. Keep no build step; loading the Scout / Trade / Simulator code
on first use (about 144 KB brotli, 39% of `/lineup/`'s start-up JavaScript) is not taken up now (noted in
docs/TESTING.md's follow-ups with the measurement).

**Built:** `js/mls/init.js` starts `refreshCurrentNflWeek` (Sleeper's NFL week, which then fetches ESPN's kickoff times)
two frames after the load event (`afterFirstPaint`), with a 3 s fallback for a background tab, instead of from the load
handler itself. On a fast first load the load event came before the logo's paint, so PageSpeed counted both requests
(~22 KB and two new connections) against the largest paint. The paint-timing API wasn't used: the specs' fake clock
leaves the page without paint entries, and every start-up would have waited for the fallback. Test first:
`tests/mls-startup-requests.spec.mjs` counts the frames drawn after `load` when the request goes out (0 on main, at least
1 now) and checks the week still arrives. **User-visible:** none to speak of; on a fresh load, bye badges and kickoff
times can appear a fraction of a second later than before.

### S17: PageSpeed on the last preview (188a0a73)

The owner ran both pages again after round 3: **`/lineup/` 87** (FCP 2.3 s, LCP 3.8 s, Speed Index 2.3 s; the live run
before S17 was 69 / 3.7 s / 6.0 s / 4.3 s) and **`/` 89** (FCP 1.6 s, LCP 3.3 s, Speed Index 4.4 s). On `/lineup/` the
filmstrip has no white frames any more and the logo's render delay fell from 1,020 ms to 110 ms now that the start-up
requests wait for the paint. `/` lists no forced reflow. Details in performance.md's last section. Nothing left for S17.


## F7 — The League Command Center stops asking for changes once games have kicked off

**The bug** (found by the owner on Sunday of week 6). The League Command Center asked for Sleeper changes after the early
games had finished, for players Sleeper had already locked. Each card's Sleeper changes, its red Lineup chip, "N to set"
and the strip's count all come from `collectLineupNeeds` → `getSleeperLineupChanges` → `sleeperLineupChanges`. That
chain compares the lineup the app saved with Sleeper's starters as of the last sync, and nothing in it checked
kickoff. A lineup saved at Optimize All on Sunday morning still started the 1 pm player the app preferred after Sleeper
had locked him on your bench. A league is only re-optimized when it's synced, or optimized on its own or by Optimize
All. Opening the Lineup tab re-shows the saved lineup if its rankings haven't changed.

**Reproduced on main first** (`tests/mls-lineup-needs.spec.mjs`, "Sleeper changes after kickoff (F7)"). The lineup is
optimized before any kickoff and starts Ja'Marr Chase (CIN) and Brock Bowers (LV), where the Sleeper fixture starts
Garrett Wilson (NYJ) and George Kittle (SF). Then the four games are moved into the past (`State.gameTimesByTeam`, as
the auto-lock specs do). On main the card still said "Set on Sleeper · Start Ja'Marr Chase, Brock Bowers · Bench George
Kittle, Garrett Wilson", with a red Lineup chip and the strip's "1 lineup to set on Sleeper". 8 of the new spec's 10
runs fail on main. The "still to play" test passes on both, as it should.

**Owner's decisions (asked after reproducing, with a sketch of each).**
1. A league whose remaining differences are all locked shows **nothing at all**: green Lineup chip, no Sleeper item, no
   "1 to set", and it leaves the strip's count (not a muted "N changes locked by kickoff" line).
2. A change that pairs a player still to play with a locked one is **re-optimized**, so the card names the best swap
   still allowed, the same as the Lineup tab (not just dropped). In the fixture, with only Cincinnati kicked off,
   that's "Start Puka Nacua, Brock Bowers · Bench George Kittle, Garrett Wilson". Nacua (LAR, still to play) takes
   Chase's place. Dropping the pair would have said "Start Brock Bowers · Bench George Kittle".

**What changed and where.**
- `js/mls/lineup/issues.js`: `sleeperLineupChanges(optimizedIds, sleeperIds, frozen)` leaves out any id `frozen` says
  has kicked off, on either side.
- `js/mls/lineup/gameInfo.js`:
  - `getSleeperLineupChanges` passes `kickoffFreeze(league, player) !== null`: the auto-lock's rule, not a second one.
    It already handles Best Ball (null), an auto-lock you overrode (null: shown, since that's you saying the kickoff
    data is wrong) and leagues with no Sleeper lineup (no comparison). This is the guard: whatever the saved lineup
    says, a kicked-off player is never a change. The cards and the Lineup tab's fold both read it.
  - `lineupBuiltBeforeKickoff(league)` is true when the saved lineup has a starter `kickoffFreeze` calls 'out' (his game
    started while he was on your Sleeper bench) or a bench player it calls 'in'. Players you locked are skipped (the
    optimizer keeps them where they are). `noteLineupOptimized` records, per league, which teams had kicked off at its
    last optimize, and a lineup optimized since the last kickoff isn't flagged again. That keeps a lineup that can't
    match the freeze (say, someone Sleeper started who is now on your taxi squad) from re-running on every render. In
    memory, no storage key.
- `js/mls/render/lineup.js`: `optimizeLineup` calls `noteLineupOptimized`. A saved lineup that
  `lineupBuiltBeforeKickoff` flags is rebuilt when shown (like round 9's empty slot), so the Lineup tab names the same
  change the card does.
- `js/mls/render/dashboard.js`: `reoptimizeKickedOffLeagues()` follows `reoptimizeProjectionlessLeagues`'s pattern:
  `optimizeLineup(true, false, { batch: true })` per flagged league, the active one included, then one write of each
  lineup map, with toasts suppressed. It restores the active league and its rankings directly (`State.activeLeagueId`,
  `hydrateRankingsForLeague`), not with `switchActiveLeague`, which would redraw the Dashboard from inside its own
  render. The active league, scroll position, manual locks and `isAutoLockOverridden` are unchanged.
- `js/mls/render/leagueCards.js`: `renderLeagueCards` calls it before `collectLineupNeeds`, only while the Dashboard is
  the active tab (on another tab it runs after that tab's own lineup render, whose lineup mustn't be replaced under
  it).
- **When it runs:** on every Dashboard render, not when `refreshGameTimes` sees a new kickoff. Time passing doesn't
  fetch anything (the kickoff times are cached for the week), so a fetch-time hook would miss most kickoffs. The check
  is a `kickoffFreeze` per rostered player per league, and a re-optimize happens only for a league a kickoff caught.
- **EARLY chip:** `leagueStatus` counts a starter's early game only while it's still to come (`!hasKickedOff`). The
  Lineup tab's per-player EARLY tags are unchanged: those rows already say "Started" or "Final".
- **Urgent Sleeper changes:** an Out player still in your Sleeper lineup is frozen 'in' once his game starts, so the
  guard drops him and the card stops needing you. A player on bye has no game, so `hasKickedOff` never fires for him.
  Sleeper keeps him movable all week, so "Bench X (on bye)" stays until you set it, as before.
- CHANGELOG line under Lineup Strategist. `CACHE_NAME` v2.8.97 → v2.8.98. No new badge, file or key.

**Measured** (`npm run perf:tabs`, 21 leagues, 4x CPU, median of 5, main → this branch). The Dashboard switches are the
same within noise: lineup → setup 280 → 314 ms on phone and 326 → 350 on desktop, roster → setup 290 → 224 and
371 → 276. A one-off copy of the tool timed the worst case: all 21 leagues caught by a kickoff and re-optimized in one
lineup → setup switch. Phone median 346 ms against 302 ms with nothing to redo, and run-to-run noise is about ±50 ms.
The copy was deleted, not committed.

**Tests.**
- `tests/unit/lineupIssues.test.mjs`: kicked-off players on either side, a league whose only differences are frozen, a
  frozen player in both lineups, and the old behavior without the check.
- `tests/mls-lineup-needs.spec.mjs`, "Sleeper changes after kickoff (F7)", both widths:
  - all four locked: no Sleeper item, both chips green, no "1 to set", the strip hidden, no fold on the Lineup tab;
  - between players still to play: the change shown as before, red chip;
  - one side locked: re-optimized to "Start Puka Nacua, Brock Bowers · …", saved, the same on the Lineup tab's fold, the
    active league unchanged;
  - the Lineup tab rebuilds a lineup saved before a kickoff, and your locks stay as they were;
  - an Out Kittle in your Sleeper lineup stops needing you once his game starts (Bowers has no TE slot left: only the
    WR change remains), and EARLY goes once Buffalo's game starts.
- Best Ball is unchanged: `kickoffFreeze` and `lineupBuiltBeforeKickoff` both return early there.
  `mls-flex-choice.spec.mjs`'s Best Ball test passes.

**Screenshots:** none changed. The screenshot league has no Sleeper lineup and no kicked-off games. This container can't
render CI-matching baselines (F1, S9). Rendered here the same way, main and this branch give 40 pixel-identical PNGs
(`npm run pxdiff`).

**Checks.** `npm run check`: precache OK, 396 unit tests pass, 451 Playwright tests pass. The 10 failures are only
`visual.spec.mjs` (MDS and T-Score too), which this container can't match to CI's renderer.

**Known limit, not this card.** Kicked-off players are frozen where Sleeper's lineup had them at your last sync. If you
changed it on Sleeper after syncing, the app's idea of who is locked in can be wrong until the next sync. A per-league
sync is S13, parked.

**Found while testing, then fixed in round 2:** a lock on a player whose game started while he was on your Sleeper
bench kept him in the app's lineup, so the card showed half a swap.

### F7, round 2: a kickoff outranks your lock (owner's choice)

**Asked.** In round 1 a manual lock kept its player in the app's lineup even after his game started with him on your
Sleeper bench. The guard hid him, so the card showed only the other half of the swap. You locked Bowers in, Las Vegas
kicked off with Kittle starting on Sleeper, and the card said "Bench George Kittle" with nobody named for his slot.
Following it on Sleeper would leave the TE slot empty. I listed the pros and cons. The owner chose to let the kickoff
win, with a note suggesting something like "If this does not match your Sleeper lineup, sync again to update."

**What changed.**
- `js/mls/render/lineup.js` (`optimizeLineup`): `kickoffFreeze` is worked out for every player. A lock counts only when
  the freeze isn't 'out', so a locked player whose game started on your Sleeper bench is held out of the starter pool
  like anyone else. The lock stays in `State.lockedPlayersMap`, so an auto-lock override or a sync that shows he started
  brings it back. The override itself only exists on auto-locked starters' rows, which is why the note points to a sync.
- `js/mls/scout/waivers.js` (`lineupCheckDeps`): the same precedence, so best available and the Waiver Wire read the
  same lineup.
- `js/mls/lineup/gameInfo.js`: `lineupBuiltBeforeKickoff` no longer skips locked players. `getLineupIssues` passes
  `lockEnded` (locked, and `kickoffFreeze` 'out').
- `js/mls/lineup/issues.js`: `issues.lockEnded`, and one muted note per player (a note: not counted, no amber): "Your lock
  on Brock Bowers no longer applies: his game started with him on your Sleeper bench. If that's not your Sleeper lineup,
  sync again to update." It shows in the card's to-dos (with "Notes" as the label when it's the only item) and in the
  Lineup tab's box.
- A swap you make after a kickoff stays until the next kickoff re-optimizes the lineup (`kickoffKey`): a swap doesn't
  count as an optimize.
- CHANGELOG: the F7 line says so.

**Tests.**
- `tests/unit/lineupIssues.test.mjs`: the note's kind, wording and muted note status, not counted, none in Best Ball.
- `tests/mls-lineup-needs.spec.mjs`, "a locked player whose game started on your Sleeper bench is benched, with a note":
  - The card shows the note plus "Start Ja'Marr Chase, Trey McBride · Bench George Kittle, Garrett Wilson". McBride (ARI,
    still to play) is the rankings' next TE ahead of Kittle.
  - No "to do" count, no amber, and the lock list unchanged.
  - The Lineup tab: Bowers on the bench, McBride at TE, the same note, "Nothing needs you before kickoff", and the same
    changes in the fold.
- `mls-flex-choice`, `mls-best-available`, `mls-waiver-insights`, `mls-weakest-player` and `mls-weekly-locks` pass.

## F8 — Auto-Find calls a ranked player "unranked" when he isn't in the FLEX list

**The owner's case** (week 6, REDRAFT Late Round Board of Directors, Auto-Find, Starting Lineup, Weekly, FLEX):
Treylon Burks was WR69 (T13) in the Weekly rankings but not in their FLEX list. DeMario Douglas read "Wk Flex: Douglas
#98, Burks unranked". Jake Ferguson (TE19, T7, no FLEX rank) read "Replaces Treylon Burks · 6 tiers up". The verdicts
were right (S12 round 2's rule: FLEX rank, then any rank, then projections). The words weren't.

**Where "6 tiers up" came from** (the card's guess was right). The parser stores a player who isn't in the FLEX file
with `rank`/`tier` from his position file. `buildRankDisplayIndex` (S8 round 3's fallback) filled a missing FLEX tier
with `tier`. So Burks's "FLEX tier" was his WR tier (13) and Ferguson's was his TE tier (7). `comparedTiers` read both
for a Flex comparison, and `tierGapHTML` printed 13 − 7 = 6. That compared two different lists.

**Owner's decisions (asked after reproducing):**
1. **Wording (a):** "Wk Flex: Douglas #98, Burks not in Flex list (WR69 T13)". It names what decided the slot and still
   shows his rank. ROS's cross number reads "not in Overall list" the same way.
2. **The row's own "Wk Flex: UR" cell: keep "UR".** His position rank sits beside it on the same row.
3. **Whole Roster's header too, the same way:** "Your weakest RB/WR/TE is CeeDee Lamb (Wk Flex: not in list · WR30 ·
   T8)". Before, it read "(unranked by Weekly)".

**User-visible effect.**
- In Auto-Find and Check a List, a FLEX comparison names a player who has a position rank but no FLEX rank as "not in
  Flex list (WR69 T13)", both on the free agent's side and on your player's side. It still says "unranked" only for a
  player who's in none of the file's lists.
- Whole Roster's "Your weakest" and "Next weakest" use "Wk Flex: not in list · WR69 · T13" for the same case.
- A tier gap ("· N tiers up") shows only when both numbers come from the same list. Ferguson's line now has no gap.
- Display only. Who's listed, their order, the verdicts, the pills, Auto-Find's counts, `isTierUpgrade` and `upgradeGap`
  are unchanged. The spec pins each listing as it reads on main, and it passes on main.

**What changed and where.**
- `js/mls/scout/waiverScanner.js` `buildRankDisplayIndex`: `flexTier` is set only beside a FLEX rank, so it's null for a
  player outside the FLEX list. A single file still gets its overall tier on every FLEX rank, as in S8 round 3.
- `js/mls/scout/waivers.js`:
  - `comparedTiers`: a tier only beside the number it belongs to. This holds even if a future display index carries a
    stray tier. `isTierUpgrade` already returned before reading tiers whenever either number was missing, so its
    results can't change.
  - `waiverCompareLine`'s `fmt`: "not in Flex list (WR69 T13)" when the line shows Flex/Overall and the player has a
    position rank. `plainTier` draws the tier span without `tierTag`'s parentheses, since the parenthesis is already
    open.
  - `renderRosterGroup`'s `rankText`: the header form, inside one `.mls-nowrap`.
- `sw.js`: `CACHE_NAME` v2.8.98 → v2.8.99. CHANGELOG has two lines under Lineup Strategist.

**Checked and left as they are** (other places that print "unranked" or "UR"):
- **Top Available rows:** the chip is the position rank. A missing Flex number shows "–", not "UR".
- **Top Available's Trending "UR":** used only when the player is in none of your lists.
- **Dashboard Best Available** (`bestAvailable.js`): "over X WR30" uses the position rank. "(unranked)" appears only
  without one. Its FLEX upgrade check (`flexTierOf`) reads tiers only when both players have a FLEX rank (`upgradeGap`
  returns before tiers otherwise), so there was nothing cross-list to fix.
- **The Waiver Wire row's "Wk Flex: UR" and "ROS: UR" cells:** kept (decision 2).
- **Trade Analyzer's UR:** it means no value at all. Not touched.
- **Lineup tab:** `render/lineup.js` still falls back `flexTier ?? tier` for its own badge. That badge shows a Flex
  part only beside a FLEX rank, so a stray tier never shows. Not in this card's scope.

**Tests** (rule 4: they fail on main and pass now).
- `tests/mls-waiver-flex-unranked.spec.mjs` (both widths) uses the fixture league with one FLEX slot. Its Weekly rankings
  are shaped as per-position files plus a short FLEX file with no tiers. CeeDee Lamb (WR30, T8) is outside the FLEX
  list and is your FLEX. Smith-Njigba (FLEX #5) replaces him by FLEX rank. LaPorta (TE5, T2, no FLEX rank) replaces him
  by projection. The spec checks:
  - Auto-Find and Check a List show the new numbers lines, no `.mls-tier-gap`, no "unranked", and "Wk Flex: UR" on
    LaPorta's row.
  - Each `.mls-nowrap` in the numbers line is on one line, at 390px and 1280px.
  - Whole Roster FLEX, with the rest of your roster added to the FLEX list, shows the new header in one `.mls-nowrap`.
  - Every listing (names, order, verdict text, pills) equals the one pinned from main. With the code reverted, a copy
    of the spec without the wording checks passes, which shows the listings match main.
- `tests/unit/waiverScanner.test.mjs`: a player outside the FLEX list has a null `flexTier` and keeps his `posTier`.
  This fails on main.

**Screenshots.** None changed or re-taken. The screenshot league has no Auto-Find or Check a List result, and its
rankings are a single file.

**Checks run.** `npm run check`: check-precache OK, 398 unit tests pass, and 455 Playwright tests pass, the new spec
included. The 10 screenshot comparisons that fail in this cloud session (`visual.spec.mjs`, the font environment noted
in earlier entries) fail on main too. I rendered all 40 screenshots on main and on this branch here, and `npm run
pxdiff` found them all pixel-identical.

**Left over.** None. The legend needed no line: the wording is plain text, not a badge or chip. Its "· 1 tier up" line
still holds.

## F9 — Trade Analyzer: Receive and Give line up on desktop

**The problem.** Since S14 round 8 the form's two sides sit side by side from 768px, but only Receive has a row above its
players (the From drop-down, Sleeper leagues), so Give's players and search box sat a row higher than Receive's, and an
uneven number of players moved the search boxes apart again.

**The owner's decisions.** I showed mockups of (a) a "From" row on Give, (b) shared rows with no new text, (a)+(b), and
(c) "Trading with" above both columns, at 1280px and 768px (and 375px for (c)). The owner picked **(a)+(b)**; Give's row
reads **"From  You (username)"** (the app keeps only the Sleeper username a league was synced with, no team name; Power
Rankings says just "You"); in **manual and hand-off leagues neither side has a From row**.

**User-visible effect.**
- From 768px, the two sides' rows line up: From with From, players with players, search box with search box, draft-pick
  row with draft-pick row, whatever the number of players on each side (each row is as tall as the taller side's).
- In Sleeper leagues, Give shows "From  You (mds_test)" as plain text, the drop-down's height, across from Receive's
  drop-down; a long username ends in "…" on one line (full name on hover).
- Manual and hand-off leagues: no From row on either side, rows still level.
- Phones (stacked, under 768px): unchanged; Give's From row is hidden there.

**What changed and where.**
- `lineup/index.html`: the form's `.mls-trade-sides` also has `.mls-trade-form-sides` (the results' two columns keep
  their own layout), and Give's picker has `#tradeGiveTeam` (`.mls-trade-team.mls-trade-team-you`, hidden until synced)
  with `#tradeGiveTeamName`.
- `js/mls/trade/picker.js` `syncTradePicker`: fills the name with `textContent` (so it's escaped) from
  `league.username` and shows the row only when Receive's From row shows.
- `css/mls.css`: `.mls-trade-team-name` (plain text with the drop-down's padding and height, ellipsis), hidden under
  768px; from 768px, inside `@supports (grid-template-rows: subgrid)`, the sides share five rows (header, From, players,
  search, picks) through nested subgrids, each item placed in its row, the picker's 0.45rem flex gap turned into
  margins so a hidden or empty row takes no space. A browser without subgrid gets the old flex columns (plus the From
  row on Give).
- `sw.js`: `CACHE_NAME` v2.8.99 → v2.8.100. No new files. CHANGELOG line under Lineup Strategist. The Guide's step 9 is
  unchanged (it already explains From); no legend line (no new badge).

**Tests.** `tests/mls-trade-sides-align.spec.mjs` (fails on main, passes now): at 1280px in the fixture Sleeper league,
Give's From row says "You (mds_test)", is level with and as tall as Receive's, and `#tradeGetSearch` / `#tradeGiveSearch`
share a top edge (and so do the first players) with both sides empty, one player each, two on one side, one side empty,
and five on Give (wrapping to two lines); in dynasty, the pick rows too. A long username with markup in it shows as text,
cut with "…" on one line, no sideways scroll. A manual league: no From on either side, rows level. At 375px: stacked,
no From row on Give, Give's players right under its title as before.

**Screenshots.** One changes, by design: `desktop/mls-league-scout.png` (Give's From line added; Give's search box moves
down level with Receive's; pixels differ only in Give's column, x 652–1190, y 691–787). The other 39, all 20 phone PNGs
included, are pixel-identical to main: I rendered all 40 on main and on this branch in this container and compared them
with `npm run pxdiff`. This container can't reproduce CI's renders (the font environment noted in earlier entries), so the
PNG isn't re-taken yet. Take it from the pull request's CI run (`playwright-results` artifact, "Accepting an intended
visual change" in docs/TESTING.md), with the usual checks that its `-expected.png` matches the committed baseline.

**Checks run.** check-precache OK; 398 unit tests pass; 459 Playwright tests pass, the new spec included. The 10
`visual.spec.mjs` comparisons that fail here fail on main too (this container's fonts).

**Left over.** The re-take is done (below). No open follow-up in docs/TESTING.md
touches this area.

### F9, pull request (btrerise/My-Draft-Strategist#204): the screenshot from CI

CI run 39681637605 (commit 30fb1fd) failed only `visual.spec.mjs` "MLS synced league tabs" on desktop, on
`mls-league-scout.png`; every other test passed. CI's `-expected.png` was byte-identical to the committed baseline, and its
`-actual.png` (still 1280×1971) differs only in Give's column (x 652–1190, y 680–772: the From line and the search box one
row lower), matching this container's main-vs-branch comparison. Committed CI's `-actual.png` as
`desktop/mls-league-scout.png`. Nothing is left over.

## S21 — This week: every league's matchup, live, with the swing matchups

**User-visible effect.** A **This week** card at the top of the Dashboard's League Command Center (under Sync All /
Optimize All, above the league cards), from the owner's sleeper-weekly-recap skill:
- **Header** (it folds to this line, remembered): "Week 7", your W-L as it stands across every head-to-head Sleeper
  matchup, "N still live", a **Provisional** chip (amber) until every game of the week is final, then **Final**, and
  **Refresh**.
- **Splits:** "Paid 4–2 · Free 5–4" (or, until a league is marked paid, a hint to mark them) and "Redraft 3–2 · Dynasty
  6–4", with "(keeper counts with redraft)" when a keeper league is in it. Guillotine leagues are redraft (owner's note:
  a chopped league is a redraft league of a specific kind, like Best Ball), but have no W-L of their own.
- **Still in play:** the swing matchups, most uncertain first, each with both scores, the margin, "**38% to win**" from
  the Matchup Simulator's math, and the live players on each side ("You: Justin Jefferson WR", "Them: nobody left").
- **Effectively decided: 11 (8 W, 3 L)** on one line ("Done" once every game is final).
- **All leagues:** one line per league: W / L / T, the name ("$" if paid), "vs Opponent" (plus "median: 4th of 12
  (above)" in a league that also plays the median, "Best Ball"), your points–theirs and the margin, right-aligned.
- **Notes:** a guillotine league's place ("Chop Shop · Guillotine (no opponent): 98.4, 7th of 10 alive, 4.2 above the
  lowest · 3 live", or "lowest of 10 alive, 1.2 behind the next team", or "your team has been chopped"); leagues with
  no matchup this week; manual leagues ("2 manual leagues: no Sleeper matchup to show"); and "Couldn't load from
  Sleeper: X. Tap Refresh to try again." for a league whose fetch failed, with every other league still shown.
- Before the week's first kickoff it reads "Week 7 starts Thu 8:15 PM" and lists each opponent without scores.
- **Reorder** on the League Command Center has a **"$ Paid"** switch per Sleeper league; a paid league shows a "$" badge
  on its card and in This week.
- **Roster tab:** under the league name, your record ("5–2"), "Points for 3rd of 12 (812.4)" and "Points against 9th of
  12 (760.1)", as of the last sync (shown after a league's next sync; hidden for manual leagues and before anyone has
  played).

**Owner's decisions (asked before building).**
1. Where: a **Dashboard card that folds**, above the league cards.
2. Paid vs free: a **"Paid league" switch in Reorder mode**, saved on the league; plus the owner's idea of a **"$" badge**
   (shown on the league card and in This week, at every width).
3. Ranking swings: the **Simulator's win chance**, shown as a percent ("I like the interconnectedness of features").
   The skill's rule of thumb still decides what counts as in play; the percent orders them.
4. Refresh: **when the Dashboard opens plus a Refresh button, no timer** (run it before SNF, before MNF, after MNF).
5. Season records: **not on each line; on the Roster tab instead**, next to the league name, with points for and
   against ranks (built here, the owner's long-standing ask).
6. Image export: **not now, but wanted**; the owner also wants an **Export on the Roster tab**. Both noted under "Open
   follow-ups" in docs/TESTING.md.

**What changed, and where.**
- `js/mls/week/scoreboard.js` (new, no app state): the skill's rules. `starterState` (live / done / dead: live until his
  team's game is `post`; bye, no team or Out (`SIM_EXCLUDE_STATUSES`) is dead), `reachOf` (QB 20, RB/WR 15, TE/K/DEF 8,
  less what he has scored), `sideSummary` (Best Ball counts live bench players, the best `starters.length` reaches),
  `classifyMatchup` (done when nobody is live; decided when the trailing side has nobody live, or its reach is short of
  a gap of 25+; otherwise a swing), `medianPlace`, `guillotinePlace`, `summarize`, `swingOrder` (the underdog's chance,
  min(p, 100 − p), highest first; then the smaller gap), and the sync helpers `teamNamesFrom`, `playsMedian`,
  `isGuillotine`, `seasonRecord`, `ordinal`.
- `js/mls/week/thisWeek.js` (new): the card. `refreshThisWeek` fetches `GET /v1/league/<id>/matchups/<week>` for each
  Sleeper league, five at a time, for Sleeper's `week` (`State.currentNflWeek`), after the scoreboard, projections and
  player map; it reuses anything fetched in the last 2 minutes unless forced (Refresh) and fetches a league added since.
  Draws scores first, then adds win chances. Your entry by `league.rosterId`, the opponent by `matchup_id`; points are
  `custom_points` when Sleeper sets it, else `points`. Guillotine: `league.guillotine`, or, for a league synced before
  S21 whose meta didn't load, every roster having its own `matchup_id`.
- `js/mls/sim/winChance.js` (new): the Simulator's inputs gathered as `runMatchupSim` does (actual points once a
  player's game has kicked off, projection plus his history's spread before, Doubtful/Out/IR left out) and run through
  its own `sim/worker.js` instance (so it never answers the Lineup tab's Simulator run), returning each matchup's win
  chance. One difference from the Simulator card: a player whose game has kicked off counts even with no game history
  (the card drops him, losing real points). No change to the math.
- The cache: `State.lineupActualPoints[leagueId]` (the Lineup tab's, `js/mls/lineup/gameInfo.js`) now holds the whole
  matchups response and `finalTeams` (every team final at fetch time) in place of the lineup-only `finalKey`;
  `storeLeagueMatchups` writes it for both the Lineup tab and the card. In memory only, as before.
- `js/mls/leagues/sync.js`: the league object gains `teamNames` ({ roster_id: display name }), `medianMatch`,
  `guillotine`, `record` (from the rosters a sync already fetches) and `paid` (carried over like `rosRankingSetId`).
  Backup/Restore copies `mls_leagues` whole, so `paid` round-trips. A league synced before S21 reads its names and
  flags from Sleeper once per visit (league, users, rosters) until its next sync.
- `js/mls/render/leagueCards.js`: "$ Paid" in Reorder (`toggleLeaguePaid`), the "$" badge on the name, and the card's
  load when the Dashboard is shown (redrawn otherwise). `js/mls/state.js`: loads it once Sleeper's week is known.
- `js/mls/render/roster.js`, `lineup/index.html`: `#rosterRecord`. `#thisWeekCard` in the Command Center.
- `js/mls/badges.js` + `js/mls/legend.js`: `paidBadgeMarkup`, `weekResultMarkup` (W/L/T), `weekStatusMarkup`
  (Provisional/Final), each with a legend line. `css/mls.css`: the card, the badge, the record.
- `js/shared/storage/keys.js`: `mls_this_week_folded` ('1' while folded). `sw.js`: the three new modules in
  `PRECACHE_ASSETS`, `CACHE_NAME` v2.8.100 → v2.8.101. CHANGELOG lines under Lineup Strategist.

**What I found in the owner's leagues (Sleeper API, week 7).** LOOG - Chop Shop is `settings.type` 3; every roster has
its own `matchup_id`; chopped teams stay in the matchups with 0 points and no players (and 0 wins in the rosters). Eight
leagues have `league_average_match` 1. `week` and `leg` agreed (7).

**Measured.** 21 leagues, every one a swing, CPU slowed 4x (local server, so no network latency): from a reload, the
scores were up in about 1.1 s and all 21 win chances 0.1–0.45 s after (the week stats come from IndexedDB after the
first visit). The Dashboard never waits on the Simulator.

**Tests.** `tests/unit/weekScoreboard.test.mjs` (the rules, median, guillotine, Best Ball, splits, order, record).
`tests/mls-this-week.spec.mjs` (both widths): Sunday of week 2 with ESPN's scoreboard stubbed, two Sleeper leagues
(the generator now writes "Second Fixture League", id …021, dynasty, and the mid-Sunday and final matchups): the
headline "1–1 · 1 still live", Provisional, the splits (hint, then "Paid 1–0 · Free 0–1" after "$ Paid"), the swing
(−12.0, "Justin Jefferson WR", "Them: nobody left", a percent), "Effectively decided: 1 (1 W, 0 L)", each line's scores;
Paid survives Sync All; the fold survives a reload; Final and 2–0 after Refresh once every game is `post`; a league
whose matchups fail is named and the other still shows; a guillotine league and a median league; one line per league
at 375px, names whole, scores right-aligned; the Roster tab's record.
Also `tests/mls-league-cards.spec.mjs`: its "each league's name shows once in the Command Center" check (S12) now leaves
out the This week card, which lists every league by design.

**Screenshots.** Six change, by design (the screenshot league's default matchups are at 0 points, so the card shows
its before-kickoff state, "Week 2 starts soon", with the opponent line):
- `desktop/mls-league-setup.png`, `phone/mls-league-setup.png`: the This week card above the league cards.
- `desktop/mls-league-roster.png`, `phone/mls-league-roster.png`: the record line under the league name ("0–1 · Points
  for 1st of 2 (120.0) · Points against 1st of 2 (110.0)").
- `desktop/mls-league-guide.png`, `phone/mls-league-guide.png`: three new lines in the badge legend ($, W/L/T,
  Provisional/Final).
The other 34 are pixel-identical to main: I rendered all 40 on main and on this branch in this container and compared
them with `npm run pxdiff`. This container can't reproduce CI's renders (its fonts, as in earlier entries), so the six
aren't re-taken yet: take them from the pull request's CI run ("Accepting an intended visual change" in
docs/TESTING.md), checking each `-expected.png` matches the committed baseline.

**Checks run.** check-precache OK; 408 unit tests pass; Playwright: 467 passed, the new spec's 12 included; the 10
`visual.spec.mjs` comparisons fail here as they do on main (this container's fonts); `mls-league-cards.spec.mjs` failed
until the change above, then passed (10/10).

**Left over.**
- Re-take the six PNGs from CI (above).
- **S20:** `js/mls/sim/winChance.js` imports the Simulator's `stats.js` and starts `sim/worker.js`. When S20 loads the
  Simulator on first use, load `winChance.js` through its loader from `week/thisWeek.js` (`addWinChances`), after the
  scores are drawn, as now: the card must never wait on it.
- **S22** builds on this card: each league's matchups (`players`, `starters`, `players_points`) are in
  `State.lineupActualPoints[leagueId].matchups`, and `buildRows()` in `week/thisWeek.js` has every league's result.
- The owner wants an image export of this card and an Export for the Roster tab (both under "Open follow-ups" in
  docs/TESTING.md).
- In-progress games: like the Simulator, a player whose game is under way counts as his points so far (no spread), so
  a win chance mid-game understates the trailing side. The owner runs it between game windows, where that doesn't
  arise; a change would be to the Simulator's math, out of scope here.
- Sleeper moves `week` to the next week some time after MNF; a run after that shows the new week before kickoff. The
  skill's post-MNF run is Monday night, before the switch.
- Open follow-ups this touched: none of the existing ones.

### S21, round 2: the owner's review (real week 6 data, phone and desktop)

The owner looked at the card with their own leagues (week 6, through the console) and asked for these; all built:
- **`?week=` in the address** (owner: yes, if it helps later sessions and users are unlikely to find it; both hold).
  `/lineup/?week=6` shows week 6 in this card only: its own ESPN scoreboard (`parseEspnScoreboard`, now shared from
  `js/mls/state.js`) and Sleeper projections, with a notice on the card ("Showing week 6 because the address has
  ?week=6"). The rest of the app stays on Sleeper's week. `weekFromSearch` (scoreboard.js) accepts 1–18 only.
  docs/TESTING.md mentions it under "How the tests work".
- **Header:** "Week 6 Recap" ("Week 7 Matchups" before the first kickoff), an (i) tooltip saying what the card shows and
  that the win chance is the Matchup Simulator's, and "**Record 14–6**" (labeled, owner's ask; the splits under it stay
  unlabeled). On phones Refresh is its icon and the record wraps under the title, so the controls stay on one row.
- **User Guide:** step 2 (League Command Center) gains "Week Recap" and "Paid leagues"; step 6 (Matchup Simulator) says
  the Week Recap uses the same simulation.
- **Lines:** the owner asked whether "115.7–97.6" reads as you–them. Probably, next to the W/L, but not certainly, so each
  line now has your score beside your league's name and your opponent's beside "vs <opponent>", the margin to the right
  of both, and "You / Them" over the column. The median and Best Ball go on a note line of their own (they made the
  opponent line wrap on phones). On wide screens the lines keep a 720px reading width.
- **Guillotine:** a line like the others (owner: less muted), in league order: no W/L, your score against the chop line
  (the lowest of the other teams still alive, or the next team up when you're the lowest), the cushion as the margin,
  and "Guillotine: 1st of 11 alive · 3 still to play". `guillotinePlace` returns `against` for it.
- **Turning it off:** I suggested the fold is enough (one line when folded, remembered; nothing to turn off for anyone
  without Sleeper leagues, who never see it). A setting can come later if the one line bothers anyone.
- **Roster tab:** the record moved into the card's header, above its line, labeled "Record 4–2". On phones the league's
  name takes the card's width, the format goes on the line below, then the record (owner's order; I agreed: the format
  describes the name, so it stays next to it). On desktop I suggested leaving name and format on one line with the
  record under them rather than all on one line: long league names would push the record off the end.

Spec updates: the header and line selectors, the guillotine line, the Roster record's place, and a new test for
`?week=1` (its own scoreboard request, the notice, Final, `State.currentNflWeek` unchanged).

Checks after round 2: check-precache OK; 409 unit tests pass; Playwright 473 passed, the 10 `visual.spec.mjs` comparisons
failing here as on main (this container's fonts). Rendered main and this branch here again: the same six PNGs change
(Dashboard, Roster and Guide at both widths, now with round 2's layout) and the other 34 match main. Still to do: take
the six from the pull request's CI run.

### S21, round 3: the owner's review

- **The card's chevron turns like a league card's.** The fold redrew the whole card, so the chevron's CSS turn never
  played. It now folds in place (`toggleThisWeek` → `applyFold`, inside `withCardsTransition` from
  render/leagueCards.js, the league cards' own helper): same element, same speed, and the cards below move with the
  same view transition. The body is always drawn, `hidden` when folded.
- **Desktop: the numbers at the card's right edge.** Round 2's 720px reading width left the scores partway across the
  card; that cap is gone, and "You / Them" sits over the score column.
- Spec: the fold keeps the same chevron element and hides the body; at 375px and 1280px each line's margin ends at the
  card body's right edge. Ran `mls-this-week`, `mls-league-cards`, `view-transitions` and `tooltips-onscreen`
  (47 passed, 1 skipped as on main), check-precache and the unit tests. The six screenshot PNGs listed above still
  change (the Dashboard one with this round's layout) and still need taking from CI.

### S21, round 4: the same fold animation as a league card

The recap's chevron still turned differently, and its body just appeared (owner). The cause: a league card's fold
animates because `nameCards` (render/leagueCards.js) gives each card a view-transition name for the transition, so the
browser grows its box (`.vt-card`, css/base.css) and shows its chevron turning live; the recap had no name, so it was
part of the page's crossfade. `nameCards` now names `#thisWeekCard` (`vt-lc-week`) and the toolbar under it
(`#leagueCardsToolbar`, `vt-lc-toolbar`) like cards, near the screen only, in every cards transition: the recap folds
exactly as a league card does, and the toolbar and cards below move with it. Checked frame by frame at a tenth of the
speed on a phone, beside a league card's fold. `view-transitions.spec.mjs` has a test for it (the names during, the
`cards` kind, the names gone after). 45 passed, 1 skipped (as on main) across view-transitions, mls-this-week and
mls-league-cards.

### S21, round 5: the owner's answers to my review as a user

- **Folded before kickoff** (my suggestion 2, yes): until the week's first kickoff the card starts folded ("Week 7
  Matchups · starts Thu 8:15 PM"), unless you opened it yourself that week. `mls_this_week_folded` now holds '1'
  (folded by you, as before) or 'open-<season>-<week>' (opened by you before that week's kickoff); after kickoff an
  untouched card is open. The screenshot league is before kickoff, so `mls-league-setup.png` shows it folded.
- **"0% to win" under Still in play** (suggestion 3): the owner asked how 12 points could be 0%. It was the fixture: its
  invented history gives "Jefferson" 9.4 a game with a spread of about 1.3 and a projection of 8.3, so 12 is nearly
  three spreads out (about 0.2%, shown as 0%). The real Jefferson (about 15.9, spread around 7) would be about 65-70%.
  The spec now sets his projection to 12.5 for the swing case (a percent between 15 and 95) and keeps 8.3 for a new
  case: a swing by the rule of thumb that the Simulator puts under 0.5% (or over 99.5%) counts as effectively decided
  (owner: "where there is genuinely a 0% chance"). Done at draw time, after the chances arrive.
- **The paid hint's ✕** (suggestion 4, yes): `mls_paid_hint_dismissed` = '1'; data-action `dismissPaidHint`.
- **Suggestion 1 (fold "All leagues")**: the owner asked whether each league's score should live on its league card
  instead, with the recap as a summary. Not built yet; my recommendation went back to the owner (see the summary).
- Tests: the new cases above, the before-kickoff fold (and 'open-2026-2' surviving a reload), and the view-transitions
  test now checks the fold toggles whichever way it started.

### S21, round 6: a Scoreboard tab (the owner's choice after weighing the options)

After my review as a user (the recap made the Dashboard long), the owner asked for the options' pros and cons and for
others. I offered: a result on each league card plus the recap (A), cards only (B), recap only (C), a Lineups | Scores
switch on the Command Center (D), a grid of tiles instead of a list (E), and per-league detail on the Lineup tab (F); then
a Scoreboard tab, which keeps D's benefit without a mode you can forget is on. The owner chose: **a Scoreboard tab with
E's tiles, a one-line summary on the Dashboard, a matchup strip on the Lineup tab, and the league cards unchanged**; plus
**labels only under the active tab** in the bottom bar (owner's idea, pointing to Material 3's navigation bar guidance;
m3.material.io is blocked from this container, so I went by what I know of it: 3–5 destinations, active-only labels
allowed for 4–5). Merging Roster and Lineup to make room: not needed (five tabs fit) and not done.

- **Scoreboard tab** (`#scoreboardTab`, between Lineup and Scout; Feather-style trophy icon; drawer entry; swipe order;
  number keys 4 Scoreboard, 5 Scout, 6 Guide; `#scoreboard` in the address). `#thisWeekCard` lives there: the header,
  splits, Still in play and the decided line as before, then **every league as a tile**, closest first (still in play
  first, by uncertainty; then by the gap): the W/L chip, the "$", the name whole, "You" and your score, "vs <opponent>"
  and theirs, then the margin and notes (median, Best Ball, guillotine place). A colored edge: green ahead, red behind,
  grey tied or before kickoff, blue guillotine. Two across at 375px, five at 1280px. A tile opens that league's Lineup
  tab (`openLeagueLineup`). Before kickoff the tiles name the opponent only, in your league order.
- **Dashboard**: `#weekSummaryLine`, one button ("Week 7 Recap · Record 9–6 · 4 still live · Final · Scoreboard ›").
  The fold is gone (round 2–5's fold, its view-transition naming in `nameCards` and the round-4 test are removed), and
  with it `mls_this_week_folded`, which never reached main, so it isn't in RETIRED_KEYS.
- **Lineup tab**: `#lineupMatchupStrip` above the rankings card: W/L, the week, "vs <opponent>", both scores, the margin,
  then the win chance and who's still to play (or "Effectively decided" / "Final"); before kickoff, "starts Thu 8:15 PM";
  a guillotine league, its place. It redraws with the lineup (render/lineup.js asks for this week's data, at most every
  2 minutes) and opens the Scoreboard.
- One render, three places: `renderThisWeek` builds the model once and draws the tab, the line and the strip.
  `refreshThisWeek` runs when the Scoreboard, the Dashboard or the Lineup tab shows, and once Sleeper's week is known on
  the Dashboard or Scoreboard.
- **Bottom bar** (css/mls.css, phones only, Lineup Strategist only): inactive labels fade out but keep their space and
  stay readable by screen readers; the active one fades in. Wider screens keep every label (there's room, and Material
  3 prefers labels when they fit). Draft Strategist's bar is unchanged.
- Tests: `MLS_TABS` includes the Scoreboard (smoke, screenshots and the CSS tool visit it); `mls-keyboard` checks keys
  1–6; `mls-this-week` rewritten for the tab, the tiles, the Dashboard line (opens the tab), a tile opening the league's
  Lineup with its strip (and the strip following a league switch), the pre-kickoff tiles and strip, two tiles across
  at 375px and 1280px. 73 passed and 1 skipped (as on main) across this-week, smoke, startup requests,
  view-transitions, league cards, tooltips and SVG icons.
- **Screenshots** (main and this branch rendered here and compared with `npm run pxdiff`): 14 differ, all by design, the
  other 28 (Draft Strategist and T-Score) are identical. New: `mls-league-scoreboard.png` (desktop, phone). Changed:
  `mls-empty-setup` and `mls-league-scout` (only the tab bar: the fifth tab, and on phones one label), `mls-league-setup`
  (the Week Recap line), `mls-league-lineup` (the matchup strip), `mls-league-roster` (the record above the header's
  line), `mls-league-guide` (the Guide's new lines and the legend), each at both widths. All to take from CI.
- **Checks**: check-precache OK, 409 unit tests, Playwright 481 passed, 5 skipped; the 10 `visual.spec.mjs` comparisons
  fail here as on main (this container's fonts). A first full run caught a syntax error I'd added to the Scoreboard's
  tooltip (an unescaped apostrophe that stopped the page loading), pushed for a few minutes; fixed in the next commit.

**After the syntax error (round 6).** The owner opened the branch's preview in a private window and got Lineup
Strategist's "Something went wrong loading the app" banner (`SyntaxError: Unexpected identifier 's'`): that preview was
still serving commit b339938's `js/mls/week/thisWeek.js`. JS and CSS are served from the service worker's cache first
and refreshed in the background (sw.js), and the fix commit kept the same `CACHE_NAME`, so a browser that had cached
the broken file could keep serving it. `CACHE_NAME` v2.8.101 → v2.8.102, so every browser that saw the bad build takes
a fresh copy. Lesson for later cards: bump `CACHE_NAME` again in a fix commit that follows a broken push, even on the
same branch.

### S21, round 7: one league per row on phones, a scoreboard icon, and Material 3

- **Phones: one league per row** (owner: two across was crowded, worst with the "$"). Below 600px each tile is one row:
  the W/L, "$" and name with your score at the right, "vs <opponent>" with theirs, then the margin and notes; "You" is
  dropped. Wider screens keep several across. The tile's parts are now siblings in one grid (`.mls-week-tile-btn`), so
  CSS alone switches the layout. Spec: one per row at 375px, side by side at 1280px.
- **Icon** (owner didn't like the trophy and asked for a literal scoreboard): Feather and Lucide have none; Material
  Symbols' "scoreboard" is a filled glyph that wouldn't match the bar. I drew one in the bar's style (Feather stroke,
  24px grid): a board showing "0:0" on two posts. Used in the tab bar, the drawer and the Dashboard's line.
- **Material 3** (m3.material.io opened for this session; read the navigation bar's Guidelines, Specs and Accessibility
  pages): what it says, against what the app does, went to the owner (see the summary). In short: labels on every item
  ("Don't remove the labels from navigation items"), so round 6's active-only labels go against it; a filled (or
  heavier) icon, a bold label and an active-indicator pill for the selected tab; 3–5 destinations (5 is the limit);
  labels 1–2 words, never truncated or shrunk; the bar is for phones and tablets only, with a navigation rail on wider
  windows, and on tablets horizontal items (icon beside label).

### S21, round 8: the owner's answers on Material 3, and "Edit"

- **Labels on every tab again** (owner: "I must have misremembered"; Material 3: don't remove labels). Round 6's
  active-only labels are gone.
- **Active tab**: a **bold label** (700; the others 500) and a **heavier icon** (stroke 2.6, Material 3's rule for icons
  without a filled version), in css/base.css, so Draft Strategist's bar matches. **No pill**: the owner asked whether
  the pill and the green marker should both show; I recommended the marker alone (the pill would be a fourth cue
  saying the same thing, and the marker's slide is the nicer motion), and the owner agreed.
- **Equal tab widths**: `.nav-btn` got `min-width: 0`, and its side padding went from 0.5rem to 2px with
  `white-space: nowrap`. With five tabs a bold "Scoreboard" no longer fit its fifth of a phone, so the active tab grew,
  the marker (measured once) missed it, and `view-transitions.spec.mjs` caught it. Measured with the test fonts: labels
  fit from 375px; at 360px bold "Scoreboard" is 2px over its space and at 320px a few more, spilling (not cut) into the
  gap between tabs; Outfit, the site's font, is narrower.
- **"Reorder" is now "Edit"** (owner asked whether the word still fit, since it also marks paid leagues and removes
  leagues): the button's text and aria-label, the tooltip, the Guide, the legend line, the Scoreboard's paid hint.
  Ids and function names (`#reorderLeagueCards`, `toggleLeagueReorder`) stay.
- **New card S26** (owner: "write up the navigation rail as a new card, and add to the runbook"): a navigation rail on
  computers and horizontal tab items on tablets, per Material 3; added to the runbook (cards, plan step 7, lanes,
  answers). Not built here.
- Screenshots: the tab bar change also changes Draft Strategist's PNGs (every one shows the bar). To take from CI with
  the rest.

### S21, round 9: the owner's answers to the second user-hat review

- **Median, in words** (owner: "show Median: L (4th of 6)"): tiles say "Median: W/L (Nth of M)", or "Plays the median"
  before kickoff. The record gains a **Median** split: the W-L of the median games in the leagues that play one, with a
  note that Record itself is head-to-head.
- **The splits as chips** (owner: "the stack of text is plain-looking"): Paid / Free (once a league is marked paid),
  Redraft, Dynasty and Median, each a small rounded chip, with one helper line under them for keeper and the median.
  The "Done: N" line is gone once every game is final (it only repeated the record); "Effectively decided" stays while
  games are on.
- **Lineup strip: status inline.** "Final", "Effectively decided", the win chance and the median now sit on the strip's
  main line, which wraps on a phone; only a swing's live players get a second line.
- **Tiles**: no "You" label on desktop (every width now uses the phone layout: name and your score on the first line,
  opponent and theirs on the second); a chevron in the bottom-right corner (it opens the lineup); the W/L chip moved
  from before the name to the foot, beside the margin, and the "$" badge now runs as text after the name's last word.
  That was the owner's "cards look a little off": a badge before the name (W/L) or in a flex column beside it ("$")
  started paid and result names at different places.
- **Order**: closest first while games are on; league order (as on the Dashboard) before kickoff and once every game
  is final.

### S21, round 10: grouped splits, the strip's second line on phones, four across

- **Splits grouped** (owner: five loose chips read as if Paid + Free + Redraft + Dynasty + Median were all leagues):
  each group is one segmented pill whose parts add up to every league (Paid | Free, Redraft | Dynasty), with more space
  between groups; Median stands apart with "N of M leagues". Groups carry `role="group"` and an aria-label.
- **Lineup strip on phones**: the status (Final, Effectively decided or the win chance) and the median get a line of
  their own under the score; the chevron stays on the first line. On wider screens they stay beside the score.
- **At most four tiles across** (owner asked whether five felt crowded; I agreed: league names like "Second Fixture
  League" wrapped at five, and four keeps rows of a 12-league set to three): `minmax(max(200px, (100% - 3 gaps) / 4), 1fr)`.
  Narrower screens still drop to three, two, then one.

### S21, user-hat pass 3 (real leagues: week 7 before kickoff, week 6 final via ?week=6, phone and desktop)

Fixed straight away:
- **A guillotine tile before kickoff said "1st of 10 alive"**, with every team on 0. Before kickoff it now says
  "Guillotine: 10 alive" and "Lowest score is chopped", with no "still to play".
- **Tiles in a taller row spread their lines apart** (four across, a neighbour with a wrapped name or note made the
  row taller and the grid shared the extra space between every line). The lines now stay together at the top and the
  foot (result, notes, chevron) sits at the bottom, so feet line up across a row.

Put to the owner: "Best Ball" wrapping onto a line of its own at four across; the helper text above the tiles (two
lines on desktop, four on a phone) could move into the header's info tip.

### S21, round 11: the owner's answers to pass 3

- **Best Ball on the opponent's line** (owner chose (c): "my leagues may have Best Ball in the name, but that's not
  the case for everyone"): "vs jakej80 · Best Ball". The opponent's name is cut short (ellipsis) before "Best Ball" is.
- **The helper text above the tiles moved into the header's info tip** (owner agreed): what Paid / Free and Redraft /
  Dynasty mean, keeper with redraft, Median only where it's played. Only the paid hint (closable) stays. The tip, the
  Guide and the CHANGELOG also said guillotine leagues "count with redraft"; they're not in the Record at all (no
  opponent), and now say so.

### S21, user-hat pass 4 (live: Thursday night of week 7) and the owner's answers

The first look at a live week with real leagues. With one game on, all 20 head-to-head matchups were "still in play"
and each listed every player left on both sides: the phone Scoreboard was about 6,000px tall, and four 0.0–0.0
matchups made the record "7–9–4". The owner agreed to all three proposals, with one change to the second:

- **Too early to call** (owner: "only show a W-L record when at least 4 players on both sides have points. Predicting
  W-L before then is pointless"; 4, not 5 or 6, because some leagues start only 8). `MIN_PLAYED`, `playedCount` and
  `tooEarlyToCall` in scoreboard.js: a matchup still in play counts toward the record only once at least 4 starters on
  each side have played (game under way or final; without game states, a starter with points). A decided or done
  matchup always counts (its result is known). Too-early matchups: out of the record, the splits and the median
  record; the header says "N too early to call" (no "Record" while none count); a line under the swings; tiles
  last, with both scores but no W/L chip or margin; the strip says "Too early to call"; no win chance worked out
  for them.
- **Names only when it's a few**: "You: 9 to play" until a side has 4 or fewer left, then the names (swings and the
  strip). The Best Ball note appears once under the swings, not under each Best Ball league.
- **The info tip in short labelled lines** (Record, Median, Still in play, Effectively decided, Provisional), and the
  Guide's one long "Week Recap" item split into "Week Recap" (the Dashboard line, when it loads) and "Scoreboard" with
  a nested list (css/base.css: `.guide-list ul`).
- Also: the header's Provisional pill and Refresh wrap together, so Refresh no longer sits on a line alone on a phone.
- Checked live with the owner's leagues: "Week 7 Recap · 20 too early to call", phone page about 2,000px.

### S21, user-hat pass 5 (a replayed Sunday afternoon) and round 12

To see a Sunday afternoon with real leagues, week 6 was replayed with the late-afternoon, Sunday-night and Monday games
set back to "not started" and those players' points removed (a review script, not in the repo).

- **The Simulator during games** (owner: "make the change in the Simulator itself"). A player whose game had kicked
  off counted as his points so far with no spread, as if final. During games that made win chances badly wrong, and
  the round-5 rule (under 0.5% or over 99.5% counts as decided) could take a live matchup out of "Still in play".
  Found when the replay counted the late games as kicked off: every late player froze on 0 and all 19 matchups read
  as decided. Now:
  - `gameShareLeft(status)` (sim/stats.js): the share of a game still to play, from ESPN's quarter and clock (1
    before, 0 final, half at halftime or without a clock, overtime against a full game).
  - `parseEspnScoreboard` stores it per team (`left`); `gameShareLeftFor(team)` (lineup/gameInfo.js) reads it.
  - `getPlayerVarianceProfile`'s new `shareLeft`: points so far plus his usual distribution scaled to the share left
    (spread by its square root); `floorAt` so the worker never draws below what he has scored; Boom/Bust from the
    model around the live mean; `inProgress` and `actualSoFar` for the Simulator card ("(3 so far)").
  - Used by the Simulator card (sim/matchup.js, sim/ui.js) and the Scoreboard's win chances (sim/winChance.js).
  - The "settled by the Simulator" rule waits until nobody on either side is mid-game; a chance that rounds to 0 or
    100 meanwhile reads "<1%" / ">99%".
- **A shorter in-play list, with the chance on the tiles** (owner: combine (a) and (b)): "Still in play" lists the five
  most uncertain, with "Show all N" (in memory, until the week changes); every in-play tile shows its win chance
  next to the margin.
- **"Effectively decided" only beside something still open** (owner agreed): with nothing in play or too early, it
  repeated the record.
- Also from the pass: a tile's foot is two lines, the result and how it stands, then the league's context (median,
  guillotine place), instead of one wrapping line that left a "·" at the end of a line on desktop; the in-play list's
  margin sits by the league's name instead of at the far edge of a wide screen.

### S21, mid-game replay (round 12's Simulator change, checked)

Week 7 faked at two moments of Sunday afternoon (halftime of the 1pm games, then 7:00 left in their 4th quarter),
with points from Sleeper's projections scaled to the time played, the London game final and the later games not
started. The Simulator change held up: players mid-game read "(19.9 so far)" with a range, leaders' chances firmed
up as the clock ran down, and nothing read 0% or 100% while games were on. Two fixes:
- **No win chance for Best Ball on the Scoreboard.** It simulated the lineup Sleeper shows now, but in Best Ball the
  bench can still replace a starter's score: Slow Mock Draft read 49% on its strip and 79.5% on the Simulator card
  just below. Best Ball swings are ordered among the others by a rough chance from the gap and what the side behind
  can still add (`swingOrder`'s `trailReach`). The Simulator card has the same Best Ball limit (it simulates one
  fixed lineup); not changed here, a follow-up in TESTING.md.
- **A mid-game player's range starts at his points so far** ("4.05-6.31 (3.9 so far)" read oddly).

### S21, the Sunday live check (week 7, the 1pm games in the 1st quarter)

Run against the owner's real leagues with nothing simulated, on phone and desktop, twice about ten minutes apart.
What held up: players mid-game read "(14.9 so far)" with ranges that start at their points; no chance read 0% or
100% while games were on; the record, "still live" and "too early to call" split made sense (11–8, 18 live, 1 too
early, 1 decided); Best Ball tiles had no chance; no console errors.

Found and fixed: **the Simulator counted players on a bye.** Sleeper's week-7 projections have no points for them, so
`getPlayerVarianceProfile` fell back to the season average: Josh Allen (BUF, bye in week 7) counted 27.46 and Omarion
Hampton (LAC, bye) 8.83 for an opponent in 2026 Late Round Charity League 2. The Simulator card read 21.5% for the
owner; without them, 82.75%. Pre-existing in the Simulator card; the Scoreboard's win chances had it too.
- `sim/matchup.js`: a starter or bench player whose team is on a bye this week (`getByeWeek`) is left out like a
  Doubtful/Out/IR player, and the toast counts them ("1 on a bye").
- `week/thisWeek.js`: the win-chance players mark a bye as excluded, so `matchupWinChances` drops them.
- No automated test: the fixtures are week 2, which has no byes. Checked live instead (Allen and Hampton gone from
  the card's lists).
- Also: a space before "52% to win" in the in-play list (its text ran "48.752% to win" for screen readers).
## S23 — Dynasty leagues: a season rankings set beside the dynasty one

**User-visible effect.** Only in dynasty and keeper leagues (`getPowerLeagueKind(league) === 'dynasty'`); redraft
leagues look and work exactly as before.
- **Roster tab, ROS card.** The set drop-down's label reads "Dynasty rankings for this league" (was "Ranking Set for
  this League", which redraft leagues keep). Under its "Used in…" row a new **Season rankings** picker (with an (i)
  tooltip): "None (use your dynasty rankings)" plus every saved ROS set. With a Season set chosen the card header reads
  "Dynasty: <set> · Season: <set>", and "Season rankings in N of M dynasty and keeper leagues · Choose leagues…" opens the
  existing league picker for the Season slot (only dynasty and keeper leagues listed; uncheck to send one back to its
  dynasty set). With the slot empty and a redraft league on a ROS set, the row offers it: "Your redraft leagues use
  <set>. **Use it here**"; after the tap, a dialog asks "Also use "<set>" in the N other dynasty and keeper leagues
  without Season rankings?" (**Use in all N** / **Just this league**). A set's "Used in N of M leagues" line counts Season
  use too: "(k as Season)".
- **Power Rankings.** With a Season set: **Start** (and so the Contender / Retool / Rebuild labels, the Your Team card and
  the Roster tab's power strip) is scored by the Season set; **Ovr** and the QB/RB/WR/TE columns by the dynasty set;
  **Future** by the dynasty set × Sleeper age (or dynasty Market Consensus, unchanged). The Ovr tooltip lists the rooms
  by the dynasty set then. A new note names the sets: "Start (and so the labels) uses your Season rankings (<set>). Ovr
  and the position columns use your dynasty rankings (<set>). Future uses your dynasty rankings (<set>)." A new switch,
  **I'm competing this year** ("Ovr and position rooms use your Season rankings."), shown only with a Season set and your
  own rankings as the source, moves Ovr and the rooms to Season (Future stays dynasty); saved per league. A Contender with
  the switch off whose dynasty set is 14+ days old (when the ROS freshness label turns amber) gets a note: "Your dynasty
  rankings are 18 days old. Competing this year? Turn on I'm competing this year to read your rooms by your Season
  rankings."
- **The same numbers elsewhere:** the All My Leagues search's power ranks and the Trade Analyzer's "Power Rankings after
  the trade" (S14) read each league the same way (its line says "by your dynasty rankings (Start by your Season
  rankings)"). The Trade Analyzer's values ("Your rankings") are unchanged: that's S24.
- **Lineup.** With no Weekly set, the lineup is optimized by the Season set (was the dynasty set), its rank badges and
  rank-change chips follow it, and the Command Center's "not in …" reason names "your Season rankings". The Waiver Wire's
  Starting Lineup check uses the same. A Season change changes the league's rankings stamp, so the lineup re-optimizes
  when next opened.
- **Waiver Wire Assistant.** Rank By gets **Season Rank** in a league with a Season set (hidden elsewhere); rows read
  "Season Pos / Season Overall". The Dashboard's best-available switch (the same setting) gets a **Season** button while
  any league has a Season set: dynasty leagues use their Season set, the others their ROS rankings.
- With no Season set chosen, everything is exactly as before.

**Owner's decisions (asked before building).**
1. Names: **Dynasty** for today's ROS slot in these leagues, **Season** for the new one.
2. No Season set: **as today**, plus an **offer** of the ROS set the redraft leagues use, and after accepting, one
   question to use it in every other dynasty and keeper league without one. (The owner found my first version, an offer
   with a separate "Choose leagues…", more than needed.)
3. Where Season is used in this card: **all three** (Power Rankings' Start and labels, the lineup's fallback, Rank By).
4. **No site-wide toggle**: a default per place (lineups, waivers and Start ask "now"; Future asks "later"); switches only
   where both answers help (S24's Trade Analyzer and Roster rows).
5. Bulk assigning: **in the existing league picker dialog**.
6. Ovr and the position columns (my question; the card named only Start): **dynasty by default**, because dynasty
   rankings are updated about monthly and the long view matters unless you're competing. The owner asked for a
   "Competing / Rebuilding" toggle in dynasty language; I suggested one switch, **"I'm competing this year"**, because a
   two-sided switch would label every team "Rebuilding" until flipped, plus the two-week hint. Built as suggested; the
   owner can change the wording.

**What changed and where.**
- `js/mls/rankings/season.js` (new, pure, in `PRECACHE_ASSETS`): the slot (`seasonRankingSetId`, `hasSeasonSlot`,
  `seasonSetFor`), the resolver `resolveSeasonRankings` (Season set, else the league's ROS rankings as they are),
  `seasonStamp`, `roomsUseSeason` (`powerCompeting`), `setUsage`, `seasonOffer`, `leaguesWithoutSeason`.
- `js/mls/leagues/sync.js`: `getLeagueSeasonRankings(league)`, `activeSeasonRankings()` (looked up on each call, so no ROS
  change can leave it stale; State gains no field), `activePowerRankings()` ({ start, rooms, future }); the rankings
  stamp appends `|season:<id>@<updatedAt>` only when a Season set is chosen (every other league's stamp is unchanged, so
  no needless re-optimizing after the update); a sync carries `seasonRankingSetId` and `powerCompeting` over like
  `rosRankingSetId`. `js/mls/main.js` re-exports the three; modules that `state.js` loads early (`lineup/gameInfo.js`,
  `scout/waivers.js`, the power and trade modules) import them from `main.js`, as with `getLeagueRankings` (importing
  `leagues/sync.js` directly from `gameInfo.js` broke the load order: State used before it was set).
- `js/mls/power/shared.js`: `computePositionalPower(league, rankings, { startRankings, futureRankings })`. `rankings`
  scores Ovr and the rooms, `startRankings` the lineup split (Start, bench), `futureRankings` the age mode's values. Both
  default to `rankings`, which gives identical numbers (unit-tested). `team.startSeparate` marks a split.
- `js/mls/power/rosterCard.js`: the sources, the switch (`setPowerCompeting`), the notes (`seasonSourceText`,
  `competingHint`). `power/allLeagues.js`, `trade/lineupSection.js`: the same split.
- `js/mls/rankings/sets.js`: `populateSeasonPicker`, `onSeasonSetChange`, `openSeasonSetLeagues`, `useSeasonOffer`;
  `renderLeaguePicker` / `assignSetToLeagues` / `openLeaguePickerDialog` take `slot: 'season'`; the header and the
  "Used in" row name Season use; **deleting a set clears every Season slot pointing at it** (the confirm says how many
  leagues go back to their dynasty rankings). Rename needed nothing new: every place looks the set up by id when it draws.
- `js/mls/render/lineup.js`, `js/mls/lineup/gameInfo.js`, `js/mls/scout/waivers.js` (Season Rank as a ROS-shaped basis,
  `scan.season`), `js/mls/scout/topAvailable.js`, `js/mls/scout/bestAvailable.js`, `js/mls/rankings/moveChips.js`
  (`rankMoveChip('season', …)`).
- `lineup/index.html` (the Season row, the switch, the Season Rank option), `css/mls.css` (`.mls-season-row`,
  `.mls-season-offer`; a `[hidden]` rule, since those rows set `display`), `js/mls/main.js` (actions:
  `onSeasonSetChange`, `openSeasonSetLeagues`, `useSeasonOffer`, `setPowerCompeting`).
- `sw.js`: `season.js` in `PRECACHE_ASSETS`; `CACHE_NAME` v2.8.100 → v2.8.101. CHANGELOG line under Lineup Strategist.
- **No new storage key.** Both fields live on the league objects (`mls_leagues`), so Backup / Restore keeps them (spec)
  and Factory Reset clears them with the leagues. No new badge, chip or pill, so no legend line.

**Market source (asked to note, not build).** Power Rankings' Market Consensus option scores every column, Start
included, from the one market loaded (`State.marketSettings.type`). In a dynasty league with Market as the source, Start
should ideally read FantasyCalc's *redraft* values and Future the dynasty ones, the same split as Season / dynasty. That
needs two markets held at once (today pulling one replaces the other), which fits S25's market snapshots better than
this card. Until then, with Market as the source nothing about Season applies (the switch and the Season note hide).

**Tests.**
- Unit `tests/unit/seasonRankings.test.mjs`: the slot rule, the resolver (Season set; none; a deleted set; a league no
  longer dynasty), the stamp part, `roomsUseSeason`, usage counts, the offer, and `computePositionalPower`'s split (Start
  by one list, Ovr / rooms by another, Future by a third; and identical output when all three are the same list).
- Spec `tests/mls-season-rankings.spec.mjs` (both widths, 12 runs), the fixture league marked dynasty with "Dynasty SF"
  (rankings.csv) and "Redraft ROS" (the other team's players first): without a Season set no note and no switch; with
  one, Start equals the Season set alone, Ovr / RB / Future equal the dynasty set alone, the note and header say so;
  I'm competing moves Ovr, keeps Future; both survive a reload and a re-sync. The lineup with no Weekly set starts George
  Kittle at TE by Season (Brock Bowers by dynasty); Season Rank in Rank By resolves to the Season set and falls back to
  ROS without one. The offer and "Use in that one too", the Season leagues dialog (only dynasty and keeper leagues),
  rename (a name with markup, shown as text), delete (confirm wording, slot cleared). The two-week hint. Backup /
  Restore. A redraft league: no picker, no switch, no Season Rank.

**Checks.** check-precache OK; 405 unit tests pass; the new spec passes at both widths. This container's Chromium is
revision 1243, not the 1194 the repo pins (`tests/render-env.mjs`), so I ran Playwright with a scratchpad
`PLAYWRIGHT_BROWSERS_PATH` that points 1194's paths at 1243's binaries (nothing committed). With it, the full run's only
failures are `visual.spec.mjs` (baselines are for 1194), `view-transitions.spec.mjs` and some of
`mls-lineup-needs.spec.mjs` (1243 rejects with "Transition was skipped. New ViewTransition started"); the same specs
fail on unchanged main in this container (checked in a main worktree; which `mls-lineup-needs` tests fail varies by run).
CI, on 1194, is the real check for those.

**Screenshots: none change.** I rendered all 40 on main and on this branch in this container and compared them with
`npm run pxdiff`: all pixel-identical (the screenshot league isn't dynasty and has no ROS set). No PNG re-taken.

**Left over.**
- The Guide's Roster step doesn't mention Season rankings yet (a sentence there re-takes `mls-league-guide.png` at both
  widths); the (i) beside the picker explains it. Worth a line when S24 touches the Guide.
- The card header truncates "Dynasty: … · Season: …" on phones with long names (its title shows both in full), as it
  already did for one long name.
- Market source split (above), for S25.
- No open follow-up in docs/TESTING.md touches this area.

### S23, round 2: "In-Season", Dynasty Rank, the Guide, and Chromium 153 in the cloud (owner's choices)

**The owner's notes after round 1, and what was done.**
1. **"Season" is now "In-Season"** everywhere users see it: the picker ("In-Season rankings"), the header ("Dynasty: … ·
   In-Season: …"), the notes, "(k as In-Season)", toasts and dialogs. Code names (`seasonRankingSetId`, `season.js`)
   stay, so nothing stored changes.
2. **Waiver Wire labels** (owner: "ROS" and "Season" side by side weren't clear). In a dynasty or keeper league the ROS
   slot is the dynasty set, so Rank By's ROS choice reads **Dynasty Rank** there (rows "Dynasty Pos / Dynasty Overall"),
   and **In-Season Rank** shows when the league has an In-Season set. Redraft leagues keep **Weekly Rank / ROS Rank**.
   The **Dashboard's best available keeps two buttons, Weekly | ROS**: round 1's third "Season" button is gone, and ROS
   there is each league's this-season rankings (a dynasty league's In-Season set when it has one, its line saying
   "In-Season · <set>"), since a free agent is a "now" question (decision 4). A saved In-Season Rank counts as ROS there;
   View on a ROS line opens Top Available on In-Season Rank when that league has the set. Plus the optional rename the
   owner took: in these leagues the ROS card is titled **"Dynasty and In-Season Rankings"** (redraft: unchanged).
3. **The Guide:** step 3 (rankings) gets a "Dynasty and keeper leagues" item on the two sets; step 4 (Power Rankings)
   says what In-Season changes and what "I'm competing this year" does; step 8 (Waiver Wire) names Dynasty Rank and
   In-Season Rank. The Dashboard's (i) says ROS uses In-Season rankings in those leagues.
4. **Cloud browser** (owner: update CLAUDE.md, and whatever else prevents it):
   - `tests/browser.mjs` (new; tests only): when the pinned Chromium (revision 1194) isn't installed but
     `/opt/pw-browsers/chromium` is, both Playwright configs and `visual.spec.mjs` launch that one. CI installs 1194,
     so CI is unchanged. No more scratchpad alias.
   - `tests/render-env.mjs` checks the browser actually launched: before, it read only the pin, so this container's
     Chromium 153 passed the check and all 40 screenshots failed; now `visual.spec.mjs` fails with one message naming
     the preinstalled build. `RENDER_ENV=any` (ignored in CI) skips the check, for rendering main and a branch in the
     same container to compare with pxdiff.
   - CLAUDE.md ("Before pushing") and docs/TESTING.md ("Chromium", "When your machine can't reproduce the baselines",
     now with the worktree steps) say all of this.
   - **The app fix (owner: in this branch):** `js/shared/ui/viewTransition.js` now also handles `transition.ready`.
     A transition skipped by the next one (rapid tab taps) rejects `ready`, and Chrome 153 reports it as an unhandled
     rejection; that was the "Transition was skipped" error that failed `view-transitions.spec.mjs` and parts of
     `mls-lineup-needs.spec.mjs` here. Both pass on Chrome 153 now. Users saw only a console error (the boot banner
     ignores rejections after start-up), in both apps; CHANGELOG lines under both.
   - **Left for later, as its own PR:** upgrading Playwright so the pin matches the cloud image (Chromium 153 is
     revision 1243), with `BASELINE_ENV` and all 40 baselines re-taken ("Upgrading Playwright or the CI runner" in
     docs/TESTING.md). Check first that CI's Ubuntu fonts and the cloud image's agree, or the two will still differ.

**Screenshots.** Rendered all 40 on main and on this branch in this container (Chromium 153's headless shell for both)
and compared them with `npm run pxdiff`: only **`mls-league-guide.png`** changes, at both widths (`desktop/` 1280×6923 →
1280×7097, `phone/` 390×14969 → 390×15488), from the Guide sentences. The other 38 are pixel-identical. The PNGs aren't
re-taken here (this container can't render CI's); take both from the pull request's CI run ("Accepting an intended
visual change" in docs/TESTING.md), checking that each `-expected.png` matches the committed baseline.
- A trap found on the way: full Chrome and the headless shell draw the (i) icons' "i" and some MDS text a few pixels
  apart, so a comparison must use the same build on both sides. `browser.mjs` falls back to the preinstalled
  **headless shell** (what Playwright and CI launch) before full Chrome. Until this branch is on main, main's worktree
  has no fallback and needs a `PLAYWRIGHT_BROWSERS_PATH` alias (a folder whose `chromium_headless_shell-1194/
  chrome-linux/headless_shell` and `chromium-1194/chrome-linux/chrome` link to the 1243 binaries); after the merge both
  sides use the fallback.

**Checks.** check-precache OK; 405 unit tests; Playwright with the fallback, no alias: 471 passed, 5 skipped, and only
`visual.spec.mjs` failed (4 failed, 6 did not run), with the one environment message. `view-transitions.spec.mjs` and `mls-lineup-needs.spec.mjs` now pass on
Chrome 153 (they failed on main here).

**Owner's question (3), answered in chat:** the competing suggestion from Record, PF and PA waits for S21's
`league.record`; see the next entry once decided.

**Left over.** The two Guide PNGs from CI. The Playwright upgrade (above). The competing suggestion (decision pending).

### S23, round 3: the competing suggestion's rule (owner's decision)

**The owner approved the rule** for a suggestion beside "I'm competing this year", from the Power Rankings label plus
the record, points for and points against that S21 (btrerise/My-Draft-Strategist#205) saves on each league at sync
(`league.record`). It starts from the team's own label and lets the standings move it one step at most:
- Contender → **Competing**; with a losing record and points for in the bottom half → **Retool** ("the roster says
  contender; results don't yet").
- Retool → **Retool** (your call); winning record and points for in the top half → **Competing**; losing record and
  points for in the bottom half → **Rebuilding**.
- Rebuild → **Rebuilding**; winning record and points for in the top half → **Retool**.
- Points against only explains ("3–4 with the 2nd-most points against"), never moves it. Under about 4 games played,
  the suggestion is the label alone. It never flips the switch.

**Not built yet:** it needs `league.record` from #205. My recommendation (order not yet confirmed): merge S23 without
it and add it in a small follow-up once #205 is on main, touching only the Power Rankings files. The owner asked me to
draft a note for the S21 session suggesting the record code (`seasonRecord`, now in `js/mls/week/scoreboard.js`) move
somewhere league-wide such as `js/mls/leagues/`, with that session making its own call.

### S23, round 4: my review as a user, all six fixes (owner: "do all six"); S21's answer on the record

**From my review of the screens at 390px and 1280px, all fixed:**
1. **The In-Season set's name showed nowhere with the card folded** (the header cut off after "In-Season:"). The
   header now has one line per slot ("Dynasty: …" / "In-Season: …"), each cut on its own (`.rankings-header-slot`).
2. **"In-Season" broke at its hyphen** in the card title ("Dynasty and In-" / "Season Rankings") and in toasts. The
   title is now **"Dynasty & In-Season Rankings"** with "In-Season" kept whole (`.mls-nowrap`), as in the switch's
   description; plain-text toasts and dialogs use `IN_SEASON` (`rankings/season.js`: "In-", a word joiner, "Season"),
   which looks the same and doesn't break.
3. **It looked as if an upload filled the In-Season set**, because its picker sat right above Upload Format. The
   In-Season row is now **last in the card**, below the upload and Auto-Fetch, which fill the dynasty set at the top.
4. **Rank By cut "In-Season Rank" off** at half a phone's width. In dynasty and keeper leagues, on screens up to
   600px, Rank By takes the whole row (`.mls-rank-by-wide`); redraft leagues and wider screens are unchanged.
5. **The power strip at the top of the Roster tab didn't say Start came from another set**: it now reads "out of 12
   teams · Start by In-Season" ("· by In-Season, Future by dynasty" with I'm competing on).
6. **The long sources note** became **one line right under the table**: "Start and labels by In-Season (Redraft ROS)
   · Ovr, positions and Future by dynasty (Dynasty SF)" (with I'm competing: "Start, labels, Ovr and positions by
   In-Season (…) · Future by dynasty (…)"; with Future from Market Consensus, "Future by dynasty Market Consensus").
   The bullet it replaces is gone; the Guide's step 4 says "a line under the table".

**S21's answer (from its session, via the owner):** `seasonRecord` stays in `js/mls/week/scoreboard.js` for now (one of
four "from a sync" helpers there; a move adds churn before S21's live test). `league.record` keeps the shape
`{ wins, losses, ties, pf, pa, pfRank, paRank, of }`, set at every successful sync from Sleeper's rosters; a failed sync
keeps the old one; missing on leagues synced before S21 (treat as null); null before anyone has played, when your team
isn't found, and in guillotine leagues. In median leagues wins and losses include the median game (Sleeper's
standings; `league.medianMatch` marks them). `paRank` 1 = the most points against you (unlucky). Power Rankings already
has its own `ordinal` (power/allLeagues.js). Either merge order works; S21's branch is at v2.8.109, so whichever merges
second bumps `CACHE_NAME` above main's. For the suggestion (round 3): it reads `league.record` only, and treats a
missing or null one (and guillotine leagues) as "label alone".

**Checks (round 4).** Unit 405 pass; Playwright 471 passed, 5 skipped, and only `visual.spec.mjs` failed, on the one
environment message, as in round 2. Main vs. this branch rendered here: still only `mls-league-guide.png` at both widths
(same sizes as round 2), from CI once there's a pull request. `CACHE_NAME` stays v2.8.101 (main v2.8.100; S21 is at
v2.8.109, so whichever merges second goes above main's).

### S23, round 5: my second review as a user, seven fixes (owner: "do all seven")

1. **Auto-Find's notes named the wrong set** (from round 1): "checked against your current Week 2 starting lineup
   using ROS ranks" and "the Would Start check uses ROS ranks (same as the optimizer)", while with an In-Season set and
   no Weekly set both use In-Season. They now say "In-Season" (or "Dynasty" in a dynasty league without one; redraft
   leagues still say ROS), from a new `ctx.checkName` in `buildWaiverContext`.
2. **"Your ROS rankings ("Dynasty SF") don't include position ranks"** reads "Your dynasty rankings (…)" in dynasty and
   keeper leagues (`rankingSetLabel`).
3. **A league could pick its own dynasty set as its In-Season set**, which changes nothing but showed "by In-Season
   (Dynasty SF) · … by dynasty (Dynasty SF)" and a hint to switch to the set already in use. Now `seasonSetFor` counts
   that as no In-Season set (so the key, hint, strip tag, stamp and usage counts all ignore it), the picker leaves the
   league's dynasty set out, the Season leagues dialog shows such a league locked ("Its dynasty rankings already"), and
   the offer's "use it in the others too" skips leagues whose dynasty set is the offered one.
4. **The "use it in other leagues too" dialog names them** when there are one to three ("Also use "Redraft ROS" in
   "Keeper League" too?"); with more it gives the count as before.
5. **The In-Season leagues line** reads "In 2 of 2 dynasty and keeper leagues" (the label above says In-Season), so it
   fits one line with "Choose leagues…" on a phone.
6. **The Trade Analyzer's source line** ("by your dynasty rankings (Start by your In-Season rankings)") reads "Start by
   In-Season; value, Ovr, positions and Future by dynasty" ("Start, Ovr and positions by In-Season; value and Future
   by dynasty" with I'm competing). The value verdict stays on the dynasty set; two verdicts are S24.
7. **The hint is shorter:** "Your dynasty rankings are 17 days old. If you're competing, turn on I'm competing this
   year."

Tests: the spec checks each (the hint test now uses a copy of the dynasty set, since the set itself counts as none);
the unit test covers the own-dynasty-set rule.

**Checks (round 5).** Unit 405 pass; Playwright 471 passed, 5 skipped, only `visual.spec.mjs` failing on the environment
message. Main vs. this branch: still only `mls-league-guide.png` at both widths, unchanged from round 2.

### S23, round 6: my third review as a user, four fixes (owner: "do all four")

What held up: the Dashboard's best available by In-Season (the fixture's dynasty league showed three upgrades its
dynasty set never would, its line reading "In-Season · <set name>"), Top Available on In-Season Rank, the lineup built
from the In-Season set, long set names cut cleanly, and switching between a redraft and a dynasty league.
1. **Top Available's and Auto-Find's derived-ranks note was about the dynasty set** while the list was ranked by
   In-Season (and said nothing of the In-Season file, which lacked position ranks too). `waiverDerivedNotes` now
   describes the set the rows show: "Your In-Season rankings ("…") don't include position ranks…".
2. **The Lineup tab didn't say which rankings it used**, so a player read "Pos: #2 | Overall: #19" there (In-Season) and
   "Ovr: #13 | Pos: #1" on the Roster tab (dynasty) with no label. In a dynasty or keeper league with an In-Season set
   and no Weekly set, the lineup now starts with "Ranked by your In-Season rankings (<set>) until you upload Weekly
   rankings." (`.mls-lineup-source`), left out of the lineup PNG like the needs box. Both ranks on the Roster tab's
   rows are S24.
3. **A redraft league's "Used in 2 of 2 leagues (1 as In-Season)"** and "Choose leagues…" each wrapped to two lines on a
   phone; with In-Season use it reads "Used in 2 of 2 (1 as In-Season)". Without it, unchanged.
4. **The Guide's step 4** had become one very long paragraph on a phone; the In-Season sentences are their own
   paragraph now (the Guide PNG was changing anyway).

**Checks (round 6).** Unit 405 pass; Playwright 471 passed, 5 skipped, only `visual.spec.mjs` failing on the environment
message. Main vs. this branch: still only `mls-league-guide.png`, now `desktop/` 1280×6923 → 1280×7097 and `phone/`
390×14969 → 390×15511 (the new paragraph); both from CI once there's a pull request.

### S23, round 7: main merged after S21 (btrerise/My-Draft-Strategist#205); the competing suggestion

**Merge.** origin/main (with S21) merged into this branch. Conflicts: `sw.js` (`CACHE_NAME` now **v2.8.111**, above
main's v2.8.110), `js/mls/leagues/sync.js` (S21's `paid` and S23's `seasonRankingSetId` / `powerCompeting` carry-over
lines, both kept), the Dashboard's (i) in `lineup/index.html` (S21's "Edit" wording plus S23's In-Season sentence),
and CHANGELOG / LOG (both sides kept, S21's first). S21's re-taken screenshots came in with main.

**The suggestion (the owner's rule, round 3).** Under "I'm competing this year", a line such as "Suggested: **Rebuilding**
· 1–6 with the most points against, 2nd in points for, 2nd in Start." or "Suggested: **Retool (your call)** · 6–1, 1st
in points for, 2nd in Start. Your results beat your roster."
- `competingSuggestion(label, record, { starterRank })` in `js/mls/power/directionLabels.js` (pure, beside the labels):
  Contender → competing (losing and points for in the bottom half → retool); Retool → retool (winning and points for
  in the top half → competing; losing and bottom half → rebuilding); Rebuild → rebuilding (winning and top half →
  retool). Winning / losing = above / below .500 with ties as halves; "top half" = points-for rank ≤ teams ÷ 2, "bottom
  half" > (teams + 1) ÷ 2, so the middle team of an odd league is neither. Points against is named only with a losing
  record and a points-against rank in the top third ("with the most / 2nd-most points against"). Under 4 games, a null
  record (before anyone has played, guillotine leagues) or a missing one (synced before S21: "sync this league to add
  your record"), the label alone. In median leagues the record includes the median game, as Sleeper's standings do.
- Shown only with the switch (a dynasty or keeper league with an In-Season set and your own rankings as the source);
  it never flips the switch. The Guide's step 4 and the CHANGELOG line describe it. It's text, not a badge, so no
  legend line.
- Tests: unit (each row of the rule, .500, the odd league's middle team, ties, points against, under 4 games, no
  record, redraft labels); spec (the fixture's one-game record, 6–1 and 1–6, a missing record, no In-Season set).

**Checks (round 7).** check-precache OK; 423 unit tests pass; Playwright 499 passed, 5 skipped, only `visual.spec.mjs`
failing on the environment message. Main (now with S21, 42 PNGs) vs. this branch, both rendered here: only
**`mls-league-guide.png`** changes, `desktop/` 1280×7464 → 1280×7707 and `phone/` 390×16244 → 390×16994 (S23's Guide
sentences); the other 40 are pixel-identical. Both from the pull request's CI run.

### S23, round 8: the In-Season picker back under the dynasty one (owner's choice)

The owner found the In-Season picker easy to miss at the bottom of the card (round 4 had moved it there so it wouldn't
look like the upload's target). It's back right under the dynasty picker and its "Used in" row, and a divided line
under it, **"Upload or Auto-Fetch below to update your dynasty set, <set>."** ("…to save a new dynasty set." with
"+ Create New Set", `#rosUploadTarget`, `updateUploadTarget` in `rankings/sets.js`), starts the upload part, so which
set an upload fills stays clear. Dynasty and keeper leagues only; redraft leagues' cards are unchanged. The spec checks
the order (dynasty picker, In-Season picker, the line, the file input, Auto-Fetch) and both wordings.
Checks: 423 unit, 499 Playwright passed (only `visual.spec.mjs` on the environment message); screenshots vs. main (with
S21) unchanged from round 7: only `mls-league-guide.png`.

### S23, round 9: my fourth review as a user, at the owner's scale (21 leagues, 13 dynasty or keeper); two fixes

With 13 leagues the bulk assign held up ("Use in all 12", then "…is now the In-Season set in 13 leagues."), the leagues
dialog scrolls inside its box with Clear all, keyboard focus shows on the switch, and the Dashboard behaved. Fixed
(owner: "do both"):
1. **"In 13 of 13 dynasty and keeper leagues"** and "Choose leagues…" each wrapped to two lines on a phone; it reads
   **"In all 13 dynasty leagues"** / "In 6 of 13 dynasty leagues" now (keeper leagues still count, as the (i) says).
2. **The In-Season leagues dialog said "Already using this set as In-Season" on every checked row**; checked rows have
   no note now (the checkmark says it). Rows that add something keep theirs: "This league", "In-Season now: <set>",
   "No In-Season set (uses its dynasty rankings)", "Its dynasty rankings already". The ROS set's own dialog is unchanged.

### S23, round 10: uploading into In-Season, and League style for keeper leagues (owner: "build both here")

**Owner's questions.** (1) How does someone with only dynasty leagues get an In-Season set? Before this round they
couldn't without a trap: the In-Season picker and the offer need a saved ROS set other than the league's dynasty set,
and making one meant uploading into the dynasty slot. (2) Keeper leagues counted as dynasty everywhere, but many play
like redraft. The owner chose: build both here; keep dynasty as keeper leagues' default; check Sleeper's keeper count;
put a note on the Roster tab saying where to change the style.

**1. Upload or Auto-Fetch into: Dynasty | In-Season.** Round 8's line under the two pickers is now a switch (dynasty and
keeper leagues only), with a caption: "Updates your dynasty set, …" / "Saves a new In-Season set for this league.
Auto-Fetch gets FantasyCalc's redraft values." / "Replaces your In-Season set, …". On In-Season, an upload (through the
usual preview, which says "…, as this league's In-Season rankings" and offers other leagues' In-Season slots) or an
Auto-Fetch saves a new set or replaces the In-Season one and assigns it to the In-Season slot; the dynasty set,
`State.rosRankings` and the flat fallback keys are untouched. Auto-Fetch then asks FantasyCalc for redraft values
(`isDynasty=false`) whatever the shared League Type says, and names the set "FantasyCalc Redraft – <date>". The switch
lives in memory and goes back to Dynasty after each save and on a league switch, so a later upload can't quietly fill
the wrong slot. With no redraft set to offer, the empty In-Season row says "No redraft set to use yet. **Get
FantasyCalc's redraft values**", which does the In-Season Auto-Fetch in one tap; a new In-Season set then gets the
offer's "Also use it in …?" (`offerSeasonToOthers`, shared with the offer). Code: `rosUploadIntoSeason`,
`setRosUploadSlot`, `resolveSeasonTarget`, `saveSeasonSet`, `updateUploadTarget` (`rankings/sets.js`);
`resolveRankingsTarget` / `saveRankingsAsSet` hand off to them; `rankings/uploadPreview.js`, `rankings/rosFetch.js`.

**2. League style (keeper leagues).** Sleeper's `settings.max_keepers`, checked on the owner's 21 leagues: it's 1 in
every league type (redraft, dynasty, guillotine, best ball), so it only means something in keeper leagues (type 1);
the owner's one keeper league keeps 3. A sync now stores it as `league.maxKeepers` (keeper leagues only).
`league.keeperStyle` ('redraft', or absent = dynasty, the default) is set on the Setup tab's Active League Requirements
card ("League style": Plays like dynasty / Plays like redraft, an (i), and "Sleeper: each team keeps up to 3 players.
Leagues that keep this few often play more like redraft." when it's 3 or fewer) and carried over by a sync.
`getPowerLeagueKind` reads it, so everything that asks "is this dynasty?" follows: Power Rankings' labels and Future,
the Trade Analyzer's draft picks and Future, "To make it fair", the market type, and the In-Season slot (hidden, its
set kept but ignored, while redraft). The Roster tab's Power Rankings card has a note for keeper leagues: "Keeper league
(each team keeps up to 3), treated as dynasty here. **Change League style**" (to the Setup tab, scrolled and focused).
No new storage key: both fields are on the league.

Guide: step 2 (League style), step 3 (the switch and the button). CHANGELOG lines under Lineup Strategist.
Tests: unit (League style's rule); spec (an In-Season upload leaves the dynasty set alone and the switch resets; the
FantasyCalc button with a stubbed response, `isDynasty=false`, the new set's name; a keeper league's note, the Setup
control, Sleeper's count, redraft style dropping In-Season and Future; no League style in a dynasty league).

**Checks (round 10).** 424 unit tests; Playwright 505 passed, 5 skipped, only `visual.spec.mjs` on the environment
message. Main (unchanged since round 7) vs. this branch: only `mls-league-guide.png`, now `desktop/` 1280×7464 →
1280×7834 and `phone/` 390×16244 → 390×17444 (the new Guide items). The Setup tab's League style and the Roster tab's
keeper note are hidden in the screenshot league (redraft), so those PNGs are unchanged.

### S23, round 11: my sixth review as a user (round 10's flows end to end), four fixes (owner: "do all four")

Checked end to end with two more dynasty leagues: an upload into In-Season through its preview, the one-tap fetch and
its "Also use … in "Second Dynasty" and "Keeper League" too?", replacing the In-Season set, and League style.
1. **An In-Season set couldn't be renamed or deleted from its own picker**: Rename and ✕ act on the dynasty drop-down,
   so a dynasty-only user would have had to pick "FantasyCalc Redraft – …" as the dynasty set first (which reassigns
   it). The In-Season picker now has the same Rename and ✕ (`data-slot="season"`; `renameRankingSet` and
   `deleteRankingSet` take a slot and act on the active league's In-Season set), shown while one is chosen. The delete
   also now clears `State.rosRankings` only when it empties the active league's own slot (before, a league whose slot
   was already empty had it cleared too).
2. **Auto-Fetch ROS Rankings lost its refresh icon after any fetch** (on main too): it restored the button's text, not
   its markup. It saves and restores the markup now. CHANGELOG line.
3. **Replacing the In-Season set by Auto-Fetch** said "…will replace the saved set "…". It is used by 3 leagues."; it
   reads "…will replace your In-Season set "…". It's the In-Season set in 3 leagues." (`seasonUseNote`; ", and the
   dynasty set in N" when a league also uses it that way). The upload preview's replace line says the same.
4. **The upload preview's title** reads "Preview: In-Season Rankings" for an In-Season upload.

Not an app issue: one League style step looked broken because the test made two manual leagues in the same frozen
millisecond (the same `manual_` id); the spec covers the real flow.

**Checks (round 11).** 424 unit; Playwright 505 passed, only `visual.spec.mjs` on the environment message. Screenshots
vs. main: as in round 10 (only `mls-league-guide.png`).

### S23, round 12: my seventh review as a user (empty and edge cases), two fixes and a follow-up note

Checked: a brand-new dynasty league with no rankings (one tap on "Get FantasyCalc's redraft values" and Power Rankings
work, "Every column by In-Season (…)"), a league whose only rankings are its In-Season set, a keeper league switched to
redraft, and a manual league.
1. **A keeper league switched to "Plays like redraft" could lose all its rankings**: with only an In-Season set (say
   from the FantasyCalc button), redraft has no In-Season slot, so Power Rankings, the lineup and the Waiver Wire had
   nothing. Now `setLeagueStyle` moves that set into the ROS slot when the ROS slot is empty (no set, no old upload),
   marks the league (`seasonMovedToRos`, carried over by a sync) and moves it back when switched to dynasty again. The
   toast says so ("Its In-Season set, "…", is now its ROS set." / ""…" is its In-Season set again.").
2. **The Trade Analyzer's Power Rankings after the trade ignored an In-Season-only league** ("Load your ROS
   rankings…") while the Roster tab's table worked. It uses `activePowerRankings()` whenever it has rankings now, with
   "by your In-Season rankings (no dynasty rankings loaded)"; the trade's value headline then uses the market's values,
   or none, since "Your rankings" values come from the dynasty set (S24 shows both).
3. **Manual leagues can't be dynasty** (no league type), so no In-Season rankings, Future or picks there. Not built:
   the owner noted the payoff is small, since Power Rankings need a Sleeper league and the Waiver Wire can't tell who's
   available in a manual league. Added to docs/TESTING.md's Open follow-ups ("Needs the owner's decision first").

Tests: a spec case for both fixes (the Trade Analyzer's line; redraft and back, both slots and the marker).

**Checks (round 12).** 424 unit; Playwright 507 passed, only `visual.spec.mjs` on the environment message. Screenshots
vs. main: as in round 10 (only `mls-league-guide.png`).

### S23, round 13: my eighth review as a user (the Roster tab read top to bottom); the suggestion moved, one name, a source line

1. **Two messages that disagreed, far apart** (owner: do it). At the top of the Roster tab a 6–1 record sat beside
   "REBUILD · young core" on the power strip; the record-weighed "Suggested: Retool (your call)" was two cards down,
   under the switch, right above the Your Team card's "keep adding youth". Now the suggestion is written **in the Your
   Team card** under the label's advice (`.mls-power-summary-suggestion`), the switch keeps a pointer ("Suggested:
   Retool (your call) · why, under Your Team below."), and the **power strip** adds "· with your record: Retool" when
   the record moved the suggestion off the label. `suggestionFor` / `suggestionHTML` / `renderCompetingPointer` in
   `power/rosterCard.js`; the rule is unchanged.
2. **One name for the QB/RB/WR/TE columns**: "position rooms" everywhere (the key, the switch, the Trade Analyzer's
   source line, the Guide, the CHANGELOG), as the tooltips already say "QB Room".
3. **The Roster tab's player rows didn't say whose ranks they show** in a dynasty league with an In-Season set (the
   dynasty set's, while the Lineup tab shows In-Season's). A line above the list: "Ranks by your dynasty rankings
   (<set>)." (`.mls-roster-source`, `render/roster.js`). Both ranks per row stay S24.

**Checks (round 13).** 424 unit; Playwright 507 passed, only `visual.spec.mjs` on the environment message. Screenshots
vs. main: only `mls-league-guide.png`, now `desktop/` 1280×7464 → 1280×7857 and `phone/` 390×16244 → 390×17490 (the
Guide's sentence about where the suggestion shows). From CI once there's a pull request.

### S23, round 14: my ninth review as a user (the Setup tab), two fixes; the pull request

1. **League style looked as if it needed Save Requirements**: it sat between the slot numbers and the button, in a card
   whose description is about slot numbers, though it applies as soon as it's picked. It's below the button now, after
   a divider, with "Changes as soon as you pick." (`.mls-league-style`).
2. **The Setup checklist still asked for ROS rankings** in a dynasty league whose only rankings were an In-Season set
   (after the one-tap fetch, say), though Power Rankings, the lineup and the Waiver Wire already used it. The ROS step
   counts an In-Season set now (`updatePulsePrompts`, js/mls/init.js), and a change of In-Season set redraws the
   checklist (`refreshAfterSeasonChange` calls `updateRankingsMetaDisplay`).

Then the owner asked for the pull request, so CI renders the two Guide PNGs.

**Checks (round 14).** 424 unit; Playwright 509 passed, only `visual.spec.mjs` on the environment message. Screenshots
vs. main: only `mls-league-guide.png` (as in round 13); `mls-league-setup.png` is unchanged (League style is hidden in
the screenshot league, a redraft one).

**Guide baselines from CI.** The first CI run on the pull request (1af38ff) failed on exactly
`desktop/` and `phone/mls-league-guide.png`; 517 other tests passed. Each `-expected.png` matched the committed baseline
byte for byte, and CI's renders (desktop 1280×7577, phone 390×16616) were committed as the new baselines.

## S22 — This week's MVPs and LVPs across your leagues

**User-visible effect.** On the **Scoreboard** tab, under the league tiles (once a game has kicked off), a section
**"MVPs & LVPs"**, folded to one line until you tap it ("4 MVPs · 2 LVPs" and Provisional / Final; open or folded is
remembered). Opened:
- A short line: how many Sleeper leagues count, what Own means, and the Boom / Bust lines in use.
- **MVPs** (Player | Own | Boomed | Pts | Started): "Ja'Marr Chase WR · 100% (2) · 2 of 2 · 20.0–25.0 · 2 of 2". On
  phones Started drops to a second line under the name ("Started 2 of 2") rather than the table scrolling sideways.
- **LVPs** (Player | Own | Started | Pts).
- Five rows each, then "Show all N" (until the week changes).
- A **Partial boom** line when someone boomed in under half the leagues that own him; then one line each, when there is
  something to say: **Started zeros** ("0.0 usually means he didn't play; the app can't check that"), **Dead weight**,
  **Still open** (games not final: could land on either list), **Worst benchings**, players **not in Sleeper's player
  map** (with any Boom-level score called out), and a **Best Ball** note when a listed player sat on a Best Ball bench.
- "Provisional until the week's last game is final", gone once it is.
- **Advanced Settings** on the Dashboard gains **"MVP / LVP Lines"**: Boom at / Bust under for QB, RB, WR and TE (your
  lines as defaults), Save and Reset to Defaults, with a note that they're separate from the Simulator's boom/bust
  chances. Errors show under the form and mark the field (both positive, Boom above Bust); nothing is saved then.
- The Guide's Scoreboard item gains a line for MVPs & LVPs.

**Owner's decisions (asked before building).**
1. Where: **a section of the Scoreboard tab** (S21's view became a tab in its round 6), **folded until opened**.
2. Lines: **editable in Advanced Settings**, the owner's as defaults, with the note about the Simulator; **no K / DEF**.
3. Ownership: **Sleeper leagues only**, so every percent has points behind it. Manual leagues are mentioned in the
   intro line, not counted.
4. Rows before "Show all": **5 and 5**.

**Rules as built** (`js/mls/week/playerRecap.js`, my readings where the card left room):
- Leagues counted (N): every Sleeper league whose matchups loaded this week with your entry holding players. A league
  whose fetch failed, or a chopped guillotine team, isn't in N.
- Points: Sleeper's `players_points` in each league (its own scoring); a rostered player with none counts 0.
- MVP: at or above Boom in at least one league, whatever his game's state (a Boom mid-game stays a Boom). Ranked by
  leagues boomed, then ownership, then his best score. **Partial boom**: boomed in fewer than half the leagues that own
  him (the card's TE: 1 of 6). Partial booms go after every full one (by boom count alone, a 1-of-6 TE would tie a
  1-of-1 player and win on ownership, which the card says should rank low), and get the call-out line.
- LVP: his team's game is `post`, he's under Bust in at least one league, and he isn't an MVP. Ranked by leagues where
  he started and busted, then ownership. Without game states (ESPN didn't load) nobody is final, so no LVPs.
- Started zeros: 0.0 as a starter in a league, game final. Dead weight: owned in at least max(2, 20% of N) leagues,
  benched in all of them, 0.0 everywhere, game final. Still open: game not final, not already an MVP; by ownership.
- Worst benchings: Sleeper's matchups don't say which slot each starter fills (the league object keeps only slot counts),
  so "the starter in that slot" is **your lowest-scoring starter at the bench player's position** in that league: a
  same-position swap is always legal. Counted when the bench player reached Boom and the starter, whose game is final
  (or who was on a bye), scored at least 10 less. Never in Best Ball. Top 3 by the gap.
- Left out: byes (`getByeWeek`), no team, K, DEF (team-code ids are skipped quietly, not "unresolved").

**What changed, and where.**
- `js/mls/week/playerRecap.js` (new, no app state): `buildPlayerRecap`, `DEFAULT_LINES`, `normalizeLines`,
  `validateLines`, `ownText`, `pointsRange`.
- `js/mls/week/recapLines.js` (new): the lines' storage and the Settings form (`getRecapLines`, `applyRecapLinesToUI`,
  `saveRecapLines`, `resetRecapLines`). Called from `init.js` (fill the form) and `main.js` (data-actions).
- `js/mls/week/thisWeek.js`: `recapInput` (each league's own entry from `State.lineupActualPoints`, S21's fetch; no
  second request), `recapHTML` / `recapTable`, `togglePlayerRecap`, `showAllRecap`. Drawn by `renderScoreboard` after
  the tiles once the week has started.
- `lineup/index.html`: the "MVP / LVP Lines" accordion in Advanced Settings; the Guide's line. `css/mls.css`: the section
  (each table is one grid with subgrid rows, so columns fit their numbers; 760px reading width) and the form.
- `js/shared/storage/keys.js`: `mls_recap_lines` (only while different from the defaults; Reset removes it) and
  `mls_player_recap_open` ('1' while open). Both `mls_`, so Backup / Restore and Factory Reset take them.
- `sw.js`: the two modules in `PRECACHE_ASSETS`, `CACHE_NAME` v2.8.111 → v2.8.112. CHANGELOG: two lines under Lineup
  Strategist.
- No new badge: the section reuses S21's Provisional / Final pill (already in the legend).

**Tests.** `tests/unit/playerRecap.test.mjs` (13): ownership, boom count then ownership, the partial-boom TE (1 of 6, a
TE-premium 15.7), LVP order by started busts, bye / no team / K / DEF left out, a 0.0 starter on a final team as a
started zero (and one still to play as still open), still open mid-game, dead weight, worst benchings (Best Ball
skipped, small gaps and unfinished starters skipped), unresolved ids, custom lines, empty input, validation.
`tests/mls-mvp-lvp.spec.mjs` (both widths) with S21's fixtures: folded line and counts, both tables' cells, dead weight
and still open, the open state surviving a reload; a started zero, a starter LVP and a worst benching (Second Fixture
League's points changed in the route); Final after Refresh; a failed league left out of N; the Settings form
(validation, Save, "Show all 6", Reset); nothing before kickoff; at 375px and 1280px every cell inside the section,
names whole, Started on a second line on phones only. `tests/mls-this-week.spec.mjs`: its three Provisional / Final
checks now look in the header (the section has its own pill).

**Screenshots.** Six change, by design (main and this branch rendered here and compared with `npm run pxdiff`; the other
36 are identical). The Scoreboard PNG doesn't change: the screenshot league is before kickoff, so the section isn't drawn.
- `desktop/` and `phone/mls-empty-setup.png`, `mls-league-setup.png`: the "MVP / LVP Lines" row in Advanced Settings.
- `desktop/` and `phone/mls-league-guide.png`: the Guide's MVPs & LVPs line.
This container can't reproduce CI's renders (its newer Chromium), so take the six from the pull request's CI run.

**Checks run.** check-precache OK; 437 unit tests pass; Playwright 525 passed, 5 skipped, only `visual.spec.mjs` stopping
on the environment message (as on main here).

**Left over.**
- Re-take the six PNGs from CI (above).
- Open follow-up this touches: the **image of the Scoreboard for a group chat** (docs/TESTING.md, "Wanted by the owner")
  noted "fits with S22"; not built here. MVPs & LVPs are in the same card now, so an export could include them.
- Worst benchings by actual slot would need the league's `roster_positions` order saved at sync (the starters array
  follows it); a small sync change if same-position comparisons ever miss one the owner cares about.
- Best Ball's "Started" is Sleeper's lineup as it stands; the note says so rather than recomputing Best Ball's lineup.

### S22, round 2: the owner's review (real leagues, week 8): Started %, slot order, the share image

The owner looked at the section with their 19 Sleeper leagues (screenshot: 21 MVPs, 97 LVPs) and asked for three things.
I asked three questions first; the owner took my suggestion each time.

1. **MVPs need Started, not just Own** ("Eli Raridon may be owned in 6 leagues, but I didn't start him anywhere. So he
   isn't really an MVP"). Decisions: **an MVP must have boomed in a league where you started him**; in Best Ball any boom
   counts, since its lineup picks itself. MVPs rank by those started booms, then all booms, then ownership. A player who
   boomed only on your bench leaves the table for a line of his own: **"Boomed on your bench: Eli Raridon TE (15.4–17.6
   in 6 leagues). Not MVPs: you didn't start them where they boomed."** **Started reads as a share of the leagues that own
   him**, "67% (4)", in both tables (Own stays the share of all your leagues). Bench boomers aren't LVPs or "still open"
   either. (`startedBoomed`, `startedPct`, `benchBooms`, `startedText` in week/playerRecap.js.)
2. **Each league's slot order, saved at sync** (owner: useful later for the Lineup tab too). `league.starterSlots`:
   Sleeper's `roster_positions` without BN, in order (`leagues/sync.js`); a matchup's `starters` follow it, so
   `starters[i]` filled `starterSlots[i]`. Rebuilt on every sync, so nothing to carry over; Backup / Restore copies it
   with the league. A league synced before this has none until its next sync. Used now by **worst benchings**: the
   benched player is compared with the lowest starter in any slot that takes his position (`SLEEPER_SLOT_POSITIONS`: FLEX,
   SUPER_FLEX, REC_FLEX, WRRB_FLEX), so a WR benched for an RB in the FLEX counts, and the line names the slot ("over
   CeeDee Lamb (FLEX) 8.0"). Without slots, or when they don't match the starters, the same-position rule from round 1.
3. **The Scoreboard image** (the open follow-up from S21), as **a summary, a "TL;DR"** (owner: 21 tiles would be too
   much to share). Decision: **headline plus highlights**, at any number of leagues: "My Lineup Strategist · Week 7
   Recap" and Provisional / Final; the record ("Record 12–7 · 2 still live", or too early to call); the splits; **Still
   in play**: up to 3, most uncertain first, with the win chance and the margin; **Biggest win** and **Worst loss** among
   the matchups already settled (every one once the week is final); the top 3 **MVPs** ("boomed 6 of 6", points) and
   **LVPs** ("started 4 of 4", points); "19 Sleeper leagues · provisional until the last game is final ·
   mydraftstrategist.com". 480px wide, like Export Trade. **Export** sits by Refresh in the Scoreboard's header (an icon on
   phones), only once there are scores. The HTML comes from `js/mls/week/shareImage.js` (pure, unit-tested);
   `scoreboardSummary` and `exportScoreboard` in week/thisWeek.js gather the data and draw it from html2canvas's clone of
   `#thisWeekCard` with proportional digits; the page doesn't change. Saved as `Week_7_Recap_Lineup_Strategist.png`.
   The "Wanted by the owner" line for it in docs/TESTING.md is removed; the Roster tab's Export stays there.

Also: the Guide's line says what Started means, the new MVP rule and Export; CHANGELOG lines updated; `sw.js` precaches
`shareImage.js` (CACHE_NAME stays v2.8.112, this branch's one bump, still above main's).

**Tests.** `tests/unit/playerRecap.test.mjs` (15): bench-only booms out of MVPs onto their own line, Best Ball bench booms
counting, started booms ranking first, slot-aware benchings (a WR over the FLEX RB; a QB never over a FLEX; slots that
don't match fall back). `tests/unit/shareImage.test.mjs` (2): at most 3 swings and 3 MVPs / LVPs from many, names
escaped, empty sections left out, Final. `tests/mls-mvp-lvp.spec.mjs`: Started as "100% (2)"; St. Brown's bench boom on
its line and out of the MVPs; the benching naming the FLEX; `starterSlots` saved by the sync; **Export**: the download's
name, the image's text (record, the swing with its chance, biggest win, MVPs, LVPs, no tiles), 480px, no tabular digits,
the page's tiles unchanged; no Export before kickoff.

**Checks (round 2).** check-precache OK; 441 unit tests pass; Playwright 527 passed, 5 skipped, only `visual.spec.mjs`
stopping on the environment message. Screenshots vs. main: the same six as round 1 (the Guide PNGs taller with this
round's sentence), the other 36 identical; the Scoreboard PNG is before kickoff, so it shows no Export. Still to take
from CI.

### S22, round 3: the owner's second review (week 7, 19 leagues)

The owner's eight points, my answers, and what was built:
1. **Did Started zeros include Best Ball?** Yes: a 0.0 in Sleeper's Best Ball lineup counted. Now it follows Best Ball's
   own lineup (point 8), so a Best Ball 0.0 counts only if nobody on the bench who could fill that slot scored more.
2. **Dead weight leaves out injured players**: any injury designation in the player map (`injury_status`, or a status
   with "reserve"). `injured` on each player, from `recapInput`.
3. **Bullets** (owner chose my suggestion): each extra line is a heading with its note, then one bullet per player, 3 of
   them, then "and N more" (`extraItem`, `RECAP_NAMES` 3).
4. **Export like the others**: Draft Strategist's Export Team, the Lineup tab's PNG and Export Trade are purple buttons
   with a camera icon; Export Trade sits at the bottom of its card and saves `My_Trade_Lineup_Strategist.png`. So the
   Scoreboard's is now **"Export Recap"**, a purple camera button at the bottom of the card, saving
   **`My_Recap_Lineup_Strategist.png`** (round 2's icon by Refresh is gone).
5. **Still in play folds** (open until you fold it, remembered: `mls_still_in_play_folded`).
6. **Chevrons animate like the Dashboard's.** Both folds (`toggleWeekFold`, data-fold `swings` / `recap`) now fold in
   place: the section's content is always drawn (hidden when folded), the same element toggles `is-open`, its chevron
   turns over `--vt-ms` with `--vt-ease` (the league cards' values), and a "cards" view transition names the card, the
   section and what follows it near the screen (`vt-card`), so the box grows or shrinks with the chevron, as S21 round 4
   did for the old recap card. Round 1's redraw on every toggle (which skipped the CSS turn) is gone.
7. **The image names no league** (owner: in a Discord server nobody has context for them): Still in play, Biggest win
   and Worst loss are out; it's the record, the splits and the top 3 MVPs and LVPs. **Were Biggest win / Worst loss in
   the Week Recap?** No: they were new in round 2's image only; the tab shows each league's margin on its tile.
8. **Eli Raridon still an MVP.** Checked in the owner's leagues through Sleeper's API (week 7): he's on 6 benches; 2 are
   Best Ball (Legacy Best Ball, BB Yang Dynasty), where Sleeper still listed Dalton Kincaid and Oronde Gadsden at TE with
   0.0 while Raridon had 17.6 and 16.1 (the team scores, 80.12 and 83.8, are the sum of that set lineup: Sleeper settles
   Best Ball after the games). Round 2's rule counted any Best Ball boom as started, and its tiebreak on booms anywhere
   (6) lifted him to 5th. Owner's choice: **work out Best Ball's lineup**. `bestBallLineup` (week/playerRecap.js) fills
   the league's saved slots, most specific first (QB, then W/T and W/R, then FLEX, then SUPER_FLEX), each with the
   highest scorer left who can play it, ties to Sleeper's own starter; in Best Ball that lineup is "started" everywhere
   (MVPs, Started %, LVPs, started zeros). Raridon now reads Started 33% (2), an MVP for the 2 Best Ball leagues where
   he'll count, ranked by those 2. The tiebreak is now ownership, not booms anywhere. A Best Ball league synced before
   round 2 (no slot order) uses Sleeper's lineup, with a "Sync again" line naming it. The Best Ball note says what
   Started means there.

`togglePlayerRecap` is now `toggleWeekFold`. CACHE_NAME stays v2.8.112 (this branch's bump, still above main's).

**Tests.** Unit (444): `bestBallLineup` (flex after specific slots, ties), Raridon's case (Best Ball with slots: MVP,
Started 1 of 2, Kincaid's 0.0 not a started zero; without slots: a bench boom and the "Sync again" name), dead weight
without an injured player, the tiebreak; the image without league names. Spec: the bullets ("and 2 more"), Export
Recap's button and file name and an image with no league name, and a new test that both folds keep the same chevron
element, turn it with a CSS transition and are remembered after a reload. `mls-this-week.spec.mjs`'s last-heading check
now looks at the card's own headings (the folded section's are in the page, hidden).

Checked against the owner's real week-7 data (Sleeper's API, every game counted final): Raridon is 5th with Started
33% (2), his 2 Best Ball booms; the first four started their booms in 3 to 6 leagues.

**Checks (round 3).** check-precache OK; 444 unit tests pass; Playwright 529 passed, 5 skipped, only `visual.spec.mjs`
stopping on the environment message. Screenshots vs. main: the same six as rounds 1 and 2, the other 36 identical. Still
to take from CI.

**Found while writing round 4:** round 3's Guide and CHANGELOG edits never applied (the edit script ran inside the
background check command, failed on a sentence it expected in another order, and the command still exited 0). That's
why the Guide PNGs' size didn't change in round 3. Applied in round 4, in the foreground.

### S22, round 4: the file name, Biggest win / Worst loss on the Scoreboard, and a user-hat review

1. **File name** (owner: combine both choices): `Week_7_Recap_My_Lineup_Strategist.png`. The other exports and the
   backups each name their files differently; a cleanup item is under "Open follow-ups" in docs/TESTING.md ("One naming
   pattern for exported files").
2. **Biggest win and Worst loss on the Scoreboard** (owner suggested below the tiles, above MVPs & LVPs, open to my
   opinion). I put them **under the record and splits, above Still in play**: with 19 leagues the tiles run about
   1,700px on a phone, so below them is a long way down, and once the week is final the tiles go back to league order,
   so the extremes are hard to spot anywhere else. Two compact rows (side by side from about 500px), a green or red edge
   like the tiles, the league's name whole and the margin; each opens that league's lineup. Among matchups already
   settled (decided or done; every one once the week is final), since a loss still in play could flip (`weekExtremes`,
   `extremesHTML` in week/thisWeek.js). They stay out of the image (round 3: no league names there).
3. **User-hat review** with the owner's 21 real leagues (Sunday night of week 7, MNF to come; the app served locally,
   Sleeper and ESPN live, phone and desktop). What reads well: the record and splits at a glance; Biggest win (How I Met
   Your Punter +115.6) and Worst loss right under them; Still in play naming who's left for MNF; Still open (Tanner
   McKee QB in 8 leagues, CeeDee Lamb in 6) as the "who do I need tonight" list; the image (record, splits, three MVPs
   and LVPs) is short and readable. Fixed at once: worst benchings printed "over Nico Collins (WR) 2.6", where "(WR)" was
   the slot but read as his position; now "over Nico Collins WR 2.6", and the slot only for a flex ("over Malik Nabers WR
   in FLEX 14.6"). Put to the owner (see the summary): LVPs counted 114 (every bench player under his Bust line whose
   game is final); MVPs' Boomed column ("6 of 6" for Raridon, started 33%) reads against the ranking by started booms;
   the five-line intro on phones; the image's split pills lose their outlines (html2canvas); a Best Ball league's
   Sleeper score during the week is its set lineup's, so Worst loss read Legacy Best Ball −73.8 though Raridon's 17.6
   will count there (the scoreboard's math, S21).

**Tests.** Spec: the two rows (settled only: a loss still in play isn't the Worst loss; under the splits, above the
tiles; a tap opens the league's lineup), the file name, the benching's wording.

**Checks (round 4).** check-precache OK; 444 unit tests pass; Playwright 533 passed, 5 skipped, only `visual.spec.mjs`
stopping on the environment message. Screenshots vs. main: the same six, the Guide PNGs now taller with rounds 3 and 4's
lines (desktop 1280×8053, phone 390×18169); the other 36 identical. Still to take from CI.

### S22, round 5: the review's five points, all built (owner: "Do 1-5")

1. **LVPs are players you started.** An LVP busted (under his Bust line, game final) in at least one league where you
   started him (Best Ball: in the lineup it would pick). Bench busts aren't LVPs: bench zeros are dead weight. The
   owner's week 7 went from 114 LVPs to 30.
2. **Boomed counts booms where you started him**, the number MVPs rank by ("3 of 4" for Luther Burden III, started 75%),
   in the table and the image. Partial booms still compare booms in any league (that's about scoring, not lineups).
3. **The intro moved into an (i) beside the MVPs heading** (`.mls-recap-info`), in short labelled lines: the leagues
   counted, Own and Started (and Best Ball), MVPs / Boomed / LVPs, the Boom / Bust lines. The Best Ball line under the
   tables went into the tip too; "Sync again" stays.
4. **Best Ball scores during the week** (S21's Scoreboard math, the owner agreed to it here). `leagueResult` scores each
   side of a Best Ball matchup by `bestBallLineup` over the league's `starterSlots` (saved at sync since round 2), and
   uses that lineup as its starters for who's live; the median and a guillotine league's place use the same scores.
   Without the slot order, Sleeper's points as before. Owner's week 7: Legacy Best Ball went from 80.1–153.9 to
   116.2–184.4 (both sides re-scored), and one Best Ball matchup turned into a win (record 4–16 → 5–15). The Simulator's
   win chance still isn't shown for Best Ball (it plays one fixed lineup; the open follow-up in TESTING.md stands).
5. **The image's split pills** draw each part's own border and rounding (html2canvas dropped the outline of one bordered
   box with `overflow: hidden`); **Biggest win / Worst loss** keep a 760px reading width on desktop, like the tables.

**Tests.** Unit (444): bench busts aren't LVPs. Spec: no LVPs in the base fixture (its two were bench zeros) with the
empty line; Boomed as started booms; the tip's text, and at 375px and 1280px that it opens on the screen in normal case;
a new test with Second Fixture League as Best Ball (Sleeper's `settings.best_ball`): its tile reads 137.4–95.2, +42.2,
where Sleeper's own total was 130.4, and St. Brown's 24.0 on the bench is an MVP there (started 50%), not a bench boom.
Also checked again with the owner's 21 leagues (Sunday night of week 7, live): the five changes as above; the only console
errors were requests this container's proxy blocks (photos, fonts), none from the app. With Best Ball re-scored, BB Yang
Dynasty (−7.1 in Sleeper's numbers, still in play) and LRD Cucks read as wins.

**Checks (round 5).** check-precache OK; 444 unit tests pass; Playwright 535 passed, 5 skipped, only `visual.spec.mjs`
stopping on the environment message. Screenshots vs. main: the same six, the Guide PNGs taller again (desktop 1280×8076,
phone 390×18284); the other 36 identical. Still to take from CI.

### S22, round 6: a second user-hat pass (the owner's 21 leagues, Monday early hours of week 7, MNF to come)

Walked through it as a user on phone and desktop: the Dashboard line, the Scoreboard top, Still in play, the tiles, MVPs &
LVPs folded and open, its (i), the lines under the tables, Export Recap and its image, a Best Ball league's Lineup strip
(opened from its tile), and MVP / LVP Lines in Advanced Settings. No console errors from the app.

Fixed at once: **the Scoreboard's (i) didn't say why a Best Ball score can differ from the Sleeper app** (round 5 scores
the lineup Best Ball would pick: Legacy Best Ball reads 116.2 here, 80.1 in Sleeper). A "Best Ball:" line in the header's
tip now says so; the spec checks it.

Checked and fine: the Lineup strip uses the re-scored Best Ball numbers (116.2–184.4, −68.2, "Effectively decided"), the
same as the tile; the (i) beside MVPs closes on a second tap or a tap elsewhere (a capture mid-fade looked as if it
hadn't); folds, rows and Started on phones as designed.

Put to the owner (see the summary): the LVP table has no Busted count, so its order can look wrong (Sam LaPorta, busted
in all 4 starts, sits above DK Metcalf, started 7, because Metcalf's 7.6 in four leagues is over the 7.5 line); the
headings and the image read "MVPS" / "LVPS" (the subheadings' uppercase); worst benchings run three lines each on a phone.

**Checks (round 6).** check-precache OK; 444 unit tests; Playwright: mls-this-week, tooltips-onscreen and mls-mvp-lvp,
56 passed (only a tooltip string changed, so no full run; screenshots unaffected, the tip is closed in them).

### S22, round 7: headings as written, shorter benchings; scoring formats put to the owner

- **"MVPs" / "LVPs" as written** (owner agreed): in capitals the subheadings read "MVPS" / "LVPS". The two headings
  (`.mls-recap-sub`) and the image's (`.mls-share-sub`) keep their case.
- **Shorter worst benchings** (owner agreed): "Tee Higgins WR 26.8 over Nico Collins WR 2.6 (−24.2) · May the Receptions
  Be With You", the league last and muted (`.mls-recap-league`); the heading already says they were benched.
- **Not built: a Busted column for LVPs.** The owner raised the bigger question behind it: one Boom / Bust line is
  easier to reach in full PPR than half PPR (RB/WR/TE), and in 6-point passing TD leagues for QBs. Options went to the
  owner (see the summary); waiting on their choice before building it or the Busted column.

**Checks (round 7).** 444 unit tests; Playwright `mls-mvp-lvp.spec.mjs` 26 passed (CSS and wording in this section only).

### S22, round 8: one Boom / Bust verdict per player, on half-PPR points

The owner's question after round 6: one line is easier to reach in full PPR than half PPR (RB/WR/TE), and in 6-point
passing TD leagues for QBs. I offered (A) judge each player once on one scale, (B) move each league's line by its
scoring (rules of thumb), (C) convert each league's points with the player's stat line. The owner asked for A and B in
plain terms (same score for everyone with one line, versus each league's own score with a different estimated line),
then chose **A, on half PPR** ("a more common format, and a good in-between of Standard and Full PPR").

- **The verdict.** `buildPlayerRecap` takes `verdict: { points }`, each player's points on the chosen scale; Boom / Bust
  is decided once from it, so `boomed` / `busted` are all his leagues or none, and `startedBoomed` / `startedBusted` are
  his starts. MVPs: boomed and started somewhere, ranked by starts, then ownership, then the verdict's points; LVPs: busted,
  started, game final, ranked by starts, then ownership, then the lower points. Dead weight is a verdict of 0; a bench
  boom (and so a worst benching) is a verdict boom, the gap still in that league's points. Partial booms no longer arise
  (they only came from scoring differences). A player missing from the stats scored 0 (he hasn't played).
- **The numbers.** Sleeper's week stats (`/stats/nfl/regular/<season>/<week>`, the endpoint the Simulator's history uses)
  carry `pts_half_ppr`, `pts_ppr` and `pts_std` (Sleeper's default 4-point passing TDs). `getLiveWeekStats`
  (js/shared/api/sleeperStats.js) fetches the current week uncached (`getWeekStats` keeps a week for good once stored, fine
  for finished weeks only), with the matchups on every load and Refresh. Owner's example: Eli Raridon was 15.35–17.6 in
  his leagues (TE premium) and 13.1 in half PPR.
- **Settings.** MVP / LVP Lines has "Judge on": Half PPR (default), Full PPR, Standard, saved as `scale` in the same
  `mls_recap_lines` object (no new key); Reset returns to Half PPR.
- **Tables.** MVPs and LVPs share one shape: Player | Own | Half PPR (the verdict's points) | Pts (each league's own
  scoring, the range) | Started; on phones Started moves under the name in both. This is the round-6 "Busted" idea in the
  form A gives it: LaPorta above Metcalf now shows why (Metcalf's 7.6s were his leagues' scoring).
- **Fallback.** If the stats don't load, each league's own points decide as before round 8, the third column reads
  Boomed / Busted counts, and a line says "Week stats didn't load".
- **The (i), the image, the Guide.** The tip explains the scale column and Pts; the image's rows read "started 2 of 2 ·
  25.0" with "Boom / Bust on Half PPR points" in the footer; the Guide's MVPs & LVPs item says how players are judged.
- **Fixtures.** The generator writes `stats-2026-2.json` (half-PPR points set apart from the leagues' own: Lamb 25.0 in
  Second Fixture League is 18.0) and `stats-2026-2-final.json` (Jefferson's 20.5).

**Tests.** Unit (448): the verdict overrides each league's scoring (and without it, each league's own), LVP order by
starts and lower points, a player missing from the stats, no partial booms, a verdict bench boom as a worst benching,
the scale in normalize / validate; the image's "started X of N" and footer. Spec (28): the half-PPR column and numbers,
Lamb not an MVP on his 25.0, Bowers an LVP on 4.0, the bench boom's line, Jefferson after the final, the Full PPR switch
(Allen 25.0 → 26.0), the fallback when the stats fail, both tables' Started on a second line on phones.

**A slip from round 6, found here.** Round 6 lengthened the Scoreboard header's (i) (the Best Ball line) and I said the
screenshots were unaffected without rendering them. They weren't: a closed tooltip is hidden (`visibility`, `opacity`)
but still absolutely positioned, so a long one hangs below a short page and adds empty scroll. Before kickoff the
Scoreboard is short, so `mls-league-scoreboard.png` grew (phone 844 → 925, desktop 900 → 952). Fixed by tightening that
tip's Best Ball and Still in play lines (same meaning); both PNGs match main again. Making every closed tooltip take no
layout would be a site-wide CSS change, so I left it alone.

**Real leagues (week 7, Monday early hours).** 9 MVPs (18 before: booms that came from full PPR or TE premium drop out,
e.g. Eli Raridon at 13.1 half PPR), 36 LVPs led by DK Metcalf (6.6, started in all 7); Colston Loveland TE an MVP on 16.4
half PPR (19.9–23.4 in his leagues). The image: "Drake Maye QB · started 6 of 6 · 28.4", footer "Boom / Bust on Half PPR
points". MVP / LVP Lines shows "Judge on: Half PPR". No app errors.

**Checks (round 8).** check-precache OK; 448 unit tests pass; Playwright 537 passed, 5 skipped, only `visual.spec.mjs`
stopping on the environment message (then mls-mvp-lvp, mls-this-week and tooltips-onscreen again after the tip edit: 58
passed). Screenshots vs. main: the same six as before (the Guide PNGs taller with this round's sentence: desktop
1280×8099, phone 390×18400), the other 36 identical, the Scoreboard's included. Still to take from CI.

### S22, round 9: a third user-hat pass (owner's 21 leagues, Monday of week 7; and a one-league user)

Looked at the owner's leagues again (phone and desktop, live, no app errors) and, for the first time, at someone with a
single Sleeper league (the fixture league alone, mid-Sunday). Nothing built this round; put to the owner:
1. **Two lists name the same player.** Tony Pollard is under "Boomed on your bench" (35.0 half PPR, benched in 1 league)
   and again under "Worst benchings" (35.0 over Malik Nabers WR in FLEX 14.6). Suggestion: one "Benched booms" list, each
   with what it cost where that's known ("over Malik Nabers WR in FLEX 14.6 · League of Ordinary Gentlemen").
2. **The (i) beside MVPs fills a phone screen** (five paragraphs since round 8). Suggestion: three short lines (what Half
   PPR and Pts are, what Own and Started are, the lines), the Best Ball detail kept to a clause.
3. **One league: Own and Started always read "100% (1)"**, two columns of noise. Suggestion: with one league counted,
   drop both (MVPs need a start anyway).
4. **One league: "Worst loss" repeats the only tile** right above it. Suggestion: Biggest win / Worst loss only with two
   or more head-to-head matchups.
5. Seen in passing, S21's area: the splits show "Dynasty 0–0" to someone with no dynasty league.

### S22, round 10: the third pass's five points, all built (owner: "Do 1-5")

1. **Benched booms, one list.** "Boomed on your bench" and "Worst benchings" named the same player (Tony Pollard on
   both). `benchedBooms` (week/playerRecap.js): each costly benching with its cost, largest first ("Tony Pollard RB 35.0
   over Malik Nabers WR in FLEX 14.6 (−20.4) · League of Ordinary Gentlemen"), then bench booms with no costly benching
   ("Rhamondre Stevenson RB · 20.0 Half PPR · benched in 1 league"). Three bullets, then "and N more".
2. **The (i) beside MVPs in three short lines**: Half PPR and Pts; Own and Started (with Best Ball in a clause); MVPs /
   LVPs and the lines.
3. **One league: no Own or Started columns** (`.is-single`: Player | Half PPR | Pts), no Own / Started line in the tip,
   and no "started 1 of 1" in the image. Also applies when only one league's matchups loaded.
4. **Biggest win / Worst loss only with two or more head-to-head matchups** that count (with one, it repeated the tile).
5. **No empty split parts** (S21's area, owner agreed): `splitGroups` (week/thisWeek.js, used by the Scoreboard and the
   image) leaves out Paid, Free, Redraft or Dynasty when you have no head-to-head league of that kind, and a group with
   no parts. A kind you have that's too early to call keeps its "0–0" (S21's spec checks that case).

**Tests.** Unit (450): `benchedBooms` (a cost, then a boom without one); the image without "started" for one league.
Spec: the merged list (St. Brown once, with his cost), the three-line tip, and a one-league test (only "Redraft 0–1", no
extremes, Player | Half PPR | Pts, no Own in the tip); the failed-league test now expects the one-league table.

**Checked with the owner's 21 leagues** (Monday of week 7, live, no app errors): Benched booms lists Tee Higgins (−24.2),
Tony Pollard (−20.4, once) and Luther Burden III (−15.4), "and 2 more"; the (i) fits well inside a phone screen.

**Checks (round 10).** check-precache OK; 450 unit tests pass; Playwright 539 passed, 5 skipped, only `visual.spec.mjs`
stopping on the environment message. Screenshots vs. main: the same six (Guide PNGs now desktop 1280×8122, phone
390×18492), the other 36 identical. Still to take from CI.

### S22, round 11: a fourth user-hat pass (a finished week, the scale switch, the keyboard)

New angles, with the owner's 21 leagues on a phone: week 6 through `?week=6` (every game final), MVP / LVP Lines switched
to Full PPR, and the folds from the keyboard. No app errors; nothing built.
- **Week 6 as a final recap reads well**: Final pill, Record 14–6, Biggest win (Friday Night Beverages +68.7) and Worst
  loss (Dynasty Bosses −53.8), 15 MVPs led by Bhayshul Tuten and Malik Nabers (started 6 of 6), 38 LVPs led by Charlie
  Kolar (3.5), Benched booms (Tyler Shough QB 34.4 over Brock Purdy in SFLEX, −12.4), "Every game is final" at the foot;
  the image has no "still live" and no "provisional".
- **Best Ball scores checked against Sleeper**: once a week is over Sleeper's own scores are the settled best lineups.
  All seven of the owner's Best Ball leagues match the Scoreboard's re-scoring (BB Ying Dynasty: 159.95 in Sleeper, shown
  as 160.0 to one decimal like every score on the card).
- **Full PPR** changes the column ("Full PPR"), the numbers and the lists as expected (20 MVPs, 30 LVPs; DK Metcalf an
  MVP on 20.3).
- **Keyboard**: Enter and Space both fold and unfold (`aria-expanded` follows).

Put to the owner as optional: (1) in the image, the MVPs follow the table's order (starts first), so Tyler Shough's 27.0
sits below two 22s, which may look unsorted to someone who doesn't know the rule; (2) a player with costly benchings in
two leagues is listed twice under Benched booms (Jaylin Noel, Full PPR), as designed in round 10; grouping them per player
is possible.

### S22, round 12: one Benched booms line per player; the pull request

The owner's answers to round 11: (1) not needed (the image's "started 6 of 6" explains the order); (2) yes. Benched
booms now groups a player's costly benchings into one line, largest cost first among players, each league's benching
after his name: "Jaylin Noel WR 25.4 over Brian Thomas Jr. WR 0.0 (−25.4) · Fantasy Leftovers; 22.2 over Jaleel
McLaughlin RB in FLEX 7.5 (−14.7) · Apex Dynasty League". Bench booms with no costly benching follow, as before.
`benchedBooms` entries of kind 'cost' carry `costs: [{ league, points, starter, gap }]` and the player's largest `gap`.
Unit test: a player costly in two leagues is one entry with both, largest first, ahead of a plain bench boom.

Then, at the owner's word ("this only turned up two small things"), the pull request, to let CI render the six
screenshots.

**Checks (round 12).** check-precache OK; 451 unit tests pass; Playwright 539 passed, 5 skipped, only `visual.spec.mjs`
stopping on the environment message. Screenshots: the same six as round 10 (no layout or Guide change this round).

**Screenshot baselines from CI** (pull request #207, run 40394147287 on e3189e4). CI failed on exactly the six PNGs listed
above; everything else passed. Each `-expected.png` matched the committed baseline byte for byte. The renders grew by 70px
for the MVP / LVP Lines row (both setup PNGs at both widths; the changed rows sit at that row, plus a 1-level colour
rounding in the fixed tab bar's blur) and by the Guide's new lines (desktop 7577 → 7841, phone 16616 → 17549). CI's
renders (desktop `mls-empty-setup` 1280×1941, `mls-league-setup` 1280×2538, `mls-league-guide` 1280×7841; phone 390×2038,
390×2811, 390×17549) are now the baselines.

## S21 follow-up: the Week Recap lasts through Tuesday (owner's bug report, Tuesday after week 7)

Owner: "MNF finished less than an hour ago, and already Week 7 Recap is gone, and now week 8 projections are showing.
Users should see a Week's Recap at least through Tuesday. Most apps transition to the next week on Wednesday, when
waivers typically run." Sleeper's state endpoint answered `"week": 8, "display_week": 7` at 04:13 UTC Tuesday: `week`
moves on when Monday night's game ends, `display_week` is the week Sleeper's own app shows.

- `State.recapNflWeek` (js/mls/state.js): `display_week` when it's a number from 1 to `week`, else `week`. Only the
  Week Recap (`weekCtx` in js/mls/week/thisWeek.js: the Scoreboard tab, the Dashboard's line, the Lineup strip, S22's
  MVPs and LVPs) reads it. Lineups, projections, kickoffs, locks and the Simulator stay on `currentNflWeek`, so Tuesday
  shows the new week's lineups beside last week's recap.
- When the recap week isn't the current week, the card loads that week the way `?week=` did (its own ESPN scoreboard
  and projections) and keeps its matchups in its own cache (`other.matchups`). Before, the address's week wrote into
  `State.lineupActualPoints`, the Lineup tab's cache for the current week, and with the recap a week behind every
  Tuesday the two tabs would have kept replacing each other's entries.
- Test: `mls-this-week.spec.mjs`, "Tuesday: the recap stays on last week…" (state week 3, display_week 2): Week 2
  Recap, Final, no ?week= notice, week 2's scoreboard asked for, the Lineup tab's cache never holds week 2. It fails
  on main ("Week 3 Recap").
- Checked with the owner's real leagues at 04:30 UTC Tuesday: "Week 7 Recap · Record 7–13 · Final" on the Scoreboard
  and the Dashboard, the Lineup strip on week 7, the app's week 8.
- Open: whether `display_week` changes on Wednesday morning or with waivers (Sleeper doesn't document it); either is
  what the owner asked for.

## S23 follow-up: the Scout tab after a league switch made on it (owner's bug report)

Owner: on the Scout tab, switching from a redraft league to a dynasty one kept Rank By at "Weekly Rank / ROS Rank", with
no Dynasty or In-Season choice, and the reverse kept the dynasty choices, until they went to another tab and back.
"Please check that everything else on the Scout tab changes based on league correctly."

- Cause: S23 made Rank By's choices depend on the league, but `applyWaiverScanSettingsToUI` (js/mls/scout/waivers.js)
  ran only at start-up, on a setting change and when the Scout tab was shown (`onScoutTabShown`). `applyActiveLeague`
  (js/mls/leagues/sync.js) redrew the Top Available list but not the controls. It calls
  `applyWaiverScanSettingsToUI` now, before the results are redrawn (imported through main.js, as sync.js's other
  calls are).
- The check: a probe switched leagues on the Scout tab in each Waiver Wire mode (Top Available, Auto-Find, Check a
  List), both ways, and compared everything visible on the tab (text, each select's value and choices, inputs,
  classes) with what leaving the tab and coming back showed. Rank By (its choices, and the wide-group class) was the
  only difference. Trade Analyzer is already cleared on a switch (`clearLeagueScopedResults`), and the Market Consensus
  settings already follow the league (`applyLeagueDefaultsToMarketSettings`).
- Market Disconnect: a tab switch doesn't redraw it either, so it was checked by hand. Its report stayed up after a
  switch with the old league's "Rostered by" and Free Agent lines and the old league's ROS ranks. A report on screen is
  now re-run for the new league (`runMarketDisconnectAnalysis`, local, no fetch); an empty one stays empty.
- Not changed (a question for the owner): market values are one set, from the last fetch. Fetched in a redraft league
  ("Market Data (REDRAFT (1QB, PPR: 1)) Pulled Successfully!") and then switched to a dynasty one, the settings switch
  to Dynasty but the loaded values, the Trade Analyzer's and Market Disconnect's, stay redraft until the next fetch.
- Test: `tests/mls-scout-league-switch.spec.mjs` (both widths): Rank By in each mode both ways; In-Season Rank picked
  in the dynasty league, ROS shown in the redraft one, In-Season again on the way back; Market Disconnect's owner line
  follows the league; no report, nothing drawn. The first two fail on main.
