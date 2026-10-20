/* TYPOMAN studio — on-canvas bézier path editor: point editing, pen tool, freehand drawing.
 *
 *   new TM.Studio.PathEditor(store, svgOverlay, () => view)        (constructed by app.js)
 *
 * Active while store.ui.editPath is on and the selected layer's preset uses a path; it renders
 * nothing otherwise, so the preview stays clean. Every edit goes through store.updateLayer
 * (one undo step per gesture or pen session) and drops path.preset, which marks the shape as
 * custom.
 *
 * Shared state on store.ui (the Path panel reads and writes the same keys):
 *   editPath    on-canvas editing
 *   pathTool    'edit' (points) | 'pen' | 'draw' (freehand)
 *   pathTarget  index of the edited shape: 0 = main path A, i = pathMorph.keys[i - 1]
 *               ('a' / 'b' from older code still work)
 *   pathSel     selected node indices
 *
 * Edit: drag a point, a handle, the curve (moves the path) or empty space (marquee).
 * Double-click the curve to insert a point, a point to toggle corner ↔ smooth. Alt-drag a
 * handle to break it, Alt-drag a point to pull out new handles, Shift constrains to 45°,
 * Ctrl/⌘ disables snapping. Keys: Delete/Backspace, arrows (Shift ×10), ⌘A, D (draw).
 * Pen: click for a corner, click-drag for symmetric handles, click the first point to close,
 * Enter or Esc to finish, Backspace (or ⌘Z) removes the last point.
 * Points and handles outside the artboard stay visible and grabbable: presses anywhere on
 * the stage reach the editor, anything beyond the visible stage is pinned to its edge as a
 * marker, and "Show all" zooms out until the whole path fits.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const NS = 'http://www.w3.org/2000/svg';
  const DOUBLE_MS = 380;
  const DOUBLE_PX = 12;
  const MAX_DRAWN_NODES = 64;
  const EDGE = 12; // inset of off-screen markers from the visible stage edge, px
  /** A touch screen (the hints say "tap" there). */
  const coarse = () => !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  // The stylesheet also styles the Path panel; resolve it next to the engine files.
  (function injectCSS() {
    if (document.querySelector('link[data-tm-css="path-editor"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = ((window.TM_MANIFEST && window.TM_MANIFEST.base) || './') + 'css/path-editor.css';
    link.setAttribute('data-tm-css', 'path-editor');
    document.head.appendChild(link);
  })();

  // ───────────────────────────── icons (shared with the Path panel) ─────────────────────────────
  const ICONS = {
    edit: '<path d="M5 3.5 18.5 12l-6 1.5L9.5 19z"/>',
    pen: '<path d="M12 3 6.5 12.5 9 20h6l2.5-7.5z"/><path d="M12 3v7.5"/><circle cx="12" cy="12" r="1.4"/>',
    draw: '<path d="M3 16.5c3-1 3.6-7 7-7s2.8 6.5 6.3 6.5c2.4 0 3.5-3 4.7-6"/>',
    point: '<path d="M3 12h5.2M15.8 12H21"/><circle cx="12" cy="12" r="3.2"/>',
    trash: '<path d="M4 7h16"/><path d="M10 7V4h4v3"/><path d="M6.5 7l1 13h9l1-13"/>',
    closed: '<circle cx="12" cy="12" r="7"/>',
    open: '<path d="M8.6 5.9a7 7 0 1 0 6.8 0"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    back: '<path d="M10 6 4 12l6 6"/><path d="M4 12h11a5 5 0 0 1 0 10h-2"/>',
    showall: '<rect x="8" y="8" width="8" height="8" rx="1"/><path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/>',
    reverse: '<path d="M4 8h14l-3.5-3.5"/><path d="M20 16H6l3.5 3.5"/>',
    fliph: '<path d="M12 3v18"/><path d="M8.5 7.5 4 12l4.5 4.5z"/><path d="m15.5 7.5 4.5 4.5-4.5 4.5z"/>',
    flipv: '<path d="M3 12h18"/><path d="M7.5 8.5 12 4l4.5 4.5z"/><path d="m7.5 15.5 4.5 4.5 4.5-4.5z"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><path d="M8 14c2-5 6-5 8 0"/>',
    smooth: '<path d="M3 17c3.5-11 14.5-11 18 0"/>',
    corner: '<path d="M3 18 12 6l9 12"/>',
    rotl: '<path d="M5 12a7 7 0 1 0 2.1-5"/><path d="M5 4.5V8h3.5"/>',
    rotr: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4.5V8h-3.5"/>',
    swap: '<path d="M7 20V5l-3 3"/><path d="M17 4v15l3-3"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V5.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3"/>',
    start: '<circle cx="7" cy="12" r="2.6"/><path d="M11 12h9l-3-3M20 12l-3 3"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  function icon(name) {
    const t = document.createElement('template');
    t.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
    return t.content.firstChild;
  }
  Studio.pathIcon = icon;

  // ───────────────────────────── path keyframe targets (shared with the Path panel) ─────────────────────────────
  const LETTERS = 'ABCDE';
  const Keys = {
    /** Morph targets of a layer while its morph is on (keys[], or [target] in older scenes). */
    list: (layer) => (layer && layer.pathMorph && layer.pathMorph.enabled ? TM.Path.morphKeys(layer.pathMorph) : []),
    /** Index of the edited shape: 0 = main path A, i = keys[i - 1]. */
    index(store) {
      const t = store.ui.pathTarget, n = Keys.list(store.layer).length;
      const i = t === 'b' ? 1 : t === 'a' || t == null ? 0 : Math.floor(+t) || 0;
      return i >= 1 && i <= n ? i : 0;
    },
    def: (layer, i) => (i > 0 ? Keys.list(layer)[i - 1] || null : layer.path),
    /** Put shape i into a draft layer (keeps pathMorph.target = keys[0]). */
    write(layer, i, def) {
      if (i <= 0) { layer.path = def; return; }
      const pm = layer.pathMorph, keys = TM.Path.morphKeys(pm).slice();
      keys[i - 1] = def;
      pm.keys = keys;
      pm.target = keys[0];
    },
    letter: (i) => LETTERS[i] || '?',
    /** Edit shape i and park the playhead where the loop reaches it, so the preview shows it. */
    focus(store, i, opts = {}) {
      const L = store.layer, n = Keys.list(L).length, patch = { pathTarget: i, pathSel: [] };
      if (opts.edit) patch.editPath = true;
      if (n) {
        const s = store.scene, tm = L.time || {}, cycles = tm.cycles || 1;
        const kp = TM.Path.keyTime(i, n + 1, L.pathMorph.mode);
        patch.time = TM.math.mod((tm.delay || 0) + (kp * s.duration) / cycles, s.duration);
        patch.playing = false;
      }
      store.setUI(patch);
    },
  };
  Studio.pathKeys = Keys;

  // ───────────────────────────── helpers ─────────────────────────────
  function svgEl(tag, cls, parent) {
    const e = document.createElementNS(NS, tag);
    if (cls) e.setAttribute('class', cls);
    if (parent) parent.appendChild(e);
    return e;
  }
  class Pool {
    constructor(parent, tag, cls) { this.parent = parent; this.tag = tag; this.cls = cls; this.items = []; }
    get(i) { while (this.items.length <= i) this.items.push(svgEl(this.tag, this.cls, this.parent)); return this.items[i]; }
    trim(n) { while (this.items.length > n) this.items.pop().remove(); }
  }
  const f2 = (v) => (Math.round(v * 100) / 100).toString();
  const ring = (x, y, r) => `M${f2(x - r)} ${f2(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
  const square = (x, y, r) => `M${f2(x - r)} ${f2(y - r)}h${2 * r}v${2 * r}h${-2 * r}z`;
  /** Snap a vector to the nearest 45° direction, keeping its length or its projection. */
  function snap45(dx, dy, keepLength) {
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = keepLength ? Math.hypot(dx, dy) : dx * Math.cos(a) + dy * Math.sin(a);
    return [Math.cos(a) * len, Math.sin(a) * len];
  }
  /** Whether node i's in / out handle shapes a segment (open ends have one dead handle). */
  const isLive = (def, i, side) => def.closed || (side === 'in' ? i > 0 : i < def.nodes.length - 1);
  const handleOf = (n, side) => (side === 'in' ? [n.ix, n.iy] : [n.ox, n.oy]);
  function setHandle(n, side, x, y) {
    if (side === 'in') { n.ix = x; n.iy = y; } else { n.ox = x; n.oy = y; }
  }
  const sameIds = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const typingIn = (t) => !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') || t.isContentEditable);
  /** Clamp point p into rect r; returns null when p is already inside. */
  function pin(p, r) {
    if (!r || (p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1)) return null;
    return { x: Math.min(r.x1, Math.max(r.x0, p.x)), y: Math.min(r.y1, Math.max(r.y0, p.y)) };
  }
  /** The last point of segment a → b still inside rect r (a inside), for pinning handle knobs. */
  function exitPoint(a, b, r) {
    let t = 1;
    if (b.x < r.x0) t = Math.min(t, (r.x0 - a.x) / (b.x - a.x));
    if (b.x > r.x1) t = Math.min(t, (r.x1 - a.x) / (b.x - a.x));
    if (b.y < r.y0) t = Math.min(t, (r.y0 - a.y) / (b.y - a.y));
    if (b.y > r.y1) t = Math.min(t, (r.y1 - a.y) / (b.y - a.y));
    t = Math.max(0, t);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  // ───────────────────────────── editor ─────────────────────────────
  class PathEditor {
    constructor(store, svg, getView) {
      this.store = store;
      this.svg = svg;
      this.getView = getView;
      this.g = null; //        gesture in progress
      this.pen = null; //      pen session: { nodes, closed, orig, key, wrote }
      this.penHover = null; // pointer position for the pen's rubber band
      this.hover = null; //    hit under an idle pointer
      this.tap = null; //      last press, for double-click / double-tap
      this.guides = null; //   active snapping guides { x, y } in px
      this.autoZoom = null; // { prev, set } when Show all changed the zoom
      this.uid = 0;
      this._self = 0; //       > 0 while this editor writes to the store
      this.stage = svg.closest('.stage') || (svg.parentElement && svg.parentElement.parentElement);
      this._build();

      store.on('change', (d) => this._onChange(d || {}));
      store.on('select', () => { this._cancel(false); this._endPen(false); this._setSel([]); this.render(); });
      store.on('ui', (patch) => this._onUI(patch || {}));
      store.on('view', () => this.render());

      svg.addEventListener('pointerdown', (e) => this._down(e));
      svg.addEventListener('pointermove', (e) => this._move(e));
      svg.addEventListener('pointerup', (e) => this._up(e));
      svg.addEventListener('pointercancel', (e) => this._up(e));
      svg.addEventListener('lostpointercapture', (e) => { if (this.g && e.pointerId === this.g.id) this._up(e); });
      svg.addEventListener('pointerleave', () => { if (!this.g && (this.hover || this.insertAt || this.penHover)) { this.hover = this.insertAt = this.penHover = null; this.render(); } });
      svg.addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); });
      // The stage around the artboard belongs to the editor too: points can live off-frame.
      if (this.stage) {
        this.stage.addEventListener('pointerdown', (e) => { if (this._fromStage(e)) this._down(e); });
        this.stage.addEventListener('pointermove', (e) => { if (!this.g && this._fromStage(e)) this._move(e); });
        this.stage.addEventListener('scroll', () => this._schedule(), { passive: true });
      }
      window.addEventListener('resize', () => this._schedule());
      window.addEventListener('keydown', (e) => this._onKey(e), true);
      this.render();
    }

    // ── state ──
    get active() {
      const s = this.store;
      return !!(s.ui.editPath && s.preset && s.preset.usesPath && s.layer.path);
    }
    get tool() {
      const t = this.store.ui.pathTool;
      return t === 'pen' || t === 'draw' ? t : 'edit';
    }
    /** Index of the edited shape (0 = A). */
    get target() {
      return Keys.index(this.store);
    }
    get def() {
      return Keys.def(this.store.layer, this.target);
    }
    /** What the canvas shows: the pen's path while one is being drawn. */
    get shown() {
      return this.pen ? { closed: this.pen.closed && this.pen.nodes.length > 2, nodes: this.pen.nodes } : this.def;
    }
    /** The other shapes of the morph (or the path the pen is replacing), drawn dashed. */
    get ghosts() {
      if (this.pen) return [{ def: this.pen.orig, i: this.target }];
      const L = this.store.layer, keys = Keys.list(L), out = [];
      if (!keys.length) return out;
      [L.path].concat(keys).forEach((def, i) => { if (i !== this.target && def) out.push({ def, i }); });
      return out;
    }
    get aspect() {
      return this.store.scene.size.w / this.store.scene.size.h;
    }
    get sel() {
      return this.store.ui.pathSel || [];
    }
    _setSel(list) {
      const next = Array.from(new Set(list)).filter((i) => Number.isInteger(i) && i >= 0).sort((a, b) => a - b);
      if (!sameIds(next, this.sel)) this.store.setUI({ pathSel: next });
    }

    _onChange(d) {
      const s = this.store;
      if (s.ui.editPath && !(s.preset && s.preset.usesPath)) {
        // The new preset has no path: leave editing instead of capturing clicks for nothing.
        this._cancel(false);
        this._endPen(false);
        s.setUI({ editPath: false, pathTool: 'edit', pathSel: [] });
        return;
      }
      if (!this._self) {
        if (d.reason === 'size') this._refitKeys();
        if (this.pen && d.reason !== 'history') this._endPen(true); // something else changed the path
        if (this.pen && d.reason === 'history') { this.pen = null; this.penHover = null; }
      }
      this._lastAspect = this.aspect;
      const t = s.ui.pathTarget;
      if (t != null && t !== 'a' && t !== 0 && this.target === 0) s.setUI({ pathTarget: 0, pathSel: [] });
      const def = this.def;
      if (def && this.sel.some((i) => i >= def.nodes.length)) this._setSel(this.sel.filter((i) => i < def.nodes.length));
      this.render();
    }

    /** store.setSize re-fits the main path and keys[0]; carry the other keys along too. */
    _refitKeys() {
      const from = this._lastAspect, to = this.aspect;
      if (!(from > 0) || Math.abs(from - to) < 1e-9) return;
      const refit = (k) => (k.preset ? TM.Path.preset(k.preset, to) : TM.Path.reaspect(k, from, to));
      if (!this.store.scene.layers.some((l) => l.pathMorph && l.pathMorph.keys && l.pathMorph.keys.length > 1)) return;
      this._self++;
      try {
        // Same undo step as the resize itself: undo restores the snapshot taken before it.
        this.store.update((scene) => {
          scene.layers.forEach((l) => {
            const pm = l.pathMorph;
            if (pm && pm.keys && pm.keys.length > 1) pm.keys = [pm.keys[0]].concat(pm.keys.slice(1).map(refit));
          });
        }, { history: false, reason: 'size' });
      } finally { this._self--; }
    }

    _onUI(patch) {
      const ui = this.store.ui;
      if ('editPath' in patch) {
        if (!ui.editPath) {
          this._cancel(false);
          this._endPen(true);
          this.hover = this.insertAt = this.penHover = null;
          const reset = {};
          if (ui.pathTool && ui.pathTool !== 'edit') reset.pathTool = 'edit';
          if (this.sel.length) reset.pathSel = [];
          if (this.autoZoom && ui.zoom === this.autoZoom.set) reset.zoom = this.autoZoom.prev;
          this.autoZoom = null;
          if (Object.keys(reset).length) this.store.setUI(reset);
        } else if (this.active) {
          // Entering edit mode: if anything sits beyond the visible stage, zoom out to show it.
          requestAnimationFrame(() => { if (this.active && this._offscreen()) this.showAll(); });
        }
      }
      if ('pathTool' in patch) {
        if (this.tool !== 'pen') this._endPen(true);
        if (this.g && this.g.kind === 'draw' && this.tool !== 'draw') this._cancel(false);
      }
      if ('pathTarget' in patch) {
        this._endPen(true);
        if (this.sel.length && !('pathSel' in patch)) this.store.setUI({ pathSel: [] });
      }
      if (['editPath', 'pathTool', 'pathTarget', 'pathSel', 'zoom'].some((k) => k in patch)) this.render();
    }

    _schedule() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); });
    }

    // ── DOM ──
    _build() {
      const root = (this.root = svgEl('g', 'pe'));
      root.setAttribute('aria-hidden', 'true');
      this.ghostLayer = svgEl('g', 'pe-ghosts', root);
      this.ghostsU = new Pool(this.ghostLayer, 'path', 'pe-ghost-u');
      this.ghostsP = new Pool(this.ghostLayer, 'path', 'pe-ghost');
      this.curveU = svgEl('path', 'pe-curve-u', root);
      this.curveP = svgEl('path', 'pe-curve', root);
      this.rubber = svgEl('path', 'pe-rubber', root);
      this.guideP = svgEl('path', 'pe-guides', root);
      this.dirP = svgEl('path', 'pe-dir', root);
      this.stemsU = svgEl('path', 'pe-stems-u', root);
      this.stemsP = svgEl('path', 'pe-stems', root);
      this.knobs = new Pool(svgEl('g', 'pe-knobs', root), 'circle', 'pe-knob');
      this.anchors = new Pool(svgEl('g', 'pe-anchors', root), 'path', 'pe-anchor');
      this.offArrows = svgEl('path', 'pe-off', root);
      this.insertP = svgEl('circle', 'pe-insert', root);
      this.marquee = svgEl('rect', 'pe-marquee', root);
      this.drawU = svgEl('polyline', 'pe-draw-u', root);
      this.drawP = svgEl('polyline', 'pe-draw', root);
      this.closeP = svgEl('circle', 'pe-close', root);
      this.tags = new Pool(svgEl('g', 'pe-tags', root), 'text', 'pe-tag');
      this.svg.appendChild(root);
      this._buildBar();
    }

    _buildBar() {
      const h = Studio.h;
      const host = this.svg.parentElement;
      if (!h || !host) return;
      const btn = (act, ico, label, extra) => {
        const b = h('button', Object.assign({ type: 'button', 'data-act': act, title: label, 'aria-label': label }, extra), ico ? icon(ico) : null);
        b.addEventListener('click', () => this._barAction(act, b));
        return b;
      };
      this.barShapes = h('div', { class: 'pe-abs', role: 'group', 'aria-label': 'Shape to edit' });
      this.barEdit = btn('edit', 'edit', 'Edit points');
      this.barPen = btn('pen', 'pen', 'Pen: click for corners, drag for curves');
      this.barDraw = btn('draw', 'draw', 'Draw freehand (D)');
      this.barTools = h('div', { class: 'pe-tools', role: 'group', 'aria-label': 'Path tool' }, this.barEdit, this.barPen, this.barDraw);
      this.barHint = h('span', { class: 'pe-hint' });
      this.barKind = btn('kind', 'point', 'Corner ↔ smooth (or double-click a point; Alt-drag a point to pull handles)');
      this.barDel = btn('delete', 'trash', 'Delete selected points (Del)');
      this.barClose = btn('close', 'closed', 'Close the path');
      this.barBack = btn('pen-back', 'back', 'Remove the last point (Backspace)');
      this.barFinish = btn('pen-finish', 'check', 'Finish the path (Enter)', { class: 'pe-finish' });
      this.barFinish.append(h('span', null, 'Finish'));
      this.barAll = btn('showall', 'showall', 'Show all: zoom out to see every point');
      this.barDone = btn('done', 'check', 'Finish editing (Esc)', { class: 'pe-done' });
      this.barDone.append(h('span', null, 'Done'));
      this.bar = h('div', { class: 'pe-bar', role: 'toolbar', 'aria-label': 'Path tools', hidden: true },
        this.barShapes, this.barTools, this.barHint, this.barKind, this.barDel, this.barClose, this.barBack, this.barFinish,
        h('span', { class: 'pe-sep', 'aria-hidden': 'true' }), this.barAll, this.barDone);
      // Keep presses on the toolbar away from the editor's stage handlers.
      this.bar.addEventListener('pointerdown', (e) => e.stopPropagation());
      host.appendChild(this.bar);
    }

    _barAction(act, b) {
      const s = this.store;
      if (!this.active) return;
      switch (act) {
        case 'shape': Keys.focus(s, +b.dataset.i); break;
        case 'edit': case 'pen': case 'draw': s.setUI({ pathTool: act }); break;
        case 'kind': this.toggleKind(); break;
        case 'delete': this.deleteSelected(); break;
        case 'close': this.setClosed(!this.def.closed); break;
        case 'pen-back': this.penBackspace(); break;
        case 'pen-finish': this._endPen(true); break;
        case 'showall': this.showAll(); break;
        case 'done': s.setUI({ editPath: false }); break;
      }
    }

    _syncBar(on, W, H) {
      if (!this.bar) return;
      this.bar.hidden = !on;
      if (!on) return;
      const tool = this.tool, def = this.shown, keys = Keys.list(this.store.layer), cur = this.target;
      // One letter per shape of the morph: A (main path), B, C…
      const want = keys.length ? keys.length + 1 : 0;
      if (this.barShapes.childElementCount !== want) {
        this.barShapes.replaceChildren();
        for (let i = 0; i < want; i++) {
          const b = Studio.h('button', { type: 'button', class: 'pe-ab', 'data-i': i, title: i ? 'Edit key ' + Keys.letter(i) : 'Edit the main path (A)', 'aria-label': i ? 'Edit key ' + Keys.letter(i) : 'Edit the main path A' }, Keys.letter(i));
          b.addEventListener('click', () => this._barAction('shape', b));
          this.barShapes.append(b);
        }
      }
      Array.from(this.barShapes.children).forEach((b, i) => { b.classList.toggle('on', i === cur); b.setAttribute('aria-pressed', String(i === cur)); });
      this.barShapes.hidden = !want;
      for (const [b, t] of [[this.barEdit, 'edit'], [this.barPen, 'pen'], [this.barDraw, 'draw']]) {
        b.classList.toggle('on', tool === t);
        b.setAttribute('aria-pressed', String(tool === t));
      }
      const editing = tool === 'edit';
      this.barKind.hidden = this.barDel.hidden = this.barClose.hidden = !editing;
      this.barBack.hidden = this.barFinish.hidden = tool !== 'pen';
      this.barHint.hidden = editing;
      const tap = coarse() ? 'Tap' : 'Click';
      const hint = tool === 'draw' ? 'Drag to draw a path' : this.pen && this.pen.nodes.length >= 3 ? tap + ' the first point to close · ↵ to finish' : this.pen && this.pen.nodes.length ? tap + ' for corners · drag for curves' : tap + ' to start a new path';
      if (this.barHint.textContent !== hint) this.barHint.textContent = hint;
      const n = this.sel.length;
      this.barKind.disabled = !n;
      this.barDel.disabled = !n || def.nodes.length <= 2;
      this.barBack.disabled = !(this.pen && this.pen.nodes.length);
      this.barFinish.disabled = !(this.pen && this.pen.nodes.length >= 2);
      const closed = !!def.closed;
      this.barClose.classList.toggle('on', closed);
      this.barClose.setAttribute('aria-pressed', String(closed));
      const label = closed ? 'Open the path' : 'Close the path';
      if (this.barClose.title !== label) {
        this.barClose.title = label;
        this.barClose.setAttribute('aria-label', label);
        this.barClose.replaceChildren(icon(closed ? 'closed' : 'open'));
      }
      this.barClose.disabled = !closed && def.nodes.length < 3;
      this._placeBar(def, W, H, [tool, want, hint, this.barFinish.hidden].join('|'));
    }

    /**
     * Size and place the toolbar against the *visible stage*, not the artboard: a narrow 9:16
     * artboard must not clip it ("Click the fi…", "Don"). It floats over the pasteboard when it
     * is wider than the artboard, stays inside the stage when zoomed or scrolled, and only drops
     * to compact layouts when the stage itself is narrow: 1 hides the hint, 2 the button labels,
     * 3 also Show all and corner/smooth, and wraps as a last resort.
     */
    _placeBar(def, W, H, contentKey) {
      const bar = this.bar, vr = this._viewRect();
      const room = vr ? { l: vr.x0 - EDGE, r: vr.x1 + EDGE, t: vr.y0 - EDGE, b: vr.y1 + EDGE } : { l: 0, r: W, t: 0, b: H };
      const avail = Math.max(120, Math.floor(room.r - room.l - 16));
      const fitKey = contentKey + '|' + avail;
      if (fitKey !== this._barKey) {
        this._barKey = fitKey;
        bar.style.maxWidth = 'none';
        let level = 0;
        for (; level < 3; level++) {
          bar.dataset.fit = String(level);
          if (bar.offsetWidth <= avail) break;
        }
        bar.dataset.fit = String(level);
        bar.style.maxWidth = avail + 'px';
        this._barSize = [bar.offsetWidth || 240, bar.offsetHeight || 36];
      }
      const [bw, bh] = this._barSize;
      // Centred on the visible part of the artboard, kept inside the visible stage.
      const v0 = Math.max(0, room.l), v1 = Math.min(W, room.r);
      let cx = v1 > v0 ? (v0 + v1) / 2 : W / 2;
      cx = Math.min(Math.max(cx, room.l + 8 + bw / 2), room.r - 8 - bw / 2);
      // At the artboard's foot (or the stage's, when zoomed in); dodge to the top when points
      // sit under it.
      const foot = Math.min(H, room.b) - 10;
      const under = def.nodes.some((p) => { const x = p.x * W, y = p.y * H; return y > foot - bh - 14 && y < foot + 18 && Math.abs(x - cx) < bw / 2 + 16; });
      const top = under ? Math.max(0, room.t) + 10 : foot - bh;
      bar.classList.toggle('at-top', under);
      bar.style.left = cx.toFixed(1) + 'px';
      bar.style.top = top.toFixed(1) + 'px';
      bar.style.bottom = 'auto';
    }

    // ── geometry of the view ──
    /** The visible part of the stage in overlay px, inset by EDGE (null without a stage). */
    _viewRect() {
      if (!this.stage) return null;
      const st = this.stage, sr = st.getBoundingClientRect(), or = this.svg.getBoundingClientRect(), v = this.getView();
      if (!or.width || !or.height) return null;
      const kx = v.cssW / or.width, ky = v.cssH / or.height;
      const left = sr.left + st.clientLeft, top = sr.top + st.clientTop;
      return {
        x0: (left - or.left) * kx + EDGE, y0: (top - or.top) * ky + EDGE,
        x1: (left + st.clientWidth - or.left) * kx - EDGE, y1: (top + st.clientHeight - or.top) * ky - EDGE,
      };
    }

    /** Anchors (and live handles) of every shape, in normalised units. */
    _extent() {
      const L = this.store.layer, defs = [L.path].concat(Keys.list(L)).filter(Boolean);
      let x0 = 0, y0 = 0, x1 = 1, y1 = 1;
      for (const d of defs) {
        d.nodes.forEach((n, i) => {
          const pts = [[n.x, n.y]];
          if (isLive(d, i, 'in')) pts.push([n.x + n.ix, n.y + n.iy]);
          if (isLive(d, i, 'out')) pts.push([n.x + n.ox, n.y + n.oy]);
          for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        });
      }
      return { x0, y0, x1, y1 };
    }

    _offscreen() {
      const r = this._viewRect(), v = this.getView();
      if (!r) return false;
      const e = this._extent();
      return e.x0 * v.cssW < r.x0 || e.x1 * v.cssW > r.x1 || e.y0 * v.cssH < r.y0 || e.y1 * v.cssH > r.y1;
    }

    /**
     * Zoom out until every point and handle fits the stage (the artboard stays centred).
     * When nothing is off-screen, return to the fitted view. Leaving edit mode restores the
     * zoom from before, unless the user zoomed since.
     */
    showAll() {
      const s = this.store, v = this.getView(), st = this.stage;
      if (!st || !v.cssW) return;
      const e = this._extent();
      const ex = Math.max(-e.x0, e.x1 - 1, 0), ey = Math.max(-e.y0, e.y1 - 1, 0);
      const fit = v.fit || v.scale, { w, h } = s.scene.size;
      const k = Math.min(fit, (st.clientWidth / 2 - 36) / (w * (0.5 + ex)), (st.clientHeight / 2 - 36) / (h * (0.5 + ey)));
      const zoom = k < fit * 0.995 ? Math.max(0.02, k) : 'fit';
      const prev = this.autoZoom && s.ui.zoom === this.autoZoom.set ? this.autoZoom.prev : s.ui.zoom == null ? 'fit' : s.ui.zoom;
      this.autoZoom = { prev, set: zoom };
      s.setUI({ zoom });
    }

    // ── rendering ──
    render() {
      if (!this.root.isConnected) this.svg.appendChild(this.root);
      const v = this.getView && this.getView();
      const on = !!(this.active && v && v.cssW > 0 && v.cssH > 0);
      this.root.style.display = on ? '' : 'none';
      this.svg.setAttribute('data-pe-tool', on ? this.tool : '');
      this._syncBar(on, on ? v.cssW : 0, on ? v.cssH : 0);
      if (!on) {
        this.svg.removeAttribute('data-pe-cursor');
        if (this.stage) this.stage.removeAttribute('data-pe-cursor');
        return;
      }
      const W = v.cssW, H = v.cssH, def = this.shown, tool = this.tool, g = this.g;
      const view = this._viewRect();
      this.root.setAttribute('data-target', String(this.target));
      this.root.classList.toggle('is-drawing', tool === 'draw');

      const d = def.nodes.length ? TM.Path.toSVG(def, W, H) : '';
      this.curveU.setAttribute('d', d);
      this.curveP.setAttribute('d', d);
      const ghosts = this.ghosts;
      ghosts.forEach((gh, k) => {
        const gd = TM.Path.toSVG(gh.def, W, H);
        this.ghostsU.get(k).setAttribute('d', gd);
        this.ghostsP.get(k).setAttribute('d', gd);
      });
      this.ghostsU.trim(ghosts.length);
      this.ghostsP.trim(ghosts.length);
      this._tags(def, ghosts, W, H);

      // Direction of travel: a small arrow just after the start point.
      const sg = def.nodes.length > 1 ? TM.Path.segments(def, W, H)[0] : null;
      let dir = null;
      if (sg) {
        for (const [x, y] of [[sg[2], sg[3]], [sg[4], sg[5]], [sg[6], sg[7]]]) {
          const l = Math.hypot(x - sg[0], y - sg[1]);
          if (l > 0.5) { dir = [(x - sg[0]) / l, (y - sg[1]) / l]; break; }
        }
      }
      if (dir && tool !== 'draw') {
        const n0 = def.nodes[0], x = n0.x * W, y = n0.y * H, [tx, ty] = dir;
        const bx = x + tx * 11, by = y + ty * 11, ex = x + tx * 18, ey = y + ty * 18;
        this.dirP.setAttribute('d', `M${f2(ex)} ${f2(ey)}L${f2(bx - ty * 3.6)} ${f2(by + tx * 3.6)}L${f2(bx + ty * 3.6)} ${f2(by - tx * 3.6)}Z`);
      } else this.dirP.setAttribute('d', '');

      // Pen rubber band: the next segment as it would be drawn.
      let rb = '';
      if (tool === 'pen' && this.pen && this.pen.nodes.length && !this.pen.closed) {
        const l = this.pen.nodes[this.pen.nodes.length - 1], to = g && g.kind === 'pen' ? null : this.penHover;
        if (to) rb = `M${f2(l.x * W)} ${f2(l.y * H)}C${f2((l.x + l.ox) * W)} ${f2((l.y + l.oy) * H)} ${f2(to.x)} ${f2(to.y)} ${f2(to.x)} ${f2(to.y)}`;
      }
      this.rubber.setAttribute('d', rb);

      let offs = '';
      const arrow = (m, real) => {
        const dx = real.x - m.x, dy = real.y - m.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
        const bx = m.x + ux * 7, by = m.y + uy * 7, ex = m.x + ux * 13, ey = m.y + uy * 13;
        offs += `M${f2(ex)} ${f2(ey)}L${f2(bx - uy * 3.5)} ${f2(by + ux * 3.5)}L${f2(bx + uy * 3.5)} ${f2(by - ux * 3.5)}Z`;
      };

      // Handles: on selected points (the last pen point while drawing), plus the neighbours'
      // handles that shape the same segments. Off-screen knobs are pinned where the stem leaves.
      const handles = tool === 'draw' ? [] : this._handles(def, W, H, view);
      let stems = '';
      handles.forEach((hd, k) => {
        stems += `M${f2(hd.ax)} ${f2(hd.ay)}L${f2(hd.x)} ${f2(hd.y)}`;
        const knob = this.knobs.get(k);
        const hot = (this.hover && this.hover.type === 'handle' && this.hover.i === hd.i && this.hover.side === hd.side) || (g && g.kind === 'handle' && g.i === hd.i && g.side === hd.side);
        knob.setAttribute('cx', f2(hd.px));
        knob.setAttribute('cy', f2(hd.py));
        knob.setAttribute('r', hot ? 4.4 : 3.4);
        knob.setAttribute('class', 'pe-knob' + (hot ? ' is-hot' : '') + (hd.off ? ' is-off' : ''));
        if (hd.off) arrow({ x: hd.px, y: hd.py }, { x: hd.x, y: hd.y });
      });
      this.knobs.trim(handles.length);
      this.stemsU.setAttribute('d', stems);
      this.stemsP.setAttribute('d', stems);

      // Anchors: squares for corners, circles for smooth / mirror points; off-screen ones pinned.
      const sel = new Set(this.sel);
      const nodes = tool === 'draw' ? [] : this._anchors(def, W, H, view);
      const closable = tool === 'pen' && this.pen && this.pen.nodes.length >= 3 && !this.pen.closed;
      nodes.forEach((a, i) => {
        const el = this.anchors.get(i), p = def.nodes[i];
        const hot = (this.hover && this.hover.type === 'anchor' && this.hover.i === i) || (closable && i === 0 && this.hover && this.hover.type === 'close');
        const corner = p.k === 'corner';
        const r = (corner ? 3.9 : 4.4) + (hot ? 1.4 : 0) + (i === 0 ? 0.5 : 0);
        el.setAttribute('d', corner ? square(a.px, a.py, r) : ring(a.px, a.py, r));
        el.setAttribute('class', 'pe-anchor' + (corner ? ' is-corner' : '') + (sel.has(i) ? ' is-sel' : '') + (hot ? ' is-hot' : '') + (i === 0 ? ' is-start' : '') + (a.off ? ' is-off' : '') + (closable && i === 0 ? ' is-closable' : ''));
        if (a.off) arrow({ x: a.px, y: a.py }, { x: a.x, y: a.y });
      });
      this.anchors.trim(nodes.length);
      this.offArrows.setAttribute('d', offs);

      // Insert preview: where a double-click on the curve would add a point.
      const ins = !g && tool === 'edit' && this.insertAt;
      this.insertP.setAttribute('r', ins ? 3.6 : 0);
      if (ins) { this.insertP.setAttribute('cx', f2(ins.x)); this.insertP.setAttribute('cy', f2(ins.y)); }

      // Marquee and snapping guides.
      if (g && g.kind === 'marquee' && g.moved) {
        this.marquee.setAttribute('x', f2(Math.min(g.start.x, g.last.x)));
        this.marquee.setAttribute('y', f2(Math.min(g.start.y, g.last.y)));
        this.marquee.setAttribute('width', f2(Math.abs(g.last.x - g.start.x)));
        this.marquee.setAttribute('height', f2(Math.abs(g.last.y - g.start.y)));
        this.marquee.style.display = '';
      } else this.marquee.style.display = 'none';
      const gl = this.guides;
      this.guideP.setAttribute('d', gl ? (gl.x != null ? `M${f2(gl.x)} 0V${H}` : '') + (gl.y != null ? `M0 ${f2(gl.y)}H${W}` : '') : '');

      // Freehand stroke in progress, with a ring at its start that lights up to auto-close.
      if (g && g.kind === 'draw') {
        const pts = g.pts.map((p) => f2(p.x) + ',' + f2(p.y)).join(' ');
        this.drawU.setAttribute('points', pts);
        this.drawP.setAttribute('points', pts);
        this.closeP.setAttribute('cx', f2(g.pts[0].x));
        this.closeP.setAttribute('cy', f2(g.pts[0].y));
        this.closeP.setAttribute('r', 6);
        this.closeP.classList.toggle('is-on', !!g.closing);
      } else {
        this.drawU.setAttribute('points', '');
        this.drawP.setAttribute('points', '');
        this.closeP.setAttribute('r', 0);
      }
      this._cursor();
    }

    _tags(def, ghosts, W, H) {
      const keyed = Keys.list(this.store.layer).length > 0 && this.tool !== 'draw';
      const items = keyed ? [{ def, i: this.target, main: true }].concat(this.pen ? [] : ghosts) : [];
      let k = 0;
      for (const it of items) {
        if (!it.def || !it.def.nodes.length) continue;
        const el = this.tags.get(k++);
        el.textContent = Keys.letter(it.i);
        el.setAttribute('x', f2(it.def.nodes[0].x * W - 9));
        el.setAttribute('y', f2(it.def.nodes[0].y * H - 9));
        el.setAttribute('class', 'pe-tag' + (it.main ? '' : ' pe-tag-ghost'));
      }
      this.tags.trim(k);
    }

    _cursor() {
      const g = this.g, hv = this.hover, tool = this.tool;
      let c = '';
      if (tool === 'draw') c = 'draw';
      else if (tool === 'pen') c = hv && hv.type === 'close' ? 'close' : 'pen';
      else if (g) c = g.kind === 'marquee' ? '' : 'grabbing';
      else if (hv) c = hv.type === 'curve' ? 'move' : 'point';
      // The stage too: off-frame points are hovered over the pasteboard, outside the overlay.
      for (const el of [this.svg, this.stage]) {
        if (!el) continue;
        if (c) el.setAttribute('data-pe-cursor', c); else el.removeAttribute('data-pe-cursor');
      }
    }

    /** Anchor positions in px, pinned to the visible stage when off-screen. */
    _anchors(def, W, H, view) {
      return def.nodes.map((n) => {
        const x = n.x * W, y = n.y * H, m = pin({ x, y }, view);
        return { x, y, px: m ? m.x : x, py: m ? m.y : y, off: !!m };
      });
    }

    /** Handles worth showing: on selected points and the neighbours' facing handles. */
    _handles(def, W, H, view) {
      const nodes = def.nodes, n = nodes.length, out = [], seen = new Set();
      const g = this.g;
      const add = (i, side) => {
        const key = i + side;
        if (seen.has(key) || !isLive(def, i, side)) return;
        const p = nodes[i], [hx, hy] = handleOf(p, side);
        const dragging = g && g.kind === 'handle' && g.i === i && g.side === side;
        if (!dragging && Math.hypot(hx * W, hy * H) < 0.75) return;
        seen.add(key);
        const a = { x: p.x * W, y: p.y * H }, hpt = { x: (p.x + hx) * W, y: (p.y + hy) * H };
        let pinned = pin(hpt, view);
        if (pinned && !pin(a, view)) pinned = exitPoint(a, hpt, view);
        out.push({ i, side, ax: a.x, ay: a.y, x: hpt.x, y: hpt.y, px: pinned ? pinned.x : hpt.x, py: pinned ? pinned.y : hpt.y, off: !!pinned });
      };
      const focus = this.tool === 'pen' ? (this.pen && this.pen.nodes.length ? [this.pen.nodes.length - 1] : []) : this.sel;
      for (const i of focus) {
        if (i >= n) continue;
        add(i, 'in');
        add(i, 'out');
        if (this.tool === 'pen') continue;
        if (def.closed || i > 0) add((i - 1 + n) % n, 'out');
        if (def.closed || i < n - 1) add((i + 1) % n, 'in');
      }
      return out;
    }

    // ── hit testing (manual: nearest target wins, sized for fingers on touch) ──
    _hit(p, coarse) {
      const v = this.getView(), W = v.cssW, H = v.cssH, def = this.def, view = this._viewRect();
      const R = coarse ? 20 : 12;
      let best = null, score = Infinity;
      for (const hd of this._handles(def, W, H, view)) {
        const d = Math.hypot(hd.px - p.x, hd.py - p.y) + 1; // anchors win ties
        if (d < R && d < score) { score = d; best = { type: 'handle', i: hd.i, side: hd.side }; }
      }
      this._anchors(def, W, H, view).forEach((a, i) => {
        const d = Math.hypot(a.px - p.x, a.py - p.y);
        if (d < R && d < score) { score = d; best = { type: 'anchor', i }; }
      });
      if (best) return best;
      const near = TM.Path.nearest(def, W, H, p.x, p.y);
      if (near && near.seg >= 0 && near.dist < (coarse ? 16 : 8)) return { type: 'curve', seg: near.seg, t: near.t, x: near.x, y: near.y };
      return null;
    }

    _local(e) {
      const r = this.svg.getBoundingClientRect(), v = this.getView();
      return { x: ((e.clientX - r.left) * v.cssW) / (r.width || 1), y: ((e.clientY - r.top) * v.cssH) / (r.height || 1) };
    }

    /** Presses on the stage outside the artboard (not on its controls or scrollbars). */
    _fromStage(e) {
      const t = e.target, st = this.stage;
      if (!this.active || !t || this.svg.contains(t) || (this.bar && this.bar.contains(t))) return false;
      if (t.closest && t.closest('button, a, input, select, textarea, label, [contenteditable="true"], [role="dialog"], [role="menu"], .pe-bar')) return false;
      if (t === st && (e.offsetX > st.clientWidth || e.offsetY > st.clientHeight)) return false; // scrollbar
      return true;
    }

    // ── store writes ──
    /** Write `def` to the edited shape. Gestures pass g: one undo step however long the drag. */
    _write(def, g, opts) {
      const target = this.target;
      const nd = TM.Path.clone(def);
      delete nd.preset;
      const o = Object.assign({ reason: 'path', label: 'Edit path' }, opts);
      if (g) { o.coalesce = g.key; o.history = !g.wrote; g.wrote = true; }
      this._self++;
      try {
        this.store.updateLayer((layer) => Keys.write(layer, target, nd), o);
      } finally { this._self--; }
    }

    // ── pointer gestures ──
    _down(e) {
      if (!this.active || this.g) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      // Leave any text field, so Delete and the arrow keys reach the editor next.
      if (typingIn(document.activeElement)) document.activeElement.blur();
      const p = this._local(e), coarse = e.pointerType === 'touch';
      try { this.svg.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      const g = { id: e.pointerId, start: p, last: p, moved: false, coarse, key: 'path-drag-' + ++this.uid, wrote: false, orig: TM.Path.clone(this.def), alt: e.altKey, shift: e.shiftKey };
      const tool = this.tool;
      if (tool === 'draw') {
        this.g = Object.assign(g, { kind: 'draw', pts: [p], closing: false });
        this.render();
        return;
      }
      if (tool === 'pen') { this._penDown(e, p, g); return; }
      let hit = this._hit(p, coarse);
      const now = performance.now(), last = this.tap;
      const soon = last && last.hit && now - last.time < DOUBLE_MS && Math.hypot(last.x - p.x, last.y - p.y) < (coarse ? DOUBLE_PX * 2 : DOUBLE_PX);
      if (soon && last.hit.type === 'curve' && (!hit || hit.type === 'handle')) {
        // The first click selected the segment and revealed its handles under the pointer:
        // the second click still means "insert on the curve here".
        const v = this.getView(), near = TM.Path.nearest(this.def, v.cssW, v.cssH, p.x, p.y);
        if (near && near.seg >= 0 && near.dist < (coarse ? 16 : 8)) hit = { type: 'curve', seg: near.seg, t: near.t, x: near.x, y: near.y };
      }
      const twice = soon && hit && last.hit.type === hit.type && (hit.type !== 'anchor' || last.hit.i === hit.i);
      this.tap = twice ? null : { time: now, x: p.x, y: p.y, hit };
      if (twice && hit.type === 'anchor') { this.toggleKind([hit.i]); return; }
      if (twice && hit.type === 'curve') {
        // Insert, then keep dragging the new point: insert + move is a single undo step.
        const def = TM.Path.split(this.def, hit.seg, hit.t);
        this._write(def, g, { label: 'Add point' });
        const i = hit.seg + 1;
        this._setSel([i]);
        this.g = Object.assign(g, { kind: 'anchor', i, move: [i], orig: def });
        this.render();
        return;
      }
      const sel = this.sel;
      if (!hit) {
        this.g = Object.assign(g, { kind: 'marquee', base: e.shiftKey ? sel.slice() : [] });
      } else if (hit.type === 'anchor') {
        const i = hit.i;
        if (e.altKey) {
          this._setSel([i]);
          this.g = Object.assign(g, { kind: 'bend', i });
        } else if (e.shiftKey && sel.includes(i)) {
          this._setSel(sel.filter((j) => j !== i));
          this.g = null;
          try { this.svg.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          return;
        } else {
          const next = e.shiftKey ? sel.concat([i]) : sel.includes(i) ? sel : [i];
          this._setSel(next);
          this.g = Object.assign(g, { kind: 'anchor', i, move: next.slice(), collapse: !e.shiftKey && sel.includes(i) && sel.length > 1 });
        }
      } else if (hit.type === 'handle') {
        this.g = Object.assign(g, { kind: 'handle', i: hit.i, side: hit.side });
      } else {
        this.g = Object.assign(g, { kind: 'curve', hit });
      }
      this.hover = hit;
      this.render();
    }

    _move(e) {
      const p = this._local(e);
      const g = this.g;
      if (!g) { this._hoverAt(p, e.pointerType === 'touch'); return; }
      if (e.pointerId !== g.id) return;
      if (g.kind === 'draw') {
        const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
        for (const ev of evs.length ? evs : [e]) {
          const q = this._local(ev), l = g.pts[g.pts.length - 1];
          if (Math.hypot(q.x - l.x, q.y - l.y) >= 0.75) g.pts.push(q);
        }
        g.last = p;
        g.closing = this._closes(g.pts);
        this.render();
        return;
      }
      if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < (g.coarse ? 5 : 2.5)) return;
      g.moved = true;
      g.last = p;
      g.alt = g.alt || e.altKey;
      this.insertAt = null;
      const v = this.getView(), W = v.cssW, H = v.cssH;
      let dx = p.x - g.start.x, dy = p.y - g.start.y;
      switch (g.kind) {
        case 'anchor': case 'curve': {
          const moving = g.kind === 'curve' ? g.orig.nodes.map((_, i) => i) : g.move;
          this.guides = null;
          if (e.shiftKey) [dx, dy] = snap45(dx, dy, false);
          else if (g.kind === 'anchor' && moving.length === 1 && !(e.ctrlKey || e.metaKey)) [dx, dy] = this._snap(g, moving[0], dx, dy, W, H);
          const def = TM.Path.clone(g.orig);
          for (const j of moving) {
            def.nodes[j].x = g.orig.nodes[j].x + dx / W;
            def.nodes[j].y = g.orig.nodes[j].y + dy / H;
          }
          this._write(def, g, { label: g.kind === 'curve' ? 'Move path' : moving.length > 1 ? 'Move points' : 'Move point' });
          break;
        }
        case 'handle': {
          const def = TM.Path.clone(g.orig), node = def.nodes[g.i];
          let hx = p.x - node.x * W, hy = p.y - node.y * H; // new handle vector in px
          if (e.shiftKey) [hx, hy] = snap45(hx, hy, true);
          if (g.alt) node.k = 'corner';
          setHandle(node, g.side, hx / W, hy / H);
          const other = g.side === 'in' ? 'out' : 'in';
          const len = Math.hypot(hx, hy);
          if (node.k === 'mirror') setHandle(node, other, -hx / W, -hy / H);
          else if (node.k === 'smooth' && len > 1e-6) {
            const [ox, oy] = handleOf(g.orig.nodes[g.i], other);
            const ol = Math.hypot(ox * W, oy * H);
            setHandle(node, other, (-hx / len) * (ol / W), (-hy / len) * (ol / H));
          }
          this._write(def, g, { label: 'Move handle' });
          break;
        }
        case 'bend': {
          // Pull mirrored handles out of a point (the live one follows the pointer).
          const def = TM.Path.clone(g.orig), node = def.nodes[g.i];
          if (e.shiftKey) [dx, dy] = snap45(dx, dy, true);
          const side = !def.closed && g.i === def.nodes.length - 1 ? 'in' : 'out';
          setHandle(node, side, dx / W, dy / H);
          setHandle(node, side === 'in' ? 'out' : 'in', -dx / W, -dy / H);
          node.k = 'mirror';
          this._write(def, g, { label: 'Pull handles' });
          break;
        }
        case 'pen': case 'pen-close': {
          // Drag out symmetric handles from the point just placed (or the start, when closing).
          const pen = this.pen, node = pen.nodes[g.i];
          let hx = p.x - node.x * W, hy = p.y - node.y * H;
          if (e.shiftKey) [hx, hy] = snap45(hx, hy, true);
          node.ox = hx / W; node.oy = hy / H;
          if (g.alt && g.kind === 'pen') node.k = 'corner';
          else { node.ix = -hx / W; node.iy = -hy / H; node.k = 'mirror'; }
          this._penWrite();
          break;
        }
        case 'marquee': {
          const x0 = Math.min(g.start.x, p.x), x1 = Math.max(g.start.x, p.x);
          const y0 = Math.min(g.start.y, p.y), y1 = Math.max(g.start.y, p.y);
          const inside = this.def.nodes.map((n, i) => (n.x * W >= x0 && n.x * W <= x1 && n.y * H >= y0 && n.y * H <= y1 ? i : -1)).filter((i) => i >= 0);
          this._setSel(g.base.concat(inside));
          this.render();
          break;
        }
      }
    }

    /** Smart guides: snap a dragged point to the frame centre lines and other points' x / y. */
    _snap(g, j, dx, dy, W, H) {
      const T = g.coarse ? 9 : 6;
      const o = g.orig.nodes[j], x = o.x * W + dx, y = o.y * H + dy;
      let gx = null, gy = null, bx = T, by = T;
      const xs = [W / 2], ys = [H / 2];
      g.orig.nodes.forEach((n, k) => { if (k !== j) { xs.push(n.x * W); ys.push(n.y * H); } });
      for (const c of xs) { const d = Math.abs(c - x); if (d < bx) { bx = d; gx = c; } }
      for (const c of ys) { const d = Math.abs(c - y); if (d < by) { by = d; gy = c; } }
      this.guides = gx != null || gy != null ? { x: gx, y: gy } : null;
      return [gx != null ? dx + gx - x : dx, gy != null ? dy + gy - y : dy];
    }

    _up(e) {
      const g = this.g;
      if (!g || e.pointerId !== g.id) return;
      this.g = null;
      this.guides = null;
      if (g.moved) this.tap = null; // a drag is not the first half of a double-click
      try { if (this.svg.hasPointerCapture(e.pointerId)) this.svg.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (g.kind === 'draw') { this._finishDraw(g); return; }
      if (g.kind === 'pen-close') { this._endPen(true); return; }
      if (!g.moved) {
        if (g.kind === 'anchor' && g.collapse) this._setSel([g.i]);
        else if (g.kind === 'curve') {
          // A click on a segment selects both of its ends, so their handles show.
          const n = this.def.nodes.length, a = g.hit.seg, b = (a + 1) % n;
          this._setSel(g.shift ? this.sel.concat([a, b]) : [a, b]);
        } else if (g.kind === 'marquee' && !g.shift) this._setSel([]);
      }
      this.render();
    }

    /** Abandon the gesture in progress; revert its edits when `revert`. */
    _cancel(revert = true) {
      const g = this.g;
      if (!g) return;
      this.g = null;
      this.guides = null;
      try { if (this.svg.hasPointerCapture(g.id)) this.svg.releasePointerCapture(g.id); } catch (err) { /* ignore */ }
      if (g.kind === 'pen' || g.kind === 'pen-close') { this.render(); return; } // the pen session owns its edits
      if (revert && g.wrote) { this._self++; try { this.store.undo(); } finally { this._self--; } }
      this.render();
    }

    _hoverAt(p, coarse) {
      if (!this.active) return;
      const tool = this.tool;
      if (tool === 'draw') return;
      if (tool === 'pen') {
        this.penHover = p;
        const pen = this.pen, v = this.getView();
        const close = pen && pen.nodes.length >= 3 && !pen.closed && Math.hypot(pen.nodes[0].x * v.cssW - p.x, pen.nodes[0].y * v.cssH - p.y) < (coarse ? 20 : 12);
        this.hover = close ? { type: 'close' } : null;
        this.render();
        return;
      }
      const hit = this._hit(p, coarse);
      const key = hit ? hit.type + (hit.i != null ? hit.i : '') + (hit.side || '') : '';
      const ins = hit && hit.type === 'curve' ? { x: hit.x, y: hit.y } : null;
      if (key === this._hoverKey && !ins && !this.insertAt) return;
      this._hoverKey = key;
      this.hover = hit;
      this.insertAt = ins;
      this.render();
    }

    // ── pen tool ──
    _penDown(e, p, g) {
      const v = this.getView(), W = v.cssW, H = v.cssH;
      if (!this.pen) this.pen = { key: 'path-pen-' + ++this.uid, wrote: false, orig: TM.Path.clone(this.def), nodes: [], closed: false };
      const pen = this.pen, nodes = pen.nodes;
      this._setSel([]);
      if (nodes.length >= 3 && !pen.closed) {
        const f = nodes[0];
        if (Math.hypot(f.x * W - p.x, f.y * H - p.y) < (g.coarse ? 20 : 12)) {
          pen.closed = true;
          this._penWrite();
          this.g = Object.assign(g, { kind: 'pen-close', i: 0 });
          return;
        }
      }
      let q = p;
      if (e.shiftKey && nodes.length) {
        const l = nodes[nodes.length - 1], [dx, dy] = snap45(p.x - l.x * W, p.y - l.y * H, false);
        q = { x: l.x * W + dx, y: l.y * H + dy };
      }
      nodes.push({ x: q.x / W, y: q.y / H, ix: 0, iy: 0, ox: 0, oy: 0, k: 'corner' });
      this._penWrite();
      this.g = Object.assign(g, { kind: 'pen', i: nodes.length - 1 });
    }

    /** Push the pen's path to the store once it has two points (the session is one undo step). */
    _penWrite() {
      const pen = this.pen;
      if (pen && pen.nodes.length >= 2) this._write({ closed: pen.closed && pen.nodes.length > 2, nodes: pen.nodes }, pen, { label: 'Pen path' });
      else this.render();
    }

    /** Backspace while drawing with the pen: drop the last point. */
    penBackspace() {
      const pen = this.pen;
      if (!pen || !pen.nodes.length) return false;
      pen.nodes.pop();
      pen.closed = false;
      if (pen.nodes.length >= 2) this._penWrite();
      else if (pen.wrote) {
        // Fewer than two points: put back the path the pen started from.
        this._self++;
        try { this.store.undo(); } finally { this._self--; }
        pen.wrote = false;
      }
      if (!pen.nodes.length) this.pen = null;
      this.render();
      return true;
    }

    /** End the pen session (keep a path of two or more points), then back to point editing. */
    _endPen(keep) {
      const pen = this.pen;
      if (!pen) return;
      this.pen = null;
      this.penHover = null;
      if ((!keep || pen.nodes.length < 2) && pen.wrote) { this._self++; try { this.store.undo(); } finally { this._self--; } }
      if (this.store.ui.editPath && this.tool === 'pen' && keep) this.store.setUI({ pathTool: 'edit', pathSel: [] });
      else this.render();
    }

    // ── freehand drawing ──
    _closes(pts) {
      if (pts.length < 8) return false;
      const v = this.getView(), r = Math.max(14, Math.min(v.cssW, v.cssH) * 0.05);
      const a = pts[0], b = pts[pts.length - 1];
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      return Math.hypot(a.x - b.x, a.y - b.y) < r && len > r * 5;
    }

    _finishDraw(g) {
      const v = this.getView(), W = v.cssW, H = v.cssH, unit = Math.min(W, H);
      let pts = g.pts;
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (pts.length < 3 || len < Math.max(16, unit * 0.04)) { this.render(); return; } // a tap, not a stroke
      const closed = this._closes(pts);
      if (closed) {
        // Drop the tail that runs back over the start, so the seam closes cleanly.
        const r = Math.max(14, unit * 0.05) * 0.6, s0 = pts[0];
        let k = pts.length - 1;
        while (k > pts.length * 0.8 && Math.hypot(pts[k].x - s0.x, pts[k].y - s0.y) < r) k--;
        pts = pts.slice(0, k + 1);
      }
      let tol = Math.max(1.5, Math.min(5, unit * 0.006));
      let def = TM.Path.fit(pts, tol, { closed, smooth: 2, W, H });
      for (let k = 0; def && def.nodes.length > MAX_DRAWN_NODES && k < 6; k++) {
        tol *= 1.6;
        def = TM.Path.fit(pts, tol, { closed, smooth: 2, W, H });
      }
      if (!def || def.nodes.length < 2) { this.render(); return; }
      this._write(def, null, { reason: 'path-draw', label: 'Draw path' });
      this.store.setUI({ pathTool: 'edit', pathSel: [] });
      if (Studio.toast) Studio.toast((def.closed ? 'Closed path' : 'Path') + ' drawn · ' + def.nodes.length + ' points · drag to refine');
    }

    // ── commands (also used by the toolbar) ──
    toggleKind(indices = this.sel) {
      const def = this.def;
      if (!def || !indices.length) return;
      // One rule for the whole selection: all corners → smooth, otherwise → corners.
      const toSmooth = indices.every((i) => def.nodes[i] && def.nodes[i].k === 'corner');
      const out = toSmooth ? TM.Path.setKind(def, indices, 'smooth', this.aspect) : TM.Path.retract(def, indices);
      this._write(out, null, { label: toSmooth ? 'Smooth point' : 'Corner point' });
      this._setSel(indices);
    }

    deleteSelected() {
      const def = this.def, sel = this.sel.filter((i) => i < (def ? def.nodes.length : 0));
      if (!def || !sel.length) return;
      if (def.nodes.length <= 2) { if (Studio.toast) Studio.toast('A path needs at least two points'); return; }
      this._write(TM.Path.removeNodes(def, sel, this.aspect), null, { label: sel.length > 1 ? 'Delete points' : 'Delete point' });
      this._setSel([]);
    }

    setClosed(closed) {
      const def = this.def;
      if (!def || !!def.closed === !!closed) return;
      if (closed && def.nodes.length < 3) { if (Studio.toast) Studio.toast('A closed path needs at least three points'); return; }
      const out = TM.Path.clone(def);
      out.closed = !!closed;
      this._write(out, null, { label: closed ? 'Close path' : 'Open path' });
    }

    nudge(dx, dy) {
      const def = this.def, v = this.getView(), sel = this.sel.filter((i) => i < def.nodes.length);
      if (!sel.length) return;
      const out = TM.Path.clone(def);
      for (const i of sel) { out.nodes[i].x += dx / v.cssW; out.nodes[i].y += dy / v.cssH; }
      this._write(out, null, { coalesce: 'path-nudge', label: 'Nudge points' });
    }

    // ── keyboard ──
    _onKey(e) {
      if (!this.active || typingIn(e.target) || (e.target && e.target.closest && e.target.closest('[role="dialog"]'))) return;
      const k = e.key, mod = e.metaKey || e.ctrlKey;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (this.tool === 'pen' && this.pen) {
        if (k === 'Enter' || k === 'Escape') { stop(); this._cancel(false); this._endPen(true); return; }
        if (k === 'Backspace' || k === 'Delete' || (mod && k.toLowerCase() === 'z' && !e.shiftKey)) { stop(); if (!this.g) this.penBackspace(); return; }
      }
      if (k === 'Escape') {
        if (this.g) { stop(); this._cancel(true); }
        else if (this.tool !== 'edit') { stop(); this.store.setUI({ pathTool: 'edit' }); }
        return; // otherwise app.js leaves edit mode
      }
      if (this.g) { if (mod) stop(); return; } // no undo / select-all in the middle of a drag
      if (!mod && !e.altKey && (k === 'd' || k === 'D')) { stop(); this.store.setUI({ pathTool: this.tool === 'draw' ? 'edit' : 'draw' }); return; }
      if (this.tool !== 'edit') return;
      if (mod && k.toLowerCase() === 'a') { stop(); this._setSel(this.def.nodes.map((_, i) => i)); return; }
      if (mod || e.altKey) return;
      if ((k === 'Delete' || k === 'Backspace') && this.sel.length) { stop(); this.deleteSelected(); return; }
      if (k.startsWith('Arrow') && this.sel.length) {
        stop();
        const s = e.shiftKey ? 10 : 1;
        this.nudge(k === 'ArrowLeft' ? -s : k === 'ArrowRight' ? s : 0, k === 'ArrowUp' ? -s : k === 'ArrowDown' ? s : 0);
        return;
      }
    }
  }

  Studio.PathEditor = PathEditor;
})(window.TM);
