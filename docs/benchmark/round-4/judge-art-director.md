# TYPOMAN Round 4: Art Director (Kinetic Type)

**Snapshot:** HEAD `9c89f08` plus the uncommitted Round 4 working tree —
41 registered presets (43 files in `js/presets/`, `motion-kit.js`/`path-kit.js`
are helpers), 16 templates, and modified `js/boot.js`,
`js/engine/renderer.js`, `js/engine/path.js`, `js/templates/templates.js`.
This judge is read-only except for this file: no code was edited, committed
or pushed.

| MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---|---|---|---|---|---|---|---|
| 8.0 | 8.0 | 8.0 (prov.) | 8.5 | 8.5 | 8.0 (prov.) | 7.5 | 7.5 | **8.0** |

Mean of the eight bands = 64.0 / 8 = 8.0. Round 3 (this lens) was 8.0 overall
(MC 7.5, TQ 7.5, PC 8 prov., CR 8, EE 8.5, UX 8 prov., PR 7.5, EQ 7.5), so
Round 4 holds the overall band while lifting MC, TQ and CR. That is the
honest shape of this round: it broadens and polishes a strong tool, it does
not remove the structural gaps that stand between 8 and 9.

**Lens:** Motion Craft, Typographic Quality and Creative Range are weighted
most; all eight criteria are scored from evidence, not from the Round 4
notes' claims.

## Method and environment limits — read before trusting any band

- **Code read:** all 8 new presets in full, the templates diff, the
  renderer/path diff, `docs/BENCHMARK.md`, Round 3 art-director notes, and
  the Round 4 presets/creative/rendering notes (checked against code, not
  taken on trust).
- **Syntax:** `new Function(...)` load check passes on all 43 preset files
  plus `renderer.js`, `path.js`, `templates.js`, `boot.js`.
