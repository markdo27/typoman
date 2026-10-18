/* TYPOMAN studio — Path panel (replaces the inspector's built-in 'path' placeholder).
 *
 * Shape library (aspect-correct previews of TM.Path.PRESETS), edit / draw modes, path
 * operations, transform and point fields, and morphing A ↔ B. It shares state with the
 * on-canvas editor only through store.ui (editPath, drawPath, pathTarget, pathSel) and
 * store.updateLayer, so either works without the other.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const C = Studio.controls, h = Studio.h, P = TM.Path;
  const DEG = Math.PI / 180;
  const UI_KEYS = ['editPath', 'drawPath', 'pathTarget', 'pathSel'];
  const icon = (name) => (Studio.pathIcon ? Studio.pathIcon(name) : null);

  const aspectOf = (store) => store.scene.size.w / store.scene.size.h;
  function targetOf(store) {
    const pm = store.layer.pathMorph;
    return store.ui.pathTarget === 'b' && pm && pm.enabled && pm.target ? 'b' : 'a';
  }
  const current = (store) => (targetOf(store) === 'b' ? store.layer.pathMorph.target : store.layer.path);
  function selected(store) {
    const d = current(store), n = d ? d.nodes.length : 0;
    return (store.ui.pathSel || []).filter((i) => i < n);
  }

  /** Replace the edited path (A or B) with fn(path); fn returns a new definition or null. */
  function edit(store, fn, opts) {
    const d = current(store);
    const next = d && fn(d);
    if (!next) return;
    const key = targetOf(store);
    delete next.preset;
    store.updateLayer((l) => { if (key === 'b') l.pathMorph.target = next; else l.path = next; }, Object.assign({ reason: 'path' }, opts));
  }

  function defaultTarget(path, aspect) {
    const id = path && path.closed ? (path.preset === 'circle' ? 'heart' : 'circle') : path && path.preset === 'arc' ? 'wave' : 'arc';
    return P.preset(id, aspect);
  }

  // ───────────────────────────── shape library ─────────────────────────────
  const CELL_W = 60;
  const cellH = (a) => Math.round(Math.min(64, Math.max(34, CELL_W / a)));
  /** Mini preview: the path inside a frame of the scene's aspect ratio, start point marked. */
  function thumb(def, a) {
    const w = CELL_W, hh = cellH(a), pad = 4;
    let fw = w - pad * 2, fh = fw / a;
    if (fh > hh - pad * 2) { fh = hh - pad * 2; fw = fh * a; }
    const ox = ((w - fw) / 2).toFixed(2), oy = ((hh - fh) / 2).toFixed(2), n = def.nodes[0];
    return `<svg class="pp-thumb" viewBox="0 0 ${w} ${hh}" aria-hidden="true" focusable="false">` +
      `<rect class="pp-frame" x="${ox}" y="${oy}" width="${fw.toFixed(2)}" height="${fh.toFixed(2)}" rx="2"/>` +
      `<g transform="translate(${ox} ${oy})"><path class="pp-line" d="${P.toSVG(def, fw, fh)}"/>` +
      `<circle class="pp-dot" cx="${(n.x * fw).toFixed(2)}" cy="${(n.y * fh).toFixed(2)}" r="1.9"/></g></svg>`;
  }

  function shapeLibrary(store, o) {
    const value = h('b');
    const caption = h('div', { class: 'pp-caption' }, h('span', null, o.label), value);
    const grid = h('div', { class: 'pp-lib', role: 'group', 'aria-label': o.label });
    const custom = h('div', { class: 'pp-cell pp-custom on', role: 'img', 'aria-label': 'Current custom path', title: 'Custom (edited). Pick a shape to replace it.' });
    let aspect = 0, cells = [], customKey = '';
    function fill(a) {
      aspect = a;
      customKey = '';
      grid.replaceChildren(custom);
      cells = P.PRESETS.map((p) => {
        const b = h('button', { type: 'button', class: 'pp-cell', title: p.label, 'aria-label': p.label + ' path', 'aria-pressed': 'false', onclick: () => o.pick(p.id) });
        b.innerHTML = thumb(P.preset(p.id, a), a);
        grid.append(b);
        return [p.id, b];
      });
    }
    function update() {
      const a = aspectOf(store);
      if (Math.abs(a - aspect) > 1e-9) fill(a);
      const def = o.get(), id = def && def.preset;
      cells.forEach(([pid, b]) => {
        b.classList.toggle('on', pid === id);
        b.setAttribute('aria-pressed', pid === id ? 'true' : 'false');
      });
      custom.hidden = !def || !!id;
      if (def && !id) {
        const key = JSON.stringify(def.nodes) + def.closed;
        if (key !== customKey) { customKey = key; custom.innerHTML = thumb(def, a); }
      }
      const hit = id && P.PRESETS.find((p) => p.id === id);
      value.textContent = def ? (hit ? hit.label : 'Custom') : '—';
    }
    return { els: [caption, grid], update };
  }

  // ───────────────────────────── panel ─────────────────────────────
  let live = null; // the built panel instance; the inspector rebuilds panels often
  const hooked = new WeakSet();
  function hook(store) {
    if (hooked.has(store)) return;
    hooked.add(store);
    store.on('ui', (patch) => {
      if (live && live.body.isConnected && patch && UI_KEYS.some((k) => k in patch)) live.update();
    });
  }

  function build(store, body) {
    hook(store);
    const sub = (text) => h('div', { class: 'sub' }, text);
    const ctl = [];

    // Modes
    const editBtn = h('button', { type: 'button', class: 'btn', title: 'Drag points and handles on the canvas (P)', onclick: () => {
      if (store.ui.drawPath) store.setUI({ drawPath: false, editPath: true });
      else store.setUI({ editPath: !store.ui.editPath });
    } }, icon('edit'), h('span', null, 'Edit points'));
    const drawBtn = h('button', { type: 'button', class: 'btn', title: 'Sketch a new path on the canvas (D while editing)', onclick: () => store.setUI({ editPath: true, drawPath: !store.ui.drawPath }) }, icon('draw'), h('span', null, 'Draw'));
    body.append(h('div', { class: 'pp-modes' }, editBtn, drawBtn));

    // Shape library (always the main path A)
    const libA = shapeLibrary(store, {
      label: 'Shape',
      get: () => store.layer.path,
      pick: (id) => {
        store.updateLayer((l) => { l.path = P.preset(id, aspectOf(store)); }, { reason: 'path' });
        if (targetOf(store) === 'a' && store.ui.pathSel && store.ui.pathSel.length) store.setUI({ pathSel: [] });
      },
    });
    body.append(...libA.els);

    // Operations on the edited path (A, or B while editing the morph target)
    const adjSub = sub('Adjust');
    body.append(adjSub);
    const closed = C.toggle({
      label: 'Closed',
      get: () => !!(current(store) && current(store).closed),
      set: (v) => {
        const d = current(store);
        if (v && d && d.nodes.length < 3) { Studio.toast('A closed path needs at least three points'); closed.update(); return; }
        edit(store, (p) => { const o = P.clone(p); o.closed = v; return o; });
      },
    });
    ctl.push(closed);
    const act = (label, ico, title, fn) => h('button', { type: 'button', class: 'pp-act', title, 'aria-label': title, onclick: fn }, icon(ico), h('span', null, label));
    const rot = (deg) => (e) => edit(store, (d) => P.rotate(d, (e.shiftKey ? Math.sign(deg) * 90 : deg) * DEG, aspectOf(store)));
    body.append(closed.el, h('div', { class: 'pp-acts' },
      act('Reverse', 'reverse', 'Reverse direction: text flows the other way', () => edit(store, (d) => P.reverse(d))),
      act('Flip H', 'fliph', 'Mirror left ↔ right', () => edit(store, (d) => P.mirror(d, 'x'))),
      act('Flip V', 'flipv', 'Mirror top ↔ bottom', () => edit(store, (d) => P.mirror(d, 'y'))),
      act('Fit', 'fit', 'Fit to frame: centre and scale up without distortion', () => edit(store, (d) => P.fitToFrame(d, aspectOf(store)))),
      act('Smooth', 'smooth', 'Smooth all: a flowing curve through every point', () => edit(store, (d) => P.smoothAll(d, aspectOf(store)))),
      act('Corners', 'corner', 'Corners all: straight lines between points', () => edit(store, (d) => P.cornerAll(d))),
      act('−15°', 'rotl', 'Rotate 15° counter-clockwise (Shift: 90°)', rot(-15)),
      act('+15°', 'rotr', 'Rotate 15° clockwise (Shift: 90°)', rot(15)),
    ));

    // Transform: the path's bounding box in % of the frame
    const box = () => { const d = current(store); return d ? P.bounds(d) : null; };
    const field = (label, min, max, get, apply, key) => C.range({
      label, min, max, step: 0.1, decimals: 1,
      get: () => { const b = box(); return b ? get(b) * 100 : 0; },
      set: (v) => edit(store, (d) => apply(d, P.bounds(d), v / 100), { coalesce: key }),
    });
    const tf = [
      field('Center X %', -50, 150, (b) => b.cx, (d, b, v) => P.translate(d, v - b.cx, 0), 'path-tx'),
      field('Center Y %', -50, 150, (b) => b.cy, (d, b, v) => P.translate(d, 0, v - b.cy), 'path-ty'),
      field('Width %', 1, 200, (b) => b.w, (d, b, v) => (b.w > 1e-4 ? P.scale(d, v / b.w, 1, b.cx, b.cy) : null), 'path-sw'),
      field('Height %', 1, 200, (b) => b.h, (d, b, v) => (b.h > 1e-4 ? P.scale(d, 1, v / b.h, b.cx, b.cy) : null), 'path-sh'),
    ];
    ctl.push(...tf);
    body.append(sub('Transform'), ...tf.map((c) => c.el));

    // Point: numeric position and type of the selected point(s)
    const center = () => {
      const d = current(store), s = selected(store);
      if (!d || !s.length) return { x: 0.5, y: 0.5 };
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const i of s) {
        const n = d.nodes[i];
        x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x);
        y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y);
      }
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    };
    const moveSel = (dx, dy, key) => {
      const s = selected(store);
      if (!s.length || (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12)) return;
      edit(store, (d) => { const o = P.clone(d); for (const i of s) { o.nodes[i].x += dx; o.nodes[i].y += dy; } return o; }, { coalesce: key });
    };
    const pInfo = h('p', { class: 'pp-note' });
    const px = C.range({ label: 'X %', min: -100, max: 200, step: 0.1, decimals: 1, get: () => center().x * 100, set: (v) => moveSel(v / 100 - center().x, 0, 'path-pt-x') });
    const py = C.range({ label: 'Y %', min: -100, max: 200, step: 0.1, decimals: 1, get: () => center().y * 100, set: (v) => moveSel(0, v / 100 - center().y, 'path-pt-y') });
    const kind = C.segmented({
      label: 'Type',
      options: [['corner', 'Corner', 'Corner: handles move independently'], ['smooth', 'Smooth', 'Smooth: handles stay in line'], ['mirror', 'Mirror', 'Mirror: handles in line and equal']],
      get: () => {
        const d = current(store), s = selected(store);
        if (!d || !s.length) return '';
        const k = d.nodes[s[0]].k;
        return s.every((i) => d.nodes[i].k === k) ? k : '';
      },
      set: (k) => edit(store, (d) => P.setKind(d, selected(store), k, aspectOf(store))),
    });
    const delBtn = h('button', { type: 'button', class: 'btn', title: 'Delete the selected points (Del)', onclick: () => {
      const d = current(store);
      if (d && d.nodes.length <= 2) { Studio.toast('A path needs at least two points'); return; }
      const s = selected(store);
      edit(store, (p) => P.removeNodes(p, s, aspectOf(store)));
      store.setUI({ pathSel: [] });
    } }, icon('trash'), h('span', null, 'Delete'));
    const startBtn = h('button', { type: 'button', class: 'btn', title: 'Start the closed path here: text and travel begin at this point', onclick: () => {
      const s = selected(store);
      if (s.length !== 1) return;
      edit(store, (d) => P.setStart(d, s[0]));
      store.setUI({ pathSel: [0] });
    } }, icon('start'), h('span', null, 'Make start'));
    const pointHint = h('p', { class: 'pp-note' });
    const pointEls = [pInfo, px.el, py.el, kind.el, h('div', { class: 'pp-pair' }, delBtn, startBtn)];
    ctl.push(px, py, kind);
    body.append(sub('Point'), pointHint, ...pointEls);

    // Morph A ↔ B
    const morphOn = C.toggle({
      label: 'Animate path',
      get: () => !!store.layer.pathMorph.enabled,
      set: (v) => {
        store.updateLayer((l) => {
          l.pathMorph.enabled = v;
          if (v && !l.pathMorph.target) l.pathMorph.target = defaultTarget(l.path, aspectOf(store));
        }, { reason: 'path' });
        if (!v && store.ui.pathTarget === 'b') store.setUI({ pathTarget: 'a', pathSel: [] });
      },
    });
    const which = C.segmented({
      label: 'Edit',
      options: [['a', 'A · Path', 'Edit the main path'], ['b', 'B · Target', 'Edit the morph target on the canvas']],
      get: () => targetOf(store),
      set: (v) => store.setUI(Object.assign({ pathTarget: v, pathSel: [] }, v === 'b' ? { editPath: true } : {})),
    });
    const libB = shapeLibrary(store, {
      label: 'Morph to',
      get: () => store.layer.pathMorph.target,
      pick: (id) => {
        store.updateLayer((l) => { l.pathMorph.target = P.preset(id, aspectOf(store)); }, { reason: 'path' });
        if (targetOf(store) === 'b' && store.ui.pathSel && store.ui.pathSel.length) store.setUI({ pathSel: [] });
      },
    });
    const mEase = C.ease({
      label: 'Morph ease',
      get: () => store.layer.pathMorph.ease,
      set: (v) => store.updateLayer((l) => { l.pathMorph.ease = v; }, { coalesce: 'L:pathMorph.ease', reason: 'pathMorph.ease' }),
    });
    const swapBtn = h('button', { type: 'button', class: 'btn', title: 'Swap the main path and the morph target', onclick: () => store.updateLayer((l) => {
      const a = l.path, b = l.pathMorph.target;
      if (!a || !b) return;
      l.path = b;
      l.pathMorph.target = a;
    }, { reason: 'path' }) }, icon('swap'), h('span', null, 'Swap A ↔ B'));
    const copyBtn = h('button', { type: 'button', class: 'btn', title: 'Start the target as a copy of the main path, then edit B', onclick: () => {
      store.updateLayer((l) => { if (l.path) l.pathMorph.target = P.clone(l.path); }, { reason: 'path' });
    } }, icon('copy'), h('span', null, 'B = copy of A'));
    const morphNote = h('p', { class: 'pp-note' }, 'The path morphs A → B → A once per loop.');
    const morphEls = [which.el, ...libB.els, mEase.el, h('div', { class: 'pp-pair' }, swapBtn, copyBtn), morphNote];
    ctl.push(morphOn, which, mEase);
    body.append(sub('Morph'), morphOn.el, ...morphEls);

    const kbd = (k) => h('kbd', null, k);
    body.append(h('p', { class: 'pp-note pp-tips' }, 'Double-click the curve to add a point, or a point to toggle corner ↔ smooth. ', kbd('Alt'), ' breaks a handle, ', kbd('Shift'), ' snaps to 45°, ', kbd('Del'), ' deletes, arrows nudge.'));

    function update() {
      const ui = store.ui, def = current(store), pm = store.layer.pathMorph;
      const editing = !!ui.editPath, drawing = editing && !!ui.drawPath;
      editBtn.classList.toggle('on', editing && !drawing);
      editBtn.setAttribute('aria-pressed', String(editing && !drawing));
      drawBtn.classList.toggle('on', drawing);
      drawBtn.setAttribute('aria-pressed', String(drawing));
      libA.update();
      const morph = !!(pm && pm.enabled && pm.target);
      adjSub.textContent = morph ? 'Adjust · ' + (targetOf(store) === 'b' ? 'B target' : 'A path') : 'Adjust';
      ctl.forEach((c) => c.update());

      const s = selected(store), showPoint = editing && !drawing && s.length > 0;
      pointEls.forEach((e) => { e.hidden = !showPoint; });
      pointHint.hidden = showPoint;
      pointHint.textContent = editing ? 'Click a point on the canvas (Shift-click or drag a box for several) to edit it here.' : 'Turn on Edit points to select points and type exact positions.';
      if (showPoint) {
        pInfo.textContent = s.length === 1 ? `Point ${s[0] + 1} of ${def.nodes.length}${s[0] === 0 ? ' · start' : ''}` : `${s.length} points · X / Y move their centre`;
        delBtn.disabled = def.nodes.length <= 2;
        startBtn.hidden = !(def.closed && s.length === 1 && s[0] !== 0);
      }
      morphEls.forEach((e) => { e.hidden = !pm.enabled; });
      if (pm.enabled) libB.update();
    }
    update();
    live = { body, update };
    return { update };
  }

  Studio.registerPanel({ id: 'path', title: 'Path', order: 30, when: (store) => !!(store.preset && store.preset.usesPath), build });
})(window.TM);
