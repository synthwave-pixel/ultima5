/**
 * font.ts
 *
 * IBM.CH and RUNES.CH: 128 glyphs of 8 by 8 pixels, one byte per row,
 * most significant bit leftmost (u5d GRAP_BUF_PrintChar). IBM.CH holds the
 * frame corners at 0x7b-0x7d and the game's arrows and symbols in 0-31.
 */

export const GLYPH_SIZE = 8;

export interface Font {
  /** 128 glyphs of 8 rows each. */
  rows: Uint8Array;
}

export function readFont(data: Uint8Array): Font {
  if (data.length < 1024) throw new Error('A font file is 1024 bytes');
  return { rows: data.slice(0, 1024) };
}

/** Whether the pixel at (x, y) of glyph `code` is set. */
export function glyphPixel(font: Font, code: number, x: number, y: number): boolean {
  return (font.rows[(code & 0x7f) * 8 + y] & (0x80 >> x)) !== 0;
}
