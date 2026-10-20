# TYPOMAN Round 2: Kinetic Type Art Director

Judge lens: 15 years of title sequences and kinetic type. I weight Motion Craft, Typographic Quality and Creative Range most, but I score all eight criteria against the rubric's absolute anchors (9 = After Effects + pro type plugins / Cavalry).

Snapshot: commit **3b93646** (frozen copy in `bench/round-2/app/`), served on http://localhost:8620/ and driven with headless Chromium 141 through Playwright. The canvas is software-rendered, so I judge smoothness from the motion design and from per-frame data, not from wall-clock fps.

Evidence: `bench/round-2/work/art-director/` (116 MB). Every number below comes from a script in `scripts/` that you can re-run.

| Folder / file | What it holds |
|---|---|
| `shots/cs-default/` | Contact sheets: 29 presets × 7 loop phases × 3 aspects (16:9, 9:16, 1:1). Overviews are `sheet-*`; per-preset sheets are `pp-*` |
| `shots/looks/looks-1..4.png` | All 82 curated looks at 3 phases |
| `shots/new12/` | The 12 new presets in their designed looks, at 960×540 |
| `traces/tr-*.json/png` | Per-glyph motion traces: `drawGlyph` hooked, 60 fps, x/y/rot/sx/sy/alpha per glyph |
| `traces/seams-default.json` | Frame-to-frame pixel deltas, loop seam, determinism, for all 29 |
| `traces/cost-1080.json` | Per-frame cost at 1080p, preview and full quality |
| `shots/ty/`, `traces/kern*.json`, `axes.json`, `opsz-match.json` | Typography: kerning, width and optical-size axes |
| `shots/stack/`, `traces/stack-steps.json` | Stack rebuild |
| `shots/edge/`, `shots/rtl/`, `shots/multiline/` | RTL, emoji, Indic, Thai, CJK, long text, multi-line |
| `shots/gradient/`, `shots/fx/` | Gradient fill on every preset; effect combinations |
| `shots/remix/` | 16 Remix rolls |
| `shots/ui/` | Studio screenshots |
| `exports/` | Real exports (MP4/AV1, WebM, alpha WebM, GIF, PNG, PNG-sequence ZIP), decoded frames and reference frames |

Provisional scores:
- **PC**: I didn't drive the path editor interactively; the motion designer owns that.
- **UX**: I didn't do an accessibility or keyboard audit.

---

## Scores

| MC | TQ | PC | CR | EE | UX | PR | EQ |
|---|---|---|---|---|---|---|---|
| 7 | 6.5 | 8 (prov.) | 7 | 8 | 7.5 (prov.) | 7 | 7.5 |

```json
{"MC":7,"TQ":6.5,"PC":8,"CR":7,"EE":8,"UX":7.5,"PR":7,"EQ":7.5}
```

Round 1 (this lens): MC 6.5, TQ 6.5, PC 7.5, CR 6.5, EE 6.5 (prov.), UX 7, PR 6.5, EQ 7.

---

## Bugs found (most severe first)

1. **HIGH (TQ). Kerning is applied one pair late in every preset that draws glyphs one by one.**
   - **Repro:** Rise, Inter Tight 700, "AVATAR To WAVY", t = 2 s (hold). Compare it with a native `fillText` of the same line at the same origin. See `shots/ty/kern-visual-0.png`: top row TYPOMAN, middle row native, bottom row overlay (red TYPOMAN, cyan native).
   - **Measured** (layout pen minus native pen, 151 px type, `traces/kern2.json`):

     | Pair | Error |
     |---|---|
     | A**V** | +13.9 px |
     | T**o** | +11.8 px |
     | W**A** | +11.1 px |
     | A**V** (in "WAVY") | +13.9 px |

   - **What you see:**
     - "AV" and "To" lose their kern, and **"AR" and "VY" collide**.
     - In Playfair, "Wavy Tea, LT" loses its Wa, Te and LT kerns (`kern-visual-1.png`).
     - Per-glyph vs native mismatch is 12–47 % of ink on kerned caps, and 0.11 % on "office fluffy", which has no kerned pairs (`traces/kern.json`).
   - **Cause** (`text.js:104-105`):
     - Glyph k's origin is `prefix[k]` (the kerned width of glyphs 0..k−1), and `w = prefix[k+1] − prefix[k]` folds the kern with the *previous* glyph into this glyph's own box.
     - The kerned pen position is `prefix[k+1] − advance(k)`.
     - `drawGlyph` centres the glyph in that box (`renderer.js:150-162`).
     - Line widths come out right, which hides the bug. The same code was in Round 1 (`3f7aecb:js/engine/text.js:89-90`), and no judge caught it.

