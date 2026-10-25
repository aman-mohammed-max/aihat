import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { freePath, safeName, startServer } from '../src/bun/server';

const tmp = mkdtempSync(join(tmpdir(), 'aihat-desktop-'));
const web = join(tmp, 'web');
mkdirSync(join(web, '_expo/static/js/web'), { recursive: true });
writeFileSync(join(web, 'index.html'), '<!DOCTYPE html><html><head><title>AI Hat</title></head><body><div id="root"></div><script src="/_expo/static/js/web/entry-abc.js" defer></script></body></html>');
writeFileSync(join(web, '_expo/static/js/web/entry-abc.js'), 'console.log("app")');

const opened: string[] = [];
const shown: string[] = [];
const notes: string[] = [];
let app: Awaited<ReturnType<typeof startServer>>;
let upstream: ReturnType<typeof Bun.serve>;
let seen: { method: string; headers: Record<string, string>; body: string } | null = null;

const call = (path: string, init: RequestInit & { token?: boolean } = {}) => {
  const headers = new Headers(init.headers);
  if (init.token !== false) headers.set('x-aihat-token', app.token);
  return fetch(new URL(path, app.url), { ...init, headers });
};
const db = async (op: string, sql: string, params: unknown[] = []) => {
  const res = await call('/api/db', { method: 'POST', body: JSON.stringify({ op, sql, params }) });
  return { status: res.status, ...((await res.json()) as any) };
};

