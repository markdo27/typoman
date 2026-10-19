# TYPOMAN Round 0 (baseline): Working Motion Designer (end user)

**Judge lens:** a freelance motion designer who ships YouTube intros, website heroes, IG/TikTok stories and event visuals every week in After Effects. I weight **PC, EE and UX** most, but I scored all eight criteria.
**Target:** the existing app at `scratchpad/baseline/`. I judged `index.html` as "the product" and glanced at `flash.html` and `cavalry.html`.
**Method:** I served the app on :8702 and drove it with Playwright/Chromium (headless, software raster) at 1440x900, 1920x1080, 1024x768, 608x1080 (9:16) and 390x844 (mobile). I clicked, typed and used the keyboard, read pixels back from the canvas, used ffprobe on the one exported file, and read the code. Evidence is in `bench/round-0/motion-designer/` (`shots/`, `sheet_*.png`, `drive*.log`, `drive*.mjs`, `flash_export.webm`).

## Scores

| Criterion | Band |
|---|---|
| MC: Motion Craft | **4.5** |
| TQ: Typographic Quality | **3.0** |
| PC: Path Control | **3.0** |
| CR: Creative Range & Originality | **5.0** |
| EE: Export & Embed | **1.5** |
| UX: Studio UX & Visual Design | **4.0** |
| PR: Performance & Robustness | **4.5** |
| EQ: Engineering Quality | **3.5** |
| **Overall (mean 3.625, rounded)** | **3.5** |

**Verdict for a working designer:** it's a good-looking toy, but I can't ship anything with it. I couldn't complete any of my four deliverables. `index.html` has no export of any kind, no canvas size or aspect setting, no path editing, no font or text-colour control, and the studio UI is always drawn over the artwork.

---

## Scenario outcomes

### A. 1080p 16:9 YouTube intro with my own word, exported as MP4: **FAILED**
- Typing works and updates live. But the input forces UPPERCASE ("kairos studio" became "KAIROS STUDIO") and silently cuts text at 20 characters (`maxlength=20`).
- **There is no export.** The page has no MP4, WebM, GIF or PNG control, and no `MediaRecorder`, `VideoEncoder`, `toBlob` or `toDataURL` code at all (`drive2.log`).
- **There is no resolution setting.** The canvas is just the browser window. Even "1080p" by resizing the window gives a frame with the header, preset pills, FPS badge and control footer on top of it (`shots/A_1080p_morph_ui_overlay.png`).
- The fullscreen button works, but all the UI stays on screen (`shots/A_fullscreen_still_has_ui.png`). So even OS-level screen recording can't capture a clean plate.
- There's no in/out or intro-hold-outro structure. Everything is an endless 8 s loop that you can only speed up or slow down (0.2–3.0x, so 2.7–40 s loops).

### B. Website hero, embedded on a page: **FAILED (fragile workaround only)**
- There is no embed feature, snippet or "copy code" button.
- The only route is an undocumented deep link, `index.html?anim=undulation&text=…&bg=%23111111`. Inside an iframe, the full studio UI covers most of a 1216x420 hero (`shots/B_iframe_embed.png`). At 400x225 the control footer hides the animation completely (`shots/B_iframe_small.png`).
- The URL can't carry the variation, speed, font or colours, so the embed doesn't reproduce the look I set up.
- There's no transparent background, no chromeless player, and no autoplay/loop/reduced-motion options.
- The URL params are parsed safely: an invalid `anim` and `bg` are ignored, and HTML in `text` only ever reaches the canvas.

### C. Vertical 9:16 story with text on a custom path I shape: **FAILED**
- The only way to get 9:16 is to resize the window (`shots/C_916_*.png`).
- The canvas shows a `cursor: grab`, but dragging, double-clicking and the mouse wheel do nothing. Canvas pixels and state were unchanged after the drag (`drive2.log`).
- "Paths" exist only as variations inside two presets:
  - **Rollercoaster:** Lissajous knot, figure-8 or cardioid.
  - **Undulation:** sine, zigzag or bounce baseline.
