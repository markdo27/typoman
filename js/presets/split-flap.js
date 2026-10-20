/* Preset: Split Flap — a departures board. Each letter sits in its own cell and rolls through
 * characters before landing on the real one.
 *
 * Craft notes
 *  - "Count up the drum": a cell rolls through the characters that precede its letter on a real
 *    board's drum (… R S T), so the roll reads as a mechanism rather than noise.
 *  - Flaps fall with gravity and stay crisp: when the roll slows down, each flap still falls in
 *    ~75 ms and then rests, like a real board decelerating. The last flap bounces on landing.
 *  - Slot style is a vertical drum: characters wrap over a cylinder (squashing toward the cell
 *    edges) and the reel overshoots its letter, then settles back.
 *  - Cells get their own spacing, so the board is re-laid out from the text layout (keeping
 *    each glyph's advance and the line's kerning) and fitted to the frame.
 *  - Right-to-left lines come laid out as whole words, so each word gets one cell (Arabic boards
 *    use word modules too). Padding accumulates in visual order, and every letter of a word cell
 *    rolls through its own script's alphabet, all in step: a Hebrew cell counts up in Hebrew.
 */
(function (TM) {
  'use strict';
  const { clamp, mod } = TM.math;
  const E = TM.EASINGS;
  const DRUM_U = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const DRUM_L = ' abcdefghijklmnopqrstuvwxyz0123456789';
  const FLIP_SEC = 0.075; // how long one flap takes to fall
  const TILE_IN = 0.14;   // share of a cell's in-window spent unfolding its tile
  const TILE_OUT = 0.16;  // share of the out-window spent folding it away
  const SETTLE = 0.24;    // share of the in-window spent settling after the last flip
  const DRUM_STEP = 0.95; // slot style: angular pitch between characters on the drum (rad)

  // ── word cells (lines with right-to-left script) ──
  const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u; // the ranges the layout marks line.rtl by
  const HEBREW = 'אבגדהוזחטיכלמנסעפצקרשת';
  const ALPHABETS = ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789', HEBREW, 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'];
  // Letter variants that roll from their base letter: Hebrew final forms, Arabic hamza/alef forms.
  const BASE = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ء': 'ا', 'ة': 'ه', 'ى': 'ي', 'ئ': 'ي', 'ؤ': 'و' };
  const FINAL = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' }; // Hebrew letters ending a word take their final form
  const isWordCell = (ch) => RTL.test(ch) || TM.text.graphemes(ch).length > 1;

  /**
   * The strings a word cell rolls through: step(d) moves every letter d places along its own
   * alphabet (the drum counting up, all letters in step), random(salt) draws random letters.
   * Arabic is drawn as one string, so the rolled words join like real ones.
   */
  function wordDrum(word, rand) {
    const parts = TM.text.graphemes(word);
    const slots = parts.map((c) => {
      const first = Array.from(c)[0];
      const b = BASE[first] || first;
      for (const set of ALPHABETS) { const i = set.indexOf(b); if (i >= 0) return { set, i }; }
      return null; // punctuation, marks, other scripts: they stay put
    });
    let last = -1;
    slots.forEach((s, k) => { if (s) last = k; });
    const make = (pick) => parts.map((c, k) => {
      const s = slots[k];
      if (!s) return c;
      const ch = s.set[pick(s, k)];
      return s.set === HEBREW && k === last && FINAL[ch] ? FINAL[ch] : ch;
    }).join('');
    return {
      step: (d) => make((s) => mod(s.i + d, s.set.length)),
      random: (salt) => make((s, k) => Math.floor(rand(k, salt) * s.set.length)),
    };
  }

  TM.registerPreset({
    id: 'split-flap',
    name: 'Split Flap',
    category: 'Reveal',
    description: 'A departures board: every letter rolls through its cell and lands with a mechanical bounce.',
    looks: [
      { name: 'Departures', bg: { type: 'solid', color: '#121212' }, post: { vignette: 0.3 },
        layer: { font: { family: 'JetBrains Mono', weight: 700 }, fill: { type: 'solid', color: '#ffb547' },
          params: { style: 'flap', tileColor: '#232323', tileAlpha: 1, tiles: 'on' } } },
      { name: 'Slot Machine', bg: { type: 'radial', color: '#3a0d52', color2: '#12001c' },
        layer: { font: { family: 'Bungee', weight: 400 }, fill: { type: 'palette', palette: ['#ffe3a3', '#ff5e5b', '#ffb547'] },
          params: { style: 'slot', tileColor: '#1b0a2e', flips: 12, settle: 0.8 } } },
      { name: 'Bauhaus Board', bg: { type: 'solid', color: '#f1ede4' },
        layer: { font: { family: 'Archivo Black', weight: 400 }, fill: { type: 'solid', color: '#ffffff' },
          params: { tileColor: '#e63326', tileAlpha: 1, pad: 0.12, gap: 0.06 } } },
    ],
    params: [
      ...TM.P.sequence({ inDur: 0.52, outDur: 0.3, stagger: 0.5, easeIn: 'outCubic', easeOut: 'inQuad' }),
      TM.P.select('style', 'Style', [['flap', 'Flaps'], ['slot', 'Slot reel']], 'flap', { group: 'Board' }),
      TM.P.range('flips', 'Characters rolled', 2, 24, 1, 9, { group: 'Board' }),
      TM.P.toggle('drum', 'Count up the drum', true, { group: 'Board', hint: 'Roll through the alphabet up to each letter, like a real board' }),
      TM.P.range('settle', 'Landing bounce', 0, 1, 0.01, 0.6, { group: 'Board' }),
      TM.P.select('tiles', 'Tiles', [['build', 'Build in/out'], ['on', 'Always on'], ['off', 'Hidden']], 'build', { group: 'Tiles' }),
      TM.P.color('tileColor', 'Tile colour', '#0b0d1a', { group: 'Tiles' }),
      TM.P.range('tileAlpha', 'Tile opacity', 0, 1, 0.01, 0.92, { group: 'Tiles' }),
      TM.P.range('pad', 'Cell padding (em)', 0, 0.4, 0.005, 0.09, { group: 'Tiles' }),
      TM.P.range('gap', 'Cell gap (em)', 0, 0.3, 0.005, 0.045, { group: 'Tiles' }),
    ],

    setup(f) {
      const P = f.params, L = f.layout;
      const fam = f.layer.font.family, wt = f.layer.font.weight;
      const size = L.sizePx, capH = L.capH, track = L.tracking;
      const padX = P.pad * size * 0.7, padY = P.pad * size, gap = P.gap * size;

      // ── board layout: cells add padding around every glyph (spaces included) ──
      // Glyph j of a line moves right by (2j + 1)·padX, a uniform extra spacing, so the advances
      // and kerning of the text layout survive; adjacent cells are separated by exactly `gap`.
      // j counts in visual order (left to right), so right-to-left lines keep even gaps too.
      const lines = L.lines.map((line) => {
        // Lowercase, Hebrew and Arabic have descenders: give the cells room below the baseline.
        const lower = RTL.test(line.text) || line.glyphs.some((gi) => { const c = L.glyphs[gi].ch; return c !== c.toUpperCase(); });
        const desc = lower ? L.descent * 0.8 : 0;
        const n = line.glyphs.length;
        const width = n ? line.width + n * 2 * padX + track - gap : 0;
        return { line, n, desc, width, cellH: capH + padY * 2 + desc };
      });
      const boardW = Math.max(1, ...lines.map((l) => l.width));
      const pitch = Math.max(L.lineGap, Math.max(...lines.map((l) => l.cellH), 1) + gap);
      const boardH = (lines.length - 1) * pitch + Math.max(...lines.map((l) => l.cellH), 1);
      const k = Math.min(1, (f.W * 0.92) / boardW, (f.H * 0.88) / boardH);

      const cells = new Array(L.glyphs.length).fill(null);
      lines.forEach((bl, li) => {
        const { line } = bl;
        const align = f.layer.type.align;
        const x0 = align === 'left' ? -boardW / 2 : align === 'right' ? boardW / 2 - bl.width : -bl.width / 2;
        const mid = (li - (lines.length - 1) / 2) * pitch;
        const baseline = mid + capH / 2 - bl.desc / 2;
        const order = line.rtl ? line.glyphs.slice().sort((a, b) => L.glyphs[a].x - L.glyphs[b].x) : line.glyphs;
        order.forEach((gi, j) => {
          const g = L.glyphs[gi];
          if (g.isSpace) return;
          const cx = x0 + (g.x - line.x) + (2 * j + 1) * padX + track / 2 - gap / 2 + g.w / 2;
          const half = g.w / 2 + padX + track / 2 - gap / 2;
          cells[gi] = {
            x: cx * k, gy: (baseline - capH / 2) * k, mid: mid * k,
            left: (cx - half) * k, right: (cx + half) * k,
            top: (mid - bl.cellH / 2) * k, bottom: (mid + bl.cellH / 2) * k,
          };
        });
      });

      // ── what each cell rolls through ──
      const adv = (ch) => TM.text.advance(ch, fam, wt, size);
      L.glyphs.forEach((g) => {
        const c = cells[g.i];
        if (!c) return;
        const n = Math.max(2, Math.round(P.flips * (0.8 + 0.4 * f.rand(g.i, 61))));
        const m = Math.max(2, Math.round(n * 0.55));
        const seqIn = [' '], seqOut = [g.ch];
        if (isWordCell(g.ch)) {
          const wd = wordDrum(g.ch, (j, salt) => f.rand(g.i * 131 + j, salt));
          for (let s = 1; s < n; s++) seqIn.push(P.drum ? wd.step(s - n) : wd.random(70 + s));
          for (let s = 1; s < m; s++) seqOut.push(P.drum ? wd.step(s) : wd.random(110 + s));
        } else {
          const drum = g.ch !== g.ch.toUpperCase() ? DRUM_L : DRUM_U;
          const idx = drum.indexOf(g.ch);
          const counted = P.drum && idx > 0;
          const rnd = (salt) => drum[1 + Math.floor(f.rand(g.i, salt) * (drum.length - 1))];
          for (let s = 1; s < n; s++) seqIn.push(counted ? drum[mod(idx - (n - s), drum.length)] : rnd(70 + s));
          for (let s = 1; s < m; s++) seqOut.push(counted ? drum[mod(idx + s, drum.length)] : rnd(110 + s));
        }
        seqIn.push(g.ch);
        seqOut.push(' ');
        // Horizontal fit of each rolling character inside the cell.
        const inner = (c.right - c.left) / k - padX * 0.6;
        const fit = {};
        for (const ch of seqIn.concat(seqOut)) {
          if (ch === ' ' || ch === g.ch || fit[ch]) continue;
          fit[ch] = Math.min(1, inner / Math.max(1, adv(ch)));
        }
        Object.assign(c, { n, m, seqIn, seqOut, fit });
      });
      return { cells, k, size: size * k };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      if (!C) return;
      const ctx = f.ctx;
      const { inDur, outDur } = TM.MotionKit.windows(P);
      const st = P.stagger;
      const secIn = Math.max(1e-3, inDur * (1 - st) * f.dur);   // seconds per unit of kin
      const secOut = Math.max(1e-3, outDur * (1 - st) * f.dur); // seconds per unit of kout
      const eIn = TM.ease(P.easeIn, 'outCubic'), eOut = TM.ease(P.easeOut, 'inQuad');
      const slot = P.style === 'slot';
      const build = P.tiles === 'build';
      const tiles = P.tiles !== 'off' && P.tileAlpha > 0;
      const tileAlpha = P.tileAlpha; // tiles keep their own colour and opacity under any fill
      const rollStart = build ? TILE_IN : 0, rollEnd = 1 - SETTLE;
      const outEnd = build ? 1 - TILE_OUT : 1;
      const ov = slot ? P.settle * 0.4 : 0; // slot reels overshoot their letter by this many characters

      for (const g of L.glyphs) {
        const c = C.cells[g.i];
        if (!c) continue;
        const s = f.seq(g);
        // Tile envelope: unfolds from the split line, folds back into it.
        let tile = tiles ? 1 : 0;
        if (tiles && build) {
          const a = clamp(s.kin / TILE_IN), b = clamp((s.kout - outEnd) / TILE_OUT);
          tile = (a < 1 ? E.outBack(a) : 1) * (b > 0 ? 1 - E.inBack(b) : 1);
        }
        if (s.kin <= 0 && !(tiles && !build)) continue;
        if (s.kout >= 1 && !(tiles && !build)) continue;

        // Roll state: sequence, continuous position and its speed (positions per second).
        let seq, pos, vel, bounce = 0;
        if (s.kout > 0) {
          seq = c.seqOut;
          const w = clamp(s.kout / outEnd);
          pos = c.m * eOut(w);
          vel = (c.m * slope(eOut, w)) / (outEnd * secOut);
        } else {
          seq = c.seqIn;
          const w = clamp((s.kin - rollStart) / (rollEnd - rollStart));
          pos = (c.n + ov) * eIn(w);
          vel = ((c.n + ov) * slope(eIn, w)) / ((rollEnd - rollStart) * secIn);
          const u = clamp((s.kin - rollEnd) / (1 - rollEnd));
          if (u > 0) {
            if (slot) pos = c.n + ov * Math.exp(-3 * u) * Math.cos(Math.PI * 2.5 * u);
            else bounce = P.settle * 0.75 * Math.abs(Math.sin(Math.PI * 2 * u)) * Math.pow(1 - u, 2.2);
            vel = 0;
          }
        }
        const charAt = (j) => (j < seq.length ? seq[Math.max(0, j)] : c.seqOut[Math.min(c.seqOut.length - 1, j - c.n)]);

        const X = f.cx + c.x, MID = f.cy + c.mid;
        const top = f.cy + c.top, bottom = f.cy + c.bottom, left = f.cx + c.left, right = f.cx + c.right;
        // Tile geometry scaled about the split line by the envelope.
        const tTop = MID - (MID - top) * tile, tBot = MID + (bottom - MID) * tile;
        const radius = C.size * 0.07 * Math.min(1, tile);
        if (tile > 0.002 && tiles) {
          f.identity();
          ctx.globalAlpha = f.alpha * tileAlpha;
          ctx.fillStyle = P.tileColor;
          roundRect(ctx, left, tTop, right - left, tBot - tTop, [radius, radius, radius, radius]);
          ctx.fill();
          // The upper half catches a touch more light.
          ctx.globalAlpha = f.alpha * tileAlpha * 0.07;
          ctx.fillStyle = '#ffffff';
          roundRect(ctx, left, tTop, right - left, MID - tTop, [radius, radius, 0, 0]);
          ctx.fill();
        }
        if (s.kin <= 0 || s.kout >= 1) {
          if (tile > 0.002 && tiles) splitLine(f, left, right, MID);
          continue;
        }
        const geo = { g, X, MID, top, bottom, left, right, radius, gy: f.cy + c.gy, size: C.size, fit: c.fit };

        if (slot) {
          drawReel(f, geo, pos, charAt, tiles ? tileAlpha : 0, P.tileColor);
        } else {
          const k = Math.floor(pos), phase = pos - k;
          if (pos >= seq.length - 1) {
            // Landed, with an optional bounce of the last flap.
            const last = seq[seq.length - 1];
            if (bounce > 0.001) drawFlip(f, geo, seq[seq.length - 2], last, 0, bounce);
            else drawChar(f, geo, last, 1, null);
          } else {
            // A flap falls in FLIP_SEC however slowly the roll is going, then rests.
            const span = clamp(FLIP_SEC * Math.abs(vel), 0.12, 1);
            drawFlip(f, geo, seq[k], seq[k + 1], clamp(phase / span), 0);
          }
        }
        if (tiles) splitLine(f, left, right, MID);
      }
    },
  });

  const slope = TM.MotionKit.slope;

  /** Rounded rectangle path; radii = [top-left, top-right, bottom-right, bottom-left]. */
  function roundRect(ctx, x, y, w, h, radii) {
    ctx.beginPath();
    if (!ctx.roundRect || w <= 0 || h <= 0) { ctx.rect(x, y, Math.max(0, w), Math.max(0, h)); return; }
    const m = Math.min(w / 2, h / 2);
    ctx.roundRect(x, y, w, h, radii.map((r) => Math.max(0, Math.min(r, m))));
  }

  function splitLine(f, left, right, y) {
    const ctx = f.ctx;
    f.identity();
    const h = Math.max(1, f.layout.sizePx * 0.012);
    ctx.globalAlpha = f.alpha * 0.55;
    ctx.fillStyle = '#000000';
    ctx.fillRect(left, y - h / 2, right - left, h);
  }

  /** Draw character ch in the cell, optionally scaled vertically about the split line. */
  function drawChar(f, geo, ch, sy, clip) {
    if (!ch || ch === ' ') return;
    const ctx = f.ctx;
    if (clip) {
      f.identity();
      ctx.save();
      ctx.beginPath();
      ctx.rect(geo.left - 2, clip[0], geo.right - geo.left + 4, clip[1] - clip[0]);
      ctx.clip();
    }
    const own = ch === geo.g.ch;
    f.drawGlyph(geo.g, {
      ch: own ? undefined : ch,
      x: geo.X,
      y: geo.MID + (geo.gy - geo.MID) * sy,
      sx: own ? 1 : geo.fit[ch] || 1,
      sy,
      size: geo.size,
    });
    if (clip) ctx.restore();
  }

  /**
   * One flip from character a to b. q: 0..1 flip progress. bounce: lift (rad) of b's lower flap
   * after landing. Every region is drawn once (the static halves are clipped to what the moving
   * flap uncovers), so the flip also reads correctly with tiles hidden.
   */
  function drawFlip(f, geo, a, b, q, bounce) {
    const { MID, top, bottom, left, right, radius } = geo;
    if (!(bounce > 0) && q <= 0) return drawChar(f, geo, a, 1, null);
    if (!(bounce > 0) && q >= 1) return drawChar(f, geo, b, 1, null);
    let upper, c, shade;
    if (bounce > 0) {
      upper = false; c = Math.cos(bounce); shade = -0.1 * Math.sin(bounce);
    } else {
      const th = Math.PI * (0.35 * q + 0.65 * q * q); // gravity: the flap accelerates as it falls
      upper = th < Math.PI / 2;
      c = Math.abs(Math.cos(th));
      shade = (upper ? 0.55 : 0.32) * Math.sin(th);
    }
    if (upper) {
      // The upper flap (a) folds down toward the split line, uncovering b's top behind it.
      const y0 = MID - (MID - top) * c;
      drawChar(f, geo, b, 1, [top, y0]);
      drawChar(f, geo, a, c, [y0, MID]);
      drawChar(f, geo, a, 1, [MID, bottom]);
      shadeFlap(f, left, y0, right - left, MID - y0, [radius * c, radius * c, 0, 0], shade);
    } else {
      // The lower flap (b) swings down over a's bottom half.
      const y1 = MID + (bottom - MID) * c;
      drawChar(f, geo, b, 1, [top, MID]);
      drawChar(f, geo, b, c, [MID, y1]);
      drawChar(f, geo, a, 1, [y1, bottom]);
      shadeFlap(f, left, MID, right - left, y1 - MID, [0, 0, radius * c, radius * c], shade);
    }
  }

  function shadeFlap(f, x, y, w, h, radii, shade) {
    if (Math.abs(shade) < 0.01 || h <= 0.5) return;
    const ctx = f.ctx;
    f.identity();
    ctx.globalAlpha = f.alpha * Math.abs(shade);
    ctx.fillStyle = shade > 0 ? '#000000' : '#ffffff';
    roundRect(ctx, x, y, w, h, radii);
    ctx.fill();
  }

  /** Slot style: characters on a vertical drum, clipped to the cell. */
  function drawReel(f, geo, pos, charAt, tileAlpha, tileColor) {
    const ctx = f.ctx;
    const { MID, top, bottom, left, right } = geo;
    const hh = (bottom - top) / 2;
    const R = (hh * 1.02) / Math.sin(DRUM_STEP);
    const k = Math.floor(pos), phase = pos - k;
    f.identity();
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();
    for (let j = k - 1; j <= k + 2; j++) {
      const th = (phase - (j - k)) * DRUM_STEP; // + is below centre: characters roll downward
      if (Math.abs(th) >= Math.PI / 2) continue;
      const ch = charAt(j);
      if (!ch || ch === ' ') continue;
      const cs = Math.cos(th);
      const own = ch === geo.g.ch;
      f.drawGlyph(geo.g, {
        ch: own ? undefined : ch,
        x: geo.X,
        y: MID + R * Math.sin(th) + (geo.gy - MID) * cs,
        sx: own ? 1 : geo.fit[ch] || 1,
        sy: cs,
        alpha: Math.pow(cs, 0.6),
        size: geo.size,
      });
    }
    // The drum curves away from the viewer at the top and bottom of the window.
    if (tileAlpha > 0) {
      f.identity();
      const band = hh * 0.55;
      for (const [y0, y1] of [[top, top + band], [bottom, bottom - band]]) {
        const gr = ctx.createLinearGradient(0, y0, 0, y1);
        gr.addColorStop(0, TM.color.rgba(tileColor, tileAlpha));
        gr.addColorStop(1, TM.color.rgba(tileColor, 0));
        ctx.globalAlpha = f.alpha;
        ctx.fillStyle = gr;
        ctx.fillRect(left, Math.min(y0, y1), right - left, band);
      }
    }
    ctx.restore();
  }
})(window.TM);
