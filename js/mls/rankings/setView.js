// --- VIEWING A SAVED RANKING SET (improvements S30) ---
// "View" beside "Choose leagues…" under each set's drop-down (the Roster tab's ROS and In-Season pickers, the Lineup
// tab's Weekly picker) opens a read-only list of the set in the shared sheet (js/shared/ui/sheet.js, M11): full height
// on phones, a wider panel from the right on computers. Owner's answers (2026-11-08): that link and the sheet; any
// saved set of the same kind can be picked inside the view (picking one changes nothing a league uses); players on
// your roster and on other teams in the open league are marked; Lineup Strategist only (Draft Strategist later).
//
// Each row: the file's rank, the name with his NFL team, his position with its position rank, the tier and, when the
// SoS grid has one, the SoS badge. The position ranks are the ones the Lineup and Roster tabs show
// (leagueRankDisplayIndex / displayRanksFor, improvements F6): a single file with no Pos Rank column gets them
// worked out from the file's order. A name that doesn't match a Sleeper player is flagged, with the same count the
// upload preview gives (analyzeRankingsFile's rule: Sleeper's player map or the league's own positions).
//
// Built once per set as one string; the search box and the filter chips only hide rows. A 300-player set builds in
// a few milliseconds even on a 4x-slowed CPU (LOG, S30), so the list isn't windowed.
import { escapeHtml } from '../../shared/html.js';
import { normalizeName } from '../../shared/names.js';
import { delegate } from '../../shared/ui/delegate.js';
import { openSheet } from '../../shared/ui/sheet.js';
import { RANKING_TYPE_CONFIG, tierTag } from '../constants.js';
import { State } from '../state.js';
import { getActiveLeague } from '../helpers.js';
import { PICK_BADGE_HTML, scoutPillMarkup } from '../badges.js';
import { explainSoS, getSoSBadgeHTML } from '../sos.js';
import { getSleeperMetaByName, sleeperMetaByNameIfLoaded, makeLeagueGetPos } from '../scout/waivers.js';
import { isDraftPickName } from '../trade/valueCurve.js';
import { isFullyMappedLeague } from '../scout/allLeaguesSearch.js';
import { displayRanksFor, leagueRankDisplayIndex } from './displayRanks.js';
import { IN_SEASON, seasonSetFor } from './season.js';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const UNRANKED = 999;

// The open view: { type, setId, filter, query, root }. One at a time, as the sheet is.
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

// What each row shows, from the set's data, the open league and Sleeper's player map (null while it loads or if it
// failed). Pure apart from the SoS grid and the market ranks makeLeagueGetPos reads, so the spec can check it.
export function buildSetRows(data, league, meta) {
    league = league || {};
    const getPos = makeLeagueGetPos(league, meta);
    const rosterByName = {};
    (league.roster || []).forEach(p => { if (p && p.cleanName) rosterByName[p.cleanName] = p; });
    const owners = league.globalRosterMap || {};
    const posMap = league.globalPosMap || {};
    const index = leagueRankDisplayIndex(league, data, null);
    return [...(data || [])]
        .filter(p => p && p.name)
        .sort((a, b) => (a.rank ?? UNRANKED) - (b.rank ?? UNRANKED))
        .map(p => {
            const clean = p.cleanName || normalizeName(p.name);
            const pick = isDraftPickName(p.name);
            const m = meta && meta[clean];
            let pos = pick ? 'PICK' : getPos(clean);
            if (pos === 'UNK' && rosterByName[clean] && rosterByName[clean].pos) pos = rosterByName[clean].pos;
            const shown = displayRanksFor(index, clean, p);
            const owner = rosterByName[clean] ? 'You' : (owners[clean] || null);
            return {
                rank: Number.isFinite(p.rank) && p.rank < UNRANKED ? p.rank : null,
                name: p.name,
                clean,
                team: (m && m.team) || (rosterByName[clean] && rosterByName[clean].team) || null,
                pos: POSITIONS.includes(pos) || pos === 'PICK' ? pos : null,
                posRank: Number.isFinite(shown.posRank) && shown.posRank < UNRANKED ? shown.posRank : null,
                tier: Number.isFinite(p.tier) ? p.tier : null,
                owner,
                // Only once Sleeper's player map is in; picks are never players.
                unmatched: !!meta && !pick && !meta[clean] && !posMap[clean]
            };
        });
}

