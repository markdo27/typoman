# TYPOMAN Round 1: Kinetic Type Art Director

Judge lens: 15 years of title sequences and kinetic type. I weight Motion Craft, Typographic Quality and Creative Range most, but I score all eight criteria against the rubric's absolute anchors (9 = After Effects + pro plugins / Cavalry).

Snapshot: commit 3f7aecb, served on :8711 and driven with headless Chromium (Playwright). The canvas is software-rendered, so I judge smoothness from the motion design and the per-frame curves, not from wall-clock fps.

Evidence lives in `round-1/art-director/shots/`:
- `cs-*`: contact sheets of every preset at p = .1/.3/.5/.7/.9
- `hr-*`: high-res frames
- `tr-*`: per-glyph motion-curve traces. These record y/x offset, scale, rotation and alpha for each glyph at 60 fps, plus pixel deltas from one frame to the next and across the loop seam.
- `ty-*`: typography tests
- `edge-*`: edge cases
- `fx-*`: effects
- `bug-*`: bug repros
- `ux-*`: studio screenshots

Only EE remains **provisional**: I read the encoders but did not encode or ffprobe files. The Creative Technologist owns that verification.

---

## Scores

| MC | TQ | PC | CR | EE | UX | PR | EQ |
|---|---|---|---|---|---|---|---|
| 6.5 | 6.5 | 7.5 | 6.5 | 6.5 (prov.) | 7 | 6.5 | 7 |

```json
{"MC":6.5,"TQ":6.5,"PC":7.5,"CR":6.5,"EE":6.5,"UX":7,"PR":6.5,"EQ":7}
```

---

## 1. Motion Craft (MC): **6.5**

**Evidence (positive)**
- **Real easing vocabulary.**
  - `js/engine/core.js:146-185` defines signature cubic-béziers (glide, smooth, snap, overshoot, anticipate).
  - `core.js:107-114` adds true damped-spring step responses (spring, springSoft, springSnappy).
  - `js/studio/curve-editor.js` adds a cubic-bézier popover with draggable, keyboard-nudgeable handles, numeric x1..y2 fields, named tiles, a motion-preview dot against a linear ghost, and "copy as CSS".
- **Standard timing set.** `TM.P.sequence` (`core.js:350-358`) gives in → hold → out, in/out length, stagger, order (first→last, last→first, centre-out, edges-in, random, word, line) and separate in and out eases. The timeline shows the in/hold/out bands, and you can drag them to retime.
- **Genuine secondary motion where it matters:**
  - **Fly In** (`path-land.js:143-155`): a damped spring driven by each glyph's arrival velocity carries momentum past the slot and back, with lean. `tr-flyin.png` shows the x overshoot (~98 px at 960 w) and settle.
  - **Pop** (`pop.js`): stretch scales with fall speed, the contact frame flips to squash, then a rebound hop, then a crouch before the exit (anticipation). See `tr-pop.png`.
  - **Wave → Cascade** (`wave.js:25-44`): anticipation dip → rise → hang → fall → impact squash → ringing settle. See `tr-wave-cascade.png`.
  - **Assemble**: rotation lags position (overlapping action), then a gather-then-blast exit with drag. See `tr-assemble.png`.
  - **Draw On**: "Hand speed" slows the pen into curves (`path-draw.js:14-36`).
  - **Cylinder**: the "linger at front" spin gives reading time, then whips round.
  - **Split Flap**: gravity-accelerated flaps and a landing bounce.
  - **Typewriter**: human key rhythm, an auto-repeat backspace and an idle-only caret blink.
- **Loops are seamless.** The pixel delta across the loop seam is in line with an ordinary frame step for every preset I traced (seam / median frame delta):

  | Preset | Seam / median Δ |
  |---|---|
  | rise | .005 / .035 |
  | pop | 0 / .13 |
  | fly in | .04 / .58 |
  | assemble | 0 / .002 |
  | flip | .10 / .07 |
  | cylinder | .68 / .82 |
  | wave-cascade | 0 / .19 |
  | draw on | 0 / .004 |
  | split flap | .15 / .18 |

  Determinism is enforced by contract: there is no `Math.random`, only seeded hashing.

