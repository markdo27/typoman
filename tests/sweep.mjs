#!/usr/bin/env node
/* TYPOMAN option sweep: every preset × (defaults, every curated look, every non-default value of
 * every select param, every toggle flipped), rendered small in headless Chromium. Also the
 * params that decide whether a loop closes (whole cycles / turns / beats per loop at both ends,
 * Hz and per-second rates at both ends and in between) and a 2.7 s loop length.
 *
 * Each configuration must
 *   - render without throwing (scene build, applyLook, renderer warnings, console errors),
 *   - be deterministic: the same t gives the same pixels on a fresh renderer, and again on a
 *     renderer that has drawn the rest of the loop since (no state carried between frames),
 *   - loop seamlessly: the jump from the last frame to the first, measured like smoke.mjs
 *     (mean RGB difference, % of full scale), must not exceed SEAM_RATIO × the largest ordinary
 *     frame-to-frame step. A cheap screen samples SAMPLES steps plus the two next to the seam;
 *     anything suspicious is re-measured against every step of the loop before it can fail, so
 *     cut-based presets (Strobe Cut, Split Flap) don't false-alarm. "In → Hold" timing pops at
 *     the loop by design and is exempt.
 *
 *   npm run test:sweep
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/sweep.mjs [preset-id …]
 */
import { loadChromium, serve, openHarness, ConsoleLog, Report, run } from './lib/harness.mjs';

const W = 240, H = 135; // render size: small keeps ~300 configurations fast
const SAMPLES = 8; // ordinary steps sampled across the loop in the screen
const SCREEN_RATIO = 1.5; // above this (and SEAM_MIN), re-measure against every step of the loop
const SEAM_RATIO = 2; // fail: seam > SEAM_RATIO × largest ordinary step (Round 2 Stack cascade: 13.7×)
const SEAM_MIN = 0.3; // % of full scale: smaller jumps are invisible whatever the ratio
const T_DET = 0.37; // determinism probe, as a fraction of the loop

const only = process.argv.slice(2);

