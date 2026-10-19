# TYPOMAN Round 1: Working Motion Designer (end user)

**Judge lens:** a freelancer shipping YouTube intros, website heroes and Instagram/TikTok stories every week in After Effects. I weight **PC, EE and UX** most, and score all eight criteria.
**Snapshot:** commit `3f7aecb`, served at `http://127.0.0.1:8712/`. The cross-origin embed test pages were served from `:8722`. The deployed GitHub Pages copy was byte-identical for `js/boot.js` and `player.js`.
**Method:** I drove the UI like a user with Playwright Chromium on a fresh profile, at 1440×900 and at 390×844 (touch). That meant clicks, real mouse drags on the canvas, keyboard, CDP touch events, the file chooser and the clipboard. I looked at every screenshot. Every exported file was checked with `ffprobe` and frame extraction.
**Evidence:** `round-1/motion-designer/` holds the following.
- `scripts/`: 17 runnable scripts.
- `shots/`: screenshots.
- `dl/`: the exported MP4/WebM/GIF/PNG/ZIP files.
- `frames/`: extracted frames.
- `embedtest/`: the cross-origin pages and standalone HTML files.
- `*.json`: raw results.
- `smoke-test.log`: the app's own test suite.

I didn't read the previous round's scores, so these bands are independent.
**Container caveats (not penalised):** WebCodecs here has no H.264 encoder, so MP4 falls back to AV1. Rendering is software-only, so wall-clock export speed (≈1–2 fps at 1080p) and preview fps (27 fps rAF headless) are not representative.

---

## Overall

| MC | TQ | PC | CR | EE | UX | PR | EQ | **Overall** |
|---|---|---|---|---|---|---|---|---|
| 7 | 7.5 | 8 | 7 | 8.5 | 8 | 8 | 7.5 | **7.5** (mean 7.69) |

**One-line verdict:** this is the first browser type tool I'd actually ship client work from. The path editor and the export/embed stack are near pro-grade. What stops it being an everyday AE replacement:
- there's no per-layer timing;
- text overprints itself at sharp path corners;
- custom brand fonts silently vanish from iframe and web-component embeds.

---

## Scenario outcomes

### A. 1080p 16:9 YouTube intro → MP4 via the Export dialog: **PASS**
- **First run.** A three-step coach-mark tour (Pick a look → Make it yours → Ship it) appears about 0.9 s after boot. It sits beside the panels rather than over the artboard, and Esc skips it. It's remembered, and didn't return after a reload. Boot took ≈0.8 s with **zero console errors**.
- **Setup.** I typed "NIGHTSHIFT" into Content and clicked **Rise**. The preset cards re-render *my* word live, which is a lovely touch.
- **Export dialog.** It offers:
  - MP4 / WebM / GIF / PNG / PNG seq cards;
  - 720p / 1080p / 1440p / 4K;
  - 24 / 25 / 30 / 50 / 60 fps;
  - length in Loops or Seconds;
  - Draft / Standard / High / Max quality;
  - a transparency switch (disabled for MP4, with "MP4 can't store transparency: use WebM or PNG");
  - a size and bitrate estimate and a live preview.
- **Container limitation messaging is exemplary.** An amber box reads "AV1 Main · level 4.0 `av01.0.08M.08`: This browser can't encode H.264, so this MP4 uses AV1… QuickTime, older Safari and many editors can't open it. For a universal H.264 MP4, export from desktop Chrome, Edge or Safari." That's honest and specific.
- **Progress.** It showed "Rendering frame 9 / 120 · 1.8 fps · 1 min 02 s left", a live render thumbnail and a Cancel button. Cancel was verified later at 4K and reported "Export cancelled."
- **Result card.** File name, size, frames, codec and time, plus **Download again** and **Copy `<video>` tag**.
- **ffprobe** on `dl/A-type-in-motion-1920x1080-30fps.mp4`:
  - `av1` Main, 1920×1080, yuv420p, bt709 primaries, transfer and matrix tagged;
  - `30/1` fps, **120 frames** (count_frames), **4.000 s**, PTS 0 → 3.9667.
