import { Directory, File, Paths, type DownloadTask } from 'expo-file-system';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { PhononNative } from '../../../modules/phonon';

/**
 * Phonon-2 by Fermion Research: English speech recognition that runs on the phone (CC-BY-4.0 weights, from NVIDIA's
 * Parakeet TDT 0.6B v3). Android runs Fermion's CPU engine on the packed model; iPhone and iPad run its Core ML build
 * on the Neural Engine.
 */
const HF = 'https://huggingface.co/FermionResearch';

type Part = { path: string; size: number };

/** What to download: one archive on Android (unpacked on the phone), the Core ML package's files on iOS. */
const PARTS: Part[] =
  Platform.OS === 'ios'
    ? [
        { path: 'manifest.json', size: 1428 },
        { path: 'decoder.bin', size: 13_301_279 },
        { path: 'Phonon-2.mlpackage/Manifest.json', size: 617 },
        { path: 'Phonon-2.mlpackage/Data/com.apple.CoreML/model.mlmodel', size: 2_500_482 },
        { path: 'Phonon-2.mlpackage/Data/com.apple.CoreML/weights/weight.bin', size: 329_186_560 },
      ]
    : [{ path: 'phonon-2.bps.tar.zst', size: 163_515_201 }];

const REPO = Platform.OS === 'ios' ? 'Phonon-2-CoreML' : 'Phonon-2';
export const PHONON_DOWNLOAD = PARTS.reduce((n, p) => n + p.size, 0);

const root = () => new Directory(Paths.document, 'phonon');
/** The folder the engine reads: the Core ML package (iOS), or the unpacked model.fermion and config.json (Android). */
const modelDir = () => new Directory(root(), REPO);
const partFile = (p: Part) => new File(Platform.OS === 'ios' ? modelDir() : root(), ...p.path.split('/'));

export const phononSupported = () => {
  try {
    return !!PhononNative?.isSupported();
  } catch {
    return false;
  }
};

function installed() {
  try {
    if (Platform.OS === 'ios') return PARTS.every((p) => partFile(p).exists && partFile(p).size === p.size);
    return new File(modelDir(), 'model.fermion').exists && new File(modelDir(), 'config.json').exists;
  } catch {
    return false;
  }
}

type Phase = 'none' | 'downloading' | 'paused' | 'preparing' | 'ready' | 'failed';

type State = {
  phase: Phase;
  written: number;
  error: string;
  refresh: () => void;
  download: () => Promise<void>;
  pause: () => void;
  cancel: () => void;
  remove: () => void;
};

let task: DownloadTask | null = null;
let cancelled = false;
let loaded = false;

export const usePhonon = create<State>((set, get) => {
  /** Download the parts one after another; the bytes of finished parts count towards the progress. */
  async function fetchParts(resume: boolean) {
    let done = 0;
    for (const p of PARTS) {
      const target = partFile(p);
      if (target.exists && target.size === p.size) {
        done += p.size;
        continue;
      }
      target.parentDirectory.create({ intermediates: true, idempotent: true });
      if (!resume && target.exists) target.delete();
      const base = done;
      if (!resume || !task) {
        task = File.createDownloadTask(`${HF}/${REPO}/resolve/main/${p.path}?download=true`, target, {
          onProgress: ({ bytesWritten }) => set({ written: base + bytesWritten }),
        });
      }
      const got = await (resume && task.state === 'paused' ? task.resumeAsync() : task.downloadAsync());
      resume = false;
      if (!got) return false; // paused
      task = null;
      if (target.size !== p.size) throw new Error('The download is incomplete. Try again.');
      done += p.size;
      set({ written: done });
    }
    return true;
  }

  async function run(resume: boolean) {
    cancelled = false;
    set({ phase: 'downloading', error: '' });
    try {
      if (!(await fetchParts(resume))) return set({ phase: 'paused' });
      if (Platform.OS !== 'ios') {
        set({ phase: 'preparing' });
        await PhononNative!.prepare(partFile(PARTS[0]).uri, modelDir().uri);
      }
      set({ phase: installed() ? 'ready' : 'failed', error: installed() ? '' : 'The model files are incomplete. Delete them and download again.' });
    } catch (e: any) {
      task = null;
      if (cancelled) return;
      set({ phase: 'failed', error: e?.message ?? 'The download failed.' });
    }
  }

  return {
    phase: 'none',
    written: 0,
    error: '',

    refresh() {
      if (get().phase === 'downloading' || get().phase === 'preparing' || get().phase === 'paused') return;
      set({ phase: installed() ? 'ready' : 'none' });
    },

    async download() {
      if (!phononSupported()) throw new Error('Phonon-2 can’t run on this device.');
      const free = Paths.availableDiskSpace;
      if (free && free < PHONON_DOWNLOAD * 2.2) throw new Error('Not enough free space for the speech model.');
      root().create({ intermediates: true, idempotent: true });
      await run(get().phase === 'paused');
    },

    pause() {
      task?.pause();
    },

    cancel() {
      cancelled = true;
      try {
        task?.cancel();
      } catch {
        /* already finished */
      }
      task = null;
      get().remove();
    },

    remove() {
      try {
        PhononNative?.unload();
      } catch {
        /* not loaded */
      }
      loaded = false;
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
  if (!installed()) throw new Error('Download Phonon-2 in Settings › Voice & speech first.');
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

export const phononReady = () => installed();
