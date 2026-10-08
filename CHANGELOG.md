# Changelog

What changed for users in each version of the two apps, in plain language. Newest first.

- **When to add an entry:** whenever a change is something a user can see or notice, add a line under the app's
  **Unreleased** section. When the app's footer version (`.app-version` in `index.html` or `lineup/index.html`) is
  bumped, the Unreleased lines become that version's entry, dated the day the bump lands.
- **Versions:** the middle number goes up for new features (v2.6 → v2.7), the last for fixes only (v2.13.0 → v2.13.1).
  Each app has its own version. The service worker's `CACHE_NAME` in `sw.js` is not an app version (see its header).
- **Not here:** how the code changed. That's in `docs/refactor/LOG.md` (the refactor's session log) and the commit
  history.
- This record starts on 2026-09-27. Earlier versions aren't covered.

## Draft Strategist

### Unreleased

- **Export Team shows the flex slot labels again.** In the exported image, filled FLX, SFLX, W/T and W/R labels
  came out as solid color bars with no letters. They're now readable, in the same blended colors as on the Team tab.
- **Flex slot labels on the Team tab run through all their colors.** The blend used to stretch over the label's
  whole width, so the letters only showed its first half: FLX never reached the TE yellow, and W/T faded to gray. Now
  the first letter has the first position's color and the last letter the last's (FLX: RB green to TE yellow).
- **Player initials when a photo doesn't load,** as in Lineup Strategist. On the Draft Board and the Team tab, a
  player whose Sleeper photo is missing (no photo, offline, a custom player from your file) now shows a circle with
  their initials, or the team code for a defense, instead of nothing. Photos that do load cover the circle, and
  names on the Team tab stay lined up either way. Show Player Headshots off still hides the board's circles.
- **W/T and W/R slots from Sleeper leagues are counted.** Syncing a draft whose Sleeper league has a WR/TE or WR/RB
  flex slot used to leave that slot out of your roster limits. They now show on the Team tab as W/T and W/R, count in
  the roster-limits FLX column under My Team (which only counted plain FLEX before), and carry over to Lineup Strategist with Send to
  Lineup Strategist.
- **Flex slot labels on the Team tab show the positions they take:** a filled FLX label runs green-blue-yellow
  (RB/WR/TE), SFLX red-green-blue-yellow, and W/T blue-yellow, instead of borrowing one position's color.
- **The Team tab's roster-limits row lines up before rankings are loaded.** It was missing its K and DEF cells, so
  the total showed under K.
- **The bye-week warning on the Team tab uses a warning icon** instead of the ⚠️ emoji, so it looks the same on
  every device and matches the rest of the site.
- **Rankings and ADP say how old they are.** The status line in Load Rankings reads "Loaded: 220 players • Updated
  3 days ago" instead of a fixed date, and turns amber with "consider refreshing" after 14 days. The ADP line reads
  "FFC: Redraft - 1QB (PPR) • Fetched today" and turns amber with "fetch again before you draft" after 3 days.
  Rankings and ADP loaded before this update keep their dated line until they're next loaded.
- **Loading rankings or fetching ADP shows a spinner line** ("Processing players and building database…",
  "Fetching market value…") while it works, then a green "Rankings loaded successfully!" or "Market value updated!"
  for a few seconds.
- **Rankings uploads ask before they replace anything.** Picking or dropping a file, or pasting rankings, opens a
  preview first: how many players were read, the top five, rows lost to a broken quote, names that didn't match a
  Sleeper player, a note when the file has no positions, and what saving will do to the rankings you already have
  (load, blend, or replace in red). "Looks Good, Save It" (or "Replace Rankings") loads them; Cancel or Escape
  leaves everything as it was. Quick-Start still loads at once.

### v2.7 — 2026-10-05

- **Setup Progress checklist** at the top of the Setup tab: Load rankings, Add or sync your draft, and Load ADP,
  each ticked off as it's done, with a sentence of instructions and a "Show me ↓" link that jumps to the right card.
  It hides once all three are done.
- **The next setup step pulses**, so it's clear what to do next. While no rankings are loaded, the logo pulses
  when you're on another tab. With reduced motion turned on, these are a steady highlight instead.