- **Fidelity.** The studio renderer's frame at t=2.0 vs MP4 frame 60 gave **PSNR 41.5 dB** (R 48.9 / G 47.4 / B 37.5). That's AV1 chroma loss on saturated blue, not a mismatch. Re-rendering the same time gives a **0-byte diff** (deterministic).
- **Motion.** Masked per-letter rise with stagger, hold, then a staggered exit back to an empty frame. The loop runs clean from empty to empty.
- **Friction.**
  - The file was named `type-in-motion…mp4` after the default project name, not my title.
  - The estimate said "≈ 2.2 MB" and the file was **162 KB**. The estimate is a bitrate ceiling, more than 10× off for flat graphics.

### B. Website hero → Embed → a page on a different port: **PASS (all routes)**
- **Embed & share dialog.** Tabs for Embed / Web component / HTML file / Links. Toggles for Autoplay, Loop, Controls, Transparent, and Fit (contain/cover). A live local preview. The scene code is only **145 B**.
- It states plainly: "Codes and links point to https://markdo27.github.io/typoman/, because this studio is running locally."
- "Copy code" put the exact textarea snippet on the clipboard (read back and compared).
- **Pasted into realistic hero pages served from `:8722`.** Every variant **animated** (element frame hashes changed over time) with **zero console errors**:
  1. iframe verbatim, pointing at GitHub Pages;
  2. iframe rewritten to `:8712`;
  3. `<typoman-player>` verbatim;
  4. `<typoman-player>` local;
  5. two players on one page;
  6. the downloaded **HTML file** (165 KB, "9 scripts inlined") over http;
  7. the same file opened from **`file://`**.
- The iframe posts `{typoman:'ready',duration:4}` to the parent, and `postMessage({typoman:'pause'})` paused it.
- It's responsive at 390 px (342×192), and a 360 px player instance also worked.

### C. Vertical 9:16 story with a custom path: **PASS, with craft flaws in the output**
- **Format menu.** Landscape, Story 9:16, Square, Portrait 4:5, Cinema 21:9, Banner 3:1 and Custom size. I switched to 1080×1920, typed "NEW DROP FRIDAY" and used Path Flow.
- **Edit path** shows a blue stage hint ("Editing path · drag points · double-click to add · Del removes · Esc to finish") and a floating toolbar (draw, point type, delete, open/close, Done).
- **Real mouse gestures, verified against the stored path:**

  | Gesture | Result |
  |---|---|
  | Drag anchor | (0.50, 0.58) → (0.66, 0.40); cursor turned to pointer on hover |
  | Drag out-handle | Changed; the smooth in-handle mirrored |
  | **Alt-drag handle** | Breaks it: `k` smooth → corner, in-handle unchanged. My first attempt failed because that handle sat **outside the artboard**, where it's drawn but can't be grabbed |
  | Double-click the curve | Inserted a point (3 → 4 nodes) |
  | Double-click a point | Toggles corner ↔ smooth |
  | Click + Delete | Removed a point (4 → 3) |
  | ⌘Z / ⇧⌘Z | Restored and redid; 5 distinct undo steps verified |
  | Arrow / Shift+Arrow | Nudges by 1 px / 10 px |
  | Marquee drag | Selected 11 of 20 heart points; Point fields show "11 points", X%/Y%, Corner/Smooth/Mirror, Delete |
  | **Freehand (D)** | A 40-sample S-stroke fitted to a clean 6-node bézier; toast "Path drawn · 6 points · drag to refine"; draw mode exits on release |
  | **Morph** | "Animate path" on (default B = Arc); picked **Heart** from the B library; frames 0/60/120 show A → heart → A |

- **Path panel.** A 22-shape library with aspect-correct thumbnails, plus:
  - Closed, Reverse, Flip H/V, Fit, Smooth, Corners, ±15°;
  - Transform as numeric Center X/Y, Width/Height %;
  - Morph controls: Edit A/B on canvas, Morph ease, Swap A↔B, B = copy of A.
