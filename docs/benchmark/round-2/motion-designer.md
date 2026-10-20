# TYPOMAN Round 2: Working Motion Designer (end user)

**Judge lens:** a freelancer shipping YouTube intros, website heroes and Instagram/TikTok stories every week. I weight **PC, EE and UX** most, and score all eight criteria against the rubric's absolute anchors.

**Snapshot:** commit `3b93646`, served at `http://localhost:8620/`. The cross-origin test pages were served from `:8630`.

**Method:** I drove the real UI with Playwright Chromium on fresh profiles at 1440×900/1000, plus 390×844 @2× with touch for the phone pass. That meant:
- real mouse clicks and drags on the canvas, timeline lanes, sliders and curve handles;
- the keyboard, the file chooser and the clipboard;
- CDP touch events on the phone.

I looked at every screenshot. Every exported file was checked with `ffprobe`, and I extracted and inspected frames. I used engine calls (`TM.Renderer`) only for comparisons and parameter sweeps, and I say so where I did.

**Evidence:** `work/motion-designer/` holds the following.
- `scripts/`: 41 runnable scripts plus 4 helper modules.
- `shots/`: screenshots.
- `dl/`: exported MP4/WebM/GIF/PNG/ZIP/project files.
- `frames/`: extracted and compared frames, plus look sheets.
- `embedtest/`: the cross-origin hero pages and HTML downloads.
- `fonts/`: the "brand" fonts I uploaded.
- `json/`: raw results.
- `smoke-test.log`: the app's own suite.

**Container caveats (not penalised):** there's no H.264 encoder here, so MP4 = AV1. Rendering is software-only, so I didn't judge preview fps by wall clock.

---

## Scores

| MC | TQ | PC | CR | EE | UX | PR | EQ | **Overall** |
|---|---|---|---|---|---|---|---|---|
| 7.5 | 7.5 | 8.5 | 7.5\* | 8.5 | 8 | 7.5 | 7.5\* | **8.0** (mean 7.81) |

\* provisional: lighter evidence through my lens (see the criterion sections).

```json
{"MC":7.5,"TQ":7.5,"PC":8.5,"CR":7.5,"EE":8.5,"UX":8,"PR":7.5,"EQ":7.5}
```

**One-line verdict:** Round 2 delivered the three things I begged for in Round 1:
- **per-layer timing** (title → subtitle, once and hold);
- a **pen tool with off-frame points**;
- **multi-key path animation**.

All five deliverables shipped end to end, and every embed route is pixel-identical to the studio. What still stops me billing AE-level work from it:
- text on sharp path corners still collides or splits words;
- a font regression silently ships two curated looks in a fallback sans;
- Remix can wipe a hand-drawn path;
- a handful of visible polish bugs, such as "null" in tooltips.

---

## Bugs found (most severe first)

1. **Text on paths: letters still collide at sharp corners and mid-morph, and the remedy splits words.** *Severity: high (craft; visible in my exported story and in the default scene).*
   - **Repro.** Story 1080×1920, Path Flow on a keyframed path (A = pen zigzag, B = library Zigzag, C = S-curve), Cycle mode, default *Bend spacing* 1.0. Export, then look at:
     - frame 40 (key B): "A" and "Y" of FRIDAY overprint at the V;
     - frame 20 (A→B mid-morph): R, I and D pile up ("FRL)AY").
   - **At Bend spacing 1.5 (max).** Most overlaps go, but words fall apart ("DRO  P F  R  IDAY"), and the I still leans into the D.
   - **The default scene too.** The very first screen, Path Flow on the wave, reads **"TY PE IN M OTION"**: bend spacing removes R1's collisions there but opens holes inside words. The same happens on any text ("LAUNC H", "DOL OR SIT").
   - **Where.** `path.spaced(L.capH * 0.5 * P.bendSpacing)` at `js/presets/path-flow.js:56` adds arc length proportional to turning, not to actual glyph overlap. The control's hint promises "letters never collide".
   - **Evidence.** `frames/3/f040-crop.png`, `f020-crop.png`, `frames/3/sweep/keyB-sweep.png`, `mid-sweep.png`, `frames/6/default-gaps-compare.png`, `shots/37-edge-grid.png`.
