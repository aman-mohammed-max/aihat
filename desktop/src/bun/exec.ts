/**
 * Runs a skill's command on the computer for the desktop app: real Python and Node (or the Bun this app runs on)
 * in a fresh temporary folder, with a minimal environment (none of the app's own variables or keys), a time limit
 * that stops the whole process tree, and the files the command made or changed sent back.
 *
 * The phone runs the same jobs in a sandboxed WebAssembly runtime; here the command runs as you, so the app asks
 * before each run unless you turn that off.
 */
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, relative, sep } from 'node:path';

export type ExecJob = {
  command: string;
  skill?: string;
  /** Path → base64. */
  skillFiles?: Record<string, string>;
  files?: Record<string, string>;
  timeoutMs?: number;
};
export type ExecResult = { stdout: string; stderr: string; exitCode: number; outputFiles: Record<string, string>; skipped: string[]; durationMs: number };

const MAX_OUT = 64 * 1024;
const MAX_FILE = 20 * 1024 * 1024;
const WIN = process.platform === 'win32';

type Tool = { path: string; version: string } | null;
let tools: Promise<{ python: Tool; node: Tool }> | null = null;

async function probe(cmd: string[]): Promise<string | null> {
  try {
    const p = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore', env: minimalEnv(tmpdir()) });
    const timer = setTimeout(() => p.kill(), 5000);
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    clearTimeout(timer);
    // macOS ships a "python3" that only offers to install developer tools; Windows has a Store shortcut that prints nothing.
    const v = (out + err).trim();
    return code === 0 && /\d+\.\d+/.test(v) ? v.split('\n')[0] : null;
  } catch {
    return null;
  }
}

/** Which Python and Node this computer has (checked once per launch). */
export function findTools() {
  tools ??= (async () => {
    let python: Tool = null;
    for (const c of WIN ? ['py', 'python', 'python3'] : ['python3', 'python']) {
      const p = Bun.which(c);
      if (!p) continue;
      const v = await probe(WIN && c === 'py' ? [p, '-3', '--version'] : [p, '--version']);
      if (v) {
        python = { path: WIN && c === 'py' ? `${p}" -3 "` : p, version: v.replace(/^Python\s*/i, '') };
        break;
      }
    }
    let node: Tool = null;
    const n = Bun.which('node');
    const nv = n ? await probe([n, '--version']) : null;
    if (n && nv) node = { path: n, version: nv.replace(/^v/, '') };
    return { python, node };
  })();
  return tools;
}

