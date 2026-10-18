/* Preset: Fly In — the motion-path move.
 * Letters launch one after another along your path, peel off toward their place in the word,
 * land with overshoot and settle, hold, then exit: back along the path, scatter or drop.
 *
 * Each letter's trajectory is the path you drew, blended into its own slot over the peel
 * section:  traj_i(σ) = path(σ) + w(σ)·(slot_i − pathEnd),  w = smoothstep(peel·L, L, σ).
 * So letters really ride your curve, then fan out, and each arrives along the path's end
 * tangent. Trajectories are re-parametrised by true arc length, so the flight ease is honest.
 * If the flight ease arrives with speed, a damped spring carries that momentum past the slot
 * and back (overshoot ∝ arrival speed, capped in em), and the letter leans with it.
 */
(function (TM) {
  'use strict';
  const { clamp, lerp, smoothstep, angleDelta } = TM.math;
  const K = TM.PathKit;
  const N = 96; // samples per trajectory
  const cache = new WeakMap();

  /** Per-glyph trajectories for this path + layout (cached on the sampled path object). */
  function trajectories(f, path) {
    const P = f.params, L = f.layout;
    const key = [K.keyOf(L), f.cx.toFixed(2), f.cy.toFixed(2), P.peel, P.leadIn, f.size.toFixed(2)].join('|');
    const hit = cache.get(path);
    if (hit && hit.key === key) return hit.list;
    const len = path.length;
    const lead = path.closed ? 0 : P.leadIn * f.size;
    const end = path.at(len);
    const s0 = Math.min(P.peel, 0.97) * len;
    const list = L.glyphs.map((g) => {
      if (g.isSpace) return null;
      const qx = f.cx + g.cx, qy = f.cy + g.cy;
      const ox = qx - end.x, oy = qy - end.y;
      const xs = new Float32Array(N + 1), ys = new Float32Array(N + 1), cum = new Float32Array(N + 1);
      for (let k = 0; k <= N; k++) {
        const sg = -lead + ((len + lead) * k) / N;
        const p = path.at(Math.min(sg, len));
        const w = smoothstep(s0, len, sg);
        xs[k] = p.x + ox * w;
        ys[k] = p.y + oy * w;
        if (k) cum[k] = cum[k - 1] + Math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]);
      }
      const ang = new Float32Array(N + 1);
      for (let k = 0; k <= N; k++) {
        const a = Math.max(0, k - 1), b = Math.min(N, k + 1);
        ang[k] = Math.atan2(ys[b] - ys[a], xs[b] - xs[a]);
      }
      return { xs, ys, cum, ang, D: cum[N], qx, qy, tx: end.tx, ty: end.ty, aEnd: Math.atan2(end.ty, end.tx) };
    });
    cache.set(path, { key, list });
    return list;
  }

  /** Point and heading at distance d along a trajectory; past the end it continues along the arrival tangent. */
  function along(tr, d) {
    if (d >= tr.D) {
      const e = d - tr.D;
      return { x: tr.qx + tr.tx * e, y: tr.qy + tr.ty * e, a: tr.aEnd };
    }
    if (d <= 0) return { x: tr.xs[0], y: tr.ys[0], a: tr.ang[0] };
    const cum = tr.cum;
    let lo = 0, hi = N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid; else hi = mid;
    }
    const seg = cum[hi] - cum[lo];
    const t = seg > 1e-6 ? (d - cum[lo]) / seg : 0;
    return {
      x: lerp(tr.xs[lo], tr.xs[hi], t),
      y: lerp(tr.ys[lo], tr.ys[hi], t),
      a: tr.ang[lo] + angleDelta(tr.ang[lo], tr.ang[hi]) * t,
    };
  }

  TM.registerPreset({
    id: 'path-land',
    name: 'Fly In',
    category: 'Path',
    description: 'Letters fly your path one after another, peel off into the word and land with overshoot and settle, then exit.',
    usesPath: true,
    path: 'arc',
    fit: true,
    params: [
      ...TM.P.sequence({ inDur: 0.6, outDur: 0.26, stagger: 0.55, order: 'start', easeIn: [0.45, 0.05, 0.55, 0.88], easeOut: 'anticipate' }),
      TM.P.range('peel', 'Peel off at', 0, 0.95, 0.01, 0.3, { group: 'Flight', hint: 'How far along the path letters start curving toward their place' }),
      TM.P.range('leadIn', 'Lead-in (em)', 0, 10, 0.1, 0, { group: 'Flight', hint: 'Extra run-up before the path starts (open paths)' }),
      TM.P.range('follow', 'Follow tangent', 0, 1, 0.01, 1, { group: 'Flight' }),
      TM.P.range('flightScale', 'Flight scale', 0.2, 2, 0.01, 0.72, { group: 'Flight' }),
      TM.P.toggle('streaks', 'Speed lines', true, { group: 'Flight' }),
      TM.P.range('overshoot', 'Overshoot (em)', 0, 1.5, 0.01, 0.4, { group: 'Landing', hint: 'Cap on how far momentum carries a letter past its place' }),
      TM.P.range('bounce', 'Bounciness', 0, 1, 0.01, 0.55, { group: 'Landing' }),
      TM.P.range('lean', 'Lean', 0, 1.5, 0.01, 0.6, { group: 'Landing', hint: 'Letters tilt with the overshoot, then settle upright' }),
      TM.P.select('exit', 'Exit', [['back', 'Back along path'], ['scatter', 'Scatter'], ['drop', 'Drop']], 'back', { group: 'Exit' }),
      TM.P.range('scatter', 'Scatter distance', 0.1, 1.5, 0.01, 0.6, { group: 'Exit', showIf: { exit: 'scatter' } }),
      TM.P.select('guide', 'Show path', [['none', 'Hidden'], ['line', 'Line'], ['dashed', 'Dashed']], 'none', { group: 'Style' }),
    ],

    render(f) {
      const path = f.path;
      if (!path || path.length < 1) return;
      const P = f.params, L = f.layout, size = f.size;
      const list = trajectories(f, path);
      if (P.guide !== 'none' && f.echo === 0) guide(f, path, P.guide);

      const dur = f.dur;
      const easeIn = TM.ease(P.easeIn, 'smooth'), easeOut = TM.ease(P.easeOut, 'anticipate');
      // Seconds each letter spends flying: the f.seq window for its in-phase.
      let inDur = P.inDur, outDur = P.timing === 'in' ? 0 : P.outDur;
      const tot = inDur + outDur;
      if (tot > 1) { inDur /= tot; outDur /= tot; }
      const st = P.stagger;
      const flightSec = Math.max(1e-3, inDur * (1 - st) * dur);
      const cap = P.overshoot * size;
      const zeta = lerp(0.95, 0.22, P.bounce);
      const omega0 = 2 * Math.PI * lerp(1.6, 2.6, P.bounce);
      // Arrival speed as a fraction of D per second of flight (ease slope at the end).
      const endSlope = Math.max(0, (easeIn(1) - easeIn(1 - 1e-3)) / 1e-3);
      const drawn = [];

      for (const g of L.glyphs) {
        const tr = list[g.i];
        if (!tr) continue;
        const s = f.seq(g);
        if (s.kin <= 0 || s.kout >= 1) continue;
        let x, y, rot = 0, sc = 1, alpha = 1;
        const settleZone = Math.min(tr.D * 0.5, size * 3);

        if (s.kout <= 0) {
          // ── flight + landing ──
          const u = easeIn(s.kin);
          let d = u * tr.D;
          if (d > tr.D) d = tr.D + cap * Math.tanh((d - tr.D) / Math.max(1, cap)); // overshooting eases, capped
          const pt = along(tr, d);
          x = pt.x;
          y = pt.y;
          const land = smoothstep(tr.D - settleZone, tr.D, d);
          rot = angleDelta(0, pt.a) * P.follow * (1 - land);
          sc = lerp(P.flightScale, 1, land);
          // Birth pop at the start of the run (visible when the path starts inside the frame).
          const born = TM.ease('overshoot')(clamp(s.kin / 0.14));
          sc *= born;
          alpha = clamp(s.kin / 0.05);
          if (s.kin >= 1) {
            // Momentum carried past the slot by a damped spring, then back: overshoot and settle.
            const tArr = inDur * (s.r * st + 1 - st) * dur;
            const tau = Math.max(0, f.t - tArr);
            const v = (endSlope * tr.D) / flightSec; // px/s at arrival
            let omega = omega0;
            if (v / omega > cap) omega = v / Math.max(1e-3, cap);
            const wd = omega * Math.sqrt(Math.max(1e-4, 1 - zeta * zeta));
            const disp = cap > 0 ? (v / wd) * Math.exp(-zeta * omega * tau) * Math.sin(wd * tau) : 0;
            x += tr.tx * disp;
            y += tr.ty * disp;
            rot += (disp / size) * P.lean * (tr.tx >= 0 ? 1 : -1);
          } else if (s.kin > 0.85 && P.streaks) {
            // nothing extra: streaks are drawn below for letters still in flight
          }
          if (P.streaks && s.kin < 1 && f.echo === 0) {
            const back = Math.max(0, easeIn(Math.max(0, s.kin - 0.045)) * tr.D);
            if (d - back > size * 0.6) drawn.push({ streak: true, tr, d0: back, d1: Math.min(d, tr.D), w: size * 0.09 * sc, color: f.colorOf(g), a: alpha });
          }
        } else {
          // ── exit ──
          const e = easeOut(s.kout);
          if (P.exit === 'scatter') {
            const ang = Math.atan2(g.cy * 1.6, g.cx) + f.srand(g.i, 31) * 0.9;
            const dist = P.scatter * f.unit * (0.65 + 0.35 * f.rand(g.i, 32));
            x = tr.qx + Math.cos(ang) * dist * e;
            y = tr.qy + Math.sin(ang) * dist * e;
            rot = f.srand(g.i, 33) * Math.PI * 1.2 * e;
            sc = 1 - 0.55 * clamp(e);
            alpha = 1 - smoothstep(0.55, 1, s.kout);
          } else if (P.exit === 'drop') {
            const fall = f.H - tr.qy + size * 1.4;
            x = tr.qx + f.srand(g.i, 41) * size * 0.6 * clamp(e);
            y = tr.qy + fall * e;
            rot = f.srand(g.i, 42) * 0.9 * e;
            alpha = 1 - smoothstep(0.8, 1, s.kout);
          } else {
            const d = tr.D * (1 - e);
            const pt = along(tr, d);
            x = pt.x;
            y = pt.y;
            const land = smoothstep(tr.D - settleZone, tr.D, d);
            rot = angleDelta(0, pt.a) * P.follow * (1 - land);
            sc = lerp(P.flightScale, 1, land) * TM.ease('outCubic')(clamp((1 - s.kout) / 0.12));
            alpha = clamp((1 - s.kout) / 0.05);
          }
        }
        drawn.push({ g, o: { x, y, rot, scale: sc, alpha } });
      }

      // Streaks first (behind every letter), then letters in layout order.
      for (const it of drawn) if (it.streak) streak(f, it);
      for (const it of drawn) if (!it.streak) f.drawGlyph(it.g, it.o);
    },
  });

  /** A tapered speed line along the trajectory behind a flying letter. */
  function streak(f, it) {
    const ctx = f.ctx;
    ctx.save();
    K.strokeStyle(f, it.w, 1, it.color);
    const steps = 8;
    let prev = along(it.tr, it.d0);
    for (let k = 1; k <= steps; k++) {
      const pt = along(it.tr, lerp(it.d0, it.d1, k / steps));
      ctx.globalAlpha = f.alpha * it.a * 0.55 * (k / steps);
      ctx.lineWidth = Math.max(0.75, it.w * (k / steps));
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      prev = pt;
    }
    ctx.restore();
  }

  function guide(f, path, style) {
    const ctx = f.ctx;
    ctx.save();
    K.strokeStyle(f, f.size * 0.02, 0.4);
    if (style === 'dashed') ctx.setLineDash([f.size * 0.16, f.size * 0.14]);
    path.trace(ctx);
    ctx.stroke();
    ctx.restore();
  }
})(window.TM);