- **Touch:** on the phone, Edit → Path → Edit points, then a touch-drag moved an anchor correctly.
- **Export.** `dl/C-story-drop-1080x1920-30fps.mp4` is AV1 **1080×1920**, 30 fps, **120 frames**, 4.000 s, 1.9 MB.
- **Craft flaws visible in that export:**
  - **Glyphs overprint at sharp concave cusps and mid-morph.** You can see "DROP/FRIDAY" piled on top of each other at the heart's top dip and bottom tip, and at the V of my freehand path (`frames/C/f0-f60.png`).
  - **Ghost letters pile up past open path ends.** Glyphs extrapolate along the end tangent while fading, so a hooked freehand end shows faded "FR" over "P".
  - On the library heart with no morph, cusps are mostly fine. Corner smoothing at 1.0 rotates letters round the dip but **doesn't prevent overlap** (`shots/C2-heart-compare.png`).

### D. Match a brand (custom font, brand colours, transparent export): **PASS for files, FAIL for embeds**
- **Font picker.** 50 curated fonts in 6 categories: Condensed / Grotesk / Display / Serif / Mono / Script. 22 are variable, shown with weight ranges such as "Roboto Flex VAR 100–1000".
- **Upload.** "Upload a font" (TTF·OTF·WOFF·WOFF2) took `fraunces-latin-600-normal.woff2` and toasted "Added … Share links can't carry custom fonts." The layer switched to it, but the family is named after the **file name** ("fraunces-latin-600-normal (custom)"), not the font's real name.
- **Colours.** I typed `#FF5A1F` into the picker's hex field and set Background → **None** (checkerboard). "Save as brand kit" stored the colours and font, and the kit shows as a swatch.
- **Transparent WebM.** `dl/D-orbital-brand-1920x1080-30fps-alpha.webm`:
  - the dialog said "VP9 + alpha · level 4.0 `vp09.00.40.08` … Safari doesn't support WebM alpha. For After Effects or Premiere, export a PNG sequence";
  - ffprobe: vp9, `alpha_mode=1`, 120 frames, 4.000 s, 1.5 MB;
  - decoded with libvpx to RGBA, frame 60 has 1.99 M fully transparent pixels, 52 K opaque and 27 K partial. That's real anti-aliased alpha, rendered in Fraunces.
- **PNG sequence ZIP.** `dl/D-orbital-brand-png-1280x720-30fps.zip` holds 120 RGBA PNGs with true alpha. It also has a **README** giving the frame rate and exact After Effects, Premiere and ffmpeg import steps. That's exactly what I need.
- **Embed problem.** The iframe preview in the Embed dialog rendered the title in **Anton**, not my uploaded font. The Embed and Web component tabs give **no warning**, so I'd have pasted the wrong brand font onto a client site.
- **HTML file does carry the font.** It's 184 KB, and `document.fonts` reports the custom face "loaded" with the correct render (`shots/D-08-standalone-custom-font.png`).

### E. Two animated text layers: **PASS, with one keyboard bug**
- **Adding a layer.** The **+** button adds a sensible lower-third layer ("NEW LAYER", anchor y = 0.78, half size).
- **Composition.** Layer 1 "SUMMER SALE" uses **Stack** and layer 2 "-50%" uses **Pop**, in yellow with a black outline at size 0.3. Dragging layer 2 on the artboard showed **centre snap guides** and snapped exactly to (0.5, 0.5), and arrow keys nudge it.
- **Keyboard.** `[` / `]` select layers, Ctrl+D duplicates (undoable), and clicking text on the artboard selects its layer. The layer list explains its keys ("Alt+arrows move · Enter renames · H hides · Delete removes").
- **Export.** `dl/E2-summer-sale-1280x720-30fps.mp4`: 120 frames, both layers composite correctly. Pop squashes in, holds, then crouches out over the flexing two-row stack.
- **Bug:** pressing **N** creates the new layer with the text **"n"**. The keystroke leaks into the auto-focused Content field, and it reproduces from a body focus (`scripts/11-nkey.mjs`).
- **Preset dud:** **Stack on a single word is static.** The accordion flexes rows against each other, so one word means no motion. The GIF exporter even reported "92 identical frames were merged".
- **GIF.** `dl/E-summer-sale-640x360.gif`: 640×360, 25 fps, 100 frames, 79 KB, 7 colours. Identical frames are merged, the timing is kept, and dither is optional.
- **Timing gap:** there is **no per-layer start offset or timeline**. All layers share one loop, and sequencing comes only from each preset's in/out/stagger, so I can't bring the subtitle in 1 s after the title.

