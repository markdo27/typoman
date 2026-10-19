# TYPOMAN Round 1: Creative Technologist report

**Snapshot:** commit 3f7aecb, served from `bench/round-1/app/` (static, no build step).
**Environment:** headless Chromium 141 (software raster) driven by Playwright; ffmpeg/ffprobe 6.1.
**Test files:** scripts, raw JSON, screenshots and exported files are in `bench/round-1/creative-technologist/` (`t01`–`t09*.mjs`, `validate.py`, `exports/`).
**Cross-origin setup:** :8723 was still occupied by my earlier app server after the container restart, so the cross-origin host page ran on :8733. It loaded `player.js` from :8713, so the test is still genuinely cross-origin.

## Scores

```json
{"MC":6.5,"TQ":6,"PC":7,"CR":6.5,"EE":7.5,"UX":7,"PR":6.5,"EQ":7.5}
```

Mean 6.81, so the overall band is **7.0**.

**Headline.** The export and embed pipeline is close to pro grade:
- Every format has exact frame counts and correct H.264 level logic.
- Transparent WebM is verified, and the PNG and ZIP outputs are bit-exact.
- Embeds pass hostile fuzzing and work cross-origin.

It is held back by one engine bug that breaks the core "a frame is a pure function of (scene, t)" contract. **Rise** (the default reveal, and the preset "Add layer" uses) and **Split-flap** draw glyphs in the canvas default `10px sans-serif`, depending on leftover context state. As a result the **downloaded MP4 differs from the studio preview**.

---

## Bugs found (most severe first)

### B1. Rise and Split-flap render glyphs in `10px sans-serif`; preview ≠ export; non-deterministic (HIGH)

**Root cause.**
- `Frame._setFont` (`js/engine/renderer.js:123-125`) caches the current font in `f._font`.
- `rise` sets the font inside a per-line `ctx.save()/clip()/restore()` (`js/presets/rise.js:27-47`), and `split-flap` does the same (`js/presets/split-flap.js:240-254`).
- `restore()` reverts `ctx.font`, but the cache still holds the old value. Later `drawGlyph` calls skip `ctx.font = …` and draw in whatever font the shared layer buffer `_lctx` happened to hold.
- On a fresh renderer that font is `10px sans-serif`. On a warmed renderer it is whatever the previous preset or layer left behind.

**Evidence.**
- *Real UI flow.* Studio → Rise → text `TYPE IN⏎MOTION` → Export → MP4 1080p60. The downloaded file's frame 96 shows "MOTION" as tiny spaced-out 10 px letters (`exports/ui_mp4_f96.png`). The stage shows it correctly (`ui_rise_multiline_stage.png`), because the stage context had inherited Anton from Path Flow. The export dialog's own preview shows the bug (`ui_export_dialog.png`).
- *Sequential export loop* (`t09_exportfont.mjs`): 2-line Rise has wrong-font glyphs in **94/120** frames; Split-flap (single line) in **9/120** frames (first at frame 5).
- *Cross-load determinism* (`t02_determinism.mjs`): 17 presets × 3 variants × 5 times, rendered in two browser processes, the second in reverse order with warmed caches. **245/255 frames are identical; all 10 differing frames are rise or split-flap.** The bisect (`t02b`) shows the effect even for rise → rise on the same renderer, so the bug is carried state, not preset order.
- *Context-state probe* (`t02d_fontleak.mjs`, layer ctx default font vs pre-set font): only these two presets are affected. Rise: 19/24 frames differ (22/24 with echo). Split-flap: 11/24, even with single-line text.

**Why the tests missed it.** `tests/smoke.mjs` only renders twice on fresh renderers in one page, and `TM.Export.referenceFrame` also uses a fresh renderer. Both reproduce the bug instead of detecting it.

**Repro (engine).** `const r = new TM.Renderer(c); r.resize(640,360); r.setScene(TM.Scene.normalize({layers:[{preset:'rise',text:'TYPE IN\nMOTION'}]})); r.render(1.237)`. Line 2 is 10 px sans-serif (`det_rise_1_237_fresh.png`).

### B2. Heavy effect stacks collapse frame rate, with no adaptive fallback in the studio (MEDIUM)

