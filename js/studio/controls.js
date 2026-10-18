/* TYPOMAN studio — control factories.
 * Every control: { el, update() } where update() re-reads its getter (after undo, preset
 * switch, etc.). Controls never read the store directly; they get/set through closures.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  let uid = 0;

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  }

  function decimals(step) {
    const s = String(step);
    return s.includes('.') ? s.split('.')[1].length : 0;
  }

  /** Slider + numeric field; drag the label horizontally to scrub (Shift = fine). */
  function range(o) {
    const id = 'c' + ++uid;
    const dp = o.decimals != null ? o.decimals : decimals(o.step || 1);
    const fmt = o.format || ((v) => (+v).toFixed(dp));
    const input = h('input', { type: 'range', id, min: o.min, max: o.max, step: o.step || 'any', 'aria-label': o.label });
    const num = h('input', { type: 'text', class: 'num', inputmode: 'decimal', 'aria-label': o.label + ' value', spellcheck: 'false' });
    const label = h('label', { class: 'scrub', for: id, title: (o.hint ? o.hint + ' · ' : '') + 'Drag to scrub, Shift for fine' }, o.label);
    const el = h('div', { class: 'ctl ctl-range' }, label, input, num);
    const snap = (v) => {
      const step = +o.step || 0;
      let x = Math.min(+o.max, Math.max(+o.min, v));
      if (step) x = Math.round((x - o.min) / step) * step + +o.min;
      return +x.toFixed(Math.max(dp, 4));
    };
    const commit = (v, final) => { o.set(snap(v), final); update(); };
    input.addEventListener('input', () => commit(+input.value, false));
    input.addEventListener('change', () => commit(+input.value, true));
    num.addEventListener('change', () => {
      const v = parseFloat(num.value);
      if (Number.isFinite(v)) commit(v, true); else update();
    });
    num.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const step = (+o.step || 0.01) * (e.shiftKey ? 10 : 1);
        commit(+o.get() + (e.key === 'ArrowUp' ? step : -step), true);
      }
    });
    // Label scrubbing.
    label.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX, startV = +o.get();
      const span = o.max - o.min;
      label.setPointerCapture(e.pointerId);
      label.classList.add('scrubbing');
      const move = (ev) => {
        const k = ev.shiftKey ? 0.1 : 1;
        commit(startV + ((ev.clientX - startX) / 220) * span * k, false);
      };
      const up = () => {
        label.classList.remove('scrubbing');
        label.removeEventListener('pointermove', move);
        label.removeEventListener('pointerup', up);
        o.set(snap(+o.get()), true);
      };
      label.addEventListener('pointermove', move);
      label.addEventListener('pointerup', up);
    });
    function update() {
      const v = +o.get();
      input.value = v;
      if (document.activeElement !== num) num.value = fmt(v);
      const pct = ((v - o.min) / (o.max - o.min)) * 100;
      input.style.setProperty('--pct', Math.max(0, Math.min(100, pct)) + '%');
    }
    update();
    return { el, update };
  }

  function select(o) {
    const id = 'c' + ++uid;
    const sel = h('select', { id, 'aria-label': o.label });
    const fill = () => {
      sel.innerHTML = '';
      const opts = typeof o.options === 'function' ? o.options() : o.options;
      for (const item of opts) {
        if (Array.isArray(item[1])) {
          const g = h('optgroup', { label: item[0] });
          item[1].forEach(([v, l]) => g.append(h('option', { value: v }, l)));
          sel.append(g);
        } else sel.append(h('option', { value: item[0] }, item[1]));
      }
    };
    fill();
    sel.addEventListener('change', () => o.set(sel.value, true));
    const el = h('div', { class: 'ctl ctl-select' }, h('label', { for: id }, o.label), sel);
    const update = () => { sel.value = String(o.get()); };
    update();
    return { el, update, refill: () => { fill(); update(); } };
  }

  function segmented(o) {
    const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': o.label });
    const buttons = o.options.map(([v, l, title]) =>
      h('button', { type: 'button', role: 'radio', title: title || l, 'data-v': v, onclick: () => { o.set(v, true); update(); } }, l));
    group.append(...buttons);
    const el = h('div', { class: 'ctl ctl-seg' }, o.label ? h('span', { class: 'lbl' }, o.label) : null, group);
    function update() {
      const cur = String(o.get());
      buttons.forEach((b) => {
        const on = b.dataset.v === cur;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    }
    update();
    return { el, update };
  }

  function toggle(o) {
    const id = 'c' + ++uid;
    const box = h('input', { type: 'checkbox', id, role: 'switch' });
    box.addEventListener('change', () => o.set(box.checked, true));
    const el = h('div', { class: 'ctl ctl-toggle' }, h('label', { for: id }, o.label), box);
    const update = () => { box.checked = !!o.get(); };
    update();
    return { el, update };
  }

  function color(o) {
    const id = 'c' + ++uid;
    const pick = h('input', { type: 'color', id, 'aria-label': o.label });
    const hex = h('input', { type: 'text', class: 'hex', maxlength: 9, spellcheck: 'false', 'aria-label': o.label + ' hex' });
    pick.addEventListener('input', () => { o.set(pick.value, false); update(); });
    pick.addEventListener('change', () => { o.set(pick.value, true); update(); });
    hex.addEventListener('change', () => {
      let v = hex.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (TM.color.isHex(v)) o.set(v.toLowerCase(), true);
      update();
    });
    const el = h('div', { class: 'ctl ctl-color' }, o.label ? h('label', { for: id }, o.label) : null, h('div', { class: 'color-pair' }, pick, hex));
    function update() {
      const v = o.get();
      pick.value = v.length === 4 ? '#' + v.slice(1).split('').map((c) => c + c).join('') : v.slice(0, 7);
      if (document.activeElement !== hex) hex.value = v;
    }
    update();
    return { el, update };
  }

  function textarea(o) {
    const id = 'c' + ++uid;
    const ta = h('textarea', { id, rows: o.rows || 2, spellcheck: 'false', maxlength: o.max || 400, 'aria-label': o.label, placeholder: o.placeholder || '' });
    ta.addEventListener('input', () => o.set(ta.value, false));
    ta.addEventListener('change', () => o.set(ta.value, true));
    const el = h('div', { class: 'ctl ctl-text' }, o.label ? h('label', { for: id }, o.label) : null, ta);
    const update = () => { if (document.activeElement !== ta) ta.value = o.get(); };
    update();
    return { el, update, input: ta };
  }

  /** Easing picker: grouped select + live curve thumbnail. */
  function ease(o) {
    const s = select({ label: o.label, options: TM.EASING_GROUPS, get: () => (Array.isArray(o.get()) ? 'smooth' : o.get()), set: o.set });
    const cv = h('canvas', { class: 'ease-preview', width: 56, height: 32, 'aria-hidden': 'true' });
    s.el.append(cv);
    const draw = () => {
      const ctx = cv.getContext('2d');
      const fn = TM.ease(o.get());
      ctx.clearRect(0, 0, 56, 32);
      ctx.strokeStyle = getComputedStyle(cv).color || '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const x = i / 40, y = fn(x);
        const px = 4 + x * 48, py = 26 - y * 20;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    };
    draw();
    return { el: s.el, update: () => { s.update(); draw(); } };
  }

  /** Font family picker grouped by category (names rendered in their own face once loaded). */
  function font(o) {
    const options = () => TM.FONT_CATEGORIES.map((cat) => [cat, TM.FONTS.filter((f) => f.cat === cat).map((f) => [f.family, f.family + (f.variable ? '  ·  variable' : '')])]).filter((g) => g[1].length);
    return select({ label: o.label || 'Font', options, get: o.get, set: o.set });
  }

  function section(title, opts = {}) {
    const body = h('div', { class: 'sec-body' });
    const head = h('button', { type: 'button', class: 'sec-head', 'aria-expanded': opts.collapsed ? 'false' : 'true' },
      h('span', { class: 'sec-title' }, title), opts.badge ? h('span', { class: 'sec-badge' }, opts.badge) : null, h('span', { class: 'sec-chevron', 'aria-hidden': 'true' }));
    const el = h('section', { class: 'sec' + (opts.collapsed ? ' collapsed' : '') }, head, body);
    head.addEventListener('click', () => {
      const c = el.classList.toggle('collapsed');
      head.setAttribute('aria-expanded', c ? 'false' : 'true');
    });
    return { el, body };
  }

  Studio.h = h;
  Studio.controls = { range, select, segmented, toggle, color, textarea, ease, font, section };
})(window.TM);
