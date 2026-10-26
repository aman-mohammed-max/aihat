import { describe, expect, test } from 'bun:test';

import { findTools, runExec } from '../src/bun/exec';

const b64 = (s: string) => Buffer.from(s).toString('base64');

describe('skill commands on the computer', async () => {
  const { python } = await findTools();

  test.if(!!python)('runs Python and returns the files it made', async () => {
    const r = await runExec('a', { command: 'python3 make.py out.txt && echo done', files: { 'make.py': b64('import sys\nopen(sys.argv[1], "w").write("hi")\nprint("made")') } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('made');
    expect(r.stdout).toContain('done');
    expect(Object.keys(r.outputFiles)).toEqual(['out.txt']);
    expect(Buffer.from(r.outputFiles['out.txt'], 'base64').toString()).toBe('hi');
  });

  test.if(!!python)('finds skill scripts by the phone-style path, and keeps the app’s variables out', async () => {
    process.env.AIHAT_TEST_SECRET = 'nope';
    const r = await runExec('b', { command: 'python3 /skills/demo/scripts/env.py', skill: 'demo', skillFiles: { 'scripts/env.py': b64('import os\nprint(os.environ.get("AIHAT_TEST_SECRET", "clean"))') } });
    expect(r.stdout.trim()).toBe('clean');
  });

  test.if(!!python)('stops a runaway command with exit code 124', async () => {
    const r = await runExec('c', { command: 'python3 -c "while True: pass"', timeoutMs: 1500 });
    expect(r.exitCode).toBe(124);
    expect(r.durationMs).toBeLessThan(6000);
  });

  test('runs a Node script (with Bun when Node is missing)', async () => {
    const r = await runExec('d', { command: 'node hi.js', files: { 'hi.js': b64('require("fs").writeFileSync("n.txt", "ok"); console.log("node ok")') } });
    expect(r.stdout).toContain('node ok');
    expect(Object.keys(r.outputFiles)).toEqual(['n.txt']);
  });
});
