# TYPOMAN Round 5: Art Director (Kinetic Type)

**Snapshot:** HEAD `9c89f08` plus the uncommitted Round 5 working tree —
41 registered presets, 16 templates, and modified `js/boot.js`,
`js/engine/path.js`, `js/engine/renderer.js`, `js/presets/cylinder.js`,
`js/presets/path-draw.js`, `js/presets/path-flow.js`,
`js/studio/export-dialog.js`, `js/studio/share-dialog.js`,
`js/templates/templates.js`, `tests/studio.mjs`, plus untracked
`js/presets/spiral.js` and the Round 5 notes/tests. This judge is
read-only except for this file: no code was edited, committed or pushed.

| MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---|---|---|---|---|---|---|---|
| 8.5 | 8.5 | 8.0 (prov.) | 8.5 | 8.5 | 8.5 (prov.) | 8.0 | 8.0 | **8.3** |

Mean of the eight bands = 66.5 / 8 = 8.3125, reported as 8.3.
Round 4 jury median was 8.1 (MC 8.0, TQ 8.0, PC 8.0, CR 8.5, EE 8.5,
UX 8.0, PR 7.5, EQ 8.0). Round 5 therefore moves the needle by about
+0.2, driven by Motion Craft, Typographic Quality, Studio UX and
Performance & Robustness — and it does **not** reach 9. The fixes are
real, but they are partial, and the largest structural gaps (a real
path/timing editor, font-true evidence, and a safety hole in long-loop
flash analysis) are untouched. Nothing below is taken on trust from
the Round 5 notes: every claimed fix was checked against its diff,
and the cylinder flash fix was re-measured independently.

**Lens:** Motion Craft, Typographic Quality and Creative Range are
weighted most; all eight criteria are scored from evidence.

## Method and environment limits — read before trusting any band

- **Code read:** the diffs for `path-flow.js`, `path-draw.js`,
  `cylinder.js`, `templates.js` (glitch-drop and title-window),
  `share-dialog.js` and `export-dialog.js`, the untracked `spiral.js`,
  and all seven Round 5 notes. The `templates.js` diff still contains
  pre-existing uncommitted Round 4 additions; only the two Round 5
  template items were credited here.
- **Syntax:** `node --check` passes on all eight files named in the
  brief (`path-flow.js`, `path-draw.js`, `spiral.js`, `cylinder.js`,
  `templates.js`, `share-dialog.js`, `export-dialog.js`,
  `tests/studio.mjs`).
- **Independent re-measurement (this judge):**
  `ASPECTS=16:9,9:16,1:1 node tests/flashes-a.mjs cylinder` — every
  cylinder look at every aspect is ≤ 2/s general, 0/s red:
  Neon Drum 1/0/0, Paper Column 2/1/2, Gold Ring 1/0/2.
  The command still exits non-zero, but only on 8 Google Fonts
  console errors (see below). This confirms the two cylinder fixes
  on the same tool that reported the failures.
- **Independent smoke spot-check (this judge, after the cylinder
  re-run):** `node tests/smoke.mjs` confirms
  "starter templates: ok (16 build, render deterministically,
  flash-safe, take the user's text)" and catalogue fonts 0/60 load
  in this sandbox — matching the parent's smoke figure exactly.
- **Adopted, not re-run in full:** the parent's verified figures —
  studio 74 passed / 3 font-console failures;
  sweep 602 configurations, 0 render / 0 determinism / 0 seam failures
  (verdict FAIL only on font console errors); full flashes-a, all 176
  configurations ≤ 3/s, failing only on 54 font console errors. These
  are consistent with the cylinder and smoke re-runs above and with
  the Round 5 notes' own tables; re-running the whole sweep/flash
  suites would not have changed any band, because their only
  failures are the sandbox font limit.
- **Google Fonts do NOT load in this sandbox**
  (`ERR_TUNNEL_CONNECTION_FAILED`; 0/60 catalogue fonts in smoke).
  Every browser measurement in this round ran on fallback fonts.
  This is an environment limit, **not a product bug**, and it is not
  scored against the product. It does cap the evidence: variable-axis
  behaviour (Axis Drift weight breathing, width axis, true italics),
  the exact look of Monoton / Big Shoulders Display on the cylinder
  fixes, and every font-dependent flash rate are **unverified on real
  fonts, not disproven and not confirmed**. No font-true contact sheet
  is claimed.
