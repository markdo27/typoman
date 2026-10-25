/* Preset: Axis Drift — each letter breathes through the font's weight on its own
 * seeded rhythm. Unlike Axis Wave, there is no travelling wave and no order: letters
 * drift independently, so the word never reads as a single sweep. On fonts without a
 * variable weight the same drift still shows as a gentle scale pulse.
 *
 * Craft notes
 *  - Each letter gets its own noise salt (its visible index), so changing the text
 *    re-seeds only the letters that moved; the drift itself is loopNoise, which is
 *    periodic by construction, so frame(0) == frame(1) at any whole cycle count.
 *  - Weights are snapped to steps of 10. Canvas caches font strings, and an
 *    unsnapped weight would rebuild that cache every frame for every letter.
 */
(function (TM) {
  'use strict';
  const { clamp } = TM.math;

  TM.registerPreset({
    id: 'axis-drift',
    name: 'Axis Drift',
    category: 'Kinetic',
    description: 'Letters breathe through the font weight on their own seeded rhythms — no wave, no order, just drift.',
    prefers: { family: 'Roboto Flex', weight: 400 },
    params: [
      TM.P.range('cycles', 'Breaths per loop', 1, 4, 1, 1, { group: 'Drift', hint: 'Whole breaths keep the loop seamless' }),
      TM.P.range('range', 'Weight range', 0, 400, 5, 180, { group: 'Drift', hint: 'How far each letter swings from the layer weight' }),
      TM.P.range('lift', 'Lift (em)', 0, 0.4, 0.01, 0.06, { group: 'Drift', hint: 'Letters rise as they grow heavier' }),
      TM.P.range('pulse', 'Scale pulse', 0, 0.2, 0.01, 0.05, { group: 'Drift', hint: 'The fallback swell on fonts without a variable weight' }),
    ],

    render(f) {
      const P = f.params, L = f.layout;
      if (!L.count) return;
      const base = f.layer.font.weight || 400;
      const cycles = Math.max(1, Math.round(P.cycles));
      for (const g of L.glyphs) {
        if (g.isSpace) continue;
        const drift = f.loopNoise(g.vi * 7.3 + 3, cycles);
        const drift2 = f.loopNoise(g.vi * 13.1 + 29, cycles);
        const weight = Math.round(clamp(base + drift * P.range, 100, 1000) / 10) * 10;
        const sc = 1 + P.pulse * drift2;
        const y = f.cy + g.cy - drift * P.lift * L.capH;
        f.drawGlyph(g, { y, sx: sc, sy: sc, weight });
      }
    },

    looks: [
      { name: 'Flex breath', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Roboto Flex', weight: 400 }, fill: { type: 'solid', color: '#141414' }, params: { range: 300, lift: 0.08 } } },
      { name: 'Heavy air', bg: { type: 'solid', color: '#07000f' }, layer: { font: { family: 'Unbounded', weight: 500 }, fill: { type: 'gradient', color: '#ff00e5', color2: '#00f0ff', angle: 120 }, params: { range: 250, cycles: 2, pulse: 0.08 } } },
      { name: 'Quiet drift', bg: { type: 'solid', color: '#ffffff' }, layer: { font: { family: 'Inter Tight', weight: 500 }, fill: { type: 'solid', color: '#0015ff' }, params: { range: 120, lift: 0.03, pulse: 0.03 } } },
      { name: 'Slow tide', bg: { type: 'solid', color: '#1b0a2e' }, layer: { font: { family: 'Fraunces', weight: 400 }, fill: { type: 'solid', color: '#ffe3a3' }, params: { range: 200, cycles: 1, lift: 0.12, pulse: 0.02 } } },
    ],
  });
})(window.TM);
