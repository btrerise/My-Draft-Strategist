// --- VIEWING A SAVED RANKING SET (improvements S30) ---
// "View" beside "Choose leagues…" under each set's drop-down (the Roster tab's ROS and In-Season pickers, the Lineup
// tab's Weekly picker) opens the set in the shared sheet (js/shared/ui/sheet.js, M11): full height on phones, a wider
// panel from the right on computers. Owner's answers (2026-11-08): that link and the sheet; any saved set of the same
// kind can be picked inside the view (picking one changes nothing a league uses); players on your roster and on other
// teams in the open league are marked; Lineup Strategist only (Draft Strategist later).
//
// Round 2 (owner's choices, after seeing it with their weekly file):
//   * ONE LIST OR SEVERAL. A file of one ranked list (most ROS files) reads as one list: "All", and a position chip
//     narrows it. A file of separate lists (a weekly sheet with QB / RB / WR / TE / K / DEF / FLEX columns, or one file
//     per position) stores several players at each rank, so a mixed list put Burrow, Gibbs, the Seahawks and Aubrey all
//     at #1. Such a set (several players share a rank) has no "All": each chip is its own list, ranked by its own
//     number, opening on FLEX when the file has FLEX ranks, else the first position.
//   * TIER LINES instead of a Tier column: a labelled line where each tier starts, the first one too, when the rows on
//     screen run in tier order (a position's list, an overall list with overall tiers); otherwise none.
//   * TWO CHIP ROWS, drawn like the Roster tab's position counts: positions (or lists), then who has him (Everyone,
//     Yours, Free agents, Other teams). They combine. The search and positions stay at the top while the list scrolls;
//     the ownership row scrolls away unless one of its filters is on.
//   * FIX A NAME. A row whose name didn't match a Sleeper player has "Fix name": edit it in place, see as you type
//     whether the new spelling matches, and save it into the set (every league using the set reads it at once).
//
// Each row: the list's rank, the name with his NFL team and who has him, his position with its position rank (the
// numbers the Lineup and Roster tabs show, leagueRankDisplayIndex / displayRanksFor, improvements F6) and, when the SoS
// grid has one, the SoS badge. Built per list as one string; the search and the ownership chips only hide rows.
import { escapeHtml } from '../../shared/html.js';
import { normalizeName } from '../../shared/names.js';
import { delegate } from '../../shared/ui/delegate.js';
import { openSheet } from '../../shared/ui/sheet.js';
import { showToast } from '../../shared/ui/toast.js';
import { RANKING_TYPE_CONFIG } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague } from '../helpers.js';
import { PICK_BADGE_HTML, scoutPillMarkup } from '../badges.js';
import { explainSoS, getSoSBadgeHTML } from '../sos.js';
import { getSleeperMetaByName, sleeperMetaByNameIfLoaded, makeLeagueGetPos } from '../scout/waivers.js';
import { isDraftPickName } from '../trade/valueCurve.js';
import { isFullyMappedLeague } from '../scout/allLeaguesSearch.js';
import { hydrateRankingsForLeague } from '../leagues/sync.js';
import { loadRosterTab, optimizeLineup } from '../main.js';
import { displayRanksFor, leagueRankDisplayIndex } from './displayRanks.js';
import { IN_SEASON, seasonSetFor } from './season.js';
import { opponentFor, rankedOpponentBadgeHTML } from '../opponent.js';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const UNRANKED = 999;
const ranked = (n) => Number.isFinite(n) && n < UNRANKED ? n : null;
const OWNER_CHIPS = [['ALL', 'Everyone'], ['MINE', 'Yours'], ['FREE', 'Free agents'], ['OTHERS', 'Other teams']];

// The open view: { type, setId, list, owner, query, unmatchedOnly, editing, root, metaState }. One at a time.
let view = null;

const fmtSaved = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

// The set a View link points at: the drop-down's saved set, or the league's In-Season set (data-slot="season").
function setForLink(type, slot) {
    if (slot === 'season') return seasonSetFor(getActiveLeague(), State.rankingSets.ros);
    const cfg = RANKING_TYPE_CONFIG[type];
    const sel = document.getElementById(cfg.selectId);
    return State.rankingSets[cfg.setsKey].find(s => s.id === (sel && sel.value)) || null;
}

