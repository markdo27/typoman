/* TYPOMAN studio — first-run tour and the keyboard shortcuts sheet.
 *
 *   TM.Studio.onboarding.maybeStart()   show the three-step tour once (remembered in storage)
 *   TM.Studio.onboarding.start()        replay it
 *   TM.Studio.showShortcuts()           the "?" sheet
 *   TM.Studio.SHORTCUTS                 the shortcut table (also used for tooltips)
 *
 * Coach marks sit inside the studio panels, never over the artboard.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const h = Studio.h;
  const UI = Studio.ui;
  const KEY = 'typoman.onboarded.v1';

  const K = (s) => UI.keys(s);
  Studio.SHORTCUTS = [
    ['Playback', [
      ['Space', 'Play / pause'],
      ['← →', 'Previous / next frame'],
      [K('Shift') + ' ← →', 'Jump 10 frames'],
      ['Home  End', 'First / last frame'],
    ]],
    ['Edit', [
      [K('Mod+Z'), 'Undo'],
      [K('Mod+Shift+Z'), 'Redo'],
      ['R', 'Remix the look'],
      ['P', 'Edit the path (path looks)'],
      ['N', 'New text layer'],
      [K('Mod+D'), 'Duplicate layer'],
      ['[  ]', 'Select layer below / above'],
      ['Arrows', 'Nudge text (artboard focused)'],
    ]],
    ['View', [
      ['F', 'Clean preview'],
      ['G', 'Safe-area guides'],
      [K('Shift+1'), 'Zoom to fit'],
      [K('Shift+0'), 'Zoom to 100%'],
      ['+  −', 'Zoom in / out'],
      ['/', 'Search presets'],
      ['?', 'This sheet'],
    ]],
    ['Output', [
      [K('Mod+E'), 'Export'],
      [K('Mod+S'), 'Check autosave'],
    ]],
  ];

  Studio.showShortcuts = function () {
    return UI.modal({
      title: 'Keyboard shortcuts',
      className: 'shortcuts',
      build(body, api) {
        const grid = h('div', { class: 'sc-grid' });
        Studio.SHORTCUTS.forEach(([group, rows]) => {
          grid.append(h('section', { class: 'sc-group' }, h('h3', null, group),
            h('dl', null, rows.map(([k, label]) => [h('dt', null, k.split('  ').map((part) => h('kbd', null, part))), h('dd', null, label)]))));
        });
        const replay = h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { api.close(); setTimeout(() => onboarding.start(), 200); } }, UI.icon('sparkle'), h('span', null, 'Replay the tour'));
        body.append(grid, h('div', { class: 'modal-foot' }, h('p', { class: 'hint' }, 'Tip: drag a slider’s label to scrub it, double-click the label to reset.'), replay));
      },
    });
  };

  // ───────────────────────────── tour ─────────────────────────────
  /** A screen without hover (phones, tablets): the copy says "tap" and skips keyboard tips. */
  const touch = () => !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
  const STEPS = [
    {
      target: () => (UI.isPhone() ? document.querySelector('.tabs [data-tab="presets"]') : document.querySelector('.presets-sec')),
      tab: 'presets',
      title: 'Pick a look',
      text: () => (touch()
        ? 'Every preset animates your own words. Tap a card to apply it; Undo takes you back.'
        : 'Every preset animates your own words. Hover a card to preview it, click to apply.'),
    },
    {
      target: () => (UI.isPhone() ? document.querySelector('.tabs [data-tab="edit"]') : document.querySelector('[data-panel="text"] .ctl-text')),
      tab: 'edit',
      title: 'Make it yours',
      text: 'Type your words, then tune font, colour and timing. Drag the text on the artboard to place it.',
    },
    {
      target: () => document.querySelector('#exportBtn'),
      title: 'Ship it',
      text: () => (UI.isPhone()
        ? 'Export an MP4 here. Embed codes and share links are in the ··· menu.'
        : touch() ? 'Export an MP4 or copy an embed for your site.' : 'Export an MP4 or copy an embed for your site. Press ? any time for shortcuts.'),
    },
  ];

  let active = null;

  function end(remember = true) {
    if (!active) return;
    active.card.remove();
    active.ring.remove();
    window.removeEventListener('resize', active.onResize);
    document.removeEventListener('keydown', active.onKey, true);
    active = null;
    if (remember) UI.storage.set(KEY, 1);
  }

  function place() {
    if (!active) return;
    const step = STEPS[active.i];
    const t = step.target();
    const { card, ring } = active;
    if (!t) { ring.hidden = true; return; }
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    ring.hidden = false;
    const rl = Math.max(4, r.left - 4), rt = Math.max(4, r.top - 4);
    const rr = Math.min(vw - 4, r.right + 4), rb = Math.min(vh - 4, r.bottom + 4);
    Object.assign(ring.style, { left: rl + 'px', top: rt + 'px', width: rr - rl + 'px', height: rb - rt + 'px' });
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let x, y;
    if (UI.isPhone()) {
      x = 12;
      const tabs = document.querySelector('.tabs');
      y = (tabs ? tabs.getBoundingClientRect().top : vh) - ch - 12;
    } else if (active.i === 0) {
      // Sit at the foot of the presets column so the first cards stay visible.
      const panel = document.querySelector('.panel.left').getBoundingClientRect();
      x = panel.left + 12;
      y = panel.bottom - ch - 16;
    } else if (active.i === 1) {
      const panel = document.querySelector('.panel.right').getBoundingClientRect();
      x = panel.right - cw - 12;
      y = Math.min(vh - ch - 16, r.bottom + 14);
    } else {
      x = Math.min(vw - cw - 12, r.right - cw);
      y = r.bottom + 14;
    }
    card.style.left = Math.max(8, Math.round(x)) + 'px';
    card.style.top = Math.max(8, Math.round(y)) + 'px';
  }

  function show(i) {
    if (!active) return;
    active.i = i;
    const step = STEPS[i];
    if (step.tab && Studio.app && UI.isPhone()) Studio.app.showTab(step.tab);
    const last = i === STEPS.length - 1;
    const next = h('button', { type: 'button', class: 'btn primary sm', onclick: () => (last ? end() : show(i + 1)) }, last ? 'Start creating' : 'Next');
    const skip = h('button', { type: 'button', class: 'btn ghost sm', onclick: () => end() }, last ? 'Close' : 'Skip tour');
    active.card.replaceChildren(
      h('div', { class: 'coach-step' }, h('span', null, String(i + 1).padStart(2, '0')), ' / ' + String(STEPS.length).padStart(2, '0')),
      h('h3', { id: 'coachTitle' }, step.title),
      h('p', { id: 'coachText' }, typeof step.text === 'function' ? step.text() : step.text),
      h('div', { class: 'coach-actions' }, skip, next));
    requestAnimationFrame(() => { place(); next.focus({ preventScroll: true }); });
  }

  const onboarding = {
    start() {
      end(false);
      const card = h('div', { class: 'coach', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'coachTitle', 'aria-describedby': 'coachText' });
      const ring = h('div', { class: 'coach-ring', 'aria-hidden': 'true' });
      document.body.append(ring, card);
      active = {
        i: 0, card, ring,
        onResize: () => place(),
        onKey: (e) => { if (e.key === 'Escape' && active) { e.stopPropagation(); end(); } },
      };
      window.addEventListener('resize', active.onResize);
      document.addEventListener('keydown', active.onKey, true);
      show(0);
    },
    maybeStart() {
      if (UI.storage.get(KEY, 0)) return;
      setTimeout(() => { if (!document.body.classList.contains('has-modal') && !UI.popoverOpen()) onboarding.start(); }, 900);
    },
    reposition: place,
    get active() { return !!active; },
  };
  Studio.onboarding = onboarding;
})(window.TM);