- **Reset Controls** is styled as a danger zone (red dashed border, red title).
- **Dismissing the "New here? Read the User Guide" banner now sticks** after a reload.
- **Quick-Start and Fetch Market Value use Fantasy Football Calculator's mock-draft ADP** (Redraft PPR, Half-PPR,
  Standard, 2QB/Superflex, and Dynasty rookie drafts), replacing LeagueLogs, whose API was retired. Out of season,
  when Fantasy Football Calculator's list is thin, Quick-Start uses the last full list and says how old it is.
- **Two-way players** (like Travis Hunter) match at their fantasy position when you load rankings.
- **Faster rankings loads:** Sleeper's player list is kept for a day (shared with Lineup Strategist) instead of
  being downloaded on every upload, paste and Quick-Start, and loads work offline once it's saved. An error reply
  from Sleeper is never saved as that list.
- **Accessibility:** form controls are labelled, menus keep keyboard focus inside while open, live-sync status is
  announced, and decorative icons are hidden from screen readers.
- **Faster Tracker** on large player pools, and keyboard focus stays put when the pool or queue redraws.

## Lineup Strategist

### Unreleased

- **Your player's tier in the Waiver Wire Assistant.** When your rankings have tiers, the player a free agent is
  measured against now shows his, like the free agent does: Auto-Find's "Your weakest RB is Derrick Henry (ROS RB8
  (T4))" and its "Next weakest" list, and the two numbers under every verdict ("ROS Pos: Cook RB5 (T3), Henry RB8
  (T4)"), so you can tell a tier jump from a same-tier shuffle. Each tier is the one for the number shown: position,
  FLEX or overall. A single rankings file's Tier column is its overall list's, so it shows beside Overall ranks;
  position tiers come from per-position files. It doesn't change what counts as an upgrade, and rankings without
  tiers look as before.
- **Strength of schedule in the Waiver Wire Assistant.** When you've loaded SoS (the upload or the manual grid on
  the Roster tab), the Scout tab's Auto-Find and Check a List cards show the same "SoS: 7" badge as the Roster tab,
  and so does the player each free agent is compared with ("Would need to pass Josh Allen SoS: 2", your weakest
  player), so the two schedules sit side by side. It doesn't change any rank, order or verdict, and without SoS
  loaded nothing changes.
- **The SoS badge explains itself, everywhere.** On the Roster tab and in the Waiver Wire Assistant, hover or tap
  the badge for what the number means (1 = easiest, 32 = hardest). On phones it's a calendar icon and the number,
  so it stays short and doesn't read as another rank. Desktop still shows "SoS: 7".
- **The SoS card says which end is easy, how old your SoS is, and can flip it.** Once SoS is loaded, the Roster
  tab's SoS card shows "1 = easiest, 32 = hardest" and when and where it last came from ("SoS updated 3 days ago from
  your ROS rankings (rankings.csv)", amber after a week); the badge's tap text ends with the date too. If your source
  ranks 1 = hardest, turn on "My SoS files rank 1 = hardest": it flips what's saved now and every later SoS file, or
  SoS column in a ROS or Weekly rankings file. If you've edited the manual grid since your last upload, it asks before
  flipping what's saved. An upload whose numbers only go up to 5 (ratings, not 1-32 ranks) gets a warning.
- **Cancelling a rankings upload no longer changes your SoS.** A rankings file with an SoS column used to update the
  SoS on screen even if you cancelled its preview; now it's saved only with the rankings. Uploading an SoS file on
  the Roster tab now updates the badges right away.
- **Export Lineup keeps the FLEX badge's blended border.** In the exported image, the FLEX, SFLEX, W/T and W/R slot
  badges lost their colored border and showed as plain dark boxes. They now look as they do on the Lineup tab.
- **What changed after you replace a ranking set.** When an upload's Replace Set (or the ROS Auto-Fetch's Replace
  Set) overwrites a saved set, a "What changed" card now shows under that rankings card, saying what it's compared
  with. It leads with your players' moves (the 5 biggest, with Show all for the rest) and who came into and went out
  of this league's lineup (Weekly). League-wide risers, fallers, added and dropped players are under Details. Players
  whose rank moved, or who are new in the rankings, also get a small up/down/New chip: your players beside their rank
  on the Lineup and Roster tabs, free agents on the Scout tab's Top Available rows. Tap a chip to see what it means.
  Only moves of 3 or more spots for players in a useful range (top 24 QB/TE, 48 RB/WR, 16 K/DEF) count. Weekly sets
  are compared with the week's first upload (the week runs Tuesday to Monday): that first upload shows no card, and
  later updates that week show changes since it. Weekly chips go away when the week ends, ROS chips after 7 days, and
  either sooner at the set's next upload. Dismiss the card with ✕; it isn't kept after a reload.
