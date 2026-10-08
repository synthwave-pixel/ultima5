/**
 * terrain.ts
 *
 * The ground of Britannia and the Underworld: water, swamp, grass and its
 * mixes, sand, forests, hills and mountains, paths, rivers and shores
 * (drawn over running water, which shows through them), lava. (The
 * crops, cactus and lone trees are fittings now: fittings.ts.)
 * Every ground tiles with itself and its neighbours: textures are made
 * on the 32-pixel torus, so edges meet.
 */

import { mix, rgba, rng, Sprite } from './draw.ts';
import {
  BIG,
  type Canvas,
  cutOut,
  fromBig,
  lum,
  lumps,
  mended,
  mound,
  painted,
  ramp,
  rgb,
  type RGB,
  shadow,
  smoothstep,
  type Stamp,
  u3Ground,
} from './paint.ts';
import { P } from './palette.ts';
import { courses } from './surfaces.ts';

// --- Grounds -----------------------------------------------------------------------------------------
//
// Painted, as the ultima3 port's grounds are (paint.ts): its own water, grass, trees, mountains and lava
// where Ultima V has the same, and the rest - sand, earth, swamp, hills - made in the same soft manner.

const cache = new Map<string, Canvas>();
const kept = (key: string, make: () => Canvas): Canvas => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key)!.clone();
};

/** The tiles' own grain: a drawing 32 pixels a side, each pixel a block of four on the sheet (draw.ts). */
const GRID = 32;

/** A value on the grid's torus that changes slowly, `cells` bumps across a tile, eased between: a tile meets itself. */
function gridNoise(seed: number, cells: number): (x: number, y: number) => number {
  const r = rng(seed);
  const v = Array.from({ length: cells * cells }, () => r());
  const at = (i: number, j: number): number => v[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
  const ease = (a: number): number => a * a * (3 - 2 * a);
  return (x, y) => {
    const [fx, fy] = [(x / GRID) * cells, (y / GRID) * cells];
    const [i, j] = [Math.floor(fx), Math.floor(fy)];
    const [u, t] = [ease(fx - i), ease(fy - j)];
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - t) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * t;
  };
}

/**
 * The grass on the tiles' own grain, as the high country is drawn (highCountry): a few flat greens - its ground in
 * patches of two close greens (a lighter patch would repeat square after square across a plain), and tufts of blades scattered evenly across it, their tips lit - rather than the ultima3 grass,
 * which is painted at the sheet's 64 and read as soft beside the hills and mountains drawn on it. A lawn is kept:
 * lighter, evener, fewer tufts. Its greens are held down (grassTone), so what stands on it is seen.
 */
function pixelGrass(lawn: boolean): RGB[] {
  const patches = gridNoise(0x51, 4);
  const fine = gridNoise(0x52, 8);
  const r = rng(lawn ? 0x63 : 0x53);
  const out: RGB[] = [];
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      const v = patches(x, y) * 0.5 + fine(x, y) * 0.5;
      out.push(grassTone(lawn ? (v < 0.42 ? P.grass : P.grassBlade) : v < 0.45 ? P.grassDeep : P.grass));
    }
  const put = (x: number, y: number, c: number): void => {
    out[(((y % GRID) + GRID) % GRID) * GRID + (((x % GRID) + GRID) % GRID)] = grassTone(c);
  };
  // One tuft to each square of a four-by-four grid, somewhere in it: they fall evenly, and meet across the edges.
  for (let cy = 0; cy < 4; cy++)
    for (let cx = 0; cx < 4; cx++) {
      if (lawn && r() < 0.5) continue;
      const [x, y] = [cx * 8 + 1 + Math.floor(r() * 6), cy * 8 + 2 + Math.floor(r() * 5)];
      if (r() < 0.55) {
        // Three blades: the middle one upright and lit at its tip, the outer two leaning out.
        put(x, y, P.grassBlade);
        put(x - 1, y - 1, P.grassBlade);
        put(x + 1, y - 1, P.grassBlade);
        put(x, y - 1, P.grassLight);
        put(x - 1, y - 2, P.grassLight);
        put(x + 1, y - 2, P.grassLight);
        put(x, y + 1, P.grassDeep);
      } else {
        // Two blades, a V.
        put(x, y, P.grassBlade);
        put(x - 1, y - 1, P.grassLight);
        put(x + 1, y - 1, P.grassLight);
      }
    }
  // A glint here and there.
  for (let i = 0; i < (lawn ? 3 : 6); i++) put(Math.floor(r() * GRID), Math.floor(r() * GRID), P.grassTip);
  return out;
}

/**
 * A grass green as the grass is laid: a fifth of its colour taken toward its own grey, and a fifth darker - so a tree,
 * a hill, a flower or a figure stands out from the grass it is on.
 */
function grassTone(c: number): RGB {
  const [r, g, b] = rgb(c);
  const l = r * 0.3 + g * 0.59 + b * 0.11;
  return [r, g, b].map((v) => (v + (l - v) * 0.2) * 0.8) as RGB;
}

/** A drawing on the grid as a canvas: each of its pixels four of the canvas's. */
function gridCanvas(px: RGB[]): Canvas {
  return painted((x, y) => px[(y >> 1) * GRID + (x >> 1)]);
}

/** A pixel of the grid (gx, gy) set on a canvas: its block of four, wrapping round the tile. */
function block(c: Canvas, gx: number, gy: number, colour: number | RGB): void {
  const v = typeof colour === 'number' ? rgb(colour) : colour;
  const [x, y] = [(((gx % GRID) + GRID) % GRID) * 2, (((gy % GRID) + GRID) % GRID) * 2];
  c.set(x, y, v);
  c.set(x + 1, y, v);
  c.set(x, y + 1, v);
  c.set(x + 1, y + 1, v);
}

/** The grass as a canvas: the grass on the grid, shifted a different way for each seed (by whole pixels of the grid). */
export function grassCanvas(seed: number, lawn = false): Canvas {
  const r = rng(seed + 0x9e37);
  return kept(lawn ? 'lawn' : 'grass', () => gridCanvas(pixelGrass(lawn))).shifted(Math.floor(r() * GRID) * 2, Math.floor(r() * GRID) * 2);
}

