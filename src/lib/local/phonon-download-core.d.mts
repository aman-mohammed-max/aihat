export type PhononPartSize = { path: string; size: number };
export type PhononResumeRecord = { version: 1; path: string; state: Record<string, unknown> };

export function createPhononResumeRecord(path: string, state: unknown, validPaths: readonly string[]): PhononResumeRecord;
export function parsePhononResumeRecord(value: unknown, validPaths: readonly string[]): PhononResumeRecord | null;
export function phononTransferProgress(parts: readonly PhononPartSize[], sizes: Record<string, number>): number;