export function minimalEnv(home: string): Record<string, string> {
  const keep = WIN ? ['PATH', 'SYSTEMROOT', 'SYSTEMDRIVE', 'COMSPEC', 'PATHEXT', 'WINDIR', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS'] : ['PATH', 'LANG', 'LC_ALL', 'TZ'];
  const env: Record<string, string> = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k]!;
  return { ...env, HOME: home, USERPROFILE: home, TMPDIR: home, TEMP: home, TMP: home, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1', NO_COLOR: '1' };
}

function walk(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function place(root: string, rel: string, b64: string) {
  const p = normalize(join(root, rel));
  if (!p.startsWith(root + sep)) return;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, Buffer.from(b64, 'base64'));
}

const cap = (s: string) => (s.length > MAX_OUT ? `${s.slice(0, MAX_OUT)}\n[… ${s.length - MAX_OUT} more characters cut]` : s);

async function killTree(pid: number) {
  if (WIN) {
    Bun.spawnSync(['taskkill', '/pid', String(pid), '/T', '/F'], { stdout: 'ignore', stderr: 'ignore' });
    return;
  }
  const kids = Bun.spawnSync(['pgrep', '-P', String(pid)], { stdout: 'pipe', stderr: 'ignore' }).stdout.toString().split('\n').filter(Boolean);
  for (const k of kids) await killTree(Number(k));
  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
}

const running = new Map<string, { kill: () => Promise<void> }>();

/** Stop a job that is running (the user tapped Stop, or the chat was stopped). */
export async function cancelExec(id: string) {
  await running.get(id)?.kill();
}

export async function runExec(id: string, job: ExecJob): Promise<ExecResult> {
  const started = Date.now();
  const { python, node } = await findTools();
  const base = mkdtempSync(join(tmpdir(), 'aihat-run-'));
  const work = join(base, 'work');
  const skillDir = job.skill ? join(base, 'skills', job.skill.replace(/[^\w.-]+/g, '-')) : '';
  mkdirSync(work, { recursive: true });
  try {
    for (const [p, b] of Object.entries(job.skillFiles ?? {})) {
      place(skillDir, p, b);
      // Also beside the inputs, so "python scripts/x.py" works from the working folder.
      place(work, p, b);
    }
    for (const [p, b] of Object.entries(job.files ?? {})) place(work, p, b);
    const before = new Map(walk(work).map((p) => [p, `${statSync(p).size}:${statSync(p).mtimeMs}`]));

    // The model writes commands for the phone's layout (/work, /skills/<name>) and Linux names (python3).
    let cmd = job.command.replaceAll('/skills/' + (job.skill ?? ''), skillDir || '/skills/').replace(/(^|[\s"'=])\/work(?=\/|\s|$|["'])/g, `$1${work}`);
    const at = (re: RegExp, to: string) => (cmd = cmd.replace(re, `$1${to}`));
    if (python) at(/(^|&&|\|\||;|\|)\s*python3?(?=\s)/g, ` "${python.path}"`);
    // No Node? The Bun this app runs on runs Node scripts too.
    at(/(^|&&|\|\||;|\|)\s*node(?=\s)/g, ` "${node?.path ?? process.execPath}"`);
    const env = { ...minimalEnv(work), SKILL_DIR: skillDir, ...(node ? {} : { BUN_BE_BUN: '1' }) };
    const argv = WIN ? ['cmd.exe', '/d', '/s', '/c', `"${cmd}"`] : ['/bin/sh', '-c', cmd];
    const proc = Bun.spawn(argv, { cwd: work, env, stdout: 'pipe', stderr: 'pipe', stdin: 'ignore', windowsVerbatimArguments: true } as never);
    let stopped: 'timeout' | 'cancel' | null = null;
    const kill = async (why: 'timeout' | 'cancel') => {
      if (stopped) return;
      stopped = why;
      await killTree(proc.pid);
    };
    running.set(id, { kill: () => kill('cancel') });
    const timer = setTimeout(() => void kill('timeout'), Math.min(job.timeoutMs ?? 60_000, 10 * 60_000));
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    clearTimeout(timer);
    running.delete(id);

    const outputFiles: Record<string, string> = {};
    const skipped: string[] = [];
    for (const p of walk(work)) {
      const s = statSync(p);
      if (before.get(p) === `${s.size}:${s.mtimeMs}`) continue;
      const rel = relative(work, p).split(sep).join('/');
      if (s.size > MAX_FILE) skipped.push(`${rel} (${Math.round(s.size / 1048576)} MB, too large)`);
      else outputFiles[rel] = readFileSync(p).toString('base64');
    }
    const note = stopped === 'timeout' ? `Stopped: the command ran longer than ${Math.round((job.timeoutMs ?? 60_000) / 1000)} seconds.\n` : stopped === 'cancel' ? 'Stopped by you.\n' : '';
    const missing = /python3?:? (command )?not found|is not recognized as an internal or external command/i.test(err) && !python
      ? '\nPython is not installed on this computer. Install it from python.org (Windows: also tick "Add python.exe to PATH"), then restart AI Hat.\n'
      : '';
    return {
      stdout: cap(out),
      stderr: cap(err + missing + note),
      exitCode: stopped === 'timeout' ? 124 : stopped === 'cancel' ? 130 : code,
      outputFiles,
      skipped,
      durationMs: Date.now() - started,
    };
  } finally {
    running.delete(id);
    rmSync(base, { recursive: true, force: true });
  }
}
