/**
 * wear.ts
 *
 * Worn ground drawn from the map (the art direction's rule 8): the sheet's
 * grass worn toward earth in steps (0x20 to 0x26, and 0x30 to 0x33), each
 * a square of its own, which stopped at the square's edge in a patch. Here
 * a square's wear runs from its centre to its neighbours' centres, eased,
 * and each pixel is the sheet's own two steps of wear on either side of it,
 * dithered - so the ground is the sheet's, drawn afresh nowhere, and on
 * the tiles' own grain: a block of four at a time, each one step or the
 * other (a Bayer pattern by how far between them it lies), never a colour
 * between. Wear runs toward grass and what grows on it (woods, hills:
 * grass beneath), as toward none; toward water, rock or anything else, a
 * square keeps its own. Flowering grass is unworn, and its own picture
 * comes and goes over the grass and earth by the same measure, to its
 * square's centre. Woods and hills are not drawn here: their own picture
 * is kept, the wear beside them running up to them.
 */

import type { Place } from '../game/io.ts';
import { HI } from './framebuffer.ts';
import { Kept } from './kept.ts';

/** A tile's pixels: its size on the colour page. */
const N = 16 * HI;

/** How worn each tile's ground is (sheet-terrain.ts, worn()): grass none. */
const WEAR: Record<number, number> = {
  0x05: 0,
  0x20: 0.12,
  0x21: 0.3,
  0x22: 0.45,
  0x23: 0.55,
  0x24: 0.65,
  0x25: 0.78,
  0x26: 1.01,
  0x30: 0.2,
  0x31: 0.35,
  0x32: 0.5,
  0x33: 0.85,
};
/** What stands on unworn grass: woods, hills. */
const ON_GRASS = new Set([0x06, 0x08, 0x09, 0x0a, 0x0b, 0x0e, 0x0f]);
/**
 * Flowering grass: unworn, and its own picture - which fades into the grass and earth beside it as they fade into
 * one another, rather than stopping at its square's edge.
 */
const FLOWERS = new Set([0x1e, 0x1f]);
/** The steps of wear, least first. */
const STEPS = Object.entries(WEAR)
  .map(([t, w]) => ({ tile: Number(t), w }))
  .sort((a, b) => a.w - b.w);

export interface WearSheet {
  /** A pixel of a tile's cell (RGBA in memory order). */
  pixel(tile: number, x: number, y: number): number;
}

/** The wear of the square (dx, dy) from `place`'s, as the square's own wear `own` meets it. */
function wearAt(place: Place, dx: number, dy: number, own: number): number {
  const t = place.around[(2 + dy) * 5 + 2 + dx];
  return WEAR[t] ?? (ON_GRASS.has(t) || FLOWERS.has(t) ? 0 : own);
}

/** The flowers of the square (dx, dy) from `place`'s (0 none), as the square's own `own` meets them. */
function bloomAt(place: Place, dx: number, dy: number, own: number): number {
  const t = place.around[(2 + dy) * 5 + 2 + dx];
  if (FLOWERS.has(t)) return t;
  return WEAR[t] !== undefined || ON_GRASS.has(t) ? 0 : own;
}

/**
 * A square's own wear and flowers, where it is ground that wears; undefined where it is not - nor woods and hills,
 * whose picture is their own (drawn here, it was the ground alone, and the trees and hills were lost beside a path).
 */
function ownOf(t: number): { wear: number; bloom: number } | undefined {
  if (WEAR[t] !== undefined) return { wear: WEAR[t], bloom: 0 };
  if (FLOWERS.has(t)) return { wear: 0, bloom: t };
  return undefined;
}

/** A 4 by 4 Bayer matrix, 0 to 15: the order a block's share is dithered in. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** The dither threshold (0 to 1) of the grid's block (bx, by). */
const threshold = (bx: number, by: number): number => (BAYER[(by & 3) * 4 + (bx & 3)] + 0.5) / 16;

const ease = (t: number): number => t * t * (3 - 2 * t);

export class Wear {
  /** Squares drawn, by the wear round them: a handful of patterns cover a map. */
  private readonly kept = new Kept<Uint32Array>(256);

  constructor(private readonly sheet: WearSheet) {}

  /** Whether square `place` is drawn by the wear: ground that wears, beside ground worn otherwise. */
  static drawn(place: Place): boolean {
    const own = ownOf(place.around[12]);
    if (!own) return false;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (wearAt(place, dx, dy, own.wear) !== own.wear || bloomAt(place, dx, dy, own.bloom) !== own.bloom) return true;
    return false;
  }

  /** Draw square `place`'s ground into `out` (N x N). */
  /** Everything worked out forgotten: the tiles it is drawn from have changed. */
  forget(): void {
    this.kept.clear();
  }

  draw(out: Uint32Array, place: Place): void {
    const own = ownOf(place.around[12]) ?? { wear: 0, bloom: 0 };
    const ws: number[] = [];
    const bs: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        ws.push(wearAt(place, dx, dy, own.wear));
        bs.push(bloomAt(place, dx, dy, own.bloom));
      }
    const key = `${ws.join(',')}/${bs.join(',')}`;
    let done = this.kept.get(key);
    if (!done) {
      done = this.work(ws, bs);
      this.kept.set(key, done);
    }
    out.set(done);
  }

  private work(ws: number[], bs: number[]): Uint32Array {
    const out = new Uint32Array(N * N);
    const w = (i: number, j: number): number => ws[(j + 1) * 3 + i + 1];
    const b = (i: number, j: number): number => bs[(j + 1) * 3 + i + 1];
    // A block of four at a time (the grid), its value from its middle.
    for (let y = 0; y < N; y += 2) {
      const fy = (y + 1) / N - 0.5;
      const j = Math.floor(fy);
      const v = ease(fy - j);
      for (let x = 0; x < N; x += 2) {
        const fx = (x + 1) / N - 0.5;
        const i = Math.floor(fx);
        const u = ease(fx - i);
        const cut = threshold(x >> 1, y >> 1);
        const at = (w(i, j) * (1 - u) + w(i + 1, j) * u) * (1 - v) + (w(i, j + 1) * (1 - u) + w(i + 1, j + 1) * u) * v;
        // The grass and earth; over it the flowers of whichever corner's square is most this block's, dithered by
        // how much of it the flowers' squares have.
        let px = this.worn(at, x, y, cut);
        const corners: [number, number][] = [
          [b(i, j), (1 - u) * (1 - v)],
          [b(i + 1, j), u * (1 - v)],
          [b(i, j + 1), (1 - u) * v],
          [b(i + 1, j + 1), u * v],
        ];
        let bloom = 0;
        let most = 0;
        let share = 0;
        for (const [t, f] of corners) {
          if (!t) continue;
          share += f;
          if (f > most) [bloom, most] = [t, f];
        }
        if (bloom && share > cut) px = this.sheet.pixel(bloom, x, y);
        out[y * N + x] = out[y * N + x + 1] = out[(y + 1) * N + x] = out[(y + 1) * N + x + 1] = px;
      }
    }
    return out;
  }

  /** The sheet's ground at (x, y) worn `w`: one or other of the two steps either side of it, by the block's `cut`. */
  private worn(w: number, x: number, y: number, cut: number): number {
    let k = 0;
    while (k < STEPS.length - 2 && STEPS[k + 1].w < w) k++;
    const a = STEPS[k];
    const b = STEPS[k + 1];
    const t = Math.max(0, Math.min(1, (w - a.w) / (b.w - a.w)));
    return this.sheet.pixel(t > cut ? b.tile : a.tile, x, y);
  }
}
