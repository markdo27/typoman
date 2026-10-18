/* TYPOMAN engine — bézier paths: model, arc-length sampling, presets, morphing.
 *
 * Path definition (stored in scenes, normalised to the frame: x 0..1 across, y 0..1 down):
 *   { closed: boolean, nodes: [{ x, y, ix, iy, ox, oy, k }] }
 *   (ix, iy) / (ox, oy) are the in / out handle offsets relative to the anchor.
 *   k is the handle kind used by the editor: 'corner' | 'smooth' | 'mirror'.
 *
 * Sampling converts a definition into pixel space for a given W×H and builds an arc-length
 * table, so text can be laid out by distance along the curve.
 */
(function (root) {
  'use strict';
  const TM = root.TM;
  const { clamp, lerp, mod, TAU } = TM.math;

  // ───────────────────────────── sampled path ─────────────────────────────
  class SampledPath {
    /** xs, ys: point coordinates in pixels. */
    constructor(xs, ys, closed) {
      const n = xs.length;
      this.closed = !!closed && n > 2;
      this.n = n;
      this.xs = xs;
      this.ys = ys;
      const cum = new Float64Array(n + (this.closed ? 1 : 0));
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
      if (this.closed) cum[n] = cum[n - 1] + Math.hypot(xs[0] - xs[n - 1], ys[0] - ys[n - 1]);
      this.cum = cum;
      this.length = cum[cum.length - 1] || 0;

      // Per-sample unit tangents from central differences: smooth rotation along the curve.
      const tx = new Float32Array(n), ty = new Float32Array(n);
      let px = 1, py = 0;
      for (let i = 0; i < n; i++) {
        let a = i - 1, b = i + 1;
        if (this.closed) { a = mod(a, n); b = mod(b, n); } else { a = Math.max(0, a); b = Math.min(n - 1, b); }
        let dx = xs[b] - xs[a], dy = ys[b] - ys[a];
        const len = Math.hypot(dx, dy);
        if (len > 1e-9) { dx /= len; dy /= len; px = dx; py = dy; } else { dx = px; dy = py; }
        tx[i] = dx;
        ty[i] = dy;
      }
      this.tx = tx;
      this.ty = ty;
    }

    _index(s) {
      const cum = this.cum;
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= s) lo = mid; else hi = mid;
      }
      return lo;
    }

    /**
     * Point at arc length s (pixels). Open paths extrapolate past their ends along the end
     * tangent and report inside = false; closed paths wrap.
     */
    at(s) {
      const L = this.length, n = this.n;
      if (n === 0) return { x: 0, y: 0, angle: 0, tx: 1, ty: 0, nx: 0, ny: 1, inside: false, s: 0 };
      if (n === 1 || L <= 1e-9) return { x: this.xs[0], y: this.ys[0], angle: 0, tx: 1, ty: 0, nx: 0, ny: 1, inside: true, s: 0 };
      let inside = true;
      if (this.closed) s = mod(s, L);
      else if (s < 0 || s > L) {
        inside = false;
        const end = s > L;
        const i = end ? n - 1 : 0;
        const d = end ? s - L : s;
        const tx = this.tx[i], ty = this.ty[i];
        return { x: this.xs[i] + tx * d, y: this.ys[i] + ty * d, angle: Math.atan2(ty, tx), tx, ty, nx: -ty, ny: tx, inside, s };
      }
      const i = this._index(s);
      const j = i + 1 < n ? i + 1 : 0;
      const seg = this.cum[i + 1] - this.cum[i];
      const t = seg > 1e-9 ? (s - this.cum[i]) / seg : 0;
      const x = lerp(this.xs[i], this.xs[j], t), y = lerp(this.ys[i], this.ys[j], t);
      let tx = lerp(this.tx[i], this.tx[j], t), ty = lerp(this.ty[i], this.ty[j], t);
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      return { x, y, angle: Math.atan2(ty, tx), tx, ty, nx: -ty, ny: tx, inside, s };
    }

    /** Point at normalised position u (0..1 of the length). */
    atU(u) {
      return this.at(u * this.length);
    }

    /** New path with `count` points spaced evenly by arc length. */
    resample(count) {
      const n = Math.max(2, count | 0);
      const xs = new Float32Array(n), ys = new Float32Array(n);
      const span = this.closed ? this.length / n : this.length / (n - 1);
      for (let k = 0; k < n; k++) {
        const p = this.at(Math.min(k * span, this.length));
        xs[k] = p.x;
        ys[k] = p.y;
      }
      return new SampledPath(xs, ys, this.closed);
    }

    /** Trace the path into a canvas context (no stroke/fill). Optional [s0, s1] sub-range. */
    trace(ctx, s0 = 0, s1 = this.length) {
      if (this.n < 2) return;
      const step = Math.max(1, this.length / 600);
      ctx.beginPath();
      let first = true;
      for (let s = s0; s < s1 + step * 0.5; s += step) {
        const p = this.at(Math.min(s, s1));
        if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
      }
      if (this.closed && s0 <= 0 && s1 >= this.length) ctx.closePath();
    }
  }

  // ───────────────────────────── bézier sampling ─────────────────────────────
  function cubic(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  }

  function segments(def, W, H) {
    const nodes = def.nodes || [];
    const segs = [];
    const count = def.closed ? nodes.length : nodes.length - 1;
    for (let i = 0; i < count; i++) {
      const a = nodes[i], b = nodes[(i + 1) % nodes.length];
      segs.push([
        a.x * W, a.y * H,
        (a.x + (a.ox || 0)) * W, (a.y + (a.oy || 0)) * H,
        (b.x + (b.ix || 0)) * W, (b.y + (b.iy || 0)) * H,
        b.x * W, b.y * H,
      ]);
    }
    return segs;
  }

  const sampleCache = new Map();
  /** Sample a path definition into a SampledPath in pixel space (cached by content + size). */
  function sample(def, W, H) {
    if (!def || !def.nodes || def.nodes.length === 0) return new SampledPath(new Float32Array(0), new Float32Array(0), false);
    const key = W + 'x' + H + ':' + JSON.stringify(def);
    const hit = sampleCache.get(key);
    if (hit) return hit;
    const xs = [], ys = [];
    const segs = segments(def, W, H);
    if (segs.length === 0) {
      xs.push(def.nodes[0].x * W);
      ys.push(def.nodes[0].y * H);
    }
    segs.forEach((s, si) => {
      const poly = Math.hypot(s[2] - s[0], s[3] - s[1]) + Math.hypot(s[4] - s[2], s[5] - s[3]) + Math.hypot(s[6] - s[4], s[7] - s[5]);
      const steps = clamp(Math.ceil(poly / 3), 6, 400);
      for (let k = si === 0 ? 0 : 1; k <= steps; k++) {
        const t = k / steps;
        xs.push(cubic(s[0], s[2], s[4], s[6], t));
        ys.push(cubic(s[1], s[3], s[5], s[7], t));
      }
    });
    // A closed path's last sample repeats the first anchor; drop it so wrapping is seamless.
    if (def.closed && xs.length > 2) { xs.pop(); ys.pop(); }
    const out = new SampledPath(Float32Array.from(xs), Float32Array.from(ys), def.closed);
    if (sampleCache.size > 64) sampleCache.delete(sampleCache.keys().next().value);
    sampleCache.set(key, out);
    return out;
  }

  /** SVG path data in pixel space, for editor overlays. */
  function toSVG(def, W, H) {
    if (!def || !def.nodes || !def.nodes.length) return '';
    const segs = segments(def, W, H);
    const f = (v) => +v.toFixed(2);
    let d = `M${f(def.nodes[0].x * W)} ${f(def.nodes[0].y * H)}`;
    for (const s of segs) d += ` C${f(s[2])} ${f(s[3])} ${f(s[4])} ${f(s[5])} ${f(s[6])} ${f(s[7])}`;
    if (def.closed) d += ' Z';
    return d;
  }

  // ─────────────────────── building paths from points ───────────────────────
  /**
   * Smooth bézier definition through points (normalised coords) via Catmull–Rom → bézier.
   * tension 1 = standard Catmull–Rom; lower values give tighter corners.
   */
  function fromPoints(points, closed = false, tension = 1) {
    const n = points.length;
    const nodes = points.map((p, i) => {
      const prev = points[closed ? mod(i - 1, n) : Math.max(0, i - 1)];
      const next = points[closed ? mod(i + 1, n) : Math.min(n - 1, i + 1)];
      const dx = ((next.x - prev.x) / 6) * tension, dy = ((next.y - prev.y) / 6) * tension;
      const isEnd = !closed && (i === 0 || i === n - 1);
      return { x: p.x, y: p.y, ix: isEnd && i === 0 ? 0 : -dx, iy: isEnd && i === 0 ? 0 : -dy, ox: isEnd && i === n - 1 ? 0 : dx, oy: isEnd && i === n - 1 ? 0 : dy, k: 'smooth' };
    });
    return { closed, nodes };
  }

  /** Straight-segment definition (corner nodes, no handles). */
  function fromPolyline(points, closed = false) {
    return { closed, nodes: points.map((p) => ({ x: p.x, y: p.y, ix: 0, iy: 0, ox: 0, oy: 0, k: 'corner' })) };
  }

  // ───────────────────────────── presets ─────────────────────────────
  // Generators work in "unit" space (1 = the frame's shorter side, origin at the centre) and
  // are converted to normalised frame coordinates, so circles stay round at any aspect ratio.
  function unitToFrame(aspect) {
    const sx = aspect >= 1 ? 1 / aspect : 1;
    const sy = aspect >= 1 ? 1 : aspect;
    return (u, v) => ({ x: 0.5 + u * sx, y: 0.5 + v * sy });
  }
  /** Half-extent of the frame in unit space along x / y. */
  function halfExtent(aspect) {
    return { hx: aspect >= 1 ? aspect / 2 : 0.5, hy: aspect >= 1 ? 0.5 : 0.5 / aspect };
  }
  function curvePoints(fn, count, aspect) {
    const map = unitToFrame(aspect);
    const pts = [];
    for (let i = 0; i < count; i++) {
      const [u, v] = fn(i / count, i);
      pts.push(map(u, v));
    }
    return pts;
  }

  const KAPPA = 0.5522847498;
  function ellipse(aspect, rx, ry) {
    const map = unitToFrame(aspect);
    const c = map(0, 0);
    const p = map(rx, ry);
    const ex = p.x - c.x, ey = p.y - c.y;
    const kx = ex * KAPPA, ky = ey * KAPPA;
    // Start at the left so text reads clockwise over the top.
    return {
      closed: true,
      nodes: [
        { x: c.x - ex, y: c.y, ix: 0, iy: ky, ox: 0, oy: -ky, k: 'mirror' },
        { x: c.x, y: c.y - ey, ix: -kx, iy: 0, ox: kx, oy: 0, k: 'mirror' },
        { x: c.x + ex, y: c.y, ix: 0, iy: -ky, ox: 0, oy: ky, k: 'mirror' },
        { x: c.x, y: c.y + ey, ix: kx, iy: 0, ox: -kx, oy: 0, k: 'mirror' },
      ],
    };
  }

  const PRESETS = [
    ['line', 'Line', (a) => {
      const { hx } = halfExtent(a), map = unitToFrame(a);
      return fromPoints([map(-hx * 0.86, 0), map(hx * 0.86, 0)]);
    }],
    ['arc', 'Arc', (a) => {
      const { hx } = halfExtent(a), map = unitToFrame(a), w = Math.min(hx * 0.84, 0.75);
      return fromPoints([map(-w, 0.2), map(0, -0.16), map(w, 0.2)], false, 1.15);
    }],
    ['wave', 'Wave', (a) => {
      const { hx } = halfExtent(a), map = unitToFrame(a), w = hx * 0.9, amp = 0.14;
      return fromPoints([0, 1, 2, 3, 4].map((i) => map(-w + (i / 4) * 2 * w, i % 2 ? amp : -amp)), false, 1.1);
    }],
    ['scurve', 'S-curve', (a) => {
      const { hx, hy } = halfExtent(a), map = unitToFrame(a);
      return fromPoints([map(-hx * 0.8, -hy * 0.45), map(-hx * 0.2, -hy * 0.35), map(hx * 0.2, hy * 0.35), map(hx * 0.8, hy * 0.45)], false, 1.2);
    }],
    ['circle', 'Circle', (a) => ellipse(a, 0.34, 0.34)],
    ['ellipse', 'Ellipse', (a) => { const { hx } = halfExtent(a); return ellipse(a, Math.min(hx * 0.82, 0.62), 0.24); }],
    ['spiral', 'Spiral', (a) => fromPoints(curvePoints((u) => {
      const ang = u * TAU * 2.6 + Math.PI, r = 0.05 + u * 0.36;
      return [Math.cos(ang) * r, Math.sin(ang) * r];
    }, 34, a).concat([unitToFrame(a)(Math.cos(TAU * 2.6 + Math.PI) * 0.41, Math.sin(TAU * 2.6 + Math.PI) * 0.41)]))],
    ['infinity', 'Infinity', (a) => {
      const { hx } = halfExtent(a), w = Math.min(hx * 0.85, 0.7);
      return fromPoints(curvePoints((u) => {
        const t = u * TAU, d = 1 + Math.sin(t) * Math.sin(t);
        return [(w * Math.cos(t)) / d, (w * 0.9 * Math.sin(t) * Math.cos(t)) / d];
      }, 16, a), true);
    }],
    ['heart', 'Heart', (a) => fromPoints(curvePoints((u) => {
      const t = u * TAU + Math.PI;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      return [x * 0.022, y * 0.022 - 0.03];
    }, 20, a), true)],
    ['zigzag', 'Zigzag', (a) => {
      const { hx } = halfExtent(a), map = unitToFrame(a), w = hx * 0.88;
      return fromPolyline([0, 1, 2, 3, 4, 5, 6].map((i) => map(-w + (i / 6) * 2 * w, i % 2 ? 0.16 : -0.16)));
    }],
    ['loop', 'Loop', (a) => {
      const { hx } = halfExtent(a), map = unitToFrame(a), w = hx * 0.9;
      return fromPoints([map(-w, 0.18), map(-w * 0.35, 0.16), map(0.12, -0.02), map(0, -0.26), map(-0.12, -0.02), map(w * 0.35, 0.16), map(w, 0.18)], false, 1);
    }],
    ['square', 'Rounded square', (a) => {
      const map = unitToFrame(a), r = 0.3, k = 0.1;
      const pts = [[-r, -r + k], [-r + k, -r], [r - k, -r], [r, -r + k], [r, r - k], [r - k, r], [-r + k, r], [-r, r - k]];
      return fromPoints(pts.map(([u, v]) => map(u, v)), true, 0.55);
    }],
    ['diagonal', 'Diagonal', (a) => {
      const { hx, hy } = halfExtent(a), map = unitToFrame(a);
      return fromPoints([map(-hx * 0.82, hy * 0.62), map(hx * 0.82, -hy * 0.62)]);
    }],
    ['star', 'Star', (a) => fromPolyline(curvePoints((u, i) => {
      const ang = u * TAU - Math.PI / 2, r = i % 2 ? 0.16 : 0.38;
      return [Math.cos(ang) * r, Math.sin(ang) * r];
    }, 10, a), true)],
    ['ribbon', 'Ribbon', (a) => {
      const { hx } = halfExtent(a), w = hx * 0.95;
      return fromPoints(curvePoints((u) => [-w + u * 2 * w * (9 / 8), Math.sin(u * TAU * 1.125) * 0.2], 9, a), false, 1);
    }],
  ];

  const presetMap = new Map(PRESETS.map(([id, label, fn]) => [id, { id, label, fn }]));

  /** Build a path definition from a preset id for a given aspect ratio (W / H). */
  function preset(id, aspect = 16 / 9) {
    const p = presetMap.get(id) || presetMap.get('wave');
    const def = p.fn(aspect);
    def.preset = p.id;
    return def;
  }

  // ───────────────────────────── morphing ─────────────────────────────
  const resampleCache = new WeakMap();
  function resampled(sp, n) {
    let byN = resampleCache.get(sp);
    if (!byN) resampleCache.set(sp, (byN = new Map()));
    if (!byN.has(n)) byN.set(n, sp.resample(n));
    return byN.get(n);
  }

  // For two closed paths, rotate B's start index (and possibly its direction) so corresponding
  // points are as close as possible — keeps a morph from twisting through itself.
  const alignCache = new WeakMap();
  function alignment(ra, rb) {
    let byB = alignCache.get(ra);
    if (!byB) alignCache.set(ra, (byB = new WeakMap()));
    if (byB.has(rb)) return byB.get(rb);
    const n = ra.n;
    let best = { offset: 0, dir: 1 }, bestCost = Infinity;
    const stride = Math.max(1, Math.floor(n / 128));
    for (const dir of [1, -1]) {
      for (let off = 0; off < n; off++) {
        let cost = 0;
        for (let k = 0; k < n; k += stride) {
          const j = mod(off + dir * k, n);
          const dx = ra.xs[k] - rb.xs[j], dy = ra.ys[k] - rb.ys[j];
          cost += dx * dx + dy * dy;
          if (cost >= bestCost) break;
        }
        if (cost < bestCost) { bestCost = cost; best = { offset: off, dir }; }
      }
    }
    byB.set(rb, best);
    return best;
  }

  /** Interpolate two sampled paths by arc length. t = 0 → a, t = 1 → b. */
  function morph(a, b, t, n = 360) {
    if (t <= 0) return a;
    if (t >= 1) return b;
    const closed = a.closed && b.closed;
    const ra = resampled(a, n), rb = resampled(b, n);
    const al = closed ? alignment(ra, rb) : { offset: 0, dir: 1 };
    const xs = new Float32Array(n), ys = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const j = closed ? mod(al.offset + al.dir * k, n) : k;
      xs[k] = lerp(ra.xs[k], rb.xs[j], t);
      ys[k] = lerp(ra.ys[k], rb.ys[j], t);
    }
    return new SampledPath(xs, ys, closed);
  }

  /** Deep-copy a path definition. */
  function clone(def) {
    return { closed: !!def.closed, preset: def.preset, nodes: def.nodes.map((n) => ({ ...n })) };
  }

  TM.Path = {
    SampledPath,
    sample,
    toSVG,
    fromPoints,
    fromPolyline,
    preset,
    morph,
    clone,
    PRESETS: PRESETS.map(([id, label]) => ({ id, label })),
  };
})(typeof window !== 'undefined' ? window : globalThis);
