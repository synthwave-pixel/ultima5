/**
 * c64.ts
 *
 * The C64 tile sheet (public/graphics/c64-u5-tiles.png) from Ultima V's own Commodore 64 disks: `npm run c64 -- <disk 1>`,
 * the disk a .d64 image or the .zip it came in (the zip may hold all six; disk 1 is the one with the tiles). The tiles
 * are disk 1's S0 to S3, 128 tiles each, the same 512 as the PC's TILES.16 and in the same order: each 16 by 16 in the
 * C64's hi-res bitmap, four 8 by 8 cells (top left, top right, bottom left, bottom right) of eight bytes, the high bit
 * the leftmost pixel. COLORS gives each cell its two colours, a byte to a cell, four to a tile: the high nibble the
 * colour of a lit pixel, the low nibble of a dark one. Drawn in the C64's colours (the "Pepto" palette emulators use),
 * 32 tiles to a row.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { encodePng, newImage } from '../png.ts';

export const TILES = 512;
export const TILE = 16;
export const SHEET_COLUMNS = 32;

/** The C64's sixteen colours (0xRRGGBB), as the "Pepto" palette has them. */
export const C64 = [
  0x000000, 0xffffff, 0x68372b, 0x70a4b2, 0x6f3d86, 0x588d43, 0x352879, 0xb8c76f, 0x6f4f25, 0x433900, 0x9a6759, 0x444444, 0x6c6c6c,
  0x9ad284, 0x6c5eb5, 0x959595,
];

/** Sectors on each track of a 1541 disk (tracks 1 to 35). */
const sectors = (track: number): number => (track <= 17 ? 21 : track <= 24 ? 19 : track <= 30 ? 18 : 17);

/** Where sector `s` of track `t` lies in a .d64 image. */
function at(t: number, s: number): number {
  let n = 0;
  for (let k = 1; k < t; k++) n += sectors(k);
  return (n + s) * 256;
}

/** A file in a .d64 image's directory, by name, its two-byte load address left off; null if there is none. */
export function d64File(image: Uint8Array, name: string): Uint8Array | null {
  const seen = new Set<string>();
  for (let [t, s] = [18, 1]; t && !seen.has(`${t},${s}`); ) {
    seen.add(`${t},${s}`);
    const dir = image.subarray(at(t, s), at(t, s) + 256);
    for (let i = 0; i < 8; i++) {
      const e = dir.subarray(i * 32, i * 32 + 32);
      if (!e[2]) continue;
      const fn = String.fromCharCode(...e.subarray(5, 21)).replace(/\xa0+$/, '');
      if (fn === name) return chain(image, e[3], e[4]).subarray(2);
    }
    [t, s] = [dir[0], dir[1]];
  }
  return null;
}

/** A file's sectors followed from (t, s): each sector's 254 bytes, the last its count. */
function chain(image: Uint8Array, t: number, s: number): Uint8Array {
  const parts: Uint8Array[] = [];
  const seen = new Set<string>();
  while (t && !seen.has(`${t},${s}`)) {
    seen.add(`${t},${s}`);
    const b = image.subarray(at(t, s), at(t, s) + 256);
    if (b[0] === 0) {
      parts.push(b.subarray(2, b[1] + 1));
      break;
    }
    parts.push(b.subarray(2));
    [t, s] = [b[0], b[1]];
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Tile `t` as rows of colours (0xRRGGBB): `shapes` S0 to S3 end to end, `colors` COLORS. */
export function tile(shapes: Uint8Array, colors: Uint8Array, t: number): number[][] {
  const rows = Array.from({ length: TILE }, () => new Array<number>(TILE).fill(0));
  for (let cell = 0; cell < 4; cell++) {
    const [cx, cy] = [(cell % 2) * 8, Math.floor(cell / 2) * 8];
    const c = colors[t * 4 + cell];
    const [lit, dark] = [C64[c >> 4], C64[c & 15]];
    for (let r = 0; r < 8; r++) {
      const byte = shapes[t * 32 + cell * 8 + r];
      for (let x = 0; x < 8; x++) rows[cy + r][cx + x] = byte & (0x80 >> x) ? lit : dark;
    }
  }
  return rows;
}

/** The sheet: every tile in the C64's colours, opaque. */
export function sheet(shapes: Uint8Array, colors: Uint8Array): ReturnType<typeof newImage> {
  if (shapes.length !== TILES * 32) throw new Error(`S0-S3 are ${shapes.length} bytes, not ${TILES * 32}`);
  if (colors.length < TILES * 4) throw new Error(`COLORS is ${colors.length} bytes, not ${TILES * 4}`);
  const img = newImage(SHEET_COLUMNS * TILE, (TILES / SHEET_COLUMNS) * TILE);
  for (let t = 0; t < TILES; t++)
    tile(shapes, colors, t).forEach((cols, y) =>
      cols.forEach((c, x) => {
        const i = ((Math.floor(t / SHEET_COLUMNS) * TILE + y) * img.width + (t % SHEET_COLUMNS) * TILE + x) * 4;
        img.data.set([c >> 16, (c >> 8) & 0xff, c & 0xff, 0xff], i);
      }),
    );
  return img;
}

/** Disk 1's image, out of its .zip if it is in one (the zip may hold all six disks). */
function diskImage(path: string): Uint8Array {
  const file = new Uint8Array(readFileSync(path));
  if (!path.toLowerCase().endsWith('.zip')) return file;
  const images = Object.entries(unzipSync(file)).filter(([name]) => /\.d64$/i.test(name) && !name.startsWith('__MACOSX'));
  const disk = images.find(([, image]) => d64File(image, 'S0')) ?? images[0];
  if (!disk) throw new Error(`${path}: no .d64 disk image in it`);
  return disk[1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: npm run c64 -- <the Ultima V C64 disk 1: .d64, or the .zip of the disks>');
    process.exit(1);
  }
  const image = diskImage(path);
  const parts = ['S0', 'S1', 'S2', 'S3'].map((n) => d64File(image, n));
  const colors = d64File(image, 'COLORS');
  if (parts.some((p) => !p) || !colors) throw new Error(`${path}: no S0-S3 and COLORS on it (it wants disk 1 of 6)`);
  const shapes = new Uint8Array(TILES * 32);
  parts.forEach((p, i) => shapes.set(p!.subarray(0, 128 * 32), i * 128 * 32));
  const out = new URL('../../public/graphics/c64-u5-tiles.png', import.meta.url);
  writeFileSync(out, encodePng(sheet(shapes, colors)));
  console.log(`${out.pathname}: ${TILES} tiles`);
}