/** Grass. `blades` is how thick it grows: a lawn (90) is lighter than the wild. */
export function grass(seed: number, blades = 70): Sprite {
  return grassCanvas(seed, blades >= 90).sprite();
}

/** The grass below the world: the same grass, quieted as the build quiets it, and grey (Manifest.below). */
export function greyGrass(seed: number): Sprite {
  return grassCanvas(seed)
    .map((g) => greyed(quietGrass(g)))
    .sprite();
}

/** A square below the world: its greens quieted as the build quiets the land's, and all of it grey (Manifest.below). */
export function greySquare(sprite: Sprite): Sprite {
  const full = sprite.full();
  const big = new Uint32Array(full.length);
  for (let i = 0; i < full.length; i++) {
    const v = full[i];
    const [r, g, b] = greyed(quietGrass([(v >> 16) & 255, (v >> 8) & 255, v & 255]));
    big[i] = rgba((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b), v >>> 24);
  }
  return fromBig(big);
}

/** A colour as grey: its own brightness. */
const greyed = ([r, g, b]: RGB): RGB => {
  const l = r * 0.3 + g * 0.59 + b * 0.11;
  return [l, l, l];
};

/** The grass's greens quieted as the build quiets the land's (build.ts quieter: it cannot be imported, the build runs on loading). */
function quietGrass([r, g, b]: RGB): RGB {
  const l = r * 0.3 + g * 0.59 + b * 0.11;
  if (!(g > r + 8 && g > b + 8)) return [r, g, b];
  const scale = l > 40 ? 1 - 0.35 * Math.min(1, (l - 40) / 60) : 1;
  const q = (c: number): number => (l + (c - l) * (1 - 0.35 * 0.45)) * (1 - 0.35 * 0.12) * scale;
  return [q(r), q(g), q(b)];
}

/** Earth: soft lumps of three browns, grit, a few pebbles with their shadows. */
export function dirtCanvas(seed: number): Canvas {
  const coarse = lumps(seed + 3, 6);
  const fine = lumps(seed + 4, 20);
  const r = rng(seed);
  const grit = Array.from({ length: BIG * BIG }, () => r());
  const c = painted((x, y) => {
    const v = coarse(x, y) * 0.6 + fine(x, y) * 0.3 + grit[y * BIG + x] * 0.1;
    return ramp([P.dirtShade, P.dirt, P.dirt, P.dirtLight], smoothstep(0.2, 0.8, v));
  });
  for (let i = 0; i < 7; i++) {
    const x = r() * BIG;
    const y = r() * BIG;
    const rad = 1.5 + r() * 1.5;
    shadow(c, x + 1, y + 1.5, rad + 0.5, rad * 0.7, 0.35);
    mound(c, x, y, rad, rad * 0.75, [P.dirtShade, P.pebble, P.sandLight]);
  }
  return c;
}

export function dirt(seed: number): Sprite {
  return dirtCanvas(seed).sprite();
}

/** Grass worn to earth, `wear` of it, in patches whose edges are trodden soft. */
/**
 * Grass worn to bare earth, `wear` of it (the EGA's 0x20-0x26 and 0x30-0x33: the same ground dithered brown in
 * steps, which the map lays in runs as tracks and clearings). The plain grass, its ground browning a little with
 * the wear, and where it has a bright blade, in the share it is worn, a larger fleck of earth instead. The blades
 * are the grass's own, so every step is the same pattern, flecked more or less, and a run joins up into one track.
 * `seed` is kept for the callers; the pattern is the same for all.
 */
export function wornCanvas(seed: number, wear: number): Canvas {
  void seed;
  const grass = grassCanvas(5);
  if (wear <= 0) return grass;
  const w = Math.min(1, wear);
  let brightest = 0;
  for (let y = 0; y < BIG; y++) for (let x = 0; x < BIG; x++) brightest = Math.max(brightest, lum(grass.get(x, y)));
  const earth = [0x241509, P.dirtShade, P.dirt, P.dirtLight];
  const c = painted((x, y) => {
    const g = grass.get(x, y);
    const e = ramp(earth, Math.min(1, (lum(g) / brightest) * 1.2));
    const k = w * 0.45;
    return [g[0] + (e[0] - g[0]) * k, g[1] + (e[1] - g[1]) * k, g[2] + (e[2] - g[2]) * k];
  });
  // Earth showing through: a pebble of four on the grid to each square of an eight-by-eight grid, somewhere in it,
  // for `wear` of them - lit at its upper left, shaded at its lower right.
  const r = rng(0x77);
  for (let cy = 0; cy < 8; cy++)
    for (let cx = 0; cx < 8; cx++) {
      const [x, y, chance] = [cx * 4 + Math.floor(r() * 3), cy * 4 + Math.floor(r() * 3), r()];
      if (chance >= w) continue;
      block(c, x, y, P.sandLight);
      block(c, x + 1, y, P.dirtLight);
      block(c, x, y + 1, P.dirtLight);
      block(c, x + 1, y + 1, P.dirtShade);
    }
  return c;
}

export function worn(seed: number, wear: number): Sprite {
  return wornCanvas(seed, wear).sprite();
}

/** Sand: dunes running across, lit from the upper left, grained. */
export function sand(seed: number): Sprite {
  return sandCanvas(seed).sprite();
}

export function sandCanvas(seed: number): Canvas {
  const warp = lumps(seed, 4);
  const r = rng(seed);
  const grain = Array.from({ length: BIG * BIG }, () => r());
  const height = (x: number, y: number): number => Math.sin(((y + warp(x, y) * 22 + x / 3) / BIG) * Math.PI * 2 * 3);
  return painted((x, y) => {
    const slope = height(x - 1, y - 1) - height(x + 1, y + 1);
    const t = 0.5 + slope * 0.9 + (grain[y * BIG + x] - 0.5) * 0.12;
    return ramp([P.sandShade, P.sand, P.sand, P.sandLight], t);
  });
}

/**
 * Water: the ultima3 sea, in the blues of its depth. It wraps top to
 * bottom, since the game rolls it down a little every tick.
 */
