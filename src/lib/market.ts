/**
 * The marketplace: where skills and MCP servers come from. Plain fetch calls with no app imports, so the parsing can be
 * tested on its own.
 *
 *  - MCP servers: the official MCP Registry (registry.modelcontextprotocol.io), a public read-only API.
 *  - Skills: claude-plugins.dev (browse + search, with descriptions), skills.sh (search, the same call its CLI makes), and
 *    any public GitHub repository or folder that holds SKILL.md files. Skill text always comes from GitHub's raw files.
 */
import * as Crypto from 'expo-crypto';

import { isSafeHttpsUrl, parseSiteOrigin, resolveSafeSiteUrl } from './local/market-core.mjs';
import {
  buildMcpConnection as buildMarketplaceMcpConnection,
  normalizeMcpRegistryEntry,
  planMcp as planMarketplaceMcp,
} from './local/mcp-market-core.mjs';
import { normalizeArchivePath, readBoundedJson, readBoundedResponse, unpackSafe, untarSafe } from './market-safety.mjs';
import { parseSkillMd } from './skills';

// ---------- shared ----------

async function getJson<T>(url: string, what: string): Promise<T> {
  if (!isSafeHttpsUrl(url)) throw new Error(`${what} did not provide a safe HTTPS address.`);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (res.status === 403 || res.status === 429) throw new Error(`${what} is limiting requests right now. Try again in a minute.`);
    if (!res.ok) throw new Error(`${what} answered with an error (${res.status}).`);
    if (res.url && !isSafeHttpsUrl(res.url)) throw new Error(`${what} redirected to an unsafe address.`);
    return await readBoundedJson<T>(res, 4_000_000);
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

export const normalizeRegistryEntry = (entry: unknown): McpListing | null => normalizeMcpRegistryEntry(entry) as McpListing | null;

export const planMcp = (listing: McpListing): McpPlan => planMarketplaceMcp(listing) as McpPlan;

/** One page of registry results. Servers that only run as a program on a computer are left out: a phone can't start them. */
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

export type McpConnection = { url: string; headerName?: string; headerTemplate?: string; token?: string };

/** Fill in the form's answers: the final address, and the header + token to store in the keystore. */
export const buildMcpConnection = (listing: McpListing, plan: McpPlan, values: Record<string, string>): McpConnection =>
  buildMarketplaceMcpConnection(listing, plan, values) as McpConnection;

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
  from: 'plugins' | 'skillssh' | 'github' | 'site';
  /** skills.sh gives a skill's folder name but not its path inside the repository. */
  skillId?: string;
  /** For skills a website publishes itself: where its index is and what it says about this skill. */
  site?: { indexUrl: string; entry: SiteEntry };
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

// ----- skills that websites publish themselves (the open Agent Skills discovery standard) -----

export type SiteEntry = { name: string; description: string; type?: 'skill-md' | 'archive'; url?: string; digest?: string; files?: string[] };

/** `vercel.com`, `https://docs.stripe.com/` → `https://vercel.com`. Null for insecure URLs and GitHub links. */
export const parseSiteRef = parseSiteOrigin;

const WELL_KNOWN = ['.well-known/agent-skills', '.well-known/skills'];

/** Read a website's skills index (new format first, then the older one). */
export async function siteSkills(input: string): Promise<SkillListing[]> {
  const origin = parseSiteRef(input);
  if (!origin) throw new Error('That doesn’t look like a website address.');
  for (const dir of WELL_KNOWN) {
    const indexUrl = `${origin}/${dir}/index.json`;
    let d: { skills?: unknown[] } | null = null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20_000);
    try {
      const res = await fetch(indexUrl, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      if (res.ok && (!res.url || isSafeHttpsUrl(res.url))) d = await readBoundedJson<{ skills?: unknown[] }>(res, 1_000_000);
    } catch {
      d = null;
    } finally {
      clearTimeout(timer);
    }
    if (!d || !Array.isArray(d.skills) || !d.skills.length) continue;
    const host = new URL(origin).host;
    return d.skills.slice(0, 100).flatMap((raw) => {
      const entry = normalizeSiteEntry(raw, indexUrl);
      return entry ? [{
        key: `site:${host}/${entry.name}`,
        name: entry.name,
        description: entry.description,
        source: host,
        dir: entry.name,
        from: 'site' as const,
        site: { indexUrl, entry },
      }] : [];
    });
  }
  throw new Error(`${new URL(origin).host} doesn’t publish skills this way (no /.well-known/agent-skills/index.json).`);
}

function normalizeSiteEntry(value: unknown, indexUrl: string): SiteEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.name !== 'string' || raw.name.length > 80 || !/^[\w.-]+$/.test(raw.name)) return null;
  if (raw.type !== undefined && raw.type !== 'skill-md' && raw.type !== 'archive') return null;

  let url: string | undefined;
  if (raw.url !== undefined) {
    url = resolveSafeSiteUrl(raw.url, indexUrl) ?? undefined;
    if (!url) return null;
  }

  let digest: string | undefined;
  if (raw.digest !== undefined) {
    if (typeof raw.digest !== 'string' || !/^(?:sha256:)?[0-9a-f]{64}$/i.test(raw.digest)) return null;
    digest = raw.digest;
  }

  let files: string[] | undefined;
  if (raw.files !== undefined) {
    if (!Array.isArray(raw.files) || raw.files.length > MAX_SKILL_FILES + 1) return null;
    const normalized = raw.files.map((file) => normalizeArchivePath(file));
    if (normalized.some((file) => file === null)) return null;
    files = [...new Set(normalized as string[])];
  }

  return {
    name: raw.name,
    description: typeof raw.description === 'string' ? raw.description.slice(0, 1000) : '',
    ...(raw.type ? { type: raw.type } : {}),
    ...(url ? { url } : {}),
    ...(digest ? { digest } : {}),
    ...(files ? { files } : {}),
  };
}

