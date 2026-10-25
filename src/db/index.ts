import * as SQLite from 'expo-sqlite';

import { migrate } from './schema';

export { json } from './schema';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  dbPromise ??= SQLite.openDatabaseAsync('aichat.db').then(async (db) => {
    await migrate(db);
    return db;
  });
  return dbPromise;
}