export function water(depth: 0 | 1 | 2, seed: number): Sprite {
  const blues = [
    [0x05163c, P.deep, P.sea, P.seaLight],
    [P.deep, P.sea, P.seaLight, P.shallowLight],
    [P.sea, P.seaLight, P.shallowLight, P.foam],
  ][depth];
  void seed;
  return kept('water', () => mended(u3Ground('water')))
    .map((c) => ramp(blues, smoothstep(0.3, 0.72, lum(c))))
    .sprite();
}

/**
 * Swamp: a fen of dark peat water, lily pads on it, and standing in it tussocks of sedge seen from the front (the
 * art direction's rule 1), some with cattails, each on its hummock of mud and roots and mirrored in the water.
 */
export function swamp(seed: number): Sprite {
  // The ultima3 water's ripples, as the peat water's light.
  const light = kept('water', () => mended(u3Ground('water')));
  const c = light.map((w) => ramp([0x0e1612, 0x1c2c26, 0x2e4840, 0x5e8a7c], smoothstep(0.25, 0.8, lum(w))));
  const r = rng(seed);
  // Lily pads, a notch in each.
  for (const [x, y] of [
    [22, 30],
    [56, 18],
    [40, 52],
    [4, 42],
  ]) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -3; dx <= 3; dx++)
        if (Math.abs(dx) + Math.abs(dy) * 2.5 < 4 && !(dx === 1 && dy === -1)) c.set(x + dx, y + dy, rgb(dy < 0 ? 0x4e8a34 : 0x2f6424));
    c.set(x - 1, y - 1, rgb(0x7ab85a));
  }
  // The tussocks: where each stands and how tall, set so the tile's edges meet (the canvas wraps).
  const sedge = [0x34461a, 0x6a7e30, 0xa8b04a, 0xe4dc88];
  const tussocks: [number, number, number][] = [
    [12, 20, 13],
    [42, 12, 12],
    [30, 40, 14],
    [58, 46, 11],
    [8, 58, 10],
    [52, 30, 9],
    [22, 60, 8],
    [44, 60, 9],
  ];
  tussocks.forEach(([x, y, size], k) => {
    for (let dx = -size * 0.55; dx <= size * 0.55; dx++) {
      c.set(Math.round(x + dx), y, rgb(dx < 0 ? 0x3a3018 : 0x241c0e));
      c.set(Math.round(x + dx), y + 1, rgb(0x120e08));
    }
    tuft(c, x, y - 1, size, sedge, r);
    if (k % 2 === 0) {
      // A cattail: its stalk, and the brown head lit on the left.
      const tx = x + (k % 4 === 0 ? 2 : -2);
      const top = y - size - 3;
      for (let yy = top - 1; yy < y - 2; yy++) c.set(tx, yy, rgb(0x6a7a30));
      for (let yy = top; yy < top + 4; yy++) {
        c.set(tx, yy, rgb(yy === top ? 0x8a5a2c : 0x5a3418));
        c.set(tx + 1, yy, rgb(0x3a200e));
      }
    }
  });
  return c.sprite();
}

/** A tuft of sedge standing at (cx, base) on water: blades fanning up, lit on the left, mirrored faintly below. */
function tuft(c: Canvas, cx: number, base: number, size: number, tones: number[], r: () => number): void {
  const n = Math.round(5 + size * 0.6);
  for (let i = 0; i < n; i++) {
    const off = (i / (n - 1) - 0.5) * 2; // -1 at the left, 1 at the right
    const len = size * (1 - Math.abs(off) * 0.45) * (0.8 + r() * 0.35);
    const lean = off * 0.55 + (r() - 0.5) * 0.2;
    const x0 = cx + off * size * 0.3;
    const lit = off < -0.2 ? 1 : off > 0.35 ? -1 : 0;
    for (let k = 0; k < len; k++) {
      const t = k / len;
      const x = Math.round(x0 + lean * k * (0.6 + t * 0.6));
      const tone = Math.min(tones.length - 1, Math.max(0, Math.floor(t * (tones.length - 1) + 0.5 + lit * 0.6)));
      c.set(x, base - k, rgb(tones[tone]));
      if (k < len * 0.6) c.set(x, base + 2 + k, mixRGB(c.get(x, base + 2 + k), rgb(tones[0]), 0.35 * (1 - t)));
    }
  }
  // Dark where it stands.
  for (let dx = -Math.ceil(size * 0.4); dx <= Math.ceil(size * 0.4); dx++)
    c.set(Math.round(cx + dx), base + 1, mixRGB(c.get(Math.round(cx + dx), base + 1), rgb(0x050804), 0.55));
}

const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Lava: the ultima3 lava, which rolls like water. */
export function lava(seed: number): Sprite {
  void seed;
  return u3Ground('lava').sprite();
}

// --- Plants ------------------------------------------------------------------------------------------

/**
 * The ultima3 brush and forest, their leaves a shade calmer: painted for a
 * brighter grass than this one, they shout on it as they are.
 */
const leafy = (name: 'brush' | 'forest'): Canvas =>
  kept(name, () =>
    u3Ground(name).map((v) => {
      if (v[1] < 84 || v[1] < v[0]) return v; // the grass between, and the trunks
      const grey = lum(v) * 255;
      return v.map((k) => (k * 0.85 + grey * 0.15) * 0.86) as RGB;
    }),
  );

/**
 * The woods on the tiles' own grain, inked as the high country is: each crown a lumpy round of one flat leaf,
 * hatched on its lower right in a deeper one, no line drawn round it; a tree's trunk under its crown, its right side
 * the deeper; a bush sat on the ground; each with the hills' dotted foot trailing off to the right. Scrub and
 * brush are bushes (two, four), light forest and forest trees (two, three), where the ultima3 woods were painted at
 * the sheet's 64.
 */
