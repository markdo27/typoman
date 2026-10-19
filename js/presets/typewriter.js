/* Preset: Typewriter — the text is typed key by key with a caret, held, then backspaced out.
 *
 * Craft notes
 *  - Human rhythm: keystroke intervals vary, with a beat before each word, a longer one after
 *    punctuation and an Enter between lines. Backspacing uses a key's auto-repeat: one press,
 *    the repeat delay, then a steady run.
 *  - The caret stays solid while keys are moving and blinks (whole blinks per loop) when idle.
 *  - Optional live centring re-centres each line as it grows, like typing into a centred field.
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

  /** x such that fn(x) = y, for an easing that rises from 0 to 1 (bisection). */
  function invert(fn, y) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 26; i++) {
      const m = (lo + hi) / 2;
      if (fn(m) < y) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
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
      let inDur = P.inDur, outDur = P.timing === 'in' ? 0 : P.outDur;
      const sum = inDur + outDur;
      if (sum > 1) { inDur /= sum; outDur /= sum; }

      // Keystrokes in reading order, with an Enter between lines. w = interval before the key.
      const keys = [];
      L.lines.forEach((line, li) => {
        if (li > 0) keys.push({ gi: -1, line: li, w: 1.8 + 1.4 * P.rhythm });
        line.glyphs.forEach((gi, k) => {
          const prev = k > 0 ? L.glyphs[line.glyphs[k - 1]] : null;
          let w = 1 + P.rhythm * 0.55 * f.srand(gi, 31);
          if (prev && prev.isSpace) w += P.rhythm * 0.6;
          if (prev && PUNCT.test(prev.ch)) w += P.rhythm * 1.3;
          keys.push({ gi, line: li, w: Math.max(0.25, w) });
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

      // Caret anchors per state (number of keys typed): line + x of the insertion point.
      const half = L.tracking / 2;
      const pos = [{ line: 0, x: (L.lines[0] ? L.lines[0].x : 0) }];
      keys.forEach((k) => {
        if (k.gi < 0) pos.push({ line: k.line, x: L.lines[k.line].x });
        else { const g = L.glyphs[k.gi]; pos.push({ line: g.line, x: g.x + g.w + half }); }
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
        const typed = ps.line > li ? line.width : ps.line === li ? Math.max(0, ps.x - half - line.x) : 0;
        return af * (line.width - typed);
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
      for (let i = 0; i < n; i++) {
        const key = keys[i];
        if (key.gi < 0) continue;
        const g = L.glyphs[key.gi];
        if (g.isSpace || p < key.tIn) continue;
        const del = select ? select.del : key.tOut;
        if (del != null && p >= del) continue;
        const age = (p - key.tIn) * dur;
        const punch = P.punch * Math.exp(-age / 0.05);
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
        // During a selection the caret rides the selection's leading edge.
        const g = L.glyphs[keys[selFrom].gi >= 0 ? keys[selFrom].gi : keys[Math.min(n - 1, selFrom + 1)].gi];
        cpos = { line: g.line, x: g.x - L.tracking / 2 };
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
      drawCaret(f, P.caret, f.cx + cx + off(cpos.line), L.lines[cpos.line] ? L.lines[cpos.line].y : 0,
        nextG && !nextG.isSpace ? nextG.w : L.sizePx * 0.5, P.accentCaret ? P.caretColor : f.colorOf({ vi: 0 }), on);
    },
  });

  /** Draw the caret in frame px. x = insertion point, baseY = the line's baseline (layout space). */
  function drawCaret(f, style, x, baseY, cellW, color, alpha) {
    const L = f.layout, ctx = f.ctx, size = L.sizePx, capH = L.capH;
    const cy = f.cy + baseY - capH / 2; // cap-height centre: the same pivot glyphs slant around
    f.identity();
    ctx.globalAlpha = f.alpha * alpha;
    ctx.fillStyle = f.colorOverride || color;
    ctx.setTransform(1, 0, -Math.tan(f.slant), 1, x, cy);
    const top = -capH / 2 - capH * 0.14, bottom = capH / 2 + size * 0.1;
    if (style === 'block') {
      ctx.globalAlpha *= 0.85;
      ctx.fillRect(size * 0.01, top, cellW, bottom - top);
    } else if (style === 'underscore') {
      const h = Math.max(1, size * 0.07);
      ctx.fillRect(size * 0.02, capH / 2 + size * 0.05, Math.max(cellW, size * 0.42), h);
    } else {
      const w = Math.max(1, size * 0.075);
      ctx.fillRect(size * 0.035, top, w, bottom - top);
    }
    f.identity();
  }
})(window.TM);
