// --- DRAFT PICKS BY TEAM (improvements S19, round 2) ---
// Who holds which rookie-draft pick in a Sleeper dynasty or keeper league, from Sleeper's traded picks
// (league/<id>/traded_picks), read at sync and kept on the league as league.picks. Every team starts with its
// own pick in each round of each upcoming draft; a traded pick moves to the roster that holds it now. Pure: the
// sync (leagues/sync.js) passes the rosters' owners, and the Trade Analyzer reads the result (scout/engine.js,
// trade/fairSection.js). Picks are named the way the Trade Analyzer and Market Consensus name them ("2027 1st").

const ORDINALS = ['1st', '2nd', '3rd', '4th'];
export const pickName = (season, round) => `${season} ${ORDINALS[round - 1]}`;

// A pick's key for matching ("2027 1st" and "2027 1st (Early)" -> "pick 2027 1st"), or null when the name isn't a
// pick. Player names are matched by normalizeName, which drops digits, so every "20xx 1st" would be one pick.
const PICK_RE = /\b((?:19|20)\d{2})\b.*?\b(1st|2nd|3rd|4th)\b/i;
export function pickKey(name) {
    const m = PICK_RE.exec(String(name || ''));
    return m ? `pick ${m[1]} ${m[2].toLowerCase()}` : null;
}

// rosters: [{ rosterId, owner }] (owner: the manager's name, "You" for you, as in globalRosterMap).
// tradedPicks: Sleeper's list ({ season, round, roster_id: whose pick it was, owner_id: the roster that has it }).
// seasons: the drafts to cover (nextDraftYears); rounds: the league's draft rounds (only 1-4 have names and values).
// Returns { [owner]: [{ name, season, round, from }] }, each list by season then round; from is the original
// team's owner when the pick came in a trade, else null. A traded pick for a roster nobody owns is left out.
export function pickOwnership({ rosters, tradedPicks, seasons, rounds = 4 }) {
    const ownerOf = new Map((rosters || []).map(r => [Number(r.rosterId), r.owner]));
    const moved = new Map();
    (tradedPicks || []).forEach(t => {
        if (!t) return;
        moved.set(`${t.season}|${t.round}|${t.roster_id}`, Number(t.owner_id));
    });
    const maxRound = Math.max(0, Math.min(Number(rounds) || 4, ORDINALS.length));
    const out = {};
    (rosters || []).forEach(r => { if (r.owner && !out[r.owner]) out[r.owner] = []; });
    (seasons || []).forEach(season => {
        for (let round = 1; round <= maxRound; round++) {
            (rosters || []).forEach(r => {
                const now = moved.get(`${season}|${round}|${r.rosterId}`);
                const holder = now ? ownerOf.get(now) : r.owner;
                if (!holder) return;
                (out[holder] = out[holder] || []).push({
                    name: pickName(season, round), season: Number(season), round,
                    from: holder === r.owner ? null : r.owner
                });
            });
        }
    });
    Object.values(out).forEach(list => list.sort((a, b) => a.season - b.season || a.round - b.round));
    return out;
}

// The teams that hold a pick with this name ("2027 1st"), from league.picks; null when the league has no
// synced picks (a redraft or manual league, or a sync from before this was read).
export function pickHolders(picks, name) {
    if (!picks) return null;
    const key = pickKey(name);
    return Object.keys(picks).filter(owner => picks[owner].some(p => pickKey(p.name) === key));
}
