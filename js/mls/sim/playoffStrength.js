// --- PLAYOFF CHANCES: EACH TEAM'S WEEKLY MEAN AND SPREAD (improvements S55) ---
// Pure: unit-tested in tests/unit/playoffs.test.mjs. Owner's choice: Sleeper's projections for the week, with the
// points so far when there are none.
// - With projections: the team's best lineup by projection (bestBallLineup, the slots most specific first), its mean
//   the sum of the starters' projections and its spread from each starter's spread (the Matchup Simulator's
//   getPlayerVarianceProfile; with no past weeks given, as since round 8, 40% of his projection). A QB and his own NFL team's WRs and TEs move
//   together, as in sim/worker.js (QB_STACK_CORRELATION), which widens the spread.
// - Without (no projections for the week, or nobody projected): points for per week played so far, and a spread of
//   PF_SPREAD_CV of that.
import { bestBallLineup } from '../week/playerRecap.js';
import { getPlayerVarianceProfile } from './stats.js';

// Keep in step with sim/worker.js's own constant.
export const QB_STACK_CORRELATION = 0.35;
// A team's week-to-week spread as a share of its average (fantasy teams typically swing 15-20%).
export const PF_SPREAD_CV = 0.18;
// Calibrated (S55 round 2) on the owner's 13 head-to-head leagues, weeks 2-10 of 2026 (1,312 team-weeks): actual
// scores sat 26.9 points (sd) from the sum of the starters' projections. About 8.6 of that lasts all season (a team that
// beats or misses its projections keeps doing so: LASTING_SD, drawn once per run in sim/playoffs.js); the rest, 25.5, is
// week to week: 1.5 times the summed per-player spreads at 40% of each projection (WEEKLY_SPREAD_SCALE; round 8, owner's
// choice: no past weekly scores, which in a backtest of the owner's 655 games predicted no better, Brier 0.1861 against
// 0.1862, and cost a slow phone 1-2 s; it was 1.15 on spreads from past weeks).
export const WEEKLY_SPREAD_SCALE = 1.5;
export const LASTING_SD = 8.6;

/**
 * slots: the league's starting slots (league.starterSlots); playerIds: the roster.
 * projOf(id) -> number | undefined; posOf(id) -> fantasy position | null; teamOf(id) -> NFL team | null;
 * historyOf(id) -> [past weekly scores] (may be empty: the Simulator's fallback spread then applies).
 * Returns [mean, sd], or null when nobody in the lineup is projected.
 */
export function projectedStrength(slots, playerIds, { projOf, posOf, teamOf = () => null, historyOf = () => [] }) {
    if (!Array.isArray(slots) || !slots.length || !Array.isArray(playerIds)) return null;
    const pts = (id) => { const v = projOf(id); return typeof v === 'number' && v > 0 ? v : 0; };
    const lineup = [...bestBallLineup(slots, playerIds, pts, posOf)].filter(id => pts(id) > 0);
    if (!lineup.length) return null;
    let mean = 0, variance = 0;
    const sds = new Map();
    lineup.forEach(id => {
        const p = getPlayerVarianceProfile(historyOf(id) || [], { projectedMean: pts(id) });
        mean += p.mean;
        variance += p.stdDev * p.stdDev;
        sds.set(id, p.stdDev);
    });
    // Stacks: every pair within a QB-and-pass-catchers group on one NFL team shares the correlation (worker.js's model).
    const byTeam = new Map();
    lineup.forEach(id => {
        const pos = posOf(id), team = teamOf(id);
        if (!team || !['QB', 'WR', 'TE'].includes(pos)) return;
        if (!byTeam.has(team)) byTeam.set(team, []);
        byTeam.get(team).push(id);
    });
    byTeam.forEach(ids => {
        if (ids.length < 2 || !ids.some(id => posOf(id) === 'QB') || !ids.some(id => posOf(id) !== 'QB')) return;
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) variance += 2 * QB_STACK_CORRELATION * sds.get(ids[i]) * sds.get(ids[j]);
        }
    });
    return [mean, Math.sqrt(variance) * WEEKLY_SPREAD_SCALE];
}

// From points for: [mean, sd] per week played, or null before any week.
export function pointsForStrength(pf, weeksPlayed) {
    if (!(weeksPlayed > 0) || !(pf > 0)) return null;
    const mean = pf / weeksPlayed;
    return [mean, mean * PF_SPREAD_CV];
}

/**
 * This week's score once its games are under way (round 4), each starter as the Matchup Simulator counts him: his final
 * points, his points so far plus the rest of his game while it's on (shareLeft), or his projection before kickoff.
 * players: [{ id, actual: number | null (set once his game kicked off), shareLeft: 0-1, projected: number | null,
 * excluded (Out, IR, on bye: left out until he plays) }]. historyOf(id) -> past weekly scores.
 * Returns [mean, sd, share]: share is the part of the week's projected points still to play (0-1), which scales the
 * lasting miss (a week that's mostly played can't be off by much more).
 */
export function liveStrength(players, { historyOf = () => [] } = {}) {
    let mean = 0, variance = 0, planned = 0, left = 0;
    (players || []).forEach(p => {
        const actual = typeof p.actual === 'number' ? p.actual : null;
        const projected = typeof p.projected === 'number' && p.projected > 0 ? p.projected : null;
        if (actual === null && (p.excluded || projected === null)) return;
        const prof = getPlayerVarianceProfile(historyOf(p.id) || [], { projectedMean: projected, actualScore: actual, shareLeft: p.shareLeft || 0 });
        mean += prof.mean;
        variance += prof.stdDev * prof.stdDev;
        const full = projected ?? 0;
        planned += full;
        left += actual === null ? full : full * Math.min(p.shareLeft || 0, 1);
    });
    return [mean, Math.sqrt(variance) * WEEKLY_SPREAD_SCALE, planned > 0 ? left / planned : 0];
}
