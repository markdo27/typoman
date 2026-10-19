/* Preset: Ribbon — your text printed on a 3D ribbon that follows the path and twists.
 * The band's cross-section turns about the path tangent, so its projected half-width is
 * (w/2)·cos θ with θ = 2π·(twists·s/L − speed·p): whole twists along a closed path and whole
 * cycles per loop keep both the band and the loop seamless. Letters printed on the band squash
 * with it, mirror on the back face (where they dim), and the band darkens as it turns edge-on.
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
      TM.P.color('band', 'Front colour', '#ffffff', { group: 'Colour' }),
      TM.P.color('back', 'Back colour', '#a3a2ff', { group: 'Colour' }),
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
        let a = path.at(0), ca = Math.cos(theta(0));
        for (let i = 1; i <= SEG; i++) {
          const s = (Lp * i) / SEG;
          const b = path.at(Math.min(s, Lp - 1e-3)), cb = Math.cos(theta(s));
          const cm = (ca + cb) / 2;
          ctx.fillStyle = ctx.strokeStyle = tint(cm >= 0 ? P.band : P.back, cm);
          ctx.beginPath();
          ctx.moveTo(a.x + a.nx * half * ca, a.y + a.ny * half * ca);
          ctx.lineTo(b.x + b.nx * half * cb, b.y + b.ny * half * cb);
          ctx.lineTo(b.x - b.nx * half * cb, b.y - b.ny * half * cb);
          ctx.lineTo(a.x - a.nx * half * ca, a.y - a.ny * half * ca);
          ctx.closePath();
          ctx.fill();
          ctx.stroke(); // same colour: seals the anti-aliasing seam between neighbouring quads
          a = b;
          ca = cb;
        }
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
      const ink = f.colorOverride || P.ink;
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
      { name: 'Candy stripe', bg: { type: 'solid', color: '#ffd6e0' }, layer: { font: { family: 'Rubik', weight: 900 }, params: { band: '#ff3e6c', back: '#2b0a3d', ink: '#ffffff', twists: 3 }, path: 'wave' } },
      { name: 'Gold leaf', bg: { type: 'radial', color: '#1d1405', color2: '#000000' }, layer: { font: { family: 'Bodoni Moda', weight: 800 }, params: { band: '#f6bf26', back: '#7a5a12', ink: '#1d1405', shade: 0.6, width: 1.6 }, path: 'circle' } },
      { name: 'Racing', bg: { type: 'solid', color: '#0b0b0c' }, layer: { font: { family: 'Archivo Black', weight: 400 }, params: { band: '#d4ff3a', back: '#3a4a10', ink: '#0b0b0c', speed: 2, scroll: -2 }, path: 'infinity' } },
    ],
  });
})(window.TM);
