import { describe, expect, it } from 'vitest';
import { CELL, OUTLINE_COLOUR, SHEET_COLUMNS, StandardArt } from '../src/ui/standardArt.ts';

/**
 * The outlines round the figures, and none round the furniture another game draws in cells past the actors'
 * (StandardArt.furniture: Ultima IV's own things, the hull's pieces and the plates, in cells from 640).
 */
describe('the furniture past the actors', () => {
  // A sheet of 21 rows: Ultima V's 512 actors and tiles and the extra frames' 128, then one row of cells of its own.
  const rows = 21;
  const width = SHEET_COLUMNS * CELL;
  const sheet = new Uint32Array(width * rows * CELL);
  /** A square block, opaque, in the middle of cell `c`: something drawn with clear round it. */
  const block = (c: number): void => {
    const [cx, cy] = [(c % SHEET_COLUMNS) * CELL, Math.floor(c / SHEET_COLUMNS) * CELL];
    for (let y = 24; y < 40; y++) sheet.fill(0xff3060a0, (cy + y) * width + cx + 24, (cy + y) * width + cx + 40);
  };
  block(0x150);
  block(640);
  block(641);
  const art = new StandardArt(sheet, width, {});
  art.outlined = true;
  const outlined = (t: number): boolean => art.figure(t).includes(OUTLINE_COLOUR);

  it('outlines an actor and a cell past the actors by default', () => {
    expect(outlined(0x150)).toBe(true);
    expect(outlined(640)).toBe(true);
  });

  it('outlines none of the furniture, and still every figure', () => {
    art.furniture.add(640);
    expect(outlined(640)).toBe(false);
    expect(outlined(641)).toBe(true);
    expect(outlined(0x150)).toBe(true);
  });
});
