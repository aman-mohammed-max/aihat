import { DownloadTask, File, Paths, type DownloadPauseState } from 'expo-file-system';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { device } from '@/lib/device';
import { fileUrl, gb, prettyRepo, quantOf, repoFiles, repoInfo } from '@/lib/local/catalog';
import { assertStorageCapacity, availableAfterReservations, createDownloadScheduler, finishDownloadTask, pausedDownloadReservations, promoteVerifiedDownload, recoverAtomicFileSync, recoverDownloadJob, recoverInterruptedPromotion, validateDownloadedModel, writeAtomicFileSync } from '@/lib/local/download-core.mjs';
import { unloadModel } from '@/lib/local/engine';
import { ensureModelsDir, modelFileOf, modelId, readIndex, updateIndex, type LocalModel } from '@/lib/local/files';
import { isLocalProvider, LOCAL_URL } from '@/lib/local/provider';
import { useLocalInference } from '@/store/localInference';
import { useProviders } from '@/store/providers';
import { toast } from '@/store/toast';

/** A model transfer or install, including work waiting for a native download slot. */
export type Job = { id: string; repo: string; file: string; name: string; size: number; written: number; state: 'queued' | 'active' | 'paused' | 'verifying' | 'installing' | 'failed'; queuedAt?: number; sha256?: string; revision?: string; error?: string };

type State = {
  models: LocalModel[];
  jobs: Record<string, Job>;
  load: () => Promise<void>;
  download: (spec: { repo: string; file: string; size: number; name?: string; sha256?: string; revision?: string }) => Promise<void>;
  pause: (id: string) => void;
  resume: (id: string) => Promise<void>;
  cancel: (id: string) => void;
  remove: (id: string) => Promise<void>;
};

const tasks = new Map<string, DownloadTask>();
const activeReservations = new Map<string, number>();
const startingDownloads = new Set<string>();
const cancelledStartingDownloads = new Set<string>();
const downloadScheduler = createDownloadScheduler(2);
const partOf = (id: string) => new File(`${modelFileOf(id).uri}.part`);
const jobsFile = () => new File(ensureModelsDir(), 'downloads.json');
const jobsBackup = () => new File(`${jobsFile().uri}.previous`);
const jobsNext = () => new File(`${jobsFile().uri}.next`);

type SavedJob = { job: Job; state?: DownloadPauseState; phase?: 'installing' | 'cancelling' };

function savedJobsOps() {
  return {
    exists: (uri: string) => new File(uri).exists,
    isValid: (uri: string) => {
      try {
        const file = new File(uri);
        if ((file.size ?? Number.POSITIVE_INFINITY) > 1_048_576) return false;
        const value: unknown = JSON.parse(file.textSync());
        return !!value && typeof value === 'object' && !Array.isArray(value);
      } catch {
        return false;
      }
    },
    move: (from: string, to: string) => new File(from).moveSync(new File(to)),
    remove: (uri: string) => {
      const file = new File(uri);
      if (file.exists) file.delete();
    },
  };
}

function readSavedJobs(): Record<string, SavedJob> {
  const file = jobsFile();
  recoverAtomicFileSync({ target: file.uri, backup: jobsBackup().uri, next: jobsNext().uri, ...savedJobsOps() });
  if (!file.exists) return {};
  const saved: unknown = JSON.parse(file.textSync());
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved as Record<string, SavedJob> : {};
}

function writeSavedJobs(saved: Record<string, SavedJob>) {
  const file = jobsFile();
  writeAtomicFileSync({
    target: file.uri,
    backup: jobsBackup().uri,
    next: jobsNext().uri,
    content: JSON.stringify(saved),
    write: (uri, content) => new File(uri).writeSync(content),
    ...savedJobsOps(),
  });
}

function saveJob(job: Job, state?: DownloadPauseState, phase?: SavedJob['phase']) {
  try {
    const saved = readSavedJobs();
    saved[job.id] = { job, ...(state ? { state } : {}), ...(phase ? { phase } : {}) };
    writeSavedJobs(saved);
    return true;
  } catch {
    // Keep the in-memory job usable if the small recovery index cannot be written.
    return false;
  }
}

