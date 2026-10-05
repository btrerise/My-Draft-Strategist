// The environment the Linux screenshot baselines (tests/baselines/linux/) were rendered in, and a check
// that the current one matches (refactor 10A). The screenshot check counts every changed pixel, and a
// different Chromium build or a different OS (other fallback fonts) re-renders text slightly. Without this
// check that shows up as all 40 screenshots failing at once; with it, visual.spec.mjs fails with one
// message that names what changed.
//
// Changing either on purpose (a Playwright upgrade in tests/package.json, or `runs-on` in
// .github/workflows/check.yml): update BASELINE_ENV below, re-take every baseline in the new environment
// (`npx playwright test visual.spec.mjs --update-snapshots=all`), check them by eye, and make sure CI and
// the cloud sessions agree before merging. See docs/TESTING.md, "Upgrading Playwright or the CI runner".
//
// `node render-env.mjs` (from tests/) prints both environments and exits 1 if they differ.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASELINE_ENV = {
    playwright: '1.56.1',        // @playwright/test; it decides the Chromium build
    chromiumRevision: '1194',    // Chromium 141.0.7390.37, the build in the cloud sessions' /opt/pw-browsers
    os: 'Ubuntu 24.04',          // the cloud sessions' image and CI's `runs-on: ubuntu-24.04`
};

const require = createRequire(import.meta.url);

function readOs() {
    try {
        const fields = Object.fromEntries(readFileSync('/etc/os-release', 'utf8').split('\n')
            .map((line) => line.match(/^(\w+)=(.*)$/)).filter(Boolean)
            .map(([, k, v]) => [k, v.replace(/^"|"$/g, '')]));
        return `${fields.NAME ?? fields.ID} ${fields.VERSION_ID ?? '?'}`;
    } catch {
        return 'unknown Linux';
    }
}

/** What this machine renders with. The Chromium revision is the one this Playwright version installs. */
export function currentRenderEnv() {
    const playwright = require('@playwright/test/package.json').version;
    // browsers.json isn't in playwright-core's "exports", so read it next to the package.json.
    const core = dirname(require.resolve('playwright-core/package.json'));
    const { browsers } = JSON.parse(readFileSync(join(core, 'browsers.json'), 'utf8'));
    const chromium = browsers.find((b) => b.name === 'chromium');
    return {
        playwright,
        chromiumRevision: chromium.revision,
        chromiumVersion: chromium.browserVersion,
        os: process.platform === 'linux' ? readOs() : process.platform,
        // Set on GitHub's hosted runners (for example 20250929.1). Shown, not checked: it changes weekly.
        runnerImage: process.env.ImageVersion,
    };
}

/**
 * Differences between this machine and BASELINE_ENV, as sentences; empty when they match. Only Linux is
 * checked: other platforms keep their own baselines (tests/baselines/<platform>/).
 */
export function renderEnvProblems(env = currentRenderEnv()) {
    if (process.platform !== 'linux') return [];
    return ['playwright', 'chromiumRevision', 'os']
        .filter((key) => env[key] !== BASELINE_ENV[key])
        .map((key) => `${key}: baselines were made with ${BASELINE_ENV[key]}, this run has ${env[key]}`);
}

export function describeRenderEnv(env = currentRenderEnv()) {
    return `Playwright ${env.playwright}, Chromium ${env.chromiumVersion} (revision ${env.chromiumRevision}), ${env.os}`
        + (env.runnerImage ? `, runner image ${env.runnerImage}` : '');
}

export function renderEnvError(problems) {
    return 'The screenshot baselines were rendered in a different environment, so every screenshot would '
        + 'differ by a few pixels:\n  ' + problems.join('\n  ')
        + '\nIf the change is intended, update BASELINE_ENV in tests/render-env.mjs and re-take the baselines '
        + '(docs/TESTING.md, "Upgrading Playwright or the CI runner"). Otherwise match the environment.';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const env = currentRenderEnv();
    const problems = renderEnvProblems(env);
    console.log(`baselines: Playwright ${BASELINE_ENV.playwright}, Chromium revision ${BASELINE_ENV.chromiumRevision}, ${BASELINE_ENV.os}`);
    console.log(`this run:  ${describeRenderEnv(env)}`);
    if (process.platform !== 'linux') console.log(`not checked on ${process.platform} (its baselines are separate)`);
    if (problems.length) {
        console.error(renderEnvError(problems));
        process.exit(1);
    }
}
