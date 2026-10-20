/* Preset: Focus Pull — depth of field on type. Words sit on different depth planes and the
 * focus racks from one to the next (or sweeps across a single word), so letters drift in and
 * out of focus with a little parallax, like a lens pulling focus on a macro shot.
 *
 * Blur is deterministic and cross-browser (no ctx.filter): a small image pyramid of scratch
 * canvases. A defocused letter is drawn once or twice, at the two pyramid levels
 * (½ … 1/32 resolution) that bracket its blur radius, crossfaded so a rack never steps. The
 * levels are then folded back up with a chain of 2× bilinear upscales, which smooths like a wide
 * Gaussian. Every copy is limited to the text's bounding box, so the cost stays small.
 */
(function (TM) {
  'use strict';
  const { clamp, fract, TAU } = TM.math;
  const DEEP = [4, 8, 16, 32]; // pyramid levels below ½ resolution

  const makeCanvas = (w, h) => TM.MotionKit.canvas(w, h);

  TM.registerPreset({
    id: 'focus-pull',
    name: 'Focus Pull',
    category: 'Dimensional',
    description: 'A lens racks focus across your words: letters on different depth planes slide in and out of focus, with parallax.',
    looks: [
      { name: 'Macro', bg: { type: 'radial', color: '#2a2a30', color2: '#050506' }, post: { vignette: 0.5, grain: 0.12 },
        layer: { font: { family: 'Instrument Serif', weight: 400 }, fill: { type: 'solid', color: '#f6f6f6' }, params: { aperture: 0.8, haze: 0.5 } } },
      { name: 'Golden Hour', bg: { type: 'linear', color: '#ffb547', color2: '#ff5e5b', angle: 160 },
        layer: { font: { family: 'Fraunces', weight: 800 }, fill: { type: 'solid', color: '#fff1d6' }, params: { aperture: 0.6, parallax: 0.7 } } },
      { name: 'Night City', bg: { type: 'solid', color: '#03132e' },
        layer: { font: { family: 'Space Grotesk', weight: 700 }, fill: { type: 'palette', palette: ['#4cc9f0', '#f72585', '#e0fbfc'] },
          fx: { glow: { amount: 0.35, color: '#4cc9f0' } }, params: { depth: 1 } } },
    ],
    params: [
      TM.P.select('focusOn', 'Focus on', [['auto', 'Auto'], ['words', 'Each word'], ['sweep', 'Sweep across']], 'auto', { group: 'Focus', hint: 'Auto: word by word, or a sweep for a single word' }),
      TM.P.range('pull', 'Rack length', 0.1, 0.9, 0.01, 0.4, { group: 'Focus', hint: 'Share of each focus stop spent racking' }),
      TM.P.ease('rackEase', 'Rack curve', 'smooth', { group: 'Focus' }),
      TM.P.range('aperture', 'Aperture', 0, 1, 0.01, 0.6, { group: 'Lens', hint: 'How soft out-of-focus letters get' }),
      TM.P.range('depth', 'Depth spread', 0, 1, 0.01, 0.7, { group: 'Lens' }),
      TM.P.range('parallax', 'Parallax', 0, 1, 0.01, 0.4, { group: 'Lens' }),
      TM.P.range('haze', 'Haze', 0, 1, 0.01, 0.35, { group: 'Lens', hint: 'Defocused letters lose contrast' }),
    ],

    setup(f) {
      const L = f.layout, P = f.params;
      const words = Math.max(1, L.words);
      const sweep = P.focusOn === 'sweep' || (P.focusOn === 'auto' && words < 2);
      const z = new Array(L.glyphs.length).fill(0);
      let stops;
      if (sweep) {
        // A tilted focal plane: depth runs across the text; focus sweeps one end to the other and back.
        for (const g of L.glyphs) z[g.i] = (2 * g.cx) / Math.max(1, L.width) + f.srand(g.i, 5) * 0.12;
        stops = [-1, 1];
      } else {
        // Each word on its own plane: evenly spaced depths, dealt out extremes-first so that
        // consecutive words are far apart and every rack visibly changes the focus.
        const levels = Array.from({ length: words }, (_, i) => (words > 1 ? -1 + (2 * i) / (words - 1) : 0));
        const planes = [];
        for (let lo = 0, hi = words - 1, t = 0; lo <= hi; t++) planes.push(t % 2 ? levels[hi--] : levels[lo++]);
        for (const g of L.glyphs) z[g.i] = planes[Math.min(planes.length - 1, g.word)] + f.srand(g.i, 5) * 0.12;
        stops = planes;
      }
      return { z, stops };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      if (!C) return;
      const n = C.stops.length;
      // Focal plane: hold on a stop, then rack to the next; the last stop racks back to the first.
      const seg = f.p * n, k = Math.floor(seg) % n, u = fract(seg);
      const hold = 1 - P.pull;
      const e = u < hold ? 0 : TM.ease(P.rackEase, 'smooth')((u - hold) / P.pull);
      const zf = C.stops[k] + (C.stops[(k + 1) % n] - C.stops[k]) * e;
      const depth = P.depth, maxBlur = 0.05 * f.unit * P.aperture;
      const camX = Math.sin(TAU * f.p) * f.unit * 0.025 * P.parallax;
      const camY = Math.cos(TAU * f.p) * f.unit * 0.012 * P.parallax;

      // Pyramid regions: level 2 is the ½-res plate; deeper levels share a second buffer.
      const levels = [2].concat(DEEP);
      const draws = levels.map(() => []);
      const sharp = [];
      for (const g of L.glyphs) {
        if (g.isSpace) continue;
        const z = C.z[g.i] * depth;
        const r = maxBlur * Math.abs(z - zf * depth);
        const persp = 1 + 0.07 * z;
        const it = {
          g,
          x: f.cx + g.cx * persp + camX * z,
          y: f.cy + g.cy * persp + camY * z,
          scale: persp * (1 + 0.035 * clamp(r / (f.unit * 0.03))), // defocus "breathing"
          alpha: 1 - P.haze * 0.6 * clamp(r / (f.unit * 0.035)),
        };
        // Blend between the two levels that bracket the radius (level 0 = the sharp pass). The
        // deeper copy is composited over the shallower one, so the shallower alpha is compensated
        // (a·(1−w) / (1−a·w)) for the pair to add up to exactly one letter with source-over.
        const l = Math.log2(Math.max(1, r)), i = Math.min(5, Math.floor(l)), w = i >= 5 ? 0 : l - i;
        const a = it.alpha;
        const put = (lv, alpha) => { if (alpha > 0.003) (lv === 0 ? sharp : draws[lv - 1]).push(Object.assign({}, it, { alpha })); };
        put(i, w > 0 ? (a * (1 - w)) / Math.max(1e-3, 1 - a * w) : a);
        put(i + 1, a * w);
      }

      for (const it of sharp) f.drawGlyph(it.g, { x: it.x, y: it.y, scale: it.scale, alpha: it.alpha });
      if (!draws.some((d) => d.length)) return;

      // The pyramid covers the text's bounding box (fixed per layout, snapped to the 1/32 grid).
      // Its levels are small canvases of their own: drawing from a canvas snapshots all of it,
      // so frame-sized scratch buffers would cost a full-frame copy per fold.
      const pad = f.unit * 0.05 * P.aperture * 2.2 * depth + L.sizePx * 0.25 + f.unit * 0.04 * P.parallax + L.width * 0.06;
      const snap = (v, up) => (up ? Math.ceil(v / 32) * 32 : Math.floor(v / 32) * 32);
      const x0 = snap(f.cx - L.width / 2 - pad), y0 = snap(f.cy - L.height / 2 - L.capH - pad);
      const bw = snap(f.cx + L.width / 2 + pad, true) - x0, bh = snap(f.cy + L.height / 2 + L.descent + pad, true) - y0;
      const key = bw + 'x' + bh;
      if (!C.pyr || C.pyr.key !== key) {
        C.pyr = { key, lv: levels.map((kk) => { const c = makeCanvas(bw / kk, bh / kk); return { c, ctx: c.getContext('2d') }; }) };
      }
      const pyr = C.pyr.lv;
      draws.forEach((items, lv) => {
        const kk = levels[lv], { c, ctx } = pyr[lv];
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, c.width, c.height);
        if (!items.length) return;
        // A gradient fill can't follow a buffer drawn at 1/kk scale (drawInto only shifts), so
        // each blurred letter takes the gradient's colour where it sits in the frame: once blurred,
        // a letter-sized gradient step is invisible, and the sharp letters keep the real one.
        const grad = f.layer.fill.type === 'gradient' && !f.colorOverride;
        f.drawInto(ctx, () => {
          for (const it of items) {
            const o = { x: (it.x - x0) / kk, y: (it.y - y0) / kk, scale: it.scale / kk, alpha: it.alpha };
            if (grad) o.color = f.colorOf({ vi: it.g.vi, cx: it.x - f.cx, cy: it.y - f.cy });
            f.drawGlyph(it.g, o);
          }
        }, { x: x0, y: y0 });
      });
      // Fold the pyramid back up: 1/32 → 1/16 → ⅛ → ¼ → ½, each a 2× bilinear upscale drawn over the next level.
      for (let lv = levels.length - 1; lv >= 1; lv--) {
        if (!draws.slice(lv).some((d) => d.length)) continue;
        const src = pyr[lv].c, dst = pyr[lv - 1].ctx;
        dst.setTransform(1, 0, 0, 1, 0, 0);
        dst.globalAlpha = 1;
        dst.imageSmoothingEnabled = true;
        dst.drawImage(src, 0, 0, src.width, src.height, 0, 0, src.width * 2, src.height * 2);
      }
      f.identity();
      const ctx = f.ctx;
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(pyr[0].c, 0, 0, bw / 2, bh / 2, x0, y0, bw, bh);
    },
  });
})(window.TM);
