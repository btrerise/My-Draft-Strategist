// Draft Strategist's rankings upload preview (refactor chunk 8C). A file or a paste opens the
// preview and loads nothing until "Looks Good, Save It" (or "Replace Rankings", when a pool is
// already loaded and Aggregate is off); Cancel or Escape leaves the pool as it was. The owner's
// decisions are in docs/refactor/LOG.md (8C): the paste box goes through the preview too, the
// unmatched names are the rows the import couldn't link to a Sleeper player, and a file with no
// positions gets a blue note. Quick-Start skips the preview (mds-sync.spec.mjs covers it).
import { test, expect } from '@playwright/test';
import { openApp, expectClean, showTab, RANKINGS_CSV, confirmMdsPreview } from './helpers.mjs';

const toast = (page, text) => page.locator('.toast-message').filter({ hasText: text });
const overlay = page => page.locator('#rankingsPreviewOverlay');
const confirmBtn = page => page.locator('#rankingsPreviewConfirmBtn');
const csvFile = (csv, name = 'rankings.csv') => ({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) });

// Two names the fixture player map doesn't have, and no Pos column: every row is filed as FLEX.
const UNMATCHED_CSV = "Rank,Player,Team\n1,Ja'Marr Chase,CIN\n2,Zzyzx Nobody,NYJ\n3,Imaginary Runner,MIA\n";
// Row 3 opens a quote that never closes, so the rows after it are swallowed.
const QUOTE_CSV = "Rank,Player,Pos,Team\n1,Ja'Marr Chase,WR,CIN\n2,\"Bijan Robinson,RB,ATL\n3,Justin Jefferson,WR,MIN\n4,Jahmyr Gibbs,RB,DET\n";
const THREE_CSV = "Rank,Player,Pos,Team\n1,Bijan Robinson,RB,ATL\n2,Ja'Marr Chase,WR,CIN\n3,Jahmyr Gibbs,RB,DET\n";

/** The active draft's saved pool (names in order) and the saved rankings meta. */
async function saved(page) {
    return page.evaluate(() => {
        const active = localStorage.getItem('mds_active_draft_id');
        const pool = JSON.parse(localStorage.getItem('mds_players_' + active) || '[]');
        return { names: pool.map(p => p.name), meta: JSON.parse(localStorage.getItem('mds_meta') || 'null') };
    });
}

async function pasteRankings(page, csv) {
    await page.fill('#csvPasteArea', csv);
    await page.getByRole('button', { name: 'Process Pasted Data' }).click();
    await expect(overlay(page)).toBeVisible();
}

