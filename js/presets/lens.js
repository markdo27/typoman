/* Preset: Lens — TYPOMAN's Radar look, now readable and path-driven.
 * The text is tiled across the frame in letter-spaced rows, small and dim (each row offset like
 * brickwork). A lens travels along your path (the path is its trajectory) and bulges the field:
 * letters near it are pushed apart and magnified, brighten, gain weight on variable fonts and,
 * in the rim, fan out to face away from the lens, while the core stays upright so the words
 * read under the glass. A radar ring with the text circling it rides on top.
 *
 * Magnification is a fold-free bulge, r' = r·(1 + A·w(x)), w = (1 + x²)⁻² with a smooth cutoff
 * at 2.2 R: monotonic up to 5×, no visible edge. Rows away from the lens are drawn as whole
 * kerned runs (one draw call each); only the stretch of a row under the lens is split into
 * glyphs, which keeps the field cheap and the kerning intact.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp, lerp, smoothstep, fract, pingpong, angleDelta } = TM.math;
  const K = TM.PathKit;
  const DEG = Math.PI / 180;
  const REACH = 2.2; // bulge radius in lens radii

  /** Bulge profile: 1 at the centre, smooth cutoff to 0 at REACH. */
  const prof = (x) => (1 / Math.pow(1 + x * x, 2)) * (1 - smoothstep(1.2, REACH, x));

  TM.registerPreset({
    id: 'lens',
    name: 'Lens',
    category: 'Path',
    description: 'A lens glides along your path over a dim field of your words, magnifying and brightening them so the text reads under the glass.',
    usesPath: true,
    path: 'infinity',
    params: [
      TM.P.range('radius', 'Lens radius', 0.05, 0.4, 0.005, 0.15, { group: 'Lens', hint: '× the frame’s short side' }),
      TM.P.range('mag', 'Magnification', 1, 5, 0.05, 2.5, { group: 'Lens' }),
      TM.P.range('swirl', 'Turn toward lens', 0, 1, 0.01, 0.75, { group: 'Lens', hint: 'Rim letters fan out round the lens; core letters stay upright' }),
      TM.P.range('weight', 'Weight boost', 0, 1, 0.01, 0.9, { group: 'Lens', hint: 'Variable fonts only' }),
      TM.P.select('ring', 'Lens ring', [['none', 'None'], ['ring', 'Ring'], ['label', 'Ring + label']], 'label', { group: 'Lens' }),
      TM.P.toggle('rays', 'Radar rays', false, { group: 'Lens' }),
      TM.P.range('laps', 'Laps per loop', 1, 4, 1, 1, { group: 'Motion', hint: 'Open paths go there and back' }),
      TM.P.ease('travel', 'Travel ease', 'inOutSine', { group: 'Motion' }),
      TM.P.range('density', 'Rows', 8, 36, 1, 15, { group: 'Field', hint: 'Rows of text across the frame’s short side' }),
      TM.P.range('spacing', 'Letter spacing (em)', 0, 2, 0.01, 0.5, { group: 'Field' }),
      TM.P.range('dim', 'Field brightness', 0.04, 0.8, 0.01, 0.26, { group: 'Field' }),
    ],

    setup(f) {
      // One kerned, letter-spaced run per row: the text (lines joined) repeated past the frame
      // width. Repeating to fill the field is the design; the text itself is never altered.
      const P = f.params, Ly = f.layer;
      const parts = f.layout.lines.map((l) => l.text.trim()).filter(Boolean);
      if (!parts.length) return { line: null };
      const unit = parts.join('   ') + '     ';
      const cell = f.unit / Math.round(P.density);
      const scale = (cell * 0.56) / f.size;
      const opts = { family: Ly.font.family, weight: Ly.font.weight, sizePx: f.size, tracking: Ly.type.tracking + P.spacing, leading: 1, align: 'left', case: Ly.type.case };
      const one = TM.text.layout(Object.assign({ text: unit }, opts));
      const repW = Math.max(1, one.width + one.tracking); // one repeat, in layout px
      const reps = clamp(Math.ceil(f.W / (repW * scale)) + 2, 2, Math.max(2, Math.floor(600 / unit.length)));
      const L = TM.text.layout(Object.assign({ text: unit.repeat(reps) }, opts));
      const line = L.lines[0];
      const x0 = L.glyphs[line.glyphs[0]].x;
      const rel = line.glyphs.map((gi) => L.glyphs[gi].x - x0); // left edge from run start
      const label = TM.text.layout(Object.assign({ text: unit }, opts, { tracking: Ly.type.tracking + 0.12 }));
      return { L, line, rel, repW, scale, cell, label };
    },

    render(f) {
      const path = f.path, C = f.cache;
      if (!path || path.length < 1 || !C.line) return;
      const P = f.params, W = f.W, H = f.H;
      const { L, line, rel, repW, scale, cell } = C;
      const glyphs = L.glyphs, idx = line.glyphs, n = idx.length;

      // Lens position: whole laps per loop on closed paths, there-and-back on open ones.
      const ease = TM.ease(P.travel, 'inOutSine');
      const laps = Math.max(1, Math.round(P.laps));
      const u = path.closed ? ease(fract(laps * f.p)) : ease(pingpong(laps * f.p));
      const lp = path.at(u * path.length);
      const Cx = lp.x, Cy = lp.y;
      const R = P.radius * f.unit, A = P.mag - 1;
      const reach = R * REACH;
      const Wt = P.weight > 0 ? K.weights(f, P.weight) : null;
      const rows = Math.ceil(H / cell) + 2;
      const oy = (H - (rows - 1) * cell) / 2;
      const runW = (rel[n - 1] + glyphs[idx[n - 1]].w) * scale;
      const near = [];
      const L0 = f.layout;
      f.layout = L; // drawLine / drawGlyph read font, tracking and cap height from the field layout

      try {
        for (let j = 0; j < rows; j++) {
          const y = oy + j * cell;
          const left = -fract(j * 0.382 + 0.17) * repW * scale - cell; // brickwork offset per row
          const dy = y - Cy;
          if (Math.abs(dy) >= reach) {
            if (f.echo === 0) run(f, line.text, left, runW, y, scale, P.dim);
            continue;
          }
          // Split the row: whole runs either side, single glyphs under the lens.
          const hw = Math.sqrt(reach * reach - dy * dy);
          let k0 = n, k1 = -1;
          for (let k = 0; k < n; k++) {
            const cx = left + (rel[k] + glyphs[idx[k]].w / 2) * scale;
            if (cx > Cx - hw && cx < Cx + hw) { if (k < k0) k0 = k; k1 = k; }
          }
          if (k1 < k0) { if (f.echo === 0) run(f, line.text, left, runW, y, scale, P.dim); continue; }
          if (f.echo === 0) {
            if (k0 > 0) run(f, slice(glyphs, idx, 0, k0), left, rel[k0] * scale, y, scale, P.dim);
            if (k1 < n - 1) run(f, slice(glyphs, idx, k1 + 1, n), left + rel[k1 + 1] * scale, runW - rel[k1 + 1] * scale, y, scale, P.dim);
          }
          for (let k = k0; k <= k1; k++) {
            const g = glyphs[idx[k]];
            if (g.isSpace) continue;
            near.push({ g, x: left + (rel[k] + g.w / 2) * scale, y });
          }
        }

        // Bulge, magnify, brighten, add weight; rim letters fan out, the core stays upright.
        const items = [];
        for (const it of near) {
          const dx = it.x - Cx, dy = it.y - Cy;
          const d = Math.hypot(dx, dy), x = d / R;
          const w = prof(x);
          const radial = 1 + A * w;
          const h = 0.01;
          const slope = 1 + A * (w + (x * (prof(x + h) - prof(Math.max(0, x - h)))) / (2 * h)); // dF/dr
          const sc = scale * Math.sqrt(radial * Math.max(0.05, slope));
          const core = smoothstep(0.4, 0.85, w);
          const rim = (1 - core) * smoothstep(0.02, 0.3, w);
          const rot = angleDelta(0, Math.atan2(dx, -dy)) * rim * P.swirl;
          const glow = clamp(w * 1.7);
          const o = { x: Cx + dx * radial, y: Cy + dy * radial, rot, scale: sc, alpha: lerp(P.dim, 1, glow) };
          if (Wt) o.weight = K.quantWeight(lerp(Wt.base, Wt.hi, glow));
          items.push({ g: it.g, o, z: sc, glow });
        }
        items.sort((a, b) => a.z - b.z); // magnified letters on top
        if (P.rays && f.echo === 0) rays(f, Cx, Cy, items);
        for (const it of items) f.drawGlyph(it.g, it.o);
        if (P.ring !== 'none' && f.echo === 0) ring(f, Cx, Cy, R * 1.25, P.ring === 'label' ? C.label : null);
      } finally {
        f.layout = L0;
      }
    },

    looks: [
      { name: 'Radar', bg: { type: 'solid', color: '#062925' }, layer: { font: { family: 'JetBrains Mono', weight: 700 }, fill: { type: 'solid', color: '#5cffc8' }, params: { rays: true, dim: 0.22 }, path: 'circle' } },
      { name: 'Loupe', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Playfair Display', weight: 700 }, fill: { type: 'solid', color: '#141414' }, params: { ring: 'ring', mag: 3, spacing: 0.3, dim: 0.2 } } },
      { name: 'Flex lens', bg: { type: 'solid', color: '#0b0b0c' }, layer: { font: { family: 'Roboto Flex', weight: 200 }, fill: { type: 'solid', color: '#d4ff3a' }, params: { weight: 1, mag: 2.8 }, path: 'infinity' } },
    ],
  });

  /** Text of glyphs a..b of the run (graphemes joined back), for drawing a partial row. */
  function slice(glyphs, idx, a, b) {
    let s = '';
    for (let k = a; k < b; k++) s += glyphs[idx[k]].ch;
    return s;
  }

  /** One kerned run of the field, left edge at x, through f.drawLine (fill modes, stroke, palette). */
  function run(f, text, x, width, y, scale, alpha) {
    if (x + width < 0 || x > f.W || !text.trim()) return;
    f.drawLine({ text, width: width / scale, index: 0 }, { x: x + width / 2, y, scale, alpha });
  }

  function rays(f, x, y, items) {
    const ctx = f.ctx;
    ctx.save();
    K.strokeStyle(f, Math.max(1, f.unit / 1080), 1);
    for (const it of items) {
      if (it.glow < 0.08) continue;
      ctx.globalAlpha = f.alpha * it.glow * 0.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(it.o.x, it.o.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The radar hub: a thin ring with ticks and, optionally, the text circling just outside. */
  function ring(f, x, y, r, label) {
    const ctx = f.ctx;
    const spin = TAU * f.p;
    ctx.save();
    K.strokeStyle(f, Math.max(1, f.unit * 0.0022), 0.55);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = f.alpha * 0.45;
    for (let k = 0; k < 24; k++) {
      const a = spin * 0.25 + (k / 24) * TAU, len = k % 6 === 0 ? 0.08 : 0.04;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a) * r * (1 - len), y + Math.sin(a) * r * (1 - len));
      ctx.stroke();
    }
    ctx.restore();
    if (!label) return;
    // The wordmark round the hub (as in the old Radar), stretched so whole repeats close the circle.
    const px = f.unit * 0.024, sc = px / f.size;
    const rr = r + px * 0.9;
    const circ = TAU * rr;
    const span = (label.width + label.tracking) * sc;
    const reps = Math.max(1, Math.floor(circ / span));
    const k = circ / (reps * span);
    const x0 = label.glyphs.length ? label.glyphs[0].x : 0;
    for (let rpt = 0; rpt < reps; rpt++) {
      for (const g of label.glyphs) {
        if (g.isSpace) continue;
        const s = (rpt * span + (g.x - x0 + g.w / 2) * sc) * k;
        const a = spin + s / rr - Math.PI / 2;
        f.drawGlyph(g, { x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, rot: a + Math.PI / 2, scale: sc, alpha: 0.8 });
      }
    }
  }
})(window.TM);
