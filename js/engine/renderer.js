/* TYPOMAN engine — renderer: frame pipeline, layer compositing, FX, glyph drawing.
 *
 *   const r = new TM.Renderer(canvas);
 *   r.setScene(TM.Scene.normalize(json));
 *   await TM.prepare(r.scene);     // fonts
 *   r.render(seconds);             // pure: same scene + time → same pixels
 *
 * All sizes are relative to the frame (unit = shorter side), so the preview at 540p and an
 * export at 2160p are the same composition.
 */
(function (root) {
  'use strict';
  const TM = root.TM;
  const { clamp, mod, pingpong, TAU } = TM.math;
  const DEG = Math.PI / 180;

  function makeCanvas(w, h) {
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(w, h);
    c.width = w;
    c.height = h;
    return c;
  }

  // ───────────────────────────── frame context ─────────────────────────────
  /** The object every preset's render(f) receives. One instance is reused per renderer. */
  class Frame {
    constructor(renderer) {
      this.renderer = renderer;
      this.math = TM.math;
      this.E = TM.EASINGS;
    }

    _reset(o) {
      Object.assign(this, o);
      this._font = null;
      this._path = undefined;
      this._noise = null;
      const L = this.layer;
      this.slant = (L.type.slant || 0) * DEG;
      this.strokeMode = L.stroke.mode;
      this.strokeW = L.stroke.width * this.size;
      this.ctx.lineJoin = 'round';
      this.ctx.miterLimit = 2;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'alphabetic';
    }

    // ── determinism helpers ──
    rand(a = 0, b = 0) { return TM.rand(this.seed, a, b); }
    srand(a = 0, b = 0) { return TM.srand(this.seed, a, b); }
    get noise() { return this._noise || (this._noise = TM.noise(this.seed)); }
    /** Seamless looping noise in [-1, 1]: integer `freq` cycles per loop. */
    loopNoise(salt = 0, freq = 1, radius = 1) { return this.noise.loop(this.p * freq, salt, radius); }
    ease(spec, fallback) { return TM.ease(spec, fallback); }

    /** Sampled path for this layer at this moment (morph applied), or null. */
    get path() {
      if (this._path === undefined) this._path = this.renderer._pathFor(this.layer, this.W, this.H, this.p);
      return this._path;
    }

    // ── staggering ──
    /** Position of glyph g in a stagger order, 0..1. */
    rank(g, order = this.params.order || 'start') {
      const L = this.layout;
      const norm = (i, n) => (n > 1 ? i / (n - 1) : 0);
      const vi = Math.max(0, g.vi);
      switch (order) {
        case 'end': return 1 - norm(vi, L.count);
        case 'center': { const c = (L.count - 1) / 2; return c > 0 ? Math.abs(vi - c) / c : 0; }
        case 'edges': { const c = (L.count - 1) / 2; return c > 0 ? 1 - Math.abs(vi - c) / c : 0; }
        case 'random': return this.rand(vi, 9173);
        case 'words': return norm(g.word, L.words);
        case 'lines': return norm(g.line, L.lines.length);
        default: return norm(vi, L.count);
      }
    }

    /** Local 0..1 progress of an item at rank r when global progress is p (window shrinks with stagger). */
    stagger(p, r, stagger = this.params.stagger || 0) {
      const d = Math.max(1e-4, 1 - stagger);
      return clamp((p - r * stagger) / d);
    }

    /**
     * In → hold → out sequencing for glyph g, driven by the TM.P.sequence() params.
     * Returns { kin, kout } (raw 0..1) and { vin, vout } (eased), plus `visible`.
     */
    seq(g, p = this.p) {
      const P = this.params;
      let inDur = P.inDur != null ? P.inDur : 0.4;
      let outDur = P.outDur != null ? P.outDur : 0.3;
      const timing = P.timing || 'inout';
      if (timing === 'in') outDur = 0;
      const total = inDur + outDur;
      if (total > 1) { inDur /= total; outDur /= total; }
      const st = P.stagger != null ? P.stagger : 0.5;
      const r = this.rank(g, P.order);
      const kin = inDur > 0 ? this.stagger(p / inDur, r, st) : 1;
      const kout = outDur > 0 ? this.stagger((p - (1 - outDur)) / outDur, r, st) : 0;
      const vin = TM.ease(P.easeIn || 'glide')(kin);
      const vout = TM.ease(P.easeOut || 'inCubic')(kout);
      return { kin, kout, vin, vout, visible: kin > 0 && kout < 1, r };
    }

    // ── style ──
    colorOf(g) {
      if (this.colorOverride) return this.colorOverride;
      const fill = this.layer.fill;
      if (fill.type === 'palette') {
        const pal = fill.palette;
        return pal[mod((g.vi < 0 ? 0 : g.vi) + (this.paletteShift | 0), pal.length)];
      }
      if (fill.type === 'gradient') return '#ffffff';
      return fill.color;
    }

    /** Canvas font string for this layer at a weight (variable fonts animate smoothly). */
    font(weight, sizePx = this.size) {
      return TM.fonts.fontString(this.layer.font.family, weight == null ? this.layer.font.weight : weight, sizePx);
    }

    _setFont(f) {
      if (this._font !== f) { this.ctx.font = f; this._font = f; }
    }

    /**
     * Draw glyph g. Options (all optional):
     *   x, y      position in frame pixels (default: its layout position around the anchor)
     *   rot       rotation in radians      sx, sy / scale   scale
     *   skew      extra lean in radians    alpha            0..1 (multiplied by echo alpha)
     *   color     override fill colour     weight           variable-font weight
     *   ch        draw a different character in g's slot (scramble, slot machine)
     *   anchor    'center' (default) or 'baseline' (sit the baseline on (x, y), for paths)
     *   size      font size override in pixels
     */
    drawGlyph(g, o = {}) {
      if (g.isSpace && o.ch == null) return;
      const alpha = (o.alpha == null ? 1 : o.alpha) * this.alpha;
      if (!(alpha > 0.002)) return;
      const sx = o.sx != null ? o.sx : o.scale != null ? o.scale : 1;
      const sy = o.sy != null ? o.sy : o.scale != null ? o.scale : 1;
      if (Math.abs(sx) < 1e-4 || Math.abs(sy) < 1e-4) return;
      const x = o.x != null ? o.x : this.cx + g.cx;
      const y = o.y != null ? o.y : this.cy + g.cy;
      const rot = o.rot || 0;
      const lean = (o.skew || 0) + this.slant;
      const ctx = this.ctx;
      const scaleSize = o.size != null ? o.size / this.size : 1;
      const cos = Math.cos(rot), sin = Math.sin(rot), tk = -Math.tan(lean);
      const a = cos * sx * scaleSize, b = sin * sx * scaleSize;
      const c = (cos * tk - sin) * sy * scaleSize, d = (sin * tk + cos) * sy * scaleSize;
      const ch = o.ch != null ? o.ch : g.ch;
      const w = o.ch != null && o.ch !== g.ch ? this.renderer._advance(ch, this.layer, this.size) : g.w;
      const ox = -w / 2;
      const oy = o.anchor === 'baseline' ? 0 : this.layout.capH / 2;
      this._setFont(o.weight != null ? this.font(o.weight) : this.layout.font);
      ctx.globalAlpha = alpha;

      const ex = this.extrude;
      if (ex) {
        // Screen-space extrusion behind the face: a stack of offset copies, darker toward the back.
        const steps = ex.steps;
        for (let k = steps; k >= 1; k--) {
          ctx.setTransform(a, b, c, d, x + ex.dx * k * sx, y + ex.dy * k * sy);
          ctx.fillStyle = ex.colors[k - 1];
          ctx.fillText(ch, ox, oy);
        }
      }

      ctx.setTransform(a, b, c, d, x, y);
      const color = o.color || this.colorOf(g);
      if (this.strokeMode === 'outline') {
        ctx.strokeStyle = color;
        ctx.lineWidth = this.strokeW;
        ctx.strokeText(ch, ox, oy);
      } else {
        if (this.strokeMode === 'both') {
          ctx.strokeStyle = this.layer.stroke.color;
          ctx.lineWidth = this.strokeW * 2; // half sits under the fill
          ctx.strokeText(ch, ox, oy);
        }
        ctx.fillStyle = color;
        ctx.fillText(ch, ox, oy);
      }
    }

    /** Draw a whole line of the layout as one run (keeps native shaping). Same options as drawGlyph. */
    drawLine(line, o = {}) {
      const alpha = (o.alpha == null ? 1 : o.alpha) * this.alpha;
      if (!(alpha > 0.002)) return;
      const sx = o.sx != null ? o.sx : o.scale != null ? o.scale : 1;
      const sy = o.sy != null ? o.sy : o.scale != null ? o.scale : 1;
      const x = o.x != null ? o.x : this.cx + line.x + line.width / 2;
      const y = o.y != null ? o.y : this.cy + line.y - this.layout.capH / 2;
      const rot = o.rot || 0, lean = (o.skew || 0) + this.slant;
      const cos = Math.cos(rot), sin = Math.sin(rot), tk = -Math.tan(lean);
      const ctx = this.ctx;
      this._setFont(o.weight != null ? this.font(o.weight) : this.layout.font);
      if ('letterSpacing' in ctx) ctx.letterSpacing = this.layout.tracking.toFixed(2) + 'px';
      ctx.globalAlpha = alpha;
      ctx.setTransform(cos * sx, sin * sx, (cos * tk - sin) * sy, (sin * tk + cos) * sy, x, y);
      const ox = -line.width / 2, oy = this.layout.capH / 2;
      const color = o.color || this.colorOf({ vi: line.index });
      if (this.strokeMode === 'outline') {
        ctx.strokeStyle = color;
        ctx.lineWidth = this.strokeW;
        ctx.strokeText(line.text, ox, oy);
      } else {
        if (this.strokeMode === 'both') {
          ctx.strokeStyle = this.layer.stroke.color;
          ctx.lineWidth = this.strokeW * 2;
          ctx.strokeText(line.text, ox, oy);
        }
        ctx.fillStyle = color;
        ctx.fillText(line.text, ox, oy);
      }
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    /** Reset the context transform to frame pixels (for presets drawing their own shapes). */
    identity() {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.globalAlpha = this.alpha;
    }

    /** A cleared frame-sized scratch buffer { canvas, ctx } (pooled by id; valid until the next call with that id). */
    buffer(id = 0) {
      return this.renderer._scratch(id, this.W, this.H);
    }

    /** Run fn with f.ctx temporarily pointing at another context (e.g. a buffer), so drawGlyph targets it. */
    drawInto(ctx, fn) {
      const prev = this.ctx, prevFont = this._font;
      this.ctx = ctx;
      this._font = null;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      try { fn(ctx); } finally {
        this.ctx = prev;
        this._font = prevFont;
      }
    }
  }

  // ───────────────────────────── renderer ─────────────────────────────
  class Renderer {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true });
      this.quality = opts.quality || 'full'; // 'preview' trims motion-blur samples
      this.scene = null;
      this.frame = new Frame(this);
      this._layer = null;
      this._accum = null;
      this._setup = new Map();
      this._grain = null;
      this.stats = { renders: 0, lastMs: 0 };
    }

    setScene(scene) {
      this.scene = scene;
    }

    resize(w, h) {
      w = Math.max(2, Math.round(w));
      h = Math.max(2, Math.round(h));
      if (this.canvas.width !== w) this.canvas.width = w;
      if (this.canvas.height !== h) this.canvas.height = h;
    }

    get width() { return this.canvas.width; }
    get height() { return this.canvas.height; }

    _buffers(W, H) {
      if (!this._layer || this._layer.width !== W || this._layer.height !== H) {
        this._layer = makeCanvas(W, H);
        this._lctx = this._layer.getContext('2d');
        this._accum = makeCanvas(W, H);
        this._actx = this._accum.getContext('2d');
        this._tmp = makeCanvas(W, H);
        this._tctx = this._tmp.getContext('2d');
      }
    }

    // ── caches ──
    _layout(layer, W, H, preset) {
      const unit = Math.min(W, H);
      const opts = {
        text: layer.text,
        family: layer.font.family,
        weight: layer.font.weight,
        sizePx: Math.max(1, layer.type.size * unit),
        tracking: layer.type.tracking,
        leading: layer.type.leading,
        align: layer.type.align,
        case: layer.type.case,
      };
      let L = TM.text.layout(opts);
      if (preset.fit && L.width > 0) {
        const maxW = W * (preset.fitWidth || 0.9), maxH = H * (preset.fitHeight || 0.86);
        const k = Math.min(1, maxW / L.width, L.height > 0 ? maxH / L.height : 1);
        if (k < 0.999) L = TM.text.layout(Object.assign(opts, { sizePx: Math.max(1, opts.sizePx * k) }));
      }
      return L;
    }

    _advance(ch, layer, sizePx) {
      return TM.text.advance(ch, layer.font.family, layer.font.weight, sizePx);
    }

    _pathFor(layer, W, H, p) {
      if (!layer.path) return null;
      const a = TM.Path.sample(layer.path, W, H);
      const pm = layer.pathMorph;
      if (pm && pm.enabled && pm.target) {
        const b = TM.Path.sample(pm.target, W, H);
        return TM.Path.morph(a, b, TM.ease(pm.ease)(pingpong(p)));
      }
      return a;
    }

    _scratch(id, W, H) {
      if (!this._scratchPool) this._scratchPool = new Map();
      let b = this._scratchPool.get(id);
      if (!b || b.canvas.width !== W || b.canvas.height !== H) {
        const canvas = makeCanvas(W, H);
        b = { canvas, ctx: canvas.getContext('2d') };
        this._scratchPool.set(id, b);
      }
      b.ctx.setTransform(1, 0, 0, 1, 0, 0);
      b.ctx.globalAlpha = 1;
      b.ctx.globalCompositeOperation = 'source-over';
      b.ctx.clearRect(0, 0, W, H);
      return b;
    }

    _setupFor(layer, preset, f) {
      if (!preset.setup) return null;
      const key = JSON.stringify([layer.text, layer.font, layer.type, layer.params, layer.path, layer.stroke, layer.fx, f.W, f.H, f.seed, TM.fonts.version()]);
      const hit = this._setup.get(layer.id);
      if (hit && hit.key === key && hit.preset === preset.id) return hit.value;
      const value = preset.setup(f);
      this._setup.set(layer.id, { key, preset: preset.id, value });
      return value;
    }

    // ── pipeline ──
    render(t) {
      const scene = this.scene;
      if (!scene) return;
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      const W = this.canvas.width, H = this.canvas.height;
      this._buffers(W, H);
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
      this._background(ctx, scene.bg, W, H);
      scene.layers.forEach((layer, i) => {
        if (layer.visible !== false) this._renderLayer(layer, i, t, W, H);
      });
      this._post(ctx, scene, t, W, H);
      this.stats.renders++;
      if (t0) this.stats.lastMs = performance.now() - t0;
    }

    _background(ctx, bg, W, H) {
      if (bg.type === 'transparent') {
        ctx.clearRect(0, 0, W, H);
        return;
      }
      if (bg.type === 'linear') {
        const a = bg.angle * DEG, dx = Math.sin(a), dy = -Math.cos(a);
        const len = Math.abs(W * dx) + Math.abs(H * dy);
        const g = ctx.createLinearGradient(W / 2 - (dx * len) / 2, H / 2 - (dy * len) / 2, W / 2 + (dx * len) / 2, H / 2 + (dy * len) / 2);
        g.addColorStop(0, bg.color);
        g.addColorStop(1, bg.color2);
        ctx.fillStyle = g;
      } else if (bg.type === 'radial') {
        const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
        g.addColorStop(0, bg.color);
        g.addColorStop(1, bg.color2);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = bg.color;
      }
      ctx.fillRect(0, 0, W, H);
    }

    _drawPreset(lctx, layer, index, preset, t, W, H, echo, alpha, colorOverride) {
      const scene = this.scene;
      const dur = scene.duration;
      const tl = mod(t, dur);
      const L = this._layout(layer, W, H, preset);
      const f = this.frame;
      const seed = (scene.seed + index * 1013) | 0;
      f._reset({
        ctx: lctx,
        layer,
        index,
        params: layer.params,
        seed,
        t: tl,
        time: tl,
        p: tl / dur,
        dur,
        fps: scene.fps,
        frameIndex: Math.round(tl * scene.fps),
        W,
        H,
        unit: Math.min(W, H),
        cx: layer.anchor.x * W,
        cy: layer.anchor.y * H,
        layout: L,
        glyphs: L.glyphs,
        lines: L.lines,
        size: L.sizePx,
        echo,
        alpha,
        colorOverride,
        paletteShift: 0,
        extrude: this._extrudeFor(layer, L.sizePx, W, H),
        cache: null,
      });
      f.cache = this._setupFor(layer, preset, f);
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalAlpha = alpha;
      try {
        preset.render(f);
      } catch (err) {
        if (!this._warned) { console.error(`[TM] preset "${preset.id}" failed:`, err); this._warned = true; }
      }
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalAlpha = 1;
      lctx.globalCompositeOperation = 'source-over';
    }

    _extrudeFor(layer, size, W, H) {
      const ex = layer.fx.extrude;
      if (!ex || ex.depth <= 0) return null;
      const length = ex.depth * size * 0.42;
      const px = Math.max(1, Math.min(W, H) / 900);
      const steps = clamp(Math.ceil(length / px), 2, this.quality === 'preview' ? 28 : 64);
      const a = ex.angle * DEG;
      const key = ex.color + steps;
      if (!this._exColors || this._exColors.key !== key) {
        const colors = [];
        for (let k = 1; k <= steps; k++) colors.push(TM.color.mix(ex.color, '#000000', 0.45 * (k / steps)));
        this._exColors = { key, colors };
      }
      return { steps, dx: (Math.cos(a) * length) / steps, dy: (Math.sin(a) * length) / steps, colors: this._exColors.colors };
    }

    /** Draw the main pass and its echoes for time t into ctx. */
    _drawPasses(ctx, layer, index, preset, t, W, H) {
      const echo = layer.fx.echo;
      const count = echo.count | 0;
      const pal = layer.fill.palette;
      for (let e = count; e >= 0; e--) {
        const te = t - e * echo.spacing * this.scene.duration;
        const alpha = e === 0 ? 1 : Math.pow(echo.fade, e) * 0.9;
        const color = e > 0 && echo.palette ? pal[(e - 1) % pal.length] : null;
        this._drawPreset(ctx, layer, index, preset, te, W, H, e, alpha, color);
      }
    }

    _renderLayer(layer, index, t, W, H) {
      const preset = TM.getPreset(layer.preset);
      if (!preset) return;
      const ctx = this.ctx, lctx = this._lctx;
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, W, H);

      const blur = layer.fx.blur;
      const samples = blur > 0 ? (this.quality === 'preview' ? 4 : Math.round(4 + blur * 12)) : 1;
      if (samples > 1) {
        // Trailing motion blur: average `samples` sub-frames across the shutter interval.
        const shutter = (blur * 4) / this.scene.fps;
        const actx = this._actx, tctx = this._tctx;
        actx.setTransform(1, 0, 0, 1, 0, 0);
        actx.clearRect(0, 0, W, H);
        actx.globalCompositeOperation = 'lighter';
        actx.globalAlpha = 1 / samples;
        for (let j = 0; j < samples; j++) {
          tctx.setTransform(1, 0, 0, 1, 0, 0);
          tctx.clearRect(0, 0, W, H);
          this._drawPasses(tctx, layer, index, preset, t - (shutter * j) / (samples - 1), W, H);
          actx.drawImage(this._tmp, 0, 0);
        }
        actx.globalCompositeOperation = 'source-over';
        actx.globalAlpha = 1;
        lctx.drawImage(this._accum, 0, 0);
      } else {
        this._drawPasses(lctx, layer, index, preset, t, W, H);
      }

      if (layer.fill.type === 'gradient') {
        const a = layer.fill.angle * DEG, dx = Math.sin(a), dy = -Math.cos(a);
        const len = Math.abs(W * dx) + Math.abs(H * dy);
        const g = lctx.createLinearGradient(W / 2 - (dx * len) / 2, H / 2 - (dy * len) / 2, W / 2 + (dx * len) / 2, H / 2 + (dy * len) / 2);
        g.addColorStop(0, layer.fill.color);
        g.addColorStop(1, layer.fill.color2);
        lctx.globalCompositeOperation = 'source-in';
        lctx.fillStyle = g;
        lctx.fillRect(0, 0, W, H);
        lctx.globalCompositeOperation = 'source-over';
      }

      const unit = Math.min(W, H);
      const fx = layer.fx;
      if (fx.shadow.amount > 0) {
        const a = fx.shadow.angle * DEG, dist = fx.shadow.distance * unit;
        this._softPass(ctx, TM.color.rgba(fx.shadow.color, 0.25 + 0.75 * fx.shadow.amount), Math.max(1, fx.shadow.amount * unit * 0.035), Math.cos(a) * dist, Math.sin(a) * dist);
      }
      if (fx.glow.amount > 0) {
        const passes = fx.glow.amount > 0.5 ? 2 : 1;
        for (let k = 0; k < passes; k++) this._softPass(ctx, fx.glow.color, unit * (0.012 + fx.glow.amount * 0.05) * (k + 1), 0, 0);
      }
      ctx.drawImage(this._layer, 0, 0);
    }

    /**
     * Draw a blurred, tinted copy of the layer buffer (drop shadow / glow). The blur runs on a
     * downscaled copy, which is far cheaper than a full-resolution shadowBlur and softer too.
     */
    _softPass(ctx, color, blur, dx, dy) {
      const W = this._layer.width, H = this._layer.height;
      const k = blur > 32 ? 4 : blur > 10 ? 2 : 1;
      const sw = Math.ceil(W / k), sh = Math.ceil(H / k);
      if (!this._small || this._small.width !== sw || this._small.height !== sh) {
        this._small = makeCanvas(sw, sh);
        this._sctx = this._small.getContext('2d');
        this._small2 = makeCanvas(sw, sh);
        this._s2ctx = this._small2.getContext('2d');
      }
      const s = this._sctx, s2 = this._s2ctx;
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.clearRect(0, 0, sw, sh);
      s.drawImage(this._layer, 0, 0, sw, sh);
      s2.setTransform(1, 0, 0, 1, 0, 0);
      s2.clearRect(0, 0, sw, sh);
      const off = sw + sh + 1000; // draw off-canvas so only the shadow lands
      s2.shadowColor = color;
      s2.shadowBlur = blur / k;
      s2.shadowOffsetX = off;
      s2.shadowOffsetY = 0;
      s2.drawImage(this._small, -off, 0);
      s2.shadowColor = 'rgba(0,0,0,0)';
      s2.shadowBlur = 0;
      s2.shadowOffsetX = 0;
      ctx.drawImage(this._small2, dx, dy, W, H);
    }

    _post(ctx, scene, t, W, H) {
      const post = scene.post;
      if (post.vignette > 0) {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.6);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(0,0,0,${(post.vignette * 0.85).toFixed(3)})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      if (post.grain > 0 && scene.bg.type !== 'transparent') {
        if (!this._grain || this._grainSeed !== scene.seed) {
          this._grain = this._makeGrain(scene.seed);
          this._grainSeed = scene.seed;
        }
        // The tile shifts by a seeded offset every frame, so grain dances deterministically.
        const frame = Math.round(mod(t, scene.duration) * scene.fps);
        const scale = Math.max(1, Math.min(W, H) / 720);
        const ox = Math.floor(TM.rand(scene.seed, frame, 1) * 256), oy = Math.floor(TM.rand(scene.seed, frame, 2) * 256);
        ctx.save();
        ctx.globalAlpha = Math.min(1, post.grain * 0.9);
        const pat = ctx.createPattern(this._grain, 'repeat');
        ctx.setTransform(scale, 0, 0, scale, -ox * scale, -oy * scale);
        ctx.fillStyle = pat;
        ctx.fillRect(ox, oy, W / scale + 1, H / scale + 1);
        ctx.restore();
      }
    }

    /** Signed grain as light/dark speckles with alpha: plain source-over, cheap everywhere. */
    _makeGrain(seed) {
      const c = makeCanvas(256, 256);
      const g = c.getContext('2d');
      const img = g.createImageData(256, 256);
      for (let i = 0; i < 256 * 256; i++) {
        const n = TM.srand(seed, i, 5);
        const v = n > 0 ? 255 : 0;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = Math.round(Math.abs(n) * Math.abs(n) * 120);
      }
      g.putImageData(img, 0, 0);
      return c;
    }
  }

  TM.Renderer = Renderer;
  TM.Frame = Frame;

  /** Resolve once every font a scene uses is ready (never rejects). */
  TM.prepare = function (scene) {
    return Promise.all((scene.layers || []).map((l) => TM.fonts.ensure(l.font.family, l.font.weight))).then(() => scene);
  };
})(typeof window !== 'undefined' ? window : globalThis);
