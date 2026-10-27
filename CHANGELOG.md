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

- **A clearer tab bar.** The tab you're on now has a bold name and a heavier icon, with the green bar above it as
  before.
- **No console errors when switching tabs quickly in Chrome 153.** A tab switch cut short by the next one no longer
  logs an "unhandled promise rejection".
- **A faster first visit.** The page's font now comes from this site instead of Google Fonts, so on a phone's first
  visit the page appears about a second sooner (blank for less time). The logos download smaller and look the same.
- **Export Team draws numbers without gaps.** Numbers in the exported image could be followed by a stray space
  ("RB1 " or "Bye: 8 "); they now read as on the page.
- **Tooltips stay on the screen.** A tooltip opened near the edge of a phone screen now slides back inside it instead of
  running off the side.
- **Smooth tab changes.** Switching tabs (tapping the tab bar, swiping, the menu, number keys, Back and Forward) now
  slides the page in the direction you're going on a phone, and fades softly (the new page rising a little) on a wider
  screen, while the header and tab bar stay put. A green bar above the tab bar's active tab slides to the new one. Browsers without View
  Transitions (older Safari and Firefox) switch as before, and with Reduce Motion turned on nothing moves.
- **Toasts respect Reduce Motion:** with it on they appear and go without sliding.
- **What the badges mean, in the Guide.** A new last step in the Guide tab shows every badge, label and color the app
  uses (positions and their colors, the Tracker's tier chips, the Team tab's flex labels, the Board's pick colors,
  Value and Reach, T-Score labels, rookie, injury, Stack, the bye-week warning, the pick counter and the LIVE pill),
  each as it looks in the app, with a sentence on what it means. "What do these mean?" above the Tracker's position
  chips opens it.
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

- **The Scout tab follows a league switch made there.** Switching between a redraft and a dynasty league on the Scout
  tab left the Waiver Wire's Rank By on the old league's choices (ROS Rank, or Dynasty and In-Season Rank) until you
  left the tab and came back. Market Disconnect's report is also re-run for the new league, so who rosters each player
  is that league's.
- **A warning when market values don't match the league.** Market values are one set, from your last fetch. When the
  league you're in plays a different format (redraft or dynasty, 1QB or Superflex, PPR, TE premium), the Market
  Consensus line and the Trade Analyzer say so, for example "Fetched for redraft; this league is dynasty."
- **The Week Recap lasts through Tuesday.** Sleeper moves to the next week as soon as Monday night's game ends, and the
  Scoreboard, the Dashboard's line and the Lineup tab's strip went with it, so last week's recap was gone within an hour.
  They now follow the week Sleeper's own app shows, which changes on Wednesday when waivers run. Lineups, projections
  and kickoffs still move to the new week right away.
- **MVPs and LVPs on the Scoreboard.** Under the league tiles, a section that opens with a tap lists the players who won
  and lost your week across your Sleeper leagues, from your weekly recap: MVPs (at or above their position's Boom line
  in at least one league) and LVPs (under the Bust line once their game is final), each with how many of your leagues
  own him ("26% (5)"), his points as a range, and how often you started him. Then one line each for started zeros,
  dead weight on your benches, players whose games aren't final yet, and your benched booms, each with what it cost where a starter you could
  have swapped in scored far less (outside Best Ball). With one league, the tables leave out Own and Started.
  Provisional until the week's last game is final. An MVP has to have boomed in a league where you started him, and
  Started shows the share of the leagues that own him where he started ("67% (4)"); a boom only on your bench gets its
  own line. An LVP has to have busted in a league where you started him (bench zeros are dead weight), and Boomed counts
  the leagues where you started him and he boomed. What the columns mean is in the (i) beside MVPs. In Best Ball, Started is the lineup Best Ball would pick from the points so far, since Sleeper sets it after
  the games. Injured players aren't counted as dead weight. The section and "Still in play" fold with a tap, and their
  arrows turn like the Dashboard's.
- **One fair Boom / Bust line.** A player is now judged once for the week, on his half-PPR points from Sleeper's stats,
  the same in every league, so full PPR, TE premium or 6-point passing TDs no longer make a line easier to reach in some
  leagues. The MVP and LVP tables show that number beside each league's own points, and MVP / LVP Lines in Advanced
  Settings can switch it to Full PPR or Standard.
