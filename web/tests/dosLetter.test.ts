import { describe, expect, it } from 'vitest';
import { glyphPixel, readFont } from '../src/data/font.ts';
import { dosLetterMask } from '../src/ui/dosLetter.ts';
import { gameFiles } from './helpers.ts';

/** A sign's English in the DOS font (Appearance > Font: DOS): the game's own 8x8 letters at the sign's size. */
describe("a sign's English in the DOS font", () => {
  const ibm = readFont(gameFiles().get('IBM.CH'));

  it('draws a letter as the game does, each of its pixels three dots a side at the sign size of 24', () => {
    const m = dosLetterMask(ibm, 'A', 24);
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 24; x++)
        expect(m[y * 24 + x], `${x},${y}`).toBe(glyphPixel(ibm, 0x41, Math.floor(x / 3), Math.floor(y / 3)) ? 1 : 0);
  });

  it("sets a rune's two letters (TH, EE...) side by side in its one cell, each half of it", () => {
    const m = dosLetterMask(ibm, 'TH', 24);
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 24; x++) {
        const [code, gx] = x < 12 ? [0x54, Math.floor((x * 8) / 12)] : [0x48, Math.floor(((x - 12) * 8) / 12)];
        expect(m[y * 24 + x], `${x},${y}`).toBe(glyphPixel(ibm, code, gx, Math.floor(y / 3)) ? 1 : 0);
      }
  });
});
