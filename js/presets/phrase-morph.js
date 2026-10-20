/* Preset: Phrase Morph — each line is a phrase, and letters shared with the next phrase glide
 * to their new places while the others dissolve out and in (a "magic move" for type).
 * Matching is an order-preserving longest common subsequence on letters (case-insensitive), so
 * moving letters never cross. The last phrase morphs back into the first, so it loops.
 */
(function (TM) {
  'use strict';
  const { clamp } = TM.math;

  /** Index pairs [[i, j]] of an LCS between two letter sequences (spaces never match). */
  function match(a, b) {
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i].key && a[i].key === b[j].key ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const pairs = [];
    for (let i = 0, j = 0; i < n && j < m;) {
      if (a[i].key && a[i].key === b[j].key) { pairs.push([i, j]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    return pairs;
  }

  TM.registerPreset({
    id: 'phrase-morph',
    name: 'Phrase Morph',
    category: 'Kinetic',
    description: 'One line per phrase: shared letters glide into the next phrase, the rest dissolve. Put each phrase on its own line.',
    // Lines are phrases, so the renderer must not fit (or re-wrap) the block; each phrase is
    // fitted here instead, all at one size so the phrases don't jump in scale.
    fit: false,
    params: [
      TM.P.range('hold', 'Hold', 0, 0.85, 0.01, 0.45, { group: 'Timing', hint: 'Share of each phrase’s time spent still' }),
      TM.P.stagger(0.35),
      TM.P.ease('ease', 'Ease', 'smooth', { group: 'Timing' }),
      TM.P.range('arc', 'Arc', -1, 1, 0.01, 0.35, { group: 'Motion', hint: 'Moving letters hop over (or dip under) their path, in cap heights' }),
      TM.P.select('dissolve', 'Others', [['fade', 'Fade'], ['drop', 'Drop'], ['scale', 'Scale'], ['blur', 'Blur']], 'drop', { group: 'Motion' }),
      TM.P.toggle('caseless', 'Match any case', true, { group: 'Motion', hint: 'Let "a" carry over to "A"' }),
    ],

    setup(f) {
      const ly = f.layer;
      let phrases = String(ly.text || '').split('\n').map((t) => t.trim()).filter(Boolean);
      // One line of several words morphs word to word ("SUMMER SALE" → SUMMER → SALE).
      if (phrases.length === 1 && /\s/.test(phrases[0])) phrases = phrases[0].split(/\s+/);
      if (!phrases.length) phrases.push(' ');
      const at = (t, sizePx) => TM.text.layout({
        text: t, family: ly.font.family, weight: ly.font.weight, sizePx, tracking: ly.type.tracking,
        leading: ly.type.leading, align: ly.type.align, case: ly.type.case,
      });
      // One size for every phrase: the layer's, shrunk so the widest phrase fits the frame.
      let size = Math.max(1, ly.type.size * f.unit);
      const widest = Math.max(...phrases.map((t) => at(t, size).width));
      const k = Math.min(1, (f.W * 0.9) / Math.max(1, widest));
      if (k < 0.999) size = Math.max(1, size * k);
      const lay = phrases.map((t) => at(t, size));
      const keyOf = (g) => (g.isSpace ? '' : f.params.caseless ? g.ch.toLowerCase() : g.ch);
      const seqs = lay.map((L) => L.glyphs.map((g) => ({ g, key: keyOf(g) })));
      const links = seqs.map((s, k) => match(s, seqs[(k + 1) % seqs.length]));
      return { lay, seqs, links, capH: lay[0].capH, size };
    },

    render(f) {
      const P = f.params, C = f.cache;
      const n = C.lay.length;
      // Phrase k owns [k/n, (k+1)/n): it holds, then morphs into phrase k+1.
      const pos = f.p * n;
      const k = Math.floor(pos) % n, local = pos - Math.floor(pos);
      const next = (k + 1) % n;
      const A = C.seqs[k], B = C.seqs[next];
      const raw = clamp((local - P.hold) / Math.max(1e-4, 1 - P.hold));
      const ease = f.ease(P.ease);
      if (n === 1 || raw <= 0) {
        A.forEach((it) => { if (!it.g.isSpace) draw(f, it.g, { x: f.cx + it.g.cx, y: f.cy + it.g.cy }); });
        return;
      }
      const pairs = C.links[k];
      const fromA = new Map(pairs.map(([i, j]) => [i, j]));
      const toB = new Set(pairs.map(([, j]) => j));
      // Stagger along the destination line, left to right (through the stagger curve and jitter).
      const total = Math.max(1, B.length - 1);
      const st = (j) => f.stagger(raw, j / total, P.stagger);
      const capH = C.capH;
      const out = (it, u) => dissolve(f, it.g, f.cx + it.g.cx, f.cy + it.g.cy, 1 - u, P, capH, false);
      const inn = (it, u) => dissolve(f, it.g, f.cx + it.g.cx, f.cy + it.g.cy, u, P, capH, true);
      A.forEach((it, i) => {
        if (it.g.isSpace) return;
        const j = fromA.get(i);
        if (j === undefined) { out(it, ease(clamp(raw * 1.6))); return; }
        const b = B[j];
        const u = ease(st(j));
        // Glide on a gentle arc; the letter shown switches to the destination's at mid-flight
        // (they match, but case or the font's form may differ).
        const x = f.cx + it.g.cx + (b.g.cx - it.g.cx) * u;
        const y = f.cy + it.g.cy + (b.g.cy - it.g.cy) * u - P.arc * capH * Math.sin(Math.PI * u);
        const g = u < 0.5 ? it.g : b.g;
        draw(f, g, { x, y });
      });
      B.forEach((it, j) => {
        if (it.g.isSpace || toB.has(j)) return;
        inn(it, ease(clamp(st(j) * 1.25 - 0.25)));
      });
    },

    looks: [
      { name: 'Keynote', bg: { type: 'solid', color: '#0b0b0f' }, layer: { font: { family: 'Inter Tight', weight: 700 }, type: { case: 'none' }, fill: { type: 'solid', color: '#f5f5f7' }, params: { dissolve: 'fade', arc: 0.15, stagger: 0.25 } } },
      { name: 'Poster swap', bg: { type: 'solid', color: '#ff3b00' }, layer: { font: { family: 'Anton', weight: 400 }, fill: { type: 'solid', color: '#111111' }, params: { dissolve: 'drop', arc: 0.6, stagger: 0.45, ease: 'overshoot' } } },
      { name: 'Serif shuffle', bg: { type: 'solid', color: '#f4f1ea' }, layer: { font: { family: 'Fraunces', weight: 500 }, type: { case: 'none' }, fill: { type: 'solid', color: '#1d1d1d' }, params: { dissolve: 'blur', arc: -0.25, stagger: 0.3, ease: 'glide' } } },
      { name: 'Neon swap', bg: { type: 'solid', color: '#07000f' }, layer: { font: { family: 'Unbounded', weight: 800 }, fill: { type: 'palette', palette: ['#ff00e5', '#00f0ff', '#faff00'] }, fx: { glow: { amount: 0.4, color: '#ff00e5' } }, params: { dissolve: 'scale', arc: 0.4 } } },
    ],
  });

  /**
   * drawGlyph at the phrases' fitted size: the renderer lays the layer out at its own size, so
   * glyphs from the smaller fitted layouts pass that size and their advance in its units.
   */
  function draw(f, g, o) {
    const k = f.cache.size / f.size;
    f.drawGlyph(g, Object.assign({ size: f.cache.size, w: g.w / k }, o));
  }

  /** A letter leaving (u: 1 → 0) or arriving (u: 0 → 1) on its own. */
  function dissolve(f, g, x, y, u, P, capH, arriving) {
    if (u <= 0.001) return;
    const dir = arriving ? -1 : 1;
    switch (P.dissolve) {
      // Leaving letters fall away; arriving ones drop in from above.
      case 'drop': draw(f, g, { x, y: y + (arriving ? -1 : 1) * (1 - u) * capH * 0.8, alpha: u, rot: (1 - u) * 0.3 * dir }); break;
      case 'scale': draw(f, g, { x, y, scale: 0.2 + 0.8 * u, alpha: u }); break;
      case 'blur': draw(f, g, { x, y, alpha: u * u, scale: 1 + (1 - u) * 0.25 }); break;
      default: draw(f, g, { x, y, alpha: u });
    }
  }
})(window.TM);