- **Best Ball scores that count.** During the week Sleeper shows a Best Ball team's score as the lineup it was left
  with, though the best lineup is what will count. The Scoreboard now scores both sides of a Best Ball matchup by the
  lineup Best Ball would pick from the points so far (after the league's next sync).
- **Biggest win and worst loss.** Under the Scoreboard's record, with two or more leagues, the week's biggest win and
  worst loss among the matchups already settled, each opening that league's lineup.
- **No empty splits.** The record's Paid / Free and Redraft / Dynasty groups leave out a kind you have no league of
  (no more "Dynasty 0–0" without a dynasty league).
- **Share your week.** Export Recap at the bottom of the Scoreboard saves one summary image for a group chat, however
  many leagues you're in: your record and splits and the top three MVPs and LVPs, without naming your leagues.
- **Your own Boom / Bust lines.** Advanced Settings on the Dashboard has "MVP / LVP Lines" (QB 24 / 12, RB 20 / 7,
  WR 20 / 7.5, TE 15 / 5.5 to start), with Reset. They're only for the Scoreboard's MVPs and LVPs.
- **The Matchup Simulator during games.** A player whose game is still being played used to count as finished on the
  points he had so far (a receiver on 3 in the first quarter counted as 3), so win chances during games were badly
  off. He now counts as his points so far plus his usual output for the part of the game that's left (from the
  quarter and clock), and as a fixed score once his game is final. On the Lineup tab, his range reads "(3 so far)".
- **The Matchup Simulator leaves out players on a bye.** Sleeper gives them no projection, so they counted at their
  season average: a lineup with Josh Allen on Buffalo's bye got about 27 points he couldn't score. They're now left
  out like a player listed Out, and the toast says how many.
