// --- A SUGGESTED FAAB BID (improvements S35) ---
// Pure: inputs in, a range and its reasons out; no DOM, no State. The history comes from scout/faabHistory.js, the
// player's rank and your need from the caller (Best available, Auto-Find, Check a List).
//
// The model (owner's choices, 2026-11-14):
//   - Base: the league's winning bids this season, as a share of the budget (so a 1,000 league reads like a 100 one),
//     for players at the same position ranked within RANK_BAND spots of him today. The app only has today's ranks, so a
//     bid is matched by the player's rank now, not when it was placed, and the reasons say so. The range runs from
//     their median to their 75th percentile. With fewer than MIN_COMPARABLES it widens: any rank at the position, then
//     every winning bid (never another position's bids near his rank: round 2); the reasons say which. Only the last
//     (every position) is marked as a rough guess, "≈ Bid 2–5" (round 3: with the whole position marked too, ~80% of
//     the owner's real claims would have been).
//   - Your budget: what you have left over the league's average left, kept within 0.6 to 1.5.
//   - Weeks left: redraft, keeper and guillotine leagues up to ×1.5 in the last week (money left is worth less late in
//     a season); dynasty flat.
//   - Need: ×1.5 when he fills an empty starting spot, ×1.25 when he'd start for you, ×0.5 when the lineup check says he
//     wouldn't (a stash; round 2), else ×1. Best available shows bids on its upgrades only (round 2).
//   - Whole numbers, never more than you have left; the top at least one step (1% of the budget, at least 1) above the
//     bottom, since most winning bids are 0 and a tie loses to the waiver order.
// In the owner's 15 FAAB leagues (weeks 1-10 of 2026, ~1,600 winning claims) 73% of claims had one bidder and the
// median winning bid was 0-2% of the budget, so "Bid 0-2" is often the honest answer.

// Round 3 (owner): ±12. Against the owner's real claims (weeks 1-10), ±6 found 4 other winning bids at the position for
// 20% of them, ±12 for 39%.
export const RANK_BAND = 12;
export const MIN_COMPARABLES = 4;
const NEED_FACTOR = { empty: 1.5, starts: 1.25, bench: 0.5 };
const POS_NAME = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DEF: 'DEF' };

