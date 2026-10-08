/**
 * surfaces.ts
 *
 * What is built, drawn on the tiles' own grain (the 32 grid, each pixel a
 * block of four on the sheet) as the land is: courses of brick and dressed
 * stone, planks, flagstones, cobbles, hexagonal flags. Each stone has a
 * flat tone of its own, a lit top and a shaded foot a pixel of the grid
 * deep, a speck or two of grain; the mortar and seams a darker tone of the
 * surface, never black - the fine black line is the figures' alone. Each
 * surface wraps, so a wall or a floor of many tiles runs on without a seam.
 */

import { rng } from './draw.ts';
import { BIG, type Canvas, mound, painted, ramp, type RGB, rgb, smoothstep } from './paint.ts';
import { P } from './palette.ts';

const hash = (a: number, b: number, seed: number): number => rng(((a + 7) * 7919) ^ ((b + 3) * 104729) ^ (seed * 31))();

export interface Courses {
  /** A course's height and a stone's length, in the canvas's pixels; both divide 64. */
  rise: number;
  run: number;
  /** Shade to light. */
  stops: number[];
  mortar: number;
  seed: number;
  /** How much one stone's tone differs from the next (0 to 1). */
  vary?: number;
  /** How rough its face is. */
  grain?: number;
  /** Courses standing on end: a floor laid the other way. */
  upright?: boolean;
  /** Drawn on the originals' grid of 16 (PC_GRID) rather than the grid of 32. */
  coarse?: boolean;
}

/** The grid: 32 pixels a side, each a block of four of the canvas's. */
const G = BIG / 2;

/**
 * The originals' grid, for Modern PC's own versions of the surfaces it keeps (the cobbles, the hexagonal floor, the
 * dark masonry, the white stone): 16 pixels a side, each a block of sixteen of the canvas's, as the EGA tiles are.
 */
export const PC_GRID = 16;

/** A surface drawn on the grid (on the originals' grid, `coarse`), as a canvas. */
const onGrid = (f: (gx: number, gy: number) => RGB, coarse = false): Canvas =>
  coarse ? painted((px, py) => f(px >> 2, py >> 2)) : painted((px, py) => f(px >> 1, py >> 1));

/** Brick or dressed stone in courses, each offset half a stone from the last (`rise` and `run` in the canvas's pixels). */
export function courses(o: Courses): Canvas {
  const vary = o.vary ?? 0.3;
  const specks = (o.grain ?? 0.25) * 0.3;
  const k = o.coarse ? 4 : 2;
  const G = BIG / k;
  const [rise, run] = [o.rise / k, o.run / k];
  return onGrid((gx, gy) => {
    const [x, y] = o.upright ? [gy, gx] : [gx, gy];
    const row = Math.floor(y / rise);
    const off = row % 2 ? run / 2 : 0;
    const col = Math.floor((x + off) / run);
    const u = (((x + off) % run) + run) % run; // across the stone
    const v = y % rise; // down it
    if (u === 0 || v === 0) return rgb(o.mortar);
    // The stone's own tone (the same stone wherever the tile's edge cuts it), lit along its top, shaded at its foot.
    let t = 0.5 + (hash(col % (G / run), row % (G / rise), o.seed) - 0.5) * vary;
    if (v === 1) t += 0.24;
    else if (v === rise - 1) t -= 0.24;
    else if (hash(gx, gy, o.seed + 9) < specks) t -= 0.14; // a speck of grain
    return ramp(o.stops, Math.round(t * 6) / 6);
  }, o.coarse);
}

/** The dark red brick of a floor. */
export const brickFloorCanvas = (): Canvas =>
  courses({ rise: 16, run: 32, stops: [0x2e100c, 0x481912, P.brickShade, 0x70291f], mortar: 0x1c0c0a, seed: 0x44, vary: 0.6, grain: 0.12 });

/**
 * Dressed stone: the pale walls of castles and keeps. `lift` lightens it all (the white stone of a plaza), `dim`
 * darkens it (Modern PC's white stone, the town walls' plain stone). `coarse`, on the originals' grid (PC_GRID), four
 * courses to the tile as the EGA's walls have.
 */
