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
import { parseSosValue } from '../shared/rankings/parse.js';
import { escapeHtml } from '../shared/html.js';

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
        localStorage.setItem(KEYS.mls.sos, JSON.stringify(State.sosMap));
        
        if (btn) flashButton(btn, "SoS Saved");
        
        const activeTabEl = document.querySelector('.tab-content.active');
        const activeTab = activeTabEl ? activeTabEl.id : '';
        if (activeTab === 'lineupTab') optimizeLineup(true);
        else if (activeTab === 'rosterTab') loadRosterTab();
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
                            if (!State.sosMap[team]) State.sosMap[team] = {};
                            let isMatrix = Object.keys(row).some(k => ['qb','rb','wr','te'].includes(k.toLowerCase()));
                            
                            if (isMatrix) {
                                for (let key in row) {
                                    let k = key.toLowerCase();
                                    if (['qb', 'rb', 'wr', 'te'].includes(k)) {
                                        State.sosMap[team][k.toUpperCase()] = parseSosValue(row[key]);
                                    }
                                }
                            } else {
                                let posKey = Object.keys(row).find(k => k.toLowerCase() === 'pos' || k.toLowerCase() === 'position');
                                let sosKey = Object.keys(row).find(k => SOS_KEY_NAMES.includes(k.toLowerCase()));
                                
                                if (posKey && sosKey) {
                                    let posStr = row[posKey].toUpperCase();
                                    let sosVal = parseSosValue(row[sosKey]);
                                    let posGroup = posStr.includes('QB') ? 'QB' : posStr.includes('RB') ? 'RB' : posStr.includes('WR') ? 'WR' : posStr.includes('TE') ? 'TE' : null;

                                    if (posGroup && sosVal) State.sosMap[team][posGroup] = sosVal;
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
                                    if (!State.sosMap[match.team]) State.sosMap[match.team] = {};
                                    State.sosMap[match.team][match.pos] = sosVal;
                                }
                            });
                        } catch (err) {
                            console.error("Couldn't resolve player teams for SoS file:", err);
                            showToast("SoS file uploaded, but player teams couldn't be resolved. Check your connection and try again.", { isError: true });
                        }
                    }

                    localStorage.setItem(KEYS.mls.sos, JSON.stringify(State.sosMap));
                    generateSoSGrid();
                    
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

    // The "SoS: 7" badge: a team's matchup rank (1-32) at a position from the SoS upload or the
    // manual grid, colored green (1, easiest) to red (32, hardest). Nothing when there's no team,
    // the position isn't in the grid (K, DEF) or the value isn't 1-32. The color is passed as two
    // custom properties; the rest of the look is .sos-badge in css/mls.css (improvements S7 moved
    // it there from an inline style, unchanged for the Roster tab).
    // opts.compact: the Waiver Wire Assistant's rows (improvements S7), padded like the injury and
    // bye badges beside it. opts.explain: the badge explains itself, like the rank-change chips
    // (rankings/moveChips.js): a small button whose title shows on hover and whose tap or click shows
    // the same text as a toast (data-action="explainSoS"), since phones have no hover. With both, phones
    // show a calendar icon and the number instead of "SoS: " (css/mls.css swaps .sos-badge-label for
    // .sos-badge-icon), so it can't be read as another rank, and the tap says what it is.
    // Feather calendar, for the phone version of the compact badge.
    const SOS_CALENDAR_ICON = `<svg class="sos-badge-icon" aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;

    export function getSoSBadgeHTML(team, pos, { compact = false, explain = false } = {}) {
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
        if (!explain) return `<span class="${cls}" style="${style}">SoS: ${rank}</span>`;
        const tip = escapeHtml(`Strength of schedule: ${rank} of 32 for ${pos}s on ${team} (1 = easiest, 32 = hardest)`);
        return `<button type="button" class="${cls}" style="${style}" data-action="explainSoS" data-tip="${tip}" title="${tip}" aria-label="${tip}">${SOS_CALENDAR_ICON}<span class="sos-badge-label">SoS: </span>${rank}</button>`;
    }

    // A tap or click on an explaining SoS badge: what the number means, as a toast.
    export function explainSoS(badgeEl) {
        const text = badgeEl && badgeEl.dataset ? badgeEl.dataset.tip : '';
        if (text) showToast(text);
    }
