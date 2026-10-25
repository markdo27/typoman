# TYPOMAN Round 5: Creative Technologist

**Lens:** Performance & Robustness, Engineering Quality and Export & Embed
weighted most; all eight criteria scored from evidence, not from the
Round 5 notes. **Snapshot:** current working tree on top of `9c89f08`
(uncommitted Round 4 + Round 5 changes; see Method). No code was edited,
committed or pushed for this judging; this file is the only file written.
**Environment:** headless Chromium 141 via Playwright 1.56.1 (software
raster), Node in this sandbox. Google Fonts fail here, exactly as in
Round 4 — see Method. That limit is stated, not scored as a product bug.

| MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---|---|---|---|---|---|---|---|
| 8.0 | 7.5 | 8.0 | 8.0 | 8.5 | 8.0 | 8.0 | 8.5 | **8.0 (mean 8.06)** |

Round 4 (this lens): MC 7.5, TQ 7.5, PC 7.5, CR 8.0, EE 8.5, UX 7.5,
PR 7.5, EQ 8.0, mean 7.75. Net movement is +0.31: Motion Craft, Path
Control, Studio UX, Performance & Robustness and Engineering Quality
each rise 0.5 on verified Round 5 fixes; Typographic Quality, Creative
Range and Export & Embed are held. Nothing in Round 5 is a regression
this judge could attribute to the new work — but Round 5 is a
fix-and-verify round, not a 9/10 round, because its single largest
safety finding is documented rather than fixed, its flash fixes are
fallback-font only, and its path fixes leave measured residuals.

## Method and environment limits — read before the scores

- **Font evidence is limited by the sandbox, and is NOT scored as a
  product bug.** Google Fonts fail to load here
  (`ERR_TUNNEL_CONNECTION_FAILED`): smoke reports 0/60 catalogue fonts
  in the Round 5 notes, and every browser check below ran on fallback
  fonts. That means true-italic rendering, the width axis, Axis Drift's
  weight breathing (which collapses to a scale pulse on a non-variable
  fallback), and — critically for this round — the cylinder flash rates
  are **unverified on real fonts, not disproven and not confirmed**.
  Monoton and Big Shoulders Display are exactly the faces whose real
  glyph widths change the drum radius and the repeated-pattern angular
  period that the Paper Column fix is sensitive to. Any claim that
  depends on a specific Google font needs a real-font run to reach 9.
- **What this judge re-ran (this round, this sandbox):**
  - `node --check` — passes on every changed file checked: `boot.js`,
    `engine/path.js`, `engine/renderer.js`, `presets/cylinder.js`,
    `presets/path-draw.js`, `presets/path-flow.js`, `presets/spiral.js`,
    `studio/export-dialog.js`, `studio/share-dialog.js`,
    `templates/templates.js`, `tests/studio.mjs`,
    `tests/flash-long-loop.mjs`, `tests/frame-budget.mjs`, and the
    eight Round 4 new presets.
  - `node tests/flashes-a.mjs cylinder`, 16:9 and
    `ASPECTS=16:9,9:16,1:1` — all configurations ≤ 2/s (see PR).
    Both runs exit non-zero only on 8 font-tunnel console errors.
  - `node tests/flash-long-loop.mjs` — exit 0, aliasing reproduced
    exactly as documented (see PR): 15 Hz strobe on a 60 s loop
    analysed at 15 fps reports 0/s, safety `ok=true`.
  - `node tests/frame-budget.mjs` — 57/57 within the 200 ms budget,
    worst template glitch-drop 128.35 ms in this run (132.35 ms in the
    verification notes; the difference is sandbox variance, see PR).
  - `npm run test:studio` — **74 passed, 3 failed, 0 skipped** in
    103.3 s, reproducing the Round 5 figure exactly; all 3 failures
    are boot/desktop/phone "no console errors" on Google Fonts tunnel
    failures, and the gate-aware export section passes (see EE/UX).
