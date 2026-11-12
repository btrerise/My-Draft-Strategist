// The starter alert's rules (improvements N2): kickoff windows, the lineup it watches, who to name, and the words.
// Pure: no State, no DOM, no storage, so tests/unit/starterAlertRules.test.mjs runs it in Node. The State-backed half
// (settings, timers, the refresh, the notification) is starterAlert.js.
//
// Owner's choices (N2, 2026-11-12): it watches the starters you set in Sleeper (what scores); the check runs a chosen
// number of minutes before each kickoff window (15 to 120 in steps of 15, 60 by default); Questionable doesn't count
// (only SIM_EXCLUDE_STATUSES: Doubtful, Out, IR...); each problem is named at most once a week.
import { lineupIssueItems, joinAnd } from './issues.js';

export const LEAD_CHOICES = [15, 30, 45, 60, 75, 90, 105, 120];
export const DEFAULT_SETTINGS = { on: false, leadMinutes: 60, staleRankings: true };
// Kickoffs this close to a window's first one share its check (Sunday's 4:05 and 4:25 games: one alert, one refresh).
export const WINDOW_MERGE_MS = 30 * 60 * 1000;
// The league cards' rule for old Weekly rankings (js/mls/render/leagueCards.js, leagueStatus).
export const STALE_WEEKLY_DAYS = 6;

export function normalizeSettings(raw) {
    const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
    s.on = s.on === true;
    s.staleRankings = s.staleRankings !== false;
    s.leadMinutes = LEAD_CHOICES.includes(Number(s.leadMinutes)) ? Number(s.leadMinutes) : DEFAULT_SETTINGS.leadMinutes;
    return s;
}

// This week's kickoff windows from State.gameTimesByTeam ({ TEAM: iso }): [{ startMs, teams: Set }], earliest first.
// A kickoff within WINDOW_MERGE_MS of a window's first kickoff joins that window.
export function kickoffWindows(gameTimesByTeam) {
    const kicks = Object.entries(gameTimesByTeam || {})
        .map(([team, iso]) => ({ team, ms: new Date(iso).getTime() }))
        .filter(k => Number.isFinite(k.ms))
        .sort((a, b) => a.ms - b.ms);
    const windows = [];
    kicks.forEach(k => {
        const last = windows[windows.length - 1];
        if (last && k.ms - last.startMs <= WINDOW_MERGE_MS) last.teams.add(k.team);
        else windows.push({ startMs: k.ms, teams: new Set([k.team]) });
    });
    return windows;
}

// The window to check now (its check time has come and it hasn't kicked off), or null.
export function dueWindow(windows, nowMs, leadMs) {
    return windows.find(w => w.startMs - leadMs <= nowMs && nowMs < w.startMs) || null;
}

// When to check next: the first window still to come whose check time is after now. { window, atMs } or null.
export function nextCheck(windows, nowMs, leadMs) {
    const w = windows.find(x => x.startMs - leadMs > nowMs);
    return w ? { window: w, atMs: w.startMs - leadMs } : null;
}

// Sleeper's slot names in roster_positions, as this app's slot types (js/mls/constants.js SLOT_POSITIONS).
const SLEEPER_SLOTS = { SUPER_FLEX: 'SFLEX', REC_FLEX: 'WRTE', WRRB_FLEX: 'WRRB', DST: 'DEF' };
export const appSlotType = (slot) => SLEEPER_SLOTS[slot] || slot;

// The lineup set in Sleeper as of the last sync: [{ slot, player }] (player null for an empty slot), and the bench (the
// rest of the roster). league.sleeperStarters follows league.starterSlots in order (sync.js). Null when the league has
// no Sleeper lineup to read (manual leagues, a league synced before starterSlots were saved).
export function sleeperLineup(league) {
    const ids = league && Array.isArray(league.sleeperStarters) ? league.sleeperStarters : null;
    const slots = league && Array.isArray(league.starterSlots) ? league.starterSlots : null;
    if (!ids || !slots || slots.length === 0) return null;
    const roster = league.roster || [];
    const byId = new Map(roster.map(p => [String(p.id), p]));
    const starters = slots.map((slot, i) => {
        const id = ids[i];
        const player = id && id !== '0' ? byId.get(String(id)) || null : null;
        return { slot: appSlotType(slot), player, unknownId: id && id !== '0' && !player ? String(id) : null };
    });
    const starting = new Set(starters.filter(s => s.player).map(s => String(s.player.id)));
    const bench = roster.filter(p => !starting.has(String(p.id)));
    return { starters, bench };
}

// A starter with no game this week who isn't on bye: no team (released), or a team missing from this week's schedule.
// Only judged when the schedule is known (gameTimesByTeam has games).
export function noGameStarters(starters, { gameTimesByTeam, onBye, kickedOff }) {
    if (!gameTimesByTeam || Object.keys(gameTimesByTeam).length === 0) return [];
    return starters.map(s => s.player).filter(p => p && !kickedOff(p) && !onBye(p) && (!p.team || !gameTimesByTeam[p.team]));
}

