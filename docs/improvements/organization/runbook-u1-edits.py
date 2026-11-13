# U1: the runbook edits (cards U4, U5, U6, A2; M14 takes R2; the order, the tracks and the top note).
# Usage: python3 runbook-u1-edits.py <the runbook HTML saved by the Artifact read action> <output.html>
# Each edit asserts its anchor occurs exactly once, so it fails loudly if the runbook changed. Built on version 1794512485-d1fd.
import json, sys
SRC = sys.argv[1]; OUT = sys.argv[2]
lines = open(SRC, encoding='utf-8').read().split('\n')
text = '\n'.join(lines)

def once(old, new):
    global text
    assert text.count(old) == 1, (text.count(old), old[:80])
    text = text.replace(old, new)

ORG = "docs/improvements/organization.md"

# 1. M14 grows to take R2 (U1 round 2).
m14_line = next(l for l in text.split('\n') if '"id": "M14"' in l)
d = json.loads(m14_line.strip().rstrip(','))
d['title'] = "Material 3: surface tones and corners, and sections on phones (mock-ups first)"
d['size'] = "~30k tok"
d['goal'] += (" Added 2026-11-13 from U1's round 2 (owner's pick, " + ORG + " section 7): on phones content sits 21 to 55px from the screen's edge "
    "because cards hold boxes that hold boxes (a Lineup row gets 319 of 375px, a Roster row 303, the Simulator's and the Waiver Wire's sub-blocks 265; "
    "Material 3's compact margin is 16px, 343). Material 3: \"Don't force content into cards when spacing, headlines, or dividers would create a simpler "
    "visual hierarchy\"; \"Lists should extend edge-to-edge in compact windows\"; 16dp margins in compact windows. The owner picked **R2**: under 600px "
    "cards become full-width sections, and inside cards at every width nothing is boxed again. Visible effect: on phones the tabs run to the screen's "
    "edges with 16px margins, rows are plain list rows with dividers, and the Lineup and Roster tabs are about 200px shorter; tablets and computers keep "
    "their cards, with flat rows inside.")
d['ask'] += (" For R2 (already chosen; the mock-ups are " + ORG + "'s room-r2-*.png): confirm the 8px band between sections on phones (or a divider), "
    "and which coloured edges stay as a 3px edge (the league card's amber needs-you and green active, the week tiles' result colours: my suggestion all).")
d['scope'] += [
    "R2, from " + ORG + " section 7 and its mock-ups (U1's LOG entry, round 2): under 600px `.container` loses its side padding and `.settings-card` its "
    "side borders, corners and shadow (16px side padding, an 8px band of the page colour between sections); banners, the Setup Progress checklist, the tier "
    "chips and the matchup strip keep 16px margins. Inside cards at every width: `.lineup-slot`, `.roster-item`, the waiver results and `.mls-lc-card` become "
    "list rows with a divider (no border, background, side padding or gap); `.sos-details-accordion`, `.toggle-row`, `.settings-subsection` and the needs boxes "
    "become one surface tone lighter with no border. Under 600px Draft Strategist's `.player-card` becomes a list row. The week tiles stay tiles (a card "
    "that opens something, as Material 3 keeps them).",
    "Exports keep their look at every width: the Lineup PNG, Export Team and Export Recap are drawn from the DOM by html2canvas, so pin the exported "
    "element's width and styles in each export's onclone (test at 390px that the image matches today's).",
    "Hover and press feedback on rows (M2's) moves from a border colour to a tone; touch targets unchanged (tests/touch-targets.spec.mjs).",
]
d['done'] += ["At 375px a Lineup row's content is 343px wide (today 319) and nothing inside a card has its own border; tablets and computers keep their cards"]
d['parallel'] = d.get('parallel', [])
new_line = '  ' + json.dumps(d, ensure_ascii=False) + ','
once(m14_line, new_line if m14_line.startswith('  ') else new_line.lstrip())

