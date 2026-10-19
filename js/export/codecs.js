/* TYPOMAN export — codec negotiation for WebCodecs.
 *
 * MP4:  H.264 High → Main → Constrained Baseline → Baseline (level picked from size × fps × bitrate),
 *       then AV1 in MP4, then VP9 in MP4.
 * WebM: VP9 → VP8 → AV1. Transparent WebM: VP9/VP8 with native alpha ('keep') when the browser
 *       supports it, otherwise a "sidecar" alpha stream (a second encoder fed the alpha plane as
 *       luma) muxed as Matroska BlockAdditions, which is how WebM stores alpha anyway.
 * Every candidate is checked with VideoEncoder.isConfigSupported; the first supported one wins,
 * the rest stay as runtime fallbacks if an encoder fails mid-export.
 */
(function (TM) {
  'use strict';
  const X = TM.Export;
  const { clamp } = TM.math;

  // ───────────────────────────── levels ─────────────────────────────
  // H.264 Table A-1: [level, level_idc, MaxMBPS, MaxFS (macroblocks), MaxBR (kbit/s, Baseline/Main)]
  const AVC_LEVELS = [
    [3.0, 30, 40500, 1620, 10000],
    [3.1, 31, 108000, 3600, 14000],
    [3.2, 32, 216000, 5120, 20000],
    [4.0, 40, 245760, 8192, 20000],
    [4.1, 41, 245760, 8192, 50000],
    [4.2, 42, 522240, 8704, 50000],
    [5.0, 50, 589824, 22080, 135000],
    [5.1, 51, 983040, 36864, 240000],
    [5.2, 52, 2073600, 36864, 240000],
    [6.0, 60, 4177920, 139264, 240000],
    [6.1, 61, 8355840, 139264, 480000],
    [6.2, 62, 16711680, 139264, 800000],
  ];
  // AV1 Annex A (Main tier): [seq_level_idx, label, MaxPicSize, MaxHSize, MaxVSize, MaxDisplayRate, MaxBitrate (Mbit/s)]
  const AV1_LEVELS = [
    [0, '2.0', 147456, 2048, 1152, 4423680, 1.5],
    [1, '2.1', 278784, 2816, 1584, 8363520, 3],
    [4, '3.0', 665856, 4352, 2448, 19975680, 6],
    [5, '3.1', 1065024, 5504, 3096, 31950720, 10],
    [8, '4.0', 2359296, 6144, 3456, 70778880, 12],
    [9, '4.1', 2359296, 6144, 3456, 141557760, 20],
    [12, '5.0', 8912896, 8192, 4352, 267386880, 30],
    [13, '5.1', 8912896, 8192, 4352, 534773760, 40],
    [14, '5.2', 8912896, 8192, 4352, 1069547520, 60],
    [16, '6.0', 35651584, 16384, 8704, 1069547520, 60],
  ];
  // VP9 levels: [level × 10, MaxPicSize, MaxSampleRate, MaxBitrate (kbit/s), MaxDimension]
  const VP9_LEVELS = [
    [10, 36864, 829440, 200, 512],
    [11, 73728, 2764800, 800, 768],
    [20, 122880, 4608000, 1800, 960],
    [21, 245760, 9216000, 3600, 1344],
    [30, 552960, 20736000, 7200, 2048],
    [31, 983040, 36864000, 12000, 2752],
    [40, 2228224, 83558400, 18000, 4160],
    [41, 2228224, 160432128, 30000, 4160],
    [50, 8912896, 311951360, 60000, 8384],
    [51, 8912896, 588251136, 120000, 8384],
    [52, 8912896, 1176502272, 180000, 8384],
    [60, 35651584, 1176502272, 180000, 16832],
    [61, 35651584, 2353004544, 240000, 16832],
    [62, 35651584, 4706009088, 480000, 16832],
  ];

  const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
  const pad2 = (n) => String(n).padStart(2, '0');

  /** Lowest H.264 level that fits w×h at fps and bitrate. High profile allows 1.25× MaxBR. */
  function avcLevel(w, h, fps, bitrate, profile) {
    const mbw = Math.ceil(w / 16), mbh = Math.ceil(h / 16), fs = mbw * mbh, mbps = fs * fps;
    const brFactor = profile === 'high' ? 1.25 : 1;
    for (const [level, idc, maxMBPS, maxFS, maxBR] of AVC_LEVELS) {
      const maxDim = Math.sqrt(maxFS * 8);
      if (fs <= maxFS && mbps <= maxMBPS && mbw <= maxDim && mbh <= maxDim && bitrate <= maxBR * 1000 * brFactor) return { level, idc };
    }
    return null;
  }
  function av1Level(w, h, fps, bitrate) {
    for (const [idx, label, maxPic, maxH, maxV, maxRate, maxBR] of AV1_LEVELS) {
      if (w * h <= maxPic && w <= maxH && h <= maxV && w * h * fps <= maxRate && bitrate <= maxBR * 1e6) return { idx, label };
    }
    return null;
  }
  function vp9Level(w, h, fps, bitrate) {
    for (const [lv, maxPic, maxRate, maxBR, maxDim] of VP9_LEVELS) {
      if (w * h <= maxPic && w * h * fps <= maxRate && Math.max(w, h) <= maxDim && bitrate <= maxBR * 1000) return lv;
    }
    return null;
  }

  const AVC_PROFILES = [
    // [key, label, profile_idc hex, constraint flags hex]
    ['high', 'High', '64', '00'],
    ['main', 'Main', '4D', '00'],
    ['cbaseline', 'Constrained Baseline', '42', 'E0'],
    ['baseline', 'Baseline', '42', '00'],
  ];

  /** avc1.PPCCLL codec string for a profile key, or null if no level fits. */
  X.avcCodec = function (profile, w, h, fps, bitrate) {
    const p = AVC_PROFILES.find((x) => x[0] === profile);
    const lv = p && avcLevel(w, h, fps, bitrate, profile);
    return lv ? { codec: 'avc1.' + p[2] + p[3] + hex2(lv.idc), level: lv.level, profileLabel: p[1] } : null;
  };
  X.av1Codec = function (w, h, fps, bitrate) {
    const lv = av1Level(w, h, fps, bitrate);
    return lv ? { codec: 'av01.0.' + pad2(lv.idx) + 'M.08', level: lv.label } : null;
  };
  X.vp9Codec = function (w, h, fps, bitrate) {
    const lv = vp9Level(w, h, fps, bitrate);
    return lv ? { codec: 'vp09.00.' + pad2(lv) + '.08', level: (lv / 10).toFixed(1) } : null;
  };

  // ───────────────────────────── bitrate ─────────────────────────────
  // Bits per pixel per frame at 30 fps for H.264; other codecs need less for the same quality.
  // Higher frame rates need less per frame (more temporal redundancy), hence the 0.75 power.
  const BPP = { draft: 0.04, standard: 0.075, high: 0.12, max: 0.2 };
  const EFFICIENCY = { avc: 1, vp9: 0.72, av1: 0.62, vp8: 1.1 };
  X.bitrateFor = function ({ width, height, fps, quality, family = 'avc' }) {
    const fpsEff = 30 * Math.pow(fps / 30, 0.75);
    const bps = width * height * fpsEff * (BPP[quality] || BPP.high) * (EFFICIENCY[family] || 1);
    return Math.round(clamp(bps, 3e5, 150e6) / 1000) * 1000;
  };

  // ───────────────────────────── candidates ─────────────────────────────
  function baseConfig(codec, plan, bitrate, family) {
    const c = {
      codec,
      width: plan.width,
      height: plan.height,
      bitrate,
      framerate: plan.fps,
      latencyMode: 'quality',
      bitrateMode: 'variable',
      hardwareAcceleration: 'no-preference',
      alpha: 'discard',
    };
    if (family === 'avc') c.avc = { format: 'avc' }; // length-prefixed NALUs + avcC description, as MP4 needs
    return c;
  }

  /**
   * Ordered encoder candidates for a plan (pure: no browser calls, so it is unit-testable).
   * Each: { id, family, codec, label, level, container, mux, alphaMode: null|'native'|'sidecar', config, alphaConfig? }
   */
  X.candidates = function (plan) {
    const { width: w, height: h, fps, quality } = plan;
    const container = plan.format === 'webm' ? 'webm' : 'mp4';
    const out = [];
    const rate = (family) => X.bitrateFor({ width: w, height: h, fps, quality, family });

    if (container === 'mp4') {
      const br = rate('avc');
      for (const [key] of AVC_PROFILES) {
        const c = X.avcCodec(key, w, h, fps, br);
        if (c) out.push({ id: 'avc-' + key, family: 'avc', codec: c.codec, label: `H.264 ${c.profileLabel} · level ${c.level.toFixed(1)}`, level: c.level, container, mux: 'avc', alphaMode: null, config: baseConfig(c.codec, plan, br, 'avc') });
      }
      const brA = rate('av1'), a = X.av1Codec(w, h, fps, brA);
      if (a) out.push({ id: 'av1', family: 'av1', codec: a.codec, label: `AV1 Main · level ${a.level}`, level: a.level, container, mux: 'av1', alphaMode: null, config: baseConfig(a.codec, plan, brA, 'av1') });
      const brV = rate('vp9'), v = X.vp9Codec(w, h, fps, brV);
      if (v) out.push({ id: 'vp9', family: 'vp9', codec: v.codec, label: `VP9 profile 0 · level ${v.level}`, level: v.level, container, mux: 'vp9', alphaMode: null, config: baseConfig(v.codec, plan, brV, 'vp9') });
      return out;
    }

    const brV = rate('vp9'), v = X.vp9Codec(w, h, fps, brV);
    const br8 = rate('vp8');
    if (plan.transparent) {
      // Alpha: the sidecar stream is mostly flat 0/255, so it needs well under the colour bitrate.
      if (v) {
        out.push({ id: 'vp9-alpha', family: 'vp9', codec: v.codec, label: `VP9 + alpha · level ${v.level}`, level: v.level, container, mux: 'V_VP9', alphaMode: 'native', config: Object.assign(baseConfig(v.codec, plan, brV, 'vp9'), { alpha: 'keep' }) });
        out.push({ id: 'vp9-sidecar', family: 'vp9', codec: v.codec, label: `VP9 + alpha · level ${v.level}`, level: v.level, container, mux: 'V_VP9', alphaMode: 'sidecar', config: baseConfig(v.codec, plan, brV, 'vp9'), alphaConfig: baseConfig(v.codec, plan, Math.round(brV * 0.5), 'vp9') });
      }
      out.push({ id: 'vp8-alpha', family: 'vp8', codec: 'vp8', label: 'VP8 + alpha', container, mux: 'V_VP8', alphaMode: 'native', config: Object.assign(baseConfig('vp8', plan, br8, 'vp8'), { alpha: 'keep' }) });
      out.push({ id: 'vp8-sidecar', family: 'vp8', codec: 'vp8', label: 'VP8 + alpha', container, mux: 'V_VP8', alphaMode: 'sidecar', config: baseConfig('vp8', plan, br8, 'vp8'), alphaConfig: baseConfig('vp8', plan, Math.round(br8 * 0.5), 'vp8') });
      return out;
    }
    if (v) out.push({ id: 'vp9', family: 'vp9', codec: v.codec, label: `VP9 profile 0 · level ${v.level}`, level: v.level, container, mux: 'V_VP9', alphaMode: null, config: baseConfig(v.codec, plan, brV, 'vp9') });
    out.push({ id: 'vp8', family: 'vp8', codec: 'vp8', label: 'VP8', container, mux: 'V_VP8', alphaMode: null, config: baseConfig('vp8', plan, br8, 'vp8') });
    const brA = rate('av1'), a = X.av1Codec(w, h, fps, brA);
    if (a) out.push({ id: 'av1', family: 'av1', codec: a.codec, label: `AV1 Main · level ${a.level}`, level: a.level, container, mux: 'V_AV1', alphaMode: null, config: baseConfig(a.codec, plan, brA, 'av1') });
    return out;
  };

  // ───────────────────────────── negotiation ─────────────────────────────
  async function supported(config) {
    try {
      const r = await window.VideoEncoder.isConfigSupported(config);
      if (!r || !r.supported) return false;
      // Browsers echo back the config they will actually use: reject silent alpha drops.
      if (config.alpha === 'keep' && r.config && r.config.alpha && r.config.alpha !== 'keep') return false;
      return true;
    } catch (e) {
      return false; // TypeError for malformed/unknown configs
    }
  }

  const cache = new Map();
  /**
   * Probe candidates in order. Resolves { ok, choice, supported: [...], tried: [{ id, codec, ok }] }.
   * Never rejects. Results are cached per (container, size, fps, quality, alpha).
   */
  X.negotiate = function (plan) {
    const key = [plan.format, plan.width, plan.height, plan.fps, plan.quality, plan.transparent].join('|');
    if (cache.has(key)) return cache.get(key);
    const p = (async () => {
      const tried = [];
      const ok = [];
      if (!X.caps().webcodecs) return { ok: false, reason: 'no-webcodecs', supported: ok, tried };
      for (const c of X.candidates(plan)) {
        let yes = await supported(c.config);
        if (yes && c.alphaConfig) yes = await supported(c.alphaConfig);
        tried.push({ id: c.id, codec: c.codec, alphaMode: c.alphaMode, ok: yes });
        if (yes) ok.push(c);
      }
      return { ok: ok.length > 0, reason: ok.length ? null : 'no-codec', choice: ok[0] || null, supported: ok, tried };
    })();
    cache.set(key, p);
    return p;
  };
  X._clearCodecCache = () => cache.clear();

  // ───────────────────────────── descriptions ─────────────────────────────
  /** Human copy for the dialog: what the user gets and what plays it. */
  X.describe = function (choice) {
    if (!choice) return null;
    const mbps = (choice.config.bitrate / 1e6).toFixed(choice.config.bitrate < 1e7 ? 1 : 0) + ' Mbps';
    const base = { title: choice.label, codec: choice.codec, bitrate: mbps, warn: false };
    if (choice.container === 'mp4') {
      if (choice.family === 'avc') return Object.assign(base, { plays: 'Plays everywhere: every browser, QuickTime, Windows, iOS, Android, social apps and video editors.' });
      const fam = choice.family === 'av1' ? 'AV1' : 'VP9';
      return Object.assign(base, {
        warn: true,
        plays: `This browser can't encode H.264, so this MP4 uses ${fam}. It plays in Chrome, Edge, Firefox and on Android` +
          (choice.family === 'av1' ? ', and in Safari on devices with AV1 hardware (M3 Macs, iPhone 15 Pro and later)' : '') +
          `. QuickTime, older Safari and many editors can't open it. For a universal H.264 MP4, export from desktop Chrome, Edge or Safari.`,
      });
    }
    if (choice.alphaMode) {
      return Object.assign(base, {
        plays: `Transparent WebM (${choice.family.toUpperCase()} with an alpha channel). Plays with transparency in Chrome, Edge and Firefox` +
          `; Safari doesn't support WebM alpha. For After Effects or Premiere, export a PNG sequence.`,
      });
    }
    if (choice.family === 'vp9') return Object.assign(base, { plays: 'VP9 WebM: plays in Chrome, Edge, Firefox and on Android, and in Safari on recent macOS and iOS. Great for web <video>.' });
    if (choice.family === 'vp8') return Object.assign(base, { plays: 'VP8 WebM: plays in every modern browser except older Safari.' });
    return Object.assign(base, { plays: 'AV1 WebM: plays in Chrome, Edge, Firefox and on Android.' });
  };
})(window.TM);
