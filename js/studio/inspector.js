/* TYPOMAN studio — inspector: builds panels for the selected layer from schemas.
 *
 * Panels are pluggable: TM.Studio.registerPanel({ id, title, order, when?(store), build(store, body) → { update() } })
 * A registered panel replaces a built-in panel with the same id (e.g. the path team's 'path').
 * Built-in ids and orders: text 10, motion 20, path 30, color 40, fx 50, canvas 60.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const C = Studio.controls;
  const h = Studio.h;
  const UI = Studio.ui;
  const panels = new Map();
  const COLLAPSE_KEY = 'typoman.inspector.collapsed';
  const DEF = TM.Scene.defaultLayer();

  Studio.registerPanel = function (def) {
    panels.set(def.id, def);
    if (Studio.inspector) Studio.inspector.rebuild();
  };

  // ───────────────────────────── photosensitivity ─────────────────────────────
  // Presets that can flash expose an optional preset.flashes(layer, scene): the most large-area
  // flashes per second for the layer's current params, 0 if none. Above 3 a second (WCAG 2.3.1,
  // ITU-R BT.1702) the studio warns: in the Motion panel, and in the export and embed dialogs.
  Studio.FLASH_LIMIT = 3;
  /**
   * Flashes per second of a visible layer, 0 when its preset can't tell. The method is asked
   * for one pass at the scene's pace (cycles 1) and the result scaled by the layer's cycles:
   * all motion runs on pass progress, so ×2 cycles flash twice as fast, whether or not the
   * preset's own method counts cycles.
   */
  Studio.flashRate = function (layer, scene) {
    const p = layer && TM.getPreset(layer.preset);
    if (!p || typeof p.flashes !== 'function' || layer.visible === false || !String(layer.text || '').trim()) return 0;
    try {
      const cycles = Math.max(1, (layer.time && layer.time.cycles) || 1);
      const r = +p.flashes(Object.assign({}, layer, { time: Object.assign({}, layer.time, { cycles: 1 }) }), scene);
      return Number.isFinite(r) && r > 0 ? r * cycles : 0;
    } catch (e) { return 0; }
  };
  /** Visible layers above the limit: [{ index, layer, rate }]. */
  Studio.flashRisks = (scene) => scene.layers.map((layer, index) => ({ index, layer, rate: Studio.flashRate(layer, scene) })).filter((x) => x.rate > Studio.FLASH_LIMIT);
  Studio.flashText = (rate) => 'about ' + (Math.round(rate * 10) / 10) + ' times a second';

  // Helpers binding a control to a property path on the selected layer / scene.
  function getIn(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  }
  function setIn(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => (o[k] == null ? (o[k] = {}) : o[k]), obj);
    target[last] = value;
  }
  function layerBinding(store, path) {
    return {
      get: () => getIn(store.layer, path),
      set: (v, final) => store.updateLayer((l) => setIn(l, path, v), { coalesce: 'L:' + path, reason: path }),
    };
  }
  function sceneBinding(store, path) {
    return {
      get: () => getIn(store.scene, path),
      set: (v) => store.update((s) => setIn(s, path, v), { coalesce: 'S:' + path, reason: path }),
    };
  }
  /** Show/hide controls from a predicate; returns an updater. */
  const showWhen = (pairs) => () => pairs.forEach(([c, ok]) => { c.el.hidden = !ok(); });

  // ───────────────────────────── built-in panels ─────────────────────────────
  const BUILTIN = [
    {
      id: 'text',
      title: 'Text',
      order: 10,
      build(store, body) {
        const ctl = [];
        const ta = C.textarea({ label: 'Content', rows: 2, max: TM.Scene.MAX_TEXT, placeholder: 'Type your words… (Enter for a new line)', ...layerBinding(store, 'text') });
        ta.input.classList.add('content-input');
        ctl.push(ta);

        // Font: hover / arrow keys preview live (no history); commit records one undo step.
        let original = null;
        const applyFont = (family, opts) => {
          TM.fonts.ensure(family, store.layer.font.weight);
          store.updateLayer((l) => { l.font.family = family; l.font.weight = TM.fonts.clampWeight(family, l.font.weight); }, opts);
        };
        const restore = () => {
          if (!original) return;
          const o = original;
          store.updateLayer((l) => { l.font = Object.assign({}, o); }, { history: false, reason: 'font-preview' });
        };
        const fontCtl = C.font({
          label: 'Font',
          get: () => store.layer.font.family,
          preview: (family) => {
            if (!original) original = { ...store.layer.font };
            applyFont(family, { history: false, reason: 'font-preview' });
          },
          cancel: () => { restore(); original = null; },
          set: (family) => {
            restore();
            original = null;
            if (family !== store.layer.font.family) applyFont(family, { reason: 'font', label: 'Font: ' + family });
          },
        });
        ctl.push(fontCtl);

        // Weight adapts to the family: a slider for variable fonts, buttons for fixed weights.
        const weightSlot = h('div', { class: 'slot' });
        let weightCtl = null, weightFam = null;
        const buildWeight = () => {
          const fam = TM.fonts.get(store.layer.font.family);
          weightFam = store.layer.font.family;
          weightCtl = null;
          weightSlot.replaceChildren();
          if (!fam || fam.max <= fam.min) return;
          const bind = layerBinding(store, 'font.weight');
          weightCtl = fam.weights
            ? C.segmented({ label: 'Weight', options: fam.weights.map((w) => [String(w), String(w)]), get: () => String(store.layer.font.weight), set: (v) => bind.set(+v, true) })
            : C.range({ label: 'Weight', min: fam.min, max: fam.max, step: 1, default: TM.fonts.clampWeight(fam.family, 400), hint: 'Variable font: any weight from ' + fam.min + ' to ' + fam.max, ...bind });
          weightSlot.append(weightCtl.el);
        };
        buildWeight();

        // Width and optical size, for families with those variable axes (see TM.fonts.resolve).
        const axesSlot = h('div', { class: 'slot' });
        let axesCtl = [], axesFam = null;
        const designPx = () => store.layer.type.size * Math.min(store.scene.size.w, store.scene.size.h);
        const buildAxes = () => {
          axesFam = store.layer.font.family;
          axesCtl = [];
          axesSlot.replaceChildren();
          const ax = TM.fonts.axes(axesFam);
          if (!ax) return;
          if (ax.wdth) {
            axesCtl.push(C.range({
              label: 'Width', min: ax.wdth[0], max: ax.wdth[1], step: 1, decimals: 0, unit: '%',
              default: TM.math.clamp(100, ax.wdth[0], ax.wdth[1]),
              hint: 'Variable width axis: the typeface’s own condensed to expanded designs, never a stretch',
              get: () => TM.fonts.widthFor(axesFam, store.layer.font.width),
              set: layerBinding(store, 'font.width').set,
            }));
          }
          if (ax.opsz) {
            axesCtl.push(C.segmented({
              label: 'Optical size',
              options: [['auto', 'Auto', 'Follow the text size'], ['fixed', 'Fixed', 'Pin one optical size']],
              get: () => (store.layer.font.opsz === 'auto' ? 'auto' : 'fixed'),
              set: (v) => store.updateLayer((l) => { l.font.opsz = v === 'auto' ? 'auto' : TM.fonts.opszFor(axesFam, 'auto', designPx()); }, { reason: 'font.opsz', label: 'Optical size' }),
            }), C.range({
              label: 'Opsz', min: ax.opsz[0], max: ax.opsz[1], step: 1, decimals: 0,
              hint: 'Optical size: low values draw sturdier, looser letters for small text; high values finer, tighter ones for display. Dragging pins it',
              get: () => TM.fonts.opszFor(axesFam, store.layer.font.opsz, designPx()),
              set: layerBinding(store, 'font.opsz').set,
            }));
          }
          axesCtl.forEach((c) => axesSlot.append(c.el));
        };
        buildAxes();

        const size = C.range({ label: 'Size', min: 0.02, max: 0.8, step: 0.005, decimals: 3, default: DEF.type.size, hint: 'Relative to the shorter side of the frame', ...layerBinding(store, 'type.size') });
        const tracking = C.range({ label: 'Tracking', min: -0.2, max: 1, step: 0.005, decimals: 3, default: 0, hint: 'Letter spacing in em', ...layerBinding(store, 'type.tracking') });
        const leading = C.range({ label: 'Leading', min: 0.6, max: 2.5, step: 0.01, default: DEF.type.leading, hint: 'Line height', ...layerBinding(store, 'type.leading') });
        const slant = C.range({ label: 'Slant', min: -20, max: 20, step: 0.5, decimals: 1, unit: '°', default: 0, ...layerBinding(store, 'type.slant') });
        const align = C.segmented({ label: 'Align', options: [['left', 'Left', 'Align left', 'alignLeft'], ['center', 'Center', 'Align centre', 'alignCenter'], ['right', 'Right', 'Align right', 'alignRight']], ...layerBinding(store, 'type.align') });
        const textCase = C.segmented({ label: 'Case', options: [['none', 'Aa', 'As typed'], ['upper', 'AA', 'Uppercase'], ['lower', 'aa', 'Lowercase'], ['title', 'Ab', 'Title case']], ...layerBinding(store, 'type.case') });
        ctl.push(size, tracking, leading, slant, align, textCase);

        // Position (looks that place the block at the anchor; path looks follow their path).
        const posHead = h('div', { class: 'sub' }, 'Position');
        const pct = (key) => ({
          get: () => Math.round(store.layer.anchor[key] * 1000) / 10,
          set: (v) => store.updateLayer((l) => { l.anchor[key] = v / 100; }, { coalesce: 'L:anchor', reason: 'anchor' }),
        });
        const px = C.range({ label: 'X', min: -50, max: 150, step: 0.1, decimals: 1, unit: '%', default: 50, hint: 'Or drag the text on the artboard', ...pct('x') });
        const py = C.range({ label: 'Y', min: -50, max: 150, step: 0.1, decimals: 1, unit: '%', default: 50, ...pct('y') });
        const center = h('button', { type: 'button', class: 'btn sm ghost', onclick: () => store.updateLayer((l) => { l.anchor = { x: 0.5, y: 0.5 }; }, { reason: 'anchor', label: 'Centre layer' }) }, UI.icon('target'), h('span', null, 'Centre'));
        const posWrap = h('div', { class: 'slot' }, posHead, px.el, py.el, h('div', { class: 'row-end' }, center));
        ctl.push(px, py);

        body.append(ta.el, fontCtl.el, weightSlot, axesSlot, size.el, tracking.el, leading.el, slant.el, align.el, textCase.el, posWrap);
        const update = () => {
          if (store.layer.font.family !== weightFam) buildWeight();
          if (store.layer.font.family !== axesFam) buildAxes();
          ctl.forEach((c) => c.update());
          if (weightCtl) weightCtl.update();
          axesCtl.forEach((c) => c.update());
          posWrap.hidden = !!(store.preset && store.preset.usesPath);
        };
        update();
        return { update };
      },
    },
    {
      id: 'motion',
      title: 'Motion',
      order: 20,
      build(store, body) {
        const preset = store.preset;
        const ctl = [];
        if (preset) {
          const browse = h('button', { type: 'button', class: 'link-btn', onclick: () => Studio.app && Studio.app.focusPresets() }, 'Browse');
          body.append(h('div', { class: 'preset-line' },
            h('span', { class: 'preset-name' }, preset.name),
            h('span', { class: 'tag-chip' }, preset.category),
            preset.usesPath && preset.category !== 'Path' ? h('span', { class: 'tag-chip' }, 'Follows path') : null,
            browse));
          if (preset.description) body.append(h('p', { class: 'hint' }, preset.description));
        }
        // Photosensitivity: a clear, non-blocking warning right under the preset.
        const flash = h('div', { class: 'flash-warn', role: 'note', hidden: true });
        let flashShown = -1;
        const syncFlash = () => {
          const rate = Studio.flashRate(store.layer, store.scene);
          const on = rate > Studio.FLASH_LIMIT;
          flash.hidden = !on;
          if (!on || Math.abs(rate - flashShown) < 0.05) return;
          flashShown = rate;
          flash.replaceChildren(UI.icon('warning'), h('div', null,
            h('b', null, 'Flashes ' + Studio.flashText(rate)),
            h('p', null, 'Rapid flashing can trigger seizures in people with photosensitive epilepsy. WCAG 2.3.1 allows at most 3 flashes a second: slow it down, soften the flashes or lengthen the loop before you publish.')));
        };
        body.append(flash);
        // Stack's width-axis fill needs a font with a width axis to reach the edges.
        const WIDTH_FONTS = ['Roboto Flex', 'Science Gothic', 'Anybody'].filter((f) => TM.fonts.has(f));
        let axisTip = null, axisTipFor = null;
        const syncAxisTip = () => {
          if (!axisTip) return;
          const fam = store.layer.font.family;
          const ax = TM.fonts.axes(fam);
          axisTip.hidden = !(store.layer.params.fill === 'axis' && !(ax && ax.wdth) && WIDTH_FONTS.length);
          if (axisTip.hidden || axisTipFor === fam) return;
          axisTipFor = fam;
          WIDTH_FONTS.forEach((f) => TM.fonts.ensure(f, 700));
          axisTip.replaceChildren(UI.icon('info'), h('div', null,
            h('p', null, h('b', null, Studio.fontLabel(fam)), ' has no width axis, so rows can only open their tracking. For a full-bleed stack, try a width-axis font:'),
            h('div', { class: 'axis-fonts' }, WIDTH_FONTS.map((f) => {
              const b = h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Use ' + f }, f);
              b.style.fontFamily = TM.fonts.cssFamily(f);
              b.addEventListener('click', () => {
                TM.fonts.ensure(f, store.layer.font.weight);
                store.updateLayer((l) => { l.font.family = f; l.font.weight = TM.fonts.clampWeight(f, l.font.weight); }, { reason: 'font', label: 'Font: ' + f });
              });
              return b;
            }))));
        };
        const groups = new Map();
        (preset ? preset.params : []).forEach((p) => {
          const g = p.group || 'Motion';
          if (!groups.has(g)) groups.set(g, []);
          groups.get(g).push(p);
        });
        const visibleIf = [];
        groups.forEach((params, g) => {
          if (groups.size > 1) body.append(h('div', { class: 'sub' }, g));
          params.forEach((p) => {
            const bind = layerBinding(store, 'params.' + p.key);
            let c;
            if (p.type === 'range') c = C.range({ label: p.label, min: p.min, max: p.max, step: p.step, hint: p.hint, default: p.default, ...bind });
            else if (p.type === 'select') c = p.options.length <= 3 && p.options.every((o) => o[1].length < 12) ? C.segmented({ label: p.label, options: p.options, ...bind }) : C.select({ label: p.label, options: p.options, ...bind });
            else if (p.type === 'toggle') c = C.toggle({ label: p.label, ...bind });
            else if (p.type === 'color') c = C.color({ label: p.label, ...bind });
            else if (p.type === 'ease') c = C.ease({ label: p.label, ...bind });
            if (!c) return;
            if (p.showIf) visibleIf.push([c, p.showIf]);
            ctl.push(c);
            body.append(c.el);
            if (p.key === 'fill' && p.type === 'select' && p.options.some((o) => o[0] === 'axis')) {
              axisTip = h('div', { class: 'axis-tip', role: 'note', hidden: true });
              body.append(axisTip);
            }
          });
        });
        // Per-layer timing (layer.time): start later, run whole cycles faster, or play once and hold.
        const timeBind = (key, label) => ({
          get: () => store.layer.time[key],
          set: (v) => store.updateLayer((l) => { l.time[key] = v; }, { coalesce: 'L:time.' + key, reason: 'time.' + key, label }),
        });
        const delaySlot = h('div', { class: 'slot' });
        let delayCtl = null, delayFor = null;
        const buildDelay = () => {
          const s = store.scene;
          delayFor = s.duration + '|' + s.fps;
          delayCtl = C.range({ label: 'Starts at', min: 0, max: +(s.duration - 1 / s.fps).toFixed(3), step: +(1 / s.fps).toFixed(5), decimals: 2, unit: 's', default: 0, hint: 'Delay this layer, e.g. a subtitle after the title. Or drag its lane in the timeline', ...timeBind('delay', 'Layer start') });
          delaySlot.replaceChildren(delayCtl.el);
        };
        buildDelay();
        const cyclesCtl = C.range({ label: 'Cycles', min: 1, max: 8, step: 1, default: 1, hint: 'Whole passes per scene loop, so the loop stays seamless', ...timeBind('cycles', 'Cycles') });
        const modeCtl = C.segmented({ label: 'Plays', options: [['loop', 'Loop', 'Repeat for the whole scene'], ['once', 'Once & hold', 'Play one pass, then hold the last frame until the scene loops']], ...timeBind('mode', 'Play mode') });
        const durCtl = C.range({ label: 'Loop length', min: 0.5, max: 20, step: 0.1, unit: 's', default: 4, hint: 'Seconds per seamless loop (whole scene)', ...sceneBinding(store, 'duration') });
        durCtl.el.classList.add('ctl-duration');
        body.append(h('div', { class: 'sub' }, 'Layer timing'), delaySlot, cyclesCtl.el, modeCtl.el, h('div', { class: 'sub' }, 'Scene'), durCtl.el);
        ctl.push(cyclesCtl, modeCtl, durCtl);
        const update = () => {
          if (store.scene.duration + '|' + store.scene.fps !== delayFor) buildDelay();
          if (delayCtl) delayCtl.update();
          ctl.forEach((c) => c.update());
          visibleIf.forEach(([c, cond]) => {
            const ok = Object.entries(cond).every(([k, v]) => (Array.isArray(v) ? v.includes(store.layer.params[k]) : store.layer.params[k] === v));
            c.el.hidden = !ok;
          });
          syncFlash();
          syncAxisTip();
        };
        update();
        return { update };
      },
    },
    {
      id: 'path',
      title: 'Path',
      order: 30,
      when: (store) => !!(store.preset && store.preset.usesPath),
      build(store, body) {
        const ctl = [];
        const aspect = () => store.scene.size.w / store.scene.size.h;
        const presetSel = C.select({
          label: 'Shape',
          options: () => [['custom', 'Custom (edited)']].concat(TM.Path.PRESETS.map((p) => [p.id, p.label])),
          get: () => (store.layer.path && store.layer.path.preset) || 'custom',
          set: (id) => { if (id !== 'custom') store.updateLayer((l) => { l.path = TM.Path.preset(id, aspect()); }, { reason: 'path' }); },
        });
        ctl.push(presetSel);
        const edit = h('button', { type: 'button', class: 'btn wide', 'data-kbd': 'P', onclick: () => store.setUI({ editPath: !store.ui.editPath }) });
        ctl.push({ el: edit, update: () => {
          edit.classList.toggle('on', !!store.ui.editPath);
          edit.replaceChildren(UI.icon(store.ui.editPath ? 'check' : 'pen'), h('span', null, store.ui.editPath ? 'Done editing' : 'Edit path on canvas'), h('kbd', null, 'P'));
        } });
        const closed = C.toggle({
          label: 'Closed',
          get: () => !!(store.layer.path && store.layer.path.closed),
          set: (v) => store.updateLayer((l) => { if (l.path) { l.path.closed = v; delete l.path.preset; } }, { reason: 'path' }),
        });
        ctl.push(closed);
        const reverse = h('button', { type: 'button', class: 'btn sm ghost', onclick: () => store.updateLayer((l) => {
          if (!l.path) return;
          l.path.nodes.reverse().forEach((n) => { [n.ix, n.iy, n.ox, n.oy] = [n.ox, n.oy, n.ix, n.iy]; });
          delete l.path.preset;
        }, { reason: 'path', label: 'Reverse path' }) }, UI.icon('reset'), h('span', null, 'Reverse direction'));
        ctl.push({ el: h('div', { class: 'row-end' }, reverse), update() {} });
        body.append(...ctl.map((c) => c.el));
        body.append(h('div', { class: 'sub' }, 'Morph'));
        const morph = C.toggle({
          label: 'Animate path',
          get: () => !!store.layer.pathMorph.enabled,
          set: (v) => store.updateLayer((l) => {
            l.pathMorph.enabled = v;
            if (v && !l.pathMorph.target) l.pathMorph.target = TM.Path.preset(l.path && l.path.preset === 'circle' ? 'heart' : 'circle', aspect());
          }, { reason: 'path' }),
        });
        const target = C.select({
          label: 'Morph to',
          options: () => [['custom', 'Custom (edited)']].concat(TM.Path.PRESETS.map((p) => [p.id, p.label])),
          get: () => (store.layer.pathMorph.target && store.layer.pathMorph.target.preset) || 'custom',
          set: (id) => { if (id !== 'custom') store.updateLayer((l) => { l.pathMorph.target = TM.Path.preset(id, aspect()); }, { reason: 'path' }); },
        });
        const mEase = C.ease({ label: 'Morph ease', ...layerBinding(store, 'pathMorph.ease') });
        ctl.push(morph, target, mEase);
        body.append(morph.el, target.el, mEase.el);
        const update = () => {
          ctl.forEach((c) => c.update());
          target.el.hidden = mEase.el.hidden = !store.layer.pathMorph.enabled;
        };
        update();
        const off = store.on('ui', update);
        return { update, destroy: off };
      },
    },
    {
      id: 'color',
      title: 'Color',
      order: 40,
      build(store, body) {
        const ctl = [];
        const swatches = h('div', { class: 'palettes', role: 'group', 'aria-label': 'Palettes' });
        const paletteBtn = (label, bg, cols, onclick, extraClass) => {
          const b = h('button', { type: 'button', class: 'pal' + (extraClass ? ' ' + extraClass : ''), 'data-tip': label, 'aria-label': 'Apply ' + label + ' palette', onclick });
          b.style.background = bg;
          b.append(...cols.slice(0, 3).map((c) => { const d = h('i'); d.style.background = c; return d; }));
          return b;
        };
        const renderPalettes = () => {
          const kit = Studio.brand && Studio.brand.get();
          const list = [];
          if (kit) list.push(paletteBtn('Your brand kit', kit.bg, kit.colors, () => Studio.brand.apply(store), 'brand'));
          TM.PALETTES.forEach(([id, label, bg, ...cols]) => {
            list.push(paletteBtn(label, bg, cols, () => store.update((s, l) => {
              s.bg.type = s.bg.type === 'transparent' ? 'transparent' : 'solid';
              s.bg.color = bg;
              l.fill.color = cols[0];
              l.fill.color2 = cols[1] || cols[0];
              l.fill.palette = cols.slice();
              l.stroke.color = bg;
              l.fx.extrude.color = TM.color.mix(bg, '#000000', 0.25);
            }, { reason: 'palette', label: 'Palette: ' + label })));
          });
          swatches.replaceChildren(...list);
        };
        renderPalettes();
        const saveBrand = h('button', { type: 'button', class: 'link-btn', onclick: () => {
          if (!Studio.brand) return;
          Studio.brand.save(Studio.brand.fromScene(store.scene, store.layer));
          renderPalettes();
          Studio.toast('Saved your colours and ' + store.layer.font.family + ' as your brand kit');
        } }, UI.icon('sparkle'), h('span', null, 'Save as brand kit'));
        body.append(h('div', { class: 'pal-head' }, h('span', { class: 'lbl' }, 'Palettes'), saveBrand), swatches);

        const fillType = C.segmented({ label: 'Fill', options: [['solid', 'Solid'], ['gradient', 'Gradient'], ['palette', 'Palette']], ...layerBinding(store, 'fill.type') });
        const c1 = C.color({ label: 'Colour', ...layerBinding(store, 'fill.color') });
        const c2 = C.color({ label: 'Colour 2', ...layerBinding(store, 'fill.color2') });
        const ang = C.range({ label: 'Angle', min: -180, max: 180, step: 1, unit: '°', default: 90, ...layerBinding(store, 'fill.angle') });
        const stroke = C.segmented({ label: 'Stroke', options: [['none', 'None'], ['outline', 'Outline'], ['both', 'Fill + line']], ...layerBinding(store, 'stroke.mode') });
        const sw = C.range({ label: 'Stroke width', min: 0.005, max: 0.15, step: 0.001, decimals: 3, default: DEF.stroke.width, ...layerBinding(store, 'stroke.width') });
        const sc = C.color({ label: 'Stroke colour', ...layerBinding(store, 'stroke.color') });
        const bgType = C.segmented({ label: 'Type', options: [['solid', 'Solid'], ['linear', 'Linear'], ['radial', 'Radial'], ['transparent', 'None', 'Transparent']], ...sceneBinding(store, 'bg.type') });
        const bg1 = C.color({ label: 'Colour', ...sceneBinding(store, 'bg.color') });
        const bg2 = C.color({ label: 'Colour 2', ...sceneBinding(store, 'bg.color2') });
        const bga = C.range({ label: 'Angle', min: -180, max: 180, step: 1, unit: '°', default: 90, ...sceneBinding(store, 'bg.angle') });
        const transparentNote = h('p', { class: 'hint small' }, 'Transparent: the checkerboard shows through. Use an export format with alpha (PNG, WebM) to keep it.');
        ctl.push(fillType, c1, c2, ang, stroke, sw, sc, bgType, bg1, bg2, bga);
        body.append(h('div', { class: 'sub' }, 'Type'), fillType.el, c1.el, c2.el, ang.el, stroke.el, sw.el, sc.el,
          h('div', { class: 'sub' }, 'Background'), bgType.el, bg1.el, bg2.el, bga.el, transparentNote);
        const update = () => {
          ctl.forEach((c) => c.update());
          const l = store.layer, s = store.scene;
          c1.el.hidden = l.fill.type === 'palette';
          c2.el.hidden = ang.el.hidden = l.fill.type !== 'gradient';
          sw.el.hidden = l.stroke.mode === 'none';
          sc.el.hidden = l.stroke.mode !== 'both';
          bg1.el.hidden = s.bg.type === 'transparent';
          bg2.el.hidden = s.bg.type === 'solid' || s.bg.type === 'transparent';
          bga.el.hidden = s.bg.type !== 'linear';
          transparentNote.hidden = s.bg.type !== 'transparent';
        };
        update();
        return { update };
      },
    },
    {
      id: 'fx',
      title: 'Effects',
      order: 50,
      collapsed: true,
      build(store, body) {
        const L = (p) => layerBinding(store, p);
        const fx = () => store.layer.fx;
        const echo = C.range({ label: 'Copies', min: 0, max: 12, step: 1, default: 0, hint: 'Echo trails behind the motion', ...L('fx.echo.count') });
        const echoSp = C.range({ label: 'Spacing', min: 0.005, max: 0.25, step: 0.001, decimals: 3, default: DEF.fx.echo.spacing, hint: 'Time between copies (fraction of the loop)', ...L('fx.echo.spacing') });
        const echoFade = C.range({ label: 'Fade', min: 0, max: 1, step: 0.01, default: DEF.fx.echo.fade, ...L('fx.echo.fade') });
        const echoPal = C.toggle({ label: 'Use palette', ...L('fx.echo.palette') });
        const blur = C.range({ label: 'Amount', min: 0, max: 1, step: 0.01, default: 0, ...L('fx.blur') });
        const glow = C.range({ label: 'Amount', min: 0, max: 1, step: 0.01, default: 0, ...L('fx.glow.amount') });
        const glowC = C.color({ label: 'Colour', ...L('fx.glow.color') });
        const sh = C.range({ label: 'Amount', min: 0, max: 1, step: 0.01, default: 0, ...L('fx.shadow.amount') });
        const shD = C.range({ label: 'Distance', min: 0, max: 0.2, step: 0.001, decimals: 3, default: DEF.fx.shadow.distance, ...L('fx.shadow.distance') });
        const shA = C.range({ label: 'Angle', min: -180, max: 180, step: 1, unit: '°', default: DEF.fx.shadow.angle, ...L('fx.shadow.angle') });
        const shC = C.color({ label: 'Colour', ...L('fx.shadow.color') });
        const ex = C.range({ label: 'Depth', min: 0, max: 1, step: 0.01, default: 0, ...L('fx.extrude.depth') });
        const exA = C.range({ label: 'Angle', min: -180, max: 180, step: 1, unit: '°', default: DEF.fx.extrude.angle, ...L('fx.extrude.angle') });
        const exC = C.color({ label: 'Colour', ...L('fx.extrude.color') });
        const grain = C.range({ label: 'Film grain', min: 0, max: 1, step: 0.01, default: 0, ...sceneBinding(store, 'post.grain') });
        const vig = C.range({ label: 'Vignette', min: 0, max: 1, step: 0.01, default: 0, ...sceneBinding(store, 'post.vignette') });
        const ctl = [echo, echoSp, echoFade, echoPal, blur, glow, glowC, sh, shD, shA, shC, ex, exA, exC, grain, vig];
        const sub = (t) => h('div', { class: 'sub' }, t);
        body.append(sub('Echo'), echo.el, echoSp.el, echoFade.el, echoPal.el, sub('Motion blur'), blur.el, sub('Glow'), glow.el, glowC.el,
          sub('Shadow'), sh.el, shD.el, shA.el, shC.el, sub('Extrude'), ex.el, exA.el, exC.el, sub('Film'), grain.el, vig.el);
        const vis = showWhen([
          [echoSp, () => fx().echo.count > 0], [echoFade, () => fx().echo.count > 0], [echoPal, () => fx().echo.count > 0],
          [glowC, () => fx().glow.amount > 0],
          [shD, () => fx().shadow.amount > 0], [shA, () => fx().shadow.amount > 0], [shC, () => fx().shadow.amount > 0],
          [exA, () => fx().extrude.depth > 0], [exC, () => fx().extrude.depth > 0],
        ]);
        const update = () => { ctl.forEach((c) => c.update()); vis(); };
        update();
        return { update };
      },
    },
    {
      id: 'canvas',
      title: 'Canvas',
      order: 60,
      build(store, body) {
        const aspect = C.segmented({
          label: 'Format',
          options: TM.Scene.ASPECTS.map(([id, label]) => [id, id, label]),
          get: () => {
            const { w, h: hh } = store.scene.size;
            const hit = TM.Scene.ASPECTS.find((a) => Math.abs(a[2] / a[3] - w / hh) < 0.01);
            return hit ? hit[0] : '';
          },
          set: (id) => {
            const a = TM.Scene.ASPECTS.find((x) => x[0] === id);
            if (a) store.setSize(a[2], a[3]);
          },
        });
        // Custom pixel size.
        const mk = (axis) => {
          const inp = h('input', { type: 'text', class: 'num wide', inputmode: 'numeric', 'aria-label': axis === 'w' ? 'Width in pixels' : 'Height in pixels', spellcheck: 'false' });
          inp.addEventListener('focus', () => inp.select());
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
          inp.addEventListener('change', () => {
            const v = Math.round(parseFloat(inp.value));
            if (!Number.isFinite(v)) return update();
            const s = { ...store.scene.size, [axis]: TM.math.clamp(v, 64, 4096) };
            store.setSize(s.w, s.h);
          });
          return inp;
        };
        const wIn = mk('w'), hIn = mk('h');
        const sizeRow = h('div', { class: 'ctl ctl-size' }, h('span', { class: 'lbl' }, 'Size'), h('div', { class: 'size-pair' }, wIn, h('span', { class: 'times', 'aria-hidden': 'true' }, '×'), hIn, h('span', { class: 'unit' }, 'px')));
        const fps = C.segmented({ label: 'Frame rate', options: TM.Scene.FPS_OPTIONS.map((f) => [String(f), String(f), f + ' frames per second']), get: () => String(store.scene.fps), set: (v) => store.update((s) => { s.fps = +v; }, { reason: 'fps' }) });
        const seed = C.range({ label: 'Seed', min: 0, max: 9999, step: 1, hint: 'Changes the random choices some looks make', ...sceneBinding(store, 'seed') });
        const dice = h('button', { type: 'button', class: 'btn sm ghost', onclick: () => store.update((s) => { s.seed = Math.floor(Math.random() * 9999); }, { reason: 'seed', label: 'New seed' }) }, UI.icon('dice'), h('span', null, 'New seed'));
        const ctl = [aspect, fps, seed];
        body.append(aspect.el, sizeRow, fps.el, seed.el, h('div', { class: 'row-end' }, dice));
        function update() {
          ctl.forEach((c) => c.update());
          if (document.activeElement !== wIn) wIn.value = store.scene.size.w;
          if (document.activeElement !== hIn) hIn.value = store.scene.size.h;
        }
        update();
        return { update };
      },
    },
  ];

  // ───────────────────────────── inspector ─────────────────────────────
  const DEFAULT_NAME = /^(Text|Layer \d+)$/;
  /** Display name for a layer: its custom name, or its first line of text. */
  Studio.layerName = function (layer) {
    if (layer.name && !DEFAULT_NAME.test(layer.name)) return layer.name;
    const first = String(layer.text || '').split('\n').find((s) => s.trim()) || '';
    return first.trim() ? first.trim().slice(0, 40) : 'Empty layer';
  };

  class Inspector {
    constructor(store, root) {
      this.store = store;
      this.root = root;
      this.built = [];
      this.collapsed = UI.storage.get(COLLAPSE_KEY, {}) || {};
      this.signature = '';
      store.on('change', (d) => this.onChange(d));
      store.on('select', () => this.rebuild());
      this.rebuild();
    }

    _signature() {
      const l = this.store.layer;
      return [this.store.selected, l.id, l.preset, this.store.scene.layers.length].join('|');
    }

    onChange() {
      if (this._signature() !== this.signature) return this.rebuild();
      this.built.forEach((b) => {
        try { if (b.api && b.api.update) b.api.update(); } catch (e) { console.error('[studio] panel', b.id, e); }
      });
      this.updateHead();
    }

    updateHead() {
      if (!this.head) return;
      const store = this.store, l = store.layer, n = store.scene.layers.length;
      this.headName.textContent = Studio.layerName(l);
      this.headName.classList.toggle('empty', !String(l.text || '').trim());
      this.headSub.textContent = 'Layer ' + (n - store.selected) + ' of ' + n + (store.preset ? ' · ' + store.preset.name : '') + (l.visible === false ? ' · hidden' : '');
      this.headChip.textContent = (String(l.text || '').trim()[0] || 'T').toUpperCase();
      this.headChip.style.fontFamily = TM.fonts.cssFamily(l.font.family);
      this.headChip.style.fontWeight = String(TM.fonts.clampWeight(l.font.family, l.font.weight));
      this.headChip.style.color = l.fill.type === 'palette' ? l.fill.palette[0] : l.fill.color;
      this.headChip.style.background = store.scene.bg.type === 'transparent' ? '' : store.scene.bg.color;
      this.headChip.classList.toggle('transparent', store.scene.bg.type === 'transparent');
    }

    rebuild() {
      const store = this.store;
      const scroll = this.root.scrollTop;
      const focusedPanel = document.activeElement && this.root.contains(document.activeElement) ? document.activeElement.closest('[data-panel]') : null;
      const focusId = focusedPanel && focusedPanel.dataset.panel;
      this.built.forEach((b) => {
        this.collapsed[b.id] = b.section.el.classList.contains('collapsed');
        if (b.api && typeof b.api.destroy === 'function') { try { b.api.destroy(); } catch (e) { /* ignore */ } }
      });
      this.root.innerHTML = '';
      this.built = [];
      this.signature = this._signature();

      this.headChip = h('span', { class: 'layer-chip lg', 'aria-hidden': 'true' });
      this.headName = h('div', { class: 'insp-name' });
      this.headSub = h('div', { class: 'insp-sub' });
      this.head = h('div', { class: 'insp-head' }, this.headChip, h('div', { class: 'insp-id' }, this.headName, this.headSub));
      this.root.append(this.head);
      this.updateHead();

      const defs = new Map(BUILTIN.map((d) => [d.id, d]));
      panels.forEach((d, id) => defs.set(id, d));
      let index = 0;
      [...defs.values()]
        .filter((d) => { try { return !d.when || d.when(store); } catch (e) { return false; } })
        .sort((a, b) => (a.order || 100) - (b.order || 100))
        .forEach((d) => {
          const collapsed = this.collapsed[d.id] != null ? this.collapsed[d.id] : !!d.collapsed;
          const section = C.section(d.title, { collapsed, index: ++index, onToggle: () => this.saveCollapsed() });
          section.el.dataset.panel = d.id;
          let api = null;
          try { api = d.build(store, section.body) || null; } catch (e) { console.error('[studio] panel', d.id, e); }
          this.root.append(section.el);
          this.built.push({ id: d.id, section, api });
        });
      this.root.scrollTop = scroll;
      if (focusId) {
        const sec = this.root.querySelector(`[data-panel="${focusId}"] .sec-head`);
        if (sec) sec.focus({ preventScroll: true });
      }
    }

    saveCollapsed() {
      this.built.forEach((b) => { this.collapsed[b.id] = b.section.el.classList.contains('collapsed'); });
      UI.storage.set(COLLAPSE_KEY, this.collapsed);
    }

    /** Expand a panel, scroll it into view and focus its first control. */
    reveal(id, selector) {
      const b = this.built.find((x) => x.id === id);
      if (!b) return null;
      if (b.section.el.classList.contains('collapsed')) b.section.head.click();
      const target = selector ? b.section.el.querySelector(selector) : b.section.head;
      // Scroll only the inspector (scrollIntoView would also nudge the page on phones).
      const box = this.root.getBoundingClientRect(), r = (target || b.section.el).getBoundingClientRect();
      const delta = selector ? r.top + r.height / 2 - (box.top + box.height / 2) : Math.min(0, r.top - box.top - 60) || Math.max(0, r.bottom - box.bottom + 16);
      if (Math.abs(delta) > 1) this.root.scrollTo({ top: this.root.scrollTop + delta, behavior: UI.reducedMotion() ? 'auto' : 'smooth' });
      if (target) target.focus({ preventScroll: true });
      return target;
    }
  }

  Studio.Inspector = Inspector;
  Studio.bindings = { layerBinding, sceneBinding, getIn, setIn };
})(window.TM);
