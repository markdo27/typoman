/* Preset: Stack — TYPOMAN's signature fill-the-frame word stack.
 * Each word (or line) becomes a full-width row; row heights breathe so the stack flexes like an
 * accordion. Letters keep their proportions: a row reaches the frame edges through the font's
 * own width axis (condensed when its row is tall, expanded when it is short) and then a little
 * tracking, never by scaling glyphs unevenly. A row that still can't reach the edges sits
 * ragged; one too wide shrinks evenly. "Stretch" fill keeps the old distorted poster look as a
 * deliberate choice. Rows are drawn as whole runs to keep native kerning.
 */
(function (TM) {
  'use strict';
  const { TAU } = TM.math;
  const REF = 200; // rows are measured and drawn at this size, then scaled
  const OPSZ_PX = 1000; // stack rows are display type: auto optical size resolves to the axis max

  /** Families a row can be drawn with: the width-axis ladder (narrow → wide), or just one. */
  function familiesFor(font, fill) {
    const base = TM.fonts.baseOf(font.family);
    const widths = fill === 'axis' ? TM.fonts.ladder(base, 'wdth') : [];
    if (!widths.length) return [{ family: TM.fonts.resolve(Object.assign({}, font, { family: base }), OPSZ_PX), width: null }];
    return widths.map((w) => ({ family: TM.fonts.resolve(Object.assign({}, font, { family: base, width: w }), OPSZ_PX), width: w }));
  }

  let mctx = null;
  /** Run metrics at the reference size: advance width and ink ascent / descent. */
  function measure(family, weight, text) {
    if (!mctx) mctx = (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas')).getContext('2d');
    mctx.font = TM.fonts.fontString(family, weight, REF);
    if ('fontKerning' in mctx) mctx.fontKerning = 'normal';
    if ('letterSpacing' in mctx) mctx.letterSpacing = '0px';
    const m = mctx.measureText(text);
    return { width: m.width, asc: m.actualBoundingBoxAscent || 0, desc: m.actualBoundingBoxDescent || 0 };
  }

  TM.registerPreset({
    id: 'stack',
    name: 'Stack',
    category: 'Kinetic',
    // Designed around a wide width axis: the studio swaps this in for the untouched default font.
    prefers: { family: 'Science Gothic', weight: 700 },
    description: 'Words fill the frame edge to edge, rows flexing like an accordion through the font’s width axis.',
    fit: false,
    params: [
      TM.P.select('rows', 'Rows from', [['words', 'Each word'], ['lines', 'Each line']], 'words', { group: 'Layout' }),
      TM.P.select('fill', 'Fill', [['axis', 'Width axis + tracking'], ['stretch', 'Stretch (distort)']], 'axis', { group: 'Layout', hint: 'Width axis keeps letterforms true: pick a font tagged wdth (Roboto Flex, Science Gothic, Anybody…) for the full effect' }),
      TM.P.select('motion', 'Motion', [['accordion', 'Accordion'], ['cascade', 'Cascade'], ['pulse', 'Pulse'], ['noise', 'Organic']], 'accordion', { group: 'Motion' }),
      TM.P.range('intensity', 'Intensity', 0, 1, 0.01, 0.65, { group: 'Motion' }),
      TM.P.range('cycles', 'Cycles', 1, 6, 1, 1, { group: 'Motion' }),
      TM.P.range('margin', 'Margin', 0, 0.25, 0.005, 0.06, { group: 'Layout' }),
      TM.P.range('gap', 'Row gap', 0, 0.08, 0.001, 0.012, { group: 'Layout' }),
      TM.P.range('maxTrack', 'Max tracking', 0, 2, 0.05, 0.3, { group: 'Layout', hint: 'How far tracking may open a row (em) to reach the edges; past it the row sits ragged, aligned like the text' }),
      TM.P.toggle('alternate', 'Alternate skew', false, { group: 'Motion' }),
    ],

    /** Every width instance the rows may draw with, so exports load them all before frame 0. */
    fonts(layer) {
      return familiesFor(layer.font, layer.params.fill).map((x) => x.family);
    },

    setup(f) {
      // One row per word when asked, measured at a fixed reference size.
      const rowsText = f.params.rows === 'words'
        ? f.layer.text.split(/\s+/).filter(Boolean).join('\n')
        : f.layer.text;
      const weight = f.layer.font.weight;
      const fams = familiesFor(f.layer.font, f.params.fill);
      // Cap height and casing come from the instance nearest the regular width.
      const mid = fams.reduce((a, b) => (Math.abs((b.width == null ? 100 : b.width) - 100) < Math.abs((a.width == null ? 100 : a.width) - 100) ? b : a));
      const L = TM.text.layout({
        text: rowsText || ' ',
        family: mid.family,
        weight,
        sizePx: REF,
        tracking: f.layer.type.tracking,
        leading: 1,
        align: 'center',
        case: f.layer.type.case,
      });
      const rows = L.lines.filter((l) => l.width > 0).map((line) => {
        const gaps = Math.max(0, line.glyphs.length - 1);
        // Natural run width of this row at each width instance, including the user's tracking.
        const widths = fams.map((x) => measure(x.family, weight, line.text).width + gaps * L.tracking);
        // Rows fill their bands by ink, not by the Latin cap height, so descenders ("big") and
        // Arabic forms never reach into the next row. Uppercase rows come out as before.
        const ink = measure(mid.family, weight, line.text);
        const asc = Math.max(ink.asc, L.capH * 0.5), desc = Math.max(0, ink.desc);
        return { text: line.text, gaps, widths, min: Math.min.apply(null, widths), max: Math.max.apply(null, widths), inkH: asc + desc, oy: (asc - desc) / 2 };
      });
      return { L, rows, fams };
    },

    render(f) {
      const P = f.params, { L, rows, fams } = f.cache;
      const n = rows.length;
      if (!n) return;
      const m = P.margin * f.unit;
      const availW = f.W - m * 2, availH = f.H - m * 2;
      const gap = P.gap * f.unit;

      // Row weights → heights. Integer cycles keep the loop seamless.
      const vs = [];
      const w = rows.map((_, i) => {
        const ph = f.p * P.cycles;
        let v;
        switch (P.motion) {
          case 'cascade': {
            // A bulge travels down the stack on a circle of n + 1 rows, so it leaves the bottom
            // while it re-enters the top: periodic, hence seamless at the loop.
            const C = n + 1;
            const dd = (((i - (ph % 1) * C) % C) + C) % C;
            const d = Math.min(dd, C - dd);
            v = Math.exp(-Math.pow(d / 0.7, 2)) * 2 - 0.4;
            break;
          }
          case 'pulse': v = Math.sin(TAU * ph) * (i % 2 ? -1 : 1); break;
          case 'noise': v = f.loopNoise(i * 3.1, P.cycles) * 1.6; break;
          default: v = Math.sin(TAU * (ph + i / n));
        }
        vs.push(v);
        return Math.max(0.08, 1 + v * P.intensity * 0.85);
      });
      const maxT = P.maxTrack * REF;
      const sum = w.reduce((a, b) => a + b, 0);
      const usable = availH - gap * (n - 1);
      // One row can't trade height with its neighbours, so the motion sweeps it through the
      // heights at which it still fills the width: tall on its narrowest instance, short on
      // its widest (plus half the tracking allowance). The width axis breathes with it.
      let desired;
      if (n === 1) {
        const r0 = rows[0];
        const hMax = Math.min(usable, (availW * r0.inkH) / r0.min);
        const hMin = Math.min(hMax, (availW * r0.inkH) / (r0.max + r0.gaps * maxT * 0.5));
        const u = Math.max(-1, Math.min(1, (vs[0] || 0) * P.intensity * 1.3));
        desired = [(hMin + hMax) / 2 + ((hMax - hMin) / 2) * u];
      } else {
        desired = w.map((x) => (usable * x) / sum);
      }
      const total = desired.reduce((a, b) => a + b, 0) + gap * (n - 1);
      let y = m + (availH - total) / 2;

      if (P.fill === 'stretch') {
        // The poster look: scale each run unevenly to its band.
        rows.forEach((row, i) => {
          const h = desired[i];
          drawRow(f, fams[0].family, row, f.W / 2, y + h / 2, availW / row.widths[0], h / row.inkH, skewOf(P, w, i), i, L.tracking, row.widths[0]);
          y += h + gap;
        });
        return;
      }

      // Even scale from the band height (the motion always drives it). Between the narrowest and
      // widest instance the row takes the nearest one and a sub-step horizontal scale (at most
      // half a ladder step, ~±1.5 %, below perception), so glyph positions move continuously as
      // instances change instead of jumping. Past the widest instance tracking opens up to the
      // limit; a row that still can't reach both edges sits ragged, aligned like the layer's
      // text, and one too wide even at its narrowest shrinks evenly.
      const align = f.layer.type.align;
      rows.forEach((row, i) => {
        const h = desired[i];
        const s = h / row.inkH;
        const target = availW / s;
        let k, sx = s, sy = s, extra = 0;
        if (target <= row.min) {
          k = row.widths.indexOf(row.min);
          sx = sy = availW / row.min;
        } else if (target >= row.max) {
          k = row.widths.indexOf(row.max);
          // Soft cap: the hand-off from filling to ragged eases in, so edge letters don't
          // change direction in a single frame.
          if (row.gaps > 0) extra = softCap((target - row.max) / row.gaps, maxT, maxT * 0.3);
        } else {
          k = 0;
          for (let j = 1; j < row.widths.length; j++) {
            if (Math.abs(Math.log(row.widths[j] / target)) < Math.abs(Math.log(row.widths[k] / target))) k = j;
          }
          sx = s * (target / row.widths[k]);
        }
        const runW = row.widths[k] + extra * row.gaps;
        const half = (runW * sx) / 2;
        const x = align === 'left' ? m + half : align === 'right' ? f.W - m - half : f.W / 2;
        drawRow(f, fams[k].family, row, x, y + h / 2, sx, sy, skewOf(P, w, i), i, L.tracking + extra, runW);
        y += h + gap;
      });
    },

    looks: [
      { name: 'Flex accordion', bg: { type: 'solid', color: '#f2efe8' }, layer: { font: { family: 'Roboto Flex', weight: 800 }, fill: { type: 'solid', color: '#111111' }, params: { fill: 'axis', motion: 'accordion', intensity: 0.75 } } },
      { name: 'Gothic cascade', bg: { type: 'solid', color: '#0015ff' }, layer: { font: { family: 'Science Gothic', weight: 700 }, fill: { type: 'solid', color: '#ffffff' }, params: { fill: 'axis', motion: 'cascade', intensity: 0.8, margin: 0.05 } } },
      { name: 'Signal pulse', bg: { type: 'solid', color: '#ff3b00' }, layer: { font: { family: 'Anybody', weight: 900 }, fill: { type: 'palette', palette: ['#111111', '#f2efe8'] }, params: { fill: 'axis', motion: 'pulse', intensity: 0.6, alternate: true } } },
      { name: 'Poster stretch', bg: { type: 'solid', color: '#0b0b0b' }, layer: { font: { family: 'Anton', weight: 400 }, fill: { type: 'solid', color: '#ffe500' }, params: { fill: 'stretch', motion: 'noise', intensity: 0.7 } } },
    ],
  });

  /** min(x, cap) with a C1 blend of half-width w around the cap (no kink when it starts to bite). */
  function softCap(x, cap, w) {
    if (!(w > 0) || x <= cap - w) return Math.min(x, cap);
    if (x >= cap + w) return cap;
    const d = x - (cap - w);
    return x - (d * d) / (4 * w);
  }

  /** Alternate rows lean opposite ways, more as they grow. */
  function skewOf(P, w, i) {
    return P.alternate ? (i % 2 ? 1 : -1) * (w[i] - 1) * 0.25 : 0;
  }

  // Draw a row as one run (native kerning) in its own family; letterSpacing carries the tracking.
  function drawRow(f, family, row, x, y, sx, sy, skew, i, spacing, runW) {
    const ctx = f.ctx;
    ctx.font = TM.fonts.fontString(family, f.layer.font.weight, REF);
    if ('fontKerning' in ctx) ctx.fontKerning = 'normal'; // as measured
    f._font = null; // drew with its own font; make drawGlyph re-apply its own
    const ls = 'letterSpacing' in ctx;
    if (ls) ctx.letterSpacing = spacing.toFixed(2) + 'px';
    const tk = -Math.tan(skew + f.slant);
    ctx.globalAlpha = f.alpha;
    // A right-to-left row resolves its edge punctuation as RTL text does (left stays the left edge).
    ctx.direction = TM.text.isRTL(row.text) ? 'rtl' : 'ltr';
    const ox = -runW / 2, oy = row.oy; // centres the row's ink on (x, y)
    const ex = f.extrude;
    if (ex) {
      // Extrude in proportion to the row's real size (rows are far bigger than the layer's
      // font size the engine sized the extrusion for), with enough steps to stay solid.
      const k = Math.max(1, (REF * sy) / f.size);
      const steps = Math.min(64, Math.ceil(ex.steps * k));
      for (let j = steps; j >= 1; j--) {
        const t = (j / steps) * ex.steps * k;
        ctx.setTransform(sx, 0, tk * sy, sy, x + ex.dx * t, y + ex.dy * t);
        ctx.fillStyle = ex.colors[Math.min(ex.steps - 1, Math.max(0, Math.ceil((j / steps) * ex.steps) - 1))];
        ctx.fillText(row.text, ox, oy);
      }
    }
    ctx.setTransform(sx, 0, tk * sy, sy, x, y);
    const color = f.textPaint({ vi: i, cx: x - f.cx, cy: y - f.cy });
    if (f.strokeMode === 'outline') {
      ctx.strokeStyle = color;
      ctx.lineWidth = (f.strokeW / Math.max(sx, sy)) * (REF / f.size);
      ctx.strokeText(row.text, ox, oy);
    } else {
      if (f.strokeMode === 'both') {
        ctx.strokeStyle = f.layer.stroke.color;
        ctx.lineWidth = ((f.strokeW * 2) / Math.max(sx, sy)) * (REF / f.size);
        ctx.strokeText(row.text, ox, oy);
      }
      ctx.fillStyle = color;
      ctx.fillText(row.text, ox, oy);
    }
    if (ls) ctx.letterSpacing = '0px';
  }
})(window.TM);
