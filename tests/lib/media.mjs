/* Media helpers for the export tests: small, dependency-free readers for what TYPOMAN writes
 * (PNG, store-only ZIP, GIF89a block structure, ISO-BMFF boxes and av1C), ffprobe/ffmpeg
 * wrappers, and PSNR maths.
 */
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';

// ───────────────────────────── CRC32 ─────────────────────────────
let CRC = null;
export function crc32(bytes) {
  if (!CRC) {
    CRC = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
  }
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

// ───────────────────────────── PNG ─────────────────────────────
/** Decode an 8-bit, non-interlaced PNG (grey, RGB, palette, grey+alpha, RGBA) to straight RGBA. */
export function decodePNG(buf) {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  if (buf.length < 8 || SIG.some((b, i) => buf[i] !== b)) throw new Error('not a PNG file');
  let pos = 8, ihdr = null, plte = null, trns = null;
  const idat = [], chunks = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (crc32(buf.subarray(pos + 4, pos + 8 + len)) !== buf.readUInt32BE(pos + 8 + len)) throw new Error(`PNG chunk ${type} has a bad CRC`);
    chunks.push(type);
    if (type === 'IHDR') ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('PNG has no IHDR');
  const { width: W, height: H, depth, color, interlace } = ihdr;
  if (depth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (bit depth ${depth}, interlace ${interlace})`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!ch) throw new Error('unsupported PNG colour type ' + color);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = W * ch;
  if (raw.length < H * (stride + 1)) throw new Error('PNG image data is truncated');
  const line = new Uint8Array(stride), prev = new Uint8Array(stride);
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = src[i];
      switch (f) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; break; }
        default: throw new Error('bad PNG filter ' + f);
      }
      line[i] = v & 255;
    }
    for (let x = 0, o = y * W * 4; x < W; x++, o += 4) {
      const s = x * ch;
      if (color === 6) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = line[s + 3]; }
      else if (color === 2) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = 255; }
      else if (color === 0) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = 255; }
      else if (color === 4) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = line[s + 1]; }
      else { const k = line[s]; out[o] = plte[k * 3]; out[o + 1] = plte[k * 3 + 1]; out[o + 2] = plte[k * 3 + 2]; out[o + 3] = trns && k < trns.length ? trns[k] : 255; }
    }
    prev.set(line);
  }
  return { width: W, height: H, colorType: color, chunks, data: out };
}

// ───────────────────────────── ZIP (store-only) ─────────────────────────────
/** Read a ZIP from its central directory. Entries: { name, method, size, crc, crcOk, data }. */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('no end-of-central-directory record');
  const count = buf.readUInt16LE(eocd + 10), cdSize = buf.readUInt32LE(eocd + 12), cdOff = buf.readUInt32LE(eocd + 16);
  if (cdOff + cdSize > eocd) throw new Error('central directory overlaps its end record');
  const entries = [];
  let p = cdOff;
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry ' + k);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    if (buf.readUInt32LE(off) !== 0x04034b50) throw new Error('bad local header for ' + name);
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
    entries.push({ name, method, size, crc, crcOk: !!data && data.length === size && crc32(data) === crc, data });
    p += 46 + nlen + xlen + clen;
  }
  return entries;
}

// ───────────────────────────── GIF ─────────────────────────────
/** Walk GIF89a blocks (no pixel decoding): screen size, loop count, frames with delays (cs). */
export function parseGIF(buf) {
  const sig = buf.toString('latin1', 0, 6);
  if (sig !== 'GIF89a' && sig !== 'GIF87a') throw new Error('not a GIF file');
  const width = buf.readUInt16LE(6), height = buf.readUInt16LE(8), packed = buf[10];
  let p = 13;
  const globalColors = packed & 0x80 ? 2 << (packed & 7) : 0;
  p += globalColors * 3;
  const skipBlocks = () => { while (buf[p] !== 0) { p += buf[p] + 1; if (p >= buf.length) throw new Error('GIF truncated'); } p++; };
  let gce = null, loop = null, trailer = false;
  const frames = [];
  while (p < buf.length) {
    const b = buf[p++];
    if (b === 0x3b) { trailer = true; break; }
    if (b === 0x21) {
      const label = buf[p++];
      if (label === 0xf9) {
        const f = buf[p + 1];
        gce = { disposal: (f >> 2) & 7, transparent: !!(f & 1), delay: buf.readUInt16LE(p + 2), tIndex: buf[p + 4] };
        p += buf[p] + 1;
        skipBlocks();
      } else if (label === 0xff && buf.toString('latin1', p + 1, p + 12) === 'NETSCAPE2.0') {
        p += buf[p] + 1;
        if (buf[p] >= 3 && buf[p + 1] === 1) loop = buf.readUInt16LE(p + 2);
        skipBlocks();
      } else { p += buf[p] + 1; skipBlocks(); }
    } else if (b === 0x2c) {
      const x = buf.readUInt16LE(p), y = buf.readUInt16LE(p + 2), w = buf.readUInt16LE(p + 4), h = buf.readUInt16LE(p + 6), ip = buf[p + 8];
      p += 9;
      if (ip & 0x80) p += (2 << (ip & 7)) * 3;
      p++; // LZW minimum code size
      skipBlocks();
      frames.push({ x, y, w, h, delay: gce ? gce.delay : 0, disposal: gce ? gce.disposal : 0, transparent: gce ? gce.transparent : false });
      gce = null;
    } else throw new Error(`unexpected GIF block 0x${b.toString(16)} at byte ${p - 1}`);
  }
  return { width, height, globalColors, loop, trailer, frames };
}

// ───────────────────────────── ISO-BMFF (MP4) ─────────────────────────────
/** Child boxes of buf[start, end): [{ type, start, end, body }]. */
export function boxes(buf, start = 0, end = buf.length) {
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p), hdr = 8;
    const type = buf.toString('latin1', p + 4, p + 8);
    if (size === 1) { size = Number(buf.readBigUInt64BE(p + 8)); hdr = 16; } else if (size === 0) size = end - p;
    if (size < hdr || p + size > end) throw new Error(`bad MP4 box ${JSON.stringify(type)} at ${p}`);
    out.push({ type, start: p, end: p + size, body: p + hdr });
    p += size;
  }
  return out;
}
/** First box along a path of types, e.g. ['moov', 'trak', 'mdia']; containers are descended plainly. */
export function findBox(buf, pathTypes, list = boxes(buf)) {
  let cur = null;
  for (const type of pathTypes) {
    cur = list.find((b) => b.type === type);
    if (!cur) return null;
    let body = cur.body;
    if (type === 'stsd') body += 8; // full box header + entry_count
    else if (['avc1', 'av01', 'vp09', 'hvc1', 'hev1'].includes(type)) body += 78; // VisualSampleEntry fields
    else if (['meta'].includes(type)) body += 4;
    list = body < cur.end ? boxes(buf, body, cur.end) : [];
  }
  return cur;
}
/** Parse an av1C box (AV1-ISOBMFF §2.3). */
export function parseAv1C(buf, box) {
  const b = buf.subarray(box.body, box.end);
  return {
    bytes: b.length,
    marker: b[0] >> 7, version: b[0] & 0x7f,
    seqProfile: b[1] >> 5, seqLevelIdx: b[1] & 31,
    tier: b[2] >> 7, highBitdepth: (b[2] >> 6) & 1, twelveBit: (b[2] >> 5) & 1, monochrome: (b[2] >> 4) & 1,
    subsamplingX: (b[2] >> 3) & 1, subsamplingY: (b[2] >> 2) & 1,
    configOBUs: b.length - 4,
    firstOBUType: b.length > 4 ? (b[4] >> 3) & 15 : null, // 1 = OBU_SEQUENCE_HEADER
  };
}

// ───────────────────────────── ffprobe / ffmpeg ─────────────────────────────
export function ffprobe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error('ffprobe failed: ' + (r.stderr || '').slice(0, 400));
  return JSON.parse(r.stdout);
}

/**
 * Decode every frame (no resampling, no frame-rate conversion) to raw planes.
 * pixFmt: 'yuv420p' | 'yuva420p' | 'rgba'. codec forces a decoder (libvpx-vp9 keeps WebM alpha).
 * Returns an array of Buffers, one per frame.
 */
export function ffmpegFrames(file, { width, height, pixFmt = 'yuv420p', codec = null }) {
  const args = ['-v', 'error'];
  if (codec) args.push('-c:v', codec);
  args.push('-i', file, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', pixFmt, '-');
  const r = spawnSync('ffmpeg', args, { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error('ffmpeg decode failed: ' + String(r.stderr || '').slice(0, 400));
  const size = { yuv420p: width * height * 1.5, yuva420p: width * height * 2.5, rgba: width * height * 4 }[pixFmt];
  const out = [];
  for (let o = 0; o + size <= r.stdout.length; o += size) out.push(r.stdout.subarray(o, o + size));
  return out;
}

// ───────────────────────────── PSNR ─────────────────────────────
const psnrOf = (sse, n) => (sse === 0 ? Infinity : 10 * Math.log10((255 * 255 * n) / sse));

/** BT.601 limited-range luma of straight RGBA, composited on black (what an opaque encode sees). */
export function lumaOf(rgba) {
  const n = rgba.length / 4, y = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = rgba[j + 3] / 255;
    y[i] = 16 + (65.481 * rgba[j] + 128.553 * rgba[j + 1] + 24.966 * rgba[j + 2]) * a / 255;
  }
  return y;
}

/** Luma PSNR of a decoded Y plane against reference luma (optionally only where mask[i] is set). */
export function lumaPSNR(Y, refLuma, mask = null) {
  let sse = 0, n = 0;
  for (let i = 0; i < refLuma.length; i++) {
    if (mask && !mask[i]) continue;
    const d = Y[i] - refLuma[i];
    sse += d * d;
    n++;
  }
  return n ? psnrOf(sse, n) : NaN;
}

/** PSNR over chosen channels of two RGBA buffers (default RGB), optionally masked by pixel. */
export function rgbaPSNR(a, b, { channels = [0, 1, 2], mask = null } = {}) {
  let sse = 0, n = 0;
  for (let i = 0, p = 0; i < a.length; i += 4, p++) {
    if (mask && !mask[p]) continue;
    for (const c of channels) { const d = a[i + c] - b[i + c]; sse += d * d; n++; }
  }
  return n ? psnrOf(sse, n) : NaN;
}

/** Plain PSNR of two equal-length 8-bit planes. */
export function planePSNR(a, b) {
  let sse = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sse += d * d; }
  return psnrOf(sse, a.length);
}

/** Pixel-level difference stats of two RGBA buffers. */
export function diffStats(a, b) {
  let differing = 0, maxDiff = 0;
  for (let i = 0; i < a.length; i += 4) {
    let m = 0;
    for (let c = 0; c < 4; c++) { const d = Math.abs(a[i + c] - b[i + c]); if (d > m) m = d; }
    if (m) { differing++; if (m > maxDiff) maxDiff = m; }
  }
  return { differing, maxDiff, pixels: a.length / 4, fraction: differing / (a.length / 4) };
}

export const fmtDB = (v) => (v === Infinity ? '∞' : Number.isFinite(v) ? v.toFixed(1) : String(v));