const sha256Hex = async (bytes: Uint8Array) => [...new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>))].map((b) => b.toString(16).padStart(2, '0')).join('');

async function fetchBytes(url: string, max = 20_000_000) {
  if (!isSafeHttpsUrl(url)) throw new Error('Skill files must be downloaded from a safe HTTPS address.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`Could not download ${new URL(url).host} (${res.status}).`);
    if (res.url && !isSafeHttpsUrl(res.url)) throw new Error('The skill download redirected to an unsafe address.');
    return await readBoundedResponse(res, max);
  } finally {
    clearTimeout(timer);
  }
}

/** The files of a .tar archive (ustar, with GNU long names and pax paths). Folders and links are skipped. */
export const untar = untarSafe;

/** Unpack a downloaded archive (.tar.gz, .tgz, .zip or .tar) into files. */
export function unpack(bytes: Uint8Array): { path: string; data: Uint8Array }[] {
  return unpackSafe(bytes);
}

/** SKILL.md and its companion files from the unpacked files of an archive (the skill may sit in a folder inside it). */
export function skillFromFiles(all: { path: string; data: Uint8Array }[]): { md: string; files: SkillFileData[]; omitted: number } {
  const text = new TextDecoder();
  const md = all.filter((f) => /(^|\/)skill\.md$/i.test(f.path)).sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
  if (!md) throw new Error('There is no SKILL.md in that download.');
  const dir = md.path.includes('/') ? md.path.slice(0, md.path.lastIndexOf('/')) : '';
  const body = parseSkillMdBody(text.decode(md.data));
  const blobs = all.map((f) => ({ path: f.path, size: f.data.length }));
  const { picked, omitted } = chooseSkillFiles(blobs, dir, referencedPaths(body));
  const byPath = new Map(all.map((f) => [f.path, f.data]));
  const files: SkillFileData[] = [];
  for (const { rel } of picked) {
    const data = byPath.get(dir ? `${dir}/${rel}` : rel)!;
    const content = text.decode(data).replace(/\r\n?/g, '\n');
    if (content.trim() && !content.includes('\u0000')) files.push({ path: rel, content, size: content.length });
  }
  return { md: text.decode(md.data), files, omitted };
}

const parseSkillMdBody = (md: string) => parseSkillMd(md).body;

/** Download one skill a website publishes, check it against the checksum the site gave, and read it. */
export async function loadSiteSkill(l: SkillListing): Promise<{ md: string; files: SkillFileData[]; omitted: number; url: string }> {
  if (!l.site) throw new Error('This skill has no download address.');
  const { indexUrl } = l.site;
  if (!isSafeHttpsUrl(indexUrl)) throw new Error('This skill index must use a safe HTTPS address.');
  const entry = normalizeSiteEntry(l.site.entry, indexUrl);
  if (!entry) throw new Error('This skill index contains invalid or unsafe metadata.');
  const verify = async (bytes: Uint8Array) => {
    const want = entry.digest?.replace(/^sha256:/i, '').toLowerCase();
    if (want && (await sha256Hex(bytes)) !== want) throw new Error('The download doesn’t match the checksum the website published, so it was not used.');
  };
  const text = new TextDecoder();

  if (entry.url) {
    const url = entry.url;
    const bytes = await fetchBytes(url);
    await verify(bytes);
    if (entry.type === 'archive') return { ...skillFromFiles(unpack(bytes)), url };
    return { md: text.decode(bytes), files: [], omitted: 0, url };
  }

  // The older index lists every file of the skill.
  const names = entry.files ?? ['SKILL.md'];
  const base = new URL(`${entry.name}/`, indexUrl).toString();
  const got: { path: string; data: Uint8Array }[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < Math.min(names.length, MAX_SKILL_FILES + 1)) {
        const rel = names[i++];
        if (!rel || rel.includes('..')) continue;
        try {
          got.push({ path: rel, data: await fetchBytes(new URL(rel, base).toString(), MAX_SKILL_FILE_BYTES * 2) });
        } catch {
          /* a missing companion file is left out */
        }
      }
    }),
  );
  return { ...skillFromFiles(got), url: new URL('SKILL.md', base).toString() };
}