2. **HIGH for two presets (CR/TQ). The gradient fill erases far more than the team admits.**
   - **How it works:** the gradient is a `source-in` fill over the whole layer buffer (`renderer.js:525-535`), so it recolours everything a preset paints, not only glyph ink (`shots/gradient/sheet-1..4.png`).
   - **Ribbon: the printed text vanishes.** The band and the ink get the same gradient.
   - **Kinetic Grid: every letter vanishes**, leaving a grid of orange squares. Its "knock-outs" are letters painted in the background colour (`kinetic-grid.js:57-58, 91`), and the gradient then recolours them along with the tiles.
   - **Lost meaning:**
     - Flip's back-face colour (its signature effect)
     - Outline Draw's accent pen
     - Shutter's slat shading
     - Typewriter's accent caret
     - the Draw On, Magnet, Lens and Spotlight guides
   - **Admitted and verified:** Split Flap tiles go murky; Glitch fringes go flat.

3. **HIGH for the looks that use it (TQ/PR). Big Shoulders Display never loads.**
   - `fonts.js:31` declares an `opsz` axis that this Google family doesn't have. Google's css2 returns **HTTP 400** for `Big+Shoulders+Display:opsz,wght@10..72,100..900` (curl). The opsz version is the family "Big Shoulders".
   - The console logs CORS errors and "variable axes unavailable".
   - The face falls back to a generic sans. Two shipped looks render in the wrong font: Outline Draw "Blueprint" and Cylinder "Paper Column" (`shots/looks/looks-3.png`, `looks-4.png`). The font picker previews it in sans (`shots/ui/05-font-picker.png`), and Remix can roll it.
   - Instances measure identically at opsz 10 and 72 (`traces/axes.json`).
   - The smoke test doesn't check that each catalogue family actually loads.

4. **MEDIUM-HIGH (TQ/PC). Multi-line path text still collides between lanes.**
   - In 1:1, Path Flow's two lanes cross through each other in every frame (`shots/hr/pathflow-1x1-sheet.png`).
   - In 16:9, the lower lane rides into the upper lane's feet on the descents (`pathflow-16x9-00.png`). Three lanes crowd (`shots/multiline/sheet-1.png`).
   - On path keyframes, the lanes pile up at the heart's cusp mid-morph (`shots/timing/sheet-1.png`, row 2).
   - Bend spacing within a lane is fixed. Lane-to-lane spacing is not. This was Round 1's jury priority #1, and it is half done.
   - Note: the studio's first-run scene is one line, so it doesn't show this. The engine's default text (`scene.js:32`, "TYPE IN\nMOTION") does.

5. **MEDIUM (MC). Magnet jitters on letters near the magnet's path.**
   - On consecutive 60 fps frames, glyph 9's y alternates 332.6 → 336.9 → 332.1 → 338.1 → 328.1 → 331.1 → 323.0 px.
   - The worst residual |x_k − (x_k−1 + x_k+1)/2| is **8 px at 960 px wide**. Smooth curves elsewhere stay under 1 px: Draw On 0.7, Rise 0.6.
   - Cause: the 32-tap convolution (`magnet.js:14, 45-75`) undersamples a narrow, 1/d-singular force pulse.
   - Evidence: `traces/tr-magnet.png`, saw-toothed curves at t ≈ 1.3–1.5 s and 3.0–3.4 s.

6. **MEDIUM (MC). Fly In rotation flips about 195° in one frame.**
   - `path-land.js:186` and `:231` scale `angleDelta(0, heading)` by `(1 − land)`. When a letter's heading crosses ±π, the rotation jumps from −1.74 to +1.74 rad between consecutive frames.
   - This happens to letters curling back toward slots that lie left of the path end.
   - Default scene: "T" frames 94→95 and "Y" frames 90→91, and again on the exit (`traces/tr-flyin.png`, rot panel; `shots/flyin/flip-sheet.png`).

7. **MEDIUM (MC). Fly In still knots at peel-off.**
   - The word now reads in the right order in flight, so the Round 1 "EPYT" bug is fixed.
   - But each glyph's blended trajectory (path + w·(slot − end)) crosses the others at the arc's apex. "INMOTION" and "TYPEIN" pile into rotated clumps from t ≈ 0.9 s to 1.9 s (`shots/flyin/entry-sheet.png`).

