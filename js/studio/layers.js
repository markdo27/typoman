/* TYPOMAN studio — layers panel.
 *
 *   new TM.Studio.LayersPanel(store, root)
 *
 * The list shows the front-most layer on top (scene.layers is drawn bottom → top).
 * Mouse: click to select, double-click the name to rename, drag a row to reorder, eye to hide.
 * Keyboard (focus a row): ↑/↓ select · Alt+↑/↓ move · Enter or F2 rename · H hide/show ·
 * Mod+D duplicate · Delete remove. The toolbar below offers the same actions as buttons.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const h = Studio.h;
  const UI = Studio.ui;

  class LayersPanel {
    constructor(store, root) {
      this.store = store;
      this.root = root;
      this.sig = '';
      this.renaming = -1;
      this.dragging = null;
      this.build();
      store.on('change', () => this.render());
      store.on('select', () => this.render(true));
      TM.fonts.onChange(() => { this.sig = ''; this.render(); });
      this.render(true);
    }

    build() {
      const store = this.store;
      this.count = h('span', { class: 'count', 'aria-live': 'polite' });
      this.addBtn = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Add text layer', 'data-tip': 'Add text layer', 'data-kbd': 'N', onclick: () => this.add() }, UI.icon('plus'));
      this.list = h('div', { class: 'layer-list', role: 'listbox', 'aria-label': 'Layers', 'aria-describedby': 'layersHelp' });
      this.list.addEventListener('keydown', (e) => this.onKey(e));
      const tool = (icon, label, kbd, run) => h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': label, 'data-tip': label, 'data-kbd': kbd || null, onclick: run }, UI.icon(icon));
      this.tools = {
        vis: tool('eye', 'Hide layer', 'H', () => this.toggleVisible(store.selected)),
        up: tool('arrowUp', 'Bring forward', UI.keys('Alt+↑'), () => this.move(store.selected, 1)),
        down: tool('arrowDown', 'Send backward', UI.keys('Alt+↓'), () => this.move(store.selected, -1)),
        dup: tool('duplicate', 'Duplicate layer', UI.keys('Mod+D'), () => this.duplicate()),
        del: tool('trash', 'Delete layer', 'Del', () => this.remove(store.selected)),
      };
      const help = h('p', { id: 'layersHelp', class: 'sr-only' }, 'Arrow keys select. Alt with arrow keys moves the layer. Enter renames. H hides. Delete removes.');
      this.root.append(
        h('div', { class: 'panel-head' }, h('h2', { id: 'layersTitle' }, 'Layers'), this.count, h('span', { class: 'grow' }), this.addBtn),
        this.list,
        h('div', { class: 'layer-tools', role: 'toolbar', 'aria-label': 'Layer actions' }, this.tools.vis, this.tools.up, this.tools.down, h('span', { class: 'grow' }), this.tools.dup, this.tools.del),
        help,
      );
    }

    /** Visual row order: front-most first. */
    order() {
      const n = this.store.scene.layers.length;
      return Array.from({ length: n }, (_, r) => n - 1 - r);
    }

    signature() {
      const s = this.store.scene;
      return [this.store.selected, s.bg.color, s.bg.type, ...s.layers.map((l) => [l.id, l.name, l.text, l.visible, l.preset, l.font.family, l.fill.type, l.fill.color, l.fill.palette[0]].join('\u0001'))].join('\u0002');
    }

    render(force) {
      if (this.renaming >= 0 || this.dragging) return;
      const sig = this.signature();
      if (!force && sig === this.sig) return;
      this.sig = sig;
      const store = this.store, s = store.scene;
      const n = s.layers.length, max = TM.Scene.MAX_LAYERS;
      const hadFocus = this.list.contains(document.activeElement);
      this.count.textContent = n + ' / ' + max;
      this.addBtn.disabled = n >= max;
      this.addBtn.setAttribute('data-tip', n >= max ? 'Up to ' + max + ' layers' : 'Add text layer');
      const rows = this.order().map((i) => this.row(i));
      this.list.replaceChildren(...rows);
      const l = store.layer;
      this.tools.vis.replaceChildren(UI.icon(l.visible === false ? 'eyeOff' : 'eye'));
      const visLabel = l.visible === false ? 'Show layer' : 'Hide layer';
      this.tools.vis.setAttribute('aria-label', visLabel);
      this.tools.vis.setAttribute('data-tip', visLabel);
      this.tools.up.disabled = store.selected >= n - 1;
      this.tools.down.disabled = store.selected <= 0;
      this.tools.dup.disabled = n >= max;
      this.tools.del.disabled = n <= 1;
      this.tools.del.setAttribute('data-tip', n <= 1 ? 'A scene needs at least one layer' : 'Delete layer');
      if (hadFocus) this.focusRow(store.selected);
    }

    row(i) {
      const store = this.store, s = store.scene, layer = s.layers[i];
      const sel = i === store.selected;
      const preset = TM.getPreset(layer.preset);
      const name = Studio.layerName(layer);
      const empty = !String(layer.text || '').trim();
      const chip = h('span', { class: 'layer-chip', 'aria-hidden': 'true' }, (String(layer.text || '').trim()[0] || 'T').toUpperCase());
      chip.style.fontFamily = TM.fonts.cssFamily(layer.font.family);
      chip.style.color = layer.fill.type === 'palette' ? layer.fill.palette[0] : layer.fill.color;
      if (s.bg.type !== 'transparent') chip.style.background = s.bg.color; else chip.classList.add('transparent');
      const eye = h('button', { type: 'button', class: 'eye', tabindex: '-1', 'aria-hidden': 'true', 'data-tip': layer.visible === false ? 'Show' : 'Hide' }, UI.icon(layer.visible === false ? 'eyeOff' : 'eye'));
      eye.addEventListener('click', (e) => { e.stopPropagation(); this.toggleVisible(i); });
      const nameEl = h('span', { class: 'layer-name' + (empty ? ' empty' : '') }, name);
      const row = h('div', {
        class: 'layer-row' + (sel ? ' on' : '') + (layer.visible === false ? ' hidden-layer' : ''),
        role: 'option',
        'aria-selected': sel ? 'true' : 'false',
        tabindex: sel ? '0' : '-1',
        'data-i': i,
        'aria-label': name + ', ' + (preset ? preset.name : '') + (layer.visible === false ? ', hidden' : ''),
      },
      h('span', { class: 'grip', 'aria-hidden': 'true' }, UI.icon('grip')),
      chip,
      h('span', { class: 'layer-text' }, nameEl, h('span', { class: 'layer-meta' }, (preset ? preset.name : layer.preset) + ' · ' + layer.font.family)),
      eye);
      row.addEventListener('pointerdown', (e) => this.onPointerDown(e, row, i));
      row.addEventListener('dblclick', (e) => { if (!e.target.closest('.eye')) this.rename(i); });
      return row;
    }

    focusRow(i) {
      const row = this.list.querySelector(`[data-i="${i}"]`);
      if (row) row.focus({ preventScroll: false });
    }

    // ── actions ──
    add() {
      if (!this.store.canAddLayer) { Studio.toast('Up to ' + TM.Scene.MAX_LAYERS + ' layers per scene', 'info'); return; }
      this.store.addLayer();
      UI.announce('Layer added');
      if (Studio.app) Studio.app.focusText(true);
    }

    duplicate() {
      if (!this.store.canAddLayer) { Studio.toast('Up to ' + TM.Scene.MAX_LAYERS + ' layers per scene', 'info'); return; }
      this.store.duplicateLayer(this.store.selected);
      UI.announce('Layer duplicated');
      this.focusRow(this.store.selected);
    }

    remove(i) {
      const store = this.store;
      const layer = store.scene.layers[i];
      if (!layer || store.scene.layers.length <= 1) return;
      const name = Studio.layerName(layer);
      if (store.removeLayer(i)) {
        Studio.toast('Deleted “' + name + '”', 'info', 4200, { label: 'Undo', run: () => store.undo() });
        UI.announce('Layer deleted');
        this.focusRow(store.selected);
      }
    }

    move(i, dir) {
      this.store.moveLayer(i, i + dir);
      UI.announce(dir > 0 ? 'Moved forward' : 'Moved backward');
      this.focusRow(this.store.selected);
    }

    toggleVisible(i) {
      const l = this.store.scene.layers[i];
      if (!l) return;
      this.store.setLayerVisible(i, l.visible === false);
      UI.announce(l.visible === false ? 'Layer shown' : 'Layer hidden');
    }

    rename(i) {
      const row = this.list.querySelector(`[data-i="${i}"]`);
      if (!row) return;
      const layer = this.store.scene.layers[i];
      const nameEl = row.querySelector('.layer-name');
      const input = h('input', { type: 'text', class: 'layer-rename', value: Studio.layerName(layer), maxlength: 40, 'aria-label': 'Layer name', spellcheck: 'false' });
      this.renaming = i;
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      let done = false;
      const finish = (save) => {
        if (done) return;
        done = true;
        this.renaming = -1;
        const v = input.value.trim();
        if (save && v && v !== Studio.layerName(layer)) this.store.renameLayer(i, v);
        this.render(true);
        this.focusRow(i);
      };
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    // ── keyboard ──
    onKey(e) {
      if (e.target.classList.contains('layer-rename')) return;
      const store = this.store;
      const i = store.selected, n = store.scene.layers.length;
      const mod = e.metaKey || e.ctrlKey;
      let handled = true;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const dir = e.key === 'ArrowUp' ? 1 : -1; // visually up = toward the front
        if (e.altKey) this.move(i, dir);
        else { store.select(i + dir); this.focusRow(store.selected); }
      } else if (e.key === 'Home') { store.select(n - 1); this.focusRow(store.selected); }
      else if (e.key === 'End') { store.select(0); this.focusRow(store.selected); }
      else if (e.key === 'Enter' || e.key === 'F2') this.rename(i);
      else if (e.key === 'Delete' || e.key === 'Backspace') this.remove(i);
      else if (mod && e.key.toLowerCase() === 'd') this.duplicate();
      else if (!mod && (e.key === 'h' || e.key === 'H')) this.toggleVisible(i);
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    }

    // ── drag to reorder ──
    onPointerDown(e, row, i) {
      if (e.button !== 0 || e.target.closest('.eye, input')) return;
      const startY = e.clientY;
      let moved = false;
      const rows = [...this.list.children];
      const rects = rows.map((r) => r.getBoundingClientRect());
      const fromRow = rows.indexOf(row);
      let toRow = fromRow;
      const move = (ev) => {
        const dy = ev.clientY - startY;
        if (!moved && Math.abs(dy) < 5) return;
        if (!moved) {
          moved = true;
          this.dragging = { i };
          row.setPointerCapture(ev.pointerId);
          row.classList.add('dragging');
          this.list.classList.add('reordering');
        }
        row.style.transform = `translateY(${dy}px)`;
        const y = rects[fromRow].top + rects[fromRow].height / 2 + dy;
        toRow = rects.findIndex((r) => y < r.top + r.height / 2);
        if (toRow < 0) toRow = rows.length - 1;
        if (toRow > fromRow) toRow = Math.max(fromRow, toRow - (y < rects[toRow].top + rects[toRow].height / 2 ? 1 : 0));
        rows.forEach((r, k) => {
          if (r === row) return;
          const shift = fromRow < toRow && k > fromRow && k <= toRow ? -rects[fromRow].height : fromRow > toRow && k < fromRow && k >= toRow ? rects[fromRow].height : 0;
          r.style.transform = shift ? `translateY(${shift}px)` : '';
        });
      };
      const up = () => {
        row.removeEventListener('pointermove', move);
        row.removeEventListener('pointerup', up);
        row.removeEventListener('pointercancel', up);
        if (!moved) {
          this.store.select(i);
          row.focus({ preventScroll: true });
          return;
        }
        rows.forEach((r) => { r.style.transform = ''; });
        row.classList.remove('dragging');
        this.list.classList.remove('reordering');
        this.dragging = null;
        const n = this.store.scene.layers.length;
        const to = n - 1 - toRow; // rows are front-first
        if (to !== i) this.store.moveLayer(i, to); else this.render(true);
        this.focusRow(this.store.selected);
      };
      row.addEventListener('pointermove', move);
      row.addEventListener('pointerup', up);
      row.addEventListener('pointercancel', up);
    }
  }

  Studio.LayersPanel = LayersPanel;
})(window.TM);
