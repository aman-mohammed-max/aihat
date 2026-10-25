/**
 * Makes the desktop icons from the app icon: the same picture on a rounded square with a margin, the way macOS,
 * Windows and Linux desktops show app icons. Writes icons/icon.iconset (macOS), icons/icon.png (Linux) and
 * icons/icon-256.png (Windows; the build turns it into an .ico). Run with `bun scripts/icons.ts` after the app
 * icon changes, and commit the output.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const root = join(import.meta.dir, '..');
const src = PNG.sync.read(readFileSync(join(root, '../assets/images/icon.png')));

const SIZE = 1024;
const INSET = 100; // Apple's template: an 824 px tile inside a 1024 px canvas
const TILE = SIZE - INSET * 2;
const RADIUS = 185;

/** Area-average downscale (or nearest upscale) of an RGBA image. */
function scale(img: { width: number; height: number; data: Uint8Array }, w: number, h: number) {
  const out = new Uint8Array(w * h * 4);
  const fx = img.width / w;
  const fy = img.height / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * img.width + sx) * 4;
          const al = img.data[i + 3];
          r += img.data[i] * al;
          g += img.data[i + 1] * al;
          b += img.data[i + 2] * al;
          a += al;
        }
      }
      const n = (x1 - x0) * (y1 - y0);
      const o = (y * w + x) * 4;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(a / n);
    }
  }
  return { width: w, height: h, data: out };
}

/** How much of the pixel at (x, y) is inside the rounded tile, 0..1 (4×4 samples for smooth corners). */
function coverage(x: number, y: number) {
  let hit = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const px = x + (i + 0.5) / 4 - INSET;
      const py = y + (j + 0.5) / 4 - INSET;
      if (px < 0 || py < 0 || px > TILE || py > TILE) continue;
      const cx = Math.min(Math.max(px, RADIUS), TILE - RADIUS);
      const cy = Math.min(Math.max(py, RADIUS), TILE - RADIUS);
      if ((px - cx) ** 2 + (py - cy) ** 2 <= RADIUS ** 2) hit++;
    }
  }
  return hit / 16;
}

const tile = scale({ width: src.width, height: src.height, data: src.data }, TILE, TILE);
const master = { width: SIZE, height: SIZE, data: new Uint8Array(SIZE * SIZE * 4) };
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const c = coverage(x, y);
    if (!c) continue;
    const tx = Math.min(TILE - 1, Math.max(0, x - INSET));
    const ty = Math.min(TILE - 1, Math.max(0, y - INSET));
    const i = (ty * TILE + tx) * 4;
    const o = (y * SIZE + x) * 4;
    master.data.set(tile.data.subarray(i, i + 3), o);
    master.data[o + 3] = Math.round(tile.data[i + 3] * c);
  }
}

function write(path: string, size: number) {
  const img = size === SIZE ? master : scale(master, size, size);
  const png = new PNG({ width: size, height: size });
  png.data = Buffer.from(img.data);
  writeFileSync(path, PNG.sync.write(png));
}

const set = join(root, 'icons/icon.iconset');
mkdirSync(set, { recursive: true });
for (const s of [16, 32, 128, 256, 512]) {
  write(join(set, `icon_${s}x${s}.png`), s);
  write(join(set, `icon_${s}x${s}@2x.png`), s * 2);
}
write(join(root, 'icons/icon.png'), 512);
write(join(root, 'icons/icon-256.png'), 256);
console.log('icons written to', join(root, 'icons'));
