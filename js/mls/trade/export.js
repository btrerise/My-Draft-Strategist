// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3D: TEXT EXPORT
// (DISCORD/GROUP CHAT) and SCREENSHOT EXPORT (copyLineupAsText, exportLineup).
import { State } from '../state.js';
import { slotDisplayName } from '../constants.js';
import { getActiveLeague } from '../helpers.js';
import { showToast } from '../../shared/ui/toast.js';
import { flashButton } from '../../shared/ui/flashButton.js';
import { ensureHtml2Canvas } from '../../shared/ui/scriptLoader.js';

// The FLEX, SFLEX, W/T and W/R slot badges draw a blended border with two background layers: the dark fill
// clipped to the padding box over the gradient clipped to the border box (css/mls.css, --*-blend in
// css/base.css). html2canvas 1.4.1 paints the fill over the whole badge, so the border all but disappeared
// from the image (improvements F5). In the export's clone only, the gradient stays on the badge and the fill
// moves to an inner span that covers the padding box: two plain backgrounds, which html2canvas draws as the
// page does. The page's badges are never touched.
const BLENDED_SLOT_BADGES = '.slot-badge.slot-FLEX, .slot-badge.slot-SFLEX, .slot-badge.slot-WRTE, .slot-badge.slot-WRRB';
const GRADIENT_LAYER = /(?:repeating-)?(?:linear|radial|conic)-gradient\((?:[^()]|\([^()]*\))*\)/g;

function splitBlendedBorders(root) {
    const view = root.ownerDocument.defaultView;
    root.querySelectorAll(BLENDED_SLOT_BADGES).forEach(badge => {
        const style = view.getComputedStyle(badge);
        const [fill, border] = style.backgroundImage.match(GRADIENT_LAYER) || [];
        if (!fill || !border) return;
        const inner = root.ownerDocument.createElement('span');
        inner.append(...badge.childNodes);
        const pad = ['Top', 'Right', 'Bottom', 'Left'].map(side => style['padding' + side]);
        inner.style.cssText = `display:block; background-image:${fill}; padding:${pad.join(' ')};` +
            ` margin:${pad.map(p => '-' + p).join(' ')}; border-radius:${Math.max(parseFloat(style.borderTopLeftRadius) - parseFloat(style.borderTopWidth), 0)}px`;
        badge.style.backgroundImage = border;
        badge.style.backgroundClip = 'border-box';
        badge.style.backgroundOrigin = 'border-box'; // or html2canvas repeats it from the padding box's edge
        badge.appendChild(inner);
    });
}

    // --- TEXT EXPORT (DISCORD/GROUP CHAT) ---
    export const copyLineupAsText = function(btn) {
        if (!State.activeLeagueId) return;
        
        let league = getActiveLeague();
        let starters = State.manualStartersMap[State.activeLeagueId] || [];
        
        if (starters.length === 0 || !starters.some(s => s.player)) {
            showToast("No players in lineup to copy.", { isError: true });
            return;
        }

        let textLines = [];
        let leagueName = league && league.name && !league.name.includes("Manual") ? league.name : "Optimal";
        
        textLines.push(`${leagueName} Lineup\n`);
        
        starters.forEach(s => {
            let cleanSlotType = slotDisplayName(s.slot.replace(/[0-9]/g, ''));
            
            if (s.player) {
                textLines.push(`${cleanSlotType}: ${s.player.name} (${s.player.team})`);
            } else {
                textLines.push(`${cleanSlotType}: [ Empty ]`);
            }
        });

        const finalString = textLines.join('\n');
        
        navigator.clipboard.writeText(finalString).then(() => {
            if (btn) flashButton(btn, "Copied!");
            showToast("Lineup copied to clipboard!");
        }).catch(err => {
            console.error("Copy failed:", err);
            showToast("Failed to copy. Your browser may not support this.", { isError: true });
        });
    };

    // --- SCREENSHOT EXPORT ---
    export const exportLineup = async function() {
    // Fetched on first use rather than on every page load -- see loadScriptOnce in js/shared/ui/scriptLoader.js.
    // The old message here ("loading, try again in a moment") was a symptom of the eager
    // <script defer> tag: the only thing the user could do was wait and re-press. Now the
    // press itself starts the download and the export continues once it lands.
    if (!(await ensureHtml2Canvas())) {
        showToast("Couldn't load the screenshot library. Check your connection and try again.", { isError: true });
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
                    // The box above the lineup ("This lineup needs you": injured and IR-slot starters, swaps,
                    // the Sleeper differences; improvements S9 round 7, S11 round 4) is a to-do list for you, not
                    // for the league chat this image gets posted in (owner's decision). The rows' badges stay.
                    clonedContainer.querySelectorAll('.lineup-needs-box').forEach(el => el.remove());
                    splitBlendedBorders(clonedContainer);
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
        showToast("Export failed. Please try again.", { isError: true });
    } finally {
        buttons.forEach(b => b.style.display = 'inline-block');
        screenOnly.forEach(e => e.style.display = '');
        exportBtn.innerText = origText;
    }
};

