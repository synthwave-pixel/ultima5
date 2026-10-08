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

import { TileAnimator } from './animate.ts';
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

/** Tile `t` of the Apple sheet (`sheet`, RGBA in memory order, `width` wide): APPLE_W x APPLE_H, opaque. */
function pixels(sheet: Uint32Array, width: number, t: number): Uint32Array {
  const [sx, sy] = [(t % APPLE_COLUMNS) * APPLE_W, Math.floor(t / APPLE_COLUMNS) * APPLE_H];
  const px = new Uint32Array(APPLE_W * APPLE_H);
  for (let y = 0; y < APPLE_H; y++)
    for (let x = 0; x < APPLE_W; x++) px[y * APPLE_W + x] = (sheet[(sy + y) * width + sx + x] | 0xff000000) >>> 0;
  return px;
}

/**
 * An Apple tile's pixels (`px`, APPLE_W x APPLE_H) enlarged to a cell: its fourteen pixels across spread over the
 * cell's width as the Apple's wider pixels spread over the screen's, each row HI rows. What stands (tile `t`) has its
 * black ground clear where it joins the edge.
 */
function enlarged(px: Uint32Array, t: number): Uint32Array {
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

/** Tile `t` of the Apple sheet (`sheet`, RGBA in memory order, `width` wide) enlarged to a cell (enlarged). */
export function fromSheet(sheet: Uint32Array, width: number, t: number): Uint32Array {
  return enlarged(pixels(sheet, width, t), t);
}

/**
 * The tiles the PC's animator moves (animate.ts), moved in the Apple's own art in step with it. The rivers, shores and
 * bridge carry the shallow water flowing through them, where the PC's flows, over their water and their black (the
 * bridge's clear ground too); each flag, a pennant by its pole, flaps
 * (its two rows, right of the pole, change places) when the PC's does; the flames, torches, the Flame and the
 * sparkles flicker, a third of their fire's pixels dark at a time, as the PC's flicker.
 */
export const FLOWS: readonly number[] = [0x34, 0x35, 0x36, 0x37, ...Array.from({ length: 16 }, (_, i) => 0x60 + i), 0xe4, 0xe5, 0xe6, 0xe7];
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

/** The shallow water's speed, in a cell's rows a tick (the manifest's scroll, below). */
const FLOW = 2;

/**
 * Where in each of FLOWS the PC's water flows: the EGA pixels that change as the PC's animator runs (on a copy of the
 * player's `tiles`, for a few of its ticks), and those next to them, so the flow reaches the banks.
 */
function wetOf(tiles: Uint8Array): Map<number, Uint8Array> {
  const copy = tiles.slice();
  const animator = new TileAnimator(copy);
  const first = new Map(FLOWS.map((t) => [t, tileOf(copy, t)]));
  const wet = new Map(FLOWS.map((t) => [t, new Uint8Array(N * N)]));
  for (let i = 0; i < 16; i++) {
    animator.tick();
    for (const t of FLOWS) {
      const now = tileOf(copy, t);
      const was = first.get(t)!;
      const w = wet.get(t)!;
      for (let k = 0; k < N * N; k++) if (now[k] !== was[k]) w[k] = 1;
    }
  }
  for (const [t, w] of wet) {
    const grown = w.slice();
    for (let k = 0; k < N * N; k++) {
      if (!w[k]) continue;
      const [x, y] = [k % N, Math.floor(k / N)];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        if (x + dx >= 0 && x + dx < N && y + dy >= 0 && y + dy < N) grown[(y + dy) * N + x + dx] = 1;
    }
    wet.set(t, grown);
  }
  return wet;
}

/** A number from a tile's bytes as the PC's animator has left them: the same for the same bytes. */
function hashOf(tiles: Uint8Array, t: number): number {
  let h = 0x811c9dc5;
  for (let i = t * 128; i < t * 128 + 128; i++) h = Math.imul(h ^ tiles[i], 0x01000193);
  return h >>> 0;
}

/**
 * The animated tiles drawn as the PC's animator has left the player's `tiles` (`was`, their bytes when the set was
 * made), from the Apple sheet: for StandardArt.useDerived.
 */
function animated(sheet: Uint32Array, width: number, tiles: Uint8Array): (from: Uint8Array, t: number, tick: number) => Uint32Array {
  const was = tiles.slice();
  const wet = wetOf(tiles);
  const water = fromSheet(sheet, width, 3);
  return (from, t, tick) => {
    const px = pixels(sheet, width, t);
    const flag = FLAGS.get(t);
    if (flag && from.subarray(t * 128, t * 128 + 128).some((v, i) => v !== was[t * 128 + i])) {
      const [x0, x1, y0, y1] = flag;
      for (let x = x0; x <= x1; x++) [px[y0 * APPLE_W + x], px[y1 * APPLE_W + x]] = [px[y1 * APPLE_W + x], px[y0 * APPLE_W + x]];
    }
    const fire = FLAMES.get(t);
    if (fire !== undefined) {
      let h = hashOf(from, t);
      for (let i = 0; i < px.length; i++) {
        if (px[i] !== rgba(fire)) continue;
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
        if (h % 3 === 0) px[i] = rgba(BLACK);
      }
    }
    const out = enlarged(px, t);
    const w = wet.get(t);
    if (w) {
      const roll = (tick * FLOW) % CELL;
      const [blue, black] = [rgba(BLUE), rgba(BLACK)];
      for (let y = 0; y < CELL; y++)
        for (let x = 0; x < CELL; x++) {
          const i = y * CELL + x;
          if (w[Math.floor(y / HI) * N + Math.floor(x / HI)] && (out[i] === blue || out[i] === black || out[i] >>> 24 === 0))
            out[i] = water[((y - roll + CELL) % CELL) * CELL + x];
        }
    }
    return out;
  };
}

/**
 * The Apple ][ set, from the Apple sheet (`sheet`, `width` wide; null for none, when every tile is the player's own
 * `tiles`, as the EGA animator keeps them, in the Apple's colours), lettered as `lettering` is. With the sheet, the tiles
 * the PC's animator moves are drawn again as it moves them (animated).
 */
export function appleArt(tiles: Uint8Array, sheet: Uint32Array | null, width: number, lettering: StandardArt | null): StandardArt {
  const rows = 512 / SHEET_COLUMNS;
  const cells = new Uint32Array(SHEET_COLUMNS * CELL * rows * CELL);
  // The water and lava roll, as the PC's do.
  const manifest: Manifest = { scroll: { 1: FLOW, 2: FLOW, 3: FLOW, 0x8f: FLOW } };
  const art = new StandardArt(cells, SHEET_COLUMNS * CELL, sheet ? manifest : {});
  art.squares = true;
  if (lettering) [art.font, art.runes, art.caps] = [lettering.font, lettering.runes, lettering.caps];
  if (!sheet) {
    art.useDerived(
      tiles,
      Array.from({ length: 512 }, (_, t) => t),
      apple,
    );
    return art;
  }
  for (let t = 0; t < 512; t++) art.put(t, fromSheet(sheet, width, t));
  art.useDerived(tiles, [...FLOWS, ...FLAGS.keys(), ...FLAMES.keys()], animated(sheet, width, tiles));
  return art;
}
