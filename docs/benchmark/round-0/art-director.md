# TYPOMAN Round 0 (baseline): Kinetic Type Art Director

**Judge lens:** Motion Craft, Typographic Quality, Creative Range (weighted). All eight criteria scored.
**Product judged:** `baseline/index.html` (TYPOMAN V3, 9 canvas presets × 3–4 variations = 28 looks). I also looked briefly at `flash.html` and `cavalry.html`. index.html links to neither of them, nor to `script.js`.

```json
{"MC":4,"TQ":3,"PC":2.5,"CR":4,"EE":1,"UX":4.5,"PR":5,"EQ":4}
```
Mean = 3.5, so the overall band is **3.5**.

**Evidence folder:** `/tmp/claude-0/-home-user-typoman/08b2e4f8-c719-5ad1-9a65-566fc775d84d/scratchpad/bench/round-0/art-director/`
- `shots/sheet_1.png` … `shots/sheet_9.png` are contact sheets: one per preset, each variation at t = 0, 0.2, 0.45 and 0.7 of the loop.
- `shots/detail_*.png`, `shots/edge_*.png`, `shots/montage_edge{1,2,3}.png` and `shots/ui_*.png` are detail, edge-case and UI captures.
- `results.json` holds the measurements: loop-seam diffs, per-frame cost, console output, edge-case probes.
- `inspect.mjs`, `motion.mjs` and `montage.mjs` are the scripts that produced them.

**Overall verdict:** this is a well-art-directed *generative diagram* demo with Klein-blue glass UI, not a kinetic typography tool. Three of the nine "typography" presets draw no type at all (Swarm, Vector Field, Network). A fourth (Pulley Belt) shows the user's word as 11 px labels. In the presets that do show type, glyphs sit in equal-width slots, so kerning and advances are thrown away. Motion is smooth but mechanical: mostly sine or Lissajous, almost no stagger, and no timing controls beyond one speed slider. There is no export and no path editing.

---

## 1. Motion Craft (MC): **4.0**

**Evidence**
- **The easing vocabulary is small and rarely used.** Five easings exist (`index.html:316-337`): cubic, quint, back, elastic and step. They are used in only four places: Hull layout morphs (`:455-465`), Swarm burst (`:735`), Network orbit (`:981`) and Morph (`:1268,1272`). Everything else is raw `sin`/`cos` time functions (Pulley, Swarm, Vector Field, Undulation, Network Breathe/Swirl, Radar, Rollercoaster).
- **Stagger is effectively absent.** Only Type Hull staggers, by a fixed `0.08` of a stage (`:451`). With 36 glyphs and a 2 s stage, that spreads the whole word over **0.156 s, or 4.4 ms per letter** (`motion.mjs`). That is imperceptible, so all letters move in unison. The formula `(raw − s)/(1 − 1.5s)` (`:452`) also makes the *last* letter finish *first*, so the cascade inverts at the end of each stage.
- **There is no overlap, anticipation or settle.** Only the "Elastic" variations overshoot, and the canned `easeOutElastic` wobbles every glyph in lockstep (`sheet_1.png`, row 3).
- **Undulation is a standing wave, not a travelling wave.** `amp(t)·cos(uπ/2)` (`:882-883`) separates into a time term and a position term. The whole word flexes like a ruler, and no wave travels through the letters. Zigzag is a linear triangle wave with hard reversals (`:873-875`). Bounce is `|sin|` with no contact squash.
- **Path motion has spacing bugs.** Rollercoaster moves tokens at constant *parameter* speed, not arc length (`:1225`). Measured speed varies **13.8×** along the Lissajous Knot. Token gaps swing from 57 to 529 px. Tokens whip round at up to **12.2° per frame**. On the Cardioid, tokens pile into the cusp **7 px apart while 32 px wide**, so the bubbles overlap (`sheet_8.png`, Cardioid t=0).
- **"Morph" is a crossfade.** The geometric primitives never interpolate into letterforms; `globalAlpha` simply dissolves one into the other (`:1299-1300`, `:1363`). The hold/ease/hold/ease structure with quint (`:1263-1273`) is the best timing in the app, but there is no shape motion.
- **12 of 28 variations do not loop** at the 8 s boundary that the UI's loop ring advertises. The frame at t=0 differs from t=1 by 0.8–2.2 mean absolute difference, against 0.0–0.5 for one 60 fps step (`results.json → seams`). Failing variations: all three Hull variations (drift `t·3.5π`, `:472`), Pulley Orbital/Figure-8/Elastic (non-integer speeds, `:578,583,589`), Swarm Golden Spiral (`t·0.4`, `:745`), Vector Field Spiral (`(t·0.5)%1` hard reset, `:782`), Network Breathe/Swirl (`:959,970`), Morph Shatter (`:1318-1322`) and Radar Random Walk.
- **Random Walk is not deterministic.** It integrates velocity once per *frame* (`:1055-1063`), so the trajectory depends on frame rate. After one loop the hub sits at x = 310 at 30 fps, 422 at 60 fps and −191 at 120 fps (`results.json → edge.randomWalk`).
- **The only timing control is a global speed slider** (`:178`). There is no duration, curve, stagger, direction or in/out control.
- **Credit where due:** rendering is smooth with no jitter. The Hull layout transitions (in-out cubic between four point clouds) and the Morph timing read as intentional.

