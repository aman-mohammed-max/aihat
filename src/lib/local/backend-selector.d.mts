export type LocalComputePreference = 'auto' | 'cpu' | 'gpu' | 'npu';
export type BackendDevice = { backend: string; type: string; deviceName: string; maxMemorySize?: number };
export type BackendCandidate = { kind: 'cpu' | 'gpu' | 'npu'; label: string; devices: string[] };
export function ggufFileType(info: unknown): number | null;
export function ggufQuantName(fileType: number | string | null): string;
export function createBackendPlan(args: { platform?: string; preference?: LocalComputePreference; devices?: BackendDevice[]; modelInfo?: unknown }): {
  candidates: BackendCandidate[];
  fallbackReason?: string;
  fileType: number | null;
};
export function actualBackend(args: { platform?: string; candidate?: BackendCandidate; context?: { gpu?: boolean; devices?: string[]; reasonNoGPU?: string } }): {
  kind: 'cpu' | 'gpu' | 'npu'; label: string; reason?: string;
};
export function accelerationFailureReason(candidate: BackendCandidate, error: unknown): string;
