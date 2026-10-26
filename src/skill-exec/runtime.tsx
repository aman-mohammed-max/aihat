/**
 * Skill scripts on a phone: Python (Pyodide) and a Node-style runner in a hidden WebView, fully offline once the
 * add-on is downloaded. Works in Expo Go: only react-native-webview, expo-file-system and expo-crypto are used.
 *
 *   download:  the files in runtime.json → <documents>/skill-runtime/<version>/, each checked against its SHA-256
 *   start:     the hidden page copies them into its own storage once, then runs Python in a Web Worker
 *   run:       one command at a time; a time limit or Stop ends the worker (the next run starts a fresh one)
 */
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { WebView } from 'react-native-webview';

import { useSettings } from '@/store/settings';

import { filesFromB64, filesToB64 } from './b64';
import { RUNNER_HTML } from './engine/embedded';
import manifest from './runtime.json';
import { useSkillRuntime } from './store';
import type { SkillExecutor, SkillJob, SkillResult } from './types';

export const RUNTIME_BYTES = manifest.totalBytes;
const BASE_URL = 'https://runtime.aihat.invalid/';
const CHUNK = 512 * 1024;

/** What the worker needs to know about the files (sent with each start). */
const WORKER_MANIFEST = {
  needs: manifest.needs,
  bundled: manifest.bundled,
  wheels: manifest.files.filter((f) => f.kind === 'wheel').map((f) => f.name),
  js: Object.fromEntries(manifest.files.filter((f) => f.kind === 'js').map((f) => [f.lib!, { file: f.name, global: f.global! }])),
};

const runtimeDir = () => new Directory(Paths.document, 'skill-runtime', manifest.pyodide);
const doneMarker = () => new File(runtimeDir(), 'installed.json');
const st = () => useSkillRuntime.getState();

// ---------- download ----------

/** Look on disk: is this version of the add-on complete? */
export async function refreshRuntime() {
  try {
    const ok = doneMarker().exists && manifest.files.every((f) => new File(runtimeDir(), f.name).exists);
    st().set({ status: ok ? 'ready' : st().status === 'downloading' ? 'downloading' : 'none', total: manifest.totalBytes });
  } catch {
    st().set({ status: 'none' });
  }
}

let downloading: AbortController | null = null;

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** Download every file (resuming what is already there), checking each one. */
export async function downloadRuntime() {
  if (downloading) return;
  const ctl = new AbortController();
  downloading = ctl;
  const dir = runtimeDir();
  st().set({ status: 'downloading', done: 0, total: manifest.totalBytes, error: undefined });
  try {
    if (Paths.availableDiskSpace < manifest.totalBytes * 1.5) throw new Error(`Not enough free space. The add-on needs about ${Math.round((manifest.totalBytes * 1.5) / 1048576)} MB free.`);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    let done = 0;
    for (const f of manifest.files) {
      const file = new File(dir, f.name);
      const check = async () => file.exists && file.size === f.size && hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes())) === f.sha256;
      if (!(await check())) {
        if (file.exists) file.delete();
        const base = done;
        await File.downloadFileAsync(f.url, file, { idempotent: true, signal: ctl.signal, onProgress: (p) => st().set({ done: base + p.bytesWritten }) });
        if (!(await check())) {
          if (file.exists) file.delete();
          throw new Error(`${f.name} didn’t download correctly (its checksum doesn’t match). Try again.`);
        }
      }
      done += f.size;
      st().set({ done });
    }
    doneMarker().write(JSON.stringify({ pyodide: manifest.pyodide, at: Date.now() }));
    st().set({ status: 'ready', done: manifest.totalBytes });
  } catch (e: any) {
    const cancelled = ctl.signal.aborted;
    st().set({ status: cancelled ? 'none' : 'error', error: cancelled ? undefined : e?.message ?? 'The download failed.' });
  } finally {
    downloading = null;
  }
}

export function cancelDownload() {
  downloading?.abort();
}

/** Delete the add-on (and its copy inside the sandbox). Turns skill scripts off. */
export async function removeRuntime() {
  if (bridge.attached) {
    bridge.send({ t: 'drop' });
    await bridge.wait((m) => m.t === 'dropped', 10_000).catch(() => {});
  }
  useSettings.getState().set({ skillScripts: false });
  const root = new Directory(Paths.document, 'skill-runtime');
  if (root.exists) root.delete();
  st().set({ status: 'none', done: 0, warm: false, coldMs: undefined, preparing: null });
}

// ---------- the bridge to the hidden page ----------

type Msg = { t: string; [k: string]: any };

class Bridge {
  private view: { postMessage(m: string): void } | null = null;
  private waiters: { test: (m: Msg) => boolean; resolve: (m: Msg) => void }[] = [];
  private syncing: Promise<void> | null = null;
  private loaded: () => void = () => {};
  private loadedP = new Promise<void>((r) => (this.loaded = r));
  attached = false;