const article = (pos) => (/^[AEFHILMNORSX]/.test(pos) ? 'an' : 'a');
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// The p-th quantile (0..1) of a sorted list, nearest rank.
function quantile(sorted, p) {
    if (sorted.length === 0) return 0;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

// Winning FAAB claims from Sleeper's transactions (any number of weeks' lists): [{ playerId, bid, at, rosterId }].
// Only completed waiver claims with a number for `settings.waiver_bid`.
export function winningBids(lists) {
    const out = [];
    (lists || []).flat().forEach(tx => {
        if (!tx || tx.type !== 'waiver' || tx.status !== 'complete' || !tx.adds) return;
        const bid = tx.settings && typeof tx.settings.waiver_bid === 'number' ? tx.settings.waiver_bid : null;
        if (bid === null) return;
        Object.keys(tx.adds).forEach(pid => out.push({ playerId: pid, bid, at: Number(tx.status_updated || tx.created) || 0, rosterId: tx.adds[pid] }));
    });
    return out;
}

// The league's last fantasy week: the playoffs' last week (Sleeper's playoff_week_start and a round for each halving of
// playoff_teams), else 17.
export function seasonLastWeek(settings) {
    const start = settings && Number(settings.playoff_week_start);
    if (!(start > 0)) return 17;
    const teams = Number(settings.playoff_teams) || 6;
    return start + Math.max(1, Math.ceil(Math.log2(teams))) - 1;
}

// Each roster's FAAB left: { rosterId: budget - waiver_budget_used }. Sleeper's rosters carry `settings.waiver_budget_used`.
export function faabLeftFrom(rosters, budget) {
    if (!Array.isArray(rosters) || !(budget > 0)) return null;
    const out = {};
    rosters.forEach(r => {
        const used = r && r.settings && typeof r.settings.waiver_budget_used === 'number' ? r.settings.waiver_budget_used : 0;
        if (r && r.roster_id != null) out[r.roster_id] = Math.max(0, budget - used);
    });
    return out;
}

function weeksFactor(kind, weeksLeft, totalWeeks) {
    if (kind === 'dynasty' || !(totalWeeks > 0) || !(weeksLeft >= 0)) return 1;
    return clamp(1 + 0.5 * (1 - Math.min(weeksLeft, totalWeeks) / totalWeeks), 1, 1.5);
}

// The comparable bids for a player, widening until there are enough. bids: [{ pos, posRank (today's, or null), bid }].
// Round 2 (owner): never another position's bids near his rank (RB and WR prices differ a lot in the owner's leagues):
// his rank band, else every bid at his position, else every bid. Only every bid is a rough guess (round 3).
function comparables(bids, pos, posRank, budget) {
    const pct = (list) => list.map(b => b.bid / budget).sort((x, y) => x - y);
    const posName = POS_NAME[pos] || pos;
    const plural = `${posName}s`;
    const atPos = bids.filter(b => b.pos === pos);
    if (posRank) {
        const same = atPos.filter(b => b.posRank && Math.abs(b.posRank - posRank) <= RANK_BAND);
        if (same.length >= MIN_COMPARABLES) {
            return { scope: 'band', pcts: pct(same), label: `Similar ${plural} this season (${posName}${Math.max(1, posRank - RANK_BAND)}–${posRank + RANK_BAND} today)` };
        }
        if (atPos.length >= MIN_COMPARABLES) {
            return { scope: 'pos', pcts: pct(atPos), label: `Too few bids for ${plural} near ${posName}${posRank} (${same.length}); every ${posName} this season` };
        }
    } else if (atPos.length >= MIN_COMPARABLES) {
        return { scope: 'pos', pcts: pct(atPos), label: `He isn't in your rankings; every ${posName} this season` };
    }
    return { scope: 'all', pcts: pct(bids), label: `${atPos.length ? `Too few winning bids for ${article(posName)} ${posName} (${atPos.length})` : `No winning bids for ${article(posName)} ${posName} yet`}; every position this season` };
}

const NOTICEABLE = 0.05; // an adjustment under 5% isn't worth a line

// The suggestion. Returns null when the league isn't FAAB or the inputs are missing; { noHistory: true, reasons } when
// nobody has won a claim with a bid yet; else { low, high, left, budget, scope, rough, factor, outbid, lines, reasons }.
//   pos, posRank: the player's position and his rank there today (null when unranked).
//   budget: the league's FAAB budget. left: { rosterId: FAAB left } (faabLeftFrom). myRosterId: yours.
//   bids: the season's winning bids [{ pos, posRank, bid }] (posRank by today's ranks, null when unranked).
//   kind: 'redraft' | 'keeper' | 'dynasty' | 'guillotine'. week: this NFL week. lastWeek: seasonLastWeek.
//   need: 'empty' | 'starts' | 'bench' | null; over: whom he'd replace in your lineup (a name, for 'starts').
//   minBid: the league's minimum bid (0).
// lines: [{ kind: 'base' | 'up' | 'down' | 'note', text }] for the tap's sheet; reasons: the same as plain text.
export function suggestBid({ pos, posRank = null, budget, left, myRosterId, bids, kind = 'redraft', week, lastWeek = 17, need = null, over = null, minBid = 0 }) {
    if (!(budget > 0) || !left || myRosterId == null || left[myRosterId] == null || !pos) return null;
    const mine = left[myRosterId];
    const all = Object.values(left);
    const avgLeft = all.length ? all.reduce((s, x) => s + x, 0) / all.length : 0;
    const withBid = (bids || []).filter(b => b && typeof b.bid === 'number');
    if (withBid.length === 0) {
        return { noHistory: true, left: mine, budget, reasons: ['No winning FAAB bids in this league this season yet, so no suggestion.'] };
    }

    const comp = comparables(withBid, pos, posRank, budget);
    const med = quantile(comp.pcts, 0.5);
    const p75 = quantile(comp.pcts, 0.75);
    const lo = comp.pcts[0];
    const top = comp.pcts[comp.pcts.length - 1];

    const fBudget = avgLeft > 0 ? clamp(mine / avgLeft, 0.6, 1.5) : 1;
    const weeksLeft = Number(week) > 0 ? Math.max(0, lastWeek - week + 1) : null;
    const fWeeks = weeksLeft === null ? 1 : weeksFactor(kind, weeksLeft, lastWeek);
    const fNeed = NEED_FACTOR[need] || 1;
    const factor = fBudget * fWeeks * fNeed;

    const step = Math.max(1, Math.round(budget * 0.01));
    const cap = Math.max(0, mine);
    let low = clamp(Math.round(med * factor * budget), minBid, cap);
    let high = clamp(Math.round(p75 * factor * budget), low, cap);
    if (high < low + step) high = Math.min(cap, low + step);
    if (low > high) low = high;

    const money = (p) => Math.round(p * budget);
    const lines = [];
    const range = money(lo) === money(top) ? `${money(top)}` : `${money(lo)} to ${money(top)}`;
    lines.push({ kind: 'base', text: `${comp.label}: ${comp.pcts.length} won, ${range}, median ${money(med)}` });
    // What the two ends mean (round 3): the range is the median and the 75th percentile of these winning bids, then
    // adjusted, so it says the unadjusted amounts. "Matched", not "won": a winning bid is what the winner paid, not what
    // it took.
    lines.push({ kind: 'note', text: money(med) === money(p75)
        ? `Before the adjustments: ${money(med)} would have matched at least 3 in 4 of these winning bids`
        : `Before the adjustments: ${money(med)} would have matched about half of these winning bids, ${money(p75)} about 3 in 4` });
    if (need === 'empty') lines.push({ kind: 'up', text: 'He\'d fill an empty starting spot' });
    else if (need === 'starts') lines.push({ kind: 'up', text: over ? `He'd start for you, over ${over}` : 'He\'d start for you' });
    else if (need === 'bench') lines.push({ kind: 'down', text: 'He wouldn\'t start for you now: a stash' });
    if (fBudget >= 1 + NOTICEABLE) lines.push({ kind: 'up', text: `You have more left than the league average (${Math.round(avgLeft)})` });
    else if (fBudget <= 1 - NOTICEABLE) lines.push({ kind: 'down', text: `You have less left than the league average (${Math.round(avgLeft)})` });
    if (fWeeks >= 1 + NOTICEABLE) lines.push({ kind: 'up', text: `${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'} left: money left over is worth less late in the season` });
    if (cap === 0) lines.push({ kind: 'down', text: 'You have no FAAB left: only a 0 bid is possible' });
    const richer = Object.entries(left).filter(([id, x]) => String(id) !== String(myRosterId) && x > high).map(([, x]) => x).sort((a, b) => b - a);
    const amounts = richer.slice(0, 3);
    const listed = amounts.length <= 1 ? `${amounts[0]}` : `${amounts.slice(0, -1).join(', ')} and ${amounts[amounts.length - 1]}`;
    lines.push({ kind: 'note', text: richer.length === 0 ? `No other team has more than ${high} left`
        : `${richer.length} ${richer.length === 1 ? 'team' : 'teams'} can outbid ${high} (${listed}${richer.length > 3 ? ', …' : ''} left)` });
    lines.push({ kind: 'note', text: 'Ranks are today\'s; the bids were placed earlier.' });
    return { low, high, left: mine, budget, scope: comp.scope, rough: comp.scope === 'all' && cap > 0, factor, outbid: richer.length, lines,
        reasons: lines.map(l => l.text.replace(/\.?$/, '.')) };
}

// The short label on a line: "Bid 9–14", "Bid 0" when the range is one number, "≈ Bid 2–5" when it's a rough guess,
// "Bid 0 · none left" when you have nothing left (round 3).
export function bidLabel(s) {
    if (!s || s.noHistory) return '';
    if (s.left === 0) return 'Bid 0 · none left';
    return `${s.rough ? '≈ ' : ''}${s.low === s.high ? `Bid ${s.low}` : `Bid ${s.low}–${s.high}`}`;
}

// The sheet's title, naming the player (round 3): "James Cook · Bid 13–21".
export function bidTitle(s, name = '') {
    if (!s || s.noHistory) return '';
    return name ? `${name} · ${bidLabel(s)}` : bidLabel(s);
}

// The sheet's first line, naming the league (round 3): "Fixture League · you have 63 of 100".
export function bidWhere(s, leagueName = '') {
    if (!s || s.noHistory) return '';
    return `${leagueName ? `${leagueName} · ` : ''}you have ${s.left} of ${s.budget}`;
}

// The tap text: "Suggested bid 9–14 of your 63 (budget 100). …reasons".
export function bidTip(s) {
    if (!s) return '';
    if (s.noHistory) return s.reasons.join(' ');
    return `Suggested bid ${s.low === s.high ? s.low : `${s.low}–${s.high}`} of your ${s.left} left (budget ${s.budget}). ${s.reasons.join(' ')}`;
}
