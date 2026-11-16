import { describe, expect, it } from 'vitest';
import { loadResource, picture } from '../src/data/images.ts';
import { TONED } from '../src/ui/originals.ts';
import { DUNGEON_EGA, OPENING, OUTLINE, restyle, standsOut } from '../src/ui/standardPictures.ts';
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

  it('draws its pixels as square blocks, nothing of its outline rounded (as PC EGA draws them, in the toned colours)', () => {
    const { g } = newGame();
    for (let m = 0; m < 8; m++) {
      const v = picture(loadResource(g.data.files, g.data.ovl, `MON${m}.16`), 0)!;
      const out = restyle(v, 'creature');
      const W = v.width * 2;
      let rounded = 0;
      for (let y = 0; y < v.height; y++)
        for (let x = 0; x < v.width; x++) {
          const o = y * 2 * W + x * 2;
          if (new Set([out[o], out[o + 1], out[o + W], out[o + W + 1]]).size !== 1) rounded++;
        }
      expect(rounded, `MON${m}`).toBe(0);
    }
  });
});

/** The corridor's own colours as the restyled pictures hold them (RGBA in memory order), and its lines' and openings'. */
const PALETTE = new Set([...DUNGEON_EGA, OUTLINE, OPENING].map((c) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16)) >>> 0));

describe('what stands in the corridor, and what is drawn into its walls, sharp', () => {
  it("draws a thing pixel for pixel in the corridor's colours, nothing of it blended with its neighbours", () => {
    const { g } = newGame();
    const res = loadResource(g.data.files, g.data.ovl, 'ITEMS.16');
    for (let i = 0; i < 20; i++) {
      const v = picture(res, i);
      if (!v) continue;
      for (const px of restyle(v, 'thing')) if (px >>> 24) expect(PALETTE.has(px), `thing ${i}: 0x${px.toString(16)}`).toBe(true);
    }
  });

  it("draws a door, its own colours kept, pixel for pixel - the stone round it smoothed in the dungeon's light", () => {
    const { g } = newGame();
    for (const name of ['DNG1.16', 'DNG2.16', 'DNG3.16']) {
      const res = loadResource(g.data.files, g.data.ovl, name);
      const v = picture(res, 0xd)!;
      const wall = { plain: picture(res, 9), stone: picture(res, 9)!, ahead: true };
      const [a, b] = [restyle(v, 'dungeon', 1, wall), restyle(v, 'dungeon', 3, wall)];
      let kept = 0;
      for (let k = 0; k < a.length; k++)
        if (a[k] === b[k] && lit(a[k])) {
          kept++;
          expect(PALETTE.has(a[k]), `${name}: 0x${a[k].toString(16)}`).toBe(true);
        }
      expect(kept).toBeGreaterThan(100);
    }
  });

  it("finds a skeleton in chains whole, and not the specks where its wall's stipple was drawn a little otherwise", () => {
    const { g } = newGame();
    const res = loadResource(g.data.files, g.data.ovl, 'DNG3.16');
    const v = picture(res, 25)!;
    const m = standsOut(v, { plain: picture(res, 9), stone: picture(res, 9)!, ahead: true });
    // Its shapes, joined at their sides and corners: the skeleton, and nothing else.
    const { width: w, height: h } = v;
    const seen = new Uint8Array(w * h);
    const sizes: number[] = [];
    for (let s = 0; s < w * h; s++) {
      if (!m[s] || seen[s]) continue;
      let n = 0;
      const stack = [s];
      seen[s] = 1;
      while (stack.length) {
        const k = stack.pop()!;
        n++;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const [x, y] = [(k % w) + dx, Math.floor(k / w) + dy];
            if (x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] && !seen[y * w + x]) {
              seen[y * w + x] = 1;
              stack.push(y * w + x);
            }
          }
      }
      sizes.push(n);
    }
    expect(sizes.length).toBe(1);
    expect(sizes[0]).toBeGreaterThan(900);
  });

  it('smooths the stone beside a skeleton or a fall of rock without its colours: no halo round them', () => {
    const { g } = newGame();
    const res = loadResource(g.data.files, g.data.ovl, 'DNG3.16');
    const luma = (v: number): number => (v & 0xff) + ((v >> 8) & 0xff) + ((v >> 16) & 0xff);
    // The brightest stone any of the dungeon's plain walls has, smoothed: no stone beside the bones is lighter.
    const brightest = Math.max(
      ...[0, 1, 9, 10].flatMap((p) =>
        Array.from(restyle(picture(res, p)!, 'dungeon', 1))
          .filter((x) => x >>> 24)
          .map(luma),
      ),
    );
    for (const [i, twin] of [
      [25, 9],
      [26, 10],
      [20, 0],
      [21, 1],
    ]) {
      const wall = { plain: picture(res, twin), stone: picture(res, 9)!, ahead: (i & 0xf8) === 8 || i >= 24 };
      const v = picture(res, i)!;
      const [a, b] = [restyle(v, 'dungeon', 1, wall), restyle(v, 'dungeon', 3, wall)];
      let halo = 0;
      for (let k = 0; k < a.length; k++) if (a[k] >>> 24 && a[k] !== b[k] && luma(a[k]) > brightest) halo++;
      expect(halo, `DNG3 piece ${i}`).toBe(0);
    }
  });
});