// ----- GitHub -----

export type GithubRef = { owner: string; repo: string; ref?: string; path: string };

/** `owner/repo`, `github.com/owner/repo`, or a link to a folder or SKILL.md inside a repo. */
export function parseGithubRef(input: string): GithubRef | null {
  const t = input.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  const explicit = /^github\.com\//i.test(t);
  const m = t.match(/^(?:github\.com\/)?([\w.-]+)\/([\w.-]+)(?:\/(?:tree|blob)\/([^/]+)\/?(.*))?$/i);
  // A bare "owner/repo" has no dots in the owner (GitHub names don't), so "vercel.com/docs" is a website.
  if (!m || /^github\.com$/i.test(m[1]) || (!explicit && m[1].includes('.'))) return null;
  let path = (m[4] ?? '').replace(/\/+$/, '');
  if (/(^|\/)SKILL\.md$/i.test(path)) path = path.replace(/\/?SKILL\.md$/i, '');
  return { owner: m[1], repo: m[2], ref: m[3], path };
}

const raw = (source: string, path: string, ref = 'HEAD') => `https://raw.githubusercontent.com/${source}/${ref}/${path.replace(/^\/+/, '')}`;

type Blob = { path: string; size: number };
/** Every file in a repository, from one GitHub API call (cached for the session). */
const repoBlobs = (source: string, ref = 'HEAD') =>
  once(`tree:${source}@${ref}`, async (): Promise<Blob[]> => {
    const d = await getJson<{ tree?: { path: string; type: string; size?: number }[] }>(`https://api.github.com/repos/${source}/git/trees/${encodeURIComponent(ref)}?recursive=1`, 'GitHub');
    return (d.tree ?? []).filter((t) => t.type === 'blob').map((t) => ({ path: t.path, size: t.size ?? 0 }));
  });

/** Every SKILL.md folder in a repo. */
const skillDirs = async (source: string, ref = 'HEAD') =>
  (await repoBlobs(source, ref))
    .filter((t) => /(^|\/)SKILL\.md$/.test(t.path))
    .map((t) => t.path.replace(/\/?SKILL\.md$/, ''))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));

async function fetchText(url: string): Promise<string | null> {
  if (!isSafeHttpsUrl(url)) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok || (res.url && !isSafeHttpsUrl(res.url))) return null;
    const bytes = await readBoundedResponse(res, 2_000_000);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
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

// ----- the files that come with a skill -----

export type SkillFileData = { path: string; content: string; size: number };

const TEXT_EXT = new Set('md markdown txt rst json jsonc yaml yml toml ini cfg csv tsv xml html htm css js mjs cjs ts tsx jsx py sh bash zsh rb php go rs java kt swift c h cpp hpp cs sql r lua pl tex bib'.split(' '));
const SKIP_DIR = /(^|\/)(node_modules|\.git|__pycache__|dist|build|\.venv|venv)(\/|$)/;
const SKIP_NAME = /^(LICENSE|LICENCE|NOTICE|CHANGELOG|CONTRIBUTING|CODE_OF_CONDUCT)(\.[A-Za-z]+)?$/i;
export const MAX_SKILL_FILES = 60;
export const MAX_SKILL_FILE_BYTES = 150_000;
export const MAX_SKILL_TOTAL_BYTES = 1_200_000;

