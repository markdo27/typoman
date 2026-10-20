/* TYPOMAN — starter templates: curated multi-layer scenes.
 *
 * A template names its frame, length and background, and builds each layer from a preset, one
 * of that preset's curated looks (by name) and a few overrides: text, size, position, timing,
 * track mattes, transform keys. Building through looks keeps templates in step with the
 * presets they use. The layer with role 'headline' takes the user's text when they have some.
 *
 *   TM.Templates.list()             [{ id, name, description, aspect }]
 *   TM.Templates.build(id, { text }) a normalised scene, or null
 */
(function (TM) {
  'use strict';

  const TEMPLATES = [
    {
      id: 'title-window',
      name: 'Title Window',
      description: 'Saul Bass-style title: the headline is a window onto a moving grid of type, with a credit typed underneath.',
      aspect: '16:9', duration: 6,
      bg: { type: 'solid', color: '#f2541b' },
      layers: [
        // The headline is the matte: drawn in black (the layer above asks to show it), and the
        // only place the waving type above it can appear.
        { role: 'headline', name: 'Window', preset: 'rise', look: 'Title card', text: 'CINEMA',
          set: { font: { family: 'Anton', weight: 400 }, type: { size: 0.5, tracking: -0.01, case: 'upper' }, fill: { type: 'solid', color: '#141414' },
            params: { inDur: 0.3, outDur: 0.12, stagger: 0.35 },
            transform: { enabled: true, keys: [{ t: 0, scale: 1 }, { t: 1, scale: 1.07, ease: 'linear' }] } } },
        { name: 'Inside', preset: 'wave', text: 'CINEMA · CINEMA · CINEMA\nCINEMA · CINEMA · CINEMA\nCINEMA · CINEMA · CINEMA\nCINEMA · CINEMA · CINEMA\nCINEMA · CINEMA · CINEMA\nCINEMA · CINEMA · CINEMA',
          set: { font: { family: 'Anton', weight: 400 }, type: { size: 0.16, leading: 0.9 }, fill: { type: 'solid', color: '#f6e9d5' },
            params: { mode: 'sine', cycles: 2 }, matte: { mode: 'alpha', show: true } } },
        // Sequenced inside the loop: one pass of half the loop, from 1.2 s.
        { name: 'Credit', preset: 'typewriter', look: 'Editorial', text: 'A FILM BY TYPOMAN',
          set: { font: { family: 'Inter Tight', weight: 600 }, type: { size: 0.03, tracking: 0.35, case: 'upper' }, fill: { type: 'solid', color: '#141414' },
            anchor: { x: 0.5, y: 0.86 }, time: { delay: 1.2, cycles: 2, mode: 'once' } } },
      ],
    },
    {
      id: 'lyric-morph',
      name: 'Lyric Morph',
      description: 'Story-format lyric card: each line morphs into the next, shared letters gliding into place.',
      aspect: '9:16', duration: 8,
      bg: { type: 'linear', color: '#ff3b00', color2: '#ff9a3c', angle: 160 },
      post: { grain: 0.12 },
      layers: [
        { role: 'headline', name: 'Lyrics', preset: 'phrase-morph', look: 'Poster swap', text: 'MAKE IT\nMOVE IT\nLOVE IT',
          set: { type: { size: 0.27 }, fill: { type: 'solid', color: '#1a0f0a' } } },
        { name: 'Credit', preset: 'typewriter', look: 'Editorial', text: 'TYPOMAN RECORDS',
          set: { font: { family: 'Space Mono', weight: 700 }, type: { size: 0.035, tracking: 0.2, case: 'upper' }, fill: { type: 'solid', color: '#1a0f0a' },
            anchor: { x: 0.5, y: 0.9 } } },
      ],
    },
    {
      id: 'logo-sting',
      name: 'Logo Sting',
      description: 'A particle swarm condenses into your wordmark with a slow push-in, then an italic tagline.',
      aspect: '1:1', duration: 4,
      bg: { type: 'radial', color: '#1d1b3a', color2: '#05040c' },
      post: { vignette: 0.35 },
      layers: [
        { role: 'headline', name: 'Wordmark', preset: 'particles', look: 'Condense', text: 'BRAND',
          set: { font: { family: 'Unbounded', weight: 800 }, type: { size: 0.17 }, fill: { type: 'solid', color: '#f5f3ff' },
            fx: { glow: { amount: 0.3, color: '#8f7bff' } }, params: { from: 'scatter', leave: 'scatter', inDur: 0.4, outDur: 0.22 },
            transform: { enabled: true, keys: [{ t: 0, scale: 0.94 }, { t: 1, scale: 1.02, ease: 'linear' }] } } },
        { name: 'Tagline', preset: 'rise', look: 'Editorial', text: 'Made to move',
          set: { font: { family: 'Playfair Display', weight: 500, italic: true }, type: { size: 0.06, case: 'none' }, fill: { type: 'solid', color: '#cfc8ff' },
            anchor: { x: 0.5, y: 0.66 }, time: { delay: 1.5, cycles: 2, mode: 'once' }, params: { inDur: 0.3, outDur: 0.2 } } },
      ],
    },
    {
      id: 'kinetic-poster',
      name: 'Kinetic Poster',
      description: 'Rows that breathe through the width axis, with a scrambled issue line.',
      aspect: '4:5', duration: 6,
      bg: { type: 'solid', color: '#f0ede4' },
      layers: [
        { role: 'headline', name: 'Poster', preset: 'stack', look: 'Flex accordion', text: 'TYPE\nIN\nMOTION',
          set: { fill: { type: 'solid', color: '#121212' }, params: { margin: 0.1 } } },
        { name: 'Issue', preset: 'scramble', look: 'Terminal', text: 'VOL.03 — 2026',
          set: { font: { family: 'JetBrains Mono', weight: 600 }, type: { size: 0.026, tracking: 0.12 }, fill: { type: 'solid', color: '#121212' },
            anchor: { x: 0.5, y: 0.965 }, params: { look: 'same' } } },
      ],
    },
    {
      id: 'editorial-quote',
      name: 'Editorial Quote',
      description: 'A quote in true italics that rises word by word, eased out along the line, then its attribution.',
      aspect: '16:9', duration: 7,
      bg: { type: 'solid', color: '#f4f1ea' },
      layers: [
        { role: 'headline', name: 'Quote', preset: 'rise', look: 'Editorial', text: 'Good type is invisible\nuntil it moves.',
          set: { font: { family: 'Fraunces', weight: 500, italic: true }, type: { size: 0.13, case: 'none', leading: 1.05 }, fill: { type: 'solid', color: '#1d1d1d' },
            params: { order: 'words', stagger: 0.55, staggerCurve: 'outCubic', inDur: 0.42, outDur: 0.2 } } },
        { name: 'Attribution', preset: 'rise', look: 'Swiss cut', text: '— TYPOMAN STUDIO',
          set: { font: { family: 'Inter Tight', weight: 600, italic: false }, type: { size: 0.026, tracking: 0.25, case: 'upper' }, fill: { type: 'solid', color: '#8a6a3a' },
            anchor: { x: 0.5, y: 0.8 }, time: { delay: 2.2, cycles: 2, mode: 'once' }, params: { inDur: 0.3, outDur: 0.15 } } },
      ],
    },
    {
      id: 'departure-board',
      name: 'Departure Board',
      description: 'Split-flap launch date with a headline that rises above it.',
      aspect: '16:9', duration: 6,
      bg: { type: 'solid', color: '#111214' },
      layers: [
        { role: 'headline', name: 'Board', preset: 'split-flap', look: 'Departures', text: 'LAUNCH\n09·10·26',
          set: { type: { size: 0.15 }, anchor: { x: 0.5, y: 0.55 } } },
        { name: 'Kicker', preset: 'rise', look: 'Swiss cut', text: 'SAVE THE DATE',
          set: { font: { family: 'Inter Tight', weight: 700 }, type: { size: 0.035, tracking: 0.3 }, fill: { type: 'solid', color: '#f5c518' },
            anchor: { x: 0.5, y: 0.16 }, params: { inDur: 0.25, outDur: 0.15 } } },
      ],
    },
    {
      id: 'glitch-drop',
      name: 'Glitch Drop',
      description: 'Story-format product drop: a VHS glitch headline and a decoding caption (flash-safe).',
      aspect: '9:16', duration: 4,
      bg: { type: 'solid', color: '#0a0a0f' },
      post: { grain: 0.2, vignette: 0.3 },
      layers: [
        { role: 'headline', name: 'Drop', preset: 'glitch', look: 'VHS', text: 'DROP\n01',
          set: { type: { size: 0.3 }, params: { bursts: 2, rate: 8 } } },
        { name: 'Caption', preset: 'scramble', look: 'Terminal', text: 'NEW COLLECTION',
          set: { font: { family: 'Space Mono', weight: 700 }, type: { size: 0.04, tracking: 0.08 }, anchor: { x: 0.5, y: 0.8 } } },
      ],
    },
    {
      id: 'signature',
      name: 'Signature',
      description: 'A handwritten line drawn along a swoosh, signed with a wordmark.',
      aspect: '16:9', duration: 5,
      bg: { type: 'solid', color: '#fbf7f0' },
      layers: [
        { name: 'Script', preset: 'path-draw', look: 'Signature', text: 'with love,',
          set: { font: { family: 'Caveat', weight: 700 }, type: { size: 0.2, case: 'none' }, path: 'swoosh' } },
        { role: 'headline', name: 'Wordmark', preset: 'rise', look: 'Swiss cut', text: 'TYPOMAN',
          set: { type: { size: 0.075, tracking: 0.12 }, fill: { type: 'solid', color: '#1b1b1b' }, anchor: { x: 0.5, y: 0.8 }, time: { delay: 1.6, cycles: 2, mode: 'once' }, params: { inDur: 0.3, outDur: 0.18 } } },
      ],
    },
  ];

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function get(id) {
    return TEMPLATES.find((t) => t.id === id) || null;
  }

  /** A normalised scene from template `id`; opts.text replaces the headline's text. */
  function build(id, opts = {}) {
    const t = get(id);
    if (!t) return null;
    const aspect = TM.Scene.ASPECTS.find((a) => a[0] === t.aspect) || TM.Scene.ASPECTS[0];
    const base = TM.Scene.defaults();
    base.name = t.name;
    base.size = { w: aspect[2], h: aspect[3] };
    base.duration = t.duration;
    const layers = t.layers.map((spec, i) => {
      // Each layer is styled on its own scene so a look's background never leaks into the template.
      let s = TM.Scene.clone(base);
      s.layers = [TM.Scene.defaultLayer({ id: 'l' + (i + 1), name: spec.name, preset: spec.preset, text: spec.text })];
      s.layers[0].params = TM.presetDefaults(spec.preset);
      s = TM.Scene.normalize(s);
      const def = TM.getPreset(spec.preset);
      const look = def && spec.look ? def.looks.find((l) => l.name === spec.look) : null;
      if (look) s = TM.Scene.applyLook(s, 0, Object.assign({}, look, { preset: spec.preset }));
      const layer = s.layers[0];
      const set = clone(spec.set || {});
      if (typeof set.path === 'string') set.path = TM.Path.preset(set.path, base.size.w / base.size.h);
      TM.Scene.merge(layer, set);
      if (set.path) layer.path = set.path;
      return layer;
    });
    const scene = TM.Scene.clone(base);
    scene.bg = TM.Scene.merge(clone(base.bg), clone(t.bg || {}));
    scene.post = TM.Scene.merge(clone(base.post), clone(t.post || {}));
    scene.layers = layers;
    const text = typeof opts.text === 'string' ? opts.text.trim() : '';
    if (text) layers.forEach((l, i) => { if (t.layers[i].role === 'headline') l.text = text; });
    return TM.Scene.normalize(scene);
  }

  TM.Templates = {
    list: () => TEMPLATES.map(({ id, name, description, aspect, duration }) => ({ id, name, description, aspect, duration })),
    build,
  };
})(window.TM);
