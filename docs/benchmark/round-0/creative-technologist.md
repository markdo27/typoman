# TYPOMAN Round 0 (Baseline): Creative Technologist

**Judge lens:** Creative Technologist. I weight PR, EQ and EE most, but score all eight criteria.
**Subject:** the existing static site. `index.html` is the product (1680 lines, inline JS). EQ also covers the repo as a whole.
**Evidence base:** I ran the app (Playwright and Chromium against `http-server` on :8703) and read the code. Line refs `:NNN` are to `baseline/index.html` unless another file is named.
**Caveat:** headless Chromium uses software raster. Absolute ms/frame figures are pessimistic, but the relative cost between presets is meaningful.

## Scorecard

| Criterion | Band |
|---|---|
| MC Motion Craft | **4.5** |
| TQ Typographic Quality | **3.0** |
| PC Path Control | **3.5** |
| CR Creative Range | **5.0** |
| EE Export & Embed | **1.0** |
| UX Studio UX | **5.0** |
| PR Performance & Robustness | **5.0** |
| EQ Engineering Quality | **3.5** |
| *My overall (mean 3.81 → nearest 0.5)* | *4.0* |

---

## Key measurements (reproducible: scripts in `round-0/creative-technologist/`)

### Determinism

| Test | Result |
|---|---|
| Purity within a session: render t=0.37, then other t values, then t=0.37 again (28 variants) | 27/28 identical. **Radar / Random Walk is impure**: it integrates velocity per frame through module globals (`:1037`, `:1055-1065`). |
| Same scene and same t across two fresh page loads | **5 variants differ**: Type Hull ×3, Swarm Golden Spiral, Swarm Random Burst. Cause: `Math.random()` at `:401`, `:692`, `:697-698`. |
| Random Walk: hub position after 2 s of playback | 60 Hz → (172, −245). 120 Hz → (38, −135). 144 Hz → (114, −226). **The motion depends on the display's refresh rate.** |
| Random Walk while paused (t stays at 0) | The hub still moves to (36, 201). **Pause doesn't pause it**, and `R` (reset) doesn't reset it. |
| Typing a character (Type Hull, same t) | 1.31% of pixels jump, because `initTypeCharacters()` re-rolls the drift phases (`:1590` → `:401`). |
| Mouse hover in Vector Field Lissajous/Spiral | The cursor overrides the authored path (`:798-801`). Frames differ by 2.3% of pixels depending on where the cursor is. |
| Time base | Wall-clock rAF `dt` is accumulated into `state.time` (`:1440-1447`). There's no frame-indexed timeline. |
| Fonts | `document.fonts` is never awaited. "Helvetica, Arial" resolves differently per OS (Liberation Sans in this container), so the same scene renders differently on each machine. |

### Loop seams

One loop unit is 8 s at 1×. That's `state.loopDuration` (`:234`), shown by the loop ring (`:1479`). The table compares frame(t=0) with frame(t=1); 0% means a seamless loop. For scale, "1-frame step" is how much a normal frame-to-frame change moves at that point.

| Variant failing periodicity | Seam (% px) | Normal 1-frame step | Cause |
|---|---|---|---|
| Type Hull Drift / Snap / Elastic | 0.96 | 0.12 (≈8×) | `cos(t·3.5π)` drift, `:472` |
| Pulley Orbital / Figure-8 / Elastic | 0.97 / 1.14 / 1.38 | 0.45–0.64 | non-integer speeds `:578`, `:583`, `:589`; dash offset `:640` |
| Swarm Golden Spiral | 2.14 | 4.15 (dense field, so the % metric saturates; the seam is a 23° jump of the whole spiral) | `+ t·0.4` rad rotation, `:745` |
| Vector Field Spiral | 1.75 | 0.28 (≈6×) | period 2, and the focus teleports back to the centre, `:782` |
| Network Breathe / Swirl | 1.13 / 1.33 | 0.36 / 0.79 | `:959`, `:970` |
| Radar Random Walk | 1.36 | n/a | stateful (see above) |
| Morph Shatter | 1.85 | 0.54 (≈3.4×) | `sin(i·2.1 + t·6)`, `:1322` |

