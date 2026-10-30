export function readBoundedResponse(response: Response, maxBytes: number): Promise<Uint8Array>;
export function readBoundedJson<T = unknown>(response: Response, maxBytes: number): Promise<T>;
export function gunzipBounded(compressed: Uint8Array, maxBytes: number): Uint8Array;
export function untarSafe(tar: Uint8Array): { path: string; data: Uint8Array }[];
export function normalizeArchivePath(path: unknown): string | null;
export function unpackSafe(bytes: Uint8Array, maxUnpacked?: number): { path: string; data: Uint8Array }[];
