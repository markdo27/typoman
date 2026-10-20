/* Preset: Melt — letters drip and melt through noise-driven vertical slices, then re-form.
 * The text is drawn into a scratch buffer and redrawn in thin vertical slices. Each slice's lower
 * part stretches down by a drip length taken from smooth, loop-periodic noise across x (gooey,
 * coherent drips) plus a share of per-slice randomness (the odd long drip), and the slice sags a
 * little. The melt rises with gravity-like acceleration, holds, then re-forms on a spring that
 * overshoots into a brief squash. Lines drip separately, upper lines over lower ones.
 */
(function (TM) {
  'use strict';
  const { TAU } = TM.math;

  TM.registerPreset({
    id: 'melt',
    name: 'Melt',
    category: 'Kinetic',
    description: 'Letters drip and melt through gooey vertical slices, then snap back into shape.',
    params: [
      TM.P.range('amount', 'Drip length (em)', 0.2, 5, 0.01, 2.6, { group: 'Melt' }),
      TM.P.range('goo', 'Gooeyness', 0, 1, 0.01, 0.55, { group: 'Melt', hint: 'Higher = broader, smoother drips' }),
      TM.P.range('variety', 'Long drips', 0, 1, 0.01, 0.5, { group: 'Melt' }),
      TM.P.range('sag', 'Melt depth', 0, 1, 0.01, 0.35, { group: 'Melt', hint: 'How much of each letter turns to drips' }),
      TM.P.range('detail', 'Slice detail', 0, 1, 0.01, 0.5, { group: 'Melt' }),
      TM.P.range('meltLen', 'Melt length', 0.1, 0.6, 0.01, 0.38, { group: 'Timing' }),
      TM.P.range('holdLen', 'Hold melted', 0, 0.3, 0.01, 0.08, { group: 'Timing' }),
      TM.P.range('reformLen', 'Re-form length', 0.1, 0.5, 0.01, 0.3, { group: 'Timing' }),
      TM.P.ease('meltEase', 'Melt ease', 'inQuad', { group: 'Timing' }),
      TM.P.ease('reformEase', 'Re-form ease', 'springSoft', { group: 'Timing' }),
    ],

    render(f) {
      const P = f.params, L = f.layout, size = f.size, p = f.p;
      // Envelope: solid → melt → hold → re-form (overshooting into a squash) → solid.
      const t1 = 0.08, t2 = t1 + P.meltLen, t3 = t2 + P.holdLen, t4 = Math.min(0.97, t3 + P.reformLen);
      let M = 0;
      if (p >= t1 && p < t2) M = TM.ease(P.meltEase, 'inQuad')((p - t1) / (t2 - t1));
      else if (p >= t2 && p < t3) M = 1;
      else if (p >= t3 && p < t4) M = 1 - TM.ease(P.reformEase, 'springSoft')((p - t3) / (t4 - t3));
      const lines = L.lines.filter((l) => l.text.trim());
      // Whole lines keep native shaping; a palette colours letter by letter, so it draws glyphs.
      const perGlyph = f.layer.fill.type === 'palette' && !f.colorOverride;
      const draw = () => {
        for (const line of lines) {
          if (!perGlyph) { f.drawLine(line); continue; }
          for (const gi of line.glyphs) f.drawGlyph(L.glyphs[gi]);
        }
      };
      if (Math.abs(M) < 1e-3) { draw(); return; }

      const buf = f.buffer('melt');
      f.drawInto(buf.ctx, draw);
      const ctx = f.ctx;
      f.identity();
      const sw = Math.max(2, Math.round(f.unit / (110 + 260 * P.detail)));
      const freq = 1 / (f.unit * (0.012 + 0.06 * P.goo));
      const nz = f.noise;
      const ca = Math.cos(TAU * p) * 0.7, sa = Math.sin(TAU * p) * 0.7;
      const maxDrip = P.amount * size;
      const pad = size * 0.2;
      // Lower lines first, so upper lines drip over them.
      for (let li = lines.length - 1; li >= 0; li--) {
        const line = lines[li];
        const top = Math.floor(f.cy + line.y - L.capH - size * 0.28);
        const bot = Math.ceil(f.cy + line.y + L.descent * 0.95);
        const h = bot - top;
        const xL = Math.floor(f.cx + line.x - pad), xR = Math.ceil(f.cx + line.x + line.width + pad);
        // The upper part of each letter stays intact; only the part below `split` runs.
        const split = Math.round(top + h * (0.66 - 0.45 * P.sag));
        const hb = bot - split;
        ctx.drawImage(buf.canvas, xL, top, xR - xL, split - top, xL, top, xR - xL, split - top);
        for (let x = xL; x < xR; x += sw) {
          // Two coherent noises: broad drips, and narrow ones whose peaks run long.
          const u = 0.5 + 0.5 * nz.n3(x * freq, ca + li * 3.1, sa);
          const v = 0.5 + 0.5 * nz.n3(x * freq * 3.3 + 17.7, sa * 1.3 + li, ca * 1.3);
          const shape = (1 - P.variety) * u * u + P.variety * Math.pow(v, 4) * 2.4;
          const drip = Math.max(-0.5 * hb, maxDrip * M * (0.06 + 0.94 * shape));
          ctx.drawImage(buf.canvas, x, split, sw, hb, x, split, sw, Math.max(1, hb + drip));
        }
      }
    },

    looks: [
      { name: 'Hot wax', bg: { type: 'solid', color: '#1b0a2e' }, layer: { font: { family: 'Shrikhand', weight: 400 }, fill: { type: 'gradient', color: '#ffb547', color2: '#ff2e88', angle: 180 }, params: { amount: 2.2, variety: 0.7 } } },
      { name: 'Slime', bg: { type: 'solid', color: '#0b0b0c' }, layer: { font: { family: 'Rubik', weight: 900 }, fill: { type: 'solid', color: '#d4ff3a' }, fx: { glow: { amount: 0.35, color: '#d4ff3a' } }, params: { goo: 0.9, sag: 0.4 } } },
      { name: 'Ice cream', bg: { type: 'solid', color: '#ffd6e0' }, layer: { font: { family: 'Titan One', weight: 400 }, fill: { type: 'palette', palette: ['#2b0a3d', '#ff3e6c', '#ffffff'] }, params: { amount: 1.2, reformEase: 'spring' } } },
    ],
  });
})(window.TM);
