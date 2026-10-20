/* Preset: Zoom Through — the camera flies through your words. Each word (or line) waits one
 * zoom step deeper than the last; the camera pauses to read it, then dives through the counter
 * of one of its letters (the hole of an O, D, A…) and the next word grows out of that hole.
 *
 * Craft notes
 *  - Counters are found by rasterising candidate letters once (MotionKit.portal) and taking the
 *    centroid of the largest enclosed hole, so the camera really threads the letter.
 *  - Zoom is exponential (one constant ratio per word), so every step feels the same speed;
 *    each step eases out of and into a reading pause, and an optional twist rolls the camera.
 *  - Words cycle, and the camera position wraps after the last word, so it loops forever.
 */
(function (TM) {
  'use strict';
  const K = TM.MotionKit;
  const { clamp, smoothstep, fract } = TM.math;

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
      const units = K.units(L, by).map((u) => {
        const fit = Math.min((f.W * 0.8) / Math.max(1, u.w), (f.H * 0.5) / Math.max(1, L.capH), 4);
        // Portal: the biggest counter near the middle, else a gap between letters.
        const portal = K.portal(f, L, u, P.counters);
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