**What would move it up one band (to 5):**
- Make every preset loop exactly, using integer harmonics of the loop phase and no frame-integrated state.
- Add real per-glyph stagger with direction options, with spreads around 30–80 ms per letter.
- Use a travelling-wave formulation for Undulation.
- Reparameterise path motion by arc length.
- Expose duration plus a curve choice (at least expo, back and spring) per preset.

## 2. Typographic Quality (TQ): **3.0**

**Evidence**
- **Type is incidental in most presets.** Swarm, Vector Field and Network render **no text at all**. Pulley shows six 11 px labels (`:671`). Rollercoaster shows 13 px glyphs inside 16 px-radius bubbles (`:1238,1243`). Radar uses 13 px mono glyphs (`:1075`). Hull uses 19–28 px glyphs (`:441`) scattered as point markers, so the word cannot be read (`ui__index_html.png`).
- **Advances and kerning are destroyed.** Undulation places glyph *i* at a uniform `u = (i+.5)/n` slot (`:916`). Morph divides the word width evenly: `charSpacing = totalW / word.length` (`:1281-1286`). Measured on Morph with "MILLIMETRE" in Syne 900: slot = **114 px**, but M = **172 px** and I = **46 px**. The M collides with its neighbours while each I floats in a 68 px gap (`shots/detail_morph_MINIMUM.png`). The default word reads "HELVET I CA" (`sheet_9.png`). On Undulation, the W and A outlines in "AVATAR WAVE" cross each other (`shots/detail_undulation_AVATAR.png`).
- **Text does not fit the frame.** Morph sizes type from canvas width only (`:1261`). A 20-character string, the input's own `maxlength`, measures **2554 px on a 1280 px canvas** and is cropped on both sides (`shots/ui_morph_longtext.png`). Long text from a URL piles Undulation glyphs on top of each other (`shots/montage_edge2.png`).
- **Unicode breaks.** Strings are indexed by UTF-16 code units (`text[c]` at `:398,929,1367`), so emoji split into "�" replacement glyphs in every preset (`shots/montage_edge1.png`).
- **The user's text gets altered.** Rollercoaster pads short text with "HELVETICA" (`:1221`): typing "I" shows "IHELVETIC" (`shots/edge_single_8.png`). Pulley pads with "PULLEY" (`:646`). Undulation wraps the text in dashes, `-TEXT-` (`:865`). Uppercase is forced everywhere (`:1588`).
- **There is no typographic control at all:** no font picker, weight, tracking, leading, alignment, case, multi-line, or text colour. Glyphs are hard-coded `#ffffff`.
- **Fonts are fixed per preset and depend on the OS.** Most presets use `Helvetica, Arial, sans-serif` (`:442,905,1243`), a system fallback rather than a loaded webfont. It renders as Helvetica on macOS, Arial on Windows and Liberation Sans here, so output varies by machine. `900` weight on that stack becomes synthetic Bold.
- **Glyphs get no knockout.** Hull draws its stroke and vertex dots *through* glyph centres, white on white (`:480-509`).
- **Positives:**
  - Syne 900 on Morph is a strong, current display choice.
  - The Radar glyph field, with distance-driven scale and rotation, is the most typographically interesting idea in the app (`shots/detail_radar.png`).
  - Glyphs rotate to the path tangent on Undulation.

**What would move it up one band (to 4–5):**
- Lay out text with true advances and kerning (cumulative `measureText` of prefixes, or opentype.js).
- Segment graphemes with `Intl.Segmenter`.
- Fit text to the frame, with optional multi-line.
- Add a small curated font list with weight, tracking and colour controls.
- Stop padding or decorating the user's text.
- Put the user's text in every preset.