The stack is echo 6 + blur 0.5 + glow 1 + extrude 0.6 (+ shadow, grain, vignette in the engine benchmark).
- Engine at 1080p: **120–1347 ms/frame at preview quality** and **209–3416 ms/frame at full quality** (path-flow 1044/3256, tunnel 1347/3416).
- Studio at 744×419: **6 fps** (119 ms/render) (`t06`).
- Cause: costs multiply (echo passes × blur sub-frames × 28–64 extrude `fillText` calls per glyph). The embed player degrades to preview quality after 20 slow frames, but the studio never adapts.

### B3. RTL scripts are broken (MEDIUM)

Arabic and Hebrew are laid out per grapheme in logical order, left to right. They come out reversed, and Arabic loses its joining forms (`shot_rtl_rise_cmp.png`, with the native reference underneath). Devanagari and ZWJ emoji are correct (`shot_devanagari_rise_cmp.png`, `shot_emoji_pop_cmp.png`).

### B4. Custom fonts are silently dropped in iframe and web-component embeds (MEDIUM)

- Export PNG uses the uploaded font (diff vs referenceFrame 0; vs Anton 2.4%).
- The standalone HTML embeds it (256 KB).
- `embed.html#c=` falls back to **Anton**.
- The share dialog never warns; the only note is in the font picker (`js/studio/font-picker.js:23`, `share-dialog.js` has no custom-font check) (`t07`).

### B5. Decompression bomb in `TM.Scene.decode` (LOW–MEDIUM)

The 1 MB limit is checked after a full inflate (`js/engine/scene.js:314-317`). A 190 KB `#c=` code (below `MAX_ENCODED`) inflated **140 MB** in the embed: heap 164 MB vs about 3 MB normally, before the error UI appeared (`t04`). Raw JSON in the hash (`#c={…}`) also skips `MAX_ENCODED` (`player.js:268`).

### B6. Sanitiser ignores param `step`, so URL or project scenes can break loops (LOW)

- `path-flow speed: 0.5` survives `normalize`, giving a loop-seam ratio of **13.9** (default 0.96).
- `waveSpeed: 1.5` gives a ratio of 5.9 (`t07`).

### B7. Closed→open path morph pops at the loop point (LOW)

Circle→line gives seam ratio 2.58 (circle→heart 1.01). `TM.Path.morph` switches from a closed path to open (`a.closed && b.closed`) between p=0 and p=ε, and path-flow changes its repeat spacing (`js/engine/path.js:1236-1249`).

### B8. Preview quality ≠ export quality (LOW, but contradicts the README)

The stage uses `quality:'preview'` (4 blur samples, ≤ 28 extrude steps). Exports use `'full'` (4 + 12·blur samples, ≤ 64 steps). Measured PSNR between them is **34.0–60 dB** (path-flow blur 1.0 → 34 dB). This contradicts the README claim that exports "match the preview exactly".

### B9. Minor items

- The gallery `tick` reads `offsetParent` every frame, about 55 reads/s (`js/studio/gallery.js`). Combined with transform writes this forces 60 style recalcs/s, plus about 14 layouts/s from the timecode. The cost is only about 3 ms/s each, so this is cheap.
- Gallery idle thumbnails keep using about 100 ms/s of script time even while the stage is paused.
- A non-integer frames-per-loop setting produces a slightly wrong loop length: 2.7 s at 24 fps gives 65 frames = 2.708 s (`js/export/core.js:61`).
- `TM.Scene.merge` (`scene.js:68`) is open to `__proto__` pollution. It is currently called only without untrusted input (`store.js:242`).
- `bezierCache` (`core.js:198`) never evicts, so dragging the curve editor grows it slowly.

---

## Criteria

### 1. Motion Craft: 6.5

**Evidence.**
- Easing library: signature cubic-béziers (glide, snap, overshoot, anticipate), damped springs, bounce, elastic, and a custom cubic-bézier (`core.js:146-196`).
- 7 stagger orders and shared in→hold→out sequencing (`TM.P.sequence`, `f.seq`).
- Corner-safe tangent smoothing on paths (prefix-sum windowed angle, `path.js:108-182`).
- Motion blur by sub-frame sampling.
- Loops:
  - The smoke test passes all 17 presets (seam ratio 0–1.95).
  - With echo 4 + blur 0.5, every preset stays at ratio ≤ 2.6 with small absolute seams.
  - Closed-path travel is seamless (0.01).
  - "In → Hold" pops by design (64×) and is labelled.

