/**
 * Skill scripts in the desktop app: the app's Bun backend runs them with this computer's own Python and Node (or the
 * Bun it runs on) in a temporary folder. Nothing to download.
 */
import { useEffect } from 'react';

import { useSettings } from '@/store/settings';

import { filesFromB64, filesToB64 } from './b64';
import { useSkillRuntime } from './store';
import type { SkillExecutor, SkillJob, SkillResult } from './types';

export const RUNTIME_BYTES = 0;
const st = () => useSkillRuntime.getState();

/** Which Python and Node this computer has. */
export async function refreshRuntime() {
  try {
    const res = await fetch('/api/exec/tools');
    const t = (await res.json()) as { python: { version: string } | null; node: { version: string } | null };
    st().set({ status: 'ready', tools: { python: t.python?.version ?? null, node: t.node?.version ?? null } });
  } catch (e: any) {
    st().set({ status: 'error', error: e?.message ?? 'The app’s backend didn’t answer.' });
  }
}

export async function downloadRuntime() {
  await refreshRuntime();
}
export function cancelDownload() {}
export async function removeRuntime() {
  useSettings.getState().set({ skillScripts: false });
}
export async function warmRuntime() {
  await refreshRuntime();
}

let seq = 0;

export const executor: SkillExecutor = {
  async isAvailable() {
    return useSettings.getState().skillScripts;
  },
  async run(job: SkillJob, signal?: AbortSignal): Promise<SkillResult> {
    if (!(await this.isAvailable())) throw new Error('Skill scripts are off. Turn them on in Skills › Run skill scripts.');
    const id = `d${Date.now()}-${++seq}`;
    const stop = () => void fetch(`/api/exec/cancel?id=${encodeURIComponent(id)}`, { method: 'POST' }).catch(() => {});
    signal?.addEventListener('abort', stop);
    try {
      const res = await fetch('/api/exec', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, job: { command: job.command, skill: job.skill, skillFiles: filesToB64(job.skillFiles), files: filesToB64(job.files), timeoutMs: job.timeoutMs ?? 60_000 } }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error ?? 'The command couldn’t run.');
      return { ...r, outputFiles: filesFromB64(r.outputFiles) };
    } finally {
      signal?.removeEventListener('abort', stop);
    }
  },
};

/** Nothing to mount on a computer; it only checks for Python and Node at start. */
export function SkillRuntimeHost() {
  useEffect(() => {
    void refreshRuntime();
  }, []);
  return null;
}
