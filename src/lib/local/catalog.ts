/**
 * Chat models that run on the phone: GGUF files from Hugging Face, the format llama.cpp reads. A short list picked for
 * phones and tablets comes first; any other GGUF repository can be found with search.
 */

const HF = 'https://huggingface.co';

export type Picked = {
  repo: string;
  name: string;
  maker: string;
  about: string;
  /** The file to download (a 4-bit quantization: the usual balance of size and quality on a phone). */
  file: string;
  /** Its size in bytes, for the fit check before the repository has been read. */
  size: number;
  license: string;
  /** What it is good for: the Models tab's filter chips, and the chips on its page. */
  tags: ('chat' | 'reasoning')[];
};

/** Smallest first. Sizes are the Q4_K_M files as published. */
export const PICKED: Picked[] = [
  { repo: 'unsloth/Qwen3.5-0.8B-GGUF', name: 'Qwen3.5 0.8B', maker: 'Qwen', about: 'Tiny and quick. Good for short answers, rewriting and summaries on almost any phone.', file: 'Qwen3.5-0.8B-Q4_K_M.gguf', size: 533_000_000, license: 'Apache 2.0', tags: ['chat'] },
  { repo: 'LiquidAI/LFM3-1.7B-GGUF', name: 'LFM3 1.7B', maker: 'Liquid AI', about: 'Made for phones: fast, and good at everyday chat and following instructions.', file: 'LFM3-1.7B-Q4_K_M.gguf', size: 1_100_000_000, license: 'LFM Open License', tags: ['chat'] },
  { repo: 'unsloth/Qwen3.5-2B-GGUF', name: 'Qwen3.5 2B', maker: 'Qwen', about: 'A step up in knowledge and reasoning that still answers quickly.', file: 'Qwen3.5-2B-Q4_K_M.gguf', size: 1_281_000_000, license: 'Apache 2.0', tags: ['chat', 'reasoning'] },
  { repo: 'unsloth/Qwen3.5-4B-GGUF', name: 'Qwen3.5 4B', maker: 'Qwen', about: 'Noticeably smarter, with step-by-step thinking. Best on phones and tablets with 8 GB or more.', file: 'Qwen3.5-4B-Q4_K_M.gguf', size: 2_741_000_000, license: 'Apache 2.0', tags: ['chat', 'reasoning'] },
  { repo: 'unsloth/gemma-4-E2B-it-GGUF', name: 'Gemma 4 E2B', maker: 'Google', about: 'Google’s on-device model: careful writing in many languages.', file: 'gemma-4-E2B-it-Q4_K_M.gguf', size: 3_107_000_000, license: 'Apache 2.0', tags: ['chat'] },
  { repo: 'unsloth/gemma-4-E4B-it-GGUF', name: 'Gemma 4 E4B', maker: 'Google', about: 'The bigger Gemma 4 for tablets and phones with plenty of memory.', file: 'gemma-4-E4B-it-Q4_K_M.gguf', size: 4_977_000_000, license: 'Apache 2.0', tags: ['chat', 'reasoning'] },
];

export type RepoHit = { id: string; downloads: number; likes: number };
export type GgufFile = { path: string; size: number };

async function getJson(url: string) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(res.status === 404 ? 'Not found on Hugging Face.' : `Hugging Face answered ${res.status}.`);
  return res.json();
}

/** GGUF repositories matching the words, most downloaded first. */
export async function searchRepos(q: string): Promise<RepoHit[]> {
  const list: any[] = await getJson(`${HF}/api/models?filter=gguf&sort=downloads&limit=30&search=${encodeURIComponent(q.trim())}`);
  return list.map((m) => ({ id: String(m.id), downloads: Number(m.downloads) || 0, likes: Number(m.likes) || 0 }));
}

/**
 * The model files of a repository: single-file GGUFs, without vision projectors, draft models for speculative
 * decoding or files split into parts (llama.cpp would need every part).
 */
export async function repoFiles(repo: string): Promise<GgufFile[]> {
  const tree: any[] = await getJson(`${HF}/api/models/${repo}/tree/main?recursive=true`);
  return tree
    .filter((f) => f?.type === 'file' && typeof f.path === 'string' && /\.gguf$/i.test(f.path))
    .filter((f) => !/mmproj|(^|\/)(dflash|draft)[-_]|-\d{5}-of-\d{5}\.gguf$/i.test(f.path))
    .map((f) => ({ path: String(f.path), size: Number(f.size ?? f.lfs?.size) || 0 }))
    .sort((a, b) => a.size - b.size);
}

export const fileUrl = (repo: string, path: string) => `${HF}/${repo}/resolve/main/${path.split('/').map(encodeURIComponent).join('/')}?download=true`;
export const repoUrl = (repo: string) => `${HF}/${repo}`;

/** `Qwen3.5-4B-Q4_K_M.gguf` → `Q4_K_M`. */
export function quantOf(path: string) {
  return /[-_.]((?:I?Q\d(?:_[A-Z0-9]+)*)|BF16|F16|F32)\.gguf$/i.exec(path.split('/').pop() ?? '')?.[1]?.toUpperCase() ?? '';
}

/** `unsloth/Qwen3.5-4B-GGUF` → `Qwen3.5 4B`. */
export function prettyRepo(repo: string) {
  return (repo.split('/').pop() ?? repo).replace(/[-_]GGUF$/i, '').replace(/-(it|instruct)$/i, '').replace(/-/g, ' ');
}

/** 533 MB, 2.7 GB. */
export const gb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

/** What each version of a model trades: smaller files lose a little quality. */
export function quantNote(quant: string) {
  const q = quant.toUpperCase();
  if (q === 'Q4_K_M') return 'Best balance of size and quality';
  if (/^(Q2|Q3|IQ1|IQ2|IQ3)/.test(q)) return 'Smallest, a little less accurate';
  if (/^(Q4|IQ4)/.test(q)) return 'Small, close to the balanced version';
  if (/^(Q5|Q6)/.test(q)) return 'A little better, a little slower';
  if (/^Q8/.test(q)) return 'Near full quality, slow on phones';
  if (/^(F16|BF16|F32)/.test(q)) return 'Full size: for big tablets and computers';
  return '';
}
