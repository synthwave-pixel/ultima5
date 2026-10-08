/**
 * ranges.ts
 *
 * The Standard look's mountains, drawn from the map as woods.ts draws the
 * woods (land, in the art direction's terms: painted at the screen's own
 * grain, lit softly, never outlined, and running on from square to square).
 *
 * Out in the world (Britannia, the Underworld), a range is its peaks: planted
 * on spots set by the world's own pixels, two to four to a square, their
 * flanks overlapping from square to square within the range, the high peaks
 * (0x0d) taller and, in Britannia, under snow. A square deep in a range - with
 * hills or mountains on all four sides - stands on dark scree, its edge ragged
 * and feathered where it meets a square without; any other stands on grass,
 * so a range's edges and spurs show the land between their peaks. Below the
 * world the stone is darker and colder, and no snow lies.
 *
 * Close up (a settlement, the combat map), a square of mountain is a few paces
 * of it: a mass of rock, its outcrops joining those of the squares beside it.
 *
 * Each square is worked out once and kept.
 */

import type { Place } from '../game/io.ts';
import { HI } from './framebuffer.ts';
import { Kept, SQUARES_KEPT } from './kept.ts';

const N = 16 * HI;
const GRASS = 0x05;

/** What the ranges are drawn from: the tile sheet's pixels (the grass under a range's edge). */
export interface RangesSheet {
  pixel(cell: number, x: number, y: number): number;
}

const MOUNTAIN = (t: number): boolean => t === 0x0c || t === 0x0d;
/** Hills: grassy knolls (0x0b), and rocky grass (0x0f, knolls and stones). Shrub (0x0e) is the sheet's own square. */
const HILL = (t: number): boolean => t === 0x0b || t === 0x0f;
const HILLY = (t: number): boolean => t === 0x0b || t === 0x0c || t === 0x0d || t === 0x0f;

type RGB = [number, number, number];
const hash = (x: number, y: number, s: number): number =>
  (((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(s, 83492791)) >>> 0) % 10007) / 10007;
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
const rgb = (n: number): RGB => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const lerp = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function ramp(stops: number[], t: number): RGB {
  const k = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(k));
  return lerp(rgb(stops[i]), rgb(stops[i + 1]), k - i);
}
const split = (v: number): RGB => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff];
const pack = ([r, g, b]: RGB): number =>
  (0xff000000 |
    (Math.max(0, Math.min(255, Math.round(b))) << 16) |
    (Math.max(0, Math.min(255, Math.round(g))) << 8) |
    Math.max(0, Math.min(255, Math.round(r)))) >>>
  0;

/** Britannia's stone, warm, and the Underworld's, cold and dark; the snow; the scree. */
const ROCK = [0x1e1814, 0x3a2e26, 0x5a4a3e, 0x7e6a5a, 0xa48c76, 0xc4ae96];
const DEEP_ROCK = [0x121216, 0x24222a, 0x3a3640, 0x544e58, 0x746c76, 0x948a92];
const SNOW = [0x7a8494, 0xb4bcca, 0xe6eaf2];
const SCREE = [0x241d18, 0x362c24, 0x4a3e32];
const DEEP_SCREE = [0x16151a, 0x222028, 0x302c36];

/** Peaks are planted on a grid this far apart (pixels), each moved by up to JITTER. */
const SPACING = 26;
const JITTER = 12;

interface Peak {
  x: number;
  y: number;
  w: number;
  h: number;
  snow: boolean;
  seed: number;
}

export class Ranges {
  private readonly kept = new Kept<Uint32Array>(SQUARES_KEPT);

  constructor(private readonly sheet: RangesSheet) {}

  /** Whether square `place` is a mountain or hills the ranges draw. */
  static drawn(place: Place): boolean {
    return MOUNTAIN(place.around[12]) || HILL(place.around[12]);
  }

  /** Draw square `place` into `out` (N x N): the mountain as land, with nothing standing on it. */
  draw(out: Uint32Array, place: Place, onGround = false): void {
    const key = `${place.map}:${place.x},${place.y}:${place.around.join(',')}:${onGround}`;
    let done = this.kept.get(key);
    if (!done) {
      done = HILL(place.around[12]) ? this.hills(place, onGround ? out : null) : place.map > 1 ? this.outcrop(place) : this.range(place);
      this.kept.set(key, done);
    }
    out.set(done);
  }

