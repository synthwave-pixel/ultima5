/**
 * apple2.ts
 *
 * The Apple ][ tile sheet (public/graphics/apple2-u5-tiles.png) from Ultima V's own Apple II disks: `npm run apple2 --
 * <Program disk>`, the disk a .dsk or .po image or the .zip it came in. The tiles are the Program disk's SHAPES, the
 * same 512 as the PC's TILES.16 and in the same order, each sixteen rows of two hi-res bytes (fourteen pixels), the
 * file in two banks of 256 tiles, each bank byte by byte: byte k of every tile in turn, a column's sixteen rows before
 * the next column's. Drawn in the Apple's six colours as its screen showed them, fourteen pixels to a tile across and
 * sixteen down, 32 tiles to a row.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { encodePng, newImage } from '../png.ts';

/** The tiles, the size of each and how many to a row of the sheet. */
export const TILES = 512;
export const TILE_W = 14;
export const TILE_H = 16;
export const SHEET_COLUMNS = 32;

/** The Apple II's hi-res colours (0xRRGGBB), as the ultima3 port's sheet has them. */
export const BLACK = 0x000000;
export const WHITE = 0xffffff;
export const BLUE = 0x15cffd;
export const ORANGE = 0xff6a3c;
export const GREEN = 0x14f53c;
export const VIOLET = 0xff44fd;

/** A ProDOS block's two halves in a DOS-ordered (.dsk) image: the DOS sectors of each of a track's eight blocks. */
const BLOCK_SECTORS = [
  [0x0, 0xe],
  [0xd, 0xc],
  [0xb, 0xa],
  [0x9, 0x8],
  [0x7, 0x6],
  [0x5, 0x4],
  [0x3, 0x2],
  [0x1, 0xf],
];

/** A 140K ProDOS image's blocks, in whichever order the image keeps its sectors. */
function blocks(image: Uint8Array): (n: number) => Uint8Array {
  const prodos = (n: number): Uint8Array => image.subarray(n * 512, (n + 1) * 512);
  const dos = (n: number): Uint8Array => {
    const [track, half] = [Math.floor(n / 8), n % 8];
    const out = new Uint8Array(512);
    BLOCK_SECTORS[half].forEach((s, i) => out.set(image.subarray((track * 16 + s) * 256, (track * 16 + s + 1) * 256), i * 256));
    return out;
  };
  // The volume directory's header is block 2: its first entry's storage type is 0xF.
  return prodos(2)[4] >> 4 === 0xf ? prodos : dos;
}

/** A file in the image's root directory, by name; null if there is none. */
export function prodosFile(image: Uint8Array, name: string): Uint8Array | null {
  const block = blocks(image);
  for (let b = 2, first = true; b; first = false) {
    const dir = block(b);
    for (let i = first ? 1 : 0; i < 13; i++) {
      const e = dir.subarray(4 + i * 39, 4 + (i + 1) * 39);
      const storage = e[0] >> 4;
      if (!storage || String.fromCharCode(...e.subarray(1, 1 + (e[0] & 0xf))) !== name) continue;
      const key = e[0x11] | (e[0x12] << 8);
      const eof = e[0x15] | (e[0x16] << 8) | (e[0x17] << 16);
      const index = (blk: Uint8Array): Uint8Array[] =>
        Array.from({ length: 256 }, (_, j) => (blk[j] | blk[256 + j] ? block(blk[j] | (blk[256 + j] << 8)) : new Uint8Array(512)));
      const parts = storage === 1 ? [block(key)] : storage === 2 ? index(block(key)) : null;
      if (!parts) throw new Error(`${name}: storage type ${storage}`);
      const out = new Uint8Array(parts.length * 512);
      parts.forEach((p, j) => out.set(p, j * 512));
      return out.subarray(0, eof);
    }
    b = dir[2] | (dir[3] << 8);
  }
  return null;
}

/** The colour of a lit pixel alone, at column `x` of a tile drawn as the game draws it (from an odd screen byte). */
const hue = (x: number, high: number): number => (high ? (x % 2 ? BLUE : ORANGE) : x % 2 ? VIOLET : GREEN);

/**
 * A tile's row (two hi-res bytes, the low bit of each the leftmost pixel, the high bit its colours) as the screen showed
 * it: a pixel lit beside another lit is white, one lit alone its column's colour, and a pixel dark between two lit
 * alone takes their colour, as the colour of a run of alternate pixels fills it.
 */
export function row(b0: number, b1: number): number[] {
  const on = (x: number): boolean => x >= 0 && x < TILE_W && ((x < 7 ? b0 >> x : b1 >> (x - 7)) & 1) === 1;
  const high = (x: number): number => (x < 7 ? b0 : b1) >> 7;
  return Array.from({ length: TILE_W }, (_, x) => {
    if (on(x)) return on(x - 1) || on(x + 1) ? WHITE : hue(x, high(x));
    return on(x - 1) && on(x + 1) && !on(x - 2) && !on(x + 2) ? hue(x - 1, high(x - 1)) : BLACK;
  });
}

/** Tile `t` of SHAPES, as rows of colours (0xRRGGBB). */
export function tile(shapes: Uint8Array, t: number): number[][] {
  const base = Math.floor(t / 256) * 8192 + (t % 256);
  return Array.from({ length: TILE_H }, (_, r) => row(shapes[base + r * 256], shapes[base + (16 + r) * 256]));
}

/** The sheet: every tile of SHAPES in the Apple's colours, opaque. */
export function sheet(shapes: Uint8Array): ReturnType<typeof newImage> {
  if (shapes.length !== TILES * 32) throw new Error(`SHAPES is ${shapes.length} bytes, not ${TILES * 32}`);
  const img = newImage(SHEET_COLUMNS * TILE_W, (TILES / SHEET_COLUMNS) * TILE_H);
  for (let t = 0; t < TILES; t++)
    tile(shapes, t).forEach((cols, y) =>
      cols.forEach((c, x) => {
        const i = (((Math.floor(t / SHEET_COLUMNS) * TILE_H + y) * img.width + (t % SHEET_COLUMNS) * TILE_W + x) * 4) | 0;
        img.data.set([c >> 16, (c >> 8) & 0xff, c & 0xff, 0xff], i);
      }),
    );
  return img;
}

/** The disk image, out of its .zip if it is in one. */
function diskImage(path: string): Uint8Array {
  const file = new Uint8Array(readFileSync(path));
  if (!path.toLowerCase().endsWith('.zip')) return file;
  const image = Object.entries(unzipSync(file)).find(([name]) => /\.(dsk|po|do)$/i.test(name));
  if (!image) throw new Error(`${path}: no disk image in it`);
  return image[1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: npm run apple2 -- <the Ultima V Apple II Program disk: .dsk, .po or its .zip>');
    process.exit(1);
  }
  const shapes = prodosFile(diskImage(path), 'SHAPES');
  if (!shapes) throw new Error(`${path}: no SHAPES on it (it wants the Program disk, disk 1 of 8)`);
  const out = new URL('../../public/graphics/apple2-u5-tiles.png', import.meta.url);
  writeFileSync(out, encodePng(sheet(shapes)));
  console.log(`${out.pathname}: ${TILES} tiles`);
}
