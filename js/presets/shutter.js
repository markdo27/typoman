/* Preset: Shutter — the text is revealed through rotating slats, like venetian blinds or a
 * trivision sign: the block is cut into bands that flip open one after another, settle with a
 * small wobble, hold, then flip on round and close.
 *
 * Craft notes
 *  - Each slat turns about its own axis: its band of the text shrinks with cos θ about the
 *    slat's centre line and darkens as it tilts away, with a hint of perspective in its width.
 *  - Slats are staggered by position (top to bottom, centre out, …), not by letter, so the
 *    reveal reads as one mechanism sweeping across the type.
 *  - The type is drawn once per frame into a small scratch plate through f.drawGlyph (fills,
 *    strokes, slant all apply); each slat is then one scaled strip copy of that plate.
 */
(function (TM) {
  'use strict';
  const K = TM.MotionKit;

  const makeCanvas = (w, h) => TM.MotionKit.canvas(w, h);

  TM.registerPreset({
    id: 'shutter',
    name: 'Shutter',
    category: 'Reveal',
    description: 'Venetian-blind slats flip open one after another to reveal your text, wobble to a stop, then flip shut.',
    looks: [
      { name: 'Venetian', bg: { type: 'solid', color: '#f4f1ea' },
        layer: { font: { family: 'Playfair Display', weight: 900 }, fill: { type: 'solid', color: '#141414' }, params: { size: 0.09, shade: 0.75 } } },
      { name: 'Barcode', bg: { type: 'solid', color: '#000000' },
        layer: { font: { family: 'Oswald', weight: 700 }, fill: { type: 'solid', color: '#ffffff' }, params: { dir: 'vertical', size: 0.05, order: 'random' } } },
      { name: 'Sunset Blinds', bg: { type: 'linear', color: '#1b0a2e', color2: '#ff5e5b', angle: 180 },
        layer: { font: { family: 'Bricolage Grotesque', weight: 800 }, fill: { type: 'solid', color: '#ffe3a3' }, params: { alternate: true, size: 0.14 } } },
    ],
    params: [
      ...TM.P.sequence({ inDur: 0.5, outDur: 0.3, stagger: 0.6, easeIn: 'springSoft', easeOut: 'inCubic' })
        .map((p) => (p.key === 'order' ? TM.P.select('order', 'Order', [['start', 'Top / left first'], ['end', 'Bottom / right first'], ['center', 'Centre out'], ['edges', 'Edges in'], ['random', 'Random']], 'start', { group: 'Timing' }) : p)),
      TM.P.select('dir', 'Slats', [['horizontal', 'Horizontal'], ['vertical', 'Vertical']], 'horizontal', { group: 'Blinds' }),
      TM.P.range('size', 'Slat size (em)', 0.04, 0.6, 0.005, 0.12, { group: 'Blinds' }),
      TM.P.range('turns', 'Extra half-turns', 0, 3, 1, 0, { group: 'Blinds' }),
      TM.P.toggle('alternate', 'Alternate direction', false, { group: 'Blinds' }),
      TM.P.range('shade', 'Shading', 0, 1, 0.01, 0.55, { group: 'Blinds' }),
      TM.P.range('persp', 'Perspective', 0, 1, 0.01, 0.4, { group: 'Blinds' }),
    ],

    setup() {
      return { plate: null };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      if (!C || !L.count) return;
      const em = L.sizePx;
      // Plate: the text block plus room for slant, strokes and extrusion.
      const ex = f.layer.fx.extrude.depth > 0 ? f.layer.fx.extrude.depth * em * 0.45 : 0;
      const sw = f.layer.stroke.mode !== 'none' ? f.layer.stroke.width * em * 2 : 0;
      const mx = Math.ceil(em * 0.35 + ex + sw), my = Math.ceil(em * 0.2 + ex + sw);
      const top = L.lines[0].y - L.capH - em * 0.12, bot = L.lines[L.lines.length - 1].y + L.descent;
      const x0 = Math.floor(f.cx - L.width / 2 - mx), y0 = Math.floor(f.cy + top - my);
      const pw = Math.ceil(L.width + mx * 2) + 2, ph = Math.ceil(bot - top + my * 2) + 2;

      // Slats along the block (horizontal bands, or vertical columns).
      const horiz = P.dir === 'horizontal';
      const span = horiz ? bot - top : L.width;
      const n = Math.max(1, Math.round(span / Math.max(1, P.size * em)));
      const t = span / n;
      const start = horiz ? f.cy + top : f.cx - L.width / 2;
      const turn = Math.PI / 2 + Math.PI * P.turns;

      const slats = [];
      let allOpen = true, anyVisible = false;
      for (let j = 0; j < n; j++) {
        const s = K.seqAt(f, K.rankOf(f, j, n, P.order));
        if (!s.visible) continue;
        const sign = P.alternate && j % 2 ? -1 : 1;
        const th = sign * (s.kout > 0 ? turn * s.vout : -turn * (1 - s.vin));
        const c = Math.cos(th);
        if (Math.abs(c) < 0.004) continue;
        anyVisible = true;
        if (Math.abs(th) > 1e-3) allOpen = false;
        slats.push({ j, th, c, sn: Math.sin(th) });
      }
      if (!anyVisible) return;
      if (allOpen && slats.length === n) {
        for (const g of L.glyphs) f.drawGlyph(g); // fully open: the plain type
        return;
      }

      // Draw the type once into the plate.
      if (!C.plate || C.plate.c.width !== pw || C.plate.c.height !== ph) {
        const c = makeCanvas(pw, ph);
        C.plate = { c, ctx: c.getContext('2d') };
      }
      const { c: plate, ctx: pctx } = C.plate;
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      pctx.globalAlpha = 1;
      pctx.globalCompositeOperation = 'source-over';
      pctx.clearRect(0, 0, pw, ph);
      const alpha = f.alpha;
      f.alpha = 1; // the plate is drawn opaque; echo alpha applies once, when it is copied out
      try {
        f.drawInto(pctx, () => {
          for (const g of L.glyphs) f.drawGlyph(g, { x: f.cx + g.cx - x0, y: f.cy + g.cy - y0 });
        }, { x: x0, y: y0 }); // the plate's pixel (0, 0) is frame (x0, y0): gradients stay put
      } finally { f.alpha = alpha; }

      // Each slat: its strip of the plate, squeezed by cos θ about its centre line.
      const ctx = f.ctx;
      f.identity();
      for (const sl of slats) {
        const a = start + sl.j * t;
        const k = Math.abs(sl.c);
        const widen = 1 + P.persp * 0.08 * Math.abs(sl.sn);
        let dx, dy, dw, dh, sx, sy, sw2, sh2;
        if (horiz) {
          sx = 0; sw2 = pw; sy = a - y0; sh2 = t;
          // The outer slats keep the plate's top and bottom margins (ascenders, strokes).
          if (sl.j === 0) { sy -= my; sh2 += my; }
          if (sl.j === n - 1) sh2 += my;
          const mid = (sl.j === 0 ? a - my : a) + sh2 / 2;
          dh = sh2 * k; dy = mid - dh / 2;
          dw = pw * widen; dx = x0 - (dw - pw) / 2;
        } else {
          sy = 0; sh2 = ph; sx = a - x0; sw2 = t;
          if (sl.j === 0) { sx -= mx; sw2 += mx; }
          if (sl.j === n - 1) sw2 += mx;
          const mid = (sl.j === 0 ? a - mx : a) + sw2 / 2;
          dw = sw2 * k; dx = mid - dw / 2;
          dh = ph * widen; dy = y0 - (dh - ph) / 2;
        }
        if (sh2 <= 0 || sw2 <= 0 || dw < 0.25 || dh < 0.25) continue;
        ctx.globalAlpha = alpha;
        if (sl.c > 0) ctx.drawImage(plate, sx, sy, sw2, sh2, dx, dy, dw, dh);
        else {
          // Past edge-on: the back of the slat shows the band mirrored.
          ctx.save();
          if (horiz) { ctx.translate(0, dy + dh / 2); ctx.scale(1, -1); ctx.drawImage(plate, sx, sy, sw2, sh2, dx, -dh / 2, dw, dh); }
          else { ctx.translate(dx + dw / 2, 0); ctx.scale(-1, 1); ctx.drawImage(plate, sx, sy, sw2, sh2, -dw / 2, dy, dw, dh); }
          ctx.restore();
        }
        const shade = P.shade * 0.7 * Math.abs(sl.sn);
        if (shade > 0.01) {
          // Darken only the type in this strip (source-atop leaves the empty background alone).
          ctx.globalCompositeOperation = 'source-atop';
          ctx.globalAlpha = shade;
          ctx.fillStyle = sl.sn * (P.alternate && sl.j % 2 ? -1 : 1) > 0 ? '#ffffff' : '#000000';
          if (ctx.fillStyle === '#ffffff') ctx.globalAlpha = shade * 0.45; // tipping toward the light: a soft sheen
          ctx.fillRect(dx, dy, dw, dh);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.globalAlpha = alpha;
    },
  });
})(window.TM);
