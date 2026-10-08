/**
 * paint.ts
 *
 * The ground, painted rather than drawn. The ultima3 port's figures are
 * flat and blocky, but its ground is not: water, grass, trees and
 * mountains there are soft, shaded paintings at 64 pixels a tile
 * (art/standard/u3/terrain.png, copied from that project). This is the
 * kit for working in that manner: a canvas of 64 pixels in full colour,
 * the ultima3 grounds to start from, masks and blends, shaded mounds,
 * and the halving that brings a canvas down to the 32 pixels of a tile -
 * which is also what softens its edges. Everything wraps, so a ground
 * meets itself at every edge.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../png.ts';
import { rgba, rng, SIZE, Sprite } from './draw.ts';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../art/standard/u3');

/** The side of a canvas: twice a tile's. */
export const BIG = SIZE * 2;

export type RGB = [number, number, number];

/** A square of colour, three floats a pixel (0 to 255). */
export class Canvas {
  readonly px = new Float32Array(BIG * BIG * 3);

  clone(): Canvas {
    const c = new Canvas();
    c.px.set(this.px);
    return c;
  }

  get(x: number, y: number): RGB {
    const o = ((((y % BIG) + BIG) % BIG) * BIG + (((x % BIG) + BIG) % BIG)) * 3;
    return [this.px[o], this.px[o + 1], this.px[o + 2]];
  }

  set(x: number, y: number, c: RGB): void {
    const o = ((((y % BIG) + BIG) % BIG) * BIG + (((x % BIG) + BIG) % BIG)) * 3;
    this.px[o] = c[0];
    this.px[o + 1] = c[1];
    this.px[o + 2] = c[2];
  }

  /** The colour at a point between pixels. */
  sample(x: number, y: number): RGB {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const u = x - i;
    const v = y - j;
    const [a, b, c, d] = [this.get(i, j), this.get(i + 1, j), this.get(i, j + 1), this.get(i + 1, j + 1)];
    return [0, 1, 2].map((k) => (a[k] * (1 - u) + b[k] * u) * (1 - v) + (c[k] * (1 - u) + d[k] * u) * v) as RGB;
  }

  /** Every pixel through `f`. */
  map(f: (c: RGB, x: number, y: number) => RGB): this {
    for (let y = 0; y < BIG; y++) for (let x = 0; x < BIG; x++) this.set(x, y, f(this.get(x, y), x, y));
    return this;
  }

  /** Moved by (dx, dy), wrapping: the same ground, another part of it. */
  shifted(dx: number, dy: number): Canvas {
    const c = new Canvas();
    for (let y = 0; y < BIG; y++) for (let x = 0; x < BIG; x++) c.set(x + dx, y + dy, this.get(x, y));
    return c;
  }

  /** `top` laid over this where `mask` says (0 none of it, 1 all of it). */
  blend(top: Canvas, mask: Mask): this {
    for (let i = 0; i < BIG * BIG; i++) {
      const m = Math.max(0, Math.min(1, mask[i]));
      for (let k = 0; k < 3; k++) this.px[i * 3 + k] = this.px[i * 3 + k] * (1 - m) + top.px[i * 3 + k] * m;
    }
    return this;
  }

  /** As a tile: the painting itself at full size, and each pixel of the grid of 32 the mean of its four. */
  sprite(): Sprite {
    const big = new Uint32Array(BIG * BIG);
    for (let i = 0; i < BIG * BIG; i++) {
      const [r, g, b] = [0, 1, 2].map((k) => Math.max(0, Math.min(255, Math.round(this.px[i * 3 + k]))));
      big[i] = rgba((r << 16) | (g << 8) | b);
    }
    return fromBig(big);
  }
}

/** A sprite from a painting at full size (ARGB, see-through where its alpha says): the grid of 32 is its pixels averaged by how solid they are. */
export function fromBig(big: Uint32Array): Sprite {
  const s = new Sprite();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sum = [0, 0, 0];
      let cover = 0;
      for (const o of [y * 2 * BIG + x * 2, y * 2 * BIG + x * 2 + 1, (y * 2 + 1) * BIG + x * 2, (y * 2 + 1) * BIG + x * 2 + 1]) {
        const v = big[o];
        const a = v >>> 24;
        sum[0] += ((v >> 16) & 255) * a;
        sum[1] += ((v >> 8) & 255) * a;
        sum[2] += (v & 255) * a;
        cover += a;
      }
      if (cover === 0) continue;
      const [r, g, b] = sum.map((v) => Math.round(v / cover));
      s.px[y * SIZE + x] = rgba((r << 16) | (g << 8) | b, Math.round(cover / 4));
    }
  }
  return s.painted(big);
}

