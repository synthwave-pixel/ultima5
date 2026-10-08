/**
 * standardPictures.ts
 *
 * The Standard look of the game's own pictures, made at run time from the
 * player's copy, as the tile art is the port's own: the sixteen EGA
 * colours shown as the Standard set's, the EGA dithers blended to the
 * colour they stood for, and the result drawn at the colour page's size by
 * EPX, which follows a diagonal rather than squaring it off. Nothing of
 * the game is kept or shipped; this is only how it is shown.
 *
 * The corridor's walls and things (DNG1-3.16, ITEMS.16), where the
 * stipple is smoothed flat and black is either a drawn line or an opening;
 * and its wandering creatures (MON0-7.16), their pixels kept in Modern PC's
 * toned colours.
 * Everything else - the title, the introduction, the gypsy's cards, the
 * ending - is shown in both looks as the game drew it: its own pixels in its
 * own colours (screen.ts).
 */

import type { Picture } from '../data/images.ts';
import { DUNGEON_TINTS, tinted } from './colours.ts';
import { TONED } from './originals.ts';

/** A line drawn in black, and the black of an opening (the corridor's). */
const OUTLINE = 0x20140c;
const OPENING = 0x000000;

/**
 * The corridor's own colours. The three sets of walls are each their own
 * place - DNG1's earth, DNG2's red rock, DNG3's grey stone - and the EGA
 * gives each a handful of colours to say so. Standard keeps what each
 * one is and takes the shrillness out of it: the orange earth becomes
 * warm stone, the fire-red rock an old oxide, the greys a quieter stone.
 */
const DUNGEON_EGA = [
  0x000000, // black: the dark beyond, or a drawn line
  0x2b3a63, // blue
  0x2f6b34, // green
  0x2f7f86, // cyan
  0x8c3a2a, // red: DNG2's rock
  0x7a3a72, // magenta
  0x7d5f3d, // brown: DNG1's earth
  0x9a9488, // light grey: DNG3's stone
  0x4e4c47, // dark grey: its shadow
  0x5a6cff,
  0x4ff04f,
  0x5cf0f4,
  0xc96a58, // bright red
  0xff5cf0,
  0xe8c95e, // yellow: a torch, a chest's gold
  0xdedacd, // white
];

const abgr = (rgb: number): number => (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16)) >>> 0;
const rgbOf = (e: number, shade: (i: number) => number): [number, number, number] => {
  const v = shade(e);
  return [v >> 16, (v >> 8) & 0xff, v & 0xff];
};
const pack = ([r, g, b]: [number, number, number]): number => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);

/** The corridor's walls, what stands in it, and its wandering creature (MON0-7.16). */
export type PictureKind = 'dungeon' | 'thing' | 'creature';

/**
 * A picture in the Standard look, at twice its size (RGBA in memory order,
 * 2*width by 2*height), and see-through where its mask is. `tint` is the
 * dungeon whose walls these are (DUNGEON_TINTS); what stands in a corridor
 * keeps its own colours and is drawn as a 'thing'.
 */
/** A picture's pixels as EGA colours, -1 where it is see-through or off its edge. */
function colours(v: Picture): (x: number, y: number) => number {
  return (x, y) => {
    if (x < 0 || y < 0 || x >= v.width || y >= v.height) return -1;
    if (v.mask && (v.mask.bits[y * v.mask.stride + (x >> 3)] & (0x80 >> (x & 7))) !== 0) return -1;
    const b = v.pixels[y * v.stride + (x >> 1)];
    return x & 1 ? b & 15 : b >> 4;
  };
}

/**
 * What a wall's picture has in it besides wall. A door, an archway, a
 * fall of rock, a skeleton in chains are drawn into the wall's own
 * picture, so they cannot be told from it as a ladder or a chest can,
 * which are pictures of their own. They are found instead: by where the
 * picture differs from the same wall drawn plain (`plain`), and by the
 * colours the plain stone never uses (`stone` is any plain wall of the
 * set). `ahead` says the picture is the left half of a wall faced
 * head on, whose right edge is the middle of whatever is in it.
 */
export interface WallOf {
  plain: Picture | null;
  stone: Picture;
  ahead: boolean;
}

