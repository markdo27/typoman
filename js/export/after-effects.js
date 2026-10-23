/* Editable AE export. Sample the same preset frame API as the renderer, rather than
 * translating individual preset equations. JSX uses AE's public scripting API; AE itself
 * writes the binary .aep. No browser-produced file is disguised as a native project. */
(function (TM) {
  'use strict';
  const X = TM.Export, DEG = 180 / Math.PI;
  const colorContext = document.createElement('canvas').getContext('2d');
  const json = (v) => JSON.stringify(v).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const rgb = (hex) => {
    const c = colorContext;
    c.fillStyle = hex;
    const s = c.fillStyle;
    return /^#[0-9a-f]{6}$/i.test(s) ? [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255) : [1, 1, 1];
  };

  X.encodeAfterEffects = async function (plan, scene, hooks = {}) {
    const notes = [
      'Run this JSX in After Effects: File > Scripts > Run Script File, then select a destination for the .aep. Cancelling the save keeps the imported composition open.',
      'Install the scene fonts in After Effects first. Font styles and variable axes can differ from the browser.',
      'Editable glyph/run text with frame-sampled HOLD keys. Canvas masks, particles, custom drawing, glow, shadow, blur, extrusion, grain, vignette and dynamic overlap order are not reproduced. Gradients become solid colours; font-axis animation is not transferred.'
    ];
    const renderer = X.makeRenderer(scene, plan), f = renderer.frame;
    const tracks = new Map(), groups = scene.layers.map((l, i) => ({ name: l.name || 'Layer ' + (i + 1), frames: [] }));
    let frame = 0, counts, samples = 0;
    // Sample text once per pass, without motion-blur subframes or raster compositing FX.
    renderer._renderLayer = function (layer, index, t, w, h) {
      this._drawPasses(this._lctx, layer, index, TM.getPreset(layer.preset), t, w, h);
    };
    function capture(item, o = {}, line = false) {
      if (!line && item.isSpace && o.ch == null) return;
      const ch = line ? item.text : o.ch == null ? item.ch : String(o.ch);
      if (!ch || !ch.trim()) return;
      const base = [f.index, f.echo, line ? 'line' : 'glyph', line ? item.index : item.i].join(':');
      const occurrence = counts.get(base) || 0;
      counts.set(base, occurrence + 1);
      const key = base + ':' + occurrence;
      let tr = tracks.get(key);
      if (!tr) {
        tr = { group: f.index, name: ch.slice(0, 40), font: f.layer.font.family, weight: f.layer.font.weight, frames: [] };
        tracks.set(key, tr);
      }
      const sx = o.sx != null ? o.sx : o.scale != null ? o.scale : 1;
      const sy = o.sy != null ? o.sy : o.scale != null ? o.scale : 1;
      const size = !line && o.size != null ? o.size : f.size;
      const w = line ? item.width : o.w != null ? o.w : o.ch != null && o.ch !== item.ch ? renderer._advance(ch, f.layer, f.size) : item.w;
      const x = o.x != null ? o.x : line ? f.cx + item.x + item.width / 2 : f.cx + item.cx;
      const y = o.y != null ? o.y : line ? f.cy + item.y - f.layout.capH / 2 : f.cy + item.cy;
      const xf = renderer._transformAt(f.layer, X.frameTime(plan, frame), plan.width, plan.height);
      const alpha = Math.max(0, Math.min(1, (o.alpha == null ? 1 : o.alpha) * f.alpha * (xf ? xf.opacity : 1)));
      if (++samples > 250000) throw new Error('After Effects export is too large. Reduce the duration, frame rate, text length or echoes (250,000 text samples maximum).');
      if ((o.skew || f.slant) && !notes.includes('Text skew/slant is not transferred.')) notes.push('Text skew/slant is not transferred.');
      tr.frames.push({ frame, text: ch, size: f.size, tracking: line ? f.layout.tracking / f.size * 1000 : 0,
        anchor: [w / 2, o.anchor === 'baseline' && !line ? 0 : -f.layout.capH / 2],
        position: [x, y], scale: [sx * 100 * size / f.size, sy * 100 * size / f.size],
        rotation: (o.rot || 0) * DEG, opacity: alpha * 100,
        color: rgb(o.color || f.colorOf(line ? { vi: item.index, cx: x - f.cx, cy: y - f.cy } : item)),
        stroke: f.layer.stroke.mode, strokeColor: rgb(f.layer.stroke.color), strokeWidth: f.strokeW });
    }
    for (const method of ['drawGlyph', 'drawLine']) {
      const original = f[method];
      f[method] = function (item, o) { capture(item, o, method === 'drawLine'); return original.call(this, item, o); };
    }
    // _drawPreset catches rendering errors; retain capture failures outside that boundary.
    let captureError;
    for (const method of ['drawGlyph', 'drawLine']) {
      const wrapped = f[method];
      f[method] = function (...args) { try { return wrapped.apply(this, args); } catch (e) { captureError = e; throw e; } };
    }
    for (frame = 0; frame < plan.frames; frame++) {
      X.throwIfAborted(hooks.signal);
      counts = new Map();
      const t = X.frameTime(plan, frame);
      renderer.render(t);
      if (captureError) throw captureError;
      if (renderer._warned) throw new Error('A motion preset failed while sampling the After Effects export.');
      scene.layers.forEach((l, i) => {
        const xf = renderer._transformAt(l, t, plan.width, plan.height);
        const a = xf ? Math.hypot(xf.a, xf.b) : 1;
        groups[i].frames.push({ position: xf ? [xf.e, xf.f] : [0, 0], scale: [a * 100, a * 100],
          rotation: xf ? Math.atan2(xf.b, xf.a) * DEG : 0, opacity: xf ? xf.opacity * 100 : 100 });
      });
      if (hooks.onProgress) hooks.onProgress({ phase: 'render', fraction: (frame + 1) / plan.frames * 0.96 });
      await X.breathe();
    }
    if (!tracks.size) throw new Error('This scene produced no editable text. Particle and canvas-only presets need PNG sequence export.');
    scene.layers.forEach((l, i) => {
      if (l.visible !== false && l.text.trim() && ![...tracks.values()].some((tr) => tr.group === i)) {
        notes.push((l.name || 'Layer ' + (i + 1)) + ': no editable text was produced by this preset; its canvas artwork is omitted.');
      }
    });
    const data = { name: scene.name, width: plan.width, height: plan.height, fps: plan.fps, duration: plan.duration,
      frames: plan.frames, bg: scene.bg.type === 'transparent' ? null : rgb(scene.bg.color), groups, tracks: [...tracks.values()], notes };
    const source = '// TYPOMAN editable After Effects export. Run using File > Scripts > Run Script File.\n' +
      '(function () {\nvar data = ' + json(data) + ';\n(' + importProject.toString() + ')(data);\n})();\n';
    return { blob: new Blob([source], { type: 'text/javascript' }), info: { label: 'After Effects JSX → AEP', engine: 'ae-keyframes', notes } };
  };

  // ES3-compatible: executed by ExtendScript in After Effects, not by the browser.
  function importProject(d) {
    var destination = File.saveDialog('Save After Effects project', '*.aep');
    if (destination && !/\.aep$/i.test(destination.name)) destination = new File(destination.fsName + '.aep');
    var stage = 'creating composition';
    app.beginUndoGroup('Import TYPOMAN');
    try {
      if (!app.project) app.newProject();
      var folder = app.project.items.addFolder(d.name + ' — TYPOMAN');
      var comp = app.project.items.addComp(d.name, d.width, d.height, 1, d.duration, d.fps);
      comp.parentFolder = folder;
      comp.comment = d.notes.join('\n');
      var parents = [], i, j, t, layer, tr, doc, prop, times, values, row;
      function keys(p, ts, vs) {
        p.setValuesAtTimes(ts, vs);
        for (var k = 1; k <= p.numKeys; k++) p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
      }
      function transforms(target, rows, indices) {
        var names = ['ADBE Position', 'ADBE Scale', 'ADBE Rotate Z', 'ADBE Opacity'];
        var fields = ['position', 'scale', 'rotation', 'opacity'];
        var ts = [], vs, n, k;
        for (k = 0; k < rows.length; k++) ts.push((indices ? indices[k] : k) / d.fps);
        for (n = 0; n < names.length; n++) {
          vs = [];
          for (k = 0; k < rows.length; k++) vs.push(rows[k][fields[n]]);
          keys(target.property('ADBE Transform Group').property(names[n]), ts, vs);
        }
      }
      if (d.bg) {
        var bg = comp.layers.addSolid(d.bg, 'Background', d.width, d.height, 1, d.duration);
        bg.source.parentFolder = folder;
      }
      for (i = 0; i < d.groups.length; i++) {
        stage = 'creating layer group ' + d.groups[i].name;
        layer = comp.layers.addNull(d.duration);
        layer.source.parentFolder = folder;
        layer.name = d.groups[i].name;
        layer.property('ADBE Transform Group').property('ADBE Anchor Point').setValue([0, 0]);
        transforms(layer, d.groups[i].frames);
        parents.push(layer);
      }
      for (i = 0; i < d.tracks.length; i++) {
        tr = d.tracks[i];
        stage = 'creating text layer ' + tr.name;
        layer = comp.layers.addText(tr.name);
        layer.name = d.groups[tr.group].name + ' / ' + tr.name;
        layer.setParentWithJump(parents[tr.group]);
        prop = layer.property('ADBE Text Properties').property('ADBE Text Document');
        times = []; values = [];
        var indices = [], rows = [], anchors = [];
        for (j = 0; j < tr.frames.length; j++) {
          row = tr.frames[j];
          t = row.frame / d.fps;
          stage = 'styling ' + layer.name + ' at frame ' + row.frame;
          // Style a fresh, layer-backed value for every key. Some AE versions
          // reject style setters on an unattached new TextDocument(text).
          doc = prop.value;
          doc.text = row.text;
          doc.font = tr.font;
          doc.fontSize = row.size;
          doc.justification = ParagraphJustification.LEFT_JUSTIFY;
          doc.tracking = row.tracking;
          doc.fillColor = row.color;
          doc.strokeColor = row.strokeColor;
          doc.strokeWidth = row.strokeWidth;
          // AE enables fill/stroke when their colours are assigned. Apply the
          // requested paint modes last so fill-only and outline-only survive.
          doc.applyFill = row.stroke !== 'outline';
          doc.applyStroke = row.stroke === 'outline' || row.stroke === 'both';
          times.push(t); values.push(doc); indices.push(row.frame); rows.push(row); anchors.push(row.anchor);
        }
        stage = 'writing keyframes for ' + layer.name;
        keys(prop, times, values);
        transforms(layer, rows, indices);
        keys(layer.property('ADBE Transform Group').property('ADBE Anchor Point'), times, anchors);
        // Absent draws are invisible, including gaps in reveals and delayed layers.
        var opacity = layer.property('ADBE Transform Group').property('ADBE Opacity');
        var visible = {}, ts = [], vs = [];
        for (j = 0; j < rows.length; j++) visible[indices[j]] = rows[j].opacity;
        for (j = 0; j < d.frames; j++) { ts.push(j / d.fps); vs.push(visible[j] === undefined ? 0 : visible[j]); }
        keys(opacity, ts, vs);
        layer.inPoint = 0; layer.outPoint = d.duration;
      }
      comp.openInViewer();
      // Saving a copy protects any project that was already open in After Effects.
      stage = 'saving project';
      if (destination) app.project.save(destination);
      alert('TYPOMAN imported.\n\n' + d.notes.join('\n\n'));
    } catch (error) {
      alert('TYPOMAN import failed while ' + stage + ': ' + error.toString());
      throw error;
    } finally { app.endUndoGroup(); }
  }
})(window.TM);
