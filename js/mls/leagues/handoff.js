// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3B: DRAFT STRATEGIST
// ROSTER HANDOFF.
import { State } from '../state.js';
import { loadActiveLeagueData, refreshLeagueDropdown } from './sync.js';
import { KEYS } from '../../shared/storage/keys.js';

    // --- DRAFT STRATEGIST ROSTER HANDOFF ---
    // Counterpart to sendRosterToLineupStrategist() in js/mds/handoff.js. Same-origin localStorage
    // is the transport -- see that function's comment for why no URL params/backend are needed.
    export function checkForDraftStrategistHandoff() {
        const raw = localStorage.getItem(KEYS.shared.handoffRoster);
        if (!raw) return;

        let payload;
        try { payload = JSON.parse(raw); } catch (e) { localStorage.removeItem(KEYS.shared.handoffRoster); return; }
        if (!payload || !Array.isArray(payload.players) || payload.players.length === 0) {
            localStorage.removeItem(KEYS.shared.handoffRoster);
            return;
        }

        const banner = document.getElementById('handoffBanner');
        const textEl = document.getElementById('handoffBannerText');
        if (textEl) {
            textEl.innerHTML = `<strong>Roster found from My Draft Strategist:</strong> "${payload.sourceLeagueName}" (${payload.players.length} players). Import it as a new league here?`;
        }
        if (banner) banner.style.display = 'flex';
    }

    export const importDraftStrategistRoster = function() {
        const raw = localStorage.getItem(KEYS.shared.handoffRoster);
        if (!raw) return;
        let payload;
        try { payload = JSON.parse(raw); } catch (e) { return; }

        let newId = 'handoff_' + Date.now();
        let roster = [];
        let globalRosterMap = {};
        payload.players.forEach((p, i) => {
            let clean = normalizeName(p.name);
            let newP = { id: 'p_' + Date.now() + '_' + i, name: p.name, cleanName: clean, pos: p.pos || 'FLEX', team: p.team || 'FA' };
            roster.push(newP);
            globalRosterMap[clean] = "You";
        });

        let leagueObj = {
            leagueId: newId, name: payload.sourceLeagueName || "Drafted Team", username: "From Draft Strategist",
            reqs: payload.reqs || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SFLEX: 0, K: 1, DEF: 1 },
            roster: roster, globalRosterMap: globalRosterMap,
            rosRankings: [], weeklyRankings: [], rosRankingsUpdatedAt: null, weeklyRankingsUpdatedAt: null,
            rosRankingSetId: null, weeklyRankingSetId: null
        };
        State.leagues.push(leagueObj);
        State.activeLeagueId = newId;
        localStorage.setItem(KEYS.mls.leagues, JSON.stringify(State.leagues));
        localStorage.setItem(KEYS.mls.activeLeague, State.activeLeagueId);
        localStorage.removeItem(KEYS.shared.handoffRoster);

        const banner = document.getElementById('handoffBanner');
        if (banner) banner.style.display = 'none';

        refreshLeagueDropdown();
        const leagueSelect = document.getElementById('headerLeagueSelect');
        if (leagueSelect) leagueSelect.value = newId;
        loadActiveLeagueData();

        if (window.showToast) window.showToast(`Imported "${leagueObj.name}" with ${roster.length} players.`);
    };

    export const dismissDraftStrategistHandoff = function() {
        localStorage.removeItem(KEYS.shared.handoffRoster);
        const banner = document.getElementById('handoffBanner');
        if (banner) banner.style.display = 'none';
    };
