/* Motion kit — shared helpers for the reveal, glitch & dimensional presets (preset team B).
 * Registers no preset, so the standalone exporter always ships it with them.
 *
 *   MotionKit.windows(P)               in/out lengths exactly as f.seq() normalises them
 *   MotionKit.seqAt(f, r, p?)          f.seq() for things that aren't glyphs (slats, shots), at rank r
 *   MotionKit.rankOf(f, i, n, order)   stagger rank of item i of n (same order names as TM.ORDERS)
 *   MotionKit.slope(fn, x)             numerical slope of an easing
 *   MotionKit.affine(f, A, B, C, D)    drawGlyph options for the glyph matrix [[A, C], [B, D]], keeping slant
 *   MotionKit.units(L, by)             the text split into 'lines' or 'words' with their layout bounds
 *   MotionKit.canvas(w, h)             a small scratch canvas
 *   MotionKit.counterOf(…)             the largest enclosed hole of a glyph (for camera dives)
 *   MotionKit.portal(f, L, u, counters) where a camera dives through a unit: a counter, else a gap
 *
 * Photosensitivity (for presets with a flashes(layer, scene) method and a fast-flashing guard):
 *   MotionKit.FLASH                    the rules (as TM.Safety counts them): ≤ 3 flashes/s; large =
 *                                      ≥ 25 % of a 10° field (a third of the frame by a third) by ≥ 0.1
 *                                      relative luminance, or to or from saturated red
 *   MotionKit.swing(share, a, b)       is a change over `share` of a field between colours a and b large
 *   MotionKit.fieldShare(ink, w, h, W, H) the most of one 10° field that ink spread over a w × h box covers
 *   MotionKit.ghostAlpha(inks, backs)  the highest alpha at which ink over its backdrop can never flash
 *   MotionKit.flashRate(times, period) flashes per second of transitions on a repeating timeline
 *   MotionKit.frameOf(layer, scene, preset) the layout, size, seed and pass length outside a frame
 *   MotionKit.inkOf, inkSpread, inkColors, backdrops, luminance, passOf   their ingredients
 */
