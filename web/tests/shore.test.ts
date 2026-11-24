import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../tools/png';
import type { Place } from '../src/game/io.ts';
import { placeOf } from '../src/game/world.ts';
import { HI_WIDTH } from '../src/ui/framebuffer.ts';
import { Shores } from '../src/ui/shore.ts';
import { CELL, type Manifest, StandardArt } from '../src/ui/standardArt.ts';
import { newGame } from './helpers.ts';

/**
 * The Standard look draws the world map's shores from the map (web/src/ui/shore.ts): the waterline wanders by the
 * world's own noise, unbroken from square to square, along the coasts as well as the rivers.
 */
describe('the shore drawn from the map', () => {
  const N = CELL;
  // A sheet of flat colours: grass green, the three waters blue from shallow to deep; no banks.
  const COLOURS: Record<number, [number, number, number]> = { 1: [0, 0, 100], 2: [0, 0, 160], 3: [0, 0, 220], 5: [0, 200, 0] };
  const rgba = ([r, g, b]: [number, number, number]): number => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  const shores = new Shores({ pixel: (t) => rgba(COLOURS[t] ?? [90, 90, 90]), land: () => undefined, roll: () => 0 });
  /** A map of `rows` (tile numbers), and the place of its square (x, y). */
  const place = (rows: number[][], x: number, y: number): Place => {
    const around = new Uint8Array(25);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const r = rows[Math.min(rows.length - 1, Math.max(0, y + dy))];
        around[(dy + 2) * 5 + dx + 2] = r[Math.min(r.length - 1, Math.max(0, x + dx))];
      }
    return { map: 0, x: 100 + x, y: 100 + y, around };
  };
  /** The whole map drawn, its squares side by side: RGBA per pixel. */
  const drawn = (rows: number[][]): { px: Uint32Array; w: number } => {
    const w = rows[0].length * N;
    const px = new Uint32Array(w * rows.length * N);
    rows.forEach((r, y) =>
      r.forEach((t, x) => {
        const out = new Uint32Array(N * N).fill(rgba(COLOURS[t]));
        const p = place(rows, x, y);
        if (Shores.drawn(p)) shores.draw(out, p);
        for (let j = 0; j < N; j++) px.set(out.subarray(j * N, j * N + N), (y * N + j) * w + x * N);
      }),
    );
    return { px, w };
  };
  const isLand = (v: number): boolean => ((v >> 8) & 0xff) > ((v >> 16) & 0xff);

  // Grass to the west, the sea to the east, the coast straight down the map between columns 1 and 2.
  const coast = Array.from({ length: 8 }, () => [5, 5, 3, 3]);

  it('wanders both ways across a straight coast: land into the water squares, water into the land', () => {
    const { px, w } = drawn(coast);
    let landInWater = 0;
    let waterInLand = 0;
    for (let y = 0; y < coast.length * N; y++) {
      for (let x = N; x < 2 * N; x++) if (!isLand(px[y * w + x])) waterInLand++;
      for (let x = 2 * N; x < 3 * N; x++) if (isLand(px[y * w + x])) landInWater++;
    }
    expect(landInWater).toBeGreaterThan(200);
    expect(waterInLand).toBeGreaterThan(200);
  });

  it('is not ruled: the waterline mostly lies off the squares’ edge', () => {
    const { px, w } = drawn(coast);
    let onEdge = 0;
    for (let y = 0; y < coast.length * N; y++) if (isLand(px[y * w + 2 * N - 1]) && !isLand(px[y * w + 2 * N])) onEdge++;
    expect(onEdge / (coast.length * N)).toBeLessThan(0.25);
  });

  it('is drawn on the grid: every block of four one colour, over flat grounds', () => {
    const { px, w } = drawn(coast);
    let off = 0;
    for (let y = 0; y < coast.length * N; y += 2)
      for (let x = 0; x < w; x += 2) {
        const v = px[y * w + x];
        if (px[y * w + x + 1] !== v || px[(y + 1) * w + x] !== v || px[(y + 1) * w + x + 1] !== v) off++;
      }
    expect(off).toBe(0);
  });

  it('leaves ground with no water beside it alone', () => {
    expect(Shores.drawn(place([[5, 5, 5, 5, 5]], 2, 0))).toBe(false);
    expect(Shores.drawn(place([[5, 5, 5, 3, 3]], 2, 0))).toBe(true);
  });

  it('blends the sea’s depth from square to square, where each depth was a square of its own colour', () => {
    const sea = Array.from({ length: 5 }, () => [1, 1, 3, 3]);
    const { px, w } = drawn(sea);
    const blue = (x: number, y: number): number => (px[y * w + x] >> 16) & 0xff;
    let jump = 0;
    for (let y = 2 * N; y < 3 * N; y++) jump = Math.max(jump, Math.abs(blue(2 * N, y) - blue(2 * N - 1, y)));
    expect(jump).toBeLessThan(12); // the squares' own colours differ by 120
    expect(blue(N / 2, 2 * N + 32)).toBeLessThan(blue(3 * N + N / 2, 2 * N + 32)); // and deep is still darker than shallow
  });
});

