// Moved from js/mls/legacy.js in refactor chunk 3E: the Lineup tab part of RENDERERS. Locks, swaps, the
// optimizer (optimizeLineup) and the lineup renderer (renderLineupUI).
import { escapeHtml } from '../../shared/html.js';
import { tierTag } from '../constants.js';
import { getByeWeek } from '../../shared/data/byes.js';
import { pushLineupUndoSnapshot, State } from '../state.js';
import { isUnavailableThisWeek, rankingIndex, renderHTMLInto, getActiveLeague } from '../helpers.js';
import { ensureHeadshotNameIndex, playerHeadshotHTML } from '../lineup/headshots.js';
import { isEarlyPlayer } from '../lineup/earlyGames.js';
import { getByeBadgeHTML, getGameInfoHTML, getLineupInjuryWarningHTML, getLineupProjection, getNextLockCountdownHTML, getPlayerPointsHTML, getValidSleeperStarterIds, hasKickedOff, lineupProjectionsLoaded, refreshLineupStats } from '../lineup/gameInfo.js';
import { getLeagueRankingsStamp, renderLeagueManager } from '../leagues/sync.js';
import { KEYS } from '../../shared/storage/keys.js';
import { showToast } from '../../shared/ui/toast.js';
import { showConfirm } from '../../shared/ui/confirm.js';


    // Core lock/unlock mechanics shared by toggleLock (the manual lock icon) and the
    // keep-swaps-sticky logic in initiateSwap below. Updates both the season-long lock list
    // AND each player object's isLocked flag directly in the starters/bench arrays, since
    // renderLineupUI reads that flag off the object rather than re-checking the list. Returns
    // the player's name (for callers that want to reference it, e.g. in a toast).
    function setPlayerLockState(playerId, isLocked) {
        if (!State.activeLeagueId) return null;
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        let idx = locks.indexOf(playerId);
        if (isLocked && idx === -1) locks.push(playerId);
        else if (!isLocked && idx !== -1) locks.splice(idx, 1);
        State.lockedPlayersMap[State.activeLeagueId] = locks;
        localStorage.setItem(KEYS.mls.locksMap, JSON.stringify(State.lockedPlayersMap));

        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        let bench = State.manualBenchMap[State.activeLeagueId] || [];
        let playerName = null;
        starters.forEach(s => {
            if (s.player && s.player.id === playerId) { s.player.isLocked = isLocked; playerName = s.player.name; }
        });
        bench.forEach(p => {
            if (p.id === playerId) { p.isLocked = isLocked; playerName = p.name; }
        });
        State.manualStartersMap[State.activeLeagueId] = starters;
        State.manualBenchMap[State.activeLeagueId] = bench;
        return playerName;
    }

    export const toggleLock = function(playerId) {
        if (!State.activeLeagueId) return;
        pushLineupUndoSnapshot(State.activeLeagueId);
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        let isLocking = !locks.includes(playerId);
        let playerName = setPlayerLockState(playerId, isLocking) || 'Player';

        showToast(`${playerName} is ${isLocking ? 'locked' : 'unlocked'}`);
        renderLineupUI();
    };

    // True if the person has explicitly overridden auto-lock for this player this week (see
    // window.overrideAutoLock below). Scoped to the current week -- an override from a prior
    // week is stale (that week's kickoff data no longer applies) and is ignored here rather than
    // needing to be manually cleaned up.
    export function isAutoLockOverridden(leagueId, playerId) {
        let entry = State.autoLockOverridesMap[leagueId];
        if (!entry || entry.week !== State.currentNflWeek) return false;
        return entry.ids.includes(playerId);
    }

    // The failsafe for auto-lock (see optimizeLineup): if gameTimesByTeam or Sleeper's synced
    // starters ever get a specific player wrong -- a postponed/rescheduled game, a stale sync,
    // etc -- this lets the person pull that ONE player back into normal (unlocked) territory so
    // the optimizer will freely reconsider them again, without touching anything else about the
    // lineup or affecting the season-long manual lock list.
    export const overrideAutoLock = async function(playerId) {
        if (!State.activeLeagueId) return;
        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        let bench = State.manualBenchMap[State.activeLeagueId] || [];
        let found = starters.find(s => s.player && s.player.id === playerId);
        let playerName = found ? found.player.name : (bench.find(p => p.id === playerId) || {}).name || 'This player';

        if (!await showConfirm(`${playerName}'s game shows as already started. Only override this if that's wrong; doing so lets the optimizer freely move or bench them again.`, { title: 'Override the auto-lock?', confirmText: 'Override Lock' })) return;

        pushLineupUndoSnapshot(State.activeLeagueId);
        let entry = State.autoLockOverridesMap[State.activeLeagueId];
        if (!entry || entry.week !== State.currentNflWeek) entry = { week: State.currentNflWeek, ids: [] };
        if (!entry.ids.includes(playerId)) entry.ids.push(playerId);
        State.autoLockOverridesMap[State.activeLeagueId] = entry;
        localStorage.setItem(KEYS.mls.autolockOverridesMap, JSON.stringify(State.autoLockOverridesMap));

        showToast("Auto-lock removed - re-optimizing");
        optimizeLineup(true);
    };

    // Bulk-clears the season-long MANUAL lock list for the active league only -- deliberately
    // does not touch auto-locks (see optimizeLineup/overrideAutoLock above): a player whose game
    // has genuinely already kicked off should stay pinned even after this, since un-pinning them
    // would let the optimizer bench or reshuffle someone who's already locked into that outcome
    // in real life. This is for clearing out manual picks made earlier in the season/week, not
    // for correcting auto-lock mistakes -- overrideAutoLock (the per-player control on an
    // auto-locked row) is the right tool for that instead.
    export const unlockAllPlayers = async function() {
        if (!State.activeLeagueId) return;
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        if (locks.length === 0) return;
        if (!await showConfirm(`This clears all ${locks.length} manual lock${locks.length === 1 ? '' : 's'} in this league. Players auto-locked because their game already started stay locked.`, { title: 'Unlock all locked players?', confirmText: 'Unlock All' })) return;

        pushLineupUndoSnapshot(State.activeLeagueId);
        State.lockedPlayersMap[State.activeLeagueId] = [];
        localStorage.setItem(KEYS.mls.locksMap, JSON.stringify(State.lockedPlayersMap));

        showToast("All manual locks cleared - re-optimizing");
        optimizeLineup(true);
    };

    // True if `pos` is allowed to occupy a slot of type `slotType` ('QB', 'RB', 'WR', 'TE',
    // 'FLEX', 'SFLEX', 'K', or 'DEF' -- i.e. a starter slot label with its trailing number
    // stripped, same convention used everywhere else in this file). Mirrors the exact
    // eligibility rules fillSlot()/the SFLEX loop use when building the lineup in the first
    // place, so a manual swap can never produce a slot/position combination the optimizer
    // itself would never have created.
    export function slotAcceptsPos(slotType, pos) {
        switch (slotType) {
            case 'QB': return pos === 'QB';
            case 'RB': return pos === 'RB';
            case 'WR': return pos === 'WR';
            case 'TE': return pos === 'TE';
            case 'FLEX': return ['RB', 'WR', 'TE'].includes(pos);
            case 'SFLEX': return ['QB', 'RB', 'WR', 'TE'].includes(pos);
            case 'K': return pos === 'K';
            case 'DEF': return pos === 'DEF';
            default: return false;
        }
    }

    export const initiateSwap = function(playerId) {
        if (State.swapSourceId === null) { State.swapSourceId = playerId; } 
        else if (State.swapSourceId === playerId) { State.swapSourceId = null; } 
        else {
            let starters = State.manualStartersMap[State.activeLeagueId] || [];
            let bench = State.manualBenchMap[State.activeLeagueId] || [];
            let p1StarterIdx = starters.findIndex(s => s.player && s.player.id === State.swapSourceId);
            let p1BenchIdx = bench.findIndex(p => p.id === State.swapSourceId);
            let p2StarterIdx = starters.findIndex(s => s.player && s.player.id === playerId);
            let p2BenchIdx = bench.findIndex(p => p.id === playerId);

            let p1Obj = (p1StarterIdx !== -1) ? starters[p1StarterIdx].player : bench[p1BenchIdx];
            let p2Obj = (p2StarterIdx !== -1) ? starters[p2StarterIdx].player : bench[p2BenchIdx];

            // Reject the swap up front if either player would land in a starter slot their
            // position doesn't fit (e.g. a bench DEF swapped into a QB slot). Bench slots have
            // no position identity of their own, so a player moving TO the bench never fails
            // this check -- only a move INTO a starter slot is constrained.
            let p1TargetSlotType = p2StarterIdx !== -1 ? starters[p2StarterIdx].slot.replace(/[0-9]/g, '') : null;
            let p2TargetSlotType = p1StarterIdx !== -1 ? starters[p1StarterIdx].slot.replace(/[0-9]/g, '') : null;
            let p1Fits = !p1TargetSlotType || slotAcceptsPos(p1TargetSlotType, p1Obj.pos);
            let p2Fits = !p2TargetSlotType || slotAcceptsPos(p2TargetSlotType, p2Obj.pos);

            if (!p1Fits || !p2Fits) {
                showToast(`Can't swap ${p1Obj.name} (${p1Obj.pos}) with ${p2Obj.name} (${p2Obj.pos}); that position doesn't fit that slot.`, { isError: true });
                State.swapSourceId = null;
                renderLineupUI();
                return;
            }

            pushLineupUndoSnapshot(State.activeLeagueId);

            if (p1StarterIdx !== -1 && p2StarterIdx !== -1) { starters[p1StarterIdx].player = p2Obj; starters[p2StarterIdx].player = p1Obj; } 
            else if (p1StarterIdx !== -1 && p2BenchIdx !== -1) { starters[p1StarterIdx].player = p2Obj; bench[p2BenchIdx] = p1Obj; }
            else if (p1BenchIdx !== -1 && p2StarterIdx !== -1) { starters[p2StarterIdx].player = p1Obj; bench[p1BenchIdx] = p2Obj; }
            else if (p1BenchIdx !== -1 && p2BenchIdx !== -1) { bench[p1BenchIdx] = p2Obj; bench[p2BenchIdx] = p1Obj; }

            State.manualStartersMap[State.activeLeagueId] = starters;
            State.manualBenchMap[State.activeLeagueId] = bench;
            localStorage.setItem(KEYS.mls.manualStarters, JSON.stringify(State.manualStartersMap));
            localStorage.setItem(KEYS.mls.manualBench, JSON.stringify(State.manualBenchMap));

            // Keep this swap "sticky" across the next sync. optimizeLineup's full recompute
            // (forced on every Sleeper sync) only protects locked players -- without this, a
            // manual swap into (or within) the starting lineup would silently get reverted
            // back to whatever the rankings alone would have picked. Whoever ends up starting
            // gets locked; whoever ends up on the bench gets unlocked, in case they carried a
            // lock over from before this swap (otherwise their old lock would just force them
            // straight back into a starting slot on the next recompute, undoing the swap).
            let newStarterIds = new Set(starters.filter(s => s.player).map(s => s.player.id));
            [p1Obj, p2Obj].forEach(p => {
                if (p) setPlayerLockState(p.id, newStarterIds.has(p.id));
            });

            State.swapSourceId = null;
        }
        renderLineupUI();
    };

    // FLEX kickoff optimization: given the starters array that fillSlot()/the SFLEX loop above
    // already produced (i.e. WHO starts is fully decided), reorders which specific players sit
    // in strict RB/WR/TE slots vs the true FLEX slot(s), so that FLEX is always occupied by the
    // latest-kickoff player(s) among that week's flex-eligible starters. This maximizes
    // late-swap flexibility: the slot with the most schedule flexibility (FLEX, in most
    // platforms' swap UIs) ends up genuinely being the one you can wait longest to lock in.
    //
    // This never changes the SET of starting players, never touches QB/K/DEF/SFLEX, and never
    // puts a player in a slot whose position they don't match (a WR can never occupy an "RB"
    // labeled slot) -- it only decides, among players who are already flex-eligible (RB/WR/TE)
    // and already starting, which of them gets which slot label.
    //
    // How it works: for each position (RB/WR/TE), sort that position's starters by kickoff time
    // ascending. Whichever `count` of them is needed to fill that position's strict slots (e.g.
    // 2 RB slots) are exactly the `count` earliest-kickoff players at that position -- anyone
    // left over (because they were already flex-allocated by rank) is "surplus" and gets
    // reassigned into a FLEX-labeled slot instead, in kickoff order. If kickoff data isn't
    // available for a player, they sort last (Infinity) so we never assume a game is early
    // without evidence -- and if kickoff data isn't available at all, the sort is a no-op and
    // slot assignments are left exactly as fillSlot() originally produced them.
    function optimizeFlexKickoffOrder(starters) {
        const FLEX_POSITIONS = ['RB', 'WR', 'TE'];
        const byPos = { RB: [], WR: [], TE: [] };
        const strictSlotCount = { RB: 0, WR: 0, TE: 0 };

        starters.forEach((s, idx) => {
            const slotType = s.slot.replace(/[0-9]/g, '');
            // Locked players (manually locked, or auto-locked because their game already
            // kicked off -- see optimizeLineup) are pinned exactly where fillSlot put them.
            // Their slot doesn't count toward strictSlotCount either, since it's not available
            // for the unpinned pool below to be reassigned into.
            if (s.player && s.player.isLocked) return;
            if (FLEX_POSITIONS.includes(slotType)) strictSlotCount[slotType]++;
            if (!s.player) return;
            if (slotType !== 'FLEX' && !FLEX_POSITIONS.includes(slotType)) return;
            if (!FLEX_POSITIONS.includes(s.player.pos)) return; // safety guard against malformed data
            byPos[s.player.pos].push(idx);
        });

        const getKickoffMs = (idx) => {
            const p = starters[idx].player;
            const iso = p && p.team ? State.gameTimesByTeam[p.team] : null;
            const ms = iso ? new Date(iso).getTime() : NaN;
            return isNaN(ms) ? Infinity : ms;
        };

        FLEX_POSITIONS.forEach(pos => {
            byPos[pos].sort((a, b) => getKickoffMs(a) - getKickoffMs(b));
        });

        const strictAssignees = {};
        let flexAssignees = [];
        FLEX_POSITIONS.forEach(pos => {
            const indices = byPos[pos];
            strictAssignees[pos] = indices.slice(0, strictSlotCount[pos]).map(i => starters[i].player);
            flexAssignees.push(...indices.slice(strictSlotCount[pos]).map(i => starters[i].player));
        });
        // Earliest kickoff first, so multiple FLEX slots read chronologically top-to-bottom,
        // the same way the strict RB/WR/TE slots above them do. (This used to sort latest-
        // first, which put e.g. the MNF player in FLEX1 above the SNF player in FLEX2 and read
        // as reversed.) Which FLEX slot a player lands in doesn't affect late-swap flexibility
        // -- every FLEX slot accepts the same positions -- so this is purely display order.
        // Unknown kickoff sorts last, matching byPos above.
        flexAssignees.sort((a, b) => {
            const aMs = a.team && State.gameTimesByTeam[a.team] ? new Date(State.gameTimesByTeam[a.team]).getTime() : NaN;
            const bMs = b.team && State.gameTimesByTeam[b.team] ? new Date(State.gameTimesByTeam[b.team]).getTime() : NaN;
            return (isNaN(aMs) ? Infinity : aMs) - (isNaN(bMs) ? Infinity : bMs) || 0;
        });

        const cursors = { RB: 0, WR: 0, TE: 0, FLEX: 0 };
        starters.forEach(s => {
            if (!s.player) return;
            if (s.player.isLocked) return; // pinned above -- leave exactly as fillSlot placed them
            const slotType = s.slot.replace(/[0-9]/g, '');
            if (FLEX_POSITIONS.includes(slotType)) {
                const newPlayer = strictAssignees[slotType][cursors[slotType]++];
                if (newPlayer) s.player = newPlayer;
            } else if (slotType === 'FLEX') {
                const newPlayer = flexAssignees[cursors.FLEX++];
                if (newPlayer) s.player = newPlayer;
            }
        });
    }

    // opts.batch marks a call made as one iteration of a multi-league run (optimizeAllLineups).
    // In batch mode this function computes and stores the lineup in State exactly as normal,
    // but performs neither of its two localStorage writes nor its render -- the batch caller
    // writes once and renders once after the whole loop. Each of those writes serializes the
    // ENTIRE per-league map (every league's starters, every league's bench), so doing them
    // per-iteration meant N leagues cost N full serializations of all N leagues' lineups, and
    // N full renders to display only the last one.
    export const optimizeLineup = function(forceReset = true, isManualAction = false, opts = {}) {
        const batch = !!opts.batch;
        let league = getActiveLeague();
        const container = document.getElementById('optimalLineupContainer');
        const benchContainer = document.getElementById('benchContainer');

        if (!league || !league.roster || league.roster.length === 0) {
            // A batch iteration must not paint this empty state: State.activeLeagueId is
            // pointing at some other league mid-loop, so an empty-rostered league partway
            // through the batch would stamp "Welcome to the Lineup Optimizer" over whatever
            // the Lineup tab was legitimately showing for the league the person is actually
            // on. Nothing to compute for this league either way, so just leave.
            if (batch) return;
            if (container) {
                container.innerHTML = `
                <div style="background: rgba(0,0,0,0.15); border: 1px dashed var(--border); border-radius: 8px; padding: 1.5rem; text-align: left; color: var(--text-muted);">
                    <div style="font-weight: 600; color: var(--text-main); margin-bottom: 1rem; text-align: center;">Welcome to the Lineup Optimizer</div>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.9rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 1. Sync your Sleeper League (Dashboard)</div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 2. Upload Weekly Rankings (Above)</div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color:var(--primary-green); display:flex;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></span> 3. Click 'Optimize Lineup'</div>
                    </div>
                </div>`;
            }
            if (benchContainer) benchContainer.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 1rem; font-size:0.9rem; font-style:italic;">No bench data yet.</div>`; 
            return;
        }

        // A saved lineup is only re-shown as-is if it was built from the rankings this league
        // uses now. Otherwise (a set was just assigned to this league from another league's
        // upload, the set was re-uploaded, or the lineup predates stamps) it's recomputed, the
        // same full recompute a sync does: locks and manual swaps (which lock) carry over.
        const rankingsStamp = getLeagueRankingsStamp(league);
        const savedLineupCurrent = State.lineupRankingsStamps[State.activeLeagueId] === rankingsStamp;
        if (!forceReset && savedLineupCurrent && State.manualStartersMap[State.activeLeagueId] && State.manualBenchMap[State.activeLeagueId]) {
            renderLineupUI(); 
            return;
        }

        // Only the literal "Optimize Lineup" button click gets its own undo checkpoint here.
        // unlockAllPlayers/overrideAutoLock also trigger a forceReset recompute, but they push
        // their own snapshot before their own mutation, so their whole compound action undoes
        // in one step -- pushing here too would double up and only undo half of it. Sync-
        // triggered recomputes (processSleeperData's unconditional optimizeLineup(true)) are
        // deliberately excluded from undo entirely: the roster/player pool itself just changed,
        // so restoring an older lineup snapshot could silently reintroduce a player who was
        // just dropped -- that's a correctness risk undo shouldn't create.
        if (isManualAction && forceReset && State.manualStartersMap[State.activeLeagueId]) {
            pushLineupUndoSnapshot(State.activeLeagueId);
        }

        let activeDataSet = State.weeklyRankings.length > 0 ? State.weeklyRankings : State.rosRankings;
        let locks = State.lockedPlayersMap[State.activeLeagueId] || [];
        let reqs = league.reqs || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SFLEX: 0, K: 1, DEF: 1 };

        // Auto-lock: once a player's game has kicked off, their roster spot is frozen in real
        // life whether or not the person ever touches this tool again this week -- re-running
        // the optimizer (say, after a late rankings update) shouldn't be able to bench them or
        // have optimizeFlexKickoffOrder shuffle their slot. This never overrides a starter's
        // status *before* kickoff -- it only pins players who (a) have already kicked off AND
        // (b) were already established as a starter, checked against two sources: Sleeper's own
        // last-synced starting lineup (the ground truth for what actually happened in real
        // life, and the only signal available the very first time this is run in a given week)
        // and this app's own previous optimizer output (a fallback for when Sleeper starter
        // data is missing entirely -- see isSleeperStarter below for exactly when each source
        // applies). A bench player whose game has already passed is NOT auto-locked --
        // they were never started, so there's nothing to preserve.
        let sleeperStarterIds = getValidSleeperStarterIds(league);
        let prevStarters = State.manualStartersMap[State.activeLeagueId] || [];
        let prevStartingIds = new Set(prevStarters.filter(s => s.player).map(s => s.player.id));

        // Sleeper's synced starting lineup is the ground truth for "did this player actually
        // start in real life." prevStartingIds (this app's own prior pick) only steps in when
        // we have no Sleeper starter data at all -- it must NOT be OR'd in alongside real
        // Sleeper data, or a player this app recommended starting (but who Sleeper shows on
        // the bench) gets wrongly auto-locked into the lineup the moment their game kicks off.
        let isSleeperStarter = p => sleeperStarterIds.length > 0
            ? sleeperStarterIds.includes(p.id)
            : prevStartingIds.has(p.id);

        // Indexed once per run rather than scanned per roster player. Matters most under
        // Optimize All, which runs this whole function once per league.
        const rankIdx = rankingIndex(activeDataSet);
        // locks is a small array (manually locked players in this league), but it's checked
        // once per roster player, so a Set costs nothing and keeps the loop body uniform.
        const lockSet = new Set(locks);

        let scoredRoster = league.roster.map(p => {
            let rObj = rankIdx.get(p.cleanName);
            let manualLocked = lockSet.has(p.id);
            let overridden = isAutoLockOverridden(State.activeLeagueId, p.id);
            let autoLocked = !manualLocked && !overridden && hasKickedOff(p) && isSleeperStarter(p);
            return { ...p, posRank: rObj ? rObj.posRank : 999, flexRank: rObj ? rObj.flexRank : 999, posTier: rObj ? rObj.posTier : null, flexTier: rObj ? rObj.flexTier : null, isLocked: manualLocked || autoLocked, autoLocked };
        });

        // Sleeper projections for the FLEX fallback in compareFlexCandidates. Kept in a local
        // Map rather than spread onto each player object, because those objects are what gets
        // saved as the lineup -- a projection baked in there would go stale while the saved
        // lineup lives on.
        const projectionsReady = lineupProjectionsLoaded();
        const projById = new Map();
        if (projectionsReady) scoredRoster.forEach(p => projById.set(p.id, getLineupProjection(p.id, league)));
        if (projectionsReady) State.projectionlessLineups.delete(State.activeLeagueId);
        else State.projectionlessLineups.add(State.activeLeagueId);

        // Head-to-head for a FLEX-type slot (RB/WR/TE competing across positions). Tiers, in order:
        //   1. Both have a FLEX rank -> lower FLEX rank wins. Your rankings always come first.
        //   2. Only one has a FLEX rank -> that one wins.
        //   3. Neither has a FLEX rank -> higher Sleeper projection wins. Position ranks aren't
        //      comparable across positions (TE24 isn't better than WR45, it's just a shallower
        //      list), which is what used to push low-end TEs over depth RB/WRs here.
        //   4. Projection missing for one or both (not loaded yet, or Sleeper doesn't project
        //      him) -> a projected player beats an unprojected one; otherwise posRank as before.
        // Each tier is a strict ordering, so the comparator stays consistent (transitive).
        const compareFlexCandidates = (a, b) => {
            if (a.flexRank !== 999 && b.flexRank !== 999) return a.flexRank - b.flexRank;
            if (a.flexRank !== 999 && b.flexRank === 999) return -1;
            if (a.flexRank === 999 && b.flexRank !== 999) return 1;
            const aProj = projById.has(a.id) ? projById.get(a.id) : null;
            const bProj = projById.has(b.id) ? projById.get(b.id) : null;
            if (aProj !== null && bProj !== null && aProj !== bProj) return bProj - aProj;
            if (aProj !== null && bProj === null) return -1;
            if (aProj === null && bProj !== null) return 1;
            return a.posRank - b.posRank;
        };

        // Taxi-squad players are held out of the starter pool entirely rather than merely
        // deprioritized the way isUnavailableThisWeek handles byes and hard-out statuses.
        // That mechanism has a deliberate last-resort fallback that will start an unavailable
        // player rather than leave a slot empty -- correct for an Out RB (you get his zero
        // either way), wrong for a taxi player, whom the platform will not let you start at
        // all. A healthy, well-ranked rookie sitting on taxi is exactly the case that fallback
        // would otherwise promote into the lineup. They rejoin the bench pool after slotting.
        let taxiPlayers = scoredRoster.filter(p => p.isTaxi);
        let pool = scoredRoster.filter(p => !p.isTaxi);
        let starters = [];

        // Finds the best index in `pool` matching `matchFn`, using `compareFn` to rank
        // candidates against each other (same contract as Array.prototype.sort's comparator:
        // negative means `a` ranks ahead of `b`). Prefers players who are actually available
        // this week per isUnavailableThisWeek(); only falls back to an unavailable player if
        // NO eligible one exists at all, so a slot is never silently left empty just because
        // the best-ranked option happens to be on bye.
        const findBestStarterIndex = (matchFn, compareFn) => {
            let bestIdx = -1;
            pool.forEach((p, idx) => {
                if (!matchFn(p) || isUnavailableThisWeek(p)) return;
                if (bestIdx === -1 || compareFn(p, pool[bestIdx]) < 0) bestIdx = idx;
            });
            if (bestIdx !== -1) return bestIdx;

            // Fallback pass: nobody eligible is available at this position. Allow a bye/hard-out
            // player rather than leaving the slot empty -- they'll show up with a clear BYE or
            // injury badge in the UI instead of just vanishing from the lineup.
            pool.forEach((p, idx) => {
                if (!matchFn(p)) return;
                if (bestIdx === -1 || compareFn(p, pool[bestIdx]) < 0) bestIdx = idx;
            });
            return bestIdx;
        };

        const fillSlot = (slotLabel, posFilter, useFlexRank) => {
            let lockedIndex = pool.findIndex(p => p.isLocked && posFilter(p.pos));
            if (lockedIndex !== -1) { starters.push({ slot: slotLabel, player: pool.splice(lockedIndex, 1)[0], usedFlex: useFlexRank }); return; }

            const compareFn = useFlexRank ? compareFlexCandidates : (a, b) => a.posRank - b.posRank;

            let bestIndex = findBestStarterIndex(p => posFilter(p.pos), compareFn);
            if (bestIndex !== -1) starters.push({ slot: slotLabel, player: pool.splice(bestIndex, 1)[0], usedFlex: useFlexRank });
            else starters.push({ slot: slotLabel, player: null, usedFlex: useFlexRank });
        };

        for (let i = 0; i < (reqs.QB || 0); i++) fillSlot(`QB${i+1}`, pos => pos === 'QB', false);
        for (let i = 0; i < (reqs.RB || 0); i++) fillSlot(`RB${i+1}`, pos => pos === 'RB', false);
        for (let i = 0; i < (reqs.WR || 0); i++) fillSlot(`WR${i+1}`, pos => pos === 'WR', false);
        for (let i = 0; i < (reqs.TE || 0); i++) fillSlot(`TE${i+1}`, pos => pos === 'TE', false);
        for (let i = 0; i < (reqs.FLEX || 0); i++) fillSlot(`FLEX${i+1}`, pos => ['RB', 'WR', 'TE'].includes(pos), true);
        
        for (let i = 0; i < reqs.SFLEX; i++) {
            let slotLabel = `SFLEX${i+1}`;
            let lockedIndex = pool.findIndex(p => p.isLocked && ['QB', 'RB', 'WR', 'TE'].includes(p.pos));
            if (lockedIndex !== -1) {
                let lockedPlayer = pool.splice(lockedIndex, 1)[0];
                // Read pos off the player we just removed, not off pool[lockedIndex] -- after
                // splice() that index now holds a different (or no) element, since everything
                // after the removed slot shifts down by one.
                starters.push({ slot: slotLabel, player: lockedPlayer, usedFlex: lockedPlayer.pos !== 'QB' });
                continue;
            }

            let bestQBIdx = findBestStarterIndex(p => p.pos === 'QB' && p.posRank !== 999, (a, b) => a.posRank - b.posRank);
            if (bestQBIdx !== -1) {
                starters.push({ slot: slotLabel, player: pool.splice(bestQBIdx, 1)[0], usedFlex: false });
            } else {
                let bestFlexIdx = findBestStarterIndex(p => ['RB', 'WR', 'TE'].includes(p.pos) && p.flexRank !== 999, (a, b) => a.flexRank - b.flexRank);
                if (bestFlexIdx !== -1) {
                    starters.push({ slot: slotLabel, player: pool.splice(bestFlexIdx, 1)[0], usedFlex: true });
                } else {
                    // No one left has a FLEX rank, so compareFlexCandidates falls through to its
                    // projection tier -- same cross-position reasoning as the FLEX slots.
                    let bestPosIdx = findBestStarterIndex(p => ['RB', 'WR', 'TE'].includes(p.pos) && p.posRank !== 999, compareFlexCandidates);
                    if (bestPosIdx !== -1) starters.push({ slot: slotLabel, player: pool.splice(bestPosIdx, 1)[0], usedFlex: false });
                    else starters.push({ slot: slotLabel, player: null, usedFlex: false });
                }
            }
        }
        for (let i = 0; i < (reqs.K || 0); i++) fillSlot(`K${i+1}`, pos => pos === 'K', false);
        for (let i = 0; i < (reqs.DEF || 0); i++) fillSlot(`DEF${i+1}`, pos => pos === 'DEF', false);

        const benchOrder = (a, b) => {
            if (a.flexRank !== 999 && b.flexRank !== 999) return a.flexRank - b.flexRank;
            if (a.flexRank !== 999 && b.flexRank === 999) return -1;
            if (a.flexRank === 999 && b.flexRank !== 999) return 1;
            return a.posRank - b.posRank;
        };
        pool.sort(benchOrder);

        // Taxi players land beneath the entire real bench regardless of how well they're
        // ranked -- "Bench Priorities" is a list of who you'd turn to this week, and a taxi
        // player isn't an option at any rank. Sorted among themselves by the same comparator
        // so the group still reads best-to-worst internally. Appended after the sort rather
        // than folded into the comparator so this ordering can't be undone by a future change
        // to how the bench itself is ranked.
        taxiPlayers.sort(benchOrder);
        pool.push(...taxiPlayers);

        // Reassign which specific players occupy strict RB/WR/TE slots vs the FLEX slot(s),
        // purely by kickoff time -- who actually starts is already decided above by rank; this
        // only relabels slots so FLEX holds the latest games. See optimizeFlexKickoffOrder for
        // why this is safe (it never changes the set of starters, only slot labels). Gated by
        // the user-facing toggle (State.lineupSettings.flexKickoffOptimization, default on) --
        // when off, slots are left exactly as fillSlot()/the SFLEX loop above assigned them.
        if (State.lineupSettings.flexKickoffOptimization) {
            optimizeFlexKickoffOrder(starters);
        }

        State.manualStartersMap[State.activeLeagueId] = starters;
        State.manualBenchMap[State.activeLeagueId] = pool;
        // Written even in batch mode: it's one short string per league, not the full lineup
        // maps the batch caller defers.
        State.lineupRankingsStamps[State.activeLeagueId] = rankingsStamp;
        localStorage.setItem(KEYS.mls.lineupRankingsStamps, JSON.stringify(State.lineupRankingsStamps));

        // Batch runs defer both writes to the caller -- see the note on this function's
        // signature. State above is updated either way, so a batch that somehow failed to
        // flush would lose the run, not corrupt it.
        if (!batch) {
            localStorage.setItem(KEYS.mls.manualStarters, JSON.stringify(State.manualStartersMap));
            localStorage.setItem(KEYS.mls.manualBench, JSON.stringify(State.manualBenchMap));
        }

        if (isManualAction) {
            let hasOptimizedBefore = localStorage.getItem(KEYS.mls.hasOptimized);
            if (!hasOptimizedBefore) {
                showToast("🎉 Lineup Optimized! You've successfully completed the setup flow.", { duration: 6000 });
                localStorage.setItem(KEYS.mls.hasOptimized, 'true');
            } else {
                showToast("Optimal lineup set");
            }
        }

        // A batch iteration renders nothing: State.activeLeagueId is pointing at a league the
        // person isn't looking at, and the next iteration is about to move it again. The batch
        // caller restores the real active league and renders once at the end.
        if (!batch) renderLineupUI();
    };

    // Note on the renderLeagueManager() call at the tail of this function: it rebuilds a row
    // for EVERY league in the app, which is correct after a single interactive lineup edit (a
    // swap or a lock toggle genuinely changes that league's "matches Sleeper" status), but is
    // pure waste when many lineups are computed in a row. Batch callers (optimizeAllLineups)
    // therefore don't call this function at all per league -- see optimizeLineup's `batch`
    // option -- rather than calling it and suppressing half its work.
    // "Pos: #40 | Flex: #66" badge on each Lineup tab player. The second number depends on
    // which rankings the optimizer ran on (see optimizeLineup's activeDataSet: Weekly when
    // loaded, otherwise ROS):
    //   Weekly -- FLEX rank, RB/WR/TE only. Weekly exports carry a FLEX list.
    //   ROS    -- Overall rank, any position. ROS exports carry Overall + Positional and no
    //             FLEX list; the parser stores Overall in flexRank for those files, so the
    //             number is right but "Flex" was the wrong name for it. Same wording as the
    //             waiver cards ("ROS Overall").
    function lineupRankBadge(p, rankedByRos) {
        const hasPos = p.posRank !== 999;
        const hasCross = p.flexRank !== 999;
        if (!hasPos && !hasCross) return "Unranked";
        const posStr = hasPos ? `#${p.posRank}${tierTag(p.posTier)}` : "-";
        const crossStr = hasCross ? `#${p.flexRank}${tierTag(p.flexTier)}` : "-";
        if (rankedByRos) return hasCross ? `Pos: ${posStr} | Overall: ${crossStr}` : `Pos: ${posStr}`;
        return (['QB', 'K', 'DEF'].includes(p.pos) || !hasCross) ? `Pos: ${posStr}` : `Pos: ${posStr} | Flex: ${crossStr}`;
    }

    export function renderLineupUI() {
        const container = document.getElementById('optimalLineupContainer');
        const benchContainer = document.getElementById('benchContainer');
        if (!container || !benchContainer) return;

        let league = getActiveLeague();
        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        let benchPool = State.manualBenchMap[State.activeLeagueId] || [];
        let validSleeperStarters = getValidSleeperStarterIds(league);
        let optimizedStarterIds = starters.filter(s => s.player).map(s => s.player.id);
        // The season-long manual lock list -- used only to distinguish "manually locked" from
        // "auto-locked because the game already started" so the right lock control renders (see
        // lockControl below). Written via setPlayerLockState, by toggleLock (the lock icon) and
        // by initiateSwap (keeping a manual swap sticky across the next full recompute).
        let locksList = State.lockedPlayersMap[State.activeLeagueId] || [];
        // Mirrors optimizeLineup's activeDataSet choice, so the badges name the numbers the
        // lineup was actually built from.
        const rankedByRos = State.weeklyRankings.length === 0 && State.rosRankings.length > 0;

        let html = "";

        ensureHeadshotNameIndex(league && league.roster, renderLineupUI);

        html += getNextLockCountdownHTML(starters);
        html += getLineupInjuryWarningHTML(starters, league);

        if (validSleeperStarters.length > 0) {
            let sleeperSet = new Set(validSleeperStarters);
            let optSet = new Set(optimizedStarterIds);
            let isMatch = sleeperSet.size === optSet.size && [...sleeperSet].every(id => optSet.has(id));
            
            if (isMatch) {
                html += `<div class="mb-3 text-center" style="font-size: 0.85rem; font-weight: 600; color: var(--primary-green); display: flex; align-items: center; justify-content: center; gap: 6px;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Matches your active Sleeper lineup</div>`;
            } else {
                html += `<div class="mb-3 text-center" style="font-size: 0.85rem; font-weight: 600; color: #f59e0b; display: flex; align-items: center; justify-content: center; gap: 6px;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Action Required: Differs from Sleeper lineup</div>`;
            }
        }

        // Only shown when there's actually something to clear -- avoids a dead/no-op button
        // taking up space on the common case where nobody has manually locked anyone.
        if (locksList.length > 0) {
            html += `<div class="mb-3 text-center"><button class="mls-btn-sm btn-secondary" style="font-size: 0.75rem; padding: 4px 10px;" data-action="unlockAllPlayers" title="Clears season-long manual locks in this league only - does not affect players auto-locked because their game already started">Unlock All (${locksList.length})</button></div>`;
        }

        // While a swap is pending, the source player's row gets an amber highlight (see
        // lockClass below) but nothing else on screen says what to actually do next --
        // this spells it out instead of leaving it to be inferred from one highlighted row.
        if (State.swapSourceId) {
            let swapSourcePlayer = (starters.find(s => s.player && s.player.id === State.swapSourceId) || {}).player
                || benchPool.find(p => p.id === State.swapSourceId);
            let swapSourceName = swapSourcePlayer ? swapSourcePlayer.name : 'this player';
            html += `<div class="mb-3 text-center" style="font-size: 0.85rem; font-weight: 600; color: #f59e0b;">Tap another player's ⇄ to swap with ${escapeHtml(swapSourceName)}, or tap Cancel to stop.</div>`;
        }

        starters.forEach(s => {
            let slotType = s.slot.replace(/[0-9]/g, '');

            if (s.player) {
                let p = s.player;
                let lockIcon = p.isLocked 
                    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color: var(--primary-green);"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>` 
                    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color: var(--text-muted); opacity: 0.6;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
                let lockClass = p.isLocked ? "locked" : "";
                if (State.swapSourceId === p.id) lockClass += " swapping";

                // Auto-locked (game already started -- see hasKickedOff/optimizeLineup) gets a
                // distinct control instead of the normal toggle button: clicking the normal
                // button would call toggleLock(), which -- since this player was never added to
                // the season-long lock list -- would actually CREATE a manual lock rather than
                // clear anything, the opposite of what tapping a "locked" icon implies. Instead
                // this calls overrideAutoLock(), the failsafe for when the underlying kickoff/
                // Sleeper data turns out to be wrong about this specific player.
                // Computed once so the control and the text badge below can never disagree --
                // a player can carry a stale autoLocked flag after the keep-swaps-sticky path
                // adds them to locksList, and in that case both should treat it as a manual lock.
                let isAutoLock = p.autoLocked && !locksList.includes(p.id);
                let lockControl = isAutoLock
                    ? `<button class="mls-btn-sm" title="Game in progress - tap to override if this is wrong" aria-label="${escapeHtml(p.name)}'s game has started. Override lock" style="background:none; border:none; cursor:pointer; padding:0 4px; display:inline-flex;" data-action="overrideAutoLock" data-id="${p.id}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color: #60a5fa;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></button>`
                    : `<button class="mls-btn-sm lock-btn" style="background:none; cursor:pointer; padding:0 4px;" data-action="toggleLock" data-id="${p.id}" aria-label="Lock ${escapeHtml(p.name)}" aria-pressed="${p.isLocked ? 'true' : 'false'}">${lockIcon}</button>`;

                let rankBadge = lineupRankBadge(p, rankedByRos);

                let earlyTag = isEarlyPlayer(p.team) ? `<span class="badge early-badge">EARLY</span>` : "";
                const byeWeek = getByeWeek(p.team, State.currentNflSeason);
                let byeStr = byeWeek ? ` (${byeWeek})` : "";
                let byeBadge = getByeBadgeHTML(p.team);
                let injBadge = p.inj ? `<span class="badge inj-badge">${escapeHtml(p.inj)}</span>` : "";
                let kickoffBadge = getGameInfoHTML(p.team);

                let sleeperWarn = "";
                if (validSleeperStarters.length > 0 && !validSleeperStarters.includes(p.id)) {
                    sleeperWarn = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid #f59e0b; font-size: 0.65rem; margin-left: 4px;">Bench in Sleeper</span>`;
                }
                // Text version of the padlock's state. Without it, manual vs auto lock differ
                // only by icon tint (green vs blue) plus a title= tooltip that never shows on a
                // phone. Worded AUTO-LOCKED rather than naming the reason, because the kickoff
                // badge on this same row already says "Started"/"Final" -- this adds the part
                // that badge can't say (a started bench player shows "Started" too).
                let lockBadge = !p.isLocked ? ""
                    : isAutoLock ? `<span class="badge mls-autolock-badge">AUTO-LOCKED</span>`
                    : `<span class="badge mls-lock-badge">LOCKED</span>`;
                let badgesRow = [lockBadge, injBadge, byeBadge, earlyTag, kickoffBadge, sleeperWarn].filter(Boolean).join(' ');

                // The slot badge below already spells out the position for strict slots (RB1
                // always holds an RB, etc), so a second colored position pill there is pure
                // duplication. It's only ambiguous for FLEX/SFLEX (could be RB/WR/TE) -- so the
                // player's real position gets shown as plain text, and only in those cases.
                // Now shown on every row regardless of slot type (previously only FLEX/SFLEX/
                // bench, where the slot badge alone doesn't reveal it) -- for consistency, per
                // Benton, and so every row's meta line starts with the same kind of element
                // instead of some starting with plain text and others starting with the team badge.
                let plainPos = `<span class="mls-plain-pos pos-text-${escapeHtml(String(p.pos).toLowerCase())}">${escapeHtml(p.pos)}</span>`;

                html += `
                <div class="lineup-slot ${lockClass}">
                    <div class="mls-player-row-info">
                        <span class="slot-badge slot-${slotType}">${slotType}</span>
                        ${playerHeadshotHTML(p)}
                        <div class="mls-player-row-text">
                            <div class="player-name-wrap">${escapeHtml(p.name)}${byeStr}</div>
                            ${badgesRow ? `<div class="mls-player-badges-row">${badgesRow}</div>` : ''}
                            <div class="mls-player-row-meta">
                                ${plainPos}
                                <span class="badge">${escapeHtml(p.team)}</span>
                                <span class="badge mls-rank-badge">${rankBadge}</span>
                            </div>
                        </div>
                    </div>
                    <div class="mls-row-actions">
                        ${getPlayerPointsHTML(p)}
                        <button class="mls-btn-sm btn-secondary swap-btn" data-action="initiateSwap" data-id="${p.id}" aria-label="${State.swapSourceId === p.id ? `Cancel swap of ${escapeHtml(p.name)}` : `Swap ${escapeHtml(p.name)}`}">${State.swapSourceId === p.id ? 'Cancel' : '⇄'}</button>
                        ${lockControl}
                    </div>
                </div>`;
            } else {
                html += `
                <div class="lineup-slot empty">
                    <span class="slot-badge slot-${slotType}">${slotType}</span>
                    <div style="color:var(--text-muted); font-style:italic;">[ Empty Slot ]</div>
                </div>`;
            }
        });
        renderHTMLInto(container, html);

        let benchHTML = "";
        if (benchPool.length > 0) {
            benchContainer.classList.remove('bench-empty-state');
            // optimizeLineup guarantees every taxi player sits at the tail of benchPool, so the
            // divider only ever needs to be emitted once, at the first one encountered. Driven
            // off the data rather than a precomputed count so a bench with no taxi players
            // renders byte-for-byte as it did before this existed.
            let taxiDividerShown = false;
            benchPool.forEach(p => {
                if (p.isTaxi && !taxiDividerShown) {
                    taxiDividerShown = true;
                    benchHTML += `<div class="bench-taxi-divider"><span>Taxi Squad</span></div>`;
                }
                let lockClass = State.swapSourceId === p.id ? "swapping" : "";
                let rankBadge = lineupRankBadge(p, rankedByRos);

                let earlyTag = isEarlyPlayer(p.team) ? `<span class="badge early-badge">EARLY</span>` : "";
                const byeWeek = getByeWeek(p.team, State.currentNflSeason);
                let byeStr = byeWeek ? ` (${byeWeek})` : "";
                let byeBadge = getByeBadgeHTML(p.team);
                let injBadge = p.inj ? `<span class="badge inj-badge">${escapeHtml(p.inj)}</span>` : "";
                let kickoffBadge = getGameInfoHTML(p.team);
                // Kept even though the divider above already labels the group: the divider
                // scrolls off, and these rows get screenshotted and pasted into league chats.
                let taxiBadge = p.isTaxi ? `<span class="badge taxi-badge">TAXI</span>` : "";

                let sleeperWarn = "";
                if (validSleeperStarters.length > 0 && validSleeperStarters.includes(p.id)) {
                    sleeperWarn = `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid #ef4444; font-size: 0.65rem; margin-left: 4px;">Starting in Sleeper</span>`;
                }
                let badgesRow = [injBadge, taxiBadge, byeBadge, earlyTag, kickoffBadge, sleeperWarn].filter(Boolean).join(' ');
                // Bench ("BN") never reveals real position the way a strict slot badge does, so
                // always show it as plain text here -- same reasoning as the starters block above.
                let plainPos = `<span class="mls-plain-pos pos-text-${escapeHtml(String(p.pos).toLowerCase())}">${escapeHtml(p.pos)}</span>`;

                // "TX" rather than "BN" in the slot column, so the distinction survives even
                // where the badges row is dense -- same fixed 46px slot badge, no layout shift.
                const slotCode = p.isTaxi ? 'TX' : 'BN';

                // No swap control on a taxi row. The whole point of the flag is that this
                // player can't be started, so offering the button would be an invitation to
                // build a lineup Sleeper will reject -- and since swapping is the only way a
                // bench player reaches the starters here, withholding it is also what actually
                // enforces the exclusion in the UI, not just in the optimizer's own slotting.
                const rowActions = p.isTaxi
                    ? getPlayerPointsHTML(p)
                    : `${getPlayerPointsHTML(p)}
                        <button class="mls-btn-sm btn-secondary swap-btn" data-action="initiateSwap" data-id="${p.id}" aria-label="${State.swapSourceId === p.id ? `Cancel swap of ${escapeHtml(p.name)}` : `Swap ${escapeHtml(p.name)}`}">${State.swapSourceId === p.id ? 'Cancel' : '⇄'}</button>`;

                benchHTML += `
                <div class="lineup-slot ${lockClass} ${p.isTaxi ? 'taxi-row' : ''}">
                    <div class="mls-player-row-info">
                        <span class="slot-badge slot-${slotCode}">${slotCode}</span>
                        ${playerHeadshotHTML(p)}
                        <div class="mls-player-row-text">
                            <div class="player-name-wrap">${escapeHtml(p.name)}${byeStr}</div>
                            ${badgesRow ? `<div class="mls-player-badges-row">${badgesRow}</div>` : ''}
                            <div class="mls-player-row-meta">
                                ${plainPos}
                                <span class="badge">${escapeHtml(p.team)}</span>
                                <span class="badge mls-rank-badge">${rankBadge}</span>
                            </div>
                        </div>
                    </div>
                    <div class="mls-row-actions">
                        ${rowActions}
                    </div>
                </div>`;
            });
        } else { 
            benchContainer.classList.add('bench-empty-state');
            benchHTML = `
                <div style="display:flex; justify-content:center; align-items:center; height: 60px; color:var(--text-muted); font-style:italic; font-size:0.9rem;">
                    [ No bench players available ]
                </div>`; 
        }
        renderHTMLInto(benchContainer, benchHTML);

        // Auto-update the dashboard matrix in the background so status icons stay live
        if (typeof renderLeagueManager === 'function') renderLeagueManager();

        // Fills in projections/final scores/opponents if they're missing or stale; a no-op
        // (and no re-render) when everything's already fresh. See refreshLineupStats.
        refreshLineupStats();
    }