# 2. New cards from U1.
COMMON_AVOID = "Removing features"
cards = [
 {"phase": "8", "added": "2026-11-13", "id": "U4", "title": "Dashboard and Scout tidy: setup folds once you have a league, and the signposts go",
  "size": "~10k tok", "kind": "Feature", "pri": "next", "needs": ["U1", "S45"], "parallel": ["A2", "S34", "S36"],
  "goal": "From U1 (" + ORG + ", option 1's base; the owner's pick, 2026-11-13). On a phone 66% of the Dashboard is set-once cards, two cards only say where a feature moved (the Global Injury Auditor on Lineup since S11, Power Rankings on Scout since S29), and Scout's \"Sleeper Sync Required\" banner (177px, the first thing on the tab) stays after a sync until dismissed. S45 moves Advanced Settings to a Settings page; this card does the rest. Visible effect: once you have a league, Add/Sync League and Active League Requirements are one line each on the Dashboard (tap to open, as today while you have none); the two signpost cards are gone; Scout's banner shows only while no Sleeper league is synced.",
  "ask": "",
  "scope": [
    "Read " + ORG + " (sections 1 and 4, the base) and U1's LOG entry, then S45's (the Settings page, what stayed on the Dashboard).",
    "Add/Sync League and Active League Requirements: a fold like the Scoreboard's sections (js/mls/week/thisWeek.js `foldSection`) or a `details`, closed by default once any league exists, open while none does; the closed line says what's inside (Requirements: the active league's slots). Remembered in one `mls_` key in js/shared/storage/keys.js (or the existing fold map), so Backup and Factory Reset pick it up.",
    "Scout's banner (`#sleeperSyncBanner`): shown only while no Sleeper league is synced; dismissing it still hides it for good (`mls_hide_sleeper_sync_banner`).",
    "Remove `#injuryAuditPointer` and `#powerRankingsScoutPointer` and their actions (`goToLineupNeeds` stays if other places use it; `goToPowerRankings` likewise); the Guide's steps 4 and 7 already say where both are.",
    "Specs: the empty Dashboard unchanged; with a league, both folds closed, open on tap, remembered across a reload; the banner before and after a Sleeper sync; no signpost cards.",
    "Screenshots: the league Dashboard, Lineup and Scout PNGs (desktop and phone); `mls-empty-setup` stays identical. CHANGELOG line under Lineup Strategist.",
  ],
  "avoid": [COMMON_AVOID, "What the setup cards do", "Advanced Settings (S45)"],
  "done": ["A shorter Dashboard and Scout with a league synced; the empty Dashboard as today", "Specs, LOG, re-taken screenshots listed; checks pass"]},
 {"phase": "8", "added": "2026-11-13", "id": "U5", "title": "Fold the occasional tools: the Matchup Simulator, the Trade Finder and SoS",
  "size": "~10k tok", "kind": "Feature", "pri": "next", "needs": ["U1", "S20"], "parallel": ["U2", "U3", "L1", "S39"],
  "goal": "From U1 (" + ORG + ", option 1; the owner's pick, 2026-11-13). The owner uses every weekly card but not the Matchup Simulator (Lineup, 532px, 3.5 screens down) or the Trade Finder (Scout, 488px); the SoS card is set-up at the foot of Roster. Visible effect: each is one line until you open it (open, it's today's card), remembered like the Scoreboard's sections.",
  "ask": "",
  "scope": [
    "Read " + ORG + " (sections 1 and 4) and U1's LOG entry, then S20's (what loads on first use) and the Scoreboard's folds (js/mls/week/thisWeek.js `foldSection`, `mls_scoreboard_folds`).",
    "The three cards fold with the same markup and motion as the Scoreboard's sections (button with `aria-expanded`, chevron, view transition); state in one `mls_` key in keys.js; closed by default.",
    "With S20 merged, the Simulator's and the Trade Finder's code loads on first unfold, not on tab open, if that's simple; otherwise note it in LOG.",
    "The Guide's steps 3, 6 and 10 say the cards open with a tap.",
    "Specs: closed by default, open on tap and by keyboard, remembered across a reload; the Simulator still runs and the Trade Finder still finds after opening.",
    "Screenshots: the league Roster, Lineup and Scout PNGs. CHANGELOG line under Lineup Strategist.",
  ],
  "avoid": [COMMON_AVOID, "What the three tools do"],
  "done": ["The three tools fold and remember it", "Specs, LOG, re-taken screenshots listed; checks pass"]},
 {"phase": "8", "added": "2026-11-13", "id": "U6", "title": "Jump chips at the top of Scout and Lineup",
  "size": "~12k tok", "kind": "Feature", "pri": "next", "needs": ["U5"], "parallel": ["U2", "U3", "L1"],
  "goal": "From U1 (" + ORG + ", option 1; the owner's pick, 2026-11-13). Scout is two jobs (the Trade Analyzer 1.5 screens below the Waiver Wire Assistant on a phone) and Lineup ends with the Simulator 3.5 screens down. A row of chips at the top, Material 3 filter-chip shape, scrolls to each section: a scroll aid, not navigation, so swipes and the five destinations don't change. Visible effect: Scout opens with Waivers · Trade Analyzer · Trade Finder, Lineup with Lineup · Bench · Early Games · Simulator; the chip of the section in view is highlighted; a tap scrolls there (and opens it if folded).",
  "ask": "Before building, show me Scout and Lineup at 375 and 1280px with the chips (" + ORG + " has mock-ups: opt1-scout, opt1-lineup) and confirm: sticky under the header (my suggestion) or only at the top; the chip names; hidden from 1200px once M12 shows the sections side by side (my suggestion), shown at every width until then.",
  "scope": [
    "Read " + ORG + " (option 1) and U1's LOG entry, U5's (the folds a chip opens), M12's card (two panes from 1200px) and M2's (48px targets).",
    "js/shared/ui/jumpList.js (in PRECACHE_ASSETS; sw.js CACHE_NAME): builds the row from a list of section ids and labels, `nav aria-label=\"Jump to\"` with links, IntersectionObserver for the highlighted chip, a tap scrolls (smooth unless Reduce Motion) and opens a folded target, focus moves to the section's heading. Chips 32px tall with a 48px target, the site's green for the highlighted one.",
    "Through data-action and delegate(); no inline handlers. A chip carries no meaning beyond its label, so no Guide legend line (say so in LOG); the Guide's Scout and Lineup steps mention it.",
    "Specs: tap and keyboard jump to each section; the highlight follows scrolling; a folded target opens; nothing scrolls sideways at 375px; swipes between tabs still work.",
    "Screenshots: the league Scout and Lineup PNGs (desktop and phone). CHANGELOG line under Lineup Strategist.",
  ],
  "avoid": [COMMON_AVOID, "Tabs inside a tab (option 2, not chosen)", "Other tabs"],
  "done": ["Scout and Lineup have the jump row", "Specs, LOG, re-taken screenshots listed; checks pass"]},
 {"phase": "6", "added": "2026-11-13", "id": "A2", "title": "Umami: which tabs and tools are used (Tab, Tool and Section events)",
  "size": "~6k tok", "kind": "Feature", "pri": "next", "needs": ["U1"], "parallel": ["U4", "S34", "S36", "S48"],
  "goal": "From U1 (" + ORG + " section 2; the owner said yes to all three, 2026-11-13). Umami counts page views per page (A1's data-exclude-hash keeps tab switches out) plus K2's Ko-fi and Share and K3's Shared link opened, so nobody knows which tabs and tools people use. Three click events by attribute, no tracking code. Visible effect: none in the app; the Guides' and T-Score's privacy lines and the README say tab and button taps are counted too.",
  "ask": "",
  "scope": [
    "Read " + ORG + " section 2, A1's and K2's LOG entries (attributes, the 100K events a month, the privacy lines).",
    "`data-umami-event=\"Tab\"` with `data-umami-event-tab` (setup, roster, lineup, scoreboard, scout, guide) on both apps' bar and rail buttons, with `data-umami-event-where=\"drawer\"` on the drawer's; Draft Strategist's tabs likewise (setup, tracker, team, board, guide).",
    "`data-umami-event=\"Tool\"` with `data-umami-event-tool` on the main buttons: sync-all, optimize-all, optimize, waiver-top, waiver-auto, waiver-list, analyze-trade, find-trade-targets, run-sim, export-recap, export-lineup; Draft Strategist: pick, live-sync, export-team.",
    "`data-umami-event=\"Section\"` with `data-umami-event-section` on fold toggles (player-scoreboard, root-for, mvps, still-in-play; simulator and trade-finder once U5 folds them; U6's chips if merged). An attribute counts closing too; if that muddies the numbers, send `umami.track` on open only (a few lines, like K3's).",
    "Update both Guides' Visitor Counts line, T-Score's line and the README's privacy section: which tabs and buttons are used, never league data.",
    "Spec: the attributes are on the buttons (one test per app); the analytics spec still passes. A week after it ships, check the month's total in Umami against the free plan's 100K; if Tab is too many, drop it and say so in LOG.",
  ],
  "avoid": ["Any data beyond the event name and its one attribute", "Custom tracking code beyond K3's pattern"],
  "done": ["The three events on both apps' buttons; privacy lines updated", "Spec, LOG; checks pass"]},
]
block = ''.join('\n  ' + json.dumps(c, ensure_ascii=False) + ',\n' for c in cards)
f20 = next(l for l in text.split('\n') if '"id": "F20"' in l)
once(f20 + '\n\n];', f20 + (',' if not f20.rstrip().endswith(',') else '') + '\n' + block + '\n];')

