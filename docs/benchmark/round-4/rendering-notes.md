# Round 4 — Rendering notes (rendering agent)

Scope kept strictly to `js/engine/renderer.js`, `js/engine/path.js` and this
note. No preset, studio, export, boot or template file was touched. Bugs found
outside those files are listed at the bottom for their owning teams, not patched.

## What changed

### 1. Transform keys now rasterise at their scale (round-3 F6) — `renderer.js`

Before, `_renderLayer` drew the layer at frame size and then scaled the finished
raster with the transform-key matrix, so a ×2 key blurred type edges ~2× (×4 at
×4). Now, when a key's scale exceeds 1.05, the layer (preset passes, motion
blur, echoes, shadow, glow, extrude) renders into a supersampled buffer and the
composite transform's linear part is divided back out (translation unchanged:
buffer points are s× frame points, so M′·(s·x) = M·x needs M′ = M/s with the
same e, f). Shadow/glow distances and blur radii are computed from the
supersampled unit, so they land with the same final size and softness as before.

- Cap: factor ≤ 2, and buffer ≤ 16 Mpx (a 2160p layer still gains ~1.4×).
  Scale ≤ 1 is a downscale (no loss) and is left alone, so every scene without
  an enlarging transform key renders byte-identically to before.
- Mattes work through the same corrected transform into the frame-sized matte
  buffer; echoes and motion blur run inside the hi buffer. Verified in a Node
  harness with stub canvases: scale-2 key → 1920×1080 buffer, composite
  transform exactly the original matrix / 2 with identical translation, shadow
  and glow draws exactly 2× in buffer space, buffers restored afterwards,
  scale-1 layers allocate no hi buffer.
- Pixel change (intended, documented): layers with enlarging transform keys
  get sharper, not different, geometry. Gradient fills stay fixed in frame
  space: `_gradient` is keyed by buffer size and `_paint` anchors its pattern
  to the buffer transform, which the corrected composite scales back down.
- Limit: preset decor drawn in literal pixels (against the golden rule) thins
  by 1/s; every shipped preset sizes decor relative to `f.unit`, so this was
  not observed. Scale above the cap still softens, just less.

### 2. Offset lanes stop folding back at sharp vertices — `path.js`

`SampledPath.offset()` only dropped steps moving backwards against the base
tangent. At a sharp vertex the remaining curve still jumps from the vertex
back across its own branch: on the zigzag at 960×540, two glyphs 30 px apart
along a Draw On lane landed 5.2 px apart in space and overlapped. `offset()`
now also cuts a detour when a new point lands within a few px of a kept point
reached by a short (≤ max(48, 3·|d|) px), jumpy detour — the detour must contain
a step ≥ max(12, 4× mean sample step), which a backwards-drop fold always has
(~39 px on the zigzag, ~43 px on bounce). The jump gate matters: an ungated
version trimmed genuine crossing detours and moved a loop glyph 25 px onto the
wrong branch (1 new adjacent overlap); with the gate, that regression is gone.

Measured (Node harness, 65 px type, 30 px advances, 22×40 px ink boxes,
adjacent pairs only; same harness before/after):

| shape | before | after |
|---|---|---|
| bounce | 2 overlaps | 0 |
| zigzag | 2 (incl. the 5.2 px fold pair) | 2 (fold pair gone; see residual below) |
| loop, double-loop, spiral, circle, frame, all others | 0, or unchanged | unchanged |
| lissajous, heart, star | 2, 2, 1 | 2, 2, 1 (unchanged) |

Offset lengths changed only where folds existed (bounce 1182→1038,
zigzag 1470→1239, lissajous 4511→4404); every other shape's offset length is
identical. `lane()` is untouched — rounded carriers already rule folds out.

### 3. Per-frame memoisation, no behaviour change — `renderer.js`

- `_setupFor` used to `JSON.stringify` the whole layer on every echo/blur
  pass. It now reuses the setup within one `render()` call (token bumped per
  render; presets must not mutate the scene mid-render, which the contract
  already forbids) and recomputes the key on every new render as before.
- `_pathFor` samples a still path once per frame instead of once per pass
  (morphing paths are still re-sequenced per pass, since they depend on `p`).
- `_renderLayer` now computes the transform key first, so an invisible or
  degenerate transform skips the passes instead of drawing them and discarding
  them. No visible difference: the old code never composited those passes.
- The After Effects exporter overrides `_renderLayer` wholesale and calls
  `_drawPreset` directly, so none of this affects motion capture (it reads
  `_transformAt` itself, unchanged).

