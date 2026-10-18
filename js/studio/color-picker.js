/* TYPOMAN studio — colour picker + brand kit.
 *
 *   TM.Studio.openColorPicker(anchor, { label, get, set(hex, final) })
 *     Saturation/value field, hue slider, hex field, eyedropper (where the browser has one),
 *     and one-click swatches: your brand kit, colours already in this scene, and recent picks.
 *
 *   TM.Studio.brand   { get(), save(kit), clear(), fromScene(scene, layer), apply(store) }
 *     A saved brand kit = { bg, colors: [hex…], font: { family, weight } } kept in this browser.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const h = Studio.h;
  const UI = Studio.ui;
  const { clamp } = TM.math;
  const BRAND_KEY = 'typoman.brand';
  const RECENT_KEY = 'typoman.recentColors';

  // ───────────────────────────── colour maths ─────────────────────────────
  function hexToHsv(hex) {
    const { r, g, b } = TM.color.parse(hex);
    const R = r / 255, G = g / 255, B = b / 255;
    const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
    let hue = 0;
    if (d) {
      if (max === R) hue = ((G - B) / d) % 6;
      else if (max === G) hue = (B - R) / d + 2;
      else hue = (R - G) / d + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }
    return { h: hue, s: max ? d / max : 0, v: max };
  }
  function hsvToHex(hh, s, v) {
    const f = (n) => {
      const k = (n + hh / 60) % 6;
      return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return TM.color.toHex({ r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 });
  }
  const norm = (hex) => {
    const c = TM.color.parse(hex);
    return TM.color.toHex(c);
  };

  // ───────────────────────────── brand kit + recents ─────────────────────────────
  const brand = {
    get() {
      const k = UI.storage.get(BRAND_KEY, null);
      if (!k || !TM.color.isHex(k.bg) || !Array.isArray(k.colors)) return null;
      return { bg: k.bg, colors: k.colors.filter(TM.color.isHex).slice(0, 8), font: k.font && TM.fonts.has(k.font.family) ? k.font : null };
    },
    save(kit) { return UI.storage.set(BRAND_KEY, kit); },
    clear() { UI.storage.remove(BRAND_KEY); },
    fromScene(scene, layer) {
      const colors = [layer.fill.color];
      if (layer.fill.type !== 'solid') colors.push(layer.fill.color2);
      (layer.fill.palette || []).forEach((c) => colors.push(c));
      const uniq = [...new Set(colors.map(norm))].slice(0, 6);
      return { bg: norm(scene.bg.color), colors: uniq, font: { family: layer.font.family, weight: layer.font.weight } };
    },
    /** Apply the kit to the selected layer + background as one undoable step. */
    apply(store) {
      const k = brand.get();
      if (!k) return false;
      if (k.font) TM.fonts.ensure(k.font.family, k.font.weight);
      store.update((s, l) => {
        if (s.bg.type === 'transparent') s.bg.type = 'transparent'; else s.bg.type = 'solid';
        s.bg.color = k.bg;
        l.fill.color = k.colors[0] || l.fill.color;
        l.fill.color2 = k.colors[1] || k.colors[0] || l.fill.color2;
        if (k.colors.length) l.fill.palette = k.colors.slice();
        l.stroke.color = k.bg;
        if (k.font) { l.font.family = k.font.family; l.font.weight = TM.fonts.clampWeight(k.font.family, k.font.weight); }
      }, { reason: 'brand', label: 'Apply brand kit' });
      return true;
    },
  };
  Studio.brand = brand;

  const recent = {
    list: () => (UI.storage.get(RECENT_KEY, []) || []).filter(TM.color.isHex).slice(0, 8),
    push(hex) {
      const v = norm(hex);
      const next = [v].concat(recent.list().filter((c) => c !== v)).slice(0, 8);
      UI.storage.set(RECENT_KEY, next);
    },
  };
  Studio.recentColors = recent;

  function sceneColors() {
    const s = Studio.store && Studio.store.scene;
    if (!s) return [];
    const out = [];
    if (s.bg.type !== 'transparent') out.push(s.bg.color, s.bg.color2);
    s.layers.forEach((l) => { out.push(l.fill.color, l.fill.color2, ...(l.fill.palette || []), l.stroke.color); });
    return [...new Set(out.filter(TM.color.isHex).map(norm))].slice(0, 12);
  }

  // ───────────────────────────── picker ─────────────────────────────
  Studio.openColorPicker = function (anchor, o) {
    let hsv = hexToHsv(o.get());
    let lastHex = norm(o.get());

    return UI.popover(anchor, {
      title: o.label || 'Colour',
      className: 'color-pop',
      width: 268,
      build(body) {
        const sv = h('div', { class: 'cp-sv', role: 'slider', tabindex: '0', 'aria-label': 'Saturation and brightness', 'aria-valuemin': '0', 'aria-valuemax': '100', 'data-initial-focus': '' }, h('i', { class: 'cp-thumb' }));
        const thumb = sv.firstChild;
        const hue = h('input', { type: 'range', class: 'cp-hue', min: 0, max: 360, step: 1, 'aria-label': 'Hue' });
        const hex = h('input', { type: 'text', class: 'hex', maxlength: 9, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Hex value' });
        const chip = h('span', { class: 'cp-chip', 'aria-hidden': 'true' });
        const row = h('div', { class: 'cp-row' }, chip, hex);
        if (window.EyeDropper) {
          const drop = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Pick a colour from the screen', 'data-tip': 'Eyedropper' }, UI.icon('eyedropper'));
          drop.addEventListener('click', async () => {
            try {
              const res = await new window.EyeDropper().open();
              if (res && TM.color.isHex(res.sRGBHex)) { hsv = hexToHsv(res.sRGBHex); commit(true); }
            } catch (e) { /* cancelled */ }
          });
          row.append(drop);
        }

        function paint() {
          const hx = hsvToHex(hsv.h, hsv.s, hsv.v);
          sv.style.setProperty('--hue', hsvToHex(hsv.h, 1, 1));
          thumb.style.left = (hsv.s * 100).toFixed(2) + '%';
          thumb.style.top = ((1 - hsv.v) * 100).toFixed(2) + '%';
          thumb.style.background = hx;
          sv.setAttribute('aria-valuenow', String(Math.round(hsv.s * 100)));
          sv.setAttribute('aria-valuetext', `saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`);
          hue.value = String(Math.round(hsv.h));
          chip.style.background = hx;
          if (document.activeElement !== hex) hex.value = hx;
          body.querySelectorAll('.cp-sw').forEach((b) => b.classList.toggle('on', b.dataset.c === hx));
        }
        function commit(final) {
          lastHex = hsvToHex(hsv.h, hsv.s, hsv.v);
          o.set(lastHex, final);
          paint();
          if (final) recent.push(lastHex);
        }

        sv.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          sv.focus({ preventScroll: true });
          sv.setPointerCapture(e.pointerId);
          const rect = sv.getBoundingClientRect();
          const move = (ev) => {
            hsv.s = clamp((ev.clientX - rect.left) / rect.width);
            hsv.v = 1 - clamp((ev.clientY - rect.top) / rect.height);
            commit(false);
          };
          const up = () => {
            sv.removeEventListener('pointermove', move);
            sv.removeEventListener('pointerup', up);
            sv.removeEventListener('pointercancel', up);
            commit(true);
          };
          sv.addEventListener('pointermove', move);
          sv.addEventListener('pointerup', up);
          sv.addEventListener('pointercancel', up);
          move(e);
        });
        sv.addEventListener('keydown', (e) => {
          const step = e.shiftKey ? 0.1 : 0.01;
          const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
          if (!d) return;
          e.preventDefault();
          e.stopPropagation();
          hsv.s = clamp(hsv.s + d[0]);
          hsv.v = clamp(hsv.v + d[1]);
          commit(true);
        });
        hue.addEventListener('input', () => { hsv.h = +hue.value; commit(false); });
        hue.addEventListener('change', () => { hsv.h = +hue.value; commit(true); });
        hue.addEventListener('keydown', (e) => e.stopPropagation());
        hex.addEventListener('focus', () => hex.select());
        hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hex.blur(); } });
        hex.addEventListener('change', () => {
          let v = hex.value.trim();
          if (!v.startsWith('#')) v = '#' + v;
          if (TM.color.isHex(v)) { hsv = hexToHsv(v); commit(true); } else paint();
        });

        function swatchRow(title, colors, extra) {
          if (!colors.length && !extra) return null;
          const wrap = h('div', { class: 'cp-swatches', role: 'group', 'aria-label': title });
          colors.forEach((c) => {
            const b = h('button', { type: 'button', class: 'cp-sw', 'data-c': norm(c), 'aria-label': 'Use ' + c, 'data-tip': c });
            b.style.background = c;
            b.addEventListener('click', () => { hsv = hexToHsv(c); commit(true); });
            wrap.append(b);
          });
          if (extra) wrap.append(extra);
          return h('div', { class: 'cp-group' }, h('div', { class: 'cp-label' }, title), wrap);
        }
        const kit = brand.get();
        const addBrand = h('button', { type: 'button', class: 'cp-sw add', 'aria-label': 'Add this colour to your brand kit', 'data-tip': 'Add to brand kit' }, UI.icon('plus'));
        addBrand.addEventListener('click', () => {
          const cur = brand.get() || { bg: norm(Studio.store ? Studio.store.scene.bg.color : '#000000'), colors: [], font: null };
          const v = hsvToHex(hsv.h, hsv.s, hsv.v);
          if (!cur.colors.includes(v)) cur.colors = cur.colors.concat(v).slice(-8);
          brand.save(cur);
          Studio.toast('Added ' + v + ' to your brand kit');
          const fresh = swatchRow('Brand kit', cur.colors, addBrand);
          const old = body.querySelector('.cp-brand');
          if (old && fresh) { fresh.classList.add('cp-brand'); old.replaceWith(fresh); }
          paint();
        });
        const brandRow = swatchRow('Brand kit', kit ? kit.colors : [], addBrand);
        if (brandRow) brandRow.classList.add('cp-brand');

        body.append(...[sv, hue, row, brandRow, swatchRow('In this scene', sceneColors()), swatchRow('Recent', recent.list())].filter(Boolean));
        paint();
      },
    });
  };
})(window.TM);
