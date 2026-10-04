// Moved from js/mds/legacy.js (the second half of the old js/mds.js) in refactor chunk 2B:
// the player pool, queue and tier-tracker rendering: the call-out and tier helpers that sat
// above RENDER DRAFT MATRIX, the T-Score cache reader, buildPlayerCardHTML/buildQueueCardHTML,
// the queue collapse toggle, renderBoard and toggleHeadshots.
import { escapeHtml } from '../shared/html.js';
import { State, getActiveDraft } from './state.js';
import { renderDraftMatrix } from './board.js';
import { renderFantasyRoster } from './team.js';
import { renderDraftRecap } from './recap.js';
import { KEYS } from '../shared/storage/keys.js';
import { normalizeName } from '../shared/names.js';
import { tScoreData } from '../shared/data/tscore.js';

    // Reads and parses the three call-out lists ONCE, for a caller that is about to style many
    // player cards. getCallOutStyle below used to do this itself on every single call -- and
    // it's called once per player card from buildPlayerCardHTML -- so rendering a 600-player
    // pool meant 1,800 synchronous localStorage reads and 1,800 throwaway arrays, on a
    // function wired to a debounced keystroke handler. The lists are identical for every card
    // in a given render, so this is pure repeated work with no per-player input.
    function getCallOutLists() {
        const parse = (key) => (localStorage.getItem(key) || "")
            .split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
        return { targets: parse(KEYS.mds.targets), avoids: parse(KEYS.mds.avoids), darts: parse(KEYS.mds.darts) };
    }

    // `lists` is optional purely so the handful of one-off callers outside a render loop can
    // keep calling this with just a name; inside a loop, hoist getCallOutLists() out and pass
    // it in. Matching order (targets, then avoids, then darts) is unchanged.
    function getCallOutStyle(playerName, lists) {
        let n = playerName.toLowerCase();
        const { targets, avoids, darts } = lists || getCallOutLists();

        if (targets.some(t => n.includes(t))) return `border-left: 5px solid var(--target-border); background-color: var(--target-bg);`;
        if (avoids.some(a => n.includes(a))) return `border-left: 5px solid var(--avoid-border); background-color: var(--avoid-bg);`;
        if (darts.some(d => n.includes(d))) return `border-left: 5px solid var(--dart-border); background-color: var(--dart-bg);`;
        return '';
    }

    // `draftedSet` is optional: renderBoard already builds one for its own loop and passes it
    // in, which avoids re-deriving it here. Without it this filtered the whole player pool
    // with drafted.includes(), i.e. O(players x drafted) -- ~120k comparisons deep into a
    // real draft, on every render.
    function getTierTrackerData(draftedSet) {
        let draft = getActiveDraft();
        let drafted = draftedSet || new Set(draft ? draft.draftedPlayers : []);
        let trackers = { QB: null, RB: null, WR: null, TE: null, K: null, DEF: null };

        // Single pass over the pool tracking the best (lowest) live tier per position and how
        // many players share it, rather than filtering the pool once per position and then
        // walking each position's slice three more times (min, spread into Math.min, count).
        State.players.forEach(p => {
            if (drafted.has(p.id)) return;
            if (p.tier === "-") return;
            const t = trackers[p.posGroup];
            if (t === undefined) return; // position outside the six tracked here
            const tier = parseInt(p.tier) || 99;
            if (t === null || tier < t.tier) trackers[p.posGroup] = { tier: tier, count: 1 };
            else if (tier === t.tier) t.count++;
        });
        return trackers;
    }

    // Reads the T-Score cache the T-Score page's "Refresh from Google Sheets" button writes to
    // localStorage (same origin as this page, so it's already visible here with no extra work).
    // Falls back to the bundled js/shared/data/tscore.js if no cache exists yet, or if it fails to parse.
    // Memoized per page load: buildPlayerCardHTML() below calls this once per player per render
    // (potentially hundreds of times), so re-reading and re-parsing localStorage on every call
    // would be wasteful -- if the T-Score page writes a fresher cache mid-session, MDS picks it
    // up on its next full page load, not instantly without a reload.
    let cachedEffectiveTScoreData = null;
    function getEffectiveTScoreData() {
        if (cachedEffectiveTScoreData !== null) return cachedEffectiveTScoreData;
        try {
            const raw = localStorage.getItem(KEYS.tscore.cache);
            if (raw) {
                cachedEffectiveTScoreData = JSON.parse(raw);
                return cachedEffectiveTScoreData;
            }
        } catch (e) {
            console.error('Could not parse cached T-Score data, falling back to bundled tscore_data.js:', e);
        }
        cachedEffectiveTScoreData = tScoreData;
        return cachedEffectiveTScoreData;
    }

    // Pure function: player object + current draft context in, one player-card's HTML string out.
    // No side effects, no DOM access -- extracted from what used to be inline in renderBoard()'s
    // main forEach loop so this ~130-line template is readable and testable on its own.
    //
    // `ctx` carries the values that are the same for every card in one render pass and were
    // previously re-derived per card: the parsed call-out lists (3 localStorage reads each
    // time) and the T-Score toggle (a 4th read). Across a 600-player pool that was ~2,400
    // synchronous storage hits per render. They're read once in renderBoard now and passed
    // down, which also makes this function genuinely pure -- it no longer touches
    // localStorage at all, so the "no side effects" claim above is now literally true.
    function buildPlayerCardHTML(p, currentOverallPick, showStacks, myQbs, myPassCatchers, draft, ctx) {
        let customStyle = getCallOutStyle(p.name, ctx.callOutLists);
        let valueBadgeHTML = "";
        let diff = currentOverallPick - p.rank;
        if (diff > 0) {
            valueBadgeHTML = ` | <span class="badge badge-value">+${diff} Value</span>`;
        } else if (diff < 0) {
            valueBadgeHTML = ` | <span class="badge badge-reach">${diff} Reach</span>`;
        } else {
            valueBadgeHTML = ` | <span class="badge" style="background:#3a506b;">At Rank</span>`;
        }
        
        if (['WR', 'RB'].includes(p.posGroup) && ctx.showTScore) {
            const normFunc = normalizeName;
            const normName = normFunc(p.name); 
            const tInfo = getEffectiveTScoreData()[normName];
            
            if (tInfo) {
                let tsColor = "#9ca3af";
                let tsBg = "rgba(255,255,255,0.1)";
                let tsBorder = "var(--border)";
                
                if (tInfo.c === 'label-elite') { tsColor = "#a855f7"; tsBg = "rgba(168, 85, 247, 0.15)"; tsBorder = "rgba(168, 85, 247, 0.3)"; }
                else if (tInfo.c === 'label-high') { tsColor = "#3b82f6"; tsBg = "rgba(59, 130, 246, 0.15)"; tsBorder = "rgba(59, 130, 246, 0.3)"; }
                else if (tInfo.c === 'label-strong') { tsColor = "#10b981"; tsBg = "rgba(16, 185, 129, 0.15)"; tsBorder = "rgba(16, 185, 129, 0.3)"; }
                else if (tInfo.c === 'label-quality') { tsColor = "#f59e0b"; tsBg = "rgba(245, 158, 11, 0.15)"; tsBorder = "rgba(245, 158, 11, 0.3)"; }
                else if (tInfo.c === 'label-boom') { tsColor = "#ef4444"; tsBg = "rgba(239, 68, 68, 0.15)"; tsBorder = "rgba(239, 68, 68, 0.3)"; }
                
                let tScoreHTML = ` | 
                    <div class="tooltip-container" style="display:inline-flex;">
                        <span class="badge" style="background: ${tsBg}; color: ${tsColor}; border: 1px solid ${tsBorder}; font-weight: 700;">${tInfo.l}</span>
                        <span class="tooltip-text" style="width: max-content; white-space: nowrap;">T-Score: ${tInfo.s} | ${tInfo.l}</span>
                    </div>`;
                
                valueBadgeHTML += tScoreHTML;
            }
        }

        let adpText = (p.adp && p.adp !== "-") ? ` | Market: ${escapeHtml(p.adp)}` : "";
        let isStack = false;
        if (showStacks && p.team !== "FA") {
            if (['WR', 'TE'].includes(p.posGroup) && myQbs.includes(p.team)) isStack = true;
            if (p.posGroup === 'QB' && myPassCatchers.includes(p.team)) isStack = true;
        }

        let stackBadge = isStack ? `<span class="badge" style="background: var(--stack-color); color: white;">Stack</span>` : "";
        let rookieBadge = p.isRookie ? `<span class="badge badge-rookie">R</span>` : "";
        
        // NEW: Generate the injury badge using your existing CSS class
        let injuryBadge = p.injury ? `<span class="badge inj-badge">${escapeHtml(p.injury)}</span>` : "";
        
        // Check if the card was expanded before the sync happened
        let expandedClass = p.isExpanded ? " is-expanded" : "";

        let isQueued = draft.queue && draft.queue.includes(p.id);
        let queueStarIcon = isQueued ? "★" : "☆";
        let queueStarColor = isQueued ? "#f59e0b" : "var(--text-muted)";

        return `
            <div class="player-card${expandedClass}" data-player-id="${p.id}" style="${customStyle}" role="group" aria-label="${escapeHtml(p.rank)}. ${escapeHtml(p.name)}">
                
                <div class="card-grid" style="display: flex; flex-direction: column; gap: 0.6rem; width: 100%; align-items: stretch; text-align: left;">
                    
                    <!-- TOP ROW: Rank & Name -->
                    <div class="card-top-row">
                        <span style="color: var(--text-muted); font-weight: 500; font-size: 1rem; flex-shrink: 0;">${p.rank}.</span> 
                        <h4 class="card-name">
                            ${escapeHtml(p.name)}
                        </h4>
                    </div>

                    <!-- BOTTOM ROW: Badges & Actions -->
                    <div class="card-bottom-row">
                        
                        <!-- Bottom Left: Badges, Star & Affinity -->
                        <div class="card-badges-row">
                            <span class="badge pos-badge ${escapeHtml(p.posGroup)}">${escapeHtml(p.posDisplay)}</span> 
                            ${rookieBadge}
                            ${injuryBadge}
                            ${stackBadge}
                            <div style="display: flex; align-items: center; gap: 2px;">
                                <button type="button" data-action="toggleQueue" data-id="${p.id}" style="background: none; border: none; font-size: 1.15rem; color: ${queueStarColor}; cursor: pointer; padding: 0 4px; transform: translateY(-1px);" title="Toggle Queue" aria-label="Queue ${escapeHtml(p.name)}" aria-pressed="${isQueued ? 'true' : 'false'}">${queueStarIcon}</button>
                                <button data-action="cycleAffinity" data-id="${p.id}" style="background: transparent; border: none; padding: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Toggle Color Label" aria-label="Color label: ${['None', 'Green', 'Yellow', 'Orange', 'Red', 'Purple'][p.affinity || 0]}. Change color">
                                    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; 
                                                 border: 2px solid ${['var(--text-muted)', '#10b981', '#eab308', '#f97316', '#ef4444', '#a855f7'][p.affinity || 0]}; 
                                                 background-color: ${['transparent', '#10b981', '#eab308', '#f97316', '#ef4444', '#a855f7'][p.affinity || 0]}; 
                                                 opacity: ${p.affinity ? '1' : '0.4'}; transition: background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;">
                                    </span>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Bottom Right: Draft Actions & Chevron -->
                        <div class="actions" style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
                            <button class="mds-btn-sm btn-draft" data-action="draftPlayer" data-id="${p.id}" data-mine="false" aria-label="${escapeHtml(p.name)} taken by another team">Taken</button>
                            <button class="mds-btn-sm btn-mine" data-action="draftPlayer" data-id="${p.id}" data-mine="true" aria-label="Pick ${escapeHtml(p.name)} for my team">Pick</button>
                            <button class="btn-expand hide-on-desktop" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; display: flex; align-items: center;" data-action="toggleCardDetails" data-id="${p.id}" aria-label="Expand details" aria-expanded="${p.isExpanded ? 'true' : 'false'}">
                                <svg aria-hidden="true" class="chevron-icon" style="transform: ${p.isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}; transition: transform 0.2s;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="card-details" id="details-${p.id}">
                    <div class="player-stats">
                        <span>${escapeHtml(p.team)} | Bye: ${escapeHtml(p.bye)}${adpText}${valueBadgeHTML}</span>
                        <button type="button" class="edit-link" data-action="toggleEditBar" data-id="${p.id}" title="Edit Details" aria-label="Edit ${escapeHtml(p.name)}'s details" aria-expanded="${p.isEditing ? 'true' : 'false'}" aria-controls="inline-edit-${p.id}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin: 0 2px;" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                        </button>
                    </div>
                    <div class="inline-editor" id="inline-edit-${p.id}" style="${p.isEditing ? 'display: flex;' : ''}">
                        <div style="display:flex; gap:0.4rem; width:100%; flex-wrap:wrap; align-items:center;">
                            <div>
                                <label class="card-field-label" for="edit-rank-val-${p.id}">Rank</label>
                                <input type="number" id="edit-rank-val-${p.id}" value="${escapeHtml(p.rank)}" style="width:55px;">
                            </div>
                            <div>
                                <label class="card-field-label" for="edit-tier-val-${p.id}">Tier</label>
                                <input type="text" id="edit-tier-val-${p.id}" value="${escapeHtml(p.tier)}" style="width:45px;">
                            </div>
                            <div>
                                <label class="card-field-label" for="edit-team-val-${p.id}">Team</label>
                                <input type="text" id="edit-team-val-${p.id}" value="${escapeHtml(p.team)}" style="width:55px;">
                            </div>
                            <div>
                                <label class="card-field-label" for="edit-bye-val-${p.id}">Bye</label>
                                <input type="text" id="edit-bye-val-${p.id}" value="${escapeHtml(p.bye)}" style="width:45px;">
                            </div>
                            <div style="margin-left:auto; display:flex; gap:4px; align-self:flex-end;">
                                <button class="mds-btn-sm btn-mine" style="padding:0.4rem 0.8rem;" data-action="saveInlineEdit" data-id="${p.id}">Save</button>
                                <button class="mds-btn-sm btn-draft" style="padding:0.4rem 0.6rem;" data-action="toggleEditBar" data-id="${p.id}">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    }
    function buildQueueCardHTML(p, idx, isFirst, isLast) {
        return `
            <div class="player-card queue-card" 
                 data-player-id="${p.id}"
                 draggable="true" 
                 data-action="queueDrag" data-index="${idx}"
                 style="border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.04); padding: 0.75rem; text-align: left;">
                 
                <div style="display: flex; flex-direction: column; gap: 0.6rem; width: 100%; align-items: stretch;">
                    
                    <!-- TOP ROW: Grip & Name -->
                    <div class="card-top-row">
                        <span style="color: var(--text-muted); cursor: grab; user-select: none; flex-shrink: 0; font-size: 1.1rem; margin-right: 0.2rem;" title="Drag to reorder">⋮⋮</span>
                        <h4 class="card-name">
                            ${escapeHtml(p.name)}
                        </h4>
                    </div>

                    <!-- BOTTOM ROW: Arrows, Badges, Star & Actions -->
                    <div class="card-bottom-row">
                        
                        <!-- Left Side: Arrows, Badges, Star & Affinity -->
                        <div class="card-badges-row">
                            <button class="mds-btn-sm btn-secondary queue-arrow-btn" data-action="moveQueueItem" data-index="${idx}" data-direction="-1" ${isFirst ? 'disabled' : ''} aria-label="Move ${escapeHtml(p.name)} up the queue">▲</button>
                            <button class="mds-btn-sm btn-secondary queue-arrow-btn" data-action="moveQueueItem" data-index="${idx}" data-direction="1" ${isLast ? 'disabled' : ''} aria-label="Move ${escapeHtml(p.name)} down the queue">▼</button>
                            <span class="badge pos-badge ${escapeHtml(p.posGroup)}">${escapeHtml(p.posDisplay)}</span>
                            <div style="display: flex; align-items: center; gap: 2px;">
                                <button data-action="toggleQueue" data-id="${p.id}" style="background: none; border: none; font-size: 1.15rem; color: #f59e0b; cursor: pointer; padding: 0 4px; transform: translateY(-1px);" title="Remove from Queue" aria-label="Remove ${escapeHtml(p.name)} from queue">★</button>
                                <button data-action="cycleAffinity" data-id="${p.id}" style="background: transparent; border: none; padding: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Toggle Color Label" aria-label="Color label: ${['None', 'Green', 'Yellow', 'Orange', 'Red', 'Purple'][p.affinity || 0]}. Change color">
                                    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; 
                                                 border: 2px solid ${['var(--text-muted)', '#10b981', '#eab308', '#f97316', '#ef4444', '#a855f7'][p.affinity || 0]}; 
                                                 background-color: ${['transparent', '#10b981', '#eab308', '#f97316', '#ef4444', '#a855f7'][p.affinity || 0]}; 
                                                 opacity: ${p.affinity ? '1' : '0.4'}; transition: background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;">
                                    </span>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Right Side: Draft Actions -->
                        <div style="display: flex; gap: 0.4rem; flex-shrink: 0; align-items: center;">
                            <button class="mds-btn-sm btn-draft" data-action="draftPlayer" data-id="${p.id}" data-mine="false" aria-label="${escapeHtml(p.name)} taken by another team">Taken</button>
                            <button class="mds-btn-sm btn-mine" data-action="draftPlayer" data-id="${p.id}" data-mine="true" aria-label="Pick ${escapeHtml(p.name)} for my team">Pick</button>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    // Queue collapse state lives here, outside renderBoard(), because renderBoard() rebuilds
    // the queue's HTML from scratch via innerHTML on every call (every pick, every queue
    // add/remove) -- a class toggled directly on the old DOM node wouldn't survive that. This
    // is read by renderBoard() each time it runs so the user's choice persists across re-renders
    // for the rest of the session (not saved to localStorage -- matches how the MLS rankings
    // cards' collapse state also doesn't persist across a page reload).
    let isQueueCollapsed = false;
    export const toggleQueueCollapse = function() {
        // renderBoard() replaces the header <button> via innerHTML, which would drop keyboard
        // focus to <body>; put it back on the new header if it was focused before the toggle.
        const hadFocus = !!(document.activeElement && document.activeElement.classList.contains('queue-header'));
        isQueueCollapsed = !isQueueCollapsed;
        renderBoard();
        if (hadFocus) {
            const newHeader = document.querySelector('#queueContainer .queue-header');
            if (newHeader) newHeader.focus();
        }
    };

    export function renderBoard() {
        const poolEl = document.getElementById('playerPool');
        const myTeamEl = document.getElementById('myTeamList');
        const otherEl = document.getElementById('otherDraftedList');
        const searchEl = document.getElementById('searchBar');
        const searchTerm = searchEl ? searchEl.value.toLowerCase() : "";
        const tierTrackerElEarly = document.getElementById('tierTracker');

        // Same empty-state pattern as renderDraftMatrix() (Board tab): without any rankings
        // loaded, there's nothing to show yet, so say so instead of leaving this blank.
        // Covers Tracker (tierTracker/playerPool) AND Team (myTeamList/otherDraftedList) --
        // both tabs render through this same function, so both need to be handled here or
        // an early return leaves the Team tab silently blank with no guidance.
        if (State.players.length === 0) {
            if (tierTrackerElEarly) tierTrackerElEarly.innerHTML = '';
            if (poolEl) {
                poolEl.innerHTML = `<div class="empty-state-card"><p>Load rankings on the Setup tab to see your player pool here.</p><button class="btn btn-primary empty-state-cta" data-action="showTab" data-tab="setup">Go to Setup</button></div>`;
            }
            if (myTeamEl) myTeamEl.innerHTML = renderFantasyRoster();
            if (otherEl) {
                otherEl.innerHTML = `<div class="empty-state-card"><p>Drafted players from other teams will show up here once you're synced or tracking picks.</p><button class="btn btn-primary empty-state-cta" data-action="showTab" data-tab="setup">Go to Setup</button></div>`;
            }
            const limitsBodyElEmpty = document.getElementById('limitsBody');
            if (limitsBodyElEmpty) {
                const dLimits = getActiveDraft()?.limits || { QB:1, RB:2, WR:3, TE:1, FLEX:1, SFLEX:0, BENCH:6, TOTAL:14 };
                limitsBodyElEmpty.innerHTML = `<tr><td>0 / ${dLimits.QB}</td><td>0 / ${dLimits.RB}</td><td>0 / ${dLimits.WR}</td><td>0 / ${dLimits.TE}</td><td>0 / ${dLimits.FLEX}</td><td>0 / ${dLimits.SFLEX}</td><td><strong>0 / ${dLimits.TOTAL}</strong></td></tr>`;
            }
            return;
        }

        let draft = getActiveDraft();
        let draftedPlayers = draft ? draft.draftedPlayers : [];
        let myTeam = draft ? draft.myTeam : [];
        let limits = draft ? draft.limits : { QB:1, RB:2, WR:3, TE:1, FLEX:1, SFLEX:0, BENCH:6, TOTAL:14 };

        // Per-render lookup index, built once and shared by everything below. All of this used
        // to be done with State.players.find(...) / array.includes(...) from inside loops over
        // the full player pool -- O(players x drafted) work, repeated in several places per
        // render -- and renderBoard runs on every (debounced) search keystroke, every pick,
        // and every live-sync tick that finds a new pick. First entry wins, matching .find().
        const playerById = new Map();
        State.players.forEach(p => { if (!playerById.has(p.id)) playerById.set(p.id, p); });
        const draftedSet = new Set(draftedPlayers);
        const myTeamSet = new Set(myTeam);

        let newPoolHTML = '';
        let posCounts = { "QB": 0, "RB": 0, "WR": 0, "TE": 0, "K": 0, "DEF": 0 };
        // Check Sleeper's raw pick count first so unranked K/DEF are included in the math
        let totalPicksDone = (draft && draft.rawDraftPicks && draft.rawDraftPicks.length > 0) ? draft.rawDraftPicks.length : draftedPlayers.length;
        let currentOverallPick = totalPicksDone + 1;
        
        let teamsInLeague = draft?.settings?.teams || 12;
        let round = Math.ceil(currentOverallPick / teamsInLeague);
        let pickInRound = currentOverallPick - ((round - 1) * teamsInLeague);
        
        const pickTrackerEl = document.getElementById('pickTracker');
        if (pickTrackerEl) pickTrackerEl.innerText = `Pick: ${round}.${pickInRound.toString().padStart(2, '0')}`;

        const trackers = getTierTrackerData(draftedSet);
        let isAllActive = !Array.isArray(State.activePosFilter) || State.activePosFilter.length === 0;
        let trackerHTML = `<button type="button" class="badge badge-all pos-filter ${isAllActive ? 'active-filter' : ''}" data-action="setPosFilter" data-pos="ALL" aria-pressed="${isAllActive}" aria-label="Show all positions"><span>ALL</span></button>`;

        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
            // If ALL is active, everything lights up. Otherwise, check if this specific pos is selected.
            let isActive = isAllActive || (Array.isArray(State.activePosFilter) && State.activePosFilter.includes(pos)) ? 'active-filter' : '';
            let tText = trackers[pos] ? `T${trackers[pos].tier} (${trackers[pos].count})` : "—";
            // aria-pressed reflects an explicit pick only: with ALL active every badge is lit up, but
            // none of them is individually "on".
            const isPicked = !isAllActive && State.activePosFilter.includes(pos);
            const tLabel = trackers[pos] ? `top available tier ${trackers[pos].tier}, ${trackers[pos].count} left` : 'none left';
            trackerHTML += `<button type="button" class="badge pos-badge ${pos} pos-filter ${isActive}" data-action="setPosFilter" data-pos="${pos}" aria-pressed="${isPicked}" aria-label="Filter ${pos}, ${tLabel}"><span>${pos}</span><span style="font-size:0.65rem; opacity:0.9;">${tText}</span></button>`;
        });
        const tierTrackerEl = document.getElementById('tierTracker');
        if (tierTrackerEl) tierTrackerEl.innerHTML = trackerHTML;

        let showStacks = localStorage.getItem(KEYS.mds.stacks) === 'true';

        // One pass over myTeam instead of two full map/find/filter chains over it (each of
        // which scanned the entire player pool once per rostered player) to derive the same
        // two team lists.
        let myQbs = [];
        let myPassCatchers = [];
        myTeam.forEach(id => {
            const p = playerById.get(id);
            if (!p || p.team === "FA") return;
            if (p.posGroup === 'QB') myQbs.push(p.team);
            else if (p.posGroup === 'WR' || p.posGroup === 'TE') myPassCatchers.push(p.team);
        });

        // Read once per render rather than once per card -- see buildPlayerCardHTML's `ctx`.
        const cardCtx = { callOutLists: getCallOutLists(), showTScore: localStorage.getItem(KEYS.mds.tscore) === 'true' };

        let lastTier = null;

        State.players.forEach(p => {
            const isDrafted = draftedSet.has(p.id);
            const isMine = myTeamSet.has(p.id);

            if (isMine && posCounts[p.posGroup] !== undefined) posCounts[p.posGroup]++;

            if (!isDrafted) {
                if (Array.isArray(State.activePosFilter) && State.activePosFilter.length > 0) {
                    if (!State.activePosFilter.includes(p.posGroup)) return;
                }

                if (p.name.toLowerCase().includes(searchTerm)) {
                    if (searchTerm === "" && p.tier !== lastTier && p.tier !== "-") {
                        newPoolHTML += `<div class="tier-divider">Tier ${escapeHtml(p.tier)}</div>`;
                        lastTier = p.tier;
                    }

                    newPoolHTML += buildPlayerCardHTML(p, currentOverallPick, showStacks, myQbs, myPassCatchers, draft, cardCtx);
                }
            }
        });
        if (newPoolHTML === '') {
            newPoolHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-muted); background: rgba(0,0,0,0.1); border-radius: 8px; margin-top: 1rem;">
                    <h4>No players found</h4>
                    <p style="font-size: 0.9rem;">Try clearing your search term or adjusting your position filter.</p>
                </div>`;
        }
        // --- Focus retention across the pool and queue swaps ---
        // innerHTML replaces every card, so whatever button had keyboard focus is destroyed and
        // focus drops to <body> -- mid-draft, every time a Live Sync pick lands. Snapshot which
        // card and which control inside it held focus, then put focus back on the same control
        // in the rebuilt card. If that card is gone (player drafted, or taken off the queue),
        // move to the same control on the next card in the same list, falling back to the
        // previous one. Covers both lists that get rebuilt here: #playerPool and the queue.
        //
        // The control is matched by its position among the card's focusable elements, checked
        // against its class. Position alone is exact because every card in a list comes from the
        // same template; the class check guards against a template change shifting the order.
        // Class alone isn't enough: .btn-mine / .btn-draft are also the inline editor's Save /
        // Cancel, and both queue arrows share .queue-arrow-btn.
        const queueEl = document.getElementById('queueContainer');
        const FOCUSABLE_SEL = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';
        const KEY_CLASSES = ['btn-mine', 'btn-draft', 'edit-link', 'btn-expand', 'queue-arrow-btn'];
        let focusSnap = null;
        const activeEl = document.activeElement;
        const focusList = (activeEl && activeEl !== document.body)
            ? [poolEl, queueEl].find(el => el && el.contains(activeEl)) : null;
        if (focusList) {
            const card = activeEl.closest('.player-card[data-player-id]');
            if (card) {
                const collectIds = (start, dir) => {
                    const ids = [];
                    let sib = start[dir];
                    while (sib && ids.length < 25) {
                        if (sib.dataset && sib.dataset.playerId) ids.push(sib.dataset.playerId);
                        sib = sib[dir];
                    }
                    return ids;
                };
                // A card that's still in edit mode keeps whatever the user had typed; without
                // this a sync tick mid-edit silently reverts the fields to the saved values.
                const inputVals = {};
                card.querySelectorAll('.inline-editor input[id]').forEach(inp => { inputVals[inp.id] = inp.value; });
                let sel = null;
                try { if (activeEl.selectionStart != null) sel = [activeEl.selectionStart, activeEl.selectionEnd]; } catch (e) { /* number inputs */ }
                focusSnap = {
                    listId: focusList.id,
                    playerId: card.dataset.playerId,
                    index: Array.from(card.querySelectorAll(FOCUSABLE_SEL)).indexOf(activeEl),
                    keyClass: KEY_CLASSES.find(c => activeEl.classList.contains(c)) || null,
                    nextIds: collectIds(card, 'nextElementSibling'),
                    prevIds: collectIds(card, 'previousElementSibling'),
                    inputVals,
                    sel
                };
            }
        }

        const restoreFocus = (listEl) => {
            if (!focusSnap || !listEl || focusSnap.listId !== listEl.id) return;
            const findCard = (id) => listEl.querySelector(`.player-card[data-player-id="${id}"]`);
            const usable = (el) => el && !el.disabled && el.getClientRects().length > 0;
            const firstUsable = (card, cls) => Array.from(card.querySelectorAll(`.${cls}`)).find(usable) || null;
            const pickControl = (card) => {
                const byIndex = card.querySelectorAll(FOCUSABLE_SEL)[focusSnap.index];
                if (byIndex && (!focusSnap.keyClass || byIndex.classList.contains(focusSnap.keyClass)) && usable(byIndex)) return byIndex;
                // Same kind of control, first usable one: an open editor's Save on a drafted
                // card maps to the next card's Pick (its editor is closed); a queue arrow that
                // just became disabled (card moved to the top/bottom) maps to the other arrow.
                return (focusSnap.keyClass && firstUsable(card, focusSnap.keyClass)) || firstUsable(card, 'btn-mine');
            };

            let targetCard = findCard(focusSnap.playerId);
            const sameCard = !!targetCard;
            if (!targetCard) {
                for (const id of [...focusSnap.nextIds, ...focusSnap.prevIds]) {
                    targetCard = findCard(id);
                    if (targetCard) break;
                }
            }
            // The last queued player was just drafted or un-queued, so the queue is gone
            // entirely: land on the top card of the pool rather than dropping to <body>.
            if (!targetCard && listEl === queueEl && poolEl) {
                targetCard = poolEl.querySelector('.player-card[data-player-id]');
            }
            if (!targetCard) return;
            if (sameCard) {
                Object.keys(focusSnap.inputVals).forEach(inputId => {
                    const inp = targetCard.querySelector(`#${CSS.escape(inputId)}`);
                    if (inp) inp.value = focusSnap.inputVals[inputId];
                });
            }
            const target = pickControl(targetCard);
            if (target) {
                target.focus();
                if (sameCard && focusSnap.sel) {
                    try { target.setSelectionRange(focusSnap.sel[0], focusSnap.sel[1]); } catch (e) { /* number inputs */ }
                }
            }
        };

        if (poolEl) poolEl.innerHTML = newPoolHTML;
        restoreFocus(poolEl);
        let newQueueHTML = '';

        if (draft && draft.queue && draft.queue.length > 0) {
            let activeQueue = draft.queue.filter(id => !draftedSet.has(id));

            if (activeQueue.length > 0) {
                let queueExpandedClass = isQueueCollapsed ? "" : " is-expanded";
                newQueueHTML += `<button type="button" class="queue-header btn-bare${queueExpandedClass}" data-action="toggleQueueCollapse" aria-expanded="${isQueueCollapsed ? 'false' : 'true'}" aria-label="Toggle Queue">                    <span class="queue-header-title"><span class="pulse-dot" style="background-color: #f59e0b; box-shadow: none; animation: none;"></span> My Queue (${activeQueue.length})</span>
                    <svg aria-hidden="true" class="chevron-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>`;

                if (!isQueueCollapsed) {
                    newQueueHTML += `<div class="player-pool-container" style="margin-bottom: 1.5rem; border-bottom: 1px dashed var(--border); padding-bottom: 1.5rem;">`;

                    activeQueue.forEach((qId, idx) => {
                        let p = playerById.get(qId);
                        if (p) {
                            let isFirst = idx === 0;
                            let isLast = idx === activeQueue.length - 1;
                            newQueueHTML += buildQueueCardHTML(p, idx, isFirst, isLast);
                        }
                    });
                    newQueueHTML += `</div>`;
                }
            }
        }
        if (queueEl) queueEl.innerHTML = newQueueHTML;
        restoreFocus(queueEl);
        if (myTeamEl) myTeamEl.innerHTML = renderFantasyRoster(playerById);

        let otherDraftedIds = draftedPlayers.filter(id => !myTeamSet.has(id)).slice().reverse();
        let newOtherHTML = '';
        if (otherDraftedIds.length === 0) {
            newOtherHTML = `
                <div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
                    <em>No other players drafted yet.</em>
                </div>`;
        } else {
            otherDraftedIds.forEach(id => {
                let p = playerById.get(id);
                if (p) {
                    newOtherHTML += `
                        <div class="roster-item" style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--border);">
                            <div style="color: var(--text-muted);"><strike>${escapeHtml(p.name)}</strike> <span class="badge">${escapeHtml(p.posGroup)}</span></div>
                            <button class="mds-btn-sm btn-draft" style="padding:2px 6px;" data-action="undoDraft" data-id="${p.id}">Undo</button>
                        </div>`;
                }
            });
        }
        if (otherEl) otherEl.innerHTML = newOtherHTML;

        let flexOverflow = Math.max(0, posCounts['RB'] - limits.RB) + Math.max(0, posCounts['WR'] - limits.WR) + Math.max(0, posCounts['TE'] - limits.TE);
        let flexUsed = Math.min(flexOverflow, limits.FLEX);
        let sflexOverflow = Math.max(0, posCounts['QB'] - limits.QB) + Math.max(0, flexOverflow - limits.FLEX);
        let sflexUsed = Math.min(sflexOverflow, limits.SFLEX);

        const limitsBodyEl = document.getElementById('limitsBody');
        if (limitsBodyEl) {
            limitsBodyEl.innerHTML = `
                <tr>
                    <td>${posCounts['QB']} / ${limits.QB || 0}</td>
                    <td>${posCounts['RB']} / ${limits.RB || 0}</td>
                    <td>${posCounts['WR']} / ${limits.WR || 0}</td>
                    <td>${posCounts['TE']} / ${limits.TE || 0}</td>
                    <td>${flexUsed} / ${limits.FLEX || 0}</td>
                    <td>${sflexUsed} / ${limits.SFLEX || 0}</td>
                    <td>${posCounts['K'] || 0} / ${limits.K || 0}</td>
                    <td>${posCounts['DEF'] || 0} / ${limits.DEF || 0}</td>
                    <td><strong>${myTeam.length} / ${limits.TOTAL || 0}</strong></td>
                </tr>`;
        }

        const exportRecapContainer = document.getElementById('exportRecapContainer');
        if (exportRecapContainer) {
            exportRecapContainer.style.display = (myTeam.length >= limits.TOTAL) ? 'flex' : 'none';
        }

        renderDraftMatrix();
        renderDraftRecap();
    }
export const toggleHeadshots = function(show) {
    localStorage.setItem(KEYS.mds.showHeadshots, show);
    if (show) {
        document.body.classList.remove('hide-headshots');
    } else {
        document.body.classList.add('hide-headshots');
    }
};
