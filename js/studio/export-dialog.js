/* TYPOMAN studio — Export dialog: TM.Studio.openExport(store), plus the shared modal helper.
 *
 * Format (MP4 / WebM / GIF / PNG / PNG sequence), resolution from the scene aspect, frame rate,
 * length in loops or seconds, quality, transparency, the codec the browser will really use and
 * what plays it, a live preview, progress with ETA and cancel, and the download when done.
 * All rendering goes through TM.Export.run (offline, frame-accurate).
 */
(function (TM) {
  'use strict';
  const Studio = (TM.Studio = TM.Studio || {});
  const X = TM.Export;
  const h = Studio.h;
  const SVGNS = 'http://www.w3.org/2000/svg';

  // The dialog stylesheet lives next to the studio CSS; index.html is not ours to edit.
  (function injectCSS() {
    if (document.querySelector('link[data-tm-dialogs]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = ((window.TM_MANIFEST && window.TM_MANIFEST.base) || './') + 'css/dialogs.css';
    link.setAttribute('data-tm-dialogs', '');
    document.head.appendChild(link);
  })();

  function svg(paths) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    paths.forEach((d) => { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); s.append(p); });
    return s;
  }
  Studio.svg = svg;

  // ───────────────────────────── modal helper ─────────────────────────────
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
  /**
   * Accessible modal on a native <dialog>: inert background, Esc and backdrop close, Tab trap,
   * focus restored to the opener. onRequestClose() may return false to keep it open.
   */
  function modal({ id, title, cls, onRequestClose, onClose }) {
    const titleId = id + '-title';
    const sub = h('p', { class: 'tm-sub' });
    const close = h('button', { type: 'button', class: 'tm-x', 'aria-label': 'Close' }, svg(['M6 6l12 12', 'M18 6 6 18']));
    const head = h('header', { class: 'tm-dlg-head' }, h('h2', { id: titleId }, title), sub, close);
    const body = h('div', { class: 'tm-dlg-body' });
    const foot = h('footer', { class: 'tm-dlg-foot' });
    const dialog = h('dialog', { id, class: 'tm-dialog ' + (cls || ''), 'aria-labelledby': titleId }, head, body, foot);
    document.body.append(dialog);
    let opener = null;
    const api = {
      dialog, body, foot, sub,
      get isOpen() { return dialog.open; },
      open(focusEl) {
        opener = document.activeElement;
        if (!dialog.open) dialog.showModal();
        const target = (typeof focusEl === 'function' ? focusEl() : focusEl) || dialog.querySelector(FOCUSABLE);
        if (target) target.focus();
      },
      close() {
        if (!dialog.open) return;
        dialog.close();
        if (onClose) onClose();
        if (opener && opener.focus && document.contains(opener)) opener.focus();
      },
      requestClose() { if (!onRequestClose || onRequestClose() !== false) api.close(); },
    };
    close.addEventListener('click', () => api.requestClose());
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); api.requestClose(); });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) api.requestClose(); });
    dialog.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length && !el.closest('[hidden]') && !el.closest('fieldset[disabled]'));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return api;
  }
  Studio.modal = modal;

  /** Segmented radio group on native inputs (arrow keys, labels, form semantics for free). */
  let uid = 0;
  function seg(label, name, onPick) {
    const group = h('div', { class: 'tm-seg' });
    const field = h('fieldset', { class: 'tm-field' }, h('legend', null, label), group);
    let inputs = [];
    return {
      el: field,
      set(options, value) {
        const key = options.map((o) => o[0] + ':' + o[1]).join('|');
        if (group.dataset.key !== key) {
          group.dataset.key = key;
          group.textContent = '';
          inputs = options.map(([v, text, title]) => {
            const input = h('input', { type: 'radio', name, value: String(v), id: 'tm-r' + ++uid });
            input.addEventListener('change', () => { if (input.checked) onPick(v); });
            group.append(h('label', { title: title || null }, input, h('span', null, text)));
            return input;
          });
        }
        inputs.forEach((i) => { i.checked = i.value === String(value); });
      },
    };
  }
  Studio.segField = seg;

  function switchCtl(text, onChange) {
    const input = h('input', { type: 'checkbox', role: 'switch' });
    input.addEventListener('change', () => onChange(input.checked));
    const lab = h('label', { class: 'tm-switch' }, input, h('span', null, text));
    return { el: lab, input };
  }

  // ───────────────────────────── prefs ─────────────────────────────
  const PREF_KEY = 'typoman.export.v1';
  const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } };
  const savePrefs = (p) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ } };

  const FORMAT_CARDS = [
    ['mp4', 'MP4', 'Video for anywhere'],
    ['webm', 'WebM', 'Web video · alpha'],
    ['gif', 'GIF', 'Animated image'],
    ['png', 'PNG', 'Still frame'],
    ['pngseq', 'PNG seq', 'Frames · ZIP'],
  ];
  const PHASE = { fonts: 'Loading fonts…', palette: 'Building the GIF palette…', finalize: 'Finishing the file…', encode: 'Encoding PNG…' };

  // ───────────────────────────── export dialog ─────────────────────────────
  function createExportDialog(store) {
    const prefs = Object.assign({ format: 'mp4', resBy: {}, fpsBy: {}, lengthMode: 'loops', loops: 1, seconds: 0, quality: 'high', dither: false, matte: null }, loadPrefs());
    let transparent = null; // per open: defaults to the scene's own background
    let frameIndex = 0;
    let busy = false, job = null, lastURL = null, raf = 0, negToken = 0, plan = null, prevKey = '';

    const m = modal({
      id: 'tm-export', title: 'Export', cls: 'tm-export',
      onRequestClose: () => { if (busy) { cancel(); return false; } return true; },
      onClose: () => { cancelAnimationFrame(raf); raf = 0; },
    });

    // ── preview ──
    const pvCanvas = h('canvas', { 'aria-hidden': 'true' });
    const pvTag = h('span', { class: 'tm-pv-tag', hidden: true });
    const pvFrame = h('div', { class: 'tm-pv-frame' }, pvTag, pvCanvas);
    const pvMeta = h('p', { class: 'tm-pv-meta' });
    m.body.append(h('div', { class: 'tm-pv' }, pvFrame, pvMeta));
    const pvRenderer = new TM.Renderer(pvCanvas, { quality: 'preview' });
    let pvScene = null;

    // ── options ──
    const formats = h('fieldset', { class: 'tm-formats' }, h('legend', null, 'Format'));
    const fmtInputs = FORMAT_CARDS.map(([id, label, subText]) => {
      const input = h('input', { type: 'radio', name: 'tm-x-format', value: id, 'aria-describedby': 'tm-x-fmt-' + id });
      input.addEventListener('change', () => { if (input.checked) set({ format: id }); });
      formats.append(h('label', { class: 'tm-fmt' }, input, h('b', null, label), h('small', { id: 'tm-x-fmt-' + id }, subText)));
      return input;
    });

    const resSel = h('select', { id: 'tm-x-res' });
    resSel.addEventListener('change', () => { prefs.resBy[prefs.format] = +resSel.value; set({}); });
    const resRow = h('div', { class: 'tm-field' }, h('label', { class: 'tm-lbl', for: 'tm-x-res' }, 'Resolution'), resSel);

    const fpsSeg = seg('Frame rate', 'tm-x-fps', (v) => { prefs.fpsBy[prefs.format] = +v; set({}); });

    const lenMode = h('div', { class: 'tm-seg', role: 'radiogroup', 'aria-label': 'Length unit' });
    const lenModes = [['loops', 'Loops'], ['seconds', 'Seconds']].map(([v, text]) => {
      const input = h('input', { type: 'radio', name: 'tm-x-lenmode', value: v });
      input.addEventListener('change', () => { if (input.checked) set({ lengthMode: v }); });
      lenMode.append(h('label', null, input, h('span', null, text)));
      return input;
    });
    const lenInput = h('input', { type: 'number', id: 'tm-x-len', min: 1, max: 100, step: 1, inputmode: 'decimal', 'aria-describedby': 'tm-x-len-hint' });
    lenInput.addEventListener('change', () => {
      const v = parseFloat(lenInput.value);
      if (prefs.lengthMode === 'loops') prefs.loops = Math.max(1, Math.min(100, Math.round(v) || 1));
      else prefs.seconds = Math.max(0.1, Math.min(600, v || store.scene.duration));
      set({});
    });
    lenMode.style.flex = '0 0 150px';
    const lenHint = h('span', { id: 'tm-x-len-hint', class: 'tm-note' });
    const lenRow = h('div', { class: 'tm-field' }, h('label', { class: 'tm-lbl', for: 'tm-x-len' }, 'Length'), h('div', { class: 'tm-inline' }, lenMode, lenInput, lenHint));

    const frameInput = h('input', { type: 'number', id: 'tm-x-frame', min: 0, step: 1 });
    frameInput.addEventListener('change', () => { frameIndex = Math.max(0, Math.round(+frameInput.value) || 0); set({}); });
    const frameBtn = h('button', { type: 'button', class: 'btn small', onclick: () => { frameIndex = playheadFrame(); set({}); } }, 'Use playhead');
    const frameHint = h('span', { class: 'tm-note' });
    const frameRow = h('div', { class: 'tm-field' }, h('label', { class: 'tm-lbl', for: 'tm-x-frame' }, 'Frame'), h('div', { class: 'tm-inline' }, frameInput, frameBtn, frameHint));

    const qualSeg = seg('Quality', 'tm-x-quality', (v) => set({ quality: v }));

    const alphaSw = switchCtl('Transparent background', (v) => { transparent = v; set({}); });
    const alphaHint = h('span', { class: 'tm-note' });
    const alphaRow = h('div', { class: 'tm-field' }, h('span', { class: 'tm-lbl' }, 'Background'), h('div', { class: 'tm-inline' }, alphaSw.el, alphaHint));

    const matteInput = h('input', { type: 'color', id: 'tm-x-matte' });
    matteInput.addEventListener('input', () => set({ matte: matteInput.value }));
    const matteLbl = h('label', { class: 'tm-lbl', for: 'tm-x-matte' }, 'Fill colour');
    const matteHint = h('span', { class: 'tm-note' });
    const matteRow = h('div', { class: 'tm-field' }, matteLbl, h('div', { class: 'tm-inline tm-color' }, matteInput, matteHint));

    const ditherSw = switchCtl('Dither (smoother gradients, larger file)', (v) => set({ dither: v }));
    const ditherRow = h('div', { class: 'tm-field' }, h('span', { class: 'tm-lbl' }, 'Colours'), ditherSw.el);

    const info = h('div', { class: 'tm-info', 'aria-live': 'polite' });
    // Photosensitivity (WCAG 2.3.1): a warning, never a block.
    const flashBox = h('div', { class: 'tm-info warn tm-flash', role: 'note', hidden: true });
    const optsSet = h('fieldset', { class: 'tm-opts', style: 'border:0;margin:0;min-width:0' }, formats, flashBox, resRow, fpsSeg.el, lenRow, frameRow, qualSeg.el, alphaRow, matteRow, ditherRow, info);
    m.body.append(optsSet);

    // ── footer ──
    const bar = h('progress', { max: 1, value: 0, 'aria-label': 'Export progress' });
    const status = h('span', { class: 'status', role: 'status' });
    const cancelBtn = h('button', { type: 'button', class: 'btn', onclick: () => cancel() }, 'Cancel');
    const progress = h('div', { class: 'tm-progress', hidden: true }, bar, cancelBtn, status);
    const result = h('div', { class: 'tm-result', hidden: true, role: 'status' });
    const est = h('span', { class: 'est' });
    const go = h('button', { type: 'button', class: 'btn primary', onclick: () => start() }, 'Export');
    m.foot.append(progress, result, h('div', { class: 'tm-actions' }, est, go));

    // ── state → UI ──
    function fmt() { return X.FORMATS[prefs.format] || X.FORMATS.mp4; }
    function playheadFrame() {
      const s = store.scene;
      const fps = (prefs.fpsBy.png || s.fps);
      return Math.round(TM.math.mod(store.ui.time || 0, s.duration) * fps) % Math.max(1, Math.round(s.duration * fps));
    }
    function options() {
      const f = fmt(), s = store.scene;
      const res = prefs.resBy[f.id] || (f.id === 'gif' ? f.defRes : Math.min(f.defRes, Math.max(720, Math.min(s.size.w, s.size.h))));
      const fps = prefs.fpsBy[f.id] || (f.fps.includes(s.fps) && f.id !== 'gif' ? s.fps : f.defFps || 30);
      return {
        format: f.id, resolution: res, fps, lengthMode: prefs.lengthMode, loops: prefs.loops, seconds: prefs.seconds || s.duration,
        quality: prefs.quality, transparent: transparent == null ? s.bg.type === 'transparent' : transparent,
        matte: prefs.matte || (s.bg.type === 'transparent' ? (f.id === 'gif' ? '#ffffff' : '#000000') : s.bg.color),
        dither: prefs.dither, time: frameIndex / fps,
      };
    }

    function set(patch) {
      Object.assign(prefs, patch);
      savePrefs({ format: prefs.format, resBy: prefs.resBy, fpsBy: prefs.fpsBy, lengthMode: prefs.lengthMode, loops: prefs.loops, quality: prefs.quality, dither: prefs.dither });
      refresh();
    }

    function refresh() {
      const s = store.scene, f = fmt(), o = options();
      plan = X.plan(s, o);
      fmtInputs.forEach((i) => { i.checked = i.value === f.id; });
      // resolution
      const resKey = f.id + s.size.w + 'x' + s.size.h;
      if (resSel.dataset.key !== resKey) {
        resSel.dataset.key = resKey;
        resSel.textContent = '';
        X.resolutions(s, f.id).forEach((r) => resSel.append(h('option', { value: r.short }, `${r.label} · ${r.w}×${r.h}`)));
      }
      resSel.value = String(plan.short);
      fpsSeg.set(f.fps.map((v) => [v, String(v), v + ' frames per second']), plan.fps);
      fpsSeg.el.hidden = !!f.still;
      // length
      lenRow.hidden = !!f.still;
      lenModes.forEach((i) => { i.checked = i.value === plan.lengthMode; });
      if (document.activeElement !== lenInput) lenInput.value = plan.lengthMode === 'loops' ? plan.loops : +(plan.seconds.toFixed(2));
      lenInput.step = plan.lengthMode === 'loops' ? 1 : 0.1;
      lenInput.min = plan.lengthMode === 'loops' ? 1 : 0.1;
      lenInput.max = plan.lengthMode === 'loops' ? 100 : 600;
      lenHint.textContent = `= ${plan.duration.toFixed(2)} s · ${plan.frames} frames` + (plan.lengthMode === 'loops' ? ` (loop ${s.duration} s)` : '');
      // still frame
      frameRow.hidden = !f.still;
      const total = Math.max(1, Math.round(s.duration * plan.fps));
      frameIndex = Math.min(frameIndex, total - 1);
      frameInput.max = total - 1;
      if (document.activeElement !== frameInput) frameInput.value = frameIndex;
      frameHint.textContent = `of ${total} · ${(frameIndex / plan.fps).toFixed(3)} s`;
      // quality, alpha, matte, dither
      qualSeg.el.hidden = !f.video;
      qualSeg.set(X.QUALITIES, plan.quality);
      alphaSw.input.disabled = !f.alpha;
      alphaSw.input.checked = plan.transparent;
      alphaHint.textContent = !f.alpha ? "MP4 can't store transparency: use WebM or PNG" : f.id === 'gif' ? '1-bit: edges blend into the matte' : f.id === 'webm' ? 'VP9 alpha channel' : '8-bit alpha';
      const needsFill = s.bg.type === 'transparent' && !plan.transparent;
      const gifMatte = f.id === 'gif' && plan.transparent;
      matteRow.hidden = !(needsFill || gifMatte);
      matteLbl.textContent = gifMatte ? 'Edge matte' : 'Fill colour';
      matteHint.textContent = gifMatte ? 'Soft edges are blended into this colour' : 'The scene background is transparent; this format fills it';
      matteInput.value = (plan.matte || '#000000').slice(0, 7);
      ditherRow.hidden = f.id !== 'gif';
      ditherSw.input.checked = plan.dither;
      // summary
      m.sub.textContent = `${s.name} · ${s.size.w}×${s.size.h} · ${s.duration} s loop`;
      pvMeta.textContent = f.still
        ? `${plan.width}×${plan.height} · frame ${frameIndex} · ${plan.start.toFixed(3)} s`
        : `${plan.width}×${plan.height} · ${plan.fps} fps · ${plan.frames} frames · ${plan.duration.toFixed(2)} s`;
      go.textContent = 'Export ' + (f.id === 'pngseq' ? 'PNG sequence' : f.label);
      pvFrame.classList.toggle('checker', plan.transparent);
      pvFrame.style.aspectRatio = plan.width + ' / ' + plan.height;
      pvFrame.style.setProperty('--ar', (plan.width / plan.height).toFixed(4));
      const key = JSON.stringify([s, plan.width, plan.height, plan.transparent, plan.matte, plan.format]);
      if (key !== prevKey) { prevKey = key; pvScene = X.sceneFor(s, plan); pvRenderer.setScene(pvScene); sizePreview(); TM.prepare(pvScene); }
      updateInfo();
      Studio.flashNote(flashBox, s);
      if (f.still) drawPreview(plan.start);
    }

    function sizePreview() {
      const w = Math.min(720, Math.max(160, Math.round((pvFrame.clientWidth || 480) * Math.min(2, window.devicePixelRatio || 1))));
      pvRenderer.resize(w, Math.round((w * plan.height) / plan.width));
    }
    function drawPreview(t) { if (pvScene) pvRenderer.render(t); }
    function loop(now) {
      raf = 0;
      if (!m.isOpen) return;
      if (!busy && !fmt().still) drawPreview((now / 1000) % store.scene.duration);
      raf = requestAnimationFrame(loop);
    }

    function infoBox(cls, title, codec, lines, action) {
      info.className = 'tm-info' + (cls ? ' ' + cls : '');
      info.textContent = '';
      const ttl = h('div', { class: 'ttl' }, title);
      if (codec) ttl.append(h('code', null, codec));
      info.append(ttl, ...lines.filter(Boolean).map((l) => h('p', null, l)));
      if (action) info.append(action);
    }

    function updateInfo() {
      const f = fmt(), p = plan;
      est.textContent = '';
      if (f.id === 'gif') return infoBox('', 'GIF89a · one palette for the whole loop', null, ['Up to 256 colours, loops forever, changed areas only. Best under ~800 px; for crisp HD use MP4 or WebM.', p.fps > 25 ? 'Some apps cap GIF playback near 25 fps.' : '']);
      if (f.id === 'png') return infoBox('', 'PNG still · lossless', null, [p.transparent ? 'RGBA with the background left transparent.' : 'Exact frame from the renderer, full quality.']);
      if (f.id === 'pngseq') return infoBox('', 'PNG sequence · lossless frames in a ZIP', null, [`${p.frames} numbered PNGs${p.transparent ? ' with alpha' : ''} plus a README with the frame rate. Imports into After Effects, Premiere, Resolve and ffmpeg.`]);
      const caps = X.caps();
      if (!caps.webcodecs) {
        return infoBox('warn', 'Real-time capture (MediaRecorder)', X.recorderMime(f.id) || null, [
          "This browser has no WebCodecs video encoder, so the export records in real time: it takes as long as the clip and frame timing can drift. Keep this tab visible.",
          'For frame-accurate H.264, use the latest Chrome, Edge or Safari.',
        ]);
      }
      infoBox('', 'Checking codecs…', null, []);
      const token = ++negToken;
      X.negotiate(p).then((neg) => {
        if (token !== negToken) return;
        if (!neg.ok) {
          if (p.transparent) {
            const btn = h('button', { type: 'button', class: 'btn small', onclick: () => set({ format: 'pngseq' }) }, 'Use PNG sequence instead');
            return infoBox('bad', "Transparent WebM isn't available in this browser", null, ['It has no VP9/VP8 encoder. A PNG sequence keeps full alpha and imports into every editor.'], btn);
          }
          return infoBox('warn', 'No encoder for this size', null, ["This browser can't encode video at this resolution. Pick a lower resolution, or TYPOMAN will fall back to real-time capture."]);
        }
        const d = X.describe(neg.choice);
        est.textContent = `up to ${X.formatBytes((neg.choice.config.bitrate * p.duration) / 8)} · ${d.bitrate} max (kinetic type usually compresses far smaller)`;
        infoBox(d.warn ? 'warn' : '', d.title, d.codec, [d.plays]);
      });
    }

    // ── export ──
    function setBusy(on) {
      busy = on;
      optsSet.disabled = on;
      go.disabled = on;
      progress.hidden = !on;
      pvTag.hidden = !on;
      if (on) { result.hidden = true; bar.value = 0; status.textContent = 'Starting…'; cancelBtn.focus(); }
    }
    function cancel() { if (job) { status.textContent = 'Cancelling…'; job.abort(); } }
    const onUnload = (e) => { e.preventDefault(); e.returnValue = ''; };

    function onProgress(p) {
      if (p.fraction != null) bar.value = Math.max(bar.value, Math.min(1, p.fraction));
      bar.setAttribute('aria-valuetext', Math.round(bar.value * 100) + '%');
      if (p.phase === 'render' || p.phase === 'record') {
        const eta = Number.isFinite(p.etaMs) ? ` · ${X.formatDuration(p.etaMs)} left` : '';
        const rate = p.fps > 0 ? ` · ${p.fps.toFixed(p.fps < 10 ? 1 : 0)} fps` : '';
        status.textContent = `${p.phase === 'record' ? 'Recording' : 'Rendering'} frame ${p.done} / ${p.total}${rate}${eta}`;
      } else if (PHASE[p.phase]) status.textContent = PHASE[p.phase];
    }
    function onFrame(canvas, i) {
      const ctx = pvCanvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, pvCanvas.width, pvCanvas.height);
      ctx.drawImage(canvas, 0, 0, pvCanvas.width, pvCanvas.height);
      pvTag.textContent = 'Rendering · f' + String(i).padStart(4, '0');
    }

    function showResult(res, ms) {
      result.className = 'tm-result';
      result.textContent = '';
      const i = res.info;
      const isVideo = res.plan.format === 'mp4' || res.plan.format === 'webm';
      const details = [X.formatBytes(i.bytes), `${i.width}×${i.height}`, i.frames > 1 ? `${i.frames} frames @ ${i.fps} fps` : null, i.label, `done in ${X.formatDuration(ms)}`].filter(Boolean).join(' · ');
      const msg = h('div', { class: 'msg' }, h('b', null, '✓ ' + res.name), h('span', null, details));
      if (i.notes && i.notes.length) msg.append(h('ul', null, ...i.notes.map((n) => h('li', null, n))));
      const again = h('a', { class: 'btn small', href: lastURL, download: res.name }, 'Download again');
      result.append(msg, again);
      if (isVideo) {
        const tag = `<video src="${res.name}" width="${i.width}" height="${i.height}" autoplay muted loop playsinline style="max-width:100%;height:auto"></video>`;
        const copy = h('button', { type: 'button', class: 'btn small' }, 'Copy <video> tag');
        copy.addEventListener('click', () => Studio.copyText(tag, copy));
        result.append(copy);
      }
      result.hidden = false;
      again.focus();
    }
    function showMessage(text, kind) {
      result.className = 'tm-result' + (kind === 'error' ? ' err' : '');
      result.textContent = '';
      result.append(h('div', { class: 'msg' }, h('b', null, kind === 'error' ? 'Export failed' : text), kind === 'error' ? h('span', null, text) : null));
      result.hidden = false;
      go.focus();
    }

    async function start() {
      if (busy) return;
      const scene = TM.Scene.clone(store.scene);
      const o = options();
      if (lastURL) { URL.revokeObjectURL(lastURL); lastURL = null; }
      job = new AbortController();
      setBusy(true);
      const wasPlaying = store.ui.playing;
      if (wasPlaying) store.setUI({ playing: false }); // free the main thread for the export
      window.addEventListener('beforeunload', onUnload);
      const t0 = performance.now();
      try {
        const res = await X.run(scene, o, { signal: job.signal, onProgress, onFrame });
        lastURL = URL.createObjectURL(res.blob);
        X.download(res.blob, res.name, lastURL);
        setBusy(false);
        showResult(res, performance.now() - t0);
      } catch (e) {
        setBusy(false);
        if (X.isAbort(e)) showMessage('Export cancelled.', 'info');
        else { console.warn('[TM.Export]', e); showMessage(e && e.message ? e.message : String(e), 'error'); }
      } finally {
        job = null;
        window.removeEventListener('beforeunload', onUnload);
        if (wasPlaying) store.setUI({ playing: true });
        if (m.isOpen) refresh();
      }
    }

    return {
      open() {
        transparent = null;
        frameIndex = playheadFrame();
        prevKey = '';
        result.hidden = busy ? result.hidden : true;
        m.open(() => fmtInputs.find((i) => i.value === prefs.format));
        refresh();
        sizePreview();
        if (!raf) raf = requestAnimationFrame(loop);
      },
      modal: m,
      get plan() { return plan; },
    };
  }

  /**
   * Fill `box` (a .tm-info.warn) with the scene's photosensitivity warning, or hide it: every
   * visible layer above 3 flashes a second (Studio.flashRisks), named, with its rate.
   */
  Studio.flashNote = function (box, scene, advice = 'Consider slowing it before you publish; the export still works.') {
    const risks = Studio.flashRisks ? Studio.flashRisks(scene) : [];
    box.hidden = !risks.length;
    const key = risks.map((r) => r.index + ':' + r.rate.toFixed(1)).join('|');
    if (!risks.length || box.dataset.key === key) return;
    box.dataset.key = key;
    const who = risks.map((r) => `“${Studio.layerName(r.layer)}” (${(TM.getPreset(r.layer.preset) || {}).name || r.layer.preset}) flashes ${Studio.flashText(r.rate)}`);
    box.replaceChildren(
      h('div', { class: 'ttl' }, 'Photosensitivity warning'),
      h('p', null, who.join('; ') + ', above the limit of 3 a second in WCAG 2.3.1.'),
      h('p', null, 'Rapid flashing can trigger seizures in people with photosensitive epilepsy. ' + advice));
  };

  // ───────────────────────────── clipboard ─────────────────────────────
  /** Copy text with feedback on the button; falls back to execCommand when the API is blocked. */
  Studio.copyText = async function (text, button) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const ta = h('textarea', { style: 'position:fixed;opacity:0;top:0;left:0' });
      ta.value = text;
      (button && button.closest('dialog') || document.body).append(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
    }
    if (button) {
      const label = button.dataset.label || button.textContent;
      button.dataset.label = label;
      button.textContent = ok ? 'Copied ✓' : 'Press ⌘C / Ctrl+C';
      button.classList.toggle('ok', ok);
      clearTimeout(button._t);
      button._t = setTimeout(() => { button.textContent = label; button.classList.remove('ok'); }, 1800);
    }
    if (Studio.toast) Studio.toast(ok ? 'Copied to clipboard' : 'Copy blocked: select the text and press ⌘C / Ctrl+C', ok ? 'info' : 'error', 1800);
    return ok;
  };

  let instance = null;
  Studio.openExport = function (store) {
    if (!instance) instance = createExportDialog(store);
    instance.open();
    return instance;
  };
})(window.TM);