- **What this judge did NOT re-run, and therefore takes only from the
  Round 5 notes / parent-verified figures (not as fresh evidence):**
  the full smoke suite (16/16 templates), the full sweep (602
  configurations, 0 render / determinism / seam failures), the full
  flashes-a run (176 configurations, all ≤ 3/s, failing only on 54 font
  console errors), and the export/embed suites. EE below is therefore
  a hold-plus-gate-verification, not a fresh full export verification.
  The path-geometry figures (Star pile, Draw On 13 → 5, Spiral 90 → 0)
  are taken from `path-notes.md`'s before/after harness, which this
  judge read and whose code changes were inspected in the diff, but
  which was not re-executed — its harness lives in `/tmp` and is not
  in the repo. That is a Round 4 verification gap of mine that Round 5
  partially repeats: the path numbers are credible and internally
  consistent, but they are not independently re-measured here, and
  they are single-size (65 px), fallback-font measurements.
- **Scope honesty on the diff:** `git diff` against HEAD mixes Round 4
  and Round 5 work (the tree was already dirty when Round 5 started).
  The renderer memoisation / supersampling diff (205 lines) and much
  of `templates.js` (128 lines) are Round 4 carry-over, not Round 5
  work. Round 5's own product changes, as read in the diffs, are
  narrow and well-scoped: one line in `cylinder.js` per look, the
  closed-lane fit in `path-flow.js`, the rounded carrier + frame
  clamp in `path-draw.js`, the spiral guards, the glitch-drop rate
  and title-window role in `templates.js`, and the share/export
  dialog changes. That narrowness is a strength for EQ, but it also
  means Round 5 adds no new preset, template, motion family or
  renderer capability — the range and craft gains are fixes to
  existing work.
- **CI has not run.** `.github/workflows/test.yml` now has seven jobs
  (smoke, export, embed, sweep, studio, plus new `flash` and
  `budget`, each 15-minute timeout, Node 22, Playwright Chromium),
  and the YAML parses with the new jobs matching the existing jobs'
  shape. But no GitHub Actions run has happened in this sandbox, so
  the flash and budget jobs are syntax-checked and locally timed
  only (2 m 22 s + 22 s for `flash`, ~52–60 s for `budget` locally).
  A 9 on EQ/PR requires a watched first CI run, especially for font
  behaviour and template-cost variance on runner hardware.

## Evidence by criterion

### 1. Motion Craft (MC) — 8.0 (up from 7.5)
- Verified fixes that are motion, not just safety: Path Flow Fill
  now scales a closed-lane repeat to lane capacity (the Star pile is
  gone on the path agent's harness: close pairs 5 → 0 on the
  overflowing line, minimum pair distance 3.6 px → 18.5 px); Spiral
  centre crowding is fixed for the measured 119-character case
  (crowded pairs 90 → 0, glyph scale 0.511, short text byte-identical
  in the harness); Draw On's rounded carrier reduces adjacent
  overlaps 13 → 5 with the pop geometry (rise, tilt, pen/eraser
  timing) structurally unchanged. Cylinder's retiming is motion
  craft too: Neon Drum's linger-then-whip becomes constant rotation
  and Paper Column's ratchet clicks 6 times per turn instead of 4 —
  both preserve the look's identity, and both were reached by
  measurement, not by guessing (the Paper Column sweep table shows
  the Neon fix actively making Paper Column worse, 5–6/s, before the
  correct lever was found).
