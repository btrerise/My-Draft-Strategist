// js/mls/scout/waiverStatus.js (improvements S34): free agent or waivers, when he clears, and whether that's too late
// for this week. Times are 2026's week 10: Thu Nov 12 to Mon Nov 16 (Pacific standard time, UTC-8).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dayCode, isWeekOver, modeAt, nextRunAt, nextWeeklyRun, shortWhen, waiverSettingsFrom, waiverStatus, waiverStatusText } from '../../js/mls/scout/waiverStatus.js';

const PT = (s) => Date.parse(`${s}-08:00`); // a Pacific (standard time) wall clock
const H = 3600 * 1000;

// A FAAB league with weekly waivers and 2-day clears (like League of Ordinary Gentlemen): free agents every day except
// recent drops and players whose game has started.
const faab2 = waiverSettingsFrom({ waiver_type: 2, waiver_budget: 100, waiver_clear_days: 2, waiver_day_of_week: 2, daily_waivers: 0, daily_waivers_hour: 0, daily_waivers_days: 5461 });
// Rolling waivers, weekly only, 1-day clears.
const rolling1 = waiverSettingsFrom({ waiver_type: 0, waiver_budget: 100, waiver_clear_days: 1, waiver_day_of_week: 2, daily_waivers: 0, daily_waivers_hour: 0 });
// Daily waivers at 9 AM (REDRAFT Late Round Board of Directors).
const nineAm = waiverSettingsFrom({ waiver_type: 2, waiver_budget: 100, waiver_clear_days: 2, waiver_day_of_week: 2, daily_waivers: 1, daily_waivers_hour: 9, daily_waivers_days: 1360 });

const kickoffs = {
    LV: '2026-11-13T01:15:00Z',  // Thu 5:15 PM PT
    DAL: '2026-11-15T18:00:00Z', // Sun 10 AM PT
    SF: '2026-11-15T21:25:00Z',  // Sun 1:25 PM PT
    NYG: '2026-11-17T01:15:00Z'  // Mon 5:15 PM PT
};
const dowdle = { cleanName: 'ricodowdle', team: 'DAL' };

describe('waiverSettingsFrom', () => {
    test('maps waiver_type to the claim type', () => {
        assert.equal(faab2.type, 'faab');
        assert.equal(rolling1.type, 'rolling');
        assert.equal(waiverSettingsFrom({ waiver_type: 1 }).type, 'reverse');
        assert.deepEqual(faab2, { type: 'faab', budget: 100, minBid: 0, clearDays: 2, dayOfWeek: 2, daily: false, hour: 0, days: 5461 });
    });
    test('null without waiver settings', () => {
        assert.equal(waiverSettingsFrom(null), null);
        assert.equal(waiverSettingsFrom({ type: 0 }), null);
    });
});

describe('nextWeeklyRun', () => {
    test('Wednesday at the run hour, Pacific', () => {
        assert.equal(nextWeeklyRun(faab2, PT('2026-11-15T14:00:00')), PT('2026-11-18T00:00:00'));
        assert.equal(nextWeeklyRun(nineAm, PT('2026-11-15T14:00:00')), PT('2026-11-18T09:00:00'));
    });
    test('on Wednesday before 9 AM it is that morning; after, next week', () => {
        assert.equal(nextWeeklyRun(nineAm, PT('2026-11-18T08:00:00')), PT('2026-11-18T09:00:00'));
        assert.equal(nextWeeklyRun(nineAm, PT('2026-11-18T09:30:00')), PT('2026-11-25T09:00:00'));
    });
    test('across the end of daylight saving time (Nov 1, 2026)', () => {
        assert.equal(nextWeeklyRun(faab2, Date.parse('2026-10-30T12:00:00-07:00')), PT('2026-11-04T00:00:00'));
    });
});

describe('isWeekOver', () => {
    test('about four hours after the last kickoff; never without kickoffs', () => {
        assert.equal(isWeekOver(kickoffs, PT('2026-11-16T20:00:00')), false); // Monday night, game on
        assert.equal(isWeekOver(kickoffs, PT('2026-11-16T21:30:00')), true);  // after the Monday game
        assert.equal(isWeekOver(kickoffs, PT('2026-11-17T10:00:00')), true);  // Tuesday
        assert.equal(isWeekOver({}, PT('2026-11-17T10:00:00')), false);
        assert.equal(isWeekOver(null, PT('2026-11-17T10:00:00')), false);
    });
});

