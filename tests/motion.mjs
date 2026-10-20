#!/usr/bin/env node
/* TYPOMAN motion quality, path presets: every preset that follows a path, at its defaults and in
 * every curated look, traced glyph by glyph (each f.drawGlyph call of the main pass) at 960 × 540
 * and 60 fps over one loop:
 *
 *   residual  the worst second difference of a glyph's position, |x_k − (x_{k−1} + x_{k+1}) / 2|
 *             in px: a smooth path stays well under a pixel, a jitter or a snap shows as a spike.
 *             Presets that draw a glyph several times (repeats round a ring, rows of a field)
 *             have each draw matched to the nearest draw of the same glyph in the frames either
 *             side; a draw with no match within MATCH px (a copy entering or leaving) is skipped,
 *             as is the loop seam for presets whose timing pops there by design.
 *   overlap   the share of frames in which two opaque letters (alpha > 0.5) overlap by more than
 *             30% of the smaller one's box (advance × cap height, rotated and scaled as drawn).
 *
 * Limits are per preset, set just above what the presets measure today (Round 3), so CI catches
 * regressions; tighten them as presets improve.
 *
 *   node tests/motion.mjs [preset-id …]
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/motion.mjs
 *   MOTION_JSON=out.json node tests/motion.mjs     (also write every measurement)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// [residual px, overlap share of frames] for defaults and looks; DEFAULT_LIMIT for other path
// presets. Overlap is null where letters overlap by design: rings in depth (Orbit, Tunnel), the
// magnified field (Lens), the bulge (Magnet). Measured today (Round 3) in the comments.
const LIMITS = {
  'path-flow': [2, 0.03], // 0.09 px, 0%
  'path-land': [16, 0.06], // 14.4 px (Swiss scatter landing bounce; 8.2 default: the exit train's lead letter starts at full speed), 4.6%
  'path-draw': [2, 0.02], // 0.76 px, 0%
  orbit: [4, null], // 2.94 px
  tunnel: [2, null], // 1.01 px
  lens: [80, null], // 67 px: letters handing over between a field row and the lens (and repeats in the dense field matching ambiguously)
  spotlight: [1, 0.02], // 0 px, 0%
  ribbon: [3, 0.05], // 1.5 px, 2.5%
  magnet: [1, null], // 0.57 px
  gravity: [15, 0.03], // 10.4 px (impacts are true velocity reversals), 0.8%
};
const DEFAULT_LIMIT = [6, 0.05];
const MATCH = 80; // px per frame at 960 × 540: faster than any letter moves (4800 px/s)

const ROOT = path.resolve(process.env.TYPOMAN_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const only = process.argv.slice(2);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
// The engine and presets only: no studio running its own animation in the background.
await page.setContent(`<!doctype html><meta charset="utf-8"><script src="${base}js/boot.js" data-groups="engine,presets"></script>`);
await page.waitForFunction(() => window.TM_READY, null, { timeout: 20000 });
await page.evaluate(() => window.TM_READY);

const ids = await page.evaluate((want) => TM.presetOrder.filter((id) => TM.presets[id].usesPath && (!want.length || want.includes(id))), only);

const rows = [];
for (const id of ids) {
  const res = await page.evaluate(async ({ id, MATCH }) => {
    const W = 960, H = 540, FPS = 60;
    const p = TM.getPreset(id);
    const s = TM.Scene.defaults();
    s.layers[0].preset = id;
    s.layers[0].params = TM.presetDefaults(id);
    s.layers[0].path = TM.Path.preset(p.path || 'wave', s.size.w / s.size.h);
    const plain = TM.Scene.normalize(s);
    const configs = [['default', plain]].concat((p.looks || []).map((look) => [look.name, TM.Scene.applyLook(plain, 0, Object.assign({}, look, { preset: id }))]));
    const out = [];
    for (const [name, scene] of configs) {
      await TM.prepare(scene, { timeout: 8000 });
      const c = document.createElement('canvas');
      const r = new TM.Renderer(c, { quality: 'full' });
      r.setScene(scene);
      r.resize(W, H);
      // Hook drawGlyph: record every draw of the main pass, per glyph, per frame.
      const proto = TM.Frame.prototype, orig = proto.drawGlyph;
      let rec = null;
      proto.drawGlyph = function (g, o = {}) {
        if (rec && this.echo === 0 && g && g.i != null) {
          const sx = o.sx != null ? o.sx : o.scale != null ? o.scale : 1;
          const sy = o.sy != null ? o.sy : o.scale != null ? o.scale : 1;
          if (!rec.has(g.i)) rec.set(g.i, []);
          rec.get(g.i).push({
            x: o.x != null ? o.x : this.cx + g.cx, y: o.y != null ? o.y : this.cy + g.cy, rot: o.rot || 0,
            w: Math.abs((o.w != null ? o.w : g.w) * sx), h: Math.abs(this.layout.capH * sy), a: (o.alpha == null ? 1 : o.alpha) * this.alpha,
          });
        }
        return orig.call(this, g, o);
      };
      const n = Math.round(scene.duration * FPS);
      const frames = [];
      try { for (let k = 0; k < n; k++) { rec = new Map(); r.render(k / FPS); frames.push(rec); } } finally { rec = null; proto.drawGlyph = orig; }
      // Residual, cyclic over the loop unless its timing pops at the seam by design.
      const cyclic = !(scene.layers[0].params.timing === 'in');
      let worst = 0, at = 0, who = '';
      const nearest = (list, b) => {
        let best = null, d = MATCH;
        if (list) for (const q of list) { const e = Math.hypot(q.x - b.x, q.y - b.y); if (e < d) { d = e; best = q; } }
        return best;
      };
      for (let k = 0; k < n; k++) {
        if (!cyclic && (k === 0 || k === n - 1)) continue;
        const A = frames[(k - 1 + n) % n], B = frames[k], C = frames[(k + 1) % n];
        for (const [gi, list] of B) {
          for (const b of list) {
            if (b.a < 0.05) continue;
            const a = nearest(A.get(gi), b), cc = nearest(C.get(gi), b);
            if (!a || !cc) continue;
            const v = Math.max(Math.abs(b.x - (a.x + cc.x) / 2), Math.abs(b.y - (a.y + cc.y) / 2));
            if (v > worst) { worst = v; at = k; who = String(gi); }
          }
        }
      }
      // Overlap: oriented-box separating axes, overlap estimated from the shallowest axis.
      const over = (P, Q) => {
        const cp = Math.cos(P.rot), sp = Math.sin(P.rot), cq = Math.cos(Q.rot), sq = Math.sin(Q.rot);
        const dx = Q.x - P.x, dy = Q.y - P.y;
        let frac = 1;
        for (const [ux, uy] of [[cp, sp], [-sp, cp], [cq, sq], [-sq, cq]]) {
          const ra = (P.w / 2) * Math.abs(cp * ux + sp * uy) + (P.h / 2) * Math.abs(-sp * ux + cp * uy);
          const rb = (Q.w / 2) * Math.abs(cq * ux + sq * uy) + (Q.h / 2) * Math.abs(-sq * ux + cq * uy);
          const o = ra + rb - Math.abs(dx * ux + dy * uy);
          if (o <= 0) return 0;
          frac = Math.min(frac, o / (2 * Math.min(ra, rb)));
        }
        return frac;
      };
      let hit = 0;
      for (const fr of frames) {
        const list = [...fr.values()].flat().filter((b) => b.a > 0.5 && b.w > 1 && b.h > 1);
        let bad = false;
        for (let i = 0; i < list.length && !bad; i++) for (let j = i + 1; j < list.length && !bad; j++) {
          // Overlap along both axes (the product approximates the shared share of the smaller box).
          const P = list[i], Q = list[j];
          if (Math.abs(P.x - Q.x) > (P.w + P.h + Q.w + Q.h) / 2 || Math.abs(P.y - Q.y) > (P.w + P.h + Q.w + Q.h) / 2) continue;
          if (over(P, Q) > 0.3) bad = true;
        }
        if (bad) hit++;
      }
      out.push({ name, residual: +worst.toFixed(2), at: +(at / FPS).toFixed(2), glyph: who, overlap: +(hit / n).toFixed(3) });
    }
    return out;
  }, { id, MATCH });
  for (const r of res) rows.push(Object.assign({ id }, r));
}

await browser.close();
server.close();

if (process.env.MOTION_JSON) fs.writeFileSync(process.env.MOTION_JSON, JSON.stringify(rows, null, 1));
const fails = [];
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('preset', 14) + pad('config', 22) + pad('residual px', 13) + pad('(limit)', 9) + pad('overlap', 9) + '(limit)');
for (const r of rows) {
  const [rl, ol] = LIMITS[r.id] || DEFAULT_LIMIT;
  const ok = r.residual <= rl && (ol == null || r.overlap <= ol);
  console.log(pad(r.id, 14) + pad(r.name.slice(0, 20), 22) + pad(r.residual, 13) + pad(rl, 9) + pad((r.overlap * 100).toFixed(1) + '%', 9) + (ol == null ? 'by design' : (ol * 100).toFixed(0) + '%') + (ok ? '' : '   FAIL'));
  if (r.residual > rl) fails.push(`${r.id} · ${r.name}: residual ${r.residual} px > ${rl} (glyph ${r.glyph} at ${r.at} s)`);
  if (ol != null && r.overlap > ol) fails.push(`${r.id} · ${r.name}: letters overlap in ${(r.overlap * 100).toFixed(1)}% of frames > ${(ol * 100).toFixed(0)}%`);
}
const errs = consoleErrors.filter((e) => !/favicon/.test(e));
if (errs.length) { console.log('\nconsole errors:\n  ' + errs.join('\n  ')); fails.push(`${errs.length} console error(s)`); }
if (fails.length) { console.log('\nFAILED:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log(`\nall ${rows.length} configurations of ${ids.length} path presets within limits`);