function rowHTML(r, { mapped }) {
    const team = r.team ? ` <span class="badge">${escapeHtml(r.team)}</span>` : '';
    const posCell = r.pos === 'PICK' ? PICK_BADGE_HTML
        : r.pos ? `<span class="badge pos-badge ${r.pos} mls-ta-pos">${r.pos}${r.posRank ? r.posRank : ''}</span>`
        : '<span class="rset-none" aria-label="Unknown">–</span>';
    const marks = [];
    if (r.owner === 'You') marks.push(scoutPillMarkup('status-mine', 'Yours'));
    // Free agents carry no mark (owner's choice): the unmarked rows are who's available. The chip filters to them.
    else if (r.owner) marks.push(scoutPillMarkup('status-owned', escapeHtml(r.owner)));
    if (r.unmatched) marks.push('<span class="badge rset-nomatch-badge">No Sleeper match</span>');
    const search = `${r.name} ${r.clean} ${r.team || ''}`.toLowerCase();
    return `<tr data-pos="${r.pos || ''}" data-mine="${r.owner === 'You' ? 1 : ''}" data-free="${mapped && !r.owner && r.pos && r.pos !== 'PICK' && !r.unmatched ? 1 : ''}" data-nomatch="${r.unmatched ? 1 : ''}" data-search="${escapeHtml(search)}">`
        + `<td class="rset-rank">${r.rank ?? '–'}</td>`
        + `<th scope="row" class="rset-player"><span class="rset-name">${escapeHtml(r.name)}</span>${team}`
        + (marks.length ? `<span class="rset-marks">${marks.join('')}</span>` : '') + `</th>`
        + `<td class="rset-pos">${posCell}</td>`
        + `<td class="rset-tier">${r.tier ? tierTag(r.tier).trim() : ''}</td>`
        + `<td class="rset-sos">${r.sos}</td></tr>`;
}

// A filter chip, drawn like the Roster tab's position counts (posCountChipMarkup), lit when it's the one picked.
function chipHTML(key, label, count, colorClass, on) {
    return `<button type="button" class="badge ${colorClass} pos-filter mls-poscount${on ? ' active-filter' : ''}" data-action="rsetFilter" data-filter="${key}" aria-pressed="${on}" aria-label="${escapeHtml(`${label} ${count}`)}">`
        + `<span class="mls-poscount-name">${escapeHtml(label)}</span><span class="mls-poscount-num">${count}</span></button>`;
}

