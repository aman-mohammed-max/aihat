export type ModelKind = 'chat' | 'image' | 'speech' | 'transcription' | 'embedding' | 'video';

/** Words in provider metadata (type / modality / task / output modalities) that reveal a model's job. */
function fromMeta(raw: Record<string, any>): ModelKind | null {
  const bits = [
    raw.type, raw.modality, raw.task, raw.pipeline_tag, raw.category, raw.mode,
    raw.architecture?.modality, ...(raw.architecture?.output_modalities ?? []), ...(raw.output_modalities ?? []),
    ...(Array.isArray(raw.capabilities) ? raw.capabilities : []),
  ].filter((x) => typeof x === 'string').join(' ').toLowerCase();
  if (!bits) return null;
  if (/embed/.test(bits)) return 'embedding';
  if (/transcri|speech-to-text|asr|stt/.test(bits)) return 'transcription';
  if (/text-to-speech|tts|->audio|audio_speech/.test(bits) || /(^|\s)audio(\s|$)/.test(bits) && !/text->text/.test(bits)) return 'speech';
  if (/video/.test(bits)) return 'video';
  if (/->image|(^|\s)image(\s|$)|text-to-image|image-generation/.test(bits) && !/image->text/.test(bits)) return 'image';
  if (/chat|text|language|llm|completion/.test(bits)) return 'chat';
  return null;
}

/**
 * Work out what a model is for. Uses whatever metadata the server sends (OpenRouter's
 * architecture.output_modalities, Together's `type`, …), then falls back to well-known name patterns
 * (dall-e-3, tts-1, whisper-1, text-embedding-3-small, flux, kokoro, …). Unknown models count as chat.
 */
export function classifyModel(raw: Record<string, any> | string): ModelKind {
  const rec = typeof raw === 'string' ? { id: raw } : raw;
  const id = String(rec.id ?? rec.name ?? '').toLowerCase();
  const meta = fromMeta(rec);
  if (meta && meta !== 'chat') return meta;
  if (/embed|(^|[-_/])(bge|gte|e5|minilm|nomic-embed)([-_/]|$)/.test(id)) return 'embedding';
  if (/whisper|transcribe|parakeet|voxtral|(^|[-_/])nova-?\d|(^|[-_/])stt([-_/]|$)/.test(id)) return 'transcription';
  if (/(^|[-_/])tts([-_/]|$)|text-to-speech|kokoro|playai|orpheus|elevenlabs|(^|[-_/])bark([-_/]|$)|-speech|speech-|(^|[-_/])aura-?\d|melotts|simba-?\d|speechify|gemini-[\d.]+-live/.test(id)) return 'speech';
  if (/sora|(^|[-_/])veo|kling|runway|video-gen|wan2|cogvideo/.test(id)) return 'video';
  if (/dall-?e|gpt-image|flux|stable-?diffusion|sdxl|(^|[-_/])sd-?3|imagen|ideogram|recraft|kandinsky|playground-v|midjourney|(^|[-_/])(image|img)([-_/]|$)|text-to-image/.test(id)) return 'image';
  return meta ?? 'chat';
}

export const KIND_LABEL: Record<ModelKind, string> = {
  chat: 'Chat', image: 'Image', speech: 'Speech', transcription: 'Transcription', embedding: 'Embedding', video: 'Video',
};

/** Model ids people commonly need to type in by hand, by kind. Tapping one in "Add a model" fills the id and a readable name. */
export const SUGGESTED_MODELS: Partial<Record<ModelKind, { id: string; name: string }[]>> = {
  transcription: [
    { id: 'whisper-large-v3-turbo', name: 'Whisper Large v3 Turbo' },
    { id: 'whisper-large-v3', name: 'Whisper Large v3' },
    { id: '@cf/openai/whisper-large-v3-turbo', name: 'Whisper Large v3 Turbo (Cloudflare)' },
    { id: '@cf/openai/whisper', name: 'Whisper (Cloudflare)' },
    { id: '@cf/deepgram/nova-3', name: 'Deepgram Nova-3' },
    { id: 'whisper-1', name: 'Whisper (OpenAI)' },
  ],
  speech: [
    { id: 'gemini-2.5-flash-preview-tts', name: 'Gemini 2.5 Flash TTS' },
    { id: 'gemini-3.1-flash-tts-preview', name: 'Gemini 3.1 Flash TTS' },
    { id: 'simba-3.0', name: 'Simba 3.0 (Speechify)' },
    { id: 'simba-3.2', name: 'Simba 3.2 (Speechify)' },
    { id: '@cf/myshell-ai/melotts', name: 'MeloTTS' },
    { id: '@cf/deepgram/aura-1', name: 'Deepgram Aura 1' },
    { id: '@cf/deepgram/aura-2-en', name: 'Deepgram Aura 2 (English)' },
    { id: 'tts-1', name: 'TTS (OpenAI)' },
  ],
  image: [
    { id: 'gpt-image-1', name: 'GPT Image 1' },
    { id: 'dall-e-3', name: 'DALL·E 3' },
    { id: 'flux-schnell', name: 'FLUX schnell' },
    { id: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX.1 schnell' },
  ],
  embedding: [
    { id: 'auto', name: 'Auto (server default)' },
    { id: 'gemini-embedding-001', name: 'Gemini Embedding' },
    { id: 'text-embedding-3-small', name: 'OpenAI text-embedding-3-small' },
    { id: 'bge-m3', name: 'BGE-M3' },
    { id: 'nomic-embed-text', name: 'Nomic Embed Text' },
  ],
};
