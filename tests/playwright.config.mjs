import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
    testDir: '.',
    testMatch: /.*\.spec\.mjs$/,
    fullyParallel: true,
    // CI also writes an HTML report, which .github/workflows/check.yml uploads when a test fails.
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
    timeout: 30_000,
    // Baselines are per platform: fallback fonts (Google Fonts is blocked in tests) render
    // differently on Linux and macOS. Claude Code cloud sessions run Linux.
    snapshotPathTemplate: '{testDir}/baselines/{platform}/{projectName}/{arg}{ext}',
    // Screenshot tolerance (owner's decision after refactor 0C, which made rendering repeatable): any colour
    // change counts (threshold 0), and at most 10 pixels may differ. pixelmatch still skips pixels it detects
    // as anti-aliasing. Was maxDiffPixelRatio 0.002 with the default threshold 0.2.
    expect: {
        toHaveScreenshot: { maxDiffPixels: 10, threshold: 0, animations: 'disabled', caret: 'hide', stylePath: './hide-transient.css' },
    },
    use: {
        baseURL: `http://localhost:${PORT}`,
        serviceWorkers: 'block',
        deviceScaleFactor: 1,
    },
    projects: [
        { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
        { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    ],
    webServer: {
        command: `node serve.mjs`,
        env: { PORT: String(PORT) },
        url: `http://localhost:${PORT}/index.html`,
        reuseExistingServer: true,
    },
});