2. **Big Shoulders Display never loads, so two curated looks render in a fallback sans (regression in R2).** *Severity: high (typography; silent).*
   - **Cause.** R2 added `{ opsz: [10, 72] }` to the catalogue entry (`js/engine/fonts.js:31`; R1's entry had no axes). The css2 request `Big+Shoulders+Display:opsz,wght@10..72,100..900` returns **HTTP 400** (I curl'd it; the other 11 axis families return 200).
   - **Effect.** No FontFace is ever registered. The console logs CORS/`ERR_FAILED` errors and `[TM.fonts] could not load stylesheet` warnings.
   - **Repro.** Inspiration → **Paper Column** (`js/presets/cylinder.js:34`) renders in an Arial-like face while the inspector still says "Big Shoulders Display · Condensed · Variable" (`shots/23-paper-column.png` vs `23-bigshoulders-reference.png`).
   - **Scope.** Outline Draw → **Blueprint** (`js/presets/outline-draw.js:26`) and any Remix that rolls this font (`REMIX_FONTS`, `js/studio/app.js:65`) are affected too. My sweep of all 82 looks: **80 load their font and these 2 don't** (`json/30-looks.json`).
3. **Remix (and applying a look) silently replaces a hand-drawn path.** *Severity: medium-high (destroys work; recoverable only by undo).*
   - **Repro.** Draw On, then a pen path (4 points). Remix menu → keep *Current preset*. Press **R**. The second press landed on the look "Blueprint" and the path became a **circle**; every later press rerolled the path (zigzag, frame, arc, spiral…).
   - **Cause.** The look branch (`js/studio/app.js:101,117`) calls `TM.Scene.applyLook`, which overwrites `l.path` whenever a look names one (`js/engine/scene.js:411-412`). The non-look branch respects custom paths.
   - **Missing safeguards.** There's no "Path" lock, and the toast doesn't mention the lost path (`json/24-remix-path.json`).
4. **The Embed dialog's HTML-file tab tells brand-font users the opposite of the truth.** *Severity: medium (misleading at the moment of decision).*
   - **Repro.** Upload a font, open Embed & share → *HTML file*. The amber note says the font "can't travel in a link or embed code. Viewers will see Anton instead. Pick a catalogue font, or export a video", and the preview renders Anton.
   - **But** the downloaded file inlines the TTF (`data:font/ttf;base64`) and renders the brand font over http and from `file://`.
   - **Where.** One note is appended for all tabs (`js/studio/share-dialog.js:168-171`).
5. **Play-once embeds end under a big play button even with controls off.** *Severity: medium (for heroes that should play once and hold).*
   - **Repro.** `embed.html#c=…&autoplay=1&loop=0&controls=0`. At 4 s the player posts `ended` and holds the last frame correctly, but a 72 px play button sits on the headline (`shots/31-loop0-end.png`).
   - **Cause.** `this._big.hidden = !this._ready || this._playing` (`player.js:417`) ignores `controls`.
