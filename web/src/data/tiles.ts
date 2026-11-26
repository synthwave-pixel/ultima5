/**
 * tiles.ts
 *
 * TILES.16: 512 tiles of 16 by 16 EGA pixels, two to a byte, high nibble
 * first (u5d graphics/grap_buf.c GRAP_BUF_PutTile). Tiles 0-255 are map
 * tiles, 256-511 the actor ("object") tiles drawn over them.
 */

import { lzwDecompress } from './lzw.ts';

export const TILE_SIZE = 16;
export const TILE_COUNT = 512;
/** The first actor tile: actor tile t is drawn as tile ACTOR_BASE + t. */
export const ACTOR_BASE = 0x100;

/** The 16 EGA colours as 0xRRGGBB (ega.ts), the colours the tiles' pixels index. */
export { EGA_PALETTE } from './ega.ts';

/** Every tile as EGA colour indices, one byte per pixel: tile t starts at t * 256. */
export function readTiles(tiles16: Uint8Array): Uint8Array {
  const packed = lzwDecompress(tiles16);
  const pixels = new Uint8Array(TILE_COUNT * TILE_SIZE * TILE_SIZE);
  for (let i = 0; i < packed.length; i++) {
    pixels[i * 2] = packed[i] >> 4;
    pixels[i * 2 + 1] = packed[i] & 0x0f;
  }
  return pixels;
}
