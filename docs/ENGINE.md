# TYPOMAN engine & studio contract

TYPOMAN is a static site with no build step. Every file is a classic script that attaches to
`window.TM`. `js/boot.js` holds the **one manifest** of files. Pages, the
`<typoman-player>` web component and the standalone-HTML exporter all load or inline
from it.

```
index.html        studio (boot groups: engine,presets,studio; studio pulls in export)
embed.html        chromeless player for iframes (engine,presets)
player.js         <typoman-player> web component; loads boot.js from its own URL
js/engine/*       core.js → fonts.js → text.js → path.js → scene.js → renderer.js
js/presets/*      one file per preset, each calls TM.registerPreset()
js/export/*       encoders (MP4/WebM/GIF/PNG/ZIP), standalone HTML builder
js/studio/*       store, controls, inspector, panels, dialogs, app (app.js loads last)
vendor/*          pinned third-party code (MIT), served locally
```

## Golden rules

1. **Determinism.** `preset.render(f)` must be a pure function of `f`. Never use
   `Math.random()`, `Date`, `performance.now()` or state carried between frames. Use
   `f.rand(a, b)`, `f.srand(a, b)`, `f.noise.n3()` and `f.loopNoise(salt, freq)`. Exported
   frames must equal preview frames.
2. **Seamless loops.** `f.p` runs from 0 to 1 over the loop. Periodic motion uses *integer*
   cycles per loop, e.g. `Math.sin(TAU * (k * f.p + phase))`. The frame at `p = 0` must equal
   the frame at `p → 1`, unless the user picks an "In → Hold" timing.
3. **Resolution independence.** Express sizes relative to `f.size` (font px) or `f.unit`
   (the shorter frame side). Never hard-code pixels. The preview at 540p and an export at
   2160p are the same composition.
4. **Respect the type.** Draw glyphs with `f.drawGlyph()` / `f.drawLine()` so kerning
   (from the layout), fill modes, stroke, extrude, slant, echo alpha and palette all apply
   consistently. Never pad, truncate or replace the user's text.
5. **Sanitise at boundaries.** Anything from a URL, attribute, file or storage goes
   through `TM.Scene.normalize()`. Fonts are whitelisted (`TM.FONTS`), and colours are
   validated hex.

## Scene (JSON)

```js
{ v:1, name, size:{w,h}, duration /*s*/, fps /*24|25|30|50|60*/, seed,
  bg:{ type:'solid'|'linear'|'radial'|'transparent', color, color2, angle },
  post:{ grain 0..1, vignette 0..1 },
  layers:[{ id, name, visible, text /*\n = new line*/, preset, params:{…per preset schema…},
    font:{ family, weight }, type:{ size /*× unit*/, tracking /*em*/, leading, align, case, slant /*deg*/ },
    fill:{ type:'solid'|'gradient'|'palette', color, color2, angle, palette:[hex…] },
    stroke:{ mode:'none'|'outline'|'both', width /*em*/, color },
    path:{ closed, preset?, nodes:[{x,y,ix,iy,ox,oy,k}] } | null,   // normalised 0..1, handles relative
    pathMorph:{ enabled, target: path|null, ease },                  // path A→B→A over the loop
    fx:{ echo:{count,spacing,fade,palette}, blur 0..1, glow:{amount,color},
         shadow:{amount,angle,distance,color}, extrude:{depth,angle,color} },
    anchor:{ x, y } }] }
```

`path.preset` is set while the path is an untouched preset shape. Editors **must delete
it** when the user edits the path, which marks it as custom so it survives preset and
aspect switches.

## Preset contract

```js
TM.registerPreset({
  id: 'my-preset', name: 'My Preset', category: 'Path'|'Kinetic'|'Reveal'|'Glitch'|'Dimensional'|'Generative',
  description: 'One sentence shown in the studio.',
  usesPath: false,            // true → path editor shows, f.path is available
  path: 'wave',               // default TM.Path preset id when usesPath
  fit: true,                  // auto-shrink text to fit the frame (defaults to !usesPath)
  params: [ TM.P.range('amp', 'Amplitude', 0, 1, 0.01, 0.5, { group: 'Motion' }), … ],
  setup(f) { return cache },  // optional; re-run only when text/font/type/params/path/size change
  render(f) { … },
});
```

Param builders (`js/engine/core.js`): `TM.P.range | select | toggle | color | ease`,
`TM.P.stagger()`, `TM.P.order()`, and `TM.P.sequence(opts)`. The last one gives the
standard in→hold→out timing set: `timing, inDur, outDur, stagger, order, easeIn, easeOut`.
Any param may take `group: 'Name'` (inspector sub-heading), `hint` and
`showIf: { otherKey: value | [values] }`.

### The frame `f`

