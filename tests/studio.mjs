#!/usr/bin/env node
/* TYPOMAN studio interaction tests: the flows a user takes in index.html, driven like a user
 * (clicks, typing, keys, drags, taps) and checked through the store (TM.Studio.store).
 *
 * Desktop 1440×900: boot, gallery search + pick, looks keep the text, Remix + undo/redo exact,
 * inspector controls (size, weight, colour, a select, an ease), every panel for every preset,
 * the path editor (drag a node), layers (add, reorder, hide, delete), timeline scrub, keyboard
 * shortcuts, the Export dialog (estimate + a draft WebM through the UI), the Embed & share
 * snippets (their scene decodes to the current one), a share-link round trip and autosave
 * across a reload. Phone 390×844 with touch: the same core flows by tap.
 *
 * Selectors prefer roles, labels and ids over styling classes, and copy is matched loosely.
 * Round 3 controls (templates, italic, ligatures, mattes, transform keys, springs, flash note) are checked too.
 *
 *   npm run test:studio
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/studio.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadChromium, serve, ConsoleLog, Report, run } from './lib/harness.mjs';

const WAIT = 10000; // ms for UI conditions (store updates, dialogs, downloads)

// Skip the first-run tour (it has its own team checks); everything else starts clean.
const INIT = () => { try { if (!localStorage.getItem('typoman.onboarded.v1')) localStorage.setItem('typoman.onboarded.v1', '1'); } catch (e) { /* blocked */ } };

/** Deep-equal with a tolerance for numbers (links round numbers to 4 decimals). */
const close = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-3
  : a && typeof a === 'object' ? !!b && typeof b === 'object' && Object.keys({ ...a, ...b }).every((k) => close(a[k], b[k])) : a === b);