- **Rename a ranking set.** A saved Weekly set (Lineup tab) or ROS set (Roster tab) now has a Rename button next to
  Delete. Every league using the set keeps it, and the new name shows everywhere the set is named. Before, the only
  way to change a name was to delete the set and upload it again, which also took it away from every league using it.
  Names can be up to 60 characters (the New Set Name field now stops there too); you're warned, but not stopped, when
  another set of the same type already has the name.
- **A new league starts with no rankings.** Creating a manual league, syncing a Sleeper league for the first time,
  Import All and importing a roster from Draft Strategist used to keep the rankings of the league you were on. The new
  league's lineup used them, and its first rankings upload saved them into it as "Unassigned Upload (legacy)". After
  a reload, any league with no rankings of its own picked up your latest upload from another league the same way. A
  league now has no rankings until you upload or pick a set for it, as when you switch to it. A league that already
  got another league's rankings this way still shows them as "Unassigned Upload (legacy)": pick a set in that
  dropdown, or upload new rankings, to replace them.
- **Sleeper trending adds in Top Available** (Scout tab, Waiver Wire Assistant). A player among Sleeper's 50
  most-added of the last 24 hours gets a small green trending-up icon in his row; hover it for how many leagues added him.
  A new **Show: Your rankings | Trending** switch lists those trending players who are still available in your league,
  most adds first, each with your position rank or "UR" when your rankings leave him out, so you can see when the
  crowd is chasing someone your rankings don't like, or skipping someone they do. The position buttons filter it too.
  Your rankings' order never changes. If Sleeper can't be reached, the icon and the switch just don't show.
- **Best available in your leagues, on the Dashboard:** a new card under the League Command Center shows, for every
  league synced from Sleeper, its top 3 available RBs, WRs and TEs with their position ranks and injury badges
  ("James Cook RB8"), ranked by that league's own Weekly or ROS rankings. A Weekly | ROS switch picks which; it's the
  same Rank By as the Scout tab's Waiver Wire Assistant, so the two always agree. Free agents worth a roster spot over
  a player of yours are marked as upgrades ("James Cook RB5 over Derrick Henry RB8"). On Weekly that means he'd start
  over someone in your best lineup this week (or fill an empty starting spot); on ROS, that he beats your weakest
  rostered player at his position. He must be in a better tier when your rankings have tiers (otherwise at least 3
  spots better), but any ranked player can count. Leagues with the biggest upgrades come first; the rest fold under "Show N more leagues". View opens that
  league's Top Available on the Scout tab, filtered to RB/WR/TE like the line. On a computer, a Sleeper link opens the
  league on sleeper.com. Each line says when the league hasn't synced in over 2 days. The card collapses and
  remembers it, keeping a one-line summary ("Upgrades in 2 of 5 leagues"). Manual leagues are left out, since the
  app only knows your own roster there. A league with no rankings yet says where to upload them. Tap × on a player
  you're not interested in to hide him from that league's line for the week; "Restore" brings him back, and
  dismissals clear themselves when the NFL week changes.
- **"Your weakest player" skips IR, Out and taxi players.** Check a List and Auto-Find's Whole Roster comparison (and
  the Dashboard's Best Available card) used to name an injured star on IR, an Out player or a taxi-squad stash as
  your drop candidate, since Weekly rankings leave those players out, so every free agent "beat" him. They now
  compare against your weakest active player (PUP, NFI and suspended players are skipped too) and say who wasn't
  counted.
- **Top Available in the Waiver Wire Assistant:** the Scout tab's waiver card now has three modes, Top Available,
  Auto-Find and Check a List, sharing one Rank By, one row of position chips and one results area. Top Available (the
  default) is a compact list of the best-ranked players nobody in your league has rostered, with rank chips in the
  usual position colors: All (now the default position, for Auto-Find too) shows the top 5 at each position side by
  side, one position or FLEX shows 15 at a time with Show 15 more, and "Starts" marks anyone who'd make your lineup
  this week. The position buttons look and light up like Draft Strategist's Tracker filters. In Check a List with Whole Roster, the chips appear as "Compare Within": FLEX weighs a pasted RB, WR or
  TE against your weakest of all three, any other choice against his own position. It redraws when you come back to the Scout tab after uploading rankings or
  syncing, and when you switch leagues. In a manual league it lists players not on your roster and says so.
