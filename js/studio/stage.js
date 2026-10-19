/* TYPOMAN studio — stage: the artboard, zoom, on-canvas selection and moving.
 *
 *   new TM.Studio.Stage(store)
 *   stage.view        { cssW, cssH, scale, zoom, fit }  artboard CSS size; scale = CSS px per output px
 *   stage.layout()    resize the artboard (emits store 'view' with the view above)
 *   stage.render(t)   draw the frame at loop time t
 *   stage.setZoom(z)  'fit' or CSS px per output px; Ctrl/⌘ + wheel zooms around the pointer
 *
 * Click a layer's text to select it; drag to move its anchor (looks that follow a path, or that
 * fill the frame, can't be moved this way). With the artboard focused, arrow keys nudge.
 * The preview canvas is capped at 1920×1080 backing pixels; CSS scales it up beyond that.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const UI = Studio.ui;
  const $ = (sel) => document.querySelector(sel);
  const PREVIEW_MAX_PIXELS = 1920 * 1080;
  const ZOOMS = [0.1, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5, 2, 3, 4];
  const SNAP_PX = 6;

  class Stage {
    constructor(store) {
      this.store = store;
      this.wrap = $('#stage');
      this.inner = this.wrap.querySelector('.stage-inner');
      this.frameEl = $('#frame');
      this.board = $('#artboard');
      this.canvas = $('#stageCanvas');
      this.overlay = $('#pathOverlay');
      this.selBox = $('#selBox');
      this.hoverBox = $('#hoverBox');
      this.snapV = $('#snapV');
      this.snapH = $('#snapH');
      this.empty = $('#artEmpty');
      this.renderer = new TM.Renderer(this.canvas, { quality: 'preview' });
      this.renderer.setScene(store.scene);
      this.view = { cssW: 0, cssH: 0, scale: 1, zoom: 1, fit: 1 };
      this.dirty = true;
      this._anchorCache = new Map();
      this._dpr = 0;
      new ResizeObserver(() => this.layout()).observe(this.wrap);
      store.on('change', (d) => {
        this.renderer.setScene(store.scene);
        this.layout();
        this.dirty = true;
        if (d && d.reason === 'preset') this._anchorCache.clear();
        this.refreshSelection();
        this.updateEmpty();
        this.updateLabel();
      });
      store.on('select', () => { this.refreshSelection(); this.updateEmpty(); });
      store.on('ui', (patch) => {
        if ('zoom' in patch || 'clean' in patch) this.layout(true);
        if ('editPath' in patch || 'clean' in patch) this.refreshSelection();
        if ('time' in patch) this.dirty = true;
      });
      this.watchDpr();
      this.wirePointer();
      this.wireKeys();
      this.wireWheel();
      this.layout();
      this.updateEmpty();
      this.updateLabel();
    }

    // ───────────────────────────── layout ─────────────────────────────
    layout(force) {
      const { w, h: hh } = this.store.scene.size;
      const cw = this.wrap.clientWidth, ch = this.wrap.clientHeight;
      if (!cw || !ch) return;
      const ui = this.store.ui;
      const small = cw < 600;
      const pad = ui.clean ? 28 : small ? 12 : 40;
      const padTop = ui.clean ? 28 : small ? 12 : 48; // room for the artboard label
      const availW = Math.max(40, cw - pad * 2), availH = Math.max(40, ch - padTop - pad);
      const fit = Math.min(availW / w, availH / hh);
      const zoom = ui.zoom === 'fit' || ui.clean ? fit : +ui.zoom || fit;
      const cssW = Math.max(8, Math.round(w * zoom)), cssH = Math.max(8, Math.round(hh * zoom));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.inner.style.padding = `${padTop}px ${pad}px ${pad}px`;
      if (!force && cssW === this.view.cssW && cssH === this.view.cssH && this._ow === w && this._oh === hh && dpr === this._dpr && Math.abs(fit - this.view.fit) < 1e-6) return;
      this._ow = w;
      this._oh = hh;
      this._dpr = dpr;
      this.board.style.width = cssW + 'px';
      this.board.style.height = cssH + 'px';
      let bw = cssW * dpr, bh = cssH * dpr;
      const px = bw * bh;
      if (px > PREVIEW_MAX_PIXELS) { const s = Math.sqrt(PREVIEW_MAX_PIXELS / px); bw *= s; bh *= s; }
      this.renderer.resize(bw, bh);
      this.overlay.setAttribute('viewBox', `0 0 ${cssW} ${cssH}`);
      this.overlay.setAttribute('width', cssW);
      this.overlay.setAttribute('height', cssH);
      this.view = { cssW, cssH, scale: cssW / w, zoom, fit };
      this.board.classList.toggle('story', hh / w > 1.6);
      this.wrap.classList.toggle('zoomed', ui.zoom !== 'fit' && !ui.clean && (cssW > availW + 1 || cssH > availH + 1));
      this.dirty = true;
      this.refreshSelection();
      this.store.emit('view', this.view);
      if (this.onZoom) this.onZoom(this.view);
    }

    render(t) {
      this.renderer.render(t);
    }

    watchDpr() {
      if (!window.matchMedia) return;
      const listen = () => {
        const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
        const on = () => { mq.removeEventListener('change', on); this.layout(true); listen(); };
        mq.addEventListener('change', on);
      };
      listen();
    }

    // ───────────────────────────── zoom ─────────────────────────────
    zoomLabel() {
      return this.store.ui.zoom === 'fit' ? 'Fit · ' + Math.round(this.view.fit * 100) + '%' : Math.round(this.view.zoom * 100) + '%';
    }

    /** Set zoom ('fit' or a scale), keeping the point under (clientX, clientY) still. */
    setZoom(z, clientX, clientY) {
      const next = z === 'fit' ? 'fit' : TM.math.clamp(+z, 0.05, 8);
      const wr = this.wrap.getBoundingClientRect();
      const br = this.board.getBoundingClientRect();
      const cx = clientX != null ? clientX : wr.left + wr.width / 2;
      const cy = clientY != null ? clientY : wr.top + wr.height / 2;
      const fx = br.width ? (cx - br.left) / br.width : 0.5, fy = br.height ? (cy - br.top) / br.height : 0.5;
      this.store.setUI({ zoom: next });
      if (next === 'fit') return;
      const nr = this.board.getBoundingClientRect();
      this.wrap.scrollLeft += nr.left + fx * nr.width - cx;
      this.wrap.scrollTop += nr.top + fy * nr.height - cy;
    }

    zoomStep(dir) {
      const cur = this.view.zoom;
      const list = dir > 0 ? ZOOMS.filter((z) => z > cur * 1.01) : ZOOMS.filter((z) => z < cur * 0.99).reverse();
      this.setZoom(list.length ? list[0] : cur);
    }

    wireWheel() {
      this.wrap.addEventListener('wheel', (e) => {
        if (!(e.ctrlKey || e.metaKey) || this.store.ui.clean) return;
        e.preventDefault();
        const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022));
        this.setZoom(this.view.zoom * k, e.clientX, e.clientY);
      }, { passive: false });
    }

    // ───────────────────────────── geometry ─────────────────────────────
    /** Text-block bounds of layer i in artboard CSS px: { x, y, w, h } or null (path / fills frame). */
    layerBounds(i) {
      const layer = this.store.scene.layers[i];
      if (!layer || layer.visible === false) return null;
      const preset = TM.getPreset(layer.preset);
      if (!preset || preset.usesPath || !String(layer.text || '').trim()) return null;
      const W = this.renderer.width, H = this.renderer.height;
      const k = this.view.cssW / W;
      if (preset.fit === false && !this.anchorSensitive(layer)) {
        return { x: 0, y: 0, w: this.view.cssW, h: this.view.cssH, fills: true };
      }
      const unit = Math.min(W, H);
      const opts = { text: layer.text, family: layer.font.family, weight: layer.font.weight, sizePx: Math.max(1, layer.type.size * unit), tracking: layer.type.tracking, leading: layer.type.leading, align: layer.type.align, case: layer.type.case };
      let L = TM.text.layout(opts);
      if (preset.fit && L.width > 0) {
        const maxW = W * (preset.fitWidth || 0.9), maxH = H * (preset.fitHeight || 0.86);
        const f = Math.min(1, maxW / L.width, L.height > 0 ? maxH / L.height : 1);
        if (f < 0.999) L = TM.text.layout(Object.assign({}, opts, { sizePx: Math.max(1, opts.sizePx * f) }));
      }
      const padX = L.sizePx * 0.06, padY = L.sizePx * 0.14;
      const cx = layer.anchor.x * W, cy = layer.anchor.y * H;
      return {
        x: (cx - L.width / 2 - padX) * k,
        y: (cy - L.height / 2 - padY) * k,
        w: (L.width + padX * 2) * k,
        h: (L.height + padY * 2 + L.descent * 0.35) * k,
      };
    }

    /** Topmost visible layer under (x, y) artboard CSS px, or -1. Path layers hit along their path. */
    hitTest(x, y) {
      const layers = this.store.scene.layers;
      const W = this.renderer.width, H = this.renderer.height;
      const k = this.view.cssW / W;
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        if (l.visible === false || !String(l.text || '').trim()) continue;
        const p = TM.getPreset(l.preset);
        if (p && p.usesPath && l.path) {
          const sp = TM.Path.sample(l.path, W, H);
          const tol = Math.max(12, l.type.size * Math.min(W, H) * k * 0.6);
          const stride = Math.max(1, Math.floor(sp.n / 400));
          for (let j = 0; j < sp.n; j += stride) {
            if (Math.hypot(sp.xs[j] * k - x, sp.ys[j] * k - y) < tol) return i;
          }
          continue;
        }
        const b = this.layerBounds(i);
        if (b && !b.fills && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
      }
      // Frame-filling looks own the whole artboard (lowest priority).
      for (let i = layers.length - 1; i >= 0; i--) {
        const b = this.layerBounds(i);
        if (b && b.fills) return i;
      }
      return -1;
    }

    /** Does this layer's look respond to its anchor? Measured once per look by rendering a tiny frame twice. */
    anchorSensitive(layer) {
      const p = TM.getPreset(layer.preset);
      if (!p || p.usesPath) return false;
      if (this._anchorCache.has(p.id)) return this._anchorCache.get(p.id);
      let sensitive = true;
      try {
        const c = document.createElement('canvas');
        // Create the context first so the renderer reuses it with willReadFrequently set.
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const r = new TM.Renderer(c, { quality: 'preview' });
        r.resize(96, 54);
        const make = (ax) => {
          const s = TM.Scene.clone(this.store.scene);
          const l = TM.Scene.clone(layer);
          l.visible = true;
          l.text = String(l.text || '').trim() || 'Aa';
          l.anchor = { x: ax, y: ax };
          l.fx = TM.Scene.defaultLayer().fx;
          l.fill.type = 'solid';
          l.fill.color = '#ffffff';
          s.layers = [l];
          s.size = { w: 960, h: 540 };
          s.bg = { type: 'solid', color: '#000000', color2: '#000000', angle: 0 };
          s.post = { grain: 0, vignette: 0 };
          return TM.Scene.normalize(s);
        };
        const a = make(0.4), b = make(0.6);
        sensitive = false;
        for (const u of [0.5, 0.3, 0.7, 0.9]) {
          r.setScene(a); r.render(a.duration * u);
          const da = ctx.getImageData(0, 0, 96, 54).data;
          r.setScene(b); r.render(b.duration * u);
          const db = ctx.getImageData(0, 0, 96, 54).data;
          let diff = 0;
          for (let j = 0; j < da.length; j += 4) diff += Math.abs(da[j] - db[j]);
          if (diff > 255 * 6) { sensitive = true; break; }
        }
      } catch (e) { sensitive = true; }
      this._anchorCache.set(p.id, sensitive);
      return sensitive;
    }

    canMove(i) {
      const l = this.store.scene.layers[i];
      return !!l && !this.store.ui.editPath && !this.store.ui.clean && !!TM.getPreset(l.preset) && !TM.getPreset(l.preset).usesPath && this.anchorSensitive(l);
    }

    // ───────────────────────────── selection chrome ─────────────────────────────
    placeBox(el, b) {
      if (!b) { el.hidden = true; return; }
      el.hidden = false;
      el.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px)`;
      el.style.width = Math.max(4, b.w).toFixed(1) + 'px';
      el.style.height = Math.max(4, b.h).toFixed(1) + 'px';
    }

    refreshSelection() {
      if (!this.selBox) return;
      const ui = this.store.ui;
      const show = !ui.editPath && !ui.clean && this.view.cssW > 0;
      const b = show ? this.layerBounds(this.store.selected) : null;
      this.placeBox(this.selBox, b && !b.fills ? b : null);
      this.selBox.classList.toggle('movable', !!b && this.canMove(this.store.selected));
      if (!show) this.placeBox(this.hoverBox, null);
    }

    flash() {
      if (UI.reducedMotion()) return;
      this.board.classList.remove('flash');
      void this.board.offsetWidth;
      this.board.classList.add('flash');
    }

    setLoading(on) {
      this.board.classList.toggle('loading', !!on);
    }

    updateLabel() {
      const s = this.store.scene;
      const name = $('#frameName'), dims = $('#frameDims');
      if (name) name.textContent = s.name || 'Untitled';
      if (dims) dims.textContent = s.size.w + ' × ' + s.size.h;
    }

    updateEmpty() {
      if (!this.empty) return;
      const layers = this.store.scene.layers;
      const visible = layers.filter((l) => l.visible !== false);
      const blank = visible.length > 0 && visible.every((l) => !String(l.text || '').trim());
      const allHidden = visible.length === 0;
      const msg = this.empty.querySelector('.art-empty-msg');
      const btn = this.empty.querySelector('button');
      this.empty.hidden = !(blank || allHidden);
      if (this.empty.hidden) return;
      msg.textContent = allHidden ? 'Every layer is hidden.' : 'Nothing to animate yet. Type something to bring the artboard to life.';
      btn.textContent = allHidden ? 'Show layer' : 'Type text';
      btn.onclick = () => {
        if (allHidden) this.store.setLayerVisible(this.store.selected, true);
        else if (Studio.app) Studio.app.focusText();
      };
    }

    // ───────────────────────────── pointer ─────────────────────────────
    local(e) {
      const r = this.board.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    wirePointer() {
      const board = this.board, store = this.store;
      board.addEventListener('pointermove', (e) => {
        if (this.drag || store.ui.editPath || store.ui.clean || e.pointerType === 'touch') return;
        const p = this.local(e);
        const i = this.hitTest(p.x, p.y);
        const b = i >= 0 && i !== store.selected ? this.layerBounds(i) : null;
        this.placeBox(this.hoverBox, b && !b.fills ? b : null);
        board.style.cursor = i < 0 ? '' : i === store.selected ? (this.canMove(i) ? 'move' : '') : 'pointer';
        board.classList.add('hovering');
      });
      board.addEventListener('pointerleave', () => {
        board.classList.remove('hovering');
        if (!this.drag) this.placeBox(this.hoverBox, null);
        board.style.cursor = '';
      });
      board.addEventListener('dblclick', (e) => {
        if (store.ui.editPath || store.ui.clean) return;
        const p = this.local(e);
        if (this.hitTest(p.x, p.y) >= 0 && Studio.app) Studio.app.focusText();
      });
      board.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || store.ui.editPath) return;
        if (store.ui.clean) { store.setUI({ playing: !store.ui.playing }); return; }
        const p = this.local(e);
        const i = this.hitTest(p.x, p.y);
        if (i < 0) return;
        if (i !== store.selected) store.select(i);
        if (!this.canMove(i)) return;
        e.preventDefault();
        board.focus({ preventScroll: true });
        this.startDrag(e, p);
      });
    }

    startDrag(e, p0) {
      const store = this.store, board = this.board;
      const start = { ...store.layer.anchor };
      const { cssW, cssH } = this.view;
      board.setPointerCapture(e.pointerId);
      board.classList.add('dragging');
      this.drag = { moved: false };
      this.placeBox(this.hoverBox, null);
      const move = (ev) => {
        const p = this.local(ev);
        let dx = p.x - p0.x, dy = p.y - p0.y;
        if (!this.drag.moved && Math.hypot(dx, dy) < 2) return;
        this.drag.moved = true;
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        let x = start.x + dx / cssW, y = start.y + dy / cssH;
        // Snap the block centre to the artboard's centre lines.
        const sx = Math.abs(x - 0.5) * cssW < SNAP_PX, sy = Math.abs(y - 0.5) * cssH < SNAP_PX;
        if (sx) x = 0.5;
        if (sy) y = 0.5;
        this.snapV.hidden = !sx;
        this.snapH.hidden = !sy;
        x = TM.math.clamp(x, -0.5, 1.5);
        y = TM.math.clamp(y, -0.5, 1.5);
        store.updateLayer((l) => { l.anchor = { x: +x.toFixed(4), y: +y.toFixed(4) }; }, { coalesce: 'anchor-drag', reason: 'anchor', label: 'Move layer' });
      };
      const up = () => {
        board.removeEventListener('pointermove', move);
        board.removeEventListener('pointerup', up);
        board.removeEventListener('pointercancel', up);
        board.classList.remove('dragging');
        this.snapV.hidden = this.snapH.hidden = true;
        const moved = this.drag && this.drag.moved;
        this.drag = null;
        if (moved) {
          const a = store.layer.anchor;
          UI.announce('Moved to ' + Math.round(a.x * 100) + '%, ' + Math.round(a.y * 100) + '%');
        }
      };
      board.addEventListener('pointermove', move);
      board.addEventListener('pointerup', up);
      board.addEventListener('pointercancel', up);
    }

    wireKeys() {
      this.board.addEventListener('keydown', (e) => {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!d || e.metaKey || e.ctrlKey || e.altKey) return;
        if (!this.canMove(this.store.selected)) return; // arrows fall through to frame stepping
        e.preventDefault();
        e.stopPropagation();
        const k = e.shiftKey ? 10 : 1;
        const { cssW, cssH } = this.view;
        this.store.updateLayer((l) => {
          l.anchor = { x: TM.math.clamp(l.anchor.x + (d[0] * k) / cssW, -0.5, 1.5), y: TM.math.clamp(l.anchor.y + (d[1] * k) / cssH, -0.5, 1.5) };
        }, { coalesce: 'anchor-nudge', reason: 'anchor', label: 'Nudge layer' });
        this.board.classList.add('hovering');
      });
      this.board.addEventListener('blur', () => this.board.classList.remove('hovering'));
    }
  }

  Stage.PREVIEW_MAX_PIXELS = PREVIEW_MAX_PIXELS;
  Stage.ZOOMS = ZOOMS;
  Studio.Stage = Stage;
})(window.TM);
