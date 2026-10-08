import { describe, expect, it } from 'vitest';
import { EGA_RGBA, Framebuffer, HI, HI_WIDTH, type TileArt } from '../src/ui/framebuffer';

/** A tile set with lettering of its own: every letter a solid left half. */
function lettered(): TileArt {
  const half = new Uint8Array(256);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) half[y * 16 + x] = 1;
  return { draw: () => {}, block: () => {}, glyph: (code) => (code >= 0x20 && code <= 0x7a ? half : null) };
}

const page = (fb: Framebuffer): Uint32Array => (fb as unknown as { hx: Uint32Array }).hx;
const ega = (fb: Framebuffer): Uint8Array => (fb as unknown as { pages: Uint8Array[] }).pages[0];

describe("a tile set's own lettering", () => {
  const fonts = [{ rows: new Uint8Array(128 * 8).fill(0xff) }, { rows: new Uint8Array(128 * 8).fill(0xff) }];

  it('is drawn on the colour page, in the colours asked for, and leaves the EGA page the game font', () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    fb.art = lettered();
    fb.glyph(0, 0x41, 2, 3, 15, 1);
    const at = (x: number, y: number): number => page(fb)[(3 * 8 * HI + y) * HI_WIDTH + 2 * 8 * HI + x];
    expect(at(0, 0)).toBe(EGA_RGBA[15]);
    expect(at(4 * HI - 1, 8 * HI - 1)).toBe(EGA_RGBA[15]);
    expect(at(4 * HI, 0)).toBe(EGA_RGBA[1]);
    expect(ega(fb)[3 * 8 * 320 + 2 * 8 + 7]).toBe(15); // the EGA page: the game's own glyph, all ink here
  });

  it('leaves the runes and the frame corners to the game', () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    fb.art = lettered();
    fb.glyph(1, 0x41, 0, 0, 15, 1);
    fb.glyph(0, 0x7c, 1, 0, 15, 1);
    expect(page(fb)[8 * HI - 1]).toBe(EGA_RGBA[15]);
    expect(page(fb)[16 * HI - 1]).toBe(EGA_RGBA[15]);
  });
});
