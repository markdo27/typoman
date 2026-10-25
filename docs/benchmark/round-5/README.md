# TYPOMAN Round 5 — summary (1–10 scale, jury pending)

Round 5 targets the Round 4 jury's consensus blockers (median 8.1/10).
No push or commit was made; changes are uncommitted in the working tree.

## What changed

- Path: Path Flow Fill mode now scales a closed-lane repeat to lane text
  capacity (Star pile fixed); Draw On uses a rounded carrier lane
  (overlaps 13 → 5 on the agent harness; zigzag/lissajous/frame residuals
  remain); Spiral centre crowding fixed for the measured long-text case.
- Safety: glitch-drop template 3.5 → 1 flash/s (rate 8 → 6); title-window
  matte no longer leaks "CINEMA" with user text; share dialog surfaces
  hover trigger, scroll scrub, and per-layer page text; export dialog
  blocks over-limit exports behind an explicit confirmation naming the
  measured rate (safe exports unchanged).
- Flash looks: cylinder Neon Drum 4 → 1/s (spin 'smooth'); Paper Column
  1:1 3.5 → 2/s (stops 6, perspective 0, shade 1), with 16:9/9:16 also
  passing. All readings are on fallback fonts in this sandbox; real-font
  confirmation is still needed.
- Verification: flashes-a added to CI, plus new long-loop flash test
  (documents 900-frame aliasing: a 60 s 15 Hz strobe reads 0/s) and a
  1080p frame-cost budget test (57/57 at a 200 ms guardrail).
- Tests: studio export test updated for the flash gate (74 passed,
  3 failed — the 3 are sandbox Google Fonts console errors at boot).

## Integration test results (this sandbox, Chromium 141)

- Smoke: templates ok 16/16. Remaining failures are font-only
  (italic/width-axis checks; 0/60 Google Fonts load via tunnel errors).
- Studio: 74 passed, 3 failed (font console errors only).
- Sweep: 602 configurations, 0 render errors, 0 determinism failures,
  0 seam failures; verdict FAIL only on font console-error entries.
- Full flashes-a (all presets, 176 configurations): all ≤3/s, failing
  only on 54 sandbox font console errors. Cylinder all aspects ≤2/s.

## Jury scores (median of three judges, per criterion)

| Judge | MC | TQ | PC | CR | EE | UX | PR | EQ | Mean |
|---|---|---|---|---|---|---|---|---|---|
| Art Director | 8.5 | 8.5 | 8.0 | 8.5 | 8.5 | 8.5 | 8.0 | 8.0 | 8.31 |
| Motion Designer | 8.0 | 8.0 | 9.0 | 8.5 | 9.0 | 8.5 | 8.0 | 8.0 | 8.38 |
| Creative Technologist | 8.0 | 7.5 | 8.0 | 8.0 | 8.5 | 8.0 | 8.0 | 8.5 | 8.06 |
| **Median** | **8.0** | **8.0** | **8.0** | **8.5** | **8.5** | **8.5** | **8.0** | **8.0** | **8.2** |

Median overall: 65.5 / 8 = 8.19, reported as **8.2/10**. Up from Round 4's
8.1, still **not 9/10**, so a Round 6 follows. Path Control and Export &
Embed reached 9.0 from one judge each, but no criterion reaches a 9.0
median.

## Known remaining gaps for the jury

- Draw On residuals (zigzag 2, lissajous 2, frame 1 on the agent harness).
- Long-loop flash aliasing (documented, not fixed — detector change).
- No iframe/web-component route for uploaded fonts (dialog warns).
- Real-font verification still outstanding for italics, variable axes,
  width axis, Axis Drift breathing, and the cylinder flash fixes.
