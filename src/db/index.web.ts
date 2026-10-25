import { migrate } from './schema';

export { json } from './schema';

type Param = string | number | boolean | null;
type Op = 'exec' | 'all' | 'first' | 'run';

/** Run one statement in the desktop app's database (SQLite in its Bun backend). */
async function send<T>(op: Op, sql: string, params: unknown[]): Promise<T> {
  // expo-sqlite takes the values either spread out or as one array.
  const values = (params.length === 1 && Array.isArray(params[0]) ? params[0] : params) as Param[];
  const res = await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, sql, params: values }) });
  const data = await res.json().catch(() => ({ error: `The database answered ${res.status}.` }));
  if (!res.ok) throw new Error(data.error ?? `The database answered ${res.status}.`);
  return data.result as T;
}

/** The part of expo-sqlite's database the app uses, backed by the desktop app. */
const db = {
  execAsync: (sql: string) => send<null>('exec', sql, []),
  getAllAsync: <T,>(sql: string, ...params: unknown[]) => send<T[]>('all', sql, params),
  getFirstAsync: <T,>(sql: string, ...params: unknown[]) => send<T | null>('first', sql, params),
  runAsync: (sql: string, ...params: unknown[]) => send<{ lastInsertRowId: number; changes: number }>('run', sql, params),
};

let ready: Promise<typeof db> | null = null;

export function getDb() {
  ready ??= migrate(db).then(() => db);
  return ready;
}
