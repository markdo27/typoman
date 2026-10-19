/* TYPOMAN export — PNG still and PNG sequence (store-only ZIP).
 * Lossless and bit-exact with the renderer; with a transparent background the PNGs keep full
 * 8-bit alpha, which is what After Effects, Premiere, Resolve and Figma import best.
 */
(function (TM) {
  'use strict';
  const X = TM.Export;

  function toPNG(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed (image too large?)'))), 'image/png');
    });
  }
  X.toPNG = toPNG;

  /** Single frame at plan.start seconds. */
  X.renderPNG = async function (plan, scene, hooks = {}) {
    const t0 = performance.now();
    const renderer = X.makeRenderer(scene, plan);
    X.throwIfAborted(hooks.signal);
    renderer.render(plan.start);
    if (hooks.onFrame) hooks.onFrame(renderer.canvas, 0);
    if (hooks.onProgress) hooks.onProgress({ phase: 'encode', done: 1, total: 1, fraction: 0.6 });
    const blob = await toPNG(renderer.canvas);
    return {
      blob,
      info: { engine: 'png', codec: 'PNG', label: `PNG · ${plan.transparent ? 'RGBA, transparent' : 'RGB'}`, frames: 1, elapsedMs: performance.now() - t0, notes: [] },
    };
  };

  /** Every frame as PNG in a ZIP, plus a README with the frame rate for importing. */
  X.encodePNGSequence = async function (plan, scene, hooks = {}) {
    const t0 = performance.now();
    const zip = new X.ZipWriter();
    const base = X.slug(scene.name);
    const digits = Math.max(4, String(plan.frames - 1).length);
    await X.frameLoop(plan, scene, async (canvas, i) => {
      const png = await toPNG(canvas);
      await zip.add(`${base}_${String(i).padStart(digits, '0')}.png`, png);
    }, hooks);
    const readme = [
      `${scene.name} — PNG sequence exported from TYPOMAN ${TM.VERSION || ''}`,
      '',
      `Frames:      ${plan.frames} (${base}_${'0'.repeat(digits)}.png … ${base}_${String(plan.frames - 1).padStart(digits, '0')}.png)`,
      `Frame rate:  ${plan.fps} fps  (frame i = time i / ${plan.fps} s)`,
      `Size:        ${plan.width} × ${plan.height} px`,
      `Duration:    ${(plan.frames / plan.fps).toFixed(3)} s`,
      `Background:  ${plan.transparent ? 'transparent (straight alpha)' : 'opaque'}`,
      '',
      'After Effects: File → Import → File…, select the first frame, tick "PNG Sequence",',
      `then Interpret Footage → Main → Assume this frame rate: ${plan.fps}.`,
      'Premiere Pro: File → Import, select the first frame, tick "Image Sequence".',
      `ffmpeg: ffmpeg -framerate ${plan.fps} -i ${base}_%0${digits}d.png -c:v libx264 -pix_fmt yuv420p out.mp4`,
      '',
    ].join('\n');
    await zip.add('README.txt', readme);
    if (hooks.onProgress) hooks.onProgress({ phase: 'finalize', fraction: 0.99 });
    const blob = zip.finish();
    return {
      blob,
      info: { engine: 'png', codec: 'PNG', label: `PNG sequence · ${plan.frames} frames${plan.transparent ? ' · alpha' : ''}`, frames: plan.frames, elapsedMs: performance.now() - t0, notes: [] },
    };
  };
})(window.TM);
