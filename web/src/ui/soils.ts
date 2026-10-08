/**
 * soils.ts
 *
 * The swamp, the sand and the lava drawn from the map (the art direction's
 * rule 8): each was a picture per square, and where a fen met the grass or
 * the sand met the grass the two met along the square's side. Here the
 * edge between two kinds of ground wanders by a noise of the world's own,
 * as the waterline does (shore.ts): each pixel's place is pushed about by
 * the noise, and it shows the ground of the square it is pushed into -
 * blended across a few pixels at the edge. The noise is the world's, not
 * the square's, so two squares side by side agree where the edge runs.
 *
 * Grass and its worn earth are one kind here (wear.ts runs between them),
 * and so is what grows on grass - woods, hills, flowers - which has grass
 * beneath it. Water, rock, walls and the rest are no kind: nothing runs
 * into them, and a square beside them keeps its own ground to its side.
 */

import type { Place } from '../game/io.ts';
import { HI } from './framebuffer.ts';
import { Kept, SQUARES_KEPT } from './kept.ts';

/** A tile's pixels: its size on the colour page. */
const N = 16 * HI;
const GRASS = 0x05;
/** The worn earth (wear.ts): grass, as a kind of ground. */
const WORN = new Set([0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x30, 0x31, 0x32, 0x33]);
/** What grows on grass: woods, hills, flowers. */
const ON_GRASS = new Set([0x06, 0x08, 0x09, 0x0a, 0x0b, 0x0e, 0x0f, 0x1e, 0x1f]);
const SWAMP = 0x04;
const SAND = 0x07;
const LAVA = 0x8f;

/** How far the edge wanders from the square's side, and how softly the two grounds meet. */
const REACH = 18;
const FINE = 5;
const SOFT = 3;
/** A 4 by 4 Bayer matrix: the order a block of the grid takes the ground across an edge in. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export interface SoilsSheet {
  /** A pixel of a tile's cell (RGBA in memory order). */
  pixel(tile: number, x: number, y: number): number;
}

/** A tile's kind of ground, or 0 for none (water, rock, walls...). */
function kindOf(t: number): number {
  if (t === GRASS || WORN.has(t) || ON_GRASS.has(t)) return GRASS;
  return t === SWAMP || t === SAND || t === LAVA ? t : 0;
}

/** The tile a square's ground is drawn from, carried into its neighbour: the worn earth its own, grass for what grows on it. */
const groundOf = (t: number): number => (ON_GRASS.has(t) ? GRASS : t);

const hash = (x: number, y: number, s: number): number =>
  (((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) >>> 0) % 10007) / 10007;

/** A smooth noise over the world's pixels, features about `scale` apart, from -1 to 1. */
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
    return ((h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v) * 2 - 1;
  };
}

export class Soils {
  private readonly kept = new Kept<Uint32Array>(SQUARES_KEPT);

  constructor(private readonly sheet: SoilsSheet) {}

  /** Whether square `place` is drawn by the soils: a kind of ground beside another kind. */
  static drawn(place: Place): boolean {
    const own = kindOf(place.around[12]);
    if (!own) return false;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = kindOf(place.around[(2 + dy) * 5 + 2 + dx]);
        if (k && k !== own) return true;
      }
    return false;
  }

  /** Draw square `place`'s ground into `out` (N x N), over what is there: its own ground where it keeps it. */
  /** Everything worked out forgotten: the tiles it is drawn from have changed. */
  forget(): void {
    this.kept.clear();
  }

  draw(out: Uint32Array, place: Place): void {
    const key = `${place.map}:${place.x},${place.y}:${place.around.join(',')}`;
    let done = this.kept.get(key);
    if (!done) {
      done = this.work(out, place);
      this.kept.set(key, done);
    }
    out.set(done);
  }

  private work(own: Uint32Array, place: Place): Uint32Array {
    const out = own.slice();
    const sq = (dx: number, dy: number): number => place.around[(2 + dy) * 5 + 2 + dx];
    const mine = kindOf(sq(0, 0));
    // The ground a neighbour square carries in at (x, y): this square's own, as drawn, where it is the same kind.
    const at = (dx: number, dy: number, x: number, y: number, i: number): number => {
      const t = sq(dx, dy);
      const k = kindOf(t);
      return !k || k === mine ? own[i] : this.sheet.pixel(groundOf(t), x, y);
    };
    const seed = place.map * 1000 + 31;
    const wa = noise(seed + 1, 44);
    const wb = noise(seed + 2, 44);
    const wc = noise(seed + 3, 13);
    const wd = noise(seed + 4, 13);
    const ox = place.x * N;
    const oy = place.y * N;
    // A block of four at a time (the tiles' own grain), its place from its middle: the edges wander in whole pixels
    // of the grid, and where two grounds meet one or the other, dithered, never a colour between.
    for (let y = 0; y < N; y += 2) {
      for (let x = 0; x < N; x += 2) {
        const X = ox + x + 1;
        const Y = oy + y + 1;
        // Where the world's noise pushes this block, and whose square that is.
        const px = x + 1 + wa(X, Y) * REACH + wc(X, Y) * FINE;
        const py = y + 1 + wb(X, Y) * REACH + wd(X, Y) * FINE;
        const dx = Math.max(-1, Math.min(1, Math.floor(px / N)));
        const dy = Math.max(-1, Math.min(1, Math.floor(py / N)));
        const i = y * N + x;
        // Nothing runs out of a square that is no kind of ground, nor into this one past it.
        const into = kindOf(sq(dx, dy)) ? [dx, dy] : [0, 0];
        let v = at(into[0], into[1], x, y, i);
        // At the edge of the square it was pushed into, the ground across that edge, for the share the edge gives it.
        const u = px - into[0] * N;
        const w = py - into[1] * N;
        const edges: [number, number, number][] = [
          [u, into[0] - 1, into[1]],
          [N - u, into[0] + 1, into[1]],
          [w, into[0], into[1] - 1],
          [N - w, into[0], into[1] + 1],
        ];
        let near = edges[0];
        for (const e of edges) if (e[0] < near[0]) near = e;
        const [e, nx, ny] = near;
        if (e < SOFT && Math.abs(nx) <= 1 && Math.abs(ny) <= 1 && kindOf(sq(nx, ny))) {
          const across = at(nx, ny, x, y, i);
          if (across !== v && 0.5 - 0.5 * (Math.max(0, e) / SOFT) > BAYER[((y >> 1) & 3) * 4 + ((x >> 1) & 3)] / 16) v = across;
        }
        out[i] = out[i + 1] = out[i + N] = out[i + N + 1] = v;
      }
    }
    return out;
  }
}
