export type ModelFit = 'good' | 'ok' | 'no' | 'unknown';
export type ModelMemoryAssessment =
  | { allowed: true; reason: null; contextSize: number }
  | { allowed: false; reason: 'low-memory' | 'model-too-large' | 'available-memory'; contextSize: number };
export function needs(size: number): number;
export function safeContextSize(memory?: number, modelSize?: number): number;
export function fitModel(size: number, memory: number, platform: string): ModelFit;
export function assessModelMemory(options: {
  modelSize?: number;
  totalMemory?: number;
  availableMemory?: number;
  lowMemory?: boolean;
  platform?: string;
}): ModelMemoryAssessment;
export function modelCapacity(memory: number, platform: string): { good: number; ok: number } | null;
