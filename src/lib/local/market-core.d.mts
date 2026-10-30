export type NormalizedRepoMetadata = {
  architecture?: string;
  parameters?: number;
  license?: string;
  revision?: string;
};
export function isSafeHttpsUrl(value: unknown, allowTemplate?: boolean): value is string;
export function parseSiteOrigin(input: unknown): string | null;
export function resolveSafeSiteUrl(value: unknown, base: string): string | null;
export function fillSafeHttpsTemplate(template: string, values: Record<string, string>): string;
export function normalizeRepoMetadata(data: unknown): NormalizedRepoMetadata;
export function normalizeModelDescription(readme: unknown): string | undefined;
