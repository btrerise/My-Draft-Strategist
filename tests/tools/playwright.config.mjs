// Opt-in config for the computed-style comparison (refactor 4D). The default config in tests/
// matches *.spec.mjs only, so `npx playwright test` never runs the *.tool.mjs files here.
// Run with `npm run compare-css` from tests/ (see css-compare.tool.mjs for what it does).
import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
    testDir: '.',
    testMatch: /.*\.tool\.mjs$/,
    fullyParallel: true,
    workers: 4,
    reporter: [['list']],
    timeout: 300_000,
    use: { baseURL: `http://localhost:${PORT}` },
    projects: [
        { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
        { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    ],
    webServer: {
        command: `node ../serve.mjs`,
        env: { PORT: String(PORT) },
        url: `http://localhost:${PORT}/index.html`,
        reuseExistingServer: true,
    },
});
