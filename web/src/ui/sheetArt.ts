/**
 * sheetArt.ts
 *
 * A tile set shipped as a sheet in public/graphics/ (settings.ts Tiles): the same 512 as the PC's and in the same
 * order, each tile `w` by `h` of the sheet's pixels, 32 to a row. The PC's own for a CGA card, and other computers':
 * the Apple's in colour (appleArt.ts) and on a monochrome monitor (green, the //e's; white, the //c's), the Commodore
 * 64's and the Sharp X68000's. Each tile is enlarged to a cell and drawn whole on black, as the Apple and the C64 drew them
 * (StandardArt.squares), or a figure over the ground beneath it, as the X68000 drew them; a figure's ground is left clear - the black joined to its edge (the Apple's, the C64's), or
 * the sheet's own clear pixels (the X68000's) - so it can stand in a scene (the gypsy's stage). The water and lava
 * roll as the PC's do, the rivers and shores carry the shallow water through them where the PC's flows, the flags
 * flap where the set's flags are known, and the flames, torches, the Flame and the sparkles flicker, as the PC's
 * animator moves its own tiles.
 */

import { TileAnimator } from './animate.ts';
import { HI } from './framebuffer.ts';
import { ORIGINALS, tileOf } from './originals.ts';
import { CELL, type Manifest, SHEET_COLUMNS, StandardArt } from './standardArt.ts';

const N = 16;

/** How a set's sheet is drawn. */
export interface SheetSpec {
  /** A tile's size in the sheet's pixels. */
  w: number;
  h: number;
  /** A monochrome sheet's lit pixels (white on black) drawn in this colour (0xRRGGBB). */
  tint?: number;
  /** Where a figure's ground is: black joined to its edge, or the sheet's clear pixels. */
  ground: 'black' | 'clear';
  /**
   * Whether a tile is drawn whole on black, as the computer drew each square (the Apple's, the C64's); else a figure
   * stands on the ground beneath it, as the X68000 drew its people and creatures over the land.
   */
  squares: boolean;
  /** The colours (0xRRGGBB) the shallow water flowing through a river or shore may cover, besides black and clear. */
  water: readonly number[];
  /** Which of a flickering tile's pixels (`px`, as pixels gives them) are fire, a third of them dark at a time. */
  fire: (t: number, px: Uint32Array) => Uint8Array | null;
  /** Each flag: the columns of its pennant (first, last) and its two rows, swapped as the PC's flag flaps. */
  flags?: ReadonlyMap<number, readonly [number, number, number, number]>;
  /**
   * The colour (0xRRGGBB) the water flowing through tile `t` is drawn in, where the set's rivers are not the colour of
   * its sea (the CGA's cyan rivers, its magenta sea); null or none to draw it as the sea is.
   */
  flowTint?: (t: number) => number | null;
}

/** 0xRRGGBB as RGBA in memory order, opaque. */
export const rgba = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/** RGBA in memory order as 0xRRGGBB. */
export const rgbOf = (v: number): number => ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);

/** Whether tile `t` stands on a ground (a figure, a thing), which its sheet cell leaves clear. */
export const stands = (t: number): boolean => t >= 0x100 || ORIGINALS.has(t);

const lit = (v: number): boolean => (v & 0xffffff) !== 0;
const clear = (v: number): boolean => v >>> 24 === 0;

/**
 * Tile `t` of a sheet (`sheet`, RGBA in memory order, `width` wide): w x h. Opaque, but where the set's ground is the
 * sheet's clear pixels; a monochrome sheet's lit pixels in its tint.
 */
export function pixels(spec: SheetSpec, sheet: Uint32Array, width: number, t: number): Uint32Array {
  const { w, h } = spec;
  const [sx, sy] = [(t % SHEET_COLUMNS) * w, Math.floor(t / SHEET_COLUMNS) * h];
  const px = new Uint32Array(w * h);
  const tint = spec.tint === undefined ? 0 : rgba(spec.tint);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = sheet[(sy + y) * width + sx + x];
      if (spec.ground === 'clear' && clear(v)) px[y * w + x] = 0;
      else if (spec.tint !== undefined) px[y * w + x] = lit(v) ? tint : rgba(0);
      else px[y * w + x] = (v | 0xff000000) >>> 0;
    }
  return px;
}

/**
 * A tile's pixels (`px`, w x h) enlarged to a cell: each spread over the cell as the computer's own pixels spread over
 * its screen, each row HI rows at least. What stands (tile `t`) has its ground clear: the black joined to its edge, or
 * the sheet's clear pixels (left clear by pixels).
 */
