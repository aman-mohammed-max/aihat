import { Directory, File, Paths } from 'expo-file-system';

/**
 * Downloaded models live in Documents/models, one file each, with a small index.json beside them (names, sizes and when
 * they were added). A model's id is "<owner>/<repo>/<file>", the same id the "On this phone" provider lists.
 */
export type LocalModel = { id: string; name: string; size: number; addedAt: number };

export const modelsDir = () => new Directory(Paths.document, 'models');
export const modelId = (repo: string, file: string) => `${repo}/${file}`;

export function parseModelId(id: string) {
  const [owner = '', name = '', ...rest] = id.split('/');
  return { repo: `${owner}/${name}`, file: rest.join('/') };
}

/** The model's file: Documents/models/<owner>__<repo>__<file>. */
export const modelFileOf = (id: string) => new File(modelsDir(), id.replace(/\//g, '__'));

const indexFile = () => new File(modelsDir(), 'index.json');

export function ensureModelsDir() {
  const d = modelsDir();
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

/** The models that are on the device (an entry whose file is gone is left out). */
export async function readIndex(): Promise<LocalModel[]> {
  try {
    const f = indexFile();
    if (!f.exists) return [];
    const list = JSON.parse(await f.text()) as LocalModel[];
    return Array.isArray(list) ? list.filter((m) => m && typeof m.id === 'string' && modelFileOf(m.id).exists) : [];
  } catch {
    return [];
  }
}

export function writeIndex(list: LocalModel[]) {
  ensureModelsDir();
  indexFile().write(JSON.stringify(list));
}
