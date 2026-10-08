/**
 * appleArt.ts
 *
 * The Apple ][ tile set (settings.ts Tiles): the Apple II's six colours, each tile drawn whole on black as the Apple
 * drew it (StandardArt.squares). Where Ultima III had the same thing - the grass, the water, the forest, the
 * mountains, the brick floor, the people and monsters the two games share - the ultima3 port's own Apple II tiles
 * (public/graphics/apple2-tiles.png, that port's "Apple II Color" set); everything else is the player's own EGA
 * tiles in the Apple's colours, Ultima V having been drawn for the Apple II first and its EGA tiles after. A figure's
 * ground is clear in the sheet, so it can stand in a scene (the gypsy's stage); on the map its square is black.
 */

import { HI } from './framebuffer.ts';
import { groundOf, ORIGINALS, tileOf } from './originals.ts';
import { CELL, type Manifest, SHEET_COLUMNS, StandardArt } from './standardArt.ts';

const N = 16;

/** The Apple II's hi-res colours, as the ultima3 port's sheet has them (0xRRGGBB). */
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

/** Tile `t` from the player's EGA tiles in the Apple's colours (CELL x CELL, RGBA in memory order). */
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

/** Ultima III's tiles by its map value / 4 (the ultima3 port's tiles.ts MapValue). */
const U3 = {
  water: 0,
  grass: 1,
  brush: 2,
  forest: 3,
  mountains: 4,
  dungeon: 5,
  town: 6,
  castle: 7,
  floor: 8,
  chest: 9,
  horse: 10,
  whirlpool: 12,
  serpent: 13,
  merchant: 16,
  jester: 17,
  guard: 18,
  lordBritish: 19,
  fighter: 20,
  wizard: 22,
  orc: 24,
  skeleton: 25,
  daemon: 27,
  dragon: 29,
  forceField: 32,
  lava: 33,
  moongate: 34,
  wall: 35,
  magicBall: 60,
  fireBall: 61,
  shrine: 62,
  ranger: 63,
};

/** A tile of Ultima III's sheet, or one made from them: T x T pixels, RGBA in memory order. */
interface Cell {
  px: Uint32Array;
  T: number;
}

/** Ultima III's tile `index` (its `frame`, 0 or 1; turned about, if `mirrored`) out of the sheet. */
type Take = (index: number, frame?: number, mirrored?: boolean) => Cell;

/** An Ultima V tile from Ultima III's: taken as it is, or made from them where Ultima III had no such thing. */
type FromU3 = (take: Take) => Cell;

const as =
  (index: number, frame = 0, mirrored = false): FromU3 =>
  (take) =>
    take(index, frame, mirrored);

/** A creature's four frames from Ultima III's two, in turn. */
const creature = (t: number, index: number): [number, FromU3][] => [0, 1, 2, 3].map((f) => [t + f, as(index, f & 1)]);

const lit = (v: number): boolean => (v & 0xffffff) !== 0;

/**
 * Darker, as the Apple made a colour darker: half its pixels black, a checker on the Apple's own grain (a row two of
 * the sheet's pixels high, a column about two wide) - the deep water, the forest.
 */
function darker({ px, T }: Cell): Cell {
  return { T, px: px.map((v, i) => (lit(v) && (((i % T) >> 1) + (Math.floor(i / T) >> 1)) & 1 ? 0xff000000 : v)) };
}

/** Each lit pixel lit again a row below (two of the sheet's pixels): the shallows' waves drawn broader. */
function thicker({ px, T }: Cell): Cell {
  return { T, px: px.map((v, i) => (lit(v) || i < 2 * T ? v : px[i - 2 * T])) };
}

/** Each lit pixel spread a row down and a column across: the peaks' lines heavier than the mountains'. */
function bolder({ px, T }: Cell): Cell {
  const at = (x: number, y: number): number => px[((y + T) % T) * T + ((x + T) % T)];
  return {
    T,
    px: px.map(
      (v, i) => [at(i % T, Math.floor(i / T)), at((i % T) - 2, Math.floor(i / T)), at(i % T, Math.floor(i / T) - 2)].find(lit) ?? v,
    ),
  };
}

/** Each clump of lit pixels a smaller dot at its middle, in its colour: the scrub from the brush's bushes. */
function dots({ px, T }: Cell): Cell {
  const out = new Uint32Array(T * T).fill(0xff000000);
  const seen = new Uint8Array(T * T);
  for (let i = 0; i < T * T; i++) {
    if (seen[i] || !lit(px[i])) continue;
    // The clump, found from here: its bounds.
    let [x0, y0, x1, y1] = [T, T, -1, -1];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const [x, y] = [j % T, Math.floor(j / T)];
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        const k = ny * T + nx;
        if (nx >= 0 && ny >= 0 && nx < T && ny < T && !seen[k] && px[k] === px[i]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    // A dot five wide and two rows high, at the clump's middle.
    const [cx, cy] = [Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2) & ~1];
    for (let y = cy - 2; y < cy + 2; y++)
      for (let x = cx - 2; x <= cx + 2; x++) if (x >= 0 && y >= 0 && x < T && y < T) out[y * T + x] = px[i];
  }
  return { T, px: out };
}

/** The grass with a couple of low knolls of the mountains' lines on it: the hills. */
function knolls(grass: Cell, mountains: Cell): Cell {
  const { T } = grass;
  const knoll = (x: number, y: number, cx: number, cy: number): boolean => ((x - cx) / (T * 0.3)) ** 2 + ((y - cy) / (T * 0.21)) ** 2 < 1;
  return {
    T,
    px: grass.px.map((v, i) => {
      const [x, y] = [i % T, Math.floor(i / T)];
      if (!knoll(x, y, T * 0.3, T * 0.66) && !knoll(x, y, T * 0.7, T * 0.34)) return v;
      return lit(mountains.px[i]) ? mountains.px[i] : 0xff000000;
    }),
  };
}

