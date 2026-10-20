# TYPOMAN benchmark log

Scored with the [TYPOMAN Band Score](../BENCHMARK.md): eight criteria, bands 0–9, three
independent judges per round. Each criterion's score is the jury **median**. The overall
band is the mean of the medians, rounded to the nearest 0.5.

| Round | MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---|---|---|---|---|---|---|---|---|
| 0: baseline (V3 demo) | 4.5 | 3 | 3 | 5 | 1 | 4.5 | 5 | 3.5 | **3.5** |
| 1: rebuilt studio | 6.5 | 6.5 | 7.5 | 6.5 | 7.5 | 7 | 6.5 | 7.5 | **7.0** |
| 2: more presets, looks, pen tool, keyframes, layer timing, width & optical size | 7 | 7 | 8 | 7 | 8 | 7.5 | 7 | 7.5 | **7.5** |

MC Motion Craft · TQ Typographic Quality · PC Path Control · CR Creative Range &
Originality · EE Export & Embed · UX Studio UX & Visual Design · PR Performance &
Robustness · EQ Engineering Quality

## Round 0: baseline

| Judge | MC | TQ | PC | CR | EE | UX | PR | EQ |
|---|---|---|---|---|---|---|---|---|
| Kinetic Type Art Director | 4 | 3 | 2.5 | 4 | 1 | 4.5 | 5 | 4 |
| Working Motion Designer | 4.5 | 3 | 3 | 5 | 1.5 | 4 | 4.5 | 3.5 |
| Creative Technologist | 4.5 | 3 | 3.5 | 5 | 1 | 5 | 5 | 3.5 |

The jury agreed on the main findings:
- **No export of any kind** (not even PNG) and no real embed. The only "embed" was
  putting the whole studio in an iframe with its UI covering the art.
- **No editable path.** There were three fixed curves in one preset and three wave modes
  in another.
- **Typography was an afterthought.** 3 of the 9 presets drew no text. Letters sat in
  equal-width slots, losing kerning. Emoji broke. Short words were padded with
  "HELVETICA". There was one font and white type only.
- **Frames weren't reproducible.** There was unseeded `Math.random()`, and one preset's
  motion depended on the display's refresh rate and kept moving while paused. 11–12 of 28
  variations jumped at the loop point.
- **Engineering:** one 1,680-line inline script, an orphaned `script.js`, a debug script
  that couldn't run, unpinned `lucide@latest`, and committed test artefacts.

Full reports: [art director](round-0/art-director.md) ·
[motion designer](round-0/motion-designer.md) ·
[creative technologist](round-0/creative-technologist.md)

## Round 1: rebuilt studio (snapshot `3f7aecb`)

| Judge | MC | TQ | PC | CR | EE | UX | PR | EQ |
|---|---|---|---|---|---|---|---|---|
| Kinetic Type Art Director | 6.5 | 6.5 | 7.5 | 6.5 | 6.5* | 7 | 6.5 | 7 |
| Working Motion Designer | 7 | 7.5 | 8 | 7 | 8.5 | 8 | 8 | 7.5 |
| Creative Technologist | 6.5 | 6 | 7 | 6.5 | 7.5 | 7 | 6.5 | 7.5 |
| **Median** | **6.5** | **6.5** | **7.5** | **6.5** | **7.5** | **7** | **6.5** | **7.5** |

\* provisional: the Art Director read the encoder code but didn't export files.

The mean of the medians is 6.94, so the overall band is **7.0, up from 3.5**. The biggest
jumps were Export & Embed (1 → 7.5), Path Control (3 → 7.5) and Engineering
(3.5 → 7.5).

**What the jury verified**
- **Exports:** every format had the exact frame count and duration in `ffprobe`. Video
  matches `render(t)` at 36–41 dB PSNR, GIF at 44 dB, and PNG/ZIP frames are bit-exact.
  Transparent WebM alpha decodes at 41–49 dB.
- **Deliverables:** all five motion-designer scenarios produced their deliverable: a
  YouTube intro MP4, a website hero embed (iframe, web component, HTML file), a 9:16
  story on a hand-shaped and morphing path, a brand-font transparent export, and a
  two-layer composite.
- **Embeds:** robust against hostile input, with no XSS or prototype pollution. Rendering
  pauses in hidden tabs, and heap stays flat across preset switches and repeated exports.

