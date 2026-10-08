/**
 * stones.ts
 *
 * Stone in the land's manner (the high country's, terrain.ts highCountry): flat colours, a dark outline, the
 * shaded lower right hatched, drawn at 32 a square and doubled. Two things of it, six versions each:
 *   drystone  a wall (0x4d): fieldstones laid in three courses, each course half a stone along from the one
 *             below, dark between them, filling the square; the courses run on into the squares beside and
 *             above, so a wall is one piece
 *   rubble    loose rocks to climb (0x4c): a low heap of stones on whatever ground is round it (see-through
 *             between them), a dark foot beneath
 * Each returns the square at full size (64 x 64, 0xAARRGGBB).
 */

import { rgba, rng, Sprite } from './draw.ts';
import { type RGB } from './paint.ts';

const rgb = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

interface Ink {
  fill: RGB;
  light: RGB;
  hatch: RGB;
  outline: RGB;
}
const grey = (c: RGB): RGB => {
  const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return [l, l, l];
};
const ink = (below: boolean, i: Ink): Ink =>
  below ? { fill: grey(i.fill), light: grey(i.light), hatch: grey(i.hatch), outline: grey(i.outline) } : i;
/**
 * The wall is land (the art direction's rule 3: quiet, so what stands before it is seen at once): a warm fieldstone a
 * shade lighter than the floors, soft-edged - its outline and the gaps between the stones a mid-dark, not black.
 */
const WALL: Ink = { fill: rgb(0x9c968a), light: rgb(0xaca69a), hatch: rgb(0x7e786e), outline: rgb(0x5a554c) };
const GAP = rgb(0x625c52);
/** The rubble is a piece (rules 1, 4 and 6): the grid of sixteen, filling its square, outlined as the figures are. */
const RUBBLE: Ink = { fill: rgb(0x8e887e), light: rgb(0xb8b2a4), hatch: rgb(0x625c52), outline: rgb(0x3a342c) };

/** A square being drawn at `res` pixels a side, null where it is see-through. */
class Grid {
  readonly px: (RGB | null)[];
  constructor(
    readonly res: number,
    readonly wrap: boolean,
  ) {
    this.px = new Array<RGB | null>(res * res).fill(null);
  }
  set(x: number, y: number, c: RGB): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (this.wrap) x = ((x % this.res) + this.res) % this.res;
    if (x >= 0 && y >= 0 && x < this.res && y < this.res) this.px[y * this.res + x] = c;
  }
  get(x: number, y: number): RGB | null {
    return x >= 0 && y >= 0 && x < this.res && y < this.res ? this.px[y * this.res + x] : null;
  }
  /** As a sheet cell (32 a side; the grid of sixteen doubled); `soft` cells a little see-through (a dark foot). */
  sprite(soft?: Set<number>): Sprite {
    const out = new Sprite();
    const k = 32 / this.res;
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const i = Math.floor(y / k) * this.res + Math.floor(x / k);
        const c = this.px[i];
        out.px[y * 32 + x] = c ? rgba((Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]), soft?.has(i) ? 140 : 255) : 0;
      }
    return out;
  }
}

/**
 * A stone: a rounded block at (cx, cy) - its middle - `hw` and `hh` half its width and height, `round` how round (2
 * an ellipse, higher squarer). Outlined; its lower right hatched along the diagonal (`hatch` pixels apart, 0 none);
 * its upper left a shade lighter.
 */
function stone(s: Grid, i: Ink, cx: number, cy: number, hw: number, hh: number, round: number, hatch: number): void {
  const inside = (x: number, y: number): boolean => Math.abs((x + 0.5 - cx) / hw) ** round + Math.abs((y + 0.5 - cy) / hh) ** round <= 1;
  for (let y = Math.floor(cy - hh) - 1; y <= Math.ceil(cy + hh); y++)
    for (let x = Math.floor(cx - hw) - 1; x <= Math.ceil(cx + hw); x++) {
      if (!inside(x, y)) continue;
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) {
        s.set(x, y, i.outline);
        continue;
      }
      const u = (x + 0.5 - cx) / hw;
      const v = (y + 0.5 - cy) / hh;
      const stripe = hatch > 0 && (((x + y) % hatch) + hatch) % hatch === 0;
      s.set(x, y, u + v > 0.5 && stripe ? i.hatch : u + v < -0.7 ? i.light : i.fill);
    }
}

