/* TYPOMAN engine — bézier paths: model, arc-length sampling, editing geometry, curve fitting,
 * presets and morphing.
 *
 * Path definition (stored in scenes, normalised to the frame: x 0..1 across, y 0..1 down):
 *   { closed: boolean, nodes: [{ x, y, ix, iy, ox, oy, k }] }
 *   (ix, iy) / (ox, oy) are the in / out handle offsets relative to the anchor.
 *   k is the handle kind used by the editor: 'corner' | 'smooth' | 'mirror'.
 *
 * Sampling converts a definition into pixel space for a given W×H and builds an arc-length
 * table, so text can be laid out by distance along the curve.
 *
 * Editing helpers (split, removeNodes, setKind, transforms, …) are pure: they return a new
 * definition and never mutate their input. Every one of them drops `preset`, which marks the
 * path as custom (see docs/ENGINE.md). Helpers that measure lengths or angles take the frame
 * `aspect` (W / H), because normalised space is stretched on non-square frames.
 */
(function (root) {
  'use strict';
  const TM = root.TM;
  const { clamp, lerp, mod, TAU, angleDelta } = TM.math;
  const EPS = 1e-9;
  const hyp = Math.hypot;

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

    /**
     * Corner-safe tangent angle at arc length s, in (−π, π] like at(s).angle: the path's
     * direction averaged over a window of `window` px centred on s (triangular weights on
     * the unwrapped angle). Where at(s).angle snaps through a sharp corner, this turns
     * evenly across the window, and through a cusp it rotates by 180° instead of flipping.
     * A window of about one glyph advance (≈ f.size) works well; 0 gives at(s).angle.
     * Closed paths wrap; open paths continue straight past their ends, as in at().
     */
    angleAt(s, window = 0) {
      const a = this._smoothAngle(s, window);
      return a == null ? this.at(s).angle : Math.atan2(Math.sin(a), Math.cos(a));
    }

    /** at(s), with tangent, normal and angle averaged over `window` px (see angleAt). */
    atSmooth(s, window = 0) {
      const p = this.at(s);
      const a = this._smoothAngle(s, window);
      if (a == null) return p;
      const tx = Math.cos(a), ty = Math.sin(a);
      p.tx = tx;
      p.ty = ty;
      p.nx = -ty;
      p.ny = tx;
      p.angle = Math.atan2(ty, tx);
      return p;
    }

    // With φ(s) the unwrapped tangent angle and Φ(s) = ∫₀ˢ∫₀ᵘ φ, the second difference
    //   Φ(s + h) − 2·Φ(s) + Φ(s − h) = ∫ (h − |u|) · φ(s + u) du   (|u| ≤ h)
    // is the triangle-weighted average of φ times h², exact for the piecewise-linear φ of
    // the samples, in O(log n) per call from two prefix sums built on first use.
    _smoothAngle(s, window) {
      const L = this.length;
      let h = window > 0 ? window / 2 : 0;
      if (this.n < 2 || L <= 1e-9 || !(h > 1e-6)) return null;
      h = Math.min(h, this.closed ? L / 4 : L);
      const T = this._angles();
      if (this.closed) s = mod(s, L);
      return (T.F2(s - h) - 2 * T.F2(s) + T.F2(s + h)) / (h * h);
    }

    _angles() {
      if (this._phi) return this._phi;
      const n = this.n, cum = this.cum, L = this.length;
      const raw = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(this.ty[i], this.tx[i]);
        raw[i] = i ? raw[i - 1] + angleDelta(raw[i - 1], a) : a;
      }
      let pos = cum, val = raw;
      if (this.closed) {
        // Three laps, [−L, 2L], so a window around any s in [0, L) stays inside the table.
        const turn = raw[n - 1] + angleDelta(raw[n - 1], raw[0]) - raw[0];
        pos = new Float64Array(3 * n + 1);
        val = new Float64Array(3 * n + 1);
        for (let c = 0; c < 3; c++) {
          for (let i = 0; i < n; i++) {
            pos[c * n + i] = cum[i] + (c - 1) * L;
            val[c * n + i] = raw[i] + (c - 1) * turn;
          }
        }
        pos[3 * n] = 2 * L;
        val[3 * n] = raw[0] + 2 * turn;
      }
      const m = pos.length;
      const F1 = new Float64Array(m), F2 = new Float64Array(m);
      for (let i = 1; i < m; i++) {
        const d = pos[i] - pos[i - 1];
        F2[i] = F2[i - 1] + d * F1[i - 1] + (d * d * (2 * val[i - 1] + val[i])) / 6;
        F1[i] = F1[i - 1] + (d * (val[i - 1] + val[i])) / 2;
      }
      const last = m - 1;
      const f2 = (x) => {
        if (x <= pos[0]) { const d = x - pos[0]; return F2[0] + F1[0] * d + (val[0] * d * d) / 2; }
        if (x >= pos[last]) { const d = x - pos[last]; return F2[last] + F1[last] * d + (val[last] * d * d) / 2; }
        let lo = 0, hi = last;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pos[mid] <= x) lo = mid; else hi = mid; }
        const d = x - pos[lo], len = pos[lo + 1] - pos[lo];
        const slope = len > 1e-12 ? (val[lo + 1] - val[lo]) / len : 0;
        return F2[lo] + F1[lo] * d + (val[lo] * d * d) / 2 + (slope * d * d * d) / 6;
      };
      return (this._phi = { F2: f2 });
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

  /** Cubic segments in pixel space: [x0, y0, c1x, c1y, c2x, c2y, x1, y1] per segment. */
  function segments(def, W = 1, H = 1) {
    const nodes = (def && def.nodes) || [];
    const segs = [];
    const count = def && def.closed ? nodes.length : nodes.length - 1;
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

  /** Point on segment array s at parameter t. */
  function segPoint(s, t) {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * s[0] + b * s[2] + c * s[4] + d * s[6], a * s[1] + b * s[3] + c * s[5] + d * s[7]];
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

  // ───────────────────────────── queries ─────────────────────────────
  /**
   * Closest point on the curve to (x, y), all in pixel space for a W×H frame.
   * Returns { seg, t, dist, x, y }: the segment index (segment i runs from node i to node
   * i + 1) and its bézier parameter, ready for split(def, seg, t). Null for an empty path.
   */
  function nearest(def, W, H, x, y) {
    if (!def || !def.nodes || !def.nodes.length) return null;
    const segs = segments(def, W, H);
    if (!segs.length) {
      const n = def.nodes[0];
      return { seg: -1, t: 0, dist: hyp(n.x * W - x, n.y * H - y), x: n.x * W, y: n.y * H };
    }
    let best = { seg: 0, t: 0, d2: Infinity };
    for (let si = 0; si < segs.length; si++) {
      const s = segs[si];
      const poly = hyp(s[2] - s[0], s[3] - s[1]) + hyp(s[4] - s[2], s[5] - s[3]) + hyp(s[6] - s[4], s[7] - s[5]);
      const N = clamp(Math.ceil(poly / 6), 8, 128);
      const dist2 = (t) => { const p = segPoint(s, t); return (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y); };
      let bt = 0, bd = Infinity;
      for (let k = 0; k <= N; k++) {
        const d = dist2(k / N);
        if (d < bd) { bd = d; bt = k / N; }
      }
      // The true minimum is at most one coarse step (≤ poly / N px) closer than the pick.
      if (Math.sqrt(bd) - poly / N > Math.sqrt(best.d2)) continue;
      // Golden-section search inside the neighbouring coarse intervals: robust even where
      // B'(t) vanishes (straight segments with retracted handles), unlike Newton.
      let lo = Math.max(0, bt - 1 / N), hi = Math.min(1, bt + 1 / N);
      const g = 0.6180339887;
      let c = hi - g * (hi - lo), e = lo + g * (hi - lo), fc = dist2(c), fe = dist2(e);
      for (let it = 0; it < 30; it++) {
        if (fc < fe) { hi = e; e = c; fe = fc; c = hi - g * (hi - lo); fc = dist2(c); }
        else { lo = c; c = e; fc = fe; e = lo + g * (hi - lo); fe = dist2(e); }
      }
      const t = fc < fe ? c : e, d = Math.min(fc, fe);
      if (d < bd) { bd = d; bt = t; }
      if (bd < best.d2) best = { seg: si, t: bt, d2: bd };
    }
    const p = segPoint(segs[best.seg], best.t);
    return { seg: best.seg, t: best.t, dist: Math.sqrt(best.d2), x: p[0], y: p[1] };
  }

  /**
   * Exact bounding box of the curve (not just its control points), in normalised units, or
   * in pixels when W, H are given: { x, y, w, h, minX, minY, maxX, maxY, cx, cy }.
   */
  function bounds(def, W = 1, H = 1) {
    const nodes = (def && def.nodes) || [];
    if (!nodes.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const add = (x, y) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };
    const segs = segments(def, W, H);
    if (!segs.length) add(nodes[0].x * W, nodes[0].y * H);
    for (const s of segs) {
      add(s[0], s[1]);
      add(s[6], s[7]);
      for (let axis = 0; axis < 2; axis++) {
        // B'(t) = 0 per axis: (−p0 + 3p1 − 3p2 + p3)t² + 2(p0 − 2p1 + p2)t + (p1 − p0) = 0
        const p0 = s[axis], p1 = s[2 + axis], p2 = s[4 + axis], p3 = s[6 + axis];
        const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
        const roots = [];
        if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) roots.push(-c / b); }
        else {
          const disc = b * b - 4 * a * c;
          if (disc >= 0) { const q = Math.sqrt(disc); roots.push((-b + q) / (2 * a), (-b - q) / (2 * a)); }
        }
        for (const t of roots) if (t > 0 && t < 1) { const p = segPoint(s, t); add(p[0], p[1]); }
      }
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }

  // ───────────────────────────── node editing ─────────────────────────────
  /** Deep-copy a path definition. */
  function clone(def) {
    return { closed: !!def.closed, preset: def.preset, nodes: def.nodes.map((n) => ({ ...n })) };
  }
  /** Copy for editing: same as clone() but marked custom. */
  function edited(def) {
    const out = clone(def);
    delete out.preset;
    return out;
  }
  const isZero = (x, y) => Math.abs(x) < 1e-7 && Math.abs(y) < 1e-7;
  const unit = (x, y) => { const l = hyp(x, y); return l > EPS ? { x: x / l, y: y / l } : null; };

  /**
   * Insert a node on segment `seg` at bézier parameter t (de Casteljau), preserving the shape
   * exactly. The new node lands at index seg + 1. A straight segment gets a corner node.
   */
  function split(def, seg, t) {
    const out = edited(def);
    const nodes = out.nodes, n = nodes.length;
    const count = out.closed ? n : n - 1;
    if (!(seg >= 0 && seg < count)) return out;
    t = clamp(+t || 0, 1e-4, 1 - 1e-4);
    const a = nodes[seg], b = nodes[(seg + 1) % n];
    const p0 = [a.x, a.y], p1 = [a.x + a.ox, a.y + a.oy], p2 = [b.x + b.ix, b.y + b.iy], p3 = [b.x, b.y];
    const L = (u, v) => [lerp(u[0], v[0], t), lerp(u[1], v[1], t)];
    const q0 = L(p0, p1), q1 = L(p1, p2), q2 = L(p2, p3);
    const r0 = L(q0, q1), r1 = L(q1, q2);
    const s = L(r0, r1);
    let node;
    if (isZero(a.ox, a.oy) && isZero(b.ix, b.iy)) {
      node = { x: s[0], y: s[1], ix: 0, iy: 0, ox: 0, oy: 0, k: 'corner' };
    } else {
      node = { x: s[0], y: s[1], ix: r0[0] - s[0], iy: r0[1] - s[1], ox: r1[0] - s[0], oy: r1[1] - s[1], k: 'smooth' };
      a.ox = q0[0] - a.x;
      a.oy = q0[1] - a.y;
      b.ix = q2[0] - b.x;
      b.iy = q2[1] - b.y;
      // Scaled handles are no longer equal in length; keep them collinear.
      if (a.k === 'mirror') a.k = 'smooth';
      if (b.k === 'mirror') b.k = 'smooth';
    }
    nodes.splice(seg + 1, 0, node);
    return out;
  }

  /**
   * Remove nodes, keeping at least two. The curve between the neighbours of a removed node is
   * refitted to the two old segments, so deleting a point keeps the shape as close as possible.
   */
  function removeNodes(def, indices, aspect = 1) {
    const out = edited(def);
    const order = Array.from(new Set(indices)).filter((i) => Number.isInteger(i) && i >= 0 && i < out.nodes.length).sort((a, b) => b - a);
    for (const i of order) {
      if (out.nodes.length <= 2) break;
      healRemove(out, i, aspect);
    }
    if (out.nodes.length < 3) out.closed = false;
    return out;
  }

  function healRemove(def, i, aspect) {
    const nodes = def.nodes, n = nodes.length;
    if ((def.closed || i > 0) && (def.closed || i < n - 1)) {
      const a = nodes[mod(i - 1, n)], m = nodes[i], b = nodes[mod(i + 1, n)];
      const straight = isZero(a.ox, a.oy) && isZero(m.ix, m.iy) && isZero(m.ox, m.oy) && isZero(b.ix, b.iy);
      if (!straight) {
        const k = aspect;
        const sA = [a.x * k, a.y, (a.x + a.ox) * k, a.y + a.oy, (m.x + m.ix) * k, m.y + m.iy, m.x * k, m.y];
        const sB = [m.x * k, m.y, (m.x + m.ox) * k, m.y + m.oy, (b.x + b.ix) * k, b.y + b.iy, b.x * k, b.y];
        const pts = [];
        for (let j = 0; j <= 12; j++) { const p = segPoint(sA, j / 12); pts.push({ x: p[0], y: p[1] }); }
        for (let j = 1; j <= 12; j++) { const p = segPoint(sB, j / 12); pts.push({ x: p[0], y: p[1] }); }
        const last = pts.length - 1;
        const t1 = unit(a.ox * k, a.oy) || unit(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const t2 = unit(b.ix * k, b.iy) || unit(pts[last - 1].x - pts[last].x, pts[last - 1].y - pts[last].y);
        if (t1 && t2) {
          let u = chordParams(pts, 0, last);
          let bez = generateBezier(pts, 0, last, u, t1, t2);
          for (let it = 0; it < 6; it++) {
            u = reparameterize(pts, 0, bez, u);
            bez = generateBezier(pts, 0, last, u, t1, t2);
          }
          a.ox = (bez[1].x - pts[0].x) / k;
          a.oy = bez[1].y - pts[0].y;
          b.ix = (bez[2].x - pts[last].x) / k;
          b.iy = bez[2].y - pts[last].y;
          if (a.k === 'mirror') a.k = 'smooth';
          if (b.k === 'mirror') b.k = 'smooth';
        }
      }
    }
    nodes.splice(i, 1);
  }

  /** Smooth handles for node i from its neighbours (unit-bisector tangent, chord / 3 lengths). */
  function autoHandles(def, i, aspect = 1) {
    const nodes = def.nodes, n = nodes.length, node = nodes[i], k = aspect;
    const prev = def.closed || i > 0 ? nodes[mod(i - 1, n)] : null;
    const next = def.closed || i < n - 1 ? nodes[mod(i + 1, n)] : null;
    let ix = 0, iy = 0, ox = 0, oy = 0;
    const ax = prev ? (prev.x - node.x) * k : 0, ay = prev ? prev.y - node.y : 0;
    const bx = next ? (next.x - node.x) * k : 0, by = next ? next.y - node.y : 0;
    const la = hyp(ax, ay), lb = hyp(bx, by);
    if (la > EPS && lb > EPS) {
      let tx = bx / lb - ax / la, ty = by / lb - ay / la;
      const tl = hyp(tx, ty);
      if (tl < 1e-6) { tx = -by / lb; ty = bx / lb; } else { tx /= tl; ty /= tl; }
      ix = (-tx * la) / 3; iy = (-ty * la) / 3;
      ox = (tx * lb) / 3; oy = (ty * lb) / 3;
    } else if (lb > EPS) {
      ox = bx / 3; oy = by / 3;
      ix = -ox; iy = -oy;
    } else if (la > EPS) {
      ix = ax / 3; iy = ay / 3;
      ox = -ix; oy = -iy;
    }
    return { ix: ix / k, iy, ox: ox / k, oy };
  }

  /**
   * Change the kind of the given nodes. 'corner' frees the handles (they stay where they are),
   * 'smooth' makes them collinear (pulling out handles if there are none), 'mirror' also
   * makes them equal in length.
   */
  function setKind(def, indices, kind, aspect = 1) {
    const out = edited(def);
    const k = aspect;
    for (const i of indices) {
      const node = out.nodes[i];
      if (!node) continue;
      if (kind !== 'smooth' && kind !== 'mirror') { node.k = 'corner'; continue; }
      const auto = autoHandles(out, i, aspect);
      const n = out.nodes.length;
      const first = !out.closed && i === 0, last = !out.closed && i === n - 1;
      let ix = node.ix * k, iy = node.iy, ox = node.ox * k, oy = node.oy;
      // An open end has one live handle; the other is dead until the path is closed.
      if (first) { ix = 0; iy = 0; }
      if (last) { ox = 0; oy = 0; }
      const li = hyp(ix, iy), lo = hyp(ox, oy);
      let tx = 0, ty = 0;
      if (lo > EPS) { tx += ox / lo; ty += oy / lo; }
      if (li > EPS) { tx -= ix / li; ty -= iy / li; }
      let tl = hyp(tx, ty);
      if (tl < 1e-6) { tx = auto.ox * k - auto.ix * k; ty = auto.oy - auto.iy; tl = hyp(tx, ty); }
      if (tl < 1e-9) { node.k = kind; continue; }
      tx /= tl; ty /= tl;
      let nli = li > EPS ? li : hyp(auto.ix * k, auto.iy);
      let nlo = lo > EPS ? lo : hyp(auto.ox * k, auto.oy);
      if (first) nli = nlo;
      if (last) nlo = nli;
      if (kind === 'mirror') nli = nlo = (nli + nlo) / 2;
      node.ix = (-tx * nli) / k; node.iy = -ty * nli;
      node.ox = (tx * nlo) / k; node.oy = ty * nlo;
      node.k = kind;
    }
    return out;
  }

  /** Retract the handles of the given nodes: sharp corners. */
  function retract(def, indices) {
    const out = edited(def);
    for (const i of indices) {
      const node = out.nodes[i];
      if (node) Object.assign(node, { ix: 0, iy: 0, ox: 0, oy: 0, k: 'corner' });
    }
    return out;
  }

  /** Double-click behaviour: a corner becomes smooth, a smooth (or mirror) node a sharp corner. */
  function toggleSmooth(def, i, aspect = 1) {
    const node = def.nodes[i];
    if (!node) return edited(def);
    return node.k === 'corner' ? setKind(def, [i], 'smooth', aspect) : retract(def, [i]);
  }

  /** A smooth curve through every anchor (fresh handles). */
  function smoothAll(def, aspect = 1) {
    const out = edited(def);
    const handles = out.nodes.map((_, i) => autoHandles(out, i, aspect));
    out.nodes.forEach((node, i) => Object.assign(node, handles[i], { k: 'smooth' }));
    return out;
  }

  /** A polyline through every anchor. */
  function cornerAll(def) {
    return retract(def, def.nodes.map((_, i) => i));
  }

  /**
   * Reverse the direction of travel. A closed path keeps its start node, so text that starts
   * there still starts there.
   */
  function reverse(def) {
    const out = edited(def);
    let nodes = out.nodes.slice().reverse();
    if (out.closed && nodes.length > 1) nodes = [nodes[nodes.length - 1]].concat(nodes.slice(0, -1));
    nodes.forEach((n) => { [n.ix, n.iy, n.ox, n.oy] = [n.ox, n.oy, n.ix, n.iy]; });
    out.nodes = nodes;
    return out;
  }

  /** Make node i the start of a closed path (where text and travel begin). */
  function setStart(def, i) {
    const out = edited(def);
    if (out.closed && i > 0 && i < out.nodes.length) out.nodes = out.nodes.slice(i).concat(out.nodes.slice(0, i));
    return out;
  }

  // ───────────────────────────── transforms ─────────────────────────────
  /** Affine map m = [a, b, c, d, e, f] (x' = a·x + c·y + e, y' = b·x + d·y + f), normalised space. */
  function transform(def, m) {
    const out = edited(def);
    const [a, b, c, d, e, f] = m;
    for (const n of out.nodes) {
      const x = n.x, y = n.y, ix = n.ix, iy = n.iy, ox = n.ox, oy = n.oy;
      n.x = a * x + c * y + e;
      n.y = b * x + d * y + f;
      n.ix = a * ix + c * iy;
      n.iy = b * ix + d * iy;
      n.ox = a * ox + c * oy;
      n.oy = b * ox + d * oy;
    }
    return out;
  }

  /** Move by (dx, dy) in normalised units. */
  function translate(def, dx, dy) {
    return transform(def, [1, 0, 0, 1, dx, dy]);
  }

  /** Scale about (cx, cy) (default: the path's own centre). */
  function scale(def, sx, sy = sx, cx, cy) {
    if (cx == null || cy == null) { const b = bounds(def); cx = b ? b.cx : 0.5; cy = b ? b.cy : 0.5; }
    return transform(def, [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy]);
  }

  /** Rotate by `angle` radians (clockwise on screen) about (cx, cy), undistorted on any aspect. */
  function rotate(def, angle, aspect = 1, cx, cy) {
    if (cx == null || cy == null) { const b = bounds(def); cx = b ? b.cx : 0.5; cy = b ? b.cy : 0.5; }
    const co = Math.cos(angle), si = Math.sin(angle);
    const a = co, b = si * aspect, c = -si / aspect, d = co;
    return transform(def, [a, b, c, d, cx - a * cx - c * cy, cy - b * cx - d * cy]);
  }

  /** Flip in place: axis 'x' (or 'h') mirrors left↔right, 'y' (or 'v') top↔bottom. */
  function mirror(def, axis = 'x', about) {
    const b = bounds(def);
    if (axis === 'y' || axis === 'v') {
      const c = about != null ? about : b ? b.cy : 0.5;
      return transform(def, [1, 0, 0, -1, 0, 2 * c]);
    }
    const c = about != null ? about : b ? b.cx : 0.5;
    return transform(def, [-1, 0, 0, 1, 2 * c, 0]);
  }

  /**
   * Scale uniformly (undistorted) and centre so the curve fills the frame, leaving `margin`
   * (a fraction of the frame's shorter side) clear on every edge.
   */
  function fitToFrame(def, aspect = 16 / 9, margin = 0.1) {
    const b = bounds(def);
    if (!b) return edited(def);
    const u = Math.min(aspect, 1), m = margin * u;
    const bw = b.w * aspect, bh = b.h; // pixel-proportional units, frame = aspect × 1
    const kx = bw > 1e-6 ? (aspect - 2 * m) / bw : Infinity;
    const ky = bh > 1e-6 ? (1 - 2 * m) / bh : Infinity;
    let k = Math.min(kx, ky);
    if (!Number.isFinite(k)) k = 1;
    return transform(def, [k, 0, 0, k, 0.5 - k * b.cx, 0.5 - k * b.cy]);
  }

  /**
   * Carry a path to a frame of a different aspect ratio without distorting it: proportions
   * are kept relative to the shorter side, and the result is shrunk (about the frame centre)
   * only if it would leave the frame. Use when resizing a scene with a custom path.
   */
  function reaspect(def, fromAspect, toAspect, margin = 0.04) {
    if (!def || !def.nodes) return def;
    if (def.preset && presetMap.has(def.preset)) return preset(def.preset, toAspect);
    if (!(fromAspect > 0) || !(toAspect > 0) || Math.abs(fromAspect - toAspect) < 1e-6) return clone(def);
    const sf = scaleOf(fromAspect), st = scaleOf(toAspect);
    const kx = st.sx / sf.sx, ky = st.sy / sf.sy;
    const out = transform(def, [kx, 0, 0, ky, 0.5 * (1 - kx), 0.5 * (1 - ky)]);
    const b = bounds(out);
    if (!b) return out;
    const u = Math.min(toAspect, 1), mx = (margin * u) / toAspect, my = margin * u;
    const over = Math.max((0.5 - b.minX) / (0.5 - mx), (b.maxX - 0.5) / (0.5 - mx), (0.5 - b.minY) / (0.5 - my), (b.maxY - 0.5) / (0.5 - my));
    return over > 1 ? transform(out, [1 / over, 0, 0, 1 / over, 0.5 * (1 - 1 / over), 0.5 * (1 - 1 / over)]) : out;
  }

  // ───────────────────────────── curve fitting ─────────────────────────────
  // Freehand strokes → Ramer–Douglas–Peucker → Schneider's least-squares bézier fit
  // ("An Algorithm for Automatically Fitting Digitized Curves", Graphics Gems, 1990),
  // with corner detection so a drawn "V" keeps its point while a drawn "U" stays round.

  /** Ramer–Douglas–Peucker: drop points within `epsilon` of the simplified polyline. */
  function simplify(points, epsilon = 1) {
    const n = points.length;
    if (n < 3) return points.slice();
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const eps2 = epsilon * epsilon;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const ax = points[a].x, ay = points[a].y, dx = points[b].x - ax, dy = points[b].y - ay;
      const l2 = dx * dx + dy * dy;
      let maxD = -1, idx = -1;
      for (let i = a + 1; i < b; i++) {
        const px = points[i].x - ax, py = points[i].y - ay;
        let d;
        if (l2 < 1e-18) d = px * px + py * py;
        else {
          const t = clamp((px * dx + py * dy) / l2, 0, 1);
          const ex = px - t * dx, ey = py - t * dy;
          d = ex * ex + ey * ey;
        }
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (idx > 0 && maxD > eps2) {
        keep[idx] = 1;
        stack.push([a, idx], [idx, b]);
      }
    }
    return points.filter((_, i) => keep[i]);
  }

  function bezPt(b, t) {
    const u = 1 - t, a = u * u * u, c = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
    return { x: a * b[0].x + c * b[1].x + d * b[2].x + e * b[3].x, y: a * b[0].y + c * b[1].y + d * b[2].y + e * b[3].y };
  }
  function bezD1(b, t) {
    const u = 1 - t, a = 3 * u * u, c = 6 * u * t, d = 3 * t * t;
    return { x: a * (b[1].x - b[0].x) + c * (b[2].x - b[1].x) + d * (b[3].x - b[2].x), y: a * (b[1].y - b[0].y) + c * (b[2].y - b[1].y) + d * (b[3].y - b[2].y) };
  }
  function bezD2(b, t) {
    const u = 1 - t;
    return { x: 6 * u * (b[2].x - 2 * b[1].x + b[0].x) + 6 * t * (b[3].x - 2 * b[2].x + b[1].x), y: 6 * u * (b[2].y - 2 * b[1].y + b[0].y) + 6 * t * (b[3].y - 2 * b[2].y + b[1].y) };
  }

  /** de Casteljau at t = ½: two béziers tracing the same curve. */
  function halveBez(b) {
    const m = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    const q0 = m(b[0], b[1]), q1 = m(b[1], b[2]), q2 = m(b[2], b[3]);
    const r0 = m(q0, q1), r1 = m(q1, q2), s = m(r0, r1);
    return [[b[0], q0, r0, s], [s, r1, q2, b[3]]];
  }

  function chordParams(pts, first, last) {
    const u = [0];
    for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + hyp(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const L = u[u.length - 1];
    return L > EPS ? u.map((v) => v / L) : u.map((_, i) => i / Math.max(1, u.length - 1));
  }

  /** Least-squares handle lengths along fixed end tangents t1 (forward) and t2 (backward). */
  function generateBezier(pts, first, last, u, t1, t2) {
    const p0 = pts[first], p3 = pts[last];
    let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
    for (let i = 0; i < u.length; i++) {
      const t = u[i], mt = 1 - t;
      const b0 = mt * mt * mt, b1 = 3 * t * mt * mt, b2 = 3 * t * t * mt, b3 = t * t * t;
      const a1x = t1.x * b1, a1y = t1.y * b1, a2x = t2.x * b2, a2y = t2.y * b2;
      c00 += a1x * a1x + a1y * a1y;
      c01 += a1x * a2x + a1y * a2y;
      c11 += a2x * a2x + a2y * a2y;
      const p = pts[first + i];
      const rx = p.x - (p0.x * (b0 + b1) + p3.x * (b2 + b3)), ry = p.y - (p0.y * (b0 + b1) + p3.y * (b2 + b3));
      x0 += a1x * rx + a1y * ry;
      x1 += a2x * rx + a2y * ry;
    }
    const det = c00 * c11 - c01 * c01;
    let al = 0, ar = 0;
    if (Math.abs(det) > 1e-12) {
      al = (x0 * c11 - x1 * c01) / det;
      ar = (c00 * x1 - c01 * x0) / det;
    }
    const seg = hyp(p3.x - p0.x, p3.y - p0.y);
    // Degenerate or wild solutions fall back to the Wu–Barsky heuristic (a third of the chord).
    if (!(al > seg * 1e-6) || !(ar > seg * 1e-6) || al > seg * 3 || ar > seg * 3) al = ar = seg / 3;
    return [p0, { x: p0.x + t1.x * al, y: p0.y + t1.y * al }, { x: p3.x + t2.x * ar, y: p3.y + t2.y * ar }, p3];
  }

  function maxError(pts, first, last, bez, u) {
    let maxD = 0, at = (first + last) >> 1;
    for (let i = first + 1; i < last; i++) {
      const p = bezPt(bez, u[i - first]);
      const d = (p.x - pts[i].x) * (p.x - pts[i].x) + (p.y - pts[i].y) * (p.y - pts[i].y);
      if (d >= maxD) { maxD = d; at = i; }
    }
    return [maxD, at];
  }

  function reparameterize(pts, first, bez, u) {
    return u.map((t, i) => {
      const p = pts[first + i], q = bezPt(bez, t), d1 = bezD1(bez, t), d2 = bezD2(bez, t);
      const ex = q.x - p.x, ey = q.y - p.y;
      const num = ex * d1.x + ey * d1.y, den = d1.x * d1.x + d1.y * d1.y + ex * d2.x + ey * d2.y;
      return Math.abs(den) > 1e-12 ? clamp(t - num / den, 0, 1) : t;
    });
  }

  function fitRun(pts, first, last, t1, t2, tol2, out, depth) {
    const p0 = pts[first], p3 = pts[last];
    if (last - first === 1) {
      const d = hyp(p3.x - p0.x, p3.y - p0.y) / 3;
      out.push([p0, { x: p0.x + t1.x * d, y: p0.y + t1.y * d }, { x: p3.x + t2.x * d, y: p3.y + t2.y * d }, p3]);
      return;
    }
    let u = chordParams(pts, first, last);
    let bez = generateBezier(pts, first, last, u, t1, t2);
    let [err, at] = maxError(pts, first, last, bez, u);
    if (err < tol2 || depth > 24) { out.push(bez); return; }
    if (err < tol2 * 16) {
      for (let k = 0; k < 10; k++) {
        const u2 = reparameterize(pts, first, bez, u);
        bez = generateBezier(pts, first, last, u2, t1, t2);
        [err, at] = maxError(pts, first, last, bez, u2);
        if (err < tol2) { out.push(bez); return; }
        u = u2;
      }
    }
    at = clamp(at, first + 1, last - 1);
    const a = pts[at - 1], b = pts[at + 1], c = pts[at];
    const tc = unit(a.x - b.x, a.y - b.y) || unit(a.x - c.x, a.y - c.y) || { x: -t1.x, y: -t1.y };
    fitRun(pts, first, at, t1, tc, tol2, out, depth + 1);
    fitRun(pts, at, last, { x: -tc.x, y: -tc.y }, t2, tol2, out, depth + 1);
  }

  /** The point `d` along the polyline from index i, walking forward (dir 1) or back (−1). */
  function walk(pts, i, d, dir, closed) {
    const n = pts.length;
    let acc = 0, j = i;
    for (let guard = 0; guard < n; guard++) {
      let k = j + dir;
      if (closed) k = mod(k, n);
      else if (k < 0 || k >= n) break;
      if (k === i) break;
      const seg = hyp(pts[k].x - pts[j].x, pts[k].y - pts[j].y);
      if (acc + seg >= d && seg > EPS) {
        const t = (d - acc) / seg;
        return { x: pts[j].x + (pts[k].x - pts[j].x) * t, y: pts[j].y + (pts[k].y - pts[j].y) * t };
      }
      acc += seg;
      j = k;
    }
    return pts[j];
  }

  function polyLength(pts, closed) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += hyp(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (closed && pts.length > 2) L += hyp(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
    return L;
  }

  function smoothPolyline(pts, closed) {
    const n = pts.length;
    if (n < 3) return pts.slice();
    return pts.map((p, i) => {
      if (!closed && (i === 0 || i === n - 1)) return p;
      const a = pts[mod(i - 1, n)], b = pts[mod(i + 1, n)];
      return { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 };
    });
  }

  /**
   * Indices where the stroke turns sharply (one per corner). A corner turns by more than the
   * limit within `win` of arc length, and keeps most of that turn within win / 2; a tight arc
   * turns half as much over half the distance, so it is not mistaken for a corner.
   */
  function findCorners(pts, closed, win, cosLimit) {
    const n = pts.length;
    if (cosLimit <= -1 || n < 5) return [];
    const total = polyLength(pts, closed);
    const score = new Float64Array(n);
    const turn = (p, a, b) => {
      const din = unit(p.x - a.x, p.y - a.y), dout = unit(b.x - p.x, b.y - p.y);
      return din && dout ? Math.acos(clamp(din.x * dout.x + din.y * dout.y, -1, 1)) : 0;
    };
    const limit = Math.acos(clamp(cosLimit, -1, 1));
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) s += hyp(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (!closed && (s < win || total - s < win)) continue;
      const p = pts[i];
      const t1 = turn(p, walk(pts, i, win, -1, closed), walk(pts, i, win, 1, closed));
      if (t1 <= limit) continue;
      const t2 = turn(p, walk(pts, i, win / 2, -1, closed), walk(pts, i, win / 2, 1, closed));
      if (t2 > 0.7 * t1) score[i] = t1;
    }
    // One corner per cluster of sharp samples: its sharpest one.
    const out = [];
    let i = 0;
    while (i < n) {
      if (!score[i]) { i++; continue; }
      let best = i;
      while (i < n && score[i]) { if (score[i] > score[best]) best = i; i++; }
      out.push(best);
    }
    if (closed && out.length > 1 && score[0] && score[n - 1]) {
      // The cluster wraps the seam: keep the sharper end.
      const a = out[0], b = out[out.length - 1];
      if (score[a] >= score[b]) out.pop(); else out.shift();
    }
    return out;
  }

  /**
   * Fit smooth cubic béziers to a polyline, e.g. a freehand stroke.
   *   points     [{ x, y }] in any isotropic units (pixels)
   *   tolerance  maximum deviation from the input, same units
   *   opts       { closed, corner: turn in degrees that makes a corner (default 60, 180 = never),
   *                smooth: smoothing passes between corners (default 0), W, H: divide the output by these
   *                to get a normalised definition }
   * Returns a path definition, or null for fewer than two distinct points.
   */
  function fit(points, tolerance = 2, opts = {}) {
    const tol = Math.max(1e-6, +tolerance || 2);
    let pts = [];
    for (const p of points || []) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const q = pts[pts.length - 1];
      if (!q || hyp(p.x - q.x, p.y - q.y) > tol * 0.02) pts.push({ x: p.x, y: p.y });
    }
    let closed = !!opts.closed;
    if (closed) while (pts.length > 3 && hyp(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) <= tol * 0.02) pts.pop();
    if (pts.length < 2) return null;
    if (pts.length < 4) closed = false;
    const W = opts.W || 1, H = opts.H || 1;
    const win = opts.window || tol * 4;
    const cosLimit = Math.cos((clamp(opts.corner != null ? opts.corner : 60, 1, 180) * Math.PI) / 180);
    let corners = findCorners(pts, closed, win, cosLimit);

    // Split the stroke into runs that start and end on nodes.
    const runs = [];
    let startCorner = false;
    if (closed && corners.length) {
      const c0 = corners[0], n = pts.length;
      pts = pts.slice(c0).concat(pts.slice(0, c0));
      corners = corners.map((c) => mod(c - c0, n)).sort((a, b) => a - b);
      const ring = pts.concat([pts[0]]);
      const cuts = corners.concat([n]);
      for (let i = 0; i < cuts.length - 1; i++) runs.push({ pts: ring.slice(cuts[i], cuts[i + 1] + 1), corner: true });
      startCorner = true;
    } else if (closed) {
      runs.push({ pts: pts.concat([pts[0]]), corner: false, ring: true });
    } else {
      const b = [0].concat(corners, [pts.length - 1]);
      for (let i = 0; i < b.length - 1; i++) runs.push({ pts: pts.slice(b[i], b[i + 1] + 1), corner: i > 0 });
    }

    const beziers = []; // { bez, corner }: corner = the bézier starts on a corner node
    for (const run of runs) {
      // Smooth pointer jitter between corners only, so corners stay sharp.
      let src = run.pts;
      for (let k = 0; k < (opts.smooth | 0); k++) {
        src = run.ring ? smoothPolyline(src.slice(0, -1), true) : smoothPolyline(src, false);
        if (run.ring) src.push(src[0]);
      }
      let rp = simplify(src, tol * 0.3);
      if (rp.length < 2) continue;
      const last = rp.length - 1;
      let t1, t2;
      if (run.ring) {
        // Smooth seam: one tangent through the start point, from both sides of the loop.
        const loop = rp.slice(0, -1);
        const a = walk(loop, 0, win, -1, true), b = walk(loop, 0, win, 1, true);
        t1 = unit(b.x - a.x, b.y - a.y) || { x: 1, y: 0 };
        t2 = { x: -t1.x, y: -t1.y };
      } else {
        const a = walk(rp, 0, win, 1, false), b = walk(rp, last, win, -1, false);
        t1 = unit(a.x - rp[0].x, a.y - rp[0].y) || { x: 1, y: 0 };
        t2 = unit(b.x - rp[last].x, b.y - rp[last].y) || { x: -t1.x, y: -t1.y };
      }
      const out = [];
      fitRun(rp, 0, last, t1, t2, tol * tol, out, 0);
      out.forEach((bez, i) => beziers.push({ bez, corner: i === 0 && run.corner }));
    }
    if (!beziers.length) return null;
    // A closed path needs three nodes (scenes open two-node loops): halve the longest pieces.
    while (closed && beziers.length < 3) {
      let li = 0, lm = -1;
      beziers.forEach(({ bez }, i) => { const l = hyp(bez[3].x - bez[0].x, bez[3].y - bez[0].y) + hyp(bez[1].x - bez[0].x, bez[1].y - bez[0].y) + hyp(bez[3].x - bez[2].x, bez[3].y - bez[2].y); if (l > lm) { lm = l; li = i; } });
      const [b0, b1] = halveBez(beziers[li].bez);
      beziers.splice(li, 1, { bez: b0, corner: beziers[li].corner }, { bez: b1, corner: false });
    }

    const nodes = beziers.map(({ bez, corner }, i) => {
      const prev = i > 0 ? beziers[i - 1].bez : closed ? beziers[beziers.length - 1].bez : null;
      return {
        x: bez[0].x / W,
        y: bez[0].y / H,
        ix: prev ? (prev[2].x - bez[0].x) / W : 0,
        iy: prev ? (prev[2].y - bez[0].y) / H : 0,
        ox: (bez[1].x - bez[0].x) / W,
        oy: (bez[1].y - bez[0].y) / H,
        k: corner || (i === 0 && startCorner) ? 'corner' : 'smooth',
      };
    });
    if (!closed) {
      const lb = beziers[beziers.length - 1].bez;
      nodes.push({ x: lb[3].x / W, y: lb[3].y / H, ix: (lb[2].x - lb[3].x) / W, iy: (lb[2].y - lb[3].y) / H, ox: 0, oy: 0, k: 'smooth' });
    }
    return { closed: closed && nodes.length > 2, nodes };
  }

  // ───────────────────────────── presets ─────────────────────────────
  // Generators work in "unit" space (1 = the frame's shorter side, origin at the centre) and
  // are converted to normalised frame coordinates, so circles stay round at any aspect ratio.
  function scaleOf(aspect) {
    return { sx: aspect >= 1 ? 1 / aspect : 1, sy: aspect >= 1 ? 1 : aspect };
  }
  function unitToFrame(aspect) {
    const { sx, sy } = scaleOf(aspect);
    return (u, v) => ({ x: 0.5 + u * sx, y: 0.5 + v * sy });
  }
  /** A definition built in unit space → normalised frame coordinates. */
  function toFrame(def, aspect) {
    const { sx, sy } = scaleOf(aspect);
    return transform(def, [sx, 0, 0, sy, 0.5, 0.5]);
  }
  /** Bézier nodes written in unit space: [u, v, iu, iv, ou, ov, kind]. */
  function unitNodes(aspect, list, closed) {
    return toFrame({ closed, nodes: list.map(([x, y, ix = 0, iy = 0, ox = 0, oy = 0, k = 'smooth']) => ({ x, y, ix, iy, ox, oy, k })) }, aspect);
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
  /** Fit a parametric unit-space curve fn(u) → [x, y], u ∈ [0, 1], with few clean nodes. */
  function fitCurve(fn, aspect, closed, samples = 240, tol = 0.0025) {
    const pts = [];
    const count = closed ? samples : samples + 1;
    for (let i = 0; i < count; i++) {
      const [x, y] = fn(i / samples);
      pts.push({ x, y });
    }
    return toFrame(fit(pts, tol, { closed, corner: 180, window: tol * 8 }), aspect);
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
      // Tall frames get a flatter arch, so text on it does not pile up at the crown.
      const { hx } = halfExtent(a), map = unitToFrame(a), w = Math.min(hx * 0.84, 0.75), k = a < 0.8 ? 0.7 : 1;
      return fromPoints([map(-w, 0.2 * k), map(0, -0.16 * k), map(w, 0.2 * k)], false, 1.15);
    }],
    ['wave', 'Wave', (a) => {
      // One full wave on tall frames, two on wide ones.
      const { hx } = halfExtent(a), map = unitToFrame(a), w = hx * 0.9, amp = 0.14, n = a < 0.8 ? 3 : 5;
      return fromPoints(Array.from({ length: n }, (_, i) => map(-w + (i / (n - 1)) * 2 * w, i % 2 ? amp : -amp)), false, 1.1);
    }],
    ['scurve', 'S-curve', (a) => {
      const { hx, hy } = halfExtent(a), map = unitToFrame(a);
      return fromPoints([map(-hx * 0.8, -hy * 0.45), map(-hx * 0.2, -hy * 0.35), map(hx * 0.2, hy * 0.35), map(hx * 0.8, hy * 0.45)], false, 1.2);
    }],
    ['swoosh', 'Swoosh', (a) => {
      // A brush flick: a short dip, then one long rising sweep that eases out at the top.
      const { hx, hy } = halfExtent(a), w = hx * 0.88, v = Math.min(0.3, hy * 0.62);
      return unitNodes(a, [
        [-w, -v * 0.3, 0, 0, w * 0.1, v * 0.62, 'smooth'],
        [-w * 0.42, v * 0.66, -w * 0.3, 0, w * 0.5, 0, 'smooth'],
        [w, -v * 0.9, -w * 0.58, v * 0.42, 0, 0, 'smooth'],
      ], false);
    }],
    ['diagonal', 'Diagonal', (a) => {
      const { hx, hy } = halfExtent(a), map = unitToFrame(a);
      return fromPoints([map(-hx * 0.82, hy * 0.62), map(hx * 0.82, -hy * 0.62)]);
    }],
    ['bounce', 'Bounce', (a) => {
      // A dropped ball: parabolic arcs (exact as cubics) losing height at each contact.
      const { hx, hy } = halfExtent(a);
      const w = hx * 0.86, h0 = Math.min(0.44, hy * 0.8), e = 0.45;
      const heights = (a < 0.8 ? [1, e, e * e] : [1, e, e * e, e * e * e]).map((k) => h0 * k);
      const spans = heights.map((h, i) => (i === 0 ? 1 : 2) * Math.sqrt(h));
      const k = (2 * w) / spans.reduce((s, v) => s + v, 0);
      const floor = h0 / 2;
      let x = -w + spans[0] * k;
      const d0 = spans[0] * k;
      const list = [[-w, floor - h0, -d0 / 3, 0, d0 / 3, 0, 'smooth']];
      for (let i = 1; i <= heights.length; i++) {
        const din = spans[i - 1] * k, hin = heights[i - 1];
        const ix = -din / 3, iy = i === 1 ? (-2 * hin) / 3 : (-4 * hin) / 3;
        const dout = i < heights.length ? spans[i] * k : 0, hout = i < heights.length ? heights[i] : 0;
        list.push([x, floor, ix, iy, dout / 3, (-4 * hout) / 3, 'corner']);
        x += dout;
      }
      return unitNodes(a, list, false);
    }],
    ['zigzag', 'Zigzag', (a) => {
      const { hx } = halfExtent(a), map = unitToFrame(a), w = hx * 0.88, n = a < 0.8 ? 5 : 7;
      return fromPolyline(Array.from({ length: n }, (_, i) => map(-w + (i / (n - 1)) * 2 * w, i % 2 ? 0.16 : -0.16)));
    }],
    ['ribbon', 'Ribbon', (a) => {
      const { hx } = halfExtent(a), w = hx * 0.95;
      return fromPoints(curvePoints((u) => [-w + u * 2 * w * (9 / 8), Math.sin(u * TAU * 1.125) * 0.2], 9, a), false, 1);
    }],
    ['loop', 'Loop', (a) => {
      const { hx } = halfExtent(a), map = unitToFrame(a), w = hx * 0.9;
      return fromPoints([map(-w, 0.18), map(-w * 0.35, 0.16), map(0.12, -0.02), map(0, -0.26), map(-0.12, -0.02), map(w * 0.35, 0.16), map(w, 0.18)], false, 1);
    }],
    ['double-loop', 'Double loop', (a) => {
      // A prolate cycloid: the line rolls forward and throws two loops over the top.
      const { hx, hy } = halfExtent(a), w = hx * 0.86, c = w / TAU, b = Math.min(c * 2.3, hy * 0.62);
      return fitCurve((u) => {
        const t = -Math.PI + u * 4 * Math.PI;
        return [c * (t - Math.PI) - b * Math.sin(t), -b * Math.cos(t) * 0.92];
      }, a, false);
    }],
    ['spiral', 'Spiral', (a) => fromPoints(curvePoints((u) => {
      const ang = u * TAU * 2.6 + Math.PI, r = 0.05 + u * 0.36;
      return [Math.cos(ang) * r, Math.sin(ang) * r];
    }, 34, a).concat([unitToFrame(a)(Math.cos(TAU * 2.6 + Math.PI) * 0.41, Math.sin(TAU * 2.6 + Math.PI) * 0.41)]))],
    ['circle', 'Circle', (a) => ellipse(a, 0.34, 0.34)],
    ['ellipse', 'Ellipse', (a) => { const { hx } = halfExtent(a); return ellipse(a, Math.min(hx * 0.82, 0.62), 0.24); }],
    ['orbit', 'Orbit', (a) => {
      // A ring seen at an angle: a flat ellipse tilted like a planet's orbit.
      const { hx } = halfExtent(a), rx = Math.min(hx * 0.86, 0.68), ry = 0.15, k = KAPPA;
      const flat = { closed: true, nodes: [
        { x: -rx, y: 0, ix: 0, iy: ry * k, ox: 0, oy: -ry * k, k: 'mirror' },
        { x: 0, y: -ry, ix: -rx * k, iy: 0, ox: rx * k, oy: 0, k: 'mirror' },
        { x: rx, y: 0, ix: 0, iy: -ry * k, ox: 0, oy: ry * k, k: 'mirror' },
        { x: 0, y: ry, ix: rx * k, iy: 0, ox: -rx * k, oy: 0, k: 'mirror' },
      ] };
      return toFrame(rotate(flat, -0.3, 1, 0, 0), a);
    }],
    ['frame', 'Frame', (a) => {
      // A rounded rectangle inset from the frame edge: a marquee around the composition.
      const { hx, hy } = halfExtent(a), m = 0.085;
      const L = -hx + m, R = hx - m, T = -hy + m, B = hy - m;
      const r = Math.min(0.12, (R - L) / 2, (B - T) / 2), k = r * KAPPA;
      return unitNodes(a, [
        [L + r, T, -k, 0, 0, 0], [R - r, T, 0, 0, k, 0],
        [R, T + r, 0, -k, 0, 0], [R, B - r, 0, 0, 0, k],
        [R - r, B, k, 0, 0, 0], [L + r, B, 0, 0, -k, 0],
        [L, B - r, 0, k, 0, 0], [L, T + r, 0, 0, 0, -k],
      ], true);
    }],
    ['square', 'Rounded square', (a) => {
      const map = unitToFrame(a), r = 0.3, k = 0.1;
      const pts = [[-r, -r + k], [-r + k, -r], [r - k, -r], [r, -r + k], [r, r - k], [r - k, r], [-r + k, r], [-r, r - k]];
      return fromPoints(pts.map(([u, v]) => map(u, v)), true, 0.55);
    }],
    ['blob', 'Blob', (a) => fromPoints(curvePoints((u) => {
      const ang = u * TAU + Math.PI;
      const r = 0.3 * (1 + 0.13 * Math.sin(3 * ang + 0.7) + 0.07 * Math.cos(5 * ang + 1.9));
      return [Math.cos(ang) * r * 1.12, Math.sin(ang) * r];
    }, 7, a), true, 1)],
    ['heart', 'Heart', (a) => fromPoints(curvePoints((u) => {
      const t = u * TAU + Math.PI;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      return [x * 0.022, y * 0.022 - 0.03];
    }, 20, a), true)],
    ['star', 'Star', (a) => fromPolyline(curvePoints((u, i) => {
      const ang = u * TAU - Math.PI / 2, r = i % 2 ? 0.16 : 0.38;
      return [Math.cos(ang) * r, Math.sin(ang) * r];
    }, 10, a), true)],
    ['infinity', 'Infinity', (a) => {
      const { hx } = halfExtent(a), w = Math.min(hx * 0.85, 0.7);
      return fromPoints(curvePoints((u) => {
        const t = u * TAU, d = 1 + Math.sin(t) * Math.sin(t);
        return [(w * Math.cos(t)) / d, (w * 0.9 * Math.sin(t) * Math.cos(t)) / d];
      }, 16, a), true);
    }],
    ['lissajous', 'Lissajous', (a) => {
      // The 3 : 2 Lissajous knot: one closed line that crosses itself seven times.
      const { hx, hy } = halfExtent(a), w = Math.min(hx * 0.8, 0.62), v = Math.min(a < 0.8 ? 0.46 : 0.34, hy * 0.7);
      return fitCurve((u) => {
        const t = u * TAU;
        return [-w * Math.cos(3 * t), -v * Math.sin(2 * t)];
      }, a, true, 360);
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
    // queries
    segments,
    nearest,
    bounds,
    // node editing (pure: each returns a new, custom definition)
    split,
    removeNodes,
    setKind,
    retract,
    toggleSmooth,
    smoothAll,
    cornerAll,
    autoHandles,
    reverse,
    setStart,
    // transforms
    transform,
    translate,
    scale,
    rotate,
    mirror,
    fitToFrame,
    reaspect,
    // freehand
    simplify,
    fit,
  };
})(typeof window !== 'undefined' ? window : globalThis);