export function woods(kind: 'scrub' | 'brush' | 'light' | 'forest'): Sprite {
  const c = grassCanvas(kind === 'scrub' ? 6 : kind === 'brush' ? 8 : kind === 'light' ? 9 : 10);
  type Plant = [number, number, number, boolean]; // centre x, y, radius, a tree
  const plants: Plant[] = {
    scrub: [
      [8, 8, 5, false],
      [23, 23, 5, false],
    ] as Plant[],
    brush: [
      [8, 7, 5, false],
      [24, 9, 5, false],
      [9, 23, 5, false],
      [24, 25, 5, false],
    ] as Plant[],
    light: [
      [9, 7, 6.5, true],
      [23, 18, 6.5, true],
    ] as Plant[],
    forest: [
      [9, 6, 6.5, true],
      [24, 11, 6.5, true],
      [10, 21, 6.5, true],
    ] as Plant[],
  }[kind];
  // The high country's ink (highCountry): each part one flat colour, hatched in a deeper one on its lower right (the
  // light from the upper left), no highlights; and where a hill has its dotted foot trailing off to the right, so
  // has a tree or a bush - in the grass's own green darkened, not the hills' near-black line.
  const LEAF = { fill: P.leaf, hatch: 0x1a4c16 };
  const TRUNK = { fill: P.trunk, hatch: 0x3a200e };
  const grid: (number | null)[] = new Array<number | null>(GRID * GRID).fill(null);
  const wrap = (v: number): number => ((v % GRID) + GRID) % GRID;
  const set = (x: number, y: number, v: number): void => void (grid[wrap(y) * GRID + wrap(x)] = v);
  const get = (x: number, y: number): number | null => grid[wrap(y) * GRID + wrap(x)];
  // The hills' hatch: diagonal lines a pixel of the grid wide, a pixel apart.
  const stripe = (x: number, y: number): boolean => (((x - y * 0.8) % 2) + 2) % 2 < 1;
  const feet: [number, number][] = [];
  // Each plant in turn, back to front (top to bottom): its trunk, then its crown over it.
  for (const [cx, cy, r, tree] of [...plants].sort((a, b) => a[1] - b[1])) {
    const lr = rng(cx * 31 + cy);
    const bumps = Array.from({ length: 8 }, () => 0.85 + lr() * 0.3);
    const radius = (dx: number, dy: number): number => {
      const a = ((Math.atan2(dy, dx) / (Math.PI * 2)) * 8 + 8) % 8;
      const i = Math.floor(a);
      const t = a - i;
      return r * (bumps[i] * (1 - t) + bumps[(i + 1) % 8] * t);
    };
    const base = tree ? Math.round(cy + r + 3) : Math.round(cy + r);
    if (tree)
      for (let y = Math.round(cy + r * 0.5); y <= base; y++)
        for (let x = cx - 1; x <= cx; x++) set(x, y, x === cx ? TRUNK.hatch : TRUNK.fill);
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const [dx, dy] = [x - cx, y - cy];
        if (Math.hypot(dx, dy) > radius(dx, dy)) continue;
        set(x, y, dx > -0.1 * r && dy > -0.35 * r && stripe(x, y) ? LEAF.hatch : LEAF.fill);
      }
    for (let x = cx + (tree ? 1 : Math.round(-0.1 * r)); x <= cx + r * 1.2; x += 2) feet.push([x, base + 1]);
  }
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      const v = get(x, y);
      if (v !== null) block(c, x, y, v);
    }
  // The dotted feet, on the grass where nothing stands.
  for (const [x, y] of feet) {
    if (get(x, y) !== null) continue;
    const g = c.get(wrap(x) * 2, wrap(y) * 2);
    block(c, x, y, [g[0] * 0.5, g[1] * 0.5, g[2] * 0.5]);
  }
  return c.sprite();
}

/**
 * The ultima3 port's own brush and forest, recoloured: their leaves taken from that port's green halfway (U3_GREEN)
 * to the calmed green the woods were drawn in. `keep`, where given, is which of the tile's trees stand (by where
 * they are, top-left to bottom-right); the rest are taken out, crown and trunk, and the ultima3 grass laid where
 * they stood - a thinner wood with the same trees in the same places.
 */
export function u3Woods(name: 'brush' | 'forest', keep?: number[]): Sprite {
  const own = u3Ground(name);
  const calm = leafy(name);
  // Canvas.map works in place: the recoloured tile is a copy of its own.
  const c = u3Ground(name).map((v, x, y) => {
    const k = calm.get(x, y);
    return [0, 1, 2].map((i) => k[i] * CALMED + (v[i] - k[i] * CALMED) * U3_GREEN) as RGB;
  });
  if (!keep) return c.sprite();
  const leaf = (x: number, y: number): boolean => {
    const [r, g] = own.get(x, y);
    return g > 84 && g >= r;
  };
  const bark = (x: number, y: number): boolean => {
    const [r, g, b] = own.get(x, y);
    return r > g && r > 60 && r > b + 20;
  };
  // The trees: each crown a run of bright leaves, found top-left to bottom-right.
  const tree = new Int8Array(BIG * BIG).fill(-1);
  const boxes: [number, number, number, number][] = [];
  for (let y = 0; y < BIG; y++)
    for (let x = 0; x < BIG; x++) {
      if (tree[y * BIG + x] !== -1 || !leaf(x, y)) continue;
      const id = boxes.length;
      const box: [number, number, number, number] = [x, y, x, y];
      const todo: [number, number][] = [[x, y]];
      let n = 0;
      while (todo.length) {
        const [px, py] = todo.pop()!;
        if (px < 0 || py < 0 || px >= BIG || py >= BIG || tree[py * BIG + px] !== -1 || !leaf(px, py)) continue;
        tree[py * BIG + px] = id;
        n++;
        box[0] = Math.min(box[0], px);
        box[1] = Math.min(box[1], py);
        box[2] = Math.max(box[2], px);
        box[3] = Math.max(box[3], py);
        todo.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
      }
      if (n > 40) boxes.push(box);
      else for (let i = 0; i < tree.length; i++) if (tree[i] === id) tree[i] = -2; // a stray leaf, not a tree
    }
  const grass = u3Ground('grass');
  const at = (x: number, y: number): number => tree[Math.min(BIG - 1, Math.max(0, y)) * BIG + Math.min(BIG - 1, Math.max(0, x))];
  boxes.forEach(([x0, y0, x1, y1], id) => {
    if (keep.includes(id)) return;
    // Its crown and the dark rim round it (not a kept tree's leaves)...
    for (let y = Math.max(0, y0 - 2); y <= Math.min(BIG - 1, y1 + 2); y++)
      for (let x = Math.max(0, x0 - 2); x <= Math.min(BIG - 1, x1 + 2); x++) {
        let near = false;
        for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) near = at(x + dx, y + dy) === id;
        if (near && !keep.includes(at(x, y))) c.set(x, y, grass.get(x, y));
      }
    // ...and its trunk below it.
    for (let y = Math.max(0, y1 - 6); y <= Math.min(BIG - 1, y1 + 18); y++)
      for (let x = x0; x <= x1; x++) {
        if (keep.includes(at(x, y))) continue;
        let barky = false;
        for (let dy = -1; dy <= 1 && !barky; dy++)
          for (let dx = -1; dx <= 1 && !barky; dx++) {
            const [bx, by] = [x + dx, y + dy];
            barky = bx >= 0 && by >= 0 && bx < BIG && by < BIG && bark(bx, by);
          }
        if (barky) c.set(x, y, grass.get(x, y));
      }
  });
  return c.sprite();
}

