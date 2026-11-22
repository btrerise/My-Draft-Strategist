# Improvements log

Work from the [Strategist Improvements Runbook](https://claude.ai/artifact/SF5xjaoxUyzPJM7WKCmohN): one entry per card,
with what changed, the owner's decisions and anything left over. [`docs/refactor/LOG.md`](../refactor/LOG.md) is the
history of the module-structure refactor.

## Standing rules from the owner (apply to every card)

- **Icons are SVG, never emoji** (set during S1). Anything users see uses an inline `<svg aria-hidden="true">` with
  `stroke="currentColor"`, Feather-style like the rest of the site. Recorded in `CLAUDE.md` ("Rules that bite") and
  `docs/TESTING.md` (Conventions). Plain text glyphs already in use (✕, ★) are fine. Enforced by
  `tests/unit/noEmoji.test.mjs`, which scans every served file and fails naming the file and line.
- **Keep your entry short** (rule 10 of the runbook): about 40 lines (3 KB) at most, however long the session ran. Leave
  out the step-by-step story, test output, and anything the code, the commit messages or `CHANGELOG.md` already say; a
  later session should read it in a minute. If you add to an entry over several rounds, edit it down rather than
  appending a section each round. Recorded in `CLAUDE.md` ("Rules that bite").
- **Never read this file whole.** Read the standing rules and grep the index above. Older entries are in `log/`.

## Index (grep a card ID here; never read this file or the archive whole)

One line per entry: `ID | file (under docs/improvements/) | heading`. Older entries are in `log/`.

- S1 | log/2026-10.md | S1 — Top available players in your league
- F1 | log/2026-10.md | F1 — FLEX Kickoff Optimization covers SFLEX slots
- F2 | log/2026-10.md | F2 — Sync All spinner keeps spinning
- F3 | log/2026-10.md | F3 — Hide the initials when a headshot is showing
- S5 | log/2026-10.md | S5 — Best available in every league (Dashboard)
- Bug found during S5: | log/2026-10.md | Bug found during S5: a new manual league starts with another league's rankings (runbook card F4)
- S6 | log/2026-10.md | S6 — Sleeper trending adds in Top Available
- F4 | log/2026-10.md | F4 — A new league starts with no rankings
- S2 | log/2026-10.md | S2 — Rename a ranking set
- S3 | log/2026-10.md | S3 — What changed: a summary after replacing a ranking set
- F5 | log/2026-10.md | F5 — Export Team draws the Flex slot labels as color bars
- S7 | log/2026-10.md | S7 — SoS badge in the Waiver Wire Assistant
- S8 | log/2026-10.md | S8 — Show the tier of the player free agents are compared against
- Bug found during S8: | log/2026-10.md | Bug found during S8: the Lineup and Roster tabs show the overall rank as the position rank (runbook card F6)
- F6 | log/2026-10.md | F6 — Lineup and Roster tabs show the overall rank as the position rank
- S9 | log/2026-10.md | S9 — Position counts on the Roster tab
- S10 | log/2026-10.md | S10 — A legend for the badges and symbols
- S11 | log/2026-10.md | S11 — Optimize All names the lineups that need you
- S12 | log/2026-10.md | S12 — A phone Dashboard: one card per league
- S16 | log/2026-10.md | S16 — Smooth transitions between tabs and leagues
- S14 | log/2026-10.md | S14 — Trade Analyzer: how your team changes
- S19 | log/2026-10.md | S19 — Trade Analyzer: what would make it fair
- S17 | log/2026-10.md | S17 — Faster first load and tab switches
- F7 | log/2026-10.md | F7 — The League Command Center stops asking for changes once games have kicked off
- F8 | log/2026-10.md | F8 — Auto-Find calls a ranked player "unranked" when he isn't in the FLEX list
- F9 | log/2026-10.md | F9 — Trade Analyzer: Receive and Give line up on desktop
- S21 | log/2026-10.md | S21 — This week: every league's matchup, live, with the swing matchups
- S23 | log/2026-10.md | S23 — Dynasty leagues: a season rankings set beside the dynasty one
- S22 | log/2026-10.md | S22 — This week's MVPs and LVPs across your leagues
- S21 follow-up | log/2026-10.md | S21 follow-up: the Week Recap lasts through Tuesday (owner's bug report, Tuesday after week 7)
- S23 follow-up | log/2026-10.md | S23 follow-up: the Scout tab after a league switch made on it (owner's bug report)
- S24 | log/2026-10.md | S24 — Dynasty leagues: now and long-term side by side
- S26 | log/2026-10.md | S26 — A navigation rail on wider screens (Material 3)
- F10 | log/2026-10.md | F10 — Replace Set: the buttons in reach, and the red box counts every league using the set
- S28 | log/2026-11.md | S28 — Week Recap: choose the week, and a Competing / Rebuilding split
- M1 | log/2026-11.md | M1 — A Material 3 review of the whole site (research)
- N1 | log/2026-11.md | N1 — Research: what notifications would take on this site
- S27 | log/2026-11.md | S27 — Who to root for and against this week, across your leagues
- A1 | log/2026-11.md | A1 — Real visitor numbers: privacy-friendly analytics
- S31 | log/2026-11.md | S31 — Lineup tab: this week's opponent strength from your weekly rankings
- M2 | log/2026-11.md | M2 — Material 3: 48px touch targets, one focus ring, and press and hover feedback
- Tooling | log/2026-11.md | Tooling: Playwright 1.56.1 → 1.63.0, the cloud image's Chromium (owner's request, 2026-11-05)
- M11 | log/2026-11.md | M11 — Material 3: the badge legend in a sheet (and a shared sheet for S32)
- K1 | log/2026-11.md | K1 — Research: Ko-fi tips, a polite ask, supporter perks and sharing
- K8 | log/2026-11.md | K8 — FantasyCalc through a cached Pages Function, and a clear FantasyCalc credit
- K2 | log/2026-11.md | K2 — Ko-fi easier to find, and a Share button
- K3 | log/2026-11.md | K3 — Link previews for all three pages, and counting shared links
- S30 | log/2026-11.md | S30 — See the rankings you uploaded
- F12 | log/2026-11.md | F12 — "N lineups need you" counts a lineup that has a change to set
- F13 | log/2026-11.md | F13 — Locked players still follow kickoff order
- F11 | log/2026-11.md | F11 — Every chevron turns when its section opens
- S33 | log/2026-11.md | S33 — Player Scoreboard: kickoff order (Thursday night first), and find a player
- S38 | log/2026-11.md | S38 — Trade Analyzer: the same draft pick twice, and market values without a trip to Value settings
- T1 | log/2026-11.md | T1 — T-Score: in-season data from your new Google Sheet
- W1 | log/2026-11.md | W1 — CI: docs-only pull requests pass the required check in seconds
- S29 | log/2026-11.md | S29 — Power Rankings: what your last trade did
- N2 | log/2026-11.md | N2 — Starter alerts before kickoff (site open), and the shared notification module
- F17 | log/2026-11.md | F17 — 2-QB leagues: the two QBs follow kickoff order
- F20 | log/2026-11.md | F20 — T-Score: the touch-target test that failed now and then (two links in The Research)
- S46 | log/2026-11.md | S46 — When you last synced, on the Dashboard
- T1 follow-up | log/2026-11.md | T1 follow-up — XFP/G and FPOE/G on the In-Season tab (owner, 2026-11-12)
- U1 | log/2026-11.md | U1 — Research: how features are organized (the tabs are getting long)
- M17 | log/2026-11.md | M17 — Room on phones: full-width sections, and nothing boxed inside cards
- S36 | log/2026-11.md | S36 — The Final Window: what rides on the last game of the week
- F18 | log/2026-11.md | F18 — Scoreboard: count Sleeper's auto-subs
- S34 | log/2026-11.md | S34 — Waiver claim or free agent: the Dashboard's upgrades say which, and when
- F16 | log/2026-11.md | F16 — Closed tooltips stop taking up space
- S32 | log/2026-11.md | S32 — Phone rows on the Lineup and Roster tabs: less at once
- S35 | log/2026-11.md | S35 — A suggested FAAB bid
- F23 | LOG.md | F23 — The flash when tapping things on phones
- S50 | LOG.md | S50 — Early Games filled in for you from the week's kickoffs
- S52 | LOG.md | S52 — Bye Crunch: weeks when byes leave a starting slot short
- M18 | LOG.md | M18 — Material 3 Expressive: a review against the sources, corrections to earlier values, and what's built
- F25 | LOG.md | F25 — Slow Sync All and Dashboard on phones (owner's report, 2026-11-16)
- F26 | LOG.md | F26 — Less data and less waiting in Sync All (owner, 2026-11-16)
- F27 | LOG.md | F27 — A review as a user of M18, F25 and F26, and three fixes (owner, 2026-11-17)
- W3 | LOG.md | W3 — Leaner sessions: split LOG.md, quieter tests, a setup script
- W5 | LOG.md | W5 — The runbook's cards get the lean start-up and the new rules

## F23 — The flash when tapping things on phones

From the owner's notes of 2026-11-12 (sent 2026-11-14): "Can we remove the highlight that appears when tapping things?
Or is that intentional for some reason?" Two things showed on a tap: the browser's own tap highlight (Chrome on Android's
translucent blue-grey box; not intentional, `css/base.css` removed it only on the tab bar, `.nav-btn`) and M2's press
tint (a 10% wash of the control's own colour while pressed, a button's corners 6 → 4px; intentional, Material 3's
pressed state).

**User-visible effect.** No browser flash on any tap, on all three pages. Buttons answer a press as before (M2's tint and
corners, unchanged). Things that open something without being a button now answer a press with the same tint, where
before they had the browser's flash only: every fold (`<summary>`: Recent Sync Logs, Advanced Settings' Notifications,
FAAB Bids, Backup & Restore, Danger Zone, Lineup settings, Value settings, Best available, the rankings changes, the
Trade Analyzer's "Their team", T-Score's folds; in a lighter fold block the whole row tints, padding included), the ROS
and Weekly rankings cards' headers and Auto-Find's sections (the same toggle), the cross-app banner links ("Switch to My
Lineup Strategist", "Try My Draft Strategist") and the menu's links to the other pages (T-Score, and the other app).
Press only: their hover on a computer is unchanged (hover is M2's). Links inside a sentence, and small text links
("Read Methodology →", the "Powered by" credits), get nothing.

**The owner's decisions** (after a recording at phone size of five taps, today against a preview, 2026-11-15):
1. Remove the browser's flash everywhere, in all three apps (the suggestion).
2. Keep M2's press tint as it is (the suggestion; not lighter, not removed).
3. Give the tint to folds, card headers, banner links and the menu's T-Score link (the suggestion); plain links in text
   get nothing. I added the menu's link to the other app (`.premium-link-btn`) to the same group: it's the menu row
   right under the T-Score link, and it was the one menu row left without a tint.

**What changed.**
- `css/base.css`, STATE LAYERS: a new TAP HIGHLIGHT rule, `:root { -webkit-tap-highlight-color: transparent; }`
  (inherited, so it covers every element); the `.nav-btn` line ("Removes blue flash on mobile tap") is gone. After M2's
  `:active` rule: the same `::before` layer for `summary`, `.guide-banner > a` and `a.nav-btn:not(.premium-link-btn)`,
  tinted 10% on `:active`; the rankings card toggle's `::after` (which already covers its header) tinted on `:active`;
  `.premium-link-btn` tinted on the link itself (its `::before` is the menu's dashed divider). A fold in a
  `.sos-details-accordion` stretches its layer over the block's padding (closed: the whole block; open: the header row).
  Reduce Motion turns the new fades off with M2's.
- The inventory behind the list (a throwaway script on every tab of the three pages at 390px, not committed): besides
  buttons, the untinted tappable things were the summaries, the rankings card headers, the banner links, the menu's two
  page links, standalone text links, links in sentences, form fields (labels, switches, selects, file inputs: they have
  their own feedback) and the skip link (keyboard only). Everything else that opens something is already a `button`.
- `sw.js` `CACHE_NAME` v2.10.12. CHANGELOG lines under both apps' Unreleased (T-Score's under Draft Strategist's, as
  before). docs/TESTING.md: the convention (Touch targets, focus and press feedback) and M3's follow-up (the new 150ms
  fades move onto the motion tokens with M2's).

**Tests.** `tests/tap-feedback.spec.mjs` (new, 6 per width): the computed `-webkit-tap-highlight-color` is transparent on
a sample of controls on each page (root, nav, buttons, banners, menu links, folds, links, form fields); with `:active`
forced through DevTools (`CSS.forcePseudoState`), a button keeps its 10% layer, and the folds, the rankings card header,
the banner links and both menu links show 10%, while a link inside a Guide sentence has no layer. On main all 12 failed
(the root's highlight was Chromium's default `rgba(0, 0, 0, 0.18)`; no layer on folds or links). Ran check-precache,
`node --test` (688), and `tap-feedback`, `touch-targets`, `focus-ring`, `chevrons`, `view-transitions`: all passed.
Screenshots: main and this branch rendered in the same container are pixel-identical (all 44 PNGs; no tap is in them).
The full suite hasn't run (rule 7: once, when the owner asks for the pull request).

**How the recording was made** (for anyone repeating it): the headless shell never draws the tap highlight, and neither
do Playwright's touch taps on Linux (synthetic touches skip the browser's gesture detector, which is what starts the
highlight). Full Chromium (`channel: 'chromium'`, the same revision 1243) with DevTools' touch emulation
(`Emulation.setTouchEmulationEnabled` + `setEmitTouchEventsForMouse`, then `Input.dispatchMouseEvent` press/release,
not awaited) does, recorded with `Page.startScreencast`. It draws desktop Chromium's colour (dark grey), not Android's
blue-grey.

**Left over.** Nothing for this card. M3 moves the new fades onto the motion tokens with M2's (noted in TESTING.md).

### The full suite and the pull request

Owner: "Looks good. Run the suite, then open PR, watch CI, and merge when green" (2026-11-15). **The full check**
(`npm ci && npm run check`, once): check-precache OK (177 precached), `node --test` 688 passed, Playwright 1094 passed,
72 skipped, 4 failed. The 4 are `visual.spec.mjs`'s environment guard (this container's fonts), as on main; the
screenshots themselves were compared main against this branch in the same container (identical, above).

## S50 — Early Games filled in for you from the week's kickoffs

From the owner's notes of 2026-11-12 (sent 2026-11-14): "Could we make the 'Early Games' feature on the Lineup tab
automatic? Might want to make it optional if so." Before, Early Games was a list of teams you picked by hand
(`KEYS.mls.earlyTeams`) that never cleared, so last Thursday's teams stayed picked until you removed them.

**User-visible effect.** The Lineup tab's Early Games card has a "Fill in from the schedule" switch, on by default. With it
on, the list fills itself each week with every team playing before Sunday 1:00 PM Eastern (Thursday, Friday, Saturday
and the international morning games; not Monday night), so the EARLY badges, the Early Game Reminder banner and the
Dashboard league cards' EARLY chip appear on their own. Each chip says where it came from: the schedule's show their
kickoff in your local time ("Thu 8:15 PM"; "Schedule" while this visit's kickoffs haven't loaded), yours say "Added".
You can still add a team, or remove one the schedule filled in; a removed one is listed under the chips ("Removed this
week: DET Put back"). Everything clears when a new NFL week starts, switch on or off. With the switch off you pick by
hand as before (and those picks also clear weekly). The card's tooltip, the switch's line and the Guide's step 5 say it's
automatic; the Guide legend's EARLY line says "a team under Early Games: filled in from the schedule, or one you added".
Empty states: "No games before Sunday 1:00 PM Eastern this week." (kickoffs loaded, none early), "This week's kickoff
times haven't loaded yet. You can add teams yourself." (switch on, no kickoffs), "No teams selected." (switch off).

**The owner's decisions** (2026-11-15, all four suggestions):
1. Early = before Sunday 1:00 PM Eastern (Thursday, Friday, Saturday, international mornings); Monday night isn't.
2. On by default, the switch on the Early Games card (S45's Settings page isn't merged).
3. With it on you can still add a team and remove one the schedule added, for that week only.
4. The list follows the NFL week: last week's teams clear on their own, even with the switch off.

**What changed.**
- `js/mls/lineup/earlyRule.js` (new, no imports): `earlyTeamsFromKickoffs(gameTimesByTeam)`. Worked out in Eastern time
  with `Intl.DateTimeFormat` (`America/New_York`), whatever the device's zone. "Sunday" is the week's main Sunday (the
  Eastern Sunday with the most kickoffs), so a Christmas Wednesday or a week-18 Saturday counts and nothing after it
  does; a week with no Sunday games falls back to Wednesday–Saturday.
- `js/mls/lineup/earlyGames.js`: the list is now `getEarlyTeams()`: the schedule's teams less the ones you removed, then
  yours (`State.earlyTeams`, the same key as before, so old installs keep their picks). `noteEarlyWeek()` (called from
  `refreshCurrentNflWeek` in `state.js` once Sleeper names the week) clears your teams and the week's state when the
  week differs from the saved one; an install with no saved week adopts the current one, so its picks count as this
  week's and clear next week. `noteEarlyKickoffs()` (called from `refreshGameTimes` when ESPN's kickoffs arrive) saves
  the schedule's teams for the week. Until they load, what was saved stays (the badges show at once on the next visit).
  New actions `restoreEarlyTeam` (Put back) and `setEarlyFromSchedule` (the switch, a change action) in `main.js`.
- Storage (`keys.js`, no renamed keys): `mls_early_week` = `{ week: '2026-11', schedule: [team], removed: [team] }`
  (the season-week stamp as `locksWeek` and starter alerts use), and `mls_early_from_schedule` = `'0'` while the switch
  is off (unset = on). Both `mls_`, so Backup, Restore and Factory Reset pick them up.
- `lineup/index.html`: the switch row, the "Removed this week" line, the tooltip and Guide step 5. `css/mls.css`: the
  chip's muted note and the removed line. `js/mls/legend.js`: the EARLY meaning. `sw.js`: `earlyRule.js` precached,
  `CACHE_NAME` v2.10.13. CHANGELOG line under Lineup Strategist.
- Not touched (out of scope): the optimizer (EARLY stays a reminder) and FLEX Kickoff Optimization.

**Tests.** `tests/unit/earlyRule.test.mjs` (5): a November week with Thursday, Saturday and a 9:30 AM Madrid game fills
exactly those six teams (not 1:00 PM, 4:25, SNF or MNF); a September (daylight time) week with 12:59 vs 1:00 PM; a
Christmas Wednesday; empty and bad input; the new keys are MLS-owned. Passes with `TZ=America/Phoenix` too.
`tests/mls-early-games.spec.mjs` (6 per width), with a stubbed ESPN scoreboard: on by default fills exactly the
Thursday, Saturday and international teams with their kickoffs, the banner and EARLY on Josh Allen and Justin Jefferson
but not Ja'Marr Chase; add and remove for the week, Put back, kept across a reload; switch off picks by hand and stays
off; the next NFL week clears last week's teams (switch off) and the schedule refills when it's turned on; a pre-S50
install keeps its picks as this week's; kickoffs that fail keep what was saved, then show the not-loaded empty state.
Ran check-precache, `node --test` (693), `mls-early-games` and the specs that stub kickoffs or read EARLY
(`mls-auto-sub`, `mls-final-window`, `mls-flex-choice`, `mls-keyboard`, `mls-mvp-lvp`, `mls-opponent-strength`,
`mls-root-for`, `mls-root-kickoff-find`, `mls-starter-alert`, `mls-this-week`, `nav-rail`, `tooltip-closed-space`,
`tooltips-onscreen`, `touch-targets`, `mls-lineup-needs`, `mls-phone-rows`, `key-migration`): 338 passed. The full suite
hasn't run (rule 7: once, when the owner asks for the pull request).

**Screenshots.** Main and this branch rendered in the same container (`npm run pxdiff`): 40 of 44 identical. Changed, as
intended, and re-taken on CI (`[update screenshots: …]` in the commit after this entry):
- `desktop/mls-league-lineup.png`, `phone/mls-league-lineup.png`: the Early Games card's new switch row and its empty
  line. The tests are offline (ESPN aborted), so the card shows "This week's kickoff times haven't loaded yet. You can add
  teams yourself." where main said "No teams selected."; no EARLY badges either way.
- `desktop/mls-league-guide.png`, `phone/mls-league-guide.png`: Guide step 5's longer Early Games sentence.

CI re-took exactly those four (`e8448ec`, "Screenshots re-taken on CI (4 PNGs)"); nothing else changed. Opened each
against main's: the Lineup ones differ from the Early Games card down (the card, then everything below moved by the
taller card: desktop 2808 → 2882px, phone 3028 → 3131px), and the Guide ones from step 5 down (desktop 10601 → 10645px,
phone 24709 → 24845px). One more spot: on the desktop Lineup PNG, rows 39–55 (the header) differ by 1 level out of 255,
not visible, most likely the taller page's background rendering; nothing there changed.