**Evidence (negative)**
- **Fly In, the flagship path move, has a craft miss in its defaults.** With order = first→last on a left→right arc, the word reads **backwards in flight** ("EPYT", "NI E P Y T"), and letters pile into a clump at peel-off ("TOMNI", "OITOM"). See `fx-flyin-strip.png`, row 1. Setting order to last→first fixes it (row 2), so the default is simply wrong.
- **Stack.** The accordion is a plain sine on row heights (`stack.js:52-66`). It is mechanical, with no overlap and no settle.
- **Flip** fakes perspective with a skew instead of a keystone (`flip.js:64-71`). Letters only scale in place: no hop, no z-arc, no positional secondary.
- **Small curve faults:**
  - Pop's squash curve jumps by a hard step at the second landing (`tr-pop.png`, scale panel).
  - Cylinder's back-face dimming is a hard alpha step from 0.62 to 0.2 in one frame at edge-on (`cylinder.js:100`; `tr-cylinder.png`, alpha panel). The sliver masks it, but a crossfade would be cleaner.
- **Control ceiling.**
  - There is one 2-handle bézier per param: no value or speed graph, no per-property curves, no keyframes.
  - Spring stiffness and damping are fixed presets.
  - Stagger is linear in rank (`renderer.js:80-83`), with no stagger-distribution curve and no per-glyph time jitter.

**To reach 7:**
- Fix the Fly In default order (last→first for left→right paths, or auto-pick from the path direction).
- Give Stack an overlapping, settling motion; give Flip a true keystone and a positional arc.
- Add a stagger-distribution ease plus random time jitter.
- Expose spring stiffness and damping in the curve editor.

---

## 2. Typographic Quality (TQ): **6.5**

**Evidence (positive)**
- **Curated library.** 50 Google families across 6 categories (`js/engine/fonts.js:13-70`). 22 have a continuous variable weight axis (Roboto Flex, Unbounded, Fraunces, Inter Tight, Anybody…).
- **Custom fonts.** Upload is supported (`fonts.js:184-201`) and there is a drop overlay. The font whitelist protects URL-loaded scenes.
- **Kerning is preserved.** x positions come from measuring each line prefix (`text.js:66-74`), and field rows are drawn as whole kerned runs (`lens.js`, `stack.js`).
- **Emoji are safe.** Grapheme segmentation via `Intl.Segmenter` (`text.js:14-15`) keeps emoji and accents whole in Decode, Split Flap and Wave (`edge-cases.png`).
- **Animated variable weight with reflow is the best typographic moment in the app.** Wave's crest thickens and the line re-flows, so heavier letters push their neighbours apart instead of colliding (`wave.js:157-170`). See `ty-variable.png` (Roboto Flex, Unbounded) and `fx-effects.png` (Unbounded 800 + gradient + stroke).
- **Serif lowercase reads cleanly.** Fraunces sentence case is clean in Rise, Typewriter, Split Flap (lowercase drum) and Cylinder (`ty-serif-lc.png`). Path Flow in Fraunces is lovely (`ty-pathflow-fraunces-zoom.png`).
- **Controls:** tracking, leading, align, case (upper/lower/title), slant, outline / fill+stroke, and solid, gradient or palette fills.

