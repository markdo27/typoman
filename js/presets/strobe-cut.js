/* Preset: Strobe Cut — a flash edit on the beat. Whole beats per loop; every beat hard-cuts to
 * the next word (or line, or letter) with a new framing: scale jumps, position jumps, quarter
 * turns, invert flashes and stutters, with the full phrase landing on the last beat of a bar.
 *
 * Craft notes
 *  - Each beat lands with a punch (an overshoot that decays in the first third of the beat), so
 *    the cut hits rather than just swaps.
 *  - Framings are seeded per beat and clamped to stay inside the frame unless the beat is a
 *    deliberate "crop" (oversized type running off the edges).
 *  - The loop starts half a beat in, so the seam falls inside a beat and stays continuous.
 */
(function (TM) {
  'use strict';
  const K = TM.MotionKit;
  const { smoothstep, fract } = TM.math;

  TM.registerPreset({
    id: 'strobe-cut',
    name: 'Strobe Cut',
    category: 'Glitch',
    description: 'A flash edit on the beat: hard cuts between your words with scale and position jumps, invert flashes and stutters.',
    looks: [
      { name: 'Rave', bg: { type: 'solid', color: '#000000' },
        layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'palette', palette: ['#ff00e5', '#00f0ff', '#faff00', '#ffffff'] },
          fx: { glow: { amount: 0.3, color: '#ff00e5' } }, params: { colors: 'palette', flash: 0.7, beats: 16, stutter: 0.15 } } },
      { name: 'Mono Strobe', bg: { type: 'solid', color: '#ffffff' },
        layer: { font: { family: 'Inter Tight', weight: 900 }, fill: { type: 'solid', color: '#000000' }, params: { flash: 0.65, stutter: 0.5 } } },
      { name: 'Acid House', bg: { type: 'solid', color: '#d4ff3a' },
        layer: { font: { family: 'Rubik Mono One', weight: 400 }, fill: { type: 'solid', color: '#0b0b0c' }, params: { jump: 0.95, cutBy: 'letters', beats: 12 } } },
    ],
    params: [
      TM.P.range('beats', 'Beats per loop', 2, 32, 1, 8, { group: 'Beat', hint: 'Whole beats per loop. BPM = beats × 60 ÷ loop length' }),
      TM.P.select('cutBy', 'Cut between', [['words', 'Words'], ['lines', 'Lines'], ['letters', 'Letters']], 'words', { group: 'Beat' }),
      TM.P.select('pattern', 'Order', [['cycle', 'In order'], ['shuffle', 'Shuffle']], 'cycle', { group: 'Beat' }),
      TM.P.range('phrase', 'Full phrase every', 0, 8, 1, 4, { group: 'Beat', hint: 'The whole text lands on every Nth beat (0 = never)' }),
      TM.P.range('jump', 'Layout jumps', 0, 1, 0.01, 0.65, { group: 'Cuts' }),
      TM.P.range('flash', 'Invert flashes', 0, 1, 0.01, 0.5, { group: 'Cuts' }),
      TM.P.range('stutter', 'Stutter', 0, 1, 0.01, 0.35, { group: 'Cuts' }),
      TM.P.range('punch', 'Punch', 0, 1, 0.01, 0.6, { group: 'Cuts' }),
      TM.P.select('colors', 'Colour', [['text', 'Text colour'], ['palette', 'Cycle palette']], 'text', { group: 'Cuts' }),
    ],

    setup(f) {
      const L = f.layout, P = f.params;
      const units = P.cutBy === 'letters'
        ? L.glyphs.filter((g) => !g.isSpace).map((g) => ({ glyphs: [g.i], x0: g.x, x1: g.x + g.w, cx: g.cx, cy: g.cy, w: g.w }))
        : K.units(L, P.cutBy === 'lines' ? 'lines' : 'words');
      for (const u of units) u.fit = Math.min((f.W * 0.8) / Math.max(1, u.w), (f.H * 0.62) / Math.max(1, L.capH), 6);
      // The whole block, for phrase hits.
      const all = { glyphs: L.glyphs.filter((g) => !g.isSpace).map((g) => g.i), cx: 0, cy: 0, w: L.width, fit: 1 };
      return { units, all };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      if (!C || !C.units.length) return;
      const B = P.beats, N = C.units.length;
      const x = f.p * B + 0.5;                 // half a beat in: the seam falls inside beat 0
      const b = Math.floor(x) % B, local = fract(x);
      const beatSec = f.dur / B;
      const isPhrase = P.phrase > 0 && b % P.phrase === P.phrase - 1;

      // Which unit this beat shows.
      let unit = C.all;
      if (!isPhrase) {
        const shown = P.phrase > 0 ? b - Math.floor((b + 1) / P.phrase) : b; // non-phrase beats so far
        let k = shown % N;
        if (P.pattern === 'shuffle' && N > 1) {
          k = Math.floor(f.rand(b, 71) * N);
          const prev = Math.floor(f.rand((b + B - 1) % B, 71) * N);
          if (k === prev) k = (k + 1) % N;
        }
        unit = C.units[k];
      }

      // Framing for this beat (seeded).
      const r = (salt) => f.rand(b, salt), s = (salt) => f.srand(b, salt);
      const J = P.jump;
      const crop = !isPhrase && r(3) < 0.16 * J;
      const scales = [0.5, 0.72, 1, 1, 1.18];
      let S = isPhrase ? 1 : unit.fit * (crop ? 1.9 : 1 + (scales[Math.floor(r(4) * scales.length)] - 1) * J);
      const quarter = !isPhrase && !crop && r(5) < 0.2 * J && unit.w * S < f.H * 0.9;
      const rot = quarter ? (r(6) < 0.5 ? -1 : 1) * Math.PI / 2 : isPhrase ? 0 : s(7) * 0.07 * J;
      // Position jump, kept inside the frame unless this is a crop.
      const boxW = (quarter ? L.capH : unit.w) * S, boxH = (quarter ? unit.w : L.capH) * S;
      const mx = Math.max(0, (f.W - boxW) / 2 - f.unit * 0.05), my = Math.max(0, (f.H - boxH) / 2 - f.unit * 0.05);
      const dx = isPhrase ? 0 : (crop ? s(8) * f.W * 0.12 : s(8) * mx * J);
      const dy = isPhrase ? 0 : (crop ? s(9) * f.H * 0.1 : s(9) * my * J);

      // Beat envelope: punch, stutter, invert flash.
      const punch = 1 + P.punch * 0.16 * Math.exp(-local * 9) * (1 - smoothstep(0.3, 0.6, local));
      S *= punch * (1 + 0.035 * local); // a slow push through the beat
      // 16th-note strobe: the off-flashes leave a faint ghost, so a still frame is never empty.
      const ghost = r(10) < P.stutter * 0.7 && local < 0.5 && Math.floor(local * 8) % 2 === 1 ? 0.16 : 1;
      const flashLen = Math.min(0.09, beatSec * 0.35) / beatSec;
      const invert = ghost === 1 && r(11) < P.flash * 0.6 && local < flashLen;
      const pal = f.layer.fill.palette;
      const color = f.colorOverride || (P.colors === 'palette' ? pal[b % pal.length] : null);

      const ctx = f.ctx;
      if (invert) {
        f.identity();
        ctx.fillStyle = color || f.colorOf({ vi: 0 });
        ctx.fillRect(0, 0, f.W, f.H);
        ctx.globalCompositeOperation = 'destination-out';
      }
      const cs = Math.cos(rot), sn = Math.sin(rot);
      for (const gi of unit.glyphs) {
        const g = L.glyphs[gi];
        const ox = (g.cx - unit.cx) * S, oy = (g.cy - unit.cy) * S;
        const o = { x: f.cx + dx + ox * cs - oy * sn, y: f.cy + dy + ox * sn + oy * cs, rot, scale: S, alpha: ghost };
        if (color) o.color = color;
        f.drawGlyph(g, o);
      }
      if (invert) ctx.globalCompositeOperation = 'source-over';
    },
  });
})(window.TM);
