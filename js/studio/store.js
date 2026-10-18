/* TYPOMAN studio — state store: scene + selection + playback, undo/redo, autosave.
 *
 *   store.scene / store.layer          current (normalised) scene and selected layer
 *   store.update(fn, { coalesce })      mutate a draft: fn(scene, layer); history + normalise + emit
 *   store.updateLayer(fn, opts)         same, scoped to the selected layer
 *   store.on('change' | 'select' | 'ui' | 'history', fn)
 *   store.ui / store.setUI(patch)       transient view state (playing, time, path editing…)
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const STORAGE_KEY = 'typoman.v4.scene';
  const HISTORY_MAX = 150;

  function safeStorage(fn, fallback) {
    try { return fn(window.localStorage); } catch (e) { return fallback; }
  }

  class Store {
    constructor(scene) {
      this.scene = TM.Scene.normalize(scene);
      this.selected = 0;
      this.past = [];
      this.future = [];
      this.listeners = {};
      this.paramMemory = {};
      this._coalesceKey = null;
      this._coalesceAt = 0;
      this._saveTimer = 0;
      this.ui = {
        playing: true,
        time: 0,
        editPath: false,
        pathTarget: 'a', // which path the editor manipulates: 'a' (main) or 'b' (morph target)
        guides: false,
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

    _pushHistory(coalesce) {
      const now = Date.now();
      if (coalesce && coalesce === this._coalesceKey && now - this._coalesceAt < 800) {
        this._coalesceAt = now;
        return;
      }
      this._coalesceKey = coalesce || null;
      this._coalesceAt = now;
      this.past.push(this._snapshot());
      if (this.past.length > HISTORY_MAX) this.past.shift();
      this.future.length = 0;
    }

    /** Mutate the scene. opts: { coalesce: key (merge rapid edits), history: false, reason } */
    update(fn, opts = {}) {
      if (opts.history !== false) this._pushHistory(opts.coalesce);
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
      }, { reason: 'preset' });
    }

    /** Change output size; un-edited preset paths are regenerated for the new aspect. */
    setSize(w, h) {
      this.update((scene) => {
        scene.size = { w, h };
        const aspect = w / h;
        scene.layers.forEach((l) => {
          if (l.path && l.path.preset) l.path = TM.Path.preset(l.path.preset, aspect);
          if (l.pathMorph && l.pathMorph.target && l.pathMorph.target.preset) l.pathMorph.target = TM.Path.preset(l.pathMorph.target.preset, aspect);
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

    replace(scene, opts = {}) {
      if (opts.history !== false) this._pushHistory(null);
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

    undo() {
      if (!this.past.length) return;
      this.future.push(this._snapshot());
      this._restore(this.past.pop());
    }

    redo() {
      if (!this.future.length) return;
      this.past.push(this._snapshot());
      this._restore(this.future.pop());
    }

    setUI(patch) {
      Object.assign(this.ui, patch);
      this.emit('ui', patch);
    }

    _scheduleSave() {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this.save(), 400);
    }

    save() {
      safeStorage((ls) => ls.setItem(STORAGE_KEY, JSON.stringify(this.scene)));
    }

    static loadSaved() {
      const raw = safeStorage((ls) => ls.getItem(STORAGE_KEY), null);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    }
  }

  Studio.Store = Store;
})(window.TM);