/**
 * A fieldstone wall's square (0x4d), version `v` (0-5); `below` for the Underworld's grey. Rounded stones of uneven
 * size laid in rough courses, each course starting half a stone along from the one below, the gaps between a
 * mid-dark; the courses wrap at the square's sides, so a wall runs on as one piece.
 */
export function drystone(v: number, below = false): Sprite {
  const RES = 32;
  const s = new Grid(RES, true);
  const i = ink(below, WALL);
  const gap = below ? grey(GAP) : GAP;
  for (let k = 0; k < RES * RES; k++) s.px[k] = gap;
  const r = rng(101 + v * 17);
  // Four rough courses of uneven height.
  const courses = [0, 8, 16, 24, 32].map((y, k) => (k === 0 || k === 4 ? y : y + Math.round((r() - 0.5) * 3)));
  for (let c = 0; c < 4; c++) {
    const [top, bottom] = [courses[c], courses[c + 1]];
    let x = (c % 2) * 4 + Math.floor(r() * 4);
    const end = x + RES;
    while (x < end - 3) {
      const len = Math.min(end - x, 6 + Math.floor(r() * 6));
      const hh = (bottom - top) / 2 - 0.4 - r() * 0.8;
      const cy = (top + bottom) / 2 + (r() - 0.5) * 1.2;
      stone(s, i, x + len / 2, cy, len / 2 - 0.4, hh, 2.2 + r() * 1.2, 3);
      x += len;
    }
  }
  // Land, drawn stone by stone: doubled in blocks, never smoothed.
  const out = s.sprite();
  out.blocky = true;
  return out;
}

/**
 * A rubble heap's square (0x4c), version `v` (0-5): a heap of rocks on the grid of sixteen, filling most of its
 * square, back to front, outlined as the figures are; see-through between and round them, a dark foot beneath.
 */
export function rubble(v: number, below = false): Sprite {
  const RES = 16;
  const s = new Grid(RES, false);
  const i = ink(below, RUBBLE);
  const r = rng(301 + v * 23);
  const mx = 8 + (r() - 0.5) * 1.2;
  // Big rounded rocks in three rows, filling some three quarters of the square: one or two on top, two or three
  // below them, a broad base of two or three before.
  const rows: [number, number, number][] = [
    [5.2, 1 + (v % 2), 2.6],
    [8.4, 2 + (v % 3 === 0 ? 1 : 0), 2.9],
    [11.6, 2 + (v % 3 === 1 ? 1 : 0), 3.3],
  ];
  for (const [cy, n, size] of rows) {
    const step = Math.min(size * 1.7, 13.5 / n);
    for (let k = 0; k < n; k++) {
      const cx = mx + (k - (n - 1) / 2) * step + (r() - 0.5) * 0.8;
      // Lit on the upper left and shaded solid on the lower right, as the figures are: the rocks have form; the
      // lines between them softer than the rim that outlines the heap.
      stone(s, i, cx, cy + (r() - 0.5) * 0.6, size * (1 + r() * 0.25), size * (0.8 + r() * 0.2), 2, 1);
    }
  }
  // A dark foot on the ground under the heap.
  const foot = new Set<number>();
  for (let x = Math.round(mx - 7); x <= Math.round(mx + 6); x++) {
    const at = 14 * RES + x;
    if (x >= 0 && x < RES && !s.px[at]) {
      s.px[at] = [0, 0, 0];
      foot.add(at);
    }
  }
  // Outlined as the figures and every piece are (the art direction's rule 6), drawn on the grid of sixteen.
  const out = s.sprite(foot).rim();
  out.blocky = true;
  return out;
}
