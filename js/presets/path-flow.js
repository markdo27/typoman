/* Preset: Path Flow — type riding an editable bézier path.
 * Reference preset for the path family: arc-length placement, seamless looping offsets,
 * multi-line text as parallel lanes, soft fades at open ends.
 *
 * Path typography (see SampledPath.rounded / lane / tracked in js/engine/path.js):
 *  - The text block rides a bend-limited copy of the path. Every bend keeps a radius the
 *    block can follow (its own height plus a margin on the inside), so tight crests and sharp
 *    corners turn into fillets and notches are bridged. Each line is a parallel curve of that
 *    copy: lanes keep their leading and can never cross.
 *  - Along a lane, text advances at 1 − h·|ω| per px (ω: the glyphs' rotation rate, h: their
 *    reach toward the inside of the bend), so each pair of letters gets exactly the room its
 *    inner corners lose, eased in and out like a tracking curve. Straights keep the layout's
 *    kerning untouched.
 */
(function (TM) {
  'use strict';
  const { TAU, clamp, mod, smoothstep } = TM.math;
  const SEPARATORS = { space: ' ', dot: '•', dash: '—', slash: '/', star: '✦', none: '' };
  // Bend radii, as the block's reach toward the inside of the bend plus a multiple of the
  // glyphs' own reach h (so the innermost glyph edge keeps a radius of that multiple × h):
  //  - HARD always: lanes stay clean, and bend spacing stays under 1 + 1/0.35 ≈ 3.9×.
  //  - comfort(k), from Corner smoothing k: 1.25 h (spacing ≤ 1.8×, ≈ 0.35 em a pair) at 0,
  //    2.6 h (≤ 1.4×) by default, 4.75 h at 1. Kept wherever it moves the type no further than
  //    reach(k) from the drawn path, so stars keep their points and waves most of their swing.
  // Measured on the default wave (16:9, TYPE IN MOTION): worst in-word gap 0.13 em, the type at
  // most 0.24 em off the drawn path. Tuned against zigzags, the heart, 1:1 and 9:16, 1–3 lines.
  const HARD = 0.35;
  const comfort = (k) => 1.25 + 3.5 * Math.pow(clamp(k, 0, 1), 1.4);
  const reach = (k) => 0.35 + clamp(k, 0, 1); // em
  const rotWin = (k) => 1.6 * clamp(k, 0, 1); // em: atSmooth window for the glyphs' angle
  const LIMIT = 2; // em: the hard radii never move the type further than this
  const SPREAD = 0.35; // em: how far bend spacing eases in and out around a bend

  let mctx = null;
  function measurer() {
    if (!mctx) mctx = (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas')).getContext('2d');
    return mctx;
  }

  TM.registerPreset({
    id: 'path-flow',
    name: 'Path Flow',
    category: 'Path',
    description: 'Type rides your path: a marquee, a single traveller, or a fixed caption with a wave.',
    usesPath: true,
    path: 'wave',
    params: [
      TM.P.select('mode', 'Mode', [['fill', 'Fill & scroll'], ['travel', 'Travel'], ['still', 'Fixed']], 'fill', { group: 'Motion' }),
      TM.P.range('speed', 'Speed (cycles)', -4, 4, 1, 1, { group: 'Motion', hint: 'Whole cycles per loop keep the loop seamless' }),
      TM.P.range('offset', 'Start offset', 0, 1, 0.001, 0, { group: 'Motion' }),
      TM.P.ease('travelEase', 'Travel ease', 'inOutSine', { group: 'Motion', showIf: { mode: 'travel' } }),
      TM.P.range('rotate', 'Follow tangent', 0, 1, 0.01, 1, { group: 'Motion' }),
      TM.P.range('cornerSmooth', 'Corner smoothing', 0, 1, 0.01, 0.5, { group: 'Motion', hint: 'Eases tight bends and sharp corners into curves the type can turn evenly' }),
      TM.P.range('wave', 'Wave', 0, 1.5, 0.01, 0, { group: 'Wave' }),
      TM.P.range('waveLength', 'Wavelength (em)', 0.5, 12, 0.1, 4, { group: 'Wave' }),
      TM.P.range('waveSpeed', 'Wave cycles', -4, 4, 1, 1, { group: 'Wave' }),
      TM.P.select('separator', 'Separator', [['space', 'Space'], ['dot', '•'], ['dash', '—'], ['slash', '/'], ['star', '✦'], ['none', 'None']], 'dot', { group: 'Layout', showIf: { mode: 'fill' } }),
      TM.P.range('gap', 'Gap (em)', 0, 3, 0.05, 0.6, { group: 'Layout', showIf: { mode: 'fill' } }),
      TM.P.select('lanes', 'Extra lines', [['same', 'Parallel'], ['alternate', 'Alternate direction']], 'alternate', { group: 'Layout' }),
      TM.P.select('align', 'Sit on path', [['baseline', 'Baseline'], ['center', 'Centered']], 'center', { group: 'Layout' }),
      TM.P.range('bendSpacing', 'Bend spacing', 0, 1.5, 0.05, 1, { group: 'Layout', hint: 'Extra room on curves and corners so letters never collide' }),
      TM.P.select('guide', 'Show path', [['none', 'Hidden'], ['line', 'Line'], ['dashed', 'Dashed'], ['dots', 'Dots']], 'none', { group: 'Layout' }),
    ],

    setup(f) {
      const sep = SEPARATORS[f.params.separator] || '';
      const sepW = sep ? TM.text.advance(sep, f.layer.font.family, f.layer.font.weight, f.size) : 0;
      // Each line's ink reach above and below the glyph centres, and its narrowest advance.
      const L = f.layout, half = L.capH / 2, ctx = measurer();
      ctx.font = L.font;
      const lines = L.lines.map((line) => {
        let top = 0, bottom = 0, wMin = Infinity;
        for (const gi of line.glyphs) {
          const g = L.glyphs[gi];
          if (g.isSpace) continue;
          const m = ctx.measureText(g.ch);
          top = Math.max(top, m.actualBoundingBoxAscent != null ? m.actualBoundingBoxAscent - half : half);
          bottom = Math.max(bottom, m.actualBoundingBoxDescent != null ? half + m.actualBoundingBoxDescent : half);
          wMin = Math.min(wMin, g.w);
        }
        return { top, bottom, wMin: Number.isFinite(wMin) ? wMin : f.size / 2 };
      });
      return { sep, sepW, lines };
    },

    render(f) {
      const base = f.path;
      if (!base || base.length < 1) return;
      const P = f.params, L = f.layout, size = f.size;
      const G = geometry(f, base);

      if (P.guide !== 'none') drawGuide(f, G.carrier, P.guide);

      L.lines.forEach((line, li) => {
        if (!line.glyphs.length) return;
        const path = G.lanes[li];
        const dir = P.lanes === 'alternate' && li % 2 === 1 ? -1 : 1;
        const first = L.glyphs[line.glyphs[0]];
        const x0 = first.x;

        if (P.mode === 'fill') {
          // Repeat the line (+ separator) along the whole path. On closed paths the gap is
          // stretched so a whole number of repeats fits exactly — no seam where the path closes.
          const gapPx = P.gap * size;
          const sepW = f.cache.sep ? f.cache.sepW + gapPx : 0;
          let unit = line.width + gapPx + sepW;
          let reps = Math.max(1, Math.ceil(path.length / unit) + 1);
          if (path.closed) {
            reps = Math.max(1, Math.round(path.length / unit));
            unit = path.length / reps;
          }
          const shift = mod(P.offset * path.length + dir * P.speed * f.p * unit, unit);
          // Open paths need a repeat before the start and one past the end; a closed path wraps,
          // so those two would land exactly on others (drawing them twice).
          for (let r = path.closed ? 0 : -1, r1 = path.closed ? reps : reps + 1; r < r1; r++) {
            const start = r * unit + shift;
            for (const gi of line.glyphs) {
              const g = L.glyphs[gi];
              place(f, G, path, g, start + (g.x - x0) + g.w / 2, null);
            }
            if (f.cache.sep) {
              place(f, G, path, { ch: f.cache.sep, w: f.cache.sepW, vi: -1, isSpace: false, x: 0 }, start + line.width + gapPx / 2 + f.cache.sepW / 2, f.cache.sep);
            }
          }
        } else {
          // Single run: travel moves it from before the start to past the end; fixed parks it.
          let s0;
          if (P.mode === 'travel') {
            const cycles = Math.max(1, Math.abs(P.speed));
            const local = TM.math.fract(f.p * cycles);
            const k = TM.ease(P.travelEase)(local);
            if (path.closed) s0 = P.offset * path.length + dir * Math.sign(P.speed || 1) * k * path.length;
            else {
              const from = -line.width - size, to = path.length + size;
              const u = dir * Math.sign(P.speed || 1) > 0 ? k : 1 - k;
              s0 = from + (to - from) * u;
            }
          } else {
            s0 = P.offset * path.length - (path.closed ? 0 : line.width * P.offset);
          }
          for (const gi of line.glyphs) {
            const g = L.glyphs[gi];
            place(f, G, path, g, s0 + (g.x - x0) + g.w / 2, null);
          }
        }
      });
    },
  });

  /**
   * The block's geometry for this path: the bend-limited carrier and one tracked lane per line.
   * Pure in (path, layout, params), cached per path object (a still path is built once; a
   * morphing path is rebuilt per frame).
   */
  const built = new WeakMap();
  function geometry(f, base) {
    const P = f.params, L = f.layout, size = f.size, lines = f.cache.lines;
    const n = L.lines.length;
    const amp = P.wave > 0 ? P.wave * size * 0.5 : 0;
    const lift = P.align === 'baseline' ? -L.capH / 2 : 0;
    const win = rotWin(P.cornerSmooth) * size; // atSmooth window used when drawing
    const key = [n, L.lineGap, L.capH, size, lift, amp, P.cornerSmooth, P.bendSpacing, P.rotate, P.waveLength, lines.map((m) => m.top + ',' + m.bottom + ',' + m.wMin).join(';')].join('|');
    const hit = built.get(base);
    if (hit && hit.key === key) return hit;

    // Lanes at their leading around the path (glyph centres), and how far the block reaches
    // to each side, wave included. Lines without glyphs take no room.
    const offs = L.lines.map((line, li) => (li - (n - 1) / 2) * L.lineGap + lift);
    let T = 0, B = 0, ht = 0, hb = 0;
    L.lines.forEach((line, li) => {
      if (!line.glyphs.some((gi) => !L.glyphs[gi].isSpace)) return;
      const m = lines[li];
      T = Math.max(T, m.top + amp - offs[li]);
      B = Math.max(B, m.bottom + amp + offs[li]);
      ht = Math.max(ht, m.top + amp);
      hb = Math.max(hb, m.bottom + amp);
    });
    const k = comfort(P.cornerSmooth);
    const left = T > 0 ? T + HARD * ht : 0, right = B > 0 ? B + HARD * hb : 0;
    const opts = { prefer: [T > 0 ? T + k * ht : 0, B > 0 ? B + k * hb : 0], reach: reach(P.cornerSmooth) * size, limit: LIMIT * size };
    const carrier = carrierFor(f, base, left, right, opts);
    const lanes = offs.map((d, li) => {
      const m = lines[li];
      return carrier.lane(d).tracked({
        top: m.top + amp, bottom: m.bottom + amp, width: m.wMin,
        rotate: P.rotate, smooth: win, spread: SPREAD * size, amount: P.bendSpacing, cap: 4,
      });
    });
    // The wave rides the carrier, so every lane shares its phase and the block moves as one.
    // On a closed path it fits a whole number of waves round the loop.
    const wl = Math.max(1, P.waveLength * size);
    const waveLen = carrier.closed ? carrier.length / Math.max(1, Math.round(carrier.length / wl)) : wl;
    const G = { key, carrier, lanes, waveLen };
    built.set(base, G);
    return G;
  }

  /**
   * The carrier for this frame. With path keyframes, every key shape is rounded once (cached on
   * its sampled path) and the rounded shapes are morphed exactly as the renderer morphs the keys
   * into f.path (TM.Path.sequence), so the carrier deforms smoothly from frame to frame instead
   * of being re-rounded, and cheaply. An in-between shape tighter than the block allows (a
   * cusp forming mid-morph) is rounded itself.
   */
  function carrierFor(f, base, left, right, opts) {
    const L = f.layer, pm = L.pathMorph;
    const keys = pm && pm.enabled && L.path ? TM.Path.morphKeys(pm) : [];
    if (!keys.length) return base.rounded(left, right, opts);
    const shapes = [L.path].concat(keys).map((d) => TM.Path.sample(d, f.W, f.H).rounded(left, right, opts));
    const c = TM.Path.sequence(shapes, pm, f.p);
    if (!c || c.n < 4) return base.rounded(left, right, opts);
    return shapes.includes(c) || !tighter(c, left, right) ? c : c.rounded(left, right, { limit: opts.limit });
  }

  /** Does the curve turn tighter than radius `left` toward −normal or `right` toward +normal? */
  function tighter(c, left, right) {
    const kl = left > 0 ? 1.15 / left : Infinity, kr = right > 0 ? 1.15 / right : Infinity;
    const n = c.n, last = c.closed ? n : n - 1;
    for (let i = 1; i < last; i++) {
      const a = (i - 1 + n) % n, b = (i + 1) % n, ds = (c.cum[i + 1] - c.cum[i - 1]) / 2;
      if (!(ds > 1e-6)) continue;
      const turn = (c.tx[a] * c.ty[b] - c.ty[a] * c.tx[b]) / (2 * ds); // ≈ signed curvature
      if (turn > kr || -turn > kl) return true;
    }
    return false;
  }

  function place(f, G, path, g, s, ch) {
    if (g.isSpace) return;
    const P = f.params, size = f.size;
    let alpha = 1;
    if (!path.closed) {
      // Fade glyphs out as they leave an open path instead of letting them fly off.
      const edge = size * 0.6;
      alpha = smoothstep(-edge, edge * 0.2, s) * (1 - smoothstep(path.length - edge * 0.2, path.length + edge, s));
      if (alpha <= 0.002) return;
    }
    // Tangent averaged over about a glyph, so letters swing round a turn instead of snapping.
    const win = rotWin(P.cornerSmooth) * size;
    const pt = win > 1 ? path.atSmooth(s, win) : path.at(s);
    let off = 0;
    if (P.wave > 0) {
      off = Math.sin(TAU * (path.srcAt(s) / G.waveLen - P.waveSpeed * f.p)) * P.wave * size * 0.5;
    }
    f.drawGlyph(g, {
      x: pt.x + pt.nx * off,
      y: pt.y + pt.ny * off,
      rot: pt.angle * clamp(P.rotate, 0, 1),
      alpha,
      ch: ch || undefined,
      anchor: 'center',
    });
  }

  function drawGuide(f, path, style) {
    const ctx = f.ctx;
    f.identity();
    ctx.save();
    ctx.globalAlpha = f.alpha * 0.55;
    ctx.strokeStyle = f.colorOf({ vi: 0 });
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = Math.max(1, f.size * 0.025);
    ctx.lineCap = 'round';
    if (style === 'dots') {
      const step = f.size * 0.35;
      const shift = (f.p * step * Math.max(1, Math.abs(f.params.speed))) % step;
      for (let s = shift; s <= path.length; s += step) {
        const pt = path.at(s);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, ctx.lineWidth * 1.2, 0, TAU);
        ctx.fill();
      }
    } else {
      if (style === 'dashed') {
        const dash = f.size * 0.18;
        ctx.setLineDash([dash, dash * 0.8]);
        ctx.lineDashOffset = -f.p * dash * 1.8 * Math.max(1, Math.abs(f.params.speed));
      }
      path.trace(ctx);
      ctx.stroke();
    }
    ctx.restore();
  }
})(window.TM);