  /** Out in the world: peaks on grass or scree. */
  private range(place: Place): Uint32Array {
    const under = place.map === 1;
    const sq = (sx: number, sy: number): number => (Math.abs(sx) > 2 || Math.abs(sy) > 2 ? -1 : place.around[(sy + 2) * 5 + sx + 2]);
    const boxed = (sx: number, sy: number): boolean =>
      MOUNTAIN(sq(sx, sy)) &&
      [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ].every(([dx, dy]) => {
        const t = sq(sx + dx, sy + dy);
        return t < 0 || HILLY(t); // beyond what is known, a range goes on
      });
    const ox = place.x * N;
    const oy = place.y * N;
    const seed = place.map * 1000;
    const out = new Uint32Array(N * N);

    // The ground: grass, and scree deep in the range, feathered at its edge.
    const n = noise(seed + 51, 9);
    const n2 = noise(seed + 52, 3);
    const edge = noise(seed + 53, 7);
    const here = boxed(0, 0);
    const R = 10;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let c = split(this.sheet.pixel(GRASS, x, y));
        if (here) {
          let d = R;
          if (!boxed(-1, 0)) d = Math.min(d, x);
          if (!boxed(1, 0)) d = Math.min(d, N - 1 - x);
          if (!boxed(0, -1)) d = Math.min(d, y);
          if (!boxed(0, 1)) d = Math.min(d, N - 1 - y);
          const a = d >= R ? 1 : Math.max(0, Math.min(1, (d + (edge(ox + x, oy + y) - 0.5) * 12) / R));
          if (a > 0) c = lerp(c, ramp(under ? DEEP_SCREE : SCREE, n(ox + x, oy + y) * 0.7 + n2(x, y) * 0.3), a);
        }
        out[y * N + x] = pack(c);
      }

