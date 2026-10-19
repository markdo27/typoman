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
    font:{ family, weight, width /*wdth %, default 100*/, opsz /*'auto' | number*/ },
    type:{ size /*× unit*/, tracking /*em*/, leading, align, case, slant /*deg*/ },
    fill:{ type:'solid'|'gradient'|'palette', color, color2, angle, palette:[hex…] },
    stroke:{ mode:'none'|'outline'|'both', width /*em*/, color },
    path:{ closed, preset?, nodes:[{x,y,ix,iy,ox,oy,k}] } | null,   // normalised 0..1, handles relative
    pathMorph:{ enabled, keys:[path…] /*≤ 4*/, eases:[ease…], ease, mode:'pingpong'|'cycle',
                target /*= keys[0]*/ },                             // path keyframes over the loop
    fx:{ echo:{count,spacing,fade,palette}, blur 0..1, glow:{amount,color},
         shadow:{amount,angle,distance,color}, extrude:{depth,angle,color} },
    anchor:{ x, y },
    time:{ delay /*s*/, cycles /*1..8 whole loops*/, mode:'loop'|'once' /*once = play a pass, hold its end*/ } }] }
```

`path.preset` is set while the path is an untouched preset shape. Editors **must delete
it** when the user edits the path, which marks it as custom so it survives preset and
aspect switches.

### Variable fonts: width and optical size

Canvas text can only set weight, so `font.width` (the `wdth` axis) and `font.opsz` are
drawn through **instances**. These are aliases such as `"Roboto Flex ~w75o144"` whose faces
reuse the family's Google font files with a fixed `stretch` and `"opsz"` variation. Faces
that share a URL share one decoded font, so an instance costs about a font-family lookup.
Families declare their axes in the catalogue (`TM.fonts.axes(family)` →
`{ wdth?: [min, max], opsz?: [min, max] }`). Each family clamps `width` to its own range
when drawing, and the scene keeps the value as asked, so switching fonts and back keeps the
user's intent.

- **Presets see none of this.** The renderer hands `render(f)` the layer with
  `f.layer.font.family` already set to the instance. `drawGlyph`, `TM.text.layout(…)` and
  `TM.text.advance(…)` called with that family all draw the right letterforms.
- **`opsz: 'auto'`** is the text's size at the **scene's** resolution
  (`type.size × min(size.w, size.h)`), snapped to a few stops. The browser's own auto
  optical sizing follows *device* pixels instead, so a preview and an export would draw
  different letterforms and widths. Pinning makes every render size match.
- **`TM.fonts.resolve(font, designPx)`** returns the family to draw a `{ family, weight,
  width, opsz }` with, and creates and loads the instance on first use. It draws in the base
  family until then. `TM.fonts.ladder(family, 'wdth')` gives up to 49 evenly spaced widths
  for presets that sweep the axis, and `TM.fonts.baseOf(instance)` the catalogue family
  behind an instance.
- **`preset.fonts(layer, scene)`** (optional) lists the extra instance families a preset
  draws with. `TM.prepare` loads them before frame 0, so exports never catch an instance
  mid-load. Stack returns its width ladder this way.
- Without the `FontFace` `variationSettings` descriptor, a family is requested without its
  `opsz` axis. Google then serves it pinned at the default, so it is still stable, just not
  size-aware.

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
  fonts(layer, scene) { return [family, …] },  // optional: extra font instances render() draws with
  looks: [                    // optional, up to 8 curated starting points shown in the gallery
    { name: 'Neon Night', bg: { type: 'solid', color: '#07000f' },
      layer: { font: { family: 'Monoton' }, fill: { type: 'palette', palette: ['#ff00e5', '#00f0ff'] },
               fx: { glow: { amount: 0.6, color: '#ff00e5' } }, params: { … }, path: 'circle' } },
  ],
});
```

`TM.Scene.applyLook(scene, layerIndex, look)` merges a look into a layer and normalises the
result. It never touches the user's text.

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
| `f.params`, `f.layer`, `f.seed`, `f.cache`, `f.bg` | params, layer JSON, seed, `setup()` result, scene background `{ type, color, color2, angle }` |
| `f.path` | `TM.Path.SampledPath` in px (morph applied) or null |
| `f.echo`, `f.alpha` | echo index (0 = main pass) and alpha multiplier |