export function enlarged(spec: SheetSpec, px: Uint32Array, t: number): Uint32Array {
  const { w, h } = spec;
  const ground = new Uint8Array(w * h);
  if (spec.ground === 'black' && stands(t)) {
    const stack: number[] = [];
    const reach = (x: number, y: number): void => {
      const k = y * w + x;
      if (x < 0 || y < 0 || x >= w || y >= h || ground[k] || lit(px[k])) return;
      ground[k] = 1;
      stack.push(k);
    };
    for (let x = 0; x < w; x++) {
      reach(x, 0);
      reach(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      reach(0, y);
      reach(w - 1, y);
    }
    while (stack.length) {
      const k = stack.pop()!;
      const [x, y] = [k % w, Math.floor(k / w)];
      reach(x + 1, y);
      reach(x - 1, y);
      reach(x, y + 1);
      reach(x, y - 1);
    }
  }
  const out = new Uint32Array(CELL * CELL);
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const i = Math.floor((y * h) / CELL) * w + Math.floor((x * w) / CELL);
      out[y * CELL + x] = ground[i] ? 0 : px[i];
    }
  return out;
}

/** Tile `t` of a sheet enlarged to a cell (enlarged). */
export function cellOf(spec: SheetSpec, sheet: Uint32Array, width: number, t: number): Uint32Array {
  return enlarged(spec, pixels(spec, sheet, width, t), t);
}

/**
 * The tiles the PC's animator moves (animate.ts), moved in the set's own art in step with it: the rivers, shores and
 * bridge carry the shallow water flowing through them; the flames, torches, the Flame and the sparkles flicker.
 */
export const FLOWS: readonly number[] = [0x34, 0x35, 0x36, 0x37, ...Array.from({ length: 16 }, (_, i) => 0x60 + i), 0xe4, 0xe5, 0xe6, 0xe7];
/** The tiles that flicker: the torches and braziers, the Flame, a gem's sparkle and the other sparkle. */
export const FLICKERS: readonly number[] = [0xb0, 0xb1, 0xb2, 0xb3, 0xbc, 0xbd, 0xbe, 0xbf, 0xde, 0x108, 0x1b4];

/** The shallow water's speed, in a cell's rows a tick (the manifest's scroll, below). */
export const FLOW = 2;

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
 * made), from the sheet: for StandardArt.useDerived.
 */
function animated(
  spec: SheetSpec,
  sheet: Uint32Array,
  width: number,
  tiles: Uint8Array,
): (from: Uint8Array, t: number, tick: number) => Uint32Array {
  const { w } = spec;
  const was = tiles.slice();
  const wet = wetOf(tiles);
  const sea = cellOf(spec, sheet, width, 3);
  const tinted = new Map<number, Uint32Array>();
  const waterFor = (t: number): Uint32Array => {
    const c = spec.flowTint?.(t);
    if (c == null) return sea;
    let w = tinted.get(c);
    if (!w) tinted.set(c, (w = sea.map((v) => (lit(v) && !clear(v) ? rgba(c) : v))));
    return w;
  };
  const covers = new Set(spec.water.map(rgba));
  const black = rgba(0);
  return (from, t, tick) => {
    const px = pixels(spec, sheet, width, t);
    const flag = spec.flags?.get(t);
    if (flag && from.subarray(t * 128, t * 128 + 128).some((v, i) => v !== was[t * 128 + i])) {
      const [x0, x1, y0, y1] = flag;
      for (let x = x0; x <= x1; x++) [px[y0 * w + x], px[y1 * w + x]] = [px[y1 * w + x], px[y0 * w + x]];
    }
    const fire = FLICKERS.includes(t) ? spec.fire(t, px) : null;
    if (fire) {
      let hash = hashOf(from, t);
      for (let i = 0; i < px.length; i++) {
        if (!fire[i]) continue;
        hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d) >>> 0;
        if (hash % 3 === 0) px[i] = black;
      }
    }
    const out = enlarged(spec, px, t);
    const wetHere = wet.get(t);
    if (wetHere) {
      const water = waterFor(t);
      const roll = (tick * FLOW) % CELL;
      for (let y = 0; y < CELL; y++)
        for (let x = 0; x < CELL; x++) {
          const i = y * CELL + x;
          if (wetHere[Math.floor(y / HI) * N + Math.floor(x / HI)] && (covers.has(out[i]) || out[i] === black || clear(out[i])))
            out[i] = water[((y - roll + CELL) % CELL) * CELL + x];
        }
    }
    return out;
  };
}

/**
 * A set from its sheet (`sheet`, RGBA in memory order, `width` wide), lettered as `lettering` is. The tiles the PC's
 * animator moves are drawn again as it moves them (animated).
 */
export function sheetArt(
  spec: SheetSpec,
  tiles: Uint8Array,
  sheet: Uint32Array,
  width: number,
  lettering: StandardArt | null,
): StandardArt {
  const rows = 512 / SHEET_COLUMNS;
  const cells = new Uint32Array(SHEET_COLUMNS * CELL * rows * CELL);
  // The water and lava roll, as the PC's do.
  const manifest: Manifest = { scroll: { 1: FLOW, 2: FLOW, 3: FLOW, 0x8f: FLOW } };
  const art = new StandardArt(cells, SHEET_COLUMNS * CELL, manifest);
  art.squares = spec.squares;
  // Each square its own tile, as the computer drew it: none of the Modern look's land drawn from the map over it.
  art.landFromMap = false;
  if (lettering) [art.font, art.runes, art.caps] = [lettering.font, lettering.runes, lettering.caps];
  for (let t = 0; t < 512; t++) art.put(t, cellOf(spec, sheet, width, t));
  art.useDerived(tiles, [...FLOWS, ...(spec.flags?.keys() ?? []), ...FLICKERS], animated(spec, sheet, width, tiles));
  return art;
}

