// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3D: TEXT EXPORT
// (DISCORD/GROUP CHAT) and SCREENSHOT EXPORT (copyLineupAsText, exportLineup).
import { State } from '../state.js';
import { getActiveLeague } from '../helpers.js';
    // --- TEXT EXPORT (DISCORD/GROUP CHAT) ---
    export const copyLineupAsText = function(btn) {
        if (!State.activeLeagueId) return;
        
        let league = getActiveLeague();
        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        
        if (starters.length === 0 || !starters.some(s => s.player)) {
            if (window.showToast) window.showToast("No players in lineup to copy.", { isError: true });
            return;
        }

        let textLines = [];
        let leagueName = league && league.name && !league.name.includes("Manual") ? league.name : "Optimal";
        
        textLines.push(`${leagueName} Lineup\n`);
        
        starters.forEach(s => {
            let cleanSlotType = s.slot.replace(/[0-9]/g, ''); 
            
            if (s.player) {
                textLines.push(`${cleanSlotType}: ${s.player.name} (${s.player.team})`);
            } else {
                textLines.push(`${cleanSlotType}: [ Empty ]`);
            }
        });

        const finalString = textLines.join('\n');
        
        navigator.clipboard.writeText(finalString).then(() => {
            if (btn && window.flashButton) window.flashButton(btn, "Copied!");
            if (window.showToast) window.showToast("Lineup copied to clipboard!");
        }).catch(err => {
            console.error("Copy failed:", err);
            if (window.showToast) window.showToast("Failed to copy. Your browser may not support this.", { isError: true });
        });
    };

    // --- SCREENSHOT EXPORT ---
    export const exportLineup = async function() {
    // Fetched on first use rather than on every page load -- see loadScriptOnce in utils.js.
    // The old message here ("loading, try again in a moment") was a symptom of the eager
    // <script defer> tag: the only thing the user could do was wait and re-press. Now the
    // press itself starts the download and the export continues once it lands.
    if (!(await window.ensureHtml2Canvas())) {
        if (window.showToast) window.showToast("Couldn't load the screenshot library. Check your connection and try again.", { isError: true });
        return;
    }

    const container = document.getElementById('optimalLineupContainer');
    const exportBtn = document.getElementById('exportBtn');
    if (!container || !exportBtn) return;

    const origText = exportBtn.innerText;
    exportBtn.innerText = "Capturing…";
    
    const buttons = container.querySelectorAll('.swap-btn, .lock-btn');
    buttons.forEach(b => b.style.display = 'none');
    // The on-screen projected/final points and opponent aren't part of the exported image.
    const screenOnly = container.querySelectorAll('.mls-pts, .mls-opp');
    screenOnly.forEach(e => e.style.display = 'none');

    try {
        const canvas = await html2canvas(container, { 
            backgroundColor: '#1c2541', 
            scale: 2,
            onclone: (clonedDoc) => {
                const clonedContainer = clonedDoc.getElementById('optimalLineupContainer');
                if (clonedContainer) {
                    // Headshots stay out of the exported image: Sleeper's CDN doesn't allow
                    // cross-origin canvas reads, so html2canvas would leave them blank anyway,
                    // and keeping third-party photos out of a PNG that gets passed around
                    // league chats is the safer default. The initials circles stay, so the
                    // rows keep the same shape as on screen.
                    clonedContainer.querySelectorAll('.mls-headshot-img').forEach(img => img.remove());
                    clonedContainer.style.width = '480px';
                    clonedContainer.style.maxWidth = '100%';
                    clonedContainer.style.margin = '0 auto';
                    clonedContainer.style.padding = '1rem';
                    clonedContainer.style.borderRadius = '8px';
                    clonedContainer.style.background = '#1c2541';
                    clonedContainer.style.boxSizing = 'border-box';
                }
            }
        });

        const link = document.createElement('a');
        link.download = `My_Lineup_Strategist.png`; 
        link.href = canvas.toDataURL('image/png'); 
        link.click();
    } catch (err) {
        console.error("Export failed:", err); 
        if (window.showToast) window.showToast("Export failed. Please try again.", { isError: true });
    } finally {
        buttons.forEach(b => b.style.display = 'inline-block');
        screenOnly.forEach(e => e.style.display = '');
        exportBtn.innerText = origText;
    }
};