| field | meaning |
|---|---|
| `f.ctx` | 2D context of the layer buffer (draw here) |
| `f.t`, `f.p`, `f.dur`, `f.fps`, `f.frameIndex` | loop time (s), loop progress 0..1, duration, fps, frame # |
| `f.W`, `f.H`, `f.unit` | buffer size in px; unit = min(W, H) |
| `f.cx`, `f.cy` | layer anchor in px (text block centre) |
| `f.layout`, `f.glyphs`, `f.lines`, `f.size` | text layout (see below), font size px |
| `f.params`, `f.layer`, `f.seed`, `f.cache` | params, layer JSON, seed, `setup()` result |
| `f.path` | `TM.Path.SampledPath` in px (morph applied) or null |
| `f.echo`, `f.alpha` | echo index (0 = main pass) and alpha multiplier |

**Layout.** `L.glyphs[i] = { ch, i, vi /*visible index, -1 for spaces*/, line, li, word,
isSpace, x /*left*/, w /*advance*/, y /*baseline*/, cx, cy /*centre*/ }`, all relative to
the block centre. `L.lines[j] = { text, width, x, y, glyphs:[indices] }`, plus `L.capH`,
`L.lineGap`, `L.count` (visible glyphs), `L.words` and `L.font`.

**Helpers.**
- `f.drawGlyph(g, { x, y, rot, sx, sy, scale, skew, alpha, color, weight, ch, anchor:'center'|'baseline', size })`
  centres the glyph on (x, y) by default.
- `f.drawLine(line, opts)` draws a whole line as one shaped run.
- `f.rank(g, order)` gives 0..1, `f.stagger(p, r, amount)` gives 0..1, and `f.seq(g)`
  gives `{ kin, kout, vin, vout, visible, r }`.
- `f.colorOf(g)`, `f.font(weight)` and `f.ease(spec)`.
- `f.identity()` resets the transform to frame px, for drawing your own shapes. Use
  `f.colorOf({vi:0})` as their colour.
- `f.rand`, `f.srand`, `f.noise` and `f.loopNoise(salt, freq)`.

**Paths.** `path.length` and `path.closed`. `path.at(s)` returns
`{ x, y, angle, tx, ty, nx, ny, inside }` (it wraps when closed and extrapolates past the
ends of open paths). Also `path.atU(u)`, `path.resample(n)`, `path.trace(ctx, s0, s1)` and
`TM.Path.preset(id, aspect)`, `fromPoints`, `fromPolyline`, `morph`, `toSVG`, `sample`.

**Easing.** `TM.ease(spec)` takes a name from `TM.EASINGS` or a cubic-bézier
`[x1, y1, x2, y2]`. Signature curves include `glide`, `smooth`, `snap`, `overshoot`,
`anticipate`, `spring`, `springSoft` and `springSnappy`.

## Rendering API

```js
const r = new TM.Renderer(canvas, { quality: 'preview' | 'full' });
r.setScene(TM.Scene.normalize(json)); r.resize(w, h);
await TM.prepare(r.scene);   // loads fonts
r.render(seconds);           // background → layers (echo, blur, gradient, shadow, glow) → grain/vignette
```

`TM.Scene.encode(scene)` and `decode(str)` produce a compact, URL-safe string ('z' +
deflate-raw base64url). It goes in `#c=…` on `index.html` (to remix) and on `embed.html`
(to play).

## Studio API (for panels, editors and dialogs)

- `TM.Studio.store`: `scene`, `layer`, `preset`, `selected`, `ui` and `setUI(patch)`.
  `update(fn(scene, layer), { coalesce: key })` and `updateLayer(fn(layer, scene), opts)`
  record undoable edits; pass a stable `coalesce` key while dragging. Also `setPreset(id)`,
  `setSize(w, h)`, `select(i)`, `replace(scene)`, `undo()`, `redo()`, and
  `on('change'|'select'|'ui'|'history'|'view', fn)`.
- `store.ui.editPath` (bool) says whether the on-canvas path editor is active.
  `store.ui.pathTarget` is `'a' | 'b'` (main path or morph target).
- `TM.Studio.registerPanel({ id, title, order, when?(store), build(store, body) → { update() } })`
  adds an inspector panel. An id matching a built-in panel replaces it. Built-in ids and
  orders: `text` 10, `motion` 20, `path` 30, `color` 40, `fx` 50, `canvas` 60.
- `TM.Studio.PathEditor` is a class. `app.js` constructs it as
  `new PathEditor(store, svgOverlay, () => view)` where
  `view = { cssW, cssH, scale }`; the overlay's viewBox is in artboard CSS px.
- `TM.Studio.openExport(store)` and `TM.Studio.openShare(store)` open dialogs (export team).
- `TM.Studio.controls` and `TM.Studio.h` are the shared control factories and the DOM helper.
- `TM.Studio.toast(msg, kind)` shows a short notification.

## Ownership

Each team edits only its own files and its own array in `js/boot.js`. Cross-team needs go
through the APIs above. If something outside your files is broken, report it; don't patch
it.
