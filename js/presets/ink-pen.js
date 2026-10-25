/* Preset: Ink Pen — a pen writes the text, and the ink pressure varies as it goes.
 * Distinct from Outline Draw (which traces outlines, then floods): here the fill itself
 * arrives under the nib, each letter breathing slightly with seeded pressure noise, and
 * a nib dot parks on the letter currently being written. No outline is ever drawn.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp } = TM.math;

  TM.registerPreset({
    id: 'ink-pen',
    name: 'Ink Pen',
    category: 'Reveal',
    description: 'A nib writes your text letter by letter; the ink pressure breathes, so no two letters sit quite the same.',
    params: [
      ...TM.P.sequence({ inDur: 0.55, outDur: 0.3, stagger: 0.6, easeIn: 'smooth', easeOut: 'inCubic' }),
      TM.P.range('pressure', 'Pressure variation', 0, 1, 0.01, 0.5, { group: 'Ink', hint: 'How much each letter swells and thins with seeded pressure noise' }),
      TM.P.range('nib', 'Nib size (cap heights)', 0.08, 0.4, 0.01, 0.18, { group: 'Ink' }),
      TM.P.color('nibColor', 'Nib colour', '#ff2e88', { group: 'Ink', hint: 'The pen nib dot that follows the writing' }),
      TM.P.range('lean', 'Pen lean (°)', -30, 30, 1, 8, { group: 'Ink', hint: 'A fixed lean while the letter is being written' }),
    ],

    render(f) {
      const P = f.params, L = f.layout, ctx = f.ctx;
      const DEG = Math.PI / 180;
      let frontier = null;
      for (const g of L.glyphs) {
        if (g.isSpace) continue;
        const s = f.seq(g);
        if (!s.visible) continue;
        // Pressure: seeded, slow (2 cycles) noise per letter, so the ink stays alive
        // through the hold without ever strobing.
        const press = f.loopNoise(g.vi * 5.3 + 7, 2);
        const sx = 1 + P.pressure * 0.08 * press;
        const sy = 1 - P.pressure * 0.05 * press;
        const rot = (1 - s.vin) * P.lean * DEG;
        const alpha = clamp(s.vin, 0, 1) * (1 - clamp(s.vout, 0, 1));
        if (alpha <= 0.01) continue;
        f.drawGlyph(g, { sx, sy, rot, alpha });
        if (s.kin > 0 && s.kin < 1) frontier = g;
      }
      if (frontier && f.echo === 0) {
        const x = f.cx + frontier.cx + frontier.w * 0.5;
        const y = f.cy + frontier.cy + L.capH * 0.35;
        f.identity();
        ctx.save();
        ctx.globalAlpha = f.alpha;
        ctx.fillStyle = P.nibColor;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, L.capH * P.nib), 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    },

    looks: [
      { name: 'Fountain pen', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Fraunces', weight: 600 }, fill: { type: 'solid', color: '#141414' }, params: { pressure: 0.6, nibColor: '#0015ff' } } },
      { name: 'Marker', bg: { type: 'solid', color: '#ffffff' }, layer: { font: { family: 'Bricolage Grotesque', weight: 800 }, fill: { type: 'solid', color: '#ff2e88' }, params: { pressure: 0.4, nib: 0.24, nibColor: '#141414' } } },
      { name: 'Calligraphy', bg: { type: 'solid', color: '#1d1405' }, layer: { font: { family: 'Bodoni Moda', weight: 700 }, fill: { type: 'gradient', color: '#ffe28a', color2: '#b07a12', angle: 160 }, params: { pressure: 0.8, lean: 14, nibColor: '#ffe28a' } } },
    ],
  });
})(window.TM);