## 3. Path Control (PC): **2.5**

**Evidence**
- No path can be edited. All paths are hard-coded parametric functions: Rollercoaster Lissajous Knot, Figure-8 and Cardioid (`:1161-1193`); Undulation sine, triangle and |sin| (`:870-884`); and Pulley, Vector Field and Radar trajectories.
- The only "control" is picking a variation chip. Only two presets (Rollercoaster, Undulation) actually put type on a path, and neither has any parameters (amplitude, frequency, radius, offset).
- Text-on-path quality is poor even where it exists: no arc-length parameterisation (13.8× speed variance, tokens overlapping at the cusp), one letter per bubble, no baseline offset or alignment along the path.
- **False affordance:** the canvas shows `cursor-grab active:cursor-grabbing` (`:145`), but only `mousemove`/`mouseleave` are handled (`:1399-1408`). Dragging does nothing.
- The mouse can steer the Vector Field focus point (`:798-801`). That is the only direct manipulation in the app, and that preset has no type.

**What would move it up one band (to 3–4):**
- One shared path system that every type preset can use: a preset path list plus numeric parameters (amplitude, frequency, radius, rotation, start offset), with text laid out by arc length.
- Then draggable anchor points as the first step towards a bézier editor.

## 4. Creative Range & Originality (CR): **4.0**

**Evidence**
- **28 nominal looks but one aesthetic.** Everything is thin white line art on a flat background. There is no foreground colour, gradient, texture, fill/outline choice, blend, depth or blur (`sheet_1-9.png`). Most variations are minor re-parameterisations: Lissajous vs Orbital vs Figure-8 node orbits look nearly identical in `sheet_2.png` and `sheet_6.png`.
- **A few genuinely fresh "signature" ideas:**
  - The convex hull wrapping a letter cloud (Hull).
  - The tangent pulley belt.
  - The Radar glyph field with a magnifying hub and a rotating circular wordmark.
  These have a constructivist, data-diagram identity a motion designer would not find in a template pack. But Hull and Pulley treat letters as anonymous vertices, so they are not usable as titles.
- **Few usable type looks.** Undulation (outline on a wave) and Morph (geometric-to-wordmark dissolve) are the only ones that read as type, and both are familiar template moves, executed with the spacing problems above.
- **Nothing combines.** You cannot layer presets or stack modifiers, and there is no remix or randomise, seed or template. The README's "Crazy Mode" lives only in the orphaned `script.js`.
- **The hidden pages are derivative.**
  - `flash.html` says in a code comment that its scenes are "faithfully ported from STG source" (`flash.html:350`). Its scenes (Arc, Bend, Box, Bug Eye, Halo, Shutter, Slots, Snap, Split, Star, Twist) are the strongest *typographic* range in the repo.
  - `cavalry.html` recreates Satriyo Atmojo's "7 Days of Beginner Motion Graphics" (`cavalry.html:6`); its Wave Duplicator is the most kinetic-type-like frame in the repo (`shots/ui__cavalry_html.png`).
  Both are unlinked and borrowed, so they earn no originality credit for the product.

**What would move it up one band (to 5):**
- Replace the non-type generators with 12 or more *typographic* presets of clearly different character (see the improvement list).
- Keep Hull, Pulley and Radar as signature looks, but make the word legible inside them.
- Add foreground colour and fill/stroke options plus one combinable modifier (for example echo/duplicator) and a seeded "shuffle".

## 5. Export & Embed (EE): **1.0**

**Evidence**
- index.html offers **no export of any kind**: no PNG, video, GIF, embed code or download. The canvas is opaque (`getContext('2d', {alpha:false})`, `:225`), so transparent output is impossible even in principle.
- URL deep-links (`?anim=`, `?text=`, `?bg=`, `:1651-1677`) are the only "share" path. An iframe of that URL embeds the whole studio UI, chrome included.
- `flash.html:707` has a real-time `MediaRecorder` WebM recorder (VP9, 30 fps). `script.js:629-665` has PNG/SVG/WebM export. Neither is reachable from the product, and there is no MP4 anywhere.

**What would move it up one band (to 3, or 5):**
- Band 3: PNG still export of the canvas at the chosen resolution.
- Band 5: real-time WebM loop capture, plus a chrome-less `?embed=1` player mode.

## 6. Studio UX & Visual Design (UX): **4.5**

