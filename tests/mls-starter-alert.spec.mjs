// Starter alerts (improvements N2: js/mls/lineup/starterAlert.js, starterAlertRules.js, js/shared/ui/notify.js): the
// Advanced Settings toggle (off by default; turning it on asks for notification permission), the check before a kickoff
// window on the lineup set in Sleeper, its refresh (a quiet Sync All), once a week, and the fallbacks when notifications
// are blocked or missing (the card on the page; the browser tab's name flashing while hidden). Every alert also stays on
// the page as a card until dismissed, with a button to the Dashboard. "Send a test alert" sends a sample. sw.js's notificationclick (a tap
// focuses /lineup/) is tests/unit/swNotificationClick.test.mjs; the rules are tests/unit/starterAlertRules.test.mjs.
//
// Week 2 of the fixture season. The fixture league's own Sleeper lineup (mds_test, user 900001) is set by a stubbed
// rosters response: Allen and Henry (BUF @ BAL on Thursday), Chase and Lamb (CIN @ DAL, Sunday 1:00), Bowers and Jefferson
// (LV @ MIN, Sunday 4:05), Tucker and the Ravens, and an empty RB slot. Chase's status comes from the stubbed player file,
// so a test can turn him Out before the refresh. Notification and the service worker are stubbed (window.__notes records
// showNotification); the clock is Playwright's fixed time, moved between checks.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, expectClean, showTab, seedMls, callApp, FIXTURE_LEAGUE_ID } from './helpers.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/sleeper/${name}`, import.meta.url), 'utf8'));
const KICK_1PM = Date.parse('2026-09-20T17:00:00Z');
const MIN = 60 * 1000;
const at = (ms) => new Date(ms);

const scoreboard = {
    events: [['BUF', 'BAL', '2026-09-18T00:15:00Z'], ['CIN', 'DAL', '2026-09-20T17:00:00Z'], ['LV', 'MIN', '2026-09-20T20:05:00Z']]
        .map(([a, b, date]) => ({ date, status: { type: { state: 'pre' } },
            competitions: [{ competitors: [{ team: { abbreviation: a }, homeAway: 'away' }, { team: { abbreviation: b }, homeAway: 'home' }] }] })),
};
// QB RB RB WR WR TE FLEX K DEF
const SLEEPER_STARTERS = ['4984', '3198', '0', '4866', '6786', '11604', '6794', '17', 'BAL'];

// mode: the Notification API as the page sees it: 'default' (asks; answers `answer`), 'granted', 'denied', 'missing'.
async function stubNotifications(page, mode, answer = 'granted') {
    await page.addInitScript(([mode, answer]) => {
        window.__notes = [];
        window.__asked = 0;
        // The tab's visibility, switched by setHidden() below.
        window.__hidden = false;
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__hidden ? 'hidden' : 'visible') });
        if (mode === 'missing') { delete window.Notification; return; }
        class FakeNotification { constructor() { throw new TypeError('Illegal constructor'); } }
        FakeNotification.permission = mode;
        FakeNotification.requestPermission = async () => { window.__asked++; FakeNotification.permission = answer; return answer; };
        window.Notification = FakeNotification;
        const reg = { showNotification: async (title, options) => { window.__notes.push({ title, ...options }); } };
        Object.defineProperty(navigator, 'serviceWorker', { configurable: true,
            value: { ready: Promise.resolve(reg), register: async () => reg, addEventListener() {} } });
    }, [mode, answer]);
}

async function setHidden(page, hidden) {
    await page.evaluate((h) => { window.__hidden = h; document.dispatchEvent(new Event('visibilitychange')); }, hidden);
}

