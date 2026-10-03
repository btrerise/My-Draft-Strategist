// Moved from js/mds.js in refactor chunk 2A:
// LEAGUE LOGS INTEGRATION (Quick-Start, ADP sync, manual ADP).
// Refactor 7A: LeagueLogs retired its public API, so Quick-Start and Fetch Market Value use
// Fantasy Football Calculator (js/shared/api/ffc.js) instead. Refactor 5A renamed the two
// button handlers from quickStartLeagueLogs / fetchLeagueLogsADP to quickStartFfc /
// fetchMarketValue, once no inline handler called them by name.
import { savePlayerPool } from './storage.js';
import { State } from './state.js';
import { updateMetaDisplay } from './settings.js';
import { renderBoard } from './tracker.js';
import { processData } from './import.js';
import { getSleeperPlayerMap, getSleeperSeasonAdp } from '../shared/api/sleeper.js';
import { FFC_FORMAT_LABELS, fetchFfcAdp, formatFfcDate } from '../shared/api/ffc.js';
import { normalizeName } from '../shared/names.js';

    // --- FANTASY FOOTBALL CALCULATOR (FFC) INTEGRATION ---

    // One sentence on where an FFC list came from, for the toasts below. FFC's lists come from
    // mock drafts on its site, which mostly happen before the season, so after kickoff today's
    // list gets short; the /api/ffc proxy then serves the last full list it saved, if any.
    function describeFfcList(res, label) {
        if (res.source === 'saved') {
            const why = res.liveCount == null
                ? "Fantasy Football Calculator couldn't be reached"
                : res.liveCount === 0
                    ? "Today's list is empty because few mock drafts happen this time of year"
                    : `Today's list only has ${res.liveCount} players because few mock drafts happen this time of year`;
            return `This is Fantasy Football Calculator's last full ${label} list, from ${formatFfcDate(res.savedAt)}. ${why}.`;
        }
        if (res.short) {
            return `Fantasy Football Calculator's ${label} list is short right now because few mock drafts happen this time of year.`;
        }
        return '';
    }

    // FFC names team defenses "Seattle Defense" / "LA Rams Defense"; Sleeper keys each defense
    // by team code with the full team name ("Seattle Seahawks"), which is what processData
    // matches against. Kickers are "PK", which processData already reads as K. Defensive
    // players (FFC's rookie lists have had a DB, OT or OLB) are dropped, as LeagueLogs'
    // Quick-Start dropped anything but QB/RB/WR/TE/K/DEF.
    const FFC_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'PK', 'K', 'DEF'];
    function ffcRowsForImport(players, sleeperMap) {
        return players
            .filter(p => p && p.name && FFC_POSITIONS.includes(String(p.position || '').toUpperCase()))
            .slice()
            .sort((a, b) => parseFloat(a.adp) - parseFloat(b.adp))
            .map(p => {
                const pos = String(p.position || '').toUpperCase();
                const team = String(p.team || '').toUpperCase();
                let name = p.name;
                const def = pos === 'DEF' ? sleeperMap[team] : null;
                if (def && def.first_name && def.last_name) name = `${def.first_name} ${def.last_name}`;
                const adp = parseFloat(p.adp);
                return { Name: name, Pos: pos, Team: team, Bye: p.bye || '', ADP: isNaN(adp) ? '' : adp.toFixed(1) };
            });
    }

    function selectedFfcFormat() {
        const formatSelect = document.getElementById('adpFormatSelect');
        if (!formatSelect) return null;
        const [source, format] = formatSelect.value.split('|');
        if (source !== 'ffc' || !FFC_FORMAT_LABELS[format]) return null;
        return { format, formatText: formatSelect.options[formatSelect.selectedIndex].text };
    }

    export const quickStartFfc = async function(btn) {
        const formatSelect = document.getElementById('adpFormatSelect');
        if (!formatSelect) return;
        const selected = selectedFfcFormat();
        if (!selected) {
            if (window.showToast) window.showToast("Quick-Start builds its player pool from Fantasy Football Calculator. Please select a Fantasy Football Calculator format from the dropdown in Step 3.", { isError: true });
            return;
        }
        const { format, formatText } = selected;
        const label = FFC_FORMAT_LABELS[format];

        const originalText = btn.innerHTML;
        btn.innerHTML = "Building Quick-Start…";

        try {
            const res = await fetchFfcAdp(format, { errorPrefix: 'Fantasy Football Calculator Error' });
            if (res.players.length === 0) throw new Error(`Fantasy Football Calculator's ${label} list is empty right now because few mock drafts happen this time of year. Upload your own rankings instead.`);

            let sleeperMap = {};
            try {
                // Only needed here for the defenses' Sleeper names. processData reads the same
                // map next (in memory by then; cached in IndexedDB for a day).
                sleeperMap = await getSleeperPlayerMap();
            } catch(e) { console.warn("Sleeper DB fetch failed", e); }

            const note = describeFfcList(res, label);
            btn.innerHTML = originalText;
            const loaded = await processData(ffcRowsForImport(res.players, sleeperMap), btn, {
                fileName: null,
                headers: ['Name', 'Pos', 'Team', 'Bye', 'ADP'],
                replace: true,
                successLabel: "Quick-Start Loaded!",
                successToast: res.short
                    ? { text: `Quick-Start loaded only {count} players. ${note} Upload your own rankings for a full player pool.`, opts: { isError: true, duration: 12000 } }
                    : { text: `Quick-Start loaded {count} players from Fantasy Football Calculator (${label} ADP).${note ? '\n\n' + note : ''}`, opts: note ? { duration: 9000 } : undefined }
            });
            if (!loaded) return;

            let now = new Date();
            let dateString = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const listDate = res.source === 'saved' ? ` (list from ${formatFfcDate(res.savedAt)})` : '';
            State.adpMeta = { format: "FFC: " + formatText + listDate, date: dateString };
            localStorage.setItem('ds_adp_meta', JSON.stringify(State.adpMeta));
            updateMetaDisplay();
        } catch(err) {
            console.error(err);
            flashButton(btn, "Fetch Error", true, originalText);
            if (window.showToast) window.showToast(`Failed to load Quick-Start.\n\n${err.message}`, { isError: true });
        }
    };

    export const fetchMarketValue = async function(btn) {
    if (State.players.length === 0) {
        flashButton(btn, "Load Rankings First", true);
        if (window.showToast) window.showToast("You must load a set of player rankings before fetching Market Value.", { isError: true });
        return;
    }

    const formatSelect = document.getElementById('adpFormatSelect');
    if (!formatSelect) return;
    
    // Split the value to route to the correct API
    const [source, profileKey] = formatSelect.value.split('|');
    const formatText = formatSelect.options[formatSelect.selectedIndex].text;

    const originalText = btn.innerHTML;
    btn.innerHTML = "Fetching…";

    try {
        let adpMap = {}; // Key: SleeperID, 'name_' + normalized name, or 'def_' + team; Value: ADP
        let ffcNote = '';
        let listDate = '';

        // --- 1. FANTASY FOOTBALL CALCULATOR ---
        // FFC rows carry no Sleeper ID, so they're matched by name (normalizeName, which also
        // drops suffixes like "III"), and team defenses by team code.
        if (source === 'ffc') {
            const res = await fetchFfcAdp(profileKey, { errorPrefix: 'Fantasy Football Calculator Error' });
            res.players.forEach(item => {
                if (!item || !item.name) return;
                if (String(item.position).toUpperCase() === 'DEF' && item.team) adpMap['def_' + String(item.team).toUpperCase()] = item.adp;
                else adpMap['name_' + normalizeName(item.name)] = item.adp;
            });
            ffcNote = describeFfcList(res, FFC_FORMAT_LABELS[profileKey] || profileKey);
            if (res.source === 'saved') listDate = ` (list from ${formatFfcDate(res.savedAt)})`;
            if (res.short) ffcNote += ' Players missing from it show no ADP.';
        } 
        
        // --- 2. SLEEPER ---
        else if (source === 'sleeper') {
            const sleeperData = await getSleeperSeasonAdp(2026, profileKey);
            sleeperData.forEach(item => {
                // Check if the specific ADP metric exists in the stats object
                if (item.player_id && item.stats && item.stats[profileKey]) {
                    adpMap[item.player_id] = item.stats[profileKey];
                }
            });
        } 

        // --- APPLY TO STATE ---
        State.players.forEach(p => {
            let cleanName = normalizeName(p.name);
            let defKey = p.posGroup === 'DEF' && p.team ? 'def_' + String(p.team).toUpperCase() : null;
            
            if (adpMap[p.sleeperId] !== undefined) {
                p.adp = parseFloat(adpMap[p.sleeperId]).toFixed(1);
            } else if (defKey && adpMap[defKey] !== undefined) {
                p.adp = parseFloat(adpMap[defKey]).toFixed(1);
            } else if (adpMap['name_' + cleanName] !== undefined) {
                p.adp = parseFloat(adpMap['name_' + cleanName]).toFixed(1);
            } else {
                p.adp = "-"; // Reset if no ADP is found in this specific pull
            }
        });

        savePlayerPool();
        renderBoard();

        let now = new Date();
        let dateString = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        State.adpMeta = { format: `${source.toUpperCase()}: ${formatText}${listDate}`, date: dateString };
        localStorage.setItem('ds_adp_meta', JSON.stringify(State.adpMeta));
        updateMetaDisplay();

        flashButton(btn, "Complete!", false, originalText);
        if (typeof window.showToast === 'function') {
            if (ffcNote) window.showToast(`Market Value (ADP) updated.\n\n${ffcNote}`, { duration: 9000 });
            else window.showToast("Market Value (ADP) updated");
        }
        
    } catch(err) {
            console.error(err);
            flashButton(btn, "Fetch Error", true, originalText);
            if (window.showToast) window.showToast(`Failed to fetch live Market Value.\n\n${err.message}`, { isError: true });
        }
};

    // Splits one pasted row into fields, trying delimiters in order of how unlikely they are
    // to appear inside a player's name (tab/pipe/semicolon first, comma last, then falling back
    // to runs of 2+ spaces for plain-text-aligned data e.g. copied out of a PDF). Quoted fields
    // (e.g. "Smith, Jr., John",5) are respected so an embedded comma doesn't split a name apart.
    function splitAdpRow(row) {
        if (row.includes('"')) {
            let fields = [];
            let re = /"([^"]*)"|([^,\t|;]+)/g, m;
            while ((m = re.exec(row)) !== null) {
                let val = (m[1] !== undefined ? m[1] : m[2]).trim();
                if (val !== '') fields.push(val);
            }
            if (fields.length >= 2) return fields;
        }
        if (row.includes('\t')) return row.split('\t');
        if (row.includes('|')) return row.split('|');
        if (row.includes(';')) return row.split(';');
        if (row.includes(',')) return row.split(',');
        return row.split(/\s{2,}/);
    }

    export const processManualADP = function(btn) {
        const text = document.getElementById('adpPasteArea')?.value;
        if (!text) {
            flashButton(btn, "Paste Rank First", true);
            return;
        }

        let matchedCount = 0;
        text.split('\n').forEach(row => {
            row = row.trim();
            if (!row) return;

            let parts = splitAdpRow(row).map(p => p.trim()).filter(p => p !== '');
            if (parts.length < 2) return;

            // The rank/ADP number can be the first OR last column -- detect which side is
            // actually numeric rather than assuming a fixed order. Rows where both or neither
            // side is numeric (a two-number row, a header row, name+position with no rank) are
            // ambiguous and skipped rather than guessed at.
            let first = parts[0];
            let last = parts[parts.length - 1];
            let pName, newAdp;

            if (!isNaN(parseFloat(last)) && isNaN(parseFloat(first))) {
                pName = first; newAdp = last;
            } else if (!isNaN(parseFloat(first)) && isNaN(parseFloat(last))) {
                pName = last; newAdp = first;
            } else {
                return;
            }

            let matchedPlayer = State.players.find(p => typeof isNameMatch === 'function' ? isNameMatch(p.name, pName) : p.name.toLowerCase() === pName.toLowerCase());
            if (matchedPlayer) { matchedPlayer.adp = parseFloat(newAdp).toFixed(1); matchedCount++; }
        });

        if (matchedCount > 0) {
            savePlayerPool();
            renderBoard();
            flashButton(btn, "Updated!");
        } else {
            flashButton(btn, "No Matches", true);
        }
    };
