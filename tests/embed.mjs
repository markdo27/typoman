#!/usr/bin/env node
/* TYPOMAN embed tests: the three ways a scene leaves the studio, each on a foreign origin.
 *
 *   app origin  (127.0.0.1:A)  serves the repo: player.js, embed.html, js/…   (no CORS headers)
 *   host origin (127.0.0.1:B)  serves pages that embed it
 *
 *   1. <iframe src="A/embed.html#c=…">                      autoplay/loop/controls via the hash,
 *                                                            events and postMessage control
 *   2. <script src="A/player.js"> + <typoman-player …>       autoplay, loop, controls, start, poster
 *   3. the standalone HTML from TM.Export.buildStandalone    served by B (and from file://)
 *
 * For each: it renders (canvas inside the player's shadow root, not blank), a paused frame at a
 * fixed time matches a fresh TM.Renderer pixel for pixel, autoplay / loop / controls behave as
 * documented, and nothing logs a console error. Plus: offscreen pause and reduced motion.
 *
 *   npm run test:embed
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/embed.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadChromium, serve, openHarness, ConsoleLog, frames, Report, run } from './lib/harness.mjs';
import { diffStats } from './lib/media.mjs';

// Pixel tolerance: the player and the reference run the same engine in the same browser, so they
// should agree exactly (Round 2 measured 0 differing pixels). Allow a sliver for anti-aliasing.
const MAX_DIFF_FRACTION = 0.001;
const MAX_LEVEL_DIFF = 2;

const W = 640, H = 360;
// One second loops keep autoplay / loop / ended quick. Two layers: a variable-font width instance
// (Roboto Flex at 60%) in motion, and Fraunces with optical size pinned to the scene.
const SCENE = {
  name: 'QA Embed', duration: 1, fps: 30, bg: { type: 'solid', color: '#0b1020' },
  layers: [
    { preset: 'wave', text: 'EMBED ME', font: { family: 'Roboto Flex', weight: 800, width: 60 }, anchor: { x: 0.5, y: 0.42 } },
    { preset: 'rise', text: 'cross-origin', font: { family: 'Fraunces', weight: 400, opsz: 'auto' }, type: { size: 0.08, case: 'none' }, fill: { type: 'solid', color: '#ffd400' }, anchor: { x: 0.5, y: 0.78 } },
  ],
};
const T_START = 0.35; // `start` / `#start=` poster time
const T_SEEK = 0.5; // pause + seek time
const WAIT = 8000; // ms to wait for playback conditions (wrap, ended, time advancing): 8 loops

/** Click a control (shadow DOM is pierced); false instead of a 30 s timeout if it can't be clicked. */
const tryClick = async (locator) => { try { await locator.click({ timeout: 3000 }); return true; } catch (e) { return false; } };

// Records every <typoman-player> event (they don't bubble; a capture listener on window still
// sees them) in every document, including cross-origin iframes.
const INIT = () => {
  window.__qaEvents = [];
  for (const type of ['ready', 'play', 'pause', 'ended', 'error']) {
    window.addEventListener(type, (e) => {
      const el = e.target;
      if (el && el.localName === 'typoman-player') window.__qaEvents.push({ id: el.id, type, time: el.currentTime, at: performance.now() });
    }, true);
  }
};

// ───────────────────────────── page-side probes ─────────────────────────────
/** State of a player: public API plus what's on screen (shadow DOM). */
const playerState = (target, id) => target.evaluate((id) => {
  const el = id ? document.getElementById(id) : document.querySelector('typoman-player');
  const root = el && el.shadowRoot;
  const canvas = root && root.querySelector('canvas');
  const btn = (part) => { const b = root && root.querySelector(`[part="${part}"]`); return !!b && !b.hidden && getComputedStyle(b).display !== 'none'; };
  return {
    exists: !!el,
    shadowCanvas: !!canvas,
    lightCanvas: !!(el && el.querySelector('canvas')),
    canvas: canvas ? { w: canvas.width, h: canvas.height } : null,
    paused: el ? el.paused : null,
    time: el ? el.currentTime : null,
    duration: el ? el.duration : null,
    playButton: btn('play-button'),
    controls: btn('controls'),
    error: btn('error'),
    quality: el && el._renderer ? el._renderer.quality : null,
    events: (window.__qaEvents || []).filter((e) => !id || e.id === id).map((e) => e.type),
  };
}, id);

