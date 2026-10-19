/* TYPOMAN engine — curated font catalogue and loader (Google Fonts + user-uploaded fonts).
 *
 * Only families in this catalogue (or fonts the user uploads locally) can be used. That keeps
 * URL-loaded scenes from injecting arbitrary stylesheet URLs, and guarantees every weight we
 * ask for exists, since the Google Fonts css2 API rejects out-of-range axis requests.
 *
 * Variable axes beyond weight. Canvas text can only set weight (and nine width keywords), so
 * width (wdth) and optical size (opsz) are pinned through *instances*: aliases such as
 * "Roboto Flex ~w75o144" whose faces reuse the family's font files with a fixed stretch and
 * `"opsz"` variation. Faces sharing a URL share one decoded font, so instances are cheap.
 * resolve(font, designPx) picks the instance for a layer; presets never see the difference,
 * because the renderer hands them the instance as the layer's family.
 *
 * Optical size is pinned on purpose. Left on auto, the browser derives opsz from the device
 * pixel size, so a 540p preview and a 1080p export would draw different letterforms (and
 * widths). 'auto' here means the text's size at the scene's own resolution instead.
 */
(function (root) {
  'use strict';
  const TM = root.TM;

  // [family, category, minWeight, maxWeight, discreteWeights?, axes?]
  // min < max with no discrete list means a variable font with a continuous weight axis.
  // axes: the other variable axes TYPOMAN drives, { wdth: [min, max] (%), opsz: [min, max] }.
  const CATALOGUE = [
    // Condensed
    ['Anton', 'Condensed', 400, 400],
    ['Bebas Neue', 'Condensed', 400, 400],
    ['Oswald', 'Condensed', 200, 700],
    ['League Gothic', 'Condensed', 400, 400, null, { wdth: [75, 100] }],
    ['Big Shoulders Display', 'Condensed', 100, 900, null, { opsz: [10, 72] }],
    ['Science Gothic', 'Condensed', 100, 900, null, { wdth: [50, 200] }],
    ['Six Caps', 'Condensed', 400, 400],
    // Grotesk
    ['Inter Tight', 'Grotesk', 100, 900],
    ['Space Grotesk', 'Grotesk', 300, 700],
    ['Bricolage Grotesque', 'Grotesk', 200, 800, null, { opsz: [12, 96], wdth: [75, 100] }],
    ['Archivo', 'Grotesk', 100, 900, null, { wdth: [62, 125] }],
    ['Archivo Black', 'Grotesk', 400, 400],
    ['Roboto Flex', 'Grotesk', 100, 1000, null, { opsz: [8, 144], wdth: [25, 151] }],
    ['Anybody', 'Grotesk', 100, 900, null, { wdth: [50, 150] }],
    ['Mona Sans', 'Grotesk', 200, 900, null, { wdth: [75, 125] }],
    ['Saira', 'Grotesk', 100, 900, null, { wdth: [50, 125] }],
    ['Montserrat', 'Grotesk', 100, 900],
    ['Outfit', 'Grotesk', 100, 900],
    ['Sora', 'Grotesk', 100, 800],
    ['Darker Grotesque', 'Grotesk', 300, 900],
    ['Rubik', 'Grotesk', 300, 900],
    // Display
    ['Unbounded', 'Display', 200, 900],
    ['Syne', 'Display', 400, 800],
    ['Dela Gothic One', 'Display', 400, 400],
    ['Rubik Mono One', 'Display', 400, 400],
    ['Bungee', 'Display', 400, 400],
    ['Climate Crisis', 'Display', 400, 400],
    ['Tilt Warp', 'Display', 400, 400],
    ['Titan One', 'Display', 400, 400],
    ['Bowlby One', 'Display', 400, 400],
    ['Righteous', 'Display', 400, 400],
    ['Russo One', 'Display', 400, 400],
    ['Orbitron', 'Display', 400, 900],
    ['Exo 2', 'Display', 100, 900],
    ['Black Ops One', 'Display', 400, 400],
    ['Monoton', 'Display', 400, 400],
    ['Rubik Glitch', 'Display', 400, 400],
    // Serif
    ['Fraunces', 'Serif', 100, 900, null, { opsz: [9, 144] }],
    ['Roboto Serif', 'Serif', 100, 900, null, { opsz: [8, 144], wdth: [50, 150] }],
    ['Playfair Display', 'Serif', 400, 900],
    ['Bodoni Moda', 'Serif', 400, 900, null, { opsz: [6, 96] }],
    ['DM Serif Display', 'Serif', 400, 400],
    ['Instrument Serif', 'Serif', 400, 400],
    ['Abril Fatface', 'Serif', 400, 400],
    ['Yeseva One', 'Serif', 400, 400],
    ['Shrikhand', 'Serif', 400, 400],
    // Mono & pixel
    ['JetBrains Mono', 'Mono', 100, 800],
    ['Space Mono', 'Mono', 400, 700, [400, 700]],
    ['Major Mono Display', 'Mono', 400, 400],
    ['Silkscreen', 'Mono', 400, 700, [400, 700]],
    ['Press Start 2P', 'Mono', 400, 400],
    // Script & hand
    ['Pacifico', 'Script', 400, 400],
    ['Permanent Marker', 'Script', 400, 400],
    ['Caveat', 'Script', 400, 700],
  ];

  const FALLBACK = { Serif: 'serif', Mono: 'monospace', Script: 'cursive' };
  const hasDOM = typeof document !== 'undefined';
  // Pinning opsz needs the FontFace variationSettings descriptor. Without it the family is
  // requested without its opsz axis, which Google serves pinned at the default (still stable).
  const OPSZ_OK = hasDOM && typeof FontFace !== 'undefined' && 'variationSettings' in FontFace.prototype;
  const FONTS = CATALOGUE.map(([family, cat, min, max, discrete, axes]) => {
    const ax = {};
    if (axes && axes.wdth) ax.wdth = axes.wdth.slice();
    if (axes && axes.opsz && OPSZ_OK) ax.opsz = axes.opsz.slice();
    return {
      family,
      cat,
      min,
      max,
      weights: discrete || null,
      variable: !discrete && max > min,
      axes: ax.wdth || ax.opsz ? ax : null,
      fallback: FALLBACK[cat] || 'sans-serif',
      custom: false,
    };
  });
  const byFamily = new Map(FONTS.map((f) => [f.family, f]));

  TM.FONTS = FONTS;
  TM.FONT_CATEGORIES = ['Condensed', 'Grotesk', 'Display', 'Serif', 'Mono', 'Script', 'Custom'];

  const linkPromises = new Map(); // css2 query → Promise
  const facePromises = new Map(); // "family|weight" → Promise
  let version = 0;
  const listeners = new Set();

  // version moves at once (layout caches key on it); listeners hear about a burst of loads,
  // such as a width ladder of instances, once.
  let notifyTimer = 0;
  function bump() {
    version++;
    if (notifyTimer) return;
    notifyTimer = setTimeout(() => {
      notifyTimer = 0;
      listeners.forEach((fn) => {
        try { fn(version); } catch (e) { console.error(e); }
      });
    }, 16);
  }
  if (hasDOM && document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', bump);
  }

  function familyQuery(f) {
    f = f.base || f;
    const name = f.family.replace(/ /g, '+');
    if (f.weights) return `${name}:wght@${f.weights.join(';')}`;
    // css2 wants axis tags in alphabetical order: opsz, wdth, wght.
    const tags = [], ranges = [];
    const add = (tag, lo, hi) => { tags.push(tag); ranges.push(lo + '..' + hi); };
    if (f.axes && f.axes.opsz) add('opsz', f.axes.opsz[0], f.axes.opsz[1]);
    if (f.axes && f.axes.wdth) add('wdth', f.axes.wdth[0], f.axes.wdth[1]);
    if (f.max > f.min) add('wght', f.min, f.max);
    return tags.length ? `${name}:${tags.join(',')}@${ranges.join(',')}` : name;
  }

  function injectStylesheet(families) {
    const list = families.map(get).filter((f) => f && !f.custom);
    if (!list.length || !hasDOM) return Promise.resolve();
    const query = list.map((f) => 'family=' + familyQuery(f)).join('&');
    if (linkPromises.has(query)) return linkPromises.get(query);
    const promise = new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
      link.crossOrigin = 'anonymous';
      link.onload = () => resolve();
      link.onerror = () => {
        console.warn('[TM.fonts] could not load stylesheet for', families.join(', '));
        resolve();
      };
      document.head.appendChild(link);
    });
    linkPromises.set(query, promise);
    return promise;
  }

  function get(family) {
    return byFamily.get(family) || instances.get(family) || null;
  }

  // ───────────────────────────── variable-axis instances ─────────────────────────────
  const instances = new Map(); // instance family → entry (never listed, never accepted from scenes)
  const blockPromises = new Map(); // base family → Promise<[{ src, weight, style, stretch, unicodeRange }]>
  // Auto optical size snaps to these stops so dragging the size slider reuses a few instances.
  const OPSZ_STOPS = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 84, 96, 112, 128, 144];

  /** Width (%) a font asks for, clamped to the family's wdth axis; null when it has none. */
  function widthFor(f, width) {
    const ax = f && f.axes && f.axes.wdth;
    if (!ax) return null;
    const w = Number.isFinite(+width) ? +width : 100;
    // Whole percents: a full-range slider drag creates at most ~130 instances (~145 KB each).
    return Math.round(TM.math.clamp(w, ax[0], ax[1]));
  }

  /** Pinned optical size: a number, or 'auto' = the text's size in scene px (snapped). */
  function opszFor(f, opsz, designPx) {
    const ax = f && f.axes && f.axes.opsz;
    if (!ax) return null;
    if (opsz !== 'auto' && opsz != null && Number.isFinite(+opsz)) return Math.round(TM.math.clamp(+opsz, ax[0], ax[1]));
    const px = TM.math.clamp(Number.isFinite(+designPx) && designPx > 0 ? designPx : ax[1], ax[0], ax[1]);
    let best = ax[0];
    for (const v of OPSZ_STOPS.concat(ax)) {
      if (v < ax[0] || v > ax[1]) continue;
      if (Math.abs(Math.log(v / px)) < Math.abs(Math.log(best / px))) best = v;
    }
    return best;
  }

  /**
   * The family name to draw `font` ({ family, weight, width, opsz }) with, for text designPx tall
   * at the scene's resolution: the family itself, or a variable-axis instance of it (created
   * and loaded on first use; it draws in the base family until then).
   */
  function resolve(font, designPx) {
    const f = font && byFamily.get(font.family);
    if (!f || f.custom || !f.axes) return font ? font.family : '';
    const wdth = widthFor(f, font.width);
    const opsz = opszFor(f, font.opsz, designPx);
    const name = `${f.family} ~${wdth != null ? 'w' + wdth : ''}${opsz != null ? 'o' + opsz : ''}`;
    if (!instances.has(name)) {
      instances.set(name, { ...f, family: name, base: f, instance: true, wdth, opsz, ready: null });
      ensure(name, font.weight);
    }
    return name;
  }

  /** The values of `axis` a preset sweeping it should draw with (resolve() each with width: v). */
  function ladder(family, axis = 'wdth') {
    const f = get(family);
    const ax = f && f.axes && f.axes[axis];
    if (!ax) return [];
    const step = Math.max(1, Math.round((ax[1] - ax[0]) / 48));
    const out = [];
    for (let v = ax[0]; v < ax[1]; v += step) out.push(v);
    out.push(ax[1]);
    return out;
  }

  /** Parse a css2 response into the faces an instance re-registers (Google-hosted files only). */
  function parseFaces(css) {
    const out = [];
    for (const block of String(css).split('@font-face').slice(1)) {
      const src = /url\((https:\/\/fonts\.gstatic\.com\/[^)\s'"]+)\)/.exec(block);
      if (!src) continue;
      const prop = (name) => {
        const m = new RegExp(name + ':\\s*([^;}]+)').exec(block);
        return m ? m[1].trim() : undefined;
      };
      out.push({ src: src[1], weight: prop('font-weight'), style: prop('font-style'), stretch: prop('font-stretch'), unicodeRange: prop('unicode-range') });
    }
    return out;
  }

  /** The base family's faces, read from its css2 stylesheet (which also gets installed). */
  function baseFaces(f) {
    if (blockPromises.has(f.family)) return blockPromises.get(f.family);
    const query = 'family=' + familyQuery(f);
    const p = (typeof fetch === 'function' ? fetch(`https://fonts.googleapis.com/css2?${query}&display=swap`, { credentials: 'omit' }) : Promise.reject(new Error('no fetch')))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((css) => {
        if (!linkPromises.has(query)) {
          const style = document.createElement('style');
          style.textContent = css;
          document.head.appendChild(style);
          linkPromises.set(query, Promise.resolve());
        }
        return parseFaces(css);
      })
      .catch((e) => {
        // Blocked (CSP connect-src, offline): the base family still loads through a <link>.
        console.warn('[TM.fonts] variable axes unavailable for', f.family, '-', e.message);
        return injectStylesheet([f.family]).then(() => []);
      });
    blockPromises.set(f.family, p);
    return p;
  }

  function addInstanceFaces(inst) {
    if (inst.ready) return inst.ready;
    inst.ready = baseFaces(inst.base).then((blocks) => {
      for (const b of blocks) {
        const d = { style: b.style || 'normal', weight: b.weight || '400', display: 'block' };
        if (b.unicodeRange) d.unicodeRange = b.unicodeRange;
        if (inst.wdth != null) d.stretch = inst.wdth + '%';
        else if (b.stretch) d.stretch = b.stretch;
        if (inst.opsz != null) d.variationSettings = `"opsz" ${inst.opsz}`;
        try {
          document.fonts.add(new FontFace(inst.family, `url(${b.src}) format("woff2")`, d));
        } catch (e) {
          console.warn('[TM.fonts] could not add instance face', inst.family, e.message);
        }
      }
    });
    return inst.ready;
  }

  function clampWeight(family, weight) {
    const f = get(family);
    if (!f) return 400;
    const w = Number.isFinite(+weight) ? +weight : 400;
    if (f.weights) {
      return f.weights.reduce((best, v) => (Math.abs(v - w) < Math.abs(best - w) ? v : best), f.weights[0]);
    }
    return Math.round(TM.math.clamp(w, f.min, f.max));
  }

  function cssFamily(family) {
    const f = get(family);
    const safe = String(family).replace(/["\\]/g, '');
    // An instance falls back to its base family while its own faces load (or if they can't).
    const base = f && f.base ? `"${f.base.family.replace(/["\\]/g, '')}", ` : '';
    return `"${safe}", ${base}${f ? f.fallback : 'sans-serif'}`;
  }

  /** Canvas font shorthand. Weight is clamped to what the family supports. */
  function fontString(family, weight, sizePx) {
    return `${clampWeight(family, weight)} ${Math.max(0.5, sizePx).toFixed(2)}px ${cssFamily(family)}`;
  }

  /**
   * Make sure `family` (a catalogue family or an instance from resolve) at `weight` is ready for
   * canvas rendering. `text` also loads the subsets it needs (e.g. Cyrillic). Never rejects.
   */
  function ensure(family, weight = 400, text) {
    const f = get(family);
    if (!f || !hasDOM || !document.fonts) return Promise.resolve(false);
    const w = clampWeight(family, weight);
    const sample = text ? 'AaBb09' + String(text).slice(0, 200) : 'AaBb09';
    const key = `${family}|${f.variable ? 'var' : w}|${sample}`;
    if (facePromises.has(key)) return facePromises.get(key);
    const ready = f.custom ? Promise.resolve() : f.instance ? addInstanceFaces(f) : injectStylesheet([family]);
    const promise = ready
      .then(() => document.fonts.load(`${w} 64px ${cssFamily(family)}`, sample))
      .then((faces) => {
        bump();
        return faces.length > 0;
      })
      .catch(() => false);
    if (facePromises.size > 600) facePromises.clear();
    facePromises.set(key, promise);
    return promise;
  }

  /** Load the stylesheet for every catalogue family (used by the font picker previews). */
  function preloadCatalogue() {
    const names = FONTS.filter((f) => !f.custom).map((f) => f.family);
    const chunks = [];
    for (let i = 0; i < names.length; i += 12) chunks.push(injectStylesheet(names.slice(i, i + 12)));
    return Promise.all(chunks);
  }

  /** Register a user-supplied font file (ArrayBuffer). Returns the catalogue entry. */
  async function addCustom(name, buffer, dataUrl) {
    if (!hasDOM || typeof FontFace === 'undefined') throw new Error('Custom fonts need a browser with the FontFace API');
    const clean = String(name).replace(/\.(otf|ttf|woff2?)$/i, '').replace(/[^\w \-]/g, '').trim().slice(0, 40) || 'Custom';
    const family = `${clean} (custom)`;
    const face = new FontFace(family, buffer);
    await face.load();
    document.fonts.add(face);
    let entry = byFamily.get(family);
    if (!entry) {
      entry = { family, cat: 'Custom', min: 400, max: 400, weights: null, variable: false, fallback: 'sans-serif', custom: true, dataUrl: dataUrl || null };
      FONTS.push(entry);
      byFamily.set(family, entry);
    } else if (dataUrl) {
      entry.dataUrl = dataUrl;
    }
    bump();
    return entry;
  }

  TM.fonts = {
    get,
    has: (family) => byFamily.has(family),
    clampWeight,
    resolve,
    ladder,
    /** The catalogue family behind an instance name (or the family itself). */
    baseOf: (family) => { const f = get(family); return f && f.base ? f.base.family : family; },
    /** The width / optical size a font draws at (null when the family has no such axis). */
    widthFor: (family, width) => widthFor(get(family), width),
    opszFor: (family, opsz, designPx) => opszFor(get(family), opsz, designPx),
    /** Variable axes beyond weight, { wdth?: [min, max], opsz?: [min, max] }, or null. */
    axes: (family) => { const f = get(family); return f && f.axes ? f.axes : null; },
    cssFamily,
    fontString,
    ensure,
    preloadCatalogue,
    addCustom,
    cssUrl: (families) => `https://fonts.googleapis.com/css2?${families.map(get).filter((f) => f && !f.custom).map((f) => 'family=' + familyQuery(f)).join('&')}&display=swap`,
    /** Increments whenever any font finishes loading; renderers include it in layout cache keys. */
    version: () => version,
    onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
  };
})(typeof window !== 'undefined' ? window : globalThis);
