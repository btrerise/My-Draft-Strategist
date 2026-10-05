// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3F: the Global Injury
// Auditor (Lineup tab), which sat unmarked after ACTIVE ROSTER: POWER RANKINGS SNAPSHOT.
import { getNflState, getSleeperUser, getSleeperLeagueRosters, getSleeperPlayerMap } from '../../shared/api/sleeper.js';
import { escapeHtml } from '../../shared/html.js';
import { State, refreshGameTimes } from '../state.js';
import { isBestBallLeague, isConnectionError } from '../helpers.js';
import { hasKickedOff } from './gameInfo.js';
import { normalizeName } from '../../shared/names.js';

// A player this audit considers a genuine problem to leave in an active slot. Deliberately
// narrower than HARD_OUT_STATUSES / getShortInjuryStatus's full vocabulary: Questionable and
// Doubtful players are game-time calls you may well still want rostered and even started, so
// flagging them here would bury the real "this guy is definitively not playing, go move him"
// signal this tool exists to surface. Shared by the Sleeper and manual-league paths below so
// the two can't drift on what counts as injured.
function isAuditOut(p) {
    if (!p) return false;
    return p.injury_status === "Out" || ["IR", "PUP", "NFI", "Suspended"].includes(p.status);
}

// Clean name -> raw Sleeper player entries, built over a player map the caller already has in
// hand (the audit's own force-refreshed one) rather than the session-cached indexes near the
// top of this file -- an injury audit specifically wants today's statuses, not whatever was
// cached when some earlier feature first needed a name lookup.
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
        if (!p || !p.first_name || !FANTASY_POS.includes(p.position)) return;
        const clean = normalizeName(`${p.first_name} ${p.last_name}`);
        (index[clean] = index[clean] || []).push({ ...p, id });
    });
    return index;
}

// Best guess at which real NFL player a manually-entered roster entry refers to. Returns null
// when nothing matches at all -- manual entries are free text (typos, nicknames, team defenses
// written any number of ways), so "no match" is an expected outcome, not an error, and the
// caller reports the count rather than silently pretending those players were audited.
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
        || (pos && candidates.find(c => c.position === pos && c.team))
        || (pos && candidates.find(c => c.position === pos))
        || candidates.find(c => c.team)
        || candidates[0];
}

