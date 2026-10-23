/* Transfer the renderer's actual text motion into one AE layer. The detailed curves
 * are reduced within measured error bounds and evaluated by character selectors.
 * Only the shared Motion progress control is keyed in the AE timeline. */
(function (TM) {
  'use strict';
  const X = TM.Export, A = X.AEMotion = {};
  const json = (v) => JSON.stringify(v).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const MAX_SAMPLES = 300000;
  const TOL = { position: 0.5, scale: 0.005, rotation: 0.5, opacity: 0.005 };
  A.tolerances = TOL;

  // Iterative vector RDP: every retained segment is tested against every source
  // sample, including visibility transitions and loop boundaries.
  A.reduce = function (values, tolerance) {
    if (!values.length) return [];
    if (values.every((v) => v.every((x, k) => Math.abs(x - values[0][k]) < 1e-9))) return [[0, ...values[0]]];
    const keep = new Set([0, values.length - 1]), stack = [[0, values.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let worst = tolerance, at = -1;
      for (let i = a + 1; i < b; i++) {
        const u = (i - a) / (b - a);
        const error = Math.max(...values[i].map((x, k) => Math.abs(x - (values[a][k] + (values[b][k] - values[a][k]) * u))));
        if (error > worst) { worst = error; at = i; }
      }
      if (at >= 0) { keep.add(at); stack.push([a, at], [at, b]); }
    }
    return [...keep].sort((a, b) => a - b).map((i) => [i, ...values[i].map((v) => Math.round(v * 1e5) / 1e5)]);
  };
  function selector(ranges, curves, frames, result) {
    const expr = 'var ranges=' + json(ranges) + ';\n' +
      // Only construct this character's curve on each selector evaluation.
      'function curve(i){switch(i){' + curves.map((c, i) => 'case ' + i + ':return ' + json(c) + ';').join('') + '}}\n' +
      'var slot=-1;for(var i=0;i<ranges.length;i++){if(textIndex>=ranges[i][0]&&textIndex<=ranges[i][1]){slot=i;break;}}\n' +
      'var q=Math.max(0,Math.min(100,effect("Motion progress (%)")(1)))*' + frames + '/100;\n' +
      'function sample(c,t){var lo=0,hi=c.length-1;if(t<=c[0][0])return c[0].slice(1);if(t>=c[hi][0])return c[hi].slice(1);\n' +
      'while(hi-lo>1){var m=Math.floor((lo+hi)/2);if(c[m][0]<=t)lo=m;else hi=m;}\n' +
      'var u=(t-c[lo][0])/(c[hi][0]-c[lo][0]),v=[];for(var k=1;k<c[lo].length;k++)v.push(c[lo][k]+(c[hi][k]-c[lo][k])*u);return v;}\n' +
      'var v=slot<0?null:sample(curve(slot),q);\nvar strength=effect("Motion strength (%)")(1)/100;\n' + result;
    if (expr.length > 60000) throw new Error('This preview motion exceeds the AE expression size limit. Shorten the export, lower the frame rate, or choose Native controls.');
    return expr;
  }
  A.build = async function (plan, scene, hooks = {}) {
    const s = TM.Scene.clone(scene);
    // Composited artwork is outside the text-motion contract; avoid expensive FX passes.
    s.post.grain = 0; s.post.vignette = 0;
    const r = X.makeRenderer(s, plan), f = r.frame;
    f.motionCapture = true;
    const layouts = scene.layers.map((l) => r._layout(l, plan.width, plan.height, TM.getPreset(l.preset)));
    const tracks = scene.layers.map(() => new Map());
    let frame = 0, current, counts, failure;
    r._renderLayer = function (l, index, t, w, h) {
      this._drawPreset(this._lctx, l, index, TM.getPreset(l.preset), t, w, h, 0, 1, null);
    };
    function capture(g, o = {}) {
      if (g.isSpace && o.ch == null) return;
      const glyph = Number.isInteger(g.i) ? g.i : g.vi === -1 && g.ch ? -1 : NaN;
      if (!Number.isInteger(glyph) || glyph < -1) throw new Error('This preset creates text without stable character identities. Use Native controls or PNG sequence.');
      const source = layouts[f.index].glyphs[glyph];
      if (glyph >= 0 && (!source || source.ch !== g.ch)) throw new Error(f.layer.name + ': this preset changes the text layout. Choose Native controls or PNG sequence to avoid losing characters.');
      const line = g.motionLine == null ? g.line || 0 : g.motionLine;
      const base = [f.index, line, glyph, o.motionSlot == null ? 0 : o.motionSlot].join(':');
      const occurrence = counts.get(base) || 0; counts.set(base, occurrence + 1);
      const group = String(o.motionSlot == null ? occurrence : o.motionSlot);
      const id = group + ':' + line + ':' + glyph;
      let tr = tracks[f.index].get(id);
      if (!tr) {
        tr = { id, group: +group, glyph, line, text: g.ch, samples: [], last: [f.cx + (g.cx || 0), f.cy + (g.cy || 0), 1, 1, 0, 0] };
        tr.samples = Array.from({ length: frame }, () => tr.last.slice());
        tracks[f.index].set(id, tr);
        if (tracks.reduce((n, map) => n + map.size, 0) * (plan.frames + 1) > MAX_SAMPLES) throw new Error('The preview has too much character motion to transfer at this length/frame rate. Shorten the export or choose Native controls.');
      }
      const size = o.size == null ? 1 : o.size / f.size;
      const sx = (o.sx != null ? o.sx : o.scale != null ? o.scale : 1) * size;
      const sy = (o.sy != null ? o.sy : o.scale != null ? o.scale : 1) * size;
      const rot = o.rot || 0, c = Math.cos(rot), sn = Math.sin(rot);
      let x = o.x == null ? f.cx + g.cx : o.x, y = o.y == null ? f.cy + g.cy : o.y;
      if (o.anchor === 'baseline') { x += sn * sy * f.layout.capH / 2; y -= c * sy * f.layout.capH / 2; }
      const xf = r._transformAt(f.layer, X.frameTime(plan, frame), plan.width, plan.height);
      let scale = 1, rotation = rot * 180 / Math.PI;
      if (xf) {
        const px = x; x = xf.a * px + xf.c * y + xf.e; y = xf.b * px + xf.d * y + xf.f;
        scale = Math.hypot(xf.a, xf.b); rotation += Math.atan2(xf.b, xf.a) * 180 / Math.PI;
      }
      const previous = tr.last[4];
      rotation = previous + ((rotation - previous + 180) % 360 + 360) % 360 - 180;
      const alpha = Math.max(0, Math.min(1, (o.alpha == null ? 1 : o.alpha) * f.alpha * (xf ? xf.opacity : 1)));
      const state = [x, y, sx * scale, sy * scale, rotation, alpha];
      if (!state.every(Number.isFinite)) throw new Error(f.layer.name + ': the preset produced invalid character motion and cannot be transferred to AE.');
      current[f.index].set(id, state);
    }
    const drawGlyph = f.drawGlyph, drawLine = f.drawLine;
    f.drawGlyph = function (g, o) { try { capture(g, o); } catch (e) { failure = e; } return drawGlyph.call(this, g, o); };
    f.drawLine = function (line, o = {}) {
      try {
        if (!Array.isArray(line.glyphs)) throw new Error(f.layer.name + ': this preset draws custom text runs which cannot be transferred. Choose Native controls or PNG sequence.');
        const cx = o.x == null ? f.cx + line.x + line.width / 2 : o.x;
        const cy = o.y == null ? f.cy + line.y - f.layout.capH / 2 : o.y;
        const sx = o.sx == null ? o.scale == null ? 1 : o.scale : o.sx, rot = o.rot || 0;
        for (const i of line.glyphs) {
          const g = f.layout.glyphs[i], dx = g.cx - line.x - line.width / 2;
          capture(g, Object.assign({}, o, { x: cx + Math.cos(rot) * dx * sx, y: cy + Math.sin(rot) * dx * sx }));
        }
      } catch (e) { failure = e; }
      return drawLine.call(this, line, o);
    };
    for (frame = 0; frame <= plan.frames; frame++) {
      X.throwIfAborted(hooks.signal);
      current = scene.layers.map(() => new Map()); counts = new Map();
      r.render(X.frameTime(plan, frame));
      if (failure) throw failure;
      if (r._warned) throw new Error('The preview renderer failed while transferring AE motion.');
      tracks.forEach((map, i) => map.forEach((tr, id) => {
        const v = current[i].get(id) || [tr.last[0], tr.last[1], tr.last[2], tr.last[3], tr.last[4], 0];
        tr.samples.push(v); tr.last = v;
      }));
      if (hooks.onProgress) hooks.onProgress({ phase: 'motion', fraction: (frame + 1) / (plan.frames + 1) * 0.94, done: frame + 1, total: plan.frames + 1 });
      await X.breathe();
    }
    const notes = [
      'Match preview transfers the renderer’s character position, scale, rotation, visibility and layer-transform timing into one text layer per Typoman layer. Two Motion progress keys drive the whole exported duration; retime or ease those keys in AE.',
      'Detailed character motion is stored in reduced selector expressions, not per-frame timeline keys. Edit Motion strength and offsets for global changes. Changing the copy or detailed path/preset motion requires re-export to preserve the layout; Native controls is the alternative for rebuilding motion in AE.',
      'Curves preserve sampled export frames within 0.5 px per position axis, 0.5° rotation, 0.5% scale and 0.5% opacity. AE font metrics, ligatures and complex scripts can differ; desktop appearance must be checked. Use the same installed fonts.',
      'This transfers text motion, not every canvas effect: clipping/mattes, custom shapes, particles, echoes, animated source characters/font axes, skew, gradients and composited effects are not reproduced. Use PNG sequence for exact pixels.'
    ];
    const layers = scene.layers.map((l, layerIndex) => {
      const layout = layouts[layerIndex], map = tracks[layerIndex], anchor = [l.anchor.x * plan.width, l.anchor.y * plan.height];
      if (layout.sizePx > 1296) throw new Error(l.name + ': this font size exceeds the AE text limit. Lower the export resolution to preserve preview motion.');
      if (l.visible !== false && l.text.trim() && !map.size) throw new Error(l.name + ': this preset produced no transferable text motion. Choose Native controls or PNG sequence.');
      const groups = [...new Set([...map.values()].map((tr) => tr.group))].sort((a, b) => a - b);
      if (!groups.length) groups.push(0);
      const separator = [...map.values()].find((tr) => tr.glyph === -1)?.text ||
        (l.preset === 'path-flow' && l.params.mode === 'fill' ? ({ space: ' ', dot: '•', dash: '—', slash: '/', star: '✦', none: '' }[l.params.separator] || '') : '');
      let text = '', slots = [];
      for (const group of groups) {
        for (const line of layout.lines) {
          if (text) text += ' ';
          for (const gi of line.glyphs) {
            const g = layout.glyphs[gi], start = text.length + 1; text += g.ch;
            if (!g.isSpace) slots.push({ start, end: text.length, id: group + ':' + g.line + ':' + g.i });
          }
          if (separator) { const start = text.length + 1; text += separator; slots.push({ start, end: text.length, id: group + ':' + line.index + ':-1' }); }
        }
      }
      const native = TM.text.layout({ text, family: l.font.family, weight: l.font.weight, sizePx: layout.sizePx, tracking: l.type.tracking, leading: l.type.leading, align: 'left', case: 'none', ligatures: l.type.ligatures });
      let offset = 1;
      const bases = [];
      native.glyphs.forEach((g) => {
        const start = offset, end = offset + g.ch.length - 1; offset = end + 1;
        for (const slot of slots) if (slot.start >= start && slot.start <= end) slot.base = [g.cx - native.lines[0].x, -native.capH / 2];
      });
      const raw = { position: [], scale: [], rotation: [], opacity: [] }, curves = { position: [], scale: [], rotation: [], opacity: [] };
      for (const slot of slots) {
        const tr = map.get(slot.id), base = slot.base || [0, 0];
        const samples = tr ? tr.samples : Array.from({ length: plan.frames + 1 }, () => [anchor[0] + base[0], anchor[1] + base[1], 1, 1, 0, 0]);
        bases.push({ id: slot.id, start: slot.start, end: slot.end, base });
        const values = {
          position: samples.map((v) => [v[0] - anchor[0] - base[0], v[1] - anchor[1] - base[1]]),
          scale: samples.map((v) => v.slice(2, 4)), rotation: samples.map((v) => [v[4]]), opacity: samples.map((v) => [v[5]])
        };
        for (const kind of Object.keys(curves)) { raw[kind].push(values[kind]); curves[kind].push(A.reduce(values[kind], TOL[kind])); }
      }
      const ranges = slots.map((slot) => [slot.start, slot.end]);
      // Keep selector Amount in its normal percentage range; the animator
      // property's magnitude carries the physical displacement/rotation.
      const positionSpan = [100, 100], scaleSpan = [1, 1];
      let rotationSpan = 100;
      for (const curve of curves.position) for (const point of curve) for (let k = 0; k < 2; k++) positionSpan[k] = Math.max(positionSpan[k], Math.abs(point[k + 1]));
      for (const curve of curves.scale) for (const point of curve) for (let k = 0; k < 2; k++) scaleSpan[k] = Math.max(scaleSpan[k], Math.abs(point[k + 1] - 1));
      for (const curve of curves.rotation) for (const point of curve) rotationSpan = Math.max(rotationSpan, Math.abs(point[1]));
      const animators = [];
      function add(kind, property, value, result) {
        // Keep each expression small without adding layers or timeline keys.
        // Each chunk affects disjoint characters; other characters receive zero.
        let start = 0;
        while (start < ranges.length) {
          let end = start, bytes = 2000;
          while (end < ranges.length && bytes + json(curves[kind][end]).length + 32 < 54000) {
            bytes += json(curves[kind][end]).length + 32; end++;
          }
          if (end === start) throw new Error('A character motion curve is too large for AE. Shorten the export or lower its frame rate.');
          animators.push({ name: 'Preview / ' + kind + (start ? ' (continued)' : ''), property, value,
            amount: selector(ranges.slice(start, end), curves[kind].slice(start, end), plan.frames, result) });
          start = end;
        }
      }
      // Scale, then rotate about the character centre, then translate. Applying
      // translation first would let subsequent animators distort the motion path.
      add('scale', 'ADBE Text Scale 3D', [100 + 100 * scaleSpan[0], 100 + 100 * scaleSpan[1], 100], 'v?[(v[0]-1)*100*strength/' + scaleSpan[0] + ',(v[1]-1)*100*strength/' + scaleSpan[1] + ',0]:[0,0,0];');
      add('rotation', 'ADBE Text Rotation', rotationSpan, 'var a=v?(v[0]*strength+effect("Rotation offset (deg)")(1))*100/' + rotationSpan + ':0;[a,a,a];');
      add('position', 'ADBE Text Position 3D', [...positionSpan, 0], 'v?[(v[0]*strength+effect("Horizontal offset (px)")(1))*100/' + positionSpan[0] + ',(v[1]*strength+effect("Vertical offset (px)")(1))*100/' + positionSpan[1] + ',0]:[0,0,0];');
      add('opacity', 'ADBE Text Opacity', 0, 'var a=v?(1-v[0])*100:0;[a,a,a];');
      // Expose test diagnostics without adding native keys or file sidecars.
      if (hooks.onMotionCurves) hooks.onMotionCurves({ layer: layerIndex, raw, curves, bases, anchor, frames: plan.frames });
      return { name: l.name, text: text.replace(/\n/g, '\r'), visible: l.visible !== false, preset: l.preset, font: l.font.family,
        size: Math.min(1296, layout.sizePx), tracking: l.type.tracking * 1000, leading: layout.lineGap, align: 'left',
        color: l.fill.type === 'palette' ? l.fill.palette[0] : l.fill.color, stroke: l.stroke.mode, strokeColor: l.stroke.color, strokeWidth: l.stroke.width * layout.sizePx,
        anchor, matchPreview: true, controls: { 'Motion progress (%)': 0, 'Motion strength (%)': 100, 'Horizontal offset (px)': 0, 'Vertical offset (px)': 0, 'Rotation offset (deg)': 0 },
        animators, path: null, transform: [], progressKeys: { times: [0, plan.duration], values: [0, 100] } };
    });
    return { layers, notes };
  };
})(window.TM);
