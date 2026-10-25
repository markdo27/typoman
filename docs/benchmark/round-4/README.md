# TYPOMAN Round 4 — summary (1–10 scale)

Work in this round: 8 new presets (41 registered, 43 preset files, 135 looks),
8 new templates (16 total), renderer transform-key supersampling, and
path `offset()` fold trimming. No push or commit was made in this round;
changes are uncommitted in the working tree.

## Jury scores (median of three judges, per criterion)

| Judge | MC | TQ | PC | CR | EE | UX | PR | EQ | Mean |
|---|---|---|---|---|---|---|---|---|---|
| Art Director | 8.0 | 8.0 | 8.0 | 8.5 | 8.5 | 8.0 | 7.5 | 7.5 | 8.00 |
| Motion Designer | 8.0 | 8.0 | 8.5 | 8.5 | 8.5 | 8.5 | 8.0 | 8.0 | 8.25 |
| Creative Technologist | 7.5 | 7.5 | 7.5 | 8.0 | 8.5 | 7.5 | 7.5 | 8.0 | 7.75 |
| **Median** | **8.0** | **8.0** | **8.0** | **8.5** | **8.5** | **8.0** | **7.5** | **8.0** | **8.1** |

Median overall: (8.0 + 8.0 + 8.0 + 8.5 + 8.5 + 8.0 + 7.5 + 8.0) / 8 = 8.06,
reported as **8.1/10**. This is **not 9/10**, so a Round 5 follows.

## Test evidence (integration run, Chromium 141, this sandbox)

- Sweep: 602 configurations (41 presets, 16 templates), 0 render errors,
  all deterministic. The sweep verdict FAIL in this sandbox is driven by
  Google Fonts failing to load (ERR_TUNNEL_CONNECTION_FAILED, 0/60 fonts),
  producing console-error groups — one Round 4 judge found, on dense
  re-measurement, zero seam failures (glitch-drop screen flags cleared to
  0.93×/0.87× against every step). Do not carry a "22 seam problems" claim
  forward without its own log; see the Creative Technologist scorecard.
- Smoke: fails identically to the clean HEAD baseline in this sandbox
  (font loads, italic/width-axis checks, and the pre-existing glitch-drop
  flash reading of 3.5/s). No new failure class was introduced by Round 4.
- Font-dependent verification (true italics, variable axes, width axis)
  could not be completed in this sandbox and needs a real-font run.

## Consensus blockers for 9/10 (carried into Round 5)

1. Path typography on hard geometry: Path Flow on Star piles text;
   Draw On keeps 1–2 residual overlaps on zigzag/heart/star/lissajous.
2. Flash safety is warn-only at export, and the stock glitch-drop
   template itself reads 3.5/s in smoke.
3. Share dialog hides working embed features (hover, scroll scrub,
   per-layer text); uploaded fonts have no iframe/web-component route.
4. Title-window matte may still hard-code "CINEMA" (judge disagreement
   with the creative notes; to be verified in code in Round 5).
5. Verification blind spots: flashes-a not in CI, long-loop flash
   aliasing at the 900-frame cap, no 1080p frame-cost budget.
