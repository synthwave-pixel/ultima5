/**
 * standardPictures.ts
 *
 * The Standard look of the game's own pictures, made at run time from the
 * player's copy, as the tile art is the port's own. Nothing of the game is
 * kept or shipped; this is only how it is shown.
 *
 * The corridor's walls and things (DNG1-3.16, ITEMS.16): the game's own
 * pixels, recoloured only - the corridor's colours, a wall in its
 * dungeon's light - each a square block at the colour page's size, the
 * stipple and dithers as drawn. And its wandering creatures (MON0-7.16),
 * their pixels kept in Remastered's toned colours, square blocks too, as
 * PC EGA draws them (November 2026, the player's choice: no longer EPX's
 * rounded corners).
 * A scene, for a game that asks for it ('scene'): its own pixels in
 * Remastered's toned colours, square blocks, nothing else changed (toned).
 * Everything else - the title, the introduction, the gypsy's cards, the
 * ending - is shown in both looks as the game drew it: its own pixels in its
 * own colours (screen.ts).
 */

import type { Picture } from '../data/images.ts';
import { DUNGEON_TINTS, OWN_COLOURS, tinted } from './colours.ts';
import { TONED } from './originals.ts';

/** A line drawn in black, and the black of an opening (the corridor's). */
export const OUTLINE = 0x20140c;
export const OPENING = 0x000000;

/**
 * The corridor's own colours. The three sets of walls are each their own
 * place - DNG1's earth, DNG2's red rock, DNG3's grey stone - and the EGA
 * gives each a handful of colours to say so. Standard keeps what each
 * one is and takes the shrillness out of it: the orange earth becomes
 * warm stone, the fire-red rock an old oxide, the greys a quieter stone.
 */
export const DUNGEON_EGA = [
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

/** A picture's pixels at twice its size, each a square of four: no edge followed, nothing blended. */
export function doubled(px: Uint32Array, w: number, h: number): Uint32Array {
  const out = new Uint32Array(w * 2 * h * 2);
  for (let y = 0; y < h * 2; y++) for (let x = 0; x < w * 2; x++) out[y * w * 2 + x] = px[(y >> 1) * w + (x >> 1)];
  return out;
}

/**
 * The corridor's walls, what stands in it, and its wandering creature (MON0-7.16); and a scene, which a game asks for
 * of its own pictures (toned).
 */
export type PictureKind = 'dungeon' | 'thing' | 'creature' | 'scene';

/**
 * A scene's own pixels in Remastered's toned colours (TONED), each EGA colour for its toned one, at the picture's own
 * size (RGBA in memory order, width by height), see-through where its mask is: nothing moved, blended or outlined.
 */
export function toned(v: Picture): Uint32Array {
  const at = colours(v);
  const out = new Uint32Array(v.width * v.height);
  for (let y = 0; y < v.height; y++)
    for (let x = 0; x < v.width; x++) {
      const c = at(x, y);
      out[y * v.width + x] = c < 0 ? 0 : abgr(TONED[c]);
    }
  return out;
}

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

/**
 * `m` (`w` by `h`) less its specks: a shape (its pixels joined at their sides and corners) under SPECK pixels and
 * under a tenth of the largest. Where a wall's stipple was drawn a little otherwise beside a skeleton, its dots and its
 * corners' marks are stone, to be smoothed as stone; a stalactite's two halves, a fall of rock's lumps, are kept.
 */
const SPECK = 25;
function withoutSpecks(m: Uint8Array, w: number, h: number): Uint8Array {
  const shape = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || shape[s] >= 0) continue;
    const id = sizes.length;
    let n = 0;
    const stack = [s];
    shape[s] = id;
    while (stack.length) {
      const k = stack.pop()!;
      n++;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const [x, y] = [(k % w) + dx, Math.floor(k / w) + dy];
          if (x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] && shape[y * w + x] < 0) {
            shape[y * w + x] = id;
            stack.push(y * w + x);
          }
        }
    }
    sizes.push(n);
  }
  const largest = Math.max(0, ...sizes);
  return Uint8Array.from(m, (on, k) => (on && (sizes[shape[k]] >= SPECK || sizes[shape[k]] * 10 >= largest) ? 1 : 0));
}