**Left over.** Nothing required. Possible follow-ups, not built: the switch could move to S45's Settings page once it
merges (the owner chose the card for now); a page left open across the week change picks up the new week only with F24.

### S50, round 2: a review as a user; the owner took all four (2026-11-15)

I looked at the card filled in (a fixture week, one team added, one removed) at 390 and 1280px. Findings:
1. On phones each team was a 56px pill on its own row (the ✕'s 44px tap area plus the kickoff time made two too wide
   to share a row): six early teams took ~400px.
2. The kickoff times repeated what each player's row already shows beside EARLY.
3. The Early Game Reminder showed whenever any team was early, which with the schedule filling the list is every week,
   even with no early player in your lineup.
4. EARLY stayed on a player after his game started (the Dashboard's chip already dropped it).
5. The picker sat above the list, though with the switch on adding a team is the exception.

Owner: "All four" (the four changes proposed: rows by day, the reminder only when it applies, EARLY off at kickoff, the
picker under the list).

**What changed.**
- `js/mls/lineup/earlyGames.js`: the chips in rows, one per day the schedule's teams play (your local weekday; "Schedule"
  while this visit's kickoffs haven't loaded), then "Added". A chip is the team and an SVG ✕ (was the ✕ character).
  `checkEarlyBannerVisibility` (now exported) shows the reminder only when a starter in the open league's lineup is on an
  early team and his game hasn't started; `render/lineup.js` calls it on every redraw.