describe('waiverStatus', () => {
    test('an unrostered player nobody dropped, before his game: free agent', () => {
        const st = waiverStatus(dowdle, faab2, {}, kickoffs, PT('2026-11-14T12:00:00'));
        assert.equal(st.status, 'free');
        assert.equal(st.tooLateThisWeek, false);
        assert.equal(st.kickoff, Date.parse(kickoffs.DAL));
    });

    test('no transactions (null drops), no settings, or no kickoff times: no answer', () => {
        assert.equal(waiverStatus(dowdle, faab2, null, kickoffs, PT('2026-11-14T12:00:00')), null);
        assert.equal(waiverStatus(dowdle, null, {}, kickoffs, PT('2026-11-14T12:00:00')), null);
        // Round 3: without kickoffs a Sunday-afternoon "add now" could be wrong, so no chip at all.
        assert.equal(waiverStatus(dowdle, faab2, {}, null, PT('2026-11-15T14:00:00')), null);
        assert.equal(waiverStatus(dowdle, faab2, {}, {}, PT('2026-11-15T14:00:00')), null);
    });

    test('dropped yesterday in a 2-day league: waivers, clears 2 days after the drop', () => {
        const drop = PT('2026-11-12T17:08:00'); // Thu
        const st = waiverStatus(dowdle, faab2, { ricodowdle: drop }, kickoffs, PT('2026-11-13T12:00:00'));
        assert.equal(st.status, 'waivers');
        assert.equal(st.reason, 'dropped');
        assert.equal(st.clearsAt, drop + 47 * H);       // Sat 4:08 PM (an hour short of 2 days, round 8), before his Sunday game
        assert.equal(st.tooLateThisWeek, false);
        assert.equal(st.claimType, 'faab');
    });

    test('dropped in a 1-day league two days ago: free agent again', () => {
        const st = waiverStatus(dowdle, rolling1, { ricodowdle: PT('2026-11-11T10:00:00') }, kickoffs, PT('2026-11-13T12:00:00'));
        assert.equal(st.status, 'free');
    });

    test('dropped Saturday in a 2-day league, Sunday game: locked at kickoff, clears Wednesday, too late', () => {
        const st = waiverStatus(dowdle, faab2, { ricodowdle: PT('2026-11-14T08:00:00') }, kickoffs, PT('2026-11-14T12:00:00'));
        assert.equal(st.status, 'waivers');
        assert.equal(st.clearsAt, PT('2026-11-18T00:00:00'));
        assert.equal(st.tooLateThisWeek, true);
    });

    test('his game has started: waivers until the weekly run, too late for this week', () => {
        const st = waiverStatus(dowdle, faab2, {}, kickoffs, PT('2026-11-15T14:00:00'));
        assert.equal(st.status, 'waivers');
        assert.equal(st.reason, 'played');
        assert.equal(st.clearsAt, PT('2026-11-18T00:00:00'));
        assert.equal(st.tooLateThisWeek, true);
    });

    test('the Monday night player on Sunday afternoon is still a free agent', () => {
        const st = waiverStatus({ cleanName: 'x', team: 'NYG' }, faab2, {}, kickoffs, PT('2026-11-15T14:00:00'));
        assert.equal(st.status, 'free');
    });

    test('daily waivers at 9 AM: the lock runs to Wednesday 9 AM, before and after the hour', () => {
        const sun = waiverStatus(dowdle, nineAm, {}, kickoffs, PT('2026-11-15T14:00:00'));
        assert.equal(sun.clearsAt, PT('2026-11-18T09:00:00'));
        const wed8 = waiverStatus(dowdle, nineAm, {}, kickoffs, PT('2026-11-18T08:00:00'));
        assert.equal(wed8.status, 'waivers');
        assert.equal(wed8.clearsAt, PT('2026-11-18T09:00:00'));
    });

    test('Tuesday, every game over: on waivers, but not too late (the run is before next week)', () => {
        const st = waiverStatus(dowdle, faab2, {}, kickoffs, PT('2026-11-17T10:00:00'));
        assert.equal(st.status, 'waivers');
        assert.equal(st.tooLateThisWeek, false);
    });

    test('FAAB and rolling leagues give the same status, with their own claim type', () => {
        const now = PT('2026-11-15T14:00:00');
        const a = waiverStatus(dowdle, faab2, {}, kickoffs, now);
        const b = waiverStatus(dowdle, rolling1, {}, kickoffs, now);
        assert.equal(a.status, b.status);
        assert.equal(a.clearsAt, b.clearsAt);
        assert.equal(a.claimType, 'faab');
        assert.equal(b.claimType, 'rolling');
    });

    test('a player with no game this week (bye) is never too late', () => {
        const st = waiverStatus({ cleanName: 'b', team: 'KC' }, faab2, { b: PT('2026-11-14T08:00:00') }, kickoffs, PT('2026-11-14T12:00:00'));
        assert.equal(st.status, 'waivers');
        assert.equal(st.tooLateThisWeek, false);
    });
});

