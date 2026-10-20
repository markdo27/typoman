# TYPOMAN Round 2: Creative Technologist report

**Lens:** Performance & Robustness (PR), Engineering Quality (EQ), Export & Embed (EE). All eight criteria are scored against the rubric's absolute anchors.

**Snapshot:** commit 3b93646, served from `bench/round-2/app/` at http://localhost:8620/ (static, no build step). The repo HEAD equals the snapshot. The export pipeline, `player.js` and `embed.html` are byte-identical to Round 1 (`git diff 3f7aecb 3b93646 -- js/export player.js embed.html` is empty).

**Environment:**
- Headless Chromium 141.0.7390.37 (software raster, 4 vCPU) via Playwright 1.56.1, plus ffmpeg/ffprobe 6.1.1.
- WebCodecs in this container: H.264 is **unsupported** (all four profiles rejected); AV1, VP9 and VP8 are supported; VP9 with `alpha:'keep'` is rejected, so the sidecar alpha path is used. `FontFace.variationSettings` is supported, so the optical-size instances are active.

**Cross-origin setup:**
- The snapshot is served again on **:8621 with no CORS headers**.
- The host pages are on **:8622**.
- The standalone HTML is opened from **`file://`**.

**Evidence:** `bench/round-2/work/creative-technologist/`:
- `scripts/`: `t01_boot` … `t16_cancel` (`*.mjs`), `validate.py`, `eslint.config.mjs`.
- `logs/`: raw JSON for every test, the ESLint output and the jscpd reports.
- `exports/`: every exported file, plus `ref/` reference frames from `TM.Export.referenceFrame`.
- `shots/`: contact sheets and screenshots.

Every number below comes from those files.

## Scores

| Criterion | Band | My R1 counterpart |
|---|---|---|
| MC Motion Craft | **7.0** | 6.5 |
| TQ Typographic Quality | **7.0** | 6.0 |
| PC Path Control | **7.5** (prov.: API and engine verified, editor UI only lightly driven) | 7.0 |
| CR Creative Range & Originality | **7.0** (prov.: not my lens) | 6.5 |
| EE Export & Embed | **7.5** | 7.5 |
| UX Studio UX & Visual Design | **7.0** (prov.: flows driven, not a design review) | 7.0 |
| PR Performance & Robustness | **7.0** | 6.5 |
| EQ Engineering Quality | **7.5** | 7.5 |

```json
{"MC":7,"TQ":7,"PC":7.5,"CR":7,"EE":7.5,"UX":7,"PR":7,"EQ":7.5}
```

The mean is 7.19, so the overall band is **7.0**.

**Headline.** The Round 1 engine bug that broke "a frame is a pure function of (scene, t)" (B1) is gone:
- **420/420 frames** (140 configurations) are identical across two browser processes.
- 12,321 ordered "poison" pairs leave no engine state behind.
- Cold-page exports and cold embeds draw pixel-identical letterforms, including the new width and optical-size instances.
- Loops are excellent: **340 of 341** preset × look × option configurations loop seamlessly.

What keeps the scores from moving more is the **new variable-font subsystem's operational edges** and a test suite that still doesn't look at what users get:
- one catalogue family that can never load in Chromium, shipped in two curated looks and in Remix;
- no timeout when Google Fonts hangs, so the studio never boots and embeds stay blank;
- FontFace instances that are never released (about +230 MB RSS in a short session);
- silent letterform loss under a `connect-src` CSP;
- an AV1-in-MP4 fallback whose `av1C` box is a placeholder.

---

## Round 1 regression list (B1–B9)

