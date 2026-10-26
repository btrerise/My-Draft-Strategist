// Which Chromium the tests launch (improvements S23). Normally the one this Playwright version installs
// (revision 1194 for 1.56.1; CI installs it). Claude Code cloud images preinstall Chromium under
// /opt/pw-browsers, and since 2026-10 theirs (revision 1243, Chromium 153) has been ahead of the pin, so the
// pinned build isn't there and every launch failed with "Executable doesn't exist". Then this falls back to
// the preinstalled one (its headless shell, as Playwright and CI use). Specs and features run on it; the screenshots can't match it (render-env.mjs says so
// in one message), so a session compares main and its branch instead ("When your machine can't reproduce the
// baselines" in docs/TESTING.md).
import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const PREINSTALLED = '/opt/pw-browsers';
export const PREINSTALLED_CHROMIUM = `${PREINSTALLED}/chromium`;

// The newest preinstalled headless shell (chromium_headless_shell-<revision>), which is what Playwright launches for
// headless runs, CI's included; full Chrome draws a few glyphs differently, so it's the second choice.
function preinstalledHeadlessShell() {
    let dirs = [];
    try { dirs = readdirSync(PREINSTALLED).filter(d => /^chromium_headless_shell-\d+$/.test(d)); } catch { return null; }
    dirs.sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) {
        const exe = `${PREINSTALLED}/${d}/chrome-headless-shell-linux64/chrome-headless-shell`;
        if (existsSync(exe)) return exe;
    }
    return null;
}

/** The executable to use instead of the pinned build, or null when the pinned build is installed. */
export function fallbackChromium() {
    let pinned = '';
    try { pinned = chromium.executablePath(); } catch { /* no registry entry: treat as missing */ }
    if (pinned && existsSync(pinned)) return null;
    return preinstalledHeadlessShell() || (existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : null);
}

/** launchOptions for a config or test.use(): { executablePath } when falling back, else {}. */
export function chromiumLaunchOptions() {
    const exe = fallbackChromium();
    return exe ? { executablePath: exe } : {};
}

/** "153.0.8010.12" for the fallback browser (from its --version), or null when the pinned build is used. */
export function fallbackChromiumVersion() {
    const exe = fallbackChromium();
    if (!exe) return null;
    try {
        const out = execFileSync(exe, ['--version'], { encoding: 'utf8', timeout: 10_000 });
        return (out.match(/\d+\.\d+\.\d+\.\d+/) || [out.trim()])[0];
    } catch {
        return 'unknown';
    }
}
