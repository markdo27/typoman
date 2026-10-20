/* TYPOMAN engine — text layout.
 *
 * Splits text into grapheme clusters (so emoji and accented letters stay whole) and lays
 * them out line by line. Glyph x positions come from measuring each line *prefix* minus the
 * glyph's own advance, so the font's kerning survives even though presets draw every glyph
 * separately.
 *
 * Layout space: pixels, origin at the visual centre of the text block, y down. A glyph's
 * `y` is its baseline; `cy` is the vertical centre of its cap-height box.
 */
(function (root) {
  'use strict';
  const TM = root.TM;

  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const graphemes = (s) => (segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s));

  // Right-to-left scripts (Hebrew, Arabic, Syriac, Thaana, N'Ko and presentation forms).
  const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
  /**
   * Split a line into the clusters presets animate. Lines containing RTL script use whole
   * words (shaped runs, so Arabic keeps its joined forms); everything else uses graphemes.
   */
  function clustersFor(line) {
    if (!RTL_CHAR.test(line)) return { parts: graphemes(line), rtl: false };
    // Base direction from the first strong character, as the bidi algorithm (P2) and dir="auto" do.
    const first = line.match(/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]|[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/u);
    const rtl = !!first && RTL_CHAR.test(first[0]);
    return { parts: line.match(/\s+|\S+/gu) || [], rtl };
  }

  /**
   * Visual left-to-right order of a mixed-direction line's word clusters: the Unicode bidi
   * algorithm's rule L2 applied at word level. Each word is shaped by fillText on its own, so
   * only the words' order needs resolving. RTL words sit at level 1; LTR words and numbers at
   * the next even level above the base (0 in an LTR line, 2 in an RTL one); whitespace and
   * punctuation take their neighbours' level when both agree, else the base. Runs are then
   * reversed from the highest level down, so "שלום Type in Motion עולם" keeps "Type in
   * Motion" reading left to right.
   */
  function visualOrder(parts, rtl) {
    const base = rtl ? 1 : 0, ltrLevel = rtl ? 2 : 0;
    const strong = parts.map((p) => (RTL_CHAR.test(p) ? 1 : /[\p{L}\p{N}]/u.test(p) ? ltrLevel : -1));
    const level = strong.map((v, k) => {
      if (v >= 0) return v;
      let a = base, b = base;
      for (let j = k - 1; j >= 0; j--) if (strong[j] >= 0) { a = strong[j]; break; }
      for (let j = k + 1; j < parts.length; j++) if (strong[j] >= 0) { b = strong[j]; break; }
      return a === b ? a : base;
    });
    const order = parts.map((_, k) => k);
    for (let L = Math.max(0, ...level); L >= 1; L--) {
      for (let k = 0; k < order.length;) {
        if (level[order[k]] < L) { k++; continue; }
        let e = k;
        while (e < order.length && level[order[e]] >= L) e++;
        const run = order.slice(k, e).reverse();
        for (let j = 0; j < run.length; j++) order[k + j] = run[j];
        k = e;
      }
    }
    return order;
  }

  // Title case keeps short articles, conjunctions and prepositions lowercase unless they open or
  // close a line ("Type in Motion", "Made for the Web").
  const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'en', 'for', 'if', 'in', 'nor', 'of', 'on', 'or', 'per', 'so', 'the', 'to', 'up', 'via', 'vs', 'yet']);
  function titleCase(text) {
    return text.split('\n').map((line) => {
      const words = line.toLowerCase().split(/(\s+)/u);
      const real = words.map((w, i) => (/\S/u.test(w) ? i : -1)).filter((i) => i >= 0);
      const first = real[0], last = real[real.length - 1];
      return words.map((w, i) => {
        if (!/\S/u.test(w)) return w;
        const bare = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
        if (i !== first && i !== last && MINOR.has(bare)) return w;
        // Hyphenated compounds follow the same rule inside: "state-of-the-art" → "State-of-the-Art".
        return w.split(/([\-‐])/u).map((part, j) => {
          if (j % 2 || (j > 0 && MINOR.has(part.replace(/[^\p{L}\p{N}]+/gu, '')))) return part;
          return part.replace(/^([^\p{L}\p{N}]*)(\p{L})/u, (m, p, c) => p + c.toUpperCase());
        }).join('');
      }).join('');
    }).join('\n');
  }

  function applyCase(text, mode) {
    switch (mode) {
      case 'upper': return text.toUpperCase();
      case 'lower': return text.toLowerCase();
      case 'title': return titleCase(text);
      default: return text;
    }
  }

  let scratch = null;
  function measureCtx() {
    if (!scratch) {
      const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas');
      scratch = c.getContext('2d');
    }
    return scratch;
  }

  const cache = new Map();

  /**
   * opts: { text, family, weight, sizePx, tracking (em), leading (× size), align, case }
   * Returns { glyphs, lines, width, height, sizePx, capH, ascent, descent, font, count, words }.
   */
  function layout(opts) {
    const key = [opts.text, opts.family, opts.weight, opts.sizePx.toFixed(2), opts.tracking, opts.leading, opts.align, opts.case, TM.fonts.version()].join('\u0001');
    const hit = cache.get(key);
    if (hit) return hit;

    const ctx = measureCtx();
    const font = TM.fonts.fontString(opts.family, opts.weight, opts.sizePx);
    ctx.font = font;
    if ('fontKerning' in ctx) ctx.fontKerning = 'normal';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    const size = opts.sizePx;
    const track = (opts.tracking || 0) * size;
    const capM = ctx.measureText('H');
    const capH = capM.actualBoundingBoxAscent || size * 0.7;
    const asc = capM.fontBoundingBoxAscent || size * 0.9;
    const desc = capM.fontBoundingBoxDescent || size * 0.25;
    const lineGap = size * (opts.leading || 1);

    const raw = applyCase(String(opts.text || ''), opts.case).replace(/\r/g, '');
    const lineTexts = raw.split('\n');
    const lines = [];
    const glyphs = [];
    let maxW = 0, wordIndex = 0, visible = 0;

    lineTexts.forEach((lineText, li) => {
      const { parts, rtl } = clustersFor(lineText);
      // prefix[k] = kerned width of clusters 0..k-1; adv[k] = cluster k's own advance. Cluster k's
      // pen position is prefix[k+1] - adv[k]: that includes its kern with the cluster before it
      // (prefix[k] alone would apply every kern one pair late).
      const prefix = new Float64Array(parts.length + 1);
      const adv = new Float64Array(parts.length);
      let acc = '';
      for (let k = 0; k < parts.length; k++) {
        acc += parts[k];
        prefix[k + 1] = ctx.measureText(acc).width;
        adv[k] = ctx.measureText(parts[k]).width;
      }
      const lineW = prefix[parts.length] + Math.max(0, parts.length - 1) * track;
      maxW = Math.max(maxW, lineW);
      const line = { index: li, text: lineText, width: lineW, x: 0, y: 0, glyphs: [], rtl };
      // Mixed-direction lines (any RTL script) place word clusters in bidi visual order; each
      // cluster's own advance plus tracking, spread to the measured line width.
      let visX = null;
      if (RTL_CHAR.test(lineText)) {
        const order = visualOrder(parts, rtl);
        visX = new Float64Array(parts.length);
        const sum = adv.reduce((a, b) => a + b, 0);
        const scale = sum > 0 ? prefix[parts.length] / sum : 1;
        let x = 0;
        order.forEach((k, n) => { visX[k] = x; x += adv[k] * scale + track; void n; });
      }
      let inWord = false;
      parts.forEach((ch, k) => {
        const isSpace = /^\s+$/u.test(ch);
        if (!isSpace && !inWord) { inWord = true; } else if (isSpace && inWord) { inWord = false; wordIndex++; }
        const g = {
          ch,
          i: glyphs.length,
          vi: isSpace ? -1 : visible++,
          line: li,
          li: k,
          word: wordIndex,
          isSpace,
          // Lines with RTL script use bidi visual order (RTL words right to left, LTR runs inside
          // them left to right); others the kerned pen position.
          x: visX ? visX[k] : prefix[k + 1] - adv[k] + k * track,
          w: adv[k],
          y: 0,
          cx: 0,
          cy: 0,
        };
        line.glyphs.push(g.i);
        glyphs.push(g);
      });
      if (inWord) wordIndex++;
      lines.push(line);
    });

    // Vertical: centre the block of cap-height boxes on the origin.
    const n = lines.length;
    const blockH = (n - 1) * lineGap + capH;
    lines.forEach((line, li) => {
      line.y = -blockH / 2 + capH + li * lineGap;
      line.x = opts.align === 'left' ? -maxW / 2 : opts.align === 'right' ? maxW / 2 - line.width : -line.width / 2;
      for (const gi of line.glyphs) {
        const g = glyphs[gi];
        g.x += line.x;
        g.y = line.y;
        g.cx = g.x + g.w / 2;
        g.cy = g.y - capH / 2;
        g.n = line.glyphs.length;
      }
    });

    const out = {
      glyphs,
      lines,
      width: maxW,
      height: blockH,
      sizePx: size,
      capH,
      ascent: asc,
      descent: desc,
      lineGap,
      font,
      count: visible,
      words: wordIndex,
      tracking: track,
    };
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    cache.set(key, out);
    return out;
  }

  /** Advance width of a single grapheme at a given weight (cached; used for weight-animating presets). */
  const advCache = new Map();
  function advance(ch, family, weight, sizePx) {
    const w = TM.fonts.clampWeight(family, weight);
    const key = ch + '|' + family + '|' + w + '|' + sizePx.toFixed(1) + '|' + TM.fonts.version();
    let v = advCache.get(key);
    if (v === undefined) {
      const ctx = measureCtx();
      ctx.font = TM.fonts.fontString(family, w, sizePx);
      v = ctx.measureText(ch).width;
      if (advCache.size > 4000) advCache.clear();
      advCache.set(key, v);
    }
    return v;
  }

  TM.text = { layout, advance, graphemes, applyCase };
})(typeof window !== 'undefined' ? window : globalThis);