describe("a skeleton in chains, the wall's pixels only recoloured", () => {
  it("takes the dungeon's light on the stone's greys round it and between its bones, its bones and lines their own", () => {
    const { g } = newGame();
    const res = loadResource(g.data.files, g.data.ovl, 'DNG3.16');
    const v = picture(res, 25)!;
    const wall = { plain: picture(res, 9), stone: picture(res, 9)!, ahead: true };
    const [a, b] = [restyle(v, 'dungeon', 1, wall), restyle(v, 'dungeon', 3, wall)];
    const own = standsOut(v, wall);
    let greys = 0;
    let bones = 0;
    for (let y = 0; y < v.height; y++)
      for (let x = 0; x < v.width; x++) {
        if (!own[y * v.width + x]) continue;
        const byte = v.pixels[y * v.stride + (x >> 1)];
        const c = x & 1 ? byte & 15 : byte >> 4;
        const k = y * 2 * v.width * 2 + x * 2;
        if (c === 7 || c === 8) {
          greys++;
          expect(a[k], `grey at ${x},${y}`).not.toBe(b[k]);
        } else if (c === 15 && own[y * v.width + x] === 1) {
          bones++;
          expect(a[k], `bone at ${x},${y}`).toBe(b[k]);
        }
      }
    expect(greys).toBeGreaterThan(10);
    expect(bones).toBeGreaterThan(100);
  });
});

describe("what is drawn into a wall, the wall's pixels only recoloured", () => {
  it('leaves the wall round it as the plain wall has it: when it goes, only it changes', () => {
    const { g } = newGame();
    const res = loadResource(g.data.files, g.data.ovl, 'DNG3.16');
    for (const [i, twin] of [
      [25, 9],
      [26, 10],
      [20, 0],
      [21, 1],
    ]) {
      const v = picture(res, i)!;
      const p = picture(res, twin)!;
      const wall = { plain: p, stone: picture(res, 9)!, ahead: true };
      const own = standsOut(v, wall);
      const [a, b] = [restyle(v, 'dungeon', 1, wall), restyle(p, 'dungeon', 1)];
      let changed = 0;
      for (let y = 0; y < v.height * 2; y++)
        for (let x = 0; x < v.width * 2; x++)
          if (!own[(y >> 1) * v.width + (x >> 1)] && a[y * v.width * 2 + x] !== b[y * v.width * 2 + x]) changed++;
      expect(changed, `DNG3 piece ${i}`).toBe(0);
    }
  });

  it('keeps all of a door, found by its colours - the carved head above it too, not the plain wall there', () => {
    const { g } = newGame();
    const res = loadResource(g.data.files, g.data.ovl, 'DNG3.16');
    const [v, p] = [picture(res, 0xd)!, picture(res, 9)!];
    const [a, b] = [restyle(v, 'dungeon', 1, { plain: p, stone: p, ahead: true }), restyle(p, 'dungeon', 1)];
    const own = standsOut(v, { plain: p, stone: p, ahead: true });
    let beyond = 0;
    for (let k = 0; k < a.length; k++) {
      const [x, y] = [(k % (v.width * 2)) >> 1, Math.floor(k / (v.width * 2)) >> 1];
      if (!own[y * v.width + x] && a[k] !== b[k]) beyond++;
    }
    expect(beyond).toBeGreaterThan(20);
  });
});

describe("Hythloth's walls", () => {
  it("keep the corridor's own colours, its red rock, no light laid on them", () => {
    const { g } = newGame();
    const res = loadResource(g.data.files, g.data.ovl, 'DNG2.16');
    const v = picture(res, 9)!;
    const out = restyle(v, 'dungeon', 7);
    const own = new Set(DUNGEON_EGA.map((c) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16)) >>> 0));
    for (const px of out) if (px >>> 24) expect(own.has(px), `0x${px.toString(16)}`).toBe(true);
    expect(out.some((px) => px === (0xff000000 | (0x2a << 16) | (0x3a << 8) | 0x8c) >>> 0)).toBe(true); // the rock's red
  });
});
