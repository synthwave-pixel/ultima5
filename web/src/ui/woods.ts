/**
 * woods.ts
 *
 * The Standard look's woods, planted from the map, as shore.ts draws the
 * shores: trees and bushes stand on spots set by the world's own pixels,
 * and each square's kind says how many of its spots grow something - the
 * deep forest most, the forest a third or so, with grass between, the
 * scrub and the brush a few bushes. The pieces are flat (tools/art
 * terrain.ts): one green, a dark outline and no shading, and here no
 * shadow, so a tree is a shape, as the ultima3 tiles' are, and not a
 * rendered crown. Square for square, a wood is no
 * brighter and no more crowded with crowns than the old tiles were. A
 * crown overhangs the squares beside its own, woods or grass, and every square it reaches draws the same
 * tree whole, so no square's edge cuts one; the floor under the canopy
 * darkens by a blend from square to square, not a square at a time.
 *
 * Each square's woods are worked out once and kept (they do not move).
 */

import type { Place } from '../game/io.ts';
import { HI } from './framebuffer.ts';
import { Kept, SQUARES_KEPT } from './kept.ts';

/** A tile's pixels: its size on the colour page. */
const N = 16 * HI;

/** A piece the woods are planted with: the cell it is on (from its top-left) and its size. */
export interface Piece {
  cell: number;
  w: number;
  h: number;
}

/** What the woods are drawn from: the tile sheet. */
export interface WoodsSheet {
  /** A pixel of a cell (RGBA in memory order). */
  pixel(cell: number, x: number, y: number): number;
  oak: Piece;
  bush: Piece;
}

/** How the woods are planted. */
export interface WoodsStyle {
  /** What each kind of wood grows: the share of spots with a tree, with a bush, and how dark its floor is. */
  kinds: Record<number, { tree: number; bush: number; shade: number }>;
  /** The spots are this far apart (pixels), each moved by up to `jitter` from its place in the grid. */
  spacing: number;
  jitter: number;
  /** A tree's size, as a share of the oak's: the smallest, and how much larger one may be. */
  treeSize: [number, number];
  /**
   * The leaves' brightness: the ultima3 crowns, meant to stand one to a patch of grass, overwhelm a wood when they
   * stand crown to crown; and how much darker they are under the deepest canopy.
   */
  leaf: number;
  leafShade: number;
}

export const WOODS: WoodsStyle = {
  kinds: {
    // As the ultima3 port's tiles stand: three or four trees to a square of forest, a few bushes in the brush,
    // each apart from the next with grass between.
    0x0a: { tree: 0.9, bush: 0.08, shade: 0.6 }, // deep forest
    0x09: { tree: 0.6, bush: 0.2, shade: 0.25 }, // forest
    0x08: { tree: 0.1, bush: 0.7, shade: 0.05 }, // brush
    0x06: { tree: 0, bush: 0.45, shade: 0 }, // scrub
  },
  spacing: 30,
  jitter: 10,
  treeSize: [0.8, 0.2],
  // The pieces carry their own green (tools/art terrain.ts), halfway to the ultima3 port's.
  leaf: 1,
  leafShade: 0.2,
};
/** The kinds of wood (whatever a style grows in them). */
const WOODED = new Set(Object.keys(WOODS.kinds).map(Number));
/** The squares a crown may overhang: woods and grass. Elsewhere (water, hills, a town) a tree stays out. */
const OPEN = new Set([0x05, 0x06, 0x08, 0x09, 0x0a]);
const GRASS = 0x05;

const hash = (x: number, y: number, s: number): number =>
  (((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) >>> 0) % 10007) / 10007;

/** A tree or bush set down: its piece, its foot (square pixels), its size. */
interface Plant {
  piece: Piece;
  x: number;
  y: number;
  k: number;
  /** The floor's darkness at its foot. */
  shade: number;
}

export class Woods {
  private readonly kept = new Kept<Uint32Array>(SQUARES_KEPT);

  constructor(
    private readonly sheet: WoodsSheet,
    private readonly style: WoodsStyle = WOODS,
  ) {}

  /** Whether square `place` is drawn by the woods: woods itself, or grass with woods beside it. */
  static drawn(place: Place): boolean {
    const t = place.around[12];
    if (WOODED.has(t)) return true;
    if (t !== GRASS) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (WOODED.has(place.around[(2 + dy) * 5 + 2 + dx])) return true;
    return false;
  }

  /** Draw square `place`'s woods into `out` (N x N): over the square's own grass, or for woods, over grass. */
  draw(out: Uint32Array, place: Place, onGround = false): void {
    const key = `${place.map}:${place.x},${place.y}:${place.around.join(',')}:${onGround}`;
    let done = this.kept.get(key);
    if (!done) {
      done = this.work(out, place, onGround);
      this.kept.set(key, done);
    }
    out.set(done);
  }

