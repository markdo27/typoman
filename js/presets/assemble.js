/* Preset: Assemble — letters fly in from a seeded scatter through depth, spiral home and snap
 * together on a spring, hold, then gather and explode outward.
 *
 * Craft notes
 *  - Overlapping action: rotation lags the position spring, so letters land, then finish turning.
 *  - Depth is a perspective scale (near letters big, far ones small and hazy); letters are drawn
 *    back to front every frame.
 *  - The explosion is one event: every letter gathers toward the centre (anticipation), then
 *    blasts out radially with drag, spinning and flying past the camera as it fades.
 */
(function (TM) {
  'use strict';
  const { clamp, smoothstep, TAU } = TM.math;
  const DEG = Math.PI / 180;

  TM.registerPreset({
    id: 'assemble',
    name: 'Assemble',
    category: 'Reveal',
    description: 'Scattered letters fly in through depth and snap together on a spring, then gather and explode.',
    looks: [
      { name: 'Bauhaus', bg: { type: 'solid', color: '#f1ede4' },
        layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'palette', palette: ['#e63326', '#1d3fbb', '#f6bf26', '#111111'] },
          params: { spin: 360, swirl: 0.6, depth: 0.5 } } },
      { name: 'Deep Space', bg: { type: 'radial', color: '#0b1d4a', color2: '#01040f' }, post: { grain: 0.12 },
        layer: { font: { family: 'Syne', weight: 800 }, fill: { type: 'solid', color: '#e0fbfc' },
          fx: { echo: { count: 3, spacing: 0.018, fade: 0.5, palette: false }, glow: { amount: 0.2, color: '#4cc9f0' } }, params: { depth: 1, scatter: 0.9 } } },
      { name: 'Hot Chrome', bg: { type: 'solid', color: '#120403' },
        layer: { font: { family: 'Unbounded', weight: 800 }, fill: { type: 'gradient', color: '#fff1d6', color2: '#ff4d00', angle: 180 },
          fx: { extrude: { depth: 0.35, angle: 120, color: '#3a0f05' } }, params: { blast: 1.6, anticipation: 0.9 } } },
    ],
    params: [
      ...TM.P.sequence({ inDur: 0.5, outDur: 0.27, stagger: 0.45, order: 'random', easeIn: 'springSnappy', easeOut: 'outQuart' }),
      TM.P.range('scatter', 'Scatter radius', 0.1, 1.5, 0.01, 0.62, { group: 'Scatter', hint: 'How far letters start from home, in frame heights' }),
      TM.P.range('spin', 'Spin (°)', 0, 720, 5, 200, { group: 'Scatter' }),
      TM.P.range('depth', 'Depth', 0, 1, 0.01, 0.7, { group: 'Scatter' }),
      TM.P.range('swirl', 'Swirl', -1, 1, 0.01, 0.35, { group: 'Scatter', hint: 'Letters spiral home instead of flying straight' }),
      TM.P.select('exit', 'Exit', [['explode', 'Explode'], ['reverse', 'Scatter back']], 'explode', { group: 'Exit' }),
      TM.P.range('anticipation', 'Anticipation', 0, 1, 0.01, 0.6, { group: 'Exit' }),
      TM.P.range('blast', 'Blast force', 0.2, 3, 0.01, 1.1, { group: 'Exit', showIf: { exit: 'explode' } }),
    ],

    setup(f) {
      // Seeded scatter: start offset, spin, depth and blast vector for every glyph.
      const L = f.layout;
      return L.glyphs.map((g) => {
        if (g.isSpace) return null;
        const a = f.rand(g.i, 11) * TAU;
        const r = 0.45 + 0.55 * Math.sqrt(f.rand(g.i, 12));
        // Blast direction: radial from the block centre, loosened with a random component.
        const dx = g.cx / Math.max(1, L.width / 2), dy = g.cy / Math.max(1, L.height / 2 + L.capH);
        const ba = f.rand(g.i, 17) * TAU;
        let bx = dx * 0.9 + Math.cos(ba) * 0.75, by = dy * 0.9 + Math.sin(ba) * 0.75 - 0.15;
        const bl = Math.hypot(bx, by) || 1;
        bx /= bl; by /= bl;
        return {
          ox: Math.cos(a) * r, oy: Math.sin(a) * r,
          spin: f.srand(g.i, 13),
          z: f.srand(g.i, 14),
          bx, by,
          bf: 0.55 + 0.9 * f.rand(g.i, 18),
          bspin: f.srand(g.i, 19),
          bz: 0.25 + 0.75 * f.rand(g.i, 20),
          jit: f.rand(g.i, 21),
        };
      });
    },

    render(f) {
      const P = f.params, L = f.layout, S = f.cache;
      if (!S) return;
      const eIn = TM.ease(P.easeIn, 'springSnappy');
      const eOut = TM.ease(P.easeOut, 'outQuart');
      const glide = f.E.glide;
      const { outDur } = TM.MotionKit.windows(P);
      const pOut = outDur > 0 ? clamp((f.p - (1 - outDur)) / outDur) : 0;
      const R = P.scatter * f.unit;
      const ant = P.anticipation;
      const items = [];

      for (const g of L.glyphs) {
        const sg = S[g.i];
        if (!sg) continue;
        const s = f.seq(g);
        let kout = s.kout;
        if (P.exit === 'explode' && outDur > 0) kout = clamp((pOut - sg.jit * 0.06) / 0.94); // one blast, not a cascade
        if (s.kin <= 0 || kout >= 1) continue;

        // ── in: spiral home on the spring ──
        const e = eIn(s.kin);
        const er = eIn(clamp((s.kin - 0.1) / 0.9)); // rotation lags the position
        const ez = glide(s.kin);
        const back = 1 - e;
        const sw = P.swirl * Math.PI * back;
        const cs = Math.cos(sw), sn = Math.sin(sw);
        let x = (sg.ox * cs - sg.oy * sn) * R * back;
        let y = (sg.ox * sn + sg.oy * cs) * R * back;
        let rot = sg.spin * P.spin * DEG * (1 - er);
        let z = sg.z * P.depth * (1 - ez);
        let alpha = smoothstep(0, 0.22, s.kin);
        let scale = 1;

        // ── out ──
        if (kout > 0) {
          if (P.exit === 'explode') {
            const a = 0.32 * ant;                              // share spent gathering
            const gather = a > 0 ? Math.sin(Math.PI / 2 * clamp(kout / a)) * (1 - smoothstep(a, a + 0.12, kout)) : 0;
            const w = clamp((kout - a * 0.85) / (1 - a * 0.85));
            const d = eOut(w) * P.blast * f.unit * sg.bf;
            // Gather toward the block centre, then blast.
            x += -g.cx * 0.09 * ant * gather + sg.bx * d;
            y += -g.cy * 0.09 * ant * gather + sg.by * d;
            scale *= 1 - 0.1 * ant * gather;
            rot += sg.bspin * 300 * DEG * eOut(w);
            z += sg.bz * P.depth * 1.1 * eOut(w);
            alpha *= 1 - smoothstep(0.45, 1, w);
          } else {
            const w = s.vout;
            x += sg.ox * R * w;
            y += sg.oy * R * w;
            rot += sg.spin * P.spin * DEG * w;
            z += sg.z * P.depth * w;
            alpha *= 1 - smoothstep(0.55, 1, s.kout);
          }
        }

        // Perspective: +z comes toward the camera.
        const zz = clamp(z, -0.95, 0.8);
        const persp = 1 / (1 - zz * 0.6);
        alpha *= zz < 0 ? 1 + zz * 0.55 : 1; // far letters sink into the background
        if (alpha <= 0.002) continue;
        items.push({ g, z: zz, x: f.cx + g.cx + x, y: f.cy + g.cy + y, rot, scale: scale * persp, alpha, persp });
      }

      items.sort((a, b) => a.z - b.z);
      for (const it of items) {
        // Perspective also pulls positions away from / toward the frame centre a little.
        const k = 0.35 * (it.persp - 1);
        f.drawGlyph(it.g, {
          x: it.x + (it.x - f.W / 2) * k,
          y: it.y + (it.y - f.H / 2) * k,
          rot: it.rot,
          scale: it.scale,
          alpha: it.alpha,
        });
      }
    },
  });
})(window.TM);