/**
 * A bush and a tree, cut from the ultima3 brush and forest, and made flat; their green halfway between the calmed
 * leaves and the ultima3 port's own. The bush's outline is deeper: it is always set down at little more than half
 * its size, where a one-pixel rim would fall between the pixels kept.
 */
const bush = (): Stamp => (stamps.bush ??= flat(cutOut(leafy('brush'), 14, 12), 2, 31, cutOut(u3Ground('brush'), 14, 12)));
const oak = (): Stamp => (stamps.oak ??= flat(footed(cutOut(leafy('forest'), 44, 22)), 1, 37, cutOut(u3Ground('forest'), 44, 22)));
/** How much of the ultima3 leaves' own brightness the woods' green takes (0 the calmed leaves, 1 the port's own). */
const U3_GREEN = 0.5;
/** How bright the calmed leaves were drawn in the woods, before they were flat (web/src/ui/woods.ts). */
const CALMED = 0.924;

/**
 * A plant made flat (the art direction's): the ultima3 shapes are kept, their shading is not, which on these
 * crowns reads as a later age's rendered leaves. Its leaves are one green (their own, on average, taken toward
 * the ultima3 port's `own` by U3_GREEN), with a few lighter flecks and a dark outline `rim` pixels deep round the crown, so a crown stands
 * clear of the one behind it; its trunk is one brown, darker down its sides.
 */
function flat(s: Stamp, rim: number, seed: number, own: Stamp): Stamp {
  const { w, h, colour, alpha } = s;
  const at = (i: number, j: number): number => j * w + i;
  const solid = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < w && j < h && alpha[at(i, j)] > 0;
  const trunk = (i: number, j: number): boolean => colour[at(i, j) * 3] > colour[at(i, j) * 3 + 1];
  const leaf = (i: number, j: number): boolean => solid(i, j) && !trunk(i, j);
  const sums = { leaf: [0, 0, 0, 0], trunk: [0, 0, 0, 0] };
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!solid(i, j)) continue;
      const sum = trunk(i, j) ? sums.trunk : sums.leaf;
      for (let k = 0; k < 3; k++) sum[k] += colour[at(i, j) * 3 + k];
      sum[3]++;
    }
  const mean = (sum: number[], k: number): RGB => [0, 1, 2].map((c) => (sum[c] / Math.max(1, sum[3])) * k) as RGB;
  // The ultima3 port's leaves, as it drew them.
  const theirs = [0, 0, 0, 0];
  for (let j = 0; j < own.h; j++)
    for (let i = 0; i < own.w; i++) {
      const o = (j * own.w + i) * 3;
      if (!own.alpha[j * own.w + i] || own.colour[o] > own.colour[o + 1]) continue;
      for (let k = 0; k < 3; k++) theirs[k] += own.colour[o + k];
      theirs[3]++;
    }
  const calmed = mean(sums.leaf, CALMED);
  const u3 = mean(theirs, 1);
  const green = calmed.map((c, k) => c + (u3[k] - c) * U3_GREEN) as RGB;
  const tones = {
    leaf: green,
    fleck: green.map((c) => c * 1.25) as RGB,
    rim: green.map((c) => c * 0.5) as RGB,
    trunk: mean(sums.trunk, CALMED + (1 - CALMED) * U3_GREEN),
    bark: mean(sums.trunk, 0.6),
  };
  // The flecks: a few two-by-two spots, scattered, not gathered where the light fell.
  const r = rng(seed);
  const flecks = new Set<number>();
  for (let j = 0; j < h; j += 2) for (let i = 0; i < w; i += 2) if (r() < 0.12) flecks.add(at(i, j));
  const out: Stamp = { w, h, colour: new Float32Array(colour.length), alpha: alpha.slice() };
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!solid(i, j)) continue;
      let tone: RGB;
      if (trunk(i, j)) tone = solid(i - 1, j) && solid(i + 1, j) ? tones.trunk : tones.bark;
      else {
        let edge = false;
        for (let d = 1; d <= rim && !edge; d++) edge = !leaf(i, j + d) || !solid(i - d, j) || !solid(i + d, j) || !solid(i, j - d);
        tone = edge ? tones.rim : flecks.has(at(i & ~1, j & ~1)) ? tones.fleck : tones.leaf;
      }
      out.colour.set(tone, at(i, j) * 3);
    }
  return out;
}

/** A tree cut out brings some bright grass with it at the foot: below the crown, only the brown of the trunk is kept. */
function footed(s: Stamp): Stamp {
  for (let j = Math.floor(s.h * 0.62); j < s.h; j++) {
    for (let i = 0; i < s.w; i++) {
      const o = (j * s.w + i) * 3;
      if (s.colour[o] <= s.colour[o + 1]) s.alpha[j * s.w + i] = 0;
    }
  }
  return s;
}
const stamps: { bush?: Stamp; oak?: Stamp } = {};

/**
 * The woods' pieces, for the game to plant from the map (web/src/ui/woods.ts): the oak and the bush, each alone on a
 * clear cell with its top-left at the cell's, and their sizes.
 */
