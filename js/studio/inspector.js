/* TYPOMAN studio — inspector: builds panels for the selected layer from schemas.
 *
 * Panels are pluggable: TM.Studio.registerPanel({ id, title, order, when?(store), build(store, body) → { update() } })
 * A registered panel replaces a built-in panel with the same id (e.g. the path team's 'path').
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const C = Studio.controls;
  const h = Studio.h;
  const panels = new Map();

  Studio.registerPanel = function (def) {
    panels.set(def.id, def);
    if (Studio.inspector) Studio.inspector.rebuild();
  };

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

  // ───────────────────────────── built-in panels ─────────────────────────────
  const BUILTIN = [
    {
      id: 'text',
      title: 'Text',
      order: 10,
      build(store, body) {
        const ctl = [];
        const ta = C.textarea({ label: 'Content', rows: 3, placeholder: 'Type something…', ...layerBinding(store, 'text') });
        ctl.push(ta);
        const fontCtl = C.font({
          label: 'Font',
          get: () => store.layer.font.family,
          set: (family) => {
            TM.fonts.ensure(family, store.layer.font.weight);
            store.updateLayer((l) => { l.font.family = family; l.font.weight = TM.fonts.clampWeight(family, l.font.weight); }, { reason: 'font' });
          },
        });
        ctl.push(fontCtl);
        const fam = TM.fonts.get(store.layer.font.family);
        if (fam && fam.max > fam.min) {
          ctl.push(C.range({ label: 'Weight', min: fam.min, max: fam.max, step: fam.weights ? 300 : 10, ...layerBinding(store, 'font.weight') }));
        }
        ctl.push(C.range({ label: 'Size', min: 0.02, max: 0.8, step: 0.005, decimals: 3, ...layerBinding(store, 'type.size') }));
        ctl.push(C.range({ label: 'Tracking', min: -0.2, max: 1, step: 0.005, decimals: 3, ...layerBinding(store, 'type.tracking') }));
        ctl.push(C.range({ label: 'Leading', min: 0.6, max: 2.5, step: 0.01, ...layerBinding(store, 'type.leading') }));
        ctl.push(C.range({ label: 'Slant', min: -20, max: 20, step: 0.5, ...layerBinding(store, 'type.slant') }));
        ctl.push(C.segmented({ label: 'Align', options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], ...layerBinding(store, 'type.align') }));
        ctl.push(C.segmented({ label: 'Case', options: [['none', 'Aa', 'As typed'], ['upper', 'AA', 'Uppercase'], ['lower', 'aa', 'Lowercase'], ['title', 'Ab', 'Title case']], ...layerBinding(store, 'type.case') }));
        body.append(...ctl.map((c) => c.el));
        return { update: () => ctl.forEach((c) => c.update()), rebuildOn: ['font'] };
      },
    },
    {
      id: 'motion',
      title: 'Motion',
      order: 20,
      build(store, body) {
        const preset = store.preset;
        const ctl = [];
        if (preset && preset.description) body.append(h('p', { class: 'hint' }, preset.description));
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
            if (p.type === 'range') c = C.range({ label: p.label, min: p.min, max: p.max, step: p.step, hint: p.hint, ...bind });
            else if (p.type === 'select') c = p.options.length <= 3 && p.options.every((o) => o[1].length < 12) ? C.segmented({ label: p.label, options: p.options, ...bind }) : C.select({ label: p.label, options: p.options, ...bind });
            else if (p.type === 'toggle') c = C.toggle({ label: p.label, ...bind });
            else if (p.type === 'color') c = C.color({ label: p.label, ...bind });
            else if (p.type === 'ease') c = C.ease({ label: p.label, ...bind });
            if (!c) return;
            if (p.showIf) visibleIf.push([c, p.showIf]);
            ctl.push(c);
            body.append(c.el);
          });
        });
        const durCtl = C.range({ label: 'Loop length (s)', min: 0.5, max: 20, step: 0.1, ...sceneBinding(store, 'duration') });
        body.append(h('div', { class: 'sub' }, 'Clip'), durCtl.el);
        ctl.push(durCtl);
        const update = () => {
          ctl.forEach((c) => c.update());
          visibleIf.forEach(([c, cond]) => {
            const ok = Object.entries(cond).every(([k, v]) => (Array.isArray(v) ? v.includes(store.layer.params[k]) : store.layer.params[k] === v));
            c.el.hidden = !ok;
          });
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
        const edit = h('button', { type: 'button', class: 'btn wide', onclick: () => store.setUI({ editPath: !store.ui.editPath }) }, 'Edit path on canvas');
        ctl.push({ el: edit, update: () => { edit.classList.toggle('on', !!store.ui.editPath); edit.textContent = store.ui.editPath ? 'Done editing' : 'Edit path on canvas'; } });
        const closed = C.toggle({
          label: 'Closed',
          get: () => !!(store.layer.path && store.layer.path.closed),
          set: (v) => store.updateLayer((l) => { if (l.path) { l.path.closed = v; delete l.path.preset; } }, { reason: 'path' }),
        });
        ctl.push(closed);
        const reverse = h('button', { type: 'button', class: 'btn', onclick: () => store.updateLayer((l) => {
          if (!l.path) return;
          l.path.nodes.reverse().forEach((n) => { [n.ix, n.iy, n.ox, n.oy] = [n.ox, n.oy, n.ix, n.iy]; });
          delete l.path.preset;
        }, { reason: 'path' }) }, 'Reverse direction');
        ctl.push({ el: reverse, update() {} });
        body.append(h('div', { class: 'sub' }, 'Morph'));
        const morph = C.toggle({
          label: 'Animate path',
          get: () => !!store.layer.pathMorph.enabled,
          set: (v) => store.updateLayer((l) => {
            l.pathMorph.enabled = v;
            if (v && !l.pathMorph.target) l.pathMorph.target = TM.Path.preset(l.path && l.path.preset === 'circle' ? 'heart' : 'circle', aspect());
          }, { reason: 'path' }),
        });
        ctl.push(morph);
        const target = C.select({
          label: 'Morph to',
          options: () => [['custom', 'Custom (edited)']].concat(TM.Path.PRESETS.map((p) => [p.id, p.label])),
          get: () => (store.layer.pathMorph.target && store.layer.pathMorph.target.preset) || 'custom',
          set: (id) => { if (id !== 'custom') store.updateLayer((l) => { l.pathMorph.target = TM.Path.preset(id, aspect()); }, { reason: 'path' }); },
        });
        ctl.push(target);
        const mEase = C.ease({ label: 'Morph ease', ...layerBinding(store, 'pathMorph.ease') });
        ctl.push(mEase);
        body.append(...ctl.map((c) => c.el));
        const update = () => {
          ctl.forEach((c) => c.update());
          target.el.hidden = mEase.el.hidden = !store.layer.pathMorph.enabled;
        };
        update();
        store.on('ui', update);
        return { update };
      },
    },
    {
      id: 'color',
      title: 'Color',
      order: 40,
      build(store, body) {
        const ctl = [];
        const swatches = h('div', { class: 'palettes', role: 'list', 'aria-label': 'Palettes' });
        TM.PALETTES.forEach(([id, label, bg, ...cols]) => {
          const b = h('button', { type: 'button', class: 'pal', title: label, role: 'listitem', 'aria-label': 'Apply ' + label + ' palette', onclick: () => store.update((s, l) => {
            s.bg.type = s.bg.type === 'transparent' ? 'transparent' : 'solid';
            s.bg.color = bg;
            l.fill.color = cols[0];
            l.fill.color2 = cols[1] || cols[0];
            l.fill.palette = cols.slice();
            l.stroke.color = bg;
            l.fx.extrude.color = TM.color.mix(bg, '#000000', 0.25);
          }, { reason: 'palette' }) });
          b.style.background = bg;
          b.append(...cols.slice(0, 3).map((c) => { const d = h('i'); d.style.background = c; return d; }));
          swatches.append(b);
        });
        body.append(swatches);
        const fillType = C.segmented({ label: 'Fill', options: [['solid', 'Solid'], ['gradient', 'Gradient'], ['palette', 'Palette']], ...layerBinding(store, 'fill.type') });
        const c1 = C.color({ label: 'Color', ...layerBinding(store, 'fill.color') });
        const c2 = C.color({ label: 'Color 2', ...layerBinding(store, 'fill.color2') });
        const ang = C.range({ label: 'Angle', min: -180, max: 180, step: 1, ...layerBinding(store, 'fill.angle') });
        const stroke = C.segmented({ label: 'Stroke', options: [['none', 'None'], ['outline', 'Outline'], ['both', 'Fill + line']], ...layerBinding(store, 'stroke.mode') });
        const sw = C.range({ label: 'Stroke width', min: 0.005, max: 0.15, step: 0.001, decimals: 3, ...layerBinding(store, 'stroke.width') });
        const sc = C.color({ label: 'Stroke color', ...layerBinding(store, 'stroke.color') });
        const bgType = C.segmented({ label: 'Background', options: [['solid', 'Solid'], ['linear', 'Linear'], ['radial', 'Radial'], ['transparent', 'None']], ...sceneBinding(store, 'bg.type') });
        const bg1 = C.color({ label: 'Background', ...sceneBinding(store, 'bg.color') });
        const bg2 = C.color({ label: 'Background 2', ...sceneBinding(store, 'bg.color2') });
        const bga = C.range({ label: 'Bg angle', min: -180, max: 180, step: 1, ...sceneBinding(store, 'bg.angle') });
        ctl.push(fillType, c1, c2, ang, stroke, sw, sc, bgType, bg1, bg2, bga);
        body.append(...ctl.map((c) => c.el));
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
        const ctl = [
          C.range({ label: 'Echo copies', min: 0, max: 12, step: 1, ...L('fx.echo.count') }),
          C.range({ label: 'Echo spacing', min: 0.005, max: 0.25, step: 0.001, decimals: 3, ...L('fx.echo.spacing') }),
          C.range({ label: 'Echo fade', min: 0, max: 1, step: 0.01, ...L('fx.echo.fade') }),
          C.toggle({ label: 'Echo uses palette', ...L('fx.echo.palette') }),
          C.range({ label: 'Motion blur', min: 0, max: 1, step: 0.01, ...L('fx.blur') }),
          C.range({ label: 'Glow', min: 0, max: 1, step: 0.01, ...L('fx.glow.amount') }),
          C.color({ label: 'Glow color', ...L('fx.glow.color') }),
          C.range({ label: 'Shadow', min: 0, max: 1, step: 0.01, ...L('fx.shadow.amount') }),
          C.range({ label: 'Shadow distance', min: 0, max: 0.2, step: 0.001, decimals: 3, ...L('fx.shadow.distance') }),
          C.range({ label: 'Shadow angle', min: -180, max: 180, step: 1, ...L('fx.shadow.angle') }),
          C.color({ label: 'Shadow color', ...L('fx.shadow.color') }),
          C.range({ label: 'Extrude', min: 0, max: 1, step: 0.01, ...L('fx.extrude.depth') }),
          C.range({ label: 'Extrude angle', min: -180, max: 180, step: 1, ...L('fx.extrude.angle') }),
          C.color({ label: 'Extrude color', ...L('fx.extrude.color') }),
          C.range({ label: 'Film grain', min: 0, max: 1, step: 0.01, ...sceneBinding(store, 'post.grain') }),
          C.range({ label: 'Vignette', min: 0, max: 1, step: 0.01, ...sceneBinding(store, 'post.vignette') }),
        ];
        body.append(...ctl.map((c) => c.el));
        return { update: () => ctl.forEach((c) => c.update()) };
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
        const fps = C.segmented({ label: 'Frame rate', options: TM.Scene.FPS_OPTIONS.map((f) => [String(f), String(f)]), get: () => String(store.scene.fps), set: (v) => store.update((s) => { s.fps = +v; }) });
        const seed = C.range({ label: 'Seed', min: 0, max: 9999, step: 1, ...sceneBinding(store, 'seed') });
        const ctl = [aspect, fps, seed];
        body.append(...ctl.map((c) => c.el));
        return { update: () => ctl.forEach((c) => c.update()) };
      },
    },
  ];

  class Inspector {
    constructor(store, root) {
      this.store = store;
      this.root = root;
      this.built = [];
      this.collapsed = {};
      this.signature = '';
      store.on('change', (d) => this.onChange(d));
      store.on('select', () => this.rebuild());
      this.rebuild();
    }

    _signature() {
      const l = this.store.layer;
      return [this.store.selected, l.preset, l.font.family, this.store.scene.layers.length].join('|');
    }

    onChange() {
      if (this._signature() !== this.signature) return this.rebuild();
      this.built.forEach((b) => b.api && b.api.update && b.api.update());
    }

    rebuild() {
      const store = this.store;
      const scroll = this.root.scrollTop;
      this.built.forEach((b) => { this.collapsed[b.id] = b.section.el.classList.contains('collapsed'); });
      this.root.innerHTML = '';
      this.built = [];
      this.signature = this._signature();
      const defs = new Map(BUILTIN.map((d) => [d.id, d]));
      panels.forEach((d, id) => defs.set(id, d));
      [...defs.values()]
        .filter((d) => !d.when || d.when(store))
        .sort((a, b) => (a.order || 100) - (b.order || 100))
        .forEach((d) => {
          const collapsed = this.collapsed[d.id] != null ? this.collapsed[d.id] : !!d.collapsed;
          const section = C.section(d.title, { collapsed });
          section.el.dataset.panel = d.id;
          let api = null;
          try { api = d.build(store, section.body) || null; } catch (e) { console.error('[studio] panel', d.id, e); }
          this.root.append(section.el);
          this.built.push({ id: d.id, section, api });
        });
      this.root.scrollTop = scroll;
    }
  }

  Studio.Inspector = Inspector;
  Studio.bindings = { layerBinding, sceneBinding, getIn, setIn };
})(window.TM);
