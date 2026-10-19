/* Preset: Tunnel — an infinite zoom through rings of type.
 * Copies of the text-on-path ring are scaled exponentially about the path's centroid and move
 * outward (or inward) forever: ring u has scale ratio^(u) and every ring is identical apart from
 * its scale and twist, so after one ring step the picture is exactly where it started. Rings
 * fade in out of the vanishing point and out at the frame edge, and an optional twist per ring
 * turns the tunnel into a vortex. Works with any path: circle, heart, star, even open curves.
 * "Pulse" eases each step so the zoom surges and settles like a heartbeat.
 */
(function (TM) {
  'use strict';
  const { TAU, fract, smoothstep } = TM.math;
  const K = TM.PathKit;
  const SEPARATORS = { dot: '•', star: '✦', dash: '—', slash: '/', space: '' };
  const DEG = Math.PI / 180;
  const BUDGET = 120; // glyphs per frame (rotated glyphs are the cost in software raster)

  TM.registerPreset({
    id: 'tunnel',
    name: 'Tunnel',
    category: 'Path',
    description: 'Rings of your text zoom out of the vanishing point forever, fading in at the centre and out at the edge. Try it on a heart.',
    usesPath: true,
    path: 'circle',
    params: [
      TM.P.range('speed', 'Rings per loop', -6, 6, 1, 2, { group: 'Zoom', hint: 'Positive flies in, negative pulls out. Whole steps keep the loop seamless' }),
      TM.P.range('ratio', 'Ring step', 1.2, 2.2, 0.01, 1.8, { group: 'Zoom', hint: 'Scale between neighbouring rings' }),
      TM.P.select('rhythm', 'Rhythm', [['glide', 'Glide'], ['pulse', 'Pulse']], 'glide', { group: 'Zoom' }),
      TM.P.ease('pulseEase', 'Pulse ease', 'snap', { group: 'Zoom', showIf: { rhythm: 'pulse' } }),
      TM.P.range('twist', 'Twist per ring (°)', -90, 90, 0.5, 40, { group: 'Zoom' }),
      TM.P.range('spin', 'Spin (turns per loop)', -3, 3, 1, 0, { group: 'Zoom' }),
      TM.P.range('textScale', 'Text size', 0.3, 2, 0.01, 1.15, { group: 'Text', hint: '× the layer size on the path itself' }),
      TM.P.select('separator', 'Separator', [['dot', '•'], ['star', '✦'], ['dash', '—'], ['slash', '/'], ['space', 'Space']], 'dot', { group: 'Text' }),
      TM.P.range('gap', 'Gap (em)', 0, 3, 0.05, 0.5, { group: 'Text' }),
      TM.P.range('fog', 'Centre fade', 0, 1, 0.01, 0.6, { group: 'Look', hint: 'How deep the vanishing point fades' }),
      TM.P.toggle('ringColor', 'Palette per ring', false, { group: 'Look' }),
    ],

    setup(f) {
      // Every ring carries the whole text: multi-line text is joined into one run per ring.
      const L = f.layout;
      if (L.lines.length < 2) return { L };
      const joined = L.lines.map((l) => l.text.trim()).filter(Boolean).join('   ');
      return {
        L: TM.text.layout({ text: joined, family: f.layer.font.family, weight: f.layer.font.weight, sizePx: f.size, tracking: f.layer.type.tracking, leading: 1, align: 'center', case: f.layer.type.case }),
      };
    },

    render(f) {
      const raw = f.path;
      if (!raw || raw.length < 1) return;
      const P = f.params, size = f.size, L = f.cache.L;
      const line = L.lines.find((l) => l.glyphs.length);
      if (!line) return;
      const gs = P.textScale;
      const path = K.smooth(raw, size * gs * 0.6);
      const sh = K.shape(path);
      const Cx = sh.cx, Cy = sh.cy;
      const Lp = path.length;
      const sep = SEPARATORS[P.separator] || '';
      const sepW = sep ? TM.text.advance(sep, f.layer.font.family, f.layer.font.weight, size) : 0;
      const t = K.tile(f, line, Lp / gs, { layout: L, closed: path.closed, repeat: true, gap: P.gap * size, sep, sepW, fitMargin: 0.98 });

      // Base ring (scale 1): slot positions relative to the centroid, with heading.
      const slots = [];
      for (let r = 0; r < t.reps; r++) {
        for (const it of t.items) {
          if (it.g.isSpace) continue;
          const s = (it.off + r * t.unit) * gs;
          if (!path.closed && (s < 0 || s > Lp)) continue;
          const pt = K.place(path, s, it.w * gs);
          slots.push({ g: it.g, dx: pt.x - Cx, dy: pt.y - Cy, a: pt.angle });
        }
      }
      if (!slots.length) return;

      // Ring coordinate: ring m sits at u = m + phase; its scale is ratio^u.
      const ratio = P.ratio, lr = Math.log(ratio);
      const sp = Math.round(P.speed);
      let phase = fract(Math.abs(sp) * f.p);
      if (P.rhythm === 'pulse') phase = TM.ease(P.pulseEase, 'snap')(phase);
      if (sp < 0) phase = -phase;
      // Rings appear once their glyphs reach ~9 px and dissolve after they pass the frame's short
      // edge, so the eye stays in the tunnel and huge, costly letters never stack up at the rim.
      const rmax = Math.max(1, sh.rmax);
      let sMin = 10 / Math.max(1, size * gs);
      const sEdge = Math.max(sMin * ratio * 2, (0.5 * Math.min(f.W, f.H)) / rmax);
      const sMax = sEdge * ratio;
      // Glyph budget: with long text (many glyphs per ring) the innermost, fogged rings go first,
      // so a frame never draws more than about BUDGET glyphs whatever the text length.
      const ringsAllowed = Math.max(2, Math.floor(BUDGET / slots.length));
      sMin = Math.max(sMin, sMax / Math.pow(ratio, ringsAllowed));
      const mLo = Math.floor(Math.log(sMin) / lr) - 1, mHi = Math.ceil(Math.log(sMax) / lr) + 1;
      const fogEnd = sMin * Math.pow(ratio, 1 + 3 * P.fog);
      const spin = Math.round(P.spin) * TAU * f.p;
      const pal = f.layer.fill.palette;
      const W = f.W, H = f.H;

      for (let m = mLo; m <= mHi; m++) {
        const u = m + phase;
        const sc = Math.exp(u * lr);
        if (sc < sMin || sc > sMax) continue;
        const alpha = smoothstep(sMin, fogEnd, sc) * (1 - smoothstep(sEdge, sMax, sc));
        if (alpha <= 0.01) continue;
        const rot = P.twist * DEG * u + spin;
        const cr = Math.cos(rot), sr = Math.sin(rot);
        const gsz = gs * sc;
        const reach = size * gsz * 0.62; // cull margin: about half a glyph diagonal
        const color = P.ringColor ? f.colorOverride || TM.color.ramp(pal, fract(u / Math.max(1, pal.length))) : undefined;
        for (const sl of slots) {
          const x = Cx + (cr * sl.dx - sr * sl.dy) * sc;
          const y = Cy + (sr * sl.dx + cr * sl.dy) * sc;
          if (x < -reach || x > W + reach || y < -reach || y > H + reach) continue; // off-frame
          f.drawGlyph(sl.g, { x, y, rot: sl.a + rot, scale: gsz, alpha, color });
        }
      }
    },

    looks: [
      { name: 'Heart tunnel', bg: { type: 'solid', color: '#1b0a2e' }, layer: { font: { family: 'Shrikhand', weight: 400 }, fill: { type: 'palette', palette: ['#ff5e5b', '#ffb547', '#ffe3a3', '#ff2e88'] }, params: { ringColor: true }, path: 'heart' } },
      { name: 'Hypno pulse', bg: { type: 'solid', color: '#000000' }, layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'palette', palette: ['#ffffff', '#4a4a4a'] }, params: { ringColor: true, rhythm: 'pulse', twist: 0 } } },
      { name: 'Square warp', bg: { type: 'solid', color: '#03132e' }, layer: { font: { family: 'Orbitron', weight: 800 }, fill: { type: 'solid', color: '#4cc9f0' }, fx: { glow: { amount: 0.3, color: '#4cc9f0' } }, params: { speed: 3, twist: 12, textScale: 0.9 }, path: 'square' } },
    ],
  });
})(window.TM);