export function woodsPieces(): Record<'oak' | 'bush', { sprite: Sprite; w: number; h: number }> {
  const piece = (st: Stamp): { sprite: Sprite; w: number; h: number } => {
    const big = new Uint32Array(BIG * BIG);
    for (let j = 0; j < st.h; j++)
      for (let i = 0; i < st.w; i++) {
        if (!st.alpha[j * st.w + i]) continue;
        const [r, g, b] = [0, 1, 2].map((k) => Math.max(0, Math.min(255, Math.round(st.colour[(j * st.w + i) * 3 + k]))));
        big[j * BIG + i] = rgba((r << 16) | (g << 8) | b);
      }
    return { sprite: fromBig(big), w: st.w, h: st.h };
  };
  return { oak: piece(oak()), bush: piece(bush()) };
}

/** Flowers in the grass. */
export function flowers(seed: number, c1: number, c2: number): Sprite {
  const c = grassCanvas(seed);
  const r = rng(seed + 1);
  // One bloom to each square of a four-by-four grid, somewhere in it: four petals round a gold heart, those below
  // and to the right in the petal's shade, on the grid as the grass is.
  for (let cy = 0; cy < 4; cy++)
    for (let cx = 0; cx < 4; cx++) {
      const [x, y] = [cx * 8 + 1 + Math.floor(r() * 6), cy * 8 + 1 + Math.floor(r() * 6)];
      const petal = r() < 0.5 ? c1 : c2;
      const shade = mix(petal, 0, 0.4);
      block(c, x, y - 1, petal);
      block(c, x - 1, y, petal);
      block(c, x + 1, y, shade);
      block(c, x, y + 1, shade);
      block(c, x, y, P.goldLight);
    }
  return c.sprite();
}

// --- Rock --------------------------------------------------------------------------------------------

/** The ultima3 range, for what is cut into it: a cave, a mine, a dungeon's mouth. */
export const mountainCanvas = (): Canvas => kept('mountains', () => mended(u3Ground('mountains'), true));

/** Mountains: the ultima3 range; the high peaks under snow. */
export function mountains(seed: number, big: boolean): Sprite {
  void seed;
  const c = mountainCanvas();
  if (!big) return c.sprite();
  // Snow lies where the light does: on the faces turned up and to the left.
  return c
    .map((v) => {
      const snow = smoothstep(0.5, 0.68, lum(v));
      const cold = [v[0] * 0.62, v[1] * 0.66, v[2] * 0.78]; // the rock above the snow line is greyer
      return cold.map((k, i) => k * (1 - snow) + rgb(P.snow)[i] * snow) as RGB;
    })
    .sprite();
}

/**
 * The hill's six layouts (the sheet's variants of 0x0b, one chosen for each square by its place: standardArt.ts
 * variantOf): three hills each, [centre, foot, half width, height] (64 a square), drawn back to front by their feet,
 * heights from 8 to 30 - the big hill in front in some, set back in others with the small ones before it.
 */
export const HILL_LAYOUTS: [number, number, number, number][][] = [
  // The big hill in front, two small behind.
  [
    [14, 26, 12, 18],
    [47, 24, 9, 10],
    [32, 58, 27, 24],
  ],
  // The big hill set back and high, two small before it.
  [
    [36, 36, 28, 30],
    [13, 60, 9, 11],
    [48, 62, 10, 13],
  ],
  // A tall hill behind to the left, a middling one before it to the right, a small one far back right.
  [
    [20, 34, 18, 26],
    [52, 21, 8, 10],
    [42, 60, 20, 16],
  ],
  // Low and wide in front, two of different heights behind.
  [
    [22, 22, 14, 20],
    [50, 30, 11, 13],
    [30, 60, 22, 17],
  ],
  // The big hill back and right, a small one before it to the left, one far back left.
  [
    [42, 40, 22, 28],
    [12, 24, 9, 12],
    [18, 61, 11, 12],
  ],
  // Three of a size, stepped from back left down to front right.
  [
    [16, 24, 14, 16],
    [34, 42, 16, 18],
    [50, 62, 14, 17],
  ],
];

/**
 * Rocky grass's six layouts (0x0f's versions, as the hill's): the two small hills of each of the hill's layouts, as
 * grey stones on the grass.
 */
export const ROCK_LAYOUTS: [number, number, number, number][][] = HILL_LAYOUTS.map((l) => [...l].sort((a, b) => a[3] - b[3]).slice(0, 2));

/**
 * The high country (the player's pixel hatch, drawn at 32 a square and doubled): the hill (0x0b) a low arch on the
 * grass, hatched along its foot on the shaded side, a dotted foot trailing off; the mountain (0x0c) and the
 * snow-capped peak (0x0d) whole squares of rock - a darker weave of small peaks across the square (each row half a
 * peak along from the one above, running on into the squares beside and below), and before it three peaks filling
 * the square (the mountain: two behind reaching its sides, the tallest before them) or one great peak (the peak:
 * the apex at the top edge, the foot the square's width, a snow cap with a wavy edge). One flat colour each, dark
 * outlined, the right flank hatched along its slope (the light is from the upper left); dark, near the ground's own
 * brightness. `below` for the Underworld: grey stone, and the peak's cap darker than its rock, no snow down there.
 */
