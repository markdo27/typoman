/* TYPOMAN engine — photosensitivity check.
 *
 * TM.Safety.flashes(scene) renders the loop small, at the scene's frame rate, and counts
 * flashes the way WCAG 2.3.1 (Three Flashes or Below Threshold) defines them:
 *   - a general flash is a pair of opposing changes in relative luminance of at least 10% of
 *     the maximum, where the darker state is below 0.80;
 *   - a red flash is a pair of opposing transitions to or from a saturated red
 *     (R / (R + G + B) ≥ 0.8, with (R − G − B) × 320 changing by more than 20);
 *   - a change only counts when it covers at least 25% of some 10° visual field, taken as a
 *     third of the frame's width by a third of its height (WCAG's 341 × 256 px field on a
 *     1024 × 768 screen), i.e. full-screen playback, the strictest case.
 * More than three flashes of either kind in any one-second window fails. The loop is
 * analysed cyclically, so flashes across the seam count too.
 */
(function (TM) {
  'use strict';

  const G = 24; // analysis cells per side
  const FIELD = G / 3; // a 10° field, in cells per side
  const NEED = Math.ceil(FIELD * FIELD * 0.25); // cells of a field that must change together
  const LIMIT = 3; // flashes per second

  const LUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const v = i / 255; LUT[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }

  /**
   * Mark, per frame, the cells that complete a qualifying change there (+1 rising, −1 falling).
   * `vals` holds one row of n frames per cell; a change is a turn of at least `delta` from the
   * last extreme, and `ok(a, b)` says whether a change between a and b counts. Walks the loop
   * twice: the first pass settles each cell's trend, the second records, so the seam counts.
   */
  function transitions(vals, n, delta, ok, hits) {
    for (let c = 0; c < G * G; c++) {
      const row = c * n;
      let lo = vals[row], hi = lo, ext = lo, trend = 0;
      for (let k = 1; k < n * 2; k++) {
        const v = vals[row + (k % n)];
        if (trend === 0) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
          if (hi - lo >= delta && ok(lo, hi)) { trend = v === hi ? 1 : -1; ext = v; }
        } else if (trend > 0 ? v > ext : v < ext) {
          ext = v;
        } else if (Math.abs(v - ext) >= delta && ok(ext, v)) {
          trend = -trend;
          if (k >= n) hits[(k - n) * G * G + c] = trend;
          ext = v;
        }
      }
    }
  }

  /**
   * Flashes per second in the worst one-second window of the worst 10° field. A field changes
   * when at least a quarter of it changes the same way within a frame (two at 60 fps); runs of
   * same-direction changes merge, and each pair of opposing changes is a flash.
   */
  function worstField(hits, n, fps) {
    const F = Math.round(FIELD), STEP = 2, N1 = G + 1;
    const tol = Math.max(1, Math.round(fps / 30));
    const up = new Int32Array(N1 * N1), dn = new Int32Array(N1 * N1);
    const xs = [];
    for (let y = 0; y + F <= G; y += STEP) for (let x = 0; x + F <= G; x += STEP) xs.push(y * N1 + x);
    const ev = xs.map(() => new Int8Array(n));
    for (let k = 0; k < n; k++) {
      let any = false;
      for (let y = 0; y < G; y++) {
        let ru = 0, rd = 0;
        for (let x = 0; x < G; x++) {
          let u = 0, d = 0;
          for (let j = 0; j < tol; j++) {
            const h = hits[(((k - j) % n + n) % n) * G * G + y * G + x];
            if (h > 0) u = 1; else if (h < 0) d = 1;
          }
          ru += u; rd += d;
          up[(y + 1) * N1 + x + 1] = up[y * N1 + x + 1] + ru;
          dn[(y + 1) * N1 + x + 1] = dn[y * N1 + x + 1] + rd;
        }
        if (ru || rd) any = true;
      }
      if (!any) continue;
      xs.forEach((o, w) => {
        const sum = (t) => t[o + F * N1 + F] - t[o + F] - t[o + F * N1] + t[o];
        const a = sum(up), b = sum(dn);
        if (a >= NEED || b >= NEED) ev[w][k] = a >= b ? 1 : -1;
      });
    }
    const win = Math.max(1, Math.round(fps));
    let best = 0, at = 0;
    ev.forEach((e) => {
      // Direction changes of this field (two passes so the seam counts), then the busiest second.
      const turn = new Uint8Array(n);
      let dir = 0;
      for (let k = 0; k < n * 2; k++) {
        const v = e[k % n];
        if (v && v !== dir) { if (k >= n) turn[k - n] = 1; dir = v; }
      }
      for (let k = 0; k < n; k++) {
        let c = 0;
        // A loop shorter than a second repeats inside the window.
        for (let j = 0; j < win; j++) c += turn[(k + j) % n];
        if (c > best) { best = c; at = k; }
      }
    });
    return { flashes: best / 2, at: at / fps };
  }

  /**
   * Analyse a normalised scene (fonts should be ready: await TM.prepare first).
   * opts: { maxFrames (default 900), signal (AbortSignal) }
   * Resolves { ok, flashes, red, worstAt, frames, limit }: flashes per second in the worst
   * one-second window, general and red, and when that window starts (s).
   */
  async function flashes(scene, opts = {}) {
    const n = Math.max(2, Math.min(opts.maxFrames || 900, Math.round(scene.duration * (scene.fps || 30))));
    const fps = n / scene.duration; // analysis rate (below the scene's when a long loop is capped)
    const aspect = scene.size.w / scene.size.h;
    const W = aspect >= 1 ? G * 8 : Math.max(G, Math.round(G * 8 * aspect));
    const H = aspect >= 1 ? Math.max(G, Math.round((G * 8) / aspect)) : G * 8;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const r = new TM.Renderer(canvas, { quality: 'full' });
    r.setScene(scene);
    r.resize(W, H);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const cells = G * G;
    const lum = new Float32Array(cells * n), red = new Float32Array(cells * n);
    let last = performance.now();
    for (let k = 0; k < n; k++) {
      if (opts.signal && opts.signal.aborted) throw new DOMException('Flash check aborted', 'AbortError');
      r.render((k / n) * scene.duration);
      const d = ctx.getImageData(0, 0, W, H).data;
      for (let gy = 0; gy < G; gy++) {
        const y0 = Math.floor((gy * H) / G), y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * H) / G));
        for (let gx = 0; gx < G; gx++) {
          const x0 = Math.floor((gx * W) / G), x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * W) / G));
          let R = 0, Gn = 0, B = 0, cnt = 0;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              // Transparent pixels are judged over black, as most players show them.
              const i = (y * W + x) * 4, a = d[i + 3] / 255;
              R += LUT[d[i]] * a; Gn += LUT[d[i + 1]] * a; B += LUT[d[i + 2]] * a; cnt++;
            }
          }
          R /= cnt; Gn /= cnt; B /= cnt;
          const idx = (gy * G + gx) * n + k;
          lum[idx] = 0.2126 * R + 0.7152 * Gn + 0.0722 * B;
          // Red only registers while saturated, so changes to or from saturated red count.
          red[idx] = R + Gn + B > 0 && R / (R + Gn + B) >= 0.8 ? Math.max(0, R - Gn - B) * 320 : 0;
        }
      }
      // Yield now and then so the page stays responsive.
      if (performance.now() - last > 12) { await new Promise((res) => setTimeout(res, 0)); last = performance.now(); }
    }
    const hitsG = new Int8Array(cells * n), hitsR = new Int8Array(cells * n);
    transitions(lum, n, 0.1, (a, b) => Math.min(a, b) < 0.8, hitsG);
    transitions(red, n, 20, () => true, hitsR);
    const g = worstField(hitsG, n, fps), rd = worstField(hitsR, n, fps);
    return {
      ok: g.flashes <= LIMIT && rd.flashes <= LIMIT,
      flashes: g.flashes,
      red: rd.flashes,
      worstAt: g.flashes >= rd.flashes ? g.at : rd.at,
      frames: n,
      limit: LIMIT,
    };
  }

  TM.Safety = { flashes, LIMIT };
})(window.TM);
