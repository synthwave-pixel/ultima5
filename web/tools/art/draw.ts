/**
 * draw.ts
 *
 * A small pixel-art toolkit for the Standard tiles: a 32x32 RGBA sprite,
 * the shapes the tiles are built from, sprites written as character grids,
 * seeded noise for textures, and the build steps the brief asks for (the
 * half-black rim round figures, three tones a material).
 */

export const SIZE = 32;
/** A tile as it is written to the sheet: twice that, the ultima3 port's 64 pixels. */
export const FULL = SIZE * 2;

/** A colour as 0xRRGGBB (opaque) or with alpha 0xAARRGGBB given explicitly via rgba(). */
export type Colour = number;

export const rgba = (rgb: number, a = 255): number => ((a << 24) | (rgb & 0xffffff)) >>> 0;
export const CLEAR = 0;

/** Parse '#rrggbb'. */
export const hex = (s: string): number => parseInt(s.replace('#', ''), 16);

/** Mix two RGB colours, t of b. */
export function mix(a: number, b: number, t: number): number {
  const c = (sh: number): number => Math.round(((a >> sh) & 0xff) * (1 - t) + ((b >> sh) & 0xff) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

export const lighten = (c: number, t: number): number => mix(c, 0xffffff, t);
export const darken = (c: number, t: number): number => mix(c, 0x000000, t);

/** A deterministic random source. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

/** One square of pixels laid over another (alpha 0 or 255, else blended), offset by (dx, dy). */
function lay(under: Uint32Array, top: Uint32Array, n: number, dx: number, dy: number): Uint32Array {
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = top[y * n + x];
      const a = v >>> 24;
      if (a === 0) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || tx >= n || ty < 0 || ty >= n) continue;
      if (a === 255) under[ty * n + tx] = v;
      else {
        const base = under[ty * n + tx];
        const ba = base >>> 24;
        const rgb = ba ? mix(base & 0xffffff, v & 0xffffff, a / 255) : v & 0xffffff;
        under[ty * n + tx] = rgba(rgb, Math.max(ba, a));
      }
    }
  }
  return under;
}

/**
 * A tile is drawn on a grid of 32 and written at 64. What is drawn - a
 * figure, a wall, a chair - is simply doubled, each of its pixels four,
 * which is how the ultima3 port shows its figures. What is painted (the
 * ground, paint.ts) is made at the full 64, and a sprite from a painting
 * carries it as `big`: wherever the 32-pixel picture is still as the
 * painting left it, the sheet takes the painting's own four pixels, and
 * wherever something has since been drawn over it, the drawing's.
 */
/** A value in [-1, 1] that changes slowly along `u` and quickly across `v`: streaks. */
function streak(u: number, v: number, seed: number): number {
  const h = (a: number, b: number): number => (((Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ seed) >>> 0) % 1000) / 500 - 1;
  const cell = Math.floor(u / 9);
  const t = u / 9 - cell;
  return h(cell, v) * (1 - t) + h(cell + 1, v) * t;
}

/**
 * What a flat of colour is made of, told by the colour, and the surface that gives it at the sheet's full size:
 * wood has a grain along its length and the odd darker line, cloth a weave, metal and stone a soft sheen. How much
 * lighter (or darker, below 0) the pixel at (x, y) is for it.
 */
function material(v: number, x: number, y: number, along: boolean): number {
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  const sat = hi === 0 ? 0 : (hi - lo) / hi;
  const [u, w] = along ? [x, y] : [y, x];
  if (sat > 0.3 && r > g && g > b && r - b > 50 && g > r * 0.35 && g < r * 0.8) {
    // Wood.
    const s = streak(u, w, 7);
    return s * 0.07 - (streak(u + 40, w, 99) > 0.72 ? 0.09 : 0);
  }
  if (sat > 0.35) return ((x + y) & 1 ? 0.025 : -0.025) + ((x ^ y) & 2 ? 0.012 : -0.012); // cloth
  if (sat < 0.18 && hi > 90) return streak(w, u >> 2, 3) * 0.035; // metal, stone, linen
  return 0;
}

export class Sprite {
  /** ARGB per pixel (alpha in the top byte; 0 is clear). */
  readonly px = new Uint32Array(SIZE * SIZE);
  /** The painting this came from at its full size (FULL x FULL), and `px` as it was then. */
  big: Uint32Array | null = null;
  private base: Uint32Array | null = null;

  /** Take a painting: `big` at full size, `px` already holding it at half. */
  painted(big: Uint32Array): this {
    this.big = big;
    this.base = this.px.slice();
    return this;
  }