describe('the shore on the originals’ grid (Modern PC)', () => {
  const N = CELL;
  // Grass, the waters and a path in flat colours of their own.
  const COLOURS: Record<number, [number, number, number]> = {
    1: [0, 0, 100],
    2: [0, 0, 160],
    3: [0, 0, 220],
    5: [0, 200, 0],
    0x20: [200, 0, 200],
  };
  const SAND = 0xd0c080;
  const rgba = ([r, g, b]: [number, number, number]): number => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  const shores = new Shores({ pixel: (t) => rgba(COLOURS[t] ?? [90, 90, 90]), land: () => undefined, roll: () => 0 });
  shores.style = { block: 4, sand: [SAND] };
  const place = (rows: number[][], x: number, y: number): Place => {
    const around = new Uint8Array(25);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const r = rows[Math.min(rows.length - 1, Math.max(0, y + dy))];
        around[(dy + 2) * 5 + dx + 2] = r[Math.min(r.length - 1, Math.max(0, x + dx))];
      }
    return { map: 0, x: 100 + x, y: 100 + y, around };
  };
  const drawn = (rows: number[][]): { px: Uint32Array; w: number } => {
    const w = rows[0].length * N;
    const px = new Uint32Array(w * rows.length * N);
    rows.forEach((r, y) =>
      r.forEach((t, x) => {
        const out = new Uint32Array(N * N).fill(rgba(COLOURS[t]));
        const p = place(rows, x, y);
        if (Shores.drawn(p)) shores.draw(out, p);
        for (let j = 0; j < N; j++) px.set(out.subarray(j * N, j * N + N), (y * N + j) * w + x * N);
      }),
    );
    return { px, w };
  };
  const sand = rgba([SAND >> 16, (SAND >> 8) & 0xff, SAND & 0xff]);
  const coast = Array.from({ length: 8 }, () => [5, 5, 3, 3]);

  it('is drawn on the originals’ grid: every block of sixteen one colour', () => {
    const { px, w } = drawn(coast);
    let off = 0;
    for (let y = 0; y < coast.length * N; y += 4)
      for (let x = 0; x < w; x += 4) for (let k = 1; k < 16; k++) if (px[(y + (k >> 2)) * w + x + (k & 3)] !== px[y * w + x]) off++;
    expect(off).toBe(0);
  });

  it('strews sand along the grass by the water, and none inland', () => {
    const { px, w } = drawn(coast);
    let near = 0;
    let far = 0;
    for (let y = 0; y < coast.length * N; y++)
      for (let x = 0; x < 3 * N; x++) {
        if (px[y * w + x] !== sand) continue;
        if (x < N) far++;
        else near++;
      }
    expect(near).toBeGreaterThan(200);
    expect(far).toBe(0);
  });

  it('carries no path out to the water: a bank’s land is the grass', () => {
    const { px, w } = drawn(Array.from({ length: 6 }, () => [5, 0x20, 3, 3]));
    let path = 0;
    for (let y = 0; y < 6 * N; y++) for (let x = 2 * N; x < 4 * N; x++) if (px[y * w + x] === rgba(COLOURS[0x20])) path++;
    expect(path).toBe(0);
  });
});