function standsOut(v: Picture, wall: WallOf): Uint8Array {
  const { width: w, height: h } = v;
  const mine = colours(v);
  // The colours of the stone: those that make up more than a fiftieth of a plain wall.
  const count = new Array<number>(16).fill(0);
  const stone = colours(wall.stone);
  for (let y = 0; y < wall.stone.height; y++) for (let x = 0; x < wall.stone.width; x++) if (stone(x, y) >= 0) count[stone(x, y)]++;
  const total = count.reduce((a, b) => a + b, 0);
  const ofStone = count.map((n) => n > total / 50);
  // Where this wall differs from the plain one; all of it, if there is no plain one of its shape.
  const plain = wall.plain && wall.plain.width === w && wall.plain.height === h ? colours(wall.plain) : null;
  const differs = new Uint8Array(w * h);
  const seed = new Uint8Array(w * h);
  let seeds = 0;
  let differing = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = mine(x, y);
      if (c < 0) continue;
      if (!plain || plain(x, y) !== c) {
        differs[y * w + x] = 1;
        differing++;
        if (!ofStone[c]) {
          seed[y * w + x] = 1;
          seeds++;
        }
      }
    }
  }
  const out = new Uint8Array(w * h);
  if (differing === 0) return out;
  if (plain && seeds * 20 < differing) {
    // Nothing in it of a colour of its own (a fall of the same rock, a skeleton as white as the wall): what differs,
    // less the stray pixels where the stone itself was drawn a little otherwise, and closed up into whole shapes.
    const has = (m: Uint8Array, x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]);
    const pass = (m: Uint8Array, rad: number, need: (n: number, all: number) => boolean): Uint8Array => {
      const o = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let n = 0;
          for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) n += has(m, x + dx, y + dy);
          if (need(n, (rad * 2 + 1) ** 2)) o[y * w + x] = 1;
        }
      }
      return o;
    };
    const solid = pass(differs, 1, (n) => n >= 5);
    const grown = pass(solid, 1, (n) => n > 0);
    const closed = pass(grown, 1, (n, all) => n === all);
    for (let i = 0; i < w * h; i++) out[i] = closed[i] | (solid[i] & differs[i]);
    return out;
  }
  // Otherwise its own colours, and whatever lies between them on a row (the planks between a door's posts, the dark
  // of an archway) - on to the right edge, for a wall faced head on.
  for (let y = 0; y < h; y++) {
    let from = w;
    let to = -1;
    for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) {
      for (let x = 0; x < w; x++) {
        if (!seed[yy * w + x]) continue;
        from = Math.min(from, x);
        to = Math.max(to, x);
      }
    }
    if (to < 0) continue;
    if (wall.ahead) to = w - 1;
    // Between them, what differs from the plain wall and what lies against it: a plank that happens to fall on a
    // pixel of the same brown in the bare wall is still a plank, but the floor running under an archway is floor.
    for (let x = from; x <= to; x++) {
      let near = plain ? 0 : 1;
      for (let dy = -4; dy <= 4 && !near; dy++) {
        for (let dx = -4; dx <= 4; dx++)
          if (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h && differs[(y + dy) * w + x + dx]) near = 1;
      }
      if (near) out[y * w + x] = 1;
    }
  }
  return out;
}

