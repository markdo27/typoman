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
    const cancelled = new AbortController(); cancelled.abort();
    let abort;
    try { await TM.Export.run(scene, { format: 'ae' }, { signal: cancelled.signal }); } catch (e) { abort = e.name; }
    return { source: await result.blob.text(), name: result.name, info: result.info, abort };
  });
  assert.equal(out.abort, 'AbortError');
  assert.match(out.name, /\.jsx$/);
  assert.equal(out.info.frames, 24);
  assert.equal(out.info.engine, 'ae-keyframes');
  const layers = [], saves = [], alerts = [];
  let undo = 0;
  class Property {
    constructor(name) { this.name = name; this.numKeys = 0; this.keys = []; }
    setValue(value) { this.value = value; }
    setValuesAtTimes(times, values) {
      assert.equal(times.length, values.length);
      assert.ok(times.every((t) => Number.isFinite(t) && t >= 0 && t < 1));
      assert.ok(values.every((v) => v !== undefined));
      // AE replaces keys at existing times.
      const map = new Map(this.keys); times.forEach((t, i) => map.set(t, values[i]));
      this.keys = [...map].sort((a, b) => a[0] - b[0]); this.numKeys = this.keys.length;
    }
    setInterpolationTypeAtKey(k, before, after) { assert.ok(k > 0 && k <= this.numKeys); assert.equal(before, 'HOLD'); assert.equal(after, 'HOLD'); }
  }
  class Group {
    constructor() { this.props = new Map(); }
    property(name) {
      if (!this.props.has(name)) this.props.set(name, /Group|Properties/.test(name) ? new Group() : new Property(name));
      return this.props.get(name);
    }
  }
  class Layer extends Group {
    constructor(kind) { super(); this.kind = kind; this.source = {}; layers.push(this); }
    setParentWithJump(parent) { this.parent = parent; }
  }
  const comp = { layers: {
    addText: () => new Layer('text'), addNull: () => new Layer('null'), addSolid: () => new Layer('solid')
  }, openInViewer() {} };
  const project = { items: { addFolder: () => ({}), addComp(name, w, h, aspect, duration, fps) {
    assert.equal(w, 1280); assert.equal(h, 720); assert.equal(duration, 1); assert.equal(fps, 24); return comp;
  } }, save(file) { saves.push(file.fsName); } };
  function File(name) { this.fsName = name; this.name = name.split('/').pop(); }
  File.saveDialog = () => new File('/tmp/type');
  const context = { app: { project, beginUndoGroup() { undo++; }, endUndoGroup() { undo--; } },
    File, TextDocument: function (text) { this.text = text; },
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
  }
  const parent = text[0].parent.property('ADBE Transform Group');
  assert.ok(parent.property('ADBE Position').keys.at(-1)[1][0] > 0, 'source layer transform is baked');
  assert.match(comp.comment, /not reproduced/);
  const sourceBefore = out.source;
  saves.length = 0; File.saveDialog = () => null;
  vm.runInNewContext(sourceBefore, context);
  assert.equal(saves.length, 0, 'save cancellation does not write a file');
  assert.equal(undo, 0);
  console.log('PASS: browser JSX export, editable glyphs, motion and layer keys, opacity, source text, save/cancel, abort and limitations.');
} finally { await browser.close(); await server.close(); }
