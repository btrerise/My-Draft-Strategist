// js/mls/scout/waiverStatus.js (improvements S34): free agent or waivers, when he clears, and whether that's too late
// for this week. Times are 2026's week 10: Thu Nov 12 to Mon Nov 16 (Pacific standard time, UTC-8).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nextWeeklyRun, shortWhen, waiverSettingsFrom, waiverStatus, waiverStatusText } from '../../js/mls/scout/waiverStatus.js';

const PT = (s) => Date.parse(`${s}-08:00`); // a Pacific (standard time) wall clock
const H = 3600 * 1000;

// A FAAB league with daily waivers at 12 AM and 2-day clears (most of the owner's leagues).
const faab2 = waiverSettingsFrom({ waiver_type: 2, waiver_budget: 100, waiver_clear_days: 2, waiver_day_of_week: 2, daily_waivers: 1, daily_waivers_hour: 0, daily_waivers_days: 5461 });
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
        assert.deepEqual(faab2, { type: 'faab', budget: 100, clearDays: 2, dayOfWeek: 2, daily: true, hour: 0, days: 5461 });
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
        assert.equal(st.clearsAt, drop + 48 * H);       // Sat 5:08 PM, before his Sunday game
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

describe('waiverStatusText', () => {
    const tz = 'America/Los_Angeles';
    test('the chip tap texts: short, "too late" once', () => {
        assert.equal(shortWhen(PT('2026-11-18T00:00:00'), tz), 'Wed 12 AM');
        const played = waiverStatus(dowdle, faab2, {}, kickoffs, PT('2026-11-15T14:00:00'));
        assert.equal(waiverStatusText(played, tz), 'On waivers until Wed 12 AM (FAAB). His game has started. Too late for this week.');
        const locked = waiverStatus(dowdle, faab2, { ricodowdle: PT('2026-11-14T08:00:00') }, kickoffs, PT('2026-11-14T12:00:00'));
        assert.equal(waiverStatusText(locked, tz), 'On waivers until Wed 12 AM (FAAB). Dropped Sat 8 AM; locked at his Sun 10 AM kickoff. Too late for this week.');
        const clock = waiverStatus(dowdle, rolling1, { ricodowdle: PT('2026-11-12T17:08:00') }, kickoffs, PT('2026-11-13T12:00:00'));
        assert.equal(waiverStatusText(clock, tz), 'On waivers until about Fri 5:08 PM (rolling). Dropped Thu 5:08 PM.');
        // Tuesday, every game over (round 3: "His game has started" read oddly then).
        const tue = waiverStatus(dowdle, faab2, {}, kickoffs, PT('2026-11-17T10:00:00'));
        assert.equal(waiverStatusText(tue, tz), 'On waivers until Wed 12 AM (FAAB), like everyone who played this week.');
        const free = waiverStatus(dowdle, faab2, {}, kickoffs, PT('2026-11-14T12:00:00'));
        assert.equal(waiverStatusText(free, tz), 'Free agent: add now, until his Sun 10 AM kickoff.');
        assert.equal(waiverStatusText({ status: 'free', kickoff: null }, tz), 'Free agent: add now, no claim needed.');
    });
});
