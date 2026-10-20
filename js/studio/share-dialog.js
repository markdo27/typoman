/* TYPOMAN studio — Embed & share dialog: TM.Studio.openShare(store).
 *
 * Tabs: Embed (responsive iframe snippet with a live preview), Web component
 * (<typoman-player>), HTML file (self-contained download) and Links (remix + player). Options
 * (autoplay, loop, controls, transparent, fit) apply to the snippets, the player link, the
 * HTML file and the live preview, which runs the local embed.html.
 *
 * Uploaded fonts live only in this browser. Iframes, the web component and links carry the
 * scene alone, so viewers get the default face, and those tabs say so. The HTML file inlines
 * the font, so its tab says that instead and previews the real file.
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
  /** Uploaded fonts the scene uses (catalogue entries with `custom`). */
  const uploadedFonts = (scene) => [...new Set(scene.layers.map((l) => l.font.family))].map((f) => TM.fonts.get(f)).filter((f) => f && f.custom);
  const label = (f) => (Studio.fontLabel ? Studio.fontLabel(f.family) : f.family);
  const andList = (list) => (list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]);
  /** Decoded size of a base64 data: URL, in bytes. */
  const dataBytes = (url) => { const s = String(url || ''), i = s.indexOf(','); return i < 0 ? 0 : Math.floor(((s.length - i - 1) * 3) / 4); };
  const WAYS = { embed: 'An iframe embed', component: 'The web component', links: 'A link' };

  function createShareDialog(store) {
    const opt = { autoplay: true, loop: true, controls: false, transparent: false, fit: 'contain' };
    let code = '', tab = 'embed', building = false;
    // Preview state: a counter that forces a fresh player (autoplay / loop changes), and the
    // real HTML file (a blob URL) when the HTML tab previews uploaded fonts.
    let reloads = 0;
    const file = { key: '', url: null, size: 0, token: 0, timer: 0 };
    const m = Studio.modal({ id: 'tm-share', title: 'Embed & share', cls: 'tm-share', onClose: () => dropFile() });

    // ── preview (local embed.html, or the HTML file itself) ──
    const frame = h('iframe', { title: 'Embed preview', loading: 'eager', style: 'color-scheme: normal' });
    const pvFrame = h('div', { class: 'tm-pv-frame' }, frame);
    const pvMeta = h('p', { class: 'tm-pv-meta' });
    const replay = h('button', { type: 'button', class: 'link-btn tm-replay', hidden: true, 'aria-label': 'Replay the preview from the start' }, '↻ Replay');
    replay.addEventListener('click', () => replayPreview());
    m.body.append(h('div', { class: 'tm-pv' }, pvFrame, h('div', { class: 'tm-pv-bar' }, pvMeta, replay)));

    // ── tabs ──
    const TABS = [['embed', 'Embed'], ['component', 'Web component'], ['html', 'HTML file'], ['links', 'Links']];
    const tablist = h('div', { class: 'tm-tabs', role: 'tablist', 'aria-label': 'Ways to share' });
    const panels = {};
    const tabBtns = TABS.map(([id, text]) => {
      const b = h('button', { type: 'button', role: 'tab', id: 'tm-tab-' + id, 'aria-controls': 'tm-panel-' + id, 'aria-selected': 'false', tabindex: '-1' }, text);
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
      if (m.isOpen) { syncNotes(); syncPreview(); }
    }

    // ── options ──
    const toggles = h('div', { class: 'tm-toggles' });
    const sw = {};
    [['autoplay', 'Autoplay'], ['loop', 'Loop'], ['controls', 'Controls'], ['transparent', 'Transparent background']].forEach(([key, text]) => {
      const input = h('input', { type: 'checkbox', role: 'switch' });
      input.addEventListener('change', () => {
        opt[key] = input.checked;
        if (key === 'autoplay' || key === 'loop') reloads++; // show it as a fresh page load would
        update();
      });
      sw[key] = input;
      toggles.append(h('label', { class: 'tm-switch' }, input, h('span', null, text)));
    });
    const fitSeg = Studio.segField('Fit', 'tm-s-fit', (v) => { opt.fit = v; update(); });
    const optionsBox = h('div', { class: 'tm-panel' }, toggles, fitSeg.el,
      h('p', { class: 'tm-note' }, 'Viewers who prefer reduced motion see a still frame with a play button, and the player pauses while it is off screen. Without Loop it plays once and stops on its last frame; with Controls, its corner button turns into Replay.'));

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
      h('p', { class: 'tm-note' }, 'The engine, the presets this scene uses, the scene itself and any uploaded font, in a single .html file. It plays anywhere, including straight from your disk, and only reaches the network for Google Fonts. The options above apply.'),
      htmlInfo,
      h('div', { class: 'tm-inline' }, htmlBtn, htmlStatus),
    );

    function linkRow(text, hint, openBtn) {
      const input = h('input', { type: 'text', readonly: true, spellcheck: 'false', 'aria-label': text });
      input.addEventListener('focus', () => input.select());
      const copy = h('button', { type: 'button', class: 'btn small' }, 'Copy');
      copy.addEventListener('click', () => Studio.copyText(input.value, copy));
      const row = h('div', { class: 'tm-copy' }, input, copy);
      if (openBtn) row.append(h('button', { type: 'button', class: 'btn small', onclick: () => window.open(input.value, '_blank', 'noopener') }, 'Open ↗'));
      panels.links.append(h('div', { class: 'tm-panel' }, h('div', { class: 'tm-row-head' }, h('b', null, text), h('span', null, hint)), row));
      return input;
    }
    const remixIn = linkRow('Remix link', 'opens this scene in the studio');
    const playerIn = linkRow('Player link', 'full-window player, uses the embed options', true);
    const linkNote = h('p', { class: 'tm-note' });
    panels.links.append(linkNote);

    // Per-tab notes: uploaded fonts (does this way of sharing carry them?) and where codes point.
    const fontNote = h('div', { class: 'tm-fontnote', role: 'note', hidden: true });
    const flashBox = h('div', { class: 'tm-info warn tm-flash', role: 'note', hidden: true });
    const baseNote = h('p', { class: 'tm-note' });
    m.body.append(h('div', { class: 'tm-opts' }, tablist, flashBox, optionsBox, ...Object.values(panels), fontNote, baseNote));

    // ── output builders ──
    function hashFor(o) {
      let s = '#c=' + code + '&autoplay=' + (o.autoplay ? 1 : 0) + '&loop=' + (o.loop ? 1 : 0) + '&controls=' + (o.controls ? 1 : 0);
      if (o.transparent) s += '&bg=transparent';
      if (o.fit === 'cover') s += '&fit=cover';
      return s;
    }
    /** Options the HTML file is built with: without autoplay it always shows its controls. */
    const fileOpts = () => ({ autoplay: opt.autoplay, loop: opt.loop, controls: opt.controls || !opt.autoplay, transparent: opt.transparent, fit: opt.fit });
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
      pvFrame.classList.toggle('checker', opt.transparent);
      pvFrame.style.aspectRatio = s.size.w + ' / ' + s.size.h;
      pvFrame.style.setProperty('--ar', (s.size.w / s.size.h).toFixed(4));
      linkNote.textContent = code.length > 6000 ? 'This scene makes a long link; some chat apps cut long URLs. The HTML file always works.' : 'Links carry the whole scene, so nothing is uploaded anywhere.';
      linkNote.className = 'tm-note' + (code.length > 6000 ? ' warn' : '');
      const custom = new Set(uploadedFonts(s).map((f) => f.family));
      const fonts = [...new Set(s.layers.map((l) => l.font.family))].map((f) => (custom.has(f) ? Studio.fontLabel(f) + ' (embedded)' : f)).join(', ');
      htmlInfo.textContent = `Fonts: ${fonts}. Presets: ${[...new Set(s.layers.map((l) => (TM.presets[l.preset] || {}).name || l.preset))].join(', ')}.`;
      syncNotes();
      syncPreview();
    }

    /** The notes under the tabs, for the selected tab. */
    function syncNotes() {
      const s = store.scene;
      const pb = Studio.publicBase();
      baseNote.textContent = pb.differs ? `Codes and links point to ${pb.base}, because this studio is running locally (${new URL(pb.local).host || 'file'}). The preview uses your local copy.` : `Codes and links point to ${pb.base}.`;
      baseNote.hidden = tab === 'html'; // the file is self-contained: it points nowhere
      if (Studio.flashNote) Studio.flashNote(flashBox, s, 'Consider slowing it before it goes on a page: WCAG 2.3.1 is a Level A requirement for web content.');
      const custom = uploadedFonts(s);
      fontNote.hidden = !custom.length;
      if (!custom.length) return;
      const list = andList(custom.map(label)), one = custom.length === 1;
      if (tab === 'html') {
        const bytes = custom.reduce((n, f) => n + dataBytes(f.dataUrl), 0);
        fontNote.className = 'tm-fontnote ok';
        fontNote.replaceChildren(Studio.ui.icon('check'), h('p', null,
          h('b', null, list), (one ? ' is' : ' are') + ' embedded in this file' + (bytes ? ' (' + X.formatBytes(bytes) + ')' : '') + ', so it plays in your font anywhere. The preview shows the file itself.'));
        return;
      }
      const fallback = TM.Scene.defaultLayer().font.family;
      fontNote.className = 'tm-fontnote warn';
      const useFile = h('button', { type: 'button', class: 'btn small', onclick: () => select('html', true) }, 'Use the HTML file');
      fontNote.replaceChildren(Studio.ui.icon('warning'), h('div', null,
        h('p', null, h('b', null, list), (one ? ' is an uploaded font' : ' are uploaded fonts') + '. ' + WAYS[tab] + ' can’t carry ' + (one ? 'it' : 'them') + ', so ' + (tab === 'links' ? 'whoever opens it sees ' : 'viewers will see ') + fallback + ' instead, as the preview shows. The HTML file embeds ' + (one ? 'it' : 'them') + '; or pick a catalogue font.'),
        useFile));
    }

    /** What the preview shows: the snippet's player, or on the HTML tab the file as downloaded. */
    function syncPreview() {
      const s = store.scene;
      const custom = uploadedFonts(s);
      const asFile = tab === 'html';
      const o = asFile ? fileOpts() : opt;
      replay.hidden = o.loop;
      const meta = `${s.size.w}×${s.size.h} · ${s.duration} s loop`;
      if (asFile && custom.length) {
        // Only the real file shows the embedded font: build it (debounced) and play it.
        const key = JSON.stringify([code, o, custom.map((f) => f.family)]);
        pvMeta.textContent = meta + (file.url && file.key === key ? ` · the HTML file, ${X.formatBytes(file.size)}` : ' · building the HTML file…');
        if (file.key === key && file.url) { setSrc(file.url); return; }
        clearTimeout(file.timer);
        file.timer = setTimeout(() => buildFile(key, o), 120);
        return;
      }
      pvMeta.textContent = `${meta} · scene code ${X.formatBytes(code.length)}`;
      // Same options on the local player. A hash change updates it live; a new ?pv restarts it.
      setSrc(new URL('embed.html', Studio.publicBase().local).href + '?pv=' + reloads + hashFor(o));
    }
    function setSrc(src) { if (frame.getAttribute('src') !== src) frame.setAttribute('src', src); }
    async function buildFile(key, o) {
      const token = ++file.token;
      try {
        const out = await X.buildStandalone(store.scene, o);
        if (token !== file.token || !m.isOpen) return;
        dropFile();
        file.key = key;
        file.url = URL.createObjectURL(out.blob);
        file.size = out.blob.size;
        if (tab === 'html') syncPreview();
      } catch (e) {
        console.warn('[TM.Export] preview', e);
        if (token === file.token) pvMeta.textContent = 'Could not build the HTML file for the preview: ' + e.message;
      }
    }
    function dropFile() {
      clearTimeout(file.timer);
      if (file.url) URL.revokeObjectURL(file.url);
      file.url = null;
      file.key = '';
    }
    /** Play the preview again from the start (play-once scenes stop on their last frame). */
    function replayPreview() {
      try {
        const p = frame.contentDocument && frame.contentDocument.querySelector('typoman-player');
        if (p && typeof p.play === 'function') { p.currentTime = 0; p.play(); return; }
      } catch (e) { /* not same-origin: use the message API */ }
      const w = frame.contentWindow;
      if (w) { w.postMessage({ typoman: 'seek', time: 0 }, '*'); w.postMessage({ typoman: 'play' }, '*'); }
    }

    async function downloadHTML() {
      if (building) return;
      building = true;
      htmlBtn.disabled = true;
      htmlStatus.textContent = 'Building…';
      try {
        const out = await X.buildStandalone(store.scene, fileOpts());
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
        reloads++; // every opening starts the preview fresh
        select(tab);
        update();
        m.sub.textContent = store.scene.name;
        htmlStatus.textContent = '';
        m.open(() => tabBtns.find((b) => b.getAttribute('aria-selected') === 'true'));
      },
      modal: m,
      get tab() { return tab; },
    };
  }

  let instance = null;
  Studio.openShare = function (store) {
    if (!instance) instance = createShareDialog(store);
    instance.open();
    return instance;
  };
})(window.TM);
