/* Preset: Zoom Through — the camera flies through your words. Each word (or line) waits one
 * zoom step deeper than the last; the camera pauses to read it, then dives through the counter
 * of one of its letters (the hole of an O, D, A…) and the next word grows out of that hole.
 *
 * Craft notes
 *  - Counters are found by rasterising candidate letters once (MotionKit.portal) and taking the
 *    centroid of the largest enclosed hole, so the camera really threads the letter.
 *  - Zoom is exponential (one constant ratio per word), so every step feels the same speed;
 *    each step eases out of and into a reading pause, and an optional twist rolls the camera.
 *  - Words cycle, and the camera position wraps after the last word, so it loops forever.
 *  - Photosensitivity: unless "Allow fast flashing" is on, once the camera leaves reading size
 *    only the letter it dives through keeps full contrast; the others fade to a ghost too faint
 *    to flash (MotionKit.ghostAlpha), and the next word stays a ghost until it nears reading
 *    size. Stroke after stroke sweeping a field is what TM.Safety counts as flashing.
 */
(function (TM) {
  'use strict';
  const K = TM.MotionKit;
  const { clamp, smoothstep, fract } = TM.math;

  TM.registerPreset({
    id: 'zoom-through',
    name: 'Zoom Through',
    category: 'Dimensional',
    description: 'The camera flies through the hole in a letter into the next word, again and again: an endless zoom through your text.',
    looks: [
      { name: 'Hyperspace', bg: { type: 'radial', color: '#14143a', color2: '#000000' }, post: { grain: 0.15 },
        layer: { font: { family: 'Unbounded', weight: 900 }, fill: { type: 'solid', color: '#ffffff' }, params: { twist: 0.45 } } },
      { name: 'Pop Art', bg: { type: 'solid', color: '#f6bf26' },
        layer: { font: { family: 'Bowlby One', weight: 400 }, fill: { type: 'solid', color: '#e63326' }, params: { twist: 0, hold: 0.45 } } },
      { name: 'Mint Dive', bg: { type: 'solid', color: '#062925' },
        layer: { font: { family: 'Syne', weight: 800 }, fill: { type: 'solid', color: '#5cffc8' }, params: { twist: -0.3 } } },
    ],
    params: [
      TM.P.select('split', 'Fly through', [['auto', 'Auto'], ['lines', 'Lines'], ['words', 'Words']], 'auto', { group: 'Flight', hint: 'Auto: lines when there are several, otherwise words' }),
      TM.P.range('hold', 'Reading pause', 0, 0.8, 0.01, 0.38, { group: 'Flight' }),
      TM.P.ease('ease', 'Flight curve', 'smooth', { group: 'Flight' }),
      TM.P.range('dive', 'Dive depth', 0.6, 2, 0.01, 1, { group: 'Flight', hint: 'Zoom per word, relative to just clearing the letter' }),
      TM.P.range('twist', 'Twist', -1, 1, 0.01, 0.25, { group: 'Flight' }),
      TM.P.toggle('counters', 'Aim for counters', true, { group: 'Flight', hint: 'Dive through the hole of an O, D, A… when the word has one' }),
      TM.P.range('fill', 'Fill the frame', 0, 1, 0.01, 0.55, { group: 'Framing' }),
      TM.P.toggle('fastFlash', 'Allow fast flashing', false, { group: 'Safety', hint: 'Each dive sweeps big strokes across the frame. Off keeps it to 3 flashes per second or fewer (WCAG 2.3.1): letters other than the one the camera dives through fade to a safe ghost, and words that come too fast merge into fewer stops' }),
    ],

    setup(f) {
      return { base: K.units(f.layout, splitOf(f.params, f.layout)), plans: new Map() };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      if (!C || !C.base.length) return;
      const plan = planFor(C, f), units = plan.units, N = units.length;
      const at = (m) => units[((m % N) + N) % N];
      // Camera position in "words": a reading pause, then an eased dive to the next word.
      const x = f.p * N, k = Math.floor(x), u = fract(x);
      const e = u < P.hold ? 0 : TM.ease(P.ease, 'smooth')((u - P.hold) / Math.max(1e-4, 1 - P.hold));
      const cam = k + e;
      // Log-scale of word m: each step between stops zooms by the ratio of the word being entered.
      const logScale = (m) => {
        let l = 0, t = m;
        if (cam >= m) while (t < cam) { const st = Math.min(1, cam - t); l += st * Math.log(at(Math.floor(t)).ratio); t += st; }
        else while (t > cam) { const st = Math.min(1, t - cam); l -= st * Math.log(at(Math.ceil(t) - 1).ratio); t -= st; }
        return l;
      };
      const items = [];
      for (let m = Math.floor(cam) - 1; m <= Math.floor(cam) + 2; m++) {
        const unit = at(m), R = unit.ratio, d = cam - m; // d: 0 reading, > 0 flown into, < 0 still ahead
        const s = Math.exp(logScale(m));
        if (s >= R) continue;
        const S = unit.scale * s;
        if (unit.w * S < 2) continue;
        // Ahead: stays hidden through the reading pause and appears as the dive begins, inside
        // the hole. Flown into: well before s = R its hole covers the frame; the fade is a backstop
        // so nothing of it is left by the next reading pause.
        const prev = at(m - 1).ratio;
        const alpha = smoothstep(1 / prev, Math.pow(prev, -0.6), s) * (1 - smoothstep(R * 0.6, R, s));
        if (alpha <= 0.002) continue;
        // Past reading size the camera aims for the portal, which slides to the frame centre.
        const aim = smoothstep(1, Math.pow(R, 0.4), s);
        const px = unit.cx + (unit.portal.x - unit.cx) * aim, py = unit.cy + (unit.portal.y - unit.cy) * aim;
        // Flicker guard: past reading size only the portal letter keeps its contrast (the rest
        // would sweep stroke after stroke across the frame); a word growing out of the hole
        // stays a ghost until it nears reading size.
        const ghost = plan.ghost < 1 ? (s > 1 ? smoothstep(1, Math.pow(R, 0.15), s) : 1 - smoothstep(Math.pow(prev, -0.2), Math.pow(prev, -0.04), s)) : 0;
        items.push({ unit, S, alpha, px, py, rot: P.twist * d * 0.35, d, ghost: ghost > 0 ? 1 + (plan.ghost - 1) * ghost : 1, out: s > 1 });
      }
      items.sort((a, b) => a.d - b.d); // far (small) first: near letters occlude what is behind them

      for (const it of items) {
        const cs = Math.cos(it.rot), sn = Math.sin(it.rot);
        for (const gi of it.unit.glyphs) {
          const g = L.glyphs[gi];
          const ox = (g.cx - it.px) * it.S, oy = (g.cy - it.py) * it.S;
          const X = f.cx + ox * cs - oy * sn, Y = f.cy + ox * sn + oy * cs;
          const rad = (g.w + L.capH) * it.S * 0.75; // skip letters that are wholly off-frame
          if (X + rad < 0 || X - rad > f.W || Y + rad < 0 || Y - rad > f.H) continue;
          const keep = it.out && it.unit.portal.glyphs.includes(gi);
          f.drawGlyph(g, { x: X, y: Y, rot: it.rot, scale: it.S, alpha: it.alpha * (keep ? 1 : it.ghost) });
        }
      }
    },

    /** Large-area luminance flashes per second this layer makes (0 when it cannot flash). */
    flashes(layer, scene) {
      const fr = K.frameOf(layer, scene, TM.getPreset('zoom-through'));
      const N = K.units(fr.layout, splitOf(layer.params, fr.layout)).length;
      return N ? stops(layer.params, N, fr.pass, flashy(layer, scene.bg)).rate : 0;
    },
  });

  function splitOf(P, L) {
    return P.split === 'auto' ? (L.lines.filter((l) => l.glyphs.length).length > 1 ? 'lines' : 'words') : P.split;
  }

  // ── photosensitivity ──
  // Measured with TM.Safety (10° fields): with the flicker guard on (only the portal letter keeps
  // its contrast past reading size), a dive still sweeps that letter's strokes across the frame,
  // up to six large transitions in a field, bunched in the middle of the dive. A dive is modelled
  // as those six. Unguarded (fast flashing allowed), every letter's strokes sweep: up to
  // fourteen. Low-contrast type cannot flash.
  const DIVE = [0.25, 0.3, 0.35, 0.4, 0.45, 0.5];
  const DIVE_FAST = Array.from({ length: 14 }, (_, i) => 0.25 + i * 0.025);
  const flashy = (layer, bg) => K.swing(1, K.inkColors(layer), K.backdrops(bg));
  function diveTimes(M, P, pass) {
    const out = [];
    for (let m = 0; m < M; m++) for (const q of (P.fastFlash ? DIVE_FAST : DIVE)) out.push(((m + P.hold + (1 - P.hold) * q) / M) * pass);
    return out;
  }
  /** How many stops the camera makes: one per unit or, with fast flashing off, as many as keep the dives under three flashes a second. */
  function stops(P, N, pass, canFlash) {
    if (!canFlash) return { M: N, rate: 0 };
    let M = N;
    if (!P.fastFlash) while (M > 1 && K.flashRate(diveTimes(M, P, pass), pass) > K.FLASH.perSec) M--;
    return { M, rate: K.flashRate(diveTimes(M, P, pass), pass) };
  }

  /** The units the camera stops at, for this frame's colours, background and timing (none of them re-run setup), framed for the dive. */
  function planFor(C, f) {
    const key = JSON.stringify([f.layer.fill, f.bg, f.layer.time, f.dur]);
    let plan = C.plans.get(key);
    if (!plan) {
      const P = f.params, L = f.layout;
      const { M } = stops(P, C.base.length, K.passOf(f), flashy(f.layer, f.bg));
      const units = group(L, C.base, M).map((u) => {
        const h = u.h || L.capH;
        const fit = Math.min((f.W * 0.8) / Math.max(1, u.w), (f.H * 0.5) / Math.max(1, h), 4);
        // Portal: the biggest counter near the middle, else a gap between letters.
        const portal = K.portal(f, L, u, P.counters);
        const scale = 1 + (fit - 1) * P.fill;
        // Zoom for the dive: just enough for the hole (an ellipse) to contain the whole frame.
        const need = Math.hypot(f.W / (portal.cw * scale), portal.ch === Infinity ? 0 : f.H / (portal.ch * scale));
        return Object.assign({}, u, { scale, portal, ratio: clamp(need * 1.4 * P.dive, 6, 200) }); // counters aren't ellipses: margin
      });
      // Ghost: how far letters that would flicker fade (to where they can no longer flash; 1 = no guard).
      plan = { units, ghost: P.fastFlash ? 1 : K.ghostAlpha(K.inkColors(f.layer), K.backdrops(f.bg)) * 0.8 };
      if (C.plans.size > 12) C.plans.clear();
      C.plans.set(key, plan);
    }
    return plan;
  }

  /** M stops from the units, merging neighbours as evenly as possible (M ≥ count: the units as they are). */
  function group(L, base, M) {
    const N = base.length;
    if (M >= N) return base;
    const out = [];
    for (let g = 0; g < M; g++) {
      const parts = base.slice(Math.floor((g * N) / M), Math.floor(((g + 1) * N) / M));
      const glyphs = [].concat(...parts.map((u) => u.glyphs));
      const x0 = Math.min(...parts.map((u) => u.x0)), x1 = Math.max(...parts.map((u) => u.x1));
      const ys = glyphs.map((gi) => L.glyphs[gi].y);
      const cy = glyphs.reduce((s, gi) => s + L.glyphs[gi].cy, 0) / glyphs.length;
      out.push({ glyphs, x0, x1, cx: (x0 + x1) / 2, cy, w: x1 - x0, line: parts[0].line, h: L.capH + Math.max(...ys) - Math.min(...ys) });
    }
    return out;
  }
})(window.TM);