// --- TRADE EXPORT (improvements S14) ---
// The Trade Analyzer's verdict and "after the trade" section as a PNG for a league chat, the way Export
// Lineup saves the lineup. The image is drawn from a clone, so the page doesn't change: the header naming
// the league and both sides shows (it's hidden on the page), the partner's fold opens, and what only
// makes sense on screen goes: tooltips and their dotted underlines, the "i" icons, the button, and the
// notes written for you rather than the league (.mls-trade-impact-help: injuries left out, typos, ...).
export const exportTrade = async function() {
    if (!(await ensureHtml2Canvas())) {
        showToast("Couldn't load the screenshot library. Check your connection and try again.", { isError: true });
        return;
    }
    const area = document.getElementById('tradeExportArea');
    const btn = document.getElementById('exportTradeBtn');
    if (!area || !btn) return;
    const label = btn.lastChild;
    const origText = label.textContent;
    label.textContent = ' Capturing…';
    try {
        const canvas = await html2canvas(area, {
            backgroundColor: '#1c2541',
            scale: 2,
            onclone: (clonedDoc) => {
                const clone = clonedDoc.getElementById('tradeExportArea');
                if (!clone) return;
                clone.querySelectorAll('.mls-trade-export-head').forEach(el => el.removeAttribute('hidden'));
                clone.querySelectorAll('details').forEach(el => el.setAttribute('open', ''));
                // html2canvas draws a <summary> as a numbered list item ("1. Their team"): a plain heading instead.
                clone.querySelectorAll('summary').forEach(el => {
                    const title = clonedDoc.createElement('div');
                    title.className = 'mls-trade-impact-partner-title';
                    title.textContent = el.textContent;
                    el.replaceWith(title);
                });
                clone.querySelectorAll('.tooltip-text, .tooltip-icon').forEach(el => el.remove());
                clone.querySelectorAll('.mls-dotted-underline').forEach(el => el.classList.remove('mls-dotted-underline'));
                clone.querySelectorAll('.mls-trade-impact-help').forEach(el => el.closest('li').remove());
                clone.querySelectorAll('.mls-trade-impact-notes').forEach(ul => { if (!ul.children.length) ul.remove(); });
                clone.style.width = '480px';
                clone.style.maxWidth = 'none';
                clone.style.margin = '0';
                clone.style.padding = '1rem';
                clone.style.borderRadius = '8px';
                clone.style.background = '#1c2541';
                clone.style.boxSizing = 'border-box';
            }
        });
        const link = document.createElement('a');
        link.download = 'My_Trade_Lineup_Strategist.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        console.error('Export failed:', err);
        showToast('Export failed. Please try again.', { isError: true });
    } finally {
        label.textContent = origText;
    }
};
