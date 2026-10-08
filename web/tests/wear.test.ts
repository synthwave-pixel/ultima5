import { describe, expect, it } from 'vitest';
import type { Place } from '../src/game/io.ts';
import { CELL } from '../src/ui/standardArt.ts';
import { Wear } from '../src/ui/wear.ts';

/**
 * Worn ground drawn from the map (web/src/ui/wear.ts): the sheet's grass worn to earth in steps, each a square of
 * its own, runs softly from one square's wear to the next instead of stopping at the square's edge - toward grass
 * and what grows on it, never toward water or stone.
 */
describe('worn ground drawn from the map', () => {
  const N = CELL;
  // A sheet of flat greys: each step of wear its own level (grass 0), so a pixel tells how worn it was drawn.
  const LEVEL: Record<number, number> = {
    0x05: 0,
    0x20: 12,
    0x30: 20,
    0x21: 30,
    0x31: 35,
    0x22: 45,
    0x32: 50,
    0x23: 55,
    0x24: 65,
    0x25: 78,
    0x33: 85,
    0x26: 101,
  };
  const wear = new Wear({ pixel: (tile) => (0xff000000 | (LEVEL[tile] ?? 250)) >>> 0 });
  const level = (v: number): number => v & 0xff;
  const place = (rows: number[][], x: number, y: number): Place => {
    const around = new Uint8Array(25);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const r = rows[Math.min(rows.length - 1, Math.max(0, y + dy))];
        around[(dy + 2) * 5 + dx + 2] = r[Math.min(r.length - 1, Math.max(0, x + dx))];
      }
    return { map: 0, x: 40 + x, y: 40 + y, around };
  };
  /** The mean level of a patch (the ground is dithered a block at a time: one pixel is one step or the other). */
  const patch = (out: Uint32Array, x0: number, y0: number, w = 4, h = 8): number => {
    let sum = 0;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) sum += level(out[y * N + x]);
    return sum / (w * h);
  };
  const square = (rows: number[][], x: number, y: number): Uint32Array => {
    const out = new Uint32Array(N * N);
    wear.draw(out, place(rows, x, y));
    return out;
  };

  it('leaves a square alone where all round it is worn alike, and where it is no ground that wears', () => {
    expect(Wear.drawn(place([[0x05, 0x05, 0x05]], 1, 0))).toBe(false);
    expect(Wear.drawn(place([[0x24, 0x24, 0x24]], 1, 0))).toBe(false);
    expect(Wear.drawn(place([[0x24, 0x01, 0x24]], 1, 0))).toBe(false); // water
    expect(Wear.drawn(place([[0x05, 0x24, 0x05]], 1, 0))).toBe(true);
    expect(Wear.drawn(place([[0x24, 0x05, 0x24]], 1, 0))).toBe(true); // grass beside worn ground wears a little
  });

  it("keeps each square's own wear at its centre and runs it to its neighbour's without a step at the edge", () => {
    const rows = [[0x05, 0x26, 0x05]];
    const a = square(rows, 0, 0);
    const b = square(rows, 1, 0);
    const mid = N / 2;
    expect(level(a[mid * N + mid - 1])).toBeLessThanOrEqual(2);
    expect(level(b[mid * N + mid])).toBeGreaterThanOrEqual(99);
    // Across the edge between the grass and the worn square, the wear goes on as it was going (patch by patch).
    const left = patch(a, N - 2, mid - 4, 2);
    const right = patch(b, 0, mid - 4, 2);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(8);
    expect(left).toBeGreaterThan(30);
    expect(left).toBeLessThan(70);
  });

  it('wears toward woods and hills as toward grass, but not toward water or rock', () => {
    const toWoods = square([[0x09, 0x26, 0x09]], 1, 0);
    expect(level(toWoods[(N / 2) * N])).toBeLessThan(70);
    const toWater = square([[0x01, 0x26, 0x0c]], 1, 0);
    expect(level(toWater[(N / 2) * N])).toBeGreaterThanOrEqual(99);
    expect(level(toWater[(N / 2) * N + N - 1])).toBeGreaterThanOrEqual(99);
  });

  it('fades flowering grass into the grass and earth beside it, its own picture whole at its centre', () => {
    expect(Wear.drawn(place([[0x1e, 0x1e, 0x1e]], 1, 0))).toBe(false);
    expect(Wear.drawn(place([[0x24, 0x1e, 0x05]], 1, 0))).toBe(true);
    const flowers = new Wear({ pixel: (tile) => (tile === 0x1e ? 0xff0000c8 : 0xff000000 | (LEVEL[tile] ?? 250)) >>> 0 });
    const out = new Uint32Array(N * N);
    flowers.draw(out, place([[0x05, 0x1e, 0x05]], 1, 0));
    const mid = N / 2;
    expect(level(out[mid * N + mid])).toBeGreaterThanOrEqual(195); // the flowers, whole
    expect(patch(out, 0, mid - 4, 8)).toBeGreaterThan(60); // flowers at the edge, dithered...
    expect(patch(out, 0, mid - 4, 8)).toBeLessThan(140); // ...with the grass beside
  });
});
