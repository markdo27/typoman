/* Preset: Particles — the text as a field of particles that assemble into the letters, hold as
 * dot or tile lettering (or condense into solid type), then disperse. Targets come from
 * rasterising the layout once at a fixed reference size, so every render size gets the same
 * particles; flight paths are seeded, with noise that settles as each particle lands.
 */
(function (TM) {
  'use strict';
  const { clamp, smoothstep, TAU } = TM.math;
  const REF = 120; // reference type size for sampling
  const MAX = 4200; // particle budget

  TM.registerPreset({
    id: 'particles',
    name: 'Particles',
    category: 'Generative',
    description: 'The text as a swarm of particles that assemble into the letters, hold, then blow away.',
    params: [
      ...TM.P.sequence({ inDur: 0.42, outDur: 0.32, stagger: 0.45, easeIn: 'glide', easeOut: 'inCubic' }),
      TM.P.select('from', 'Arrive from', [['scatter', 'Everywhere'], ['wind', 'The left'], ['rise', 'Below'], ['center', 'The centre']], 'scatter', { group: 'Motion' }),
      TM.P.select('leave', 'Leave to', [['wind', 'The right'], ['scatter', 'Everywhere'], ['fall', 'Gravity'], ['center', 'The centre']], 'wind', { group: 'Motion' }),
      TM.P.range('swirl', 'Swirl', 0, 1, 0.01, 0.45, { group: 'Motion', hint: 'Noise along the flight' }),
      TM.P.range('shimmer', 'Shimmer', 0, 1, 0.01, 0.15, { group: 'Motion', hint: 'Idle drift while the word holds' }),
      TM.P.range('density', 'Density', 0.3, 1, 0.01, 0.7, { group: 'Look', hint: 'Particles per letter (more is slower)' }),
      TM.P.select('shape', 'Shape', [['dot', 'Dots'], ['square', 'Tiles']], 'dot', { group: 'Look' }),
      TM.P.range('grain', 'Particle size', 0.3, 1.4, 0.01, 0.85, { group: 'Look' }),
      TM.P.range('solid', 'Condense', 0, 1, 0.01, 0, { group: 'Look', hint: 'Landed particles condense into solid letters while the word holds' }),
    ],

    setup(f) {
      const ly = f.layer, L = f.layout;
      const k = REF / L.sizePx; // layout px → reference px
      const pad = REF * 0.4;
      const w = Math.ceil(L.width * k + pad * 2), h = Math.ceil((L.height + L.descent) * k + pad * 2);
      const c = TM.MotionKit ? TM.MotionKit.canvas(w, h) : document.createElement('canvas');
      c.width = Math.max(1, w); c.height = Math.max(1, h);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.font = TM.fonts.fontString(ly.font.family, ly.font.weight, REF);
      if ('fontKerning' in ctx) ctx.fontKerning = 'normal';
      ctx.textBaseline = 'alphabetic';
      // Each glyph at its layout position, scaled to the reference size.
      for (const g of L.glyphs) if (!g.isSpace) ctx.fillText(g.ch, pad + (g.x + L.width / 2) * k, pad + (g.y + L.height / 2) * k);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      // Grid step from density, widened until the particles fit the budget.
      let step = Math.max(1.6, REF * (0.11 - 0.075 * f.params.density));
      let pts = sample(data, c.width, c.height, step);
      while (pts.length > MAX) { step *= 1.12; pts = sample(data, c.width, c.height, step); }
      // Back to layout px around the block centre, with the glyph each point belongs to; the
      // layer's slant leans each glyph's particles about its centre, as drawGlyph does.
      const lean = Math.tan(f.slant || 0);
      const parts = pts.map((p, i) => {
        const x = (p.x - pad) / k - L.width / 2, y = (p.y - pad) / k - L.height / 2;
        const g = glyphAt(L, x, y);
        return {
          tx: x - lean * (y - (g ? g.cy : 0)), ty: y, g,
          r1: TM.rand(f.seed, i, 11), r2: TM.rand(f.seed, i, 23), r3: TM.rand(f.seed, i, 37),
        };
      });
      return { parts, step: step / k };
    },

    render(f) {
      const P = f.params, C = f.cache, L = f.layout;
      if (!C.parts.length) return;
      const ctx = f.ctx;
      const span = Math.max(f.W, f.H);
      const r = (C.step / 2) * P.grain;
      const noise = f.noise;
      const eIn = f.ease(P.easeIn), eOut = f.ease(P.easeOut);
      // Per-glyph sequence windows (one f.seq per glyph, not per particle).
      const seqs = new Array(L.glyphs.length);
      const seqOf = (g) => seqs[g.i] || (seqs[g.i] = f.seq(g));
      // Condense: how solid each glyph is (landed and not yet leaving).
      const solidOf = (s) => P.solid * smoothstep(0.8, 1, s.kin) * (1 - smoothstep(0, 0.12, s.kout));
      if (P.solid > 0) {
        for (const g of L.glyphs) {
          if (g.isSpace) continue;
          const a = solidOf(seqOf(g));
          if (a > 0.002) f.drawGlyph(g, { alpha: a });
        }
      }
      f.identity();
      // Particles grouped by colour so each colour fills once.
      const groups = new Map();
      const gradient = f.layer.fill.type === 'gradient' && !f.colorOverride;
      for (let i = 0; i < C.parts.length; i++) {
        const q = C.parts[i];
        const g = q.g || L.glyphs[0];
        // The glyph's window, warped per particle so a letter's particles don't move as one;
        // the warp keeps 0 and 1 fixed, so the loop still starts and ends empty.
        const s = seqOf(g);
        const j = (q.r3 - 0.5) * 0.7;
        const kin = s.kin > 0 && s.kin < 1 ? Math.pow(s.kin, 1 + j) : s.kin;
        const kout = s.kout > 0 && s.kout < 1 ? Math.pow(s.kout, 1 - j) : s.kout;
        if (kin <= 0 || kout >= 1) continue;
        const vin = eIn(kin), vout = eOut(kout);
        const tx = f.cx + q.tx, ty = f.cy + q.ty;
        let x = tx, y = ty;
        if (kin < 1) {
          // Curved flight: the swirl pushes sideways and fades out as the particle lands. Eases
          // that overshoot carry it past its target and back.
          const o = origin(P.from, q, f, span);
          const sw = P.swirl * span * 0.12 * (1 - clamp(vin)) * Math.sin(Math.PI * clamp(vin));
          x = o.x + (tx - o.x) * vin + noise.loop(f.p, q.r1 * 50, 1) * sw;
          y = o.y + (ty - o.y) * vin + noise.loop(f.p, q.r2 * 50 + 7, 1) * sw;
        }
        if (kout > 0) {
          const d = away(P.leave, q, f, span, tx, ty);
          x += (d.x - tx) * vout + noise.loop(f.p, q.r2 * 50 + 3, 1) * P.swirl * span * 0.05 * vout;
          y += (d.y - ty) * vout + (P.leave === 'fall' ? vout * vout * span * 0.6 : 0);
        }
        if (P.shimmer > 0) {
          x += noise.loop(f.p, q.r1 * 90, 2) * C.step * P.shimmer * 0.6;
          y += noise.loop(f.p, q.r2 * 90, 2) * C.step * P.shimmer * 0.6;
        }
        let size = r * (0.55 + 0.45 * clamp(vin, 0, 1.3)) * (1 - 0.6 * vout);
        if (P.solid > 0) size *= 1 - solidOf(s);
        if (size < 0.15) continue;
        const color = gradient ? '' : f.colorOf(g);
        let gp = groups.get(color);
        if (!gp) groups.set(color, (gp = []));
        gp.push(x, y, size);
      }
      const ring = f.strokeMode === 'outline';
      if (ring) ctx.lineWidth = Math.max(1, r * 0.45);
      for (const [color, arr] of groups) {
        ctx.beginPath();
        for (let n = 0; n < arr.length; n += 3) {
          const x = arr[n], y = arr[n + 1], s = arr[n + 2];
          if (P.shape === 'square') ctx.rect(x - s, y - s, s * 2, s * 2);
          // Dots under ~2.5 px across look the same as a square of equal area, at a third the cost.
          else if (s < 1.25 && !ring) { const h = s * 0.886; ctx.rect(x - h, y - h, h * 2, h * 2); }
          else { ctx.moveTo(x + s, y); ctx.arc(x, y, s, 0, TAU); }
        }
        const paint = color || f.textPaint({ vi: 0 });
        if (ring) { ctx.strokeStyle = paint; ctx.stroke(); } else { ctx.fillStyle = paint; ctx.fill(); }
      }
    },

    looks: [
      { name: 'Stardust', bg: { type: 'radial', color: '#1b1640', color2: '#05030f' }, layer: { font: { family: 'Unbounded', weight: 800 }, fill: { type: 'gradient', color: '#ffe8a3', color2: '#ff6ad5', angle: 120 }, fx: { glow: { amount: 0.35, color: '#ff6ad5' } }, params: { from: 'scatter', leave: 'wind', shape: 'dot', density: 0.8, swirl: 0.6 } } },
      { name: 'Pixel rain', bg: { type: 'solid', color: '#0a0a0a' }, layer: { font: { family: 'Press Start 2P', weight: 400 }, fill: { type: 'palette', palette: ['#39ff14', '#00f0ff', '#faff00'] }, params: { from: 'rise', leave: 'fall', shape: 'square', density: 0.75, grain: 1, swirl: 0.2 } } },
      { name: 'Sandstorm', bg: { type: 'solid', color: '#f1e3c8' }, layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'solid', color: '#7a4a1f' }, params: { from: 'wind', leave: 'wind', shape: 'dot', density: 0.9, grain: 0.7, swirl: 0.8 } } },
      { name: 'Condense', bg: { type: 'solid', color: '#0015ff' }, layer: { font: { family: 'Anton', weight: 400 }, fill: { type: 'solid', color: '#ffffff' }, params: { from: 'center', leave: 'scatter', shape: 'square', density: 0.6, swirl: 0.3, easeIn: 'overshoot', solid: 1 } } },
    ],
  });

  /** Opaque samples of a rasterised block on a fixed grid (deterministic). */
  function sample(data, w, h, step) {
    const out = [];
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        if (data[((y | 0) * w + (x | 0)) * 4 + 3] > 140) out.push({ x, y });
      }
    }
    return out;
  }

  /** The glyph whose box holds a point (layout coords), or the nearest one, favouring its line. */
  function glyphAt(L, x, y) {
    let best = null, bd = Infinity;
    for (const g of L.glyphs) {
      if (g.isSpace) continue;
      const dx = Math.max(g.x - x, 0, x - (g.x + g.w));
      const d = dx * 4 + Math.abs(y - g.cy);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  function origin(mode, q, f, span) {
    switch (mode) {
      case 'wind': return { x: -span * (0.15 + 0.5 * q.r1), y: f.cy + (q.r2 - 0.5) * f.H * 1.2 };
      case 'rise': return { x: f.cx + q.tx + (q.r1 - 0.5) * span * 0.3, y: f.H + span * (0.1 + 0.6 * q.r2) };
      case 'center': return { x: f.cx + (q.r1 - 0.5) * 6, y: f.cy + (q.r2 - 0.5) * 6 };
      default: {
        const a = q.r1 * TAU, d = span * (0.45 + 0.6 * q.r2);
        return { x: f.cx + Math.cos(a) * d, y: f.cy + Math.sin(a) * d };
      }
    }
  }

  function away(mode, q, f, span, tx, ty) {
    switch (mode) {
      case 'scatter': {
        const a = q.r2 * TAU, d = span * (0.5 + 0.6 * q.r3);
        return { x: tx + Math.cos(a) * d, y: ty + Math.sin(a) * d };
      }
      case 'fall': return { x: tx + (q.r1 - 0.5) * span * 0.08, y: ty };
      case 'center': return { x: f.cx, y: f.cy };
      default: return { x: f.W + span * (0.2 + 0.6 * q.r1), y: ty + (q.r2 - 0.5) * span * 0.25 };
    }
  }
})(window.TM);