export function restyle(v: Picture, kind: PictureKind, tint = 0, wall?: WallOf): Uint32Array {
  const { width: w, height: h } = v;
  const e = new Uint8Array(w * h);
  const clear = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const b = v.pixels[y * v.stride + (x >> 1)];
      e[y * w + x] = x & 1 ? b & 15 : b >> 4;
      if (v.mask && (v.mask.bits[y * v.mask.stride + (x >> 3)] & (0x80 >> (x & 7))) !== 0) clear[y * w + x] = 1;
    }
  }
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? -1 : e[y * w + x]);
  // The corridor has a palette of its own; the walls take their dungeon's light, and what stands in
  // them keeps its colours. How far off a thing stands is said by its size, as 1988's pictures say it.
  const shade = (i: number): number => (kind === 'dungeon' ? tinted(DUNGEON_EGA[i], DUNGEON_TINTS[tint] ?? 0xffffff) : DUNGEON_EGA[i]);
  // A door or a fall of rock drawn into a wall keeps its colours, as a ladder or a chest does.
  const own = kind === 'dungeon' && wall ? standsOut(v, wall) : null;
  const shadeAt = (i: number, p: number): number => (own?.[p] ? DUNGEON_EGA[i] : shade(i));
  // What each black pixel is: a lone dot of texture (0), a drawn line (1), or an opening (2).
  const black = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (e[y * w + x] !== 0) continue;
      let near = 0;
      let side = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dy) && at(x + dx, y + dy) === 0) {
            near++;
            if (!dx || !dy) side++;
          }
        }
      }
      black[y * w + x] = near === 0 ? 0 : side >= 3 && near >= 6 ? 2 : 1;
    }
  }
  const flat = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      const lone = c === 0 && black[y * w + x] === 0;
      if (c === 0 && !lone) {
        flat[y * w + x] = black[y * w + x] === 2 ? OPENING : OUTLINE;
        continue;
      }
      // A creature keeps its pixels, in Modern PC's toned colours, as the figures on the map are: its dithers are
      // its fur and scales, not a wall's stipple.
      if (kind === 'creature') {
        flat[y * w + x] = TONED[c];
        continue;
      }
      // The walls' stipple smoothed flat: a weighted average of the pixels round it.
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k2 = at(x + dx, y + dy);
          if (k2 < 0 || (k2 === 0 && black[(y + dy) * w + x + dx] !== 0)) continue;
          const weight = dx === 0 && dy === 0 ? 4 : !dx || !dy ? 2 : 1;
          const [cr, cg, cb] = rgbOf(k2, (e2) => shadeAt(e2, (y + dy) * w + x + dx));
          r += cr * weight;
          g += cg * weight;
          b += cb * weight;
          n += weight;
        }
      }
      flat[y * w + x] = pack([r / n, g / n, b / n]);
    }
  }
  // EPX: each pixel becomes four, a corner taking its neighbours' colour where two of them agree and the
  // diagonal does not, so a stair-step reads as a slope.
  const out = new Uint32Array(w * 2 * h * 2);
  const W = w * 2;
  const px = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? -1 : flat[y * w + x]);
  const see = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && clear[y * w + x] === 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = flat[y * w + x];
      const up = px(x, y - 1);
      const down = px(x, y + 1);
      const left = px(x - 1, y);
      const right = px(x + 1, y);
      let e0 = p;
      let e1 = p;
      let e2 = p;
      let e3 = p;
      // Two neighbours off the picture's edge agree (-1 both) at its corners, and are no colour to take: left alone,
      // a corner pixel was white - a white dot at each corner of every wall, along the view's top and bottom.
      if (left === up && up >= 0 && left !== down && up !== right && !see(x - 1, y) && !see(x, y - 1)) e0 = up;
      if (up === right && up >= 0 && up !== left && right !== down && !see(x + 1, y) && !see(x, y - 1)) e1 = right;
      if (down === left && down >= 0 && down !== right && left !== up && !see(x - 1, y) && !see(x, y + 1)) e2 = left;
      if (right === down && right >= 0 && right !== up && down !== left && !see(x + 1, y) && !see(x, y + 1)) e3 = down;
      const o = y * 2 * W + x * 2;
      const a = clear[y * w + x] === 1 ? 0 : 0xff000000;
      out[o] = a ? abgr(e0) : 0;
      out[o + 1] = a ? abgr(e1) : 0;
      out[o + W] = a ? abgr(e2) : 0;
      out[o + W + 1] = a ? abgr(e3) : 0;
    }
  }
  return out;
}

/**
 * A picture at twice its size, its edges followed rather than squared
 * (EPX): a pixel's corner takes the colour of the two neighbours beside
 * it where they agree with each other and with nothing else. The colour
 * page is four times the EGA's size and a restyled picture twice, so
 * this carries one to the other.
 */
export function twice(px: Uint32Array, w: number, h: number): Uint32Array {
  const out = new Uint32Array(w * 2 * h * 2);
  const at = (x: number, y: number): number => px[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = px[y * w + x];
      const [a, b, c, d] = [at(x, y - 1), at(x + 1, y), at(x - 1, y), at(x, y + 1)];
      const o = y * 2 * w * 2 + x * 2;
      out[o] = c === a && c !== d && a !== b ? a : p;
      out[o + 1] = a === b && a !== c && b !== d ? b : p;
      out[o + w * 2] = d === c && d !== b && c !== a ? c : p;
      out[o + w * 2 + 1] = b === d && b !== a && d !== c ? d : p;
    }
  }
  return out;
}
