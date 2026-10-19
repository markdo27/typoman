# TYPOMAN: Kinetic Type Studio

Make animated typography for your projects, right in the browser. Type your words, pick
a motion, **shape the path the type travels on**, then **embed it on any website** or
**download an MP4**.

**[Open the studio →](https://markdo27.github.io/typoman/)**

No install, no account, no build step. It's static files on GitHub Pages.

## What you can do

- **Animate type with 29 motion presets**, grouped as path, kinetic, reveal, glitch,
  dimensional and generative: from Path Flow, Ribbon and Orbit to Split Flap, Focus Pull,
  Kaleido and Melt. Every preset staggers by letter, word or line, with easing curves you
  can edit (signature curves, springs, or your own cubic-bézier).
- **Start from a look.** 78 curated looks (colour, font, motion and timing, designed per
  preset) are one click away in the **Inspiration** view. Applying a look never touches
  your text, and **Remix** mixes curated looks with fresh rolls.
- **Shape the motion path.** Pick one of 22 shapes (wave, arc, circle, spiral, infinity,
  heart, …), then drag anchors and handles on the canvas, draw with the **pen tool**, or
  draw freehand. Points can sit outside the frame so type can fly in from off-screen. Text
  keeps even spacing through tight bends. **Path keyframes** move a path through up to five
  shapes, A → B → C → D → E, in a cycle or ping-pong, with an ease per step.
- **Time each layer.** Up to six text layers, each with its own motion, on timeline lanes.
  Drag a lane to delay it, play it up to 8× per loop, or play it once and hold.
- **Use real typography.** There are 50 curated Google Fonts (including variable fonts
  whose weight animates smoothly), and you can upload your own. Kerning is preserved,
  emoji are safe, and Arabic and Hebrew text runs right to left. You get multi-line,
  tracking, leading, case, slant, outline, and gradient or palette fills.
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
| `P` | Edit the path on the canvas (then `D` draws freehand, `Enter`/`Esc` finishes the pen) |
| `G` | Safe-area guides |
| `F` | Clean preview (hide the UI) |
| `N` | New layer |
| `[` `]` | Select the layer below / above |
| `/` | Search presets |
| `R` | Remix (a curated look or a fresh roll; lock what to keep) |
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

| Round | Overall band |
|---|---|
| 0: original V3 demo | 3.5 |
| 1: rebuilt studio | 7.0 |
| 2: more presets, looks, pen tool, path keyframes, layer timing | jury pending |

## License

MIT