    // The peaks whose drawing reaches this square, back to front.
    const peaks: Peak[] = [];
    const inRange = (wx: number, wy: number): boolean => MOUNTAIN(sq(Math.floor((wx - ox) / N), Math.floor((wy - oy) / N)));
    for (let j = Math.floor((oy - 8) / SPACING) - 1; j <= Math.floor((oy + N + 90) / SPACING) + 1; j++)
      for (let i = Math.floor((ox - 50) / SPACING) - 1; i <= Math.floor((ox + N + 50) / SPACING) + 1; i++) {
        const sx = i * SPACING + Math.floor(hash(i, j, seed + 11) * JITTER);
        const sy = j * SPACING + Math.floor(hash(i, j, seed + 12) * JITTER);
        if (!inRange(sx, sy)) continue;
        const high = sq(Math.floor((sx - ox) / N), Math.floor((sy - oy) / N)) === 0x0d;
        const r = hash(i, j, seed + 13);
        const [w0, h0] = high ? [52 + r * 10, (under ? 56 : 52) + r * 12] : [42 + r * 12, 34 + r * 10];
        // Its flanks and its top must stand in the range (a little to spare for the rock's roughness): where it will
        // not, a smaller peak is tried, so a narrow spur has its peaks too.
        const m = 5;
        const fits = (w: number, h: number): boolean =>
          inRange(sx - w / 2 - m, sy) && inRange(sx + w / 2 + m, sy) && inRange(sx, sy - h - m);
        const k = [1, 0.8, 0.62].find((f) => fits(w0 * f, h0 * f));
        if (k === undefined) continue;
        const [w, h] = [w0 * k, h0 * k];
        if (sx + w / 2 + 6 < ox || sx - w / 2 - 6 >= ox + N || sy < oy || sy - h >= oy + N) continue;
        peaks.push({ x: sx - ox, y: sy - oy, w, h, snow: high && !under, seed: i * 131 + j });
      }
    peaks.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const k of peaks) this.peak(out, k, under ? DEEP_ROCK : ROCK, under ? DEEP_SCREE[0] : SCREE[0]);
    return out;
  }

  /** A peak in front-three-quarter view, its foot at (x, y) of the square: lit on the left, in shade on the right. */
  private peak(out: Uint32Array, k: Peak, rock: number[], foot: number): void {
    const n = noise(k.seed * 7 + 3, 5);
    const n2 = noise(k.seed * 7 + 4, 11);
    const wl = noise(k.seed * 7 + 5, 6);
    const wr = noise(k.seed * 7 + 6, 6);
    const rid = noise(k.seed * 7 + 8, 8);
    const gully = noise(k.seed * 7 + 9, 4);
    const apexX = k.x + (hash(k.seed, 1, 2) - 0.5) * k.w * 0.25;
    const apexY = k.y - k.h;
    const half = k.w / 2;
    for (let y = Math.max(0, Math.floor(apexY)); y <= Math.min(N - 1, k.y); y++) {
      const t = (y - apexY) / k.h; // 0 at the apex, 1 at the foot
      if (t < 0 || t > 1) continue;
      // The flanks, bowed out into shoulders and broken, so the outline reads as rock, not a cone.
      const bow = Math.pow(t, 0.75);
      const left = apexX - (apexX - (k.x - half)) * bow + (wl(k.x, y) - 0.5) * 9 * t;
      const right = apexX + (k.x + half - apexX) * bow + (wr(k.x, y) - 0.5) * 9 * t;
      const ridge = apexX + (y - apexY) * 0.1 + (rid(k.x, y) - 0.5) * 10 * t;
      for (let x = Math.max(0, Math.floor(left - 3)); x <= Math.min(N - 1, Math.ceil(right + 3)); x++) {
        const rough = (n(x, y) - 0.5) * 3 * Math.min(1, t * 3);
        if (x < left + rough || x > right - rough) continue;
        const lit = x < ridge;
        const g = gully(x, y * 0.25);
        let shade = lit ? 0.66 : 0.26;
        shade += (1 - t) * 0.12 * (lit ? 1 : 0.5);
        shade += (g - 0.5) * 0.26 + (n2(x, y) - 0.5) * 0.16 + (n(x * 2, y * 2) - 0.5) * 0.1;
        let c = ramp(rock, shade);
        if (k.snow && t < 0.5 + (n(x * 3, y) - 0.5) * 0.22 + (g - 0.5) * 0.2) c = ramp(SNOW, lit ? 0.85 + (g - 0.5) * 0.3 : 0.3);
        if (t > 0.8) c = lerp(c, rgb(foot), (t - 0.8) * 2.2); // the foot darkens into the ground
        out[y * N + x] = pack(c);
      }
    }
  }

  /**
   * Hills: knolls of turf, and on rocky hills boulders among them, planted by the world's own pixels and running on
   * from square to square within the hills - a knoll that will not fit is made smaller, never cut at the hills' edge.
   */
  private hills(place: Place, ground: Uint32Array | null): Uint32Array {
    const sq = (sx: number, sy: number): number => (Math.abs(sx) > 2 || Math.abs(sy) > 2 ? -1 : place.around[(sy + 2) * 5 + sx + 2]);
    const ox = place.x * N;
    const oy = place.y * N;
    const seed = place.map * 1000 + 300;
    // The turf is grass - or the ground drawn from the map beneath it, where worn earth or flowers run on into it.
    const out = ground ? ground.slice() : new Uint32Array(N * N);
    if (!ground) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[y * N + x] = this.sheet.pixel(GRASS, x, y);
    const inHills = (wx: number, wy: number): boolean => {
      const t = sq(Math.floor((wx - ox) / N), Math.floor((wy - oy) / N));
      return t < 0 || HILL(t);
    };
    const kindAt = (wx: number, wy: number): number => sq(Math.floor((wx - ox) / N), Math.floor((wy - oy) / N));
    interface Knoll {
      x: number;
      y: number;
      rx: number;
      ry: number;
      rock: boolean;
      seed: number;
    }
    const knolls: Knoll[] = [];
    const plant = (spacing: number, jitter: number, salt: number, rock: boolean): void => {
      for (let j = Math.floor((oy - 30) / spacing) - 1; j <= Math.floor((oy + N + 30) / spacing) + 1; j++)
        for (let i = Math.floor((ox - 30) / spacing) - 1; i <= Math.floor((ox + N + 30) / spacing) + 1; i++) {
          const sx = i * spacing + Math.floor(hash(i, j, seed + salt) * jitter);
          const sy = j * spacing + Math.floor(hash(i, j, seed + salt + 1) * jitter);
          const t = kindAt(sx, sy);
          if (!HILL(t)) continue;
          if (rock && (t === 0x0b || (t === 0x0f && hash(i, j, seed + salt + 2) < 0.5))) continue;
          const r = hash(i, j, seed + salt + 3);
          const [rx0, ry0] = rock ? [7 + r * 4, 5.5 + r * 3] : [21 + r * 6, 11 + r * 3];
          const k = [1, 0.8, 0.62].find((f) => {
            const [rx, ry] = [rx0 * f + 3, ry0 * f + 3];
            return inHills(sx - rx, sy) && inHills(sx + rx, sy) && inHills(sx, sy - ry) && inHills(sx, sy + ry);
          });
          if (k === undefined) continue;
          const [rx, ry] = [rx0 * k, ry0 * k];
          if (sx + rx + 6 < ox || sx - rx - 6 >= ox + N || sy + ry + 6 < oy || sy - ry - 6 >= oy + N) continue;
          knolls.push({ x: sx - ox, y: sy - oy, rx, ry, rock, seed: i * 131 + j + salt });
        }
    };
    plant(30, 12, 11, false);
    plant(24, 14, 21, true);
    knolls.sort((a, b) => a.y + a.ry - (b.y + b.ry) || a.x - b.x);
    // The grass itself, risen: its dark at the hill's foot and back, its lights on the slope that faces the sun.
    const TURF = [0x08140a, 0x10240e, 0x1c3814, 0x2c4e1c, 0x426a28, 0x5a8434];
    const STONE = [0x2a2826, 0x46423e, 0x6a655e, 0x8e877e, 0xb0a89e];
    const leaf = noise(seed + 7, 3);
    for (const k of knolls) {
      const stops = k.rock ? STONE : TURF;
      // Its shadow on the ground, to the lower right.
      for (let y = Math.max(0, Math.floor(k.y)); y <= Math.min(N - 1, Math.ceil(k.y + k.ry * 1.4)); y++)
        for (let x = Math.max(0, Math.floor(k.x - k.rx)); x <= Math.min(N - 1, Math.ceil(k.x + k.rx * 1.35)); x++) {
          const d = ((x - k.x - k.rx * 0.3) / (k.rx * 1.05)) ** 2 + ((y - k.y - k.ry * 0.55) / (k.ry * 0.7)) ** 2;
          if (d < 1) out[y * N + x] = pack(lerp(split(out[y * N + x]), [0, 0, 0], 0.45 * (1 - d)));
        }
      const rough = noise(k.seed * 7 + 3, 4);
      for (let y = Math.max(0, Math.floor(k.y - k.ry - 2)); y <= Math.min(N - 1, Math.ceil(k.y + k.ry + 2)); y++)
        for (let x = Math.max(0, Math.floor(k.x - k.rx - 2)); x <= Math.min(N - 1, Math.ceil(k.x + k.rx + 2)); x++) {
          const dx = (x + 0.5 - k.x) / k.rx;
          const dy = (y + 0.5 - k.y) / k.ry;
          const d2 = (dx * dx + dy * dy) * (1 + (rough(ox + x, oy + y) - 0.5) * (k.rock ? 0.5 : 0.25));
          if (d2 > 1) continue;
          // Lit from the upper left: the dome's face turned that way is the lighter.
          const nz = Math.sqrt(1 - Math.min(1, d2));
          const lit = Math.max(0, -dx * 0.6 - dy * 0.5 + nz * 0.45);
          let t = 0.1 + lit * 0.95 + (leaf(ox + x, oy + y) - 0.5) * (k.rock ? 0.12 : 0.06);
          if (d2 > 0.85) t -= 0.1; // its rim, a little darker, so it stands from the one behind
          let c = ramp(stops, t);
          // The grass's blades show on a hill's turf as on the flat.
          if (!k.rock) {
            const g = split(this.sheet.pixel(GRASS, x, y));
            if (g[1] > 70) c = lerp(c, g, 0.5);
          }
          out[y * N + x] = pack(c);
        }
    }
    return out;
  }

  /** Close up: a mass of rock, its outcrops joining the rock of the mountain squares beside it. */
  private outcrop(place: Place): Uint32Array {
    const sq = (sx: number, sy: number): number => (Math.abs(sx) > 2 || Math.abs(sy) > 2 ? -1 : place.around[(sy + 2) * 5 + sx + 2]);
    const ox = place.x * N;
    const oy = place.y * N;
    const seed = place.map * 1000 + 17;
    const a = noise(seed, 22);
    const b = noise(seed + 1, 9);
    const c = noise(seed + 2, 4);
    const ease = (t: number): number => t * t * (3 - 2 * t);
    /** How much rock there is at a pixel (from this square's top-left): mountain squares blended, and broken up. */
    const mass = (px: number, py: number): number => {
      const fx = px / N - 0.5;
      const fy = py / N - 0.5;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const u = ease(fx - i);
      const v = ease(fy - j);
      const at = (p: number, q: number): number => (MOUNTAIN(sq(p, q)) ? 1 : sq(p, q) < 0 ? 1 : 0);
      const m = (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
      return m + (a(ox + px, oy + py) - 0.5) * 0.5 + (b(ox + px, oy + py) - 0.5) * 0.25;
    };
    const out = new Uint32Array(N * N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const m = mass(x, y);
        let col = split(this.sheet.pixel(GRASS, x, y));
        if (m > 0.55) {
          // The rock's face: its own lumps and cracks (a height of their own), lit where it faces up and to the left.
          const h = (px: number, py: number): number =>
            mass(px, py) + (c(ox + px, oy + py) - 0.5) * 0.35 + (b(ox + px * 2, oy + py * 2) - 0.5) * 0.2;
          const dx = h(x + 1, y) - h(x - 1, y);
          const dy = h(x, y + 1) - h(x, y - 1);
          const lit = Math.max(0, Math.min(1, 0.42 - dx * 5 - dy * 6));
          col = ramp([0x1a1816, 0x302d2a, 0x4a4540, 0x6a635a, 0x8e857a], 0.1 + lit * 0.85);
          if (m < 0.62) col = lerp(col, [8, 7, 6], 0.55); // its foot, in shadow
        } else if (mass(x - 3, y - 4) > 0.55) {
          col = lerp(col, [0, 0, 0], 0.35); // the shadow it casts
        }
        out[y * N + x] = pack(col);
      }
    return out;
  }
}