**Evidence (negative)**
- **BUG (high impact): multi-line Rise draws line 2+ in 10 px sans-serif, tiny and letter-spaced** (`bug-rise-2lines.png`, 1280×720).
  - Root cause: `Frame._setFont` caches the font string (`renderer.js:123-125`). Rise wraps each line in `ctx.save()/clip/ctx.restore()` (`rise.js:29-47`). `restore()` resets `ctx.font` to the context default, but the cache still says Anton, so the font is never re-applied.
  - Rise is the bread-and-butter title move, and a two-line title ("TYPE IN / MOTION" is the engine's own default text, `scene.js:31`) breaks it on every frame.
- **The same bug hits Split Flap.** During roll-in and roll-out, tiny 10 px sans glyphs ("N", "R T H") flash in the bottom-left of the cells every loop (`bug-splitflap-tinyfont.png`, `cs-default-03…png` at p = .1/.9, `edge-cases.png`). The clipping happens in `split-flap.js:238-254`.
- **Path text crowds on concave curves.** There is no curvature-aware spacing:
  - The default hero frame shows "TYP" heads touching and "TI" feet overlapping (`hr-pathflow.png`).
  - Draw On's "MOTION" folds on the bend (`hr-pathdraw.png`).
  - Path Flow with two lines makes the parallel lanes cross and collide (`edge-cases.png`, row 1).
- **Only the `wght` axis is used.** No `wdth`, `opsz`, `slnt`, `GRAD`, `SOFT` or `WONK`, even on fonts that carry them (Roboto Flex, Anybody, Fraunces).
  - Stack fakes width by non-uniform scaling (`stack.js:72-76`), so with long text "FOR", "THE" and "BY" become slivers or slabs (`edge-cases.png` stack row, `cs-default-00`). The professional version uses `wdth` plus tracking to justify.
- **Further gaps:**
  - Slant is a fake oblique (skew), with no true italics.
  - No OpenType features: ligatures and discretionaries are lost when glyphs are drawn one by one, and there is no ss01 or tnum.
  - Split Flap squeezes wide glyphs horizontally to fit their cells (`split-flap.js:103-107`).
- **Default art direction is uniform.** Every preset is Anton caps on Klein blue, so the gallery never shows off the type library.

**To reach 7:**
- Fix the save/restore font-cache bug: invalidate `_font` on restore, or never cache across `save()`.
- Add curvature-compensated spacing (or auto-scale) on path text.
- Drive `wdth`/`opsz` for Stack and for the variable fonts.

---

## 3. Path Control (PC): **7.5**

**Evidence**
- **The on-canvas bézier editor** (`js/studio/path-editor.js`, `ux-13-path-editor.png`) has:
  - draggable anchors and handles, with an inline hint ("drag points · double-click to add · Del removes · Esc to finish");
  - a floating toolbar: freehand draw (D), add, delete, open/close and reverse (`path-editor.js:43-46, 229-251`);
  - snapping guides, Shift-45° constraint, marquee multi-select and arrow-key nudging (`path-editor.js:16, 80-87, 363, 559-589`).
- **Shapes, morph and undo.** 22 preset shapes (`path.js:1052…`) and A→B path morph with its own ease (`renderer.js:314-323`). Undo goes through the store, with coalescing while dragging.
- Path-aware motion is well engineered:
  - arc-length placement and chord-based tangents across each glyph's width (`path-kit.js:22-37`);
  - corner smoothing so letters swing round star points (`path-kit.js:166-205`);
  - lane offsets that don't fold at concave corners (`path-draw.js:38-73`);
  - whole-repeat tiling so closed paths have no seam (`path-kit.js:95-106`).
- Six presets consume the path, and Tunnel and Orbit accept any shape (try a heart).

**Weak points:** the crowding on concave curves noted under TQ. I did not stress the editor's own affordances deeply; the motion-designer judge owns that.

**To reach 8:** spacing compensation on curves, per-glyph offset/scale along the path, path keyframing (beyond A→B morph), and reliable numeric node editing.

---

## 4. Creative Range & Originality (CR): **6.5**

**Evidence (positive)**
- **17 presets in 5 categories, most with internal modes.**
  - Wave has 4 modes and Stack 4 motions.
  - Path Flow has 3 modes; Fly In and Assemble have exit variants.
  - Decode has 6 character sets.
  - Split Flap has flap and slot-reel styles.
  - Glitch has bursts or constant mode, plus layer toggles.
- **The path family is where the identity lives:**
  - **Tunnel**: an infinite zoom or vortex of type rings on any path, with Pulse rhythm (`cs-default-02`, glow version in `fx-effects.png`). This is the strongest "out of the box" look.
  - **Orbit**: counter-rotating tilted 3D rings with mirrored back faces, depth-sorted around an upright core title (`hr-orbit.png`). It looks like a well-made template.
  - **Lens**: a magnifier gliding over a dim field of type, with weight boost on variable fonts. This is a fresh idea, but the execution is cluttered: rim fan, ring label and magnified glyphs fight each other, and there is no refraction edge, glass highlight or chromatic cue (`hr-lens.png`).
  - **Draw On**: a pen stroke plus pop-up letters. It is elegant (`hr-pathdraw.png`).
- **Effects combine:** echo (with palette), true sub-frame motion blur, glow, drop shadow, screen-space extrude, gradient or palette fill, outline, grain and vignette (`fx-effects.png`). There are up to 6 layers, 12 curated palettes and a Remix button with locks.

**Evidence (negative)**
- **About half the catalogue is template-pack staple:** Rise, Typewriter, Decode, Split Flap, Pop, Assemble, Glitch, Flip and Stack. They are competently executed but seen everywhere; none has a twist a motion designer hasn't seen.
- **No starter templates or designed looks.** All 17 presets open in the same Anton-on-Klein look, so the gallery is monotone (`ux-03-after-tour.png`). Remix randomises the look only, never motion params or paths (`app.js:70-107`).
- **No effector or randomiser layer** (Cavalry-style per-glyph falloffs), no text-animator stacks, no phrase sequencing (word swap / multi-phrase), no camera, no layer mattes or masks, no audio reactivity.
- **Effect quality is basic.**
  - Echo on a marquee smears into an illegible ribbon (`fx-effects.png`, row 1).
  - Extrude is a screen-space offset stack that ignores 3D orientation, so it extrudes the same way on Cylinder's back faces (`renderer.js:443-457`, `fx-effects.png`).

**To reach 7:** curated starter looks per preset (font, palette, FX), a Remix that also mutates motion params and paths, and 2–3 signature presets with no template-pack equivalent. Candidates: kinetic variable-axis "breathing" word marks; a type-as-particles field following the path; a mask/matte-driven split-word transition.

---

## 5. Export & Embed (EE): **6.5 (provisional)**

**Evidence:** the code supports:
- an offline frame-by-frame MP4 encoder via WebCodecs + mp4-muxer 5.2.2, with H.264 → AV1/VP9 fallbacks;
- WebM, plus an alpha WebM writer of its own (`js/export/webm-alpha.js`), since the vendored muxer can't attach alpha;
- GIF and ZIP writers of its own;
- PNG frame or sequence export;
- a standalone HTML builder;
- an iframe (`embed.html`) and a `<typoman-player>` web component (`player.js`).

The renderer is deterministic and resolution-independent, so exports should match the preview. **I did not encode files or ffprobe them**; the Creative Technologist owns that. The score is held below 7 until encoding is verified. I'd expect 7–8 if MP4 encodes reliably.

---

## 6. Studio UX & Visual Design (UX): **7**

**Evidence**
- The studio looks like a premium dark tool: a numbered inspector, a category-filtered gallery with search and hover-preview, a timeline with in/hold/out bands and "Seamless loop", a format menu with 6 aspects, safe-area guides, clean preview, zoom, undo/redo, Remix and a shortcut sheet (`ux-02-tour-0.png`, `ux-03-after-tour.png`, `ux-10..13`).
- The curve-editor popover is genuinely well designed (`ux-11-curve-editor.png`): bézier graph, numeric x1..y2, a preview track against a linear ghost, and tabbed curve families with thumbnails.
- The path-edit hint banner truncates at 1440 px ("Esc to finish" is cut off; `ux-13-path-editor.png`). I did not test mobile or tablet; the motion-designer judge owns that.
- The 3-step coach-mark tour is short, sits beside the artboard and is skippable.
- Zero console errors on first run.

**Weak points**
- Every gallery card shows the same Anton/blue look, so you can't scan it visually.
- Wrong defaults (Fly In order) put the burden on the user.

**To reach 8:** per-preset designed thumbnails and looks, and a real timing graph.

---

## 7. Performance & Robustness (PR): **6.5**

**Evidence (positive)**
- **Per-frame cost.** At 1920×1080 in preview quality, headless Chromium with *software* raster takes 5–18 ms per frame for every preset:

  | Preset | ms/frame | Preset | ms/frame |
  |---|---|---|---|
  | path-flow | 18.2 | lens | 9.6 |
  | rise | 9.6 | decode | 8.6 |
  | stack | 14.0 | typewriter | 5.8 |
  | wave | 10.7 | split-flap | 6.8 |
  | fly in | 9.8 | assemble | 16.2 |
  | draw on | 5.0 | pop | 8.1 |
  | orbit | 8.9 | glitch | 12.5 |
  | tunnel | 9.1 | cylinder | 12.3 |
  | | | flip | 4.9 |

  That is inside a 60 fps budget even without a GPU.
- No console errors or page errors across all my runs. The only warnings were my own `getImageData` readback.
- Deterministic frames, and seamless loops for every traced preset.
- Emoji, long text (80 chars), two lines and portrait-friendly fitting don't throw (`edge-cases.png`).
- The scene sanitiser whitelists fonts, presets and colours (`scene.js`).
- Tunnel has a glyph budget (`tunnel.js:15, 88-91`), and setup results are cached.

**Evidence (negative)**
- The font-cache / save-restore bug renders wrong output in normal flows (Rise multi-line, Split Flap transitions). That is a correctness failure, not a crash.
- Path Flow with 2 lines collides.
- Cylinder with a wide font runs off-frame because the drum isn't fitted to the frame (`fx-effects.png`, extrude row).

**To reach 7:** fix the font-state bug and add a regression test that compares a two-line Rise frame against a reference. The smoke test checks that frames don't throw; it doesn't check glyph size.

---

## 8. Engineering Quality (EQ): **7**

**Evidence (positive)**
- A clean engine / presets / studio / export split, a one-file boot manifest (`js/boot.js`), and a documented preset contract with param builders and `showIf` (`docs/ENGINE.md`, `core.js:300-359`).
- A pure render API (`TM.Renderer`), seeded RNG and loop noise, and a sanitiser at every trust boundary.
- A smoke test covering determinism, seams, cost, edge cases and fuzzing (`tests/smoke.mjs`).

**Evidence (negative)**
- **Leaky abstraction.** The renderer caches context state that presets can invalidate with `save()/restore()`. That is the root of the biggest visual bug, and the contract in ENGINE.md doesn't warn about it.
- **Duplication:**
  - The in/out normalisation is re-implemented in pop, scramble, split-flap, assemble, typewriter, glitch and path-land.
  - `slope()` is duplicated in `pop.js:19` and `split-flap.js:211`.
  - `makeCanvas` exists in both `glitch.js:19` and `renderer.js:17`.
  - `cylinder.js:23` re-implements `PathKit.affine`.
- **Dead code and private reach-ins:**
  - `void clamp;` in `stack.js:108`.
  - `stack.js:86` pokes the private `f._font`.
  - `labs/` holds ~160 KB of legacy experiments (`v3.html`, `flash.html`, `cavalry.html`).

**To reach 8:** move the timing helpers into Frame, make Frame state-safe (wrap `save`/`restore`), and remove or archive `labs/`.

---

## Top 8 improvements for Round 2 (ranked, Art Director lens)

1. **Fix the font-state bug (renderer.js:123-125 vs rise.js:29-47 / split-flap.js:238-254).**
   - Rise with two or more lines and Split Flap transitions draw 10 px sans-serif glyphs.
   - Fix: invalidate `_font` after any `restore()` (provide `f.save()/f.restore()` wrappers), or set `ctx.font` unconditionally per glyph.
   - Add a pixel regression test for a two-line Rise.
2. **Curvature-aware path typography.**
   - On concave stretches, compress the advance or scale glyphs by local curvature × cap height so tops don't collide ("TYP", "TI" in the default hero frame). Fan out on convex stretches.
   - Pick default path / size pairs that don't collide out of the box. The very first frame users see currently has touching letters.
   - Fix Path Flow's multi-line lanes so they never cross. Offset with a proper parallel curve and clamp the offset to the radius of curvature.
3. **Fix Fly In's defaults.**
   - Auto-choose stagger order from the path direction, so the word reads correctly in flight.
   - Space launches by arc length, so letters don't clump at peel-off.
   - Then it becomes a real signature move.
4. **Go beyond weight: animate width and optical size.**
   - Drive `wdth`/`opsz` (Roboto Flex, Anybody, Fraunces) through `@font-face` instances or a variation-capable path.
   - Rebuild Stack on `wdth` plus tracking instead of non-uniform scaling.
   - Add a "breathing wordmark" preset. Variable-axis motion is the 2020s signature look, and the app already has the reflow engine (Wave) to do it well.
5. **Ship designed starter looks, not one look.**
   - Give each preset 3–4 curated looks (font, palette, FX, path), e.g. Tunnel in neon glow, Orbit in Bodoni on paper, Split Flap in JetBrains Mono on amber.
   - Show them as gallery thumbnails.
   - Make Remix mutate motion params and path shape too, so "stumbling into something great" actually happens.
6. **Upgrade timing control to pro level.**
   - A stagger-distribution curve (ease the offsets across letters, not just linear rank) and per-glyph random time and offset jitter.
   - Editable spring parameters (stiffness/damping/mass) in the curve editor.
   - A speed/value-graph view.
   - Optionally a simple per-property keyframe lane for position, scale and rotation offsets on top of any preset.
7. **Rework or replace the cliché tier.**
   - Flip needs a true keystone (perspective-sliced quad, or WebGL) and an arc or hop.
   - Stack needs overlap and settle instead of a sine.
   - Echo needs a "trail only when moving" mode so marquees don't smear.
   - Extrude should follow the glyph's 3D orientation in Cylinder and Orbit.
   - Lens needs a glass rim (highlight, refraction offset, chromatic fringe) and less rim clutter.
8. **Add 2–3 genuinely new signature presets with no template-pack equivalent:**
   - a phrase sequencer (word swaps with shared-letter morph or matte wipes);
   - type-as-particles that assemble onto the path;
   - a split-word matte transition between two layers.
   - Layer-to-layer mattes and masks would open a whole class of title-sequence looks (Saul Bass-style reveals).

---

## Verification log for the two questions raised mid-review

- **Rise with two lines: REAL BUG, verified at 1280×720** (`bug-rise-2lines.png`).
  - Line 1 renders correctly in Anton.
  - Line 2 renders in the canvas default (10 px sans-serif) at the full-size glyph positions, so it looks tiny and widely letter-spaced.
  - Cause: the `_font` cache survives `ctx.restore()`. The same mechanism produces the tiny glyphs in Split Flap's roll-in (`bug-splitflap-tinyfont.png`).
- **Path Flow glyph drops at 480 px: NOT A BUG.** At 480×270, p = .3 and .7 (`bug-pathflow-480.png`), every glyph is present. What I first read as "quiet k ype" was two neighbouring contact-sheet cells, where the right cell's run starts at the frame edge. Resolution independence holds (compare `ty-pathflow-fraunces-zoom.png` at 1280).