/** Files a SKILL.md points to by relative path (`forms.md`, `scripts/fill.py`), so they can be taken first. */
export function referencedPaths(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(/(?:^|[\s`'"(\[])(\.?\/?(?:[\w.-]+\/)*[\w.-]+\.[A-Za-z0-9]{1,8})(?=$|[\s`'")\],:;])/gm)) {
    const p = m[1].replace(/^\.?\//, '');
    if (!p.includes('..') && !/^https?:/.test(p) && TEXT_EXT.has(p.split('.').pop()!.toLowerCase())) found.add(p);
  }
  return [...found];
}

/** Which files of a folder to keep, in the order to keep them: referenced ones, then documents, then code. */
export function chooseSkillFiles(blobs: Blob[], dir: string, referenced: string[], otherSkillDirs: string[] = []) {
  const prefix = dir ? `${dir}/` : '';
  const ref = new Set(referenced);
  const rank = (rel: string) => (ref.has(rel) ? 0 : /\.(md|markdown|txt|rst)$/i.test(rel) ? 1 : /^(scripts?|examples?)\//i.test(rel) ? 2 : 3);
  const candidates = blobs
    .filter((b) => b.path.startsWith(prefix) && b.path !== `${prefix}SKILL.md`)
    .filter((b) => !otherSkillDirs.some((o) => b.path.startsWith(`${o}/`)))
    .map((b) => ({ rel: b.path.slice(prefix.length), size: b.size }))
    .filter(({ rel, size }) => {
      const name = rel.split('/').pop()!;
      const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
      return TEXT_EXT.has(ext) && !SKIP_NAME.test(name) && !SKIP_DIR.test(rel) && size > 1 && size <= MAX_SKILL_FILE_BYTES;
    })
    .sort((x, y) => rank(x.rel) - rank(y.rel) || x.rel.split('/').length - y.rel.split('/').length || x.rel.localeCompare(y.rel));
  const picked: { rel: string; size: number }[] = [];
  let total = 0;
  for (const c of candidates) {
    if (picked.length >= MAX_SKILL_FILES || total + c.size > MAX_SKILL_TOTAL_BYTES) continue;
    picked.push(c);
    total += c.size;
  }
  return { picked, omitted: candidates.length - picked.length };
}

/**
 * Read the text files that sit next to a SKILL.md (references, templates, scripts) so the assistant can open them later.
 * Pictures, fonts and other binaries are left out, and the total is capped. Scripts are stored as text only; they are not run.
 */
export async function loadSkillFiles(source: string, dir: string, skillBody: string): Promise<{ files: SkillFileData[]; omitted: number }> {
  const referenced = referencedPaths(skillBody);
  let choice: { picked: { rel: string; size: number }[]; omitted: number };
  try {
    const blobs = await repoBlobs(source);
    if (!dir) {
      // A skill at the root of a repository: only what it points to, not the whole repository.
      choice = { picked: blobs.filter((b) => referenced.includes(b.path) && b.size <= MAX_SKILL_FILE_BYTES).map((b) => ({ rel: b.path, size: b.size })), omitted: 0 };
    } else {
      const others = (await skillDirs(source)).filter((d) => d !== dir && d.startsWith(`${dir}/`));
      choice = chooseSkillFiles(blobs, dir, referenced, others);
    }
  } catch {
    // GitHub's file list wasn't available (limit reached): try the files the instructions name.
    choice = { picked: referenced.map((rel) => ({ rel, size: 0 })).slice(0, 20), omitted: 0 };
  }

  const out: SkillFileData[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < choice.picked.length) {
        const at = i++;
        const { rel } = choice.picked[at];
        const text = await fetchText(raw(source, `${dir ? dir + '/' : ''}${rel}`));
        if (text != null && text.trim() && !text.includes('\u0000') && text.length <= MAX_SKILL_FILE_BYTES * 1.5) out[at] = { path: rel, content: text.replace(/\r\n?/g, '\n'), size: text.length };
      }
    }),
  );
  return { files: out.filter(Boolean), omitted: choice.omitted };
}

/** The same for a skill a website publishes: `vercel.com/deploy-to-vercel`. */
export const siteSourceLabel = (host: string, name: string) => `${host}/${name}`;

/** A stable label for where an installed skill came from; used to show "Added" in the lists. */
export const skillSourceLabel = (source: string, dir?: string) => `github.com/${source}${dir ? '/' + dir : ''}`;

/** Curated places to start browsing: repositories that publish many skills. */
export const SKILL_SITES = [
  { site: 'vercel.com', label: 'Vercel', sub: 'Deploy, React and web design' },
  { site: 'developers.cloudflare.com', label: 'Cloudflare', sub: 'Workers, agents, storage and more' },
  { site: 'docs.stripe.com', label: 'Stripe', sub: 'Payments, Connect and billing' },
  { site: 'supabase.com', label: 'Supabase', sub: 'Postgres and Supabase projects' },
  { site: 'agentskills.io', label: 'Agent Skills', sub: 'Writing and testing skills' },
];

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
