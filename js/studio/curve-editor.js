/* TYPOMAN studio — easing curve editor.
 *
 *   TM.Studio.openCurveEditor(anchor, { label, get, set(spec, final) })
 *
 * A popover for `ease` params: pick a named curve (each tile shows its shape) or drag the two
 * cubic-bézier handles. Custom curves are stored as [x1, y1, x2, y2] (TM.isEaseSpec accepts it).
 * Handles are focusable sliders: arrow keys nudge them (Shift = ×10). A dot previews the motion.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const h = Studio.h;
  const UI = Studio.ui;

  // Curves the engine defines exactly as cubic-béziers.
  const EXACT = {
    linear: [0, 0, 1, 1], smooth: [0.65, 0, 0.35, 1], snap: [0.85, 0, 0.15, 1], glide: [0.16, 1, 0.3, 1],
    anticipate: [0.6, -0.28, 0.735, 0.045], overshoot: [0.34, 1.56, 0.64, 1],
  };
  // Close bézier stand-ins for the analytic curves: the starting point when you drag a handle.
  const APPROX = Object.assign({
    inSine: [0.12, 0, 0.39, 0], outSine: [0.61, 1, 0.88, 1], inOutSine: [0.37, 0, 0.63, 1],
    inQuad: [0.11, 0, 0.5, 0], outQuad: [0.5, 1, 0.89, 1], inOutQuad: [0.45, 0, 0.55, 1],
    inCubic: [0.32, 0, 0.67, 0], outCubic: [0.33, 1, 0.68, 1], inOutCubic: [0.65, 0, 0.35, 1],
    inQuart: [0.5, 0, 0.75, 0], outQuart: [0.25, 1, 0.5, 1], inOutQuart: [0.76, 0, 0.24, 1],
    inQuint: [0.64, 0, 0.78, 0], outQuint: [0.22, 1, 0.36, 1], inOutQuint: [0.83, 0, 0.17, 1],
    inExpo: [0.7, 0, 0.84, 0], outExpo: [0.16, 1, 0.3, 1], inOutExpo: [0.87, 0, 0.13, 1],
    inCirc: [0.55, 0, 1, 0.45], outCirc: [0, 0.55, 0.45, 1], inOutCirc: [0.85, 0, 0.15, 1],
    inBack: [0.36, 0, 0.66, -0.56], outBack: [0.34, 1.56, 0.64, 1], inOutBack: [0.68, -0.6, 0.32, 1.6],
    spring: [0.3, 1.45, 0.55, 1], springSoft: [0.25, 1.2, 0.4, 1], springSnappy: [0.2, 1.25, 0.3, 1],
    outBounce: [0.3, 1.3, 0.6, 1], inBounce: [0.4, -0.3, 0.7, 0], outElastic: [0.25, 1.6, 0.45, 1], inOutElastic: [0.7, -0.6, 0.3, 1.6],
  }, EXACT);
  const Y_LO = -0.5, Y_HI = 1.5;

  const round3 = (v) => Math.round(v * 1000) / 1000;
  const same = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) < 1e-3);
  /** Bezier points for a spec: { pts, exact } (exact = the curve really is this bézier). */
  function bezierOf(spec) {
    if (Array.isArray(spec)) return { pts: spec.slice(), exact: true };
    if (EXACT[spec]) return { pts: EXACT[spec].slice(), exact: true };
    return { pts: (APPROX[spec] || EXACT.smooth).slice(), exact: false };
  }
  /** Prefer a name when a custom bézier matches a named curve exactly. */
  function canonical(pts) {
    for (const [name, v] of Object.entries(EXACT)) if (same(pts, v)) return name;
    return pts.map(round3);
  }

  function setupCanvas(cv, w, hgt) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(hgt * dpr);
    cv.style.width = w + 'px';
    cv.style.height = hgt + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }
  const css = (name, fb) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;

  Studio.openCurveEditor = function (anchor, o) {
    let spec = o.get();
    let raf = 0;
    const G = { w: 280, h: 196, pad: 14 };
    const box = { x: G.pad, y: 8, w: G.w - G.pad * 2, h: G.h - 16 };
    const X = (t) => box.x + t * box.w;
    const Y = (v) => box.y + ((Y_HI - v) / (Y_HI - Y_LO)) * box.h;
    const invX = (px) => (px - box.x) / box.w;
    const invY = (py) => Y_HI - ((py - box.y) / box.h) * (Y_HI - Y_LO);

    return UI.popover(anchor, {
      title: o.label || 'Easing',
      className: 'curve-pop',
      width: 316,
      onClose() { cancelAnimationFrame(raf); },
      build(body, api) {
        const colors = { accent: css('--accent-fg', '#8c98ff'), line: css('--line-2', '#2d2d34'), text3: css('--text-3', '#8c8c97'), box: 'rgba(255,255,255,0.035)' };
        const graph = h('div', { class: 'ce-graph' });
        const cv = h('canvas', { 'aria-hidden': 'true' });
        const ctx = setupCanvas(cv, G.w, G.h);
        const handles = [0, 1].map((k) => h('button', {
          type: 'button', class: 'ce-handle', role: 'slider', 'aria-label': k ? 'End handle' : 'Start handle',
          'aria-valuemin': '0', 'aria-valuemax': '1', 'data-k': k,
        }));
        graph.append(cv, ...handles);
        const nameEl = h('span', { class: 'ce-name' });
        const fields = ['x1', 'y1', 'x2', 'y2'].map((n, i) => {
          const inp = h('input', { type: 'text', class: 'num', inputmode: 'decimal', 'aria-label': 'Bézier ' + n, spellcheck: 'false', 'data-i': i });
          inp.addEventListener('focus', () => inp.select());
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
          inp.addEventListener('change', () => {
            const v = parseFloat(inp.value);
            if (!Number.isFinite(v)) return sync();
            const pts = bezierOf(spec).pts;
            pts[i] = i % 2 === 0 ? TM.math.clamp(v, 0, 1) : TM.math.clamp(v, Y_LO, Y_HI);
            apply(canonical(pts), true);
          });
          return h('label', { class: 'ce-field' }, h('span', null, n), inp);
        });
        const copyBtn = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Copy as CSS cubic-bezier', 'data-tip': 'Copy CSS cubic-bezier()' }, UI.icon('code'));
        copyBtn.addEventListener('click', () => {
          const p = bezierOf(spec).pts.map(round3);
          const text = `cubic-bezier(${p.join(', ')})`;
          if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => Studio.toast('Copied ' + text), () => Studio.toast(text));
          else Studio.toast(text);
        });

        // Motion preview: the dot eases across the track; a ghost shows linear timing.
        const track = h('div', { class: 'ce-track', 'aria-hidden': 'true' }, h('i', { class: 'ce-ghost' }), h('i', { class: 'ce-dot' }));
        const replay = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Replay motion preview', 'data-tip': 'Replay' }, UI.icon('play'));
        const dot = track.querySelector('.ce-dot'), ghost = track.querySelector('.ce-ghost');
        let t0 = performance.now(), playing = !UI.reducedMotion();
        replay.addEventListener('click', () => { t0 = performance.now(); if (!playing) { playing = true; loop(); } });
        function loop() {
          cancelAnimationFrame(raf);
          const step = (now) => {
            if (api.closed) return;
            const cycle = 1700, run = 1100;
            const e = now - t0;
            if (UI.reducedMotion() && e > cycle) { playing = false; place(1, 1); return; }
            const k = Math.min(1, (e % cycle) / run);
            place(TM.ease(spec)(k), k);
            raf = requestAnimationFrame(step);
          };
          raf = requestAnimationFrame(step);
        }
        function place(v, k) {
          const w = track.clientWidth - 14;
          dot.style.transform = `translateX(${(TM.math.clamp(v, -0.15, 1.15) * w).toFixed(1)}px)`;
          ghost.style.transform = `translateX(${(k * w).toFixed(1)}px)`;
        }

        // Named curves, grouped in tabs.
        const groups = TM.EASING_GROUPS;
        const groupOf = (s) => (typeof s === 'string' ? (groups.find(([, l]) => l.some(([id]) => id === s)) || groups[0])[0] : groups[0][0]);
        let tab = groupOf(spec);
        const tabs = h('div', { class: 'ce-tabs', role: 'tablist', 'aria-label': 'Curve families' });
        const tiles = h('div', { class: 'ce-tiles', role: 'listbox', 'aria-label': 'Named curves' });
        function renderTabs() {
          tabs.replaceChildren(...groups.map(([g]) => {
            const b = h('button', { type: 'button', role: 'tab', class: 'ce-tab' + (g === tab ? ' on' : ''), 'aria-selected': g === tab ? 'true' : 'false', tabindex: g === tab ? '0' : '-1' }, g);
            b.addEventListener('click', () => { tab = g; renderTabs(); renderTiles(); });
            return b;
          }));
        }
        tabs.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          e.stopPropagation();
          const i = groups.findIndex(([g]) => g === tab);
          tab = groups[(i + (e.key === 'ArrowRight' ? 1 : -1) + groups.length) % groups.length][0];
          renderTabs();
          renderTiles();
          tabs.querySelector('.on').focus();
        });
        function renderTiles() {
          const list = (groups.find(([g]) => g === tab) || groups[0])[1];
          tiles.replaceChildren(...list.map(([id, label]) => {
            const tcv = h('canvas', { 'aria-hidden': 'true' });
            const tctx = setupCanvas(tcv, 48, 30);
            Studio.drawEaseCurve(tctx, id, { x: 4, y: 3, w: 40, h: 24 }, { color: id === spec ? '#ffffff' : colors.accent, width: 1.5, samples: 40, lo: -0.35, hi: 1.35, guide: 'rgba(255,255,255,0.08)' });
            const b = h('button', { type: 'button', class: 'ce-tile' + (id === spec ? ' on' : ''), role: 'option', 'aria-selected': id === spec ? 'true' : 'false', 'data-id': id }, tcv, h('span', null, label));
            b.addEventListener('click', () => apply(id, true));
            return b;
          }));
        }

        function draw() {
          const { pts, exact } = bezierOf(spec);
          ctx.clearRect(0, 0, G.w, G.h);
          // Unit box and quarter grid.
          ctx.fillStyle = colors.box;
          ctx.fillRect(X(0), Y(1), box.w, Y(0) - Y(1));
          ctx.strokeStyle = 'rgba(255,255,255,0.06)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 1; i < 4; i++) {
            ctx.moveTo(X(i / 4) + 0.5, Y(1)); ctx.lineTo(X(i / 4) + 0.5, Y(0));
            ctx.moveTo(X(0), Math.round(Y(i / 4)) + 0.5); ctx.lineTo(X(1), Math.round(Y(i / 4)) + 0.5);
          }
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.14)';
          ctx.beginPath();
          ctx.moveTo(X(0), Math.round(Y(0)) + 0.5); ctx.lineTo(X(1), Math.round(Y(0)) + 0.5);
          ctx.moveTo(X(0), Math.round(Y(1)) + 0.5); ctx.lineTo(X(1), Math.round(Y(1)) + 0.5);
          ctx.stroke();
          // Handle arms.
          ctx.setLineDash(exact ? [] : [3, 3]);
          ctx.strokeStyle = exact ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)';
          ctx.beginPath();
          ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(pts[0]), Y(pts[1]));
          ctx.moveTo(X(1), Y(1)); ctx.lineTo(X(pts[2]), Y(pts[3]));
          ctx.stroke();
          ctx.setLineDash([]);
          // The real curve (analytic curves are drawn from their own function).
          Studio.drawEaseCurve(ctx, spec, box, { color: colors.accent, width: 2.25, samples: 120, lo: Y_LO, hi: Y_HI });
          ctx.fillStyle = '#ffffff';
          [[0, 0], [1, 1]].forEach(([a, b]) => { ctx.beginPath(); ctx.arc(X(a), Y(b), 3, 0, Math.PI * 2); ctx.fill(); });
          handles.forEach((el, k) => {
            const hx = pts[k * 2], hy = pts[k * 2 + 1];
            el.style.transform = `translate(${X(hx).toFixed(1)}px, ${Y(hy).toFixed(1)}px)`;
            el.classList.toggle('approx', !exact);
            el.setAttribute('aria-valuenow', String(round3(hx)));
            el.setAttribute('aria-valuetext', `x ${round3(hx).toFixed(2)}, y ${round3(hy).toFixed(2)}`);
          });
        }

        function sync() {
          const { pts, exact } = bezierOf(spec);
          fields.forEach((f, i) => {
            const inp = f.querySelector('input');
            if (document.activeElement !== inp) inp.value = pts[i].toFixed(2);
            inp.classList.toggle('approx', !exact);
          });
          nameEl.textContent = Studio.easeLabel(spec) + (exact ? '' : ' · drag a handle to customise');
          tiles.querySelectorAll('.ce-tile').forEach((b) => {
            const on = b.dataset.id === spec;
            b.classList.toggle('on', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
          });
          draw();
        }

        let tileSpec = typeof spec === 'string' ? spec : null;
        function apply(next, final) {
          spec = next;
          o.set(next, final);
          const nextTile = typeof next === 'string' ? next : null;
          if (nextTile !== tileSpec) { tileSpec = nextTile; renderTiles(); }
          sync();
          if (!playing && !UI.reducedMotion()) { playing = true; t0 = performance.now(); loop(); }
        }

        // Dragging: grab a handle directly, or anywhere in the graph to pull the nearest one.
        function startDrag(e, k, direct) {
          e.preventDefault();
          const rect = cv.getBoundingClientRect();
          const target = handles[k];
          target.focus({ preventScroll: true });
          graph.setPointerCapture(e.pointerId);
          graph.classList.add('dragging');
          const p0 = bezierOf(spec).pts;
          const offX = direct ? X(p0[k * 2]) - (e.clientX - rect.left) : 0;
          const offY = direct ? Y(p0[k * 2 + 1]) - (e.clientY - rect.top) : 0;
          const sx = e.clientX, sy = e.clientY;
          const move = (ev) => {
            const pts = bezierOf(spec).pts;
            const fine = ev.shiftKey ? 0.25 : 1; // Shift: fine control relative to the grab point
            const px = sx + (ev.clientX - sx) * fine, py = sy + (ev.clientY - sy) * fine;
            const nx = invX(px - rect.left + offX), ny = invY(py - rect.top + offY);
            pts[k * 2] = round3(TM.math.clamp(nx, 0, 1));
            pts[k * 2 + 1] = round3(TM.math.clamp(ny, Y_LO, Y_HI));
            apply(canonical(pts), false);
          };
          const up = () => {
            graph.classList.remove('dragging');
            graph.removeEventListener('pointermove', move);
            graph.removeEventListener('pointerup', up);
            graph.removeEventListener('pointercancel', up);
            o.set(spec, true);
          };
          graph.addEventListener('pointermove', move);
          graph.addEventListener('pointerup', up);
          graph.addEventListener('pointercancel', up);
          move(e);
        }
        graph.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          const rect = cv.getBoundingClientRect();
          const px = e.clientX - rect.left, py = e.clientY - rect.top;
          const pts = bezierOf(spec).pts;
          const d = [0, 1].map((k) => Math.hypot(X(pts[k * 2]) - px, Y(pts[k * 2 + 1]) - py));
          const hit = e.target.closest('.ce-handle');
          startDrag(e, hit ? +hit.dataset.k : d[0] <= d[1] ? 0 : 1, !!hit);
        });
        handles.forEach((el, k) => {
          el.addEventListener('keydown', (e) => {
            const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
            if (!dirs[e.key]) return;
            e.preventDefault();
            e.stopPropagation();
            const step = e.shiftKey ? 0.1 : 0.01;
            const pts = bezierOf(spec).pts;
            pts[k * 2] = round3(TM.math.clamp(pts[k * 2] + dirs[e.key][0] * step, 0, 1));
            pts[k * 2 + 1] = round3(TM.math.clamp(pts[k * 2 + 1] + dirs[e.key][1] * step, Y_LO, Y_HI));
            apply(canonical(pts), true);
          });
        });

        renderTabs();
        renderTiles();
        body.append(
          graph,
          h('div', { class: 'ce-row' }, nameEl, copyBtn),
          h('div', { class: 'ce-fields' }, fields),
          h('div', { class: 'ce-preview' }, track, replay),
          tabs,
          tiles,
        );
        sync();
        if (playing) loop(); else place(1, 1);
        const on = tiles.querySelector('.ce-tile.on') || handles[0];
        on.setAttribute('data-initial-focus', '');
      },
    });
  };
})(window.TM);