**12 of 28 variants are not seamless at the advertised loop length.** The other 16 measure exactly 0%.

### Per-frame render cost

Median ms per frame, worst variant of each preset, with a forced raster flush.

| Preset | 1920×1080 @1× | 1920×1080 @2× (retina full-screen) |
|---|---|---|
| Type Hull | 6.0 | **30.9** (p95 38) |
| Pulley Belt | 2.7 | 10.9 |
| Swarm | 9.3 (p95 12.8) | **20.9** (p95 40) |
| Vector Field | 2.5 | 6.3 |
| Undulation | 2.1 | 10.4 |
| Network | 1.1 | 8.4 |
| Radar | 5.7 (p95 9.9) | 13.5 (p95 29) |
| Rollercoaster | 2.2 | 8.0 |
| Morph | 1.3 | 7.3 (p95 16) |

- **shadowBlur, isolated at 2×:** Type Hull drops from 34.3 to 7.6 ms with shadowBlur disabled, so the glow is about 78% of its frame. Swarm Random Burst drops from 19.7 to 11.6 ms.
- **DOM churn while playing:** about 58 layouts/s, 116 style recalcs/s and 58 MutationObserver callbacks/s. The HUD writes the loop ring and percentage every frame (`:1481-1482`), and that wakes the Tailwind Play CDN's observer each time. The cost is about 41 ms/s of main-thread work outside the canvas.

### Robustness and edge cases

| Case | Result |
|---|---|
| Normal flows: load, every preset and variant via keys, play/pause, typing | **0 page errors.** The only console output is Tailwind's "cdn.tailwindcss.com should not be used in production" warning. |
| CDN unavailable (unpkg / tailwind / fonts blocked) | `tailwind is not defined` (`:20`) and `lucide is not defined` (`:1502`) abort the script. The result is **0 preset buttons, no handlers, no keyboard and no URL params**, while the canvas keeps animating (`load_blockcdn.png`). |
| Unpinned dependency | `unpkg.com/lucide@latest` currently resolves to `lucide@1.59.0`. Neither script tag has SRI (`:15`, `:17`). |
| Emoji `🔥TYPE👍🏽` | Text is indexed by UTF-16 code unit (`:400`, `:675`, `:929`, `:1083`, `:1247`, `:1367`). Surrogate pairs get split and render as "?" boxes (`shots/text_emoji_anim5.png`). |
| 20-char text (the UI maximum) in Morph | The word is 2196 px wide in a 1280 px canvas and is clipped on both sides (`shots/text_long20_anim9.png`). |
| `?text=` length | Unbounded: the input's `maxlength=20` (`:164`) is bypassed by the URL path (`:1663-1669`). At 5000 chars, **Undulation takes 531 ms/frame** and Type Hull 46 ms (20,000 glyph objects). Even 200 chars costs 29 ms/frame, and the text becomes a smear. A shared link is enough to freeze a tab. |
| Short text | Padded with filler: "HI" becomes "HIHELVETI" on the rollercoaster (`:1221`) and "HIPULL" on the pulleys (`:646`). |
| Empty input | The canvas silently shows "HELVETICA" while the input field is empty (`:1589`). |
| DPR change without a resize (moving to another monitor) | The backing store stays at 1× (1280×720 at DPR 2), so the canvas goes blurry. |
| Tiny viewport (320×240) | The footer covers 70% of the viewport. On a phone the preset bar scrolls with a hidden scrollbar. |
| Resize storm | No errors. |
| Hostile params (`anim=__proto__`, script-like `text`, quoted `bg`) | No injection and no dialogs. Text only ever reaches canvas sinks, and `bg` is regex-validated (`:1673`). |

---

## Per-criterion detail

### 1. Motion Craft (MC): 4.5
**Evidence**
- An easing library exists (`:316-337`) but is used sparingly:
  - Type Hull: cubic, step and elastic, with an 8% stagger (`:451-465`).
  - Network Orbit: cubic (`:981`).
  - Morph: quint (`:1268`).
  - Swarm Burst: back (`:735`).
  - Everything else is raw sine or Lissajous.