export const stoneCanvas = (lift = 0, coarse = false, dim = 1): Canvas =>
  courses({
    rise: coarse ? 16 : 8,
    run: coarse ? 32 : 16,
    coarse,
    stops: [P.wallShade, P.wall, P.wallLight, 0xeef2f8],
    mortar: 0x5a6070,
    seed: 0x4f,
    vary: 0.45,
    grain: 0.2,
  }).map((c) => c.map((k) => (k + (255 - k) * lift) * dim) as RGB);

/** Dark dressed stone: a dungeon's or a harbour's. `coarse`, on the originals' grid (PC_GRID), four courses to the tile. */
export const darkStoneCanvas = (coarse = false): Canvas =>
  courses({
    rise: coarse ? 16 : 8,
    run: coarse ? 32 : 16,
    coarse,
    stops: [P.flagShade, P.flag, P.flagLight],
    mortar: 0x2c2c36,
    seed: 0x87,
    vary: 0.4,
    grain: 0.25,
  });

/** Stone flags: big squared slabs. */
export const flagsCanvas = (seed: number): Canvas =>
  courses({ rise: 16, run: 32, stops: [0x2c2c34, P.flagShade, P.flag, P.flagLight], mortar: 0x34343e, seed, vary: 0.5, grain: 0.35 });

/** Planks, along or (`down`) across: boards on the grid, each its own tone, a streak or two of grain along it, butted at odd places. */
export function planksCanvas(seed: number, down: boolean): Canvas {
  const RISE = 8;
  const seam = 0x3e2412;
  return onGrid((gx, gy) => {
    const [x, y] = down ? [gy, gx] : [gx, gy];
    const row = Math.floor(y / RISE);
    const v = y % RISE;
    const butt = Math.floor(hash(row, 0, seed) * (G - 4)) + 2;
    if (v === 0 || x === butt) return rgb(seam);
    const board = hash(row, x > butt ? 1 : 2, seed);
    let t = 0.5 + (board - 0.5) * 0.4;
    if (v === 1) t += 0.22;
    else if (v === RISE - 1) t -= 0.22;
    // Grain: a run of darker wood along the board, a row of it or two, broken here and there.
    else if (hash(row, v, seed + 5) < 0.3 && hash(Math.floor(x / 5), row * 8 + v, seed + 6) < 0.7) t -= 0.18;
    return ramp([P.plankShade, P.plank, P.plankLight, 0xa87040], Math.round(t * 6) / 6);
  });
}

/**
 * Cobbles on the grid: stones of their own tones round points scattered over the tile, each the ground nearest it,
 * lit where it faces the upper left and shaded at the lower right, bedded in a darker joint - the ultima3 port's
 * blue-grey town floor, darker, so the walls and what stands on it read.
 */
export function gridCobbles(seed: number, stops: number[], joint: number, coarse = false): Canvas {
  // On the originals' grid (`coarse`, PC_GRID) three stones to a row, not five, so each is as large to the eye.
  const G = coarse ? PC_GRID : BIG / 2;
  const n = coarse ? 3 : 5;
  const r = rng(seed);
  const seeds: [number, number][] = [];
  // Each stone's middle somewhere in its square of the n by n, as far across it as `jitter` of the grid's pixels.
  const jitter = coarse ? 3 : 5;
  for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) seeds.push([(cx * G) / n + r() * jitter, (cy * G) / n + r() * jitter]);
  const LEAN = coarse ? 1.5 : 3;
  const near = (gx: number, gy: number): [number, number] => {
    let [best, second, id] = [Infinity, Infinity, 0];
    seeds.forEach(([sx, sy], i) => {
      const dx = Math.min(Math.abs(gx - sx), G - Math.abs(gx - sx));
      const dy = Math.min(Math.abs(gy - sy), G - Math.abs(gy - sy));
      const d = Math.hypot(dx, dy);
      if (d < best) [second, best, id] = [best, d, i];
      else if (d < second) second = d;
    });
    return [id, second - best];
  };
  return onGrid((gx, gy) => {
    const [id, edge] = near(gx + 0.5, gy + 0.5);
    if (edge < 1) return rgb(joint);
    const [sx, sy] = seeds[id];
    const lean = ((gx - sx + G * 1.5) % G) - G / 2 + (((gy - sy + G * 1.5) % G) - G / 2);
    let t = 0.5 + (hash(id, 0, seed) - 0.5) * 0.4;
    if (lean < -LEAN) t += 0.22;
    else if (lean > LEAN) t -= 0.22;
    return ramp(stops, Math.round(t * 6) / 6);
  }, coarse);
}

