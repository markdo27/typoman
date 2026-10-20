/* Preset: Outline Draw — each letter's outline is drawn on by an animated dash, then the fill
 * floods in like liquid rising inside the letter, staggered across the word. The exit drains
 * the fill and lifts the pen off the outline in the same direction it was drawn.
 *
 * Craft notes
 *  - The outline is a dashed strokeText run through f.drawGlyph (fill, palette, slant, echo all
 *    apply): one long dash slides in along every contour at once, with round caps like a pen.
 *    The gap after the dash is several times its length, so nothing leaks at the start.
 *  - Canvas restarts the dash on every contour, so a dash as long as the glyph's longest
 *    contour draws every contour on (and lifts it off) continuously. That length is measured
 *    per glyph, because a fixed guess is too short for an M or a W: their outlines snapped in
 *    at the end of the draw and vanished in one frame at the start of the lift.
 *  - The flood is the glyph's own fill clipped under a travelling wave whose amplitude dies as
 *    the level reaches the top, so the letter settles completely full.
 */
(function (TM) {
  'use strict';
  const { clamp, smoothstep, TAU } = TM.math;
  const DRAW_END = 0.62;    // in-window share spent drawing the outline
  const FLOOD_START = 0.42; // ...and where the flood starts (they overlap)
  const DRAIN_END = 0.55, LIFT_START = 0.35;

  // ── contour length ──
  // Canvas exposes no glyph outlines, and tracing the filled shape is not enough: variable
  // fonts and joined Arabic keep overlapping contours, which strokeText strokes in full. So the
  // quantity that matters is measured directly: the shortest dash for which a dashed stroke of
  // the glyph equals the solid stroke, found by doubling and bisection with a thin pen at a fixed
  // reference size. A fixed size keeps the result independent of the render size, so the
  // preview and every export draw on with the same timing. Results are memoised per glyph.
  const REF = 96;
  const memo = new Map();
  let mctx = null;

  /** Length of the longest contour of `ch` in `font` (a font string at REF px), per px of font size. */
  function longestContour(font, ch) {
    const key = font + '\u0001' + ch + '\u0001' + TM.fonts.version();
    let v = memo.get(key);
    if (v !== undefined) return v;
    if (!mctx) mctx = TM.MotionKit.canvas(8, 8).getContext('2d', { willReadFrequently: true });
    const c = mctx.canvas;
    mctx.font = font;
    const m = mctx.measureText(ch);
    const x0 = Math.ceil(Math.max(0, m.actualBoundingBoxLeft || 0)) + 3;
    const y0 = Math.ceil(Math.max(0, m.actualBoundingBoxAscent || REF)) + 3;
    const w = x0 + Math.ceil(Math.max(1, m.actualBoundingBoxRight || REF)) + 3;
    const h = y0 + Math.ceil(Math.max(0, m.actualBoundingBoxDescent || 0)) + 3;
    c.width = w; c.height = h; // resets the context
    const stroke = (dash) => {
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.clearRect(0, 0, w, h);
      mctx.font = font;
      if ('fontKerning' in mctx) mctx.fontKerning = 'normal';
      mctx.lineWidth = 1;
      mctx.lineJoin = 'round';
      mctx.lineCap = 'round';
      mctx.setLineDash(dash ? [dash, dash * 5] : []);
      mctx.lineDashOffset = 0;
      mctx.strokeText(ch, x0, y0);
      return mctx.getImageData(0, 0, w, h).data;
    };
    const solid = stroke(0);
    // A dash shorter than some contour leaves part of it undrawn: whole pixels go missing.
    const short = (dash) => {
      const d = stroke(dash);
      for (let i = 3, k = 0; i < d.length; i += 4) if (Math.abs(d[i] - solid[i]) > 100 && ++k > 2) return true;
      return false;
    };
    let lo = 0, hi = REF * 0.25;
    for (let n = 0; n < 12 && short(hi); n++) { lo = hi; hi *= 2; }
    for (let n = 0; n < 9; n++) { const mid = (lo + hi) / 2; if (short(mid)) lo = mid; else hi = mid; }
    v = hi / REF;
    if (memo.size > 600) memo.delete(memo.keys().next().value);
    memo.set(key, v);
    return v;
  }

  TM.registerPreset({
    id: 'outline-draw',
    name: 'Outline Draw',
    category: 'Reveal',
    description: 'A pen draws every letter’s outline, then colour floods in like liquid filling the letter. Drains and lifts away.',
    looks: [
      { name: 'Blueprint', bg: { type: 'solid', color: '#06224a' }, post: { grain: 0.1 },
        layer: { font: { family: 'Big Shoulders Display', weight: 800 }, fill: { type: 'solid', color: '#e0fbfc' },
          params: { lineColor: 'accent', accent: '#4cc9f0', flood: 'wipe', keep: true, weight: 0.02 } } },
      { name: 'Neon Sign', bg: { type: 'solid', color: '#07000f' },
        layer: { font: { family: 'Righteous', weight: 400 }, fill: { type: 'solid', color: '#ff00e5' },
          fx: { glow: { amount: 0.6, color: '#ff00e5' } }, params: { lineColor: 'accent', accent: '#00f0ff', flood: 'fade', weight: 0.035 } } },
      { name: 'Ink & Paper', bg: { type: 'solid', color: '#f4f1ea' },
        layer: { font: { family: 'Fraunces', weight: 800 }, fill: { type: 'solid', color: '#141414' },
          params: { lineColor: 'text', flood: 'liquid', wave: 0.8 } } },
    ],
    params: [
      ...TM.P.sequence({ inDur: 0.55, outDur: 0.3, stagger: 0.55, easeIn: 'smooth', easeOut: 'inOutSine' }),
      TM.P.range('weight', 'Pen width (em)', 0.005, 0.12, 0.001, 0.028, { group: 'Pen' }),
      TM.P.select('lineColor', 'Pen colour', [['text', 'Text colour'], ['accent', 'Accent']], 'accent', { group: 'Pen' }),
      TM.P.color('accent', 'Accent', '#00e5ff', { group: 'Pen', showIf: { lineColor: 'accent' } }),
      TM.P.toggle('keep', 'Keep outline', false, { group: 'Pen', hint: 'Leave the outline on top of the fill' }),
      TM.P.select('flood', 'Fill', [['liquid', 'Liquid'], ['wipe', 'Wipe up'], ['fade', 'Fade'], ['none', 'Outline only']], 'liquid', { group: 'Fill' }),
      TM.P.range('wave', 'Wave height', 0, 1, 0.01, 0.5, { group: 'Fill', showIf: { flood: 'liquid' } }),
    ],

    setup(f) {
      // Dash length per glyph: its longest contour at the layout size, with a small margin (a
      // dash that is too short pops in). Glyphs without a traceable outline (colour emoji)
      // keep the old proportional guess.
      const L = f.layout, font = TM.fonts.fontString(f.layer.font.family, f.layer.font.weight, REF);
      return {
        dash: L.glyphs.map((g) => {
          if (g.isSpace) return 0;
          const len = longestContour(font, g.ch) * L.sizePx;
          return len > L.capH * 0.2 ? len * 1.04 + 1 : 2.4 * (g.w + L.capH);
        }),
      };
    },

    render(f) {
      const P = f.params, L = f.layout, ctx = f.ctx, C = f.cache;
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
        const dash = C ? C.dash[g.i] : 2.4 * (g.w + capH);
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
