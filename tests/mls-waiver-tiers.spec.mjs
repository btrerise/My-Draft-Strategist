// Lineup Strategist Scout tab: the tier of the player a free agent is compared against (improvements S8).
// Free agents' ranks carry their tier ("(T3)", tierTag in js/mls/constants.js); the player they're
// measured against now does too, wherever he's named: Auto-Find's Whole Roster drop candidate ("Your
// weakest RB is Derrick Henry (ROS RB8 (T4))") and its "Next weakest" list, and the numbers line under
// every comparison verdict (Upgrade over, Doesn't pass, Replaces, Would need to pass), where the free
// agent's number gets his tier too. Owner's choices: the same "(T9)" tag; the tier that belongs to the
// number shown (position tier for "RB8", the overall list's for "Overall #23", the FLEX list's for
// "Flex #12"), like the rest of the Waiver Wire; not on the Dashboard's Best Available lines; display
// only, so Auto-Find and Check a List still count any better rank as an upgrade.
//
// A single rankings file's Tier column is the overall list's tier, so it shows beside ROS Overall only
// (rankings-waivers.csv: Kittle #23 T4). Position tiers come from per-position uploads; TIERED below
// stores sets shaped like one (posRank and posTier per position) and moves James Cook (a free agent)
// ahead of Derrick Henry (your weakest RB), so there's an upgrade to compare.
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, seedMls, loadMlsRankings, callApp, WAIVER_RANKINGS_CSV } from './helpers.mjs';

const out = (page) => page.locator('#waiverOutput');
const benchmark = (page) => out(page).locator('.mls-scan-benchmark');
const scanCard = (page, name) => out(page).locator('.mls-scan-card').filter({ hasText: name });
const listCard = (page, name) => out(page).locator('.scout-result-card').filter({ hasText: name });

// Name -> position, from the CSV (the stored rankings don't carry positions).
const POS = Object.fromEntries(WAIVER_RANKINGS_CSV.trim().split('\n').slice(1).map(l => { const c = l.split(','); return [c[1], c[2]]; }));

// The same file without its Tier column.
const UNTIERED_CSV = WAIVER_RANKINGS_CSV.trim().split('\n').map(l => { const c = l.split(','); c.splice(4, 1); return c.join(','); }).join('\n');

// Rewrites both saved sets the way per-position uploads store them: each player's position rank, and a
// position tier of ceil(posRank / 2), with Cook and Henry swapped. Weekly also gets a FLEX list (RB/WR/TE
// only, tier ceil(flexRank / 4)), as a Weekly FLEX file gives. Then reloads, so the app reads them.
async function storePositionTiers(page) {
    await page.evaluate((POS) => {
        for (const key of ['mls_ranking_sets_ros', 'mls_ranking_sets_weekly']) {
            const sets = JSON.parse(localStorage.getItem(key));
            for (const set of sets) {
                const data = set.data;
                const cook = data.find(r => r.name === 'James Cook'), henry = data.find(r => r.name === 'Derrick Henry');
                for (const k of ['rank', 'tier']) [cook[k], henry[k]] = [henry[k], cook[k]];
                data.sort((a, b) => a.rank - b.rank);
                const seen = {};
                let flex = 0;
                for (const r of data) {
                    const pos = POS[r.name];
                    r.posRank = seen[pos] = (seen[pos] || 0) + 1;
                    r.posTier = Math.ceil(r.posRank / 2);
                    const isFlex = ['RB', 'WR', 'TE'].includes(pos);
                    if (key.endsWith('weekly')) {
                        r.flexRank = isFlex ? ++flex : 999;
                        r.flexTier = isFlex ? Math.ceil(r.flexRank / 4) : null;
                    } else {
                        r.flexRank = r.rank;
                        r.flexTier = r.tier;
                    }
                }
            }
            localStorage.setItem(key, JSON.stringify(sets));
        }
    }, POS);
    await page.reload();
}

