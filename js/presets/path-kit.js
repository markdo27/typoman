/* TYPOMAN presets — path kit: helpers shared by the path & loop family (preset team A).
 * Loaded before wave / path-land / path-draw / orbit / tunnel / lens. Registers no preset.
 *
 *   PathKit.place(path, s, w)            point at arc length s; angle from the chord across width w
 *   PathKit.shape(path)                  { cx, cy, rmin, rmax }: arc-length centroid and radii (cached)
 *   PathKit.tile(f, line, length, o)     glyph slots that tile one line of text along a length
 *   PathKit.affine(f, ax, ay, bx, by)    drawGlyph options for an arbitrary 2×2 glyph matrix
 *   PathKit.weights(f, amount)           variable-weight span for the layer's font, or null
 *   PathKit.quantWeight(w)               weight snapped to a step, so canvas font strings stay cached
 *   PathKit.keyOf(obj)                   stable small id for an object (cache keys)
 *   PathKit.strokeStyle(f, ...)          shared stroke setup for guides, rings and pens
 */
(function (TM) {
  'use strict';
  const { clamp } = TM.math;

  /**
   * Point at arc length s. The angle comes from the chord between s - w/2 and s + w/2, which is
   * what a glyph of advance w actually spans: steadier than the point tangent on tight curves and
   * corners (stars, zigzags), so letters don't snap round at a vertex.
   */
  function place(path, s, w) {
    const p = path.at(s);
    if (w > 0.5) {
      const a = path.at(s - w / 2), b = path.at(s + w / 2);
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx * dx + dy * dy > 1e-6) {
        const ang = Math.atan2(dy, dx);
        p.angle = ang;
        p.tx = Math.cos(ang);
        p.ty = Math.sin(ang);
        p.nx = -p.ty;
        p.ny = p.tx;
      }
    }
    return p;
  }

  const shapes = new WeakMap();
  /** Arc-length centroid of a sampled path plus its nearest / farthest distance from it. */
  function shape(path) {
    let s = shapes.get(path);
    if (s) return s;
    const n = path.n, xs = path.xs, ys = path.ys;
    let sx = 0, sy = 0, sw = 0;
    const segs = path.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      const w = Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
      sx += (xs[i] + xs[j]) * 0.5 * w;
      sy += (ys[i] + ys[j]) * 0.5 * w;
      sw += w;
    }
    const cx = sw > 0 ? sx / sw : n ? xs[0] : 0;
    const cy = sw > 0 ? sy / sw : n ? ys[0] : 0;
    let rmin = Infinity, rmax = 0;
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(xs[i] - cx, ys[i] - cy);
      if (r < rmin) rmin = r;
      if (r > rmax) rmax = r;
    }
    s = { cx, cy, rmin: Number.isFinite(rmin) ? rmin : 0, rmax };
    shapes.set(path, s);
    return s;
  }

  /**
   * Slots that tile `line` (a layout line) along `length` px, kerning kept from the layout.
   * o: { closed, gap (px between repeats), sep, sepW, repeat (bool), fitMargin (0..1), layout }
   * Returns { items:[{ g, off, w }], unit, reps, k } where off is the slot centre from the start
   * of a repeat (already multiplied by k), unit the repeat length and k a down-scale applied when
   * the line is longer than the path. On closed paths the gap stretches so a whole number of
   * repeats closes exactly, with no seam where the path joins.
   */
  function tile(f, line, length, o = {}) {
    const L = o.layout || f.layout;
    const items = [];
    if (!line || !line.glyphs.length) return { items, unit: length || 1, reps: 0, k: 1 };
    const x0 = L.glyphs[line.glyphs[0]].x;
    for (const gi of line.glyphs) {
      const g = L.glyphs[gi];
      items.push({ g, off: g.x - x0 + g.w / 2, w: g.w });
    }
    const gap = o.gap || 0;
    const sepW = o.sep ? o.sepW : 0;
    let unit = line.width + gap + (o.sep ? sepW + gap : 0);
    if (o.sep) items.push({ g: { ch: o.sep, w: sepW, vi: -1, isSpace: false, x: 0, sep: true }, off: line.width + gap + sepW / 2, w: sepW, sep: true });
    let k = 1;
    const margin = o.fitMargin != null ? o.fitMargin : 1;
    if (length > 0 && unit > length * margin) {
      k = (length * margin) / unit;
      unit *= k;
      for (const it of items) { it.off *= k; it.w *= k; }
    }
    let reps = 1;
    if (o.repeat && length > 0) {
      if (o.closed) {
        // Round up when squeezing the spacing (never the letters) is enough; otherwise stretch it.
        const up = Math.max(1, Math.ceil(length / unit - 1e-6));
        const spacing = unit - line.width * k;
        reps = unit - length / up <= spacing * 0.6 ? up : Math.max(1, up - 1);
        unit = length / reps;
      } else {
        reps = Math.ceil(length / unit) + 1;
      }
    }
    return { items, unit, reps, k };
  }

  /**
   * drawGlyph options that reproduce the glyph matrix [[ax, bx], [ay, by]]: (ax, ay) is where the
   * glyph's local +x (advance) lands and (bx, by) its local +y (down), in frame px per glyph px.
   * drawGlyph builds rotation · [[sx, sy·tk], [0, sy]] (tk = −tan(skew + slant)), i.e. a QR split.
   */
  function affine(f, ax, ay, bx, by) {
    const rot = Math.atan2(ay, ax);
    const sx = Math.hypot(ax, ay);
    const c = Math.cos(rot), s = Math.sin(rot);
    const u = c * bx + s * by; // second column in the rotated frame: (sy·tk, sy)
    const v = -s * bx + c * by;
    const sy = Math.abs(v) < 1e-6 ? (v < 0 ? -1e-6 : 1e-6) : v;
    const tk = clamp(u / sy, -8, 8);
    return { rot, sx, sy, skew: -Math.atan(tk) - f.slant };
  }

  /** Variable-weight span for the layer's font: { base, lo, hi } or null for static fonts. */
  function weights(f, amount = 1) {
    const fam = TM.fonts.get(f.layer.font.family);
    if (!fam || !fam.variable) return null;
    const base = TM.fonts.clampWeight(f.layer.font.family, f.layer.font.weight);
    const a = clamp(amount, 0, 1);
    return { base, lo: base - (base - fam.min) * a, hi: base + (fam.max - base) * a, min: fam.min, max: fam.max };
  }

  /** Snap a weight to a 5-unit step: invisible on screen, but keeps canvas font strings cached. */
  const quantWeight = (w) => Math.round(w / 5) * 5;

  const ids = new WeakMap();
  let nextId = 1;
  /** A small stable id per object (layouts, paths) for use inside string cache keys. */
  function keyOf(obj) {
    if (!obj || typeof obj !== 'object') return 0;
    let id = ids.get(obj);
    if (!id) { id = nextId++; ids.set(obj, id); }
    return id;
  }

  /** Common stroke setup in frame space for guides, rings and pen lines. Call inside save/restore. */
  function strokeStyle(f, widthPx, alpha, color) {
    const ctx = f.ctx;
    f.identity();
    ctx.globalAlpha = f.alpha * alpha;
    ctx.strokeStyle = color || f.colorOf({ vi: 0 });
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = Math.max(0.75, widthPx);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  const smoothCache = new WeakMap();
  /**
   * A copy of the path with corners rounded at about `radius` px (three box-filter passes over an
   * even resample, ≈ Gaussian). Text laid on it flows round a star's points instead of snapping.
   * Open paths keep their end points. Cached per sampled path and radius.
   */
  function smooth(path, radius) {
    if (!(radius > 1) || path.n < 3 || path.length < radius * 2) return path;
    let byR = smoothCache.get(path);
    if (!byR) smoothCache.set(path, (byR = new Map()));
    const key = Math.round(radius);
    let out = byR.get(key);
    if (out) return out;
    const n = clamp(Math.round(path.length / Math.max(2, radius / 3)), 64, 720);
    const step = path.closed ? path.length / n : path.length / (n - 1);
    let xs = new Float64Array(n), ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = path.at(Math.min(i * step, path.length));
      xs[i] = p.x;
      ys[i] = p.y;
    }
    const m = Math.max(1, Math.round(radius / step / 1.7));
    for (let pass = 0; pass < 3; pass++) {
      const nx = new Float64Array(n), ny = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let sx = 0, sy = 0, c = 0;
        for (let j = -m; j <= m; j++) {
          let k = i + j;
          if (path.closed) k = ((k % n) + n) % n;
          else if (k < 0 || k >= n) continue;
          sx += xs[k];
          sy += ys[k];
          c++;
        }
        nx[i] = sx / c;
        ny[i] = sy / c;
      }
      if (!path.closed) { nx[0] = xs[0]; ny[0] = ys[0]; nx[n - 1] = xs[n - 1]; ny[n - 1] = ys[n - 1]; }
      xs = nx;
      ys = ny;
    }
    out = new TM.Path.SampledPath(Float32Array.from(xs), Float32Array.from(ys), path.closed);
    if (byR.size > 8) byR.clear();
    byR.set(key, out);
    return out;
  }

  TM.PathKit = { place, shape, tile, affine, weights, quantWeight, keyOf, strokeStyle, smooth };
})(window.TM);