/** A fire test from the colours of each flickering tile's fire (0xRRGGBB): those pixels, and no others. */
function fireOf(colours: ReadonlyMap<number, readonly number[]>): SheetSpec['fire'] {
  return (t, px) => {
    const cs = colours.get(t);
    if (!cs) return null;
    const want = new Set(cs.map(rgba));
    return Uint8Array.from(px, (v) => (want.has(v) ? 1 : 0));
  };
}

const TORCHES = [0xb0, 0xb1, 0xb2, 0xb3, 0xbc, 0xbd, 0xbe, 0xbf];

/**
 * The Commodore 64's tiles (c64-u5-tiles.png, tools/art/c64.ts): 16 by 16, in its colours ("Pepto"). Its water is its
 * blue; its torches burn as each is drawn - red and light red, light red, red, or brown - the Flame blue, a gem's
 * sparkle cyan and the other light blue.
 */
export const C64_SHEET: SheetSpec = {
  w: 16,
  h: 16,
  ground: 'black',
  squares: true,
  water: [0x352879],
  fire: fireOf(
    new Map<number, number[]>([
      [0xb0, [0x68372b, 0x9a6759]],
      [0xb1, [0x68372b, 0x9a6759]],
      [0xb2, [0x9a6759]],
      [0xb3, [0x433900]],
      [0xbc, [0x68372b]],
      [0xbd, [0x68372b]],
      [0xbe, [0x433900]],
      [0xbf, [0x68372b]],
      [0xde, [0x352879]],
      [0x108, [0x70a4b2]],
      [0x1b4, [0x6c5eb5]],
    ]),
  ),
};

/**
 * The Sharp X68000's tiles (x68k-u5-tiles.png, tools/art/x68k.ts): 32 by 32, in its eight colours, its figures on a
 * clear ground. Its water is blue and cyan; its torches burn yellow (their red is the brick behind them), the Flame and
 * a gem's sparkle blue and cyan, the other sparkle magenta.
 */
export const X68K_SHEET: SheetSpec = {
  w: 32,
  h: 32,
  ground: 'clear',
  squares: false,
  water: [0x0000ff, 0x00ffff],
  fire: fireOf(
    new Map<number, number[]>([
      ...TORCHES.map((t): [number, number[]] => [t, [0xffff00]]),
      [0xde, [0x0000ff, 0x00ffff]],
      [0x108, [0x0000ff, 0x00ffff]],
      [0x1b4, [0xff00ff]],
    ]),
  ),
};

/** The CGA's cyan and magenta (palette 1, bright), as the PC CGA tiles use them. */
const CGA_CYAN = 0x55ffff;
const CGA_MAGENTA = 0xff55ff;
/** The brazier whose bowl is magenta too: its fire only where it burns, in the bowl. */
const BRAZIER = 0xbf;
const cgaFire = fireOf(
  new Map<number, number[]>([
    ...[...TORCHES].map((t): [number, number[]] => [t, [CGA_MAGENTA]]),
    [0xde, [CGA_CYAN]], // the Flame
    [0x108, [CGA_CYAN]], // a gem's sparkle
    [0x1b4, [CGA_MAGENTA]], // the other sparkle
  ]),
);

/**
 * The 1988 PC game's own CGA tiles (cga-u5-tiles.png, tools/art/cga.ts, from TILES.4): the EGA's drawings recoloured by
 * hand in the CGA's four colours, 16 by 16, whole on black. Its sea is magenta and its rivers cyan, so the water flowing
 * through a river (and the inlets) is drawn cyan. Its torches burn magenta, the Flame and a gem's sparkle cyan, the
 * other sparkle magenta. Its flags are where the EGA's are, a pixel over or a row lower here and there.
 */
export const CGA_SHEET: SheetSpec = {
  w: 16,
  h: 16,
  ground: 'black',
  squares: true,
  water: [CGA_CYAN, CGA_MAGENTA],
  flowTint: (t) => ((t >= 0x60 && t < 0x70) || (t >= 0xe4 && t < 0xe8) ? CGA_CYAN : null),
  fire: (t, px) => {
    const fire = cgaFire(t, px);
    if (fire && t === BRAZIER)
      for (let i = 0; i < fire.length; i++) {
        const [x, y] = [i % 16, Math.floor(i / 16)];
        if (x < 6 || x > 10 || y < 7 || y > 9) fire[i] = 0;
      }
    return fire;
  },
  flags: new Map<number, [number, number, number, number]>([
    [0x12, [6, 8, 1, 2]], // keep
    [0x14, [5, 7, 3, 4]], // towne
    [0x15, [6, 8, 1, 2]], // castle
    [0x3e, [7, 9, 1, 2]], // Lord British's castle
    [0x121, [7, 9, 2, 3]], // the ships, east and west
    [0x123, [6, 8, 2, 3]],
    [0x12d, [7, 9, 2, 3]],
    [0x12f, [6, 8, 2, 3]],
  ]),
};
