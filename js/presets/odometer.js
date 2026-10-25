/* Preset: Odometer — each letter rolls into place in mechanical steps, like a
 * counter drum. Unlike Split Flap, the characters never change: the same glyph
 * slides up in quantised detents, with ghost copies above and below suggesting the
 * reel, and a slot frame marking each line's window.
 */
(function (TM) {
  'use strict';
  const { clamp } = TM.math;

  TM.registerPreset({
    id: 'odometer',
    name: 'Odometer',
    category: 'Reveal',
    description: 'Letters click into place in mechanical steps, like a counter drum rolling to its number.',
    params: [
      ...TM.P.sequence({ inDur: 0.5, outDur: 0.3, stagger: 0.55, easeIn: 'glide', easeOut: 'inCubic' }),
      TM.P.range('steps', 'Detents', 2, 12, 1, 5, { group: 'Drum', hint: 'How many mechanical clicks each letter takes to land' }),
      TM.P.range('ghost', 'Reel ghosts', 0, 0.5, 0.01, 0.18, { group: 'Drum', hint: 'Faint copies of the letter above and below, as on a reel' }),
      TM.P.toggle('frame', 'Slot frame', true, { group: 'Drum', hint: 'Horizontal rails marking each line\'s slot window' }),
    ],

    render(f) {
      const P = f.params, L = f.layout, ctx = f.ctx;
      const steps = Math.max(2, Math.round(P.steps));
      const stepOf = (kin) => {
        const whole = Math.floor(clamp(kin, 0, 1) * steps);
        const within = clamp(kin, 0, 1) * steps - whole;
        // Ease within each detent so the letter settles with a small bounce-free stop.
        const e = f.ease(P.easeIn, 'glide')(within);
        return (whole + e) / steps;
      };
      if (P.frame && f.echo === 0) {
        f.identity();
        ctx.save();
        ctx.globalAlpha = 0.35 * f.alpha;
        ctx.strokeStyle = f.colorOf({ vi: 0 });
        ctx.lineWidth = Math.max(1, f.unit * 0.002);
        for (const line of L.lines) {
          const top = f.cy + line.y - L.capH - L.sizePx * 0.15;
          const bottom = f.cy + line.y + L.descent * 0.6;
          ctx.beginPath();
          ctx.moveTo(f.cx + line.x, top); ctx.lineTo(f.cx + line.x + line.width, top);
          ctx.moveTo(f.cx + line.x, bottom); ctx.lineTo(f.cx + line.x + line.width, bottom);
          ctx.stroke();
        }
        ctx.restore();
      }
      for (const g of L.glyphs) {
        if (g.isSpace) continue;
        const s = f.seq(g);
        if (!s.visible) continue;
        const kin = stepOf(s.kin);
        const kout = stepOf(s.kout);
        const y = f.cy + g.cy + (1 - kin) * L.capH + kout * L.capH;
        const alpha = clamp(s.vin, 0, 1) * (1 - clamp(s.vout, 0, 1));
        if (alpha <= 0.01) continue;
        if (P.ghost > 0) {
          f.drawGlyph(g, { y: y - L.capH, alpha: alpha * P.ghost * kin });
          f.drawGlyph(g, { y: y + L.capH, alpha: alpha * P.ghost * (1 - kin) });
        }
        f.drawGlyph(g, { y, alpha });
      }
    },

    looks: [
      { name: 'Counter', bg: { type: 'solid', color: '#0b0b0c' }, layer: { font: { family: 'Space Grotesk', weight: 700 }, fill: { type: 'solid', color: '#ffffff' }, params: { steps: 6, ghost: 0.2 } } },
      { name: 'Petrol station', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'solid', color: '#141414' }, params: { steps: 4, ghost: 0.12, frame: true } } },
      { name: 'Jackpot', bg: { type: 'solid', color: '#120403' }, layer: { font: { family: 'Unbounded', weight: 800 }, fill: { type: 'palette', palette: ['#faff00', '#ff2e88', '#00f0ff'] }, params: { steps: 8, ghost: 0.3 } } },
    ],
  });
})(window.TM);
