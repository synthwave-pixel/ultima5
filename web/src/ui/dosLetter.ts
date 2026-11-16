/**
 * dosLetter.ts
 *
 * A dungeon sign's English in the DOS font (Appearance > Font: DOS), as its runes give way to it: the game's own 8x8
 * letters (IBM.CH) at the sign's size, each pixel of them a square of the sign's dots - three a side at its usual 24 -
 * the way the other fonts set it in the sign's cell. A rune that stands for two letters (TH, EE, NG, EA, ST) has both,
 * side by side, each half the cell wide.
 */

import { glyphPixel, type Font } from '../data/font.ts';

/** `text` (a letter, or a rune's two) in `font`'s 8x8 letters, a mask `side` a side. */
export function dosLetterMask(font: Font, text: string, side: number): Uint8Array {
  const out = new Uint8Array(side * side);
  const letters = [...text];
  const each = side / letters.length;
  letters.forEach((ch, n) => {
    const code = ch.charCodeAt(0);
    const x0 = Math.round(n * each);
    const w = Math.round((n + 1) * each) - x0;
    for (let y = 0; y < side; y++)
      for (let x = 0; x < w; x++)
        if (glyphPixel(font, code, Math.floor((x * 8) / w), Math.floor((y * 8) / side))) out[y * side + x0 + x] = 1;
  });
  return out;
}