  /**
   * Whether what is drawn is doubled with its edges followed (EPX) rather than squared: for furniture and
   * buildings, whose slants and curves gain by it. Figures stay in their blocks, as the ultima3 port's are.
   */
  smooth = false;

  /**
   * Drawn on the grid of sixteen (the art direction's rule 1): simply doubled, whatever its group does with the
   * rest - never smoothed, lit or grained by the build.
   */
  blocky = false;

  /** The tile at full size, as the sheet holds it. */
  full(): Uint32Array {
    const out = new Uint32Array(FULL * FULL);
    const at = (x: number, y: number): number => this.px[Math.max(0, Math.min(SIZE - 1, y)) * SIZE + Math.max(0, Math.min(SIZE - 1, x))];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        const o = y * 2 * FULL + x * 2;
        if (this.big && this.base && this.px[i] === this.base[i]) {
          out[o] = this.big[o];
          out[o + 1] = this.big[o + 1];
          out[o + FULL] = this.big[o + FULL];
          out[o + FULL + 1] = this.big[o + FULL + 1];
          continue;
        }
        const p = this.px[i];
        out[o] = out[o + 1] = out[o + FULL] = out[o + FULL + 1] = p;
        if (!this.smooth) continue;
        const [a, b, c, d] = [at(x, y - 1), at(x + 1, y), at(x - 1, y), at(x, y + 1)];
        if (c === a && c !== d && a !== b) out[o] = a;
        if (a === b && a !== c && b !== d) out[o + 1] = b;
        if (d === c && d !== b && c !== a) out[o + FULL] = c;
        if (b === d && b !== a && d !== c) out[o + FULL + 1] = d;
      }
    }
    return this.smooth ? this.bevelled(out) : out;
  }

  /**
   * What is drawn flat, given the light the painted ground has: along the top and left of every shape a pixel's
   * width is lifted, along its foot and right a pixel's width is shaded, so a table or a tower stands in the same
   * sun as the grass it is on. Only the drawing is touched, not the painting under it.
   */
  private bevelled(full: Uint32Array): Uint32Array {
    const out = full.slice();
    const drawn = (x: number, y: number): boolean => {
      const i = (y >> 1) * SIZE + (x >> 1);
      return !(this.big && this.base && this.px[i] === this.base[i]) && full[y * FULL + x] >>> 24 === 255;
    };
    const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= FULL || y >= FULL ? -1 : full[y * FULL + x]);
    const lum = (v: number): number => ((v >> 16) & 255) * 0.3 + ((v >> 8) & 255) * 0.59 + (v & 255) * 0.11;
    // How far the same colour runs through (x, y) along (dx, dy): a board's grain follows its length.
    const run = (x: number, y: number, dx: number, dy: number): number => {
      const v = full[y * FULL + x];
      let n = 1;
      for (const sign of [1, -1]) for (let d = 1; d <= 16 && at(x + sign * dx * d, y + sign * dy * d) === v; d++) n++;
      return n;
    };
    for (let y = 0; y < FULL; y++) {
      for (let x = 0; x < FULL; x++) {
        if (!drawn(x, y)) continue;
        const v = full[y * FULL + x];
        const l = lum(v);
        if (l < 28) continue; // a drawn line or a dark opening stays as dark as it was
        // An edge is where the next pixel is another colour and not a lighter part of the same thing.
        const edge = (dx: number, dy: number): boolean => {
          const n = at(x + dx, y + dy);
          return n !== -1 && n !== v && (n >>> 24 < 255 || lum(n) < l - 6);
        };
        // And a little grain, so a flat of colour is a surface and not a fill.
        let k = ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000) / 1000 - 0.5;
        k *= 0.07;
        k += material(v, x, y, run(x, y, 1, 0) >= run(x, y, 0, 1));
        // The light falls off from an edge over three pixels, so a top is rounded rather than ruled.
        const near = (dx: number, dy: number): number => {
          for (let d = 1; d <= 3; d++) if (edge(dx * d, dy * d)) return d;
          return 0;
        };
        const shade = Math.min(near(0, 1) || 9, near(1, 0) || 9);
        const lit = Math.min(near(0, -1) || 9, near(-1, 0) || 9);
        if (shade <= 3) k -= [0, 0.2, 0.1, 0.04][shade];
        else if (lit <= 3) k += [0, 0.16, 0.08, 0.03][lit];
        const rgb = k < 0 ? darken(v & 0xffffff, -k) : lighten(v & 0xffffff, k);
        out[y * FULL + x] = rgba(rgb);
      }
    }
    // And what stands on the ground shades it, down and to the right, as the painted trees and hills do theirs.
    for (let y = 0; y < FULL; y++) {
      for (let x = 0; x < FULL; x++) {
        if (drawn(x, y)) continue;
        let d = 1;
        while (d <= 3 && !(x - d >= 0 && y - d >= 0 && drawn(x - d, y - d) && lum(full[(y - d) * FULL + x - d]) >= 28)) d++;
        if (d > 3) continue;
        const k = [0, 0.62, 0.76, 0.88][d];
        const v = full[y * FULL + x];
        if (v >>> 24 === 0) out[y * FULL + x] = rgba(0, Math.round(255 * (1 - k)));
        else out[y * FULL + x] = rgba(darken(v & 0xffffff, 1 - k), v >>> 24);
      }
    }
    return out;
  }

  /**
   * A painted surface (FULL x FULL, a wall's stone, a floor's brick) laid into a rectangle of the grid of 32, at the
   * surface's own place in the tile, so the same surface in the next tile carries on from it.
   */
  texture(x: number, y: number, w: number, h: number, surface: Uint32Array): this {
    const big = this.full();
    for (let yy = Math.max(0, y); yy < Math.min(SIZE, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(SIZE, x + w); xx++) {
        const o = yy * 2 * FULL + xx * 2;
        const sum = [0, 0, 0];
        for (const at of [o, o + 1, o + FULL, o + FULL + 1]) {
          big[at] = surface[at];
          sum[0] += (surface[at] >> 16) & 255;
          sum[1] += (surface[at] >> 8) & 255;
          sum[2] += surface[at] & 255;
        }
        this.px[yy * SIZE + xx] = rgba((Math.round(sum[0] / 4) << 16) | (Math.round(sum[1] / 4) << 8) | Math.round(sum[2] / 4));
      }
    }
    // Whatever was drawn before is part of the picture now, as the surface is.
    return this.painted(big);
  }

  /** One pixel made darker (or lighter) by `k`, the painting under it with it: a shadow falling on the ground. */
  dim(x: number, y: number, k: number): void {
    const f = (v: number): number =>
      rgba((Math.round(((v >> 16) & 255) * k) << 16) | (Math.round(((v >> 8) & 255) * k) << 8) | Math.round((v & 255) * k), v >>> 24);
    const i = y * SIZE + x;
    const unchanged = this.big && this.base && this.px[i] === this.base[i];
    this.px[i] = f(this.px[i]);
    if (unchanged && this.big && this.base) {
      const o = y * 2 * FULL + x * 2;
      for (const at of [o, o + 1, o + FULL, o + FULL + 1]) this.big[at] = f(this.big[at]);
      this.base[i] = this.px[i];
    }
  }

  static filled(c: Colour): Sprite {
    const s = new Sprite();
    s.px.fill(rgba(c));
    return s;
  }

  clone(): Sprite {
    const s = new Sprite();
    s.px.set(this.px);
    s.blocky = this.blocky;
    if (this.big && this.base) {
      s.big = this.big.slice();
      s.base = this.base.slice();
    }
    return s;
  }

  get(x: number, y: number): number {
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE ? this.px[y * SIZE + x] : 0;
  }

  /** Set a pixel (an RGB colour is opaque; pass rgba() for alpha, CLEAR to erase). */
  set(x: number, y: number, c: Colour, alpha = 255): this {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) this.px[y * SIZE + x] = c === CLEAR ? 0 : c > 0xffffff ? c : rgba(c, alpha);
    return this;
  }

  isSet(x: number, y: number): boolean {
    return this.get(x, y) >>> 24 !== 0;
  }

  rect(x: number, y: number, w: number, h: number, c: Colour): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
    return this;
  }

  hline(x1: number, x2: number, y: number, c: Colour): this {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) this.set(x, y, c);
    return this;
  }

  vline(x: number, y1: number, y2: number, c: Colour): this {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) this.set(x, y, c);
    return this;
  }

  line(x1: number, y1: number, x2: number, y2: number, c: Colour): this {
    const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
    for (let i = 0; i <= n; i++) this.set(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, c);
    return this;
  }

  /** A filled ellipse centred on (cx, cy). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Colour): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
    return this;
  }

  /** A filled polygon (even-odd). */
  poly(points: [number, number][], c: Colour): this {
    const ys = points.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const py = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if ((y1 <= py && y2 > py) || (y2 <= py && y1 > py)) xs.push(x1 + ((py - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i] - 0.5); x < xs[i + 1] - 0.5; x++) this.set(x, y, c);
    }
    return this;
  }

  /** Draw another sprite over this one (alpha 0 or 255, else blended), offset by (dx, dy). */
  over(s: Sprite, dx = 0, dy = 0): this {
    // Where either is a painting, the two are laid together at full size too, and that is the painting now.
    const big = this.big || s.big ? lay(this.full(), s.full(), FULL, dx * 2, dy * 2) : null;
    lay(this.px, s.px, SIZE, dx, dy);
    if (big) this.painted(big);
    return this;
  }

  /** Mirrored left to right. */
  flipX(): Sprite {
    return this.moved((x, y, n) => [n - 1 - x, y]);
  }

  flipY(): Sprite {
    return this.moved((x, y, n) => [x, n - 1 - y]);
  }

  /** Turned a quarter clockwise. */
  rotate(): Sprite {
    return this.moved((x, y, n) => [n - 1 - y, x]);
  }

  /** Every pixel sent to where `to` says (in a square of side n), the painting with it. */
  private moved(to: (x: number, y: number, n: number) => [number, number]): Sprite {
    const s = new Sprite();
    const send = (from: Uint32Array, out: Uint32Array, n: number): void => {
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const [tx, ty] = to(x, y, n);
          out[ty * n + tx] = from[y * n + x];
        }
      }
    };
    send(this.px, s.px, SIZE);
    s.blocky = this.blocky;
    if (this.big) {
      const big = new Uint32Array(FULL * FULL);
      send(this.full(), big, FULL);
      s.painted(big);
    }
    return s;
  }

  /** Moved by (dx, dy), wrapping. */
  shift(dx: number, dy: number): Sprite {
    return this.moved((x, y, n) => [(x + (dx * n) / SIZE + n) % n, (y + (dy * n) / SIZE + n) % n]);
  }

  /** Every opaque pixel's colour through `f`. */
  map(f: (rgb: number, x: number, y: number) => number): this {
    for (let i = 0; i < this.px.length; i++) {
      const v = this.px[i];
      if (v >>> 24) this.px[i] = rgba(f(v & 0xffffff, i % SIZE, (i / SIZE) | 0), v >>> 24);
    }
    return this;
  }

  /**
   * The brief's rim: one pixel of half-black on every clear pixel with an
   * opaque neighbour (of the eight), so a figure reads on any ground.
   */
  rim(alpha = 128): this {
    const add: number[] = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (this.isSet(x, y)) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++)
          for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && this.get(x + dx, y + dy) >>> 24 === 255) near = true;
        if (near) add.push(y * SIZE + x);
      }
    }
    for (const i of add) this.px[i] = rgba(0, alpha);
    return this;
  }
}