function bodyHTML(type, set, rows, metaState) {
    const cfg = RANKING_TYPE_CONFIG[type];
    const league = getActiveLeague();
    const mapped = isFullyMappedLeague(league);
    const sets = State.rankingSets[cfg.setsKey];
    const kind = type === 'weekly' ? 'Weekly rankings'
        : (league && set.id === (seasonSetFor(league, sets) || {}).id) ? `${IN_SEASON} rankings` : 'ROS rankings';
    const saved = fmtSaved(set.updatedAt || set.createdAt);
    const meta = `${kind} · ${rows.length} player${rows.length === 1 ? '' : 's'}${saved ? ` · Saved ${saved}` : ''}`;

    const picker = sets.length > 1
        ? `<label class="rset-picker"><span>Set</span><select class="form-input" data-action="rsetPick" aria-label="Ranking set to view">${sets.map(s =>
            `<option value="${escapeHtml(s.id)}"${s.id === set.id ? ' selected' : ''}>${escapeHtml(s.name)} (${s.data.length} players)</option>`).join('')}</select></label>`
        : '';

    const unmatched = rows.filter(r => r.unmatched);
    let check = '';
    if (metaState === 'loading') check = '<p class="rset-note">Checking names against Sleeper&hellip;</p>';
    else if (metaState === 'failed') check = '<p class="rset-note">Sleeper\'s player list didn\'t load, so names aren\'t checked and some positions may be missing.</p>';
    else if (unmatched.length) {
        check = `<div class="preview-unmatched rset-unmatched"><div class="preview-unmatched-title">${unmatched.length} of ${rows.length} name${rows.length === 1 ? '' : 's'} didn't match a Sleeper player</div>`
            + `<p class="preview-unmatched-hint">The app can't tell their position or team, or find them on a roster. Check the spelling in your file.</p></div>`;
    }

    const counts = {};
    rows.forEach(r => { if (r.pos) counts[r.pos] = (counts[r.pos] || 0) + 1; });
    const chips = [chipHTML('ALL', 'All', rows.length, 'badge-all', true)]
        .concat(POSITIONS.filter(p => counts[p]).map(p => chipHTML(p, p, counts[p], `pos-badge ${p}`, false)));
    if (counts.PICK) chips.push(chipHTML('PICK', 'Picks', counts.PICK, 'pos-badge FLEX', false));
    const mine = rows.filter(r => r.owner === 'You').length;
    if (mine) chips.push(chipHTML('MINE', 'Yours', mine, 'badge-all', false));
    const free = mapped ? rows.filter(r => !r.owner && r.pos && r.pos !== 'PICK' && !r.unmatched).length : 0;
    if (free) chips.push(chipHTML('FREE', 'Free agents', free, 'badge-all', false));
    if (unmatched.length) chips.push(chipHTML('NOMATCH', 'No match', unmatched.length, 'badge-all', false));

    const hasTier = rows.some(r => r.tier);
    // The SoS badge from your SoS grid, as on the Roster tab; the column only when some row has one.
    rows.forEach(r => { r.sos = r.pos && r.pos !== 'PICK' ? getSoSBadgeHTML(r.team, r.pos, { compact: true }) : ''; });
    const hasSos = rows.some(r => r.sos);
    const body = rows.map(r => rowHTML(r, { mapped })).join('');
    return `<p class="rset-meta">${escapeHtml(meta)}</p>${picker}${check}
<div class="rset-controls">
    <input type="search" class="form-input rset-search" data-action="rsetSearch" placeholder="Search players or teams" aria-label="Search this set" autocomplete="off" spellcheck="false">
    <div class="rset-chips" role="group" aria-label="Show">${chips.join('')}</div>
    <p class="rset-count" aria-live="polite"></p>
</div>
${rows.length ? `<table class="rset-table${hasTier ? '' : ' no-tier'}${hasSos ? '' : ' no-sos'}">
    <caption class="sr-only">${escapeHtml(set.name)}: rank, player, position and position rank${hasTier ? ', tier' : ''}${hasSos ? ', strength of schedule' : ''}</caption>
    <thead><tr><th scope="col" class="rset-rank">#</th><th scope="col">Player</th><th scope="col">Pos</th><th scope="col" class="rset-tier">Tier</th><th scope="col" class="rset-sos"><abbr title="Strength of schedule">SoS</abbr></th></tr></thead>
    <tbody>${body}</tbody>
</table>` : ''}
<div class="rset-empty" hidden><p></p><button type="button" class="mls-btn-sm btn-link-inline" data-action="rsetClear">Clear search and filter</button></div>`;
}