**Bugs found, all fixed after the round** (in commits `e43e53f`, `ce94bba` and the
wrap-up commit):

| Bug | Fix |
|---|---|
| The second line of Rise, and Split Flap rolls, drew in a 10px default font, in exports too (stale font cache after `ctx.save/restore`) | The cache is checked against the context. A regression test checks two-line ink heights (were 75 / 7 px, now 75 / 75) |
| Arabic and Hebrew rendered reversed; Arabic lost its joined forms | RTL lines lay out as shaped word clusters placed right to left |
| A 190 KB link inflated to 140 MB before being rejected | Streamed decompression with a 1 MB cap (a 64 MB bomb is rejected in 55 ms) |
| A fractional `speed` from a URL broke the loop seam | Range params snap to their declared step |
| Stacked effects dropped the studio to 6 fps | Preview caps blur × echo passes and extrude steps, and the stage adapts preview resolution |
| Uploaded fonts silently fell back to Anton in embeds | The share dialog warns |
| Pressing N typed "n" into the new layer | The keystroke is consumed |
| The size estimate read like a promise ("≈2.2 MB" for a 162 KB file) | Shown as an upper bound |

**Round 2 priorities (ranked by the jury)**
1. Letters collide at sharp path corners and mid-morph. Compress spacing on concave
   stretches, fan it on convex ones, and handle open path ends cleanly.
2. Per-layer timing: start offsets and durations, and "play once and hold", so a
   subtitle can follow a title.
3. Curated looks per preset (font, palette, effects, path), and a Remix that also
   changes motion settings and paths. Today every preset opens in Anton on Klein blue.
4. Fly In defaults: the word reads backwards in flight. Pick the order from the path
   direction and space launches by distance along the path.
5. Variable fonts beyond weight (width, optical size), and rebuild Stack on width plus
   tracking instead of stretching letters.
6. Deliverable presets (YouTube, IG/TikTok story, web hero bundle), file names taken
   from the text, uploaded fonts named by their family name, and a fallback H.264
   encoder.
7. Path editor: grabbable off-frame handles, a click-to-place pen tool, and path
   keyframes beyond A→B→A.

Full reports: [art director](round-1/art-director.md) ·
[motion designer](round-1/motion-designer.md) ·
[creative technologist](round-1/creative-technologist.md)


## Round 2: more presets, looks, path keyframes, layer timing, variable fonts (snapshot `3b93646`)

| Judge | MC | TQ | PC | CR | EE | UX | PR | EQ |
|---|---|---|---|---|---|---|---|---|
| Kinetic Type Art Director | 7 | 6.5 | 8* | 7 | 8 | 7.5* | 7 | 7.5 |
| Working Motion Designer | 7.5 | 7.5 | 8.5 | 7.5* | 8.5 | 8 | 7.5 | 7.5* |
| Creative Technologist | 7 | 7 | 7.5* | 7* | 7.5 | 7* | 7 | 7.5 |
| **Median** | **7** | **7** | **8** | **7** | **8** | **7.5** | **7** | **7.5** |

\* provisional, outside that judge's lens.

The mean of the medians is 7.375, so the overall band is **7.5, up from 7.0**. Path Control
and Export & Embed reached 8. Typographic Quality moved from 6.5 to 7.

**What the jury verified**
- **Deliverables:** all five motion-designer scenarios came out end to end through the real UI
  (mouse, keyboard, touch, file chooser): a YouTube intro, a website hero, a 9:16 story on a
  pen-drawn path with A→B→C keyframes, a title plus a subtitle that follows it on the timeline,
  and a brand-font transparent export.
- **Embeds:** every embed route (iframe, `<typoman-player>`, standalone HTML) was
  bit-identical to the studio renderer, per-layer timing included.
- **Exports:** every format had the exact frame count and duration. PNG and ZIP were
  bit-exact, video measured 35–66 dB against `render(t)`, and transparent WebM alpha 48–71 dB.
  This container has no H.264 encoder, so MP4 falls back to AV1, and the dialog says so.
- **Determinism:** 420 of 420 frames were identical across two browser processes, and 340 of
  341 preset, look and option combinations loop seamlessly. The one pop, Stack cascade, is
  fixed below.
- **Variable fonts:** the width and optical-size instances change the letterforms, are
  identical at every render size, and load before frame 0 on cold pages, in cross-origin
  embeds and in standalone HTML opened from a file.