const nb = (t) => String(t || '').replace(/ /g, ' ');

// What to name for one league in this window. issues: getLineupIssues on the Sleeper lineup; window: the due window;
// noGame: noGameStarters; sent: the keys already named this week. Injured starters are named in their own game's window;
// a bye, no game or an empty slot (no kickoff of their own) at the first check that sees them.
// Returns [{ key, text }].
export function leagueFindings(league, issues, { window, noGame = [], sent = new Set() }) {
    const lid = league.leagueId;
    const fresh = (key) => !sent.has(key);
    const injured = issues.injured.filter(p => window.teams.has(p.team) && fresh(`${lid}:${p.id}`));
    const bye = issues.bye.filter(p => fresh(`${lid}:${p.id}`));
    const emptyCount = new Map();
    const empty = issues.empty.filter(t => {
        const n = (emptyCount.get(t) || 0) + 1;
        emptyCount.set(t, n);
        return fresh(`${lid}:empty:${t}:${n}`);
    });
    // lineupIssueItems words them (the Lineup tab's and Dashboard's box use the same), from the issues left.
    const picked = new Set([...injured, ...bye]);
    const sub = { ...issues, injured, bye, empty, irSlot: [], irStuck: [], moveToIr: [], kept: [], lockEnded: [], unmatched: [],
        swaps: issues.swaps.filter(x => picked.has(x.out)), noSwap: issues.noSwap.filter(x => picked.has(x.player)) };
    const items = lineupIssueItems(sub).filter(i => !i.muted && !i.note);
    const findings = [];
    // Items come injured, then bye, then empty slots (counted per slot type).
    const people = [...injured, ...bye];
    items.forEach((item, i) => {
        if (i < people.length) findings.push({ key: `${lid}:${people[i].id}`, text: item.text });
    });
    const emptyKeys = [];
    emptyCount.clear();
    empty.forEach(t => { const n = (emptyCount.get(t) || 0) + 1; emptyCount.set(t, n); emptyKeys.push(`${lid}:empty:${t}:${n}`); });
    items.slice(people.length).forEach((item, i) => {
        // One item per slot type ("2 FLEX slots are empty"): it carries every key of that type.
        const t = [...new Set(empty)][i];
        findings.push({ key: emptyKeys.filter(k => k.startsWith(`${lid}:empty:${t}:`)).join('|'), text: item.text });
    });
    noGame.filter(p => !picked.has(p) && fresh(`${lid}:${p.id}`)).forEach(p => findings.push({ key: `${lid}:${p.id}`,
        text: `${nb(p.name)} has no game this week` }));
    return findings;
}

// The stale-Weekly-rankings line's leagues: [{ leagueId, name, days }] from [{ league, updatedAt }] where a Weekly set is
// assigned. isStale(updatedAt): getFreshness(updatedAt, 6).isStale (shared/freshness.js), passed in to keep this pure.
export function staleLeagues(entries, isStale, sent = new Set()) {
    return entries.filter(e => e.updatedAt && isStale(e.updatedAt) && !sent.has(`${e.league.leagueId}:stale`))
        .map(e => ({ leagueId: e.league.leagueId, name: e.league.name || 'Unnamed league' }));
}

// The notification. perLeague: [{ name, findings }] with findings; stale: staleLeagues; when: "Sun 1:00 PM".
// Returns null when there's nothing to say, else { title, lines, groups, body, count }:
//   lines   the system notification's lines: "Fixture League · Ja'Marr Chase is Out: start Puka Nacua instead?"
//   groups  the card's list under each league's name ([{ heading, lines }]), the stale line last with no heading
//           (N2 round 6: "League: Player is Out: start…" read as two colons in a row).
export function alertMessage(perLeague, stale, when) {
    const leagues = perLeague.filter(l => l.findings.length > 0);
    const count = leagues.reduce((n, l) => n + l.findings.length, 0);
    const lines = [];
    const groups = [];
    leagues.forEach(l => {
        l.findings.forEach(f => lines.push(`${l.name} · ${f.text}`));
        groups.push({ heading: l.name, lines: l.findings.map(f => f.text) });
    });
    const staleLine = stale.length
        ? `Weekly rankings over ${STALE_WEEKLY_DAYS} days old: ${joinAnd(stale.map(s => s.name))}` : '';
    if (staleLine) { lines.push(staleLine); groups.push({ heading: null, lines: [staleLine] }); }
    if (lines.length === 0) return null;
    const title = count > 0
        ? `${count} lineup ${count === 1 ? 'problem' : 'problems'} before ${when}`
        : `Old Weekly rankings before ${when}`;
    return { title, lines, groups, body: lines.join('\n'), count: count || 1 };
}
