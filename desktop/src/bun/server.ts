/**
 * The desktop app's backend: one HTTP server on 127.0.0.1 that serves the web build of AI Hat, plus what a web page
 * can't do by itself. Everything under /api and /proxy needs the per-launch token, which is written into the page
 * the server hands out and nowhere else; requests that name any other host are refused (no DNS rebinding).
 *
 *   /api/db           SQLite in the app's data folder (bun:sqlite)
 *   /api/secret       API keys and sign-in tokens in the OS keychain
 *   /proxy?url=       requests to AI endpoints, MCP servers and marketplaces, free of the browser's CORS limits
 *   /api/save         files you export, written to Downloads and shown in the file manager
 *   /api/backup       scheduled backups, kept in the data folder (newest five)
 *   /api/open         a link in the system browser
 *   /api/notify       a desktop notification
 *   /api/oauth/wait   waits for a browser sign-in to come back to /oauth/…
 *   /api/info         platform, version and where keys are kept
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { extname, join, normalize, parse, sep } from 'node:path';

import { openDb, type DbOp } from './db';
import { bootstrap } from './inject';
import { openSecrets } from './secrets';

export type Host = {
  /** Where the database, backups and (without a keyring) keys live. */
  dataDir: string;
  downloads: string;
  version: string;
  openExternal(url: string): void;
  showItemInFolder(path: string): void;
  notify(title: string, body: string): void;
};

/** A fixed port keeps the page's address the same between launches (sign-in services remember it). */
const PORTS = [47321, 47322, 47323, 47324, 47325];

const DROP_REQUEST = new Set(['host', 'origin', 'referer', 'cookie', 'connection', 'content-length', 'accept-encoding', 'x-aihat-token', 'user-agent', 'te', 'upgrade', 'keep-alive', 'priority', 'proxy-authorization']);
const DROP_RESPONSE = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'set-cookie', 'strict-transport-security', 'alt-svc', 'content-security-policy', 'x-frame-options']);
const NO_BODY = new Set([101, 204, 205, 304]);

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