- **Not hand-tested:** the studio editor by mouse/keyboard, and no
  keyboard/accessibility audit was run. PC and UX are therefore marked
  provisional, as in Rounds 3–4.
- **A note on attribution:** several Round 5 notes describe work that
  was already in the tree when their agent started (e.g. the Round 4
  template additions in `templates.js`). Credit here goes only to the
  Round 5 changes themselves, as listed per band below.

## What Round 5 actually fixed — verified, not assumed

1. **Path Flow, Fill mode, closed lanes** (`path-flow.js`): the
   `fit = min(1, lane.length / unit)` scaling of glyph sizes and
   advances is in the diff, Fill-only, with open paths deliberately
   untouched. The Star pile — the single most visible Round 4 flaw —
   is fixed in the mode it was reported in.
2. **Draw On** (`path-draw.js`): the rounded carrier lane
   (`path.rounded(R, R, { limit: capH × 2.85 }).lane(-up)`, with
   `R = |up| + 0.7 × capH`) and the vertical Frame clamp
   (`upClamped`, headroom 0.6 × capH) are both in the diff, and are
   used consistently in the fit pass and the render loop. The
   reported 13 → 5 adjacent overlaps is a genuine improvement, not a
   metric change: heart and star clear entirely.
3. **Spiral** (`spiral.js`, untracked): the centre guards are in the
   code — inner radius grows 0.08 → 0.28 with compression, and glyphs
   scale by the same factor as their advances (`glyphScale: k`), so
   advance/width ratio is preserved. Short text is continuous at
   k = 1, so it is unchanged by construction.
4. **Cylinder flash** (`cylinder.js`, two one-line param changes):
   Neon Drum gains `spin: 'smooth'` (4 → 1/s at 16:9, re-measured
   1/0/0 here); Paper Column moves to stops 6, `perspective: 0`,
   `shade: 1` (3.5 → 2/s at 1:1, re-measured 2/1/2 across aspects).
   No detector, preset mechanism or other look was touched. The
   Paper Column trade is real and disclosed: the drum reads flatter
   (no perspective swell) and its back faces are fainter.
5. **Templates** (`templates.js`): glitch-drop's glitch layer rate
   8 → 6 (3.5 → 1/s on `TM.Safety`, so the "(flash-safe)" description
   is now true); title-window's Inside layer gains `role: 'headline'`,
   so `build(id, { text })` replaces the CINEMA grid instead of
   leaking it. Default text is unchanged in both cases.
6. **Sharing** (`share-dialog.js`): hover trigger, scroll scrub
   (including the iframe postMessage script, since `embed.html` has
   no scrub URL flag) and per-layer page text (6 layers, blank =
   keep scene text, values escaped/encoded, overrides reset on
   reopen) are in the diff. These features already worked in
   `player.js` / `embed.html`; Round 5 makes them discoverable.
   That is a UX gain, not a new embed route.
7. **Export flash gate** (`export-dialog.js`): over 3/s, Export is
   disabled until an explicit confirmation switch naming the
   measured rate is checked; the gate is re-checked in `start()`,
   clears on edit/reopen, and safe exports are unchanged. The
   studio test was updated gate-aware (+15 lines, export section
   only), which is why studio now reads 74 passed / 3 font failures
   instead of timing out on its deliberately over-limit (8/s) scene.
8. **CI guardrails** (`test.yml`, new tests): flashes-a is now a CI
   job, plus the long-loop flash test and a 1080p frame-cost budget
   test (57/57 within a 200 ms median guardrail). The guardrails are
   real, but see PR below for how loose the budget is — and neither
   new CI job has ever run on GitHub Actions.

## 1. Motion Craft — 8.5 (was 8.0)

**Evidence.** The three path-motion fixes above are the round's
strongest motion work: Star no longer piles, Draw On corners turn
gradually instead of snapping ~90° between neighbours, Spiral's
centre is a readable spiral instead of a knot, and the cylinder
retimings keep each look's identity (same turn, same ratchet
character) while removing the whip/jump that drove the flashes.
All 176 flash configurations and all 602 sweep configurations pass
on render/determinism/seam, so nothing in the round broke a loop.