/** The player's canvas as RGBA (base64), plus a cheap "is anything drawn" measure. */
const playerPixels = (target, id) => target.evaluate((id) => {
  const el = id ? document.getElementById(id) : document.querySelector('typoman-player');
  const c = el.shadowRoot.querySelector('canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const bg = [d[0], d[1], d[2]];
  let ink = 0, clear = 0;
  const colors = new Set();
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 48) ink++;
    if (d[i + 3] === 0) clear++;
    if (i % 64 === 0) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  }
  let s = '';
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
  return { w: c.width, h: c.height, b64: btoa(s), ink: ink / (d.length / 4), clear: clear / (d.length / 4), colors: colors.size };
}, id);

/** Pause, seek and wait until the player has drawn that frame (two of its animation frames). */
async function pauseAt(target, id, t) {
  await target.evaluate(({ id, t }) => {
    const el = id ? document.getElementById(id) : document.querySelector('typoman-player');
    el.pause();
    el.currentTime = t;
  }, { id, t });
  await frames(target, 2);
}

/** Track currentTime every animation frame: max, whether it wrapped around. */
const watchTime = (target, id) => target.evaluate((id) => {
  const el = id ? document.getElementById(id) : document.querySelector('typoman-player');
  const key = id || '_';
  const w = (window.__qaWatch = window.__qaWatch || {})[key] = { start: el.currentTime, last: el.currentTime, max: el.currentTime, wrapped: false, samples: 0 };
  const tick = () => {
    const t = el.currentTime;
    if (t < w.last - 1e-6) w.wrapped = true;
    w.max = Math.max(w.max, t);
    w.last = t;
    w.samples++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, id);
const watched = (target, id) => target.evaluate((key) => window.__qaWatch[key], id || '_');

// ───────────────────────────── main ─────────────────────────────
await run(async (cleanup) => {
  const R = new Report('TYPOMAN embed tests');
  const app = await serve();
  cleanup(() => app.close());
  const host = await serve();
  cleanup(() => host.close());
  R.info(`app origin ${app.origin} (engine, player.js, embed.html) · host origin ${host.origin} (embedding pages)`);
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  cleanup(() => browser.close());
  const log = new ConsoleLog();
  const ctx = await browser.newContext({ viewport: { width: 1340, height: 800 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(INIT);

  // Reference renderer, scene code and standalone HTML come from the app origin.
  const harness = await openHarness(ctx, app, { log });
  const code = await harness.evaluate((s) => TM.Scene.encode(TM.Scene.normalize(s)), SCENE);
  await harness.evaluate(async (s) => {
    const scene = TM.Scene.normalize(s);
    await TM.prepare(scene);
    const clear = TM.Scene.normalize(Object.assign(TM.Scene.clone(scene), { bg: Object.assign({}, scene.bg, { type: 'transparent' }) }));
    window.__qaRef = (w, h, t, quality, transparent) => {
      const c = document.createElement('canvas');
      const r = new TM.Renderer(c, { quality: quality || 'full' });
      r.setScene(transparent ? clear : scene);
      r.resize(w, h);
      r.render(t);
      const d = c.getContext('2d').getImageData(0, 0, w, h).data;
      let out = '';
      for (let i = 0; i < d.length; i += 0x8000) out += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
      return btoa(out);
    };
  }, SCENE);
  const reference = async (w, h, t, quality, transparent) => new Uint8Array(Buffer.from(await harness.evaluate(({ w, h, t, quality, transparent }) => window.__qaRef(w, h, t, quality, transparent), { w, h, t, quality, transparent }), 'base64'));
  /** Compare what a player shows with render(t) at the player's own canvas size. */
  async function matches(label, target, id, t, { transparent = false } = {}) {
    const st = await playerState(target, id);
    const px = await playerPixels(target, id);
    const ref = await reference(px.w, px.h, t, st.quality, transparent);
    const d = diffStats(new Uint8Array(Buffer.from(px.b64, 'base64')), ref);
    R.check(`${label}: frame at t=${t} matches render(${t}) (${px.w}×${px.h})`, d.fraction <= MAX_DIFF_FRACTION && d.maxDiff <= MAX_LEVEL_DIFF,
      `${d.differing} of ${d.pixels} px differ, max ${d.maxDiff} level(s)${st.quality !== 'full' ? `, player dropped to ${st.quality} quality` : ''}`);
    return px;
  }
  // Blank = background only (0% ink, one colour); this scene measures ~2.6% ink, ~90 colours.
  const rendersSomething = (label, px) => R.check(`${label}: canvas is not blank`, px.ink > 0.005 && px.colors > 10, `${(px.ink * 100).toFixed(1)}% ink, ${px.colors} colours sampled`);
  const noErrors = (label, mark) => { const e = log.since(mark); R.check(`${label}: no console errors`, e.length === 0, e.slice(0, 4).join(' | ')); };

  // ── 1. iframe: embed.html on the app origin ──
  {
    R.section('iframe: embed.html#c=… on a foreign page');
    const mark = log.mark();
    host.routes['/iframe.html'] = `<!doctype html><html><head><meta charset="utf-8"><title>iframe host</title>
<style>body{margin:0;background:#ddd;display:flex;flex-wrap:wrap;gap:8px;width:${2 * W + 8}px} iframe{display:block;width:${W}px;height:${H}px;border:0}</style></head><body>
<iframe id="auto" src="${app.url(`/embed.html#c=${code}&autoplay=1&loop=1&controls=0`)}" title="autoplay"></iframe>
<iframe id="manual" src="${app.url(`/embed.html#c=${code}&autoplay=0&controls=1&start=${T_START}`)}" title="manual"></iframe>
<iframe id="clear" src="${app.url(`/embed.html#c=${code}&autoplay=0&bg=transparent&start=${T_START}`)}" title="transparent"></iframe>
<iframe id="broken" src="${app.url('/embed.html#c=zTHIS-IS-NOT-A-SCENE')}" title="damaged code"></iframe>
<script>
window.__msgs = [];
addEventListener('message', (e) => {
  if (!e.data || typeof e.data.typoman !== 'string') return;
  const from = ['auto', 'manual', 'clear', 'broken'].find((id) => document.getElementById(id).contentWindow === e.source) || '?';
  __msgs.push({ from, type: e.data.typoman, origin: e.origin, duration: e.data.duration, time: e.data.time });
});
window.__send = (id, msg) => document.getElementById(id).contentWindow.postMessage(msg, '*');
</script></body></html>`;
    const page = log.watch(await ctx.newPage(), 'iframe host');
    await page.goto(host.url('/iframe.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => ['auto', 'manual', 'clear'].every((id) => window.__msgs.some((m) => m.from === id && m.type === 'ready')) &&
      window.__msgs.some((m) => m.from === 'broken' && m.type === 'error'), null, { timeout: 30000 }).catch(() => {});
    const msgs = await page.evaluate(() => window.__msgs);
    const ready = msgs.filter((m) => m.type === 'ready');
    R.check('iframe: every valid player posts "ready" to the parent from the app origin', ready.length === 3 && ready.every((m) => m.origin === app.origin), ready.map((m) => `${m.from}@${m.origin}`).join(', '));
    R.check('iframe: "ready" carries the scene duration', ready.every((m) => Math.abs(m.duration - SCENE.duration) < 1e-9), ready.map((m) => m.duration).join(', '));
    const fAuto = await (await page.$('#auto')).contentFrame();
    const fManual = await (await page.$('#manual')).contentFrame();
    R.check('iframe: the embed runs cross-origin (out of the host document)', !!fAuto && new URL(fAuto.url()).origin === app.origin && app.origin !== host.origin, fAuto && fAuto.url().slice(0, 40));

    const a = await playerState(fAuto, 'player');
    R.check('iframe: canvas lives in the player\'s shadow root', a.shadowCanvas && !a.lightCanvas && a.canvas.w === W && a.canvas.h === H, JSON.stringify(a.canvas));
    rendersSomething('iframe autoplay', await playerPixels(fAuto, 'player'));
    R.check('iframe autoplay=1: playing, no play button', a.paused === false && !a.playButton, `paused ${a.paused}`);
    R.check('iframe controls=0: no controls', !a.controls);
    await watchTime(fAuto, 'player');
    await fAuto.waitForFunction(() => window.__qaWatch.player.wrapped, null, { timeout: WAIT }).catch(() => {});
    const wa = await watched(fAuto, 'player');
    R.check('iframe loop=1: time advances and wraps at the loop point', wa.wrapped && wa.max < SCENE.duration, `max t ${wa.max.toFixed(4)} s over ${wa.samples} frames, wrapped ${wa.wrapped}`);
    const evA = (await playerState(fAuto, 'player')).events;
    R.check('iframe loop=1: never "ended"', !evA.includes('ended'), evA.join(','));

    const m = await playerState(fManual, 'player');
    R.check('iframe autoplay=0: paused with a play button', m.paused === true && m.playButton && !m.events.includes('play'), m.events.join(','));
    R.check('iframe controls=1: controls shown', m.controls);
    R.check(`iframe start=${T_START}: currentTime starts there`, Math.abs(m.time - T_START) < 1e-9, `${m.time}`);
    await matches('iframe poster (start)', fManual, 'player', T_START);

    // bg=transparent: the host page shows through wherever there's no type.
    const fClear = await (await page.$('#clear')).contentFrame();
    const clearPx = await playerPixels(fClear, 'player');
    const pageBg = await fClear.evaluate(() => [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor]);
    R.check('iframe bg=transparent: the canvas is transparent around the type', clearPx.clear > 0.5 && clearPx.clear < 0.999, `${(clearPx.clear * 100).toFixed(1)}% fully transparent`);
    R.check('iframe bg=transparent: the embed page itself is transparent', pageBg.every((c) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent'), pageBg.join(', '));
    await matches('iframe bg=transparent', fClear, 'player', T_START, { transparent: true });

    // A damaged embed code: a friendly error in the player, "error" to the parent, nothing thrown.
    const fBroken = await (await page.$('#broken')).contentFrame();
    const b = await playerState(fBroken, 'player');
    R.check('iframe with a damaged code: shows the error panel and posts "error"', b.error && msgs.some((m) => m.from === 'broken' && m.type === 'error') && !msgs.some((m) => m.from === 'broken' && m.type === 'ready'),
      `error panel ${b.error ? 'shown' : 'missing'}, messages: ${msgs.filter((m) => m.from === 'broken').map((m) => m.type).join(',') || 'none'}`);

    // postMessage control from the host page.
    await page.evaluate(() => window.__send('auto', { typoman: 'pause' }));
    await page.waitForFunction(() => window.__msgs.some((m) => m.from === 'auto' && m.type === 'pause'), null, { timeout: 5000 }).catch(() => {});
    R.check('iframe postMessage pause: paused, and "pause" posted back', (await playerState(fAuto, 'player')).paused === true && (await page.evaluate(() => window.__msgs.some((m) => m.from === 'auto' && m.type === 'pause'))));
    await page.evaluate((t) => window.__send('auto', { typoman: 'seek', time: t }), T_SEEK);
    await fAuto.waitForFunction((t) => Math.abs(document.getElementById('player').currentTime - t) < 1e-9, T_SEEK, { timeout: 5000 }).catch(() => {});
    await frames(fAuto, 2);
    await matches('iframe postMessage seek', fAuto, 'player', T_SEEK);
    await page.evaluate(() => window.__send('auto', { typoman: 'play' }));
    await page.waitForFunction(() => window.__msgs.some((m) => m.from === 'auto' && m.type === 'play'), null, { timeout: 5000 }).catch(() => {});
    R.check('iframe postMessage play: playing again, and "play" posted back', (await playerState(fAuto, 'player')).paused === false && (await page.evaluate(() => window.__msgs.some((m) => m.from === 'auto' && m.type === 'play'))));
    // Make sure console capture reaches into the cross-origin frame, or "no errors" means nothing.
    const seen = page.waitForEvent('console', { predicate: (msg) => msg.text().includes('qa-probe'), timeout: 5000 }).then(() => true, () => false);
    await fAuto.evaluate(() => console.error('qa-probe: console capture works in the iframe'));
    const probe = (await seen) && log.errors.some((e) => e.includes('qa-probe'));
    log.errors = log.errors.filter((e) => !e.includes('qa-probe'));
    R.check('iframe: console errors inside the cross-origin frame are captured', probe);
    noErrors('iframe', mark);
    await page.close();
  }

  // ── 2. <typoman-player> web component, player.js from the app origin ──
  {
    R.section('<typoman-player> with player.js loaded cross-origin');
    const mark = log.mark();
    host.routes['/player.html'] = `<!doctype html><html><head><meta charset="utf-8"><title>player host</title>
<script src="${app.url('/player.js')}" defer></script>
<style>body{margin:0;background:#ddd} .row{display:flex;gap:8px;margin-bottom:8px} typoman-player{width:${W}px;height:${H}px} .spacer{height:3000px}</style></head><body>
<div class="row"><typoman-player id="loop" scene="${code}" autoplay loop controls></typoman-player><typoman-player id="once" scene="${code}" autoplay></typoman-player></div>
<div class="row"><typoman-player id="still" scene="${code}" start="${T_START}"></typoman-player><typoman-player id="poster" scene="${code}" poster="0.8" controls></typoman-player></div>
<div class="spacer"></div>
</body></html>`;
    const page = log.watch(await ctx.newPage(), 'player host');
    await page.goto(host.url('/player.html'), { waitUntil: 'load' });
    const ids = ['loop', 'once', 'still', 'poster'];
    await page.waitForFunction((ids) => ids.every((id) => window.__qaEvents.some((e) => e.id === id && e.type === 'ready')), ids, { timeout: 30000 });
    await watchTime(page, 'loop');
    const st = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await playerState(page, id)])));
    R.check('web component: player.js and the engine load from the app origin', app.requests.includes('/player.js') && app.requests.includes('/js/boot.js') && !host.requests.includes('/player.js'));
    R.check('web component: every canvas lives in its shadow root', ids.every((id) => st[id].shadowCanvas && !st[id].lightCanvas), ids.map((id) => `${id} ${JSON.stringify(st[id].canvas)}`).join(' '));
    R.check('web component: canvas backing matches the element (DPR 1)', ids.every((id) => st[id].canvas && st[id].canvas.w === W && st[id].canvas.h === H));
    rendersSomething('web component', await playerPixels(page, 'loop'));
    R.check('autoplay: playing, no play button', st.loop.paused === false && st.once.paused === false && !st.loop.playButton);
    R.check('no autoplay: paused with a play button, no "play" event', st.still.paused && st.still.playButton && !st.still.events.includes('play') && st.poster.paused);
    R.check('controls: shown only where the attribute is set', st.loop.controls && st.poster.controls && !st.once.controls && !st.still.controls,
      ids.map((id) => `${id}:${st[id].controls ? 'on' : 'off'}`).join(' '));
    R.check(`start=${T_START}: currentTime starts there`, Math.abs(st.still.time - T_START) < 1e-9, `${st.still.time}`);
    await matches(`start=${T_START} still`, page, 'still', T_START);
    await matches('poster=0.8 still', page, 'poster', 0.8);

    // autoplay without loop: plays once, fires "ended", holds the last frame.
    await page.waitForFunction(() => window.__qaEvents.some((e) => e.id === 'once' && e.type === 'ended'), null, { timeout: WAIT }).catch(() => {});
    const once = await playerState(page, 'once');
    R.check('autoplay without loop: "ended" fires, then paused with a play button', once.events.includes('ended') && once.paused && once.playButton, once.events.join(','));
    R.check('autoplay without loop: stops at the duration', Math.abs(once.time - SCENE.duration) < 1e-9, `${once.time}`);
    await matches('ended (holds the last frame)', page, 'once', SCENE.duration - 1 / SCENE.fps);

    // autoplay + loop: wraps, never ends.
    await page.waitForFunction(() => window.__qaWatch.loop.wrapped, null, { timeout: WAIT }).catch(() => {});
    const wl = await watched(page, 'loop');
    R.check('loop: time advances and wraps at the loop point', wl.wrapped && wl.max < SCENE.duration, `max t ${wl.max.toFixed(4)} s over ${wl.samples} frames`);
    R.check('loop: never "ended"', !(await playerState(page, 'loop')).events.includes('ended'));

    // Controls: the mini button pauses and resumes; the big button starts a paused player.
    const c1 = await tryClick(page.locator('#loop [part="controls"]'));
    const afterPause = await playerState(page, 'loop');
    R.check('controls button pauses (fires "pause")', c1 && afterPause.paused && afterPause.events.includes('pause'), c1 ? afterPause.events.join(',') : 'could not click the controls button');
    const c2 = await tryClick(page.locator('#loop [part="controls"]'));
    R.check('controls button resumes (fires "play")', c2 && (await playerState(page, 'loop')).paused === false);
    const c3 = await tryClick(page.locator('#still [part="play-button"]'));
    if (!c3) R.check('play button can be clicked', false);
    await watchTime(page, 'still');
    await page.waitForFunction(() => window.__qaWatch.still.max > window.__qaWatch.still.start + 0.1, null, { timeout: WAIT }).catch(() => {});
    const still = await playerState(page, 'still');
    R.check('play button starts a paused player (fires "play", time advances)', !still.paused && still.events.includes('play') && (await watched(page, 'still')).max > T_START + 0.1, `t ${still.time.toFixed(3)}`);

    // Pause + seek through the API, then compare with the studio renderer.
    await pauseAt(page, 'loop', T_SEEK);
    await matches('web component pause + seek', page, 'loop', T_SEEK);
    await pauseAt(page, 'still', 0);
    await matches('web component seek to 0', page, 'still', 0);

    // Offscreen players stop rendering; back on screen they resume.
    await page.evaluate(() => document.getElementById('loop').play());
    await page.evaluate(() => window.scrollTo(0, 2500));
    // Wait for the IntersectionObserver to report the player hidden, then one more frame.
    await page.waitForFunction(() => document.getElementById('loop')._visible === false, null, { timeout: WAIT }).catch(() => {});
    await frames(page, 1);
    const r0 = await page.evaluate(() => ({ t: document.getElementById('loop').currentTime, n: document.getElementById('loop')._renderer.stats.renders }));
    await frames(page, 20);
    const r1 = await page.evaluate(() => ({ t: document.getElementById('loop').currentTime, n: document.getElementById('loop')._renderer.stats.renders }));
    R.check('offscreen: a playing player stops rendering and its clock stops', r1.n === r0.n && r1.t === r0.t, `${r1.n - r0.n} renders and ${(r1.t - r0.t).toFixed(3)} s over 20 frames`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction((n) => document.getElementById('loop')._renderer.stats.renders > n + 5, r1.n, { timeout: 5000 }).catch(() => {});
    const r2 = await page.evaluate(() => document.getElementById('loop')._renderer.stats.renders);
    R.check('offscreen: resumes when scrolled back', r2 > r1.n + 5, `${r2 - r1.n} renders`);
    noErrors('web component', mark);
    await page.close();

    // Reduced motion: autoplay is suppressed; the still shows with a play button.
    const rmMark = log.mark();
    const rmCtx = await browser.newContext({ viewport: { width: 1340, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await rmCtx.addInitScript(INIT);
    const rm = log.watch(await rmCtx.newPage(), 'reduced motion');
    await rm.goto(host.url('/player.html'), { waitUntil: 'load' });
    await rm.waitForFunction(() => window.__qaEvents.some((e) => e.id === 'loop' && e.type === 'ready'), null, { timeout: 30000 });
    await frames(rm, 10);
    const rs = await playerState(rm, 'loop');
    R.check('prefers-reduced-motion: autoplay stays paused on a still with a play button', rs.paused && rs.playButton && !rs.events.includes('play'), rs.events.join(','));
    noErrors('reduced motion', rmMark);
    await rmCtx.close();
  }

  // ── 3. Standalone HTML from the export API ──
  {
    R.section('standalone HTML (TM.Export.buildStandalone)');
    const sa = await harness.evaluate(async (s) => {
      const r = await TM.Export.buildStandalone(TM.Scene.normalize(s), { autoplay: true, loop: true, controls: true });
      return { html: r.html, files: r.files, name: r.name, bytes: r.blob.size };
    }, SCENE);
    R.info(`${sa.name}: ${(sa.bytes / 1024).toFixed(0)} KB, inlines ${sa.files.length} files: ${sa.files.join(', ')}`);
    R.check('standalone: inlines the engine, the scene\'s presets and player.js only', sa.files.includes('player.js') && sa.files.includes('js/presets/wave.js') && sa.files.includes('js/presets/rise.js') && !sa.files.includes('js/presets/stack.js'));
    host.routes['/standalone.html'] = sa.html;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typoman-embed-'));
    cleanup(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, sa.name);
    fs.writeFileSync(file, sa.html);
    for (const [label, url] of [['standalone (http, host origin)', host.url('/standalone.html')], ['standalone (file://)', pathToFileURL(file).href]]) {
      const mark = log.mark();
      const appBefore = app.requests.length, hostBefore = host.requests.length;
      const sctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      await sctx.addInitScript(INIT);
      const page = log.watch(await sctx.newPage(), label);
      const nonFont = [];
      page.on('request', (r) => { const u = r.url(); if (!/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u) && u !== url && !u.startsWith('data:')) nonFont.push(u); });
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__qaEvents.some((e) => e.type === 'ready'), null, { timeout: 30000 });
      const s = await playerState(page, null);
      R.check(`${label}: player ready, canvas in its shadow root`, s.shadowCanvas && !s.lightCanvas, JSON.stringify(s.canvas));
      R.check(`${label}: self-contained (no requests but the page and Google Fonts)`, nonFont.filter((u) => !/favicon/.test(u)).length === 0 && app.requests.length === appBefore && host.requests.slice(hostBefore).every((p) => p === '/standalone.html' || p === '/favicon.ico'),
        nonFont.slice(0, 3).join(', '));
      rendersSomething(label, await playerPixels(page, null));
      R.check(`${label}: autoplay, controls shown`, s.paused === false && s.controls && !s.playButton);
      await watchTime(page, null);
      await page.waitForFunction(() => window.__qaWatch._.wrapped, null, { timeout: WAIT }).catch(() => {});
      const w = await watched(page, null);
      R.check(`${label}: loops`, w.wrapped && w.max < SCENE.duration, `max t ${w.max.toFixed(4)} s`);
      await pauseAt(page, null, T_SEEK);
      await matches(label, page, null, T_SEEK);
      noErrors(label, mark);
      await sctx.close();
    }
  }

  const errs = log.since();
  R.check('no console errors anywhere', errs.length === 0, errs.slice(0, 5).join(' | '));
  R.finish();
});