/** A file name that is safe on every OS: no folders, no reserved characters. */
export function safeName(name: string) {
  const clean = name.replace(/[/\\:*?"<>|\u0000-\u001f]+/g, '-').replace(/^[.\s-]+|[.\s]+$/g, '').slice(0, 120);
  return clean || 'AI Hat file';
}

/** `name.ext`, or `name (2).ext` when that is taken. */
export function freePath(dir: string, name: string) {
  const { name: stem, ext } = parse(name);
  let path = join(dir, name);
  for (let n = 2; existsSync(path); n++) path = join(dir, `${stem} (${n})${ext}`);
  return path;
}

const SIGNED_IN = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AI Hat</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0E0F11;color:#ECEDEF;font:16px/1.5 system-ui,sans-serif">
<main style="max-width:420px;padding:24px;text-align:center"><h1 style="font-size:22px;font-weight:600;margin:0 0 8px">MESSAGE</h1>
<p style="color:#9BA0A8;margin:0">You can close this tab and go back to AI Hat.</p></main>`;

export async function startServer({ webRoot, host, keysInFile = false }: { webRoot: string; host: Host; keysInFile?: boolean }) {
  mkdirSync(host.dataDir, { recursive: true });
  const db = openDb(join(host.dataDir, 'aihat.db'));
  const secrets = await openSecrets(host.dataDir, keysInFile);
  const token = randomBytes(32).toString('base64url');
  const tokenBytes = Buffer.from(token);
  const root = normalize(webRoot);
  const indexHtml = await Bun.file(join(root, 'index.html')).text();
  const page = indexHtml.replace(/<head>/i, `<head>${bootstrap({ token, platform: process.platform, version: host.version })}`);
  let port = 0;

  const tokenOk = (given: string | null) => {
    const b = Buffer.from(given ?? '');
    return b.length === tokenBytes.length && timingSafeEqual(b, tokenBytes);
  };

  // ---------- browser sign-in ----------
  // The sign-in page in the system browser comes back to http://127.0.0.1:<port>/oauth/…?code=…&state=…; the app
  // is waiting for that address on /api/oauth/wait.
  const signIns = new Map<string, { url?: string; waiters: ((url: string) => void)[]; at: number }>();
  const entry = (state: string) => {
    for (const [k, v] of signIns) if (Date.now() - v.at > 15 * 60_000) signIns.delete(k);
    let e = signIns.get(state);
    if (!e) signIns.set(state, (e = { waiters: [], at: Date.now() }));
    return e;
  };
  const signInReturned = (url: URL) => {
    const state = url.searchParams.get('state');
    if (state) {
      const e = entry(state);
      e.url = url.href;
      e.waiters.splice(0).forEach((w) => w(url.href));
    }
    const msg = url.searchParams.get('error') ? 'Sign-in didn’t finish' : state ? 'You’re signed in' : 'Nothing to do here';
    return new Response(SIGNED_IN.replace('MESSAGE', msg), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  };
  const waitForSignIn = (state: string, ms: number, signal: AbortSignal) =>
    new Promise<string | null>((resolve) => {
      const e = entry(state);
      if (e.url) {
        signIns.delete(state);
        return resolve(e.url);
      }
      const done = (url: string | null) => {
        clearTimeout(timer);
        e.waiters = e.waiters.filter((w) => w !== got);
        if (url) signIns.delete(state);
        resolve(url);
      };
      const got = (url: string) => done(url);
      const timer = setTimeout(() => done(null), ms);
      signal.addEventListener('abort', () => done(null));
      e.waiters.push(got);
    });

  // ---------- requests to other sites ----------
  const proxyError = (message: string) => new Response(message, { status: 502, headers: { 'x-aihat-proxy-error': '1', 'content-type': 'text/plain; charset=utf-8' } });

  async function proxy(req: Request, target: string | null) {
    let u: URL;
    try {
      u = new URL(target ?? '');
    } catch {
      return proxyError('That address isn’t valid.');
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return proxyError('Only http and https addresses can be reached.');
    const headers = new Headers();
    req.headers.forEach((v, k) => {
      if (!DROP_REQUEST.has(k) && !k.startsWith('sec-')) headers.set(k, v);
    });
    headers.set('user-agent', `AI-Hat-Desktop/${host.version}`);
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
    let res: Response;
    try {
      res = await fetch(u, { method: req.method, headers, body, redirect: 'follow', signal: req.signal });
    } catch (e) {
      return proxyError(req.signal.aborted ? 'Cancelled.' : e instanceof Error ? e.message : String(e));
    }
    const out = new Headers();
    res.headers.forEach((v, k) => {
      if (!DROP_RESPONSE.has(k)) out.append(k, v);
    });
    out.set('x-aihat-url', res.url || u.href);
    out.set('cache-control', 'no-store');
    return new Response(NO_BODY.has(res.status) ? null : res.body, { status: res.status, statusText: res.statusText, headers: out });
  }

  // ---------- the app's own calls ----------
  async function api(req: Request, url: URL): Promise<Response> {
    try {
      switch (url.pathname) {
        case '/api/db': {
          const { op, sql, params } = (await req.json()) as { op: DbOp; sql: string; params?: never[] };
          return json({ result: db.run(op, sql, params ?? []) });
        }
        case '/api/secret': {
          const name = url.searchParams.get('name');
          if (!name) return json({ error: 'No key name given.' }, 400);
          if (req.method === 'GET') return json({ value: await secrets.get(name) });
          if (req.method === 'PUT') {
            const { value } = (await req.json()) as { value: string };
            await secrets.set(name, String(value));
            return json({ ok: true });
          }
          if (req.method === 'DELETE') {
            await secrets.delete(name);
            return json({ ok: true });
          }
          break;
        }
        case '/api/save': {
          mkdirSync(host.downloads, { recursive: true });
          const path = freePath(host.downloads, safeName(url.searchParams.get('name') ?? ''));
          await Bun.write(path, new Uint8Array(await req.arrayBuffer()));
          host.showItemInFolder(path);
          return json({ path });
        }
        case '/api/backup': {
          const dir = join(host.dataDir, 'backups');
          mkdirSync(dir, { recursive: true });
          const path = join(dir, `auto-${Date.now()}.json`);
          await Bun.write(path, await req.text());
          const all = readdirSync(dir).filter((f) => /^auto-\d+\.json$/.test(f)).sort();
          for (const f of all.slice(0, Math.max(all.length - 5, 0))) rmSync(join(dir, f), { force: true });
          return json({ path });
        }
        case '/api/open': {
          const { url: link } = (await req.json()) as { url: string };
          const u = new URL(link);
          if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) return json({ error: 'Only web and email links open outside the app.' }, 400);
          host.openExternal(u.href);
          return json({ ok: true });
        }
        case '/api/notify': {
          const { title, body } = (await req.json()) as { title: string; body?: string };
          host.notify(String(title || 'AI Hat'), String(body ?? ''));
          return json({ ok: true });
        }
        case '/api/oauth/wait': {
          const state = url.searchParams.get('state');
          if (!state) return json({ error: 'No sign-in to wait for.' }, 400);
          const back = await waitForSignIn(state, Math.min(Number(url.searchParams.get('ms')) || 300_000, 600_000), req.signal);
          return back ? json({ url: back }) : json({ error: 'Sign-in was cancelled or took too long.' }, 408);
        }
        case '/api/info':
          return json({ platform: process.platform, arch: process.arch, version: host.version, keyStore: secrets.store, dataDir: host.dataDir, downloads: host.downloads });
      }
      return json({ error: 'Not found.' }, 404);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  }

  // ---------- the web build ----------
  const pageResponse = () =>
    new Response(page, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'", 'referrer-policy': 'no-referrer' },
    });

  function staticFile(pathname: string) {
    let rel: string;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      return new Response('Bad address', { status: 400 });
    }
    if (rel === '/' || rel === '/index.html') return pageResponse();
    const file = normalize(join(root, rel));
    if (!file.startsWith(root + sep)) return new Response('Not found', { status: 404 });
    if (existsSync(file) && statSync(file).isFile()) {
      const immutable = rel.startsWith('/_expo/static/') || rel.startsWith('/assets/');
      return new Response(Bun.file(file), { headers: { 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', 'x-content-type-options': 'nosniff' } });
    }
    // Any other address is a screen of the app (it routes on the page).
    return extname(rel) ? new Response('Not found', { status: 404 }) : pageResponse();
  }

  const handle = async (req: Request) => {
    const url = new URL(req.url);
    const hostHeader = req.headers.get('host');
    if (hostHeader !== `127.0.0.1:${port}` && hostHeader !== `localhost:${port}`) return new Response('Not allowed', { status: 421 });
    if (url.pathname === '/proxy' || url.pathname.startsWith('/api/')) {
      const origin = req.headers.get('origin');
      if (!tokenOk(req.headers.get('x-aihat-token')) || (origin && origin !== `http://${hostHeader}`)) return json({ error: 'Not allowed.' }, 403);
      return url.pathname === '/proxy' ? proxy(req, url.searchParams.get('url')) : api(req, url);
    }
    if (url.pathname.startsWith('/oauth/')) return signInReturned(url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Not allowed', { status: 405 });
    return staticFile(url.pathname);
  };

  let server: ReturnType<typeof Bun.serve> | undefined;
  for (const p of [...PORTS, 0]) {
    try {
      server = Bun.serve({ hostname: '127.0.0.1', port: p, idleTimeout: 0, fetch: handle });
      break;
    } catch {
      /* taken: try the next one */
    }
  }
  if (!server) throw new Error('Could not start the local server.');
  port = server.port!;

  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    token,
    keyStore: secrets.store,
    stop() {
      server!.stop(true);
      db.close();
    },
  };
}
