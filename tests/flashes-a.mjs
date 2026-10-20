#!/usr/bin/env node
/* TYPOMAN flash check, preset team A (path & loop family): every preset's defaults and every
 * curated look must stay at or below 3 flashes per second, general and red, as TM.Safety.flashes
 * measures them (WCAG 2.3.1 at full-screen playback, the strictest case, loop analysed
 * cyclically). Scenes are built the way the studio builds them: the default scene, the preset's
 * own path for its aspect, then the look applied with TM.Scene.applyLook.
 *
 *   node tests/flashes-a.mjs                  team A's presets
 *   node tests/flashes-a.mjs all              every registered preset
 *   node tests/flashes-a.mjs wave orbit …     just these
 *   ASPECTS=16:9,9:16,1:1 node tests/flashes-a.mjs    also other frame shapes (default 16:9)
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/flashes-a.mjs
 *
 * Exit code is non-zero when any configuration flashes more than the limit.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEAM_A = ['wave', 'path-land', 'path-draw', 'orbit', 'tunnel', 'lens', 'spotlight', 'ribbon', 'magnet', 'kaleido', 'kinetic-grid', 'melt', 'gravity'];
const ROOT = path.resolve(process.env.TYPOMAN_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const args = process.argv.slice(2);
const ASPECTS = (process.env.ASPECTS || '16:9').split(',').map((a) => a.split(':').map(Number)).filter(([w, h]) => w > 0 && h > 0);

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
// index.html: TM.Safety ships with the export group, which the studio page loads.
await page.goto(base + 'index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.TM && window.TM.Safety && window.TM_READY, null, { timeout: 20000 });
await page.evaluate(() => window.TM_READY);

const ids = await page.evaluate((want) => (want.length === 1 && want[0] === 'all' ? TM.presetOrder.slice() : want.filter((id) => TM.getPreset(id))), args.length ? args : TEAM_A);
const rows = [];
const fails = [];
for (const id of ids) {
  // One preset per evaluate keeps each call short and the progress visible.
  const res = await page.evaluate(async ({ id, aspects }) => {
    const p = TM.getPreset(id);
    const out = [];
    for (const [aw, ah] of aspects) {
      const s = TM.Scene.defaults();
      s.size = aw >= ah ? { w: 1920, h: Math.round((1920 * ah) / aw) } : { w: Math.round((1920 * aw) / ah), h: 1920 };
      const l = s.layers[0];
      l.preset = id;
      l.params = TM.presetDefaults(id);
      if (p.usesPath) l.path = TM.Path.preset(p.path || 'wave', s.size.w / s.size.h);
      const plain = TM.Scene.normalize(s);
      const configs = [['default', plain]].concat((p.looks || []).map((look) => [look.name, TM.Scene.applyLook(plain, 0, Object.assign({}, look, { preset: id }))]));
      for (const [name, scene] of configs) {
        await TM.prepare(scene, { timeout: 8000 });
        const r = await TM.Safety.flashes(scene);
        out.push({ name, aspect: aw + ':' + ah, flashes: r.flashes, red: r.red, at: +r.worstAt.toFixed(2), ok: r.ok, frames: r.frames });
      }
    }
    return out;
  }, { id, aspects: ASPECTS });
  for (const r of res) {
    rows.push(Object.assign({ id }, r));
    console.log(`${id.padEnd(14)}${r.name.slice(0, 22).padEnd(24)}${r.aspect.padEnd(7)}${String(r.flashes).padEnd(6)}${String(r.red).padEnd(6)}${r.ok ? 'ok' : 'FAIL'}${r.ok ? '' : ' (worst second starts ' + r.at + ' s)'}`);
    if (!r.ok) fails.push(`${id} · ${r.name} · ${r.aspect}: ${r.flashes}/s general, ${r.red}/s red`);
  }
}

await browser.close();
server.close();

if (process.env.FLASH_JSON) fs.writeFileSync(process.env.FLASH_JSON, JSON.stringify(rows, null, 1));
const errs = consoleErrors.filter((e) => !/favicon/.test(e));
if (errs.length) { console.log('\nconsole errors:\n  ' + errs.join('\n  ')); fails.push(`${errs.length} console error(s)`); }
if (fails.length) {
  console.log(`\nFAILED (limit 3 flashes/s):\n  ` + fails.join('\n  '));
  process.exit(1);
}
console.log(`\nall ${rows.length} configurations of ${ids.length} presets at or below 3 flashes/s`);
