/* TYPOMAN studio — control factories.
 * Every control: { el, update() } where update() re-reads its getter (after undo, preset
 * switch, etc.). Controls never read the store directly; they get/set through closures.
 *
 *   range({ label, min, max, step, get, set, hint, decimals, format, default, unit })
 *   select({ label, options, get, set })            options: [[value, label]] or [[group, [[v, l]]]]
 *   segmented({ label, options, get, set })         options: [[value, label, title?, icon?]]
 *   toggle({ label, get, set })
 *   color({ label, get, set })                      opens the studio colour picker
 *   textarea({ label, rows, max, placeholder, get, set })
 *   ease({ label, get, set })                       opens the easing-curve editor
 *   font({ label, get, set, preview?, cancel? })    opens the font picker
 *   section(title, { collapsed, badge, index })     → { el, body, head }
 *   button({ label, icon, onClick, kind, title })
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const h = Studio.h;
  const UI = Studio.ui;
  let uid = 0;

  function decimals(step) {
    const s = String(step);
    return s.includes('.') ? s.split('.')[1].length : 0;
  }

  /** Slider + numeric field. Drag the label to scrub (Shift = fine), double-click it to reset. */
  function range(o) {
    const id = 'c' + ++uid;
    const dp = o.decimals != null ? o.decimals : decimals(o.step || 1);
    const unit = o.unit || '';
    const fmt = o.format || ((v) => (+v).toFixed(dp) + unit);
    const hasDefault = o.default != null && Number.isFinite(+o.default);
    const input = h('input', { type: 'range', id, min: o.min, max: o.max, step: o.step || 'any', 'aria-label': o.label });
    const num = h('input', { type: 'text', class: 'num', inputmode: 'decimal', 'aria-label': o.label + ' value', spellcheck: 'false', autocomplete: 'off' });
    const tipText = [o.hint, 'Drag to scrub · Shift for fine', hasDefault ? 'Double-click to reset' : null].filter(Boolean).join(' · ');
    const label = h('label', { class: 'scrub', for: id, title: tipText }, o.label);
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
    num.addEventListener('focus', () => num.select());
    num.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const step = (+o.step || 0.01) * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
        commit(+o.get() + (e.key === 'ArrowUp' ? step : -step), true);
        num.value = fmt(+o.get());
        num.select();
      } else if (e.key === 'Enter') {
        num.blur();
      } else if (e.key === 'Escape') {
        num.value = fmt(+o.get());
        num.blur();
        e.stopPropagation();
      }
    });
    if (hasDefault) {
      label.addEventListener('dblclick', (e) => { e.preventDefault(); commit(+o.default, true); });
    }
    // Label scrubbing (starts after a few pixels so plain clicks still focus the slider).
    label.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const startX = e.clientX, startV = +o.get();
      const span = o.max - o.min;
      let active = false;
      label.setPointerCapture(e.pointerId);
      const move = (ev) => {
        if (!active && Math.abs(ev.clientX - startX) < 3) return;
        if (!active) { active = true; label.classList.add('scrubbing'); document.body.classList.add('scrubbing'); }
        const k = ev.shiftKey ? 0.1 : 1;
        commit(startV + ((ev.clientX - startX) / 220) * span * k, false);
      };
      const up = () => {
        label.classList.remove('scrubbing');
        document.body.classList.remove('scrubbing');
        label.removeEventListener('pointermove', move);
        label.removeEventListener('pointerup', up);
        label.removeEventListener('pointercancel', up);
        if (active) o.set(snap(+o.get()), true);
      };
      label.addEventListener('pointermove', move);
      label.addEventListener('pointerup', up);
      label.addEventListener('pointercancel', up);
    });
    function update() {
      const v = +o.get();
      input.value = v;
      if (document.activeElement !== num) num.value = fmt(v);
      const pct = ((v - o.min) / (o.max - o.min)) * 100;
      input.style.setProperty('--pct', Math.max(0, Math.min(100, pct)) + '%');
      input.setAttribute('aria-valuetext', fmt(v));
    }
    update();
    return { el, update, input };
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
    const el = h('div', { class: 'ctl ctl-select' }, h('label', { for: id }, o.label), h('div', { class: 'select-wrap' }, sel, UI.icon('chevronDown', 'select-caret')));
    const update = () => { sel.value = String(o.get()); };
    update();
    return { el, update, refill: () => { fill(); update(); } };
  }

  /** Radio-style segmented control: one tab stop, arrow keys move the selection. */
  function segmented(o) {
    const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': o.label });
    const buttons = o.options.map(([v, l, title, ic]) =>
      h('button', { type: 'button', role: 'radio', 'data-v': v, 'aria-label': ic ? title || l : null, 'data-tip': title && title !== l ? title : null, tabindex: '-1', onclick: () => { o.set(v, true); update(); } }, ic ? UI.icon(ic) : l));
    group.append(...buttons);
    group.addEventListener('keydown', (e) => {
      const keys = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
      if (!(e.key in keys) && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      e.stopPropagation();
      const i = buttons.indexOf(document.activeElement);
      const n = buttons.length;
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (Math.max(0, i) + keys[e.key] + n) % n;
      buttons[j].focus();
      buttons[j].click();
    });
    const el = h('div', { class: 'ctl ctl-seg' }, o.label ? h('span', { class: 'lbl' }, o.label) : null, group);
    function update() {
      const cur = String(o.get());
      let any = false;
      buttons.forEach((b) => {
        const on = b.dataset.v === cur;
        any = any || on;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      if (!any && buttons[0]) buttons[0].tabIndex = 0;
    }
    update();
    return { el, update };
  }

  function toggle(o) {
    const id = 'c' + ++uid;
    const box = h('input', { type: 'checkbox', id, role: 'switch' });
    box.addEventListener('change', () => o.set(box.checked, true));
    const el = h('div', { class: 'ctl ctl-toggle' }, h('label', { for: id }, o.label), box);
    const update = () => { box.checked = !!o.get(); box.setAttribute('aria-checked', String(box.checked)); };
    update();
    return { el, update };
  }

  const expandHex = (v) => (v.length === 4 ? '#' + v.slice(1).split('').map((c) => c + c).join('') : v.slice(0, 7));

  /** Swatch (opens the studio colour picker) + hex field. */
  function color(o) {
    const id = 'c' + ++uid;
    const chip = h('i');
    const swatch = h('button', { type: 'button', class: 'swatch', id, 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, chip);
    const native = h('input', { type: 'color', class: 'native-color', tabindex: '-1', 'aria-hidden': 'true' });
    const hex = h('input', { type: 'text', class: 'hex', maxlength: 9, spellcheck: 'false', autocomplete: 'off', 'aria-label': (o.label || 'Colour') + ' hex value' });
    native.addEventListener('input', () => { o.set(native.value, false); update(); });
    native.addEventListener('change', () => { o.set(native.value, true); update(); });
    swatch.addEventListener('click', () => {
      if (Studio.openColorPicker) Studio.openColorPicker(swatch, { label: o.label || 'Colour', get: o.get, set: (v, final) => { o.set(v, final); update(); } });
      else native.click();
    });
    hex.addEventListener('change', () => {
      let v = hex.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (TM.color.isHex(v)) o.set(v.toLowerCase(), true);
      update();
    });
    hex.addEventListener('focus', () => hex.select());
    hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') hex.blur(); });
    const el = h('div', { class: 'ctl ctl-color' }, o.label ? h('label', { for: id }, o.label) : null, h('div', { class: 'color-pair' }, swatch, hex, native));
    function update() {
      const v = o.get();
      chip.style.background = v;
      native.value = expandHex(v);
      swatch.setAttribute('aria-label', (o.label || 'Colour') + ' ' + v + ': open colour picker');
      if (document.activeElement !== hex) hex.value = v;
    }
    update();
    return { el, update };
  }

  /** Multi-line text with auto-grow and a visible character budget (never truncates silently). */
  function textarea(o) {
    const id = 'c' + ++uid;
    const max = o.max || 400;
    const ta = h('textarea', { id, rows: o.rows || 2, spellcheck: 'false', maxlength: max, 'aria-label': o.label, placeholder: o.placeholder || '' });
    const count = h('span', { class: 'ta-count', 'aria-live': 'polite' });
    const grow = () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(220, ta.scrollHeight + 2) + 'px';
      const n = ta.value.length;
      count.textContent = n > max * 0.7 ? n + ' / ' + max : '';
      count.classList.toggle('warn', n >= max * 0.95);
    };
    ta.addEventListener('input', () => { o.set(ta.value, false); grow(); });
    ta.addEventListener('change', () => o.set(ta.value, true));
    const el = h('div', { class: 'ctl ctl-text' }, o.label ? h('label', { for: id }, o.label) : null, h('div', { class: 'ta-wrap' }, ta, count));
    const update = () => {
      if (document.activeElement !== ta) { ta.value = o.get(); grow(); }
    };
    update();
    requestAnimationFrame(grow);
    return { el, update, input: ta };
  }

  // ───────────────────────────── easing ─────────────────────────────
  const EASE_LABELS = new Map();
  (TM.EASING_GROUPS || []).forEach(([, list]) => list.forEach(([id, label]) => EASE_LABELS.set(id, label)));

  /** Human name for an easing spec. */
  function easeLabel(spec) {
    if (typeof spec === 'string') return EASE_LABELS.get(spec) || spec;
    if (Array.isArray(spec)) return 'Custom';
    return 'Smooth';
  }

  /** Draw an easing curve into a 2D context box (x, y, w, h) with room for overshoot. */
  function drawEaseCurve(ctx, spec, box, style = {}) {
    const fn = TM.ease(spec);
    const lo = style.lo != null ? style.lo : -0.3, hi = style.hi != null ? style.hi : 1.3;
    const X = (t) => box.x + t * box.w;
    const Y = (v) => box.y + box.h - ((v - lo) / (hi - lo)) * box.h;
    if (style.guide) {
      ctx.strokeStyle = style.guide;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(1), Y(0));
      ctx.moveTo(X(0), Y(1)); ctx.lineTo(X(1), Y(1));
      ctx.stroke();
    }
    ctx.strokeStyle = style.color || '#fff';
    ctx.lineWidth = style.width || 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const n = style.samples || 48;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = X(t), py = Y(fn(t));
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
  }

  function cssColor(el, prop, fallback) {
    const v = getComputedStyle(el).getPropertyValue(prop).trim();
    return v || fallback;
  }

  /** Easing picker: curve thumbnail + name; opens the curve editor (named curves or bézier). */
  function ease(o) {
    const id = 'c' + ++uid;
    if (!Studio.openCurveEditor) return easeSelect(o);
    const cv = h('canvas', { class: 'ease-thumb', width: 64, height: 40, 'aria-hidden': 'true' });
    const name = h('span', { class: 'ease-name' });
    const btn = h('button', { type: 'button', class: 'field-btn ease-btn', id, 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, cv, name, UI.icon('chevronDown', 'field-caret'));
    btn.addEventListener('click', () => Studio.openCurveEditor(btn, { label: o.label, get: o.get, set: (v, final) => { o.set(v, final); update(); } }));
    const el = h('div', { class: 'ctl ctl-ease' }, h('label', { for: id }, o.label), btn);
    function update() {
      const spec = o.get();
      name.textContent = easeLabel(spec);
      btn.setAttribute('aria-label', o.label + ': ' + easeLabel(spec) + '. Open curve editor');
      const ctx = cv.getContext('2d');
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.clearRect(0, 0, 32, 20);
      drawEaseCurve(ctx, spec, { x: 3, y: 2, w: 26, h: 16 }, { color: cssColor(btn, '--accent-fg', '#8c98ff'), width: 1.4, samples: 32 });
    }
    update();
    return { el, update };
  }

  /** Fallback easing control (grouped select + thumbnail) when the curve editor is absent. */
  function easeSelect(o) {
    const s = select({ label: o.label, options: TM.EASING_GROUPS, get: () => (Array.isArray(o.get()) ? 'smooth' : o.get()), set: o.set });
    const cv = h('canvas', { class: 'ease-preview', width: 56, height: 32, 'aria-hidden': 'true' });
    s.el.append(cv);
    const draw = () => {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, 56, 32);
      drawEaseCurve(ctx, o.get(), { x: 4, y: 4, w: 48, h: 24 }, { color: '#8c98ff' });
    };
    draw();
    return { el: s.el, update: () => { s.update(); draw(); } };
  }

  // ───────────────────────────── font ─────────────────────────────
  function fontMeta(f) {
    if (!f) return '';
    if (f.custom) return 'Custom';
    if (f.variable) return f.cat + ' · Variable';
    if (f.weights) return f.cat + ' · ' + f.weights.length + ' weights';
    return f.cat;
  }

  /** Font family picker: the name in its own face; opens the searchable font picker. */
  function font(o) {
    const id = 'c' + ++uid;
    if (!Studio.openFontPicker) {
      const options = () => TM.FONT_CATEGORIES.map((cat) => [cat, TM.FONTS.filter((f) => f.cat === cat).map((f) => [f.family, f.family + (f.variable ? '  ·  variable' : '')])]).filter((g) => g[1].length);
      return select({ label: o.label || 'Font', options, get: o.get, set: o.set });
    }
    const nameEl = h('span', { class: 'font-name' });
    const meta = h('span', { class: 'font-meta' });
    const btn = h('button', { type: 'button', class: 'field-btn font-btn', id, 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, h('span', { class: 'font-stack' }, nameEl, meta), UI.icon('chevronDown', 'field-caret'));
    btn.addEventListener('click', () => Studio.openFontPicker(btn, { get: o.get, set: o.set, preview: o.preview, cancel: o.cancel, returnFocus: () => document.getElementById(id) }));
    const el = h('div', { class: 'ctl ctl-font' }, h('label', { for: id }, o.label || 'Font'), btn);
    function update() {
      const fam = o.get();
      const f = TM.fonts.get(fam);
      nameEl.textContent = fam;
      nameEl.style.fontFamily = TM.fonts.cssFamily(fam);
      meta.textContent = fontMeta(f);
      btn.setAttribute('aria-label', (o.label || 'Font') + ': ' + fam + '. Open font picker');
    }
    update();
    return { el, update };
  }

  // ───────────────────────────── layout ─────────────────────────────
  function section(title, opts = {}) {
    const body = h('div', { class: 'sec-body' });
    const bodyId = 'sb' + ++uid;
    body.id = bodyId;
    const head = h('button', { type: 'button', class: 'sec-head', 'aria-expanded': opts.collapsed ? 'false' : 'true', 'aria-controls': bodyId },
      opts.index != null ? h('span', { class: 'sec-idx', 'aria-hidden': 'true' }, String(opts.index).padStart(2, '0')) : null,
      h('span', { class: 'sec-title' }, title), opts.badge ? h('span', { class: 'sec-badge' }, opts.badge) : null, h('span', { class: 'sec-chevron', 'aria-hidden': 'true' }));
    const el = h('section', { class: 'sec' + (opts.collapsed ? ' collapsed' : '') }, head, body);
    head.addEventListener('click', () => {
      const c = el.classList.toggle('collapsed');
      head.setAttribute('aria-expanded', c ? 'false' : 'true');
      if (opts.onToggle) opts.onToggle(c);
    });
    return { el, body, head };
  }

  function button(o) {
    const b = h('button', { type: 'button', class: 'btn ' + (o.kind || '') + (o.wide ? ' wide' : ''), 'data-tip': o.title || null, 'aria-label': o.ariaLabel || null, onclick: o.onClick }, o.icon ? UI.icon(o.icon) : null, o.label ? h('span', null, o.label) : null);
    return { el: b, update: o.update ? () => o.update(b) : () => {} };
  }

  Studio.easeLabel = easeLabel;
  Studio.drawEaseCurve = drawEaseCurve;
  Studio.fontMeta = fontMeta;
  Studio.controls = { range, select, segmented, toggle, color, textarea, ease, font, section, button };
})(window.TM);
