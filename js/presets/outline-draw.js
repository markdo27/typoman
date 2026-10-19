/* Preset: Outline Draw — each letter's outline is drawn on by an animated dash, then the fill
 * floods in like liquid rising inside the letter, staggered across the word. The exit drains
 * the fill and lifts the pen off the outline in the same direction it was drawn.
 *
 * Craft notes
 *  - The outline is a dashed strokeText run through f.drawGlyph (fill, palette, slant, echo all
 *    apply): one long dash slides in along every contour at once, with round caps like a pen.
 *    The gap after the dash is several times its length, so nothing leaks at the start.
 *  - The flood is the glyph's own fill clipped under a travelling wave whose amplitude dies as
 *    the level reaches the top, so the letter settles completely full.
 */
(function (TM) {
  'use strict';
  const { clamp, smoothstep, TAU } = TM.math;
  const DRAW_END = 0.62;    // in-window share spent drawing the outline
  const FLOOD_START = 0.42; // ...and where the flood starts (they overlap)
  const DRAIN_END = 0.55, LIFT_START = 0.35;

  TM.registerPreset({
    id: 'outline-draw',
    name: 'Outline Draw',
    category: 'Reveal',
    description: 'A pen draws every letter’s outline, then colour floods in like liquid filling the letter. Drains and lifts away.',
    params: [
      ...TM.P.sequence({ inDur: 0.55, outDur: 0.3, stagger: 0.55, easeIn: 'smooth', easeOut: 'inOutSine' }),
      TM.P.range('weight', 'Pen width (em)', 0.005, 0.12, 0.001, 0.028, { group: 'Pen' }),
      TM.P.select('lineColor', 'Pen colour', [['text', 'Text colour'], ['accent', 'Accent']], 'accent', { group: 'Pen' }),
      TM.P.color('accent', 'Accent', '#00e5ff', { group: 'Pen', showIf: { lineColor: 'accent' } }),
      TM.P.toggle('keep', 'Keep outline', false, { group: 'Pen', hint: 'Leave the outline on top of the fill' }),
      TM.P.select('flood', 'Fill', [['liquid', 'Liquid'], ['wipe', 'Wipe up'], ['fade', 'Fade'], ['none', 'Outline only']], 'liquid', { group: 'Fill' }),
      TM.P.range('wave', 'Wave height', 0, 1, 0.01, 0.5, { group: 'Fill', showIf: { flood: 'liquid' } }),
    ],

    render(f) {
      const P = f.params, L = f.layout, ctx = f.ctx;
      const capH = L.capH, size = L.sizePx;
      const eDraw = TM.ease(P.easeIn, 'smooth'), eOut = TM.ease(P.easeOut, 'inOutSine');
      const penW = Math.max(1, P.weight * size);
      const penColor = P.lineColor === 'accent' ? P.accent : null;
      const top = -capH - size * 0.12, bottom = L.descent;   // flood range around the baseline

      for (const g of L.glyphs) {
        if (g.isSpace) continue;
        const s = f.seq(g);
        if (!s.visible) continue;
        const x = f.cx + g.cx, y = f.cy + g.cy, base = f.cy + g.y;
        let draw, offset, level;
        if (s.kout > 0) {
          level = 1 - eOut(clamp(s.kout / DRAIN_END));
          draw = 1; offset = -eOut(clamp((s.kout - LIFT_START) / (1 - LIFT_START))); // the pen lifts off from the start
        } else {
          draw = eDraw(clamp(s.kin / DRAW_END)); offset = 0;
          level = TM.EASINGS.inOutSine(clamp((s.kin - FLOOD_START) / (1 - FLOOD_START)));
        }
        if (P.flood === 'none') level = 0;

        // ── fill ──
        if (level > 0.001) {
          if (P.flood === 'fade') f.drawGlyph(g, { x, y, alpha: level });
          else if (level >= 0.999) f.drawGlyph(g, { x, y });
          else {
            const yl = base + bottom + (top - bottom) * level;
            const amp = P.flood === 'liquid' ? P.wave * capH * 0.09 * Math.sin(Math.PI * level) : 0;
            const x0 = f.cx + g.x - size * 0.2, x1 = f.cx + g.x + g.w + size * 0.2;
            f.identity();
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x0, base + bottom + size);
            const n = 10, ph = TAU * (2 * f.p + g.i * 0.37);
            for (let i = 0; i <= n; i++) {
              const xx = x0 + ((x1 - x0) * i) / n;
              ctx.lineTo(xx, yl + amp * Math.sin(ph + (xx - x0) / (size * 0.35)));
            }
            ctx.lineTo(x1, base + bottom + size);
            ctx.closePath();
            ctx.clip();
            f.drawGlyph(g, { x, y });
            ctx.restore();
          }
        }

        // ── outline ──
        // Unless kept, the line fades as the flood tops out, and returns as the drain begins.
        const solid = P.keep || P.flood === 'none';
        const lineAlpha = solid ? 1 : s.kout > 0 ? smoothstep(0, 0.18, s.kout) : 1 - smoothstep(0.75, 1, level);
        const dash = 2.4 * (g.w + capH);
        const drawn = s.kout > 0 ? offset > -0.995 : draw > 0.005;
        if (drawn && lineAlpha > 0.002) {
          ctx.lineCap = 'round';
          if (draw < 1 || offset < 0) {
            // One long dash per contour; the gap after it is long enough to hide any contour.
            ctx.setLineDash([dash, dash * 5]);
            ctx.lineDashOffset = s.kout > 0 ? offset * dash : dash * (1 - draw);
          }
          const mode = f.strokeMode, w = f.strokeW, ex = f.extrude;
          f.strokeMode = 'outline'; f.strokeW = penW; f.extrude = null;
          try {
            f.drawGlyph(g, { x, y, alpha: lineAlpha, color: penColor || undefined });
          } finally {
            f.strokeMode = mode; f.strokeW = w; f.extrude = ex;
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
            ctx.lineCap = 'butt';
          }
        }
      }
    },
  });
})(window.TM);
