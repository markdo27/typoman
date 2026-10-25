# Round 6 — Path notes (path agent)

Scope kept strictly to `js/presets/path-flow.js`, `js/presets/path-draw.js`
and this note. No engine, boot, template, studio, export or other preset
file was touched. No commit, no push. If a fix truly needs engine help it
is listed under "Remaining path gaps", not patched in.

## Method — verify before fixing, and read the metric before trusting it

All measurements below are from Chromium harnesses kept in `/tmp`, not
the repo (`/tmp/path-harness.mjs` from Round 5, plus
`/tmp/r6-flow.mjs`, `/tmp/r6-draw3.mjs`, `/tmp/r6-frame.mjs`), booting
the engine, patching `TM.Frame.prototype.drawGlyph` to record glyph
centres/rotations/scales without drawing, and rendering at 960×540 with
65 px type — the Round 4/5 geometry. Google Fonts do not load in this
sandbox (see Verification), so all widths are fallback-font widths and
every number below carries that asterisk, exactly as in Round 5.

Two box models are reported for Draw On, because the difference between
them is the story of this round:

- **Mean-half-width model** (Round 5's harness): both boxes in a pair use
  the mean of the two glyphs' half-widths, half-height 0.35 × size.
  This is what produced Round 5's "13 → 5" and this round's "42 → 9".
- **Per-glyph model**: each box uses its own glyph's half-width
  (`w × scale / 2`), same half-height. This is the true geometry of the
  drawn boxes. On it, Round 5's baseline is 33 adjacent overlaps, not
  42 — the 9-count difference is pairs like I–N, where the mean model
  gives the narrow I the wide N's half-width and invents an overlap
  that the real boxes do not have. All "cleared" claims below are
  checked on both models; a pair that is 0 on the per-glyph model but
  still counted on the mean model is a harness artefact, not a real
  overlap, and is labelled as such.

A second metric warning: the Draw On residuals are at the touching
boundary. The Round 5 residuals (zigzag 2, lissajous 2, frame 1) have
per-glyph SAT depths of 0.01–0.25 px — sub-pixel grazes, not pile-ups.
Most other shapes' "overlaps" are the same kind: 40 of the 42 mean-model
counts have depth ≤ 0.39 px. Any fix here is necessarily a ~1 px fix;
a fix that moves glyphs by 10 px to clear a 0.2 px graze would be worse
than the graze. The two Loop pairs (below) are the exception, and they
are deliberately NOT cleared.

## 1. Path Flow Travel/Still on closed lanes — fit extended (fixed)

Claim verified. Before, a single run longer than its tracked lane
wrapped in `at()` and piled onto its start, in both modes, at every
phase: Star long ("TYPE IN MOTION TYPE IN MOTION") Travel close pairs
(<15 px) 5 / 3 / 6 / 8 at p = 0 / 0.25 / 0.5 / 0.75, minimum pair
distance 3.6–6.0 px; Still 5 at every phase, minimum 3.6 px. Circle
long had the same disease in miniature: 1 close pair, minimum 13.6 px.

Fix (`path-flow.js`, Travel/Still branch only): per line, on a closed
path, `fit = min(1, lane.length / line.width)` — the same capacity
argument as Round 5's Fill fit — and place glyphs at
`s0 + ((g.x - x0) + g.w / 2) * fit` with `place(..., fit)` as the glyph
scale, so advances and glyph sizes shrink together. `s0` itself is
untouched: the travel start position (offset, direction, ease, cycle)
and the still offset keep exactly their old meaning, and the run still
travels the full loop and still crosses the seam — it just no longer
overlaps itself when it does, because the run now fits the loop. Open
paths keep fit = 1: their overflow is meant to scroll off and fade at
the ends, and the open-path controls are byte-identical (Wave long
Travel 6 calls, Still 21 calls, both unchanged; Wave short Still
unchanged).

After, same harness:

| case | before close / min | after close / min | scale |
|---|---|---|---|
| Travel Star long, p 0 / .25 / .5 / .75 | 5/3/6/8, 3.6–6.0 px | 0 / 0 / 0 / 0, 17.5–19.1 px | 0.437 |
| Still Star long, all p | 5, 3.6 px | 0, 17.5 px | 0.437 |
| Travel/Still Circle long | 1, 13.6 px | 0, 30.8 px | 0.932 |
| Travel/Still Circle short | 0, 33.1 px | 0, 33.1 px | 1 (unchanged) |
| Travel/Still Frame long | 0, 28.9 px | 0, 28.9 px | 1 (unchanged) |

One deliberate non-identity: Travel/Still Star *short* now scales to
0.887 (minimum pair distance 24.9 px → 53.5 px). Its line already
exceeded its lane capacity by ~13% — the baseline's 24.9 px was the
first and last glyphs nearly meeting at loop closure, not a clean fit —
so the fit correctly fires there too, exactly as Fill already shrank
the same short text to 0.746 (Fill's unit also carries gap + separator).
Short text that genuinely fits its lane (Circle short, Frame long) is
unchanged. No new param, no API change; `place()` already took a
`scale` argument from Round 5.

### 1b. Fill closed-repeat seam — found while verifying §1 (fixed)

The same harness exposed a pre-existing Fill bug that Round 5's
controls (calls + scale only) could not see. Fill on Circle short:
26 calls, scale 1, but the separator of one repeat landed 2.8 px from
the first glyph of the next repeat — a real pile at the seam.

Cause: the repeat count was chosen from the *fitted* unit. When
`round(lane/unit)` rounded UP (Circle short: lane/unit ≈ 1.7 → 2
repeats), the unit was compressed to `lane/reps` while glyphs stayed
full size, so a repeat no longer fit inside its own unit.

Fix (`path-flow.js`, Fill branch only): choose `reps` from the
*unfitted* unit, then cap the fit by the whole tiled run:
`fit = min(1, lane / (reps * unit0))`, and tile at `unit = lane/reps`
(which equals the fitted unit exactly when the fit fires). When
`reps * unit0 <= lane`, fit stays 1 and the gap stretches as before,
so every Fill row that was already correct is untouched.

After: Fill Circle short scale 1 → 0.796 (two full-size repeats cannot
fit the lane, so the fitted size is lane / (2 × unit)), close pairs
2 → 0, minimum pair distance 2.8 px → 26.4 px, calls still 26. Fill Frame long, the other
compression case, moves 1 → 0.97 with close pairs 0 → 0 (its 3% gap
compression had not piled, so this is a correctness change, not a
visible one). Fill Star short/long, Wave and Circle long are
byte-identical (scales 0.746 / 0.399 / 0.853, same calls, same minima).

## 2. Draw On — vertex-local shrink chosen over per-pair spacing (improved to the honest floor)

Claim verified. Round 5 baseline on the 22-shape table (default params,
p = 0.55, "TYPE IN MOTION"): mean model 42 adjacent overlaps,
per-glyph model 33, of which only 2 have depth > 0.5 px — both on Loop
(see below). The Round 5 six-shape subset is zigzag 2, heart 0, star 0,
lissajous 2, frame 1, circle 0, as reported.

Two candidate fixes were built as route overrides and measured on the
full 22-shape table before either was adopted:

- **Per-pair spacing** (SAT depth → push the later glyph along the
  lane by depth + 1 px, cumulative): mean 42 → 11, per-glyph 33 → 2.
  It clears zigzag, lissajous and frame. But it *worsens* the worst
  pair in the whole table: Loop N–M depth 18.79 px → 21.37 px
  (per-glyph), because on a self-crossing lane, moving forward along
  the lane moves a glyph *toward* its predecessor in Euclidean space
  where the lane folds back. Spacing along the lane is not separation
  in space on a folded lane. Rejected for that reason, not for its
  headline total.
- **Vertex-local pop-shrink** (SAT depth → shrink only the later
  glyph, iterating to a 20% cap, by just enough to clear): mean
  42 → 9, per-glyph 33 → 2, and it worsens *nothing* — shrinking a box
  can only reduce its overlaps, and it moves no glyph along the lane,
  so pen timing, lead and lane positions are untouched.

Fix adopted (`path-draw.js`): a `boxDepth()` SAT helper (per-glyph
boxes, half-height 0.35 × size × scale) and, in the glyph loop, a
shrink pass after the pop scale is finalised: while the glyph's box
touches its predecessor's box, shrink it in steps of at most 20%,
capped at 20% total, for at most 3 iterations. The box uses the lane
angle, not the pop tilt, and the lane point, not the rise offset —
both differences are zero at full pop, when the harness measures, and
during pop the glyph is smaller anyway. Straight segments
(depth ≤ 0) are untouched, the pop envelope elsewhere is untouched,
and no new param or look name is added. The shrink is a multiplier on
the existing pop scale `sc`, so it reads as a slightly smaller pop for
exactly the glyphs that would otherwise touch — not a global pop
change.

After, 22-shape table (mean / per-glyph, depth > 0.5 px in brackets):

| shape | before | after |
|---|---|---|
| line, diagonal, bounce, spiral, circle, heart, star | 0 / 0 | 0 / 0 |
| arc, wave, scurve, ribbon, double-loop, blob, infinity | mean 4/4/1/1/1/1/1, per-glyph 3/3/0/0/0/0/0 | mean 1/1/1/1/1/1/1, per-glyph 0 |
| swoosh, ellipse, orbit, square | 3/4/4/2, per-glyph 3/4/4/2 | 0, per-glyph 0 |
| zigzag, lissajous, frame | 2/2/1 (Round 5 residuals) | 0, per-glyph 0 |
| loop | 8, per-glyph 6, depth>0.5: 2 | 2, per-glyph 2, depth>0.5: 2 |

Totals: mean 42 → 9, per-glyph 33 → 2, depth > 0.5 px 2 → 2.
The 7 remaining mean-model counts (arc, wave, scurve, ribbon,
double-loop, blob, infinity, 1 each) are all 0 on the per-glyph
model — mean-model artefacts for asymmetric pairs (narrow I against
wide N/O), where the preset's true boxes separate but the mean model
still counts a touch. They are not real overlaps and the preset
correctly does not shrink for them; matching the mean model in the
preset (giving a narrow glyph its neighbour's half-width) would be
gaming the harness, not fixing geometry.

Shrink magnitudes: non-Loop glyphs shrink 1–2% (e.g. zigzag scales
1, 0.984, 0.985; lissajous 1, 0.989; frame 1, 0.988) — invisible.
Loop's M sits at the 20% cap and its I–N pair improves 3.51 px →
1.31 px, N–M 18.79 px → 16.82 px; the cap is what stops the shrink
from chasing those two pairs into invisibility.

### Why Loop's two pairs are left, not cleared

Loop I–N (depth 3.51 px) and N–M (depth 18.79 px) are not corner
grazes: the lane itself crosses there, so adjacent glyphs in layout
sit on different branches that happen to be near each other in space.
Clearing N–M would need either a >50% shrink or a >20 px move along a
folding lane — and the spacing experiment proved the move makes it
worse. This is a shape/text-size property (Loop at 65 px type with
this text), not a vertex-spacing property. Options for a future round
are a Loop-specific lane (wider loop, smaller default type for that
shape) or an explicit "Loop overlaps at this size" note — not a bigger
shrink cap, which would just make one glyph tiny while still
overlapping.

## 3. Frame horizontal clipping — no guard added, by measurement (design decision documented)

Claim checked, guard NOT added, as the brief's condition requires.

Measurements (Draw On on Frame, box = oriented glyph box, frame =
960×540 unless stated):

- Default 65 px type: spread/above box x 1.4–955.6 px (inside by
  1.4 px), spread/below 56.2–903.8 px, centre/above on the top edge
  only, start/above inside, end/above box x 1.7 px inside. There is
  *no* horizontal clipping to fix at the size Round 5 measured, because
  the Round 5 vertical clamp already pulls the lane inward by the same
  scalar `up`: the vertical headroom (0.6 × capH ≈ 27 px) covers the
  side-edge box extent (≈ 22.75 px) at this size. A horizontal guard
  would not fire at all here.
- Larger type, 108 px: spread/above box x −5.4 px (5.4 px off the left
  edge), centre/above box x −1.3 to 962.3 px, end/above −2.9 px, while
  vertical boxes stay inside (box y 5.6–6.6 px). So horizontal
  clipping is real but small (≤ 5.4 px, corner glyphs only) and only
  above the default size.
- Gap 0.16 → 1.0 em at 65 px changes nothing (the vertical clamp
  already caps `up` at the same value); 1:1 and 9:16 spread cases stay
  inside by 4.4 px.

Why neither guard form is look-neutral, so neither was forced:

- A scalar `up` guard (the vertical clamp's mirror) would move the
  *whole* marquee inward by the horizontal excess at large sizes,
  shrinking the designed gap to the stroke for every glyph, including
  the top/bottom glyphs that are already clamped. That is exactly the
  "pull the whole marquee inward and change the outside-the-frame
  look" that Round 5 deferred.
- A per-glyph x-clamp (nudge only the glyphs whose boxes actually
  leave the frame) would preserve the gap for everyone else, but it
  would move intentionally cropped glyphs inside the frame and detach
  them from the lane — and for a custom closed path whose points are
  intentionally off-frame, the text following the pen off-frame is
  the design, not a bug. The clamp cannot tell Frame's inset border
  (where off-frame is a bug) from a custom path (where it may be
  intentional), and it cannot tell a marquee that is meant to be
  cropped by the canvas edge from one that is meant to stay inside.

Design decision needed from the parent (not invented here):

1. Should Draw On text on a closed path *ever* be cropped by the
   canvas edge, or must it always stay inside? (The vertical clamp
   already answers "must stay inside" for top/bottom; horizontal
   needs the same answer explicitly.)
2. If it must stay inside: scalar `up` guard (whole marquee moves,
   gap shrinks) or per-glyph x-clamp (only clipped glyphs move, off
   the lane)? And does it apply to all closed paths or only to the
   Frame shape, where the border is inset by design?
3. What minimum gap to the stroke must survive the guard? At 108 px
   a scalar guard would leave the vertical boxes ~0 px inside — the
   guard needs a floor, or it trades horizontal clipping for
   vertical clipping.

Until those are answered, the 65 px default is already clean and the
108 px effect is ≤ 5.4 px on corners; forcing a guard now would
change a look to fix a marginal case. The Round 5 vertical clamp
(`upClamped`, headroom 0.6 × capH) is untouched — Frame centre/above
still has lane-centre minimum y 27.2 px, exactly as in Round 5.

## Verification

- `node --check` passes on both changed files.
- Custom Chromium harnesses (above, same box models before/after):
  Path Flow Travel/Still piles removed on Star and Circle at every
  phase; Fill Circle seam pile removed; Draw On Round 5 six-shape
  residuals 5 → 0 (mean model) and 22-shape per-glyph residuals
  33 → 2 (Loop only); Spiral and Stack controls from the Round 5
  harness are byte-identical (Spiral long: crowded pairs 0, scales
  0.511; Spiral short: min/mean adjacent distance 28.7/43.3 px),
  because neither file was touched for them.
- `npm run test:sweep` (full suite, 602 configurations, 41 presets +
  16 templates): path-flow 22 configs, 0 render errors, deterministic,
  worst seam 1.00×; path-draw 16 configs, 0 render errors,
  deterministic, worst seam 0.00× — identical to Round 5's rows. The
  suite exits non-zero on the sandbox limit only, as in Round 5:
  every failure entry for these two presets is a Google Fonts
  `ERR_TUNNEL_CONNECTION_FAILED` console error (path-flow 6,
  path-draw 3), with no render throw, determinism failure or seam
  failure in either row. Because the sweep exits non-zero, its
  trailing `test:motion` step was not reached, as in Round 5.
  (The suite-wide "22 problems" render/seam figure includes other
  presets' seam flags, e.g. axis-wave 4.24× in the table; those are
  outside this scope and untouched here.)
- Golden rules kept: no `Math.random`/`Date`/`performance.now`
  added, no new params or look names, preset APIs and param names
  unchanged, drawing still via `f.drawGlyph`, integer-cycle motion
  untouched, so loop seams are as the sweep shows. Flash behaviour
  is unchanged in kind (no new flashing motion; the fits only shrink
  glyphs on overflowing closed lanes, and the shrink only makes
  vertex glyphs slightly smaller).

## Remaining path gaps (for the parent / engine team, not patched here)

1. Draw On Loop: I–N (1.31 px) and N–M (16.82 px) adjacent overlaps
   remain at 65 px type (see §2). They are lane-crossing overlaps,
   not vertex grazes; do not raise the shrink cap or push along the
   lane to chase them — both were tried and the push made N–M worse.
2. Draw On Frame horizontal clamp: see §3 — needs the three design
   decisions listed there, not a silent clamp. Measured effect at
   default size is zero; at 108 px it is ≤ 5.4 px on corners.
3. Folds straddling a closed path's seam are still untrimmed in
   `offset()` (Round 4 rendering notes §6) — engine scope, untouched
   here; the rounded carrier sidesteps it for Draw On lanes but Path
   Flow's non-carrier paths are unaffected.
4. Spiral at extreme length: glyphs shrink without a floor (Round 5
   §3) — product decision, not invented here.
5. Stack descenders: see Round 5 §4 — needs its owning agent, with
   the exact test text and extrude variants named there; unchanged
   in this round.
6. All type measurements in this round are single-size (65 px),
   fallback-font, as in Round 5. Re-measurement on real fonts and at
   a second type size would be needed before any of the sub-pixel
   graze counts are treated as product-visible defects — the
   per-glyph model already shows most of them are at or below 0.4 px
   of depth.
