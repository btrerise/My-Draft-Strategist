// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3B: SOS ENGINE.
import { getSleeperPlayerMap } from '../shared/api/sleeper.js';
import { NFL_TEAMS, fantasyPosition } from './constants.js';
import { State } from './state.js';
import { showStatusFeedback } from '../shared/ui/statusFeedback.js';
import { loadRosterTab, optimizeLineup } from './main.js';
import { KEYS } from '../shared/storage/keys.js';
import { flashButton } from '../shared/ui/flashButton.js';
import { normalizeName } from '../shared/names.js';
import { showToast } from '../shared/ui/toast.js';
import { showConfirm } from '../shared/ui/confirm.js';
import { parseSosValue } from '../shared/rankings/parse.js';
import { escapeHtml } from '../shared/html.js';
import { getFreshness } from '../shared/freshness.js';
import { SOS_SCALE_TEXT, looksLikeRatings, reverseSosValue, sosValues } from './sosScale.js';

    // --- SOS ENGINE ---
    export function generateSoSGrid() {
        const tbody = document.getElementById('sosGridBody');
        if (!tbody) return;
        let html = '';
        NFL_TEAMS.forEach(team => {
            let qb = State.sosMap[team]?.QB || "";
            let rb = State.sosMap[team]?.RB || "";
            let wr = State.sosMap[team]?.WR || "";
            let te = State.sosMap[team]?.TE || "";
            html += `<tr>
                <td style="font-weight:bold;">${team}</td>
                <td><input type="number" class="sos-input" id="sos_${team}_QB" value="${qb}" aria-label="${team} QB matchup rank"></td>
                <td><input type="number" class="sos-input" id="sos_${team}_RB" value="${rb}" aria-label="${team} RB matchup rank"></td>
                <td><input type="number" class="sos-input" id="sos_${team}_WR" value="${wr}" aria-label="${team} WR matchup rank"></td>
                <td><input type="number" class="sos-input" id="sos_${team}_TE" value="${te}" aria-label="${team} TE matchup rank"></td>
            </tr>`;
        });
        tbody.innerHTML = html;
        renderSoSStatus();
    }

    // --- SOS DIRECTION AND AGE (improvements S7, round 5) ---
    const SOS_STALE_DAYS = 7;
    const hasSoS = () => sosValues(State.sosMap).length > 0;

    // "Tue, 9/15": the day SoS was last uploaded or saved, for the badge's tap text.
    function sosAsOf() {
        if (!State.sosUpdatedAt) return '';
        const d = new Date(Number(State.sosUpdatedAt));
        return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' }) : '';
    }

    // Saves the SoS map with today's date and where it came from (round 6), unless the numbers are only
    // being flipped (setSosReversed: no source, so the date and source stay). source: { kind: 'file',
    // name } for an SoS file, { kind: 'rankings', type: 'ros' | 'weekly', name } for a rankings upload's
    // SoS column, { kind: 'grid' } for Save Manual SoS.
    function saveSoS(source = null) {
        localStorage.setItem(KEYS.mls.sos, JSON.stringify(State.sosMap));
        if (source) {
            State.sosUpdatedAt = String(Date.now());
            localStorage.setItem(KEYS.mls.sosUpdated, State.sosUpdatedAt);
            State.sosSource = source;
            localStorage.setItem(KEYS.mls.sosSource, JSON.stringify(source));
        }
        generateSoSGrid();
    }

    // "from sos-week6.csv", "from your ROS rankings (rankings.csv)", "from the manual grid", or '' when
    // it isn't known (SoS saved before round 6).
    function sosSourceText() {
        const src = State.sosSource;
        if (!src || !src.kind) return '';
        if (src.kind === 'grid') return 'from the manual grid';
        const name = src.name ? escapeHtml(src.name) : '';
        if (src.kind === 'rankings') {
            const which = src.type === 'weekly' ? 'Weekly' : 'ROS';
            return `from your ${which} rankings${name ? ` (${name})` : ''}`;
        }
        return name ? `from ${name}` : 'from an SoS file';
    }

    // Merges one upload's SoS ({ TEAM: { POS: value } }) into the map: flipped to 1 = easiest first
    // when your files rank 1 = hardest, and with a warning when the numbers look like 1-5 ratings.
    // Used by the SoS file upload below and by rankings uploads with an SoS column
    // (rankings/uploadPreview.js). The caller saves (saveImportedSoS, with where it came from).
    export function importSoSUpdates(updates) {
        if (looksLikeRatings(sosValues(updates))) {
            showToast(`These SoS numbers only go up to 5, so they look like 1-5 ratings, not 1-32 matchup ranks. The badges read them as ranks (${SOS_SCALE_TEXT}), so nearly every one will look easy. Check your file's SoS column.`, { duration: 10000 });
        }
        Object.entries(updates || {}).forEach(([team, posMap]) => {
            if (!State.sosMap[team]) State.sosMap[team] = {};
            Object.entries(posMap || {}).forEach(([pos, value]) => {
                State.sosMap[team][pos] = State.sosReversed ? reverseSosValue(value) : value;
            });
        });
    }
    export const saveImportedSoS = (source) => saveSoS(source);

    // The line under the SoS upload, shown once there's any SoS: how old it is (amber after a week),
    // which end is easy, a warning if the saved numbers look like ratings, and the switch for sources
    // that rank 1 = hardest. Hidden with no SoS, so the card looks as before until you load some.
    function renderSoSStatus() {
        const el = document.getElementById('sosStatus');
        if (!el) return;
        if (!hasSoS()) { el.hidden = true; el.innerHTML = ''; return; }
        const fresh = getFreshness(State.sosUpdatedAt, SOS_STALE_DAYS);
        const age = fresh
            ? `<span class="${fresh.isStale ? 'freshness-stale' : 'freshness-ok'}">SoS ${fresh.label.charAt(0).toLowerCase()}${fresh.label.slice(1)}${fresh.isStale ? ' - consider refreshing' : ''}</span>${sosSourceText() ? ` <span class="sos-status-source">${sosSourceText()}</span>` : ''}`
            : `<span class="sos-status-muted">Upload date unknown (saved before dates were kept)</span>`;
        const ratings = looksLikeRatings(sosValues(State.sosMap))
            ? `<div class="sos-status-warn freshness-stale">These numbers only go up to 5, so they look like 1-5 ratings rather than 1-32 ranks; the badges will read nearly every one as easy.</div>` : '';
        el.innerHTML = `
            <div class="sos-status-line">${age} <span class="sos-status-sep" aria-hidden="true">&middot;</span> <span class="sos-status-scale">${SOS_SCALE_TEXT}</span></div>
            ${ratings}
            <label class="sos-flip"><input type="checkbox" id="sosReversedToggle" data-action="setSosReversed"${State.sosReversed ? ' checked' : ''}> My SoS files rank 1 = hardest</label>
            <div class="sos-flip-hint">Turn this on if your source lists the toughest schedule as 1. It flips the SoS saved now and every SoS you upload later: SoS files, and SoS columns in ROS or Weekly rankings files.</div>`;
        el.hidden = false;
    }

    // The switch: remembered, and it flips what's already saved (which is always 1 = easiest), so a
    // file that turned out to be the other way round is fixed with one tap, no re-upload. Round 6: when
    // the manual grid was saved after the last upload, the saved numbers may be your own grid edits
    // (always 1 = easiest), so it asks first. "Keep as is" (or Escape) still changes the switch for later
    // uploads and leaves the saved numbers alone.
    export async function setSosReversed(on) {
        on = !!on;
        if (on === State.sosReversed) return;
        State.sosReversed = on;
        localStorage.setItem(KEYS.mls.sosReversed, on ? '1' : '0');
        let flipSaved = true;
        if (State.sosSource && State.sosSource.kind === 'grid') {
            flipSaved = await showConfirm(`You've edited the manual grid since your last upload, and the grid is always ${SOS_SCALE_TEXT}. Flip the SoS you have now too?\n\nEither way, SoS you upload from now on ${on ? 'is flipped' : "isn't flipped"}.`,
                { title: 'Flip the SoS you have now?', confirmText: 'Flip saved SoS', cancelText: 'Keep as is' });
        }
        if (flipSaved) {
            Object.values(State.sosMap).forEach(posMap => {
                Object.keys(posMap || {}).forEach(pos => { posMap[pos] = reverseSosValue(posMap[pos]); });
            });
            saveSoS();
            showToast(on ? `SoS flipped: your files rank 1 = hardest, and the app now reads them as ${SOS_SCALE_TEXT}.` : `SoS flipped back: your files rank 1 = easiest.`);
            refreshSoSViews();
        } else {
            renderSoSStatus();
            showToast(on ? `Saved SoS kept as is. SoS files you upload from now on are flipped to ${SOS_SCALE_TEXT}.` : `Saved SoS kept as is. SoS files you upload from now on are read as ${SOS_SCALE_TEXT}.`);
        }
    }

    function refreshSoSViews() {
        const activeTabEl = document.querySelector('.tab-content.active');
        const activeTab = activeTabEl ? activeTabEl.id : '';
        if (activeTab === 'lineupTab') optimizeLineup(true);
        else if (activeTab === 'rosterTab') loadRosterTab();
    }

    export const saveManualSoS = function(btn) {
        NFL_TEAMS.forEach(team => {
            if (!State.sosMap[team]) State.sosMap[team] = {};
            const getVal = id => document.getElementById(id)?.value || "";
            State.sosMap[team].QB = getVal(`sos_${team}_QB`);
            State.sosMap[team].RB = getVal(`sos_${team}_RB`);
            State.sosMap[team].WR = getVal(`sos_${team}_WR`);
            State.sosMap[team].TE = getVal(`sos_${team}_TE`);
        });
        // The grid is always 1 = easiest (its note says so), so its numbers are saved as typed.
        saveSoS({ kind: 'grid' });
        
        if (btn) flashButton(btn, "SoS Saved");
        refreshSoSViews();
    };

    const sosFileInput = document.getElementById('sosFileInput');
    if (sosFileInput) {
        sosFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            // 'ros' included alongside 'sos'/'schedule'/'matchup' -- several exports label this
            // column "ROS" (rest-of-season) even though it's the same team+position
            // schedule-strength value.
            const SOS_KEY_NAMES = ['sos', 'schedule', 'matchup', 'ros'];
            // Each cell goes through parseSosValue, the rankings parser's reading (refactor 9A): one
            // number is kept as written, sign and decimal included; none or several gives "". Before
            // 9A this kept only the digits, so 4.5 became "45" and -2 became "2".

            Papa.parse(file, {
                header: true, skipEmptyLines: true,
                complete: async function(results) {
                    // This file's SoS, merged into the map at the end by importSoSUpdates (which flips
                    // it when your files rank 1 = hardest).
                    const updates = {};
                    // Rows with no recognizable Team column (e.g. a plain "Player, ROS" export)
                    // get queued here instead of dropped -- resolved via a name lookup against
                    // Sleeper's player map once, below, rather than per-row.
                    const rowsNeedingNameResolution = [];

                    results.data.forEach(row => {
                        let teamKey = Object.keys(row).find(k => k.toLowerCase().includes('team') || k.toLowerCase().includes('tm'));
                        let team = teamKey ? row[teamKey].trim().toUpperCase() : null;
                        const TEAM_ALIASES = { "JAC": "JAX", "WSH": "WAS" };
                        team = TEAM_ALIASES[team] || team;

                        if (team && NFL_TEAMS.includes(team)) {
                            if (!updates[team]) updates[team] = {};
                            let isMatrix = Object.keys(row).some(k => ['qb','rb','wr','te'].includes(k.toLowerCase()));
                            
                            if (isMatrix) {
                                for (let key in row) {
                                    let k = key.toLowerCase();
                                    if (['qb', 'rb', 'wr', 'te'].includes(k)) {
                                        updates[team][k.toUpperCase()] = parseSosValue(row[key]);
                                    }
                                }
                            } else {
                                let posKey = Object.keys(row).find(k => k.toLowerCase() === 'pos' || k.toLowerCase() === 'position');
                                let sosKey = Object.keys(row).find(k => SOS_KEY_NAMES.includes(k.toLowerCase()));
                                
                                if (posKey && sosKey) {
                                    let posStr = row[posKey].toUpperCase();
                                    let sosVal = parseSosValue(row[sosKey]);
                                    let posGroup = posStr.includes('QB') ? 'QB' : posStr.includes('RB') ? 'RB' : posStr.includes('WR') ? 'WR' : posStr.includes('TE') ? 'TE' : null;

                                    if (posGroup && sosVal) updates[team][posGroup] = sosVal;
                                }
                            }
                            return;
                        }

                        // No Team column found for this row -- fall back to matching by player
                        // name against Sleeper's player map (queued, resolved in one batch below).
                        let nameKey = Object.keys(row).find(k => ['player', 'name', 'player name'].includes(k.toLowerCase().trim()));
                        let sosKey = Object.keys(row).find(k => SOS_KEY_NAMES.includes(k.toLowerCase()));
                        if (nameKey && sosKey && row[nameKey] && row[nameKey].trim()) {
                            let sosVal = parseSosValue(row[sosKey]);
                            if (sosVal) rowsNeedingNameResolution.push({ name: row[nameKey].trim(), sosVal });
                        }
                    });

                    if (rowsNeedingNameResolution.length > 0) {
                        try {
                            const map = await getSleeperPlayerMap();
                            const teamPosByName = {};
                            Object.values(map).forEach(p => {
                                // fantasyPosition (constants.js): two-way players by the position they're scored at (9C).
                                if (p.first_name && p.team && ['QB', 'RB', 'WR', 'TE'].includes(fantasyPosition(p))) {
                                    teamPosByName[normalizeName(`${p.first_name} ${p.last_name}`)] = { team: p.team, pos: fantasyPosition(p) };
                                }
                            });

                            rowsNeedingNameResolution.forEach(({ name, sosVal }) => {
                                let match = teamPosByName[normalizeName(name)];
                                if (match) {
                                    if (!updates[match.team]) updates[match.team] = {};
                                    updates[match.team][match.pos] = sosVal;
                                }
                            });
                        } catch (err) {
                            console.error("Couldn't resolve player teams for SoS file:", err);
                            showToast("SoS file uploaded, but player teams couldn't be resolved. Check your connection and try again.", { isError: true });
                        }
                    }

                    importSoSUpdates(updates);
                    saveSoS({ kind: 'file', name: file.name });
                    // Redraw the badges on the open tab. Before improvements S7 an upload left the
                    // Roster tab's badges as they were until you switched tabs.
                    refreshSoSViews();
                    
                    showStatusFeedback(document.getElementById('sosSuccessMsg'), null, 3000);
                },
                // Papa calls this instead of `complete` when it can't read the File. Without it
                // the upload failed with no message. The input is cleared so choosing the same
                // file again fires 'change'.
                error: function(err) {
                    console.error("Error reading file:", file.name, err);
                    sosFileInput.value = '';
                    showToast(`Couldn't read "${file.name}" from disk. Try selecting the file again.`, { isError: true });
                }
            });
        });
    }

    // The "SoS: 7" badge, the same everywhere it shows (the Roster tab, and Auto-Find's and Check a
    // List's cards since improvements S7): a team's matchup rank (1-32) at a position from the SoS upload
    // or the manual grid, colored green (1, easiest) to red (32, hardest). Nothing when there's no team,
    // the position isn't in the grid (K, DEF) or the value isn't 1-32. The color is passed as two
    // custom properties; the rest of the look is .sos-badge in css/mls.css.
    // It explains itself like the rank-change chips (rankings/moveChips.js): a small button whose title
    // shows on hover and whose tap or click shows the same text as a toast (data-action="explainSoS"),
    // since phones have no hover. On phones and touch screens it shows a calendar icon and the number
    // instead of "SoS: " (css/mls.css swaps .sos-badge-label for .sos-badge-icon), so it stays short
    // and can't be read as another rank. Owner's choice in S7, round 4: one look across the site.
    // opts.compact: the Waiver Wire Assistant's cards, padded like the injury and bye badges beside it.
    // Feather calendar.
    const SOS_CALENDAR_ICON = `<svg class="sos-badge-icon" aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;

    export function getSoSBadgeHTML(team, pos, { compact = false } = {}) {
        if (!team || team === "FA" || !pos) return "";
        let teamData = State.sosMap[team];
        if (!teamData) return "";
        
        let rankStr = teamData[pos];
        if (!rankStr || rankStr === "") return "";
        
        let rank = parseInt(rankStr);
        if (isNaN(rank) || rank < 1 || rank > 32) return "";
        
        let hue = Math.max(0, 120 - ((rank - 1) * 3.87));
        let color = `hsl(${hue}, 80%, 65%)`;
        let bg = `hsl(${hue}, 80%, 15%)`;
        const cls = `badge sos-badge${compact ? ' sos-badge-compact' : ''}`;
        const style = `--sos-color:${color}; --sos-bg:${bg};`;
        const asOf = sosAsOf();
        const tip = escapeHtml(`Strength of schedule: ${rank} of 32 for ${pos}s on ${team} (${SOS_SCALE_TEXT})${asOf ? `, as of ${asOf}` : ''}`);
        return `<button type="button" class="${cls}" style="${style}" data-action="explainSoS" data-tip="${tip}" title="${tip}" aria-label="${tip}">${SOS_CALENDAR_ICON}<span class="sos-badge-label">SoS: </span>${rank}</button>`;
    }

    // A tap or click on an SoS badge: what the number means, as a toast.
    export function explainSoS(badgeEl) {
        const text = badgeEl && badgeEl.dataset ? badgeEl.dataset.tip : '';
        if (text) showToast(text);
    }
