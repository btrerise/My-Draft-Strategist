// --- THE BADGE LEGEND (improvements S10) ---
// "What the badges mean", the last numbered step of the Guide tab: every badge, chip, pill and icon
// Lineup Strategist shows, drawn with the app's own markup and CSS, with a sentence on what it means.
// Owner's choices: one place, the Guide (with "What do these mean?" links on the Waiver Wire Assistant
// and the Lineup and Roster tabs, js/mls/main.js openBadgeLegend); grouped by kind; one line per color set.
//
// Samples use the helpers the rows use where one exists (js/mls/badges.js, tierTag), and otherwise the
// rows' own classes, so a later style or wording change shows up here too. They aren't interactive: the
// tappable badges come back as <span>s ({ sample: true }), and .badge-legend-sample turns off pointer
// events. Built once, the first time the Guide tab is shown (nav.js, showTab), into #badgeLegendList.
//
// A new badge or symbol gets a line here in the same change (CLAUDE.md, "Rules that bite").
// tests/unit/badgeLegend.test.mjs fails when a badge class used in js/mls or lineup/index.html isn't in
// the HTML this builds. Imports only modules with no app state, so that test can load it in Node.
import {
    BYE_BADGE_HTML, DISMISS_ICON, STARTS_ICON, STATUS_CHECK_ICON, STATUS_WARN_ICON, UPGRADE_ICON,
    WARNING_ICON, bestBallBadgeMarkup, edgeBadgeMarkup, injuryBadgeMarkup, irSlotBadgeMarkup, kickoffBadgeMarkup,
    moveChipMarkup, pendingStatusIconMarkup, posCountChipMarkup, rankBadgeParts, scoutPillMarkup,
    sleeperLineupBadgeMarkup, sosBadgeMarkup, tierGapMarkup, trendBadgeMarkup
} from './badges.js';
import { FANTASY_POSITIONS, slotDisplayName, tierTag } from './constants.js';

const SAMPLE = { sample: true };
const posBadge = (pos, text = pos, extra = '') => `<span class="badge pos-badge ${pos}${extra}">${text}</span>`;
const slotBadge = (slot) => `<span class="slot-badge slot-${slot}">${slotDisplayName(slot)}</span>`;
const pill = scoutPillMarkup;
const moveSince = 'since Tue 9/15, 4:10 PM';

