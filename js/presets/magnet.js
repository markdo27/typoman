/* Preset: Magnet — a magnet travels your path through the word. Letters sitting in their
 * readable layout are pushed away (or pulled in) as it passes, then spring back with overshoot.
 *
 * Deterministic by construction: a letter's displacement is its force history convolved with a
 * damped spring's impulse response, x(t) = ∫ h(τ)·F(t − τ) dτ, evaluated afresh every frame, so
 * there is no simulation state. The convolution is exact, not sampled:
 *   - The force history is taken at nodes fixed in loop time (every dur/M s, M from the magnet's
 *     top speed so the field is well resolved) and is linear between them.
 *   - The spring kernel h(τ) = e^(−aτ)·sin(bτ) = Im e^(cτ) is summed over every past loop:
 *     h_p(τ) = Im(K·e^(cτ)), K = 1/(1 − e^(c·dur)). That is the true steady-state response to
 *     a force that repeats every loop, so frame(0) == frame(1).
 *   - Each linear piece is integrated against h_p in closed form.
 * A letter's position is therefore a smooth (C²) function of time at any frame rate; a tap sum
 * sliding with t aliased the narrow force pulse into a saw-tooth. The field is the gradient of a
 * Gaussian bump (zero under the magnet, strongest at ρ/√2), so it has no 1/d singularity to flip
 * through. The kernel has unit DC gain: a parked magnet pushes exactly "strength".
 */