describe('round 6: real cases from the owner\'s leagues', () => {
    // LOOG - Chop Shop: guillotine, weekly waivers, 2-day clears. Caleb Williams was cut Mon 11/02 9:46 PM PT and claimed
    // at Wednesday's 12:12 AM run, 26 hours later.
    const chop = waiverSettingsFrom({ waiver_type: 2, waiver_budget: 1000, waiver_clear_days: 2, waiver_day_of_week: 2, daily_waivers: 0, daily_waivers_hour: 0 });
    test('a guillotine cut clears at the next weekly run, not after the clear days', () => {
        const cut = { calebwilliams: { at: Date.parse('2026-11-02T21:46:00-08:00'), chopped: true } };
        const st = waiverStatus({ cleanName: 'calebwilliams', team: 'CHI' }, chop, cut, kickoffs, PT('2026-11-03T10:00:00'));
        assert.equal(st.status, 'waivers');
        assert.equal(st.clearsAt, PT('2026-11-04T00:00:00'));
        assert.equal(st.atRun, true);
        assert.equal(waiverStatusText(st, 'America/Los_Angeles'), 'On waivers until Wed 12 AM (FAAB). Chopped Mon 9:46 PM.');
        // And a free agent once it has run.
        assert.equal(waiverStatus({ cleanName: 'calebwilliams', team: 'CHI' }, chop, cut, kickoffs, PT('2026-11-04T06:00:00')).status, 'free');
    });
    test('waiver_day_of_week 0 (Gridiron Best Ball): the weekly run is still Wednesday', () => {
        const gridiron = waiverSettingsFrom({ waiver_type: 0, waiver_clear_days: 0, waiver_day_of_week: 0, daily_waivers: 1, daily_waivers_hour: 0, daily_waivers_days: 10581 });
        assert.equal(nextWeeklyRun(gridiron, PT('2026-11-15T14:00:00')), PT('2026-11-18T00:00:00'));
    });
});

