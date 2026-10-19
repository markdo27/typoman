/* Preset: Magnet — a magnet travels your path through the word. Letters sitting in their
 * readable layout are pushed away (or pulled in) as it passes, then spring back with overshoot.
 *
 * Deterministic by construction: a letter's displacement is the force history convolved with a
 * damped spring's impulse response, x(t) = Σ h(τ_k)·F(t − τ_k), evaluated afresh every frame over
 * a fixed window of past magnet positions. Those are a pure function of time (wrapped modulo the
 * loop), so there is no simulation state and frame(0) == frame(1). The kernel is normalised to
 * unit DC gain: a parked magnet pushes exactly "strength", a passing one makes letters overshoot.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp, lerp, fract, pingpong, mod } = TM.math;
  const K = TM.PathKit;
  const TAPS = 32;

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
      TM.P.range('strength', 'Strength (em)', 0, 2.5, 0.01, 0.9, { group: 'Magnet' }),
      TM.P.range('radius', 'Reach', 0.05, 0.6, 0.005, 0.2, { group: 'Magnet', hint: '× the frame’s short side' }),
      TM.P.range('bounce', 'Springiness', 0, 1, 0.01, 0.6, { group: 'Spring' }),
      TM.P.range('freq', 'Spring rate (Hz)', 0.5, 4, 0.05, 1.8, { group: 'Spring' }),
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

      // Damped-spring impulse response sampled over a fixed window of the past.
      const zeta = lerp(0.92, 0.18, P.bounce), omega = TAU * P.freq;
      const wd = omega * Math.sqrt(1 - zeta * zeta);
      const win = Math.min(dur, 5 / (zeta * omega));
      const dt = win / TAPS;
      const taps = [];
      let sum = 0;
      for (let k = 0; k < TAPS; k++) {
        const tau = (k + 0.5) * dt;
        const h = Math.exp(-zeta * omega * tau) * Math.sin(wd * tau);
        const m = at(mod(f.t - tau, dur) / dur);
        taps.push({ h, x: m.x, y: m.y });
        sum += h;
      }
      if (Math.abs(sum) < 1e-9) return;
      const R = P.radius * f.unit, S = P.strength * size * (P.mode === 'pull' ? -1 : 1);

      for (const g of L.glyphs) {
        if (g.isSpace) continue;
        const qx = f.cx + g.cx, qy = f.cy + g.cy;
        let dx = 0, dy = 0;
        for (const tp of taps) {
          const ex = qx - tp.x, ey = qy - tp.y;
          const d = Math.hypot(ex, ey) || 1e-3, xr = d / R;
          const fmag = (S * Math.exp(-xr * xr)) / d; // radial, Gaussian falloff
          dx += tp.h * ex * fmag;
          dy += tp.h * ey * fmag;
        }
        // Along a line letters have neighbours an advance away, so they mostly part across it.
        dx = (dx / sum) * 0.55;
        dy /= sum;
        const mag = Math.hypot(dx, dy);
        const rot = clamp((dx / size) * 0.55 * P.tilt, -1.2, 1.2);
        const sc = 1 + P.swell * clamp(mag / Math.max(1, Math.abs(S)));
        f.drawGlyph(g, { x: qx + dx, y: qy + dy, rot, scale: sc });
      }

      if (P.show && f.echo === 0) {
        const m = at(f.p);
        const ctx = f.ctx;
        ctx.save();
        K.strokeStyle(f, Math.max(1, f.unit * 0.002), 0.22);
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
      { name: 'Iron filings', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Space Grotesk', weight: 700 }, fill: { type: 'solid', color: '#141414' }, params: { strength: 1.4, tilt: 1.1, bounce: 0.3 }, path: 'infinity' } },
      { name: 'Gravity well', bg: { type: 'radial', color: '#062925', color2: '#000000' }, layer: { font: { family: 'Syne', weight: 800 }, fill: { type: 'palette', palette: ['#5cffc8', '#eafff7', '#00b38f'] }, params: { mode: 'pull', strength: 0.8, radius: 0.28, swell: -0.2 }, path: 'circle' } },
      { name: 'Jelly', bg: { type: 'solid', color: '#ff2e88' }, layer: { font: { family: 'Titan One', weight: 400 }, fill: { type: 'solid', color: '#ffe3a3' }, params: { bounce: 0.95, freq: 2.6, swell: 0.4 }, path: 'line' } },
    ],
  });
})(window.TM);