const findSet = (type, id) => State.rankingSets[RANKING_TYPE_CONFIG[type].setsKey].find(s => s.id === id) || null;

// What each row shows, from the set's data, the open league and Sleeper's player map (null while it loads or if it
// failed). `i` is the row's index in the set's data (for Fix name).
export function buildSetRows(data, league, meta) {
    league = league || {};
    const getPos = makeLeagueGetPos(league, meta);
    const rosterByName = {};
    (league.roster || []).forEach(p => { if (p && p.cleanName) rosterByName[p.cleanName] = p; });
    const owners = league.globalRosterMap || {};
    const posMap = league.globalPosMap || {};
    const index = leagueRankDisplayIndex(league, data, null);
    const rows = [];
    (data || []).forEach((p, i) => {
        if (!p || !p.name) return;
        const clean = p.cleanName || normalizeName(p.name);
        const pick = isDraftPickName(p.name);
        const m = meta && meta[clean];
        let pos = pick ? 'PICK' : getPos(clean);
        if (pos === 'UNK' && rosterByName[clean] && rosterByName[clean].pos) pos = rosterByName[clean].pos;
        const shown = displayRanksFor(index, clean, p);
        rows.push({
            i,
            rank: ranked(p.rank),
            name: p.name,
            clean,
            team: (m && m.team) || (rosterByName[clean] && rosterByName[clean].team) || null,
            pos: POSITIONS.includes(pos) || pos === 'PICK' ? pos : null,
            posRank: ranked(shown.posRank),
            flexRank: ranked(p.flexRank),
            tier: Number.isFinite(p.tier) ? p.tier : null,
            posTier: Number.isFinite(shown.posTier) ? shown.posTier : (Number.isFinite(p.posTier) ? p.posTier : null),
            flexTier: Number.isFinite(p.flexTier) ? p.flexTier : null,
            // This week's opponent and matchup rank, in a Weekly file that has them (improvements S31).
            opp: p.opp || null, oppHome: typeof p.oppHome === 'boolean' ? p.oppHome : null, oppRank: Number.isInteger(p.oppRank) ? p.oppRank : null,
            owner: rosterByName[clean] ? 'You' : (owners[clean] || null),
            // Only once Sleeper's player map is in; picks are never players.
            unmatched: !!meta && !pick && !meta[clean] && !posMap[clean]
        });
    });
    return rows;
}

// Separate lists: some rank is shared by two or more players (a weekly sheet, one file per position).
export function isMultiList(rows) {
    const seen = new Set();
    for (const r of rows) {
        if (r.rank === null) continue;
        if (seen.has(r.rank)) return true;
        seen.add(r.rank);
    }
    return false;
}

// The lists the first chip row offers, in order: [{ key, label, count }].
export function listChoices(rows) {
    const multi = isMultiList(rows);
    const counts = {};
    rows.forEach(r => { if (r.pos) counts[r.pos] = (counts[r.pos] || 0) + 1; });
    const out = [];
    if (!multi) out.push({ key: 'ALL', label: 'All', count: rows.length });
    else {
        const flex = rows.filter(r => r.flexRank !== null && r.flexRank !== r.posRank).length;
        if (flex) out.push({ key: 'FLEX', label: 'FLEX', count: rows.filter(r => r.flexRank !== null).length });
    }
    POSITIONS.forEach(p => { if (counts[p]) out.push({ key: p, label: p, count: counts[p] }); });
    if (counts.PICK) out.push({ key: 'PICK', label: 'Picks', count: counts.PICK });
    return out;
}

// One list's rows in order, each with the number in the # column and the tier its line uses.
export function listRows(rows, key, multi) {
    const by = (f) => (a, b) => (f(a) ?? UNRANKED) - (f(b) ?? UNRANKED) || a.i - b.i;
    if (key === 'NOMATCH') return rows.filter(r => r.unmatched).sort(by(r => r.rank)).map(r => ({ r, n: r.rank, tier: null }));
    if (key === 'ALL') return rows.slice().sort(by(r => r.rank)).map(r => ({ r, n: r.rank, tier: r.tier }));
    if (key === 'FLEX') return rows.filter(r => r.flexRank !== null).sort(by(r => r.flexRank)).map(r => ({ r, n: r.flexRank, tier: r.flexTier }));
    const mine = rows.filter(r => r.pos === key);
    if (key === 'PICK' || !multi) return mine.sort(by(r => r.rank)).map(r => ({ r, n: r.rank, tier: r.posTier ?? r.tier }));
    return mine.sort(by(r => r.posRank)).map(r => ({ r, n: r.posRank, tier: r.posTier }));
}

