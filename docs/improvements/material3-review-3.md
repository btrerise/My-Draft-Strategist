# Material 3 Expressive: a third review, against the sources (improvements M18, 2026-11-16)

The owner asked for a review of all three pages against Material 3 **Expressive**, from sources that can be read (not
m3.material.io, which needs JavaScript), and a check of the values earlier cards took from Material (M2, M3, S16/S18,
S26, M17 and the open M cards). Then: "Build and/or fold-in all numbers, please. This includes fixes to past choices
I've made." This file is the review and, for each finding, either what M18 built or the card it's folded into, **with
the values that card must use**. Where a card's text (on the runbook) and this file disagree, this file wins.

## Sources, in order of authority

1. **material-web `labs/gb/`** (Google's web components and CSS tokens, Expressive labs), with the token values in
   `tokens/versions/latest/sass/` (`_md-sys-motion.scss`, `_md-sys-shape.scss`, `_md-sys-state.scss`,
   `_md-sys-state-focus-indicator.scss`, `_md-sys-typescale.scss`). Cited as **[web]**.
2. **androidx Compose Material 3** `compose/material3/material3/src/commonMain/.../tokens/` (ExpressiveMotionTokens,
   MotionTokens, ShapeTokens, Button*Tokens, SwitchTokens, Snackbar/LinearProgressIndicator/LoadingIndicatorTokens) and
   `compose/material3/adaptive/` (PaneScaffoldDirective). Cited as **[Compose]**.
3. **skydashnet/material-design-3-ui-skill** (SKILL.md and its 13 references) for when and how much. Cited as **[skill]**.
4. Measurements of the site with the fixture data at 375 and 1280px (contrast, text sizes, line length, overflow).
   Cited as **[measured]**.

How to fetch them again (sparse clones):

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/material-components/material-web.git
cd material-web && git sparse-checkout set labs/gb docs tokens/versions/latest && cd ..
git clone --depth 1 --filter=blob:none --sparse https://github.com/androidx/androidx.git
cd androidx && git sparse-checkout set compose/material3/material3/src/commonMain compose/material3/material3/samples compose/material3/adaptive && cd ..
git clone --depth 1 https://github.com/skydashnet/material-design-3-ui-skill.git
```

## Motion: the springs, and why linear()

Compose's Expressive scheme is springs (ExpressiveMotionTokens). Simulated (start 0, end 1, no initial velocity):

| Token | Damping | Stiffness | Overshoot | Settles (0.2%) | M3's earlier cubic-bezier, ms | Its max error |
| --- | --- | --- | --- | --- | --- | --- |
| spatial fast | 0.6 | 800 | 9.5% | 348 ms | (0.42, 1.67, 0.21, 0.90), 350 | 10% |
| spatial default | 0.8 | 380 | 1.5% | 412 ms | (0.38, 1.21, 0.22, 1.00), 500 | 7% |
| spatial slow | 0.8 | 200 | 1.5% | 567 ms | (0.39, 1.29, 0.35, 0.98), 650 | 8% |
| effects fast | 1.0 | 3800 | none | 137 ms | (0.31, 0.94, 0.34, 1.00), 150 | 7% |
| effects default | 1.0 | 1600 | none | 212 ms | (0.34, 0.80, 0.34, 1.00), 200 | 6% |
| effects slow | 1.0 | 800 | none | 299 ms | (0.34, 0.88, 0.34, 1.00), 300 | 6% |

The béziers M3's card listed have the right peak and length but can't follow a spring's shape. labs/gb already
writes the fast spatial spring as a `linear()` easing (`components/buttongroup/_button-group-tokens.scss`), and sampling
the spring above reproduces it to 0.002. So the tokens are `linear()` easings sampled from the springs, with the béziers
kept as the fallback for browsers without `linear()` (Safari before 17.2). material-web's *system* spring tokens are the
**standard** scheme (0.9 damping), not Expressive; Compose's `MotionScheme.expressive()` is the source for Expressive.

Use: spatial for what moves or changes size or shape (fast for small things, default for most, slow for whole screens);
effects for colour and opacity. Things that enter or leave past the screen's edge (drawers, sheets, the expanded rail)
keep Material's emphasized decelerate (enter, 400 ms) and accelerate (exit, 200 ms): a spring's overshoot would open a
gap at the edge.

## Earlier cards checked

| Card | Value | Verdict | Now |
| --- | --- | --- | --- |
| M2 (merged) | State layer 8% hover, 10% press | Exact [web, Compose] | kept |
| M2 | Press morph `cubic-bezier(0.42, 1.67, 0.21, 0.90)` 350 ms | Exact: labs' pressed-button curve [web] | the fast spatial token (M18) |
| M2 | Focus ring 2px, 2px gap | Material's focus indicator is 3px, 2px outside, 3px inside [web] | 3px (M18) |
| M2 | Pressed corners 6 → 4px | Expressive's small square button: 12 → 8px (Compose ButtonSmallTokens, labs button) | M14 (below) |
| M2 | State-layer fade 150 ms both ways | labs' ripple: hover 15 ms, press 100 ms in, 375 ms out [web] | 15 / 100 ms (M18) |
| M3 (open) | Six béziers | Approximations (table above) | linear() tokens (M18) |
| M3 | Toast entrance: fast spatial overshoot | labs' snackbar: grows from its bottom edge, 150 ms legacy decelerate; leaves with a 75 ms fade [web] | built (M18) |
| M3 | View transitions on spatial default | Fades are effects (300 ms at most); only movement is spatial [Compose] | built (M18) |
| M3 | Progress bar 4px, rounded ends | Right; Expressive adds a 4px gap between bar and track and a 4px stop dot; loading indicator 38px in a 48px container [Compose] | M3 (below) |
| S16 / S18 | `cubic-bezier(0.2, 0, 0, 1)` | Material's standard = emphasized [web] | replaced by the springs (M18) |
| S16 / S18 | 275 / 375 / 500 ms | Not Material durations; 500 ms is long for a fade | slides 500 ms spatial default, fades 300 ms effects slow (M18) |
| S26 (merged) | Emphasized decelerate / accelerate, 96px rail, 64px bar | Exact [web, Compose] | on the tokens (M18) |
| S26 | Marker 500 ms (wider) | labs' bar and rail move the indicator in 200 ms, emphasized [web] | 200 ms (M18) |
| M17 (merged) | 16px compact margins, rows edge to edge, 599.98px | Right [skill, Compose] | kept |
| M4 (open) | Switch 52×32, handle 16 / 24 / 28px; group 40px | Exact [Compose, web] | M4 adds the group's 2px gap and inner corners (below) |
| M7 (open) | 11px floor; 12, 14, 16, 22, 24, 28, 32 | Exact (md.sys.typescale) [web] | kept |
| M12 (open) | Two panes from 1200px, side pane "about a third" | Source: 2 panes from 840 with a 24px gap and a 360px pane; 3 panes and 412px from 1200 [Compose] | M12 (below) |
| M15 (open) | Expanded rail from 1600px | Extra-large window class [Compose] | kept |

## Findings: built in M18

| # | Finding | What M18 did |
| --- | --- | --- |
| 3 | Toasts covered open dialogs (z-index 9999 against 2000) | z-index 1900; a toast that arrives while a dialog or sheet (`aria-modal="true"`) is open waits until it closes |
| 4 | `max-width: 600px` and `min-width: 600px` both applied at exactly 600px; 767/768 isn't a Material window size | 599.98 / 839.98 / 840; `tests/unit/motionTokens.test.mjs` allows only 600, 840 and four content tweaks (480, 520, 900, 1024) |
| 5, 7 | 51 bare `ease`, 31 Material 2 curves, a toast overshoot from outside Material | Motion tokens in `:root` (base.css, MOTION) and every transition and animation on them; the unit test fails on any literal curve or time |
| 6 | Focus ring 2px | 3px, 2px outside (inside rings 3px inset); text fields 2px on their border; `focus-ring.spec.mjs` checks both |
| 8 | Guide lines up to 143 characters at 1280px | `--reading-width: 70ch` on prose (Guides, setup steps, T-Score's Research, notes, About) |
| 13 | State layers 150 ms | Hover 15 ms, press 100 ms (labs' ripple); a release takes the hover's 15 ms (one layer) |
| 14 | The spinner turned under Reduce Motion | It fades softly instead |
| 15 | Marker 500 ms; view transitions off the scale | Marker 200 ms emphasized; slides 500 ms spatial default; fades 300 ms effects slow; the league name and chevrons fast spatial |
| (3) | Toast timing | Success 4s plus 1s per 40 characters, at most 8s; with an action 8s; an error until ✕ (M3's suggestions) |

## Findings: folded into cards (with the values each must use)

- **M3** (open; its toasts and motion are done here): only **progress and loading** remain. Determinate linear progress
  under Sync All, Import All and the Simulator: 4px track and bar, rounded (full) ends, **a 4px gap between the bar and
  the track, and a 4px stop dot at the track's end** (Compose LinearProgressIndicatorTokens). Loading indicator for waits
  of 200 ms to 5 s: a **38px** morphing shape in a **48px** container (LoadingIndicatorTokens), on the motion tokens;
  with Reduce Motion a still shape. Asks (1)–(5) are settled by M18; ask (6) stays.
- **M4**: the connected button group as M4 says, plus **2px between buttons** (ConnectedButtonGroupSmallTokens
  BetweenSpace), **inner corners 8px, 4px while pressed**, outer corners full (labs button-group tokens), the pressed
  shape on `--press-morph`.
- **M6** (finding 1): measured on 2026-11-16, about 20 text styles under 4.5:1 at both widths: the tier labels Elite
  3.67, High-End Starter 3.86, Boom/Bust 3.97; injury badges 3.92; Stack 2.80; DEF in rust 3.18; the rank-move chips 3.26
  (Up) and 4.36 (Down); LIVE 3.97; Danger Zone 4.22; Read Methodology 4.01. (Gradient-text slot labels read 1.00 in an
  automated check; they're false positives.)
- **M7 / M8** (finding 2): 189 labels at 9.28px on the Draft Board, the Roster's position counts at 9.6px, about 130
  badges at 10.4px; 27 rendered sizes. Floor 11px (Label Small); the scale as M7 lists.
- **M9** (finding 9): two filled buttons of different colours side by side (Sync All blue and Optimize All green on
  phones; Optimize green, Copy, PNG purple on desktop). One filled primary per group; the rest tonal or outlined.
- **M10** (finding 16): one or two hero moments, and Expressive's emphasized type (md.sys.typescale emphasized) only
  there.
- **M12 / M13** (finding 8): two panes from **1200px** (840 leaves 744px beside the rail, too little for two 360px panes;
  note it as the reason), the side pane **360px** (412px from 1600px), a **24px** gap (PaneScaffoldDirective). Prose
  keeps M18's reading width.
- **M14** (findings 10, 17, and M2's pressed corners): corners on Material's scale **4, 8, 12, 16, 20, 28, 32, 48,
  full** (md.sys.shape); today 26 values. Buttons: square small buttons **12px, 8px while pressed** (or 8 → 4 if the
  owner keeps buttons squarer; say which). Snackbar 4px (corner extra-small) only if the owner wants Material's shape
  over the site's card. Colour: **every** colour onto tokens, not only surfaces (about 286 hex and 280 rgba values sit
  outside `:root` today), so a light theme is a token swap. Fewer shadows (87 `box-shadow` rules); tonal surfaces carry
  the hierarchy, shadows only where something overlaps.
- **New card, after M14: a light theme** (finding 11; the owner chose to build it). `prefers-color-scheme: light`
  gives a light set of M14's tokens (Material's light roles, the site's green as primary), a switch in Settings (S45)
  for Light / Dark / System, `color-scheme` and `theme-color` following it, contrast checked in both (M6's check), the
  export images and the screenshots in both themes (a second set of baselines, or the light theme at one width). Needs
  M14's colour tokens first.

## Self-audit (skydashnet's 8 categories, 0–2)

| Category | Before M18 | After M18 | After the folded cards |
| --- | --- | --- | --- |
| Task clarity | 1 | 1 | 2 |
| Information hierarchy | 1 | 1 | 2 |
| Component semantics | 1 | 1 (toasts are snackbars) | 2 |
| Token discipline | 0 | 1 (motion and breakpoints) | 2 |
| Adaptive behavior | 1 | 1 (reading width; panes still to come) | 2 |
| States & feedback | 1 | 1 (snackbars; progress bars still to come) | 2 |
| Accessibility | 1 | 1 (focus ring; contrast and type still open) | 2 |
| Expressive restraint | 1 | 1 | 2 with M10 |
| **Total** | **7 / 16** | **8 / 16** | **16 / 16** (projected) |