// Every name+rank+tier piece stays on one line: inside a .mls-nowrap, and that piece's boxes all sit on
// one line (one distinct top).
async function expectTiersUnbroken(page) {
    const pieces = await out(page).locator('.mls-tier').evaluateAll(els => els
        .filter(el => !el.closest('.mls-scan-ranks'))
        .map(el => {
            const n = el.closest('.mls-nowrap');
            if (!n) return 0;
            const range = document.createRange();
            range.selectNodeContents(n);
            return new Set(Array.from(range.getClientRects()).filter(r => r.width > 0).map(r => Math.round(r.bottom))).size;
        }));
    expect(pieces.length, 'tiers on compared players').toBeGreaterThan(0);
    expect(pieces, 'each tier inside one unbroken .mls-nowrap').toEqual(pieces.map(() => 1));
}

async function runAutoFind(page, { basis, pos, compare }) {
    await showTab(page, 'scout');
    await page.locator('#waiverScanBasis').selectOption(basis);
    await callApp(page, 'setWaiverPos', pos);
    await callApp(page, 'setWaiverMode', 'auto');
    await callApp(page, 'setWaiverCompare', compare);
    await out(page).evaluate(el => { el.innerHTML = ''; });
    await page.locator('[data-action="autoFindWaiverUpgrades"]').click();
    await expect(out(page).locator('.mls-scan-summary')).toBeVisible();
}

async function runCheckList(page, { basis, pos, compare }, names) {
    await showTab(page, 'scout');
    await page.locator('#waiverScanBasis').selectOption(basis);
    await callApp(page, 'setWaiverMode', 'list');
    await callApp(page, 'setWaiverCompare', compare);
    if (pos) await callApp(page, 'setWaiverPos', pos);
    await out(page).evaluate(el => { el.innerHTML = ''; });
    await page.fill('#waiverInput', names.join('\n'));
    await page.click('#waiverScanBtn');
    await expect(out(page).locator('.scout-result-card').first()).toBeVisible();
}