function savePausedJob(id: string, job: Job, task: DownloadTask | undefined) {
  if (!task || task.state !== 'paused') return;
  try {
    saveJob(job, task.savable());
  } catch {
    // Keep the in-memory job usable; a later retry can restart if resume data was not persisted.
  }
}

function forgetSavedJob(id: string) {
  try {
    const saved = readSavedJobs();
    if (!(id in saved)) return;
    delete saved[id];
    writeSavedJobs(saved);
  } catch {
    // A stale resume record is ignored during startup if it cannot be read.
  }
}

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
  const reserveStorage = (id: string, bytesNeeded: number) => {
    const active = [...activeReservations.entries()].reduce((sum, [otherId, remaining]) => sum + (otherId === id ? 0 : remaining), 0);
    const paused = pausedDownloadReservations(get().jobs, id);
    const available = availableAfterReservations(Paths.availableDiskSpace, active + paused);
    try {
      assertStorageCapacity(bytesNeeded, available);
    } catch {
      throw new Error(`Not enough free space: this model needs ${gb(bytesNeeded)} plus an installation reserve, with ${gb(available)} available after other downloads.`);
    }
    activeReservations.set(id, bytesNeeded);
  };

  /** Wait for a started or resumed transfer, then put the file in place. A pause resolves with null and leaves the job. */
  async function settle(id: string, run: Promise<File | null>) {
    const task = tasks.get(id);
    try {
      const got = await run;
      if (!got) {
        const paused = { ...get().jobs[id], state: 'paused' as const };
        setJob(id, paused);
        savePausedJob(id, paused, tasks.get(id));
        return;
      }
      const job = get().jobs[id];
      if (!job) {
        try {
          const orphan = partOf(id);
          if (orphan.exists) orphan.delete();
        } catch {
          // A later retry or startup recovery removes a partial the filesystem kept open.
        }
        forgetSavedJob(id);
        return;
      }
      setJob(id, { state: 'verifying' });
      const part = partOf(id);
      const actualHash = job?.sha256 ? await part.digest('SHA-256') : undefined;
      const handle = part.open();
      let magic: Uint8Array;
      try {
        magic = handle.readBytesSync(4);
      } finally {
        handle.close();
      }
      validateDownloadedModel({
        size: part.size ?? 0,
        expectedSize: job?.size,
        sha256: actualHash,
        expectedSha256: job?.sha256,
        magic: String.fromCharCode(...magic),
      });
      const target = modelFileOf(id);
      const backup = new File(`${target.uri}.previous`);
      setJob(id, { state: 'installing' });
      if (!saveJob({ ...job, state: 'installing' }, undefined, 'installing')) throw new Error('Could not save the model installation recovery record. Free storage and retry.');
      await promoteVerifiedDownload({
        part: part.uri,
        target: target.uri,
        backup: backup.uri,
        exists: (uri) => new File(uri).exists,
        move: (from, to) => new File(from).move(new File(to)),
        remove: (uri) => new File(uri).delete(),
        beforePromote: async () => {
          if (useLocalInference.getState().modelId === id) await unloadModel();
        },
        commit: async () => {
          const entry: LocalModel = { id, name: job.name, size: target.size ?? job.size, addedAt: Date.now(), ...(job.sha256 ? { sha256: job.sha256 } : {}), ...(job.revision ? { revision: job.revision } : {}) };
          const models = await updateIndex((current) => [...current.filter((m) => m.id !== id), entry]);
          set({ models });
        },
      });
      forgetSavedJob(id);
      dropJob(id);
      const entry = get().models.find((m) => m.id === id)!;
      await listInPicker(entry).catch(() => {});
      toast(`${entry.name} is ready to use`);
    } catch (e: any) {
      const existing = get().jobs[id];
      if (existing) {
        const failed = { ...existing, written: partOf(id).size ?? existing.written, state: 'failed' as const, error: e?.message ?? 'The download failed.' };
        setJob(id, failed);
        saveJob(failed);
      }
      if (!get().jobs[id]) {
        try {
          const part = partOf(id);
          if (part.exists) part.delete();
        } catch {
          // A later retry or startup recovery removes a partial the filesystem kept open.
        }
        forgetSavedJob(id);
        return; // cancelled after the native task reached its terminal state
      }
    } finally {
      await finishDownloadTask(task, Platform.OS);
      if (task && task.state !== 'paused' && tasks.get(id) === task) tasks.delete(id);
    }
  }

  return {
    models: [],
    jobs: {},

    async load() {
      const models = await readIndex();
      const jobs: Record<string, Job> = {};
      try {
        const file = jobsFile();
        const saved = readSavedJobs();
        if (file.exists) {
          for (const [id, item] of Object.entries(saved)) {
            const job = item?.job;
            const validJob = !!job && job.id === id && typeof job.repo === 'string' && typeof job.file === 'string' && modelId(job.repo, job.file) === id &&
              typeof job.name === 'string' && job.name.length > 0 && job.name.length <= 300 && Number.isSafeInteger(job.size) && job.size >= 0 &&
              Number.isSafeInteger(job.written) && job.written >= 0 && ['queued', 'active', 'paused', 'verifying', 'installing', 'failed'].includes(job.state) &&
              (job.queuedAt === undefined || (Number.isSafeInteger(job.queuedAt) && job.queuedAt >= 0)) &&
              (job.sha256 === undefined || /^[0-9a-f]{64}$/i.test(job.sha256)) &&
              (job.revision === undefined || job.revision === 'main' || /^[0-9a-f]{7,64}$/i.test(job.revision)) &&
              (item.phase === undefined || item.phase === 'installing' || item.phase === 'cancelling');
            if (!validJob) {
              delete saved[id];
              continue;
            }
            try {
              modelFileOf(id);
            } catch {
              delete saved[id];
              continue;
            }
            if (item.phase === 'cancelling') {
              const part = partOf(id);
              if (part.exists) part.delete();
              delete saved[id];
              continue;
            }
            if (item.phase === 'installing') {
              const target = modelFileOf(id);
              const backup = new File(`${target.uri}.previous`);
              const outcome = await recoverInterruptedPromotion({
                target: target.uri,
                backup: backup.uri,
                part: partOf(id).uri,
                indexed: models.some((m) => m.id === id && m.revision === item.job.revision),
                exists: (uri) => new File(uri).exists,
                move: (from, to) => new File(from).move(new File(to)),
                remove: (uri) => new File(uri).delete(),
              });
              if (outcome === 'committed') {
                delete saved[id];
              } else {
                const recovered = recoverDownloadJob(item.job, false, partOf(id).size);
                jobs[id] = recovered as Job;
                saved[id] = { job: recovered as Job };
              }
              continue;
            }
            const installedModel = models.find((m) => m.id === id);
            if (installedModel?.revision === item.job.revision) {
              const backup = new File(`${modelFileOf(id).uri}.previous`);
              if (backup.exists) backup.delete();
              delete saved[id];
              continue;
            }
            try {
              if (item.state) {
                const task = DownloadTask.fromSavable(item.state, {
                  deferBackgroundSessionCompletion: Platform.OS === 'ios',
                  onProgress: ({ bytesWritten, totalBytes }) => setJob(id, { written: bytesWritten, ...(totalBytes > 0 ? { size: totalBytes } : {}) }),
                });
                tasks.set(id, task);
                jobs[id] = recoverDownloadJob(item.job, true, partOf(id).size) as Job;
              } else {
                jobs[id] = recoverDownloadJob(item.job, false, partOf(id).size) as Job;
              }
            } catch {
              delete saved[id];
            }
          }
          writeSavedJobs(saved);
        }
      } catch {
        // A malformed download index must not prevent already installed models from loading.
      }
      set({ models, jobs });
      // A completed native task may leave a full .part file while JavaScript was suspended. Verify it on startup;
      // Expo does not restore DownloadTask state after process termination, so incomplete files are retryable.
      for (const job of Object.values(jobs)) {
        if (job.state === 'verifying') void settle(job.id, Promise.resolve(partOf(job.id)));
      }
      for (const job of Object.values(jobs).filter((item) => item.state === 'queued').sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0))) {
        void get().download({ repo: job.repo, file: job.file, size: job.size, name: job.name, sha256: job.sha256, revision: job.revision }).catch(() => {});
      }
      // Keep the picker in step with what is on the device.
      for (const m of models) await listInPicker(m).catch(() => {});
    },

    async download({ repo, file, size, name, sha256, revision }) {
      const id = modelId(repo, file);
      if (tasks.has(id) || startingDownloads.has(id)) return;
      startingDownloads.add(id);
      let enqueued = false;
      try {
        let pinnedRevision = revision;
        let expectedSha256 = sha256;
        let expectedSize = size;
        if (!pinnedRevision) {
          const info = await repoInfo(repo);
          pinnedRevision = info.revision ?? 'main';
          const publishedFile = (await repoFiles(repo, pinnedRevision)).find((entry) => entry.path === file);
          if (publishedFile) {
            expectedSha256 ??= publishedFile.sha256;
            expectedSize = publishedFile.size || expectedSize;
          }
        }
        if (cancelledStartingDownloads.has(id)) return;
        const installed = get().models.find((m) => m.id === id);
        if (installed && installed.revision === pinnedRevision) return;
        const target = modelFileOf(id);
        if (get().models.some((model) => model.id !== id && modelFileOf(model.id).uri === target.uri)) {
          throw new Error('This older model shares its storage file with another install. Remove the duplicate model before replacing it.');
        }
        reserveStorage(id, expectedSize);
        ensureModelsDir();
        target.parentDirectory.create({ intermediates: true, idempotent: true });
        const queued: Job = {
          id, repo, file, name: nameFor(repo, file, name), size: expectedSize, written: 0,
          state: 'queued', queuedAt: Date.now(), sha256: expectedSha256, revision: pinnedRevision,
        };
        setJob(id, queued);
        if (!saveJob(queued)) {
          dropJob(id);
          throw new Error('Could not save the model download recovery record. Free storage and retry.');
        }
        enqueued = true;
        await downloadScheduler.enqueue(id, async () => {
          if (cancelledStartingDownloads.has(id) || !get().jobs[id]) return;
          const part = partOf(id);
          if (part.exists) part.delete();
          const task = File.createDownloadTask(fileUrl(repo, file, pinnedRevision), part, {
            sessionType: 'background',
            deferBackgroundSessionCompletion: Platform.OS === 'ios',
            onProgress: ({ bytesWritten, totalBytes }) => {
              if (activeReservations.has(id)) activeReservations.set(id, Math.max(0, (totalBytes > 0 ? totalBytes : expectedSize) - bytesWritten));
              setJob(id, { written: bytesWritten, ...(totalBytes > 0 ? { size: totalBytes } : {}) });
            },
          });
          tasks.set(id, task);
          setJob(id, { state: 'active' });
          const activeJob = get().jobs[id];
          if (!activeJob || !saveJob(activeJob)) {
            tasks.delete(id);
            task.release();
            dropJob(id);
            throw new Error('Could not save the model download recovery record. Free storage and retry.');
          }
          await settle(id, task.downloadAsync());
        });
      } catch (error) {
        const existing = get().jobs[id];
        if (existing && (enqueued || existing.state === 'queued')) {
          const failed = { ...existing, state: 'failed' as const, error: error instanceof Error ? error.message : 'The download could not be started.' };
          setJob(id, failed);
          saveJob(failed);
        }
        throw error;
      } finally {
        activeReservations.delete(id);
        startingDownloads.delete(id);
        cancelledStartingDownloads.delete(id);
      }
    },

    pause(id) {
      tasks.get(id)?.pause();
    },

    async resume(id) {
      const job = get().jobs[id];
      const task = tasks.get(id);
      if (!job || (job.state !== 'paused' && job.state !== 'failed')) return;
      if (task && job.state === 'paused') {
        try {
          reserveStorage(id, Math.max(0, job.size - job.written));
        } catch (error) {
          toast(error instanceof Error ? error.message : 'Not enough free space to resume this model download.');
          return;
        }
        const queued = { ...job, state: 'queued' as const, queuedAt: job.queuedAt ?? Date.now(), error: undefined };
        setJob(id, queued);
        if (!saveJob(queued, task.savable())) {
          setJob(id, { state: 'paused' });
          activeReservations.delete(id);
          toast('Could not save the download recovery record. Free storage and retry.');
          return;
        }
        startingDownloads.add(id);
        try {
          await downloadScheduler.enqueue(id, async () => {
            if (cancelledStartingDownloads.has(id) || !get().jobs[id]) return;
            setJob(id, { state: 'active' });
            const activeJob = get().jobs[id];
            if (activeJob) saveJob(activeJob, task.savable());
            await settle(id, task.resumeAsync());
          });
        } catch (error) {
          const current = get().jobs[id];
          if (current) {
            const failed = { ...current, written: partOf(id).size ?? current.written, state: 'failed' as const, error: error instanceof Error ? error.message : 'The download could not be resumed.' };
            setJob(id, failed);
            saveJob(failed);
          }
          toast(error instanceof Error ? error.message : 'The download could not be resumed.');
        } finally {
          activeReservations.delete(id);
          startingDownloads.delete(id);
          cancelledStartingDownloads.delete(id);
        }
        return;
      }
      // A failed download starts again from the beginning.
      forgetSavedJob(id);
      dropJob(id);
      task?.release();
      tasks.delete(id);
      return get().download({ repo: job.repo, file: job.file, size: job.size, name: job.name, sha256: job.sha256, revision: job.revision });
    },

    cancel(id) {
      const task = tasks.get(id);
      const wasActive = task?.state === 'active';
      const job = get().jobs[id];
      if (job?.state === 'verifying' || job?.state === 'installing') return;
      if (job?.state === 'queued' && startingDownloads.has(id)) cancelledStartingDownloads.add(id);
      downloadScheduler.cancel(id);
      if (wasActive && job) saveJob(job, undefined, 'cancelling');
      dropJob(id);
      try {
        task?.cancel();
      } catch {
        /* already finished */
      }
      if (!wasActive) {
        task?.release();
        tasks.delete(id);
        activeReservations.delete(id);
      }
      if (!wasActive) {
        try {
          const part = partOf(id);
          if (part.exists) part.delete();
        } catch {
          /* nothing to clean up */
        }
      }
      if (!wasActive) forgetSavedJob(id);
    },

    async remove(id) {
      const job = get().jobs[id];
      if (job?.state === 'verifying' || job?.state === 'installing') {
        toast('Wait for this model to finish installing before removing it');
        return;
      }
      const runtime = useLocalInference.getState();
      if (runtime.removing.includes(id)) return;
      runtime.dispatch({ type: 'remove-start', id });
      try {
        if (startingDownloads.has(id)) cancelledStartingDownloads.add(id);
        if (get().jobs[id] || tasks.has(id)) get().cancel(id);
        await unloadModel(id);
        const f = modelFileOf(id);
        const shared = get().models.some((model) => model.id !== id && modelFileOf(model.id).uri === f.uri);
        if (!shared && f.exists) f.delete();
        const models = await updateIndex((current) => current.filter((m) => m.id !== id));
        set({ models });
        const st = useProviders.getState();
        const p = st.providers.find(isLocalProvider);
        if (p) {
          await st.deleteModel(p.id, id);
          // No models left: the provider goes too, so the picker doesn't show an empty "On this phone".
          if (!models.length) await useProviders.getState().remove(p.id);
        }
        runtime.dispatch({ type: 'remove-success', id });
      } catch (error) {
        runtime.dispatch({ type: 'remove-failure', id });
        throw error;
      }
    },
  };
});
