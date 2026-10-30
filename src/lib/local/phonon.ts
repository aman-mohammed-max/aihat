import { Directory, DownloadTask, File, Paths, type DownloadPauseState, type DownloadTask as DownloadTaskType } from 'expo-file-system';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { PhononNative } from '../../../modules/phonon';
import { finishDownloadTask, recoverAtomicFile, validateDownloadedPart, writeAtomicFile } from './download-core.mjs';
import { createPhononResumeRecord, parsePhononResumeRecord, phononTransferProgress } from './phonon-download-core.mjs';

/**
 * Phonon-2 by Fermion Research: English speech recognition that runs on the phone (CC-BY-4.0 weights, from NVIDIA's
 * Parakeet TDT 0.6B v3). Android runs Fermion's CPU engine on the packed model; iPhone and iPad run its Core ML build
 * on the Neural Engine.
 */
const HF = 'https://huggingface.co/FermionResearch';

type Part = { path: string; size: number; sha256: string };
const IOS_REVISION = '48af304c8db8bcc25307c206c199612f48479954';
const ANDROID_REVISION = '3e6ab3a81d73b4d424ff34cc72535deb606378ef';

/** What to download: one archive on Android (unpacked on the phone), the Core ML package's files on iOS. */
const PARTS: Part[] =
  Platform.OS === 'ios'
    ? [
        { path: 'manifest.json', size: 1428, sha256: 'ab3fb5dfd3fc07b1d8a24379d04418f458d0443ba6359d3a5ab2f098a7d64089' },
        { path: 'decoder.bin', size: 13_301_279, sha256: '36fa7202dda85c603af60d930ab88d7e9f0d2a619490aff46f5384db924cfa70' },
        { path: 'Phonon-2.mlpackage/Manifest.json', size: 617, sha256: '6ebc9309aea0e16bda9c7558521fef6307fac0afba9a5b4959fea45ed7cd0429' },
        { path: 'Phonon-2.mlpackage/Data/com.apple.CoreML/model.mlmodel', size: 2_500_482, sha256: '4f6790ec94fe4429b10397c013563d0a51119953ff6d3da466bbcb23a25dee2a' },
        { path: 'Phonon-2.mlpackage/Data/com.apple.CoreML/weights/weight.bin', size: 329_186_560, sha256: '93aa991318a00ed492fdbb724e7bca4e6a69c6cf671ab4f14a14ef6101e7648b' },
      ]
    : [{ path: 'phonon-2.bps.tar.zst', size: 163_515_201, sha256: '98125795b6dda72f5c6eee9ba33d19815df65dcb18b50a357bf9f73c9935309e' }];

const REPO = Platform.OS === 'ios' ? 'Phonon-2-CoreML' : 'Phonon-2';
const REVISION = Platform.OS === 'ios' ? IOS_REVISION : ANDROID_REVISION;
export const PHONON_DOWNLOAD = PARTS.reduce((n, p) => n + p.size, 0);

const root = () => new Directory(Paths.document, 'phonon');
/** The folder the engine reads: the Core ML package (iOS), or the unpacked model.fermion and config.json (Android). */
const modelDir = () => new Directory(root(), REPO);
const partFile = (p: Part) => new File(Platform.OS === 'ios' ? modelDir() : root(), ...p.path.split('/'));
const resumeFile = () => new File(root(), 'download-state.json');
const resumeBackup = () => new File(root(), 'download-state.json.previous');
const resumeNext = () => new File(root(), 'download-state.json.next');
const resumeLimit = 1_048_576;

