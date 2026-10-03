// Moved from js/mds/legacy.js (the second half of the old js/mds.js) in refactor chunk 2B:
// SEND ROSTER TO LINEUP STRATEGIST.
import { State, getActiveDraft } from './state.js';
import { KEYS } from '../shared/storage/keys.js';

    // --- SEND ROSTER TO LINEUP STRATEGIST ---
    // MDS (mydraftstrategist.com) and MLS (mydraftstrategist.com/lineup/) are same-origin, so
    // they already share localStorage directly -- no URL params or backend needed. This writes
    // the drafted roster to a shared key that MLS's Setup tab checks for on load and offers to
    // import as a new league. See mls.js's checkForDraftStrategistHandoff().
    export const sendRosterToLineupStrategist = function() {
        const draft = getActiveDraft();
        if (!draft || !draft.myTeam || draft.myTeam.length === 0) {
            if (window.showToast) window.showToast("Draft a roster first before sending it to Lineup Strategist.");
            return;
        }

        const myPlayers = draft.myTeam.map(id => State.players.find(p => p.id === id)).filter(Boolean);
        const players = myPlayers.map(p => ({ name: p.name, pos: p.posGroup, team: p.team || "FA" }));

        const limits = draft.limits || {};
        // MLS doesn't have a WR/TE-only flex slot type yet -- folding W/T into FLEX keeps the
        // total roster-spot count correct, though MLS's optimizer will (for now) also consider
        // RB eligible there, unlike the stricter W/T rule this count came from.
        const reqs = {
            QB: limits.QB || 0,
            RB: limits.RB || 0,
            WR: limits.WR || 0,
            TE: limits.TE || 0,
            FLEX: (limits.FLEX || 0) + (limits.WT || 0),
            SFLEX: limits.SFLEX || 0,
            K: limits.K || 0,        // NEW
            DEF: limits.DEF || 0
        };

        const payload = {
            sourceLeagueName: draft.name || "Drafted Team",
            players: players,
            reqs: reqs,
            timestamp: Date.now()
        };

        localStorage.setItem(KEYS.shared.handoffRoster, JSON.stringify(payload));

        if (window.showToast) window.showToast(`Sending ${players.length} players to Lineup Strategist…`);
        setTimeout(() => { window.location.href = './lineup/'; }, 700);
    };
