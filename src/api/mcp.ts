import { getApiKey } from '@/lib/keys';
import type { McpTool } from '@/store/library';

// Minimal MCP client over Streamable HTTP (JSON-RPC 2.0 via POST). SSE-framed replies are handled too.
// `id` lets the client read the server's token from the keystore (key `mcp.<id>`).
type Conn = { url: string; id?: string; token?: string | null };
const sessions = new Map<string, string>();

let nextId = 1;

async function rpc(c: Conn, method: string, params?: object, notify = false) {
  const token = c.token ?? (c.id ? await getApiKey(`mcp.${c.id}`) : null);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const sid = sessions.get(c.url);
  if (sid) headers['Mcp-Session-Id'] = sid;

  const body = notify
    ? { jsonrpc: '2.0', method, params }
    : { jsonrpc: '2.0', id: nextId++, method, params };
  const res = await fetch(c.url, { method: 'POST', headers, body: JSON.stringify(body) });
  const newSid = res.headers.get('Mcp-Session-Id');
  if (newSid) sessions.set(c.url, newSid);
  if (res.status === 401) throw Object.assign(new Error('Sign-in required'), { status: 401 });
  if (!res.ok) throw new Error(`MCP ${method} failed (${res.status})`);
  if (notify) return null;

  const text = await res.text();
  const ctype = res.headers.get('Content-Type') ?? '';
  let msg: any;
  if (ctype.includes('text/event-stream')) {
    const data = text.split('\n').find((l) => l.startsWith('data:'));
    msg = data ? JSON.parse(data.slice(5)) : {};
  } else {
    msg = JSON.parse(text);
  }
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

const guessKind = (name: string, annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }): McpTool['kind'] => {
  if (annotations?.readOnlyHint) return 'read';
  if (annotations?.destructiveHint || /delete|remove|drop|destroy/i.test(name)) return 'delete';
  if (/create|update|write|send|post|set|insert|edit/i.test(name)) return 'write';
  return 'read';
};

export async function listTools(c: Conn, previous: McpTool[] = []): Promise<McpTool[]> {
  const result = await rpc(c, 'tools/list', {});
  return (result.tools ?? []).map((t: any): McpTool => {
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
