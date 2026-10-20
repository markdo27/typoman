/* Preset: Gravity — the path is the ground. Letters drop in from beyond the frame, land on it
 * with rigid-body bounce and tilt, knock their neighbours a little and settle into their places
 * in reading order, so the hold reads as text on the path. Then the ground gives way (or a sweep
 * or a gust takes them) and the frame is empty again for the loop.
 *
 * Deterministic: the whole loop is a fixed-step simulation run once, in layout units (the
 * frame's short side = 1000), and its per-frame poses are replayed, so a frame depends only on
 * the scene and t and is the same at every render size. Bodies are glyph boxes (advance × cap
 * height): corner contacts against the ground polyline (one-sided, so the ground has a top) and
 * against the boxes of their neighbours, with restitution, Coulomb friction and squash on impact.
 * Open paths pull straight down; closed paths pull toward their centre, so the text lands on the
 * outside. Before the exit every letter is eased onto its slot, so the hold is exact.
 */
(function (TM) {
  'use strict';
  const { clamp, lerp, smoothstep } = TM.math;
  const K = TM.PathKit;
  const REF = 1000; // the frame's short side in simulation units
  const MAX_FRAMES = 1800; // cached poses per loop (30 s at 60 fps); longer loops interpolate
  const STRIDE = 5; // x, y, angle, squash, alpha
  const sims = new Map(); // shared across renderers and render sizes (inputs are size-free)

  /** Rotate (x, y) by angle a. */
  const rot = (x, y, c, s) => [x * c - y * s, x * s + y * c];

  /**
   * The ground: the layer's path in simulation units, oriented so each segment's left normal
   * (ty, -tx) is its top (screen up on open paths, outward on closed ones), plus a bucket grid of
   * segments for fast nearest-segment queries.
   */
  function ground(def, RW, RH) {
    const sp = TM.Path.sample(def, RW, RH);
    let xs = Array.from(sp.xs), ys = Array.from(sp.ys);
    const n = xs.length;
    const closed = sp.closed;
    if (n < 2) return null;
    // Orientation: open paths have their top up on average; closed ones have it outside.
    let flip;
    if (closed) {
      let area = 0;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += xs[i] * ys[j] - xs[j] * ys[i]; }
      flip = area < 0; // with y down, a positive shoelace sum runs clockwise on screen: left normal points out
    } else {
      let up = 0;
      for (let i = 0; i + 1 < n; i++) up += -(xs[i + 1] - xs[i]); // ny of (ty, -tx) summed, times length
      flip = up > 0;
    }
    if (flip) { xs = xs.reverse(); ys = ys.reverse(); }
    const segs = closed ? n : n - 1;
    const sx = new Float64Array(segs), sy = new Float64Array(segs), ex = new Float64Array(segs), ey = new Float64Array(segs);
    const nx = new Float64Array(segs), ny = new Float64Array(segs), len = new Float64Array(segs), cum = new Float64Array(segs + 1);
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      sx[i] = xs[i]; sy[i] = ys[i]; ex[i] = xs[j]; ey[i] = ys[j];
      const l = Math.hypot(ex[i] - sx[i], ey[i] - sy[i]) || 1e-9;
      len[i] = l;
      cum[i + 1] = cum[i] + l;
      nx[i] = (ey[i] - sy[i]) / l;
      ny[i] = -(ex[i] - sx[i]) / l;
    }
    const CELL = 60, PAD = 70;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, xs[i]); y0 = Math.min(y0, ys[i]); x1 = Math.max(x1, xs[i]); y1 = Math.max(y1, ys[i]); }
    x0 -= PAD * 2; y0 -= PAD * 2;
    const gw = Math.ceil((x1 - x0 + PAD * 4) / CELL) + 1, gh = Math.ceil((y1 - y0 + PAD * 4) / CELL) + 1;
    const grid = Array.from({ length: gw * gh }, () => []);
    for (let i = 0; i < segs; i++) {
      const a = Math.floor((Math.min(sx[i], ex[i]) - PAD - x0) / CELL), b = Math.floor((Math.max(sx[i], ex[i]) + PAD - x0) / CELL);
      const c = Math.floor((Math.min(sy[i], ey[i]) - PAD - y0) / CELL), d = Math.floor((Math.max(sy[i], ey[i]) + PAD - y0) / CELL);
      for (let gy = Math.max(0, c); gy <= Math.min(gh - 1, d); gy++) for (let gx = Math.max(0, a); gx <= Math.min(gw - 1, b); gx++) grid[gy * gw + gx].push(i);
    }
    let cx = 0, cy = 0;
    for (let i = 0; i < segs; i++) { cx += ((sx[i] + ex[i]) / 2) * len[i]; cy += ((sy[i] + ey[i]) / 2) * len[i]; }
    const total = cum[segs];
    return { flip, xs, ys, n, closed, segs, sx, sy, ex, ey, nx, ny, len, cum, length: total, grid, gw, gh, x0, y0, CELL, PAD, cx: cx / total, cy: cy / total };
  }

  /** Point, tangent angle and top normal at arc length s. */
  function at(G, s) {
    if (G.closed) s = ((s % G.length) + G.length) % G.length; else s = clamp(s, 0, G.length);
    let lo = 0, hi = G.segs;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (G.cum[m] <= s) lo = m; else hi = m; }
    const i = Math.min(lo, G.segs - 1), u = (s - G.cum[i]) / G.len[i];
    // Normal blended toward the neighbouring segment near a joint, so slots on a polyline sit smoothly.
    return { x: lerp(G.sx[i], G.ex[i], u), y: lerp(G.sy[i], G.ey[i], u), nx: G.nx[i], ny: G.ny[i], angle: Math.atan2(G.nx[i], -G.ny[i]) };
  }

  /** Signed height of point (x, y) above the ground's top, nearest segment, or null when not over it. */
  function probe(G, x, y) {
    const gx = Math.floor((x - G.x0) / G.CELL), gy = Math.floor((y - G.y0) / G.CELL);
    if (gx < 0 || gy < 0 || gx >= G.gw || gy >= G.gh) return null;
    const list = G.grid[gy * G.gw + gx];
    let best = Infinity, out = null;
    for (const i of list) {
      const dx = G.ex[i] - G.sx[i], dy = G.ey[i] - G.sy[i];
      let u = ((x - G.sx[i]) * dx + (y - G.sy[i]) * dy) / (G.len[i] * G.len[i]);
      if (!G.closed && ((i === 0 && u < 0) || (i === G.segs - 1 && u > 1))) continue; // off the ends
      u = clamp(u, 0, 1);
      const qx = G.sx[i] + dx * u, qy = G.sy[i] + dy * u;
      const d2 = (x - qx) ** 2 + (y - qy) ** 2;
      if (d2 < best) { best = d2; out = i; }
    }
    if (out == null) return null;
    const h = (x - G.sx[out]) * G.nx[out] + (y - G.sy[out]) * G.ny[out];
    return { h, nx: G.nx[out], ny: G.ny[out], d: Math.sqrt(best) };
  }

  /** Penetration depth of two oriented boxes { x, y, a, w, h } (separating axes), 0 when apart. */
  function overlap(P, Q) {
    const cp = Math.cos(P.a), sp = Math.sin(P.a), cq = Math.cos(Q.a), sq = Math.sin(Q.a);
    const dx = Q.x - P.x, dy = Q.y - P.y;
    let pen = Infinity;
    for (const [ux, uy] of [[cp, sp], [-sp, cp], [cq, sq], [-sq, cq]]) {
      const ra = (P.w / 2) * Math.abs(cp * ux + sp * uy) + (P.h / 2) * Math.abs(-sp * ux + cp * uy);
      const rb = (Q.w / 2) * Math.abs(cq * ux + sq * uy) + (Q.h / 2) * Math.abs(-sq * ux + cq * uy);
      const o = ra + rb - Math.abs(dx * ux + dy * uy);
      if (o <= 0) return 0;
      pen = Math.min(pen, o);
    }
    return pen;
  }

  /** Run the loop's simulation. Returns { poses: Float32Array(frames + 1 × n × STRIDE), frames, ground break info }. */
  function simulate(S, P, dur, fps, seed) {
    const G = S.G, B = S.bodies, n = B.length;
    const frames = Math.max(2, Math.min(MAX_FRAMES, Math.round(dur * fps)));
    const fdt = dur / frames;
    const sub = Math.max(1, Math.ceil(fdt / (n > 80 ? 1 / 120 : 1 / 240)));
    const dt = fdt / sub;
    const poses = new Float32Array((frames + 1) * n * STRIDE);
    const rnd = (i, k) => TM.rand(seed, i, k) * 2 - 1;

    const e = lerp(0, 0.78, P.bounce);
    const mu = 1.1;
    const g0 = lerp(1700, 3600, P.weight);
    const tumble = P.tumble;
    const squashK = P.squash;
    // Timeline: drops spread over the first part of the loop, a settle, the hold, the exit.
    const tFall = Math.min(0.55, 0.14 * dur);
    const tExit = dur * 0.7;
    const settle = Math.min(0.8, 0.16 * dur);
    const spreadIn = Math.max(0, tExit - settle - 0.35 - tFall - 0.05 * dur) * clamp(P.spacing) * 0.8;
    const spreadOut = 0.12 * dur;
    const radial = G.closed;

    const st = B.map((b, i) => {
      const t0 = b.rank * spreadIn;
      // Start beyond the frame, above the slot (straight up, or out along the ray from the centre).
      let ux = 0, uy = -1;
      if (radial) { const dx = b.sx - G.cx, dy = b.sy - G.cy, l = Math.hypot(dx, dy) || 1; ux = dx / l; uy = dy / l; }
      const off = rnd(i, 1) * tumble * b.w * 0.7;
      const tx = -uy, ty = ux; // across the fall
      // Distance to the frame's far edge along u, plus the letter's size.
      let far = Infinity;
      if (ux > 1e-6) far = Math.min(far, (S.RW - b.sx) / ux); else if (ux < -1e-6) far = Math.min(far, -b.sx / ux);
      if (uy > 1e-6) far = Math.min(far, (S.RH - b.sy) / uy); else if (uy < -1e-6) far = Math.min(far, -b.sy / uy);
      if (!Number.isFinite(far)) far = S.RH;
      const h0 = Math.max(0, far) + Math.hypot(b.w, b.h) * 0.75 + 20;
      const v0 = (h0 - 0.5 * g0 * tFall * tFall) / tFall; // toward the ground, so it lands on time
      return {
        x: b.sx + ux * h0 + tx * off, y: b.sy + uy * h0 + ty * off,
        a: b.sa + rnd(i, 2) * tumble * 0.5,
        vx: -ux * v0, vy: -uy * v0, w: rnd(i, 3) * tumble * 4,
        t0, on: false, land: -1, sq: 0, free: Infinity, kicked: false,
        m: b.w * b.h, I: (b.w * b.h * (b.w * b.w + b.h * b.h)) / 12,
      };
    });
    // Exit: when each letter leaves the ground (or is swept / blown).
    // The ground goes from its start to its end over the exit; each letter leaves as it passes.
    B.forEach((b, i) => { st[i].free = tExit + clamp(b.s / G.length) * spreadOut; });
    const settled = (q) => Math.max(q.land + 0.31, Math.min(q.land + 0.3 + settle, tExit - 0.02)); // on its slot from here

    const corners = new Float64Array(12);
    // Contact points: the box corners (k = 1), or for box against box the corners pulled in a
    // little plus the side midpoints, so boxes side by side at the same height still register.
    const cornersOf = (q, b, k = 1) => {
      const c = Math.cos(q.a), s = Math.sin(q.a), hw = (b.w / 2) * k, hh = (b.h / 2) * k;
      let j = 0;
      for (const [lx, ly] of [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh], [-hw, 0], [hw, 0]]) { const [rx, ry] = rot(lx, ly, c, s); corners[j++] = q.x + rx; corners[j++] = q.y + ry; }
    };
    // Impulse at world point (px, py) along (nx, ny) on body q (and, if r, the reverse on r).
    const impulse = (q, r, px, py, nx, ny, rest) => {
      const rax = px - q.x, ray = py - q.y;
      let vx = q.vx - q.w * ray, vy = q.vy + q.w * rax;
      let rbx = 0, rby = 0;
      if (r) { rbx = px - r.x; rby = py - r.y; vx -= r.vx - r.w * rby; vy -= r.vy + r.w * rbx; }
      const vn = vx * nx + vy * ny;
      if (vn >= 0) return 0;
      const ra = rax * ny - ray * nx, rb = rbx * ny - rby * nx;
      const kn = 1 / q.m + (ra * ra) / q.I + (r ? 1 / r.m + (rb * rb) / r.I : 0);
      const j = (-(1 + (vn < -90 ? rest : 0)) * vn) / kn;
      q.vx += (j * nx) / q.m; q.vy += (j * ny) / q.m; q.w += (ra * j) / q.I;
      if (r) { r.vx -= (j * nx) / r.m; r.vy -= (j * ny) / r.m; r.w -= (rb * j) / r.I; }
      // Coulomb friction along the contact.
      const tx = -ny, ty = nx;
      vx = q.vx - q.w * ray; vy = q.vy + q.w * rax;
      if (r) { vx -= r.vx - r.w * rby; vy -= r.vy + r.w * rbx; }
      const vt = vx * tx + vy * ty;
      const rta = rax * ty - ray * tx, rtb = rbx * ty - rby * tx;
      const kt = 1 / q.m + (rta * rta) / q.I + (r ? 1 / r.m + (rtb * rtb) / r.I : 0);
      const jt = clamp(-vt / kt, -mu * j, mu * j);
      q.vx += (jt * tx) / q.m; q.vy += (jt * ty) / q.m; q.w += (rta * jt) / q.I;
      if (r) { r.vx -= (jt * tx) / r.m; r.vy -= (jt * ty) / r.m; r.w -= (rtb * jt) / r.I; }
      return -vn;
    };

    let t = 0;
    const record = (k) => {
      const base = k * n * STRIDE;
      for (let i = 0; i < n; i++) {
        const q = st[i], b = B[i], o = base + i * STRIDE;
        // Settle onto the slot before the exit, so the hold reads exactly as text on the path.
        // The last stretch of the settle eases out what the spring leaves, so the hold is exact.
        const end = q.land >= 0 ? settled(q) : 0;
        const w = q.land >= 0 && t < q.free ? smoothstep(end - Math.min(0.25, (end - q.land) * 0.4), end, t) : 0;
        poses[o] = lerp(q.x, b.sx, w);
        poses[o + 1] = lerp(q.y, b.sy, w);
        poses[o + 2] = lerp(q.a, q.a + TM.math.angleDelta(q.a, b.sa), w);
        poses[o + 3] = q.sq * (1 - w);
        poses[o + 4] = q.on ? 1 : 0;
      }
    };
    record(0);
    for (let k = 1; k <= frames; k++) {
      for (let ss = 0; ss < sub; ss++) {
        t += dt;
        for (let i = 0; i < n; i++) {
          const q = st[i], b = B[i];
          if (!q.on) { if (t < q.t0) continue; q.on = true; }
          // Hold: once settled, the body sits on its slot until it leaves.
          // A letter that missed the ground (a path off the frame, say) is eased onto it anyway.
          if (q.land < 0 && t > q.t0 + tFall + 0.45) q.land = t;
          if (q.land >= 0 && t < q.free && t >= settled(q)) { q.x = b.sx; q.y = b.sy; q.a = b.sa; q.vx = q.vy = q.w = 0; q.sq = 0; continue; }
          let gx = 0, gy = g0;
          if (radial && t < q.free) { const dx = G.cx - q.x, dy = G.cy - q.y, l = Math.hypot(dx, dy) || 1; gx = (dx / l) * g0; gy = (dy / l) * g0; }
          if (t >= q.free) {
            gy = g0 * 1.6; gx = 0;
            if (!q.kicked) {
              q.kicked = true;
              if (P.exit === 'sweep') { const p = at(G, b.s); const tx = -p.ny, ty = p.nx; q.vx += tx * 900 + p.nx * 700; q.vy += ty * 900 + p.ny * 700; q.w += 9 * (0.6 + 0.4 * rnd(i, 5)); }
              else if (P.exit === 'blow') { q.vx += 500 + 300 * rnd(i, 6); q.vy -= 650 + 200 * rnd(i, 7); q.w += 6 * rnd(i, 8); }
              else q.vy += 250;
            }
            if (P.exit === 'blow') gx = 2600;
          }
          q.vx += gx * dt; q.vy += gy * dt;
          if (q.land >= 0 && t < q.free) {
            // Settling: a spring toward the slot that firms up after landing. It acts through the
            // contacts, so letters shuffle into place against the ground and each other rather
            // than gliding through them.
            // Along the ground it holds from the first touch (letters don't skid into the next
            // valley); across it and in angle it firms up later, so bounce and tilt play out.
            const r = smoothstep(q.land + 0.04, q.land + 0.04 + settle * 0.45, t);
            const dx = b.sx - q.x, dy = b.sy - q.y, tx = -b.ny, ty = b.nx;
            const at = 170 * (dx * tx + dy * ty) - 22 * (q.vx * tx + q.vy * ty);
            const an = r * (170 * (dx * b.nx + dy * b.ny) - 22 * (q.vx * b.nx + q.vy * b.ny));
            q.vx += (at * tx + an * b.nx) * dt;
            q.vy += (at * ty + an * b.ny) * dt;
            q.w += r * (425 * TM.math.angleDelta(q.a, b.sa) - 35 * q.w) * dt;
          }
          q.w *= 1 - 1.2 * dt; // a little air drag on the spin
          q.x += q.vx * dt; q.y += q.vy * dt; q.a += q.w * dt;
          q.sq *= Math.exp(-dt / 0.07);
        }
        // Ground contacts (until a letter's ground gives way).
        for (let i = 0; i < n; i++) {
          const q = st[i], b = B[i];
          if (!q.on || t >= q.free + (P.exit === 'fall' ? 0 : 0.12)) continue;
          if (q.land >= 0 && t >= settled(q) && t < q.free) continue;
          cornersOf(q, b);
          let deep = 0, dnx = 0, dny = 0;
          for (let it = 0; it < 3; it++) {
            for (let c = 0; c < 4; c++) {
              const px = corners[c * 2], py = corners[c * 2 + 1];
              const pr = probe(G, px, py);
              if (!pr || pr.h >= 0 || pr.h < -60) continue;
              const vn = impulse(q, null, px, py, pr.nx, pr.ny, it === 0 ? e : 0);
              if (it === 0) {
                if (q.land < 0) q.land = t;
                if (vn > 150) q.sq = Math.max(q.sq, clamp(vn / 2600) * 0.4 * squashK);
                if (pr.h < deep) { deep = pr.h; dnx = pr.nx; dny = pr.ny; }
              }
            }
          }
          if (deep < 0) { q.x -= dnx * deep * 0.7; q.y -= dny * deep * 0.7; }
        }
        // Letters against each other: box-box contacts (every pair within reach; the
        // nearest few along the line for long text).
        for (let i = 0; i < n; i++) {
          const q = st[i], b = B[i];
          if (!q.on) continue;
          for (let jn = i + 1; jn <= Math.min(n - 1, n > 60 ? i + 3 : n - 1); jn++) {
            const r = st[jn], c = B[jn];
            if (!r.on) continue;
            const reach = (b.w + c.w + b.h + c.h) * 0.6;
            if (Math.abs(q.x - r.x) > reach || Math.abs(q.y - r.y) > reach) continue;
            // Separating axes of the two boxes: the shallowest overlap is the contact normal, the
            // deepest corner along it the contact point (thin letters crossing in an X too).
            const ca = Math.cos(q.a), sa = Math.sin(q.a), cc = Math.cos(r.a), sc = Math.sin(r.a);
            const dx = r.x - q.x, dy = r.y - q.y;
            let pen = Infinity, nx = 0, ny = 0, own = 0;
            const axes = [[ca, sa, 0], [-sa, ca, 0], [cc, sc, 1], [-sc, cc, 1]];
            for (const [ux, uy, who] of axes) {
              const ra = (b.w / 2) * Math.abs(ca * ux + sa * uy) + (b.h / 2) * Math.abs(-sa * ux + ca * uy);
              const rb = (c.w / 2) * Math.abs(cc * ux + sc * uy) + (c.h / 2) * Math.abs(-sc * ux + cc * uy);
              const d = dx * ux + dy * uy, o = ra + rb - Math.abs(d);
              if (o <= 0) { pen = 0; break; }
              if (o < pen) { pen = o; const sg = d < 0 ? -1 : 1; nx = ux * sg; ny = uy * sg; own = who; }
            }
            if (!(pen > 0) || !Number.isFinite(pen)) continue;
            // n points from q to r. Contact: r's corner deepest toward q (q's face), or q's toward r.
            const [S, sb] = own === 0 ? [r, c] : [q, b];
            const dir = own === 0 ? -1 : 1;
            const cs = Math.cos(S.a), sn = Math.sin(S.a);
            const px = S.x + (sb.w / 2) * Math.sign((cs * nx + sn * ny) * dir || 1) * cs - (sb.h / 2) * Math.sign((-sn * nx + cs * ny) * dir || 1) * sn;
            const py = S.y + (sb.w / 2) * Math.sign((cs * nx + sn * ny) * dir || 1) * sn + (sb.h / 2) * Math.sign((-sn * nx + cs * ny) * dir || 1) * cs;
            impulse(q, r, px, py, -nx, -ny, 0.25);
            const tot = q.m + r.m;
            q.x -= nx * pen * 0.6 * (r.m / tot); q.y -= ny * pen * 0.6 * (r.m / tot);
            r.x += nx * pen * 0.6 * (q.m / tot); r.y += ny * pen * 0.6 * (q.m / tot);
          }
        }
      }
      record(k);
    }
    return { poses, frames, tExit, spreadOut, settle };
  }

  TM.registerPreset({
    id: 'gravity',
    name: 'Gravity',
    category: 'Path',
    description: 'Your path is the ground: letters drop onto it, bounce, tilt and knock each other into place, then the ground gives way.',
    usesPath: true,
    path: 'arc',
    fit: false,
    params: [
      TM.P.select('order', 'Drop order', TM.ORDERS, 'start', { group: 'Drop' }),
      TM.P.range('spacing', 'Spacing in flight', 0, 1, 0.01, 0.55, { group: 'Drop', hint: 'Time between drops: 0 drops every letter at once' }),
      TM.P.range('tumble', 'Tumble', 0, 1, 0.01, 0.5, { group: 'Drop', hint: 'Spin and sideways scatter as letters fall: more knocking on landing' }),
      TM.P.range('bounce', 'Bounce', 0, 1, 0.01, 0.45, { group: 'Physics', hint: 'Restitution: how much speed a letter keeps when it hits the ground' }),
      TM.P.range('weight', 'Weight', 0, 1, 0.01, 0.5, { group: 'Physics', hint: 'Heavier letters fall faster and land harder' }),
      TM.P.range('squash', 'Squash on impact', 0, 1, 0.01, 0.5, { group: 'Physics' }),
      TM.P.select('exit', 'Exit', [['fall', 'Ground gives way'], ['sweep', 'Sweep'], ['blow', 'Blow away']], 'fall', { group: 'Exit' }),
      TM.P.select('guide', 'Ground', [['line', 'Line'], ['dashed', 'Dashed'], ['none', 'Hidden']], 'line', { group: 'Style' }),
      TM.P.range('groundWidth', 'Ground width', 0.002, 0.03, 0.001, 0.008, { group: 'Style', showIf: { guide: ['line', 'dashed'] } }),
    ],

    setup(f) {
      const Ly = f.layer;
      if (!Ly.path) return { bodies: [] };
      // Simulation space: the frame's short side is REF units, whatever the render size.
      const RW = (REF * f.W) / f.unit, RH = (REF * f.H) / f.unit;
      const G = ground(Ly.path, RW, RH);
      const text = f.layout.lines.map((l) => l.text.trim()).filter(Boolean).join(' ');
      if (!G || G.length < 1 || !text) return { bodies: [] };
      const opts = { family: Ly.font.family, weight: Ly.font.weight, tracking: Ly.type.tracking, leading: 1, align: 'center', case: Ly.type.case };
      const ref = TM.text.layout(Object.assign({ text, sizePx: Math.max(1, Ly.type.size * REF) }, opts));
      const draw = TM.text.layout(Object.assign({ text, sizePx: f.size }, opts)); // the glyphs drawn (same text, frame size)
      const line = ref.lines[0];
      if (!line) return { bodies: [] };
      const width = line.width;
      const k = Math.min(1, (G.length * (G.closed ? 0.9 : 0.92)) / Math.max(1, width));
      // Centre the run: mid-path on open paths, the topmost point on closed ones.
      let mid = G.length / 2;
      if (G.closed) {
        let top = Infinity;
        for (let i = 0; i < G.segs; i++) if (G.sy[i] < top) { top = G.sy[i]; mid = G.cum[i]; }
      }
      const capH = ref.capH * k;
      const glyphs = K.screenOrder(ref, line).map((gi) => ref.glyphs[gi]).filter((g) => !g.isSpace);
      // Slots: the natural spacing, opened up where a concave bend would make neighbours' boxes
      // touch (upright on the ground they lean together there), then the run re-centred.
      const slot = (g, s) => {
        const p = at(G, s);
        return { s, x: p.x + (p.nx * capH) / 2, y: p.y + (p.ny * capH) / 2, a: p.angle, nx: p.nx, ny: p.ny, w: Math.max(4, g.w * k * 0.94), h: Math.max(4, capH) };
      };
      let place = [];
      let lead = mid - (width / 2) * k;
      for (let pass = 0; pass < 2; pass++) {
        place = [];
        let s = lead;
        glyphs.forEach((g, j) => {
          if (j) s += (g.x - glyphs[j - 1].x + (g.w - glyphs[j - 1].w) / 2) * k;
          else s += (g.x - line.x + g.w / 2) * k;
          let q = slot(g, s);
          for (let it = 0; j && it < 40 && overlap(place[j - 1], q) > 0; it++) { s += capH * 0.04; q = slot(g, s); }
          place.push(q);
        });
        const span = place.length ? place[place.length - 1].s - place[0].s : 0;
        const natural = glyphs.length ? (glyphs[glyphs.length - 1].x - glyphs[0].x) * k : 0;
        lead -= (span - natural) / 2; // keep the opened-up run centred
      }
      const bodies = glyphs.map((g, j) => {
        const q = place[j];
        return { g: draw.glyphs[g.i], s: q.s, w: q.w, h: q.h, sx: q.x, sy: q.y, sa: q.a, nx: q.nx, ny: q.ny, rank: 0 };
      });
      // Drop order over the drawn glyphs (reading order ranks, as every preset's order control).
      for (const b of bodies) b.rank = f.rank(b.g, f.params.order);
      const key = JSON.stringify([text, Ly.font, Ly.type, Ly.params, Ly.path, Math.round(RW * 1000) / 1000, Math.round(RH * 1000) / 1000, f.seed]);
      return { G, bodies, k, RW, RH, key, sims: new Map() };
    },

    render(f) {
      const C = f.cache, P = f.params;
      if (!C || !C.bodies || !C.bodies.length) return;
      const key = C.key + '|' + f.dur + '|' + f.fps;
      let S = C.sims.get(key);
      if (!S) {
        S = sims.get(key);
        if (!S) {
          S = simulate(C, P, f.dur, f.fps, f.seed);
          if (sims.size > 12) sims.delete(sims.keys().next().value);
          sims.set(key, S);
        }
        C.sims.set(key, S);
      }
      const sc = f.unit / REF, n = C.bodies.length;
      const u = clamp(f.t / f.dur) * S.frames;
      const k0 = Math.min(S.frames - 1, Math.floor(u)), a = u - k0;

      // The ground: drawn on at the start, then giving way behind the exit (or fading out).
      if (P.guide !== 'none' && f.echo === 0 && f.path) {
        const L = f.path.length, p = f.p;
        const on = smoothstep(0, 0.1, p);
        const exitP = S.tExit / f.dur, outP = (S.tExit + S.spreadOut) / f.dur;
        let s0 = 0, s1 = L * on, alpha = 1;
        if (P.exit === 'fall') {
          // The simulation's ground may run the other way round from the path.
          const br = clamp((p - exitP) / Math.max(1e-3, outP - exitP));
          if (C.G.flip) s1 = Math.min(s1, L * (1 - br)); else s0 = L * br;
        } else alpha = 1 - smoothstep(0.86, 0.97, p);
        if (s1 - s0 > 0.5 && alpha > 0) {
          const ctx = f.ctx;
          ctx.save();
          const wPx = Math.max(1, P.groundWidth * f.unit);
          K.strokeStyle(f, wPx, 0.85 * alpha);
          if (P.guide === 'dashed') ctx.setLineDash([wPx * 3, wPx * 2.5]);
          ctx.lineCap = 'round';
          f.path.trace(ctx, s0, s1);
          ctx.stroke();
          ctx.restore();
        }
      }

      const P0 = S.poses, fade = 1 - smoothstep(0.95, 1, f.p);
      const base0 = k0 * n * STRIDE, base1 = (k0 + 1) * n * STRIDE;
      for (let i = 0; i < n; i++) {
        const o0 = base0 + i * STRIDE, o1 = base1 + i * STRIDE;
        if (!P0[o0 + 4] && !P0[o1 + 4]) continue;
        const b = C.bodies[i];
        const x = lerp(P0[o0], P0[o1], a), y = lerp(P0[o0 + 1], P0[o1 + 1], a);
        const ang = P0[o0 + 2] + TM.math.angleDelta(P0[o0 + 2], P0[o1 + 2]) * a;
        const sq = lerp(P0[o0 + 3], P0[o1 + 3], a);
        // Off-frame letters are skipped; squash keeps the base planted.
        const X = x * sc, Y = y * sc, R = Math.hypot(b.w, b.h) * sc * 0.5 * (1 + sq);
        if (X < -R || X > f.W + R || Y < -R || Y > f.H + R) continue;
        const shift = (b.h * sc * sq) / 2;
        f.drawGlyph(b.g, {
          x: X - Math.sin(ang) * shift, y: Y + Math.cos(ang) * shift,
          rot: ang, sx: C.k * (1 + sq * 0.6), sy: C.k * (1 - sq), alpha: fade,
        });
      }
    },

    looks: [
      { name: 'Concrete', bg: { type: 'solid', color: '#d9d6cf' }, layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'solid', color: '#151515' }, params: { bounce: 0.3, weight: 0.85, tumble: 0.35, groundWidth: 0.012 }, path: 'line' } },
      { name: 'Candy drop', bg: { type: 'solid', color: '#ffd6e0' }, layer: { font: { family: 'Bricolage Grotesque', weight: 800 }, type: { case: 'none' }, fill: { type: 'palette', palette: ['#ff2e88', '#7a3cff', '#ffb547', '#00a6a6'] }, params: { bounce: 0.75, weight: 0.3, tumble: 0.85, squash: 0.9, exit: 'blow', order: 'random' }, path: 'wave' } },
      { name: 'Planet', bg: { type: 'radial', color: '#1b2a4a', color2: '#05070f' }, layer: { font: { family: 'Unbounded', weight: 700 }, fill: { type: 'solid', color: '#f4f1ea' }, type: { size: 0.1 }, params: { bounce: 0.5, tumble: 0.4, exit: 'sweep', guide: 'dashed' }, path: 'circle' } },
    ],
  });
})(window.TM);
