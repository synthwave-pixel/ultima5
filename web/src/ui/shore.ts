/**
 * shore.ts
 *
 * The Standard look's shores, drawn from the map (docs/art-brief.md §0,
 * rule 7): where land meets water - on Britannia and in the Underworld,
 * in the settlements and on the combat map - the
 * waterline is not a tile's edge but wanders by a noise of the world's own
 * pixels, so it runs on unbroken from square to square - along a river, and
 * along a straight coast, where land bulges into the water squares and
 * little bays bite into the land. Only soft ground takes part: a mountain, a
 * wood or a building keeps its square.
 *
 * By the water: a paler shelf of shallows, the bank damp beside it, and
 * then, where river water runs through swamp, the old charts' stipple of a
 * sandy bottom; everywhere else, the engraved map's lines following the
 * shore. The sea's depths (the map's deep, medium and shallow squares) are
 * blended from square to square, and its ripples' light dimmed in broad
 * patches, so the squares do not show.
 *
 * All of it on the tiles' own grain (the art direction's rule 8): which
 * ground a pixel shows, and how pale, marked or damp it is, is settled a
 * block of four at a time, and the waterline wanders by whole pixels of the
 * grid - only the water's own ripples, rolling through, are finer.
 *
 * A set drawn on the originals' coarser grid (Modern PC, ShoreStyle) has
 * its shore settled a block of sixteen at a time instead, as its tiles'
 * pixels are - the waterline, the shallows, the lines, the damp - and a
 * fringe of sand specks along the grass by the water, thick at the
 * waterline and thinning inland, so every grass coast has its beach.
 *
 * Each square's shore is worked out once (which pixels are land and which
 * water, where each takes its colour from, how far each is from the shore)
 * and kept; a frame only samples the rolling water through it.
 */

import type { Place } from '../game/io.ts';
import { HI } from './framebuffer.ts';
import { Kept, SQUARES_KEPT } from './kept.ts';

/** A tile's pixels: its size on the colour page. */
const N = 16 * HI;

/** What the shores are drawn from: the tile sheet. */
export interface ShoreSheet {
  /** A pixel of a tile (RGBA in memory order), as it first shows. */
  pixel(tile: number, x: number, y: number): number;
  /** Whether pixel (x, y) of a bank tile (a river's, a coast's corner) is its land; undefined for any other tile. */
  land(tile: number, x: number, y: number): boolean | undefined;
  /** How far a water tile has rolled, this tick, in pixels. */
  roll(tile: number): number;
}

const WATER = new Set([0x01, 0x02, 0x03]);
/** The ground that gives and takes at a shore: swamp, grass, scrub, sand, the worn earth, flowering grass. */
const SOFT = new Set([0x04, 0x05, 0x06, 0x07, 0x08, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x30, 0x31, 0x32, 0x33]);
/** The grounds a bank's land is laid with: the most of those round it. */
const GROUNDS = new Set([0x04, 0x05, 0x06, 0x07, 0x08]);
/** Scrub's bushes are drawn in: carried into the water, it is the grass they grow in. */
const BARE: Record<number, number> = { 0x06: 0x05, 0x08: 0x05 };
/**
 * A river runs under a bridge (north to south under 0x6a, east to west under 0x6b), and down a waterfall (its four
 * frames, 0xd4 to 0xd7, north to south): its banks and shore are drawn as that river's.
 */
const BRIDGED: Record<number, number> = { 0x6a: 0x60, 0x6b: 0x61, 0xd4: 0x60, 0xd5: 0x60, 0xd6: 0x60, 0xd7: 0x60 };
const SWAMP = 0x04;
const RIVER_WATER = 0x02;

/** The grass a sand fringe is strewn on: the grass, and the paths and the dirt edges, which lie on it. */
const GRASSY = new Set([0x05, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x30, 0x31, 0x32, 0x33]);
/** The paths and the dirt edges, carried onto a bank's land on the originals' grid as the grass they lie on. */
const ROADS = new Set([0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x30, 0x31, 0x32, 0x33]);

