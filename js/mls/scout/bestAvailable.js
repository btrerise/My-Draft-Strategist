// --- BEST AVAILABLE IN YOUR LEAGUES (Dashboard card, under the League Command Center) ---
// Added in improvements card S5. Top Available (scout/topAvailable.js) answers "who's the best
// player nobody has?" for the active league; this answers it for every league at once, and says
// which leagues are worth acting in. One line per league: its top 3 available RB/WR/TE, ranked by
// that league's own rankings (its Weekly set, else its ROS set), and a View button that opens that
// league's Top Available.
//
// Owner's choices before building: top 3 per league; RB/WR/TE only, ordered the way Top Available's
// FLEX view orders them (FLEX rank for Weekly, overall for ROS), because Weekly sheets give QB, K and
// DEF only a position rank and so have no single order with the rest; a position-rank chip ("RB8")
// with no tier.
//
// Owner's choices after the first version (a to-do list rather than a list):
// - Upgrade check: per league and per position, the best free agent against your weakest rostered
//   player there, by that league's rankings (Check a List's Whole Roster benchmark, rosterBenchmark).
//   It needs only your roster, not a lineup, so it works without making the league active. A league
//   whose free agent is ranked ahead says "Upgrade: X RB5 over your Y RB8".
// - Leagues with an upgrade come first, the biggest gap in position spots first; the rest (no
//   upgrade, no rankings) fold under "Show N more leagues".
// - The card collapses, and remembers it (KEYS.mls.bestAvailableCollapsed). Its header keeps a
//   summary line ("Upgrades in 2 of 5 leagues") so it's useful closed.
//
// No second copy of the candidate logic: findFreeAgents (not in globalRosterMap, draft picks out,
// unresolvable names left out, sorted by compareForScan), rosterBenchmark, buildRankDisplayIndex
// (the RB8 numbers), makeLeagueGetPos (positions) and isFullyMappedLeague (manual leagues) are the
// waiver tools' own. Each league's rankings come from getLeagueRankings, the lookup
// hydrateRankingsForLeague uses. The Sleeper player map is read once per render (cached; no new
// network calls), as runAllLeaguesSearch does. No Would Start check: it needs the active league's
// lineup.
//
// When it draws: from renderLeagueManager (the Command Center's own render), only while the
// Dashboard is the active tab. That covers the Dashboard being shown (nav.js → refreshLeagueDropdown),
// Sync All (its finally re-renders the Command Center) and adding, importing or deleting a league.
// Rankings change on the Lineup and Roster tabs, so coming back to the Dashboard picks them up.
import { escapeHtml } from '../../shared/html.js';
import { KEYS } from '../../shared/storage/keys.js';
import { State } from '../state.js';
import { getLeagueRankings } from '../leagues/sync.js';
import { setRankingsCardExpanded } from '../rankings/engine.js';
import { buildRankDisplayIndex, compareForScan, findFreeAgents, FLEX_POSITIONS } from './waiverScanner.js';
import { getSleeperMetaByName, makeLeagueGetPos, rosterBenchmark, updateWaiverScanSetting } from './waivers.js';
import { isFullyMappedLeague } from './allLeaguesSearch.js';
import { isDraftPickName } from '../trade/valueCurve.js';
import { showTab, switchActiveLeague } from '../main.js';

    const PER_LEAGUE = 3;
    const CARD_ID = 'dashboardBestAvailable';

    const UPGRADE_ICON = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;

    // Renders are async (the player map), and Sync All asks for one per league it syncs; only the
    // newest one writes.
    let renderGen = 0;

    const dashboardShown = () => {
        const tab = document.getElementById('setupTab');
        return !!(tab && tab.classList.contains('active'));
    };

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    // The rankings a league's line uses: Weekly, else ROS, else none.
    function leagueBasis(league) {
        const weekly = getLeagueRankings(league, 'weekly');
        if (weekly && weekly.data.length > 0) return { ...weekly, name: 'Weekly' };
        const ros = getLeagueRankings(league, 'ros');
        if (ros && ros.data.length > 0) return { ...ros, name: 'ROS' };
        return null;
    }

    // "Weekly · 9/15/2026" for a set with its default name ("Weekly Rankings – 9/15/2026"),
    // "Weekly · Dynasty PPR" for a named one, "Weekly" for a legacy upload.
    function sourceLabel(basis) {
        const name = (basis.setName || '').replace(/^(Weekly|ROS) Rankings\s*[–-]\s*/i, '').trim();
        return name ? `${basis.name} · ${escapeHtml(name)}` : basis.name;
    }

    const rankText = (pos, posRank) => posRank ? `${escapeHtml(pos)}${posRank}` : `${escapeHtml(pos)}, unranked`;
    const chip = (pos, posRank) => `<span class="badge pos-badge ${escapeHtml(pos)} mls-ta-pos">${rankText(pos, posRank)}</span>`;

    // Everything a league's line needs, worked out without making it the active league.
    function analyzeLeague(league, meta) {
        const knowsWholeLeague = isFullyMappedLeague(league);
        const basis = leagueBasis(league);
        if (!basis) return { league, knowsWholeLeague, basis: null, upgrade: null };

        const getPos = makeLeagueGetPos(league, meta);
        const roster = league.globalRosterMap || {};
        const options = {
            getPos,
            isRostered: (clean) => !!roster[clean],
            isExcluded: (r) => isDraftPickName(r.name)
        };
        const { freeAgents } = findFreeAgents(basis.data, { ...options, posFilter: 'FLEX' });
        const display = buildRankDisplayIndex(basis.data, getPos);
        const posRankOf = (clean) => (display[clean] && display[clean].posRank) || null;

        const byName = {};
        basis.data.forEach(r => { if (r && r.cleanName) byName[r.cleanName] = r; });
        const rankedAtPos = {};
        basis.data.forEach(r => {
            if (!r || !r.cleanName || isDraftPickName(r.name)) return;
            const p = getPos(r.cleanName);
            if (FLEX_POSITIONS.includes(p)) rankedAtPos[p] = (rankedAtPos[p] || 0) + 1;
        });

        // The upgrade: at each position, the best free agent against your weakest rostered player
        // (who leads that position's free agents; compareForScan decides "ahead", as in Check a
        // List). The size is the gap in position ranks; an unranked player of yours counts as one
        // spot below the last ranked player there. The biggest gap is the league's upgrade.
        let upgrade = null;
        FLEX_POSITIONS.forEach(pos => {
            const best = findFreeAgents(basis.data, { ...options, posFilter: pos }).freeAgents[0];
            const { bench } = rosterBenchmark(league, getPos, byName, pos);
            if (!best || !bench || compareForScan(best, bench, pos) >= 0) return;
            const benchRank = posRankOf(bench.cleanName);
            const faRank = posRankOf(best.cleanName);
            const gap = (benchRank || (rankedAtPos[pos] || 0) + 1) - (faRank || 0);
            if (!upgrade || gap > upgrade.gap) upgrade = { pos, fa: best, faRank, bench, benchRank, gap };
        });

        return { league, knowsWholeLeague, basis, freeAgents, posRankOf, rankedAtPos, upgrade };
    }

    function leagueLineHTML(a) {
        const { league, knowsWholeLeague, basis, upgrade } = a;
        const id = escapeHtml(league.leagueId);
        const name = escapeHtml(league.name || 'Unnamed league');

        let source, body, button;
        if (!basis) {
            source = 'No rankings';
            body = `<div class="mls-ba-empty">Upload Weekly rankings on the Lineup tab (or ROS on the Roster tab) with this league active.</div>`;
            button = `<button type="button" class="btn btn-secondary mls-btn-sm" data-action="bestAvailableUpload" data-league-id="${id}" aria-label="Upload rankings for ${name}">Upload</button>`;
        } else {
            source = `${sourceLabel(basis)}${knowsWholeLeague ? '' : ' &middot; manual: not on your roster'}`;
            const top = a.freeAgents.slice(0, PER_LEAGUE);
            if (top.length > 0) {
                body = `<ol class="mls-ba-players">${top.map(fa => `<li class="mls-ba-player"><span class="mls-ba-name">${escapeHtml(fa.name)}</span> ${chip(fa.pos, a.posRankOf(fa.cleanName))}</li>`).join('')}</ol>`;
            } else {
                const ranked = FLEX_POSITIONS.reduce((n, p) => n + (a.rankedAtPos[p] || 0), 0);
                body = `<div class="mls-ba-empty">${ranked > 0
                    ? `Every RB, WR and TE in its ${basis.name} rankings (${ranked} ranked) is already ${knowsWholeLeague ? 'rostered in this league' : 'on your roster'}. A deeper rankings file would show who's left.`
                    : `Its ${basis.name} rankings don't include any RB, WR or TE.`}</div>`;
            }
            if (upgrade) {
                body = `<div class="mls-ba-upgrade">${UPGRADE_ICON}<span>Upgrade: <strong>${escapeHtml(upgrade.fa.name)}</strong> ${rankText(upgrade.pos, upgrade.faRank)} over your <strong>${escapeHtml(upgrade.bench.name)}</strong> ${rankText(upgrade.pos, upgrade.benchRank)}</span></div>` + body;
            }
            button = `<button type="button" class="btn btn-secondary mls-btn-sm" data-action="viewLeagueTopAvailable" data-league-id="${id}" aria-label="View top available in ${name}">View</button>`;
        }

        return `<li class="mls-ba-line${upgrade ? ' has-upgrade' : ''}" data-league-id="${id}">
            <div class="mls-ba-main">
                <div class="mls-ba-head"><span class="mls-ba-league">${name}</span><span class="mls-ba-source">${source}</span></div>
                ${body}
            </div>
            ${button}
        </li>`;
    }

    // The header's one-liner, readable with the card collapsed.
    function summaryText(analyses) {
        const unranked = analyses.filter(a => !a.basis).length;
        const ranked = analyses.length - unranked;
        const upgrades = analyses.filter(a => a.upgrade).length;
        const parts = [];
        if (ranked > 0) parts.push(upgrades > 0 ? `Upgrades in ${upgrades} of ${plural(ranked, 'league')}` : `No upgrades in your ${plural(ranked, 'league')}`);
        if (unranked > 0) parts.push(`${plural(unranked, 'league')} without rankings`);
        return parts.join(' · ');
    }

    export async function renderBestAvailable() {
        const card = document.getElementById(CARD_ID);
        const body = document.getElementById('bestAvailableBody');
        const summary = document.getElementById('bestAvailableSummary');
        if (!card || !body || !dashboardShown()) return;
        const gen = ++renderGen;
        card.style.display = 'block';
        setRankingsCardExpanded(CARD_ID, !isCollapsedSaved());

        let meta = {};
        if ((State.leagues || []).length > 0) {
            try {
                meta = await getSleeperMetaByName();
            } catch (e) {
                console.warn('Best available: Sleeper player map unavailable, falling back to league/market positions.', e);
            }
        }
        if (gen !== renderGen) return;

        const leagues = State.leagues || [];
        if (leagues.length === 0) {
            if (summary) summary.textContent = '';
            body.innerHTML = `<div class="mls-scan-empty">No leagues yet. Sync a Sleeper league or import all of yours under Add/Sync League below, and each league's best available players show here.</div>`;
            return;
        }

        const analyses = leagues.map(l => analyzeLeague(l, meta));
        if (summary) summary.textContent = summaryText(analyses);

        // Biggest upgrade first; ties keep the Command Center's league order (sort is stable).
        const withUpgrade = analyses.filter(a => a.upgrade).sort((x, y) => y.upgrade.gap - x.upgrade.gap);
        const rest = [...analyses.filter(a => a.basis && !a.upgrade), ...analyses.filter(a => !a.basis)];
        const anyRanked = analyses.some(a => a.basis);

        let html = `<p class="mls-ba-note">Each league by its own rankings. Ownership is from the last sync: <strong>Sync All Leagues</strong> refreshes it.</p>`;
        if (withUpgrade.length > 0) {
            html += `<ul class="mls-ba-list">${withUpgrade.map(leagueLineHTML).join('')}</ul>`;
        } else if (anyRanked) {
            html += `<div class="mls-ba-none">No free agent is ranked ahead of your weakest RB, WR or TE in any league.</div>`;
        }
        if (rest.length > 0) {
            const restList = `<ul class="mls-ba-list">${rest.map(leagueLineHTML).join('')}</ul>`;
            // With nothing above them (no league has rankings yet), the lines show unfolded.
            html += anyRanked
                ? `<details class="mls-ba-more"><summary><span class="mls-ba-when-closed">Show</span><span class="mls-ba-when-open">Hide</span> ${plural(rest.length, withUpgrade.length > 0 ? 'more league' : 'league')}</summary>${restList}</details>`
                : restList;
        }
        body.innerHTML = html;
    }

    function isCollapsedSaved() {
        try { return localStorage.getItem(KEYS.mls.bestAvailableCollapsed) === '1'; } catch (e) { return false; }
    }

    // The header's toggle. Remembered across visits; the summary line stays visible either way.
    export function toggleBestAvailable() {
        const card = document.getElementById(CARD_ID);
        if (!card) return;
        const expand = !card.classList.contains('expanded');
        setRankingsCardExpanded(CARD_ID, expand);
        try {
            if (expand) localStorage.removeItem(KEYS.mls.bestAvailableCollapsed);
            else localStorage.setItem(KEYS.mls.bestAvailableCollapsed, '1');
        } catch (e) { /* storage blocked: it still toggles for this visit */ }
    }

    // View: that league's Top Available on the Scout tab. Rank By and the position chips stay as
    // they were; showTab('scout') draws the list (onScoutTabShown).
    export function viewLeagueTopAvailable(leagueId) {
        if (!(State.leagues || []).some(l => l.leagueId === leagueId)) return;
        if (leagueId !== State.activeLeagueId) switchActiveLeague(leagueId);
        updateWaiverScanSetting('mode', 'top');
        showTab('scout');
    }

    // Upload (a league with no rankings): make it active and open the Lineup tab, where Weekly
    // rankings are uploaded.
    export function bestAvailableUpload(leagueId) {
        if (!(State.leagues || []).some(l => l.leagueId === leagueId)) return;
        if (leagueId !== State.activeLeagueId) switchActiveLeague(leagueId);
        showTab('lineup');
    }
