// --- WHAT CHANGED: A SUMMARY AFTER REPLACING A RANKING SET (improvements S3) ---
// Replace Set (the upload preview) and the ROS auto-fetch's "Replace saved set?" overwrite a saved
// set's rankings in place, and nothing said what moved. After a replace, a "What changed" card shows
// under that set's rankings card (Lineup tab for Weekly, Roster tab for ROS).
//
// How it flows: saveRankingsAsSet (sets.js) calls noteRankingsReplace with the set's old data before
// overwriting it, and clearRankingsChange when an upload makes a new set instead. The caller then
// re-optimizes as before and calls showRankingsChange, which compares the two lists
// (js/shared/rankings/compare.js) and draws the card. The old data lives only in memory until then:
// no storage key, no undo. The card is gone after a reload, and ✕ removes it.
//
// Owner's choices before building:
// - Counts (moved, added, dropped), the top 5 risers and fallers, a "Show all N moves" fold grouped
//   by position, and the added and dropped players by name.
// - "Your players": moves for players on your rosters in every league that uses this set.
// - Starters changed: only the active league is re-optimized on replace (the Lineup tab's
//   optimizeLineup(true) after a Weekly upload; other leagues recompute when opened, because their
//   saved lineup's rankings stamp no longer matches). So a Weekly replace lists who came into and
//   went out of the active league's starting lineup, and names the other leagues using the set,
//   whose lineups update when opened. A ROS replace has no starters part.
// - The ROS auto-fetch's replace shows the card too.
// - Moves are in position rank, and only moves of 3 spots or more count (DEFAULT_MOVE_THRESHOLD).
import { escapeHtml } from '../../shared/html.js';
import { compareRankings, changesByName, findPlayerChange, rankLabel } from '../../shared/rankings/compare.js';
import { RANKING_TYPE_CONFIG, slotDisplayName } from '../constants.js';
import { State } from '../state.js';
import { getSleeperMetaByName, makeLeagueGetPos } from '../scout/waivers.js';
import { buildRankDisplayIndex } from '../scout/waiverScanner.js';

const TOP_N = 5;
const NAMES_SHOWN = 10;
const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

// Per type ('weekly' | 'ros'): a replace waiting for showRankingsChange.
const pending = { weekly: null, ros: null };

const UP_ICON = `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
const DOWN_ICON = `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
const PLUS_ICON = `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
const MINUS_ICON = `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
const SWAP_ICON = `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`;
const CLOSE_ICON = `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const CHEVRON_ICON = `<svg class="mls-change-chevron" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

function containerFor(type) {
    return document.getElementById(`${type}RankingsChange`);
}

// The active league's starters, as { id, name, pos, slot }.
function currentStarters() {
    const starters = State.manualStartersMap[State.activeLeagueId] || [];
    return starters.filter(s => s && s.player).map(s => ({
        id: s.player.id, name: s.player.name, pos: s.player.pos, slot: s.slot
    }));
}

// Called by saveRankingsAsSet just before it overwrites a saved set. oldData is the set's previous
// array (saveRankingsAsSet assigns a new one, so this reference stays as it was).
export function noteRankingsReplace(type, { setId, oldData, newData }) {
    const league = State.leagues.find(l => l.leagueId === State.activeLeagueId) || null;
    pending[type] = {
        setId,
        oldData: Array.isArray(oldData) ? oldData : [],
        newData: Array.isArray(newData) ? newData : [],
        leagueId: league ? league.leagueId : null,
        leagueName: league ? (league.name || 'This league') : null,
        // Only a Weekly replace re-optimizes (the Lineup tab), so only it gets a starters part.
        startersBefore: type === 'weekly' && league ? currentStarters() : null
    };
}

// A save that made a new set: nothing was replaced. Any earlier summary for this type described a
// different upload, so it goes too.
export function clearRankingsChange(type) {
    pending[type] = null;
    const el = containerFor(type);
    if (el) { el.innerHTML = ''; el.hidden = true; }
}

export function dismissRankingsChange(type) {
    clearRankingsChange(type);
}