  private work(own: Uint32Array, place: Place, onGround: boolean): Uint32Array {
    const sheet = this.sheet;
    const { kinds, spacing: SPACING, jitter: JITTER, treeSize, leaf: LEAF, leafShade: LEAF_SHADE } = this.style;
    const sq = (sx: number, sy: number): number => (Math.abs(sx) > 2 || Math.abs(sy) > 2 ? -1 : place.around[(sy + 2) * 5 + sx + 2]);
    const seed = place.map * 1000 + 7;
    const ox = place.x * N;
    const oy = place.y * N;

    // The floor's darkness, blended between the squares' centres.
    const shadeOf = (sx: number, sy: number): number => kinds[sq(sx, sy)]?.shade ?? 0;
    const ease = (t: number): number => t * t * (3 - 2 * t);
    const shadeAt = (px: number, py: number): number => {
      const fx = px / N - 0.5;
      const fy = py / N - 0.5;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const u = ease(fx - i);
      const v = ease(fy - j);
      return (shadeOf(i, j) * (1 - u) + shadeOf(i + 1, j) * u) * (1 - v) + (shadeOf(i, j + 1) * (1 - u) + shadeOf(i + 1, j + 1) * u) * v;
    };

    // The ground: a square of woods is grass under its trees (or the ground drawn from the map beneath it, where
    // worn earth or flowers run on into it); a square of grass keeps its own picture.
    const out = new Uint32Array(N * N);
    const woods = !!kinds[sq(0, 0)] && !onGround;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const v = woods ? sheet.pixel(GRASS, x, y) : own[y * N + x];
        out[y * N + x] = scaled(v, 1 - 0.55 * shadeAt(x, y));
      }

    // Every spot whose plant could reach this square, back to front.
    const plants: Plant[] = [];
    const reach = Math.max(sheet.oak.w, sheet.bush.w);
    const i0 = Math.floor((ox - reach) / SPACING) - 1;
    const i1 = Math.floor((ox + N + reach) / SPACING) + 1;
    const j0 = Math.floor((oy - JITTER) / SPACING) - 1;
    const j1 = Math.floor((oy + N + sheet.oak.h) / SPACING) + 1;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const fx = i * SPACING + Math.floor(hash(i, j, seed + 1) * JITTER) - ox;
        const fy = j * SPACING + Math.floor(hash(i, j, seed + 2) * JITTER) - oy;
        const kind = kinds[sq(Math.floor(fx / N), Math.floor(fy / N))];
        if (!kind) continue;
        const u = hash(i, j, seed + 3);
        const tree = u < kind.tree;
        if (!tree && u >= kind.tree + kind.bush) continue;
        const piece = tree ? sheet.oak : sheet.bush;
        const k = tree ? treeSize[0] + hash(i, j, seed + 4) * treeSize[1] : 0.55 + hash(i, j, seed + 4) * 0.2;
        const w = piece.w * k;
        const h = piece.h * k;
        // A crown may only reach into woods or grass: every square under it must be open - under it as drawn, and a
        // pixel beyond, so none stands flush against the water.
        const left = Math.round(fx - w / 2);
        const [x0, x1, y0, y1] = [left - 1, left + Math.ceil(w), fy - h, fy + 2];
        let open = true;
        for (let sy = Math.floor(y0 / N); sy <= Math.floor(y1 / N) && open; sy++)
          for (let sx = Math.floor(x0 / N); sx <= Math.floor(x1 / N) && open; sx++) if (!OPEN.has(sq(sx, sy))) open = false;
        if (!open) continue;
        if (x1 < 0 || x0 >= N || y1 < 0 || y0 >= N) continue;
        plants.push({ piece, x: fx, y: fy, k, shade: shadeAt(fx, fy) });
      }
    plants.sort((a, b) => a.y - b.y || a.x - b.x);

    for (const p of plants) {
      const w = p.piece.w * p.k;
      const h = p.piece.h * p.k;
      // The piece, its foot at (x, y). Under a deep canopy the trunks are dark strokes and the leaves a little dimmer.
      const left = Math.round(p.x - w / 2);
      const top = Math.round(p.y - h);
      for (let j = 0; j < Math.ceil(h); j++) {
        const y = top + j;
        if (y < 0 || y >= N) continue;
        const pj = Math.min(p.piece.h - 1, Math.floor(j / p.k));
        for (let i = 0; i < Math.ceil(w); i++) {
          const x = left + i;
          if (x < 0 || x >= N) continue;
          const v = sheet.pixel(p.piece.cell, Math.min(p.piece.w - 1, Math.floor(i / p.k)), pj);
          if (v >>> 24 < 128) continue;
          const trunk = (v & 0xff) > ((v >> 8) & 0xff);
          out[y * N + x] = scaled(v, (trunk ? 1 - 0.55 * p.shade : 1 - LEAF_SHADE * p.shade) * LEAF);
        }
      }
    }
    return out;
  }
}

/** A colour (RGBA in memory order) with its red, green and blue times `k`, solid. */
function scaled(v: number, k: number): number {
  const r = Math.round((v & 0xff) * k);
  const g = Math.round(((v >> 8) & 0xff) * k);
  const b = Math.round(((v >> 16) & 0xff) * k);
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}