- `js/mls/render/lineup.js`: EARLY on starter and bench rows only until `hasKickedOff`.
- `lineup/index.html`: the picker under the chips and the removed line. `css/mls.css`: `.early-day` rows (a 4.25rem
  label column, 44px rows); compact chips whose ✕ keeps its 44px tap area through negative margins, 18px between wrapped
  lines so tap areas don't overlap. `js/mls/legend.js`: EARLY "goes once his game starts". CHANGELOG lines updated.
- The phone card with six early teams, one added and one removed: ~440px with the switch (was ~620px).

**Tests.** `mls-early-games.spec.mjs` (7 per width now): the rows' day labels (Fri, Sat, Sun in UTC; Added; Schedule);
after Thursday's kickoff Josh Allen loses EARLY while Justin Jefferson keeps it and the reminder stays; after every early
kickoff no EARLY and no reminder; a new test: the reminder hides with only KC picked (nobody in the lineup) and shows
with CIN (Ja'Marr Chase starts). Ran check-precache, `node --test` (693), `mls-early-games`, `touch-targets`,
`mls-phone-rows`, `mls-lineup-needs`, `mls-keyboard`, `focus-ring`, `svg-icons`, `badge-legend`, `tap-feedback`: all
passed. The full suite hasn't run.

**Screenshots.** Round 1's branch against this one in the same container: three changed, re-taken on CI with the
commit after this entry. `desktop/mls-league-lineup.png` and `phone/mls-league-lineup.png`: the picker now under the
card's empty line (offline, so no teams and no reminder either way); `desktop/mls-league-guide.png`: the legend's EARLY
line is longer. The phone Guide didn't change in this container.
CI re-took exactly those three ("Screenshots re-taken on CI (3 PNGs)"); same sizes as round 1's, and each differs only
there: the Lineup ones in the Early Games card (desktop y 2246–2315, phone y 2323–2407: the empty line, then the
picker), the desktop Guide in one legend line (y 8761–8772).

### S50, round 3: a second review as a user; the owner took 2–5, and 1 as "check Sleeper's slots" (2026-11-15)

A walk through a week in Phoenix time (Tuesday, Thursday night after kickoff, the Dashboard, the switch off, the tooltip).
Findings: (1) the reminder still showed with nothing to do: it says to move early starters out of FLEX, but FLEX Kickoff
Optimization (on by default) already does, and no early starter was in FLEX; (2) its wording said "before Sunday",
though the list includes Sunday-morning games abroad; (3) it sat between the starters and the Bench Priorities heading;
(4) the card's tooltip was six lines of prose; (5) a row labelled just "Sun" left you wondering why Sunday was listed;
(6) chips stay plain after their game (left as is, optional).

Owner: "Do 2-5 for sure. For 1, my only thought is the reminder is helpful to ensure the user makes the change on Sleeper,
if synced. Just because it looks right on our app, doesn't mean the player is in the correct place on Sleeper." Asked
which rule: **check Sleeper's slots** (the suggestion) over keeping round 2's rule with new words.

**What changed.**
- `js/mls/lineup/earlyRule.js`: `earlySwaps(starters, …)`: an early starter whose game hasn't started, in a slot taking
  several positions (FLEX, SFLEX, W/R, W/T), paired with the latest-kicking starter in his own position's slot who can
  play that flex slot and hasn't started. No partner, no swap (the advice would be impossible).
- `js/mls/lineup/earlyGames.js`: the reminder reads Sleeper's lineup (`sleeperLineup`, starterAlertRules.js: each slot
  as of the last sync) in a synced league with a lineup set there, else this app's lineup; shows only when there's a
  swap, and names it: "On Sleeper, swap Justin Jefferson (FLEX, Sun 6:30 AM) with Ja'Marr Chase (WR, Sun 10:00 AM), so
  your FLEX holds the later game." plus "From your Sleeper lineup as of your last sync, Tue 9:00 AM." (several swaps:
  a list). In a manual league it says to use ⇄ Swap. The chips' rows are one per kickoff, labelled with it in your
  time ("Sun 6:30 AM"), in one grid so the labels share a column.
- `lineup/index.html`: the reminder moved into the Optimal Lineup card, under Lineup settings and above the lineup; the
  tooltip down to two lines; Guide step 5 says what the reminder does. `css/mls.css`: the list and note in the reminder,
  the grid. Found by `touch-targets` along the way: the empty line in the new grid's `max-content` column made the phone
  Lineup scroll sideways by 115px; it now spans the grid.
- Round 2's rule (any early starter) is gone with it: the reminder no longer shows every week.

**Tests.** `tests/unit/earlyRule.test.mjs` (8): the swap with the latest partner, slot labels with and without a number,
no swap (no later partner, his own slot, a position that can't take the slot, either game started), two flex slots and
SFLEX. `mls-early-games.spec.mjs` (8 per width): row labels by kickoff; no reminder with this app's lineup (Lamb's
1:00 PM game in FLEX); with a Sleeper lineup that has Jefferson in FLEX the reminder names the swap with Chase and the
sync time, sits in the Optimal Lineup card, and goes once Jefferson's game starts; no reminder when Sleeper already
has Jefferson at WR. Ran check-precache, `node --test` (696), `mls-early-games`, `touch-targets`, `mls-phone-rows`,
`mls-lineup-needs`, `mls-keyboard`, `mls-starter-alert`, `tooltip-closed-space`, `tooltips-onscreen`, `svg-icons`,
`badge-legend`, `mls-flex-choice`, `mls-sflex-kickoff`, `mls-2qb-kickoff`: all passed (after the fix above). The full
suite hasn't run.

**Screenshots.** Round 2's branch against this one in the same container: only `desktop/mls-league-guide.png` and
`phone/mls-league-guide.png` (step 5's new sentence), re-taken on CI with the commit after this entry. The Lineup ones
are identical: offline, there are no early teams, so the reminder is hidden in both.
CI re-took exactly those two ("Screenshots re-taken on CI (2 PNGs)"): from step 5's paragraph down (desktop 10645 →
10668px, phone 24845 → 24938px), the new sentence in place. The desktop one again differs by 1 level of 255 in the header
(rows 39–55), as in round 1: the page's new height, nothing that changed there.

### S50, round 4: the reminder into "This lineup needs you" (owner, 2026-11-15)

Owner: "Could we combine the reminder with one of the other items beneath the 'Optimize Lineup' button? I'm thinking it
could at least be collapsible and/or dismissable. With its new location, on a phone, it's quite the scroll before you
actually see the Lineup." I suggested the "This lineup needs you" box (where Sleeper to-dos already go, folding and
remembered), with a Got it for the week and no change to the needs counts; owner: "Yes, go with your initial suggestion".

**What changed.**
- The amber Early Game Reminder banner is gone (`lineup/index.html`, its CSS in `css/mls.css`).
- `js/mls/lineup/earlyGames.js`, `earlySwapNeeds(league)`: round 3's swaps as { title, summary, body, count } for
  `getLineupNeedsHTML` (`gameInfo.js`, a new optional 4th argument; `render/lineup.js` passes it). With anything else in
  the box they're a fold like the Sleeper one, closed until opened ("Early games: 1 swap on Sleeper"); alone they show
  under the box's title, "Early games: 1 swap to consider", with the info icon (not the warning one). The body: "Swap
  Justin Jefferson (FLEX, Sun 6:30 AM) with Ja'Marr Chase (WR, Sun 10:00 AM), so your FLEX holds the later game." and
  "On Sleeper, as of your last sync, Tue 9:00 AM." (manual: "Use ⇄ Swap on his row.") beside **Got it**.
- Not counted: the box's folded count, its title, the Lineup strip and the Dashboard keep F12's rule (`leagueNeeds`
  untouched), so a league with only an early swap doesn't "need you".
- Got it (`dismissEarlySwaps`, a click action in `main.js`) stores the swaps it hid in a new key, `mls_early_dismissed` =
  `{ week: '2026-11', keys: ['earlyId>laterId'] }` (`keys.js`), read only for the week it names. A different swap (Sleeper's
  lineup changed) shows again.