const isFree = (r, mapped) => mapped && !r.owner && !!r.pos && r.pos !== 'PICK' && !r.unmatched;

function rowHTML({ r, n, tier }, { mapped }) {
    const team = r.team ? ` <span class="badge">${escapeHtml(r.team)}</span>` : '';
    const posCell = r.pos === 'PICK' ? PICK_BADGE_HTML
        : r.pos ? `<span class="badge pos-badge ${r.pos} mls-ta-pos">${r.pos}${r.posRank ? r.posRank : ''}</span>`
        : '<span class="rset-none" aria-label="Unknown">–</span>';
    const marks = [];
    if (r.owner === 'You') marks.push(scoutPillMarkup('status-mine', 'Yours'));
    // Free agents carry no mark (owner's choice): the unmarked rows are who's available. The chip filters to them.
    else if (r.owner) marks.push(scoutPillMarkup('status-owned', escapeHtml(r.owner)));
    if (r.unmatched) {
        marks.push('<span class="badge rset-nomatch-badge">No Sleeper match</span>');
        marks.push(`<button type="button" class="mls-btn-sm btn-link-inline rset-fix-btn" data-action="rsetEditName" data-i="${r.i}" aria-label="Fix the name ${escapeHtml(r.name)}">Fix name</button>`);
    }
    const owner = r.owner === 'You' ? 'MINE' : r.owner ? 'OTHERS' : isFree(r, mapped) ? 'FREE' : '';
    const search = `${r.name} ${r.clean} ${r.team || ''}`.toLowerCase();
    return `<tr class="rset-row" data-i="${r.i}" data-owner="${owner}" data-tier="${tier ?? ''}" data-search="${escapeHtml(search)}">`
        + `<td class="rset-rank">${n ?? '–'}</td>`
        + `<th scope="row" class="rset-player"><span class="rset-name">${escapeHtml(r.name)}</span>${team}`
        + (marks.length ? `<span class="rset-marks">${marks.join('')}</span>` : '') + `</th>`
        + `<td class="rset-pos">${posCell}</td>`
        + `<td class="rset-sos">${r.sos}</td></tr>`;
}

// A tier's line, before its first row (the first tier too).
const tierRowHTML = (tier) => `<tr class="rset-tier-row" data-tier="${tier}"><td colspan="4"><div class="tier-divider">Tier ${tier}</div></td></tr>`;

// A chip, drawn like the Roster tab's position counts (posCountChipMarkup).
function chipHTML(action, key, label, count, colorClass) {
    return `<button type="button" class="badge ${colorClass} pos-filter mls-poscount" data-action="${action}" data-key="${key}" aria-pressed="false" aria-label="${escapeHtml(`${label} ${count}`)}">`
        + `<span class="mls-poscount-name">${escapeHtml(label)}</span><span class="mls-poscount-num">${count}</span></button>`;
}

const colorFor = (key) => POSITIONS.includes(key) ? `pos-badge ${key}` : key === 'FLEX' ? 'flex-blend' : key === 'PICK' ? 'pos-badge FLEX' : 'badge-all';