8. **MEDIUM (MC). Stack's width sweep is quantised.**
   - Rows draw from a ladder of up to 49 width instances (`fonts.js:221-230`, `stack.js:16-21`). With Roboto Flex, the "MOTION" row switched instance **72 times in 240 frames** (`traces/stack-steps.json`).
   - At each switch (every 3–4 frames) letters jump 3–4 px and glyph widths jump 4–6 px at 1080p. Between switches they move 0.5–1.5 px per frame, measured from `shots/stackstep/f-*.png`.
   - The result is a 15–20 Hz shimmer in the breathing rows.

9. **MEDIUM (TQ). RTL is still broken in Typewriter and Split Flap.**
   - Rise, Path Flow, Kinetic Grid, Sequence and Wave render Arabic and Hebrew correctly. But no preset reads `line.rtl`: grep finds zero hits in `js/presets/`.
   - **Typewriter:** the caret anchor is `g.x + g.w + half` (`typewriter.js:94`), and live centring assumes LTR (`:125`). The caret lands between the words, and the line jumps sideways while typing.
   - **Both presets drop the word space** ("שלוםעולם", "مرحبابالعالم").
   - **Split Flap:** cell padding grows with the logical index, `(2j + 1)·padX` (`split-flap.js:86`), which pushes RTL words into each other. Evidence: `shots/rtl/sheet-1.png`, `sheet-2.png`.

10. **MEDIUM (CR/UX). Curated looks aren't reproducible.**
    - `applyLook` merges the look over the current layer (`scene.js:406-408`), so effects the look doesn't name survive.
    - Remix proves it (`shots/remix/rolls.json`): "Variable surge" (roll 2) inherited blur 0.4 and glow 0.4 from roll 1, and "Jelly" (roll 13) inherited extrude 0.59 from roll 12.
    - The same look renders differently depending on what came before it.

11. **MEDIUM (CR/EE). Kinetic Grid's "knock-outs" are painted, not cut.**
    - In a transparent export the letters are **opaque black**, not holes. Over magenta, 9.6 % of the frame is opaque black (`exports/grid-alpha-over-magenta.png`).
    - On linear or radial backgrounds the letters take only `bg.color`, the first stop.

12. **MEDIUM (safety, CR). Strobe Cut has no photosensitivity guard.**
    - The "Rave" look reaches about **3.5 full-frame flashes per second** (luminance swings of 0.6–0.9 of full scale; `traces/flash.json`). That is above the 3/s limit in WCAG 2.3.1 and ITU-R BT.1702.
    - There is no warning anywhere in the app (grep for photosensitive/epilep/seizure: nothing).

13. **LOW-MEDIUM (MC). Sequence's "zoom" move washes the frame white.**
    - It zooms 24× about the portal letter's centre (its ink), not its counter. Frames 30–31 are almost solid white, then the next shot fades in through a lavender veil (`shots/seq/seq-t1-sheet.png`).
    - The per-letter stagger inside a camera move slides letters over each other: "IN" doubles and "PEN" overlaps.
    - Zoom Through does the same dive properly, aiming at a rasterised counter.

14. **LOW-MEDIUM (MC). Outline Draw pops on long contours.**
    - The dash length is fixed at `2.4·(w + capH)` (`outline-draw.js:97`). An Anton "M" outline is longer than that.
    - Its inner diagonals never draw on, then snap in when `draw` reaches 1 (frames 58→62, `shots/odraw/drawend-sheet.png`).
    - At the start of the lift, the whole M vanishes in one frame; that frame's delta is 6× its neighbours' (`shots/odraw/sheet.png`).

15. **LOW-MEDIUM (TQ). Path Flow's bend spacing opens holes inside words.**
    - The extra room at bends is concentrated within ±capH/2, so the first-run scene reads "MOTIO N", "MO TION", "M OTION" (`shots/hr/pathflow-1line-sheet.png`, `shots/ui/06-*.png`). A long lowercase line reads "the typ e keep s mo v ing" (`shots/edge/sheet-2.png`).
    - Round 1's touching letters became uneven tracking.

16. **LOW-MEDIUM (TQ). Wave's defaults collide line into line.**
    - The amplitude (0.38 em) exceeds the free leading on two or three lines (`shots/cs-default/sheet-16x9-1.png`, wave row; `shots/multiline/sheet-1.png`). All three curated Wave looks show it.