(function (TM) {
  'use strict';
  const { clamp } = TM.math;
  // Glyphs that usually have a counter (Hebrew ם ס ט; Arabic ه ة ف ق و م ص ض ط ظ). An RTL word
  // is one cluster, rasterised whole, so its hole is found inside the word.
  const CANDIDATE = /[ABDOPQRabdegopq04689@&%#\u05D8\u05DD\u05E1\u0629\u0635-\u0638\u0641\u0642\u0645\u0647\u0648]/u;

  function windows(P) {
    if (P.timing === 'loop') return { inDur: 0, outDur: 0 };
    let inDur = P.inDur != null ? P.inDur : 0.4;
    let outDur = P.timing === 'in' ? 0 : P.outDur != null ? P.outDur : 0.3;
    const sum = inDur + outDur;
    if (sum > 1) { inDur /= sum; outDur /= sum; }
    return { inDur, outDur };
  }

  function seqAt(f, r, p = f.p) {
    const P = f.params, { inDur, outDur } = windows(P);
    const st = P.stagger != null ? P.stagger : 0.5;
    const kin = inDur > 0 ? f.stagger(p / inDur, r, st) : 1;
    const kout = outDur > 0 ? f.stagger((p - (1 - outDur)) / outDur, r, st) : 0;
    return {
      kin, kout, r,
      vin: TM.ease(P.easeIn || 'glide')(kin),
      vout: TM.ease(P.easeOut || 'inCubic')(kout),
      visible: kin > 0 && kout < 1,
    };
  }

  function rankOf(f, i, n, order) {
    const u = n > 1 ? i / (n - 1) : 0;
    switch (order) {
      case 'end': return 1 - u;
      case 'center': return n > 1 ? Math.abs(u - 0.5) * 2 : 0;
      case 'edges': return n > 1 ? 1 - Math.abs(u - 0.5) * 2 : 0;
      case 'random': return f.rand(i, 9173);
      default: return u;
    }
  }

  function slope(fn, x) {
    const h = 0.004, a = Math.max(0, x - h), b = Math.min(1, x + h);
    return b > a ? (fn(b) - fn(a)) / (b - a) : 0;
  }

  /**
   * (A, B) is where the glyph's local +x lands and (C, D) its local +y, in frame px per glyph px.
   * drawGlyph builds rot · [[sx, tk·sy], [0, sy]] with tk = −tan(skew + slant); the layer's italic
   * shear is folded into the target first, so slanted type stays slanted on the surface.
   */
  function affine(f, A, B, C, D) {
    const ts = Math.tan(f.slant);
    const C2 = C - A * ts, D2 = D - B * ts;
    const rot = Math.atan2(B, A);
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const k12 = cs * C2 + sn * D2, k22 = -sn * C2 + cs * D2;
    if (Math.abs(k22) < 1e-5) return null;
    return { rot, sx: Math.hypot(A, B), sy: k22, skew: -Math.atan(clamp(k12 / k22, -8, 8)) - f.slant };
  }

  /** [{ glyphs: [non-space glyph indices], x0, x1, cx, cy, line }] in layout space. */
  function units(L, by) {
    const map = new Map();
    for (const g of L.glyphs) {
      if (g.isSpace) continue;
      const key = by === 'words' ? g.word : g.line;
      let u = map.get(key);
      if (!u) { u = { glyphs: [], x0: Infinity, x1: -Infinity, cy: 0, line: g.line }; map.set(key, u); }
      u.glyphs.push(g.i);
      u.x0 = Math.min(u.x0, g.x);
      u.x1 = Math.max(u.x1, g.x + g.w);
      u.cy += g.cy;
    }
    return [...map.values()].map((u) => Object.assign(u, { cx: (u.x0 + u.x1) / 2, cy: u.cy / u.glyphs.length, w: u.x1 - u.x0 }));
  }

  /** A small scratch canvas (presets keep these in their cache, sized to what they need). */
  function canvas(w, h) {
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1);
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  /**
   * Largest enclosed hole of ch: { dx, dy } from the glyph's centre (advance centre, cap-height
   * centre), its area, and its width and height cw, ch, all in px at `size`; or null. Found by
   * rasterising the glyph at 96 px and flooding the outside from the border: whatever empty space
   * is left is a counter. Measured at that one size, so every render size aims at the same
   * point, and memoised per font and glyph.
   */
  const holes = new Map();
  let hctx = null;
  function counterOf(family, weight, ch, size) {
    const key = family + '\u0001' + weight + '\u0001' + ch + '\u0001' + TM.fonts.version();
    let u = holes.get(key);
    if (u === undefined) {
      u = measureHole(TM.fonts.fontString(family, weight, 96), ch);
      if (holes.size > 400) holes.delete(holes.keys().next().value);
      holes.set(key, u);
    }
    if (!u) return null;
    const k = size / 96;
    return { dx: u.dx * k, dy: u.dy * k, area: u.area * k * k, cw: u.cw * k, ch: u.ch * k };
  }

  function measureHole(font, ch) {
    if (!hctx) hctx = canvas(8, 8).getContext('2d', { willReadFrequently: true });
    const ctx = hctx;
    ctx.font = font;
    const adv = ctx.measureText(ch).width, capH = ctx.measureText('H').actualBoundingBoxAscent || 96 * 0.7;
    const w = Math.ceil(adv + 16), h = Math.ceil(capH * 1.6 + 16);
    ctx.canvas.width = w; ctx.canvas.height = h; // resets the context
    ctx.font = font;
    const base = Math.round(8 + capH * 1.2);
    ctx.fillStyle = '#000';
    ctx.fillText(ch, 8, base);
    const data = ctx.getImageData(0, 0, w, h).data;
    const ink = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) ink[i] = data[i * 4 + 3] > 110 ? 1 : 0;
    const mark = new Int32Array(w * h);
    const stack = [];
    const flood = (seed, id) => {
      let n = 0, sx = 0, sy = 0;
      stack.push(seed);
      mark[seed] = id;
      while (stack.length) {
        const p = stack.pop(), x = p % w, y = (p - x) / w;
        n++; sx += x; sy += y;
        if (x > 0 && !ink[p - 1] && !mark[p - 1]) { mark[p - 1] = id; stack.push(p - 1); }
        if (x < w - 1 && !ink[p + 1] && !mark[p + 1]) { mark[p + 1] = id; stack.push(p + 1); }
        if (y > 0 && !ink[p - w] && !mark[p - w]) { mark[p - w] = id; stack.push(p - w); }
        if (y < h - 1 && !ink[p + w] && !mark[p + w]) { mark[p + w] = id; stack.push(p + w); }
      }
      return { n, x: sx / Math.max(1, n), y: sy / Math.max(1, n) };
    };
    for (let x = 0; x < w; x++) { if (!ink[x] && !mark[x]) flood(x, 1); const b = (h - 1) * w + x; if (!ink[b] && !mark[b]) flood(b, 1); }
    for (let y = 0; y < h; y++) { const l = y * w, r = l + w - 1; if (!ink[l] && !mark[l]) flood(l, 1); if (!ink[r] && !mark[r]) flood(r, 1); }
    let best = null, id = 2;
    for (let p = 0; p < w * h; p++) {
      if (ink[p] || mark[p]) continue;
      const hole = flood(p, id);
      if (hole.n > 12 && (!best || hole.n > best.n)) { best = hole; best.id = id; }
      id++;
    }
    if (!best) return null;
    // Hole extent, for how far a camera must zoom before the hole covers the frame.
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (let p = 0; p < w * h; p++) {
      if (mark[p] !== best.id) continue;
      const x = p % w, y = (p - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { dx: best.x - 8 - adv / 2, dy: best.y - (base - capH / 2), area: best.n, cw: x1 - x0 + 1, ch: y1 - y0 + 1 };
  }

  /**
   * Where a camera dives through unit u (from units()): the biggest counter near its middle,
   * else the widest gap between letters near the middle (open above and below), else the open
   * side of a lone letter. { x, y } in layout space, plus the hole's width cw and height ch
   * (Infinity: open). A dive about a point in the ink would fill the frame with ink.
   */
  function portal(f, L, u, counters = true) {
    const fam = f.layer.font.family, wt = f.layer.font.weight, em = L.sizePx;
    let best = null, score = -Infinity;
    if (counters) {
      for (const gi of u.glyphs) {
        const g = L.glyphs[gi];
        if (!CANDIDATE.test(g.ch)) continue;
        const hole = counterOf(fam, wt, g.ch, em);
        if (!hole) continue;
        const sc = Math.sqrt(hole.area) / L.capH - Math.abs(g.cx - u.cx) / Math.max(1, u.w);
        if (sc > score) { score = sc; best = { x: g.cx + hole.dx, y: g.cy + hole.dy, cw: hole.cw, ch: hole.ch, glyphs: [gi] }; }
      }
    }
    if (best) return best;
    const gs = u.glyphs.map((gi) => L.glyphs[gi]).sort((a, b) => a.x - b.x);
    for (let j = 0; j + 1 < gs.length; j++) {
      const a = gs[j], b = gs[j + 1], gap = b.x - a.x - a.w, gx = (a.x + a.w + b.x) / 2;
      const sc = gap / em - Math.abs(gx - u.cx) / Math.max(1, u.w);
      if (sc > score) { score = sc; best = { x: gx, y: (a.cy + b.cy) / 2, cw: Math.max(em * 0.04, gap + em * 0.04), ch: Infinity, glyphs: [a.i, b.i] }; }
    }
    if (best) return best;
    const g = gs[gs.length - 1] || { x: u.cx, w: 0, cy: u.cy };
    return { x: g.x + g.w + em * 0.3, y: g.cy, cw: em * 0.5, ch: Infinity, glyphs: g.i != null ? [g.i] : [] };
  }

  // ── photosensitivity (WCAG 2.3.1, ITU-R BT.1702; the reading TM.Safety.flashes measures) ──
  // At most three flashes in any one second. A flash is a pair of opposing transitions. A
  // transition is large when at least a quarter of some 10° field (full-screen playback: a third
  // of the frame by a third) changes relative luminance by 0.1 or more with the darker state
  // below 0.8, or changes to or from saturated red. Fast motion counts: big strokes sweeping
  // across a field are transitions as surely as a cut is.
  const FLASH = { area: 0.25, step: 0.1, dark: 0.8, perSec: 3 };

  const lums = new Map();
  /** { Y: relative luminance (linear light), l: Rec. 709 luma of the sRGB values, red: saturated-red quantity } of a hex colour. */
  function luminance(hex) {
    let v = lums.get(hex);
    if (!v) {
      const c = TM.color.parse(hex);
      const lin = (u) => { u /= 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); };
      const R = lin(c.r), G = lin(c.g), B = lin(c.b);
      // red: TM.Safety's saturated-red quantity, (R − G − B) × 320 while R / (R + G + B) ≥ 0.8.
      v = { Y: 0.2126 * R + 0.7152 * G + 0.0722 * B, l: (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255, red: R + G + B > 0 && R / (R + G + B) >= 0.8 ? Math.max(0, R - G - B) * 320 : 0 };
      if (lums.size > 512) lums.clear();
      lums.set(hex, v);
    }
    return v;
  }

  /** The colours a layer's backdrop can have. A transparent frame may land on black or white. */
  function backdrops(bg) {
    if (!bg || bg.type === 'transparent') return ['#000000', '#ffffff'];
    return bg.type === 'solid' ? [bg.color] : [bg.color, bg.color2];
  }

  /**
   * Is a change over `share` of a 10° field between colours a and b a large transition?
   * a, b: hex colours, or arrays of candidates (the worst pair counts). Models estimate areas,
   * so they count from 80 % of each threshold (MARGIN): a guard then holds with room to spare.
   */
  const MARGIN = 0.8;
  function swing(share, a, b) {
    if (!(share >= FLASH.area * MARGIN)) return false;
    for (const x of [].concat(a)) {
      for (const y of [].concat(b)) {
        const A = luminance(x), B = luminance(y);
        if (Math.abs(A.Y - B.Y) >= FLASH.step * MARGIN && Math.min(A.Y, B.Y) < FLASH.dark) return true;
        if ((A.red || B.red) && Math.abs(A.red - B.red) >= 20 * MARGIN) return true;
      }
    }
    return false;
  }

  /**
   * The most of one 10° field (W/3 × H/3) that `ink` px², spread evenly over a w × h box, can
   * change. Measured as TM.Safety measures it: on a 24 × 24 grid of cells, where a cell changes
   * once about a tenth of it does at full contrast, so a thin stroke changes a whole column of
   * cells (the box grows by a cell, and ink a quarter as dense still counts).
   */
  function fieldShare(ink, w, h, W, H) {
    if (!(ink > 0) || !(w > 0) || !(h > 0)) return 0;
    const fw = W / 3, fh = H / 3;
    return Math.min(1, (4 * ink) / (w * h)) * (Math.min(w + W / 24, fw) * Math.min(h + H / 24, fh)) / (fw * fh);
  }

  /** The highest alpha at which ink of these colours over these backdrops never makes a large transition. */
  function ghostAlpha(inks, backs) {
    let lo = 0, hi = 1;
    const ok = (a) => [].concat(backs).every((bk) => !swing(1, [].concat(inks).map((c) => TM.color.mix(bk, c, a)), bk));
    if (ok(1)) return 1;
    for (let n = 0; n < 10; n++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
    return lo;
  }

  /** How much a layer's effects spread its ink (glow halo, stroke, extrusion), as an area factor. */
  function inkSpread(layer) {
    const fx = layer.fx, st = layer.stroke;
    return 1 + 0.8 * (fx.glow.amount || 0) + (st.mode === 'both' ? 4 * st.width : 0) + 0.6 * (fx.extrude.depth || 0) + 0.3 * (fx.shadow.amount || 0);
  }

  /**
   * Flashes per second: the most large transitions (`times`, seconds into a pass of `period` s
   * that repeats) in any one-second window, halved. Windows wrap across the loop. Modelled
   * times are exact, rendered ones land on frames, so a window here is 60 ms longer than a
   * second: two events a hair over a second apart still count together.
   */
  const WINDOW = 1.06;
  function flashRate(times, period) {
    const n = times.length;
    if (!n || !(period > 0)) return 0;
    const base = times.map((x) => ((x % period) + period) % period).sort((a, b) => a - b);
    const U = [];
    for (let k = 0, K = Math.ceil(WINDOW / period) + 1; k <= K; k++) for (const x of base) U.push(x + k * period);
    let best = 0;
    for (let i = 0, j = 0; i < n; i++) {
      if (j < i) j = i;
      while (j < U.length && U[j] < U[i] + WINDOW) j++;
      if (j - i > best) best = j - i;
    }
    return best / 2;
  }

  const inks = new Map();
  let ictx = null;
  /** Ink area of one cluster at font size `size` (px²), measured once at 100 px. */
  function inkOf(family, weight, ch, size) {
    const key = family + '\u0001' + weight + '\u0001' + ch + '\u0001' + TM.fonts.version();
    let a = inks.get(key);
    if (a === undefined) {
      if (!ictx) ictx = canvas(8, 8).getContext('2d', { willReadFrequently: true });
      const font = TM.fonts.fontString(family, weight, 100);
      ictx.font = font;
      const m = ictx.measureText(ch);
      const x0 = Math.ceil(Math.max(0, m.actualBoundingBoxLeft || 0)) + 2, y0 = Math.ceil(Math.max(0, m.actualBoundingBoxAscent || 100)) + 2;
      const w = x0 + Math.ceil(Math.max(1, m.actualBoundingBoxRight || 100)) + 2, h = y0 + Math.ceil(Math.max(0, m.actualBoundingBoxDescent || 0)) + 2;
      ictx.canvas.width = w; ictx.canvas.height = h; // resets the context
      ictx.font = font;
      ictx.fillText(ch, x0, y0);
      const d = ictx.getImageData(0, 0, w, h).data;
      let s = 0;
      for (let i = 3; i < d.length; i += 4) s += d[i];
      a = s / 255 / 10000;
      if (inks.size > 800) inks.delete(inks.keys().next().value);
      inks.set(key, a);
    }
    return a * size * size;
  }

  /**
   * What the renderer hands render(f), rebuilt for code that runs outside a frame (a preset's
   * flashes(layer, scene)): the layer as drawn (font instance), its layout (fitted as the
   * renderer fits it), frame size, seed, and how long one pass lasts in real seconds (the loop
   * over the layer's cycles). It inherits TM.Frame, so f.rand, f.srand, f.rank, f.stagger and
   * f.seq(g, p) behave exactly as in render; nothing that draws is set up.
   */
  function frameOf(layer, scene, preset) {
    const W = scene.size.w, H = scene.size.h, unit = Math.min(W, H);
    const lay = TM.Renderer && TM.Renderer.typeset ? TM.Renderer.typeset(layer, scene) : layer;
    const opts = { text: lay.text, family: lay.font.family, weight: lay.font.weight, sizePx: Math.max(1, lay.type.size * unit), tracking: lay.type.tracking, leading: lay.type.leading, align: lay.type.align, case: lay.type.case };
    let L = TM.text.layout(opts);
    if (preset.fit && L.width > 0) {
      const k = Math.min(1, (W * (preset.fitWidth || 0.9)) / L.width, L.height > 0 ? (H * (preset.fitHeight || 0.86)) / L.height : 1);
      if (k < 0.999) L = TM.text.layout(Object.assign(opts, { sizePx: Math.max(1, opts.sizePx * k) }));
    }
    let index = scene.layers.indexOf(layer);
    if (index < 0) index = Math.max(0, scene.layers.findIndex((l) => l.id === layer.id));
    const seed = (scene.seed + index * 1013) | 0;
    const cycles = layer.time && layer.time.cycles > 0 ? layer.time.cycles : 1;
    const fr = Object.create(TM.Frame.prototype);
    return Object.assign(fr, {
      layer: lay, params: layer.params, layout: L, glyphs: L.glyphs, lines: L.lines, size: L.sizePx,
      W, H, unit, seed, dur: scene.duration, bg: scene.bg, p: 0, t: 0, alpha: 1, echo: 0,
      cx: layer.anchor.x * W, cy: layer.anchor.y * H, pass: scene.duration / cycles,
    });
  }

  /** The real length of one pass of the layer being rendered (the loop over its cycles), from a frame. */
  function passOf(f) {
    const tm = f.layer.time;
    return f.dur / (tm && tm.cycles > 0 ? tm.cycles : 1);
  }

  /** The hex colours a layer's ink can take (for flash contrast): fill stops or palette. */
  function inkColors(layer) {
    const fill = layer.fill;
    if (fill.type === 'palette') return fill.palette.slice();
    if (fill.type === 'gradient') return [fill.color, fill.color2];
    return [fill.color];
  }

  TM.MotionKit = {
    windows, seqAt, rankOf, slope, affine, units, canvas, counterOf, portal,
    FLASH, luminance, backdrops, swing, fieldShare, ghostAlpha, flashRate, inkOf, inkSpread, frameOf, passOf, inkColors,
  };
})(window.TM);
