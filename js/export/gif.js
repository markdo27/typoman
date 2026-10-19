/* TYPOMAN export — animated GIF (GIF89a), written from scratch.
 *
 * - One global palette for the whole clip (no frame-to-frame colour flicker): median cut over a
 *   5-bit-per-channel histogram of frames sampled across the loop. Flat designs with ≤ 256
 *   colours keep their exact colours.
 * - Optional ordered (Bayer 8×8) dithering for gradients. It is stable from frame to frame,
 *   unlike error diffusion, so animated GIFs don't shimmer.
 * - Opaque GIFs store only the rectangle that changed since the previous frame; transparent
 *   GIFs store each frame's visible bounds with "restore to background" disposal.
 * - Identical consecutive frames are merged by extending the previous frame's delay.
 * - Delays are accumulated in centiseconds so the total duration matches frames / fps exactly.
 * - LZW: the classic GIFCOMPR algorithm (open-addressing hash, 12-bit codes, clear on full table).
 */
(function (TM) {
  'use strict';
  const X = TM.Export;

  // ───────────────────────────── palette ─────────────────────────────
  const BINS = 32768;
  class Histogram {
    constructor() {
      this.n = new Float64Array(BINS);
      this.r = new Float64Array(BINS);
      this.g = new Float64Array(BINS);
      this.b = new Float64Array(BINS);
    }
    /** px: straight RGBA. Transparent mode skips pixels that will become transparent. */
    add(px, transparent, matte) {
      const { n, r, g, b } = this;
      for (let j = 0, len = px.length; j < len; j += 4) {
        const a = px[j + 3];
        if (transparent && a < 128) continue;
        let R = px[j], G = px[j + 1], B = px[j + 2];
        if (a < 255) { const k = a / 255; R = R * k + matte[0] * (1 - k); G = G * k + matte[1] * (1 - k); B = B * k + matte[2] * (1 - k); }
        const key = ((R >> 3) << 10) | ((G >> 3) << 5) | (B >> 3);
        n[key]++;
        r[key] += R;
        g[key] += G;
        b[key] += B;
      }
    }
  }

  function boxStats(hist, bins) {
    let n = 0, sr = 0, sg = 0, sb = 0;
    for (const k of bins) { n += hist.n[k]; sr += hist.r[k]; sg += hist.g[k]; sb += hist.b[k]; }
    const mr = sr / n, mg = sg / n, mb = sb / n;
    let vr = 0, vg = 0, vb = 0;
    for (const k of bins) {
      const c = hist.n[k];
      const dr = hist.r[k] / c - mr, dg = hist.g[k] / c - mg, db = hist.b[k] / c - mb;
      vr += c * dr * dr; vg += c * dg * dg; vb += c * db * db;
    }
    return { bins, n, mean: [mr, mg, mb], var: [vr, vg, vb], sse: vr + vg + vb };
  }

  /** Median cut by largest squared error. Returns colours as [[r,g,b], …] (≤ maxColors). */
  function medianCut(hist, maxColors) {
    const bins = [];
    for (let k = 0; k < BINS; k++) if (hist.n[k] > 0) bins.push(k);
    if (!bins.length) return [[0, 0, 0]];
    if (bins.length <= maxColors) return bins.map((k) => [hist.r[k] / hist.n[k], hist.g[k] / hist.n[k], hist.b[k] / hist.n[k]]);
    const boxes = [boxStats(hist, bins)];
    const chan = [hist.r, hist.g, hist.b];
    while (boxes.length < maxColors) {
      let bi = -1, best = 0;
      boxes.forEach((bx, i) => { if (bx.bins.length > 1 && bx.sse > best) { best = bx.sse; bi = i; } });
      if (bi < 0) break;
      const box = boxes[bi];
      const axis = box.var[0] >= box.var[1] && box.var[0] >= box.var[2] ? 0 : box.var[1] >= box.var[2] ? 1 : 2;
      const ch = chan[axis];
      const sorted = box.bins.slice().sort((p, q) => ch[p] / hist.n[p] - ch[q] / hist.n[q]);
      let acc = 0, cut = 1;
      for (let i = 0; i < sorted.length - 1; i++) {
        acc += hist.n[sorted[i]];
        if (acc >= box.n / 2) { cut = i + 1; break; }
        cut = i + 1;
      }
      boxes.splice(bi, 1, boxStats(hist, sorted.slice(0, cut)), boxStats(hist, sorted.slice(cut)));
    }
    return boxes.map((bx) => bx.mean);
  }

  /** Nearest-palette lookup on 5-bit keys, computed lazily from the bin's mean colour. */
  function makeMapper(colors, hist) {
    const lut = new Int16Array(BINS).fill(-1);
    const P = colors.map((c) => c.map((v) => Math.round(v)));
    return function (key) {
      let v = lut[key];
      if (v >= 0) return v;
      let r, g, b;
      if (hist && hist.n[key] > 0) { r = hist.r[key] / hist.n[key]; g = hist.g[key] / hist.n[key]; b = hist.b[key] / hist.n[key]; }
      else { r = ((key >> 10) & 31) * 8 + 4; g = ((key >> 5) & 31) * 8 + 4; b = (key & 31) * 8 + 4; }
      let best = 0, bestD = Infinity;
      for (let i = 0; i < P.length; i++) {
        const dr = r - P[i][0], dg = g - P[i][1], db = b - P[i][2];
        const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
        if (d < bestD) { bestD = d; best = i; }
      }
      lut[key] = best;
      return best;
    };
  }

  const BAYER8 = (() => {
    const m = [[0, 2], [3, 1]];
    let cur = m;
    for (let size = 2; size < 8; size *= 2) {
      const next = [];
      for (let y = 0; y < size * 2; y++) {
        next.push([]);
        for (let x = 0; x < size * 2; x++) next[y].push(4 * cur[y % size][x % size] + m[(y / size) | 0][(x / size) | 0]);
      }
      cur = next;
    }
    return Float32Array.from(cur.flat().map((v) => (v + 0.5) / 64 - 0.5));
  })();

  /** RGBA → palette indices. */
  function indexFrame(px, W, H, map, o) {
    const out = new Uint8Array(W * H);
    const [mr, mg, mb] = o.matte;
    const spread = o.dither ? 28 : 0;
    for (let y = 0, i = 0; y < H; y++) {
      const brow = (y & 7) * 8;
      for (let x = 0; x < W; x++, i++) {
        const j = i * 4;
        const a = px[j + 3];
        if (o.transparent && a < 128) { out[i] = o.tIndex; continue; }
        let R = px[j], G = px[j + 1], B = px[j + 2];
        if (a < 255) { const k = a / 255; R = R * k + mr * (1 - k); G = G * k + mg * (1 - k); B = B * k + mb * (1 - k); }
        if (spread) {
          const d = BAYER8[brow + (x & 7)] * spread;
          R = R + d < 0 ? 0 : R + d > 255 ? 255 : R + d;
          G = G + d < 0 ? 0 : G + d > 255 ? 255 : G + d;
          B = B + d < 0 ? 0 : B + d > 255 ? 255 : B + d;
        }
        out[i] = map((((R | 0) >> 3) << 10) | (((G | 0) >> 3) << 5) | ((B | 0) >> 3));
      }
    }
    return out;
  }

  // ───────────────────────────── LZW ─────────────────────────────
  const HSIZE = 5003;
  const BITS = 12;
  const MAXMAX = 1 << BITS;
  const htab = new Int32Array(HSIZE);
  const codetab = new Int32Array(HSIZE);

  /** LZW-compress `pixels` (indices) into GIF data sub-blocks. Returns Uint8Array parts. */
  function lzw(pixels, colorDepth) {
    const initBits = Math.max(2, colorDepth) + 1;
    const out = [];
    const block = new Uint8Array(256);
    let blockLen = 0;
    const flushBlock = () => {
      if (!blockLen) return;
      block[0] = blockLen;
      out.push(block.slice(0, blockLen + 1));
      blockLen = 0;
    };
    const byte = (b) => {
      block[++blockLen] = b;
      if (blockLen === 255) flushBlock();
    };

    let nBits = initBits, maxcode = (1 << nBits) - 1;
    const clearCode = 1 << (initBits - 1), eofCode = clearCode + 1;
    let freeEnt = clearCode + 2, clearFlg = false;
    let accum = 0, accBits = 0;
    let hshift = 0;
    for (let fcode = HSIZE; fcode < 65536; fcode *= 2) ++hshift;
    hshift = 8 - hshift;

    function output(code) {
      accum &= (1 << accBits) - 1;
      accum = accBits > 0 ? accum | (code << accBits) : code;
      accBits += nBits;
      while (accBits >= 8) { byte(accum & 0xff); accum >>= 8; accBits -= 8; }
      if (freeEnt > maxcode || clearFlg) {
        if (clearFlg) { nBits = initBits; maxcode = (1 << nBits) - 1; clearFlg = false; }
        else { ++nBits; maxcode = nBits === BITS ? MAXMAX : (1 << nBits) - 1; }
      }
      if (code === eofCode) {
        while (accBits > 0) { byte(accum & 0xff); accum >>= 8; accBits -= 8; }
        flushBlock();
      }
    }

    htab.fill(-1);
    output(clearCode);
    let ent = pixels[0];
    const n = pixels.length;
    outer: for (let p = 1; p < n; p++) {
      const c = pixels[p];
      const fcode = (c << BITS) + ent;
      let i = (c << hshift) ^ ent;
      if (htab[i] === fcode) { ent = codetab[i]; continue; }
      if (htab[i] >= 0) {
        let disp = HSIZE - i;
        if (i === 0) disp = 1;
        do {
          if ((i -= disp) < 0) i += HSIZE;
          if (htab[i] === fcode) { ent = codetab[i]; continue outer; }
        } while (htab[i] >= 0);
      }
      output(ent);
      ent = c;
      if (freeEnt < MAXMAX) {
        codetab[i] = freeEnt++;
        htab[i] = fcode;
      } else {
        htab.fill(-1);
        freeEnt = clearCode + 2;
        clearFlg = true;
        output(clearCode);
      }
    }
    output(ent);
    output(eofCode);
    return [Uint8Array.of(initBits - 1)].concat(out, [Uint8Array.of(0)]);
  }

  // ───────────────────────────── writer ─────────────────────────────
  const u16 = (v) => [v & 0xff, (v >> 8) & 0xff];

  class GifWriter {
    /** colors: [[r,g,b]…] (≤ 256 incl. transparent slot); tIndex: transparent index or -1 */
    constructor(W, H, colors, { tIndex = -1, loop = 0 } = {}) {
      this.W = W;
      this.H = H;
      this.tIndex = tIndex;
      const count = Math.max(2, colors.length + (tIndex >= 0 && tIndex >= colors.length ? 1 : 0));
      let depth = 1;
      while (1 << depth < count) depth++;
      this.depth = depth;
      const table = new Uint8Array(3 * (1 << depth));
      colors.forEach((c, i) => { table[i * 3] = Math.round(c[0]); table[i * 3 + 1] = Math.round(c[1]); table[i * 3 + 2] = Math.round(c[2]); });
      this.parts = [
        new TextEncoder().encode('GIF89a'),
        Uint8Array.from([...u16(W), ...u16(H), 0xf0 | (depth - 1), 0, 0]),
        table,
      ];
      if (loop != null) this.parts.push(Uint8Array.from([0x21, 0xff, 0x0b, ...new TextEncoder().encode('NETSCAPE2.0'), 0x03, 0x01, ...u16(loop), 0x00]));
      this.pending = null;
      this.frames = 0;
      this.merged = 0;
    }

    /** Queue a frame; consecutive identical frames are merged into one with a longer delay. */
    frame({ x, y, w, h, indices, delay, disposal, same }) {
      if (same && this.pending) { this.pending.delay += delay; this.merged++; return; }
      this._flush();
      this.pending = { x, y, w, h, data: lzw(indices, this.depth), delay, disposal };
    }

    _flush() {
      const f = this.pending;
      if (!f) return;
      const t = this.tIndex >= 0;
      this.parts.push(
        Uint8Array.from([0x21, 0xf9, 0x04, (f.disposal << 2) | (t ? 1 : 0), ...u16(Math.min(65535, f.delay)), t ? this.tIndex : 0, 0x00]),
        Uint8Array.from([0x2c, ...u16(f.x), ...u16(f.y), ...u16(f.w), ...u16(f.h), 0x00]),
        ...f.data,
      );
      this.frames++;
      this.pending = null;
    }

    finish() {
      this._flush();
      this.parts.push(Uint8Array.of(0x3b));
      return new Blob(this.parts, { type: 'image/gif' });
    }
  }

  function crop(indices, W, x0, y0, w, h) {
    if (x0 === 0 && y0 === 0 && w === W && indices.length === w * h) return indices;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) out.set(indices.subarray((y0 + y) * W + x0, (y0 + y) * W + x0 + w), y * w);
    return out;
  }

  /** Bounds of pixels where a !== b (or, with b = null, where a !== skip). null when none. */
  function bounds(a, b, W, H, skip) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let first = -1, last = -1;
      for (let x = 0; x < W; x++) {
        const v = a[row + x];
        if (b ? v !== b[row + x] : v !== skip) { if (first < 0) first = x; last = x; }
      }
      if (first >= 0) {
        if (first < x0) x0 = first;
        if (last > x1) x1 = last;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  const equal = (a, b) => {
    if (!b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };

  /** Centisecond delay of frame i so the running total stays on round(i · 100 / fps). */
  X.gifDelay = (i, fps) => Math.round(((i + 1) * 100) / fps) - Math.round((i * 100) / fps);

  // ───────────────────────────── export ─────────────────────────────
  X.encodeGIF = async function (plan, scene, hooks = {}) {
    const t0 = performance.now();
    const W = plan.width, H = plan.height;
    const matteHex = plan.matte || (scene.bg.type === 'transparent' ? '#ffffff' : scene.bg.color);
    const mc = TM.color.parse(matteHex);
    const matte = [mc.r, mc.g, mc.b];
    const transparent = plan.transparent;

    // Pass 1: palette from frames sampled across the clip.
    const sampleCount = Math.min(plan.frames, 24);
    const hist = new Histogram();
    const sampler = X.makeRenderer(scene, plan);
    const tracker = X.progress(sampleCount, hooks.onProgress, 'palette', [0, 0.08]);
    for (let s = 0; s < sampleCount; s++) {
      X.throwIfAborted(hooks.signal);
      const i = Math.floor((s * plan.frames) / sampleCount);
      sampler.render(X.frameTime(plan, i));
      hist.add(X.readPixels(sampler.canvas).data, transparent, matte);
      tracker.tick(s + 1);
      await X.breathe();
    }
    const colors = medianCut(hist, transparent ? 255 : 256);
    const tIndex = transparent ? colors.length : -1;
    const map = makeMapper(colors, hist);
    const gif = new GifWriter(W, H, colors, { tIndex, loop: 0 });

    // Pass 2: encode every frame.
    let prev = null;
    await X.frameLoop(plan, scene, (canvas, i) => {
      const idx = indexFrame(X.readPixels(canvas).data, W, H, map, { transparent, tIndex, matte, dither: plan.dither });
      const delay = X.gifDelay(i, plan.fps);
      if (transparent) {
        const same = equal(idx, prev);
        const b = same ? null : bounds(idx, null, W, H, tIndex) || { x: 0, y: 0, w: 1, h: 1 };
        gif.frame(same ? { delay, same: true } : { ...b, indices: crop(idx, W, b.x, b.y, b.w, b.h), delay, disposal: 2 });
      } else if (!prev) {
        gif.frame({ x: 0, y: 0, w: W, h: H, indices: idx, delay, disposal: 1 });
      } else {
        const b = bounds(idx, prev, W, H);
        if (!b) gif.frame({ delay, same: true });
        else gif.frame({ ...b, indices: crop(idx, W, b.x, b.y, b.w, b.h), delay, disposal: 1 });
      }
      prev = idx;
    }, Object.assign({}, hooks, { weight: [0.08, 0.98] }));
    X.releasePixels();
    const blob = gif.finish();
    return {
      blob,
      info: {
        engine: 'gif',
        codec: 'GIF89a',
        label: `GIF · ${colors.length} colour${colors.length === 1 ? '' : 's'}${plan.dither ? ' · dithered' : ''}${transparent ? ' · 1-bit transparency' : ''}`,
        frames: plan.frames,
        storedFrames: gif.frames,
        merged: gif.merged,
        colors: colors.length,
        elapsedMs: performance.now() - t0,
        notes: gif.merged ? [`${gif.merged} identical frame${gif.merged > 1 ? 's were' : ' was'} merged into longer delays (timing unchanged).`] : [],
      },
    };
  };

  X._gif = { medianCut, Histogram, lzw, GifWriter, indexFrame, makeMapper }; // for unit checks
})(window.TM);
