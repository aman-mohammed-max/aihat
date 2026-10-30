import type { LlamaContext } from 'llama.rn';
import { AppState, Platform, TurboModuleRegistry } from 'react-native';

import type { ChatMessage, Params, StreamEvent } from '@/api/openai';
import { useLocalInference } from '@/store/localInference';
import { useSettings } from '@/store/settings';
import { DeviceMemory } from '../../../modules/devicememory';
import type { DeviceMemorySnapshot } from '../../../modules/devicememory';

import { modelFileOf } from './files';
import { thisDevice } from './fit';
import { assessModelMemory } from './fit-core.mjs';
import type { LocalGenerationRequest, LocalInferenceProvider } from './inference';
import { createGenerationLifecycle } from './generation-lifecycle.mjs';
import { canLoadModel, shouldUnloadModel } from './model-runtime.mjs';

/**
 * Runs downloaded GGUF models on the device with llama.rn (llama.cpp). Its native part is in the AI Hat app from the
 * Releases page, not in Expo Go: there the engine reports itself unavailable instead of failing.
 */
type Llama = typeof import('llama.rn');
let lib: Llama | null | undefined;

function llama(): Llama | null {
  if (lib !== undefined) return lib;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    lib = TurboModuleRegistry.get('RNLlama') ? (require('llama.rn') as Llama) : null;
  } catch {
    lib = null;
  }
  return lib;
}

export const localEngineAvailable = () => llama() !== null;

export const UNAVAILABLE = 'Models on this device need the AI Hat app from the Releases page; Expo Go can’t run them.';

// One model is kept loaded (loading takes a few seconds), and one reply runs at a time.
let loaded: { id: string; ctx: LlamaContext } | null = null;
let chain: Promise<unknown> = Promise.resolve();
const serial = <T,>(job: () => Promise<T>): Promise<T> => {
  const run = chain.then(job, job);
  chain = run.catch(() => undefined);
  return run;
};

let watching = false;
/** A loaded model holds a lot of memory: let it go when the app goes to the background, so the system doesn't close the app. */
function releaseInBackground() {
  if (watching) return;
  watching = true;
  AppState.addEventListener('change', (s) => {
    if (s === 'background') void serial(unloadNow);
  });
}

async function unloadNow() {
  const old = loaded;
  loaded = null;
  if (old) useLocalInference.getState().dispatch({ type: 'unloaded', id: old.id });
  await old?.ctx.release().catch(() => {});
}

/** Free model memory now; an id limits deletion cleanup to that model and leaves an unrelated model loaded. */
export const unloadModel = (id?: string) => serial(async () => {
  if (!shouldUnloadModel(loaded?.id ?? null, id)) return;
  await unloadNow();
});

/** The model the engine has in memory, if any. */
export const loadedModel = () => loaded?.id ?? null;

function memorySnapshot(): DeviceMemorySnapshot | null {
  if ((Platform.OS !== 'android' && Platform.OS !== 'ios') || !DeviceMemory) return null;
  try {
    return DeviceMemory.getMemoryInfo();
  } catch {
    return null;
  }
}

function memoryError(reason: string | null) {
  if (reason === 'low-memory') return 'Android is low on memory right now. Close other apps and try again.';
  if (reason === 'available-memory') return 'There isn’t enough available memory to load this model right now. Close other apps and try again.';
  return 'This model is estimated to need more memory than this device can safely provide. Choose a smaller model.';
}

let idle: ReturnType<typeof setTimeout> | null = null;
/** "Free memory when idle": five minutes after the last reply, the model is let go (the next reply loads it again). */
function unloadLater() {
  if (idle) clearTimeout(idle);
  idle = useSettings.getState().localUnloadIdle ? setTimeout(() => void serial(unloadNow), 5 * 60_000) : null;
}

async function contextFor(id: string) {
  const runtime = useLocalInference.getState();
  if (!canLoadModel(runtime, id)) throw new Error('This model is being removed. Wait for removal to finish, then download it again if needed.');
  if (loaded?.id === id) {
    runtime.dispatch({ type: 'load-success', id });
    return loaded.ctx;
  }
  runtime.dispatch({ type: 'load-start', id });
  try {
    const l = llama();
    if (!l) throw new Error(UNAVAILABLE);
    const file = modelFileOf(id);
    if (!file.exists) throw new Error('This model is no longer on the device. Download it again in Marketplace › Local models.');

    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const modelSize = file.size ?? 0;
    await unloadNow();
    releaseInBackground();
    const snapshot = memorySnapshot();
    const reportedTotal = thisDevice().memory;
    const totalMemory = snapshot?.totalMemory && snapshot.totalMemory > 0 ? snapshot.totalMemory : reportedTotal;
    const memory = assessModelMemory({
      modelSize,
      totalMemory,
      availableMemory: snapshot?.availableMemory,
      lowMemory: snapshot?.lowMemory,
      platform,
    });
    if (!memory.allowed) throw new Error(memoryError(memory.reason));

    const ctx = await l.initLlama({
      model: file.uri,
      n_ctx: memory.contextSize,
      // iPhone and iPad run the model on the GPU (Metal) unless it is turned off; Android stays on the CPU, which works on
      // every phone.
      n_gpu_layers: Platform.OS === 'ios' && useSettings.getState().localGpu ? 99 : 0,
      use_mlock: false,
      use_mmap: true,
    });
    loaded = { id, ctx };
    runtime.dispatch({ type: 'load-success', id });
    return ctx;
  } catch (error) {
    runtime.dispatch({ type: 'load-failure', id, error: error instanceof Error ? error.message : 'Could not load this model.' });
    throw error;
  }
}

