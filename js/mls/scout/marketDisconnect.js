// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3D: MARKET DISCONNECT
// ENGINE (the market file upload and its load-time listener, the Trade Finder threshold controls),
// fetchMarketValue (the Trade Finder's market fetch; fetchLeagueLogsADP until refactor 5D), parseMarketData, and the
// unmarked Trade Finder code after the value curve: getMarketPositionalRanks,
// updateMarketMetaDisplay, runMarketDisconnectAnalysis.
import { fetchMarketConsensusData } from '../../shared/api/market.js';
import { escapeHtml } from '../../shared/html.js';
import { posRankTag, tierTag } from '../constants.js';
import { State } from '../state.js';
import { rankingIndex, getActiveLeague } from '../helpers.js';
import { isFullyMappedLeague } from './allLeaguesSearch.js';
import { getFreshness } from '../../shared/freshness.js';
import { showStatusFeedback } from '../../shared/ui/statusFeedback.js';
import { KEYS } from '../../shared/storage/keys.js';
import { normalizeName } from '../../shared/names.js';
import { showToast } from '../../shared/ui/toast.js';
import { loadSheetJS } from '../../shared/ui/scriptLoader.js';
import { displayRanksFor, leagueRankDisplayIndex } from '../rankings/displayRanks.js';
// --- MARKET DISCONNECT ENGINE ---
    const marketFileEl = document.getElementById('marketFileInput');
    if (marketFileEl) {
        marketFileEl.addEventListener('change', () => processMarketUpload('marketFileInput', 'marketSuccessMsg'));
    }

    // Shared by both the Filter Mode and Rank Basis dropdowns below, since the right threshold
    // label/default depends on BOTH of them together (e.g. "Minimum Rank Gap" needs a much
    // smaller default under Positional Rank than under Overall Rank, but "Min Percentage
    // Shift" doesn't change with rank basis at all -- a percentage shift means the same thing
    // regardless of how big the underlying pool is). Previously this label swap silently
    // no-op'd on every call: it looked up a #thresholdLabel element that didn't exist in the
    // markup, and the early-return guard for a missing label meant the threshold VALUE reset
    // never ran either. Fixed by adding that id to the label in the markup.
    function updateDisconnectThresholdUI() {
        const mode = document.getElementById('disconnectMode')?.value;
        const isPositional = document.getElementById('disconnectRankBasis')?.value === 'positional';
        const label = document.getElementById('thresholdLabel');
        const input = document.getElementById('disconnectThreshold');
        const hint = document.getElementById('disconnectGapHint');
        if (!label || !input) return;

        if (hint) hint.style.display = isPositional ? 'block' : 'none';

        if (mode === 'percent') {
            label.innerText = "Min Percentage Shift (%)";
            input.value = "20";
        } else {
            label.innerText = isPositional ? "Minimum Rank Gap (within position)" : "Minimum Rank Gap";
            input.value = isPositional ? "3" : "10";
        }
    }

    export const toggleDisconnectMode = function() {
        updateDisconnectThresholdUI();
    };

    export const toggleDisconnectRankBasis = function() {
        updateDisconnectThresholdUI();
    };

    function processMarketUpload(fileInputId, successMsgId) {
        const fileInput = document.getElementById(fileInputId);
        if (!fileInput || !fileInput.files[0]) return;
        const file = fileInput.files[0];

        const filename = file.name.toLowerCase();
        if (filename.endsWith('.csv')) {
            Papa.parse(file, {
                header: true, skipEmptyLines: true,
                complete: results => parseMarketData(results.data, successMsgId),
                // Papa calls this instead of `complete` when it can't read the File (moved or
                // deleted after being picked). Without it the upload failed with no message.
                // The input is cleared so choosing the same file again fires 'change'.
                error: err => {
                    console.error("Error reading file:", file.name, err);
                    fileInput.value = '';
                    showToast(`Couldn't read "${file.name}" from disk. Try selecting the file again.`, { isError: true });
                }
            });
        } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
            loadSheetJS(() => {            
                const reader = new FileReader();
                reader.onload = e => {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, {type: 'array'});
                        const csvStr = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
                        Papa.parse(csvStr, { header: true, skipEmptyLines: true, complete: results => parseMarketData(results.data, successMsgId) });
                    } catch (err) {
                        console.error("Error reading Excel file:", err);
                        showToast(`Couldn't read "${file.name}"; it may be corrupted or in an unsupported format. Try re-saving it as .xlsx or .csv and uploading again.`, { isError: true });
                    }
                };
                reader.onerror = () => {
                    console.error("Error reading file:", file.name);
                    showToast(`Couldn't read "${file.name}" from disk. Try selecting the file again.`, { isError: true });
                };
                reader.readAsArrayBuffer(file);
            }, () => {
                console.error("Failed to load SheetJS library");
                showToast(`Couldn't load the Excel file reader, so "${file.name}" wasn't processed. Check your connection and try again, or save the file as .csv instead.`, { isError: true });
            });
        } else if (filename.endsWith('.numbers')) {
            showToast("Numbers files aren't supported directly. In Numbers, use File > Export To > CSV, then upload that file instead.", { isError: true });
        } else {
            showToast("Unsupported file format. Please upload a .csv, .xlsx, or .xls file.", { isError: true });
        }
    }

    export const fetchMarketValue = async function(btn) {
    const outputEl = document.getElementById('marketDisconnectOutput');
    const msgEl = document.getElementById('marketSuccessMsg');
    
    const origText = btn.innerText;
    btn.innerText = "Fetching…";
    btn.style.opacity = "0.7";
    btn.disabled = true;

    try {
        const s = State.marketSettings;
        const isTEP = s.tep ? 'true' : 'false';
        let teamCount = (typeof getActiveLeague === 'function' && getActiveLeague()?.settings?.teams) || 12;

        const { parsed, formatText } = await fetchMarketConsensusData(s.source, s.type, s.qbs, s.ppr, isTEP, teamCount);

        // Save to state and local storage
        State.marketRankings = parsed;
        localStorage.setItem(KEYS.mls.market, JSON.stringify(State.marketRankings)); // was 'mls_season_market' -- State.marketRankings is always read back from KEYS.mls.market on load (see State init above), so this key must match or fetched data silently disappears on reload
        State.marketUpdatedAt = Date.now();
        localStorage.setItem(KEYS.mls.marketUpdated, State.marketUpdatedAt);

        // Update UI
        updateMarketMetaDisplay(); 
        showStatusFeedback(msgEl, `Market Data (${formatText}) Pulled Successfully!`, 3500);
        
        if (outputEl) outputEl.innerHTML = ''; 

    } catch (error) {
        console.error("Error fetching market data:", error);
        showToast(`Could not pull live market data.\n\n${error.message}`, { isError: true });
    } finally {
        btn.innerText = origText;
        btn.style.opacity = "1";
        btn.disabled = false;
    }
};
    function parseMarketData(rows, successMsgId) {
        let parsed = [];
        if (rows.length < 1) return;

        let sample = rows[0];
        let nameKey = Object.keys(sample).find(k => /player|name/i.test(k));
        let rankKey = Object.keys(sample).find(k => /overall[_\s]?rank/i.test(k)) ||
                      Object.keys(sample).find(k => /^rank$/i.test(k)) ||
                      Object.keys(sample).find(k => /overall/i.test(k) && !/value/i.test(k));
        let posKey = Object.keys(sample).find(k => /^pos/i.test(k) || /position/i.test(k));

        if (!nameKey || !rankKey) {
            showToast("Could not automatically detect 'Player' and 'Overall Rank' columns in your market file.", { isError: true });
            return;
        }

        rows.forEach((row, idx) => {
            let nameStr = row[nameKey];
            let valStr = row[rankKey] ? String(row[rankKey]).replace(/[^0-9.]/g, '') : "";
            let posStr = (posKey && row[posKey]) ? String(row[posKey]).trim().toUpperCase() : "";
            if (nameStr && nameStr.trim() && valStr) {
                let numVal = parseFloat(valStr);
                parsed.push({
                    name: nameStr.trim(),
                    cleanName: normalizeName(nameStr.trim()),
                    marketVal: numVal,
                    pos: posStr
                });
            }
        });

        State.marketRankings = parsed;
        localStorage.setItem(KEYS.mls.market, JSON.stringify(State.marketRankings));
        // Upload time, not the file's own date -- a CSV exported last week and uploaded today
        // reads as "today". Same trade-off ROS/Weekly uploads already make.
        State.marketUpdatedAt = Date.now();
        localStorage.setItem(KEYS.mls.marketUpdated, State.marketUpdatedAt);
        updateMarketMetaDisplay();

        showStatusFeedback(document.getElementById(successMsgId), null, 2500);
    }

    // Ranks each market player within their own position group (QB1, QB2, RB1, RB2, ...)
    // instead of across the whole player pool. Market data only ships an overall marketVal --
    // there's no positional rank field to read directly -- so this derives one the same way
    // the auto-fetch-ROS-from-market flow above already does (see its own posCounters loop):
    // sort by marketVal ascending, then count up within each position group as they're
    // encountered. Used by the Trade Finder's "Positional Rank" basis (see
    // runMarketDisconnectAnalysis) to compare a player against others at their own position
    // rather than the full pool -- the fix for Superflex/TEP leagues, where market consensus
    // prices whole positions differently than a standard (non-SF) ROS board does, which
    // otherwise shows up as a false buy-low/sell-high on Overall rank alone.
    function getMarketPositionalRanks(marketRankings) {
        let sorted = [...marketRankings].sort((a, b) => a.marketVal - b.marketVal);
        let posCounters = {};
        let posRankMap = {};
        sorted.forEach(p => {
            const posKey = (p.pos || '').toUpperCase();
            posCounters[posKey] = (posCounters[posKey] || 0) + 1;
            posRankMap[p.cleanName] = posCounters[posKey];
        });
        return posRankMap;
    }

    export function updateMarketMetaDisplay() {
        const metaEl = document.getElementById('marketMetaDisplay');
        if (metaEl) {
            if (State.marketRankings.length > 0) {
                metaEl.style.display = 'block';
                const countText = `Market Consensus Loaded: ${State.marketRankings.length} players`;
                // In-season market values shift within days (injuries, depth-chart news), so the
                // stale line sits much tighter than ROS (14) or Weekly (6).
                const fresh = getFreshness(State.marketUpdatedAt, 3);
                if (fresh) {
                    metaEl.innerHTML = `${countText} <span class="${fresh.isStale ? 'freshness-stale' : 'freshness-ok'}">• ${fresh.label}${fresh.isStale ? ' — pull fresh values before trading' : ''}</span>`;
                } else {
                    metaEl.innerText = countText;
                }
            } else {
                metaEl.style.display = 'none';
            }
        }
    }

    export const runMarketDisconnectAnalysis = function() {
        const outputEl = document.getElementById('marketDisconnectOutput');
        if (!outputEl) return;

        if (State.marketRankings.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">Please upload a market consensus file (KTC/FantasyCalc) first.</span>`;
            return;
        }
        if (State.rosRankings.length === 0) {
            outputEl.innerHTML = `<span class="mls-error-text">Please upload your Rest-of-Season (ROS) rankings on the Roster tab first.</span>`;
            return;
        }

        const mode = document.getElementById('disconnectMode')?.value || 'flat';
        const threshold = parseFloat(document.getElementById('disconnectThreshold')?.value) || 10;
        const posFilter = document.getElementById('disconnectPosFilter')?.value || 'ALL';
        const rankBasis = document.getElementById('disconnectRankBasis')?.value || 'overall';
        const isPositional = rankBasis === 'positional';

        // Positional mode needs each market player's rank WITHIN their own position, which
        // market data doesn't ship directly -- computed once per run (see
        // getMarketPositionalRanks) rather than re-deriving it per player below.
        const marketPosRanks = isPositional ? getMarketPositionalRanks(State.marketRankings) : null;

        let league = getActiveLeague();
        let rosterMap = league ? (league.globalRosterMap || {}) : {};
        // Manual / handoff leagues only know YOUR players, so "not in rosterMap" can't mean
        // "free agent" there -- see isFullyMappedLeague. Those leagues get the same neutral
        // "Not Yours" wording the All My Leagues search already uses, with a tooltip saying why.
        const knowsWholeLeague = isFullyMappedLeague(league);
        const notYoursTitle = "Manual league: this app only knows your roster, so it can't tell whether he's a free agent or on another team. Check your league's site before putting in a claim.";

        let analysisList = [];

        // Built once, outside the loop. This lookup used to be a full scan of rosRankings for
        // every single market entry -- with two ~500-row lists that's ~250,000 comparisons to
        // produce one report, and it was the most expensive single operation left in this file.
        const rosIndex = rankingIndex(State.rosRankings);
        // Positional Rank needs real position ranks: a single file without a Pos Rank column stores the
        // overall rank there, which compared the overall rank with the market's position rank. Re-derived per
        // position as the Waiver Wire and the Lineup and Roster tabs show them (improvements F6); null keeps
        // a file's own position ranks.
        const rosDisplay = isPositional ? leagueRankDisplayIndex(league, State.rosRankings, runMarketDisconnectAnalysis) : null;

        State.marketRankings.forEach(m => {
            if (posFilter !== 'ALL') {
                if (!m.pos || !m.pos.includes(posFilter)) return;
            }
            let userObj = rosIndex.get(m.cleanName);
            if (!userObj) return; // Skip if user didn't rank this player

            // Positional Rank compares a player's rank WITHIN their own position (QB vs QB, RB
            // vs RB, ...) instead of across the whole player pool. This is the fix for the
            // classic Superflex false-positive: market consensus fetched for an SF league
            // prices QBs as a scarce, premium position overall, while a ROS board built without
            // SF weighting in mind ranks everyone on raw points -- so a fairly-valued QB1 (e.g.
            // Josh Allen) reads as a market "sell high" purely from that format mismatch, not a
            // real value gap. A player's rank relative to their OWN position holds up far
            // better across formats than their overall rank does, since SF/TEP mostly re-price
            // whole positions rather than reshuffling players within them.
            let userRank, marketVal;
            // The position rank and tier this basis shows (the file's own, or the re-derived ones above).
            const shownPos = isPositional ? displayRanksFor(rosDisplay, userObj.cleanName, { posRank: userObj.posRank, posTier: userObj.posTier ?? userObj.tier }) : null;
            if (isPositional) {
                userRank = shownPos.posRank;
                marketVal = marketPosRanks[m.cleanName];
                // Skip anyone missing a real positional rank on either side -- a user rankings
                // file with no Pos Rank column (and never uploaded as a position-specific file
                // either) leaves posRank at its 999 sentinel, and a market player with no
                // recognized position never got one either; comparing against that placeholder
                // would fabricate a "disconnect" that isn't real.
                if (!userRank || userRank >= 999 || !marketVal) return;
            } else {
                userRank = userObj.rank;
                marketVal = m.marketVal;
            }

            let delta = 0;
            let isSignificant = false;

            // Corrected sign convention: Market Rank - User Rank
            // Positive delta = User ranks them HIGHER/BETTER than market (Buy target)
            // Negative delta = User ranks them LOWER/WORSE than market (Sell candidate)
            let diff = marketVal - userRank; 

            if (mode === 'flat') {
                delta = diff; 
                isSignificant = Math.abs(delta) >= threshold;
            } else {
                // Percentage shift calculation based on consistent rank difference
                let pct = (Math.abs(diff) / marketVal) * 100;
                delta = diff;
                isSignificant = pct >= threshold;
            }

            if (isSignificant) {
                let tradeType = delta > 0 ? 'BUY' : 'SELL';
                let owner = rosterMap[userObj.cleanName];

                // For SELL opportunities, ensure the player is actually on your roster
                if (tradeType === 'SELL' && owner !== 'You') {
                    return; // Skip if you don't own them
                }

                // For BUY opportunities, ensure the player is NOT already on your roster
                if (tradeType === 'BUY' && owner === 'You') {
                    return; // Skip if you already own them
                }

                analysisList.push({
                    name: userObj.name,
                    cleanName: userObj.cleanName,
                    userRank: userRank,
                    userTier: isPositional ? shownPos.posTier : userObj.tier, // matches whichever rank userRank is (overall tier when there's no position tier, improvements S8 round 3)
                    // The "other" rank for the same player, so the card shows both: the overall rank
                    // when the headline number is positional, the position rank (see posRankTag) when
                    // it's overall.
                    userAltHTML: isPositional
                        ? (userObj.rank < 999 ? ` <span class="mls-rank-sep">&middot;</span> Ovr: <strong>#${userObj.rank}</strong>${tierTag(userObj.tier)}` : '')
                        : posRankTag(userObj, ''),
                    marketVal: marketVal,
                    delta: delta,
                    type: tradeType,
                    owner: owner,
                    pos: m.pos, // carried through so rendering can label positional ranks (e.g. "QB #12") rather than an ambiguous bare number
                    isPositional
                });
            }
        });

        // Sort by magnitude of disconnect
        analysisList.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

        if (analysisList.length === 0) {
            outputEl.innerHTML = `<div class="scout-result-card" style="justify-content:center; color:var(--text-muted);">No significant market disconnects found matching your threshold. Try adjusting the filter limit.</div>`;
            return;
        }

        // A bare "#12" is ambiguous once it can mean either an overall rank or a within-position
        // rank -- prefixing the position (e.g. "QB #12") only for Positional Rank results keeps
        // Overall Rank results looking exactly as they always have.
        function formatDisconnectRank(rank, pos, isPositionalResult) {
            return (isPositionalResult && pos) ? `${escapeHtml(pos)} #${rank}` : `#${rank}`;
        }

        let html = "";
        let buyItems = analysisList.filter(x => x.type === 'BUY');
        let sellItems = analysisList.filter(x => x.type === 'SELL');

        if (buyItems.length > 0) {
            html += `<div style="font-weight:bold; color:var(--primary-green); margin: 0.75rem 0 0.5rem 0; display: flex; align-items: center; gap: 6px;">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
                High-Value Targets (Market Sleeping)
            </div>`;
            buyItems.forEach(item => {
                let ownerStr = item.owner === "You" ? `<span style="color:#60a5fa;">On your roster</span>`
                    : item.owner ? `Rostered by: ${escapeHtml(item.owner)}`
                    : knowsWholeLeague ? `<span style="color:var(--primary-green);">Free Agent</span>`
                    : `<span style="color:var(--text-muted);" title="${notYoursTitle}">Not on your roster</span>`;
                html += `
                <div class="scout-result-card">
                    <div>
                        <div class="mls-item-name">${escapeHtml(item.name)}</div>
                        <div class="mls-meta-row">
                            <span>Your Board: <strong class="mls-stat-green">${formatDisconnectRank(item.userRank, item.pos, item.isPositional)}</strong>${tierTag(item.userTier)}${item.userAltHTML}</span>
                            <span>Market: <strong class="mls-stat-blue">${formatDisconnectRank(item.marketVal, item.pos, item.isPositional)}</strong></span>
                        </div>
                    </div>
                    <div class="mls-text-right">
                        <span class="badge" style="background:var(--target-bg); color:var(--primary-green); border:1px solid var(--target-border);">+${item.delta} Edge</span>
                        <div class="mls-item-subtext">${ownerStr}</div>
                    </div>
                </div>`;
            });
        }

        if (sellItems.length > 0) {
            html += `<div style="font-weight:bold; color:#fca5a5; margin: 1.25rem 0 0.5rem 0; display: flex; align-items: center; gap: 6px;">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>
                Overvalued Assets (Sell High Opportunities)
            </div>`;
            sellItems.forEach(item => {
                html += `
                <div class="scout-result-card">
                    <div>
                        <div class="mls-item-name">${escapeHtml(item.name)}</div>
                        <div class="mls-meta-row">
                            <span>Your Board: <strong class="mls-stat-red">${formatDisconnectRank(item.userRank, item.pos, item.isPositional)}</strong>${tierTag(item.userTier)}${item.userAltHTML}</span>
                            <span>Market: <strong class="mls-stat-blue">${formatDisconnectRank(item.marketVal, item.pos, item.isPositional)}</strong></span>
                        </div>
                    </div>
                    <div class="mls-text-right">
                        <span class="badge" style="background:var(--avoid-bg); color:#fca5a5; border:1px solid var(--avoid-border);">${item.delta} Edge</span>
                        <div class="mls-item-subtext"><strong class="mls-stat-red">On your roster (Sell High!)</strong></div>
                    </div>
                </div>`;
            });
        }

        outputEl.innerHTML = html;
    };