17. **LOW-MEDIUM (TQ). Stack sizes rows from the Latin cap height.**
    - Descenders drop into the next row ("big" over "idea", `shots/stack/sheet-2.png`), and Arabic rows overlap (`shots/rtl/sheet-2.png`).

18. **LOW-MEDIUM (TQ/PR). There is no line wrapping.**
    - A 100-character line fits by shrinking to about 5 px cap height at 320 px wide (`shots/edge/sheet-1.png`, "Long line").

19. **LOW (MC/CR). Spotlight's default lingers where there is no type.**
    - `inOutSine` on a ping-pong across the full-width line path (`spotlight.js:56-58`) slows the light at the empty ends.
    - With the default radius, the text is lit for about 43 % of the loop. Five of seven contact-sheet phases are dark.

20. **LOW (CR).**
    - Default Stack (Anton has no width axis) is a centred, tracked-out stack ("T Y P E" at up to 0.3 em) that rarely reaches the edges (`shots/stack/sheet-1.png`, row 1).
    - Kinetic Grid breaks words across rows and repeats letters ("TYPE / IN MO / TIONT").
    - Draw On "Blueprint" crushes "MOTION" into a blob inside the circle (`shots/looks/looks-1.png`).
    - Title case capitalises "For" and "The".

**Team-admitted limits, checked:**
- **Gradient on Split Flap tiles and Glitch fringes:** confirmed.
- **Focus Pull is the heaviest preset:** confirmed, tied with Melt at about 9 ms mean (p95 14–15 ms) at 1080p in software raster (`traces/cost-1080.json`). Not a problem.
- **No H.264 in this container:** confirmed. MP4 falls back to AV1, and the export dialog explains this clearly (`shots/ui/07-export-dialog.png`).

---

## 1. Motion Craft (MC): **7**

**Evidence (positive)**
- **Loops are exact for all 29 presets.** f(dur) equals f(0) bit for bit (MAD 0.000), and every render is deterministic. Seam deltas match the neighbouring frames' deltas: ratio 0.0–1.03 except designed cuts. See `traces/seams-default.json`.
- **Round 1's craft notes were fixed:**

  | Preset | Fix | Evidence |
  |---|---|---|
  | Flip | Real keystone strips plus a hop arc | `flip.js:99-137` |
  | Pop | The second landing ramps in; the squash curve is smooth | `traces/tr-pop.png` |
  | Cylinder | Back faces fade through edge-on instead of stepping | `cylinder.js:96-98` |
  | Fly In | Reads the right way round in flight; launches are spaced by reading-order distance | `shots/flyin/entry-sheet.png` |

- **Pop's trace reads like hand animation:**
  - stretch builds with fall speed (sy up to 1.29);
  - the contact frame flips to squash (sy 0.80);
  - a damped settle and a second hop;
  - a crouch, then a stretched zip off the top.
- **The new presets mostly carry real secondary motion:**
  - **Zoom Through:** exponential zoom, so every word step has the same speed; eased reading pauses; a real dive through a rasterised counter (`shots/zt/zt-dive-sheet.png`, `zt-after-sheet.png`). This is the best new move.
  - **Melt:** a gravity melt, a spring re-form that overshoots into a squash.
  - **Strobe Cut:** a punch decaying in the first third of each beat.
  - **Shutter:** springSoft slats that wobble to a stop.
  - **Focus Pull:** a crossfaded blur pyramid, so racks never step.
  - **Ribbon:** whole-twist periodicity.
- **Motion blur** is a real sub-frame shutter and looks right on Fly In, Zoom Through, Kinetic Grid and Sequence's whip (`shots/fx/sheet-1.png`, `sheet-3.png`).
- **New controls:** per-layer delay, cycles ×1–8 and "once" (verified in `shots/timing/sheet-1.png`, row 1), and path keyframes A→B→C with an ease per step.

**Evidence (negative)**
- **Real artefacts in four presets:** Magnet jitter (bug 5), Stack instance shimmer (bug 8), the Fly In rotation flip (bug 6) and Outline Draw pops (bug 14).
- **Craft misses in defaults:** Fly In knots (bug 7), Sequence's zoom white-out and in-camera stagger (bug 13), Spotlight's dwell (bug 19), and Wave's line collisions (bug 16).
- **Stack's accordion is still a plain sine** (`stack.js:104`), with no overlap or settle. This was a Round 1 note.
- **The control ceiling hasn't moved** (core.js has changed by 2 lines since Round 1):
  - springs are still fixed presets (the curve editor shows them as approximate béziers, `curve-editor.js:30`);
  - stagger is still linear in rank (`renderer.js:80-83`);
  - there is no stagger-distribution curve, no time jitter, and no per-property keyframes or graph editor.

