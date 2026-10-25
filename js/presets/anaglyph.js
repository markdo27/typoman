/* Preset: Anaglyph — a steady chromatic split with depth, not a glitch burst.
 * Every glyph is drawn with a red fringe on one side and a cyan fringe on the other,
 * then the true glyph on top, so the fringes read as depth rather than damage. Far
 * lines split wider than near ones, and the whole split sways slowly (one cycle),
 * never strobing. Glitch, by contrast, bursts, swaps and drops out.
 */
(function (TM) {
  'use strict';
  const { clamp } = TM.math;

  TM.registerPreset({
    id: 'anaglyph',
    name: 'Anaglyph',
    category: 'Glitch',
    description: 'A steady red/cyan split with depth: far lines split wider, and the whole image sways gently like a 3D print.',
    params: [
      TM.P.range('split', 'Split (em)', 0, 0.2, 0.005, 0.05, { group: 'Depth', hint: 'Fringe offset at the nearest line, in em' }),
      TM.P.range('depth', 'Depth spread', 0, 2, 0.01, 0.8, { group: 'Depth', hint: 'Extra split for far lines, × the base split' }),
      TM.P.range('sway', 'Sway', 0, 1, 0.01, 0.3, { group: 'Depth', hint: 'Slow one-cycle sway of the split amount' }),
      TM.P.color('red', 'Red channel', '#ff2a2a', { group: 'Channels' }),
      TM.P.color('cyan', 'Cyan channel', '#00d5ff', { group: 'Channels' }),
      TM.P.range('fringe', 'Fringe strength', 0.3, 1, 0.01, 0.9, { group: 'Channels', hint: 'Opacity of the red and cyan fringes under the main glyph' }),
    ],

    render(f) {
      const P = f.params, L = f.layout;
      if (!L.count) return;
      const nLines = L.lines.length;
      const sway = 1 + P.sway * 0.5 * f.loopNoise(41, 1);
      for (const line of L.lines) {
        const far = nLines > 1 ? (nLines - 1 - line.index) / (nLines - 1) : 0.5;
        const dx = P.split * L.capH * (1 + P.depth * far) * sway;
        for (const gi of line.glyphs) {
          const g = L.glyphs[gi];
          if (g.isSpace) continue;
          const x = f.cx + g.cx, y = f.cy + g.cy;
          // Fringes first, main glyph on top: the split shows only at the edges.
          f.drawGlyph(g, { x: x - dx, y, color: P.red, alpha: P.fringe });
          f.drawGlyph(g, { x: x + dx, y, color: P.cyan, alpha: P.fringe });
          f.drawGlyph(g, { x, y });
        }
      }
    },

    looks: [
      { name: '3D poster', bg: { type: 'solid', color: '#0b0b0c' }, layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'solid', color: '#ffffff' }, params: { split: 0.06, depth: 1 } } },
      { name: 'Retro print', bg: { type: 'solid', color: '#f1e3c8' }, layer: { font: { family: 'Bodoni Moda', weight: 800 }, fill: { type: 'solid', color: '#141414' }, params: { split: 0.04, depth: 0.5, sway: 0.15 } } },
      { name: 'Neon depth', bg: { type: 'solid', color: '#07000f' }, layer: { font: { family: 'Unbounded', weight: 800 }, fill: { type: 'palette', palette: ['#ffffff', '#ff00e5'] }, params: { split: 0.08, depth: 1.2, sway: 0.5 } } },
    ],
  });
})(window.TM);