/**
 * How a set draws its shores: `block`, the pixels of the colour page settled together (2, the grid of 32; 4, the
 * originals' grid of 16); `sand`, the specks of a fringe of sand along the grass by the water (0xRRGGBB), or none.
 */
export interface ShoreStyle {
  block: 2 | 4;
  sand: readonly number[] | null;
}

const isRiver = (t: number): boolean => (t >= 0x60 && t <= 0x6f) || t in BRIDGED;

/** The largest distance kept (pixels): the shallows, the stipple and the lines are all within it. */
const R = 12;
/** How far the waterline wanders (pixels). */
const WANDER = 16;
/** The margin round a square worked out with it, for the distances; and its size with the margin. */
const M = R + 2; // even: a block of the grid here is a block of the square
const E = N + 2 * M;
/** The wander is sampled every STEP pixels and blended between: its noises are far broader than that. */
const STEP = 4;
const G = E / STEP + 2;

const hash = (x: number, y: number, s: number): number =>
  (((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) >>> 0) % 10007) / 10007;

/** A smooth noise over the world's pixels, features about `scale` apart. */
function noise(seed: number, scale: number): (x: number, y: number) => number {
  const ease = (t: number): number => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / scale;
    const fy = y / scale;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = ease(fx - i);
    const v = ease(fy - j);
    const h = (a: number, b: number): number => hash(a & 0xffff, b & 0xffff, seed);
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };
}

/** What a pixel of a square shows: the square's own tile, as drawn (darkened by `shade`); */
const OWN = 0;
/** ground carried from a neighbour (or laid on a bank's land), tile `from` at (lx, ly); */
const GROUND = 1;
/** or water, the river's or the sea's by depth, at (lx, ly) of it. */
const WET = 2;

/** A square's shore, worked out. */
interface Shore {
  mode: Uint8Array;
  /** For ground, the tile it is; for water, the river's water tile, or -1 for the sea. */
  from: Int16Array;
  lx: Uint8Array;
  ly: Uint8Array;
  /** The sea's depth, 0 to 255 for shallow to deep. */
  depth: Uint8Array;
  /** How much of the sea ripples' light shows here, 0 to 255. */
  glint: Uint8Array;
  /** The shallows' paleness, 0 to 255. */
  shelf: Uint8Array;
  /** A mark on the water: 0 none, 1 a grain of sand, 2 a line; and how strongly (0 to 255). */
  mark: Uint8Array;
  markA: Uint8Array;
  /** The damp of the bank, darkening the land, 0 to 255. */
  shade: Uint8Array;
  /** A speck of the sand fringe: 0 none, else which of the style's sand colours, from 1. */
  sand: Uint8Array;
}

const PALE: [number, number, number] = [104, 150, 170];
const SAND: [number, number, number] = [214, 196, 150];
const LINE: [number, number, number] = [200, 228, 250];
const DAMP: [number, number, number] = [6, 10, 12];

export class Shores {
  private readonly kept = new Kept<Shore | null>(SQUARES_KEPT);
  private shoreStyle: ShoreStyle = { block: 2, sand: null };

  constructor(private readonly sheet: ShoreSheet) {}

  /** How the shores are drawn (ShoreStyle); the shores worked out so far forgotten when it changes. */
  get style(): ShoreStyle {
    return this.shoreStyle;
  }
  set style(style: ShoreStyle) {
    this.shoreStyle = style;
    this.kept.clear();
  }