/**
 * What is drawn into a wall that is not its stone, of picture `v`: 0 the wall; 1 a thing found where it differs from
 * the plain wall (a skeleton, a fall of rock), 2 the wall's own greys round and through such a thing; 3 a thing found by
 * colours of its own (a door).
 */
export function standsOut(v: Picture, wall: WallOf): Uint8Array {
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
    // A thing drawn mostly in black and white (a skeleton's lines and bones): its pixels in the stone's other colours
    // marked 2, the wall's own shading round it - the dust at its feet, the shadow it casts - and the wall's, when the
    // wall is only recoloured. A fall of the wall's own rock is all of it the rock's.
    const kept = withoutSpecks(out, w, h);
    const greyAt = (i: number): boolean => {
      const c = mine(i % w, Math.floor(i / w));
      return ofStone[c] && c !== 0 && c !== 15;
    };
    let greys = 0;
    let on = 0;
    for (let i = 0; i < w * h; i++) if (kept[i]) [on, greys] = [on + 1, greys + (greyAt(i) ? 1 : 0)];
    // And what of the wall shows between its bones, as the plain wall has it there.
    const wallAt = (i: number): boolean => plain(i % w, Math.floor(i / w)) === mine(i % w, Math.floor(i / w));
    return greys * 2 < on ? kept.map((k, i) => (k && (greyAt(i) || wallAt(i)) ? 2 : k)) : kept;
  }
  // Otherwise its own colours, and whatever lies between them on a row (the planks between a door's posts, the dark
  // of an archway) - on to the right edge, for a wall faced head on: marked 3, found by its colours, not by all of
  // where it differs (a door's carved head above it is a part of it all the same).
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
      if (near) out[y * w + x] = 3;
    }
  }
  return out;
}

export function restyle(v: Picture, kind: PictureKind, tint = 0, wall?: WallOf): Uint32Array {
  const { width: w, height: h } = v;
  // A scene: its own pixels toned, nothing else (toned; the screen draws them at their own size).
  if (kind === 'scene') return doubled(toned(v), w, h);
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
  const shade = (i: number): number =>
    kind === 'dungeon' && !OWN_COLOURS.includes(tint) ? tinted(DUNGEON_EGA[i], DUNGEON_TINTS[tint] ?? 0xffffff) : DUNGEON_EGA[i];
  // A door or a fall of rock drawn into a wall keeps its colours, as a ladder or a chest does.
  const own = kind === 'dungeon' && wall ? standsOut(v, wall) : null;
  const shadeAt = (i: number, p: number): number => (own?.[p] ? DUNGEON_EGA[i] : shade(i));
  // The plain wall beyond something found by where it differs from it (a skeleton, a fall of rock; not a door, found by
  // its colours, whose wall is its own).
  const plain = own && !own.includes(3) && wall?.plain && wall.plain.width === w && wall.plain.height === h ? colours(wall.plain) : null;
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
      // The walls and what stands in the corridor recoloured only (November 2026, the player's choice: the stipple and
      // dithers kept as drawn, nothing blended): the pixel as the game drew it, in the corridor's colours - a wall in
      // its dungeon's light, a door, a skeleton or a chest in its own. The wall's stone round a skeleton and between
      // its bones (standsOut's 2) in the dungeon's light with the rest; and the wall beyond what is drawn into it the
      // plain wall's own pixels - 1988 drew the stone round a skeleton or a fall of rock a little otherwise, which
      // would show change with it when it goes.
      if (kind !== 'creature') {
        const p = y * w + x;
        const under = !own?.[p] && plain ? plain(x, y) : -1;
        flat[p] = under >= 0 ? shade(under) : own?.[p] === 2 ? shade(c) : shadeAt(c, p);
        continue;
      }
      const lone = c === 0 && black[y * w + x] === 0;
      if (c === 0 && !lone) {
        flat[y * w + x] = black[y * w + x] === 2 ? OPENING : OUTLINE;
        continue;
      }
      // A creature keeps its pixels, in Modern PC's toned colours, as the figures on the map are: its dithers are
      // its fur and scales.
      flat[y * w + x] = TONED[c];
    }
  }
  // Each pixel a square of four, as PC EGA draws them: nothing rounded, nothing blended.
  return doubled(
    Uint32Array.from(flat, (rgb, k) => (clear[k] ? 0 : abgr(rgb))),
    w,
    h,
  );
}
