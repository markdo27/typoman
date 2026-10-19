/* Preset: Flip — letters flip in 3D around the horizontal axis, cascading like dominoes, with
 * a second colour on the back of each letter; then they keep rolling and flip away.
 *
 * Craft notes
 *  - Each letter starts edge-on (invisible), shows its back mid-flip, and lands face-on. The
 *    default ease-in is a spring, so the throw overshoots past upright and settles; the
 *    default ease-out (inBack) tips letters back slightly (anticipation) before they roll away.
 *  - A true keystone: mid-flip the letter is drawn in horizontal strips, each scaled by the
 *    perspective at its own height, so the edge swinging toward the camera is really wider.
 *  - Positional secondary: each letter hops along an arc toward the camera while it turns.
 *  - Light from above: faces brighten as they tip up and darken as they tip away.
 */
(function (TM) {
  'use strict';
  const DEG = Math.PI / 180;
  const { clamp } = TM.math;

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
      TM.P.range('arc', 'Hop', 0, 1, 0.01, 0.35, { group: 'Flip', hint: 'Letters hop toward the camera as they turn' }),
      TM.P.select('backSide', 'Back side', [['color', 'Colour'], ['palette', 'Palette']], 'color', { group: 'Colour' }),
      TM.P.color('backColor', 'Back colour', '#00e5ff', { group: 'Colour', showIf: { backSide: 'color' } }),
      TM.P.range('shade', 'Light & shade', 0, 1, 0.01, 0.5, { group: 'Colour' }),
    ],

    setup() {
      return { scratch: null };
    },

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
        // Positional secondary: the letter hops along an arc toward the camera as it turns.
        const arc = Math.sin(Math.PI * clamp(s.kout > 0 ? s.kout : s.kin));
        const hopY = -P.arc * em * 0.45 * arc;
        const kArc = D / (D - P.arc * em * 0.6 * arc);
        const back = ca < 0;
        let color = f.colorOverride || (back ? (P.backSide === 'palette' ? pal[((g.vi < 0 ? 0 : g.vi) + 1) % pal.length] : P.backColor) : f.colorOf(g));
        let shaded = false;
        if (P.shade > 0 && !f.colorOverride) {
          // Light from above: tipping the face up brightens it, tipping it away darkens it.
          const tipUp = -sa * (back ? -1 : 1);
          const amt = P.shade * Math.min(1, Math.abs(tipUp) * 1.15);
          if (amt > 0.01) { color = TM.color.mix(color, tipUp > 0 ? '#ffffff' : '#000000', amt * (tipUp > 0 ? 0.35 : 0.6)); shaded = true; }
        }
        const X = f.cx + g.cx, hingeY = f.cy + g.cy + hingeOff + hopY;
        // Where a point at local height y (from the glyph's centre) lands, and its width there.
        const at = (y) => {
          const yh = y - hingeOff;                // from the hinge
          const k = (D / (D + yh * sa)) * kArc;   // depth −yh·sin θ: + is toward the camera
          return { Y: hingeY + yh * ca * k, k };
        };
        // The keystone only pays off when the top and bottom widths differ visibly.
        const flat = Math.abs(sa) < 0.05 || Math.abs(at(-capH * 0.6).k - at(capH * 0.6).k) * g.w < 1.5;
        if (flat) {
          const m = at(0);
          // An unshaded front face drawn in place takes the layer's own paint (smooth gradients).
          f.drawGlyph(g, { x: X, y: m.Y, sx: m.k, sy: ca * m.k, color: back || shaded ? color : undefined });
        } else {
          keystone(f, f.cache, g, X, at, color);
        }
      }
    },
  });

  /**
   * A true keystone: the letter is drawn upright once into a small scratch canvas, then copied
   * in horizontal strips, each placed and widened by the perspective at its own height, so the
   * near edge really is wider than the far one. Strips are about 6 px tall on screen.
   */
  function keystone(f, C, g, X, at, color) {
    const L = f.layout, em = L.sizePx;
    const pad = Math.ceil(em * 0.3 + (f.layer.stroke.mode !== 'none' ? f.layer.stroke.width * em * 2 : 0) + (f.layer.fx.extrude.depth > 0 ? f.layer.fx.extrude.depth * em * 0.45 : 0));
    const w = Math.ceil(g.w + pad * 2), h = Math.ceil(L.capH + L.descent + em * 0.3 + pad * 2);
    if (!C.scratch || C.scratch.c.width < w || C.scratch.c.height < h) {
      const c = TM.MotionKit.canvas(Math.max(w, C.scratch ? C.scratch.c.width : 0), Math.max(h, C.scratch ? C.scratch.c.height : 0));
      C.scratch = { c, ctx: c.getContext('2d') };
    }
    const { c, ctx: sctx } = C.scratch;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalAlpha = 1;
    sctx.clearRect(0, 0, w, h);
    const ou = w / 2, ov = pad + em * 0.3 + L.capH / 2; // the glyph's centre inside the scratch
    const alpha = f.alpha;
    f.alpha = 1; // drawn opaque; echo alpha applies once, on the strips
    try {
      f.drawInto(sctx, () => f.drawGlyph(g, { x: ou, y: ov, color }));
    } finally { f.alpha = alpha; }

    const ctx = f.ctx;
    const n = Math.max(6, Math.min(24, Math.ceil(Math.abs(at(h - ov).Y - at(-ov).Y) / 6)));
    ctx.globalAlpha = alpha;
    for (let i = 0; i < n; i++) {
      const v0 = (h * i) / n, v1 = (h * (i + 1)) / n;
      const p0 = at(v0 - ov), p1 = at(v1 - ov), pm = at((v0 + v1) / 2 - ov);
      const sy = (p1.Y - p0.Y) / (v1 - v0);
      if (Math.abs(sy) < 1e-4) continue;
      ctx.setTransform(pm.k, 0, 0, sy, X - pm.k * ou, p0.Y - sy * v0);
      // Each strip overlaps the next by a pixel, so no seam shows between them.
      const sh = Math.min(h - v0, v1 - v0 + 1);
      ctx.drawImage(c, 0, v0, w, sh, 0, v0, w, sh);
    }
    f.identity();
  }
})(window.TM);
