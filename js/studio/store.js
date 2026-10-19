/* TYPOMAN studio — state store: scene + selection + playback, undo/redo, autosave.
 *
 *   store.scene / store.layer          current (normalised) scene and selected layer
 *   store.update(fn, { coalesce })      mutate a draft: fn(scene, layer); history + normalise + emit
 *   store.updateLayer(fn, opts)         same, scoped to the selected layer
 *   store.on('change' | 'select' | 'ui' | 'history' | 'view' | 'save', fn)
 *   store.ui / store.setUI(patch)       transient view state (playing, time, path editing…)
 *
 * Layer helpers (all undoable): addLayer(), duplicateLayer(i), removeLayer(i), moveLayer(from, to),
 * setLayerVisible(i, v), renameLayer(i, name). History entries carry a label ("Font", "Add layer")
 * so undo/redo can say what they will do: store.undoLabel / store.redoLabel.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const STORAGE_KEY = 'typoman.v4.scene';
  const HISTORY_MAX = 150;

  function safeStorage(fn, fallback) {
    try { return fn(window.localStorage); } catch (e) { return fallback; }
  }

  // Human labels for history entries, keyed by update reason (property path or action).
  const LABELS = {
    text: 'Text', font: 'Font', 'font.weight': 'Weight', 'type.size': 'Size', 'type.tracking': 'Tracking',
    'type.leading': 'Leading', 'type.slant': 'Slant', 'type.align': 'Alignment', 'type.case': 'Case',
    preset: 'Preset', size: 'Format', palette: 'Palette', remix: 'Remix', path: 'Path', anchor: 'Move',
    'fill.type': 'Fill', 'fill.color': 'Colour', 'fill.color2': 'Colour 2', 'fill.angle': 'Gradient angle',
    'stroke.mode': 'Stroke', 'stroke.width': 'Stroke width', 'stroke.color': 'Stroke colour',
    'bg.type': 'Background', 'bg.color': 'Background', 'bg.color2': 'Background 2', 'bg.angle': 'Background angle',
    duration: 'Loop length', fps: 'Frame rate', seed: 'Seed', name: 'Rename', replace: 'Replace project',
    brand: 'Brand kit', layer: 'Layers',
  };
  function labelFor(reason) {
    if (!reason) return 'Edit';
    if (LABELS[reason]) return LABELS[reason];
    const key = String(reason).split('.').pop();
    const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  class Store {
    constructor(scene) {
      this.scene = TM.Scene.normalize(scene);
      this.selected = 0;
      this.past = [];
      this.future = [];
      this.pastLabels = [];
      this.futureLabels = [];
      this.listeners = {};
      this.paramMemory = {};
      this._coalesceKey = null;
      this._coalesceAt = 0;
      this._saveTimer = 0;
      this.saveState = { status: 'saved', at: Date.now() };
      this.ui = {
        playing: true,
        time: 0,
        editPath: false,
        pathTarget: 'a', // which path the editor manipulates: 'a' (main) or 'b' (morph target)
        guides: false,
        zoom: 'fit', // 'fit' or CSS px per output px
        clean: false, // clean preview: all studio chrome hidden
      };
    }

    get layer() {
      return this.scene.layers[Math.min(this.selected, this.scene.layers.length - 1)];
    }

    get preset() {
      return TM.getPreset(this.layer.preset);
    }

    on(type, fn) {
      (this.listeners[type] || (this.listeners[type] = new Set())).add(fn);
      return () => this.listeners[type].delete(fn);
    }

    emit(type, detail) {
      (this.listeners[type] || []).forEach((fn) => {
        try { fn(detail, this); } catch (e) { console.error(e); }
      });
    }

    _snapshot() {
      return JSON.stringify({ scene: this.scene, selected: this.selected });
    }

    _pushHistory(coalesce, label) {
      const now = Date.now();
      if (coalesce && coalesce === this._coalesceKey && now - this._coalesceAt < 800) {
        this._coalesceAt = now;
        return;
      }
      this._coalesceKey = coalesce || null;
      this._coalesceAt = now;
      this.past.push(this._snapshot());
      this.pastLabels.push(label || 'Edit');
      if (this.past.length > HISTORY_MAX) { this.past.shift(); this.pastLabels.shift(); }
      this.future.length = 0;
      this.futureLabels.length = 0;
    }

    /** Mutate the scene. opts: { coalesce: key (merge rapid edits), history: false, reason, label } */
    update(fn, opts = {}) {
      if (opts.history !== false) this._pushHistory(opts.coalesce, opts.label || labelFor(opts.reason));
      const draft = TM.Scene.clone(this.scene);
      const layer = draft.layers[Math.min(this.selected, draft.layers.length - 1)];
      fn(draft, layer);
      this.scene = TM.Scene.normalize(draft);
      if (this.selected >= this.scene.layers.length) this.selected = this.scene.layers.length - 1;
      this.emit('change', { reason: opts.reason || 'edit' });
      this.emit('history');
      this._scheduleSave();
    }

    updateLayer(fn, opts) {
      this.update((scene, layer) => fn(layer, scene), opts);
    }

    /** Switch the selected layer's preset, remembering each preset's params. */
    setPreset(id) {
      const next = TM.getPreset(id);
      if (!next || this.layer.preset === id) return;
      this.paramMemory[this.layer.id + ':' + this.layer.preset] = this.layer.params;
      const remembered = this.paramMemory[this.layer.id + ':' + id];
      const aspect = this.scene.size.w / this.scene.size.h;
      this.updateLayer((layer) => {
        layer.preset = id;
        layer.params = remembered ? JSON.parse(JSON.stringify(remembered)) : TM.presetDefaults(id);
        // Swap in this preset's favourite path unless the user has hand-edited the current one.
        if (next.usesPath && (!layer.path || layer.path.preset)) layer.path = TM.Path.preset(next.path || 'wave', aspect);
      }, { reason: 'preset', label: 'Preset: ' + next.name });
    }

    /** Change output size; un-edited preset paths are regenerated for the new aspect. */
    setSize(w, h) {
      this.update((scene) => {
        const from = scene.size.w / scene.size.h;
        scene.size = { w, h };
        const aspect = w / h;
        // Preset shapes are rebuilt for the new frame; hand-edited paths are re-fitted, not stretched.
        const refit = (def) => (def.preset ? TM.Path.preset(def.preset, aspect) : TM.Path.reaspect ? TM.Path.reaspect(def, from, aspect) : def);
        scene.layers.forEach((l) => {
          if (l.path) l.path = refit(l.path);
          if (l.pathMorph && l.pathMorph.target) l.pathMorph.target = refit(l.pathMorph.target);
        });
      }, { reason: 'size' });
    }

    select(i) {
      const n = this.scene.layers.length;
      const next = Math.max(0, Math.min(n - 1, i | 0));
      if (next === this.selected) return;
      this.selected = next;
      this.emit('select', next);
    }

    /** Select index i and always notify (the layer at an index can change after add/remove/move). */
    _reselect(i) {
      this.selected = Math.max(0, Math.min(this.scene.layers.length - 1, i | 0));
      this.emit('select', this.selected);
    }

    replace(scene, opts = {}) {
      if (opts.history !== false) this._pushHistory(null, opts.label || 'Replace project');
      this.scene = TM.Scene.normalize(scene);
      this.selected = 0;
      this.emit('change', { reason: 'replace' });
      this.emit('select', 0);
      this.emit('history');
      this._scheduleSave();
    }

    _restore(snapshot) {
      const s = JSON.parse(snapshot);
      this.scene = TM.Scene.normalize(s.scene);
      const prevSel = this.selected;
      this.selected = Math.min(s.selected || 0, this.scene.layers.length - 1);
      this._coalesceKey = null;
      this.emit('change', { reason: 'history' });
      if (prevSel !== this.selected) this.emit('select', this.selected);
      this.emit('history');
      this._scheduleSave();
    }

    get canUndo() { return this.past.length > 0; }
    get canRedo() { return this.future.length > 0; }
    get undoLabel() { return this.pastLabels[this.pastLabels.length - 1] || ''; }
    get redoLabel() { return this.futureLabels[this.futureLabels.length - 1] || ''; }

    undo() {
      if (!this.past.length) return;
      this.future.push(this._snapshot());
      this.futureLabels.push(this.pastLabels.pop() || 'Edit');
      this._restore(this.past.pop());
    }

    redo() {
      if (!this.future.length) return;
      this.past.push(this._snapshot());
      this.pastLabels.push(this.futureLabels.pop() || 'Edit');
      this._restore(this.future.pop());
    }

    setUI(patch) {
      Object.assign(this.ui, patch);
      this.emit('ui', patch);
    }

    // ───────────────────────────── layers ─────────────────────────────
    _newId(scene) {
      const used = new Set(scene.layers.map((l) => l.id));
      for (let i = scene.layers.length + 1; i < 999; i++) if (!used.has('l' + i)) return 'l' + i;
      return 'l' + Date.now().toString(36).slice(-6);
    }

    get canAddLayer() { return this.scene.layers.length < TM.Scene.MAX_LAYERS; }

    /** Add a text layer above the selection. It inherits the selected layer's type style. */
    addLayer(overrides) {
      if (!this.canAddLayer) return -1;
      const at = this.selected + 1;
      const aspect = this.scene.size.w / this.scene.size.h;
      this.update((scene) => {
        const src = scene.layers[Math.min(this.selected, scene.layers.length - 1)];
        const layer = TM.Scene.defaultLayer();
        layer.id = this._newId(scene);
        layer.text = 'NEW LAYER';
        layer.font = { ...src.font };
        layer.fill = JSON.parse(JSON.stringify(src.fill));
        layer.stroke = { ...src.stroke };
        // A clean reveal reads well as a second line; fall back to any non-path look.
        const nonPath = TM.presetOrder.filter((id) => !TM.presets[id].usesPath);
        layer.preset = TM.presets.rise ? 'rise' : nonPath[0] || src.preset;
        layer.params = TM.presetDefaults(layer.preset);
        const p = TM.getPreset(layer.preset);
        layer.path = p && p.usesPath ? TM.Path.preset(p.path || 'wave', aspect) : null;
        layer.type.size = Math.max(0.05, Math.min(0.1, src.type.size * 0.5));
        layer.anchor = { x: 0.5, y: 0.78 };
        if (overrides) TM.Scene.merge(layer, overrides);
        scene.layers.splice(at, 0, layer);
      }, { reason: 'layer', label: 'Add layer' });
      this._reselect(at);
      return at;
    }

    duplicateLayer(i = this.selected) {
      if (!this.canAddLayer) return -1;
      const at = i + 1;
      this.update((scene) => {
        const src = scene.layers[i];
        if (!src) return;
        const copy = JSON.parse(JSON.stringify(src));
        copy.id = this._newId(scene);
        if (src.name && !/^(Text|Layer \d+)$/.test(src.name)) copy.name = (src.name + ' copy').slice(0, 40);
        const p = TM.getPreset(src.preset);
        // Nudge non-path copies so the duplicate is visible; path copies stay on their path.
        if (p && !p.usesPath) copy.anchor = { x: src.anchor.x + 0.02, y: src.anchor.y + 0.03 };
        scene.layers.splice(at, 0, copy);
      }, { reason: 'layer', label: 'Duplicate layer' });
      this._reselect(at);
      return at;
    }

    removeLayer(i = this.selected) {
      if (this.scene.layers.length <= 1 || !this.scene.layers[i]) return false;
      this.update((scene) => { scene.layers.splice(i, 1); }, { reason: 'layer', label: 'Delete layer' });
      this._reselect(Math.min(i, this.scene.layers.length - 1));
      return true;
    }

    /** Move layer `from` to index `to` (0 = bottom of the stack). Selection follows it. */
    moveLayer(from, to) {
      const n = this.scene.layers.length;
      to = Math.max(0, Math.min(n - 1, to));
      if (from === to || !this.scene.layers[from]) return;
      this.update((scene) => {
        const [l] = scene.layers.splice(from, 1);
        scene.layers.splice(to, 0, l);
      }, { reason: 'layer', label: 'Reorder layers' });
      this._reselect(to);
    }

    setLayerVisible(i, visible) {
      if (!this.scene.layers[i]) return;
      this.update((scene) => { scene.layers[i].visible = !!visible; }, { reason: 'layer', label: visible ? 'Show layer' : 'Hide layer' });
    }

    renameLayer(i, name) {
      if (!this.scene.layers[i]) return;
      const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Text';
      if (clean === this.scene.layers[i].name) return;
      this.update((scene) => { scene.layers[i].name = clean; }, { reason: 'layer', label: 'Rename layer' });
    }

    // ───────────────────────────── autosave ─────────────────────────────
    _scheduleSave() {
      clearTimeout(this._saveTimer);
      if (this.saveState.status !== 'pending') {
        this.saveState = { status: 'pending', at: Date.now() };
        this.emit('save', this.saveState);
      }
      this._saveTimer = setTimeout(() => this.save(), 400);
    }

    save() {
      clearTimeout(this._saveTimer);
      const ok = safeStorage((ls) => { ls.setItem(STORAGE_KEY, JSON.stringify(this.scene)); return true; }, false);
      this.saveState = { status: ok ? 'saved' : 'error', at: Date.now() };
      this.emit('save', this.saveState);
      return ok;
    }

    static loadSaved() {
      const raw = safeStorage((ls) => ls.getItem(STORAGE_KEY), null);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    }
  }

  Store.labelFor = labelFor;
  Studio.Store = Store;
})(window.TM);
