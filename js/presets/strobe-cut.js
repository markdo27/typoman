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
 *  - Photosensitivity: invert flashes, stutters and cuts of big type are flashes in some 10°
 *    field (as TM.Safety counts them). Unless "Allow fast strobe" is on, the beat plan keeps
 *    them to two and a half a second at most (WCAG 2.3.1 allows three): cuts first, then
 *    inverts, then stutters, each kept only where the whole loop still fits. A cut that does not
 *    fit holds the previous framing, and held beats play as one shot (one punch, one push).
 *    flashes(layer, scene) reports the planned rate (MotionKit.FLASH rules).
 */
(function (TM) {
  'use strict';
  const K = TM.MotionKit;
  const { smoothstep, fract } = TM.math;
  const SCALES = [0.5, 0.72, 1, 1, 1.18];
  const GHOST = 0.16; // what a stutter's off-flash leaves of the text

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
      TM.P.toggle('fastFlash', 'Allow fast strobe (photosensitivity risk)', false, { group: 'Safety', hint: 'Off (the default) keeps the strobe to 3 flashes a second or fewer (WCAG 2.3.1) by holding cuts, inverts and stutters that come too fast. On plays every beat as set: faster flashing can trigger seizures in people with photosensitive epilepsy' }),
    ],

    setup(f) {
      const { units, all } = unitsOf(f.layout, f.params, f.W, f.H);
      return { units, all, plans: new Map() };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      if (!C || !C.units.length) return;
      const B = P.beats;
      const x = f.p * B + 0.5;                 // half a beat in: the seam falls inside beat 0
      const b = Math.floor(x) % B, local = fract(x);
      const beatSec = f.dur / B;
      const beat = planFor(C, f).beats[b], F = beat.F;

      // Beat envelope: punch, stutter, invert flash. Beats held on one framing (the flash guard)
      // are one long shot: a single punch, and the slow push runs through all of them.
      const run = beat.n > 1 ? (beat.k + local) / beat.n : local;
      const punch = beat.k ? 1 : 1 + P.punch * 0.16 * Math.exp(-local * 9) * (1 - smoothstep(0.3, 0.6, local));
      const S = F.S * (punch * (1 + 0.035 * run)); // a slow push through the beat
      // 16th-note strobe: the off-flashes leave a faint ghost, so a still frame is never empty.
      const ghost = beat.st && local < 0.5 && Math.floor(local * 8) % 2 === 1 ? GHOST : 1;
      const flashLen = Math.min(0.09, beatSec * 0.35) / beatSec;
      const invert = ghost === 1 && beat.inv && local < flashLen;
      const pal = f.layer.fill.palette;
      const color = f.colorOverride || (P.colors === 'palette' ? pal[F.b % pal.length] : null);

      const ctx = f.ctx;
      if (invert) {
        f.identity();
        ctx.fillStyle = color || f.colorOf({ vi: 0 });
        ctx.fillRect(0, 0, f.W, f.H);
        ctx.globalCompositeOperation = 'destination-out';
      }
      const unit = F.u, cs = Math.cos(F.rot), sn = Math.sin(F.rot);
      for (const gi of unit.glyphs) {
        const g = L.glyphs[gi];
        const ox = (g.cx - unit.cx) * S, oy = (g.cy - unit.cy) * S;
        const o = { x: f.cx + F.dx + ox * cs - oy * sn, y: f.cy + F.dy + ox * sn + oy * cs, rot: F.rot, scale: S, alpha: ghost };
        if (color) o.color = color;
        f.drawGlyph(g, o);
      }
      if (invert) ctx.globalCompositeOperation = 'source-over';
    },

    /** Large-area luminance flashes per second this layer makes (0 when it cannot flash). */
    flashes(layer, scene) {
      const fr = K.frameOf(layer, scene, TM.getPreset('strobe-cut'));
      const { units, all } = unitsOf(fr.layout, layer.params, fr.W, fr.H);
      if (!units.length) return 0;
      return plan(layer.params, units, all, envOf(fr, layer, scene.bg)).rate;
    },
  });

  /** The units a beat can show (words, lines or letters), each fitted to the frame, plus the whole block for phrase hits. */
  function unitsOf(L, P, W, H) {
    const units = P.cutBy === 'letters'
      ? L.glyphs.filter((g) => !g.isSpace).map((g) => ({ glyphs: [g.i], x0: g.x, x1: g.x + g.w, cx: g.cx, cy: g.cy, w: g.w }))
      : K.units(L, P.cutBy === 'lines' ? 'lines' : 'words');
    for (const u of units) u.fit = Math.min((W * 0.8) / Math.max(1, u.w), (H * 0.62) / Math.max(1, L.capH), 6);
    const all = { glyphs: L.glyphs.filter((g) => !g.isSpace).map((g) => g.i), cx: 0, cy: 0, w: L.width, fit: 1, all: true };
    return { units, all };
  }

  /** Everything the plan reads, from a frame or from frameOf(layer, scene). */
  function envOf(fr, layer, bg) {
    return {
      L: fr.layout, W: fr.W, H: fr.H, unit: fr.unit, cx: fr.cx, cy: fr.cy,
      rand: (a, b) => fr.rand(a, b), srand: (a, b) => fr.srand(a, b),
      pass: fr.pass, dur: fr.dur, inks: K.inkColors(layer), backs: K.backdrops(bg), echo: layer.fx.echo,
      pal: layer.fill.palette, fam: fr.layer.font.family, wt: fr.layer.font.weight, spread: K.inkSpread(layer),
    };
  }

  /** The plan for this frame's colours, background, anchor and timing (none of them re-run setup). */
  function planFor(C, f) {
    const l = f.layer;
    const key = JSON.stringify([l.fill, f.bg, l.anchor, l.time, f.dur]);
    let p = C.plans.get(key);
    if (!p) {
      const fr = {
        layout: f.layout, W: f.W, H: f.H, unit: f.unit, cx: f.cx, cy: f.cy, dur: f.dur, pass: K.passOf(f), layer: l,
        rand: (a, b) => f.rand(a, b), srand: (a, b) => f.srand(a, b),
      };
      p = plan(f.params, C.units, C.all, envOf(fr, l, f.bg));
      if (C.plans.size > 12) C.plans.clear();
      C.plans.set(key, p);
    }
    return p;
  }

  /** Beat b's own framing: which unit, its scale, turn and offset, and whether it inverts and stutters (seeded per beat). */
  function framing(b, P, units, all, e) {
    const B = P.beats, N = units.length;
    const isPhrase = P.phrase > 0 && b % P.phrase === P.phrase - 1;
    let u = all;
    if (!isPhrase) {
      const shown = P.phrase > 0 ? b - Math.floor((b + 1) / P.phrase) : b; // non-phrase beats so far
      let k = shown % N;
      if (P.pattern === 'shuffle' && N > 1) {
        k = Math.floor(e.rand(b, 71) * N);
        const prev = Math.floor(e.rand((b + B - 1) % B, 71) * N);
        if (k === prev) k = (k + 1) % N;
      }
      u = units[k];
    }
    const r = (salt) => e.rand(b, salt), s = (salt) => e.srand(b, salt);
    const J = P.jump;
    const crop = !isPhrase && r(3) < 0.16 * J;
    const S = isPhrase ? 1 : u.fit * (crop ? 1.9 : 1 + (SCALES[Math.floor(r(4) * SCALES.length)] - 1) * J);
    const quarter = !isPhrase && !crop && r(5) < 0.2 * J && u.w * S < e.H * 0.9;
    const rot = quarter ? (r(6) < 0.5 ? -1 : 1) * Math.PI / 2 : isPhrase ? 0 : s(7) * 0.07 * J;
    // Position jump, kept inside the frame unless this is a crop.
    const boxW = (quarter ? e.L.capH : u.w) * S, boxH = (quarter ? u.w : e.L.capH) * S;
    const mx = Math.max(0, (e.W - boxW) / 2 - e.unit * 0.05), my = Math.max(0, (e.H - boxH) / 2 - e.unit * 0.05);
    const dx = isPhrase ? 0 : (crop ? s(8) * e.W * 0.12 : s(8) * mx * J);
    const dy = isPhrase ? 0 : (crop ? s(9) * e.H * 0.1 : s(9) * my * J);
    return { b, u, S, rot, dx, dy, quarter, stutter: r(10) < P.stutter * 0.7, invert: r(11) < P.flash * 0.6 };
  }

  /**
   * The beat plan: for every beat the framing shown (its own, or the previous one held), whether
   * it inverts and stutters, the large luminance transitions that makes (seconds into a pass) and
   * the resulting flash rate. With fast flashing off, events are dropped in beat order until no
   * one-second window holds more than three flashes.
   */
  function plan(P, units, all, e) {
    const B = P.beats, real = e.pass / B, lay = e.dur / B;
    const flashLen = Math.min(0.09, lay * 0.35) / lay; // share of a beat an invert lasts (as render draws it)
    const own = [];
    for (let b = 0; b < B; b++) own.push(framing(b, P, units, all, e));

    // Coverage: the most of one 10° field a framing's ink covers (the unit's ink, grown by the
    // layer's effects and by the punch's peak scale, spread over its box clipped to the frame).
    const capH = e.L.capH;
    const grow = e.spread * Math.pow(1 + 0.16 * P.punch, 2);
    const inks = new Map();
    const inkOf = (u) => {
      let a = inks.get(u);
      if (a === undefined) {
        a = 0;
        for (const gi of u.glyphs) a += K.inkOf(e.fam, e.wt, e.L.glyphs[gi].ch, e.L.sizePx);
        a *= grow;
        inks.set(u, a);
      }
      return a;
    };
    const boxOf = (F) => {
      const uh = (F.u.all ? e.L.height : capH) * 1.15;
      const w = (F.quarter ? uh : F.u.w) * F.S, h = (F.quarter ? F.u.w : uh) * F.S;
      const x = e.cx + F.dx, y = e.cy + F.dy;
      return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, w, h };
    };
    const covOf = (F) => {
      const bx = boxOf(F);
      const cw = Math.max(0, Math.min(bx.x1, e.W) - Math.max(bx.x0, 0)), ch = Math.max(0, Math.min(bx.y1, e.H) - Math.max(bx.y0, 0));
      const ink = bx.w * bx.h > 0 ? inkOf(F.u) * F.S * F.S * ((cw * ch) / (bx.w * bx.h)) : 0;
      return K.fieldShare(ink, cw, ch, e.W, e.H);
    };
    const colOf = (F) => (P.colors === 'palette' ? [e.pal[F.b % e.pal.length]] : e.inks);
    // Is the cut F1 → F2 a large transition? Unless the framing stays put (then only the colour
    // can change), the old ink vanishes and the new appears somewhere in the frame.
    const cutLarge = (F1, F2) => {
      if (F1 === F2) return false;
      const c1 = covOf(F1), c2 = covOf(F2);
      const same = F1.u === F2.u && Math.abs(F1.S / F2.S - 1) < 0.01 && Math.abs(F1.dx - F2.dx) < 1 && Math.abs(F1.dy - F2.dy) < 1 && Math.abs(F1.rot - F2.rot) < 0.01;
      if (same) return K.swing(Math.min(c1, c2), colOf(F1), colOf(F2));
      return K.swing(Math.max(c1, c2), colOf(F1).concat(colOf(F2)), e.backs);
    };
    const fade = (cols, alpha) => [].concat(...e.backs.map((bk) => cols.map((c) => TM.color.mix(bk, c, alpha))));

    // A transition (area, colours either side) at time t, plus its echo copies that still count.
    const echo = e.echo && e.echo.count > 0 ? e.echo : null;
    const push = (out, t, area, a, b) => {
      if (!K.swing(area, a, b)) return;
      out.push(t);
      if (!echo) return;
      for (let k = 1; k <= (echo.count | 0); k++) {
        const al = Math.pow(echo.fade, k) * 0.9;
        const pa = echo.palette ? [e.pal[(k - 1) % e.pal.length]] : null;
        // Echoes trail by spacing × loop length in scene time, whatever the layer's cycles.
        if (K.swing(area, fade(pa || [].concat(a), al), fade(pa || [].concat(b), al))) out.push(t + k * echo.spacing * e.dur);
      }
    };

    // Beat b's transitions for decision d after a beat that showed framing prevF.
    const events = (b, d, prevF) => {
      const out = [], t0 = ((b - 0.5) / B) * e.pass, c = colOf(d.F), cov = covOf(d.F);
      const state = (u) => (d.st && u < 0.5 && Math.floor(u * 8) % 2 === 1 ? 'ghost' : d.inv && u < flashLen ? 'inv' : 'norm');
      const marks = [...new Set([0, 0.125, 0.25, 0.375, 0.5, flashLen])].filter((u) => u < 1).sort((x, y) => x - y);
      let was = 'norm'; // every beat ends in its normal state (inverts and stutters finish by mid-beat)
      for (const u of marks) {
        const now = state(u + 1e-9), t = t0 + u * real;
        // The cut (already judged large); a beat that opens on an invert or a ghost cuts too.
        if (u === 0 && cutLarge(prevF, d.F)) {
          push(out, t, 1, c, e.backs);
          // On short beats the punch's recoil moves big edges fast enough to count as well.
          if (P.punch > 0.2 && real < 0.2) push(out, t + 0.2 * real, 1, c, e.backs);
        }
        if (now !== was) {
          // Inverting floods the frame around the text; a ghost dims the text to 16 %.
          if (now === 'inv' || was === 'inv') push(out, t, 1, c, e.backs);
          else push(out, t, cov, c, fade(c, GHOST));
        }
        was = now;
      }
      return out;
    };
    const allEvents = (ds) => [].concat(...ds.map((d, b) => events(b, d, ds[(b + B - 1) % B].F)));

    let ds = own.map((F) => ({ F, inv: F.invert, st: F.stutter }));
    if (!P.fastFlash) {
      // Plan by priority, in beat order, keeping every one-second window under three flashes:
      // the cuts first (they are the edit), then the inverts, then the stutters.
      const limit = K.FLASH.perSec - 0.5; // half a flash of room for what the model leaves out (the punch's motion)
      const fits = (cand) => K.flashRate(allEvents(cand), e.pass) <= limit;
      const rechain = (cand) => { for (let b = 1; b < B; b++) if (cand[b].hold) cand[b].F = cand[b - 1].F; return cand; };
      // 1. Cuts. One that does not fit holds the previous framing (no cut, the beat still punches).
      ds = [];
      let times = [];
      for (let b = 0; b < B; b++) {
        const prevF = b > 0 ? ds[b - 1].F : own[B - 1];
        let d = { F: own[b], inv: false, st: false }, ev = events(b, d, prevF);
        if (b > 0 && K.flashRate(times.concat(ev), e.pass) > limit) { d = { F: prevF, inv: false, st: false, hold: true }; ev = []; }
        ds.push(d);
        times = times.concat(ev);
      }
      // The seam: beat 0 was planned against beat B−1's own framing. Hold from the end until it fits.
      for (let b = B - 1; b > 0 && !fits(ds); b--) if (!ds[b].hold) { ds[b] = { F: ds[b - 1].F, inv: false, st: false, hold: true }; rechain(ds); }
      // 2. Inverts, 3. stutters, each kept where the whole loop still fits.
      for (const key of ['inv', 'st']) {
        for (let b = 0; b < B; b++) {
          if (!(key === 'inv' ? own[b].invert : own[b].stutter)) continue;
          const cand = ds.slice();
          cand[b] = Object.assign({}, ds[b], { [key]: true });
          if (fits(cand)) ds = cand;
        }
      }
    }
    // Runs of held beats: each beat's place in its run (k) and the run's length (n).
    ds = ds.map((d) => Object.assign({}, d, { k: 0, n: 1 }));
    for (let b = 1; b < B; b++) if (ds[b].hold) ds[b].k = ds[b - 1].k + 1;
    for (let b = B - 1; b >= 0; b--) ds[b].n = b + 1 < B && ds[b + 1].hold ? ds[b + 1].n : ds[b].k + 1;
    const times = allEvents(ds);
    return { beats: ds, times, rate: K.flashRate(times, e.pass) };
  }
})(window.TM);
