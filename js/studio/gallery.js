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
      this.view = UI.storage.get(VIEW_KEY, 'presets') === 'inspiration' ? 'inspiration' : 'presets';
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
      [['presets', 'Presets'], ['inspiration', 'Inspiration']].forEach(([v, label]) => {
        const b = h('button', { type: 'button', role: 'tab', 'data-view': v }, label);
        b.addEventListener('click', () => this.setView(v));
        b.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          e.stopPropagation();
          const next = v === 'presets' ? 'inspiration' : 'presets';
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
      const insp = this.view === 'inspiration';
      const all = looks.all();
      this.tabs.querySelectorAll('[role="tab"]').forEach((b) => {
        const on = b.dataset.view === this.view;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        if (b.dataset.view === 'inspiration') b.replaceChildren(...['Inspiration', all.length ? h('span', { class: 'chip-n' }, String(all.length)) : null].filter(Boolean));
      });
      this.search.placeholder = insp ? 'Search looks' : 'Search presets';
      const pool = insp ? all.map((e) => TM.presets[e.presetId].category) : ids.map((id) => TM.presets[id].category);
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
      if (insp) {
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
      if (count) count.textContent = insp ? String(all.length) : shown === ids.length ? String(ids.length) : shown + ' / ' + ids.length;
      const title = document.getElementById('presetsTitle');
      if (title) title.textContent = insp ? 'Inspiration' : 'Presets';
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
      const mine = this.view === 'inspiration' ? [] : looks.of(cur).map((look, index) => ({ presetId: cur, index, look }));
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

    apply(id) {
      const p = TM.presets[id];
      if (!p) return;
      if (this.store.layer.preset === id) { UI.announce(p.name + ' is already applied'); return; }
      this.store.setPreset(id);
      UI.announce(p.name + ' applied');
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
      this.thumb.setScene(scene);
      try {
        const time = t != null ? t : this.bestTime(entry, scene);
        this.thumb.render(time);
      } catch (e) { return; }
      const ctx = entry.cv.getContext('2d');
      ctx.clearRect(0, 0, TW, TH);
      ctx.drawImage(this.thumbCanvas, 0, 0);
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
