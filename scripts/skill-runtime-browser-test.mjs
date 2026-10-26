#!/usr/bin/env node
// Runs the skill engine's self-tests inside a real browser engine, the way phones run them: the hidden runner page
// (src/skill-exec/engine/embedded.ts) with its Web Worker, the downloaded files copied in over postMessage, no network.
// Chromium is the engine of Android's WebView; WebKit is the engine of the iPhone's.
//   node scripts/skill-runtime-manifest.mjs <cacheDir>          (once: downloads the files)
//   npm i --no-save playwright-core && npx playwright-core install chromium webkit
//   node scripts/skill-runtime-browser-test.mjs <cacheDir> [chromium|webkit]

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const cache = resolve(process.argv[2] || '.skill-runtime-cache');
const engineName = process.argv[3] || 'chromium';
const pw = await import('playwright-core');
const root = new URL('..', import.meta.url).pathname;
const embedded = readFileSync(join(root, 'src/skill-exec/engine/embedded.ts'), 'utf8');
const HTML = JSON.parse(embedded.split('export const RUNNER_HTML = ')[1].trim().replace(/;$/, ''));
const manifest = JSON.parse(readFileSync(join(root, 'src/skill-exec/runtime.json'), 'utf8'));
const tests = JSON.parse(readFileSync(join(root, 'src/skill-exec/selftests.json'), 'utf8'));
const { check } = require(join(root, 'src/skill-exec/engine/check.js'));
const workerManifest = {
  needs: manifest.needs,
  bundled: manifest.bundled,
  wheels: manifest.files.filter((f) => f.kind === 'wheel').map((f) => f.name),
  js: Object.fromEntries(manifest.files.filter((f) => f.kind === 'js').map((f) => [f.lib, { file: f.name, global: f.global }])),
};

const browser = await pw[engineName].launch(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH, args: ['--no-sandbox'] } : {});
console.log(`${engineName} ${browser.version()}`);
const page = await browser.newPage();
const waiters = [];
const logs = [];
page.on('console', (m) => logs.push(m.text()));
page.on('pageerror', (e) => logs.push(`page error: ${e.message}`));
await page.exposeFunction('__toNode', (s) => {
  const m = JSON.parse(s);
  for (const w of [...waiters]) if (w.test(m)) {
    waiters.splice(waiters.indexOf(w), 1);
    w.resolve(m);
  }
});
await page.addInitScript(() => {
  window.ReactNativeWebView = { postMessage: (s) => window.__toNode(s) };
});
// The page is served at the same made-up https address the app uses; anything else it asks for is a leak.
const PAGE = 'https://runtime.aihat.invalid/';
const leaks = [];
await page.route('**/*', (r) => {
  if (r.request().url() === PAGE) return r.fulfill({ contentType: 'text/html', body: HTML });
  leaks.push(r.request().url());
  return r.abort();
});
const wait = (test, ms = 180_000) =>
  new Promise((res, rej) => {
    const w = { test, resolve: res };
    waiters.push(w);
    setTimeout(() => rej(new Error(`no answer in ${ms / 1000} s\n${logs.slice(-15).join('\n')}`)), ms);
  });
const send = (m) => page.evaluate((s) => window.dispatchEvent(new MessageEvent('message', { data: s })), JSON.stringify(m));

const loaded = wait((m) => m.t === 'loaded');
await page.goto(PAGE);
await loaded;
let t0 = Date.now();
for (const f of manifest.files) {
  const b64 = readFileSync(join(cache, f.name)).toString('base64');
  const step = 699052; // 512 KB of bytes per message, like the app
  const n = Math.max(1, Math.ceil(b64.length / step));
  const done = wait((m) => (m.t === 'put-ok' || m.t === 'put-error') && m.name === f.name);
  for (let i = 0; i < n; i++) await send({ t: 'put', name: f.name, sha: f.sha256, i, n, data: b64.slice(i * step, (i + 1) * step) });
  const r = await done;
  if (r.t === 'put-error') throw new Error(`storing ${f.name}: ${r.error}`);
}
console.log(`copied the add-on into the page in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
t0 = Date.now();
const warm = wait((m) => m.t === 'warm');
await send({ t: 'warm', manifest: workerManifest });
const w = await warm;
if (w.error) {
  console.log(`Python didn't start: ${w.error}\n${logs.join('\n')}`);
  process.exit(1);
}
console.log(`Python started in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

let failed = 0;
const b64 = (s) => Buffer.from(s).toString('base64');
for (const [i, t] of tests.entries()) {
  const res = wait((m) => m.t === 'result' && m.id === `r${i}`, 300_000);
  const start = Date.now();
  await send({ t: 'run', id: `r${i}`, manifest: workerManifest, timeoutMs: t.timeoutMs, job: { command: t.command, files: Object.fromEntries(Object.entries(t.files).map(([k, v]) => [k, b64(v)])) } });
  const r = (await res).result;
  r.outputFiles = Object.fromEntries(Object.entries(r.outputFiles).map(([k, v]) => [k, Buffer.from(v, 'base64')]));
  const problems = check(t, r);
  if (problems.length) failed++;
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${t.title}  ${((Date.now() - start) / 1000).toFixed(2)} s  exit ${r.exitCode}  ${Object.keys(r.outputFiles).join(', ')}`);
  if (problems.length) console.log(`      ${problems.join('; ')}\n      stdout: ${r.stdout.slice(0, 400)}\n      stderr: ${r.stderr.slice(-1200)}`);
}
console.log(`\nrequests that tried to leave the page: ${leaks.length ? leaks.join(', ') : 'none'}`);
if (leaks.length) failed++;
console.log(failed ? `${failed} failed` : 'All passed');
await browser.close();
process.exit(failed ? 1 : 0);
