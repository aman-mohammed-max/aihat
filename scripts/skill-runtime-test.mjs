#!/usr/bin/env node
// Runs the skill engine's self-tests in Node with the real Pyodide and libraries (the same files the phone downloads):
//   node scripts/skill-runtime-manifest.mjs <cacheDir>   (once, downloads the files)
//   node scripts/skill-runtime-test.mjs <cacheDir>
// The timeout and network tests need the phone's Web Worker sandbox, so they run only on a device.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const cache = resolve(process.argv[2] || '.skill-runtime-cache');
const manifest = JSON.parse(readFileSync(new URL('../src/skill-exec/runtime.json', import.meta.url), 'utf8'));
const tests = JSON.parse(readFileSync(new URL('../src/skill-exec/selftests.json', import.meta.url), 'utf8'));
const { createSkillEngine } = require('../src/skill-exec/engine/engine.js');
const { check } = require('../src/skill-exec/engine/check.js');

globalThis.self = globalThis;
const t0 = performance.now();
const { loadPyodide } = require(join(cache, 'pyodide.js'));
const pyodide = await loadPyodide({ indexURL: cache + '/' });
const coldStart = performance.now() - t0;

const engine = createSkillEngine({
  pyodide,
  needs: manifest.needs,
  bundled: manifest.bundled,
  installWheels: (py) => py.loadPackage(manifest.files.filter((f) => f.kind === 'wheel').map((f) => join(cache, f.name)), { messageCallback() {} }),
  loadJsLib: async (name) => {
    const f = manifest.files.find((x) => x.kind === 'js' && x.lib === name);
    // Like the phone's Web Worker: no Node "process", so libraries take their browser paths.
    const src = readFileSync(join(cache, f.name), 'utf8');
    const load = vm.runInThisContext(`(function (process, require, module, exports) {\n${src}\n;return typeof ${f.global} !== 'undefined' ? ${f.global} : self.${f.global};\n})`, { filename: f.name });
    return load(undefined, undefined, undefined, undefined);
  },
});

const enc = new TextEncoder();
let failed = 0;
console.log(`Pyodide ${manifest.pyodide} started in ${(coldStart / 1000).toFixed(1)} s\n`);
for (const t of tests) {
  if (t.where === 'device') {
    console.log(`SKIP  ${t.title} (needs the phone's sandbox)`);
    continue;
  }
  const files = Object.fromEntries(Object.entries(t.files).map(([k, v]) => [k, enc.encode(v)]));
  const start = performance.now();
  const r = await engine.run({ command: t.command, files });
  const ms = performance.now() - start;
  const problems = check(t, r);
  if (problems.length) failed++;
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${t.title}  ${(ms / 1000).toFixed(2)} s  exit ${r.exitCode}  files: ${Object.keys(r.outputFiles).join(', ') || '-'}`);
  if (problems.length) console.log('      ' + problems.join('\n      ') + `\n      stdout: ${r.stdout.slice(0, 600)}\n      stderr: ${r.stderr.slice(0, 1500)}`);
}
console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