// Called once the caller has re-optimized. Returns a promise (positions come from the cached
// Sleeper player map) that resolves when the card is drawn; nothing to wait for otherwise.
export async function showRankingsChange(type) {
    const p = pending[type];
    if (!p) return;
    pending[type] = null;
    const cfg = RANKING_TYPE_CONFIG[type];

    // Read now, before anything else can change the lineup.
    const startersAfter = p.startersBefore && State.activeLeagueId === p.leagueId ? currentStarters() : null;

    // Rankings rows carry no position; the league's synced positions and the cached Sleeper player
    // map give one by name. If neither knows a player (offline, say), he's matched by name alone.
    let meta = null;
    try { meta = await getSleeperMetaByName(); } catch (err) { meta = null; }
    const getPos = makeLeagueGetPos(State.leagues.find(l => l.leagueId === p.leagueId) || {}, meta);

    const result = compareRankings(withDisplayRanks(p.oldData, getPos), withDisplayRanks(p.newData, getPos));
    const set = State.rankingSets[cfg.setsKey].find(s => s.id === p.setId);
    const leagues = State.leagues.filter(l => l[cfg.leagueSetIdKey] === p.setId);

    const el = containerFor(type);
    if (!el) return;
    el.innerHTML = renderCard(type, {
        result,
        setName: set ? set.name : `${cfg.label} set`,
        yourPlayers: yourPlayerChanges(result, leagues),
        starters: p.startersBefore && startersAfter ? {
            leagueName: p.leagueName,
            ...diffStarters(p.startersBefore, startersAfter),
            otherLeagues: leagues.filter(l => l.leagueId !== p.leagueId).map(l => l.name || 'Unnamed league')
        } : null
    });
    el.hidden = false;
}

// A single-file upload with no position-rank column stores its overall rank as posRank, so the
// position ranks compared and shown ("WR10 -> WR2") are the ones the Waiver Wire Assistant shows:
// buildRankDisplayIndex orders each position group when the file has none of its own. A derived
// position rank has no tier of its own, so the file's overall tier stands in.
function withDisplayRanks(list, getPos) {
    const rows = Array.isArray(list) ? list : [];
    const index = buildRankDisplayIndex(rows, getPos);
    return rows.map(r => {
        const d = index[r.cleanName];
        if (!d) return r;
        return {
            name: r.name,
            cleanName: r.cleanName,
            pos: d.pos && d.pos !== 'UNK' ? d.pos : null,
            rank: d.rank ?? 999,
            posRank: d.posRank ?? 999,
            posTier: d.posTier ?? null,
            tier: d.tier ?? null
        };
    });
}

// Every rostered player (in a league using this set) with a reported change, once per player, with
// the leagues he's in. Biggest moves first, then adds, drops and position changes.
function yourPlayerChanges(result, leagues) {
    const byName = changesByName(result);
    const found = new Map();
    leagues.forEach(league => {
        (league.roster || []).forEach(player => {
            const change = findPlayerChange(byName, player.name, player.pos === 'FLEX' ? null : player.pos);
            if (!change) return;
            const key = `${change.type}|${change.cleanName}|${change.pos || ''}`;
            if (!found.has(key)) found.set(key, { change, leagues: [] });
            const leagueName = league.name || 'Unnamed league';
            const entry = found.get(key);
            if (!entry.leagues.includes(leagueName)) entry.leagues.push(leagueName);
        });
    });
    const typeOrder = { moved: 0, added: 1, dropped: 2, posChanged: 3 };
    return [...found.values()].sort((a, b) =>
        (typeOrder[a.change.type] - typeOrder[b.change.type])
        || (Math.abs(b.change.delta || 0) - Math.abs(a.change.delta || 0))
        || a.change.name.localeCompare(b.change.name));
}

function diffStarters(before, after) {
    const beforeIds = new Set(before.map(s => s.id));
    const afterIds = new Set(after.map(s => s.id));
    return {
        hadLineup: before.length > 0,
        cameIn: after.filter(s => !beforeIds.has(s.id)),
        wentOut: before.filter(s => !afterIds.has(s.id))
    };
}

// "FLEX1" -> "FLEX", "WRTE2" -> "W/T".
function slotLabel(slot) {
    return slotDisplayName(String(slot || '').replace(/\d+$/, ''));
}

