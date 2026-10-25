/**
 * The marketplace: where skills and MCP servers come from. Plain fetch calls with no app imports, so the parsing can be
 * tested on its own.
 *
 *  - MCP servers: the official MCP Registry (registry.modelcontextprotocol.io), a public read-only API.
 *  - Skills: claude-plugins.dev (browse + search, with descriptions), skills.sh (search, the same call its CLI makes), and
 *    any public GitHub repository or folder that holds SKILL.md files. Skill text always comes from GitHub's raw files.
 */
import { parseSkillMd } from './skills';

// ---------- shared ----------

async function getJson<T>(url: string, what: string): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (res.status === 403 || res.status === 429) throw new Error(`${what} is limiting requests right now. Try again in a minute.`);
    if (!res.ok) throw new Error(`${what} answered with an error (${res.status}).`);
    return (await res.json()) as T;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`${what} took too long to answer.`);
    if (e instanceof TypeError) throw new Error(`Couldn’t reach ${what}. Check your connection.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const memo = new Map<string, Promise<unknown>>();
/** Remember a lookup for the rest of the session; a failed one is forgotten so a retry really retries. */
function once<T>(key: string, make: () => Promise<T>): Promise<T> {
  const hit = memo.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const p = make();
  memo.set(key, p);
  p.catch(() => memo.delete(key));
  return p;
}

// ---------- MCP servers (official registry) ----------

const REGISTRY = 'https://registry.modelcontextprotocol.io/v0.1/servers';

export type McpVariable = { description?: string; isRequired?: boolean; isSecret?: boolean; default?: string; choices?: string[] };
export type McpHeaderSpec = { name: string; description?: string; isRequired?: boolean; isSecret?: boolean; value?: string; variables?: Record<string, McpVariable> };
export type McpRemote = { type: 'streamable-http' | 'sse'; url: string; headers: McpHeaderSpec[]; variables: Record<string, McpVariable> };

export type McpListing = {
  /** The registry's name, for example `ai.smithery/github`. Unique. */
  id: string;
  title: string;
  description: string;
  version: string;
  /** Who published it, as a domain (`smithery.ai`). */
  publisher: string;
  repoUrl?: string;
  websiteUrl?: string;
  /** The way to reach it from a phone: a hosted (remote) server. Undefined for servers that only run on a computer. */
  remote?: McpRemote;
  featured?: boolean;
};

const reverseDomain = (name: string) => name.split('/')[0].split('.').reverse().join('.');

export function normalizeRegistryEntry(entry: any): McpListing | null {
  const s = entry?.server;
  if (!s?.name) return null;
  const remotes: any[] = Array.isArray(s.remotes) ? s.remotes : [];
  // Streamable HTTP is what the app's client speaks; SSE-only servers are listed but not installable.
  const r = remotes.find((x) => x?.type === 'streamable-http') ?? remotes.find((x) => x?.type === 'sse');
  return {
    id: s.name,
    title: s.title || String(s.name).split('/').pop() || s.name,
    description: String(s.description ?? '').trim(),
    version: String(s.version ?? ''),
    publisher: reverseDomain(s.name),
    repoUrl: s.repository?.url,
    websiteUrl: s.websiteUrl,
    remote: r?.url
      ? {
          type: r.type,
          url: r.url,
          headers: Array.isArray(r.headers) ? r.headers.filter((h: any) => h?.name) : [],
          variables: r.variables ?? {},
        }
      : undefined,
  };
}

/** One page of registry results. Servers that only run on a computer are dropped, since a phone can't start them. */
export async function searchMcp(query: string, cursor?: string): Promise<{ items: McpListing[]; next?: string }> {
  const items: McpListing[] = [];
  let next = cursor;
  // Most registry entries are hosted servers, but keep paging a little when a page has few.
  for (let page = 0; page < 3 && items.length < 20; page++) {
    const params = new URLSearchParams({ limit: '60', version: 'latest' });
    if (query.trim()) params.set('search', query.trim());
    if (next) params.set('cursor', next);
    const d = await getJson<{ servers?: any[]; metadata?: { nextCursor?: string } }>(`${REGISTRY}?${params}`, 'The MCP registry');
    for (const e of d.servers ?? []) {
      const n = normalizeRegistryEntry(e);
      if (n?.remote) items.push(n);
    }
    next = d.metadata?.nextCursor || undefined;
    if (!next) break;
  }
  return { items, next };
}

/**
 * Hosted servers that work without a browser sign-in, checked by hand: they answer the MCP handshake with no key (or take
 * a plain token). Shown first so there is something useful to add straight away.
 */
export const FEATURED_MCP: (McpListing & { category: string })[] = [
  { id: 'featured/deepwiki', title: 'DeepWiki', category: 'Docs', description: 'Ask questions about any public GitHub repository: structure, docs and how things work.', version: '', publisher: 'deepwiki.com', websiteUrl: 'https://deepwiki.com', remote: { type: 'streamable-http', url: 'https://mcp.deepwiki.com/mcp', headers: [], variables: {} }, featured: true },
  { id: 'featured/context7', title: 'Context7', category: 'Docs', description: 'Up-to-date documentation and code examples for libraries, pulled in as you ask.', version: '', publisher: 'context7.com', websiteUrl: 'https://context7.com', remote: { type: 'streamable-http', url: 'https://mcp.context7.com/mcp', headers: [], variables: {} }, featured: true },
  { id: 'featured/microsoft-learn', title: 'Microsoft Learn', category: 'Docs', description: 'Search and read official Microsoft and Azure documentation.', version: '', publisher: 'learn.microsoft.com', websiteUrl: 'https://learn.microsoft.com', remote: { type: 'streamable-http', url: 'https://learn.microsoft.com/api/mcp', headers: [], variables: {} }, featured: true },
  { id: 'featured/cloudflare-docs', title: 'Cloudflare Docs', category: 'Docs', description: 'Search the Cloudflare developer documentation.', version: '', publisher: 'cloudflare.com', websiteUrl: 'https://developers.cloudflare.com', remote: { type: 'streamable-http', url: 'https://docs.mcp.cloudflare.com/mcp', headers: [], variables: {} }, featured: true },
  { id: 'featured/exa', title: 'Exa Search', category: 'Search', description: 'Web search and page fetching built for AI assistants. Works without a key at a low rate limit.', version: '', publisher: 'exa.ai', websiteUrl: 'https://exa.ai', remote: { type: 'streamable-http', url: 'https://mcp.exa.ai/mcp', headers: [], variables: {} }, featured: true },
  { id: 'featured/huggingface', title: 'Hugging Face', category: 'AI', description: 'Search models, datasets, Spaces and papers on the Hugging Face Hub. A token unlocks more.', version: '', publisher: 'huggingface.co', websiteUrl: 'https://huggingface.co/settings/mcp', remote: { type: 'streamable-http', url: 'https://huggingface.co/mcp', headers: [{ name: 'Authorization', description: 'Optional Hugging Face access token (hf_…)', value: 'Bearer {token}', variables: { token: { description: 'Hugging Face access token', isSecret: true } } }], variables: {} }, featured: true },
  { id: 'featured/coingecko', title: 'CoinGecko', category: 'Data', description: 'Crypto prices, market data and charts.', version: '', publisher: 'coingecko.com', websiteUrl: 'https://docs.coingecko.com', remote: { type: 'streamable-http', url: 'https://mcp.api.coingecko.com/mcp', headers: [], variables: {} }, featured: true },
  { id: 'featured/github', title: 'GitHub', category: 'Dev', description: 'Search code, read issues and pull requests, and manage repositories. Needs a personal access token.', version: '', publisher: 'github.com', websiteUrl: 'https://github.com/settings/personal-access-tokens', remote: { type: 'streamable-http', url: 'https://api.githubcopilot.com/mcp/', headers: [{ name: 'Authorization', description: 'A GitHub personal access token', isRequired: true, isSecret: true, value: 'Bearer {token}', variables: { token: { description: 'GitHub personal access token', isRequired: true, isSecret: true } } }], variables: {} }, featured: true },
];

/** What the install form must ask for, and whether this phone can do it at all. */
export type McpField = { key: string; label: string; hint?: string; secret: boolean; required: boolean; choices?: string[]; default?: string };
export type McpPlan = { supported: boolean; reason?: string; fields: McpField[]; headerName?: string; headerTemplate?: string };

const vars = (s: string) => [...s.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]);

/**
 * Work out the questions to ask. The app's MCP client can send one secret in one header (`Authorization: Bearer …` or
 * a header like `X-API-Key`), and fill `{placeholders}` in the address. More than that needs a computer.
 */
export function planMcp(l: McpListing): McpPlan {
  const r = l.remote;
  if (!r) return { supported: false, reason: 'This server only runs on a computer, so it can’t be added on a phone.', fields: [] };
  if (r.type === 'sse') return { supported: false, reason: 'This server uses the older SSE connection, which the app doesn’t speak yet.', fields: [] };

  const fields: McpField[] = [];
  for (const key of vars(r.url)) {
    const v = r.variables[key] ?? {};
    fields.push({ key, label: key.replace(/_/g, ' '), hint: v.description, secret: !!v.isSecret, required: v.isRequired !== false, choices: v.choices, default: v.default });
  }

  const headers = r.headers;
  const required = headers.filter((h) => h.isRequired);
  if (headers.length > 1 && required.length !== 1) {
    return { supported: false, reason: 'This server needs several custom headers, which the app can’t send yet.', fields };
  }
  const h = required[0] ?? headers[0];
  let headerName: string | undefined;
  let headerTemplate: string | undefined;
  if (h) {
    headerName = h.name;
    const placeholders = h.value ? vars(h.value) : [];
    if (placeholders.length > 1) return { supported: false, reason: 'This server’s sign-in needs more than one value, which the app can’t ask for yet.', fields };
    const key = placeholders[0] ?? 'value';
    const v = h.variables?.[key] ?? {};
    headerTemplate = h.value ? h.value.replace(`{${key}}`, '{token}') : '{token}';
    fields.push({
      key: '@token',
      label: h.name.toLowerCase() === 'authorization' ? 'Access token' : h.name,
      hint: v.description || h.description,
      secret: h.isSecret !== false,
      required: !!(h.isRequired || v.isRequired),
    });
  }
  return { supported: true, fields, headerName, headerTemplate };
}

export type McpConnection = { url: string; headerName?: string; headerTemplate?: string; token?: string };

/** Fill in the form's answers: the final address, and the header + token to store in the keystore. */
export function buildMcpConnection(l: McpListing, plan: McpPlan, values: Record<string, string>): McpConnection {
  let url = l.remote!.url;
  for (const f of plan.fields) if (f.key !== '@token') url = url.replaceAll(`{${f.key}}`, (values[f.key] ?? f.default ?? '').trim());
  const token = (values['@token'] ?? '').trim();
  return { url, headerName: plan.headerName, headerTemplate: plan.headerTemplate, token: token || undefined };
}

// ---------- Skills ----------

export type SkillListing = {
  /** Unique across sources. */
  key: string;
  name: string;
  description?: string;
  /** `owner/repo` on GitHub. */
  source: string;
  /** Folder of the skill inside the repo, when known (`skills/pdf`). */
  dir?: string;
  installs?: number;
  stars?: number;
  from: 'plugins' | 'skillssh' | 'github';
  /** skills.sh gives a skill's folder name but not its path inside the repository. */
  skillId?: string;
};

const PLUGINS = 'https://claude-plugins.dev/api/skills';

type PluginsSkill = { id: string; name: string; description?: string; stars?: number; installs?: number; metadata?: { repoOwner?: string; repoName?: string; directoryPath?: string } };

/** Popular skills (no query) or a search, from claude-plugins.dev. */
export async function pluginSkills(query: string, offset = 0, limit = 25): Promise<{ items: SkillListing[]; total: number }> {
  const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (query.trim()) p.set('q', query.trim());
  const d = await getJson<{ skills?: PluginsSkill[]; total?: number }>(`${PLUGINS}?${p}`, 'claude-plugins.dev');
  const items = (d.skills ?? [])
    .filter((s) => s.metadata?.repoOwner && s.metadata?.repoName)
    .map((s): SkillListing => ({
      key: `gh:${s.metadata!.repoOwner}/${s.metadata!.repoName}/${s.metadata!.directoryPath ?? ''}`,
      name: s.name,
      description: s.description?.trim() || undefined,
      source: `${s.metadata!.repoOwner}/${s.metadata!.repoName}`,
      dir: (s.metadata!.directoryPath ?? '').replace(/^\/+|\/+$/g, ''),
      installs: s.installs,
      stars: s.stars,
      from: 'plugins',
    }));
  return { items, total: d.total ?? items.length };
}

/** Search skills.sh. It needs at least two characters. */
export async function skillsShSearch(query: string, limit = 30): Promise<SkillListing[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const d = await getJson<{ skills?: { id: string; source: string; skillId: string; name: string; installs?: number }[] }>(
    `https://skills.sh/api/search?${new URLSearchParams({ q, limit: String(limit) })}`,
    'skills.sh',
  );
  return (d.skills ?? [])
    .filter((s) => /^[\w.-]+\/[\w.-]+$/.test(s.source)) // GitHub-hosted skills; others have no file we can read
    .map((s): SkillListing => ({ key: `ssh:${s.id}`, name: s.name || s.skillId, source: s.source, skillId: s.skillId, installs: s.installs, from: 'skillssh' }));
}