- **No emoji in the "Lineup Optimized!" message** at the end of setup.
- **W/T and W/R slots are their own slots.** Sleeper's WR/TE-only and WR/RB-only flex slots used to be read as a
  regular FLEX, so the optimizer could start an RB in a W/T slot or a TE in a W/R slot, a lineup Sleeper won't
  take. They now sync as W/T and W/R (new boxes under Active League Requirements), are filled only with eligible
  players, and show as W/T and W/R on the Lineup tab, in Copy as Text and in Power Rankings. Run Sync All once to
  update leagues synced before this. A roster sent from Draft Strategist keeps its W/T and W/R slots too.
- **FLEX and SFLEX badges show the positions they take:** the Lineup tab's FLEX slot badge has a green-blue-yellow
  (RB/WR/TE) border and SFLEX a red-green-blue-yellow (QB/RB/WR/TE) one, instead of the shared violet. The Scout tab's
  FLEX button and heading match.
- **FLEX Kickoff Optimization covers SFLEX.** In superflex leagues, SFLEX used to keep whoever rank put there, even
  when your QB-slot QB or a FLEX starter played later. Now SFLEX holds the latest-kickoff starter it can take (a QB
  who plays after your other QB, or an RB/WR/TE), then FLEX, so you keep the most room for a late swap. W/T and W/R
  slots get the same treatment within the positions they take. Who starts doesn't change.
- **The Sync All Leagues spinner keeps spinning.** It used to jump back to the start of its turn each time the
  count moved on to the next league ("Syncing 2/5…"). It now turns smoothly for the whole sync while the count still
  updates. The Combine & Process Files button on the rankings upload ("Processing 2/3…") does the same.
- **No more letters behind player photos.** On the Roster and Lineup tabs, a player's initials used to show through
  the see-through parts of their headshot, and while it loaded. Now a photo covers them completely (the circle stays
  plain until it appears). Players without a photo, and DEF rows, still show their initials or team code.

### v2.14.0 — 2026-10-05

- **Bye weeks follow the 2026 schedule.** They were 2024's, wrong for 29 of 32 teams, so BYE badges, the "(##)"
  bye after names, the optimizer and the "on bye this week" waiver verdicts were wrong. Opening the app straight
  onto the Roster or Lineup tab now shows byes as soon as Sleeper answers, without switching tabs.
- **Shared names find the right player:** the simulator's player lookup (Josh Allen, DJ Moore, Kenneth Walker III…),
  the Scout tab's position badges (Justin Jefferson no longer shows as LB) and Waiver Insights. Two-way players
  like Travis Hunter start at their fantasy position.
- **Waiver Insights compares free agents on a fresh page load** (it used to need a Scout action first), and says
  so when none of your unrostered ranked players could be matched to a position.
- **Simulator Boom/Bust:** kickers and defenses averaging under 4 points get sensible splits (never both bust and
  boom), and a week exactly on a line counts for every position.
- **Rankings uploads:** a Pos Rank written like `WR2`, FantasyPros' RK and TIERS columns, FantasyPros' own position
  ranks (`WR12` in the Pos column), and files headed "Quarterback" / "Running Back" / "Flex" are read correctly.
  Strength-of-schedule values like 4.5 or -2 are kept as written, on both SoS uploads.
- **Market data comes from FantasyCalc only** (LeagueLogs' API was retired).
- **Style fixes:** smaller ✕ on banners, pulsing setup cards keep their rounded corners, and the Danger Zone
  (Factory Reset) gets its red style.
- **Fewer "unknown player" problems:** an error reply from Sleeper is no longer saved as the player list for a day.
- **Accessibility:** form controls and the lock, swap and delete buttons are labelled, live regions announce
  changes, and decorative icons are hidden from screen readers.

### v2.13.0 — 2026-09-28

- **Player headshots.**

### v2.12.0 — 2026-09-28

- **Its own branding:** a new favicon, hero wordmark and app icon, and its own install manifest, so it installs as
  a separate app.
