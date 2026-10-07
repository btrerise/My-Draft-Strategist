// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3B: DRAFT STRATEGIST
// ROSTER HANDOFF.
import { addLeagueAndOpen } from './sync.js';
import { KEYS } from '../../shared/storage/keys.js';
import { normalizeName } from '../../shared/names.js';
import { showToast } from '../../shared/ui/toast.js';

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
        localStorage.removeItem(KEYS.shared.handoffRoster);

        const banner = document.getElementById('handoffBanner');
        if (banner) banner.style.display = 'none';

        // Opens it like a league switch, which loads its own rankings (none yet) instead of
        // leaving the previous league's in State (improvements F4).
        addLeagueAndOpen(leagueObj);

        showToast(`Imported "${leagueObj.name}" with ${roster.length} players.`);
    };

    export const dismissDraftStrategistHandoff = function() {
        localStorage.removeItem(KEYS.shared.handoffRoster);
        const banner = document.getElementById('handoffBanner');
        if (banner) banner.style.display = 'none';
    };