/** The Ultima V tiles drawn from Ultima III's: as they are, or made from them where Ultima III had no such thing. */
export const FROM_U3 = new Map<number, FromU3>([
  // The water: Ultima III's; the deep darker, the shallows' waves broader.
  [0x01, (take) => darker(take(U3.water))],
  [0x02, as(U3.water)],
  [0x03, (take) => thicker(take(U3.water))],
  [0x05, as(U3.grass)],
  // Scrub, the brush's bushes as smaller dots; the brush; the light forest Ultima III's forest, the forest darker.
  [0x06, (take) => dots(take(U3.brush))],
  [0x08, as(U3.brush)],
  [0x09, as(U3.forest)],
  [0x0a, (take) => darker(take(U3.forest))],
  // Hills, knolls of the mountains' lines on the grass; the mountains; the peaks, their lines heavier.
  [0x0b, (take) => knolls(take(U3.grass), take(U3.mountains))],
  [0x0c, as(U3.mountains)],
  [0x0d, (take) => bolder(take(U3.mountains))],
  [0x14, as(U3.town)],
  [0x15, as(U3.castle)],
  [0x18, as(U3.dungeon)],
  [0x19, as(U3.shrine)],
  [0x44, as(U3.floor)],
  [0x4f, as(U3.wall)],
  [0x8f, as(U3.lava)],
  [0xdc, as(U3.moongate)],
  [0x101, as(U3.chest)],
  // Ultima III's horse faces west; east it is turned about.
  [0x110, as(U3.horse)],
  [0x111, as(U3.horse, 0, true)],
  // The party, when it is one figure on the map.
  [0x11c, as(U3.ranger)],
  [0x1d5, as(U3.fireBall)],
  [0x1d6, as(U3.magicBall)],
  [0x1eb, as(U3.forceField)],
  ...creature(0x140, U3.wizard),
  ...creature(0x148, U3.fighter),
  ...creature(0x154, U3.merchant),
  ...creature(0x158, U3.jester),
  ...creature(0x170, U3.guard),
  ...creature(0x17c, U3.lordBritish),
  ...creature(0x188, U3.serpent),
  ...creature(0x1c0, U3.orc),
  ...creature(0x1c4, U3.skeleton),
  ...creature(0x1d8, U3.daemon),
  ...creature(0x1dc, U3.dragon),
  ...creature(0x1ec, U3.whirlpool),
]);

/** Ultima III's sheet (`u3`, RGBA in memory order, 12 columns of `width / 12`): a tile out of it. */
function taker(u3: Uint32Array, width: number): Take {
  const T = width / 12;
  return (index, frame = 0, mirrored = false) => {
    const [sx, sy] = [(Math.floor(index / 16) * 2 + frame) * T, (index % 16) * T];
    const px = new Uint32Array(T * T);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) px[y * T + x] = (u3[(sy + y) * width + sx + (mirrored ? T - 1 - x : x)] | 0xff000000) >>> 0;
    return { px, T };
  };
}

/** A tile of Ultima III's enlarged to a cell: for what stands, its black ground clear where it joins the edge. */
function enlarged({ px, T }: Cell, clear: boolean): Uint32Array {
  const ground = new Uint8Array(T * T);
  if (clear) {
    const stack: number[] = [];
    const reach = (x: number, y: number): void => {
      const k = y * T + x;
      if (x < 0 || y < 0 || x >= T || y >= T || ground[k] || lit(px[k])) return;
      ground[k] = 1;
      stack.push(k);
    };
    for (let i = 0; i < T; i++) {
      reach(i, 0);
      reach(i, T - 1);
      reach(0, i);
      reach(T - 1, i);
    }
    while (stack.length) {
      const k = stack.pop()!;
      const [x, y] = [k % T, Math.floor(k / T)];
      reach(x + 1, y);
      reach(x - 1, y);
      reach(x, y + 1);
      reach(x, y - 1);
    }
  }
  const out = new Uint32Array(CELL * CELL);
  const k = CELL / T;
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const i = Math.floor(y / k) * T + Math.floor(x / k);
      out[y * CELL + x] = ground[i] ? 0 : px[i];
    }
  return out;
}

/**
 * The Apple ][ set, from the player's tiles (`tiles`, as the EGA animator keeps them) and the ultima3 port's Apple II
 * sheet (`u3`, `width` wide; null for none, when every tile is the player's own), lettered as `lettering` is.
 */
export function appleArt(tiles: Uint8Array, u3: Uint32Array | null, width: number, lettering: StandardArt | null): StandardArt {
  const rows = 512 / SHEET_COLUMNS;
  const sheet = new Uint32Array(SHEET_COLUMNS * CELL * rows * CELL);
  // Ultima III's water and lava roll as the port's do; the player's own roll as the EGA animator rolls them.
  const manifest: Manifest = u3 ? { scroll: { 1: 2, 2: 2, 3: 2, 0x8f: 2 } } : {};
  const art = new StandardArt(sheet, SHEET_COLUMNS * CELL, manifest);
  art.squares = true;
  if (lettering) [art.font, art.runes, art.caps] = [lettering.font, lettering.runes, lettering.caps];
  const own: number[] = [];
  const take = u3 ? taker(u3, width) : null;
  for (let t = 0; t < 512; t++) {
    const from = take ? FROM_U3.get(t) : undefined;
    if (from) art.put(t, enlarged(from(take!), stands(t)));
    else own.push(t);
  }
  art.useDerived(tiles, own, apple);
  return art;
}
