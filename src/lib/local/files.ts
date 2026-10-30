import { Directory, File, Paths } from 'expo-file-system';
import { findLegacyModelAliases, modelStorageSegments, recoverAtomicFile, writeAtomicFile } from './download-core.mjs';

/**
 * Downloaded models live under Documents/models/files/<owner>/<repo>/<file path>, with a small index.json beside them.
 * A model's id is "<owner>/<repo>/<file>", the same id the "On this phone" provider lists.
 */
export type LocalModel = { id: string; name: string; size: number; addedAt: number; sha256?: string; revision?: string };

export const modelsDir = () => new Directory(Paths.document, 'models');
export const modelId = (repo: string, file: string) => `${repo}/${file}`;

function isSafeModelId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  try {
    modelStorageSegments(id);
    return true;
  } catch {
    return false;
  }
}

function isLocalModel(value: unknown): value is LocalModel {
  if (!value || typeof value !== 'object') return false;
  const model = value as Partial<LocalModel>;
  return isSafeModelId(model.id) && typeof model.name === 'string' && model.name.length > 0 && model.name.length <= 300 &&
    Number.isSafeInteger(model.size) && model.size! >= 0 && Number.isFinite(model.addedAt) &&
    (model.sha256 === undefined || /^[0-9a-f]{64}$/i.test(model.sha256)) &&
    (model.revision === undefined || typeof model.revision === 'string');
}

export function parseModelId(id: string) {
  const [owner = '', name = '', ...rest] = id.split('/');
  return { repo: `${owner}/${name}`, file: rest.join('/') };
}

const legacyModelFileOf = (id: string) => new File(modelsDir(), id.replace(/\//g, '__'));
const canonicalModelFileOf = (id: string) => {
  const parts = modelStorageSegments(id);
  return new File(new Directory(modelsDir(), ...parts.slice(0, -1)), parts[parts.length - 1]!);
};

// Existing installs stay at their original path so saved background-task destinations remain valid.
let legacyModelIds = new Set<string>();
export const modelFileOf = (id: string) => {
  const canonical = canonicalModelFileOf(id);
  if (canonical.exists || !legacyModelIds.has(id)) return canonical;
  const legacy = legacyModelFileOf(id);
  return legacy.exists ? legacy : canonical;
};

const indexFile = () => new File(modelsDir(), 'index.json');
const indexBackup = () => new File(modelsDir(), 'index.json.previous');
const indexNext = () => new File(modelsDir(), 'index.json.next');

let indexOperations: Promise<void> = Promise.resolve();

function enqueueIndexOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = indexOperations.then(operation);
  indexOperations = result.then(() => undefined, () => undefined);
  return result;
}

export function ensureModelsDir() {
  const d = modelsDir();
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

function indexOps() {
  return {
    exists: (uri: string) => new File(uri).exists,
    isValid: async (uri: string) => {
      try {
        const file = new File(uri);
        if ((file.size ?? Number.POSITIVE_INFINITY) > 1_048_576) return false;
        const value: unknown = JSON.parse(await file.text());
        return Array.isArray(value);
      } catch {
        return false;
      }
    },
    move: async (from: string, to: string) => new File(from).move(new File(to)),
    remove: (uri: string) => {
      const file = new File(uri);
      if (file.exists) file.delete();
    },
  };
}

async function readIndexOnDisk(): Promise<LocalModel[]> {
  try {
    const f = indexFile();
    await recoverAtomicFile({ target: f.uri, backup: indexBackup().uri, next: indexNext().uri, ...indexOps() });
    if (!f.exists) {
      legacyModelIds = new Set();
      return [];
    }
    const list: unknown = JSON.parse(await f.text());
    const valid = Array.isArray(list) ? list.filter((m): m is LocalModel => isLocalModel(m)) : [];
    legacyModelIds = new Set(findLegacyModelAliases(valid, {
      canonicalExists: (id) => canonicalModelFileOf(id).exists,
      legacyExists: (id) => legacyModelFileOf(id).exists,
    }));
    return valid.filter((model) => modelFileOf(model.id).exists);
  } catch {
    legacyModelIds = new Set();
    return [];
  }
}

/** The models that are on the device (an entry whose file is gone is left out). */
export function readIndex(): Promise<LocalModel[]> {
  return enqueueIndexOperation(readIndexOnDisk);
}

/** Serialize index mutations so concurrent model installs cannot overwrite one another. */
export function updateIndex(update: (models: LocalModel[]) => LocalModel[]): Promise<LocalModel[]> {
  return enqueueIndexOperation(async () => {
    const models = update(await readIndexOnDisk());
    ensureModelsDir();
    const f = indexFile();
    await writeAtomicFile({
      target: f.uri,
      backup: indexBackup().uri,
      next: indexNext().uri,
      content: JSON.stringify(models),
      write: async (uri, content) => new File(uri).write(content),
      ...indexOps(),
    });
    legacyModelIds = new Set(findLegacyModelAliases(models, {
      canonicalExists: (id) => canonicalModelFileOf(id).exists,
      legacyExists: (id) => legacyModelFileOf(id).exists,
    }));
    return models;
  });
}
