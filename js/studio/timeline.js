/* TYPOMAN studio — transport, timeline and per-layer timing lanes.
 *
 *   new TM.Studio.Transport(store, app)
 *
 * Transport: play / pause / step, timecode (SS:FF) + frame counter, and a scrubbable ruler with
 * frame ticks. The playhead moves with a compositor-only transform every frame; text updates
 * are throttled to ~15 Hz and the ruler only redraws when its size, duration or fps change.
 *
 * Lanes: one row per layer (front-most on top, like the Layers panel) showing when the layer
 * plays inside the scene loop, using layer.time = { delay, cycles, mode }:
 *   loop  → passes of length duration / cycles repeat, the first one starting at `delay`
 *   once  → one pass from `delay`, then the layer holds its last frame until the scene loops
 * Drag a lane to set its start (snaps to frames, to 0, to the playhead and to other layers'
 * starts and ends); ←/→ nudge a frame (Shift ×10). Looks with In → Hold → Out timing show their
 * phases inside each pass; on the selected lane the phase edges can be dragged to retime.
 * Every edit goes through the store, so all of it is undoable.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const h = Studio.h;
  const UI = Studio.ui;
  const $ = (sel) => document.querySelector(sel);
  const { clamp, mod } = TM.math;
  const MAGNET_PX = 6;

  /** In / Out fractions of one pass for looks built on TM.P.sequence(), or null. */
  function phases(layer) {
    const p = TM.getPreset(layer.preset);
    if (!p || !p.params.some((x) => x.key === 'inDur') || !p.params.some((x) => x.key === 'outDur')) return null;
    const P = layer.params || {};
    let inDur = P.inDur != null ? P.inDur : 0.4;
    let outDur = P.timing === 'in' ? 0 : P.outDur != null ? P.outDur : 0.3;
    const total = inDur + outDur;
    if (total > 1) { inDur /= total; outDur /= total; }
    return { inDur, outDur };
  }

  /**
   * The pieces of one layer's lane inside a scene loop of D seconds: wait, pass segments (with
   * In / Hold / Out bands for In → Hold → Out looks), the hatched hold of a play-once layer and
   * the start marker. Positioned in % of the loop, so any bar can host them (the timeline lanes,
   * the phone's Layers → Timing chart).
   */
  Studio.laneParts = function (layer, D) {
    const { delay, cycles, mode: m } = layer.time;
    const pass = D / cycles;
    const ph = phases(layer);
    const pct = (t) => (clamp(t / D, 0, 1) * 100).toFixed(3) + '%';
    const seg = (from, to, cls, first) => {
      const a = Math.max(0, from), b = Math.min(D, to);
      if (b - a <= 1e-6) return null;
      const el = h('div', { class: 'tl-pass' + (cls ? ' ' + cls : '') + (first ? ' first' : ''), style: { left: pct(a), width: (((b - a) / D) * 100).toFixed(3) + '%' } });
      if (ph) {
        // Phase bands are laid out against the whole pass, then clipped by the segment.
        const off = ((a - from) / (b - a)) * 100, scale = ((to - from) / (b - a)) * 100;
        const band = (cls2, u0, u1) => h('i', { class: 'tl-ph ' + cls2, style: { left: (u0 * scale - off).toFixed(3) + '%', width: ((u1 - u0) * scale).toFixed(3) + '%' } });
        el.append(band('in', 0, ph.inDur), band('hold', ph.inDur, 1 - ph.outDur));
        if (ph.outDur > 0) el.append(band('out', 1 - ph.outDur, 1));
      }
      return el;
    };
    const parts = [];
    if (m === 'once') {
      if (delay > 0) parts.push(h('div', { class: 'tl-wait', style: { left: '0%', width: pct(delay) } }));
      parts.push(seg(delay, delay + pass, '', true));
      if (delay + pass < D) parts.push(h('div', { class: 'tl-hold', style: { left: pct(delay + pass), width: (((D - delay - pass) / D) * 100).toFixed(3) + '%' } }, h('span', null, 'hold')));
    } else {
      const start = mod(delay, pass);
      for (let k = -1; k <= cycles; k++) parts.push(seg(start + k * pass, start + (k + 1) * pass, '', Math.abs(start + k * pass - mod(delay, D)) < 1e-6));
    }
    parts.push(h('i', { class: 'tl-start', style: { left: pct(m === 'once' ? delay : mod(delay, D)) } }));
    return parts.filter(Boolean);
  };

  /** Short human summary of a layer's timing, e.g. "starts 0.8s · ×2 · once". */
  Studio.timingNote = function (layer, short) {
    const t = layer.time || {};
    const parts = [];
    if (t.delay > 0) parts.push((short ? '+' : 'starts ') + (+t.delay.toFixed(2)) + 's');
    if (t.cycles > 1) parts.push('×' + t.cycles);
    if (t.mode === 'once') parts.push(short ? 'once' : 'plays once');
    return parts.join(' · ');
  };

  class Transport {
    constructor(store, app) {
      this.store = store;
      this.app = app;
      this.play = $('#playBtn');
      this.track = $('#scrub');
      this.time = $('#timecode');
      this.frameNo = $('#frameNo');
      this.ruler = this.track.querySelector('.tl-ruler');
      this.head = this.track.querySelector('.tl-playhead');
      this.played = this.track.querySelector('.tl-played');
      this.lanesEl = $('#tlLanes');
      this.loopLabel = $('#loopLabel');
      this.fpsLabel = $('#fpsLabel');
      this.width = 0;
      this._rulerKey = '';
      this._laneKey = '';
      this.drag = null;
      this.play.addEventListener('click', () => this.toggle());
      $('#stepBack').addEventListener('click', () => this.step(-1));
      $('#stepFwd').addEventListener('click', () => this.step(1));
      const loop = $('#loopBtn');
      if (loop) loop.addEventListener('click', () => {
        if (Studio.app) Studio.app.showTab('edit');
        if (Studio.inspector) Studio.inspector.reveal('motion', '.ctl-duration .num');
      });
      this.wireScrub();
      new ResizeObserver(() => { this.width = this.track.clientWidth; this.drawRuler(true); this.place(); }).observe(this.track);
      store.on('ui', (p) => { if ('playing' in p) this.sync(); if ('time' in p) this.forceText(); });
      store.on('change', () => { this.drawRuler(); this.renderLanes(); this.forceText(); });
      store.on('select', () => this.renderLanes(true));
      TM.fonts.onChange(() => this.renderLanes(true));
      // The UI fonts load without blocking boot: redraw the ruler's labels once they arrive.
      if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => this.drawRuler(true));
      this.sync();
      this.renderLanes(true);
    }

    get frames() { const s = this.store.scene; return Math.max(1, Math.round(s.duration * s.fps)); }

    toggle() {
      this.store.setUI({ playing: !this.store.ui.playing });
    }

    setFrame(frame) {
      const s = this.store.scene, n = this.frames;
      const f = mod(Math.round(frame), n);
      this.store.setUI({ playing: false, time: f / s.fps });
      this.app.stage.dirty = true;
    }

    step(n) {
      const s = this.store.scene;
      this.setFrame(Math.round(this.store.ui.time * s.fps) + n);
    }

    sync() {
      const playing = this.store.ui.playing;
      this.play.classList.toggle('playing', playing);
      this.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      this.play.setAttribute('data-tip', playing ? 'Pause' : 'Play');
      document.body.classList.toggle('is-playing', playing);
    }

    // ── scrubbing ──
    wireScrub() {
      const track = this.track;
      const toFrame = (clientX) => {
        const r = track.getBoundingClientRect();
        const u = clamp((clientX - r.left) / Math.max(1, r.width), 0, 0.99999);
        return Math.floor(u * this.frames + 0.5) % this.frames;
      };
      track.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        track.focus({ preventScroll: true });
        track.setPointerCapture(e.pointerId);
        track.classList.add('scrubbing');
        document.body.classList.add('scrubbing');
        this.setFrame(toFrame(e.clientX));
        const move = (ev) => this.setFrame(toFrame(ev.clientX));
        const up = () => {
          track.classList.remove('scrubbing');
          document.body.classList.remove('scrubbing');
          track.removeEventListener('pointermove', move);
          track.removeEventListener('pointerup', up);
          track.removeEventListener('pointercancel', up);
        };
        track.addEventListener('pointermove', move);
        track.addEventListener('pointerup', up);
        track.addEventListener('pointercancel', up);
      });
      track.addEventListener('keydown', (e) => {
        const fps = this.store.scene.fps;
        const cur = Math.round(this.store.ui.time * fps);
        const map = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1, PageDown: -fps, PageUp: fps };
        if (e.key in map) {
          e.preventDefault();
          e.stopPropagation();
          this.setFrame(cur + map[e.key] * (e.shiftKey && Math.abs(map[e.key]) === 1 ? 10 : 1));
        } else if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          e.stopPropagation();
          this.setFrame(e.key === 'Home' ? 0 : this.frames - 1);
        }
      });
    }

    // ── ruler ──
    drawRuler(force) {
      const s = this.store.scene;
      const w = this.width || this.track.clientWidth;
      const hgt = this.ruler.clientHeight || 22;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const key = [w, hgt, s.duration, s.fps, dpr].join('|');
      if (!force && key === this._rulerKey) return;
      this._rulerKey = key;
      if (!w) return;
      this.ruler.width = Math.round(w * dpr);
      this.ruler.height = Math.round(hgt * dpr);
      const ctx = this.ruler.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, hgt);
      const frames = this.frames, ppf = w / frames;
      const css = getComputedStyle(document.documentElement);
      const c3 = css.getPropertyValue('--text-3').trim() || '#8c8c97';
      const lineC = css.getPropertyValue('--line-3').trim() || '#3a3a42';
      // Minor ticks: the smallest frame step that keeps ticks ≥ 4 px apart.
      const minor = [1, 2, 5, 10, 15, 30, 60, 120].find((k) => k * ppf >= 4) || 240;
      ctx.fillStyle = lineC;
      for (let f = 0; f <= frames; f += minor) ctx.fillRect(Math.round(f * ppf), hgt - 5, 1, 5);
      // Seconds: taller ticks, labelled when there is room.
      const pps = ppf * s.fps;
      const every = [1, 2, 5, 10, 15, 30].find((k) => k * pps >= 34) || 60;
      ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'top';
      for (let sec = 0; sec <= s.duration + 1e-6; sec += 0.5) {
        const x = Math.round(sec * pps);
        const whole = Math.abs(sec - Math.round(sec)) < 1e-6;
        ctx.fillStyle = lineC;
        if (!whole) { if (pps >= 30) ctx.fillRect(x, hgt - 8, 1, 8); continue; }
        ctx.fillStyle = c3;
        ctx.fillRect(Math.min(x, w - 1), hgt - 11, 1, 11);
        if (Math.round(sec) % every === 0 && x < w - 18) ctx.fillText(Math.round(sec) + 's', x + 4, 3);
      }
      this.fpsLabel.textContent = s.fps + ' fps';
      this.loopLabel.textContent = (+s.duration.toFixed(2)) + 's';
      this.track.setAttribute('aria-valuemax', String(frames - 1));
    }

    // ───────────────────────────── lanes ─────────────────────────────
    /** Structure changes (layers, selection, preset, cycles, mode, names) rebuild rows; delay moves only re-lay bars. */
    renderLanes(force) {
      if (!this.lanesEl) return;
      const s = this.store.scene;
      const key = [this.store.selected, s.layers.map((l) => [l.id, l.name, l.text, l.visible, l.preset, l.font.family, l.font.weight, l.time.cycles, l.time.mode].join('\u0001')).join('\u0002')].join('|');
      if (this.drag || (!force && key === this._laneKey)) { this.layoutLanes(); return; }
      this._laneKey = key;
      const n = s.layers.length;
      const rows = [];
      for (let r = 0; r < n; r++) rows.push(this.laneRow(n - 1 - r));
      this.vhead = h('div', { class: 'tl-vhead', 'aria-hidden': 'true' });
      this.lanesEl.replaceChildren(...rows, this.vhead);
      this.layoutLanes();
      this.place();
    }

    laneRow(i) {
      const store = this.store, layer = store.scene.layers[i];
      const sel = i === store.selected;
      const name = Studio.layerName(layer);
      const chip = Studio.layerChip(layer, 'sm');
      const label = h('button', { type: 'button', class: 'tl-lane-label', 'data-tip': name, onclick: () => store.select(i) }, chip, h('span', null, name));
      const bar = h('div', { class: 'tl-lane-bar' });
      const lane = h('div', {
        class: 'tl-lane', role: 'slider', tabindex: '0', 'data-i': i,
        'aria-label': 'Start time of ' + name, 'aria-valuemin': '0', 'aria-valuemax': String(store.scene.duration),
        'data-tip': 'Drag to change when this layer starts · ←/→ nudge a frame',
      }, bar);
      this.wireLane(lane, i);
      const cycles = h('select', { class: 'tl-cycles', 'aria-label': 'Cycles per loop for ' + name, 'data-tip': 'Whole passes per scene loop' },
        [1, 2, 3, 4, 5, 6, 7, 8].map((c) => h('option', { value: c }, '×' + c)));
      cycles.value = String(layer.time.cycles);
      cycles.addEventListener('change', () => store.update((sc) => { sc.layers[i].time.cycles = +cycles.value; }, { reason: 'time.cycles', label: 'Cycles ×' + cycles.value }));
      const once = layer.time.mode === 'once';
      const mode = h('button', {
        type: 'button', class: 'icon-btn sm tl-mode', 'aria-pressed': once ? 'true' : 'false', 'aria-label': 'Play once and hold for ' + name,
        'data-tip': once ? 'Plays once, then holds · click to loop' : 'Loops · click to play once and hold',
      }, UI.icon(once ? 'holdOnce' : 'reset'));
      mode.addEventListener('click', () => store.update((sc) => { sc.layers[i].time.mode = once ? 'loop' : 'once'; }, { reason: 'time.mode', label: once ? 'Loop layer' : 'Play once & hold' }));
      const row = h('div', { class: 'tl-lane-row' + (sel ? ' on' : '') + (layer.visible === false ? ' hidden-layer' : ''), 'data-i': i },
        label, lane, h('div', { class: 'tl-lane-ctl' }, cycles, mode));
      return row;
    }

    /** Position pass segments, holds, the start marker and phase edges for every lane. */
    layoutLanes() {
      if (!this.lanesEl) return;
      const s = this.store.scene, D = s.duration;
      this.lanesEl.querySelectorAll('.tl-lane').forEach((lane) => {
        const i = +lane.dataset.i;
        const layer = s.layers[i];
        if (!layer) return;
        const { delay, cycles, mode: m } = layer.time;
        const pass = D / cycles;
        const ph = phases(layer);
        const sel = i === this.store.selected;
        const pct = (t) => (clamp(t / D, 0, 1) * 100).toFixed(3) + '%';
        const parts = Studio.laneParts(layer, D);
        if (sel && ph) {
          const base = m === 'once' ? delay : mod(delay, D);
          const edge = (which, at) => {
            const t = base + at * pass;
            if (m === 'once' && t > D) return null;
            const e = h('div', {
              class: 'tl-edge', role: 'slider', tabindex: '0', style: { left: pct(m === 'once' ? t : mod(t, D)) }, 'data-which': which,
              'aria-label': which === 'in' ? 'End of intro' : 'Start of outro', 'aria-valuemin': '5', 'aria-valuemax': '90',
              'aria-valuenow': String(Math.round((which === 'in' ? ph.inDur : ph.outDur) * 100)),
              'data-tip': which === 'in' ? 'Drag to retime the intro' : 'Drag to retime the outro',
            });
            this.wireEdge(e, i, which);
            return e;
          };
          parts.push(edge('in', ph.inDur));
          if (ph.outDur > 0) parts.push(edge('out', 1 - ph.outDur));
        }
        lane.firstChild.replaceChildren(...parts.filter(Boolean));
        lane.setAttribute('aria-valuenow', String(+delay.toFixed(3)));
        lane.setAttribute('aria-valuetext', 'Starts at ' + delay.toFixed(2) + ' seconds' + (cycles > 1 ? ', ' + cycles + ' cycles' : '') + (m === 'once' ? ', plays once then holds' : ', loops'));
      });
    }

    /** Snap a start time (s): frames, then magnets (0, playhead, other layers' starts and ends). */
    snapStart(i, t, pxPerSec) {
      const s = this.store.scene, D = s.duration;
      const cands = [0, this.store.ui.time];
      s.layers.forEach((l, j) => {
        if (j === i) return;
        const pass = D / l.time.cycles;
        cands.push(l.time.delay);
        if (l.time.mode === 'once') cands.push(l.time.delay + pass);
        const ph = phases(l);
        if (ph) cands.push(l.time.delay + ph.inDur * pass, l.time.delay + (1 - ph.outDur) * pass);
      });
      let best = null, bestD = MAGNET_PX / pxPerSec;
      cands.forEach((c) => { const d = Math.abs(c - t); if (c >= 0 && c < D && d < bestD) { best = c; bestD = d; } });
      if (best != null) return { t: best, snapped: true };
      return { t: Math.round(t * s.fps) / s.fps, snapped: false };
    }

    setDelay(i, t, coalesce) {
      const s = this.store.scene, D = s.duration, layer = s.layers[i];
      if (!layer) return;
      const v = layer.time.mode === 'once' ? clamp(t, 0, D - 1 / s.fps) : mod(t, D);
      this.store.update((sc) => { sc.layers[i].time.delay = +v.toFixed(4); }, { coalesce: coalesce || 'lane-' + layer.id, reason: 'time.delay', label: 'Layer start' });
    }

    wireLane(lane, i) {
      lane.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.tl-edge')) return;
        e.preventDefault();
        if (i !== this.store.selected) this.store.select(i);
        const row = this.lanesEl.querySelector(`.tl-lane[data-i="${i}"]`) || lane;
        row.focus({ preventScroll: true });
        row.setPointerCapture(e.pointerId);
        const startX = e.clientX, start = this.store.scene.layers[i].time.delay;
        const width = Math.max(1, row.clientWidth), D = this.store.scene.duration;
        this.drag = { i, moved: false };
        row.classList.add('dragging');
        document.body.classList.add('scrubbing');
        const move = (ev) => {
          const dx = ev.clientX - startX;
          if (!this.drag.moved && Math.abs(dx) < 3) return;
          this.drag.moved = true;
          const r = this.snapStart(i, start + (dx / width) * D, width / D);
          row.classList.toggle('snapped', r.snapped);
          this.setDelay(i, r.t);
        };
        const up = () => {
          row.removeEventListener('pointermove', move);
          row.removeEventListener('pointerup', up);
          row.removeEventListener('pointercancel', up);
          row.classList.remove('dragging', 'snapped');
          document.body.classList.remove('scrubbing');
          const moved = this.drag && this.drag.moved;
          this.drag = null;
          if (moved) UI.announce(Studio.layerName(this.store.scene.layers[i]) + ' starts at ' + this.store.scene.layers[i].time.delay.toFixed(2) + ' seconds');
          this.renderLanes(true);
        };
        row.addEventListener('pointermove', move);
        row.addEventListener('pointerup', up);
        row.addEventListener('pointercancel', up);
      });
      lane.addEventListener('keydown', (e) => {
        const fps = this.store.scene.fps;
        const layer = this.store.scene.layers[i];
        if (!layer) return;
        let next = null;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') next = layer.time.delay + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1) / fps;
        else if (e.key === 'Home') next = 0;
        else return;
        e.preventDefault();
        e.stopPropagation();
        if (i !== this.store.selected) this.store.select(i);
        this.setDelay(i, Math.max(0, next), 'lane-key-' + layer.id);
        requestAnimationFrame(() => { const el = this.lanesEl.querySelector(`.tl-lane[data-i="${i}"]`); if (el) el.focus({ preventScroll: true }); });
      });
    }

    /** Retime the selected layer's In / Out phases from its first pass on the lane. */
    wireEdge(el, i, which) {
      const store = this.store;
      const set = (u, final) => {
        const P = store.scene.layers[i].params;
        store.update((sc) => {
          const l = sc.layers[i];
          if (which === 'in') {
            const out = P.timing === 'in' ? 0 : P.outDur;
            l.params.inDur = +clamp(u, 0.05, Math.min(0.9, 1 - out - 0.02)).toFixed(3);
          } else {
            l.params.outDur = +clamp(1 - u, 0.05, Math.min(0.9, 1 - P.inDur - 0.02)).toFixed(3);
          }
        }, { coalesce: 'band-' + which, reason: which === 'in' ? 'params.inDur' : 'params.outDur', label: which === 'in' ? 'Intro length' : 'Outro length' });
        if (final) UI.announce((which === 'in' ? 'Intro ' : 'Outro ') + Math.round((which === 'in' ? store.scene.layers[i].params.inDur : store.scene.layers[i].params.outDur) * 100) + '% of a pass');
      };
      /** Fraction of the layer's first pass under scene time t. */
      const fracAt = (t) => {
        const l = store.scene.layers[i], D = store.scene.duration, pass = D / l.time.cycles;
        const rel = l.time.mode === 'once' ? t - l.time.delay : mod(t - l.time.delay, D);
        return rel / pass;
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const lane = el.closest('.tl-lane');
        const r = lane.getBoundingClientRect();
        el.setPointerCapture(e.pointerId);
        this.drag = { i, edge: which };
        document.body.classList.add('scrubbing');
        const move = (ev) => set(fracAt(((ev.clientX - r.left) / r.width) * store.scene.duration), false);
        const up = () => {
          document.body.classList.remove('scrubbing');
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
          this.drag = null;
          const P = store.scene.layers[i].params;
          set(which === 'in' ? P.inDur : 1 - P.outDur, true);
          this.renderLanes(true);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      });
      el.addEventListener('keydown', (e) => {
        const d = { ArrowLeft: -0.01, ArrowRight: 0.01 }[e.key];
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        const P = store.scene.layers[i].params;
        set((which === 'in' ? P.inDur : 1 - P.outDur) + d * (e.shiftKey ? 5 : 1), true);
        requestAnimationFrame(() => { const again = this.lanesEl.querySelector(`.tl-edge[data-which="${which}"]`); if (again) again.focus(); });
      });
    }

    // ── per-frame ──
    place() {
      const s = this.store.scene;
      const u = mod(this.store.ui.time, s.duration) / s.duration;
      const w = this.width || this.track.clientWidth;
      const tx = `translateX(${(u * w).toFixed(1)}px)`;
      this.head.style.transform = tx;
      if (this.vhead) this.vhead.style.transform = tx;
      this.played.style.transform = `scaleX(${u.toFixed(4)})`;
    }

    forceText() { this._last = 0; }

    tick() {
      this.place();
      // Throttled text: ~15 updates a second is plenty for a timecode.
      const now = performance.now();
      if (now - (this._last || 0) < 66) return;
      this._last = now;
      const s = this.store.scene;
      const t = mod(this.store.ui.time, s.duration);
      const frame = Math.min(this.frames - 1, Math.floor(t * s.fps + 1e-6));
      const tc = UI.timecode(t, s.fps);
      if (tc !== this._tc) { this.time.textContent = tc; this._tc = tc; }
      const fr = 'f ' + String(frame).padStart(3, '0') + ' / ' + this.frames;
      if (fr !== this._fr) {
        this.frameNo.textContent = fr;
        this._fr = fr;
        this.track.setAttribute('aria-valuenow', String(frame));
        this.track.setAttribute('aria-valuetext', 'Frame ' + frame + ' of ' + this.frames + ', ' + t.toFixed(2) + ' seconds');
      }
    }
  }

  Studio.Transport = Transport;
})(window.TM);
