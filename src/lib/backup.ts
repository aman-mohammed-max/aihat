import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getDb } from '@/db';
import { useChats } from '@/store/chats';
import { useLibrary } from '@/store/library';
import { useProviders } from '@/store/providers';
import { useSettings } from '@/store/settings';

type Include = { chats: boolean; prompts: boolean; skills: boolean; mcp: boolean; settings: boolean };
const TABLES: Record<keyof Include, string[]> = {
  chats: ['chats', 'messages'],
  prompts: ['prompts'],
  skills: ['skills', 'skill_files'],
  mcp: ['mcp_servers', 'providers', 'models'],
  settings: [],
};

/** Build a JSON backup. API keys live in the keystore and are never read here. */
async function buildBackup(include: Include) {
  const db = await getDb();
  const data: Record<string, unknown[]> = {};
  for (const [k, tables] of Object.entries(TABLES)) {
    if (!include[k as keyof Include]) continue;
    for (const t of tables) data[t] = await db.getAllAsync(`SELECT * FROM ${t}`);
  }
  const { loaded: _l, set: _s, load: _ld, ...settings } = useSettings.getState();
  return JSON.stringify({ app: 'ai-chat', version: 1, exportedAt: new Date().toISOString(), data, settings: include.settings ? settings : undefined });
}

export async function exportBackup(include: Include) {
  const file = new File(Paths.cache, `ai-chat-backup-${Date.now()}.json`);
  file.write(await buildBackup(include));
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save backup' });
  useSettings.getState().set({ lastBackupAt: Date.now() });
  return { bytes: file.size ?? 0, uri: file.uri };
}

const INTERVAL = { daily: 86_400_000, weekly: 7 * 86_400_000 } as const;

/**
 * Scheduled backup: runs when the app opens and one is due. It writes into the app's own
 * documents folder (last 5 kept); sharing to Drive/iCloud is a manual step from "Back up now".
 */
export async function autoBackupIfDue() {
  const s = useSettings.getState();
  if (s.backupSchedule === 'off' || Date.now() - s.lastBackupAt < INTERVAL[s.backupSchedule]) return false;
  const dir = new Directory(Paths.document, 'backups');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  new File(dir, `auto-${Date.now()}.json`).write(await buildBackup(s.backupInclude));
  const files = dir.list().filter((f): f is File => f instanceof File).sort((a, b) => a.name.localeCompare(b.name));
  files.slice(0, Math.max(files.length - 5, 0)).forEach((f) => f.delete());
  s.set({ lastBackupAt: Date.now() });
  return true;
}

export async function importBackup() {
  const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (res.canceled) return null;
  const payload = JSON.parse(await new File(res.assets[0].uri).text());
  if (payload.app !== 'ai-chat') throw new Error('This is not a backup from this app.');
  const db = await getDb();
  for (const [table, rows] of Object.entries(payload.data as Record<string, Record<string, unknown>[]>)) {
    if (!/^[a-z_]+$/.test(table)) continue;
    for (const row of rows) {
      const cols = Object.keys(row);
      await db.runAsync(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...(Object.values(row) as (string | number | null)[]));
    }
  }
  if (payload.settings) useSettings.getState().set(payload.settings);
  await Promise.all([useProviders.getState().load(), useLibrary.getState().load(), useChats.getState().load()]);
  return Object.keys(payload.data).length;
}

export async function eraseAll() {
  const db = await getDb();
  for (const t of ['messages', 'chats', 'prompts', 'skills', 'skill_files', 'mcp_servers', 'models', 'providers', 'rag_chunks']) await db.runAsync(`DELETE FROM ${t}`);
  await db.runAsync('DELETE FROM kv');
  await Promise.all([useProviders.getState().load(), useLibrary.getState().load(), useChats.getState().load(), useSettings.getState().load()]);
}