**Against (and why not 9).** Draw On still has 5 residual corner
touches (zigzag 2, lissajous 2, frame 1) — touches, not pile-ups,
but visible on tall type at acute vertices, and larger carrier
radii were shown to trade them for other regressions, so this is a
local optimum, not a solution. The old ceilings are untouched: no
value-graph/timing editor, springs still over-normalised, Ink Pen
still reveals rather than writes, Floor Plane still nearly vanishes
on a single line, Phrase Morph mid-transition overlaps unmeasured.
A 9 needs motion you can shape, not just motion you can pick.

**What would move this up one point:** a timing editor (curves you
can see and shape), springs whose stiffness reads as frequency,
and Ink Pen that actually reveals along a stroke.

## 2. Typographic Quality — 8.5 (was 8.0)

**Evidence.** Four visible typographic defects are gone: the Star
pile, the Spiral knot (with proportions preserved — glyphs shrink
with their advances, not just their spacing), the Frame off-top
clipping (vertical, at full scale and with pop overshoot), and the
title-window CINEMA leak — the last one closing the Round 4
"no template can ever show a stranger's word" gap for the one
template that still broke it. No preset pads, truncates or replaces
user text in these fixes.

**Against (and why not 9).** The Draw On smoothing buys its result
by cutting corners: at a sharp point the text lane deviates from
the stroke by up to ~2.9 × capH, so the type no longer sits on the
line it appears to follow. Spiral at extreme length shrinks without
a floor — readable proportions, but eventually unreadably small,
and that floor/overflow policy is still an undecided product
question. The Stack descender dispute from Round 4 is still
unresolved in the notes (art-director: ink-measured and fixed;
motion-designer/rendering notes: cap-height block height) — the
path notes support the art-director reading for the default scene,
but extrude-on and real-font variants were never re-rendered.
OpenType on catalogue fonts is still thin (tnum/pnum/lnum only),
emoji still render as grey squares in Particles, Wave amplitude
and Kinetic Grid word-breaking are still present, and — decisively
for a 9 — every type judgement here is on fallback fonts.

**What would move this up one point:** a font-true visual pass
once fonts load, real OpenType coverage, colour emoji handling,
and a decided Spiral minimum-size/overflow policy.

## 3. Path Control — 8.0, provisional (was 8.0)

**Evidence.** Fill-mode fit is the right fix in the right place
(lane length *is* text capacity on a tracked lane), Draw On's
carrier + vertical clamp is a real, measured improvement, and the
sweep shows no render/determinism/seam failure on any path preset.

**Against (and why not higher).** This is the band where Round 5
most clearly stops short. Draw On residuals remain (5); Path Flow
Travel/Still on a closed lane still wraps and piles, because the
fit is Fill-only; Draw On left/right clipping on Frame is
unclamped (vertical only, by an explicit design decision that has
not been made); folds straddling a closed path's seam are still
untrimmed in `offset()` (engine scope). And the editor itself —
the thing a 9-band path tool needs — is unchanged: still no
direct-manipulation bézier editor (anchors, handles, add/delete
points), no freehand drawing, no path morphing with numeric
control, and it was not hand-tested here, hence provisional.

**What would move this up one point:** extend the fit to
Travel/Still, finish Draw On (residuals + horizontal clamp), and
ship a real bézier editor with undo.

## 4. Creative Range & Originality — 8.5 (was 8.5)

**Evidence.** The library is still 41 presets / 16 templates, and
Round 5's fixes unlock existing looks rather than adding new ones:
both cylinder looks are now safe at all three aspects, glitch-drop
is now actually flash-safe, and title-window is now safe to hand a
user's word. The share dialog's surfaced features (hover, scrub,
per-page text) extend what a published scene can *do*, which is a
genuine, if modest, creative gain.

**Against (and why not 9).** No new preset, template, remix path or
combinable-effects system arrived in this round — the brief's
"more presets / more creative" is not what Round 5 delivered, and
this band should not be credited for work it did not do. Long-text
fragility persists at the edges (Spiral's no-floor shrink,
orbit-badge core crowding, kaleido-window densifying), and there is
still no signature identity beyond the catalogue itself.

**What would move this up one point:** a remix/discover path
(one-click surprising recombinations), combinable effects, and
fit-sizing for the long-text edge cases.