**Layout.** `L.glyphs[i] = { ch, i, vi /*visible index, -1 for spaces*/, line, li, word,
isSpace, x /*left*/, w /*advance*/, y /*baseline*/, cx, cy /*centre*/ }`, all relative to
the block centre. `L.lines[j] = { text, width, x, y, glyphs:[indices] }`, plus `L.capH`,
`L.lineGap`, `L.count` (visible glyphs), `L.words` and `L.font`. Lines that are mostly
right-to-left script (Arabic, Hebrew, …) lay out as **word clusters**: each word is one
shaped run, so Arabic keeps its joined forms. They are placed right to left and marked
`line.rtl`, and presets animate them word by word.

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
- `f.buffer(id, w?, h?)` returns a cleared scratch `{ canvas, ctx }`, pooled per id. It is
  frame-sized by default; pass a small size for blur pyramids or glyph stamps.
  `f.drawInto(ctx, fn)` points `f.ctx` (and so `drawGlyph`) at another context while
  `fn` runs; this is how Glitch composes its channel and slice passes.

**Paths.** `path.length` and `path.closed`. `path.at(s)` returns
`{ x, y, angle, tx, ty, nx, ny, inside }` (it wraps when closed and extrapolates past the
ends of open paths). Also `path.atU(u)`, `path.resample(n)`, `path.trace(ctx, s0, s1)` and
`TM.Path.preset(id, aspect)`, `fromPoints`, `fromPolyline`, `morph`, `toSVG`, `sample`.

**Path keyframes.** `layer.pathMorph.keys` holds up to 4 morph targets (B, C, …) that the
main path A visits each loop. `ease` eases A → B, and `eases[i]` eases the step out of
`keys[i]`. In `'pingpong'` (the default) the path plays A → … → last and back; with one key
that is the classic A → B → A. In `'cycle'` it plays A → … → last → A, and every step takes
an equal share of the loop. `target` mirrors `keys[0]`, so old scenes and links keep working.
Code that edits `keys` must also set `target = keys[0]`. The renderer calls
`TM.Path.sequence([A, …keys], pathMorph, p)`, and `TM.Path.keyTime(i, n, mode)` gives the
loop progress at which shape i is reached.

**Collision-free text on paths.**
- `path.offset(d)` gives the parallel curve d px to the normal side (negative = left of
  travel). Use it for lanes and for glyphs sitting above or below the line.
- `path.spaced(h)` re-parameterises the arc length so text gets `h·|turn|` of extra room at
  bends (curvature smoothed over ±h).
- Lay glyph centres out on `path.offset(centreOffset).spaced(capH / 2)` and letters stop
  colliding on concave curves and at sharp corners (Path Flow does this).

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
  `store.ui.pathTool` is `'edit' | 'pen' | 'draw'`. `store.ui.pathTarget` is the index of the
  edited shape: 0 is the main path A and i is `pathMorph.keys[i - 1]` (`'a'` and `'b'` still
  work). `store.ui.pathSel` lists the selected node indices.
  `TM.Studio.pathKeys` gives `list(layer)`, `index(store)`, `def(layer, i)`,
  `write(layer, i, def)` (keeps `target` = keys[0]) and `focus(store, i)`, which also parks
  the playhead where the loop reaches shape i.
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

## Export & embed API

```js
// Offline, frame-accurate export (formats: mp4 | webm | gif | png | pngseq)
const job = new AbortController();
const { blob, name, info } = await TM.Export.run(scene,
  { format: 'mp4', resolution: 1080, fps: 30, loops: 2, quality: 'high', transparent: false },
  { signal: job.signal, onProgress: (p) => {} });
// info: { codec, label, width, height, fps, frames, duration, bytes, notes[] }
```

MP4 tries H.264 first (High → Main → Baseline, with the level chosen from size × fps),
then AV1, then VP9. Without WebCodecs it falls back to real-time MediaRecorder. The
muxers in `vendor/` load only when an export starts.

```html
<!-- iframe player: options ride in the hash -->
<iframe src="embed.html#c=<TM.Scene.encode(scene)>&autoplay=1&loop=1&controls=0&bg=transparent&fit=contain"></iframe>

<!-- web component: loads boot.js from its own URL, works cross-origin -->
<script src="player.js" defer></script>
<typoman-player scene="<code>" autoplay loop controls fit="contain"></typoman-player>
```

Both pause offscreen and when the tab is hidden, and show a still frame under
`prefers-reduced-motion`. `TM.Export` can also build a self-contained HTML file that
inlines the engine and only the presets the scene uses.

## Studio additions (UI team)

- Layer helpers: `store.addLayer()`, `duplicateLayer()`, `removeLayer()`, `moveLayer()`,
  `setLayerVisible()` and `renameLayer()`.
- `store.undoLabel` and `store.redoLabel`.
- A `'save'` event.
- `TM.Studio.toast(msg, kind, ms, { label, run })` adds an action button.
- The `'view'` event also carries `{ zoom, fit }`.