function bodyHTML(set, rows, metaState) {
    const cfg = RANKING_TYPE_CONFIG[view.type];
    const league = getActiveLeague();
    const mapped = isFullyMappedLeague(league);
    const sets = State.rankingSets[cfg.setsKey];
    const kind = view.type === 'weekly' ? 'Weekly rankings'
        : (league && set.id === (seasonSetFor(league, sets) || {}).id) ? `${IN_SEASON} rankings` : 'ROS rankings';
    const saved = fmtSaved(set.updatedAt || set.createdAt);
    const meta = `${kind} · ${rows.length} player${rows.length === 1 ? '' : 's'}${saved ? ` · Saved ${saved}` : ''}`;

    const picker = sets.length > 1
        ? `<label class="rset-picker"><span>Set</span><select class="form-input" data-action="rsetPick" aria-label="Ranking set to view">${sets.map(s =>
            `<option value="${escapeHtml(s.id)}"${s.id === set.id ? ' selected' : ''}>${escapeHtml(s.name)} (${s.data.length} players)</option>`).join('')}</select></label>`
        : '';

    const unmatched = rows.filter(r => r.unmatched).length;
    let check = '';
    if (metaState === 'loading') check = '<p class="rset-note">Checking names against Sleeper&hellip;</p>';
    else if (metaState === 'failed') check = '<p class="rset-note">Sleeper\'s player list didn\'t load, so names aren\'t checked and some positions may be missing.</p>';
    else if (unmatched) {
        check = `<div class="preview-unmatched rset-unmatched"><div class="preview-unmatched-title">${unmatched} of ${rows.length} name${rows.length === 1 ? '' : 's'} didn't match a Sleeper player</div>`
            + `<p class="preview-unmatched-hint">The app can't tell their position or team, or find them on a roster. Fix a name here, or the spelling in your file.</p>`
            + `<button type="button" class="mls-btn-sm btn-link-inline rset-show-unmatched" data-action="rsetUnmatched" aria-pressed="false">Show these names</button></div>`;
    }

    const lists = listChoices(rows);
    const listChips = lists.map(c => chipHTML('rsetList', c.key, c.label, c.count, colorFor(c.key))).join('');
    const mine = rows.filter(r => r.owner === 'You').length;
    const others = rows.filter(r => r.owner && r.owner !== 'You').length;
    const free = rows.filter(r => isFree(r, mapped)).length;
    const ownerCounts = { ALL: rows.length, MINE: mine, FREE: free, OTHERS: others };
    // Free agents and Other teams only where the app knows every roster (a synced league).
    const ownerChips = (mine || mapped)
        ? OWNER_CHIPS.filter(([k]) => k === 'ALL' || k === 'MINE' || mapped).map(([k, l]) => chipHTML('rsetOwner', k, l, ownerCounts[k], 'badge-all')).join('')
        : '';

    // The last column. A Weekly set with opponents: this week's opponent and how tough he is for the position, the
    // Lineup tab's badge (S31), headed "Opp", Strength of opponent (owner's choice, round 3). Otherwise the SoS badge
    // from your SoS grid, as on the Roster tab, headed "SoS", Strength of schedule. The column only when a row has one.
    const opponents = view.type === 'weekly' && rows.some(r => r.opp || r.oppRank !== null);
    rows.forEach(r => {
        if (opponents) {
            const info = opponentFor({ opp: r.opp, oppHome: r.oppHome, oppRank: r.oppRank }, undefined);
            r.sos = !info ? '' : rankedOpponentBadgeHTML(info, r.pos && r.pos !== 'PICK' ? r.pos : null)
                || `<span class="mls-opp">${info.home === true ? 'vs ' : info.home === false ? '@ ' : ''}${escapeHtml(info.opp)}</span>`;
        } else {
            r.sos = r.pos && r.pos !== 'PICK' ? getSoSBadgeHTML(r.team, r.pos, { compact: true }) : '';
        }
    });
    const hasSos = rows.some(r => r.sos);
    const lastCol = opponents ? ['Opp', 'Strength of opponent'] : ['SoS', 'Strength of schedule'];
    return `<p class="rset-meta">${escapeHtml(meta)}</p>${picker}${check}
<div class="rset-controls">
    <input type="search" class="form-input rset-search" data-action="rsetSearch" placeholder="Search players or teams" aria-label="Search this set" autocomplete="off" spellcheck="false">
    ${lists.length ? `<div class="rset-chips" role="group" aria-label="List">${listChips}</div>` : ''}
</div>
${ownerChips ? `<div class="rset-chips rset-owner-chips" role="group" aria-label="Who has him">${ownerChips}</div>` : ''}
<p class="rset-count" aria-live="polite"></p>
${rows.length ? `<table class="rset-table${hasSos ? '' : ' no-sos'}">
    <caption class="sr-only">${escapeHtml(set.name)}: rank, player, position and position rank${hasSos ? `, ${lastCol[1].toLowerCase()}` : ''}</caption>
    <thead><tr><th scope="col" class="rset-rank">#</th><th scope="col">Player</th><th scope="col">Pos</th><th scope="col" class="rset-sos"><abbr title="${lastCol[1]}">${lastCol[0]}</abbr></th></tr></thead>
    <tbody></tbody>
</table>` : ''}
<div class="rset-empty" hidden><p></p><button type="button" class="mls-btn-sm btn-link-inline" data-action="rsetClear">Clear search and filter</button></div>`;
}

