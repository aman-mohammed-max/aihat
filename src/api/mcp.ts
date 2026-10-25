import { accessToken } from '@/api/oauth';
import { getApiKey } from '@/lib/keys';
import { useLibrary, type McpTool } from '@/store/library';

// Minimal MCP client over Streamable HTTP (JSON-RPC 2.0 via POST). SSE-framed replies are handled too.
// `id` lets the client read the server's token from the keystore (key `mcp.<id>`).
type Conn = { url: string; id?: string; token?: string | null };
const sessions = new Map<string, string>();

let nextId = 1;

/**
 * The JSON-RPC answer to request `id`. A server may reply with plain JSON, or with an event stream that carries
 * notifications (progress, "tools changed") before the answer, so every `data:` event is read and the one that
 * belongs to this request is returned.
 */
export function pickReply(text: string, contentType: string, id: number): any {
  if (!contentType.includes('text/event-stream')) return JSON.parse(text);
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) continue;
    let msg: any;
    try {
      msg = JSON.parse(data);
    } catch {
      continue;
    }
    if (String(msg?.id) === String(id) && ('result' in msg || 'error' in msg)) return msg;
  }
  throw new Error('The server ended its reply without answering.');
}

async function rpc(c: Conn, method: string, params?: object, notify = false, retried = false): Promise<any> {
  // The token goes in `Authorization: Bearer …` unless the server was set up with another header (from the marketplace).
  const server = c.id ? useLibrary.getState().servers.find((x) => x.id === c.id) : undefined;
  // Servers added with a browser sign-in keep their tokens apart (and renew them); the others use the pasted token.
  const oauth = server?.auth === 'oauth' && !!c.id;
  const token = c.token ?? (oauth ? await accessToken(c.id!) : c.id ? await getApiKey(`mcp.${c.id}`) : null);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(token ? { [server?.authHeader || 'Authorization']: (server?.authTemplate || 'Bearer {token}').replace('{token}', token) } : {}),
  };
  const sid = sessions.get(c.url);
  if (sid) headers['Mcp-Session-Id'] = sid;

  const body = notify
    ? { jsonrpc: '2.0', method, params }
    : { jsonrpc: '2.0', id: nextId++, method, params };
  const res = await fetch(c.url, { method: 'POST', headers, body: JSON.stringify(body) });
  const newSid = res.headers.get('Mcp-Session-Id');
  if (newSid) sessions.set(c.url, newSid);
  if (res.status === 401) {
    // An expired or revoked token: try one renewal before asking you to sign in again.
    if (oauth && !retried && (await accessToken(c.id!, true))) return rpc(c, method, params, notify, true);
    throw Object.assign(new Error(oauth ? 'Signed out. Sign in again.' : 'Sign-in required'), { status: 401, oauth });
  }
  if (!res.ok) throw new Error(`MCP ${method} failed (${res.status})`);
  if (notify) return null;

  const text = await res.text();
  const msg = pickReply(text, res.headers.get('Content-Type') ?? '', body.id!);
  if (msg.error) throw new Error(msg.error.message ?? 'MCP error');
  return msg.result;
}

export async function connect(c: Conn) {
  sessions.delete(c.url);
  await rpc(c, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'ai-chat', version: '1.0.0' },
  });
  await rpc(c, 'notifications/initialized', undefined, true);
}

const words = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const READ_FIRST = new Set('get list read search find fetch query describe show view lookup check count resolve ask retrieve browse explain inspect preview validate compare calculate convert translate summarize summarise analyze analyse echo ping whoami'.split(' '));
const DELETE_WORDS = new Set('delete remove drop destroy purge wipe erase truncate unlink uninstall revoke terminate kill'.split(' '));
const WRITE_WORDS = new Set(
  'create update write send post set insert edit put patch add save upload import publish push commit merge apply deploy install run exec execute eval shell bash python command script code spawn start stop restart transfer pay charge purchase order invite share grant approve reset migrate rename move copy cancel submit'.split(' '),
);

/**
 * How careful to be with a tool, from the server's own hints and its name. Anything that changes things or runs code is
 * "write" (asks first); tools named like a lookup (`get_…`, `search_…`) read freely.
 */
export function guessKind(name: string, annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }): McpTool['kind'] {
  if (annotations?.readOnlyHint) return 'read';
  const w = words(name);
  if (annotations?.destructiveHint || w.some((x) => DELETE_WORDS.has(x))) return 'delete';
  if (READ_FIRST.has(w[0])) return 'read';
  return w.some((x) => WRITE_WORDS.has(x)) ? 'write' : 'read';
}

export async function listTools(c: Conn, previous: McpTool[] = []): Promise<McpTool[]> {
  // Servers with many tools hand them out a page at a time.
  const found: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const result = await rpc(c, 'tools/list', cursor ? { cursor } : {});
    found.push(...(result.tools ?? []));
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return found.map((t: any): McpTool => {
    const prev = previous.find((p) => p.name === t.name);
    const kind = guessKind(t.name, t.annotations);
    return {
      name: t.name,
      description: t.description,
      schema: t.inputSchema,
      kind,
      // Writes and deletes ask by default; reads run automatically.
      policy: prev?.policy ?? (kind === 'read' ? 'auto' : 'ask'),
    };
  });
}

export async function callTool(c: Conn, name: string, args: object): Promise<string> {
  const result = await rpc(c, 'tools/call', { name, arguments: args });
  const text = (result.content ?? []).map((p: any) => (p.type === 'text' ? p.text : `[${p.type}]`)).join('\n');
  if (result.isError) throw new Error(text || 'Tool failed');
  return text;
}