// Shows the rows that pass the search and the chip, and the count or the empty state.
function applyFilter() {
    if (!view || !view.root) return;
    const { root } = view;
    const q = view.query.trim().toLowerCase();
    const qClean = normalizeName(view.query);
    const f = view.filter;
    const rows = root.querySelectorAll('.rset-table tbody tr');
    let shown = 0;
    rows.forEach(tr => {
        const d = tr.dataset;
        const byFilter = f === 'ALL' || (f === 'MINE' ? d.mine : f === 'FREE' ? d.free : f === 'NOMATCH' ? d.nomatch : d.pos === f);
        const bySearch = !q || d.search.includes(q) || (qClean && d.search.includes(qClean));
        const show = !!byFilter && bySearch;
        tr.hidden = !show;
        if (show) shown++;
    });
    root.querySelectorAll('.rset-chips .pos-filter').forEach(b => {
        const on = b.dataset.filter === f;
        b.setAttribute('aria-pressed', String(on));
        // Every chip is lit while All is picked, as on the Roster tab; otherwise only the picked one.
        b.classList.toggle('active-filter', f === 'ALL' || on);
    });
    const count = root.querySelector('.rset-count');
    const empty = root.querySelector('.rset-empty');
    const table = root.querySelector('.rset-table');
    if (rows.length === 0) {
        if (count) count.textContent = '';
        if (empty) { empty.hidden = false; empty.querySelector('p').textContent = 'This set has no players.'; empty.querySelector('button').hidden = true; }
        return;
    }
    if (count) count.textContent = shown === rows.length ? `${rows.length} players` : `Showing ${shown} of ${rows.length}`;
    if (table) table.hidden = shown === 0;
    if (empty) {
        empty.hidden = shown > 0;
        if (shown === 0) {
            const label = f === 'ALL' ? '' : ` in ${({ MINE: 'your players', FREE: 'free agents', NOMATCH: 'unmatched names', PICK: 'picks' })[f] || f}`;
            empty.querySelector('p').textContent = q ? `No players match "${view.query.trim()}"${label}.` : `No players${label}.`;
            empty.querySelector('button').hidden = false;
        }
    }
}

// Fills the sheet's body for view.setId. metaState: 'ready' | 'loading' | 'failed'.
function render(metaState) {
    if (!view || !view.root) return;
    const cfg = RANKING_TYPE_CONFIG[view.type];
    const set = State.rankingSets[cfg.setsKey].find(s => s.id === view.setId);
    if (!set) return;
    const meta = metaState === 'ready' ? sleeperMetaByNameIfLoaded() : null;
    const rows = buildSetRows(set.data, getActiveLeague(), meta);
    const body = view.root.querySelector('.sheet-body');
    const search = body.querySelector('.rset-search');
    const hadFocus = search && document.activeElement === search;
    body.innerHTML = bodyHTML(view.type, set, rows, metaState);
    view.root.querySelector('.sheet-title').textContent = set.name;
    const input = body.querySelector('.rset-search');
    input.value = view.query;
    if (!body.querySelector(`.rset-chips [data-filter="${view.filter}"]`)) view.filter = 'ALL';
    if (hadFocus) input.focus({ preventScroll: true });
    applyFilter();
}

// data-action="viewRankingSet" (data-type ros | weekly, data-slot="season" for the In-Season picker).
export function openRankingSetView(opener, type, slot = null) {
    const set = setForLink(type, slot);
    if (!set) return null;
    const metaNow = sleeperMetaByNameIfLoaded();
    view = { type, setId: set.id, filter: 'ALL', query: '', root: null };
    const mine = view;
    const done = openSheet({ title: set.name, body: '', opener, className: 'rset-view', expanded: true });
    mine.root = document.querySelector('.sheet.rset-view');
    const root = mine.root;
    delegate(root, 'click', {
        rsetFilter() { mine.filter = this.dataset.filter; applyFilter(); },
        rsetClear() { mine.filter = 'ALL'; mine.query = ''; root.querySelector('.rset-search').value = ''; applyFilter(); root.querySelector('.rset-search').focus(); },
        explainSoS() { explainSoS(this); }
    });
    delegate(root, 'input', { rsetSearch() { mine.query = this.value; applyFilter(); } });
    delegate(root, 'change', { rsetPick() { mine.setId = this.value; render(sleeperMetaByNameIfLoaded() ? 'ready' : mine.metaState); } });
    // Escape in a search box with text clears it first (the sheet's Escape closes it when it's empty).
    root.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && e.target.classList && e.target.classList.contains('rset-search') && e.target.value) {
            e.stopPropagation(); e.preventDefault();
            e.target.value = ''; mine.query = ''; applyFilter();
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