| R1 bug | Status | Evidence (R2) |
|---|---|---|
| **B1** Rise/Split Flap drew in `10px sans-serif` after `save/restore`; preview ≠ export | **Fixed** | `_setFont` now re-checks `ctx.font` (`renderer.js:123-131`). The smoke test reports line ink 75/75 px. 0 font-related mismatches over 420 frames in two processes (forward vs reverse order, poisoned 1280×720 renderer) and over 12,321 X→Y renderer pairs (`t04_determinism`, `t04c_poison`). |
| **B2** Heavy stacks collapse frame rate; no adaptive fallback | **Partly fixed** | In the studio, heavy Path Flow (echo 6 + blur 0.5 + glow 1 + extrude 0.6) starts at 8 fps, drops to 0.64× backing (476×268) within 3 s and holds **23–27 fps**, against 6 fps in R1 (`t06_studio`). Engine preview quality is 39–254 ms/frame at 1080p (R1: 120–1347). **Export quality is unchanged: 152–4,003 ms/frame** (Kaleido 4.0 s, Tunnel 3.3 s, Orbit 2.9 s, Path Flow 2.6 s), so a 4 s 1080p60 Kaleido export takes about 16 min. |
| **B3** RTL reversed and unjoined | **Fixed for RTL lines**; one bidi gap | Arabic and Hebrew lines match native `direction:rtl` shaping and order in Rise, Pop and Typewriter (`shots/rtl/…`). **New, smaller bug:** two or more LTR words inside an RTL line are reversed: "مرحبا ABC DEF عالم" renders "…DEF ABC…" (`text.js:25-29,104` mirrors each word cluster). |
| **B4** Custom fonts silently dropped in embeds | **Fixed (warned)** | The share dialog now says "MyBrand (custom) is an uploaded font and can't travel in a link or embed code. Viewers will see Anton instead…" (`t10_ui`). The standalone HTML still embeds it. |
| **B5** Decompression bomb, and the raw-JSON hash skips caps | **Partly fixed** | Time is bounded: rejected in 43–164 ms. **Memory is not:** Chrome's `DecompressionStream` inflates the whole single Blob chunk before the first `read()`, so a **190,257-char link (under `MAX_ENCODED` = 200,000) allocates about 139 MB** before the 1 MB cap fires (64 MB bomb: +64.2 MB heap after the first read) (`t08b_bomb`, `scene.js:342-360`). A raw-JSON hash is still uncapped (a 1.5 MB `#c={…}` loads, `player.js:268`). |
| **B6** Sanitiser ignores `step`; fractional URL params break loops | **Fixed** | All 38 integer-cycle params snap (e.g. `path-flow.speed` −3.47 → −3, `stack.cycles` 1.53 → 2). Every seam is ≤ 1.04× the largest ordinary step (`t12_r1regress`). |
| **B7** Closed→open path morph pops at the loop point | **Not fixed** | circle→line: seam 6.41 vs largest ordinary step 3.34 (**1.92×**; R1 2.58×). Closed→closed and open→closed are fine (≤ 0.6×). A 5-key A→E sequence has mid-loop steps up to 2.6× the median at the closed↔open transitions (`path.js:1313-1316`). |
| **B8** Preview quality ≠ export quality | **Not fixed** | Plain scenes are identical (99 dB, every preset). With a heavy stack, preview vs export is **16.5–50.7 dB** (Zoom Through 16.5, Kaleido 20.1, Sequence 21.2, Tunnel 22.1). No "draft preview" indicator exists anywhere (`grep -i draft` finds none). The export dialog's own preview also uses `quality:'preview'` (`export-dialog.js:148`). The README still says exports "match the preview exactly". |
| **B9** Minor items | **Mostly open** | **Fixed:** the N key (the new layer gets "NEW LAYER" and nothing is typed) and the size estimate (now "up to 4.3 MB · 9.0 Mbps max…", and the file was 4.3 MB). **Still open:** the gallery `offsetParent` read every frame plus idle thumbnails while paused (**253 thumbnail renders in 3 s with the stage paused**, `gallery.js:436`); frames-per-loop rounding (2.7 s @ 24 fps → 65 frames = 2.708 s; 3.3 s @ 25 → 83; `core.js:61`); `merge`/`applyLook` `__proto__` pollution (`scene.js:72-79,395-418`); unbounded `bezierCache` (+72 MB for 200k distinct curves, `core.js:198`). |

---

## Bugs found (most severe first)

### N1. "Big Shoulders Display" can never load in Chromium; it ships in 2 curated looks and in Remix (MEDIUM-HIGH, regression)

**What.** Round 2 gave this family an `opsz` axis (`fonts.js:31`), so the css2 query becomes `family=Big+Shoulders+Display:opsz,wght@10..72,100..900`.
- Google returns **HTTP 400** for it. That axis belongs to the newer "Big Shoulders" family; `…Display:wght@100..900` returns 200.
- In multi-family requests Google silently drops the family.
- The `<link>` and the instance `fetch` both fail with CORS errors (a 400 carries no ACAO header).
- The text renders in fallback `sans-serif` everywhere: studio, embeds and exports.

**Where users hit it.**
- The curated looks Cylinder "Paper Column" (`cylinder.js:34`) and Outline Draw "Blueprint" (`outline-draw.js:26`).
- Remix's font pool (`app.js:65`).
- The family is only gated by `OPSZ_OK`, so it works in browsers without `FontFace.variationSettings` and fails in Chrome.

**Evidence.**
- `t01_boot`: the single-family css2 request returns 400.
- `t14_addpreset`: the export note says *"Big Shoulders Display couldn't load (offline?), so a fallback font was used."*
- `t10_ui`: twelve Remix clicks produced 4 console errors and 2 warnings.
- The studio toast blames the user: *"Check your connection"* (`app.js:248`).

**Why tests missed it.** Nothing validates the css2 query of each catalogue family. It is a 10-line check: fetch `TM.fonts.cssUrl([f])` for every family and assert 200 with at least one `@font-face`.

### N2. No timeout on font loading: a hung fonts.googleapis.com means the studio never boots and embeds stay blank (MEDIUM)

**What.**
- `index.html:12` has a render- and script-blocking Google Fonts stylesheet for the UI fonts. While it hangs, `boot.js` never executes: after 8 s `window.TM` is undefined, `readyState` is `loading`, and even a screenshot times out.
- The player awaits `TM.prepare(scene)` with no timeout (`player.js:280`). `injectStylesheet` (`fonts.js:149-168`) and `baseFaces` (`fonts.js:248-269`) also have none. The embed stays in `_loading` with no text and no play button: a solid-colour box (`shots/hang/embed_normal_vs_connectsrc_vs_hung.png`).
- This happens on networks that blackhole Google rather than refuse it: corporate proxies and some countries. The studio's own `withTimeout(TM.prepare, 3000)` (`app.js:210`) never runs, because the page never boots.

**Repro.** Run `t05_varfonts.mjs blocked` (the `cssHung` scenario routes `fonts.googleapis.com/**` and never answers) and `t05c_hang.mjs`.

**Contrast.**
- An outright block or offline degrades gracefully: the export completes in 75 ms with an honest note, and the embed is ready in 207 ms with fallback fonts.
- An 8 s delay just waits: pixel-identical output, with the embed ready at 8.9 s.