// ----- GitHub -----

export type GithubRef = { owner: string; repo: string; ref?: string; path: string };

/** `owner/repo`, `github.com/owner/repo`, or a link to a folder or SKILL.md inside a repo. */
export function parseGithubRef(input: string): GithubRef | null {
  const t = input.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  const m = t.match(/^(?:github\.com\/)?([\w.-]+)\/([\w.-]+)(?:\/(?:tree|blob)\/([^/]+)\/?(.*))?$/i);
  if (!m || /^github\.com$/i.test(m[1])) return null;
  let path = (m[4] ?? '').replace(/\/+$/, '');
  if (/(^|\/)SKILL\.md$/i.test(path)) path = path.replace(/\/?SKILL\.md$/i, '');
  return { owner: m[1], repo: m[2], ref: m[3], path };
}

const raw = (source: string, path: string, ref = 'HEAD') => `https://raw.githubusercontent.com/${source}/${ref}/${path.replace(/^\/+/, '')}`;

type TreeEntry = { path: string; type: string };
/** Every SKILL.md folder in a repo, from one GitHub API call. */
const skillDirs = (source: string, ref = 'HEAD') =>
  once(`tree:${source}@${ref}`, async () => {
    const d = await getJson<{ tree?: TreeEntry[]; truncated?: boolean }>(`https://api.github.com/repos/${source}/git/trees/${encodeURIComponent(ref)}?recursive=1`, 'GitHub');
    return (d.tree ?? [])
      .filter((t) => t.type === 'blob' && /(^|\/)SKILL\.md$/.test(t.path))
      .map((t) => t.path.replace(/\/?SKILL\.md$/, ''))
      .sort((a, b) => a.length - b.length || a.localeCompare(b));
  });

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** The text of one SKILL.md, by repo and folder. Several skills in a list are read together, a few at a time. */
export const skillMdAt = (source: string, dir: string, ref = 'HEAD') => once(`md:${source}@${ref}/${dir}`, async () => fetchText(raw(source, `${dir ? dir + '/' : ''}SKILL.md`, ref)));

