import type { ProviderConn } from '@/api/openai';
import { useProviders, type Provider } from '@/store/providers';
import { useSettings, type Capability } from '@/store/settings';

export const CAPABILITY_LABEL: Record<Capability, string> = {
  images: 'Image generation',
  speech: 'Text to speech',
  transcription: 'Speech to text',
  embeddings: 'Embeddings',
  search: 'Web search',
};

/** The provider that serves a feature: the one picked for it, else the default provider. */
export function resolveRoute(cap: Capability): { provider: Provider | undefined; model: string } {
  const route = useSettings.getState().routes[cap];
  const { providers } = useProviders.getState();
  const provider = providers.find((p) => p.id === route.providerId) ?? providers.find((p) => p.isDefault) ?? providers[0];
  return { provider, model: route.model };
}

export function requireRoute(cap: Capability): { provider: Provider & ProviderConn; model: string } {
  const r = resolveRoute(cap);
  if (!r.provider) throw new Error(`Add an endpoint first (needed for ${CAPABILITY_LABEL[cap].toLowerCase()}).`);
  return r as { provider: Provider & ProviderConn; model: string };
}
