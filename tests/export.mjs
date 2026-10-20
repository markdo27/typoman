#!/usr/bin/env node
/* TYPOMAN export tests: runs TM.Export.run in headless Chromium for every format and checks the
 * files users get against the engine's own renderer.
 *
 *   WebM (VP9, 2 loops) · MP4 (whatever codec negotiation picks: H.264, else AV1, else VP9)
 *   GIF · PNG still (opaque + transparent) · PNG-sequence ZIP · transparent WebM (VP9 + alpha)
 *
 * For each: frame count, duration, size and codec (ffprobe when on PATH, plus our own GIF / ZIP /
 * PNG / MP4 readers), and fidelity against a fresh TM.Renderer at t = i / fps computed here, not
 * through the exporter's helpers: luma PSNR for video, a high PSNR for GIF, bit-exact for PNG and
 * ZIP frames, alpha PSNR and transparent fraction for the transparent WebM. Timing: each sampled
 * video frame must match render(i / fps) better than its neighbours' times, and frame N of a
 * 2-loop export must be frame 0 again.
 *
 *   npm run test:export
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/export.mjs
 *   TYPOMAN_KEEP=1 keeps the exported files (path printed at the end)
 *   TYPOMAN_EXPORT_DIR=dir writes them to dir and keeps them (CI uploads it when the job fails)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadChromium, serve, openHarness, ConsoleLog, which, Report, run } from './lib/harness.mjs';
import { decodePNG, readZip, parseGIF, boxes, findBox, parseAv1C, ffprobe, ffmpegFrames, lumaPSNR, rgbaPSNR, planePSNR, diffStats, fmtDB } from './lib/media.mjs';

// ───────────────────────────── thresholds ─────────────────────────────
// Measured on Chromium 141's software encoders (identical from run to run), then given a margin
// that still catches real breakage: a wrong frame time scores ~15–21 dB here, alpha squeezed to
// video range (16–235) ~24 dB, a missing or mispaired alpha plane far less.
const MIN_LUMA_PSNR = 32; // dB, every sampled frame of an opaque WebM/MP4 (measured 38.1–55.2)
const MIN_CHROMA_PSNR = 30; // dB, Cb/Cr at 4:2:0 (measured 39.5–60.3)
const TIMING_MARGIN = 3; // dB: frame i must match t = i/fps this much better than t = (i ± 1)/fps
const MIN_GIF_PSNR = 40; // dB RGB, ≤ 256 colours, no dither (measured 56.4)
// Transparent WebM: the alpha stream gets half the colour bitrate, so fast motion costs it
// (measured 39.4 dB on keyframes, 31.8 dB on P-frames of a 1 s orbit; 35.1 dB at 4 s).
const MIN_ALPHA_PSNR = 27; // dB, alpha plane
const MIN_ALPHA_COLOUR_PSNR = 27; // dB luma, colour where the reference is opaque (measured 31.4–40.0)
const SOFT_ALPHA_RATIO = [0.7, 1.3]; // decoded / reference count of partially transparent pixels (measured 1.01–1.04)
const MAX_TRANSPARENT_DELTA = 0.01; // |transparent fraction(file) − (reference)| (measured 0.0022)
const MIN_CLEAR_BG = 0.99; // reference-transparent pixels that decode with alpha ≤ 2 (measured 0.997)
const MIN_SOLID_CORE = 0.95; // type interior (≥ 2 px from any edge) that decodes with alpha ≥ 240 (measured 0.982)

const FPS = 30;
const SCENES = {
  // Opaque, flat saturated blue (chroma stress) and fast sine motion every frame.
  solid: { name: 'QA Solid Wave', duration: 1, fps: FPS, bg: { type: 'solid', color: '#0015ff' }, layers: [{ preset: 'wave', text: 'TYPE IN\nMOTION' }] },
  // Linear-gradient background, gradient text fill, text travelling along a path.
  flow: { name: 'QA Path Flow', duration: 1, fps: FPS, bg: { type: 'linear', color: '#101018', color2: '#3a0a4a', angle: 135 }, layers: [{ preset: 'path-flow', text: 'TYPE IN MOTION', fill: { type: 'gradient', color: '#ffffff', color2: '#00e5ff', angle: 90 } }] },
  // Palette fill, in → hold → out: the hold produces identical frames the GIF merges.
  flap: { name: 'QA Split Flap', duration: 1, fps: FPS, bg: { type: 'solid', color: '#111111' }, layers: [{ preset: 'split-flap', text: 'DEPARTURES', fill: { type: 'palette', palette: ['#ffd400', '#ffffff', '#ff3e6c'] } }] },
  // A continuous spin: every frame differs, so a bit-exact match also pins the frame time.
  spin: { name: 'QA Cylinder', duration: 1, fps: FPS, bg: { type: 'radial', color: '#203040', color2: '#05070a' }, layers: [{ preset: 'cylinder', text: 'ROUND AND ROUND', params: { spin: 'smooth' } }] },
  // Transparent background, glow for soft alpha edges, always-visible orbiting type.
  alpha: { name: 'QA Alpha Orbit', duration: 1, fps: FPS, bg: { type: 'transparent' }, layers: [{ preset: 'orbit', text: 'ALPHA EDGES', fill: { type: 'solid', color: '#ff3e6c' }, fx: { glow: { amount: 0.3, color: '#00e5ff' } } }] },
};
// 16:9 scenes: the long side follows the aspect and is rounded to an even number.
const sizeFor = (short) => ({ w: Math.round((short * 16) / 9 / 2) * 2, h: short });

const JOBS = [
  { id: 'webm', label: 'WebM VP9, 2 loops', scene: 'solid', opts: { format: 'webm', resolution: 720, fps: FPS, loops: 2 }, frames: 60, kind: 'video', sample: [0, 1, 8, 15, 22, 29, 30, 45, 59] },
  { id: 'mp4', label: 'MP4 (negotiated codec)', scene: 'flow', opts: { format: 'mp4', resolution: 720, fps: FPS, loops: 1 }, frames: 30, kind: 'video', sample: [0, 1, 10, 20, 29] },
  { id: 'gif', label: 'GIF 240p', scene: 'flap', opts: { format: 'gif', resolution: 240, fps: FPS, loops: 1 }, frames: 30, kind: 'gif' },
  { id: 'png', label: 'PNG still', scene: 'solid', opts: { format: 'png', resolution: 720, time: 0.5 }, frames: 1, kind: 'png', time: 0.5 },
  { id: 'png-alpha', label: 'PNG still, transparent', scene: 'alpha', opts: { format: 'png', resolution: 720, time: 0.4, transparent: true }, frames: 1, kind: 'png', time: 0.4 },
  { id: 'zip', label: 'PNG sequence ZIP', scene: 'spin', opts: { format: 'pngseq', resolution: 720, fps: FPS, loops: 1 }, frames: 30, kind: 'zip' },
  { id: 'webm-alpha', label: 'transparent WebM', scene: 'alpha', opts: { format: 'webm', resolution: 720, fps: FPS, loops: 1, transparent: true }, frames: 30, kind: 'alpha', sample: [0, 7, 15, 22, 29] },
];

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ───────────────────────────── page-side helpers ─────────────────────────────
async function installPageHelpers(page) {
  await page.evaluate(() => {
    const toB64 = (bytes) => new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).slice(String(fr.result).indexOf(',') + 1));
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(new Blob([bytes]));
    });
    const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    /** Fresh full-quality renderer per frame: what render(t) gives, with nothing carried over. */
    window.__qaRefs = async (sceneIn, w, h, times, mode) => {
      const scene = TM.Scene.normalize(sceneIn);
      await TM.prepare(scene);
      const out = [];
      for (const t of times) {
        const c = document.createElement('canvas');
        const r = new TM.Renderer(c, { quality: 'full' });
        r.setScene(scene);
        r.resize(w, h);
        r.render(t);
        const data = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
        out.push(mode === 'hash' ? hex(await crypto.subtle.digest('SHA-256', data)) : await toB64(data));
        if (r._warned) throw new Error('renderer warned while rendering the reference');
      }
      return out;
    };
    window.__qaExport = async (sceneIn, opts) => {
      const progress = [];
      const t0 = performance.now();
      const res = await TM.Export.run(TM.Scene.normalize(sceneIn), opts, { onProgress: (p) => progress.push(+(p.fraction || 0)) });
      const ms = performance.now() - t0;
      let monotonic = true;
      for (let i = 1; i < progress.length; i++) if (progress[i] < progress[i - 1] - 1e-9) monotonic = false;
      const neg = opts.format === 'mp4' || opts.format === 'webm' ? await TM.Export.negotiate(res.plan) : null;
      return {
        ms, name: res.name, info: res.info, plan: res.plan,
        tried: neg ? neg.tried.map((t) => `${t.id}:${t.ok ? 'yes' : 'no'}`).join(' ') : '',
        progress: { count: progress.length, monotonic, last: progress[progress.length - 1] },
        b64: await toB64(new Uint8Array(await res.blob.arrayBuffer())),
      };
    };
  });
}

