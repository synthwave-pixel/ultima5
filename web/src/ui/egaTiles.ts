/**
 * egaTiles.ts
 *
 * The PC EGA tile set (settings.ts Tiles): the player's own tiles as the 1988 PC game drew them, in the EGA's own
 * sixteen colours, each tile whole on black (StandardArt.squares), in the Modern look's screen - its lettering, its
 * runes read, its panels. Nothing is toned, lifted onto the land or redrawn: the grass behind a tree, the brick under
 * a table, a creature's black square are all as the EGA drew them. Only a person or a creature's black ground is
 * left clear in its sheet cell, so it can stand in a scene (the gypsy's stage); on the map the squares' black shows
 * through it, as it did in 1988.
 */

import { EGA_PALETTE } from '../data/tiles.ts';
import { HI } from './framebuffer.ts';
import { groundOf, indices } from './originals.ts';
import { CELL, SHEET_COLUMNS, StandardArt } from './standardArt.ts';

const N = 16;

/** 0xRRGGBB as RGBA in memory order, opaque. */
const rgba = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/** Tile `t` as the EGA drew it (CELL x CELL, RGBA in memory order): a person or creature's black ground clear. */
export function ega(tiles: Uint8Array, t: number): Uint32Array {
  const px = indices(tiles, t);
  const ground = t >= 0x100 ? groundOf(tiles, px) : null;
  const out = new Uint32Array(CELL * CELL);
  for (let i = 0; i < N * N; i++) {
    // Only the ground's black: a figure drawn on a floor (the sleeper, those seated or eating) keeps its floor, as the
    // squares' black would not stand in for it.
    if (ground?.[i] && px[i] === 0) continue;
    const v = rgba(EGA_PALETTE[px[i]]);
    const [x, y] = [(i % N) * HI, Math.floor(i / N) * HI];
    for (let r = 0; r < HI; r++) out.fill(v, (y + r) * CELL + x, (y + r) * CELL + x + HI);
  }
  return out;
}

/** The PC EGA set, drawn from the player's `tiles` (as the EGA animator keeps them), lettered as `lettering` is. */
export function egaTileArt(tiles: Uint8Array, lettering: StandardArt | null): StandardArt {
  const rows = 512 / SHEET_COLUMNS;
  const art = new StandardArt(new Uint32Array(SHEET_COLUMNS * CELL * rows * CELL), SHEET_COLUMNS * CELL, {});
  art.squares = true;
  if (lettering) [art.font, art.runes, art.caps] = [lettering.font, lettering.runes, lettering.caps];
  art.useDerived(
    tiles,
    Array.from({ length: 512 }, (_, t) => t),
    ega,
  );
  return art;
}
