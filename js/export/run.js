/* TYPOMAN export — one entry point for every format.
 *
 *   const job = new AbortController();
 *   const { blob, name, info } = await TM.Export.run(scene, { format: 'mp4', resolution: 1080, fps: 30, loops: 2 },
 *                                                    { signal: job.signal, onProgress, onFrame });
 *
 * info: { format, codec, label, engine, width, height, fps, frames, duration, bytes, notes[] }
 */
(function (TM) {
  'use strict';
  const X = TM.Export;

  X.run = async function (sceneIn, opts = {}, hooks = {}) {
    const scene = TM.Scene.normalize(sceneIn);
    const plan = X.plan(scene, opts);
    const s = X.sceneFor(scene, plan);
    X.throwIfAborted(hooks.signal);
    if (hooks.onProgress) hooks.onProgress({ phase: 'fonts', fraction: 0 });
    const missingFonts = await X.ensureFonts(s);
    X.throwIfAborted(hooks.signal);
    let out;
    switch (plan.format) {
      case 'ae': out = await X.encodeAfterEffects(plan, s, hooks); break;
      case 'mp4':
      case 'webm': out = await X.encodeVideo(plan, s, hooks); break;
      case 'gif': out = await X.encodeGIF(plan, s, hooks); break;
      case 'png': out = await X.renderPNG(plan, s, hooks); break;
      case 'pngseq': out = await X.encodePNGSequence(plan, s, hooks); break;
      default: throw new Error('Unknown export format: ' + plan.format);
    }
    const ext = out.ext || plan.ext;
    const name = X.fileName(scene, Object.assign({}, plan, { ext }));
    const notes = (out.info.notes || []).slice();
    if (missingFonts.length) notes.push(`${missingFonts.join(', ')} couldn't be loaded from Google Fonts, so a fallback font was used.`);
    if (missingFonts.axes && missingFonts.axes.length) notes.push(`${missingFonts.axes.join(', ')}: width and optical size couldn't be applied (the font files weren't readable), so the regular design was used.`);
    const info = Object.assign({
      format: plan.format,
      width: plan.width,
      height: plan.height,
      fps: plan.fps,
      frames: plan.frames,
      duration: plan.duration,
    }, out.info, { bytes: out.blob.size, name, ext, notes });
    if (hooks.onProgress) hooks.onProgress({ phase: 'done', fraction: 1 });
    return { blob: out.blob, name, plan, info };
  };

  /**
   * Reference render of frame i for an export plan (what the exporter feeds the encoder).
   * Used by the verification tools: compare a decoded frame from the file against this.
   */
  X.referenceFrame = async function (sceneIn, opts, i) {
    const scene = TM.Scene.normalize(sceneIn);
    const plan = X.plan(scene, opts);
    const s = X.sceneFor(scene, plan);
    await X.ensureFonts(s);
    const r = X.makeRenderer(s, plan);
    r.render(X.frameTime(plan, i));
    return r.canvas;
  };
})(window.TM);