**Evidence**
- **The visual identity is good:** Klein blue, Syne/JetBrains Mono, glass panels, a loop-progress ring, and a cohesive pill navigation (`shots/ui__index_html.png`).
- **The canvas has no artboard or safe area.** The animation runs under the nav, the variation bar and the footer (Hull letters are hidden behind the variation pill and the footer in `ui__index_html.png`). There is no aspect-ratio frame, so the user never sees the deliverable's actual bounds.
- **It is a viewer, not a studio.** There are no inspector controls beyond text, speed and background colour. There is no timeline or scrubber, no undo/redo and no saved presets.
- **Features are hidden.** Keyboard shortcuts (Space, R, 1–9, ←/→, `:1631-1649`) are undocumented in the UI. `flash.html` and `cavalry.html` can't be reached. Labels are 8–10 px mono at 50–70 % white on saturated blue, which is low contrast.
- **Accessibility:** `[aria-label]` count is 0. The six background swatches are `div`s with `tabIndex = -1`, so they are not keyboard-reachable (`results.json → edge`).
- **Mobile at 390 px** (`shots/ui_mobile_390.png`): the nav is clipped with a hidden scrollbar ("04 VECTOR FIE…"), the preset title and description are hidden, and the footer takes about 20 % of the screen and covers the art.
- The text input silently caps at 20 characters and forces uppercase. Several presets ignore or pad the text, with no feedback to the user.

**What would move it up one band (to 5–6):**
- An artboard with an aspect-ratio picker, so the UI never overlaps the art.
- A side inspector with labelled, accessible controls.
- A scrubber.
- Visible shortcuts.
- Focusable swatches with proper labels and contrast.

## 7. Performance & Robustness (PR): **5.0**

**Evidence**
- **Cheap to render:** 1.1–13.4 ms per frame at 1920×1080 on headless *software* raster (Swarm is the heaviest at 12–13 ms; `results.json → cost`). It will hold 60 fps on a GPU-backed laptop.
- **No console errors** on any page. The only warning is the Tailwind CDN production notice.
- **Edge cases break:**
  - Emoji turn into "�" (`montage_edge1.png`).
  - 20-character text overflows Morph (`ui_morph_longtext.png`).
  - URL `?text=` bypasses the 20-character cap, and long text collapses Undulation and Hull into piles (`montage_edge2.png`).
  - Single-character text makes Hull degenerate into a line (`edge_single_1.png`).
  - Empty input falls back silently to "HELVETICA" (`:1589`).
- **Rendering is not deterministic:**
  - `Math.random()` phases are rolled at load (`:401,692,697-698`).
  - Random Walk depends on frame rate.
  - Fonts depend on the OS.
  - 12 of 28 variations have loop seams.
- **Runtime dependencies:** the page relies on the Tailwind JIT CDN and unpinned `lucide@latest` (`:15,17`), so it styles and icons fail offline and can break whenever lucide ships a new version.
- **Handled well:** the DPR cap of 2 and resize handling are fine.

**What would move it up one band (to 6):**
- Grapheme-safe text handling, fit-to-frame text, seeded randomness and a stateless render(t).
- Pinned and self-hosted dependencies.
- An input length policy that behaves the same for the UI and URL params.

## 8. Engineering Quality (EQ): **4.0**

**Evidence**
- **One 1,680-line HTML file** with an inline script and a global mutable `state`.
- **Renderers are not pure.** They read `state.variationIdx` and `state.text` and mutate module globals (`pulleyNodes`, `radarWalk*`).
- **Dispatch is a `switch`** (`:1466-1476`). Variations are if/else branches copied inside each renderer, and there is no preset contract beyond the `ANIMATIONS` metadata array.
- **Dead or orphaned files:**
  - `script.js` (768 lines) targets DOM ids such as `mainCanvas` and `graphCanvas` that do not exist anywhere.
  - `debug.js` uses puppeteer against port 8080, but there is no package.json.
  - `smear_test.png` is a stray test image.
  - Three directories are empty (`anthropics-skills/`, `claude-design-auditor-skill/`, `code-audit/`).
- **The README describes a different product:** stacked text, 6 motion presets, mic/webcam, 8 Google Fonts, PNG/SVG export, Crazy Mode.
- **`cavalry.html` duplicates the index UI** wholesale.
- **Positives:**
  - The code is readable and sectioned.
  - Adding a preset is straightforward: a function, a metadata entry and a switch case.
  - `?bg=` is regex-validated (`:1673`), and `?text=` only ever reaches `fillText`, so there is no injection path.

**What would move it up one band (to 5):**
- Split the code into engine, presets and UI.
- Give presets a `render(ctx, t, params)` contract with declared params.
- Remove dead files and fix the README.
- Pin dependencies and add a build step.