/** The chat as plain text messages: pictures can't be read by these models, and tool rounds become ordinary text. */
function plain(messages: ChatMessage[]) {
  const out: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  for (const m of messages) {
    const text = typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => (p.type === 'text' ? p.text : '')).join('\n');
    if (m.role === 'tool') out.push({ role: 'user', content: `Tool result:\n${text}` });
    else if (text.trim()) out.push({ role: m.role, content: text });
  }
  return out;
}

const STOP = ['</s>', '<|end|>', '<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<|EOT|>', '<|END_OF_TURN_TOKEN|>', '<|end_of_turn|>', '<|endoftext|>', '<end_of_turn>'];

/** A reply from a model on the device, streamed the same way as one from an endpoint. */
export async function* streamLocal(modelId: string, messages: ChatMessage[], params: Params = {}, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  const started = Date.now();
  const pieces: string[] = [];
  let done = false;
  let failure: unknown = null;
  let result: { tokens_predicted?: number; interrupted?: boolean } | null = null;
  let wake: (() => void) | null = null;
  const ping = () => {
    const w = wake;
    wake = null;
    w?.();
  };

  let ctxRef: LlamaContext | null = null;
  const stop = () => void ctxRef?.stopCompletion().catch(() => {});
  const lifecycle = createGenerationLifecycle(stop);
  const abort = () => lifecycle.close(false);
  if (signal?.aborted) throw Object.assign(new Error('Stopped'), { name: 'AbortError' });
  signal?.addEventListener('abort', abort, { once: true });

  if (idle) clearTimeout(idle);
  serial(async () => {
    const ctx = await contextFor(modelId);
    ctxRef = ctx;
    if (lifecycle.closed || signal?.aborted) return null;
    return ctx.completion(
      {
        messages: plain(messages),
        jinja: true,
        // The reply keeps its <think>…</think> part, which the chat shows as thinking.
        reasoning_format: 'none',
        n_predict: params.maxTokens ?? 2048,
        temperature: params.temperature ?? 0.7,
        top_p: params.topP ?? 0.95,
        stop: STOP,
      },
      (data) => {
        if (data.token) lifecycle.push(data.token, (token) => {
          pieces.push(token);
          ping();
        });
      },
    );
  }).then(
    (r) => {
      result = r;
      done = true;
      ping();
    },
    (e) => {
      failure = e;
      done = true;
      ping();
    },
  );

  try {
    while (true) {
      if (pieces.length) {
        yield { type: 'delta', text: pieces.splice(0).join('') };
        continue;
      }
      if (done) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
        if (pieces.length || done) ping();
      });
    }
    if (failure) throw failure;
    if (signal?.aborted) throw Object.assign(new Error('Stopped'), { name: 'AbortError' });
    yield { type: 'done', tokens: (result as { tokens_predicted?: number } | null)?.tokens_predicted, ms: Date.now() - started };
  } finally {
    lifecycle.close(done);
    signal?.removeEventListener('abort', abort);
    unloadLater();
  }
}

/** llama.cpp implementation registered behind the engine-neutral local inference contract. */
export const llamaProvider: LocalInferenceProvider = {
  id: 'llama.cpp',
  modelFormats: ['gguf'],
  async initialize() {
    return localEngineAvailable();
  },
  async loadModel(id) {
    await serial(() => contextFor(id));
  },
  unloadModel,
  async generateText(request: LocalGenerationRequest) {
    let output = '';
    for await (const event of streamLocal(request.modelId, request.messages, request.params, request.signal)) {
      if (event.type === 'delta') output += event.text;
    }
    return output;
  },
  streamTokens(request) {
    return streamLocal(request.modelId, request.messages, request.params, request.signal);
  },
  async stopGeneration() {
    await loaded?.ctx.stopCompletion().catch(() => {});
  },
  async readModelInfo(id) {
    const l = llama();
    if (!l) throw new Error(UNAVAILABLE);
    const file = modelFileOf(id);
    if (!file.exists) throw new Error('This model is no longer on the device. Download it again in Marketplace › Local models.');
    return l.loadLlamaModelInfo(file.uri);
  },
  releaseMemory: unloadModel,
};
