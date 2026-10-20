/* Preset: Kinetic Grid — a Swiss / Bauhaus modular grid of type.
 * The frame is divided into square-ish cells, each a tile carrying one letter (spaces are blank
 * tiles). On every beat each cell moves to its next page, staggered across the grid: it slides,
 * rotates, scales or flips to a new letter and colour. Pages walk through the text, so long text
 * is shown over the beats; after the last beat every cell is back on page 0, which makes the loop
 * seamless.
 *
 * Letters are cut out of the tiles (destination-out), so whatever is behind the layer shows
 * through: a gradient or radial background, another layer, or nothing in a transparent export.
 * The tiles take the layer's fill: a palette cycles across them, a solid colour alternates with a
 * tint of itself, a gradient runs across the whole grid. With tiles off the letters take the fill.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp } = TM.math;
  const MOVES = ['slide', 'rotate', 'scale', 'flip'];

  /** Cells across and down: `cells` across the frame's short side, square-ish along the long one. */
  function gridOf(f) {
    const short = Math.max(2, Math.round(f.params.cells));
    return f.W >= f.H
      ? { cols: Math.max(short, Math.round((short * f.W) / f.H)), rows: short }
      : { cols: short, rows: Math.max(short, Math.round((short * f.H) / f.W)) };
  }

  /**
   * The text set in rows of `cols` cells without breaking words: a word that doesn't fit the rest
   * of a row starts the next one, each text line starts a row, and a word longer than a row splits
   * into even parts (MOTION on five cells → MOT / ION). Rows are aligned like the layer's text.
   * Right-to-left lines fill their rows from the right, one word cluster per cell.
   */
  function wrapRows(L, cols, align) {
    const out = [];
    let rtl = false;
    const flush = (row) => {
      if (!row.length) return;
      if (rtl) row = row.slice().reverse();
      const pad = cols - row.length, left = align === 'left' ? 0 : align === 'right' ? pad : Math.floor(pad / 2);
      out.push(Array.from({ length: cols }, (_, i) => (i >= left && i < left + row.length ? row[i - left] : null)));
    };
    for (const line of L.lines) {
      rtl = !!line.rtl;
      const words = [];
      let cur = [];
      for (const gi of line.glyphs) {
        const g = L.glyphs[gi];
        if (g.isSpace) { if (cur.length) words.push(cur); cur = []; } else cur.push(g);
      }
      if (cur.length) words.push(cur);
      let row = [];
      for (const word of words) {
        const parts = Math.ceil(word.length / cols), size = Math.ceil(word.length / parts);
        for (let k = 0; k < word.length; k += size) {
          const chunk = word.slice(k, k + size);
          if (row.length && row.length + 1 + chunk.length > cols) { flush(row); row = []; }
          if (row.length) row.push(null);
          row.push(...chunk);
        }
      }
      flush(row);
    }
    return out;
  }

  TM.registerPreset({
    id: 'kinetic-grid',
    name: 'Kinetic Grid',
    category: 'Generative',
    description: 'A Swiss modular grid of letter tiles that slide, rotate, scale and flip to the beat.',
    fit: false,
    params: [
      TM.P.range('cells', 'Cells across', 2, 6, 1, 3, { group: 'Grid', hint: 'Cells across the frame’s short side' }),
      TM.P.range('gutter', 'Gutter', 0, 0.05, 0.001, 0.012, { group: 'Grid' }),
      TM.P.toggle('tiles', 'Colour tiles', true, { group: 'Grid', hint: 'Off: palette letters on the bare background' }),
      TM.P.range('textScale', 'Letter size', 0.3, 0.95, 0.01, 0.66, { group: 'Grid' }),
      TM.P.toggle('words', 'Keep words whole', true, { group: 'Grid', hint: 'Rows break between words and the text scrolls a row per beat. Off: every cell filled, letter after letter' }),
      TM.P.range('beats', 'Beats per loop', 1, 8, 1, 4, { group: 'Rhythm' }),
      TM.P.range('moveLen', 'Move length', 0.15, 1, 0.01, 0.5, { group: 'Rhythm', hint: 'Fraction of a beat each move takes' }),
      TM.P.range('stagger', 'Stagger', 0, 0.8, 0.01, 0.35, { group: 'Rhythm' }),
      TM.P.select('order', 'Order', [['diagonal', 'Diagonal'], ['rows', 'Rows'], ['columns', 'Columns'], ['center', 'Centre out'], ['random', 'Random']], 'diagonal', { group: 'Rhythm' }),
      TM.P.ease('ease', 'Ease', 'snap', { group: 'Rhythm' }),
      TM.P.select('moves', 'Moves', [['mixed', 'Mixed'], ['slide', 'Slide'], ['rotate', 'Rotate'], ['scale', 'Scale'], ['flip', 'Flip']], 'mixed', { group: 'Rhythm' }),
    ],

    setup(f) {
      // Reading-order sequence: letters, a blank tile per space and one between lines.
      const seq = [];
      f.layout.lines.forEach((line, li) => {
        if (li) seq.push(null);
        for (const gi of line.glyphs) { const g = f.layout.glyphs[gi]; seq.push(g.isSpace ? null : g); }
      });
      if (!seq.some(Boolean)) return { seq: [], wrapped: [] };
      return { seq, rtl: !!(f.layout.lines[0] && f.layout.lines[0].rtl), wrapped: f.params.words ? wrapRows(f.layout, gridOf(f).cols, f.layer.type.align) : null };
    },

    render(f) {
      const P = f.params, seq = f.cache.seq, L = f.layout;
      if (!seq.length) return;
      const W = f.W, H = f.H, ctx = f.ctx;
      const { cols, rows } = gridOf(f);
      const gut = P.gutter * f.unit;
      const cw = (W - gut * (cols + 1)) / cols, ch = (H - gut * (rows + 1)) / rows;
      const n = cols * rows;
      const B = Math.max(1, Math.round(P.beats));
      const bp = f.p * B, beat = Math.min(B - 1, Math.floor(bp)), lt = bp - beat;
      const ease = TM.ease(P.ease, 'snap');
      const dur = Math.max(0.05, Math.min(P.moveLen, 1 - P.stagger));
      const fill = f.layer.fill;
      const pal = fill.palette;
      const tiles = P.tiles && f.echo === 0;
      // Tile colours from the layer fill. A solid fill alternates with a tint toward the
      // background, so each beat's change still reads; a gradient is painted per tile below.
      const bgc = f.bg && f.bg.type !== 'transparent' ? f.bg.color : '#000000';
      const tint = fill.type === 'solid' ? [fill.color, TM.color.mix(fill.color, bgc, 0.18)] : null;

      // Page k of the text in cell c: whole rows scrolling up (as many rows per beat as it takes to
      // show the text over the loop, at most a page), or the letters running on cell after cell.
      const wr = f.cache.wrapped;
      const step = wr && wr.length ? clamp(Math.ceil(wr.length / B), 1, rows) : 0;
      const content = wr && wr.length
        ? (c, k) => wr[(Math.floor(c / cols) + k * step) % wr.length][c % cols]
        : f.cache.rtl
          ? (c, k) => seq[(c - (c % cols) + cols - 1 - (c % cols) + k * n) % seq.length] // right to left along each row
          : (c, k) => seq[(c + k * n) % seq.length];
      const colour = (c, k) => (fill.type === 'palette' ? pal[(c + k) % pal.length] : tint ? tint[(c + k) % 2] : null);
      const rankOf = (i, j, c) => {
        switch (P.order) {
          case 'rows': return n > 1 ? c / (n - 1) : 0;
          case 'columns': return n > 1 ? (i * rows + j) / (n - 1) : 0;
          case 'random': return f.rand(c, 404);
          case 'center': {
            const dx = (i - (cols - 1) / 2) / Math.max(1, cols - 1), dy = (j - (rows - 1) / 2) / Math.max(1, rows - 1);
            return clamp(Math.hypot(dx, dy) / Math.SQRT1_2);
          }
          default: return cols + rows > 2 ? (i + j) / (cols + rows - 2) : 0;
        }
      };

      // One tile + letter, centred at (x, y), with extra transform (scale sx/sy, rotation).
      const piece = (c, k, x, y, sx, sy, rot) => {
        if (Math.abs(sx) < 1e-3 || Math.abs(sy) < 1e-3) return;
        const col = colour(c, k);
        if (tiles) {
          f.identity();
          ctx.translate(x, y);
          ctx.rotate(rot);
          ctx.scale(sx, sy);
          // A gradient fill runs across the whole grid, fixed in frame space as the tile moves.
          ctx.fillStyle = col || f.textPaint({ vi: c, cx: x - f.cx, cy: y - f.cy });
          ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
        }
        const g = content(c, k);
        if (!g) return;
        const s = Math.min((ch * P.textScale) / Math.max(1, L.capH), (cw * 0.84) / Math.max(1, g.w));
        const o = { x, y, rot, sx: s * sx, sy: s * sy };
        if (!tiles) {
          // Letters on the bare background take the fill (the palette per tile, else the fill).
          if (fill.type === 'palette' || f.colorOverride) o.color = f.colorOverride || col;
          f.drawGlyph(g, o);
          return;
        }
        // Cut the letter out of its tile. With extrude on, the extrusion steps are drawn first
        // (as drawGlyph would) and the face is then cut, so the letter reads as carved deep.
        const ex = f.extrude, mode = f.strokeMode;
        f.extrude = null;
        if (ex) {
          f.strokeMode = 'none';
          for (let q = ex.steps; q >= 1; q--) f.drawGlyph(g, Object.assign({}, o, { x: x + ex.dx * q * o.sx, y: y + ex.dy * q * o.sy, color: ex.colors[q - 1] }));
          f.strokeMode = mode;
        }
        ctx.globalCompositeOperation = 'destination-out';
        f.drawGlyph(g, Object.assign({ color: '#000000' }, o));
        ctx.globalCompositeOperation = 'source-over';
        f.extrude = ex;
      };

      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const c = j * cols + i;
          const x0 = gut + i * (cw + gut), y0 = gut + j * (ch + gut);
          const x = x0 + cw / 2, y = y0 + ch / 2;
          const raw = clamp((lt - rankOf(i, j, c) * P.stagger) / dur);
          const e = ease(raw);
          const k = beat, k1 = (beat + 1) % B;
          f.identity();
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0, y0, cw, ch);
          ctx.clip();
          if (raw <= 0) piece(c, k, x, y, 1, 1, 0);
          else if (raw >= 1) piece(c, k1, x, y, 1, 1, 0);
          else {
            const pick = Math.floor(f.rand(c, beat * 7 + 3) * 4);
            const move = P.moves === 'mixed' ? MOVES[pick] : P.moves;
            if (move === 'slide') {
              const d = Math.floor(f.rand(c, beat * 7 + 5) * 4); // 0 → right, 1 ← left, 2 ↓, 3 ↑
              const ux = d === 0 ? 1 : d === 1 ? -1 : 0, uy = d === 2 ? 1 : d === 3 ? -1 : 0;
              piece(c, k, x + ux * cw * e, y + uy * ch * e, 1, 1, 0);
              piece(c, k1, x + ux * cw * (e - 1), y + uy * ch * (e - 1), 1, 1, 0);
            } else if (move === 'rotate') {
              // A quarter turn; the content swaps at 45°, where the square's silhouette is identical.
              const dir = f.rand(c, beat * 7 + 6) < 0.5 ? -1 : 1;
              if (e < 0.5) piece(c, k, x, y, 1, 1, dir * e * (TAU / 4));
              else piece(c, k1, x, y, 1, 1, dir * (e - 1) * (TAU / 4));
            } else if (move === 'scale') {
              piece(c, k, x, y, 1 - e, 1 - e, 0);
              piece(c, k1, x, y, TM.ease('overshoot')(raw), TM.ease('overshoot')(raw), 0);
            } else {
              const sx = Math.cos(Math.PI * e);
              if (sx > 0) piece(c, k, x, y, sx, 1, 0);
              else piece(c, k1, x, y, -sx, 1, 0);
            }
          }
          ctx.restore();
        }
      }
    },

    looks: [
      { name: 'Bauhaus', bg: { type: 'solid', color: '#f1ede4' }, layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'palette', palette: ['#e63326', '#1d3fbb', '#f6bf26', '#111111'] }, params: { gutter: 0.008 } } },
      { name: 'Swiss mono', bg: { type: 'solid', color: '#ffffff' }, layer: { font: { family: 'Inter Tight', weight: 800 }, fill: { type: 'palette', palette: ['#141414', '#ff3d00', '#141414', '#7c7c7c'] }, params: { cells: 4, moves: 'slide', order: 'rows' } } },
      { name: 'Neon arcade', bg: { type: 'solid', color: '#07000f' }, layer: { font: { family: 'Press Start 2P', weight: 400 }, fill: { type: 'palette', palette: ['#ff00e5', '#00f0ff', '#faff00'] }, params: { tiles: false, textScale: 0.5, moves: 'flip', ease: 'outBounce' } } },
    ],
  });
})(window.TM);