- 12 of 28 variants pop at the loop seam (table above), and Random Walk depends on the frame rate.
- The only timing control is global speed. There are no easing, stagger, direction or duration controls.
- Morph spends half its loop in two static 2 s holds with no secondary motion (`:1265-1273`).
- Vector Field "Mouse Only" is a single static frame when there's no cursor.

**To move up one band (→5.5):**
- Make every variant periodic at the declared loop. All angular frequencies should be integer multiples of the loop period. Fix the 12 failing variants and replace Random Walk with closed-form noise.
- Expose easing curve, stagger amount and order, and duration per preset.
- Add settle and secondary motion during holds.

### 2. Typographic Quality (TQ): 3.0
**Evidence**
- **3 of 9 "typography" presets draw no text at all:** Swarm (`:702-765`), Vector Field (`:771-857`) and Network (`:948-1031`) contain zero `fillText`/`strokeText` calls. Pulley shows six 11 px labels (`:671-675`).
- There are no font, size, weight, tracking, case or colour controls. Text is always `#fff`, always uppercase (`:1588`), and capped at 20 characters.
- Glyphs are drawn one at a time in uniform slots (Morph `:1281-1286`, Undulation `:916`). Kerning and advance widths are lost, so an "I" gets the same slot as an "M".
- The Type Hull hull line strikes through glyph centres (`:490-501`), and interior glyphs collide on a phone (`shots/viewport_phone_390x844.png`).
- Emoji break, long text overflows, and the main face depends on the OS's system fonts.

**To move up one band (→4):**
- Render the user's text in every preset.
- Bundle a few fonts and add size and text-colour controls.
- Segment text by grapheme cluster (fixes emoji).
- Auto-fit or clamp long text to the canvas.
- Allow mixed case.

### 3. Path Control (PC): 3.5
**Evidence**
- There's no path editing, no path parameters and no custom paths.
- Some "path choice" exists only as variant pills:
  - Rollercoaster: Lissajous Knot, Figure-8 or Cardioid, all hard-coded parametric formulas (`getRollercoasterPos`, `:1161-1193`).
  - Undulation: Sine, Zigzag or Bounce (`:870-884`).
  - Radar, Vector Field and Pulley: hub and focus trajectories.
- Path and motion style are bundled into one variant enum, and paths can't be applied across presets.
- Hover steering of the Vector Field focus is transient, not authored.

**To move up one band (→4.5):**
- Promote paths to a shared library that any text-on-path preset can use.
- Add numeric path parameters: scale, rotation, amplitude, frequency and offset.
- Draw a path overlay with a few draggable control points.

The 7 anchor (editable Bézier) needs the path-as-data work in Rec. 8.

### 4. Creative Range & Originality (CR): 5.0
**Evidence**
- 9 presets × 3–4 variants give 28 looks with a coherent Klein-blue, white line-art identity.
- A few ideas are genuinely fresh: the convex hull of letters, the pulley-belt tangent hull (`:521-561`) and the radar glyph field.
- But the range is narrow:
  - There's one colour treatment: white on a solid background, with 6 swatches and a picker.
  - There are no fills, gradients or effects, and nothing can be combined (one preset at a time). There's no remix or randomise.
  - A third of the presets ignore the text.
- The set mirrors common Cavalry tutorial setups. `cavalry.html` in the same repo is titled as a recreation of a named creator's series (`cavalry.html:6`) and shares palette tokens with `index.html`: electric, indigo and light-indigo, plus the `#030373` navy swatch (`cavalry.html:24-31` vs `:24-30`, `:194`).

**To move up one band (→6):**
- Put text in every preset.
- Add fill and colour systems.
- Make modifiers combinable (path × motion × glyph style).
- Add seeded remix.
- Add 2–3 signature looks that aren't tutorial staples.

