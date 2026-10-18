/* TYPOMAN export — MP4 / WebM through WebCodecs.
 *
 * Offline and frame-accurate: frames come from the shared frame loop, each VideoFrame carries
 * timestamp = round(i · 10⁶ / fps) µs, keyframes every ~2 s, and encodeQueueSize backpressure
 * keeps memory flat and the UI responsive. Muxing: mp4-muxer (MP4, fast-start), webm-muxer
 * (opaque WebM) or WebMAlphaWriter (transparent WebM). If an encoder that isConfigSupported()
 * accepted fails at runtime, the export restarts with the next supported candidate.
 */
(function (TM) {
  'use strict';
  const X = TM.Export;

  // mp4-muxer only knows these colour enums; anything else would write a bogus 'colr' box.
  const MP4_PRIMARIES = ['bt709', 'bt470bg', 'smpte170m'];
  const MP4_TRANSFER = ['bt709', 'smpte170m', 'iec61966-2-1'];
  const MP4_MATRIX = ['bt709', 'bt470bg', 'smpte170m'];
  const DEFAULT_CS = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false };

  /** Copy encoder metadata with a colour space every consumer understands (VP9-in-MP4 requires one). */
  function cleanMeta(meta, choice) {
    if (!meta || !meta.decoderConfig) return meta;
    const dc = Object.assign({}, meta.decoderConfig);
    const cs = dc.colorSpace;
    if (choice.container === 'mp4') {
      if (cs && MP4_PRIMARIES.includes(cs.primaries) && MP4_TRANSFER.includes(cs.transfer) && MP4_MATRIX.includes(cs.matrix)) {
        dc.colorSpace = { primaries: cs.primaries, transfer: cs.transfer, matrix: cs.matrix, fullRange: !!cs.fullRange };
      } else if (choice.family === 'vp9' || cs) {
        dc.colorSpace = Object.assign({}, DEFAULT_CS, cs && typeof cs.fullRange === 'boolean' ? { fullRange: cs.fullRange } : {});
      }
    }
    if (dc.colorSpace && dc.colorSpace.matrix === 'rgb') dc.colorSpace = Object.assign({}, dc.colorSpace, { matrix: 'bt709' });
    return Object.assign({}, meta, { decoderConfig: dc });
  }

  // ───────────────────────────── sinks ─────────────────────────────
  function mp4Sink(choice, plan) {
    const M = window.Mp4Muxer;
    const muxer = new M.Muxer({
      target: new M.ArrayBufferTarget(),
      video: { codec: choice.mux, width: plan.width, height: plan.height, frameRate: plan.fps },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let frames = 0, decoderConfig = null;
    return {
      color(chunk, meta) {
        const m = cleanMeta(meta, choice);
        if (m && m.decoderConfig) decoderConfig = m.decoderConfig;
        muxer.addVideoChunk(chunk, m);
        frames++;
      },
      finish() {
        muxer.finalize();
        return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), frames, decoderConfig };
      },
    };
  }

  function webmSink(choice, plan) {
    const W = window.WebMMuxer;
    const muxer = new W.Muxer({
      target: new W.ArrayBufferTarget(),
      video: { codec: choice.mux, width: plan.width, height: plan.height, frameRate: plan.fps },
      firstTimestampBehavior: 'offset',
    });
    let frames = 0, decoderConfig = null;
    return {
      color(chunk, meta) {
        const m = cleanMeta(meta, choice);
        if (m && m.decoderConfig) decoderConfig = m.decoderConfig;
        muxer.addVideoChunk(chunk, m);
        frames++;
      },
      finish() {
        muxer.finalize();
        const buf = muxer.target.buffer;
        fixWebMDuration(buf, (plan.frames * 1000) / plan.fps);
        return { blob: new Blob([buf], { type: 'video/webm' }), frames, decoderConfig };
      },
    };
  }

  /**
   * webm-muxer sets Segment/Info/Duration to the last frame's timestamp, one frame short of the
   * clip (a 2 s loop reads as 1.966 s). Overwrite the float64 Duration (ID 0x4489, size 8) inside
   * the Info element with frames / fps in milliseconds.
   */
  function fixWebMDuration(buffer, ms) {
    const b = new Uint8Array(buffer);
    const end = Math.min(b.length - 11, 4096);
    for (let i = 0; i < end; i++) {
      if (b[i] === 0x15 && b[i + 1] === 0x49 && b[i + 2] === 0xa9 && b[i + 3] === 0x66) { // Info
        for (let j = i + 4; j < Math.min(i + 256, end); j++) {
          if (b[j] === 0x44 && b[j + 1] === 0x89 && b[j + 2] === 0x88) {
            new DataView(buffer, j + 3, 8).setFloat64(0, ms);
            return true;
          }
        }
        return false;
      }
    }
    return false;
  }
  X._fixWebMDuration = fixWebMDuration;

  /** Transparent WebM: pairs colour + alpha chunks by timestamp and writes them in order. */
  function alphaSink(choice, plan) {
    const writer = new X.WebMAlphaWriter({ codecId: choice.mux, width: plan.width, height: plan.height, fps: plan.fps, alpha: true });
    const pending = new Map(); // timestamp → { color, alpha }
    let frames = 0, decoderConfig = null;
    const bytes = (chunk) => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); return b; };
    function flushReady() {
      const keys = [...pending.keys()].sort((a, b) => a - b);
      for (const ts of keys) {
        const e = pending.get(ts);
        if (!e.color || (choice.alphaMode === 'sidecar' && !e.alpha)) break; // keep order
        writer.addFrame(e.color.data, { timestamp: ts, duration: e.color.duration, key: e.color.key && (!e.alpha || e.alpha.key), alpha: e.alpha && e.alpha.data });
        pending.delete(ts);
        frames++;
      }
    }
    const entry = (ts) => pending.get(ts) || (pending.set(ts, {}), pending.get(ts));
    return {
      color(chunk, meta) {
        if (meta && meta.decoderConfig) { decoderConfig = meta.decoderConfig; writer.setColorSpace(meta.decoderConfig.colorSpace); }
        const e = entry(chunk.timestamp);
        e.color = { data: bytes(chunk), key: chunk.type === 'key', duration: chunk.duration };
        if (choice.alphaMode === 'native' && meta && meta.alphaSideData) {
          e.alpha = { data: new Uint8Array(ArrayBuffer.isView(meta.alphaSideData) ? meta.alphaSideData.buffer.slice(meta.alphaSideData.byteOffset, meta.alphaSideData.byteOffset + meta.alphaSideData.byteLength) : meta.alphaSideData), key: chunk.type === 'key' };
        }
        flushReady();
      },
      alpha(chunk) {
        const e = entry(chunk.timestamp);
        e.alpha = { data: bytes(chunk), key: chunk.type === 'key' };
        flushReady();
      },
      finish() {
        flushReady();
        if (pending.size) throw new Error('Alpha stream ended early (' + pending.size + ' frames unpaired)');
        return { blob: writer.finalize(), frames, decoderConfig };
      },
    };
  }

  // ───────────────────────────── alpha split ─────────────────────────────
  /**
   * Straight-alpha RGBA → (colour frame, alpha-as-luma I420 frame). Fully transparent pixels next
   * to the type take its colour (1-px dilation), so 4:2:0 chroma at the edges isn't pulled toward
   * black; without that, anti-aliased edges would come out desaturated.
   */
  function splitAlpha(canvas, timestamp, duration) {
    const W = canvas.width, H = canvas.height, n = W * H;
    const img = X.readPixels(canvas);
    const px = img.data;
    const yuv = new Uint8Array(n + 2 * (W >> 1) * (H >> 1));
    for (let i = 0, j = 3; i < n; i++, j += 4) yuv[i] = px[j];
    yuv.fill(128, n);
    bleed(px, W, H);
    const color = new VideoFrame(px, { format: 'RGBX', codedWidth: W, codedHeight: H, timestamp, duration });
    const alpha = new VideoFrame(yuv, { format: 'I420', codedWidth: W, codedHeight: H, timestamp, duration });
    return { color, alpha };
  }
  X._splitAlpha = splitAlpha;

  let bleedMask = null;
  function bleed(px, W, H) {
    const n = W * H;
    if (!bleedMask || bleedMask.length !== n) bleedMask = new Uint8Array(n);
    const m = bleedMask;
    for (let i = 0, j = 3; i < n; i++, j += 4) m[i] = px[j] > 0 ? 2 : 0;
    const copy = (to, from) => { const a = to * 4, b = from * 4; px[a] = px[b]; px[a + 1] = px[b + 1]; px[a + 2] = px[b + 2]; };
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        if (m[i]) continue;
        if (x > 0 && m[i - 1] === 2) { copy(i, i - 1); m[i] = 1; } else if (x < W - 1 && m[i + 1] === 2) { copy(i, i + 1); m[i] = 1; }
      }
    }
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        if (m[i]) continue;
        const up = y > 0 ? m[i - W] : 0, dn = y < H - 1 ? m[i + W] : 0;
        if (up === 1 || up === 2) { copy(i, i - W); m[i] = 3; } else if (dn === 1 || dn === 2) { copy(i, i + W); m[i] = 3; }
      }
    }
  }

  // ───────────────────────────── encode ─────────────────────────────
  function waitDequeue(enc) {
    return new Promise((resolve) => {
      let done = false;
      const fin = () => {
        if (done) return;
        done = true;
        if (enc.removeEventListener) enc.removeEventListener('dequeue', fin);
        resolve();
      };
      if (enc.addEventListener) enc.addEventListener('dequeue', fin);
      setTimeout(fin, 25);
    });
  }
  async function backpressure(enc, max, signal) {
    while (enc.state === 'configured' && enc.encodeQueueSize > max) {
      X.throwIfAborted(signal);
      await waitDequeue(enc);
    }
  }

  async function encodeWith(choice, plan, scene, hooks) {
    const sink = choice.alphaMode ? alphaSink(choice, plan) : choice.container === 'mp4' ? mp4Sink(choice, plan) : webmSink(choice, plan);
    let failure = null;
    const fail = (e) => { if (!failure) failure = e instanceof Error ? e : new Error(String(e && e.message || e)); };
    const make = (onOutput) => new window.VideoEncoder({
      output: (chunk, meta) => { try { onOutput(chunk, meta); } catch (e) { fail(e); } },
      error: fail,
    });
    const encoder = make((c, m) => sink.color(c, m));
    const alphaEnc = choice.alphaMode === 'sidecar' ? make((c) => sink.alpha(c)) : null;
    const closeAll = () => [encoder, alphaEnc].forEach((e) => { try { if (e && e.state !== 'closed') e.close(); } catch (err) { /* already closed */ } });
    const onAbort = () => closeAll();
    if (hooks.signal) hooks.signal.addEventListener('abort', onAbort);
    try {
      encoder.configure(choice.config);
      if (alphaEnc) alphaEnc.configure(choice.alphaConfig);
      const gop = Math.max(1, Math.round(plan.fps * 2));
      const maxQueue = plan.width * plan.height > 4e6 ? 3 : 6;
      await X.frameLoop(plan, scene, async (canvas, i) => {
        if (failure) throw failure;
        const timestamp = X.frameTimestamp(plan, i);
        const duration = X.frameTimestamp(plan, i + 1) - timestamp;
        const keyFrame = i % gop === 0;
        if (alphaEnc) {
          const { color, alpha } = splitAlpha(canvas, timestamp, duration);
          encoder.encode(color, { keyFrame });
          color.close();
          alphaEnc.encode(alpha, { keyFrame });
          alpha.close();
        } else {
          const frame = new VideoFrame(canvas, { timestamp, duration, alpha: choice.alphaMode === 'native' ? 'keep' : 'discard' });
          encoder.encode(frame, { keyFrame });
          frame.close();
        }
        await backpressure(encoder, maxQueue, hooks.signal);
        if (alphaEnc) await backpressure(alphaEnc, maxQueue, hooks.signal);
        if (failure) throw failure;
      }, hooks);
      if (hooks.onProgress) hooks.onProgress({ phase: 'finalize', fraction: 0.97 });
      await encoder.flush();
      if (alphaEnc) await alphaEnc.flush();
      if (failure) throw failure;
      const out = sink.finish();
      if (out.frames !== plan.frames) throw new Error(`Encoder produced ${out.frames} of ${plan.frames} frames`);
      return out;
    } catch (e) {
      if (hooks.signal && hooks.signal.aborted) throw X.abortError();
      throw e;
    } finally {
      if (hooks.signal) hooks.signal.removeEventListener('abort', onAbort);
      closeAll();
      X.releasePixels();
    }
  }

  /**
   * Encode plan (format 'mp4' | 'webm') with WebCodecs, falling back through supported codecs,
   * then to real-time MediaRecorder capture when WebCodecs is unavailable.
   * Resolves { blob, info } where info = { codec, label, engine, notes, ... }.
   */
  X.encodeVideo = async function (plan, scene, hooks = {}) {
    const notes = [];
    if (plan.engine === 'recorder' || !X.caps().webcodecs) {
      if (plan.transparent) throw new Error('Transparent video needs WebCodecs (latest Chrome or Edge). Export a PNG sequence instead.');
      return X.recordRealtime(plan, scene, hooks);
    }
    const neg = await X.negotiate(plan);
    if (!neg.ok) {
      if (plan.transparent) throw new Error("This browser can't encode transparent WebM. Export a PNG sequence instead: it keeps full alpha.");
      if (X.caps().recorder) {
        notes.push('No WebCodecs encoder supports this size; recorded in real time instead.');
        const r = await X.recordRealtime(plan, scene, hooks);
        r.info.notes = notes.concat(r.info.notes || []);
        return r;
      }
      throw new Error("This browser can't encode video. Try the latest Chrome, Edge or Safari, or export a PNG sequence.");
    }
    if (!neg.supported.every((c) => c.alphaMode)) await X.loadVendor(plan.format === 'mp4' ? 'mp4' : 'webm');
    let lastErr = null;
    for (const choice of neg.supported) {
      if (choice.alphaMode == null && plan.format === 'webm' && !window.WebMMuxer) await X.loadVendor('webm');
      try {
        if (hooks.onCodec) hooks.onCodec(choice);
        const t0 = performance.now();
        const out = await encodeWith(choice, plan, scene, hooks);
        return {
          blob: out.blob,
          info: {
            engine: 'webcodecs',
            codec: (out.decoderConfig && out.decoderConfig.codec) || choice.codec,
            label: choice.label,
            family: choice.family,
            alphaMode: choice.alphaMode,
            bitrate: choice.config.bitrate,
            frames: out.frames,
            elapsedMs: performance.now() - t0,
            notes,
          },
        };
      } catch (e) {
        if (X.isAbort(e)) throw e;
        lastErr = e;
        notes.push(`${choice.label} (${choice.codec}) failed: ${e.message}`);
        console.warn('[TM.Export] encoder failed, trying the next codec:', choice.codec, e);
      }
    }
    throw lastErr || new Error('Video encoding failed');
  };
})(window.TM);
