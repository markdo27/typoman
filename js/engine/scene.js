/* TYPOMAN engine — scene schema: defaults, sanitising normaliser, compact URL encoding.
 *
 * A scene is plain JSON. Every scene that crosses a trust boundary (URL hash, embed
 * attribute, localStorage, file import) goes through TM.Scene.normalize(), which fills
 * defaults, clamps numbers, whitelists enums / fonts / presets and drops unknown keys.
 */
(function (root) {
  'use strict';
  const TM = root.TM;
  const { clamp } = TM.math;

  const FPS_OPTIONS = [24, 25, 30, 50, 60];
  const MAX_LAYERS = 6;
  const MAX_TEXT = 400;
  const MAX_NODES = 96;
  const MAX_KEYS = 4; // path keyframes after the main path: A → B → C → D → E

  const ASPECTS = [
    ['16:9', 'Landscape 16:9', 1920, 1080],
    ['9:16', 'Story 9:16', 1080, 1920],
    ['1:1', 'Square 1:1', 1080, 1080],
    ['4:5', 'Portrait 4:5', 1080, 1350],
    ['21:9', 'Cinema 21:9', 2520, 1080],
    ['3:1', 'Banner 3:1', 2400, 800],
  ];

  function defaultLayer(overrides) {
    const layer = {
      id: 'l1',
      name: 'Text',
      visible: true,
      text: 'TYPE IN\nMOTION',
      preset: 'path-flow',
      params: {},
      // width: wdth % and opsz: 'auto' | number apply to families with those variable axes;
      // axes: { TAG: value } pins any other axis (slnt, XROT, YEAR, MORF, …) a family has.
      font: { family: 'Anton', weight: 400, width: 100, opsz: 'auto', axes: {} },
      // wrap: 'auto' re-wraps lines that would otherwise shrink to fit the frame; 'off' keeps them.
      type: { size: 0.16, tracking: 0, leading: 0.95, align: 'center', case: 'upper', slant: 0, wrap: 'auto' },
      fill: { type: 'solid', color: '#ffffff', color2: '#00e5ff', angle: 90, palette: ['#ffffff', '#a3a2ff', '#00e5ff'] },
      stroke: { mode: 'none', width: 0.035, color: '#000000' },
      path: null,
      pathMorph: { enabled: false, target: null, ease: 'smooth', keys: [], eases: [], mode: 'pingpong' },
      fx: {
        echo: { count: 0, spacing: 0.035, fade: 0.55, palette: false },
        blur: 0,
        glow: { amount: 0, color: '#ffffff' },
        shadow: { amount: 0, angle: 45, distance: 0.02, color: '#000000' },
        extrude: { depth: 0, angle: 45, color: '#000000' },
      },
      anchor: { x: 0.5, y: 0.5 },
      // Per-layer timing: start later, run whole cycles faster, or play once and hold.
      time: { delay: 0, cycles: 1, mode: 'loop' },
      // Track matte: show this layer only inside ('alpha') or outside ('alphaInvert') the ink of
      // the layer below it. That layer becomes the matte and is hidden unless `show`.
      matte: { mode: 'none', show: false },
      // Transform keyframes on top of any preset, over the layer's own loop: offsets in frame
      // fractions, scale, rotation in degrees, opacity; each key eases into the next.
      transform: { enabled: false, keys: [] },
    };
    return overrides ? merge(layer, overrides) : layer;
  }

  function defaults() {
    return {
      v: 1,
      name: 'Untitled',
      size: { w: 1920, h: 1080 },
      duration: 4,
      fps: 60,
      seed: 7,
      bg: { type: 'solid', color: '#0015ff', color2: '#000000', angle: 90 },
      post: { grain: 0, vignette: 0 },
      layers: [defaultLayer()],
    };
  }

  // ───────────────────────────── helpers ─────────────────────────────
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  // Keys that would reach an object's prototype; JSON.parse makes "__proto__" an own key.
  const UNSAFE_KEY = new Set(['__proto__', 'constructor', 'prototype']);
  function merge(base, over) {
    if (!isObj(over)) return base;
    for (const k of Object.keys(over)) {
      if (UNSAFE_KEY.has(k)) continue;
      if (isObj(base[k]) && isObj(over[k])) merge(base[k], over[k]);
      else base[k] = over[k];
    }
    return base;
  }
  const num = (v, d, lo, hi) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? clamp(n, lo, hi) : d;
  };
  const int = (v, d, lo, hi) => Math.round(num(v, d, lo, hi));
  /** Pinned variable-axis values { TAG: number }: four-letter tags, at most 12 (families clamp). */
  function cleanAxes(a) {
    const out = {};
    if (!isObj(a)) return out;
    for (const k of Object.keys(a).slice(0, 32)) {
      if (!/^[A-Za-z0-9]{4}$/.test(k) || k === 'wght' || k === 'wdth' || k === 'opsz' || UNSAFE_KEY.has(k)) continue;
      const v = num(a[k], NaN, -1e5, 1e5);
      if (Number.isFinite(v) && Object.keys(out).length < 12) out[k] = Math.round(v * 1000) / 1000;
    }
    return out;
  }
  /** Optical size: a pinned number, or 'auto' (follow the text size) for anything else. */
  const opszOf = (v) => ((typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v)) ? int(v, 14, 1, 1000) : 'auto');
  const bool = (v, d) => (typeof v === 'boolean' ? v : d);
  const color = (v, d) => (TM.color.isHex(v) ? v.toLowerCase() : d);
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  const ease = (v, d) => (TM.isEaseSpec(v) ? (Array.isArray(v) ? v.map((x) => +(+x).toFixed(4)) : v) : d);
  function cleanText(v, d) {
    if (typeof v !== 'string') return d;
    // Keep newlines; drop other control characters.
    return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').slice(0, MAX_TEXT);
  }

  const PRESET_ID = /^[a-z0-9-]{1,24}$/;
  function cleanPath(p, aspect) {
    if (!isObj(p)) return null;
    // A bare { preset } (how share links store untouched preset paths) is regenerated.
    if (!Array.isArray(p.nodes) && typeof p.preset === 'string' && PRESET_ID.test(p.preset) && TM.Path.PRESETS.some((x) => x.id === p.preset)) {
      return TM.Path.preset(p.preset, aspect || 16 / 9);
    }
    if (!Array.isArray(p.nodes) || p.nodes.length < 1) return null;
    const nodes = p.nodes.slice(0, MAX_NODES).map((n) => ({
      x: num(n && n.x, 0.5, -1, 2),
      y: num(n && n.y, 0.5, -1, 2),
      ix: num(n && n.ix, 0, -2, 2),
      iy: num(n && n.iy, 0, -2, 2),
      ox: num(n && n.ox, 0, -2, 2),
      oy: num(n && n.oy, 0, -2, 2),
      k: pick(n && n.k, ['corner', 'smooth', 'mirror'], 'smooth'),
    }));
    const out = { closed: bool(p.closed, false) && nodes.length > 2, nodes };
    if (typeof p.preset === 'string' && PRESET_ID.test(p.preset)) out.preset = p.preset;
    return out;
  }

  /**
   * Path keyframes. keys[] holds up to MAX_KEYS morph targets (B, C, …) visited after the main
   * path A each loop; `ease` eases A → B and eases[i] eases the step out of keys[i].
   * mode 'pingpong' plays A → … → last and back (with one key, the classic A → B → A);
   * 'cycle' returns from the last key straight to A. `target` always mirrors keys[0], so old
   * scenes and links (target only) keep working, and code that sets just `target` still
   * edits keys[0]. Code that edits keys[] must set target = keys[0] too.
   */
  function cleanMorph(pm, aspect) {
    pm = isObj(pm) ? pm : {};
    const keys = (Array.isArray(pm.keys) ? pm.keys.slice(0, MAX_KEYS) : []).map((k) => cleanPath(k, aspect)).filter(Boolean);
    const target = cleanPath(pm.target, aspect);
    if (target) keys[0] = target;
    const eases = Array.isArray(pm.eases) ? pm.eases : [];
    return {
      enabled: bool(pm.enabled, false),
      target: keys[0] || null,
      ease: ease(pm.ease, 'smooth'),
      keys,
      eases: keys.map((_, i) => ease(eases[i], 'smooth')),
      mode: pick(pm.mode, ['pingpong', 'cycle'], 'pingpong'),
    };
  }

  /** Sanitise preset params against the preset's declared schema. */
  function cleanParams(presetId, params) {
    const def = TM.getPreset(presetId);
    const out = {};
    if (!def) return out;
    const src = isObj(params) ? params : {};
    for (const p of def.params) {
      const v = src[p.key];
      switch (p.type) {
        case 'range': {
          // Snap to the declared step: e.g. whole "cycles" keep loops seamless even for URL input.
          let x = num(v, p.default, p.min, p.max);
          if (p.step > 0 && x !== p.default) {
            const dp = String(p.step).includes('.') ? String(p.step).split('.')[1].length : 0;
            x = +(Math.round((x - p.min) / p.step) * p.step + p.min).toFixed(dp);
            x = clamp(x, p.min, p.max);
          }
          out[p.key] = x;
          break;
        }
        case 'select': out[p.key] = pick(v, p.options.map((o) => o[0]), p.default); break;
        case 'toggle': out[p.key] = bool(v, p.default); break;
        case 'color': out[p.key] = color(v, p.default); break;
        case 'ease': out[p.key] = ease(v, p.default); break;
      }
    }
    return out;
  }

  function normalizeLayer(src, index, aspect) {
    const d = defaultLayer();
    const s = isObj(src) ? src : {};
    // typeof first: TM.getPreset(['wave']) would coerce the array to the key 'wave'.
    const presetId = typeof s.preset === 'string' && TM.getPreset(s.preset) ? s.preset : TM.getPreset(d.preset) ? d.preset : TM.presetOrder[0] || d.preset;
    const preset = TM.getPreset(presetId);
    const family = TM.fonts.has(s.font && s.font.family) ? s.font.family : d.font.family;
    const f = s.fill || {}, st = s.stroke || {}, ty = s.type || {}, fx = s.fx || {};
    const palette = Array.isArray(f.palette) ? f.palette.filter(TM.color.isHex).slice(0, 8).map((c) => c.toLowerCase()) : [];

    let path = cleanPath(s.path, aspect);
    if (!path && preset && preset.usesPath) path = TM.Path.preset(preset.path || 'wave', aspect);
    const pm = s.pathMorph || {};

    return {
      id: typeof s.id === 'string' && /^[\w-]{1,16}$/.test(s.id) ? s.id : 'l' + (index + 1),
      name: cleanText(s.name, d.name).replace(/\n/g, ' ').slice(0, 40) || d.name,
      visible: bool(s.visible, true),
      text: cleanText(s.text, d.text),
      preset: presetId,
      params: cleanParams(presetId, s.params),
      font: {
        family,
        weight: TM.fonts.clampWeight(family, num(s.font && s.font.weight, 400, 1, 1000)),
        // Kept as asked (within any family's range) so switching fonts and back keeps the intent;
        // each family clamps it to its own axis when drawing.
        width: Math.round(num(s.font && s.font.width, 100, 25, 200)),
        opsz: opszOf(s.font && s.font.opsz),
        axes: cleanAxes(s.font && s.font.axes),
      },
      type: {
        size: num(ty.size, d.type.size, 0.01, 1.5),
        tracking: num(ty.tracking, d.type.tracking, -0.3, 2),
        leading: num(ty.leading, d.type.leading, 0.5, 3),
        align: pick(ty.align, ['left', 'center', 'right'], d.type.align),
        case: pick(ty.case, ['none', 'upper', 'lower', 'title'], d.type.case),
        slant: num(ty.slant, 0, -30, 30),
        wrap: pick(ty.wrap, ['auto', 'off'], 'auto'),
      },
      fill: {
        type: pick(f.type, ['solid', 'gradient', 'palette'], d.fill.type),
        color: color(f.color, d.fill.color),
        color2: color(f.color2, d.fill.color2),
        angle: num(f.angle, d.fill.angle, -360, 360),
        palette: palette.length ? palette : d.fill.palette.slice(),
      },
      stroke: {
        mode: pick(st.mode, ['none', 'outline', 'both'], d.stroke.mode),
        width: num(st.width, d.stroke.width, 0.002, 0.3),
        color: color(st.color, d.stroke.color),
      },
      path,
      pathMorph: cleanMorph(pm, aspect),
      fx: {
        echo: {
          count: int(fx.echo && fx.echo.count, 0, 0, 12),
          spacing: num(fx.echo && fx.echo.spacing, d.fx.echo.spacing, 0.002, 0.25),
          fade: num(fx.echo && fx.echo.fade, d.fx.echo.fade, 0, 1),
          palette: bool(fx.echo && fx.echo.palette, false),
        },
        blur: num(fx.blur, 0, 0, 1),
        glow: { amount: num(fx.glow && fx.glow.amount, 0, 0, 1), color: color(fx.glow && fx.glow.color, d.fx.glow.color) },
        shadow: {
          amount: num(fx.shadow && fx.shadow.amount, 0, 0, 1),
          angle: num(fx.shadow && fx.shadow.angle, d.fx.shadow.angle, -360, 360),
          distance: num(fx.shadow && fx.shadow.distance, d.fx.shadow.distance, 0, 0.2),
          color: color(fx.shadow && fx.shadow.color, d.fx.shadow.color),
        },
        extrude: {
          depth: num(fx.extrude && fx.extrude.depth, 0, 0, 1),
          angle: num(fx.extrude && fx.extrude.angle, d.fx.extrude.angle, -360, 360),
          color: color(fx.extrude && fx.extrude.color, d.fx.extrude.color),
        },
      },
      anchor: { x: num(s.anchor && s.anchor.x, 0.5, -0.5, 1.5), y: num(s.anchor && s.anchor.y, 0.5, -0.5, 1.5) },
      time: {
        delay: num(s.time && s.time.delay, 0, 0, 600),
        cycles: int(s.time && s.time.cycles, 1, 1, 8),
        mode: pick(s.time && s.time.mode, ['loop', 'once'], 'loop'),
      },
      matte: {
        mode: pick(s.matte && s.matte.mode, ['none', 'alpha', 'alphaInvert'], 'none'),
        show: bool(s.matte && s.matte.show, false),
      },
      transform: cleanTransform(s.transform),
    };
  }

  const MAX_TKEYS = 16;
  /** Transform keyframes: up to 16, sorted by time, every value clamped. */
  function cleanTransform(tr) {
    const src = isObj(tr) && Array.isArray(tr.keys) ? tr.keys.slice(0, MAX_TKEYS) : [];
    const keys = src.filter(isObj).map((k) => ({
      t: num(k.t, 0, 0, 1),
      x: num(k.x, 0, -2, 2),
      y: num(k.y, 0, -2, 2),
      scale: num(k.scale, 1, 0, 10),
      rot: num(k.rot, 0, -3600, 3600),
      opacity: num(k.opacity, 1, 0, 1),
      ease: ease(k.ease, 'smooth'),
    })).sort((a, b) => a.t - b.t);
    return { enabled: bool(tr && tr.enabled, false) && keys.length > 0, keys };
  }

  /** Fill defaults and sanitise an untrusted scene object. Always returns a valid scene. */
  function normalize(input) {
    const d = defaults();
    const s = isObj(input) ? input : {};
    const size = s.size || {};
    const w = int(size.w, d.size.w, 64, 4096), h = int(size.h, d.size.h, 64, 4096);
    const bg = s.bg || {}, post = s.post || {};
    const layersIn = Array.isArray(s.layers) && s.layers.length ? s.layers.slice(0, MAX_LAYERS) : d.layers;
    const layers = layersIn.map((l, i) => normalizeLayer(l, i, w / h));
    // Unique layer ids.
    const seen = new Set();
    layers.forEach((l, i) => {
      if (seen.has(l.id)) l.id = 'l' + (i + 1) + '-' + seen.size;
      seen.add(l.id);
    });
    const fps = FPS_OPTIONS.includes(+s.fps) ? +s.fps : d.fps;
    return {
      v: 1,
      name: cleanText(s.name, d.name).replace(/\n/g, ' ').slice(0, 60) || d.name,
      size: { w, h },
      // A whole number of frames per loop: exports render round(duration × fps) frames, so a
      // fractional count would restart the motion a fraction of a frame early (a hitch).
      duration: Math.round(num(s.duration, d.duration, 0.5, 60) * fps) / fps,
      fps,
      seed: int(s.seed, d.seed, 0, 999999),
      bg: {
        type: pick(bg.type, ['solid', 'linear', 'radial', 'transparent'], d.bg.type),
        color: color(bg.color, d.bg.color),
        color2: color(bg.color2, d.bg.color2),
        angle: num(bg.angle, d.bg.angle, -360, 360),
      },
      post: { grain: num(post.grain, 0, 0, 1), vignette: num(post.vignette, 0, 0, 1) },
      layers,
    };
  }

  // ─────────────────────────── compact encoding ───────────────────────────
  // Values equal to their defaults are stripped before encoding, so share links stay short.
  function diff(value, base) {
    if (Array.isArray(value)) return JSON.stringify(value) === JSON.stringify(base) ? undefined : value;
    if (!isObj(value)) return value === base ? undefined : value;
    const out = {};
    let any = false;
    for (const k of Object.keys(value)) {
      const dv = diff(value[k], isObj(base) ? base[k] : undefined);
      if (dv !== undefined) { out[k] = dv; any = true; }
    }
    return any ? out : undefined;
  }

  function roundNumbers(v) {
    if (typeof v === 'number') return Math.round(v * 10000) / 10000;
    if (Array.isArray(v)) return v.map(roundNumbers);
    if (isObj(v)) { const o = {}; for (const k of Object.keys(v)) o[k] = roundNumbers(v[k]); return o; }
    return v;
  }

  function minify(scene) {
    const s = normalize(scene);
    const d = defaults();
    const out = diff({ ...s, layers: undefined }, { ...d, layers: undefined }) || {};
    out.v = 1;
    out.layers = s.layers.map((l) => {
      const base = defaultLayer();
      base.preset = l.preset;
      base.params = TM.presetDefaults(l.preset);
      // Untouched preset paths travel as just their id; they're regenerated on decode.
      const slim = { ...l, path: l.path && l.path.preset ? { preset: l.path.preset } : l.path };
      // Path keyframes travel in keys[] (target is rebuilt from keys[0]); preset keys as their id.
      if (l.pathMorph && l.pathMorph.keys.length) slim.pathMorph = { ...l.pathMorph, target: undefined, keys: l.pathMorph.keys.map((k) => (k.preset ? { preset: k.preset } : k)) };
      const m = diff(slim, base) || {};
      m.preset = l.preset; // always explicit
      return m;
    });
    return roundNumbers(out);
  }

  const b64url = {
    encode(bytes) {
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    decode(str) {
      const s = str.replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    },
  };

  /** Run bytes through a (de)compression stream, aborting once the output passes `limit` bytes. */
  async function pipe(bytes, stream, limit = Infinity) {
    // Feed the transform 1 KB at a time while reading its output: a whole-input write would let
    // a deflate bomb inflate (to 100+ MB) inside one transform step, before the cap is checked.
    // Deflate expands at most ~1032:1, so peak memory stays near `limit` plus ~1 MB.
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    const chunks = [];
    let total = 0, stop = false;
    const feed = (async () => {
      try {
        for (let i = 0; i < bytes.length && !stop; i += 1024) {
          await writer.ready;
          await writer.write(bytes.subarray(i, i + 1024));
        }
        if (!stop) await writer.close();
      } catch (e) { /* the read side reports the failure */ }
    })();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > limit) throw new Error('Scene too large');
        chunks.push(value);
      }
    } catch (e) {
      stop = true;
      reader.cancel().catch(() => {});
      writer.abort().catch(() => {});
      throw e;
    }
    await feed;
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  /** Encode a scene into a URL-safe string: 'z' + deflate-raw base64url, or 'j' + JSON base64url. */
  async function encode(scene) {
    const json = new TextEncoder().encode(JSON.stringify(minify(scene)));
    if (typeof CompressionStream !== 'undefined') {
      try { return 'z' + b64url.encode(await pipe(json, new CompressionStream('deflate-raw'))); } catch (e) { /* fall through */ }
    }
    return 'j' + b64url.encode(json);
  }

  const MAX_ENCODED = 200000;
  const MAX_DECODED = 1e6;
  /** Decode a string from encode(). Rejects malformed input; result is normalised. */
  async function decode(str) {
    if (typeof str !== 'string' || str.length < 2 || str.length > MAX_ENCODED) throw new Error('Invalid scene data');
    const kind = str[0], body = b64url.decode(str.slice(1));
    let bytes;
    if (kind === 'z') {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed scenes');
      // Stream-decompress with a hard cap so a tiny link can't inflate into a memory bomb.
      bytes = await pipe(body, new DecompressionStream('deflate-raw'), MAX_DECODED);
    } else if (kind === 'j') bytes = body;
    else throw new Error('Unknown scene encoding');
    if (bytes.length > MAX_DECODED) throw new Error('Scene too large');
    return normalize(JSON.parse(new TextDecoder().decode(bytes)));
  }

  const clone = (scene) => JSON.parse(JSON.stringify(scene));

  /**
   * Apply a curated look (from a preset's `looks`) to layer `index`. A look may set bg, post,
   * and layer font / type / fill / stroke / fx / params / anchor / path (a path preset id or
   * definition). The user's text is never changed. The result is normalised.
   */
  /**
   * Apply a curated look to layer `index`. A look is a complete style, so the result never
   * depends on what came before it: effects, stroke, motion params and post (grain, vignette)
   * start from their defaults, then take the look's values. Font, type, fill, background,
   * anchor and timing change only where the look names them. Like the text, a hand-drawn path
   * (one without path.preset) is the user's work and is never replaced.
   */
  function applyLook(scene, index, look) {
    const s = clone(scene);
    const l = s.layers[Math.max(0, Math.min(s.layers.length - 1, index | 0))];
    if (!l || !isObj(look)) return normalize(s);
    const d = defaultLayer();
    if (isObj(look.bg)) merge(s.bg, look.bg);
    s.post = merge(clone(defaults().post), isObj(look.post) ? clone(look.post) : {});
    if (typeof look.preset === 'string' && TM.getPreset(look.preset)) l.preset = look.preset;
    const L = isObj(look.layer) ? look.layer : {};
    l.params = TM.presetDefaults(l.preset);
    l.fx = clone(d.fx);
    l.stroke = clone(d.stroke);
    for (const k of ['font', 'type', 'fill', 'stroke', 'fx', 'params', 'anchor', 'time']) {
      if (isObj(L[k])) l[k] = merge(isObj(l[k]) ? l[k] : {}, clone(L[k]));
    }
    if (Array.isArray(L.fill && L.fill.palette)) l.fill.palette = L.fill.palette.slice();
    const aspect = s.size.w / s.size.h;
    const custom = isObj(l.path) && !l.path.preset;
    if (!custom) {
      if (typeof L.path === 'string') l.path = TM.Path.preset(L.path, aspect);
      else if (isObj(L.path)) l.path = clone(L.path);
      if (isObj(L.pathMorph)) {
        l.pathMorph = merge(isObj(l.pathMorph) ? l.pathMorph : {}, clone(L.pathMorph));
        if (typeof L.pathMorph.target === 'string') l.pathMorph.target = TM.Path.preset(L.pathMorph.target, aspect);
      }
    }
    return normalize(s);
  }

  TM.Scene = {
    defaults,
    defaultLayer,
    normalize,
    normalizeLayer,
    cleanParams,
    minify,
    applyLook,
    encode,
    decode,
    clone,
    merge,
    ASPECTS,
    FPS_OPTIONS,
    MAX_LAYERS,
    MAX_TEXT,
    MAX_KEYS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
