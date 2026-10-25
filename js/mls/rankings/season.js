// SEASON RANKINGS FOR DYNASTY AND KEEPER LEAGUES (improvements S23).
// In a dynasty league the ROS slot (league.rosRankingSetId) holds the dynasty rankings, which most
// analysts update about once a month. A second slot, Season (league.seasonRankingSetId), points at
// any saved ROS set -- usually the one the redraft leagues use -- for the questions about this
// season: Power Rankings' Start (and so the labels), the lineup when no Weekly set is loaded, and
// the Waiver Wire's "In-Season Rank". No new set type and no new storage key: the id lives on the
// league object, which is saved, synced over and backed up with the rest of it.
//
// One resolver: "this season's rankings for this league" = its In-Season set, else today's ROS
// rankings. So a league with no In-Season set (every redraft league, and a dynasty league that hasn't
// picked one) reads exactly what it read before.
//
// league.powerCompeting (the Power Rankings card's "I'm competing this year"): Ovr and the
// QB/RB/WR/TE columns read the In-Season set too. Off by default; Future always reads the dynasty set.
//
// Pure: callers pass the saved ROS sets (State.rankingSets.ros) in. leagues/sync.js wraps these for
// the app.
import { getPowerLeagueKind } from '../power/directionLabels.js';

export const SEASON_SET_KEY = 'seasonRankingSetId';

// "In-Season" for plain text (toasts, dialogs): a word joiner after the hyphen keeps a narrow toast from breaking the
// word in two. Markup uses <span class="mls-nowrap">In-Season</span> instead.
export const IN_SEASON = 'In-\u2060Season';

// Only dynasty and keeper leagues have the slot (the Power Rankings' own rule).
export function hasSeasonSlot(league) {
    return !!league && getPowerLeagueKind(league) === 'dynasty';
}

// The saved set a league's In-Season slot points at, or null: not a dynasty league, nothing chosen, or
// the set no longer exists.
// The league's own dynasty set counts as none (round 5): reading it "for this season" changes nothing, and naming it
// twice in the key and the hint only confused; the picker doesn't offer it.
export function seasonSetFor(league, rosSets) {
    if (!hasSeasonSlot(league)) return null;
    const id = league[SEASON_SET_KEY];
    if (!id || id === league.rosRankingSetId) return null;
    return (rosSets || []).find(s => s.id === id && Array.isArray(s.data)) || null;
}

// This season's rankings for one league. rosFound: what the league's ROS slot resolves to today
// (getLeagueRankings(league, 'ros'): { data, updatedAt, setName } or null). Returns the same shape
// plus fromSeason, or null when neither exists.
export function resolveSeasonRankings(league, rosSets, rosFound) {
    const set = seasonSetFor(league, rosSets);
    if (set) return { data: set.data, updatedAt: set.updatedAt || null, setName: set.name || null, fromSeason: true };
    return rosFound ? { ...rosFound, fromSeason: false } : null;
}

// The Season part of a league's rankings stamp: '' with no In-Season set, so the stamp of every league
// without one is exactly what it was before S23 (no needless re-optimizing after the update).
export function seasonStamp(league, rosSets) {
    const set = seasonSetFor(league, rosSets);
    return set ? `|season:${set.id}@${set.updatedAt || 0}` : '';
}

// Whether Ovr and the room columns read the In-Season set: only when "I'm competing" is on and there
// is an In-Season set to read.
export function roomsUseSeason(league, rosSets) {
    return !!(league && league.powerCompeting && seasonSetFor(league, rosSets));
}

// How many leagues use a ROS set in either slot, and how many of those as In-Season (for the set's
// "Used in N of M leagues (k as In-Season)" line).
export function setUsage(setId, leagues) {
    let used = 0, asSeason = 0;
    (leagues || []).forEach(l => {
        const season = hasSeasonSlot(l) && l[SEASON_SET_KEY] === setId && l.rosRankingSetId !== setId;
        if (season) asSeason++;
        if (season || l.rosRankingSetId === setId) used++;
    });
    return { used, asSeason };
}

// The set to offer an empty In-Season slot: the ROS set the most redraft leagues use (ties: the most
// recently updated), or null when no redraft league has one. Never the league's own dynasty set.
export function seasonOffer(league, leagues, rosSets) {
    if (!hasSeasonSlot(league) || seasonSetFor(league, rosSets)) return null;
    const counts = new Map();
    (leagues || []).forEach(l => {
        if (hasSeasonSlot(l) || !l.rosRankingSetId) return;
        counts.set(l.rosRankingSetId, (counts.get(l.rosRankingSetId) || 0) + 1);
    });
    const ranked = (rosSets || [])
        .filter(s => counts.has(s.id) && s.id !== league.rosRankingSetId)
        .sort((a, b) => counts.get(b.id) - counts.get(a.id) || (b.updatedAt || 0) - (a.updatedAt || 0));
    return ranked[0] || null;
}

// The other dynasty and keeper leagues with no In-Season set (the offer's "Also use it in all N?").
export function leaguesWithoutSeason(leagues, rosSets, exceptId) {
    return (leagues || []).filter(l => l.leagueId !== exceptId && hasSeasonSlot(l) && !seasonSetFor(l, rosSets));
}
