/* Motion kit — shared helpers for the reveal, glitch & dimensional presets (preset team B).
 * Registers no preset, so the standalone exporter always ships it with them.
 *
 *   MotionKit.windows(P)               in/out lengths exactly as f.seq() normalises them
 *   MotionKit.seqAt(f, r, p?)          f.seq() for things that aren't glyphs (slats, shots), at rank r
 *   MotionKit.rankOf(f, i, n, order)   stagger rank of item i of n (same order names as TM.ORDERS)
 *   MotionKit.slope(fn, x)             numerical slope of an easing
 *   MotionKit.affine(f, A, B, C, D)    drawGlyph options for the glyph matrix [[A, C], [B, D]], keeping slant
 *   MotionKit.units(L, by)             the text split into 'lines' or 'words' with their layout bounds
 */
(function (TM) {
  'use strict';
  const { clamp } = TM.math;

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

  TM.MotionKit = { windows, seqAt, rankOf, slope, affine, units };
})(window.TM);