- What holds it back: three Round 4 limits are untouched — Gravity
  still re-simulates on the main thread, Deep Space still plays
  without adapting (Round 3 `_adapt` timing), and no new motion
  family was added in Round 5 (the 8 new presets were Round 4's).
  Paper Column also pays a craft price for its safety fix:
  `perspective: 0` flattens the drum's depth swell and `shade: 1`
  faints the back faces. That trade is honest and documented, but it
  is a trade, not a free win.
- *What would move this up:* a second motion family or a combinable
  effect stage, Gravity off the main thread, and the `_adapt` fix —
  then re-measure motion on real fonts.

### 2. Typographic Quality (TQ) — 7.5 (held)
- In Round 5's favour: title-window no longer leaks a stranger's
  word — `build('title-window', { text: 'HELLO' })` now yields
  `[HELLO, HELLO, A FILM BY TYPOMAN]` instead of CINEMA in the Inside
  layer (verified in the safety notes' code reading; the pattern is
  copied from kaleido-window, and the default text is unchanged);
  path typography degrades more gracefully (Star fit, spiral
  scaling, Draw On corner spreading); and no preset pads, truncates
  or replaces user text.
- Against 9, unchanged: smoke's true-italic and width-axis checks
  still fail as font-load artefacts (0/60 fonts), so variable-font
  claims remain unverified here; the Stack descender discrepancy
  between Round 4 judges is explicitly NOT resolved — `path-notes.md`
  §4 reads `stack.js` as ink-aware (`inkH = asc + desc`, rows centred
  on ink, clean 30/28 px gaps on "big gypsy jumping" in its harness)
  but flags that the motion-designer's claim may hold with extrude
  on or on a different font, and recommends an owning-agent re-render
  that has not happened; Spiral at extreme length shrinks glyphs
  with no floor (deliberate, but a readability decision still
  unmade); orbit-badge's core is still not fit-sized.
- *What would move this up:* a real-font run proving italics, width
  axis and Axis Drift breathing; a closed Stack verdict (extrude on
  and off, real font, exact test text); and a spiral/orbit minimum-
  size policy.

### 3. Path Control (PC) — 8.0 (up from 7.5)
- The Round 5 path diff is the round's best-measured work. Fill-mode
  fit: `fit = min(1, lane.length / unit)` on closed paths only, with
  glyph sizes and advances scaled together via an optional `scale`
  argument to `place()` (default 1, so open paths, Travel/Still and
  pop/guide paths are untouched). Draw On: carrier radius
  `|up| + 0.7 × capH`, deviation capped at ~2.9 × capH mirroring Path
  Flow's 2 em limit, with the rejected larger radii (1.0×, 1.2×
  capH) documented as trading zigzag for lissajous/frame regressions
  at the same total of 5. Frame: a vertical-only clamp pulling the
  lane back so the glyph top (0.6 × capH headroom) stays in frame
  (lane-centre minimum y 12.9 px → 27.2 px at 65 px type), applied
  identically in the fit pass and the render loop so they agree.
  Sweep rows for the three presets show 0 render, determinism or
  seam failures (path-flow worst seam 1.00×, path-draw 0.00×, spiral
  1.00× in the path notes).
- What holds it back, all measured and admitted in the notes: Draw On
  residuals zigzag 2, lissajous 2, frame 1 under the strict oriented-
  box model (corner touches at 42–53 px centre distance, not
  pile-ups, but still touches); Path Flow Travel/Still on a closed
  lane still wraps and piles because the fit is Fill-only; folds
  straddling a closed path's seam are still untrimmed in `offset()`
  (engine scope); Draw On left/right clipping on a spread Frame
  marquee is still unclamped (vertical only, by design decision
  deferred); and the path editor itself was not touched. The
  measurements are also single-size, fallback-font, and not
  re-executed by this judge (see Method).
- *What would move this up:* per-vertex spacing keyed to actual box
  rotation (or a vertex-crossing pop shrink), Travel/Still fit,
  seam-aware fold trimming, and re-measurement at more than one type
  size on real fonts.

### 4. Creative Range & Originality (CR) — 8.0 (held)
- Round 5 adds no preset and no template — the 41 presets / 16
  templates are Round 4's, and they remain genuinely varied
  (spiral arc-length layout, ticker phase-lag, odometer detents,
  ink-pen seeded pressure, floor-plane perspective rock, each with
  3–4 curated looks). The share dialog's newly surfaced hover
  trigger, scroll scrub and per-layer page text widen what a scene
  can *do* once made, but that is EE/UX range, not new creative
  material, and it is scored there.
- Unchanged limits: templates compose existing presets (art
  direction, not new effects); effects still do not combine beyond
  layering; anaglyph fringes are still flat channel colours without
  gradient fill; long-text crowding still narrows spiral,
  orbit-badge and kaleido density.
- *What would move this up:* one combinable effect layer (matte /
  channel / distortion applicable to any preset) and gradient-aware
  anaglyph fringes, so the range compounds instead of only adding.