  /** Whether square `place` is drawn by its shore: water, a bank or a bridge, or soft ground with water beside it. */
  static drawn(place: Place): boolean {
    const t = place.around[12];
    if (WATER.has(t) || isRiver(t) || (t >= 0x34 && t <= 0x37)) return true;
    if (!SOFT.has(t)) return false;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = place.around[(2 + dy) * 5 + 2 + dx];
        if (WATER.has(n) || isRiver(n) || (n >= 0x34 && n <= 0x37)) return true;
      }
    return false;
  }

  /** Lay the shore of square `place` over `out` (N x N, the square as its tile draws it). */
  draw(out: Uint32Array, place: Place): void {
    const s = this.shore(place);
    if (!s) return;
    const sheet = this.sheet;
    const rolls = [0, sheet.roll(1), sheet.roll(2), sheet.roll(3)];
    // Each tick, every pixel of every shore in view: its colour worked in plain numbers, with nothing made per pixel
    // (a phone's collector would be kept busy with millions of them a second).
    const wet = (t: number, x: number, y: number): number => sheet.pixel(t, x, (y - rolls[t] + N * 4) % N);
    const { block, sand } = this.shoreStyle;
    // On the originals' grid, each block of sixteen is its top-left pixel's colour, laid over the whole block.
    const coarse = block === 4;
    for (let i = 0; i < N * N; i++) {
      if (coarse && (i & 3 || (i / N) & 3)) continue;
      const mode = s.mode[i];
      let v: number;
      if (s.sand[i] && sand) {
        const c = sand[s.sand[i] - 1];
        v = 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff);
      } else if (mode === OWN) {
        if (!s.shade[i]) continue;
        v = out[i];
      } else if (mode === GROUND) {
        v = sheet.pixel(s.from[i], s.lx[i], s.ly[i]);
      } else if (s.from[i] >= 0) {
        v = wet(s.from[i], s.lx[i], s.ly[i]);
      } else v = -1;
      let r: number, g: number, b: number;
      if (v !== -1) {
        r = v & 0xff;
        g = (v >> 8) & 0xff;
        b = (v >> 16) & 0xff;
      } else {
        // The sea: shallow, medium and deep blended by depth; the ripples' light dimmed in broad patches.
        const d = s.depth[i] / 127.5;
        const x = s.lx[i];
        const y = s.ly[i];
        const p = d < 1 ? wet(3, x, y) : wet(2, x, y);
        const q = d < 1 ? wet(2, x, y) : wet(1, x, y);
        const k = d < 1 ? d : d - 1;
        r = (p & 0xff) + ((q & 0xff) - (p & 0xff)) * k;
        g = ((p >> 8) & 0xff) + (((q >> 8) & 0xff) - ((p >> 8) & 0xff)) * k;
        b = ((p >> 16) & 0xff) + (((q >> 16) & 0xff) - ((p >> 16) & 0xff)) * k;
        const light = Math.max(0, (r + g + b) / 3 - 70) / 120;
        const dim = 1 - light * (1 - s.glint[i] / 255);
        r *= dim;
        g *= dim;
        b *= dim;
      }
      if (mode === WET) {
        if (s.shelf[i]) {
          const t = s.shelf[i] / 255;
          r += (PALE[0] - r) * t;
          g += (PALE[1] - g) * t;
          b += (PALE[2] - b) * t;
        }
        if (s.mark[i]) {
          const c = s.mark[i] === 1 ? SAND : LINE;
          const t = s.markA[i] / 255;
          r += (c[0] - r) * t;
          g += (c[1] - g) * t;
          b += (c[2] - b) * t;
        }
      }
      if (s.shade[i] && !s.sand[i]) {
        const t = s.shade[i] / 255;
        r += (DAMP[0] - r) * t;
        g += (DAMP[1] - g) * t;
        b += (DAMP[2] - b) * t;
      }
      const c = (0xff000000 | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
      if (!coarse) out[i] = c;
      else for (let k = 0; k < 16; k++) out[i + (k >> 2) * N + (k & 3)] = c;
    }
  }

  private shore(place: Place): Shore | null {
    const key = `${place.map}:${place.x},${place.y}:${place.around.join(',')}`;
    let s = this.kept.get(key);
    if (s === undefined) {
      s = this.work(place);
      this.kept.set(key, s);
    }
    return s;
  }

  /** Work out square `place`'s shore. */
  private work(place: Place): Shore | null {
    const sheet = this.sheet;
    const { block, sand } = this.shoreStyle;
    const coarse = block === 4;
    /** A ground carried across the water's edge: on the originals' grid, a path or a dirt edge is the grass it lies on. */
    const carried = (t: number): number => (coarse && ROADS.has(t) ? 0x05 : (BARE[t] ?? t));
    const around = place.around;
    const sq = (sx: number, sy: number): number => around[(sy + 2) * 5 + sx + 2];
    /** What is at pixel (px, py) (from the square's top-left) before the wander: water, soft land or hard land. */
    const base = (px: number, py: number): 'w' | 's' | 'h' => {
      const sx = Math.floor(px / N);
      const sy = Math.floor(py / N);
      const t = sq(sx, sy);
      if (WATER.has(t)) return 'w';
      const lx = px - sx * N;
      const ly = py - sy * N;
      const land = sheet.land(BRIDGED[t] ?? t, lx, ly);
      if (land !== undefined) return land ? 's' : 'w';
      return SOFT.has(t) ? 's' : 'h';
    };
    // The world's pixels, for the noises, which differ in the Underworld.
    const ox0 = place.x * N;
    const oy0 = place.y * N;
    const seed = place.map * 1000;
    // Open sea, no land within reach: only its depth and its glint.
    let open = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!WATER.has(sq(dx, dy))) open = false;
    // How far each pixel's looks are taken from, sampled coarsely.
    const wa = noise(seed + 11, 40);
    const wb = noise(seed + 12, 40);
    const wc = noise(seed + 13, 14);
    const wd = noise(seed + 14, 14);
    const gx = new Float32Array(G * G);
    const gy = new Float32Array(G * G);
    if (!open)
      for (let j = 0; j < G; j++)
        for (let i = 0; i < G; i++) {
          const wx = ox0 - M + i * STEP;
          const wy = oy0 - M + j * STEP;
          gx[j * G + i] = ((wa(wx, wy) - 0.5) * 1.2 + (wc(wx, wy) - 0.5) * 0.4) * WANDER;
          gy[j * G + i] = ((wb(wx, wy) - 0.5) * 1.2 + (wd(wx, wy) - 0.5) * 0.4) * WANDER;
        }
    const wander = (g: Float32Array, x: number, y: number): number => {
      const i = Math.floor(x / STEP);
      const j = Math.floor(y / STEP);
      const u = x / STEP - i;
      const v = y / STEP - j;
      return (g[j * G + i] * (1 - u) + g[j * G + i + 1] * u) * (1 - v) + (g[(j + 1) * G + i] * (1 - u) + g[(j + 1) * G + i + 1] * u) * v;
    };
    const kind = new Uint8Array(E * E); // 1 water
    const soft = new Uint8Array(E * E); // 0 soft ground, 1 anything else (water, or hard land: a wall, a street)
    const src = new Int16Array(E * E * 2); // where each pixel takes its looks from
    for (let y = 0; y < E; y++)
      for (let x = 0; x < E; x++) {
        const px = x - M;
        const py = y - M;
        // Settled for the block of four this pixel is in, at its top-left: the block moved whole, by whole blocks,
        // so it shows a block of where it is taken from.
        const [bx, by] = [x & ~1, y & ~1];
        const [qx, qy] = [px - (x - bx), py - (y - by)];
        const here = open ? 'w' : base(qx, qy);
        let k = here;
        let [sx, sy] = [px, py];
        if (here !== 'h' && !open) {
          const dx = 2 * Math.round(wander(gx, bx, by) / 2);
          const dy = 2 * Math.round(wander(gy, bx, by) / 2);
          const there = base(qx + dx, qy + dy);
          // Water takes soft ground and soft ground takes water; hard land neither gives nor takes.
          if (there !== 'h' && there !== here) [k, sx, sy] = [there, px + dx, py + dy];
        }
        kind[y * E + x] = k === 'w' ? 1 : 0;
        soft[y * E + x] = k === 's' ? 0 : 1;
        src[(y * E + x) * 2] = sx;
        src[(y * E + x) * 2 + 1] = sy;
      }
    const far = new Float32Array(E * E).fill(R);
    // The shallows and the lines on the water follow a natural shore only: water against a wall, a quay or a street
    // is left plain, as a built edge is straight and the lines along it would frame each square.
    const toLand = open ? far : chamfer(soft, 0);
    const toWater = open ? far : chamfer(kind, 1);

    const groundOf = (sx: number, sy: number): number => {
      const votes = new Map<number, number>();
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const n = sq(sx + dx, sy + dy);
          if (!GROUNDS.has(n)) continue;
          const b = BARE[n] ?? n;
          votes.set(b, (votes.get(b) ?? 0) + (dx && dy ? 1 : 2));
        }
      let best = 0x05;
      let most = 0;
      for (const [t, n] of votes) if (n > most) [best, most] = [t, n];
      return best;
    };
    // A bank's land at (px, py): the ground of the land square nearest it round the bank at (sx, sy), so each side
    // of the bank goes on as the ground beside it does - else the ground most of them show.
    const groundNear = (sx: number, sy: number, px: number, py: number): number => {
      let best = -1;
      let near = Infinity;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const n = sq(sx + dx, sy + dy);
          if (!SOFT.has(n)) continue;
          const x0 = (sx + dx) * N;
          const y0 = (sy + dy) * N;
          const ex = Math.max(x0 - px, 0, px - (x0 + N));
          const ey = Math.max(y0 - py, 0, py - (y0 + N));
          const d = ex * ex + ey * ey;
          if (d < near) [best, near] = [n, d];
        }
      return best < 0 ? groundOf(sx, sy) : carried(best);
    };
    const depthOf = (sx: number, sy: number): number => {
      const t = sq(sx, sy);
      return t === 0x01 ? 2 : t === 0x02 ? 1 : 0;
    };
    const ease = (t: number): number => t * t * (3 - 2 * t);
    /** The sea's depth at a pixel, blended between the squares' centres. */
    const depthAt = (px: number, py: number): number => {
      const fx = px / N - 0.5;
      const fy = py / N - 0.5;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const u = ease(fx - i);
      const v = ease(fy - j);
      return (depthOf(i, j) * (1 - u) + depthOf(i + 1, j) * u) * (1 - v) + (depthOf(i, j + 1) * (1 - u) + depthOf(i + 1, j + 1) * u) * v;
    };
    const glint = noise(seed + 31, 90);
    const glint2 = noise(seed + 32, 36);
    const shelfW = noise(seed + 21, 30);
    const dampW = noise(seed + 22, 30);
    const wig = noise(seed + 25, 20);
    const brk = noise(seed + 26, 8);

    const s: Shore = {
      mode: new Uint8Array(N * N),
      from: new Int16Array(N * N),
      lx: new Uint8Array(N * N),
      ly: new Uint8Array(N * N),
      depth: new Uint8Array(N * N),
      glint: new Uint8Array(N * N),
      shelf: new Uint8Array(N * N),
      mark: new Uint8Array(N * N),
      markA: new Uint8Array(N * N),
      shade: new Uint8Array(N * N),
      sand: new Uint8Array(N * N),
    };
    // The lines on the water, [distance from the shore, strength, half their width]: on the originals' grid, fewer and
    // wider, so each is whole blocks.
    const lines = coarse
      ? [
          [4, 0.6, 2.1],
          [9, 0.3, 2.1],
        ]
      : [
          [2.5, 0.65, 1.1],
          [5.5, 0.4, 1.1],
          [9, 0.22, 1.1],
        ];
    const fringeW = noise(seed + 23, 30);
    const own = sq(0, 0);
    let any = false;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const e = (y + M) * E + x + M;
        const i = y * N + x;
        const px = src[e * 2];
        const py = src[e * 2 + 1];
        const fsx = Math.floor(px / N);
        const fsy = Math.floor(py / N);
        const ft = sq(fsx, fsy);
        const lx = px - fsx * N;
        const ly = py - fsy * N;
        // The block's top-left: its distances, its depth and the world's noises read there, for all four.
        const b = ((y & ~1) + M) * E + (x & ~1) + M;
        const wx = ox0 + (x & ~1);
        const wy = oy0 + (y & ~1);
        if (kind[e]) {
          any = true;
          s.mode[i] = WET;
          s.lx[i] = lx;
          s.ly[i] = ly;
          const river = isRiver(ft);
          s.from[i] = river ? RIVER_WATER : -1;
          if (!river) {
            s.depth[i] = Math.round(depthAt(src[b * 2], src[b * 2 + 1]) * 127.5);
            // The sea's light dimmed in broad patches, out in the world; a town's or an arena's water is left as it is,
            // so it meets the squares of water drawn as tiles (a moat's corners) without a seam.
            s.glint[i] = place.map > 1 ? 255 : Math.round((0.55 + 0.45 * (glint(wx, wy) * 0.6 + glint2(wx, wy) * 0.4)) * 255);
          }
          const d = toLand[b];
          if (d >= R) continue;
          const sw = 3 + shelfW(wx, wy) * 8;
          if (d < sw) s.shelf[i] = Math.round(0.5 * (1 - d / sw) ** 0.8 * 255);
          if (river && groundOf(fsx, fsy) === SWAMP) {
            // The swamp's rivers: a stipple of sand on the bottom, thick at the shore, thinning out.
            const t = d / (sw + 2);
            if (t < 1 && hash(wx, wy, 77) < 0.32 * (1 - t) ** 1.5) [s.mark[i], s.markA[i]] = [1, 191];
          } else {
            // Everywhere else, lines following the shore, wandering and broken, fading out.
            const dd = d + (wig(wx, wy) - 0.5) * 3.6;
            for (const [k, a, w] of lines)
              if (Math.abs(dd - k) < w && brk(wx + k * 13, wy) > 0.3) {
                [s.mark[i], s.markA[i]] = [2, Math.round(a * 255)];
                break;
              }
          }
        } else {
          // The square's own ground where it is still its own; anywhere else, the ground it comes from (a bank's land
          // is the ground round it).
          if (fsx === 0 && fsy === 0 && SOFT.has(own)) s.mode[i] = OWN;
          else {
            any = true;
            s.mode[i] = GROUND;
            s.from[i] = SOFT.has(ft) ? carried(ft) : groundNear(fsx, fsy, px, py);
            s.lx[i] = x;
            s.ly[i] = y;
          }
          const d = toWater[b];
          // The sand fringe on the grass: specks thick at the waterline, thinning inland over two or three of the
          // originals' pixels.
          const ground = s.mode[i] === OWN ? own : s.from[i];
          if (sand && GRASSY.has(ground)) {
            const w = 7 + fringeW(wx, wy) * 4;
            if (d < w && hash(wx, wy, 91) < 0.75 * (1 - d / w) ** 1.1) {
              s.sand[i] = 1 + Math.floor(hash(wx, wy, 92) * sand.length);
              any = true;
            }
          }
          const dd = d < 5 ? 1.5 + dampW(wx, wy) * 3.5 : 0;
          if (d < dd) {
            s.shade[i] = Math.round(0.42 * (1 - d / dd) * 255);
            any = true;
          }
        }
      }
    return any ? s : null;
  }
}