  attach(v: { postMessage(m: string): void } | null) {
    this.view = v;
  }
  reset() {
    this.attached = false;
    this.syncing = null;
    this.loadedP = new Promise<void>((r) => (this.loaded = r));
    st().set({ warm: false, preparing: null });
    // Anyone waiting gets an answer: the page is gone.
    for (const w of this.waiters.splice(0)) w.resolve({ t: 'gone' });
  }
  onMessage(raw: string) {
    let m: Msg;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.t === 'loaded') {
      this.attached = true;
      this.loaded();
      return;
    }
    for (const w of [...this.waiters]) {
      if (w.test(m)) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.resolve(m);
      }
    }
  }
  send(m: Msg) {
    this.view?.postMessage(JSON.stringify(m));
  }
  wait(test: (m: Msg) => boolean, ms: number) {
    return new Promise<Msg>((resolve, reject) => {
      const w = { test: (m: Msg) => test(m) || m.t === 'gone', resolve: (m: Msg) => (clearTimeout(timer), m.t === 'gone' ? reject(new Error('The script runner was restarted. Try again.')) : resolve(m)) };
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        reject(new Error('The script runner didn’t answer.'));
      }, ms);
      this.waiters.push(w);
    });
  }
  /** Wait for the page, then copy in any file it doesn't have yet (the first start, or after the phone cleared it). */
  ready() {
    this.syncing ??= (async () => {
      await Promise.race([this.loadedP, new Promise((_, j) => setTimeout(() => j(new Error('Turn on skill scripts first.')), 30_000))]);
      this.send({ t: 'hello' });
      const have: Record<string, string> = (await this.wait((m) => m.t === 'hello', 30_000)).have ?? {};
      this.send({ t: 'prune', keep: manifest.files.map((f) => f.name) });
      await this.wait((m) => m.t === 'pruned', 30_000).catch(() => {});
      const missing = manifest.files.filter((f) => have[f.name] !== f.sha256);
      const total = missing.reduce((n, f) => n + f.size, 0);
      let done = 0;
      if (missing.length) st().set({ preparing: { done, total } });
      try {
        for (const f of missing) {
          const b64 = await new File(runtimeDir(), f.name).base64();
          const step = Math.ceil(CHUNK / 3) * 4;
          const n = Math.max(1, Math.ceil(b64.length / step));
          for (let i = 0; i < n; i++) {
            this.send({ t: 'put', name: f.name, sha: f.sha256, i, n, data: b64.slice(i * step, (i + 1) * step) });
            const ack = await this.wait((m) => (m.t === 'part-ok' || m.t === 'put-ok' || m.t === 'put-error') && m.name === f.name, 60_000);
            if (ack.t === 'put-error') throw new Error(`The phone couldn’t store the add-on: ${ack.error}`);
            done += Math.round(f.size / n);
            st().set({ preparing: { done: Math.min(done, total), total } });
          }
        }
      } finally {
        st().set({ preparing: null });
      }
    })().catch((e) => {
      this.syncing = null;
      throw e;
    });
    return this.syncing;
  }
  /** Start Python now, so the first script doesn't wait. */
  async warm() {
    await this.ready();
    const t0 = Date.now();
    this.send({ t: 'warm', manifest: WORKER_MANIFEST });
    const r = await this.wait((m) => m.t === 'warm', 180_000);
    if (r.error) throw new Error(r.error);
    if (r.cold) st().set({ coldMs: Date.now() - t0 });
    st().set({ warm: true });
  }
}

const bridge = new Bridge();
let seq = 0;

export const executor: SkillExecutor = {
  async isAvailable() {
    return useSettings.getState().skillScripts && st().status === 'ready';
  },
  async run(job: SkillJob, signal?: AbortSignal): Promise<SkillResult> {
    if (!(await this.isAvailable())) throw new Error('Skill scripts are off. Turn them on in Skills › Run skill scripts.');
    await bridge.warm();
    const id = `j${++seq}`;
    const timeoutMs = job.timeoutMs ?? 60_000;
    bridge.send({ t: 'run', id, manifest: WORKER_MANIFEST, timeoutMs, job: { command: job.command, skill: job.skill, skillFiles: filesToB64(job.skillFiles), files: filesToB64(job.files) } });
    const stop = () => bridge.send({ t: 'cancel', id });
    signal?.addEventListener('abort', stop);
    try {
      const { result } = await bridge.wait((m) => m.t === 'result' && m.id === id, timeoutMs + 180_000);
      // A run that hit the time limit or Stop ended the worker: Python starts again next time.
      if (result.exitCode === 124 || result.exitCode === 130) st().set({ warm: false });
      return { ...result, outputFiles: filesFromB64(result.outputFiles), skipped: result.skipped ?? [] };
    } finally {
      signal?.removeEventListener('abort', stop);
    }
  },
};

/** Start Python in the background (the test screen shows how long it took). */
export const warmRuntime = () => bridge.warm();

/**
 * The hidden WebView, mounted once at the app's root while skill scripts are on. 1×1 and transparent rather than
 * hidden, so Android keeps it running; the user never sees it.
 */
export function SkillRuntimeHost() {
  const enabled = useSettings((s) => s.skillScripts);
  const status = useSkillRuntime((s) => s.status);
  const [key, setKey] = useState(0);
  useEffect(() => {
    void refreshRuntime();
  }, []);
  // iOS may end the page while the app is in the background: start a new one when it comes back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && enabled && status === 'ready' && !bridge.attached) setKey((k) => k + 1);
    });
    return () => sub.remove();
  }, [enabled, status]);
  if (!enabled || status !== 'ready') return null;
  const restart = () => {
    bridge.reset();
    setKey((k) => k + 1);
  };
  return (
    <WebView
      key={key}
      ref={(v) => bridge.attach(v)}
      source={{ html: RUNNER_HTML, baseUrl: BASE_URL }}
      originWhitelist={['*']}
      onMessage={(e) => bridge.onMessage(e.nativeEvent.data)}
      onShouldStartLoadWithRequest={(r) => r.url === BASE_URL || r.url === 'about:blank' || r.url.startsWith('data:')}
      onContentProcessDidTerminate={restart}
      onRenderProcessGone={restart}
      javaScriptEnabled
      domStorageEnabled
      cacheEnabled
      incognito={false}
      setSupportMultipleWindows={false}
      allowFileAccess={false}
      mediaPlaybackRequiresUserAction
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, left: 0, top: 0 }}
    />
  );
}