# 3. The order: U4 and A2 in weeks 12-13, U5 and U6 in January.
old = '"ids":["S34","S36","U1","S30","M10","K4","S32","S35","F14","F16","T2","S45","S48"],"together":"S34, S36, U1, M10, K4, F16, T2 and S48 together; S32 any time; S35 after S34; F14 any time (S38 is merged); S45 after N2, not alongside M10","why":"'
new = '"ids":["S34","S36","U1","S30","M10","K4","S32","S35","F14","F16","T2","S45","S48","U4","A2"],"together":"S34, S36, U1, M10, K4, F16, T2 and S48 together; S32 any time; S35 after S34; F14 any time (S38 is merged); S45 after N2, not alongside M10; U4 after S45; A2 any time","why":"Added 2026-11-13: U1\'s research is done (option 1, tidy in place; ' + ORG + '). U4 (the setup cards fold once you have a league, the two signpost cards go, Scout\'s banner only while nothing is synced) right after S45, which edits the same Dashboard; A2 (Umami events for tabs and tools) is attributes only and can run beside anything, so the numbers start before the playoffs. Before 2026-11-13: '
once(old, new)
old = '"ids": ["S25", "M5", "M12", "P1", "E1", "U2", "U3", "L1", "S39", "S40", "S41", "S43", "C1", "X1", "S49"], "together": "together; S40 and S43 after S20; C1 any time in January; X1 beside P1; S49 after S37", "why": "'
new = '"ids": ["S25", "M5", "M12", "P1", "E1", "U2", "U3", "L1", "S39", "S40", "S41", "S43", "C1", "X1", "S49", "U5", "U6"], "together": "together; S40 and S43 after S20; C1 any time in January; X1 beside P1; S49 after S37; U5 after S20, then U6", "why": "Added 2026-11-13: U5 (the Simulator, the Trade Finder and SoS fold) after S20, which moves the same Scout and Simulator code (and lets them load on first unfold); then U6 (jump chips on Scout and Lineup), whose chips open U5\'s folds. Before M12, so U6 knows the width where the chips hide. Before 2026-11-13: '
once(old, new)