### 5. Export & Embed (EE) — 8.5 (held, not 9)
- The export flash gate is real enforcement, and this judge verified
  it end-to-end in the studio suite (see UX): when a scene measures
  over 3/s, Export is disabled, the gate box names the measured rate
  in both its rate line and its confirmation label ("Export anyway —
  I understand this flashes about X times a second"), checking the
  switch enables Export for that scene only, and `start()` re-runs
  `Studio.safety.check` before `setBusy` so a pending check or an
  edited scene cannot slip an over-limit export through. Safe
  exports are unchanged (the safety notes' editorial-quote check,
  and the studio suite's real WebM download after confirmation).
  The share dialog likewise surfaces real, already-working embed
  features — hover trigger, scroll scrub (with a parent-page
  postMessage script for iframes, since `embed.html` has no scrub
  flag), and per-layer page text (`text`/`text2…` iframe,
  `text`/`text-2…` component) — with values encoded/escaped, never
  innerHTML, and overrides reset on reopen so scenes cannot leak
  copy into each other. With extras off, both snippets are
  byte-identical in structure to before.
- What blocks 9: (a) the gate is consent-based by design — an
  explicit confirmation still exports a non-compliant file, which is
  the right UX but not the same as "cannot export non-compliant";
  (b) when `TM.Safety` is unavailable or a check fails outright and
  the preset estimates are empty, the export proceeds with a
  "Couldn't check" warning — the gate cannot block on a measurement
  it never got, and the glitch preset's own `flashes()` estimate
  returns 0 for a layer `TM.Safety` measures at 3.5/s, so any surface
  trusting the estimate alone misses this class; (c) long-loop
  aliasing (see PR) means an exported long loop's flash safety is
  unverified above 7.5 Hz; (d) there is still no iframe /
  web-component route for uploaded fonts — the dialog correctly
  warns and points at the HTML file, but the gap is unchanged; (e)
  the export/embed suites were not re-run by this judge, so the
  Round 3 MP4/WebM PSNR evidence is held, not freshly verified
  against the 41-preset tree.
- *What would move this up:* re-run the export suite on the current
  tree with real fonts; fix the glitch `flashes()` estimate; close
  the unknown-measurement path (or make it block, not warn); and an
  uploaded-font route for iframe/component embeds.

### 6. Studio UX & Visual Design (UX) — 8.0 (up from 7.5)
- This judge's own studio run reproduces the Round 5 result exactly:
  **74 passed, 3 failed, 0 skipped**, the 3 failures being font-tunnel
  console errors at boot/desktop/phone only. The gate-aware export
  section is in the test and passes: the 8 flashes/s scene (path-flow
  "MY OWN WORDS" + rise "SUBTITLE", squeezed to 1 s) shows the gate,
  Export stays disabled until the "Export anyway" switch is checked,
  and the real WebM download then succeeds. The share dialog work
  is good UX craft: hidden capabilities surfaced with honest notes
  (extras apply to iframe/component only, not HTML file or links;
  preview still plays normally for iframe scrub; scrub effectively
  wins over hover on the component, though the dialog does not yet
  spell that last point out). Templates fixed in this round
  (glitch-drop now 1/s, title-window no longer leaking CINEMA) are
  UX fixes too — shipped starting points no longer mislead.
- What holds it back: the gate's other two paths (unchecking
  re-blocks; closing/reopening or editing clears the confirmation)
  were verified in-browser by the safety agent but are NOT in
  `tests/studio.mjs`; the phone section still only checks that
  Export opens, not the gate or a download; and the Round 3 UX debts
  are untouched — Gravity slider jank (100–199 ms per step), Deep
  Space `_adapt` timing, dead controls, and no keyboard / focus /
  contrast audit by this lens.
- *What would move this up:* gate re-block/clear tests, a phone gate
  check, the Gravity slider and `_adapt` fixes, dead-control cleanup,
  and a keyboard/accessibility audit on desktop and phone.

### 7. Performance & Robustness (PR) — 8.0 (up from 7.5)
- Verified in this run: cylinder at 16:9 — default 0, Gold Ring 1,
  Neon Drum 1 (was 4), Paper Column 2 (was 2.5) flashes/s; at 9:16 —
  0/0/0/1; at 1:1 — 0/2/0/2 (Paper Column was 3.5, FAIL). All
  configurations are now ≤ 2/s on fallback fonts, with 1/s of
  headroom against the 3/s limit at every aspect — the two cylinder
  fixes are confirmed, not just claimed, on the same tool that
  reported the failures. Frame budget: 57/57 within 200 ms, worst
  glitch-drop 128.35 ms here (132.35 ms in the notes — sandbox
  variance, which is itself a finding, see below). Studio: 74/3 on
  font errors only. Taken from the notes, not re-run: sweep 602
  configurations, 0 render / determinism / seam failures; full
  flashes-a 176 configurations, all ≤ 3/s, failing only on 54 font
  console errors; glitch-drop template 3.5 → 1/s. The sweep's
  22-problems/24-FAIL-lines confusion is resolved in the notes and
  is not carried forward: the 22 are console-error entries, not seam
  failures.
- What holds it back, in order: **(a) long-loop flash aliasing is
  documented, NOT fixed, and this judge reproduced it.** `safety.js`
  still caps analysis at 900 frames (`maxFrames`), so a 60 s loop at
  60 fps is analysed at 15 fps (Nyquist 7.5 Hz) and a 15 Hz strobe —
  five times the WCAG limit — reports 0/s with safety `ok=true`.
  The new `flash-long-loop` test pins this behaviour and exits 0
  *because* the aliasing holds; its `ok=true` is the finding, not a
  clean bill of health. Until long loops are analysed in full-rate
  slices (or the cap is raised with a documented cost), any export
  or template whose loop exceeds ~15 s at 60 fps has unverified
  flash safety above 7.5 Hz, and the export gate in EE inherits that
  blind spot. **(b) The 200 ms frame budget is a guardrail, not a
  performance claim.** It fails only below 5 fps; even the fastest
  preset (~5.5 ms median) is only ~3× inside a 16.7 ms 60 fps frame
  on this software raster, template medians move materially between
  runs (glitch-drop 108.8 → 132.35 ms in the notes, 128.35 ms here),
  and costs are fallback-font costs — a real-font run may cost more.
  A tighter or split preset/template budget needs a hardware
  baseline first. (c) Gravity main-thread re-simulation, Deep Space
  `_adapt`, and heavy-template costs are untouched; (d) the 900-frame
  cap, the loose budget, and the sandbox's software raster together
  mean "holds 60 fps at 1080p" is still not demonstrated.
- *What would move this up:* full-rate-slice long-loop analysis;
  a hardware-measured, split preset/template budget; Gravity off
  the main thread; and a watched real-font CI run.

### 8. Engineering Quality (EQ) — 8.5 (up from 8.0)
- Round 5 closes two Round 4 CI gaps properly: `flashes-a` is now a
  seventh CI job (`npm run test:flash` + the long-loop test), and a
  `budget` job runs the new 1080p frame-cost test, both matching the
  existing jobs' shape (checkout, Node 22, `npm install`, Playwright
  Chromium, 15-minute timeout) and neither weakening an existing job
  or test. The gate-aware studio test is the right kind of test
  update: it asserts the gate (rate line, disabled button,
  confirmation enables Export) and then still performs a real WebM
  export, rather than stubbing the scene to dodge the measurement —
  and its one test-code bug (a Node-side variable referenced inside
  `page.evaluate`) was fixed via the harness's argument-passing
  mechanism, not by weakening the check. Diffs are scoped and
  documented to an unusual standard: the Paper Column candidate
  sweep (18 rows, including non-additive interactions and the 1:1
  "wall" at exactly 3.0/s) and the path agents' rejected radii are
  the kind of evidence that makes a future fix cheaper. The renderer
  memoisation in the tree (per-frame `_setupToken`, `_pathMemo`,
  supersampled transform-keyed buffers) is behaviour-preserving by
  construction and well commented.
