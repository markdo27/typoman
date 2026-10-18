/* TYPOMAN studio — Embed & share dialog: TM.Studio.openShare(store).
 *
 * Tabs: Embed (responsive iframe snippet with a live preview), Web component
 * (<typoman-player>), HTML file (self-contained download) and Links (remix + player). Options
 * (autoplay, loop, controls, transparent, fit) apply to the snippets, the player link, the
 * HTML file and the live preview, which runs the local embed.html.
 *
 * Public URLs: the site's own folder when the studio is served over http(s) from a public host;
 * otherwise (localhost, LAN, file://) the canonical deployment, with a note saying so.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const X = TM.Export;
  const h = Studio.h;
  const CANONICAL = 'https://markdo27.github.io/typoman/';

  /** Base URL that embed codes should point at, plus whether it differs from where we run. */
  Studio.publicBase = function () {
    const local = new URL((window.TM_MANIFEST && window.TM_MANIFEST.base) || './', location.href);
    const host = local.hostname.replace(/^\[|\]$/g, '');
    const isLocal = !/^https?:$/.test(local.protocol) || host === '' || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host === '0.0.0.0' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    const base = isLocal ? CANONICAL : local.href.replace(/[?#].*$/, '');
    return { base, local: local.href, differs: base !== local.href, isLocal };
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function createShareDialog(store) {
    const opt = { autoplay: true, loop: true, controls: false, transparent: false, fit: 'contain' };
    let code = '', tab = 'embed', building = false;
    const m = Studio.modal({ id: 'tm-share', title: 'Embed & share', cls: 'tm-share' });

    // ── preview (local embed.html) ──
    const frame = h('iframe', { title: 'Embed preview', loading: 'eager', style: 'color-scheme: normal' });
    const pvFrame = h('div', { class: 'tm-pv-frame' }, frame);
    const pvMeta = h('p', { class: 'tm-pv-meta' });
    m.body.append(h('div', { class: 'tm-pv' }, pvFrame, pvMeta));

    // ── tabs ──
    const TABS = [['embed', 'Embed'], ['component', 'Web component'], ['html', 'HTML file'], ['links', 'Links']];
    const tablist = h('div', { class: 'tm-tabs', role: 'tablist', 'aria-label': 'Ways to share' });
    const panels = {};
    const tabBtns = TABS.map(([id, label]) => {
      const b = h('button', { type: 'button', role: 'tab', id: 'tm-tab-' + id, 'aria-controls': 'tm-panel-' + id, 'aria-selected': 'false', tabindex: '-1' }, label);
      b.addEventListener('click', () => select(id));
      tablist.append(b);
      panels[id] = h('section', { class: 'tm-panel', role: 'tabpanel', id: 'tm-panel-' + id, 'aria-labelledby': 'tm-tab-' + id, hidden: true });
      return b;
    });
    tablist.addEventListener('keydown', (e) => {
      const i = TABS.findIndex((t) => t[0] === tab);
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
      if (next == null) return;
      e.preventDefault();
      select(TABS[(next + TABS.length) % TABS.length][0], true);
    });
    function select(id, focus) {
      tab = id;
      tabBtns.forEach((b, i) => {
        const on = TABS[i][0] === id;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      Object.keys(panels).forEach((k) => { panels[k].hidden = k !== id; });
      optionsBox.hidden = id === 'links';
    }

    // ── options ──
    const toggles = h('div', { class: 'tm-toggles' });
    const sw = {};
    [['autoplay', 'Autoplay'], ['loop', 'Loop'], ['controls', 'Controls'], ['transparent', 'Transparent background']].forEach(([key, label]) => {
      const input = h('input', { type: 'checkbox', role: 'switch' });
      input.addEventListener('change', () => { opt[key] = input.checked; update(); });
      sw[key] = input;
      toggles.append(h('label', { class: 'tm-switch' }, input, h('span', null, label)));
    });
    const fitSeg = Studio.segField('Fit', 'tm-s-fit', (v) => { opt.fit = v; update(); });
    const optionsBox = h('div', { class: 'tm-panel' }, toggles, fitSeg.el,
      h('p', { class: 'tm-note' }, 'Viewers who prefer reduced motion see a still frame with a play button, and the player pauses while it is off screen.'));

    // ── snippet panels ──
    function snippetPanel(id, title, hint) {
      const ta = h('textarea', { class: 'tm-snippet', readonly: true, spellcheck: 'false', rows: 6, 'aria-label': title, id: 'tm-snip-' + id });
      const copy = h('button', { type: 'button', class: 'btn primary small' }, 'Copy code');
      copy.addEventListener('click', () => Studio.copyText(ta.value, copy));
      ta.addEventListener('focus', () => ta.select());
      panels[id].append(h('div', { class: 'tm-row-head' }, h('b', null, title), copy), ta, h('p', { class: 'tm-note' }, hint));
      return ta;
    }
    const embedTA = snippetPanel('embed', 'Iframe embed code', 'Responsive: fills its container\'s width and keeps the scene\'s aspect ratio. Paste into any HTML, Webflow, WordPress or Notion embed block.');
    const compTA = snippetPanel('component', 'Web component', 'Load player.js once per page, then use as many <typoman-player> tags as you like. It is a block element: set a width and the height follows the aspect ratio.');

    const htmlInfo = h('p', { class: 'tm-note' });
    const htmlBtn = h('button', { type: 'button', class: 'btn primary' }, 'Download HTML');
    const htmlStatus = h('span', { class: 'tm-note', role: 'status' });
    htmlBtn.addEventListener('click', () => downloadHTML());
    panels.html.append(
      h('div', { class: 'tm-row-head' }, h('b', null, 'Self-contained HTML player'), h('span', null, 'one file')),
      h('p', { class: 'tm-note' }, 'The engine, the presets this scene uses and the scene itself, in a single .html file. It plays anywhere, including straight from your disk, and only reaches the network for Google Fonts. The options above apply.'),
      htmlInfo,
      h('div', { class: 'tm-inline' }, htmlBtn, htmlStatus),
    );

    function linkRow(label, hint, open) {
      const input = h('input', { type: 'text', readonly: true, spellcheck: 'false', 'aria-label': label });
      input.addEventListener('focus', () => input.select());
      const copy = h('button', { type: 'button', class: 'btn small' }, 'Copy');
      copy.addEventListener('click', () => Studio.copyText(input.value, copy));
      const row = h('div', { class: 'tm-copy' }, input, copy);
      if (open) row.append(h('button', { type: 'button', class: 'btn small', onclick: () => window.open(input.value, '_blank', 'noopener') }, 'Open ↗'));
      panels.links.append(h('div', { class: 'tm-panel' }, h('div', { class: 'tm-row-head' }, h('b', null, label), h('span', null, hint)), row));
      return input;
    }
    const remixIn = linkRow('Remix link', 'opens this scene in the studio');
    const playerIn = linkRow('Player link', 'full-window player, uses the embed options', true);
    const linkNote = h('p', { class: 'tm-note' });
    panels.links.append(linkNote);

    const baseNote = h('p', { class: 'tm-note' });
    m.body.append(h('div', { class: 'tm-opts' }, tablist, optionsBox, ...Object.values(panels), baseNote));

    // ── output builders ──
    function hashFor(o) {
      let s = '#c=' + code + '&autoplay=' + (o.autoplay ? 1 : 0) + '&loop=' + (o.loop ? 1 : 0) + '&controls=' + (o.controls ? 1 : 0);
      if (o.transparent) s += '&bg=transparent';
      if (o.fit === 'cover') s += '&fit=cover';
      return s;
    }
    function snippets() {
      const s = store.scene;
      const pub = Studio.publicBase().base;
      const title = esc((s.name || 'TYPOMAN') + ' (animated type)');
      const iframeStyle = 'position:absolute;inset:0;width:100%;height:100%;border:0' + (opt.transparent ? ';color-scheme:normal;background:transparent' : '');
      const embed = [
        `<div style="position:relative;width:100%;aspect-ratio:${s.size.w}/${s.size.h}">`,
        `  <iframe src="${pub}embed.html${hashFor(opt)}" title="${title}" style="${iframeStyle}" loading="lazy" allow="autoplay"></iframe>`,
        '</div>',
      ].join('\n');
      const attrs = [opt.autoplay && 'autoplay', opt.loop && 'loop', opt.controls && 'controls', opt.transparent && 'bg="transparent"', opt.fit === 'cover' && 'fit="cover"'].filter(Boolean);
      const comp = [
        `<script src="${pub}player.js" async></script>`,
        `<typoman-player scene="${code}"${attrs.length ? ' ' + attrs.join(' ') : ''} label="${esc(s.name || 'Animated type')}"></typoman-player>`,
      ].join('\n');
      return { embed, comp, remix: `${pub}index.html#c=${code}`, player: `${pub}embed.html${hashFor(opt)}` };
    }

    function update() {
      const s = store.scene;
      Object.keys(sw).forEach((k) => { sw[k].checked = !!opt[k]; });
      fitSeg.set([['contain', 'Contain'], ['cover', 'Cover']], opt.fit);
      const out = snippets();
      embedTA.value = out.embed;
      compTA.value = out.comp;
      remixIn.value = out.remix;
      playerIn.value = out.player;
      // Live preview: same options on the local player (hash changes don't reload it).
      const src = new URL('embed.html', Studio.publicBase().local).href + hashFor(opt);
      if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
      pvFrame.classList.toggle('checker', opt.transparent);
      pvFrame.style.aspectRatio = s.size.w + ' / ' + s.size.h;
      pvFrame.style.setProperty('--ar', (s.size.w / s.size.h).toFixed(4));
      pvMeta.textContent = `${s.size.w}×${s.size.h} · ${s.duration} s loop · scene code ${X.formatBytes(code.length)}`;
      const pb = Studio.publicBase();
      baseNote.textContent = pb.differs ? `Codes and links point to ${pb.base}, because this studio is running locally (${new URL(pb.local).host || 'file'}). The preview uses your local copy.` : `Codes and links point to ${pb.base}.`;
      linkNote.textContent = code.length > 6000 ? 'This scene makes a long link; some chat apps cut long URLs. The HTML file always works.' : 'Links carry the whole scene, so nothing is uploaded anywhere.';
      linkNote.className = 'tm-note' + (code.length > 6000 ? ' warn' : '');
      const fonts = [...new Set(s.layers.map((l) => l.font.family))].join(', ');
      htmlInfo.textContent = `Fonts: ${fonts}. Presets: ${[...new Set(s.layers.map((l) => (TM.presets[l.preset] || {}).name || l.preset))].join(', ')}.`;
    }

    async function downloadHTML() {
      if (building) return;
      building = true;
      htmlBtn.disabled = true;
      htmlStatus.textContent = 'Building…';
      try {
        const out = await X.buildStandalone(store.scene, { autoplay: opt.autoplay, loop: opt.loop, controls: opt.controls || !opt.autoplay, transparent: opt.transparent, fit: opt.fit });
        const url = X.download(out.blob, out.name);
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        htmlStatus.textContent = `✓ ${out.name} · ${X.formatBytes(out.blob.size)} · ${out.files.length} scripts inlined`;
      } catch (e) {
        console.warn('[TM.Export] standalone', e);
        htmlStatus.textContent = 'Could not build the file: ' + e.message;
      } finally {
        building = false;
        htmlBtn.disabled = false;
      }
    }

    return {
      async open() {
        code = await TM.Scene.encode(store.scene);
        select(tab);
        update();
        m.sub.textContent = store.scene.name;
        htmlStatus.textContent = '';
        m.open(() => tabBtns.find((b) => b.getAttribute('aria-selected') === 'true'));
      },
      modal: m,
    };
  }

  let instance = null;
  Studio.openShare = function (store) {
    if (!instance) instance = createShareDialog(store);
    instance.open();
    return instance;
  };
})(window.TM);
