/**
 * appleArt.ts
 *
 * The Apple ][ tile set (settings.ts Tiles): Ultima V's own Apple II tiles, the game having been drawn for the Apple II
 * first and its EGA tiles after. They are the Apple version's SHAPES (public/graphics/apple2-u5-tiles.png, made by
 * tools/art/apple2.ts from the Apple II Program disk): the same 512 as the PC's and in the same order, each fourteen
 * pixels across and sixteen down in the Apple's six colours, drawn whole on black as the Apple drew them
 * (StandardArt.squares). A figure's ground is clear in the sheet, so it can stand in a scene (the gypsy's stage); on
 * the map its square is black. Without the sheet (not fetched, offline) the set is the player's own EGA tiles in the
 * Apple's colours.
 */

import { HI } from './framebuffer.ts';
import { groundOf, ORIGINALS, tileOf } from './originals.ts';
import { CELL, type Manifest, SHEET_COLUMNS, StandardArt } from './standardArt.ts';

const N = 16;

/** The Apple sheet's tiles: fourteen of the Apple's pixels across, sixteen rows down, 32 to a row of the sheet. */
export const APPLE_W = 14;
export const APPLE_H = 16;
const APPLE_COLUMNS = 32;

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

/** 0xRRGGBB as RGBA in memory order, opaque. */
const rgba = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/** Whether tile `t` stands on a ground (a figure, a thing), which its sheet cell leaves clear. */
const stands = (t: number): boolean => t >= 0x100 || ORIGINALS.has(t);

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

const lit = (v: number): boolean => (v & 0xffffff) !== 0;

/**
 * Tile `t` of the Apple sheet (`sheet`, RGBA in memory order, `width` wide) enlarged to a cell: its fourteen pixels
 * across spread over the cell's width as the Apple's wider pixels spread over the screen's, each row HI rows. What
 * stands has its black ground clear where it joins the edge.
 */
export function fromSheet(sheet: Uint32Array, width: number, t: number): Uint32Array {
  const [sx, sy] = [(t % APPLE_COLUMNS) * APPLE_W, Math.floor(t / APPLE_COLUMNS) * APPLE_H];
  const px = new Uint32Array(APPLE_W * APPLE_H);
  for (let y = 0; y < APPLE_H; y++)
    for (let x = 0; x < APPLE_W; x++) px[y * APPLE_W + x] = (sheet[(sy + y) * width + sx + x] | 0xff000000) >>> 0;
  const ground = new Uint8Array(APPLE_W * APPLE_H);
  if (stands(t)) {
    const stack: number[] = [];
    const reach = (x: number, y: number): void => {
      const k = y * APPLE_W + x;
      if (x < 0 || y < 0 || x >= APPLE_W || y >= APPLE_H || ground[k] || lit(px[k])) return;
      ground[k] = 1;
      stack.push(k);
    };
    for (let x = 0; x < APPLE_W; x++) {
      reach(x, 0);
      reach(x, APPLE_H - 1);
    }
    for (let y = 0; y < APPLE_H; y++) {
      reach(0, y);
      reach(APPLE_W - 1, y);
    }
    while (stack.length) {
      const k = stack.pop()!;
      const [x, y] = [k % APPLE_W, Math.floor(k / APPLE_W)];
      reach(x + 1, y);
      reach(x - 1, y);
      reach(x, y + 1);
      reach(x, y - 1);
    }
  }
  const out = new Uint32Array(CELL * CELL);
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const i = Math.floor((y * APPLE_H) / CELL) * APPLE_W + Math.floor((x * APPLE_W) / CELL);
      out[y * CELL + x] = ground[i] ? 0 : px[i];
    }
  return out;
}

/**
 * The Apple ][ set, from the Apple sheet (`sheet`, `width` wide; null for none, when every tile is the player's own
 * `tiles`, as the EGA animator keeps them, in the Apple's colours), lettered as `lettering` is.
 */
export function appleArt(tiles: Uint8Array, sheet: Uint32Array | null, width: number, lettering: StandardArt | null): StandardArt {
  const rows = 512 / SHEET_COLUMNS;
  const cells = new Uint32Array(SHEET_COLUMNS * CELL * rows * CELL);
  // The water and lava roll, as the Apple rolled them.
  const manifest: Manifest = { scroll: { 1: 2, 2: 2, 3: 2, 0x8f: 2 } };
  const art = new StandardArt(cells, SHEET_COLUMNS * CELL, sheet ? manifest : {});
  art.squares = true;
  if (lettering) [art.font, art.runes, art.caps] = [lettering.font, lettering.runes, lettering.caps];
  if (sheet) for (let t = 0; t < 512; t++) art.put(t, fromSheet(sheet, width, t));
  else
    art.useDerived(
      tiles,
      Array.from({ length: 512 }, (_, t) => t),
      apple,
    );
  return art;
}
