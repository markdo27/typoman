#!/usr/bin/env node
/* TYPOMAN smoke tests: boots the studio in headless Chromium and checks every preset for
 * determinism, loop-seam continuity, render cost, edge-case robustness, and that the scene
 * sanitiser survives garbage input. Exit code is non-zero on failure.
 *
 *   npm test                      (uses the `playwright` package)
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/smoke.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.TYPOMAN_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(base + 'index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.TM && window.TM.Studio && window.TM.Studio.store, null, { timeout: 20000 });
await page.evaluate(() => Promise.all(['Anton', 'Roboto Flex', 'Fraunces'].map((f) => TM.fonts.ensure(f, 400))));

const results = await page.evaluate(async () => {
  const W = 480, H = 270;
  const pixels = (scene, t) => {
    const c = document.createElement('canvas');
    const r = new TM.Renderer(c);
    r.setScene(scene);
    r.resize(W, H);
    r.render(t);
    return { data: c.getContext('2d').getImageData(0, 0, W, H).data, warned: !!r._warned };
  };
  const diff = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    return (s / ((a.length / 4) * 765)) * 100; // % of max difference
  };
  const base = TM.Scene.defaults();
  base.layers[0].text = 'TYPE IN MOTION';
  const sceneFor = (id, patch) => {
    const s = TM.Scene.clone(base);
    s.layers[0].preset = id;
    s.layers[0].params = TM.presetDefaults(id);
    if (patch) patch(s.layers[0], s);
    return TM.Scene.normalize(s);
  };
  const EDGE = {
    empty: (l) => { l.text = ''; },
    emoji: (l) => { l.text = 'GO 🚀 NOW ✨'; },
    long: (l) => { l.text = 'Kinetic typography '.repeat(21).slice(0, 400); },
    multiline: (l) => { l.text = 'ONE\nTWO\nTHREE'; },
    serif: (l) => { l.text = 'quiet type'; l.font.family = 'Fraunces'; l.type.case = 'none'; },
    variable: (l) => { l.font.family = 'Roboto Flex'; l.font.weight = 800; },
    effects: (l, s) => { l.fx.echo.count = 4; l.fx.blur = 0.5; l.fx.glow.amount = 0.5; l.fx.extrude.depth = 0.4; l.fill.type = 'gradient'; s.post.grain = 0.4; },
    portrait: (l, s) => { s.size = { w: 1080, h: 1920 }; },
  };
  const out = [];
  for (const id of TM.presetOrder) {
    const sc = sceneFor(id);
    const dt = 1 / sc.fps;
    const a = pixels(sc, 1.237), b = pixels(sc, 1.237);
    const deterministic = diff(a.data, b.data) === 0;
    // Seam: how much the loop point changes vs. a typical frame-to-frame change.
    const steps = [0.13, 0.37, 0.61, 0.83].map((u) => diff(pixels(sc, u * sc.duration).data, pixels(sc, u * sc.duration + dt).data));
    steps.sort((x, y) => x - y);
    const typical = Math.max(0.02, (steps[1] + steps[2]) / 2);
    const seam = diff(pixels(sc, sc.duration - dt).data, pixels(sc, 0).data);
    // Render cost at 1080p.
    const c = document.createElement('canvas');
    const r = new TM.Renderer(c);
    r.setScene(sc);
    r.resize(1920, 1080);
    r.render(0.5);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) r.render(0.5 + i * dt);
    const ms = (performance.now() - t0) / 20;
    // Edge cases must not throw.
    const edgeFailures = [];
    for (const [name, patch] of Object.entries(EDGE)) {
      try {
        const res = pixels(sceneFor(id, patch), sc.duration * 0.45);
        if (res.warned) edgeFailures.push(name);
      } catch (e) {
        edgeFailures.push(name + ': ' + e.message);
      }
    }
    out.push({ id, deterministic, seamRatio: +(seam / typical).toFixed(2), seam: +seam.toFixed(3), ms1080: +ms.toFixed(2), warned: a.warned, edgeFailures });
  }

  // Sanitiser fuzz: garbage must normalise to a valid scene without throwing.
  const garbage = [null, 42, 'x', [], { layers: 'nope' }, { size: { w: -5, h: 1e9 }, fps: 7, duration: 'abc' },
    { layers: [{ text: 5, preset: '<script>', font: { family: 'Comic Sans' }, fill: { color: 'red' }, path: { nodes: [{ x: 'a' }] } }] },
    { bg: { type: 'video', color: 'javascript:alert(1)' }, layers: Array.from({ length: 50 }, () => ({})) }];
  let fuzzOk = true;
  for (const g of garbage) {
    try {
      const n = TM.Scene.normalize(g);
      if (!n.layers.length || n.layers.length > TM.Scene.MAX_LAYERS || !TM.color.isHex(n.bg.color) || !TM.fonts.has(n.layers[0].font.family) || !TM.getPreset(n.layers[0].preset)) fuzzOk = false;
    } catch (e) { fuzzOk = false; }
  }
  // Encode/decode round trip.
  const s0 = sceneFor(TM.presetOrder[0], (l) => { l.text = 'Round ✓ trip\nline 2'; });
  const s1 = await TM.Scene.decode(await TM.Scene.encode(s0));
  // Numbers are rounded to 4 decimals in links (≈0.2 px at 1080p), so compare with tolerance.
  const close = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-3
    : a && typeof a === 'object' ? b && typeof b === 'object' && Object.keys({ ...a, ...b }).every((k) => close(a[k], b[k])) : a === b);
  const roundTrip = close(s0, s1);
  return { presets: out, fuzzOk, roundTrip };
});

await browser.close();
server.close();

const fails = [];
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('preset', 14) + pad('determ.', 9) + pad('seam×', 8) + pad('ms@1080', 9) + 'edge cases');
for (const p of results.presets) {
  console.log(pad(p.id, 14) + pad(p.deterministic ? 'yes' : 'NO', 9) + pad(p.seamRatio, 8) + pad(p.ms1080, 9) + (p.edgeFailures.length ? 'FAIL ' + p.edgeFailures.join(', ') : 'ok'));
  if (!p.deterministic) fails.push(`${p.id}: not deterministic`);
  if (p.seamRatio > 6 && p.seam > 0.5) fails.push(`${p.id}: visible loop seam (×${p.seamRatio})`);
  if (p.warned) fails.push(`${p.id}: threw while rendering`);
  if (p.edgeFailures.length) fails.push(`${p.id}: edge cases failed (${p.edgeFailures.join(', ')})`);
}
console.log(`\nsanitiser fuzz: ${results.fuzzOk ? 'ok' : 'FAIL'} · encode/decode round trip: ${results.roundTrip ? 'ok' : 'FAIL'}`);
if (!results.fuzzOk) fails.push('sanitiser fuzz failed');
if (!results.roundTrip) fails.push('encode/decode round trip failed');
const errs = consoleErrors.filter((e) => !/favicon/.test(e));
if (errs.length) { console.log('\nconsole errors:\n  ' + errs.join('\n  ')); fails.push(`${errs.length} console error(s)`); }
if (fails.length) {
  console.log('\nFAILED:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log(`\nall ${results.presets.length} presets passed`);
