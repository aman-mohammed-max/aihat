/**
 * Combine the messages stored in the database with the ones already on screen.
 * On-screen versions win: they include a reply that is still being written, which isn't saved yet.
 * (Replacing the list with the database rows made a just-started reply vanish when a new chat opened.)
 */
export function mergeLoaded<T extends { id: string; createdAt: number }>(fromDb: T[], inMemory: T[]): T[] {
  const mem = new Set(inMemory.map((m) => m.id));
  return [...fromDb.filter((m) => !mem.has(m.id)), ...inMemory].sort((a, b) => a.createdAt - b.createdAt);
}