export function highCountry(
  kind: 'peak' | 'mountain' | 'hill' | 'rocks',
  below = false,
  hills: [number, number, number, number][] = HILL_LAYOUTS[0],
): Sprite {
  const RES = 32;
  const k = RES / 64;
  const px: (RGB | null)[] = new Array<RGB | null>(RES * RES).fill(null);
  const set = (x: number, y: number, c: RGB): void => {
    [x, y] = [Math.floor(x), Math.floor(y)];
    if (x >= 0 && y >= 0 && x < RES && y < RES) px[y * RES + x] = c;
  };
  interface Ink {
    fill: RGB;
    hatch: RGB;
    outline: RGB;
    cap: RGB;
    capEdge: RGB;
  }
  const grey = (c: RGB): RGB => {
    const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
    return [l, l, l];
  };
  const ink = (i: Ink): Ink =>
    below ? { fill: grey(i.fill), hatch: grey(i.hatch), outline: grey(i.outline), cap: grey(i.cap), capEdge: grey(i.capEdge) } : i;
  const ROCK = ink({
    fill: rgb(0x6e5a4c),
    hatch: rgb(0x3a2c24),
    outline: rgb(0x140e0a),
    // Below the world the cap is darker than the rock: bare, dark stone at the top.
    cap: below ? rgb(0x2c2826) : rgb(0xc4c8d2),
    capEdge: below ? rgb(0x1a1816) : rgb(0x6a7082),
  });
  // Rocky grass's stones are the hill's shape in grey stone.
  const TURF =
    kind === 'rocks'
      ? ink({ fill: rgb(0x625e5a), hatch: rgb(0x36322e), outline: rgb(0x140e0a), cap: rgb(0), capEdge: rgb(0) })
      : ink({ fill: rgb(0x4a5e26), hatch: rgb(0x2a3616), outline: rgb(0x140e0a), cap: rgb(0), capEdge: rgb(0) });
  const WEAVE = ink({ fill: rgb(0x3e3228), hatch: rgb(0x241a14), outline: rgb(0x120c08), cap: rgb(0), capEdge: rgb(0) });
  const WEAVE_GROUND = below ? grey(rgb(0x1e1812)) : rgb(0x1e1812);

  /** A peak, apex at (cx, base - h), its foot `hw` either side (units of 64 a square); `cap` of it capped. */
  const peak = (i: Ink, cx: number, base: number, hw: number, h: number, hatch: number, cap = 0): void => {
    const [X, B, W, H] = [cx * k, base * k, hw * k, h * k];
    const top = B - H;
    const inside = (x: number, y: number): boolean => y <= B && y >= top && Math.abs(x + 0.5 - X) <= ((y - top) / H) * W + 0.3;
    const capLine = (x: number): number => top + H * cap + Math.sin((x / Math.max(1, W)) * 7) * H * 0.05;
    const spacing = Math.max(2, hatch * k);
    for (let y = Math.floor(top); y <= Math.ceil(B); y++)
      for (let x = Math.floor(X - W) - 1; x <= Math.ceil(X + W) + 1; x++) {
        if (!inside(x, y)) continue;
        if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) {
          set(x, y, i.outline);
          continue;
        }
        if (cap > 0 && y < capLine(x)) {
          set(x, y, y + 1 >= capLine(x) ? i.capEdge : i.cap);
          continue;
        }
        const t = (y - top) / H;
        const right = x + 0.5 > X + (t - 0.15) * W * 0.25;
        const u = (x - X) * H + (y - top) * -W;
        const stripe = Math.abs(((u / Math.hypot(W, H)) % spacing) + spacing) % spacing < Math.max(1, spacing * 0.34);
        set(x, y, right && t > 0.3 && stripe ? i.hatch : i.fill);
      }
  };

  /** A hill: a low arch at (cx, base), `hw` either side and `h` high, its foot hatched on the right, a dotted foot. */
  const arch = (cx: number, base: number, hw: number, h: number): void => {
    const [X, B, W, H] = [cx * k, base * k, hw * k, h * k];
    const inside = (x: number, y: number): boolean => {
      const d = (x + 0.5 - X) / W;
      return Math.abs(d) < 1 && y <= B && B - y <= H * Math.sqrt(1 - d * d) ** 0.8;
    };
    const spacing = Math.max(2, 4 * k);
    for (let y = Math.floor(B - H) - 1; y <= Math.ceil(B); y++)
      for (let x = Math.floor(X - W) - 1; x <= Math.ceil(X + W); x++) {
        if (!inside(x, y)) continue;
        if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1)) {
          set(x, y, TURF.outline);
          continue;
        }
        const low = (B - y) / H < 0.5;
        const stripe = (((x - y * 0.8) % spacing) + spacing) % spacing < Math.max(1, spacing * 0.34);
        set(x, y, low && x > X - W * 0.1 && stripe ? TURF.hatch : TURF.fill);
      }
    for (let x = X + W * 0.1; x <= X + W * 1.2; x += Math.max(2, 3 * k)) set(x, B + Math.max(1, k), TURF.outline);
  };

  if (kind === 'hill' || kind === 'rocks') {
    // The square's hills (`hills`: centre, foot, half width, height), back to front: the higher foot further off.
    for (const [cx, base, hw, h] of [...hills].sort((a, b) => a[1] - b[1])) arch(cx, base, hw, h);
  } else {
    // The weave: the square dark rock, rows of small peaks across it, wrapping at its sides.
    for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) set(x, y, WEAVE_GROUND);
    for (let row = 0; row <= 7; row++) for (let cx = -16 + (row % 2 ? 8 : 0); cx <= 80; cx += 16) peak(WEAVE, cx, row * 10 + 4, 8, 11, 5);
    if (kind === 'mountain') {
      peak(ROCK, 16, 42, 16, 36, 5);
      peak(ROCK, 48, 42, 16, 36, 5);
      peak(ROCK, 32, 63, 22, 46, 5);
    } else peak(ROCK, 32, 63, 32, 63, 5, 0.38);
  }
  // The grass quieted as the build quiets the land's; grey below the world. The rock and turf are left as drawn.
  const c = grassCanvas(kind === 'peak' ? 13 : kind === 'mountain' ? 12 : kind === 'rocks' ? 15 : 11);
  const ground = (g: RGB): RGB => (below ? greyed(quietGrass(g)) : quietGrass(g));
  return c.map((g, x, y) => px[Math.floor(y * k) * RES + Math.floor(x * k)] ?? ground(g)).sprite();
}

/**
 * Shrub (0x0e): the fen's sedge (swamp), softer - fewer, rounder, greener tussocks, standing on the grass with no
 * water about them, set out as the ultima3 brush sets its four trees. Each is a fan of blades, inked as the high
 * country is: one flat green, the right of the fan the deeper, a dotted foot trailing off to the right.
 */
