/* Preset: Axis Wave — letters ride a wave through one of the font's variable axes.
 * Any axis the family has: weight and width, optical size, slant, and the custom ones that make
 * fonts move like nothing else (Tilt Warp's 3D tilt, Climate Crisis melting through the years,
 * Kablammo's MORF, Fraunces' SOFT, Shantell's bounce, Recursive's casual). Each letter draws
 * from a pinned instance on a 49-stop ladder of the axis (TM.fonts.resolve), and the line is
 * re-laid every frame from those instances' advances, keeping the base layout's kerning.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp } = TM.math;
  // 'auto' picks the most expressive axis the family has.
  const AUTO = ['XROT', 'YEAR', 'MORF', 'BNCE', 'SOFT', 'CASL', 'SCAN', 'ROND', 'CTRS', 'wdth', 'GRAD', 'wght'];
  const STOPS = 48;

  /** The axis a layer animates: { tag, lo, hi } or null when its font has nothing to move. */
  function axisFor(family, choice) {
    const base = TM.fonts.baseOf(family);
    const f = TM.fonts.get(base);
    const axes = TM.fonts.axes(base) || {};
    const has = (tag) => (tag === 'wght' ? f && f.variable : !!axes[tag]);
    const custom = Object.keys(axes).filter((t) => t === t.toUpperCase()).sort();
    let tag = choice;
    if (choice === 'auto') tag = AUTO.find(has) || null;
    else if (/^c[1-3]$/.test(choice)) tag = custom[+choice[1] - 1] || null;
    if (!tag || !has(tag)) return null;
    const r = tag === 'wght' ? [f.min, f.max] : axes[tag];
    return { tag, base, lo: r[0], hi: r[1] };
  }

  /** The font a ladder stop draws with: an instance (or, for weight, the layer's family). */
  function stopFont(layer, ax, v, opsz) {
    const font = Object.assign({}, layer.font, { family: ax.base, opsz: opsz != null ? opsz : layer.font.opsz });
    if (ax.tag === 'wght') return { family: layer.font.family, weight: Math.round(v) };
    if (ax.tag === 'wdth') font.width = v;
    else if (ax.tag === 'opsz') font.opsz = v;
    else font.axes = Object.assign({}, layer.font.axes, { [ax.tag]: v });
    return { family: TM.fonts.resolve(font, 0), weight: layer.font.weight };
  }

  /** The layer's pinned optical size, so ladder instances match its main instance. */
  function pinnedOpsz(family) {
    const inst = TM.fonts.get(family);
    return inst && inst.opsz != null ? inst.opsz : null;
  }

  TM.registerPreset({
    id: 'axis-wave',
    name: 'Axis Wave',
    category: 'Kinetic',
    // The default font has no axis to move; Tilt Warp's 3D tilt shows the idea at once.
    prefers: { family: 'Tilt Warp', weight: 400 },
    description: 'Letters ride a wave through a variable-font axis: 3D tilt, melting, morphing, weight, width…',
    params: [
      TM.P.select('axis', 'Axis', [['auto', 'Most expressive'], ['wght', 'Weight'], ['wdth', 'Width'], ['opsz', 'Optical size'], ['slnt', 'Slant'], ['c1', 'Custom axis 1'], ['c2', 'Custom axis 2'], ['c3', 'Custom axis 3']], 'auto', { group: 'Axis', hint: 'Fonts tagged with axes in the font picker (Tilt Warp, Climate Crisis, Kablammo, Fraunces, Shantell Sans, Recursive…) have the most to move' }),
      TM.P.range('from', 'From', 0, 1, 0.01, 0, { group: 'Axis', hint: 'Start of the sweep, as a fraction of the axis range' }),
      TM.P.range('to', 'To', 0, 1, 0.01, 1, { group: 'Axis' }),
      TM.P.select('motion', 'Motion', [['wave', 'Travelling wave'], ['cascade', 'Cascade'], ['breathe', 'Breathe together'], ['random', 'Seeded rhythm'], ['mirror', 'From the centre']], 'wave', { group: 'Motion' }),
      TM.P.range('cycles', 'Cycles', 1, 6, 1, 1, { group: 'Motion' }),
      TM.P.range('spread', 'Waves across', 0.1, 3, 0.05, 1, { group: 'Motion', showIf: { motion: ['wave', 'mirror'] } }),
      TM.P.ease('ease', 'Ease', 'inOutSine', { group: 'Motion' }),
      TM.P.range('lift', 'Lift', -1, 1, 0.01, 0.12, { group: 'Motion', hint: 'Letters rise with the axis (secondary motion), in cap heights' }),
      TM.P.range('grow', 'Grow', 0, 0.5, 0.01, 0, { group: 'Motion', hint: 'Letters scale up with the axis' }),
    ],

    /** Every ladder instance the letters may draw with, so exports load them before frame 0. */
    fonts(layer, scene) {
      const ax = axisFor(layer.font.family, layer.params.axis);
      if (!ax || ax.tag === 'wght') return [];
      const opsz = pinnedOpsz(TM.Renderer.familyFor(layer, scene));
      const out = [];
      for (let i = 0; i <= STOPS; i++) out.push(stopFont(layer, ax, ax.lo + ((ax.hi - ax.lo) * i) / STOPS, opsz).family);
      return out;
    },

    setup(f) {
      const ax = axisFor(f.layer.font.family, f.params.axis);
      const L = f.layout;
      // Kern of each glyph with the one before it, from the base layout (pen gap minus advance).
      const kern = L.glyphs.map((g, i) => {
        const prev = L.glyphs[i - 1];
        return prev && prev.line === g.line ? g.x - (prev.x + prev.w) - L.tracking : 0;
      });
      if (!ax) return { ax: null, kern };
      const opsz = pinnedOpsz(f.layer.font.family);
      const stops = [];
      for (let i = 0; i <= STOPS; i++) stops.push(stopFont(f.layer, ax, ax.lo + ((ax.hi - ax.lo) * i) / STOPS, opsz));
      return { ax, kern, stops };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      const ease = f.ease(P.ease);
      const ph = f.p * P.cycles;
      const order = P.motion === 'mirror' ? 'center' : P.order || 'start';
      const span = P.to - P.from;
      // 0..1 position of glyph g along the sweep at this moment.
      const amount = (g) => {
        const r = f.rank(g, order);
        let u;
        switch (P.motion) {
          case 'breathe': u = 0.5 - 0.5 * Math.cos(TAU * ph); break;
          case 'random': u = 0.5 - 0.5 * Math.cos(TAU * (ph + f.rand(g.vi, 31))); break;
          case 'cascade': {
            // One bump per pass travels along the letters (periodic, so the loop is seamless).
            const n = Math.max(1, L.count);
            const d = (((r * (n - 1) / (n + 1) - (ph % 1)) % 1) + 1) % 1;
            const dd = Math.min(d, 1 - d) * (n + 1);
            u = Math.exp(-dd * dd * 0.9);
            break;
          }
          default: u = 0.5 - 0.5 * Math.cos(TAU * (ph - r * P.spread));
        }
        return clamp(ease(clamp(u)));
      };

      // Each glyph's stop, advance and pose; then each line is re-laid around its anchor.
      const size = f.size;
      const items = L.glyphs.map((g) => {
        const a = amount(g);
        const v = P.from + span * a;
        let font = null, w = g.w;
        if (C.ax && !g.isSpace) {
          const k = Math.round(clamp(v) * STOPS);
          font = C.stops[k];
          w = TM.text.advance(g.ch, font.family, font.weight, size);
        }
        return { g, a, font, w };
      });
      L.lines.forEach((line) => {
        const ids = line.glyphs;
        if (!ids.length) return;
        // RTL lines are drawn in visual order without the logical-order kerns, so measure them so.
        let width = 0;
        ids.forEach((gi, j) => { width += items[gi].w + (j ? L.tracking + (line.rtl ? 0 : C.kern[gi]) : 0); });
        const align = f.layer.type.align;
        let x = f.cx + (align === 'left' ? -L.width / 2 : align === 'right' ? L.width / 2 - width : -width / 2);
        if (line.rtl) {
          // Bidi visual order is already in the base layout's x: keep it, centred the same way.
          const sorted = ids.slice().sort((p, q) => L.glyphs[p].x - L.glyphs[q].x);
          sorted.forEach((gi, j) => {
            const it = items[gi];
            if (j) x += L.tracking;
            drawOne(f, it, x + it.w / 2, P);
            x += it.w;
          });
          return;
        }
        ids.forEach((gi, j) => {
          const it = items[gi];
          if (j) x += L.tracking + C.kern[gi];
          drawOne(f, it, x + it.w / 2, P);
          x += it.w;
        });
      });
    },

    looks: [
      { name: 'Stadium tilt', bg: { type: 'solid', color: '#ffcc00' }, layer: { font: { family: 'Tilt Warp', weight: 400 }, fill: { type: 'solid', color: '#141414' }, params: { axis: 'c1', motion: 'wave', spread: 0.8, lift: 0.08 } } },
      { name: 'Meltdown', bg: { type: 'solid', color: '#ff5a1f' }, layer: { font: { family: 'Climate Crisis', weight: 400 }, fill: { type: 'solid', color: '#1a0a00' }, params: { axis: 'c1', motion: 'cascade', ease: 'inOutCubic', lift: 0 } } },
      { name: 'Kablammo', bg: { type: 'solid', color: '#111111' }, layer: { font: { family: 'Kablammo', weight: 400 }, fill: { type: 'palette', palette: ['#ff2e88', '#00f0ff', '#faff00', '#ffffff'] }, params: { axis: 'c1', motion: 'random', cycles: 2, grow: 0.08 } } },
      { name: 'Soft serve', bg: { type: 'solid', color: '#f6e7d8' }, layer: { font: { family: 'Fraunces', weight: 600 }, type: { case: 'none' }, fill: { type: 'solid', color: '#3b1f2b' }, params: { axis: 'c1', motion: 'breathe', lift: 0 } } },
      { name: 'Bounce house', bg: { type: 'solid', color: '#7c5cff' }, layer: { font: { family: 'Shantell Sans', weight: 700 }, fill: { type: 'solid', color: '#ffffff' }, params: { axis: 'c1', from: 0.15, to: 0.85, motion: 'wave', spread: 1.4, cycles: 2, lift: 0 } } },
      { name: 'Casual code', bg: { type: 'solid', color: '#0b0f14' }, layer: { font: { family: 'Recursive', weight: 700 }, type: { case: 'none' }, fill: { type: 'solid', color: '#7cffb2' }, params: { axis: 'c1', motion: 'wave', spread: 0.6, lift: 0.05 } } },
      { name: 'Width pulse', bg: { type: 'solid', color: '#0015ff' }, layer: { font: { family: 'Roboto Flex', weight: 800 }, fill: { type: 'solid', color: '#ffffff' }, params: { axis: 'wdth', from: 0.1, to: 0.9, motion: 'mirror', spread: 0.5, lift: 0 } } },
      { name: 'Scanlines', bg: { type: 'solid', color: '#000000' }, layer: { font: { family: 'Sixtyfour', weight: 400 }, fill: { type: 'solid', color: '#39ff14' }, fx: { glow: { amount: 0.35, color: '#39ff14' } }, params: { axis: 'c2', motion: 'wave', spread: 1.2, lift: 0 } } },
    ],
  });

  function drawOne(f, it, x, P) {
    const g = it.g;
    if (g.isSpace) return;
    const y = f.cy + g.cy - P.lift * f.layout.capH * (it.a - 0.5);
    const scale = 1 + P.grow * it.a;
    const o = { x, y, scale, w: it.w };
    if (it.font) { o.family = it.font.family; o.weight = it.font.weight; }
    f.drawGlyph(g, o);
  }
})(window.TM);