### Extra checks
- **Phone (390×844, touch).**
  - A real app shell: top bar (undo, redo, remix, more, Export), canvas, transport, and a tabbed bottom sheet (Presets / Edit / Layers).
  - The Export dialog becomes a full-screen sheet with a sticky "Export MP4".
  - There's no horizontal overflow.
  - The tour copy still says "Hover a card…".
  - The stage bar (format, **Edit path**, guides, zoom) is hidden on phone. Path editing is still reachable via Edit → Path.
- **Robustness.**
  - **Zero app console errors or warnings** in about 15 sessions covering every flow.
  - Empty text shows a friendly empty state with a "Type text" button.
  - Emoji and accented capitals render.
  - 400 characters is clamped and shrinks to one unreadable line, because there's no auto-wrap.
  - Banner 3:1 and Custom size both work.
  - A hostile scene in the embed URL was neutralised. It had a `<img onerror>` name, a 99999×-5 size, a 1e9 s duration, a CSS-injection font, preset `__proto__`, `javascript:` colours and NaN nodes. The result was clamped to 4096×64 and 60 s, Anton was whitelisted, path-flow was used, and no alert fired.
  - Garbage embed code shows "This animation couldn't be loaded. The embed code or link looks incomplete or damaged."
  - Autosave survives a reload.
- **The app's own `tests/smoke.mjs` passes.** All 17 presets are deterministic with seams OK, at 4.7–8.4 ms per 1080p frame headless. The sanitiser fuzz and the encode/decode round trip pass too. My own check found frame 0 equal to frame(duration) for all 17 presets.

---

## Criteria

### MC: Motion Craft, **7**
**Evidence.**
- 17 presets, all verified seamless.
- A full timing group: In→Hold→Out / In→Hold / Always on, In and Out length, Stagger, and Order (first→last, last→first, centre out, edges in, random, by word, by line).
- Ease in and out with a curve editor, plus Morph ease.
- Pop has real anticipation and squash/stretch ("bounce and settle, then crouch and spring away").
- Rise is a clean masked stagger, and Wave animates the variable weight.
- Weak spots: Stack is static on one word; Lens's text is tiny and hard to read; path motion collides at cusps.

**Up one band (→ 8):**
- Make every preset robust to one-word input.
- Add per-layer start, duration and offset.
- Add overshoot and settle amount controls on the reveal family.
- Make path motion collision-free at corners.

### TQ: Typographic Quality, **7.5**
**Evidence.**
- 50 curated fonts with 22 variable; weight is a slider for variable fonts and buttons for fixed weights. Wave animates the weight axis.
- Size, tracking, leading, slant, align, case (Aa/AA/aa/Ab) and multi-line.
- Outline and fill+line; solid, gradient and palette fills.
- Kerning comes from cumulative `measureText` layout, and Stack draws rows as whole runs.
- Custom TTF/OTF/WOFF/WOFF2 upload renders in every file export.
- Against that:
  - there's no text box or auto-wrap (long copy shrinks to an unreadable line);
  - custom fonts are labelled by file name;
  - glyphs overprint at path cusps;
  - there are no OpenType features (ligatures, stylistic sets) and no width or slant axis animation.

**Up one band (→ 8):**
- A width-constrained text box with auto-wrap and balance.
- Read the real family name and weights from the font's `name`/`OS/2` tables.
- Collision-aware glyph spacing on paths.
- Expose more variable axes (wdth, slnt, opsz).

### PC: Path Control, **8**
**Evidence.** All of these were verified with real gestures:
- anchors and handles, mirrored smooth handles, Alt-break, double-click insert and toggle, Delete, nudge, marquee multi-select, snapping (claimed in the code, and seen for layers);
- open and closed paths;
- freehand with proper curve fitting and auto-close;
- a 22-shape library;
- numeric point and transform fields;
- A↔B morph with a canvas-editable target;
- per-gesture undo;
- touch editing on phone.

