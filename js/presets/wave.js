/* Preset: Wave — a travelling wave rolls through the letters.
 * Letters rise, lean into the slope and swell as a crest passes. On variable fonts the weight
 * surges with the crest and each line re-flows, so heavier letters push their neighbours apart
 * instead of colliding. Modes:
 *   Swell    travelling sine; troughs sink back and dim, crests come forward
 *   Bounce   letters hop on parabolic arcs, squash on contact and stretch with speed
 *   Ripple   a drop lands in the middle; a ring kicks each letter and leaves a damped wobble
 *   Cascade  a staggered hop: anticipation dip, rise, hang, fall, squash and springy settle
 * Every periodic term uses whole cycles per loop, so frame(0) == frame(1).
 */
(function (TM) {
  'use strict';
  const { TAU, clamp, lerp, fract } = TM.math;
  const K = TM.PathKit;

  // Ripple: when a ring reaches a letter (φ = 0) it is kicked up, then rings down to rest before
  // the next ring arrives. Zero at both ends, so consecutive rings join without a seam.
  const rippleRaw = (x) => Math.sin(TAU * 1.6 * x) * Math.exp(-2.6 * x) * (1 - x) * (1 - x);
  let RIPPLE_PEAK = 1e-6;
  for (let i = 0; i <= 400; i++) RIPPLE_PEAK = Math.max(RIPPLE_PEAK, rippleRaw(i / 400));
  const ripple = (x) => rippleRaw(x) / RIPPLE_PEAK;

  // Cascade hop, u ∈ [0, 1]: anticipation → rise → hang → fall → impact squash → settle.
  // y in amplitude units (up), sy the vertical squash/stretch, lean a signed tilt factor.
  const A = 0.14, B = 0.5, C = 0.8;
  function hop(u, rise, squash) {
    if (u <= 0 || u >= 1) return { y: 0, sy: 1, lean: 0 };
    if (u < A) {
      const k = Math.sin(Math.PI * (u / A));
      return { y: -0.08 * k, sy: 1 - 0.16 * squash * k, lean: -0.35 * k };
    }
    if (u < B) {
      const v = (u - A) / (B - A);
      const speed = 1 - v;
      return { y: rise(v), sy: 1 + 0.16 * squash * speed * speed, lean: Math.sin(Math.PI * v) };
    }
    if (u < C) {
      const v = (u - B) / (C - B);
      return { y: 1 - v * v, sy: 1 + 0.12 * squash * v * v, lean: -0.55 * Math.sin(Math.PI * v) };
    }
    const v = (u - C) / (1 - C);
    const ring = Math.exp(-4.5 * v) * Math.cos(TAU * 1.3 * v) * (1 - v);
    return { y: 0, sy: 1 - 0.26 * squash * ring, lean: 0.25 * Math.exp(-4 * v) * Math.sin(TAU * v) };
  }

  const ENVELOPES = {
    steady: () => 1,
    swell: (p) => Math.pow(Math.sin(Math.PI * p), 2),
    twice: (p) => Math.pow(Math.sin(TAU * p), 2),
  };

  /**
   * One letter's wave state at cycle position cp: height y (in amplitude units, up), slope,
   * squash sy, lean and phase. G = { xi (phase coordinate in glyphs), r (stagger rank 0..1),
   * d (ripple distance in glyphs), side (±1, which side of the centre) }.
   */
  function waveAt(mode, P, G, cp, lambda, rise, squash) {
    let y = 0, slope = 0, sy = 1, lean = 0, ph = 0;
    if (mode === 'bounce') {
      ph = fract(cp - G.xi / lambda);
      const c0 = 0.16;
      if (ph < c0) {
        // Contact: compress fast on impact, release slower into the take-off.
        const q = Math.sin(Math.PI * Math.sqrt(ph / c0));
        sy = 1 - 0.3 * squash * q;
      } else {
        const u = (ph - c0) / (1 - c0);
        const v = 1 - 2 * u; // +1 take-off … −1 landing
        y = 4 * u * (1 - u) * 1.3;
        slope = (-4 * v) / ((1 - c0) * lambda);
        sy = 1 + 0.18 * squash * v * v;
      }
    } else if (mode === 'ripple') {
      ph = fract(cp - G.d / lambda);
      y = ripple(ph);
      const dy = (ripple(Math.min(1, ph + 1e-3)) - ripple(Math.max(0, ph - 1e-3))) / 2e-3;
      slope = ((-dy / lambda) * G.side) * 0.3;
    } else if (mode === 'cascade') {
      ph = fract(cp - G.r * P.spread);
      const h = hop(ph / Math.max(0.05, P.hop), rise, squash);
      y = h.y;
      sy = h.sy;
      lean = h.lean;
    } else {
      // Swell: a sine whose crests sharpen and troughs flatten as `crest` rises, like water.
      ph = fract(cp - G.xi / lambda);
      const th = TAU * ph;
      const q = (1 + Math.sin(th)) / 2, gam = 1 + P.crest * 1.5;
      y = 2 * Math.pow(q, gam) - 1;
      slope = -(TAU / lambda) * gam * Math.pow(Math.max(q, 1e-6), gam - 1) * Math.cos(th);
    }
    return { y, slope, sy, lean, ph };
  }

  /**
   * The share of the wave height (0..1) at which letters on neighbouring lines never touch.
   * Every pair of letters on adjacent lines that sit above one another is sampled over a wave
   * cycle, with the scale pulse and squash, against the line gap: on multi-line text the
   * amplitude scales itself to the leading.
   */
  function ampLimit(f, G, lambda, scaleK) {
    const P = f.params, L = f.layout;
    const amp = P.amp * f.size;
    if (!(amp > 0)) return 1;
    const lines = L.lines.map((l) => l.glyphs.filter((gi) => !L.glyphs[gi].isSpace)).filter((gs) => gs.length);
    if (lines.length < 2) return 1;
    const rise = TM.ease(P.rise, 'outCubic');
    const baseline = P.mode === 'bounce' || P.mode === 'cascade';
    const S = 48;
    const state = (gi) => Array.from({ length: S }, (_, k) => {
      const w = waveAt(P.mode, P, G[gi], k / S, lambda, rise, P.squash);
      return { y: w.y, s: Math.max(0.05, 1 + P.scale * scaleK * w.y) * w.sy };
    });
    const cache = new Map();
    const at = (gi) => cache.get(gi) || (cache.set(gi, state(gi)), cache.get(gi));
    let best = amp;
    for (let j = 0; j + 1 < lines.length; j++) {
      const gap0 = L.glyphs[lines[j + 1][0]].y - L.glyphs[lines[j][0]].y;
      for (const ia of lines[j]) {
        const a = L.glyphs[ia];
        for (const ib of lines[j + 1]) {
          const b = L.glyphs[ib];
          // Letters that really sit above one another (ink overlapping by 40% of the narrower
          // one); a passing corner touch between diagonal neighbours is let go.
          const over = Math.min(a.cx + a.w * 0.43, b.cx + b.w * 0.43) - Math.max(a.cx - a.w * 0.43, b.cx - b.w * 0.43);
          if (over < 0.4 * 0.86 * Math.min(a.w, b.w)) continue;
          const A = at(ia), B = at(ib);
          for (let k = 0; k < S; k++) {
            const rise2 = B[k].y - A[k].y; // the lower letter rising toward the upper one
            if (rise2 <= 1e-6) continue;
            const H = baseline ? L.capH * B[k].s : (L.capH * (A[k].s + B[k].s)) / 2;
            best = Math.min(best, Math.max(0, (gap0 - H) / rise2));
          }
        }
      }
    }
    return clamp(best / amp);
  }

  TM.registerPreset({
    id: 'wave',
    name: 'Wave',
    category: 'Kinetic',
    description: 'A wave rolls through the letters: they rise, lean into the slope and swell. On variable fonts the weight surges with the crest.',
    params: [
      TM.P.select('mode', 'Mode', [['sine', 'Swell'], ['bounce', 'Bounce'], ['ripple', 'Ripple'], ['cascade', 'Cascade']], 'sine', { group: 'Wave' }),
      TM.P.range('amp', 'Height (em)', 0, 1.5, 0.01, 0.38, { group: 'Wave' }),
      TM.P.range('wavelength', 'Wavelength (glyphs)', 2, 24, 0.5, 11, { group: 'Wave', hint: 'Capped at the text length, so short words still show a wave' }),
      TM.P.range('cycles', 'Cycles per loop', 1, 6, 1, 2, { group: 'Wave', hint: 'Whole cycles keep the loop seamless' }),
      TM.P.select('envelope', 'Envelope', [['steady', 'Steady'], ['swell', 'Calm at loop point'], ['twice', 'Two swells']], 'steady', { group: 'Wave' }),
      TM.P.select('order', 'Travel', TM.ORDERS, 'start', { group: 'Wave', hint: 'Which way the wave runs: by letter, word or line' }),
      TM.P.range('spread', 'Stagger', 0, 0.95, 0.01, 0.55, { group: 'Wave', showIf: { mode: 'cascade' } }),
      TM.P.range('hop', 'Hop length', 0.1, 1, 0.01, 0.42, { group: 'Wave', showIf: { mode: 'cascade' } }),
      TM.P.ease('rise', 'Rise ease', 'outCubic', { group: 'Wave', showIf: { mode: 'cascade' } }),
      TM.P.range('crest', 'Crest', 0, 1, 0.01, 0.35, { group: 'Wave', showIf: { mode: 'sine' }, hint: '0 = pure sine, 1 = sharp crests and long flat troughs' }),
      TM.P.range('follow', 'Lean into slope', 0, 1.5, 0.01, 0.32, { group: 'Character' }),
      TM.P.range('scale', 'Scale pulse', 0, 1, 0.01, 0.16, { group: 'Character' }),
      TM.P.range('depth', 'Depth fade', 0, 1, 0.01, 0.25, { group: 'Character', hint: 'Letters in a trough sink back and dim' }),
      TM.P.range('squash', 'Squash & stretch', 0, 1.5, 0.01, 0.8, { group: 'Character', showIf: { mode: ['bounce', 'cascade'] } }),
      TM.P.toggle('weightWave', 'Weight wave', true, { group: 'Weight & colour', hint: 'Variable fonts only (Roboto Flex, Unbounded, Fraunces…)' }),
      TM.P.range('weightRange', 'Weight range', 0, 1, 0.01, 0.85, { group: 'Weight & colour', showIf: { weightWave: true } }),
      TM.P.toggle('colorWave', 'Colour wave', false, { group: 'Weight & colour', hint: 'Cycles the layer palette along the wave' }),
    ],

    setup(f) {
      const L = f.layout, fam = f.layer.font.family, P = f.params;
      const vis = L.glyphs.filter((g) => !g.isSpace);
      const adv = vis.length ? vis.reduce((a, g) => a + g.w, 0) / vis.length : f.size * 0.5;
      const W = P.weightWave ? K.weights(f, P.weightRange) : null;
      let lo = null, hi = null, base = null;
      if (W) {
        // Single-glyph advances at the axis ends; the kerned layout advance is the base.
        lo = L.glyphs.map((g) => TM.text.advance(g.ch, fam, W.lo, f.size));
        hi = L.glyphs.map((g) => TM.text.advance(g.ch, fam, W.hi, f.size));
        base = L.glyphs.map((g) => TM.text.advance(g.ch, fam, W.base, f.size));
      }
      // Phase coordinates. Travelling by letter on several lines, the phase follows the letter's
      // horizontal position, so letters stacked above each other rise and fall together and the
      // block waves as one (in reading order the lines ran in near anti-phase and crashed).
      const n = L.count;
      const rows = L.lines.filter((l) => l.glyphs.some((gi) => !L.glyphs[gi].isSpace)).length;
      const across = rows > 1 && (P.order === 'start' || P.order === 'end');
      const rtl = !!(L.lines[0] && L.lines[0].rtl);
      let x0 = Infinity, x1 = -Infinity;
      for (const g of vis) { x0 = Math.min(x0, g.cx); x1 = Math.max(x1, g.cx); }
      const G = L.glyphs.map((g) => {
        if (g.isSpace) return null;
        let r = f.rank(g, P.order);
        // Right-to-left text starts reading at the right, so the wave sets off from there.
        if (across) r = x1 > x0 ? ((P.order === 'end') !== rtl ? x1 - g.cx : g.cx - x0) / (x1 - x0) : 0;
        const xi = across ? (r * (x1 - x0)) / adv : r * (n - 1);
        return { xi, r, d: Math.hypot(g.cx, g.cy) / adv, side: g.cx < 0 ? -1 : 1 };
      });
      const lambda = clamp(P.wavelength, 1.5, Math.max(2, n));
      // Fit the wave to the leading: the height is the wave, so the crest's scale pulse gives way
      // first (it eats leading even when stacked letters move together), then the height.
      let scaleK = 1, ampK = ampLimit(f, G, lambda, 1);
      for (const k of [0.75, 0.5, 0.25, 0]) {
        if (ampK >= 0.85) break;
        const a = ampLimit(f, G, lambda, k);
        if (a > ampK) { ampK = a; scaleK = k; }
      }
      return { adv, W, lo, hi, base, G, lambda, ampK, scaleK };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      const n = L.count;
      if (!n) return;
      const mode = P.mode;
      const amp = P.amp * f.size * C.ampK;
      const lambda = C.lambda;
      const cp = Math.max(1, Math.round(P.cycles)) * f.p;
      const env = (ENVELOPES[P.envelope] || ENVELOPES.steady)(f.p);
      const slopePx = amp / C.adv; // a slope of 1 amp per glyph, in px per px
      const rise = TM.ease(P.rise, 'outCubic');
      const squash = P.squash * env;
      const tilt = 0.2 * (P.order === 'end' ? -1 : 1);
      const baseline = mode === 'bounce' || mode === 'cascade';
      const W = C.W;
      const pal = f.layer.fill.palette;
      const out = [];

      for (const line of L.lines) {
        const rows = [];
        let total = 0;
        // Left to right on screen (RTL lines are in bidi visual order, not reading order), so the
        // re-flow pushes each glyph's right-hand neighbours.
        for (const gi of K.screenOrder(L, line)) {
          const g = L.glyphs[gi];
          if (g.isSpace) continue;
          let { y, slope, sy, lean, ph } = waveAt(mode, P, C.G[gi], cp, lambda, rise, squash);
          y *= env;
          slope *= env;
          lean *= env;

          // Weight follows height: heavier on the crest, lighter in the trough, base at rest.
          let weight = null, dw = 0;
          if (W) {
            const w = y >= 0 ? W.base + (W.hi - W.base) * Math.min(1, y) : W.base - (W.base - W.lo) * Math.min(1, -y);
            weight = K.quantWeight(w);
            const a = y >= 0 ? lerp(C.base[gi], C.hi[gi], Math.min(1, y)) : lerp(C.base[gi], C.lo[gi], Math.min(1, -y));
            dw = a - C.base[gi];
          }
          const s = Math.max(0.05, 1 + P.scale * C.scaleK * y);
          // Re-flow: the glyph's slot grows with weight and (mostly) with its scale pulse.
          const grow = (g.w + dw) * (1 + (s - 1) * 0.8) - g.w;
          rows.push({ g, y, slope, sy, lean, ph, weight, dw, s, grow, shift: total + grow / 2 });
          total += grow;
        }
        const align = f.layer.type.align;
        const anchorShift = align === 'left' ? 0 : align === 'right' ? total : total / 2;
        for (const r of rows) {
          const g = r.g;
          const rot = Math.atan(r.slope * slopePx) * P.follow + r.lean * tilt * P.follow;
          const sx = r.s / Math.sqrt(r.sy);
          const sy = r.s * r.sy;
          let x = f.cx + g.cx + r.shift - anchorShift;
          let y = f.cy + (baseline ? g.y : g.cy) - r.y * amp;
          if (r.dw) {
            // drawGlyph centres the layout advance; shift so the heavier glyph stays centred.
            x -= (r.dw / 2) * sx * Math.cos(rot);
            y -= (r.dw / 2) * sx * Math.sin(rot);
          }
          const alpha = 1 - P.depth * clamp(-r.y);
          const color = P.colorWave ? f.colorOverride || TM.color.ramp(pal, r.ph) : undefined;
          out.push({ g, o: { x, y, rot, sx, sy, alpha, color, weight: r.weight, anchor: baseline ? 'baseline' : 'center' }, z: sx * sy });
        }
      }
      // Bigger (nearer) letters draw last so crests overlap troughs, not the other way round.
      out.sort((a, b) => a.z - b.z);
      for (const it of out) f.drawGlyph(it.g, it.o);
    },

    looks: [
      { name: 'Variable surge', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Roboto Flex', weight: 400 }, fill: { type: 'solid', color: '#141414' }, params: { weightRange: 1, amp: 0.3, scale: 0.1 } } },
      { name: 'Neon bounce', bg: { type: 'solid', color: '#07000f' }, layer: { font: { family: 'Unbounded', weight: 800 }, fill: { type: 'palette', palette: ['#ff00e5', '#00f0ff', '#faff00', '#ffffff'] }, fx: { glow: { amount: 0.4, color: '#ff00e5' } }, params: { mode: 'bounce', colorWave: true } } },
      { name: 'Sunset cascade', bg: { type: 'solid', color: '#1b0a2e' }, layer: { font: { family: 'Bricolage Grotesque', weight: 800 }, fill: { type: 'palette', palette: ['#ff5e5b', '#ffb547', '#ffe3a3', '#ff2e88'] }, params: { mode: 'cascade', amp: 0.5 } } },
    ],
  });
})(window.TM);
