/* Preset: Kaleido — a wedge of type mirrored N times around the centre.
 * In each wedge the text streams outward along a spoke laid in log-polar space,
 * r = r0·e^(k·x), so a letter's size grows in proportion to its radius: letters never crowd at
 * the rim or vanish at the centre, and streaming by whole repeats per loop is seamless. The spoke
 * swings inside its wedge, odd wedges are mirrored (a true kaleidoscope), and the whole pattern
 * spins by whole wedges per loop, which its N-fold symmetry makes seamless too.
 */
(function (TM) {
  'use strict';
  const { TAU, mod, smoothstep } = TM.math;
  const SEPARATORS = { dot: '•', star: '✦', dash: '—', slash: '/', space: '' };

  TM.registerPreset({
    id: 'kaleido',
    name: 'Kaleido',
    category: 'Generative',
    description: 'A wedge of your text mirrored around the centre: a turning kaleidoscope of type.',
    fit: false,
    params: [
      TM.P.range('segments', 'Segments', 4, 16, 2, 8, { group: 'Mirror' }),
      TM.P.toggle('mirror', 'Mirror alternate wedges', true, { group: 'Mirror' }),
      TM.P.range('spin', 'Spin per loop', -4, 4, 1, 1, { group: 'Motion', hint: 'In whole symmetry steps (a mirrored pair of wedges), so the loop is seamless' }),
      TM.P.range('flow', 'Flow (repeats per loop)', -4, 4, 1, 1, { group: 'Motion', hint: 'Positive streams outward' }),
      TM.P.range('swing', 'Swing', 0, 1, 0.01, 0.5, { group: 'Motion', hint: 'The spoke sweeps across its wedge, so mirrored spokes meet and part' }),
      TM.P.range('swingCycles', 'Swing cycles', 1, 4, 1, 1, { group: 'Motion' }),
      TM.P.ease('swingEase', 'Swing ease', 'inOutSine', { group: 'Motion' }),
      TM.P.range('textScale', 'Text size', 0.3, 2, 0.01, 0.85, { group: 'Text', hint: '× the layer size, a third of the way out' }),
      TM.P.select('separator', 'Separator', [['dot', '•'], ['star', '✦'], ['dash', '—'], ['slash', '/'], ['space', 'Space']], 'star', { group: 'Text' }),
      TM.P.range('gap', 'Gap (em)', 0, 3, 0.05, 0.5, { group: 'Text' }),
    ],

    setup(f) {
      const L = f.layout;
      if (L.lines.length < 2) return { L };
      const joined = L.lines.map((l) => l.text.trim()).filter(Boolean).join('   ');
      return { L: TM.text.layout({ text: joined, family: f.layer.font.family, weight: f.layer.font.weight, sizePx: f.size, tracking: f.layer.type.tracking, leading: 1, align: 'center', case: f.layer.type.case }) };
    },

    render(f) {
      const P = f.params, L = f.cache.L, size = f.size;
      const line = L.lines.find((l) => l.glyphs.length);
      if (!line) return;
      const N = Math.max(4, 2 * Math.round(P.segments / 2)); // even, so mirrored wedges pair up
      const A = TAU / N;
      const Cx = f.cx, Cy = f.cy;
      const sep = SEPARATORS[P.separator] || '';
      const sepW = sep ? TM.text.advance(sep, f.layer.font.family, f.layer.font.weight, size) : 0;
      const gap = P.gap * size;

      // One repeat of the run along x (layout px): glyph centres, then a separator.
      const x0 = line.x; // left edge (RTL lines keep their visual order)
      const items = [];
      for (const gi of line.glyphs) {
        const g = L.glyphs[gi];
        if (!g.isSpace) items.push({ g, off: g.x - x0 + g.w / 2 });
      }
      if (sep) items.push({ g: { ch: sep, w: sepW, vi: -1, isSpace: false, x: 0 }, off: line.width + gap + sepW / 2 });
      const unit = line.width + gap + (sep ? sepW + gap : 0);

      // Log-polar spoke: x ↦ r = r0·e^(k·x); a layout px at radius r draws k·r px.
      const r0 = f.unit * 0.3, k = P.textScale / r0;
      const rMin = f.unit * 0.07, rMax = Math.hypot(f.W, f.H) / 2 + size;
      const xMin = Math.log(rMin / r0) / k, xMax = Math.log(rMax / r0) / k;
      const shift = mod(Math.round(P.flow) * f.p * unit, unit);
      const sw = TM.ease(P.swingEase, 'inOutSine')(0.5 + 0.5 * Math.sin(TAU * Math.round(P.swingCycles) * f.p));
      const alpha0 = (sw * 2 - 1) * (A / 2) * 0.82 * P.swing; // spoke angle inside the wedge
      const spin = Math.round(P.spin) * A * (P.mirror ? 2 : 1) * f.p; // one symmetry step per unit
      const W = f.W, H = f.H;

      const pts = [];
      for (let n = Math.floor((xMin - shift) / unit) - 1; n * unit + shift < xMax + unit; n++) {
        for (const it of items) {
          const x = n * unit + shift + it.off;
          if (x < xMin || x > xMax) continue;
          const r = r0 * Math.exp(k * x);
          pts.push({ g: it.g, r, sc: k * r, fade: smoothstep(rMin, rMin * 3, r) });
        }
      }
      for (let w = 0; w < N; w++) {
        const mirrored = P.mirror && w % 2 === 1;
        const ang = spin + w * A + (mirrored ? -alpha0 : alpha0);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        for (const p of pts) {
          const x = Cx + ca * p.r, y = Cy + sa * p.r;
          const m = size * p.sc * 0.7;
          if (x < -m || x > W + m || y < -m || y > H + m) continue;
          f.drawGlyph(p.g, { x, y, rot: ang, sx: p.sc, sy: mirrored ? -p.sc : p.sc, alpha: p.fade });
        }
      }
    },

    looks: [
      { name: 'Stained glass', bg: { type: 'radial', color: '#1b0a2e', color2: '#07000f' }, layer: { font: { family: 'Fraunces', weight: 900 }, fill: { type: 'palette', palette: ['#ff5e5b', '#ffb547', '#ffe3a3', '#ff2e88'] }, params: { segments: 10 } } },
      { name: 'Mono mandala', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Space Mono', weight: 700 }, fill: { type: 'solid', color: '#141414' }, params: { segments: 6, swing: 0.4, textScale: 0.6 } } },
      { name: 'Acid bloom', bg: { type: 'solid', color: '#0b0b0c' }, layer: { font: { family: 'Rubik Mono One', weight: 400 }, fill: { type: 'palette', palette: ['#d4ff3a', '#ffffff', '#7a7a7a'] }, fx: { glow: { amount: 0.3, color: '#d4ff3a' } }, params: { segments: 12, flow: 1, swingCycles: 2, spin: -1 } } },
    ],
  });
})(window.TM);
