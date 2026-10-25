import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

/**
 * Material You: on Android 12+ the system derives a colour palette from the wallpaper. `@expo/ui` reads it as hex values,
 * which the theme can use like any other colour. iPhone has nothing like it, so everything here is Android only and is loaded
 * lazily: on iOS (and in an app without the module) the palette is simply unavailable.
 */
type ExpoUi = Pick<typeof import('@expo/ui/jetpack-compose'), 'getMaterialColors' | 'isDynamicColorAvailable'>;
export type WallpaperPalette = { primary: string; onPrimary: string; container: string };
type Scheme = 'light' | 'dark';

let mod: ExpoUi | null | undefined;
function expoUi(): ExpoUi | null {
  if (mod !== undefined) return mod;
  if (Platform.OS !== 'android') return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@expo/ui/jetpack-compose') as ExpoUi;
  } catch {
    mod = null;
  }
  return mod;
}

/** True on Android 12 and later, where the wallpaper colours exist. */
export function wallpaperColorsAvailable() {
  try {
    return !!expoUi()?.isDynamicColorAvailable;
  } catch {
    return false;
  }
}

/** `#RRGGBBAA` → `#RRGGBB` when fully opaque, so the colour reads like the app's own ones. */
export const opaque = (c: string) => (/^#[0-9a-f]{8}$/i.test(c) && c.slice(7).toUpperCase() === 'FF' ? c.slice(0, 7).toUpperCase() : c);

function read(scheme: Scheme): WallpaperPalette | null {
  const ui = expoUi();
  if (!ui || !wallpaperColorsAvailable()) return null;
  try {
    const p = ui.getMaterialColors({ scheme });
    // The accent is the palette's primary; the soft tint behind accent-coloured chips is its secondary container.
    return { primary: opaque(p.primary), onPrimary: opaque(p.onPrimary), container: opaque(p.secondaryContainer) };
  } catch {
    return null;
  }
}

const cache = new Map<Scheme, WallpaperPalette | null>();

/** The wallpaper palette for light or dark, read once and kept until the wallpaper changes. */
export function wallpaperPalette(scheme: Scheme, _version = 0): WallpaperPalette | null {
  if (!cache.has(scheme)) cache.set(scheme, read(scheme));
  return cache.get(scheme) ?? null;
}

/** Goes up when the wallpaper colours changed while the app was in the background, so themed screens redraw. */
export const useWallpaperVersion = create<{ v: number }>(() => ({ v: 0 }));

/** Read the palettes again; returns true when something changed. */
export function refreshWallpaper() {
  let changed = false;
  for (const scheme of [...cache.keys()]) {
    const next = read(scheme);
    if (JSON.stringify(next) !== JSON.stringify(cache.get(scheme))) {
      cache.set(scheme, next);
      changed = true;
    }
  }
  if (changed) useWallpaperVersion.setState((s) => ({ v: s.v + 1 }));
  return changed;
}

if (Platform.OS === 'android') {
  // A new wallpaper is usually picked outside the app; check when coming back.
  AppState.addEventListener('change', (state) => {
    if (state === 'active' && cache.size) refreshWallpaper();
  });
}
