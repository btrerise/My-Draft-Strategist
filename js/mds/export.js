// Moved from js/mds/legacy.js (the second half of the old js/mds.js) in refactor chunk 2B:
// TEAM EXPORT LOGIC.

    // --- TEAM EXPORT LOGIC ---
    export const exportTeam = async function() {
        // Fetched on first use rather than on every page load -- see loadScriptOnce in
        // utils.js. The old message here ("loading, try again in a moment") was a symptom of
        // the eager <script defer> tag: the only thing the user could do was wait and
        // re-press. Now the press itself starts the download and the export continues once
        // it lands.
        if (!(await window.ensureHtml2Canvas())) {
            if (window.showToast) window.showToast("Couldn't load the screenshot library. Check your connection and try again.", { isError: true });
            return;
        }

        const container = document.getElementById('exportableTeamContainer'); 
        const exportBtn = document.getElementById('exportTeamBtn');
        
        if (!container) return;

        const origText = exportBtn ? exportBtn.innerText : "Export";
        if (exportBtn) exportBtn.innerText = "Capturing…";
        
        const buttons = container.querySelectorAll('.btn-draft, #toggleRecapMathBtn');
        buttons.forEach(b => b.style.display = 'none');
        
                try {
            const canvas = await html2canvas(container, { 
                backgroundColor: '#0a0e17', // Updated to match your true app background
                scale: 2,
                useCORS: true,     
                allowTaint: true,
                onclone: (clonedDoc) => {
                    const clonedContainer = clonedDoc.getElementById('exportableTeamContainer');
                    const includeRecap = clonedDoc.getElementById('includeRecapInExport')?.checked;
                    const branding = clonedDoc.getElementById('exportBranding');
                    
                    // NEW: Hide all roster avatars in the clone so we don't get blank circles in the export
                    const avatars = clonedDoc.querySelectorAll('.roster-avatar');
                    avatars.forEach(av => av.style.display = 'none');
                    
                    // Reveal the logo only in the screenshot
                    if (branding) {
                        branding.style.display = 'flex';
                    }
                    
                    if (!includeRecap) {
                        const clonedRecap = clonedDoc.getElementById('draftRecapCard');
                        if (clonedRecap) clonedRecap.style.display = 'none';
                    }

                    if (clonedContainer) {
                        clonedContainer.style.width = '480px';
                        clonedContainer.style.maxWidth = '100%';
                        clonedContainer.style.margin = '0 auto';
                        clonedContainer.style.padding = '1.5rem'; // Slight padding bump to frame the logo beautifully
                        clonedContainer.style.boxSizing = 'border-box';
                    }
                }
            });

            const link = document.createElement('a');
            link.download = `My_Draft_Strategist_Team.png`; 
            link.href = canvas.toDataURL('image/png'); 
            link.click();
        } catch (err) {
            console.error("Export failed:", err); 
            if (window.showToast) window.showToast("Export failed. Please try again.", { isError: true });
        } finally {
            buttons.forEach(b => b.style.display = '');
            if (exportBtn) exportBtn.innerText = origText;
        }
    };