// [group title, [[samples HTML, meaning HTML], ...]]. "Tap for more" marks the badges that explain
// themselves on a tap (rank-change chips, SoS, the IR slot badge; earlier owner's decisions).
const GROUPS = [
    ['Positions and slots', [
        [FANTASY_POSITIONS.map(p => posBadge(p)).join(''),
            'A player\'s position. Each position keeps its color everywhere in the app.'],
        [FANTASY_POSITIONS.map(slotBadge).join(''),
            'A lineup spot on the Lineup tab, in the color of the position it takes.'],
        [['FLEX', 'SFLEX', 'WRTE', 'WRRB'].map(slotBadge).join('') + '<span class="badge flex-blend">FLEX</span>',
            'A flex spot. Its border blends the colors of the positions it takes: FLEX takes an RB, WR or TE, SFLEX also a QB, W/T a WR or TE, and W/R a WR or RB.'],
        [['BN', 'TX', 'IR'].map(slotBadge).join(''),
            'Bench, taxi squad and Sleeper IR spots, at the bottom of the Lineup tab. Players in TX and IR can\'t start.'],
        ['<span class="badge">KC</span>', 'His NFL team.'],
        [posCountChipMarkup('ALL', 'All', 17, [], 'badge-all', SAMPLE) + posCountChipMarkup('RB', 'RB', 6, ['1 IR', '1 taxi'], 'pos-badge RB', SAMPLE),
            'On the Roster tab: how many players you have at each position, with how many of them are on IR or the taxi squad. Tap one there to show only that position.'],
    ]],
    ['Ranks and tiers', [
        [`<span class="badge pos-badge RB mls-ta-pos">RB8 <span class="mls-ta-tier">T2</span></span>`,
            'On the Scout tab: his rank at his position in your rankings, then his tier when your file has a Tier column.'],
        [`<span class="badge pos-badge WR mls-ta-pos">WR <span class="mls-ta-tier">UR</span></span>`,
            'Unranked: he isn\'t in your rankings (Top Available\'s Trending list).'],
        [`<span class="badge mls-rank-badge">${rankBadgeParts(`Pos: #5${tierTag(3)}`, `Flex: #13${tierTag(3)}`)}</span>`,
            'On the Lineup and Roster tabs: his rank at his position, then his FLEX rank (Overall on the Roster tab), each with its tier in parentheses.'],
        [`${tierGapMarkup('is-up', '1 tier up')} ${tierGapMarkup('is-same', 'same tier')} ${tierGapMarkup('is-down', '1 tier down')}`,
            'In the Waiver Wire Assistant: the free agent\'s tier against the player he\'s compared with.'],
        [`<span class="mls-power-chip mls-power-chip-rec">Consider</span><span class="mls-power-chip">Hold</span>`,
            'In All My Leagues: whether a league is a good place to make the move you picked under Looking To. Consider marks the best fits.'],
        [`<span class="mls-power-cell-strong">2</span> <span class="mls-power-cell-middle">6</span> <span class="mls-power-cell-weak">11</span>`,
            'Power Rankings colors: green is the top third of your league, red the bottom third.'],
    ]],
    ['Changes and trends', [
        [moveChipMarkup('up', 8, 'Weekly rankings', moveSince, '', SAMPLE)
            + moveChipMarkup('down', 4, 'Weekly rankings', moveSince, '', SAMPLE)
            + moveChipMarkup('new', 0, 'Weekly rankings', moveSince, '', SAMPLE),
            'He moved up or down in your latest upload of these rankings, or he\'s new to them. Tap for more. They go away at the next upload, when a Weekly set\'s week ends, or 7 days after a ROS upload.'],
        [`<span class="mls-change-tier">T3 → T2</span>`,
            'In What changed, after you replace a ranking set: his tier moved.'],
        [trendBadgeMarkup('Added in 4,210 Sleeper leagues in the last 24 hours'),
            'One of Sleeper\'s 50 most-added players in the last 24 hours. Hover for the add count.'],
        [`<span class="mls-ta-starts">${STARTS_ICON}Starts</span>`,
            'In Top Available: he\'d make your lineup this week.'],
        [`<span class="mls-ba-player is-upgrade">${UPGRADE_ICON}<span class="mls-ba-name">Player</span></span>`,
            'On the Dashboard\'s Best Available: an upgrade over one of your players at his position.'],
        [`<span class="btn-bare mls-ba-dismiss">${DISMISS_ICON}</span>`,
            'On Best Available: hides him in that league for the rest of the week.'],
        [edgeBadgeMarkup(12, true) + edgeBadgeMarkup(-9, false),
            'In the Trade Finder: how far the market\'s rank is from yours. Green is a buy-low target, red a sell-high one.'],
    ]],
    ['Availability and status', [
        [['Q', 'D', 'OUT', 'IR'].map(injuryBadgeMarkup).join(''),
            'His injury status from Sleeper: questionable, doubtful, out, or on NFL injured reserve. Check before kickoff.'],
        [BYE_BADGE_HTML, 'His team is on bye this week.'],
        [kickoffBadgeMarkup('Sun 1:00 PM') + kickoffBadgeMarkup('Started', true) + kickoffBadgeMarkup('Final', true),
            'When his game kicks off, then whether it has started or finished.'],
        [`<span class="badge mls-lock-badge">LOCKED</span><span class="badge mls-autolock-badge">AUTO-LOCKED</span>`,
            'LOCKED: you locked him in that spot. AUTO-LOCKED: his game has started, so the optimizer leaves him where he is.'],
        [`<span class="badge early-badge">EARLY</span>`,
            'He plays before the main Sunday games (a team you added under Early Games), so set him first.'],
        [`<span class="badge taxi-badge">TAXI</span>`, 'On your taxi squad. He can\'t start.'],
        [irSlotBadgeMarkup('', SAMPLE),
            'In your IR slot on Sleeper. He can\'t start until you move him out of it there. Tap for more.'],
        [`<span class="badge badge-rookie">R</span>`, 'A rookie.'],
        [sleeperLineupBadgeMarkup(false) + sleeperLineupBadgeMarkup(true),
            'Your lineup on Sleeper differs from this one for him. Change it on Sleeper to match.'],
        [`<div class="lineup-needs-box has-problems"><div class="lineup-needs-title">${WARNING_ICON}<span>This lineup needs you</span></div><ul class="lineup-needs-list"><li class="lineup-needs-item is-injured">Player is Out: start Other Player instead?</li><li class="lineup-needs-item is-ir">Activate Player from IR on Sleeper before kickoff</li></ul></div>`,
            'Above your lineup: what it needs from you before kickoff, in red for an injury and purple for your IR slot, with a button to swap or find a player. The Dashboard lists the same for every league.'],
        [pill('mls-verdict-start', 'Would Start'),
            'In Auto-Find and Check a List: he\'d make your lineup this week. The line under it names who he\'d replace.'],
        [pill('mls-verdict-bench', 'Bench') + pill('mls-verdict-bench', 'Locked') + pill('mls-verdict-bench', 'No Slot'),
            'He wouldn\'t start: he\'d sit on your bench, every spot he fits is locked, or your lineup has no spot for his position.'],
        [pill('mls-verdict-out', 'Out') + pill('mls-verdict-out', 'Bye') + pill('mls-verdict-out', 'Played') + pill('mls-verdict-out', 'No Team'),
            'He can\'t help this week: he\'s injured, on bye, his game already started, or he isn\'t on an NFL roster.'],
        [pill('status-avail', 'Free Agent') + pill('status-mine', 'On Your Roster') + pill('status-owned', 'Rostered by: Team') + pill('mls-status-unknown', 'Not Yours'),
            'Who has him in this league, as of your last sync. Not Yours: in a manual league the app only knows your own roster.'],
        [`<span class="mls-ba-sync freshness-stale">Synced 3 days ago</span> <span class="mls-ba-sync sync-failed">Last sync failed</span>`,
            'Amber: this information is a few days old, so refresh it (Sync All Leagues for rosters). Red: the last sync failed.'],
        [`<span class="status-icon status-good">${STATUS_CHECK_ICON}</span><span class="status-icon status-warn">${STATUS_WARN_ICON}</span><span class="status-icon status-danger">${STATUS_WARN_ICON}</span>${pendingStatusIconMarkup()}${bestBallBadgeMarkup()}`,
            'In the Dashboard\'s league list: green, Weekly rankings are fresh or the lineup matches Sleeper; amber, they\'re stale or missing; red, your Sleeper lineup differs; grey, not optimized yet. BB: a Best Ball league, with no lineup to set.'],
    ]],
    ['Schedule', [
        [sosBadgeMarkup(1, '', { compact: true, sample: true }) + sosBadgeMarkup(16, '', { compact: true, sample: true }) + sosBadgeMarkup(32, '', { compact: true, sample: true }),
            'Strength of schedule at his position, from your SoS upload: 1 = easiest, 32 = hardest, green to red. On a phone it shows a calendar and the number. Tap for more. If your file ranks 1 = hardest, turn on that switch on the Roster tab\'s SoS card.'],
    ]],
];

