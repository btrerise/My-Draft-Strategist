// Lineup Strategist's SoS file upload (#sosFileInput, js/mls/sos.js), added in refactor 9A. It reads
// SoS from three file shapes: Team + Pos + SoS columns, a team-by-position grid (Team, QB, RB, WR, TE),
// and Player + SoS with no team (each player's team and position looked up in Sleeper's player map).
// Each value is saved in mls_sos and shown in the "Edit Manual SoS Grid" number boxes.
import { test, expect } from '@playwright/test';
import { openApp, expectClean } from './helpers.mjs';

// Waits for the upload to finish: the handler saves mls_sos last, after any player-map lookup.
// (#sosSuccessMsg sits on the Setup tab, which isn't the open one, so it can't be waited on.)
const upload = async (page, csv) => {
    await page.evaluate(() => localStorage.removeItem('mls_sos'));
    await page.setInputFiles('#sosFileInput', { name: 'sos.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('mls_sos'))).not.toBeNull();
};
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mls_sos') || '{}'));
const box = (page, team, pos) => page.locator(`#sos_${team}_${pos}`);

test('SoS upload keeps each value as written, in all three file shapes', async ({ page }) => {
    const state = await openApp(page, '/lineup/');

    // Team + Pos + SoS columns.
    await upload(page, [
        'Team,Pos,SOS',
        'KC,TE,4.5', 'WSH,QB,-2', 'BUF,QB,12', 'DAL,WR1,#7', 'SF,RB,3rd',
        'MIA,WR,3 out of 5 stars', 'NYJ,RB,easy',
    ].join('\n'));
    let sos = await saved(page);
    expect(sos.KC).toEqual({ TE: '4.5' });
    expect(sos.WAS).toEqual({ QB: '-2' });
    expect(sos.BUF).toEqual({ QB: '12' });
    expect(sos.DAL).toEqual({ WR: '7' });
    expect(sos.SF).toEqual({ RB: '3' });
    // No number, or several: nothing saved for that team and position.
    expect(sos.MIA).toEqual({});
    expect(sos.NYJ).toEqual({});
    await expect(box(page, 'KC', 'TE')).toHaveValue('4.5');
    await expect(box(page, 'WAS', 'QB')).toHaveValue('-2');

    // A team-by-position grid.
    await upload(page, ['Team,QB,RB,WR,TE', 'ARI,10.5,-1,8,'].join('\n'));
    sos = await saved(page);
    expect(sos.ARI).toEqual({ QB: '10.5', RB: '-1', WR: '8', TE: '' });
    await expect(box(page, 'ARI', 'QB')).toHaveValue('10.5');

    // Player + SoS, team and position from the (fixture) Sleeper player map.
    await upload(page, ['Player,ROS', "Ja'Marr Chase,6.5", 'George Kittle,-3'].join('\n'));
    sos = await saved(page);
    expect(sos.CIN).toEqual({ WR: '6.5' });
    expect(sos.SF).toEqual({ RB: '3', TE: '-3' });
    await expect(box(page, 'CIN', 'WR')).toHaveValue('6.5');

    await expectClean(page, state);
});