// Runs in the page. One preset's configurations, measured; returns plain rows.
async function sweepPreset({ id, W, H, SAMPLES, SCREEN_RATIO, SEAM_MIN, T_DET }) {
  const P = TM.getPreset(id);
  const base = () => {
    const s = TM.Scene.defaults();
    s.layers[0].preset = id;
    s.layers[0].params = TM.presetDefaults(id);
    return s;
  };
  const configs = [
    { variant: 'defaults', make: () => TM.Scene.normalize(base()) },
    // A loop length that isn't a whole second (the inspector's slider steps by 0.1 s): anything
    // timed in absolute units (per second, Hz) must still close the loop.
    { variant: 'loop length 2.7 s', make: () => { const s = base(); s.duration = 2.7; return TM.Scene.normalize(s); } },
  ];
  (P.looks || []).forEach((look) => configs.push({ variant: `look "${look.name}"`, make: () => TM.Scene.applyLook(TM.Scene.normalize(base()), 0, look) }));
  for (const p of P.params) {
    const set = (v) => () => { const s = base(); s.layers[0].params[p.key] = v; return TM.Scene.normalize(s); };
    if (p.type === 'select') for (const [v] of p.options) { if (v !== p.default) configs.push({ variant: `${p.key}=${v}`, make: set(v), key: p.key, value: v }); }
    else if (p.type === 'toggle') configs.push({ variant: `${p.key}=${!p.default}`, make: set(!p.default), key: p.key, value: !p.default });
    else if (p.type === 'range') {
      // The ranges that decide whether a loop closes: whole counts per loop (cycles, turns, laps,
      // beats…) at both ends, and rates in absolute time (Hz, per second) at both ends plus an
      // awkward value in between, snapped to the step the way TM.Scene.normalize snaps it.
      const text = `${p.key} ${p.label} ${p.hint || ''}`;
      const whole = p.step >= 1 && /cycle|turn|lap|loop|pass|beat|blink|burst|ring|repeat|scroll|flow|speed|spin/i.test(text);
      const rate = /\bhz\b|\/s\)|per second/i.test(text);
      if (!whole && !rate) continue;
      const dp = String(p.step).includes('.') ? String(p.step).split('.')[1].length : 0;
      const snap = (x) => +(Math.round((x - p.min) / p.step) * p.step + p.min).toFixed(dp);
      const vals = new Set([p.min, p.max]);
      if (rate) { let v = snap(p.min + 0.61 * (p.max - p.min)); if (v === p.default) v = snap(v + p.step); vals.add(v); }
      vals.delete(p.default);
      for (const v of vals) configs.push({ variant: `${p.key}=${v}`, make: set(v), key: p.key, value: v });
    }
  }
  // smoke.mjs's metric: mean |ΔR|+|ΔG|+|ΔB| as % of the maximum difference.
  const diff = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    return (s / ((a.length / 4) * 765)) * 100;
  };
  const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > m) m = d; } return m; };
  const renderer = (scene) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', { alpha: true, willReadFrequently: true }); // the renderer reuses this context
    const r = new TM.Renderer(c, { quality: 'full' });
    r.setScene(scene);
    r.resize(W, H);
    return { r, px: (t) => { r.render(t); return ctx.getImageData(0, 0, W, H).data; } };
  };

  const rows = [];
  for (const cfg of configs) {
    const row = { variant: cfg.variant, errors: [] };
    const t0 = performance.now();
    let scene;
    try { scene = cfg.make(); } catch (e) { row.errors.push('scene build threw: ' + e.message); rows.push(row); continue; }
    const L = scene.layers[0];
    if (cfg.key && L.params[cfg.key] !== cfg.value) row.errors.push(`normalize dropped ${cfg.key}=${cfg.value}`);
    row.exempt = L.params.timing === 'in' ? 'In → Hold timing' : L.time && L.time.mode === 'once' ? 'plays once' : null;
    await TM.prepare(scene);
    const dur = scene.duration, dt = 1 / scene.fps, tDet = T_DET * dur;
    try {
      const A = renderer(scene);
      const det0 = A.px(tDet);
      // Screen: the seam, the steps either side of it, and SAMPLES ordinary steps.
      const last = A.px(dur - dt), first = A.px(0);
      const seam = diff(last, first);
      const steps = [diff(A.px(dur - 2 * dt), last), diff(first, A.px(dt))];
      for (let k = 0; k < SAMPLES; k++) { const t = ((k + 0.5) / SAMPLES) * dur; steps.push(diff(A.px(t), A.px(t + dt))); }
      const maxStep = Math.max(...steps);
      Object.assign(row, { seam, maxStep, ratio: seam / Math.max(maxStep, 0.02), dense: null });
      // Suspicious: measure every frame-to-frame step of the loop.
      if (!row.exempt && seam > SEAM_MIN && row.ratio > SCREEN_RATIO) {
        const n = Math.round(dur * scene.fps);
        let prev = A.px(0), max = 0, at = -1;
        for (let k = 1; k < n; k++) { const cur = A.px(k * dt); const d = diff(prev, cur); if (d > max) { max = d; at = k - 1; } prev = cur; }
        row.dense = { frames: n, maxStep: max, at, ratio: seam / Math.max(max, 0.02) };
      }
      // Determinism: same t, same pixels, on this (well-used) renderer and on a fresh one.
      const det1 = A.px(tDet);
      const det2 = renderer(scene).px(tDet);
      row.detReuse = maxDiff(det0, det1);
      row.detFresh = maxDiff(det0, det2);
      if (A.r._warned) row.errors.push('render threw (see console)');
    } catch (e) {
      row.errors.push('render threw: ' + e.message);
    }
    row.ms = performance.now() - t0;
    rows.push(row);
  }
  return { id, looks: (P.looks || []).length, rows };
}

