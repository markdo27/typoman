/* Preset: Rise — the classic masked line reveal.
 * Reference preset for the reveal family: f.seq() sequencing, per-line clipping masks.
 */
(function (TM) {
  'use strict';
  const DEG = Math.PI / 180;

  TM.registerPreset({
    id: 'rise',
    name: 'Rise',
    category: 'Reveal',
    description: 'Letters rise out of a hidden baseline mask, hold, then exit. The bread-and-butter title move.',
    params: [
      ...TM.P.sequence({ inDur: 0.42, outDur: 0.3, stagger: 0.55, easeIn: 'glide', easeOut: 'inQuart' }),
      TM.P.select('direction', 'Direction', [['up', 'Up'], ['down', 'Down']], 'up', { group: 'Motion' }),
      TM.P.range('distance', 'Travel (em)', 0.2, 3, 0.05, 1.15, { group: 'Motion' }),
      TM.P.range('tilt', 'Tilt in (°)', -45, 45, 1, 8, { group: 'Motion' }),
      TM.P.range('scaleFrom', 'Scale from', 0.2, 1.5, 0.01, 1, { group: 'Motion' }),
      TM.P.toggle('mask', 'Mask to line', true, { group: 'Motion' }),
    ],

    render(f) {
      const P = f.params, L = f.layout, ctx = f.ctx;
      const dir = P.direction === 'down' ? -1 : 1;
      const dist = P.distance * L.capH * 1.1;
      L.lines.forEach((line) => {
        if (P.mask) {
          // Clip to this line's cap-height band (plus room for descenders) in frame space.
          f.identity();
          ctx.save();
          ctx.beginPath();
          const top = f.cy + line.y - L.capH - L.sizePx * 0.12;
          const bottom = f.cy + line.y + L.descent * 0.9;
          ctx.rect(0, top, f.W, bottom - top);
          ctx.clip();
        }
        for (const gi of line.glyphs) {
          const g = L.glyphs[gi];
          if (g.isSpace) continue;
          const s = f.seq(g);
          if (!s.visible) continue;
          const y = f.cy + g.cy + dir * ((1 - s.vin) * dist - s.vout * dist);
          const rot = dir * ((1 - s.vin) * P.tilt - s.vout * P.tilt * 0.5) * DEG;
          const sc = P.scaleFrom + (1 - P.scaleFrom) * s.vin;
          f.drawGlyph(g, { y, rot, scale: sc, alpha: P.mask ? 1 : Math.min(1, s.vin * 1.4) * (1 - s.vout) });
        }
        if (P.mask) ctx.restore();
      });
    },
  });
})(window.TM);
