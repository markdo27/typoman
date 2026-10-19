/* TYPOMAN export — the shared offline frame loop.
 *
 * Every encoder renders through this loop: a dedicated TM.Renderer at the export size with
 * quality 'full', fonts awaited first, and frame i rendered at exactly t = start + i / fps.
 * Nothing depends on wall-clock time, so an export is frame-accurate however slow the machine.
 */
(function (TM) {
  'use strict';
  const X = TM.Export;

  /**
   * Make sure every font the scene uses is loaded before frame 0.
   * Resolves with the families that could not be loaded (rendered with a fallback face).
   */
  X.ensureFonts = async function (scene) {
    const checks = await Promise.all(scene.layers.map((l) => TM.fonts.ensure(l.font.family, l.font.weight).then((ok) => [l.font.family, ok])));
    await TM.prepare(scene);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const missing = new Set();
    checks.forEach(([family, ok]) => {
      const f = TM.fonts.get(family);
      if (!ok && f && !f.custom) missing.add(family);
    });
    return [...missing];
  };

  /** A renderer for exports: its own canvas, full quality, sized to the plan. */
  X.makeRenderer = function (scene, plan) {
    const canvas = document.createElement('canvas');
    const renderer = new TM.Renderer(canvas, { quality: 'full' });
    renderer.setScene(scene);
    renderer.resize(plan.width, plan.height);
    return renderer;
  };

  /** Time of frame i, in seconds. Shared by every encoder and by the verification tools. */
  X.frameTime = (plan, i) => plan.start + i / plan.fps;
  /** Presentation timestamp of frame i in microseconds (WebCodecs units). */
  X.frameTimestamp = (plan, i) => Math.round((i * 1e6) / plan.fps);

  /**
   * Render plan.frames frames and hand each to consume(canvas, i, t, renderer) (may be async).
   * hooks: { signal, onProgress(p), onFrame(canvas, i), weight: [from, to] progress span }
   */
  X.frameLoop = async function (plan, scene, consume, hooks = {}) {
    const renderer = X.makeRenderer(scene, plan);
    const canvas = renderer.canvas;
    const total = plan.frames;
    const tracker = X.progress(total, hooks.onProgress, 'render', hooks.weight || [0, 0.96]);
    const every = Math.max(1, Math.round(plan.fps / 10));
    tracker.tick(0, true);
    for (let i = 0; i < total; i++) {
      X.throwIfAborted(hooks.signal);
      const t = X.frameTime(plan, i);
      renderer.render(t);
      await consume(canvas, i, t, renderer);
      tracker.tick(i + 1);
      if (hooks.onFrame && (i % every === 0 || i === total - 1)) {
        try { hooks.onFrame(canvas, i); } catch (e) { /* preview only */ }
      }
      await X.breathe();
    }
    tracker.tick(total, true);
    return renderer;
  };

  // A CPU-side canvas for pixel readback. Copying the (possibly GPU-backed) render canvas into a
  // willReadFrequently canvas keeps getImageData fast and avoids readback warnings.
  let scratch = null;
  X.readPixels = function (canvas) {
    const w = canvas.width, h = canvas.height;
    if (!scratch || scratch.canvas.width !== w || scratch.canvas.height !== h) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      scratch = c.getContext('2d', { willReadFrequently: true, alpha: true });
    }
    scratch.globalCompositeOperation = 'copy';
    scratch.drawImage(canvas, 0, 0);
    scratch.globalCompositeOperation = 'source-over';
    return scratch.getImageData(0, 0, w, h);
  };
  X.releasePixels = () => { scratch = null; };
})(window.TM);