## 5. Export & Embed — 8.5 (was 8.5)

**Evidence.** The export gate is the round's best safety change:
over-limit exports can no longer slip through silently — they are
blocked behind a confirmation that names the measured rate, with a
safe alternative spelled out, and the gate cannot be bypassed by a
stale check because `start()` re-measures. Share surfacing (§6
above) closes the discoverability gap for hover/scrub/per-page
text without changing scene JSON or embed URL formats.

**Against (and why not 9).** The gate is confirm-to-export, not a
hard block: one click still exports an 8/s scene, so the
"warn-only" Round 3 bug is softened, not closed. Two holes sit
underneath it: the glitch preset's own `flashes()` estimate returns
0 for a layer `TM.Safety` measures at 3.5/s, so any surface trusting
the estimate still misses this class; and long-loop flash analysis
is still capped at 900 frames (see PR), so a > 900-frame loop's
safety above 7.5 Hz is unverified at the moment of export. There is
still no iframe/web-component route for uploaded fonts (the dialog
correctly warns, but the gap is unchanged), and no new export
format, resolution or frame-accurate offline render path.

**What would move this up one point:** full-rate sliced flash
analysis for long loops, a fixed glitch estimate, an uploaded-font
embed route, and a frame-accurate offline render verified against
preview.

## 6. Studio UX & Visual Design — 8.5, provisional (was 8.0)

**Evidence.** Two real UX gains: the share dialog now offers what
the player already supported (with honest notes — extras apply to
iframe/web-component codes only, preview does not scroll-scrub),
and the export gate explains itself in plain language (rate named
twice, safe alternative offered, confirmation scoped to one scene
and cleared on edit/reopen). The studio suite's gate-aware update
means the suite now exercises the gate instead of crashing on it.

**Against (and why not 9).** The known blemishes are untouched:
Spring-tab commit-at-once with no Esc revert, blank track matte
with no hint, no per-preset guidance when a look degrades (Spiral
at extreme length, Paper Column's flattened depth, single-line
Floor Plane). The gate's uncheck-reblocks and close/reopen-clear
paths are verified in-browser by the safety agent but are not in
`tests/studio.mjs`; hover + scrub together are not spelled out
(scrub effectively wins on the component). No keyboard/focus/
contrast audit was run, hence provisional.

**What would move this up one point:** fix the Spring-tab commit
and blank-matte hint, add degradation guidance per preset, and
complete a keyboard/focus/contrast audit.

## 7. Performance & Robustness — 8.0 (was 7.5)

**Evidence.** The sweep is clean where it counts: 602
configurations, 0 render errors, 0 determinism failures, 0 seam
failures. Full flashes-a is clean on flash: all 176 configurations
≤ 3/s. The new 200 ms frame-cost guardrail passes 57/57 (worst
glitch-drop 132.35 ms median, worst preset ~23.65 ms), and
flashes-a + long-loop tests are now in CI, so these measurements
can no longer silently regress.

**Against (and why not 9).** The 200 ms budget is a guardrail, not
a performance claim: it fails only below 5 fps, and glitch-drop at
~132 ms is ~7.5 fps at 1080p on this raster — the stock template
that is also the heaviest is not "fast" by any 60 fps reading, and
template medians move materially between runs here. And the round
pins, but does not fix, its most serious robustness bug: long-loop
flash aliasing. A 60 s loop at 60 fps is analysed at 900/60 = 15
fps (Nyquist 7.5 Hz), so a 15 Hz strobe reports **0/s and passes**
— a strobe five times the WCAG limit clearing the safety check.
Until analysis is done in full-rate slices, any loop over ~15 s
at 60 fps has unverified flash safety above 7.5 Hz, and that alone
caps this band. Mutation catch (8/23) and the other Round 3/4
robustness gaps (Gravity re-simulation, Deep Space `_adapt`
timing, no-mutation-contract guard) are unchanged.

**What would move this up one point:** full-rate sliced long-loop
analysis, a split preset/template frame budget calibrated on real
hardware, and a glitch-drop cost pass.

## 8. Engineering Quality — 8.0 (was 8.0)

