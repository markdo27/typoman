/* Preset: Zoom Through — the camera flies through your words. Each word (or line) waits one
 * zoom step deeper than the last; the camera pauses to read it, then dives through the counter
 * of one of its letters (the hole of an O, D, A…) and the next word grows out of that hole.
 *
 * Craft notes
 *  - Counters are found by rasterising candidate letters once (in setup) and taking the
 *    centroid of the largest enclosed hole, so the camera really threads the letter.
 *  - Zoom is exponential (one constant ratio per word), so every step feels the same speed;
 *    each step eases out of and into a reading pause, and an optional twist rolls the camera.
 *  - Words cycle, and the camera position wraps after the last word, so it loops forever.
 */
(function (TM) {
  'use strict';
  const K = TM.MotionKit;
  const { clamp, smoothstep, fract } = TM.math;
  const CANDIDATE = /[ABDOPQRabdegopq04689@&%#]/;

  /** Largest enclosed hole of ch, as an offset from the glyph's centre (px at `size`), or null. */
  function counterOf(family, weight, ch, size, adv, capH) {
    const S = 96, k = S / size;
    const w = Math.ceil(adv * k + 16), h = Math.ceil(capH * k * 1.6 + 16);
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(w, h);
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.font = TM.fonts.fontString(family, weight, S);
    const base = Math.round(8 + capH * k * 1.2);
    ctx.fillStyle = '#000';
    ctx.fillText(ch, 8, base);
    const data = ctx.getImageData(0, 0, w, h).data;
    const ink = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) ink[i] = data[i * 4 + 3] > 110 ? 1 : 0;
    // Flood the outside from the border; whatever empty space is left is a counter.
    const mark = new Int32Array(w * h).fill(0);
    const stack = [];
    const flood = (seed, id) => {
      let n = 0, sx = 0, sy = 0;
      stack.push(seed);
      mark[seed] = id;
      while (stack.length) {
        const p = stack.pop();
        n++; sx += p % w; sy += (p / w) | 0;
        const x = p % w, y = (p / w) | 0;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
          if (q >= 0 && !ink[q] && !mark[q]) { mark[q] = id; stack.push(q); }
        }
      }
      return { n, x: sx / Math.max(1, n), y: sy / Math.max(1, n) };
    };
    for (let x = 0; x < w; x++) { if (!ink[x] && !mark[x]) flood(x, 1); const b = (h - 1) * w + x; if (!ink[b] && !mark[b]) flood(b, 1); }
    for (let y = 0; y < h; y++) { const l = y * w, r = l + w - 1; if (!ink[l] && !mark[l]) flood(l, 1); if (!ink[r] && !mark[r]) flood(r, 1); }
    let best = null, id = 2;
    for (let p = 0; p < w * h; p++) {
      if (ink[p] || mark[p]) continue;
      const hole = flood(p, id);
      if (hole.n > 12 && (!best || hole.n > best.n)) { best = hole; best.id = id; }
      id++;
    }
    if (!best) return null;
    // Hole extent, for how far the camera must zoom before the hole covers the frame.
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (let p = 0; p < w * h; p++) {
      if (mark[p] !== best.id) continue;
      const x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    // Back to glyph-centre coordinates at the layout size.
    return {
      dx: (best.x - 8 - (adv * k) / 2) / k, dy: (best.y - (base - (capH * k) / 2)) / k,
      area: best.n / (k * k), cw: (x1 - x0 + 1) / k, ch: (y1 - y0 + 1) / k,
    };
  }

  TM.registerPreset({
    id: 'zoom-through',
    name: 'Zoom Through',
    category: 'Dimensional',
    description: 'The camera flies through the hole in a letter into the next word, again and again: an endless zoom through your text.',
    looks: [
      { name: 'Hyperspace', bg: { type: 'radial', color: '#14143a', color2: '#000000' }, post: { grain: 0.15 },
        layer: { font: { family: 'Unbounded', weight: 900 }, fill: { type: 'solid', color: '#ffffff' }, params: { twist: 0.45 } } },
      { name: 'Pop Art', bg: { type: 'solid', color: '#f6bf26' },
        layer: { font: { family: 'Bowlby One', weight: 400 }, fill: { type: 'solid', color: '#e63326' }, params: { twist: 0, hold: 0.45 } } },
      { name: 'Mint Dive', bg: { type: 'solid', color: '#062925' },
        layer: { font: { family: 'Syne', weight: 800 }, fill: { type: 'solid', color: '#5cffc8' }, params: { twist: -0.3 } } },
    ],
    params: [
      TM.P.select('split', 'Fly through', [['auto', 'Auto'], ['lines', 'Lines'], ['words', 'Words']], 'auto', { group: 'Flight', hint: 'Auto: lines when there are several, otherwise words' }),
      TM.P.range('hold', 'Reading pause', 0, 0.8, 0.01, 0.38, { group: 'Flight' }),
      TM.P.ease('ease', 'Flight curve', 'smooth', { group: 'Flight' }),
      TM.P.range('dive', 'Dive depth', 0.6, 2, 0.01, 1, { group: 'Flight', hint: 'Zoom per word, relative to just clearing the letter' }),
      TM.P.range('twist', 'Twist', -1, 1, 0.01, 0.25, { group: 'Flight' }),
      TM.P.toggle('counters', 'Aim for counters', true, { group: 'Flight', hint: 'Dive through the hole of an O, D, A… when the word has one' }),
      TM.P.range('fill', 'Fill the frame', 0, 1, 0.01, 0.55, { group: 'Framing' }),
    ],

    setup(f) {
      const L = f.layout, P = f.params;
      const by = P.split === 'auto' ? (L.lines.filter((l) => l.glyphs.length).length > 1 ? 'lines' : 'words') : P.split;
      const fam = f.layer.font.family, wt = f.layer.font.weight;
      const units = K.units(L, by).map((u) => {
        const fit = Math.min((f.W * 0.8) / Math.max(1, u.w), (f.H * 0.5) / Math.max(1, L.capH), 4);
        // Portal: the biggest counter near the middle, else the gap nearest the middle.
        let portal = null, score = -Infinity;
        if (P.counters) {
          for (const gi of u.glyphs) {
            const g = L.glyphs[gi];
            if (!CANDIDATE.test(g.ch)) continue;
            const hole = counterOf(fam, wt, g.ch, L.sizePx, g.w, L.capH);
            if (!hole) continue;
            const sc = Math.sqrt(hole.area) / L.capH - Math.abs(g.cx - u.cx) / Math.max(1, u.w);
            if (sc > score) { score = sc; portal = { x: g.cx + hole.dx, y: g.cy + hole.dy, cw: hole.cw, ch: hole.ch }; }
          }
        }
        if (!portal) {
          // No counter: thread the gap nearest the middle (open above and below).
          let best = null, bd = Infinity;
          for (let j = 0; j + 1 < u.glyphs.length; j++) {
            const a = L.glyphs[u.glyphs[j]], b = L.glyphs[u.glyphs[j + 1]];
            const gx = (a.x + a.w + b.x) / 2, d = Math.abs(gx - u.cx);
            if (d < bd) { bd = d; best = { x: gx, y: (a.cy + b.cy) / 2, cw: Math.max(L.sizePx * 0.04, b.x - a.x - a.w + L.sizePx * 0.04), ch: Infinity }; }
          }
          portal = best || { x: u.cx, y: u.cy, cw: L.sizePx * 0.05, ch: Infinity };
        }
        const scale = 1 + (fit - 1) * P.fill;
        // Zoom for the dive: just enough for the hole (an ellipse) to contain the whole frame.
        const need = Math.hypot(f.W / (portal.cw * scale), portal.ch === Infinity ? 0 : f.H / (portal.ch * scale));
        return Object.assign(u, { scale, portal, ratio: clamp(need * 1.4 * P.dive, 6, 200) }); // counters aren't ellipses: margin
      });
      return { units };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      if (!C || !C.units.length) return;
      const units = C.units, N = units.length;
      const at = (m) => units[((m % N) + N) % N];
      // Camera position in "words": a reading pause, then an eased dive to the next word.
      const x = f.p * N, k = Math.floor(x), u = fract(x);
      const e = u < P.hold ? 0 : TM.ease(P.ease, 'smooth')((u - P.hold) / Math.max(1e-4, 1 - P.hold));
      const cam = k + e;
      // Log-scale of word m: each step between stops zooms by the ratio of the word being entered.
      const logScale = (m) => {
        let l = 0, t = m;
        if (cam >= m) while (t < cam) { const st = Math.min(1, cam - t); l += st * Math.log(at(Math.floor(t)).ratio); t += st; }
        else while (t > cam) { const st = Math.min(1, t - cam); l -= st * Math.log(at(Math.ceil(t) - 1).ratio); t -= st; }
        return l;
      };
      const items = [];
      for (let m = Math.floor(cam) - 1; m <= Math.floor(cam) + 2; m++) {
        const unit = at(m), R = unit.ratio, d = cam - m; // d: 0 reading, > 0 flown into, < 0 still ahead
        const s = Math.exp(logScale(m));
        if (s >= R) continue;
        const S = unit.scale * s;
        if (unit.w * S < 2) continue;
        // Ahead: stays hidden through the reading pause and appears as the dive begins, inside
        // the hole. Flown into: well before s = R its hole covers the frame; the fade is a backstop
        // so nothing of it is left by the next reading pause.
        const prev = at(m - 1).ratio;
        const alpha = smoothstep(1 / prev, Math.pow(prev, -0.6), s) * (1 - smoothstep(R * 0.6, R, s));
        if (alpha <= 0.002) continue;
        // Past reading size the camera aims for the portal, which slides to the frame centre.
        const aim = smoothstep(1, Math.pow(R, 0.4), s);
        const px = unit.cx + (unit.portal.x - unit.cx) * aim, py = unit.cy + (unit.portal.y - unit.cy) * aim;
        items.push({ unit, S, alpha, px, py, rot: P.twist * d * 0.35, d });
      }
      items.sort((a, b) => a.d - b.d); // far (small) first: near letters occlude what is behind them

      for (const it of items) {
        const cs = Math.cos(it.rot), sn = Math.sin(it.rot);
        for (const gi of it.unit.glyphs) {
          const g = L.glyphs[gi];
          const ox = (g.cx - it.px) * it.S, oy = (g.cy - it.py) * it.S;
          const X = f.cx + ox * cs - oy * sn, Y = f.cy + ox * sn + oy * cs;
          const rad = (g.w + L.capH) * it.S * 0.75; // skip letters that are wholly off-frame
          if (X + rad < 0 || X - rad > f.W || Y + rad < 0 || Y - rad > f.H) continue;
          f.drawGlyph(g, { x: X, y: Y, rot: it.rot, scale: it.S, alpha: it.alpha });
        }
      }
    },
  });
})(window.TM);
