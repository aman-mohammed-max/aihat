import { connect, listTools } from '@/api/mcp';
import { deleteApiKey, setApiKey } from '@/lib/keys';
import { useLibrary, type McpServer } from '@/store/library';

/** Save (or update) a server, then handshake and fetch its tools. Returns the saved id or throws. */
export async function addAndConnect(s: Partial<McpServer> & { name: string; url: string }, token?: string) {
  const lib = useLibrary.getState();
  const id = await lib.saveServer({ ...s, connected: false });
  if (token !== undefined) {
    if (token) await setApiKey(`mcp.${id}`, token);
    else await deleteApiKey(`mcp.${id}`);
  }
  try {
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

export const CONNECTORS = [
  { key: 'github', name: 'GitHub', sub: 'Code search, issues, pull requests', url: 'https://api.githubcopilot.com/mcp/', auth: 'token' as const },
  { key: 'notion', name: 'Notion', sub: 'Pages and databases', url: 'https://mcp.notion.com/mcp', auth: 'token' as const },
  { key: 'gdrive', name: 'Google Drive', sub: 'Search, read, save files · backups', url: '', auth: 'token' as const },
  { key: 'gcal', name: 'Google Calendar', sub: 'Read and create events', url: '', auth: 'token' as const },
  { key: 'slack', name: 'Slack', sub: 'Search and post messages', url: '', auth: 'token' as const },
  { key: 'icloud', name: 'iCloud Drive', sub: 'Files and backups on Apple devices', url: '', auth: 'token' as const },
];
