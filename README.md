# TYPOMAN — Kinetic Type Engine

A browser-based kinetic typography engine for creating animated stacked text compositions. Zero dependencies, single HTML file, no build step required.

![TYPOMAN Preview](https://img.shields.io/badge/status-live-brightgreen) ![Single File](https://img.shields.io/badge/architecture-single%20file-blue)

## Features

- **Stacked Text** — Words auto-fill canvas width, stack vertically with proportional height distribution
- **6 Motion Presets** — Wave, Accordion, Cascade, Bounce, Spring, Breathe
- **Audio-Reactive Mode** — Mic input → FFT → row scale mapping via Web Audio API
- **Webcam Text Mask** — Camera feed revealed through text letter shapes
- **Per-Word Colors** — Independent color override per word chip
- **8 Google Fonts** — Anton, Bebas Neue, Oswald, Playfair Display, Righteous, Archivo Black, Russo One, Impact
- **Effects Engine** — Shadow, Glow, Outline, Double with adjustable strength
- **Crazy Mode** — Auto-randomize everything (colors, fonts, motion, effects) every 1.5-3s
- **Color System** — Preset swatches + randomize with WCAG 4.5:1 contrast enforcement + swap
- **Export** — PNG download + SVG clipboard copy
- **Keyboard Shortcuts** — `Space` play/stop, `R` random, `M` mic, `C` crazy mode
- **Responsive Easing Graph** — Real-time visualization of motion curves

## Quick Start

```bash
# Just open the file
open index.html
# or
start index.html
```

No npm, no build, no server. Just a browser.

## Architecture

```
Offscreen Canvas (per row)          Main Canvas
┌──────────────────────┐           ┌──────────────────────┐
│ Font at 1.15x lineH  │──crop──▶ │ drawImage stretched  │
│ scale(scaleX, 1)     │ to pixel │ into row slot         │
│ textBaseline='top'   │ bounds   │ [0, y, W, lineH]     │
└──────────────────────┘           └──────────────────────┘
```

Each word is rendered to an offscreen canvas, pixel-scanned for glyph bounds, then stretched precisely into its row slot via `drawImage`. Motion presets are pure math functions that modulate `lineScales[]` per frame via `requestAnimationFrame`.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Stop animation |
| `R` | Randomize colors |
| `M` | Toggle microphone audio input |
| `C` | Toggle crazy mode |

## License

MIT