That covers essentially every item in the band-9 checklist. It falls short of 9 because "path-aware motion looks great" isn't true at sharp corners or mid-morph (overprinted glyphs in my exported story), because of the ghost stacks at open ends, and because anchors and handles outside the artboard can't be grabbed.

**Up one band (→ 9):**
- Fix cusp and morph glyph collisions (curvature-aware advance and auto-rounded sampling), with an end-of-path mode of fade / clip / continue.
- A pasteboard so off-frame points are editable.
- A click-to-place pen tool.
- Multi-keyframe path animation (A→B→C at chosen times) instead of A→B→A once per loop.

### CR: Creative Range & Originality, **7**
**Evidence.**
- 17 presets in five families. Some are genuinely fresh: Stack accordion, Tunnel, Lens, Orbit rings, Draw On, path morph. Others are template-pack staples: Typewriter, Decode, Split Flap, Glitch, Pop, Rise, Flip, Cylinder.
- An FX stack (echo trails, motion blur, glow, shadow, 3D extrude, grain, vignette), 14 palettes plus a brand kit, and up to 6 layers that combine.
- **Remix**, with a "what it keeps" menu, gave three distinct looks, one of them weak.

**Up one band (→ 8):**
- Multi-layer **templates** (intro, lower third, story CTA, hero) to stumble into greatness.
- More signature, non-template motions, such as kinetic type systems that react to each other across layers.
- Seeded variations per preset.

### EE: Export & Embed, **8.5**
**Evidence.**
- Offline, frame-accurate MP4 with exact frame counts and durations in three ffprobe checks (16:9 1080p, 9:16 1080×1920, 720p). Codec negotiation is explained in plain language.
- VP9 WebM with **real alpha**.
- GIF with palette, frame merging and dither; a PNG still at the playhead; a PNG-sequence ZIP with alpha and an AE/Premiere/ffmpeg README.
- Resolution 720p–4K for any aspect, 24–60 fps, loops or seconds, quality tiers, matte colour.
- Progress with fps and ETA, a live render preview, and a working Cancel.
- Iframe, web component and self-contained HTML (even from `file://`) all verified cross-origin, plus a postMessage API, reduced-motion still and an off-screen pause.
- Deterministic, preview-matching frames (PSNR 41.5 dB is codec loss only).

Held back by:
- **custom fonts silently replaced by Anton in iframe and web-component embeds**, with no warning in the Embed dialog;
- default filenames taken from the project name;
- a size estimate more than 10× off;
- H.264 isn't verifiable in this container (well communicated, not penalised).

**Up one band (→ 9):**
- Carry custom fonts into embeds (a hosted-font URL or inlined data), or block and explain.
- A wasm H.264 fallback for browsers without a WebCodecs H.264 encoder.
- Deliverable presets (YouTube 1080p30, IG Story 1080×1920, a hero WebM + MP4 + poster bundle) with smart filenames.
- An accurate size estimate.

### UX: Studio UX & Visual Design, **8**
**Evidence.**
- A premium, coherent dark pro-tool layout: layers and presets, artboard with format/zoom/guides/safe areas, numbered inspector sections, and a timeline with IN/HOLD/OUT bands.
- Live previews of my text on preset cards.
- A gentle 3-step tour, a "?" shortcut sheet, tooltips with key hints, undo/redo, autosave with a status and persistence, toasts.
- Contextual path-editing hints, snap guides, and good empty and error states.
- Accessible native dialogs with focus trap and ARIA roles and labels, plus a skip link.
- A genuinely usable phone shell, including touch path editing.

Flaws:
- the **N-key "n" bug**;
- the phone tour says "hover";
- Edit path is hidden on the phone stage bar;
- no custom-font warning at the moment it matters (Embed);
- the default project name leaks into filenames;
- some low-contrast secondary labels.

**Up one band (→ 9):**
- Fix the shortcut leak and the phone copy, and expose Edit path on phone.
- A visible per-layer timeline.
- Inline warnings in Embed and Export when a choice will degrade the output.
- An accessibility pass on contrast.

