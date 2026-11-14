/**
 * appleArt.ts
 *
 * The Apple tile sets (settings.ts Tiles): Apple Color, Apple //e and Apple //c - Ultima V's own Apple II tiles, the game having been drawn for the Apple II
 * first and its EGA tiles after. They are the Apple version's SHAPES (public/graphics/apple2-u5-tiles.png, made by
 * tools/art/apple2.ts from the Apple II Program disk): the same 512 as the PC's and in the same order, each fourteen
 * pixels across and sixteen down in the Apple's six colours, drawn whole on black as the Apple drew them
 * (StandardArt.squares). A figure's ground is clear in the sheet, so it can stand in a scene (the gypsy's stage); on
 * the map its square is black. Without the sheet (not fetched, offline) the set is the player's own EGA tiles in the
 * Apple's colours.
 */

import { HI } from './framebuffer.ts';
import { groundOf, tileOf } from './originals.ts';
import { cellOf, pixels, rgba, sheetArt, stands, type SheetSpec } from './sheetArt.ts';
import { CELL, SHEET_COLUMNS, StandardArt } from './standardArt.ts';

export { FLOWS } from './sheetArt.ts';

const N = 16;

/** The Apple sheet's tiles: fourteen of the Apple's pixels across, sixteen rows down, 32 to a row of the sheet. */
export const APPLE_W = 14;
export const APPLE_H = 16;

/** The Apple II's hi-res colours (0xRRGGBB). */
const BLACK = 0x000000;
const WHITE = 0xffffff;
const BLUE = 0x15cffd;
const ORANGE = 0xff6a3c;
const GREEN = 0x14f53c;
const VIOLET = 0xff44fd;

/**
 * The EGA's sixteen colours as the Apple's six, by hue: the blues and cyans blue, the reds, browns and yellow orange,
 * the greens green, the magentas violet, light grey and white white. Dark grey the Apple had not: it is black and
 * white a pixel about, as a grey was dithered there.
 */
const APPLE = [BLACK, BLUE, GREEN, BLUE, ORANGE, VIOLET, ORANGE, WHITE, -1, BLUE, GREEN, BLUE, ORANGE, VIOLET, ORANGE, WHITE];

/** Tile `t` from the player's EGA tiles in the Apple's colours (CELL x CELL, RGBA in memory order): with no sheet. */
export function apple(tiles: Uint8Array, t: number): Uint32Array {
  const px = tileOf(tiles, t);
  const ground = stands(t) ? groundOf(tiles, px) : null;
  const out = new Uint32Array(CELL * CELL);
  for (let i = 0; i < N * N; i++) {
    if (ground?.[i]) continue;
    const [x, y] = [i % N, Math.floor(i / N)];
    const c = APPLE[px[i]];
    const v = rgba(c >= 0 ? c : (x + y) & 1 ? WHITE : BLACK);
    for (let r = 0; r < HI; r++) out.fill(v, (y * HI + r) * CELL + x * HI, (y * HI + r) * CELL + x * HI + HI);
  }
  return out;
}

/** Each flag: the columns of its pennant (first, last) and its two rows. */
export const FLAGS = new Map<number, [number, number, number, number]>([
  [0x12, [5, 7, 1, 2]], // keep
  [0x14, [4, 6, 3, 4]], // towne
  [0x15, [5, 7, 1, 2]], // castle
  [0x3e, [6, 8, 1, 2]], // Lord British's castle
  [0x121, [6, 8, 2, 3]], // the ships, east and west
  [0x123, [5, 7, 2, 3]],
  [0x12d, [6, 8, 2, 3]],
  [0x12f, [5, 7, 2, 3]],
]);
/** Each flame, and the colour of its fire in the Apple's art. */
export const FLAMES = new Map<number, number>([
  ...[0xb0, 0xb1, 0xb2, 0xb3, 0xbc, 0xbd, 0xbe, 0xbf].map((t): [number, number] => [t, ORANGE]),
  [0xde, BLUE], // the Flame
  [0x108, BLUE], // a gem's sparkle
  [0x1b4, VIOLET],
]);

/** The Apple in colour: its fire the flame's colour, the shallow water over its blue. */
export const APPLE_SHEET: SheetSpec = {
  w: APPLE_W,
  h: APPLE_H,
  ground: 'black',
  squares: true,
  water: [BLUE],
  fire: (t, px) => {
    const c = FLAMES.get(t);
    return c === undefined ? null : Uint8Array.from(px, (v) => (v === rgba(c) ? 1 : 0));
  },
  flags: FLAGS,
};

/**
 * The Apple on a monochrome monitor (apple2-u5-mono.png, its lit bits white): tinted `tint`, its fire the pixels the
 * colour sheet (`colour`, `width` wide) has in the flame's colour, the shallow water over its black alone.
 */
export function appleMono(tint: number, colour: Uint32Array | null, width: number): SheetSpec {
  return {
    w: APPLE_W,
    h: APPLE_H,
    tint,
    ground: 'black',
    squares: true,
    water: [],
    fire: (t) => {
      const c = FLAMES.get(t);
      if (c === undefined || !colour) return null;
      const px = pixels(APPLE_SHEET, colour, width, t);
      return Uint8Array.from(px, (v) => (v === rgba(c) ? 1 : 0));
    },
    flags: FLAGS,
  };
}

/** The Apple //e's green monitor and the //c's white one (0xRRGGBB). */
export const GREEN_SCREEN = 0x33ff33;
export const WHITE_SCREEN = 0xf0f0e8;

/** Tile `t` of the Apple sheet (`sheet`, RGBA in memory order, `width` wide) enlarged to a cell (sheetArt.ts enlarged). */
export function fromSheet(sheet: Uint32Array, width: number, t: number): Uint32Array {
  return cellOf(APPLE_SHEET, sheet, width, t);
}

/**
 * The Apple Color set, from the Apple sheet (`sheet`, `width` wide; null for none, when every tile is the player's own
 * `tiles`, as the EGA animator keeps them, in the Apple's colours), lettered as `lettering` is. With the sheet, the tiles
 * the PC's animator moves are drawn again as it moves them (sheetArt.ts).
 */
export function appleArt(tiles: Uint8Array, sheet: Uint32Array | null, width: number, lettering: StandardArt | null): StandardArt {
  if (sheet) return sheetArt(APPLE_SHEET, tiles, sheet, width, lettering);
  const rows = 512 / SHEET_COLUMNS;
  const art = new StandardArt(new Uint32Array(SHEET_COLUMNS * CELL * rows * CELL), SHEET_COLUMNS * CELL, {});
  art.squares = true;
  if (lettering) [art.font, art.runes, art.caps] = [lettering.font, lettering.runes, lettering.caps];
  art.useDerived(
    tiles,
    Array.from({ length: 512 }, (_, t) => t),
    apple,
  );
  return art;
}
