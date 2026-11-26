import { describe, expect, it } from 'vitest';
import type { Picture } from '../src/data/images.ts';
import type { Tiles } from '../src/game/settings.ts';
import { EGA_RGBA, Framebuffer, HI, HI_WIDTH, type ImageOver } from '../src/ui/framebuffer.ts';
import { TONED } from '../src/ui/originals.ts';
import { doubled, type PictureKind, restyle, toned } from '../src/ui/standardPictures.ts';

/**
 * A scene (fx.image's 'scene', for a game that asks for it): in the Standard look with Remastered's set, its own pixels
 * in Remastered's toned colours, each a square block of the colour page; in any other look, or before the Standard art
 * is made, as the game drew it. A picture drawn with no style is as ever.
 */

const abgr = (rgb: number): number => (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16)) >>> 0;

/** A picture 16 by 3 of every colour across, its middle row's first four pixels see-through. */
function sixteen(): Picture {
  const [w, h] = [16, 3];
  const stride = 8;
  const pixels = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pixels[y * stride + (x >> 1)] |= ((x + y) & 15) << (x & 1 ? 0 : 4);
  const bits = new Uint8Array(2 * h);
  bits[2] = 0xf0;
  return { width: w, height: h, pixels, stride, mask: { width: w, height: h, bits, stride: 2 } };
}

/** The colour picture `p`'s pixel (x, y) is drawn in on a page drawn at (X, Y), and the block of it is all one colour. */
function at(fb: Framebuffer, X: number, Y: number, x: number, y: number): number {
  const o = (Y + y) * HI * HI_WIDTH + (X + x) * HI;
  const v = fb.hi[0][o];
  for (let r = 0; r < HI; r++) for (let k = 0; k < HI; k++) expect(fb.hi[0][o + r * HI_WIDTH + k]).toBe(v);
  return v;
}

/** How Screen.styled draws picture `v` in `look` with set `tiles`, the Standard art made (`art`) or not. */
async function styledIn(look: 'standard' | 'original', tiles: Tiles, art: boolean, v: Picture, style?: PictureKind) {
  const { Screen } = await import('../src/ui/screen.ts');
  const screen = Object.create(Screen.prototype) as InstanceType<typeof Screen>;
  Object.assign(screen, { look, tiles, standard: art ? {} : null, restyled: new WeakMap(), scenes: new WeakMap() });
  const styled = (screen as unknown as { styled: (res: Uint8Array, i: number, v: Picture, s?: PictureKind) => ImageOver | undefined })
    .styled;
  return styled.call(screen, new Uint8Array(4), 0, v, style);
}

function drawn(v: Picture, over: ImageOver | undefined, flags = 0): Framebuffer {
  const fb = new Framebuffer(new Uint8Array(1024 * 128), [{ rows: new Uint8Array(128 * 8) }, { rows: new Uint8Array(128 * 8) }]);
  fb.hi[0].fill(0xff123456);
  fb.image(v, 10, 20, flags, over);
  return fb;
}

const colour = (x: number, y: number): number => (x + y) & 15;
const clear = (x: number, y: number): boolean => y === 1 && x < 4;

describe("a scene in Remastered's toned colours", () => {
  it('in the Standard look with Remastered’s set, every pixel is its toned colour, block for block', async () => {
    const v = sixteen();
    const fb = drawn(v, await styledIn('standard', 'modern-pc', true, v, 'scene'));
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 16; x++) expect(at(fb, 10, 20, x, y)).toBe(clear(x, y) ? 0xff123456 : abgr(TONED[colour(x, y)]));
    // The EGA page keeps the game's own colours, as ever.
    expect(fb.pages[0][20 * 320 + 10 + 5]).toBe(5);
  });

  it('turned about as the picture is', async () => {
    const v = sixteen();
    const fb = drawn(v, await styledIn('standard', 'modern-pc', true, v, 'scene'), 2);
    const plain = drawn(v, undefined, 2);
    for (let y = 0; y < 3; y++)
      for (let x = -1; x < 16; x++) {
        const e = plain.hi[0][(20 + y) * HI * HI_WIDTH + (10 + x) * HI];
        const want = e === 0xff123456 ? e : abgr(TONED[EGA_RGBA.indexOf(e)]);
        expect(at(fb, 10, 20, x, y)).toBe(want);
      }
  });

  it('in the PC look, in another set, or before the Standard art is made, the EGA’s own colours', async () => {
    const v = sixteen();
    for (const [look, tiles, art] of [
      ['original', 'modern-pc', true],
      ['original', 'pc-ega', true],
      ['standard', 'pc-ega', true],
      ['standard', 'x68k', true],
      ['standard', 'modern-pc', false],
    ] as const) {
      const over = await styledIn(look, tiles, art, v, 'scene');
      expect(over).toBeUndefined();
      const fb = drawn(v, over);
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 16; x++) expect(at(fb, 10, 20, x, y)).toBe(clear(x, y) ? 0xff123456 : EGA_RGBA[colour(x, y)]);
    }
  });

  it('a picture drawn with no style is as ever in the Standard look', async () => {
    const v = sixteen();
    expect(await styledIn('standard', 'modern-pc', true, v)).toBeUndefined();
  });

  it('restyled as a scene, a picture is its toned pixels, each a square of four', () => {
    const v = sixteen();
    expect(restyle(v, 'scene')).toEqual(doubled(toned(v), 16, 3));
  });
});