/**
 * Hexagonal flags on the grid: a honeycomb of flat-topped stones, each its own tone, lit along its upper edges and
 * shaded along its lower, in a darker joint - the cobbles' colours and weight in the hex's shape. Their columns are 8
 * pixels of the grid apart and every other one half a stone down, so the honeycomb repeats in the tile (a true
 * hexagon a little squashed to fit it).
 */
export function hexFlags(seed: number, stops: number[], joint: number, coarse = false): Canvas {
  // Flat-topped hexagons of radius R, in four columns across the tile and three rows down it (the rows stretched a
  // little to fill the tile's height, since a true hexagon's do not divide it); on the originals' grid (`coarse`,
  // PC_GRID), two columns and two rows, each stone as large to the eye.
  const G = coarse ? PC_GRID : BIG / 2;
  const R = coarse ? G / 3 : G / 6;
  const cols = coarse ? 2 : 4;
  const rows = coarse ? 2 : 3;
  const stretch = (rows * Math.sqrt(3) * R) / G;
  /** The stone (column, row, wrapped to the tile) that grid point (x, y) lies on, and how far below its middle. */
  const stone = (x: number, y: number): [number, number, number] => {
    const [hx, hy] = [((x % G) + G) % G, (((y % G) + G) % G) * stretch];
    const q = ((2 / 3) * hx) / R;
    const r = ((-1 / 3) * hx + (Math.sqrt(3) / 3) * hy) / R;
    // Cube rounding.
    let [rx, rz] = [Math.round(q), Math.round(r)];
    const ry = Math.round(-q - r);
    const [dx, dy, dz] = [Math.abs(rx - q), Math.abs(ry - (-q - r)), Math.abs(rz - r)];
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy <= dz) rz = -rx - ry;
    const col = rx;
    const row = rz + (col - (col & 1)) / 2;
    const cy = Math.sqrt(3) * R * (row + (col & 1) / 2);
    return [((col % cols) + cols) % cols, ((row % rows) + rows) % rows, hy - cy];
  };
  return onGrid((gx, gy) => {
    const [px, py] = [gx + 0.5, gy + 0.5];
    const [c, r, below] = stone(px, py);
    for (const [ox, oy] of [
      [1, 0],
      [0, 1],
    ]) {
      const [c2, r2] = stone(px + ox, py + oy);
      if (c2 !== c || r2 !== r) return rgb(joint);
    }
    let t = 0.5 + (hash(c, r, seed) - 0.5) * 0.4;
    if (below < -R * 0.45) t += 0.22;
    else if (below > R * 0.45) t -= 0.22;
    return ramp(stops, Math.round(t * 6) / 6);
  }, coarse);
}

/** Cobbles: rounded stones bedded in dark earth, each lit from the upper left. */
export function cobblesCanvas(seed: number): Canvas {
  const c = painted(() => rgb(0x15151c));
  const r = rng(seed);
  const stone = [0x2c2c36, P.slateShade, P.slate, P.slateLight, 0xb8b8c8];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 5; col++) {
      const x = col * 12.8 + (row % 2) * 6.4 + (r() - 0.5) * 2;
      const y = row * 10.67 + 5 + (r() - 0.5) * 2;
      mound(c, x, y, 5.2 + r() * 1.2, 4.2 + r(), stone, 0.4, seed + row * 9 + col);
    }
  }
  return c;
}

void smoothstep;
