// --- BEST AVAILABLE IN YOUR LEAGUES (Dashboard card, under the League Command Center) ---
// Added in improvements card S5. Top Available (scout/topAvailable.js) answers "who's the best
// player nobody has?" for the active league; this answers it for every league at once, and says
// which leagues are worth acting in. One line per league: its top 3 available RB/WR/TE, ranked by
// that league's own rankings (its Weekly set, else its ROS set), and a View button that opens that
// league's Top Available.
//
// Owner's choices before building: top 3 per league; RB/WR/TE only, ordered the way Top Available's
// FLEX view orders them (FLEX rank for Weekly, overall for ROS), because Weekly sheets give QB, K and
// DEF only a position rank and so have no single order with the rest; a position-rank chip ("RB8")
// with no tier.
//
// Owner's choices after the first version (a to-do list rather than a list):
// - Upgrade check: per league and per position, the best free agent against your weakest rostered
//   player there, by that league's rankings (Check a List's Whole Roster benchmark, rosterBenchmark).
//   It needs only your roster, not a lineup, so it works without making the league active. A league
//   whose free agent is ranked ahead says "Upgrade: X RB5 over your Y RB8".
// - Leagues with an upgrade come first, the biggest gap in position spots first; the rest (no
//   upgrade, no rankings) fold under "Show N more leagues".
// - The card collapses, and remembers it (a key since retired, RETIRED_KEYS.mls). Its header keeps a
//   summary line ("Upgrades in 2 of 5 leagues") so it's useful closed.
//
// Owner's choices in round 3:
// - Sleeper-synced leagues only. A manual or Draft Strategist hand-off league knows only your own
//   roster, not who's on the waiver wire, so "best available" there would be a guess; those
//   leagues are left out, with one line saying so (isFullyMappedLeague decides).
// - A Weekly | ROS switch. It is the Waiver Wire Assistant's Rank By (State.waiverScanSettings.basis,
//   the one setting Top Available, Auto-Find and Check a List share), so View opens Top Available
//   in the same rankings the line used, and no new key is needed. A league without the chosen
//   type falls back to its other one, and its label says so.
//
// Owner's choices in round 4 (after my second review as a user):
// - Upgrades must matter: upgradeGap (waiverScanner.js) flags a free agent only from a better tier
//   when the rankings have tiers (same tier isn't an upgrade); without tiers, at least 3 position
//   spots better. (Round 4's startable-range cutoff was removed in round 5: any ranked player can
//   count, for dynasty and deep leagues.)
// - Every upgrade shows (at most one per position), marked inside the line's players instead of a
//   separate sentence, so no name appears twice.
// - A league synced more than 2 days ago says so; each line has an "Open in Sleeper" link; players
//   carry injury badges; the fold uses the site's chevron.
//
// Owner's choices in round 7 (real leagues showed "Upgrades in 20 of 20", e.g. "over Tee Higgins
// (unranked)": a Questionable player a Weekly sheet leaves out because the analyst expects him to sit):
// - Weekly answers "who'd start for me this week?": the free agent is checked against your best
//   lineup (Auto-Find's would-start check). ROS keeps "who's worth a spot over my weakest player?".
// - The line stays short ("over Jaylen Waddle WR44", no slot name): which slot he'd take depends on
//   kickoff times. An empty starting spot reads "fills an empty lineup spot".
//
// Owner's choices in round 6:
// - "Your weakest" leaves out taxi, IR, Out (and PUP/NFI/suspended) players everywhere
//   (rosterBenchmark in waivers.js), so an injured star unranked in Weekly isn't the drop candidate.
// - Dismiss: a × on any player on a line hides him from that league's line (the next-best free agent
//   takes his place and is checked as an upgrade like any other). A "N dismissed · Restore" link
//   brings them back, and a league's dismissals clear themselves when the NFL week changes, since
//   waivers reset weekly. Saved in KEYS.mls.bestAvailableDismissed: { leagueId: { week, players } }.
//   Only this card hides them; Top Available still lists everyone.
//
// Owner's choices in round 5: no startable-range cutoff (above); "over Derrick Henry RB8" without
// "your"; the Sleeper link on desktop only (on phones it opens the Sleeper app's home, not the
// league; hidden by CSS); and View opens Top Available on the FLEX chip, so its list is the line's.
//
// No second copy of the candidate logic: findFreeAgents (not in globalRosterMap, draft picks out,
// unresolvable names left out, sorted by compareForScan), rosterBenchmark, buildRankDisplayIndex
// (the RB8 numbers), makeLeagueGetPos (positions) and isFullyMappedLeague (manual leagues) are the
// waiver tools' own. Each league's rankings come from getLeagueRankings, the lookup
// hydrateRankingsForLeague uses. The Sleeper player map is read once per render (cached; no new
// network calls), as runAllLeaguesSearch does. No Would Start check: it needs the active league's
// lineup.
//
// S12 (owner's choice: one League Command Center, one card per league): the card is gone. Each league's line
// is a section of that league's card (render/leagueCards.js, .mls-lc-ba), folded unless it has an upgrade (or
// no league has rankings yet); its fold is kept across redraws. The Weekly | ROS switch and the summary
// ("Upgrades in 2 of 5 leagues") sit in the toolbar above the cards, and each card's status row counts its
// upgrades ("1 upgrade") so a folded card still shows it. A manual league's card says why it has none. The
// sync note moved to the card's header, which already shows the sync age. The card's remembered collapse
// is retired (RETIRED_KEYS.mls in keys.js; init.js removes a leftover copy on load).
//
// When it draws: from renderLeagueManager (the Command Center's own render, after the cards are drawn), only
// while the Dashboard is the active tab. That covers the Dashboard being shown (nav.js → refreshLeagueDropdown),
// Sync All (its finally re-renders the Command Center) and adding, importing or deleting a league.
// Rankings change on the Lineup and Roster tabs, so coming back to the Dashboard picks them up.
import { escapeHtml } from '../../shared/html.js';
import { KEYS } from '../../shared/storage/keys.js';
import { refreshGameTimes, State } from '../state.js';
import { getLeagueRankings, getLeagueSeasonRankings } from '../leagues/sync.js';
import { seasonSetFor } from '../rankings/season.js';
import { bestLineup, buildRankDisplayIndex, checkAgainstLineup, findFreeAgents, FLEX_POSITIONS, upgradeGap } from './waiverScanner.js';
import { freeAgentPlayer, getSleeperMetaByName, lineupCheckDeps, makeLeagueGetPos, rosterBenchmark, updateWaiverScanSetting } from './waivers.js';
import { isFullyMappedLeague } from './allLeaguesSearch.js';
import { isDraftPickName } from '../trade/valueCurve.js';
import { applyDefaultFolds, showTab, switchActiveLeague } from '../main.js';
import { DISMISS_ICON, UPGRADE_ICON } from '../badges.js';
import { ensureLineupProjections, FOLD_CHEVRON } from '../lineup/gameInfo.js';

    const PER_LEAGUE = 3;

    // --- Dismissed players: { leagueId: { week: '2026:2', players: [cleanName] } } ---
    // The week is the NFL season and week from Sleeper (State.currentNflWeek). A league's list is
    // dropped once the week moves on; a list saved before the week was known adopts the next known week.
    const currentWeekKey = () => (State.currentNflWeek ? `${State.currentNflSeason || ''}:${State.currentNflWeek}` : null);
    function readDismissed() {
        try {
            const v = JSON.parse(localStorage.getItem(KEYS.mls.bestAvailableDismissed) || '{}');
            return v && typeof v === 'object' ? v : {};
        } catch (e) { return {}; }
    }
    function writeDismissed(all) {
        try {
            if (Object.keys(all).length) localStorage.setItem(KEYS.mls.bestAvailableDismissed, JSON.stringify(all));
            else localStorage.removeItem(KEYS.mls.bestAvailableDismissed);
        } catch (e) { /* storage blocked: dismissals last for this visit only */ }
    }
    // This week's dismissed players per league, clearing any from an earlier week.
    function currentDismissed() {
        const all = readDismissed();
        const week = currentWeekKey();
        let changed = false;
        Object.keys(all).forEach(id => {
            const entry = all[id];
            if (!entry || !Array.isArray(entry.players) || entry.players.length === 0) { delete all[id]; changed = true; return; }
            if (week && entry.week !== week) {
                if (entry.week) delete all[id];
                else entry.week = week;
                changed = true;
            }
        });
        if (changed) writeDismissed(all);
        return all;
    }
    const EXTERNAL_ICON = `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

    // Renders are async (the player map), and Sync All asks for one per league it syncs; only the
    // newest one writes.
    let renderGen = 0;
    // Each league's section element -> the HTML last written into it. A redrawn card has a new section, so it's written.
    const writtenSections = new WeakMap();

    const dashboardShown = () => {
        const tab = document.getElementById('setupTab');
        return !!(tab && tab.classList.contains('active'));
    };

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    const NAMES = { weekly: 'Weekly', ros: 'ROS', season: 'Season' };
    // Season (improvements S23) is offered only while some dynasty or keeper league has a Season set; a saved
    // 'season' without one reads every league's ROS rankings, so the switch shows ROS then.
    const anySeasonSet = () => State.leagues.some(l => seasonSetFor(l, State.rankingSets.ros));
    const chosenBasis = () => {
        const b = State.waiverScanSettings.basis;
        if (b === 'season') return anySeasonSet() ? 'season' : 'ros';
        return b === 'ros' ? 'ros' : 'weekly';
    };

    // The rankings a league's line uses: the chosen type (the Weekly | ROS switch), else the
    // other one, flagged as a fallback; else none. Season: this season's rankings (a dynasty league's
    // Season set, else its ROS), ROS-shaped, so `type` is 'ros'; `name` says which it was.
    function leagueBasis(league) {
        const wanted = chosenBasis();
        const other = wanted === 'weekly' ? 'ros' : 'weekly';
        for (const type of [wanted, other]) {
            const found = type === 'season' ? getLeagueSeasonRankings(league) : getLeagueRankings(league, type);
            if (found && found.data.length > 0) {
                const name = type === 'season' ? (found.fromSeason ? 'Season' : 'ROS') : NAMES[type];
                return { ...found, type: type === 'season' ? 'ros' : type, name, fallback: type !== wanted };
            }
        }
        return null;
    }

    // "Weekly · 9/15/2026" for a set with its default name ("Weekly Rankings – 9/15/2026"),
    // "Weekly · Dynasty PPR" for a named one, "Weekly" for a legacy upload.
    // Since S12 round 4 the type is left out when it's the switch's own ("Weekly" on every line was noise; the
    // toolbar says it): just the set's name ("Wk5", "9/15/2026"), or nothing for a legacy upload. A fallback still
    // names its type: "Weekly · Wk5 (no ROS set)".
    function sourceLabel(basis) {
        const name = escapeHtml((basis.setName || '').replace(/^(Weekly|ROS) Rankings\s*[–-]\s*/i, '').trim());
        if (!basis.fallback) return name;
        return `${name ? `${basis.name} · ${name}` : basis.name} (no ${NAMES[chosenBasis()]} set)`;
    }

    const rankText = (pos, posRank) => posRank ? `${escapeHtml(pos)}${posRank}` : `${escapeHtml(pos)}, unranked`;
    const chip = (pos, posRank) => `<span class="badge pos-badge ${escapeHtml(pos)} mls-ta-pos">${rankText(pos, posRank)}</span>`;

    // Everything a league's line needs, worked out without making it the active league.
    function analyzeLeague(league, meta, dismissedAll) {
        const basis = leagueBasis(league);
        if (!basis) return { league, basis: null, upgrade: null };

        const getPos = makeLeagueGetPos(league, meta);
        const roster = league.globalRosterMap || {};
        const dismissed = new Set((dismissedAll[league.leagueId] && dismissedAll[league.leagueId].players) || []);
        const options = {
            getPos,
            isRostered: (clean) => !!roster[clean],
            // Draft picks, and players you dismissed from this league's line this week.
            isExcluded: (r) => isDraftPickName(r.name) || dismissed.has(r.cleanName)
        };
        const { freeAgents } = findFreeAgents(basis.data, { ...options, posFilter: 'FLEX' });
        const display = buildRankDisplayIndex(basis.data, getPos);
        const posRankOf = (clean) => (display[clean] && display[clean].posRank) || null;

        const byName = {};
        basis.data.forEach(r => { if (r && r.cleanName) byName[r.cleanName] = r; });
        // The file's own tier: the position tier, else the list's (a single-file upload's Tier column).
        const tierOf = (clean) => {
            const r = byName[clean];
            if (!r) return null;
            return r.posTier ?? r.tier ?? null;
        };
        const rankedAtPos = {};
        basis.data.forEach(r => {
            if (!r || !r.cleanName || isDraftPickName(r.name)) return;
            const p = getPos(r.cleanName);
            if (FLEX_POSITIONS.includes(p)) rankedAtPos[p] = (rankedAtPos[p] || 0) + 1;
        });

        // Upgrades: at each position, the league's best free agent, judged two ways (round 7, owner's
        // choice after real leagues showed "Upgrades in 20 of 20" against players like a Questionable
        // Tee Higgins, left out of a Weekly sheet because the analyst expects him to sit):
        //   - Weekly: would he start this week? Auto-Find's own check (checkAgainstLineup) against
        //     your best lineup, built fresh from your roster by the optimizer's rules (bestLineup)
        //     with this league's Weekly rankings, locks and byes. Not the saved lineup: that's only
        //     re-optimized when the league's Lineup tab opens or Optimize All runs, so after a new
        //     upload it can still start someone the new rankings leave out. He's measured against
        //     the starter he'd push out (same position: position ranks and tiers; another position,
        //     after the FLEX reshuffles: FLEX ranks and tiers), or he fills an empty starting spot.
        //     An unranked Higgins only starts when you have no one else, so he's never the
        //     comparison otherwise.
        //   - ROS: your weakest rostered player there (Check a List's Whole Roster benchmark).
        // Either way upgradeGap decides: a better tier when both are tiered, else 3+ spots.
        const lineupMode = basis.type === 'weekly';
        const deps = lineupMode ? lineupCheckDeps(league.leagueId, byName) : null;
        const starters = lineupMode ? bestLineup(league.reqs, league.roster, { ...deps, getPos }) : [];
        const flexTierOf = (clean) => {
            const r = byName[clean];
            if (!r) return null;
            return r.flexTier ?? r.tier ?? null;
        };
        const flexRankOf = (clean) => (display[clean] && display[clean].flexRank) || null;
        const rankedFlex = Object.values(display).filter(d => d && d.flexRank).length;
        const upgrades = [];
        FLEX_POSITIONS.forEach(pos => {
            const best = findFreeAgents(basis.data, { ...options, posFilter: pos }).freeAgents[0];
            if (!best) return;
            const faRank = posRankOf(best.cleanName);
            if (lineupMode) {
                const verdict = checkAgainstLineup(freeAgentPlayer(best, meta), starters, deps);
                if (verdict.status !== 'starts') return;
                if (!verdict.displaced) {
                    if (verdict.fillsEmptySlot) upgrades.push({ pos, fa: best, faRank, emptySlot: true, gap: (rankedAtPos[pos] || 0) + 1 - (faRank || 0) });
                    return;
                }
                const out = verdict.displaced;
                const outPos = getPos(out.cleanName) !== 'UNK' ? getPos(out.cleanName) : out.pos;
                const gap = outPos === pos
                    ? upgradeGap({ faRank, faTier: tierOf(best.cleanName), benchRank: posRankOf(out.cleanName), benchTier: tierOf(out.cleanName), rankedAtPos: rankedAtPos[pos] || 0 })
                    : upgradeGap({ faRank: flexRankOf(best.cleanName), faTier: flexTierOf(best.cleanName), benchRank: flexRankOf(out.cleanName), benchTier: flexTierOf(out.cleanName), rankedAtPos: rankedFlex });
                if (gap) upgrades.push({ pos, fa: best, faRank, bench: out, benchPos: outPos, benchRank: posRankOf(out.cleanName), gap });
                return;
            }
            const { bench } = rosterBenchmark(league, getPos, byName, pos);
            if (!bench) return;
            const benchRank = posRankOf(bench.cleanName);
            const gap = upgradeGap({
                faRank, faTier: tierOf(best.cleanName),
                benchRank, benchTier: tierOf(bench.cleanName), rankedAtPos: rankedAtPos[pos] || 0
            });
            if (gap) upgrades.push({ pos, fa: best, faRank, bench, benchPos: pos, benchRank, gap });
        });
        upgrades.sort((x, y) => y.gap - x.gap);

        // The line's players: the upgrades first, then the best of the rest in FLEX order, PER_LEAGUE in all.
        const flagged = new Set(upgrades.map(u => u.fa.cleanName));
        const players = [
            ...upgrades.map(u => ({ fa: u.fa, upgrade: u })),
            ...freeAgents.filter(fa => !flagged.has(fa.cleanName)).map(fa => ({ fa, upgrade: null }))
        ].slice(0, PER_LEAGUE);

        // Upgrades over the same player (or the same empty spot) are options for one spot, not separate moves (S12
        // round 4): they count once, and the line says so instead of repeating "over Kenny Gainwell" on each.
        upgrades.forEach(u => { u.target = u.emptySlot ? 'empty' : u.bench.cleanName; });
        const shownTargets = {};
        players.forEach(p => { if (p.upgrade) shownTargets[p.upgrade.target] = (shownTargets[p.upgrade.target] || 0) + 1; });
        return { league, basis, freeAgents, players, posRankOf, rankedAtPos, dismissedCount: dismissed.size, upgrade: upgrades[0] || null,
            upgradeCount: new Set(upgrades.map(u => u.target)).size, shownTargets, inj: (clean) => (meta[clean] && meta[clean].inj) || null };
    }

    const overText = (u) => (u.emptySlot ? 'fills an empty lineup spot'
        : `over ${escapeHtml(u.bench.name)} ${u.benchRank ? rankText(u.benchPos, u.benchRank) : '(unranked)'}`);

    function playerHTML(a, { fa, upgrade }) {
        const inj = a.inj(fa.cleanName);
        // A shared target is said once, above the list (sharedNotes).
        const over = upgrade && a.shownTargets[upgrade.target] === 1 ? `<span class="mls-ba-over">${overText(upgrade)}</span>` : '';
        const dismiss = `<button type="button" class="btn-bare mls-ba-dismiss" data-action="dismissBestAvailable" data-league-id="${escapeHtml(a.league.leagueId)}" data-player="${escapeHtml(fa.cleanName)}" aria-label="Not interested in ${escapeHtml(fa.name)} (hide him here this week)" title="Not interested (hide this week)">${DISMISS_ICON}</button>`;
        return `<li class="mls-ba-player${upgrade ? ' is-upgrade' : ''}">${upgrade ? UPGRADE_ICON : ''}<span class="mls-ba-name">${escapeHtml(fa.name)}</span> ${chip(fa.pos, a.posRankOf(fa.cleanName))}${inj ? `<span class="badge inj-badge">${escapeHtml(inj)}</span>` : ''}${dismiss}${over}</li>`;
    }

    // A league card's Best Available section (S12; one line of the card before). A fold: open when the league has
    // an upgrade (or no league has rankings yet), so the rest stay out of the way. prevFold: the section's fold
    // before this redraw; its open state is kept unless the default changed (the league gained or lost an
    // upgrade).
    function leagueSectionHTML(a, defaultOpen, prevFold) {
        const { league, basis, upgrade } = a;
        const id = escapeHtml(league.leagueId);
        const name = escapeHtml(league.name || 'Unnamed league');
        // Sleeper's web app, where the claim actually happens. A plain link: no data is fetched.
        const sleeperLink = `<a class="btn btn-secondary mls-btn-sm mls-ba-sleeper" href="https://sleeper.com/leagues/${encodeURIComponent(league.leagueId)}" target="_blank" rel="noopener" aria-label="Open ${name} in Sleeper (new tab)">${EXTERNAL_ICON}Sleeper</a>`;

        let source, flag = '', body, button;
        if (!basis) {
            source = 'No rankings';
            body = `<div class="mls-ba-empty">Upload Weekly rankings on the Lineup tab (or ROS on the Roster tab) with this league active.</div>`;
            button = `<button type="button" class="btn btn-secondary mls-btn-sm" data-action="bestAvailableUpload" data-league-id="${id}" aria-label="Upload rankings for ${name}">Upload</button>`;
        } else {
            source = sourceLabel(basis);
            if (!upgrade) flag = `<span class="mls-ba-flag">No upgrade</span>`;
            if (a.players.length > 0) {
                const notes = Object.entries(a.shownTargets).filter(([, n]) => n > 1).map(([target, n]) => {
                    const u = a.players.find(p => p.upgrade && p.upgrade.target === target).upgrade;
                    return `<div class="mls-ba-shared">${n} options for one spot: ${u.emptySlot ? 'each fills an empty lineup spot' : `each ${overText(u)}`}</div>`;
                }).join('');
                body = `${notes}<ol class="mls-ba-players">${a.players.map(p => playerHTML(a, p)).join('')}</ol>`;
            } else if (a.dismissedCount > 0) {
                body = `<div class="mls-ba-empty">Every other ranked RB, WR and TE is rostered in this league.</div>`;
            } else {
                const ranked = FLEX_POSITIONS.reduce((n, p) => n + (a.rankedAtPos[p] || 0), 0);
                body = `<div class="mls-ba-empty">${ranked > 0
                    ? `Every RB, WR and TE in its ${basis.name} rankings (${ranked} ranked) is already rostered in this league. A deeper rankings file would show who's left.`
                    : `Its ${basis.name} rankings don't include any RB, WR or TE.`}</div>`;
            }
            if (a.dismissedCount > 0) {
                body += `<div class="mls-ba-dismissed">${a.dismissedCount} dismissed this week &middot; <button type="button" class="btn-bare mls-ba-restore" data-action="restoreBestAvailable" data-league-id="${id}" aria-label="Restore the players you dismissed in ${name}">Restore</button></div>`;
            }
            button = `<button type="button" class="btn btn-secondary mls-btn-sm" data-action="viewLeagueTopAvailable" data-league-id="${id}" aria-label="View top available in ${name}">View</button>`;
        }
        const open = prevFold && prevFold.dataset.default === String(defaultOpen) ? prevFold.open : defaultOpen;
        return `<details class="mls-change-fold mls-ba-fold${upgrade ? ' has-upgrade' : ''}" data-default="${defaultOpen}"${open ? ' open' : ''}>
            <summary>${FOLD_CHEVRON}<span class="mls-ba-title">Best available</span><span class="mls-ba-source">${source}</span>${flag}</summary>
            <div class="mls-ba-line">
                <div class="mls-ba-main">${body}</div>
                <div class="mls-ba-actions">${button}${sleeperLink}</div>
            </div>
        </details>`;
    }

    // The header's one-liner, readable with the card collapsed.
    function summaryText(analyses) {
        const unranked = analyses.filter(a => !a.basis).length;
        const ranked = analyses.length - unranked;
        const upgrades = analyses.filter(a => a.upgrade).length;
        const parts = [];
        if (ranked > 0) parts.push(upgrades > 0 ? `Upgrades in ${upgrades} of ${plural(ranked, 'league')}` : `No upgrades in your ${plural(ranked, 'league')}`);
        if (unranked > 0) parts.push(`${plural(unranked, 'league')} without rankings`);
        return parts.join(' · ');
    }

    export async function renderBestAvailable() {
        const list = document.getElementById('leagueCards');
        const toolbar = document.getElementById('leagueCardsBa');
        const summary = document.getElementById('bestAvailableSummary');
        const switchBox = document.getElementById('bestAvailableBasis');
        if (!list || !dashboardShown()) return;
        const gen = ++renderGen;

        const leagues = State.leagues || [];
        const synced = leagues.filter(isFullyMappedLeague);
        let meta = {};
        if (synced.length > 0) {
            // This week's projections and kickoff times too (S12 round 7): the weakest starter is picked with the
            // optimizer's rules, which need both. They used to load only with the Lineup tab, Optimize All or Sync All,
            // so the Dashboard's first answer could change after a tap that changed nothing else.
            const [metaResult] = await Promise.allSettled([getSleeperMetaByName(), ensureLineupProjections(), refreshGameTimes()]);
            if (metaResult.status === 'fulfilled') meta = metaResult.value;
            else console.warn('Best available: Sleeper player map unavailable, falling back to league/market positions.', metaResult.reason);
        }
        if (gen !== renderGen) return;

        // The toolbar's part: the switch and the summary, only with a Sleeper-synced league to show.
        if (toolbar) toolbar.hidden = synced.length === 0;
        const dismissedAll = synced.length > 0 ? currentDismissed() : {};
        const analyses = new Map(synced.map(l => [l.leagueId, analyzeLeague(l, meta, dismissedAll)]));
        if (summary) summary.textContent = synced.length > 0 ? summaryText([...analyses.values()]) : '';
        if (switchBox) {
            const basis = chosenBasis();
            const basisBtn = (b) => `<button type="button" class="mls-segmented-btn${b === basis ? ' active' : ''}" data-action="setBestAvailableBasis" data-basis="${b}" aria-pressed="${b === basis}">${NAMES[b]}</button>`;
            switchBox.innerHTML = basisBtn('weekly') + basisBtn('ros') + (anySeasonSet() ? basisBtn('season') : '');
        }

        // With no league ranked yet, every section opens (each one's Upload is the to-do).
        const anyRanked = [...analyses.values()].some(a => a.basis);
        leagues.forEach(l => {
            const sel = `[data-league-id="${CSS.escape(l.leagueId)}"]`;
            const section = list.querySelector(`.mls-lc-ba${sel}`);
            const count = list.querySelector(`.mls-lc-count-upgrades${sel}`);
            const a = analyses.get(l.leagueId);
            if (section) {
                const html = a
                    ? leagueSectionHTML(a, !!a.upgrade || !anyRanked, section.querySelector(':scope > details.mls-ba-fold'))
                    : `<p class="mls-ba-excluded">No best available here: in a manual league the app only knows your own roster, not who's on the waiver wire.</p>`;
                // The same section as last time, and the same HTML: left as it is (improvements S17).
                if (writtenSections.get(section) !== html) {
                    section.innerHTML = html;
                    writtenSections.set(section, html);
                }
            }
            const upgrades = a && a.upgradeCount ? plural(a.upgradeCount, 'upgrade') : '';
            if (count && count.textContent !== upgrades) count.textContent = upgrades;
        });
        // Now the upgrades are known: cards with nothing to do fold (the ones you haven't folded or opened yourself).
        applyDefaultFolds();
    }

    // × on a player: hide him from this league's line for the rest of the NFL week.
    export function dismissBestAvailable(leagueId, cleanName) {
        if (!leagueId || !cleanName) return;
        const all = currentDismissed();
        const entry = all[leagueId] || { week: currentWeekKey(), players: [] };
        if (!entry.players.includes(cleanName)) entry.players.push(cleanName);
        all[leagueId] = entry;
        writeDismissed(all);
        renderBestAvailable();
    }

    // Restore: bring back every player dismissed in this league.
    export function restoreBestAvailable(leagueId) {
        const all = currentDismissed();
        delete all[leagueId];
        writeDismissed(all);
        renderBestAvailable();
    }

    // The Weekly | ROS switch: the Waiver Wire Assistant's Rank By, shared with the Scout tab.
    export function setBestAvailableBasis(basis) {
        updateWaiverScanSetting('basis', basis === 'ros' || basis === 'season' ? basis : 'weekly');
        renderBestAvailable();
    }

    // View: that league's Top Available on the Scout tab, filtered like the line: the same rankings
    // (the switch is Rank By) and the FLEX chip (RB/WR/TE in FLEX order). showTab('scout') draws it.
    export function viewLeagueTopAvailable(leagueId) {
        if (!(State.leagues || []).some(l => l.leagueId === leagueId)) return;
        if (leagueId !== State.activeLeagueId) switchActiveLeague(leagueId);
        updateWaiverScanSetting('mode', 'top');
        updateWaiverScanSetting('pos', 'FLEX');
        showTab('scout');
    }

    // Upload (a league with no rankings): make it active and open the Lineup tab, where Weekly
    // rankings are uploaded.
    export function bestAvailableUpload(leagueId) {
        if (!(State.leagues || []).some(l => l.leagueId === leagueId)) return;
        if (leagueId !== State.activeLeagueId) switchActiveLeague(leagueId);
        showTab('lineup');
    }
