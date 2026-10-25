# TYPOMAN Round 4: Creative Technologist

**Lens:** Performance & Robustness, Engineering Quality and Export & Embed weighted
most; all eight criteria scored from evidence, not from the round-4 notes.
**Snapshot:** working tree on top of `9c89f08` (uncommitted: `js/boot.js`,
`js/engine/path.js`, `js/engine/renderer.js`, `js/templates/templates.js`, plus
8 new files in `js/presets/`). No code was edited, committed or pushed for this
judging; this file is the only file written.
**Environment:** headless Chromium 141.0.7390.37 via Playwright 1.56.1 (software
raster), Node v24.22.1, ffmpeg/ffprobe present but the export suite was not
re-run (see EE).

| MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---|---|---|---|---|---|---|---|
| 7.5 | 7.5 | 7.5 | 8.0 | 8.5 | 7.5 | 7.5 | 8.0 | **8.0** (mean 7.75) |

Round 3 (this lens): MC 7.5, TQ 7.5, PC 8.0 (prov.), CR 7.5 (prov.), EE 8.5,
UX 7.5 (prov.), PR 7.5, EQ 8.0, overall 8.0 (mean 7.75). Net movement is zero:
Creative Range rises on the 8 new presets and 8 new templates, and Path Control
falls from its provisional 8.0 once the Round 4 path evidence is actually
measured (see PC). Nothing in Round 4 is a regression I could attribute to the
new work — every new preset and template passed the sweep — but nothing in
Round 4 closes the Round 3 safety, path-geometry or CI gaps that cap the
weighted criteria below 9.

## Method and environment limits — read before the scores

- **Font evidence is limited by the sandbox, and is NOT scored as a product
  bug.** Google Fonts fail to load here (`ERR_TUNNEL_CONNECTION_FAILED`):
  smoke reports **0/60 catalogue fonts load**, and the sweep's only counted
  problems are 24 console-error groups that are all font-tunnel failures.
  Every browser check below therefore ran on fallback fonts. That means:
  true-italic rendering, the width axis, and Axis Drift's weight breathing
  (which collapses to a scale pulse on a non-variable fallback) are
  **unverified in this run**, not disproven. Kerning, determinism, seams and
  template behaviour measured on fallbacks still stand, but any claim that
  depends on a specific Google font needs a real-font run to reach 9.
- **Sweep run by this judge:** `node tests/sweep.mjs` — **602 configurations
  (41 presets, 16 templates), 0 render errors, 0 determinism failures.**
  The sweep's verdict line counts 24 problems, but all 24 are the font-tunnel
  console-error groups above, not seam failures: the only seam flags
  (glitch-drop as built / with user text, 3.62× / 4.47× on the screen) were
  re-measured against every step of the loop and cleared (0.93× / 0.87×).
  **Discrepancy to flag:** I could *not* reproduce a claim of "22 seam
  problems" in this run — the sweep shows zero seam failures after dense
  re-measurement, and smoke shows zero seam failures (see PR). If a baseline
  run reported 22 seam problems, it was not reproduced here and should not be
  carried forward without its own log.
- **Smoke run by this judge:** `node tests/smoke.mjs` (exit 1, for exactly the
  failures listed under PR) — all 41 presets deterministic, all edge cases ok,
  sanitiser fuzz ok, encode/decode round trip ok, safety detector ok
  (2 Hz → 2/s, 4 Hz → 4/s, fast bar → 5/s, per-frame 60 fps strobe → 30/s).
- **Syntax:** `node --check` passes on `renderer.js`, `path.js`, `boot.js`,
  `templates.js` and all 8 new presets. No `Math.random` / `Date` /
  `performance.now` in any new preset (the only `performance.now` in
  `renderer.js` is render-timing stats, not frame content). New presets size
  everything relative to `f.size` / `f.unit` / cap height / frame fractions.
- **Not re-run:** the export, embed and studio suites, and the mutation /
  flash-analysis suites. EE and UX below are therefore held from Round 3
  verification plus the fact that Round 4 touches no export or studio file
  (see the diff stat), not from a fresh Round 4 export run.

## Evidence by criterion

### 1. Motion Craft (MC) — 7.5
- Sweep: every preset loops seamlessly at every tested look, select, toggle
  and whole-cycle/range value; new presets worst seam 0.00×–1.04×, all
  deterministic. Smoke seam ratios for the 8 new presets are 0–1.35×, all
  below the 6× fail line; the highest in the whole set are strobe-cut 3.21×
  and focus-pull 2.11×, both passing.
- New motion is genuinely varied, not re-skinned: spiral arc-length layout
  with whole-turn spin, ticker phase-lag (never a clock shift), odometer
  quantised detents, ink-pen seeded pressure, floor-plane perspective rock.
- What holds it back: three of the eight new presets are sequence reveals
  (blob, ink, odometer) sharing one in/out grammar; Gravity still re-simulates
  on the main thread (Round 3 F7, untouched); axis-wave's 2.7 s loop still
  flags 4.24× on the sweep screen before dense re-measurement clears it.