await run(async (cleanup) => {
  const R = new Report('TYPOMAN option sweep');
  const server = await serve();
  cleanup(() => server.close());
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  cleanup(() => browser.close());
  const log = new ConsoleLog();
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const page = await openHarness(context, server, { log });
  const ids = await page.evaluate(() => TM.presetOrder.slice());
  const unknown = only.filter((id) => !ids.includes(id));
  if (unknown.length) R.check('requested presets exist', false, unknown.join(', '));
  const todo = only.length ? ids.filter((id) => only.includes(id)) : ids;
  R.info(`Chromium ${browser.version()} · ${todo.length} presets · ${W}×${H} · seam fails above ${SEAM_RATIO}× the largest ordinary step and ${SEAM_MIN}%`);

  const pad = (s, n) => String(s).padEnd(n);
  const fx = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  console.log('\n' + pad('preset', 14) + pad('configs', 9) + pad('looks', 7) + pad('worst seam×', 13) + pad('worst at', 34) + pad('determ.', 9) + pad('errors', 8) + 'ms');
  const problems = [], notes = [], exempt = [];
  let total = 0;
  for (const id of todo) {
    const mark = log.mark();
    const res = await page.evaluate(sweepPreset, { id, W, H, SAMPLES, SCREEN_RATIO, SEAM_MIN, T_DET });
    total += res.rows.length;
    const ratioOf = (r) => (r.exempt || r.ratio == null ? -1 : r.dense ? r.dense.ratio : r.ratio);
    const worst = res.rows.reduce((a, r) => (ratioOf(r) > ratioOf(a) ? r : a), res.rows[0]);
    let detBad = 0, errCount = 0;
    for (const r of res.rows) {
      const name = `${id} ${r.variant}`;
      if (r.exempt) exempt.push(`${name} (${r.exempt})`);
      if (r.errors.length) { errCount++; problems.push(`${name}: ${r.errors.join('; ')}`); }
      if (r.detFresh > 0 || r.detReuse > 0) {
        detBad++;
        problems.push(`${name}: not deterministic: render(${T_DET} × duration) differs by up to ${r.detReuse} levels after the renderer drew the loop, and by ${r.detFresh} on a fresh renderer`);
      }
      if (!r.exempt && r.dense && r.seam > SEAM_MIN && r.dense.ratio > SEAM_RATIO) {
        problems.push(`${name}: loop seam pops: last→first frame jump ${fx(r.seam)}% is ${fx(r.dense.ratio)}× the largest ordinary step (${fx(r.dense.maxStep)}% at frame ${r.dense.at} of ${r.dense.frames})`);
      } else if (!r.exempt && r.dense) {
        notes.push(`${name}: screen flagged ${fx(r.ratio)}×, but the seam is ${fx(r.dense.ratio)}× the largest of all ${r.dense.frames - 1} ordinary steps: fine`);
      }
    }
    const errs = log.since(mark);
    if (errs.length) problems.push(`${id}: ${errs.length} console error(s): ${errs.slice(0, 3).join(' | ')}`);
    const ms = res.rows.reduce((a, r) => a + (r.ms || 0), 0);
    console.log(pad(id, 14) + pad(res.rows.length, 9) + pad(res.looks, 7) + pad(fx(ratioOf(worst)) + (worst.dense ? ' (all)' : ''), 13) + pad(worst.variant.slice(0, 32), 34) +
      pad(detBad ? `NO ×${detBad}` : 'yes', 9) + pad(errCount + errs.length || 'none', 8) + Math.round(ms));
  }
  if (notes.length) { R.section('Re-measured against every step (not failures)'); notes.forEach((n) => R.info(n)); }
  R.section('Verdict');
  R.info(`${total} configurations over ${todo.length} presets; ${exempt.length} exempt from the seam check because they pop at the loop by design: ${exempt.join(', ') || 'none'}`);
  R.check('every configuration renders, is deterministic and loops seamlessly', problems.length === 0, problems.length ? `${problems.length} problem(s)` : '');
  for (const p of problems) R.check(p, false);
  const errs = log.since();
  R.check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  R.finish();
});