**Weaknesses.** B6 and B7 loop pops. Rise, the bread-and-butter title move, is visually broken for multi-line titles in exports (B1). I verified the mechanics, not the hand-animated feel.

**+1 band:** fix B1, B6 and B7; snap cycles to integers in the sanitiser; add per-preset overshoot and settle defaults reviewed by a motion designer.

### 2. Typographic Quality: 6

**Evidence.**
- 50 curated Google families, including variable weight axes (`fonts.js:13-70`), all loading in the container.
- Kerning preserved by measuring line prefixes (`text.js:66-75`).
- Multi-line, align, tracking, leading, case and slant.
- Grapheme segmentation keeps ZWJ emoji and Devanagari intact.
- Custom font upload (≤ 15 MB, kept in IndexedDB) works in PNG export and standalone HTML.

**Weaknesses.**
- B1: wrong-font glyphs in two presets.
- B3: RTL is reversed and unjoined.
- 400 characters on one line shrink to a 3 px band (`t07`: rise ink box 25,134→454,137 at 480×270), because there is no auto-wrap.
- B4: custom fonts are lost in embeds.
- On tight wave crests at 640 px, "IN" momentarily reads as "W" (glyph collision, `embed_crossorigin.png`).

**+1 band:** fix B1; add bidi-aware or whole-line shaping for RTL and complex scripts; add a max-width wrap mode; handle glyph collisions on high-curvature paths (spacing compensation).

### 3. Path Control: 7 (code and API verified; on-canvas editor not driven by me)

**Evidence.** `js/engine/path.js` (1288 LOC) provides:
- Arc-length sampling with caching, exact bounds and nearest-point search (golden-section).
- de Casteljau split, node delete with healing, corner/smooth/mirror kinds, transforms and re-aspecting.
- Freehand fitting (Schneider-style, with corner detection).
- 22 preset shapes (count verified), and A→B morph with best-alignment search.

`js/studio/path-editor.js` (760 LOC) is the on-canvas editor, and undo goes through the store. Paths survive aspect changes (`store.js:139-149`).

**Weaknesses.** B7; the sanitiser keeps only 96 nodes.

**+1 band:** fix the open/closed morph seam and add arc-length-aware morph tweening; per-node numeric entry; path animation beyond A↔B ping-pong.

### 4. Creative Range & Originality: 6.5

**Evidence.**
- 17 presets in 5 categories; some are less template-like (Split-flap, Lens, Tunnel, Cylinder, Draw On).
- 7 combinable effects plus grain and vignette, 12 palettes, Remix with locks, path morph.

**Weaknesses.** Combining effects quickly becomes unusable in the studio (B2: 6 fps), which discourages exactly the stacking that makes looks distinctive.

**+1 band:** make effect stacks real-time (see improvement 3); add signature looks such as per-glyph variable-axis animation beyond weight, and texture/mask fills.

### 5. Export & Embed: 7.5

All files were validated with `validate.py` (ffprobe `-count_frames` plus ffmpeg decode, PSNR against `TM.Export.referenceFrame`).

| Output | Codec / container | Frames | Duration | Fidelity |
|---|---|---|---|---|
| MP4 720p30 | AV1 `av01.0.05M.08` (no H.264 in this Chromium; correct fallback) | 120/120 | 4.000 s | PSNR 35.9–39.8 dB |
| MP4 1080p60 | AV1 level 4.1 | 240/240 | 4.000 s | PSNR 37.8–41.2 dB |
| MP4 2 loops, 24 fps | AV1 | 192/192 | 8.000 s | PSNR 37.7–39.2 dB |
| WebM 720p30 | VP9 `vp09.00.31.08` | 120/120 | 4.000 s | PSNR 36.4–39.3 dB |
| Transparent WebM | VP9 + sidecar alpha (BlockAdditions), `alpha_mode=1` | 120 | — | libvpx decode: alpha PSNR 40.8–48.8 dB; transparent fraction 0.829 vs reference 0.828; opaque colour 47–75 dB |
| GIF 360p25 | GIF89a | 100/100 | 4.00 s | PSNR 44 dB |
| Transparent GIF | GIF89a, 1-bit alpha | 100 | — | alpha agreement 100% |
| PNG | PNG | 1 | — | bit-exact |
| 4K transparent PNG | PNG, 3840×2160 | 1 | — | 256 alpha levels |
| PNG sequence | store-only ZIP, 120 PNGs + README | 120 | — | `testzip` OK; frames bit-exact |