### N3. Variable-font instances are never released: about +230 MB RSS from ordinary editing (MEDIUM)

**What.**
- Every instance registers one `FontFace` per unicode-range subset (3–7 per family) and is kept forever. The `instances` Map has no eviction (`fonts.js:175,271-288`).
- `widthFor` rounds to 0.5 % (`fonts.js:185`), so one width-slider drag on Roboto Flex creates up to 253 instances.
- Stack registers a whole width ladder per family: **51** for Science Gothic (`ENGINE.md` says "up to 49"), × 5 subsets.

**Measured (`t05_varfonts growth`, `t05d_rss`, `t05e_rss_control`).** Cycling Stack through the 9 width-axis families gives 1,644 FontFaces. One width drag (25→151) adds 1,277. A Fraunces size drag (opsz auto) brings the total to **2,960 FontFaces**.

| Run | Renderer RSS | FontFaces |
|---|---|---|
| Axis families (the edits above) | **213 → 509 MB (+296 MB)** | 64 → 3,667 |
| Control: same edit count, fonts without axes | 238 → 305 MB (+66 MB) | 64 → 784 |

The JS heap stays near 7 MB, so this is invisible to `performance.memory`. Render cost and font matching don't degrade (Rise 4.1 → 3.5 ms; 2,000 measures 56 → 32 ms).

### N4. Stack "cascade" pops on every loop, including the shipped look "Gothic cascade" (MEDIUM)

`pos = (ph % 1) * (n + 1) - 0.5` (`stack.js:96-100`) is not periodic:
- At p = 0 the bulge sits half a row from row 0, making that row about 51% of the frame height.
- At p → 1 every row is equal (33%).

**Measured.** The seam is **13.7×** the largest ordinary frame step for the look (`stack.js:153`) and 8.9× for `motion=cascade`. Visible in `shots/stack_seam/stack_cascade_frames_117-119_0-2.png`. This is the only pop in my 341-configuration sweep (`t03_seams`). The smoke test only checks default params, so it can't see it.

### N5. Every AV1-in-MP4 file has a placeholder `av1C` box: level 2.0, 4:4:4, no configOBUs (MEDIUM-LOW, conformance)

**What.** The vendored mp4-muxer writes `av1C = 81 00 00 00` when it gets no description (`vendor/mp4-muxer.min.js`; `video.js:36-57` passes none for AV1). That signals:
- `seq_level_idx_0 = 0`, i.e. level 2.0;
- `chroma_subsampling_x = y = 0`, i.e. 4:4:4;
- no sequence-header OBU.

**Measured.** The bitstreams are 4:2:0 at levels 3.1 / 4.0 / 5.0 (ffprobe `level` 5 / 8 / 12). Chrome and ffmpeg ignore `av1C` and play fine.

**Why it matters.** This is exactly the MP4 users get from browsers without an H.264 encoder (this container, so every MP4 I made). The dialog promises playback "in Safari on devices with AV1 hardware", and Apple's stack is the kind of strict demuxer that reads `av1C`.

**Side note.** For 1080p60 the encoder writes `seq_level_idx` 8 (4.0) although TYPOMAN correctly asks for 4.1 (`av01.0.09M.08`). That one is Chrome's encoder, not TYPOMAN.

### N6. Silent wrong letterforms when the fonts CSS can be linked but not fetched (CSP `connect-src`) (MEDIUM-LOW)

**What.** With `fetch` to fonts.googleapis.com blocked but `<link>` allowed, the instance can't be built:
- `fonts.js:262-266` falls back to the base family with only a `console.warn`.
- `X.ensureFonts` checks only the base family (`frames.js:322-332`).

**Result.** wdth 40 draws at wdth 100 and Fraunces gets browser auto-opsz. 5.4% of pixels differ, and **`notes` is empty**. The embed shows the wide face with no indication (middle panel of `shots/hang/embed_normal_vs_connectsrc_vs_hung.png`). This is a realistic configuration for sites that embed the player.

### N7. A decompression bomb still allocates about 139 MB before rejection (MEDIUM-LOW, see B5)

**Repro.** `t08b_bomb.mjs`: `TM.Scene.decode('z'+…)` with 140 MB of spaces deflated to a 190,257-char code.

**Cause.** `pipe()` hands DecompressionStream the whole input as one chunk, so the inflate runs to completion inside the first transform.

**Fix.** Feed the compressed bytes in ≤ 4 KB writes through a `WritableStream` writer, reading between writes. Or use a JS inflate with an output limit.

### N8. Effect stacks: preview ≠ export with no indicator, and export cost up to 4 s/frame with no warning before you start (LOW-MEDIUM, see B2/B8)

**Preview divergence.** Preview vs export is 16.5–50.7 dB for a heavy stack. This contradicts the README.

**Export cost.** The export dialog shows an ETA only after rendering starts. Before that, nothing tells the user that a Kaleido + echo/blur/glow/extrude export at 1080p60 will take about 16 minutes.

### N9. `f.drawLine()` ignores extrude, so the Extrude control is dead on Stack and Melt (LOW-MEDIUM, contract)

**Contract.** `ENGINE.md` golden rule 4 says extrude applies through `drawGlyph()` **or** `drawLine()`.

**Code.** `drawLine` (`renderer.js:195-225`) has no extrude path at all. Melt draws only with `drawLine`. Stack draws rows with its own `drawRow`, which also pokes the private `f._font` (`stack.js:165-190`, `:168`).

