import { connect, listTools } from '@/api/mcp';
import { forget, isSignedIn, signIn, signOut, type OwnClient } from '@/api/oauth';
import { deleteApiKey, setApiKey } from '@/lib/keys';
import { useLibrary, type McpServer } from '@/store/library';

/** Make sure a server added with browser sign-in has a valid sign-in, opening the browser when it doesn't. */
async function ensureSignedIn(id: string, url: string, own?: OwnClient) {
  if (own?.clientId.trim() || !(await isSignedIn(id))) await signIn(id, url, own);
}

/**
 * Save (or update) a server, then handshake and fetch its tools. Returns the saved id or throws. `own`: your own app's
 * client ID for a browser sign-in.
 */
export async function addAndConnect(s: Partial<McpServer> & { name: string; url: string }, token?: string, own?: OwnClient) {
  const lib = useLibrary.getState();
  const before = s.id ? lib.servers.find((x) => x.id === s.id) : undefined;
  const id = await lib.saveServer({ ...s, connected: false });
  if (token !== undefined) {
    if (token) await setApiKey(`mcp.${id}`, token);
    else await deleteApiKey(`mcp.${id}`);
  }
  try {
    // A server that moved to another address needs a new sign-in.
    if (before && before.url !== s.url) await signOut(id);
    if (s.auth === 'oauth') await ensureSignedIn(id, s.url, own);
    await connect({ url: s.url, id });
    const prev = useLibrary.getState().servers.find((x) => x.id === id)?.tools ?? [];
    const tools = await listTools({ url: s.url, id }, prev);
    await lib.saveServer({ ...s, id, tools, connected: true });
    return { id, tools: tools.length };
  } catch (e) {
    await lib.saveServer({ ...s, id, connected: false });
    throw Object.assign(e as Error, { serverId: id });
  }
}

/** Connect an already saved server again (signing in first when it uses the browser and has been signed out). Returns the tool count. */
export async function reconnect(server: McpServer) {
  if (server.auth === 'oauth') await ensureSignedIn(server.id, server.url);
  await connect({ url: server.url, id: server.id });
  const tools = await listTools({ url: server.url, id: server.id }, server.tools);
  await useLibrary.getState().saveServer({ ...server, tools, connected: true });
  return tools.length;
}

/** Remove a server together with everything stored for it in the keystore. */
export async function removeServer(id: string) {
  await deleteApiKey(`mcp.${id}`).catch(() => {});
  await forget(id).catch(() => {});
  await useLibrary.getState().deleteServer(id);
}

export const CONNECTORS = [
  { key: 'github', name: 'GitHub', letter: 'G', sub: 'Code search, issues, pull requests', url: 'https://api.githubcopilot.com/mcp/', auth: 'token' as const },
  { key: 'notion', name: 'Notion', letter: 'N', sub: 'Pages and databases', url: 'https://mcp.notion.com/mcp', auth: 'oauth' as const },
  { key: 'gdrive', name: 'Google Drive', letter: 'D', sub: 'Search, read and save files', url: '', auth: 'token' as const },
  { key: 'gcal', name: 'Google Calendar', letter: 'C', sub: 'Read and create events', url: '', auth: 'token' as const },
  { key: 'slack', name: 'Slack', letter: 'S', sub: 'Search and post messages', url: '', auth: 'token' as const },
  { key: 'icloud', name: 'iCloud Drive', letter: 'i', sub: 'Files on Apple devices', url: '', auth: 'token' as const },
];