About 21 of 29 presets feel professional. That is "most", but there are more weak presets than "an odd one".

**Change since Round 1:** +0.5. Several Round 1 faults are fixed and 12 new, mostly well-timed presets arrived. New artefacts (jitter, shimmer, flip) hold it at a low 7.

**To reach 7.5–8:**
- Fix the four artefacts. Magnet needs a continuous-time impulse response (or adaptive taps and a softened 1/d). Stack needs continuous `wdth`. Fly In needs unwrapped rotation and non-crossing trajectories (e.g. land in path order with lane offsets). Outline Draw's dash should be the measured contour length.
- Stop letter stagger inside camera moves.
- Give Stack overlapping, settling rows.
- Expose spring stiffness, damping and mass.
- Add a stagger-distribution ease and seeded time jitter.

---

## 2. Typographic Quality (TQ): **6.5**

**Evidence (positive)**
- **Variable axes are real.**
  - Roboto Flex "Hamburgefonstiv" grows from 286 px (wdth 25) to 1040 px (wdth 151); Science Gothic from 630 to 1793 px (`traces/axes.json`, `shots/ty/axes-*`).
  - Fraunces at opsz 9 vs 144, and Bodoni Moda at 6 vs 96, differ by about 29k ink pixels.
  - With opsz auto, preview (640 px) vs downscaled export (1920 px) scores **29–35 dB** PSNR (resampling only). Rendering at a different opsz scores 10–13 dB. **The preview and the export draw the same letterforms** (`traces/opsz-match.json`). The smoke test agrees: 0.000 % width spread from 40 to 324 px.
- **Stack is rebuilt honestly.** It uses the width axis plus tracking, and "Stretch" is now an explicit choice. With Roboto Flex, Science Gothic and Anybody the rows really change design width, and the four Stack looks are poster-quality (`shots/stack/sheet-1.png`, `shots/looks/looks-1.png`).
- **The multi-line font bug is fixed.** Rise's lines measure 75 / 75 px of ink (smoke test). 3-line left, right and centre alignment is correct in Rise, Pop, Typewriter and Split Flap (`shots/multiline/sheet-1.png`).
- **Wide script support:**
  - RTL works in Rise, Path Flow, Kinetic Grid, Sequence and Wave, with joined Arabic.
  - Emoji, ZWJ sequences, flags, Devanagari conjuncts, Thai, CJK and Zalgo text all survive (`shots/edge/`).
- **The looks finally show off the library:** Bodoni Moda, Fraunces, Instrument Serif, Space Mono, JetBrains Mono, Bowlby One, Shrikhand and more, with sensible pairings.
- **Good inspector UI:** axis tags in the font picker, and weight, width and opsz (Auto/Fixed) controls (`shots/ui/03-look-applied.png`, `05-font-picker.png`).

**Evidence (negative)**
- **Kerning is systematically wrong** (bug 1). This is the defining TQ defect. The 7 band requires "kerning mostly preserved", and here kerned pairs open up while the next pair crashes.
- **Big Shoulders Display is dead** (bug 3).
- **Multi-line path text collides** (bug 4), **bend spacing opens holes inside words** (bug 15), and **Wave lines collide** (bug 16).
- **RTL is broken in Typewriter and Split Flap** (bug 9). **Stack ignores descenders and non-Latin heights** (bug 17).
- **No wrapping** (bug 18).
- **No ligatures:** per-glyph drawing loses them. "office fluffy" in Fraunces matched native only because Chrome didn't form ligatures there.
- **Slant is a fake oblique.** Title case is naive.
- **Anton, the default font, has no width axis**, so the rebuilt Stack looks weakest in its default state.

**Change since Round 1:** flat. The axes, the multi-line fix and the looks are real gains. The kerning offset existed in Round 1 too, but nobody caught it. Bugs 3, 9 and 15 are new or newly visible.