- None of these paths has any parameter (size, amplitude, position, rotation, start offset).
- Text-on-path quality is poor:
  - Rollercoaster shows exactly 9 letters, 13 px, inside circles. Short words are **padded with "HELVETICA" letters** ("KAIROS" renders as **"KAIROSHEL"**). Long words are truncated ("KAIROS STUDIO" becomes "KAIROS ST").
  - Letters rotate with the tangent, so they appear sideways or upside down.
  - Tokens are spaced evenly by curve parameter rather than by distance along the path, so they bunch and overlap at the cardioid cusp (`sheet_paths.png`).
  - On the Lissajous knot, part of the track runs under the footer.
- Pulley Belt pads in the same way, with "PULLEY".

### D. Font, colours and background to match a brand: **MOSTLY FAILED**
- The page has only three inputs: text, speed and background colour (`drive2.log`). There is **no font picker and no text, stroke or fill colour.**
- All artwork is hard-coded white. A cream brand background (#F4EFE6) makes the word nearly invisible and also makes the studio UI unreadable, because the glass panels are tinted from the background colour (`shots/D_brand_cream_bg.png`).
- A dark or saturated brand background (#FF5A1F) works, but only for brands whose type is white (`shots/D_brand_orange_bg.png`).
- Fonts are fixed per preset (system Helvetica/Arial, Syne, JetBrains Mono). Because Helvetica isn't loaded as a web font, the output depends on the viewer's OS.

---

## Criteria

### 1. Motion Craft (MC): 4.5
**Evidence**
- Most motion is sine/Lissajous parametric movement (Pulley, Swarm, Vector Field, Network, Radar, Rollercoaster, Undulation).
- A few presets show real craft:
  - Type Hull: staggered cubic, stepped and elastic transitions between four layouts.
  - Morph: hold, then quint-eased crossfade, then hold.
- Morph is an opacity crossfade between outline shapes and letters, not a true shape morph.
- The only controls are a speed slider and a variation per preset. There are no easing, stagger, direction or duration controls.
- **Loop seams, measured by pixel diff between t=0 and t=1:** 11 of 28 variations don't close the loop.
  - Type Hull ×3: the jump at the wrap is about 12× a normal frame step.
  - Vector Field "Spiral": about 8×.
  - Network "Breathe": about 6.6×.
  - Morph "Shatter": about 6.5×.
  - Also affected: Swarm "Golden Spiral", Pulley "Orbital", "Figure-8" and "Elastic", Network "Swirl", Radar "Random Walk".
  - Details are in `drive2.log`. The preview never wraps time, so you don't see the pop live, but any exported loop would have it.
- The Radar "Random Walk" is stateful and tied to frame rate, and **it keeps moving while paused**. The hub went from (-13,-8) to (-368,-177) in 1.5 s while paused.
- Rollercoaster tokens move at uneven speed because they're spaced by curve parameter, not distance along the path.

**Up one band (to 5–5.5):**
- Make every loop mathematically seamless: all periodic terms should be whole multiples of the loop.
- Add global easing presets and a stagger amount/order control.
- Space letters on paths by distance along the path.
- Stop the random walk when paused.

### 2. Typographic Quality (TQ): 3.0
**Evidence**
- In 3 of 9 presets (Swarm, Vector Field, Network) **the text input has no effect at all**: the pixel diff between two different words was 0.
- In 2 more presets (Pulley, Rollercoaster) the word is 11–13 px labels padded with filler letters.
- Type Hull caps letters at 28 px even at 1080p, and the inner letters pile up into an unreadable cluster.
- Letters are drawn one at a time with no kerning:
  - Morph uses a uniform per-character advance (`totalW/len`), giving "KA I ROS" and a W/A collision in "AV WA TO".
  - Undulation spaces letters evenly along the curve, so "RO" overlaps and word spaces balloon.
- Long words overlap (Undulation) or get clipped on both edges (Morph at 1440 px and at 390 px mobile).
- Emoji split into "??" replacement glyphs because the text is split by UTF-16 code unit, not by grapheme (`sheet_edge.png`).
- Uppercase is forced; there is no multi-line, alignment, tracking, weight, font choice or custom font.
- CJK falls back to a system font acceptably.

**Up one band (to 4):**
- Offer a font picker of 6–10 curated web fonts and allow mixed case.
- Use a proper text layout pass (measure the whole string; per-glyph advances from prefix measurements) and split text into graphemes so emoji survive.
- Make every preset use the full user text, with no filler and no silent truncation, and auto-fit it to the frame.

### 3. Path Control (PC): 3.0
**Evidence**
- There's no path tool or path concept in the UI. The paths are hard-coded functions:
  - Rollercoaster: three closed curves.
  - Undulation: three baseline modes.
  - Radar and Vector Field: three focus-point paths each, where the moving point isn't text.
- No parameters are exposed (amplitude, scale, position, rotation, start offset, direction), and nothing is directly editable.
- The canvas advertises dragging with a grab cursor, but dragging does nothing.
- The text that follows these paths is crude (see Scenario C).
- Scenario C failed outright.

**Up one band (to 4):**
- Add a labelled "Path" section that works across text presets, with presets (line, arc, circle, wave, S-curve, spiral, figure-8).
- Add numeric controls (size, amplitude, rotation, offset, travel speed) and arc-length text placement with upright or tangent orientation.
- Reaching 5+ needs draggable anchors; 7 needs a real bézier editor.

### 4. Creative Range & Originality (CR): 5.0
**Evidence**
- There are 9 effects and 28 variations in total.
- Some ideas are genuinely fresh for a type tool: the convex hull wrapping letters, tangent pulley belts, the radar letter grid with a rotating wordmark hub, and the triple-rail rollercoaster ribbon. They read like Cavalry procedural studies, not template-pack material.
- But every look shares one aesthetic: thin white line art on a solid colour.
- Effects can't be combined. There's no colour, fill, stroke, glow or texture styling, no randomise or remix, and no templates.
- Three effects aren't typography at all.
- The type-forward presets (text on a wave, crossfade from shapes) are familiar.
- `flash.html` (13 strobe scene modifiers) and `cavalry.html` (stacked echo type) add range but aren't reachable from `index.html`.

**Up one band (to 5.5–6):**
- Rework the three text-free effects into type effects.
- Add style layers (fill, stroke, gradient, glow, echo or trail) that apply to any preset.
- Add a "remix" or randomise button.
- Fold the Flash and Cavalry looks into the main studio.

### 5. Export & Embed (EE): 1.5
**Evidence**
- `index.html` has no download of any kind, not even a PNG.
- The only embed route is the undocumented `?anim&text&bg` deep link. In an iframe it shows the whole studio UI over the art, and it can't carry the variation, speed or colours (Scenario B).
- Credit for what I found while glancing at the other pages:
  - `flash.html`, which `index.html` doesn't link to, has a real-time `MediaRecorder` WebM capture.
  - My test produced VP9 at **1440x900 (the window size) even though 9:16 was selected**. The `saveMode` aspect radios are written but never read.
  - The file was 1.38 s at a variable ~19.6 fps (r_frame_rate 235/12), with 5 decoded frames in headless.
  - It is not MP4, and it is real-time capture, not offline rendering.
- The README claims PNG and SVG export. That code exists only in the orphaned `script.js`, which no page loads.

**Up one band (to 3, then 5):**
- Add a PNG frame export at a chosen resolution (gets to 3).
- Add a chromeless `?embed=1` mode with full scene state in the URL and a copy-iframe button, plus at least WebM recording of the artboard only at a fixed size (gets to 5).
- For 7: offline, frame-stepped H.264 MP4 through WebCodecs with resolution and fps options.

### 6. Studio UX & Visual Design (UX): 4.0
**Evidence**

What works:
- The visual identity is attractive and coherent (Klein blue, glass panels, mono UI type).
- Typing updates the animation instantly.
- Keyboard shortcuts exist: Space, R, 1–9 and ←/→.
- Buttons show a visible focus ring.
- The page reflows reasonably at 1024 px and 390 px.

What doesn't:
- The UI floats over the artwork. The footer hides the bottom of the Type Hull and Rollercoaster paths, and the header collides with the Radar hub.
- There's no artboard, no hide-UI mode, no timeline or scrubber (the loop ring is display-only), no undo/redo, and no save/load.
- 3 of 9 presets ignore the text box with no explanation.
- Shortcuts are mostly undocumented (only Space and R appear in tooltips). `flash.html` and `cavalry.html` aren't linked from the main page.
- The text field silently truncates.
- A light background makes the UI unreadable.
- On mobile the active preset scrolls out of view in the hidden-scrollbar pill bar.

Accessibility:
- The background swatches are `<div>`s, so they aren't keyboard- or screen-reader-accessible.
- The text and speed inputs have no `<label>`. Icon buttons rely on `title`.
- Some labels are 9 px at 50% opacity.
- `prefers-reduced-motion` is ignored.

**Up one band (to 5):**
- Put the artwork on a framed artboard the UI never covers, with aspect presets.
- Add a scrubbable timeline.
- Add undo/redo.
- Add a visible shortcuts sheet and link the other engines.
- Make the swatches focusable buttons with labels.

### 7. Performance & Robustness (PR): 4.5
**Evidence**

What works:
- There are no console errors in normal flows. The only warning is Tailwind's "CDN should not be used in production".
- In headless software raster at 1920x1080 and 2× pixel density, 8 of 9 presets run at about 51–61 fps. Type Hull runs at 23 fps because of heavy `shadowBlur`. This is a relative signal only.
- Several things fail gracefully:
  - Empty input falls back to "HELVETICA".
  - Bad URL params are ignored.
  - The UI and canvas re-layout on resize.

What breaks:
- **Frames aren't deterministic.** Type Hull and Swarm give different frame hashes at the same t across two fresh loads, because they use `Math.random()` seeds.
- **Random Walk depends on frame rate and moves while paused.**
- **The CDN is a single point of failure.** With `unpkg.com` blocked (`lucide@latest` is unpinned), `lucide is not defined` throws before the preset bar is built. No preset buttons appear and typing no longer updates the art (`shots/I_block_unpkg_com.png`).
- Content and layout edge cases break:
  - Emoji are broken.
  - Long words overlap or are clipped.
  - Filler letters are padded in, or text is truncated.
  - Morph is clipped on mobile.
  - A light background makes both the art and the UI illegible.

**Up one band (to 5.5):**
- Seed the random number generator and render from a pure function of t.
- Use a fixed timestep for stateful effects.
- Pin or self-host dependencies and guard against a missing icon library.
- Handle graphemes and auto-fit text.
- Choose text and UI colours by contrast.

### 8. Engineering Quality (EQ): 3.5
**Evidence**
- The product is a single 1,681-line HTML file with an inline script.
- State is global and mutable (`state`, plus per-effect globals such as `radarWalk*` and `pulleyNodes`).
- Render functions draw straight onto a global context, so they aren't pure.
- Effects are picked with a `switch`, and variations by magic index numbers.
- Button class strings are copy-pasted in three places.
- Adding a preset is easy (an `ANIMATIONS` entry, a render function and a switch case), and the code is readable with clear section headers.
- **Dead or orphaned files:**
  - `script.js` (62 KB) isn't loaded by any page and references 69 element IDs that exist nowhere.
  - `debug.js` (a Puppeteer script against :8080 that isn't installed).
  - `smear_test.png`.
  - Three empty folders.
  - A README that describes a different app (Wave/Accordion presets, microphone, webcam, 8 fonts, PNG/SVG export, "R = randomise colours").
- There's no package.json, tests or lint.
- Dependencies are unpinned (`lucide@latest`) and Tailwind runs from its Play CDN.
- Input handling is safe: `bg` is checked with a regex, `anim` is bounds-checked, and text only goes to the canvas.

**Up one band (to 4.5):**
- Delete the dead files and fix the README.
- Split the code into engine modules (pure `render(ctx, t, params)` per preset) and UI.
- Pin dependencies.
- Add a smoke test (load the page, render each preset, expect no errors).

---

## Top 8 improvements, ranked by impact on a working designer

1. **Offline, frame-accurate MP4 export (EE).** Step frames on a fixed timestep instead of capturing real time, and encode H.264 through WebCodecs with an MP4 muxer, falling back to VP9 WebM. Give me presets for 1920x1080, 1080x1920, 1080x1080, 1080x1350 and 3840x2160, and 24/25/30/60 fps. Let me set duration in seconds or N loops, show progress with a cancel button, and add PNG sequence, transparent WebM and GIF. For After Effects, transparent PNG or WebM is what I actually import.
2. **A real artboard (UX/EE).** Fixed size and aspect, shown letterboxed in a stage so the UI never covers it, with safe-area and title-safe guides, a "clean preview" toggle, and a scrubbable timeline with frame numbers.
3. **Path editor with proper text-on-path (PC).** Start from presets (line, arc, circle, wave, S-curve, spiral, figure-8). Let me drag anchors and bézier handles, add and delete points, and switch open/closed. Space text by distance along the path, with start/offset/align and upright-or-tangent letters. Animate travel and trim, give me numeric inputs, and support undo. Make it work in 9:16 for stories.
4. **Embed and share (EE).** A "Copy embed" panel with a chromeless player URL that carries the full scene (preset, variation, speed, colours, font, path, size). Provide an iframe snippet with a responsive aspect-ratio wrapper and autoplay/loop/pause/reduced-motion/transparent options, a `<typoman-player>` web component, and a self-contained HTML download. Also offer a small MP4/WebM plus `<video>` snippet for heroes.
5. **Typography controls (TQ).** A curated font picker plus upload of TTF/OTF/WOFF2, weight and variable axes, tracking, line height, a case toggle, multi-line text and alignment. Lay out the whole string with kerning, split by grapheme so emoji survive, and auto-fit to the artboard. Never pad with "HELVETICA" or "PULLEY" filler and never truncate silently.
6. **Brand colour system (CR/UX).** Text fill, stroke and accent colours, gradients, a transparent background, and a saved brand kit (fonts plus palette). The UI should keep its own contrast when the background is light.
7. **Motion controls (MC).** Easing presets plus a cubic-bezier editor, stagger amount and order (left-to-right, centre-out, random), direction, and an intro, hold, outro and loop structure in place of the endless loop. Guarantee seamless loops and deterministic, seeded frames.
8. **Workflow and robustness (UX/PR/EQ).**
   - Undo/redo, save/load project as JSON, and full state in the URL.
   - Make all nine presets type-first (rework Swarm, Vector Field and Network).
   - Link or merge Flash and Cavalry into the main studio.
   - Pin or self-host CDN dependencies so one missing icon library can't kill the controls.

---

## Appendix: key measurements
- **Does the preset use the user's text?** Pixel diff between two different words: Type Hull 428,932; Pulley 10,630; **Swarm 0**; **Vector Field 0**; Undulation 552,863; **Network 0**; Radar 443,294; Rollercoaster 12,589; Morph 1,350,300.
- **Loop seams, measured as the difference between t=0 and t=1 (0 means seamless):** 11 of 28 variations are non-zero (0.87–2.82 mean channel diff). The full table is in `drive2.log`.
- **Determinism:** frame hashes at t=0.41 across two loads differ for Type Hull and Swarm, and match for Undulation and Rollercoaster.
- **CDN failure:** with unpkg blocked, 0 preset buttons and typing has no effect. With Tailwind blocked, controls work but the page is unstyled, plus a `tailwind is not defined` error.
- **flash.html export (ffprobe):** `vp9 1440x900, r_frame_rate=235/12, duration=1.38s, 5 frames` (headless). The 9:16 option is ignored.
- **Shots:** `shots/` (d_ = desktop presets, m_ = mobile, A–D = scenarios, E_ = edge cases, F/G = flash/cavalry, I_ = CDN failure). Contact sheets are the `sheet_*.png` files.
