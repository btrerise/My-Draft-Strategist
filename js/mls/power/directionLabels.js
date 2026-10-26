// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3F: TEAM DIRECTION LABELS
// (getPowerLeagueKind, assignPowerLabels, powerLabelAdvice).
import { powerTier } from './shared.js';

// --- TEAM DIRECTION LABELS ---
// Dynasty and keeper leagues get Contender / Retool / Rebuild; redraft (and anything else) gets
// Contender / Bubble / Longshot, since "rebuild" means nothing when rosters reset each year.
// leagueType is stored at sync (see the leagueObj in the Sleeper sync); leagues synced before
// it existed fall back to reading formatBadge.
// A keeper league plays like dynasty unless you set its League style to redraft (improvements S23, round 10:
// league.keeperStyle, the Setup tab's Active League Requirements card). Every dynasty-only feature asks this, so
// labels, Future, draft picks, the market type and In-Season rankings all follow the one setting.
export function getPowerLeagueKind(league) {
    const t = league && league.leagueType;
    if (t === 'keeper' && league.keeperStyle === 'redraft') return 'redraft';
    if (t) return (t === 'dynasty' || t === 'keeper') ? 'dynasty' : 'redraft';
    return /^(Dynasty|Keeper)\b/.test((league && league.formatBadge) || '') ? 'dynasty' : 'redraft';
}

// Labels come from the starting lineup's tier (top / middle / bottom third, as powerTier), with
// future value deciding the dynasty cases where "now" alone is ambiguous:
//   Dynasty:  top-third starters                -> Contender ("window closing" if the roster's
//                                                  future value is bottom-third)
//             middle starters                    -> Retool, unless future is bottom-third ->
//                                                  Rebuild (a mid-pack team that's also old)
//             bottom-third starters              -> Rebuild ("young core" if future is top-third)
//   Redraft:  top / middle / bottom starters     -> Contender / Bubble / Longshot
// A top-third lineup is never told to Retool: whatever the ages, the best move for one of the
// best teams in the league is to push for a title. Based on roster strength only -- not
// the standings -- which the card's notes say.
export function assignPowerLabels(teams, kind) {
    const N = teams.length;
    const hasFuture = teams.every(t => Number.isFinite(t.futureRank));
    teams.forEach(t => {
        const st = powerTier(t.starterRank, N);
        const ft = hasFuture ? powerTier(t.futureRank, N) : null;
        t.labelNote = '';
        if (kind === 'redraft') {
            t.label = st === 'strong' ? 'Contender' : (st === 'middle' ? 'Bubble' : 'Longshot');
            return;
        }
        if (st === 'strong') {
            t.label = 'Contender';
            if (ft === 'weak') t.labelNote = 'window closing';
        } else if (st === 'middle') {
            t.label = ft === 'weak' ? 'Rebuild' : 'Retool';
        } else {
            t.label = 'Rebuild';
            if (ft === 'strong') t.labelNote = 'young core';
        }
    });
}

// One sentence per label for the "Your Team" summary above the table.
export function powerLabelAdvice(t) {
    const key = t.label + (t.labelNote ? `|${t.labelNote}` : '');
    return ({
        'Contender': "Your starting lineup is one of the league's best. Depth or future value you can spare is worth turning into starters.",
        'Contender|window closing': "Your starting lineup is one of the league's best, but the roster is old. Push for a title now; this window won't stay open long.",
        'Retool': "Your lineup is mid-pack with a solid future behind it. One or two targeted starter upgrades could make you a contender, without selling your young core.",
        'Rebuild': t.starterTier === 'middle'
            ? "Your lineup is mid-pack and the roster is aging. Consider selling veterans for younger players and picks before their value drops."
            : "Your starting lineup is in the bottom third. Consider selling veterans for younger players and picks.",
        'Rebuild|young core': "Your lineup is in the bottom third now, but your future value is among the league's best. The rebuild is on track; keep adding youth.",
        'Bubble': "Your lineup is mid-pack. A starter upgrade or two could swing a playoff spot.",
        'Longshot': "Your starting lineup is in the bottom third. Take swings on upside, on waivers and in trades."
    })[key] || '';
}

// --- "I'M COMPETING THIS YEAR": THE SUGGESTION (improvements S23, round 7; the owner's rule) ---
// Starts from the team's own label (roster strength, as above) and lets the standings move it at most one step:
//   Contender -> competing; with a losing record and points for in the bottom half -> retool
//   Retool    -> retool (your call); winning record and points for in the top half -> competing;
//                losing record and points for in the bottom half -> rebuilding
//   Rebuild   -> rebuilding; winning record and points for in the top half -> retool
// Points against never moves it; with a losing record and points against in the top third (the most against you)
// it's named, as bad luck. Under MIN_GAMES games, or with no record (league.record from the sync, improvements S21:
// missing before S21, null before anyone has played and in guillotine leagues), it's the label alone.
// Pure: label 'Contender' | 'Retool' | 'Rebuild'; record league.record; starterRank your Start rank.
export const COMPETING_MIN_GAMES = 4;
export function competingSuggestion(label, record, { starterRank = null } = {}) {
    const base = { Contender: 'competing', Retool: 'retool', Rebuild: 'rebuilding' }[label];
    if (!base) return null;
    const games = record ? (record.wins || 0) + (record.losses || 0) + (record.ties || 0) : 0;
    if (!record || games < COMPETING_MIN_GAMES || !(record.of > 0)) {
        return { verdict: base, moved: false, fromRoster: true, reason: '' };
    }
    const pct = ((record.wins || 0) + (record.ties || 0) / 2) / games;
    const winning = pct > 0.5, losing = pct < 0.5;
    const pfTop = record.pfRank <= record.of / 2, pfBottom = record.pfRank > (record.of + 1) / 2;
    let verdict = base, reason = '';
    if (base === 'competing' && losing && pfBottom) { verdict = 'retool'; reason = "Your roster says contender; your results don't yet."; }
    else if (base === 'retool' && winning && pfTop) { verdict = 'competing'; reason = "You're in the race."; }
    else if (base === 'retool' && losing && pfBottom) { verdict = 'rebuilding'; reason = 'Your results say rebuild.'; }
    else if (base === 'rebuilding' && winning && pfTop) { verdict = 'retool'; reason = 'Your results beat your roster.'; }
    // Numbers only; the card words them (rosterCard.js, with allLeagues.js's ordinal).
    const unlucky = losing && record.paRank <= Math.ceil(record.of / 3);
    return { verdict, moved: verdict !== base, fromRoster: false, reason,
        record: { wins: record.wins || 0, losses: record.losses || 0, ties: record.ties || 0 },
        pfRank: record.pfRank, paRank: unlucky ? record.paRank : null, starterRank };
}
