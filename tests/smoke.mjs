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

  // Regression: multi-line text keeps its font when a preset save()/restore()s the context
  // (Rise masks each line). Both lines' ink bands must be about the same height.
  const lineBands = (() => {
    const s = sceneFor('rise', (l) => { l.text = 'ONE\nTWO'; });
    const c = document.createElement('canvas');
    const r = new TM.Renderer(c);
    r.setScene(s);
    r.resize(960, 540);
    r.render(s.duration * 0.55);
    const d = c.getContext('2d').getImageData(0, 0, 960, 540).data;
    const bands = [];
    let start = -1;
    for (let y = 0; y <= 540; y++) {
      let on = false;
      if (y < 540) for (let x = 0; x < 960 && !on; x += 2) { const i = (y * 960 + x) * 4; on = d[i] > 200 && d[i + 1] > 200; }
      if (on && start < 0) start = y;
      if (!on && start >= 0) { bands.push(y - start); start = -1; }
    }
    return bands;
  })();

  // Layer timing: a delay shifts the loop; 'once' plays a single pass and holds its end.
  const timing = (() => {
    const hashAt = (sc, t) => { const d = pixels(sc, t).data; let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0; return h; };
    const plain = sceneFor('rise');
    const delayed = sceneFor('rise', (l) => { l.time = { delay: 1, cycles: 1, mode: 'loop' }; });
    const once = sceneFor('rise', (l) => { l.time = { delay: 0.5, cycles: 1, mode: 'once' }; });
    const looked = TM.Scene.applyLook(plain, 0, { name: 'x', bg: { color: '#111111' }, layer: { font: { family: 'Fraunces' }, params: { tilt: 20 } } });
    return {
      delayShifts: hashAt(delayed, 2.2) === hashAt(plain, 1.2),
      onceHolds: hashAt(once, plain.duration * 3) === hashAt(once, plain.duration * 5),
      onceWaits: hashAt(once, 0.2) === hashAt(once, 0.4),
      lookApplies: looked.bg.color === '#111111' && looked.layers[0].font.family === 'Fraunces' && looked.layers[0].params.tilt === 20 && looked.layers[0].text === plain.layers[0].text,
      // Stagger distribution: a curve or jitter changes when letters start; a custom spring
      // survives normalisation and settles at 1.
      spread: (() => {
        const t = plain.duration * 0.15;
        const curved = sceneFor('rise', (l) => { l.params.staggerCurve = 'inCubic'; });
        const jittered = sceneFor('rise', (l) => { l.params.jitter = 0.6; });
        const sprung = sceneFor('rise', (l) => { l.params.easeIn = 'spring(300,6)'; });
        const sp = TM.ease('spring(300,6)');
        return hashAt(curved, t) !== hashAt(plain, t) && hashAt(jittered, t) !== hashAt(plain, t) &&
          curved.layers[0].params.staggerCurve === 'inCubic' && sprung.layers[0].params.easeIn === 'spring(300,6)' &&
          Math.abs(sp(0.999) - 1) < 0.01 && TM.getPreset('typewriter').params.every((q) => q.key !== 'jitter');
      })(),
      // The same look over two different prior states gives the same style (no inherited blur,
      // glow or extrude), and a hand-drawn path survives it.
      lookReproducible: (() => {
        const look = { name: 'x', bg: { color: '#202020' }, layer: { font: { family: 'Fraunces' }, params: { speed: 2 } } };
        const messy = sceneFor('path-flow', (l) => { l.fx.blur = 0.4; l.fx.glow.amount = 0.4; l.fx.extrude.depth = 0.5; l.stroke.mode = 'outline'; l.params.speed = 3; });
        const a = TM.Scene.applyLook(sceneFor('path-flow'), 0, look).layers[0], b = TM.Scene.applyLook(messy, 0, look).layers[0];
        const same = JSON.stringify([a.fx, a.stroke, a.params]) === JSON.stringify([b.fx, b.stroke, b.params]);
        const drawn = sceneFor('path-flow', (l) => { l.path = TM.Path.fromPoints([{ x: 0.1, y: 0.5 }, { x: 0.4, y: 0.2 }, { x: 0.9, y: 0.6 }], false); });
        const kept = TM.Scene.applyLook(drawn, 0, Object.assign({}, look, { layer: Object.assign({}, look.layer, { path: 'circle' }) })).layers[0].path;
        return same && !kept.preset && kept.nodes.length === drawn.layers[0].path.nodes.length;
      })(),
    };
  })();

  // Variable axes: width swaps in the typeface's own narrow/wide designs, optical size is pinned
  // so every render size draws the same letterforms, and Stack's rows stay inside the margins.
  const axes = await (async () => {
    const inkW = (scene, Wd, Hd, t) => {
      const c = document.createElement('canvas');
      const r = new TM.Renderer(c, { quality: 'full' });
      r.setScene(scene);
      r.resize(Wd, Hd);
      r.render(t);
      const d = c.getContext('2d').getImageData(0, 0, Wd, Hd).data;
      let x0 = Wd, x1 = -1;
      for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) { const i = (y * Wd + x) * 4; if (d[i] > 200 && d[i + 1] > 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; } }
      return x1 < 0 ? 0 : x1 - x0 + 1;
    };
    const rise = (font) => sceneFor('rise', (l) => { l.text = 'Hamburg'; l.font = font; l.fill = { type: 'solid', color: '#ffffff' }; });
    const narrow = rise({ family: 'Roboto Flex', weight: 700, width: 40 });
    const wide = rise({ family: 'Roboto Flex', weight: 700, width: 140 });
    const serif = rise({ family: 'Fraunces', weight: 400 });
    const stack = sceneFor('stack', (l) => { l.font = { family: 'Science Gothic', weight: 700 }; l.fill = { type: 'solid', color: '#ffffff' }; });
    await Promise.all([narrow, wide, serif, stack].map((sc) => TM.prepare(sc)));
    const t = narrow.duration * 0.5;
    const wN = inkW(narrow, 960, 540, t), wW = inkW(wide, 960, 540, t);
    // The family the renderer draws Fraunces (opsz axis) with must keep the same width per px at
    // any device size; the browser's auto opsz shifts it by ~5.5% between 81 and 162 px. Hinted
    // text (Linux CI) rounds small-size advances by ~0.4%, so the limit sits between the two.
    const fam = TM.Renderer.familyFor(serif.layers[0], serif);
    const mctx = document.createElement('canvas').getContext('2d');
    if ('textRendering' in mctx) mctx.textRendering = 'geometricPrecision';
    const perPx = [40, 81, 162, 324].map((px) => { mctx.font = TM.fonts.fontString(fam, 400, px); return mctx.measureText('Hamburg').width / px; });
    const opszRatio = fam !== 'Fraunces' && document.fonts.check(TM.fonts.fontString(fam, 400, 64)) ? Math.max(...perPx) / Math.min(...perPx) : 0;
    const availW = 960 - 2 * stack.layers[0].params.margin * 540;
    let widest = 0;
    for (const u of [0.1, 0.35, 0.6, 0.85]) widest = Math.max(widest, inkW(stack, 960, 540, stack.duration * u));
    return { widthOk: wN > 0 && wW > wN * 1.5, opszRatio, stackInside: widest > 0 && widest <= availW + 2, widest, availW };
  })();

  // Kerning: glyphs drawn one by one at their layout positions must match the line drawn as one
  // native run (kern pairs AV, To, WA, LT). Round 2 found every kern applied one pair late.
  const kerning = await (async () => {
    const out = {};
    // Kerned pairs, plus ligatures (Playfair's ffi, fl): per-cluster drawing must match a run.
    for (const [family, text] of [['Inter Tight', 'AVATAR To WAVY LT'], ['Playfair Display', 'AVATAR To WAVY LT'], ['Playfair Display', 'office fluffy staff']]) {
      await TM.fonts.ensure(family, 700, text);
      const L = TM.text.layout({ text, family, weight: 700, sizePx: 120, tracking: 0, leading: 1, align: 'left', case: 'none' });
      const Wd = Math.ceil(L.width) + 40, Hd = 180;
      // Kerning 'normal' as the renderer draws (it also kerns across word spaces, unlike 'auto').
      const draw = (fn) => { const c = document.createElement('canvas'); c.width = Wd; c.height = Hd; const g = c.getContext('2d'); g.font = L.font; g.fontKerning = 'normal'; g.fillStyle = '#fff'; fn(g); return g.getImageData(0, 0, Wd, Hd).data; };
      const x0 = 20 - L.lines[0].x;
      const glyphs = draw((g) => L.glyphs.forEach((gl) => { if (!gl.isSpace) g.fillText(gl.ch, x0 + gl.x, 140); }));
      const native = draw((g) => g.fillText(L.lines[0].text, 20, 140));
      let diff = 0, ink = 0;
      for (let i = 3; i < glyphs.length; i += 4) { diff += Math.abs(glyphs[i] - native[i]); ink += native[i]; }
      out[family + (text.startsWith('office') ? ' ligatures' : '')] = ink ? diff / ink : 1;
    }
    return out;
  })();

  // True italics and drawn obliques: an italic instance loads and differs from upright; a
  // forward slant goes onto Roboto Flex's slnt axis (10° of it) and only the rest is skewed.
  const styles = await (async () => {
    const it = TM.fonts.resolve({ family: 'Playfair Display', weight: 400, italic: true }, 100);
    const loads = await TM.fonts.ensure(it, 400, 'Italic');
    const c = document.createElement('canvas'); c.width = 400; c.height = 120; const g = c.getContext('2d');
    const sig = (fam) => { g.clearRect(0, 0, 400, 120); g.font = TM.fonts.fontString(fam, 400, 80); g.fillText('Italic', 8, 90); const d = g.getImageData(0, 0, 400, 120).data; let h = 0; for (let i = 3; i < d.length; i += 4) h = (h * 31 + d[i]) | 0; return h; };
    const sl = sceneFor('rise', (l) => { l.font.family = 'Roboto Flex'; l.type.slant = 14; });
    const tl = TM.Renderer.typeset(sl.layers[0], sl);
    return {
      italic: loads && sig(it) !== sig('Playfair Display') && TM.fonts.resolve({ family: 'Anton', italic: true }, 100) === 'Anton',
      slnt: tl.font.autoSlnt === 10 && tl.font.axes.slnt === -10 && /slnt-10/.test(tl.font.family),
    };
  })();

  // Every catalogue family must load: a bad axis declaration makes Google answer 400 and the
  // font silently falls back to a generic face (Round 2: Big Shoulders Display).
  const fontLoads = await (async () => {
    const failed = [];
    await Promise.all(TM.FONTS.filter((f) => !f.custom).map(async (f) => {
      const css = await fetch(TM.fonts.cssUrl([f.family])).then((r) => r.ok, () => false);
      const ok = css && (await TM.fonts.ensure(TM.fonts.resolve({ family: f.family, weight: 400 }, 120), 400));
      if (!ok) failed.push(f.family);
    }));
    return { total: TM.FONTS.filter((f) => !f.custom).length, failed };
  })();

  // Photosensitivity check (WCAG 2.3.1): a full-frame 2 Hz strobe passes, 4 Hz fails, a tiny
  // flashing spot passes, and a bar sweeping 5 times a second is 5 flashes, not one per frame.
  const safety = await (async () => {
    TM.registerPreset({ id: 'smoke-strobe', params: [TM.P.range('hz', 'hz', 0, 30, 0.5, 2), TM.P.range('area', 'area', 0, 1, 0.01, 1), TM.P.range('sweeps', 'sweeps', 0, 20, 1, 0)], render(f) {
      f.identity(); f.ctx.fillStyle = '#ffffff';
      if (f.params.sweeps) { const x = ((f.p * f.params.sweeps) % 1) * f.W * 1.2 - f.W * 0.1; f.ctx.fillRect(x - f.W * 0.05, 0, f.W * 0.1, f.H); return; }
      if (Math.floor(f.t * f.params.hz * 2 + 1e-6) % 2) return;
      const a = Math.sqrt(f.params.area); f.ctx.fillRect((f.W * (1 - a)) / 2, (f.H * (1 - a)) / 2, f.W * a, f.H * a);
    } });
    const check = async (params) => {
      const s = TM.Scene.defaults(); s.duration = 4; s.bg = { type: 'solid', color: '#000000' };
      s.layers[0].preset = 'smoke-strobe'; s.layers[0].params = Object.assign(TM.presetDefaults('smoke-strobe'), params);
      return TM.Safety.flashes(TM.Scene.normalize(s));
    };
    const [hz2, hz4, spot, bar, plain] = [await check({ hz: 2 }), await check({ hz: 4 }), await check({ hz: 6, area: 0.01 }), await check({ sweeps: 20 }), await TM.Safety.flashes(sceneFor('rise'))];
    delete TM.presets['smoke-strobe']; TM.presetOrder.splice(TM.presetOrder.indexOf('smoke-strobe'), 1);
    return { ok: hz2.ok && hz2.flashes === 2 && !hz4.ok && hz4.flashes === 4 && spot.ok && bar.flashes === 5 && plain.ok, hz2: hz2.flashes, hz4: hz4.flashes, bar: bar.flashes };
  })();

  // Starter templates: every one builds a valid multi-layer scene that renders the same twice,
  // stays under the flash limit, and takes the user's text in its headline.
  const templates = await (async () => {
    const bad = [];
    for (const t of TM.Templates.list()) {
      const s = TM.Templates.build(t.id);
      await TM.prepare(s, { timeout: 8000 });
      const same = JSON.stringify(TM.Scene.normalize(s)) === JSON.stringify(s);
      const c = document.createElement('canvas'); const r = new TM.Renderer(c, { quality: 'full' }); r.setScene(s); r.resize(320, Math.round((320 * s.size.h) / s.size.w));
      const hash = () => { r.render(s.duration * 0.45); const d = r.ctx.getImageData(0, 0, c.width, c.height).data; let h = 0, ink = 0; for (let i = 0; i < d.length; i += 4) { h = (h * 31 + d[i] + d[i + 1] * 3) | 0; ink += d[i]; } return [h, ink]; };
      const a = hash(), b = hash();
      const fl = await TM.Safety.flashes(s, { maxFrames: 240 });
      const withText = TM.Templates.build(t.id, { text: 'HELLO' });
      const headline = withText.layers.some((l) => l.text === 'HELLO');
      if (!same || a[0] !== b[0] || !fl.ok || !headline || s.layers.length < 2) bad.push(`${t.id}${!same ? ' (not normalised)' : ''}${a[0] !== b[0] ? ' (not deterministic)' : ''}${!fl.ok ? ' (flashes ' + fl.flashes + '/s)' : ''}${!headline ? ' (no headline)' : ''}`);
    }
    return { count: TM.Templates.list().length, bad };
  })();

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
  return { presets: out, fuzzOk, roundTrip, lineBands, timing, axes, fontLoads, kerning, safety, styles, templates };
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
const lb = results.lineBands;
const linesOk = lb.length >= 2 && Math.min(lb[0], lb[1]) / Math.max(lb[0], lb[1]) > 0.6;
console.log(`multi-line font integrity: ${linesOk ? 'ok' : 'FAIL'} (line ink heights ${lb.slice(0, 2).join(' / ')} px)`);
if (!linesOk) fails.push('second line lost its font (font cache vs save/restore)');
const tmg = results.timing;
console.log(`layer timing: delay ${tmg.delayShifts ? 'ok' : 'FAIL'} · once/hold ${tmg.onceHolds && tmg.onceWaits ? 'ok' : 'FAIL'} · looks ${tmg.lookApplies ? 'ok' : 'FAIL'} · looks reproducible + keep drawn paths ${tmg.lookReproducible ? 'ok' : 'FAIL'} · stagger curve, jitter + springs ${tmg.spread ? 'ok' : 'FAIL'}`);
if (!tmg.spread) fails.push('stagger curve / jitter / custom spring broken');
if (!tmg.lookReproducible) fails.push('applyLook depends on prior state or replaced a drawn path');
if (!tmg.delayShifts || !tmg.onceHolds || !tmg.onceWaits) fails.push('layer timing semantics broken');
if (!tmg.lookApplies) fails.push('applyLook failed');
const kern = Object.entries(results.kerning);
const kernOk = kern.every(([, v]) => v < 0.03);
console.log(`kerning + ligatures (per-glyph vs native run): ${kernOk ? 'ok' : 'FAIL'} (${kern.map(([f, v]) => f + ' ' + (v * 100).toFixed(2) + '%').join(' · ')} of ink differs)`);
if (!kernOk) fails.push('per-glyph layout loses kerning');
const tp = results.templates;
console.log(`starter templates: ${tp.bad.length ? 'FAIL ' + tp.bad.join(', ') : 'ok'} (${tp.count} build, render deterministically, flash-safe, take the user's text)`);
if (tp.bad.length || tp.count < 6) fails.push('starter templates broken: ' + tp.bad.join(', '));
const st = results.styles;
console.log(`italics + obliques: true italic ${st.italic ? 'ok' : 'FAIL'} · slant onto slnt axis ${st.slnt ? 'ok' : 'FAIL'}`);
if (!st.italic || !st.slnt) fails.push('italic instances or slnt slant broken');
const sf = results.safety;
console.log(`photosensitivity check: ${sf.ok ? 'ok' : 'FAIL'} (2 Hz strobe ${sf.hz2}/s · 4 Hz ${sf.hz4}/s · fast bar ${sf.bar}/s)`);
if (!sf.ok) fails.push('flash detector miscounts (TM.Safety)');
const fl = results.fontLoads;
console.log(`catalogue fonts: ${fl.total - fl.failed.length}/${fl.total} load${fl.failed.length ? ' · FAILED: ' + fl.failed.join(', ') : ''}`);
if (fl.failed.length) fails.push(`fonts that never load: ${fl.failed.join(', ')}`);
const ax = results.axes;
const opszOk = ax.opszRatio > 0 && ax.opszRatio - 1 < 0.015;
console.log(`variable axes: width ${ax.widthOk ? 'ok' : 'FAIL'} · optical size pinned ${opszOk ? 'ok' : 'FAIL'} (width/px spread ${((ax.opszRatio - 1) * 100).toFixed(3)}% over 40–324 px) · stack inside margins ${ax.stackInside ? 'ok' : 'FAIL'} (${ax.widest} / ${Math.round(ax.availW)} px)`);
if (!ax.widthOk) fails.push('width axis does not change the letterforms');
if (!opszOk) fails.push('optical size depends on render resolution');
if (!ax.stackInside) fails.push('stack rows overflow the frame margins');
if (!results.roundTrip) fails.push('encode/decode round trip failed');
const errs = consoleErrors.filter((e) => !/favicon/.test(e));
if (errs.length) { console.log('\nconsole errors:\n  ' + errs.join('\n  ')); fails.push(`${errs.length} console error(s)`); }
if (fails.length) {
  console.log('\nFAILED:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log(`\nall ${results.presets.length} presets passed`);
