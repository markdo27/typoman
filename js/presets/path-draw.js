/* Preset: Draw On — the path strokes itself on behind a pen tip, and letters pop up off the
 * line as the pen passes them (scale with overshoot, a little rotation, a rise off the stroke).
 * Hold, then an eraser runs from the start: the stroke disappears behind it and letters pop
 * out with a small anticipation swell. The pen moves like a hand: it eases in and out and,
 * with "Hand speed", slows into tight curves and corners. Text is fitted to the path length.
 */
(function (TM) {
  'use strict';
  const { clamp, lerp } = TM.math;
  const K = TM.PathKit;
  const M = 240; // effort-table samples along the path
  const effortCache = new WeakMap();

  /** Cumulative "effort" along the path: 1 per px, more where the path turns (hand speed). */
  function effortTable(path, size, hand) {
    const key = size.toFixed(1) + '|' + hand;
    const hit = effortCache.get(path);
    if (hit && hit.key === key) return hit;
    const Lp = path.length;
    const s = new Float32Array(M + 1), e = new Float32Array(M + 1);
    let prev = path.at(0), prevA = prev.angle;
    for (let i = 1; i <= M; i++) {
      const si = (Lp * i) / M;
      const p = path.at(Math.min(si, Lp - 1e-3));
      const ds = si - s[i - 1];
      const turn = Math.abs(TM.math.angleDelta(prevA, p.angle));
      const kappa = ds > 1e-6 ? turn / ds : 0; // radians per px
      s[i] = si;
      e[i] = e[i - 1] + ds * (1 + hand * 3 * Math.min(1, kappa * size * 0.8));
      prev = p;
      prevA = p.angle;
    }
    const out = { key, s, e, total: e[M] || 1 };
    effortCache.set(path, out);
    return out;
  }
  /**
   * The text lane `up` px beside the path. Round 5: the lane is taken off a rounded
   * carrier — path.rounded(R, R).lane(-up) — instead of the plain offset lane
   * path.offset(-up), then bend-spaced as before. At an acute vertex the plain offset
   * lane turns ~90° between two adjacent glyphs, so their tall boxes touch even when
   * spaced correctly along the lane; the carrier's fillet (radius |up| + 0.7·capH, so
   * the lane itself keeps a radius of ~0.7·capH on its inside, deviation capped at
   * ~2.9·capH as in Path Flow's 2 em limit) spreads that turn over an arc, so
   * neighbours rotate gradually instead of snapping. The stroke is still drawn on the
   * original path, so at a sharp point the lane cuts the corner by up to that
   * deviation — the price of the smoothing, and why the lane is not rounded harder.
   * Tabulated by lane arc length together with the matching base-path arc length
   * (nearest base sample, walked forward), so the pen still reaches each letter on time.
   */
  const laneCache = new WeakMap();
  function laneTable(path, up, capH) {
    let byUp = laneCache.get(path);
    if (!byUp) laneCache.set(path, (byUp = new Map()));
    const key = up.toFixed(2) + '|' + capH.toFixed(1);
    let t = byUp.get(key);
    if (t) return t;
    const R = Math.abs(up) + capH * 0.7;
    const carrier = R > 0 ? path.rounded(R, R, { limit: capH * 2.85 }) : path;
    const lane = carrier.lane(-up).spaced(capH / 2);
    const Ll = lane.length;
    const l = new Float32Array(M + 1), s = new Float32Array(M + 1), x = new Float32Array(M + 1), y = new Float32Array(M + 1);
    const bx = path.xs, by = path.ys, bn = path.n, bcum = path.cum;
    let j = 0, topY = Infinity, bottomY = -Infinity;
    for (let i = 0; i <= M; i++) {
      l[i] = (Ll * i) / M;
      const q = lane.at(path.closed ? Math.min(l[i], Ll - 1e-3) : l[i]);
      x[i] = q.x;
      y[i] = q.y;
      let best = Infinity, bi = j;
      for (let k = Math.max(0, j - 8), e = Math.min(bn, j + 96); k < e; k++) {
        const dx = bx[k] - q.x, dy = by[k] - q.y, d = dx * dx + dy * dy;
        if (d < best) { best = d; bi = k; }
      }
      j = bi;
      s[i] = Math.max(i ? s[i - 1] : 0, bcum[bi]);
      topY = Math.min(topY, q.y);
      bottomY = Math.max(bottomY, q.y);
    }
    // The top of the shape: the middle of its topmost stretch (a mean of arc length weighted by
    // height, circular on closed lanes so a stretch across the lane's start isn't split), so a flat
    // top (a frame, a rounded square) centres text on its edge, not on the corner it begins at.
    let yMax = -Infinity;
    for (let i = 0; i <= M; i++) yMax = Math.max(yMax, y[i]);
    const tau = Math.max(0.5, (yMax - topY) * 0.02);
    let sw = 0, sl = 0, sc = 0, sn = 0;
    for (let i = 0; i < M; i++) {
      const w = Math.exp(-(y[i] - topY) / tau);
      sw += w;
      sl += w * l[i];
      sc += w * Math.cos((TM.math.TAU * l[i]) / Ll);
      sn += w * Math.sin((TM.math.TAU * l[i]) / Ll);
    }
    const top = path.closed ? TM.math.mod((Math.atan2(sn, sc) / TM.math.TAU) * Ll, Ll) : sl / sw;
    t = { s, l, x, y, length: Ll, top, topY, bottomY };
    if (byUp.size > 16) byUp.clear();
    byUp.set(key, t);
    return t;
  }
  const lookup = (xs, ys, x) => {
    let lo = 0, hi = xs.length - 1;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[hi]) return ys[hi];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const t = (x - xs[lo]) / Math.max(1e-9, xs[hi] - xs[lo]);
    return lerp(ys[lo], ys[hi], t);
  };
  /** Inverse of a (mostly monotonic) ease by bisection: the time at which ease(t) reaches v. */
  function inverse(ease, v) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (ease(mid) < v) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  /** SAT overlap depth (px) of two oriented glyph boxes, or <=0 when they separate.
   *  Boxes are centred at (x, y), rotated by rot, half-width hw along rot, half-height hh.
   *  A positive depth is exactly how far the later box must shrink (or move) to stop
   *  touching its predecessor. */
  function boxDepth(a, b) {
    const corners = (c) => {
      const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
      return [[-c.hw, -c.hh], [c.hw, -c.hh], [c.hw, c.hh], [-c.hw, c.hh]].map(([u, v]) => [c.x + u * cs - v * sn, c.y + u * sn + v * cs]);
    };
    const ca = corners(a), cb = corners(b);
    let depth = Infinity;
    for (const t of [a.rot, b.rot]) {
      for (const [ax, ay] of [[Math.cos(t), Math.sin(t)], [-Math.sin(t), Math.cos(t)]]) {
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (const [x, y] of ca) { const v = x * ax + y * ay; if (v < a0) a0 = v; if (v > a1) a1 = v; }
        for (const [x, y] of cb) { const v = x * ax + y * ay; if (v < b0) b0 = v; if (v > b1) b1 = v; }
        depth = Math.min(depth, Math.min(a1, b1) - Math.max(a0, b0));
        if (depth <= 0) return depth;
      }
    }
    return depth;
  }

  TM.registerPreset({
    id: 'path-draw',
    name: 'Draw On',
    category: 'Path',
    description: 'A pen strokes your path on and letters pop up off the line as it passes; then the line erases and they pop out.',
    usesPath: true,
    path: 'scurve',
    params: [
      TM.P.select('timing', 'Timing', [['inout', 'In → Hold → Out'], ['in', 'In → Hold']], 'inout', { group: 'Timing' }),
      TM.P.range('drawDur', 'Draw length', 0.1, 0.8, 0.01, 0.42, { group: 'Timing' }),
      TM.P.range('outDur', 'Erase length', 0.1, 0.6, 0.01, 0.3, { group: 'Timing' }),
      TM.P.ease('penEase', 'Pen ease', 'smooth', { group: 'Timing' }),
      TM.P.toggle('hand', 'Hand speed', true, { group: 'Timing', hint: 'The pen slows into curves and corners like a hand would' }),
      TM.P.range('popLen', 'Pop length', 0.03, 0.3, 0.005, 0.11, { group: 'Letters' }),
      TM.P.ease('popEase', 'Pop ease', 'overshoot', { group: 'Letters' }),
      TM.P.ease('popOut', 'Pop-out ease', 'inBack', { group: 'Letters' }),
      TM.P.range('rise', 'Rise off line (em)', 0, 1.5, 0.01, 0.45, { group: 'Letters' }),
      TM.P.range('tilt', 'Pop tilt (°)', 0, 60, 1, 16, { group: 'Letters' }),
      TM.P.select('side', 'Text sits', [['above', 'Above'], ['center', 'On'], ['below', 'Below']], 'above', { group: 'Letters' }),
      TM.P.range('gap', 'Gap to line (em)', 0, 1, 0.01, 0.16, { group: 'Letters', showIf: { side: ['above', 'below'] } }),
      TM.P.select('align', 'Align', [['start', 'Start'], ['center', 'Center'], ['end', 'End'], ['spread', 'Spread']], 'center', { group: 'Letters' }),
      TM.P.select('stroke', 'Stroke', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dots', 'Dots'], ['none', 'None']], 'solid', { group: 'Stroke' }),
      TM.P.range('width', 'Stroke width (em)', 0.005, 0.2, 0.001, 0.035, { group: 'Stroke' }),
      TM.P.range('opacity', 'Stroke opacity', 0.05, 1, 0.01, 0.9, { group: 'Stroke' }),
      TM.P.toggle('tip', 'Pen tip', true, { group: 'Stroke' }),
    ],

    render(f) {
      const path = f.path;
      if (!path || path.length < 1) return;
      const P = f.params, L = f.layout, size = f.size, p = f.p;
      const pen = TM.ease(P.penEase, 'smooth');
      const popIn = TM.ease(P.popEase, 'overshoot'), popOut = TM.ease(P.popOut, 'inBack');
      const tab = effortTable(path, size, P.hand ? 1 : 0);
      const pop = P.popLen;

      // Phases. Pops finish inside their phase, so p = 0 and p → 1 are both empty frames.
      const hasOut = P.timing !== 'in';
      const drawEnd = clamp(P.drawDur, 0.05, hasOut ? 0.95 - P.outDur : 0.98);
      const eraseStart = 1 - P.outDur, eraseEnd = Math.max(eraseStart + 0.02, 1 - pop - 0.01);
      const penAt = (u) => lookup(tab.e, tab.s, pen(clamp(u)) * tab.total); // arc length for pen time u
      const timeAt = (s) => inverse(pen, lookup(tab.s, tab.e, s) / tab.total); // pen time when it reaches s

      const drawU = clamp(p / drawEnd);
      const penS = penAt(drawU);
      const eraseU = hasOut ? clamp((p - eraseStart) / (eraseEnd - eraseStart)) : 0;
      const eraseS = hasOut && p >= eraseStart ? penAt(eraseU) : 0;

      // Stroke under the letters (main pass only; echoes repeat letters, not the line).
      if (f.echo === 0) {
        const s0 = eraseS, s1 = penS;
        if (P.stroke !== 'none' && s1 - s0 > 0.5) drawStroke(f, path, s0, s1, P);
        if (P.tip) {
          const wPx = P.width * size;
          if (drawU > 0 && drawU < 1) tip(f, path.at(penS), wPx, Math.min(1, drawU / 0.04, (1 - drawU) / 0.04), 1);
          if (eraseU > 0 && eraseU < 1) tip(f, path.at(eraseS), wPx, Math.min(1, eraseU / 0.05, (1 - eraseU) / 0.05), 0.55);
        }
      }

      // Each line is a lane beside the stroke, laid out by the lane's own arc length, so letters
      // on the inside of a bend don't crowd and those outside don't drift apart.
      const lanes = L.lines.length;
      const tiltR = (P.tilt * Math.PI) / 180;
      const upOf = (li, k) => {
        const half = (L.capH * k) / 2;
        if (P.side === 'center') return ((lanes - 1) / 2 - li) * L.lineGap * k;
        if (P.side === 'below') return -(P.gap * size + half + li * L.lineGap * k);
        return P.gap * size + half + (lanes - 1 - li) * L.lineGap * k;
      };
      // Off-frame clamp (Round 5): on a closed path, a lane beside the stroke can leave
      // the frame — the Frame shape is inset only 0.085 of the short side, less than
      // gap + cap height, so "above" text on its top edge ran off the top (lane centre
      // ~13 px at 65 px type, glyph top ~−10 px). Pull the lane back toward the stroke
      // just enough that the glyph top (0.6·capH: half the cap height plus pop-overshoot
      // headroom) stays inside the frame, and symmetrically for "below" at the bottom.
      // Only the vertical extremes are clamped, and only when they actually leave the
      // frame, so every other shape and the pop geometry (rise, tilt, pen timing, all
      // read from the same lane table) are unchanged. Left/right clipping on a spread
      // marquee is not clamped here — see path-notes.md.
      const upClamped = (li, kk) => {
        const up0 = upOf(li, kk);
        if (!path.closed || P.side === 'center') return up0;
        const lane0 = laneTable(path, up0, L.capH * kk);
        const head = L.capH * kk * 0.6;
        if (P.side === 'above' && lane0.topY < head) return up0 - (head - lane0.topY);
        if (P.side === 'below' && lane0.bottomY + head > f.H) return up0 + (lane0.bottomY + head - f.H);
        return up0;
      };
      // Fit: the longest line must fit its lane (two passes: lane length depends on the size).
      let k = 1;
      for (let pass = 0; pass < 2; pass++) {
        let fit = 1;
        L.lines.forEach((line, li) => {
          if (line.width > 0) fit = Math.min(fit, (laneTable(path, upClamped(li, k), L.capH * k).length * (path.closed ? 0.98 : 0.92)) / line.width);
        });
        k = Math.min(1, fit);
      }
      const popOutLen = pop * 0.7;
      L.lines.forEach((line, li) => {
        if (!line.glyphs.length) return;
        const up = upClamped(li, k);
        const lane = laneTable(path, up, L.capH * k);
        const Ll = lane.length;
        const w = line.width * k;
        const x0 = line.x; // left edge: RTL lines keep their visual order, reading right to left along the path
        // On closed paths "center" means centred on the top of the shape, where text reads upright.
        let start = path.closed ? lane.top - w / 2 : (Ll - w) / 2, stretch = 1;
        if (P.align === 'start') start = path.closed ? 0 : Ll * 0.04;
        else if (P.align === 'end') start = path.closed ? Ll - w : Ll * 0.96 - w;
        else if (P.align === 'spread' && line.glyphs.length > 1) {
          start = path.closed ? 0 : Ll * 0.04;
          stretch = (Ll * (path.closed ? 1 : 0.92)) / w;
        }
        const wrap = (lam) => (path.closed ? TM.math.mod(lam, Ll) : lam);
        const sOf = (lam) => lookup(lane.l, lane.s, wrap(lam)); // lane arc length → path arc length
        const lanePt = (lam) => ({ x: lookup(lane.l, lane.x, wrap(lam)), y: lookup(lane.l, lane.y, wrap(lam)) });
        let prevBox = null;
        for (const gi of line.glyphs) {
          const g = L.glyphs[gi];
          if (g.isSpace) continue;
          const gw = g.w * k;
          const lam = start + ((g.x - x0) * stretch + g.w / 2) * k;
          // The pen (and later the eraser) "reaches" a letter at its leading edge.
          const lead = sOf(path.closed ? lam - gw / 2 : Math.max(0, lam - gw / 2));
          const tIn = timeAt(lead) * drawEnd;
          const kin = clamp((p - tIn) / pop);
          if (kin <= 0) continue;
          let kout = 0;
          if (hasOut) {
            // Pop out a glyph-width early, so the swell-then-shrink finishes as the line goes.
            const tOut = eraseStart + timeAt(sOf(path.closed ? lam - gw * 1.5 : Math.max(0, lam - gw * 1.5))) * (eraseEnd - eraseStart);
            kout = clamp((p - tOut) / popOutLen);
            if (kout >= 1) continue;
          }
          const c = lanePt(lam), a = lanePt(lam - gw / 2), b = lanePt(lam + gw / 2);
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          const sideSign = f.srand(g.i, 5) < 0 ? -1 : 1;
          const drop = (1 - TM.ease('glide')(kin)) * P.rise * size * (up < 0 ? -1 : 1);
          let sc = popIn(kin) * k;
          let rot = ang + (1 - TM.ease('springSoft')(kin)) * tiltR * sideSign;
          let alpha = clamp(kin / 0.2);
          if (kout > 0) {
            const vo = popOut(kout);
            sc *= 1 - vo;
            rot += vo * tiltR * -sideSign;
            alpha *= 1 - clamp((kout - 0.75) / 0.25);
          }
          // Vertex-local shrink (Round 6): if this glyph's box touches its predecessor's,
          // shrink only this glyph — iterating to a 20% cap — by just enough to clear.
          // Straight segments (depth <= 0) are untouched, the pop envelope elsewhere is
          // untouched, and no glyph moves along the lane, so a self-crossing lane (Loop)
          // can never be pushed onto a neighbouring branch the way spacing would.
          // The box uses the lane angle, not the pop tilt, and the lane point, not the
          // rise offset (both are zero at full pop, when the harness measures).
          let shrink = 1;
          if (prevBox) {
            for (let iter = 0; iter < 3 && shrink > 0.8; iter++) {
              const boxHw = (g.w * sc * shrink) / 2, boxHh = size * 0.35 * sc * shrink;
              const d = boxDepth(prevBox, { x: c.x, y: c.y, rot: ang, hw: boxHw, hh: boxHh });
              if (d <= 0) break;
              const step = Math.min(0.2, (d + 0.5) / (boxHw + boxHh));
              shrink = Math.max(0.8, shrink * (1 - step));
            }
            sc *= shrink;
          }
          prevBox = { x: c.x, y: c.y, rot: ang, hw: (g.w * sc) / 2, hh: size * 0.35 * sc };
          // Letters rise off the line: start `rise` closer to the stroke, glide out to the lane.
          f.drawGlyph(g, { x: c.x - Math.sin(ang) * drop, y: c.y + Math.cos(ang) * drop, rot, scale: sc, alpha });
        }
      });
    },

    looks: [
      { name: 'Signature', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Caveat', weight: 700 }, fill: { type: 'solid', color: '#141414' }, type: { case: 'none' }, params: { width: 0.02, tilt: 8 } } },
      { name: 'Blueprint', bg: { type: 'solid', color: '#03132e' }, layer: { font: { family: 'JetBrains Mono', weight: 600 }, fill: { type: 'solid', color: '#4cc9f0' }, params: { stroke: 'dashed', side: 'center', width: 0.025 }, path: 'circle' } },
      { name: 'Marker', bg: { type: 'solid', color: '#ffd6e0' }, layer: { font: { family: 'Permanent Marker', weight: 400 }, fill: { type: 'solid', color: '#2b0a3d' }, params: { stroke: 'dots', width: 0.05, popEase: 'springSnappy' }, path: 'arc' } },
    ],
  });

  function drawStroke(f, path, s0, s1, P) {
    const ctx = f.ctx, wPx = P.width * f.size;
    ctx.save();
    K.strokeStyle(f, wPx, P.opacity);
    if (P.stroke === 'dashed') ctx.setLineDash([wPx * 4, wPx * 3]);
    else if (P.stroke === 'dots') ctx.setLineDash([0.001, wPx * 2.4]);
    ctx.lineDashOffset = s0; // keep the dash pattern pinned to the path while it erases
    path.trace(ctx, s0, s1);
    ctx.stroke();
    ctx.restore();
  }

  function tip(f, pt, wPx, grow, alpha) {
    const ctx = f.ctx;
    const r = Math.max(1, wPx * 1.35) * clamp(grow);
    if (r < 0.3) return;
    ctx.save();
    K.strokeStyle(f, wPx * 0.5, alpha);
    ctx.globalAlpha = f.alpha * alpha * 0.22;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = f.alpha * alpha;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
})(window.TM);