### 5. Export & Embed (EE): 1.0
**Evidence**
- `index.html` contains **no export code of any kind**: no MediaRecorder, VideoEncoder, toBlob, download, GIF, PNG or embed snippet.
- The only "embed" is iframing the whole studio with `?anim=&text=&bg=` (`:1651-1677`). In a 640×360 iframe the header, nav and footer cover most of the frame (`shots/embed_iframe.png`).
- There's no chromeless mode, no autoplay, loop or seek params, and no postMessage API.
- Real-time WebM recorders exist only in orphaned files (`script.js:651-669`, `flash.html:706-711`), and the product can't reach them. They hard-code `video/webm;codecs=vp9` without `isTypeSupported`, so they would throw on Safari.
- `alpha:false` (`:225`) also rules out transparent output as built.

**To move up one band:**
- PNG still export at a chosen resolution (→3).
- Then MediaRecorder capture with `isTypeSupported` negotiation, plus a chromeless embed route (→5).

The real target, Rec. 3, is offline WebCodecs MP4.

### 6. Studio UX & Visual Design (UX): 5.0
**Evidence**
- Strengths: a clean glass-panel UI with consistent mono type, pill navigation, keyboard shortcuts (1–9, Space, ←/→, R; `:1631-1649`), and a loop ring with an FPS badge.
- There's no undo.
- There's no artboard or aspect-ratio presets: the canvas is the viewport, so compositions run under the footer. The footer covers 13–20% of the viewport at common sizes and 70% at 320×240.
- On phones the preset bar scrolls with a hidden scrollbar (`:90-91`, `:149`).
- Accessibility gaps:
  - The 6 colour swatches are non-focusable divs, so none can be reached by keyboard.
  - The speed slider has no accessible name.
  - The page has no `aria-label`, `aria-pressed` or `role` attributes and no `<label>` elements.
  - There's no `prefers-reduced-motion` handling, and UI text is 8–11 px.
- There are no loading or error states: a CDN failure leaves a dead UI.
- Preset names are jargon, and the workflow dead-ends because nothing can be exported.

**To move up one band (→6):**
- Add undo/redo.
- Add an artboard with 16:9, 9:16 and 1:1 presets that keeps the UI off the composition.
- Make the swatches accessible buttons and label the slider.
- Add a shortcut help panel, reduced-motion handling, and error and loading states.

### 7. Performance & Robustness (PR): 5.0
**Evidence**
- Typical use is smooth: every preset is ≤9.3 ms median at 1080p @1×, and normal flows show 0 page errors. That's the good half of band 7.
- But the edge cases and determinism fail (tables above):
  - A CDN failure kills the UI, and the Lucide dependency is unpinned.
  - Emoji break, long text overflows, and `?text=` is unbounded (531 ms/frame at 5000 chars).
  - Random Walk depends on refresh rate and ignores pause.
  - 5 variants aren't reproducible across reloads, and the output depends on the cursor.
  - Fonts aren't awaited, and DPR changes aren't handled.
  - At 2× DPR, Type Hull (31 ms) and Swarm (21 ms, p95 40) blow the 16.7 ms budget, mostly because of shadowBlur.

**To move up one band (→6):**
- Segment by grapheme cluster, cap text length, and auto-fit text.
- Remove the runtime-CDN single point of failure.
- Use seeded randomness and remove the per-frame integrator.
- Await font loading and handle DPR changes.
- Replace shadowBlur so 2× stays under 16 ms.

### 8. Engineering Quality (EQ): 3.5
**Evidence, product file**
- One 1680-line HTML file with inline script.
- A global mutable `state` (`:228`) is read inside every render function (e.g. `:428`, `:646`, `:712`). Render functions draw to the global `ctx` instead of taking a target parameter.
- Module globals are mutated every frame (`pulleyNodes` `:516`/`:609`, `radarWalk*` `:1037`).
- Presets are coupled by array index across four places: a `switch` (`:1466-1476`), `ANIMATIONS` (`:246`), keyboard 1–9 (`:1639`), and `if (variant === n)` chains.
- Tailwind class strings are duplicated three times each (`:1508`/`:1555`/`:1557` and `:1528`/`:1541`/`:1543`).
- Fallback text is inconsistent between presets (`:646`, `:865`, `:1041`, `:1221`, `:1259`, `:1589`).
- Dependencies are the Tailwind Play CDN (an in-browser JIT that its own warning says not to use in production) and an unpinned `lucide@latest`.

