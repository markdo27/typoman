// Browser JSX export and native AE operations checked against an API double.
// This checks structure and expressions, not Adobe's desktop rendering.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadChromium, serve, openHarness } from './lib/harness.mjs';
const server = await serve();
const browser = await (await loadChromium()).launch();
try {
  const page = await openHarness(await browser.newContext(), server);
  const exported = await page.evaluate(async () => {
    const results = {};
    async function exportScene(id, preset, patch = {}, opts = {}) {
      const scene = TM.Scene.defaults();
      scene.name = 'Editable "type"\n</script>\\test';
      scene.duration = 2;
      Object.assign(scene.layers[0], { preset, text: 'TYPE IN MOTION', name: id }, patch);
      const out = await TM.Export.run(scene, { format: 'ae', aeMode: 'native', fps: 24, resolution: 720, ...opts });
      results[id] = { source: await out.blob.text(), name: out.name, info: out.info };
    }
    await exportScene('wave', 'wave', { params: { weightWave: false } });
    await exportScene('path', 'path-flow');
    await exportScene('path-still', 'path-flow', { params: { mode: 'still' } });
    await exportScene('path-travel', 'path-flow', { params: { mode: 'travel', speed: -1 } });
    await exportScene('rise', 'rise', { stroke: { mode: 'outline' } });
    await exportScene('typewriter', 'typewriter');
    await exportScene('unsupported', 'particles');
    await exportScene('transform', 'wave', { transform: { enabled: true, keys: [
      { t: 0, x: 0, y: 0, scale: 1, rot: 0, opacity: 0.5, ease: 'linear' },
      { t: 1, x: 0.2, y: 0.1, scale: 1.5, rot: 30, opacity: 1, ease: 'linear' }
    ] } });
    await exportScene('boundary', 'wave', { transform: { enabled: true, keys: [
      { t: 0.2, x: 0, y: 0, scale: 1, rot: 0, opacity: 1, ease: 'linear' },
      { t: 0.8, x: 0.2, y: 0.1, scale: 1.5, rot: 30, opacity: 1, ease: 'linear' }
    ] } });
    await exportScene('morph', 'path-flow', { pathMorph: { enabled: true, target: TM.Path.preset('circle'), mode: 'pingpong' } });
    await exportScene('long', 'wave', { text: 'A longer line '.repeat(15) }, { fps: 60, loops: 10 });
    await exportScene('timing', 'wave', { time: { delay: 0.5, cycles: 2, mode: 'once' } }, { fps: 24 });
    const multi = TM.Scene.defaults();
    multi.layers = [multi.layers[0], { name: 'Second', preset: 'rise', text: 'SECOND' }, { name: 'Hidden', visible: false, text: 'HIDDEN' }];
    const out = await TM.Export.run(multi, { format: 'ae', aeMode: 'native', resolution: 720 });
    results.multi = { source: await out.blob.text(), info: out.info };
    results.matched = {};
    for (const [id, preset, patch] of [
      ['path', 'path-flow', {}],
      ['multiline', 'path-flow', { text: 'TYPE IN\nMOTION' }],
      ['timed', 'path-flow', { time: { delay: 0.17, cycles: 3, mode: 'once' } }],
      ['morph', 'path-flow', { params: { wave: 0.3 }, pathMorph: { enabled: true, target: TM.Path.preset('circle') } }],
      ['bounce', 'wave', { params: { mode: 'bounce', weightWave: false, squash: 1.2, scale: 0.3 } }],
      ['rise', 'rise', { params: { order: 'words', jitter: 0.4, easeIn: 'springSnappy', easeOut: 'inQuart' } }],
      ['assemble', 'assemble', {}],
      ['typewriter', 'typewriter', {}],
      ['transform', 'wave', { params: { weightWave: false }, transform: { enabled: true, keys: [
        { t: 0, x: 0, y: 0, scale: 1, rot: 0, opacity: 1, ease: [0.2, 0.1, 0.4, 1] },
        { t: 1, x: 0.1, y: 0.15, scale: 1.4, rot: 25, opacity: 0.5, ease: 'linear' }
      ] } }]
    ]) {
      let scene = TM.Scene.defaults(); scene.duration = 1;
      Object.assign(scene.layers[0], { name: id, text: 'TYPE IN MOTION', preset }, patch);
      scene = TM.Scene.normalize(scene);
      let diagnostics;
      const opts = { format: 'ae', resolution: 720, fps: 24 };
      const result = await TM.Export.run(scene, opts, { onMotionCurves: (d) => { diagnostics = d; } });
      // Independent reference: inspect the canvas matrices left by the real drawGlyph,
      // rather than translating its options with the export sampler's implementation.
      const plan = TM.Export.plan(scene, opts), renderer = TM.Export.makeRenderer(scene, plan);
      renderer.frame.motionCapture = true;
      const draw = renderer.frame.drawGlyph, reference = [];
      let frameIndex;
      renderer.frame.drawGlyph = function (g, o = {}) {
        draw.call(this, g, o);
        const alpha = (o.alpha == null ? 1 : o.alpha) * this.alpha;
        if (g.isSpace || alpha <= 0.002) return;
        const m = this.ctx.getTransform();
        let x = m.e, y = m.f;
        if (o.anchor === 'baseline') { x -= m.c * this.layout.capH / 2; y -= m.d * this.layout.capH / 2; }
        const xf = renderer._transformAt(this.layer, TM.Export.frameTime(plan, frameIndex), plan.width, plan.height);
        if (xf) { const px = x; x = xf.a * px + xf.c * y + xf.e; y = xf.b * px + xf.d * y + xf.f; }
        reference.push({ frame: frameIndex, id: (o.motionSlot == null ? 0 : o.motionSlot) + ':' + (g.motionLine == null ? g.line || 0 : g.motionLine) + ':' + g.i,
          position: [x, y], opacity: alpha * (xf ? xf.opacity : 1),
          rotation: (o.rot || 0) * 180 / Math.PI + (xf ? Math.atan2(xf.b, xf.a) * 180 / Math.PI : 0),
          scale: [Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)].map((v) => v * (xf ? Math.hypot(xf.a, xf.b) : 1)) });
      };
      for (frameIndex = 0; frameIndex <= plan.frames; frameIndex++) renderer.render(TM.Export.frameTime(plan, frameIndex));
      results.matched[id] = { source: await result.blob.text(), info: result.info, diagnostics, reference };
    }
    const cancel = new AbortController(); cancel.abort();
    try { await TM.Export.run(multi, { format: 'ae' }, { signal: cancel.signal }); } catch (e) { results.abort = e.name; }
    return results;
  });
  assert.equal(exported.abort, 'AbortError');
  assert.equal(exported.wave.info.engine, 'ae-native');
  assert.match(exported.wave.name, /\.jsx$/);

  function importScript(source, { cancelSave = false, failText = false } = {}) {
    const layers = [], allProperties = [], saves = [], alerts = [];
    let undo = 0;
    class TextDocument {
      constructor(text, layer) { this.text = text; this.layer = layer; this.style = {}; }
      toString() { return this.text; }
    }
    for (const name of ['font', 'fontSize', 'justification', 'tracking', 'autoLeading', 'leading', 'applyFill', 'fillColor', 'applyStroke', 'strokeColor', 'strokeWidth']) {
      Object.defineProperty(TextDocument.prototype, name, {
        get() { return this.style[name]; },
        set(value) {
          assert.ok(this.layer, 'style setters require layer-backed Source Text');
          this.style[name] = value;
          if (name === 'fillColor') this.style.applyFill = true;
          if (name === 'strokeColor') this.style.applyStroke = true;
        },
      });
    }
    class Property {
      constructor(name, layer, initial) { this.name = name; this.layer = layer; this.currentValue = initial; this.keys = []; this.expression = ''; allProperties.push(this); }
      get value() {
        if (this.name !== 'ADBE Text Document') return this.currentValue;
        if (failText) throw new Error('Test Source Text read failure');
        const doc = new TextDocument(this.layer.text, this.layer);
        if (this.currentValue) doc.style = { ...this.currentValue.style };
        return doc;
      }
      setValue(value) {
        if (this.name === 'ADBE Text Document') { assert.equal(value.layer, this.layer); this.layer.text = value.text; }
        this.currentValue = value;
      }
      get numKeys() { return this.keys.length; }
      setValuesAtTimes(times, values) {
        assert.equal(times.length, values.length);
        assert.ok(times.every((t, i) => Number.isFinite(t) && (!i || t > times[i - 1])));
        assert.ok(values.every((v) => v !== undefined));
        this.keys = times.map((t, i) => [t, values[i]]);
      }
      setInterpolationTypeAtKey(k, before, after) { assert.ok(k > 0 && k <= this.numKeys); assert.equal(before, 'LINEAR'); assert.equal(after, 'LINEAR'); }
    }
    class Group {
      constructor(layer) { this.layer = layer; this.items = new Map(); }
      property(name) {
        if (typeof name === 'number') return [...this.items.values()][name - 1];
        assert.ok(this.items.has(name), 'known AE property: ' + name);
        return this.items.get(name);
      }
      field(name, value = 0) { const p = new Property(name, this.layer, value); this.items.set(name, p); return p; }
      group(name, g = new Group(this.layer)) { this.items.set(name, g); return g; }
    }
    class IndexedGroup extends Group {
      constructor(layer, kind) { super(layer); this.kind = kind; }
      addProperty(name) {
        const g = new Group(this.layer);
        if (this.kind === 'effects') {
          assert.equal(name, 'ADBE Slider Control'); g.field('ADBE Slider Control-0001');
        } else if (this.kind === 'animators') {
          assert.equal(name, 'ADBE Text Animator');
          g.group('ADBE Text Animator Properties', new IndexedGroup(this.layer, 'attributes'));
          g.group('ADBE Text Selectors', new IndexedGroup(this.layer, 'selectors'));
        } else if (this.kind === 'attributes') {
          assert.ok(['ADBE Text Position 3D', 'ADBE Text Scale 3D', 'ADBE Text Rotation', 'ADBE Text Opacity'].includes(name));
          const p = new Property(name, this.layer); this.items.set(name, p); return p;
        } else if (this.kind === 'selectors') {
          assert.equal(name, 'ADBE Text Expressible Selector'); g.field('ADBE Text Expressible Amount'); g.field('ADBE Text Range Type2');
        } else if (this.kind === 'masks') {
          assert.equal(name, 'ADBE Mask Atom'); g.field('ADBE Mask Shape');
        } else assert.fail('Unknown indexed group');
        this.items.set(this.items.size + 1, g); return g;
      }
    }
    class Layer extends Group {
      constructor(kind, text = '') {
        super(); this.layer = this; this.kind = kind; this.text = text; this.source = {}; this.enabled = true;
        const tx = this.group('ADBE Text Properties');
        tx.field('ADBE Text Document'); tx.group('ADBE Text Animators', new IndexedGroup(this, 'animators'));
        tx.group('ADBE Text More Options').field('ADBE Text Anchor Point Align');
        const path = tx.group('ADBE Text Path Options');
        for (const name of ['ADBE Text Path', 'ADBE Text Perpendicular To Path', 'ADBE Text First Margin']) path.field(name);
        const transform = this.group('ADBE Transform Group');
        for (const name of ['ADBE Position', 'ADBE Anchor Point', 'ADBE Scale', 'ADBE Rotate Z', 'ADBE Opacity']) transform.field(name);
        this.group('ADBE Effect Parade', new IndexedGroup(this, 'effects'));
        this.group('ADBE Mask Parade', new IndexedGroup(this, 'masks'));
        layers.push(this);
      }
    }
    const comp = { layers: {
      addText: (text) => new Layer('text', text), addSolid: () => new Layer('solid'),
      addNull: () => assert.fail('No parent nulls or per-letter helper layers')
    }, openInViewer() {} };
    const project = { items: { addFolder: () => ({}), addComp(name, w, h, aspect, duration, fps) {
      assert.equal(w, 1280); assert.equal(h, 720); assert.ok(duration > 0); assert.ok([24, 60].includes(fps)); return comp;
    } }, save(file) { saves.push(file.fsName); } };
    function File(name) { this.fsName = name; this.name = name.split('/').pop(); }
    File.saveDialog = () => cancelSave ? null : new File('/tmp/type');
    const context = { app: { project, beginUndoGroup() { undo++; }, endUndoGroup() { undo--; } },
      File, TextDocument, Shape: function () {}, MaskMode: { NONE: 'NONE' },
      KeyframeInterpolationType: { LINEAR: 'LINEAR' }, ParagraphJustification: { LEFT_JUSTIFY: 'left', RIGHT_JUSTIFY: 'right', CENTER_JUSTIFY: 'center' },
      alert: (s) => alerts.push(s) };
    let error;
    try { vm.runInNewContext(source, context); } catch (e) { error = e; }
    assert.equal(undo, 0, 'all imports close their undo group');
    if (!failText) assert.ifError(error);
    const text = layers.filter((l) => l.kind === 'text');
    return { text, allProperties, saves, alerts, error, comp };
  }
  function effectProperty(layer, name) {
    const effect = [...layer.property('ADBE Effect Parade').items.values()].find((e) => e.name === name);
    assert.ok(effect, 'named motion control: ' + name);
    return effect.property('ADBE Slider Control-0001');
  }
  function evaluate(property, layer, time = 0, textIndex = 1, textTotal = 13) {
    return vm.runInNewContext(property.expression, {
      time, textIndex, textTotal, value: property.value,
      effect: (name) => () => effectProperty(layer, name).value,
      sourceRectAtTime: () => ({ left: -100, top: -40, width: 200, height: 50 }),
      loopOut: () => property.keys.at(-1)?.[1]
    });
  }
  for (const id of ['wave', 'path', 'path-still', 'path-travel', 'rise', 'typewriter', 'unsupported', 'long', 'timing']) {
    const result = importScript(exported[id].source);
    assert.equal(result.text.length, 1, id + ': one text layer regardless of character count');
    assert.equal(result.text[0].text.includes('TYPE IN MOTION') || id === 'long', true);
    assert.equal(result.allProperties.reduce((n, p) => n + p.numKeys, 0), 0, id + ': no per-frame keys');
    assert.deepEqual(result.saves, ['/tmp/type.aep']);
    // Execute every native expression as well as the JSX that assigns it.
    for (const p of result.allProperties.filter((p) => p.expression)) {
      for (const time of [0, 0.2, 0.8, 1.4, 2.3]) {
        const value = evaluate(p, result.text[0], time, 3, 13);
        if (typeof value === 'number') assert.ok(Number.isFinite(value));
        if (Array.isArray(value)) assert.ok(value.every(Number.isFinite));
        if (p.name === 'ADBE Text Expressible Amount') assert.equal(value.length, 3, 'selector amount has three dimensions');
      }
    }
  }
  const wave = importScript(exported.wave.source).text[0];
  const wavePos = [...wave.property('ADBE Text Properties').property('ADBE Text Animators').items.values()][0];
  const waveProperty = wavePos.property('ADBE Text Animator Properties').property('ADBE Text Position 3D');
  const before = evaluate(waveProperty, wave);
  effectProperty(wave, 'Wave height (px)').setValue(200);
  assert.notEqual(evaluate(waveProperty, wave)[1], before[1], 'motion changes by editing a control, without rebaking');
  const selector = wavePos.property('ADBE Text Selectors').property(1).property('ADBE Text Expressible Amount');
  assert.notDeepEqual(evaluate(selector, wave, 0.2, 1), evaluate(selector, wave, 0.7, 1), 'wave animates');
  assert.notDeepEqual(evaluate(selector, wave, 0.2, 1), evaluate(selector, wave, 0.2, 5), 'characters have distinct phases inside one text layer');

  const pathResult = importScript(exported.path.source), path = pathResult.text[0];
  const mask = path.property('ADBE Mask Parade').property(1);
  assert.equal(mask.maskMode, 'NONE');
  assert.ok(mask.property('ADBE Mask Shape').value.vertices.length > 1, 'editable native path anchors');
  assert.equal(path.property('ADBE Text Properties').property('ADBE Text Path Options').property('ADBE Text Path').value, 1);
  const sourceText = path.property('ADBE Text Properties').property('ADBE Text Document');
  effectProperty(path, 'Repeats').setValue(2);
  const doc = sourceText.value; doc.text = 'EDIT ME'; sourceText.setValue(doc);
  const repeated = evaluate(sourceText, path);
  assert.equal((repeated.match(/EDIT ME/g) || []).length, 2, 'source text remains editable with repeats');
  const margin = path.property('ADBE Text Properties').property('ADBE Text Path Options').property('ADBE Text First Margin');
  const startMargin = evaluate(margin, path, 0.2);
  effectProperty(path, 'Scroll cycles').setValue(0);
  assert.notEqual(evaluate(margin, path, 0.2), startMargin, 'native path speed is editable');
  const reverseTravel = importScript(exported['path-travel'].source).text[0];
  const reverseMargin = reverseTravel.property('ADBE Text Properties').property('ADBE Text Path Options').property('ADBE Text First Margin');
  assert.ok(evaluate(reverseMargin, reverseTravel, 0.2) > evaluate(reverseMargin, reverseTravel, 0.7), 'negative travel moves from the path end towards the start');

  const rise = importScript(exported.rise.source).text[0];
  const riseDoc = rise.property('ADBE Text Properties').property('ADBE Text Document').value;
  assert.equal(riseDoc.applyFill, false); assert.equal(riseDoc.applyStroke, true, 'outline mode survives AE colour setter side effects');
  const unsupported = importScript(exported.unsupported.source);
  assert.match(unsupported.comp.comment, /no native AE motion adapter/);
  assert.equal(unsupported.text[0].property('ADBE Text Properties').property('ADBE Text Animators').items.size, 0);

  const tr = importScript(exported.transform.source);
  assert.equal(tr.text.length, 1);
  assert.deepEqual(tr.allProperties.filter((p) => p.numKeys).map((p) => p.numKeys), [2, 2, 2, 2], 'only the two authored poses are keyed');
  const boundary = importScript(exported.boundary.source);
  assert.deepEqual(boundary.allProperties.filter((p) => p.numKeys).map((p) => p.numKeys), [4, 4, 4, 4], 'looping authored poses add only two boundary holds');
  const morph = importScript(exported.morph.source);
  const shapeKeys = morph.text[0].property('ADBE Mask Parade').property(1).property('ADBE Mask Shape').keys;
  assert.equal(shapeKeys.length, 3, 'A→B→A uses three mask poses, not per-frame shape keys');
  assert.ok(shapeKeys.every((k) => k[1].vertices.length === shapeKeys[0][1].vertices.length), 'native morph topology is consistent');
  const multi = importScript(exported.multi.source);
  assert.equal(multi.text.length, 3, 'one text layer per original studio layer');
  assert.equal(multi.text[2].enabled, false, 'hidden source layers stay hidden');
  const timing = importScript(exported.timing.source).text[0];
  assert.equal(effectProperty(timing, 'Cycle (s)').value, 1);
  assert.equal(effectProperty(timing, 'Delay (s)').value, 0.5);
  assert.equal(effectProperty(timing, 'Loop').value, 0);
  assert.equal(importScript(exported.wave.source, { cancelSave: true }).saves.length, 0);
  const failed = importScript(exported.wave.source, { failText: true });
  assert.match(failed.error.message, /Test Source Text read failure/);
  assert.match(failed.alerts.at(-1), /while styling wave/);
  assert.equal(failed.saves.length, 0);
  const errors = { position: 0, scale: 0, rotation: 0, opacity: 0 };
  for (const [id, out] of Object.entries(exported.matched)) {
    assert.equal(out.info.engine, 'ae-preview', 'Match preview is the default transfer mode');
    const result = importScript(out.source);
    assert.equal(result.text.length, 1, id + ': preview motion stays in one text layer');
    assert.deepEqual(result.allProperties.filter((p) => p.numKeys).map((p) => p.numKeys), [2], id + ': exactly two shared progress keys');
    const layer = result.text[0], progress = effectProperty(layer, 'Motion progress (%)');
    const animators = [...layer.property('ADBE Text Properties').property('ADBE Text Animators').items.values()];
    const amounts = (property, index) => animators.filter((a) => a.property('ADBE Text Animator Properties').items.has(property))
      .map((a) => {
        const amount = evaluate(a.property('ADBE Text Selectors').property(1).property('ADBE Text Expressible Amount'), layer, 0, index);
        assert.ok(amount.every((v) => Math.abs(v) <= 100.001), 'selector amounts stay in the conventional percentage range');
        const target = a.property('ADBE Text Animator Properties').property(property).value;
        if (property === 'ADBE Text Position 3D') return amount.map((v, i) => v * target[i] / 100);
        if (property === 'ADBE Text Scale 3D') return amount.map((v, i) => v * (target[i] / 100 - 1));
        if (property === 'ADBE Text Rotation') return amount.map((v) => v * target / 100);
        return amount;
      });
    assert.ok(out.reference.length > 0, id + ': reference renderer actually drew text');
    for (const ref of out.reference) {
      const slot = out.diagnostics.bases.find((b) => b.id === ref.id);
      assert.ok(slot, id + ': stable glyph / repeat identity ' + ref.id);
      progress.setValue(ref.frame / out.diagnostics.frames * 100);
      const pos = amounts('ADBE Text Position 3D', slot.start).reduce((sum, v) => sum.map((x, i) => x + v[i]), [0, 0, 0]);
      const scale = amounts('ADBE Text Scale 3D', slot.start).reduce((sum, v) => sum.map((x, i) => x * (1 + v[i] / 100)), [1, 1, 1]);
      const rotation = amounts('ADBE Text Rotation', slot.start).reduce((sum, v) => sum + v[0], 0);
      const opacity = amounts('ADBE Text Opacity', slot.start).reduce((sum, v) => sum * (1 - v[0] / 100), 1);
      const target = pos.slice(0, 2).map((v, i) => v + slot.base[i] + out.diagnostics.anchor[i]);
      errors.position = Math.max(errors.position, ...target.map((v, i) => Math.abs(v - ref.position[i])));
      errors.scale = Math.max(errors.scale, ...scale.slice(0, 2).map((v, i) => Math.abs(v - ref.scale[i])));
      errors.rotation = Math.max(errors.rotation, Math.abs(((rotation - ref.rotation + 180) % 360 + 360) % 360 - 180));
      errors.opacity = Math.max(errors.opacity, Math.abs(opacity - ref.opacity));
    }
  }
  assert.ok(errors.position <= 0.501, 'preview position agrees with canvas transforms: ' + errors.position);
  assert.ok(errors.scale <= 0.00501, 'preview scale agrees with canvas transforms: ' + errors.scale);
  assert.ok(errors.rotation <= 0.501, 'preview rotation agrees with canvas transforms: ' + errors.rotation);
  assert.ok(errors.opacity <= 0.00501, 'preview visibility agrees with canvas transforms: ' + errors.opacity);
  console.log('PASS: preview motion agrees with renderer at all checked export frames:', errors);
  console.log('PASS: 13 native exports; one text layer per studio layer; no per-frame keys; editable paths, selectors, controls and source text; sparse authored keys; timing, fallback notes, save/cancel, abort and error cleanup.');
} finally { await browser.close(); await server.close(); }
