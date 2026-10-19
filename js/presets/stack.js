/* Preset: Stack — TYPOMAN's signature fill-the-frame word stack.
 * Each word (or line) becomes a row stretched to the frame width; row heights breathe so
 * the stack flexes like an accordion. Rows are drawn as whole runs to keep native kerning.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp } = TM.math;

  TM.registerPreset({
    id: 'stack',
    name: 'Stack',
    category: 'Kinetic',
    description: 'Words stretched to fill the frame, rows flexing like an accordion.',
    fit: false,
    params: [
      TM.P.select('rows', 'Rows from', [['words', 'Each word'], ['lines', 'Each line']], 'words', { group: 'Layout' }),
      TM.P.select('motion', 'Motion', [['accordion', 'Accordion'], ['cascade', 'Cascade'], ['pulse', 'Pulse'], ['noise', 'Organic']], 'accordion', { group: 'Motion' }),
      TM.P.range('intensity', 'Intensity', 0, 1, 0.01, 0.65, { group: 'Motion' }),
      TM.P.range('cycles', 'Cycles', 1, 6, 1, 1, { group: 'Motion' }),
      TM.P.range('margin', 'Margin', 0, 0.25, 0.005, 0.06, { group: 'Layout' }),
      TM.P.range('gap', 'Row gap', 0, 0.08, 0.001, 0.012, { group: 'Layout' }),
      TM.P.toggle('alternate', 'Alternate skew', false, { group: 'Motion' }),
    ],

    setup(f) {
      // Re-lay the text with one row per word when asked, at a fixed reference size.
      const rowsText = f.params.rows === 'words'
        ? f.layer.text.split(/\s+/).filter(Boolean).join('\n')
        : f.layer.text;
      const L = TM.text.layout({
        text: rowsText || ' ',
        family: f.layer.font.family,
        weight: f.layer.font.weight,
        sizePx: 200,
        tracking: f.layer.type.tracking,
        leading: 1,
        align: 'center',
        case: f.layer.type.case,
      });
      return { L, rows: L.lines.filter((l) => l.width > 0) };
    },

    render(f) {
      const P = f.params, { L, rows } = f.cache;
      const n = rows.length;
      if (!n) return;
      const m = P.margin * f.unit;
      const availW = f.W - m * 2, availH = f.H - m * 2;
      const gap = P.gap * f.unit;

      // Row weights → heights. Integer cycles keep the loop seamless.
      const w = rows.map((_, i) => {
        const ph = f.p * P.cycles;
        let v;
        switch (P.motion) {
          case 'cascade': {
            // A bulge travels down the stack.
            const pos = (ph % 1) * (n + 1) - 0.5;
            v = Math.exp(-Math.pow((i - pos) / 0.7, 2)) * 2 - 0.4;
            break;
          }
          case 'pulse': v = Math.sin(TAU * ph) * (i % 2 ? -1 : 1); break;
          case 'noise': v = f.loopNoise(i * 3.1, P.cycles) * 1.6; break;
          default: v = Math.sin(TAU * (ph + i / n));
        }
        return Math.max(0.08, 1 + v * P.intensity * 0.85);
      });
      const sum = w.reduce((a, b) => a + b, 0);
      const usable = availH - gap * (n - 1);
      let y = m;
      rows.forEach((line, i) => {
        const h = (usable * w[i]) / sum;
        const sx = availW / line.width;
        const sy = h / L.capH;
        const skew = P.alternate ? (i % 2 ? 1 : -1) * (w[i] - 1) * 0.25 : 0;
        drawRow(f, L, line, f.W / 2, y + h / 2, sx, sy, skew, i);
        y += h + gap;
      });
    },
  });

  // Draw a row of the stack's private layout (not f.layout), so draw the run directly.
  function drawRow(f, L, line, x, y, sx, sy, skew, i) {
    const ctx = f.ctx;
    ctx.font = L.font;
    f._font = null; // drew with its own layout font; make drawGlyph re-apply its own
    if ('letterSpacing' in ctx) ctx.letterSpacing = L.tracking.toFixed(2) + 'px';
    const tk = -Math.tan(skew + f.slant);
    ctx.setTransform(sx, 0, tk * sy, sy, x, y);
    ctx.globalAlpha = f.alpha;
    const color = f.colorOf({ vi: i });
    const ox = -line.width / 2, oy = L.capH / 2;
    if (f.strokeMode === 'outline') {
      ctx.strokeStyle = color;
      ctx.lineWidth = (f.strokeW / Math.max(sx, sy)) * (200 / f.size);
      ctx.strokeText(line.text, ox, oy);
    } else {
      if (f.strokeMode === 'both') {
        ctx.strokeStyle = f.layer.stroke.color;
        ctx.lineWidth = ((f.strokeW * 2) / Math.max(sx, sy)) * (200 / f.size);
        ctx.strokeText(line.text, ox, oy);
      }
      ctx.fillStyle = color;
      ctx.fillText(line.text, ox, oy);
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  void clamp;
})(window.TM);
