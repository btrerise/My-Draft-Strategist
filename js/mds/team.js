// Moved from js/mds/legacy.js (the second half of the old js/mds.js) in refactor chunk 2B:
// the Team tab roster (renderFantasyRoster), which sat at the end of RENDER DRAFT MATRIX.
import { escapeHtml } from '../shared/html.js';
import { State, getActiveDraft } from './state.js';
import { headshotHTML } from './headshots.js';
import { KEYS } from '../shared/storage/keys.js';

    // `playerById` is optional: renderBoard, the main caller, already has one built for its own
    // loop and passes it in. Without it this scanned the whole player pool once per rostered
    // player, on every render.
    export function renderFantasyRoster(playerById) {
        if (State.players.length === 0) {
            return `<div class="empty-state-card"><p>Load rankings on the Setup tab to start building your roster.</p><button class="btn btn-primary empty-state-cta" data-action="showTab" data-tab="setup">Go to Setup</button></div>`;
        }

        let draft = getActiveDraft();
        if (!draft) return `<div style="text-align:center; color:var(--text-muted);">Select or add a draft first.</div>`;

        let byId = playerById;
        if (!byId) {
            byId = new Map();
            State.players.forEach(p => { if (!byId.has(p.id)) byId.set(p.id, p); });
        }
        let myPlayersObjects = draft.myTeam.map(id => byId.get(id)).filter(Boolean);
        let availablePool = [...myPlayersObjects];
        let rosterSlotsHTML = '';
        let limits = draft.limits || { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SFLEX: 0, BENCH: 6 };

                // textClass: a gradient-text class for flex-type slots (.flex-blend-text etc., css/mds.css),
                // used instead of the single color. The text sits in its own span so the gradient spans the
                // letters, not the label's fixed 45px box (improvements F5 follow-up).
                const buildSlotHTML = (label, color, p, textClass = '') => {
            if (p) {
                let rookieBadge = p.isRookie ? `<span class="badge badge-rookie">R</span>` : "";
                
                // 1. The headshot: initials, with the photo on top when there's a Sleeper id (headshots.js)
                let imgHTML = headshotHTML({ id: p.sleeperId || p.id, name: p.name, pos: p.posGroup, team: p.team }, 'roster-avatar');

                return `
                <div class="roster-slot">
                    <div class="roster-slot-label-row">
                        ${textClass ? `<span class="roster-label ${textClass}"><span class="roster-label-text">${label}</span></span>` : `<span class="roster-label" style="color:${color}">${label}</span>`}
                        ${imgHTML} <!-- Inject Image Here -->
                        <div>
                            <div style="font-weight: bold;">${escapeHtml(p.name)} ${rookieBadge}</div>
                            <div style="margin-top: 2px;">
                                <span class="badge pos-badge ${escapeHtml(p.posGroup)}">${escapeHtml(p.posDisplay)}</span>
                                <span class="badge">${escapeHtml(p.team)}</span>
                            </div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Bye: ${escapeHtml(p.bye)}</div>
                        <button class="mds-btn-sm btn-draft" style="padding: 2px 6px;" data-action="undoDraft" data-id="${p.id}">Undo</button>
                    </div>
                </div>`;
            } else {
                return `
                <div class="roster-slot empty">
                    <div class="roster-slot-label-row">
                        <span class="roster-label" style="color:var(--text-muted)">${label}</span>
                        <div class="roster-avatar placeholder"></div>
                        <div style="color:var(--text-muted); font-style:italic;">[ Empty Slot ]</div>
                    </div>
                    <div></div>
                </div>`;
            }
        };

        ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(pos => {
            let count = limits[pos] || 0;
            let color = `var(--pos-${pos.toLowerCase()}-border)`;
            for (let i = 0; i < count; i++) {
                let idx = availablePool.findIndex(p => p.posGroup === pos);
                let p = idx !== -1 ? availablePool.splice(idx, 1)[0] : null;
                rosterSlotsHTML += buildSlotHTML(`${pos}${i+1}`, color, p);
            }
        });

        // W/R (Wide Receiver / Running Back) flex slots, then W/T, then FLEX: most restrictive first.
        for (let i = 0; i < (limits.WRRB || 0); i++) {
            let idx = availablePool.findIndex(p => ['WR', 'RB'].includes(p.posGroup));
            let p = idx !== -1 ? availablePool.splice(idx, 1)[0] : null;
            rosterSlotsHTML += buildSlotHTML('W/R', null, p, 'wr-blend-text');
        }

        // NEW: Fill W/T (Wide Receiver / Tight End) Flex Slots
        for (let i = 0; i < (limits.WT || 0); i++) {
            let idx = availablePool.findIndex(p => ['WR', 'TE'].includes(p.posGroup));
            let p = idx !== -1 ? availablePool.splice(idx, 1)[0] : null;
            rosterSlotsHTML += buildSlotHTML('W/T', null, p, 'wt-blend-text');
        }

        // Fill Standard W/R/T Flex Slots
        for (let i = 0; i < (limits.FLEX || 0); i++) {
            let idx = availablePool.findIndex(p => ['RB', 'WR', 'TE'].includes(p.posGroup));
            let p = idx !== -1 ? availablePool.splice(idx, 1)[0] : null;
            rosterSlotsHTML += buildSlotHTML('FLX', null, p, 'flex-blend-text');
        }

        for (let i = 0; i < (limits.SFLEX || 0); i++) {
            let idx = availablePool.findIndex(p => ['QB', 'RB', 'WR', 'TE'].includes(p.posGroup));
            let p = idx !== -1 ? availablePool.splice(idx, 1)[0] : null;
            rosterSlotsHTML += buildSlotHTML('SFLX', null, p, 'sflex-blend-text');
        }

        if (availablePool.length > 0) {
            rosterSlotsHTML += `<div style="font-weight:bold; margin: 0.8rem 0 0.4rem 0; font-size: 0.85rem; color:var(--text-muted);">BENCH</div>`;
            availablePool.forEach(p => { rosterSlotsHTML += buildSlotHTML('BN', 'var(--text-muted)', p); });
        }

        const bannerContainer = document.getElementById('byeWarningContainer');
        const showByeWarnings = localStorage.getItem(KEYS.mds.byeWarnings) === 'true';
        
        if (bannerContainer && showByeWarnings && myPlayersObjects.length > 0) {
            let byeCounts = {};
            let starterSlotsCount = (limits.QB||0) + (limits.RB||0) + (limits.WR||0) + (limits.TE||0) + (limits.FLEX||0) + (limits.SFLEX||0);
            let activeStarters = myPlayersObjects.slice(0, starterSlotsCount);

            activeStarters.forEach(sp => {
                if (sp.bye && sp.bye !== "-") byeCounts[sp.bye] = (byeCounts[sp.bye] || 0) + 1;
            });

            let heavyByes = Object.keys(byeCounts).filter(bye => byeCounts[bye] >= 3);
            if (heavyByes.length > 0) {
                bannerContainer.innerHTML = `<div class="bye-warning-banner"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><span>WARNING: You have ${byeCounts[heavyByes[0]]} starting players on Bye in Week ${heavyByes[0]}!</span></div>`;
            } else {
                bannerContainer.innerHTML = '';
            }
        } else if (bannerContainer) {
            bannerContainer.innerHTML = '';
        }

        return rosterSlotsHTML;
    }
