/* TYPOMAN studio — application shell: boot, render loop, top bar, shortcuts, tabs, files.
 * Optional modules hook in when present:
 *   TM.Studio.PathEditor      new PathEditor(store, svgOverlay, view)       (path team)
 *   TM.Studio.openExport      openExport(store)                              (export team)
 *   TM.Studio.openShare       openShare(store)                               (export team)
 * Studio modules used here: Stage (stage.js), Inspector, Gallery, LayersPanel, Transport,
 * customFonts, brand, onboarding — each documented in its own file.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const h = Studio.h;
  const UI = Studio.ui;
  const $ = (sel) => document.querySelector(sel);
  const REMIX_KEY = 'typoman.remixLocks';

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

  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

  async function initialScene() {
    // Custom fonts must be registered before a saved scene is normalised, or it falls back to Anton.
    if (Studio.customFonts) { try { await withTimeout(Studio.customFonts.restore(), 2500); } catch (e) { /* ignore */ } }
    const hash = location.hash.match(/[#&]c=([^&]+)/);
    if (hash) {
      try { return await TM.Scene.decode(decodeURIComponent(hash[1])); } catch (e) { toast('Could not open that link: ' + e.message, 'error', 6000); }
    }
    const saved = Studio.Store.loadSaved();
    if (saved && Array.isArray(saved.layers)) {
      const missing = [...new Set(saved.layers.map((l) => l && l.font && l.font.family).filter((f) => typeof f === 'string' && !TM.fonts.has(f)))];
      if (missing.length) setTimeout(() => toast(missing.join(', ') + ' isn’t available in this browser, so Anton is used instead.', 'error', 7000), 600);
    }
    return saved || starterScene();
  }

  // ───────────────────────────── toasts ─────────────────────────────
  /** toast(message, kind = 'info' | 'error' | 'ok', ms, action?: { label, run }) */
  function toast(msg, kind = 'info', ms = 3200, action) {
    let host = $('#toasts');
    if (!host) { host = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(host); }
    const icon = kind === 'error' ? 'warning' : kind === 'ok' ? 'check' : 'info';
    const t = h('div', { class: 'toast ' + kind, role: kind === 'error' ? 'alert' : 'status' }, UI.icon(icon, 'toast-ic'), h('span', { class: 'toast-msg' }, msg));
    let timer = 0;
    const dismiss = () => { clearTimeout(timer); t.classList.add('out'); setTimeout(() => t.remove(), 260); };
    if (action) t.append(h('button', { type: 'button', class: 'toast-act', onclick: () => { dismiss(); action.run(); } }, action.label));
    host.append(t);
    while (host.children.length > 3) host.firstChild.remove();
    timer = setTimeout(dismiss, ms);
    t.addEventListener('pointerenter', () => clearTimeout(timer));
    t.addEventListener('pointerleave', () => { timer = setTimeout(dismiss, 1600); });
    return dismiss;
  }
  Studio.toast = toast;

  // ───────────────────────────── remix ─────────────────────────────
  const REMIX_FONTS = ['Anton', 'Bebas Neue', 'Unbounded', 'Syne', 'Dela Gothic One', 'Rubik Mono One', 'Big Shoulders Display', 'Bricolage Grotesque', 'Fraunces', 'Instrument Serif', 'Archivo Black', 'Climate Crisis', 'Tilt Warp', 'Space Grotesk', 'Inter Tight', 'Bodoni Moda', 'Monoton', 'Six Caps', 'Righteous', 'Major Mono Display', 'Roboto Flex', 'Science Gothic', 'Anybody'];
  function remixLocks() {
    const l = UI.storage.get(REMIX_KEY, null) || {};
    return { look: !!l.look, font: !!l.font, colors: !!l.colors };
  }
  const NICE_EASES = ['glide', 'smooth', 'snap', 'overshoot', 'anticipate', 'spring', 'springSoft', 'outBack', 'outExpo', 'outQuart', 'inOutCubic'];
  /** A motion param near its default: often the default, otherwise a draw biased toward it. */
  function remixParam(p) {
    const r = Math.random;
    switch (p.type) {
      case 'range': {
        if (r() < 0.4) return p.default;
        const span = p.max - p.min;
        let v = TM.math.clamp(p.default + (r() < 0.5 ? -1 : 1) * Math.pow(r(), 1.8) * 0.55 * span, p.min, p.max);
        if (p.step) v = Math.round((v - p.min) / p.step) * p.step + p.min; // whole cycles stay whole
        return +v.toFixed(4);
      }
      case 'select': return r() < 0.6 ? p.default : p.options[Math.floor(r() * p.options.length)][0];
      case 'toggle': return r() < 0.75 ? p.default : !p.default;
      case 'ease': return r() < 0.55 ? p.default : NICE_EASES[Math.floor(r() * NICE_EASES.length)];
      default: return p.default; // colour params follow the palette
    }
  }

  /**
   * Remix: one undoable step. Picks a preset (unless locked), then either starts from one of its
   * curated looks (sometimes) or rolls palette, font, effects, motion params biased to their
   * defaults and — for path presets with an untouched shape — a new path. Locks are respected.
   */
  function remix(store) {
    const locks = remixLocks();
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const others = TM.presetOrder.filter((id) => id !== store.layer.preset);
    const presetId = locks.look || !others.length ? store.layer.preset : pick(others);
    const def = TM.presets[presetId];
    const curated = Studio.looks ? Studio.looks.of(presetId) : [];
    const look = curated.length && Math.random() < 0.35 ? pick(curated) : null;
    const [, , bg, ...cols] = pick(TM.PALETTES);
    const family = locks.font ? store.layer.font.family : pick(REMIX_FONTS.filter((f) => TM.fonts.has(f)));
    TM.fonts.ensure(family, 700);
    const aspect = store.scene.size.w / store.scene.size.h;
    const sel = store.selected;
    store.update((s) => {
      let l = s.layers[sel];
      s.seed = Math.floor(Math.random() * 9999);
      if (l.preset !== presetId) {
        l.preset = presetId;
        l.params = TM.presetDefaults(presetId);
        if (def.usesPath && (!l.path || l.path.preset)) l.path = TM.Path.preset(def.path || 'wave', aspect);
      }
      if (look) {
        const keep = { font: { ...l.font }, fill: JSON.parse(JSON.stringify(l.fill)), stroke: { ...l.stroke }, bg: { ...s.bg } };
        const next = TM.Scene.applyLook(s, sel, Object.assign({}, look, { preset: presetId }));
        Object.keys(s).forEach((k) => { delete s[k]; });
        Object.assign(s, next);
        l = s.layers[sel];
        if (locks.font) l.font = keep.font;
        if (locks.colors) { l.fill = keep.fill; l.stroke = keep.stroke; s.bg = keep.bg; }
        return; // a curated look keeps its designer-tuned motion
      }
      def.params.forEach((p) => { if (p.type !== 'color') l.params[p.key] = remixParam(p); });
      if (def.usesPath && (!l.path || l.path.preset) && Math.random() < 0.7) {
        const shapes = TM.Path.PRESETS.map((x) => x.id).filter((id) => !l.path || id !== l.path.preset);
        l.path = TM.Path.preset(pick(shapes), aspect);
      }
      if (!locks.colors) {
        s.bg.type = 'solid';
        s.bg.color = bg;
        l.fill.type = Math.random() < 0.25 ? 'palette' : 'solid';
        l.fill.color = cols[0];
        l.fill.color2 = cols[1] || cols[0];
        l.fill.palette = cols.slice();
        l.fx.extrude.color = TM.color.mix(bg, '#000000', 0.3);
      }
      if (!locks.font) {
        l.font.family = family;
        const f = TM.fonts.get(family);
        l.font.weight = f && f.max > f.min ? Math.round(f.min + (f.max - f.min) * (0.55 + Math.random() * 0.45)) : 400;
        // Width-axis families roll a width too, biased away from the extremes.
        const ax = TM.fonts.axes(family);
        l.font.width = ax && ax.wdth && Math.random() < 0.6 ? Math.round(ax.wdth[0] + (ax.wdth[1] - ax.wdth[0]) * (0.15 + Math.random() * 0.7)) : 100;
        l.font.opsz = 'auto';
      }
      l.stroke.mode = Math.random() < 0.12 ? 'outline' : 'none';
      l.fx.echo.count = Math.random() < 0.25 ? 3 + Math.floor(Math.random() * 5) : 0;
      l.fx.echo.palette = Math.random() < 0.5;
      l.fx.glow.amount = Math.random() < 0.15 ? 0.4 : 0;
      l.fx.extrude.depth = Math.random() < 0.15 ? 0.3 + Math.random() * 0.4 : 0;
      l.fx.blur = Math.random() < 0.2 ? 0.4 : 0;
      s.post.grain = Math.random() < 0.3 ? 0.3 : 0;
    }, { reason: 'remix', label: look ? 'Remix: ' + look.name : 'Remix' });
    if (look) TM.prepare(store.scene);
    const kept = Object.entries(locks).filter(([, v]) => v).map(([k]) => ({ look: 'preset', font: 'font', colors: 'colours' })[k]);
    const what = look ? '“' + look.name + '” (' + def.name + ')' : def.name + ' · ' + Studio.fontLabel(store.layer.font.family);
    toast('Remixed: ' + what + (kept.length ? ' · kept ' + kept.join(', ') : ''), 'info', 3200, { label: 'Undo', run: () => store.undo() });
    const btn = $('#remixBtn');
    if (btn && !UI.reducedMotion()) { btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin'); }
  }

  // ───────────────────────────── project files ─────────────────────────────
  function download(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const fileName = (s, ext) => ((s.name || 'typoman').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'typoman') + ext;

  // ───────────────────────────── app ─────────────────────────────
  class App {
    constructor(store) {
      this.store = store;
      Studio.app = this;
      this.stage = new Studio.Stage(store);
      Studio.inspector = this.inspector = new Studio.Inspector(store, $('#inspector'));
      this.gallery = new Studio.Gallery(store, $('#gallery'));
      this.layers = new Studio.LayersPanel(store, $('#layersPanel'));
      this.transport = new Studio.Transport(store, this);
      if (Studio.PathEditor) {
        try { this.pathEditor = new Studio.PathEditor(store, this.stage.overlay, () => this.stage.view); } catch (e) { console.error('[studio] path editor', e); }
      }
      this.wireTopbar();
      this.wireStagebar();
      this.wireKeys();
      this.wireTabs();
      this.wireDrop();
      store.on('ui', (patch) => {
        if ('editPath' in patch) document.body.classList.toggle('editing-path', !!store.ui.editPath);
        if ('guides' in patch) document.body.classList.toggle('show-guides', !!store.ui.guides);
        if ('clean' in patch) this.onClean();
        if ('editPath' in patch || 'guides' in patch) this.syncStagebar();
        if ('playing' in patch && store.ui.playing) this.stage.dirty = true;
      });
      store.on('change', () => this.syncStagebar());
      store.on('select', () => this.syncStagebar());
      store.on('history', () => this.syncHistory());
      store.on('save', (s) => this.syncSave(s));
      this.syncHistory();
      this.syncStagebar();
      this.syncSave(store.saveState);

      // Fonts: hold the canvas until the scene's fonts are ready (or 3 s), then fade it in.
      this.stage.setLoading(true);
      this.setHint('Loading fonts…', 'loading');
      withTimeout(TM.prepare(store.scene), 3000).then(() => { this.stage.setLoading(false); this.setHint(''); this.stage.dirty = true; });
      TM.fonts.onChange(() => { this.stage.dirty = true; this.gallery.scheduleThumbs(200); this.stage.refreshSelection(); });
      this.warnedFonts = new Set();
      store.on('change', (d) => { if (d && (d.reason === 'font' || d.reason === 'replace' || d.reason === 'remix' || d.reason === 'brand')) this.checkFonts(); });

      // Render loop; paused while the tab is hidden.
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = 0; store.save(); }
        else if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.frame(t)); }
      });
      window.addEventListener('pagehide', () => store.save());
      if (Studio.onboarding) Studio.onboarding.maybeStart();
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
      this.raf = requestAnimationFrame((t) => this.frame(t));
    }

    checkFonts() {
      this.store.scene.layers.forEach((l) => {
        const fam = l.font.family;
        const f = TM.fonts.get(fam);
        if (!f || f.custom || this.warnedFonts.has(fam)) return;
        TM.fonts.ensure(fam, l.font.weight).then((ok) => {
          if (ok || this.warnedFonts.has(fam)) return;
          this.warnedFonts.add(fam);
          toast('Couldn’t load ' + fam + '. Check your connection; a fallback font is showing for now.', 'error', 6000);
        });
      });
    }

    // ── helpers other modules call ──
    showTab(tab) {
      if (!UI.isPhone()) return;
      document.body.dataset.tab = tab;
      document.querySelectorAll('.tabs [data-tab]').forEach((x) => {
        const on = x.dataset.tab === tab;
        x.classList.toggle('on', on);
        x.setAttribute('aria-selected', on ? 'true' : 'false');
        x.tabIndex = on ? 0 : -1;
      });
      if (Studio.onboarding && Studio.onboarding.active) requestAnimationFrame(() => Studio.onboarding.reposition());
    }

    focusText(selectAll) {
      this.showTab('edit');
      const ta = this.inspector.reveal('text', 'textarea');
      if (ta && selectAll) ta.select();
    }

    remix() {
      remix(this.store);
    }

    focusPresets() {
      this.showTab('presets');
      this.gallery.focusSearch();
    }

    setHint(text, kind) {
      const el = $('#stageHint');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'stage-hint' + (kind ? ' ' + kind : '');
      el.hidden = !text;
    }

    // ── top bar ──
    syncHistory() {
      const s = this.store;
      const undo = $('#undoBtn'), redo = $('#redoBtn');
      undo.disabled = !s.canUndo;
      redo.disabled = !s.canRedo;
      undo.setAttribute('data-tip', s.canUndo ? 'Undo ' + s.undoLabel : 'Nothing to undo');
      redo.setAttribute('data-tip', s.canRedo ? 'Redo ' + s.redoLabel : 'Nothing to redo');
      undo.setAttribute('aria-label', s.canUndo ? 'Undo ' + s.undoLabel : 'Undo');
      redo.setAttribute('aria-label', s.canRedo ? 'Redo ' + s.redoLabel : 'Redo');
    }

    syncSave(state) {
      const el = $('#saveState');
      if (!el || !state) return;
      const label = el.querySelector('span');
      el.dataset.status = state.status;
      if (state.status === 'pending') { label.textContent = 'Saving…'; el.removeAttribute('data-tip'); }
      else if (state.status === 'error') { label.textContent = 'Not saved'; el.setAttribute('data-tip', 'This browser is blocking storage. Save a project file to keep your work.'); }
      else { label.textContent = 'Autosaved'; el.setAttribute('data-tip', 'Saved in this browser · ' + new Date(state.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); }
    }

    wireTopbar() {
      const store = this.store;
      const name = $('#sceneName');
      name.value = store.scene.name;
      name.addEventListener('change', () => store.update((s) => { s.name = name.value.trim() || 'Untitled'; }, { reason: 'name', label: 'Rename project' }));
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Escape') name.value = store.scene.name; name.blur(); } });
      store.on('change', () => { if (document.activeElement !== name) name.value = store.scene.name; });
      $('#undoBtn').addEventListener('click', () => store.undo());
      $('#redoBtn').addEventListener('click', () => store.redo());
      $('#undoBtn').setAttribute('data-kbd', UI.keys('Mod+Z'));
      $('#redoBtn').setAttribute('data-kbd', UI.keys('Mod+Shift+Z'));
      $('#exportBtn').setAttribute('data-kbd', UI.keys('Mod+E'));
      $('#remixBtn').addEventListener('click', () => remix(store));
      $('#remixMenuBtn').addEventListener('click', (e) => this.remixMenu(e.currentTarget));
      $('#helpBtn').addEventListener('click', () => Studio.showShortcuts());
      $('#exportBtn').addEventListener('click', () => this.openExport());
      $('#shareBtn').addEventListener('click', () => this.openShare());
      $('#projectBtn').addEventListener('click', (e) => this.projectMenu(e.currentTarget));
      const more = $('#moreBtn');
      if (more) more.addEventListener('click', (e) => this.moreMenu(e.currentTarget));
      this.fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
      this.fileInput.addEventListener('change', () => { const f = this.fileInput.files[0]; this.fileInput.value = ''; if (f) this.openFile(f); });
      document.body.append(this.fileInput);
    }

    remixMenu(anchor) {
      const locks = remixLocks();
      const save = () => UI.storage.set(REMIX_KEY, locks);
      UI.menu(anchor, [
        { heading: 'Remix keeps…' },
        { label: 'Current preset', checked: locks.look, run: (v) => { locks.look = v; save(); } },
        { label: 'Font', checked: locks.font, run: (v) => { locks.font = v; save(); } },
        { label: 'Colours', hint: 'Keep your brand palette', checked: locks.colors, run: (v) => { locks.colors = v; save(); } },
        '-',
        { label: 'Remix now', icon: 'dice', kbd: 'R', run: () => remix(this.store) },
      ], { label: 'Remix options', width: 248 });
    }

    projectMenu(anchor) {
      UI.menu(anchor, [
        { label: 'New project', icon: 'file', run: () => { this.store.replace(starterScene(), { label: 'New project' }); toast('Started a new project', 'info', 4000, { label: 'Undo', run: () => this.store.undo() }); } },
        { label: 'Open project file…', icon: 'folder', run: () => this.fileInput.click() },
        { label: 'Save project file', icon: 'download', hint: 'JSON, includes custom fonts', run: () => this.saveFile() },
        '-',
        { label: 'Copy remix link', icon: 'link', run: () => this.copyLink() },
        { label: 'Keyboard shortcuts', icon: 'keyboard', kbd: '?', run: () => Studio.showShortcuts() },
        { label: 'Replay the tour', icon: 'sparkle', run: () => Studio.onboarding && Studio.onboarding.start() },
      ], { label: 'Project', width: 260 });
    }

    moreMenu(anchor) {
      const ui = this.store.ui;
      UI.menu(anchor, [
        { label: 'Embed or share', icon: 'code', run: () => this.openShare() },
        { label: 'Clean preview', icon: 'preview', kbd: 'F', run: () => this.store.setUI({ clean: true }) },
        { label: 'Safe-area guides', checked: !!ui.guides, run: (v) => this.store.setUI({ guides: v }) },
        '-',
        { label: 'Keyboard shortcuts', icon: 'keyboard', run: () => Studio.showShortcuts() },
      ], { label: 'More', width: 240 });
    }

    saveFile() {
      const s = this.store.scene;
      const payload = { typoman: 1, scene: TM.Scene.minify(s), fonts: Studio.customFonts ? Studio.customFonts.forScene(s) : [] };
      download(new Blob([JSON.stringify(payload)], { type: 'application/json' }), fileName(s, '.typoman.json'));
      toast('Saved ' + fileName(s, '.typoman.json'), 'ok');
    }

    async openFile(file) {
      try {
        if (file.size > 25 * 1024 * 1024) throw new Error('That file is too large');
        const data = JSON.parse(await file.text());
        const scene = data && data.scene ? data.scene : data;
        if (!scene || !Array.isArray(scene.layers)) throw new Error('That isn’t a TYPOMAN project file');
        if (Array.isArray(data.fonts) && Studio.customFonts) await Studio.customFonts.register(data.fonts);
        this.store.replace(scene, { label: 'Open project' });
        await TM.prepare(this.store.scene);
        toast('Opened “' + this.store.scene.name + '”', 'ok', 4000, { label: 'Undo', run: () => this.store.undo() });
      } catch (e) {
        toast(e instanceof SyntaxError ? 'That file isn’t valid JSON' : e.message || 'Could not open that file', 'error');
      }
    }

    copyLink() {
      const s = this.store.scene;
      TM.Scene.encode(s).then((code) => {
        const url = location.href.split('#')[0] + '#c=' + code;
        const custom = Studio.customFonts && Studio.customFonts.usesCustom(s);
        const note = custom ? ' Custom fonts can’t travel in links, so viewers see Anton.' : '';
        const done = () => toast('Remix link copied.' + note, custom ? 'error' : 'ok', custom ? 6500 : 3200);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => toast(url, 'info', 8000));
        else toast(url, 'info', 8000);
      }, (e) => toast('Could not make a link: ' + e.message, 'error'));
    }

    openExport() {
      if (Studio.openExport) return Studio.openExport(this.store);
      // Minimal fallback until the export module is present: save the current frame as PNG.
      const s = this.store.scene;
      const c = document.createElement('canvas');
      const r = new TM.Renderer(c);
      r.setScene(s);
      r.resize(s.size.w, s.size.h);
      const done = toast('Rendering a ' + s.size.w + '×' + s.size.h + ' PNG…', 'info', 20000);
      TM.prepare(s).then(() => {
        r.render(this.store.ui.time);
        c.toBlob((b) => {
          done();
          if (!b) return toast('Could not render the frame', 'error');
          download(b, fileName(s, '.png'));
          toast('Saved a PNG of the current frame', 'ok');
        });
      }, () => { done(); toast('Could not render the frame', 'error'); });
    }

    openShare() {
      if (Studio.openShare) return Studio.openShare(this.store);
      this.copyLink();
    }

    // ── stage bar ──
    wireStagebar() {
      const store = this.store;
      $('#formatBtn').addEventListener('click', (e) => this.formatMenu(e.currentTarget));
      $('#zoomBtn').addEventListener('click', (e) => this.zoomMenu(e.currentTarget));
      $('#guidesBtn').addEventListener('click', () => store.setUI({ guides: !store.ui.guides }));
      $('#cleanBtn').addEventListener('click', () => store.setUI({ clean: true }));
      $('#pathBtn').addEventListener('click', () => store.setUI({ editPath: !store.ui.editPath }));
      $('#exitClean').addEventListener('click', () => store.setUI({ clean: false }));
      this.stage.onZoom = () => { $('#zoomLabel').textContent = this.stage.zoomLabel(); };
      $('#zoomLabel').textContent = this.stage.zoomLabel();
    }

    syncStagebar() {
      const store = this.store, s = store.scene;
      const hit = TM.Scene.ASPECTS.find((a) => Math.abs(a[2] / a[3] - s.size.w / s.size.h) < 0.01);
      $('#formatLabel').textContent = hit ? hit[0] : 'Custom';
      $('#formatDims').textContent = s.size.w + '×' + s.size.h;
      const fmtIcon = $('#formatBtn .fmt-glyph');
      if (fmtIcon) {
        const k = Math.min(16 / s.size.w, 12 / s.size.h);
        fmtIcon.style.width = Math.max(4, s.size.w * k) + 'px';
        fmtIcon.style.height = Math.max(4, s.size.h * k) + 'px';
      }
      const usesPath = !!(store.preset && store.preset.usesPath);
      const pathBtn = $('#pathBtn');
      pathBtn.hidden = !usesPath;
      pathBtn.classList.toggle('on', !!store.ui.editPath);
      pathBtn.setAttribute('aria-pressed', store.ui.editPath ? 'true' : 'false');
      pathBtn.querySelector('span').textContent = store.ui.editPath ? 'Done' : 'Edit path';
      const g = $('#guidesBtn');
      g.classList.toggle('on', !!store.ui.guides);
      g.setAttribute('aria-pressed', store.ui.guides ? 'true' : 'false');
      if (store.ui.editPath) this.setHint('Editing path · drag points · double-click to add · Del removes · Esc to finish', 'editing');
      else if (!this.stage.board.classList.contains('loading')) this.setHint('');
    }

    formatMenu(anchor) {
      const s = this.store.scene;
      UI.menu(anchor, TM.Scene.ASPECTS.map(([id, label, w, hh]) => ({
        label: label.replace(/ \d+:\d+$/, ''),
        hint: w + ' × ' + hh,
        kbd: id,
        checked: Math.abs(w / hh - s.size.w / s.size.h) < 0.01,
        run: () => { this.store.setSize(w, hh); UI.closePopover(); toast('Format: ' + label + ' · ' + w + '×' + hh); },
      })).concat(['-', { label: 'Custom size…', icon: 'frame', run: () => { this.showTab('edit'); this.inspector.reveal('canvas', '.ctl-size input'); } }]), { label: 'Artboard format', width: 270 });
    }

    zoomMenu(anchor) {
      const st = this.stage;
      UI.menu(anchor, [
        { label: 'Zoom to fit', kbd: UI.keys('Shift+1'), checked: this.store.ui.zoom === 'fit', run: () => { st.setZoom('fit'); UI.closePopover(); } },
        { label: 'Zoom in', icon: 'plus', kbd: '+', run: () => st.zoomStep(1) },
        { label: 'Zoom out', icon: 'minus', kbd: '−', run: () => st.zoomStep(-1) },
        '-',
        ...[0.25, 0.5, 1, 2].map((z) => ({ label: z * 100 + '%', kbd: z === 1 ? UI.keys('Shift+0') : null, run: () => st.setZoom(z) })),
      ], { label: 'Zoom', width: 220 });
    }

    onClean() {
      const on = !!this.store.ui.clean;
      document.body.classList.toggle('clean', on);
      if (on) {
        if (this.store.ui.editPath) this.store.setUI({ editPath: false });
        UI.closePopover();
        const hint = $('#cleanHint');
        hint.classList.add('show');
        clearTimeout(this._cleanTimer);
        this._cleanTimer = setTimeout(() => hint.classList.remove('show'), 2600);
        $('#exitClean').focus({ preventScroll: true });
      } else {
        $('#cleanBtn').focus({ preventScroll: true });
      }
      requestAnimationFrame(() => this.stage.layout(true));
    }

    // ── keyboard ──
    wireKeys() {
      const store = this.store;
      const CONTROL = 'button, a[href], select, [role="button"], [role="option"], [role="tab"], [role="radio"], [role="switch"], [role="menuitem"], [role="menuitemcheckbox"], [role="slider"]:not(#scrub), input[type="range"], .pop, .coach';
      document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || document.body.classList.contains('has-modal')) return;
        const t = e.target || document.body;
        const tag = t.tagName || '';
        const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || t.isContentEditable;
        const mod = e.metaKey || e.ctrlKey;
        const key = (e.key || '').toLowerCase();
        if (mod && key === 'z') {
          if (typing && (tag === 'TEXTAREA' || (tag === 'INPUT' && /text|search/.test(t.type)))) return; // native text undo
          e.preventDefault();
          e.shiftKey ? store.redo() : store.undo();
          return;
        }
        if (mod && key === 'y') { if (typing) return; e.preventDefault(); store.redo(); return; }
        if (mod && key === 'e') { e.preventDefault(); this.openExport(); return; }
        if (mod && key === 's') { e.preventDefault(); store.save(); toast(store.saveState.status === 'error' ? 'This browser blocks storage. Use Project → Save project file.' : 'Autosaved in this browser. Use Project → Save project file for a copy.', store.saveState.status === 'error' ? 'error' : 'ok'); return; }
        if (mod && key === 'd' && !typing) { e.preventDefault(); this.layers.duplicate(); return; }
        if (typing || mod || e.altKey) return;
        const onControl = t.closest && t.closest(CONTROL);
        if (e.shiftKey && (e.code === 'Digit1' || e.code === 'Digit0')) { e.preventDefault(); this.stage.setZoom(e.code === 'Digit1' ? 'fit' : 1); return; }
        switch (e.key) {
          case ' ':
            if (onControl) return;
            e.preventDefault();
            this.transport.toggle();
            break;
          case 'ArrowLeft':
          case 'ArrowRight':
            if (onControl) return;
            e.preventDefault();
            this.transport.step((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
            break;
          case 'Home':
          case 'End':
            if (onControl) return;
            e.preventDefault();
            this.transport.setFrame(e.key === 'Home' ? 0 : this.transport.frames - 1);
            break;
          case 'p': case 'P':
            if (store.preset && store.preset.usesPath) store.setUI({ editPath: !store.ui.editPath });
            else toast('This preset doesn’t follow a path. Try Path Flow.', 'info');
            break;
          case 'g': case 'G': store.setUI({ guides: !store.ui.guides }); break;
          case 'f': case 'F': store.setUI({ clean: !store.ui.clean }); break;
          case 'r': case 'R': remix(store); break;
          case 'n': case 'N': e.preventDefault(); this.layers.add(); break; // don't type the 'n' into the new layer's text
          case '[': store.select(store.selected - 1); UI.announce('Selected ' + Studio.layerName(store.layer)); break;
          case ']': store.select(store.selected + 1); UI.announce('Selected ' + Studio.layerName(store.layer)); break;
          case '/': e.preventDefault(); this.focusPresets(); break;
          case '?': e.preventDefault(); Studio.showShortcuts(); break;
          case '+': case '=': e.preventDefault(); this.stage.zoomStep(1); break;
          case '-': case '_': e.preventDefault(); this.stage.zoomStep(-1); break;
          case 'Escape':
            if (store.ui.clean) store.setUI({ clean: false });
            else if (store.ui.editPath) store.setUI({ editPath: false });
            else if (t !== document.body && t.blur && !onControl) t.blur();
            break;
          default: break;
        }
      });
    }

    // ── mobile tabs + sheet ──
    wireTabs() {
      const tabs = [...document.querySelectorAll('.tabs [data-tab]')];
      tabs.forEach((b) => {
        b.addEventListener('click', () => {
          if (document.body.dataset.tab === b.dataset.tab && UI.isPhone()) document.body.classList.toggle('sheet-full');
          this.showTab(b.dataset.tab);
          requestAnimationFrame(() => this.stage.layout());
        });
        b.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          e.stopPropagation();
          const i = tabs.indexOf(b);
          const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
          next.focus();
          next.click();
        });
      });
      const handle = $('#sheetHandle');
      if (handle) handle.addEventListener('click', () => {
        const full = document.body.classList.toggle('sheet-full');
        handle.setAttribute('aria-expanded', full ? 'true' : 'false');
        requestAnimationFrame(() => this.stage.layout());
      });
      this.showTab(document.body.dataset.tab || 'presets');
      UI.onPhoneChange(() => requestAnimationFrame(() => this.stage.layout(true)));
    }

    // ── drag & drop: fonts and project files ──
    wireDrop() {
      const overlay = $('#dropOverlay');
      let depth = 0;
      const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
      window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; depth++; overlay.hidden = false; });
      window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) overlay.hidden = true; });
      window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
      window.addEventListener('drop', async (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth = 0;
        overlay.hidden = true;
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        if (Studio.customFonts && Studio.customFonts.isFontFile(file)) {
          try {
            const entry = await Studio.customFonts.addFile(file);
            TM.fonts.ensure(entry.family, 400);
            this.store.updateLayer((l) => { l.font.family = entry.family; l.font.weight = 400; }, { reason: 'font', label: 'Font: ' + entry.family });
            toast('Using “' + entry.family.replace(/ \(custom\)$/, '') + '” on this layer. Share links can’t carry custom fonts.', 'ok', 5200);
          } catch (err) { toast(err.message, 'error'); }
        } else if (/\.json$/i.test(file.name)) this.openFile(file);
        else toast('Drop a font (.ttf, .otf, .woff, .woff2) or a .typoman.json project', 'error');
      });
    }
  }

  function bootError(err) {
    console.error('[TYPOMAN] studio failed to start:', err);
    document.body.classList.remove('booting');
    document.body.classList.add('boot-failed');
  }

  TM_READY.then(async () => {
    try {
      const scene = await initialScene();
      const store = new Studio.Store(scene);
      Studio.store = store;
      new App(store);
      document.body.classList.remove('booting');
      document.body.classList.add('ready');
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    } catch (e) { bootError(e); }
  }, bootError);
})(window.TM);
