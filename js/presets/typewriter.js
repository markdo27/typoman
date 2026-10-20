/* Preset: Typewriter — the text is typed key by key with a caret, held, then backspaced out.
 *
 * Craft notes
 *  - Human rhythm: keystroke intervals vary, with a beat before each word, a longer one after
 *    punctuation and an Enter between lines. Backspacing uses a key's auto-repeat: one press,
 *    the repeat delay, then a steady run.
 *  - The caret stays solid while keys are moving and blinks (whole blinks per loop) when idle.
 *  - Optional live centring re-centres each line as it grows, like typing into a centred field.
 *  - Right-to-left lines (Hebrew, Arabic) type from their right edge leftward. The layout gives
 *    them as whole words, so each word is typed grapheme by grapheme and drawn as its growing
 *    prefix: one shaped run in the word's own cell, so Arabic letters join and change form as
 *    they would in an editor. The caret, live centring and block caret mirror with them.
 *  - All timing lives in loop progress (computed in setup), so frames are a pure function of t.
 *    Typing is sequential by nature, so this preset has no stagger/order controls.
 */
(function (TM) {
  'use strict';
  const { clamp, smoothstep, fract } = TM.math;
  const LEAD = 0.1;    // share of the in-phase the caret idles before the first key
  const TAIL = 0.16;   // share of the out-phase the caret idles after the last deletion
  const IDLE = 0.5;    // seconds after a key before the caret starts blinking
  const PUNCT = /[.,!?;:…)\]]/u;
  const DEG = Math.PI / 180;
  const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u; // the ranges the layout marks line.rtl by

  /** x such that fn(x) = y, for an easing that rises from 0 to 1 (bisection). */
  function invert(fn, y) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 26; i++) {
      const m = (lo + hi) / 2;
      if (fn(m) < y) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

  /** The last grapheme of a cluster (a pause follows punctuation typed at the end of a word). */
  function lastOf(s) {
    const parts = TM.text.graphemes(s);
    return parts[parts.length - 1] || '';
  }

  TM.registerPreset({
    id: 'typewriter',
    name: 'Typewriter',
    category: 'Reveal',
    description: 'Typed key by key with a blinking caret and a human rhythm, then backspaced away.',
    looks: [
      { name: 'Manuscript', bg: { type: 'solid', color: '#f3ecdf' }, post: { grain: 0.28, vignette: 0.25 },
        layer: { font: { family: 'Space Mono', weight: 400 }, type: { case: 'none' }, fill: { type: 'solid', color: '#1d1a16' },
          params: { ink: 0.7, caret: 'underscore', accentCaret: true, caretColor: '#c8361f', punch: 0.25 } } },
      { name: 'Prompt', bg: { type: 'solid', color: '#0b0b0c' },
        layer: { font: { family: 'JetBrains Mono', weight: 500 }, fill: { type: 'solid', color: '#d4ff3a' },
          fx: { glow: { amount: 0.25, color: '#9bd400' } }, params: { caret: 'block', accentCaret: false, rhythm: 0.35 } } },
      { name: 'Editorial', bg: { type: 'solid', color: '#ffffff' },
        layer: { font: { family: 'Instrument Serif', weight: 400 }, type: { case: 'none' }, fill: { type: 'solid', color: '#111111' },
          params: { live: true, caret: 'bar', caretColor: '#ff3d00', erase: 'select' } } },
    ],
    params: [
      ...TM.P.sequence({ inDur: 0.5, outDur: 0.26, easeIn: 'linear', easeOut: 'inQuad' })
        .filter((p) => p.key !== 'stagger' && p.key !== 'order'),
      TM.P.range('rhythm', 'Human rhythm', 0, 1, 0.01, 0.6, { group: 'Typing', hint: 'Uneven keystrokes, pauses between words' }),
      TM.P.range('punch', 'Key punch', 0, 1, 0.01, 0.45, { group: 'Typing' }),
      TM.P.range('ink', 'Type-bar wobble', 0, 1, 0.01, 0, { group: 'Typing', hint: 'Uneven baseline and ink, like a mechanical typewriter' }),
      TM.P.toggle('live', 'Live centring', false, { group: 'Typing', hint: 'Re-centre each line as it grows' }),
      TM.P.select('erase', 'Exit', [['backspace', 'Backspace'], ['select', 'Select + delete']], 'backspace', { group: 'Typing' }),
      TM.P.select('caret', 'Caret', [['bar', 'Bar'], ['block', 'Block'], ['underscore', 'Underscore'], ['none', 'None']], 'bar', { group: 'Caret' }),
      TM.P.range('blinks', 'Blinks per loop', 0, 16, 1, 6, { group: 'Caret', hint: 'Whole blinks keep the loop seamless' }),
      TM.P.toggle('accentCaret', 'Accent caret', true, { group: 'Caret' }),
      TM.P.color('caretColor', 'Caret colour', '#00e5ff', { group: 'Caret', showIf: { accentCaret: true } }),
    ],

    setup(f) {
      const P = f.params, L = f.layout;
      const { inDur, outDur } = TM.MotionKit.windows(P);
      const half = L.tracking / 2;

      // Lines with right-to-left script come laid out as word clusters. Each word there is a
      // run, typed grapheme by grapheme and drawn as its growing prefix, anchored on the side
      // its script starts from: an RTL word grows leftward from its right edge, an LTR word
      // inside such a line rightward from its left edge. pw[j] = advance of the first j graphemes.
      const fam = f.layer.font.family, wt = f.layer.font.weight;
      const runOf = (g) => {
        const parts = TM.text.graphemes(g.ch);
        const pw = [0];
        let s = '';
        for (const c of parts) { s += c; pw.push(TM.text.advance(s, fam, wt, L.sizePx)); }
        return { parts, pw, n: parts.length, dir: RTL.test(g.ch) ? -1 : 1, first: 0 };
      };
      const wordLine = (line) => line.rtl || line.glyphs.some((gi) => {
        const g = L.glyphs[gi];
        return !g.isSpace && (RTL.test(g.ch) || TM.text.graphemes(g.ch).length > 1);
      });

      // Keystrokes in reading order, with an Enter between lines. w = interval before the key.
      const keys = [];
      L.lines.forEach((line, li) => {
        if (li > 0) keys.push({ gi: -1, line: li, w: 1.8 + 1.4 * P.rhythm });
        const words = wordLine(line);
        line.glyphs.forEach((gi, k) => {
          const prev = k > 0 ? L.glyphs[line.glyphs[k - 1]] : null;
          if (!words) {
            let w = 1 + P.rhythm * 0.55 * f.srand(gi, 31);
            if (prev && prev.isSpace) w += P.rhythm * 0.6;
            if (prev && PUNCT.test(prev.ch)) w += P.rhythm * 1.3;
            keys.push({ gi, line: li, w: Math.max(0.25, w) });
            return;
          }
          const g = L.glyphs[gi];
          const run = g.isSpace ? null : runOf(g);
          const parts = run ? run.parts : [g.ch];
          if (run) run.first = keys.length;
          parts.forEach((c, j) => {
            const before = j > 0 ? parts[j - 1] : prev ? lastOf(prev.ch) : '';
            let w = 1 + P.rhythm * 0.55 * f.srand(gi, 31 + 1000 * j);
            if (j === 0 && prev && prev.isSpace) w += P.rhythm * 0.6;
            if (PUNCT.test(before)) w += P.rhythm * 1.3;
            keys.push({ gi, line: li, w: Math.max(0.25, w), run, sub: j + 1 });
          });
        });
      });
      const n = keys.length;

      // Typing times (loop progress). The first key lands at the start of the typing window.
      const eIn = TM.ease(P.easeIn, 'linear');
      const t0 = inDur * LEAD, t1 = inDur;
      const totalW = keys.reduce((s, k, i) => s + (i > 0 ? k.w : 0), 0) || 1;
      let acc = 0;
      keys.forEach((k, i) => {
        if (i > 0) acc += k.w;
        k.tIn = t0 + invert(eIn, acc / totalW) * (t1 - t0);
      });

      // Caret anchors per state (number of keys typed): line + x of the insertion point. On a
      // right-to-left line `dir` is −1 (the next character goes to the left) and `ext` is how
      // much of the line is typed, measured from its right edge.
      const right = (line) => line.x + line.width;
      const startOf = (li) => {
        const line = L.lines[li];
        return line && line.rtl ? { line: li, x: right(line), dir: -1, ext: 0 } : { line: li, x: line ? line.x : 0 };
      };
      const pos = [startOf(0)];
      keys.forEach((k) => {
        if (k.gi < 0) { pos.push(startOf(k.line)); return; }
        const g = L.glyphs[k.gi], line = L.lines[g.line];
        if (!k.run) {
          if (line.rtl) pos.push({ line: g.line, x: g.x - half, dir: -1, ext: right(line) - g.x });
          else pos.push({ line: g.line, x: g.x + g.w + half });
          return;
        }
        const r = k.run, j = k.sub, end = j === r.n ? half : 0;
        const a = r.dir < 0 ? g.x + g.w - r.pw[j] : g.x; // typed ink of this word: [a, b]
        const b = r.dir < 0 ? g.x + g.w : g.x + r.pw[j];
        const ext = line.rtl ? right(line) - a : b - line.x;
        pos.push(r.dir < 0 ? { line: g.line, x: a - end, dir: -1, ext } : { line: g.line, x: b + end, dir: 1, ext });
      });

      // Events: { t, k (state after), from (state before) }.
      const events = keys.map((k, i) => ({ t: k.tIn, k: i + 1, from: i }));
      let select = null;
      if (outDur > 0 && n > 0) {
        const eOut = TM.ease(P.easeOut, 'linear');
        const d0 = 1 - outDur, d1 = 1 - outDur * TAIL;
        if (P.erase === 'select') {
          select = { t0: d0, t1: d0 + (d1 - d0) * 0.45, del: d0 + (d1 - d0) * 0.75, ease: eOut };
          events.push({ t: select.del, k: 0, from: n });
        } else {
          // One press, the auto-repeat delay, then a steady run.
          const w = (j) => (j === 0 ? 0 : j === 1 ? 2.4 : 1);
          let tot = 0;
          for (let j = 0; j < n; j++) tot += w(j);
          let a = 0;
          for (let j = 0; j < n; j++) {
            a += w(j);
            const key = keys[n - 1 - j];
            key.tOut = d0 + invert(eOut, tot ? a / tot : 1) * (d1 - d0);
            events.push({ t: key.tOut, k: n - 1 - j, from: n - j });
          }
        }
      }

      // Live centring: each line's offset for every state.
      const align = f.layer.type.align;
      const af = align === 'right' ? 1 : align === 'left' ? 0 : 0.5; // share of the untyped width a line shifts by
      const offsets = pos.map((ps) => L.lines.map((line, li) => {
        const typed = ps.line > li ? line.width : ps.line === li ? (ps.ext != null ? Math.max(0, ps.ext) : Math.max(0, ps.x - half - line.x)) : 0;
        // A right-to-left line grows leftward: its untyped part is on the left.
        return line.rtl ? -(1 - af) * (line.width - typed) : af * (line.width - typed);
      }));

      // Static per-glyph "type-bar" wobble.
      const wobble = L.glyphs.map((g) => ({
        y: f.srand(g.i, 41) * 0.035 * L.sizePx,
        rot: f.srand(g.i, 43) * 1.8 * DEG,
        a: 1 - 0.28 * f.rand(g.i, 47),
      }));
      return { keys, pos, events, select, offsets, wobble, n, inout: outDur > 0 };
    },

    render(f) {
      const P = f.params, L = f.layout, C = f.cache;
      if (!C) return;
      const p = f.p, dur = f.dur;
      const { keys, pos, events, select, offsets, wobble, n } = C;

      // Current state and the last event (wrapping around the loop when the loop is seamless).
      let k = 0, prev = 0, lastT = -Infinity;
      for (const e of events) {
        if (e.t > p) break;
        k = e.k; prev = e.from; lastT = e.t;
      }
      if (lastT === -Infinity && C.inout && events.length) lastT = events[events.length - 1].t - 1;
      const since = (p - lastT) * dur;

      // Live centring: each line's offset is a smoothed sum of its per-keystroke steps.
      let live = null;
      if (P.live) {
        live = offsets[0].slice();
        const tau = 0.09;
        for (const e of events) {
          if (e.t > p) break;
          const s = smoothstep(0, tau, (p - e.t) * dur);
          const a = offsets[e.k], b = offsets[e.from];
          for (let li = 0; li < live.length; li++) live[li] += (a[li] - b[li]) * s;
        }
      }
      const off = (li) => (live ? live[li] : 0);

      // Selection (exit by select + delete).
      let selFrom = n;
      if (select && p >= select.t0 && p < select.del) {
        const u = clamp((p - select.t0) / (select.t1 - select.t0));
        selFrom = n - Math.round(n * clamp(select.ease(u)));
      }

      // Glyphs.
      const ctx = f.ctx;
      const selected = [];
      const words = new Map(); // word runs: how much of each word is typed, drawn after the loop
      for (let i = 0; i < n; i++) {
        const key = keys[i];
        if (key.gi < 0) continue;
        const g = L.glyphs[key.gi];
        if (g.isSpace || p < key.tIn) continue;
        const del = select ? select.del : key.tOut;
        if (del != null && p >= del) continue;
        const age = (p - key.tIn) * dur;
        const punch = P.punch * Math.exp(-age / 0.05);
        if (key.run) {
          // A word's keys are typed in order and deleted in reverse, so its typed part is a
          // prefix; the last key seen here is the newest. A selection takes whole words.
          let shrink = 1;
          if (!select && key.tOut != null) {
            const left = (key.tOut - p) * dur;
            if (left < 0.04) shrink = 0.55 + 0.45 * (left / 0.04);
          }
          words.set(key.run, { g, j: key.sub, punch, shrink, sel: i >= selFrom });
          continue;
        }
        const wb = wobble[g.i];
        const o = {
          x: f.cx + g.cx + off(g.line),
          y: f.cy + g.cy + wb.y * P.ink,
          rot: wb.rot * P.ink,
          scale: 1 + 0.32 * punch,
          alpha: (1 - (1 - wb.a) * P.ink) * (1 - 0.45 * punch),
        };
        // A backspaced letter shrinks away over its last 40 ms instead of blinking out.
        if (!select && key.tOut != null) {
          const left = (key.tOut - p) * dur;
          if (left < 0.04) o.scale *= 0.55 + 0.45 * (left / 0.04);
        }
        if (i >= selFrom) selected.push([g, o]);
        else f.drawGlyph(g, o);
      }
      words.forEach((st, run) => drawRun(f, run, st, wobble[st.g.i], P.ink, off(st.g.line), selected));

      // Selected run: a highlight bar with the letters knocked out of it.
      if (selected.length) {
        const color = f.colorOf({ vi: 0 });
        const runs = new Map();
        for (const [g] of selected) {
          const r = runs.get(g.line) || { a: Infinity, b: -Infinity };
          r.a = Math.min(r.a, g.x - L.tracking / 2);
          r.b = Math.max(r.b, g.x + g.w + L.tracking / 2);
          runs.set(g.line, r);
        }
        f.identity();
        ctx.fillStyle = color;
        runs.forEach((r, li) => {
          const line = L.lines[li];
          const top = f.cy + line.y - L.capH * 1.16, bot = f.cy + line.y + L.sizePx * 0.12;
          ctx.fillRect(f.cx + r.a + off(li) - L.sizePx * 0.04, top, r.b - r.a + L.sizePx * 0.08, bot - top);
        });
        ctx.globalCompositeOperation = 'destination-out';
        for (const [g, o] of selected) f.drawGlyph(g, o);
        ctx.globalCompositeOperation = 'source-over';
      }

      // Caret.
      if (P.caret === 'none') return;
      let cpos = pos[k], cx = cpos.x;
      if (selFrom < n) {
        // During a selection the caret rides the selection's leading edge (the logical start of
        // the selected text: the right edge of a right-to-left word).
        const key = keys[selFrom].gi >= 0 ? keys[selFrom] : keys[Math.min(n - 1, selFrom + 1)];
        const g = L.glyphs[key.gi];
        const dir = key.run ? key.run.dir : L.lines[g.line].rtl ? -1 : 1;
        cpos = dir < 0 ? { line: g.line, x: g.x + g.w + L.tracking / 2, dir } : { line: g.line, x: g.x - L.tracking / 2 };
        cx = cpos.x;
      } else if (pos[prev] && pos[prev].line === cpos.line) {
        // A short glide between insertion points.
        cx = pos[prev].x + (cpos.x - pos[prev].x) * smoothstep(0, 0.035, since);
      }
      const blink = P.blinks > 0 ? clamp(0.5 + 3 * Math.cos(fract(p * P.blinks) * Math.PI * 2)) : 1;
      const on = since < IDLE || selFrom < n ? 1 : blink;
      if (on <= 0.002) return;
      const nextKey = keys[k];
      const nextG = nextKey && nextKey.gi >= 0 && nextKey.line === cpos.line ? L.glyphs[nextKey.gi] : null;
      const cellW = nextG && !nextG.isSpace ? (nextKey.run ? nextKey.run.pw[nextKey.sub] - nextKey.run.pw[nextKey.sub - 1] : nextG.w) : L.sizePx * 0.5;
      drawCaret(f, P.caret, f.cx + cx + off(cpos.line), L.lines[cpos.line] ? L.lines[cpos.line].y : 0,
        cellW, P.accentCaret ? P.caretColor : f.colorOf({ vi: 0 }), on, cpos.dir || 1);
    },
  });

  /**
   * A word run: its first j graphemes drawn as one shaped string in the word's own layout cell,
   * anchored on the side its script starts from. The newest grapheme's slice of the run takes
   * the key punch (or the backspace shrink); a selected word goes to the knock-out pass whole.
   */
  function drawRun(f, run, st, wb, ink, off, selected) {
    const { g, j } = st;
    const w = run.pw[j];
    const o = {
      x: f.cx + off + (run.dir < 0 ? g.x + g.w - w / 2 : g.x + w / 2),
      y: f.cy + g.cy + wb.y * ink,
      rot: wb.rot * ink * 0.35, // a whole word tilts less than a single type bar
      alpha: 1 - (1 - wb.a) * ink,
    };
    if (j < run.n) o.ch = run.parts.slice(0, j).join('');
    if (st.sel) { selected.push([g, o]); return; }
    const sc = (1 + 0.32 * st.punch) * st.shrink, fa = 1 - 0.45 * st.punch;
    if (Math.abs(sc - 1) < 0.002 && fa > 0.998) { f.drawGlyph(g, o); return; }
    // Split the run where the newest grapheme starts: the older part as is, the new one
    // scaled about its own centre and clipped at the scaled boundary, so no scaled neighbour
    // shows (a punched letter overlaps its neighbour, as a single glyph's punch does).
    const at = (u) => f.cx + off + (run.dir < 0 ? g.x + g.w - u : g.x + u);
    const edge = at(run.pw[j - 1]), mid = at((run.pw[j] + run.pw[j - 1]) / 2);
    if (j > 1) clipSide(f, edge, -run.dir, o.y, () => f.drawGlyph(g, o));
    clipSide(f, mid + (edge - mid) * sc, run.dir, o.y, () => f.drawGlyph(g, Object.assign({}, o, { x: mid + (o.x - mid) * sc, scale: sc, alpha: o.alpha * fa })));
  }

  /** Run fn clipped to one side of the line through (x, yc) that leans with the layer's slant (side +1: the right). */
  function clipSide(f, x, side, yc, fn) {
    const ctx = f.ctx, k = -Math.tan(f.slant), far = side * (f.W + f.H) * 4;
    const x0 = x - k * yc, x1 = x + k * (f.H - yc);
    f.identity();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + far, 0);
    ctx.lineTo(x1 + far, f.H);
    ctx.lineTo(x1, f.H);
    ctx.closePath();
    ctx.clip();
    try { fn(); } finally { ctx.restore(); }
  }

  /** Draw the caret in frame px. x = insertion point, baseY = the line's baseline (layout space), dir −1 = the text grows leftward. */
  function drawCaret(f, style, x, baseY, cellW, color, alpha, dir) {
    const L = f.layout, ctx = f.ctx, size = L.sizePx, capH = L.capH;
    const cy = f.cy + baseY - capH / 2; // cap-height centre: the same pivot glyphs slant around
    f.identity();
    ctx.globalAlpha = f.alpha * alpha;
    ctx.fillStyle = f.colorOverride || color;
    ctx.setTransform(1, 0, -Math.tan(f.slant), 1, x, cy);
    const top = -capH / 2 - capH * 0.14, bottom = capH / 2 + size * 0.1;
    if (style === 'block') {
      ctx.globalAlpha *= 0.85;
      ctx.fillRect(dir < 0 ? -size * 0.01 - cellW : size * 0.01, top, cellW, bottom - top);
    } else if (style === 'underscore') {
      const h = Math.max(1, size * 0.07), w = Math.max(cellW, size * 0.42);
      ctx.fillRect(dir < 0 ? -size * 0.02 - w : size * 0.02, capH / 2 + size * 0.05, w, h);
    } else {
      const w = Math.max(1, size * 0.075);
      ctx.fillRect(dir < 0 ? -size * 0.035 - w : size * 0.035, top, w, bottom - top);
    }
    f.identity();
  }
})(window.TM);