/** How much of something, a pixel: 0 to 1. */
export type Mask = Float32Array;

export function mask(f: (x: number, y: number) => number): Mask {
  const m = new Float32Array(BIG * BIG);
  for (let y = 0; y < BIG; y++) for (let x = 0; x < BIG; x++) m[y * BIG + x] = f(x, y);
  return m;
}

/** A mask softened: each pixel the mean of those within `rad`, wrapping. */
export function blurred(m: Mask, rad: number): Mask {
  const pass = (src: Mask, dx: number, dy: number): Mask => {
    const out = new Float32Array(BIG * BIG);
    for (let y = 0; y < BIG; y++) {
      for (let x = 0; x < BIG; x++) {
        let sum = 0;
        for (let k = -rad; k <= rad; k++) sum += src[((y + k * dy + BIG) % BIG) * BIG + ((x + k * dx + BIG) % BIG)];
        out[y * BIG + x] = sum / (rad * 2 + 1);
      }
    }
    return out;
  };
  return pass(pass(m, 1, 0), 0, 1);
}

export const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const lum = (c: RGB): number => (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;

export const rgb = (c: number): RGB => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];

/** A colour along a run of them, `t` from 0 to 1. */
export function ramp(stops: number[], t: number): RGB {
  const f = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  const [a, b] = [rgb(stops[i]), rgb(stops[i + 1])];
  return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * (f - i)) as RGB;
}

/** Smooth noise over the canvas, 0 to 1, `cells` lumps across, wrapping. */
export function lumps(seed: number, cells: number): (x: number, y: number) => number {
  const r = rng(seed);
  const g = Array.from({ length: cells * cells }, () => r());
  const at = (i: number, j: number): number => g[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
  const ease = (t: number): number => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / BIG) * cells;
    const fy = (y / BIG) * cells;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = ease(fx - i);
    const v = ease(fy - j);
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  };
}

/** A canvas of one colour a pixel, from a function. */
export function painted(f: (x: number, y: number) => RGB): Canvas {
  const c = new Canvas();
  for (let y = 0; y < BIG; y++) for (let x = 0; x < BIG; x++) c.set(x, y, f(x, y));
  return c;
}

// --- The ultima3 grounds ---------------------------------------------------------------------------------

export type Ground =
  | 'water'
  | 'grass'
  | 'brush'
  | 'forest'
  | 'mountains'
  | 'dungeon'
  | 'towne'
  | 'castle'
  | 'field'
  | 'lava'
  | 'moongate'
  | 'brick'
  | 'towne-2'
  | 'castle-2'
  | 'floor';

let atlas: { data: Uint8Array | Uint8ClampedArray; width: number; names: string[] } | null = null;

/** One of the ultima3 port's grounds, as it was painted. */
export function u3Ground(name: Ground): Canvas {
  if (!atlas) {
    const img = decodePng(readFileSync(join(DIR, 'terrain.png')));
    const names = (JSON.parse(readFileSync(join(DIR, 'terrain.json'), 'utf8')) as { tiles: string[] }).tiles;
    atlas = { data: img.data, width: img.width, names };
  }
  const at = atlas.names.indexOf(name);
  if (at < 0) throw new Error(`no ultima3 ground ${name}`);
  const c = new Canvas();
  for (let y = 0; y < BIG; y++) {
    for (let x = 0; x < BIG; x++) {
      const o = (y * atlas.width + at * BIG + x) * 4;
      c.set(x, y, [atlas.data[o], atlas.data[o + 1], atlas.data[o + 2]]);
    }
  }
  return c;
}

/**
 * An ultima3 place (the towne, the castle) cut from the grass it was painted on: every pixel that is that port's
 * grass itself is see-through, so the place stands on the land drawn from the map round it (the art direction's
 * rule 8), where its square was a patch of another grass.
 */
export function u3Cut(name: Ground): Sprite {
  const place = u3Ground(name);
  const grass = u3Ground('grass');
  const big = new Uint32Array(BIG * BIG);
  for (let y = 0; y < BIG; y++) {
    for (let x = 0; x < BIG; x++) {
      const [r, g, b] = place.get(x, y).map((v) => Math.max(0, Math.min(255, Math.round(v))));
      const [gr, gg, gb] = grass.get(x, y).map((v) => Math.max(0, Math.min(255, Math.round(v))));
      big[y * BIG + x] = r === gr && g === gg && b === gb ? 0 : rgba((r << 16) | (g << 8) | b);
    }
  }
  return fromBig(big);
}

