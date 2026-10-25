import { create } from 'zustand';

import { getDb } from '@/db';
import { now, uid } from '@/lib/id';

/** A slash command the user wrote: `/name some text` becomes the template with {input} filled in. */
export type CustomCommand = { id: string; name: string; description: string; template: string; mode: 'send' | 'insert' };

type State = {
  items: CustomCommand[];
  load: () => Promise<void>;
  save: (c: Partial<CustomCommand> & { name: string; template: string }) => Promise<{ ok: boolean; error?: string }>;
  remove: (id: string) => Promise<void>;
};

export const COMMAND_NAME = /^[a-z0-9][a-z0-9_-]{0,23}$/;

export const useCommands = create<State>((set, get) => ({
  items: [],

  async load() {
    const db = await getDb();
    const rows = await db.getAllAsync<any>('SELECT * FROM commands ORDER BY name');
    set({ items: rows.map((r): CustomCommand => ({ id: r.id, name: r.name, description: r.description, template: r.template, mode: r.mode })) });
  },

  async save(c) {
    const name = c.name.trim().replace(/^\//, '').toLowerCase();
    if (!COMMAND_NAME.test(name)) return { ok: false, error: 'Use 1–24 letters, numbers, - or _ (no spaces).' };
    if (!c.template.trim()) return { ok: false, error: 'Write what the command should send.' };
    if (get().items.some((x) => x.name === name && x.id !== c.id)) return { ok: false, error: `/${name} already exists.` };
    const db = await getDb();
    const id = c.id ?? uid();
    await db.runAsync(
      `INSERT INTO commands (id,name,description,template,mode,updated_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, template=excluded.template, mode=excluded.mode, updated_at=excluded.updated_at`,
      id, name, c.description?.trim() ?? '', c.template, c.mode ?? 'send', now(),
    );
    await get().load();
    return { ok: true };
  },

  async remove(id) {
    await (await getDb()).runAsync('DELETE FROM commands WHERE id=?', id);
    await get().load();
  },
}));
