/* TYPOMAN studio — on-canvas bézier path editor and freehand drawing.
 *
 *   new TM.Studio.PathEditor(store, svgOverlay, () => view)        (constructed by app.js)
 *
 * Active while store.ui.editPath is on and the selected layer's preset uses a path; it renders
 * nothing otherwise, so the preview stays clean. Every edit goes through store.updateLayer
 * (one undo step per gesture) and drops path.preset, which marks the shape as custom.
 *
 * Shared state on store.ui (the Path panel reads and writes the same keys):
 *   editPath   on-canvas editing        pathTarget 'a' main path | 'b' morph target
 *   drawPath   freehand drawing mode    pathSel    selected node indices
 *
 * Gestures (mouse, pen and touch): drag a point, a handle, the curve (moves the whole path)
 * or empty space (marquee). Double-click the curve to insert a point, a point to toggle
 * corner ↔ smooth. Alt-drag a handle to break it, Alt-drag a point to pull out new handles,
 * Shift constrains to 45°, Ctrl/⌘ disables snapping. Keys: Delete/Backspace, arrows
 * (Shift ×10), ⌘A, D (draw), Esc (cancel drag → leave draw → leave editing, in app.js).
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const NS = 'http://www.w3.org/2000/svg';
  const DOUBLE_MS = 380;
  const DOUBLE_PX = 12;
  const MAX_DRAWN_NODES = 64;

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
    edit: '<path d="M4 19c2.5-8.5 13.5-8.5 16 0"/><path d="M5 9h14"/><rect x="9.8" y="6.8" width="4.4" height="4.4" rx=".6"/>',
    draw: '<path d="M3 16.5c3-1 3.6-7 7-7s2.8 6.5 6.3 6.5c2.4 0 3.5-3 4.7-6"/>',
    point: '<path d="M3 12h5.2M15.8 12H21"/><circle cx="12" cy="12" r="3.2"/>',
    trash: '<path d="M4 7h16"/><path d="M10 7V4h4v3"/><path d="M6.5 7l1 13h9l1-13"/>',
    closed: '<circle cx="12" cy="12" r="7"/>',
    open: '<path d="M8.6 5.9a7 7 0 1 0 6.8 0"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
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
  };
  function icon(name) {
    const t = document.createElement('template');
    t.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
    return t.content.firstChild;
  }
  Studio.pathIcon = icon;

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

  // ───────────────────────────── editor ─────────────────────────────
  class PathEditor {
    constructor(store, svg, getView) {
      this.store = store;
      this.svg = svg;
      this.getView = getView;
      this.g = null; //        gesture in progress
      this.hover = null; //    hit under an idle pointer
      this.tap = null; //      last press, for double-click / double-tap
      this.guides = null; //   active snapping guides { x, y } in px
      this.uid = 0;
      this.stage = svg.closest('.stage') || (svg.parentElement && svg.parentElement.parentElement);
      this._build();

      store.on('change', () => this._onChange());
      store.on('select', () => { this._cancel(false); this._setSel([]); this.render(); });
      store.on('ui', (patch) => this._onUI(patch || {}));
      store.on('view', () => this.render());

      const down = (e) => this._down(e);
      svg.addEventListener('pointerdown', down);
      // Presses on the stage around the artboard reach points dragged outside the frame.
      if (this.stage) {
        this.stage.addEventListener('pointerdown', (e) => { if (e.target === this.stage) down(e); });
        this.stage.addEventListener('pointermove', (e) => { if (!this.g && e.target === this.stage) this._move(e); });
      }
      svg.addEventListener('pointermove', (e) => this._move(e));
      svg.addEventListener('pointerup', (e) => this._up(e));
      svg.addEventListener('pointercancel', (e) => this._up(e));
      svg.addEventListener('lostpointercapture', (e) => { if (this.g && e.pointerId === this.g.id) this._up(e); });
      svg.addEventListener('pointerleave', () => { if (!this.g && (this.hover || this.insertAt)) { this.hover = null; this.insertAt = null; this.render(); } });
      svg.addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); });
      window.addEventListener('keydown', (e) => this._onKey(e), true);
      this.render();
    }

    // ── state ──
    get active() {
      const s = this.store;
      return !!(s.ui.editPath && s.preset && s.preset.usesPath && s.layer.path);
    }
    /** 'b' when the morph target is being edited, else 'a'. */
    get target() {
      const s = this.store, pm = s.layer.pathMorph;
      return s.ui.pathTarget === 'b' && pm && pm.enabled && pm.target ? 'b' : 'a';
    }
    get def() {
      return this.target === 'b' ? this.store.layer.pathMorph.target : this.store.layer.path;
    }
    /** The other path of a morph, drawn dashed for reference. */
    get ghost() {
      const l = this.store.layer, pm = l.pathMorph;
      if (this.target === 'b') return l.path;
      return pm && pm.enabled && pm.target ? pm.target : null;
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

    _onChange() {
      const s = this.store;
      if (s.ui.editPath && !(s.preset && s.preset.usesPath)) {
        // The new preset has no path: leave editing instead of capturing clicks for nothing.
        this._cancel(false);
        s.setUI({ editPath: false, drawPath: false, pathSel: [] });
        return;
      }
      if (s.ui.pathTarget === 'b' && this.target !== 'b') s.setUI({ pathTarget: 'a', pathSel: [] });
      const def = this.def;
      if (def && this.sel.some((i) => i >= def.nodes.length)) this._setSel(this.sel.filter((i) => i < def.nodes.length));
      this.render();
    }

    _onUI(patch) {
      const ui = this.store.ui;
      if ('editPath' in patch && !ui.editPath) {
        this._cancel(false);
        this.hover = this.insertAt = null;
        const reset = {};
        if (ui.drawPath) reset.drawPath = false;
        if (this.sel.length) reset.pathSel = [];
        if (Object.keys(reset).length) this.store.setUI(reset);
      }
      if ('pathTarget' in patch && this.sel.length && !('pathSel' in patch)) this.store.setUI({ pathSel: [] });
      if ('drawPath' in patch && this.g && this.g.kind === 'draw' && !ui.drawPath) this._cancel(false);
      if (['editPath', 'drawPath', 'pathTarget', 'pathSel'].some((k) => k in patch)) this.render();
    }

    // ── DOM ──
    _build() {
      const root = (this.root = svgEl('g', 'pe'));
      root.setAttribute('aria-hidden', 'true');
      this.ghostU = svgEl('path', 'pe-ghost-u', root);
      this.ghostP = svgEl('path', 'pe-ghost', root);
      this.curveU = svgEl('path', 'pe-curve-u', root);
      this.curveP = svgEl('path', 'pe-curve', root);
      this.guideP = svgEl('path', 'pe-guides', root);
      this.dirP = svgEl('path', 'pe-dir', root);
      this.stemsU = svgEl('path', 'pe-stems-u', root);
      this.stemsP = svgEl('path', 'pe-stems', root);
      this.knobs = new Pool(svgEl('g', 'pe-knobs', root), 'circle', 'pe-knob');
      this.anchors = new Pool(svgEl('g', 'pe-anchors', root), 'path', 'pe-anchor');
      this.insertP = svgEl('circle', 'pe-insert', root);
      this.marquee = svgEl('rect', 'pe-marquee', root);
      this.drawU = svgEl('polyline', 'pe-draw-u', root);
      this.drawP = svgEl('polyline', 'pe-draw', root);
      this.closeP = svgEl('circle', 'pe-close', root);
      this.tagA = svgEl('text', 'pe-tag', root);
      this.tagB = svgEl('text', 'pe-tag pe-tag-ghost', root);
      this.svg.appendChild(root);
      this._buildBar();
    }

    _buildBar() {
      const h = Studio.h;
      const host = this.svg.parentElement;
      if (!h || !host) return;
      const btn = (act, ico, label, extra) => {
        const b = h('button', Object.assign({ type: 'button', 'data-act': act, title: label, 'aria-label': label }, extra), ico ? icon(ico) : null);
        b.addEventListener('click', () => this._barAction(act));
        return b;
      };
      this.barA = btn('a', null, 'Edit the main path (A)', { class: 'pe-ab' });
      this.barA.textContent = 'A';
      this.barB = btn('b', null, 'Edit the morph target (B)', { class: 'pe-ab' });
      this.barB.textContent = 'B';
      this.barAB = h('div', { class: 'pe-abs', role: 'group', 'aria-label': 'Path to edit' }, this.barA, this.barB);
      this.barDraw = btn('draw', 'draw', 'Draw freehand (D)');
      this.barKind = btn('kind', 'point', 'Corner ↔ smooth (or double-click a point; Alt-drag a point to pull handles)');
      this.barDel = btn('delete', 'trash', 'Delete selected points (Del)');
      this.barClose = btn('close', 'closed', 'Close the path');
      this.barHint = h('span', { class: 'pe-hint' }, 'Draw a path · release to finish · Esc to stop');
      this.barDone = btn('done', 'check', 'Finish editing (Esc)', { class: 'pe-done' });
      this.barDone.append(h('span', null, 'Done'));
      this.bar = h('div', { class: 'pe-bar', role: 'toolbar', 'aria-label': 'Path tools', hidden: true },
        this.barAB, this.barDraw, this.barHint, this.barKind, this.barDel, this.barClose, h('span', { class: 'pe-sep', 'aria-hidden': 'true' }), this.barDone);
      // Keep presses on the toolbar from reaching the stage's editor handlers.
      this.bar.addEventListener('pointerdown', (e) => e.stopPropagation());
      host.appendChild(this.bar);
    }

    _barAction(act) {
      const s = this.store;
      if (!this.active) return;
      switch (act) {
        case 'a': case 'b': s.setUI({ pathTarget: act, pathSel: [] }); break;
        case 'draw': s.setUI({ drawPath: !s.ui.drawPath }); break;
        case 'kind': this.toggleKind(); break;
        case 'delete': this.deleteSelected(); break;
        case 'close': this.setClosed(!this.def.closed); break;
        case 'done': s.setUI({ editPath: false }); break;
      }
    }

    _syncBar(on, W, H) {
      if (!this.bar) return;
      this.bar.hidden = !on;
      if (!on) return;
      const s = this.store, def = this.def, drawing = !!s.ui.drawPath;
      const pm = s.layer.pathMorph, morph = !!(pm && pm.enabled && pm.target);
      this.barAB.hidden = !morph;
      this.barA.classList.toggle('on', this.target === 'a');
      this.barB.classList.toggle('on', this.target === 'b');
      this.barA.setAttribute('aria-pressed', String(this.target === 'a'));
      this.barB.setAttribute('aria-pressed', String(this.target === 'b'));
      this.barDraw.classList.toggle('on', drawing);
      this.barDraw.setAttribute('aria-pressed', String(drawing));
      this.barHint.hidden = !drawing;
      this.barKind.hidden = this.barDel.hidden = this.barClose.hidden = drawing;
      const n = this.sel.length;
      this.barKind.disabled = !n;
      this.barDel.disabled = !n || def.nodes.length <= 2;
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
      // Dodge to the top edge when points sit under the toolbar (size measured once per layout).
      const layoutKey = [drawing, morph, W, H].join();
      if (layoutKey !== this._barKey) { this._barKey = layoutKey; this._barSize = [this.bar.offsetWidth || 240, this.bar.offsetHeight || 36]; }
      const [bw, bh] = this._barSize;
      const under = def.nodes.some((p) => p.y * H > H - bh - 24 && Math.abs(p.x * W - W / 2) < bw / 2 + 16);
      this.bar.classList.toggle('at-top', under);
    }

    // ── rendering ──
    render() {
      if (!this.root.isConnected) this.svg.appendChild(this.root);
      const v = this.getView && this.getView();
      const on = !!(this.active && v && v.cssW > 0 && v.cssH > 0);
      this.root.style.display = on ? '' : 'none';
      this.svg.toggleAttribute('data-pe-drawing', on && !!this.store.ui.drawPath);
      this._syncBar(on, on ? v.cssW : 0, on ? v.cssH : 0);
      if (!on) { this.svg.removeAttribute('data-pe-cursor'); return; }
      const W = v.cssW, H = v.cssH, def = this.def, ghost = this.ghost;
      const drawing = !!this.store.ui.drawPath, g = this.g;
      this.root.setAttribute('data-target', this.target);
      this.root.classList.toggle('is-drawing', drawing);

      const d = TM.Path.toSVG(def, W, H);
      this.curveU.setAttribute('d', d);
      this.curveP.setAttribute('d', d);
      const gd = ghost ? TM.Path.toSVG(ghost, W, H) : '';
      this.ghostU.setAttribute('d', gd);
      this.ghostP.setAttribute('d', gd);
      this._tags(def, ghost, W, H);

      // Direction of travel: a small arrow just after the start point.
      const n0 = def.nodes[0], sg = TM.Path.segments(def, W, H)[0];
      let dir = null;
      if (sg) {
        for (const [x, y] of [[sg[2], sg[3]], [sg[4], sg[5]], [sg[6], sg[7]]]) {
          const l = Math.hypot(x - sg[0], y - sg[1]);
          if (l > 0.5) { dir = [(x - sg[0]) / l, (y - sg[1]) / l]; break; }
        }
      }
      if (dir && !drawing) {
        const x = n0.x * W, y = n0.y * H, [tx, ty] = dir;
        const bx = x + tx * 11, by = y + ty * 11, ex = x + tx * 18, ey = y + ty * 18;
        this.dirP.setAttribute('d', `M${f2(ex)} ${f2(ey)}L${f2(bx - ty * 3.6)} ${f2(by + tx * 3.6)}L${f2(bx + ty * 3.6)} ${f2(by - tx * 3.6)}Z`);
      } else this.dirP.setAttribute('d', '');

      // Handles: on selected points, plus the neighbours' handles that shape the same segments.
      const handles = drawing ? [] : this._visibleHandles(def, W, H);
      let stems = '';
      handles.forEach((hd, k) => {
        stems += `M${f2(hd.ax)} ${f2(hd.ay)}L${f2(hd.x)} ${f2(hd.y)}`;
        const knob = this.knobs.get(k);
        const hot = (this.hover && this.hover.type === 'handle' && this.hover.i === hd.i && this.hover.side === hd.side) || (g && g.kind === 'handle' && g.i === hd.i && g.side === hd.side);
        knob.setAttribute('cx', f2(hd.x));
        knob.setAttribute('cy', f2(hd.y));
        knob.setAttribute('r', hot ? 4.4 : 3.4);
        knob.setAttribute('class', 'pe-knob' + (hot ? ' is-hot' : ''));
      });
      this.knobs.trim(handles.length);
      this.stemsU.setAttribute('d', stems);
      this.stemsP.setAttribute('d', stems);

      // Anchors: squares for corners, circles for smooth / mirror points.
      const sel = new Set(this.sel);
      const nodes = drawing ? [] : def.nodes;
      nodes.forEach((p, i) => {
        const a = this.anchors.get(i);
        const hot = this.hover && this.hover.type === 'anchor' && this.hover.i === i;
        const corner = p.k === 'corner';
        const r = (corner ? 3.9 : 4.4) + (hot ? 1.4 : 0) + (i === 0 ? 0.5 : 0);
        a.setAttribute('d', corner ? square(p.x * W, p.y * H, r) : ring(p.x * W, p.y * H, r));
        a.setAttribute('class', 'pe-anchor' + (corner ? ' is-corner' : '') + (sel.has(i) ? ' is-sel' : '') + (hot ? ' is-hot' : '') + (i === 0 ? ' is-start' : ''));
      });
      this.anchors.trim(nodes.length);

      // Insert preview: where a double-click on the curve would add a point.
      const ins = !g && !drawing && this.insertAt;
      this.insertP.setAttribute('r', ins ? 3.6 : 0);
      if (ins) { this.insertP.setAttribute('cx', f2(ins.x)); this.insertP.setAttribute('cy', f2(ins.y)); }

      // Marquee and snapping guides.
      if (g && g.kind === 'marquee' && g.moved) {
        const x = Math.min(g.start.x, g.last.x), y = Math.min(g.start.y, g.last.y);
        this.marquee.setAttribute('x', f2(x));
        this.marquee.setAttribute('y', f2(y));
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
        const s0 = g.pts[0];
        this.closeP.setAttribute('cx', f2(s0.x));
        this.closeP.setAttribute('cy', f2(s0.y));
        this.closeP.setAttribute('r', 6);
        this.closeP.classList.toggle('is-on', !!g.closing);
      } else {
        this.drawU.setAttribute('points', '');
        this.drawP.setAttribute('points', '');
        this.closeP.setAttribute('r', 0);
      }
      this._cursor();
    }

    _tags(def, ghost, W, H) {
      const show = !!ghost && !this.store.ui.drawPath;
      const place = (el, d, text) => {
        if (!show || !d) { el.textContent = ''; return; }
        el.textContent = text;
        el.setAttribute('x', f2(d.nodes[0].x * W - 9));
        el.setAttribute('y', f2(d.nodes[0].y * H - 9));
      };
      place(this.tagA, def, this.target === 'b' ? 'B' : 'A');
      place(this.tagB, ghost, this.target === 'b' ? 'A' : 'B');
    }

    _cursor() {
      const g = this.g, hv = this.hover;
      let c = '';
      if (this.store.ui.drawPath) c = 'draw';
      else if (g) c = g.kind === 'marquee' ? '' : 'grabbing';
      else if (hv) c = hv.type === 'curve' ? 'move' : 'point';
      if (c) this.svg.setAttribute('data-pe-cursor', c); else this.svg.removeAttribute('data-pe-cursor');
    }

    /** Handles worth showing: on selected points and the neighbours' facing handles. */
    _visibleHandles(def, W, H) {
      const nodes = def.nodes, n = nodes.length, out = [], seen = new Set();
      const g = this.g;
      const add = (i, side) => {
        const key = i + side;
        if (seen.has(key) || !isLive(def, i, side)) return;
        const p = nodes[i], [hx, hy] = handleOf(p, side);
        const dragging = g && g.kind === 'handle' && g.i === i && g.side === side;
        if (!dragging && Math.hypot(hx * W, hy * H) < 0.75) return;
        seen.add(key);
        out.push({ i, side, ax: p.x * W, ay: p.y * H, x: (p.x + hx) * W, y: (p.y + hy) * H });
      };
      for (const i of this.sel) {
        if (i >= n) continue;
        add(i, 'in');
        add(i, 'out');
        if (def.closed || i > 0) add((i - 1 + n) % n, 'out');
        if (def.closed || i < n - 1) add((i + 1) % n, 'in');
      }
      return out;
    }

    // ── hit testing (manual: nearest target wins, sized for fingers on touch) ──
    _hit(p, coarse) {
      const v = this.getView(), W = v.cssW, H = v.cssH, def = this.def;
      const R = coarse ? 20 : 12;
      let best = null, score = Infinity;
      for (const hd of this._visibleHandles(def, W, H)) {
        const d = Math.hypot(hd.x - p.x, hd.y - p.y) + 1; // anchors win ties
        if (d < R && d < score) { score = d; best = { type: 'handle', i: hd.i, side: hd.side }; }
      }
      def.nodes.forEach((n, i) => {
        const d = Math.hypot(n.x * W - p.x, n.y * H - p.y);
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

    // ── store writes ──
    /** Write `def` to the edited path. Gestures pass g: one undo step however long the drag. */
    _write(def, g, opts) {
      const target = this.target;
      const nd = TM.Path.clone(def);
      delete nd.preset;
      const o = Object.assign({ reason: 'path' }, opts);
      if (g) { o.coalesce = g.key; o.history = !g.wrote; g.wrote = true; }
      this.store.updateLayer((layer) => {
        if (target === 'b') { if (layer.pathMorph) layer.pathMorph.target = nd; } else layer.path = nd;
      }, o);
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
      if (this.store.ui.drawPath) {
        this.g = Object.assign(g, { kind: 'draw', pts: [p], closing: false });
        this.render();
        return;
      }
      const hit = this._hit(p, coarse);
      const now = performance.now(), last = this.tap;
      const twice = last && hit && now - last.time < DOUBLE_MS && Math.hypot(last.x - p.x, last.y - p.y) < (coarse ? DOUBLE_PX * 2 : DOUBLE_PX) &&
        last.hit && last.hit.type === hit.type && (hit.type !== 'anchor' || last.hit.i === hit.i);
      this.tap = twice ? null : { time: now, x: p.x, y: p.y, hit };
      if (twice && hit.type === 'anchor') { this.toggleKind([hit.i]); return; }
      if (twice && hit.type === 'curve') {
        // Insert, then keep dragging the new point: insert + move is a single undo step.
        const def = TM.Path.split(this.def, hit.seg, hit.t);
        this._write(def, g);
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
          this._write(def, g);
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
          this._write(def, g);
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
          this._write(def, g);
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
      if (revert && g.wrote) this.store.undo();
      this.render();
    }

    _hoverAt(p, coarse) {
      if (!this.active || this.store.ui.drawPath) return;
      const hit = this._hit(p, coarse);
      const key = hit ? hit.type + (hit.i != null ? hit.i : '') + (hit.side || '') : '';
      const ins = hit && hit.type === 'curve' ? { x: hit.x, y: hit.y } : null;
      if (key === this._hoverKey && !ins && !this.insertAt) return;
      this._hoverKey = key;
      this.hover = hit;
      this.insertAt = ins;
      this.render();
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
      this._write(def, null, { reason: 'path-draw' });
      this.store.setUI({ drawPath: false, pathSel: [] });
      if (Studio.toast) Studio.toast((def.closed ? 'Closed path' : 'Path') + ' drawn · ' + def.nodes.length + ' points · drag to refine');
    }

    // ── commands (also used by the toolbar) ──
    toggleKind(indices = this.sel) {
      const def = this.def;
      if (!def || !indices.length) return;
      // One rule for the whole selection: all corners → smooth, otherwise → corners.
      const toSmooth = indices.every((i) => def.nodes[i] && def.nodes[i].k === 'corner');
      const out = toSmooth ? TM.Path.setKind(def, indices, 'smooth', this.aspect) : TM.Path.retract(def, indices);
      this._write(out);
      this._setSel(indices);
    }

    deleteSelected() {
      const def = this.def, sel = this.sel.filter((i) => i < (def ? def.nodes.length : 0));
      if (!def || !sel.length) return;
      if (def.nodes.length <= 2) { if (Studio.toast) Studio.toast('A path needs at least two points'); return; }
      this._write(TM.Path.removeNodes(def, sel, this.aspect));
      this._setSel([]);
    }

    setClosed(closed) {
      const def = this.def;
      if (!def || !!def.closed === !!closed) return;
      if (closed && def.nodes.length < 3) { if (Studio.toast) Studio.toast('A closed path needs at least three points'); return; }
      const out = TM.Path.clone(def);
      out.closed = !!closed;
      this._write(out);
    }

    nudge(dx, dy) {
      const def = this.def, v = this.getView(), sel = this.sel.filter((i) => i < def.nodes.length);
      if (!sel.length) return;
      const out = TM.Path.clone(def);
      for (const i of sel) { out.nodes[i].x += dx / v.cssW; out.nodes[i].y += dy / v.cssH; }
      this._write(out, null, { coalesce: 'path-nudge' });
    }

    // ── keyboard ──
    _onKey(e) {
      if (!this.active || typingIn(e.target) || (e.target && e.target.closest && e.target.closest('[role="dialog"]'))) return;
      const k = e.key, mod = e.metaKey || e.ctrlKey;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (k === 'Escape') {
        if (this.g) { stop(); this._cancel(true); }
        else if (this.store.ui.drawPath) { stop(); this.store.setUI({ drawPath: false }); }
        return; // otherwise app.js leaves edit mode
      }
      if (this.g) { if (mod) stop(); return; } // no undo / select-all in the middle of a drag
      if (mod && k.toLowerCase() === 'a') { stop(); this._setSel(this.def.nodes.map((_, i) => i)); return; }
      if (mod || e.altKey) return;
      if ((k === 'Delete' || k === 'Backspace') && this.sel.length) { stop(); this.deleteSelected(); return; }
      if (k.startsWith('Arrow') && this.sel.length) {
        stop();
        const s = e.shiftKey ? 10 : 1;
        this.nudge(k === 'ArrowLeft' ? -s : k === 'ArrowRight' ? s : 0, k === 'ArrowUp' ? -s : k === 'ArrowDown' ? s : 0);
        return;
      }
      if (k === 'd' || k === 'D') { stop(); this.store.setUI({ drawPath: !this.store.ui.drawPath }); }
    }
  }

  Studio.PathEditor = PathEditor;
})(window.TM);
