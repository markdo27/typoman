# Round 5 — Path notes (path agent)

Scope kept strictly to `js/presets/path-flow.js`, `js/presets/path-draw.js`,
`js/presets/spiral.js` and this note. No engine, boot, template, studio,
export or other preset file was touched. If a fix truly needs engine help it
is listed under "Remaining path gaps", not patched in.

## Method — verify before fixing

All measurements below are from a Chromium harness (`/tmp/path-harness.mjs`,
kept out of the repo) that boots the engine, patches
`TM.Frame.prototype.drawGlyph` to record glyph centres/rotations/scales
without drawing, and renders at 960×540 with 65 px type — the Round 4
geometry. Google Fonts do not load in this sandbox (see Verification), so
all widths are fallback-font widths; the Round 4 numbers quoted for
comparison (Star ~700 px line on a ~506 px lane) are the judges' real-font
figures, and the fallback figures are reported alongside them so the two
are never conflated. Draw On overlaps use oriented boxes per adjacent
glyph pair: half-width = advance × scale / 2, half-height = 0.35 × size,
SAT-tested — a stricter box than Round 4's fixed 22×40 px boxes, so its
absolute counts are not directly comparable to Round 4's; the before/after
comparison on the same harness is.

## 1. Path Flow on Star — Fill mode now fits the lane (fixed)

