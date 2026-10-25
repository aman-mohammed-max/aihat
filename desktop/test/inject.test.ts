import { expect, test } from 'bun:test';

import { bootstrap } from '../src/bun/inject';

/** Run the bootstrap the way the page does, against a fake window that records what reaches the network. */
function boot() {
  const calls: { url: string; init?: RequestInit; req?: Request }[] = [];
  const listeners: Record<string, ((e: any) => void)[]> = {};
  const respond = (body: string, headers: Record<string, string> = {}, status = 200) => new Response(body, { status, headers });
  let next: Response | null = null;
  const win: any = {
    fetch: async (input: any, init?: RequestInit) => {
      if (input instanceof Request) calls.push({ url: input.url, req: input });
      else calls.push({ url: String(input), init });
      const r = next ?? respond('{}');
      next = null;
      return r;
    },
    addEventListener: (name: string, fn: (e: any) => void) => (listeners[name] ??= []).push(fn),
  };
  const doc = { addEventListener: (name: string, fn: (e: any) => void) => (listeners[`doc:${name}`] ??= []).push(fn) };
  const script = bootstrap({ token: 'T0K', platform: 'linux', version: '1.0.0' }).replace(/^<script>|<\/script>$/g, '');
  new Function('window', 'document', 'location', script)(win, doc, new URL('http://127.0.0.1:47321/chat/1'));
  return { win, calls, listeners, setNext: (r: Response) => (next = r) };
}

test('other sites go through /proxy with the token; the response keeps the real address', async () => {
  const { win, calls, setNext } = boot();
  setNext(new Response('{"data":[]}', { headers: { 'x-aihat-url': 'https://api.example.com/v1/models' } }));
  const res = await win.fetch('https://api.example.com/v1/models', { headers: { Authorization: 'Bearer sk-1' } });
  expect(calls[0].url).toBe('/proxy?url=' + encodeURIComponent('https://api.example.com/v1/models'));
  const h = new Headers(calls[0].init!.headers);
  expect(h.get('x-aihat-token')).toBe('T0K');
  expect(h.get('authorization')).toBe('Bearer sk-1');
  expect(calls[0].init!.method).toBe('GET');
  expect(res.url).toBe('https://api.example.com/v1/models');
  expect(await res.json()).toEqual({ data: [] });
});

test('a POST body is forwarded; an unreachable server throws TypeError like fetch does', async () => {
  const { win, calls, setNext } = boot();
  setNext(new Response('connection refused', { status: 502, headers: { 'x-aihat-proxy-error': '1' } }));
  const err = await win.fetch('http://192.168.1.40:8000/v1/chat/completions', { method: 'POST', body: '{"a":1}' }).catch((e: Error) => e);
  expect(err).toBeInstanceOf(TypeError);
  expect(String(err.message)).toContain('connection refused');
  expect(new TextDecoder().decode(calls[0].init!.body as ArrayBuffer)).toBe('{"a":1}');
  expect(calls[0].init!.method).toBe('POST');
});

test('the app’s own /api calls carry the token; its files and blob/data addresses are left alone', async () => {
  const { win, calls } = boot();
  await win.fetch('/api/db', { method: 'POST', body: '{}' });
  expect(calls[0].req!.headers.get('x-aihat-token')).toBe('T0K');
  await win.fetch('/_expo/static/js/web/x.js');
  expect(calls[1].url).toBe('/_expo/static/js/web/x.js');
  await win.fetch('blob:http://127.0.0.1:47321/abc');
  await win.fetch('data:text/plain,hi');
  expect(calls.slice(2).map((c) => c.url)).toEqual(['blob:http://127.0.0.1:47321/abc', 'data:text/plain,hi']);
});

test('window.open and outside links go to the system browser; dropped files never navigate', async () => {
  const { win, calls, listeners } = boot();
  expect(win.__AIHAT__).toEqual({ desktop: true, platform: 'linux', version: '1.0.0' });
  expect(win.open('https://example.com/docs')).toBeNull();
  await Bun.sleep(0);
  expect(calls[0].url).toBe('/api/open');
  expect(JSON.parse(calls[0].init!.body as string)).toEqual({ url: 'https://example.com/docs' });

  let prevented = false;
  const anchor = { tagName: 'A', href: 'https://github.com/x', parentElement: null };
  listeners['doc:click'][0]({ defaultPrevented: false, target: { tagName: 'SPAN', parentElement: anchor }, preventDefault: () => (prevented = true) });
  expect(prevented).toBe(true);
  expect(JSON.parse(calls[1].init!.body as string)).toEqual({ url: 'https://github.com/x' });

  let inApp = false;
  listeners['doc:click'][0]({ defaultPrevented: false, target: { tagName: 'A', href: 'http://127.0.0.1:47321/settings', parentElement: null }, preventDefault: () => (inApp = true) });
  expect(inApp).toBe(false);

  let dropped = false;
  listeners.drop[0]({ preventDefault: () => (dropped = true) });
  expect(dropped).toBe(true);
});
