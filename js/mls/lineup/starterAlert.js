// The starter alert (improvements N2): while /lineup/ is open (a background tab is fine), a check before each kickoff
// window: a starter in your Sleeper lineup who is Doubtful, Out, on IR (SIM_EXCLUDE_STATUSES; Questionable doesn't
// count), on bye or without a game, or an empty slot, and optionally the leagues whose Weekly rankings are over 6 days
// old. Off until you turn it on in Advanced Settings. The rules and words are starterAlertRules.js; the notification,
// fallbacks and timer are js/shared/ui/notify.js.
//
// The check, at leadMinutes before a window's first kickoff: Sync All, quietly (the player file re-downloaded for
// today's injury news, each league's roster for your Sleeper lineup; owner's choice), then getLineupIssues on each
// league's Sleeper lineup. A starter you locked in the app is left out (your call, as on the Lineup tab). Each problem
// is named once a week (KEYS.mls.starterAlertsSent), so a reload doesn't repeat it.
import { KEYS } from '../../shared/storage/keys.js';
import { getFreshness } from '../../shared/freshness.js';
import { getByeWeek } from '../../shared/data/byes.js';
import { notify, notifyAt, notifyNow, notifyPermission, requestNotifyPermission } from '../../shared/ui/notify.js';
import { refreshGameTimes, State } from '../state.js';
import { isBestBallLeague } from '../helpers.js';
import { getLineupIssues, hasKickedOff } from './gameInfo.js';
import { goToLineupNeeds, syncAllLeagues } from '../render/dashboard.js';
import { STALE_WEEKLY_DAYS, alertMessage, dueWindow, kickoffWindows, leagueFindings, nextCheck, noGameStarters,
    normalizeSettings, sleeperLineup, staleLeagues } from './starterAlertRules.js';

// --- SETTINGS ---
export function starterAlertSettings() {
    try { return normalizeSettings(JSON.parse(localStorage.getItem(KEYS.mls.starterAlerts) || 'null')); }
    catch (e) { return normalizeSettings(null); }
}

// What this visit uses (also when storage is blocked); initStarterAlerts drops it, after a restore or a reset.
let sessionSettings = null;
const settingsNow = () => sessionSettings || starterAlertSettings();
function saveSettings(s) {
    sessionSettings = normalizeSettings(s);
    try { localStorage.setItem(KEYS.mls.starterAlerts, JSON.stringify(sessionSettings)); }
    catch (e) { /* storage blocked: it works for this visit */ }
}

// --- ALREADY NAMED THIS WEEK ---
const weekKey = () => `${State.currentNflSeason}-${State.currentNflWeek}`;
function loadSent() {
    try {
        const raw = JSON.parse(localStorage.getItem(KEYS.mls.starterAlertsSent) || 'null');
        if (raw && raw.week === weekKey() && Array.isArray(raw.sent)) return new Set(raw.sent);
    } catch (e) { /* unreadable: start the week over */ }
    return new Set();
}
function saveSent(sent) {
    try { localStorage.setItem(KEYS.mls.starterAlertsSent, JSON.stringify({ week: weekKey(), sent: [...sent] })); }
    catch (e) { /* storage blocked: this visit only */ }
}

// --- THE CHECK ---
const onBye = (p) => !!(p && p.team) && State.currentNflWeek != null && getByeWeek(p.team, State.currentNflSeason) === State.currentNflWeek;
// "Sun 1:00 PM", with no break inside the time (a phone wrapped "PM" onto its own line).
const kickoffLabel = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    .replace(/(\d) (?=[AaPp]\.?[Mm])/g, '$1\u00a0');

function weeklyUpdatedAt(l) {
    const set = l.weeklyRankingSetId ? (State.rankingSets.weekly || []).find(s => s.id === l.weeklyRankingSetId) : null;
    return set ? set.updatedAt : (l.weeklyRankingsUpdatedAt || null);
}

let checking = false;
// The card's button: the Dashboard's "lineups need you" box (the League Command Center), which lists the same problems
// with their fixes.
const DASHBOARD_ACTION = { label: 'Show on the Dashboard', run: () => goToLineupNeeds() };

