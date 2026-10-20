/* TYPOMAN — <typoman-player>: embed kinetic type on any page.
 *
 *   <script src="https://markdo27.github.io/typoman/player.js" async></script>
 *   <typoman-player scene="z…" autoplay loop controls></typoman-player>
 *
 * Attributes: scene (string from TM.Scene.encode, or scene JSON), autoplay, loop, controls,
 *   bg ("transparent" or a hex colour), fit ("contain" | "cover"), start (s), poster (s), label.
 * Properties/methods: scene (object), play(), pause(), toggle(), currentTime, duration, paused.
 * Events: ready, play, pause, ended, error.
 *
 * The script finds its own URL and loads js/boot.js (engine + presets) from the same folder
 * once, however many players the page has. Pages that already run the engine (the studio, the
 * standalone export) are reused. Each player renders into its own shadow-DOM canvas, sized by a
 * ResizeObserver, pauses while offscreen or in a hidden tab, and honours prefers-reduced-motion
 * by showing a still with a play button. Scenes are sanitised by TM.Scene.normalize().
 *
 * Without `loop` the player plays once and stops on its last frame, like a hero should: no
 * overlay. With `controls`, its corner button turns into Replay (clicking the stage replays too).
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.customElements || window.customElements.get('typoman-player')) return;

  const me = document.currentScript;
  const BASE = (function () {
    try { if (me && me.src) return new URL('./', me.src).href; } catch (e) { /* inline copy */ }
    if (window.TM_MANIFEST && window.TM_MANIFEST.base) return window.TM_MANIFEST.base;
    // blob:, data: and about:srcdoc pages (an inlined standalone copy) have no folder to resolve
    // against; they already carry the engine, so the base is never used to load it.
    try { return new URL('./', location.href).href; } catch (e) { return './'; }
  })();
  const MAX_PIXELS = 1920 * 1080;
  const SVG = 'http://www.w3.org/2000/svg';
  // Longest wait for fonts before the first frame: after it the player draws with fallback
  // faces, and each font that arrives later re-renders it (TM.fonts.onChange, below).
  const FONT_WAIT_MS = 3000;

  // ───────────────────────────── engine (loaded once) ─────────────────────────────
  let engine = null;
  function loadEngine() {
    if (engine) return engine;
    if (window.TM_READY) engine = Promise.resolve(window.TM_READY);
    else if (window.TM && window.TM.Renderer && window.TM.Scene) engine = Promise.resolve(window.TM);
    else {
      engine = new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = BASE + 'js/boot.js';
        s.setAttribute('data-groups', 'engine,presets');
        s.onload = function () {
          if (window.TM_READY) window.TM_READY.then(resolve, reject);
          else reject(new Error('The TYPOMAN engine did not start.'));
        };
        s.onerror = function () { reject(new Error('Could not load the TYPOMAN engine from ' + BASE)); };
        document.head.appendChild(s);
      });
    }
    engine.then(function (TM) {
      if (TM && TM.fonts && !loadEngine.hooked) {
        loadEngine.hooked = true;
        TM.fonts.onChange(function () { live.forEach(function (p) { p._invalidate(); }); });
      }
    }, function () {});
    return engine;
  }

  // ───────────────────────────── shared loop & observers ─────────────────────────────
  const live = new Set();
  let raf = 0;
  function frame(now) {
    raf = 0;
    let again = false;
    live.forEach(function (p) { if (p._tick(now)) again = true; });
    if (again) kick();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  const reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function onEnvironment() { live.forEach(function (p) { p._sync(); }); }
  if (reduceMQ) {
    if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onEnvironment);
    else if (reduceMQ.addListener) reduceMQ.addListener(onEnvironment);
  }
  document.addEventListener('visibilitychange', onEnvironment);
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entries) { entries.forEach(function (e) { e.target._setVisible(e.isIntersecting); }); }, { rootMargin: '48px' })
    : null;
  const ro = 'ResizeObserver' in window
    ? new ResizeObserver(function (entries) { entries.forEach(function (e) { e.target._layout(); }); })
    : null;

  // ───────────────────────────── DOM helpers (no innerHTML) ─────────────────────────────
  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (k) { n.append(k); });
    return n;
  }
  function icon(d) {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    s.append(p);
    return s;
  }
  const PLAY = 'M8 5.2v13.6L19 12z';
  const PAUSE = 'M7 5h3.6v14H7zM13.4 5H17v14h-3.6z';
  const REPLAY = 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4'; // drawn as a line (class "line")

  const CSS = [
    ':host{display:block;position:relative;overflow:hidden;contain:content;aspect-ratio:16/9;-webkit-tap-highlight-color:transparent;font:13px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    ':host([hidden]){display:none}',
    '.stage{position:absolute;inset:0}',
    'canvas{position:absolute;display:block;left:0;top:0;width:100%;height:100%}',
    '.btn{appearance:none;-webkit-appearance:none;border:0;margin:0;padding:0;cursor:pointer;color:#fff;background:rgba(12,12,16,.64);display:grid;place-items:center;border-radius:999px;box-shadow:0 4px 18px rgba(0,0,0,.3)}',
    '.btn svg{width:46%;height:46%;fill:currentColor}',
    '.btn svg.line{fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}',
    '.btn:hover{background:rgba(12,12,16,.82)}',
    '.btn:focus-visible{outline:2px solid #5b72ff;outline-offset:2px}',
    '.big{position:absolute;left:50%;top:50%;width:clamp(40px,13%,72px);height:clamp(40px,13%,72px);transform:translate(-50%,-50%)}',
    '.mini{position:absolute;left:10px;bottom:10px;width:34px;height:34px;opacity:0;transition:opacity .2s}',
    ':host(:hover) .mini,.mini:focus-visible,.mini.paused{opacity:1}',
    '.err{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:16px;background:#111115;color:#ededf2}',
    '.err strong{display:block;font-size:15px;margin-bottom:4px}',
    '.err span{color:#a6a6b2;font-size:12.5px}',
    '[hidden]{display:none!important}',
    '@media (prefers-reduced-motion:reduce){.mini{transition:none}}',
  ].join('');

  function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

  // ───────────────────────────── element ─────────────────────────────
  class TypomanPlayer extends HTMLElement {
    static get observedAttributes() { return ['scene', 'autoplay', 'loop', 'controls', 'bg', 'fit', 'start', 'poster', 'label']; }

    constructor() {
      super();
      this._token = 0;
      this._ready = false;
      this._playing = false;
      this._started = false;
      this._ended = false;
      this._userPlayed = false;
      this._autoDone = false;
      this._visible = !io;
      this._time = 0;
      this._last = 0;
      this._dirty = false;
      this._slow = 0;
      this._sceneObj = null;
      this._base = null;
      this._scene = null;
      this._renderer = null;
    }

    _build() {
      if (this._root) return;
      const root = this.attachShadow({ mode: 'open' });
      this._root = root;
      this._style = el('style');
      this._style.textContent = CSS;
      this._dyn = el('style');
      this._canvas = el('canvas', { part: 'canvas', role: 'img', 'aria-label': 'Animated typography' });
      this._wrap = el('div', { class: 'stage', part: 'stage' }, [this._canvas]);
      this._big = el('button', { class: 'btn big', part: 'play-button', type: 'button', 'aria-label': 'Play animation', hidden: '' }, [icon(PLAY)]);
      this._miniIcon = icon(PAUSE);
      this._mini = el('button', { class: 'btn mini', part: 'controls', type: 'button', 'aria-label': 'Pause animation', hidden: '' }, [this._miniIcon]);
      this._errTitle = el('strong');
      this._errText = el('span');
      this._err = el('div', { class: 'err', role: 'alert', part: 'error', hidden: '' }, [el('div', {}, [this._errTitle, this._errText])]);
      root.append(this._style, this._dyn, this._wrap, this._big, this._mini, this._err);
      this._big.addEventListener('click', (e) => { e.stopPropagation(); this.play(); });
      this._mini.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
      this._wrap.addEventListener('click', () => {
        if (!this._ready) return;
        const controls = this.hasAttribute('controls');
        if (this._ended && !controls) return; // a play-once hero holds its last frame
        if (!this._playing) this.play();
        else if (controls) this.pause();
      });
    }

    connectedCallback() {
      this._build();
      live.add(this);
      if (io) io.observe(this);
      if (ro) ro.observe(this);
      if (!this._ready && !this._loading) this._load();
      this._layout();
      this._sync();
    }

    disconnectedCallback() {
      live.delete(this);
      if (io) io.unobserve(this);
      if (ro) ro.unobserve(this);
    }

    attributeChangedCallback(name, oldV, newV) {
      if (!this._root || oldV === newV) return;
      switch (name) {
        case 'scene': this._sceneObj = null; this._load(); break;
        case 'bg': if (this._base) { this._apply(); this._invalidate(); } break;
        case 'fit': this._layout(); this._invalidate(); break;
        case 'autoplay': if (!this._userPlayed) { this._autoDone = false; if (newV === null) { this._playing = false; } } this._sync(); break;
        case 'start': if (!this._started) { this._time = Math.max(0, num(newV, 0)); this._invalidate(); } break;
        case 'label': this._label(); break;
        default: this._sync(); this._invalidate();
      }
    }

    // ── public API ──
    get scene() { return this._base && window.TM ? window.TM.Scene.clone(this._base) : null; }
    set scene(v) {
      if (typeof v === 'string') { this.setAttribute('scene', v); return; }
      this._sceneObj = v;
      if (this._root) this._load();
    }
    get duration() { return this._scene ? this._scene.duration : NaN; }
    get paused() { return !this._playing; }
    get currentTime() { return this._time; }
    set currentTime(t) {
      this._time = Math.max(0, num(t, 0));
      this._started = true;
      this._ended = false;
      this._sync(); // e.g. a seek after the end: the buttons leave their "ended" state
      this._invalidate();
    }
    play() {
      if (!this._ready) { this._wantPlay = true; return; }
      if (this._ended) { this._time = Math.max(0, num(this.getAttribute('start'), 0)); this._ended = false; }
      this._userPlayed = true;
      this._started = true;
      if (!this._playing) { this._playing = true; this._emit('play'); }
      this._sync();
    }
    pause() {
      this._userPlayed = true;
      if (this._playing) { this._playing = false; this._emit('pause'); }
      this._sync();
      this._invalidate();
    }
    toggle() { if (this._playing) this.pause(); else this.play(); }
    /** Show a friendly error instead of the animation. */
    showError(title, detail) {
      this._build();
      this._ready = false;
      this._playing = false;
      this._errTitle.textContent = title || "This animation couldn't be loaded";
      this._errText.textContent = detail || '';
      this._err.hidden = false;
      this._wrap.hidden = true;
      this._sync();
      this.dispatchEvent(new CustomEvent('error', { detail: { message: title, detail } }));
    }

    // ── loading ──
    async _load() {
      const token = ++this._token;
      this._loading = true;
      this._ready = false;
      const src = (this.getAttribute('scene') || '').trim();
      const obj = this._sceneObj;
      let TM;
      try {
        TM = await loadEngine();
      } catch (e) {
        if (token === this._token) { this._loading = false; this.showError("The player couldn't start", e.message); }
        return;
      }
      if (token !== this._token) return;
      if (!src && !obj) {
        // A scene often arrives right after upgrade (via the property); only then is it missing.
        await new Promise(function (r) { setTimeout(r, 60); });
        if (token !== this._token) return;
      }
      let scene;
      try {
        if (obj) scene = TM.Scene.normalize(obj);
        else if (!src) throw new Error('empty');
        else if (src[0] === '{') scene = TM.Scene.normalize(JSON.parse(src));
        else scene = await TM.Scene.decode(src.replace(/^#?c=/, ''));
      } catch (e) {
        if (token !== this._token) return;
        this._loading = false;
        if (!src && !obj) this.showError('No animation here yet', 'Make one in TYPOMAN, then copy the embed code.');
        else this.showError("This animation couldn't be loaded", 'The embed code or link looks incomplete or damaged. Copy it again from TYPOMAN.');
        return;
      }
      if (token !== this._token) return;
      this._base = scene;
      this._apply();
      // A hung or slow font host must not leave a blank box: wait at most FONT_WAIT_MS, and let
      // a preset's extra instances (Stack's width ladder) load in the background instead of
      // holding back frame 0. The race guards engines whose prepare() ignores the options.
      await Promise.race([
        TM.prepare(this._scene, { timeout: FONT_WAIT_MS, extras: 'background' }),
        new Promise(function (r) { setTimeout(r, FONT_WAIT_MS + 500); }),
      ]);
      if (token !== this._token) return;
      this._loading = false;
      this._err.hidden = true;
      this._wrap.hidden = false;
      this._ready = true;
      this._announced = false;
      this._started = false;
      this._ended = false;
      this._autoDone = false;
      this._time = Math.max(0, num(this.getAttribute('start'), 0));
      this._layout();
      if (this._wantPlay) { this._wantPlay = false; this.play(); }
      this._sync();
      this._invalidate();
    }

    /** Apply attribute overrides (background) to the loaded scene. */
    _apply() {
      const TM = window.TM;
      const s = TM.Scene.clone(this._base);
      let bg = (this.getAttribute('bg') || '').trim();
      if (/^[0-9a-f]{6}$/i.test(bg)) bg = '#' + bg;
      if (bg === 'transparent') s.bg.type = 'transparent';
      else if (TM.color.isHex(bg)) s.bg = { type: 'solid', color: bg.toLowerCase(), color2: s.bg.color2, angle: s.bg.angle };
      this._scene = TM.Scene.normalize(s);
      if (!this._renderer) this._renderer = new TM.Renderer(this._canvas, { quality: 'full' });
      this._renderer.setScene(this._scene);
      const b = this._scene.bg;
      const letterbox = b.type === 'transparent' ? 'transparent' : b.type === 'solid' ? b.color : b.type === 'radial' ? b.color2 : TM.color.mix(b.color, b.color2, 0.5);
      this._dyn.textContent = ':host{aspect-ratio:' + this._scene.size.w + '/' + this._scene.size.h + ';background:' + letterbox + '}';
      this._label();
      this._layout();
    }

    _label() {
      if (!this._canvas) return;
      const custom = this.getAttribute('label');
      const text = this._scene ? this._scene.layers.filter(function (l) { return l.visible !== false; }).map(function (l) { return l.text.replace(/\s+/g, ' ').trim(); }).filter(Boolean).join(' / ') : '';
      this._canvas.setAttribute('aria-label', custom || (text ? text + ' (animated type)' : 'Animated typography'));
    }

    // ── layout & rendering ──
    _layout() {
      if (!this._scene || !this._renderer || !this._root) return;
      const cw = this.clientWidth;
      const sw = this._scene.size.w, sh = this._scene.size.h;
      if (!(cw > 0)) return;
      const ch = this.clientHeight > 0 ? this.clientHeight : (cw * sh) / sw;
      const cover = this.getAttribute('fit') === 'cover';
      const k = cover ? Math.max(cw / sw, ch / sh) : Math.min(cw / sw, ch / sh);
      const w = sw * k, h = sh * k;
      const st = this._canvas.style;
      st.width = w + 'px';
      st.height = h + 'px';
      st.left = (cw - w) / 2 + 'px';
      st.top = (ch - h) / 2 + 'px';
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let bw = w * dpr;
      if (bw * ((bw * sh) / sw) > MAX_PIXELS) bw = Math.sqrt((MAX_PIXELS * sw) / sh);
      bw = Math.max(2, Math.round(bw));
      const bh = Math.max(2, Math.round((bw * sh) / sw));
      if (this._renderer.width !== bw || this._renderer.height !== bh) {
        this._renderer.resize(bw, bh);
        this._invalidate();
      }
    }

    _invalidate() { this._dirty = true; kick(); }
    _setVisible(v) { this._visible = v; if (v) kick(); }

    _posterTime() {
      const p = this.getAttribute('poster');
      if (p != null && p !== '') return Math.max(0, num(p, 0));
      const s = this.getAttribute('start');
      if (s != null && s !== '') return Math.max(0, num(s, 0));
      return this._scene.duration * 0.42;
    }

    _tick(now) {
      if (!this._ready || !this._scene) return false;
      const active = this._playing && this._visible && !document.hidden;
      if (active) {
        if (this._last) {
          const dur = this._scene.duration;
          this._time += Math.min(0.25, Math.max(0, (now - this._last) / 1000));
          if (this.hasAttribute('loop')) {
            if (this._time >= dur) this._time %= dur;
          } else if (this._time >= dur) {
            this._time = dur;
            this._playing = false;
            this._ended = true;
            this._emit('ended');
            this._sync();
          }
        }
        this._last = now;
        this._dirty = true;
      } else this._last = 0;
      if (this._dirty) this._draw();
      return active;
    }

    _draw() {
      this._dirty = false;
      const s = this._scene;
      let t = this._time;
      if (!this._started) t = this._posterTime();
      else if (this._ended || (!this.hasAttribute('loop') && t >= s.duration)) t = Math.max(0, s.duration - 1 / s.fps);
      const t0 = performance.now();
      this._renderer.render(t);
      const ms = performance.now() - t0;
      // Heavy motion blur / extrusion on a slow device: drop to the studio's preview sampling.
      if (this._playing && this._renderer.quality === 'full') {
        this._slow = ms > 24 ? this._slow + 1 : Math.max(0, this._slow - 1);
        if (this._slow > 20) this._renderer.quality = 'preview';
      }
      if (!this._announced) {
        this._announced = true;
        this.dispatchEvent(new CustomEvent('ready', { detail: { duration: s.duration, width: s.size.w, height: s.size.h } }));
      }
    }

    _sync() {
      if (!this._root) return;
      const reduced = !!(reduceMQ && reduceMQ.matches);
      if (this._ready) {
        if (!this._autoDone) {
          this._autoDone = true;
          if (this.hasAttribute('autoplay') && !reduced && !this._userPlayed) {
            this._playing = true;
            this._started = true;
          }
        }
        // Reduced motion: never animate unless the viewer asked for it.
        if (reduced && this._playing && !this._userPlayed) this._playing = false;
      }
      const controls = this.hasAttribute('controls');
      // The big button invites a first play (no autoplay, reduced motion) or a resume. A
      // play-once scene that has ended just holds its last frame: no overlay on the headline.
      this._big.hidden = !this._ready || this._playing || this._ended;
      this._mini.hidden = !this._ready || !controls;
      const state = this._playing ? 'pause' : this._ended ? 'replay' : 'play';
      if (this._miniState !== state) {
        this._miniState = state;
        this._mini.setAttribute('aria-label', state === 'pause' ? 'Pause animation' : state === 'replay' ? 'Replay animation' : 'Play animation');
        this._miniIcon.firstChild.setAttribute('d', state === 'pause' ? PAUSE : state === 'replay' ? REPLAY : PLAY);
        this._miniIcon.classList.toggle('line', state === 'replay');
      }
      this._wrap.classList.toggle('paused', !this._playing);
      this._mini.classList.toggle('paused', !this._playing);
      this._wrap.style.cursor = this._ready && (controls || (!this._playing && !this._ended)) ? 'pointer' : '';
      kick();
    }

    _emit(type) { this.dispatchEvent(new Event(type)); }
  }

  TypomanPlayer.base = BASE;
  window.TypomanPlayer = TypomanPlayer;
  window.customElements.define('typoman-player', TypomanPlayer);
})();
