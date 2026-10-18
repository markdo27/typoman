# TYPOMAN benchmark log

Scored with the [TYPOMAN Band Score](../BENCHMARK.md): eight criteria, bands 0–9, three
independent judges per round. Each criterion's score is the jury **median**. The overall
band is the mean of the medians, rounded to the nearest 0.5.

| Round | MC | TQ | PC | CR | EE | UX | PR | EQ | Overall |
|---|---|---|---|---|---|---|---|---|---|
| 0: baseline (V3 demo) | 4.5 | 3 | 3 | 5 | 1 | 4.5 | 5 | 3.5 | **3.5** |

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