// Runs the check if a window is due now (its check time has come, its kickoff hasn't). refresh: Sync All first (tests
// turn it off to check the last sync). Resolves to { title, body, how } when it alerted, else null.
export async function runStarterAlertCheck({ refresh = true } = {}) {
    const settings = settingsNow();
    if (!settings.on || checking) return null;
    checking = true;
    try {
        const leadMs = settings.leadMinutes * 60 * 1000;
        if (!dueWindow(kickoffWindows(State.gameTimesByTeam), notifyNow(), leadMs)) return null;
        if (refresh) {
            try { await syncAllLeagues(null, { quiet: true }); }
            catch (e) { console.warn('Starter alert: the refresh failed; checking the last sync.', e); }
        }
        const gameTimesByTeam = State.gameTimesByTeam;
        const due = dueWindow(kickoffWindows(gameTimesByTeam), notifyNow(), leadMs);
        if (!due) return null;

        const sent = loadSent();
        const perLeague = [];
        (State.leagues || []).forEach(league => {
            if (isBestBallLeague(league)) return;
            const lineup = sleeperLineup(league);
            if (!lineup) return;
            const issues = getLineupIssues(lineup.starters, league, lineup.bench);
            const noGame = noGameStarters(lineup.starters, { gameTimesByTeam, onBye, kickedOff: hasKickedOff });
            perLeague.push({ name: league.name || 'Unnamed league', findings: leagueFindings(league, issues, { window: due, noGame, sent }) });
        });
        const stale = settings.staleRankings
            ? staleLeagues((State.leagues || []).filter(l => !isBestBallLeague(l)).map(league => ({ league, updatedAt: weeklyUpdatedAt(league) })),
                at => { const f = getFreshness(at, STALE_WEEKLY_DAYS); return !!(f && f.isStale); }, sent)
            : [];
        const message = alertMessage(perLeague, stale, kickoffLabel(due.startMs));
        if (!message) return null;

        perLeague.forEach(l => l.findings.forEach(f => f.key.split('|').forEach(k => sent.add(k))));
        stale.forEach(s => sent.add(`${s.leagueId}:stale`));
        saveSent(sent);
        const how = await notify({ title: message.title, lines: message.lines, groups: message.groups, tag: 'mls-starter-alert', url: '/lineup/',
            label: 'Starter alert', action: DASHBOARD_ACTION });
        return { title: message.title, body: message.body, how };
    } finally {
        checking = false;
    }
}

// --- THE TIMER ---
let cancelTimer = null;

// The next check: at leadMinutes before the next window's kickoff, or now if a window is already due. With no schedule
// yet (the NFL week or ESPN's scoreboard not loaded), it asks for it and tries again later; with no window left
// this week, every 6 hours (a later scoreboard can add one). Returns the planned time in ms, or null when off.
// What the Settings line says about the next check (N2 round 6): { kind: 'next' | 'due' | 'waiting' | 'none', atMs,
// kickoffMs }, or null while off.
let planned = null;

export function planStarterAlerts() {
    const atMs = planNextCheck();
    renderNextCheck();
    return atMs;
}

function planNextCheck() {
    if (cancelTimer) { cancelTimer(); cancelTimer = null; }
    planned = null;
    const settings = settingsNow();
    if (!settings.on) return null;
    const leadMs = settings.leadMinutes * 60 * 1000;
    const windows = kickoffWindows(State.gameTimesByTeam);
    const now = notifyNow();
    let atMs;
    if (windows.length === 0) {
        // The page is still loading the week (a minute), or ESPN had no schedule for it (half an hour: not a poll).
        refreshGameTimes();
        atMs = now + (State.currentNflWeek == null ? 60 * 1000 : 30 * 60 * 1000);
        planned = { kind: 'waiting' };
        cancelTimer = notifyAt(atMs, planStarterAlerts);
        return atMs;
    }
    // The window to check: one already due (the page opened inside its lead time), else the next one.
    const due = dueWindow(windows, now, leadMs);
    const next = due ? null : nextCheck(windows, now, leadMs);
    if (!due && !next) {
        atMs = now + 6 * 60 * 60 * 1000;
        planned = { kind: 'none' };
        cancelTimer = notifyAt(atMs, planStarterAlerts);
        return atMs;
    }
    const kickoffMs = due ? due.startMs : next.window.startMs;
    atMs = due ? now : next.atMs;
    planned = { kind: due ? 'due' : 'next', atMs, kickoffMs };
    const fire = () => {
        cancelTimer = notifyAt(kickoffMs + 1000, planStarterAlerts); // then the window after it, once this one kicks off
        runStarterAlertCheck().catch(e => console.warn('Starter alert check failed.', e)).finally(() => {
            // The line under the switch moves on to the window after this one (its timer is set at this kickoff).
            const after = nextCheck(kickoffWindows(State.gameTimesByTeam), kickoffMs, leadMs);
            planned = after ? { kind: 'next', atMs: after.atMs, kickoffMs: after.window.startMs } : { kind: 'none' };
            renderNextCheck();
        });
    };
    if (due) fire();
    else cancelTimer = notifyAt(atMs, fire);
    return atMs;
}

// --- SETTINGS UI (Advanced Settings) ---
const timeLabel = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(/(\d) (?=[AaPp]\.?[Mm])/g, '$1\u00a0');

