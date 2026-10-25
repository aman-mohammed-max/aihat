import { generateImage, type ProviderConn } from './openai';

export type ImageRequest = { prompt: string; n: number; width: number; height: number; model: string; negative?: string };

export const ASPECTS = {
  '1:1': [1024, 1024],
  '3:4': [768, 1024],
  '4:3': [1024, 768],
  '16:9': [1344, 768],
  '9:16': [768, 1344],
} as const;

const trim = (u: string) => u.replace(/\/+$/, '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** OpenAI-compatible: POST {provider}/images/generations. */
export const viaProvider = (p: ProviderConn, r: ImageRequest) =>
  generateImage(p, { model: r.model || undefined, prompt: r.prompt, n: r.n, size: `${r.width}x${r.height}` });

/** AUTOMATIC1111 / Forge: POST {url}/sdapi/v1/txt2img → base64 images. */
export async function viaA1111(url: string, r: ImageRequest) {
  const res = await fetch(`${trim(url)}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: r.prompt,
      negative_prompt: r.negative ?? '',
      width: Math.min(r.width, 1024),
      height: Math.min(r.height, 1024),
      batch_size: r.n,
      steps: 25,
      ...(r.model ? { override_settings: { sd_model_checkpoint: r.model } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`A1111 error ${res.status}`);
  const data = await res.json();
  return (data.images as string[]).map((b) => `data:image/png;base64,${b}`);
}

/** Minimal txt2img graph in ComfyUI's API format. `{{…}}` placeholders are filled before submitting. */
export const DEFAULT_COMFY_WORKFLOW = JSON.stringify(
  {
    '3': { class_type: 'KSampler', inputs: { seed: '{{seed}}', steps: 20, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: '{{model}}' } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: '{{width}}', height: '{{height}}', batch_size: '{{n}}' } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: '{{prompt}}', clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: '{{negative}}', clip: ['4', 1] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'aichat', images: ['8', 0] } },
  },
  null,
  2,
);

function fill(node: unknown, vars: Record<string, string | number>): unknown {
  if (typeof node === 'string') {
    const m = node.match(/^\{\{(\w+)\}\}$/);
    if (m && m[1] in vars) return vars[m[1]]; // whole-value placeholder keeps its number type
    return node.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
  }
  if (Array.isArray(node)) return node.map((x) => fill(x, vars));
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fill(v, vars)]));
  return node;
}

/** ComfyUI: POST /prompt, poll /history/{id}, then read the files from /view. */
export async function viaComfy(url: string, r: ImageRequest, workflowJson: string) {
  const u = trim(url);
  const workflow = fill(JSON.parse(workflowJson || DEFAULT_COMFY_WORKFLOW), {
    prompt: r.prompt, negative: r.negative ?? '', model: r.model, width: r.width, height: r.height, n: r.n, seed: Math.floor(Math.random() * 2 ** 31),
  });
  const submit = await fetch(`${u}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: workflow }) });
  if (!submit.ok) throw new Error(`ComfyUI rejected the workflow (${submit.status}): ${(await submit.text()).slice(0, 200)}`);
  const { prompt_id } = await submit.json();

  for (let i = 0; i < 240; i++) {
    await sleep(1000);
    const h = await fetch(`${u}/history/${prompt_id}`);
    if (!h.ok) continue;
    const entry = (await h.json())[prompt_id];
    if (!entry) continue;
    if (entry.status?.status_str === 'error') throw new Error('ComfyUI failed to run the workflow.');
    const files: { filename: string; subfolder: string; type: string }[] = Object.values<any>(entry.outputs ?? {}).flatMap((o) => o.images ?? []);
    if (!files.length) continue;
    return files.map((f) => `${u}/view?filename=${encodeURIComponent(f.filename)}&subfolder=${encodeURIComponent(f.subfolder)}&type=${f.type}`);
  }
  throw new Error('ComfyUI took too long (4 minutes).');
}

/** Checkpoint names the image server can load (A1111: /sdapi/v1/sd-models, ComfyUI: /object_info/CheckpointLoaderSimple). */
export async function fetchCheckpoints(engine: 'a1111' | 'comfyui', url: string): Promise<string[]> {
  const u = trim(url);
  if (engine === 'a1111') {
    const res = await fetch(`${u}/sdapi/v1/sd-models`);
    if (!res.ok) throw new Error(`A1111 returned ${res.status}`);
    return ((await res.json()) as { title: string }[]).map((m) => m.title);
  }
  const res = await fetch(`${u}/object_info/CheckpointLoaderSimple`);
  if (!res.ok) throw new Error(`ComfyUI returned ${res.status}`);
  const data = await res.json();
  return data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
}
