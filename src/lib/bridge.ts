/**
 * MCP servers that run as a program on a computer ("stdio" servers) can't be started by a phone. The way to use one anyway is to
 * run it on your computer behind a small bridge (supergateway) that makes it reachable over HTTP, then add that address here.
 * This builds the command to run. Plain text only, so it can be tested without the app.
 */

/** A program to run: the command, its arguments and the environment variables it needs. */
export type StdioSpec = { command: string; args: string[]; env: Record<string, string> };

const SAFE = /^[A-Za-z0-9_@%+=:,./~-]+$/;

/** Quote for a POSIX shell (macOS, Linux, WSL, Git Bash): leave plain words alone, single-quote everything else. */
export const shellQuote = (s: string) => (s === '' ? "''" : SAFE.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** The program and its arguments as one command line. */
export const commandLine = (spec: Pick<StdioSpec, 'command' | 'args'>) => [spec.command, ...spec.args].map(shellQuote).join(' ');

/**
 * The command to run on the computer. `NAME=value` settings come first so the server inherits them, then supergateway with the
 * server as its `--stdio` program, served at http://<this computer>:<port>/mcp and protected by `key`.
 */
export function bridgeCommand(spec: Pick<StdioSpec, 'command' | 'args'> & { env?: Record<string, string> }, o: { port?: number; key: string }) {
  const env = Object.entries(spec.env ?? {})
    .filter(([k, v]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && v !== '')
    .map(([k, v]) => `${k}=${shellQuote(v)}`);
  return [...env, 'npx', '-y', 'supergateway', '--stdio', shellQuote(commandLine(spec)), '--outputTransport', 'streamableHttp', '--port', String(o.port ?? 8000), '--apiKey', shellQuote(o.key)].join(' ');
}

/** A random key to protect the bridge (letters and digits only, so it survives any shell and any header). */
export function newKey(random: (n: number) => Uint8Array) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(random(24), (b) => chars[b % chars.length]).join('');
}

/** Where to reach the bridge from the phone, given the computer's address. `192.168.1.20` → `http://192.168.1.20:8000/mcp`. */
export function bridgeUrl(input: string, port = 8000) {
  const t = input.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  const slash = t.indexOf('/');
  const hostPort = slash === -1 ? t : t.slice(0, slash);
  const path = slash === -1 ? '/mcp' : t.slice(slash);
  // An IPv6 address needs brackets; any other host gets the default port unless it has one.
  const v6 = (hostPort.match(/:/g) ?? []).length > 1 && !hostPort.startsWith('[');
  const authority = v6 ? `[${hostPort}]:${port}` : /:\d+$/.test(hostPort) ? hostPort : `${hostPort}:${port}`;
  return `http://${authority}${path}`;
}

// ---------- reading a server's own setup instructions ----------

export type ParsedConfig = { name?: string; url?: string; spec?: StdioSpec };

/** Split a command line into words, honouring single and double quotes. */
export function splitWords(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < line.length && '"\\$`'.includes(line[i + 1])) cur += line[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (/\s/.test(c)) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
    } else if (c === '\\' && i + 1 < line.length) {
      cur += line[++i];
    } else cur += c;
  }
  if (cur || has) out.push(cur);
  return out;
}

const asSpec = (o: any): StdioSpec | undefined =>
  typeof o?.command === 'string' && o.command.trim()
    ? { command: o.command.trim(), args: Array.isArray(o.args) ? o.args.map(String) : [], env: o.env && typeof o.env === 'object' ? Object.fromEntries(Object.entries(o.env).map(([k, v]) => [k, String(v)])) : {} }
    : undefined;

/**
 * Understand what people paste from a server's README: the `mcpServers` JSON used by Claude Desktop and others (a `command`
 * with `args` and `env`, or a `url`), a bare server object, or just a command line such as `npx -y @scope/server /some/folder`.
 */
export function parseServerConfig(text: string): ParsedConfig | null {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith('{')) {
    let json: any;
    try {
      json = JSON.parse(t);
    } catch {
      return null;
    }
    const table = json.mcpServers ?? json.servers ?? json.mcp?.servers;
    const entries: [string | undefined, any][] = table && typeof table === 'object' ? Object.entries(table) : json.command || json.url ? [[undefined, json]] : Object.entries(json);
    for (const [name, v] of entries) {
      if (typeof v?.url === 'string') return { name, url: v.url };
      const spec = asSpec(v);
      if (spec) return { name, spec };
    }
    return null;
  }
  const words = splitWords(t.split('\n')[0]);
  // Leading NAME=value words are environment settings.
  const env: Record<string, string> = {};
  while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) {
    const [k, ...v] = words.shift()!.split('=');
    env[k] = v.join('=');
  }
  return words.length ? { spec: { command: words[0], args: words.slice(1), env } } : null;
}
