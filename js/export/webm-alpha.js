/* TYPOMAN export — a small WebM (Matroska) writer for video with an alpha channel.
 *
 * WebM stores transparency as a second VP8/VP9 bitstream whose luma plane is the alpha mask,
 * carried next to each colour frame in BlockAdditions (BlockAddID 1) and flagged with
 * Video/AlphaMode = 1. webm-muxer 5.1.4 writes AlphaMode but has no way to attach alpha data to
 * video blocks, so transparent exports use this writer. Opaque WebM goes through webm-muxer.
 *
 *   const w = new TM.Export.WebMAlphaWriter({ codecId: 'V_VP9', width, height, fps });
 *   w.addFrame(colourBytes, { timestamp, key, alpha: alphaBytes });   // timestamp in µs
 *   const blob = w.finalize();
 *
 * Layout: EBML header, Segment { SeekHead, Info, Tracks, Cluster*, Cues }. Everything is held in
 * memory and sized at the end, so no element uses an unknown size. A cluster starts at each
 * keyframe and gets a CuePoint, so the file seeks and loops cleanly.
 */
(function (TM) {
  'use strict';
  const X = TM.Export;

  // ── EBML primitives ──
  class F64 { constructor(v) { this.v = v; } }
  class SInt { constructor(v) { this.v = v; } }
  class Fixed { constructor(v, len) { this.v = v; this.len = len; } }

  function uintBytes(n, len) {
    if (len == null) { len = 1; while (len < 8 && n >= Math.pow(2, 8 * len)) len++; }
    const out = new Uint8Array(len);
    let v = n;
    for (let i = len - 1; i >= 0; i--) { out[i] = v % 256; v = Math.floor(v / 256); }
    return out;
  }
  function sintBytes(n) {
    let len = 1;
    while (len < 8 && (n < -Math.pow(2, 8 * len - 1) || n >= Math.pow(2, 8 * len - 1))) len++;
    return uintBytes(n < 0 ? n + Math.pow(2, 8 * len) : n, len);
  }
  /** EBML variable-size integer for element sizes (never the all-ones "unknown" value). */
  function vint(n) {
    let len = 1;
    while (len < 8 && n >= Math.pow(2, 7 * len) - 1) len++;
    const out = uintBytes(n, len);
    out[0] |= 1 << (8 - len);
    return out;
  }
  function idBytes(id) {
    const out = [];
    for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
    return Uint8Array.from(out);
  }
  const enc = new TextEncoder();
  function concat(parts, size) {
    if (size == null) size = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(size);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  /** Serialise [id, payload] (payload: uint | string | F64 | SInt | Fixed | Uint8Array | element[]). */
  function serialize(el) {
    const parts = [];
    write(el, parts);
    return concat(parts);
  }
  function write(el, parts) {
    const [id, payload] = el;
    let body;
    if (Array.isArray(payload)) {
      const sub = [];
      for (const child of payload) if (child) write(child, sub);
      body = sub;
    } else if (payload instanceof Uint8Array) body = [payload];
    else if (typeof payload === 'string') body = [enc.encode(payload)];
    else if (payload instanceof F64) { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, payload.v); body = [b]; }
    else if (payload instanceof SInt) body = [sintBytes(payload.v)];
    else if (payload instanceof Fixed) body = [uintBytes(payload.v, payload.len)];
    else body = [uintBytes(payload)];
    const size = body.reduce((s, p) => s + p.length, 0);
    parts.push(idBytes(id), vint(size));
    for (const p of body) parts.push(p);
  }

  const ID = {
    EBML: 0x1a45dfa3, EBMLVersion: 0x4286, EBMLReadVersion: 0x42f7, EBMLMaxIDLength: 0x42f2, EBMLMaxSizeLength: 0x42f3,
    DocType: 0x4282, DocTypeVersion: 0x4287, DocTypeReadVersion: 0x4285,
    Segment: 0x18538067, SeekHead: 0x114d9b74, Seek: 0x4dbb, SeekID: 0x53ab, SeekPosition: 0x53ac,
    Info: 0x1549a966, TimestampScale: 0x2ad7b1, Duration: 0x4489, MuxingApp: 0x4d80, WritingApp: 0x5741,
    Tracks: 0x1654ae6b, TrackEntry: 0xae, TrackNumber: 0xd7, TrackUID: 0x73c5, TrackType: 0x83, FlagLacing: 0x9c,
    CodecID: 0x86, DefaultDuration: 0x23e383, MaxBlockAdditionID: 0x55ee, Video: 0xe0, PixelWidth: 0xb0, PixelHeight: 0xba,
    AlphaMode: 0x53c0, Colour: 0x55b0, MatrixCoefficients: 0x55b1, Range: 0x55b9, TransferCharacteristics: 0x55ba, Primaries: 0x55bb,
    Cluster: 0x1f43b675, Timestamp: 0xe7, BlockGroup: 0xa0, Block: 0xa1, ReferenceBlock: 0xfb,
    BlockAdditions: 0x75a1, BlockMore: 0xa6, BlockAddID: 0xee, BlockAdditional: 0xa5,
    Cues: 0x1c53bb6b, CuePoint: 0xbb, CueTime: 0xb3, CueTrackPositions: 0xb7, CueTrack: 0xf7, CueClusterPosition: 0xf1,
  };
  const MATRIX = { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9 };
  const TRANSFER = { bt709: 1, smpte170m: 6, linear: 8, 'iec61966-2-1': 13, pq: 16, hlg: 18 };
  const PRIMARIES = { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 };

  class WebMAlphaWriter {
    constructor({ codecId = 'V_VP9', width, height, fps, alpha = true }) {
      this.codecId = codecId;
      this.width = width;
      this.height = height;
      this.fps = fps;
      this.alpha = alpha;
      this.clusters = []; // { ts, bytes }
      this.cluster = null; // { ts, parts: [] }
      this.lastTs = -1;
      this.prevTs = null;
      this.frames = 0;
      this.colour = null;
      this.endMs = 0;
    }

    /** Optional colour description from the encoder's decoderConfig.colorSpace. */
    setColorSpace(cs) {
      if (!cs || this.colour) return;
      const m = MATRIX[cs.matrix], t = TRANSFER[cs.transfer], p = PRIMARIES[cs.primaries];
      this.colour = [ID.Colour, [
        m != null && m !== 0 ? [ID.MatrixCoefficients, m] : null,
        [ID.Range, cs.fullRange ? 2 : 1],
        t != null ? [ID.TransferCharacteristics, t] : null,
        p != null ? [ID.Primaries, p] : null,
      ]];
    }

    /** data: colour frame bytes; opts: { timestamp (µs), key, alpha?: Uint8Array } */
    addFrame(data, opts) {
      const ms = Math.round(opts.timestamp / 1000);
      if (ms < this.lastTs) throw new Error('WebM writer: timestamps must not go backwards');
      const startCluster = !this.cluster || (opts.key && ms - this.cluster.ts >= 1000) || ms - this.cluster.ts > 30000;
      if (startCluster) {
        this._closeCluster();
        this.cluster = { ts: ms, key: !!opts.key, parts: [serialize([ID.Timestamp, ms])] };
      }
      const rel = ms - this.cluster.ts;
      const head = new Uint8Array([0x81, (rel >> 8) & 0xff, rel & 0xff, 0x00]); // track 1, int16 timestamp, no flags
      const group = [ID.BlockGroup, [
        [ID.Block, concat([head, data])],
        // A BlockGroup without ReferenceBlock is a keyframe; delta frames point at the previous frame.
        !opts.key && this.prevTs != null ? [ID.ReferenceBlock, new SInt(this.prevTs - ms)] : null,
        opts.alpha && opts.alpha.length ? [ID.BlockAdditions, [[ID.BlockMore, [[ID.BlockAddID, 1], [ID.BlockAdditional, opts.alpha]]]]] : null,
      ]];
      this.cluster.parts.push(serialize(group));
      this.prevTs = ms;
      this.lastTs = ms;
      this.frames++;
      this.endMs = Math.max(this.endMs, Math.round((opts.timestamp + (opts.duration || 1e6 / this.fps)) / 1000));
    }

    _closeCluster() {
      if (!this.cluster) return;
      const body = concat(this.cluster.parts);
      const bytes = concat([idBytes(ID.Cluster), vint(body.length), body]);
      this.clusters.push({ ts: this.cluster.ts, key: this.cluster.key, bytes });
      this.cluster = null;
    }

    /** Assemble the file. Returns a Blob (video/webm). */
    finalize() {
      this._closeCluster();
      const ebml = serialize([ID.EBML, [
        [ID.EBMLVersion, 1], [ID.EBMLReadVersion, 1], [ID.EBMLMaxIDLength, 4], [ID.EBMLMaxSizeLength, 8],
        [ID.DocType, 'webm'], [ID.DocTypeVersion, 4], [ID.DocTypeReadVersion, 2],
      ]]);
      const info = serialize([ID.Info, [
        [ID.TimestampScale, 1000000],
        [ID.MuxingApp, 'TYPOMAN'],
        [ID.WritingApp, 'TYPOMAN ' + (TM.VERSION || '')],
        [ID.Duration, new F64(this.endMs)],
      ]]);
      const tracks = serialize([ID.Tracks, [[ID.TrackEntry, [
        [ID.TrackNumber, 1],
        [ID.TrackUID, 1],
        [ID.TrackType, 1],
        [ID.FlagLacing, 0],
        [ID.CodecID, this.codecId],
        [ID.DefaultDuration, Math.round(1e9 / this.fps)],
        this.alpha ? [ID.MaxBlockAdditionID, 1] : null,
        [ID.Video, [
          [ID.PixelWidth, this.width],
          [ID.PixelHeight, this.height],
          this.alpha ? [ID.AlphaMode, 1] : null,
          this.colour,
        ]],
      ]]]]);
      // SeekHead positions use fixed 8-byte integers, so its size is known before the values.
      const seekHead = (infoPos, tracksPos, cuesPos) => serialize([ID.SeekHead, [
        [ID.Seek, [[ID.SeekID, idBytes(ID.Info)], [ID.SeekPosition, new Fixed(infoPos, 8)]]],
        [ID.Seek, [[ID.SeekID, idBytes(ID.Tracks)], [ID.SeekPosition, new Fixed(tracksPos, 8)]]],
        [ID.Seek, [[ID.SeekID, idBytes(ID.Cues)], [ID.SeekPosition, new Fixed(cuesPos, 8)]]],
      ]]);
      const seekLen = seekHead(0, 0, 0).length;
      const infoPos = seekLen, tracksPos = infoPos + info.length;
      let pos = tracksPos + tracks.length;
      const cuePoints = [];
      for (const c of this.clusters) {
        if (c.key) cuePoints.push([ID.CuePoint, [[ID.CueTime, c.ts], [ID.CueTrackPositions, [[ID.CueTrack, 1], [ID.CueClusterPosition, pos]]]]]);
        pos += c.bytes.length;
      }
      const cuesPos = pos;
      const cues = serialize([ID.Cues, cuePoints]);
      const seek = seekHead(infoPos, tracksPos, cuesPos);
      const segSize = seek.length + info.length + tracks.length + (cuesPos - tracksPos - tracks.length) + cues.length;
      const segHead = concat([idBytes(ID.Segment), vint(segSize)]);
      return new Blob([ebml, segHead, seek, info, tracks, ...this.clusters.map((c) => c.bytes), cues], { type: 'video/webm' });
    }
  }

  X.WebMAlphaWriter = WebMAlphaWriter;
  X._ebml = { vint, uintBytes, sintBytes, serialize }; // exposed for unit checks
})(window.TM);
