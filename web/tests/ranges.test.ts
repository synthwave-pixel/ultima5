import { describe, expect, it } from 'vitest';
import type { Place } from '../src/game/io.ts';
import { Ranges } from '../src/ui/ranges.ts';
import { CELL } from '../src/ui/standardArt.ts';

/**
 * The Standard look's mountains, drawn from the map (web/src/ui/ranges.ts): peaks planted by the world's own pixels,
 * running on from square to square within a range and never cut at its edge; scree under a square deep in a range,
 * grass under the rest; below the world, dark stone and no snow.
 */
describe('the ranges drawn from the map', () => {
  const N = CELL;
  const GREEN = 0xff00a000; // the grass, as the sheet gives it
  const ranges = new Ranges({ pixel: () => GREEN });
  const place = (rows: number[][], x: number, y: number, map = 0): Place => {
    const around = new Uint8Array(25);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const r = rows[Math.min(rows.length - 1, Math.max(0, y + dy))];
        around[(dy + 2) * 5 + dx + 2] = r[Math.min(r.length - 1, Math.max(0, x + dx))];
      }
    return { map, x: 60 + x, y: 60 + y, around };
  };
  /** The map drawn, a square the ranges leave alone as plain grass. */
  const drawn = (rows: number[][], map = 0): { px: Uint32Array; w: number } => {
    const w = rows[0].length * N;
    const px = new Uint32Array(w * rows.length * N);
    rows.forEach((r, y) =>
      r.forEach((_, x) => {
        const out = new Uint32Array(N * N).fill(GREEN);
        const p = place(rows, x, y, map);
        if (Ranges.drawn(p)) ranges.draw(out, p);
        for (let j = 0; j < N; j++) px.set(out.subarray(j * N, j * N + N), (y * N + j) * w + x * N);
      }),
    );
    return { px, w };
  };
  const green = (v: number): boolean => v === GREEN || (((v >> 8) & 0xff) > (v & 0xff) + 20 && ((v >> 8) & 0xff) > ((v >> 16) & 0xff) + 20);
  const white = (v: number): boolean => (v & 0xff) > 200 && ((v >> 8) & 0xff) > 200 && ((v >> 16) & 0xff) > 200;

  const G = 0x05;
  const M = 0x0c;
  const H = 0x0d;
  const range = [
    [G, G, G, G, G, G],
    [G, M, M, M, M, G],
    [G, M, H, M, M, G],
    [G, M, M, M, M, G],
    [G, G, M, G, G, G],
    [G, G, G, G, G, G],
  ];

  it('leaves the grass round a range alone: no peak is cut off at its edge', () => {
    const d = drawn(range);
    for (let y = 0; y < range.length * N; y++)
      for (let x = 0; x < d.w; x++) if (range[Math.floor(y / N)][Math.floor(x / N)] === G) expect(d.px[y * d.w + x]).toBe(GREEN);
  });

  it('runs a peak on across the squares of a range: some rock at every edge between two of its squares', () => {
    const d = drawn(range);
    let across = 0;
    for (let y = N; y < 4 * N; y++) {
      const a = d.px[y * d.w + 2 * N - 1];
      const b = d.px[y * d.w + 2 * N];
      if (!green(a) && !green(b)) across++;
    }
    expect(across).toBeGreaterThan(N);
  });

  it('stands a square deep in a range on scree, and one at its edge on grass between its peaks', () => {
    const deep = [
      [M, M, M, M, M],
      [M, M, M, M, M],
      [M, M, M, M, M],
    ];
    const count = (rows: number[][], x: number, y: number): number => {
      const out = new Uint32Array(N * N).fill(0);
      ranges.draw(out, place(rows, x, y));
      return [...out].filter(green).length;
    };
    expect(count(deep, 2, 1)).toBe(0); // all rock and scree
    expect(count(range, 2, 4)).toBeGreaterThan(N * 4); // the spur: grass shows between its peaks
  });

  it('puts snow on the high peaks of Britannia, and none below the world', () => {
    const snow = (map: number): number => [...drawn(range, map).px].filter(white).length;
    expect(snow(0)).toBeGreaterThan(50);
    expect(snow(1)).toBe(0);
  });

  it('draws a mountain close up (a settlement, a fight) as a mass of rock, not peaks', () => {
    const d = drawn(range, 2);
    expect([...d.px].filter(white).length).toBe(0);
    let rock = 0;
    for (let y = 2 * N; y < 3 * N; y++) for (let x = 2 * N; x < 3 * N; x++) if (!green(d.px[y * d.w + x])) rock++;
    expect(rock).toBeGreaterThan(N * N * 0.6);
  });

  it('draws hills as knolls running on across their squares, never cut at the edge of the hills', () => {
    const B = 0x0b;
    const R = 0x0f;
    const hills = [
      [G, G, G, G, G],
      [G, B, B, R, G],
      [G, B, B, R, G],
      [G, G, G, G, G],
    ];
    const d = drawn(hills);
    let changed = 0;
    for (let y = 0; y < hills.length * N; y++)
      for (let x = 0; x < d.w; x++) {
        const t = hills[Math.floor(y / N)][Math.floor(x / N)];
        if (t === G) expect(d.px[y * d.w + x]).toBe(GREEN);
        else if (d.px[y * d.w + x] !== GREEN) changed++;
      }
    expect(changed).toBeGreaterThan(6 * N * N * 0.3);
    // A knoll crosses the edge between two squares of hills.
    let across = 0;
    for (let y = N; y < 3 * N; y++) if (d.px[y * d.w + 2 * N - 1] !== GREEN && d.px[y * d.w + 2 * N] !== GREEN) across++;
    expect(across).toBeGreaterThan(8);
  });
});
