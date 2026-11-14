/**
 * cga.ts
 *
 * The PC CGA tile sheet (public/graphics/cga-u5-tiles.png) from the 1988 PC game's own CGA tiles: `npm run cga --
 * <TILES.4>`, the file from the MS-DOS game (any copy: GOG's, Steam's, the original disks'). TILES.4 is the EGA's
 * TILES.16 for a CGA card - the same 512 tiles in the same order, the EGA's drawings recoloured by hand, tile by tile,
 * in the CGA's four colours (palette 1, bright: black, cyan, magenta, white). LZW-compressed as TILES.16 is; each tile
 * 16 by 16, two bits a pixel, the high bits the leftmost, 64 bytes a tile. Drawn 32 tiles to a row.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lzwDecompress } from '../../src/data/lzw.ts';
import { encodePng, newImage, type Image } from '../png.ts';

export const TILES = 512;
export const TILE = 16;
export const SHEET_COLUMNS = 32;
/** A tile's bytes, decompressed: 16 rows of four. */
const BYTES = (TILE * TILE) / 4;

/** The CGA's colours as Ultima V uses them (palette 1, bright), by a pixel's two bits (0xRRGGBB). */
export const CGA_COLOURS = [0x000000, 0x55ffff, 0xff55ff, 0xffffff] as const;

/** Tile `t`'s pixel at (x, y), 0-3, of TILES.4 decompressed (`raw`). */
export const cgaPixel = (raw: Uint8Array, t: number, x: number, y: number): number =>
  (raw[t * BYTES + y * (TILE / 4) + (x >> 2)] >> (6 - 2 * (x & 3))) & 3;

/** The sheet, opaque, from TILES.4 decompressed (`raw`). */
export function sheet(raw: Uint8Array): Image {
  if (raw.length < TILES * BYTES) throw new Error(`TILES.4 holds ${raw.length} bytes decompressed, not ${TILES * BYTES}`);
  const img = newImage(SHEET_COLUMNS * TILE, (TILES / SHEET_COLUMNS) * TILE);
  for (let t = 0; t < TILES; t++) {
    const [cx, cy] = [(t % SHEET_COLUMNS) * TILE, Math.floor(t / SHEET_COLUMNS) * TILE];
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const c = CGA_COLOURS[cgaPixel(raw, t, x, y)];
        img.data.set([c >> 16, (c >> 8) & 0xff, c & 0xff, 0xff], ((cy + y) * img.width + cx + x) * 4);
      }
  }
  return img;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: npm run cga -- <TILES.4 from the MS-DOS game>');
    process.exit(1);
  }
  const out = new URL('../../public/graphics/cga-u5-tiles.png', import.meta.url);
  writeFileSync(out, encodePng(sheet(lzwDecompress(new Uint8Array(readFileSync(path))))));
  console.log(`${out.pathname}: ${TILES} tiles`);
}
