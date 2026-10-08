import { describe, expect, it } from 'vitest';
import { nearestMark, stepTo, wrapped, type Mark } from '../src/ui/mapMarks.ts';

const mark = (x: number, y: number): Mark => ({ x, y, kind: 'towne', onPaper: true });

/** The map opens on the place nearest the party, so one is always marked. */
describe('the place nearest the party', () => {
  it('picks the closest', () => {
    expect(nearestMark([mark(10, 10), mark(60, 60), mark(100, 20)], 55, 58, 256)).toBe(1);
  });

  it('measures across the edge of the world, which wraps', () => {
    expect(nearestMark([mark(128, 128), mark(2, 250)], 252, 4, 256)).toBe(1);
  });

  it('has none to pick when no place is known', () => {
    expect(nearestMark([], 5, 5, 256)).toBe(-1);
  });
});

/** The d-pad steps between the marks, the world wrapping at its edges. */
describe('the next place along', () => {
  it('steps round the edge of the world, which wraps, to the nearer place that way', () => {
    const marks = [mark(4, 100), mark(250, 100), mark(60, 100)];
    expect(stepTo(marks, 0, -1, 0, 256)).toBe(1); // west, round the edge
    expect(stepTo(marks, 1, 1, 0, 256)).toBe(0); // and east, back again
    expect(stepTo(marks, 0, -1, 0)).toBe(0); // on a map that does not wrap, nothing west of the first
  });

  it('measures the shorter way round', () => {
    expect([wrapped(250 - 4, 256), wrapped(4 - 250, 256), wrapped(10, 256)]).toEqual([-10, 10, 10]);
  });
});