async function refFrames(page, scene, size, times, mode = 'rgba') {
  const res = await page.evaluate(({ scene, w, h, times, mode }) => window.__qaRefs(scene, w, h, times, mode), { scene, w: size.w, h: size.h, times, mode });
  return mode === 'hash' ? res : res.map((b) => new Uint8Array(Buffer.from(b, 'base64')));
}

// ───────────────────────────── colour maths ─────────────────────────────
/** Y'CbCr coefficients for the matrix and range the stream is tagged with (BT.601 if untagged). */
function yuvMatrix(colorSpace, range) {
  const [kr, kb] = colorSpace === 'bt709' ? [0.2126, 0.0722] : [0.299, 0.114];
  const kg = 1 - kr - kb, full = range === 'pc';
  const ys = full ? 255 / 255 : 219 / 255, cs = full ? 255 / 255 : 224 / 255, yo = full ? 0 : 16;
  return {
    y: (r, g, b) => yo + ys * (kr * r + kg * g + kb * b),
    cb: (r, g, b) => 128 + cs * ((b - (kr * r + kg * g + kb * b)) / (2 * (1 - kb))),
    cr: (r, g, b) => 128 + cs * ((r - (kr * r + kg * g + kb * b)) / (2 * (1 - kr))),
  };
}
function refPlanes(rgba, W, H, M) {
  const Y = new Float32Array(W * H), w2 = W >> 1, h2 = H >> 1, U = new Float32Array(w2 * h2), V = new Float32Array(w2 * h2);
  for (let i = 0, j = 0; i < W * H; i++, j += 4) Y[i] = M.y(rgba[j], rgba[j + 1], rgba[j + 2]);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    let r = 0, g = 0, b = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const j = ((2 * y + dy) * W + 2 * x + dx) * 4; r += rgba[j]; g += rgba[j + 1]; b += rgba[j + 2]; }
    U[y * w2 + x] = M.cb(r / 4, g / 4, b / 4);
    V[y * w2 + x] = M.cr(r / 4, g / 4, b / 4);
  }
  return { Y, U, V };
}
const planes = (frame, W, H) => ({ Y: frame.subarray(0, W * H), U: frame.subarray(W * H, W * H * 1.25), V: frame.subarray(W * H * 1.25, W * H * 1.5), A: frame.length >= W * H * 2.5 ? frame.subarray(W * H * 1.5, W * H * 2.5) : null });