**To reach 7–7.5:**
- Fix the pen position in `text.js`: x_k = prefix[k+1] − advance(k), with w = advance(k). Add a pixel test against native `fillText` for "AV To LT".
- Fix the Big Shoulders catalogue entry and add a CI check that every family's css2 query returns 200.
- Lay out multi-line path text as a block that cannot cross (clamp the offset to the radius of curvature).
- Spread bend spacing across the whole bend.
- Make every preset RTL-aware.
- Add automatic, balanced wrapping.
- Make a width-axis family the Stack default.

---

## 3. Path Control (PC): **8 (provisional)**

**Evidence**
- **Feature set:**
  - edit, pen and freehand tools;
  - 22 shapes;
  - close, open and flip operations;
  - numeric point fields;
  - path keyframes A→E in cycle or ping-pong, with an ease per step (`path-panel.js:3-4, 137, 197, 246-290`);
  - the morph sampled by the renderer (`renderer.js:324-333`).
- **The morph renders smoothly** (wave → circle → heart in `shots/timing/sheet-1.png`).
- **Bend-aware placement fixed within-lane collisions.** The single-line first-run scene no longer touches (`shots/hr/pathflow-1line-sheet.png`).
- **Ribbon** is a new, convincing path consumer with smoothed corners and whole-twist loops.

**Weak points**
- Path-aware motion quality lags the editor: lane collisions (bug 4), word gaps (bug 15), the Fly In knot (bug 7), and Draw On "Blueprint" crushing its second lane.
- I didn't test the editor's affordances by hand. That's the motion designer's lens.

**Change since Round 1:** +0.5 for the pen tool, off-frame points and keyframes.

**To reach 8.5–9:** non-crossing lanes, a smooth tracking curve over bends, glyph scale or stretch compensation, and per-glyph offset and scale along the path.

---

## 4. Creative Range & Originality (CR): **7**

**Evidence (positive)**
- **Breadth:** 29 presets and 82 curated looks across 27 of them. The Inspiration view lists all 82 (`shots/ui/02-inspiration.png`), and the preset view has a looks strip (`06-*.png`).
- **The best looks are portfolio-grade:**
  - Stack: Flex accordion, Gothic cascade, Signal pulse, Poster stretch
  - Cylinder: Gold Ring (also verified playing in `embed.html`, `shots/ui/09-embed.png`)
  - Kinetic Grid: Swiss mono and Bauhaus
  - Tunnel: Hypno pulse
  - Ribbon: Racing
  - Melt: Slime
  - Zoom Through: Pop Art and Hyperspace
  - Typewriter: Editorial
  - Pop: Cartoon (`shots/looks/`, `shots/new12/`)
- **Remix now changes motion params and paths** (`app.js:94-160`). In 16 rolls, about 9 were attractive (`shots/remix/sheet.png`).
- **Effects mostly combine well:** motion blur, echo trails on Kaleido, a cartoon stroke plus shadow on Pop, and glow (`shots/fx/`).
- **Genuinely fresh in execution:**
  - Zoom Through, which really dives through a letter's counter. Its frame at p = 0.33, inside the P with "MOTION" waiting, is the most original moment in the app.
  - Ribbon.
  - Focus Pull on type.
  - Stack on the width axis.

**Evidence (negative)**
- **Most of the 12 new presets are template-pack tropes, done competently:** Spotlight, Kaleido, Melt, Shutter (AE ships a Venetian Blinds effect), Outline Draw (trim-paths on outlines), Strobe Cut and Sequence are all lyric/promo-pack staples.
- **Combinations break:** the gradient wipes out Ribbon and Kinetic Grid (bug 2), and extrude is still screen-space, so it ignores Cylinder and Orbit orientation (`shots/fx/sheet-1.png`).
- **Looks leak state** (bug 10).
- **Path Flow and Rise have no looks.** The Presets grid still renders every card in the user's current style, so it's monotone blue by default (`shots/ui/01-first-load.png`). Inspiration is a cramped 2-column sidebar, about 6 cards visible at a time.
- **Remix lands on dead frames** about a third of the time: Spotlight with the light off the text, Lens clutter, a single "7" mid-scramble.

**Change since Round 1:** +0.5. Round 1's bar for 7 was looks per preset, a Remix that mutates motion and paths, and 2–3 signature presets. All three were delivered.

**To reach 7.5–8:**
- Make effects and fills safe for every preset (bug 2).
- Make looks complete states.
- Add 2–3 more presets with no template equivalent: a phrase morph sharing letters, type-as-particles assembling onto the path, layer-to-layer mattes and masks.
- Show preset cards in their first look, with a full-width Inspiration browser.
- Have Remix avoid unreadable frames, e.g. by scoring legibility the way the gallery's `bestTime` already does.

