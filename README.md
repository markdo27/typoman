# TYPOMAN: Kinetic Type Studio

Make animated typography for your projects, right in the browser. Type your words, pick
a motion, **shape the path the type travels on**, then **embed it on any website** or
**download an MP4**.

**[Open the studio →](https://markdo27.github.io/typoman/)**

No install, no account, no build step. It's static files on GitHub Pages.

## What you can do

- **Animate type with 33 motion presets**, grouped as path, kinetic, reveal, glitch,
  dimensional and generative: from Path Flow, Ribbon and Orbit to Split Flap, Focus Pull,
  Kaleido and Melt. Three of them have no template-pack equivalent:
  - **Axis Wave** sweeps a font's own variable axes letter by letter: Tilt Warp's 3D tilt,
    Climate Crisis melting through the years, Kablammo's morph.
  - **Phrase Morph** carries the letters two phrases share into the next phrase, while the
    rest dissolve.
  - **Particles** assembles the word from a seeded swarm that holds as dot or tile lettering,
    or condenses into solid type.
  - **Gravity** drops the letters onto the path you draw. They bounce, tumble and settle into
    place on it, then the ground gives way.
- **Safe by default.** Every preset and look stays at or under 3 flashes a second (WCAG 2.3.1),
  and the studio checks your scene before export.
- **Time it like a motion designer.** Every preset staggers by letter, word or line. Easing
  curves are editable (signature curves, springs, or your own cubic-bézier). A
  **stagger curve** shapes how start times spread along the order, and seeded **jitter**
  loosens it.
- **Start from a look.** 103 curated looks (colour, font, motion and timing, designed per
  preset) are one click away in the **Inspiration** view. Applying a look never touches
  your text, and **Remix** mixes curated looks with fresh rolls.
- **Shape the motion path.** Pick one of 22 shapes (wave, arc, circle, spiral, infinity,
  heart, …), then drag anchors and handles on the canvas, draw with the **pen tool**, or
  draw freehand. Points can sit outside the frame so type can fly in from off-screen. Text
  keeps even spacing through tight bends. **Path keyframes** move a path through up to five
  shapes, A → B → C → D → E, in a cycle or ping-pong, with an ease per step.
- **Time each layer.** Up to six text layers, each with its own motion, on timeline lanes.
  Drag a lane to delay it, play it up to 8× per loop, or play it once and hold.
- **Use real typography.** There are 60 curated Google Fonts, and you can upload your own.
  Variable fonts animate their weight smoothly, and fonts with **width**, **optical size**
  or custom axes (Roboto Flex, Science Gothic, Fraunces, Tilt Warp, Recursive, …) expose them. Optical
  size follows the text's size in the scene, so previews and exports draw identical
  letterforms. **Stack** fills the frame through the width axis, condensing tall rows and
  expanding short ones instead of stretching letters. Kerning and **ligatures** are
  preserved even though letters move one by one (fi, ffl and Th stay one glyph). Slant uses
  a font's own `slnt` axis where it has one, so Roboto Flex and Recursive lean as designed.
  Emoji are safe, Arabic and Hebrew run right to left, and long lines wrap into balanced
  lines. You get multi-line, tracking, leading, case, slant, outline, and gradient or
  palette fills.
- **Layer effects:** echo trails, motion blur, glow, drop shadow, 3D extrude, film grain
  and vignette.
- **Export:** frame-accurate MP4 (H.264, with AV1/VP9 fallbacks), WebM (with
  transparency where supported), GIF, a PNG frame, or a PNG sequence. Exports are rendered
  offline frame by frame, so they match the preview exactly at any resolution, up to 4K.
- **Embed:** copy an `<iframe>`, drop in the `<typoman-player>` web component, or
  download a single self-contained HTML file. Share a remix link so others can open your
  scene in the studio.

## After Effects projects

Choose **Export → After Effects** to download a `.jsx` script. In desktop After Effects,
use **File → Scripts → Run Script File**, select the script, then choose where to save
the `.aep` project. Install the scene's fonts on that computer first. If you cancel the
save dialog, the composition is still created without saving a file. The composition
is added to your open project; use an empty project if you want a separate project.

Each studio layer becomes **one editable AE text layer**, with its whole text in
Source Text. There are no per-letter layers, parent nulls or per-frame keyframes.

**Match preview** is the default. It transfers the renderer's character position,
rotation, scale, visibility and layer-transform timing, including springs, custom
easing, staggering and path deformation. Reduced motion curves live in text-selector
expressions. Each text layer has just **two Motion progress (%) keyframes**, from 0
to 100 across the exported duration. Move those keys or change their easing to retime
the whole motion. Effect Controls also offers motion strength and position/rotation
offsets. Detailed motion and copy changes should be edited in Typoman and
re-exported; these character curves are not separate editable timeline keys.

At sampled export frames, reduction keeps position within 0.5 px per axis, rotation
within 0.5 degrees, and scale/opacity within 0.5%. This checks motion data, not AE's
rendered pixels: font metrics, ligatures, complex scripts, character-anchor behaviour
and clipping can differ. Repeated path text stays in the same text layer. Dense exports
may require a shorter duration or lower frame rate to fit AE's expression limits.
Canvas-only/custom text layouts, such as Stack, Particles or Lens, report an error
in this mode instead of exporting static or missing text.

Choose **Native controls (approximate)** when you want to rebuild the animation using
AE paths and parameter controls instead of transferred preview curves:

- **Path Flow:** an editable mask under Masks → Motion path, native Text → Path
  Options, and scroll speed, offset and repeat controls. Edit the original Source Text
  once; an expression repeats it when using Fill & scroll.
- **Wave:** native text animators with height, wavelength, speed, lean and scale controls.
- **Rise:** native text animators with travel, tilt, scale, stagger and easing controls.
- **Typewriter:** character visibility in one text layer, keeping the source text editable.

In Native controls mode, adjust motion through **Effect Controls** and **Text → Animators**. The named controls
can be keyframed normally in AE. Only transform poses and path poses authored in the
studio become sparse native keys; these use linear interpolation and can be edited
directly. Cycle, delay and loop controls drive preset motion; authored key times are
independent of later changes to those controls. The browser writes JSX; After Effects
creates the `.aep` when it runs the script.

Native-controls motion is an editable approximation: AE text spacing, reveal easing and wave
variants can differ. Other presets retain their complete text **without preset motion**,
with a warning identifying the layer. Echoes, custom artwork, track mattes, glow, shadow,
blur, extrusion, grain, vignette and font-axis animation are not transferred.
Gradients/palettes use a solid colour, and fonts can differ. The export dialog and
generated composition list these limits. Use a PNG sequence for exact appearance.
Desktop After Effects is required to verify final appearance; `npm run test:ae` compares
transferred preview curves with the renderer's canvas transforms, and checks native
layer structure and generated expressions against an API test double.

## Embedding

```html
<!-- iframe: the scene travels in the URL hash -->
<iframe src="https://markdo27.github.io/typoman/embed.html#c=…" style="border:0;width:100%;aspect-ratio:16/9" title="Animated type"></iframe>

<!-- web component -->
<script src="https://markdo27.github.io/typoman/player.js" defer></script>
<typoman-player scene="…" autoplay loop></typoman-player>
```

The studio's **Embed** button generates both snippets with your scene filled in.

An embed is live type, not a video, so it can do things a video can't:

```html
<!-- One design, different copy on every page (\n breaks the line) -->
<typoman-player scene="…" autoplay loop text="Spring sale\n−40%"></typoman-player>

<!-- Scroll-scrubbed: the animation follows the page's scroll -->
<typoman-player scene="…" scrub="scroll"></typoman-player>

<!-- Plays while the pointer is over it (a tap toggles on touch screens) -->
<typoman-player scene="…" trigger="hover" loop></typoman-player>
```

`text-2` … `text-6` set the other layers. The iframe takes `&text=…&trigger=hover` in its
URL, and a `{ typoman: 'progress', value: 0..1 }` message lets the parent page scrub it. With
reduced motion turned on, every embed shows a still and a play button.

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
labs/            earlier experiments (V3 demo, Flash engine, Cavalry study), not deployed
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
| 2: more presets, looks, pen tool, path keyframes, layer timing, width & optical size | **7.5** |
| 3: Phrase Morph, Particles, Gravity, templates, mattes, keyframes, springs, real italics & ligatures, live embeds, flash safety | **8.0** |

## License

MIT
