// A Lineup row's details on a phone (improvements S32, the owner's choices): a tap on a player's name (or his "+N")
// opens the shared sheet (js/shared/ui/sheet.js, M11) listing every badge on his row with what it means, and a
// labelled lock button. The phone row shows only what you need at a glance (css/mls.css, PHONE ROWS); this is where
// the rest is.
//
// Nothing is worded or drawn twice: the badges are copies of the ones on the row (made by the row's own helpers,
// js/mls/badges.js and js/mls/lineup/gameInfo.js), and each one's sentence is the badge legend's (MEANING in
// js/mls/legend.js), or, for a badge that explains itself on a tap (the IR slot, a rank change, the opponent's
// strength), the same text that tap shows.
import { escapeHtml } from '../../shared/html.js';
import { getByeWeek } from '../../shared/data/byes.js';
import { openSheet, closeSheet } from '../../shared/ui/sheet.js';
import { State } from '../state.js';
import { MEANING } from '../legend.js';
import { overrideAutoLock, toggleLock } from './lineup.js';

const LOCK_ICON = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
const UNLOCK_ICON = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>';

// Which legend sentence goes with a badge on the row, by its class (in the row's order).
const KINDS = [
    ['mls-lock-badge', 'lock'], ['mls-autolock-badge', 'lock'], ['ir-slot-badge', 'irSlot'], ['inj-badge', 'injury'],
    ['taxi-badge', 'taxi'], ['bye-badge', 'bye'], ['early-badge', 'early'], ['kickoff-badge', 'kickoff'],
    ['opp-rank-badge', 'opponent'], ['mls-sleeper-lineup-badge', 'sleeperLineup'], ['mls-move-chip', 'moveChip'],
    ['mls-rank-badge', 'rankBadge'],
];
const kindOf = (el) => (KINDS.find(([cls]) => el.classList.contains(cls)) || [])[1];

// A copy of a row's badge for the sheet: the same classes, styles and text, but not a control (a button becomes a span),
// so the sheet's list is read as text and a tap on it does nothing.
function inertCopy(el) {
    const copy = el.tagName === 'BUTTON' ? document.createElement('span') : el.cloneNode(false);
    if (el.tagName === 'BUTTON') {
        copy.className = el.className;
        const style = el.getAttribute('style');
        if (style) copy.setAttribute('style', style);
    }
    copy.innerHTML = el.innerHTML;
    for (const node of [copy, ...copy.querySelectorAll('*')]) {
        ['data-action', 'data-tip', 'data-id', 'title', 'aria-label', 'tabindex'].forEach(a => node.removeAttribute(a));
    }
    copy.classList.remove('is-stacked');
    copy.querySelectorAll('.is-stacked').forEach(n => n.classList.remove('is-stacked'));
    return copy.outerHTML;
}

// [sample HTML, sentence] for each badge on the row, in the order the row shows them: the badge line, then the rank
// change and the rank badge from the line under it. The kickoff keeps the plain opponent beside it ("@ CLE"); a
// coloured opponent badge (S31) gets a line of its own.
function badgeLines(row) {
    const lines = [];
    const add = (el) => {
        const kind = kindOf(el);
        if (!kind) return;
        const tip = el.dataset && el.dataset.tip;
        lines.push([inertCopy(el), tip ? escapeHtml(tip) : MEANING[kind]]);
    };
    const badgeLine = row.querySelector('.mls-player-badges-row');
    if (badgeLine) {
        for (const el of badgeLine.children) {
            if (!el.classList.contains('mls-game-info')) { add(el); continue; }
            const kickoff = el.querySelector('.kickoff-badge');
            const plainOpp = el.querySelector('.mls-opp:not(.opp-rank-badge)');
            if (kickoff) lines.push([inertCopy(kickoff) + (plainOpp ? ' ' + inertCopy(plainOpp) : ''), MEANING.kickoff]);
            const oppBadge = el.querySelector('.opp-rank-badge');
            if (oppBadge) add(oppBadge);
        }
    }
    const meta = row.querySelector('.mls-player-row-meta');
    if (meta) meta.querySelectorAll('.mls-move-chip, .mls-rank-badge').forEach(add);
    return lines;
}

