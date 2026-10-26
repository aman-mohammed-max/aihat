/** One command for a skill's tools: a shell-like line such as "python3 scripts/make_docx.py out.docx". */
export type SkillJob = {
  command: string;
  /** The skill whose files are mounted at /skills/<name>. */
  skill?: string;
  skillFiles?: Record<string, Uint8Array | string>;
  /** Input files, written into /work (the working folder). */
  files?: Record<string, Uint8Array | string>;
  /** Default 60 s. */
  timeoutMs?: number;
};

export type SkillResult = {
  stdout: string;
  stderr: string;
  /** 124: stopped for taking too long; 130: stopped by you; 127: a program that isn't available. */
  exitCode: number;
  /** New or changed files in /work. */
  outputFiles: Record<string, Uint8Array>;
  /** Files that were made but were too large to bring back. */
  skipped: string[];
  durationMs: number;
};

export interface SkillExecutor {
  isAvailable(): Promise<boolean>;
  run(job: SkillJob, signal?: AbortSignal): Promise<SkillResult>;
}

/** One built-in check of the runner (see selftests.json). */
export type SelfTest = {
  id: string;
  title: string;
  command: string;
  files: Record<string, string>;
  timeoutMs: number;
  expect: { exitCode?: number; exitCodeNot?: number; stdout?: string; stdoutNot?: string; stderr?: string; outputs?: string[] };
  where: 'all' | 'device';
  note: string;
};