// The legend's HTML: one titled list per group, each line a sample and its meaning.
export function buildBadgeLegendHTML() {
    return GROUPS.map(([title, rows]) => `<div class="badge-legend-group">
    <h5 class="badge-legend-group-title">${title}</h5>
    <dl class="badge-legend-list">${rows.map(([samples, text]) => `
        <div class="badge-legend-row"><dt class="badge-legend-sample">${samples}</dt><dd class="badge-legend-text">${text}</dd></div>`).join('')}
    </dl>
</div>`).join('');
}

// Fills the Guide's legend once, the first time the Guide is shown (nav.js, showTab). Not at start-up,
// so its samples aren't in the page, hidden, while you use the other tabs. Nothing redraws it.
export function renderBadgeLegend() {
    const el = document.getElementById('badgeLegendList');
    if (el && !el.dataset.built) {
        el.innerHTML = buildBadgeLegendHTML();
        el.dataset.built = '1';
    }
}

// "What do these mean?" (data-action="openBadgeLegend", js/mls/main.js): after the Guide tab is shown,
// scroll its legend into view and move focus to the legend's heading, so a keyboard or screen-reader
// user lands on it too.
export function focusBadgeLegend() {
    renderBadgeLegend();
    const section = document.getElementById('badgeLegend');
    const title = document.getElementById('badgeLegendTitle');
    if (!section) return;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    if (title) title.focus({ preventScroll: true });
}
