// Live-embed behaviour of <typoman-player> and embed.html: per-page text, scroll scrub, hover
// trigger, reduced motion, and the iframe's text param and progress message.
//   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/embed-live.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const HOST = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>host</title>
<style>body{margin:0} .spacer{height:1400px} typoman-player{width:640px;margin:0 auto}</style></head>
<body><div class="spacer"></div>
<typoman-player id="scrub" scrub="scroll"></typoman-player>
<div class="spacer"></div>
<typoman-player id="hover" trigger="hover" loop></typoman-player>
<typoman-player id="text" autoplay loop text="HELLO\\nWORLD"></typoman-player>
<div class="spacer"></div>
<script src="/player.js"></script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__host.html') return res.writeHead(200, { 'content-type': 'text/html' }).end(HOST);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => (err ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(data)));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const results = [];
const check = (name, cond, extra = '') => results.push({ name, ok: !!cond, extra });

async function sceneCode(page) {
  return page.evaluate(async () => {
    const s = TM.Scene.defaults();
    s.duration = 4;
    s.layers[0].preset = 'rise';
    s.layers[0].params = TM.presetDefaults('rise');
    return TM.Scene.encode(TM.Scene.normalize(s));
  });
}

for (const reduced of [false, true]) {
  const ctx = await browser.newContext({ reducedMotion: reduced ? 'reduce' : 'no-preference', viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && errors.push(m.text()));
  await page.goto(base + '__host.html');
  await page.waitForFunction(() => window.TM && TM.Scene, null, { timeout: 30000 });
  const code = await sceneCode(page);
  await page.evaluate((c) => document.querySelectorAll('typoman-player').forEach((el) => el.setAttribute('scene', c)), code);
  await page.waitForFunction(() => [...document.querySelectorAll('typoman-player')].every((el) => isFinite(el.duration)), null, { timeout: 30000 });
  await page.waitForTimeout(300);
  const tag = reduced ? ' (reduced motion)' : '';

  const label = await page.evaluate(() => document.getElementById('text').shadowRoot.querySelector('canvas').getAttribute('aria-label'));
  check('text attribute replaces layer 1' + tag, /HELLO WORLD/.test(label), label);

  const scrubAt = async (y) => {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(700);
    return page.evaluate(() => {
      const el = document.getElementById('scrub'), r = el.getBoundingClientRect();
      const u = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height)));
      return { t: el.currentTime, want: u * (el.duration - 1 / 60), paused: el.paused };
    });
  };
  const a = await scrubAt(900), b = await scrubAt(1300), c = await scrubAt(1700);
  if (!reduced) {
    check('scrub="scroll" follows the scroll', [a, b, c].every((x) => Math.abs(x.t - x.want) < 0.05) && a.t < b.t && b.t < c.t, JSON.stringify([a.t, b.t, c.t].map((v) => +v.toFixed(2))));
    check('scrub never plays by itself', a.paused && b.paused && c.paused);
  } else {
    check('reduced motion: scrub shows a still', a.t === b.t && b.t === c.t);
  }

  await page.evaluate(() => document.getElementById('hover').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const box = await page.locator('#hover').boundingBox();
  const state = () => page.evaluate(() => ({ t: document.getElementById('hover').currentTime, paused: document.getElementById('hover').paused }));
  const h0 = await state();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const h1 = await state();
  await page.mouse.move(4, 4);
  await page.waitForTimeout(400);
  const h2 = await state();
  await page.waitForTimeout(300);
  const h3 = await state();
  if (!reduced) {
    check('trigger="hover": still until hovered', h0.paused && h0.t === 0);
    check('trigger="hover": plays while hovered', !h1.paused && h1.t > 0.3, JSON.stringify(h1));
    check('trigger="hover": pauses on leave', h2.paused && h3.t === h2.t);
  } else {
    check('reduced motion: hover does not play', h1.paused && h1.t === 0);
  }
  check('no page errors' + tag, !errors.length, errors.join(' | '));
  await ctx.close();
}

{
  const page = await browser.newPage();
  await page.goto(base + 'embed.html');
  await page.waitForFunction(() => window.TM && TM.Scene, null, { timeout: 30000 });
  const code = await sceneCode(page);
  await page.setContent(`<iframe id="f" src="${base}embed.html#c=${code}&text=${encodeURIComponent('Bonjour\\nmonde')}" style="width:640px;height:360px;border:0"></iframe>`);
  const frame = await (await page.waitForSelector('#f')).contentFrame();
  await frame.waitForFunction(() => isFinite(document.getElementById('player').duration), null, { timeout: 30000 });
  const label = await frame.evaluate(() => document.getElementById('player').shadowRoot.querySelector('canvas').getAttribute('aria-label'));
  check('iframe: &text= replaces layer 1', /Bonjour monde/i.test(label), label);
  await page.evaluate(() => document.getElementById('f').contentWindow.postMessage({ typoman: 'progress', value: 0.5 }, '*'));
  await page.waitForTimeout(300);
  const st = await frame.evaluate(() => { const p = document.getElementById('player'); return { t: p.currentTime, d: p.duration, paused: p.paused }; });
  check('iframe: progress message scrubs', st.paused && Math.abs(st.t - 0.5 * (st.d - 1 / 60)) < 0.02, JSON.stringify(st));
}

await browser.close();
server.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok || !r.extra ? '' : '  ' + r.extra}`);
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} check(s) failed` : `\nall ${results.length} live-embed checks passed`);
process.exit(failed.length ? 1 : 0);