- **A Scoreboard tab: every league's matchup, live.** A new tab (a scoreboard icon in the tab bar, between Lineup and Scout)
  shows this week's score in every Sleeper league ("Week 7 Recap", with an info tip): your record as it stands (a
  matchup joins it once at least 4 players a side have played; before that it's "too early to call"), split
  paid / free and redraft / dynasty, each pair grouped (keeper leagues count with redraft; a guillotine league, with no opponent, isn't in the record), plus your record
  against the median in the leagues that play one, the matchups still in play first
  (both scores, the margin, your win chance from the Matchup Simulator, and who's still to play on each side: names
  once it's down to 4 or fewer, a count before), the
  most uncertain five ("Show all" for the rest), the effectively decided ones on one line (a matchup the Simulator
  gives under 1% either way counts as decided, once nobody on either side is mid-game), then a
  tile for every league, closest first while games are on and in your league order before and after (up to four across,
  one per row on phones), with your score and your opponent's, the result and margin, the win chance while it's in play (none for Best Ball, where the bench can still
  count), and "Median: W (3rd
  of 12)" where it applies. Tap a tile to open that league's lineup.
  It says Provisional until every game of the week is final, then Final. A guillotine league's tile shows your score
  against the chop line and your place among the teams still alive; a league that also plays the median says where you
  stand against it; a league whose matchups didn't load is named, with the rest still shown. It loads when you open
  the Scoreboard, the Dashboard or the Lineup tab and when you tap Refresh (before SNF, before MNF, after MNF), never in
  the background. The "mark the leagues you pay for" hint can be closed with its ✕. The User Guide explains it.
- **The week on the Dashboard and the Lineup tab.** Above your league cards, one line ("Week 7 Recap · Record 9–6 · 4
  still live") opens the Scoreboard. Above the lineup, the league's own matchup: your opponent, both scores, the
  margin, your win chance (or Final) beside the score (under it on phones), and who's still to play.
- **A clearer tab bar.** With five tabs, the tab you're on has a bold name and a heavier icon (with the green bar
  above it, as before), and every tab keeps its name. Number keys on a computer: 4 is now the Scoreboard, 5 Scout and 6
  the Guide.
- **Edit instead of Reorder.** The League Command Center's Reorder button is now Edit: it moves leagues, marks the ones
  you pay for ("$ Paid") and removes them.
- **Mark the leagues you pay for.** Reorder on the League Command Center now has a "$ Paid" switch on each Sleeper
  league. A paid league shows a "$" badge on its card and in This week, and a sync or a backup keeps it.
- **Your record on the Roster tab.** With the league's name, above the header's line: your record this season and where
  your points for and against rank in the league ("Points for 3rd of 12"), as of your last sync. A league shows it after
  its next sync. On phones the league's name now gets the card's full width, with its format on the line below.
- **In-Season rankings in dynasty and keeper leagues.** In these leagues the Roster tab's ROS card is now "Dynasty &
  In-Season Rankings" (its header names both sets): its set is "Dynasty rankings for this league", and a new
  **In-Season rankings** picker at the bottom of the card takes any saved ROS set, usually the one your redraft leagues use (it offers that one, with a button, and then asks
  whether to use it in your other dynasty leagues too). "Choose leagues…" sets it for many leagues at once. With an
  In-Season set, Power Rankings' **Start** column and the Contender / Retool / Rebuild labels follow it, while **Future**
  stays on your dynasty rankings, and a line under the table (and the power strip at the top of the tab) says which set gave each column. A new **I'm competing
  this year** switch on the Power Rankings card moves Ovr and the position rooms to In-Season too, and a Contender
  whose dynasty rankings are two weeks old gets a hint about it. The lineup uses the In-Season set when no Weekly set is
  loaded; the Waiver Wire's Rank By reads **Dynasty Rank** in these leagues and adds **In-Season Rank**; and the
  Dashboard's best available on **ROS** uses a dynasty league's In-Season set ("In-Season · …"). The Guide explains it.
  A **Suggested** line (Competing, Retool or Rebuilding) in the Your Team card starts from your label and lets your
  record and points for move it one step, naming bad luck when your points against is among the league's highest; the
  switch points to it, and the power strip at the top of the Roster tab shows it when it differs from your label. Player
  rows on the Roster tab say which rankings their ranks come from. With no
  In-Season set, and in redraft leagues, nothing changes.
- **No console errors when switching tabs quickly in Chrome 153.** A tab switch cut short by the next one no longer
  logs an "unhandled promise rejection".
- **The Trade Analyzer's two sides line up on wider screens.** Side by side (tablets and computers), Players You
  Receive and Players You Give Up now keep their search boxes, players and draft-pick rows level, even when one side
  has more players. In Sleeper leagues, Give has its own From line ("From  You (your username)") across from Receive's
  team drop-down. Phones look as before.
- **"Not in Flex list" instead of "unranked".** When your Weekly rankings rank a player at his position but leave him
  out of their FLEX list, the Waiver Wire Assistant's FLEX comparisons now say so and still show his rank ("Wk Flex:
  Douglas #98, Burks not in Flex list (WR69 T13)"), in Auto-Find and Check a List, and in Whole Roster's "Your weakest"
  line ("Wk Flex: not in list · WR69 · T13"). "Unranked" now means he's in none of your lists. The verdicts are
  unchanged: a FLEX rank still beats none.
- **No tier gap between two different lists.** A FLEX comparison no longer reads "· 6 tiers up" for a TE against a WR
  when neither is in the FLEX list: that compared his TE tier with the other's WR tier. The tier gap now shows only
  when both numbers come from the same list.
- **No more "Set on Sleeper" for players whose game has started.** Once a player's game kicks off, Sleeper won't let
  you move him, so the League Command Center no longer asks you to start or bench him: not in the card's Sleeper
  changes, its red Lineup chip, "1 to set", the count at the top, or the Lineup tab's "Differs from your Sleeper
  lineup". A league whose only differences are locked ones now reads as matching Sleeper. A lineup saved before a
  kickoff (say, at Optimize All on Sunday morning) is re-optimized when you look at it, so the card names the best
  change still allowed. That includes a player you locked in: if his game started while he was on your Sleeper bench,
  he's benched, and a note says your lock no longer applies (sync again if your Sleeper lineup says otherwise). An Out
  player still in your Sleeper lineup stops counting as urgent once his game has started, and the EARLY chip goes once
  the early game has started.
- **A faster first visit.** The page's font now comes from this site instead of Google Fonts, so on a phone's first
  visit the page appears about a second sooner (blank for less time). It's on T-Score too.
- **Quicker tab switches with many leagues.** Switching to the Lineup tab no longer redraws the Dashboard behind it,
  and the Dashboard keeps its league cards when nothing on them changed, so the pause before the slide is shorter.
- **The SoS grid shows when there's more to scroll.** Opened from "Edit Manual SoS Grid" on a phone, the grid now has
  the shadow on its right edge that tells you it scrolls sideways (it only appeared after you'd scrolled).
- **The Trade Analyzer says what would make a trade fair.** When a trade is outside the fair band, a box under the
  verdict says who would have to add and how much ("To make it fair, they'd add 3,460–5,450", the range that keeps it
  within 10%), by your ROS
  rankings (Market Consensus if you have none), and lists up to three players from that team's roster, or from yours,
  whose value would bring it within 10%, from the one closest to even down to the least they'd have to give (and a pick
  in dynasty leagues), each with its value (and the market's under it, when loaded), saying where it lands the trade
  ("Fair · 2% your way"), and with an Add button that puts him
  on the trade and re-runs it. Below them, "Or take off your side" (or "Or ask for less") lists the pieces whose
  removal alone would make it fair, with Remove. After an Add or Remove, an Undo puts the trade back. When Market
  Consensus disagrees with your rankings, one line says how the market sees the trade ("By Market Consensus this
  favors you (15%): they may ask you to add about 1,500.").
- **The two trade verdicts side by side on wider screens.** By Your Rankings and By Market Consensus now sit next to
  each other from tablet width up instead of stacking; phones are unchanged. In dynasty and keeper leagues that team's draft picks can be suggested too (market value). When no
  single player is enough, it suggests pairs ("Add both"); when nothing fits, it says so in one line. The waiver
  adjustment is counted as it would be after the add. In a manual league it suggests only what you'd add. It isn't
  part of Export Trade's image.
- **Fixed: tooltips ran off the screen on phones.** An (i) near the left edge (the Lineup tab's optimizer settings, the
  Trade Analyzer's Value settings and notes) opened its tooltip partly off-screen, so it couldn't be read. Every
  tooltip on the site now slides back inside the screen when it opens.
- **The Trade Analyzer's fair-trade box works from the keyboard.** After Add, Remove or Undo, focus stays with the
  box (on Undo, or the first suggestion) instead of jumping to the top of the page. The Guide's Trade Analyzer step
  describes the range, Remove, Undo and the market line.
- **Fixed: stray gaps after numbers in exported images.** Export Trade read "(0- 10,000 )" and "(- 868 pts, 9%)", and
  Export Lineup had the same gaps after ranks; numbers in both images now read as on the page.
- **Fixed: trade verdicts on a wrong total.** A misspelled name counted as 0, so the Trade Analyzer could still say
  "Fair Trade" (or "Favors Them, 100%" by the market). Now a name that matches no player gets one "No verdict yet" banner
  naming it, and the verdict comes once it's fixed (Did you mean is right below). A real player the market data doesn't
  have makes its banner say "Incomplete" and who's missing, and a player missing from your ROS rankings is said to count
  as 0 instead of "not found".
- **Fixed: a capital "I" on some info icons.** The (i) beside the Trade Analyzer's "By Your Rankings" and "By Market
  Consensus" read "I", because the label around it is in capitals. Info icons are now always a lowercase i.
- **Traded draft picks from Sleeper.** Syncing a dynasty or keeper league now reads which team holds each rookie pick
  for the next three drafts, traded ones included. The Trade Analyzer suggests only picks the team really holds
  (marked "via Rival" when it came in a trade), and a pick's row says "Yours", "Rival's", "Not yours (you don't hold
  it)" or "Rival doesn't hold it". Sync the league once to pick this up.
- **Draft picks count in the Future column.** In dynasty and keeper leagues, the Power Rankings' Future column (Roster
  tab, and "Power Rankings after the trade") now adds the picks each team holds, valued by dynasty Market Consensus when
  you've pulled it, else by a set table (a 1st counts like the 48th-ranked player, a 2nd the 100th, a 3rd the 160th, a
  4th the 230th, later drafts a little less). The Future tooltip names a team's picks, and a trade's picks move between
  the teams, so a trade of picks only now shows how it changes your Future rank.
- **Fewer notes under "Power Rankings after the trade".** The explanations (what Future means, picks, injuries left out)
  are behind one "How this is worked out" (i); notes that need you, like a name that didn't match, stay as they were.
- **Fixed: every draft pick of a round had the same market value.** A 2029 1st was valued like a 2027 1st (and every
  2nd like each other), whatever the market said. Each pick now gets its own year's value.
- **The Trade Analyzer shows how your team changes.** Under the trade verdict, "Power Rankings after the trade"
  shows your Positional Power Rankings (Start, Ovr, QB, RB, WR, TE) before and after the trade, by your ROS rankings
  (Market Consensus if you have none). A headline puts value and lineup together ("You pay in value (−4,389 pts) to
  make your starting lineup stronger (96% → 108% of league average)."), then a sentence such as "Starting lineup 5th
  → 3rd of 12. Stronger at WR (8th → 4th); weaker at RB (2nd → 7th)." The percent of league average shows a change
  even when your rank doesn't move, and a line under the table says 1 = strongest. Hover or tap a number to see that room after the trade, with the players
  coming in marked and the ones leaving listed. When everyone you'd get comes from one team, their change is under
  "Their team", folded. In dynasty and keeper leagues a Future column (roster value adjusted for age, as on the
  Roster tab) shows too, with each player's age in its tooltip. It says when the trade leaves a starting slot empty, and names draft picks, unranked players
  and names it can't match. In a manual league, where the app only knows your roster, it lists the starters who
  change instead (slot, who goes out, who comes in), by the Lineup tab's rules. Injuries and byes are left out, and
  nothing is saved: your Lineup tab doesn't change. The Guide's Trade Analyzer step describes it.
- **Pick players for a trade instead of typing them.** Each side of the Trade Analyzer has a search (the same one as
  Add Player Manually): tap a name and it's added as a token with its position and team, which you remove with ✕. In a
  Sleeper league a "From" drop-down above Players You Receive lists every team: choose one and tapping the search
  shows that team's roster, or pick any player and the drop-down follows his manager. Switching to a different team
  clears the players you'd receive from the old one (Any team keeps them). Players You Give Up shows your roster when
  you tap it. Every suggestion says who has the player ("Yours", the manager, "Free agent") and your ROS rank for him.
  Dynasty and keeper leagues get a draft-pick row (year and round). Typing a name and pressing Enter, or pasting a
  list, still works. Once a trade is analyzed, changing it updates the results in place. The results list each player
  on one compact line (position, name, injury, ROS and weekly rank, who has him, and his value), with Receive and Give
  side by side on wider screens, and Waiver Adjustment now sits in a "Value settings" fold under Analyze Trade.
- **Trade values say how old the market data is.** Under the verdict, "Market values: Updated 3 days ago", in amber
  with a nudge to refresh once it's more than a day old. A draft pick with no market value says so ("has no value
  without Market Consensus data") instead of "1 player not found".
- **Export Trade.** At the bottom of the Trade Analyzer, a button saves the trade as an image for your league chat,
  like the Lineup tab's PNG: the league, each player or pick you'd get and give with its value (by your rankings, and
  the market's when loaded), and the value verdict. Turn on "Include Power Rankings" beside it to add the Power
  Rankings change too (off by default; the switch is remembered).
- **Smooth tab and league changes.** Switching tabs (tapping the tab bar, swiping, the menu, number keys, Back and
  Forward) now slides the page in the direction you're going on a phone, and fades softly (the new page rising a
  little) on a wider screen, while the header and tab bar stay put. A green bar above the tab bar's active tab slides to the new one. Switching league
  yourself (the header's drop-down or arrows, a league's name on the Dashboard, Switch on a Scout result) fades softly
  to the new league, with its name sliding up in the header. Browsers without View Transitions (older Safari and
  Firefox) switch as before, and with Reduce Motion turned on nothing moves.
- **The league's name fits in the header on phones.** The league picker now takes the room beside the menu button
  (the small logo hides on phones; the tab bar's Dashboard does the same), so "Dynasty Champs 2026" shows whole on most
  phones, and a name too long to fit ends in "…" instead of a cut-off letter, on phones and desktop alike.
- **The Lineup tab fits a phone screen.** Its Optimize / Copy / PNG row ran 8px past the edge on a 390px phone, so
  the page could shift sideways on that tab. The buttons now fit, down to a 320px screen.
- **League cards fold and move in place.** On the Dashboard, folding or unfolding a league card, Fold all / Unfold all,
  Reorder and the ▲ ▼ arrows now grow, shrink and slide the cards into their new places instead of jumping, and the
  card's chevron turns at the same pace.
- **Toasts respect Reduce Motion:** with it on they appear and go without sliding.

### v2.15.0 — 2026-10-11

- **FLEX picks follow your rankings when there's no FLEX rank.** With Weekly rankings by position (separate
  QB/RB/WR/TE files, no FLEX list), the optimizer filled FLEX and SFLEX by Sleeper's projections alone. So it could
  start your WR55 over your WR53 because he projected higher, or an unranked player over ranked ones. Now a FLEX rank
  still comes first. Then a ranked player beats an unranked one, and at one position the better rank wins.
  Projections only decide between positions (a TE24 isn't necessarily better than a WR50), or between unranked
  players. The Waiver Wire Assistant, the Dashboard's best available and the "start X instead?" suggestions judge
  the same way.
- **Optimize All and Sync All use this week's projections and kickoff times.** Projections used to load only with
  the Lineup tab, so optimizing from the Dashboard right after opening the app chose FLEX players between positions
  by rank alone. Both now load them first, and if they arrive late, every league optimized without them is redone,
  not just the one you have open. They also wait for the kickoff times, so a player who already played (Thursday
  night) stays locked in even when your updated rankings leave him out. The Dashboard's best available waits for
  both too, so its first answer no longer changes after a tap that changed nothing else. Optimize All's message also
  says how many lineups to set on Sleeper ("Optimized 14 lineups · 1 needs you · 10 to set on Sleeper").
- **SFLEX is never left empty** when you have someone who can play there: with nobody ranked left, it takes the
  higher projection, as FLEX does. A healthy ranked RB, WR or TE now also beats an injured ranked QB there.
- **A benched player whose game has started stays benched.** Once his game kicks off, Sleeper won't let you start
  him, so the optimizer no longer does. The Dashboard's best available also no longer counts him as one of your
  starters. That made it compare a free agent with the wrong player ("over Zay Flowers" where Auto-Find rightly said
  he'd replace George Kittle). Not in Best Ball, where nobody sets a lineup: there every player still counts.
- **"Start X instead?" follows the lineup's rule.** For an injured or bye starter, the suggestion is whoever the
  optimizer would put in that slot from your healthy bench (projections included), not "his own position first".
- **One card per league on the Dashboard.** The League Command Center now lists your leagues as cards, one per league,
  in your order (tap Reorder above the cards for ▲ ▼ to move them and ✕ to remove one; tap a name to switch to that
  league). Each card holds everything about that league: whether its Weekly rankings are fresh and whether its lineup
  matches Sleeper (chips with a word on them; tap one for the details), its format, what its lineup needs from you
  before kickoff and what to set on Sleeper ("Start X · Bench Y"), with the buttons that fix it, and its
  best available free agents. It replaces the table, the separate "lineups need you" box and the Best Available card,
  so each league shows once, and on a phone nothing is squeezed: names are whole and nothing runs past the edge.
  - A card with nothing to do (no to-dos, no Sleeper changes, no upgrade) starts folded to its header. Tap a card's
    chevron to fold or open it; that's remembered, and "Fold all" does every card. A folded card still says "2 to do"
    (in amber, for what needs you before kickoff: only those cards get the amber border), "1 to set" (lineup changes
    to make on Sleeper) or "1 upgrade". A player who's injured or on bye but still in your Sleeper lineup needs you:
    "Bench D'Andre Swift (Out)" is amber and counted, not a routine "1 to set". A routine change says why when it isn't
    just a lower rank: "Bench Ashton Jeanty (Q · not in Wk5)", in muted text. In a card open for its to-dos, best
    available shows only when it has an upgrade.
  - After Sync All, each league's card says what changed on its roster ("Synced: + Mike Washington · − Chris
    Godwin"), folded too, until you leave the page. The Sync Logs under the cards keep them as before.
  - A line under Sync All and Optimize All counts the lineups that need you and says the next step ("Set the lineups
    on Sleeper, then Sync All again to clear them"): its "Show" scrolls to that league's card ("Show next" steps
    through several), and its ✕ hides the to-dos until another league needs you.
  - The last sync shows only when it's old or failed. Best available names your rankings set ("Wk5") without
    repeating "Weekly". Free agents who'd all replace the same player count as one upgrade, and the line says so ("3
    options for one spot: each over Kenny Gainwell").
  - On a wide screen each card puts its to-dos and best available side by side.
  - A league with no Sleeper lineup on record yet shows an amber Lineup chip ("No Sleeper lineup to compare yet")
    instead of the red "differs" icon.
- **The Dashboard names the lineups that need you.** Each league's card lists what its lineup needs before kickoff,
  with the time of the first of those games (amber within a day). It covers:
  - a starter in your Sleeper IR slot ("Activate Ja'Marr Chase from IR on Sleeper");
  - an injured or bye starter ("Justin Jefferson is Doubtful: start Puka Nacua instead?", or "Derrick Henry is Out:
    no healthy RB on your bench");
  - an empty starting slot;
  - an injured bench player your league's IR slot takes, while a slot is open ("Move Trey McBride to IR to free a
    spot"; a tip, so it doesn't count toward "need you");
  - an IR-slot player who isn't eligible there any more (Sleeper blocks adds and drops until he's out).

  Activations say when your roster is full. Each league has the buttons that fix it (on phones, in a row under its
  items): Open lineup, or Find RB (any position) for Top Available. A starter you locked in is shown greyed out and not counted. The card
  also says how the lineup differs from the one on Sleeper, with who to start and bench there; injured ones are
  marked. The list follows your lineups: fix one and it drops off. The ✕ on the line under the buttons hides the
  to-dos until another league needs you or you run Optimize All or Sync All again, and both say how many lineups need
  you.
- **One box above the Lineup tab's lineup.** "This lineup needs you" lists the same items for the league you have
  open, one per line, with Swap in and Find buttons. Tap its title to fold it to one line (with the count); it stays
  folded until you open it again. It replaces the red injury warning, the purple IR-slot line and
  the amber "Differs from Sleeper lineup" line. Statuses are spelled out ("Doubtful", not "D"), and a starter who's
  injured and in your IR slot is named once, as injured.
- **Locks last one week.** A lock (or a swap, which locks) now means "start him this week": when a new NFL week
  starts, last week's manual locks clear in every league, with a message saying how many. Game-time locks are
  unchanged. A lock now also shows after a reload (the padlock used to read unlocked until the lineup was next
  rebuilt).
- **Sync All checks injuries everywhere; the Global Injury Auditor is gone.** Sync All (or "Sync All again" in
  the box) gets the latest injury news for every league. It also looks up your manual leagues' players by name, so
  their lineups bench Out players too. A name Sleeper doesn't know shows as a note ("No injury news for Zack Nobody:
  name not found on Sleeper"). Sync All's message is now one short line ("Synced 2 leagues · 1 with roster changes ·
  2 lineups need you"). The Auditor's card on the Lineup tab now points to the Dashboard. The League
  Command Center's (i) explains the box.

- **What the badges mean, in the Guide.** A new step in the Guide tab lists every badge, chip, pill and color the app
  shows, grouped by kind (positions and slots, ranks and tiers, changes and trends, availability and status,
  schedule), each drawn as it looks on your rows, with a sentence on what it means and which ones explain themselves
  when you tap them. "What do these mean?" ("Badges" on phones) on the Waiver Wire Assistant, the Optimal Lineup and
  the Active Roster opens the Guide right at it.
- **The Guide says which end of SoS is easy.** Its SoS lines now say 1 = easiest, 32 = hardest, and mention the SoS
  card's "My SoS files rank 1 = hardest" switch.
- **Position counts on the Roster tab.** A row of chips above your roster says how many players you have at each
  position ("All 14 · QB 1 · RB 1 · WR 7 · TE 3 · K 1 · DEF 1"), in the same colors as the list. Taxi and IR players
  count, with a note under the number ("1 IR", "1 taxi"); IR means in your Sleeper IR slot or on NFL injured reserve.
  Tap a chip to show only that position; tap it again, or
  All, to show everyone. A position you have none of shows as 0 when your league starts one, and is left out when it
  doesn't (no K in a league without kickers). The counts follow every add, remove, sync and league switch.
- **An IR badge for players in your Sleeper IR slot** on the Roster and Lineup tabs, styled like TAXI. Hover over it,
  or tap it on a phone, for what it means. On the Lineup tab they sit at the bottom of the bench under an "Injured
  Reserve" divider, above the taxi squad, as in Sleeper. If the optimal lineup starts a healthy player who's still in
  your IR slot, a line above the lineup reminds you to move him to your active roster on Sleeper before kickoff.
  Sleeper syncs now record who's in your IR slot (until a league's next sync, only NFL IR status counts).
- **The Lineup tab's PNG export leaves out the warnings above the lineup** (an injured starter, or a starter in your IR
  slot). They're reminders for you, not for the league chat the image goes to. The players' badges stay in the image.
- **The Lineup and Roster tabs show real position ranks with a single rankings file.** With one overall list (a Pos
  column but no Pos Rank column, the most common upload), both tabs printed each player's overall rank as his
  position and FLEX rank: Derrick Henry, 15th overall and the 5th RB, read "Pos: #15", while the Waiver Wire
  Assistant said RB5. They now show the same numbers as the Waiver Wire: "Ovr: #15 (T3) | Pos: #5 (T3)" on the
  Roster tab, "Pos: #5 (T3) | Flex: #13 (T3)" on the Lineup tab. A file with a Pos Rank column keeps its position
  ranks; its Flex number, which was also the overall rank, is fixed the same way. Who starts doesn't change.
- **The Lineup tab's rank badge fits on phones.** "Pos: #5 (T3) | Flex: #13 (T3)" was wider than the space beside the
  projection and buttons, so the end was cut off ("Flex: #13 (T"). When it doesn't fit, it now shows on two lines,
  "Pos: #5 (T3)" above "Flex: #13 (T3)", in a box just wide enough for them, often beside the team badge. Where it
  fits, as on a computer, it looks as before.
- **Trade Finder's Positional Rank basis works with a single rankings file.** It compared your overall rank with the
  market's position rank (Henry "RB #15" against the market's "RB #5"), so most of your list showed up as
  disconnects. It now uses the same position ranks as the Waiver Wire.
- **The Waiver Wire Assistant keeps your files' position ranks with per-position uploads.** When your rankings
  came as one file per position and the app couldn't match one player's name to a position, it renumbered that
  position without him, so everyone below him read a spot too high ("RB6" for your RB7). That could also turn a
  3-spot upgrade into "Ranked ahead of". It now shows the numbers your files give, as the Lineup and Roster tabs do.
  Top Available and the Dashboard's Best Available read the same numbers.
- **Your player's tier in the Waiver Wire Assistant.** When your rankings have tiers, the player a free agent is
  measured against now shows his, like the free agent does: Auto-Find's "Your weakest RB is Derrick Henry (ROS RB8
  · T4)" and its "Next weakest" list, and the two numbers under every verdict ("ROS Pos: Cook RB5 (T3), Henry RB8
  (T4)"). The verdict also says it in words: "Upgrade over Derrick Henry · 1 tier up" (in green), "· 1 tier down",
  and a free agent ranked ahead of your player in the same tier reads "Ranked ahead of Derrick Henry · same tier"
  rather than "Upgrade over". Rankings without tiers show none.
- **"Upgrade" means the same thing everywhere.** Auto-Find and Check a List now use the Dashboard's rule: when
  your rankings have tiers, a free agent is an upgrade only when he's in a better tier than your player; without
  tiers, only when he's at least 3 spots better. Everyone ranked ahead is still listed, but only upgrades are
  counted ("RB · 1 upgrade · 2 same tier", "RB · no upgrades · 1 within 2 spots") and sorted first in Check a List.
  The rest read "Ranked ahead of".
- **Tiers on every rank from a single rankings file.** With one file and one Tier column, the Waiver Wire
  Assistant and Top Available showed the tier only beside overall ranks, and the Lineup and Roster tabs dropped it
  from position ranks when the file had a Pos Rank column. Position and FLEX ranks now show the file's overall tier
  too, so a single tiered file shows tiers everywhere in Lineup Strategist. Files with their own position or FLEX
  tiers (per-position uploads, a Weekly FLEX file) still show those.
- **"Next weakest" keeps each name with his rank** on a phone, instead of leaving the rank at the start of the next
  line.
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
- **Best available in your leagues, on the Dashboard:** each league's card shows, for every
  league synced from Sleeper, its top 3 available RBs, WRs and TEs with their position ranks and injury badges
  ("James Cook RB8"), ranked by that league's own Weekly or ROS rankings. A Weekly | ROS switch picks which; it's the
  same Rank By as the Scout tab's Waiver Wire Assistant, so the two always agree. Free agents worth a roster spot over
  a player of yours are marked as upgrades ("James Cook RB5 over Derrick Henry RB8"). On Weekly that means he'd start
  over someone in your best lineup this week (or fill an empty starting spot); on ROS, that he beats your weakest
  rostered player at his position. He must be in a better tier when your rankings have tiers (otherwise at least 3
  spots better), but any ranked player can count. A league with an upgrade shows its line open, and the card counts
  them ("1 upgrade"); the rest are folded. View opens that
  league's Top Available on the Scout tab, filtered to RB/WR/TE like the line. On a computer, a Sleeper link opens the
  league on sleeper.com. A one-line summary above the cards reads "Upgrades in 2 of 5 leagues". Manual leagues get
  none, since the app only knows your own roster there. A league with no rankings yet says where to upload them. Tap × on a player
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