### PR: Performance & Robustness, **8**
**Evidence.**
- Zero app console errors or warnings across all flows.
- Deterministic renders.
- The smoke suite passes on all 17 presets at ≤8.4 ms per 1080p frame headless.
- Empty, emoji, accent, very long text, 3:1 and custom sizes, and hostile or damaged scenes are all handled gracefully.
- Fallbacks are feature-detected: codec negotiation, a MediaRecorder path, a "no VP9" route to PNG seq, a clipboard fallback, reduced motion, and pausing when off-screen or hidden.

Not verifiable here: 60 fps at 1080p on real laptop hardware (headless rAF was 27 fps in software). Long copy degrades to an unreadable line rather than wrapping.

**Up one band (→ 9):**
- Show 60 fps 1080p preview on a mid laptop with an adaptive preview resolution and an on-screen perf meter.
- Wrap long text instead of shrinking it.
- Collision-free path layouts.

### EQ: Engineering Quality, **7.5**
**Evidence.**
- A clean engine / presets / export / studio split, with one `boot.js` manifest shared by the studio, iframe player, web component and standalone exporter.
- `docs/ENGINE.md` documents the scene schema and preset contract (determinism, integer-cycle loops, resolution independence, kerning, sanitising at boundaries).
- Pure path-editing helpers, one file per preset, pinned vendored muxers.
- Smoke tests plus a CI workflow, and a sanitiser that held up under my hostile input.

Against that:
- `labs/` ships ≈160 KB of old experiments (dead code in the deploy);
- **two modal systems** (`UI.modal` in ui.js and `Studio.modal` in export-dialog.js);
- team-ownership workarounds such as dialogs injecting their own CSS because "index.html is not ours to edit";
- several large files (path.js 1.3 k lines, app.js 590, renderer 610).

**Up one band (→ 8):**
- Remove or move `labs/`.
- Unify the modal and CSS loading.
- Split `path.js` (sampling, editing, fitting, presets, morph).
- Add tests for the studio interactions (path editor gestures, shortcuts).

---

## The 8 highest-impact improvements for next round (working-designer view, ranked)

1. **A per-layer timeline.** Give each layer a start offset, duration and in/out bars, and add "play once and hold" for intros at clip lengths independent of the loop. Today every layer starts together in one shared loop, so title-then-subtitle sequencing, the bread and butter of intros and lower thirds, is impossible.
2. **Make text-on-path clean at corners and ends.**
   - Fix glyph overprint at concave cusps and during morphs (curvature-aware advance and auto-rounded sampling, or a "space out at corners" control).
   - Add an end-of-path behaviour (fade / clip / continue) to stop ghost stacks.

   These flaws were visible in my exported story.
3. **Custom fonts in embeds.**
   - The iframe and `<typoman-player>` silently fall back to Anton. Warn in the Embed dialog and offer a hosted-font URL or inlined data (the HTML file already does this).
   - Name uploaded fonts by their real family and weight.
4. **Off-artboard editing and a pen tool.**
   - A pasteboard so anchors and handles beyond the frame are grabbable (fly-ins start off-screen).
   - A click-to-place pen tool alongside freehand and double-click insert.
   - Multi-keyframe path animation (not just A→B→A once per loop).
5. **Deliverable presets and naming.**
   - One-click YouTube 1080p30, IG/TikTok 1080×1920, and a web hero "WebM + MP4 + poster + `<video>` snippet" bundle.
   - Filenames from the text or a project-name prompt.
   - An accurate size estimate (it said ≈2.2 MB for 162 KB).
   - A wasm H.264 fallback where WebCodecs lacks H.264, because AV1 MP4s don't open in QuickTime or Premiere.
6. **Keyboard and phone polish.**
   - Fix **N** creating a layer named "n".
   - Phone tour copy ("tap", not "hover").
   - Show Edit path and format on the phone stage bar.
   - Larger hit areas for path knobs on touch.
7. **A text box with auto-wrap and balance, plus one-word robustness.** Long copy currently shrinks to an unreadable line, and Stack is static on a single word. Stack, the signature preset, should still move with one word, for example by splitting it or animating the single row.
8. **Templates and scene starters.** Multi-layer templates (intro title plus subtitle, lower third, story CTA with safe areas, hero headline plus kicker), so a designer starts from a near-finished composition instead of one layer and a preset.
