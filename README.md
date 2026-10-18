# TYPOMAN: Kinetic Type Studio

Make animated typography for your projects, right in the browser. Type your words, pick
a motion, **shape the path the type travels on**, then **embed it on any website** or
**download an MP4**.

**[Open the studio →](https://markdo27.github.io/typoman/)**

No install, no account, no build step. It's static files on GitHub Pages.

## What you can do

- **Animate type with 17 motion presets**, grouped as path, kinetic, reveal, glitch and
  dimensional. Every preset staggers by letter, word or line, with easing curves you can
  edit (signature curves, springs, or your own cubic-bézier).
- **Shape the motion path.** Pick a shape (wave, arc, circle, spiral, infinity, heart, …),
  then drag anchors and handles on the canvas, double-click to add points, or draw
  freehand. Paths can also **morph** from one shape to another over the loop.
- **Use real typography.** There are 50 curated Google Fonts (including variable fonts
  whose weight animates smoothly), and you can upload your own. Kerning is preserved,
  emoji are safe, and you get multi-line, tracking, leading, case, slant, outline, and
  gradient or palette fills.
- **Layer effects:** echo trails, motion blur, glow, drop shadow, 3D extrude, film grain
  and vignette.
- **Export:** frame-accurate MP4 (H.264, with AV1/VP9 fallbacks), WebM (with
  transparency where supported), GIF, a PNG frame, or a PNG sequence. Exports are rendered
  offline frame by frame, so they match the preview exactly at any resolution, up to 4K.
- **Embed:** copy an `<iframe>`, drop in the `<typoman-player>` web component, or
  download a single self-contained HTML file. Share a remix link so others can open your
  scene in the studio.

## Embedding

```html
<!-- iframe: the scene travels in the URL hash -->
<iframe src="https://markdo27.github.io/typoman/embed.html#c=…" style="border:0;width:100%;aspect-ratio:16/9" title="Animated type"></iframe>

<!-- web component -->
<script src="https://markdo27.github.io/typoman/player.js" defer></script>
<typoman-player scene="…" autoplay loop></typoman-player>
```

The studio's **Embed** button generates both snippets with your scene filled in.

## Keyboard

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` `→` | Step one frame (`Shift` = 10) |
| `P` | Edit the path on the canvas |
| `G` | Safe-area guides |
| `R` | Remix (random preset, font and palette) |
| `⌘/Ctrl Z`, `⇧⌘Z` | Undo / redo |
| `⌘/Ctrl E` | Export |
| `?` | Shortcut help |

## How it works

```
scene JSON ──► TM.Scene.normalize (sanitise) ──► TM.Renderer.render(t)
                                                  ├─ background
                                                  ├─ per layer: preset.render(f) × echoes × blur samples
                                                  │            → gradient fill → shadow / glow → composite
                                                  └─ grain / vignette
```

- **Deterministic:** a frame is a pure function of the scene and the time. There's no
  `Math.random()`, only seeded hashing and noise. The studio preview, the embed player and
  the offline MP4 encoder therefore produce the same pixels.
- **Resolution-independent:** every size is relative to the frame, so a 540p preview and a
  4K export are the same composition.
- **Safe to share:** scenes arriving from URLs, attributes or storage are sanitised
  against a strict schema. Fonts are whitelisted and colours validated.

The engine and studio contract, including how to write a preset in about 50 lines, is in
[`docs/ENGINE.md`](docs/ENGINE.md).

```
index.html       studio            embed.html   iframe player        player.js  web component
js/engine/       core · fonts · text · path · scene · renderer
js/presets/      one file per motion preset
js/export/       MP4 / WebM / GIF / PNG / ZIP encoders, standalone HTML
js/studio/       store · controls · inspector · panels · dialogs · app
vendor/          pinned MIT libraries (mp4-muxer, webm-muxer)
labs/            earlier experiments (V3 demo, Flash engine, Cavalry study)
```

## Develop

```bash
npm start        # serves the repo at http://localhost:8080
npm test         # headless smoke tests: determinism, loop seams, perf, edge cases, sanitiser fuzz
```

## Benchmark

The project is benchmarked with the **TYPOMAN Band Score**, an IELTS-style 0–9 rubric
across eight criteria, scored by a three-judge jury each round. See
[`docs/BENCHMARK.md`](docs/BENCHMARK.md) and the [round-by-round log](docs/benchmark/).

## License

MIT
