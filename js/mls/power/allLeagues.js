// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3C: ALL-LEAGUES POSITIONAL
// POWER RANKS.
import { escapeHtml } from '../compat.js';
import { RANKING_TYPE_CONFIG } from '../constants.js';
import { State } from '../state.js';
import { rankingIndex } from '../helpers.js';
import { isFullyMappedLeague } from '../scout/allLeaguesSearch.js';
import { computePositionalPower, POWER_UNRANKED_RANK, powerRankFor, powerTier, powerValueForRank } from '../main.js';

    // --- ALL-LEAGUES POSITIONAL POWER RANKS ---
    // Each league's power ranks come from THAT league's own ROS rankings (its named set, else
    // its legacy per-league copy -- the same priority hydrateRankingsForLeague uses), not the
    // active league's: a Superflex league's QB board and a 1QB league's shouldn't score each
    // other's rosters. The active league reads State.rosRankings directly, which is exactly
    // what the Positional Power Rankings card would use for it. A league with no ROS rankings
    // of its own falls back to Market Consensus (flagged "mkt" on its row, since market data
    // is priced for one format -- see State.marketSettings -- not necessarily this league's);
    // with neither, the league simply gets no power rank.
    function getLeaguePowerRankings(league) {
        if (league.leagueId === State.activeLeagueId && State.rosRankings.length > 0) {
            return { rankings: State.rosRankings, source: 'ros' };
        }
        const cfg = RANKING_TYPE_CONFIG.ros;
        const setId = league[cfg.leagueSetIdKey];
        const set = setId ? State.rankingSets[cfg.setsKey].find(rs => rs.id === setId) : null;
        if (set && Array.isArray(set.data) && set.data.length > 0) return { rankings: set.data, source: 'ros' };
        const legacy = league[cfg.leagueLegacyDataKey];
        if (Array.isArray(legacy) && legacy.length > 0) return { rankings: legacy, source: 'ros' };
        if (State.marketRankings.length > 0) return { rankings: State.marketRankings, source: 'market' };
        return null;
    }

    // Everything a league row needs to talk about power ranks, computed once per league per
    // search (not once per searched name). Null when the league can't support it: power ranks
    // compare every manager's room, so a manual/handoff league that only knows your roster
    // (see isFullyMappedLeague) has nothing to compare against.
    export function getLeaguePowerContext(league) {
        if (!isFullyMappedLeague(league) || !league.globalPosMap) return null;
        const src = getLeaguePowerRankings(league);
        if (!src) return { league, missing: 'rankings' };
        const teams = computePositionalPower(league, src.rankings);
        const you = teams.find(t => t.owner === 'You');
        if (!you) return { league, missing: 'roster' };
        return { league, teams, you, totalTeams: teams.length, source: src.source, rankingsIdx: rankingIndex(src.rankings) };
    }

    export const POWER_RANK_KEY = { QB: 'qbRank', RB: 'rbRank', WR: 'wrRank', TE: 'teRank' };

    // "Where would this manager rank at pos if these score changes happened?" -- 1 + the number
    // of other managers still strictly ahead. adjustments is { [owner]: delta }, so a trade can
    // move the player's value off his current owner and onto you in the same call.
    function powerRankWithAdjust(ctx, pos, owner, adjustments) {
        const scoreOf = t => t.scores[pos] + (adjustments[t.owner] || 0);
        const target = ctx.teams.find(t => t.owner === owner);
        if (!target) return null;
        const mine = scoreOf(target);
        return 1 + ctx.teams.filter(t => t.owner !== owner && scoreOf(t) > mine).length;
    }

    export const ordinal = (n) => {
        const v = n % 100;
        if (v >= 11 && v <= 13) return `${n}th`;
        return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`;
    };

    // One league row's power-rank read for one player: your rank at his position now, where
    // you'd land with him (Buy/Add) or without him (Sell/Drop), and a verdict for the chosen
    // intent. Verdict rules, deliberately simple enough to explain in one line on the row:
    //   Buy/Add  (free agent or someone else's player):
    //     * you're already top third at the position       -> "Not a need"
    //     * he'd lift you 2+ spots, or you're bottom third
    //       and he'd lift you at all                        -> Add / Buy (recommended)
    //     * otherwise                                       -> "Marginal"
    //   Sell/Drop (only rows where he's yours):
    //     * you'd drop into the bottom third without him     -> "Hold"
    //     * you're top third now and wouldn't fall to the
    //       bottom third without him                         -> Sell (recommended; "Drop" when
    //                                                           he isn't on this league's board)
    //     * otherwise                                       -> "Neutral"
    export function buildPowerRead(ctx, res, status, owner, intent) {
        const pos = res.pos;
        if (!ctx || ctx.missing || !POWER_RANK_KEY[pos]) return null;
        const N = ctx.totalTeams;
        const myRank = ctx.you[POWER_RANK_KEY[pos]];
        const tier = powerTier(myRank, N);
        const { rank: playerRank } = powerRankFor(ctx.rankingsIdx, res.clean);
        const onBoard = playerRank !== POWER_UNRANKED_RANK;
        const v = powerValueForRank(playerRank);
        const read = { pos, N, myRank, tier, source: ctx.source, onBoard, verdict: null };

        if (status === 'mine') {
            read.withoutRank = powerRankWithAdjust(ctx, pos, 'You', { You: -v });
            read.withoutTier = powerTier(read.withoutRank, N);
        } else if (status === 'free' || status === 'taken') {
            const adj = { You: v };
            if (status === 'taken' && owner) adj[owner] = -v;
            read.withRank = powerRankWithAdjust(ctx, pos, 'You', adj);
            if (status === 'taken') {
                // Judged on where the owner would sit AFTER the deal, not now: an owner who's
                // 1st at WR only because of this very player isn't "deep" -- he's their WR room.
                const ownerAfter = powerRankWithAdjust(ctx, pos, owner, adj);
                if (ownerAfter != null) {
                    read.ownerAfterRank = ownerAfter;
                    read.ownerAfterTier = powerTier(ownerAfter, N);
                }
            }
        }

        if (intent === 'sell') {
            if (status !== 'mine') return read;
            // Managers weakest at this position -- the natural buyers. Bottom third only, so a
            // mid-pack team isn't pitched as "needs a WR".
            read.partners = ctx.teams
                .filter(t => t.owner !== 'You' && powerTier(t[POWER_RANK_KEY[pos]], N) === 'weak')
                .sort((a, b) => b[POWER_RANK_KEY[pos]] - a[POWER_RANK_KEY[pos]])
                .slice(0, 2)
                .map(t => ({ owner: t.owner, rank: t[POWER_RANK_KEY[pos]] }));
            if (read.withoutTier === 'weak') {
                read.verdict = { rec: false, label: 'Hold', reason: `You'd be thin at ${pos} without him` };
            } else if (tier === 'strong') {
                read.verdict = { rec: true, label: onBoard ? 'Sell' : 'Drop',
                    reason: onBoard ? `${pos} surplus - you can afford to move him` : `${pos} surplus, and he's not on this league's board` };
            } else {
                read.verdict = { rec: false, label: 'Neutral', reason: `Sell only if the return fills a bigger need` };
            }
            return read;
        }

        // Buy / Add
        if (status === 'mine') {
            read.verdict = { rec: false, label: 'Yours', reason: '' };
        } else if (status === 'free' || status === 'taken') {
            const gain = myRank - read.withRank;
            const action = status === 'free' ? 'Add' : 'Buy';
            if (tier === 'strong') {
                read.verdict = { rec: false, label: 'Not a need', reason: `You're already top-third at ${pos}` };
            } else if (gain >= 2 || (tier === 'weak' && gain >= 1)) {
                read.verdict = { rec: true, label: action, reason: tier === 'weak' ? `You're thin at ${pos}` : `A real ${pos} upgrade` };
            } else {
                read.verdict = { rec: false, label: 'Marginal', reason: `Barely moves your ${pos} rank` };
            }
            read.gain = gain;
        }
        return read;
    }

    export function renderPowerRead(read, status, intent) {
        if (!read) return '';
        const tierCls = { strong: 'mls-power-strong', middle: 'mls-power-middle', weak: 'mls-power-weak' };
        const mkt = read.source === 'market'
            ? ` <span class="mls-power-src" title="This league has no ROS rankings of its own, so its power ranks use Market Consensus data.">mkt</span>` : '';
        let line = `Your ${read.pos} Power Rank: <strong class="${tierCls[read.tier]}">${ordinal(read.myRank)}</strong> of ${read.N}${mkt}`;
        if (intent === 'sell' && read.withoutRank != null) {
            line += ` <span class="mls-power-arrow">&rarr;</span> <strong class="${tierCls[read.withoutTier]}">${ordinal(read.withoutRank)}</strong> without him`;
        } else if (intent !== 'sell' && read.withRank != null && read.withRank !== read.myRank) {
            line += ` <span class="mls-power-arrow">&rarr;</span> <strong class="${tierCls[powerTier(read.withRank, read.N)]}">${ordinal(read.withRank)}</strong> with him`;
        } else if (intent !== 'sell' && read.withRank != null) {
            line += ` <span class="mls-muted-rank">(no change with him)</span>`;
        }

        let verdictHTML = '';
        const vd = read.verdict;
        if (vd && vd.label !== 'Yours') {
            const extras = [];
            if (vd.reason) extras.push(escapeHtml(vd.reason));
            // Only on flagged rows -- on a "Not a need" row, how the owner would fare is noise.
            if (intent !== 'sell' && vd.rec && status === 'taken' && read.ownerAfterRank != null) {
                if (read.ownerAfterTier === 'strong') extras.push(`Owner stays top-third at ${read.pos} without him (${ordinal(read.ownerAfterRank)}) - may be open to a deal`);
                else if (read.ownerAfterTier === 'weak') extras.push(`Owner would drop to ${ordinal(read.ownerAfterRank)} at ${read.pos} without him - expect to pay up`);
            }
            if (intent === 'sell' && vd.rec && read.partners && read.partners.length > 0) {
                extras.push(`Weakest ${read.pos} rooms: ${read.partners.map(p => `${escapeHtml(p.owner)} (${ordinal(p.rank)})`).join(', ')}`);
            }
            verdictHTML = `<div class="mls-power-verdict">
                <span class="mls-power-chip ${vd.rec ? 'mls-power-chip-rec' : ''}">${escapeHtml(vd.label)}</span>
                ${extras.length ? `<span>${extras.join(' <span class="mls-rank-sep">&middot;</span> ')}</span>` : ''}
            </div>`;
        }
        return `<div class="mls-power-line">${line}</div>${verdictHTML}`;
    }

    // Row-level "why is this league scored differently (or not at all)?" note. Only for a
    // position power ranks actually cover, and only for leagues that could be scored if they
    // had rankings (see getLeaguePowerContext) -- a manual league's gap is structural, not
    // something adding rankings would fix. The fix is always the same: switch to the league
    // (the row's Switch button) and load ROS rankings there, since rankings attach to
    // whichever league is active.
    export function renderPowerSourceNote(ctx, pos) {
        if (!ctx || !POWER_RANK_KEY[pos]) return '';
        if (ctx.missing === 'rankings') {
            return `<div class="mls-power-note">No ROS rankings for this league yet, so Buy/Sell can't be evaluated here. Switch to it and add ROS rankings on the Roster tab.</div>`;
        }
        if (!ctx.missing && ctx.source === 'market') {
            return `<div class="mls-power-note">No ROS rankings for this league yet, so it's evaluated with Market Consensus instead. Add ROS rankings on the Roster tab for a board built for this league.</div>`;
        }
        return '';
    }
