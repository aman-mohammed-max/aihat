import { getDb } from '@/db';
import { useLibrary } from '@/store/library';

import { loadSkillFiles, skillMdAt } from './market';
import { parseSkillMd } from './skills';

const KEY = 'skillsCheckedAt';
const DAY = 86_400_000;

/** `github.com/owner/repo/folder` (how a skill from GitHub records where it came from) → the repository and folder. */
export function githubSource(source: string): { repo: string; dir: string } | null {
  const m = source.match(/^github\.com\/([\w.-]+)\/([\w.-]+)(?:\/(.+))?$/);
  return m ? { repo: `${m[1]}/${m[2]}`, dir: m[3] ?? '' } : null;
}

/** Once a day, re-read the skills set to follow their Git source and save the ones that changed. Returns how many changed. */
export async function updateSkillsIfDue(force = false): Promise<number> {
  const skills = useLibrary.getState().skills.filter((s) => s.autoUpdate && githubSource(s.source));
  if (!skills.length) return 0;
  const db = await getDb();
  const last = Number((await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key=?', KEY))?.value ?? 0);
  if (!force && Date.now() - last < DAY) return 0;
  await db.runAsync('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)', KEY, String(Date.now()));
  let changed = 0;
  for (const s of skills) {
    const { repo, dir } = githubSource(s.source)!;
    const md = await skillMdAt(repo, dir);
    if (!md) continue;
    const parsed = parseSkillMd(md);
    if (parsed.body === s.body && (parsed.meta.version ?? s.version) === s.version) continue;
    const id = await useLibrary.getState().saveSkill({ ...s, body: parsed.body, description: parsed.description ?? s.description, version: parsed.meta.version || s.version });
    const { files } = await loadSkillFiles(repo, dir, parsed.body).catch(() => ({ files: null }));
    if (files) await useLibrary.getState().saveSkillFiles(id, files.map((f) => ({ path: f.path, content: f.content })));
    changed++;
  }
  return changed;
}