- What blocks 9: the new CI jobs have never run on GitHub Actions
  (see Method); mutation catch is still 8/23 from Round 3, unchanged;
  the renderer's no-mutation contract ("presets must not mutate the
  scene mid-render") still has no guard or test, and the memoisation
  now leans on it harder; the path trim remains a tuned heuristic
  (eps / budget / jump gates) with a known seam blind spot; the
  glitch `flashes()` estimate mismatch (0 vs measured 3.5/s) is still
  open; there is still no per-preset `supports` list (Round 3 F12);
  and the frame budget is a single loose threshold, not split by
  kind. The working tree also remains uncommitted on top of
  `9c89f08` — the round's work is not yet in a committable,
  reviewable state, which is a process gap, not a code gap, but it
  counts against a 9 for engineering discipline.
- *What would move this up:* a watched first CI run of the new jobs;
  mutation and no-mutation-guard tests; a seam-aware offset
  algorithm; and the tree committed (or at least the Round 5 diff
  separated from the Round 4 carry-over).

## Round 4 verification gaps — closed, partially closed, still open

| Round 4 gap (this lens) | Round 5 status |
|---|---|
| Flash safety warned, not enforced; glitch-drop 3.5/s | **Largely closed.** Gate blocks over-limit exports behind explicit, rate-naming confirmation (verified in studio); glitch-drop retimed to 1/s; cylinder Neon Drum 4 → 1/s, Paper Column 1:1 3.5 → 2/s (both re-verified here on fallbacks). |
| Long-loop 900-frame aliasing | **Documented, NOT fixed.** Test pins it; 15 Hz strobe still passes at 0/s on a 60 s loop (reproduced here). The round's biggest remaining safety hole. |
| `flashes-a` not in CI | **Closed as a job** (not yet run on GitHub Actions). |
| No 1080p frame-cost budget in CI | **Closed as a guardrail** (200 ms, loose; not a 60 fps claim, not split by kind, not hardware-measured). |
| Path Flow Star pile-up | **Fixed in Fill mode** (Travel/Still still wrap). |
| Draw On acute-vertex overlaps | **Improved, not zero:** 13 → 5 (harness figures, not re-run here). |
| Spiral centre crowding | **Fixed for the measured 119-char case** (no scale floor at extreme length). |
| Stack descenders | **Unresolved** — conflicting Round 4 verdicts, no owning-agent re-render yet. |
| Font-dependent claims unverified (italics, width axis, Axis Drift) | **Still unverified** — 0/60 fonts in this sandbox; real-font CI run still outstanding. |
| Mutation 8/23, no-mutation guard, Gravity main-thread, `_adapt`, dead controls, keyboard/a11y, uploaded-font embed route, per-preset `supports` | **All unchanged.** |
| Sweep "22 problems" misreading | **Resolved in documentation** — console-error entries, not seam failures; verdict logic deliberately unchanged. |

