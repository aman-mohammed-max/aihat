/**
 * The "execute" tool the model gets when skill scripts are on: one command line, run with a skill's files mounted and
 * the chat's attached files in the working folder. Files the command makes come back to the chat.
 */
import { isDesktop } from '@/lib/device';
import { readBytes } from '@/lib/files';
import { uid } from '@/lib/id';
import { fileSize } from '@/lib/skills';
import type { Attachment } from '@/store/chats';
import { useLibrary, type Skill } from '@/store/library';

import { b64ToBytes } from './b64';
import { keepOutput } from './outputs';
import { executor } from './runtime';
import manifest from './runtime.json';

export const EXECUTE = 'execute';
const MAX_INPUT = 20 * 1024 * 1024;
const MAX_INPUTS = 50 * 1024 * 1024;
const MAX_TEXT = 8000;

/** The tool, described for where it runs. */
export function executeTool(skills: string[]) {
  const where = isDesktop
    ? 'on the user’s computer with its own python3 and node (a temporary folder, no access to the app’s keys).'
    : `in a sandbox on the user’s phone: Python ${manifest.python} (Pyodide) and a Node-style runner, with no internet. Bundled Python packages: ${manifest.bundled.join(', ')}. Node scripts can require fs, path, pptxgenjs, docx and pdf-lib. Not available: soffice/LibreOffice, pandoc, ffmpeg, a browser, git, pip/npm downloads.`;
  return {
    type: 'function' as const,
    function: {
      name: EXECUTE,
      description: `Run one command line ${where} Layout: /work is the working folder; the user's attached files are in it, and every file you create or change there is given to the user. A skill's files are at /skills/<name> (also copied into /work on a computer). Supports python3 file.py / python3 -c, node file.js, and simple commands (ls, cat, cp, mv, rm, mkdir, echo, &&, >). Time limit 60 s.`,
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The command line, e.g. python3 /skills/docx/scripts/make.py report.docx' },
          skill: { type: 'string', description: `The skill whose files to mount, if any.${skills.length ? ` One of: ${skills.join(', ')}.` : ''}` },
        },
        required: ['command'],
      },
    },
  };
}

async function inputBytes(a: Attachment) {
  if (a.uri.startsWith('data:')) return b64ToBytes(a.uri.slice(a.uri.indexOf(',') + 1));
  return readBytes(a.uri);
}

export type ExecuteOutcome = { forModel: string; summary: string; ok: boolean; files: Attachment[] };

/** Run the model's command for a chat. `inputs` are the files attached in the chat so far. */
export async function runForChat(args: { command?: unknown; skill?: unknown }, skills: Skill[], inputs: Attachment[], signal?: AbortSignal): Promise<ExecuteOutcome> {
  const command = String(args.command ?? '').trim();
  if (!command) return { forModel: 'Error: no command given.', summary: 'No command', ok: false, files: [] };
  const wanted = String(args.skill ?? '').trim().toLowerCase();
  const skill = wanted ? skills.find((s) => s.name.toLowerCase() === wanted) : undefined;
  if (wanted && !skill) return { forModel: `Error: there is no skill called "${args.skill}". Skills: ${skills.map((s) => s.name).join(', ') || 'none'}.`, summary: 'Unknown skill', ok: false, files: [] };

  const skillFiles: Record<string, string> = {};
  if (skill) {
    skillFiles['SKILL.md'] = skill.body;
    const lib = useLibrary.getState();
    for (const f of await lib.skillFiles(skill.id)) {
      const text = await lib.readSkillFile(skill.id, f.path);
      if (text != null) skillFiles[f.path] = text;
    }
  }
  const files: Record<string, Uint8Array> = {};
  let total = 0;
  const skippedInputs: string[] = [];
  for (const a of inputs) {
    if (a.inline || !a.uri || files[a.name]) continue;
    try {
      const b = await inputBytes(a);
      if (b.length > MAX_INPUT || total + b.length > MAX_INPUTS) {
        skippedInputs.push(a.name);
        continue;
      }
      files[a.name.replace(/[/\\]+/g, '_')] = b;
      total += b.length;
    } catch {
      skippedInputs.push(a.name);
    }
  }

  const r = await executor.run({ command, skill: skill?.name, skillFiles, files, timeoutMs: 60_000 }, signal);
  const made: Attachment[] = Object.entries(r.outputFiles).map(([name, bytes]) => {
    const image = /\.(png|jpe?g|gif|webp)$/i.test(name);
    return { id: uid(), kind: image ? 'image' : 'file', name: name.split('/').pop() || name, uri: keepOutput(name, bytes), meta: `${fileSize(bytes.length)} · made by a script` };
  });
  const cut = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}\n[… ${s.length - MAX_TEXT} more characters]` : s);
  const forModel = [
    `exit code: ${r.exitCode}${r.exitCode === 124 ? ' (stopped: time limit)' : r.exitCode === 130 ? ' (stopped by the user)' : r.exitCode === 127 ? ' (program not available here)' : ''}`,
    r.stdout ? `stdout:\n${cut(r.stdout)}` : 'stdout: (empty)',
    r.stderr ? `stderr:\n${cut(r.stderr)}` : '',
    made.length ? `files made (already given to the user in the chat): ${Object.entries(r.outputFiles).map(([n, b]) => `${n} (${fileSize(b.length)})`).join(', ')}` : 'files made: none',
    r.skipped.length ? `too large to bring back: ${r.skipped.join(', ')}` : '',
    skippedInputs.length ? `not copied in (too large or unreadable): ${skippedInputs.join(', ')}` : '',
  ].filter(Boolean).join('\n');
  const summary = r.exitCode === 0 ? `Done in ${(r.durationMs / 1000).toFixed(1)} s${made.length ? ` · ${made.length} file${made.length === 1 ? '' : 's'}` : ''}` : `Exit code ${r.exitCode}`;
  return { forModel, summary, ok: r.exitCode === 0, files: made };
}
