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
  // axes: the other variable axes TYPOMAN drives, by tag: wdth: [min, max] (%), opsz: [min, max],
  // and any other registered or custom axis (slnt, GRAD, XROT, YEAR, MORF, …) as
  // [min, max, default]. All of them draw through instances (see resolve).
  const CATALOGUE = [
    // Condensed
    ['Anton', 'Condensed', 400, 400],
    ['Bebas Neue', 'Condensed', 400, 400],
    ['Oswald', 'Condensed', 200, 700],
    ['League Gothic', 'Condensed', 400, 400, null, { wdth: [75, 100] }],
    // No opsz here: Google serves the optical-size version as the separate family "Big Shoulders".
    ['Big Shoulders Display', 'Condensed', 100, 900],
    ['Science Gothic', 'Condensed', 100, 900, null, { wdth: [50, 200], slnt: [-10, 0, 0], CTRS: [0, 85, 0] }],
    ['Six Caps', 'Condensed', 400, 400],
    // Grotesk
    ['Inter Tight', 'Grotesk', 100, 900],
    ['Space Grotesk', 'Grotesk', 300, 700],
    ['Bricolage Grotesque', 'Grotesk', 200, 800, null, { opsz: [12, 96], wdth: [75, 100] }],
    ['Archivo', 'Grotesk', 100, 900, null, { wdth: [62, 125] }],
    ['Archivo Black', 'Grotesk', 400, 400],
    ['Roboto Flex', 'Grotesk', 100, 1000, null, { opsz: [8, 144], wdth: [25, 151], slnt: [-10, 0, 0], GRAD: [-200, 150, 0], XTRA: [323, 603, 468], YOPQ: [25, 135, 79] }],
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
    ['Climate Crisis', 'Display', 400, 400, null, { YEAR: [1979, 2050, 1979] }],
    ['Tilt Warp', 'Display', 400, 400, null, { XROT: [-45, 45, 0], YROT: [-45, 45, 0] }],
    ['Titan One', 'Display', 400, 400],
    ['Bowlby One', 'Display', 400, 400],
    ['Righteous', 'Display', 400, 400],
    ['Russo One', 'Display', 400, 400],
    ['Orbitron', 'Display', 400, 900],
    ['Exo 2', 'Display', 100, 900],
    ['Black Ops One', 'Display', 400, 400],
    ['Monoton', 'Display', 400, 400],
    ['Rubik Glitch', 'Display', 400, 400],
    ['Kablammo', 'Display', 400, 400, null, { MORF: [0, 60, 0] }],
    ['Agu Display', 'Display', 400, 400, null, { MORF: [0, 60, 0] }],
    // Serif
    ['Fraunces', 'Serif', 100, 900, null, { opsz: [9, 144], SOFT: [0, 100, 0], WONK: [0, 1, 0] }],
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
    ['Recursive', 'Mono', 300, 1000, null, { slnt: [-15, 0, 0], CASL: [0, 1, 0], CRSV: [0, 1, 0.5], MONO: [0, 1, 0] }],
    ['Sixtyfour', 'Mono', 400, 400, null, { BLED: [0, 100, 0], SCAN: [-53, 100, 0] }],
    ['Doto', 'Mono', 100, 900, null, { ROND: [0, 100, 0] }],
    // Script & hand
    ['Pacifico', 'Script', 400, 400],
    ['Permanent Marker', 'Script', 400, 400],
    ['Caveat', 'Script', 400, 700],
    ['Shantell Sans', 'Script', 300, 800, null, { BNCE: [-100, 100, 0], INFM: [0, 100, 0], SPAC: [0, 100, 0] }],
  ];

  // Families Google serves with true italics (checked against the css2 API: ital requests
  // return 200 with italic faces). Italic draws through an instance whose faces are the italic
  // files, so canvas font strings and every preset stay unchanged.
  const ITALIC = new Set(['Inter Tight', 'Archivo', 'Anybody', 'Mona Sans', 'Saira', 'Montserrat', 'Rubik', 'Exo 2',
    'Fraunces', 'Roboto Serif', 'Playfair Display', 'Bodoni Moda', 'DM Serif Display', 'Instrument Serif',
    'JetBrains Mono', 'Space Mono', 'Shantell Sans']);

  const FALLBACK = { Serif: 'serif', Mono: 'monospace', Script: 'cursive' };
  const hasDOM = typeof document !== 'undefined';
  // Pinning opsz needs the FontFace variationSettings descriptor. Without it the family is
  // requested without its opsz axis, which Google serves pinned at the default (still stable).
  const OPSZ_OK = hasDOM && typeof FontFace !== 'undefined' && 'variationSettings' in FontFace.prototype;
  const FONTS = CATALOGUE.map(([family, cat, min, max, discrete, axes]) => {
    const ax = {};
    for (const [tag, range] of Object.entries(axes || {})) {
      // wdth pins through the stretch descriptor everywhere; opsz and the rest need the
      // FontFace variationSettings descriptor.
      if (tag === 'wdth' || OPSZ_OK) ax[tag] = range.slice();
    }
    return {
      family,
      cat,
      min,
      max,
      weights: discrete || null,
      variable: !discrete && max > min,
      axes: Object.keys(ax).length ? ax : null,
      italic: ITALIC.has(family),
      fallback: FALLBACK[cat] || 'sans-serif',
      custom: false,
    };
  });
  const byFamily = new Map(FONTS.map((f) => [f.family, f]));

  TM.FONTS = FONTS;
  TM.FONT_CATEGORIES = ['Condensed', 'Grotesk', 'Display', 'Serif', 'Mono', 'Script', 'Custom'];

  // Waits on the network are bounded, so a hung fonts.googleapis.com can't stall a render: an
  // export proceeds with a noted fallback, an embed shows its first frame (it asks for a short
  // wait). Only the *wait* stops; loads carry on, and a late font re-renders through onChange.
  // A request is abandoned only once it is clearly hung (HUNG_MS).
  const WAIT_MS = 15000, HUNG_MS = 30000;
  const timeout = (promise, ms, value) => {
    let timer;
    return Promise.race([promise, new Promise((r) => { timer = setTimeout(() => r(value), ms); })]).finally(() => clearTimeout(timer));
  };
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
    // Italic families ask for both styles: one tuple per style (ital 0 and 1), each listing
    // every axis. The italic files only download when an italic instance draws.
    const styles = f.italic ? [0, 1] : [null];
    if (f.weights) {
      return f.italic ? `${name}:ital,wght@${styles.flatMap((i) => f.weights.map((w) => i + ',' + w)).join(';')}` : `${name}:wght@${f.weights.join(';')}`;
    }
    // css2 wants axis tags sorted alphabetically, registered (lowercase) before custom (uppercase).
    const list = Object.entries(f.axes || {}).map(([tag, r]) => [tag, r[0] + '..' + r[1]]);
    if (f.max > f.min) list.push(['wght', f.min + '..' + f.max]);
    if (f.italic) list.push(['ital', null]);
    const custom = (tag) => (tag === tag.toUpperCase() ? 1 : 0);
    list.sort((a, b) => custom(a[0]) - custom(b[0]) || (a[0] < b[0] ? -1 : 1));
    if (!list.length) return name;
    const tuple = (i) => list.map((x) => (x[0] === 'ital' ? i : x[1])).join(',');
    return `${name}:${list.map((x) => x[0]).join(',')}@${styles.map(tuple).join(';')}`;
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
  /**
   * Pinned values of a family's other axes (slnt, GRAD, XROT, YEAR, …): [[tag, value]] for the
   * ones that differ from the axis default, sorted by tag. Values clamp to the family's range
   * and snap to 1/200 of it, so a slider drag reuses a bounded set of instances.
   */
  function customFor(f, axes) {
    const out = [];
    if (!f || !f.axes) return out;
    for (const tag of Object.keys(f.axes).sort()) {
      if (tag === 'wdth' || tag === 'opsz') continue;
      const [lo, hi, def] = f.axes[tag];
      const want = axes && Number.isFinite(+axes[tag]) ? +axes[tag] : def;
      // The grid is anchored at the default, so the default itself is never pinned slightly off.
      const grid = (hi - lo) / 200;
      const v = +TM.math.clamp(def + Math.round((TM.math.clamp(want, lo, hi) - def) / grid) * grid, lo, hi).toFixed(3);
      if (Math.abs(v - def) > 1e-9) out.push([tag, v]);
    }
    return out;
  }

  function resolve(font, designPx) {
    const f = font && byFamily.get(font.family);
    const ital = !!(f && font.italic && f.italic);
    if (!f || f.custom || (!f.axes && !ital)) return font ? font.family : '';
    const wdth = widthFor(f, font.width);
    const opsz = opszFor(f, font.opsz, designPx);
    const custom = customFor(f, font.axes);
    // Nothing to pin (only custom axes, all at their defaults): the family itself draws the same.
    if (wdth == null && opsz == null && !custom.length && !ital) return f.family;
    const name = `${f.family} ~${ital ? 'i' : ''}${wdth != null ? 'w' + wdth : ''}${opsz != null ? 'o' + opsz : ''}${custom.map(([t, v]) => '.' + t + v).join('')}`;
    const inst = instances.get(name);
    if (inst) inst.used = now();
    else {
      // `pins` (not `custom`, which marks uploaded fonts): the instance's pinned axis values.
      instances.set(name, { ...f, family: name, base: f, instance: true, ital, wdth, opsz, pins: custom, ready: null, faces: [], used: now() });
      ensure(name, font.weight);
    }
    // resolve() runs every frame, so it also does the (cheap, throttled) cleanup.
    if (instances.size > MAX_INSTANCES && now() - lastEvict > 1000) evict();
    return name;
  }

  // Instances cost ~145 KB of renderer memory each and editing creates them freely (a width
  // drag, cycling Stack's fonts), so the ones unused for a few seconds are released, oldest
  // first, beyond a soft cap. Anything drawn every frame stays: resolve() and fontString()
  // refresh `used`. A released instance is simply re-created on its next use.
  const MAX_INSTANCES = 64, IDLE_MS = 5000;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let lastEvict = -Infinity;
  function evict() {
    const t = (lastEvict = now());
    const idle = [...instances.values()].filter((x) => t - x.used > IDLE_MS).sort((a, b) => a.used - b.used);
    for (const x of idle) {
      if (instances.size <= MAX_INSTANCES * 0.75) break;
      instances.delete(x.family);
      x.faces.forEach((face) => { try { document.fonts.delete(face); } catch (e) { /* already gone */ } });
      for (const k of [...facePromises.keys()]) if (k.startsWith(x.family + '|')) facePromises.delete(k);
    }
  }

  // Families whose variable axes couldn't be applied (font CSS unreadable): exports report it.
  const axesFailed = new Set();

  /**
   * The values of `axis` a preset sweeping it should draw with: 49 evenly spaced stops across the
   * family's range (resolve() each, as width: v, opsz: v or axes: { [axis]: v }).
   */
  function ladder(family, axis = 'wdth', steps = 48) {
    const f = get(family);
    const ax = f && f.axes && f.axes[axis];
    if (!ax) return [];
    const out = [];
    for (let i = 0; i <= steps; i++) out.push(+(ax[0] + ((ax[1] - ax[0]) * i) / steps).toFixed(3));
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
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), HUNG_MS) : 0;
    const p = (typeof fetch === 'function' ? fetch(`https://fonts.googleapis.com/css2?${query}&display=swap`, { credentials: 'omit', signal: ctl ? ctl.signal : undefined }) : Promise.reject(new Error('no fetch')))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
      .finally(() => clearTimeout(timer))
      .then((css) => {
        if (!linkPromises.has(query)) {
          const style = document.createElement('style');
          style.textContent = css;
          document.head.appendChild(style);
          linkPromises.set(query, Promise.resolve());
        }
        axesFailed.delete(f.family);
        return parseFaces(css);
      })
      .catch((e) => {
        // Blocked (CSP connect-src, offline, hung): the base family still loads through a
        // <link>; width and optical size can't be pinned, and exports say so. Retry later.
        console.warn('[TM.fonts] variable axes unavailable for', f.family, '-', e.message);
        axesFailed.add(f.family);
        setTimeout(() => { if (blockPromises.get(f.family) === p) blockPromises.delete(f.family); }, 30000);
        return injectStylesheet([f.family]).then(() => []);
      });
    blockPromises.set(f.family, p);
    return p;
  }

  function addInstanceFaces(inst) {
    if (inst.ready) return inst.ready;
    inst.ready = baseFaces(inst.base).then((blocks) => {
      for (const b of blocks) {
        // An italic instance takes the italic files and registers them upright, so it draws
        // italic under a plain font string; other instances take the upright files only.
        if ((b.style === 'italic') !== !!inst.ital) continue;
        const d = { style: 'normal', weight: b.weight || '400', display: 'block' };
        if (b.unicodeRange) d.unicodeRange = b.unicodeRange;
        if (inst.wdth != null) d.stretch = inst.wdth + '%';
        else if (b.stretch) d.stretch = b.stretch;
        const vs = (inst.opsz != null ? [['opsz', inst.opsz]] : []).concat(inst.pins || []);
        if (vs.length) d.variationSettings = vs.map(([t, v]) => `"${t}" ${v}`).join(', ');
        try {
          const face = new FontFace(inst.family, `url(${b.src}) format("woff2")`, d);
          if (!instances.has(inst.family)) return; // released while its CSS was loading
          document.fonts.add(face);
          inst.faces.push(face);
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
    const inst = instances.get(family);
    if (inst) inst.used = now();
    return `${clampWeight(family, weight)} ${Math.max(0.5, sizePx).toFixed(2)}px ${cssFamily(family)}`;
  }

  /**
   * Make sure `family` (a catalogue family or an instance from resolve) at `weight` is ready for
   * canvas rendering. `text` also loads the subsets it needs (e.g. Cyrillic). Never rejects.
   */
  function ensure(family, weight = 400, text, waitMs = WAIT_MS) {
    const f = get(family);
    if (!f || !hasDOM || !document.fonts) return Promise.resolve(false);
    const w = clampWeight(family, weight);
    const sample = text ? 'AaBb09' + String(text).slice(0, 200) : 'AaBb09';
    const key = `${family}|${f.variable ? 'var' : w}|${sample}`;
    if (facePromises.has(key)) return timeout(facePromises.get(key), waitMs, false);
    const ready = f.custom ? Promise.resolve() : f.instance ? addInstanceFaces(f) : injectStylesheet([family]);
    const loaded = ready
      .then(() => document.fonts.load(`${w} 64px ${cssFamily(family)}`, sample))
      .then((faces) => {
        bump();
        return faces.length > 0 && !(f.instance && axesFailed.has(f.base.family));
      })
      .catch(() => false);
    if (facePromises.size > 600) facePromises.clear();
    facePromises.set(key, loaded);
    // Callers wait at most waitMs (false = not ready yet); the load itself carries on.
    return timeout(loaded, waitMs, false);
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
    /** True when a family's width / optical size couldn't be applied (its font CSS was unreadable). */
    axesFailed: (family) => axesFailed.has(TM.fonts.baseOf(family)),
    /** How many variable-axis instances are registered (tests, diagnostics). */
    instanceCount: () => instances.size,
    /** The catalogue family behind an instance name (or the family itself). */
    baseOf: (family) => { const f = get(family); return f && f.base ? f.base.family : family; },
    /** The width / optical size a font draws at (null when the family has no such axis). */
    widthFor: (family, width) => widthFor(get(family), width),
    opszFor: (family, opsz, designPx) => opszFor(get(family), opsz, designPx),
    /** Variable axes beyond weight by tag ({ wdth?: [min, max], opsz?: [min, max], XROT?: [min, max, def], … }), or null. */
    axes: (family) => { const f = get(family); return f && f.axes ? f.axes : null; },
    /** True when Google serves the family (or an instance's base) with true italics. */
    hasItalic: (family) => { const f = get(family); return !!(f && (f.base || f).italic); },
    /** A family's axes beyond weight as [{ tag, min, max, def }] (wdth default 100, opsz 'auto'). */
    axisList: (family) => {
      const f = get(family);
      if (!f || !f.axes) return [];
      return Object.entries(f.axes).map(([tag, r]) => ({ tag, min: r[0], max: r[1], def: tag === 'wdth' ? 100 : tag === 'opsz' ? 'auto' : r[2] }));
    },
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
