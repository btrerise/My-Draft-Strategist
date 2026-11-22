// --- PLAYOFF CHANCES: EACH TEAM'S WEEKLY MEAN AND SPREAD (improvements S55) ---
// Pure: unit-tested in tests/unit/playoffs.test.mjs. Owner's choice: Sleeper's projections for the week, with the
// points so far when there are none.
// - With projections: the team's best lineup by projection (bestBallLineup, the slots most specific first), its mean
//   the sum of the starters' projections and its spread from each starter's spread (the Matchup Simulator's
//   getPlayerVarianceProfile: his past weeks around the projection). A QB and his own NFL team's WRs and TEs move
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
// scores sat 26.9 points (sd) from the sum of the starters' projections, against the model's 22.2. About 8.6 of that
// lasts all season (a team that beats or misses its projections keeps doing so: LASTING_SD, drawn once per run in
// sim/playoffs.js); the rest is week to week, 1.15 times the summed per-player spreads (WEEKLY_SPREAD_SCALE).
export const WEEKLY_SPREAD_SCALE = 1.15;
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