async function setup(page, { mode = 'default', answer = 'granted', when = KICK_1PM - 45 * MIN, chase = null } = {}) {
    const players = fixture('players-nfl.json');
    const rosters = fixture('league-rosters.json');
    rosters.find(r => r.owner_id === '900001').starters = SLEEPER_STARTERS;
    const live = { chase };
    await stubNotifications(page, mode, answer);
    await page.clock.setFixedTime(at(when));
    const state = await openApp(page, '/lineup/', {
        beforeGoto: async (p) => {
            await p.route(/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/, route => route.fulfill({ json: scoreboard }));
            await p.route(new RegExp(`sleeper\\.app/v1/league/${FIXTURE_LEAGUE_ID}/rosters$`), route => route.fulfill({ json: rosters }));
            await p.route(/sleeper\.app\/v1\/players\/nfl$/, route => {
                players['4866'].injury_status = live.chase;
                return route.fulfill({ json: players });
            });
        },
    });
    await page.clock.setFixedTime(at(when));
    await seedMls(page);
    // The week's kickoffs (ESPN's scoreboard, stubbed above), as the page loads them after its first paint.
    await expect.poll(() => page.evaluate(async () => Object.keys((await import('/js/mls/state.js')).State.gameTimesByTeam).length)).toBe(6);
    await showTab(page, 'setup');
    return { state, live };
}

const toggle = (page) => page.locator('#starterAlertsToggle');
const check = (page, opts) => callApp(page, 'runStarterAlertCheck', opts);
const notes = (page) => page.evaluate(() => window.__notes);