/** Distances (pixels, up to R) from each pixel to the nearest where `kind` is `to`: a 5-7-11 chamfer, two passes. */
function chamfer(kind: Uint8Array, to: number): Float32Array {
  const INF = 1e6;
  const d = new Float32Array(E * E);
  for (let i = 0; i < E * E; i++) d[i] = kind[i] === to ? 0 : INF;
  // The steps already passed, as offsets in the array, and their weights (the pixels two from the edge are left be:
  // the margin is wider than any distance kept).
  const off = [-1, -E, -E - 1, -E + 1, -E - 2, -2 * E - 1, -2 * E + 1, -E + 2];
  const w = [5, 5, 7, 7, 11, 11, 11, 11];
  for (let y = 2; y < E - 2; y++)
    for (let x = 2; x < E - 2; x++) {
      const i = y * E + x;
      let v = d[i];
      for (let k = 0; k < 8; k++) {
        const c = d[i + off[k]] + w[k];
        if (c < v) v = c;
      }
      d[i] = v;
    }
  for (let y = E - 3; y >= 2; y--)
    for (let x = E - 3; x >= 2; x--) {
      const i = y * E + x;
      let v = d[i];
      for (let k = 0; k < 8; k++) {
        const c = d[i - off[k]] + w[k];
        if (c < v) v = c;
      }
      d[i] = v;
    }
  for (let i = 0; i < E * E; i++) d[i] = Math.min(R, d[i] / 5);
  return d;
}
