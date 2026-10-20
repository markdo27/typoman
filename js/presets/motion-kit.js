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
 */
(function (TM) {
  'use strict';
  const { clamp } = TM.math;
  // Glyphs that usually have a counter (Hebrew ם ס ט; Arabic ه ة ف ق و م ص ض ط ظ). An RTL word
  // is one cluster, rasterised whole, so its hole is found inside the word.
  const CANDIDATE = /[ABDOPQRabdegopq04689@&%#טםסةص-ظفقمهو]/u;

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
        if (sc > score) { score = sc; best = { x: g.cx + hole.dx, y: g.cy + hole.dy, cw: hole.cw, ch: hole.ch }; }
      }
    }
    if (best) return best;
    const gs = u.glyphs.map((gi) => L.glyphs[gi]).sort((a, b) => a.x - b.x);
    for (let j = 0; j + 1 < gs.length; j++) {
      const a = gs[j], b = gs[j + 1], gap = b.x - a.x - a.w, gx = (a.x + a.w + b.x) / 2;
      const sc = gap / em - Math.abs(gx - u.cx) / Math.max(1, u.w);
      if (sc > score) { score = sc; best = { x: gx, y: (a.cy + b.cy) / 2, cw: Math.max(em * 0.04, gap + em * 0.04), ch: Infinity }; }
    }
    if (best) return best;
    const g = gs[gs.length - 1] || { x: u.cx, w: 0, cy: u.cy };
    return { x: g.x + g.w + em * 0.3, y: g.cy, cw: em * 0.5, ch: Infinity };
  }

  TM.MotionKit = { windows, seqAt, rankOf, slope, affine, units, canvas, counterOf, portal };
})(window.TM);
