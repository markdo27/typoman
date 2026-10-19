# TYPOMAN benchmark log

Scored with the [TYPOMAN Band Score](../BENCHMARK.md): eight criteria, bands 0–9, three
independent judges per round. Each criterion's score is the jury **median**. The overall
band is the mean of the medians, rounded to the nearest 0.5.

| Round | MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---|---|---|---|---|---|---|---|---|
| 0: baseline (V3 demo) | 4.5 | 3 | 3 | 5 | 1 | 4.5 | 5 | 3.5 | **3.5** |
| 1: rebuilt studio | – | – | – | – | – | – | – | – | *jury pending* |

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

## Round 1: rebuilt studio (built and verified; jury pending)

The Round 1 jury started on snapshot `3f7aecb` but was cut off by account usage limits
before any judge filed a report. It will run first thing next round, on the same rubric.
Until then there are **no Round 1 band scores**. What follows is verification evidence,
not a jury score.

| Check | Result |
|---|---|
| `npm test`: 17 presets × determinism, loop seam, 1080p cost, 8 edge cases; sanitiser fuzz; link round trip | all pass. 6–13 ms/frame at 1080p in software raster |
| Path editor browser tests (real mouse, keyboard and touch; 16:9, 9:16, 390 px) | 69 / 69 |
| Path geometry unit tests | 4,438 / 4,438 |
| Studio interaction tests (keyboard-only, undo/redo, layers, pickers, autosave) | pass |
| MP4 / GIF / WebM export, checked with `ffprobe` | exact frame counts (60 @ 30 fps × 2 s), 1280×720 |
| H.264 path | not encodable in this container; checked with a mock encoder fed real libx264 output |
| iframe embed + `<typoman-player>` loaded cross-origin | render correctly, no console errors |

The team's own Round 1 reports list these known gaps, to feed into Round 2:
- the gradient fill recolours Glitch fringes and Split Flap tiles;
- Draw On text crowds at sharp inner corners;
- heavy Orbit and Lens settings exceed 10 ms/frame in software raster;
- uploaded custom fonts support a single weight;
- real H.264 output still needs confirming in desktop Chrome or Safari.
