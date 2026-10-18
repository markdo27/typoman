/* TYPOMAN export — self-contained HTML player.
 *
 * One .html file that plays anywhere, including from file://: the engine scripts and only the
 * preset files the scene needs are inlined from their source (paths from TM_MANIFEST), then
 * player.js (the <typoman-player> element), the scene JSON and a Google Fonts <link> for the
 * families used. The only network request is the fonts.
 */
(function (TM) {
  'use strict';
  const X = TM.Export;

  const escHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Make JS source safe inside <script>…</script>. */
  const escScript = (src) => String(src).replace(/<\/(script)/gi, '<\\/$1');
  /** JSON safe inside <script type="application/json">. */
  const escJSON = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/ /g, '\\u2028').replace(/ /g, '\\u2029');

  async function fetchText(file) {
    const res = await fetch(X.base() + file, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Could not read ${file} (HTTP ${res.status})`);
    return res.text();
  }

  /**
   * Which preset ids a preset file registers. Evaluated against a throwaway TM whose
   * registerPreset only records ids, so it works however the file defines its presets.
   * Returns null if the file can't be evaluated (e.g. a CSP without 'unsafe-eval').
   */
  function registeredIds(src) {
    const ids = [];
    const fake = Object.create(TM);
    fake.registerPreset = (def) => { if (def && typeof def.id === 'string') ids.push(def.id); return def; };
    const fakeRoot = { TM: fake };
    try {
      // eslint-disable-next-line no-new-func
      new Function('window', 'globalThis', 'self', src)(fakeRoot, fakeRoot, fakeRoot);
      return ids;
    } catch (e) {
      const found = [];
      const re = /registerPreset\(\s*\{[\s\S]*?\bid\s*:\s*['"]([\w-]+)['"]/g;
      let m;
      while ((m = re.exec(src))) found.push(m[1]);
      return found.length ? found : null;
    }
  }

  /** Preset files to inline: files registering a used preset, plus helper files registering none. */
  X.presetFilesFor = function (scene, files, sources) {
    const used = new Set(scene.layers.map((l) => l.preset));
    const keep = [];
    const covered = new Set();
    let unknown = false;
    files.forEach((file, i) => {
      const ids = registeredIds(sources[i]);
      if (ids === null) { unknown = true; keep.push(file); return; }
      if (ids.length === 0 || ids.some((id) => used.has(id))) keep.push(file);
      ids.forEach((id) => { if (used.has(id)) covered.add(id); });
    });
    // Anything unresolved: include every preset file rather than ship a broken player.
    if (unknown || [...used].some((id) => !covered.has(id))) return files.slice();
    return keep;
  };

  function pageBackground(scene, transparent) {
    if (transparent) return 'transparent';
    const bg = scene.bg;
    if (bg.type === 'solid') return bg.color;
    if (bg.type === 'radial') return bg.color2;
    if (bg.type === 'linear') return TM.color.mix(bg.color, bg.color2, 0.5);
    return '#000000';
  }

  /**
   * Build the HTML. opts: { autoplay = true, loop = true, controls = true, transparent = false, fit = 'contain' }
   * Resolves { blob, name, html, files } (files: the inlined script paths).
   */
  X.buildStandalone = async function (sceneIn, opts = {}) {
    const scene = TM.Scene.normalize(sceneIn);
    const o = Object.assign({ autoplay: true, loop: true, controls: true, transparent: false, fit: 'contain' }, opts);
    const groups = (window.TM_MANIFEST && window.TM_MANIFEST.groups) || {};
    const engineFiles = groups.engine || [];
    const presetFiles = groups.presets || [];
    if (!engineFiles.length) throw new Error('TM_MANIFEST is missing: load the studio through js/boot.js');
    const [engineSrc, presetSrc, playerSrc] = await Promise.all([
      Promise.all(engineFiles.map(fetchText)),
      Promise.all(presetFiles.map(fetchText)),
      fetchText('player.js'),
    ]).catch((e) => { throw new Error('Could not collect the player source: ' + e.message + '. The studio must be served over http(s).'); });
    const chosen = X.presetFilesFor(scene, presetFiles, presetSrc);
    const scripts = engineFiles.map((f, i) => [f, engineSrc[i]]).concat(chosen.map((f) => [f, presetSrc[presetFiles.indexOf(f)]]));

    const families = [...new Set(scene.layers.map((l) => l.font.family))];
    const custom = families.map((f) => TM.fonts.get(f)).filter((f) => f && f.custom && f.dataUrl)
      .map((f) => ({ name: f.family.replace(/ \(custom\)$/, ''), url: f.dataUrl }));
    const webFonts = families.filter((f) => { const e = TM.fonts.get(f); return e && !e.custom; });
    const fontsHref = webFonts.length ? TM.fonts.cssUrl(webFonts) : '';
    const attrs = ['fit="' + (o.fit === 'cover' ? 'cover' : 'contain') + '"'];
    if (o.autoplay) attrs.push('autoplay');
    if (o.loop) attrs.push('loop');
    if (o.controls) attrs.push('controls');
    if (o.transparent) attrs.push('bg="transparent"');
    const title = scene.name || 'TYPOMAN';
    const version = TM.VERSION || '';

    const html = [
      '<!DOCTYPE html>',
      `<!-- ${escHTML(title).replace(/--/g, '- -')}: made with TYPOMAN ${version} (https://markdo27.github.io/typoman/). TYPOMAN engine code below is MIT licensed. -->`,
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<meta name="generator" content="TYPOMAN ${escHTML(version)}">`,
      `<title>${escHTML(title)}</title>`,
      fontsHref ? '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' : '',
      fontsHref ? `<link rel="stylesheet" href="${escHTML(fontsHref)}" crossorigin="anonymous">` : '',
      '<style>',
      `  html, body { margin: 0; height: 100%; background: ${pageBackground(scene, o.transparent)}; }`,
      '  typoman-player { position: fixed; inset: 0; width: 100%; height: 100%; }',
      '</style>',
      '</head>',
      '<body>',
      `<typoman-player ${attrs.join(' ')}></typoman-player>`,
      `<script type="application/json" id="typoman-scene">${escJSON(scene)}</script>`,
      custom.length ? `<script type="application/json" id="typoman-fonts">${escJSON(custom)}</script>` : '',
      ...scripts.map(([file, src]) => `<script data-src="${escHTML(file)}">\n${escScript(src)}\n</script>`),
      '<script>window.TM_READY = Promise.resolve(window.TM);</script>',
      `<script data-src="player.js">\n${escScript(playerSrc)}\n</script>`,
      '<script>',
      '(function () {',
      "  var el = document.querySelector('typoman-player');",
      "  var fontsEl = document.getElementById('typoman-fonts');",
      '  var fonts = fontsEl ? JSON.parse(fontsEl.textContent) : [];',
      '  Promise.all(fonts.map(function (f) {',
      '    return fetch(f.url).then(function (r) { return r.arrayBuffer(); }).then(function (buf) { return TM.fonts.addCustom(f.name, buf, f.url); }).catch(function () {});',
      '  })).then(function () {',
      "    el.scene = JSON.parse(document.getElementById('typoman-scene').textContent);",
      '  });',
      '})();',
      '</script>',
      '</body>',
      '</html>',
      '',
    ].filter((line) => line !== '').join('\n');

    const blob = new Blob([html], { type: 'text/html' });
    return { blob, html, name: X.slug(scene.name) + '.html', files: scripts.map((s) => s[0]).concat('player.js') };
  };
})(window.TM);
