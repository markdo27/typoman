/* TYPOMAN export — real-time fallback for browsers without WebCodecs encoders.
 *
 * Frames still come from the deterministic renderer (frame i = render(i / fps)), but timing is
 * captured by MediaRecorder in real time, so the export takes as long as the clip and frame
 * timing can jitter. The dialog labels this clearly; WebCodecs is always preferred.
 */
(function (TM) {
  'use strict';
  const X = TM.Export;

  const MIME = {
    mp4: ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4;codecs=h264', 'video/mp4'],
    webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
  };

  /** Best MediaRecorder MIME type for a container, or '' when none (falls back across containers). */
  X.recorderMime = function (container) {
    if (typeof window.MediaRecorder !== 'function') return '';
    const order = container === 'mp4' ? MIME.mp4.concat(MIME.webm) : MIME.webm.concat(MIME.mp4);
    return order.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || '';
  };

  X.recordRealtime = async function (plan, scene, hooks = {}) {
    if (!X.caps().recorder) throw new Error("This browser can't record video. Export a PNG sequence or GIF instead.");
    const mime = X.recorderMime(plan.format);
    if (!mime) throw new Error("This browser can't record video. Export a PNG sequence or GIF instead.");
    const renderer = X.makeRenderer(scene, plan);
    const canvas = renderer.canvas;
    renderer.render(X.frameTime(plan, 0));
    // captureStream(0) + requestFrame() captures exactly the frames we render; browsers without
    // requestFrame sample the canvas at the target rate instead.
    let stream = canvas.captureStream(0);
    let track = stream.getVideoTracks()[0];
    if (!track || typeof track.requestFrame !== 'function') {
      stream.getTracks().forEach((t) => t.stop());
      stream = canvas.captureStream(plan.fps);
      track = stream.getVideoTracks()[0];
    }
    const bitrate = X.bitrateFor({ width: plan.width, height: plan.height, fps: plan.fps, quality: plan.quality, family: /mp4/.test(mime) ? 'avc' : 'vp9' });
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve, reject) => {
      rec.onstop = resolve;
      rec.onerror = (e) => reject(e.error || new Error('Recording failed'));
    });
    const tracker = X.progress(plan.frames, hooks.onProgress, 'record', [0, 0.98]);
    const frameMs = 1000 / plan.fps;
    const t0 = performance.now();
    rec.start(1000);
    try {
      for (let i = 0; i < plan.frames; i++) {
        X.throwIfAborted(hooks.signal);
        renderer.render(X.frameTime(plan, i));
        if (track && track.requestFrame) track.requestFrame();
        tracker.tick(i + 1);
        if (hooks.onFrame && i % Math.max(1, Math.round(plan.fps / 10)) === 0) hooks.onFrame(canvas, i);
        const wait = t0 + (i + 1) * frameMs - performance.now();
        if (wait > 0) await X.sleep(wait);
        else await X.yieldNow();
      }
    } finally {
      if (rec.state !== 'inactive') rec.stop();
      stream.getTracks().forEach((t) => t.stop());
    }
    await stopped;
    X.throwIfAborted(hooks.signal);
    const type = mime.split(';')[0];
    const blob = new Blob(chunks, { type });
    return {
      blob,
      ext: type === 'video/mp4' ? 'mp4' : 'webm',
      info: {
        engine: 'mediarecorder',
        codec: mime,
        label: 'Real-time capture (' + mime + ')',
        frames: plan.frames,
        bitrate,
        notes: ['Recorded in real time with MediaRecorder: this browser has no WebCodecs video encoder, so frame timing can drift slightly.'],
      },
    };
  };
})(window.TM);
