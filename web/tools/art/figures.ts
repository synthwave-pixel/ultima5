/**
 * figures.ts
 *
 * Helpers for the figures: recolouring the ultima3 art, scaling it (a
 * child), four frames from two, and the shapes creatures are built from.
 * Every figure ends with the brief's half-black rim.
 */

import { rgba, SIZE, Sprite } from './draw.ts';

/** Recolour exact colours (RGB to RGB). */
export function recolour(s: Sprite, map: Record<number, number>): Sprite {
  const out = s.clone();
  out.map((rgb) => map[rgb] ?? rgb);
  return out;
}

/** Shrink toward the feet (nearest), `k` of full size, centred. */
export function shrink(s: Sprite, k: number): Sprite {
  const out = new Sprite();
  const w = Math.round(SIZE * k);
  const ox = Math.floor((SIZE - w) / 2);
  const oy = SIZE - w;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const v = s.px[Math.floor(y / k) * SIZE + Math.floor(x / k)];
      if (v >>> 24) out.px[(oy + y) * SIZE + ox + x] = v;
    }
  }
  return out;
}

/** Remove any rim a figure already has (pixels of half-black), so it can be rimmed again after changes. */
export function unrim(s: Sprite): Sprite {
  const out = s.clone();
  for (let i = 0; i < out.px.length; i++) {
    const v = out.px[i];
    if (v >>> 24 && v >>> 24 < 255 && (v & 0xffffff) === 0) out.px[i] = 0;
  }
  return out;
}

/** Four animation frames from two (rest, action, rest, action), rimmed. */
export function four(a: Sprite, b: Sprite): Sprite[] {
  const ra = unrim(a).rim();
  const rb = unrim(b).rim();
  return [ra, rb, ra.clone(), rb.clone()];
}

/** A figure moved down by `dy` (a bob), wrapping nothing. */
export function nudge(s: Sprite, dx: number, dy: number): Sprite {
  const out = new Sprite();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = s.px[y * SIZE + x];
      if (!(v >>> 24)) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (tx >= 0 && tx < SIZE && ty >= 0 && ty < SIZE) out.px[ty * SIZE + tx] = v;
    }
  }
  return out;
}

/** Make a figure see-through (a ghost): every pixel at `alpha`. */
export function fade(s: Sprite, alpha: number): Sprite {
  const out = s.clone();
  for (let i = 0; i < out.px.length; i++)
    if (out.px[i] >>> 24) out.px[i] = rgba(out.px[i] & 0xffffff, Math.round(((out.px[i] >>> 24) * alpha) / 255));
  return out;
}
