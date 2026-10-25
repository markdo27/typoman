/* Preset: Spiral — the text winds along a generated Archimedean spiral.
 * Unlike Orbit and Tunnel, which carry text on rings of a user path, the spiral itself
 * is generated here: glyphs are laid out by arc length from the centre outward, each
 * turned to the spiral's tangent. The spiral breathes (one cycle) and spins (whole
 * turns), so the loop is seamless; long text compresses its spacing to stay on the
 * spiral rather than running off it.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp } = TM.math;
  const N = 720; // spiral samples

  TM.registerPreset({
    id: 'spiral',
    name: 'Spiral',
    category: 'Generative',
    description: 'Your text winds outward along a spiral, turning with the curve as it breathes and spins.',
    params: [
      TM.P.range('turns', 'Turns', 1, 4, 0.5, 2.5, { group: 'Spiral', hint: 'How many times the spiral winds round' }),
      TM.P.range('size', 'Size (frame)', 0.2, 0.48, 0.01, 0.42, { group: 'Spiral', hint: 'Outer radius of the spiral, as a share of the frame' }),
      TM.P.range('spacing', 'Spacing', 0.8, 1.5, 0.01, 1, { group: 'Spiral', hint: 'Letter spacing along the spiral, × the layout advance' }),
      TM.P.range('spin', 'Spin (turns per loop)', -2, 2, 1, 1, { group: 'Spiral', hint: 'Whole turns keep the loop seamless' }),
      TM.P.range('breathe', 'Breathe', 0, 1, 0.01, 0.3, { group: 'Spiral', hint: 'How much the spiral swells and tightens each loop' }),
    ],

    setup(f) {
      const L = f.layout, P = f.params;
      const turns = Math.max(0.5, P.turns);
      // Unit spiral: radius grows linearly with angle, from the inner radius to 1.
      const build = (r0) => {
        const xs = [], ys = [], cum = [0];
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i <= N; i++) {
          const th = (TAU * turns * i) / N;
          const r = r0 + (1 - r0) * (th / (TAU * turns));
          const x = r * Math.cos(th), y = r * Math.sin(th);
          xs.push(x); ys.push(y);
          if (i) cum.push(cum[i - 1] + Math.hypot(x - xs[i - 1], y - ys[i - 1]));
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        for (let i = 0; i <= N; i++) { xs[i] -= cx; ys[i] -= cy; }
        return { xs, ys, cum };
      };
      // Glyphs in layout order, lines joined by a word gap; spaces step the arc but
      // are not drawn. Each item's arc position is its centre along the spiral.
      const items = [];
      let s = 0, prevLine = -1;
      for (const g of L.glyphs) {
        if (g.line !== prevLine) { if (prevLine >= 0) s += f.size * 0.6; prevLine = g.line; }
        const step = g.w * P.spacing;
        if (!g.isSpace) items.push({ g, s: s + step / 2 });
        s += step;
      }
      const scale = f.unit * P.size;
      let geo = build(0.08);
      let capacity = geo.cum[N] * scale;
      let k = s > 0 ? Math.min(1, capacity / s) : 1;
      // Centre fit guard (Round 5): the old code compressed advances (k < 1) but drew
      // glyphs at full size, so long text piled into a knot at the tight centre
      // (inner radius 0.08 of the frame, first glyphs ~20 px from the centre at
      // 65 px type, adjacent centres ~13–20 px apart for ~40 px glyphs). Two guards,
      // both continuous at k = 1 so short text is byte-identical to before:
      //  - the inner radius grows with the compression, from 0.08 up to 0.28, so the
      //    innermost turn has room for its glyphs instead of curling under them;
      //  - glyphs scale down with the same factor k as their advances, so a compressed
      //    run keeps its advance/width ratio (like Draw On's fit) instead of overlapping.
      // Very long text therefore gets smaller, not knotted; it is never truncated.
      let r0 = 0.08;
      if (k < 1) {
        r0 = Math.min(0.28, 0.08 + (1 - k) * 0.35);
        geo = build(r0);
        capacity = geo.cum[N] * scale;
        k = s > 0 ? Math.min(1, capacity / s) : 1;
      }
      for (const it of items) it.s *= k;
      return { xs: geo.xs, ys: geo.ys, cum: geo.cum, items, scale, total: s * k, glyphScale: k, innerRadius: r0 };
    },

    render(f) {
      const P = f.params, C = f.cache;
      if (!C || !C.items.length) return;
      const breathe = 1 + P.breathe * 0.12 * Math.sin(TAU * f.p);
      const rot = Math.round(P.spin) * TAU * f.p;
      const eff = C.scale * breathe;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      let idx = 0;
      for (const it of C.items) {
        const target = it.s / eff;
        while (idx < N && C.cum[idx + 1] < target) idx++;
        const c0 = C.cum[idx], c1 = C.cum[Math.min(N, idx + 1)];
        const t = c1 > c0 ? clamp((target - c0) / (c1 - c0), 0, 1) : 0;
        const j = Math.min(N, idx + 1);
        const ux = C.xs[idx] + (C.xs[j] - C.xs[idx]) * t;
        const uy = C.ys[idx] + (C.ys[j] - C.ys[idx]) * t;
        // Tangent from the chord across this sample, so letters don't snap at kinks.
        const a = Math.max(0, idx - 2), b = Math.min(N, idx + 2);
        const ang = Math.atan2(C.ys[b] - C.ys[a], C.xs[b] - C.xs[a]) + rot;
        const x = f.cx + (ux * cos - uy * sin) * eff;
        const y = f.cy + (ux * sin + uy * cos) * eff;
        f.drawGlyph(it.g, { x, y, rot: ang, scale: C.glyphScale != null ? C.glyphScale : 1 });
      }
    },

    looks: [
      { name: 'Nautilus', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Fraunces', weight: 700 }, fill: { type: 'solid', color: '#141414' }, params: { turns: 3, breathe: 0.2 } } },
      { name: 'Vinyl', bg: { type: 'solid', color: '#0b0b0c' }, layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'palette', palette: ['#faff00', '#ff2e88', '#00f0ff'] }, params: { turns: 2, spin: 2, breathe: 0.5 } } },
      { name: 'Galaxy', bg: { type: 'radial', color: '#1b1640', color2: '#05030f' }, layer: { font: { family: 'Unbounded', weight: 700 }, fill: { type: 'gradient', color: '#ffe8a3', color2: '#ff6ad5', angle: 120 }, params: { turns: 3.5, size: 0.46, spin: -1 } } },
    ],
  });
})(window.TM);