// Fills the table with the current list (view.list, or the unmatched names), with a line before each tier.
function renderList() {
    const { root, rows } = view;
    const tbody = root.querySelector('.rset-table tbody');
    if (!tbody) return;
    const mapped = isFullyMappedLeague(getActiveLeague());
    const items = listRows(rows, view.unmatchedOnly ? 'NOMATCH' : view.list, view.multi);
    let html = '';
    let last = null;
    items.forEach(it => {
        if (it.tier !== null && it.tier !== last) { html += tierRowHTML(it.tier); last = it.tier; }
        html += rowHTML(it, { mapped });
    });
    tbody.innerHTML = html;
    view.listSize = items.length;
}

// Hides what the search and the ownership chip leave out, the tier lines with nothing under them (and all of them
// when the rows on screen aren't in tier order), and shows the count or the empty state.
function applyFilter() {
    if (!view || !view.root) return;
    const { root } = view;
    const q = view.query.trim().toLowerCase();
    const qClean = normalizeName(view.query);
    const o = view.owner;
    let shown = 0;
    let lastTier = -Infinity, ordered = true, anyTier = false;
    const lines = [];
    let line = null;
    root.querySelectorAll('.rset-table tbody tr').forEach(tr => {
        if (tr.classList.contains('rset-tier-row')) { line = { tr, rows: 0 }; lines.push(line); return; }
        const d = tr.dataset;
        const show = (o === 'ALL' || d.owner === o) && (!q || d.search.includes(q) || (qClean && d.search.includes(qClean)));
        tr.hidden = !show;
        if (!show) return;
        shown++;
        if (line) line.rows++;
        if (d.tier !== '') {
            const t = Number(d.tier);
            anyTier = true;
            if (t < lastTier) ordered = false;
            lastTier = t;
        }
    });
    lines.forEach(l => { l.tr.hidden = !(ordered && anyTier && l.rows > 0); });

    root.querySelectorAll('[data-action="rsetList"]').forEach(b => {
        const on = !view.unmatchedOnly && b.dataset.key === view.list;
        b.setAttribute('aria-pressed', String(on));
        // As on the Roster tab: every chip lit while All is picked; otherwise only the picked one.
        b.classList.toggle('active-filter', !view.unmatchedOnly && (view.list === 'ALL' || on));
    });
    root.querySelectorAll('[data-action="rsetOwner"]').forEach(b => {
        const on = b.dataset.key === o;
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('active-filter', o === 'ALL' || on);
    });
    const ownerRow = root.querySelector('.rset-owner-chips');
    // Pinned under the search and positions only while one of its filters is on (owner's choice, round 2).
    if (ownerRow) ownerRow.classList.toggle('is-pinned', o !== 'ALL');
    const unmatchedBtn = root.querySelector('.rset-show-unmatched');
    if (unmatchedBtn) {
        unmatchedBtn.setAttribute('aria-pressed', String(view.unmatchedOnly));
        unmatchedBtn.textContent = view.unmatchedOnly ? 'Show all players' : 'Show these names';
    }

    const count = root.querySelector('.rset-count');
    const empty = root.querySelector('.rset-empty');
    const table = root.querySelector('.rset-table');
    if (view.rows.length === 0) {
        if (count) count.textContent = '';
        if (empty) { empty.hidden = false; empty.querySelector('p').textContent = 'This set has no players.'; empty.querySelector('button').hidden = true; }
        return;
    }
    const total = view.listSize;
    if (count) count.textContent = shown === total ? `${total} player${total === 1 ? '' : 's'}` : `Showing ${shown} of ${total}`;
    if (table) table.hidden = shown === 0;
    if (empty) {
        empty.hidden = shown > 0;
        if (shown === 0) {
            const who = ({ MINE: ' among your players', FREE: ' among free agents', OTHERS: ' on other teams' })[o] || '';
            empty.querySelector('p').textContent = q ? `No players match "${view.query.trim()}"${who}.` : `No players${who}.`;
            empty.querySelector('button').hidden = false;
        }
    }
}

