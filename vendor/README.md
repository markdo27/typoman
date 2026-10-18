# vendor/

Pinned third-party code, served from this site (no runtime CDN). Both files are loaded lazily
by `TM.Export.loadVendor()` when an export starts, never at boot.

| File | Library | Version | Global | License | Source |
|---|---|---|---|---|---|
| `mp4-muxer.min.js` | [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) by Vanilagy | 5.2.2 | `Mp4Muxer` | MIT | `https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.js` |
| `webm-muxer.min.js` | [webm-muxer](https://github.com/Vanilagy/webm-muxer) by Vanilagy | 5.1.4 | `WebMMuxer` | MIT | `https://cdn.jsdelivr.net/npm/webm-muxer@5.1.4/build/webm-muxer.min.js` |

Each file starts with the library's MIT licence text. The jsDelivr banner and the
`sourceMappingURL` comment (a jsDelivr-relative path that would 404 here) were removed; the
code itself is byte-for-byte the jsDelivr Terser build of the package's `build/*.js`.

Notes:

- webm-muxer 5.1.4 writes the `AlphaMode` flag but cannot attach alpha data to video blocks,
  so transparent WebM is written by TYPOMAN's own `js/export/webm-alpha.js` (Matroska
  `BlockAdditions`, BlockAddID 1). Opaque WebM uses webm-muxer.
- The GIF encoder (`js/export/gif.js`) and ZIP writer (`js/export/zip.js`) are TYPOMAN code
  (MIT), not vendored.

To update a library, download the new pinned build, keep its licence header, bump the version
here and in the header, and re-run the export checks (ffprobe on MP4/WebM output).