// --- Things on the ground ---------------------------------------------------------------------------------

/** A piece cut from a canvas, with how much of each pixel is the thing itself. */
export interface Stamp {
  w: number;
  h: number;
  colour: Float32Array;
  alpha: Float32Array;
}

/**
 * The thing standing at (x, y) on one of the ultima3 grounds - a bush, a
 * tree - cut out: what is bright against the dark grass, and joined to
 * that point.
 */
export function cutOut(c: Canvas, x: number, y: number): Stamp {
  const bright = blurred(
    mask((px, py) => (Math.max(...c.get(px, py)) > 84 ? 1 : 0)),
    1,
  );
  const inside = new Uint8Array(BIG * BIG);
  const todo: [number, number][] = [[x, y]];
  let [x0, y0, x1, y1] = [x, y, x, y];
  while (todo.length) {
    const [px, py] = todo.pop()!;
    if (px < 0 || py < 0 || px >= BIG || py >= BIG || inside[py * BIG + px] || bright[py * BIG + px] < 0.45) continue;
    inside[py * BIG + px] = 1;
    [x0, y0, x1, y1] = [Math.min(x0, px), Math.min(y0, py), Math.max(x1, px), Math.max(y1, py)];
    todo.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const stamp: Stamp = { w, h, colour: new Float32Array(w * h * 3), alpha: new Float32Array(w * h) };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!inside[(y0 + j) * BIG + x0 + i]) continue;
      stamp.alpha[j * w + i] = 1;
      stamp.colour.set(c.get(x0 + i, y0 + j), (j * w + i) * 3);
    }
  }
  return stamp;
}

/** A stamp set down with its foot at (cx, base), `k` of its size, wrapping round the canvas. */
export function stamp(c: Canvas, s: Stamp, cx: number, base: number, k = 1, deepen = 0): void {
  const w = s.w * k;
  const h = s.h * k;
  for (let j = 0; j < Math.ceil(h); j++) {
    for (let i = 0; i < Math.ceil(w); i++) {
      const si = Math.min(s.w - 1, Math.floor(i / k));
      const sj = Math.min(s.h - 1, Math.floor(j / k));
      if (!s.alpha[sj * s.w + si]) continue;
      const o = (sj * s.w + si) * 3;
      // `deepen` darkens a thing toward its foot, which parts it from whatever stands before it.
      const f = 1 - deepen * (j / h) ** 2;
      c.set(Math.round(cx - w / 2) + i, Math.round(base - h) + j, [s.colour[o] * f, s.colour[o + 1] * f, s.colour[o + 2] * f]);
    }
  }
}

/**
 * A mound, lit from the upper left: a hill, a boulder, a dune. `stops`
 * run from its shade to its light.
 */
export function mound(c: Canvas, cx: number, cy: number, rx: number, ry: number, stops: number[], rough = 0, seed = 1): void {
  const n = lumps(seed, 16);
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
    for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const z = Math.sqrt(1 - d);
      // The light is up and to the left, and a little toward the eye.
      const lit = Math.max(0, -dx * 0.5 - dy * 0.62 + z * 0.6);
      const t = lit * 0.95 + (n(x, y) - 0.5) * rough;
      const edge = smoothstep(1, 0.8, d);
      const under = c.get(x, y);
      const over = ramp(stops, t);
      c.set(x, y, [0, 1, 2].map((k) => under[k] * (1 - edge) + over[k] * edge) as RGB);
    }
  }
}

/**
 * A rise in the ground: what is there already, lit on the side toward the
 * light and darkened on the other, so a hill keeps the grass it is made of.
 */
export function rise(c: Canvas, cx: number, cy: number, rx: number, ry: number, strength = 1): void {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
    for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const z = Math.sqrt(1 - d);
      const lit = (-dx * 0.55 - dy * 0.7) * (1 - z * 0.5) + z * 0.25;
      const edge = smoothstep(1, 0.7, d) * strength;
      const [r, g, b] = c.get(x, y);
      // The body of the hill is a lighter green than the flat; its lit side lighter again, its far side dark.
      const k = lit < 0 ? 1 + lit * 0.9 * edge : 1;
      const lift = (16 + Math.max(0, lit) * 85) * edge;
      c.set(x, y, [r * k + lift * 0.45, g * k + lift, b * k + lift * 0.25]);
    }
  }
}