/** All skills in a repo (or under a folder of it), with their names and descriptions read from each SKILL.md. */
export async function repoSkills(ref: GithubRef, limit = 60): Promise<SkillListing[]> {
  const source = `${ref.owner}/${ref.repo}`;
  const dirs = (await skillDirs(source, ref.ref)).filter((d) => !ref.path || d === ref.path || d.startsWith(`${ref.path}/`));
  if (!dirs.length) throw new Error(ref.path ? 'No SKILL.md was found in that folder.' : 'No SKILL.md files were found in that repository.');
  const slice = dirs.slice(0, limit);
  const out: SkillListing[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < slice.length) {
        const at = i++;
        const dir = slice[at];
        const md = await skillMdAt(source, dir, ref.ref);
        const meta = md ? parseSkillMd(md) : null;
        out[at] = {
          key: `gh:${source}/${dir}`,
          name: meta?.name || dir.split('/').pop() || ref.repo,
          description: meta?.description,
          source,
          dir,
          from: 'github',
        };
      }
    }),
  );
  return out.filter(Boolean);
}

/** Well-known folders where repositories keep skills, tried before falling back to reading the repository's file list. */
const GUESSES = (id: string) => [`skills/${id}`, id, `skills/.curated/${id}`, `.claude/skills/${id}`, `.agents/skills/${id}`, `skills/.system/${id}`, `.codex/skills/${id}`];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Folders whose name looks like the skill id, best first. Ids are the skill's own name, which a folder often shortens (`react-best-practices` for `vercel-react-best-practices`). */
export function rankDirs(dirs: string[], id: string) {
  const n = norm(id);
  return dirs
    .map((dir) => {
      const b = norm(dir.split('/').pop() ?? '');
      const score = b === n ? 100 : b.length >= 4 && (n.endsWith(b) || b.endsWith(n)) ? 60 : b.length >= 4 && (n.includes(b) || b.includes(n)) ? 40 : 0;
      return { dir, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.dir.length - y.dir.length);
}

/** Find and read the SKILL.md of a listing. Returns where it was found, so the install can remember it. */
export async function loadSkill(l: SkillListing): Promise<{ md: string; dir: string; url: string }> {
  const tryDir = async (dir: string) => {
    const md = await skillMdAt(l.source, dir);
    return md ? { md, dir, url: raw(l.source, `${dir ? dir + '/' : ''}SKILL.md`) } : null;
  };
  const id = l.skillId ?? l.name;
  const named = (md: string) => norm(parseSkillMd(md).name ?? '') === norm(id);

  if (l.dir !== undefined) {
    const hit = await tryDir(l.dir);
    if (hit) return hit;
  }
  for (const dir of GUESSES(id)) {
    const hit = await tryDir(dir);
    if (hit && (l.dir !== undefined || !l.skillId || named(hit.md) || dir.split('/').pop() === id)) return hit;
  }
  // A one-skill repository keeps SKILL.md at its root.
  const root = await tryDir('');
  if (root && (!l.skillId || named(root.md))) return root;

  // Otherwise read the repository's file list and find the folder.
  const dirs = await skillDirs(l.source);
  const cands = rankDirs(dirs, id);
  for (const c of cands.slice(0, 5)) {
    const hit = await tryDir(c.dir);
    if (hit && named(hit.md)) return hit;
  }
  if (cands[0]?.score >= 60) {
    const hit = await tryDir(cands[0].dir);
    if (hit) return hit;
  }
  if (dirs.length === 1) {
    const hit = await tryDir(dirs[0]);
    if (hit) return hit;
  }
  // Last resort, for small repositories: look at each skill's own name.
  if (dirs.length <= 60) {
    let found: { md: string; dir: string; url: string } | null = null;
    let i = 0;
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (!found && i < dirs.length) {
          const hit = await tryDir(dirs[i++]);
          if (hit && named(hit.md)) found = hit;
        }
      }),
    );
    if (found) return found;
  }
  throw new Error('Couldn’t find that skill’s SKILL.md. It may have been moved or removed.');
}

