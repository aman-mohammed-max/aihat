import type { Skill } from '@/store/library';

export type SkillMd = { name?: string; description?: string; body: string; meta: Record<string, string> };

const unquote = (v: string) => v.replace(/^(["'])([\s\S]*)\1$/, '$2');

/**
 * Reads a SKILL.md: YAML front matter between `---` lines (name, description and other simple keys, including
 * quoted values and `>` / `|` blocks), then the Markdown instructions. Anything without front matter is all body.
 */
export function parseSkillMd(raw: string): SkillMd {
  const md = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = md.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/);
  if (!m) return { body: md.trim(), meta: {} };

  const meta: Record<string, string> = {};
  const lines = m[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_][\w-]*):[ \t]*(.*)$/);
    if (!kv) continue;
    const [, key, rest] = kv;
    // Everything indented under the key (or blank) continues its value.
    const cont: string[] = [];
    while (i + 1 < lines.length && (/^[ \t]/.test(lines[i + 1]) || lines[i + 1].trim() === '')) cont.push(lines[++i]);
    const block = rest.match(/^([>|])[+-]?\d*$/);
    if (block) {
      const text = cont.map((l) => l.replace(/^[ \t]+/, ''));
      meta[key] = (block[1] === '>' ? text.join(' ').replace(/\s+/g, ' ') : text.join('\n')).trim();
    } else {
      meta[key] = unquote([rest, ...cont.map((l) => l.trim())].join(' ').trim());
    }
  }
  return { name: meta.name || undefined, description: meta.description || undefined, body: m[2].trim(), meta };
}

/** `Commit Writer!` → `commit-writer`: the text typed after the slash to use a skill. */
export const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/**
 * One slash-command name per skill (or per MCP server, with prefix `mcp`). A name already used by a command (built-in or the user's own) becomes
 * `skill-<name>`; two skills with the same name get -2, -3… so each one stays reachable.
 */
export function skillCommandNames(skills: Pick<Skill, 'id' | 'name'>[], taken: Set<string>, prefix = 'skill') {
  const mine = new Set<string>();
  const out = new Map<string, string>();
  for (const s of skills) {
    const base = slugify(s.name) || prefix;
    const root = taken.has(base) ? `${prefix}-${base}` : base;
    let name = root;
    for (let n = 2; taken.has(name) || mine.has(name); n++) name = `${root}-${n}`;
    mine.add(name);
    out.set(s.id, name);
  }
  return out;
}

/** A skill's file path as the model may give it: no leading `./` or `/`, no `..`. Empty when it isn't usable. */
export function normPath(p: string) {
  const parts = p.trim().replace(/\\/g, '/').split('/').filter((x) => x && x !== '.');
  return parts.some((x) => x === '..') ? '' : parts.join('/');
}

/** File names that are programs. A skill's scripts are kept as text for the assistant to read; the app never runs them. */
export const SCRIPT_FILE = /\.(py|sh|bash|zsh|js|mjs|cjs|ts|rb|php|pl|lua|go|rs|java|kt|swift|c|cpp|cs|sql|r)$/i;

/** A file size as the design writes it: 268 B, 11.9 kB. */
export const fileSize = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} kB` : `${n} B`);

/** Where a skill came from, for the line under its name: from GitHub, from vercel.com, written here. */
export const sourceLabel = (source: string) => (source === 'local' || !source ? 'written here' : source.startsWith('github.com/') ? 'from GitHub' : `from ${source.split('/')[0]}`);

/** The list of a skill's extra files, written for the model. */
export function fileNote(files: { path: string; size: number }[]) {
  if (!files.length) return '';
  const shown = files.slice(0, 80).map((f) => `- ${f.path} (${f.size.toLocaleString('en-US')} characters)`);
  return `\n\nFiles that belong to this skill. Open one with the read_skill_file tool (give the skill name and the path):\n${shown.join('\n')}${files.length > 80 ? `\n- … and ${files.length - 80} more` : ''}`;
}

/** The skills block that goes into the system prompt: a short menu, because the full text is loaded on demand. */
export function skillMenu(skills: Pick<Skill, 'name' | 'description'>[]) {
  if (!skills.length) return '';
  const one = (s: Pick<Skill, 'name' | 'description'>) => `- ${s.name}: ${s.description.replace(/\s+/g, ' ').slice(0, 280)}`;
  return `You have skills: packaged instructions for particular kinds of task. When the user's request matches one, call the use_skill tool with its exact name, read what it returns, then follow it. Do not load a skill that is not relevant.\n${skills.map(one).join('\n')}`;
}
