// Browser export plus execution of the generated ExtendScript against a strict AE API double.
// Actual Adobe rendering still requires validation in desktop After Effects.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadChromium, serve, openHarness } from './lib/harness.mjs';
const server = await serve();
const browser = await (await loadChromium()).launch();
try {
  const page = await openHarness(await browser.newContext(), server);
  const out = await page.evaluate(async () => {
    const scene = TM.Scene.defaults();
    scene.name = 'Editable "type"\n</script>\\test';
    scene.duration = 1;
    scene.layers[0].text = 'Hi';
    scene.layers[0].preset = 'wave';
    scene.layers[0].params = TM.presetDefaults('wave');
    scene.layers[0].transform = { enabled: true, keys: [{ t: 0, x: 0, y: 0, scale: 1, rot: 0, opacity: 0.5, ease: 'linear' }, { t: 1, x: 0.2, y: 0.1, scale: 1.5, rot: 30, opacity: 1, ease: 'linear' }] };
    const result = await TM.Export.run(scene, { format: 'ae', fps: 24, resolution: 720 });
    scene.layers[0].preset = 'scramble';
    scene.layers[0].params = TM.presetDefaults('scramble');
    scene.layers[0].stroke.mode = 'outline';
    const changingText = await TM.Export.run(scene, { format: 'ae', fps: 24, resolution: 720 });
    const cancelled = new AbortController(); cancelled.abort();
    let abort;
    try { await TM.Export.run(scene, { format: 'ae' }, { signal: cancelled.signal }); } catch (e) { abort = e.name; }
    return { source: await result.blob.text(), changingText: await changingText.blob.text(), name: result.name, info: result.info, abort };
  });
  assert.equal(out.abort, 'AbortError');
  assert.match(out.name, /\.jsx$/);
  assert.equal(out.info.frames, 24);
  assert.equal(out.info.engine, 'ae-keyframes');
  const layers = [], saves = [], alerts = [];
  let undo = 0, readTextError = false;
  class TextDocument {
    constructor(text, layer = null) {
      this.text = text;
      this.layer = layer;
      this.style = {};
    }
  }
  // AE requires a layer-backed Source Text value for styling. A standalone
  // new TextDocument(text) is not a substitute for textProperty.value.
  for (const name of ['font', 'fontSize', 'justification', 'tracking', 'applyFill', 'fillColor', 'applyStroke', 'strokeColor', 'strokeWidth']) {
    Object.defineProperty(TextDocument.prototype, name, {
      get() { return this.style[name]; },
      set(value) {
        if (!this.layer) throw new Error('After Effects error: Unable to set value as it is not associated with a layer.');
        this.style[name] = value;
        // AE colour setters also enable their paint, even for outline/fill-only text.
        if (name === 'fillColor') this.style.applyFill = true;
        if (name === 'strokeColor') this.style.applyStroke = true;
      },
    });
  }
  class Property {
    constructor(name, layer) { this.name = name; this.layer = layer; this.numKeys = 0; this.keys = []; }
    get value() {
      if (this.name === 'ADBE Text Document') {
        if (readTextError) throw new Error('Test Source Text read failure');
        return new TextDocument(this.layer.text, this.layer);
      }
      return this.currentValue;
    }
    set value(v) { this.currentValue = v; }
    setValue(value) { this.value = value; }
    setValuesAtTimes(times, values) {
      assert.equal(times.length, values.length);
      assert.ok(times.every((t) => Number.isFinite(t) && t >= 0 && t < 1));
      assert.ok(values.every((v) => v !== undefined));
      if (this.name === 'ADBE Text Document') {
        assert.ok(values.every((v) => v.layer === this.layer), 'source text retains its layer association');
        assert.equal(new Set(values).size, values.length, 'each source-text key gets an independent document');
      }
      // AE replaces keys at existing times.
      const map = new Map(this.keys); times.forEach((t, i) => map.set(t, values[i]));
      this.keys = [...map].sort((a, b) => a[0] - b[0]); this.numKeys = this.keys.length;
    }
    setInterpolationTypeAtKey(k, before, after) { assert.ok(k > 0 && k <= this.numKeys); assert.equal(before, 'HOLD'); assert.equal(after, 'HOLD'); }
  }
  class Group {
    constructor(layer) { this.props = new Map(); this.layer = layer; }
    property(name) {
      if (!this.props.has(name)) this.props.set(name, /Group|Properties/.test(name) ? new Group(this.layer) : new Property(name, this.layer));
      return this.props.get(name);
    }
  }
  class Layer extends Group {
    constructor(kind, text) { super(); this.layer = this; this.text = text; this.kind = kind; this.source = {}; layers.push(this); }
    setParentWithJump(parent) { this.parent = parent; }
  }
  const comp = { layers: {
    addText: (text) => new Layer('text', text), addNull: () => new Layer('null'), addSolid: () => new Layer('solid')
  }, openInViewer() {} };
  const project = { items: { addFolder: () => ({}), addComp(name, w, h, aspect, duration, fps) {
    assert.equal(w, 1280); assert.equal(h, 720); assert.equal(duration, 1); assert.equal(fps, 24); return comp;
  } }, save(file) { saves.push(file.fsName); } };
  function File(name) { this.fsName = name; this.name = name.split('/').pop(); }
  File.saveDialog = () => new File('/tmp/type');
  const context = { app: { project, beginUndoGroup() { undo++; }, endUndoGroup() { undo--; } },
    File, TextDocument,
    KeyframeInterpolationType: { HOLD: 'HOLD' }, ParagraphJustification: { LEFT_JUSTIFY: 'left' }, alert: (s) => alerts.push(s) };
  vm.runInNewContext(out.source, context);
  assert.equal(undo, 0);
  assert.deepEqual(saves, ['/tmp/type.aep']);
  const text = layers.filter((l) => l.kind === 'text');
  assert.equal(text.length, 2, 'one editable text layer per glyph');
  for (const layer of text) {
    assert.equal(layer.parent.kind, 'null');
    const transform = layer.property('ADBE Transform Group');
    const pos = transform.property('ADBE Position').keys;
    assert.equal(pos.length, 24);
    assert.ok(pos.some((p) => p[1][1] !== pos[0][1][1]), 'wave movement is baked');
    const opacity = transform.property('ADBE Opacity').keys;
    assert.ok(opacity[0][1] <= 50, 'layer transform opacity is applied to glyphs');
    const docs = layer.property('ADBE Text Properties').property('ADBE Text Document').keys;
    assert.equal(docs.length, 24);
    assert.equal(docs[0][1].applyStroke, false);
    assert.equal(docs[0][1].applyFill, true);
  }
  const parent = text[0].parent.property('ADBE Transform Group');
  assert.ok(parent.property('ADBE Position').keys.at(-1)[1][0] > 0, 'source layer transform is baked');
  assert.match(comp.comment, /not reproduced/);
  const sourceBefore = out.source;
  saves.length = 0; File.saveDialog = () => null;
  vm.runInNewContext(sourceBefore, context);
  assert.equal(saves.length, 0, 'save cancellation does not write a file');
  assert.equal(undo, 0);
  const beforeChanging = layers.length;
  vm.runInNewContext(out.changingText, context);
  const changingDocs = layers.slice(beforeChanging).filter((l) => l.kind === 'text')
    .flatMap((l) => l.property('ADBE Text Properties').property('ADBE Text Document').keys.map((k) => k[1]));
  assert.ok(new Set(changingDocs.map((d) => d.text)).size > 2, 'animated characters survive independent Source Text snapshots');
  assert.ok(changingDocs.every((d) => d.applyStroke && !d.applyFill), 'outline text stays outline-only after colour assignment');
  readTextError = true;
  assert.throws(() => vm.runInNewContext(out.source, context), /Test Source Text read failure/);
  assert.match(alerts.at(-1), /while styling .+ at frame 0: Error: Test Source Text read failure/);
  assert.equal(saves.length, 0, 'a failed import does not save a project');
  assert.equal(undo, 0, 'failed imports close the undo group');
  console.log('PASS: browser JSX export, layer-backed text styling, independent animated text keys, fill/outline, motion, save/cancel, abort and failure diagnostics.');
} finally { await browser.close(); await server.close(); }
