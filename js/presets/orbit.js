/* Preset: Orbit — rotating badge / planetary rings.
 * Concentric copies of your path (scaled about its centroid) each carry the text and counter-
 * rotate. The ring plane tilts away from the viewer: y squashes, the far side shrinks and fades,
 * and every glyph is drawn through the projected 2×2 matrix of its spot on the ring, back to
 * front, so letters foreshorten like ink printed on a real ring. An optional core title sits
 * upright in the middle and is depth-sorted with the rings, which pass behind it and in front.
 * Multi-line text deals one line per ring. Rotation and wobble use whole cycles per loop.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp, lerp, mod, smoothstep } = TM.math;
  const K = TM.PathKit;
  const SEPARATORS = { dot: '•', star: '✦', dash: '—', slash: '/', space: '' };
  const DEG = Math.PI / 180;

  TM.registerPreset({
    id: 'orbit',
    name: 'Orbit',
    category: 'Path',
    description: 'Concentric rings of your path carry the text and counter-rotate in tilted 3D: a spinning badge or planetary rings.',
    usesPath: true,
    path: 'circle',
    params: [
      TM.P.range('rings', 'Rings', 1, 5, 1, 2, { group: 'Rings' }),
      TM.P.range('spacing', 'Spacing', 0.08, 0.45, 0.01, 0.24, { group: 'Rings', hint: 'Scale step between rings' }),
      TM.P.select('grow', 'Rings grow', [['out', 'Outward'], ['in', 'Inward']], 'out', { group: 'Rings', hint: 'Your path is the innermost (outward) or outermost (inward) ring' }),
      TM.P.range('speed', 'Revolutions per loop', -3, 3, 1, 1, { group: 'Rings', hint: 'Whole turns keep the loop seamless' }),
      TM.P.select('spin', 'Ring spin', [['counter', 'Counter-rotate'], ['same', 'All one way'], ['kepler', 'Inner faster']], 'counter', { group: 'Rings' }),
      TM.P.range('tilt', 'Tilt (°)', 0, 82, 1, 58, { group: '3D' }),
      TM.P.range('bank', 'Bank (°)', -45, 45, 1, -12, { group: '3D' }),
      TM.P.range('wobble', 'Wobble', 0, 1, 0.01, 0.3, { group: '3D', hint: 'A slow nutation of tilt and bank, once per loop' }),
      TM.P.range('persp', 'Perspective', 0, 1, 0.01, 0.45, { group: '3D' }),
      TM.P.range('farFade', 'Far-side fade', 0, 1, 0.01, 0.7, { group: '3D' }),
      TM.P.range('textScale', 'Ring text size', 0.15, 1.5, 0.01, 0.46, { group: 'Text', hint: '× the layer size' }),
      TM.P.range('ringScale', 'Text shrinks with ring', 0, 1, 0.01, 0.6, { group: 'Text' }),
      TM.P.select('separator', 'Separator', [['dot', '•'], ['star', '✦'], ['dash', '—'], ['slash', '/'], ['space', 'Space']], 'dot', { group: 'Text' }),
      TM.P.range('gap', 'Gap (em)', 0, 3, 0.05, 0.7, { group: 'Text' }),
      TM.P.toggle('core', 'Core title', true, { group: 'Text', hint: 'The text upright in the middle, with the rings passing behind and in front' }),
      TM.P.range('coreScale', 'Core size', 0.2, 1.5, 0.01, 0.62, { group: 'Text', showIf: { core: true } }),
    ],

    render(f) {
      const raw = f.path;
      if (!raw || raw.length < 1) return;
      const P = f.params, L = f.layout, size = f.size;
      // Corners rounded at glyph scale, so text flows round stars and hearts.
      const path = K.smooth(raw, size * P.textScale * 0.9);
      const sh = K.shape(path);
      const C = { x: sh.cx, y: sh.cy };
      const R = Math.max(1, sh.rmax);
      const Lp = path.length;
      const wob = P.wobble;
      const tilt = clamp(P.tilt * DEG + wob * 0.2 * Math.sin(TAU * f.p), 0, 88 * DEG);
      const bank = P.bank * DEG + wob * 0.14 * Math.cos(TAU * f.p);
      const ct = Math.cos(tilt), stt = Math.sin(tilt), cb = Math.cos(bank), sb = Math.sin(bank);
      const F = R * lerp(9, 1.7, P.persp); // focal length
      const sep = SEPARATORS[P.separator] || '';
      const sepW = sep ? TM.text.advance(sep, f.layer.font.family, f.layer.font.weight, size) : 0;
      const lines = L.lines.filter((l) => l.glyphs.length);
      if (!lines.length) return;
      const items = [];

      // Project a ring-plane offset (dx, dy) from the centroid: returns screen point, depth and scale.
      const project = (dx, dy) => {
        const Z = -dy * stt; // top of the ring tilts away (Z > 0 is far)
        const kz = F / (F + Z);
        const u = dx * kz, v = dy * ct * kz;
        return { x: C.x + cb * u - sb * v, y: C.y + sb * u + cb * v, z: Z / R, kz };
      };
      // Projected direction of an in-plane vector (dx, dy) at perspective scale kz.
      const dir = (dx, dy, kz) => [kz * (cb * dx - sb * dy * ct), kz * (sb * dx + cb * dy * ct)];

      const rings = Math.max(1, Math.round(P.rings));
      for (let k = 0; k < rings; k++) {
        const sig = P.grow === 'in' ? Math.max(0.12, 1 - k * P.spacing) : 1 + k * P.spacing;
        const ringLen = Lp * sig;
        const gs = P.textScale * Math.pow(sig, P.ringScale); // glyph scale on this ring
        const line = lines[k % lines.length];
        const t = K.tile(f, line, ringLen / gs, { closed: path.closed, repeat: true, gap: P.gap * size, sep, sepW, fitMargin: 0.98 });
        let turns = Math.round(P.speed);
        if (P.spin === 'counter' && k % 2) turns = -turns;
        else if (P.spin === 'kepler') turns *= k + 1;
        const unit = t.unit * gs;
        // Closed rings turn whole revolutions; open ones scroll whole repeat periods. Both wrap exactly.
        const period = path.closed ? ringLen : unit * t.reps;
        const shift = turns * f.p * period + k * 0.137 * period;
        for (let r = 0; r < t.reps; r++) {
          for (const it of t.items) {
            if (it.g.isSpace) continue;
            let s = (it.off + r * t.unit) * gs + shift;
            let alpha = 1;
            if (path.closed) s = mod(s, ringLen);
            else {
              s = mod(s, unit * t.reps) - unit; // scroll an open ring, fading at its ends
              const edge = size * gs;
              alpha = smoothstep(-edge, edge * 0.5, s) * (1 - smoothstep(ringLen - edge * 0.5, ringLen + edge, s));
              if (alpha <= 0.01) continue;
            }
            const pt = K.place(path, s / sig, (it.w * gs) / sig);
            const dx = (pt.x - C.x) * sig, dy = (pt.y - C.y) * sig;
            const q = project(dx, dy);
            const [ax, ay] = dir(pt.tx, pt.ty, q.kz * gs * t.k);
            const [bx, by] = dir(pt.nx, pt.ny, q.kz * gs * t.k);
            const o = K.affine(f, ax, ay, bx, by);
            o.x = q.x;
            o.y = q.y;
            o.alpha = alpha * (1 - P.farFade * smoothstep(-0.9, 1, q.z));
            if (it.sep) o.ch = sep;
            items.push({ g: it.g, o, z: q.z });
          }
        }
      }

      if (P.core) {
        // Upright title at depth 0, floating gently; sorted in with the rings.
        const cs = P.coreScale;
        const bob = Math.sin(TAU * f.p) * size * 0.04;
        for (const g of L.glyphs) {
          if (g.isSpace) continue;
          items.push({ g, o: { x: C.x + g.cx * cs, y: C.y + g.cy * cs + bob, scale: cs }, z: 0 });
        }
      }

      items.sort((a, b) => b.z - a.z); // far first
      for (const it of items) f.drawGlyph(it.g, it.o);
    },

    looks: [
      { name: 'Saturn', bg: { type: 'radial', color: '#1b0a2e', color2: '#07000f' }, layer: { font: { family: 'Syne', weight: 800 }, fill: { type: 'palette', palette: ['#ffb547', '#ffe3a3', '#ff5e5b'] }, params: { rings: 3, tilt: 70, spacing: 0.18 } } },
      { name: 'Badge', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Space Grotesk', weight: 700 }, fill: { type: 'solid', color: '#141414' }, params: { tilt: 0, wobble: 0, bank: 0, separator: 'star' }, path: 'circle' } },
      { name: 'Heart orbit', bg: { type: 'solid', color: '#ffd6e0' }, layer: { font: { family: 'Fraunces', weight: 900 }, fill: { type: 'palette', palette: ['#ff3e6c', '#2b0a3d'] }, params: { tilt: 48, rings: 3, spacing: 0.2, core: false }, path: 'heart' } },
    ],
  });
})(window.TM);
