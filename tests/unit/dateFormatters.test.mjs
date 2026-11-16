// Date formatting that runs once per player or per row builds its Intl.DateTimeFormat once (improvements F25). Each new
// formatter costs about a millisecond on a phone; S34's waiver status built one per call, for every player in every
// league several times a draw, which made the Dashboard take 3.3 s to appear and Sync All 82 s with the owner's 20
// leagues (tests/tools/backup-perf.tool.mjs, a 4x-slowed CPU). This counts the formatters built.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const RealDTF = Intl.DateTimeFormat;
let built = 0;
function CountingDTF(...args) { built++; return new RealDTF(...args); }
CountingDTF.prototype = RealDTF.prototype;
CountingDTF.supportedLocalesOf = RealDTF.supportedLocalesOf;
Intl.DateTimeFormat = CountingDTF;

const { waiverStatus, waiverSettingsFrom } = await import('../../js/mls/scout/waiverStatus.js');
const { getFreshness } = await import('../../js/shared/freshness.js');

test('waiver status: one formatter, however many players and leagues', () => {
    const now = Date.parse('2026-11-14T20:00:00Z');
    const kickoffs = { KC: '2026-11-15T18:00:00Z', BUF: '2026-11-13T01:15:00Z', DAL: '2026-11-16T01:20:00Z' };
    const leagues = [
        waiverSettingsFrom({ waiver_type: 2, waiver_clear_days: 1, waiver_day_of_week: 2, daily_waivers: 0 }),
        waiverSettingsFrom({ waiver_type: 2, waiver_clear_days: 2, waiver_day_of_week: 2, daily_waivers: 1, daily_waivers_hour: 9, daily_waivers_days: 5461 }),
    ];
    built = 0;
    for (const waivers of leagues) {
        for (let i = 0; i < 300; i++) {
            const team = ['KC', 'BUF', 'DAL'][i % 3];
            const drops = { [`player ${i}`]: now - (i % 5) * 3600_000 };
            waiverStatus({ cleanName: `player ${i}`, team }, waivers, drops, kickoffs, now);
        }
    }
    assert.ok(built <= 1, `built ${built} formatters for 600 players`);
});

test('freshness labels: a formatter per format, not per label', () => {
    built = 0;
    const now = Date.now();
    for (let i = 0; i < 200; i++) getFreshness(now - i * 3600_000 * 7, 2, 'Synced');
    assert.ok(built <= 3, `built ${built} formatters for 200 labels`);
});