// ───────────────────────────── main ─────────────────────────────
await run(async (cleanup) => {
  const R = new Report('TYPOMAN export tests');
  const hasFF = which('ffprobe') && which('ffmpeg');
  const needFF = !!process.env.CI || process.env.TYPOMAN_REQUIRE_FFMPEG === '1';
  if (!hasFF) {
    if (needFF) R.check('ffmpeg and ffprobe are on PATH (required in CI)', false, 'install ffmpeg');
    else R.warn('ffmpeg/ffprobe not on PATH', 'video decoding, frame-count and fidelity checks for WebM, MP4, GIF are skipped');
  }
  const keep = process.env.TYPOMAN_KEEP === '1' || !!process.env.TYPOMAN_EXPORT_DIR;
  const outDir = process.env.TYPOMAN_EXPORT_DIR ? path.resolve(process.env.TYPOMAN_EXPORT_DIR) : fs.mkdtempSync(path.join(os.tmpdir(), 'typoman-export-'));
  fs.mkdirSync(outDir, { recursive: true });
  if (!keep) cleanup(() => fs.rmSync(outDir, { recursive: true, force: true }));

  const server = await serve();
  cleanup(() => server.close());
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  cleanup(() => browser.close());
  R.info(`Chromium ${browser.version()} · ffmpeg ${hasFF ? 'yes' : 'no'} · files in ${outDir}`);
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const log = new ConsoleLog();
  const page = await openHarness(context, server, { log });
  await installPageHelpers(page);

  // Engine loop semantics the exports rely on: t = duration is frame 0 again.
  {
    const s = sizeFor(180);
    const [a, b] = await refFrames(page, SCENES.solid, s, [0, SCENES.solid.duration], 'hash');
    R.check('engine: render(duration) === render(0) (the loop point)', a === b);
    // A loop export must span exactly loops × duration, or the file restarts a fraction of a
    // frame early or late (a hitch). Every loop length the inspector offers (0.5–20 s in 0.1 s
    // steps) × scene fps × each format's export fps, planned with TM.Export.plan (pure).
    const fit = await page.evaluate(() => {
      const bad = [];
      let total = 0;
      for (let d10 = 5; d10 <= 200; d10++) for (const sceneFps of TM.Scene.FPS_OPTIONS) {
        const scene = TM.Scene.normalize({ duration: d10 / 10, fps: sceneFps });
        for (const format of ['mp4', 'gif']) for (const fps of TM.Export.FORMATS[format].fps) {
          total++;
          const plan = TM.Export.plan(scene, { format, fps, loops: 1 });
          if (Math.abs(plan.duration - scene.duration) > 1e-6) bad.push(`${scene.duration} s ${format} @ ${fps} fps → ${plan.frames} frames = ${plan.duration.toFixed(3)} s`);
        }
      }
      return { total, bad };
    });
    R.known('N14', 'loop exports span exactly one loop at every export frame rate', fit.bad.length === 0,
      `${fit.bad.length} of ${fit.total} length × fps combinations don't, e.g. ${fit.bad.filter((b) => /^2\.7 s|^3\.3 s/.test(b)).slice(0, 3).join('; ')}`);
  }

  for (const job of JOBS) {
    const scene = SCENES[job.scene];
    R.section(`${job.label}  [${job.id}: ${job.scene} scene, ${scene.layers[0].preset}]`);
    let res;
    try {
      res = await page.evaluate(({ scene, opts }) => window.__qaExport(scene, opts), { scene, opts: job.opts });
    } catch (e) {
      R.check(`${job.id}: export completes`, false, String(e.message || e).split('\n')[0]);
      continue;
    }
    const { info, plan } = res;
    const bytes = Buffer.from(res.b64, 'base64');
    const file = path.join(outDir, `${job.id}.${info.ext}`);
    fs.writeFileSync(file, bytes);
    const size = sizeFor(job.opts.resolution);
    R.info(`${res.name} · ${info.label} · ${info.codec} · ${info.width}×${info.height} · ${info.frames} frame(s) · ${(bytes.length / 1024).toFixed(0)} KB · ${Math.round(res.ms)} ms`);
    if (res.tried) R.info(`codec negotiation: ${res.tried}`);
    R.check(`${job.id}: export reports the planned size`, info.width === size.w && info.height === size.h, `${info.width}×${info.height}, expected ${size.w}×${size.h}`);
    R.check(`${job.id}: frames = loops × duration × fps`, info.frames === job.frames && plan.frames === job.frames, `${info.frames}, expected ${job.frames}`);
    if (job.kind !== 'png') R.check(`${job.id}: duration = frames / fps`, Math.abs(info.duration - job.frames / FPS) < 1e-9, `${info.duration} s`);
    R.check(`${job.id}: progress is monotonic and ends at 1`, res.progress.monotonic && res.progress.last === 1, `${res.progress.count} events`);
    const notes = info.notes.filter((s) => !/merged into longer delays/.test(s)); // GIF frame merging is by design
    R.check(`${job.id}: no export notes (fallback fonts, encoder retries)`, notes.length === 0, notes.join(' | '));

    try {
      if (job.kind === 'video') await checkVideo(R, page, job, scene, res, file, bytes, size, hasFF);
      else if (job.kind === 'alpha') await checkAlphaVideo(R, page, job, scene, res, file, size, hasFF);
      else if (job.kind === 'gif') await checkGIF(R, page, job, scene, res, file, bytes, size, hasFF);
      else if (job.kind === 'png') await checkPNG(R, page, job, scene, res, bytes, size);
      else if (job.kind === 'zip') await checkZIP(R, page, job, scene, res, bytes, size);
    } catch (e) {
      R.check(`${job.id}: file can be verified`, false, e.stack || String(e));
    }
  }

  const errs = log.since();
  R.check('no console errors during exports', errs.length === 0, errs.slice(0, 5).join(' | '));
  if (keep) R.info('exports kept in ' + outDir);
  R.finish();
});

