# Round 4 — Presets notes (presets agent)

Baseline before this round: 35 files in `js/presets/` (33 registered presets;
`motion-kit.js` and `path-kit.js` are helpers, not presets).
After this round: 43 files, 41 registered presets (8 new, all in `PRESETS_B`).

## New presets

| # | id / name | Category | Key params (defaults) | What makes it distinct |
|---|---|---|---|---|
| 1 | `ticker` / Ticker | Kinetic | cycles 1, travel 0.30 frame, lag 0.45, bob 0.08 em, direction right, fadeEdges on | The whole block slides as a marquee and bounces back on a sine with whole cycles per loop. Per-letter lag is a phase shift, never a clock shift, so the loop point stays seamless. Not a path marquee (Path Flow) and not a wave: the block itself travels. |
| 2 | `blob-reveal` / Blob Reveal | Reveal | sequence (in 0.45, out 0.30, stagger 0.5), size 1.4 capH, wobble 0.35, halo 0.12 | Radial per-letter reveal: a circle grows over each glyph, breathes while the word holds, then shrinks. Rise masks by line band; this masks by blob. The blob is always big enough at full cover to hold the whole glyph. |
| 3 | `floor-plane` / Floor Plane | Dimensional | depth 0.6, horizon 0.18 frame, rock 0.3, fade 0.4, groundLine on | Text stands as billboards on a receding floor: top (far) lines shrink toward a horizon and dim, the nearest line stays full size, and a one-cycle rock breathes the perspective. No user path, no drum (Cylinder) — a flat floor projection. |
| 4 | `ink-pen` / Ink Pen | Reveal | sequence (in 0.55, out 0.30, stagger 0.6), pressure 0.5, nib 0.18 capH, nibColor #ff2e88, lean 8° | A nib writes the fill itself, letter by letter, with seeded pressure noise swelling/thinning each letter. Outline Draw traces outlines then floods; this never draws an outline. The nib parks on the letter currently being written and hides during the hold/out. |
| 5 | `odometer` / Odometer | Reveal | sequence (in 0.5, out 0.30, stagger 0.55), steps 5, ghost 0.18, frame on | Mechanical counter drum: the same glyph slides up in quantised detents with faint reel ghosts above/below and slot rails per line. Split Flap changes characters on its drum; this never changes a character. |
| 6 | `axis-drift` / Axis Drift | Kinetic | cycles 1, range 180, lift 0.06 em, pulse 0.05; prefers Roboto Flex | Each letter breathes through the font weight on its own seeded rhythm (loopNoise per visible index). Axis Wave is a travelling, ordered sweep; this has no wave and no order. Weights snap to steps of 10 so canvas font strings stay cached. Falls back to a scale pulse on non-variable fonts. |
| 7 | `anaglyph` / Anaglyph | Glitch | split 0.05 em, depth 0.8, sway 0.3, red #ff2a2a, cyan #00d5ff, fringe 0.9 | A steady chromatic split with depth: red fringe one side, cyan the other, main glyph on top; far lines split wider and the split sways over one slow cycle. Glitch bursts, swaps and drops out; this never does — it is a continuous 3D-print look. |
| 8 | `spiral` / Spiral | Generative | turns 2.5, size 0.42 frame, spacing 1.0, spin 1, breathe 0.3 | Text winds along a generated Archimedean spiral by arc length, each glyph turned to the tangent. Orbit/Tunnel carry text on rings of a user path; this spiral is generated, breathes and spins with whole turns. Long text compresses its spacing to stay on the spiral instead of running off it. |

## Rules kept

- Determinism: no `Math.random`, `Date`, `performance.now`, or frame-to-frame
  state anywhere in the new files; only `f.loopNoise`, seeded `f.seq`/`f.rank`
  ordering, and integer-cycle sines.
- Seamless loops: every periodic term uses whole cycles per loop; sequence
  presets start and end empty, so p=0 and p→1 match.
- Resolution independence: all sizes relative to `f.size`, `f.unit`, cap height,
  or frame fractions; no hard-coded pixels (except a 1 px floor for line widths).
- Type respected: everything draws through `f.drawGlyph`; no preset pads,
  truncates, or replaces the user's text (Odometer's ghosts are copies of the
  same glyph, not different characters).
- Flash safety: no preset strobes or flips the full frame. Motion is
  letter-level, slow (≤ 2 cycles/loop except Ticker's user-set trips, which move
  the block rather than flashing it), and all in/out fades are eased. Full
  photosensitivity results are for the benchmark agent's sweep, not claimed here.

## Known limitations

- Spiral: very long text compresses spacing and letters can crowd near the
  tight centre of the spiral; multi-line text is joined in layout order with a
  word gap between lines.
- Floor Plane: a single line uses a fixed mid-depth factor (0.5), so the effect
  is subtler than on multi-line text.
- Axis Drift: on fonts with no variable weight, the weight swing collapses to
  the nearest static weights and the visible motion is mainly the scale pulse.
- Anaglyph: fringes are flat channel colours, so on gradient fills the fringes
  do not carry the gradient (the main glyph does).
- Ticker: at maximum travel the block runs well past the frame edges by design
  (a marquee); edge fade is on by default to soften that.
