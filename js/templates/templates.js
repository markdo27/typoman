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
      description: 'Saul Bass-style title: the headline is a window onto moving type, with a credit typed underneath. With your word, both the window and the type inside it take your word.',
      aspect: '16:9', duration: 6,
      bg: { type: 'solid', color: '#f2541b' },
      layers: [
        // The headline is the matte: drawn in black (the layer above asks to show it), and the
        // only place the waving type above it can appear.
        { role: 'headline', name: 'Window', preset: 'rise', look: 'Title card', text: 'CINEMA',
          set: { font: { family: 'Anton', weight: 400 }, type: { size: 0.5, tracking: -0.01, case: 'upper' }, fill: { type: 'solid', color: '#141414' },
            params: { inDur: 0.3, outDur: 0.12, stagger: 0.35 },
            transform: { enabled: true, keys: [{ t: 0, scale: 1 }, { t: 1, scale: 1.07, ease: 'linear' }] } } },
        // Also a headline layer, exactly as kaleido-window's Inside is: build(id, { text })
        // replaces this grid with the user's word, so the window never keeps showing CINEMA
        // for someone else's headline. Without user text the default grid below is kept.
        { role: 'headline', name: 'Inside', preset: 'wave', text: 'CINEMA · CINEMA · CINEMA\nCINEMA · CINEMA · CINEMA\nCINEMA · CINEMA · CINEMA\nCINEMA · CINEMA · CINEMA\nCINEMA · CINEMA · CINEMA\nCINEMA · CINEMA · CINEMA',
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
        // rate 6, not 8: the VHS look is unchanged, but TM.Safety reads 1 flash/s here
        // (rate 8 read 3.5/s, over the 3/s WCAG 2.3.1 limit), so the template is flash-safe.
        { role: 'headline', name: 'Drop', preset: 'glitch', look: 'VHS', text: 'DROP\n01',
          set: { type: { size: 0.3 }, params: { bursts: 2, rate: 6 } } },
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
    {
      id: 'youtube-intro',
      name: 'YouTube Intro',
      description: 'Chrome letters assemble, then a mono episode counter and a watch-now kicker — a channel intro that takes your title.',
      aspect: '16:9', duration: 6,
      bg: { type: 'solid', color: '#120403' },
      layers: [
        { role: 'headline', name: 'Title', preset: 'assemble', look: 'Hot Chrome', text: 'NEW VIDEO',
          set: { type: { size: 0.19, case: 'upper' }, params: { blast: 1.4, anticipation: 0.8 } } },
        { name: 'Episode', preset: 'scramble', look: 'Terminal', text: 'EP. 01',
          set: { type: { size: 0.032, tracking: 0.12 }, anchor: { x: 0.5, y: 0.16 }, time: { delay: 0.2, cycles: 2, mode: 'once' } } },
        { name: 'Kicker', preset: 'rise', look: 'Swiss cut', text: 'WATCH NOW',
          set: { type: { size: 0.038, tracking: 0.3, case: 'upper' }, anchor: { x: 0.5, y: 0.84 }, time: { delay: 1.6, cycles: 2, mode: 'once' }, params: { inDur: 0.3, outDur: 0.15 } } },
      ],
    },
    {
      id: 'hero-sequence',
      name: 'Website Hero',
      description: 'A camera-move hero: your lines arrive as shots, with a studio kicker above and a scroll cue below.',
      aspect: '16:9', duration: 8,
      bg: { type: 'linear', color: '#ff5e5b', color2: '#1b0a2e', angle: 180 },
      layers: [
        { name: 'Kicker', preset: 'rise', look: 'Swiss cut', text: 'TYPOMAN STUDIO',
          set: { type: { size: 0.032, tracking: 0.32, case: 'upper' }, fill: { type: 'solid', color: '#ffe3a3' }, anchor: { x: 0.5, y: 0.14 }, time: { delay: 0.3, cycles: 2, mode: 'once' }, params: { inDur: 0.25, outDur: 0.15 } } },
        { role: 'headline', name: 'Hero', preset: 'sequence', look: 'Sunset Drive', text: 'Design\nthat moves\npeople',
          set: { type: { size: 0.18, case: 'none', leading: 1.05 }, params: { move: 'zoom', trans: 0.4, stagger: 0.3, drift: 0.8 } } },
        { name: 'Scroll cue', preset: 'rise', look: 'Editorial', text: 'Scroll to explore',
          set: { type: { size: 0.035, tracking: 0.08, case: 'none' }, fill: { type: 'solid', color: '#f5f5f7' }, anchor: { x: 0.5, y: 0.88 }, time: { delay: 2.8, cycles: 2, mode: 'once' }, params: { inDur: 0.3, outDur: 0.2 } } },
      ],
    },
    {
      id: 'story-pop',
      name: 'Story Pop',
      description: '9:16 sticker story: a candy pop headline, a mono link cue and a small top kicker.',
      aspect: '9:16', duration: 5,
      bg: { type: 'solid', color: '#ffd6e0' },
      layers: [
        { name: 'Kicker', preset: 'rise', look: 'Swiss cut', text: 'NEW',
          set: { type: { size: 0.04, tracking: 0.35, case: 'upper' }, fill: { type: 'solid', color: '#2b0a3d' }, anchor: { x: 0.5, y: 0.12 }, time: { delay: 0.2, cycles: 2, mode: 'once' }, params: { inDur: 0.25, outDur: 0.15 } } },
        { role: 'headline', name: 'Pop', preset: 'pop', look: 'Candy', text: 'SUMMER',
          set: { type: { size: 0.28, case: 'upper' }, params: { squash: 0.7, bounce: 0.65, wobble: 10 } } },
        { name: 'Link cue', preset: 'typewriter', look: 'Prompt', text: 'LINK IN BIO',
          set: { type: { size: 0.045, tracking: 0.12, case: 'upper' }, fill: { type: 'solid', color: '#2b0a3d' }, anchor: { x: 0.5, y: 0.82 }, time: { delay: 1.2, cycles: 2, mode: 'once' } } },
      ],
    },
    {
      id: 'logo-zoom',
      name: 'Logo Zoom',
      description: 'A logo sting that dives through your wordmark, then holds an italic tagline.',
      aspect: '1:1', duration: 4,
      bg: { type: 'solid', color: '#062925' },
      layers: [
        { role: 'headline', name: 'Wordmark', preset: 'zoom-through', look: 'Mint Dive', text: 'BRAND',
          set: { type: { size: 0.22, case: 'upper' }, params: { twist: -0.3, hold: 0.45 } } },
        { name: 'Tagline', preset: 'rise', look: 'Editorial', text: 'Moves with you',
          set: { font: { family: 'Fraunces', weight: 500, italic: true }, type: { size: 0.06, case: 'none' }, fill: { type: 'solid', color: '#eafff7' }, anchor: { x: 0.5, y: 0.8 }, time: { delay: 1.4, cycles: 2, mode: 'once' }, params: { inDur: 0.3, outDur: 0.2 } } },
      ],
    },
    {
      id: 'lyric-sequence',
      name: 'Lyric Sequence',
      description: 'Lyric video: each line gets its own camera shot, with a quiet artist credit underneath.',
      aspect: '16:9', duration: 8,
      bg: { type: 'solid', color: '#000000' },
      post: { grain: 0.22, vignette: 0.3 },
      layers: [
        { role: 'headline', name: 'Lyrics', preset: 'sequence', look: 'Lyric Video', text: 'We rise\nWe fall\nWe rise again',
          set: { type: { size: 0.2, case: 'none', leading: 1.05 }, params: { move: 'mix', trans: 0.45, stagger: 0.25 } } },
        { name: 'Credit', preset: 'typewriter', look: 'Manuscript', text: 'TYPOMAN RECORDS',
          set: { type: { size: 0.032, tracking: 0.2, case: 'upper' }, fill: { type: 'solid', color: '#f5f5f7' }, anchor: { x: 0.5, y: 0.9 }, time: { delay: 3, cycles: 2, mode: 'once' } } },
      ],
    },
    {
      id: 'editorial-spotlight',
      name: 'Editorial Spotlight',
      description: 'A quote revealed by a moving spotlight, then its attribution — a print-style editorial card.',
      aspect: '16:9', duration: 7,
      bg: { type: 'solid', color: '#0b0b0c' },
      post: { grain: 0.35, vignette: 0.5 },
      layers: [
        { role: 'headline', name: 'Quote', preset: 'spotlight', look: 'Noir', text: 'Type is the voice\nof the page.',
          set: { type: { size: 0.15, case: 'none', leading: 1.05 }, params: { radius: 0.28, flicker: 0.1, dark: 0.04, hard: true } } },
        { name: 'Attribution', preset: 'rise', look: 'Swiss cut', text: '— THE EDITOR',
          set: { type: { size: 0.026, tracking: 0.25, case: 'upper' }, fill: { type: 'solid', color: '#ffb547' }, anchor: { x: 0.5, y: 0.82 }, time: { delay: 2, cycles: 2, mode: 'once' }, params: { inDur: 0.3, outDur: 0.15 } } },
      ],
    },
    {
      id: 'kaleido-window',
      name: 'Kaleido Window',
      description: 'Your word as a window onto a turning kaleidoscope of itself — the matte is the headline, so it never shows another word.',
      aspect: '16:9', duration: 6,
      bg: { type: 'solid', color: '#f4f1ea' },
      layers: [
        // Matte source: the headline itself, in black. The next layer is clipped to it and
        // also carries the headline role, so build(id, { text }) replaces both with the
        // user's text — no hard-coded word ever appears inside the window.
        { role: 'headline', name: 'Window', preset: 'rise', look: 'Title card', text: 'MORNING',
          set: { type: { size: 0.42, tracking: -0.01, case: 'upper' }, fill: { type: 'solid', color: '#141414' }, params: { inDur: 0.3, outDur: 0.12, stagger: 0.35 } } },
        { role: 'headline', name: 'Inside', preset: 'kaleido', look: 'Acid bloom', text: 'MORNING',
          set: { type: { size: 0.32, case: 'upper' }, params: { segments: 12, flow: 1, swingCycles: 2, spin: -1, textScale: 0.85 }, matte: { mode: 'alpha', show: true } } },
        { name: 'Credit', preset: 'typewriter', look: 'Editorial', text: 'A TYPOMAN WINDOW',
          set: { type: { size: 0.03, tracking: 0.35, case: 'upper' }, fill: { type: 'solid', color: '#141414' }, anchor: { x: 0.5, y: 0.88 }, time: { delay: 1.4, cycles: 2, mode: 'once' } } },
      ],
    },
    {
      id: 'orbit-badge',
      name: 'Orbit Badge',
      description: 'A spinning badge: your word in the centre, ringed by itself — for avatars, stickers and social profiles.',
      aspect: '1:1', duration: 6,
      bg: { type: 'solid', color: '#f4f1ea' },
      layers: [
        { role: 'headline', name: 'Badge', preset: 'orbit', look: 'Badge', text: 'STUDIO',
          set: { type: { size: 0.2, case: 'upper' }, params: { rings: 2, spacing: 0.14, tilt: 0, wobble: 0, bank: 0, separator: 'star', textScale: 0.46, coreScale: 0.62 } } },
        { name: 'Established', preset: 'rise', look: 'Swiss cut', text: 'EST. 2026',
          set: { type: { size: 0.032, tracking: 0.3, case: 'upper' }, fill: { type: 'solid', color: '#ff3b00' }, anchor: { x: 0.5, y: 0.89 }, time: { delay: 1.8, cycles: 2, mode: 'once' }, params: { inDur: 0.3, outDur: 0.15 } } },
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
