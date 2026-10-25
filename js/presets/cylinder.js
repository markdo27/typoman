/* Preset: Cylinder — text wrapped around a rotating 3D drum.
 *
 * Each glyph sits at an angle given by its arc position (its kerned layout x), so x = R·sin θ and
 * its width foreshortens with cos θ. Back faces mirror, sink into the background and are drawn
 * first; the tilt turns the ring into an ellipse and leans glyphs along it. Lines become stacked
 * rings (optionally counter-rotating). Rotation uses whole turns per loop, so it always loops.
 *
 * Spin styles: "Linger at front" slows each turn while the text faces the camera (the default:
 * you get reading time, then a whip round the back); "Constant"; and "Ratchet", which clicks
 * between stops with a springy settle.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp, fract } = TM.math;
  const DEG = Math.PI / 180;
  const MAX_ARC = 1.9; // radians a line may span (≈109°, readable at the front) before the drum grows
  const SEPARATORS = { dot: '•', space: '', dash: '—', slash: '/', star: '✦' };

  const affine = TM.MotionKit.affine; // glyph matrix → drawGlyph options, keeping the layer's slant

  TM.registerPreset({
    id: 'cylinder',
    name: 'Cylinder',
    category: 'Dimensional',
    description: 'Your text wrapped round a spinning 3D drum: tilted, in perspective, with mirrored back faces.',
    looks: [
      { name: 'Gold Ring', bg: { type: 'radial', color: '#2a0f3d', color2: '#05000a' }, post: { vignette: 0.4 },
        layer: { font: { family: 'Bodoni Moda', weight: 800 }, fill: { type: 'gradient', color: '#fff1d6', color2: '#e0a020', angle: 180 },
          fx: { glow: { amount: 0.2, color: '#ffb547' } }, params: { repeat: true, separator: 'star', tilt: 22, spin: 'smooth' } } },
      { name: 'Neon Drum', bg: { type: 'solid', color: '#07000f' },
        layer: { font: { family: 'Monoton', weight: 400 }, fill: { type: 'palette', palette: ['#ff00e5', '#00f0ff', '#faff00'] },
          fx: { glow: { amount: 0.55, color: '#ff00e5' } }, params: { repeat: true, separator: 'dot', back: 'full', shade: 0.75, spin: 'smooth' } } },
      { name: 'Paper Column', bg: { type: 'solid', color: '#f4f1ea' },
        layer: { font: { family: 'Big Shoulders Display', weight: 800 }, fill: { type: 'solid', color: '#141414' },
          params: { repeat: true, separator: 'slash', tilt: -16, spin: 'steps', stops: 6, perspective: 0, shade: 1 } } },
    ],
    params: [
      TM.P.range('turns', 'Turns per loop', -4, 4, 1, 1, { group: 'Spin', hint: 'Whole turns keep the loop seamless; negative spins the other way' }),
      TM.P.select('spin', 'Spin style', [['present', 'Linger at front'], ['smooth', 'Constant'], ['steps', 'Ratchet']], 'present', { group: 'Spin' }),
      TM.P.range('stops', 'Ratchet stops', 2, 12, 1, 4, { group: 'Spin', showIf: { spin: 'steps' } }),
      TM.P.ease('stepEase', 'Ratchet ease', 'springSnappy', { group: 'Spin', showIf: { spin: 'steps' } }),
      TM.P.toggle('alternate', 'Counter-rotate lines', true, { group: 'Spin' }),
      TM.P.range('radius', 'Radius', 0.2, 1.2, 0.01, 0.55, { group: 'Drum', hint: 'Fraction of half the frame width' }),
      TM.P.range('tilt', 'Tilt (°)', -45, 45, 1, 16, { group: 'Drum' }),
      TM.P.range('perspective', 'Perspective', 0, 1, 0.01, 0.55, { group: 'Drum' }),
      TM.P.toggle('repeat', 'Repeat around', false, { group: 'Drum', hint: 'Fill the whole circumference with copies of the text' }),
      TM.P.select('separator', 'Separator', [['dot', '•'], ['space', 'Space'], ['dash', '—'], ['slash', '/'], ['star', '✦']], 'dot', { group: 'Drum', showIf: { repeat: true } }),
      TM.P.select('back', 'Back faces', [['dim', 'Dimmed'], ['full', 'Full'], ['hide', 'Hidden']], 'dim', { group: 'Look' }),
      TM.P.range('shade', 'Depth shading', 0, 1, 0.01, 0.6, { group: 'Look' }),
    ],

    setup(f) {
      const sep = f.params.repeat ? SEPARATORS[f.params.separator] || '' : '';
      return { sep, sepW: sep ? TM.text.advance(sep, f.layer.font.family, f.layer.font.weight, f.size) : 0 };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      if (!C || !L.count) return;
      const em = L.sizePx;
      const R0 = P.radius * f.W * 0.5;
      const tilt = P.tilt * DEG, ct = Math.cos(tilt), st = Math.sin(tilt);
      const n = Math.abs(P.turns), dir = P.turns < 0 ? 1 : -1; // positive turns read right → left at the front

      // Rotation (fraction of a turn) at this moment.
      let turn = 0;
      if (n > 0) {
        if (P.spin === 'smooth') turn = n * f.p;
        else if (P.spin === 'steps') {
          const total = P.stops * n, x = f.p * total, k = Math.floor(x), fr = x - k;
          const e = fr < 0.45 ? 0 : TM.ease(P.stepEase, 'springSnappy')((fr - 0.45) / 0.55);
          turn = (k + e) / P.stops;
        } else {
          const x = fract(f.p * n);
          turn = Math.floor(f.p * n) + 0.25 * x + 0.75 * f.E.smooth(x);
        }
      }

      // Ring radius per line: the drum grows if a line would wrap too far round it.
      const radii = L.lines.map((line) => Math.max(R0, line.width / MAX_ARC));
      const Rmax = Math.max(R0, ...radii);
      const D = Rmax * (1.6 + 4 * (1 - P.perspective)); // camera distance
      // Tilt drops the front of the ring below the anchor; lift the drum most of the way back so
      // the text sits near the anchor while it faces the camera.
      const lift = 0.6 * Rmax * st * (D / (D - Rmax * ct));
      // Fit: the drum's silhouette (plus half a glyph) stays inside the frame, even for wide fonts.
      const fit = Math.min(1, (f.W * 0.47) / (Rmax + L.sizePx * 0.5));
      const items = [];
      const push = (g, ch, s, R, theta, Y) => {
        const phi = s / R + theta;
        const sp = Math.sin(phi), cp = Math.cos(phi);
        const X = R * sp, Z = R * cp;
        const Yt = Y * ct + Z * st, Zt = -Y * st + Z * ct;
        const k = (D / Math.max(D * 0.2, D - Zt)) * fit;
        // Back faces fade (or vanish) through the edge-on turn instead of stepping there.
        let backK = 1;
        if (P.back === 'hide') backK = TM.math.smoothstep(-0.05, 0.25, cp);
        else if (P.back === 'dim') backK = 0.32 + 0.68 * TM.math.smoothstep(-0.22, 0.22, cp);
        if (backK <= 0.002) return;
        const m = affine(f, cp * k, -sp * st * k, 0, ct * k);
        if (!m || Math.abs(m.sx) < 0.03 * k) return; // edge-on slivers are invisible; skip the draw
        const zn = Zt / R;
        const alpha = (1 - P.shade * 0.9 * (1 - zn) * 0.5) * backK;
        items.push({ g, ch, z: Zt, x: f.cx + X * k, y: f.cy + (Yt * k / fit - lift) * fit, m, alpha });
      };

      L.lines.forEach((line, li) => {
        if (!line.glyphs.length) return;
        const lineW = line.width, R = radii[li];
        const theta = dir * (P.alternate && li % 2 ? -1 : 1) * turn * TAU;
        const lineY = line.y - L.capH / 2;
        const mid = line.x + lineW / 2;
        // Repeat: as many whole copies as fit round the drum, the gaps stretched to close the ring.
        let reps = 1, unit = 0;
        if (P.repeat) {
          const want = lineW + (C.sep ? C.sepW + em * 0.9 : em * 0.45);
          reps = Math.max(1, Math.floor((TAU * R) / want));
          unit = (TAU * R) / reps;
        }
        for (let r = 0; r < reps; r++) {
          for (const gi of line.glyphs) {
            const g = L.glyphs[gi];
            if (!g.isSpace) push(g, null, g.cx - mid + r * unit, R, theta, lineY);
          }
          if (P.repeat && C.sep) push({ ch: C.sep, w: C.sepW, vi: -1, i: -1, isSpace: false }, C.sep, unit / 2 + r * unit, R, theta, lineY);
        }
      });

      items.sort((a, b) => a.z - b.z);
      for (const it of items) {
        f.drawGlyph(it.g, {
          x: it.x,
          y: it.y,
          rot: it.m.rot,
          sx: it.m.sx,
          sy: it.m.sy,
          skew: it.m.skew,
          alpha: clamp(it.alpha),
          ch: it.ch || undefined,
        });
      }
    },
  });
})(window.TM);