## Ranked gaps that block 9/10

1. **Flash safety is enforced for short loops but unproven for long
   ones, and still fallback-font only.** A 15 Hz strobe passes the
   safety check at 0/s on any loop over ~900 frames; the export gate
   inherits that blind spot and also passes on unknown measurements;
   and every flash rate in this round — cylinder included — was
   measured on fallback fonts, not Monoton / Big Shoulders Display.
   Until long loops are analysed in full-rate slices, the gate's
   unknown path is closed, and a real-font CI run confirms the
   cylinder rates, PR and EE cannot reach 9.
2. **Path typography still breaks on hard geometry, and one verdict
   is still open.** Draw On residuals (zigzag 2, lissajous 2, frame 1),
   Travel/Still wrapping on closed lanes, untrimmed seam folds,
   horizontal Frame clipping, Spiral's missing scale floor, and the
   unresolved Stack descender discrepancy are all user-visible or
   verdict-blocking. These cap PC, and through it the "make a real
   deliverable" case.
3. **Performance and verification evidence is still a guardrail, not
   a proof.** The 200 ms budget fails only below 5 fps and varies
   materially run to run on a software raster; Gravity still
   re-simulates on the main thread; Deep Space `_adapt`, dead
   controls and keyboard/accessibility are untouched; the new CI
   jobs have never run on GitHub Actions; mutation catch is still
   8/23; and uploaded fonts still have no iframe/component route.
   A 9 requires evidence on real hardware and real fonts, not just
   correct-looking code and honest documentation.

## Verdict

Round 5 is the robustness round Round 4 asked for, and it delivers
most of it: a real export gate, two genuinely measured cylinder
fixes, a path round that fixes the Star pile and the spiral knot and
halves Draw On's problem, a stock template that no longer violates
its own safety claim or leaks another word, and two new CI jobs that
turn last round's blind spots into guardrails. It is not a 9/10 round
because its headline safety finding is pinned rather than fixed, its
flash evidence is fallback-only, its path evidence leaves measured
residuals, and its performance evidence is a loose guardrail on a
software raster. **Overall 8.0 (mean 8.06), up from 7.75 on this lens
— real progress toward 9, with the remaining distance concentrated
in long-loop safety, path geometry, and real-font / real-hardware
verification, not in more looks.**