export function shrub(): Sprite {
  const c = grassCanvas(14);
  // Inked as the high country and the woods are: the blades one flat green, those on the right of the fan the
  // deeper green (the light from the upper left), and the hills' dotted foot trailing off to the right.
  const FILL = 0x86a83e;
  const HATCH = 0x4a6022;
  const at: [number, number, number][] = [
    [8, 11, 5],
    [23, 17, 5],
    [9, 26, 5],
    [23, 31, 4],
  ];
  at.forEach(([cx, base, size], i) => {
    const r = rng(60 + i);
    for (let b = -2; b <= 2; b++) {
      const len = Math.max(2, Math.round(size * (1 - Math.abs(b) * 0.22) + (r() - 0.5)));
      for (let k = 0; k < len; k++) {
        const t = k / (len - 1 || 1);
        block(c, cx + Math.round(b * (0.4 + t * 0.9)), base - k, b > 0 ? HATCH : FILL);
      }
    }
    for (let x = cx; x <= cx + 5; x += 2) {
      const g = c.get(((x + GRID) % GRID) * 2, ((base + 1) % GRID) * 2);
      block(c, x, base + 1, [g[0] * 0.5, g[1] * 0.5, g[2] * 0.5]);
    }
  });
  return c.sprite();
}

/** Red stone: layered blocks of red rock (the roofs). `coarse`, on the originals' grid of 16, for Modern PC. */
export function redRock(seed: number, offset: boolean, coarse = false): Sprite {
  const c = courses({
    rise: 16,
    run: 32,
    coarse,
    stops: [P.brickShade, P.brick, P.brickLight, 0xd06a50],
    mortar: 0x2a100c,
    seed,
    vary: 0.5,
    grain: 0.35,
  });
  return (offset ? c.shifted(16, 0) : c).sprite();
}

// --- Rivers and shores -------------------------------------------------------------------------------

/**
 * A river's or a shore's water, as a bank tile draws it where the game
 * does not draw the shore from the map (web/src/ui/shore.ts does, on
 * Britannia and in the Underworld): clear over the rolling water but for
 * a paler shelf of shallows and the engraved map's lines following the
 * shore, and over the land (where the game lays the ground round the
 * square; bankLand gives where) only the damp of the bank. `wet(x, y)`
 * says which of the tile's pixels are water.
 */
export function bank(wet: (x: number, y: number) => boolean): Sprite {
  const REACH = 12;
  // Whether a pixel of the canvas is water: the tile's own reckoning, at that pixel's place in it.
  const isWet = (x: number, y: number): boolean => wet(x / 2 - 0.25, y / 2 - 0.25);
  const wetAt = new Uint8Array(BIG * BIG);
  for (let y = 0; y < BIG; y++) for (let x = 0; x < BIG; x++) wetAt[y * BIG + x] = isWet(x, y) ? 1 : 0;
  /** How far to the other kind (water from land, land from water), as far as REACH. */
  const far = (x: number, y: number): number => {
    const me = wetAt[y * BIG + x];
    let best = REACH;
    for (let dy = -REACH; dy <= REACH; dy++) {
      for (let dx = -REACH; dx <= REACH; dx++) {
        const [px, py] = [x + dx, y + dy];
        const other = px >= 0 && py >= 0 && px < BIG && py < BIG ? wetAt[py * BIG + px] : isWet(px, py) ? 1 : 0;
        if (other !== me) best = Math.min(best, Math.hypot(dx, dy));
      }
    }
    return best;
  };
  const pale: RGB = [104, 150, 170];
  const line: RGB = [200, 228, 250];
  const big = new Uint32Array(BIG * BIG);
  for (let py = 0; py < BIG; py++) {
    for (let px = 0; px < BIG; px++) {
      const d = far(px, py);
      let a = 0;
      let c: RGB = [6, 10, 12];
      if (wetAt[py * BIG + px]) {
        // The shallows' shelf, and over it a line where one falls: the two as one colour and cover.
        const shelf = d < 7 ? 0.5 * (1 - d / 7) ** 0.8 : 0;
        const mark =
          (
            [
              [2.5, 0.65],
              [5.5, 0.4],
              [9, 0.22],
            ] as const
          ).find(([k]) => Math.abs(d - k) < 0.55)?.[1] ?? 0;
        a = mark + shelf * (1 - mark);
        if (a > 0) c = line.map((v, i) => (v * mark + pale[i] * shelf * (1 - mark)) / a) as RGB;
      } else if (d < 3) a = 0.42 * (1 - d / 3); // the damp of the bank
      if (a < 0.03) continue;
      const [r, g, b] = c.map((v) => Math.max(0, Math.min(255, Math.round(v))));
      big[py * BIG + px] = rgba((r << 16) | (g << 8) | b, Math.round(a * 255));
    }
  }
  return fromBig(big);
}

/** Where a bank's land is (opaque) and its water (clear), as `bank` reckons it: the ground is laid through it. */
export function bankLand(wet: (x: number, y: number) => boolean): Sprite {
  const big = new Uint32Array(BIG * BIG);
  for (let y = 0; y < BIG; y++) for (let x = 0; x < BIG; x++) if (!wet(x / 2 - 0.25, y / 2 - 0.25)) big[y * BIG + x] = rgba(0xffffff);
  return fromBig(big);
}

/** Water regions for the river tiles, from the river's shape: half-width 7 about its centre line. */
export const RIVER = {
  ns: (x: number) => Math.abs(x - 15.5) < 7,
  ew: (_x: number, y: number) => Math.abs(y - 15.5) < 7,
  /** A bend round a corner: (cx, cy) the corner the bend turns about. */
  bend: (cx: number, cy: number) => (x: number, y: number) => Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - 16) < 7,
  /** A river that ends here, narrowing toward the far edge from the side it comes in by. */
  end: (side: 'n' | 'e' | 's' | 'w') => (x: number, y: number) => {
    const along = side === 's' ? y : side === 'n' ? 31 - y : side === 'e' ? x : 31 - x;
    const across = side === 'n' || side === 's' ? x : y;
    const half = Math.max(0, (along - 6) * 0.3);
    return Math.abs(across - 15.5) < Math.min(7, half);
  },
};

/** Two regions joined. */
export const either =
  (...fs: ((x: number, y: number) => boolean)[]) =>
  (x: number, y: number): boolean =>
    fs.some((f) => f(x, y));
