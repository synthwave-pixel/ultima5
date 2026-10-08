import { describe, expect, it } from 'vitest';
import { groundAmong } from '../src/game/world';

/**
 * The ground under a thing that stands (world.ts groundAmong), for the Standard look that draws a tree or a chair on
 * a clear ground: the towne's view and the title's little scenes both ask it of their squares.
 */
describe('the ground under a thing', () => {
  const grid = (rows: number[][]) => (dx: number, dy: number) => rows[1 + dy]?.[1 + dx];

  it('is the ground most of the squares round it show, those beside it counting twice those at its corners', () => {
    // Floor (0x44) beside it twice, grass (0x05) at three corners: the floor, 4 votes to 3.
    const at = grid([
      [0x05, 0x44, 0x05],
      [0x4f, 0x0a, 0x44],
      [0x05, 0x4f, 0x4f],
    ]);
    expect(groundAmong(0x0a, at, 0x05)).toBe(0x44);
  });

  it('takes brush as the grass it grows in, gives a mouth in the mountains the mountains, and falls back when none is ground', () => {
    expect(
      groundAmong(
        0x0a,
        grid([
          [0x06, 0x06, 0x06],
          [0x06, 0x0a, 0x06],
          [0x06, 0x06, 0x06],
        ]),
        0x44,
      ),
    ).toBe(0x05);
    expect(
      groundAmong(
        0x16,
        grid([
          [0x05, 0x05, 0x05],
          [0x05, 0x16, 0x05],
          [0x05, 0x05, 0x05],
        ]),
        0x44,
      ),
    ).toBe(0x0c);
    expect(groundAmong(0x0a, () => undefined, 0x44)).toBe(0x44);
  });
});