- **Determinism / seams / cost / edge cases:** `npm run test:smoke` run
  twice in this environment (Playwright Chromium, software raster). All 8
  new presets: deterministic = yes, edge cases = ok, 5.77–8.15 ms per frame
  at 1080p (see table below). Seam ratios (loop-point change vs typical
  frame-to-frame change; the smoke's own fail threshold is 6×): ticker
  1.35, blob-reveal 0.19, floor-plane 0, ink-pen 0.29, odometer 0.34,
  axis-drift 0.63, anaglyph 0, spiral 0.9. No new preset approaches the
  seam threshold.
- **Templates:** the smoke's template check (16 build, render
  deterministically, flash-safe, take the user's text) passes for every
  template except the pre-existing `glitch-drop` flash failure below. The
  creative notes' "smoke unverified" caveat for the 8 new templates is
  therefore closed for determinism, flash and headline substitution — in
  this environment, with the font caveat below.
- **Google Fonts do NOT load in this sandbox** (`ERR_TUNNEL_CONNECTION_FAILED`;
  smoke reports 0/60 catalogue fonts, 85 console errors, almost all font
  loads). Every browser check here ran on fallback fonts. This is an
  environment limit, **not a product bug**, and it is not scored against
  the product. It does limit the evidence: variable-axis behaviour
  (Axis Drift's weight swing, width axis, true italics/slnt) and the
  exact look of the new presets' curated fonts could not be verified
  visually here, and no font-true contact sheet is claimed. Where a
  judgement depends on real fonts, that is stated.
- **Baseline failures, verified identical in character to the clean-HEAD
  baseline:** `glitch-drop` template flashes 3.5/s; true-italic/slnt
  checks fail and the width axis does not change letterforms (both are
  font-load artefacts in this sandbox, since no variable font arrives);
  font loads 0/60. No NEW failure class appeared in Round 4: no new
  preset failed determinism, seams or edge cases, and no new template
  failed the smoke template check. Smoke exits non-zero solely on those
  baseline items.
- **Not hand-tested:** the studio editor by mouse/keyboard, and no
  keyboard/accessibility audit was run. PC and UX are therefore marked
  provisional, as in Round 3.
- **A note on attribution:** three Round 3 bugs are already fixed in the
  HEAD baseline, not by Round 4 work — Phrase Morph now draws at its
  fitted size and splits a single phrase into words, Axis Wave now
  measures RTL lines without logical-order kerns, and Stack rows are
  ink-measured so descenders no longer collide. They raise the current
  tree's TQ/MC over the Round 3 snapshot, but they are not Round 4
  credit. Round 4's own contribution is the 8 presets, 8 templates, the
  renderer supersampling/memoisation and the path fold trim.

## 1. Motion Craft — 8.0

**Evidence.** All 8 new presets loop cleanly by construction (whole-cycle
sines, integer-cycle `loopNoise`, sequence presets that start and end
empty) and the smoke confirms it: deterministic, seam ratios ≤ 1.35, no
edge-case throws. The motion ideas are genuinely varied, not one trick
re-skinned: Ticker's phase-lagged marquee (lag is a phase shift, never a
clock shift, so the loop point holds), Odometer's quantised detents with
an eased settle inside each click, Spiral's arc-length layout with
tangent rotation, Floor Plane's one-cycle perspective rock, Axis Drift's
per-letter seeded rhythms with no travelling order. Parameters are
controllable and hinted (trips, travel, detents, turns, spin, breathe),
and every new preset ships 3–4 curated looks (25 new looks; 110 → 135
total).

**Against.** Ink Pen does not write: the fill fades/scales in under a
parking nib dot, with a lean and a pressure swell — a handsome reveal,
not a stroke, and the "writes the text" framing oversells it. Spiral's
centre crowds on long text (spacing compresses instead of failing, but
the result is a knot, not a design). Floor Plane on a single line is a
fixed mid-depth factor, so the effect nearly vanishes for the common
one-line case. The old ceilings are untouched: no value-graph editor,
springs still over-normalised (Round 3 bug 13), Phrase Morph letters can
still overlap mid-transition.

**What would move this up one point (to 9):** a timing editor (curves
you can see and shape, not just pick), springs whose stiffness reads as
frequency, and Ink Pen that actually reveals along a stroke — plus the
Spiral centre handled as a design decision (fade, scale-down or a
minimum inner radius) rather than compression.

## 2. Typographic Quality — 8.0

**Evidence.** Kerning/ligature/italic/upload-font work from Round 3
stands, and the three HEAD fixes above remove the worst Round 3
typographic bugs: Phrase Morph no longer crushes wide phrases, Axis Wave
RTL is centred, Stack descenders are ink-aware. Every new preset draws
through `f.drawGlyph`, none pads, truncates or replaces the user's text
(Odometer's ghosts are copies of the same glyph), and all sizes are
relative to `f.size`/`f.unit`/cap height/frame fractions. Axis Drift
snaps weights to steps of 10 so canvas font strings stay cached — a
real craft detail — and its `prefers: Roboto Flex` declaration is
honest about what it needs. All template look names referenced by the 8
new templates were verified to exist in their presets.

**Against (and why not 9).** OpenType on catalogue fonts is still thin
(only tnum/pnum/lnum; Round 3 gap, unfixed). Emoji still render as grey
squares in Particles (unchanged). Anaglyph's fringes are flat channel
colours, so on gradient fills the fringes do not carry the gradient.
Spiral joins multi-line text with a word gap rather than honouring line
structure. Wave's default amplitude and Kinetic Grid's word-breaking
rows (Round 3 bugs 8/10) are still present. Axis Drift's headline
behaviour — the weight swing — could not be verified here at all, since
no variable font loaded; on a static font it collapses to the scale
pulse, which the notes admit.

**What would move this up one point:** real OpenType feature coverage
on catalogue fonts (at least small caps, ligature control, figure
styles beyond tnum/pnum/lnum), colour emoji handling, and gradient-aware
Anaglyph fringes — plus a font-true visual pass once fonts load.

## 3. Path Control — 8.0 (provisional)

**Evidence.** The Round 4 path change is surgical and well-gated:
`SampledPath.offset()` now trims fold detours at sharp vertices (short,
jumpy detours only; the jump gate is what stops it trimming genuine
crossings, and the notes document the ungated version's 25 px loop-glyph
regression). Measured in the rendering notes' Node harness: bounce
2 → 0 adjacent overlaps, zigzag's 5.2 px fold pair gone, all other
shapes unchanged, offset lengths changed only where folds existed.
`lane()` is correctly untouched (rounded carriers already rule folds
out). The memoisation in `_pathFor` (still path sampled once per frame,
morphing paths still re-sequenced per pass) is behaviour-preserving.

**Against.** The trim is partial, not a fix: zigzag still shows 2
adjacent overlaps, and heart/star/lissajous keep 1–2 residual pairs —
tall boxes rotated ~90°+ across an acute vertex still touch, and the
pop animation's overshoot/tilt is outside what lane geometry can
account for. Path Flow on Star is still an illegible pile (a preset-side
fit bug: a ~700 px line placed on a 506 px tracked lane, wrapping onto
itself), and Draw On still runs off the top on the Frame path. There is
still no direct-manipulation bézier editor (anchors, handles, add/delete
points), no freehand drawing, and no path morphing with numeric control
in the editor — the 9-band bar. Editor path editing was not hand-tested
here, hence provisional.

**What would move this up one point:** apply the collision-free carrier
and spacing to Draw On and Ribbon, fix Path Flow's fit (scale the line
to lane capacity, as Draw On's fit pass does, or refuse to wrap), and
add a real bézier editor with undo.

## 4. Creative Range & Originality — 8.5

**Evidence.** This is Round 4's strongest gain. 41 presets and 135 looks
is a genuinely broad library, and the 8 new presets are not colour
swaps: Spiral (generated Archimedean path), Floor Plane (perspective
billboards), Odometer (mechanical detents, not Split Flap's character
changes), Blob Reveal (radial per-letter mask, not Rise's line band),
Ink Pen (pressure-breathing fill) are five distinct looks a template
pack does not already contain. The 8 new templates are art-directed
starting points with audience, aspect and duration chosen per use —
YouTube Intro (16:9/6 s), Website Hero (16:9/8 s), Story Pop (9:16/5 s),
Logo Zoom (1:1/4 s), Lyric Sequence, Editorial Spotlight (flicker
turned down to 0.1 for flash safety), Kaleido Window, Orbit Badge —
each pairing presets, layer interplay and once-only furniture, and all
pass the smoke's determinism/flash/headline checks. Kaleido Window
fixes the Round 3 matte-word bug properly: both the matte source and
the clipped layer carry the headline role, so user text replaces both.

**Against (and why not 9).** Three of the eight presets are nearer
variants than inventions (Anaglyph ≈ Glitch made steady, Axis Drift ≈
Axis Wave unordered, Ticker ≈ Path Flow/wave marquee without a path).
There is still no remix, no combinable-effects system beyond layering,
and no signature identity beyond the library itself. Long-text
fragility persists: orbit-badge crowds on very long words (core is not
fit-sized), kaleido-window densifies on long headlines, spiral crowds
at its centre. And the creative notes' "no template hard-codes a matte
word" overstates the case: the old `title-window` still repeats
`CINEMA` in its Inside layer, which `build(id, {text})` does not
replace (only `role: 'headline'` layers are replaced; the smoke's
headline check passes because the Window layer does take the text).
Kaleido Window is the fix; Title Window is still the old behaviour.

**What would move this up one point:** a remix/discover path (one-click
surprising recombinations), combinable effects, fit-sizing for
orbit-badge's core, and finishing the Title Window matte fix so no
shipped template can ever show a stranger's word.

## 5. Export & Embed — 8.5

**Evidence.** No export/embed surface changed in Round 4, and nothing
regressed: Round 3's exact loops at any fps, live-embed features
(per-page text, hover, scroll scrub) and template embed behaviour are
untouched, and the renderer change actively helps exports — layers with
an enlarging transform key now rasterise at their scale (supersampled
buffer, cap ×2 / 16 Mpx, composite transform divided back out with
translation unchanged), so a ×2 key no longer blurs type edges ~2×.
The notes document the one intended pixel change (sharper, not
different, geometry) and the cap honestly. Flash safety is documented
as a deliberate boundary: the renderer does not clamp, `TM.Safety.flashes`
and `Renderer.FLASH_LIMIT = 3` are the guard, and studio/export warn.

**Against.** The guard is still warn-only: fast presets at short loop
durations can exceed 3 flashes/s and the export is not stopped
(Round 3 bug 9, explicitly deferred again). No new export formats,
resolutions or embed routes arrived in this round, and export fidelity
with real fonts could not be re-verified here (fallback fonts only).

**What would move this up one point:** an export confirmation/block
above 3 flashes/s, and a frame-accurate offline render path that
guarantees preview/export identity for transform-keyed and
supersampled layers (verified with `ffprobe`/frame extraction, not
just the preview canvas).

## 6. Studio UX & Visual Design — 8.0 (provisional)

**Evidence.** No studio UI changed in Round 4, so Round 3's standing
holds: templates tab with live user-text previews, undo, "Show me"
flash warning, Spring mode, stagger "Starts" strip, phone parity. The 8
new templates and 8 new presets are discoverable through the existing
surfaces (all registered via `boot.js`'s `PRESETS_B` list, all template
looks verified by name), and the new presets' parameters are grouped
and hinted (`TM.P.range/select/toggle/color` with `group` and `hint`),
which is the difference between a control panel and a wall of sliders.

**Against.** The known UX blemishes are untouched: picking the Spring
tab commits `spring(180,12)` at once and Esc doesn't revert it; a track
matte with no overlap leaves the stage blank with no hint; and the new
presets' subtler failure modes (Spiral centre crowding, Floor Plane's
near-invisible single line, Orbit Badge crowding) have no in-studio
guidance. No keyboard/accessibility audit was run in this round, so
this band stays provisional.

**What would move this up one point:** fix the Spring-tab commit and
the blank-matte hint, add per-preset guidance when a look degrades
(long text on Spiral/Orbit, single line on Floor Plane), and complete
a keyboard/focus/contrast audit.

## 7. Performance & Robustness — 7.5

**Evidence.** The new presets are cheap: 5.77–8.15 ms/frame at 1080p in
the smoke (software raster), all deterministic, all edge cases ok
(empty, emoji, 400-char long text, multi-line, serif, variable,
effects, portrait). The renderer memoisation is sound — `_setupFor`
reuses setup within one `render()` via a per-render token (key still
recomputed every render), `_pathFor` samples a still path once per
frame, invisible/degenerate transforms now skip passes instead of
drawing and discarding them — and the notes state the contract it
relies on (presets must not mutate the scene mid-render). No
`Math.random`/`Date`/`performance.now` was added to any new preset or
to the render path (the only `performance.now` hits in `renderer.js`
are the pre-existing `stats.lastMs` timing). The studio's fail-safe
font behaviour from Round 3 (boots with fonts hung) is what let this
whole judgement run at all.

**Against.** Whole-app cost is not uniformly 60 fps at 1080p in this
environment: the smoke's slowest presets reach ~25 ms (ribbon 25.19,
tunnel 23.98, glitch 23.57) on software raster, so "holds 60 fps at
1080p on a mid laptop" is not evidenced here. The flash-export gap
(§5), the Star pile, and the long-text degradations above are
robustness gaps, not crashes — but they are exactly what keeps this
below 8. The supersampling cap (×2 / 16 Mpx) is a documented trade,
not a flaw.

**What would move this up one point:** a measured 1080p frame budget
on real hardware (or an adaptive quality step when a preset exceeds
it), the export flash block, and the Star/Draw On corner fixes from §3.

## 8. Engineering Quality — 7.5

**Evidence.** Round 4's own code is clean and a good advertisement for
the preset contract: 8 small, single-purpose files, each with a header
explaining what it is *not* (Ticker vs Path Flow, Blob vs Rise,
Ink Pen vs Outline Draw, Odometer vs Split Flap, Axis Drift vs Axis
Wave, Anaglyph vs Glitch, Spiral vs Orbit/Tunnel), deterministic by
construction, resolution-independent, no TODO/FIXME markers in any
Round 4 file. The renderer and path changes are commented with their
reasoning, limits and known gaps (fold seam straddling a closed path,
scale cap, literal-pixel decor thinning by 1/s) rather than silently
baked in. Adding a preset demonstrably means adding one file plus one
line in `boot.js`.

**Against.** The codebase-wide hygiene gaps from Round 3 are untouched:
`SEPARATORS` is still copied across presets, `stack.js` still sets the
private `f._font` (now with a comment, but still a private-field reach),
and the `_setupFor` token optimisation rests on the "presets must not
mutate the scene" contract without enforcing it. The hi-buffer swap in
`_renderLayer` (save/restore of six buffers in a `try/finally`) is
correct but is now the most intricate code in the renderer, and its
safety net is the rendering notes' Node harness, not browser CI for the
supersampled path (the smoke's default scenes have no enlarging
transform key, so their pixels are unchanged by design — the new path
is the least browser-tested code in the round).

**What would move this up one point:** deduplicate the shared preset
helpers, remove the private-field reach, and put the supersampled
transform-key path under a browser test with an enlarging key (plus
the mutation-testing coverage the Round 3 technologist asked for).

## Round 3 bugs re-checked (current tree)

| Round 3 bug | Status now |
|---|---|
| 1. Phrase Morph full-size after fit | Fixed in HEAD (fitted size passed to `drawGlyph`; single phrase splits word-to-word) |
| 2. Path Flow on Star illegible | **Still open** — preset-side fit bug, documented in rendering notes §1 |
| 3. Draw On corners/cusps | **Partly fixed** — fold pair gone, bounce 2→0; 1–2 residual pairs remain on zigzag/heart/star/lissajous; Frame off-top remains |
| 4. Axis Wave RTL centring | Fixed in HEAD (RTL lines measured without logical-order kerns) |
| 5. Stack descenders | Fixed in HEAD (ink-measured rows) |
| 6. Phrase Morph mid-transition overlaps | Not re-measured here; presumed still present (no Round 4 change to it) |
| 7. Templates don't adapt to user text | **Partly fixed** — kaleido-window fixed properly; title-window's Inside layer still repeats `CINEMA` |
| 8. Wave amplitude vs leading | Still present (no change) |
| 9. Flash guard warn-only at export | Still present, deliberately deferred in rendering notes §4 |
| 10. Kinetic Grid word breaks | Still present (no change) |
| 11. Emoji grey squares | Still present (no change) |
| 12. Spring tab commits at once | Still present (no change) |
| 13. Springs over-normalised | Still present (no change) |
| 14. Blank track matte, no hint | Still present (no change) |
| 15. Duplication / private field / labs | Partly: `labs/` gone; `SEPARATORS` duplication and `stack.js` `f._font` remain |

## To reach 9/10 (ranked)

1. **Finish path typography.** Collision-free carrier/spacing for Draw
   On and Ribbon, Path Flow fit-to-capacity (or refuse-to-wrap) for
   Star, and a real bézier editor. This is the single largest gap: it
   blocks PC, and its symptoms (Star pile, corner overlaps) are the
   most visible flaws in an otherwise polished tool.
2. **Close the safety and control gaps.** Block (or at least confirm)
   exports above 3 flashes/s, and ship a timing editor with springs
   that read as frequency. Expert tools do not warn-and-export, and
   they do not hide timing behind presets.
3. **Make every template and preset robust to real user text.**
   Fit-size orbit-badge's core, give Spiral a centre policy, finish the
   Title Window matte fix, stop Kinetic Grid breaking words — and add
   a remix path so the library's 41 presets become combinations, not
   just a catalogue. Until then the creative range is broad but
   brittle at the edges, and that brittleness is what keeps CR at 8.5
   and TQ/MC at 8.0.