beforeAll(async () => {
  app = await startServer({
    webRoot: web,
    keysInFile: true,
    host: {
      dataDir: join(tmp, 'data'),
      downloads: join(tmp, 'Downloads'),
      version: '9.9.9',
      openExternal: (u) => opened.push(u),
      showItemInFolder: (p) => shown.push(p),
      notify: (t, b) => notes.push(`${t}|${b}`),
    },
  });
  upstream = Bun.serve({
    port: 0,
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/stream') {
        const enc = new TextEncoder();
        return new Response(
          new ReadableStream({
            async start(c) {
              for (const w of ['one', 'two', 'three']) {
                c.enqueue(enc.encode(`data: ${w}\n\n`));
                await Bun.sleep(150);
              }
              c.close();
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        );
      }
      if (url.pathname === '/empty') return new Response(null, { status: 204 });
      if (url.pathname === '/locked') return new Response('no', { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://x/.well-known/oauth-protected-resource"', 'mcp-session-id': 's1' } });
      if (url.pathname === '/moved') return Response.redirect(new URL('/final', req.url).href, 302);
      seen = { method: req.method, headers: Object.fromEntries(req.headers), body: await req.text() };
      return Response.json({ ok: true, path: url.pathname }, { headers: { 'set-cookie': 'a=b', 'x-extra': 'kept' } });
    },
  });
});

afterAll(() => {
  app.stop();
  upstream.stop(true);
});

describe('page', () => {
  test('the page carries the token and the desktop bootstrap, ahead of the app', async () => {
    const res = await fetch(app.url);
    const html = await res.text();
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(html).toContain(app.token);
    expect(html.indexOf('__AIHAT__')).toBeLessThan(html.indexOf('entry-abc.js'));
    expect(html).toContain('"version":"9.9.9"');
  });
  test('screens of the app get the page; built files are served; missing files are 404', async () => {
    expect(await (await fetch(new URL('/chat/abc', app.url))).text()).toContain(app.token);
    expect(await (await fetch(new URL('/index.html', app.url))).text()).toContain(app.token);
    const js = await fetch(new URL('/_expo/static/js/web/entry-abc.js', app.url));
    expect(await js.text()).toBe('console.log("app")');
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect((await fetch(new URL('/nope.png', app.url))).status).toBe(404);
    expect((await fetch(new URL('/..%2f..%2fdata%2faihat.db', app.url))).status).toBe(404);
  });
  test('another host name is refused (DNS rebinding)', async () => {
    const res = await fetch(app.url, { headers: { host: `evil.example:${app.port}` } });
    expect(res.status).toBe(421);
  });
});

describe('api guard', () => {
  test('no token, a wrong token or another origin is refused', async () => {
    expect((await call('/api/info', { token: false })).status).toBe(403);
    expect((await fetch(new URL('/api/info', app.url), { headers: { 'x-aihat-token': 'x'.repeat(43) } })).status).toBe(403);
    expect((await call('/api/info', { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await call('/proxy?url=' + encodeURIComponent(`http://127.0.0.1:${upstream.port}/x`), { token: false })).status).toBe(403);
    const info = await (await call('/api/info', { headers: { origin: `http://127.0.0.1:${app.port}` } })).json();
    expect(info).toMatchObject({ version: '9.9.9', keyStore: 'file' });
  });
});

describe('database', () => {
  test('schema, insert, select, one row, errors', async () => {
    expect((await db('exec', 'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);')).status).toBe(200);
    expect((await db('run', 'INSERT INTO kv (key,value) VALUES (?,?)', ['a', '1'])).result).toEqual({ lastInsertRowId: 1, changes: 1 });
    expect((await db('all', 'SELECT * FROM kv')).result).toEqual([{ key: 'a', value: '1' }]);
    expect((await db('first', 'SELECT value FROM kv WHERE key=?', ['a'])).result).toEqual({ value: '1' });
    expect((await db('first', 'SELECT value FROM kv WHERE key=?', ['zz'])).result).toBeNull();
    const dup = await db('run', 'INSERT INTO kv (key,value) VALUES (?,?)', ['a', '2']);
    expect(dup.status).toBe(400);
    expect(dup.error).toContain('UNIQUE');
  });
});

describe('keys', () => {
  test('set, read, delete; the file is private', async () => {
    const name = encodeURIComponent('apikey.p1');
    expect(((await (await call(`/api/secret?name=${name}`)).json()) as any).value).toBeNull();
    await call(`/api/secret?name=${name}`, { method: 'PUT', body: JSON.stringify({ value: 'sk-123' }) });
    expect(((await (await call(`/api/secret?name=${name}`)).json()) as any).value).toBe('sk-123');
    if (process.platform !== 'win32') expect(Bun.file(join(tmp, 'data', 'keys.json')).size).toBeGreaterThan(0);
    if (process.platform !== 'win32') expect((await import('node:fs')).statSync(join(tmp, 'data', 'keys.json')).mode & 0o777).toBe(0o600);
    await call(`/api/secret?name=${name}`, { method: 'DELETE' });
    expect(((await (await call(`/api/secret?name=${name}`)).json()) as any).value).toBeNull();
  });
  test('keys never reach the database file', async () => {
    await call('/api/secret?name=x', { method: 'PUT', body: JSON.stringify({ value: 'very-secret-value' }) });
    expect(readFileSync(join(tmp, 'data', 'aihat.db')).includes('very-secret-value')).toBe(false);
  });
});

describe('proxy', () => {
  const via = (path: string, init: RequestInit & { token?: boolean } = {}) => call('/proxy?url=' + encodeURIComponent(`http://127.0.0.1:${upstream.port}${path}`), init);

  test('passes method, body and auth; drops cookies, origin and the token', async () => {
    const res = await via('/v1/chat', { method: 'POST', headers: { authorization: 'Bearer sk-abc', 'content-type': 'application/json', cookie: 'c=d' }, body: '{"x":1}' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, path: '/v1/chat' });
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('x-extra')).toBe('kept');
    expect(seen!.method).toBe('POST');
    expect(seen!.body).toBe('{"x":1}');
    expect(seen!.headers.authorization).toBe('Bearer sk-abc');
    expect(seen!.headers['x-aihat-token']).toBeUndefined();
    expect(seen!.headers.cookie).toBeUndefined();
    expect(seen!.headers['user-agent']).toBe('AI-Hat-Desktop/9.9.9');
  });
  test('streams as it arrives', async () => {
    const res = await via('/stream');
    const reader = res.body!.getReader();
    const t0 = Date.now();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('one');
    expect(Date.now() - t0).toBeLessThan(140);
    let rest = '';
    for (let r = await reader.read(); !r.done; r = await reader.read()) rest += new TextDecoder().decode(r.value);
    expect(rest).toContain('three');
  });
  test('sign-in challenges and session headers come through; 204 has no body; redirects are followed', async () => {
    const locked = await via('/locked', { method: 'POST' });
    expect(locked.status).toBe(401);
    expect(locked.headers.get('www-authenticate')).toContain('resource_metadata');
    expect(locked.headers.get('mcp-session-id')).toBe('s1');
    expect((await via('/empty')).status).toBe(204);
    const moved = await via('/moved');
    expect(moved.headers.get('x-aihat-url')).toBe(`http://127.0.0.1:${upstream.port}/final`);
  });
  test('an unreachable server is reported as a network failure; other schemes are refused', async () => {
    const res = await call('/proxy?url=' + encodeURIComponent('http://127.0.0.1:1/x'));
    expect(res.status).toBe(502);
    expect(res.headers.get('x-aihat-proxy-error')).toBe('1');
    expect((await call('/proxy?url=' + encodeURIComponent('file:///etc/passwd'))).headers.get('x-aihat-proxy-error')).toBe('1');
  });
});

describe('files, links, notifications, sign-in', () => {
  test('saved files land in Downloads under a free, safe name and are shown', async () => {
    const a: any = await (await call('/api/save?name=' + encodeURIComponent('backup.json'), { method: 'POST', body: '{}' })).json();
    const b: any = await (await call('/api/save?name=' + encodeURIComponent('backup.json'), { method: 'POST', body: '{}' })).json();
    const c: any = await (await call('/api/save?name=' + encodeURIComponent('../../evil:name?.txt'), { method: 'POST', body: 'x' })).json();
    expect(a.path).toBe(join(tmp, 'Downloads', 'backup.json'));
    expect(b.path).toBe(join(tmp, 'Downloads', 'backup (2).json'));
    expect(c.path.startsWith(join(tmp, 'Downloads'))).toBe(true);
    expect(shown).toEqual([a.path, b.path, c.path]);
  });
  test('scheduled backups keep the newest five', async () => {
    for (let i = 0; i < 7; i++) {
      await call('/api/backup', { method: 'POST', body: `{"n":${i}}` });
      await Bun.sleep(2);
    }
    const files = readdirSync(join(tmp, 'data', 'backups'));
    expect(files.length).toBe(5);
  });
  test('only web and email links open outside', async () => {
    expect((await call('/api/open', { method: 'POST', body: JSON.stringify({ url: 'https://example.com/a' }) })).status).toBe(200);
    expect((await call('/api/open', { method: 'POST', body: JSON.stringify({ url: 'file:///etc/passwd' }) })).status).toBe(400);
    expect(opened).toEqual(['https://example.com/a']);
    await call('/api/notify', { method: 'POST', body: JSON.stringify({ title: 'Reply ready', body: 'Hello' }) });
    expect(notes).toEqual(['Reply ready|Hello']);
  });
  test('a browser sign-in that comes back is handed to the waiting app (either order)', async () => {
    const waiting = call('/api/oauth/wait?state=s1');
    await Bun.sleep(50);
    const page = await fetch(new URL('/oauth/mcp?code=abc&state=s1', app.url));
    expect(await page.text()).toContain('signed in');
    expect(((await (await waiting).json()) as any).url).toBe(`http://127.0.0.1:${app.port}/oauth/mcp?code=abc&state=s1`);

    await fetch(new URL('/oauth/mcp?code=def&state=s2', app.url));
    expect(((await (await call('/api/oauth/wait?state=s2')).json()) as any).url).toContain('code=def');
    expect((await call('/api/oauth/wait?state=s3&ms=100')).status).toBe(408);
  });
});

test('file name helpers', () => {
  expect(safeName('a/b\\c:d*e?.json')).toBe('a-b-c-d-e-.json');
  expect(safeName('...')).toBe('AI Hat file');
  const dir = mkdtempSync(join(tmpdir(), 'aihat-names-'));
  writeFileSync(join(dir, 'x.txt'), '');
  writeFileSync(join(dir, 'x (2).txt'), '');
  expect(freePath(dir, 'x.txt')).toBe(join(dir, 'x (3).txt'));
  expect(existsSync(freePath(dir, 'y.txt'))).toBe(false);
});