describe('round 7: each league\'s daily schedule, from the owner\'s Sleeper settings screens', () => {
    // Week 10, 2026: Fri 11/13 ... Wed 11/18. "1 AM MST" on Sleeper's screens is 12 AM PT.
    const daily = (days, hour, clear) => waiverSettingsFrom({ waiver_type: 2, waiver_budget: 100, waiver_clear_days: clear, waiver_day_of_week: 2, daily_waivers: 1, daily_waivers_hour: hour, daily_waivers_days: days });
    const LRD = daily(6140, 0, 1);   // Mon, Tue Waivers; Wed-Sat Waivers until 1 AM MST, then FA; Sun FA
    const FL = daily(10583, 0, 2);   // Mon, Tue Locked; Wed-Sat Waivers; Sun Waivers until 1 AM MST, then FA
    const LP = daily(10580, 9, 1);   // Mon, Tue Locked; Wed-Sat Waivers; Sun Free Agency (runs at 9 AM PT)
    const FNB = daily(10581, 0, 1);  // Mon, Tue Locked; every other day Waivers (Gridiron, Legacy too)
    const RD = daily(1360, 9, 2);    // REDRAFT: Sat, Sun, Mon FA; Tue-Fri Waivers at 9 AM
    const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6;
    const nobody = { cleanName: 'x', team: 'KC' }; // no game in these kickoffs (a bye)

    test('the day codes match the three screens', () => {
        assert.deepEqual([MON, TUE, WED, THU, FRI, SAT, SUN].map(d => dayCode(LRD, d)), [1, 1, 3, 3, 3, 3, 0]);
        assert.deepEqual([MON, TUE, WED, THU, FRI, SAT, SUN].map(d => dayCode(FL, d)), [2, 2, 1, 1, 1, 1, 3]);
        assert.deepEqual([MON, TUE, WED, THU, FRI, SAT, SUN].map(d => dayCode(LP, d)), [2, 2, 1, 1, 1, 1, 0]);
        assert.deepEqual([MON, TUE, WED, THU, FRI, SAT, SUN].map(d => dayCode(RD, d)), [0, 1, 1, 1, 1, 0, 0]);
        // Weekly waivers: Monday and Tuesday are waiver days for everyone, the rest free agency (round 8).
        assert.deepEqual([MON, TUE, WED, SUN].map(d => dayCode(faab2, d)), [1, 1, 0, 0]);
    });

    test('LRD Cucks: a waiver day Monday, free agents Wednesday after 12 AM PT, and Sunday', () => {
        const mon = waiverStatus(nobody, LRD, {}, kickoffs, PT('2026-11-16T10:00:00'));
        assert.equal(mon.status, 'waivers');
        assert.equal(mon.reason, 'waiverDay');
        assert.equal(mon.clearsAt, PT('2026-11-17T00:00:00'));
        assert.equal(waiverStatusText(mon, 'America/Los_Angeles'), 'On waivers until Tue 12 AM (FAAB). A waiver day in this league: every pickup is a claim.');
        assert.equal(modeAt(LRD, PT('2026-11-18T15:00:00')), 'fa');
        assert.equal(waiverStatus(nobody, LRD, {}, kickoffs, PT('2026-11-15T09:00:00')).status, 'free');
        // On a free-agency day a recent drop is still a claim (the owner's note): Malik Washington, dropped Fri 1:40 PM
        // in this 1-day league, claimed Sat 12:45 PM while others were added as free agents.
        const fri = PT('2026-11-13T13:40:00');
        const st = waiverStatus({ cleanName: 'malikwashington', team: 'KC' }, LRD, { malikwashington: fri }, kickoffs, PT('2026-11-13T18:00:00'));
        assert.equal(st.status, 'waivers');
        assert.equal(st.clearsAt, fri + 23 * H); // an hour short of the day (round 8)
        assert.equal(waiverStatus(nobody, LRD, { malikwashington: fri }, kickoffs, PT('2026-11-13T18:00:00')).status, 'free');
    });

    test('Fantasy Leftovers: Sunday is free agency after 12 AM PT; Monday is locked until Wednesday', () => {
        assert.equal(waiverStatus(nobody, FL, {}, kickoffs, PT('2026-11-15T09:00:00')).status, 'free');
        const mon = waiverStatus(nobody, FL, {}, kickoffs, PT('2026-11-16T12:00:00'));
        assert.equal(mon.reason, 'locked');
        assert.equal(mon.clearsAt, PT('2026-11-18T00:00:00'));
        assert.equal(waiverStatusText(mon, 'America/Los_Angeles'), 'On waivers until Wed 12 AM (FAAB). Adds are locked today in this league.');
        // Thursday: a waiver day; the next run is Friday 12 AM.
        assert.equal(nextRunAt(FL, PT('2026-11-19T12:00:00')), PT('2026-11-20T00:00:00'));
    });

    test('Legends of the Pocket: claims at 9 AM; Saturday\'s run into Sunday\'s free agency is at 12 AM', () => {
        assert.equal(nextRunAt(LP, PT('2026-11-13T10:00:00')), PT('2026-11-14T09:00:00')); // Fri -> Sat 9 AM
        assert.equal(nextRunAt(LP, PT('2026-11-14T10:00:00')), PT('2026-11-15T00:00:00')); // Sat -> Sun 12 AM
        assert.equal(waiverStatus(nobody, LP, {}, kickoffs, PT('2026-11-15T09:00:00')).status, 'free');
        // A player who played Sunday: locked until the after-games time (Wed 12 AM), then Wednesday's 9 AM run.
        const played = waiverStatus(dowdle, LP, {}, kickoffs, PT('2026-11-15T14:00:00'));
        assert.equal(played.reason, 'played');
        assert.equal(played.clearsAt, PT('2026-11-18T09:00:00'));
    });

    test('Friday Night Beverages: a Sunday-night player on Sunday afternoon is on waivers until Wednesday, too late', () => {
        const st = waiverStatus({ cleanName: 'y', team: 'SF' }, FNB, {}, { ...kickoffs, SF: '2026-11-16T01:20:00Z' }, PT('2026-11-15T14:00:00'));
        assert.equal(st.status, 'waivers');
        assert.equal(st.reason, 'waiverDay');
        assert.equal(st.clearsAt, PT('2026-11-18T00:00:00'));
        assert.equal(st.tooLateThisWeek, true);
    });

    test('REDRAFT: Saturday is free agency; a Tuesday waiver day runs at 9 AM', () => {
        assert.equal(waiverStatus(nobody, RD, {}, kickoffs, PT('2026-11-14T12:00:00')).status, 'free');
        const tue = waiverStatus(nobody, RD, {}, kickoffs, PT('2026-11-17T08:00:00'));
        assert.equal(tue.reason, 'waiverDay');
        assert.equal(tue.clearsAt, PT('2026-11-17T09:00:00'));
        // Friday's claims run at 12 AM Saturday, when free agency starts (REDRAFT's Saturday 12 AM claims).
        assert.equal(nextRunAt(RD, PT('2026-11-13T10:00:00')), PT('2026-11-14T00:00:00'));
    });
});

