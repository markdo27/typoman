/* TYPOMAN studio — preset gallery, curated looks and Inspiration.
 *
 *   new TM.Studio.Gallery(store, root)
 *   TM.Studio.looks.all()                         → [{ presetId, index, look }] across presets
 *   TM.Studio.looks.apply(store, presetId, index)  apply a curated look (undoable, keeps the text)
 *
 * Two views. Presets: search, category chips, a card per preset, and — when the active preset
 * has curated `looks` — a strip of look mini-cards above the grid. Inspiration: every look of
 * every preset in one browsable grid. Either way a look is applied with TM.Scene.applyLook.
 *
 * Thumbnails render *your* text and style. The hovered / focused card animates at full rate;
 * the rest drift gently while visible (IntersectionObserver) and the stage plays, sharing one
 * renderer and a per-frame time budget; still while the stage is paused and under
 * prefers-reduced-motion, where each card shows its most legible frame. Keyboard: arrow keys
 * move within a grid, Enter / Space apply, "/" searches.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const h = Studio.h;
  const UI = Studio.ui;
  const TW = 320, TH = 180;
  const IDLE_FPS = 12, HOVER_FPS = 30;
  const BUDGET_MS = 3.5;
  const VIEW_KEY = 'typoman.gallery.view';
  const VIEWS = ['presets', 'inspiration', 'templates'];
  // Texts that aren't the user's own: a template keeps its own headline then.
  const DEFAULT_TEXTS = ['TYPE IN MOTION', 'NEW LAYER', 'AA'];

  // ───────────────────────────── looks ─────────────────────────────
  const looks = {
    of: (presetId) => { const p = TM.getPreset(presetId); return p && Array.isArray(p.looks) ? p.looks : []; },
    all() {
      const out = [];
      TM.presetOrder.forEach((presetId) => looks.of(presetId).forEach((look, index) => out.push({ presetId, index, look })));
      return out;
    },
    /** Apply look #index of a preset to the selected layer: one undo step, text untouched. */
    apply(store, presetId, index) {
      const look = looks.of(presetId)[index];
      if (!look) return false;
      store.update((draft) => {
        const next = TM.Scene.applyLook(draft, store.selected, Object.assign({}, look, { preset: presetId }));
        Object.keys(draft).forEach((k) => { delete draft[k]; });
        Object.assign(draft, next);
      }, { reason: 'look', label: 'Look: ' + look.name });
      TM.prepare(store.scene);
      return true;
    },
  };
  Studio.looks = looks;

  class Gallery {
    constructor(store, root) {
      this.store = store;
      this.root = root;
      this.cards = new Map(); // key → { card, cv, last, bestT }; keys: preset id or 'look:<preset>:<i>'
      this.visible = new Set();
      this.thumbCanvas = document.createElement('canvas');
      this.thumb = new TM.Renderer(this.thumbCanvas, { quality: 'preview' });
      this.thumb.resize(TW, TH);
      this.probe = document.createElement('canvas');
      this.probe.width = 48;
      this.probe.height = 27;
      this.pctx = this.probe.getContext('2d', { willReadFrequently: true });
      this.hover = null;
      this.filter = 'All';
      this.query = '';
      this.view = VIEWS.includes(UI.storage.get(VIEW_KEY, 'presets')) ? UI.storage.get(VIEW_KEY, 'presets') : 'presets';
      // Templates render whole multi-layer scenes at their own aspect, letterboxed into the card.
      this.tplCanvas = document.createElement('canvas');
      this.tplThumb = new TM.Renderer(this.tplCanvas, { quality: 'preview' });
      this.scenes = new Map();
      this.queue = [];
      this.busyUntil = 0;
      this._looksFor = null;
      this.io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          const id = e.target.dataset.id;
          if (e.isIntersecting) { this.visible.add(id); this.drawThumb(id); } else this.visible.delete(id);
        });
      }, { root: null, rootMargin: '40px' }) : null;
      this.buildShell();
      this.build();
      store.on('change', (d) => {
        this.markActive();
        if (this.store.layer.preset !== this._looksFor) this.renderLooks(true);
        if (!d || (d.reason !== 'preset' && d.reason !== 'font-preview')) this.scheduleThumbs();
      });
      store.on('select', () => { this.markActive(); if (this.store.layer.preset !== this._looksFor) this.renderLooks(true); this.scheduleThumbs(80); });
      // Paused stage: idle cards stop animating and settle on their most legible frame (cached).
      // Only on the playing → paused change: scrubbing and frame steps also set playing: false.
      let wasPlaying = store.ui.playing;
      store.on('ui', (p) => {
        if (!('playing' in p)) return;
        if (wasPlaying && !store.ui.playing) {
          clearTimeout(this._settle);
          this._settle = setTimeout(() => this.visible.forEach((id) => { if (id !== this.hover) this.drawThumb(id); }), 120);
        }
        wasPlaying = store.ui.playing;
      });
      this.scheduleThumbs(50);
    }

    buildShell() {
      this.tabs = h('div', { class: 'gal-tabs', role: 'tablist', 'aria-label': 'Gallery view' });
      [['presets', 'Presets'], ['inspiration', 'Inspiration'], ['templates', 'Templates']].forEach(([v, label]) => {
        const b = h('button', { type: 'button', role: 'tab', 'data-view': v }, label);
        b.addEventListener('click', () => this.setView(v));
        b.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          e.stopPropagation();
          const next = VIEWS[(VIEWS.indexOf(v) + (e.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length];
          this.setView(next);
          this.tabs.querySelector(`[data-view="${next}"]`).focus();
        });
        this.tabs.append(b);
      });
      this.search = h('input', { type: 'search', class: 'search', placeholder: 'Search presets', 'aria-label': 'Search presets and looks', autocomplete: 'off', spellcheck: 'false', 'data-kbd': '/' });
      this.search.addEventListener('input', () => { this.query = this.search.value.trim().toLowerCase(); this.build(); });
      this.search.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.focusCard(0); }
        if (e.key === 'Escape' && this.search.value) { e.stopPropagation(); this.search.value = ''; this.query = ''; this.build(); }
      });
      this.chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Categories' });
      this.looksEl = h('div', { class: 'looks-strip', hidden: true });
      this.grid = h('div', { class: 'cards', role: 'listbox', 'aria-label': 'Presets', 'aria-orientation': 'horizontal' });
      this.empty = h('div', { class: 'gallery-empty', hidden: true });
      this.root.addEventListener('keydown', (e) => { if (e.target.closest('.card, .look-card')) this.onKey(e); });
      this.root.append(h('div', { class: 'gallery-top' }, this.tabs, h('div', { class: 'search-wrap' }, UI.icon('search'), this.search, h('kbd', { class: 'search-kbd', 'aria-hidden': 'true' }, '/')), this.chips), this.looksEl, this.grid, this.empty);
      this.root.addEventListener('scroll', () => { this.busyUntil = performance.now() + 250; }, { passive: true });
    }

    setView(v) {
      if (v === this.view) return;
      this.view = v;
      UI.storage.set(VIEW_KEY, v);
      this.root.scrollTop = 0;
      this.build();
    }

    matchesPreset(p) {
      if (this.filter !== 'All' && p.category !== this.filter) return false;
      if (!this.query) return true;
      const q = this.query;
      return p.name.toLowerCase().includes(q) || p.id.includes(q) || (p.category || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || (p.usesPath && 'path'.startsWith(q));
    }

    matchesLook(entry) {
      const p = TM.presets[entry.presetId];
      if (this.filter !== 'All' && p.category !== this.filter) return false;
      if (!this.query) return true;
      const q = this.query;
      return entry.look.name.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
    }

    build() {
      const ids = TM.presetOrder.slice();
      const insp = this.view === 'inspiration', tpl = this.view === 'templates';
      const tpls = TM.Templates ? TM.Templates.list() : [];
      if (tpl && !tpls.length) { this.view = 'presets'; return this.build(); } // no templates loaded
      const all = looks.all();
      this.tabs.querySelectorAll('[role="tab"]').forEach((b) => {
        const on = b.dataset.view === this.view;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        if (b.dataset.view === 'inspiration') b.replaceChildren(...['Inspiration', all.length ? h('span', { class: 'chip-n' }, String(all.length)) : null].filter(Boolean));
        if (b.dataset.view === 'templates') { b.hidden = !tpls.length; b.replaceChildren('Templates', h('span', { class: 'chip-n' }, String(tpls.length))); }
      });
      this.search.placeholder = tpl ? 'Search templates' : insp ? 'Search looks' : 'Search presets';
      const pool = tpl ? [] : insp ? all.map((e) => TM.presets[e.presetId].category) : ids.map((id) => TM.presets[id].category);
      const cats = TM.CATEGORIES.filter((c) => pool.includes(c)).concat([...new Set(pool)].filter((c) => !TM.CATEGORIES.includes(c)));
      const chipList = ['All'].concat(cats);
      if (!chipList.includes(this.filter)) this.filter = 'All';
      this.chips.replaceChildren(...(pool.length ? chipList : []).map((c) => {
        const n = c === 'All' ? pool.length : pool.filter((x) => x === c).length;
        return h('button', {
          type: 'button', class: 'chip' + (c === this.filter ? ' on' : ''), 'aria-pressed': c === this.filter ? 'true' : 'false',
          onclick: () => { this.filter = c; this.build(); },
        }, c, h('span', { class: 'chip-n' }, String(n)));
      }));

      if (this.io) this.cards.forEach(({ card }) => this.io.unobserve(card));
      this.cards.clear();
      this.visible.clear();
      const cur = this.store.layer.preset;
      this.renderLooks(false);

      let shown = 0;
      if (tpl) {
        const q = this.query;
        const list = tpls.filter((t) => !q || (t.name + ' ' + t.description + ' ' + t.aspect).toLowerCase().includes(q));
        shown = list.length;
        this.grid.className = 'cards templates';
        this.grid.setAttribute('aria-label', 'Starter templates');
        this.grid.replaceChildren(...list.map((t, i) => this.templateCard(t, i === 0)));
      } else if (insp) {
        const list = all.filter((e) => this.matchesLook(e));
        shown = list.length;
        this.grid.className = 'cards inspiration';
        this.grid.setAttribute('aria-label', 'Looks from every preset');
        this.grid.replaceChildren(...list.map((e, i) => this.lookCard(e, false, i === 0)));
      } else {
        const list = ids.filter((id) => this.matchesPreset(TM.presets[id]));
        shown = list.length;
        this.grid.className = 'cards';
        this.grid.setAttribute('aria-label', 'Presets');
        this.grid.replaceChildren(...list.map((id, i) => this.presetCard(id, id === cur || (i === 0 && !list.includes(cur)))));
      }

      this.empty.hidden = shown > 0;
      if (!shown) {
        const clear = h('button', { type: 'button', class: 'btn sm', onclick: () => { this.search.value = ''; this.query = ''; this.filter = 'All'; this.build(); this.search.focus(); } }, 'Clear search');
        if (insp && !all.length) {
          const remix = h('button', { type: 'button', class: 'btn sm primary', onclick: () => Studio.app && Studio.app.remix() }, UI.icon('dice'), h('span', null, 'Remix'));
          const back = h('button', { type: 'button', class: 'btn sm', onclick: () => this.setView('presets') }, 'Browse presets');
          this.empty.replaceChildren(UI.icon('sparkle', 'empty-ic'), h('p', null, h('strong', null, 'No curated looks yet.')), h('p', { class: 'hint' }, 'Presets will add hand-made starting points here. Meanwhile, Remix rolls a fresh look.'), h('div', { class: 'row-center' }, remix, back));
        } else {
          this.empty.replaceChildren(h('p', null, 'Nothing matches ', h('strong', null, '“' + (this.query || this.filter) + '”'), '.'), clear);
        }
      }
      const count = document.getElementById('presetCount');
      if (count) count.textContent = tpl ? String(tpls.length) : insp ? String(all.length) : shown === ids.length ? String(ids.length) : shown + ' / ' + ids.length;
      const title = document.getElementById('presetsTitle');
      if (title) title.textContent = tpl ? 'Templates' : insp ? 'Inspiration' : 'Presets';
      this.markActive();
      this.scheduleThumbs(0);
    }

    /** The active preset's looks strip (Presets view only; hidden when the preset has none). */
    renderLooks(draw) {
      this.cards.forEach((c, key) => {
        if (!this.looksEl.contains(c.card)) return;
        if (this.io) this.io.unobserve(c.card);
        this.cards.delete(key);
        this.visible.delete(key);
      });
      const cur = this.store.layer.preset;
      this._looksFor = cur;
      const mine = this.view !== 'presets' ? [] : looks.of(cur).map((look, index) => ({ presetId: cur, index, look }));
      this.looksEl.hidden = !mine.length;
      if (!mine.length) { this.looksEl.replaceChildren(); return; }
      const grid = h('div', { class: 'looks-grid', role: 'listbox', 'aria-label': 'Looks for ' + TM.presets[cur].name });
      mine.forEach((e, i) => grid.append(this.lookCard(e, true, i === 0)));
      this.looksEl.replaceChildren(h('div', { class: 'looks-head' }, UI.icon('looks'), h('span', null, 'Looks for ', h('strong', null, TM.presets[cur].name)), h('span', { class: 'count' }, String(mine.length))), grid);
      if (draw) mine.forEach((e) => this.drawThumb('look:' + e.presetId + ':' + e.index));
    }

    thumbEl(key) {
      const cv = h('canvas', { width: TW, height: TH, 'aria-hidden': 'true' });
      return { cv, wrap: h('div', { class: 'card-thumb' }, cv) };
    }

    register(key, card, cv) {
      card.addEventListener('pointerenter', () => { this.hover = key; });
      card.addEventListener('pointerleave', () => { if (this.hover === key) { this.hover = null; this.drawThumb(key); } });
      card.addEventListener('focus', () => { this.hover = key; this.setRoving(card); });
      card.addEventListener('blur', () => { if (this.hover === key) { this.hover = null; this.drawThumb(key); } });
      this.cards.set(key, { card, cv, last: 0, bestT: null });
      if (this.io) this.io.observe(card);
      else this.visible.add(key);
    }

    presetCard(id, tabbable) {
      const p = TM.presets[id];
      const { cv, wrap } = this.thumbEl(id);
      const n = looks.of(id).length;
      wrap.append(h('span', { class: 'card-active', 'aria-hidden': 'true' }, UI.icon('check'), 'Active'));
      if (p.usesPath) wrap.append(h('span', { class: 'card-path', 'aria-hidden': 'true' }, UI.icon('pen')));
      const card = h('div', {
        class: 'card', role: 'option', tabindex: tabbable ? '0' : '-1', 'data-id': id,
        'aria-label': p.name + ', ' + p.category + (p.usesPath ? ', follows a path' : '') + (n ? ', ' + n + ' looks' : '') + (p.description ? '. ' + p.description : ''),
        'data-tip': p.description || null,
      }, wrap, h('span', { class: 'card-name' }, p.name), h('span', { class: 'card-cat' }, p.category + (n ? ' · ' + n + ' looks' : '')));
      card.addEventListener('click', () => this.apply(id));
      this.register(id, card, cv);
      return card;
    }

    lookCard(e, mini, tabbable) {
      const key = 'look:' + e.presetId + ':' + e.index;
      const p = TM.presets[e.presetId];
      const { cv, wrap } = this.thumbEl(key);
      const card = h('div', {
        class: 'look-card' + (mini ? ' mini' : ' card'), role: 'option', tabindex: tabbable ? '0' : '-1', 'data-id': key,
        'aria-label': 'Look ' + e.look.name + (mini ? '' : ' from ' + p.name) + '. Apply to the selected layer',
        'data-tip': mini ? e.look.name : 'Apply “' + e.look.name + '” (' + p.name + ')',
      }, wrap, h('span', { class: 'card-name' }, e.look.name), mini ? null : h('span', { class: 'card-cat' }, p.name + ' · ' + p.category));
      card.addEventListener('click', () => this.applyLook(e.presetId, e.index));
      this.register(key, card, cv);
      return card;
    }

    /** A starter template: the whole scene, at its own aspect, with your text as its headline. */
    templateCard(t, tabbable) {
      const key = 'tpl:' + t.id;
      const { cv, wrap } = this.thumbEl(key);
      wrap.append(h('span', { class: 'card-aspect', 'aria-hidden': 'true' }, t.aspect));
      const card = h('div', {
        class: 'card tpl-card', role: 'option', tabindex: tabbable ? '0' : '-1', 'data-id': key,
        'aria-label': 'Template ' + t.name + ', ' + t.aspect + ', ' + t.duration + ' second loop. ' + t.description + ' Replaces the whole scene.',
        'data-tip': t.description,
      }, wrap, h('span', { class: 'card-name' }, t.name), h('span', { class: 'card-cat' }, t.aspect + ' · ' + t.duration + ' s'));
      card.addEventListener('click', () => this.applyTemplate(t.id));
      this.register(key, card, cv);
      return card;
    }

    /** The text a template's headline should take: the selected layer's, unless it's a default. */
    templateText() {
      const t = String(this.store.layer.text || '').trim();
      const flat = t.replace(/\s+/g, ' ').toUpperCase();
      return !t || DEFAULT_TEXTS.includes(flat) ? '' : t;
    }

    /** Replace the scene with a template: one undo step, your text in its headline. */
    applyTemplate(id) {
      const meta = (TM.Templates ? TM.Templates.list() : []).find((t) => t.id === id);
      const text = this.templateText();
      const scene = meta && TM.Templates.build(id, text ? { text } : {});
      if (!scene) return;
      const store = this.store;
      store.autoFont = {};
      store.replace(scene, { label: 'Template: ' + meta.name });
      // Select the headline (the layer that took the text), else the top layer.
      const head = scene.layers.findIndex((l) => text && l.text === text);
      store.select(head >= 0 ? head : scene.layers.length - 1);
      TM.prepare(store.scene);
      UI.announce('Template ' + meta.name + ' applied');
      if (Studio.toast) Studio.toast('Template: ' + meta.name + (text ? ' · with your text' : '') + ' · ' + UI.plural(scene.layers.length, 'layer'), 'info', 4200, { label: 'Undo', run: () => store.undo() });
      if (Studio.app && Studio.app.stage) Studio.app.stage.flash();
    }

    apply(id) {
      const p = TM.presets[id];
      if (!p) return;
      if (this.store.layer.preset === id) { UI.announce(p.name + ' is already applied'); return; }
      const swapped = this.store.setPreset(id);
      UI.announce(p.name + ' applied');
      // A preset that prefers a font swapped it in for the untouched default: say so, one tap back.
      if (swapped && swapped.font && Studio.toast) {
        const { from, to } = swapped.font;
        const store = this.store;
        Studio.toast(p.name + ' is designed for ' + Studio.fontLabel(to) + ', so the layer uses it now', 'info', 4200, {
          label: 'Keep ' + Studio.fontLabel(from),
          run: () => { TM.fonts.ensure(from, 400); store.autoFont[store.layer.id] = { kept: true }; store.updateLayer((l) => { l.font.family = from; l.font.weight = TM.fonts.clampWeight(from, 400); }, { reason: 'font', label: 'Font: ' + from }); },
        });
      }
      if (Studio.app && Studio.app.stage) Studio.app.stage.flash();
    }

    applyLook(presetId, index) {
      if (!looks.apply(this.store, presetId, index)) return;
      const look = looks.of(presetId)[index];
      UI.announce('Look ' + look.name + ' applied');
      if (Studio.app && Studio.app.stage) Studio.app.stage.flash();
    }

    setRoving(card) {
      const group = card.closest('.cards, .looks-grid');
      if (!group) return;
      group.querySelectorAll('.card, .look-card').forEach((c) => { c.tabIndex = c === card ? 0 : -1; });
    }

    focusCard(i) {
      const first = this.looksEl.hidden ? this.grid : this.looksEl.querySelector('.looks-grid');
      const list = [...first.querySelectorAll('.card, .look-card')];
      if (!list.length) return;
      const c = list[Math.max(0, Math.min(list.length - 1, i))];
      c.focus();
      c.scrollIntoView({ block: 'nearest' });
    }

    onKey(e) {
      const group = e.target.closest('.cards, .looks-grid');
      if (!group) return;
      const list = [...group.querySelectorAll('.card, .look-card')];
      const i = list.indexOf(e.target.closest('.card, .look-card'));
      if (i < 0) return;
      const top = list[0].offsetTop;
      const cols = Math.max(1, list.filter((c) => c.offsetTop === top).length);
      let j = null;
      switch (e.key) {
        case 'ArrowRight': j = i + 1; break;
        case 'ArrowLeft': j = i - 1; break;
        case 'ArrowDown':
          if (i + cols >= list.length && group.classList.contains('looks-grid')) { e.preventDefault(); const g = this.grid.querySelector('.card'); if (g) g.focus(); return; }
          j = i + cols; break;
        case 'ArrowUp':
          if (i - cols < 0) {
            e.preventDefault();
            const strip = group === this.grid && !this.looksEl.hidden ? this.looksEl.querySelector('.look-card') : null;
            (strip || this.search).focus();
            return;
          }
          j = i - cols; break;
        case 'Home': j = 0; break;
        case 'End': j = list.length - 1; break;
        case 'Enter': case ' ': e.preventDefault(); list[i].click(); return;
        default: return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (j >= 0 && j < list.length) { list[j].focus(); list[j].scrollIntoView({ block: 'nearest' }); }
    }

    markActive() {
      const cur = this.store.layer.preset;
      this.cards.forEach(({ card }, id) => {
        if (id.startsWith('look:')) return;
        const on = id === cur;
        card.classList.toggle('on', on);
        card.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (this.cards.has(cur) && !this.root.contains(document.activeElement)) this.setRoving(this.cards.get(cur).card);
    }

    /** Thumbnail scene: the selected layer alone at 16:9, with a preset or a look applied. */
    sceneFor(key) {
      if (key.startsWith('tpl:')) {
        const text = this.templateText();
        const s = TM.Templates.build(key.slice(4), text ? { text } : {});
        if (s) TM.prepare(s, { extras: 'background' });
        return s;
      }
      if (key.startsWith('look:')) {
        const [, presetId, idx] = key.split(':');
        const look = looks.of(presetId)[+idx];
        const base = this.baseScene(presetId);
        if (!look) return base;
        const s = TM.Scene.applyLook(base, 0, Object.assign({}, look, { preset: presetId }));
        s.size = { w: TW, h: TH };
        s.layers[0].fx.blur = 0;
        return TM.Scene.normalize(s);
      }
      return this.baseScene(key);
    }

    baseScene(id) {
      const s = TM.Scene.clone(this.store.scene);
      const layer = s.layers[Math.min(this.store.selected, s.layers.length - 1)];
      s.layers = [layer];
      layer.visible = true;
      if (!String(layer.text || '').trim()) layer.text = 'Aa';
      // Preview the look, not the layout: centred, legible, untimed.
      layer.anchor = { x: 0.5, y: 0.5 };
      layer.type.size = Math.max(layer.type.size, 0.15);
      layer.time = { delay: 0, cycles: 1, mode: 'loop' };
      if (layer.preset !== id) {
        layer.preset = id;
        layer.params = TM.presetDefaults(id);
        const p = TM.presets[id];
        if (p && p.usesPath && (!layer.path || layer.path.preset)) layer.path = TM.Path.preset(p.path || 'wave', TW / TH);
      }
      s.size = { w: TW, h: TH };
      if (layer.path && layer.path.preset) layer.path = TM.Path.preset(layer.path.preset, TW / TH);
      layer.fx.blur = 0;
      if (s.bg.type === 'transparent') { s.bg.type = 'solid'; s.bg.color = '#16161a'; }
      return TM.Scene.normalize(s);
    }

    scheduleThumbs(ms = 350) {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => {
        this.scenes = new Map();
        this.cards.forEach((c) => { c.last = 0; c.bestT = null; });
        this.visible.forEach((id) => this.drawThumb(id));
        if (!this.io) this.cards.forEach((_, id) => this.drawThumb(id));
      }, ms);
    }

    /** The most legible still: the sampled moment with the most "ink" against the background. */
    bestTime(entry, scene) {
      if (entry.bestT != null) return entry.bestT;
      let best = 0.42, bestInk = -1;
      for (const u of [0.42, 0.62, 0.3, 0.8]) {
        try { this.thumb.render(scene.duration * u); } catch (e) { break; }
        this.pctx.clearRect(0, 0, 48, 27);
        this.pctx.drawImage(this.thumbCanvas, 0, 0, 48, 27);
        const d = this.pctx.getImageData(0, 0, 48, 27).data;
        let ink = 0;
        for (let k = 0; k < d.length; k += 4) {
          const dr = d[k] - d[0], dg = d[k + 1] - d[1], db = d[k + 2] - d[2];
          if (dr * dr + dg * dg + db * db > 2400) ink++;
        }
        if (ink > bestInk * 1.15) { bestInk = ink; best = u; }
      }
      entry.bestT = scene.duration * best;
      return entry.bestT;
    }

    drawThumb(id, t) {
      const entry = this.cards.get(id);
      if (!entry) return;
      let scene = this.scenes.get(id);
      if (!scene) { scene = this.sceneFor(id); this.scenes.set(id, scene); }
      if (!scene) return;
      if (id.startsWith('tpl:')) return this.drawTemplate(entry, scene, t);
      this.thumb.setScene(scene);
      try {
        const time = t != null ? t : this.bestTime(entry, scene);
        this.thumb.render(time);
      } catch (e) { return; }
      const ctx = entry.cv.getContext('2d');
      ctx.clearRect(0, 0, TW, TH);
      ctx.drawImage(this.thumbCanvas, 0, 0);
    }

    /** Template thumbnail: the scene at its aspect, centred in the 16:9 card. */
    drawTemplate(entry, scene, t) {
      const ar = scene.size.w / scene.size.h;
      const w = ar >= TW / TH ? TW : Math.round(TH * ar), hh = ar >= TW / TH ? Math.round(TW / ar) : TH;
      if (this.tplCanvas.width !== w || this.tplCanvas.height !== hh) this.tplThumb.resize(w, hh);
      this.tplThumb.setScene(scene);
      // Sub-layers play once inside the loop, so the still sits where most of them are on.
      try { this.tplThumb.render(t != null ? (performance.now() / 1000) % scene.duration : scene.duration * 0.55); } catch (e) { return; }
      const ctx = entry.cv.getContext('2d');
      ctx.fillStyle = '#0c0c10';
      ctx.fillRect(0, 0, TW, TH);
      ctx.drawImage(this.tplCanvas, Math.round((TW - w) / 2), Math.round((TH - hh) / 2));
    }

    tick(now) {
      if (!this.cards.size) return;
      const start = performance.now();
      const dur = this.store.scene.duration || 4;
      const t = (now / 1000) % dur;
      if (this.hover && this.cards.has(this.hover)) {
        const c = this.cards.get(this.hover);
        if (now - c.last >= 1000 / HOVER_FPS) { c.last = now; this.drawThumb(this.hover, t); }
      }
      // Gentle idle animation: visible cards, round-robin, capped frame rate and time budget.
      // Only while the stage plays: a paused studio shouldn't burn ~80 thumbnail renders a second.
      if (!this.store.ui.playing || document.hidden || UI.reducedMotion() || now < this.busyUntil || document.body.classList.contains('scrubbing') || this.root.offsetParent === null) return;
      if (!this.queue.length) this.queue = [...this.visible];
      while (this.queue.length && performance.now() - start < BUDGET_MS) {
        const id = this.queue.shift();
        const c = this.cards.get(id);
        if (!c || id === this.hover || !this.visible.has(id)) continue;
        if (now - c.last < 1000 / IDLE_FPS) continue;
        c.last = now;
        this.drawThumb(id, t);
      }
    }

    focusSearch() {
      this.search.focus();
      this.search.select();
    }
  }

  Studio.Gallery = Gallery;
})(window.TM);
