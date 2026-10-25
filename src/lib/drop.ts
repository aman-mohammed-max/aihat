import type { Picked } from './attach';

/** Dropping files onto the window is a desktop thing (drop.web.ts); on a phone nothing is ever dragged in. */
export function useFileDrop(_onFiles: (files: Picked[]) => void) {
  return false;
}