**UI flow:** the dialog produced `type-in-motion-1920x1080-60fps.mp4` with 240 frames.

**Sizing:** sizes are always even and the long side is capped at 4096 (21:9 at 4K → 4096×1756; 4096×64 and 64×4096 handled).

**Cancel:** `AbortError` after 21 frames, in 360 ms.

**H.264 (code review, `js/export/codecs.js`).** The level table matches H.264 Table A-1, including the √(8·MaxFS) dimension rule and the High-profile 1.25× bitrate allowance. Generated codec strings:

| Output | Codec string | Level |
|---|---|---|
| 720p30 | `avc1.64001F` | 3.1 |
| 1080p30 | `avc1.640028` | 4.0 |
| 1080p60 | `avc1.64002A` | 4.2 |
| 1440p60 | `avc1.640033` | 5.1 |
| 2160p30 | `avc1.640033` | 5.1 |
| 2160p60 | `avc1.640034` | 5.2 |

The pipeline around those codecs:
- Profile ladder High → Main → CBP → Baseline, then AV1 → VP9. Each candidate is probed with `isConfigSupported`.
- A runtime encoder failure restarts the export with the next candidate.
- MediaRecorder is the last resort and is labelled honestly.
- `avc.format:'avc'` with mp4-muxer `fastStart:'in-memory'`.
- Keyframe every 2 s, plus `encodeQueueSize` backpressure.
- The dialog explains the AV1 fallback and where it plays.

