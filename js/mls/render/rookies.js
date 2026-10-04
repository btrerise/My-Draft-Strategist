// Moved from js/mls/legacy.js in refactor chunk 3E: ROOKIE LOOKUP (the Roster tab "R" badge).
import { getSleeperPlayerMap } from '../../shared/api/sleeper.js';
import { normalizeName } from '../../shared/names.js';

    // --- ROOKIE LOOKUP (Roster tab "R" badge) ---
    // Rookie status isn't stored on league.roster -- it comes from Sleeper's years_exp (0 in a
    // player's rookie season), the same field the Matchup Simulator's rookie badge reads.
    // Looked up at render time rather than saved at sync so it can't go stale when the season
    // rolls over, and so leagues synced before this existed get badges without a re-sync.
    // Matched by Sleeper id first (synced leagues); manual and Draft Strategist handoff rosters
    // carry made-up ids ('p_...'), so those fall back to the normalized name -- on a name
    // collision preferring the player with an NFL team, like getSleeperMetaByName.
    export let _rookieIndex = null;
    let _rookieIndexPromise = null;
    export function getRookieIndex() {
        if (_rookieIndexPromise) return _rookieIndexPromise;
        _rookieIndexPromise = getSleeperPlayerMap().then(map => {
            const rookieIds = new Set();
            const knownIds = new Set();
            const byName = new Map();
            Object.entries(map).forEach(([id, p]) => {
                knownIds.add(id);
                const rookie = p.years_exp === 0;
                if (rookie) rookieIds.add(id);
                if (!p.first_name) return;
                const clean = normalizeName(`${p.first_name} ${p.last_name}`);
                const prev = byName.get(clean);
                if (!prev || (!prev.team && p.team)) byName.set(clean, { rookie, team: p.team || null });
            });
            _rookieIndex = { rookieIds, knownIds, byName };
            return _rookieIndex;
        }).catch(err => {
            _rookieIndexPromise = null;
            throw err;
        });
        return _rookieIndexPromise;
    }

    export function isRookiePlayer(p, idx) {
        if (!idx || !p) return false;
        if (p.id && idx.knownIds.has(String(p.id))) return idx.rookieIds.has(String(p.id));
        const entry = idx.byName.get(p.cleanName);
        return !!(entry && entry.rookie);
    }
