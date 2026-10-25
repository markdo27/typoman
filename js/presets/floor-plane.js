/* Preset: Floor Plane — the text stands as billboards on a receding floor.
 * Lines nearer the top of the block are farther away: they shrink toward a horizon line
 * and dim, while the nearest line stays full size. A gentle one-cycle rock moves the
 * horizon, so the perspective breathes without ever breaking the loop.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp } = TM.math;

  TM.registerPreset({
    id: 'floor-plane',
    name: 'Floor Plane',
    category: 'Dimensional',
    description: 'Your text stands on a receding floor: far lines shrink toward the horizon and dim, near lines stay full size.',
    params: [
      TM.P.range('depth', 'Depth', 0, 1, 0.01, 0.6, { group: 'Floor', hint: 'How strongly distance shrinks the far lines' }),
      TM.P.range('horizon', 'Horizon (frame)', -0.4, 0.4, 0.01, 0.18, { group: 'Floor', hint: 'How far above the centre the horizon sits, as a share of the frame' }),
      TM.P.range('rock', 'Rock', 0, 1, 0.01, 0.3, { group: 'Floor', hint: 'A slow one-cycle rock of the perspective' }),
      TM.P.range('fade', 'Distance fade', 0, 1, 0.01, 0.4, { group: 'Floor', hint: 'How much far lines dim' }),
      TM.P.toggle('groundLine', 'Ground line', true, { group: 'Floor', hint: 'A faint line where the nearest row meets the floor' }),
    ],

    render(f) {
      const P = f.params, L = f.layout, ctx = f.ctx;
      if (!L.count) return;
      const rock = 1 + P.rock * 0.25 * Math.sin(TAU * f.p);
      const depth = P.depth * rock;
      const horizonY = f.cy - P.horizon * f.unit + P.rock * Math.sin(TAU * f.p) * f.unit * 0.03;
      const nLines = L.lines.length;
      // Far lines first so near lines overlap them, as on a real floor.
      const order = L.lines.map((_, i) => i).sort((a, b) => {
        const fa = nLines > 1 ? (nLines - 1 - a) / (nLines - 1) : 0.5;
        const fb = nLines > 1 ? (nLines - 1 - b) / (nLines - 1) : 0.5;
        return fb - fa;
      });
      for (const li of order) {
        const line = L.lines[li];
        const far = nLines > 1 ? (nLines - 1 - li) / (nLines - 1) : 0.5;
        const s = Math.max(0.3, 1 - depth * 0.55 * far);
        const alpha = 1 - P.fade * far * 0.6;
        for (const gi of line.glyphs) {
          const g = L.glyphs[gi];
          if (g.isSpace) continue;
          const y0 = f.cy + g.cy;
          const y = horizonY + (y0 - horizonY) * s;
          f.drawGlyph(g, { y, sx: s, sy: s, alpha });
        }
      }
      if (P.groundLine && f.echo === 0 && nLines) {
        const last = L.lines[nLines - 1];
        const y0 = f.cy + last.y + L.descent * 0.4;
        const y = horizonY + (y0 - horizonY) * Math.max(0.3, 1 - depth * 0.55 * 0);
        f.identity();
        ctx.save();
        ctx.globalAlpha = 0.3 * f.alpha;
        ctx.strokeStyle = f.colorOf({ vi: 0 });
        ctx.lineWidth = Math.max(1, f.unit * 0.002);
        ctx.beginPath();
        ctx.moveTo(f.cx - L.width / 2, y);
        ctx.lineTo(f.cx + L.width / 2, y);
        ctx.stroke();
        ctx.restore();
      }
    },

    looks: [
      { name: 'Showroom floor', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Fraunces', weight: 700 }, fill: { type: 'solid', color: '#141414' }, params: { depth: 0.7, horizon: 0.22 } } },
      { name: 'Runway', bg: { type: 'solid', color: '#0b0b0c' }, layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'gradient', color: '#faff00', color2: '#ff2e88', angle: 180 }, params: { depth: 0.85, horizon: 0.28, fade: 0.6 } } },
      { name: 'Plaza', bg: { type: 'solid', color: '#d9d6cf' }, layer: { font: { family: 'Inter Tight', weight: 800 }, fill: { type: 'solid', color: '#0015ff' }, params: { depth: 0.5, horizon: 0.12, rock: 0.5 } } },
    ],
  });
})(window.TM);