---

## Ranked: 8 highest-impact improvements for the redesign (Art Director's view)

1. **A real type layout engine shared by every preset.**
   - Shape text with true advances plus pair kerning (cumulative `measureText` of prefixes as the minimum; opentype.js for GPOS kerning and ligatures as the ideal).
   - Segment with `Intl.Segmenter` so emoji and diacritics survive.
   - Auto-fit to the artboard; support multi-line with leading and alignment, tracking, and case options (none / upper / lower / title).
   - Ship a curated library of about 15 families: at least five variable fonts (Roboto Flex, Anybody, Fraunces, Bricolage Grotesque, Big Shoulders), plus Syne, Space Grotesk, Unbounded, Instrument Serif, Inter Tight and a mono. Allow custom font upload.
   - Add foreground colour, fill and/or stroke. Never pad or mutate the user's string. This fixes the bulk of TQ in one move.

2. **A per-glyph "Text Animator" core**, modelled on After Effects range selectors and Cavalry's Stagger.
   - Units: character, word or line.
   - Stagger amount in ms, with order L→R, R→L, centre-out, edges-in, or seeded random.
   - Keyframed properties per unit: position, scale, rotation, opacity, blur, tracking, and font-weight/width axes.
   - In → hold → out structure with separate durations.
   - Easing: a cubic-bézier editor with named presets (expo-out `0.16,1,0.3,1`, "snappy" `0.7,0,0.3,1`, back-out) and a damped-spring option (stiffness/damping) for overshoot and settle.

3. **Loop-perfect, deterministic timing.**
   - Every preset becomes a pure `render(t ∈ [0,1), params, seed)` using integer harmonics only, with no `Math.random()` and no frame-integrated state.
   - Add a CI test that frame 0 equals frame N.
   - The preview and every export then come from the same function.

4. **A shared, editable path system.**
   - Bézier editor: drag anchors and handles, add and delete points, open or closed paths. Add freehand draw with smoothing.
   - Path presets: line, arc, circle, wave, spiral, S-curve, figure-8, heart, plus a stroke trace of the text itself.
   - Text on the path by **arc length**, with offset/alignment, baseline shift, auto-orient with flip protection at cusps, and an animated start offset for marquee/orbit.
   - Later: trim-path draw-on and morphing between two paths.

5. **Rebuild the preset library around type, at 20 or more looks with real contrast between them.** A world-class kinetic type tool must have:
   - Masked line-rise reveal (expo-out, per-line clip)
   - Typewriter with cursor
   - Scramble/decode
   - Split-flap/slot reels
   - Stacked fill-width "accordion" rows (the README's own idea, done properly)
   - Echo/duplicator trails (Cavalry Wave Duplicator)
   - A variable-font weight/width wave travelling through the word
   - Spring bounce with squash and stretch
   - Blur/focus-pull in
   - Outline draw-on that fills
   - A 3D cylinder/ring rotate
   - Displacement wobble or liquid via SVG filter or shader
   - A glyph-field/radar magnifier (keep the Radar idea)
   - BPM strobe cuts (keep the Flash idea, written fresh rather than ported)
   - Ticker/marquee on a path
   - True outline morph between two words (flubber-style point interpolation, not a crossfade)

   Keep Hull, Pulley and Radar as the house "signature diagram" style, but with the word legible. Demote Swarm, Vector Field and Network to backgrounds or fields that *interact with* type.

6. **Make effects combinable.**
   - Stack modifiers (path + stagger + echo + colour cycle), multiple text layers, and backgrounds that are solid, gradient or transparent. Add blend modes.
   - A seeded **Shuffle/Remix** button and a set of curated style packs, so users stumble into great results.

7. **Export that matches the preview exactly.**
   - Offline, frame-stepped render. Encode H.264 MP4 via WebCodecs and mp4-muxer, falling back to VP9 WebM.
   - Also GIF, a PNG sequence and transparent WebM.
   - Resolution and aspect options: 16:9, 9:16, 1:1, 4:5. Frame rates 24/30/60. Loop-count choice.
   - Embed options: a chrome-less player URL as an iframe snippet, a web component, and a self-contained HTML download.

8. **A studio shell with an artboard.**
   - A safe area, so UI never overlaps the art.
   - An inspector, a timeline scrubber with in/out points, and a live easing-graph widget.
   - Undo/redo and visible shortcuts.
   - Accessible, focusable controls with labels of 11 px or larger.
   - Integrate or retire flash.html and cavalry.html, and delete the dead files.
