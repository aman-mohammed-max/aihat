import { File, Paths, type DownloadTask } from 'expo-file-system';
import { create } from 'zustand';

import { device } from '@/lib/device';
import { fileUrl, gb, prettyRepo, quantOf } from '@/lib/local/catalog';
import { unloadModel } from '@/lib/local/engine';
import { ensureModelsDir, modelFileOf, modelId, readIndex, writeIndex, type LocalModel } from '@/lib/local/files';
import { isLocalProvider, LOCAL_URL } from '@/lib/local/provider';
import { useProviders } from '@/store/providers';
import { toast } from '@/store/toast';

/** A download in progress (or paused, or failed and waiting for a retry). */
export type Job = { id: string; repo: string; file: string; name: string; size: number; written: number; state: 'active' | 'paused' | 'failed'; error?: string };

type State = {
  models: LocalModel[];
  jobs: Record<string, Job>;
  load: () => Promise<void>;
  download: (spec: { repo: string; file: string; size: number; name?: string }) => Promise<void>;
  pause: (id: string) => void;
  resume: (id: string) => Promise<void>;
  cancel: (id: string) => void;
  remove: (id: string) => Promise<void>;
};

const tasks = new Map<string, DownloadTask>();
const partOf = (id: string) => new File(`${modelFileOf(id).uri}.part`);

/** "Qwen3.5 4B · Q4_K_M". */
const nameFor = (repo: string, file: string, name?: string) => [name ?? prettyRepo(repo), quantOf(file)].filter(Boolean).join(' · ');

/** The "On this phone" provider, made the first time a model is downloaded. */
async function localProvider() {
  const st = useProviders.getState();
  const found = st.providers.find(isLocalProvider);
  if (found) return found.id;
  return st.add({ name: `On this ${device}`, baseUrl: LOCAL_URL, headers: {}, timeoutMs: 120_000 });
}

/** Show a downloaded model in the model picker (models on the device don't use tools). */
async function listInPicker(m: LocalModel) {
  const pid = await localProvider();
  const st = useProviders.getState();
  if (!st.models.some((x) => x.providerId === pid && x.id === m.id)) await st.addModel(pid, { id: m.id, name: m.name, kind: 'chat' });
  await useProviders.getState().updateModel(pid, m.id, { tools: false });
}

export const useLocalModels = create<State>((set, get) => {
  const setJob = (id: string, patch: Partial<Job>) =>
    set((s) => (s.jobs[id] || patch.repo ? { jobs: { ...s.jobs, [id]: { ...(s.jobs[id] as Job), ...patch } } } : s));
  const dropJob = (id: string) =>
    set((s) => {
      const jobs = { ...s.jobs };
      delete jobs[id];
      return { jobs };
    });

  /** Wait for a started or resumed transfer, then put the file in place. A pause resolves with null and leaves the job. */
  async function settle(id: string, run: Promise<File | null>) {
    try {
      const got = await run;
      if (!got) return setJob(id, { state: 'paused' });
      const job = get().jobs[id];
      const part = partOf(id);
      if (job?.size && part.size && Math.abs(part.size - job.size) > 0) throw new Error(`The download is incomplete (${gb(part.size)} of ${gb(job.size)}). Try again.`);
      const target = modelFileOf(id);
      if (target.exists) target.delete();
      part.move(target);
      const entry: LocalModel = { id, name: job?.name ?? id, size: target.size ?? job?.size ?? 0, addedAt: Date.now() };
      const models = [...get().models.filter((m) => m.id !== id), entry];
      writeIndex(models);
      set({ models });
      dropJob(id);
      tasks.delete(id);
      await listInPicker(entry);
      toast(`${entry.name} is ready to use`);
    } catch (e: any) {
      tasks.delete(id);
      if (!get().jobs[id]) return; // cancelled
      setJob(id, { state: 'failed', error: e?.message ?? 'The download failed.' });
    }
  }

  return {
    models: [],
    jobs: {},

    async load() {
      const models = await readIndex();
      set({ models });
      // Keep the picker in step with what is on the device.
      for (const m of models) await listInPicker(m).catch(() => {});
    },

    async download({ repo, file, size, name }) {
      const id = modelId(repo, file);
      if (get().models.some((m) => m.id === id) || tasks.has(id)) return;
      const free = Paths.availableDiskSpace;
      if (size && free && free < size + 300e6) throw new Error(`Not enough free space: this model needs ${gb(size)} and ${gb(free)} is free.`);
      ensureModelsDir();
      const part = partOf(id);
      if (part.exists) part.delete();
      const task = File.createDownloadTask(fileUrl(repo, file), part, {
        onProgress: ({ bytesWritten, totalBytes }) => setJob(id, { written: bytesWritten, ...(totalBytes > 0 ? { size: totalBytes } : {}) }),
      });
      tasks.set(id, task);
      setJob(id, { id, repo, file, name: nameFor(repo, file, name), size, written: 0, state: 'active', error: undefined });
      await settle(id, task.downloadAsync());
    },

    pause(id) {
      tasks.get(id)?.pause();
    },

    async resume(id) {
      const job = get().jobs[id];
      const task = tasks.get(id);
      if (!job) return;
      if (task && job.state === 'paused') {
        setJob(id, { state: 'active', error: undefined });
        return settle(id, task.resumeAsync());
      }
      // A failed download starts again from the beginning.
      dropJob(id);
      tasks.delete(id);
      return get().download({ repo: job.repo, file: job.file, size: job.size });
    },

    cancel(id) {
      const task = tasks.get(id);
      tasks.delete(id);
      dropJob(id);
      try {
        task?.cancel();
      } catch {
        /* already finished */
      }
      try {
        const part = partOf(id);
        if (part.exists) part.delete();
      } catch {
        /* nothing to clean up */
      }
    },

    async remove(id) {
      await unloadModel();
      const f = modelFileOf(id);
      if (f.exists) f.delete();
      const models = get().models.filter((m) => m.id !== id);
      writeIndex(models);
      set({ models });
      const st = useProviders.getState();
      const p = st.providers.find(isLocalProvider);
      if (!p) return;
      await st.deleteModel(p.id, id);
      // No models left: the provider goes too, so the picker doesn't show an empty "On this phone".
      if (!models.length) await useProviders.getState().remove(p.id);
    },
  };
});
