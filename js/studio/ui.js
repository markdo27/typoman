/* TYPOMAN studio — UI primitives shared by every studio module.
 *
 *   TM.Studio.h(tag, attrs, ...children)    DOM helper (also used by other teams' panels)
 *   TM.Studio.ui.icon(name)                 inline SVG icon from the studio's icon set
 *   TM.Studio.ui.storage                    try/catch-wrapped localStorage (JSON values)
 *   TM.Studio.ui.popover(anchor, opts)      anchored popover; becomes a bottom sheet on phones
 *   TM.Studio.ui.menu(anchor, items)        keyboard-navigable menu
 *   TM.Studio.ui.modal(opts)                focus-trapped dialog
 *   TM.Studio.ui.announce(msg)              polite screen-reader announcement
 *   TM.Studio.ui.tip                        data-tip / data-kbd tooltips (event delegation)
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const UI = (Studio.ui = Studio.ui || {});

  // ───────────────────────────── DOM helper ─────────────────────────────
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  }
  Studio.h = h;

  // ───────────────────────────── icons ─────────────────────────────
  // 24×24 grid, 1.75 stroke, round caps. Filled glyphs set their own fill.
  const F = 'fill="currentColor" stroke="none"';
  const ICONS = {
    play: `<path ${F} d="M8 5.2v13.6a1 1 0 0 0 1.53.85l10.7-6.8a1 1 0 0 0 0-1.7L9.53 4.35A1 1 0 0 0 8 5.2z"/>`,
    pause: `<rect ${F} x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect ${F} x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/>`,
    stepBack: `<path d="M6 5.5v13"/><path ${F} d="M18.5 6.6v10.8a.8.8 0 0 1-1.25.66L9.6 12.66a.8.8 0 0 1 0-1.32l7.65-5.4a.8.8 0 0 1 1.25.66z"/>`,
    stepFwd: `<path d="M18 5.5v13"/><path ${F} d="M5.5 6.6v10.8a.8.8 0 0 0 1.25.66l7.65-5.4a.8.8 0 0 0 0-1.32L6.75 5.94a.8.8 0 0 0-1.25.66z"/>`,
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    dice: `<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle ${F} cx="8.6" cy="8.6" r="1.35"/><circle ${F} cx="15.4" cy="15.4" r="1.35"/><circle ${F} cx="15.4" cy="8.6" r="1.35"/><circle ${F} cx="8.6" cy="15.4" r="1.35"/><circle ${F} cx="12" cy="12" r="1.35"/>`,
    guides: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="6.5" y="8.2" width="11" height="7.6" rx="1" stroke-dasharray="2 2.2"/>',
    preview: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
    code: '<path d="m8.5 7-5 5 5 5"/><path d="m15.5 7 5 5-5 5"/>',
    download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    upload: '<path d="M12 16V5"/><path d="m7 10 5-5 5 5"/><path d="M5 20h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    duplicate: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8.5V6A2 2 0 0 0 13.5 4H6A2 2 0 0 0 4 6v7.5a2 2 0 0 0 2 2h2.5"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="m6 7 .9 11.6A2 2 0 0 0 8.9 20.5h6.2a2 2 0 0 0 2-1.9L18 7"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    eyeOff: '<path d="m3.5 3.5 17 17"/><path d="M10.5 5.6c.5-.07 1-.1 1.5-.1 6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.7M6.6 6.6C4 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.45 4.2-1.1"/><path d="M9.9 9.9a2.9 2.9 0 0 0 4.2 4.2"/>',
    grip: `<circle ${F} cx="9" cy="6.5" r="1.4"/><circle ${F} cx="15" cy="6.5" r="1.4"/><circle ${F} cx="9" cy="12" r="1.4"/><circle ${F} cx="15" cy="12" r="1.4"/><circle ${F} cx="9" cy="17.5" r="1.4"/><circle ${F} cx="15" cy="17.5" r="1.4"/>`,
    chevronDown: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
    chevronRight: '<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>',
    close: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.4a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.8"/><path d="M12 17.2h.01"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.2"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/>',
    layers: '<path d="m12 3.5 8.5 4.75L12 13 3.5 8.25 12 3.5z"/><path d="m3.5 12.5 8.5 4.75 8.5-4.75"/><path d="m3.5 16.5 8.5 4.75 8.5-4.75" opacity=".55"/>',
    sliders: '<path d="M4 7h9.5M18.5 7H20M4 17h3.5M12.5 17H20"/><circle cx="16" cy="7" r="2.3"/><circle cx="10" cy="17" r="2.3"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
    alignLeft: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
    alignCenter: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
    alignRight: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    pen: '<path d="M3.5 18c3.5 0 4.5-10 8.5-10s5 10 8.5 10"/><path d="M7.5 8h9"/><circle cx="12" cy="8" r="2" fill="var(--panel, #111)"/><circle cx="7.5" cy="8" r="1.1"/><circle cx="16.5" cy="8" r="1.1"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    unlock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.7"/>',
    arrowUp: '<path d="M12 19V5.5M6.5 11 12 5.5l5.5 5.5"/>',
    arrowDown: '<path d="M12 5v13.5M6.5 13l5.5 5.5 5.5-5.5"/>',
    eyedropper: '<path d="m13.5 7.5 3 3"/><path d="M19.6 4.4a2.1 2.1 0 0 1 0 3l-2.1 2.1-3-3 2.1-2.1a2.1 2.1 0 0 1 3 0z"/><path d="m15 9-8.6 8.6-.9 2.9 2.9-.9L17 11"/>',
    more: `<circle ${F} cx="5.5" cy="12" r="1.6"/><circle ${F} cx="12" cy="12" r="1.6"/><circle ${F} cx="18.5" cy="12" r="1.6"/>`,
    file: '<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z"/><path d="M14 3.5V8h4.5"/>',
    folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2h7.2a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
    warning: '<path d="M12 4.2 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.2M12 7.8h.01"/>',
    move: '<path d="M12 3.5v17M3.5 12h17"/><path d="m9.2 6.3 2.8-2.8 2.8 2.8M9.2 17.7l2.8 2.8 2.8-2.8M6.3 9.2 3.5 12l2.8 2.8M17.7 9.2l2.8 2.8-2.8 2.8"/>',
    frame: '<rect x="3" y="6" width="18" height="12" rx="2"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3A4 4 0 0 0 13 5.34l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3A4 4 0 0 0 11 18.66l1-1"/>',
    sparkle: '<path d="M12 3.5c.6 4.4 2.1 5.9 6.5 6.5-4.4.6-5.9 2.1-6.5 6.5-.6-4.4-2.1-5.9-6.5-6.5 4.4-.6 5.9-2.1 6.5-6.5z"/><path d="M18.5 15.5c.25 1.6.9 2.25 2.5 2.5-1.6.25-2.25.9-2.5 2.5-.25-1.6-.9-2.25-2.5-2.5 1.6-.25 2.25-.9 2.5-2.5z"/>',
    target: '<circle cx="12" cy="12" r="8"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
    fit: '<path d="M8 4.5H5.5a1 1 0 0 0-1 1V8M16 4.5h2.5a1 1 0 0 1 1 1V8M19.5 16v2.5a1 1 0 0 1-1 1H16M8 19.5H5.5a1 1 0 0 1-1-1V16"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
    type: '<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>',
    font: '<path d="M3.5 18.5 8.6 5.5h.8l5.1 13M5.4 14h7.2"/><path d="M20.5 18.5V12a2.6 2.6 0 0 0-5 0"/><path d="M20.5 15.5c-2.8-.6-5 .1-5 1.6 0 1.8 3.4 1.9 5-.4"/>',
    curve: '<path d="M4 19.5C9 19.5 9.5 4.5 20 4.5"/><circle cx="4" cy="19.5" r="1.4"/><circle cx="20" cy="4.5" r="1.4"/>',
  };
  function icon(name, cls) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    if (cls) s.setAttribute('class', cls);
    s.innerHTML = ICONS[name] || '';
    return s;
  }

  // ───────────────────────────── environment ─────────────────────────────
  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
  const reduced = mq('(prefers-reduced-motion: reduce)');
  const phone = mq('(max-width: 859px)');
  const isMac = /Mac|iPhone|iPad/.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '');
  UI.reducedMotion = () => reduced.matches;
  UI.isPhone = () => phone.matches;
  UI.onPhoneChange = (fn) => phone.addEventListener && phone.addEventListener('change', fn);
  UI.isMac = isMac;
  /** Platform modifier label: ⌘ on Apple, Ctrl elsewhere. */
  UI.mod = isMac ? '⌘' : 'Ctrl';
  /** Format a shortcut like "Mod+Shift+Z" for the current platform. */
  UI.keys = (combo) => combo.split('+').map((k) => (k === 'Mod' ? UI.mod : k === 'Shift' ? (isMac ? '⇧' : 'Shift') : k === 'Alt' ? (isMac ? '⌥' : 'Alt') : k)).join(isMac ? '' : '+');

  // ───────────────────────────── storage ─────────────────────────────
  UI.storage = {
    get(key, fallback = null) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove(key) {
      try { window.localStorage.removeItem(key); } catch (e) { /* storage blocked */ }
    },
  };

  // ───────────────────────────── announcements ─────────────────────────────
  let liveTimer = 0;
  UI.announce = function (msg) {
    let live = document.getElementById('srLive');
    if (!live) { live = h('div', { id: 'srLive', class: 'sr-only', 'aria-live': 'polite' }); document.body.append(live); }
    clearTimeout(liveTimer);
    live.textContent = '';
    liveTimer = setTimeout(() => { live.textContent = msg; }, 30);
  };

  // ───────────────────────────── focus helpers ─────────────────────────────
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  UI.focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);

  // ───────────────────────────── popover ─────────────────────────────
  let openPop = null;
  UI.closePopover = () => openPop && openPop.close('replaced');
  UI.popoverOpen = () => !!openPop;

  /**
   * Open a popover anchored to `anchor`.
   * opts: { title, label, className, width, role, within (Element to stay inside), build(body, api),
   *         onClose(reason), returnFocus(): Element, placement: 'below' | 'above' }
   * Desktop: floats next to the anchor and stays inside `within` (default: the anchor's panel),
   * so it never covers the artboard. Phones: a bottom sheet over the panel area.
   */
  UI.popover = function (anchor, opts = {}) {
    if (openPop) openPop.close('replaced');
    const sheet = UI.isPhone();
    const el = h('div', {
      class: 'pop' + (sheet ? ' as-sheet' : '') + (opts.className ? ' ' + opts.className : ''),
      role: opts.role || 'dialog',
      'aria-label': opts.label || opts.title || null,
      tabindex: '-1',
    });
    const api = { el, anchor, closed: false, close, reposition: position };
    if (opts.title) {
      el.append(h('div', { class: 'pop-head' },
        h('span', { class: 'pop-title' }, opts.title),
        opts.headExtra || null,
        h('button', { type: 'button', class: 'icon-btn sm pop-x', 'aria-label': 'Close', onclick: () => close('button') }, icon('close'))));
    }
    const body = h('div', { class: 'pop-body' });
    el.append(body);
    api.body = body;
    if (sheet) {
      api.backdrop = h('div', { class: 'pop-backdrop', onpointerdown: (e) => { e.preventDefault(); close('outside'); } });
      document.body.append(api.backdrop);
    }
    document.body.append(el);
    if (anchor) anchor.setAttribute('aria-expanded', 'true');
    try { if (opts.build) opts.build(body, api); } catch (e) { console.error('[studio] popover', e); }
    position();
    requestAnimationFrame(() => el.classList.add('in'));

    function position() {
      if (api.closed || sheet) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      const container = (opts.within || (anchor && anchor.closest('.panel')) || document.body).getBoundingClientRect();
      const a = anchor ? anchor.getBoundingClientRect() : { left: vw / 2, right: vw / 2, top: vh / 3, bottom: vh / 3, width: 0 };
      let width = Math.min(opts.width || 300, vw - 16);
      const room = container.width - 16;
      if (room >= 240 && width > room) width = room;
      el.style.width = width + 'px';
      el.style.maxHeight = '';
      const ph = el.offsetHeight;
      let left = a.right - width;
      if (container.width >= width + 16) left = Math.min(Math.max(left, container.left + 8), container.right - width - 8);
      left = Math.min(Math.max(8, left), vw - width - 8);
      const below = vh - a.bottom - 10, above = a.top - 10;
      let top;
      if (opts.placement !== 'above' && (ph <= below || below >= above)) {
        top = a.bottom + 6;
        if (ph > below) el.style.maxHeight = Math.max(160, below) + 'px';
      } else {
        const hgt = Math.min(ph, above);
        if (ph > above) el.style.maxHeight = Math.max(160, above) + 'px';
        top = a.top - 6 - hgt;
      }
      el.style.left = Math.round(left) + 'px';
      el.style.top = Math.round(Math.max(8, top)) + 'px';
    }

    const onDown = (e) => {
      if (el.contains(e.target) || (anchor && anchor.contains(e.target))) return;
      if (e.target.closest && e.target.closest('.pop, .modal-wrap, .tip')) return;
      close('outside');
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close('escape'); }
    };
    const onResize = () => position();
    const onScroll = (e) => { if (!el.contains(e.target)) position(); };
    document.addEventListener('pointerdown', onDown, true);
    el.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    document.addEventListener('scroll', onScroll, true);

    requestAnimationFrame(() => {
      if (api.closed) return;
      const first = el.querySelector('[autofocus]') || el.querySelector('[data-initial-focus]') || el;
      first.focus({ preventScroll: true });
    });

    function close(reason) {
      if (api.closed) return;
      api.closed = true;
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('scroll', onScroll, true);
      if (anchor) anchor.setAttribute('aria-expanded', 'false');
      const hadFocus = el.contains(document.activeElement);
      el.classList.remove('in');
      el.classList.add('out');
      if (api.backdrop) api.backdrop.remove();
      setTimeout(() => el.remove(), UI.reducedMotion() ? 0 : 140);
      if (openPop === api) openPop = null;
      try { if (opts.onClose) opts.onClose(reason); } catch (e) { console.error(e); }
      if (reason !== 'outside' && reason !== 'replaced' && (hadFocus || reason === 'escape')) {
        const target = (opts.returnFocus && opts.returnFocus()) || anchor;
        if (target && document.contains(target)) target.focus({ preventScroll: true });
      }
    }
    openPop = api;
    return api;
  };

  // ───────────────────────────── menu ─────────────────────────────
  /**
   * items: [{ label, icon?, kbd?, checked?, disabled?, danger?, hint?, run() } | '-' (separator) | { heading }]
   * Checkable items stay open after toggling so several can be flipped in a row.
   */
  UI.menu = function (anchor, items, opts = {}) {
    return UI.popover(anchor, {
      role: 'menu',
      label: opts.label || 'Menu',
      className: 'menu',
      width: opts.width || 236,
      within: document.body,
      build(body, api) {
        const buttons = [];
        items.forEach((it) => {
          if (it === '-') { body.append(h('div', { class: 'menu-sep', role: 'separator' })); return; }
          if (it.heading) { body.append(h('div', { class: 'menu-heading' }, it.heading)); return; }
          const checkable = typeof it.checked === 'boolean';
          const b = h('button', {
            type: 'button',
            class: 'menu-item' + (it.danger ? ' danger' : ''),
            role: checkable ? 'menuitemcheckbox' : 'menuitem',
            'aria-checked': checkable ? String(it.checked) : null,
            disabled: it.disabled || null,
            tabindex: '-1',
          },
          h('span', { class: 'menu-ic' }, checkable ? icon(it.checked ? 'check' : '') : it.icon ? icon(it.icon) : null),
          h('span', { class: 'menu-label' }, it.label, it.hint ? h('small', null, it.hint) : null),
          it.kbd ? h('kbd', null, it.kbd) : null);
          b.addEventListener('click', () => {
            if (checkable) {
              it.checked = !it.checked;
              b.setAttribute('aria-checked', String(it.checked));
              b.querySelector('.menu-ic').replaceChildren(icon(it.checked ? 'check' : ''));
              it.run && it.run(it.checked);
              return;
            }
            api.close('select');
            it.run && it.run();
          });
          buttons.push(b);
          body.append(b);
        });
        const enabled = () => buttons.filter((b) => !b.disabled);
        body.addEventListener('keydown', (e) => {
          const list = enabled();
          const i = list.indexOf(document.activeElement);
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const n = list.length;
            list[(i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n].focus();
          } else if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            (e.key === 'Home' ? list[0] : list[list.length - 1]).focus();
          } else if (e.key === 'Tab') {
            api.close('tab');
          }
        });
        requestAnimationFrame(() => { const l = enabled(); if (l[0]) l[0].focus(); });
      },
    });
  };

  // ───────────────────────────── modal ─────────────────────────────
  /** opts: { title, className, build(body, api), onClose, label } → { el, close } */
  UI.modal = function (opts = {}) {
    UI.closePopover();
    const prev = document.activeElement;
    const titleId = 'm' + Math.random().toString(36).slice(2, 8);
    const dialog = h('div', { class: 'modal' + (opts.className ? ' ' + opts.className : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': opts.title ? titleId : null, 'aria-label': opts.title ? null : opts.label, tabindex: '-1' });
    const wrap = h('div', { class: 'modal-wrap' }, dialog);
    const api = { el: dialog, close };
    if (opts.title) {
      dialog.append(h('div', { class: 'modal-head' },
        h('h2', { id: titleId }, opts.title),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => close() }, icon('close'))));
    }
    const body = h('div', { class: 'modal-body' });
    dialog.append(body);
    if (opts.build) opts.build(body, api);
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'Tab') {
        const f = UI.focusables(dialog);
        if (!f.length) { e.preventDefault(); return; }
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      e.stopPropagation(); // the studio's global shortcuts stay quiet while a dialog is open
    });
    document.body.append(wrap);
    document.body.classList.add('has-modal');
    requestAnimationFrame(() => { wrap.classList.add('in'); (dialog.querySelector('[autofocus]') || dialog).focus(); });
    function close() {
      if (api.closed) return;
      api.closed = true;
      wrap.classList.remove('in');
      setTimeout(() => wrap.remove(), UI.reducedMotion() ? 0 : 160);
      document.body.classList.remove('has-modal');
      if (opts.onClose) opts.onClose();
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    }
    return api;
  };

  // ───────────────────────────── tooltips ─────────────────────────────
  // Any element with data-tip="Label" (and optional data-kbd="R") gets a styled tooltip on
  // hover (after a short delay) and on keyboard focus. Screen readers use aria-label instead.
  const tip = { el: null, target: null, timer: 0 };
  function showTip(target) {
    const text = target.getAttribute('data-tip');
    if (!text || target.disabled && !target.hasAttribute('data-tip-disabled')) return;
    if (!tip.el) { tip.el = h('div', { class: 'tip', role: 'presentation' }); document.body.append(tip.el); }
    const kbd = target.getAttribute('data-kbd');
    tip.el.replaceChildren(h('span', null, text), kbd ? h('kbd', null, kbd) : null);
    tip.target = target;
    tip.el.style.left = '-999px';
    tip.el.classList.add('on');
    const r = target.getBoundingClientRect(), t = tip.el.getBoundingClientRect();
    let x = r.left + r.width / 2 - t.width / 2;
    let y = r.bottom + 8;
    if (y + t.height > window.innerHeight - 6) y = r.top - t.height - 8;
    x = Math.max(6, Math.min(window.innerWidth - t.width - 6, x));
    tip.el.style.left = Math.round(x) + 'px';
    tip.el.style.top = Math.round(y) + 'px';
  }
  function hideTip() {
    clearTimeout(tip.timer);
    tip.target = null;
    if (tip.el) tip.el.classList.remove('on');
  }
  UI.tip = { hide: hideTip };
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t || t === tip.target) return;
    hideTip();
    tip.timer = setTimeout(() => showTip(t), 420);
  });
  document.addEventListener('pointerout', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t && (!e.relatedTarget || !t.contains(e.relatedTarget))) hideTip();
  });
  document.addEventListener('pointerdown', hideTip, true);
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    hideTip();
    if (t && t.matches(':focus-visible')) tip.timer = setTimeout(() => showTip(t), 150);
  });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); }, true);

  // ───────────────────────────── formatting ─────────────────────────────
  /** "SS:FF" (or "M:SS:FF" past a minute) for loop time t at fps. */
  UI.timecode = function (t, fps) {
    const total = Math.max(0, Math.round(t * fps));
    const f = total % fps, s = Math.floor(total / fps) % 60, m = Math.floor(total / fps / 60);
    const pad = (v) => String(v).padStart(2, '0');
    return (m ? m + ':' : '') + pad(s) + ':' + pad(f);
  };
  UI.plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');

  /** Run fn at most once per animation frame. */
  UI.rafThrottle = function (fn) {
    let queued = false, args = null;
    return function (...a) {
      args = a;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; fn(...args); });
    };
  };

  UI.icon = icon;
  UI.ICONS = ICONS;
})(window.TM);