- *What would move this up one point:* a measured 1080p frame-cost budget
  per preset in CI (see PR) plus one more non-sequence motion family, and a
  fix for the Gravity slider-step cost so heavy presets stay smooth while
  being edited, not just while playing.

### 2. Typographic Quality (TQ) — 7.5
- All new presets draw through `f.drawGlyph`, never pad, truncate or replace
  user text (odometer's ghosts are copies of the same glyph); smoke kerning /
  ligature check is 0.00% of ink different on fallback fonts, multi-line font
  integrity is 62 / 62 px, and stack rows stay inside margins (880 / 895 px).
- Against it: smoke's true-italic check FAILs and the width-axis check FAILs
  — both are font-load artefacts in this sandbox (0/60 fonts), so they are
  not scored as regressions, but they leave the variable-font claims
  unverified here; spiral crowds long text near the centre and orbit-badge's
  core is not fit-sized, so very long wordmarks crowd the badge (both
  documented, both intended-use scoped).
- *What would move this up one point:* a real-font run proving italics,
  width axis and Axis Drift weight breathing on the intended families, plus
  fit-sizing for the spiral centre and the orbit core so long text degrades
  gracefully instead of crowding.

### 3. Path Control (PC) — 7.5 (down from provisional 8.0; not a regression)
- Round 4's `path.js` fold trim is real and well gated: on the rendering
  agent's Node harness, bounce goes 2 → 0 adjacent overlaps, the zigzag fold
  pair (two glyphs 30 px apart along the lane landing 5.2 px apart) is gone,
  and every other shape's offset length is unchanged except where folds
  existed. The jump gate matters — the ungated version moved a loop glyph
  25 px onto the wrong branch, and the gated version does not.
- But direct measurement caps the score: zigzag, lissajous and heart still
  show 2 residual adjacent overlaps each and star 1, at 65 px type; folds
  straddling a closed path's seam are explicitly not trimmed; and the
  Path Flow-on-Star pile-up (a ~700 px line on a 506 px tracked lane, where
  `at()` wraps and piles overflow onto the start) is still open and
  preset-side. The path editor itself was not touched in Round 4, and the
  Round 3 provisional rating was never editor-tested by this lens.
- *What would move this up one point:* preset-side corner smoothing or bend
  spacing for Draw On's acute vertices, Path Flow scaling its line to the
  lane's text capacity (or refusing to wrap), and seam-aware fold trimming —
  then re-measure all 22 shapes at more than one type size.

### 4. Creative Range & Originality (CR) — 8.0 (up from 7.5 prov.)
- 33 → 41 presets and 8 → 16 templates, each new preset a distinct mechanism
  (see MC) with 3–4 curated looks, and each new template a genuinely different
  starting point (YouTube intro, hero sequence, story, logo zoom, lyric
  sequence, editorial spotlight, kaleido window, orbit badge) rather than a
  colour swap. Templates take user text correctly in the sweep (both as built
  and with "Your words\nhere"), including kaleido-window's matte/headline
  dual-role fix.
- Limits: templates compose existing presets — they add art direction, not
  new effects; anaglyph fringes are flat channel colours and do not carry a
  gradient fill; effects still do not combine beyond layering; long-text
  crowding (spiral, orbit-badge, kaleido density) narrows some presets'
  usable range.
- *What would move this up one point:* one combinable effect layer (e.g. a
  matte / channel / distortion stage applicable to any preset) and gradient-
  aware anaglyph fringes, so the range compounds instead of only adding.

### 5. Export & Embed (EE) — 8.5 (held; export code untouched in Round 4)
- `git diff --stat` shows no export file changed; the Round 3 verification
  therefore stands as the evidence base (MP4 AV1 1080p60 240/240 at
  43.4–45.2 dB with a correct av1C, exact loop spans, transparent WebM alpha
  38.7–69.4 dB, cold cross-origin player and `file://` standalone 0.000%
  different, all embed routes bit-identical). New presets/templates flow
  through the same renderer the sweep just verified deterministically.
- What blocks 9: export warns about flashes but is **not stopped above
  3/s** (Round 3 bug 9, explicitly left open by the rendering agent), and
  a shipped template (glitch-drop) itself measures 3.5/s in smoke — so a
  user can export a non-compliant file from a stock starting point. The
  export suite was not re-run by this judge, so this score is a hold, not a
  fresh Round 4 verification.
- *What would move this up one point:* re-run the export suite against the
  41-preset / 16-template tree with real fonts, and either block or
  prominently gate exports above the flash limit (or retime glitch-drop so
  the stock template itself passes).

### 6. Studio UX & Visual Design (UX) — 7.5 (held, provisional)
- No studio file changed in Round 4, so the Round 3 picture stands: a strong
  export dialog (flash check, codec notes, cost estimate), live flash
  warning naming the worst second, undo/redo with named steps, remix, and a
  gallery that now lists 41 presets and 16 templates. Nothing in Round 4
  makes the studio harder to use; templates are the main UX gain, and they
  work (see CR).
- Unchanged gaps: Gravity slider jank (100–199 ms per step, Round 3 F7),
  Deep Space playing at 26 fps without adapting (Round 3, `_adapt` timing),
  dead controls noted in Round 3, and no keyboard/accessibility audit by
  this lens — hence still provisional.
- *What would move this up one point:* fix the Gravity slider cost and the
  `_adapt` timing, remove or wire the dead controls, and run a keyboard /
  focus / contrast audit on desktop and phone.

### 7. Performance & Robustness (PR) — 7.5
- Sweep: 602/602 render without throwing and deterministically; smoke: all
  41 presets deterministic, all 8 edge cases (empty, emoji, 400-char, multi-
  line, serif, variable, effects, portrait) ok, sanitiser fuzz ok, round
  trip ok, safety detector correct including the per-frame 30 Hz case that
  Round 3 F1 got wrong. Renderer memoisation (`_setupFor` token,
  `_pathFor` once per frame, invisible-transform skip) is behaviour-
  preserving by construction and capped (hi-buffer ≤ 16 Mpx, factor ≤ 2).
- Against 9, in order: (a) smoke fails on **glitch-drop flashing 3.5/s**
  — a stock template over the WCAG limit, and the export does not stop it;
  (b) long-loop flash analysis is still capped at 900 frames (Round 3 F2:
  a 60 s loop is analysed at 15 fps); (c) smoke 1080p costs on this
  software raster are 7.66–41.06 ms (new presets 7.66–32.23 ms; tunnel
  41.06 ms, focus-pull 35.21 ms), so "holds 60 fps at 1080p" is not
  demonstrated here — though software raster is not a mid-range laptop GPU,
  so this is a missing measurement, not a proven failure; (d) Gravity's
  main-thread re-simulation and heavy templates (glitch-drop, lyric-morph,
  title-window costs in Round 3) are untouched.
- *What would move this up one point:* retime or gate glitch-drop, analyse
  long loops in full-rate slices, and put a per-preset / per-template 1080p
  frame-cost budget into CI measured on real hardware (or a documented
  software-raster budget), with Gravity simulated off the main thread.

### 8. Engineering Quality (EQ) — 8.0
- Round 4 code is clean and well documented: new presets follow the
  registerPreset contract (params, looks, `f.drawGlyph`, seeded noise only);
  the renderer diff explains its own invariants (M′ = M/s, translation
  unchanged, shadow/glow in buffer space, `try/finally` buffer restore,
  scale-1 no-op) and states its limits honestly (literal-pixel decor thins
  by 1/s, scale above the cap still softens); `Renderer.FLASH_LIMIT = 3`
  exposes the shared constant instead of duplicating the number. Five
  parallel CI jobs (smoke, export, embed, sweep, studio) still run.
- What blocks 9: the path trim is a tuned heuristic (eps / budget / jump
  gates calibrated to zigzag and bounce) rather than a general offset
  algorithm, with a known seam blind spot; the memoisation relies on the
  "presets must not mutate the scene mid-render" contract without a guard;
  and the Round 3 CI blind spots are unchanged — `flashes-a` is still not
  in CI (test.yml has no flash job), mutation testing still catches only
  8/23 one-line regressions as far as this round shows, and there is still
  no per-preset `supports` list (Round 3 F12).
- *What would move this up one point:* add `flashes-a` and the mutation /
  alpha-PSNR / transform-key / `text-2` / italic-pixel checks to CI, a
  guard or test for the no-mutation contract, and a general (or at least
  seam-aware) offset-trim algorithm replacing the shape-tuned gates.

## Ranked gaps that block 9/10

1. **Flash safety is warned, not enforced — and a stock template violates
   it.** glitch-drop measures 3.5/s in smoke, exports are not stopped above
   3/s, and long-loop analysis still aliases at the 900-frame cap. Until
   the shipped starting points pass and the guard has teeth, PR and EE
   cannot reach 9, and no amount of new presets moves the overall band.
2. **Path typography still breaks on hard geometry.** Residual Draw On
   overlaps on four shapes, the Path Flow Star pile-up, untrimmed closed-
   seam folds, and Stack descender collisions are all user-visible,
   preset/layout-side failures that the engine trim deliberately does not
   fix. These cap PC, and through it the "make a real deliverable" case.
3. **Verification blind spots are unchanged, and font-dependent claims are
   unverified in this environment.** `flashes-a` outside CI, mutation
   catch at 8/23, no performance budget, and 0/60 fonts in the sandbox
   mean italics, width axis and Axis Drift's core effect have no passing
   evidence in this run. A 9 requires evidence, not just correct-looking
   code — real-font CI and the missing suites are the cheapest path up.

## Verdict

Round 4 is a solid range-and-craft round, not a robustness round: 41
presets and 16 templates, all deterministic and seamless in the sweep, a
genuine transform-key sharpness fix, and a careful (if partial) path-fold
fix — with the same safety, path-geometry and CI gaps Round 3 left open.
**Overall 8.0 (mean 7.75), unchanged from Round 3 on this lens, and
correctly so: the work that would move it to 9 is enforcement, geometry
and verification, not more looks.**
