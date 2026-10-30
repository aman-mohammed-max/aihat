export function modelStorageSegments(id: string): string[];
export function findLegacyModelAliases<T extends { id: string }>(
  models: T[],
  paths: { canonicalExists(id: string): boolean; legacyExists(id: string): boolean },
): string[];
export function checkedRepo(repo: string): string;
export function checkedModelPath(path: string): string;
export function checkedRevision(revision: string): string;
export function fileUrl(repo: string, path: string, revision?: string): string;
export function validateDownloadedModel(input: {
  size: number;
  expectedSize?: number;
  sha256?: string;
  expectedSha256?: string;
  magic: string;
}): void;
export function validateDownloadedPart(input: {
  size: number;
  expectedSize: number;
  sha256?: string;
  expectedSha256: string;
}): void;
export function assertStorageCapacity(modelSize: number, availableBytes: number, reserveBytes?: number): void;
export function availableAfterReservations(availableBytes: number, reservedBytes: number): number;
export function pausedDownloadReservations(jobs: Record<string, { id: string; size: number; written: number; state: string }>, excludedId?: string): number;
export function createDownloadScheduler(maxConcurrent: number): {
  enqueue(id: string, run: () => void | Promise<void>): Promise<void>;
  cancel(id: string): boolean;
  isQueued(id: string): boolean;
};
export function recoverDownloadJob<T extends { written: number }>(job: T, hasPausedTask: boolean, partialSize?: number): T & {
  written: number;
  state: 'queued' | 'paused' | 'verifying' | 'failed';
  error?: string;
};
export function finishDownloadTask(
  task: {
    state: string;
    acknowledgeBackgroundCompletionAsync(): Promise<void>;
    release(): void;
  } | undefined,
  platform: string,
): Promise<void>;
export function recoverInterruptedPromotion(input: {
  target: string;
  backup: string;
  part: string;
  indexed: boolean;
  exists(path: string): boolean | Promise<boolean>;
  move(from: string, to: string): void | Promise<void>;
  remove(path: string): void | Promise<void>;
}): Promise<'committed' | 'retry'>;
export function recoverAtomicFile(input: {
  target: string;
  backup: string;
  next: string;
  exists(path: string): boolean | Promise<boolean>;
  isValid(path: string): boolean | Promise<boolean>;
  move(from: string, to: string): void | Promise<void>;
  remove(path: string): void | Promise<void>;
}): Promise<'current' | 'restored' | 'promoted' | 'empty'>;
export function writeAtomicFile(input: {
  target: string;
  backup: string;
  next: string;
  content: string;
  write(path: string, content: string): void | Promise<void>;
  exists(path: string): boolean | Promise<boolean>;
  isValid(path: string): boolean | Promise<boolean>;
  move(from: string, to: string): void | Promise<void>;
  remove(path: string): void | Promise<void>;
}): Promise<void>;
export function recoverAtomicFileSync(input: {
  target: string;
  backup: string;
  next: string;
  exists(path: string): boolean;
  isValid(path: string): boolean;
  move(from: string, to: string): void;
  remove(path: string): void;
}): 'current' | 'restored' | 'promoted' | 'empty';
export function writeAtomicFileSync(input: {
  target: string;
  backup: string;
  next: string;
  content: string;
  write(path: string, content: string): void;
  exists(path: string): boolean;
  isValid(path: string): boolean;
  move(from: string, to: string): void;
  remove(path: string): void;
}): void;
export function promoteVerifiedDownload(input: {
  part: string;
  target: string;
  backup: string;
  exists(path: string): boolean;
  move(from: string, to: string): void;
  remove(path: string): void;
  beforePromote?(): void | Promise<void>;
  commit(): void | Promise<void>;
}): Promise<void>;
