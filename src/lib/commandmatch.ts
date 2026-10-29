type Named = { name: string; aliases?: string[]; summary: string };

/**
 * Commands that fit what has been typed after the slash, best first: the exact name, then names that start with it,
 * then names that contain it, then (from three letters) a word of the description. Ties keep the list's order.
 */
export function matchCommands<T extends Named>(query: string, list: T[]): T[] {
  const q = query.toLowerCase();
  if (!q) return list;
  const rank = (c: T) => {
    const names = [c.name, ...(c.aliases ?? [])];
    if (names.includes(q)) return 0;
    if (names.some((n) => n.startsWith(q))) return 1;
    if (names.some((n) => n.includes(q))) return 2;
    if (q.length >= 3 && c.summary.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 3;
    return -1;
  };
  return list
    .map((c, i) => ({ c, i, r: rank(c) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.c);
}