Claim verified. A tracked lane's `.length` IS its text capacity: the
tracking re-parameterisation has already spent the bends' room. In the
harness the Star lane capacity is ~503 px (fallback line 530.9 px, unit
with gap + separator ~674 px, so the fit factor below is 0.746 — consistent
with the judges' ~506 px capacity). Before the fix, a line longer than
the capacity wrapped in `at()` and piled onto the start.

Fix (`path-flow.js`, Fill mode only): on a closed path, scale the whole
repeat — glyph sizes and advances, as Draw On's fit pass does — by
`fit = min(1, lane.length / (line.width + gap + separator))`, and place
glyphs and the separator at the scaled positions. One repeat then fills
the loop exactly and nothing wraps onto itself.

- Star, short line ("TYPE IN MOTION", fallback 530.9 px): scale 1 →
  0.746, minimum pair distance 24.9 px → 35.3 px, close pairs (<15 px) 0 → 0.
- Star, definitely-overflowing line ("TYPE IN MOTION TYPE IN MOTION",
  fallback 1078.6 px): scale 1 → 0.399, close pairs 5 → 0, minimum pair
  distance 3.6 px (a genuine pile) → 18.5 px.
- Controls unchanged: Wave (open path, fit stays 1) 20 calls, scale 1;
  Circle (line fits its lane) 26 calls, scale 1. Open paths are
  deliberately untouched: their overflow is meant to scroll off and fade
  at the ends. Travel/Still modes are also untouched — see Remaining gaps.
- No new param, no API change; `place()` gained an optional `scale`
  argument defaulting to 1, and the pop/guide code paths are unaffected.

## 2. Draw On — rounded carrier lane, and the Frame off-top fix (improved, not zero)

Claim verified. Before: adjacent-box overlaps zigzag 3, heart 1, star 4,
lissajous 3, frame 2, circle 0 (this harness's box; Round 4's was 2, 2, 1,
2, —, 0 on the same shapes).

Fix (`path-draw.js`, `laneTable`): the lane is now taken off a rounded
carrier — `path.rounded(R, R, { limit: capH × 2.85 }).lane(-up)` — instead
of the plain `path.offset(-up)`, then bend-spaced as before
(`.spaced(capH / 2)` unchanged). `R = |up| + 0.7 × capH`, so the lane
itself keeps ~0.7 × capH of radius on its inside, and the deviation cap
mirrors Path Flow's 2 em limit. At an acute vertex the plain offset lane
turns ~90° between neighbours, so tall boxes touch even when spaced
correctly; the fillet spreads that turn over an arc so neighbours rotate
gradually. The stroke is still drawn on the original path, so at a sharp
point the text lane cuts the corner by up to that deviation — the price
of the smoothing.

After: zigzag 3 → 2, heart 1 → 0, star 4 → 0, lissajous 3 → 2,
frame 2 → 1, circle 0 → 0 (total 13 → 5). The remaining pairs are
corner touches at 42–53 px centre distance (rotated boxes' corners
reaching each other), not pile-ups. Larger radii were tried and rejected:
R = |up| + 1.0 × capH and + 1.2 × capH both clear zigzag (0) but push
lissajous to 3 and frame to 2 (total still 5) — the extra rounding moves
glyphs onto neighbouring branches/corners. 0.7 × capH is the best total
on this harness. The pop animation geometry is unchanged in structure:
rise, tilt, pen/eraser timing and the pop scale all still read from the
same lane table; only the lane curve itself moved.

Fix (`path-draw.js`, `upClamped`): on a closed path with side above/below,
the lane is pulled back toward the stroke just enough that the glyph top
(0.6 × capH: half the cap height plus pop-overshoot headroom) stays
inside the frame — symmetrically at the bottom for "below". This fires
only when the lane actually leaves the frame, and only on the vertical
extremes, so other shapes are unchanged. Frame, above, at 65 px type:
lane-centre minimum y 12.9 px → 27.2 px (glyph top was ~−10 px, now
~+4 px at full scale, ~+11 px allowing for the pop overshoot — the
centre now sits closer to the stroke, which is the unavoidable price of
fitting inside the frame). The same clamp is used in the fit pass and in
the render loop, so the fit factor and the drawn lane agree.

## 3. Spiral — centre fit guard (fixed for the measured case)

Claim verified. Before, long text (119 characters, "TYPE IN MOTION "
repeated) compressed its advances but drew glyphs at full size: mean
adjacent centre distance 20.2 px for ~40 px glyphs, 90 of 95 adjacent
pairs crowded (distance < 0.7 × effective glyph width), first ten
glyphs 20–44 px from the frame centre, minimum adjacent distance
12.5 px — the knot the judges described.

Fix (`spiral.js`, `setup`/`render` only): two guards, both continuous at
compression factor k = 1 so short text is unchanged:
- the inner radius grows with the compression, from 0.08 up to 0.28
  (`r0 = min(0.28, 0.08 + (1 − k) × 0.35)`), rebuilding the spiral once;
- glyphs scale down with the same factor k as their advances
  (`scale: C.glyphScale`), so a compressed run keeps its advance/width
  ratio instead of overlapping. Text is never truncated.

After, same 119-character text: glyph scale 0.511, crowded pairs 90 → 0,
first ten glyphs 62–80 px from the frame centre, mean adjacent distance
23.8 px (against ~20 px effective glyph widths), minimum 14.7 px.
Short text ("TYPE IN MOTION") is byte-identical in the harness: 12 calls,
minimum adjacent distance 28.7 px, mean 43.3 px, before and after.
No new param; `glyphScale` and `innerRadius` are new cache fields only.
For text many times the capacity the glyphs keep shrinking (there is no
scale floor) — readable proportions, small type, rather than a knot;
that trade-off is deliberate and documented here.

## 4. Stack descenders — discrepancy, NOT fixed here (out of scope)

`js/presets/stack.js` was not edited, as instructed. The discrepancy is
real in the Round 4 documents and is not resolved by code inspection
alone:

- Art-director judge: "Stack descenders are ink-aware" / "Fixed in HEAD
  (ink-measured rows)".
- Motion-designer judge: "Stack's lowercase descenders still collide/clip
  (block height uses cap height only)".
- Rendering notes §3: "Block height in `text.js` uses cap height only, so
  Stack's lowercase descenders still collide/clip (round-3 bug 5)".

What the current `stack.js` actually does (read, not edited): `setup()`
measures every row's whole run with `measureText` and sets
`inkH = asc + desc` (with `asc` floored at half the cap height), and
`render()` scales each row by `h / inkH` and centres its ink with
`oy = (asc − desc) / 2`, so a row's ink fits its band exactly by
construction. The "cap height only" height the other judges cite is
`text.js`'s block height, which Stack does not use for its band heights.

Test text used for the check: "big gypsy jumping" (rows from words:
"big", "gypsy", "jumping" — every row carries descenders g/j/p/y).
A pixel check of a rendered Stack scene with that text in this harness
gives three clean ink clusters with blank gaps of 30 px and 28 px
between them — no merged rows, which supports the art-director reading
for the default scene. That does not close the motion-designer's claim:
it may have been tested on an older snapshot, with extrude on (extrude
offsets are not part of the band math), or on a font whose
`actualBoundingBoxDescent` differs. Recommendation for the parent:
assign the Stack owner to re-render exactly "big gypsy jumping" (and a
descender-heavy single row, e.g. "jumping gypsy") with extrude on and
off on a real font, and to check ink against band boundaries — do not
reassign this to the path agent, and do not let a Stack fix ride on
this round's path files.

## Verification

- `node --check` passes on all three changed files.
- Custom Chromium harness (above), before/after on the same box model:
  Path Flow Star pile removed, Draw On total adjacent overlaps 13 → 5,
  Spiral crowded pairs 90 → 0, all controls unchanged (Wave, Circle,
  Spiral short text identical).
- `npm run test:sweep` (full suite; the script takes no per-preset filter
  — it ran all 602 configurations, 41 presets + 16 templates):
  path-flow 22 configs, 0 errors, deterministic, worst seam 1.00×;
  path-draw 16 configs, 0 errors, deterministic, worst seam 0.00×;
  spiral 7 configs, 0 errors, deterministic, worst seam 1.00×.
  The suite's overall FAIL is the sandbox limit only: every failure
  entry is a Google Fonts `ERR_TUNNEL_CONNECTION_FAILED` console error,
  affecting 24 presets/templates alike (path-flow 6, path-draw 3, spiral
  fonts load through the same failing route), with no render throw,
  determinism failure or seam failure in any of the three rows. The
  suite exits non-zero on those font errors, so its trailing
  `test:motion` step was not reached; that is a pre-existing sandbox
  limit, not a regression from this round.
- Golden rules kept: no `Math.random`/`Date`/`performance.now` added, no
  new params or look names, preset APIs and param names unchanged,
  drawing still via `f.drawGlyph`, integer-cycle motion untouched, so
  loop seams are as the sweep shows. Flash behaviour is unchanged in
  kind (no new flashing motion; the Path Flow fit only shrinks glyphs
  on overflowing closed lanes).

## Remaining path gaps (for the parent / engine team, not patched here)

1. Draw On residuals: zigzag 2, lissajous 2, frame 1 adjacent corner
   touches remain under the strict box model. A larger carrier radius
   does not fix them (it trades them for lissajous/frame regressions,
   above). A further step would need either per-vertex spacing keyed to
   the actual box rotation (engine `tracked()`-style data for an offset
   lane, not just `spaced()`), or a pop animation that shrinks glyphs
   while they cross a vertex — both are bigger changes than this round's
   preset scope, and the second would change the pop look.
2. Draw On left/right clipping: the Frame clamp is vertical only. A
   spread/start marquee on Frame still runs off the left/right edges,
   where the lane sits outside the frame by gap + cap height. Clamping
   horizontally as well would pull the whole marquee inward and change
   the "outside the frame" look; it needs a design decision, not a
   silent clamp.
3. Path Flow Travel/Still on a closed lane: a single run longer than the
   lane still wraps and piles, because the fit in §1 is Fill-only.
   Extending it to Travel/Still needs care with the travel start
   position (`s0`) and the still offset, so it was left for a follow-up
   rather than risked here.
4. Folds straddling a closed path's seam are still untrimmed in
   `offset()` (Round 4 rendering notes §6) — engine scope, untouched
   here; the rounded carrier sidesteps it for Draw On lanes but Path
   Flow's non-carrier paths are unaffected.
5. Stack descenders: see §4 — needs its owning agent, with the exact
   test text and extrude variants named there.
6. Spiral at extreme length: glyphs shrink without a floor (see §3).
   If the product wants a minimum readable size, that is a product
   decision (floor + overflow behaviour), not something to invent in a
   path round.