function signed(n) {
    return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function moveRow(c, extra = '') {
    const rose = c.delta > 0;
    const tier = c.tierChanged ? `<span class="mls-change-tier">T${c.old.tier} → T${c.new.tier}</span>` : '';
    return `<li class="mls-change-row ${rose ? 'is-up' : 'is-down'}">
        <span class="mls-change-icon">${rose ? UP_ICON : DOWN_ICON}</span>
        <span class="mls-change-name">${escapeHtml(c.name)}</span>
        <span class="mls-change-ranks">${escapeHtml(rankLabel(c.old, c.basis))} → ${escapeHtml(rankLabel(c.new, c.basis))}</span>
        <span class="mls-change-delta">${signed(c.delta)}</span>${tier}${extra}
    </li>`;
}

function addDropRow(c, extra = '') {
    const added = c.type === 'added';
    const side = added ? c.new : c.old;
    return `<li class="mls-change-row ${added ? 'is-added' : 'is-dropped'}">
        <span class="mls-change-icon">${added ? PLUS_ICON : MINUS_ICON}</span>
        <span class="mls-change-name">${escapeHtml(c.name)}</span>
        <span class="mls-change-ranks">${added ? '' : 'was '}${escapeHtml(rankLabel(side))}</span>${extra}
    </li>`;
}

function posChangeRow(c, extra = '') {
    return `<li class="mls-change-row is-pos">
        <span class="mls-change-icon">${SWAP_ICON}</span>
        <span class="mls-change-name">${escapeHtml(c.name)}</span>
        <span class="mls-change-ranks">${escapeHtml(rankLabel(c.old))} → ${escapeHtml(rankLabel(c.new))}</span>${extra}
    </li>`;
}

function rowFor(c, extra = '') {
    if (c.type === 'moved') return moveRow(c, extra);
    if (c.type === 'posChanged') return posChangeRow(c, extra);
    return addDropRow(c, extra);
}

function list(rows, label) {
    return `<ul class="mls-change-list" aria-label="${escapeHtml(label)}">${rows.join('')}</ul>`;
}

function group(title, body, cls = '') {
    return `<div class="mls-change-group${cls ? ` ${cls}` : ''}"><h4 class="mls-change-group-title">${title}</h4>${body}</div>`;
}

function namesGroup(title, changes, label) {
    if (changes.length === 0) return '';
    const shown = changes.slice(0, NAMES_SHOWN).map(c => addDropRow(c));
    const more = changes.length > NAMES_SHOWN ? `<p class="mls-change-more-note">and ${changes.length - NAMES_SHOWN} more</p>` : '';
    return group(`${title} <span class="mls-change-count">${changes.length}</span>`, list(shown, label) + more);
}

function countsLine(counts) {
    const parts = [
        `${counts.moved} moved`,
        `${counts.added} added`,
        `${counts.dropped} dropped`
    ];
    if (counts.posChanged) parts.push(`${counts.posChanged} changed position`);
    return parts.join(' · ');
}

function renderCard(type, { result, setName, yourPlayers, starters }) {
    const { counts } = result;
    const titleId = `${type}RankingsChangeTitle`;
    const nothing = counts.moved === 0 && counts.added === 0 && counts.dropped === 0 && counts.posChanged === 0;

    let body = `<p class="mls-change-counts">${countsLine(counts)}</p>
        <p class="mls-change-note">Moves of ${result.threshold} or more spots in position rank. ${result.compared} player${result.compared === 1 ? '' : 's'} in both versions.</p>`;

    if (nothing) {
        body += `<p class="mls-change-empty">No player moved ${result.threshold} or more spots, and no one was added or dropped.</p>`;
    } else {
        const risers = result.risers.slice(0, TOP_N).map(c => moveRow(c));
        const fallers = result.fallers.slice(0, TOP_N).map(c => moveRow(c));
        body += `<div class="mls-change-grid">
            ${group('Risers', risers.length ? list(risers, 'Risers') : '<p class="mls-change-none">None</p>', 'is-risers')}
            ${group('Fallers', fallers.length ? list(fallers, 'Fallers') : '<p class="mls-change-none">None</p>', 'is-fallers')}
        </div>`;

        if (counts.moved > 0) {
            const byPos = new Map();
            result.moves.forEach(c => {
                const key = c.pos || 'Other';
                if (!byPos.has(key)) byPos.set(key, []);
                byPos.get(key).push(c);
            });
            const order = [...POSITION_ORDER, ...[...byPos.keys()].filter(k => !POSITION_ORDER.includes(k))];
            const sections = order.filter(k => byPos.has(k)).map(k => group(
                `${escapeHtml(k)} <span class="mls-change-count">${byPos.get(k).length}</span>`,
                list(byPos.get(k).map(c => moveRow(c)), `${k} moves`)
            )).join('');
            body += `<details class="mls-change-all">
                <summary>${CHEVRON_ICON}<span class="mls-change-when-closed">Show all ${counts.moved} move${counts.moved === 1 ? '' : 's'}</span><span class="mls-change-when-open">Hide all moves</span></summary>
                <div class="mls-change-grid">${sections}</div>
            </details>`;
        }

        const addDrop = namesGroup('Added', result.added, 'Added players') + namesGroup('Dropped', result.dropped, 'Dropped players');
        if (addDrop) body += `<div class="mls-change-grid">${addDrop}</div>`;
        if (result.posChanged.length) {
            body += group(`Changed position <span class="mls-change-count">${result.posChanged.length}</span>`,
                list(result.posChanged.map(c => posChangeRow(c)), 'Changed position'));
        }
    }

    body += renderYourPlayers(yourPlayers, result.threshold);
    if (starters) body += renderStarters(starters);

    return `<section class="settings-card mls-change-card" aria-labelledby="${titleId}">
        <header class="card-header mls-change-head">
            <h3 id="${titleId}"><span>What changed: ${escapeHtml(setName)}</span></h3>
            <button type="button" class="btn-bare mls-change-close" data-action="dismissRankingsChange" data-type="${type}" aria-label="Dismiss what changed" title="Dismiss">${CLOSE_ICON}</button>
        </header>
        ${body}
    </section>`;
}

function renderYourPlayers(yourPlayers, threshold) {
    const title = 'Your players';
    if (yourPlayers.length === 0) {
        return group(title, `<p class="mls-change-none">No player on your rosters in leagues using this set moved ${threshold} or more spots, joined or left the list.</p>`, 'is-yours');
    }
    const rows = yourPlayers.map(({ change, leagues }) =>
        rowFor(change, `<span class="mls-change-leagues">${escapeHtml(leagues.join(', '))}</span>`));
    return group(`${title} <span class="mls-change-count">${yourPlayers.length}</span>`, list(rows, 'Your players'), 'is-yours');
}

function renderStarters({ leagueName, hadLineup, cameIn, wentOut, otherLeagues }) {
    const others = otherLeagues.length
        ? `<p class="mls-change-note">Lineups in ${escapeHtml(otherLeagues.join(', '))} update when you open them.</p>`
        : '';
    let inner;
    if (!hadLineup) {
        inner = `<p class="mls-change-none">${escapeHtml(leagueName)} had no saved lineup to compare with.</p>`;
    } else if (cameIn.length === 0 && wentOut.length === 0) {
        inner = `<p class="mls-change-none">Same starters in ${escapeHtml(leagueName)}.</p>`;
    } else {
        const row = (s, isIn) => `<li class="mls-change-row ${isIn ? 'is-added' : 'is-dropped'}">
            <span class="mls-change-icon">${isIn ? PLUS_ICON : MINUS_ICON}</span>
            <span class="mls-change-name">${escapeHtml(s.name)}</span>
            <span class="mls-change-ranks">${escapeHtml(slotLabel(s.slot))}</span>
        </li>`;
        inner = `<div class="mls-change-grid">
            ${group('In', cameIn.length ? list(cameIn.map(s => row(s, true)), 'Starters in') : '<p class="mls-change-none">None</p>')}
            ${group('Out', wentOut.length ? list(wentOut.map(s => row(s, false)), 'Starters out') : '<p class="mls-change-none">None</p>')}
        </div>`;
    }
    return group(`Starters changed in ${escapeHtml(leagueName)}`, inner + others, 'is-starters');
}