test.describe('Starter alerts', () => {
    test('off by default: no alert inside the window, no permission asked', async ({ page }) => {
        const { state } = await setup(page, { chase: 'Out' });
        await expect(toggle(page)).not.toBeChecked();
        await expect(page.locator('#starterAlertsOptions')).toBeHidden();
        expect(await check(page)).toBeNull();
        expect(await notes(page)).toEqual([]);
        expect(await page.evaluate(() => window.__asked)).toBe(0);
        expect(await callApp(page, 'planStarterAlerts')).toBeNull();
        await expectClean(page, state);
    });

    test('on: asks once from the tap, alerts once inside the window, not before it, not again after a reload', async ({ page }) => {
        const { state, live } = await setup(page, { when: KICK_1PM - 2 * 60 * MIN });
        await toggle(page).check();
        await expect(page.locator('#starterAlertsOptions')).toBeVisible();
        await expect(page.locator('#starterAlertLead')).toHaveValue('60');
        await expect(page.locator('#starterAlertsStale')).toBeChecked();
        expect(await page.evaluate(() => window.__asked)).toBe(1);
        await expect(page.locator('#starterAlertsStatus')).toBeHidden();

        // Two hours before: the next check is planned for 12:00 (ET), and nothing is due yet.
        expect(await callApp(page, 'planStarterAlerts')).toBe(KICK_1PM - 60 * MIN);
        expect(await check(page)).toBeNull();

        // Chase is ruled Out on Sunday morning: the check's refresh (Sync All) picks it up.
        live.chase = 'Out';
        await page.clock.setFixedTime(at(KICK_1PM - 50 * MIN));
        const result = await check(page);
        expect(result.how).toBe('notification');
        const sent = await notes(page);
        expect(sent).toHaveLength(1);
        expect(sent[0].title).toMatch(/^2 lineup problems before Sun /);
        expect(sent[0].body.replace(/ /g, ' ')).toBe("Fixture League: Ja'Marr Chase is Out: start Puka Nacua instead?\nFixture League: RB slot is empty");
        expect(sent[0].tag).toBe('mls-starter-alert');
        expect(sent[0].data).toEqual({ url: '/lineup/' });
        // The card on the page says the same, and its button opens the Dashboard's "lineups need you" box.
        const card = page.locator('#notifyPageAlert');
        await expect(card).toBeVisible();
        await expect(card).toHaveAttribute('role', 'alert');
        await expect(card.locator('.notify-card-title')).toHaveText(sent[0].title);
        await expect(card.locator('.notify-card-lines li')).toHaveCount(2);
        await showTab(page, 'roster');
        await card.getByRole('button', { name: 'Show on the Dashboard' }).click();
        await expect(card).toHaveCount(0);
        await expect(page.locator('#setupTab')).toHaveClass(/\bactive\b/);
        // The refresh reached the page: the Lineup tab and Dashboard read the same statuses.
        expect(await page.evaluate(async () => (await import('/js/mls/state.js')).State.leagues[0].roster.find(p => p.id === '4866').inj)).toBe('OUT');

        // Once a week, through a reload too.
        await page.clock.setFixedTime(at(KICK_1PM - 40 * MIN));
        expect(await check(page)).toBeNull();
        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(toggle(page)).toBeChecked();
        expect(await check(page, { refresh: false })).toBeNull();
        expect(await notes(page)).toEqual([]); // window.__notes starts over with the page
        await expectClean(page, state);
    });

    test('a shorter lead time: 15 minutes before, the 45-minute mark is outside the window', async ({ page }) => {
        const { state } = await setup(page, { chase: 'D', when: KICK_1PM - 2 * 60 * MIN });
        await toggle(page).check();
        await page.locator('#starterAlertLead').selectOption('15');
        expect(await callApp(page, 'planStarterAlerts')).toBe(KICK_1PM - 15 * MIN);
        await page.clock.setFixedTime(at(KICK_1PM - 45 * MIN));
        expect(await check(page, { refresh: false })).toBeNull();
        await page.clock.setFixedTime(at(KICK_1PM - 10 * MIN));
        const result = await check(page, { refresh: false });
        expect(result.body).toContain('is Doubtful');
        await expectClean(page, state);
    });

    test('Questionable alone isn\'t a problem; old Weekly rankings get their line, unless turned off', async ({ page }) => {
        const { state } = await setup(page, { chase: 'Q', when: KICK_1PM - 2 * 60 * MIN });
        await toggle(page).check();
        await page.clock.setFixedTime(at(KICK_1PM - 45 * MIN));
        // Fill the empty RB slot's alert first, so only Chase's status is left to judge.
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            const l = State.leagues[0];
            l.sleeperStarters = l.sleeperStarters.map(id => (id === '0' ? '3198' : id));
        });
        await page.locator('#starterAlertsStale').uncheck();
        expect(await check(page, { refresh: false })).toBeNull();
        await page.locator('#starterAlertsStale').check();
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.leagues[0].weeklyRankingsUpdatedAt = Date.parse('2026-09-10T12:00:00Z');
        });
        const result = await check(page, { refresh: false });
        expect(result.title).toMatch(/^Old Weekly rankings before Sun /);
        expect(result.body).toBe('Weekly rankings over 6 days old: Fixture League');
        await expectClean(page, state);
    });

    test('blocked: the toggle says so; the card in view; hidden, the tab name flashes and the card is there on return', async ({ page }) => {
        const { state } = await setup(page, { mode: 'default', answer: 'denied', chase: 'Out', when: KICK_1PM - 2 * 60 * MIN });
        await toggle(page).check();
        await expect(page.locator('#starterAlertsStatus')).toContainText('Notifications are blocked for this site');
        await page.clock.setFixedTime(at(KICK_1PM - 45 * MIN));
        const shown = await check(page, { refresh: false });
        expect(shown.how).toBe('page');
        await expect(page.locator('#notifyPageAlert .notify-card-title')).toContainText('2 lineup problems before Sun');
        expect(await notes(page)).toEqual([]);
        await page.getByRole('button', { name: 'Dismiss alert' }).click();
        await expect(page.locator('#notifyPageAlert')).toHaveCount(0);

        // Hidden: the title flashes with the count until the tab is shown again.
        const title = await page.title();
        await page.evaluate(() => { window.__hidden = true; });
        await page.clock.setFixedTime(at(KICK_1PM - 40 * MIN));
        await page.evaluate(async () => {
            const { State } = await import('/js/mls/state.js');
            State.leagues[0].roster.find(p => p.id === '6786').inj = 'D'; // Lamb, newly Doubtful
        });
        const hidden = await check(page, { refresh: false });
        expect(hidden.how).toBe('title');
        expect(hidden.title).toMatch(/^1 lineup problem before/);
        await expect.poll(() => page.title()).toMatch(/^\(1\) /);
        await setHidden(page, false);
        await expect.poll(() => page.title()).toBe(title);
        // Back on the tab: what to do is on the page.
        await expect(page.locator('#notifyPageAlert')).toBeVisible();
        await expect(page.locator('#notifyPageAlert .notify-card-lines')).toContainText('CeeDee Lamb is Doubtful');
        await expectClean(page, state);
    });

    test('no Notification API (an iPhone tab): the toggle says so and the card stands in', async ({ page }) => {
        const { state } = await setup(page, { mode: 'missing', chase: 'Out', when: KICK_1PM - 2 * 60 * MIN });
        await toggle(page).check();
        await expect(page.locator('#starterAlertsStatus')).toContainText("This browser can't show notifications here");
        await page.clock.setFixedTime(at(KICK_1PM - 45 * MIN));
        expect((await check(page, { refresh: false })).how).toBe('page');
        await expect(page.locator('#notifyPageAlert')).toContainText("Ja'Marr");
        await expectClean(page, state);
    });

    test('opened inside the window: the check runs straight away', async ({ page }) => {
        const { state } = await setup(page, { mode: 'granted', chase: 'Out' });
        await toggle(page).check();
        await expect.poll(() => notes(page)).toHaveLength(1);
        expect((await notes(page))[0].title).toMatch(/^2 lineup problems/);
        await expectClean(page, state);
    });
});

