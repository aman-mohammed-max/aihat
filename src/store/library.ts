import { create } from 'zustand';

import { getDb, json } from '@/db';
import { now, uid } from '@/lib/id';

export type SystemPrompt = {
  id: string; name: string; body: string; tags: string[]; favorite: boolean;
  preferredModelId: string | null; toolIds: string[]; variables: { key: string; value: string }[];
};
export type Skill = {
  id: string; name: string; description: string; version: string; source: string; body: string;
  mode: 'auto' | 'always' | 'onAsk'; enabled: boolean; canRunScripts: boolean;
  /** Re-read from its Git source once a day and saved when it changed. */
  autoUpdate: boolean;
  /** Extra files that came with the skill (references, templates, scripts), kept as text. Counted when the library loads. */
  fileCount: number; fileBytes: number;
};
export type SkillFile = { path: string; size: number };
export type McpTool = { name: string; description?: string; kind: 'read' | 'write' | 'delete'; policy: 'auto' | 'ask' | 'off'; schema?: object };
export type McpServer = {
  id: string; name: string; url: string; transport: 'http' | 'sse'; auth: 'none' | 'token' | 'oauth';
  tools: McpTool[]; enabledByDefault: boolean; isConnector: boolean; connected: boolean;
  /** Header that carries the token when it isn't `Authorization` (for example `X-API-Key`). */
  authHeader?: string | null;
  /** How the token is written in that header, with `{token}` standing for it. Default `Bearer {token}`. */
  authTemplate?: string | null;
};

type State = {
  prompts: SystemPrompt[]; skills: Skill[]; servers: McpServer[];
  load: () => Promise<void>;
  savePrompt: (p: Partial<SystemPrompt> & { name: string; body: string }) => Promise<string>;
  deletePrompt: (id: string) => Promise<void>;
  saveSkill: (s: Partial<Skill> & { name: string }) => Promise<string>;
  deleteSkill: (id: string) => Promise<void>;
  /** Replace all of a skill's extra files. */
  saveSkillFiles: (skillId: string, files: { path: string; content: string }[]) => Promise<void>;
  skillFiles: (skillId: string) => Promise<SkillFile[]>;
  readSkillFile: (skillId: string, path: string) => Promise<string | null>;
  saveServer: (s: Partial<McpServer> & { name: string; url: string }) => Promise<string>;
  deleteServer: (id: string) => Promise<void>;
};

