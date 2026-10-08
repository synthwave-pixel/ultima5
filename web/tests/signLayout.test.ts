import { describe, expect, it } from 'vitest';
import { SIGN_WALL, signLayout } from '../src/ui/signLayout.ts';

/** The letters of a layout as its lines read: letter codes, a space between cells not side by side. */
const lines = (text: string, scale: number): string[] => {
  const { cell, letters } = signLayout(text, 9, 10, scale);
  const rows = new Map<number, typeof letters>();
  for (const l of letters) rows.set(l.y, [...(rows.get(l.y) ?? []), l]);
  return [...rows.values()].map((row) =>
    row.map((l, i) => (i && l.x - row[i - 1].x > cell * 1.5 ? ' ' : '') + String.fromCharCode(l.code)).join(''),
  );
};

describe('a sign laid out on the wall (signLayout)', () => {
  it("is 1988's lines at 1988's size", () => {
    const { cell } = signLayout('BOTTOMLESS\n   PIT    ', 7, 10, 1);
    expect(cell).toBe(8);
    expect(lines('BOTTOMLESS\n   PIT    ', 1)).toEqual(['BOTTOMLESS', 'PIT']);
  });

  it('is larger at a larger scale, words reflowed onto lines that fit', () => {
    const { cell, letters } = signLayout('MO[ER LODE\n   MAZE   ', 9, 10, 1.5);
    expect(cell).toBe(12);
    expect(lines('MO[ER LODE\n   MAZE   ', 1.5)).toEqual(['MO[ER', 'LODE', 'MAZE']);
    for (const l of letters) {
      expect(l.x).toBeGreaterThanOrEqual(SIGN_WALL.x1);
      expect(l.x + cell).toBeLessThanOrEqual(SIGN_WALL.x2);
      expect(l.y).toBeGreaterThanOrEqual(SIGN_WALL.y1);
      expect(l.y + cell).toBeLessThanOrEqual(SIGN_WALL.y2);
    }
  });

  it('shrinks to fit a word wider than the wall, never breaking it', () => {
    const { cell } = signLayout('BOTTOMLESS\n   PIT    ', 7, 10, 2);
    expect(cell).toBeLessThan(16);
    expect(cell * 10).toBeLessThanOrEqual(SIGN_WALL.x2 - SIGN_WALL.x1);
    expect(lines('BOTTOMLESS\n   PIT    ', 2)).toEqual(['BOTTOMLESS', 'PIT']);
  });

  it('has a plate round its letters, kept in from the wall at the sides, and deeper above and below', () => {
    for (const [text, left] of [
      ['BOTTOMLESS\n   PIT    ', 7],
      ['MO[ER LODE\n   MAZE   ', 9],
    ] as const) {
      const { cell, letters, plate } = signLayout(text, left, 10, 1.5);
      expect(plate.x1).toBeGreaterThanOrEqual(SIGN_WALL.x1 + 3);
      expect(plate.x2).toBeLessThanOrEqual(SIGN_WALL.x2 - 3);
      for (const l of letters) {
        expect(l.x).toBeGreaterThan(plate.x1);
        expect(l.x + cell).toBeLessThan(plate.x2);
        expect(l.y - plate.y1).toBeGreaterThanOrEqual(6);
        expect(plate.y2 - (l.y + cell)).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('reads in order: each letter further along than the one before', () => {
    const { letters } = signLayout('MO[ER LODE\n   MAZE   ', 9, 10, 1.5);
    for (let i = 1; i < letters.length; i++) expect(letters[i].along).toBeGreaterThan(letters[i - 1].along);
  });
});