### 4. Flash safety: documented, not clamped in the renderer — `renderer.js`

No renderer-side clamp was added, deliberately. Clamping preset motion here
would silently change the art and break the determinism the flash check
relies on (same scene + time must give the same pixels). The guard is
`TM.Safety.flashes` (export group); the studio and export run it and warn
above the limit. `TM.Renderer.FLASH_LIMIT = 3` is now exposed so renderer
consumers can reference the same number, and `render()` carries a comment
stating this boundary. Fast presets at short loop durations can still exceed
3/s — that remains an export/studio-surface gap (see below).

## Verified unchanged (checked, not assumed)

- Gradient fills under transforms: `_paint`'s M⁻¹·G anchoring, including the
  `drawInto` origin shift, is unchanged; supersampling preserves it (above).
- RTL: `drawLine` sets `ctx.direction` per line and draws the logical-order
  run left-aligned at −width/2; no defect found in the renderer path. The
  round-3 Axis Wave RTL centring bug is in the preset (below).
- Ligature clusters and descenders: both live in `text.js` layout / presets,
  outside this scope; the renderer draws whatever clusters the layout gives it.
- Determinism: no `Math.random`/`Date`/`performance.now` added; all new code
  is a pure function of scene + time + size. The only pixel changes vs before
  are the two documented ones: sharper enlarging-transform-key layers, and
  Draw On lanes with folds trimmed (glyphs move only where the old lane
  folded back on itself).

## Verification actually run

- Syntax: `node -e "new Function(fs.readFileSync(...))"` on both changed
  files (browser scripts, so `node --check` alone would not exercise the
  module-style load the harness uses) — passes.
- Node harnesses (no browser available in this environment): path-geometry
  overlap tables above for all 22 shapes, old-vs-new offset lengths, cache
  identity for `offset()`, and the renderer transform/buffer harness
  (corrected-transform identity at 4 sample points, hi-buffer size, restore,
  scale-1 no-op, invisible-transform skip, `FLASH_LIMIT`).
- `npm run test:smoke` was NOT run: no Playwright/Chromium and no
  `node_modules` in this environment, and installing a browser was out of
  scope. The parent should run the smoke suite (it covers determinism, seams
  and 1080p cost for every preset) before merging; default scenes have no
  enlarging transform key, so their smoke pixels should be unchanged except
  Draw On lanes on fold shapes.

## Remaining rendering gaps (for the next round / other teams)

1. **Path Flow on Star is a preset-side fit bug, not an engine bug (preset
   team).** Measured: at 960×540, 65 px type, the Star carrier is filleted
   1445→941 px by Path Flow's own hard radii, and the tracked lane's text
   capacity collapses further to 506 px (σ up to ~4 on 30 px-radius fillets
   is geometrically necessary for 45 px-tall glyphs). Path Flow's Fill mode
   then places a ~700 px line on a 506 px closed lane, where `at()` wraps
   and piles the overflow onto the start — the round-3 "illegible pile".
   Fix: scale the line to the lane's text capacity (as Draw On's fit pass
   does) or refuse to wrap; the engine cannot do this without changing what
   the preset asked the lane to hold. Tracked lanes themselves measure 0
   adjacent overlaps on all 22 shapes when the text fits the capacity.
2. **Draw On residual overlaps (preset team).** After the trim, 1–2 adjacent
   pairs remain on zigzag/heart/star/lissajous at 65 px type: tall boxes
   rotated ~90°+ apart across an acute vertex still touch even when spaced
   correctly along the lane. Needs preset-side corner smoothing (a rounded
   carrier, as Path Flow uses) or larger bend spacing — plus the pop
   animation (overshoot scale, ±tilt, rise) that round-3 measured, which the
   lane geometry cannot account for. Also out of scope here: Draw On text
   running off the top on the Frame path (lane offset above the top edge).
3. **Descenders (layout/preset teams).** Block height in `text.js` uses cap
   height only, so Stack's lowercase descenders still collide/clip (round-3
   bug 5); the renderer cannot fix this without layout data it does not have.
4. **Flash guard at export (studio/export teams).** The studio warns but the
   export is not stopped above 3/s (round-3 bug 9); the renderer intentionally
   does not clamp (see §4).
5. **Transform keys beyond the cap:** scale > 2, or buffers over 16 Mpx, still
   upscale a raster and soften. Raising the cap is a memory/perf trade, not
   a correctness fix.
6. **Folds straddling a closed path's seam** are not trimmed by `offset()`
   (the kept array does not wrap); no shape in the library hits this at the
   tested size, but a hand-drawn path could.
