import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, base_url TEXT NOT NULL,
  headers TEXT NOT NULL DEFAULT '{}', timeout_ms INTEGER NOT NULL DEFAULT 60000,
  is_default INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'unknown', latency_ms INTEGER
);
CREATE TABLE IF NOT EXISTS models (
  id TEXT NOT NULL, provider_id TEXT NOT NULL, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  caps TEXT NOT NULL DEFAULT '{}', defaults TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (id, provider_id)
);
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT, model_id TEXT, prompt_id TEXT, params TEXT NOT NULL DEFAULT '{}',
  tool_ids TEXT NOT NULL DEFAULT '[]', search_mode INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]', tool_calls TEXT NOT NULL DEFAULT '[]', citations TEXT NOT NULL DEFAULT '[]',
  ui_spec TEXT, tokens INTEGER, ms INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, created_at);
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, body TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
  favorite INTEGER NOT NULL DEFAULT 0, preferred_model_id TEXT, tool_ids TEXT NOT NULL DEFAULT '[]',
  variables TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '1.0.0',
  source TEXT NOT NULL DEFAULT 'local', body TEXT NOT NULL DEFAULT '', files TEXT NOT NULL DEFAULT '[]',
  mode TEXT NOT NULL DEFAULT 'auto', enabled INTEGER NOT NULL DEFAULT 1, can_run_scripts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, transport TEXT NOT NULL DEFAULT 'http',
  auth TEXT NOT NULL DEFAULT 'none', tools TEXT NOT NULL DEFAULT '[]', enabled_by_default INTEGER NOT NULL DEFAULT 1,
  is_connector INTEGER NOT NULL DEFAULT 0, connected INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', template TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'send', updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rag_chunks (
  id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, file_name TEXT NOT NULL, idx INTEGER NOT NULL, text TEXT NOT NULL, vec TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rag_chat ON rag_chunks(chat_id);
`;

export function getDb() {
  dbPromise ??= SQLite.openDatabaseAsync('aichat.db').then(async (db) => {
    await db.execAsync(SCHEMA);
    // Columns added after the first release.
    const cols = (await db.getAllAsync<{ name: string }>('PRAGMA table_info(chats)')).map((c) => c.name);
    if (!cols.includes('archived')) await db.execAsync('ALTER TABLE chats ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
    if (!cols.includes('title_locked')) await db.execAsync('ALTER TABLE chats ADD COLUMN title_locked INTEGER NOT NULL DEFAULT 0');
    if (!cols.includes('temporary')) await db.execAsync('ALTER TABLE chats ADD COLUMN temporary INTEGER NOT NULL DEFAULT 0');
    return db;
  });
  return dbPromise;
}

export const json = <T,>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