- **Robustness:** 667 edge cases ran with 0 errors, and hostile URLs, embed attributes and
  project files produced no XSS and no prototype pollution. Contrast passes WCAG AA
  throughout (worst 5.31:1).

**Bugs found, fixed after the round**

| Bug | Fix |
|---|---|
| Big Shoulders Display never loaded: the catalogue claimed an `opsz` axis it doesn't have, so Google answered HTTP 400 | Axis dropped. The smoke test now loads all 54 catalogue fonts |
| Kerning was applied one pair late in every per-glyph preset (AV +13.9 px at 151 px), and words after a space shifted ~4 px | Pen position is `prefix[k+1] − advance(k)`, and drawing uses `fontKerning: 'normal'` like layout. A pixel test against a native run shows a 0.00 % difference |
| The gradient fill recoloured every pixel a preset drew: Kinetic Grid's letters and Ribbon's text vanished, and tiles, carets, pens and fringes lost their colours | Fills paint glyph ink only, with a frame-space gradient pattern re-anchored per glyph |
| Looks inherited the previous state's effects, and Remix replaced hand-drawn paths | `applyLook` starts from default effects and params and never replaces a drawn path (tested) |
| Stack shimmered (72 width-instance switches in 240 frames, 3–6 px jumps), a single word was static, and descenders reached into the next row | Sub-step scaling between instances (worst per-letter residual 3.2 → 0.7 px), a breathing single word, rows sized by ink |
| Stack cascade popped at every loop (13.7× the largest frame step) | Periodic bulge (0.35×) |
| No font timeouts: a hung fonts.googleapis.com left embeds blank forever | Bounded waits with loads continuing. `TM.prepare(scene, { timeout: 3000 })` returns in 3.0 s |
| Variable-font instances were never released (+230 MB from ordinary editing) | Idle instances are released beyond a soft cap of 64 (127 → 58 after a full width drag) |
| A 190 KB decompression bomb allocated ~139 MB before rejection | Inflate is fed 1 KB at a time: 1.6 MB peak, rejected in 8 ms |
| `f.drawLine()` ignored Extrude (dead on Melt and Stack) | Extrude in `drawLine` and in Stack's rows |
| Title case capitalised "For" and "The"; `preset: ["wave"]` survived normalisation; `merge` accepted `__proto__` | Minor words stay lowercase; ids must be strings; unsafe keys are skipped |
| A non-integer frames-per-loop count hitched at the loop point | Durations snap to whole frames |

**In progress (the team fix pass):** collision-free path typography (lanes that can't cross,
bend spacing without holes inside words); motion artefacts in Magnet, Fly In, Outline Draw,
Sequence and Spotlight; RTL in Typewriter and Split Flap; real Kinetic Grid cut-outs; a
photosensitivity cap; studio fixes (stray "null" in tooltips, embed font messaging, the
play-once end frame, a Path lock for Remix, phone gaps); export, embed and option-sweep CI
tests; a correct `av1C` box in AV1 MP4s.

**Round 3 priorities (merged from the three reports, ranked)**
1. Path typography: collision-free spacing that keeps words whole, and lanes that can't
   cross (Art Director 3, Motion Designer 1).
2. An export/embed CI job, plus seam and contract sweeps over every look and option
   (Creative Technologist 4–5).
3. Remove the remaining motion artefacts (Art Director 4).
4. Raise the timing ceiling: editable springs, a stagger-distribution curve, seeded
   per-glyph time jitter, and per-property keyframes on top of any preset (Art Director 5).
5. Script and typographic polish: RTL in every preset, bidi LTR runs inside RTL lines,
   balanced automatic wrapping, OpenType features (Art Director 7–8).
6. A photosensitivity guard, at most 3 flashes per second by default (Art Director 9).
7. Signature presets with no template-pack equivalent: a phrase morph that shares letters,
   type as particles, layer mattes and masks for Saul Bass-style reveals (Art Director 10).
8. Studio: keyframe timing on the timeline, phone parity, starter templates, a draft-preview
   badge and an export-cost estimate (Motion Designer 6–8, Creative Technologist 7).

Full reports: [art director](round-2/art-director.md) ·
[motion designer](round-2/motion-designer.md) ·
[creative technologist](round-2/creative-technologist.md)
