// Moved from js/mds/legacy.js (the second half of the old js/mds.js) in refactor chunk 2B:
// TEAM EXPORT LOGIC.
import { ensureHtml2Canvas } from '../shared/ui/scriptLoader.js';
import { showToast } from '../shared/ui/toast.js';

// html2canvas draws the image at this scale; the flex labels' canvases below match it so they stay sharp.
const EXPORT_SCALE = 2;

// The Team tab's filled FLX, SFLX, W/T and W/R labels are gradient text (css/mds.css: background-clip: text).
// html2canvas 1.4.1 doesn't support background-clip: text and paints the label's whole box with the gradient,
// so the letters vanish into a color bar (improvements F5). In the export's clone only, each such label's text
// is redrawn on a canvas, which html2canvas copies as it is: the same gradient across the same box, in the
// label's own font, with the text where the page puts it. The page's labels are never touched.
const FLEX_LABEL_SELECTOR = '.roster-label.flex-blend-text, .roster-label.sflex-blend-text, .roster-label.wt-blend-text, .roster-label.wr-blend-text';

async function drawFlexLabelsOnCanvas(clonedDoc) {
    const view = clonedDoc.defaultView;
    for (const label of clonedDoc.querySelectorAll(FLEX_LABEL_SELECTOR)) {
        const style = view.getComputedStyle(label);
        // The gradient's colors as resolved (e.g. "linear-gradient(90deg, rgb(16, 185, 129), ...)"), evenly
        // spaced, as the --*-blend variables in css/base.css define them.
        const colors = style.backgroundImage.match(/rgba?\([^)]*\)/g);
        const text = label.textContent.trim();
        if (!colors || !text) continue;

        // Where the text sits: its left edge, and its baseline (the bottom of an empty inline-block on it).
        const textSpan = clonedDoc.createElement('span');
        textSpan.textContent = text;
        const baselineMark = clonedDoc.createElement('span');
        baselineMark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        label.replaceChildren(textSpan, baselineMark);
        const box = label.getBoundingClientRect();
        const textX = textSpan.getBoundingClientRect().left - box.left;
        const baseline = baselineMark.getBoundingClientRect().bottom - box.top;

        const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        try { await clonedDoc.fonts.load(font, text); } catch (e) { /* draw with whatever font is there */ }

        const canvas = clonedDoc.createElement('canvas');
        canvas.width = Math.ceil(box.width * EXPORT_SCALE);
        canvas.height = Math.ceil(box.height * EXPORT_SCALE);
        canvas.style.cssText = `display:block;width:${box.width}px;height:${box.height}px`;
        canvas.setAttribute('aria-label', text);
        const ctx = canvas.getContext('2d');
        ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
        ctx.font = font;
        ctx.textBaseline = 'alphabetic';
        const gradient = ctx.createLinearGradient(0, 0, box.width, 0);
        colors.forEach((color, i) => gradient.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), color));
        ctx.fillStyle = gradient;
        ctx.fillText(text, textX, baseline);

        label.style.backgroundImage = 'none';
        label.style.webkitBackgroundClip = 'border-box';
        label.style.backgroundClip = 'border-box';
        label.replaceChildren(canvas);
    }
}

    // --- TEAM EXPORT LOGIC ---
    export const exportTeam = async function() {
        // Fetched on first use rather than on every page load -- see loadScriptOnce in
        // js/shared/ui/scriptLoader.js. The old message here ("loading, try again in a moment") was a symptom of
        // the eager <script defer> tag: the only thing the user could do was wait and
        // re-press. Now the press itself starts the download and the export continues once
        // it lands.
        if (!(await ensureHtml2Canvas())) {
            showToast("Couldn't load the screenshot library. Check your connection and try again.", { isError: true });
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
                scale: EXPORT_SCALE,
                useCORS: true,     
                allowTaint: true,
                onclone: async (clonedDoc) => {
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

                    // After the width change above, so each label is measured where it will be drawn.
                    await drawFlexLabelsOnCanvas(clonedDoc);
                }
            });

            const link = document.createElement('a');
            link.download = `My_Draft_Strategist_Team.png`; 
            link.href = canvas.toDataURL('image/png'); 
            link.click();
        } catch (err) {
            console.error("Export failed:", err); 
            showToast("Export failed. Please try again.", { isError: true });
        } finally {
            buttons.forEach(b => b.style.display = '');
            if (exportBtn) exportBtn.innerText = origText;
        }
    };
