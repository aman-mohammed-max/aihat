import type { SelfTest } from '../types';

/** Problems with one self-test result (empty when it passed). */
export function check(test: SelfTest, r: { stdout: string; stderr: string; exitCode: number; outputFiles: Record<string, Uint8Array> }): string[];
