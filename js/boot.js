/* TYPOMAN — script manifest + loader.
 *
 * One list of files, used three ways:
 *   1. pages load it:  <script src="js/boot.js" data-groups="engine,presets,studio"></script>
 *   2. player.js loads it from its own base URL to power <typoman-player> embeds
 *   3. the standalone-HTML exporter reads TM_MANIFEST to inline the engine + presets
 *
 * Files load in order (async = false keeps execution order while downloads run in parallel).
 * When everything has loaded, window.TM_READY resolves and a 'tm:ready' event fires.
 * Each team owns one array below; add new files to your own array only.
 */
(function () {
  'use strict';

  // ── Engine core (owner: lead) ──
  var ENGINE = [
    'js/engine/core.js',
    'js/engine/fonts.js',
    'js/engine/text.js',
    'js/engine/path.js',
    'js/engine/scene.js',
    'js/engine/renderer.js',
  ];

  // ── Presets: reference set (owner: lead) ──
  var PRESETS_CORE = [
    'js/presets/path-flow.js',
    'js/presets/rise.js',
    'js/presets/stack.js',
  ];

  // ── Presets: path & loop family (owner: preset team A) ──
  var PRESETS_A = [
    'js/presets/path-kit.js',
    'js/presets/wave.js',
    'js/presets/path-land.js',
  ];

  // ── Presets: reveal, glitch & dimensional family (owner: preset team B) ──
  var PRESETS_B = [
    'js/presets/scramble.js',
    'js/presets/typewriter.js',
    'js/presets/split-flap.js',
    'js/presets/assemble.js',
    'js/presets/pop.js',
    'js/presets/glitch.js',
    'js/presets/cylinder.js',
    'js/presets/flip.js',
  ];

  // ── Export & embed runtime (owner: export team) ──
  var EXPORT = [
    'js/export/core.js',
    'js/export/codecs.js',
    'js/export/frames.js',
    'js/export/webm-alpha.js',
    'js/export/video.js',
    'js/export/recorder.js',
    'js/export/gif.js',
    'js/export/zip.js',
    'js/export/png.js',
    'js/export/standalone.js',
    'js/export/run.js',
  ];

  // ── Studio shell (owner: UI team) ──
  var STUDIO_UI = [
    'js/studio/store.js',
    'js/studio/ui.js',
    'js/studio/controls.js',
    'js/studio/font-picker.js',
    'js/studio/curve-editor.js',
    'js/studio/color-picker.js',
    'js/studio/inspector.js',
    'js/studio/gallery.js',
    'js/studio/layers.js',
    'js/studio/stage.js',
    'js/studio/timeline.js',
    'js/studio/onboarding.js',
    'js/studio/app.js',
  ];

  // ── Studio: path editor (owner: path team) ──
  var STUDIO_PATH = [
    'js/studio/path-editor.js',
    'js/studio/path-panel.js',
  ];

  // ── Studio: export, embed & share dialogs (owner: export team) ──
  var STUDIO_EXPORT = [
    'js/studio/export-dialog.js',
    'js/studio/share-dialog.js',
  ];

  var GROUPS = {
    engine: ENGINE,
    presets: PRESETS_CORE.concat(PRESETS_A, PRESETS_B),
    export: EXPORT,
    // Studio panels register themselves; app.js must come last so it can find them.
    studio: STUDIO_UI.slice(0, -1).concat(STUDIO_PATH, STUDIO_EXPORT, STUDIO_UI.slice(-1)),
  };

  var me = document.currentScript;
  var src = (me && me.src) || '';
  var base = src.slice(0, src.lastIndexOf('/js/') + 1) || './';
  var wanted = ((me && me.getAttribute('data-groups')) || 'engine,presets').split(',').map(function (s) { return s.trim(); });
  var files = [];
  wanted.forEach(function (g) {
    if (g === 'studio' && wanted.indexOf('export') < 0) files = files.concat(GROUPS.export);
    files = files.concat(GROUPS[g] || []);
  });

  window.TM_MANIFEST = { base: base, groups: GROUPS, files: files };

  function load(file) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = base + file;
      s.async = false;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + file)); };
      document.head.appendChild(s);
    });
  }

  window.TM_READY = Promise.all(files.map(load)).then(function () {
    window.dispatchEvent(new Event('tm:ready'));
    return window.TM;
  });
  window.TM_READY.catch(function (err) {
    console.error('[TYPOMAN] boot failed:', err);
  });
})();
