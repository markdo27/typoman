/* TYPOMAN engine — curated font catalogue and loader (Google Fonts + user-uploaded fonts).
 *
 * Only families in this catalogue (or fonts the user uploads locally) can be used. That keeps
 * URL-loaded scenes from injecting arbitrary stylesheet URLs, and guarantees every weight we
 * ask for exists, since the Google Fonts css2 API rejects out-of-range axis requests.
 */
(function (root) {
  'use strict';
  const TM = root.TM;

  // [family, category, minWeight, maxWeight, discreteWeights?]
  // min < max with no discrete list means a variable font with a continuous weight axis.
  const CATALOGUE = [
    // Condensed
    ['Anton', 'Condensed', 400, 400],
    ['Bebas Neue', 'Condensed', 400, 400],
    ['Oswald', 'Condensed', 200, 700],
    ['League Gothic', 'Condensed', 400, 400],
    ['Big Shoulders Display', 'Condensed', 100, 900],
    ['Six Caps', 'Condensed', 400, 400],
    // Grotesk
    ['Inter Tight', 'Grotesk', 100, 900],
    ['Space Grotesk', 'Grotesk', 300, 700],
    ['Bricolage Grotesque', 'Grotesk', 200, 800],
    ['Archivo', 'Grotesk', 100, 900],
    ['Archivo Black', 'Grotesk', 400, 400],
    ['Roboto Flex', 'Grotesk', 100, 1000],
    ['Anybody', 'Grotesk', 100, 900],
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
    ['Fraunces', 'Serif', 100, 900],
    ['Playfair Display', 'Serif', 400, 900],
    ['Bodoni Moda', 'Serif', 400, 900],
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
  const FONTS = CATALOGUE.map(([family, cat, min, max, discrete]) => ({
    family,
    cat,
    min,
    max,
    weights: discrete || null,
    variable: !discrete && max > min,
    fallback: FALLBACK[cat] || 'sans-serif',
    custom: false,
  }));
  const byFamily = new Map(FONTS.map((f) => [f.family, f]));

  TM.FONTS = FONTS;
  TM.FONT_CATEGORIES = ['Condensed', 'Grotesk', 'Display', 'Serif', 'Mono', 'Script', 'Custom'];

  const hasDOM = typeof document !== 'undefined';
  const linkPromises = new Map(); // css2 query → Promise
  const facePromises = new Map(); // "family|weight" → Promise
  let version = 0;
  const listeners = new Set();

  function bump() {
    version++;
    listeners.forEach((fn) => {
      try { fn(version); } catch (e) { console.error(e); }
    });
  }
  if (hasDOM && document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', bump);
  }

  function familyQuery(f) {
    const name = f.family.replace(/ /g, '+');
    if (f.weights) return `${name}:wght@${f.weights.join(';')}`;
    if (f.max > f.min) return `${name}:wght@${f.min}..${f.max}`;
    return name;
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
    return byFamily.get(family) || null;
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
    return `"${safe}", ${f ? f.fallback : 'sans-serif'}`;
  }

  /** Canvas font shorthand. Weight is clamped to what the family supports. */
  function fontString(family, weight, sizePx) {
    return `${clampWeight(family, weight)} ${Math.max(0.5, sizePx).toFixed(2)}px ${cssFamily(family)}`;
  }

  /** Make sure `family` at `weight` is ready for canvas rendering. Never rejects. */
  function ensure(family, weight = 400) {
    const f = get(family);
    if (!f || !hasDOM || !document.fonts) return Promise.resolve(false);
    const w = clampWeight(family, weight);
    const key = `${family}|${f.variable ? 'var' : w}`;
    if (facePromises.has(key)) return facePromises.get(key);
    const promise = (f.custom ? Promise.resolve() : injectStylesheet([family]))
      .then(() => document.fonts.load(`${w} 64px ${cssFamily(family)}`, 'AaBb09'))
      .then((faces) => {
        bump();
        return faces.length > 0;
      })
      .catch(() => false);
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