/**
 * A canvas whose edges do not quite meet, mended: near its left and right
 * (or, `upright`, its top and bottom) it fades into itself moved half
 * way across, whose own join lies in the middle, out of the way.
 */
export function mended(c: Canvas, upright = false): Canvas {
  const other = upright ? c.shifted(0, BIG / 2) : c.shifted(BIG / 2, 0);
  return c.clone().blend(
    other,
    mask((x, y) => smoothstep(10, 2, Math.min(upright ? y : x, BIG - 1 - (upright ? y : x)))),
  );
}

/** The shadow a thing throws on the ground to its lower right. */
export function shadow(c: Canvas, cx: number, cy: number, rx: number, ry: number, depth = 0.45): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d > 1) continue;
      const k = 1 - depth * smoothstep(1, 0.3, d);
      c.set(x, y, c.get(x, y).map((v) => v * k) as RGB);
    }
  }
}

/**
 * An upright round thing - a trunk, a post, a cactus, a tower: lit down
 * its left, dark down its right, its top rounded if asked.
 */
export function column(c: Canvas, cx: number, top: number, base: number, half: number, stops: number[], round = true): void {
  for (let y = Math.floor(top); y < base; y++) {
    for (let x = Math.floor(cx - half); x <= cx + half; x++) {
      const u = (x + 0.5 - cx) / half;
      if (Math.abs(u) > 1) continue;
      if (round && y < top + half) {
        const v = (top + half - y - 0.5) / half;
        if (u * u + v * v > 1) continue;
      }
      const z = Math.sqrt(1 - u * u);
      c.set(x, y, ramp(stops, 0.12 - u * 0.5 + z * 0.45));
    }
  }
}

/** A limb from one point to another, thinning as it goes: a bough, a beam, a root. */
export function limb(c: Canvas, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, stops: number[]): void {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, y, w] = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w0 + (w1 - w0) * t];
    for (let py = Math.floor(y - w); py <= y + w; py++) {
      for (let px = Math.floor(x - w); px <= x + w; px++) {
        const [dx, dy] = [(px + 0.5 - x) / w, (py + 0.5 - y) / w];
        if (dx * dx + dy * dy > 1) continue;
        c.set(px, py, ramp(stops, 0.45 - dx * 0.4 - dy * 0.35));
      }
    }
  }
}

/** A hollow in the ground or the rock: dark at its heart, soft at its lip. */
export function hollow(c: Canvas, cx: number, cy: number, rx: number, ry: number): void {
  shadow(c, cx, cy, rx + 3, ry + 3, 0.7);
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d > 1) continue;
      const k = smoothstep(1, 0.55, d);
      c.set(x, y, c.get(x, y).map((v) => v * (1 - k) + 6 * k) as RGB);
    }
  }
}

/**
 * A thing drawn flat, set down on a painted ground: the ground darkens
 * softly beneath it and to its lower right, so it stands there rather
 * than floats.
 */
export function seat(ground: Sprite, thing: Sprite, depth = 0.55): Sprite {
  const at = (x: number, y: number): number => (x >= 0 && y >= 0 && x < SIZE && y < SIZE && thing.px[y * SIZE + x] >>> 24 ? 1 : 0);
  const out = ground.clone();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (at(x, y)) continue;
      let sum = 0;
      for (let dy = -2; dy <= 1; dy++)
        for (let dx = -3; dx <= 1; dx++) sum += at(x + dx, y + dy) * (dx === -3 || dx === 1 || dy === -2 || dy === 1 ? 0.5 : 1);
      if (sum > 0) out.dim(x, y, 1 - depth * Math.min(1, sum / 9));
    }
  }
  // A flat drawing goes onto the painting as the sheet would hold it: edges followed, lit, with its surface.
  if (!thing.big) thing.smooth = true;
  return out.over(thing);
}

/** A canvas as a tile that lets the ground show through it: `thick` says how much of each pixel is the thing (0 to 1). */
export function veil(c: Canvas, thick: (x: number, y: number) => number): Sprite {
  const big = c.sprite().big!;
  for (let y = 0; y < BIG; y++) {
    for (let x = 0; x < BIG; x++)
      big[y * BIG + x] = rgba(big[y * BIG + x] & 0xffffff, Math.round(Math.max(0, Math.min(1, thick(x, y))) * 255));
  }
  return fromBig(big);
}