describe('the sea between depths on the originals’ grid (Modern PC)', () => {
  const N = CELL;
  // Each water its own ripples, in two colours of its own (none shared, so a pixel says whose it is), dark enough that
  // the dimming of the ripples' light leaves them be: deep (1), water (2) and shallows (3).
  const RIPPLES: Record<number, [[number, number, number], [number, number, number]]> = {
    1: [
      [0, 0, 90],
      [20, 30, 150],
    ],
    2: [
      [0, 10, 120],
      [30, 40, 120],
    ],
    3: [
      [0, 20, 140],
      [10, 50, 130],
    ],
  };
  const ripple: Record<number, (x: number, y: number) => number> = {
    1: (x, y) => ((x + 2 * y) >> 3) & 1,
    2: (x, y) => ((x - y + 64) >> 3) & 1,
    3: (x, y) => ((x >> 3) + (y >> 2)) & 1,
  };
  const rgba = ([r, g, b]: [number, number, number]): number => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  const own = (t: number, x: number, y: number): number => rgba(RIPPLES[t][ripple[t](x, y)]);
  let tick = 0;
  const sheet = { pixel: own, land: () => undefined, roll: (t: number) => (tick * 2 * t) % N };
  /** Which water a colour is (1 to 3), or 0 for none. */
  const whose = (v: number): number => [1, 2, 3].find((t) => RIPPLES[t].some((c) => rgba(c) === v)) ?? 0;
  /** Water `t`'s pixel at (x, y) of its square, as it has rolled by now. */
  const rolled = (t: number, x: number, y: number): number => own(t, x, (y - sheet.roll(t) + 4 * N) % N);
  // Deep, water and the shallows, two squares each, the depths' edges straight down the map.
  const sea = Array.from({ length: 16 }, () => [1, 1, 2, 2, 3, 3]);
  const drawn = (shores: Shores, rows: number[][]): { px: Uint32Array; w: number } => {
    const w = rows[0].length * N;
    const px = new Uint32Array(w * rows.length * N);
    rows.forEach((r, y) =>
      r.forEach((t, x) => {
        const out = new Uint32Array(N * N).fill(own(t, 0, 0));
        const around = new Uint8Array(25);
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const row = rows[Math.min(rows.length - 1, Math.max(0, y + dy))];
            around[(dy + 2) * 5 + dx + 2] = row[Math.min(row.length - 1, Math.max(0, x + dx))];
          }
        shores.draw(out, { map: 0, x: 100 + x, y: 100 + y, around });
        for (let j = 0; j < N; j++) px.set(out.subarray(j * N, j * N + N), (y * N + j) * w + x * N);
      }),
    );
    return { px, w };
  };
  const shores = (): Shores => {
    const s = new Shores(sheet);
    s.style = { block: 4, sand: null };
    return s;
  };

  it('is drawn in the waters’ own pixels, never a colour between two of them', () => {
    tick = 3;
    const { px, w } = drawn(shores(), sea);
    let between = 0;
    for (let y = 0; y < sea.length * N; y++)
      for (let x = 0; x < w; x++) {
        // A block of sixteen is its top-left pixel's.
        const [lx, ly] = [(x % N) & ~3, (y % N) & ~3];
        if (![1, 2, 3].some((t) => px[y * w + x] === rolled(t, lx, ly))) between++;
      }
    expect(between).toBe(0);
  });

  it('deepens gradually from one square’s middle to the next, not at their edge', () => {
    tick = 0;
    const { px, w } = drawn(shores(), sea);
    // How much of each column, from the middle of a deep square to the middle of a water one, is the deep's.
    const deep: number[] = [];
    for (let x = 1.5 * N; x <= 2.5 * N; x++) {
      let n = 0;
      for (let y = 0; y < sea.length * N; y++) if (whose(px[y * w + x]) === 1) n++;
      deep.push(n / (sea.length * N));
    }
    expect(deep[0]).toBe(1);
    expect(deep[N]).toBe(0);
    expect(deep[N / 2]).toBeGreaterThan(0.2); // the squares' edge, half way
    expect(deep[N / 2]).toBeLessThan(0.8);
    for (let i = 1; i <= N; i++) expect(Math.abs(deep[i] - deep[i - 1])).toBeLessThan(0.25);
  });

  it('keeps each pixel’s water as the ripples roll through it, so nothing crawls', () => {
    // Each tick's shores worked out afresh, as a square scrolled away and back is.
    const which = (): number[] => Array.from(drawn(shores(), sea).px, whose);
    tick = 0;
    const first = which();
    tick = 5;
    expect(which()).toEqual(first);
  });

  it('lays its patches by the world, not by the square: no two squares down the band alike', () => {
    tick = 0;
    const { px, w } = drawn(shores(), sea);
    // Which water each pixel is, from the middle of a deep square to the middle of a water one, square row by row.
    const band = (row: number): string => {
      const out: number[] = [];
      for (let y = row * N; y < (row + 1) * N; y++) for (let x = 1.5 * N; x < 2.5 * N; x++) out.push(whose(px[y * w + x]));
      return out.join('');
    };
    const rows = new Set(Array.from({ length: sea.length }, (_, r) => band(r)));
    expect(rows.size).toBe(sea.length);
  });
});

