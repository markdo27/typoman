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
  function measure(family, weight, text) {
    if (!mctx) mctx = (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas')).getContext('2d');
    mctx.font = TM.fonts.fontString(family, weight, REF);
    if ('fontKerning' in mctx) mctx.fontKerning = 'normal';
    if ('letterSpacing' in mctx) mctx.letterSpacing = '0px';
    return mctx.measureText(text).width;
  }

  TM.registerPreset({
    id: 'stack',
    name: 'Stack',
    category: 'Kinetic',
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
        const widths = fams.map((x) => measure(x.family, weight, line.text) + gaps * L.tracking);
        return { text: line.text, gaps, widths, min: Math.min.apply(null, widths), max: Math.max.apply(null, widths) };
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
      const w = rows.map((_, i) => {
        const ph = f.p * P.cycles;
        let v;
        switch (P.motion) {
          case 'cascade': {
            // A bulge travels down the stack.
            const pos = (ph % 1) * (n + 1) - 0.5;
            v = Math.exp(-Math.pow((i - pos) / 0.7, 2)) * 2 - 0.4;
            break;
          }
          case 'pulse': v = Math.sin(TAU * ph) * (i % 2 ? -1 : 1); break;
          case 'noise': v = f.loopNoise(i * 3.1, P.cycles) * 1.6; break;
          default: v = Math.sin(TAU * (ph + i / n));
        }
        return Math.max(0.08, 1 + v * P.intensity * 0.85);
      });
      const sum = w.reduce((a, b) => a + b, 0);
      const usable = availH - gap * (n - 1);
      const desired = w.map((x) => (usable * x) / sum);

      if (P.fill === 'stretch') {
        // The poster look: scale each run unevenly to its band.
        let y = m;
        rows.forEach((row, i) => {
          const h = desired[i];
          drawRow(f, fams[0].family, row, f.W / 2, y + h / 2, availW / row.widths[0], h / L.capH, skewOf(P, w, i), i, L.tracking, row.widths[0], L.capH);
          y += h + gap;
        });
        return;
      }

      // Even scale from the band height (the motion always drives it), then the widest instance
      // that still fits the frame width, then tracking up to the limit. A row that still can't
      // reach both edges sits ragged, aligned like the layer's text; one that is too wide even
      // at its narrowest shrinks evenly. Letterforms are never distorted.
      const maxT = P.maxTrack * REF;
      const align = f.layer.type.align;
      let y = m;
      rows.forEach((row, i) => {
        const h = desired[i];
        const s = h / L.capH;
        const target = availW / s;
        let k = -1;
        row.widths.forEach((wk, j) => { if (wk <= target * 1.0001 && (k < 0 || wk > row.widths[k])) k = j; });
        let scale = s, extra = 0;
        if (k < 0) {
          k = row.widths.indexOf(row.min);
          scale = availW / row.min;
        } else if (row.gaps > 0) {
          extra = Math.min(maxT, (target - row.widths[k]) / row.gaps);
        }
        const runW = row.widths[k] + extra * row.gaps;
        const half = (runW * scale) / 2;
        const x = align === 'left' ? m + half : align === 'right' ? f.W - m - half : f.W / 2;
        drawRow(f, fams[k].family, row, x, y + h / 2, scale, scale, skewOf(P, w, i), i, L.tracking + extra, runW, L.capH);
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

  /** Alternate rows lean opposite ways, more as they grow. */
  function skewOf(P, w, i) {
    return P.alternate ? (i % 2 ? 1 : -1) * (w[i] - 1) * 0.25 : 0;
  }

  // Draw a row as one run (native kerning) in its own family; letterSpacing carries the tracking.
  function drawRow(f, family, row, x, y, sx, sy, skew, i, spacing, runW, capH) {
    const ctx = f.ctx;
    ctx.font = TM.fonts.fontString(family, f.layer.font.weight, REF);
    if ('fontKerning' in ctx) ctx.fontKerning = 'normal'; // as measured
    f._font = null; // drew with its own font; make drawGlyph re-apply its own
    const ls = 'letterSpacing' in ctx;
    if (ls) ctx.letterSpacing = spacing.toFixed(2) + 'px';
    const tk = -Math.tan(skew + f.slant);
    ctx.setTransform(sx, 0, tk * sy, sy, x, y);
    ctx.globalAlpha = f.alpha;
    const color = f.textPaint({ vi: i, cx: x - f.cx, cy: y - f.cy });
    const ox = -runW / 2, oy = capH / 2;
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
