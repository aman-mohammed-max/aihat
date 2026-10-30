import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'docs/LIMITATIONS.md');
const markdown = readFileSync(file, 'utf8');
const headings = [
  'Resolved limitations',
  'Verified supported features',
  'Partially supported features',
  'Known remaining limitations',
  'Platform-specific restrictions',
  'LLM engine limitations',
  'Model format limitations',
  'Marketplace limitations',
  'Device and hardware limitations',
  'Build and CI limitations',
  'Required physical-device tests',
];
for (const heading of headings) assert.match(markdown, new RegExp(`^#{2,3} ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), `Missing limitations heading: ${heading}`);
for (const status of ['FIXED', 'VERIFIED', 'PARTIAL', 'OPEN', 'NOT TESTED']) {
  assert.ok(markdown.includes(status), `Missing limitation status: ${status}`);
}

for (const [, target] of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
  if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
  const localTarget = decodeURIComponent(target.split('#', 1)[0]);
  if (!localTarget) continue;
  assert.ok(existsSync(path.resolve(path.dirname(file), localTarget)), `Broken local link in LIMITATIONS.md: ${target}`);
}

console.log('LIMITATIONS.md headings, statuses, and local links are valid.');
