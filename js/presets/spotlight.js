/* Preset: Spotlight — a soft light travels your path and reveals type that is otherwise
 * nearly invisible. The unlit text sits as a faint, kerned imprint; the lit text is drawn into a
 * scratch buffer and masked per pixel by the light's falloff, so the edge of the pool cuts
 * through letters like a real spot (soft or hard). Letters under the light lift a touch and,
 * on variable fonts, gain weight. A haze of glow and a slow, seamless flicker sell the beam.
 * On an open path the light sweeps only the stretch that passes the type, turning just past the
 * outermost letters, so it never dwells on empty ends.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp, lerp, fract, pingpong } = TM.math;
  const K = TM.PathKit;

  /**
   * A view of a scratch buffer whose origin sits at frame px (o.x, o.y): transforms are given in
   * frame px and shifted into the buffer, so drawGlyph places glyphs and anchors a gradient fill
   * exactly as on the frame (a gradient drawn straight into an offset buffer lands shifted).
   */
  const views = new WeakMap();
  function offsetView(ctx) {
    let v = views.get(ctx);
    if (v) return v;
    const o = { x: 0, y: 0 };
    const proxy = new Proxy(ctx, {
      get(t, k) {
        if (k === 'setTransform') return (a, b, c, d, e, g) => (typeof a === 'object' ? t.setTransform(a) : t.setTransform(a, b, c, d, e - o.x, g - o.y));
        if (k === 'getTransform') return () => { const m = t.getTransform(); m.e += o.x; m.f += o.y; return m; };
        const val = t[k];
        return typeof val === 'function' ? val.bind(t) : val;
      },
      set(t, k, val) { t[k] = val; return true; },
    });
    v = { proxy, o };
    views.set(ctx, v);
    return v;
  }

  /**
   * Where the light goes on this path. Open paths: the stretch that passes the type (nearest
   * points of the outermost letters, plus a little), travelled there and back. Closed paths: the
   * whole loop, starting where it passes nearest the type, with time spread by how close the type
   * is: the light glides over the letters and hurries across empty stretches (a smooth, monotonic
   * re-timing of arc length, so laps still close exactly).
   */
  const spans = new WeakMap();
  const N = 240;
  function span(f, path, R) {
    const L = f.layout, key = [K.keyOf(L), f.cx.toFixed(1), f.cy.toFixed(1), R.toFixed(1)].join('|');
    const hit = spans.get(path);
    if (hit && hit.key === key) return hit;
    const pts = [];
    for (let k = 0; k <= N; k++) pts.push(path.at((path.length * k) / N));
    const glyphs = L.glyphs.filter((g) => !g.isSpace).map((g) => [f.cx + g.cx, f.cy + g.cy]);
    const near = pts.map((p) => glyphs.reduce((m, [x, y]) => Math.min(m, (p.x - x) ** 2 + (p.y - y) ** 2), Infinity));
    let s0 = Infinity, s1 = -Infinity;
    for (const [qx, qy] of glyphs) {
      let best = Infinity, bk = 0;
      for (let k = 0; k <= N; k++) { const d = (pts[k].x - qx) ** 2 + (pts[k].y - qy) ** 2; if (d < best) { best = d; bk = k; } }
      const s = (path.length * bk) / N;
      s0 = Math.min(s0, s);
      s1 = Math.max(s1, s);
    }
    const out = { key };
    // Turn a little past the outermost letters, so the pool still grazes them at the ends.
    out.s0 = Number.isFinite(s0) ? clamp(s0 - R * 0.35, 0, path.length) : 0;
    out.s1 = Number.isFinite(s1) ? clamp(s1 + R * 0.35, 0, path.length) : path.length;
    if (path.closed && glyphs.length) {
      // Dwell weight per sample (5× slower over the type), cumulated from the nearest point.
      const w = near.map((d2) => 0.25 + Math.exp(-d2 / (R * R)));
      let start = 0;
      for (let k = 1; k < N; k++) if (near[k] < near[start]) start = k;
      const cum = new Float64Array(N + 1);
      for (let k = 0; k < N; k++) cum[k + 1] = cum[k] + (w[(start + k) % N] + w[(start + k + 1) % N]) / 2;
      for (let k = 0; k <= N; k++) cum[k] /= cum[N];
      out.start = (path.length * start) / N;
      out.cum = cum;
    }
    spans.set(path, out);
    return out;
  }

  /** Arc length on a closed path at re-timed lap fraction u (inverse of the dwell table). */
  function lapAt(sp, path, u) {
    const cum = sp.cum;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= u) lo = mid; else hi = mid; }
    const t = (u - cum[lo]) / Math.max(1e-12, cum[hi] - cum[lo]);
    return sp.start + ((lo + clamp(t)) / N) * path.length;
  }

  TM.registerPreset({
    id: 'spotlight',
    name: 'Spotlight',
    category: 'Path',
    description: 'A soft light travels your path and reveals type that is otherwise nearly invisible.',
    usesPath: true,
    path: 'line',
    fit: true,
    params: [
      TM.P.range('radius', 'Light radius', 0.05, 0.6, 0.005, 0.21, { group: 'Light', hint: '× the frame’s short side' }),
      TM.P.range('falloff', 'Falloff', 0.05, 1, 0.01, 0.65, { group: 'Light', hint: 'How soft the edge of the pool is' }),
      TM.P.toggle('hard', 'Hard edge', false, { group: 'Light', hint: 'A crisp theatre spot with a rim' }),
      TM.P.range('glow', 'Glow', 0, 1, 0.01, 0.45, { group: 'Light' }),
      TM.P.range('flicker', 'Flicker', 0, 1, 0.01, 0.15, { group: 'Light' }),
      TM.P.range('dark', 'Unlit type', 0, 0.5, 0.005, 0.07, { group: 'Type', hint: 'How visible the type is outside the light' }),
      TM.P.range('lift', 'Lift in light', 0, 0.4, 0.01, 0.08, { group: 'Type' }),
      TM.P.range('weight', 'Weight in light', 0, 1, 0.01, 0.8, { group: 'Type', hint: 'Variable fonts only' }),
      TM.P.range('laps', 'Passes per loop', 1, 4, 1, 1, { group: 'Motion', hint: 'Open paths go there and back' }),
      TM.P.ease('travel', 'Travel ease', 'inOutSine', { group: 'Motion' }),
    ],

    render(f) {
      const path = f.path;
      if (!path || path.length < 1) return;
      const P = f.params, L = f.layout;
      const ease = TM.ease(P.travel, 'inOutSine');
      const laps = Math.max(1, Math.round(P.laps));
      const R = P.radius * f.unit;
      // Closed paths: whole laps, lingering over the type. Open ones: there and back across the
      // stretch that passes the type.
      const sp = span(f, path, R);
      const c = path.closed
        ? path.at(sp.cum ? lapAt(sp, path, ease(fract(laps * f.p))) : ease(fract(laps * f.p)) * path.length)
        : path.at(lerp(sp.s0, sp.s1, ease(pingpong(laps * f.p))));
      const I = 1 - P.flicker * 0.45 * (0.5 + 0.5 * f.loopNoise(7, 5)); // seamless flicker
      const ctx = f.ctx;
      // The light takes the type's colour where it falls (for gradients, the gradient there).
      const here = f.colorOf({ vi: 0, cx: c.x - f.cx, cy: c.y - f.cy });

      // Unlit imprint: whole kerned lines (cheap, cached glyphs).
      if (f.echo === 0 && P.dark > 0) for (const line of L.lines) if (line.text.trim()) f.drawLine(line, { alpha: P.dark });

      // Haze under the type.
      if (P.glow > 0 && f.echo === 0) {
        f.identity();
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R * 1.25);
        const col = here;
        g.addColorStop(0, TM.color.rgba(col, 0.22 * P.glow * I));
        g.addColorStop(0.55, TM.color.rgba(col, 0.07 * P.glow * I));
        g.addColorStop(1, TM.color.rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(c.x, c.y, R * 1.25, 0, TAU);
        ctx.fill();
      }

      // Lit pass into a small canvas the size of the pool, masked there by the falloff, then
      // composited back: per-pixel light at a fraction of a full-frame buffer's cost.
      const x0 = Math.max(0, Math.floor(c.x - R - 2)), y0 = Math.max(0, Math.floor(c.y - R - 2));
      const x1 = Math.min(f.W, Math.ceil(c.x + R + 2)), y1 = Math.min(f.H, Math.ceil(c.y + R + 2));
      if (x1 <= x0 || y1 <= y0) return;
      const bw = x1 - x0, bh = y1 - y0;
      const buf = f.buffer('spot', bw, bh);
      const b = buf.ctx;
      const view = offsetView(b);
      view.o.x = x0;
      view.o.y = y0;
      const Wt = P.weight > 0 ? K.weights(f, P.weight) : null;
      let any = false;
      // Drawn in frame px through the offset view, so a gradient fill lines up with the imprint.
      f.drawInto(view.proxy, () => {
        for (const g of L.glyphs) {
          if (g.isSpace) continue;
          const x = f.cx + g.cx, y = f.cy + g.cy;
          const d = Math.hypot(x - c.x, y - c.y);
          if (d > R + f.size) continue;
          const w = clamp(1 - d / R);
          const o = { x, y, scale: 1 + P.lift * w * w, alpha: I };
          if (Wt) o.weight = K.quantWeight(lerp(Wt.base, Wt.hi, w));
          f.drawGlyph(g, o);
          any = true;
        }
      });
      if (!any) return;
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalAlpha = 1;
      b.globalCompositeOperation = 'destination-in';
      const inner = P.hard ? 0.985 : clamp(1 - P.falloff, 0, 0.95);
      const m = b.createRadialGradient(c.x - x0, c.y - y0, 0, c.x - x0, c.y - y0, R);
      m.addColorStop(0, 'rgba(0,0,0,1)');
      m.addColorStop(inner, 'rgba(0,0,0,1)');
      m.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = m;
      b.fillRect(0, 0, bw, bh);
      b.globalCompositeOperation = 'source-over';
      f.identity();
      ctx.globalAlpha = 1;
      ctx.drawImage(buf.canvas, 0, 0, bw, bh, x0, y0, bw, bh);
      if (P.hard && f.echo === 0) {
        ctx.save();
        K.strokeStyle(f, Math.max(1, f.unit * 0.002), 0.35 * I, here);
        ctx.beginPath();
        ctx.arc(c.x, c.y, R, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    },

    looks: [
      { name: 'Noir', bg: { type: 'solid', color: '#0b0b0c' }, post: { grain: 0.35, vignette: 0.5 }, layer: { font: { family: 'Playfair Display', weight: 900 }, fill: { type: 'solid', color: '#f4f1ea' }, params: { hard: true, radius: 0.24, dark: 0.04, flicker: 0.3 }, path: 'line' } },
      { name: 'Torch', bg: { type: 'solid', color: '#120403' }, layer: { font: { family: 'Roboto Flex', weight: 300 }, fill: { type: 'solid', color: '#ffa600' }, fx: { glow: { amount: 0.4, color: '#ff4d00' } }, params: { radius: 0.18, glow: 0.8, weight: 1 }, path: 'infinity' } },
      { name: 'Blueprint', bg: { type: 'solid', color: '#03132e' }, layer: { font: { family: 'JetBrains Mono', weight: 700 }, fill: { type: 'solid', color: '#4cc9f0' }, params: { dark: 0.16, falloff: 0.9, radius: 0.28 }, path: 'scurve' } },
    ],
  });
})(window.TM);
