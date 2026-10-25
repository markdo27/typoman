#!/usr/bin/env node
/* TYPOMAN long-loop flash check — Round 6 safety fix verification.
 *
 * History: TM.Safety.flashes() used to cap analysis at 900 frames
 * (js/engine/safety.js: `maxFrames || 900`). A 60 s loop at 60 fps was therefore
 * analysed at 900 / 60 = 15 fps, whose Nyquist limit is 7.5 Hz. Content flashing
 * faster than that aliased: a 15 Hz full-frame strobe was sampled at exactly its own
 * rate, so every analysed frame saw the same phase and the detector reported
 * 0 flashes/s — a strobe five times the WCAG 3/s limit "passed".
 *
 * Round 6 removed the cap: safety.js now analyses the whole loop at the scene's
 * full frame rate, rendered in 240-frame slices with yields between slices. This
 * test pins the FIXED behaviour, and must not be weakened back to the aliased
 * readings: the 60 s 15 Hz strobe must now report ~15/s and fail, the 60 s 4 Hz
 * control must still report 4/s, the short-loop control must be unchanged, a
 * 60 s saturated-red strobe must report its red flashes at full rate, and a
 * single white frame at frame 0 (a pulse whose rising edge is exactly the loop
 * seam) must still count as 1 flash, proving cyclic seam analysis survived.
 *
 *   node tests/flash-long-loop.mjs
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/flash-long-loop.mjs
 *
 * Exit code is non-zero when any case stops reporting correctly. Each case also
 * reports its analysis time in the page (ms), the timing evidence for the
 * Round 6 safety notes.
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(base + 'index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.TM && window.TM.Safety && window.TM_READY, null, { timeout: 20000 });
await page.evaluate(() => window.TM_READY);

const results = await page.evaluate(async () => {
  // Same strobe shape as smoke.mjs's photosensitivity check, full-frame only.
  TM.registerPreset({ id: 'r6-long-strobe', params: [TM.P.range('hz', 'hz', 0, 30, 0.5, 15)], render(f) {
    f.identity(); f.ctx.fillStyle = '#ffffff';
    if (Math.floor(f.t * f.params.hz * 2 + 1e-6) % 2) return;
    f.ctx.fillRect(0, 0, f.W, f.H);
  } });
  // Saturated-red version of the same strobe: black <-> pure red.
  TM.registerPreset({ id: 'r6-long-red', params: [TM.P.range('hz', 'hz', 0, 30, 0.5, 15)], render(f) {
    f.identity(); f.ctx.fillStyle = '#ff0000';
    if (Math.floor(f.t * f.params.hz * 2 + 1e-6) % 2) return;
    f.ctx.fillRect(0, 0, f.W, f.H);
  } });
  // Seam pulse: white on frame 0 only, black everywhere else. Its rising edge is
  // the loop seam (last frame black -> frame 0 white); cyclic analysis counts it.
  TM.registerPreset({ id: 'r6-seam-pulse', params: [], render(f) {
    f.identity(); if (f.frameIndex !== 0) return;
    f.ctx.fillStyle = '#ffffff'; f.ctx.fillRect(0, 0, f.W, f.H);
  } });
  const check = async (preset, duration, fps, hz) => {
    const s = TM.Scene.defaults(); s.duration = duration; s.fps = fps; s.bg = { type: 'solid', color: '#000000' };
    s.layers[0].preset = preset; s.layers[0].params = Object.assign(TM.presetDefaults(preset), hz === undefined ? {} : { hz });
    const t0 = performance.now();
    const r = await TM.Safety.flashes(TM.Scene.normalize(s));
    return { duration, fps, hz, frames: r.frames, analysisFps: +(r.frames / duration).toFixed(2), flashes: r.flashes, red: r.red, ok: r.ok, ms: Math.round(performance.now() - t0) };
  };
  const out = {
    long15: await check('r6-long-strobe', 60, 60, 15), // was aliased to 0/s at the 900 cap; now full rate
    short15: await check('r6-long-strobe', 2, 60, 15), // control: was already full rate, must be unchanged
    long4: await check('r6-long-strobe', 60, 60, 4), // control: below the old 7.5 Hz Nyquist limit
    longRed15: await check('r6-long-red', 60, 60, 15), // red flashes must also be counted at full rate
    seam: await check('r6-seam-pulse', 4, 60), // 1 flash: rise across the seam + fall on frame 1
    short4s: await check('r6-long-strobe', 4, 60, 15), // timing anchor: a 4 s loop at full rate
  };
  for (const id of ['r6-long-strobe', 'r6-long-red', 'r6-seam-pulse']) { delete TM.presets[id]; TM.presetOrder.splice(TM.presetOrder.indexOf(id), 1); }
  return out;
});

await browser.close();
server.close();

const { long15, short15, long4, longRed15, seam, short4s } = results;
console.log('\nLONG-LOOP FLASH CHECK (Round 6: full-rate sliced analysis, no 900-frame cap)');
console.log(`  60 s @ 60 fps, 15 Hz strobe: analysed ${long15.frames} frames = ${long15.analysisFps} fps in ${long15.ms} ms`);
console.log(`    true rate 15/s · analysed ${long15.flashes}/s · safety ok=${long15.ok}`);
console.log(`  2 s @ 60 fps, 15 Hz strobe (control): analysed ${short15.frames} frames = ${short15.analysisFps} fps in ${short15.ms} ms`);
console.log(`    true rate 15/s · analysed ${short15.flashes}/s · safety ok=${short15.ok}`);
console.log(`  60 s @ 60 fps, 4 Hz strobe (control): analysed ${long4.frames} frames = ${long4.analysisFps} fps in ${long4.ms} ms`);
console.log(`    true rate 4/s · analysed ${long4.flashes}/s · safety ok=${long4.ok}`);
console.log(`  60 s @ 60 fps, 15 Hz saturated-red strobe: analysed ${longRed15.frames} frames = ${longRed15.analysisFps} fps in ${longRed15.ms} ms`);
console.log(`    true rate 15/s · analysed ${longRed15.flashes}/s general, ${longRed15.red}/s red · safety ok=${longRed15.ok}`);
console.log(`  4 s @ 60 fps, seam pulse (white on frame 0 only): analysed ${seam.frames} frames in ${seam.ms} ms`);
console.log(`    expected 1 flash (seam rise + frame-1 fall) · analysed ${seam.flashes}/s · safety ok=${seam.ok}`);
console.log(`  4 s @ 60 fps, 15 Hz strobe (timing anchor): analysed ${short4s.frames} frames in ${short4s.ms} ms`);
console.log(`    true rate 15/s · analysed ${short4s.flashes}/s · safety ok=${short4s.ok}`);

const fails = [];
// Pin the fix: a long loop must be analysed at its full scene rate, never capped.
if (long15.frames !== 3600) fails.push(`long loop analysed ${long15.frames} frames, expected 60 s x 60 fps = 3600 (no cap)`);
if (long15.analysisFps !== 60) fails.push(`long-loop analysis rate ${long15.analysisFps} fps, expected 60 fps`);
if (long15.flashes < 14 || long15.flashes > 16) fails.push(`15 Hz long-loop strobe analysed as ${long15.flashes}/s, expected ~15/s — a lower/zero reading means aliasing is back`);
if (long15.ok !== false) fails.push('15 Hz long-loop strobe unexpectedly passed the safety check (15/s is 5x the 3/s limit)');
if (short15.flashes < 14 || short15.flashes > 16) fails.push(`short-loop 15 Hz control analysed as ${short15.flashes}/s, expected ~15/s`);
if (short15.ok !== false) fails.push('short-loop 15 Hz control unexpectedly passed the safety check');
if (long4.frames !== 3600) fails.push(`long-loop 4 Hz control analysed ${long4.frames} frames, expected 3600`);
if (long4.flashes !== 4) fails.push(`long-loop 4 Hz control analysed as ${long4.flashes}/s, expected 4/s`);
if (long4.ok !== false) fails.push('long-loop 4 Hz control unexpectedly passed the safety check (4/s is over the 3/s limit)');
if (longRed15.flashes < 14 || longRed15.flashes > 16) fails.push(`red long-loop strobe analysed as ${longRed15.flashes}/s general, expected ~15/s`);
if (longRed15.red < 14 || longRed15.red > 16) fails.push(`red long-loop strobe analysed as ${longRed15.red}/s red, expected ~15/s — red flashes must be counted at full rate too`);
if (longRed15.ok !== false) fails.push('red long-loop strobe unexpectedly passed the safety check');
if (seam.flashes !== 1) fails.push(`seam pulse analysed as ${seam.flashes}/s, expected 1 flash — the loop seam must count`);
if (seam.ok !== true) fails.push('seam pulse unexpectedly failed the safety check (1/s is under the 3/s limit)');
if (short4s.flashes < 14 || short4s.flashes > 16) fails.push(`4 s 15 Hz anchor analysed as ${short4s.flashes}/s, expected ~15/s`);

if (fails.length) {
  console.log('\nFAILED:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('\nlong-loop flash check passed: 60 s strobe reads ~15/s and fails, controls, red flashes and the seam all read correctly');
