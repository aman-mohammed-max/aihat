#!/usr/bin/env node
// Writes src/skill-exec/runtime.json: every file the phone downloads for running skill scripts, pinned by version
// and SHA-256. Run it when updating Pyodide or a library:
//   node scripts/skill-runtime-manifest.mjs [cacheDir]
// The files are downloaded once into cacheDir (to measure and check them); the app downloads them itself later.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PYODIDE = '314.0.7';
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE}/full/`;
const CORE = ['pyodide.js', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
// Packages built for Pyodide (with their dependencies from the lock file).
const PYODIDE_PACKAGES = ['numpy', 'pandas', 'lxml', 'pillow', 'cryptography', 'charset-normalizer', 'typing-extensions'];
// Pure-Python wheels from PyPI, pinned.
const PYPI = {
  'python-docx': '1.2.0',
  'python-pptx': '1.0.2',
  XlsxWriter: '3.3.0',
  openpyxl: '3.1.5',
  et_xmlfile: '2.0.0',
  pypdf: '6.21.2',
  defusedxml: '0.7.1',
  'pdfminer.six': '20260107',
  pdfplumber: '0.11.10',
};
// Browser builds of the Node libraries skills use.
const JS = {
  pptxgenjs: { version: '4.0.1', path: '/dist/pptxgen.bundle.js', global: 'PptxGenJS' },
  docx: { version: '9.14.0', path: '/dist/index.iife.js', global: 'docx' },
  'pdf-lib': { version: '1.17.1', path: '/dist/pdf-lib.min.js', global: 'PDFLib' },
};
// Import name → Pyodide packages the bundled wheels need before they import.
const NEEDS = {
  docx: ['lxml', 'typing-extensions'],
  pptx: ['lxml', 'pillow', 'typing-extensions'],
  pdfminer: ['cryptography', 'charset-normalizer'],
  pdfplumber: ['cryptography', 'charset-normalizer', 'pillow'],
  PIL: ['pillow'],
  lxml: ['lxml'],
  numpy: ['numpy'],
  pandas: ['pandas'],
};

const cache = process.argv[2] || join(process.cwd(), '.skill-runtime-cache');
mkdirSync(cache, { recursive: true });

async function get(url, name) {
  const p = join(cache, name);
  if (!existsSync(p)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  }
  const bytes = readFileSync(p);
  return { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

const files = [];
async function add(kind, name, url, extra = {}, expect) {
  const { size, sha256 } = await get(url, name);
  if (expect && expect !== sha256) throw new Error(`${name}: checksum ${sha256} doesn't match the published ${expect}`);
  files.push({ name, kind, url, size, sha256, ...extra });
  console.log(kind.padEnd(8), (size / 1048576).toFixed(2).padStart(6), 'MB', name);
}

for (const f of CORE) await add('core', f, CDN + f);
const lock = JSON.parse(readFileSync(join(cache, 'pyodide-lock.json'), 'utf8')).packages;
const seen = new Set();
const stack = [...PYODIDE_PACKAGES];
while (stack.length) {
  const n = stack.pop();
  if (seen.has(n)) continue;
  if (!lock[n]) throw new Error(`${n} is not in Pyodide ${PYODIDE}`);
  seen.add(n);
  stack.push(...(lock[n].depends ?? []));
}
for (const n of [...seen].sort()) await add('pyodide', lock[n].file_name, CDN + lock[n].file_name, { package: n }, lock[n].sha256);
for (const [n, v] of Object.entries(PYPI)) {
  const info = await (await fetch(`https://pypi.org/pypi/${n}/${v}/json`)).json();
  const w = info.urls.find((u) => u.packagetype === 'bdist_wheel' && u.filename.endsWith('-none-any.whl'));
  if (!w) throw new Error(`${n} ${v} has no pure-Python wheel`);
  await add('wheel', w.filename, w.url, { package: n }, w.digests.sha256);
}
for (const [n, j] of Object.entries(JS)) {
  await add('js', `${n}.js`, `https://cdn.jsdelivr.net/npm/${n}@${j.version}${j.path}`, { lib: n, global: j.global, version: j.version });
}

const total = files.reduce((s, f) => s + f.size, 0);
const out = {
  pyodide: PYODIDE,
  python: '3.14',
  totalBytes: total,
  files,
  needs: NEEDS,
  bundled: [...[...seen].filter((n) => !['cffi', 'pycparser', 'six', 'pytz', 'python-dateutil'].includes(n)), ...Object.keys(PYPI)].sort((a, b) => a.localeCompare(b)),
};
writeFileSync(new URL('../src/skill-exec/runtime.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`\n${files.length} files, ${(total / 1048576).toFixed(1)} MB → src/skill-exec/runtime.json`);
