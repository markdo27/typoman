/* Preset: Ribbon — your text printed on a 3D ribbon that follows the path and twists.
 * The band's cross-section turns about the path tangent, so its projected half-width is
 * (w/2)·cos θ with θ = 2π·(twists·s/L − speed·p): whole twists along a closed path and whole
 * cycles per loop keep both the band and the loop seamless. Letters printed on the band squash
 * with it, mirror on the back face (where they dim), and the band darkens as it turns edge-on.
 *
 * The layer fill is the ribbon: a solid colour or a gradient (running across the frame) colours
 * the front of the band, while the back face and the printed letters keep their own colours for
 * contrast. A palette sets all three in order: front, back, ink.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp, mod, smoothstep } = TM.math;
  const K = TM.PathKit;
  const SEG = 180;
  const SEPARATORS = { dot: '•', star: '✦', dash: '—', slash: '/', space: '' };

  TM.registerPreset({
    id: 'ribbon',
    name: 'Ribbon',
    category: 'Path',
    description: 'Your text printed on a 3D ribbon that follows the path and twists, flipping to its back face.',
    usesPath: true,
    path: 'ribbon',
    params: [
      TM.P.range('width', 'Width (em)', 0.4, 3, 0.01, 1.3, { group: 'Ribbon' }),
      TM.P.range('twists', 'Twists along path', 1, 8, 1, 2, { group: 'Ribbon' }),
      TM.P.range('speed', 'Twist cycles per loop', -4, 4, 1, 1, { group: 'Ribbon', hint: 'Whole cycles keep the loop seamless' }),
      TM.P.range('shade', 'Shading', 0, 1, 0.01, 0.45, { group: 'Ribbon' }),
      TM.P.color('back', 'Back colour', '#a3a2ff', { group: 'Colour', hint: 'The front of the band takes the layer fill; a palette fill sets front, back and ink in order' }),
      TM.P.color('ink', 'Ink', '#0015ff', { group: 'Colour' }),
      TM.P.range('backDim', 'Back-face text', 0, 1, 0.01, 0.3, { group: 'Colour', hint: 'Opacity of the mirrored text seen through the back' }),
      TM.P.range('scroll', 'Text scroll per loop', -4, 4, 1, -1, { group: 'Text' }),
      TM.P.range('textScale', 'Text size', 0.2, 0.95, 0.01, 0.62, { group: 'Text', hint: '× the ribbon width' }),
      TM.P.select('separator', 'Separator', [['dot', '•'], ['star', '✦'], ['dash', '—'], ['slash', '/'], ['space', 'Space']], 'star', { group: 'Text' }),
    ],

    setup(f) {
      const L = f.layout;
      if (L.lines.length < 2) return { L };
      const joined = L.lines.map((l) => l.text.trim()).filter(Boolean).join('   ');
      return { L: TM.text.layout({ text: joined, family: f.layer.font.family, weight: f.layer.font.weight, sizePx: f.size, tracking: f.layer.type.tracking, leading: 1, align: 'center', case: f.layer.type.case }) };
    },

    render(f) {
      const raw = f.path;
      if (!raw || raw.length < 1) return;
      const P = f.params, size = f.size, L = f.cache.L;
      const w = P.width * size, half = w / 2;
      const path = K.smooth(raw, half * 0.8);
      const Lp = path.length;
      const ctx = f.ctx;
      const tw = Math.round(P.twists), sp = Math.round(P.speed);
      const theta = (s) => TAU * ((tw * s) / Lp - sp * f.p);

      // Colours: the front of the band is the layer fill (a gradient is sampled along the band, so
      // it runs across the frame); back face and ink contrast with it. A palette is front, back, ink.
      const fill = f.layer.fill, pal = fill.palette || [];
      const isPal = fill.type === 'palette' && pal.length;
      const back = isPal && pal.length > 1 ? pal[1] : P.back;
      const front = (x, y) => (isPal ? pal[0] : fill.type === 'gradient' ? f.colorOf({ vi: 0, cx: x - f.cx, cy: y - f.cy }) : fill.color);

      // Band: quads along the path, front or back colour, darker as it turns edge-on.
      const shadeCache = new Map();
      const tint = (col, c) => {
        const q = Math.round(Math.abs(c) * 12);
        const key = col + q;
        let v = shadeCache.get(key);
        if (!v) { v = TM.color.mix(col, '#000000', P.shade * (1 - q / 12) * 0.8); shadeCache.set(key, v); }
        return v;
      };
      if (f.echo === 0) {
        f.identity();
        ctx.lineWidth = Math.max(1, f.unit / 1080);
        ctx.lineJoin = 'round';
        // Runs of quads in one colour go out as one path: one fill, and no anti-aliasing seams
        // inside a run. Only the edge where a run meets the next is stroked (in the run's colour)
        // to seal that seam. A gradient front is sampled every few quads, keeping runs long.
        let a = path.at(0), ca = Math.cos(theta(0));
        let cur = null, grad = null, wasFront = false;
        const flush = (p, c) => {
          if (!cur) return;
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(p.x + p.nx * half * c, p.y + p.ny * half * c);
          ctx.lineTo(p.x - p.nx * half * c, p.y - p.ny * half * c);
          ctx.stroke();
          cur = null;
        };
        for (let i = 1; i <= SEG; i++) {
          const s = (Lp * i) / SEG;
          const b = path.at(Math.min(s, Lp - 1e-3)), cb = Math.cos(theta(s));
          const cm = (ca + cb) / 2;
          if (cm >= 0 && (!wasFront || i % 3 === 1)) grad = front((a.x + b.x) / 2, (a.y + b.y) / 2);
          wasFront = cm >= 0;
          const col = tint(cm >= 0 ? grad : back, cm);
          if (col !== cur) {
            flush(a, ca);
            ctx.fillStyle = ctx.strokeStyle = cur = col;
            ctx.beginPath();
          }
          ctx.moveTo(a.x + a.nx * half * ca, a.y + a.ny * half * ca);
          ctx.lineTo(b.x + b.nx * half * cb, b.y + b.ny * half * cb);
          ctx.lineTo(b.x - b.nx * half * cb, b.y - b.ny * half * cb);
          ctx.lineTo(a.x - a.nx * half * ca, a.y - a.ny * half * ca);
          ctx.closePath();
          a = b;
          ca = cb;
        }
        flush(a, ca);
      }

      // Text printed on the band: squashed by cos θ, mirrored and dimmed on the back face.
      const line = L.lines.find((l) => l.glyphs.length);
      if (!line) return;
      const gs = (P.textScale * w) / Math.max(1, L.capH);
      const sep = SEPARATORS[P.separator] || '';
      const sepW = sep ? TM.text.advance(sep, f.layer.font.family, f.layer.font.weight, size) : 0;
      const t = K.tile(f, line, Lp / gs, { layout: L, closed: path.closed, repeat: true, gap: size * 0.5, sep, sepW, fitMargin: 0.98 });
      const unit = t.unit * gs;
      const period = path.closed ? Lp : unit * t.reps;
      const shift = Math.round(P.scroll) * f.p * unit;
      const ink = f.colorOverride || (isPal && pal.length > 2 ? pal[2] : P.ink);
      for (let r = 0; r < t.reps; r++) {
        for (const it of t.items) {
          if (it.g.isSpace) continue;
          let s = mod((it.off + r * t.unit) * gs + shift, period);
          let edge = 1;
          if (!path.closed) {
            s -= unit;
            edge = smoothstep(-size * 0.4, size * 0.4, s) * (1 - smoothstep(Lp - size * 0.4, Lp + size * 0.4, s));
            if (edge <= 0.01) continue;
          }
          const c = Math.cos(theta(s));
          if (Math.abs(c) < 0.04) continue;
          const pt = K.place(path, s, it.w * gs);
          const alpha = edge * (c > 0 ? 1 : P.backDim) * clamp(Math.abs(c) * 4);
          if (alpha <= 0.01) continue;
          f.drawGlyph(it.g, { x: pt.x, y: pt.y, rot: pt.angle, sx: gs * t.k, sy: gs * t.k * c, alpha, color: ink });
        }
      }
    },

    looks: [
      { name: 'Candy stripe', bg: { type: 'solid', color: '#ffd6e0' }, layer: { font: { family: 'Rubik', weight: 900 }, fill: { type: 'solid', color: '#ff3e6c' }, params: { back: '#2b0a3d', ink: '#ffffff', twists: 3 }, path: 'wave' } },
      { name: 'Gold leaf', bg: { type: 'radial', color: '#1d1405', color2: '#000000' }, layer: { font: { family: 'Bodoni Moda', weight: 800 }, fill: { type: 'gradient', color: '#b07a12', color2: '#ffe28a', angle: 135 }, params: { back: '#7a5a12', ink: '#1d1405', shade: 0.6, width: 1.6 }, path: 'circle' } },
      { name: 'Racing', bg: { type: 'solid', color: '#0b0b0c' }, layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'solid', color: '#d4ff3a' }, params: { back: '#3a4a10', ink: '#0b0b0c', speed: 2, scroll: -2 }, path: 'infinity' } },
    ],
  });
})(window.TM);