**Measured** (`t11_contract`, with-vs-without renders at four times):
- **Stack and Melt ignore Extrude completely.**
- Ribbon ignores palette fills; Kinetic Grid ignores tracking.
- Align is ignored by path-based and centred presets, which is defensible.

### N10. A cold Stack embed takes 13.2 s to its first frame (LOW)

`preset.fonts()` returns the full 51-instance ladder and `TM.prepare` waits for all of it before frame 0 (`stack.js:51-53`, `renderer.js:650-661`, `player.js:280`).

| Cold embed | Time to first frame |
|---|---|
| Variable-font scene (2 instances) | 5.6 s |
| Stack + Science Gothic (51 instances) | **13.2 s** |

The result is pixel-correct (`t05_varfonts cold`). Loading the instances the first frame needs, then the rest, would keep exports exact and embeds fast.

### N11. Project files can install unlimited fonts, persistently (LOW, security hygiene)

**What.** `openFile` → `customFonts.register(data.fonts)` (`font-picker.js:110-121`, `app.js:384`) has no count limit, no confirmation, and no 15 MB size cap (that cap applies only to `addFile`).

**Measured.** A `.typoman.json` carrying 40 small valid fonts installed all 40 into IndexedDB, and **they come back on every reload** (`t08_hostile`, `fontPersist`).

**What held.** Prototype keys, invalid JSON, 200k-deep nesting, 60 garbage fonts and a 24 MB file were all handled gracefully.

### N12. Sanitiser type confusion: `preset: ["wave"]` survives `normalize`, encode/decode and `minify` (LOW)

`TM.getPreset(s.preset) ? s.preset : …` (`scene.js:175`) accepts any value whose string coercion is a preset id. The studio works because property keys coerce to strings (`t15_typeconf`), but the schema promise ("whitelists enums") is broken. The fix is to require `typeof === 'string'`.

### N13. `TM.Scene.merge` and `applyLook` still pollute `Object.prototype` (LOW, latent; R1 B9)

**Repro.** `TM.Scene.merge({}, JSON.parse('{"__proto__":{"x":1}}'))` sets `({}).x === 1`. The same holds for `applyLook` with a hostile look (`t08_hostile`).

**Reach.** Not reachable from URLs today: looks come from preset code, and every URL, attribute and project path tested clean. It is still a public API.

### N14. Minor items

- **Bidi:** multi-word LTR runs inside RTL lines are reversed (B3 remainder).
- **Bend-aware spacing over-opens at the valley** of the default wave. "TY  PE" and "MOTIO N" split with word-sized gaps (`shots/res/path-flow_valley_zoom.png`, `path.js:234`).
- **Frames-per-loop rounding:** non-integer duration × fps hitches at the loop point (`core.js:61`).
- **Misleading copy:** a bad catalogue query is reported as "offline?" (`run.js:281`) and "Check your connection" (`app.js:248`).
- **Gallery CPU:** idle thumbnails animate while the stage is paused (84 renders/s) (`gallery.js:436`).
- **Dead code:** ESLint finds 11 genuinely unused locals (renderer `TAU`; lens `DEG`, `W`; path-draw `Lp`; path-flow `ctx`; shutter `clamp`, `b`; split-flap `ctx`; strobe-cut `clamp`; plus one unused disable directive). `labs/` (168 KB) still deploys with the site (`pages.yml` uploads `.`).
- **Browser-level, informational:** after any gradient fill on a canvas, later grain-pattern fills on *that* canvas differ by up to 2 levels in about ⅓ of pixels. Other canvases are unaffected, and so is everything without grain. Exports use a fresh renderer, so they are deterministic.

---

## 1. Motion Craft (MC): 7.0

**Evidence.**
- **Loop seams are close to flawless.** My sweep covered 29 presets × (defaults + all 82 looks + every select option + flipped toggles + max cycle counts) = **341 configurations** at 480×270 (`t03_seams`). Only Stack cascade (N4) has a seam larger than 1.5× the largest ordinary step.
- **Integer snapping** makes URL-borne fractional cycles safe (38 params, all ≤ 1.04×).
- **Timing control:** easing library (signature béziers, three springs, bounce/elastic, custom cubic-bézier), 7 stagger orders, `TM.P.sequence` in→hold→out, and per-layer delay / ×1–8 cycles / play-once-and-hold. The smoke test verifies the timing semantics.
- **Path keyframes A→E** render in both modes with seamless loop seams (seam step 3.5–5.5 vs median 3.7–5.4).
- **Exported files loop cleanly:**
  - the 2-loop AV1 file reaches 38.4 dB between loop 1 and loop 2 frame 0;
  - Rise's last frame → frame 0 is clean (`shots/rise_1080p60_loop_237-239_0-2.png`).

**Weaknesses.**
- The Stack cascade pop (N4), which ships in a curated look.
- Closed↔open morph jumps (B7), also mid-sequence in A→E keyframes (up to 2.6× the median step).
- Non-integer frames per loop.
- I verified mechanics and data, not the hand-animated feel; the Art Director's eye decides that part.

**Change since R1:** +0.5. B1 no longer corrupts Rise, the default reveal; B6 is fixed; there are 12 new presets and per-layer timing.

**+1 band (to 8):**
- Make cascade periodic: wrap `pos` modulo `n + 2w`, and draw the bulge entering from off-stack.
- Fix the closed↔open morph (resample both to the same closure and cross-fade the seam over the last 5%).
- Fit frames per loop to an integer.
- Add an automated seam sweep over every look and option in CI (my `t03` takes about 60 s).

