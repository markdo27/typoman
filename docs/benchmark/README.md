# TYPOMAN benchmark log

Scored with the [TYPOMAN Band Score](../BENCHMARK.md): eight criteria, bands 0–9, three
independent judges per round. Each criterion's score is the jury **median**. The overall
band is the mean of the medians, rounded to the nearest 0.5.

| Round | MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---|---|---|---|---|---|---|---|---|
| 0: baseline (V3 demo) | 4.5 | 3 | 3 | 5 | 1 | 4.5 | 5 | 3.5 | **3.5** |
| 1: rebuilt studio | 6.5 | 6.5 | 7.5 | 6.5 | 7.5 | 7 | 6.5 | 7.5 | **7.0** |

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
