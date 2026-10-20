/* Preset: Spotlight — a soft light travels your path and reveals type that is otherwise
 * nearly invisible. The unlit text sits as a faint, kerned imprint; the lit text is drawn into a
 * scratch buffer and masked per pixel by the light's falloff, so the edge of the pool cuts
 * through letters like a real spot (soft or hard). Letters under the light lift a touch and,
 * on variable fonts, gain weight. A haze of glow and a slow, seamless flicker sell the beam.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp, lerp, fract, pingpong } = TM.math;
  const K = TM.PathKit;

  // One private canvas, grown as needed and cleared per use (the pool is just big enough).
  let poolCanvas = null, poolCtx = null;
  function pool(w, h) {
    if (!poolCanvas || poolCanvas.width < w || poolCanvas.height < h) {
      const W = Math.max(w, poolCanvas ? poolCanvas.width : 0), H = Math.max(h, poolCanvas ? poolCanvas.height : 0);
      poolCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(W, H);
      poolCanvas.width = W;
      poolCanvas.height = H;
      poolCtx = poolCanvas.getContext('2d');
    }
    poolCtx.setTransform(1, 0, 0, 1, 0, 0);
    poolCtx.globalCompositeOperation = 'source-over';
    poolCtx.globalAlpha = 1;
    poolCtx.clearRect(0, 0, w + 2, h + 2);
    return poolCtx;
  }

  TM.registerPreset({
    id: 'spotlight',
    name: 'Spotlight',
    category: 'Path',
    description: 'A soft light travels your path and reveals type that is otherwise nearly invisible.',
    usesPath: true,
    path: 'line',
    fit: true,
    params: [
      TM.P.range('radius', 'Light radius', 0.05, 0.6, 0.005, 0.21, { group: 'Light', hint: '× the frame’s short side' }),
      TM.P.range('falloff', 'Falloff', 0.05, 1, 0.01, 0.65, { group: 'Light', hint: 'How soft the edge of the pool is' }),
      TM.P.toggle('hard', 'Hard edge', false, { group: 'Light', hint: 'A crisp theatre spot with a rim' }),
      TM.P.range('glow', 'Glow', 0, 1, 0.01, 0.45, { group: 'Light' }),
      TM.P.range('flicker', 'Flicker', 0, 1, 0.01, 0.15, { group: 'Light' }),
      TM.P.range('dark', 'Unlit type', 0, 0.5, 0.005, 0.07, { group: 'Type', hint: 'How visible the type is outside the light' }),
      TM.P.range('lift', 'Lift in light', 0, 0.4, 0.01, 0.08, { group: 'Type' }),
      TM.P.range('weight', 'Weight in light', 0, 1, 0.01, 0.8, { group: 'Type', hint: 'Variable fonts only' }),
      TM.P.range('laps', 'Passes per loop', 1, 4, 1, 1, { group: 'Motion', hint: 'Open paths go there and back' }),
      TM.P.ease('travel', 'Travel ease', 'inOutSine', { group: 'Motion' }),
    ],

    render(f) {
      const path = f.path;
      if (!path || path.length < 1) return;
      const P = f.params, L = f.layout;
      const ease = TM.ease(P.travel, 'inOutSine');
      const laps = Math.max(1, Math.round(P.laps));
      const u = path.closed ? ease(fract(laps * f.p)) : ease(pingpong(laps * f.p));
      const c = path.at(u * path.length);
      const R = P.radius * f.unit;
      const I = 1 - P.flicker * 0.45 * (0.5 + 0.5 * f.loopNoise(7, 5)); // seamless flicker
      const ctx = f.ctx;

      // Unlit imprint: whole kerned lines (cheap, cached glyphs).
      if (f.echo === 0 && P.dark > 0) for (const line of L.lines) if (line.text.trim()) f.drawLine(line, { alpha: P.dark });

      // Haze under the type.
      if (P.glow > 0 && f.echo === 0) {
        f.identity();
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R * 1.25);
        const col = f.colorOf({ vi: 0 });
        g.addColorStop(0, TM.color.rgba(col, 0.22 * P.glow * I));
        g.addColorStop(0.55, TM.color.rgba(col, 0.07 * P.glow * I));
        g.addColorStop(1, TM.color.rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(c.x, c.y, R * 1.25, 0, TAU);
        ctx.fill();
      }

      // Lit pass into a small canvas the size of the pool, masked there by the falloff, then
      // composited back: per-pixel light at a fraction of a full-frame buffer's cost.
      const x0 = Math.max(0, Math.floor(c.x - R - 2)), y0 = Math.max(0, Math.floor(c.y - R - 2));
      const x1 = Math.min(f.W, Math.ceil(c.x + R + 2)), y1 = Math.min(f.H, Math.ceil(c.y + R + 2));
      if (x1 <= x0 || y1 <= y0) return;
      const bw = x1 - x0, bh = y1 - y0;
      const b = pool(bw, bh);
      const Wt = P.weight > 0 ? K.weights(f, P.weight) : null;
      let any = false;
      f.drawInto(b, () => {
        for (const g of L.glyphs) {
          if (g.isSpace) continue;
          const x = f.cx + g.cx, y = f.cy + g.cy;
          const d = Math.hypot(x - c.x, y - c.y);
          if (d > R + f.size) continue;
          const w = clamp(1 - d / R);
          const o = { x: x - x0, y: y - y0, scale: 1 + P.lift * w * w, alpha: I };
          if (Wt) o.weight = K.quantWeight(lerp(Wt.base, Wt.hi, w));
          f.drawGlyph(g, o);
          any = true;
        }
      });
      if (!any) return;
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalAlpha = 1;
      b.globalCompositeOperation = 'destination-in';
      const inner = P.hard ? 0.985 : clamp(1 - P.falloff, 0, 0.95);
      const m = b.createRadialGradient(c.x - x0, c.y - y0, 0, c.x - x0, c.y - y0, R);
      m.addColorStop(0, 'rgba(0,0,0,1)');
      m.addColorStop(inner, 'rgba(0,0,0,1)');
      m.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = m;
      b.fillRect(0, 0, bw, bh);
      b.globalCompositeOperation = 'source-over';
      f.identity();
      ctx.globalAlpha = 1;
      ctx.drawImage(b.canvas, 0, 0, bw, bh, x0, y0, bw, bh);
      if (P.hard && f.echo === 0) {
        ctx.save();
        K.strokeStyle(f, Math.max(1, f.unit * 0.002), 0.35 * I);
        ctx.beginPath();
        ctx.arc(c.x, c.y, R, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    },

    looks: [
      { name: 'Noir', bg: { type: 'solid', color: '#0b0b0c' }, post: { grain: 0.35, vignette: 0.5 }, layer: { font: { family: 'Playfair Display', weight: 900 }, fill: { type: 'solid', color: '#f4f1ea' }, params: { hard: true, radius: 0.24, dark: 0.04, flicker: 0.3 }, path: 'line' } },
      { name: 'Torch', bg: { type: 'solid', color: '#120403' }, layer: { font: { family: 'Roboto Flex', weight: 300 }, fill: { type: 'solid', color: '#ffa600' }, fx: { glow: { amount: 0.4, color: '#ff4d00' } }, params: { radius: 0.18, glow: 0.8, weight: 1 }, path: 'infinity' } },
      { name: 'Blueprint', bg: { type: 'solid', color: '#03132e' }, layer: { font: { family: 'JetBrains Mono', weight: 700 }, fill: { type: 'solid', color: '#4cc9f0' }, params: { dark: 0.16, falloff: 0.9, radius: 0.28 }, path: 'scurve' } },
    ],
  });
})(window.TM);