// Keeps the pinned ownership row just under the search and positions (their height changes with the width).
function watchControls(root) {
    const controls = root.querySelector('.rset-controls');
    if (!controls || typeof ResizeObserver !== 'function') return;
    const set = () => root.style.setProperty('--rset-controls-h', `${controls.offsetHeight}px`);
    set();
    new ResizeObserver(set).observe(controls);
}

// Fills the sheet's body for view.setId. metaState: 'ready' | 'loading' | 'failed'.
function render(metaState) {
    if (!view || !view.root) return;
    const set = findSet(view.type, view.setId);
    if (!set) return;
    const meta = metaState === 'ready' ? sleeperMetaByNameIfLoaded() : null;
    view.rows = buildSetRows(set.data, getActiveLeague(), meta);
    view.multi = isMultiList(view.rows);
    const lists = listChoices(view.rows);
    if (!lists.some(c => c.key === view.list)) view.list = lists.length ? lists[0].key : 'ALL';
    if (!view.rows.some(r => r.unmatched)) view.unmatchedOnly = false;
    view.editing = null;
    const body = view.root.querySelector('.sheet-body');
    const search = body.querySelector('.rset-search');
    const hadFocus = search && document.activeElement === search;
    body.innerHTML = bodyHTML(set, view.rows, metaState);
    view.root.querySelector('.sheet-title').textContent = set.name;
    const input = body.querySelector('.rset-search');
    input.value = view.query;
    if (hadFocus) input.focus({ preventScroll: true });
    watchControls(view.root);
    renderList();
    applyFilter();
}

// --- FIX NAME (round 2) ---
// The row's name becomes a text field; a line under it says whether the spelling matches a Sleeper player.
function nameCheck(text, set, i) {
    const t = text.trim();
    if (!t) return { error: 'Type a name.' };
    const clean = normalizeName(t);
    const dup = set.data.some((p, j) => j !== i && p && (p.cleanName || normalizeName(p.name)) === clean);
    if (dup) return { error: 'Another player in this set already has that name.' };
    const meta = sleeperMetaByNameIfLoaded();
    const m = meta && meta[clean];
    if (m) return { ok: `Matches a Sleeper player: ${[m.pos, m.team].filter(Boolean).join(', ')}.` };
    return { warn: 'No Sleeper player by that name yet.' };
}

function startEdit(i) {
    if (view.editing !== null) cancelEdit();
    const set = findSet(view.type, view.setId);
    const tr = view.root.querySelector(`.rset-row[data-i="${i}"]`);
    if (!set || !tr || !set.data[i]) return;
    view.editing = i;
    const cell = tr.querySelector('.rset-player');
    cell.dataset.before = cell.innerHTML;
    cell.innerHTML = `<div class="rset-edit">
    <input type="text" class="form-input rset-edit-input" data-action="rsetEditInput" maxlength="60" aria-label="Name as Sleeper spells it" value="${escapeHtml(set.data[i].name)}" autocomplete="off" spellcheck="false">
    <p class="rset-edit-hint" aria-live="polite"></p>
    <div class="rset-edit-actions"><button type="button" class="btn btn-primary mls-btn-sm" data-action="rsetEditSave">Save name</button><button type="button" class="btn btn-secondary mls-btn-sm" data-action="rsetEditCancel">Cancel</button></div>
</div>`;
    const input = cell.querySelector('input');
    input.focus();
    input.select();
    showCheck(input);
}

function showCheck(input) {
    const set = findSet(view.type, view.setId);
    const res = nameCheck(input.value, set, view.editing);
    const hint = input.closest('.rset-edit').querySelector('.rset-edit-hint');
    hint.textContent = res.error || res.ok || res.warn;
    hint.className = `rset-edit-hint${res.error ? ' is-error' : res.ok ? ' is-ok' : ''}`;
    return res;
}

function cancelEdit() {
    const i = view.editing;
    view.editing = null;
    const tr = view.root.querySelector(`.rset-row[data-i="${i}"]`);
    const cell = tr && tr.querySelector('.rset-player');
    if (cell && cell.dataset.before !== undefined) {
        cell.innerHTML = cell.dataset.before;
        delete cell.dataset.before;
        const fix = cell.querySelector('.rset-fix-btn');
        if (fix) fix.focus();
    }
}