describe('a bridge over a shore drawn from the map', () => {
  const png = decodePng(readFileSync(new URL('../public/graphics/standard-tiles.png', import.meta.url)));
  const manifest = JSON.parse(readFileSync(new URL('../public/graphics/standard-tiles.json', import.meta.url), 'utf8')) as Manifest;
  const art = new StandardArt(new Uint32Array(png.data.buffer.slice(0)), png.width, manifest);

  it('keeps its deck, the river running on beneath it', () => {
    // A bridge (0x6a) with the river running north to south under it, grass to either side.
    const around = new Uint8Array(25).fill(0x05);
    for (let dy = -2; dy <= 2; dy++) around[(dy + 2) * 5 + 2] = 0x60;
    around[12] = 0x6a;
    const page = new Uint32Array(HI_WIDTH * CELL);
    art.draw(page, 0x6a, 0, 0, 0x05, { map: 0, x: 50, y: 50, around });
    const deck = art.figure(0x6a)[32 * CELL + 32];
    expect(deck >>> 24).toBe(255);
    expect(page[32 * HI_WIDTH + 32]).toBe(deck);
  });
});

describe('where a square is', () => {
  it('is given on the world map, with the squares round it', () => {
    const { g } = newGame();
    g.s.mapId = 0;
    const p = placeOf(g, 5, 5)!;
    expect([p.x, p.y]).toEqual([g.s.x, g.s.y]);
    expect(p.around.length).toBe(25);
  });

  it('is given in a town, the squares beyond its edge counting as the edge', () => {
    const { g } = newGame();
    g.s.mapId = 5;
    [g.s.x, g.s.y] = [0, 10];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) g.map[y * 32 + x] = x === 0 ? 0x09 : 0x05;
    const p = placeOf(g, 5, 5)!;
    expect([p.x, p.y]).toEqual([0, 10]);
    expect(p.around[12]).toBe(0x09);
    expect(p.around[10]).toBe(0x09); // two squares west, beyond the edge: the edge's own
    expect(p.around[14]).toBe(0x05);
  });

  it('is given on the combat map', () => {
    const { g } = newGame();
    g.s.mapId = 0xff;
    g.combatMap.fill(0x05);
    g.combatMap[3 * 32 + 4] = 0x0a;
    const p = placeOf(g, 4, 3)!;
    expect(p.around[12]).toBe(0x0a);
  });

  it('is not given in a dungeon', () => {
    const { g } = newGame();
    g.s.mapId = 0x21;
    expect(placeOf(g, 5, 5)).toBeUndefined();
  });
});
