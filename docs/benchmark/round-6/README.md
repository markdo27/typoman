# TYPOMAN Round 6 — summary (1–10 scale)

Round 6 targets the Round 5 jury's top blockers (median 8.2/10).
No push or commit was made; changes are uncommitted in the working tree.

## What changed

- Safety: `TM.Safety.flashes` no longer caps at 900 frames. It analyses
  at full scene frame rate in 240-frame slices with yielding. A 60 s @
  60 fps 15 Hz strobe now reads 15/s and fails (was 0/s, passing);
  4 Hz control, red strobe, and seam pulse all read correctly; short
  loops are unchanged by construction (counting code untouched).
  Timing caveat: judges measured 60 s checks at ~17–40 s in-page in
  this sandbox, not the ~5 s in the safety notes — re-time on a quiet
  machine before quoting a figure.
- Path Flow: Travel/Still on closed lanes now fit to lane capacity
  (Star long close pairs 5/3/6/8 → 0 at all phases); Fill seam bug
  fixed (Circle short separator 2.8 px → 26.4 px).
- Draw On: vertex-local pop-shrink clears the Round 5 residuals
  (zigzag/lissajous/frame → 0). Remaining per-glyph overlaps are Loop
  only (I–N 1.31 px, N–M 16.82 px) — lane-crossing, not vertex grazes.
- Frame horizontal clipping: measured, no guard added — clean at
  default 65 px type, ≤5.4 px at 108 px only; neither guard form is
  look-neutral, so the decision is left open (see below).

## Jury scores (median of three judges, per criterion)

| Judge | MC | TQ | PC | CR | EE | UX | PR | EQ | Mean |
|---|---|---|---|---|---|---|---|---|---|
| Art Director | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | 8.50 |
| Motion Designer | 8.0 | 8.0 | 9.0 | 8.5 | 9.0 | 8.5 | 8.5 | 8.5 | 8.50 |
| Creative Technologist | 8.5 | 7.5 | 8.5 | 8.0 | 8.5 | 8.0 | 8.5 | 8.5 | 8.25 |
| **Median** | **8.5** | **8.0** | **8.5** | **8.5** | **8.5** | **8.5** | **8.5** | **8.5** | **8.4** |

Median overall: 67.5 / 8 = 8.44, reported as **8.4/10**. Up from Round 5's
8.2, still **not 9/10**. Only Typographic Quality sits below 8.5 in the
median, held there by fallback-font evidence in this sandbox.

## Open product decisions (needed before a further path round)

1. Loop lane: accept its 2 overlaps, shrink its default type, or build
   a Loop-specific lane / surface the overlap in the studio?
2. Frame horizontal clamp: must closed-path Draw On text always stay
   inside the canvas, or may it be cropped? Scalar guard, per-glyph
   guard, Frame-only, or all closed paths — and with what minimum gap?
3. Spiral minimum size / overflow policy for extreme-length text.
4. Export gate: hard block over-limit exports, or keep confirm-to-export
   (currently it also proceeds on a "Couldn't check" warning)?

## Remaining gaps for 9/10

- Real-font verification (italics, variable axes, width axis, flash
  rates on real Monoton / Big Shoulders Display) — impossible in this
  sandbox; needs a real-font CI run or a local run.
- No bézier editor, timing/curve editor, or editable path-key times.
- No uploaded-font iframe/web-component embed route.
- `flashes()` trusts its caller to normalise (raw 600 s scene ≈166 MB);
  studio flash re-checks are not debounced/cached for 60 s loops.
- Glitch preset's `flashes()` estimate still returns 0 where Safety
  measures over the limit.
