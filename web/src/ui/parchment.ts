/**
 * parchment.ts
 *
 * The map the party set out with: Britannia's coasts drawn in ink on
 * paper, made at run time from the player's own BRIT.DAT. It says where
 * the land is and marks what the mapmaker knew was there, and nothing
 * else - no forests, no roads, no names. What the party sees for itself
 * is painted over it (mapView), and the Underworld has no such map at
 * all: down there the dark is the map until it is walked.
 */

import { WORLD_SIZE } from '../data/maps.ts';

/** Two map pixels a square. */
export const MAP_SCALE = 2;
export const MAP_PIXELS = WORLD_SIZE * MAP_SCALE;

/** Ink, and the paper at its lightest. */
export const INK: [number, number, number] = [74, 53, 36];
export const PAPER: [number, number, number] = [226, 203, 160];

/**
 * Value noise over a few octaves: paper grain, the wobble of a drawn line, an old stain. Asked with a `period` (how
 * many units the whole map is, at the coarsest octave), it repeats across the map's edges, so the paper joins where
 * the world wraps (mapView.ts).
 */
function noise(seed: number): (x: number, y: number, period?: number) => number {
  const at = (x: number, y: number): number => {
    let h = (x * 374761393 + y * 668265263 + seed * 69069) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  };
  const smooth = (x: number, y: number, p: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = (c: number): number => (p ? ((c % p) + p) % p : c);
    const [x0, x1, y0, y1] = [w(xi), w(xi + 1), w(yi), w(yi + 1)];
    return at(x0, y0) * (1 - u) * (1 - v) + at(x1, y0) * u * (1 - v) + at(x0, y1) * (1 - u) * v + at(x1, y1) * u * v;
  };
  return (x, y, period = 0) => {
    let sum = 0;
    let amp = 1;
    let f = 1;
    let total = 0;
    for (let o = 0; o < 4; o++) {
      sum += smooth(x * f, y * f, period * f) * amp;
      total += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / total;
  };
}

/**
 * The drawn map of a world as RGBA in memory order, MAP_PIXELS square.
 * Deep water and shallows are the sea; everything else is land.
 */
export function drawParchment(map: Uint8Array): Uint32Array {
  const n = MAP_PIXELS;
  const out = new Uint32Array(n * n);
  const grain = noise(7);
  const stain = noise(19);
  const wobble = noise(31);
  const sea = (x: number, y: number): boolean => {
    const t = map[y * WORLD_SIZE + x];
    return t >= 1 && t <= 3;
  };
  // The world wraps, and so does its paper: every pattern on it repeats a whole number of times across the map.
  const clamp = (v: number): number => ((v % WORLD_SIZE) + WORLD_SIZE) % WORLD_SIZE;
  /** Noise at about `size` pixels a unit, the size nudged so the map is a whole number of units across. */
  const at = (field: ReturnType<typeof noise>, size: number, x: number, y: number): number => {
    const units = Math.max(1, Math.round(n / size));
    return field((x * units) / n, (y * units) / n, units);
  };
  /** The hatching's lines: about 22 pixels apart along the diagonal, a whole number of them across the map. */
  const lines = (2 * Math.PI * Math.round(n / (2 * Math.PI * 3.5))) / n;
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      // The square this pixel asks about, nudged so a coast is drawn rather than stepped.
      const wx = clamp(Math.round(px / MAP_SCALE + (at(wobble, 9, px, py) - 0.5) * 2.2));
      const wy = clamp(Math.round(py / MAP_SCALE + (at(wobble, 9, py + 360, px) - 0.5) * 2.2));
      const water = sea(wx, wy);
      const g = at(grain, 6, px, py) * 0.5 + at(grain, 40, px, py) * 0.5;
      const old = at(stain, 70, px, py);
      let r = PAPER[0] - g * 26 - old * 26;
      let gr = PAPER[1] - g * 30 - old * 30;
      let b = PAPER[2] - g * 34 - old * 22;
      if (water) {
        // A wash over the sea, and the hatching a mapmaker fills it with.
        const hatch = Math.sin((px + py) * lines + at(wobble, 30, px, py) * 6) > 0.86 ? 10 : 0;
        r -= 26 + hatch;
        gr -= 10 + hatch;
        b += 10 - hatch;
      } else {
        r -= 6;
        gr -= 2;
        b -= 10;
      }
      let edge = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (sea(clamp(wx + dx), clamp(wy + dy)) !== water) edge = true;
      }
      if (edge) {
        const ink = 0.55 + at(wobble, 5, px, py) * 0.35;
        r = r * (1 - ink) + INK[0] * ink;
        gr = gr * (1 - ink) + INK[1] * ink;
        b = b * (1 - ink) + INK[2] * ink;
      }
      out[py * n + px] =
        (0xff000000 |
          (Math.max(0, Math.min(255, Math.round(b))) << 16) |
          (Math.max(0, Math.min(255, Math.round(gr))) << 8) |
          Math.max(0, Math.min(255, Math.round(r)))) >>>
        0;
    }
  }
  return out;
}
