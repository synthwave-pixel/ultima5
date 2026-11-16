import { describe, expect, it } from 'vitest';
import { evenStrokes } from '../src/ui/runeStrokes.ts';

/** A mask `n` a side with the rectangles given set (x, y, w, h). */
function drawn(n: number, ...rects: [number, number, number, number][]): Uint8Array {
  const m = new Uint8Array(n * n);
  for (const [x, y, w, h] of rects) for (let r = y; r < y + h; r++) m.fill(1, r * n + x, r * n + x + w);
  return m;
}

/** How many dots wide each row of `m` (`n` a side) is set, where it is set at all. */
const widths = (m: Uint8Array, n: number): number[] =>
  Array.from({ length: n }, (_, y) => m.subarray(y * n, y * n + n).reduce((a, b) => a + b, 0)).filter((w) => w > 0);

describe('a rune drawn in even strokes (the dungeon sign, 2026-11-16)', () => {
  it('draws a stroke of any weight two dots wide, at the size asked for', () => {
    // A heavy upright bar, a fifth of the letter wide, in a letter four times the size asked for.
    const m = evenStrokes(drawn(96, [38, 8, 20, 80]), 96, 24);
    expect(m.length).toBe(24 * 24);
    for (const w of widths(m, 24)) expect(w).toBe(2);
  });

  it('keeps its strokes apart: two bars, however heavy, stay two strokes with a gap between', () => {
    const m = evenStrokes(drawn(96, [10, 8, 24, 80], [60, 8, 24, 80]), 96, 24);
    const mid = m.subarray(12 * 24, 13 * 24);
    const runs = [...mid]
      .join('')
      .split(/0+/)
      .filter((r) => r.length);
    expect(runs.map((r) => r.length)).toEqual([2, 2]);
  });

  it('draws nothing for nothing', () => {
    expect(evenStrokes(new Uint8Array(96 * 96), 96, 24).every((v) => v === 0)).toBe(true);
  });
});
