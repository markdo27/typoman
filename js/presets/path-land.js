/* Preset: Fly In — the motion-path move.
 * The word flies your path as a train, peels off into place letter by letter and lands with
 * overshoot and settle, holds, then exits: back along the path, scatter or drop.
 *
 * Letters keep a real distance between them in flight (their reading-order advance × the gap
 * setting), so they never clump, and by default the letter at the front of travel leads ("Follow
 * path"), so the word reads the right way round while it flies. Each letter's trajectory is the
 * path blended into its own slot over the peel section,
 *   traj_i(σ) = path(σ) + w(σ)·(slot_i − pathEnd),  w = smoothstep(peel·L, L, σ),
 * so letters really ride your curve, then fan out and arrive along the path's end tangent.
 * A damped spring carries each letter's actual arrival speed past its slot and back.
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
    if (hit && hit.key === key) return hit;
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
    const out = { key, list, lead, len, heading: end.tx };
    cache.set(path, out);
    return out;
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
    return { x: lerp(tr.xs[lo], tr.xs[hi], t), y: lerp(tr.ys[lo], tr.ys[hi], t), a: tr.ang[lo] + angleDelta(tr.ang[lo], tr.ang[hi]) * t };
  }

  /** Distance along a trajectory at path arc length σ (trajectories are sampled evenly in σ). */
  function distAt(tr, T, sigma) {
    const k = clamp((sigma + T.lead) / Math.max(1e-6, T.len + T.lead)) * N;
    const i = Math.min(N - 1, Math.floor(k));
    return lerp(tr.cum[i], tr.cum[i + 1], k - i);
  }

  /** The time at which ease(t) first reaches v (bisection; eases are monotonic enough here). */
  function inverse(ease, v) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (ease(mid) < v) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  const ORDER = TM.P.select('order', 'Order', [['path', 'Follow path']].concat(TM.ORDERS), 'path', { group: 'Timing', hint: 'Follow path: the letter at the front of travel leads, so the word reads correctly in flight' });
  const GAP = TM.P.range('stagger', 'Gap in flight', 0, 0.95, 0.01, 0.3, { group: 'Timing', hint: 'Space between letters as they fly, from their natural spacing (0) to 3.4× it' });

  TM.registerPreset({
    id: 'path-land',
    name: 'Fly In',
    category: 'Path',
    description: 'The word flies your path, peels off into place letter by letter and lands with overshoot and settle, then exits.',
    usesPath: true,
    path: 'arc',
    fit: true,
    params: [
      ...TM.P.sequence({ inDur: 0.55, outDur: 0.24, stagger: 0.3, easeIn: [0.45, 0.05, 0.55, 0.88], easeOut: 'anticipate' }).map((p) => (p.key === 'order' ? ORDER : p.key === 'stagger' ? GAP : p)),
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

    setup(f) {
      // Reading-order position of every glyph centre (layout px), lines joined with a space.
      const L = f.layout;
      const pos = new Float64Array(L.glyphs.length);
      let acc = 0;
      L.lines.forEach((line, li) => {
        if (li) acc += L.sizePx * 0.3;
        for (const gi of line.glyphs) {
          const g = L.glyphs[gi];
          pos[gi] = acc + g.w / 2;
          acc += g.w + L.tracking;
        }
      });
      return { pos };
    },

    render(f) {
      const path = f.path;
      if (!path || path.length < 1) return;
      const P = f.params, L = f.layout, size = f.size;
      const T = trajectories(f, path);
      if (P.guide !== 'none' && f.echo === 0) guide(f, path, P.guide);
      const dur = f.dur;
      const easeIn = TM.ease(P.easeIn, 'smooth'), easeOut = TM.ease(P.easeOut, 'anticipate');
      let inDur = P.inDur, outDur = P.timing === 'in' ? 0 : P.outDur;
      const tot = inDur + outDur;
      if (tot > 1) { inDur /= tot; outDur /= tot; }

      // The train: each letter rides delta px behind the leader along the path.
      const vis = L.glyphs.filter((g) => !g.isSpace);
      if (!vis.length) return;
      const pos = f.cache.pos;
      const gapK = 1 + P.stagger * 2.5;
      const first = pos[vis[0].i], last = pos[vis[vis.length - 1].i];
      const leadLast = P.order === 'path' ? T.heading >= 0 : P.order === 'end';
      const delta = new Float64Array(L.glyphs.length);
      let dMax = 0;
      for (const g of vis) {
        let d;
        if (P.order === 'path' || P.order === 'start' || P.order === 'end') d = (leadLast ? last - pos[g.i] : pos[g.i] - first) * gapK;
        else d = f.rank(g, P.order) * (last - first) * gapK;
        delta[g.i] = d;
        if (d > dMax) dMax = d;
      }
      const run = T.len + T.lead + dMax; // distance the leader covers during the in-phase
      const inSec = Math.max(1e-3, inDur * dur);
      const kIn = inDur > 0 ? clamp(f.p / inDur) : 1;
      const head = -T.lead + run * easeIn(kIn);
      const headPrev = -T.lead + run * easeIn(Math.max(0, kIn - 0.045));
      const cap = P.overshoot * size;
      const zeta = lerp(0.95, 0.22, P.bounce);
      const omega0 = 2 * Math.PI * lerp(1.6, 2.6, P.bounce);
      const drawn = [];

      for (const g of vis) {
        const tr = T.list[g.i];
        if (!tr) continue;
        const rOut = dMax > 0 ? 1 - delta[g.i] / dMax : 0; // last to land leaves first
        const kout = outDur > 0 ? f.stagger((f.p - (1 - outDur)) / outDur, rOut, 0.45) : 0;
        if (kout >= 1) continue;
        const sigma = head - delta[g.i];
        if (sigma <= -T.lead) continue; // still queued before the start of the path
        let x, y, rot = 0, sc = 1, alpha = 1;
        const settleZone = Math.min(tr.D * 0.5, size * 3);

        if (kout <= 0) {
          if (sigma < T.len) {
            // ── in flight ──
            const d = distAt(tr, T, sigma);
            const pt = along(tr, d);
            x = pt.x;
            y = pt.y;
            const land = smoothstep(tr.D - settleZone, tr.D, d);
            rot = angleDelta(0, pt.a) * P.follow * (1 - land);
            const born = (sigma + T.lead) / (size * 1.2);
            sc = lerp(P.flightScale, 1, land) * TM.ease('overshoot')(clamp(born));
            alpha = clamp(born * 3);
            if (P.streaks && f.echo === 0) {
              const d0 = distAt(tr, T, Math.max(-T.lead, headPrev - delta[g.i]));
              if (d - d0 > size * 0.6) drawn.push({ streak: true, tr, d0, d1: d, w: size * 0.09 * sc, color: f.colorOf(g), a: alpha });
            }
          } else {
            // ── landed: the spring carries the arrival speed past the slot and back ──
            const kArr = inverse(easeIn, (T.len + T.lead + delta[g.i]) / run);
            const tau = Math.max(0, f.t - kArr * inSec);
            const slope = (easeIn(Math.min(1, kArr + 1e-3)) - easeIn(Math.max(0, kArr - 1e-3))) / 2e-3;
            const v = Math.max(0, (run * slope) / inSec); // px/s at arrival
            let omega = omega0;
            if (cap > 0 && v / omega > cap) omega = v / cap;
            const wd = omega * Math.sqrt(Math.max(1e-4, 1 - zeta * zeta));
            const disp = cap > 0 ? (v / wd) * Math.exp(-zeta * omega * tau) * Math.sin(wd * tau) : 0;
            x = tr.qx + tr.tx * disp;
            y = tr.qy + tr.ty * disp;
            rot = (disp / size) * P.lean * (tr.tx >= 0 ? 1 : -1);
          }
        } else {
          // ── exit ──
          const e = easeOut(kout);
          if (P.exit === 'scatter') {
            const ang = Math.atan2(g.cy * 1.6, g.cx) + f.srand(g.i, 31) * 0.9;
            const dist = P.scatter * f.unit * (0.65 + 0.35 * f.rand(g.i, 32));
            x = tr.qx + Math.cos(ang) * dist * e;
            y = tr.qy + Math.sin(ang) * dist * e;
            rot = f.srand(g.i, 33) * Math.PI * 1.2 * e;
            sc = 1 - 0.55 * clamp(e);
            alpha = 1 - smoothstep(0.55, 1, kout);
          } else if (P.exit === 'drop') {
            const fall = f.H - tr.qy + size * 1.4;
            x = tr.qx + f.srand(g.i, 41) * size * 0.6 * clamp(e);
            y = tr.qy + fall * e;
            rot = f.srand(g.i, 42) * 0.9 * e;
            alpha = 1 - smoothstep(0.8, 1, kout);
          } else {
            const d = tr.D * (1 - e);
            const pt = along(tr, d);
            x = pt.x;
            y = pt.y;
            const land = smoothstep(tr.D - settleZone, tr.D, d);
            rot = angleDelta(0, pt.a) * P.follow * (1 - land);
            sc = lerp(P.flightScale, 1, land) * TM.ease('outCubic')(clamp((1 - kout) / 0.12));
            alpha = clamp((1 - kout) / 0.05);
          }
        }
        drawn.push({ g, o: { x, y, rot, scale: sc, alpha } });
      }

      // Streaks first (behind every letter), then letters in layout order.
      for (const it of drawn) if (it.streak) streak(f, it);
      for (const it of drawn) if (!it.streak) f.drawGlyph(it.g, it.o);
    },

    looks: [
      { name: 'Paper plane', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Bricolage Grotesque', weight: 800 }, fill: { type: 'solid', color: '#141414' }, params: { guide: 'dashed', exit: 'drop' }, path: 'scurve' } },
      { name: 'Comet', bg: { type: 'radial', color: '#1b0a2e', color2: '#07000f' }, layer: { font: { family: 'Unbounded', weight: 700 }, fill: { type: 'palette', palette: ['#ffb547', '#ff5e5b', '#ffe3a3'] }, fx: { echo: { count: 5, spacing: 0.012, fade: 0.6 }, glow: { amount: 0.35, color: '#ff5e5b' } }, params: { flightScale: 0.5 }, path: 'spiral' } },
      { name: 'Swiss scatter', bg: { type: 'solid', color: '#e63326' }, layer: { font: { family: 'Inter Tight', weight: 800 }, fill: { type: 'solid', color: '#ffffff' }, params: { exit: 'scatter', bounce: 0.8 }, path: 'loop' } },
    ],
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
