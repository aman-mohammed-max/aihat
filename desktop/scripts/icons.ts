/**
 * Makes the desktop icons from the app's mark (the soft hexagon in assets/images/splash-icon.png, on a clear
 * background) with Apple's margin around it, so the desktop icon has the hexagon's own shape. Writes
 * icons/icon.iconset (macOS), icons/icon.png (Linux) and icons/icon-256.png (Windows; the build turns it into an
 * .ico). Run with `bun scripts/icons.ts` after the app icon changes, and commit the output.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const root = join(import.meta.dir, '..');
const src = PNG.sync.read(readFileSync(join(root, '../assets/images/splash-icon.png')));

const SIZE = 1024;
const INSET = 100; // Apple's template: an 824 px tile inside a 1024 px canvas
const TILE = SIZE - INSET * 2;

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

const tile = scale({ width: src.width, height: src.height, data: src.data }, TILE, TILE);
const master = { width: SIZE, height: SIZE, data: new Uint8Array(SIZE * SIZE * 4) };
for (let y = 0; y < TILE; y++) {
  master.data.set(tile.data.subarray(y * TILE * 4, (y + 1) * TILE * 4), ((y + INSET) * SIZE + INSET) * 4);
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
