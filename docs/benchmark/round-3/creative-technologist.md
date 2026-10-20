# TYPOMAN Round 3: Creative Technologist

**Lens:** Export & Embed, Performance & Robustness and Engineering Quality weighted most.
**Snapshot:** `f25ca23` (123 commits, 87 files, +11,556 / −907 since Round 2's `3b93646`). Headless
Chromium 141 (software raster), Playwright 1.56.1, ffmpeg 6.1.1, fontTools 4.67.

| MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---|---|---|---|---|---|---|---|
| 7.5 | 7.5 | 8.0 (prov.) | 7.5 (prov.) | 8.5 | 7.5 (prov.) | 7.5 | 8.0 | **8.0** (mean 7.75) |

Round 2 (this lens): MC 7, TQ 7, PC 7.5, CR 7, EE 7.5, UX 7, PR 7, EQ 7.5.

**Headline.** Every Round 2 engineering priority was acted on, and almost every finding is fixed:
`av1C` correct; fail-safe fonts (studio boots in 204 ms with Google Fonts hung, embeds ready in about
3.5 s); flat instance memory; the scene-link bomb costs +0 MB; Stack cascade and closed↔open morph seams
fixed; loop exports span exactly whole loops (verified on decoded files); real export/embed CI. Every embed
route is bit-identical to the reference for all 8 templates, italics, features and axis presets; 56/56
frames identical across two browser processes. What holds the scores back is the new safety-critical code.

## Round 2 findings

Fixed: B1, B3, B6, B7 (circle→line seam 0.90×), N1, N2, N3 (RSS flat over 60 families × italic × 3
feature sets), N4 (0.17× / 0.34×), N5, N7 (rejected in 10 ms, +0 MB), N8, N10 (cold Stack 894 ms), N11–N14.
Mostly fixed: B2 (Assemble "Deep Space" plays at 26 fps without adapting: `_adapt` times an un-flushed
render), B8, B9 (array specs in `bezierCache` unbounded). Partly fixed: N6 (italics and features still fall
back silently under CSP). N9 fixed for Melt/Stack; Particles ignores Extrude, Kinetic Grid ignores tracking.

## New findings (most severe first)

- **F1 MEDIUM-HIGH (safety): the flash detector passes a full-screen 30 Hz strobe at 60 fps** (and 25 Hz
  at 50 fps): the 2-frame tolerance sets both directions and the tie always reads "up". One-line fix
  verified; every other synthetic case unchanged. *Fixed after the round.*
- **F2 MEDIUM: flash analysis aliases on long loops** (capped at 900 frames: a 60 s @ 60 loop is analysed at
  15 fps; Strobe Cut fast-strobe at 40/60 s reads 3.0 vs 3.5 at full rate), averages away inverting
  checkerboards, and `flashes-a.mjs` isn't in CI. Kinetic Grid "Swiss mono" at a 1.5 s loop flashes 4.5/s.
- **F3 MEDIUM (DoS): WOFF zlib bomb in `TM.sfnt.inspect`.** A 1.1 MB `.woff` took the renderer to 3.1 GB.
  Fuzzing (300 variants + 35 crafted files) otherwise found 0 exceptions; names and tags are sanitised.
  *Fixed after the round (capped streaming inflate).*
- **F4 LOW-MEDIUM: under a `connect-src` CSP, italics and OpenType features drop silently** (no export note).
- **F5 MEDIUM (EQ): mutation testing: CI catches 8 of 23 one-line regressions.** Missed: red flashes never
  counted, luminance delta 30 %, alpha bitrate ×0.05, `alphaInvert` as alpha, matte always drawn, transform
  rotation or ease ignored, `text-2…6` ignored, eviction disabled, spring normalisation removed, `sfnt`
  always null, `featureSettings` dropped, italic ignored, draft badge never shown, the N7 fix reverted.
- **F6 LOW-MEDIUM: transform keys scale the finished raster,** so scale > 1 blurs type (edges ~4× softer at ×4).
- **F7 LOW-MEDIUM: Gravity re-simulates on the main thread:** 274 ms–1.6 s first render; 100–199 ms per
  slider step; up to 13 cached sims of up to 14.4 MB.
- **F8 LOW: mattes add a full layer pass** (two layers 13.4 ms → 27.3 ms with a matte; a 6-layer chain
  101 ms); templates are heavy (Glitch Drop 81 ms, Lyric Morph 47 ms, Title Window 40 ms at 1080p).
- **F9 LOW: extreme springs ring 53 times in their window** (`spring(1000,1)`: 106 zero crossings).
- **F10 LOW: alpha is now 43–53 % of transparent-WebM bytes;** CI's 27 dB threshold misses ×0.05 bitrate.
- **F11 LOW: player details:** the settled scrub frame isn't drawn (2.3 % of pixels differ); the iframe
  `progress` uses `1/60`, not `1/fps`; `start` isn't clamped. No XSS through any attribute or URL param.
- **F12 LOW: contract drift:** no per-preset `supports` list; `stack.js:211` writes `f._font`; PathKit and
  MotionKit split; README says exports match the preview "exactly"; ENGINE.md's flash-check timing is stale.

## Evidence by criterion

- **MC 7.5:** sweep 516/516 seamless; 33 stagger-curve × jitter × spring configurations, worst 0.52×; a
  2.7 s loop at 24 fps matches `render(i·2.7/65)` at 35.7–35.9 dB (vs 18.7–21.6 dB for `i/24`).
- **TQ 7.5:** ligature clusters cached (0 readbacks per frame); `tnum` equalises figure advances; italics on
  17 families; uploads named from their tables. Minus F4, F6, Kinetic Grid tracking.
- **PC 8.0 (prov.):** B7 fixed; motion 41/41; Gravity uses the path as physical ground.
- **CR 7.5 (prov.):** 33 presets; 8 templates that build, stay deterministic, are flash-safe and embed
  bit-identically; exact track mattes (max alpha error 0.49 levels).
- **EE 8.5:** MP4 AV1 1080p60 240/240 at 43.4–45.2 dB with a correct av1C; exact loop spans; transparent
  WebM alpha 38.7–69.4 dB; cold cross-origin player and `file://` standalone 0.000 % different.
- **UX 7.5 (prov.):** excellent export dialog (flash check, codec notes, cost estimate); live flash warning
  names the worst second. Minus F7 slider jank, Deep Space at 26 fps, dead controls.
- **PR 7.5:** 1080p 2.0–16.8 ms per frame for plain presets; 56/56 cross-process determinism; every CI suite
  green. Minus F1–F3, F7; no CI performance budget.
- **EQ 8.0:** five parallel CI jobs; spec-correct AV1 parser; bounds-checked `sfnt`; ESLint 0 real errors;
  0.29 % duplication. Minus F5, F1/F2 without CI, F3, drift.

## Ranked recommendations

1. Fix and fully CI-test the flash detector: the F1 fix, full-rate analysis in slices, per-pixel transitions
   per cell, red / 50–60 fps / long- and short-loop strobes in smoke, `flashes-a` in CI.
2. Cap the WOFF inflate with a streaming limit; add the crafted and fuzz font corpus to smoke.
3. Close CI blind spots (F5): matte pixel identity, transform-key poses, `text-2`, `instanceCount()`, an
   alpha PSNR floor near 40 dB, italic and feature pixel diffs, a draft-badge check.
4. Rasterise transform-keyed layers at their scale (F6).
5. Gravity: simulate in a worker or in slices; drop render-only params from the cache key; coalesce drags.
6. Time flushed frames in `_adapt`; a per-preset and per-template 1080p performance budget in CI.
7. Note every instance fallback (italic, features, axes) in export notes and player warnings.
8. Quality-driven alpha bitrate; bound spring oscillations; F11/F12 housekeeping.