/**
 * A sprite from rows of characters, each a colour from `key` ('.' and ' '
 * are clear). Rows 16 wide are doubled (the brief's two-pixel grid); rows
 * 32 wide are taken as they are. Placed at (dx, dy) on a fresh sprite.
 */
export function grid(rows: string[], key: Record<string, Colour>, dx = 0, dy = 0): Sprite {
  const s = new Sprite();
  const scale = rows.every((r) => r.length <= 16) ? 2 : 1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = key[ch];
      if (c === undefined) throw new Error(`no colour for '${ch}'`);
      for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) s.set(dx + x * scale + xx, dy + y * scale + yy, c);
    }
  });
  return s;
}

/** Scatter `n` pixels of colour `c` over a sprite (seeded), optionally only where `where` allows. */
export function speckle(s: Sprite, n: number, c: Colour, r: () => number, where?: (x: number, y: number) => boolean, size = 1): void {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * SIZE);
    const y = Math.floor(r() * SIZE);
    if (where && !where(x, y)) continue;
    for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) s.set((x + xx) % SIZE, (y + yy) % SIZE, c);
  }
}

/** Smooth value noise in 0..1, tiling every SIZE pixels at `cells` cells across. */
export function noise(seed: number, cells: number): (x: number, y: number) => number {
  const r = rng(seed);
  const g = Array.from({ length: cells * cells }, () => r());
  const at = (i: number, j: number): number => g[((j + cells) % cells) * cells + ((i + cells) % cells)];
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / SIZE) * cells;
    const fy = (y / SIZE) * cells;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = smooth(fx - i);
    const v = smooth(fy - j);
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  };
}
