// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3C: WAIVER WIRE ASSISTANT:
// AUTO-FIND, incl. the Scan Pasted List controls, and autoFindWaiverUpgrades (which sat after
// ALL-LEAGUES PLAYER SEARCH).
import { getSleeperPlayerMap } from '../../shared/api/sleeper.js';
import { buildRankDisplayIndex, checkAgainstLineup, compareForScan, findFreeAgents, FLEX_POSITIONS, matchesPosFilter, upgradeGap } from './waiverScanner.js';
import { escapeHtml } from '../../shared/html.js';
import { FANTASY_POSITIONS, RANKING_TYPE_CONFIG, fantasyPosition, slotDisplayName, tierTag } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague, getShortInjuryStatus, isConnectionError, isUnavailableThisWeek, rankingIndex } from '../helpers.js';
import { getByeBadgeHTML, getGameInfoHTML, hasKickedOff } from '../lineup/gameInfo.js';
import { getSoSBadgeHTML } from '../sos.js';
import { runScout } from './engine.js';
import { isFullyMappedLeague } from './allLeaguesSearch.js';
import { isAutoLockOverridden, optimizeLineup } from '../main.js';
import { isDraftPickName } from '../trade/valueCurve.js';
import { KEYS } from '../../shared/storage/keys.js';
import { normalizeName } from '../../shared/names.js';
import { isPreferredSleeperEntry } from '../players.js';
import { formatUnmatchedNames } from '../../shared/rankings/uploadPreview.js';

    // --- WAIVER WIRE ASSISTANT: AUTO-FIND ---
    // One scanner, two lenses, picked with the "Compare Against" toggle:
    //   Starting Lineup -- which available players would crack your lineup THIS week, and who
    //                      they'd replace. Adds each free agent to your current starters and
    //                      re-runs the optimizer's own slotting (see checkAgainstLineup in
    //                      scout/waiverScanner.js), so a WR pickup that bumps your FLEX RB says so.
    //   Whole Roster    -- which available players rank ahead of your weakest rostered player
    //                      at the position (the drop candidate). This is the original Auto-Find
    //                      Upgrades behavior, now run against one chosen rankings set.
    // Scan order is the person's choice (Weekly or ROS rank). The lineup check itself always
    // uses the same rankings the optimizer does (Weekly when loaded, else ROS) so the two can
    // never disagree. Every card carries the "Would Start" pill regardless of lens, and the
    // same context also powers the Scan Pasted List path (see runScout's waiver branch).

    // Clean name -> { id, pos, team, inj } off the full Sleeper player map, cached for the
    // session. Fantasy positions only, by fantasyPosition (constants.js), so Travis Hunter (listed DB,
    // scored at WR) is in as a WR. On a name collision the winner is the entry
    // getCleanNameToIdIndex picks too (isPreferredSleeperEntry in players.js: an NFL team, then the
    // lower search_rank, since every entry here has a fantasy position), so a retired or
    // practice-squad namesake can't decide whether a free agent is reported as playing at all.
    // Before refactor 9C this preferred a team only and otherwise kept the first entry, and read
    // only the listed position, which left two-way players out.
    let _sleeperMetaByNamePromise = null;
    export function getSleeperMetaByName() {
        if (_sleeperMetaByNamePromise) return _sleeperMetaByNamePromise;
        _sleeperMetaByNamePromise = getSleeperPlayerMap().then(map => {
            const index = {};
            Object.entries(map).forEach(([id, p]) => {
                const pos = fantasyPosition(p);
                if (!p.first_name || !FANTASY_POSITIONS.includes(pos)) return;
                const clean = normalizeName(`${p.first_name} ${p.last_name}`);
                // age feeds the Power Rankings' future-value score (see getPowerAgeIndex);
                // birth_date is preferred there when present, since Sleeper's age field can
                // lag a birthday.
                const entry = { id, pos, team: p.team || null, inj: getShortInjuryStatus(p), age: p.age ?? null, birthDate: p.birth_date || null };
                if (!index[clean] || isPreferredSleeperEntry(p, map[index[clean].id])) index[clean] = entry;
            });
            return index;
        }).catch(err => {
            _sleeperMetaByNamePromise = null;
            throw err;
        });
        return _sleeperMetaByNamePromise;
    }

    const WAIVER_SCAN_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

    export const WAIVER_MODES = ['top', 'auto', 'list'];
    const WAIVER_MODE_HINTS = {
        top: 'The best-ranked players nobody in this league has rostered, by your rankings.',
        auto: 'Free agents measured against your starting lineup or your whole roster.',
        list: 'Paste the players you want to check, in this league or across all your leagues.'
    };

    export const updateWaiverScanSetting = function(key, value) {
        State.waiverScanSettings[key] = value;
        localStorage.setItem(KEYS.mls.waiverScanSettings, JSON.stringify(State.waiverScanSettings));
        applyWaiverScanSettingsToUI();
    };

    export function applyWaiverScanSettingsToUI() {
        const s = State.waiverScanSettings;
        const set = (id, prop, val) => { const el = document.getElementById(id); if (el) el[prop] = val; };
        set('waiverScanBasis', 'value', s.basis);
        set('waiverScanLimit', 'value', String(s.limit));
        set('waiverScanStartersOnly', 'checked', !!s.startersOnly);
        const pressed = (selector, isOn) => document.querySelectorAll(selector).forEach(b => {
            const on = isOn(b);
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        // Position chips look and light up like Draft Strategist's Tracker filters (.pos-filter in
        // css/base.css): the picked one at full color, ALL lighting every chip, the rest faded.
        // aria-pressed marks only the picked chip.
        document.querySelectorAll('#waiverPosChips [data-pos]').forEach(b => {
            b.classList.toggle('active-filter', s.pos === 'ALL' || b.dataset.pos === s.pos);
            b.setAttribute('aria-pressed', b.dataset.pos === s.pos ? 'true' : 'false');
        });

        // --- MODE (Top Available | Auto-Find | Check a List), improvements S1 ---
        // One card, one results area: each block lists the modes it belongs to in
        // data-waiver-modes, and the rest are hidden.
        const mode = WAIVER_MODES.includes(s.mode) ? s.mode : 'top';
        pressed('#waiverModeToggle [data-mode]', b => b.dataset.mode === mode);
        document.querySelectorAll('[data-waiver-modes]').forEach(el => {
            el.hidden = !el.dataset.waiverModes.split(' ').includes(mode);
        });
        const modeHint = document.getElementById('waiverModeHint');
        if (modeHint) modeHint.innerText = WAIVER_MODE_HINTS[mode];
        // Check a List reads Position only for its Whole Roster verdict (pastedRosterVerdict:
        // FLEX groups RB/WR/TE, anything else compares within the player's position), so the chips
        // show there only with Whole Roster, under a label that says what they do.
        const posWrap = document.getElementById('waiverPosWrap');
        if (posWrap && mode === 'list' && s.compare !== 'roster') posWrap.hidden = true;
        set('waiverPosLabel', 'innerText', mode === 'list' ? 'Compare Within' : 'Position');
        document.querySelectorAll('#waiverCompareToggle [data-compare]').forEach(b => {
            const on = b.dataset.compare === s.compare;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        // "Only Would-Starts" filters the Starting Lineup lens; Whole Roster already filters to
        // upgrades by definition, so the toggle would do nothing there -- hide it instead.
        const wrap = document.getElementById('waiverScanStartersOnlyWrap');
        if (wrap) wrap.style.visibility = s.compare === 'roster' ? 'hidden' : 'visible';
        const hint = document.getElementById('waiverCompareHint');
        if (hint) hint.innerText = s.compare === 'roster'
            ? 'Free agents ranked ahead of your weakest rostered player at each position (your drop candidate).'
            : 'Free agents who would crack your current starting lineup this week, and who they would replace.';

        // --- SCAN PASTED LIST: SEARCH IN (This League | All My Leagues) ---
        // Only the pasted-list half of the card reads this; Auto-Find is always single-league
        // (it's driven by one league's lineup/roster, which has no cross-league equivalent).
        const allLeagues = s.scope === 'all';
        document.querySelectorAll('#waiverScopeToggle [data-scope]').forEach(b => {
            const on = (b.dataset.scope === 'all') === allLeagues;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const scopeHint = document.getElementById('waiverScopeHint');
        if (scopeHint) scopeHint.innerText = allLeagues
            ? "Checks every league you've synced at once: where each player is a free agent, where you already own him, and who has him elsewhere."
            : 'Checks these players against the league you have active, using the Compare Against and Rank By settings above.';
        // The button label doubles as the reminder of which mode is armed -- the results
        // below it look different enough between the two that "Scan Pasted List" alone would
        // leave someone guessing which one they just ran.
        set('waiverScanBtn', 'innerText', allLeagues ? 'Search All My Leagues' : 'Scan Pasted List');

        // --- LOOKING TO (Buy / Add | Sell / Drop) ---
        // Only means anything to the All My Leagues search, so it's hidden in This League mode
        // rather than left visible and inert.
        const sellIntent = s.intent === 'sell';
        const intentWrap = document.getElementById('waiverIntentWrap');
        if (intentWrap) intentWrap.style.display = allLeagues ? '' : 'none';
        document.querySelectorAll('#waiverIntentToggle [data-intent]').forEach(b => {
            const on = (b.dataset.intent === 'sell') === sellIntent;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const intentHint = document.getElementById('waiverIntentHint');
        if (intentHint) intentHint.innerText = sellIntent
            ? "Flags leagues where you own him and you'd still be in decent shape at his position without him - where you can afford to sell."
            : "Flags leagues where you're weak at his position (by Positional Power Rankings) and he'd move you up - where it's worth adding or trading for him.";
        const waiverInput = document.getElementById('waiverInput');
        if (waiverInput) waiverInput.placeholder = allLeagues
            ? 'Paste the players to look up… (e.g. Isiah Pacheco, Puka Nacua)'
            : 'Paste waiver targets here… (e.g. Isiah Pacheco, Puka Nacua)';
    }

    // The Waiver Wire Assistant's "Rank By" choice, resolved against what's actually loaded:
    // the person's pick, or the other set (with a note saying so) when the picked one hasn't
    // been uploaded. Returns null only when neither set exists. Shared by Auto-Find and Scan
    // Pasted List so the two can't drift apart on which rankings a card is built from -- the
    // pasted list used to ignore Rank By entirely and always show Weekly-led cards.
    export function resolveWaiverBasis() {
        const wanted = State.waiverScanSettings.basis === 'ros' ? 'ros' : 'weekly';
        const setFor = (b) => (b === 'ros' ? State.rosRankings : State.weeklyRankings);
        let basis = wanted, rankings = setFor(wanted), note = '';
        if (rankings.length === 0) {
            const other = wanted === 'ros' ? 'weekly' : 'ros';
            if (setFor(other).length === 0) return null;
            note = `No ${wanted === 'ros' ? 'ROS' : 'Weekly'} rankings loaded for this league - using ${other === 'ros' ? 'ROS' : 'Weekly'} rank instead.`;
            basis = other;
            rankings = setFor(other);
        }
        const byName = {};
        rankings.forEach(r => { byName[r.cleanName] = r; });
        return {
            basis, rankings, byName, note,
            label: basis === 'ros' ? 'ROS' : 'Wk',
            name: basis === 'ros' ? 'ROS' : 'Weekly'
        };
    }

    // Whole Roster lens benchmark: your rostered players in one position group, weakest last,
    // by the same comparator that orders free agents (compareForScan), so "ranked ahead of your
    // weakest" means the same thing everywhere. Raw basis ranks drive the comparison; the
    // derived display ranks keep the same order within a group, so the numbers shown agree.
    // Also the Dashboard's Best Available card's upgrade check (scout/bestAvailable.js).
    //
    // Only your active roster counts (improvements S5, round 6, owner's request): taxi-squad players
    // and anyone Sleeper lists as IR, Out, PUP, NFI, suspended or did-not-report are left out and
    // returned as `skipped` ({ name, why }) so the UI can say so. Before, an injured star on IR, or
    // an Out player, both unranked in Weekly rankings because they aren't playing, became "your
    // weakest", and every free agent beat him. Statuses are the roster's own (`inj`, `isTaxi`), set
    // at the last sync, like ownership. Questionable and Doubtful players still count.
    export function rosterBenchmark(league, getPos, basisByName, filter) {
        const skipped = [];
        const mine = (league.roster || [])
            .map(p => ({ ...p, pos: getPos(p.cleanName) }))
            .filter(p => matchesPosFilter(p.pos, filter))
            .filter(p => {
                const why = notOnActiveRoster(p);
                if (why) skipped.push({ name: p.name, why });
                return !why;
            })
            .map(p => {
                const r = basisByName[p.cleanName] || {};
                return { ...p, rank: r.rank ?? 999, posRank: r.posRank ?? 999, flexRank: r.flexRank ?? 999 };
            })
            .sort((a, b) => compareForScan(a, b, filter));
        skipped.sort((a, b) => a.name.localeCompare(b.name));
        return { mine, bench: mine.length ? mine[mine.length - 1] : null, skipped };
    }

    const INACTIVE_STATUSES = ['IR', 'OUT', 'PUP', 'NFI', 'SUS', 'DNR'];
    // Why a rostered player isn't on your active roster ('taxi', or his short injury status), or null.
    function notOnActiveRoster(p) {
        if (p.isTaxi) return 'taxi';
        return INACTIVE_STATUSES.includes(p.inj) ? p.inj : null;
    }

    // "A.J. Brown (taxi), Garrett Wilson (OUT)" for rosterBenchmark's skipped list.
    export function skippedPlayersText(skipped) {
        return (skipped || []).map(s => `${escapeHtml(s.name)} (${escapeHtml(s.why)})`).join(', ');
    }

    // A league's position lookup for the waiver tools: the league's own synced positions, then the
    // cached Sleeper player map (meta, from getSleeperMetaByName), then market values, else 'UNK'.
    // getPos is called once per free agent in a scan, so the market fallback is indexed rather than
    // re-scanned each time. Shared with the Dashboard's Best Available card (scout/bestAvailable.js).
    export function makeLeagueGetPos(league, meta) {
        const marketIndex = rankingIndex(State.marketRankings);
        return (clean) => {
            if (league.globalPosMap && league.globalPosMap[clean]) return league.globalPosMap[clean];
            if (meta && meta[clean]) return meta[clean].pos;
            const m = marketIndex.get(clean);
            return (m && m.pos) ? m.pos : 'UNK';
        };
    }

    // A league's saved starting lineup (State.manualStartersMap, written by the optimizer and by
    // swaps) as checkAgainstLineup's [{ slotType, player }]; [] when it has none yet.
    function savedStarters(leagueId) {
        return (State.manualStartersMap[leagueId] || [])
            .map(st => ({ slotType: st.slot.replace(/[0-9]/g, ''), player: st.player }));
    }

    // checkAgainstLineup's callbacks for one league: ranks from `byName` (raw posRank/flexRank, the
    // same fields optimizeLineup reads; the derived display ranks keep the same order within each
    // group, so verdicts and shown numbers agree), that league's locks and kickoff auto-locks, and
    // this week's byes and hard-outs. Shared with the Dashboard's Best Available card.
    export function lineupCheckDeps(leagueId, byName) {
        const locks = State.lockedPlayersMap[leagueId] || [];
        return {
            rankOf: (p) => byName[p.cleanName] || null,
            isLocked: (p) => locks.includes(p.id) || (hasKickedOff(p) && !isAutoLockOverridden(leagueId, p.id)),
            isUnavailable: (p) => isUnavailableThisWeek(p)
        };
    }

    // A ranked free agent as a lineup player, with his team and injury from the Sleeper player map.
    export function freeAgentPlayer(fa, meta) {
        const m = (meta && meta[fa.cleanName]) || {};
        return { id: m.id || `fa:${fa.cleanName}`, name: fa.name, cleanName: fa.cleanName, pos: fa.pos, team: m.team || null, inj: m.inj || null };
    }

    // Everything a waiver card needs, built once per scan: positions/teams/injuries from Sleeper,
    // display ranks for both rankings sets, your current starters, and an evaluate(fa) that runs
    // the lineup check. lineupReady is false when no starting lineup could be built -- callers
    // still render ranks, just without a verdict. `scan` is the resolved Rank By basis (see
    // resolveWaiverBasis), which decides which rankings lead each card's rank line.
    export async function buildWaiverContext(league) {
        let meta = {};
        try {
            meta = await getSleeperMetaByName();
        } catch (e) {
            console.warn('Waiver scan: Sleeper player map unavailable, falling back to league/market positions.', e);
        }

        const getPos = makeLeagueGetPos(league, meta);

        const checkIsWeekly = State.weeklyRankings.length > 0;
        const checkRankings = checkIsWeekly ? State.weeklyRankings : State.rosRankings;
        const checkByName = {};
        checkRankings.forEach(r => { checkByName[r.cleanName] = r; });
        const rosByName = {};
        State.rosRankings.forEach(r => { rosByName[r.cleanName] = r; });
        const wkDisplay = buildRankDisplayIndex(State.weeklyRankings, getPos);
        const rosDisplay = buildRankDisplayIndex(State.rosRankings, getPos);

        if (!State.manualStartersMap[State.activeLeagueId]) optimizeLineup(false);
        const currentStarters = savedStarters(State.activeLeagueId);
        const lineupReady = currentStarters.length > 0 && checkRankings.length > 0;
        const deps = lineupCheckDeps(State.activeLeagueId, checkByName);

        // Cheap "his game already kicked off" test -- no lineup simulation needed, so the scan
        // can filter these out before applying the Show Top limit rather than after.
        const hasPlayed = (fa) => {
            const m = meta[fa.cleanName];
            return !!(m && m.team && hasKickedOff({ team: m.team }));
        };

        const evaluate = (fa) => {
            const player = freeAgentPlayer(fa, meta);
            let verdict = null;
            if (!player.team && meta[fa.cleanName]) verdict = { status: 'noTeam' };
            else if (hasKickedOff(player)) verdict = { status: 'kickedOff' };
            else if (lineupReady) verdict = checkAgainstLineup(player, currentStarters, deps);
            return { fa, player, verdict };
        };

        const scan = resolveWaiverBasis();

        // *Cross: which number a cross-position head-to-head (FLEX slot, WR vs RB) is shown in.
        // Weekly files carry a FLEX list, so 'flex'; ROS files carry Overall instead, so
        // 'overall' -- "ROS Flex" isn't a number any ROS source actually publishes.
        return {
            league, meta, getPos, evaluate, hasPlayed, lineupReady, checkIsWeekly,
            checkLabel: checkIsWeekly ? 'Wk' : 'ROS',
            checkDisplay: checkIsWeekly ? wkDisplay : rosDisplay,
            checkCross: checkIsWeekly ? 'flex' : 'overall',
            wkDisplay, rosDisplay, rosByName,
            scan,
            scanDisplay: scan && scan.basis === 'ros' ? rosDisplay : wkDisplay,
            scanCross: scan && scan.basis === 'ros' ? 'overall' : 'flex'
        };
    }

    // What a file actually leaves the app to infer -- and whether that's worth saying at all,
    // which depends on the rankings type:
    //   ROS exports normally carry an Overall rank and a Positional rank, and no FLEX list. A
    //     derived FLEX rank there is the expected shape, not a problem, so it isn't flagged --
    //     and telling someone to "upload a FLEX file" for ROS would be bad advice.
    //   Weekly exports normally DO carry a FLEX list (that's the sheet FLEX starts come from),
    //     so a missing one there is worth mentioning.
    // A missing positional rank column is worth mentioning either way. Returns null when there's
    // nothing notable, so callers show no notice at all.
    export function derivedRanksWording(derivedPos, derivedFlex, isWeekly) {
        const flexNotable = !!isWeekly && derivedFlex;
        if (!derivedPos && !flexNotable) return null;

        const typeName = isWeekly ? 'Weekly' : 'ROS';
        if (derivedPos && flexNotable) return {
            title: 'Position and FLEX ranks will be derived',
            short: 'position ranks (WR1, RB2, …) or FLEX ranks',
            detail: `This file is one overall list with no positional rank column and no FLEX list, so both are derived from its order - positions by ordering each position group, FLEX by ordering RB/WR/TE. ${typeName} exports usually include both; re-exporting with a "Pos Rank" column and a FLEX list (or uploading per-position files) would use your source's own numbers.`
        };
        if (derivedPos) return {
            title: 'Position ranks will be derived',
            short: 'position ranks (WR1, RB2, …)',
            detail: `This file has no positional rank column, so position ranks are derived by ordering each position group by overall rank. ${typeName} exports usually include one; re-exporting with a "Pos Rank" column, or uploading per-position files, would use your source's own numbers.`
        };
        return {
            title: 'FLEX ranks will be derived',
            short: 'FLEX ranks',
            detail: 'Position ranks come straight from this file\'s own positional rank column. It has no FLEX list, though, so FLEX ranks are derived by ordering your RB/WR/TE by overall rank. Weekly exports usually include a FLEX list; if yours does, re-export with it (or upload it as the FLEX file in per-position mode) to use your source\'s numbers.'
        };
    }

    // "Weekly rankings" -- or 'Weekly rankings ("Borischen Wk 2")' when this league has a saved
    // named set assigned, since someone juggling several sets needs to know WHICH file a notice
    // is about, not just whether it was the weekly or ROS one.
    function rankingSetLabel(type) {
        const cfg = RANKING_TYPE_CONFIG[type];
        const league = getActiveLeague();
        const setId = league ? league[cfg.leagueSetIdKey] : null;
        const set = setId ? State.rankingSets[cfg.setsKey].find(x => x.id === setId) : null;
        const base = `${cfg.label} rankings`;
        return set && set.name ? `${base} ("${escapeHtml(set.name)}")` : base;
    }

    // Which names in a just-parsed rankings file don't correspond to any Sleeper player. Every
    // cross-reference in this app (roster, lineup, waivers) matches on normalized name, so an
    // unmatched name means that player silently stays unranked everywhere -- worth surfacing at
    // upload time, while the file is still easy to fix. Draft picks are excluded (dynasty files
    // legitimately list them and they're not Sleeper players). Returns an empty list if the
    // player map can't be fetched, so this never blocks or fails an upload.
    // Also reports whether this file's Pos/Flex ranks will have to be derived (see
    // buildRankDisplayIndex) -- both answers come off the same player-map fetch, and both are
    // things worth knowing while the file is still easy to re-export.
    export async function analyzeRankingsFile(parsedData) {
        let meta;
        try {
            meta = await getSleeperMetaByName();
        } catch (e) {
            return { names: [], total: 0, checked: false, derivedPos: false, derivedFlex: false };
        }
        const league = getActiveLeague();
        const posMap = (league && league.globalPosMap) || {};
        const names = [];
        (parsedData || []).forEach(p => {
            if (!p || !p.cleanName || isDraftPickName(p.name)) return;
            if (meta[p.cleanName] || posMap[p.cleanName]) return;
            names.push(p.name);
        });

        const getPos = (clean) => posMap[clean] || (meta[clean] ? meta[clean].pos : 'UNK');
        const display = Object.values(buildRankDisplayIndex(parsedData, getPos));
        return {
            names, total: names.length, checked: true,
            derivedPos: display.some(d => d.posDerived),
            derivedFlex: display.some(d => d.flexDerived)
        };
    }

    function waiverRankHTML(val, tier, prefix = '#') {
        return (val === null || val === undefined)
            ? `<strong class="mls-muted-rank">UR</strong>`
            : `<strong>${prefix}${val}</strong>${tierTag(tier)}`;
    }

    // The rank line every waiver card shows, led by whichever set Rank By resolved to:
    //   Weekly -- Wk Pos / Wk Flex / ROS overall (ROS kept as rest-of-season context).
    //   ROS    -- ROS Pos / ROS Overall, the two numbers ROS sources actually publish (no
    //             FLEX list -- the parser stores Overall in flexRank for those files, which is
    //             why "ROS Flex" isn't shown). Overall is shown for every position, QBs
    //             included, since the overall list covers them. Weekly numbers are left off:
    //             with ROS picked they read as the basis. The Starting Lineup verdict line
    //             below still cites its Wk numbers, since that check is a this-week question
    //             (see buildWaiverContext's checkRankings).
    // Wk Flex only for RB/WR/TE.
    export function waiverRanksRowHTML(ctx, cleanName, pos) {
        const wk = ctx.wkDisplay[cleanName] || {};
        const ros = ctx.rosDisplay[cleanName] || {};
        const rosRaw = ctx.rosByName[cleanName];
        const isFlexPos = FLEX_POSITIONS.includes(pos);

        if (ctx.scan && ctx.scan.basis === 'ros') {
            const rosPos = ros.posRank ? `<strong class="mls-stat-green">${escapeHtml(pos)}${ros.posRank}</strong>${tierTag(ros.posTier)}` : `<strong class="mls-muted-rank">UR</strong>`;
            return `<div class="mls-meta-row mls-scan-ranks"><span>ROS Pos: ${rosPos}</span><span>ROS Overall: ${waiverRankHTML(rosRaw ? rosRaw.rank : null, rosRaw ? rosRaw.tier : null)}</span></div>`;
        }

        const rosCell = rosRaw
            ? `<span>ROS: <strong class="mls-stat-green">#${rosRaw.rank}</strong>${tierTag(rosRaw.tier)}${ros.posRank ? ` <span class="mls-rank-sep">&middot;</span> ${escapeHtml(pos)}${ros.posRank}` : ''}</span>`
            : `<span>ROS: <strong class="mls-muted-rank">UR</strong></span>`;
        const flexCell = isFlexPos ? `<span>Wk Flex: ${waiverRankHTML(wk.flexRank, wk.flexTier)}</span>` : '';
        const wkPos = wk.posRank ? `<strong class="mls-stat-blue">${escapeHtml(pos)}${wk.posRank}</strong>${tierTag(wk.posTier)}` : `<strong class="mls-muted-rank">UR</strong>`;
        return `<div class="mls-meta-row mls-scan-ranks"><span>Wk Pos: ${wkPos}</span>${flexCell}${rosCell}</div>`;
    }

    // Whole Roster verdict for ONE player off a pasted list -- the per-card version of what
    // Auto-Find's renderRosterGroup does for a whole group. Group follows Auto-Find's Position
    // setting: FLEX compares RB/WR/TE against your weakest FLEX-eligible player; anything else
    // (a single position, All, or a QB/K/DEF under FLEX) compares within the player's own
    // position, the same way All groups them. Returns { line, upgrade }.
    export function pastedRosterVerdict(ctx, player) {
        const filter = (State.waiverScanSettings.pos === 'FLEX' && FLEX_POSITIONS.includes(player.pos)) ? 'FLEX' : player.pos;
        const groupLabel = filter;
        const { bench, skipped } = rosterBenchmark(ctx.league, ctx.getPos, ctx.scan.byName, filter);
        if (!bench) {
            const line = skipped.length
                ? `You have no active ${groupLabel} on your roster to compare against (not counted: ${skipped.map(x => `${escapeHtml(x.name)}, ${escapeHtml(x.why)}`).join('; ')}).`
                : `You have no ${groupLabel} on your roster to compare against.`;
            return { line, upgrade: false };
        }
        const faRanks = ctx.scan.byName[player.cleanName] || {};
        const ahead = compareForScan({ pos: player.pos, rank: faRanks.rank, posRank: faRanks.posRank, flexRank: faRanks.flexRank }, bench, filter) < 0;
        const basis = filter === 'FLEX' ? 'flex' : 'pos';
        // Upgrade means a better tier when both are tiered (improvements S8, round 4): see isTierUpgrade.
        // It also decides Check a List's sort order (scout/engine.js puts upgrades first).
        const upgrade = ahead && isTierUpgrade(player, bench, ctx.scanDisplay, basis, ctx.scanCross);
        const line = waiverCompareLine(player, bench, `weakest ${groupLabel}`, upgrade ? 'Upgrade over' : ahead ? 'Ranked ahead of' : "Doesn't pass",
            ctx.scanDisplay, ctx.scan.label, basis, ctx.scanCross);
        return { line, upgrade };
    }

    // Last name only, for labelling the two numbers in a comparison line ("Dobbins #58, Evans
    // #20"). Drops generational suffixes so "Chris Godwin Jr." reads as "Godwin", and falls back
    // to the whole string for single-word names (team defenses come through as "Broncos").
    function shortPlayerName(full) {
        const parts = String(full || '').trim().split(/\s+/).filter(t => !/^(jr|sr|ii|iii|iv|v)\.?$/i.test(t));
        return escapeHtml(parts.length > 1 ? parts[parts.length - 1] : (parts[0] || String(full || '')));
    }

    // The tier that belongs to a display rank field (buildRankDisplayIndex): Overall's list tier, the
    // FLEX list's, or the position list's. A derived rank has no tier of its own (null), so it shows none.
    const DISPLAY_TIER_FIELD = { rank: 'tier', flexRank: 'flexTier', posRank: 'posTier' };

    // " · 1 tier up" / " · same tier" / " · 2 tiers down" after a verdict (improvements S8, round 2, owner's
    // choice): the free agent's tier against his, from the same list as the numbers under it, said in
    // words so a tier jump reads at a glance. Display only: the verdict itself doesn't change. "" unless
    // both are tiered.
    function tierGapHTML(faTier, otherTier) {
        if (!isTiered(faTier) || !isTiered(otherTier)) return '';
        const n = Math.abs(otherTier - faTier);
        const text = n === 0 ? 'same tier' : `${n} tier${n === 1 ? '' : 's'} ${faTier < otherTier ? 'up' : 'down'}`;
        const cls = n === 0 ? 'is-same' : faTier < otherTier ? 'is-up' : 'is-down';
        return ` <span class="mls-tier-gap ${cls}" title="Tier ${faTier} against tier ${otherTier}"><span class="mls-rank-sep">&middot;</span> ${text}</span>`;
    }

    // Which number a comparison shows (and so which tiers it reads): Flex/Overall for a cross-position
    // or flex-slot head-to-head, else position. See waiverCompareLine for basis and crossKind.
    function comparedTiers(faPlayer, other, slotType, display, basis, crossKind) {
        const bothFlex = FLEX_POSITIONS.includes(faPlayer.pos) && FLEX_POSITIONS.includes(other.pos);
        const useFlex = basis === 'flex' ? bothFlex
            : basis === 'pos' ? false
            : bothFlex && (['FLEX', 'SFLEX', 'WRRB', 'WRTE'].includes(slotType) || faPlayer.pos !== other.pos);
        const crossField = crossKind === 'overall' ? 'rank' : 'flexRank';
        const faD = display[faPlayer.cleanName] || {};
        const oD = display[other.cleanName] || {};
        const tierOf = (d) => useFlex ? d[DISPLAY_TIER_FIELD[crossField]] : d.posTier;
        return { useFlex, crossField, faD, oD, faTier: tierOf(faD), oTier: tierOf(oD) };
    }

    // What "upgrade" means across Lineup Strategist (improvements S8, rounds 4 and 5, owner's choices):
    // the Dashboard's rule, upgradeGap (waiverScanner.js), on the numbers the line shows. For a free agent
    // already ranked ahead of your player: a better tier when both are tiered, else at least
    // UPGRADE_MIN_GAP (3) spots better; your unranked player loses to any ranked free agent. Anyone else
    // ranked ahead reads "Ranked ahead of" and isn't counted.
    const isTiered = (t) => Number.isFinite(t) && t > 0;
    function isTierUpgrade(faPlayer, other, display, basis, crossKind) {
        const { useFlex, crossField, faD, oD, faTier, oTier } = comparedTiers(faPlayer, other, null, display, basis, crossKind);
        const field = useFlex ? crossField : 'posRank';
        if (!oD[field]) return true;
        return upgradeGap({ faRank: faD[field], faTier, benchRank: oD[field], benchTier: oTier }) !== null;
    }

    // "Replaces Mike Evans (your FLEX) -- Wk Flex: Dobbins #58, Evans #20". Both numbers carry
    // the name they belong to: an earlier "#58 vs #20" left it to the reader to work out which
    // rank was whose, and the starter's number reads as the free agent's at a glance.
    // basis: 'flex' | 'pos' | 'auto'. Auto picks the number that actually decides that
    // head-to-head: FLEX/SFLEX battles between flex-eligible players are decided by Flex rank;
    // same-position slots (and QB vs QB) by position rank.
    // crossKind: which number stands in for a cross-position head-to-head -- 'flex' (Weekly
    // files, which carry a FLEX list) or 'overall' (ROS files, which carry Overall instead).
    // Only the label and the number shown change; the verdict itself was already decided by
    // the caller, and ordering RB/WR/TE by Overall is the same order the FLEX comparison uses.
    // The verb is the caller's: "Upgrade over" only for a tier jump (isTierUpgrade).
    function waiverCompareLine(faPlayer, other, slotType, verb, display, label, basis = 'auto', crossKind = 'flex') {
        // Each number carries the tier of the list it came from (improvements S8), like the card's rank
        // row: Overall -> tier, Flex -> flexTier, position -> posTier. Untiered files add nothing.
        const { useFlex, crossField, faD, oD, faTier, oTier } = comparedTiers(faPlayer, other, slotType, display, basis, crossKind);
        const crossName = crossKind === 'overall' ? 'Overall' : 'Flex';
        const fmt = (v, pos, tier) => (v === null || v === undefined) ? 'unranked' : `${useFlex ? `#${v}` : `${escapeHtml(pos)}${v}`}${tierTag(tier)}`;
        const faVal = useFlex ? faD[crossField] : faD.posRank;
        const oVal = useFlex ? oD[crossField] : oD.posRank;
        const slotText = slotType ? ` <span class="mls-nowrap">(your ${slotType === 'SFLEX' ? 'SUPERFLEX' : slotDisplayName(slotType)})</span>` : '';
        // The two ranks go on their own line under the verdict (see .mls-verdict-nums), and each
        // label/name+rank pair is kept unbreakable -- at phone width this line otherwise wrapped
        // mid-phrase ("Wk" on one line, "Flex: Dobbins #58" on the next), which read as garbled.
        const nums = `<span class="mls-nowrap">${label} ${useFlex ? crossName : 'Pos'}:</span> `
            + `<span class="mls-nowrap">${shortPlayerName(faPlayer.name)} ${fmt(faVal, faPlayer.pos, faTier)}</span>, `
            + `<span class="mls-nowrap">${shortPlayerName(other.name)} ${fmt(oVal, other.pos, oTier)}</span>`;
        // His SoS badge beside his name (improvements S7), so both schedules sit side by side.
        return `${verb} <strong>${escapeHtml(other.name)}</strong>${getSoSBadgeHTML(other.team, other.pos, WAIVER_SOS_OPTS)}${slotText}${tierGapHTML(faTier, oTier)}<span class="mls-verdict-nums">${nums}</span>`;
    }

    // Pill + one-line explanation for a lineup verdict. Returns a neutral pill when there's no
    // verdict (no lineup yet) so the caller never has to special-case it.
    export function waiverVerdictParts(ctx, { player, verdict }) {
        if (!verdict) return { pill: '', line: '' };
        const pill = (cls, text) => `<span class="scout-status ${cls}">${text}</span>`;
        const onBye = !!getByeBadgeHTML(player.team);
        switch (verdict.status) {
            case 'starts':
                return {
                    pill: pill('mls-verdict-start', 'Would Start'),
                    line: verdict.displaced
                        ? waiverCompareLine(player, verdict.displaced, verdict.displacedSlotType, 'Replaces', ctx.checkDisplay, ctx.checkLabel, 'auto', ctx.checkCross)
                        : 'Fills an empty lineup slot'
                };
            case 'bench':
                return { pill: pill('mls-verdict-bench', 'Bench'), line: waiverCompareLine(player, verdict.bubble, verdict.bubbleSlotType, 'Would need to pass', ctx.checkDisplay, ctx.checkLabel, 'auto', ctx.checkCross) };
            case 'unavailable':
                return { pill: pill('mls-verdict-out', onBye ? 'Bye' : 'Out'), line: onBye ? 'On bye this week - a stash, not a start.' : `Listed ${escapeHtml(player.inj || 'out')} - can't start this week.` };
            case 'kickedOff':
                return { pill: pill('mls-verdict-out', 'Played'), line: 'His game already kicked off - no help this week.' };
            case 'locked':
                return { pill: pill('mls-verdict-bench', 'Locked'), line: `Every ${escapeHtml(player.pos)}-eligible lineup spot is locked (manual lock or game started).` };
            case 'noTeam':
                return { pill: pill('mls-verdict-out', 'No Team'), line: 'Not on an NFL roster per Sleeper.' };
            default:
                return { pill: pill('mls-verdict-bench', 'No Slot'), line: `Your lineup has no ${escapeHtml(player.pos)}-eligible slot.` };
        }
    }

    // The Roster tab's SoS badge (js/mls/sos.js) on Auto-Find's and Check a List's cards and comparison
    // lines (improvements S7; not Top Available, owner's choice in round 3), compact like the injury and
    // bye badges. Display only: SoS never changes a rank, order or verdict. Exported for Check a List
    // (scout/engine.js).
    export const WAIVER_SOS_OPTS = { compact: true };

    // One auto-find result card. rosterLine (Whole Roster lens) replaces the lineup explanation
    // line; the lineup pill stays either way so "would he start?" is always answered.
    function renderWaiverScanCard(ctx, row, rosterLine = null) {
        const { fa, player, verdict } = row;
        const { pill, line } = waiverVerdictParts(ctx, row);
        const injBadge = player.inj ? `<span class="badge inj-badge">${escapeHtml(player.inj)}</span>` : '';
        const teamText = player.team ? `<span class="mls-opp">${escapeHtml(player.team)}</span>` : '';
        const shownLine = rosterLine || line;
        return `
        <div class="scout-result-card mls-scan-card ${verdict && verdict.status === 'starts' ? 'mls-scan-card-start' : ''}">
            <div class="mls-scan-main">
                <div class="mls-item-name" style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                    <span class="badge pos-badge ${escapeHtml(player.pos)} mls-pos-badge-sizing">${escapeHtml(player.pos)}</span>
                    <span>${escapeHtml(fa.name)}</span>
                    ${teamText}
                </div>
                <div class="mls-player-badges-row">${injBadge}${getByeBadgeHTML(player.team)}${getGameInfoHTML(player.team)}${getSoSBadgeHTML(player.team, player.pos, WAIVER_SOS_OPTS)}</div>
                ${waiverRanksRowHTML(ctx, fa.cleanName, player.pos)}
                ${shownLine ? `<div class="mls-scan-verdict">${shownLine}</div>` : ''}
            </div>
            <div class="mls-text-right">${pill}</div>
        </div>`;
    }

    // "compared against your weakest rostered player at each position" -- the second half of
    // the summary sentence above both Auto-Find and Scan Pasted List results.
    export function waiverCompareText(ctx, mode) {
        const weekText = State.currentNflWeek ? `Week ${State.currentNflWeek} ` : '';
        return mode === 'roster'
            ? `compared against your weakest rostered player at each position`
            : `checked against your current ${weekText}starting lineup using ${ctx.checkIsWeekly ? 'Weekly' : 'ROS'} ranks`;
    }

    // Summary notes for rankings files whose Pos/Flex ranks had to be derived. Named per set
    // (Weekly / ROS, plus the saved set's name when there is one): with several sets loaded,
    // "a rankings file you loaded" left it unclear which one to fix.
    export function waiverDerivedNotes(ctx) {
        const derivedNote = (display, type) => {
            const vals = Object.values(display);
            const wording = derivedRanksWording(vals.some(d => d.posDerived), vals.some(d => d.flexDerived), type === 'weekly');
            if (!wording) return null;
            return `Your ${rankingSetLabel(type)} don't include ${wording.short}, so those were derived from the file's order.`;
        };
        return [derivedNote(ctx.wkDisplay, 'weekly'), derivedNote(ctx.rosDisplay, 'ros')].filter(Boolean);
    }

    export const setWaiverCompare = function(mode) {
        updateWaiverScanSetting('compare', mode === 'roster' ? 'roster' : 'lineup');
    };

    // Flipping scope clears any results already on screen: a single-league scan and an
    // all-leagues search answer different questions, and leaving the old cards up under a
    // toggle that now says something else is the kind of mismatch that gets misread.
    export const setWaiverScope = function(scope) {
        updateWaiverScanSetting('scope', scope === 'all' ? 'all' : 'league');
        const out = document.getElementById('waiverOutput');
        if (out) out.innerHTML = '';
    };

    // Unlike setWaiverScope, switching Buy/Sell re-runs an existing search in place: the
    // question ("where is he?") hasn't changed, only which leagues get flagged, and the whole
    // search is a local read over stored rosters (plus the day-cached player map) -- cheap
    // enough that making someone press Search again would just be friction.
    export const setWaiverIntent = function(intent) {
        updateWaiverScanSetting('intent', intent === 'sell' ? 'sell' : 'buy');
        const input = document.getElementById('waiverInput');
        const out = document.getElementById('waiverOutput');
        if (State.waiverScanSettings.scope === 'all' && input && input.value.trim() !== '' && out && out.innerHTML.trim() !== '') {
            runScout('waiver');
        }
    };

// autoFindWaiverUpgrades: sat after ALL-LEAGUES PLAYER SEARCH (and isConnectionError, now in
// helpers.js) in legacy.js; moved here in refactor chunk 3C.
    export const autoFindWaiverUpgrades = async function(btn) {
        const outputEl = document.getElementById('waiverOutput');
        if (!outputEl) return;
        const s = State.waiverScanSettings;
        const mode = s.compare === 'roster' ? 'roster' : 'lineup';

        let league = getActiveLeague();
        if (!league || !league.globalRosterMap || !league.roster || league.roster.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">Sync a Sleeper league on the Dashboard first; Auto-Find needs your league's rosters to know who's available.</span>`;
            return;
        }

        // Scan basis: the person's pick, falling back to the other set (and saying so) if the
        // picked one hasn't been uploaded, rather than refusing to run.
        const scan = resolveWaiverBasis();
        if (!scan) {
            outputEl.innerHTML = `<span class="mls-error-text">Upload Weekly (Lineup tab) or ROS (Roster tab) rankings first.</span>`;
            return;
        }
        const basis = scan.basis;
        const scanRankings = scan.rankings;
        const basisNote = scan.note;
        const basisLabel = scan.label;
        const basisName = scan.name;

        const origText = btn ? btn.innerText : '';
        if (btn) { btn.disabled = true; btn.innerText = 'Scanning…'; }
        outputEl.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Scanning the waiver wire…</div>`;

        try {
            const ctx = await buildWaiverContext(league);
            const basisDisplay = basis === 'ros' ? ctx.rosDisplay : ctx.wkDisplay;
            // In a manual / handoff league the scan still works -- it just can't exclude other
            // teams' players, because it never saw them (see isFullyMappedLeague). So the wording
            // says "not on your roster" instead of "available", and a note says to double-check.
            const knowsWholeLeague = isFullyMappedLeague(league);
            const availGroup = (name) => knowsWholeLeague ? `available ${name}` : `${name} outside your roster`;
            const basisByName = scan.byName;

            const posFilter = s.pos || 'FLEX';
            const limit = parseInt(s.limit, 10) || 10;
            const startersOnly = mode === 'lineup' && !!s.startersOnly;

            const { freeAgents, unresolvedCount, unresolvedNames } = findFreeAgents(scanRankings, {
                posFilter, getPos: ctx.getPos,
                isRostered: (clean) => !!league.globalRosterMap[clean],
                isExcluded: (r) => isDraftPickName(r.name)
            });

            // 'ALL' is shown grouped by position rather than as one list: ranks from different
            // positions aren't on the same scale (QB12 isn't "better" than WR20).
            let playedExcluded = 0, allPlayed = false;
            const groups = posFilter === 'ALL'
                ? WAIVER_SCAN_POSITIONS.map(pos => ({ key: pos, filter: pos, items: freeAgents.filter(f => f.pos === pos) }))
                : [{ key: posFilter, filter: posFilter, items: freeAgents }];
            const groupName = (g) => g.filter === 'FLEX' ? 'RB/WR/TE' : g.filter;

            // How many players the scan rankings rank at each position (resolved the same way the
            // free agents are). Lets an empty group say WHY it's empty -- "everyone it ranks is
            // already rostered" vs "this file doesn't rank that position at all" -- instead of
            // disappearing. Before this, All mode silently dropped any position with no
            // available players (a shallow QB list in a deep league, or an RB list whose every
            // name was taken), which read as the position being skipped.
            const rankedAtPos = {};
            scanRankings.forEach(r => {
                if (!r || !r.cleanName || isDraftPickName(r.name)) return;
                const pos = ctx.getPos(r.cleanName);
                if (pos && pos !== 'UNK') rankedAtPos[pos] = (rankedAtPos[pos] || 0) + 1;
            });
            const rankedIn = (g) => WAIVER_SCAN_POSITIONS
                .filter(pos => matchesPosFilter(pos, g.filter))
                .reduce((n, pos) => n + (rankedAtPos[pos] || 0), 0);
            // Shown when a group has no available players at all (not merely none that start
            // or upgrade -- those keep their own wording).
            const noneAvailableText = (g) => {
                const n = rankedIn(g);
                return n > 0
                    ? `Every ${groupName(g)} in your ${basisName} rankings (${n} ranked) is already ${knowsWholeLeague ? 'rostered in this league' : 'on your roster'}.`
                    : `Your ${basisName} rankings don't include any ${groupName(g)}.`;
            };

            const renderLineupGroup = (g) => {
                // This lens answers a this-week question, so a player whose game already kicked
                // off is no help -- he's filtered out BEFORE the Show Top limit, so "top 10"
                // stays ten usable names instead of ten minus whoever already played. The
                // fallback matters late Sunday/Monday: once every game has started, filtering
                // would empty the list, so in that case they're shown anyway and the banner says
                // why. Whole Roster keeps them -- that lens is about rest-of-season roster value,
                // where a player who already played is still a perfectly good add.
                let items = g.items;
                const eligible = items.filter(f => !ctx.hasPlayed(f));
                if (eligible.length > 0) {
                    playedExcluded += items.length - eligible.length;
                    items = eligible;
                } else if (items.length > 0) {
                    allPlayed = true;
                }
                // Evaluate a wider window than we show when filtering to would-starts, so "top 10
                // that would start" doesn't come back empty just because the top 10 all sit.
                const pool = startersOnly ? items.slice(0, Math.max(limit * 5, 50)) : items.slice(0, limit);
                let rows = pool.map(ctx.evaluate);
                if (startersOnly) rows = rows.filter(r => r.verdict && r.verdict.status === 'starts').slice(0, limit);
                const starts = rows.filter(r => r.verdict && r.verdict.status === 'starts').length;
                if (g.items.length === 0) {
                    return { body: `<div class="mls-scan-empty">${noneAvailableText(g)}</div>`, count: 0, countText: 'none available' };
                }
                const body = rows.length
                    ? rows.map(r => renderWaiverScanCard(ctx, r)).join('')
                    : `<div class="mls-scan-empty">${startersOnly ? `No ${availGroup(groupName(g))} would crack your starting lineup this week.` : `No ${availGroup(groupName(g))} found in your ${basisName} rankings.`}</div>`;
                return { body, count: starts, countText: starts > 0 ? `${starts} would start` : 'none would start' };
            };

            // Whole Roster lens: the drop-candidate comparison. Your weakest rostered player in
            // the group (by the same comparator used to order the free agents) is the benchmark;
            // every free agent ranked ahead of him is listed.
            const renderRosterGroup = (g) => {
                const { mine, bench, skipped } = rosterBenchmark(league, ctx.getPos, basisByName, g.filter);
                const notCounted = skipped.length ? `<div class="mls-scan-benchmark-next">Not counted: ${skippedPlayersText(skipped)}.</div>` : '';
                if (!bench) {
                    return { body: `<div class="mls-scan-empty">You have no ${skipped.length ? 'active ' : ''}${groupName(g)} on your roster to compare against.</div>${notCounted}`, count: 0, countText: 'no roster players' };
                }
                const basisKind = g.filter === 'FLEX' ? 'flex' : 'pos';
                const upgrades = g.items.filter(fa => compareForScan(fa, bench, g.filter) < 0).slice(0, limit);
                const rankText = (p) => {
                    const d = basisDisplay[p.cleanName] || {};
                    // Cross-position number: Weekly's FLEX rank, or ROS's Overall (see scanCross).
                    const crossOverall = ctx.scanCross === 'overall';
                    const field = basisKind === 'flex' ? (crossOverall ? 'rank' : 'flexRank') : 'posRank';
                    const v = d[field];
                    if (!v) return `unranked by ${basisName}`;
                    const text = `${basisLabel} ${basisKind === 'flex' ? `${crossOverall ? 'Overall' : 'Flex'} #${v}` : `${escapeHtml(p.pos)}${v}`}`;
                    // His tier for that number (improvements S8), kept on one line with it: "ROS RB8 · T4"
                    // (round 2: no parentheses inside the line's own). Without a tier the text is as before.
                    const tier = d[DISPLAY_TIER_FIELD[field]];
                    return Number.isFinite(tier) && tier > 0
                        ? `<span class="mls-nowrap">${text} <span class="mls-rank-sep">&middot;</span> <span class="mls-tier" title="Tier ${tier}">T${tier}</span></span>`
                        : text;
                };
                // Each "name (rank)" is one piece that wraps whole (round 2), so a phone never leaves a
                // name at the end of one line and his rank on the next. The comma rides with its piece.
                const nextUpNames = mine.slice(Math.max(0, mine.length - 3), mine.length - 1).reverse();
                const nextUp = nextUpNames.map((p, i) =>
                    `<span class="mls-scan-next-item">${escapeHtml(p.name)} (${rankText(p)})${i < nextUpNames.length - 1 ? ',' : ''}</span>`);
                const header = `
                <div class="mls-scan-benchmark">
                    <div class="mls-scan-benchmark-title">Drop candidate (by ${basisName}):</div>
                    Your weakest ${groupName(g)} is <strong>${escapeHtml(bench.name)}</strong>${getSoSBadgeHTML(bench.team, bench.pos, WAIVER_SOS_OPTS)} (${rankText(bench)}).
                    ${upgrades.length ? `Available players ranked ahead of him:`
                        : g.items.length === 0 ? `<div class="mls-scan-benchmark-ok">${noneAvailableText(g)}</div>`
                        : `<div class="mls-scan-benchmark-ok">No ${availGroup(groupName(g))} ranks ahead of him; you're set here by ${basisName}.</div>`}
                    ${nextUp.length ? `<div class="mls-scan-benchmark-next">Next weakest: ${nextUp.join(' ')}</div>` : ''}
                    ${notCounted}
                </div>`;
                // Everyone ranked ahead is listed, in rank order; only an upgrade by the Dashboard's rule is
                // called (and counted as) one (improvements S8, rounds 4 and 5). The rest read "Ranked ahead
                // of": the same tier, or (without tiers) 1-2 spots ahead.
                let upgradeCount = 0, sameTier = 0, close = 0;
                const cards = upgrades.map(fa => {
                    const row = ctx.evaluate(fa);
                    const isUpgrade = isTierUpgrade(row.player, bench, basisDisplay, basisKind, ctx.scanCross);
                    if (isUpgrade) upgradeCount++;
                    else {
                        const { faTier, oTier } = comparedTiers(row.player, bench, null, basisDisplay, basisKind, ctx.scanCross);
                        if (isTiered(faTier) && isTiered(oTier)) sameTier++; else close++;
                    }
                    const line = waiverCompareLine(row.player, bench, null, isUpgrade ? 'Upgrade over' : 'Ranked ahead of', basisDisplay, basisLabel, basisKind, ctx.scanCross);
                    return renderWaiverScanCard(ctx, row, line);
                }).join('');
                const rest = [sameTier && `${sameTier} same tier`, close && `${close} within 2 spots`].filter(Boolean);
                const countText = upgradeCount || rest.length
                    ? [upgradeCount ? `${upgradeCount} upgrade${upgradeCount === 1 ? '' : 's'}` : 'no upgrades', ...rest].join(' · ')
                    : (g.items.length === 0 ? 'none available' : 'no upgrades');
                return { body: header + cards, count: upgradeCount, countText };
            };

            // All mode keeps every position the rankings file actually ranks, even when none of
            // them are available (that group explains itself -- see noneAvailableText). Only
            // positions the file doesn't rank at all are left out, and the summary names them:
            // ROS exports commonly skip K/DEF, and a K section that just says "not in your
            // rankings" under every scan would be noise.
            const shownGroups = posFilter === 'ALL' ? groups.filter(g => rankedIn(g) > 0) : groups;
            const unrankedPositions = posFilter === 'ALL' ? groups.filter(g => rankedIn(g) === 0).map(g => g.key) : [];
            const rendered = shownGroups
                .map(g => ({ g, ...(mode === 'roster' ? renderRosterGroup(g) : renderLineupGroup(g)) }));

            // Summary: what was scanned, what it was compared against, and any caveats.
            const notes = [];
            if (!knowsWholeLeague) notes.push(`This is a manual league, so the app only knows your own roster. Everyone below is off your roster, but some may be on other teams - check your league before putting in a claim.`);
            if (basisNote) notes.push(basisNote);
            if (mode === 'lineup' && playedExcluded > 0) notes.push(`${playedExcluded} player${playedExcluded === 1 ? "'s game has" : "s' games have"} already kicked off this week, so ${playedExcluded === 1 ? 'he was' : 'they were'} left out; everyone below can still help you this week. Switch to Whole Roster to include ${playedExcluded === 1 ? 'him' : 'them'}.`);
            if (mode === 'lineup' && allPlayed) notes.push(`Every available player's game has already kicked off this week, so they're shown anyway - treat these as adds for next week.`);
            if (mode === 'lineup' && !ctx.lineupReady) notes.push(`Couldn't build a starting lineup for this league yet, so there's no Would Start check - open the Lineup tab and tap Optimize Lineup.`);
            else if (!ctx.checkIsWeekly) notes.push(`No Weekly rankings loaded, so the Would Start check uses ROS ranks (same as the optimizer).`);
            notes.push(...waiverDerivedNotes(ctx));
            if (unrankedPositions.length > 0) {
                const list = unrankedPositions.length === 1 ? unrankedPositions[0] : `${unrankedPositions.slice(0, -1).join(', ')} or ${unrankedPositions[unrankedPositions.length - 1]}`;
                notes.push(`Your ${rankingSetLabel(basis)} don't rank any ${list}, so ${unrankedPositions.length === 1 ? "that position isn't" : "those positions aren't"} shown.`);
            }
            if (unresolvedCount > 0) notes.push(`${unresolvedCount} ranked name${unresolvedCount === 1 ? '' : 's'} couldn't be matched to a Sleeper player and ${unresolvedCount === 1 ? 'was' : 'were'} left out: ${formatUnmatchedNames(unresolvedNames)} Usually a spelling difference; renaming them in your rankings file to match Sleeper brings them back.`);

            const compareText = waiverCompareText(ctx, mode);
            let html = `
            <div class="mls-scan-summary">
                ${knowsWholeLeague ? 'Top available' : 'Top players not on your roster'} in <strong>${escapeHtml(league.name || 'this league')}</strong> by <strong>${basisName} rank</strong>, ${compareText}.
                ${notes.length ? `<ul class="mls-scan-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}
            </div>`;

            // All mode always gets section headers, even if only one position survives -- the
            // header is what says which position a headerless list would be.
            if (rendered.length > 1 || (posFilter === 'ALL' && rendered.length === 1)) {
                html += rendered.map(({ g, body, count, countText }) => {
                    const sectionId = `waiverScanSection${g.key}`;
                    return `
                    <div class="rankings-card mls-waiver-section expanded" id="${sectionId}">
                        <div class="rankings-card-header mls-waiver-section-header">
                            <h4 class="mls-waiver-section-heading"><button type="button" class="rankings-card-toggle mls-waiver-section-toggle btn-bare" data-action="toggleRankingsCard" data-card="${sectionId}" aria-expanded="true" aria-controls="${sectionId}Body">
                                <span class="mls-waiver-section-title">${g.key} &middot; <span style="color: ${count > 0 ? 'var(--primary-green)' : 'var(--text-muted)'};">${countText}</span></span>
                                <svg class="chevron-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button></h4>
                        </div>
                        <div class="rankings-card-body mls-waiver-section-body" id="${sectionId}Body">${body}</div>
                    </div>`;
                }).join('');
            } else if (rendered.length === 1) {
                html += rendered[0].body;
            } else {
                html += `<div class="mls-scan-empty">No ${availGroup('players')} found in your ${basisName} rankings.</div>`;
            }

            outputEl.innerHTML = html;
        } catch (err) {
            console.error('Waiver Auto-Find failed:', err);
            // Missing rankings and an unsynced league are already caught with their own
            // messages before this try, and buildWaiverContext swallows a failed Sleeper
            // player-map fetch (it falls back to league/market positions). So what actually
            // lands here is almost always saved league data in a shape the scan doesn't expect
            // -- typically a league last synced by an older version of the app -- and a fresh
            // sync is the one thing the person can do about it. The connection branch is
            // defensive: nothing inside the try hits the network today, but a future fetch
            // added to buildWaiverContext shouldn't be misreported as stale data.
            const leagueName = escapeHtml(league.name || 'this league');
            outputEl.innerHTML = isConnectionError(err)
                ? `<span class="mls-error-text">Couldn't reach Sleeper to finish the waiver scan for ${leagueName}. Check your connection and tap Auto-Find again.</span>`
                : `<span class="mls-error-text">Couldn't finish the waiver scan for ${leagueName} - its saved roster data may be out of date. Tap Sync All Leagues on the Dashboard, then run Auto-Find again.</span>`;
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = origText; }
        }
    };