**Evidence, repo**
- `script.js` (768 lines) is orphaned. No page loads it, and it requires DOM ids (`mainCanvas`, `graphCanvas`, `warpOverlay`, …) that exist in no HTML file.
- The README describes `script.js`'s product (stacked text, 6 presets, mic, webcam, PNG/SVG export), not `index.html`.
- `debug.js` requires puppeteer, but there's no `package.json`, and it targets port 8080.
- `smear_test.png` is a committed test artefact, even though `.gitignore` lists its siblings.
- There are 3 empty directories.
- `flash.html` and `cavalry.html` are unlinked from the product.
- The Pages workflow deploys the repo root (`.github/workflows/pages.yml:29`, `path: '.'`), so all of the above is public.
- There are no tests, no lint and no build.

**Credit:**
- Render functions are mostly self-contained and pure in t (27 of 28 variants).
- The `anim` and `bg` params are validated.
- No user input reaches `innerHTML`.

**To move up one band (→4.5):**
- Delete the orphans and fix the README.
- Split engine, presets and UI into ES modules, with a preset registry replacing the index coupling.
- Pin and bundle dependencies.
- Add a `package.json`, one Playwright smoke test, and deploy only built output.

---

## Ranked engineering recommendations for the redesign

1. **One pure, deterministic render core, shared by studio, embed player and exporter.**
   - Signature: `render(ctx, scene, frame, {fps, width, height, dpr})`. It touches no DOM or globals and never calls `Math.random`, `Date` or `performance`.
   - `scene` is versioned JSON: text, font, preset id and params, path, palette, duration, fps and seed.
   - Export time is `frame/fps`. The preview uses the same function with a quantised clock.
   - Randomness comes from a seeded PRNG (e.g. mulberry32 of seed ⊕ preset id ⊕ glyph index). Stateful integrators like Random Walk become closed-form noise of t.
   - Mouse input becomes either an explicit scene param or a preview-only overlay, never hidden state.
   - Lock it in CI with golden frame hashes per preset: the purity, cross-reload and refresh-rate checks from this round's harness.

2. **A preset contract with a loop validator.**
   - Shape: `definePreset({ id, version, params: {key: {type, min, max, default}}, loop, prepare(scene) → cache, draw(ctx, t, scene, cache) })`.
   - A registry drives the nav, the params UI and the shortcuts. This removes the index coupling between the `switch`, `ANIMATIONS` and the 1–9 keys.
   - `prepare` does text shaping and layout once per change, not once per frame.
   - CI enforces `frame(0) == frame(loopFrames)` (12 of 28 fail today) and a per-preset ms budget.

3. **Offline, frame-accurate MP4 export with codec negotiation.**
   - A Worker renders each frame on an OffscreenCanvas into `new VideoFrame(canvas, {timestamp: i·1e6/fps})`, which feeds a `VideoEncoder`.
   - Probe with `VideoEncoder.isConfigSupported` in order: `avc1.640028` (High), then `avc1.4D0028` (Main), then `avc1.42E028` (Baseline), then `hvc1`, then `vp09.00.10.08`, then `av01.0.08M.08`.
   - Mux to MP4 (mp4-muxer or mediabunny, fast-start) or WebM, depending on the codec chosen.
   - Encoder settings: even dimensions for 4:2:0, `latencyMode:'quality'`, a fixed keyframe interval, and bitrate scaled by resolution × fps.
   - Apply backpressure on `encodeQueueSize`, show progress, and support cancel via AbortController.
   - Fallbacks: MediaRecorder with `isTypeSupported` (mp4, then webm), labelled as real-time capture; then a PNG-sequence ZIP.
   - Extra outputs: GIF, PNG still, and transparency (VP9-alpha WebM or PNG sequence), which needs `alpha:true` (`:225` currently sets `alpha:false`).
   - Verify in CI with ffprobe: `nb_frames == duration·fps`, codec and profile, `yuv420p`, and PSNR of extracted frame k against `render(k)`.

