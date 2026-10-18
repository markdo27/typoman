/* TYPOMAN studio — transport + timeline.
 *
 *   new TM.Studio.Transport(store, app)
 *
 * Play / pause / step, a timecode (SS:FF) and frame counter, and a scrubbable ruler with frame
 * ticks. The playhead moves with a compositor-only transform every frame; text updates are
 * throttled to ~15 Hz and the ruler only redraws when its size, duration or fps change.
 * Looks built on the standard In → Hold → Out timing show their phases as bands under the
 * ruler; drag a band edge to retime it. The track is a slider: ←/→ frame, Shift ×10,
 * PageUp/PageDown one second, Home/End.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const h = Studio.h;
  const UI = Studio.ui;
  const $ = (sel) => document.querySelector(sel);

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
      this.bands = $('#tlBands');
      this.loopLabel = $('#loopLabel');
      this.fpsLabel = $('#fpsLabel');
      this.width = 0;
      this._rulerKey = '';
      this._bandKey = '';
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
      store.on('change', () => { this.drawRuler(); this.renderBands(); this.forceText(); });
      store.on('select', () => this.renderBands());
      this.sync();
      this.renderBands();
    }

    get frames() { const s = this.store.scene; return Math.max(1, Math.round(s.duration * s.fps)); }

    toggle() {
      this.store.setUI({ playing: !this.store.ui.playing });
    }

    setFrame(frame) {
      const s = this.store.scene, n = this.frames;
      const f = TM.math.mod(Math.round(frame), n);
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
        const u = TM.math.clamp((clientX - r.left) / Math.max(1, r.width), 0, 0.99999);
        return Math.floor(u * this.frames + 0.5) % this.frames;
      };
      track.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.tl-edge')) return;
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

    // ── timing bands ──
    renderBands() {
      const l = this.store.layer, p = this.store.preset;
      const P = l.params || {};
      const isSeq = !!p && p.params.some((x) => x.key === 'inDur') && p.params.some((x) => x.key === 'outDur');
      let inDur = 0, outDur = 0;
      if (isSeq) {
        inDur = P.inDur != null ? P.inDur : 0.4;
        outDur = P.timing === 'in' ? 0 : P.outDur != null ? P.outDur : 0.3;
        const total = inDur + outDur;
        if (total > 1) { inDur /= total; outDur /= total; }
      }
      const key = [isSeq, inDur, outDur, P.timing, l.id].join('|');
      if (key === this._bandKey) return;
      this._bandKey = key;
      const seg = (cls, from, to, label) => {
        const el = h('div', { class: 'tl-band ' + cls, style: { left: (from * 100).toFixed(3) + '%', width: ((to - from) * 100).toFixed(3) + '%' } }, h('span', null, label));
        return el;
      };
      if (!isSeq) {
        this.bands.replaceChildren(seg('loop', 0, 1, 'Seamless loop'));
        return;
      }
      const parts = [seg('in', 0, inDur, 'In'), seg('hold', inDur, 1 - outDur, 'Hold')];
      if (outDur > 0) parts.push(seg('out', 1 - outDur, 1, 'Out'));
      const edge = (which, at) => {
        const e = h('div', {
          class: 'tl-edge', role: 'slider', tabindex: '0', style: { left: (at * 100).toFixed(3) + '%' },
          'aria-label': which === 'in' ? 'End of intro' : 'Start of outro',
          'aria-valuemin': '5', 'aria-valuemax': '90', 'aria-valuenow': String(Math.round((which === 'in' ? inDur : outDur) * 100)),
          'aria-valuetext': Math.round((which === 'in' ? inDur : outDur) * 100) + '% of the loop',
          'data-tip': which === 'in' ? 'Drag to retime the intro' : 'Drag to retime the outro',
        });
        this.wireEdge(e, which);
        return e;
      };
      parts.push(edge('in', inDur));
      if (outDur > 0) parts.push(edge('out', 1 - outDur));
      this.bands.replaceChildren(...parts);
    }

    wireEdge(el, which) {
      const store = this.store;
      const set = (u, final) => {
        const P = store.layer.params;
        store.updateLayer((l) => {
          if (which === 'in') {
            const out = P.timing === 'in' ? 0 : P.outDur;
            l.params.inDur = +TM.math.clamp(u, 0.05, Math.min(0.9, 1 - out - 0.02)).toFixed(3);
          } else {
            l.params.outDur = +TM.math.clamp(1 - u, 0.05, Math.min(0.9, 1 - P.inDur - 0.02)).toFixed(3);
          }
        }, { coalesce: 'band-' + which, reason: which === 'in' ? 'params.inDur' : 'params.outDur', label: which === 'in' ? 'Intro length' : 'Outro length' });
        if (final) UI.announce((which === 'in' ? 'Intro ' : 'Outro ') + Math.round((which === 'in' ? store.layer.params.inDur : store.layer.params.outDur) * 100) + '% of the loop');
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        const r = this.track.getBoundingClientRect();
        document.body.classList.add('scrubbing');
        const move = (ev) => set((ev.clientX - r.left) / r.width, false);
        const up = () => {
          document.body.classList.remove('scrubbing');
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
          set(which === 'in' ? store.layer.params.inDur : 1 - store.layer.params.outDur, true);
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
        const P = store.layer.params;
        const at = which === 'in' ? P.inDur : 1 - P.outDur;
        set(at + d * (e.shiftKey ? 5 : 1), true);
        requestAnimationFrame(() => { const again = this.bands.querySelectorAll('.tl-edge')[which === 'in' ? 0 : 1]; if (again) again.focus(); });
      });
    }

    // ── per-frame ──
    place() {
      const s = this.store.scene;
      const u = TM.math.mod(this.store.ui.time, s.duration) / s.duration;
      const w = this.width || this.track.clientWidth;
      this.head.style.transform = `translateX(${(u * w).toFixed(1)}px)`;
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
      const t = TM.math.mod(this.store.ui.time, s.duration);
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
