// --- BEST AVAILABLE IN YOUR LEAGUES (Dashboard card, under the League Command Center) ---
// Added in improvements card S5. Top Available (scout/topAvailable.js) answers "who's the best
// player nobody has?" for the active league; this answers it for every league at once: one line
// per league with its top 3 available RB/WR/TE, ranked by that league's own rankings (its Weekly
// set, else its ROS set), and a View button that opens that league's Top Available.
//
// Owner's choices before building: top 3 per league; RB/WR/TE only, ordered the way Top Available's
// FLEX view orders them (FLEX rank for Weekly, overall for ROS), because Weekly sheets give QB, K and
// DEF only a position rank and so have no single order with the rest; a position-rank chip
// ("RB8") with no tier; and the card is always open.
//
// No second copy of the candidate logic: findFreeAgents (not in globalRosterMap, draft picks out,
// unresolvable names left out, sorted by compareForScan), buildRankDisplayIndex (the RB8 numbers),
// makeLeagueGetPos (positions) and isFullyMappedLeague (manual leagues) are the waiver tools' own.
// Each league's rankings come from getLeagueRankings, the lookup hydrateRankingsForLeague uses, so
// no league is made active to draw its line. The Sleeper player map is read once per render
// (cached; no new network calls), as runAllLeaguesSearch does. No Would Start check: it needs the
// active league's lineup.
//
// When it draws: from renderLeagueManager (the Command Center's own render), only while the
// Dashboard is the active tab. That covers the Dashboard being shown (nav.js → refreshLeagueDropdown),
// Sync All (its finally re-renders the Command Center) and adding, importing or deleting a league.
// Rankings change on the Lineup and Roster tabs, so coming back to the Dashboard picks them up.
import { escapeHtml } from '../../shared/html.js';
import { State } from '../state.js';
import { getLeagueRankings } from '../leagues/sync.js';
import { buildRankDisplayIndex, findFreeAgents, FLEX_POSITIONS } from './waiverScanner.js';
import { getSleeperMetaByName, makeLeagueGetPos, updateWaiverScanSetting } from './waivers.js';
import { isFullyMappedLeague } from './allLeaguesSearch.js';
import { isDraftPickName } from '../trade/valueCurve.js';
import { showTab, switchActiveLeague } from '../main.js';

    const PER_LEAGUE = 3;

    // Renders are async (the player map), and Sync All asks for one per league it syncs; only the
    // newest one writes.
    let renderGen = 0;

    const dashboardShown = () => {
        const tab = document.getElementById('setupTab');
        return !!(tab && tab.classList.contains('active'));
    };

    // The rankings a league's line uses: Weekly, else ROS, else none.
    function leagueBasis(league) {
        const weekly = getLeagueRankings(league, 'weekly');
        if (weekly && weekly.data.length > 0) return { ...weekly, name: 'Weekly' };
        const ros = getLeagueRankings(league, 'ros');
        if (ros && ros.data.length > 0) return { ...ros, name: 'ROS' };
        return null;
    }

    function playerHTML(fa, display) {
        const d = display[fa.cleanName] || {};
        const posRank = d.posRank ? `${escapeHtml(fa.pos)}${d.posRank}` : escapeHtml(fa.pos);
        return `<li class="mls-ba-player"><span class="mls-ba-name">${escapeHtml(fa.name)}</span> <span class="badge pos-badge ${escapeHtml(fa.pos)} mls-ta-pos">${posRank}</span></li>`;
    }

    function leagueLineHTML(league, meta) {
        const id = escapeHtml(league.leagueId);
        const name = escapeHtml(league.name || 'Unnamed league');
        const knowsWholeLeague = isFullyMappedLeague(league);
        const basis = leagueBasis(league);

        let source, body, button;
        if (!basis) {
            source = 'No rankings';
            body = `<div class="mls-ba-empty">No rankings for this league yet. Upload Weekly rankings on the Lineup tab (or ROS rankings on the Roster tab) with this league active.</div>`;
            button = `<button type="button" class="btn btn-secondary mls-btn-sm" data-action="bestAvailableUpload" data-league-id="${id}" aria-label="Upload rankings for ${name}">Upload</button>`;
        } else {
            source = `${basis.name} rankings${basis.setName ? ` (${escapeHtml(basis.setName)})` : ''}${knowsWholeLeague ? '' : ' &middot; not on your roster'}`;
            const getPos = makeLeagueGetPos(league, meta);
            const roster = league.globalRosterMap || {};
            const { freeAgents } = findFreeAgents(basis.data, {
                posFilter: 'FLEX',
                getPos,
                isRostered: (clean) => !!roster[clean],
                isExcluded: (r) => isDraftPickName(r.name)
            });
            if (freeAgents.length > 0) {
                const display = buildRankDisplayIndex(basis.data, getPos);
                body = `<ol class="mls-ba-players">${freeAgents.slice(0, PER_LEAGUE).map(fa => playerHTML(fa, display)).join('')}</ol>`;
            } else {
                const ranked = basis.data.filter(r => r && r.cleanName && !isDraftPickName(r.name) && FLEX_POSITIONS.includes(getPos(r.cleanName))).length;
                body = `<div class="mls-ba-empty">${ranked > 0
                    ? `Every RB, WR and TE in its ${basis.name} rankings (${ranked} ranked) is already ${knowsWholeLeague ? 'rostered in this league' : 'on your roster'}. A deeper rankings file would show who's left.`
                    : `Its ${basis.name} rankings don't include any RB, WR or TE.`}</div>`;
            }
            button = `<button type="button" class="btn btn-secondary mls-btn-sm" data-action="viewLeagueTopAvailable" data-league-id="${id}" aria-label="View top available in ${name}">View</button>`;
        }

        return `<li class="mls-ba-line" data-league-id="${id}">
            <div class="mls-ba-main">
                <div class="mls-ba-head"><span class="mls-ba-league">${name}</span><span class="mls-ba-source">${source}</span></div>
                ${body}
            </div>
            ${button}
        </li>`;
    }

    export async function renderBestAvailable() {
        const card = document.getElementById('dashboardBestAvailable');
        const body = document.getElementById('bestAvailableBody');
        if (!card || !body || !dashboardShown()) return;
        const gen = ++renderGen;
        card.style.display = 'block';

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
            body.innerHTML = `<div class="mls-scan-empty">No leagues yet. Sync a Sleeper league or import all of yours under Add/Sync League below, and each league's best available players show here.</div>`;
            return;
        }

        const notes = [];
        if (leagues.some(isFullyMappedLeague)) notes.push(`Ownership is from each league's last sync: tap <strong>Sync All Leagues</strong> above if a recent add or drop is missing.`);
        if (leagues.some(l => !isFullyMappedLeague(l))) notes.push(`Manual leagues only know your own roster, so their players may be on other teams.`);
        body.innerHTML = `<p class="mls-ba-note">Top ${PER_LEAGUE} RB/WR/TE in each league, by that league's own rankings (Weekly, else ROS). ${notes.join(' ')}</p>
            <ul class="mls-ba-list">${leagues.map(l => leagueLineHTML(l, meta)).join('')}</ul>`;
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