**Evidence.** Round 5's own engineering is disciplined: changes
are scoped to the files each agent claimed, commented with their
reasoning and limits (including rejected candidates — the Paper
Column sweep table, the Draw On radius trade-off, the budget
calibration from 100 ms to 200 ms), no detector or threshold was
weakened to make a test pass, and the new tests (long-loop, frame
budget, gate-aware studio section) test behaviour rather than
implementation. The sweep "22 problems" confusion is resolved by
documentation: 22 console-error problem entries, 0 seam problems —
the verdict was misreadable, not wrong, and it was left alone
rather than cosmetically fixed.

**Against (and why not 9).** The codebase-wide hygiene gaps are
untouched: `SEPARATORS` still copied across presets, `stack.js`
still reaches the private `f._font`, the no-mutation contract
behind the renderer token optimisation is still unenforced, and
mutation catch is still 8/23. The tree itself is uncommitted and
dirty across agents, with Round 4 additions still mixed into the
`templates.js` diff — a reviewer cannot cleanly attribute this
round from `git diff` alone. And the long-loop test, by design,
exits 0 on the aliased case: it pins the bug, but a future reader
can misread a green test as a clean bill of health.

**What would move this up one point:** deduplicate the shared
preset helpers, remove the private-field reach, enforce the
no-mutation contract (or test it), and land the round in clean,
attributable commits.

## Round 4 blockers re-checked (current tree)

| Round 4 blocker | Status now |
|---|---|
| Path Flow Star pile | **Fixed in Fill mode**; Travel/Still still pile |
| Draw On corner overlaps / Frame off-top | **Improved** — 13 → 5 overlaps, vertical Frame clamp; horizontal clipping open |
| Spiral centre crowding | **Fixed for the measured 119-char case**; no floor at extreme length |
| title-window CINEMA leak | **Fixed** (Inside is now a headline layer) |
| glitch-drop 3.5/s despite "(flash-safe)" | **Fixed** (rate 6 → 1/s) |
| Cylinder Neon Drum 4/s | **Fixed** (spin smooth → 1/s, re-measured) |
| Cylinder Paper Column 3.5/s at 1:1 | **Fixed** (stops 6, perspective 0, shade 1 → 2/s, re-measured) |
| Export warn-only above 3/s | **Softened, not closed** — blocked behind explicit confirmation |
| flashes-a not in CI | **Fixed** (flash job added; never yet run on GA) |
| Long-loop 900-frame cap | **Pinned in CI, not fixed** — 15 Hz strobe still passes at 0/s |
| No 1080p frame budget in CI | **Fixed as a 200 ms guardrail** (loose; split budgets still needed) |
| Share dialog hides hover/scrub/page text | **Fixed** (surfaced; no new embed route) |
| Studio test crashes on the gate | **Fixed** (gate-aware export section; 74/3) |
| Real-font verification | **Still outstanding** — all evidence fallback-font only |
| Uploaded-font embed route | **Still missing** (dialog warns) |
| Stack descender dispute | **Unresolved** — needs extrude/real-font re-render |
| Bézier / timing editor, remix, OpenType, emoji | **Untouched** |

## To reach 9/10 (ranked)

1. **Close the safety hole and prove it on real fonts.** Analyse
   long loops in full-rate slices so a 15 Hz strobe cannot pass at
   0/s, then run the flash + frame-budget jobs on GitHub Actions
   with fonts that actually load and re-measure Neon Drum, Paper
   Column, glitch-drop and Axis Drift. Until then every flash and
   type claim in this round carries a fallback-font asterisk, and
   EE/PR cannot credibly reach 9.
2. **Finish path typography and path control.** Clear the 5 Draw
   On residuals, extend the Path Flow fit to Travel/Still, decide
   the Frame horizontal clamp, and ship a real bézier editor (with
   a timing/curve editor alongside it). This is the single largest
   remaining visible flaw set, and it blocks PC and MC at 9.
3. **Turn a broad catalogue into a resilient creative tool.**
   Add a remix/discover path and combinable effects, decide
   Spiral's minimum-size/overflow policy and fit-size the
   long-text edge cases, resolve the Stack dispute on a real font,
   fix the glitch `flashes()` estimate, and add an uploaded-font
   embed route. Until then the range is broad but brittle at the
   edges — which is exactly what keeps CR, TQ and EE at 8.5.