4. **An embed player and hardened URL-loaded scenes.**
   - A separate small player build provides three things: a `<typoman-player>` custom element, a chromeless `embed.html#s=<base64url(scene)>` route, and a self-contained HTML download.
   - Supported params: autoplay, loop, start and poster. A postMessage play/pause/seek API checks the sender's origin.
   - Playback pauses on IntersectionObserver and `visibilitychange`, and `prefers-reduced-motion` shows a poster frame instead.
   - Validate every scene with a strict schema:
     - allowlisted preset and font ids, with numeric clamps;
     - text capped at N grapheme clusters (today's unbounded `?text=` gives 531 ms/frame);
     - a payload-size cap and schema-version migration.
   - Never use `innerHTML`.
   - Load fonts only from allowlisted origins via FontFace with CORS.
   - Set CSP and `frame-ancestors` per route: open for the embed, `'self'` for the studio.

5. **Build, pin, self-host, test and clean.**
   - Use a Vite build with compiled CSS, tree-shaken pinned icons and self-hosted woff2 fonts.
   - `await document.fonts.load()` before the first frame and before export.
   - No runtime CDNs: today any CDN failure leaves a dead UI, and `@latest` has already floated to Lucide 1.59.0. Anything that stays remote gets SRI.
   - Add a `package.json` with ESLint and TypeScript (or JSDoc types), plus Playwright CI covering a console-error gate, determinism, seams and a perf budget.
   - Pages should deploy `dist/` only.
   - Delete `script.js`, `debug.js`, `smear_test.png` and the empty dirs. Move `flash.html`/`cavalry.html` to `/labs` or drop them, and rewrite the README.

6. **A real text engine.**
   - Segment with `Intl.Segmenter` grapheme clusters (fixes emoji).
   - Shape first: get kerned advances from whole-string measurement or harfbuzzjs/opentype.js, then animate per-glyph transforms relative to the shaped positions.
   - Add auto-fit to the artboard, multi-line text, tracking, line height, case and fill controls.
   - Offer a curated bundled font set including variable fonts, using glyph paths for animated axes.
   - Never fall back to system fonts, so renders match across machines.

7. **A render-performance budget.**
   - Replace shadowBlur glows with a cached glow sprite or one half-res blurred layer (`ctx.filter`) or a WebGL2 post pass. At 2× this cuts Type Hull from 34 to about 8 ms.
   - Batch Swarm's 400 arcs into one `Path2D` per style.
   - Cache static layers on an OffscreenCanvas: the background grid (`:1457-1463`) and Radar's dim glyph field.
   - Use a glyph atlas for repeated characters. Radar draws about 1000 `fillText` calls per frame at 1080p.
   - Take the HUD off the per-frame path: update it at 10 Hz or use CSS. That removes the ~58 layouts/s and the observer churn.
   - Add a `matchMedia` DPR listener and adaptive preview resolution.

8. **Treat the path as data, with an editor and undo.**
   - `scene.path` holds cubic Bézier segments (open or closed) with an arc-length lookup table, for constant-speed glyph placement and tangent/normal rotation.
   - Presets consume `scene.path` instead of hard-coded formulas (`:1161-1193`, `:870-884`). Today's Lissajous, figure-8 and cardioid become path presets in a library.
   - Build on-canvas anchor and handle editing with a numeric inspector.
   - Keep the scene immutable with a command history. That gives undo/redo, save/load and share URLs from the same document Rec. 1 renders.

---

### Artefacts
- Scripts: `bench/round-0/creative-technologist/{probe_load,harness,probe_edge,probe_a11y}.mjs`
- Raw results: `harness_result.json` and `edge_result.json`
- Screenshots: `load_default.png`, `load_blockcdn.png`, and `shots/*.png` (emoji, long and short text, phone, ultrawide, tiny, iframe embed, 200-char smear)
