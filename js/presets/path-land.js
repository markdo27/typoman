/* Preset: Fly In — the motion-path move.
 * The word flies your path as a train, peels off into place letter by letter and lands with
 * overshoot and settle, holds, then exits: back along the path, scatter or drop.
 *
 * Letters keep a real distance between them in flight (their reading-order advance × the gap
 * setting), so they never clump, and by default the letter at the front of travel leads ("Follow
 * path"), so the word reads the right way round while it flies.
 *
 * Trajectories never cross. Each letter rides the path to the point on it nearest its own slot
 * (within the peel section), then curves off on a quarter ellipse that leaves tangent to the path
 * and arrives along the drop direction. Drops from nearby points of the path run side by side;
 * within a line they are translates of each other. On multi-line text the line farthest from the
 * path lands first, so later letters never pass through landed ones. (Blending every letter's
 * path towards its slot, path(σ) + w·(slot − end), made translated copies of the curve that cross
 * at the apex and curl back, so letters knotted and their heading wrapped through ±π.)
 *
 * Rotation follows the path's unwrapped tangent and eases to the nearest upright angle, so it can
 * never flip. A damped spring carries each letter's arrival speed past its slot and back.
 */
(function (TM) {
  'use strict';
  const { clamp, lerp, smoothstep, angleDelta } = TM.math;
  const K = TM.PathKit;
  const TAU = Math.PI * 2;
  const NP = 240; // shared samples along the path (positions for the peel search, unwrapped angle)
  const NB = 32; // samples per peel curve
  const cache = new WeakMap();
  const orderCache = new WeakMap();

  /**
   * Path samples from −lead to its end: positions and the unwrapped heading. The heading is the
   * engine's corner-safe angle over about a glyph's width, so letters turn through a zigzag's
   * or a bounce's corner instead of snapping round at it.
   */
  function pathTable(path, lead, win) {
    const len = path.length, span = len + lead;
    const xs = new Float64Array(NP + 1), ys = new Float64Array(NP + 1), th = new Float64Array(NP + 1);
    for (let k = 0; k <= NP; k++) {
      const s = -lead + (span * k) / NP;
      const p = path.at(s);
      xs[k] = p.x;
      ys[k] = p.y;
      const a = path.angleAt(s, win);
      th[k] = k ? th[k - 1] + angleDelta(th[k - 1], a) : a;
    }
    return { xs, ys, th, lead, len, span };
  }

  /** Unwrapped tangent angle at distance d from the start of the lead-in. */
  function angleAt(T, d) {
    const k = clamp(d / T.span) * NP;
    const i = Math.min(NP - 1, Math.floor(k));
    return lerp(T.th[i], T.th[i + 1], k - i);
  }

  /**
   * Where a slot peels off the path: a soft nearest point (distance-weighted mean of the arc
   * lengths within the peel section), so it moves smoothly when the path is edited or morphs and
   * settles between two branches that are equally near instead of jumping from one to the other.
   */
  function peelPoint(T, s0, qx, qy, soft, closed) {
    const k0 = Math.floor(((s0 + T.lead) / T.span) * NP);
    let dmin = Infinity;
    for (let k = k0; k <= NP; k++) dmin = Math.min(dmin, (T.xs[k] - qx) ** 2 + (T.ys[k] - qy) ** 2);
    const inv = 1 / (soft * soft);
    // A whole closed loop is a circle of arc lengths: average on it, so the two ends of the loop
    // (the same place) don't average out to the opposite side.
    const loop = closed && k0 <= 0;
    let sw = 0, ss = 0, sc = 0, sn = 0;
    for (let k = k0; k <= NP; k++) {
      const e = ((T.xs[k] - qx) ** 2 + (T.ys[k] - qy) ** 2 - dmin) * inv;
      if (e > 24) continue;
      const w = Math.exp(-e);
      const s = (T.span * k) / NP - T.lead;
      sw += w;
      ss += w * s;
      if (loop) { sc += w * Math.cos((TAU * s) / T.len); sn += w * Math.sin((TAU * s) / T.len); }
    }
    if (loop) return { s: TM.math.mod((Math.atan2(sn, sc) / TAU) * T.len, T.len), d: Math.sqrt(dmin) };
    return { s: clamp(ss / sw, s0, T.len), d: Math.sqrt(dmin) };
  }

  /**
   * Train order on multi-line text (Follow path): the order of lines in which no letter flies
   * through letters that have already landed. A later line's trajectories are sampled against
   * the earlier lines' slots; the order with the least contact wins (so a path arching over the
   * text lands its far line first, and one crossing the text lands the line farther along it
   * first), ties going to reading order. Decided on the main path, which stays put over the loop,
   * so path keyframes never reshuffle the train.
   */
  function lineOrder(f, base) {
    const L = f.layout, size = f.size;
    const key = [K.keyOf(L), f.cx.toFixed(1), f.cy.toFixed(1), f.params.peel, f.params.leadIn].join('|');
    let hit = orderCache.get(base);
    if (hit && hit.key === key) return hit;
    const T = trajectories(f, base);
    const lines = L.lines.map((line, li) => ({ li, gs: line.glyphs.filter((gi) => !L.glyphs[gi].isSpace && T.list[gi]) })).filter((l) => l.gs.length);
    // Reading direction in flight: the way the train travels from the start of the path to where
    // letters peel off (a loop or a hook at the end doesn't flip the word).
    let tx = 0;
    for (const l of lines) for (const gi of l.gs) tx += T.list[gi].px - T.T.xs[0];
    // Contact if line b flies after line a: closeness of b's trajectories to a's slots.
    const r = size * 0.7;
    const contact = (a, b) => {
      let c = 0;
      const pick = (gs) => (gs.length <= 16 ? gs : gs.filter((_, k) => k % Math.ceil(gs.length / 16) === 0));
      for (const gj of pick(b.gs)) {
        const tr = T.list[gj], n = 40;
        for (let k = 0; k < n; k++) {
          const p = along(base, T.T, tr, (tr.D * k) / n);
          for (const gi of pick(a.gs)) {
            const q = T.list[gi];
            const d = Math.hypot(p.x - q.qx, p.y - q.qy);
            if (d < r) c += 1 - d / r;
          }
        }
      }
      return c;
    };
    let order = lines.map((l) => l.li);
    if (lines.length > 1 && lines.length <= 4) {
      const C = lines.map((a) => lines.map((b) => (a === b ? 0 : contact(a, b))));
      let best = Infinity;
      const perm = (rest, done, cost) => {
        if (cost >= best - 1e-9) return;
        if (!rest.length) { best = cost; order = done.map((k) => lines[k].li); return; }
        rest.forEach((k, idx) => {
          let add = 0;
          for (const j of done) add += C[j][k]; // k flies after every line already down
          perm(rest.filter((_, m) => m !== idx), done.concat(k), cost + add);
        });
      };
      perm(lines.map((_, k) => k), [], 0);
    } else if (lines.length > 4) {
      // Many lines: farthest from the path first.
      const far = (l) => l.gs.reduce((s, gi) => s + T.list[gi].D - T.list[gi].da, 0) / l.gs.length;
      order = lines.slice().sort((a, b) => far(b) - far(a)).map((l) => l.li);
    }
    hit = { key, order, heading: tx };
    orderCache.set(base, hit);
    return hit;
  }

  /** Per-glyph trajectories for this path + layout (cached on the sampled path object). */
  function trajectories(f, path) {
    const P = f.params, L = f.layout, size = f.size;
    const key = [K.keyOf(L), f.cx.toFixed(2), f.cy.toFixed(2), P.peel, P.leadIn, size.toFixed(2)].join('|');
    const hit = cache.get(path);
    if (hit && hit.key === key) return hit;
    const len = path.length;
    const lead = path.closed ? 0 : P.leadIn * size;
    const T = pathTable(path, lead, size * 1.4);
    const s0 = Math.min(P.peel, 0.97) * len;
    const list = L.glyphs.map((g) => {
      if (g.isSpace) return null;
      const qx = f.cx + g.cx, qy = f.cy + g.cy;
      const pk = peelPoint(T, s0, qx, qy, Math.max(size, 1), path.closed);
      const at = path.at(pk.s);
      let nx = qx - at.x, ny = qy - at.y;
      const dn = Math.hypot(nx, ny);
      // Start curving off a little before the peel point (never before the path starts).
      const b = clamp(dn * 0.9, size * 0.6, Math.max(0, pk.s + lead));
      const sa = pk.s - b;
      const A = path.at(sa);
      // Arrive dropping into the line (the drop direction, turned toward the line's normal, so
      // a letter never lands sliding into its neighbour); a slot on the path is approached along
      // the path.
      const m = smoothstep(0, b * 0.6, dn);
      nx = dn > 1e-6 ? nx / dn : at.tx;
      ny = dn > 1e-6 ? ny / dn : at.ty;
      const nl = Math.hypot(nx * 0.35, ny) || 1;
      let ax = lerp(at.tx, (nx * 0.35) / nl, m), ay = lerp(at.ty, ny / nl, m);
      const al = Math.hypot(ax, ay) || 1;
      ax /= al;
      ay /= al;
      // Quarter ellipse A → slot: leaves along the path tangent, arrives along (ax, ay).
      const h1 = 0.55 * b, h2 = 0.55 * Math.max(dn, b * 0.3);
      const c = [A.x, A.y, A.x + A.tx * h1, A.y + A.ty * h1, qx - ax * h2, qy - ay * h2, qx, qy];
      const bx = new Float64Array(NB + 1), by = new Float64Array(NB + 1), bc = new Float64Array(NB + 1);
      for (let k = 0; k <= NB; k++) {
        const t = k / NB, u = 1 - t;
        const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
        bx[k] = w0 * c[0] + w1 * c[2] + w2 * c[4] + w3 * c[6];
        by[k] = w0 * c[1] + w1 * c[3] + w2 * c[5] + w3 * c[7];
        if (k) bc[k] = bc[k - 1] + Math.hypot(bx[k] - bx[k - 1], by[k] - by[k - 1]);
      }
      const da = sa + lead;
      const th0 = angleAt(T, da);
      return {
        qx, qy, sa, da, bx, by, bc, D: da + bc[NB], ax, ay, th0, px: A.x,
        turn: TAU * Math.round(th0 / TAU), // the upright angle nearest the heading at the peel
        dir: A.tx >= 0 ? 1 : -1, // travel direction there (which way letters lean on landing)
      };
    });
    const out = { key, list, lead, len, T };
    cache.set(path, out);
    return out;
  }

  /**
   * Point and unwrapped heading at distance d along a letter's trajectory: the path up to its
   * peel curve, then the curve; past the slot it continues along the arrival direction.
   */
  function along(path, T, tr, d) {
    if (d <= tr.da) {
      const p = path.at(d - T.lead);
      return { x: p.x, y: p.y, a: angleAt(T, d) };
    }
    if (d >= tr.D) return { x: tr.qx + tr.ax * (d - tr.D), y: tr.qy + tr.ay * (d - tr.D), a: tr.th0 };
    const u = d - tr.da, bc = tr.bc;
    let lo = 0, hi = NB;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (bc[mid] <= u) lo = mid; else hi = mid;
    }
    const seg = bc[hi] - bc[lo];
    const t = seg > 1e-9 ? (u - bc[lo]) / seg : 0;
    return { x: lerp(tr.bx[lo], tr.bx[hi], t), y: lerp(tr.by[lo], tr.by[hi], t), a: tr.th0 };
  }

  /** Rotation at distance d: the path tangent in flight, eased to upright over the peel curve. */
  function rotAt(tr, pt, d, follow) {
    return (pt.a - tr.turn) * follow * (1 - smoothstep(tr.da, tr.D, d));
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
      ...TM.P.sequence({ inDur: 0.52, outDur: 0.3, stagger: 0.3, easeIn: [0.45, 0.05, 0.55, 0.88], easeOut: 'linear' }).map((p) => (p.key === 'order' ? ORDER : p.key === 'stagger' ? GAP : p)),
      TM.P.range('peel', 'Peel off after', 0, 0.95, 0.01, 0, { group: 'Flight', hint: 'Letters leave the path where it passes nearest their place. Raise this to make them ride at least this far first' }),
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
      // Reading-order position of every glyph centre (layout px): over the whole text (lines
      // joined with a space) and within its line, plus each line's first and last visible letter.
      const L = f.layout;
      const pos = new Float64Array(L.glyphs.length), inLine = new Float64Array(L.glyphs.length);
      const first = [], last = [], firstW = [], lastW = [];
      let acc = 0;
      L.lines.forEach((line, li) => {
        if (li) acc += L.sizePx * 0.3;
        let la = 0;
        first[li] = last[li] = null;
        // Lines with RTL script are laid out in bidi visual order (reading order runs right to
        // left): place their letters by where they sit on screen, so the train lands them there.
        const visual = K.screenOrder(L, line) !== line.glyphs;
        for (const gi of line.glyphs) {
          const g = L.glyphs[gi];
          pos[gi] = acc + g.w / 2;
          inLine[gi] = visual ? g.x - line.x + g.w / 2 : la + g.w / 2;
          acc += g.w + L.tracking;
          la += g.w + L.tracking;
        }
        for (const gi of line.glyphs) {
          const g = L.glyphs[gi];
          if (g.isSpace) continue;
          if (first[li] == null || inLine[gi] < first[li]) { first[li] = inLine[gi]; firstW[li] = g.w; }
          if (last[li] == null || inLine[gi] > last[li]) { last[li] = inLine[gi]; lastW[li] = g.w; }
        }
      });
      return { pos, inLine, first, last, firstW, lastW };
    },

    render(f) {
      const path = f.path;
      if (!path || path.length < 1) return;
      const P = f.params, L = f.layout, size = f.size;
      const T = trajectories(f, path);
      const PT = T.T;
      if (P.guide !== 'none' && f.echo === 0) guide(f, path, P.guide);
      const dur = f.dur;
      const easeIn = TM.ease(P.easeIn, 'smooth'), easeOut = TM.ease(P.easeOut, 'linear');
      let inDur = P.inDur, outDur = P.timing === 'in' ? 0 : P.outDur;
      const tot = inDur + outDur;
      if (tot > 1) { inDur /= tot; outDur /= tot; }

      // The train: each letter rides delta px behind the leader.
      const vis = L.glyphs.filter((g) => !g.isSpace);
      if (!vis.length) return;
      const C = f.cache, pos = C.pos;
      const gapK = 1 + P.stagger * 2.5;
      const delta = new Float64Array(L.glyphs.length);
      if (P.order === 'path') {
        // Follow path: lines land farthest-from-the-path first, each reading the right way round
        // for the direction of travel (the last letter leads when the path runs left to right).
        const base = f.layer.path ? TM.Path.sample(f.layer.path, f.W, f.H) : path;
        const ord = lineOrder(f, base.length > 1 ? base : path);
        const leadLast = ord.heading >= 0;
        // Line blocks one after another, a word space apart (edge to edge, like the reading order).
        const start = [];
        let off = 0, prev = -1;
        for (const li of ord.order) {
          if (C.first[li] == null) continue;
          if (prev >= 0) off += (leadLast ? C.firstW[prev] + C.lastW[li] : C.lastW[prev] + C.firstW[li]) / 2 + L.tracking + size * 0.3;
          start[li] = off;
          off += C.last[li] - C.first[li];
          prev = li;
        }
        for (const g of vis) delta[g.i] = (start[g.line] + (leadLast ? C.last[g.line] - C.inLine[g.i] : C.inLine[g.i] - C.first[g.line])) * gapK;
      } else {
        const first = pos[vis[0].i], last = pos[vis[vis.length - 1].i];
        for (const g of vis) {
          if (P.order === 'start') delta[g.i] = (pos[g.i] - first) * gapK;
          else if (P.order === 'end') delta[g.i] = (last - pos[g.i]) * gapK;
          else delta[g.i] = f.rank(g, P.order) * (last - first) * gapK;
        }
      }
      let dMax = 0, run = 0;
      for (const g of vis) {
        dMax = Math.max(dMax, delta[g.i]);
        if (T.list[g.i]) run = Math.max(run, T.list[g.i].D + delta[g.i]); // the leader's distance in the in-phase
      }
      const inSec = Math.max(1e-3, inDur * dur);
      const kIn = inDur > 0 ? clamp(f.p / inDur) : 1;
      const head = run * easeIn(kIn);
      const headPrev = run * easeIn(Math.max(0, kIn - 0.045));
      const cap = P.overshoot * size;
      // Momentum never carries a letter into its neighbours: along a line it may run on about a
      // side bearing, and across lines only into the free leading (toward a line that is there).
      const lastLine = L.lines.length - 1;
      const capX = size * 0.15, capY = Math.max(size * 0.05, (L.lineGap - L.capH) * 0.9);
      const capFor = (tr, g) => {
        let c = cap;
        if (Math.abs(tr.ax) > 1e-3) c = Math.min(c, capX / Math.abs(tr.ax));
        if ((tr.ay > 1e-3 && g.line < lastLine) || (tr.ay < -1e-3 && g.line > 0)) c = Math.min(c, capY / Math.abs(tr.ay));
        return c;
      };
      const zeta = lerp(0.95, 0.22, P.bounce);
      const omega0 = 2 * Math.PI * lerp(1.6, 2.6, P.bounce);
      const drawn = [];
      // Exit back along the path is the entry run backwards: the train's head recedes, so the
      // last letter to land leaves first and every letter keeps its spacing on the path (nobody
      // overtakes, nothing knots). Each crouches a little past its slot just before it goes.
      const kOut = outDur > 0 ? clamp((f.p - (1 - outDur)) / outDur) : 0;
      const back = P.exit === 'back' && kOut > 0;
      const headOut = back ? run * (1 - easeOut(kOut)) : 0;
      const flight = (g, tr, d) => {
        const pt = along(path, PT, tr, d);
        const land = smoothstep(tr.da, tr.D, d);
        const born = d / (size * 1.2);
        return { x: pt.x, y: pt.y, rot: rotAt(tr, pt, d, P.follow), scale: lerp(P.flightScale, 1, land) * TM.ease('overshoot')(clamp(born)), alpha: clamp(born * 3) };
      };

      for (const g of vis) {
        const tr = T.list[g.i];
        if (!tr) continue;
        if (back) {
          const ex = headOut - delta[g.i] - tr.D; // > 0: still waiting at the slot
          let db = tr.D + ex;
          if (ex > 0) {
            // Crouch: ψ(x) = x·(1 − x/w)², rising off the slot and back with matching speed.
            const w = Math.max(1, Math.min(capFor(tr, g), size * 0.25) / 0.148);
            db = ex < w ? tr.D + ex * (1 - ex / w) ** 2 : tr.D;
          }
          if (db <= 0) continue; // gone back past the start of the path
          drawn.push({ g, o: flight(g, tr, db) });
          continue;
        }
        let rOut = dMax > 0 ? 1 - delta[g.i] / dMax : 0; // last to land leaves first
        // Drop: gravity takes the bottom line first, so no letter falls through another.
        if (P.exit === 'drop' && lastLine > 0) rOut = clamp(((lastLine - g.line) / lastLine) * 0.75 + rOut * 0.25);
        // Scatter: the burst starts at the rim, so an inner letter never overtakes an outer one.
        if (P.exit === 'scatter') rOut = 1 - clamp(Math.hypot(g.cx, g.cy * 1.6) / Math.max(1, L.width / 2));
        const kout = outDur > 0 ? f.stagger((f.p - (1 - outDur)) / outDur, rOut, 0.45) : 0;
        if (kout >= 1) continue;
        const d = head - delta[g.i]; // distance along this letter's own trajectory
        if (d <= 0) continue; // still queued before the start of the path
        let x, y, rot = 0, sc = 1, alpha = 1;

        if (kout <= 0) {
          if (d < tr.D) {
            // ── in flight: along the path, then off it on the peel curve ──
            ({ x, y, rot, scale: sc, alpha } = flight(g, tr, d));
            if (P.streaks && f.echo === 0) {
              const d0 = Math.max(0, headPrev - delta[g.i]);
              if (d - d0 > size * 0.6) drawn.push({ streak: true, path, T: PT, tr, d0, d1: d, w: size * 0.09 * sc, color: f.colorOf(g), a: alpha });
            }
          } else {
            // ── landed: the spring carries the arrival speed past the slot and back ──
            const kArr = inverse(easeIn, (tr.D + delta[g.i]) / run);
            const tau = Math.max(0, f.t - kArr * inSec);
            const slope = (easeIn(Math.min(1, kArr + 1e-3)) - easeIn(Math.max(0, kArr - 1e-3))) / 2e-3;
            const v = Math.max(0, (run * slope) / inSec); // px/s at arrival
            const ci = capFor(tr, g);
            let omega = omega0;
            if (ci > 0 && v / omega > ci) omega = v / ci;
            const wd = omega * Math.sqrt(Math.max(1e-4, 1 - zeta * zeta));
            const disp = ci > 0 ? (v / wd) * Math.exp(-zeta * omega * tau) * Math.sin(wd * tau) : 0;
            x = tr.qx + tr.ax * disp;
            y = tr.qy + tr.ay * disp;
            rot = (disp / size) * P.lean * tr.dir;
          }
        } else {
          // ── exit ──
          // An anticipating ease dips below 0 first: keep that a crouch of about a tenth of an em
          // (scaled from the ease's ~10% dip), not a tenth of the whole flight back into the text.
          const raw = easeOut(kout);
          const crouch = (dist) => (raw >= 0 ? raw : raw * Math.min(1, (size * 0.12) / Math.max(1e-6, dist * 0.1)));
          if (P.exit === 'scatter') {
            // A burst from the middle of the text: straight out along each letter's own ray, and
            // farther the farther out it starts, so the burst only ever spreads letters apart.
            const ex = g.cx / Math.max(1, L.width / 2), ey = (g.cy * 1.6) / Math.max(1, L.width / 2);
            const r = Math.hypot(ex, ey);
            const ang = Math.atan2(ey, ex);
            const dist = P.scatter * f.unit * (0.45 + 0.55 * Math.min(1, r));
            const e = crouch(dist);
            x = tr.qx + Math.cos(ang) * dist * e;
            y = tr.qy + Math.sin(ang) * dist * e;
            rot = f.srand(g.i, 33) * Math.PI * 1.2 * e;
            sc = 1 - 0.55 * clamp(e);
            alpha = 1 - smoothstep(0.55, 1, kout);
          } else if (P.exit === 'drop') {
            // Fall away, fanning out from the middle (neighbours never drift into each other).
            const fall = f.H - tr.qy + size * 1.4;
            const e = crouch(fall);
            x = tr.qx + ((g.cx / Math.max(1, L.width / 2)) * 0.5 + f.srand(g.i, 41) * 0.1) * size * clamp(e);
            y = tr.qy + fall * e;
            rot = f.srand(g.i, 42) * 0.9 * e;
            alpha = 1 - smoothstep(0.8, 1, kout);
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
      { name: 'Comet', bg: { type: 'radial', color: '#1b0a2e', color2: '#07000f' }, layer: { font: { family: 'Unbounded', weight: 700 }, fill: { type: 'palette', palette: ['#ffb547', '#ff5e5b', '#ffe3a3'] }, fx: { echo: { count: 5, spacing: 0.012, fade: 0.6 }, glow: { amount: 0.35, color: '#ff5e5b' } }, params: { flightScale: 0.5 }, path: 'swoosh' } },
      { name: 'Swiss scatter', bg: { type: 'solid', color: '#e63326' }, layer: { font: { family: 'Inter Tight', weight: 800 }, fill: { type: 'solid', color: '#ffffff' }, params: { exit: 'scatter', bounce: 0.8 }, path: 'bounce' } },
    ],
  });

  /** A tapered speed line along the trajectory behind a flying letter. */
  function streak(f, it) {
    const ctx = f.ctx;
    ctx.save();
    K.strokeStyle(f, it.w, 1, it.color);
    const steps = 8;
    let prev = along(it.path, it.T, it.tr, it.d0);
    for (let k = 1; k <= steps; k++) {
      const pt = along(it.path, it.T, it.tr, lerp(it.d0, it.d1, k / steps));
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