(function (TM) {
  'use strict';
  const { TAU, clamp, lerp, fract, pingpong, mod } = TM.math;
  const K = TM.PathKit;
  const FIELD = Math.sqrt(2 * Math.E); // 1 / max(x·e^(−x²)): the field's peak is "strength"

  const slopes = new Map();
  /** Steepest slope of an ease over 0..1 (how much faster than average the magnet can move). */
  function maxSlope(spec) {
    const key = JSON.stringify(spec);
    let v = slopes.get(key);
    if (v == null) {
      const e = TM.ease(spec, 'inOutSine');
      v = 1;
      for (let i = 0; i < 256; i++) v = Math.max(v, Math.abs(e((i + 1) / 256) - e(i / 256)) * 256);
      if (slopes.size > 64) slopes.clear();
      slopes.set(key, v);
    }
    return v;
  }

  /**
   * Hat-function weights of the spring convolution at time t: x(t) = Σ_j w_j·F(node j) / norm,
   * for nodes j0 … j0 + w.length − 1 at times j·dur/M, over the window τ ∈ [0, Tw]. The weights
   * slide smoothly as t moves over the fixed nodes, and partial pieces at both ends of the window
   * are integrated exactly, so nothing steps when a node enters or leaves.
   */
  function springWeights(t, dur, M, a, b, Tw) {
    const D = dur / M;
    const cc = a * a + b * b;
    const ir = -a / cc, ii = -b / cc; // 1/c
    const i2r = ir * ir - ii * ii, i2i = 2 * ir * ii; // 1/c²
    const ed = Math.exp(-a * dur); // K = 1 / (1 − e^(c·dur))
    const qr = 1 - ed * Math.cos(b * dur), qi = -ed * Math.sin(b * dur);
    const qq = qr * qr + qi * qi;
    const Kr = qr / qq, Ki = -qi / qq;
    // Im(K·∫e^(cτ)dτ) and Im(K·∫τ·e^(cτ)dτ) antiderivatives at τ.
    const G = (tau, out) => {
      const e = Math.exp(-a * tau), er = e * Math.cos(b * tau), ei = e * Math.sin(b * tau);
      const g0r = er * ir - ei * ii, g0i = er * ii + ei * ir;
      const ur = tau * ir - i2r, ui = tau * ii - i2i;
      const g1r = er * ur - ei * ui, g1i = er * ui + ei * ur;
      out[0] = Kr * g0i + Ki * g0r;
      out[1] = Kr * g1i + Ki * g1r;
    };
    const lo = t - Tw;
    const j0 = Math.floor(lo / D), j1 = Math.ceil(t / D);
    const w = new Float64Array(j1 - j0 + 1);
    const A = [0, 0], B = [0, 0];
    G(0, A);
    G(Tw, B);
    const norm = B[0] - A[0];
    for (let j = j0; j < j1; j++) {
      const s0 = Math.max(j * D, lo), s1 = Math.min((j + 1) * D, t);
      if (s1 <= s0) continue;
      G(t - s1, A);
      G(t - s0, B);
      const m0 = B[0] - A[0]; // ∫ h_p over the piece
      const lin = ((t - j * D) * m0 - (B[1] - A[1])) / D; // ∫ h_p · (s − s_j)/D
      w[j - j0] += m0 - lin;
      w[j - j0 + 1] += lin;
    }
    return { j0, w, norm };
  }

  TM.registerPreset({
    id: 'magnet',
    name: 'Magnet',
    category: 'Path',
    description: 'A magnet travels your path through the word; letters are pushed aside or pulled in and spring back.',
    usesPath: true,
    path: 'loop',
    fit: true,
    params: [
      TM.P.select('mode', 'Field', [['push', 'Push'], ['pull', 'Attract']], 'push', { group: 'Magnet' }),
      TM.P.range('strength', 'Strength (em)', 0, 2.5, 0.01, 0.8, { group: 'Magnet' }),
      TM.P.range('radius', 'Reach', 0.05, 0.6, 0.005, 0.3, { group: 'Magnet', hint: '× the frame’s short side. A wide, gentle field bends the whole word; a small, strong one scatters letters' }),
      TM.P.range('bounce', 'Springiness', 0, 1, 0.01, 0.6, { group: 'Spring' }),
      TM.P.range('freq', 'Spring rate (Hz)', 0.5, 4, 0.05, 1.4, { group: 'Spring' }),
      TM.P.range('tilt', 'Tilt', 0, 1.5, 0.01, 0.6, { group: 'Letters', hint: 'Letters lean away as they are pushed' }),
      TM.P.range('swell', 'Swell', -0.5, 0.6, 0.01, 0.18, { group: 'Letters' }),
      TM.P.range('laps', 'Passes per loop', 1, 4, 1, 1, { group: 'Motion', hint: 'Open paths go there and back' }),
      TM.P.ease('travel', 'Travel ease', 'inOutSine', { group: 'Motion' }),
      TM.P.toggle('show', 'Show magnet', true, { group: 'Motion' }),
    ],

    render(f) {
      const path = f.path;
      if (!path || path.length < 1) return;
      const P = f.params, L = f.layout, size = f.size, dur = f.dur;
      const ease = TM.ease(P.travel, 'inOutSine');
      const laps = Math.max(1, Math.round(P.laps));
      const at = (q) => path.at((path.closed ? ease(fract(laps * q)) : ease(pingpong(laps * q))) * path.length);
      const R = P.radius * f.unit, S = P.strength * size;
      const rho = R * 0.75; // field width: the force peaks at 0.53 R and is half spent at the ring
      const pull = P.mode === 'pull';

      // Damped spring, ζ and ω from the params: h(τ) = e^(−aτ)·sin(bτ).
      const zeta = lerp(0.92, 0.18, P.bounce), omega = TAU * P.freq;
      const a = zeta * omega, b = omega * Math.sqrt(1 - zeta * zeta);
      const Tw = Math.min(dur, 6 / a);
      // Nodes per loop: the magnet moves at most ρ/4 between nodes. Measured on the main path
      // (constant over the loop, so the node grid never changes under path keyframes).
      const base = f.layer.path ? TM.Path.sample(f.layer.path, f.W, f.H) : path;
      const vmax = (laps * (path.closed ? 1 : 2) * Math.max(path.length, base.length) * maxSlope(P.travel)) / dur;
      const M = clamp(Math.ceil((vmax * dur) / (rho * 0.25)), 48, 4096);
      const { j0, w, norm } = springWeights(f.t, dur, M, a, b, Tw);
      if (!(Math.abs(norm) > 1e-12)) return;
      const n = w.length, mx = new Float64Array(n), my = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        const m = at(mod(j0 + k, M) / M);
        mx[k] = m.x;
        my[k] = m.y;
      }
      const inv2 = 1 / (rho * rho), cut2 = 9 * rho * rho;
      const slope = (S * FIELD) / rho; // static displacement per px of distance at the centre
      const gain = slope / norm;
      // Along a line letters have neighbours an advance away, so they mostly part across it. On
      // multi-line text the neighbours across are a line away too: the cross-line push shrinks
      // with the free leading, so a passing magnet doesn't shove one line into the next.
      const rows = L.lines.filter((l) => l.glyphs.some((gi) => !L.glyphs[gi].isSpace)).length;
      const free = clamp((L.lineGap - L.capH) / Math.max(1, L.lineGap));
      const kx = 0.55, ky = rows > 1 ? clamp(0.35 + 1.5 * free, 0.55, 1) : 1;
      const items = [];

      for (const g of L.glyphs) {
        if (g.isSpace) continue;
        const qx = f.cx + g.cx, qy = f.cy + g.cy;
        let dx = 0, dy = 0;
        for (let k = 0; k < n; k++) {
          const ex = qx - mx[k], ey = qy - my[k];
          const d2 = ex * ex + ey * ey;
          if (d2 > cut2) continue;
          // Push: the slope of a Gaussian hill, S·FIELD·(e/ρ)·e^(−d²/ρ²), smooth through the
          // centre. Pull: the same well, saturated so a letter is drawn onto the magnet, not
          // flung through it: |u| → d·u / (d + u).
          let fm = Math.exp(-d2 * inv2);
          if (pull) fm = -fm / (1 + slope * fm); // u/d = slope·fm
          fm *= w[k];
          dx += ex * fm;
          dy += ey * fm;
        }
        dx *= gain * kx;
        dy *= gain * ky;
        const mag = Math.hypot(dx, dy);
        const rot = clamp((dx / size) * 0.55 * P.tilt, -1.2, 1.2);
        const sc = 1 + P.swell * clamp(mag / Math.max(1, S));
        items.push({ g, o: { x: qx + dx, y: qy + dy, rot, scale: sc }, z: sc });
      }
      // Swollen (pushed) letters ride on top, so a squeeze reads as one letter passing over another.
      items.sort((p, q) => (p.z - q.z) * (P.swell < 0 ? -1 : 1) || p.g.i - q.g.i);
      for (const it of items) f.drawGlyph(it.g, it.o);

      if (P.show && f.echo === 0) {
        const m = at(f.p);
        const ctx = f.ctx;
        ctx.save();
        // The magnet takes the text's colour where it is (for gradients, the gradient there).
        K.strokeStyle(f, Math.max(1, f.unit * 0.002), 0.22, f.colorOf({ vi: 0, cx: m.x - f.cx, cy: m.y - f.cy }));
        ctx.beginPath();
        ctx.arc(m.x, m.y, R, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = f.alpha * 0.18;
        ctx.beginPath();
        ctx.arc(m.x, m.y, f.unit * 0.03, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = f.alpha;
        ctx.beginPath();
        ctx.arc(m.x, m.y, f.unit * 0.011, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    },

    looks: [
      { name: 'Iron filings', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Space Grotesk', weight: 700 }, fill: { type: 'solid', color: '#141414' }, params: { strength: 1, tilt: 1.1, bounce: 0.3 }, path: 'infinity' } },
      { name: 'Gravity well', bg: { type: 'radial', color: '#062925', color2: '#000000' }, layer: { font: { family: 'Syne', weight: 800 }, fill: { type: 'palette', palette: ['#5cffc8', '#eafff7', '#00b38f'] }, params: { mode: 'pull', strength: 0.8, radius: 0.28, swell: -0.2 }, path: 'circle' } },
      { name: 'Jelly', bg: { type: 'solid', color: '#ff2e88' }, layer: { font: { family: 'Titan One', weight: 400 }, fill: { type: 'solid', color: '#ffe3a3' }, params: { strength: 0.45, bounce: 0.9, freq: 2, swell: 0.25 }, path: 'line' } },
    ],
  });
})(window.TM);
