/* TYPOMAN engine — what an uploaded font file says about itself.
 *
 * TM.sfnt.inspect(buffer) reads the sfnt tables of a TrueType / CFF font (or a WOFF, through
 * DecompressionStream) and resolves { family, subfamily, weight, italic, axes, features }:
 *   family / subfamily  the typographic names (name IDs 16/17, else 1/2)
 *   weight, italic      OS/2 usWeightClass and fsSelection
 *   axes                fvar axes as [{ tag, min, def, max }]
 *   features            the GSUB feature tags
 * WOFF2 needs a Brotli decoder the platform doesn't expose, so it resolves null, as does any
 * file it can't read; callers then fall back to the file name. Every read is bounds-checked:
 * uploads and project files are untrusted.
 */
(function (root) {
  'use strict';
  const TM = root.TM;

  const tag4 = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));

  /** Table directory of an sfnt (TrueType 0x00010000 / 'true', CFF 'OTTO'): { TAG: DataView }. */
  function sfntTables(buffer) {
    const dv = new DataView(buffer);
    const n = dv.getUint16(4);
    if (n > 512 || 12 + n * 16 > buffer.byteLength) return null;
    const out = {};
    for (let i = 0; i < n; i++) {
      const r = 12 + i * 16, off = dv.getUint32(r + 8), len = dv.getUint32(r + 12);
      if (off + len <= buffer.byteLength) out[tag4(dv, r)] = new DataView(buffer, off, len);
    }
    return out;
  }

  /** WOFF 1: tables are stored zlib-compressed one by one (only the ones we read are inflated). */
  async function woffTables(buffer, want) {
    if (typeof DecompressionStream === 'undefined') return null;
    const dv = new DataView(buffer);
    const n = dv.getUint16(12);
    if (n > 512 || 44 + n * 20 > buffer.byteLength) return null;
    const out = {};
    for (let i = 0; i < n; i++) {
      const r = 44 + i * 20, tag = tag4(dv, r);
      if (!want.includes(tag)) continue;
      const off = dv.getUint32(r + 4), comp = dv.getUint32(r + 8), orig = dv.getUint32(r + 12);
      if (off + comp > buffer.byteLength || orig > 16e6) continue;
      const raw = new Uint8Array(buffer, off, comp);
      if (comp >= orig) { out[tag] = new DataView(raw.slice().buffer); continue; }
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'));
      const data = await new Response(stream).arrayBuffer();
      out[tag] = new DataView(data);
    }
    return out;
  }

  /** The best English string for a name ID: Windows Unicode (en-US first), then Unicode, then Mac Roman. */
  function nameOf(t, id) {
    if (!t || t.byteLength < 6) return null;
    const count = t.getUint16(2), strings = t.getUint16(4);
    let best = null, rank = -1;
    for (let i = 0; i < count && 6 + i * 12 + 12 <= t.byteLength; i++) {
      const r = 6 + i * 12;
      const pid = t.getUint16(r), eid = t.getUint16(r + 2), lang = t.getUint16(r + 4), nid = t.getUint16(r + 6);
      if (nid !== id) continue;
      const len = t.getUint16(r + 8), off = strings + t.getUint16(r + 10);
      if (off + len > t.byteLength) continue;
      const k = pid === 3 && (eid === 1 || eid === 10) ? (lang === 0x409 ? 3 : 2) : pid === 0 ? 1 : pid === 1 && eid === 0 ? 0 : -1;
      if (k <= rank) continue;
      let s = '';
      if (pid === 1) for (let j = 0; j < len; j++) s += String.fromCharCode(t.getUint8(off + j));
      else for (let j = 0; j + 1 < len; j += 2) s += String.fromCharCode(t.getUint16(off + j));
      best = s; rank = k;
    }
    return best && best.replace(/[\u0000-\u001f]/g, '').trim();
  }

  function readFvar(t) {
    if (!t || t.byteLength < 16) return [];
    const at = t.getUint16(4), count = t.getUint16(8), size = t.getUint16(10);
    const fx = (o) => t.getInt32(o) / 65536;
    const out = [];
    for (let i = 0; i < Math.min(count, 64); i++) {
      const r = at + i * size;
      if (r + 20 > t.byteLength) break;
      const min = fx(r + 4), def = fx(r + 8), max = fx(r + 12);
      const hidden = t.getUint16(r + 16) & 1; // HIDDEN_AXIS: not meant for UI
      if (max > min && !hidden) out.push({ tag: tag4(t, r), min: +min.toFixed(3), def: +def.toFixed(3), max: +max.toFixed(3) });
    }
    return out;
  }

  function readFeatures(t) {
    if (!t || t.byteLength < 10) return [];
    const list = t.getUint16(6);
    if (list + 2 > t.byteLength) return [];
    const n = t.getUint16(list), out = new Set();
    for (let i = 0; i < Math.min(n, 512) && list + 2 + i * 6 + 6 <= t.byteLength; i++) out.add(tag4(t, list + 2 + i * 6));
    return [...out].filter((x) => /^[a-z0-9]{4}$/.test(x)).sort();
  }

  async function inspect(buffer) {
    try {
      if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 64) return null;
      const sig = tag4(new DataView(buffer), 0);
      const want = ['name', 'OS/2', 'fvar', 'GSUB'];
      let t;
      if (sig === 'wOFF') t = await woffTables(buffer, want);
      else if (sig === '\u0000\u0001\u0000\u0000' || sig === 'OTTO' || sig === 'true') t = sfntTables(buffer);
      else return null;
      if (!t || !t.name) return null;
      const os2 = t['OS/2'];
      return {
        family: nameOf(t.name, 16) || nameOf(t.name, 1),
        subfamily: nameOf(t.name, 17) || nameOf(t.name, 2),
        weight: os2 && os2.byteLength > 6 ? os2.getUint16(4) : 400,
        italic: !!(os2 && os2.byteLength > 64 && os2.getUint16(62) & 1),
        axes: readFvar(t.fvar),
        features: readFeatures(t.GSUB),
      };
    } catch (e) {
      return null;
    }
  }

  TM.sfnt = { inspect };
})(typeof window !== 'undefined' ? window : globalThis);
