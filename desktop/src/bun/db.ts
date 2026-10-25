import { Database, type SQLQueryBindings } from 'bun:sqlite';

export type DbOp = 'exec' | 'all' | 'first' | 'run';

/**
 * The app's SQLite file. The web build sends the same SQL the phone app runs through expo-sqlite, and gets the same
 * shapes back: rows for `all`, one row or null for `first`, { lastInsertRowId, changes } for `run`.
 */
export function openDb(file: string) {
  const db = new Database(file, { create: true });
  db.exec('PRAGMA busy_timeout = 3000');
  return {
    run(op: DbOp, sql: string, params: SQLQueryBindings[] = []) {
      switch (op) {
        case 'exec':
          db.exec(sql);
          return null;
        case 'all':
          return db.query(sql).all(...params);
        case 'first':
          return db.query(sql).get(...params) ?? null;
        case 'run': {
          const r = db.run(sql, params);
          return { lastInsertRowId: Number(r.lastInsertRowid), changes: r.changes };
        }
        default:
          throw new Error(`Unknown database operation: ${String(op)}`);
      }
    },
    close: () => db.close(),
  };
}
