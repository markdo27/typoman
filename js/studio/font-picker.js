/* TYPOMAN studio — font picker + custom fonts.
 *
 *   TM.Studio.openFontPicker(anchor, { get, set(family), preview?(family), cancel?(), returnFocus? })
 *     Searchable popover listing TM.FONTS by category, each name in its own face. Arrow keys
 *     or hover preview the font live on the canvas; Enter / click commits; Esc reverts.
 *
 *   TM.Studio.customFonts
 *     addFile(file)  → catalogue entry   validate, register via TM.fonts.addCustom(name, buf, dataUrl),
 *                                        and keep the file in IndexedDB so the font survives reloads
 *     restore()      → Promise           re-register saved fonts before a saved scene is normalised
 *     forScene(scene)→ [{family, name, dataUrl}]  fonts a scene uses (for project files / exports)
 *     register(list) → Promise           register fonts from a project file
 *
 * Custom fonts never travel in share links (links only carry catalogue font names); the UI says so.
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const h = Studio.h;
  const UI = Studio.ui;
  const ACCEPT = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';
  const MAX_BYTES = 15 * 1024 * 1024;
  const LINK_NOTE = 'Custom fonts are saved in this browser and included in project files, but share links can’t carry them.';

  // ───────────────────────────── persistence (IndexedDB) ─────────────────────────────
  const DB_NAME = 'typoman', DB_STORE = 'fonts';
  let dbPromise = null;
  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        if (!window.indexedDB) return resolve(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(DB_STORE, { keyPath: 'family' }); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbPromise;
  }
  async function dbAll() {
    const d = await db();
    if (!d) return [];
    return new Promise((resolve) => {
      try {
        const req = d.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) { resolve([]); }
    });
  }
  async function dbPut(rec) {
    const d = await db();
    if (!d) return false;
    return new Promise((resolve) => {
      try {
        const tx = d.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(rec);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  const readDataUrl = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Could not read the file'));
    r.readAsDataURL(blob);
  });
  async function dataUrlToBuffer(url) {
    const comma = url.indexOf(',');
    const bin = atob(url.slice(comma + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  const records = new Map(); // family → { family, name, dataUrl }

  const customFonts = {
    accept: ACCEPT,
    note: LINK_NOTE,
    isFontFile: (file) => !!file && /\.(ttf|otf|woff2?)$/i.test(file.name || ''),

    async addFile(file) {
      if (!customFonts.isFontFile(file)) throw new Error('Choose a .ttf, .otf, .woff or .woff2 font file');
      if (file.size > MAX_BYTES) throw new Error('That font is larger than 15 MB');
      const buf = await file.arrayBuffer();
      const dataUrl = await readDataUrl(file);
      let entry;
      try {
        entry = await TM.fonts.addCustom(file.name, buf, dataUrl);
      } catch (e) {
        throw new Error('That file isn’t a font this browser can read');
      }
      const rec = { family: entry.family, name: file.name, dataUrl, added: Date.now() };
      records.set(entry.family, rec);
      dbPut(rec);
      return entry;
    },

    async restore() {
      const list = await dbAll();
      await customFonts.register(list, false);
      return list.length;
    },

    async register(list, persist = true) {
      for (const rec of list || []) {
        if (!rec || typeof rec.dataUrl !== 'string' || !/^data:/.test(rec.dataUrl)) continue;
        try {
          const name = rec.name || String(rec.family || 'Custom').replace(/ \(custom\)$/, '');
          const entry = await TM.fonts.addCustom(name, await dataUrlToBuffer(rec.dataUrl), rec.dataUrl);
          const r = { family: entry.family, name, dataUrl: rec.dataUrl, added: rec.added || Date.now() };
          records.set(entry.family, r);
          if (persist) dbPut(r);
        } catch (e) { console.warn('[studio] could not restore font', rec.family, e); }
      }
    },

    forScene(scene) {
      const fams = new Set((scene.layers || []).map((l) => l.font && l.font.family));
      return [...records.values()].filter((r) => fams.has(r.family)).map(({ family, name, dataUrl }) => ({ family, name, dataUrl }));
    },

    usesCustom(scene) {
      return (scene.layers || []).some((l) => { const f = TM.fonts.get(l.font.family); return f && f.custom; });
    },
  };
  Studio.customFonts = customFonts;

  // ───────────────────────────── picker ─────────────────────────────
  let catalogueRequested = false;

  /** Width / optical-size axes as one small tag, e.g. "wdth·opsz" (null when none). */
  function axisTag(f) {
    const ax = f.axes;
    if (!ax) return null;
    const tags = [ax.wdth ? 'wdth' : null, ax.opsz ? 'opsz' : null].filter(Boolean);
    const tip = [ax.wdth ? 'Width ' + ax.wdth[0] + '–' + ax.wdth[1] + '%' : null, ax.opsz ? 'Optical size ' + ax.opsz[0] + '–' + ax.opsz[1] : null].filter(Boolean).join(' · ');
    return h('span', { class: 'fp-badge axis', title: tip }, tags.join('·'));
  }

  function metaFor(f) {
    if (f.custom) return h('span', { class: 'fp-badge local' }, 'Local');
    if (f.variable) return h('span', { class: 'fp-meta' }, h('span', { class: 'fp-badge' }, 'Var'), axisTag(f), f.min + '–' + f.max);
    if (f.weights) return h('span', { class: 'fp-meta' }, f.weights.join(' · '));
    return h('span', { class: 'fp-meta' }, axisTag(f), String(f.min));
  }

  /** Search words for a family's variable axes. */
  function axisWords(f) {
    const ax = f.axes || {};
    return (ax.wdth ? ' width wdth' : '') + (ax.opsz ? ' optical opsz' : '');
  }

  Studio.openFontPicker = function (anchor, o) {
    if (!catalogueRequested) { catalogueRequested = true; TM.fonts.preloadCatalogue(); }
    const original = o.get();
    let committed = false;
    let cat = 'All';
    let query = '';
    let items = [];
    let active = -1;
    let previewTimer = 0;
    let popApi = null;
    let offFonts = null;
    const listId = 'fpList' + Math.random().toString(36).slice(2, 7);

    const commit = (family) => {
      committed = true;
      clearTimeout(previewTimer);
      o.set(family, true);
      if (popApi) popApi.close('select');
    };
    const preview = (family) => {
      if (!o.preview) return;
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => o.preview(family), 110);
    };

    return UI.popover(anchor, {
      title: 'Font',
      className: 'font-pop',
      width: 312,
      returnFocus: o.returnFocus,
      onClose() {
        clearTimeout(previewTimer);
        if (offFonts) offFonts();
        if (!committed && o.cancel) o.cancel(original);
      },
      build(body, api) {
        popApi = api;
        const search = h('input', { type: 'search', class: 'fp-search', placeholder: 'Search ' + TM.FONTS.length + ' fonts', 'aria-label': 'Search fonts', autocomplete: 'off', spellcheck: 'false', autofocus: true, role: 'combobox', 'aria-expanded': 'true', 'aria-controls': listId, 'aria-autocomplete': 'list' });
        const chips = h('div', { class: 'fp-chips', role: 'group', 'aria-label': 'Font categories' });
        const list = h('div', { class: 'fp-list', role: 'listbox', id: listId, 'aria-label': 'Fonts' });
        const empty = h('p', { class: 'fp-empty', hidden: true });
        const file = h('input', { type: 'file', accept: ACCEPT, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
        const upload = h('button', { type: 'button', class: 'btn wide fp-upload' }, UI.icon('upload'), h('span', null, 'Upload a font'), h('small', null, 'TTF · OTF · WOFF · WOFF2'));
        const note = h('p', { class: 'fp-note' }, UI.icon('info'), h('span', null, LINK_NOTE));

        const cats = () => ['All'].concat(TM.FONT_CATEGORIES.filter((c) => TM.FONTS.some((f) => f.cat === c)));
        function renderChips() {
          chips.replaceChildren(...cats().map((c) => h('button', {
            type: 'button', class: 'chip' + (c === cat ? ' on' : ''), 'aria-pressed': c === cat ? 'true' : 'false',
            onclick: () => { cat = c; renderChips(); renderList(); search.focus(); },
          }, c)));
        }

        function matches(f) {
          if (cat !== 'All' && f.cat !== cat) return false;
          if (!query) return true;
          const q = query.toLowerCase();
          return f.family.toLowerCase().includes(q) || f.cat.toLowerCase().includes(q) || (f.variable && 'variable'.startsWith(q)) || axisWords(f).includes(' ' + q);
        }

        function setActive(i, scroll = true, doPreview = true) {
          const opts = list.querySelectorAll('.fp-opt');
          if (active >= 0 && opts[active]) opts[active].classList.remove('active');
          active = Math.max(-1, Math.min(items.length - 1, i));
          const el = opts[active];
          if (el) {
            el.classList.add('active');
            search.setAttribute('aria-activedescendant', el.id);
            if (scroll) el.scrollIntoView({ block: 'nearest' });
            if (doPreview) preview(items[active].family);
          } else search.removeAttribute('aria-activedescendant');
        }

        function renderList() {
          const current = o.get();
          items = TM.FONTS.filter(matches);
          const frag = document.createDocumentFragment();
          let lastCat = null;
          items.forEach((f, i) => {
            if (cat === 'All' && !query && f.cat !== lastCat) {
              lastCat = f.cat;
              frag.append(h('div', { class: 'fp-group', role: 'presentation' }, f.cat));
            }
            const opt = h('div', {
              class: 'fp-opt' + (f.family === current ? ' current' : ''),
              role: 'option',
              id: listId + '-' + i,
              'aria-selected': f.family === current ? 'true' : 'false',
              'aria-label': f.family + (f.variable ? ', variable ' + f.min + ' to ' + f.max : '') + (f.axes && f.axes.wdth ? ', width axis' : '') + (f.axes && f.axes.opsz ? ', optical size axis' : '') + (f.custom ? ', custom font' : ''),
            },
            h('span', { class: 'fp-name', style: { fontFamily: TM.fonts.cssFamily(f.family), fontWeight: String(TM.fonts.clampWeight(f.family, 500)) } }, Studio.fontLabel ? Studio.fontLabel(f.family) : f.family),
            metaFor(f),
            f.family === current ? UI.icon('check', 'fp-check') : null);
            opt.addEventListener('pointermove', () => { if (active !== i) setActive(i, false); });
            opt.addEventListener('click', () => commit(f.family));
            frag.append(opt);
          });
          list.replaceChildren(frag);
          empty.hidden = items.length > 0;
          if (!items.length) empty.textContent = 'No fonts match “' + query + '”. Upload your own below.';
          const ci = items.findIndex((f) => f.family === current);
          setActive(ci >= 0 ? ci : query ? 0 : -1, true, false);
        }

        search.addEventListener('input', () => { query = search.value.trim(); renderList(); });
        search.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!items.length) return;
            const n = items.length;
            setActive(active < 0 ? 0 : (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
          } else if (e.key === 'PageDown' || e.key === 'PageUp') {
            e.preventDefault();
            setActive(active + (e.key === 'PageDown' ? 8 : -8));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (items[active]) commit(items[active].family);
          }
        });
        list.addEventListener('pointerleave', () => { clearTimeout(previewTimer); });

        upload.addEventListener('click', () => file.click());
        file.addEventListener('change', async () => {
          const f = file.files && file.files[0];
          file.value = '';
          if (!f) return;
          upload.disabled = true;
          upload.classList.add('busy');
          try {
            const entry = await customFonts.addFile(f);
            Studio.toast('Added “' + entry.family.replace(/ \(custom\)$/, '') + '”. ' + 'Share links can’t carry custom fonts.', 'info', 5200);
            commit(entry.family);
          } catch (err) {
            Studio.toast(err.message || 'Could not add that font', 'error');
            upload.disabled = false;
            upload.classList.remove('busy');
          }
        });

        renderChips();
        renderList();
        body.append(h('div', { class: 'fp-top' }, h('div', { class: 'search-wrap' }, UI.icon('search'), search), chips), list, empty, h('div', { class: 'fp-foot' }, upload, note, file));
        // Re-measure once web fonts swap in (names change width).
        offFonts = TM.fonts.onChange(() => { if (!api.closed) api.reposition(); });
      },
    });
  };
})(window.TM);