## 2. Typographic Quality (TQ): 7.0

**Evidence.**
- **Width and optical size really change the letterforms and stay resolution-independent.** This is the strongest new engineering in the round (`t05_letterforms`).
  - Roboto Flex "Hamburg" at 100 px: ink width **261 → 519 px** from wdth 25 → 151 (monotonic).
  - Fraunces opsz 9 → 144 at the same px: 447 → 370 px wide; ink area 10,090 → 7,040.
  - Pinning is real. The base family's advance per px drifts **17.6%** between 40 and 162 px (browser auto-opsz). The pinned instance holds at exactly 3.7405 at every size.
  - Whole scenes scale exactly: ink widths at 540/1080/2160 render sizes come out at **2.000× and 4.000×**.
  - Instances are chosen from the scene size, not the render size: the 1920×1080 scene → `~o144`, the 640×360 scene → `~o48`.
- **Stack's width-axis rebuild works:** tall rows condense and short rows expand with true letterforms (`shots/stack_seam/…`).
- **RTL lines are fixed** and kerning is preserved (prefix measuring).
- **Custom fonts** work in exports and the standalone HTML.

**Weaknesses.**
- N1: one catalogue family is broken in Chromium and silently replaced by `sans-serif` in two curated looks and in Remix.
- Bidi multi-word LTR runs are reversed.
- Bend-aware spacing opens visible holes at tight valleys.
- 400 characters still don't auto-wrap.
- The width-axis effect depends on the CSS `fetch` being allowed (N6).

**Change since R1:** +1.0. B1 and B3 are fixed; there are real variable axes beyond weight; Stack is no longer distortion-only.

