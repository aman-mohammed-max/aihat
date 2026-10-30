import type { ChatMessage, Params, StreamEvent } from '@/api/openai';

/** Engine-neutral request for a local inference backend. Model installation stays outside this interface. */
export type LocalGenerationRequest = {
  modelId: string;
  messages: ChatMessage[];
  params?: Params;
  signal?: AbortSignal;
};

/** Capabilities every local inference provider must implement before the app can route requests to it. */
export interface LocalInferenceProvider {
  readonly id: string;
  readonly modelFormats: readonly string[];
  initialize(): Promise<boolean>;
  loadModel(modelId: string): Promise<void>;
  unloadModel(): Promise<void>;
  generateText(request: LocalGenerationRequest): Promise<string>;
  streamTokens(request: LocalGenerationRequest): AsyncGenerator<StreamEvent>;
  stopGeneration(): Promise<void>;
  readModelInfo(modelId: string): Promise<unknown>;
  releaseMemory(): Promise<void>;
}