6. **Every tooltip without a shortcut ends in a literal "null".** *Severity: medium (polish; on roughly half the studio's tooltips).*
   - **Repro.** Hover Embed, Artboard format, Zoom, the loop chip, the Project menu, or any timeline lane, cycles select or once/loop toggle. You get "Embed on the web or share a remix link **null**" (`shots/18-tip-embed-null.png`, `json/18-null-tip.json`).
   - **Cause.** `tip.el.replaceChildren(h('span', null, text), kbd ? h('kbd', null, kbd) : null)` (`js/studio/ui.js:373`). DOM `replaceChildren` stringifies `null`.
   - **History.** The same line was present at R1 (`ui.js:371`), unreported.
7. **Stack is still static on a single word.** *Severity: medium (carried over from R1).* The look "Flex accordion" with NIGHTSHIFT: 0 of 7 sampled frames differ from t = 0, with both *Width axis + tracking* and *Stretch* (`frames/6/stack-axis-row.png`). Stack is the second preset card, and single words are the most common title.
8. **The floating path toolbar overflows narrow artboards.** *Severity: low-medium.* In Story 9:16 at 1440×900, the pen hint is clipped to "Click the fi…" and **Done** to "Don"; with the A/B/C key switcher it overflows again (`shots/11-pen-before-finish.png`, `14-key-B.png`).
9. **Phone gaps.** *Severity: low-medium (two carried over from R1).*
   - The first-run tour still says "**Hover** a card to preview it, click to apply" on touch (`js/studio/onboarding.js:72`).
   - The timeline lanes are hidden on phones by design (`css/studio.css:727`), so a phone user gets numbers in Edit → Layer timing but never *sees* when layers play, and the Layers tab is mostly empty space.
   - Edit path and format are still absent from the phone stage bar. They're reachable via Edit → Path, which works well.
10. **The stage-bar hint collides with toasts and ignores the pen.** *Severity: low.*
    - Switching format while path editing drops the "Format: Story 9:16" toast on top of the blue "Editing path…" hint, which truncates.
    - With the pen active, the hint still reads "drag points · double-click to add · Del removes" (`shots/10-edit-path-on.png`).
11. **Uploaded fonts are named after the file.** *Severity: low (carried over).* `Caladea-Bold.ttf` becomes "Caladea-Bold (custom)" at weight 400, not "Caladea" Bold from the `name`/`OS/2` tables (`js/engine/fonts.js:347-355`).
12. **Cosmetics.**
    - The off-frame anchors show no hover cursor (the hit element is `.stage-inner`).
    - The Anton "N" in the timeline lane chip renders as a solid bar (`shots/38-lane-chips-2x.png`).
    - 1080p video is tagged `smpte170m` (BT.601) rather than BT.709. It's consistent with the encode, but HD NLEs that assume 709 may shift colours.

---

## Scenario outcomes

### 1. YouTube intro title (16:9, 1080p, ~4 s): **PASS**
- **First run.** Boot ≈1.5 s, zero console errors. The 3-step coach tour steps cleanly (`shots/01-firstrun-tour*.png`). The default scene still opens as Path Flow in Anton on Klein blue.
- **Pick a look.** I typed NIGHTSHIFT, opened **Inspiration (82)**, typed "chrome" into *Search looks* and clicked **Hot Chrome** (Assemble · Unbounded 800, cream→orange gradient, dark extrude, #120403 ground). Every look card renders *my* word in the look's font and palette (`shots/02-inspiration-view.png`, `03-applied-hot-chrome.png`). The undo label reads "Look: Hot Chrome".
- **Tweak motion and easing.**
  - Order → Center out, and In length 0.50 → 0.42 (typed).
  - **Ease in** opened a real curve editor: draggable bézier handles that are also ARIA sliders, numeric x1/y1/x2/y2, curve families (Signature / Physics / Out / In / In-out / Basic) and a preview dot. Dragging the end handle stored the custom curve `[0.2, 1.25, 0.26, 1.5]` (`shots/04-curve-editor-dragged.png`).
  - The loop chip "4s 60 fps" jumps to *Scene → Loop length*.
- **Export MP4.** The dialog (`shots/05-export-mp4-1080-30.png`) offers MP4/WebM/GIF/PNG/PNG seq, 720p–4K, 24–60 fps, loops/seconds, Draft→Max and transparency. The amber box says plainly that *"This browser can't encode H.264, so this MP4 uses AV1 … QuickTime, older Safari and many editors can't open it."* 1080p30 rendered **in 3 s** (R1: ≈1–2 fps).
  - `dl/1-intro-nightshift-intro-1920x1080-30fps.mp4`: **av1** Main, 1920×1080, yuv420p, 30/1, **120 frames**, **4.000 s**, PTS 0 → 3.9667, 341 KB. It's fast-start (`ftyp, moov, mdat`).
  - File names now follow the project name ("Nightshift intro" → `nightshift-intro-…`). The size estimate is an honest upper bound: "up to 2.2 MB … kinetic type usually compresses far smaller".
- **Export WebM.** `dl/1-intro-…-30fps.webm`: **vp9** Profile 0, 1920×1080, 30/1, 120 frames, 4.000 s, 662 KB, done in 3 s.
- **Fidelity.** MP4 frame 60 vs the exported PNG at the same pose: **43.4 dB** PSNR (WebM 43.7 dB). Background #120403 decodes to (17,4,1).
- **Motion** (`frames/1/webm-contact.png`): letters fly in from depth, centre out, on a snappy spring; hold; anticipation crouch, then explode to an empty frame. The loop is clean.

### 2. Website hero (iframe, `<typoman-player>`, HTML download, cross-origin): **PASS (all routes)**
- **Build.** "MAKE IT MOVE" with **Variable surge** (Wave on Roboto Flex, weight 100→1000 through the word). The inspector shows **Width** and **Optical size Auto/Fixed** for Roboto Flex (`shots/07-hero-studio.png`).
- **Embed & share** (`shots/07-embed-tab.png`):
  - tabs Embed / Web component / HTML file / Links;
  - Autoplay, Loop, Controls, Transparent, Fit;
  - a live preview and a 253 B scene code.

  *Copy code* put the exact snippet on the clipboard. *Download HTML* → `hero-make-it-move.html`, 193 KB, "10 scripts inlined".
- **Cross-origin test pages** on `:8630` (a realistic agency hero; `embedtest/`), each at 1440×900 and 390×844 @2×:

  | Route | Plays (distinct frames of 6) | Loops (`currentTime` wraps) | Box ratio | Canvas @2× | Console |
  |---|---|---|---|---|---|
  | iframe → local snapshot | 6 / 6 | yes | 1.7778 | 715×402 | clean |
  | `<typoman-player>` → local | 6 / 6 | yes | 1.7778 | 715×402 | clean |
  | HTML file over http | 6 / 6 | yes | full window, contain | 780×439 | clean |
  | HTML file from `file://` | 6 / 6 | yes | same | same | clean |
  | iframe + `bg=transparent` | 5–6 / 6 | yes | 1.7778 | 715×402 | clean |
  | two players (transparent + 360² cover) | 6 / 6 | yes | 1.7778 | 715×402 | clean |
  | iframe verbatim (GitHub Pages) | 6 / 6 | yes | 1.7778 | 715×402 | clean |
  | `<typoman-player>` verbatim (GitHub Pages) | 6 / 6 | yes | 1.7778 | 715×402 | clean |

- **Messaging.** The iframe posts `{typoman:'ready',duration:4}`. With `loop=0` it posts `ended`, pauses at t = 4 and holds the final frame, but under a big play button (bug 5).
- **Fidelity across routes.** Paused at t = 1.0 s, the iframe, web component and standalone canvases are **bit-identical** to `TM.Renderer` in the studio at 1068×601 (0 differing pixels, `frames/2/`). That covers the Roboto Flex variable instance and the pinned optical size. The same check on the title + subtitle scene at 0.5 / 1.6 / 3.5 s also came out identical, so the embeds honour per-layer delay and once-and-hold.

### 3. 9:16 Instagram story on a pen-drawn path with keyframes: **PASS for the workflow; craft flaws at sharp bends**
- **Setup.** NEW DROP FRIDAY, Format → **Story 1080 × 1920**, Path Flow, **Edit path** (P). The floating toolbar offers Edit points / **Pen** / Freehand / corner↔smooth / delete / close / **Show all** / Done.
- **Pen, with real mouse input** (`scripts/11-story-pen.mjs`, `shots/11-*.png`):
  1. a click at **(−0.40, 0.20)** on the pasteboard, *outside the artboard*;
  2. a click-drag → smooth node with **mirrored** handles;
  3. a click → a **sharp V corner**;
  4. a click-drag;
  5. a click at **(1.40, 0.86)** off-frame right.

  A rubber band previews each segment. **Enter** commits one undo step, "Pen path". The stored nodes match the clicks, so the text enters from beyond the left edge.
- **Off-frame editing (an R1 gap, fixed).**
  - An off-frame anchor dragged fine (y 0.20 → 0.14).
  - An **off-frame handle** at x = 1.25 dragged from (0.45, 0.05) to (0.50, 0.17), with its mirror following.
  - Double-click on the curve inserted a point (3 → 4).
- **Path keyframes** (`scripts/14-story-keys.mjs`, `shots/14-*.png`). *Animate path* → B. I picked **Zigzag** for B from the 22-shape library, then dragged B's first point on canvas to x = −0.35 (the card relabels itself "Custom"). *Add key* added C, which I set to **S-curve**. Then **Cycle**, with per-step eases A→B **Overshoot**, B→C **Snap** and C→A **Glide** (stored `eases:['snap','glide']`).
  - The cards read "A Main path at 0% · B Custom at 33% · C S-curve at 67%" with the summary "Each loop: A → B → C → A".
  - Clicking a card parks the playhead on that key. The canvas shows the other keys as labelled dashed ghosts, and *Swap with A*, *Move key* and *Remove* work. It's a real keyframe workflow.
  - **Limit:** key times are fixed equal shares of the loop. I can't put B at 20% and C at 80%, and keys don't appear on the timeline.
- **Export.** WebM VP9 1080×1920, 120 frames, 4.000 s, 1.4 MB; MP4 (AV1) also 120 frames and 4.000 s (`dl/3-story-*`).
- **Spacing through sharp bends: only partly holds** (bug 1).
  - Key A (my pen V) is clean, and so is key C. Open path ends now **fade** instead of R1's ghost pile-ups.
  - Key B (zigzag) overprints "AY".
  - Mid-morph piles up "RID".
  - Pushing Bend spacing to max breaks the words apart.

### 4. Title + subtitle with timeline lanes: **PASS** (R1's #1 request, delivered)
- **Layers.** Title "NIGHTSHIFT" uses Rise (*In → Hold*). I pressed **N** on the artboard and got "NEW LAYER" (R1's "n" bug is fixed). I typed "EPISODE 12 · THE LATE CREW" and picked Typewriter (*In → Hold*).
- **Lanes, by mouse and keyboard** (`shots/17-lanes-set.png`, `17-timeline-closeup.png`).
  - **Drag.** Dragging the subtitle lane 100 px gave a delay of exactly **1.000 s** (it snaps to frames and magnets).
  - **Keys.** ←/→ nudge one frame.
  - **Toggles.** I set **once & hold** on both layers and **×2** cycles on the subtitle (a 2 s pass).
  - **Display.** The lane shows wait → pass (with In/Hold ticks) → a hatched HOLD. The Layers list says "+1s · ×2 · once". ARIA reads "Starts at 1.00 seconds, 2 cycles, plays once then holds". All of it is undoable with specific labels.
- **Export.** `dl/4-title-and-subtitle-1920x1080-30fps.webm` has 120 frames and 4.000 s. A GIF came out at 640×360 @25, 4.000 s and 84 colours. Frames (`frames/4/grid.png`):
  - title rising at 0.5 s;
  - subtitle typing from 1.0 s ("EPIS" at 1.2 s), complete at ≈2 s;
  - both holding to the end.
- **Gotchas.**
  - A delay is not an in-point, so the Typewriter caret blinks during the 0–1 s wait.
  - There's no per-layer duration or out-point: a pass is always loop ÷ cycles.

### 5. Brand font, transparent export: **PASS for files; the embed warning exists but misleads on one tab**
- **Upload.** Font picker → *Upload a font* → the file chooser → `Caladea-Bold.ttf` (from `/usr/share/fonts`). The toast says "Share links can't carry custom fonts." The family is named **"Caladea-Bold (custom)"** after the file (bug 11).
- **Brand settings.** I typed `#FF5A1F` into the fill hex field and set Background → None.
- **Transparent WebM.** `dl/5-…-1920x1080-30fps-alpha.webm`: vp9, `alpha_mode=1`, 120 frames, 4.000 s. Decoded with libvpx, frame 60 has 2.0 M transparent, 48 K opaque and 18 K anti-aliased pixels in brand orange, **in Caladea** (`frames/5/alpha-f60-on-grey-full.png`).
- **PNG sequence ZIP.** 120 RGBA PNGs plus a README with AE/Premiere/ffmpeg steps (took 29 s at 720p).
- **Embed warning (R1 bug: fixed).** The Embed, Web component and Links tabs show an amber note that the uploaded font can't travel and viewers will see Anton, and the preview renders Anton. The *HTML file* tab repeats it, though that file **does** carry the font (bug 4).
- **Project file hand-off.** *Save project file* → `acme-handoff.typoman.json` (113 KB, the TTF embedded). Reloading restores scene and font through autosave. A **fresh browser** opening the file via *Open project file…* renders Caladea ("Opened "Acme handoff"", `shots/32-colleague-opened.png`). That's exactly what an agency hand-off needs.

### 6. Inspiration, looks, Remix, undo/redo, shortcuts, width/opsz, phone: **mostly PASS**
- **Inspiration and looks.** **82 looks** across 27 presets, filterable (Path 24, Kinetic 10, Reveal 24, Glitch 6, Dimensional 12, Generative 6) and searchable. The cards preview on hover and render my text.
  - I rendered all 82 looks with "NIGHTSHIFT" (`frames/looks-sheet-1.png`, `-2.png`). The range is genuinely broad and art-directed: Bauhaus grids, kaleidoscopes, melts, badges, tunnels, terminal and typewriter looks, focus pulls, blinds, zoom-throughs.
  - 80 of 82 load their font; the 2 Big Shoulders looks don't (bug 2).
  - Path Flow and Rise, the first two cards and the default scene, have no looks.
- **Remix with locks** (`json/22-remix.json`).
  - **Colours lock:** fill #ff5a1f and bg #0015ff survived 6 remixes, including curated looks ("Blueprint", "Paper Cards").
  - **Preset + Font lock:** Tunnel and Tilt Warp survived 6 remixes while palettes, paths and looks rolled.
  - Toasts say what was kept ("Remixed: Rise · Tilt Warp · kept colours", with Undo). **12 × Ctrl+Z** returned exactly to the start.
  - But Remix can wipe a custom path (bug 3).
- **Shortcuts** (`json/25-shortcuts.json`). The **?** sheet lists Playback / Edit / View / Output. These all worked from the artboard: Space, ←/→, P, Esc, G, F, N, [ ], Ctrl+D, Ctrl+Z, Ctrl+Shift+Z, / and Ctrl+E. H and Delete work in the Layers list, as its hint says.
- **Width and optical size on Roboto Flex** (`shots/26-axes-compare.png`).
  - **Width:** dragging the slider gave wdth 39, and typing 50 gave clearly condensed letterforms.
  - **Optical size:** *Fixed* 8 draws visibly sturdier, wider shapes than 144. *Auto* at this size is pixel-identical to 144, consistent with pinning to the scene size.
  - **Stack's** *Width axis + tracking* fill keeps the letterforms true.
- **Phone, 390×844 with touch** (`shots/28-*`, `29-*`).
  - It's an app shell: canvas, transport, and tabs for Presets / Edit / Layers. Nothing overflows horizontally.
  - The Inspiration grid works by tap.
  - **The pen works by touch:** taps make corners, a touch-drag makes a mirrored smooth node, *Finish* commits, and a touch-drag moves an anchor.
  - Layer timing is in Edit.
  - The Export dialog becomes a full-screen sheet with a sticky button.
  - Gaps: the tour still says "hover", there are no lanes, and Edit path is missing from the stage bar (bug 9).
- **Robustness spot-checks** (`json/37-edge.json`). Zero console errors for:
  - empty text (friendly empty state with a *Type text* button);
  - emoji;
  - accents;
  - **Arabic** (joined, so R1's RTL fix holds);
  - 400 characters;
  - multi-line text;
  - Banner 3:1.

  All 218 visible UI text elements meet WCAG AA contrast, the worst at 5.31:1 (`json/35-contrast.json`).

---

## Criteria

### MC: Motion Craft, **7.5** (partly provisional: 7 presets reviewed in motion, 82 looks as stills)
**Evidence.**
- **Per-layer timing exists now:** delay by drag or keys, cycles ×1–8, once and hold, plus phase-edge retiming on the selected lane.
- **Easing:**
  - every reveal-family preset has In/Out length, Stagger, Order (7 options) and Ease in/out;
  - the curve editor offers 37 named curves plus custom béziers;
  - path keyframes take a per-step ease.
- **Smoke suite:** all 29 presets deterministic with clean seams.
- **Presets I reviewed in motion:**
  - Assemble has real anticipation, a spring settle and an explode exit.
  - Rise is a clean masked stagger.
  - Typewriter has human rhythm.
  - Fly In now reads forwards in flight (R1 priority 4 fixed: "T → FT → SHIFT → IGHTSHIFT" along the path, `frames/6/flyin-grid.png`).
  - Wave surges the weight axis.
- **Weak spots:**
  - Stack doesn't move on one word;
  - glyph pile-ups mid-morph;
  - letters clump briefly as Fly In lands and exits;
  - a layer's first frame (e.g. a caret) shows during its delay.

**Change since R1 (7):** +0.5. The biggest timing gap, per-layer sequencing, is closed. The reveal family gained real controls, and Fly In was fixed.

**Up one band (→ 8):**
- Make every preset move on a single word (Stack!).
- Collision-free path morphs.
- A per-layer **duration / out-point** (not just loop ÷ cycles), plus an "invisible before start" option.
- Overshoot and settle amount controls on the reveal family.

### TQ: Typographic Quality, **7.5**
**Evidence.**
- **Axes:**
  - variable **width and optical size** are real and verified visually;
  - opsz is pinned to the scene size, so the studio, iframe, web component and standalone are bit-identical;
  - Stack fills with width axis + tracking, with Stretch as an explicit option;
  - Wave animates weight.
- **Fonts:**
  - clean rendering of Unbounded, Roboto Flex and Caladea;
  - custom fonts work in every file export, the HTML download and the project file;
  - Arabic is joined, and multi-line ink heights are correct (smoke: 75 / 75 px).
- **Against that:**
  - **Big Shoulders Display is broken**, so two curated looks ship in a fallback face while the UI claims otherwise;
  - text on curves gets **holes inside words** at every bend in the default scene ("TY PE IN M OTION");
  - collisions persist at sharp corners;
  - uploaded fonts are named by file and weight;
  - there's still no OpenType feature control or text box with auto-wrap (I didn't re-test wrap this round).

**Change since R1 (7.5):** ±0. The axes are a genuine step up, but they're offset by the Big Shoulders regression and the new word-gap artefact.

**Up one band (→ 8):**
- Fix the catalogue (drop `opsz` from Big Shoulders Display or switch to the family that has it), and add a CI check that every catalogue CSS URL returns 200 and every look's font loads.
- **Collision-aware spacing that keeps word spacing even** (add room only where neighbouring glyph boxes would actually overlap).
- Read the family and weight from the font's `name`/`OS/2` tables.

### PC: Path Control, **8.5**
**Evidence, all with real mouse and touch input:**
- **Pen:** click for corners, click-drag for mirrored handles, Enter to finish (one undo step), rubber band preview. It also works by touch on the phone.
- **Off-frame:** anchors and **handles** off-frame are drawn on the pasteboard and grabbable.
- **Editing:** double-click insert, open/closed paths, freehand, a 22-shape library, numeric transform/point fields, undo per gesture.
- **Path keyframes A → E:**
  - ping-pong or cycle, with a per-step ease;
  - key cards (select, reorder, remove, swap with A, add);
  - on-canvas ghosts with A/B/C labels;
  - playhead parking;
  - keys editable on canvas, including off-frame points.
- **End-of-path behaviour:** glyphs fade instead of stacking.
- **Below band 9:**
  - path-aware motion does **not** "look great" at sharp corners or mid-morph (bug 1);
  - key times are fixed equal shares, with no free timing and no keys on the timeline;
  - Remix can replace a hand-drawn path (bug 3);
  - the floating toolbar overflows 9:16 artboards;
  - there's no hover affordance on off-frame points.

**Change since R1 (8):** +0.5. All four of my R1 "up one band" tool requests landed: pen, off-frame, multi-key and end-of-path. The remaining distance to 9 is text quality on the path, not tooling.

**Up one band (→ 9):**
- Glyph spacing that is collision-free **and** word-preserving on zigzags, stars and mid-morph (verify on exported frames).
- Free keyframe timing (drag keys as diamonds on the layer's lane, hold keys).
- Never let Remix or a look overwrite a custom path (or add a Path lock).
- A toolbar that adapts to narrow artboards.

### CR: Creative Range & Originality, **7.5** (provisional: the Art Director will judge originality more deeply)
**Evidence.**
- **Presets:** 29, with 12 new. Some are fresh (Kaleido, Kinetic Grid, Melt, Magnet, Ribbon, Spotlight); others are template staples (Shutter, Strobe Cut, Zoom Through, Focus Pull).
- **Looks:** **82 curated looks** with real art direction (`frames/looks-sheet-*.png`), an Inspiration view that previews my words, and Remix that mixes looks and fresh rolls with locks. It's now easy to stumble into something good, and the FX stack and layers still combine.
- **Against that:**
  - no multi-layer templates;
  - the two most visible presets (Path Flow, Rise) have no looks;
  - 2 looks are broken (bug 2);
  - the default experience is still Anton on Klein blue.

**Change since R1 (7):** +0.5, almost all from curated looks and the Inspiration view.

**Up one band (→ 8):**
- Multi-layer templates (intro title + subtitle, lower third, story CTA, hero + kicker) built on the new lanes.
- Looks for every preset.
- Remix that composes layers and timing, not just one layer's look.

### EE: Export & Embed, **8.5**
**Evidence.**
- **Video:**
  - frame-accurate offline MP4 (AV1 here, with honest, specific codec messaging) and WebM;
  - 120 frames / 4.000 s in every check, 6 s → 180 frames;
  - fast-start MP4;
  - **≈3 s for 120 frames at 1080p** (R1: ≈1–2 fps).
- **Stills, sequences and alpha:**
  - VP9 WebM with **real alpha**;
  - GIF with palette and frame merging;
  - a PNG still;
  - a PNG-sequence ZIP with alpha and an NLE README.
- **Options:** 720p–4K, 24–60 fps, loops or seconds, quality tiers. Progress shows a frame counter, and **Cancel** at 4K reported "Export cancelled." *Copy `<video>` tag* gives a correct `autoplay muted loop playsinline` snippet.
- **Embeds:** iframe, web component and self-contained HTML (http and `file://`) all work cross-origin, transparent and two-per-page, at 390 px and @2×. They're **bit-identical to the studio**, including per-layer timing. There's a postMessage ready/ended API, and `loop=0` holds the last frame.
- **R1 fixes:** the custom-font warning now exists, file names follow the project name (and add `-alpha`), and the size estimate is an honest ceiling.
- **Held back by:**
  - custom fonts still can't reach iframe or web-component embeds (warned, but there's no hosted-font route), and the HTML-file tab misreports this (bug 4);
  - the play button on play-once heroes (bug 5);
  - BT.601 tags on HD;
  - H.264 unverifiable here, with no fallback encoder (deferred by the PO);
  - no deliverable presets (deferred).

**Change since R1 (8.5):** ±0. Real gains (speed, warnings, naming, timing-aware embeds) are balanced by two new user-facing defects at the embed step.

**Up one band (→ 9):**
- A font route for iframe/web component (inline small fonts in the code, or accept a hosted font URL) and per-tab truthful messaging.
- An `endstate="hold"` that never draws the big play button when `controls` is off.
- A wasm H.264 fallback or verified H.264.
- BT.709 tagging for HD.
- Deliverable presets.

### UX: Studio UX & Visual Design, **8**
**Evidence.**
- **Layout and new surfaces:** the same premium, coherent pro layout, plus the Inspiration view, timeline lanes and keyframe cards. The lanes have snapping, keyboard nudge, ARIA value text and hatched HOLD; the keyframe cards have ghosts and playhead parking. All of it is well designed and undoable with specific labels.
- **Feedback and persistence:**
  - Remix toasts say what was kept and offer Undo;
  - the curve editor is excellent;
  - autosave plus project files carry custom fonts across browsers.
- **Input:** all listed shortcuts work, and N no longer types "n".
- **Responsive and accessible:** contrast meets AA everywhere (worst 5.31:1); phone pen editing works by touch.
- **Against that:**
  - **"null" in roughly half the tooltips**, including the new lane controls;
  - the misleading HTML-tab warning;
  - toolbar overflow in 9:16;
  - the hint and toast collide;
  - the phone tour says "hover";
  - no lanes on the phone;
  - Remix silently replaces paths;
  - the lane chip glyph renders as a bar.

**Change since R1 (8):** ±0. The UI surface grew a lot and well, but the polish bugs I hit are the kind a premium tool never ships.

**Up one band (→ 9):**
- Fix the tooltip "null" (one line) and add a UI test that hovers every `[data-tip]`.
- Make the path toolbar responsive.
- Make hints aware of the current tool.
- Truthful per-tab messaging.
- On the phone: show lanes in the Layers tab, touch copy in the tour, Edit path on the stage bar.
- A path lock in Remix.

### PR: Performance & Robustness, **7.5** (60 fps on real hardware unverifiable)
**Evidence.**
- **Determinism:**
  - zero console errors across all six scenarios, except the Big Shoulders font failure;
  - deterministic rendering (smoke, plus bit-identical frames across studio, iframe, web component and HTML file);
  - the smoke suite passes on all 29 presets at 4.5–9.9 ms per 1080p frame headless, with layer-timing, variable-axis, sanitiser-fuzz and round-trip checks.
- **Exports:** 1080p export runs ≈40 fps offline, and 4K cancel works.
- **Edge cases:** empty, emoji, accents, Arabic, 400 characters, multi-line text and Banner 3:1 are all graceful. Codec negotiation is explained.
- **Against that:** the Big Shoulders 400 throws console errors in a normal flow (applying a curated look or Remix), and the failure is **silent** to the user.

**Change since R1 (8):** −0.5, for errors in a normal flow and an undetected font fallback.

**Up one band (→ 8):**
- Detect font-load failure and surface it in the inspector and look card.
- No errors in any look.
- An adaptive-resolution perf meter that demonstrates 60 fps at 1080p.

### EQ: Engineering Quality, **7.5** (provisional: code reading only)
**Evidence.**
- **Docs and architecture:**
  - the engine / presets / export / studio split is intact;
  - `ENGINE.md` documents the new contracts (keyframes and `keyTime`, axis instances and `preset.fonts()`, `path.offset` and `spaced`, layer time);
  - the shared store/UI state contract lets the Path panel and canvas editor work independently.
- **Tests:** the smoke tests grew to cover timing and axes.
- **Against that, all R1 notes are still open:**
  - `labs/` still ships 159 KB of old demos;
  - two modal systems (`UI.modal` in ui.js, `Studio.modal` in export-dialog.js);
  - dialogs still inject CSS because "index.html is not ours to edit";
  - `path.js` grew to 1,402 lines and `path-editor.js` to 1,110.
- **New regressions slipped through:** the font URL 400 and the tooltip "null" would both be caught by a browser test that applies every look and hovers every tooltip.

**Change since R1 (7.5):** ±0.

**Up one band (→ 8):**
- Delete `labs/`.
- Unify modals and CSS loading.
- Split path.js / path-editor.js.
- Studio interaction tests: every look's font loads, every tooltip, Remix preserves custom paths, pen gestures.

---

## Top priorities for Round 3 (ranked, working-designer view)

1. **Make text on paths clean at sharp corners without breaking words.** Replace curvature-proportional extra arc length with per-glyph collision checks: add room only where neighbouring glyph boxes would overlap, and keep word spacing even. Verify on a zigzag, a star and mid-morph frames. Today it shows in my exported story *and* on the default first screen ("TY PE IN M OTION").
2. **Fix the Big Shoulders Display regression and add a font CI gate.** Drop the bad `opsz` axis. In CI, fetch every catalogue CSS URL, apply every look, and fail on any console error or missing FontFace. Surface load failures in the UI instead of silently falling back.
3. **Protect hand-drawn work.** Remix and look application must never overwrite a custom path; add a Path lock, or keep the path and only restyle. Name any destructive change in the toast.
4. **Embed truthfulness and play-once heroes.**
   - Per-tab font messaging: the HTML file *does* carry custom fonts, so say so.
   - A font route for iframe and `<typoman-player>` (inline small fonts, or accept a font URL).
   - An end-state option so `loop=0, controls=0` holds a clean last frame with no big play button.
5. **Polish sweep (each small, all visible):**
   - remove "null" from the tooltips (`ui.js:373`);
   - make the path toolbar responsive in 9:16;
   - pen-aware stage hint;
   - don't let toasts cover hints;
   - legible lane chips;
   - a hover cursor on off-frame points.
6. **Timing depth.** Free keyframe times (path keys as draggable diamonds on the layer lane, hold keys), a per-layer duration/out-point independent of cycles, and "hidden before start" in-point semantics.
7. **Phone parity.** Show the lanes (the Layers tab is empty space), touch copy in the tour, and Edit path and format on the phone stage bar.
8. **Starting points.**
   - Make Stack move on one word.
   - Give Path Flow and Rise curated looks.
   - Add multi-layer templates (intro + subtitle, lower third, story CTA, hero + kicker) on top of the new lanes.

   Deliverable presets and an H.264 fallback remain on my list for when the product owner un-defers them.