test.describe('Draft Strategist rankings upload preview', () => {
    test('a picked file shows the preview and loads only on Save', async ({ page }) => {
        const state = await openApp(page, '/');
        await page.setInputFiles('#fileInput', csvFile(RANKINGS_CSV));

        const preview = overlay(page);
        await expect(preview).toBeVisible();
        await expect(preview).toHaveAttribute('role', 'dialog');
        await expect(page.locator('#rankingsPreviewTitle')).toHaveText('Preview: Rankings');
        await expect(page.locator('#rankingsPreviewCount')).toHaveText('24 players parsed');
        const rows = page.locator('#rankingsPreviewList li');
        await expect(rows).toHaveCount(5);
        await expect(rows.first()).toHaveText("#1 Ja'Marr Chase WR1 · CIN");
        await expect(rows.nth(4)).toHaveText('#5 CeeDee Lamb WR3 · DAL');
        // Every fixture name matches a Sleeper player and the file has positions and no bad quotes.
        await expect(page.locator('#rankingsPreviewUnmatched')).toBeHidden();
        await expect(page.locator('#rankingsPreviewDerived')).toBeHidden();
        await expect(page.locator('#rankingsPreviewSkipped')).toBeHidden();
        // Nothing loaded yet: an empty pool, so saving just loads it.
        await expect(page.locator('#rankingsPreviewTarget')).toHaveText('Loads as your player pool.');
        await expect(page.locator('#rankingsPreviewTarget')).not.toHaveClass(/is-replace/);
        await expect(confirmBtn(page)).toHaveText('Looks Good, Save It');
        await expect(confirmBtn(page)).toHaveClass('btn btn-primary');
        await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused(); // focus trap
        expect((await saved(page)).names).toEqual([]);
        await expect(page.locator('#rankingsProcessingStatus')).toBeHidden();

        await confirmMdsPreview(page);
        await expect(toast(page, 'Loaded 24 players')).toBeVisible();
        await expect(page.locator('#rankingsSuccessMsg')).toBeVisible();
        const after = await saved(page);
        expect(after.names).toHaveLength(24);
        expect(after.names[0]).toBe("Ja'Marr Chase");
        expect(after.meta.count).toBe(24);
        // The picker is cleared, so picking the same file again fires 'change'.
        expect(await page.locator('#fileInput').evaluate(el => el.value)).toBe('');
        await expectClean(page, state);
    });

    test('Cancel and Escape leave the loaded pool untouched; replacing it is red', async ({ page }) => {
        const state = await openApp(page, '/');
        await pasteRankings(page, RANKINGS_CSV);
        await confirmMdsPreview(page);
        await expect(toast(page, 'Loaded 24 players')).toBeVisible();
        const before = await saved(page);
        const metaText = await page.locator('#metaDisplay').textContent();

        // A wrong file: the preview says it would replace the 24 players.
        await page.setInputFiles('#fileInput', csvFile(THREE_CSV, 'wrong.csv'));
        await expect(overlay(page)).toBeVisible();
        await expect(page.locator('#rankingsPreviewCount')).toHaveText('3 players parsed');
        await expect(page.locator('#rankingsPreviewTarget'))
            .toHaveText("Replaces your current rankings (24 players). This can't be undone.");
        await expect(page.locator('#rankingsPreviewTarget')).toHaveClass('preview-target is-replace');
        await expect(confirmBtn(page)).toHaveText('Replace Rankings');
        await expect(confirmBtn(page)).toHaveClass('btn btn-danger');

        // The page's hotkeys don't reach the page behind the preview ('2' opens the Tracker).
        await page.keyboard.press('2');
        await expect(page.locator('#setupTab')).toHaveClass(/\bactive\b/);

        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(overlay(page)).toBeHidden();
        expect(await saved(page)).toEqual(before);
        await expect(page.locator('#metaDisplay')).toHaveText(metaText);
        expect(await page.locator('#fileInput').evaluate(el => el.value)).toBe('');

        // Escape cancels too, and the same file can be picked again straight away.
        await page.setInputFiles('#fileInput', csvFile(THREE_CSV, 'wrong.csv'));
        await expect(overlay(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(overlay(page)).toBeHidden();
        expect(await saved(page)).toEqual(before);

        await expect(toast(page, 'Loaded 3 players')).toHaveCount(0);
        await expectClean(page, state);
    });

    test('the paste box goes through the preview; Cancel keeps the text, Save blends when Aggregate is on', async ({ page }) => {
        const state = await openApp(page, '/');
        await pasteRankings(page, RANKINGS_CSV);
        await confirmMdsPreview(page);
        await expect(toast(page, 'Loaded 24 players')).toBeVisible();
        const before = await saved(page);

        const pasteBtn = page.getByRole('button', { name: 'Process Pasted Data' });
        await pasteRankings(page, THREE_CSV);
        await expect(pasteBtn).toHaveText('Process Pasted Data'); // not left on "Processing…"
        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(overlay(page)).toBeHidden();
        await expect(pasteBtn).toBeFocused(); // focus goes back where it was
        await expect(page.locator('#csvPasteArea')).toHaveValue(THREE_CSV);
        expect(await saved(page)).toEqual(before);

        // Aggregate on, slider at 70% new: the preview says it blends, and Save blends.
        await page.locator('#aggregateToggle').check();
        await page.locator('#weightSlider').fill('70');
        await pasteBtn.click();
        await expect(overlay(page)).toBeVisible();
        await expect(page.locator('#rankingsPreviewTarget'))
            .toHaveText('Blends with your current rankings (24 players): 70% this file, 30% current.');
        await expect(page.locator('#rankingsPreviewTarget')).not.toHaveClass(/is-replace/);
        await expect(confirmBtn(page)).toHaveText('Looks Good, Save It');
        await confirmMdsPreview(page);
        await expect(toast(page, 'Loaded 24 players').last()).toBeVisible();
        const after = await saved(page);
        expect(after.names).toHaveLength(24);
        expect(after.names.slice(0, 2)).toEqual(['Bijan Robinson', "Ja'Marr Chase"]);
        await expectClean(page, state);
    });

    test('unmatched names, a file with no positions, and rows lost to a quote are listed before saving', async ({ page }) => {
        const state = await openApp(page, '/');
        await pasteRankings(page, UNMATCHED_CSV);
        await expect(page.locator('#rankingsPreviewCount')).toHaveText('3 players parsed');
        const unmatched = page.locator('#rankingsPreviewUnmatched');
        await expect(unmatched).toBeVisible();
        await expect(unmatched.locator('.preview-unmatched-title')).toHaveText("2 of 3 names didn't match a Sleeper player");
        await expect(unmatched.locator('.preview-unmatched-list')).toHaveText('Zzyzx Nobody and Imaginary Runner.');
        await expect(page.locator('#rankingsPreviewDerived')).toBeVisible();
        await expect(page.locator('#rankingsPreviewDerived .preview-derived-title')).toHaveText('No positions in this file');
        await expect(page.locator('#rankingsPreviewList li').first()).toHaveText("#1 Ja'Marr Chase FLEX1 · CIN");
        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(overlay(page)).toBeHidden();

        await pasteRankings(page, QUOTE_CSV);
        const skipped = page.locator('#rankingsPreviewSkipped');
        await expect(skipped).toBeVisible();
        await expect(skipped.locator('.preview-unmatched-title')).toHaveText(/^\d+ rows? lost$/);
        await expect(skipped.locator('.preview-unmatched-list')).toContainText('opens a quote (") that never closes');
        await expect(page.locator('#rankingsPreviewDerived')).toBeHidden();
        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(overlay(page)).toBeHidden();

        expect((await saved(page)).names).toEqual([]);
        await showTab(page, 'tracker'); // still an empty pool behind the cancelled previews
        await expectClean(page, state);
    });
});