**+1 band (to 8):**
- Validate every catalogue css2 query in CI and fix Big Shoulders (drop `opsz`, or switch to "Big Shoulders").
- Do proper bidi (`Intl.Segmenter` by word plus UAX#9 level runs, or keep LTR runs as one cluster).
- Cap the bend-aware extra room to about 0.35 em per gap.
- Add max-width auto-wrap.
- Surface a visible warning when instances can't be built.

## 3. Path Control (PC): 7.5 (provisional)

**Evidence (engine and API).**
- **Path keyframes:** up to 4 keys after A (`MAX_KEYS`), ping-pong or cycle, a per-step ease, and a sanitised `keys[]` (`scene.js:127-141`). They render and loop.
- **Bend-aware spacing:** `path.offset(d).spaced(h)` exists and is used by Path Flow and Draw On.
- **Off-frame nodes:** the sanitiser allows x, y in [−1, 2] for off-frame points.
- **Paths re-fit on aspect changes**, per a team commit, which I didn't verify.
- **Editor UI:** I opened it with `P` and saw the pen/draw tool buttons in the inspector, but didn't drag handles. That judgement belongs to the Motion Designer.

**Weaknesses.** Closed↔open morphs still pop (B7); spacing over-opens at tight concave bends (N14); 96 nodes max.

**Change since R1:** +0.5 (pen tool, off-frame handles and A→E keyframes, per the code).

**+1 band:**
- Fix the closed↔open transition.
- Add arc-length-matched morph correspondence, so letters don't slide during a morph.
- Add a curvature-limited spacing compensation with a cap.
- Add numeric per-node entry, and make keyframe timing positions editable (not equal shares).

## 4. Creative Range & Originality (CR): 7.0 (provisional)

**Evidence.**
- **Inventory verified:** 29 presets in 6 categories and **82 curated looks** (`t01_boot`, 3 per preset plus 4 for Stack), with an Inspiration view and Remix with locks.
- **Genuinely fresh mechanics:**
  - Zoom Through finds each letter's counter by rasterising and flood-filling it in `setup`, so the camera really threads the hole.
  - Stack on the width axis.
  - Kaleido, Focus Pull's depth pyramid, Melt.
- **Effects combine.** The studio now plays heavy stacks at 23–27 fps instead of 6.

**Weaknesses.**
- Two of the 82 looks render in the wrong font (N1).
- One look pops at its loop (N4).
- Heavy stacks still take minutes to export, which discourages the stacking that makes looks distinctive.

**+1 band:**
- Fix the broken looks and add a CI pass that renders every look (seam, font load, non-blank).
- Add per-glyph animated width/opsz (today the axes are per row or per layer).
- Add texture/mask fills.

## 5. Export & Embed (EE): 7.5

**Verified exports.** Each was produced by `TM.Export.run`, saved through a real download, probed with `ffprobe -count_frames`, decoded with ffmpeg (libvpx for alpha) and compared with `TM.Export.referenceFrame` (`validate.py`, `logs/validate*.json`).

| Output | Codec / container | Frames (file / plan) | Duration | Fidelity vs `render(t)` |
|---|---|---|---|---|
| MP4 720p30 | AV1 `av01.0.05M.08`, fast-start (ftyp → moov → mdat) | 120/120 | 4.000 s | Y 35.6–39.2 dB (RGB 31–33: flat #0015ff decodes as #0014f9) |
| MP4 1080p60 (Rise) | AV1 `av01.0.09M.08` | 240/240 | 4.000 s | Y 43.6–45.2 dB |
| MP4 2 loops @ 24 | AV1 | 192/192 | 8.000 s | Y 37.9–38.6 dB; loop-2 vs loop-1 frame 0: 38.4 dB |
| MP4 4096×1756 (21:9 "4K") | AV1 level 5.0 | 120/120 | 4.000 s | Y 41.2–43.2 dB |
| MP4 2.7 s loop @ 24 | AV1 | **65** (exact 64.8) | 2.708 s | Y 42.5–43.6 dB; loop length is off by 8 ms |
| WebM 720p30 | VP9 `vp09.00.31.08` | 120/120 | 4.000 s | Y 35.3–41.6 dB |
| WebM 1080p60, variable-font scene | VP9 level 4.1 | 240/240 | 4.000 s | **Y 59.0–65.6 dB** |
| WebM, seconds mode 3.3 s | VP9 | 99/99 | 3.300 s | Y 38.0–39.6 dB |
| WebM, heavy stack | VP9 | 120/120 | 4.000 s | Y 41.0–43.5 dB (91 s to export at 720p30) |
| **Transparent WebM** | VP9 + sidecar alpha, `alpha_mode=1` | 120/120 | 4.000 s | Alpha 48–71 dB; transparent fraction **identical** to the reference (0.9291 vs 0.9291); opaque interior 43–45 dB RGB, 49–52 dB Y |
| GIF 360p25 | GIF89a, NETSCAPE loop 0 | 100/100 | 4.00 s | 58.5 dB |
| Transparent GIF | GIF89a, 1-bit alpha | 75 stored, 25 merged | 4.00 s | Colour 56–58 dB; alpha is 1-bit by design |
| PNG 1080, variable fonts | PNG | 1 | — | **bit-exact** |
| PNG 4K transparent | 3840×2160 RGBA | 1 | — | **bit-exact**, 256 alpha levels |
| PNG sequence 720p30 (Stack, 51 instances) | store-only ZIP, 120 PNGs + README | 120 | — | `testzip` OK; frames 0/45/119 **bit-exact** |

The transparent-WebM RGB figure is 25–27 dB over all opaque pixels. That comes from a 1 px chroma fringe where opaque text meets a coloured glow or shadow (4:2:0 with straight alpha), a codec limit, not a bug.

**Codec negotiation.** The code is unchanged from R1 and still correct:
- H.264 High → Main → CBP → Baseline, with levels 3.1 / 4.0 / 4.2 / 5.1 / 5.1 / 5.2 for 720p30 → 2160p60, each probed with `isConfigSupported`.
- Here all four fail, AV1 wins, and VP9 stays as the runtime fallback.
- The dialog's copy is honest and specific ("This browser can't encode H.264, so this MP4 uses AV1… QuickTime, older Safari and many editors can't open it").
- **But see N5**: the AV1 MP4's `av1C` is a placeholder.

**Progress and cancel.**
- The UI status ticks every ~150 ms with frame / total, fps and ETA, then "Finishing the file…" (`t10_ui`). A WebM 1080p60 export took 12.6 s.
- API cancel latency is **0–63 ms** (WebM 1080p60 after 41 frames, MP4 4K after 23 frames, PNG sequence 4K after 15 frames).
- In the UI, cancel can take up to one frame of work (3.05 s at 4K PNG sequence, while still on frame 0).
- Exports work after five cancels in a row.

**Cold pages and fonts.** A cold-page PNG export and a cold-page PNG sequence of the variable-font and Stack scenes are **pixel-identical** to warm renders, so instances load before frame 0. Offline is handled honestly (note plus fallback). Hung fonts (N2) and fetch-only blocks (N6) are not.

**Embeds** (`t09_embeds`, `t09b_iframe_hidden`):
- `<typoman-player>` on a foreign origin loads the engine from its own URL with **no CORS headers**, with no console errors.
- **The variable-font player is pixel-identical** to the reference (0 of 230,400 pixels differ).
- `autoplay loop controls` wraps (t = 1.1 at 4 s on a 3 s loop).
- `autoplay` without `loop` fires `ended` at 3.0 s and shows the play button; no `autoplay` shows the poster.
- The iframe posts `ready` to the parent with the right origin and duration, and obeys pause and seek via postMessage.
- Hidden documents give **0 renders** and frozen time (iframe, web component and studio stage and gallery); offscreen gives 0 renders; both resume.
- `prefers-reduced-motion` suppresses autoplay.
- The standalone HTML runs from `file://`: ready in 430 ms, 10 inlined scripts, and the frame at 1.5 s is **pixel-identical**.
- A cold Stack embed needs 13.2 s for its first frame (N10).

**Change since R1:** ±0. The pipeline is byte-identical. The new font instances integrate correctly into every export and embed path, but this round surfaced the `av1C`, font-hang, CSP and cold-start issues.

**+1 band (to 8.5):**
- Write a correct `av1C` (build it from the first keyframe's sequence-header OBU) and validate MP4s in CI with ffprobe frame counts plus `av1C` vs bitstream.
- Add a font-load timeout (for example 4 s, then render with fallbacks and re-render when fonts arrive) in the player, the studio boot (non-blocking UI-font CSS) and the export (with a note).
- Show a "draft preview" badge when caps apply, plus a one-click "preview at export quality".
- Fit frames per loop to an integer.
- Lazy-load Stack's ladder beyond the rows that frame 0 uses.

## 6. Studio UX & Visual Design (UX): 7.0 (provisional)

**Evidence from the flows I drove (`t10_ui`).**
- **Export dialog:** live preview, codec card with plain-language playback notes, an honest "up to" size estimate, a progress bar with ETA, cancel, "Download again" and "Copy `<video>` tag".
- **Share dialog:** iframe, web component, HTML and links, with autoplay/loop/controls/transparent/fit toggles, a reduced-motion note and the custom-font warning.
- **Keyboard:** N creates a layer correctly, Space toggles playback, Shift+→ steps 10 frames.
- **Adaptive preview** keeps heavy stacks interactive (23–27 fps).
- **Loading:** a "Loading fonts…" hold with a 3 s timeout at boot (`app.js:210`).

**Weaknesses.**
- No indicator that the preview is a draft (B8).
- The Extrude control silently does nothing on Stack and Melt (N9).
- A failing catalogue font produces a "Check your connection" toast that blames the user (N1).
- Gallery thumbnails burn CPU while paused.
- The studio is a blank page while Google Fonts hangs (N2).

**+1 band:**
- Add a draft-preview badge, plus an export-time estimate before you click Export for heavy stacks.
- Disable or hide controls a preset ignores, from a per-preset `supports` list.
- Make font-failure copy accurate.
- Load UI fonts non-blocking.

## 7. Performance & Robustness (PR): 7.0

**Good.**
- **Render cost at 1080p** (forced raster flush, median over the loop; `t06_engine`):
  - every plain preset is **1.7–4.8 ms** (p95 ≤ 8.4 ms), comfortably inside 60 fps;
  - "heaviest" Focus Pull is 4.7 ms.
  - Studio default playback holds 60 fps at about 1 ms/render.
- **Determinism:** 420/420 frames identical across processes. Fresh vs warmed-and-poisoned renderers differ only by the browser's ±2-level grain quirk.
- **Edge cases: 667 of 667 with 0 exceptions and 0 console errors.** Inputs: empty, spaces, emoji (ZWJ and flags), 400 characters, a 400-character word, 40 lines, Arabic, Hebrew, bidi, CJK, Devanagari, combining marks, size 0.01 and 1.5, tracking −0.3/2, slant 30, and 64×4096, 4096×64, 3:1 and 9:16 frames (`t07_edges`).
- **Hostile input** (`t08_hostile`): **no XSS, dialogs or prototype pollution** through embed hashes, the studio hash, raw-JSON hashes, `<typoman-player>` attributes (`bg`, `fit`, `start=1e308`, a 500 KB `scene`), postMessage, or project files.
  - Giant numbers clamp (size 4096×64, duration 60, echo 12).
  - Arrays cap (6 layers, 96 nodes, 8 palette entries, 4 keys).
  - Text is cut to 400 and names to 60.
- **Memory:** JS heap flat at 9–11 MB over 150 preset switches, 150 look applications and 20 exports. RSS is flat across exports (396 → 394 MB). Canvas and DOM counts are stable.
- **Pausing:** the hidden tab, offscreen and paused stage all render 0 frames on the stage.

**Bad.**
- **Console errors in normal flows:** applying 2 curated looks or Remixing onto Big Shoulders logs 2–4 errors (N1). That contradicts the 7 anchor ("no errors in normal flows") and is the main reason this isn't 7.5.
- **No font timeout** (N2): blank studio and blank embeds while Google hangs.
- **Native memory growth** from FontFace instances (N3): about +230 MB, never freed.
- **The decompression bomb still allocates about 139 MB** (N7).
- **Heavy stacks export at 0.15–4 s/frame.**
- Loop pop in Stack cascade (N4); closed↔open morph (B7).
- **No perf budget:** the smoke test prints `ms@1080` but never fails on it.
- **The adaptive controller under-measures:** it times only the `render()` call. Heavy Path Flow measures about 20 ms (EMA) while the stage actually runs at 24 fps (about 42 ms/frame), and heavy Focus Pull sits at 19–31 fps without ever adapting, because its EMA of 20–31 ms stays under the 34 ms threshold.

**Change since R1:** +0.5. B1, B3 and B6 are fixed, B2 is largely fixed, and the new problems are smaller in scope.

**+1 band:**
- Fix N1 and N2 (timeouts plus non-blocking UI fonts).
- Add an LRU for instances that also removes their FontFaces.
- Use a streaming inflate with a real memory cap.
- Time `render()` including the flush for adaptivity.
- Add a perf budget that fails CI (flush-inclusive, per preset, plain and with a heavy stack).

## 8. Engineering Quality (EQ): 7.5

**Good.**
- **Clean split:** the engine and presets reference no studio code (`grep` finds only a comment), the export module never touches `TM.Studio`, and `player.js` has 0 studio references. One manifest (`boot.js`) drives the studio, the iframe, the web component and the standalone exporter.
- **The variable-font design is genuinely good:** instances are invisible to presets ("presets see none of this"), pinned to scene resolution, and loaded through an optional `preset.fonts()` hook before frame 0. It is verified end to end above.
- **Very little copy-paste:** jscpd (≥ 50 tokens / 5 lines) finds **0.42% duplicated lines** across 15,668 lines of JS: presets 0.71%, engine 0%, studio 0.1%.
- **ESLint finds 0 errors** (`no-undef` clean); 11 dead locals.
- **Adding a preset is easy and safe:**
  - a 13-line preset written only from `ENGINE.md` registered, rendered and exported;
  - its params were sanitised from a hostile scene by its own schema (cycles 2.6 → 3, height 9 → 1);
  - shipping it needs one file plus one manifest line, and tests, the gallery and the standalone exporter pick it up from the manifest (`t14_addpreset`).
- **Tests:** CI runs the smoke suite (12 s here, all 29 presets pass). New regression checks cover two-line font integrity, timing semantics, width/opsz pinning and Stack margins.

**Bad.**
- **The test suite still doesn't look at what users get.** R1's second priority is unaddressed: no export validation (frame counts, PSNR, container boxes), no embed or cross-origin test, no UI flow test, no network-failure test, no look/option seam sweep, no css2 query check, and no flush-inclusive perf budget. Each of N1, N4 and N5 would have been caught by a short automated check.
- **Contract drift:**
  - `drawLine` lacks the extrude that `ENGINE.md` promises (N9);
  - Stack writes the private `f._font` and bypasses the drawing helpers;
  - the doc's "up to 49" ladder is really 51.
- **Structural duplication:**
  - two kits split by team ownership (PathKit and MotionKit) rather than by function;
  - timing normalisation implemented three times (`f.seq`, `MotionKit.windows`/`seqAt`, a private copy in `path-land.js:137-139`);
  - the new `f.buffer()` API is used by 1 of the 29 presets (Melt), while 6 keep private scratch canvases (Flip, Focus Pull, Glitch, Shutter, Zoom Through, and a module-level pool shared across renderers in `spotlight.js:13-27`);
  - the stage re-implements the renderer's layout and fit logic for hit-testing (`stage.js:186-192` vs `renderer.js:299-318`).
- **Lifecycle and sanitiser gaps:** no eviction for font instances; `facePromises.clear()` at an arbitrary 600; type confusion in `normalize` (N12); `merge` pollution (N13); bomb memory (N7).
- **Deploy:** `labs/` still deploys, and the README still claims exact preview/export equality.

**Change since R1:** ±0. Real improvements (B1's fix with a regression test, the instance architecture, near-zero copy-paste in a codebase that grew by 5,400 lines) are offset by unaddressed R1 asks: the test suite, context isolation, `merge`, `labs/`.

**+1 band (to 8.5):**
- An export/embed CI job: WebCodecs VP9/AV1 headless, ffprobe frame counts, PSNR vs `referenceFrame`, `av1C` check, cross-origin player pixels.
- A look/option seam sweep and a css2 validator.
- A `supports` list per preset, enforced by a with-vs-without test.
- One shared kit, with `f.buffer` adopted.
- Instance LRU.
- Drop `labs/` from the deploy.

---

## Top engineering priorities for Round 3 (ranked)

1. **Make the font layer fail safe.**
   - Add a timeout around every font load (`injectStylesheet`, `baseFaces`, `ensure`, `TM.prepare`): render with fallbacks after about 3–4 s and re-render when fonts arrive.
   - Make the studio's UI-font `<link>` non-blocking (`media="print" onload`, or self-host).
   - Add an export note and an embed console warning when an instance falls back (N2, N6).
2. **Validate the catalogue in CI and fix Big Shoulders Display.** Fetch each `cssUrl([f])` and require 200 plus at least one `@font-face`. Fix N1 by dropping `opsz` or switching to "Big Shoulders". Make the error copy accurate.
3. **Bound font-instance memory.**
   - Add an LRU over `instances` that deletes their FontFaces (`document.fonts.delete`), keeping only the current scene's instances plus a small cache.
   - Coarsen the width steps a slider can create (for example 2.5% stops while dragging, exact on release).
   - Lazy-load Stack's ladder: the frame-0 rows first, the rest in the background (N3, N10).
4. **Export/embed CI job.** Run headless WebCodecs exports of VP9, AV1 and GIF and assert:
   - ffprobe frame counts and durations;
   - PSNR against `referenceFrame`;
   - the `av1C` box matches the bitstream (and fix N5 by building `av1C` from the sequence-header OBU);
   - transparent fraction;
   - the cross-origin `<typoman-player>` pixels.

   My `t02`/`validate.py`/`t09` scripts are a ready starting point.
5. **Seam and contract sweeps in the smoke test.**
   - Every look plus every select and toggle option (catches N4).
   - A per-preset `supports: { extrude, palette, tracking, align }` declaration, with a with-vs-without test (catches N9).
   - Implement extrude in `drawLine`, or declare the gaps and hide the controls.
6. **Real memory caps on untrusted input.**
   - Streamed inflate with ≤ 4 KB writes, so the 1 MB cap bounds memory (N7).
   - Cap raw-JSON hash and attribute length.
   - `typeof` checks for enum and id fields (N12).
   - `merge` skips `__proto__`, `constructor` and `prototype` (N13).
   - Limit, size-cap and confirm fonts imported from project files (N11).
7. **Close the preview/export gap for effect stacks.**
   - A draft badge when caps apply.
   - Render at full quality when paused.
   - Glyph-sprite caching for echo and extrude (one raster per glyph and weight instead of 28–64 `fillText` calls).
   - Flush-inclusive frame timing for the adaptive controller (B2, B8).
8. **Housekeeping.**
   - Closed↔open morph (B7) and integer frames per loop.
   - Bidi LTR runs inside RTL lines.
   - Cap bend-aware spacing.
   - Pause gallery idle thumbnails when the stage is paused.
   - Bound `bezierCache`.
   - Merge PathKit and MotionKit into one kit, adopt `f.buffer`, and delete the private timing copies.
   - Fix the 11 dead locals and the "up to 49" doc line.
   - Stop deploying `labs/`.
