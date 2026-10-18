/* TYPOMAN export — core: formats, sizes, file names, lazy vendor loading, scheduling, CRC32.
 *
 * Everything in js/export/* hangs off TM.Export. Encoders share one offline frame loop
 * (frames.js), so every format renders the same pure frames: frame i is renderer.render(i / fps)
 * on a dedicated full-quality renderer at the export size, never a capture of the live preview.
 */
(function (TM) {
  'use strict';
  const X = (TM.Export = TM.Export || {});
  const { clamp } = TM.math;

  // ───────────────────────────── formats ─────────────────────────────
  // res: short-side presets (the long side follows the scene aspect). maxLong caps the long side.
  X.FORMATS = {
    mp4: { id: 'mp4', ext: 'mp4', mime: 'video/mp4', label: 'MP4', video: true, alpha: false, fps: [24, 25, 30, 50, 60], res: [720, 1080, 1440, 2160], defRes: 1080, maxLong: 4096 },
    webm: { id: 'webm', ext: 'webm', mime: 'video/webm', label: 'WebM', video: true, alpha: true, fps: [24, 25, 30, 50, 60], res: [720, 1080, 1440, 2160], defRes: 1080, maxLong: 4096 },
    gif: { id: 'gif', ext: 'gif', mime: 'image/gif', label: 'GIF', video: false, alpha: true, fps: [10, 12, 15, 20, 24, 25, 30], res: [240, 320, 360, 480, 540, 720], defRes: 360, maxLong: 1280, defFps: 25 },
    png: { id: 'png', ext: 'png', mime: 'image/png', label: 'PNG', video: false, alpha: true, still: true, fps: [24, 25, 30, 50, 60], res: [720, 1080, 1440, 2160], defRes: 1080, maxLong: 4096 },
    pngseq: { id: 'pngseq', ext: 'zip', mime: 'application/zip', label: 'PNG sequence', video: false, alpha: true, fps: [24, 25, 30, 50, 60], res: [720, 1080, 1440, 2160], defRes: 1080, maxLong: 4096 },
  };
  X.QUALITIES = [['draft', 'Draft'], ['standard', 'Standard'], ['high', 'High'], ['max', 'Max']];
  X.MAX_FRAMES = 7200; // 2 minutes at 60 fps

  const even = (v) => Math.max(2, Math.round(v / 2) * 2);

  /** Output size for a short-side preset, following the scene aspect. Always even (4:2:0). */
  X.sizeFor = function (scene, short, maxLong = 4096) {
    const aspect = scene.size.w / scene.size.h;
    let w, h;
    if (aspect >= 1) { h = short; w = short * aspect; } else { w = short; h = short / aspect; }
    const long = Math.max(w, h);
    if (long > maxLong) { const k = maxLong / long; w *= k; h *= k; }
    return { w: even(w), h: even(h) };
  };

  const RES_LABEL = { 2160: '4K' };
  /** Resolution choices for a format: [{ short, label, w, h }]. */
  X.resolutions = function (scene, format) {
    const f = X.FORMATS[format] || X.FORMATS.mp4;
    return f.res.map((short) => {
      const s = X.sizeFor(scene, short, f.maxLong);
      return { short, label: RES_LABEL[short] || short + 'p', w: s.w, h: s.h };
    });
  };

  const nearest = (list, v) => list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0]);

  /**
   * Normalise export options into a plan. Untrusted input is fine: everything is clamped.
   * opts: { format, resolution (short side), fps, lengthMode: 'loops'|'seconds', loops, seconds,
   *         quality, transparent, matte, time (png still), dither (gif), engine: 'auto'|'recorder' }
   */
  X.plan = function (scene, opts = {}) {
    const f = X.FORMATS[opts.format] || X.FORMATS.mp4;
    const short = f.res.includes(+opts.resolution) ? +opts.resolution : nearest(f.res, +opts.resolution || f.defRes);
    const { w, h } = X.sizeFor(scene, short, f.maxLong);
    const fps = f.fps.includes(+opts.fps) ? +opts.fps : nearest(f.fps, f.defFps || scene.fps);
    const lengthMode = opts.lengthMode === 'seconds' ? 'seconds' : 'loops';
    const loops = clamp(Math.round(+opts.loops || 1), 1, 100);
    const seconds = clamp(Number.isFinite(+opts.seconds) && +opts.seconds > 0 ? +opts.seconds : scene.duration, 1 / fps, 600);
    let frames = f.still ? 1 : Math.max(1, Math.round((lengthMode === 'loops' ? loops * scene.duration : seconds) * fps));
    frames = Math.min(frames, X.MAX_FRAMES);
    const quality = X.QUALITIES.some((q) => q[0] === opts.quality) ? opts.quality : 'high';
    const time = Number.isFinite(+opts.time) ? Math.max(0, +opts.time) : 0;
    return {
      format: f.id,
      ext: f.ext,
      width: w,
      height: h,
      short,
      fps,
      frames,
      lengthMode,
      loops,
      seconds,
      duration: f.still ? 0 : frames / fps,
      start: f.still ? time : 0,
      quality,
      transparent: !!(f.alpha && opts.transparent),
      matte: TM.color.isHex(opts.matte) ? opts.matte.toLowerCase() : null,
      dither: !!opts.dither,
      engine: opts.engine === 'recorder' ? 'recorder' : 'auto',
    };
  };

  /**
   * The scene actually rendered: a normalised clone with the background resolved.
   * Transparent exports clear the background; formats that cannot hold alpha get a solid matte
   * when the scene itself is transparent.
   */
  X.sceneFor = function (scene, plan) {
    const s = TM.Scene.clone(scene);
    if (plan.transparent) s.bg.type = 'transparent';
    else if (s.bg.type === 'transparent') s.bg = { type: 'solid', color: plan.matte || '#000000', color2: s.bg.color2, angle: s.bg.angle };
    return TM.Scene.normalize(s);
  };

  // ───────────────────────────── names ─────────────────────────────
  X.slug = function (name) {
    const s = String(name || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    return s || 'typoman';
  };

  /** File name from the scene name plus the output spec, e.g. type-in-motion-1920x1080-30fps.mp4 */
  X.fileName = function (scene, plan) {
    const base = X.slug(scene.name);
    const size = plan.width + 'x' + plan.height;
    switch (plan.format) {
      case 'png': return `${base}-${size}-f${String(Math.round(plan.start * plan.fps)).padStart(4, '0')}.png`;
      case 'pngseq': return `${base}-png-${size}-${plan.fps}fps.zip`;
      case 'gif': return `${base}-${size}.gif`;
      default: return `${base}-${size}-${plan.fps}fps${plan.transparent ? '-alpha' : ''}.${plan.ext}`;
    }
  };

  // ───────────────────────────── formatting ─────────────────────────────
  X.formatBytes = function (n) {
    if (!(n >= 0)) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  };
  X.formatDuration = function (ms) {
    if (!(ms >= 0) || !Number.isFinite(ms)) return '';
    const s = Math.round(ms / 1000);
    if (s < 60) return s + ' s';
    return Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s';
  };

  // ───────────────────────────── vendor loading ─────────────────────────────
  // Vendor files are fetched from this site (never a runtime CDN) and only when needed.
  const VENDOR = {
    mp4: { file: 'vendor/mp4-muxer.min.js', global: 'Mp4Muxer' },
    webm: { file: 'vendor/webm-muxer.min.js', global: 'WebMMuxer' },
  };
  const vendorPromises = new Map();
  X.base = () => (window.TM_MANIFEST && window.TM_MANIFEST.base) || './';
  X.loadVendor = function (id) {
    const v = VENDOR[id];
    if (!v) return Promise.reject(new Error('Unknown vendor library: ' + id));
    if (window[v.global]) return Promise.resolve(window[v.global]);
    if (vendorPromises.has(id)) return vendorPromises.get(id);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = X.base() + v.file;
      s.async = true;
      s.onload = () => (window[v.global] ? resolve(window[v.global]) : reject(new Error(v.file + ' loaded but did not define ' + v.global)));
      s.onerror = () => { vendorPromises.delete(id); reject(new Error('Could not load ' + v.file)); };
      document.head.appendChild(s);
    });
    vendorPromises.set(id, p);
    return p;
  };

  // ───────────────────────────── scheduling ─────────────────────────────
  /** Yield to the event loop without timer clamping (works in background tabs too). */
  X.yieldNow = function () {
    if (window.scheduler && typeof window.scheduler.yield === 'function') return window.scheduler.yield();
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
      ch.port2.postMessage(0);
    });
  };
  let lastYield = 0;
  /** Yield only if we have been busy for a while: keeps the UI at ~60 fps during long exports. */
  X.breathe = function (budgetMs = 12) {
    const now = performance.now();
    if (now - lastYield < budgetMs) return Promise.resolve();
    lastYield = now;
    return X.yieldNow().then(() => { lastYield = performance.now(); });
  };
  X.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  X.abortError = function (msg = 'Export cancelled') {
    try { return new DOMException(msg, 'AbortError'); } catch (e) { const err = new Error(msg); err.name = 'AbortError'; return err; }
  };
  X.isAbort = (e) => !!e && (e.name === 'AbortError');
  X.throwIfAborted = function (signal) {
    if (signal && signal.aborted) throw X.abortError();
  };

  /** Progress/ETA tracker. tick(done) → { done, total, fraction, fps, etaMs, elapsedMs } */
  X.progress = function (total, onProgress, phase = 'render', weight = [0, 1]) {
    const t0 = performance.now();
    let lastEmit = 0;
    return {
      tick(done, force) {
        const now = performance.now();
        if (!force && now - lastEmit < 80 && done < total) return;
        lastEmit = now;
        const elapsedMs = now - t0;
        const rate = done > 0 ? done / elapsedMs : 0; // frames per ms
        const etaMs = done >= 3 && rate > 0 ? (total - done) / rate : NaN;
        const local = total > 0 ? done / total : 1;
        if (onProgress) onProgress({ phase, done, total, fraction: weight[0] + (weight[1] - weight[0]) * local, fps: rate * 1000, etaMs, elapsedMs });
      },
    };
  };

  // ───────────────────────────── CRC32 ─────────────────────────────
  let CRC_TABLE = null;
  X.crc32 = function (bytes, crc = 0) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c;
      }
    }
    let c = ~crc;
    for (let i = 0, n = bytes.length; i < n; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return ~c >>> 0;
  };

  // ───────────────────────────── downloads ─────────────────────────────
  /** Trigger a download of `blob` as `name`. Returns the object URL (revoke it when done). */
  X.download = function (blob, name, url) {
    url = url || URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 0);
    return url;
  };

  /** What this browser can do; used by the dialog to label options honestly. */
  X.caps = function () {
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    return {
      webcodecs: typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function',
      recorder: typeof window.MediaRecorder === 'function' && !!(cv && cv.captureStream),
      secure: !!window.isSecureContext,
    };
  };
})(window.TM);
