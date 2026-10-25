/* Preset: Ticker — the whole block slides like a marquee and bounces back.
 * The slide follows a sine with whole cycles per loop, so the loop point is seamless
 * even with the per-letter lag: every glyph's phase is shifted, never its clock. Letters
 * may run past the frame edge, as a marquee should; edge fade softens them out.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp, smoothstep } = TM.math;
  const DEG = Math.PI / 180;

  TM.registerPreset({
    id: 'ticker',
    name: 'Ticker',
    category: 'Kinetic',
    description: 'Your text slides like a marquee and bounces back, letters lagging behind the lead like a ribbon.',
    params: [
      TM.P.range('cycles', 'Trips per loop', 1, 4, 1, 1, { group: 'Motion', hint: 'Whole trips keep the loop seamless' }),
      TM.P.range('travel', 'Travel (frame)', 0.05, 0.6, 0.01, 0.3, { group: 'Motion', hint: 'How far the block slides each way, as a share of the frame' }),
      TM.P.range('lag', 'Letter lag', 0, 1, 0.01, 0.45, { group: 'Motion', hint: 'Each letter trails the one before it' }),
      TM.P.range('bob', 'Bob (em)', 0, 0.5, 0.01, 0.08, { group: 'Motion', hint: 'A small vertical bob, out of phase with the slide' }),
      TM.P.select('direction', 'Direction', [['right', 'Right first'], ['left', 'Left first']], 'right', { group: 'Motion' }),
      TM.P.toggle('fadeEdges', 'Fade at edges', true, { group: 'Look', hint: 'Letters dim as they slide off the frame edge' }),
    ],

    render(f) {
      const P = f.params, L = f.layout;
      if (!L.count) return;
      const dir = P.direction === 'left' ? -1 : 1;
      const travel = P.travel * Math.max(f.W, f.H);
      const cycles = Math.max(1, Math.round(P.cycles));
      const n = Math.max(1, L.count - 1);
      for (const g of L.glyphs) {
        if (g.isSpace) continue;
        const r = n > 0 ? g.vi / n : 0;
        const ph = TAU * cycles * f.p - r * P.lag * 1.6;
        const x = f.cx + g.cx + dir * Math.sin(ph) * travel;
        const y = f.cy + g.cy + Math.sin(ph + Math.PI / 2) * P.bob * L.capH;
        let alpha = 1;
        if (P.fadeEdges) {
          const edge = Math.min(1, f.W * 0.12);
          alpha = smoothstep(0, edge, x + g.w / 2) * (1 - smoothstep(f.W - edge, f.W, x - g.w / 2));
          alpha = clamp(alpha, 0, 1);
          if (alpha <= 0.01) continue;
        }
        const rot = dir * Math.cos(ph) * P.lag * 6 * DEG;
        f.drawGlyph(g, { x, y, rot, alpha });
      }
    },

    looks: [
      { name: 'Newsroom', bg: { type: 'solid', color: '#0b0b0c' }, layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'solid', color: '#faff00' }, params: { travel: 0.35, lag: 0.3, bob: 0 } } },
      { name: 'Departure', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Space Grotesk', weight: 700 }, fill: { type: 'solid', color: '#141414' }, params: { travel: 0.25, lag: 0.6, bob: 0.12 } } },
      { name: 'Neon crawl', bg: { type: 'solid', color: '#07000f' }, layer: { font: { family: 'Unbounded', weight: 800 }, fill: { type: 'palette', palette: ['#ff00e5', '#00f0ff', '#ffffff'] }, fx: { glow: { amount: 0.35, color: '#ff00e5' } }, params: { travel: 0.4, lag: 0.5, cycles: 2 } } },
    ],
  });
})(window.TM);