test.describe('Starter alerts: Send a test alert', () => {
    test('a sample in 5 seconds, any time, by the same path: notification and card', async ({ page }) => {
        const { state } = await setup(page, { mode: 'granted', when: KICK_1PM - 3 * 60 * MIN });
        await toggle(page).check();
        await expect(page.getByRole('button', { name: 'Send a test alert' })).toBeVisible();
        await page.clock.install();
        await page.getByRole('button', { name: 'Send a test alert' }).click();
        await expect(page.locator('#starterAlertTestStatus')).toContainText('arrives in 5 seconds');
        await page.clock.runFor(4000);
        expect(await notes(page)).toEqual([]);
        await page.clock.runFor(1500);
        await expect.poll(() => notes(page)).toHaveLength(1);
        const [note] = await notes(page);
        expect(note.title).toMatch(/^Test alert/);
        expect(note.tag).toBe('mls-starter-alert-test');
        await expect(page.locator('#notifyPageAlert .notify-card-title')).toHaveText(note.title);
        await expect(page.locator('#starterAlertTestStatus')).toHaveText('');
        // A test isn't a real alert: nothing is remembered as named this week.
        expect(await page.evaluate(() => localStorage.getItem('mls_starter_alerts_sent'))).toBeNull();
        await expectClean(page, state);
    });
});

test.describe('Starter alerts: the timer', () => {
    test('a page left open fires the check at lead minutes before kickoff, then plans the next window', async ({ page }) => {
        await page.clock.install({ time: at(KICK_1PM - 3 * 60 * MIN) });
        const { state } = await setup(page, { mode: 'granted', chase: 'Out', when: KICK_1PM - 3 * 60 * MIN });
        // setup() fixed the time; let it run again from 10:00 (ET).
        await page.clock.setSystemTime(at(KICK_1PM - 3 * 60 * MIN));
        await toggle(page).check();
        await page.clock.runFor(60 * MIN);
        expect(await notes(page)).toEqual([]);
        // To 12:00 (ET) exactly: the check fires, and its refresh (Sync All) runs in the clock's own time from there.
        await page.clock.runFor(60 * MIN);
        await expect.poll(() => notes(page)).toHaveLength(1);
        await page.waitForLoadState('networkidle');
        // After the 1:00 kickoff: the 4:05 window's check, an hour before it.
        await page.clock.runFor(70 * MIN);
        expect(await callApp(page, 'planStarterAlerts')).toBe(Date.parse('2026-09-20T19:05:00Z'));
        await expectClean(page, state);
    });
});