export const runGlobalInjuryAudit = async function(btn) {
    const outputEl = document.getElementById('injuryAuditOutput');
    const origText = btn.innerHTML;
    btn.innerHTML = "Scanning Leagues…";
    btn.disabled = true;
    btn.style.opacity = "0.7";
    outputEl.innerHTML = "";

    try {
        if (!State.leagues || State.leagues.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">No leagues synced.</span>`;
            return;
        }

        // Fetch global player map to check current injury status
        const playerMap = await getSleeperPlayerMap({ forceRefresh: true });
        // Only built if a manual league actually turns up -- it is a full pass over every
        // player Sleeper knows about, not worth doing for an all-Sleeper set of leagues.
        let candidateIndex = null;

        // The locked-player filter below is only as good as the kickoff data behind it, and
        // State.currentNflWeek/gameTimesByTeam can be null on a fresh load or stale if the
        // background refresh hasn't caught up -- so this Run gets current data rather than
        // whatever happened to be cached. Failure is deliberately swallowed: hasKickedOff
        // returns false for a team it has no data for, so a dead ESPN/Sleeper endpoint just
        // means nothing gets filtered and the audit reports everything, exactly as it did
        // before this filter existed. Losing the whole audit over it would be far worse.
        try {
            const nflState = await getNflState();
            if (nflState && typeof nflState.week === 'number') {
                State.currentNflWeek = nflState.week;
                await refreshGameTimes();
            }
        } catch (err) { /* see above -- degrade to "nothing is locked" */ }

        let auditResults = [];
        let scannedSleeper = 0;
        let scannedManual = 0;
        let skippedBestBall = 0;
        // Injured players whose game has already kicked off: real problems, but ones no
        // platform will let you fix this week. Collected rather than dropped so the notice at
        // the top can account for them -- silently omitting them would look like the audit
        // missed an obvious IR starter sitting right there on the Lineup tab.
        let lockedOut = [];

        // --- PREFETCH EVERY LEAGUE'S NETWORK DATA IN PARALLEL ---
        // The loop below used to `await getSleeperLeagueRosters(...)` and
        // `await getSleeperUser(...)` inside itself, one league at a time. Ten Sleeper leagues
        // meant twenty strictly serialized round-trips before a single result appeared, with
        // no progress indication -- the audit read as a hang rather than as work. Nothing in
        // the loop depends on a previous league's response, so there was never a reason to
        // serialize them; fetched together, the whole set costs roughly one round-trip of
        // wall time.
        //
        // The username lookup is also deduplicated. Most people use the same Sleeper account
        // for every league they're in, so the old code re-fetched an identical user record
        // once per league.
        const isSleeperAuditLeague = (l) => !!l.leagueId
            && !isBestBallLeague(l)
            && !l.leagueId.startsWith('manual_')
            && !l.leagueId.startsWith('handoff_');

        const rostersByLeagueId = new Map();
        const userIdByUsername = new Map();
        const sleeperAuditLeagues = State.leagues.filter(isSleeperAuditLeague);

        if (sleeperAuditLeagues.length > 0) {
            const uniqueUsernames = [...new Set(sleeperAuditLeagues.map(l => l.username).filter(Boolean))];
            const [rosterResults, userIdResults] = await Promise.all([
                // Promise.all, not allSettled: a failed roster fetch rejects out to this
                // function's own catch and surfaces as an audit error, which is exactly what
                // happened before when the bare await inside the loop threw. Keeping that
                // deliberately -- quietly dropping a league would make an unscanned league
                // indistinguishable from a clean one.
                Promise.all(sleeperAuditLeagues.map(l => getSleeperLeagueRosters(l.leagueId))),
                // Per-username catch, mirroring the try/catch this replaces: a bad username
                // skips the leagues that use it and the rest of the audit carries on.
                Promise.all(uniqueUsernames.map(u => getSleeperUser(u).then(d => d.user_id).catch(() => null)))
            ]);
            sleeperAuditLeagues.forEach((l, i) => rostersByLeagueId.set(l.leagueId, rosterResults[i]));
            uniqueUsernames.forEach((u, i) => userIdByUsername.set(u, userIdResults[i]));
        }

        for (let league of State.leagues) {
            if (!league.leagueId) continue;

            // Nothing to act on in a Best Ball league: lineups are scored automatically, and
            // they do not hand you an IR slot to stash an Out player in either -- so every row
            // this audit could produce for one would be a chore the format does not allow.
            if (isBestBallLeague(league)) { skippedBestBall++; continue; }

            // Draft-Strategist-handoff leagues count as manual here for the same reason
            // isFullyMappedLeague groups them: they're a locally-stored roster of your own
            // players with no Sleeper league behind them. Previously only 'manual_' was
            // checked and a handoff league fell through to the Sleeper branch below, where
            // getSleeperLeagueRosters('handoff_...') threw and took the whole audit down with
            // it rather than just skipping that one league.
            const isManual = league.leagueId.startsWith('manual_') || league.leagueId.startsWith('handoff_');

            // Manually added leagues: Sleeper has no roster for them, but it still knows the
            // injury status of the actual NFL players on them, matched by name. There is no
            // Sleeper lineup to compare against, so "starting" means the lineup as it stands in
            // this tool (the optimizer's output on the Lineup tab), and an injured bench player
            // is reported as-is rather than as "Move to IR" -- whether the real league even has
            // an IR slot isn't something we can know from here.
            if (isManual) {
                const roster = league.roster || [];
                if (roster.length === 0) continue;

                if (!candidateIndex) candidateIndex = buildCleanNameCandidateIndex(playerMap);
                scannedManual++;

                const localStarters = State.manualStartersMap[league.leagueId] || [];
                const starterIds = new Set(localStarters.filter(s => s.player).map(s => s.player.id));
                // A league whose lineup has never been optimized has no starter/bench split at
                // all, so every injured player there is reported neutrally as "On Roster"
                // instead of being miscast as a benching that has already been handled.
                const lineupIsSet = starterIds.size > 0;

                let leagueIssues = [];
                let unmatched = 0;

                roster.forEach(rp => {
                    // Team defenses are keyed by team abbreviation in Sleeper's player map, and
                    // the manual entry's name for one is free text ("Eagles", "Philadelphia
                    // D/ST"), so they're resolved off the team code instead of by name. One
                    // that can't be resolved is dropped rather than counted as unmatched: a
                    // D/ST has no injury designation to report, so telling the person it went
                    // unchecked would be noise about nothing.
                    let match;
                    if (rp.pos === 'DEF') {
                        const def = rp.team ? playerMap[rp.team] : null;
                        if (!def || def.position !== 'DEF') return;
                        match = def;
                    } else {
                        match = resolveManualPlayer(rp, candidateIndex);
                        if (!match) { unmatched++; return; }
                    }
                    if (!isAuditOut(match)) return;

                    // Sleeper's team code, not the manually-typed one -- the manual entry's
                    // team defaults to FA and can go stale after a trade, and a wrong team here
                    // means either a locked player reported as fixable or a fixable one hidden.
                    if (hasKickedOff({ team: match.team })) {
                        lockedOut.push({ leagueName: league.name, name: rp.name });
                        return;
                    }

                    const location = !lineupIsSet ? "On Roster"
                        : (starterIds.has(rp.id) ? "Starting Lineup" : "Bench");
                    leagueIssues.push({
                        name: rp.name,
                        status: match.injury_status || match.status,
                        location
                    });
                });

                // Unmatched names are surfaced even when nothing else is wrong -- otherwise a
                // league full of typo'd names would render as a clean bill of health.
                if (leagueIssues.length > 0 || unmatched > 0) {
                    auditResults.push({
                        leagueName: league.name,
                        format: league.leagueId.startsWith('handoff_') ? "Imported Roster" : "Manual League",
                        issues: leagueIssues, unmatched: unmatched
                    });
                }
                continue;
            }

            // Both of these were network calls made here, one league at a time; they're now
            // read from the parallel prefetch above. The safety check covers the case where
            // this loop's own skip conditions and isSleeperAuditLeague's ever drift apart --
            // without it, a league the prefetch didn't cover would throw on rosters.find below.
            const rosters = rostersByLeagueId.get(league.leagueId);
            if (!rosters) continue;

            // Resolve User ID. getSleeperUser throws on a not-found/error response (the
            // original inline fetch here didn't check response.ok at all, so a bad username
            // would just produce userId===undefined, myRoster staying undefined below, and
            // this league getting silently skipped by the "if (!myRoster) continue" a few
            // lines down). The prefetch's per-username catch stores null for that case,
            // preserving the same "skip this one league, keep scanning the rest" behavior.
            // A league with no username at all was never fetched, so it reads back undefined
            // and skips here too -- previously it reached getSleeperUser(undefined), threw,
            // and hit the same continue.
            const userId = userIdByUsername.get(league.username);
            if (userId === null || userId === undefined) continue;

            const myRoster = rosters.find(r => r.owner_id === userId);
            if (!myRoster) continue;
            scannedSleeper++;

            const starters = myRoster.starters || [];
            const reserve = myRoster.reserve || [];
            // Sleeper's roster object lists taxi-squad players in their own array, but ALSO
            // leaves them in `players` alongside everyone else -- same as `reserve` -- so both
            // have to be subtracted explicitly to arrive at the actual active bench. Absent on
            // leagues with no taxi squad configured, hence the fallback.
            const taxi = myRoster.taxi || [];
            const allPlayers = myRoster.players || [];
            let leagueIssues = [];

            allPlayers.forEach(pId => {
                let p = playerMap[pId];
                if (!p) return;

                if (isAuditOut(p)) {
                    let isStarting = starters.includes(pId);
                    // A taxi player is excluded for the same reason a reserve player is: they
                    // aren't occupying an active roster spot, so there's no move to prompt.
                    // Dynasty taxi squads are also where an injured rookie is *supposed* to
                    // sit, which made this the one slot most likely to generate a standing
                    // false positive week after week.
                    let isBench = !isStarting && !reserve.includes(pId) && !taxi.includes(pId);

                    // Once a player's team has kicked off, their roster spot is frozen on
                    // essentially every platform -- they can't be benched, and they can't be
                    // stashed on IR either. Reporting them would be handing the person a to-do
                    // they're unable to complete. Checked here rather than up front so someone
                    // already correctly parked on reserve or taxi (neither starting nor active
                    // bench) never counts toward the locked-out notice.
                    if ((isStarting || isBench) && hasKickedOff({ team: p.team })) {
                        lockedOut.push({ leagueName: league.name, name: `${p.first_name} ${p.last_name}` });
                        return;
                    }

                    if (isStarting) {
                        leagueIssues.push({ name: `${p.first_name} ${p.last_name}`, status: p.injury_status || p.status, location: "Starting Lineup" });
                    } else if (isBench) {
                        leagueIssues.push({ name: `${p.first_name} ${p.last_name}`, status: p.injury_status || p.status, location: "Active Bench (Move to IR)" });
                    }
                }
            });

            if (leagueIssues.length > 0) {
                auditResults.push({ leagueName: league.name, format: league.formatBadge || "", issues: leagueIssues });
            }
        }

        // States what was and wasn't covered, so a Best Ball league going unreported reads as a
        // deliberate exclusion rather than the audit having quietly missed it.
        const scanParts = [];
        if (scannedSleeper > 0) scanParts.push(`${scannedSleeper} Sleeper league${scannedSleeper === 1 ? '' : 's'}`);
        if (scannedManual > 0) scanParts.push(`${scannedManual} manual league${scannedManual === 1 ? '' : 's'}`);
        let summaryLine = scanParts.length > 0 ? `Scanned ${scanParts.join(' and ')}` : `No auditable leagues found`;
        if (skippedBestBall > 0) summaryLine += ` · Skipped ${skippedBestBall} Best Ball league${skippedBestBall === 1 ? '' : 's'}`;
        const summaryHTML = `<div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:0.75rem;">${escapeHtml(summaryLine)}</div>`;

        // Rendered AFTER the results in both branches below, never before: everything in this
        // notice is a dead end the person can't act on this week, so it sits underneath the
        // roster moves they can actually go make rather than pushing them down the page.
        //
        // It names names on purpose. A bare count would leave the person wondering which player
        // it meant and re-checking the roster by hand -- the whole point of listing them is so
        // they can confirm at a glance that the IR starter they already know about is the one
        // being excluded, not some other problem going unreported.
        let lockedHTML = "";
        if (lockedOut.length > 0) {
            const one = lockedOut.length === 1;
            const namesHTML = lockedOut
                .map(l => `${escapeHtml(l.name)} <span style="opacity:0.7;">(${escapeHtml(l.leagueName)})</span>`)
                .join(', ');
            lockedHTML = `
            <div class="info-banner" style="display:flex; margin-top: 1.25rem; background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.3); color:#fcd34d;">
                <div class="cluster cluster-sm">
                    <div class="info-banner-icon" aria-hidden="true" style="background:#f59e0b; color:white;">i</div>
                    <div><strong>${lockedOut.length} injured player${one ? '' : 's'} excluded (game already started):</strong> ${namesHTML}. Most platforms lock a roster spot once that player's game kicks off, so ${one ? 'this one' : 'these'} can't be moved until next week.</div>
                </div>
            </div>`;
        }

        if (auditResults.length === 0) {
            // Wording has to shift in both of these cases -- a flat "All clear!" is a claim
            // about rosters that were actually examined, and it reads as either a
            // contradiction (directly under a notice listing injured starters) or an outright
            // false negative (when nothing was examined at all).
            const clearText = scannedSleeper + scannedManual === 0
                ? `Nothing to audit. Best Ball leagues are skipped, and no other leagues were found.`
                : (lockedOut.length > 0
                    ? `Nothing actionable. Every injured player found is already locked in for this week.`
                    : `All clear! No injured players found in active slots across your leagues.`);
            outputEl.innerHTML = summaryHTML +
                `<div class="scout-result-card" style="justify-content:center; color:var(--primary-green);">${clearText}</div>` +
                lockedHTML;
        } else {
            let html = summaryHTML;
            auditResults.forEach(res => {
                html += `<div style="font-weight:bold; color:#fca5a5; margin: 1rem 0 0.5rem 0;">${escapeHtml(res.leagueName)} <span style="color:var(--text-muted); font-size: 0.75rem; font-weight: normal;">${escapeHtml(res.format)}</span></div>`;
                if (res.unmatched > 0) {
                    const one = res.unmatched === 1;
                    html += `<div style="color:var(--text-muted); font-size:0.75rem; font-style:italic; margin-bottom:0.5rem;">${res.unmatched} player${one ? '' : 's'} could not be matched to Sleeper's player database and ${one ? 'was' : 'were'} not checked. Re-add ${one ? 'that player' : 'those players'} using their full name to include them here.</div>`;
                }
                res.issues.forEach(issue => {
                    html += `
                    <div class="scout-result-card" style="border-color: #ef4444;">
                        <div>
                            <div class="mls-item-name">${escapeHtml(issue.name)}</div>
                            <div class="mls-meta-row">
                                <span style="color: #fca5a5; font-weight: bold;">${escapeHtml(issue.status)}</span>
                            </div>
                        </div>
                        <div class="mls-text-right">
                            <span class="badge" style="background:var(--avoid-bg); color:#fca5a5; border:1px solid var(--avoid-border);">${escapeHtml(issue.location)}</span>
                        </div>
                    </div>`;
                });
            });
            outputEl.innerHTML = html + lockedHTML;
        }

    } catch (err) {
        console.error('Global injury audit failed:', err);
        // Every message says the audit didn't finish, on purpose: an empty results panel after
        // an audit reads as "all clear," which is the one conclusion a failed run must not
        // leave behind. Three realistic causes, each with its own fix:
        //   * Connection -- the forced-fresh player map (~5MB) or a league's roster fetch
        //     failed or timed out. Common on phone data; retrying is the fix.
        //   * SyntaxError -- getSleeperLeagueRosters doesn't check res.ok, so when Sleeper is
        //     down or rate-limiting, its HTML/plain-text error page gets fed to res.json() and
        //     fails here. getSleeperPlayerMap checks, and throws an isSleeperResponseError
        //     error instead (refactor 2C follow-up); same message. Not the person's
        //     connection, so telling them to check it would send them the wrong way.
        //   * Anything else -- a saved league whose data isn't shaped the way the audit
        //     expects. Re-syncing rewrites it.
        let msg;
        if (isConnectionError(err)) {
            msg = `Couldn't reach Sleeper for current injury statuses, so the audit didn't finish - no leagues were checked. Check your connection and tap Run Global Audit again.`;
        } else if (err && (err.name === 'SyntaxError' || err.isSleeperResponseError)) {
            msg = `Sleeper sent back an unexpected response, so the audit didn't finish - no leagues were checked. Sleeper may be having problems; try Run Global Audit again in a few minutes.`;
        } else {
            msg = `The audit stopped partway through, so treat this as no result, not an all-clear. Some saved league data may be out of date - tap Sync All Leagues on the Dashboard, then run the audit again.`;
        }
        outputEl.innerHTML = `<span class="mls-error-text">${msg}</span>`;
    } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
        btn.style.opacity = "1";
    }
};
