/* Preset: Flip — letters flip in 3D around the horizontal axis, cascading like dominoes, with
 * a second colour on the back of each letter; then they keep rolling and flip away.
 *
 * Craft notes
 *  - Each letter starts edge-on (invisible), shows its back mid-flip, and lands face-on. The
 *    default ease-in is a spring, so the throw overshoots past upright and settles; the
 *    default ease-out (inBack) tips letters back slightly (anticipation) before they roll away.
 *  - Projection: height = cos θ, a per-letter perspective scale (the near edge swings toward
 *    the camera) and a slight skew that peaks mid-flip, so the turn reads as 3D, not a squash.
 *  - Light from above: faces brighten as they tip up and darken as they tip away.
 */
(function (TM) {
  'use strict';
  const DEG = Math.PI / 180;

  TM.registerPreset({
    id: 'flip',
    name: 'Flip',
    category: 'Dimensional',
    description: 'Letters flip over in 3D like dominoes, flashing a second colour on their backs, then roll away.',
    looks: [
      { name: 'Domino', bg: { type: 'solid', color: '#111111' },
        layer: { font: { family: 'Bebas Neue', weight: 400 }, fill: { type: 'solid', color: '#ffffff' },
          params: { hinge: 'baseline', turns: 0, backColor: '#e63326', stagger: 0.8 } } },
      { name: 'Paper Cards', bg: { type: 'solid', color: '#f4f1ea' }, post: { grain: 0.15 },
        layer: { font: { family: 'DM Serif Display', weight: 400 }, fill: { type: 'solid', color: '#141414' },
          params: { backColor: '#ff3d00', turns: 1, shade: 0.7 } } },
      { name: 'Mint Tiles', bg: { type: 'solid', color: '#062925' },
        layer: { font: { family: 'Outfit', weight: 800 }, fill: { type: 'palette', palette: ['#5cffc8', '#eafff7', '#00b38f'] },
          params: { backSide: 'palette', turns: 2, hinge: 'top' } } },
    ],
    params: [
      ...TM.P.sequence({ inDur: 0.5, outDur: 0.3, stagger: 0.7, easeIn: 'springSoft', easeOut: 'inBack' }),
      TM.P.range('turns', 'Extra half-turns', 0, 4, 1, 1, { group: 'Flip', hint: 'Each extra half-turn shows the back once more' }),
      TM.P.select('hinge', 'Hinge', [['center', 'Centre'], ['baseline', 'Baseline'], ['top', 'Cap top']], 'center', { group: 'Flip' }),
      TM.P.select('direction', 'Direction', [['forward', 'Over the top'], ['back', 'From below']], 'forward', { group: 'Flip' }),
      TM.P.range('persp', 'Perspective', 0, 1, 0.01, 0.55, { group: 'Flip' }),
      TM.P.select('backSide', 'Back side', [['color', 'Colour'], ['palette', 'Palette']], 'color', { group: 'Colour' }),
      TM.P.color('backColor', 'Back colour', '#00e5ff', { group: 'Colour', showIf: { backSide: 'color' } }),
      TM.P.range('shade', 'Light & shade', 0, 1, 0.01, 0.5, { group: 'Colour' }),
    ],

    render(f) {
      const P = f.params, L = f.layout;
      const capH = L.capH, em = L.sizePx;
      const dirS = P.direction === 'back' ? -1 : 1;
      const throwIn = -(90 + 180 * P.turns) * DEG;  // start edge-on
      const throwOut = (90 + 180 * P.turns) * DEG;  // keep rolling, end edge-on
      const D = em * (2.2 + 8 * (1 - P.persp));     // camera distance, per letter
      const pal = f.layer.fill.palette;
      // Hinge height relative to the glyph's cap-height centre (screen y, down is +).
      const hingeOff = P.hinge === 'baseline' ? capH / 2 : P.hinge === 'top' ? -capH / 2 : 0;

      for (const g of L.glyphs) {
        if (g.isSpace) continue;
        const s = f.seq(g);
        if (!s.visible) continue;
        const a = (s.kout > 0 ? throwOut * s.vout : throwIn * (1 - s.vin)) * dirS;
        const ca = Math.cos(a), sa = Math.sin(a);
        if (Math.abs(ca) < 0.004) continue;

        // The glyph's centre sits at -hingeOff from the hinge; rotate it about the hinge.
        const yc = -hingeOff;
        const z = -yc * sa;                         // depth of the glyph centre (+ toward camera)
        const k = D / (D - z - capH * 0.5 * Math.abs(sa) * P.persp); // near edge swings closer
        const hingeY = f.cy + g.cy + hingeOff;
        const back = ca < 0;
        let color = f.colorOverride || (back ? (P.backSide === 'palette' ? pal[((g.vi < 0 ? 0 : g.vi) + 1) % pal.length] : P.backColor) : f.colorOf(g));
        if (P.shade > 0 && !f.colorOverride) {
          // Light from above: tipping the face up brightens it, tipping it away darkens it.
          const tipUp = -sa * (back ? -1 : 1);
          const amt = P.shade * Math.min(1, Math.abs(tipUp) * 1.15);
          if (amt > 0.01) color = TM.color.mix(color, tipUp > 0 ? '#ffffff' : '#000000', amt * (tipUp > 0 ? 0.35 : 0.6));
        }
        f.drawGlyph(g, {
          x: f.cx + g.cx,
          y: hingeY + yc * ca * k,
          sx: k,
          sy: ca * k,
          skew: -P.persp * 0.42 * sa * ca,
          color,
        });
      }
    },
  });
})(window.TM);
