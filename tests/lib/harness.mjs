/* Shared harness for TYPOMAN's browser tests (export.mjs, embed.mjs, sweep.mjs).
 *
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs   use that Playwright instead of the `playwright` package
 *   TYPOMAN_ROOT=/path/to/site                        serve another checkout
 *
 * A static server for the repo (any number of origins, each on its own port, with optional
 * in-memory routes), a Playwright loader, console-error capture and a small check reporter.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const ROOT = path.resolve(process.env.TYPOMAN_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));

export async function loadChromium() {
  const mod = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  return mod.chromium || (mod.default && mod.default.chromium);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain',
};

/**
 * Serve `root` on 127.0.0.1 (a fresh port per call, so two calls give two origins).
 * routes: { '/path': string | { body, type } } served from memory before the file system.
 * No CORS headers are sent: embeds must work cross-origin without them.
 * Resolves { origin, url(p), routes, requests, close() }; `requests` logs every path served.
 */
export async function serve(root = ROOT, { routes = {} } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    requests.push(url.pathname);
    const route = routes[url.pathname];
    if (route != null) {
      const r = typeof route === 'string' ? { body: route, type: TYPES[path.extname(url.pathname)] || TYPES['.html'] } : route;
      res.writeHead(200, { 'content-type': r.type || TYPES['.html'], 'cache-control': 'no-store' }).end(r.body);
      return;
    }
    if (url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    let file = path.join(root, decodeURIComponent(url.pathname));
    const rel = path.relative(root, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    routes,
    requests,
    url: (p = '/') => origin + (p.startsWith('/') ? p : '/' + p),
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

/** A blank page that boots the engine (and optionally the export module) without the studio UI. */
export const harnessPage = (groups = 'engine,presets,export') =>
  `<!doctype html><html><head><meta charset="utf-8"><title>TYPOMAN test harness</title></head><body>` +
  `<script src="/js/boot.js" data-groups="${groups}"></script></body></html>`;

/** Open the harness on `server` (boot groups as in js/boot.js) and wait for TM_READY. */
export async function openHarness(context, server, { log, groups = 'engine,presets,export' } = {}) {
  const p = `/__harness-${groups.replace(/[^a-z]+/g, '-')}.html`;
  if (!server.routes[p]) server.routes[p] = harnessPage(groups);
  const page = await context.newPage();
  if (log) log.watch(page, 'harness');
  await page.goto(server.url(p), { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.TM_READY, null, { timeout: 20000 });
  await page.evaluate(() => window.TM_READY);
  return page;
}

/** Console errors and uncaught exceptions from every page and frame we watch. */
export class ConsoleLog {
  constructor() { this.errors = []; this.warnings = []; }
  watch(page, label) {
    page.on('console', (m) => {
      const where = label + (m.location && m.location().url ? ' ' + shortUrl(m.location().url) : '');
      if (m.type() === 'error') this.errors.push(`[${where}] ${m.text()}`);
      else if (m.type() === 'warning') this.warnings.push(`[${where}] ${m.text()}`);
    });
    page.on('pageerror', (e) => this.errors.push(`[${label}] uncaught: ${e.message}`));
    return page;
  }
  /** Errors since mark(), ignoring favicon noise. */
  since(mark = 0) { return this.errors.slice(mark).filter((e) => !/favicon/i.test(e)); }
  mark() { return this.errors.length; }
}
const shortUrl = (u) => u.replace(/^https?:\/\/127\.0\.0\.1:\d+/, '').replace(/#.*$/, '').slice(0, 80);

/** Resolve after n animation frames of `target` (a Page or Frame): a frame-count wait, not a sleep. */
export function frames(target, n = 2) {
  return target.evaluate((n) => new Promise((resolve) => {
    let k = 0;
    const step = () => (++k >= n ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);
}

/** Is `bin` on PATH? */
export function which(bin) {
  const r = spawnSync(bin, ['-version'], { stdio: 'ignore' });
  return !r.error;
}

/**
 * Check reporter. Every assertion prints one line; finish() prints the failures again and sets
 * the exit code. known(id, …) marks an open, already-reported bug: it prints loudly but doesn't
 * fail the run (TYPOMAN_STRICT=1 makes it fail), and says so when the bug looks fixed.
 */
export class Report {
  constructor(title) {
    this.title = title;
    this.fails = [];
    this.warns = [];
    this.knownOpen = [];
    this.knownFixed = [];
    this.skips = [];
    this.passes = 0;
    this.t0 = Date.now();
    console.log(`\n${title}\n${'─'.repeat(title.length)}`);
  }
  section(name) { console.log(`\n${name}`); }
  info(msg) { console.log('  · ' + msg); }
  check(name, ok, detail = '') {
    if (ok) { this.passes++; console.log(`  ok    ${name}${detail ? '  (' + detail + ')' : ''}`); }
    else { this.fails.push(`${name}${detail ? ': ' + detail : ''}`); console.log(`  FAIL  ${name}${detail ? '  (' + detail + ')' : ''}`); }
    return !!ok;
  }
  warn(name, detail = '') { this.warns.push(`${name}${detail ? ': ' + detail : ''}`); console.log(`  warn  ${name}${detail ? '  (' + detail + ')' : ''}`); }
  skip(name, why) { this.skips.push(`${name}: ${why}`); console.log(`  skip  ${name}  (${why})`); }
  known(id, name, ok, detail = '') {
    if (ok) { this.knownFixed.push(`${id} ${name}`); console.log(`  ok    ${name}  (known issue ${id} looks fixed: drop it from the known list)`); return true; }
    if (process.env.TYPOMAN_STRICT === '1') return this.check(`${name} [known ${id}]`, false, detail);
    this.knownOpen.push(`${id} ${name}${detail ? ': ' + detail : ''}`);
    console.log(`  KNOWN ${name}  (${id}, not failing the run${detail ? '; ' + detail : ''})`);
    return false;
  }
  finish() {
    const s = ((Date.now() - this.t0) / 1000).toFixed(1);
    console.log(`\n${this.title}: ${this.passes} passed, ${this.fails.length} failed, ${this.knownOpen.length} known issue(s), ${this.skips.length} skipped, ${this.warns.length} warning(s) in ${s} s`);
    if (this.knownOpen.length) console.log('\nKnown issues (reported, not failing):\n  ' + this.knownOpen.join('\n  '));
    if (this.skips.length) console.log('\nSkipped:\n  ' + this.skips.join('\n  '));
    if (this.fails.length) {
      console.log('\nFAILED:\n  ' + this.fails.join('\n  '));
      process.exitCode = 1;
    }
    return this.fails.length === 0;
  }
}

/** Run main() with the browser and servers torn down however it ends. */
export async function run(main) {
  const cleanup = [];
  try {
    await main((fn) => cleanup.push(fn));
  } catch (e) {
    console.error('\nTEST CRASHED:', e && e.stack ? e.stack : e);
    process.exitCode = 1;
  } finally {
    for (const fn of cleanup.reverse()) { try { await fn(); } catch (e) { /* already closed */ } }
  }
}
