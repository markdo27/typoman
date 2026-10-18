/* TYPOMAN engine — core: namespace, math, deterministic random/noise, easing, colour, registries.
 *
 * Every engine file is a classic script that attaches to window.TM, so the same files can be
 * loaded by the studio, the embed player, or inlined into a standalone HTML export without a
 * build step. Nothing in the engine may use Math.random() or wall-clock time while rendering:
 * a frame must be a pure function of (scene, time).
 */
(function (root) {
  'use strict';

  const TM = root.TM || (root.TM = {});
  TM.VERSION = '4.0.0';

  // ───────────────────────────── math ─────────────────────────────
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
  const remap = (v, a, b, c, d) => lerp(c, d, invLerp(a, b, v));
  const fract = (x) => x - Math.floor(x);
  const mod = (x, m) => ((x % m) + m) % m;
  const smoothstep = (a, b, x) => {
    const t = clamp(invLerp(a, b, x));
    return t * t * (3 - 2 * t);
  };
  /** 0→1→0 triangle over one period. */
  const pingpong = (x) => 1 - Math.abs(1 - 2 * fract(x));
  /** Shortest signed angular difference b − a in radians. */
  const angleDelta = (a, b) => mod(b - a + Math.PI, TAU) - Math.PI;

  TM.math = { TAU, clamp, lerp, invLerp, remap, fract, mod, smoothstep, pingpong, angleDelta };

  // ─────────────────────── deterministic random ───────────────────────
  // Stateless hash-based random: the same (seed, a, b) always gives the same value, regardless
  // of call order. This is what keeps exported frames identical to the preview.
  function hash3(seed, a, b) {
    let h = 0x811c9dc5 ^ (seed | 0);
    h = Math.imul(h ^ (a | 0), 0x9e3779b1);
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h ^ (b | 0), 0x85ebca6b);
    h ^= h >>> 15;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 13;
    h = Math.imul(h, 0x27d4eb2f);
    h ^= h >>> 16;
    return h >>> 0;
  }
  /** Uniform random in [0, 1). */
  TM.rand = (seed, a = 0, b = 0) => hash3(seed, a, b) / 4294967296;
  /** Uniform random in [-1, 1). */
  TM.srand = (seed, a = 0, b = 0) => TM.rand(seed, a, b) * 2 - 1;

  // Improved Perlin noise (Ken Perlin, 2002) with a seeded permutation table. Output ≈ [-1, 1].
  const noiseCache = new Map();
  TM.noise = function (seed) {
    seed = seed | 0;
    if (noiseCache.has(seed)) return noiseCache.get(seed);
    const p = new Uint8Array(512);
    const perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(TM.rand(seed, i, 77) * (i + 1));
      const tmp = perm[i];
      perm[i] = perm[j];
      perm[j] = tmp;
    }
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const grad = (h, x, y, z) => {
      const g = h & 15;
      const u = g < 8 ? x : y;
      const v = g < 4 ? y : g === 12 || g === 14 ? x : z;
      return ((g & 1) === 0 ? u : -u) + ((g & 2) === 0 ? v : -v);
    };
    function n3(x, y = 0, z = 0) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
      x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
      const u = fade(x), v = fade(y), w = fade(z);
      const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
      const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
      return lerp(
        lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u),
             lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
        lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
             lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v),
        w);
    }
    /** Seamlessly looping 1-D noise: period-1 in `p`, sampled on a circle. */
    function loop(p, salt = 0, radius = 1) {
      const a = p * TAU;
      return n3(Math.cos(a) * radius + 31.7 + salt * 7.13, Math.sin(a) * radius + 11.3, salt * 3.71);
    }
    const api = { n3, loop };
    noiseCache.set(seed, api);
    return api;
  };

  // ───────────────────────────── easing ─────────────────────────────
  const c1 = 1.70158, c2 = c1 * 1.525, c3 = c1 + 1;
  const c4 = TAU / 3, c5 = TAU / 4.5;
  function outBounce(t) {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
  /** Damped spring step response normalised so f(1) = 1. */
  function spring(stiffness, damping) {
    const w = Math.sqrt(stiffness), z = damping / (2 * w);
    const wd = w * Math.sqrt(Math.max(1e-6, 1 - z * z));
    const raw = (t) => 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
    const end = raw(1);
    return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : raw(t) / end);
  }

  /** CSS-style cubic-bezier(x1, y1, x2, y2) solver (Newton–Raphson with bisection fallback). */
  TM.cubicBezier = function (x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    function solve(x) {
      let t = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(t) - x;
        if (Math.abs(e) < 1e-6) return t;
        const d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      let lo = 0, hi = 1;
      t = x;
      for (let i = 0; i < 30; i++) {
        const v = sx(t);
        if (Math.abs(v - x) < 1e-6) break;
        if (v < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return t;
    }
    return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
  };

  const pow = Math.pow, sin = Math.sin, cos = Math.cos, sqrt = Math.sqrt, PI = Math.PI;
  const EASINGS = {
    linear: (t) => t,
    inSine: (t) => 1 - cos((t * PI) / 2),
    outSine: (t) => sin((t * PI) / 2),
    inOutSine: (t) => -(cos(PI * t) - 1) / 2,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2),
    inQuart: (t) => t * t * t * t,
    outQuart: (t) => 1 - pow(1 - t, 4),
    inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - pow(-2 * t + 2, 4) / 2),
    inQuint: (t) => t * t * t * t * t,
    outQuint: (t) => 1 - pow(1 - t, 5),
    inOutQuint: (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - pow(-2 * t + 2, 5) / 2),
    inExpo: (t) => (t === 0 ? 0 : pow(2, 10 * t - 10)),
    outExpo: (t) => (t === 1 ? 1 : 1 - pow(2, -10 * t)),
    inOutExpo: (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? pow(2, 20 * t - 10) / 2 : (2 - pow(2, -20 * t + 10)) / 2),
    inCirc: (t) => 1 - sqrt(1 - t * t),
    outCirc: (t) => sqrt(1 - pow(t - 1, 2)),
    inOutCirc: (t) => (t < 0.5 ? (1 - sqrt(1 - pow(2 * t, 2))) / 2 : (sqrt(1 - pow(-2 * t + 2, 2)) + 1) / 2),
    inBack: (t) => c3 * t * t * t - c1 * t * t,
    outBack: (t) => 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2),
    inOutBack: (t) => (t < 0.5 ? (pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2 : (pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2),
    outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : pow(2, -10 * t) * sin((t * 10 - 0.75) * c4) + 1),
    inOutElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? -(pow(2, 20 * t - 10) * sin((20 * t - 11.125) * c5)) / 2 : (pow(2, -20 * t + 10) * sin((20 * t - 11.125) * c5)) / 2 + 1),
    outBounce,
    inBounce: (t) => 1 - outBounce(1 - t),
    spring: spring(180, 12),
    springSoft: spring(90, 14),
    springSnappy: spring(420, 26),
    // Motion-design staples expressed as cubic-béziers.
    smooth: TM.cubicBezier(0.65, 0, 0.35, 1),
    snap: TM.cubicBezier(0.85, 0, 0.15, 1),
    glide: TM.cubicBezier(0.16, 1, 0.3, 1),
    anticipate: TM.cubicBezier(0.6, -0.28, 0.735, 0.045),
    overshoot: TM.cubicBezier(0.34, 1.56, 0.64, 1),
  };
  TM.EASINGS = EASINGS;

  /** Grouped list for UI pickers: [id, label]. */
  TM.EASING_GROUPS = [
    ['Signature', [['glide', 'Glide'], ['smooth', 'Smooth'], ['snap', 'Snap'], ['overshoot', 'Overshoot'], ['anticipate', 'Anticipate']]],
    ['Physics', [['spring', 'Spring'], ['springSoft', 'Spring soft'], ['springSnappy', 'Spring snappy'], ['outBounce', 'Bounce'], ['outElastic', 'Elastic']]],
    ['Out', [['outSine', 'Out sine'], ['outQuad', 'Out quad'], ['outCubic', 'Out cubic'], ['outQuart', 'Out quart'], ['outQuint', 'Out quint'], ['outExpo', 'Out expo'], ['outCirc', 'Out circ'], ['outBack', 'Out back']]],
    ['In', [['inSine', 'In sine'], ['inQuad', 'In quad'], ['inCubic', 'In cubic'], ['inQuart', 'In quart'], ['inQuint', 'In quint'], ['inExpo', 'In expo'], ['inCirc', 'In circ'], ['inBack', 'In back'], ['inBounce', 'In bounce']]],
    ['In-out', [['inOutSine', 'In-out sine'], ['inOutQuad', 'In-out quad'], ['inOutCubic', 'In-out cubic'], ['inOutQuart', 'In-out quart'], ['inOutQuint', 'In-out quint'], ['inOutExpo', 'In-out expo'], ['inOutCirc', 'In-out circ'], ['inOutBack', 'In-out back'], ['inOutElastic', 'In-out elastic']]],
    ['Basic', [['linear', 'Linear']]],
  ];

  const bezierCache = new Map();
  /**
   * Resolve an easing spec to a function. A spec is a name from TM.EASINGS or a
   * cubic-bézier array [x1, y1, x2, y2]. Unknown specs fall back to `fallback`.
   */
  TM.ease = function (spec, fallback = 'smooth') {
    if (typeof spec === 'function') return spec;
    if (Array.isArray(spec) && spec.length === 4 && spec.every(Number.isFinite)) {
      const key = spec.join(',');
      if (!bezierCache.has(key)) bezierCache.set(key, TM.cubicBezier(spec[0], spec[1], spec[2], spec[3]));
      return bezierCache.get(key);
    }
    return EASINGS[spec] || EASINGS[fallback] || EASINGS.linear;
  };
  TM.isEaseSpec = (spec) =>
    (typeof spec === 'string' && Object.prototype.hasOwnProperty.call(EASINGS, spec)) ||
    (Array.isArray(spec) && spec.length === 4 && spec.every(Number.isFinite) &&
      spec[0] >= 0 && spec[0] <= 1 && spec[2] >= 0 && spec[2] <= 1 &&
      Math.abs(spec[1]) <= 3 && Math.abs(spec[3]) <= 3);

  // ───────────────────────────── colour ─────────────────────────────
  const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const parsed = new Map();
  function parseHex(hex) {
    if (parsed.has(hex)) return parsed.get(hex);
    let h = String(hex).slice(1);
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    const out = {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
    if (parsed.size > 512) parsed.clear();
    parsed.set(hex, out);
    return out;
  }
  const toHex2 = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  TM.color = {
    isHex: (s) => typeof s === 'string' && HEX_RE.test(s),
    parse: parseHex,
    toHex: ({ r, g, b }) => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`,
    rgba(hex, alpha = 1) {
      const c = parseHex(hex);
      return `rgba(${c.r},${c.g},${c.b},${+(c.a * alpha).toFixed(4)})`;
    },
    mix(a, b, t) {
      const x = parseHex(a), y = parseHex(b);
      return TM.color.toHex({ r: lerp(x.r, y.r, t), g: lerp(x.g, y.g, t), b: lerp(x.b, y.b, t) });
    },
    /** Sample a palette as a continuous loop at position u (0..1). */
    ramp(colors, u) {
      const n = colors.length;
      if (n === 1) return colors[0];
      const x = mod(u, 1) * n, i = Math.floor(x);
      return TM.color.mix(colors[i % n], colors[(i + 1) % n], x - i);
    },
    luminance(hex) {
      const c = parseHex(hex);
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    },
    contrast(a, b) {
      const la = TM.color.luminance(a), lb = TM.color.luminance(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    },
    hsl(h, s, l) {
      s /= 100;
      l /= 100;
      const k = (n) => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return TM.color.toHex({ r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 });
    },
  };

  /** Curated palettes: [id, label, background, colours...]. */
  TM.PALETTES = [
    ['klein', 'Klein', '#0015ff', '#ffffff', '#a3a2ff', '#00e5ff'],
    ['acid', 'Acid', '#0b0b0c', '#d4ff3a', '#ffffff', '#7a7a7a'],
    ['bauhaus', 'Bauhaus', '#f1ede4', '#e63326', '#1d3fbb', '#f6bf26', '#111111'],
    ['sunset', 'Sunset', '#1b0a2e', '#ff5e5b', '#ffb547', '#ffe3a3', '#ff2e88'],
    ['mint', 'Mint', '#062925', '#5cffc8', '#eafff7', '#00b38f'],
    ['paper', 'Paper', '#f4f1ea', '#141414', '#ff3d00', '#7c7c7c'],
    ['neon', 'Neon', '#07000f', '#ff00e5', '#00f0ff', '#faff00', '#ffffff'],
    ['blush', 'Blush', '#ffd6e0', '#2b0a3d', '#ff3e6c', '#ffffff'],
    ['forest', 'Forest', '#0d1f12', '#e8f5a3', '#7bd389', '#f6f6f6'],
    ['mono', 'Mono', '#000000', '#ffffff', '#9a9a9a', '#4a4a4a'],
    ['ember', 'Ember', '#120403', '#ff4d00', '#ffa600', '#fff1d6'],
    ['ocean', 'Ocean', '#03132e', '#4cc9f0', '#f72585', '#e0fbfc'],
  ];

  // ──────────────────────────── registries ────────────────────────────
  TM.presets = Object.create(null);
  TM.presetOrder = [];
  TM.CATEGORIES = ['Path', 'Kinetic', 'Reveal', 'Glitch', 'Dimensional', 'Generative'];

  const PARAM_TYPES = new Set(['range', 'select', 'toggle', 'color', 'ease']);

  /**
   * Register a motion preset. See docs/ENGINE.md for the full contract.
   * def: { id, name, category, description, usesPath?, path?, fit?, params: [...], setup?(f), render(f) }
   */
  TM.registerPreset = function (def) {
    if (!def || typeof def.id !== 'string' || typeof def.render !== 'function') {
      throw new Error('TM.registerPreset: a preset needs an id and a render(f) function');
    }
    (def.params || []).forEach((p) => {
      if (!PARAM_TYPES.has(p.type)) throw new Error(`Preset ${def.id}: unknown param type "${p.type}" for ${p.key}`);
    });
    def.params = def.params || [];
    def.category = def.category || 'Kinetic';
    def.usesPath = !!def.usesPath;
    def.fit = def.fit !== undefined ? !!def.fit : !def.usesPath;
    if (!TM.presets[def.id]) TM.presetOrder.push(def.id);
    TM.presets[def.id] = def;
    return def;
  };
  TM.getPreset = (id) => TM.presets[id] || null;

  /** Default parameter values for a preset. */
  TM.presetDefaults = function (id) {
    const def = TM.presets[id];
    const out = {};
    if (!def) return out;
    for (const p of def.params) out[p.key] = Array.isArray(p.default) ? p.default.slice() : p.default;
    return out;
  };

  // ───────────────────── shared parameter builders ─────────────────────
  // Presets compose these so equivalent controls look and behave the same everywhere.
  TM.ORDERS = [
    ['start', 'First → last'],
    ['end', 'Last → first'],
    ['center', 'Center out'],
    ['edges', 'Edges in'],
    ['random', 'Random'],
    ['words', 'By word'],
    ['lines', 'By line'],
  ];
  TM.P = {
    range: (key, label, min, max, step, def, extra) => Object.assign({ key, label, type: 'range', min, max, step, default: def }, extra),
    select: (key, label, options, def, extra) => Object.assign({ key, label, type: 'select', options, default: def }, extra),
    toggle: (key, label, def, extra) => Object.assign({ key, label, type: 'toggle', default: !!def }, extra),
    color: (key, label, def, extra) => Object.assign({ key, label, type: 'color', default: def }, extra),
    ease: (key, label, def, extra) => Object.assign({ key, label, type: 'ease', default: def }, extra),
    stagger: (def = 0.5) => TM.P.range('stagger', 'Stagger', 0, 0.95, 0.01, def, { group: 'Timing' }),
    order: (def = 'start') => TM.P.select('order', 'Order', TM.ORDERS, def, { group: 'Timing' }),
    /** In → hold → out sequencing used by reveal-style presets (read by f.seq). */
    sequence: (o = {}) => [
      TM.P.select('timing', 'Timing', [['inout', 'In → Hold → Out'], ['in', 'In → Hold']], o.timing || 'inout', { group: 'Timing' }),
      TM.P.range('inDur', 'In length', 0.05, 0.9, 0.01, o.inDur != null ? o.inDur : 0.4, { group: 'Timing' }),
      TM.P.range('outDur', 'Out length', 0.05, 0.9, 0.01, o.outDur != null ? o.outDur : 0.3, { group: 'Timing' }),
      TM.P.stagger(o.stagger != null ? o.stagger : 0.5),
      TM.P.order(o.order || 'start'),
      TM.P.ease('easeIn', 'Ease in', o.easeIn || 'glide', { group: 'Timing' }),
      TM.P.ease('easeOut', 'Ease out', o.easeOut || 'inCubic', { group: 'Timing' }),
    ],
  };
})(typeof window !== 'undefined' ? window : globalThis);
