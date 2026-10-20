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

    looks: [
      { name: 'Editorial', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Fraunces', weight: 300 }, type: { case: 'none' }, fill: { type: 'solid', color: '#141414' }, params: { stagger: 0.35, distance: 0.9, tilt: 0, easeIn: 'smooth', easeOut: 'inCubic' } } },
      { name: 'Swiss cut', bg: { type: 'solid', color: '#ff3b00' }, layer: { font: { family: 'Inter Tight', weight: 800 }, fill: { type: 'solid', color: '#ffffff' }, params: { order: 'words', stagger: 0.7, tilt: 0, distance: 1.25, easeIn: 'snap', easeOut: 'inQuart' } } },
      { name: 'Title card', bg: { type: 'solid', color: '#0b0b0b' }, layer: { font: { family: 'Bodoni Moda', weight: 700 }, type: { case: 'title' }, fill: { type: 'gradient', color: '#f5d48a', color2: '#9a6b1f', angle: 160 }, params: { tilt: -6, scaleFrom: 1.12, stagger: 0.45, easeIn: 'glide' } } },
      { name: 'Drop', bg: { type: 'solid', color: '#111111' }, layer: { font: { family: 'Anton', weight: 400 }, fill: { type: 'palette', palette: ['#faff00', '#ffffff', '#ff2e88'] }, params: { direction: 'down', distance: 1.6, tilt: 12, stagger: 0.5, easeIn: 'overshoot' } } },
      { name: 'Flex rise', bg: { type: 'solid', color: '#0015ff' }, layer: { font: { family: 'Roboto Flex', weight: 900, width: 60 }, fill: { type: 'solid', color: '#ffffff' }, params: { stagger: 0.6, scaleFrom: 0.6, tilt: 0, easeIn: 'springSnappy' } } },
    ],
  });
})(window.TM);