# 4. Tracks.
old = '{name:"Structure and new directions", sub:"research, any time · U1 before M10, M12 and S32 if it can", ids:["U1","U2","U3","L1"], sep:"·"},'
new = old + '\n  {name:"Organization (U1)", sub:"U4 after S45 · U5 after S20 · U6 after U5, before M12 · A2 any time · then M14 takes R2 (sections on phones)", ids:["U4","U5","U6","A2"], sep:"·"},'
once(old, new)
old = '{name:"Material 3: how it looks", sub:"one at a time, no other visual card open · M4 and M6 after M2 · M7 after M6 · M8 after M7 and S32 · M14 then M9 last", ids:["M4","M6","M7","M8","M14","M9"]},'
new = '{name:"Material 3: how it looks", sub:"one at a time, no other visual card open · M4 and M6 after M2 · M7 after M6 · M8 after M7 and S32 · M14 (now with U1\'s R2, sections on phones) after U4 to U6 · M9 last", ids:["M4","M6","M7","M8","M14","M9"]},'
once(old, new)

# 5. The note at the top.
old = '<p class="note">Updated 2026-11-12, evening: '
new = ('<p class="note">Updated 2026-11-13: <a href="#c-U1">U1</a>\'s research is done (<code>' + ORG + '</code> on its branch, awaiting its pull request). '
       'You chose <b>option 1, tidy in place</b>: four new cards (marked "New"): <a href="#c-U4">U4</a> (the setup cards fold once you have a league, the two signpost cards go, Scout\'s banner only while nothing is synced) after S45 and <a href="#c-A2">A2</a> (Umami events for tabs, tools and sections) in weeks 12–13; '
       '<a href="#c-U5">U5</a> (the Simulator, Trade Finder and SoS fold) and <a href="#c-U6">U6</a> (jump chips on Scout and Lineup) in January, after S20. '
       'And from U1\'s second round, on room on phones: <a href="#c-M14">M14</a> now also takes <b>R2</b>, sections on phones (full-width, 16px margins, nothing boxed inside cards), so the visual pass re-takes the screenshots once. '
       'Before that, 2026-11-12, evening: ')
once(old, new)

open(OUT, 'w', encoding='utf-8').write(text)
print('ok', len(text))