describe('round 8: back-tested against ~590 real adds and claims', () => {
    test('a weekly-waiver league: Monday is a waiver day for everyone, a bye-week player too, claims run Wednesday', () => {
        const st = waiverStatus({ cleanName: 'pittsburghsteelers', team: 'PIT' }, faab2, {}, kickoffs, PT('2026-11-16T19:29:00'));
        assert.equal(st.status, 'waivers');
        assert.equal(st.reason, 'waiverDay');
        assert.equal(st.clearsAt, PT('2026-11-18T00:00:00'));
    });
    test('a waiver day\'s run after his kickoff: he locks at kickoff, until Wednesday (Tyson Bagent, Monday night)', () => {
        const managers = waiverSettingsFrom({ waiver_type: 2, waiver_clear_days: 1, waiver_day_of_week: 2, daily_waivers: 1, daily_waivers_hour: 0, daily_waivers_days: 5460 });
        const st = waiverStatus({ cleanName: 'tysonbagent', team: 'NYG' }, managers, {}, kickoffs, PT('2026-11-16T07:48:00'));
        assert.equal(st.reason, 'waiverDay');
        assert.equal(st.clearsAt, PT('2026-11-18T00:00:00')); // not Tuesday's 12 AM run
        assert.equal(st.tooLateThisWeek, true);
    });
    test('a 12:11 AM drop in a 1-day daily league makes the next day\'s 12 AM run (Kimani Vidal)', () => {
        const fnb = waiverSettingsFrom({ waiver_type: 2, waiver_clear_days: 1, waiver_day_of_week: 2, daily_waivers: 1, daily_waivers_hour: 0, daily_waivers_days: 10581 });
        const st = waiverStatus({ cleanName: 'kimanividal', team: 'KC' }, fnb, { kimanividal: PT('2026-11-18T00:11:00') }, kickoffs, PT('2026-11-18T00:20:00'));
        assert.equal(st.clearsAt, PT('2026-11-19T00:00:00'));
    });
});

describe('waiverStatusText', () => {
    const tz = 'America/Los_Angeles';
    test('the chip tap texts: short, "too late" once', () => {
        assert.equal(shortWhen(PT('2026-11-18T00:00:00'), tz), 'Wed 12 AM');
        const played = waiverStatus(dowdle, faab2, {}, kickoffs, PT('2026-11-15T14:00:00'));
        assert.equal(waiverStatusText(played, tz), 'On waivers until Wed 12 AM (FAAB). His game has started. Too late for this week.');
        const locked = waiverStatus(dowdle, faab2, { ricodowdle: PT('2026-11-14T08:00:00') }, kickoffs, PT('2026-11-14T12:00:00'));
        assert.equal(waiverStatusText(locked, tz), 'On waivers until Wed 12 AM (FAAB). Dropped Sat 8 AM; locked at his Sun 10 AM kickoff. Too late for this week.');
        const clock = waiverStatus(dowdle, rolling1, { ricodowdle: PT('2026-11-12T17:08:00') }, kickoffs, PT('2026-11-13T12:00:00'));
        assert.equal(waiverStatusText(clock, tz), 'On waivers until about Fri 4:08 PM (rolling). Dropped Thu 5:08 PM.');
        // Tuesday, every game over (round 3: "His game has started" read oddly then).
        const tue = waiverStatus(dowdle, faab2, {}, kickoffs, PT('2026-11-17T10:00:00'));
        assert.equal(waiverStatusText(tue, tz), 'On waivers until Wed 12 AM (FAAB), like everyone who played this week.');
        const free = waiverStatus(dowdle, faab2, {}, kickoffs, PT('2026-11-14T12:00:00'));
        assert.equal(waiverStatusText(free, tz), 'Free agent: add now, until his Sun 10 AM kickoff.');
        assert.equal(waiverStatusText({ status: 'free', kickoff: null }, tz), 'Free agent: add now, no claim needed.');
    });
});