// ───────────────────────────── WebM / MP4 ─────────────────────────────
async function checkVideo(R, page, job, scene, res, file, bytes, size, hasFF) {
  const { info } = res;
  const want = { avc: 'h264', av1: 'av1', vp9: 'vp9', vp8: 'vp8' }[info.family];
  if (job.opts.format === 'mp4') {
    R.info(`MP4 codec in use: ${info.codec} (${info.label})${info.family !== 'avc' ? ' — no H.264 encoder in this browser, negotiation fell back' : ''}`);
    const top = boxes(bytes).map((b) => b.type);
    R.check('mp4: fast start (ftyp, then moov before mdat)', top[0] === 'ftyp' && top.indexOf('moov') > 0 && top.indexOf('moov') < top.indexOf('mdat'), top.join(' '));
  } else {
    R.check('webm: VP9 chosen first for WebM', info.family === 'vp9', info.codec);
    R.check('webm: EBML header', bytes.readUInt32BE(0) === 0x1a45dfa3);
  }
  if (!hasFF) { R.skip(`${job.id}: ffprobe/ffmpeg checks`, 'ffmpeg not on PATH'); return; }

  const pr = ffprobe(file);
  const st = pr.streams.find((s) => s.codec_type === 'video') || {};
  const n = job.frames, dur = n / FPS;
  R.check(`${job.id}: ffprobe codec matches the negotiated family`, st.codec_name === want, `${st.codec_name}, expected ${want}`);
  R.check(`${job.id}: ffprobe size`, st.width === size.w && st.height === size.h, `${st.width}×${st.height}`);
  R.check(`${job.id}: ffprobe counts every frame`, +st.nb_read_frames === n, `${st.nb_read_frames} of ${n}`);
  R.check(`${job.id}: ffprobe frame rate`, st.r_frame_rate === `${FPS}/1` && st.avg_frame_rate === `${FPS}/1`, `${st.r_frame_rate}, avg ${st.avg_frame_rate}`);
  R.check(`${job.id}: container duration = frames / fps`, Math.abs(+pr.format.duration - dur) < 0.0015, `${pr.format.duration} s, expected ${dur.toFixed(3)}`);
  if (st.duration && st.duration !== 'N/A') R.check(`${job.id}: stream duration = frames / fps`, Math.abs(+st.duration - dur) < 0.0015, `${st.duration} s`);
  R.check(`${job.id}: 4:2:0 8-bit`, st.pix_fmt === 'yuv420p', st.pix_fmt);

  if (st.codec_name === 'av1') {
    // AV1-ISOBMFF §2.3.4: av1C's fields SHALL equal the sequence header's. Round 2 finding N5:
    // mp4-muxer writes a placeholder (level 2.0, 4:4:4, no configOBUs) when given no description.
    const box = findBox(bytes, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd', 'av01', 'av1C']);
    if (!box) R.check('mp4: av1C box present', false);
    else {
      const c = parseAv1C(bytes, box);
      const okSub = c.subsamplingX === 1 && c.subsamplingY === 1 && !c.monochrome;
      const okLevel = st.level == null || st.level < 0 || c.seqLevelIdx === +st.level;
      R.known('N5', 'mp4: av1C matches the AV1 bitstream', okSub && okLevel && c.configOBUs > 0,
        `av1C level idx ${c.seqLevelIdx} vs bitstream ${st.level}, subsampling ${c.subsamplingX},${c.subsamplingY} vs 4:2:0, ${c.configOBUs} configOBU bytes`);
    }
  }

  const W = size.w, H = size.h;
  const frames = ffmpegFrames(file, { width: W, height: H, pixFmt: 'yuv420p' });
  R.check(`${job.id}: ffmpeg decodes every frame`, frames.length === n, `${frames.length} of ${n}`);
  if (frames.length !== n) return;
  const M = yuvMatrix(st.color_space, st.color_range);
  R.info(`stream colour: ${st.color_space || '?'} / ${st.color_range || '?'} (luma/chroma references use that matrix)`);
  // Reference: t = i / fps and its neighbours, for the timing check.
  const idx = job.sample;
  const times = new Set();
  idx.forEach((i) => [i - 1, i, i + 1].forEach((k) => { if (k >= 0 && k < n) times.add(k); }));
  const ks = [...times].sort((a, b) => a - b);
  const refs = await refFrames(page, scene, size, ks.map((k) => k / FPS));
  const ref = new Map(ks.map((k, j) => [k, refPlanes(refs[j], W, H, M)]));
  const rows = [];
  let worstY = Infinity, worstC = Infinity, judged = 0;
  const timingBad = [];
  for (const i of idx) {
    const P = planes(frames[i], W, H), r = ref.get(i);
    const y = lumaPSNR(P.Y, r.Y), u = lumaPSNR(P.U, r.U), v = lumaPSNR(P.V, r.V);
    worstY = Math.min(worstY, y);
    worstC = Math.min(worstC, u, v);
    // Timing: of render((i-1)/fps), render(i/fps) and render((i+1)/fps), the decoded frame must
    // match i/fps best. A neighbour only decides anything when its reference differs from the
    // best match by more than codec noise (a still moment, e.g. a hold, can't tell times apart).
    const cand = [i - 1, i, i + 1].filter((k) => ref.has(k));
    const score = new Map(cand.map((k) => [k, k === i ? y : lumaPSNR(P.Y, ref.get(k).Y)]));
    const bestAt = cand.reduce((a, k) => (score.get(k) > score.get(a) ? k : a), i);
    const best = score.get(bestAt);
    const distinct = (k) => lumaPSNR(ref.get(k).Y, ref.get(bestAt).Y) < best - TIMING_MARGIN;
    if (bestAt !== i && distinct(i)) timingBad.push(`frame ${i} shows t=${bestAt}/${FPS} (${fmtDB(best)} dB) rather than t=${i}/${FPS} (${fmtDB(y)} dB)`);
    else if (bestAt === i) judged += cand.filter((k) => k !== i && distinct(k)).length;
    rows.push(`${i}: Y ${fmtDB(y)} Cb ${fmtDB(u)} Cr ${fmtDB(v)} | neighbours ${cand.filter((k) => k !== i).map((k) => fmtDB(score.get(k)) + (distinct(k) ? '' : '?')).join('/')}`);
  }
  R.info('PSNR vs render(i / fps) [dB] (? = neighbour indistinguishable): ' + rows.join(' · '));
  R.check(`${job.id}: luma PSNR ≥ ${MIN_LUMA_PSNR} dB on every sampled frame`, worstY >= MIN_LUMA_PSNR, `worst ${fmtDB(worstY)} dB`);
  R.check(`${job.id}: chroma PSNR ≥ ${MIN_CHROMA_PSNR} dB on every sampled frame`, worstC >= MIN_CHROMA_PSNR, `worst ${fmtDB(worstC)} dB`);
  R.check(`${job.id}: frame i shows t = i / fps (not a neighbour's time)`, timingBad.length === 0 && judged >= idx.length,
    timingBad.length ? timingBad.slice(0, 4).join('; ') : `${judged} neighbour comparisons decided${judged < idx.length ? ' (too few: the scene is too still to pin frame times)' : ''}`);
  if (job.opts.loops > 1) {
    const L = n / job.opts.loops;
    const [h0, hL] = await refFrames(page, scene, size, [0, L / FPS], 'hash');
    R.check(`${job.id}: reference frame ${L} (t = duration) is frame 0 again`, h0 === hL);
    const y = planePSNR(planes(frames[L], W, H).Y, planes(frames[0], W, H).Y);
    R.check(`${job.id}: loop 2 starts where loop 1 started (file frame ${L} ≈ frame 0)`, y >= MIN_LUMA_PSNR, `${fmtDB(y)} dB`);
  }
}

// ───────────────────────────── transparent WebM ─────────────────────────────
async function checkAlphaVideo(R, page, job, scene, res, file, size, hasFF) {
  const { info } = res;
  R.check('webm-alpha: an alpha-capable VP9/VP8 path was chosen', !!info.alphaMode && /vp/.test(info.family), `${info.family} ${info.alphaMode}`);
  if (!hasFF) { R.skip('webm-alpha: ffprobe/ffmpeg checks', 'ffmpeg not on PATH'); return; }
  const pr = ffprobe(file);
  const st = pr.streams.find((s) => s.codec_type === 'video') || {};
  const tags = st.tags || {};
  const n = job.frames, W = size.w, H = size.h;
  R.check('webm-alpha: stream is tagged alpha_mode=1', (tags.alpha_mode || tags.ALPHA_MODE) === '1', JSON.stringify(tags));
  R.check('webm-alpha: ffprobe counts every frame', +st.nb_read_frames === n, `${st.nb_read_frames} of ${n}`);
  R.check('webm-alpha: container duration = frames / fps', Math.abs(+pr.format.duration - n / FPS) < 0.0015, `${pr.format.duration} s`);
  const dec = st.codec_name === 'vp8' ? 'libvpx' : 'libvpx-vp9'; // ffmpeg's native VP9/VP8 decoders drop alpha
  const frames = ffmpegFrames(file, { width: W, height: H, pixFmt: 'yuva420p', codec: dec });
  R.check('webm-alpha: decodes with an alpha plane', frames.length === n, `${frames.length} of ${n} frames via ${dec}`);
  if (frames.length !== n) return;
  const M = yuvMatrix(st.color_space, st.color_range);
  const refs = await refFrames(page, scene, size, job.sample.map((i) => i / FPS));
  let worstA = Infinity, worstC = Infinity, worstDelta = 0, minFrac = 1, maxFrac = 0, worstClear = 1, worstCore = 1;
  const softRatios = [];
  const rows = [];
  job.sample.forEach((i, j) => {
    const P = planes(frames[i], W, H), rf = refs[j];
    const refA = new Uint8Array(W * H), mask = new Uint8Array(W * H);
    let tRef = 0, tDec = 0, softRef = 0, softDec = 0, zero = 0, zeroClear = 0, core = 0, coreSolid = 0;
    for (let p = 0; p < W * H; p++) {
      const a = rf[p * 4 + 3];
      refA[p] = a;
      mask[p] = a >= 250 ? 1 : 0;
      if (a < 8) tRef++;
      if (P.A[p] < 8) tDec++;
      if (a > 8 && a < 247) softRef++;
      if (P.A[p] > 8 && P.A[p] < 247) softDec++;
      if (a === 0) { zero++; if (P.A[p] <= 2) zeroClear++; }
    }
    // Interior of the type: opaque with every pixel within 2 px opaque too.
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const p = y * W + x;
      if (refA[p] !== 255) continue;
      let inner = true;
      for (let dy = -2; inner && dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (refA[p + dy * W + dx] !== 255) { inner = false; break; }
      if (inner) { core++; if (P.A[p] >= 240) coreSolid++; }
    }
    const a = planePSNR(P.A, refA), y = lumaPSNR(P.Y, refPlanes(rf, W, H, M).Y, mask);
    const fr = tRef / (W * H), fd = tDec / (W * H);
    worstA = Math.min(worstA, a);
    worstC = Math.min(worstC, y);
    worstDelta = Math.max(worstDelta, Math.abs(fr - fd));
    minFrac = Math.min(minFrac, fr);
    maxFrac = Math.max(maxFrac, fr);
    softRatios.push(softRef ? softDec / softRef : 0);
    worstClear = Math.min(worstClear, zero ? zeroClear / zero : 1);
    worstCore = Math.min(worstCore, core ? coreSolid / core : 0);
    rows.push(`${i}: alpha ${fmtDB(a)} dB, opaque-colour Y ${fmtDB(y)} dB, transparent ${(fd * 100).toFixed(2)}% (ref ${(fr * 100).toFixed(2)}%), solid core ${((coreSolid / Math.max(1, core)) * 100).toFixed(1)}% of ${core}`);
  });
  R.info(rows.join(' · '));
  R.check(`webm-alpha: alpha PSNR ≥ ${MIN_ALPHA_PSNR} dB`, worstA >= MIN_ALPHA_PSNR, `worst ${fmtDB(worstA)} dB`);
  R.check(`webm-alpha: colour PSNR ≥ ${MIN_ALPHA_COLOUR_PSNR} dB where opaque`, worstC >= MIN_ALPHA_COLOUR_PSNR, `worst ${fmtDB(worstC)} dB`);
  R.check('webm-alpha: transparent fraction matches the reference', worstDelta <= MAX_TRANSPARENT_DELTA, `worst |Δ| ${(worstDelta * 100).toFixed(3)} points`);
  R.check('webm-alpha: transparent fraction is sensible (mostly background, type visible)', minFrac > 0.5 && maxFrac < 0.99, `${(minFrac * 100).toFixed(1)}–${(maxFrac * 100).toFixed(1)}% transparent`);
  R.check('webm-alpha: the background decodes transparent (alpha ≤ 2)', worstClear >= MIN_CLEAR_BG, `worst ${(worstClear * 100).toFixed(2)}% of transparent pixels`);
  R.check('webm-alpha: the inside of the type decodes opaque (alpha ≥ 240)', worstCore >= MIN_SOLID_CORE, `worst ${(worstCore * 100).toFixed(1)}% of interior pixels`);
  R.check('webm-alpha: soft (partial) alpha survives', softRatios.every((r) => r >= SOFT_ALPHA_RATIO[0] && r <= SOFT_ALPHA_RATIO[1]),
    `partially transparent pixels, file / reference: ${softRatios.map((r) => r.toFixed(2)).join(', ')}`);
}

// ───────────────────────────── GIF ─────────────────────────────
async function checkGIF(R, page, job, scene, res, file, bytes, size, hasFF) {
  const g = parseGIF(bytes);
  const n = job.frames;
  const startCs = (i) => Math.round((i * 100) / FPS);
  R.check('gif: GIF89a with a trailer', g.trailer && bytes.toString('latin1', 0, 6) === 'GIF89a');
  R.check('gif: logical screen = export size', g.width === size.w && g.height === size.h, `${g.width}×${g.height}`);
  R.check('gif: loops forever (NETSCAPE2.0 loop 0)', g.loop === 0, `loop ${g.loop}`);
  const total = g.frames.reduce((a, f) => a + f.delay, 0);
  R.check('gif: total delay = frames / fps exactly', total === startCs(n), `${total} cs, expected ${startCs(n)} cs`);
  // Map stored frames to clip frames: each must start exactly on round(i · 100 / fps).
  const at = new Map();
  for (let i = 0; i < n; i++) at.set(startCs(i), i);
  let cs = 0, misaligned = 0;
  const firstOf = [];
  for (const f of g.frames) { if (!at.has(cs)) misaligned++; firstOf.push(at.get(cs)); cs += f.delay; }
  R.check('gif: every stored frame starts on a frame boundary', misaligned === 0, `${g.frames.length} stored for ${n} frames, ${misaligned} misaligned`);
  R.info(`${g.frames.length} stored frames, ${n - g.frames.length} merged into longer delays; delays ${[...new Set(g.frames.map((f) => f.delay))].join('/')} cs`);
  R.check('gif: info.storedFrames matches the file', res.info.storedFrames === g.frames.length, `${res.info.storedFrames}`);
  if (!hasFF) { R.skip('gif: pixel fidelity', 'ffmpeg not on PATH'); return; }
  const pr = ffprobe(file);
  R.check('gif: ffprobe duration = frames / fps', Math.abs(+pr.format.duration - n / FPS) < 0.011, `${pr.format.duration} s`);
  const dec = ffmpegFrames(file, { width: size.w, height: size.h, pixFmt: 'rgba' });
  R.check('gif: ffmpeg decodes every stored frame', dec.length === g.frames.length, `${dec.length}`);
  if (dec.length !== g.frames.length) return;
  if (misaligned || cs !== startCs(n)) { R.skip('gif: pixel fidelity', 'frame timing is already wrong, so stored frames can\'t be mapped to clip frames'); return; }
  // Every clip frame: the stored frame covering it must match render(i / fps).
  const cover = [];
  for (let j = 0; j < g.frames.length; j++) {
    const a = firstOf[j], b = j + 1 < firstOf.length ? firstOf[j + 1] : n;
    for (let i = a; i < b; i++) cover[i] = j;
  }
  const refs = await refFrames(page, scene, size, Array.from({ length: n }, (_, i) => i / FPS));
  let worst = Infinity, worstAt = -1;
  for (let i = 0; i < n; i++) {
    const p = rgbaPSNR(dec[cover[i]], refs[i]);
    if (p < worst) { worst = p; worstAt = i; }
  }
  R.check(`gif: every frame within ${MIN_GIF_PSNR} dB of render(i / fps)`, worst >= MIN_GIF_PSNR, `worst ${fmtDB(worst)} dB at frame ${worstAt}, ${res.info.colors} colours`);
}

// ───────────────────────────── PNG still ─────────────────────────────
async function checkPNG(R, page, job, scene, res, bytes, size) {
  const img = decodePNG(bytes);
  R.check(`${job.id}: PNG decodes at the export size`, img.width === size.w && img.height === size.h, `${img.width}×${img.height}, colour type ${img.colorType}`);
  const frameNo = String(Math.round(job.time * FPS)).padStart(4, '0');
  R.check(`${job.id}: file name carries the frame number`, res.name.endsWith(`-f${frameNo}.png`), res.name);
  const [ref] = await refFrames(page, scene, size, [job.time]);
  const d = diffStats(img.data, ref);
  R.check(`${job.id}: bit-exact with render(${job.time})`, d.differing === 0, `${d.differing} px differ, max ${d.maxDiff}`);
  if (job.opts.transparent) {
    const levels = new Set();
    let clear = 0;
    for (let i = 3; i < img.data.length; i += 4) { levels.add(img.data[i]); if (img.data[i] === 0) clear++; }
    R.check(`${job.id}: full 8-bit alpha (soft edges kept)`, levels.size > 64 && img.colorType === 6, `${levels.size} alpha levels`);
    R.check(`${job.id}: transparent fraction is sensible`, clear / (img.width * img.height) > 0.5 && clear / (img.width * img.height) < 0.99, `${((clear / (img.width * img.height)) * 100).toFixed(1)}% fully transparent`);
  }
}

// ───────────────────────────── PNG sequence ZIP ─────────────────────────────
async function checkZIP(R, page, job, scene, res, bytes, size) {
  const entries = readZip(bytes);
  const n = job.frames;
  const pngs = entries.filter((e) => e.name.endsWith('.png'));
  const readme = entries.find((e) => e.name === 'README.txt');
  const slug = scene.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); // as TM.Export.slug
  R.check('zip: one PNG per frame plus README.txt', pngs.length === n && !!readme && entries.length === n + 1, `${entries.length} entries`);
  R.check('zip: stored entries with valid CRC-32', entries.every((e) => e.crcOk && e.method === 0), entries.filter((e) => !e.crcOk).map((e) => e.name).join(', '));
  const names = pngs.map((e) => e.name);
  const want = Array.from({ length: n }, (_, i) => `${slug}_${String(i).padStart(4, '0')}.png`);
  R.check('zip: frames are named <scene>_0000.png … in order', JSON.stringify(names) === JSON.stringify(want), `${names[0]} … ${names[names.length - 1]}`);
  if (readme) R.check('zip: README states the frame rate and count', /Frame rate:\s+30 fps/.test(readme.data.toString('utf8')) && new RegExp(`Frames:\\s+${n}\\b`).test(readme.data.toString('utf8')));
  const refs = await refFrames(page, scene, size, Array.from({ length: n }, (_, i) => i / FPS), 'hash');
  R.check('zip: consecutive reference frames all differ (so a match pins the time)', new Set(refs).size === n, `${new Set(refs).size} distinct of ${n}`);
  const bad = [];
  pngs.forEach((e, i) => {
    const img = decodePNG(e.data);
    if (img.width !== size.w || img.height !== size.h) { bad.push(`${e.name}: ${img.width}×${img.height}`); return; }
    const h = sha(img.data);
    if (h !== refs[i]) bad.push(`${e.name}${refs.indexOf(h) >= 0 ? ' equals frame ' + refs.indexOf(h) : ''}`);
  });
  R.check('zip: every frame bit-exact with render(i / fps)', bad.length === 0, bad.slice(0, 6).join(', '));
  if (bad.length) {
    const i = names.indexOf(bad[0].split(/[: ]/)[0]);
    if (i >= 0) {
      const [ref] = await refFrames(page, scene, size, [i / FPS]);
      const d = diffStats(decodePNG(pngs[i].data).data, ref);
      R.info(`first mismatch, frame ${i}: ${d.differing} px differ (max ${d.maxDiff})`);
    }
  }
}
