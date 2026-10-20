/* Preset: Decode — letters cycle through random characters, then lock onto the text in stagger order.
 *
 * Craft notes
 *  - Noise characters are chosen from those close to each glyph's own advance, so the word keeps
 *    its silhouette while it decodes instead of jittering in width.
 *  - Before locking, the real letter starts flickering through the noise ("acquiring signal"),
 *    then snaps in with a small scale pop and a colour hand-off from the unresolved look.
 *  - Determinism: the character shown is picked from f.rand(glyph, step) with
 *    step = floor(t · rate + phase), a function of time rather than frame count, so 30 fps and
 *    60 fps exports show the same characters at the same moments.
 */
(function (TM) {
  'use strict';
  const { clamp, smoothstep } = TM.math;

  const SETS = {
    letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits: '0123456789',
    binary: '01',
    symbols: '#$%&*+=?@!<>/\\|^~',
    blocks: '░▒▓█',
    mixed: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=?@',
  };
  const DENSITY = ['░', '▒', '▓', '█'];
  const ACQUIRE = 0.35; // in-window progress where the real letter starts to flicker through
  const RESOLVE = 0.8;  // in-window progress where it locks; the rest is the lock accent
  const UNLOCK = 0.45;  // out-window progress by which the letter has fully dissolved into noise
  const IS_LETTER = /\p{L}/u;

  let measureCtx = null;
  function measure(font, ch) {
    if (!measureCtx) {
      const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas');
      measureCtx = c.getContext('2d');
    }
    measureCtx.font = font;
    const m = measureCtx.measureText(ch);
    return { w: m.width || 1, asc: m.actualBoundingBoxAscent || 0, desc: m.actualBoundingBoxDescent || 0 };
  }

  TM.registerPreset({
    id: 'scramble',
    name: 'Decode',
    category: 'Reveal',
    description: 'Letters cycle through random characters and lock onto your text one by one, then scramble away.',
    looks: [
      { name: 'Terminal', bg: { type: 'solid', color: '#030a05' }, post: { grain: 0.18, vignette: 0.35 },
        layer: { font: { family: 'JetBrains Mono', weight: 600 }, fill: { type: 'solid', color: '#3dff8f' },
          fx: { glow: { amount: 0.3, color: '#1fbf5f' } }, params: { charset: 'mixed', look: 'accent', accent: '#1d6b3a', rate: 22 } } },
      { name: 'Redacted', bg: { type: 'solid', color: '#f2eee6' },
        layer: { font: { family: 'Space Mono', weight: 700 }, fill: { type: 'solid', color: '#141414' },
          params: { charset: 'blocks', look: 'same', spawn: 'stagger', drift: 0 } } },
      { name: 'Binary Bloom', bg: { type: 'radial', color: '#1a0638', color2: '#05000c' },
        layer: { font: { family: 'Unbounded', weight: 700 }, fill: { type: 'palette', palette: ['#ff00e5', '#00f0ff', '#faff00', '#ffffff'] },
          params: { charset: 'binary', look: 'palette', pop: 0.8 } } },
    ],
    params: [
      ...TM.P.sequence({ inDur: 0.5, outDur: 0.3, stagger: 0.65, easeIn: 'glide', easeOut: 'inCubic' }),
      TM.P.select('charset', 'Characters', [
        ['mixed', 'Mixed'], ['letters', 'Letters'], ['digits', 'Digits'], ['binary', 'Binary'],
        ['symbols', 'Symbols'], ['blocks', 'Blocks ░▒▓█'],
      ], 'mixed', { group: 'Decode' }),
      TM.P.range('rate', 'Cycle speed (/s)', 4, 40, 1, 18, { group: 'Decode', hint: 'Character changes per second' }),
      TM.P.select('spawn', 'Appear', [['together', 'All at once'], ['stagger', 'In order']], 'together', { group: 'Decode' }),
      TM.P.range('pop', 'Lock pop', 0, 1, 0.01, 0.5, { group: 'Decode' }),
      TM.P.range('drift', 'Drift (em)', 0, 0.6, 0.01, 0.08, { group: 'Decode' }),
      TM.P.select('look', 'Unresolved', [['accent', 'Accent colour'], ['palette', 'Palette'], ['dim', 'Dimmed'], ['same', 'Same as text']], 'accent', { group: 'Colour' }),
      TM.P.color('accent', 'Accent', '#00e5ff', { group: 'Colour', showIf: { look: 'accent' } }),
    ],

    setup(f) {
      const P = f.params, L = f.layout;
      const fam = f.layer.font.family, wt = f.layer.font.weight;
      const set = SETS[P.charset] || SETS.mixed;
      const caseable = P.charset === 'letters' || P.charset === 'mixed';
      const pools = {};
      const poolFor = (lower) => {
        const key = lower ? 'lower' : 'upper';
        if (!pools[key]) {
          pools[key] = Array.from(lower ? set.toLowerCase() : set).map((ch) => ({ ch, w: TM.text.advance(ch, fam, wt, f.size) }));
        }
        return pools[key];
      };
      const glyphs = L.glyphs.map((g) => {
        if (g.isSpace) return null;
        const lower = caseable && IS_LETTER.test(g.ch) && g.ch !== g.ch.toUpperCase();
        const base = poolFor(lower);
        const others = base.filter((c) => c.ch !== g.ch);
        const all = others.length ? others : base;
        // Prefer noise characters close to the glyph's own width so the word keeps its shape.
        const near = all.filter((c) => c.w > g.w * 0.6 && c.w < g.w * 1.45);
        return near.length >= 3 ? near : all;
      });
      let block = null;
      if (P.charset === 'blocks') {
        const m = measure(L.font, '█');
        block = { w: m.w, asc: m.asc, desc: m.desc };
      }
      return { glyphs, block };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      if (!C) return;
      const together = P.spawn === 'together';
      // Same in/out lengths as f.seq(), for the global fades of the "all at once" mode.
      const { inDur, outDur } = TM.MotionKit.windows(P);
      const fadeIn = Math.min(0.1 / f.dur, inDur * 0.3);
      const fadeOut = Math.min(0.14 / f.dur, outDur * 0.3);
      const globalAlpha = together
        ? smoothstep(0, fadeIn, f.p) * (outDur > 0 ? 1 - smoothstep(1 - fadeOut, 1, f.p) : 1)
        : 1;
      const drift = P.drift * L.sizePx;
      const pal = f.layer.fill.palette;
      const capH = L.capH;

      for (const g of L.glyphs) {
        if (g.isSpace) continue;
        const pool = C.glyphs[g.i];
        if (!pool) continue;
        const s = f.seq(g);
        let alpha;
        if (together) alpha = globalAlpha;
        else {
          if (!s.visible) continue;
          alpha = smoothstep(0, 0.12, s.kin) * (1 - smoothstep(0.7, 1, s.kout));
        }
        if (alpha <= 0.002) continue;

        // Time-quantised randomness; a per-glyph phase keeps the letters from all changing on one frame.
        const step = Math.floor(f.t * P.rate + f.rand(g.i, 7));
        const pick = f.rand(g.i * 3 + 1, step);
        const roll = f.rand(g.i * 3 + 2, step);

        // Probability that this step shows the real letter, and the lock accent (1 → 0 after locking).
        let lockP, accent = 0;
        if (s.kout > 0) {
          const u = clamp(s.kout / UNLOCK);
          lockP = 1 - Math.pow(u, 1.4);
        } else if (s.kin >= RESOLVE) {
          lockP = 1;
          const k = (s.kin - RESOLVE) / (1 - RESOLVE);
          accent = (1 - k) * (1 - k);
        } else {
          const a = clamp((s.kin - ACQUIRE) / (RESOLVE - ACQUIRE));
          lockP = a * a * 0.6;
        }
        const real = roll < lockP;

        const y = f.cy + g.cy + (1 - s.vin) * drift - s.vout * drift;
        const base = f.colorOf(g);
        // Unresolved look; the lock accent hands off from it to the text colour.
        let noiseColor = base, noiseAlpha = 1;
        if (!f.colorOverride) {
          if (P.look === 'accent') noiseColor = P.accent;
          // Palette noise changes colour every third step: a letter swapping bright and dark
          // palette colours at the full rate is a flicker (WCAG 2.3.1 flashes, by TM.Safety).
          else if (P.look === 'palette') noiseColor = pal[(g.i + Math.floor(step / 3)) % pal.length];
          else if (P.look === 'dim') noiseAlpha = 0.45;
        }

        if (real) {
          // Undefined = the layer's own paint, so gradient fills stay smooth once a letter locks.
          const color = accent > 0 && noiseColor !== base ? TM.color.mix(base, noiseColor, accent * 0.85) : undefined;
          const a = alpha * (1 - (1 - noiseAlpha) * accent);
          f.drawGlyph(g, { y, scale: 1 + P.pop * 0.18 * accent, alpha: a, color });
          continue;
        }

        if (C.block) {
          // Blocks develop with progress: ░ → ▒ → ▓ → █ → letter, and back again on the way out.
          const prog = s.kout > 0 ? 1 - s.kout : s.kin / RESOLVE;
          const idx = clamp(Math.floor(prog * 4 + (pick - 0.5) * 1.6), 0, 3);
          const B = C.block;
          const sx = (g.w * 0.88) / B.w;
          const sy = capH / Math.max(1, B.asc + B.desc);
          const yb = y - sy * (capH / 2 + (B.desc - B.asc) / 2);
          f.drawGlyph(g, { ch: DENSITY[idx], y: yb, sx, sy, alpha: alpha * noiseAlpha, color: noiseColor });
          continue;
        }

        const c = pool[Math.floor(pick * pool.length)];
        const sx = Math.min(1, (g.w * 1.2) / c.w);
        f.drawGlyph(g, { ch: c.ch, y, sx, sy: 1, alpha: alpha * noiseAlpha, color: noiseColor });
      }
    },
  });
})(window.TM);