**Embed:**
- The iframe, the `<typoman-player>` web component (cross-origin verified: engine loaded from the player's own origin, fonts loaded, no errors) and the standalone HTML (custom font embedded) all work.
- The player pauses offscreen and in hidden tabs, and honours reduced motion.

**Weaknesses.**
- B1 breaks "exports match the preview" for Rise and Split-flap.
- B8: preview vs full quality.
- B4: custom fonts lost in embeds.
- H.264 output itself is unverifiable in this container.

**+1 band:** fix B1 and B4; make the preview match the export (or label it a draft); add an automated export check in CI (ffprobe frame count plus PSNR against a poisoned-state reference).

### 6. Studio UX & Visual Design: 7 (lighter evidence; not my lens)

**Evidence.**
- Polished dark pro-tool layout: layers, live preset thumbnails, an inspector with numeric fields, a timeline with frame counter and "seamless loop" label, labelled undo/redo, autosave state, and a phone layout with tabs (`ui_laptop.png`, `ui_phone.png`).
- No console errors and no horizontal scroll at 1440, 1024 and 390 px widths.
- Space toggles playback and Ctrl+Z undoes (verified).
- The export modal is accessible (native `<dialog>`, focus trap) with an honest codec explanation (`ui_export_dialog.png`).

**Weaknesses.** The UI gives no warning or adaptivity when effect stacks get slow (B2) and no custom-font warning when sharing (B4).

**+1 band:** add a frame-cost meter with automatic preview degradation; inline warnings for embed-incompatible choices.

### 7. Performance & Robustness: 6.5

**Good.**
- Default playback at 60 fps in the studio (0.9 ms/render at 744×419).
- Plain presets cost 1.7–5.7 ms/frame at 1080p with a forced raster flush. Echo 6: 2.3–31 ms. Glow 1: 17.5–33 ms.
- Rendering pauses in a hidden tab (0 stage and 0 gallery renders while hidden; resumes afterwards).
- No leaks:
  - Heap 5.6 → 8.8 MB after 170 preset switches (history capped at 150 entries).
  - Heap 5.1 → 7.0 MB over 8 mixed exports.
  - Canvas count stable at 21.
- Zero console errors in every flow I ran.
- Hostile-input fuzz (`t04`; scene `__proto__`/`constructor` keys, script and HTML in text, name and font, CSS injection in colours, 1e308 and NaN numbers, 10k-node paths, 7–10 layers, garbage, oversize, 200k-deep JSON, bad prefixes, empty): no dialogs, no pollution, no DOM injection, everything clamped. Garbage shows a friendly error state.
- The text extremes (empty, spaces, newlines, 400 characters, a 400-character word, ZWJ, RTL, combining marks, CJK) never throw in any preset.
- 6 layers with echo render in 45 ms at 1080p.

**Bad.**
- B1 breaks determinism across loads for 2/17 presets.
- B2: heavy stacks run at 6 fps with no fallback.
- B3: RTL.
- B5: decompression bomb.
- B6: fractional params break loops.

**+1 band:** fix B1 with a regression test; adaptive studio quality; streaming inflate cap; step snapping.

### 8. Engineering Quality: 7.5

**Good.**
- Clean engine/UI split. The engine never touches the studio, and panels talk to it only through the store and registry APIs.
- One manifest (`js/boot.js`) feeds the studio, the iframe, the web component and the standalone exporter.
- Documented preset contract (`docs/ENGINE.md`; the API names are accurate).
- Sanitisation at every trust boundary.
- `referenceFrame` and `frameTime` hooks for verification.
- Pinned, vendored MIT dependencies with licence headers and a provenance README (mp4-muxer 5.2.2, webm-muxer 5.1.4), loaded lazily.
- The WebM alpha writer is its own small module.
- ESLint (`no-undef` / `no-unused-vars`) finds 6 unused locals and 1 implicit global (`TM_READY`) across about 15k LOC.
- CI runs the smoke test.

**Bad.**
- B1 is an architectural flaw: one shared, mutable layer context is reused across layers and presets, and a font cache does not survive `save()/restore()`. No state is reset per pass beyond transform, alpha and composite.
- The test suite missed B1: it checks determinism only within one page, has no export, embed or UI tests, and makes no perf assertions.
- In/out timing normalisation is copy-pasted into 6 presets instead of using `f.seq`.
- 168 KB of `labs/` legacy experiments deploy to Pages.
- The docs claim exact preview/export equality (B8).
- `merge` is open to `__proto__` pollution, and `decode` checks size after inflating.

**+1 band:** per-pass context isolation (wrap `save()`/`restore()` through `f`, or reset font/filter/shadow/dash/letterSpacing per pass); a cross-instance determinism test plus export validation in CI; dedupe timing helpers; drop `labs/` from the deploy.

---

## Top 8 engineering improvements for the next round (ranked)

1. **Fix B1 and make presets context-safe.** Stop caching `ctx.font` across save/restore: always assign it, or route `save()`/`restore()` through `f` so the cache is invalidated. Reset text, filter and shadow state at the start of each layer pass. Add a test comparing fresh vs poisoned-state renderers for every preset.
2. **Upgrade the test suite so it catches what users see.**
   - Cross-instance and cross-load determinism.
   - Export frames vs stage frames.
   - Export validation in CI (VP9/AV1 via WebCodecs headless, ffprobe frame count and PSNR).
   - Embed fuzz and cross-origin tests.
   - Perf budgets that fail the build.
3. **Real-time effect stacks.**
   - Cache glyph sprites per (char, size, weight, fill) and blit them for echo and extrude instead of 28–64 `fillText` calls per glyph.
   - Cheaper motion blur (fewer samples with jitter, or velocity smear).
   - Memoise `_setupFor`'s per-pass `JSON.stringify` key.
   - Adaptive studio preview (resolution or samples) with a frame-cost indicator.
4. **WYSIWYG.** Either render the stage at full quality when idle or paused, or show a "draft preview" badge when blur or extrude is active. Fix the README claim.
5. **Harden the sanitiser.**
   - Snap ranges to `step`, which keeps integer cycles.
   - Streaming inflate with a hard 1 MB cap: abort the `DecompressionStream` reader early.
   - Cap the raw JSON length in `embed.html` and `player.js`.
   - Make `merge` skip `__proto__`, `constructor` and `prototype`.
6. **Text shaping.** Detect RTL and complex scripts and fall back to `drawLine` (native shaping) or bidi-aware glyph ordering. Add a max-width auto-wrap. Add spacing compensation on high-curvature path segments.
7. **Embed fidelity.** Warn in the share dialog when a layer uses a custom font, and steer the user to the standalone HTML (which embeds the font). Optionally allow small fonts to be inlined in the scene.
8. **Housekeeping.**
   - Fix the closed→open morph seam (B7).
   - Fit integer frames per loop (or warn) in `X.plan`.
   - Throttle and stop the gallery idle animation when the stage is paused, and drop the per-frame `offsetParent` read.
   - Dedupe the timing helpers.
   - Move `labs/` out of the deployed tree.
   - Bound `bezierCache`.