test.describe('Lineup Strategist: the compared player\'s tier in the Waiver Wire Assistant', () => {
    test('names the compared player with the tier of the number shown', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, WAIVER_RANKINGS_CSV, 30);

        // One file with a Tier column: that's the overall list's tier, so it shows beside ROS Overall
        // (Kittle #23 T4, Wilson #21 T4, Brown #19 T3) and not beside a position rank.
        await runAutoFind(page, { basis: 'ros', pos: 'FLEX', compare: 'roster' });
        await expect(benchmark(page)).toContainText('Your weakest RB/WR/TE is George Kittle (ROS Overall #23 (T4)).');
        await expect(benchmark(page)).toContainText('Next weakest: Garrett Wilson (ROS Overall #21 (T4)), A.J. Brown (ROS Overall #19 (T3))');
        await expect(benchmark(page).locator('.mls-tier').first()).toHaveAttribute('title', 'Tier 4');
        await expectTiersUnbroken(page);
        await runAutoFind(page, { basis: 'ros', pos: 'RB', compare: 'roster' });
        await expect(benchmark(page)).toContainText('Your weakest RB is Derrick Henry (ROS RB5).');
        await expect(benchmark(page).locator('.mls-tier')).toHaveCount(0);

        // Position tiers (per-position uploads), with Cook now ahead of Henry.
        await storePositionTiers(page);

        // Auto-Find, Whole Roster: the drop candidate and the upgrade's numbers line.
        await runAutoFind(page, { basis: 'ros', pos: 'RB', compare: 'roster' });
        await expect(benchmark(page)).toContainText('Your weakest RB is Derrick Henry (ROS RB8 (T4)).');
        const cook = scanCard(page, 'James Cook');
        await expect(cook.locator('.mls-scan-verdict')).toContainText('Upgrade over Derrick Henry');
        await expect(cook.locator('.mls-verdict-nums')).toHaveText('ROS Pos: Cook RB5 (T3), Henry RB8 (T4)');
        // His own rank row (unchanged) reads the same tier as the verdict line.
        await expect(cook.locator('.mls-scan-ranks')).toContainText('ROS Pos: RB5 (T3)');
        await expectTiersUnbroken(page);

        // FLEX by ROS compares Overall ranks, with the overall list's tiers.
        await runAutoFind(page, { basis: 'ros', pos: 'FLEX', compare: 'roster' });
        await expect(benchmark(page)).toContainText('Your weakest RB/WR/TE is Derrick Henry (ROS Overall #26 (T4)).');
        await expect(benchmark(page)).toContainText('Next weakest: George Kittle (ROS Overall #23 (T4)), Garrett Wilson (ROS Overall #21 (T4))');
        await expect(cook.locator('.mls-verdict-nums')).toHaveText('ROS Overall: Cook #15 (T3), Henry #26 (T4)');

        // Auto-Find, Starting Lineup: Would need to pass, by Weekly FLEX (flex tiers) or position (position tiers).
        await runAutoFind(page, { basis: 'weekly', pos: 'FLEX', compare: 'lineup' });
        await expect(scanCard(page, 'Jaxon Smith-Njigba').locator('.mls-scan-verdict')).toContainText('Would need to pass CeeDee Lamb');
        await expect(scanCard(page, 'Jaxon Smith-Njigba').locator('.mls-verdict-nums')).toHaveText('Wk Flex: Smith-Njigba #22 (T6), Lamb #5 (T2)');
        await expect(scanCard(page, 'Sam LaPorta').locator('.mls-verdict-nums')).toHaveText('Wk Pos: LaPorta TE4 (T2), Bowers TE1 (T1)');
        await expectTiersUnbroken(page);

        // Check a List, Whole Roster: Upgrade over and Doesn't pass.
        await runCheckList(page, { basis: 'ros', pos: 'RB', compare: 'roster' }, ['James Cook', 'Chase Brown']);
        await expect(listCard(page, 'James Cook')).toContainText('Upgrade over Derrick Henry');
        await expect(listCard(page, 'James Cook').locator('.mls-verdict-nums')).toHaveText('ROS Pos: Cook RB5 (T3), Henry RB8 (T4)');
        await expect(listCard(page, 'Chase Brown')).toContainText("Doesn't pass Derrick Henry");
        await expect(listCard(page, 'Chase Brown').locator('.mls-verdict-nums')).toHaveText('ROS Pos: Brown RB9 (T5), Henry RB8 (T4)');
        await expectTiersUnbroken(page);

        // Top Available names no compared player; its chip shows the same position tier the lines use.
        await callApp(page, 'setWaiverMode', 'top');
        await callApp(page, 'setWaiverPos', 'RB');
        await page.locator('#waiverScanBasis').selectOption('ros');
        await expect(out(page).locator('.mls-ta-row').filter({ hasText: 'James Cook' }).locator('.mls-ta-pos')).toHaveText('RB5 T3');
        await expect(out(page)).not.toContainText('Derrick Henry');

        await expectClean(page, state);
    });

    test('rankings without tiers show none, exactly as before', async ({ page }) => {
        const state = await openApp(page, '/lineup/');
        await seedMls(page);
        await loadMlsRankings(page, UNTIERED_CSV, 30);

        await runAutoFind(page, { basis: 'ros', pos: 'FLEX', compare: 'roster' });
        await expect(benchmark(page)).toContainText('Your weakest RB/WR/TE is George Kittle (ROS Overall #23).');
        await expect(benchmark(page)).toContainText('Next weakest: Garrett Wilson (ROS Overall #21), A.J. Brown (ROS Overall #19)');
        // No wrapper is added without a tier, so the line's markup is what it was.
        await expect(benchmark(page).locator('.mls-nowrap')).toHaveCount(0);
        await expect(out(page).locator('.mls-tier')).toHaveCount(0);

        await runAutoFind(page, { basis: 'weekly', pos: 'FLEX', compare: 'lineup' });
        await expect(scanCard(page, 'Sam LaPorta').locator('.mls-verdict-nums')).toHaveText('Wk Pos: LaPorta TE4, Bowers TE1');
        await expect(out(page).locator('.mls-tier')).toHaveCount(0);

        await runCheckList(page, { basis: 'ros', pos: 'RB', compare: 'roster' }, ['Chase Brown']);
        await expect(listCard(page, 'Chase Brown').locator('.mls-verdict-nums')).toHaveText('ROS Pos: Brown RB9, Henry RB5');
        await expect(out(page).locator('.mls-tier')).toHaveCount(0);

        await expectClean(page, state);
    });
});
