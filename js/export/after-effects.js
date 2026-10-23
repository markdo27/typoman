/* AE export: one text layer per studio layer. The default transfers preview curves
 * with two timing keys. Optional native controls rebuild supported presets using
 * text paths and animators. AE itself creates the .aep when the JSX is run. */
(function (TM) {
  'use strict';
  const X = TM.Export;
  const json = (v) => JSON.stringify(v).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const SUPPORTED = ['path-flow', 'wave', 'rise', 'typewriter'];
  const colorContext = document.createElement('canvas').getContext('2d');
  const rgb = (hex) => {
    colorContext.fillStyle = hex;
    const s = colorContext.fillStyle;
    return /^#[0-9a-f]{6}$/i.test(s) ? [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255) : [1, 1, 1];
  };
  X.afterEffectsNotes = (scene) => scene.layers.flatMap((l) => {
    const name = l.name || 'Text';
    const notes = [];
    if (!SUPPORTED.includes(l.preset)) notes.push(name + ': ' + TM.getPreset(l.preset).name + ' has no native AE motion adapter; its complete text is exported without preset motion.');
    if (l.pathMorph.enabled) notes.push(name + ': path poses use sparse native mask keys; AE interpolation can differ from the studio.');
    return notes;
  });

  // These expressions intentionally expose a handful of named, keyframeable controls.
  // They contain no sampled frames and keep working when Source Text is edited in AE.
  const fx = (name) => 'effect(' + json(name) + ')(1)';
  const PHASE = 'var cycle=Math.max(0.001,' + fx('Cycle (s)') + ');\n' +
    'var u=(time-' + fx('Delay (s)') + ')/cycle;\n' +
    'var p=' + fx('Loop') + '>0 ? ((u%1)+1)%1 : Math.max(0,Math.min(0.999999,u));\n';
  const WAVE = PHASE + 'var th=2*Math.PI*(p*' + fx('Wave cycles') + '-(textIndex-1)/Math.max(1,' + fx('Wavelength (characters)') + '));\n' +
    'var wave=Math.sin(th);\n';
  const REVEAL = PHASE +
    'var rank=(textIndex-1)/Math.max(1,textTotal-1);\n' +
    'if(' + fx('Reverse order') + '>0) rank=1-rank;\n' +
    'var stagger=Math.max(0,Math.min(0.99,' + fx('Stagger (%)') + '/100));\n' +
    'var a=Math.max(0,' + fx('In (%)') + '/100), b=Math.max(0,' + fx('Out (%)') + '/100);\n' +
    'if(a+b>1){var total=a+b;a/=total;b/=total;}\n' +
    'var ki=a>0?Math.max(0,Math.min(1,(p/a-rank*stagger)/(1-stagger))):1;\n' +
    'var ko=b>0?Math.max(0,Math.min(1,((p-(1-b))/b-rank*stagger)/(1-stagger))):0;\n' +
    'var power=Math.max(1,' + fx('Ease power') + ');\n' +
    'var vin=1-Math.pow(1-ki,power), vout=Math.pow(ko,power);\n';

  function shapeFor(path, plan, anchor, samples = 0) {
    if (samples) {
      const p = TM.Path.sample(path, plan.width, plan.height);
      return { closed: path.closed, vertices: Array.from({ length: samples }, (_, i) => {
        const pt = p.atU(i / (path.closed ? samples : samples - 1));
        return [pt.x - anchor[0], pt.y - anchor[1]];
      }), inTangents: Array.from({ length: samples }, () => [0, 0]), outTangents: Array.from({ length: samples }, () => [0, 0]) };
    }
    return { closed: path.closed, vertices: path.nodes.map((n) => [n.x * plan.width - anchor[0], n.y * plan.height - anchor[1]]),
      inTangents: path.nodes.map((n) => [n.ix * plan.width, n.iy * plan.height]),
      outTangents: path.nodes.map((n) => [n.ox * plan.width, n.oy * plan.height]) };
  }

  X.encodeAfterEffects = async function (plan, scene, hooks = {}) {
    if (plan.aeMode !== 'native') {
      const { layers, notes } = await X.AEMotion.build(plan, scene, hooks);
      layers.forEach((l) => { l.color = rgb(l.color); l.strokeColor = rgb(l.strokeColor); });
      return file(plan, scene, layers, notes, 'ae-preview');
    }
    const notes = [
      'One editable AE text layer per Typoman layer. Change Source Text, Effect Controls and Text > Animators / Path Options. Motion is expression-driven, with no per-frame or per-letter keys and no parent nulls.',
      'Native motion adapters: Path Flow, Wave, Rise and Typewriter. These use AE spacing and simplified motion curves, so appearance can differ. Other presets keep their text without preset motion.',
      'Install the scene fonts in After Effects first. Echoes, custom artwork, track mattes, glow, shadow, blur, extrusion, grain, vignette and font-axis animation are not transferred. Gradients/palettes become a solid colour. Use PNG sequence for exact appearance.',
      ...X.afterEffectsNotes(scene)
    ];
    const renderer = X.makeRenderer(scene, plan);
    const rate = plan.span > 0 ? plan.span / plan.duration : 1;
    const layers = [];
    for (const l of scene.layers) {
      X.throwIfAborted(hooks.signal);
      const layout = renderer._layout(l, plan.width, plan.height, TM.getPreset(l.preset));
      const P = l.params;
      const anchor = [l.anchor.x * plan.width, l.anchor.y * plan.height];
      const cycle = scene.duration / (l.time.cycles * rate), delay = l.time.delay / rate;
      const controls = { 'Cycle (s)': cycle, 'Delay (s)': delay, Loop: l.time.mode === 'loop' ? 1 : 0 };
      const out = { name: l.name, text: layout.lines.map((ln) => ln.text).join('\r'), visible: l.visible !== false,
        preset: l.preset, font: l.font.family, size: Math.min(1296, layout.sizePx), tracking: l.type.tracking * 1000,
        leading: layout.lineGap, align: l.type.align, color: rgb(l.fill.type === 'palette' ? l.fill.palette[0] : l.fill.color),
        stroke: l.stroke.mode, strokeColor: rgb(l.stroke.color), strokeWidth: l.stroke.width * layout.sizePx,
        anchor, controls, animators: [], path: null, transform: [] };
      function animator(name, property, value, amount, propertyExpression) {
        const split = amount.lastIndexOf('\n') + 1;
        amount = amount.slice(0, split) + 'var amount=' + amount.slice(split) + '\n[amount,amount,amount];';
        out.animators.push({ name, property, value, amount, propertyExpression: propertyExpression || '' });
      }
      if (l.preset === 'wave') {
        Object.assign(controls, { 'Wave height (px)': P.amp * layout.sizePx, 'Wave cycles': P.cycles,
          'Wavelength (characters)': P.wavelength, 'Lean (deg)': P.follow * 30, 'Scale pulse (%)': P.scale * 100, 'Depth fade (%)': P.depth * 100 });
        animator('Wave / height', 'ADBE Text Position 3D', [0, 0, 0], WAVE + 'wave*100;', '[0,-' + fx('Wave height (px)') + ',0];');
        animator('Wave / lean', 'ADBE Text Rotation', 0, WAVE + 'Math.cos(th)*100;', fx('Lean (deg)') + ';');
        animator('Wave / scale', 'ADBE Text Scale 3D', [100, 100, 100], WAVE + 'wave*100;', 'var s=100+' + fx('Scale pulse (%)') + ';[s,s,100];');
        animator('Wave / depth', 'ADBE Text Opacity', 0, WAVE + 'Math.max(0,-wave)*' + fx('Depth fade (%)') + ';');
        if (P.mode !== 'sine' || P.envelope !== 'steady' || P.weightWave || P.colorWave) notes.push(l.name + ': Wave uses native sine motion; envelope, bounce/ripple/cascade variants, animated colour and font weight are not transferred.');
      } else if (l.preset === 'rise' || l.preset === 'typewriter') {
        Object.assign(controls, { 'In (%)': P.inDur * 100, 'Out (%)': P.timing === 'in' ? 0 : P.outDur * 100,
          'Stagger (%)': (P.stagger || 0) * 100, 'Reverse order': P.order === 'end' ? 1 : 0, 'Ease power': 3 });
        if (l.preset === 'rise') {
          Object.assign(controls, { 'Travel (px)': P.distance * layout.capH * 1.1 * (P.direction === 'down' ? -1 : 1),
            'Tilt (deg)': P.tilt, 'Start scale (%)': P.scaleFrom * 100 });
          animator('Rise / travel', 'ADBE Text Position 3D', [0, 0, 0], REVEAL + '((1-vin)-vout)*100;', '[0,' + fx('Travel (px)') + ',0];');
          animator('Rise / tilt', 'ADBE Text Rotation', 0, REVEAL + '((1-vin)-vout*0.5)*100;', fx('Tilt (deg)') + ';');
          animator('Rise / scale', 'ADBE Text Scale 3D', [100, 100, 100], REVEAL + '(1-vin)*100;', 'var s=' + fx('Start scale (%)') + ';[s,s,100];');
          animator('Rise / visibility', 'ADBE Text Opacity', 0, REVEAL + '(1-vin*(1-vout))*100;');
          notes.push(l.name + ': Rise uses native character staggering and power easing; line clipping, word/line orders, jitter and custom easing are not transferred.');
        } else {
          animator('Typewriter / visibility', 'ADBE Text Opacity', 0, PHASE +
            'var a=Math.max(0.001,' + fx('In (%)') + '/100), b=Math.max(0,' + fx('Out (%)') + '/100);\n' +
            'if(a+b>1){var total=a+b;a/=total;b/=total;}\n' +
            'var count=Math.floor(Math.min(1,p/a)*textTotal);\n' +
            'if(b>0&&p>1-b) count=Math.ceil((1-(p-(1-b))/b)*textTotal);\n' +
            'textIndex>count?100:0;');
          notes.push(l.name + ': Typewriter uses native character visibility; the caret, human rhythm, ink wobble and live centring are not transferred.');
        }
      } else if (l.preset === 'path-flow' && l.path) {
        const path = TM.Path.sample(l.path, plan.width, plan.height);
        const width = Math.max(1, layout.width), gap = P.gap * layout.sizePx;
        const unit = width + gap;
        const shapes = [l.path].concat(l.pathMorph.enabled ? TM.Path.morphKeys(l.pathMorph) : []);
        const topologyMatches = shapes.every((p) => p.closed === shapes[0].closed && p.nodes.length === shapes[0].nodes.length);
        // A small set of native mask poses, never samples for every animation frame.
        const poses = shapes.map((p) => shapeFor(p, plan, anchor, topologyMatches ? 0 : 64));
        let sequence = poses;
        if (poses.length > 1) sequence = l.pathMorph.mode === 'cycle' ? poses.concat([poses[0]]) : poses.concat(poses.slice(0, -1).reverse());
        out.path = { shapes: sequence, times: sequence.map((_, i) => delay + (sequence.length > 1 ? i / (sequence.length - 1) * cycle : 0)),
          follow: P.rotate >= 0.5, marginExpression: '' };
        out.align = 'left';
        Object.assign(controls, { 'Path offset (px)': P.offset * (l.path.closed ? path.length : path.length - width), 'Scroll cycles': P.speed,
          'Travel distance (px)': P.mode === 'travel' ? path.length + (l.path.closed ? 0 : width * 2) : unit });
        if (P.mode === 'fill') {
          const separators = { space: ' ', dot: ' • ', dash: ' — ', slash: ' / ', star: ' ✦ ', none: '' };
          controls.Repeats = Math.min(100, Math.max(2, Math.ceil(path.length / unit) + 2));
          const sep = json(separators[P.separator] || '');
          out.sourceExpression = 'var lines=value.toString().split(/\\r\\n|\\r|\\n/);\n' +
            'var n=Math.max(1,Math.min(100,Math.round(' + fx('Repeats') + ')));\n' +
            'for(var i=0;i<lines.length;i++){var base=lines[i],s="";for(var j=0;j<n;j++)s+=base+' + sep + ';lines[i]=s;}\nlines.join("\\r");';
        }
        if (P.mode === 'travel') {
          out.path.marginExpression = PHASE + 'var speed=' + fx('Scroll cycles') + ';\n' +
            'var q=(p*Math.max(1,Math.abs(speed)))%1;\n' +
            (l.path.closed ? fx('Path offset (px)') + '+' + fx('Travel distance (px)') + '*q*(speed<0?-1:1);' :
              fx('Path offset (px)') + '-' + width + '+' + fx('Travel distance (px)') + '*(speed<0?1-q:q);');
        } else out.path.marginExpression = PHASE + fx('Path offset (px)') + (P.mode === 'still' ? ';' :
          '+' + fx('Travel distance (px)') + '*' + fx('Scroll cycles') + '*p;');
        if (P.wave > 0) {
          Object.assign(controls, { 'Wave height (px)': P.wave * layout.sizePx * 0.5, 'Wave cycles': P.waveSpeed,
            'Wavelength (characters)': Math.max(1, P.waveLength * 2) });
          animator('Path / wave', 'ADBE Text Position 3D', [0, 0, 0], WAVE + 'wave*100;', '[0,-' + fx('Wave height (px)') + ',0];');
        }
        notes.push(l.name + ': Path Flow uses AE text-on-path spacing and a linear scroll/travel control. Corner smoothing, bend spacing, parallel-lane direction and open-end fades can differ. Edit the mask, Path Options and Effect Controls.');
      }
      if (l.transform.enabled) {
        out.transform = l.transform.keys.map((k) => ({ time: delay + k.t * cycle,
          position: [anchor[0] + k.x * plan.width, anchor[1] + k.y * plan.height], scale: [k.scale * 100, k.scale * 100], rotation: k.rot, opacity: k.opacity * 100 }));
        // Keep boundary holds when looping a shorter set of authored poses.
        // At most two extra keys, independent of frame rate and export length.
        if (l.time.mode === 'loop' && out.transform.length > 1) {
          if (out.transform[0].time > delay) out.transform.unshift({ ...out.transform[0], time: delay });
          if (out.transform[out.transform.length - 1].time < delay + cycle) out.transform.push({ ...out.transform[out.transform.length - 1], time: delay + cycle });
        }
      }
      layers.push(out);
      if (hooks.onProgress) hooks.onProgress({ phase: 'prepare', fraction: layers.length / scene.layers.length * 0.96 });
      await X.breathe();
    }
    return file(plan, scene, layers, notes, 'ae-native');
  };

  function file(plan, scene, layers, notes, engine) {
    const data = { name: scene.name, width: plan.width, height: plan.height, fps: plan.fps, duration: plan.duration,
      bg: scene.bg.type === 'transparent' ? null : rgb(scene.bg.color), layers, notes };
    const source = '// TYPOMAN editable After Effects export: one text layer per studio layer.\n' +
      '(function () {\nvar data = ' + json(data) + ';\n(' + importProject.toString() + ')(data);\n})();\n';
    return { blob: new Blob([source], { type: 'text/javascript' }), info: { label: engine === 'ae-preview' ? 'After Effects / preview motion' : 'After Effects / native text', engine, layers: layers.length, notes } };
  }

  // ES3-compatible ExtendScript. Indexed groups are always reacquired after additions.
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
      var i, j, layer, l, prop, doc, name;
      function shape(s) {
        var result = new Shape();
        result.vertices = s.vertices; result.inTangents = s.inTangents; result.outTangents = s.outTangents; result.closed = s.closed;
        return result;
      }
      function authoredKeys(p, times, values, loop) {
        if (times.length === 1) { p.setValue(values[0]); return; }
        p.setValuesAtTimes(times, values);
        for (var k = 1; k <= p.numKeys; k++) p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
        if (loop) p.expression = 'loopOut("cycle");';
      }
      if (d.bg) {
        var bg = comp.layers.addSolid(d.bg, 'Background', d.width, d.height, 1, d.duration);
        bg.source.parentFolder = folder;
      }
      for (i = 0; i < d.layers.length; i++) {
        l = d.layers[i];
        stage = 'creating text layer ' + l.name;
        layer = comp.layers.addText(l.text);
        layer.name = l.name; layer.enabled = l.visible;
        layer.comment = 'TYPOMAN ' + l.preset + (l.matchPreview ? '. Retime the two Motion progress keys. Re-export detailed motion or copy changes to preserve layout.\n' : '. Edit Source Text, Effect Controls, Text > Animators and Path Options.\n') + d.notes.join('\n');
        prop = layer.property('ADBE Text Properties').property('ADBE Text Document');
        stage = 'styling ' + l.name;
        doc = prop.value;
        doc.text = l.text; doc.font = l.font; doc.fontSize = l.size;
        doc.justification = l.align === 'left' ? ParagraphJustification.LEFT_JUSTIFY : l.align === 'right' ? ParagraphJustification.RIGHT_JUSTIFY : ParagraphJustification.CENTER_JUSTIFY;
        doc.tracking = l.tracking; doc.autoLeading = false; doc.leading = l.leading;
        doc.fillColor = l.color; doc.strokeColor = l.strokeColor; doc.strokeWidth = l.strokeWidth;
        // AE colour setters enable paint; apply requested modes last.
        doc.applyFill = l.stroke !== 'outline'; doc.applyStroke = l.stroke === 'outline' || l.stroke === 'both';
        prop.setValue(doc);
        layer.property('ADBE Transform Group').property('ADBE Position').setValue(l.anchor);
        if (l.matchPreview) layer.property('ADBE Text Properties').property('ADBE Text More Options').property('ADBE Text Anchor Point Align').setValue([0, -50]);
        if (l.path || l.matchPreview) layer.property('ADBE Transform Group').property('ADBE Anchor Point').setValue([0, 0]);
        else layer.property('ADBE Transform Group').property('ADBE Anchor Point').expression =
          'var r=sourceRectAtTime(0,false);[r.left+r.width/2,r.top+r.height/2];';
        stage = 'adding motion controls to ' + l.name;
        for (name in l.controls) {
          if (!l.controls.hasOwnProperty(name)) continue;
          var effect = layer.property('ADBE Effect Parade').addProperty('ADBE Slider Control');
          effect.name = name;
          effect.property('ADBE Slider Control-0001').setValue(l.controls[name]);
          if (name === 'Motion progress (%)' && l.progressKeys) authoredKeys(effect.property('ADBE Slider Control-0001'), l.progressKeys.times, l.progressKeys.values, false);
        }
        if (l.sourceExpression) prop.expression = l.sourceExpression;
        stage = 'adding text animators to ' + l.name;
        for (j = 0; j < l.animators.length; j++) {
          var a = l.animators[j];
          var animator = layer.property('ADBE Text Properties').property('ADBE Text Animators').addProperty('ADBE Text Animator');
          animator.name = a.name;
          var attribute = animator.property('ADBE Text Animator Properties').addProperty(a.property);
          attribute.setValue(a.value);
          if (a.propertyExpression) attribute.expression = a.propertyExpression;
          var selector = animator.property('ADBE Text Selectors').addProperty('ADBE Text Expressible Selector');
          if (l.matchPreview) selector.property('ADBE Text Range Type2').setValue(1); // characters, including spaces
          selector.property('ADBE Text Expressible Amount').expression = a.amount;
        }
        if (l.path) {
          stage = 'creating editable text path for ' + l.name;
          var mask = layer.property('ADBE Mask Parade').addProperty('ADBE Mask Atom');
          mask.name = 'Motion path'; mask.maskMode = MaskMode.NONE;
          var times = [], values = [];
          for (j = 0; j < l.path.shapes.length; j++) { times.push(l.path.times[j]); values.push(shape(l.path.shapes[j])); }
          authoredKeys(mask.property('ADBE Mask Shape'), times, values, l.controls.Loop > 0);
          var options = layer.property('ADBE Text Properties').property('ADBE Text Path Options');
          options.property('ADBE Text Path').setValue(1);
          options.property('ADBE Text Perpendicular To Path').setValue(l.path.follow ? 1 : 0);
          options.property('ADBE Text First Margin').expression = l.path.marginExpression;
        }
        stage = 'writing authored transform keys for ' + l.name;
        var fields = ['position', 'scale', 'rotation', 'opacity'];
        var names = ['ADBE Position', 'ADBE Scale', 'ADBE Rotate Z', 'ADBE Opacity'];
        for (var n = 0; n < fields.length && l.transform.length; n++) {
          var ts = [], vs = [];
          for (j = 0; j < l.transform.length; j++) { ts.push(l.transform[j].time); vs.push(l.transform[j][fields[n]]); }
          authoredKeys(layer.property('ADBE Transform Group').property(names[n]), ts, vs, l.controls.Loop > 0);
        }
        layer.inPoint = 0; layer.outPoint = d.duration;
      }
      comp.openInViewer();
      stage = 'saving project';
      if (destination) app.project.save(destination);
      alert('TYPOMAN imported.\n\n' + d.notes.join('\n\n'));
    } catch (error) {
      alert('TYPOMAN import failed while ' + stage + ': ' + error.toString());
      throw error;
    } finally { app.endUndoGroup(); }
  }
})(window.TM);
