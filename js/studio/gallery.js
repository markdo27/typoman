/* TYPOMAN studio — preset gallery.
 *
 *   new TM.Studio.Gallery(store, root)
 *
 * Search, category chips and live thumbnails that render *your* text and style with each look.
 * The hovered / focused card animates at full rate; the rest drift gently while the gallery is
 * idle and on screen. Thumbnails share one renderer and a per-frame time budget, pause when
 * scrolled away or when the tab is hidden, and stay still under prefers-reduced-motion.
 * Keyboard: arrow keys move between cards, Enter / Space applies, "/" focuses the search box.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const h = Studio.h;
  const UI = Studio.ui;
  const TW = 320, TH = 180;
  const IDLE_FPS = 12, HOVER_FPS = 30;
  const BUDGET_MS = 3.5;

  class Gallery {
    constructor(store, root) {
      this.store = store;
      this.root = root;
      this.cards = new Map();
      this.visible = new Set();
      this.thumbCanvas = document.createElement('canvas');
      this.thumb = new TM.Renderer(this.thumbCanvas, { quality: 'preview' });
      this.thumb.resize(TW, TH);
      this.hover = null;
      this.filter = 'All';
      this.query = '';
      this.scenes = new Map();
      this.queue = [];
      this.busyUntil = 0;
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
        if (!d || (d.reason !== 'preset' && d.reason !== 'font-preview')) this.scheduleThumbs();
      });
      store.on('select', () => { this.markActive(); this.scheduleThumbs(80); });
      this.scheduleThumbs(50);
    }

    buildShell() {
      this.search = h('input', { type: 'search', class: 'search', placeholder: 'Search presets', 'aria-label': 'Search presets', autocomplete: 'off', spellcheck: 'false', 'data-kbd': '/' });
      this.search.addEventListener('input', () => { this.query = this.search.value.trim().toLowerCase(); this.build(); });
      this.search.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.focusCard(0); }
        if (e.key === 'Escape' && this.search.value) { e.stopPropagation(); this.search.value = ''; this.query = ''; this.build(); }
      });
      this.chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Preset categories' });
      this.grid = h('div', { class: 'cards', role: 'listbox', 'aria-label': 'Presets', 'aria-orientation': 'horizontal' });
      this.empty = h('div', { class: 'gallery-empty', hidden: true });
      this.grid.addEventListener('keydown', (e) => this.onKey(e));
      this.root.append(h('div', { class: 'gallery-top' }, h('div', { class: 'search-wrap' }, UI.icon('search'), this.search, h('kbd', { class: 'search-kbd', 'aria-hidden': 'true' }, '/')), this.chips), this.grid, this.empty);
      // Pause idle animation briefly while the user scrolls the list.
      this.root.addEventListener('scroll', () => { this.busyUntil = performance.now() + 250; }, { passive: true });
    }

    matches(p) {
      if (this.filter !== 'All' && p.category !== this.filter) return false;
      if (!this.query) return true;
      const q = this.query;
      return p.name.toLowerCase().includes(q) || p.id.includes(q) || (p.category || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || (p.usesPath && 'path'.startsWith(q));
    }

    build() {
      const ids = TM.presetOrder.slice();
      const cats = TM.CATEGORIES.filter((c) => ids.some((id) => TM.presets[id].category === c));
      const extra = [...new Set(ids.map((id) => TM.presets[id].category))].filter((c) => !cats.includes(c));
      const all = ['All'].concat(cats, extra);
      if (!all.includes(this.filter)) this.filter = 'All';
      this.chips.replaceChildren(...all.map((c) => {
        const n = c === 'All' ? ids.length : ids.filter((id) => TM.presets[id].category === c).length;
        return h('button', {
          type: 'button', class: 'chip' + (c === this.filter ? ' on' : ''), 'aria-pressed': c === this.filter ? 'true' : 'false',
          onclick: () => { this.filter = c; this.build(); },
        }, c, h('span', { class: 'chip-n' }, String(n)));
      }));

      if (this.io) this.cards.forEach(({ card }) => this.io.unobserve(card));
      this.cards.clear();
      this.visible.clear();
      const shown = ids.filter((id) => this.matches(TM.presets[id]));
      const cur = this.store.layer.preset;
      shown.forEach((id, i) => {
        const p = TM.presets[id];
        const cv = h('canvas', { width: TW, height: TH, 'aria-hidden': 'true' });
        const card = h('div', {
          class: 'card',
          role: 'option',
          tabindex: id === cur || (i === 0 && !shown.includes(cur)) ? '0' : '-1',
          'data-id': id,
          'aria-label': p.name + ', ' + p.category + (p.usesPath ? ', follows a path' : '') + (p.description ? '. ' + p.description : ''),
          'data-tip': p.description || null,
        },
        h('div', { class: 'card-thumb' }, cv, h('span', { class: 'card-active', 'aria-hidden': 'true' }, UI.icon('check'), 'Active'), p.usesPath ? h('span', { class: 'card-path', 'aria-hidden': 'true' }, UI.icon('pen')) : null),
        h('span', { class: 'card-name' }, p.name),
        h('span', { class: 'card-cat' }, p.category));
        card.addEventListener('click', () => this.apply(id));
        card.addEventListener('pointerenter', () => { this.hover = id; });
        card.addEventListener('pointerleave', () => { if (this.hover === id) { this.hover = null; this.drawThumb(id); } });
        card.addEventListener('focus', () => { this.hover = id; this.setRoving(id); });
        card.addEventListener('blur', () => { if (this.hover === id) { this.hover = null; this.drawThumb(id); } });
        this.cards.set(id, { card, cv, last: 0 });
        this.grid.append(card);
        if (this.io) this.io.observe(card);
        else this.visible.add(id);
      });
      this.grid.replaceChildren(...[...this.cards.values()].map((c) => c.card));
      this.empty.hidden = shown.length > 0;
      if (!shown.length) {
        const clear = h('button', { type: 'button', class: 'btn sm', onclick: () => { this.search.value = ''; this.query = ''; this.filter = 'All'; this.build(); this.search.focus(); } }, 'Clear search');
        this.empty.replaceChildren(h('p', null, 'No presets match ', h('strong', null, '“' + (this.query || this.filter) + '”'), '.'), clear);
      }
      const count = document.getElementById('presetCount');
      if (count) count.textContent = shown.length === ids.length ? String(ids.length) : shown.length + ' / ' + ids.length;
      this.markActive();
      this.scheduleThumbs(0);
    }

    apply(id) {
      const p = TM.presets[id];
      if (!p) return;
      if (this.store.layer.preset === id) { UI.announce(p.name + ' is already applied'); return; }
      this.store.setPreset(id);
      UI.announce(p.name + ' applied');
      if (Studio.app && Studio.app.stage) Studio.app.stage.flash();
    }

    setRoving(id) {
      this.cards.forEach(({ card }, cid) => { card.tabIndex = cid === id ? 0 : -1; });
    }

    focusCard(i) {
      const list = [...this.cards.values()];
      if (!list.length) return;
      const c = list[Math.max(0, Math.min(list.length - 1, i))];
      c.card.focus();
      c.card.scrollIntoView({ block: 'nearest' });
    }

    onKey(e) {
      const list = [...this.cards.values()].map((c) => c.card);
      const i = list.indexOf(document.activeElement);
      if (i < 0) return;
      // Columns from layout: count cards sharing the first card's top.
      const top = list[0].offsetTop;
      const cols = Math.max(1, list.filter((c) => c.offsetTop === top).length);
      let j = null;
      switch (e.key) {
        case 'ArrowRight': j = i + 1; break;
        case 'ArrowLeft': j = i - 1; break;
        case 'ArrowDown': j = i + cols; break;
        case 'ArrowUp': if (i - cols < 0) { e.preventDefault(); this.search.focus(); return; } j = i - cols; break;
        case 'Home': j = 0; break;
        case 'End': j = list.length - 1; break;
        case 'Enter': case ' ': e.preventDefault(); this.apply(list[i].dataset.id); return;
        default: return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (j >= 0 && j < list.length) this.focusCard(j);
    }

    markActive() {
      const cur = this.store.layer.preset;
      this.cards.forEach(({ card }, id) => {
        const on = id === cur;
        card.classList.toggle('on', on);
        card.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (this.cards.has(cur) && !this.root.contains(document.activeElement)) this.setRoving(cur);
    }

    /** Thumbnail scene: the selected layer alone, with this look applied, at 16:9. */
    sceneFor(id) {
      const s = TM.Scene.clone(this.store.scene);
      const layer = s.layers[Math.min(this.store.selected, s.layers.length - 1)];
      s.layers = [layer];
      layer.visible = true;
      if (!String(layer.text || '').trim()) layer.text = 'Aa';
      if (layer.preset !== id) {
        layer.preset = id;
        layer.params = TM.presetDefaults(id);
        const p = TM.presets[id];
        if (p.usesPath && (!layer.path || layer.path.preset)) layer.path = TM.Path.preset(p.path || 'wave', TW / TH);
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
        this.cards.forEach((c) => { c.last = 0; });
        this.visible.forEach((id) => this.drawThumb(id));
        if (!this.io) this.cards.forEach((_, id) => this.drawThumb(id));
      }, ms);
    }

    drawThumb(id, t) {
      const entry = this.cards.get(id);
      if (!entry) return;
      let scene = this.scenes.get(id);
      if (!scene) { scene = this.sceneFor(id); this.scenes.set(id, scene); }
      this.thumb.setScene(scene);
      try { this.thumb.render(t != null ? t : scene.duration * 0.42); } catch (e) { return; }
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
      if (UI.reducedMotion() || now < this.busyUntil || document.body.classList.contains('scrubbing') || this.root.offsetParent === null) return;
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
