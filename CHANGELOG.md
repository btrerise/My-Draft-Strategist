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

- **Top Available in the Waiver Wire Assistant:** the Scout tab's waiver card now has three modes, Top Available,
  Auto-Find and Check a List, sharing one Rank By, one row of position chips and one results area. Top Available (the
  default) is a compact list of the best-ranked players nobody in your league has rostered: All shows the top 5 at
  each position side by side, one position or FLEX shows 15 at a time with Show 15 more, and "Starts" marks anyone
  who'd make your lineup this week. It redraws when you come back to the Scout tab after uploading rankings or
  syncing, and when you switch leagues. In a manual league it lists players not on your roster and says so.

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
