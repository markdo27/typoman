/* TYPOMAN export — store-only ZIP writer (no compression: PNGs are already deflated).
 *
 *   const zip = new TM.Export.ZipWriter();
 *   await zip.add('frame_00000.png', blob);
 *   const out = zip.finish();   // Blob, application/zip
 *
 * Entries keep their original Blob as a part, so large sequences are not copied into one
 * giant buffer; only each file's CRC32 needs its bytes once. Plain ZIP (no ZIP64): up to
 * 65 535 files and 4 GB, enforced with a clear error.
 */
(function (TM) {
  'use strict';
  const X = TM.Export;
  const LIMIT = 0xffffffff;

  function dosDateTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }

  class ZipWriter {
    constructor() {
      this.parts = [];
      this.entries = [];
      this.offset = 0;
      this.stamp = dosDateTime(new Date());
    }

    /** Add a file. data: Blob | Uint8Array | string. */
    async add(name, data) {
      if (this.entries.length >= 0xffff) throw new Error('Too many files for a ZIP (65 535 max)');
      const blob = data instanceof Blob ? data : new Blob([data]);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const crc = X.crc32(bytes);
      const nameBytes = new TextEncoder().encode(name);
      const size = bytes.length;
      if (this.offset + 30 + nameBytes.length + size > LIMIT) throw new Error('This sequence is larger than 4 GB. Export fewer frames or a lower resolution.');
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); // local file header
      h.setUint16(4, 10, true); // version needed (1.0: stored)
      h.setUint16(6, 0x0800, true); // UTF-8 names
      h.setUint16(8, 0, true); // method: store
      h.setUint16(10, this.stamp.time, true);
      h.setUint16(12, this.stamp.date, true);
      h.setUint32(14, crc, true);
      h.setUint32(18, size, true);
      h.setUint32(22, size, true);
      h.setUint16(26, nameBytes.length, true);
      h.setUint16(28, 0, true);
      this.parts.push(new Uint8Array(h.buffer), nameBytes, blob);
      this.entries.push({ nameBytes, crc, size, offset: this.offset });
      this.offset += 30 + nameBytes.length + size;
    }

    finish() {
      const start = this.offset;
      let cdSize = 0;
      for (const e of this.entries) {
        const c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true); // central directory header
        c.setUint16(4, 20, true); // version made by
        c.setUint16(6, 10, true); // version needed
        c.setUint16(8, 0x0800, true);
        c.setUint16(10, 0, true);
        c.setUint16(12, this.stamp.time, true);
        c.setUint16(14, this.stamp.date, true);
        c.setUint32(16, e.crc, true);
        c.setUint32(20, e.size, true);
        c.setUint32(24, e.size, true);
        c.setUint16(28, e.nameBytes.length, true);
        c.setUint16(30, 0, true); // extra
        c.setUint16(32, 0, true); // comment
        c.setUint16(34, 0, true); // disk
        c.setUint16(36, 0, true); // internal attrs
        c.setUint32(38, 0, true); // external attrs
        c.setUint32(42, e.offset, true);
        this.parts.push(new Uint8Array(c.buffer), e.nameBytes);
        cdSize += 46 + e.nameBytes.length;
      }
      if (start + cdSize > LIMIT) throw new Error('ZIP too large');
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true); // end of central directory
      end.setUint16(8, this.entries.length, true);
      end.setUint16(10, this.entries.length, true);
      end.setUint32(12, cdSize, true);
      end.setUint32(16, start, true);
      this.parts.push(new Uint8Array(end.buffer));
      return new Blob(this.parts, { type: 'application/zip' });
    }
  }

  X.ZipWriter = ZipWriter;
})(window.TM);