---

## 5. Export & Embed (EE): **8**

**Evidence** (all real files, `exports/`)

| Format | Codec / size | Frames / duration | Fidelity vs reference |
|---|---|---|---|
| MP4 | AV1 Main, 1920×1080, 30 fps | 120 / 4.000 s | 38.8 dB |
| WebM | VP9, 1280×720 | 120 | 38.5 dB |
| Alpha WebM | VP9 with `alpha_mode=1`; decodes with real alpha (92 % transparent) | 120 | — |
| GIF | 854×480, 22 colours, 54 stored frames, 4.000 s | — | 67.6 dB |
| PNG | 1920×1080 still | 1 | bit-exact |
| PNG sequence | 1280×720, ZIP | 240 + README | — |

- The preview renderer is **bit-identical** to the export reference at the same size.
- Exporting a 4 s clip took 1.1–4.6 s per format.
- The export dialog states the AV1 fallback and its compatibility limits plainly.
- `embed.html` plays an encoded look.
- I didn't test the web component or the standalone HTML.

**Not verifiable here:** H.264 output.

**Change since Round 1:** +1.5 against my own provisional 6.5, which was based on code reading. This round I encoded and decoded every format and verified the fidelity myself. The jury median was 7.5.

**To reach 8.5–9:**
- Verified H.264 output, or a fallback encoder.
- The deliverable presets the product owner deferred.
- File names taken from the text.
- Fix the Kinetic Grid transparent export (bug 11).

---

## 6. Studio UX & Visual Design (UX): **7.5 (provisional)**

**Evidence:**
- A clean, premium dark studio (`shots/ui/01-*.png`).
- An Inspiration tab with category chips and search.
- A per-preset looks strip, and timeline lanes showing delay and "once" (`06-two-layer-timeline.png`).
- Axis controls that appear only for families that have the axes, with Auto/Fixed opsz.
- Axis tags in the font picker.
- An honest export dialog.
- A responsive phone layout with stage, transport and tabbed panels (`08-phone.png`).
- Zero console errors in my runs, except when Big Shoulders Display is used.

**Weak points:**
- Preset cards stay monotone, and Inspiration is cramped.
- Looks applied through Remix or the gallery inherit stale FX (bug 10).
- The stage shows a transparency checkerboard for over 1.4 s while a newly rolled font loads (`shots/remix/roll-06.png` vs `roll6-cmp.png`).
- There is no photosensitivity warning (bug 12).

**Change since Round 1:** +0.5. Inspiration, the looks strip, timeline lanes, axis controls and the honest AV1 note are new. The monotone gallery is only partly addressed.

**To reach 8:** first-look preset thumbnails, a full-width Inspiration browser, complete-state looks, and a keyboard and accessibility pass (not audited here).

---

## 7. Performance & Robustness (PR): **7**

**Evidence:**
- Every preset renders in 4.4–9.3 ms per frame (mean) at 1080p in software raster, with p95 ≤ 15 ms in both preview and full quality (`traces/cost-1080.json`).
  - My first pass showed Shutter at 29.8 ms. That was an artefact of reusing one renderer across sizes, and the warmed-up figure is the real one.
- Determinism and seams are perfect.
- Nothing threw on RTL, emoji, Zalgo, CJK, a 100-character line, a 34-letter word, spaces-only text or the sanitiser fuzz. The smoke test passes all 29 presets.

**Against:**
- Console errors appear in a normal flow, whenever Big Shoulders is picked (bug 3).
- Layout breaks in edge cases: no wrapping, RTL spacing in two presets, Stack overlaps with Arabic.
- Heavy effect stacks are costly at full quality: Tunnel with every effect took **266 ms per frame at 480×270** (`shots/fx/sheet-2.png`). That is export-time pain at 4K.

**Change since Round 1:** +0.5. The font-state rendering failure is gone, and every preset now fits the 60 fps budget in software raster. There are new edge-case layout faults and one font that errors.

**To reach 7.5–8:**
- Fix bug 3.
- Add wrapping.
- Make every preset RTL-safe.
- Add regression tests for kerning, gradient on every preset, and catalogue font loading.
- Add an effect-cost budget, or warn on export.

---

## 8. Engineering Quality (EQ): **7.5**

