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

  // ───────────────────────────── AV1 in MP4 ─────────────────────────────
  /** MSB-first bit reader for AV1 headers (f(n) and uvlc() of the spec). */
  function bits(u8) {
    let pos = 0;
    const f = (n) => {
      let v = 0;
      for (let k = 0; k < n; k++) {
        const byte = u8[pos >> 3];
        if (byte === undefined) throw new Error('short header');
        v = v * 2 + ((byte >> (7 - (pos & 7))) & 1);
        pos++;
      }
      return v;
    };
    const uvlc = () => {
      let zeros = 0;
      while (!f(1)) if (++zeros >= 32) return 2 ** 32 - 1;
      return f(zeros) + 2 ** zeros - 1;
    };
    return { f, uvlc };
  }

  /** The fields of an AV1 sequence header that an av1C record repeats (AV1 spec 5.5). */
  function parseSequenceHeader(u8) {
    const { f, uvlc } = bits(u8);
    const profile = f(3);
    f(1); // still_picture
    const reduced = f(1);
    let level = 0, tier = 0;
    if (reduced) {
      level = f(5);
    } else {
      let decoderModel = false, bufferDelayLen = 0;
      if (f(1)) { // timing_info_present_flag
        f(32); f(32); // num_units_in_display_tick, time_scale
        if (f(1)) uvlc(); // equal_picture_interval → num_ticks_per_picture_minus_1
        decoderModel = !!f(1);
        if (decoderModel) { bufferDelayLen = f(5) + 1; f(32); f(5); f(5); }
      }
      const initialDelay = f(1);
      const ops = f(5) + 1;
      for (let i = 0; i < ops; i++) {
        f(12); // operating_point_idc
        const lv = f(5);
        const tr = lv > 7 ? f(1) : 0;
        if (i === 0) { level = lv; tier = tr; }
        if (decoderModel && f(1)) { f(bufferDelayLen); f(bufferDelayLen); f(1); }
        if (initialDelay && f(1)) f(4);
      }
    }
    const wBits = f(4) + 1, hBits = f(4) + 1;
    f(wBits); f(hBits); // max_frame_width/height_minus_1
    if (!reduced && f(1)) { f(4); f(3); } // frame_id_numbers_present_flag
    f(1); f(1); f(1); // use_128x128_superblock, enable_filter_intra, enable_intra_edge_filter
    if (!reduced) {
      f(1); f(1); f(1); f(1); // interintra, masked compound, warped motion, dual filter
      const orderHint = f(1);
      if (orderHint) { f(1); f(1); } // jnt_comp, ref_frame_mvs
      const forceSct = f(1) ? 2 : f(1); // seq_choose_screen_content_tools ? SELECT : force
      if (forceSct > 0 && !f(1)) f(1); // seq_choose_integer_mv / seq_force_integer_mv
      if (orderHint) f(3);
    }
    f(1); f(1); f(1); // superres, cdef, restoration
    // color_config()
    const highBitdepth = f(1);
    const twelveBit = profile === 2 && highBitdepth ? f(1) : 0;
    const mono = profile === 1 ? 0 : f(1);
    let cp = 2, tc = 2, mc = 2;
    if (f(1)) { cp = f(8); tc = f(8); mc = f(8); }
    let subX = 1, subY = 1, chromaPos = 0;
    if (mono) {
      f(1);
    } else if (cp === 1 && tc === 13 && mc === 0) {
      subX = 0; subY = 0;
    } else {
      f(1); // color_range
      if (profile === 0) { subX = 1; subY = 1; }
      else if (profile === 1) { subX = 0; subY = 0; }
      else if (twelveBit) { subX = f(1); subY = subX ? f(1) : 0; }
      else { subX = 1; subY = 0; }
      if (subX && subY) chromaPos = f(2);
    }
    return { profile, level, tier, highBitdepth, twelveBit, mono, subX, subY, chromaPos };
  }

  /**
   * AV1CodecConfigurationRecord for the 'av1C' box, built from a key frame's sequence-header OBU
   * (WebCodecs encoders don't provide a description for AV1, and mp4-muxer's fallback claims
   * level 2.0 and 4:4:4). The OBU itself goes in as configOBUs. Null if none is found.
   */
  function av1Config(chunk) {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    for (let i = 0; i < data.length;) {
      const header = data[i];
      const type = (header >> 3) & 15, ext = (header >> 2) & 1, hasSize = (header >> 1) & 1;
      let j = i + 1 + ext, size = 0;
      if (hasSize) {
        for (let k = 0, b = 128; b & 128 && k < 8; k++) { b = data[j++]; size += (b & 127) * 2 ** (7 * k); }
      } else size = data.length - j;
      if (type === 1) { // OBU_SEQUENCE_HEADER
        try {
          const p = parseSequenceHeader(data.subarray(j, j + size));
          const obu = data.subarray(i, j + size);
          const rec = new Uint8Array(4 + obu.length);
          rec[0] = 0x81; // marker, version 1
          rec[1] = (p.profile << 5) | p.level;
          rec[2] = (p.tier << 7) | (p.highBitdepth << 6) | (p.twelveBit << 5) | (p.mono << 4) | (p.subX << 3) | (p.subY << 2) | p.chromaPos;
          rec[3] = 0; // no initial_presentation_delay
          rec.set(obu, 4);
          return rec;
        } catch (e) {
          return null;
        }
      }
      i = j + size;
    }
    return null;
  }
  X._av1Config = av1Config;

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
        if (m && m.decoderConfig && choice.family === 'av1' && !m.decoderConfig.description && chunk.type === 'key') {
          const rec = av1Config(chunk);
          if (rec) m.decoderConfig = Object.assign({}, m.decoderConfig, { description: rec });
        }
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
    let produced = 0;
    const encoder = make((c, m) => { produced++; sink.color(c, m); });
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
      if (!produced) throw new Error('the encoder produced no output');
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
    if (neg.supported.some((c) => !c.alphaMode)) await X.loadVendor(plan.format === 'mp4' ? 'mp4' : 'webm');
    let lastErr = null;
    for (const choice of neg.supported) {
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
