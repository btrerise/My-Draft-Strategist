// Moved from js/mds.js in refactor chunk 2A:
// LEAGUE LOGS INTEGRATION (Quick-Start, ADP sync, manual ADP).
import { savePlayerPool } from './storage.js';
import { BYE_WEEKS_2026, State, saveAndRenderDraftState } from './state.js';
import { updateMetaDisplay } from './settings.js';
import { renderBoard } from './legacy.js';

    // --- LEAGUE LOGS INTEGRATION ---
    export const quickStartLeagueLogs = async function(btn) {
        const formatSelect = document.getElementById('adpFormatSelect');
        if (!formatSelect) return;
        if (!formatSelect.value.startsWith('leaguelogs')) {
            if (window.showToast) window.showToast("Quick-Start auto-generation is currently only supported for LeagueLogs formats. Please select a LeagueLogs option from the dropdown.", { isError: true });
            return;
        }
        const profileKey = formatSelect.value.split('|')[1];
        const formatText = formatSelect.options[formatSelect.selectedIndex].text;

        const originalText = btn.innerHTML;
        btn.innerHTML = "Building Quick-Start…";

        try {
            let sleeperMap = {};
            try {
                // Long timeout for the same reason as processData's copy above: ~5MB payload.
                let res = await window.mdsFetch('https://api.sleeper.app/v1/players/nfl', {}, window.MDS_LONG_FETCH_TIMEOUT_MS);
                if (res.ok) sleeperMap = await res.json();
            } catch(e) { console.warn("Sleeper DB fetch failed", e); }

            const marketRes = await window.mdsFetch(`https://developer.leaguelogs.com/v1/market/${profileKey}`);
            if (!marketRes.ok) throw new Error(`Market Error: ${marketRes.status}`);
            const llMarket = await marketRes.json();

            let playerMetaMap = {};
            try {
                let pRes = await window.mdsFetch(`https://developer.leaguelogs.com/v1/players`);
                if (pRes.ok) {
                    let pData = await pRes.json();
                    pData.data.forEach(lp => { playerMetaMap[lp.sleeperPlayerId] = lp; });
                }
            } catch(e) { console.warn("LeagueLogs Meta fetch failed", e); }

            let newPlayers = [];
            let posCounters = {};
            let sortedMarket = llMarket.data.sort((a, b) => parseFloat(a.overallRank) - parseFloat(b.overallRank));

            sortedMarket.forEach(item => {
                let sId = item.sleeperPlayerId;
                let sp = sleeperMap[sId];
                if (!sp || !sp.first_name) return;

                let cleanName = `${sp.first_name} ${sp.last_name}`;
                let team = sp.team || "FA";
                let bye = BYE_WEEKS_2026[team] || "-";
                
                let posGroup = (sp.position || "FLEX").toUpperCase();
                if (!['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(posGroup)) return;

                if (!posCounters[posGroup]) posCounters[posGroup] = 1;
                let posDisplay = posGroup + posCounters[posGroup];
                posCounters[posGroup]++;

                let lp = playerMetaMap[sId];
                
                // Prefer Sleeper DB for Rookie status if we have it, else fallback to LeagueLogs
                let isRookie = sp ? (sp.years_exp === 0 || sp.years_exp === null) : (lp ? (lp.yearsExp === 0 || lp.yearsExp === "0" || lp.yearsExp === null) : false);
                
                // Dictionary to map full words to abbreviations
                const injMap = { "Questionable": "Q", "Doubtful": "D", "Out": "O", "Suspended": "SUSP" };
                let rawInj = sp ? sp.injury_status : null;
                let injuryStatus = rawInj ? (injMap[rawInj] || rawInj) : null;
                
                let adpNum = parseFloat(item.overallRank);

                newPlayers.push({
                    id: newPlayers.length + 1, sleeperId: sId, rank: newPlayers.length + 1,
                    name: cleanName, posGroup: posGroup, posDisplay: posDisplay, tier: "-", 
                    team: team, bye: bye, adp: isNaN(adpNum) ? "-" : adpNum.toFixed(1), 
                    isRookie: isRookie, 
                    injury: injuryStatus
                });
            });

            if (newPlayers.length > 0) {
                State.players = newPlayers;
                let now = new Date();
                let dateString = now.toLocaleDateString() + ' at ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                State.rankingsMeta = { count: State.players.length, date: dateString };
                State.adpMeta = { format: "LeagueLogs: " + formatText, date: dateString };

                localStorage.setItem('ds_meta', JSON.stringify(State.rankingsMeta));
                localStorage.setItem('ds_adp_meta', JSON.stringify(State.adpMeta));
                savePlayerPool();
                
                updateMetaDisplay();
                saveAndRenderDraftState();
                flashButton(btn, "Quick-Start Loaded!", false, originalText);
                if (typeof window.showToast === 'function') window.showToast("Quick-Start market rankings loaded");
            } else {
                throw new Error("No players generated.");
            }
        } catch(err) {
            console.error(err);
            flashButton(btn, "Fetch Error", true, originalText);
            let adBlockerTip = err.message.includes("Failed to fetch") ? "\n\n(Tip: Ad-blockers often block URLs containing the word 'logs'. Please pause your ad-blocker to use this feature.)" : "";
            if (window.showToast) window.showToast(`Failed to load Quick-Start.\n\n${err.message}${adBlockerTip}`, { isError: true });
        }
    };

    export const fetchLeagueLogsADP = async function(btn) {
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
        let adpMap = {}; // Key: SleeperID (or Name string), Value: ADP

        // --- 1. LEAGUELOGS ---
        if (source === 'leaguelogs') {
            const marketRes = await window.mdsFetch(`https://developer.leaguelogs.com/v1/market/${profileKey}`);
            if (!marketRes.ok) throw new Error(`LeagueLogs Market Error: ${marketRes.status}`);
            const llMarket = await marketRes.json();
            llMarket.data.forEach(item => { adpMap[item.sleeperPlayerId] = item.overallRank; });
        } 
        
        // --- 2. SLEEPER ---
        else if (source === 'sleeper') {
            const sleeperRes = await window.mdsFetch(`https://api.sleeper.com/projections/nfl/2026?season_type=regular&position[]=QB&position[]=RB&position[]=TE&position[]=WR&order_by=${profileKey}`);
            if (!sleeperRes.ok) throw new Error(`Sleeper API Error: ${sleeperRes.status}`);
            const sleeperData = await sleeperRes.json();
            sleeperData.forEach(item => {
                // Check if the specific ADP metric exists in the stats object
                if (item.player_id && item.stats && item.stats[profileKey]) {
                    adpMap[item.player_id] = item.stats[profileKey];
                }
            });
        } 

        // --- APPLY TO STATE ---
        State.players.forEach(p => {
            // Optional: fallback normalizeName function if you don't have it globally scoped
            let cleanName = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            if (adpMap[p.sleeperId] !== undefined) {
                p.adp = parseFloat(adpMap[p.sleeperId]).toFixed(1);
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
        State.adpMeta = { format: `${source.toUpperCase()}: ${formatText}`, date: dateString };
        localStorage.setItem('ds_adp_meta', JSON.stringify(State.adpMeta));
        updateMetaDisplay();

        flashButton(btn, "Complete!", false, originalText);
        if (typeof window.showToast === 'function') window.showToast("Market Value (ADP) updated");
        
    } catch(err) {
            console.error(err);
            flashButton(btn, "Fetch Error", true, originalText);
            let adBlockerTip = err.message.includes("Failed to fetch") ? "\n\n(Tip: Ad-blockers often block URLs containing the word 'logs'. Please pause your ad-blocker to use this feature.)" : "";
            if (window.showToast) window.showToast(`Failed to fetch live Market Value.\n\n${err.message}${adBlockerTip}`, { isError: true });
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