function findPlayer(id) {
    const leagueId = State.activeLeagueId;
    const starters = (State.manualStartersMap[leagueId] || []).map(s => s.player).filter(Boolean);
    const bench = State.manualBenchMap[leagueId] || [];
    return [...starters, ...bench].find(p => String(p.id) === String(id)) || null;
}

// The lock button in the sheet, for a starter: the same action as his photo's padlock (data-action of .mls-lead-lock).
function lockButtonHTML(row) {
    const lead = row.querySelector('.mls-lead-lock');
    if (!lead) return '';
    const auto = lead.dataset.action === 'overrideAutoLock';
    const on = lead.getAttribute('aria-pressed') === 'true';
    const label = auto ? 'Override the lock' : on ? 'Unlock' : 'Lock in this spot';
    const note = auto ? 'His game has started, so the optimizer leaves him where he is. Override only if that\'s wrong.'
        : on ? 'Locked: the optimizer keeps him in this spot this NFL week.'
        : 'Keeps him in this spot when you optimize, for this NFL week.';
    return `<div class="mls-details-actions">
    <button type="button" class="mls-btn-sm btn-secondary mls-details-lock" data-lock-action="${auto ? 'override' : 'toggle'}">${auto || on ? UNLOCK_ICON : LOCK_ICON}<span>${label}</span></button>
    <p class="mls-details-note">${note}</p>
</div>`;
}

// data-action="openLineupDetails" (js/mls/main.js). opener: the row's "+N" button. Resolves when the sheet has closed.
export function openLineupDetails(opener) {
    const row = opener && opener.closest('.lineup-slot');
    const p = row && findPlayer(opener.dataset.id);
    if (!row || !p) return Promise.resolve();

    const head = [row.querySelector('.mls-player-row-meta .mls-plain-pos'), row.querySelector('.mls-player-row-meta .badge:not(.mls-plain-pos):not(.mls-rank-badge):not(.mls-move-chip)')]
        .filter(Boolean).map(inertCopy).join(' ');
    const bye = getByeWeek(p.team, State.currentNflSeason);
    // The slot, unless it only repeats his position (an RB in an RB slot).
    const slotEl = row.querySelector('.slot-badge');
    const slot = slotEl && slotEl.textContent.trim() !== String(p.pos) ? slotEl : null;
    const lines = badgeLines(row);
    const body = `<div class="mls-details">
    <div class="mls-details-head">${slot ? inertCopy(slot) : ''} ${head}${bye ? ` <span class="mls-details-bye">Bye week ${bye}</span>` : ''}</div>
    ${lines.length
        ? `<dl class="badge-legend-list mls-details-list">${lines.map(([sample, text]) => `
        <div class="badge-legend-row"><dt class="badge-legend-sample">${sample}</dt><dd class="badge-legend-text">${text}</dd></div>`).join('')}
    </dl>`
        : '<p class="mls-details-empty">No badges on his row this week.</p>'}
    ${lockButtonHTML(row)}
</div>`;

    const id = String(p.id);
    const closed = openSheet({ title: p.name, body, opener, className: 'mls-details-sheet' });
    const lockBtn = document.querySelector('.mls-details-sheet .mls-details-lock');
    if (lockBtn) {
        lockBtn.addEventListener('click', async () => {
            const override = lockBtn.dataset.lockAction === 'override';
            await closeSheet({ restoreFocus: false });
            if (override) await overrideAutoLock(id); else await toggleLock(id);
            // The row was drawn again: focus goes back to its details button.
            const again = [...document.querySelectorAll('#lineupTab [data-action="openLineupDetails"]')].find(b => b.dataset.id === id);
            if (again) again.focus({ preventScroll: true });
        });
    }
    return closed;
}