**Evidence (positive):**
- The engine/studio/preset contract is clean and documented, and ENGINE.md covers the new APIs: axes, `preset.fonts`, looks, path keyframes, `f.bg`, `f.buffer`.
- MotionKit shares helpers across team B.
- The smoke test was extended to axes, timing, looks and the multi-line regression.
- There is no `Math.random` in the engine or presets.

**Evidence (negative):**
- **Duplication:**
  - `SEPARATORS` is copied in 6 presets.
  - The joined multi-line layout setup is copied in tunnel, kaleido and ribbon.
  - `inverse()` exists in both path-land and path-draw.
  - Canvas creation is written 5 ways.
- **Private reach-ins:**
  - `stack.js:168` sets `f._font`.
  - `kinetic-grid.js:57` reads `f.renderer.scene.bg` instead of the documented `f.bg`.
- `labs/` (≈160 KB of legacy experiments) is still shipped, despite the Round 1 note.
- **Architecture leaks:**
  - The layer-wide `source-in` gradient breaks presets that paint non-glyph elements (bug 2).
  - The engine computes `line.rtl`, but no preset consumes it.
- A catalogue data error (bug 3) got past the tests.

**Change since Round 1:** +0.5. Shared kits, more documentation and broader tests. The duplication, the private reach-ins and `labs/` remain.

**To reach 8:**
- Separate ink from decoration in the frame API, e.g. `f.drawGlyph` applies the fill while preset shapes opt out.
- Share separators and the joined layout.
- Delete `labs/`.
- Test kerning, gradient on every preset, and catalogue font loading.

---

## Top priorities for Round 3 (ranked, Art Director lens)

1. **Fix glyph pen positions (kerning) in `text.js:104-105`.** Use x_k = prefix[k+1] − advance(k) and w = advance(k). Add a pixel test that compares Rise at hold with native `fillText` for "AVATAR To WAVY" in Inter Tight and Playfair. This is one engine fix that lifts every preset's typography.
2. **Make fills and effects safe across presets.** The gradient should apply to glyph ink only: a gradient `fillStyle` in `drawGlyph` in text-block or frame space, while preset decorations (bands, tiles, pens, carets, fringes) keep their own colours. Make Kinetic Grid knock-outs real, using `destination-out`. Ribbon, Kinetic Grid, Flip, Shutter, Outline Draw, Split Flap and Glitch all need this.
3. **Fix multi-line path typography.**
   - Lanes that cannot cross: lay the block out along the normal and clamp each offset to the local radius of curvature.
   - Bend spacing spread over the whole bend, like a tracking curve, instead of a local gap.
   - Wave amplitude scaled down automatically against the leading on multi-line text.
4. **Remove the motion artefacts.**
   - Magnet: a continuous impulse response, adaptive taps and a softened 1/d.
   - Stack: continuous width, e.g. per-row variation settings or a crossfade between neighbouring instances.
   - Fly In: unwrapped rotation and non-crossing trajectories.
   - Outline Draw: measured contour length.
   - Sequence: aim the zoom at counters, and no letter stagger inside camera moves.
   - Spotlight: travel only across the text's extent.
5. **Raise the timing ceiling.** Editable spring stiffness, damping and mass; a stagger-distribution curve; seeded per-glyph time jitter; and at least simple per-property keyframes for offset, scale and rotation on top of any preset. MC can't reach 8 without these.
6. **Tidy looks and fonts.**
   - `applyLook` should produce a complete, reproducible state.
   - Fix the Big Shoulders entry ("Big Shoulders" or no opsz) and add CI that loads every catalogue family.
   - Add looks for Path Flow and Rise.
   - Show preset cards in their first look, with a full-width Inspiration browser.
7. **Make every preset RTL- and script-aware.** Fix Typewriter's caret and spacing and Split Flap's padding. Size Stack rows from real ink bounds, so descenders and Arabic don't collide.
8. **Typographic polish.** Balanced automatic wrapping; ligatures and OpenType features by drawing whole-word runs where the preset allows; proper title case; real italics or `slnt` where fonts have them; a width-axis default for Stack.
9. **Add a photosensitivity guard.** Cap Strobe Cut and Glitch at 3 flashes per second by default (Harding / ITU-R BT.1702), with an explicit, warned override.
10. **Add 2–3 signature presets with no template-pack equivalent:** a phrase morph that shares letters between words, type-as-particles assembling onto the path, and layer-to-layer mattes and masks for Saul Bass-style reveals. Zoom Through shows the team can do this.
