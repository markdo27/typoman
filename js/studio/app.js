/* TYPOMAN studio — application shell: boot, stage, render loop, gallery, transport, shortcuts.
 * Optional modules hook in when present:
 *   TM.Studio.PathEditor      new PathEditor(store, svgOverlay, view)       (path team)
 *   TM.Studio.openExport      openExport(store)                              (export team)
 *   TM.Studio.openShare       openShare(store)                               (export team)
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const h = Studio.h;
  const $ = (sel) => document.querySelector(sel);
  const PREVIEW_MAX_PIXELS = 1920 * 1080;

  function starterScene() {
    const scene = TM.Scene.defaults();
    scene.name = 'Type in motion';
    scene.bg = { type: 'solid', color: '#0015ff', color2: '#000000', angle: 90 };
    scene.layers[0].text = 'TYPE IN MOTION';
    scene.layers[0].preset = 'path-flow';
    scene.layers[0].font = { family: 'Anton', weight: 400 };
    scene.layers[0].type.size = 0.15;
    return scene;
  }

  async function initialScene() {
    const hash = location.hash.match(/[#&]c=([^&]+)/);
    if (hash) {
      try { return await TM.Scene.decode(decodeURIComponent(hash[1])); } catch (e) { toast('Could not open that link: ' + e.message, 'error'); }
    }
    return Studio.Store.loadSaved() || starterScene();
  }

  // ───────────────────────────── toasts ─────────────────────────────
  function toast(msg, kind = 'info', ms = 3200) {
    let host = $('#toasts');
    if (!host) { host = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(host); }
    const t = h('div', { class: 'toast ' + kind, role: kind === 'error' ? 'alert' : 'status' }, msg);
    host.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  }
  Studio.toast = toast;

  // ───────────────────────────── stage ─────────────────────────────
  class Stage {
    constructor(store) {
      this.store = store;
      this.wrap = $('#stage');
      this.board = $('#artboard');
      this.canvas = $('#stageCanvas');
      this.overlay = $('#pathOverlay');
      this.renderer = new TM.Renderer(this.canvas, { quality: 'preview' });
      this.renderer.setScene(store.scene);
      this.view = { cssW: 0, cssH: 0, scale: 1 }; // artboard CSS size; scale = css px per output px
      new ResizeObserver(() => this.layout()).observe(this.wrap);
      store.on('change', () => { this.renderer.setScene(store.scene); this.layout(); this.dirty = true; });
      this.layout();
    }

    layout() {
      const { w, h: hh } = this.store.scene.size;
      const r = this.wrap.getBoundingClientRect();
      const pad = r.width < 600 ? 12 : 32;
      const availW = Math.max(40, r.width - pad * 2), availH = Math.max(40, r.height - pad * 2);
      const k = Math.min(availW / w, availH / hh);
      const cssW = Math.floor(w * k), cssH = Math.floor(hh * k);
      if (cssW === this.view.cssW && cssH === this.view.cssH && this._ow === w && this._oh === hh) return;
      this._ow = w;
      this._oh = hh;
      this.board.style.width = cssW + 'px';
      this.board.style.height = cssH + 'px';
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let bw = cssW * dpr, bh = cssH * dpr;
      const px = bw * bh;
      if (px > PREVIEW_MAX_PIXELS) { const s = Math.sqrt(PREVIEW_MAX_PIXELS / px); bw *= s; bh *= s; }
      this.renderer.resize(bw, bh);
      this.overlay.setAttribute('viewBox', `0 0 ${cssW} ${cssH}`);
      this.overlay.setAttribute('width', cssW);
      this.overlay.setAttribute('height', cssH);
      this.view = { cssW, cssH, scale: cssW / w };
      this.dirty = true;
      this.store.emit('view', this.view);
    }

    render(t) {
      this.renderer.render(t);
    }
  }

  // ───────────────────────────── gallery ─────────────────────────────
  class Gallery {
    constructor(store, root) {
      this.store = store;
      this.root = root;
      this.cards = new Map();
      this.thumbCanvas = document.createElement('canvas');
      this.thumb = new TM.Renderer(this.thumbCanvas, { quality: 'preview' });
      this.hover = null;
      this.filter = 'All';
      this.build();
      store.on('change', (d) => {
        this.markActive();
        if (!d || d.reason !== 'preset') this.scheduleThumbs();
      });
      store.on('select', () => this.markActive());
      this.scheduleThumbs(50);
    }

    build() {
      this.root.innerHTML = '';
      const cats = ['All'].concat(TM.CATEGORIES.filter((c) => TM.presetOrder.some((id) => TM.presets[id].category === c)));
      const chips = h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Preset categories' });
      cats.forEach((c) => {
        chips.append(h('button', { type: 'button', role: 'tab', class: 'chip' + (c === this.filter ? ' on' : ''), 'aria-selected': c === this.filter ? 'true' : 'false', onclick: () => { this.filter = c; this.build(); this.scheduleThumbs(0); } }, c));
      });
      const grid = h('div', { class: 'cards' });
      TM.presetOrder.forEach((id) => {
        const p = TM.presets[id];
        if (this.filter !== 'All' && p.category !== this.filter) return;
        const cv = h('canvas', { width: 320, height: 180, 'aria-hidden': 'true' });
        const card = h('button', {
          type: 'button',
          class: 'card',
          title: p.description || p.name,
          'aria-label': p.name + ' preset' + (p.description ? ': ' + p.description : ''),
          onclick: () => this.store.setPreset(id),
          onpointerenter: () => { this.hover = id; },
          onpointerleave: () => { if (this.hover === id) { this.hover = null; this.drawThumb(id); } },
          onfocus: () => { this.hover = id; },
          onblur: () => { if (this.hover === id) { this.hover = null; this.drawThumb(id); } },
        }, cv, h('span', { class: 'card-name' }, p.name), h('span', { class: 'card-cat' }, p.category + (p.usesPath ? ' · path' : '')));
        this.cards.set(id, { card, cv });
        grid.append(card);
      });
      this.root.append(chips, grid);
      this.markActive();
    }

    markActive() {
      const cur = this.store.layer.preset;
      this.cards.forEach(({ card }, id) => {
        card.classList.toggle('on', id === cur);
        card.setAttribute('aria-pressed', id === cur ? 'true' : 'false');
      });
    }

    sceneFor(id) {
      const s = TM.Scene.clone(this.store.scene);
      const layer = s.layers[Math.min(this.store.selected, s.layers.length - 1)];
      s.layers = [layer];
      if (layer.preset !== id) {
        layer.preset = id;
        layer.params = TM.presetDefaults(id);
        const p = TM.presets[id];
        if (p.usesPath && (!layer.path || layer.path.preset)) layer.path = TM.Path.preset(p.path || 'wave', 16 / 9);
      }
      s.size = { w: 320, h: 180 };
      if (layer.path && layer.path.preset) layer.path = TM.Path.preset(layer.path.preset, 16 / 9);
      layer.fx.blur = 0;
      return TM.Scene.normalize(s);
    }

    scheduleThumbs(ms = 350) {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => {
        this.scenes = new Map();
        this.cards.forEach((_, id) => this.drawThumb(id));
      }, ms);
    }

    drawThumb(id, t) {
      const entry = this.cards.get(id);
      if (!entry) return;
      if (!this.scenes) this.scenes = new Map();
      let scene = this.scenes.get(id);
      if (!scene) { scene = this.sceneFor(id); this.scenes.set(id, scene); }
      this.thumb.setScene(scene);
      this.thumb.resize(320, 180);
      this.thumb.render(t != null ? t : scene.duration * 0.42);
      const ctx = entry.cv.getContext('2d');
      ctx.clearRect(0, 0, 320, 180);
      ctx.drawImage(this.thumbCanvas, 0, 0);
    }

    tick(now) {
      if (this.hover && this.cards.has(this.hover)) this.drawThumb(this.hover, (now / 1000) % (this.store.scene.duration || 4));
    }
  }

  // ───────────────────────────── transport ─────────────────────────────
  class Transport {
    constructor(store, app) {
      this.store = store;
      this.app = app;
      this.play = $('#playBtn');
      this.scrub = $('#scrub');
      this.time = $('#timecode');
      this.play.addEventListener('click', () => this.toggle());
      this.scrub.addEventListener('input', () => {
        store.setUI({ playing: false, time: (+this.scrub.value / 1000) * store.scene.duration });
        app.stage.dirty = true;
      });
      $('#stepBack').addEventListener('click', () => this.step(-1));
      $('#stepFwd').addEventListener('click', () => this.step(1));
      store.on('ui', () => this.sync());
      this.sync();
    }

    toggle() {
      this.store.setUI({ playing: !this.store.ui.playing });
    }

    step(n) {
      const s = this.store.scene;
      const frame = Math.round(this.store.ui.time * s.fps) + n;
      this.store.setUI({ playing: false, time: TM.math.mod(frame / s.fps, s.duration) });
      this.app.stage.dirty = true;
    }

    sync() {
      const playing = this.store.ui.playing;
      this.play.classList.toggle('playing', playing);
      this.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      this.play.title = (playing ? 'Pause' : 'Play') + ' (Space)';
    }

    tick() {
      // Throttled DOM writes: the timecode only needs ~15 updates a second.
      const now = performance.now();
      if (now - (this._last || 0) < 66) return;
      this._last = now;
      const s = this.store.scene, t = TM.math.mod(this.store.ui.time, s.duration);
      if (document.activeElement !== this.scrub) this.scrub.value = String(Math.round((t / s.duration) * 1000));
      this.scrub.style.setProperty('--pct', ((t / s.duration) * 100).toFixed(2) + '%');
      const frame = Math.floor(t * s.fps);
      const txt = `${t.toFixed(2)}s · f${String(frame).padStart(3, '0')} / ${Math.round(s.duration * s.fps)}`;
      if (txt !== this._txt) { this.time.textContent = txt; this._txt = txt; }
    }
  }

  // ───────────────────────────── remix ─────────────────────────────
  const REMIX_FONTS = ['Anton', 'Bebas Neue', 'Unbounded', 'Syne', 'Dela Gothic One', 'Rubik Mono One', 'Big Shoulders Display', 'Bricolage Grotesque', 'Fraunces', 'Instrument Serif', 'Archivo Black', 'Climate Crisis', 'Tilt Warp', 'Space Grotesk', 'Inter Tight', 'Bodoni Moda', 'Monoton', 'Six Caps', 'Righteous', 'Major Mono Display'];
  function remix(store) {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const presetId = pick(TM.presetOrder.filter((id) => id !== store.layer.preset));
    store.setPreset(presetId);
    const [, , bg, ...cols] = pick(TM.PALETTES);
    const family = pick(REMIX_FONTS);
    TM.fonts.ensure(family, 700);
    store.update((s, l) => {
      s.bg.type = 'solid';
      s.bg.color = bg;
      s.seed = Math.floor(Math.random() * 9999);
      l.fill.type = Math.random() < 0.25 ? 'palette' : 'solid';
      l.fill.color = cols[0];
      l.fill.color2 = cols[1] || cols[0];
      l.fill.palette = cols.slice();
      l.font.family = family;
      const f = TM.fonts.get(family);
      l.font.weight = f && f.max > f.min ? Math.round(f.min + (f.max - f.min) * (0.55 + Math.random() * 0.45)) : 400;
      l.stroke.mode = Math.random() < 0.12 ? 'outline' : 'none';
      l.fx.echo.count = Math.random() < 0.25 ? 3 + Math.floor(Math.random() * 5) : 0;
      l.fx.echo.palette = Math.random() < 0.5;
      l.fx.glow.amount = Math.random() < 0.15 ? 0.4 : 0;
      l.fx.extrude.depth = Math.random() < 0.15 ? 0.3 + Math.random() * 0.4 : 0;
      l.fx.extrude.color = TM.color.mix(bg, '#000000', 0.3);
      l.fx.blur = Math.random() < 0.2 ? 0.4 : 0;
      s.post.grain = Math.random() < 0.3 ? 0.3 : 0;
    }, { reason: 'remix' });
    toast('Remixed → ' + TM.presets[presetId].name + ' · ' + family);
  }

  // ───────────────────────────── app ─────────────────────────────
  class App {
    constructor(store) {
      this.store = store;
      this.stage = new Stage(store);
      Studio.inspector = this.inspector = new Studio.Inspector(store, $('#inspector'));
      this.gallery = new Gallery(store, $('#gallery'));
      this.transport = new Transport(store, this);
      if (Studio.PathEditor) {
        try { this.pathEditor = new Studio.PathEditor(store, this.stage.overlay, () => this.stage.view); } catch (e) { console.error('[studio] path editor', e); }
      }
      this.wireTopbar();
      this.wireKeys();
      this.wireTabs();
      store.on('ui', (patch) => {
        if ('editPath' in patch) document.body.classList.toggle('editing-path', !!store.ui.editPath);
        if ('guides' in patch) document.body.classList.toggle('show-guides', !!store.ui.guides);
      });
      store.on('history', () => this.syncHistory());
      this.syncHistory();
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
      // Re-render once fonts arrive.
      TM.fonts.onChange(() => { this.stage.dirty = true; this.gallery.scheduleThumbs(200); });
      TM.prepare(store.scene);
    }

    frame(now) {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const ui = this.store.ui;
      if (ui.playing) ui.time = TM.math.mod(ui.time + dt, this.store.scene.duration);
      if (ui.playing || this.stage.dirty) {
        this.stage.render(ui.time);
        this.stage.dirty = false;
      }
      this.transport.tick();
      this.gallery.tick(now);
      requestAnimationFrame((t) => this.frame(t));
    }

    syncHistory() {
      $('#undoBtn').disabled = !this.store.canUndo;
      $('#redoBtn').disabled = !this.store.canRedo;
    }

    wireTopbar() {
      const store = this.store;
      const name = $('#sceneName');
      name.value = store.scene.name;
      name.addEventListener('change', () => store.update((s) => { s.name = name.value; }));
      store.on('change', () => { if (document.activeElement !== name) name.value = store.scene.name; });
      $('#undoBtn').addEventListener('click', () => store.undo());
      $('#redoBtn').addEventListener('click', () => store.redo());
      $('#remixBtn').addEventListener('click', () => remix(store));
      $('#guidesBtn').addEventListener('click', () => store.setUI({ guides: !store.ui.guides }));
      $('#exportBtn').addEventListener('click', () => this.openExport());
      $('#shareBtn').addEventListener('click', () => this.openShare());
    }

    openExport() {
      if (Studio.openExport) return Studio.openExport(this.store);
      // Minimal fallback until the export module is present: save the current frame as PNG.
      const s = this.store.scene;
      const c = document.createElement('canvas');
      const r = new TM.Renderer(c);
      r.setScene(s);
      r.resize(s.size.w, s.size.h);
      TM.prepare(s).then(() => {
        r.render(this.store.ui.time);
        c.toBlob((b) => {
          const a = h('a', { href: URL.createObjectURL(b), download: (s.name || 'typoman') + '.png' });
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        });
      });
    }

    openShare() {
      if (Studio.openShare) return Studio.openShare(this.store);
      TM.Scene.encode(this.store.scene).then((code) => {
        const url = location.href.split('#')[0] + '#c=' + code;
        navigator.clipboard && navigator.clipboard.writeText(url).then(() => toast('Remix link copied'), () => toast(url));
      });
    }

    wireKeys() {
      const store = this.store;
      document.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName) || '';
        const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable);
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.key.toLowerCase() === 'z') {
          if (typing && tag === 'TEXTAREA') return; // let the textarea undo its own typing
          e.preventDefault();
          e.shiftKey ? store.redo() : store.undo();
          return;
        }
        if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); return; }
        if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); this.openExport(); return; }
        if (typing || mod || e.altKey) return;
        switch (e.key) {
          case ' ': e.preventDefault(); this.transport.toggle(); break;
          case 'ArrowLeft': e.preventDefault(); this.transport.step(e.shiftKey ? -10 : -1); break;
          case 'ArrowRight': e.preventDefault(); this.transport.step(e.shiftKey ? 10 : 1); break;
          case 'Home': store.setUI({ time: 0 }); this.stage.dirty = true; break;
          case 'p': case 'P': if (store.preset && store.preset.usesPath) store.setUI({ editPath: !store.ui.editPath }); break;
          case 'g': case 'G': store.setUI({ guides: !store.ui.guides }); break;
          case 'r': case 'R': remix(store); break;
          case 'Escape': if (store.ui.editPath) store.setUI({ editPath: false }); break;
          case '?': toast('Space play · ←/→ frame · P edit path · G guides · R remix · ⌘Z undo · ⌘E export', 'info', 6000); break;
        }
      });
    }

    wireTabs() {
      // Mobile: one panel at a time.
      document.querySelectorAll('[data-tab]').forEach((b) => {
        b.addEventListener('click', () => {
          document.body.dataset.tab = b.dataset.tab;
          document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
        });
      });
    }
  }

  TM_READY.then(async () => {
    const scene = await initialScene();
    const store = new Studio.Store(scene);
    Studio.store = store;
    Studio.app = new App(store);
    document.body.classList.add('ready');
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  });
})(window.TM);
