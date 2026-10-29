import type { ChatMessage, Params, StreamEvent } from '@/api/openai';

/** Computers use endpoints for now: models on the device are a phone and tablet feature. */
export const localEngineAvailable = () => false;

export const UNAVAILABLE = 'Models on the device aren’t available in the desktop app yet. Use an endpoint instead.';

export const unloadModel = async () => {};

export async function* streamLocal(_modelId: string, _messages: ChatMessage[], _params?: Params, _signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  throw new Error(UNAVAILABLE);
}