function resumeFileOps() {
  const paths = PARTS.map((part) => part.path);
  return {
    exists: (uri: string) => new File(uri).exists,
    isValid: async (uri: string) => {
      try {
        const file = new File(uri);
        if ((file.size ?? Number.POSITIVE_INFINITY) > resumeLimit) return false;
        return parsePhononResumeRecord(JSON.parse(await file.text()), paths) !== null;
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

async function readPausedPhononTask() {
  const file = resumeFile();
  await recoverAtomicFile({ target: file.uri, backup: resumeBackup().uri, next: resumeNext().uri, ...resumeFileOps() });
  if (!file.exists || (file.size ?? Number.POSITIVE_INFINITY) > resumeLimit) return null;
  try {
    return parsePhononResumeRecord(JSON.parse(await file.text()), PARTS.map((part) => part.path));
  } catch {
    return null;
  }
}

async function savePausedPhononTask(path: string, state: DownloadPauseState) {
  const record = createPhononResumeRecord(path, state, PARTS.map((part) => part.path));
  const content = JSON.stringify(record);
  if (content.length > resumeLimit) throw new Error('The paused speech-model download state is too large to save safely. Retry the download.');
  const file = resumeFile();
  const ops = resumeFileOps();
  await recoverAtomicFile({ target: file.uri, backup: resumeBackup().uri, next: resumeNext().uri, ...ops });
  await writeAtomicFile({
    target: file.uri,
    backup: resumeBackup().uri,
    next: resumeNext().uri,
    content,
    write: async (uri, value) => new File(uri).write(value),
    ...ops,
  });
}

async function clearPausedPhononTask() {
  for (const file of [resumeFile(), resumeBackup(), resumeNext()]) {
    if (file.exists) file.delete();
  }
}

export const phononSupported = () => {
  try {
    return !!PhononNative?.isSupported();
  } catch {
    return false;
  }
};

async function installed() {
  try {
    if (Platform.OS === 'ios') {
      for (const p of PARTS) {
        const file = partFile(p);
        if (!file.exists) return false;
        validateDownloadedPart({ size: file.size, expectedSize: p.size, sha256: await file.digest('SHA-256'), expectedSha256: p.sha256 });
      }
      return true;
    }
    return new File(modelDir(), 'model.fermion').size > 0 && new File(modelDir(), 'config.json').size > 0;
  } catch {
    return false;
  }
}

let installedResult: boolean | undefined;
let installedCheck: Promise<boolean> | null = null;
let verificationGeneration = 0;

/** Check once per process; iOS hashes each installed package file using Expo's native streaming digest. */
export function phononReady() {
  if (installedResult !== undefined) return Promise.resolve(installedResult);
  if (!installedCheck) {
    const generation = verificationGeneration;
    let check: Promise<boolean>;
    check = installed().then((ready) => {
      if (generation !== verificationGeneration) return installedResult ?? false;
      installedResult = ready;
      return ready;
    }).finally(() => {
      if (installedCheck === check) installedCheck = null;
    });
    installedCheck = check;
  }
  return installedCheck;
}

type Phase = 'none' | 'verifying' | 'downloading' | 'paused' | 'preparing' | 'ready' | 'failed';

type State = {
  phase: Phase;
  written: number;
  extractWritten: number;
  extractTotal: number;
  error: string;
    refresh: () => void;
  download: () => Promise<void>;
  pause: () => void;
  cancel: () => void;
  remove: () => void;
};

let task: DownloadTaskType | null = null;
let taskPath: string | null = null;
let cancelled = false;
let preserveArchiveOnCancel = false;
let loaded = false;
let refreshPromise: Promise<void> | null = null;

export const usePhonon = create<State>((set, get) => {
  function taskOptions(path: string) {
    const index = PARTS.findIndex((part) => part.path === path);
    const base = PARTS.slice(0, Math.max(index, 0)).reduce((total, part) => total + part.size, 0);
    return {
      sessionType: 'background' as const,
      deferBackgroundSessionCompletion: Platform.OS === 'ios',
      onProgress: ({ bytesWritten }: { bytesWritten: number }) => set({ written: base + bytesWritten }),
    };
  }

  async function restorePausedTask() {
    const saved = await readPausedPhononTask();
    if (!saved) return false;
    try {
      const restored = DownloadTask.fromSavable(saved.state as DownloadPauseState, taskOptions(saved.path));
      if (restored.state !== 'paused') {
        restored.release();
        await clearPausedPhononTask();
        return false;
      }
      task = restored;
      taskPath = saved.path;
      const sizes = Object.fromEntries(PARTS.map((part) => [part.path, partFile(part).size ?? 0]));
      set({ phase: 'paused', written: phononTransferProgress(PARTS, sizes), error: '' });
      return true;
    } catch {
      task?.release();
      task = null;
      taskPath = null;
      await clearPausedPhononTask();
      return false;
    }
  }

  /** Download the parts one after another; the bytes of finished parts count towards the progress. */
  async function fetchParts(resume: boolean) {
    let done = 0;
    for (const p of PARTS) {
      if (cancelled) throw new Error('Model download cancelled.');
      const target = partFile(p);
      if (target.exists) {
        let valid = false;
        if (target.size === p.size) {
          try {
            validateDownloadedPart({ size: target.size, expectedSize: p.size, sha256: await target.digest('SHA-256'), expectedSha256: p.sha256 });
            valid = true;
          } catch {
            // Replace any complete but corrupt part before starting a fresh task.
          }
        }
        if (valid) {
          done += p.size;
          continue;
        }
      }
      const resumablePartial = resume && task?.state === 'paused' && taskPath === p.path && target.exists && (target.size ?? 0) < p.size;
      if (resume && task && !resumablePartial) {
        try {
          task.cancel();
        } catch {
          /* the old task may already be finished */
        }
        task.release();
        task = null;
        taskPath = null;
        resume = false;
        await clearPausedPhononTask();
      }
      if (target.exists && !resumablePartial) target.delete();
      target.parentDirectory.create({ intermediates: true, idempotent: true });
      if (!resume || !task) {
        task = File.createDownloadTask(`${HF}/${REPO}/resolve/${REVISION}/${p.path}?download=true`, target, taskOptions(p.path));
        taskPath = p.path;
      }
      const activeTask = task;
      const got = await (resume && activeTask.state === 'paused' ? activeTask.resumeAsync() : activeTask.downloadAsync());
      resume = false;
      if (!got) return false; // paused
      try {
        validateDownloadedPart({ size: target.size, expectedSize: p.size, sha256: await target.digest('SHA-256'), expectedSha256: p.sha256 });
      } catch (error) {
        target.delete();
        throw error;
      } finally {
        task = null;
        taskPath = null;
        await finishDownloadTask(activeTask, Platform.OS);
        await clearPausedPhononTask();
      }
      done += p.size;
      set({ written: done });
    }
    if (task?.state === 'paused') task.release();
    task = null;
    taskPath = null;
    await clearPausedPhononTask();
    return true;
  }

  async function run(resume: boolean) {
    cancelled = false;
    set({ phase: 'downloading', error: '' });
    try {
      if (!(await fetchParts(resume))) {
        if (!task || task.state !== 'paused' || !taskPath) throw new Error('The speech-model download paused without resumable state. Retry it.');
        await savePausedPhononTask(taskPath, task.savable());
        set({ phase: 'paused' });
        return;
      }
      if (Platform.OS !== 'ios') {
        set({ phase: 'preparing' });
        await PhononNative!.prepare(partFile(PARTS[0]).uri, modelDir().uri);
      }
      const ready = Platform.OS === 'ios' || await installed();
      installedResult = ready;
      set({ phase: ready ? 'ready' : 'failed', error: ready ? '' : 'The model files are incomplete. Delete them and download again.' });
    } catch (e: any) {
      const failedTask = task;
      task = null;
      taskPath = null;
      if (failedTask?.state === 'paused') failedTask.release();
      else await finishDownloadTask(failedTask ?? undefined, Platform.OS);
      await clearPausedPhononTask().catch(() => {});
      if (cancelled) {
        if (preserveArchiveOnCancel) set({ phase: 'none', error: '', extractWritten: 0, extractTotal: 0 });
        else get().remove();
        preserveArchiveOnCancel = false;
        return;
      }
      set({ phase: 'failed', error: e?.message ?? 'The download failed.' });
    }
  }

  return {
    phase: 'none',
    written: 0,
    extractWritten: 0,
    extractTotal: 0,
    error: '',

    refresh() {
      if (['verifying', 'downloading', 'preparing', 'paused'].includes(get().phase)) return;
      if (refreshPromise) return;
      refreshPromise = (async () => {
        const ready = await phononReady();
        if (ready) {
          await clearPausedPhononTask();
          set({ phase: 'ready' });
          return;
        }
        if (!(await restorePausedTask())) set({ phase: 'none' });
      })().catch((error: unknown) => {
        set({ phase: 'failed', error: error instanceof Error ? error.message : 'Could not check the speech model.' });
      }).finally(() => {
        refreshPromise = null;
      });
    },

    async download() {
      if (refreshPromise) await refreshPromise;
      if (!phononSupported()) throw new Error('Phonon-2 can’t run on this device.');
      if (get().phase === 'verifying') throw new Error('Checking the installed Phonon-2 files. Try again in a moment.');
      if (get().phase === 'downloading' || get().phase === 'preparing') return;
      const free = Paths.availableDiskSpace;
      if (free && free < PHONON_DOWNLOAD * 4) throw new Error('Not enough free space for the download and extracted speech model.');
      root().create({ intermediates: true, idempotent: true });
      const progress = Platform.OS === 'android'
        ? PhononNative?.addListener('onPrepareProgress', (event) => set({ extractWritten: event.written, extractTotal: event.total }))
        : undefined;
      try {
        verificationGeneration += 1;
        installedResult = undefined;
        installedCheck = null;
        const resume = get().phase === 'paused' && task?.state === 'paused';
        if (resume) await clearPausedPhononTask();
        await run(resume);
      } finally {
        progress?.remove();
      }
    },

    pause() {
      task?.pause();
    },

    cancel() {
      if (get().phase === 'verifying') {
        set({ phase: 'none', error: '' });
        return;
      }
      if (get().phase === 'preparing') {
        cancelled = true;
        preserveArchiveOnCancel = true;
        PhononNative?.cancelPrepare();
        return;
      }
      cancelled = true;
      const active = task?.state === 'active';
      try {
        task?.cancel();
      } catch {
        /* already finished */
      }
      if (active) return;
      task?.release();
      task = null;
      taskPath = null;
      get().remove();
    },

    remove() {
      try {
        PhononNative?.unload();
      } catch {
        /* not loaded */
      }
      loaded = false;
      verificationGeneration += 1;
      installedResult = false;
      installedCheck = null;
      void clearPausedPhononTask().catch(() => {});
      try {
        const r = root();
        if (r.exists) r.delete();
      } catch {
        /* nothing to delete */
      }
      set({ phase: 'none', written: 0, error: '' });
    },
  };
});

let watching = false;

/** The words in an audio file, with the model on the device. Loads the model the first time (a few seconds). */
export async function phononTranscribe(uri: string) {
  if (!PhononNative) throw new Error('Phonon-2 isn’t in this build of the app.');
  if (!(await phononReady())) throw new Error('Download Phonon-2 in Settings › Voice & speech first.');
  if (!loaded) {
    await PhononNative.load(modelDir().uri);
    loaded = true;
  }
  if (!watching) {
    watching = true;
    // The model holds about 0.7 GB: let it go in the background so the system doesn't close the app.
    AppState.addEventListener('change', (s) => {
      if (s === 'background' && loaded) {
        PhononNative?.unload();
        loaded = false;
      }
    });
  }
  return PhononNative.transcribeFile(uri);
}