// Saves the new name into the set: stored, and read at once by every league using the set (the open league's
// rankings are reloaded and its tab redrawn).
function saveEdit() {
    const i = view.editing;
    const set = findSet(view.type, view.setId);
    const input = view.root.querySelector('.rset-edit-input');
    if (!set || !input || i === null) return;
    const res = showCheck(input);
    if (res.error) { input.focus(); return; }
    const name = input.value.trim();
    const before = set.data[i].name;
    view.editing = null;
    if (name !== before) {
        set.data[i] = { ...set.data[i], name, cleanName: normalizeName(name) };
        const cfg = RANKING_TYPE_CONFIG[view.type];
        localStorage.setItem(cfg.localStorageSetsKey, JSON.stringify(State.rankingSets[cfg.setsKey]));
        hydrateRankingsForLeague(getActiveLeague());
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'rosterTab') loadRosterTab();
        if (activeTab && activeTab.id === 'lineupTab') optimizeLineup(false);
        showToast(res.ok ? `Saved "${name}". It matches Sleeper now.` : `Saved "${name}". It still doesn't match a Sleeper player.`);
    }
    render(view.metaState);
    const row = view.root.querySelector(`.rset-row[data-i="${i}"]`);
    const focusTo = (row && row.querySelector('.rset-fix-btn')) || view.root.querySelector('.rset-search');
    if (focusTo) focusTo.focus({ preventScroll: !!row });
}

// data-action="viewRankingSet" (data-type ros | weekly, data-slot="season" for the In-Season picker).
export function openRankingSetView(opener, type, slot = null) {
    const set = setForLink(type, slot);
    if (!set) return null;
    const metaNow = sleeperMetaByNameIfLoaded();
    view = { type, setId: set.id, list: null, owner: 'ALL', query: '', unmatchedOnly: false, editing: null, root: null, rows: [] };
    const mine = view;
    const done = openSheet({ title: set.name, body: '', opener, className: 'rset-view', expanded: true });
    mine.root = document.querySelector('.sheet.rset-view');
    const root = mine.root;
    const relist = () => { if (mine.editing !== null) cancelEdit(); renderList(); applyFilter(); };
    delegate(root, 'click', {
        rsetList() { mine.list = this.dataset.key; mine.unmatchedOnly = false; relist(); },
        rsetOwner() { mine.owner = this.dataset.key; applyFilter(); },
        rsetUnmatched() { mine.unmatchedOnly = !mine.unmatchedOnly; relist(); },
        rsetClear() {
            mine.owner = 'ALL'; mine.query = ''; mine.unmatchedOnly = false;
            root.querySelector('.rset-search').value = '';
            relist();
            root.querySelector('.rset-search').focus();
        },
        rsetEditName() { startEdit(Number(this.dataset.i)); },
        rsetEditSave() { saveEdit(); },
        rsetEditCancel() { cancelEdit(); },
        explainSoS() { explainSoS(this); }
    });
    delegate(root, 'input', {
        rsetSearch() { mine.query = this.value; applyFilter(); },
        rsetEditInput() { showCheck(this); }
    });
    delegate(root, 'change', { rsetPick() { mine.setId = this.value; mine.list = null; mine.unmatchedOnly = false; render(mine.metaState); } });
    // Escape: cancels a name being fixed, then clears a typed search, before the sheet's own Escape closes it.
    // Enter in the name field saves it.
    root.addEventListener('keydown', (e) => {
        const t = e.target;
        if (!t.classList) return;
        if (t.classList.contains('rset-edit-input') && (e.key === 'Escape' || e.key === 'Enter')) {
            e.stopPropagation(); e.preventDefault();
            if (e.key === 'Enter') saveEdit(); else cancelEdit();
        } else if (e.key === 'Escape' && t.classList.contains('rset-search') && t.value) {
            e.stopPropagation(); e.preventDefault();
            t.value = ''; mine.query = ''; applyFilter();
        }
    }, true);

    mine.metaState = metaNow ? 'ready' : 'loading';
    render(mine.metaState);
    if (!metaNow) {
        getSleeperMetaByName()
            .then(() => { mine.metaState = 'ready'; })
            .catch(() => { mine.metaState = 'failed'; })
            .then(() => { if (view === mine && root.isConnected) render(mine.metaState); });
    }
    done.then(() => { if (view === mine) view = null; });
    return done;
}