- Guide step 5: the swap appears in "This lineup needs you".
- On a phone, the first player now starts at 619px instead of 774px (155px higher); on desktop 637 instead of 711
  (Sleeper lineup with Jefferson in FLEX and an empty RB slot, the spec's fixture).

**Tests.** `mls-early-games.spec.mjs` (9 per width): the fold, closed, in the box with "Early games: 1 swap on Sleeper";
opened, the swap and the sync time; folding the box leaves "Early" out of its count line; gone at Jefferson's kickoff;
a new test: Got it hides it and stores `{ week: '2026-2', keys: ['6794>4866'] }`, still hidden after a reload; none with
this app's lineup or with Sleeper's Jefferson at WR. The alone-in-the-box look checked by eye (a throwaway render). Ran
check-precache, `node --test` (696), `mls-early-games`, `touch-targets`, `mls-phone-rows`, `mls-lineup-needs`,
`mls-keyboard`, `mls-starter-alert`, `badge-legend`, `svg-icons`, `focus-ring`, `chevrons`, `mls-locked-kickoff`: all
passed. The full suite hasn't run.

**Screenshots.** Round 3's branch against this one: only `desktop/mls-league-guide.png` and `phone/mls-league-guide.png`
(step 5's sentence), re-taken on CI with this commit. The Lineup ones are identical (offline: no early teams).
CI re-took exactly those two ("Screenshots re-taken on CI (2 PNGs)"): same sizes as round 3's, each different only in
step 5's last sentence (desktop y 3748–3784, phone y 10141–10223).

### S50, round 5: a third review as a user; the owner took 1 and 2 (2026-11-15)

Findings: (1) "Early games: 1 swap on Sleeper" sat right above "✓ Matches your active Sleeper lineup" (that line compares
who starts, not which slot): read top to bottom, a contradiction; (2) the Dashboard's league card showed EARLY but not the
swap, so with 20 leagues you'd open each Lineup tab on a Thursday to find which have one; (3) Got it can't be undone
that week (small; left as is, the owner didn't take it). Owner: "Yes" to 1 and 2.

**What changed.**
- `js/mls/render/lineup.js`: while a swap on Sleeper is showing, the green line reads "Same starters as your Sleeper
  lineup"; after the swap is made (next sync) or Got it, "Matches your active Sleeper lineup" again.
- `js/mls/render/leagueCards.js`, `js/mls/lineup/earlyGames.js` (`earlySwapCardLine`): a muted line under the card's
  status row, "Early games: swap Justin Jefferson (FLEX) with Ja'Marr Chase (WR) on Sleeper" (several: joined with
  "; "), so a folded card shows it too. Not counted (the card's "to fix", its amber, the strip: F12's rule), none in
  Best Ball, and Got it hides it here as on the Lineup tab. The swaps for a league now read its own lineup
  (`manualStartersMap[league.leagueId]`, was the active league's) for manual leagues. `css/mls.css`: `.mls-lc-early`,
  like `.mls-lc-synced`.

**Tests.** `mls-early-games.spec.mjs` (9 per width): with the Sleeper swap, "Same starters as your Sleeper lineup" and not
"Matches"; the Dashboard card's line, with "1 to fix" unchanged; after Got it, "Matches" again and no card line. Ran
check-precache, `node --test` (696), `mls-early-games`, `mls-league-cards`, `mls-lineup-needs`, `mls-phone-rows`,
`touch-targets`, `mls-keyboard`, `mls-last-synced`, `mls-best-available`, `mls-tab-redraws`, `mls-sync-league-switch`:
all passed. The full suite hasn't run.

**Screenshots.** Round 4's branch against this one in the same container: all 44 pixel-identical (no swap offline).

### S50, round 6: a last review as a user; the owner took all three (2026-11-16)

Checked the Guide and legend wording, the keyboard path through the card (the switch, each ✕, the picker; a removed
chip's focus moves to the next ✕), a league with two FLEX slots (two swaps, each with its own later WR) and the Dashboard
chip. Findings: (1) Got it dropped keyboard focus to the top of the page (the box redraws without the button); (2) Got it
said only "Got it" to a screen reader; (3) two swaps read "Swap:", the list, then "So your FLEX holds the later games."
Owner: "Yes. After that, you're good to open a PR, watch CI, and then merge when green."

**What changed** (`js/mls/lineup/earlyGames.js`): after Got it, focus goes to the box's title line (or, with nothing left
in the box, the Optimize button); Got it's accessible name is "Got it: hide this early-game swap for the week" ("these
… swaps" for several); several swaps lead with one line, "Swap these, so your FLEX slots hold the later games:", then
the list (a slot named twice is plural; one swap keeps its single sentence).

**Tests.** `mls-early-games.spec.mjs` (10 per width): Got it by keyboard leaves focus on the box's title, and its name;
a new test builds a two-FLEX league's swaps and checks the title, the lead line and list, the plural Got it name and the
Dashboard line. Ran check-precache, `node --test` (696), `mls-early-games`, `mls-lineup-needs`, `mls-keyboard`,
`focus-ring`: all passed. No screenshot changes (nothing here shows offline).

### S50: the full suite before the pull request (2026-11-16)

Owner: "After that, you're good to open a PR, watch CI, and then merge when green." **The full check** (`npm ci && npm run
check`, once): check-precache OK (178 precached), `node --test` 696 passed, Playwright 1112 passed, 72 skipped, 6 failed.
Four are `visual.spec.mjs`'s environment guard (this container's fonts), as on main; the screenshots were compared main
and branch in the same container each round (above). The other two were real: `backup.spec.mjs`, "MLS restores a backup
file saved before the 6B key rename" (both widths): after a restore and reload, the page had written `mls_early_week`,
which wasn't in the backup. `noteEarlyWeek` saved the week's stamp on any first visit; now it saves only with something to
keep (teams you added, the schedule's, or removed ones), and the schedule saves its own week when the kickoffs load. A
new spec checks a visit with nothing to keep writes no `mls_early_*` key. Re-ran `backup`, `mls-early-games` (11 per
width) and `key-migration`: all passed.


## S52 — Bye Crunch: weeks when byes leave a starting slot short

From the owner's notes of 2026-11-12 (sent 2026-11-14): "Bye week checker (need a better name): check rosters for when
bye weeks overlap to the point of impacting your starting lineup". Read first: S11 (to-dos), S12 (league cards), F12
(what needs you) and S34 round 4 (byes on Tuesday).

**Owner's decisions (asked before building, 2026-11-16).**
1. Name: **Bye Crunch**.
2. How far ahead: **the next 2 weeks** (not next week only, the rest of the season or the playoffs).
3. What counts as short: **a slot nobody available can fill** (not also one you'd fill with an unranked player).
4. Where: **a to-do on the league's Dashboard card and in the Lineup tab's box** (no week-by-week Roster view).
5. **Not counted** in "N lineups need you" (F12's rule): a heads-up, not a lineup to set.

**User-visible effect.**
- A league card and the Lineup tab's box list, for each of the next 2 NFL weeks, each slot type byes leave short:
  "Bye Crunch · Week 13: 1 RB short (3 of your 4 RBs on bye: Derrick Henry, Breece Hall and Ashton Jeanty)", with a
  user-minus icon in the BYE badge's orange and a **Find RB** button (Top Available on that position; W/R, W/T and FLEX
  find FLEX, SFLEX All, as the empty-slot item does). Players Out (or on IR, PUP, NFI, suspended) now are named after
  it, "· Joe Mixon is on IR, assumed still out"; an injured player still in your IR slot "is in your IR slot".
  Wording for a strict slot: "1 of your 2 RBs on bye", "all 2 of your QBs on bye", "your only K on bye"; for a flex
  slot: "1 FLEX short (on bye: …)".
- It's a note: a card with only Bye Crunch says "Notes" (no amber, no count), the Lineup box's title stays "Nothing
  needs you before kickoff", the strip and Optimize All / Sync All toasts don't count it, and starter alerts (N2)
  never name it.
- Not in Best Ball leagues (the Dashboard leaves them out of the to-dos).
- **Tuesday's waiver checks read next week's byes** (S34's leftover, removed from its Left over list): once the week's
  games are over (`isWeekOver`), the Dashboard's Best available, Auto-Find and Check a List treat a player on bye next
  week as unavailable, so he isn't an upgrade; Auto-Find's Bye verdict says "On bye next week - a stash, not a start."
  (and "can't start next week" for an injured one). Before Tuesday nothing changes. The BYE badge on rows still marks
  this week's byes, and the Lineup tab's optimizer is unchanged (out of scope).

**Which weeks.** Sleeper's week + 1 and + 2 (`crunchWeeks`). Sleeper's week stays on the finished week until
Wednesday, so on Tuesday "next week" is already the coming one, as the card asked; from Wednesday the current week's
byes are the Lineup box's own items ("X is on bye: no healthy RB on your bench [Find RB]"). Byes end at week 14, so
from week 13 on nothing shows (week 13: week 14's; week 14 on: none).

**What counts as short.** A maximum matching of starting slots to available players, filled in the optimizer's slot
order (strict slots, then W/R, W/T, FLEX, SFLEX, K, DEF), so the shortage lands on the strict slot when a spare player
can still take the FLEX, and a W/T isn't short because FLEX took the only WR. It never depends on your rankings (the
optimizer's choices are out of scope). Only what the byes add counts: a slot short every week anyway (no TE on the
roster) is the Lineup box's "TE slot is empty", not a Bye Crunch. Available: not taxi; in your Sleeper IR slot only
when healthy (you'd activate him); not Out, IR, PUP, NFI or suspended now (assumed still out). Doubtful and
Questionable count as available a week or more out. K and DEF count like any slot (a BAL kicker in week 13 is "1 K
short", with Find K), since a streamer has to be picked up all the same.

**What changed, and where.**
- `js/mls/lineup/byeCrunch.js` (new, pure): `shortSlots`, `byeCrunchWeek`, `byeCrunch`, `crunchWeeks`, `couldStart`,
  `crunchText`, `CRUNCH_ICON`. In `PRECACHE_ASSETS`.
- `js/mls/lineup/issues.js`: `lineupIssueItems` adds `issues.crunch` as `{ kind: 'crunch', note: true, find }` items,
  after IR moves. Notes never count (`needsYouCount`, `leagueNeeds`), so F12's rule is unchanged.
- `js/mls/lineup/gameInfo.js`: `getLineupIssues` adds `issues.crunch` from the new `getByeCrunch(league)` (Sleeper's week
  and season, the bye table, positions from the roster or the league's `globalPosMap`); the Lineup box draws the icon.
  `js/mls/render/dashboard.js`: the card's item draws the icon. `css/mls.css`: `.is-crunch`, `.mls-crunch-icon`.
- `js/mls/helpers.js`: `isUnavailableThisWeek(p, week = State.currentNflWeek)` and `lineupWeek(weekOver)`.
  `js/mls/scout/waivers.js`: `lineupCheckDeps` passes `lineupWeek(weekOver)`; `buildWaiverContext` returns `weekOver`
  and `byeWeek`, which `waiverVerdictParts` reads for the Bye pill and its line.
- Legend (`js/mls/legend.js`): a line after "This lineup needs you", drawn with the same markup. Guide
  (`lineup/index.html`, the Dashboard step): two sentences on Bye Crunch. CHANGELOG: two lines under Lineup Strategist.
- No storage key. `CACHE_NAME` v2.10.12 → v2.10.13.

**Tests.**
- `tests/unit/byeCrunch.test.mjs` (10): the matching (strict first; W/T not starved by FLEX); 2 RB slots with 3 of 4
  RBs on bye; FLEX covering the WR byes with a spare RB (and short without one); superflex (a QB on bye leaves SFLEX to
  an RB/WR/TE, short when none is left; both QBs on bye); an IR player (named, assumed still out), a healthy IR-slot
  player counted, a Questionable one in the IR slot not, taxi never; a slot short without byes not reported; the weeks;
  the items (notes, Find chips, never counted).
- `tests/mls-bye-crunch.spec.mjs` (5 × desktop and phone): week 12 shows week 13's RB, K and DEF on the card ("Notes",
  icons, Find RB to Top Available on RB) and in the Lineup box (title unchanged, Find DEF); beside the empty RB slot
  only the empty slot counts ("1 to fix", "1 lineup needs you · 1 to fix"); week 2, nothing anywhere (the empty state);
  Sunday of week 6, James Cook (BUF, bye week 7) is "1 upgrade" and Would Start; Tuesday after week 6 he's "No upgrade"
  and Auto-Find says Bye, "On bye next week". The Tuesday test fails on main (checked by restoring main's
  `waivers.js`: the flag kept "1 upgrade").

**Screenshots: two change, re-taken by CI** (`update-screenshots.yml`). Rendered here, main against this branch in the
same container (`RENDER_ENV=any`, `npm run pxdiff`): only `desktop/mls-league-guide.png` (1280×10950 → 1280×11090) and
`phone/mls-league-guide.png` (390×25902 → 390×26246) differ, taller by the Guide's two Bye Crunch sentences and the
legend's new line. The other 42 are pixel-identical: the screenshot fixture is week 2, with no byes in weeks 3–4, so
no card or Lineup box shows a Bye Crunch.

**Checks** (full `npm ci && npm run check`, once, before the last push): check-precache OK (178 precached),
`node --test` 698 passed, Playwright 1104 passed, 72 skipped, 4 failed: `visual.spec.mjs`'s environment check (this
container's fonts), as on main; the comparison above stands in for it.

**Left over.**
- **Best Ball**: no Bye Crunch there (no lineup to set, and the Dashboard leaves Best Ball out of its to-dos), though a
  short week costs points there too. A line on the Best Ball card would be its own small change.
- **The BYE badge on Top Available and Auto-Find rows** still marks this week's byes on Tuesday (only the verdicts and
  the upgrade counts read next week's). Small; could follow `lineupWeek` too.
- **K and DEF**: they count like any slot ("1 DEF short" for a team defense on bye). If that reads as noise for people
  who stream them, the owner could choose to leave them out.
- This season it shows only through week 13 (week 14's byes are the last); otherwise it's ready for 2027 once B1 adds
  2027's byes in May.

### S52: screenshots re-taken from CI (update-screenshots run 43821201036, commit e2fad61)
- `desktop/mls-league-guide.png`: the Dashboard step's two Bye Crunch sentences, and the legend's new line (the
  user-minus icon and "Bye Crunch · Week 13: 1 RB short (3 of your 4 RBs on bye: …)" in orange, its meaning beside it).
  Opened and checked.
- `phone/mls-league-guide.png`: the same two sentences (on phones the legend is a sheet, not in the screenshot).

### S52, round 2: one player per line (owner, 2026-11-16, after trying it on a league where it applies)
Owner: "Would it be better to have each player that Bye Crunch lists in bullet point form for easier readability? My
current example has 5 lines of text that run together." Yes: the item is now a headline and a bulleted list.
- Headline: "Bye Crunch · Week 13: 1 RB short (3 of your 4 RBs on bye)" (no names in it any more; a flex slot reads
  "1 FLEX short"). Under it, one bullet per player: "Derrick Henry (BAL) on bye", then "Joe Mixon is on IR, assumed
  still out" (a team defense without its team again: "Baltimore Ravens on bye"). The bullets are the muted text color,
  so the orange headline stays the thing to read; the Find button stays beside the headline.
- Where: `crunchText` (the headline) and the new `crunchDetails` (the lines) and `crunchListHTML` (the `<ul>`) in
  `byeCrunch.js`; the item carries `details`; `getLineupNeedsHTML` and `leagueTodoHTML` add the list (on the card the
  item is a `<div>` so it can hold one). `css/mls.css`: `.mls-crunch-list`. The legend's sample, the Guide's sentence and
  the CHANGELOG line follow. Unit tests and `mls-bye-crunch.spec.mjs` check the headline and the bullets apart.
- Screenshots: the same two Guide PNGs move again (the Guide's example and the legend's sample), re-taken by CI.
- Merged main (S50, Early Games) before the push: CHANGELOG and LOG kept both; the two Guide PNGs taken from main,
  then re-taken by CI on the merged branch (commit bd2838b): the Guide's Bye Crunch sentence and the legend's sample
  with its bullet. Opened and checked. `CACHE_NAME` v2.10.14 (main's is v2.10.13). After the merge: check-precache,
  `node --test` (706) and the Bye Crunch, Early Games, lineup-needs, league-card, legend, waiver and backup specs
  (132) pass.

### S52, round 3: no K or DEF, and a shorter FLEX note (owner, 2026-11-16)
Owner: "Leave K and DEF out of Bye Crunch. If you are able to shorten the FLEX note, that would be great."
- **K and DEF** are never checked (`NOT_CHECKED` in `byeCrunch.js`): people stream them, so a kicker or defense on bye is
  routine. The Guide and the legend say so.
- **A flex slot's bullets** (W/R, W/T, FLEX, SFLEX) are one per position, not one per player, and players an earlier
  item for the same week already named aren't listed again:
  "Bye Crunch · Week 13: 1 FLEX short" · "RBs: the 3 above" · "WRs on bye: Garrett Wilson and Zay Flowers" · "Out now,
  assumed still out: Sam LaPorta (Out)". Partly named above: "RBs on bye: Breece Hall and Ashton Jeanty, and the 1
  above"; one: "RB: Derrick Henry, above". A strict slot (RB, WR…) keeps one bullet per player (round 2), since its
  list is short by nature. `crunchDetails(c, above)`; `lineupIssueItems` passes the ids each week's earlier items named.
- Tests: unit (K and DEF left out; the FLEX after an RB note, on its own, and partly above); `mls-bye-crunch.spec.mjs`
  now expects only the RB note in week 13 (the fixture's BAL kicker and defense are on bye and not flagged).
- Screenshots: the two Guide PNGs again (the Guide's sentence and the legend's meaning), re-taken by CI.
- CI re-took the two Guide PNGs (commit 5fd4e22): the legend's meaning now ends "kickers and defenses aren't checked", and the Guide's sentence says the same. Opened and checked.

### S52, round 4: a review as a user; one heading per week, and folded on the Lineup tab (owner: "A + B to start")
My review (a heavy week on the fixture league: week 13 leaves an RB, a WR and FLEX short; phone and desktop, the card
and the Lineup tab): helpful and honest, but clunky when there's more than one note. (1) "Bye Crunch · Week 13:"
repeated on every note; (2) the Lineup tab's box said "Nothing needs you before kickoff" above a wall of orange about
next week, pushing this week's lineup ~350px down on a phone; (3) long lists, and the FLEX's "the 5 above" bookkeeping;
(4) no bottom line ("3 starters short"); (5) on the desktop card the Find buttons stacked away from their notes.
Options: A (one heading per week with the total, a row per slot), B (fold it on the Lineup tab), C (fold it on the
card too). The owner took **A + B**, C to revisit if needed.
- **A.** One item per week (`crunchGroup` / `crunchGroups` in `byeCrunch.js`, replacing `crunchText` and
  `crunchDetails`): "Bye Crunch · Week 13: 3 starters short", then a row per slot type, "RB: 1 short · Derrick Henry
  (BAL) on bye", "WR: 1 short · 5 of 6 on bye: Ja'Marr Chase, …", "FLEX: 1 short · also Brock Bowers (TE) on bye; George
  Kittle is Out, assumed still out" (a flex row names only who the rows above it didn't; first in the week it's
  "on bye: Derrick Henry (RB) and …"). The slot ("RB: 1 short") is bold in the main text color, the rest muted; no
  bullets. Each row has its own Find button at its end (`crunchRowsHTML(item, button)`), on the card too, so the card's
  right-hand column no longer collects Bye Crunch's buttons (`findChips` sees no `find` on the item).
- **B.** On the Lineup tab the item is a fold (`details.lineup-needs-crunch`, the "What changed?" fold's chevron),
  closed to its heading; it stays open across the box's redraws (a swap, a lock, Optimize). The Dashboard card shows it
  open.
- Legend sample, Guide sentence and CHANGELOG line follow. Tests: unit (the heading's total, rows for strict and flex
  slots, "also", the rows' HTML, one item per week); `mls-bye-crunch.spec.mjs` (heading and rows on the card, the Find
  button on its row, the Lineup tab's fold closed then open, kept open after Optimize).
- Screenshots: the two Guide PNGs (the Guide's sentence and the legend's sample), re-taken by CI.
- CI re-took the two Guide PNGs (commit b204bd1): the legend's sample is now the heading "Bye Crunch · Week 13: 2 starters short" with an RB row and a FLEX row, and its meaning says the Lineup tab folds it; the Guide's sentence says the same. Opened and checked.

### S52, round 5: folded on the card too, and bullets again (owner, 2026-11-16)
Owner: "I think we should do Option C as well." And, on round 4's one-line rows: "I am torn … it saves vertical space
… it's hard to scan/read … Perhaps now that we're doing folds we can go back to bullets? Do you have another idea?"
My view: with the item folded in both places, the space a run-on line saved no longer matters, so bullets, keeping
round 4's structure. (Another idea, not taken: names as inline chips; compact, but a new badge style that would read
like the rank and status chips.)
- **C:** the Dashboard card's Bye Crunch is a fold like the Lineup tab's, closed to "Bye Crunch · Week 13: 3 starters
  short"; open folds stay open across redraws (keyed by league and week, on both). One helper draws both,
  `crunchFoldHTML(item, { key, open, chevron, button })`.
- **Rows:** a slot heading, "RB: 1 short", with "· 5 of 6 on bye" when several are on bye (a flex slot whose players
  are all listed above: "· the players above"), its Find button, then a bullet per player: "Derrick Henry (BAL)" (the
  heading says they're on bye), "George Kittle (TE) · Out, assumed still out". A flex row bullets only players the rows
  above didn't, with their position: "Brock Bowers (TE, LV)". `crunchGroup` returns `{ head, note, players }` per row;
  `crunchRowsHTML` draws them.
- Legend sample (drawn with `crunchFoldHTML`, open), Guide sentence and CHANGELOG line follow. Tests: unit (the rows'
  bullets and notes, the fold's markup); spec (the card's fold closed, then open with Find on its row; still open after
  the Dashboard redraws; the Lineup tab's fold as before).
- Screenshots: the two Guide PNGs, re-taken by CI.
- The legend's sample draws the fold open with its heading as text (`CRUNCH_ICON` + `crunchRowsHTML`), not a `<summary>`: a legend row isn't a control, and `touch-targets.spec.mjs` caught the sample's 23px summary on phones. The real folds' summaries use the shared 48px TOUCH TARGETS area, as every `.mls-change-fold` does.
- CI re-took the two Guide PNGs (commit 1af871b): the legend's sample is the open fold with a slot heading and bullets; the Guide's sentence says it's folded until you tap it. Opened and checked.

### S52, round 6: chips, a red tint, italics: mocked up, not taken (owner, 2026-11-16)
- **Chips** (names as small pills, wrapping): mocked on the real card. About half the height on desktop, about the same
  on phones, and they'd read like the site's rank and status badges. Owner: keep bullets.
- **A red Out tint** (round 5's mock-up, two ways: only the status red, or the whole bullet): the owner found the red
  pulled the eye and made the bullets harder to scan. Not taken.
- **Italic and dimmer** (the app's "aside" look, as for kept starters): mocked. Owner: "I don't necessarily need *less*
  emphasis, I just didn't want it standing out so much with the red." Not taken; the bullets stay as round 5 left them.

### S52, round 7: a review as a user; Find for that week, and Got it (owner: "Let's do both")
My review (the everyday case, both weeks short, the heavy week, phone and desktop, where Find leads): quiet and
compact folded, easy to read open. Two findings: (1) Find opened Top Available as it is for *this* week, so its best
free agent at the position could be on bye in the very week you're filling; (2) no way to dismiss a note you've
decided to live with (Early Games has Got it). The owner took both, and corrected my plan for (1): "Starts" can't be
judged for a coming week, since rankings are built week to week, so it's hidden there rather than re-judged.
- **Find for that week.** Bye Crunch's Find buttons carry `data-week`; `findLeaguePlayers(leagueId, pos, week)` calls
  `setTopAvailableWeek`. Top Available (`js/mls/scout/topAvailable.js`) then leaves out free agents on bye that week
  (ranked list and Trending), hides the Starts flag, and puts a line on top: "For week 13 (Bye Crunch): 1 player on bye
  that week left out; Starts is about this week, so it's hidden. Show all" (`clearTopAvailableWeek`). The count is for
  the position on screen. An empty list says "Every RB still available … is on bye in week 13. Show all to see them."
  In memory only: the position chips keep it; Show all clears it, and so does coming back to the Scout tab any other
  way (the first showing after Find is marked `fresh`).
- **Got it.** In the open fold, after the rows: "Got it · Hides it for week 13" (`crunchDismissHTML`). It hides that
  league's note for that week on the card and the Lineup tab (`getByeCrunch` skips the week). New key
  `KEYS.mls.byeCrunchDismissed` (`mls_bye_crunch_dismissed`, `{ [leagueId]: [week] }`; weeks already reached are
  dropped when the next one is hidden), so it lasts across reloads and goes in Backup and Factory Reset with the other
  `mls_` keys; with storage blocked it still hides it for the visit. Focus moves to the card's toggle (or the Lineup
  box's title) once the button is gone. No way to bring a hidden week back short of that week passing (as Early
  Games' Got it); say if you want one.
- Guide sentence, legend meaning and CHANGELOG line updated. Tests: `mls-bye-crunch.spec.mjs` (Cook moved to NYJ:
  Find RB from week 13's note leaves him out, hides Starts, says so; the chips keep the week; Show all brings him back;
  the week doesn't stick to a later visit; Got it hides the note on both, sets the key, and holds after a reload).
- Screenshots: the two Guide PNGs, re-taken by CI.
- CI re-took the two Guide PNGs (commit 380d8e5): the legend's meaning and the Guide's sentence now mention Find for that week and Got it. Opened and checked.

### S52, round 8: on by default, with a switch in two places; Early Games' switch in Advanced Settings too (owner, 2026-11-16)
The owner asked whether it should be opt-in (a toast suggesting it, as FAAB Bids does), to keep features and visual
noise down. My view: unlike FAAB bids, which add numbers to rows every week, Bye Crunch shows nothing except when a
coming week can't be filled, folded to one line; an opt-in toast would fire exactly then and ask for a trip to a setting,
so more interruption, and a dismissed toast loses the one warning that matters. I suggested on by default with an off
switch. Owner: "On, perhaps the setting lives in both places? Frankly, I'm thinking the Early Games switch should live in
Advanced Settings as well as the Lineup tab ... rather than having to 'hunt it down'."
- **Bye Crunch's switch**, on unless turned off: in the Lineup tab's Lineup settings ("Bye Crunch: Warn when byes in the
  next 2 weeks leave a starting spot you can't fill.") and in a new **Lineup** fold in the Dashboard's Advanced Settings
  (first after Show Player Headshots). New key `KEYS.mls.byeCrunch` (`mls_bye_crunch`, '0' while off; unset = on), read
  into `State.byeCrunchOn`; `setByeCrunchOn` in `gameInfo.js` and `getByeCrunch` returns nothing while it's off. Flipping
  either copy updates the other and redraws the Lineup tab and the cards.
- **Early Games' "Fill in from the schedule"** (S50's, done here at the owner's request): the same switch in the Lineup
  fold, "Early Games: fill in from the schedule". Both copies share `data-action="setEarlyFromSchedule"`;
  `syncEarlyFromScheduleToggles` (earlyGames.js) keeps them together.
- Start-up sets every copy from storage (`init.js` calls both syncs; a top-of-module call ran inside a circular import
  before `State` existed, caught by the spec).
- Guide: the Dashboard step says where to turn Bye Crunch off; the Lineup step says the Early Games switch is in
  Advanced Settings too. CHANGELOG: two lines.
- Tests: `mls-bye-crunch.spec.mjs` (off in Advanced Settings: no note on the card or the Lineup tab, the key is '0', it
  holds after a reload, Lineup settings shows it off; on again from Lineup settings: both notes back, the Advanced copy
  checked, the key gone; Early Games' two copies follow each other, and the card's description says it's off).
- Screenshots: main against this branch in this container, six differ: `{desktop,phone}/mls-empty-setup.png` and
  `{desktop,phone}/mls-league-setup.png` (50px taller: the Lineup fold in Advanced Settings), and
  `{desktop,phone}/mls-league-guide.png` (rounds 7–8's Guide sentences). The Lineup tab's are unchanged (Lineup settings
  starts folded). Re-taken by CI.
- CI re-took the six PNGs (commit 865a806): the Dashboard's Advanced Settings shows the new Lineup fold under Show Player Headshots (closed, like Notifications and FAAB Bids below it); the Guide's sentences as above. Opened and checked.

### S52: the full suite before the pull request (2026-11-16)
Owner: "Run the full suite and open the PR, watch CI, then merge when green." Branch current with main (S50 merged in
round 2; nothing newer), `CACHE_NAME` v2.10.14 (main v2.10.13). `npm ci && npm run check`: check-precache OK (179
precached), `node --test` 708 passed, Playwright 1134 passed, 72 skipped, 4 failed: `visual.spec.mjs`'s environment
check (this container's fonts), as on main; the screenshots were compared main against this branch here and re-taken by
CI in each round.

### Left over
- Best Ball leagues get no Bye Crunch (no lineup to set; the Dashboard leaves them out of its to-dos), though a short
  week costs points there too.
- The BYE badge on Top Available and Auto-Find rows marks this week's byes on Tuesday (the verdicts and upgrade counts
  read next week's, round 1). Small; could follow `lineupWeek`.
- Got it has no undo before that week passes (as Early Games' Got it).
- This season it shows only through week 13 (week 14's byes are the last); ready for 2027 once B1 adds its byes.
## M18 — Material 3 Expressive: a review against the sources, corrections to earlier values, and what's built

**For every later M card, S18 and the light-theme card: read `docs/improvements/material3-review-3.md` first. Where it
and your card's text disagree on a Material value, the review wins** (it was checked against material-web's labs and
token files and Compose's tokens; the cards' values came from an earlier session that couldn't read m3.material.io).

**Asked** (owner, 2026-11-16): review the site against Material 3 Expressive from git sources (material-web `labs/gb`,
androidx Compose's tokens and adaptive layouts, the skydashnet M3 skill), check M3, S18, M17 and other cards' Material
values, group the findings, then: "Build and/or fold-in all numbers, please. This includes fixes to past choices I've
made."

**What the review found** (details, sources and numbers in the review): M3's six motion curves are cubic-bezier
approximations of Compose's Expressive springs (right peak and length, up to 10% off in shape); labs already writes the
fast one as `linear()`. M2's focus ring was 2px where Material's is 3px. M3's toast entrance (an overshoot) isn't labs'
snackbar (a 150 ms grow, a 75 ms fade). S16's fades (500 ms) and the marker (500 ms) are slower than Material's. Rules
at `max-width: 600px` and `min-width: 600px` both applied at exactly 600px. About 20 text styles under 4.5:1, text down
to 9.28px, Guide lines to 143 characters, 26 corner radii, ~570 colour literals outside `:root`. Self-audit 7/16.

**Built here** (the owner's past choices changed are marked):
- Motion tokens in `css/base.css` (`:root`, MOTION): the six Expressive springs as `linear()` easings with their
  lengths, Material's emphasized curves and durations, the snackbar's and the state layers' timings; a cubic-bezier
  fallback under `@supports not (transition-timing-function: linear(0, 1))`. Every transition and animation in the four
  stylesheets moved onto them by one rule: colour, background, border and shadow → effects fast; opacity → effects
  default (slow above 200 ms); transform and size → spatial fast (small things, 200 ms or less before) or default.
  Drawers, the sheet and the expanded rail keep emphasized decelerate 400 ms / accelerate 200 ms (an overshoot would
  open a gap at the screen's edge). The switch handle, chevrons, the league name's roll and the press morph: fast spatial.
- **Changed past choices:** view transitions: phone slides and the Dashboard's cards on the default spatial spring
  (500 ms, was 275 / 375 ms); tab and league fades on effects slow, 300 ms at every width (was 275 ms on phones and the
  owner's 500 ms wider, S16 round 6); the tab bar's marker 200 ms emphasized (was 500 ms wider, S26). Chevrons 350 ms
  fast spatial (were the Dashboard's 275 / 375 ms). The focus ring 3px (owner's 2px, M2); text fields stay 2px (Material's
  focused field). State layers: hover 15 ms, press 100 ms (were 150 ms). The sync spinner fades instead of turning under
  Reduce Motion.
- Toasts as Material's snackbar (M3's asks 1–5, with the owner's "build all" taken as yes to the card's suggestions,
  corrected where labs differs): centred over the page and clear of the rail (`--rail-inset`), 24px from the bottom on
  computers, above the tab bar below 840px; z-index 1900 (under dialogs and sheets, 2000); one that arrives while an
  `aria-modal="true"` element is on screen waits, checking every 250 ms, and the latest wins; success 4s + 1s per 40
  characters up to 8s, with an action 8s, an error until ✕; it grows from its bottom edge (`scale`, 150 ms legacy
  decelerate) and fades out at full size (75 ms legacy accelerate); with Reduce Motion it only fades. The site's navy
  card and green / red edge stay (identity). Its width is up to 672px (labs).
- Breakpoints: `max-width: 600px` → 599.98px (24 queries); 767 / 768 → 839.98 / 840 (16 + 12), so 768–839px windows
  get the tablet layout that goes with the bottom bar. 480 / 520 / 900 / 1024 stay as content tweaks inside a size class.
  Checked: no sideways scroll on any tab of the three pages at 600, 700, 768, 800, 839 and 840px.
- Reading width: `--reading-width: 70ch` on the Guides' paragraphs and lists, the setup steps' explanations, T-Score's
  Research, notes and About.
- `tests/unit/motionTokens.test.mjs`: the tokens re-derived from the springs (and the fast one equal to labs'); no
  literal curve or time in any transition or animation (allowlist: 0s, the 1 ms view-transition cut, `linear`, the four
  endless pulses and the spinner); media queries only on the allowed widths. Checked that it fails on a planted
  `transition: color 0.2s ease` and `@media (max-width: 767px)`. `tests/snackbar.spec.mjs` (4 per width): placement,
  waiting for a dialog and the z-index, the timings, the entrance and Reduce Motion. `focus-ring.spec.mjs` now wants 3px
  (2px for fields); `chevrons.spec.mjs` the fast spatial spring; `tap-feedback.spec.mjs`'s comment.

**Folded into cards, with their values in the review:** M3 (now only progress and loading: 4px bar with a 4px gap and a
4px stop dot; a 38px loading shape in 48px), M4 (2px between grouped buttons, inner corners 8 → 4px), M6 (the measured
contrast list), M7 / M8 (the small-text counts), M9 (one filled primary per group), M10 (hero moments, emphasized type),
M12 / M13 (two panes from 1200px, a 360px side pane, a 24px gap), M14 (Material's corner scale, buttons 12 → 8px or
8 → 4px, every colour on tokens, fewer shadows). **New card: a light theme** after M14 (the owner chose to build it): a
light set of the tokens, Light / Dark / System in Settings, contrast in both, screenshots in both. S18 uses the motion
tokens (page-to-page fades on effects slow, 300 ms). The runbook's cards still show their old values until it's updated;
the review overrides them.

**Screenshots** (main and this branch rendered in the same container, `npm run pxdiff`): the desktop PNGs whose prose now
wraps at 70 characters change (`desktop/mds-empty-guide.png`, `desktop/mds-empty-setup.png`,
`desktop/mls-empty-setup.png`, `desktop/mls-league-guide.png`, `desktop/mls-league-roster.png`,
`desktop/mls-league-setup.png`, `desktop/tscore-researchTab.png`); every phone PNG and every other desktop PNG is
identical. S52 (open) re-takes the two Guide and setup screenshots too: whichever merges second re-takes them.

**Tests run:** check-precache; `node --test` (699); chevrons, focus-ring, tap-feedback, nav-rail, view-transitions,
touch-targets, support, analytics, tscore-refresh, mls-phone-rows, mls-trade-sides-align, sheet, room-on-phones, smoke,
mls-replace-set-dialog, mls-busy-spinner, tooltips-onscreen, tooltip-closed-space, mls-keyboard and the new snackbar
spec: all passed.

### M18: screenshots re-taken on CI (2026-11-16)

The "Update screenshots" run for ee046f9 succeeded and committed exactly the seven predicted desktop PNGs (933564a):
`mds-empty-guide`, `mds-empty-setup`, `mls-empty-setup`, `mls-league-guide`, `mls-league-roster`, `mls-league-setup`,
`tscore-researchTab`. Each differs only where prose now wraps at 70 characters (the Guides are taller); no other
screenshot changed.

## F25 — Slow Sync All and Dashboard on phones (owner's report, 2026-11-16)

**Asked:** "The last few days using my app on mobile, I've hit performance issues. Especially while syncing all leagues,
or switching to the Dashboard tab from another tab. Those two are fairly consistent." With the owner's backup (20
leagues, 19 on Sleeper). The owner suspected a merge from the last few days.

**How it was measured:** a new opt-in tool, `tests/tools/backup-perf.tool.mjs` (TESTING.md, the opt-in tools): the
backup written into localStorage, a 390px phone, the CPU slowed 4x, every request to Sleeper and ESPN recorded once and
replayed, so each commit is measured on the same data; switches into the Dashboard from four tabs, before and after a
Sync All, and Sync All itself; long tasks, requests and Chrome's own style / layout / script time; `PERF_REF` serves any
commit, `PERF_PROFILE` the busiest functions, `PERF_NOW` the page's clock. One trap: ESPN refuses a headless browser's
scoreboard request from a cloud container (403 "Access Denied"; curl with a browser user agent gets it), and **without
kickoff times the regression doesn't show at all**: the first rounds measured nothing wrong. With the real scoreboard
patched into the recording it reproduced every time.

**Bisect** (each merge to main since 2026-11-11, phone, 4x CPU, the owner's backup, kickoffs loaded): the Dashboard switch
took 0.15 to 0.2 s up to #250 and **3.3 to 3.6 s from #251 (S34, waiver claim or free agent) on**; Sync All went from
8.7 s to **82 s**. The profile: `zonedParts` in `js/mls/scout/waiverStatus.js`, 3.1 s of the 3.2 s switch. It built a new
`Intl.DateTimeFormat` on every call (about a millisecond each on a phone), and the waiver chips call it for every
player in every league, several times per draw (4,620 formatters for 600 players in the unit test below). Sync All was
82 s because each league's sync redrew the Dashboard's Best Available, among everything else (below).

**Fixed:**
- `zonedParts`: one formatter per time zone, its answers remembered (up to 5,000); `isWeekOver` works out the week's
  last kickoff once per kickoff table (`State.gameTimesByTeam` is always replaced whole, never edited).
- Sync All no longer draws per league. Each league's sync (`processSleeperData` with `skipSave`, the bulk flag) ran
  `optimizeLineup(true)` and `loadRosterTab()`, so with the Dashboard showing, one Sync All redrew the Lineup tab 20
  times, the Roster tab 21, Power Rankings 22, the Scoreboard and the league cards 23, analysed Best Available 361 times,
  and saved every league's lineups 19 times. Now each league's lineup is computed in batch mode (`optimizeLineup`'s
  existing `{ batch: true }`, as Optimize All does), Sync All and Import All save the lineup maps once after the loop,
  and Sync All's existing end (the league restored, the cards, Roster and Lineup redrawn) draws once.
- `formatUploadTime` (the rank-move chips) and `getFreshness` (the "Synced 2 days ago" labels): formatters built once
  (the same text); together about 1.4 s of each old Sync All.
- S32's three page-wide `:has()` selectors (`body:has(#lineupTab.active)…`, `#mainApp:has(#lineupTab:not(.active))`)
  replaced by `body[data-tab]` (set by `applyTab` in `js/mls/nav.js`) and `body.mls-swap-pending` (the swap snackbar):
  they made Chrome re-check the whole page after every change (style time in Sync All 625 → 986 ms at #253). M17's
  `:has(> .settings-card)` costs about 100 ms per Sync All too; left, since it's smaller now that Sync All draws once.

**After** (same data, phone, 4x CPU, medians): the Dashboard switch 0.17 to 0.24 s (main: 3.2 to 3.5 s); Sync All 2.6 s
(main: 82 s), long tasks 1.2 s (main: 72 s), style 41 ms (main: 1,062).

**The starter alert (N2) and the "switching to the Dashboard" part.** With the alert on (the owner's backup has it on,
60 minutes), opening the page in the hour before a kickoff runs a quiet Sync All about a minute after load (the check
waits for the week's kickoffs); before F25 that was the 82 s sync, running under whatever the owner tapped. It's the same
2.6 s now. Its downloads are an open follow-up (TESTING.md, "Needs the owner's decision first"), as are Sync All's 14.7
MB player file and its repeated ESPN and Sleeper-user requests.

**Tests:** `tests/unit/dateFormatters.test.mjs` (600 players' waiver status build at most one formatter; it fails on the
old code with 4,620; freshness labels a formatter per format). `tests/mls-sync-all-batch.spec.mjs`: after Sync All both
fixture leagues' lineups are saved, you're on the same league, and the Lineup tab was drawn once (3 with the old
per-league draws: checked by putting them back). Ran check-precache, `node --test` (701), and mls-waiver-status,
mls-best-available, mls-top-available, mls-waiver-insights, mls-faab-bid, mls-rankings-change, mls-freshness,
mds-freshness, mls-last-synced, mls-phone-rows, mls-keyboard, mls-lineup-row-actions, smoke, mls-sync-all-batch,
mls-leagues, mls-sync-league-switch, mls-starter-alert, backup, mls-early-games, tscore-refresh: all passed. Screenshots:
the previous commit and this one rendered in the same container, all 44 pixel-identical.

## F26 — Less data and less waiting in Sync All (owner, 2026-11-16)

**Asked:** after F25, trim what Sync All downloads without making injury news late ("users tend to check lineups once
they get a notification that a player is 'Out'… about 90 minutes before kickoff"), and is there a lighter source than
ESPN. The owner picked: Sleeper's player file only when it changed, unpacked in the background and slimmed; ESPN and the
Sleeper user once per sync; leagues fetched side by side.

**What was measured first** (2026-11-16, curl from this container):

| Source | Over the network | Unpacked | Notes |
| --- | --- | --- | --- |
| Sleeper `players/nfl` | 2.6 MB gzip | 14.7 MB | `Cache-Control: s-maxage=600`; an ETag; a 304 with 0 bytes to `If-None-Match` |
| ESPN scoreboard | 20 KB | 0.24 MB | kickoffs and live state |
| Sleeper `schedule/nfl/regular/<season>` | 3 KB | 27 KB | dates and status only: **no kickoff times**, so it can't replace ESPN |
| ESPN `injuries` | 354 KB | 8.7 MB | ESPN's designations, not Sleeper's, and a big parse |
| Sleeper live week stats | 71 KB | 0.48 MB | `s-maxage=30` |

Sampled once a minute for 15 minutes on Monday evening: Sleeper's CDN hands out one copy for 10 minutes (its `age`
climbs to about 600 s, then resets), and each new copy had a new ETag. Sleeper's CORS rules expose `etag` but don't
allow `If-None-Match` from a page; the browser's own cache can still revalidate (`cache: 'no-cache'`), which a page's
fetch doesn't count as its header.

**Correction to F25's write-up:** the "ESPN scoreboard 21 times per sync" was this container's doing (ESPN refused the
headless browser, so no kickoff times were ever kept and every caller asked again). With the real scoreboard,
`refreshGameTimes` already asks once; nothing to change there. The Sleeper user (19 times) and last week's
transactions (19 extra) were real.

**Built:**
- `js/shared/api/playerMapSlim.js`: the 12 player fields the apps read (plus five small injury details), and
  `slimPlayerMap`. `tests/unit/playerMapSlim.test.mjs` fails when any js/ file reads a distinctive Sleeper field the list
  leaves out (checked by planting `p.espn_id`).
- `js/shared/api/playerMapWorker.js` (module worker, `new Worker(new URL(…, import.meta.url))`): downloads with
  `cache: 'no-cache'`, compares Sleeper's ETag with the saved copy's (unchanged: cancels the body, unpacks nothing),
  else parses and slims off the main thread. `getSleeperPlayerMap` (sleeper.js) runs it, or the same steps on the page if
  a worker can't start. IndexedDB keeps `{ data (slim), fetchedAt, etag, fields: 1 }`; a copy without `fields: 1` (the
  old full one) is downloaded again. `forceRefresh` takes `keepFor`: Sync All you tap passes 0 (always checks: the
  owner's "Out" case), the starter alert's quiet Sync All keeps a copy under 10 minutes (the CDN's own lifetime). An
  unchanged copy isn't written to IndexedDB again. `scripts/check-precache.mjs` now follows `new Worker(new URL(…,
  import.meta.url))`; both files are in `PRECACHE_ASSETS`.
- `fetchAhead` / `endFetchAhead` in sleeper.js: Sync All starts every league's league, users, rosters and (except
  redraft leagues) traded-picks requests up front, 6 at a time; the per-league sync, still one league at a time (it
  reads and writes the app's state), takes each answer once. The user is looked up once per username.
- `recentDrops.js`: a week before the current one is read once a visit (only the current week again after a sync).
- **A fix to M18 found here:** a toast that waited for a dialog could come out after a newer toast and cover it
  (`mls-past-trade.spec.mjs` failed: the rankings upload's toast, queued while its preview closed, covered the trade
  sync's summary). Showing a toast now drops any older one still waiting; `snackbar.spec.mjs` has the race (it fails
  without the fix). It passed on main, so M18's own runs missed it: the full suite before the pull request should run.

**After** (the owner's backup, phone, 4x CPU, `PERF_RTT_MS=150 PERF_KBPS=1250`, the player file replayed without an ETag,
so every tapped sync downloads it: the worst case): Sync All 18.5 s with F25 only, **3.6 s** now; 130 requests → 93 (user
19 → 1, transactions 38 → 19); main thread busy 0.8 s. Data per Sync All, from the recorded answers' gzip sizes: 2.31 MB
before; **0.11 MB** when the player file hasn't changed (or the quiet check keeps it); 2.29 MB when it has.

**Tests:** `unit/sleeperPlayerMap.test.mjs` (updated for the 10-minute keep, a clock moved on; new: a tapped sync asks
at once, an unchanged ETag isn't unpacked, a new one replaces it slimmed), `unit/playerMapSlim.test.mjs`,
`mls-sync-all-batch.spec.mjs` (the user once, each league's requests once), `snackbar.spec.mjs` (the race). Ran
check-precache, `node --test` (705), and smoke, mls-leagues, mls-sync-all-batch, mls-sync-league-switch, mls-lineup-needs,
mls-starter-alert, mls-waiver-status, mls-best-available, mls-top-available, mls-faab-bid, mls-headshots, mds-headshots,
mds-sync, mds-upload-preview, mls-sim, mls-this-week, mls-mvp-lvp, mls-final-window, mls-auto-sub, backup, key-migration,
mls-trending, mls-trade-picks-market, mls-past-trade, mls-player-lookup, mls-early-games, mls-byes, snackbar: all passed
after the toast fix. Screenshots: the previous commit and this one rendered in the same container, all 44 identical.

## F27 — A review as a user of M18, F25 and F26, and three fixes (owner, 2026-11-17)

**Asked:** "Put on your 'user hat'. How do these adjustments feel? Are they visually pleasing? Does they feel clunky? Are
they helpful?" Then "Yes" to fixing the three things found.

**How:** main and this branch served side by side (a worktree of origin/main on port 4174, the branch on 4175), the
owner's backup and the recorded Sleeper / ESPN answers, Playwright at 390, 800 and 1280px; animations slowed 20x through
CDP `Animation.setPlaybackRate` for frames; a probe of `document.elementFromPoint` during a transition. The scripts are
throwaway (scratchpad), not in the repo.

**Found good:** the speed (the Dashboard and Sync All, F25 / F26) is the headline; toasts centred and calmer (labs'
grow-in), long enough to read; desktop tab and league fades snappier (300 ms against main's 500); the 3px focus ring;
the phone slide's spring indistinguishable from main's curve (90% of the way in 153 ms against 149).

**Found off, and fixed:**
1. **600 to 839px windows got the phone header stretched across them** (M18 moved the 767 / 768 rules to 840): the app's
   name hidden, a league picker about 700px wide, page margins of 8px. Main did the same from 600 to 767. Now the
   header (css/base.css's header block and HEADER PICKER) and the page and card padding switch at 600 (Material 3's
   compact window); from 600 to 839 the picker is at most 22rem and narrows to fit, and the buttons beside it keep their
   width (at 600px the drop-down's own width made the page scroll sideways 29px; Draft Strategist's Sync lost its width
   and its word spilled out). The bigger league arrows stay up to 840 (touch screens). Content rules (rows, the Draft
   Board, trade tiles) still switch at 840. Checked: no sideways scroll on any tab at 600, 700 and 800px with the
   owner's data, and the headers at each width.
2. **The Dashboard cards' fold and reorder transition ran 500 ms** (M18's default spatial spring at its own length), and
   the browser sends taps to the page behind a running view transition (probed: `elementFromPoint` is `<html>` at 100 to
   400 ms in). `--vt-ms` is now 300 ms (Material's medium2) with the same spring shape. **A correction to the review:** I
   first said tab switches ran 500 ms on phones; they didn't: tab and league kinds already use `--vt-fade-ms` (300 ms)
   at every width, phone slides included. The spec below caught it.
3. **The Guide's paragraphs stopped at 70ch inside a full-width card**, leaving about 40% of it empty and the "About this
   project" box wider than the text. The Guide card itself (`#guideTab > .settings-card`, both apps) is now a centred
   column `calc(var(--reading-width) + 3rem)` wide; its paragraphs are no longer capped separately.

**Tests:** `tests/medium-windows.spec.mjs`: at 600, 700 and 839px the app's name shows, the page doesn't scroll
sideways, the container has 24px side padding and Draft Strategist's Sync fits its word; 599px keeps the compact
header; on a phone a tab switch's and a league card fold's view-transition animations last 300 ms at most (500 on the
old CSS: checked); the Guide card is under 800px wide and centred in both apps. 4 of its 6 fail on the previous CSS.
Ran check-precache, `node --test` (705), nav-rail, view-transitions, room-on-phones, touch-targets, focus-ring,
chevrons, smoke, mds-setup, mls-keyboard, snackbar, tap-feedback, mls-phone-rows, sheet, badge-legend, medium-windows:
all passed. **Screenshots:** main and the branch rendered in the same container: `desktop/mls-league-guide.png` and
`desktop/mds-empty-guide.png` change (the narrower column makes them taller); the other 42 are identical.

### F27: screenshots re-taken on CI (2026-11-17)

The "Update screenshots" run for 723f1a1 succeeded and committed exactly the two predicted PNGs:
`desktop/mls-league-guide.png` and `desktop/mds-empty-guide.png` (the Guide as a centred column, so taller). No other
screenshot changed.

### M18 / F25–F27: merged with main (S52) and the full suite before the pull request (2026-11-17)

Owner: "Proceed with opening PR, watching CI, and merging when green." **Merge:** main (S52, #257) into the branch;
CHANGELOG and LOG kept both sides; the three desktop PNGs both changed (`mls-empty-setup`, `mls-league-guide`,
`mls-league-setup`) taken from main, then re-taken by CI's update-screenshots run with this branch's reading width and
Guide column (predicted first: main and the branch rendered in the same container; the same 7 desktop PNGs as in M18
differ from main, the other 4 already this branch's). `CACHE_NAME` v2.10.15, above main's v2.10.14. S52's new CSS passes
`motionTokens.test.mjs`. **The full check** (`npm ci && npm run check`, once): check-precache OK (181 precached),
`node --test` 717 passed, Playwright 1152 passed, 78 skipped, 4 failed: all four `visual.spec.mjs`'s environment guard
(this container's fonts), as on main.

## W3 — Leaner sessions: split LOG.md, quieter tests, a setup script

**Changed.** `LOG.md` was 1,194,673 bytes (76 entries). Now: standing rules (lines 7-18), an index of every entry
(`ID | file | heading`, 76 lines), then the last 7 entries; 83 KB. The older 69 entries moved unchanged to
`log/2026-10.md` (633 KB) and `log/2026-11.md` (486 KB); each is a verbatim substring of the old file, and the three
files total 7.3 KB more than before (index, headers). `CLAUDE.md` and `TESTING.md` say: read the standing rules,
grep the index, never the whole file. `TESTING.md` starts with "Start here" (what a bug fix, visual, research and
docs-only card read). Rule 10 (short entries) is in LOG's standing rules and CLAUDE.md's "Rules that bite".

**Quieter tests.** `tests/playwright.config.mjs`: dot reporter outside CI (CI keeps list + html). The card said the
line reporter, but piped (as in sessions) it prints a line per test (1.3 KB for 8 tests); dot prints one character
per test (69 bytes). `node --test` piped printed 165,872 bytes of TAP; `--test-reporter=dot` prints ~900. The flag is
now in `npm run unit`/`check`, CLAUDE.md's command and TESTING.md's "Every push before that" bullet, which also
describes a passing run. Failures still print in full.

**Setup script.** New personal environment `my-draft-strategist` (id env_017mMv2yE6oGUvvbZp3xdhap), repo
btrerise/my-draft-strategist, setup script: `npm ci` in `My-Draft-Strategist/tests` (tested: 5 s; unit tests then
pass, whereas without it `tscoreInSeason.test.mjs` fails on `papaparse`). Its network list is the Default's 37 hosts
cut to the 20 the tool allows (no wildcards: `*.blob.core.windows.net`, `*.pages.dev` and ~17 research/analytics
hosts dropped); add more in Settings if a card needs them. Owner picks this environment when starting a session.

**Measured** (LOG + TESTING.md, before the prompt, which is unchanged): before 1,245,058 bytes (1,194,673 + 50,385),
unreadable whole, so sessions skimmed pieces. After 135,048 bytes (83,199 + 51,849) if read whole; the intended
start-up is the rules (1.4 KB) + one index grep (<7 KB) + the "Start here" sections, roughly 15-25 KB.

**Decisions / left over.**
- Kept 7 entries, not 10: the last 10 are 159 KB, over the 100 KB target. Month split is by position in the file
  (through F10 = October, S28 on = November); history is shallow so exact dates aren't recoverable.
- No `sw.js` change: only docs, CLAUDE.md, package.json and the Playwright config changed.
- Not run: Playwright full suite (docs-only card; checked unit tests, one spec, and `check-precache`).

## W5 — The runbook's cards get the lean start-up and the new rules

Page-only card: the runbook, the Runbook Archive and the "Nov 21 cards" page changed; nothing in the repo but this entry.

**User-visible effect.** None in the apps. For the owner, every "Copy session prompt" now:
- starts lean: the prompt is the whole card; CLAUDE.md loads by itself; TESTING.md is read from its "Start here";
  LOG.md is read as its standing rules (first 20 lines) plus a grep of its index, never whole, `log/` never whole;
- has rule 7 matching CLAUDE.md (full suite once, when the owner asks for the pull request), a new rule 10 (short LOG
  entries) and a rule 8 that also asks for the entry's index line;
- sits under a "Recommended model" line on each card: Sonnet, or Opus for design judgment, statistics or a diagnosis
  with no known cause (F22, S20, S37, T2, M3, M10 added today; the Nov 21 cards had theirs).

**What changed.** Runbook: `RULES`, `promptFor`, the header note (the old one moved to the archive), the "Running a
session" step 2 text, the model line, W5 itself to the archive (141 KB, under W4's 150 KB). Nov 21 page: same rules and
start-up, intro note. Old rules 10 (icons) and 11 (motion tokens, window sizes) folded into rule 1, with the Material
review pointer; old rule 8's "create the file" dropped (it exists). S51's "(rule 10: SVG icons)" no longer named a rule.
W3's names were used as they are: the index in `LOG.md`, older entries in `docs/improvements/log/`.

**Left over.** The Runbook: Later Cards page (https://claude.ai/artifact/GQLqjcewaE4HrGQmDKeLJE) has its own prompts
and rules, still the old ones; it's separate from the runbook, so not changed. Add W3's missing index line (done here).
