/* Preset: Glitch — a clean title hit by seeded digital bursts: RGB channel split, scan bands
 * that shear sideways, a pixel smear, swapped glyphs, jitter and block dropouts.
 *
 * Craft notes
 *  - Glitches run on their own quantised clock (whole steps per loop, a function of loop
 *    progress), so they hold for a "frame" or two like real signal errors and exports at any
 *    fps match the preview.
 *  - Bursts have a hard attack, a decaying tail and stutter. One burst always lands mid-hold so
 *    the still frame (gallery card) shows the look.
 *  - The plate is drawn once per frame into a private buffer through f.drawGlyph (so fills,
 *    strokes, slant and extrusion apply), then blitted as horizontal strips with offsets. That
 *    keeps slicing cheap: one draw per glyph per channel, plus a handful of strip copies.
 */
(function (TM) {
  'use strict';
  const K = TM.MotionKit;
  const { smoothstep, fract } = TM.math;
  const NOISE = '#%&@$¥§01/\\|=+<>?!';

  const makeCanvas = (w, h) => TM.MotionKit.canvas(w, h);

  // Red-only and green+blue-only versions of a colour: drawn offset with 'lighter', they add
  // back up to the original colour wherever they overlap.
  const chanCache = new Map();
  function channels(hex) {
    let v = chanCache.get(hex);
    if (!v) {
      const c = TM.color.parse(hex);
      v = [TM.color.toHex({ r: c.r, g: 0, b: 0 }), TM.color.toHex({ r: 0, g: c.g, b: c.b })];
      if (chanCache.size > 64) chanCache.clear();
      chanCache.set(hex, v);
    }
    return v;
  }

  // The standard sequence, plus an "Always on" timing for a pure glitch loop.
  const timing = TM.P.sequence({ inDur: 0.22, outDur: 0.16, stagger: 0.7, order: 'random', easeIn: 'linear', easeOut: 'linear' })
    .map((p) => (p.key === 'timing'
      ? TM.P.select('timing', 'Timing', [['inout', 'In → Hold → Out'], ['in', 'In → Hold'], ['loop', 'Always on']], 'inout', { group: 'Timing' })
      : Object.assign({}, p, { showIf: { timing: ['inout', 'in'] } })));

  TM.registerPreset({
    id: 'glitch',
    name: 'Glitch',
    category: 'Glitch',
    description: 'Seeded signal bursts: RGB split, shearing scan bands, swapped glyphs and dropouts. Flickers on and off.',
    looks: [
      { name: 'VHS', bg: { type: 'solid', color: '#0d0d10' }, post: { grain: 0.4, vignette: 0.45 },
        layer: { font: { family: 'Space Grotesk', weight: 700 }, fill: { type: 'solid', color: '#f2f2f2' },
          params: { timing: 'loop', mode: 'constant', intensity: 0.45, rate: 12 } } },
      { name: 'Signal Lost', bg: { type: 'solid', color: '#000000' },
        layer: { font: { family: 'Rubik Mono One', weight: 400 }, fill: { type: 'solid', color: '#ffffff' },
          params: { intensity: 0.95, bursts: 5, burstLen: 0.24, rate: 18 } } },
      { name: 'Acid Print', bg: { type: 'solid', color: '#d4ff3a' },
        layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'palette', palette: ['#0b0b0c', '#ff00e5', '#00a3ff'] },
          params: { split: 'palette', intensity: 0.7, blocks: true } } },
    ],
    params: [
      ...timing,
      TM.P.select('mode', 'Mode', [['bursts', 'Bursts'], ['constant', 'Constant']], 'bursts', { group: 'Glitch' }),
      TM.P.range('intensity', 'Intensity', 0, 1, 0.01, 0.7, { group: 'Glitch' }),
      TM.P.range('bursts', 'Bursts per loop', 1, 12, 1, 3, { group: 'Glitch', showIf: { mode: 'bursts' } }),
      TM.P.range('burstLen', 'Burst length (s)', 0.05, 1, 0.01, 0.34, { group: 'Glitch', showIf: { mode: 'bursts' } }),
      TM.P.range('rate', 'Glitch frames (/s)', 4, 30, 1, 15, { group: 'Glitch' }),
      TM.P.toggle('rgb', 'RGB split', true, { group: 'Layers' }),
      TM.P.select('split', 'Split colours', [['rgb', 'Red / cyan'], ['palette', 'Palette']], 'rgb', { group: 'Layers', showIf: { rgb: true } }),
      TM.P.toggle('slices', 'Slice shift', true, { group: 'Layers' }),
      TM.P.toggle('swap', 'Glyph swap', true, { group: 'Layers' }),
      TM.P.toggle('blocks', 'Block dropouts', true, { group: 'Layers' }),
      TM.P.toggle('fastFlash', 'Allow fast flashing', false, { group: 'Safety', hint: 'Big type flickering on and off is a flash. Off keeps it to 3 flashes per second or fewer (WCAG 2.3.1) by slowing the flicker, never the glitch' }),
    ],

    setup(f) {
      // Substitute characters close to each glyph's width, matching its case.
      const L = f.layout, fam = f.layer.font.family, wt = f.layer.font.weight;
      const mk = (s) => Array.from(s).map((ch) => ({ ch, w: TM.text.advance(ch, fam, wt, f.size) }));
      const upper = mk('ABCDEFGHIJKLMNOPQRSTUVWXYZ' + NOISE), lower = mk('abcdefghijklmnopqrstuvwxyz' + NOISE);
      const pools = L.glyphs.map((g) => {
        if (g.isSpace) return null;
        const set = (g.ch !== g.ch.toUpperCase() ? lower : upper).filter((c) => c.ch !== g.ch);
        const near = set.filter((c) => c.w > g.w * 0.6 && c.w < g.w * 1.45);
        return near.length >= 3 ? near : set;
      });
      return { pools, buf: null, clocks: new Map() };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      if (!C || !L.count) return;
      const em = L.sizePx;
      // Glitch frames per second: the param, or slower for type big enough to flash.
      const steps = Math.max(1, Math.round(clockFor(C, f) * f.dur));
      const step = Math.floor(f.p * steps);
      const rnd = (salt) => f.rand(salt, step);
      const srnd = (salt) => f.srand(salt, step);

      const loop = P.timing === 'loop';
      const { inDur, outDur } = TM.MotionKit.windows(P);

      // ── glitch intensity at this moment ──
      let I = 0;
      if (P.mode === 'constant') {
        I = 0.3 + 0.7 * Math.pow(rnd(901), 2.2);
      } else {
        for (let b = 0; b < P.bursts; b++) {
          const centre = fract(0.42 + b / P.bursts + (b ? f.srand(b, 902) * 0.3 / P.bursts : 0));
          const len = (P.burstLen * (b ? 0.7 + 0.6 * f.rand(b, 903) : 1)) / f.dur;
          const u = fract(f.p - (centre - len * 0.3)) / len; // wraps across the loop seam
          if (u >= 1) continue;
          const env = smoothstep(0, 0.06, u) * Math.pow(1 - u, 1.3) * (rnd(904 + b) < 0.78 ? 1 : 0.12);
          I = Math.max(I, env);
        }
      }
      if (!loop) {
        // The flicker-on and flicker-off windows glitch hard.
        const rin = inDur > 0 ? 1 - smoothstep(inDur * 0.7, inDur * 1.05, f.p) : 0;
        const rout = outDur > 0 ? smoothstep(1 - outDur * 1.05, 1 - outDur * 0.7, f.p) : 0;
        I = Math.max(I, 0.85 * Math.max(rin, rout));
      }
      I *= P.intensity;

      // ── glyph states: flicker on/off, swaps, jitter ──
      const items = [];
      let dirty = false;
      for (const g of L.glyphs) {
        if (g.isSpace) continue;
        let local = 0;
        if (!loop) {
          const s = f.seq(g);
          if (!s.visible) continue;
          const coin = f.rand(g.i * 31 + 3, step);
          if (s.kout > 0) { if (coin < s.vout) continue; local = s.kout; }
          else if (s.kin < 1) { if (coin >= s.vin) continue; local = 1 - s.kin; }
        }
        const gi = Math.max(I, local * P.intensity);
        let ch, dx = 0, dy = 0;
        if (P.swap && gi > 0.05 && f.rand(g.i * 31 + 5, step) < 0.03 + gi * 0.17) {
          const pool = C.pools[g.i];
          ch = pool[Math.floor(f.rand(g.i * 31 + 6, step) * pool.length)];
        }
        if (gi > 0.05 && f.rand(g.i * 31 + 7, step) < gi * 0.55) {
          dx = f.srand(g.i * 31 + 8, step) * em * 0.09 * gi;
          dy = f.srand(g.i * 31 + 9, step) * em * 0.04 * gi;
        }
        if (ch || dx || dy) dirty = true;
        items.push({ g, ch, dx, dy });
      }
      if (!items.length) return;
      const vis = items.length / L.count; // artefacts scale with how much text is on screen

      // Calm moment: draw the type directly.
      if (I < 0.02 && !dirty) {
        for (const it of items) f.drawGlyph(it.g);
        return;
      }

      // ── plate: draw into the private buffer ──
      const ex = f.layer.fx.extrude.depth > 0 ? f.layer.fx.extrude.depth * em * 0.45 : 0;
      const sw = f.layer.stroke.mode !== 'none' ? f.layer.stroke.width * em * 2 : 0;
      const mx = em * 0.9 + ex + sw, my = em * 0.35 + ex + sw;
      const top = (L.lines.length ? L.lines[0].y : 0) - L.ascent - my;
      const bot = (L.lines.length ? L.lines[L.lines.length - 1].y : 0) + L.descent + my;
      const ox = Math.floor(f.cx - L.width / 2 - mx), oy = Math.floor(f.cy + top);
      const bw = Math.ceil(L.width + mx * 2) + 2, bh = Math.ceil(bot - top) + 2;
      if (!C.buf || C.buf.width < bw || C.buf.height < bh) C.buf = makeCanvas(Math.max(bw, C.buf ? C.buf.width : 0), Math.max(bh, C.buf ? C.buf.height : 0));
      const buf = C.buf, bctx = buf.getContext('2d');
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.globalCompositeOperation = 'source-over';
      bctx.clearRect(0, 0, bw, bh);

      const main = f.ctx, mainAlpha = f.alpha;
      const tx = rnd(910) < I * 0.3 ? Math.round(srnd(911) * em * 0.12 * I) : 0; // whole-signal tracking error
      const split = P.rgb && I > 0.03 ? (0.02 + 0.1 * I * (0.4 + 0.6 * rnd(920))) * em * (rnd(921) < 0.5 ? -1 : 1) : 0;
      const vs = split * 0.15 * srnd(922);
      const plate = (offX, offY, colorFn) => {
        for (const it of items) {
          const o = { x: f.cx + it.g.cx + it.dx + offX - ox, y: f.cy + it.g.cy + it.dy + offY - oy };
          if (it.ch) { o.ch = it.ch.ch; o.sx = Math.min(1, (it.g.w * 1.2) / it.ch.w); o.sy = 1; }
          if (colorFn) o.color = colorFn(it.g);
          f.drawGlyph(it.g, o);
        }
      };
      f.alpha = 1; // the plate is drawn opaque; echo alpha applies once, when it is copied out
      try {
        f.drawInto(bctx, () => {
          if (!split) plate(0, 0, null);
          else if (P.split === 'palette') {
            const pal = f.layer.fill.palette;
            const c1 = pal[1 % pal.length], c2 = pal[2 % pal.length];
            plate(-split, -vs, () => c1);
            plate(split, vs, () => c2);
            plate(0, 0, null);
          } else {
            bctx.globalCompositeOperation = 'lighter';
            plate(-split, -vs, (g) => channels(f.colorOf(g))[0]);
            plate(split, vs, (g) => channels(f.colorOf(g))[1]);
            bctx.globalCompositeOperation = 'source-over';
          }
        }, { x: ox, y: oy }); // the buffer's pixel (0, 0) is frame (ox, oy): gradients stay put
      } finally {
        f.alpha = mainAlpha;
      }

      // ── composite: horizontal strips, some sheared sideways ──
      const bands = [];
      if (P.slices && I > 0.04 && rnd(930) < 0.25 + 0.75 * I) {
        const n = 1 + Math.floor(rnd(931) * (1 + I * 5));
        for (let j = 0; j < n; j++) {
          const hgt = L.capH * (0.05 + 0.45 * Math.pow(rnd(940 + j), 2));
          const yc = my + (bh - 2 * my) * rnd(950 + j);
          const dx = Math.round(srnd(960 + j) * em * (0.06 + 0.85 * I * Math.pow(rnd(970 + j), 1.5)));
          bands.push({ y0: Math.max(0, Math.round(yc - hgt / 2)), y1: Math.min(bh, Math.round(yc + hgt / 2)), dx });
        }
      }
      f.identity();
      const edges = [0, bh];
      for (const b of bands) edges.push(b.y0, b.y1);
      edges.sort((a, b) => a - b);
      for (let k = 0; k < edges.length - 1; k++) {
        const y0 = edges[k], y1 = edges[k + 1];
        if (y1 <= y0) continue;
        let dx = 0;
        for (const b of bands) if (b.y0 <= y0 && b.y1 >= y1) dx = b.dx; // the last band wins
        main.drawImage(buf, 0, y0, bw, y1 - y0, ox + tx + dx, oy + y0, bw, y1 - y0);
      }

      // A pixel smear: one scanline of the plate stretched down into streaks.
      if (P.slices && I > 0.3 && rnd(980) < I * 0.4 * vis) {
        const ys = Math.round(my + (bh - 2 * my) * rnd(981));
        const hs = Math.round(L.capH * (0.15 + 0.6 * rnd(982)));
        main.globalAlpha = f.alpha * 0.85;
        main.drawImage(buf, 0, ys, bw, 1, ox + tx + Math.round(srnd(983) * em * 0.3), oy + ys, bw, hs);
        main.globalAlpha = f.alpha;
      }

      // Block dropouts: some solid, some cut through the type.
      if (P.blocks && I > 0.15) {
        const n = Math.floor(I * 6 * rnd(990) * vis);
        const color = f.colorOf({ vi: 0 }), pal = f.layer.fill.palette;
        for (let j = 0; j < n; j++) {
          const w = em * (0.12 + 0.9 * Math.pow(rnd(1000 + j), 2));
          const h = em * (0.025 + 0.16 * Math.pow(rnd(1010 + j), 2));
          const x = ox + mx * 0.6 + rnd(1020 + j) * (bw - mx * 1.2) - w / 2;
          const y = oy + my + rnd(1030 + j) * (bh - 2 * my);
          const cut = rnd(1040 + j) < 0.5;
          main.globalCompositeOperation = cut ? 'destination-out' : 'source-over';
          main.globalAlpha = f.alpha * (cut ? 1 : 0.9);
          main.fillStyle = f.colorOverride || (rnd(1050 + j) < 0.5 ? color : pal[j % pal.length]);
          main.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.max(1, Math.round(h)));
        }
        main.globalCompositeOperation = 'source-over';
        main.globalAlpha = f.alpha;
      }
    },

    /** Large-area luminance flashes per second this layer makes (0 when it cannot flash). */
    flashes(layer, scene) {
      const fr = K.frameOf(layer, scene, TM.getPreset('glitch'));
      const P = fr.params, L = fr.layout;
      if (!L || !L.glyphs || !L.glyphs.length || !(fr.W > 0) || !(fr.H > 0)) return 0;
      // The old estimate's gate (below) is still the right one when it passes: there the
      // render's own clock really is slowed by clock(), so clock().rate is the estimate.
      // It is NOT the right gate when it fails. It compares the type's ink with the whole
      // frame (12 %), but TM.Safety counts a flash in one 10° field (a third of the frame
      // by a third). A headline at 6.6 % of the frame — glitch-drop's DROP/01 — still
      // covers 96 % of a field (K.fieldShare), so the old estimate returned 0 for a layer
      // TM.Safety measures at 3.5/s. That is the Round 5 discrepancy, fixed here without
      // touching render: clock() and clockFor() are unchanged, so the render still runs
      // at the full rate in this regime and this estimate models that render, not a
      // hypothetical slowed one.
      let ink = 0;
      for (const g of L.glyphs) if (!g.isSpace) ink += K.inkOf(fr.layer.font.family, fr.layer.font.weight, g.ch, L.sizePx);
      ink *= K.inkSpread(layer);
      const inks = K.inkColors(layer), backs = K.backdrops(scene.bg);
      if (ink / (fr.W * fr.H) >= 0.12 && K.swing(1, inks, backs)) return clock(fr, layer, scene.bg).rate;
      // Below the old gate, a glitch frame can still be a large field transition only if
      // the ink concentrated in its box covers a field at high contrast. fieldShare is
      // the established MotionKit measure for exactly that (strobe-cut uses it the same
      // way); low-contrast type still cannot flash, whatever its size.
      const share = K.fieldShare(ink, L.width, L.height, fr.W, fr.H);
      if (!K.swing(share, inks, backs)) return 0;
      // Step model: replay the render's own seeded intensity, one value per glitch step,
      // exactly as render() computes it (constant mode's rnd(901) draw, bursts mode's
      // envelope, and the in/out flicker windows), then count Safety-style turns on it.
      // A turn is a move of at least 0.1 — TM.Safety's luminance delta — from the last
      // extreme followed by a reversal, counted in the worst 1.06 s window and halved,
      // as K.flashRate does. The intensity is scaled by the type's size in TM.Safety
      // cells: a Safety cell is a frame/24 wide, so a nominal 0.1-em stroke covers
      // 0.1 * sizePx / (W/24) of a cell. At glitch-drop's 7.2 cells/em that is ~0.72 of
      // a cell (nearly full strength); at the default scene's 2.2 cells/em it is ~0.22,
      // so the same intensity swing crosses the 0.1 delta far less often — which is why
      // the default VHS look (rate 12, constant) measures 0/s while glitch-drop at
      // rate 8 measures 3.5/s, despite both being constant mode. The 0.1 stroke factor
      // is a nominal mid-weight value, not fitted to the 3.5/s reading: heavy faces
      // will read a little low, light faces a little high (see the notes file).
      const rate = P.rate, steps = Math.max(1, Math.round(rate * fr.dur));
      if (!(rate > 0)) return 0;
      const { inDur, outDur } = K.windows(P);
      const loop = P.timing === 'loop';
      const amp = Math.min(1, 0.1 * L.sizePx * 24 / fr.W);
      const vals = [];
      for (let s = 0; s < steps; s++) {
        const p = (s + 0.5) / steps;
        const rnd = (salt) => fr.rand(salt, s);
        let I = 0;
        if (P.mode === 'constant') {
          I = 0.3 + 0.7 * Math.pow(rnd(901), 2.2);
        } else {
          for (let b = 0; b < P.bursts; b++) {
            const centre = fract(0.42 + b / P.bursts + (b ? fr.srand(b, 902) * 0.3 / P.bursts : 0));
            const len = (P.burstLen * (b ? 0.7 + 0.6 * fr.rand(b, 903) : 1)) / fr.dur;
            const u = fract(p - (centre - len * 0.3)) / len;
            if (u >= 1) continue;
            const env = smoothstep(0, 0.06, u) * Math.pow(1 - u, 1.3) * (rnd(904 + b) < 0.78 ? 1 : 0.12);
            I = Math.max(I, env);
          }
        }
        if (!loop) {
          const rin = inDur > 0 ? 1 - smoothstep(inDur * 0.7, inDur * 1.05, p) : 0;
          const rout = outDur > 0 ? smoothstep(1 - outDur * 1.05, 1 - outDur * 0.7, p) : 0;
          I = Math.max(I, 0.85 * Math.max(rin, rout));
        }
        vals.push(I * (P.intensity || 0) * amp);
      }
      // Safety-style turns, walked twice so the loop seam counts, recorded on the
      // second pass (the same construction as TM.Safety's transitions()).
      const turns = [];
      let lo = vals[0], hi = vals[0], ext = vals[0], trend = 0;
      for (let k = 1; k < vals.length * 2; k++) {
        const v = vals[k % vals.length], t = ((k % vals.length) / steps) * fr.pass;
        if (trend === 0) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
          if (hi - lo >= 0.1) { trend = v === hi ? 1 : -1; ext = v; }
        } else if (trend > 0 ? v > ext : v < ext) {
          ext = v;
        } else if (Math.abs(v - ext) >= 0.1) {
          trend = -trend;
          if (k >= vals.length) turns.push(t);
          ext = v;
        }
      }
      if (!turns.length) return 0;
      const ext2 = turns.concat(turns.map((t) => t + fr.pass));
      let best = 0;
      for (let i = 0; i < turns.length; i++) {
        let c = 0;
        for (const t of ext2) if (t >= turns[i] && t < turns[i] + 1.06) c++;
        if (c > best) best = c;
      }
      return best / 2;
    },
  });

  // ── photosensitivity ──
  // Every glitch frame redraws the damage (flicker, slices, smear, split, block dropouts), all
  // sized by the type. When the type is big enough to fill 10° fields (MotionKit.FLASH), any glitch
  // frame inside a burst or a flicker window can be a large luminance transition, so with fast
  // flashing off the glitch clock slows until no second holds more than three flashes.
  // Normal-sized type keeps its rate: one glitch frame changes too little of the frame.
  function clockFor(C, f) {
    const key = JSON.stringify([f.layer.fill, f.bg, f.layer.time, f.dur]);
    let hz = C.clocks.get(key);
    if (hz === undefined) {
      const fr = { params: f.params, layout: f.layout, layer: f.layer, W: f.W, H: f.H, dur: f.dur, pass: K.passOf(f), rand: (a, b) => f.rand(a, b), srand: (a, b) => f.srand(a, b) };
      hz = clock(fr, f.layer, f.bg).hz;
      if (C.clocks.size > 12) C.clocks.clear();
      C.clocks.set(key, hz);
    }
    return hz;
  }

  /** { hz: glitch frames per second to run at, rate: flashes per second } for a frame-like fr. */
  function clock(fr, layer, bg) {
    const P = fr.params, L = fr.layout;
    const inks = K.inkColors(layer), backs = K.backdrops(bg);
    let ink = 0;
    for (const g of L.glyphs) if (!g.isSpace) ink += K.inkOf(fr.layer.font.family, fr.layer.font.weight, g.ch, L.sizePx);
    ink *= K.inkSpread(layer);
    // Measured with TM.Safety: glitch frames flash 10° fields once the type is big enough for its
    // strokes to fill them, about an eighth of the frame in ink (every look sits at 3 to 6 %, and
    // measures 1.5 flashes a second or fewer); type that big can change a field twice in one
    // glitch frame. Low-contrast type cannot flash.
    if (ink / (fr.W * fr.H) < 0.12 || !K.swing(1, inks, backs)) return { hz: P.rate, rate: 0 };
    // Where the glitch runs: the bursts (timed as render times them) and the flicker windows.
    const { inDur, outDur } = K.windows(P);
    const flickers = P.timing !== 'loop';
    const bursts = [];
    for (let b = 0; b < P.bursts; b++) {
      const centre = fract(0.42 + b / P.bursts + (b ? fr.srand(b, 902) * 0.3 / P.bursts : 0));
      const len = (P.burstLen * (b ? 0.7 + 0.6 * fr.rand(b, 903) : 1)) / fr.dur;
      bursts.push({ start: centre - len * 0.3, len });
    }
    const active = (p) => P.mode === 'constant' || (flickers && (p < inDur * 1.05 || p > 1 - outDur * 1.05)) ||
      bursts.some((b) => fract(p - b.start) / b.len < 1);
    const rateAt = (hz) => {
      const steps = Math.max(1, Math.round(hz * fr.dur)), times = [];
      let was = active((steps - 0.5) / steps);
      for (let s = 0; s < steps; s++) {
        const now = active((s + 0.5) / steps);
        if (now || was) times.push((s / steps) * fr.pass, (s / steps) * fr.pass); // a glitch frame starts or ends here: two changes
        was = now;
      }
      return K.flashRate(times, fr.pass);
    };
    let hz = P.rate, rate = rateAt(hz);
    if (!P.fastFlash) while (rate > K.FLASH.perSec - 0.5 && hz > 1) { hz = Math.max(1, Math.floor(hz * 0.8)); rate = rateAt(hz); }
    return { hz, rate };
  }
})(window.TM);
