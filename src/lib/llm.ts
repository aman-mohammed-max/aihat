import { streamChat, type ProviderConn } from '@/api/openai';
import { useProviders, isChatModel } from '@/store/providers';
import { useSettings } from '@/store/settings';

/** The endpoint + model a chat uses (or the defaults when there is no chat yet). */
export function resolveChatModel(chat?: { providerId: string | null; modelId: string | null } | null) {
  const { providers, models } = useProviders.getState();
  const st = useSettings.getState();
  const modelId = chat?.modelId ?? st.defaultModelId ?? models.find((m) => m.enabled && isChatModel(m))?.id ?? null;
  const owner = models.find((m) => m.id === modelId)?.providerId;
  const provider = providers.find((p) => p.id === (chat?.providerId ?? owner ?? st.defaultProviderId)) ?? providers.find((p) => p.isDefault) ?? providers[0];
  return { provider: provider as (typeof provider & ProviderConn) | undefined, modelId };
}

/** One short, non-streaming-looking completion: collects the whole reply as text. */
export async function quickComplete(o: {
  chat?: { providerId: string | null; modelId: string | null } | null;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}) {
  const { provider, modelId } = resolveChatModel(o.chat);
  if (!provider || !modelId) throw new Error('Add an endpoint and pick a chat model first.');
  let out = '';
  for await (const ev of streamChat(provider, {
    model: modelId,
    params: { stream: true, maxTokens: o.maxTokens ?? 400, temperature: o.temperature ?? 0.7 },
    messages: [{ role: 'system', content: o.system }, { role: 'user', content: o.user }],
    signal: o.signal,
  })) {
    if (ev.type === 'delta') out += ev.text;
  }
  return out.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