/** A stable label for where an installed skill came from; used to show "Added" in the lists. */
export const skillSourceLabel = (source: string, dir?: string) => `github.com/${source}${dir ? '/' + dir : ''}`;

/** Curated places to start browsing: repositories that publish many skills. */
export const SKILL_SOURCES = [
  { source: 'anthropics/skills', label: 'Anthropic', sub: 'Documents, design, MCP builder and more' },
  { source: 'openai/skills', label: 'OpenAI Codex', sub: 'Curated skills for Codex' },
  { source: 'vercel-labs/agent-skills', label: 'Vercel', sub: 'React, web design and deploy' },
  { source: 'obra/superpowers', label: 'Superpowers', sub: 'Planning, debugging, testing workflows' },
];

// ---------- hand-over between screens ----------

/** The list screen remembers what it showed so the detail screen can open it by key without squeezing it into a URL. */
const seen = new Map<string, SkillListing | McpListing>();
export const rememberSkill = (l: SkillListing) => (seen.set(`s:${l.key}`, l), l.key);
export const rememberMcp = (l: McpListing) => (seen.set(`m:${l.id}`, l), l.id);
export const recallSkill = (key: string) => seen.get(`s:${key}`) as SkillListing | undefined;
export const recallMcp = (id: string) => FEATURED_MCP.find((f) => f.id === id) ?? (seen.get(`m:${id}`) as McpListing | undefined);

/** 5400 → "5.4k" */
export const compact = (n?: number) => (n == null ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k` : String(n));
