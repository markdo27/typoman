/* TYPOMAN studio — Path panel (replaces the inspector's built-in 'path' placeholder).
 *
 * Tools (edit points / pen / freehand), a shape library (aspect-correct previews of
 * TM.Path.PRESETS), path operations, transform and point fields, and path keyframes:
 * the main path A plus up to four keys B…E, played ping-pong or as a cycle with an ease per
 * step. Everything applies to the shape being edited (store.ui.pathTarget: 0 = A, i = key).
 * It shares state with the on-canvas editor only through store.ui (editPath, pathTool,
 * pathTarget, pathSel) and store.updateLayer, so either works without the other.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const C = Studio.controls, h = Studio.h, P = TM.Path;
  const DEG = Math.PI / 180;
  const MAX_KEYS = (TM.Scene && TM.Scene.MAX_KEYS) || 4;
  const UI_KEYS = ['editPath', 'pathTool', 'pathTarget', 'pathSel'];
  const icon = (name) => (Studio.pathIcon ? Studio.pathIcon(name) : null);
  const K = () => Studio.pathKeys; // shared with the editor (path-editor.js loads first)

  const aspectOf = (store) => store.scene.size.w / store.scene.size.h;
  const targetOf = (store) => K().index(store);
  const current = (store) => K().def(store.layer, targetOf(store));
  function selected(store) {
    const d = current(store), n = d ? d.nodes.length : 0;
    return (store.ui.pathSel || []).filter((i) => i < n);
  }
  const presetLabel = (def) => {
    const hit = def && def.preset && P.PRESETS.find((p) => p.id === def.preset);
    return hit ? hit.label : 'Custom';
  };

  /** Replace the edited shape (A or a key) with fn(shape); fn returns a new definition or null. */
  function edit(store, fn, opts) {
    const d = current(store);
    const next = d && fn(d);
    if (!next) return;
    const i = targetOf(store);
    delete next.preset;
    store.updateLayer((l) => K().write(l, i, next), Object.assign({ reason: 'path', label: 'Edit path' }, opts));
  }

  /** Replace the whole key list (keeping target = keys[0] and eases aligned). */
  function setKeys(l, keys, eases) {
    const pm = l.pathMorph;
    pm.keys = keys;
    pm.eases = eases;
    pm.target = keys[0] || null;
    if (!keys.length) pm.enabled = false;
  }

  /** A first morph target that reads well against A. */
  function defaultTarget(path, aspect) {
    const id = path && path.closed ? (path.preset === 'circle' ? 'heart' : 'circle') : path && path.preset === 'arc' ? 'wave' : 'arc';
    return P.preset(id, aspect);
  }

  // ───────────────────────────── thumbnails ─────────────────────────────
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
    const label = h('span', null, o.label);
    const caption = h('div', { class: 'pp-caption' }, label, value);
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
      const text = o.caption ? o.caption() : o.label;
      if (label.textContent !== text) label.textContent = text;
      value.textContent = def ? presetLabel(def) : '—';
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
    const shapeName = () => {
      const i = targetOf(store);
      return K().list(store.layer).length ? (i ? 'key ' + K().letter(i) : 'main path A') : '';
    };

    // Tools
    const tool = (id, label, title, ico) => h('button', { type: 'button', class: 'btn', title, 'data-tool': id, onclick: () => {
      const ui = store.ui, on = ui.editPath && (ui.pathTool || 'edit') === id;
      store.setUI(on && id === 'edit' ? { editPath: false } : { editPath: true, pathTool: on ? 'edit' : id });
    } }, icon(ico), h('span', null, label));
    const tools = [
      tool('edit', 'Edit', 'Drag points and handles on the canvas (P)', 'edit'),
      tool('pen', 'Pen', 'Pen: click for corners, drag for curves, click the first point to close, Enter to finish', 'pen'),
      tool('draw', 'Draw', 'Sketch a path freehand on the canvas (D while editing)', 'draw'),
    ];
    body.append(h('div', { class: 'pp-modes', role: 'group', 'aria-label': 'Path tool' }, ...tools));

    // Shape library: applies to the shape being edited (A, or a key of the morph)
    const lib = shapeLibrary(store, {
      label: 'Shape',
      caption: () => (shapeName() ? 'Shape · ' + shapeName() : 'Shape'),
      get: () => current(store),
      pick: (id) => {
        const i = targetOf(store);
        store.updateLayer((l) => K().write(l, i, P.preset(id, aspectOf(store))), { reason: 'path', label: 'Path shape' });
        if (store.ui.pathSel && store.ui.pathSel.length) store.setUI({ pathSel: [] });
      },
    });
    body.append(...lib.els);

    // Operations on the edited shape
    const adjSub = sub('Adjust');
    body.append(adjSub);
    const closed = C.toggle({
      label: 'Closed',
      get: () => !!(current(store) && current(store).closed),
      set: (v) => {
        const d = current(store);
        if (v && d && d.nodes.length < 3) { Studio.toast('A closed path needs at least three points'); closed.update(); return; }
        edit(store, (p) => { const o = P.clone(p); o.closed = v; return o; }, { label: v ? 'Close path' : 'Open path' });
      },
    });
    ctl.push(closed);
    const act = (label, ico, title, fn) => h('button', { type: 'button', class: 'pp-act', title, 'aria-label': title, onclick: fn }, icon(ico), h('span', null, label));
    const rot = (deg) => (e) => edit(store, (d) => P.rotate(d, (e.shiftKey ? Math.sign(deg) * 90 : deg) * DEG, aspectOf(store)), { label: 'Rotate path' });
    body.append(closed.el, h('div', { class: 'pp-acts' },
      act('Reverse', 'reverse', 'Reverse direction: text flows the other way', () => edit(store, (d) => P.reverse(d), { label: 'Reverse path' })),
      act('Flip H', 'fliph', 'Mirror left ↔ right', () => edit(store, (d) => P.mirror(d, 'x'), { label: 'Flip path' })),
      act('Flip V', 'flipv', 'Mirror top ↔ bottom', () => edit(store, (d) => P.mirror(d, 'y'), { label: 'Flip path' })),
      act('Fit', 'fit', 'Fit to frame: centre and scale up without distortion', () => edit(store, (d) => P.fitToFrame(d, aspectOf(store)), { label: 'Fit path' })),
      act('Smooth', 'smooth', 'Smooth all: a flowing curve through every point', () => edit(store, (d) => P.smoothAll(d, aspectOf(store)), { label: 'Smooth path' })),
      act('Corners', 'corner', 'Corners all: straight lines between points', () => edit(store, (d) => P.cornerAll(d), { label: 'Corner path' })),
      act('−15°', 'rotl', 'Rotate 15° counter-clockwise (Shift: 90°)', rot(-15)),
      act('+15°', 'rotr', 'Rotate 15° clockwise (Shift: 90°)', rot(15)),
    ));

    // Transform: the edited shape's bounding box in % of the frame
    const box = () => { const d = current(store); return d ? P.bounds(d) : null; };
    const field = (label, min, max, get, apply, key) => C.range({
      label, min, max, step: 0.1, decimals: 1,
      get: () => { const b = box(); return b ? get(b) * 100 : 0; },
      set: (v) => edit(store, (d) => apply(d, P.bounds(d), v / 100), { coalesce: key, label: 'Transform path' }),
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
      edit(store, (d) => { const o = P.clone(d); for (const i of s) { o.nodes[i].x += dx; o.nodes[i].y += dy; } return o; }, { coalesce: key, label: 'Move point' });
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
      set: (k) => edit(store, (d) => P.setKind(d, selected(store), k, aspectOf(store)), { label: 'Point type' }),
    });
    const delBtn = h('button', { type: 'button', class: 'btn', title: 'Delete the selected points (Del)', onclick: () => {
      const d = current(store);
      if (d && d.nodes.length <= 2) { Studio.toast('A path needs at least two points'); return; }
      const s = selected(store);
      edit(store, (p) => P.removeNodes(p, s, aspectOf(store)), { label: 'Delete point' });
      store.setUI({ pathSel: [] });
    } }, icon('trash'), h('span', null, 'Delete'));
    const startBtn = h('button', { type: 'button', class: 'btn', title: 'Start the closed path here: text and travel begin at this point', onclick: () => {
      const s = selected(store);
      if (s.length !== 1) return;
      edit(store, (d) => P.setStart(d, s[0]), { label: 'Path start' });
      store.setUI({ pathSel: [0] });
    } }, icon('start'), h('span', null, 'Make start'));
    const pointHint = h('p', { class: 'pp-note' });
    const pointEls = [pInfo, px.el, py.el, kind.el, h('div', { class: 'pp-pair' }, delBtn, startBtn)];
    ctl.push(px, py, kind);
    body.append(sub('Point'), pointHint, ...pointEls);

    // Path keyframes: A → B → … over the loop
    const morphOn = C.toggle({
      label: 'Animate path',
      get: () => !!store.layer.pathMorph.enabled,
      set: (v) => {
        store.updateLayer((l) => {
          const pm = l.pathMorph;
          pm.enabled = v;
          if (v && !P.morphKeys(pm).length) setKeys(l, [defaultTarget(l.path, aspectOf(store))], ['smooth']);
        }, { reason: 'path', label: v ? 'Animate path' : 'Stop path animation' });
        if (!v && targetOf(store) !== 0) store.setUI({ pathTarget: 0, pathSel: [] });
      },
    });
    const order = C.segmented({
      label: 'Order',
      options: [['pingpong', 'Ping-pong', 'A → … → last, then back to A'], ['cycle', 'Cycle', 'A → B → … → last → A']],
      get: () => store.layer.pathMorph.mode || 'pingpong',
      set: (v) => store.updateLayer((l) => { l.pathMorph.mode = v; }, { reason: 'path', label: 'Keyframe order' }),
    });
    const keysBox = h('div', { class: 'pp-keys', role: 'list', 'aria-label': 'Path keyframes' });
    const addBtn = h('button', { type: 'button', class: 'btn', title: 'Add a key: a copy of the last shape, ready to edit', onclick: () => {
      const keys = P.morphKeys(store.layer.pathMorph);
      if (keys.length >= MAX_KEYS) return;
      const src = keys.length ? keys[keys.length - 1] : store.layer.path;
      store.updateLayer((l) => {
        const k = P.morphKeys(l.pathMorph).slice(), e = l.pathMorph.eases.slice(0, k.length);
        setKeys(l, k.concat([P.clone(src)]), e.concat(['smooth']));
      }, { reason: 'path', label: 'Add path key' });
      K().focus(store, keys.length + 1, { edit: true });
    } }, icon('plus'), h('span', null, 'Add key'));
    const swapBtn = h('button', { type: 'button', class: 'btn', title: 'Swap the selected key with the main path A', onclick: () => {
      const i = targetOf(store);
      if (!i) return;
      store.updateLayer((l) => {
        const keys = P.morphKeys(l.pathMorph).slice(), a = l.path;
        l.path = keys[i - 1];
        keys[i - 1] = a;
        setKeys(l, keys, l.pathMorph.eases.slice(0, keys.length));
      }, { reason: 'path', label: 'Swap with A' });
      K().focus(store, 0);
    } }, icon('swap'), h('span', null, 'Swap with A'));
    const morphNote = h('p', { class: 'pp-note' });
    const morphEls = [order.el, keysBox, h('div', { class: 'pp-pair' }, addBtn, swapBtn), morphNote];
    ctl.push(morphOn, order);
    body.append(sub('Path keyframes'), morphOn.el, ...morphEls);

    // One card per shape: letter (select & edit), preview, name and time, ease to the next shape.
    let cards = [], cardsKey = '';
    function moveKey(i, dir) {
      const j = i + dir;
      store.updateLayer((l) => {
        const keys = P.morphKeys(l.pathMorph).slice(), e = l.pathMorph.eases.slice(0, keys.length);
        [keys[i - 1], keys[j - 1]] = [keys[j - 1], keys[i - 1]];
        [e[i - 1], e[j - 1]] = [e[j - 1], e[i - 1]];
        setKeys(l, keys, e);
      }, { reason: 'path', label: 'Reorder path keys' });
      const cur = targetOf(store);
      if (cur === i) K().focus(store, j);
      else if (cur === j) K().focus(store, i);
    }
    function removeKey(i) {
      const was = targetOf(store);
      store.updateLayer((l) => {
        const keys = P.morphKeys(l.pathMorph).slice(), e = l.pathMorph.eases.slice(0, keys.length);
        keys.splice(i - 1, 1);
        e.splice(i - 1, 1);
        setKeys(l, keys, e);
      }, { reason: 'path', label: 'Remove path key' });
      if (was === i) K().focus(store, i - 1);
      else if (was > i) K().focus(store, was - 1);
    }
    function buildCards(n) {
      keysBox.replaceChildren();
      cards = [];
      for (let i = 0; i <= n; i++) {
        const letter = h('button', { type: 'button', class: 'pp-key-letter', title: i ? 'Edit key ' + K().letter(i) + ' on the canvas' : 'Edit the main path A on the canvas', onclick: () => K().focus(store, i, { edit: true }) }, K().letter(i));
        const pic = h('div', { class: 'pp-key-thumb', title: 'Edit on the canvas', onclick: () => K().focus(store, i, { edit: true }) });
        const name = h('div', { class: 'pp-key-name' }, h('span'), h('small'));
        const acts = h('div', { class: 'pp-key-acts' });
        let up, down;
        if (i > 0) {
          up = h('button', { type: 'button', title: 'Move earlier', 'aria-label': 'Move key ' + K().letter(i) + ' earlier', onclick: () => moveKey(i, -1) }, icon('up'));
          down = h('button', { type: 'button', title: 'Move later', 'aria-label': 'Move key ' + K().letter(i) + ' later', onclick: () => moveKey(i, 1) }, icon('down'));
          const del = h('button', { type: 'button', title: 'Remove this key', 'aria-label': 'Remove key ' + K().letter(i), onclick: () => removeKey(i) }, icon('x'));
          acts.append(up, down, del);
        }
        const easeCtl = C.ease({
          label: 'Ease to ' + K().letter(i + 1 <= n ? i + 1 : 0),
          get: () => (i === 0 ? store.layer.pathMorph.ease : store.layer.pathMorph.eases[i - 1] || 'smooth'),
          set: (v) => store.updateLayer((l) => {
            if (i === 0) l.pathMorph.ease = v;
            else { const e = l.pathMorph.eases.slice(); e[i - 1] = v; l.pathMorph.eases = e; }
          }, { coalesce: 'path-key-ease-' + i, reason: 'pathMorph.ease', label: 'Key ease' }),
        });
        const card = h('div', { class: 'pp-key', role: 'listitem' }, letter, pic, name, acts, easeCtl.el);
        keysBox.append(card);
        cards.push({ i, card, pic, name, up, down, easeCtl, picKey: '' });
      }
    }
    function updateCards() {
      const L = store.layer, pm = L.pathMorph, keys = K().list(L), n = keys.length, cur = targetOf(store), a = aspectOf(store);
      const key = n + '|' + a;
      if (key !== cardsKey) { cardsKey = key; buildCards(n); }
      const cycle = pm.mode === 'cycle';
      cards.forEach((c) => {
        const def = K().def(L, c.i);
        if (!def) return;
        const pk = JSON.stringify(def.nodes) + def.closed;
        if (pk !== c.picKey) { c.picKey = pk; c.pic.innerHTML = thumb(def, a); }
        c.card.classList.toggle('on', c.i === cur);
        c.name.firstChild.textContent = c.i ? presetLabel(def) : 'Main path';
        c.name.lastChild.textContent = 'at ' + Math.round(P.keyTime(c.i, n + 1, pm.mode) * 100) + '% of the loop';
        if (c.up) { c.up.disabled = c.i <= 1; c.down.disabled = c.i >= n; }
        // The last key has no step of its own in ping-pong: the way back mirrors the way out.
        c.easeCtl.el.hidden = !cycle && c.i === n;
        c.easeCtl.update();
      });
      addBtn.disabled = n >= MAX_KEYS;
      addBtn.title = n >= MAX_KEYS ? 'Up to ' + MAX_KEYS + ' keys' : 'Add a key: a copy of the last shape, ready to edit';
      swapBtn.disabled = !cur;
      const seq = [0].concat(keys.map((_, i) => i + 1)).map((i) => K().letter(i));
      morphNote.textContent = cycle ? 'Each loop: ' + seq.join(' → ') + ' → A.' : 'Each loop: ' + seq.join(' → ') + (n ? ' → back to A.' : '.');
    }

    const kbd = (k) => h('kbd', null, k);
    body.append(h('p', { class: 'pp-note pp-tips' }, 'Double-click the curve to add a point, or a point to toggle corner ↔ smooth. ', kbd('Alt'), ' breaks a handle, ', kbd('Shift'), ' snaps to 45°, ', kbd('Del'), ' deletes, arrows nudge.'));

    function update() {
      const ui = store.ui, def = current(store), pm = store.layer.pathMorph;
      const editing = !!ui.editPath, t = editing ? ui.pathTool || 'edit' : '';
      tools.forEach((b) => { const on = b.dataset.tool === t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      lib.update();
      adjSub.textContent = shapeName() ? 'Adjust · ' + shapeName() : 'Adjust';
      ctl.forEach((c) => c.update());

      const s = selected(store), showPoint = editing && t === 'edit' && s.length > 0;
      pointEls.forEach((e) => { e.hidden = !showPoint; });
      pointHint.hidden = showPoint;
      pointHint.textContent = editing ? 'Click a point on the canvas (Shift-click or drag a box for several) to edit it here.' : 'Turn on Edit to select points and type exact positions.';
      if (showPoint) {
        pInfo.textContent = s.length === 1 ? `Point ${s[0] + 1} of ${def.nodes.length}${s[0] === 0 ? ' · start' : ''}` : `${s.length} points · X / Y move their centre`;
        delBtn.disabled = def.nodes.length <= 2;
        startBtn.hidden = !(def.closed && s.length === 1 && s[0] !== 0);
      }
      morphEls.forEach((e) => { e.hidden = !pm.enabled; });
      if (pm.enabled) updateCards();
    }
    update();
    live = { body, update };
    return { update };
  }

  Studio.registerPanel({ id: 'path', title: 'Path', order: 30, when: (store) => !!(store.preset && store.preset.usesPath), build });
})(window.TM);
