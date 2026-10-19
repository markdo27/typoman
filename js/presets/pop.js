/* Preset: Pop — letters drop in, squash on landing, bounce and settle; then crouch and spring away.
 *
 * Craft notes
 *  - The ease-in is the fall curve (inQuad = gravity). Stretch grows with the letter's speed, so
 *    it is longest just before impact; the contact frame flips it into a squash that springs out.
 *  - A smaller rebound hop with its own, lighter squash sells the weight; every letter is upright
 *    and at rest by the end of its window, so the hold is perfectly still.
 *  - All squash and stretch is anchored on the baseline, so letters squash onto the floor.
 *  - Exit: a crouch (anticipation) and then a stretched zip off the top of the frame, or a
 *    swell-and-pop like a bubble.
 */
(function (TM) {
  'use strict';
  const { clamp, smoothstep } = TM.math;
  const DEG = Math.PI / 180;
  const FALL = 0.34; // share of the in-window spent falling

  const slope = TM.MotionKit.slope;

  TM.registerPreset({
    id: 'pop',
    name: 'Pop',
    category: 'Reveal',
    description: 'Letters drop in with squash and stretch, bounce and settle, then crouch and spring away.',
    looks: [
      { name: 'Cartoon', bg: { type: 'solid', color: '#f6bf26' },
        layer: { font: { family: 'Bowlby One', weight: 400 }, fill: { type: 'solid', color: '#ffffff' }, stroke: { mode: 'both', width: 0.05, color: '#111111' },
          fx: { shadow: { amount: 1, angle: 60, distance: 0.012, color: '#111111' } }, params: { squash: 0.8, bounce: 0.75 } } },
      { name: 'Candy', bg: { type: 'solid', color: '#ffd6e0' },
        layer: { font: { family: 'Titan One', weight: 400 }, fill: { type: 'palette', palette: ['#ff3e6c', '#2b0a3d', '#ff9f1c', '#00b38f'] },
          params: { exit: 'pop', wobble: 12 } } },
      { name: 'Ink Drop', bg: { type: 'solid', color: '#f4f1ea' },
        layer: { font: { family: 'Shrikhand', weight: 400 }, type: { case: 'none' }, fill: { type: 'solid', color: '#141414' },
          params: { height: 3, squash: 0.45, bounce: 0.35 } } },
    ],
    params: [
      ...TM.P.sequence({ inDur: 0.5, outDur: 0.26, stagger: 0.55, easeIn: 'inQuad', easeOut: 'inCubic' }),
      TM.P.range('height', 'Drop height (em)', 0.3, 6, 0.05, 2, { group: 'Bounce' }),
      TM.P.range('squash', 'Squash & stretch', 0, 1, 0.01, 0.6, { group: 'Bounce' }),
      TM.P.range('bounce', 'Bounciness', 0, 1, 0.01, 0.55, { group: 'Bounce' }),
      TM.P.range('wobble', 'Tilt (°)', 0, 30, 0.5, 7, { group: 'Bounce' }),
      TM.P.select('exit', 'Exit', [['jump', 'Spring away'], ['pop', 'Pop']], 'jump', { group: 'Exit' }),
      TM.P.range('anticipation', 'Anticipation', 0, 1, 0.01, 0.7, { group: 'Exit' }),
    ],

    render(f) {
      const P = f.params, L = f.layout;
      const eIn = TM.ease(P.easeIn, 'inQuad'), eOut = TM.ease(P.easeOut, 'inCubic');
      const em = L.sizePx, H = P.height * em, sq = P.squash;
      const impactV = Math.max(1e-3, slope(eIn, 1));
      const outV = Math.max(1e-3, slope(eOut, 1));
      const hopShare = 0.3 + 0.12 * P.bounce;     // share of the post-impact time spent airborne
      const hopH = H * 0.16 * P.bounce;
      const jumpD = f.cy + L.height / 2 + em * 1.6; // far enough to leave the top of the frame

      for (const g of L.glyphs) {
        if (g.isSpace) continue;
        const s = f.seq(g);
        if (!s.visible) continue;
        const side = f.rand(g.i, 5) < 0.5 ? -1 : 1;
        let y = 0, sy = 1, rot = 0, alpha = 1, scale = 1;

        if (s.kout <= 0) {
          const u = s.kin;
          if (u < FALL) {
            // Falling: stretch builds with speed.
            const w = u / FALL;
            y = -H * (1 - eIn(w));
            const v = clamp(slope(eIn, w) / impactV);
            sy = 1 + sq * 0.5 * v * v;
            rot = side * P.wobble * DEG * (1 - 0.5 * w);
            alpha = smoothstep(0, 0.16, w);
          } else {
            // Landed: a squash spring from each impact, with a rebound hop in between. The second
            // impact's spring ramps in over a couple of frames and adds to what is left of the
            // first, so the shape never steps.
            const w = (u - FALL) / (1 - FALL);
            const settle = 1 - smoothstep(0.72, 1, w);
            const amp = sq * 0.42;
            let squash = amp * Math.exp(-w * 7) * Math.cos(w * 26);
            if (P.bounce > 0) {
              if (w < hopShare) {
                const q = w / hopShare;
                y = -hopH * 4 * q * (1 - q);
              } else {
                const since = w - hopShare;
                squash += amp * 0.42 * P.bounce * smoothstep(0, 0.06, since) * Math.exp(-since * 7) * Math.cos(since * 26);
              }
            }
            sy = 1 - squash * settle;
            rot = side * P.wobble * DEG * 0.5 * Math.exp(-w * 6) * Math.cos(w * 17) * settle;
          }
        } else {
          // Exit: crouch, then spring away (or swell and pop).
          const u = s.kout;
          const a = 0.42 * P.anticipation;
          const crouch = P.anticipation * 0.26 * (a > 0 ? smoothstep(0, a, u) : 1);
          if (u < a) {
            sy = 1 - crouch;
          } else {
            const w = (u - a) / (1 - a);
            const release = crouch * (1 - smoothstep(0, 0.14, w)); // the squash snaps back as it launches
            if (P.exit === 'pop') {
              scale = w < 0.35 ? 1 + 0.32 * TM.EASINGS.outQuad(w / 0.35) : 1.32 * (1 - eOut((w - 0.35) / 0.65));
              sy = 1 - release;
              alpha = 1 - smoothstep(0.75, 1, w);
            } else {
              y = -jumpD * eOut(w);
              const v = clamp(slope(eOut, w) / outV);
              sy = (1 - release) * (1 + sq * 0.7 * v);
              rot = -side * P.wobble * DEG * 0.6 * eOut(w);
              alpha = 1 - smoothstep(0.8, 1, w);
            }
          }
        }
        if (alpha <= 0.002 || scale <= 0.002) continue;
        // Volume-ish preservation: squashing widens, stretching narrows.
        const sx = 1 / Math.sqrt(Math.max(0.2, sy));
        f.drawGlyph(g, {
          x: f.cx + g.cx,
          y: f.cy + g.y + y,
          anchor: 'baseline',
          sx: sx * scale,
          sy: sy * scale,
          rot,
          alpha,
        });
      }
    },
  });
})(window.TM);