async function boot(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.TM && TM.Studio && TM.Studio.store && document.body.classList.contains('ready'), null, { timeout: 30000 });
}
const S = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = WAIT) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
/** Give keyboard input to the document itself (not a field, not the artboard, which nudges). */
const focusBody = (page) => S(page, () => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
const scene = (page) => S(page, () => JSON.stringify(TM.Studio.store.scene));

await run(async (cleanup) => {
  const R = new Report('TYPOMAN studio interaction tests');
  const server = await serve();
  cleanup(() => server.close());
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  cleanup(() => browser.close());
  const log = new ConsoleLog();
  const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typoman-studio-'));
  cleanup(() => fs.rmSync(dlDir, { recursive: true, force: true }));
  const STUDIO = server.url('/index.html');

  // ═════════════════════════════ desktop ═════════════════════════════
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
  await ctx.addInitScript(INIT);
  const page = log.watch(await ctx.newPage(), 'desktop');

  R.section('boot');
  {
    const t0 = Date.now();
    await boot(page, STUDIO);
    R.info(`ready in ${Date.now() - t0} ms`);
    const st = await S(page, () => ({
      layers: TM.Studio.store.scene.layers.length,
      presets: TM.presetOrder.length,
      cards: document.querySelectorAll('#gallery [role="listbox"][aria-label="Presets"] [role="option"]').length,
      panels: [...document.querySelectorAll('#inspector [data-panel]')].map((s) => s.dataset.panel),
      failed: document.body.classList.contains('boot-failed'),
    }));
    R.check('boots to a ready studio (no boot error)', !st.failed && st.layers >= 1, `${st.layers} layer(s)`);
    R.check('the gallery lists every preset', st.cards === st.presets, `${st.cards} cards, ${st.presets} presets`);
    R.check('the inspector shows its panels', ['text', 'motion', 'color', 'fx', 'canvas'].every((p) => st.panels.includes(p)), st.panels.join(', '));
    // The stage draws: the canvas isn't one flat colour.
    await until(page, () => { const c = document.querySelector('#stageCanvas'); if (!c.width) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 4; i < d.length; i += 4 * 61) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 60) return true; return false; });
    R.check('the stage draws the scene', await S(page, () => { const c = document.querySelector('#stageCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 4; i < d.length; i += 4 * 61) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 60) n++; return n > 20; }));
    const errs = log.since();
    R.check('boot: no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  }

  R.section('gallery: search and pick a preset');
  {
    const search = page.getByRole('searchbox', { name: /search/i }).first();
    const cards = page.getByRole('listbox', { name: 'Presets' }).getByRole('option');
    const total = await cards.count();
    await search.fill('orbit');
    await until(page, (n) => document.querySelectorAll('#gallery [aria-label="Presets"] [role="option"]').length < n, total);
    const shown = await cards.count();
    const orbit = page.getByRole('listbox', { name: 'Presets' }).getByRole('option', { name: /^Orbit,/ });
    R.check('search narrows the cards and keeps the match', shown >= 1 && shown < total && (await orbit.count()) === 1, `${shown} of ${total}`);
    await orbit.click();
    R.check('picking a card sets the layer\'s preset', await until(page, () => TM.Studio.store.layer.preset === 'orbit'));
    R.check('…as one undo step named after it', await S(page, () => /Orbit/.test(TM.Studio.store.undoLabel)), await S(page, () => TM.Studio.store.undoLabel));
    await search.fill('');
    R.check('clearing the search brings every card back', await until(page, (n) => document.querySelectorAll('#gallery [aria-label="Presets"] [role="option"]').length === n, total));
  }

  R.section('looks keep the user\'s text');
  {
    const text = page.getByRole('textbox', { name: 'Content' });
    await text.fill('MY OWN WORDS');
    await until(page, () => TM.Studio.store.layer.text === 'MY OWN WORDS');
    const strip = page.getByRole('listbox', { name: /^Looks for/ });
    const n = await strip.getByRole('option').count();
    const want = await S(page, () => (TM.getPreset(TM.Studio.store.layer.preset).looks || []).map((l) => l.name));
    let kept = 0;
    for (let i = 0; i < n; i++) {
      await strip.getByRole('option').nth(i).click();
      const ok = await until(page, (name) => TM.Studio.store.undoLabel === 'Look: ' + name, want[i]);
      if (ok && (await S(page, () => TM.Studio.store.layer.text)) === 'MY OWN WORDS') kept++;
    }
    R.check('every look of the preset applies and keeps the text', n > 0 && kept === n, `${kept} of ${n} looks (${want.join(', ')})`);
  }

  R.section('Remix, then undo and redo restore each state exactly');
  {
    await focusBody(page);
    const states = [await scene(page)];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('r');
      await until(page, (prev) => JSON.stringify(TM.Studio.store.scene) !== prev, states[states.length - 1]);
      states.push(await scene(page));
    }
    R.check('R remixes the scene four times', new Set(states).size === 5 && /^Remix/.test(await S(page, () => TM.Studio.store.undoLabel)));
    let undoOk = 0, redoOk = 0;
    for (let i = 3; i >= 0; i--) { await page.keyboard.press('Control+z'); if ((await scene(page)) === states[i]) undoOk++; }
    for (let i = 1; i <= 4; i++) { await page.keyboard.press('Control+Shift+z'); if ((await scene(page)) === states[i]) redoOk++; }
    R.check('undo walks back through every remix exactly', undoOk === 4, `${undoOk}/4`);
    R.check('redo replays every remix exactly', redoOk === 4, `${redoOk}/4`);
    await page.getByRole('toolbar', { name: 'Project tools' }).getByRole('button', { name: /^Undo/ }).click();
    R.check('the Undo button does the same', (await scene(page)) === states[3]);
    // Back to the pre-remix scene, so the rest of the run doesn't depend on random rolls.
    for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z');
    R.check('…and back to the scene before any remix', (await scene(page)) === states[0]);
  }

  R.section('inspector controls change the scene');
  {
    // A preset with a select and an ease param: Rise (picked through the gallery).
    await page.getByRole('searchbox', { name: /search/i }).first().fill('');
    await page.getByRole('listbox', { name: 'Presets' }).getByRole('option', { name: /^Rise,/ }).click();
    await until(page, () => TM.Studio.store.layer.preset === 'rise');
    const textPanel = page.locator('#inspector [data-panel="text"]');
    await textPanel.getByRole('textbox', { name: 'Size value' }).fill('0.21');
    await textPanel.getByRole('textbox', { name: 'Size value' }).press('Enter');
    R.check('Size field sets type.size', await until(page, () => Math.abs(TM.Studio.store.layer.type.size - 0.21) < 1e-9), String(await S(page, () => TM.Studio.store.layer.type.size)));
    // Font picker → a variable family, then its Weight slider.
    await textPanel.getByRole('button', { name: /^Font:/ }).click();
    await page.getByRole('combobox', { name: 'Search fonts' }).fill('Inter Tight');
    await page.getByRole('combobox', { name: 'Search fonts' }).press('Enter');
    R.check('the font picker commits a family', await until(page, () => TM.Studio.store.layer.font.family === 'Inter Tight'), await S(page, () => TM.Studio.store.layer.font.family));
    const weight = textPanel.getByRole('textbox', { name: 'Weight value' });
    await weight.waitFor({ timeout: WAIT }).catch(() => {});
    await weight.fill('700');
    await weight.press('Enter');
    R.check('Weight field sets font.weight', await until(page, () => TM.Studio.store.layer.font.weight === 700), String(await S(page, () => TM.Studio.store.layer.font.weight)));
    // Solid fill first (a look may have left a palette or gradient, which hides the field).
    const colorPanel = page.locator('#inspector [data-panel="color"]');
    await colorPanel.getByRole('radiogroup', { name: 'Fill' }).getByRole('radio', { name: 'Solid' }).click();
    R.check('Fill → Solid sets fill.type', await until(page, () => TM.Studio.store.layer.fill.type === 'solid'));
    const colour = colorPanel.getByRole('textbox', { name: 'Colour hex value' }).first();
    await colour.fill('#ff3e6c');
    await colour.press('Enter');
    R.check('Colour hex sets fill.color', await until(page, () => TM.Studio.store.layer.fill.color === '#ff3e6c'), await S(page, () => TM.Studio.store.layer.fill.color));
    // A select param of the preset (Motion panel), mapped back to its key by label.
    const motion = page.locator('#inspector [data-panel="motion"]');
    const sel = motion.getByRole('combobox').first();
    const selInfo = await sel.evaluate((el) => {
      const p = TM.Studio.store.preset.params.find((x) => x.type === 'select' && x.label === el.getAttribute('aria-label'));
      return p && { key: p.key, cur: TM.Studio.store.layer.params[p.key], to: p.options.map((o) => o[0]).find((v) => v !== TM.Studio.store.layer.params[p.key]) };
    });
    if (selInfo) await sel.selectOption(selInfo.to);
    R.check('a select param changes layer.params', !!selInfo && await until(page, (s) => TM.Studio.store.layer.params[s.key] === s.to, selInfo), selInfo ? `${selInfo.key}: ${selInfo.cur} → ${selInfo.to}` : 'no select in the Motion panel');
    // An ease param (a named curve, not the auto-added stagger curve): open the curve editor and
    // pick another named curve.
    const easeIdx = await S(page, () => [...document.querySelectorAll('#inspector [data-panel="motion"] .ease-btn')].findIndex((el) => {
      const p = TM.Studio.store.preset.params.find((x) => x.type === 'ease' && x.label === el.getAttribute('aria-label').split(':')[0]);
      return p && p.key !== 'staggerCurve' && typeof TM.Studio.store.layer.params[p.key] === 'string'; // the stagger curve has its own editor
    }));
    const easeBtn = motion.getByRole('button', { name: /Open curve editor/ }).nth(Math.max(0, easeIdx));
    const easeKey = await easeBtn.evaluate((el) => {
      const p = TM.Studio.store.preset.params.find((x) => x.type === 'ease' && x.label === el.getAttribute('aria-label').split(':')[0]);
      return p ? p.key : null;
    });
    await easeBtn.click();
    const tile = page.getByRole('listbox', { name: 'Named curves' }).getByRole('option', { selected: false }).first();
    const to = await tile.getAttribute('data-id', { timeout: WAIT }).catch(() => null);
    if (to) await tile.click();
    R.check('an ease param takes a curve from the curve editor', easeIdx >= 0 && !!easeKey && !!to && await until(page, (a) => TM.Studio.store.layer.params[a.k] === a.to, { k: easeKey, to }), `${easeKey} → ${to}`);
    await page.keyboard.press('Escape');
  }

  R.section('every panel renders, for every preset');
  {
    const mark = log.mark();
    const res = await S(page, () => {
      const st = TM.Studio.store, bad = [];
      for (const id of TM.presetOrder) {
        st.setPreset(id);
        const P = TM.getPreset(id);
        const want = ['text', 'motion', 'color', 'fx', 'canvas'].concat(P.usesPath ? ['path'] : []);
        const secs = new Map([...document.querySelectorAll('#inspector [data-panel]')].map((s) => [s.dataset.panel, s]));
        const missing = want.filter((p) => !secs.has(p) || !secs.get(p).querySelector('input, select, textarea, button:not(.sec-head)'));
        const motionCtl = secs.has('motion') ? secs.get('motion').querySelectorAll('.ctl').length : 0;
        if (missing.length || motionCtl < P.params.length) bad.push(`${id}: ${missing.length ? 'missing ' + missing.join('/') : ''} motion ${motionCtl}/${P.params.length}`);
      }
      return { n: TM.presetOrder.length, bad };
    });
    const errs = log.since(mark);
    R.check('each preset builds all its panels and one control per param', res.bad.length === 0, res.bad.length ? res.bad.slice(0, 4).join('; ') : `${res.n} presets`);
    R.check('…without console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  }

  R.section('the flash warning');
  {
    // Strobe Cut is flash-safe by default; with "Allow fast strobe" on at its fastest beat it
    // flashes above WCAG 2.3.1's 3 a second (TM.Safety measures it), and the Motion panel's
    // background check must say so.
    await S(page, () => { const st = TM.Studio.store; st.setPreset('strobe-cut'); const p = TM.getPreset('strobe-cut').params.find((x) => x.key === 'beats'); st.updateLayer((l) => { l.params.beats = p.max; l.params.fastFlash = true; }); });
    const measured = await S(page, async () => (TM.Safety && TM.Safety.flashes ? (await TM.Safety.flashes(TM.Studio.store.scene)).flashes : null));
    const shown = await until(page, () => [...document.querySelectorAll('#inspector [role="note"]')].some((w) => !w.hidden && /flash/i.test(w.textContent)), null, 15000);
    R.check('a fast strobe shows a photosensitivity note in the Motion panel', measured > 3 && shown, `TM.Safety measures ${measured == null ? '?' : measured.toFixed(1)} flashes/s, note ${shown ? 'shown' : 'missing'}`);
    await S(page, () => TM.Studio.store.undo());
  }

  R.section('path editor: enter, drag a node, exit');
  {
    await page.getByRole('searchbox', { name: /search/i }).first().fill('path flow');
    await page.getByRole('listbox', { name: 'Presets' }).getByRole('option', { name: /^Path Flow,/ }).click();
    await until(page, () => TM.Studio.store.layer.preset === 'path-flow' && !!TM.Studio.store.layer.path);
    await page.getByRole('searchbox', { name: /search/i }).first().fill('');
    const before = await S(page, () => TM.Studio.store.layer.path);
    await focusBody(page);
    await page.keyboard.press('p');
    const on = await until(page, (n) => TM.Studio.store.ui.editPath && document.querySelectorAll('#pathOverlay .pe-anchor').length >= n, before.nodes.length);
    R.check('P enters path editing, one handle per node', on, `${await S(page, () => document.querySelectorAll('#pathOverlay .pe-anchor').length)} anchors, ${before.nodes.length} nodes`);
    R.check('the path starts as an untouched preset shape', !!before.preset, before.preset);
    const pick = await S(page, () => {
      const v = TM.Studio.app.stage.view, r = document.querySelector('#pathOverlay').getBoundingClientRect();
      const nodes = TM.Studio.store.layer.path.nodes;
      const k = nodes.findIndex((n) => n.x > 0.15 && n.x < 0.85 && n.y > 0.15 && n.y < 0.85);
      return k < 0 ? null : { k, x: r.left + nodes[k].x * v.cssW, y: r.top + nodes[k].y * v.cssH, cssW: v.cssW, cssH: v.cssH };
    });
    if (pick) {
      await page.mouse.move(pick.x, pick.y);
      await page.mouse.down();
      await page.mouse.move(pick.x + 40, pick.y + 30, { steps: 8 });
      await page.mouse.up();
    }
    const after = await S(page, () => TM.Studio.store.layer.path);
    const moved = pick && after.nodes[pick.k] ? { dx: (after.nodes[pick.k].x - before.nodes[pick.k].x) * pick.cssW, dy: (after.nodes[pick.k].y - before.nodes[pick.k].y) * pick.cssH } : null;
    R.check('dragging a node moves it with the pointer', !!moved && Math.abs(moved.dx - 40) < 12 && Math.abs(moved.dy - 30) < 12, moved ? `moved ${moved.dx.toFixed(1)}, ${moved.dy.toFixed(1)} px for 40, 30` : 'no node on the artboard');
    R.check('the edited path is marked custom (path.preset dropped)', !after.preset);
    await page.keyboard.press('Escape');
    R.check('Esc leaves path editing', await until(page, () => !TM.Studio.store.ui.editPath && !document.body.classList.contains('editing-path')));
    await page.keyboard.press('Control+z');
    R.check('undo restores the preset shape', await until(page, (p) => TM.Studio.store.layer.path && TM.Studio.store.layer.path.preset === p, before.preset));
  }

  R.section('layers: add, reorder, hide, delete');
  {
    const tools = page.getByRole('toolbar', { name: 'Layer actions' });
    const n0 = await S(page, () => TM.Studio.store.scene.layers.length);
    await page.getByRole('button', { name: 'Add text layer' }).click();
    R.check('Add text layer adds and selects a layer', await until(page, (n) => TM.Studio.store.scene.layers.length === n + 1 && TM.Studio.store.selected === n, n0));
    await page.keyboard.type('SUBTITLE');
    R.check('…and focus is in its text, so typing names it', await until(page, () => TM.Studio.store.layer.text.endsWith('SUBTITLE')), await S(page, () => TM.Studio.store.layer.text));
    const ids = await S(page, () => TM.Studio.store.scene.layers.map((l) => l.id));
    await tools.getByRole('button', { name: 'Send backward' }).click();
    const ids2 = await S(page, () => TM.Studio.store.scene.layers.map((l) => l.id));
    R.check('Send backward moves it down the stack', ids2.join() === [...ids.slice(0, -2), ids[ids.length - 1], ids[ids.length - 2]].join(), `${ids.join(',')} → ${ids2.join(',')}`);
    // Drag the row back to the top of the list (front-most).
    const rows = page.getByRole('listbox', { name: 'Layers' }).getByRole('option');
    const sub = rows.filter({ hasText: 'SUBTITLE' });
    const a = await sub.boundingBox(), top = await rows.first().boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2, top.y + 2, { steps: 10 });
    await page.mouse.up();
    R.check('dragging its row to the top brings it to the front', await until(page, (id) => { const L = TM.Studio.store.scene.layers; return L[L.length - 1].id === id; }, ids[ids.length - 1]));
    await tools.getByRole('button', { name: 'Hide layer' }).click();
    R.check('Hide layer hides it', await until(page, () => TM.Studio.store.layer.visible === false));
    await tools.getByRole('button', { name: 'Show layer' }).click();
    R.check('Show layer shows it again', await until(page, () => TM.Studio.store.layer.visible !== false));
    await tools.getByRole('button', { name: 'Delete layer' }).click();
    R.check('Delete layer removes it', await until(page, (n) => TM.Studio.store.scene.layers.length === n, n0));
    await page.keyboard.press('Control+z');
    R.check('undo brings it back', await until(page, (n) => TM.Studio.store.scene.layers.length === n + 1 && TM.Studio.store.scene.layers.some((l) => l.text.endsWith('SUBTITLE')), n0));
  }

  R.section('timeline: scrub moves time');
  {
    const track = page.getByRole('slider', { name: 'Timeline' });
    const box = await track.boundingBox();
    const res = [];
    for (const u of [0.25, 0.7]) {
      await page.mouse.click(box.x + box.width * u, box.y + box.height / 2);
      const s = await S(page, (u) => { const st = TM.Studio.store, f = Math.round(st.scene.duration * st.scene.fps); return { t: st.ui.time, want: (Math.floor(u * f + 0.5) % f) / st.scene.fps, playing: st.ui.playing, now: document.querySelector('#scrub').getAttribute('aria-valuenow') }; }, u);
      res.push(s);
    }
    R.check('clicking the track jumps to that frame and pauses', res.every((s) => Math.abs(s.t - s.want) < 1e-9 && !s.playing), res.map((s) => `${s.t.toFixed(3)} s (want ${s.want.toFixed(3)})`).join(', '));
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    const dragT = await S(page, () => TM.Studio.store.ui.time / TM.Studio.store.scene.duration);
    R.check('dragging along the track scrubs', Math.abs(dragT - 0.5) < 0.02, `at ${(dragT * 100).toFixed(1)}% of the loop`);
  }

  R.section('keyboard shortcuts');
  {
    await focusBody(page);
    const p0 = await S(page, () => TM.Studio.store.ui.playing);
    await page.keyboard.press('Space');
    const p1 = await S(page, () => TM.Studio.store.ui.playing);
    await page.keyboard.press('Space');
    const p2 = await S(page, () => TM.Studio.store.ui.playing);
    R.check('Space toggles playback', p1 === !p0 && p2 === p0);
    await S(page, () => TM.Studio.store.setUI({ playing: false, time: 1 }));
    await page.keyboard.press('ArrowRight');
    const f1 = await S(page, () => Math.round(TM.Studio.store.ui.time * TM.Studio.store.scene.fps));
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const f2 = await S(page, () => Math.round(TM.Studio.store.ui.time * TM.Studio.store.scene.fps));
    const fps = await S(page, () => TM.Studio.store.scene.fps);
    R.check('→ steps one frame forward, ← back', f1 === fps + 1 && f2 === fps - 1, `frames ${f1}, ${f2} from ${fps}`);
    const n0 = await S(page, () => TM.Studio.store.scene.layers.length);
    await page.keyboard.press('n');
    R.check('N adds a layer without typing the n into it', await until(page, (n) => TM.Studio.store.scene.layers.length === n + 1, n0) && (await S(page, () => TM.Studio.store.layer.text)) === 'NEW LAYER');
    await focusBody(page);
    await page.keyboard.press('Meta+z');
    R.check('⌘Z undoes', await until(page, (n) => TM.Studio.store.scene.layers.length === n, n0));
    await page.keyboard.press('Meta+Shift+z');
    R.check('⌘⇧Z redoes', await until(page, (n) => TM.Studio.store.scene.layers.length === n + 1, n0));
    await page.keyboard.press('Control+z');
  }

  R.section('Export dialog: estimate, then a draft WebM through the UI');
  {
    // A one-second loop keeps the export short (set through the Loop length field).
    const loop = page.locator('#inspector [data-panel="motion"]').getByRole('textbox', { name: 'Loop length value' });
    await loop.fill('1');
    await loop.press('Enter');
    await until(page, () => TM.Studio.store.scene.duration === 1);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: 'Export' });
    R.check('the Export dialog opens', await dlg.isVisible().catch(() => false) || await until(page, () => document.querySelector('#tm-export') && document.querySelector('#tm-export').open));
    await dlg.getByRole('radio', { name: /^WebM/ }).check();
    const est = await until(page, () => /\d[\d.]*\s*(B|KB|MB|GB)\b/.test((document.querySelector('#tm-export .est') || {}).textContent || ''));
    R.check('it shows a size estimate for the video', est, await S(page, () => (document.querySelector('#tm-export .est') || {}).textContent));
    await dlg.getByRole('group', { name: 'Quality' }).getByRole('radio', { name: /draft/i }).check();
    await dlg.getByRole('group', { name: 'Frame rate' }).getByRole('radio', { name: '24', exact: true }).check();
    await dlg.getByRole('combobox', { name: 'Resolution' }).selectOption({ index: 0 });
    const t0 = Date.now();
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      dlg.getByRole('button', { name: /^Export WebM/ }).click(),
    ]);
    const file = path.join(dlDir, dl.suggestedFilename());
    await dl.saveAs(file);
    const bytes = fs.readFileSync(file);
    R.check('the export downloads a non-empty WebM', bytes.length > 1000 && bytes.readUInt32BE(0) === 0x1a45dfa3 && /\.webm$/.test(file), `${dl.suggestedFilename()}, ${(bytes.length / 1024).toFixed(0)} KB in ${Date.now() - t0} ms`);
    R.check('…and the dialog reports it', await until(page, () => { const r = document.querySelector('#tm-export .tm-result'); return !!r && !r.hidden && /webm/i.test(r.textContent); }));
    await page.keyboard.press('Escape');
    R.check('Esc closes the dialog', await until(page, () => !document.querySelector('#tm-export').open));
  }

  R.section('Embed & share: snippets carry the current scene');
  let shareCode = null;
  {
    await page.getByRole('button', { name: 'Embed', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: /Embed/ });
    await until(page, () => /#c=z/.test((document.querySelector('#tm-snip-embed') || {}).value || ''));
    const snips = await S(page, () => ({
      embed: document.querySelector('#tm-snip-embed').value,
      comp: document.querySelector('#tm-snip-component').value,
      links: [...document.querySelectorAll('#tm-share input[readonly]')].map((i) => [i.getAttribute('aria-label'), i.value]),
    }));
    const codes = {
      iframe: (snips.embed.match(/#c=([^&"]+)/) || [])[1],
      component: (snips.comp.match(/scene="([^"]+)"/) || [])[1],
      'remix link': ((snips.links.find(([l]) => /remix/i.test(l)) || [])[1] || '').split('#c=')[1],
      'player link': (((snips.links.find(([l]) => /player/i.test(l)) || [])[1] || '').match(/#c=([^&]+)/) || [])[1],
    };
    const res = await S(page, async (codes) => {
      const out = {};
      for (const [k, c] of Object.entries(codes)) {
        try { out[k] = JSON.stringify(await TM.Scene.decode(c)); } catch (e) { out[k] = null; }
      }
      return { out, cur: JSON.stringify(TM.Studio.store.scene) };
    }, codes);
    const cur = JSON.parse(res.cur);
    const good = Object.entries(res.out).filter(([, v]) => v && close(JSON.parse(v), cur)).map(([k]) => k);
    R.check('iframe, web component, remix and player codes all decode to the current scene', good.length === 4, `${good.join(', ')} of ${Object.keys(codes).join(', ')}`);
    shareCode = codes['remix link'];
    await dlg.getByRole('tab', { name: /web component/i }).click();
    R.check('tabs switch the panel', await until(page, () => !document.querySelector('#tm-panel-component').hidden && document.querySelector('#tm-panel-embed').hidden));
    await page.keyboard.press('Escape');
    await until(page, () => !document.querySelector('#tm-share').open);
  }

  R.section('a share link round trip');
  {
    const want = await scene(page);
    const other = log.watch(await ctx.newPage(), 'share link');
    await boot(other, STUDIO + '#c=' + shareCode);
    const got = await scene(other);
    R.check('index.html#c=… opens the same scene', !!shareCode && close(JSON.parse(got), JSON.parse(want)));
    R.check('…and tidies the code out of the address bar', !(await S(other, () => location.hash)));
    await other.close();
  }

  R.section('autosave survives a reload');
  {
    await page.getByRole('textbox', { name: 'Content' }).fill('PERSIST ME');
    const saved = await until(page, () => TM.Studio.store.layer.text === 'PERSIST ME' && TM.Studio.store.saveState.status === 'saved' && /PERSIST ME/.test(localStorage.getItem('typoman.v4.scene') || ''));
    R.check('edits autosave to localStorage', saved, await S(page, () => document.querySelector('#saveState').dataset.status));
    const want = await scene(page);
    await boot(page, STUDIO);
    R.check('a reload restores the scene exactly', (await scene(page)) === want);
  }
  {
    const errs = log.since();
    R.check('desktop: no console errors', errs.length === 0, errs.slice(0, 4).join(' | '));
  }

  // Round 3 controls are present where users look for them.
  R.section('Round 3 controls');
  {
    const has = (re) => S(page, (src) => {
      const re = new RegExp(src, 'i');
      const names = [...document.querySelectorAll('#inspector [aria-label], #inspector label, #inspector .lbl, #inspector .sec-title, #gallery [role="tab"], .topbar button, .layer-tools button')]
        .map((el) => el.getAttribute('aria-label') || el.textContent);
      return names.some((n) => re.test(n));
    }, re.source);
    await S(page, () => TM.Studio.store.setPreset('rise'));
    R.check('starter templates can be picked in the studio', await has(/template/));
    R.check('an Italic toggle in the Text panel', await has(/italic/));
    R.check('a Ligatures toggle in the Text panel', await has(/ligature/));
    R.check('track matte controls for a layer', await has(/matte/));
    R.check('transform keys for a layer', await has(/transform|keyframe/));
    await page.locator('#inspector [data-panel="motion"]').getByRole('button', { name: /Open curve editor/ }).first().click();
    const spring = await S(page, () => [...document.querySelectorAll('.pop [aria-label], .pop label, .pop .lbl')].some((el) => /stiffness|damping|bounciness|mass/i.test(el.getAttribute('aria-label') || el.textContent)));
    R.check('custom spring controls in the curve editor', spring);
    await page.keyboard.press('Escape');
  }
  await ctx.close();

  // ═════════════════════════════ phone ═════════════════════════════
  R.section('phone 390×844, touch');
  {
    const mark = log.mark();
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await pctx.addInitScript(INIT);
    const ph = log.watch(await pctx.newPage(), 'phone');
    await boot(ph, STUDIO);
    const tabs = ph.getByRole('tablist', { name: 'Panels' }).getByRole('tab');
    R.check('three panel tabs', (await tabs.count()) === 3 && await tabs.first().isVisible());
    const overflow = async () => S(ph, () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    let wide = await overflow();
    // Presets (the tab it opens on; tapping the active tab again would expand the sheet over the
    // stage): search and tap a card.
    await ph.getByRole('searchbox', { name: /search/i }).first().fill('wave');
    const card = ph.getByRole('listbox', { name: 'Presets' }).getByRole('option', { name: /^Wave,/ });
    await card.scrollIntoViewIfNeeded();
    await card.tap();
    R.check('tapping a preset card applies it', await until(ph, () => TM.Studio.store.layer.preset === 'wave'));
    // Edit: a numeric field by touch and keyboard.
    await ph.getByRole('tablist', { name: 'Panels' }).getByRole('tab', { name: 'Edit' }).tap();
    const size = ph.locator('#inspector [data-panel="text"]').getByRole('textbox', { name: 'Size value' });
    await size.scrollIntoViewIfNeeded();
    await size.tap();
    await size.fill('0.12');
    await size.press('Enter');
    R.check('the Edit tab edits the layer', await until(ph, () => Math.abs(TM.Studio.store.layer.type.size - 0.12) < 1e-9));
    wide = Math.max(wide, await overflow());
    // Layers: add one.
    await ph.getByRole('tablist', { name: 'Panels' }).getByRole('tab', { name: 'Layers' }).tap();
    await ph.getByRole('button', { name: 'Add text layer' }).tap();
    R.check('the Layers tab adds a layer', await until(ph, () => TM.Studio.store.scene.layers.length === 2));
    wide = Math.max(wide, await overflow());
    R.check('no tab scrolls sideways', wide <= 0, `${wide} px`);
    // Timeline: tap the track (with the sheet at its normal height, so the stage shows).
    await ph.getByRole('tablist', { name: 'Panels' }).getByRole('tab', { name: 'Presets' }).tap();
    R.check('the stage is visible (sheet not expanded)', !(await S(ph, () => document.body.classList.contains('sheet-full'))));
    const track = ph.getByRole('slider', { name: 'Timeline' });
    const tb = await track.boundingBox();
    await ph.touchscreen.tap(tb.x + tb.width * 0.6, tb.y + tb.height / 2);
    R.check('tapping the timeline scrubs', await until(ph, () => !TM.Studio.store.ui.playing && Math.abs(TM.Studio.store.ui.time / TM.Studio.store.scene.duration - 0.6) < 0.05), String(await S(ph, () => TM.Studio.store.ui.time)));
    // Path editing from the phone stage bar.
    await S(ph, () => TM.Studio.store.setPreset('path-flow'));
    await ph.locator('#pathBtn').tap();
    R.check('Edit path toggles path editing by tap', await until(ph, () => TM.Studio.store.ui.editPath === true));
    await ph.locator('#pathBtn').tap();
    await until(ph, () => !TM.Studio.store.ui.editPath);
    // Export and Embed open from the phone top bar.
    await ph.getByRole('button', { name: 'Export', exact: true }).tap();
    R.check('Export opens on the phone', await until(ph, () => document.querySelector('#tm-export') && document.querySelector('#tm-export').open));
    await ph.keyboard.press('Escape');
    await until(ph, () => !document.querySelector('#tm-export').open);
    await ph.getByRole('button', { name: 'More' }).tap();
    await ph.getByRole('menuitem', { name: /embed/i }).tap();
    R.check('Embed & share opens from the ··· menu', await until(ph, () => document.querySelector('#tm-share') && document.querySelector('#tm-share').open));
    const errs = log.since(mark);
    R.check('phone: no console errors', errs.length === 0, errs.slice(0, 4).join(' | '));
    await pctx.close();
  }
  R.finish();
});
