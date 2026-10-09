// Injury statuses for manual and Draft Strategist hand-off leagues (improvements S11, round 4). Their players
// are typed by hand, so nothing records an injury on them; Sleeper still knows each real NFL player's status,
// matched here by name (and team or position when several share a name). Sync All runs this with its fresh player
// map, then re-optimizes those leagues, so the optimizer and the "lineups need you" boxes see Out players there
// too. Moved from the Global Injury Auditor (js/mls/lineup/injuryAudit.js, removed in this round), which did the
// same lookup on demand.
import { normalizeName } from '../../shared/names.js';
import { fantasyPosition } from '../constants.js';
import { getShortInjuryStatus, isBestBallLeague } from '../helpers.js';

export const isManualLeague = (l) => !!(l && l.leagueId && /^(manual|handoff)_/.test(l.leagueId));

// Clean name -> raw Sleeper player entries, built over a player map the caller already has in
// hand (Sync All's force-refreshed one) rather than the session-cached name indexes -- an injury
// check specifically wants today's statuses, not whatever was cached when some earlier feature
// first needed a name lookup.
//
// Values are ARRAYS of candidates, unlike getCleanNameToIdIndex's one id per name (its general
// preference, isPreferredSleeperEntry in players.js, can't know which player a manual entry
// means): manual players carry a position and team the caller can disambiguate with (see
// resolveManualPlayer), and picking a retired namesake here wouldn't just mislabel a row, it
// would report the wrong injury status for somebody's actual starter.
function buildCleanNameCandidateIndex(playerMap) {
    const FANTASY_POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const index = {};
    Object.entries(playerMap).forEach(([id, p]) => {
        // fantasyPosition (constants.js): a two-way player (Travis Hunter, listed DB) is a WR (9C).
        if (!p || !p.first_name || !FANTASY_POS.includes(fantasyPosition(p))) return;
        const clean = normalizeName(`${p.first_name} ${p.last_name}`);
        (index[clean] = index[clean] || []).push({ ...p, id });
    });
    return index;
}

// Best guess at which real NFL player a manually-entered roster entry refers to. Returns null
// when nothing matches at all -- manual entries are free text (typos, nicknames, team defenses
// written any number of ways), so "no match" is an expected outcome, not an error, and the
// caller leaves that player's status as it was.
function resolveManualPlayer(p, candidateIndex) {
    const candidates = candidateIndex[p.cleanName];
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // Ordered tiebreakers, most trustworthy first. The manual "team" field defaults to FA and
    // the position dropdown defaults to FLEX, so neither is worth matching on when it is still
    // sitting at that default -- hence the guards.
    const team = p.team && p.team !== "FA" ? p.team : null;
    const pos = p.pos && p.pos !== "FLEX" ? p.pos : null;
    return (team && candidates.find(c => c.team === team))
        || (pos && candidates.find(c => fantasyPosition(c) === pos && c.team))
        || (pos && candidates.find(c => fantasyPosition(c) === pos))
        || candidates.find(c => c.team)
        || candidates[0];
}

// Sets each manual or hand-off league's roster players' injury status (inj, the short code the rest of the app
// reads) from Sleeper's player map. A team defense is matched by its team code. A name that can't be matched
// keeps its status and is listed in the league's injuryUnmatched. Returns the leagues it checked (Best Ball and
// empty ones skipped).
export function refreshManualInjuries(leagues, playerMap) {
    const checked = (leagues || []).filter(l => isManualLeague(l) && !isBestBallLeague(l) && (l.roster || []).length > 0);
    if (checked.length === 0 || !playerMap) return [];
    const candidateIndex = buildCleanNameCandidateIndex(playerMap);
    checked.forEach(l => {
        // Names Sleeper doesn't know (a typo the Add Player autocomplete didn't catch): kept on the league so the
        // "lineups need you" boxes can say their injuries aren't checked, in place of the Auditor's "N unmatched"
        // (S11 round 7). A team defense that can't be resolved has no injury to miss, so it isn't listed.
        const unmatched = [];
        l.roster.forEach(rp => {
            let match = null;
            if (rp.pos === 'DEF') {
                const def = rp.team ? playerMap[rp.team] : null;
                if (def && def.position === 'DEF') match = def;
            } else {
                match = resolveManualPlayer(rp, candidateIndex);
                if (!match && rp.name) unmatched.push(rp.name);
            }
            if (match) rp.inj = getShortInjuryStatus(match);
        });
        l.injuryUnmatched = unmatched;
    });
    return checked;
}