// "Next check: Sun 12:00 PM, before the 1:00 PM games." under the switch, so you can see it's set up and what the
// minutes you chose mean (N2 round 6).
function renderNextCheck() {
    const el = document.getElementById('starterAlertsNext');
    if (!el) return;
    const p = planned;
    let text = '';
    if (p && p.kind === 'next') text = `Next check: ${kickoffLabel(p.atMs)}, before the ${timeLabel(p.kickoffMs)} games.`;
    else if (p && p.kind === 'due') text = `Checking now, before the ${timeLabel(p.kickoffMs)} games.`;
    else if (p && p.kind === 'waiting') text = "Waiting for this week's schedule.";
    else if (p && p.kind === 'none') text = "No games left this week: reload this page after the last one to watch next week's.";
    el.textContent = text;
    el.hidden = !text;
}

const STATUS_TEXT = {
    unsupported: "This browser can't show notifications. Alerts show on this page, and your browser tab's name flashes while you're elsewhere.",
    denied: "Notifications are blocked for this site (allow them in your browser's site settings). Until then alerts show on this page, and your browser tab's name flashes while you're elsewhere.",
    default: "Notifications aren't allowed yet: turn this off and on to be asked again. Until then alerts show on this page.",
    granted: '',
};

export function renderStarterAlertSettings() {
    const s = settingsNow();
    const toggle = document.getElementById('starterAlertsToggle');
    if (!toggle) return;
    toggle.checked = s.on;
    // The Notifications fold's title row: whether the alerts are on, seen while it's folded.
    const state = document.getElementById('notifySettingsState');
    if (state) { state.textContent = s.on ? 'On' : 'Off'; state.classList.toggle('is-on', s.on); }
    const opts = document.getElementById('starterAlertsOptions');
    if (opts) opts.hidden = !s.on;
    const lead = document.getElementById('starterAlertLead');
    if (lead) lead.value = String(s.leadMinutes);
    const stale = document.getElementById('starterAlertsStale');
    if (stale) stale.checked = s.staleRankings;
    const status = document.getElementById('starterAlertsStatus');
    if (status) {
        const text = s.on ? STATUS_TEXT[notifyPermission()] || '' : '';
        status.textContent = text;
        status.hidden = !text;
    }
    renderNextCheck();
}

// The toggle. Turning it on asks for permission (this is the tap Safari and Chrome want); the alert works either way,
// with the in-page fallbacks when it's refused.
export async function toggleStarterAlerts(checked) {
    saveSettings({ ...settingsNow(), on: !!checked });
    if (checked) await requestNotifyPermission();
    renderStarterAlertSettings();
    planStarterAlerts();
}

export function setStarterAlertLead(value) {
    saveSettings({ ...settingsNow(), leadMinutes: Number(value) });
    renderStarterAlertSettings();
    planStarterAlerts();
}

export function toggleStaleRankingsAlert(checked) {
    saveSettings({ ...settingsNow(), staleRankings: !!checked });
    renderStarterAlertSettings();
}

// "Send a test alert": a sample alert in 5 seconds, by the same path as a real one (notification, the card, the flashing
// tab name), so you can switch tabs and see it as on game day. Returns the timer's promise (the tests await it).
export const TEST_ALERT_DELAY_MS = 5000;
let testTimer = null;
export function sendTestStarterAlert() {
    const status = document.getElementById('starterAlertTestStatus');
    if (status) status.textContent = 'A test alert arrives in 5 seconds. Switch to another tab to see it as you would on game day.';
    clearTimeout(testTimer);
    return new Promise(resolve => {
        testTimer = setTimeout(async () => {
            const how = await notify({
                title: 'Test alert: 2 lineup problems before Sun 1:00\u00a0PM',
                lines: ["Example League · Ja'Marr Chase is Out: start Puka Nacua instead?", 'Example League · RB slot is empty',
                    'This is a test. Real alerts name your own leagues and players.'],
                groups: [{ heading: 'Example League', lines: ["Ja'Marr Chase is Out: start Puka Nacua instead?", 'RB slot is empty'] },
                    { heading: null, lines: ['This is a test. Real alerts name your own leagues and players.'] }],
                tag: 'mls-starter-alert-test', url: '/lineup/', label: 'Starter alert', action: DASHBOARD_ACTION,
            });
            if (status) status.textContent = '';
            resolve(how);
        }, TEST_ALERT_DELAY_MS);
    });
}

// On load (js/mls/init.js), after a backup is restored, and after a Factory Reset.
export function initStarterAlerts() {
    sessionSettings = null;
    renderStarterAlertSettings();
    planStarterAlerts();
}
