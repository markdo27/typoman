/* Preset: Blob Reveal — each letter appears inside a soft, breathing blob.
 * Unlike Rise's straight line mask, the reveal is radial per letter: a circle grows over
 * the glyph, wobbles gently while the word holds, then shrinks away. The blob is always
 * big enough at full cover to hold the whole glyph, so the hold reads as clean type.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp } = TM.math;

  TM.registerPreset({
    id: 'blob-reveal',
    name: 'Blob Reveal',
    category: 'Reveal',
    description: 'Letters grow out of soft blobs that breathe while the word holds, then shrink away.',
    params: [
      ...TM.P.sequence({ inDur: 0.45, outDur: 0.3, stagger: 0.5, easeIn: 'glide', easeOut: 'inCubic' }),
      TM.P.range('size', 'Blob size (cap heights)', 0.8, 2.5, 0.05, 1.4, { group: 'Blob', hint: 'Radius of the blob at full cover, in cap heights' }),
      TM.P.range('wobble', 'Wobble', 0, 1, 0.01, 0.35, { group: 'Blob', hint: 'How much the blob breathes while the word holds' }),
      TM.P.range('halo', 'Halo', 0, 0.4, 0.01, 0.12, { group: 'Blob', hint: 'A soft blob-coloured glow behind each letter' }),
    ],

    render(f) {
      const P = f.params, L = f.layout, ctx = f.ctx;
      for (const g of L.glyphs) {
        if (g.isSpace) continue;
        const s = f.seq(g);
        if (!s.visible) continue;
        const cover = clamp(s.vin, 0, 1) * (1 - clamp(s.vout, 0, 1));
        if (cover <= 0.01) continue;
        const cx = f.cx + g.cx, cy = f.cy + g.cy;
        const wob = 1 + P.wobble * 0.22 * f.loopNoise(g.vi * 3.7 + 11, 1);
        const radius = Math.max(1, L.capH * P.size * (0.3 + 0.7 * cover) * wob);
        if (P.halo > 0 && f.echo === 0) {
          f.identity();
          ctx.save();
          ctx.globalAlpha = P.halo * cover * f.alpha;
          ctx.fillStyle = f.colorOf(g);
          ctx.beginPath();
          ctx.arc(cx, cy, radius * 1.12, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
        f.identity();
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, TAU);
        ctx.clip();
        const sc = 0.85 + 0.15 * cover;
        f.drawGlyph(g, { scale: sc, alpha: cover });
        ctx.restore();
      }
    },

    looks: [
      { name: 'Ink blobs', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Fraunces', weight: 800 }, fill: { type: 'solid', color: '#141414' }, params: { size: 1.5, wobble: 0.5, halo: 0.2 } } },
      { name: 'Bubblegum', bg: { type: 'solid', color: '#ffd6e0' }, layer: { font: { family: 'Bricolage Grotesque', weight: 800 }, fill: { type: 'palette', palette: ['#ff2e88', '#7a3cff', '#00a6a6'] }, params: { size: 1.3, wobble: 0.7, halo: 0.25 } } },
      { name: 'Deep sea', bg: { type: 'solid', color: '#06121f' }, layer: { font: { family: 'Unbounded', weight: 700 }, fill: { type: 'solid', color: '#e0fbfc' }, params: { size: 1.6, wobble: 0.4, halo: 0.15 } } },
    ],
  });
})(window.TM);
