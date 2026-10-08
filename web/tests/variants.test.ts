import { describe, expect, it } from 'vitest';
import { variantOf } from '../src/ui/standardArt.ts';

/** A tile drawn in several versions (the hill's six layouts), one to a square by its place (standardArt.ts). */
describe("a square's version of its tile", () => {
  it('is always the same for the same square', () => {
    for (const [x, y] of [
      [0, 0],
      [17, 203],
      [255, 255],
    ])
      expect(variantOf(x, y, 6)).toBe(variantOf(x, y, 6));
  });

  it('uses every version, about evenly, over a stretch of country', () => {
    const count = [0, 0, 0, 0, 0, 0];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) count[variantOf(x, y, 6)]++;
    for (const n of count) expect(n).toBeGreaterThan((32 * 32) / 6 / 2);
  });

  it('makes no pattern: no row repeats the one above it, shifted or not, and no row repeats itself', () => {
    const row = (y: number): number[] => Array.from({ length: 24 }, (_, x) => variantOf(x + 40, y, 6));
    for (let y = 40; y < 48; y++) {
      const [a, b] = [row(y), row(y + 1)];
      for (let shift = 0; shift < 6; shift++) expect(a.slice(shift).join()).not.toBe(b.slice(0, 24 - shift).join());
      for (let period = 1; period <= 6; period++) expect(a.slice(period).join()).not.toBe(a.slice(0, 24 - period).join());
    }
  });
});