export const useLibrary = create<State>((set, get) => ({
  prompts: [], skills: [], servers: [],

  async load() {
    const db = await getDb();
    const prompts = (await db.getAllAsync<any>('SELECT * FROM prompts ORDER BY favorite DESC, name')).map((r): SystemPrompt => ({
      id: r.id, name: r.name, body: r.body, tags: json(r.tags, []), favorite: !!r.favorite,
      preferredModelId: r.preferred_model_id, toolIds: json(r.tool_ids, []), variables: json(r.variables, []),
    }));
    const counts = new Map((await db.getAllAsync<any>('SELECT skill_id, COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes FROM skill_files GROUP BY skill_id')).map((r) => [r.skill_id as string, r]));
    const skills = (await db.getAllAsync<any>('SELECT * FROM skills ORDER BY name')).map((r): Skill => ({
      id: r.id, name: r.name, description: r.description, version: r.version, source: r.source, body: r.body,
      mode: r.mode, enabled: !!r.enabled, canRunScripts: !!r.can_run_scripts, autoUpdate: !!r.auto_update,
      fileCount: counts.get(r.id)?.n ?? 0, fileBytes: counts.get(r.id)?.bytes ?? 0,
    }));
    const servers = (await db.getAllAsync<any>('SELECT * FROM mcp_servers ORDER BY name')).map((r): McpServer => ({
      id: r.id, name: r.name, url: r.url, transport: r.transport, auth: r.auth, tools: json(r.tools, []),
      enabledByDefault: !!r.enabled_by_default, isConnector: !!r.is_connector, connected: !!r.connected,
      authHeader: r.auth_header ?? null, authTemplate: r.auth_template ?? null,
    }));
    set({ prompts, skills, servers });
  },

  async savePrompt(p) {
    const db = await getDb();
    const id = p.id ?? uid();
    await db.runAsync(
      `INSERT INTO prompts (id,name,body,tags,favorite,preferred_model_id,tool_ids,variables,updated_at) VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, body=excluded.body, tags=excluded.tags, favorite=excluded.favorite,
         preferred_model_id=excluded.preferred_model_id, tool_ids=excluded.tool_ids, variables=excluded.variables, updated_at=excluded.updated_at`,
      id, p.name, p.body, JSON.stringify(p.tags ?? []), p.favorite ? 1 : 0, p.preferredModelId ?? null,
      JSON.stringify(p.toolIds ?? []), JSON.stringify(p.variables ?? []), now(),
    );
    await get().load();
    return id;
  },
  async deletePrompt(id) {
    await (await getDb()).runAsync('DELETE FROM prompts WHERE id=?', id);
    await get().load();
  },

  async saveSkill(s) {
    const db = await getDb();
    const id = s.id ?? uid();
    await db.runAsync(
      `INSERT INTO skills (id,name,description,version,source,body,mode,enabled,can_run_scripts,auto_update) VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, version=excluded.version,
         source=excluded.source, body=excluded.body, mode=excluded.mode, enabled=excluded.enabled, can_run_scripts=excluded.can_run_scripts,
         auto_update=excluded.auto_update`,
      id, s.name, s.description ?? '', s.version ?? '1.0.0', s.source ?? 'local', s.body ?? '', s.mode ?? 'auto',
      s.enabled === false ? 0 : 1, s.canRunScripts ? 1 : 0, s.autoUpdate ? 1 : 0,
    );
    await get().load();
    return id;
  },
  async deleteSkill(id) {
    const db = await getDb();
    await db.runAsync('DELETE FROM skill_files WHERE skill_id=?', id);
    await db.runAsync('DELETE FROM skills WHERE id=?', id);
    await get().load();
  },

  async saveSkillFiles(skillId, files) {
    const db = await getDb();
    await db.runAsync('DELETE FROM skill_files WHERE skill_id=?', skillId);
    for (const f of files) await db.runAsync('INSERT OR REPLACE INTO skill_files (skill_id,path,content,size) VALUES (?,?,?,?)', skillId, f.path, f.content, f.content.length);
    await get().load();
  },
  async skillFiles(skillId) {
    return (await getDb()).getAllAsync<SkillFile>('SELECT path, size FROM skill_files WHERE skill_id=? ORDER BY path', skillId);
  },
  async readSkillFile(skillId, path) {
    return (await (await getDb()).getFirstAsync<{ content: string }>('SELECT content FROM skill_files WHERE skill_id=? AND path=?', skillId, path))?.content ?? null;
  },

  async saveServer(s) {
    const db = await getDb();
    const id = s.id ?? uid();
    // Editing a server without mentioning its header settings keeps them.
    const prev = get().servers.find((x) => x.id === id);
    const header = s.authHeader !== undefined ? s.authHeader : prev?.authHeader ?? null;
    const template = s.authTemplate !== undefined ? s.authTemplate : prev?.authTemplate ?? null;
    await db.runAsync(
      `INSERT INTO mcp_servers (id,name,url,transport,auth,tools,enabled_by_default,is_connector,connected,auth_header,auth_template) VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, transport=excluded.transport, auth=excluded.auth,
         tools=excluded.tools, enabled_by_default=excluded.enabled_by_default, is_connector=excluded.is_connector, connected=excluded.connected,
         auth_header=excluded.auth_header, auth_template=excluded.auth_template`,
      id, s.name, s.url, s.transport ?? 'http', s.auth ?? 'none', JSON.stringify(s.tools ?? []),
      s.enabledByDefault === false ? 0 : 1, s.isConnector ? 1 : 0, s.connected ? 1 : 0, header, template,
    );
    await get().load();
    return id;
  },
  async deleteServer(id) {
    await (await getDb()).runAsync('DELETE FROM mcp_servers WHERE id=?', id);
    await get().load();
  },
}));
