import { describe, expect, it } from 'vitest';
import { loadResource, picture } from '../src/data/images.ts';
import { TONED } from '../src/ui/originals.ts';
import { restyle } from '../src/ui/standardPictures.ts';
import { newGame } from './helpers.ts';

/** Lit stone or wood, not the dark of a drawn line or an opening, which no light changes. */
const lit = (v: number): boolean => v >>> 24 !== 0 && (v & 0xff) + ((v >> 8) & 0xff) + ((v >> 16) & 0xff) > 150;

/** Of a wall's picture under two dungeons' light: the pixels the light changed (wall), and the lit ones it did not (what is in the wall). */
function parts(name: string, i: number, twin: number): { wall: number; kept: number; all: number } {
  const { g } = newGame();
  const res = loadResource(g.data.files, g.data.ovl, name);
  const v = picture(res, i)!;
  const wall = { plain: picture(res, twin), stone: picture(res, 9)!, ahead: (i & 0xf8) === 8 };
  const a = restyle(v, 'dungeon', 1, wall);
  const b = restyle(v, 'dungeon', 3, wall);
  const out = { wall: 0, kept: 0, all: a.length };
  for (let k = 0; k < a.length; k++) {
    if (a[k] !== b[k]) out.wall++;
    else if (lit(a[k])) out.kept++;
  }
  return out;
}

describe('what is drawn into a wall', () => {
  it('a door keeps its colours in every dungeon, the wall round it does not', () => {
    for (const name of ['DNG1.16', 'DNG2.16', 'DNG3.16']) {
      const { wall, kept, all } = parts(name, 0xd, 9);
      expect(kept / all).toBeGreaterThan(0.05);
      expect(wall / all).toBeGreaterThan(0.3);
    }
  });

  it('a bare wall is all wall', () => {
    const { g } = newGame();
    const res = loadResource(g.data.files, g.data.ovl, 'DNG3.16');
    const v = picture(res, 9)!;
    const a = restyle(v, 'dungeon', 1);
    const b = restyle(v, 'dungeon', 3);
    let same = 0;
    for (let k = 0; k < a.length; k++) if (lit(a[k]) && a[k] === b[k]) same++;
    expect(same).toBeLessThan(a.length / 100);
  });
});

describe("a wall picture's corners", () => {
  it('take no white from beyond the picture (the edge smoothing once read the edge as a colour)', () => {
    const { g } = newGame();
    for (const name of ['DNG1.16', 'DNG2.16', 'DNG3.16']) {
      const res = loadResource(g.data.files, g.data.ovl, name);
      for (let i = 0; i < 64; i++) {
        const v = picture(res, i);
        if (!v) break;
        const out = restyle(v, 'dungeon', 1);
        const W = v.width * 2;
        const at = (x: number, y: number): number => {
          const b = v.pixels[y * v.stride + (x >> 1)];
          return x & 1 ? b & 15 : b >> 4;
        };
        const corners: [number, number, number][] = [
          [0, 0, out[0]],
          [v.width - 1, 0, out[W - 1]],
          [0, v.height - 1, out[(v.height * 2 - 1) * W]],
          [v.width - 1, v.height - 1, out[v.height * 2 * W - 1]],
        ];
        for (const [x, y, px] of corners) if (at(x, y) !== 15) expect(px >>> 0).not.toBe(0xffffffff);
      }
    }
  });
});

describe('a wandering creature in the corridor (MON0-7.16)', () => {
  it('keeps its own pixels, in Modern PC’s toned colours and the drawn lines’ dark, see-through where its mask is', () => {
    const { g } = newGame();
    const abgr = (rgb: number): number => (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16)) >>> 0;
    // The toned colours, a drawn line's dark and an opening's black (standardPictures.ts), and clear.
    const allowed = new Set([...TONED, 0x20140c, 0x000000].map(abgr).concat(0));
    for (let m = 0; m < 8; m++) {
      const v = picture(loadResource(g.data.files, g.data.ovl, `MON${m}.16`), 0)!;
      const out = restyle(v, 'creature');
      expect(
        [...new Set(out)].filter((p) => !allowed.has(p)),
        `MON${m}`,
      ).toEqual([]);
      // Clear round it, and the toned colours in it, not blended ones: the dithers kept.
      expect(out.some((p) => p === 0)).toBe(true);
      expect(new Set(out).size).toBeGreaterThan(3);
    }
  });
});
