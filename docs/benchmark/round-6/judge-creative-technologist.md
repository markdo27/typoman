# TYPOMAN Round 6: Creative Technologist

**Lens:** Performance & Robustness, Engineering Quality and Export & Embed
weighted most; all eight criteria scored from evidence, not from the
Round 6 notes. **Snapshot:** current working tree (Round 6 changes
uncommitted, mixed with other agents' Round 6 work; see Method). No code
was edited, committed or pushed for this judging; this file is the only
file written.
**Environment:** headless Chromium via Playwright 1.56.1 (software
raster), Node in this sandbox. Google Fonts fail here, exactly as in
Round 4/5 — see Method. That limit is stated, not scored as a product bug.

| MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---|---|---|---|---|---|---|---|
| 8.5 | 7.5 | 8.5 | 8.0 | 8.5 | 8.0 | 8.5 | 8.5 | **8.25 (mean 8.25)** |

Round 5 (this lens): MC 8.0, TQ 7.5, PC 8.0, CR 8.0, EE 8.5, UX 8.0,
PR 8.0, EQ 8.5, mean 8.06. Net movement is +0.19: Motion Craft, Path
Control and Performance & Robustness each rise 0.5 on verified Round 6
fixes; the other five criteria are held. Round 6 closes the single
largest Round 5 blocker — long-loop flash aliasing — and finishes the
closed-lane path work Round 5 started. It is still not a 9/10 round:
the safety fix is slow in this sandbox (see PR), its timing claim does
not reproduce here, the remaining path gaps are admitted rather than
closed, and every font-dependent claim is still fallback-only.

## Method and environment limits — read before the scores

- **Font evidence is limited by the sandbox, and is NOT scored as a
  product bug.** Google Fonts fail to load here
  (`ERR_TUNNEL_CONNECTION_FAILED`): Round 5 notes report 0/60 catalogue
  fonts, and the path measurements in this round are explicitly
  fallback-font, single-size (65 px) measurements. That means the
  sub-pixel Draw On graze counts, the Fill/Travel fit scales, and any
  flash rate that depends on a specific Google font are **provisional
  until re-run with real fonts** — not disproven and not confirmed.
  The long-loop flash test itself uses solid fills, so its readings
  are unaffected by the font limit, and that is the one Round 6 claim
  this judge can verify without a font asterisk.
- **What this judge re-ran (this round, this sandbox):**
  - `node --check` — passes on all four Round 6 files checked:
    `js/engine/safety.js`, `tests/flash-long-loop.mjs`,
    `js/presets/path-flow.js`, `js/presets/path-draw.js`.
  - `node tests/flash-long-loop.mjs` — **exit 0, all six cases read
    correctly** (see PR). In-page analysis times were 38.2 s / 40.9 s /
    39.1 s for the three 60 s cases in the full run, and 16.7 s for a
    single isolated 60 s case re-run from a `/tmp` harness — see the
    timing discrepancy in PR, which is the one Round 6 claim that did
    NOT reproduce as stated.
  - A code audit of the safety slicing design, the `Scene.normalize`
    bounds it relies on, the only remaining `maxFrames` caller, and
    the full path diffs (see PR / PC / EQ).
  - `node tests/sweep.mjs` (602 configurations) — path rows freshly
    verified by this judge: path-flow 22 configs, 0 render errors,
    deterministic, worst seam 1.00×; path-draw 16 configs, 0 render
    errors, deterministic, worst seam 0.00×. Both rows "fail" only on
    Google Fonts tunnel console errors (path-flow 6, path-draw 3),
    exactly as in the path notes. The sweep's trailing `test:motion`
    step was not run by this judge (the `test:sweep` npm script runs
    it separately).
- **What this judge did NOT re-run, and therefore takes only from the
  Round 6 notes (not as fresh evidence):** the path harnesses (the
  22-shape Draw On table, the Travel/Still phase tables), the full
  smoke / studio / export / embed suites, and the full flashes-a run.
  The path figures in PC are therefore an audit of the diff plus the
  notes' method, not a re-measurement — the diffs were checked to
  see whether the claimed mechanism can produce the claimed numbers,
  and in each case it can.
- **Scope note:** the only Round 6 evidence in
  `docs/benchmark/round-6/` at judging time is `safety-notes.md` and
  `path-notes.md`. Other Round 6 tree changes (templates, studio
  dialogs, other presets) have no Round 6 note yet, so they are not
  credited here. If another agent's work lands with its own note, it
  belongs in that agent's judging, not as an unearned bump here.

## Evidence by criterion

### 1. Motion Craft (MC) — 8.5 (up from 8.0)
- Round 6's path fixes are motion fixes, not just geometry. Path Flow
  Travel/Still on a closed lane no longer wraps and piles its
  overflow onto its start: the run is scaled about its untouched
  start `s0`, so travel start position, offset, direction, ease and
  cycle keep their old meaning while the run fits the loop (Star long
  close pairs 5/3/6/8 → 0 at every phase, minimum pair distance
  3.6–6.0 px → 17.5–19.1 px, scale 0.437). Draw On's vertex-local
  shrink moves no glyph along the lane, so pen timing, lead and the
  pop envelope are untouched — the shrink reads as a 1–2% smaller pop
  on exactly the glyphs that would otherwise touch, which is the
  right trade for a corner graze.
- What holds it back: the Star long fit is a visible 0.437 scale —
  correct, but a long text on a small loop now reads much smaller
  rather than denser, and that is a design consequence nobody has
  decided is the desired look; Gravity still re-simulates on the main
  thread, Deep Space `_adapt` timing is untouched, and no new motion
  family was added in this round's evidenced scope.
- *What would move this up:* a second motion family or a combinable
  effect stage, Gravity off the main thread, and the `_adapt` fix —
  then re-measure motion on real fonts.

### 2. Typographic Quality (TQ) — 7.5 (held)
- In Round 6's favour: the path typography that Round 5 left
  ragged is now substantially clean — Fill's seam pile (Circle short
  separator 2.8 px from the next repeat's first glyph) is fixed by
  choosing the repeat count from the unfitted unit, Travel/Still
  pile-ups are gone, and Draw On's per-glyph residuals fall 33 → 2
  (see PC). No preset pads, truncates or replaces user text, and no
  new param or look name was added to buy any of it.
- Against 9, unchanged: every one of those measurements is
  single-size, fallback-font, so the sub-pixel counts cannot be
  treated as product-visible defects until re-measured on real fonts
  at a second type size (the path notes say this themselves); the
  Stack descender discrepancy is still explicitly unresolved;
  Spiral at extreme length still shrinks glyphs with no floor;
  orbit-badge's core is still not fit-sized; and smoke's
  true-italic / width-axis checks still fail as font-load artefacts
  in this sandbox.
- *What would move this up:* a real-font run proving italics, width
  axis and Axis Drift breathing; a closed Stack verdict (extrude on
  and off, real font, exact test text); and a spiral/orbit
  minimum-size policy.

### 3. Path Control (PC) — 8.5 (up from 8.0)
- The Round 6 path diff is the round's best-measured work, and the
  mechanisms check out on audit:
  - **Travel/Still fit** (`path-flow.js`): `fit = min(1,
    lane.length / line.width)` on closed paths only, positions scaled
    about `s0` and glyph scale set through `place()`'s existing
    `scale` argument. Open paths keep fit = 1, as they should — their
    overflow is meant to scroll off and fade. The one deliberate
    non-identity, Star short scaling to 0.887, is explained, not
    hidden: its line already exceeded lane capacity by ~13%, and Fill
    already shrank the same text (its unit also carries gap +
    separator, so its 0.746 is a different unit, not a contradiction).
  - **Fill seam fix**: `reps` is now chosen from the *unfitted* unit
    and the fit capped by the whole tiled run, `fit = min(1, lane /
    (reps * unit0))`, with `unit = lane / reps`. When
    `reps * unit0 <= lane`, fit stays 1 and the gap stretches as
    before, so previously-correct Fill rows are untouched by
    construction. Circle short moves scale 1 → 0.796 with close pairs
    2 → 0 — a visible shrink, but the honest one: two full-size
    repeats genuinely cannot fit that lane.
  - **Draw On vertex-local shrink** (`path-draw.js`): a SAT
    `boxDepth()` helper on per-glyph boxes, shrinking only the later
    glyph in steps of at most 20% for at most 3 iterations, capped at
    20% total (the loop condition `shrink > 0.8` plus a 0.2 step cap
    makes that cap real, not aspirational). The rejected alternative
    is the evidence that matters most: per-pair spacing along the
    lane was built, measured, and *rejected* because it worsens
    Loop N–M from 18.79 px to 21.37 px on a self-crossing lane — the
    agent chose the fix that worsens nothing over the one with the
    better headline total (per-glyph 33 → 2 either way).
  - The 7 remaining mean-model counts (arc, wave, scurve, ribbon,
    double-loop, blob, infinity, 1 each) are correctly NOT chased:
    they are 0 on the per-glyph model, i.e. artefacts of giving a
    narrow glyph its neighbour's half-width in the harness. Matching
    the mean model in the preset would be gaming the harness.
- What holds it back, all measured and admitted in the notes:
  Draw On Loop still has I–N (1.31 px) and N–M (16.82 px) adjacent
  overlaps at 65 px type — lane-crossing overlaps, not grazes, and
  the notes are right not to chase them with a bigger cap or a lane
  push; Draw On Frame horizontal clipping is still unclamped
  (0 px at the default 65 px size, ≤ 5.4 px on corners at 108 px)
  pending three design decisions the path agent correctly refused to
  invent; folds straddling a closed path's seam are still untrimmed
  in `offset()` (engine scope); and the path editor itself was not
  touched.
- *What would move this up:* a Loop-specific lane or an explicit
  "Loop overlaps at this size" note, the Frame horizontal decision
  made and implemented, seam-aware fold trimming, and re-measurement
  at more than one type size on real fonts.

### 4. Creative Range & Originality (CR) — 8.0 (held)
- Round 6's evidenced scope adds no preset and no template — the 41
  presets / 16 templates remain Round 4's, and they remain genuinely
  varied (spiral arc-length layout, ticker phase-lag, odometer
  detents, ink-pen seeded pressure, floor-plane perspective rock,
  each with 3–4 curated looks). The path and safety fixes make
  existing material behave correctly; they do not widen what a user
  can make.
- Unchanged limits: templates compose existing presets (art
  direction, not new effects); effects still do not combine beyond
  layering; anaglyph fringes are still flat channel colours without
  gradient fill; long-text crowding still narrows spiral,
  orbit-badge and kaleido density.
- *What would move this up:* one combinable effect layer (matte /
  channel / distortion applicable to any preset) and gradient-aware
  anaglyph fringes, so the range compounds instead of only adding.

### 5. Export & Embed (EE) — 8.5 (held, not 9)
- Round 6 closes one of Round 5's EE blockers properly: the export
  flash gate no longer inherits a long-loop blind spot. A 60 s loop
  is now measured at its true rate, so an over-limit long export
  cannot slip through on an aliased 0/s reading (see PR). The gate
  itself — rate-naming confirmation, disabled Export until
  confirmed, re-check before `setBusy` — is unchanged and was
  verified in Round 5's studio run.
- What blocks 9, unchanged: (a) the gate is consent-based by design
  — an explicit confirmation still exports a non-compliant file,
  which is the right UX but not "cannot export non-compliant";
  (b) when `TM.Safety` is unavailable or a check fails outright and
  the preset estimates are empty, the export proceeds with a
  "Couldn't check" warning — the gate cannot block on a measurement
  it never got, and the glitch preset's own `flashes()` estimate
  still returns 0 for a layer `TM.Safety` measures at 3.5/s; (c)
  there is still no iframe / web-component route for uploaded fonts;
  (d) the export/embed suites were not re-run by this judge, so the
  Round 3 MP4/WebM PSNR evidence is held, not freshly verified
  against the current tree.
- *What would move this up:* re-run the export suite on the current
  tree with real fonts; fix the glitch `flashes()` estimate; close
  the unknown-measurement path (or make it block, not warn); and an
  uploaded-font route for iframe/component embeds.

### 6. Studio UX & Visual Design (UX) — 8.0 (held)
- Nothing in Round 6's evidenced scope changes studio UX: no studio
  file is in the path/safety scope, and the safety notes explicitly
  defer the studio-side consequence (debounce/cache for a slow
  long-loop check) to a future studio change. The Round 5 studio
  result (74 passed, 3 failed on font-tunnel console errors only,
  gate-aware export section passing) is therefore held, not
  re-verified here.
- What holds it back, and what Round 6 makes more pressing: a 60 s
  flash check now takes 17–40 s in this sandbox (see PR), so if the
  studio re-runs it on every edit, the UX cost of the safety fix
  lands directly on the editor — the deferred debounce/cache work is
  now the studio's most concrete next item. The Round 3 UX debts are
  untouched — Gravity slider jank (100–199 ms per step), Deep Space
  `_adapt` timing, dead controls, and no keyboard / focus / contrast
  audit by this lens; the gate's re-block/clear paths are still not
  in `tests/studio.mjs`, and the phone section still only checks
  that Export opens.
- *What would move this up:* gate re-block/clear tests, a phone gate
  check, debounce/cache (or a progress treatment) for long-loop
  checks, the Gravity slider and `_adapt` fixes, dead-control
  cleanup, and a keyboard/accessibility audit on desktop and phone.

### 7. Performance & Robustness (PR) — 8.5 (up from 8.0)
- **The Round 5 blocker is fixed, and this judge reproduced the fix,
  not just the claim.** `node tests/flash-long-loop.mjs` exits 0:
  60 s @ 60 fps, 15 Hz strobe analysed at 3600 frames / 60 fps reads
  **15/s, ok=false** (was 0/s, ok=true under the 900-frame cap);
  60 s 4 Hz control reads 4/s, ok=false, unchanged as expected below
  the old Nyquist limit; 2 s 15 Hz control reads 15/s, ok=false;
  60 s saturated-red strobe reads 15/s general and 15/s red,
  ok=false; the 4 s seam pulse (white on frame 0 only) reads exactly
  1/s, ok=true, proving cyclic seam analysis survived the rewrite;
  the 4 s 15 Hz anchor reads 15/s. Short loops are unchanged by
  construction — the transition counting and worst-field counting
  are untouched in the diff, and any loop of ≤ 900 frames has exactly
  the frame count it had before.
- **Slicing design audit — sound, with one contract caveat.** The
  cap is gone, not raised: `n = round(duration × fps)` and
  `opts.maxFrames` is deliberately ignored, with the reason stated
  in the comment (any downsampling reintroduces aliasing above the
  new Nyquist limit). The only in-tree caller that passed it,
  `tests/smoke.mjs` (`maxFrames: 240`), is unaffected: those are 4 s
  loops at 60 fps, i.e. exactly 240 frames at full rate. Rendering
  proceeds in 240-frame slices into preallocated series, and the
  analysis runs once over the complete series, so seam handling and
  red-flash counting are the same code paths as before — only the
  frame count grew. The page yields inside a slice whenever
  `yieldMs` of work has elapsed, and additionally at every slice
  boundary even if a caller passed a large `yieldMs`, so a long loop
  cannot hold the studio's event loop for a whole slice's work.
  Memory is bounded for the contract the function documents — a
  *normalised* scene: `Scene.normalize` clamps duration to 0.5–60 s
  and fps to [24, 25, 30, 50, 60], so at most 3600 frames:
  576 cells × 3600 × 4 bytes × 2 series ≈ 16.6 MB, plus two Int8 hit
  arrays of ≈ 2.1 MB each (both figures check). The caveat, correctly
  disclosed in the safety notes, is that `flashes()` itself does not
  clamp: a direct caller passing a raw 600 s @ 60 fps scene would
  allocate ~166 MB of series and take ~10× longer. Studio callers
  pass normalised store scenes, so this is a hardening gap for a
  public API, not a normal-path bug — but a safety function that
  trusts its caller to bound its own allocation is not yet a 9.
- **Timing claim does NOT reproduce in this sandbox — the round's
  one overstated claim.** The safety notes report a 60 s check at
  "~5 s" (5044–5205 ms, 4506–4816 ms, 4362 ms). This judge measured
  38.2 s / 40.9 s / 39.1 s in-page for the three 60 s cases in the
  full test run, and 16.7 s for a single isolated 60 s case. Part of
  the full-run figure is sequential long cases back-to-back on a
  software raster, but even the isolated 16.7 s is 3.3× the claim.
  This is not a correctness regression — the old capped version was
  faster precisely because it analysed a quarter of the frames and
  lied about the result — but it changes the product reading: on
  this hardware a long-loop export gate costs tens of seconds, not
  five, and the studio debounce/cache work is not optional polish.
  Real-hardware timing is still unmeasured, and the claim should be
  restated as sandbox-measured, not as a general "~5 s".
- Other PR limits unchanged: the 200 ms frame budget is a guardrail,
  not a 60 fps claim, and varies run to run on a software raster;
  Gravity main-thread re-simulation and Deep Space `_adapt` are
  untouched; "holds 60 fps at 1080p" is still not demonstrated.
- *What would move this up:* a hardware-measured long-loop timing
  (and a restated claim); debounce/cache or a progress treatment for
  studio re-checks; clamping or streaming inside `flashes()` itself
  so the bound does not depend on the caller; a split
  preset/template budget on real hardware; Gravity off the main
  thread; and a watched real-font CI run.

### 8. Engineering Quality (EQ) — 8.5 (held, not 9)
- Round 6's engineering is the round's other strength, and it is
  visible in what was *not* done as much as what was: the safety
  test was rewritten to pin the fixed behaviour, not weakened to
  accommodate it (the 60 s strobe case now expects `ok: false` at
  ~15/s, with controls, red and seam cases asserted alongside);
  the path agent built and rejected a plausible fix on measured
  evidence (spacing worsens Loop) instead of shipping its headline
  number; both diffs are scoped to their files, add no new params or
  look names, keep preset APIs unchanged, and add no
  `Math.random`/`Date`/`performance.now` to rendering paths, so loop
  seams are structurally preserved. The sweep rows are freshly
  verified by this judge (see Method): path-flow 22 configs, 0
  render errors, deterministic, worst seam 1.00×; path-draw
  16 configs, 0 render errors, deterministic, worst seam 0.00× —
  identical to the path notes' rows, with only font-tunnel console
  errors on both.
- What blocks 9: the `flashes()` bound is a documented contract, not
  an enforced one (see PR); the working tree remains uncommitted and
  mixed with other agents' Round 6 work, so the round's diff is not
  yet in a reviewable, committable state; mutation catch is still
  8/23 from Round 3, the renderer's no-mutation contract still has
  no guard or test, the path trim remains a tuned heuristic with a
  known seam blind spot, the glitch `flashes()` estimate mismatch
  is still open, and the new CI jobs from Round 5 have still not
  been watched running on GitHub Actions.
- *What would move this up:* a watched first CI run of the new jobs;
  mutation and no-mutation-guard tests; a seam-aware offset
  algorithm; normalisation (or streaming) inside `flashes()`; and
  the tree committed with Round 6's diff separated from carry-over.

## Ranked gaps that block 9/10

1. **Verification is still sandbox-only, and the safety fix's cost is
   understated.** Every font-dependent claim is fallback-only; the
   long-loop check takes 16.7 s isolated and 38–41 s back-to-back in
   this sandbox, not ~5 s; the studio has no debounce/cache for
   re-checks; and `flashes()` trusts its caller to normalise. Until
   there is a real-font, real-hardware run with restated timing, PR
   and EE cannot reach 9.
2. **Path hard geometry is managed, not closed.** Draw On Loop
   overlaps (1.31 px, 16.82 px) remain by design; Draw On Frame
   horizontal clipping is measured but undecided (≤ 5.4 px at
   108 px); seam folds are still untrimmed in `offset()`; Spiral has
   no scale floor; the Stack descender verdict is still open — and
   all of it is measured at one type size on fallback fonts. These
   cap PC, and through it the "make a real deliverable" case.
3. **No creative or UX breadth in this round's evidenced scope.**
   No new preset, template, combinable effect, or studio improvement
   is evidenced in Round 6; the export gate's consent-based and
   unknown-measurement paths, the glitch estimate mismatch, the
   uploaded-font embed gap, Gravity jank, `_adapt`, dead controls
   and accessibility are all unchanged. A 9 needs a creative + UX
   round on top of this fixes round, not just more fixes.

## Verdict

Round 6 is the round Round 5 asked for: it removes the one safety
finding that made the export gate untrustworthy for long loops, with
a slicing design that is correct, bounded for normalised scenes, and
honest about its one contract caveat — and it finishes the
closed-lane path work, clearing Travel/Still pile-ups, a real Fill
seam bug, and all but the lane-crossing Draw On overlaps, while
refusing two tempting wrong fixes (spacing along a folding lane, a
silent horizontal clamp). It is not a 9/10 round because its timing
claim does not reproduce in this sandbox, its path evidence is
single-size and fallback-only, its remaining path gaps are managed
rather than closed, and it adds no creative or studio breadth.
**Overall 8.25 (mean 8.25), up from 8.06 on this lens — the safety
blocker is gone, the path work is nearly done, and the remaining
distance to 9 is real-font / real-hardware proof plus a creative
round, not another fixes round.**
