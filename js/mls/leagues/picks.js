// --- DRAFT PICKS BY TEAM (improvements S19, round 2) ---
// Who holds which rookie-draft pick in a Sleeper dynasty or keeper league, from Sleeper's traded picks
// (league/<id>/traded_picks), read at sync and kept on the league as league.picks. Every team starts with its
// own pick in each round of each upcoming draft; a traded pick moves to the roster that holds it now. Pure: the
// sync (leagues/sync.js) passes the rosters' owners, and the Trade Analyzer reads the result (scout/engine.js,
// trade/fairSection.js). Picks are named the way the Trade Analyzer and Market Consensus name them ("2027 1st").

const ORDINALS = ['1st', '2nd', '3rd', '4th'];
export const pickName = (season, round) => `${season} ${ORDINALS[round - 1]}`;

// A pick's key for matching, or null when the name isn't a pick. Player names are matched by normalizeName, which
// drops digits, so every "20xx 1st" would be one pick. Market Consensus (FantasyCalc) prices "2027 1st (Early)",
// "(Mid)", "(Late)" and a plain "2027 1st" separately, so the key keeps that: "2027 1st" -> "pick 2027 1st",
// "2027 1st (Early)" or "2027 Early 1st" -> "pick 2027 1st early". { tier: false } drops it, for who holds a pick
// (Sleeper's picks are plain).
const PICK_RE = /\b((?:19|20)\d{2})\b.*?\b(1st|2nd|3rd|4th)\b/i;
const TIER_RE = /\b(early|mid|late)\b/i;
export function pickKey(name, { tier = true } = {}) {
    const text = String(name || '');
    const m = PICK_RE.exec(text);
    if (!m) return null;
    const t = tier ? TIER_RE.exec(text) : null;
    return `pick ${m[1]} ${m[2].toLowerCase()}${t ? ` ${t[1].toLowerCase()}` : ''}`;
}
const slotKey = (name) => pickKey(name, { tier: false });

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
    const key = slotKey(name);
    return Object.keys(picks).filter(owner => picks[owner].some(p => slotKey(p.name) === key));
}

// A pick's worth in the Power Rankings' Future column when the market has no value for it (round 3, owner's choice:
// the market's value when dynasty Market Consensus is loaded, else this table): the overall rank of a player it
// counts like, by round (a 1st like the 48th player, a 2nd the 100th, a 3rd the 160th, a 4th the 230th), each draft
// further out 15% further down (yearsOut: 0 for the next draft).
const PICK_TABLE_RANKS = [48, 100, 160, 230];
export function tablePickRank(round, yearsOut = 0) {
    const base = PICK_TABLE_RANKS[Math.min(Math.max(round, 1), 4) - 1];
    return Math.round(base * (1 + 0.15 * Math.max(0, yearsOut)));
}

// league.picks after a trade (the Trade Analyzer's "Power Rankings after the trade"): each pick you give moves from
// you to the partner (or off the board when there's no single partner), each pick you get from the partner (else
// from whichever team holds one) to you. A pick nobody on that side holds is skipped. Moved picks carry moved: true,
// so the Future tooltip can mark them. The original is untouched.
export function picksAfterTrade(picks, { give = [], get = [], partner = null } = {}) {
    if (!picks) return picks;
    const out = Object.fromEntries(Object.entries(picks).map(([o, list]) => [o, list.slice()]));
    const take = (owner, name) => {
        const list = out[owner];
        if (!list) return null;
        const i = list.findIndex(p => slotKey(p.name) === slotKey(name));
        return i === -1 ? null : list.splice(i, 1)[0];
    };
    give.forEach(name => {
        const pk = take('You', name);
        if (pk && partner) (out[partner] = out[partner] || []).push({ ...pk, moved: true });
    });
    get.forEach(name => {
        let pk = partner ? take(partner, name) : null;
        if (!pk && !partner) {
            const holder = Object.keys(out).find(o => o !== 'You' && out[o].some(p => slotKey(p.name) === slotKey(name)));
            pk = holder ? take(holder, name) : null;
        }
        if (pk) (out.You = out.You || []).push({ ...pk, moved: true });
    });
    return out;
}
