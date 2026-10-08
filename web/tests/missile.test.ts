import { describe, expect, it } from 'vitest';
import { shoot } from '../src/game/combat.ts';
import { newGame } from './helpers.ts';

/** Where each drawn frame of a missile is centred, in pixels: a cannonball's (kind 1), a 5 x 5 ball. */
async function flight(x1: number, y1: number, x2: number, y2: number): Promise<[number, number][]> {
  const { g, p } = newGame();
  g.s.mapId = 0;
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) g.view[y * 32 + x] = 5; // open grass
  const frames: [number, number][] = [];
  let xs: number[] = [];
  let ys: number[] = [];
  const line = g.draw.line.bind(g.draw);
  g.draw.line = (a: number, b: number, c: number, d: number) => {
    xs.push(a, c);
    ys.push(b, d);
    line(a, b, c, d);
  };
  p.sleep = async () => {
    if (xs.length) frames.push([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]);
    xs = [];
    ys = [];
  };
  expect(await shoot(g, x1, y1, x2, y2, 1)).toBe(true);
  return frames;
}

/** A view square's middle, in pixels. */
const middle = (x: number, y: number): [number, number] => [x * 16 + 16, y * 16 + 16];

describe('a missile', () => {
  for (const [x2, y2] of [
    [10, 5],
    [5, 0],
    [9, 8],
    [10, 7],
    [6, 10],
    [1, 2],
    [8, 1],
  ])
    it(`ends on the middle of the square it was aimed at, from the middle of the shooter's (to ${x2},${y2})`, async () => {
      const frames = await flight(5, 5, x2, y2);
      const [ex, ey] = middle(x2, y2);
      const [lx, ly] = frames[frames.length - 1];
      expect(Math.hypot(lx - ex, ly - ey), `last frame at ${lx},${ly}, aimed at ${ex},${ey}`).toBeLessThanOrEqual(1);
      // Each frame on the line between the two middles (within the original's integer slope).
      const [sx, sy] = middle(5, 5);
      const len = Math.hypot(ex - sx, ey - sy);
      for (const [fx, fy] of frames) expect(Math.abs((fx - sx) * (ey - sy) - (fy - sy) * (ex - sx)) / len).toBeLessThanOrEqual(1.5);
    });
});
