/**
 * build.ts
 *
 * Draws the Standard tile set and writes it to public/graphics/:
 * standard-tiles.png (64-pixel cells, the 512 tiles in the game's order,
 * 32 to a row, then extra animation frames, the banks' land and the woods' pieces) and standard-tiles.json (the
 * manifest StandardArt reads). Also writes art/standard/contact-*.png,
 * every tile as the game draws it, for looking over. Run:
 *
 *   npm run tiles
 *
 * Nothing here is read from the game's files: the art is drawn in code
 * (and the ultima3 port's figures, art/standard/u3/, where a creature is
 * the same), with the EGA tiles only as a guide to what each tile shows.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, newImage } from '../png.ts';
import { FULL, rgba, SIZE, Sprite } from './draw.ts';
import { P } from './palette.ts';
import { fromBig } from './paint.ts';
import { tiles as terrainTiles } from './sheet-terrain.ts';
import { tiles as placeTiles } from './sheet-places.ts';
import { tiles as roomTiles } from './sheet-rooms.ts';
import { tiles as marvelTiles } from './sheet-marvels.ts';
import { tiles as actorTiles } from './sheet-actors.ts';
import { fittings } from './fittings.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const COLUMNS = 32;

export interface Manifest {
  scroll: Record<string, number>;
  frames: Record<string, number[]>;
  under: Record<string, number>;
  /** A bank's land: the cell whose opaque pixels are where the ground round the square is laid, between the water and the bank. */
  land: Record<string, number>;
  /** Pieces the game sets down itself (the woods' oak and bush): the cell each is on, from its top-left, and its size. */
  pieces: Record<string, { cell: number; w: number; h: number }>;
  /** A tile as it is drawn below the world (the Underworld's grey high country): its cell. */
  below: Record<string, number>;
  /**
   * A tile drawn in several versions (the hill's layouts), one to a square by its place: its cells, the tile's own
   * first; and below the world, all of them.
   */
  variants: Record<string, number[]>;
  variantsBelow: Record<string, number[]>;
  /** Blackthorn's palace's own versions of the castle's squares, where they differ: their cells, frames in turn. */
  palace: Record<string, number[]>;
  /** Modern PC's own versions of tiles it keeps from this set, on the originals' grid: each tile's cell. */
  pc: Record<string, number>;
  clock: number[];
}

/** What each group adds: tiles by number, extra frames, and manifest entries. */
export interface Group {
  tiles: Map<number, Sprite>;
  /** Extra cells for animation, keyed by tile: frames after the tile's own cell. */
  frames?: Map<number, Sprite[]>;
  scroll?: Record<number, number>;
  under?: Record<number, number>;
  /** Where a tile's land is (see Manifest.land), a cell after the tile's own. */
  land?: Map<number, Sprite>;
  /** A tile as it is drawn below the world (see Manifest.below), a cell after the tile's own. */
  below?: Map<number, Sprite>;
  /** A tile's other versions (see Manifest.variants), cells after the tile's own; and its versions below the world. */
  variants?: Map<number, Sprite[]>;
  variantsBelow?: Map<number, Sprite[]>;
  /** Blackthorn's palace's own squares (see Manifest.palace): its frames, cells after the tile's own. */
  palace?: Map<number, Sprite[]>;
  /** Modern PC's own versions of tiles (see Manifest.pc), a cell each after the tile's own. */
  pc?: Map<number, Sprite>;
  /** Tiles that are land whose greens and flecks are made quieter (see quieter). */
  quiet?: number[];
  /** Pieces for the game to set down (see Manifest.pieces). */
  pieces?: Record<string, { sprite: Sprite; w: number; h: number }>;
  clock?: number[];
  /** Its drawing is doubled with its edges followed (furniture, buildings) rather than in blocks (figures). */
  smooth?: boolean;
}

/** A tile not drawn yet: a dark cell with a magenta cross, easy to spot. */
function placeholder(): Sprite {
  const s = Sprite.filled(0x202024);
  s.line(4, 4, 27, 27, 0xff00ff).line(27, 4, 4, 27, 0xff00ff);
  return s;
}

function build(groups: Group[]): { cells: Sprite[]; manifest: Manifest; quiet: Set<number> } {
  const quiet = new Set<number>();
  const cells: Sprite[] = Array.from({ length: 512 }, placeholder);
  const manifest: Manifest = {
    scroll: {},
    frames: {},
    under: {},
    land: {},
    pieces: {},
    below: {},
    variants: {},
    variantsBelow: {},
    palace: {},
    pc: {},
    clock: [],
  };
  for (const g of groups) {
    for (const [t, s] of g.tiles) {
      s.smooth = !s.blocky && (g.smooth ?? false);
      cells[t] = s;
    }
    for (const [t, v] of Object.entries(g.scroll ?? {})) manifest.scroll[t] = v;
    for (const [t, v] of Object.entries(g.under ?? {})) manifest.under[t] = v;
    manifest.clock.push(...(g.clock ?? []));
  }
  for (const g of groups) {
    for (const [t, extra] of g.frames ?? []) {
      const list = [t];
      for (const s of extra) {
        s.smooth = !s.blocky && (g.smooth ?? false);
        list.push(cells.length);
        cells.push(s);
      }
      manifest.frames[t] = list;
    }
    for (const [t, s] of g.land ?? []) {
      manifest.land[t] = cells.length;
      cells.push(s);
    }
    for (const [t, s] of g.below ?? []) {
      manifest.below[t] = cells.length;
      cells.push(s);
    }
    for (const [t, list] of g.variants ?? []) {
      manifest.variants[t] = [t];
      for (const s of list) {
        manifest.variants[t].push(cells.length);
        cells.push(s);
      }
    }
    for (const [t, list] of g.variantsBelow ?? []) {
      manifest.variantsBelow[t] = [];
      for (const s of list) {
        manifest.variantsBelow[t].push(cells.length);
        cells.push(s);
      }
    }
    for (const [t, list] of g.palace ?? []) {
      manifest.palace[t] = [];
      for (const s of list) {
        manifest.palace[t].push(cells.length);
        cells.push(s);
      }
    }
    for (const [t, s] of g.pc ?? []) {
      manifest.pc[t] = cells.length;
      cells.push(s);
    }
    for (const [name, p] of Object.entries(g.pieces ?? {})) {
      manifest.pieces[name] = { cell: cells.length, w: p.w, h: p.h };
      quiet.add(cells.length); // the woods' oak and bush are land, planted
      cells.push(p.sprite);
    }
  }
  for (const g of groups) for (const t of g.quiet ?? []) quiet.add(t);
  return { cells, manifest, quiet };
}

/**
 * The land's greens, quieter (the art direction's land and pieces): the grass's bright specks and the leaves' lights
 * brought down and a little greyed, so that what is green and stands on the land - a snake, a slime, a poisoned
 * member - is seen against it; and the worn earth's bright flecks likewise. Shadows are left as they are, so the
 * land keeps its depth. RGBA as Sprite.full gives it (0xAARRGGBB).
 */
export function quieter(v: number): number {
  const r = (v >> 16) & 255,
    g = (v >> 8) & 255,
    b = v & 255;
  const l = r * 0.3 + g * 0.59 + b * 0.11;
  let out: [number, number, number];
  if (g > r + 8 && g > b + 8) {
    const k = 0.35;
    const scale = l > 40 ? 1 - k * Math.min(1, (l - 40) / 60) : 1;
    const q = (c: number): number => (l + (c - l) * (1 - k * 0.45)) * (1 - k * 0.12) * scale;
    out = [q(r), q(g), q(b)];
  } else if (r > b + 10 && r >= g && l > 70) {
    // A fleck of earth or sand catching the light.
    const scale = 1 - 0.3 * Math.min(1, (l - 70) / 60);
    out = [r * scale, g * scale, b * scale];
  } else return v;
  const [R, G, B] = out.map((c) => Math.max(0, Math.min(255, Math.round(c))));
  return ((v & 0xff000000) | (R << 16) | (G << 8) | B) >>> 0;
}

/**
 * The background tiles, drawn on the grid (the art direction's grain): the land, the floors and the walls - and each
 * one's versions and frames (its cells below the world, its layouts). Each is drawn 32 a side and doubled, so every
 * block of four on the sheet is one colour; the build stops if one is not (onGrid), rather than a thing drawn finer
 * than the grid reaching the sheet unseen.
 */
const GRIDDED = new Set([
  0x05,
  0x06,
  0x08,
  0x09,
  0x0a,
  0x0b,
  0x0c,
  0x0d,
  0x0e,
  0x0f,
  0x1e,
  0x1f,
  ...[0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26],
  ...[0x30, 0x31, 0x32, 0x33],
  0x40,
  0x44,
  0x45,
  0x47,
  0x48,
  0x49,
  0x4a,
  0x4b,
  0x4e,
  0x4f,
  ...[0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57],
  ...[0xd4, 0xd5, 0xd6, 0xd7],
  0xe3,
  0xfe,
]);

/** The cells of the background tiles (GRIDDED): each tile's own, and its frames, versions and cells below the world. */
function griddedCells(manifest: Manifest): Set<number> {
  const out = new Set(GRIDDED);
  const lists = [manifest.frames, manifest.variants, manifest.variantsBelow, manifest.palace];
  for (const t of GRIDDED) {
    if (manifest.below[t] !== undefined) out.add(manifest.below[t]);
    for (const l of lists) for (const c of l[t] ?? []) out.add(c);
  }
  return out;
}

/** Whether a tile's pixels (FULL square) are on the grid: each block of four one colour. */
export function onGrid(full: Uint32Array): boolean {
  for (let y = 0; y < FULL; y += 2)
    for (let x = 0; x < FULL; x += 2) {
      const v = full[y * FULL + x];
      if (full[y * FULL + x + 1] !== v || full[(y + 1) * FULL + x] !== v || full[(y + 1) * FULL + x + 1] !== v) return false;
    }
  return true;
}

function sheet(cells: Sprite[], quiet: Set<number>, gridded: Set<number>): Buffer {
  const off = [...gridded].filter((i) => !onGrid(cells[i].full())).map((i) => i.toString(16));
  if (off.length) throw new Error(`background cells drawn finer than the grid: ${off.join(', ')}`);
  const rows = Math.ceil(cells.length / COLUMNS);
  const img = newImage(COLUMNS * FULL, rows * FULL);
  cells.forEach((s, i) => {
    const ox = (i % COLUMNS) * FULL;
    const oy = Math.floor(i / COLUMNS) * FULL;
    const full = s.full();
    if (quiet.has(i)) for (let k = 0; k < full.length; k++) full[k] = quieter(full[k]);
    for (let y = 0; y < FULL; y++) {
      for (let x = 0; x < FULL; x++) {
        const v = full[y * FULL + x];
        const o = ((oy + y) * img.width + ox + x) * 4;
        img.data[o] = (v >> 16) & 0xff;
        img.data[o + 1] = (v >> 8) & 0xff;
        img.data[o + 2] = v & 0xff;
        img.data[o + 3] = v >>> 24;
      }
    }
  });
  return encodePng(img);
}

/** A ground cut to a bank's land. */
function laid(ground: Sprite, land: Sprite): Sprite {
  const g = ground.full();
  const m = land.full();
  return fromBig(g.map((v, i) => ((v & 0xffffff) | (m[i] & 0xff000000)) >>> 0));
}

/** The tiles as the game shows them (under-tiles beneath, actors over grass), at the size the sheet holds them. */
function contact(cells: Sprite[], manifest: Manifest, from: number, groundTile: number): Buffer {
  const pad = 2;
  const cell = FULL + pad;
  const img = newImage(16 * cell, 16 * cell);
  img.data.fill(40);
  const compose = (t: number): Sprite => {
    const out = Sprite.filled(0);
    const u = manifest.under[t];
    if (u !== undefined) out.over(compose(u));
    else if (t >= 0x100) out.over(compose(groundTile));
    if (manifest.land[t] !== undefined) out.over(laid(compose(groundTile), cells[manifest.land[t]]));
    return out.over(cells[t]);
  };
  for (let k = 0; k < 256; k++) {
    const full = compose(from + k).full();
    const ox = (k % 16) * cell;
    const oy = Math.floor(k / 16) * cell;
    for (let y = 0; y < FULL; y++) {
      for (let x = 0; x < FULL; x++) {
        const v = full[y * FULL + x];
        const o = ((oy + y) * img.width + ox + x) * 4;
        img.data[o] = (v >> 16) & 0xff;
        img.data[o + 1] = (v >> 8) & 0xff;
        img.data[o + 2] = v & 0xff;
        img.data[o + 3] = 255;
      }
    }
  }
  return encodePng(img);
}

// The fittings drawn to the art direction (docs/art-brief.md §0) last, over what they replace.
const { cells, manifest, quiet } = build([terrainTiles(), placeTiles(), roomTiles(), marvelTiles(), actorTiles(), fittings()]);
mkdirSync(join(ROOT, 'public/graphics'), { recursive: true });
writeFileSync(join(ROOT, 'public/graphics/standard-tiles.png'), sheet(cells, quiet, griddedCells(manifest)));
writeFileSync(join(ROOT, 'public/graphics/standard-tiles.json'), JSON.stringify(manifest));
mkdirSync(join(ROOT, 'art/standard'), { recursive: true });
writeFileSync(join(ROOT, 'art/standard/contact-map.png'), contact(cells, manifest, 0, 5));
writeFileSync(join(ROOT, 'art/standard/contact-actors.png'), contact(cells, manifest, 0x100, 5));
// PEEK=e1,e2,140 writes those tiles large to art/standard/peek.png (numbers in hex), as the game composes them.
if (process.env.PEEK) {
  const ids = process.env.PEEK.split(',').map((v) => parseInt(v, 16));
  const scale = 3;
  const cell = FULL * scale + 4;
  const img = newImage(Math.min(ids.length, 8) * cell, Math.ceil(ids.length / 8) * cell);
  img.data.fill(40);
  const compose = (t: number): Sprite => {
    const out = Sprite.filled(0);
    const u = manifest.under[t];
    if (u !== undefined) out.over(compose(u));
    else if (t >= 0x100) out.over(compose(5));
    if (manifest.land[t] !== undefined) out.over(laid(compose(5), cells[manifest.land[t]]));
    return out.over(cells[t]);
  };
  ids.forEach((t, k) => {
    const full = compose(t).full();
    const ox = (k % 8) * cell + 2;
    const oy = Math.floor(k / 8) * cell + 2;
    for (let y = 0; y < FULL * scale; y++) {
      for (let x = 0; x < FULL * scale; x++) {
        const v = full[Math.floor(y / scale) * FULL + Math.floor(x / scale)];
        const o = ((oy + y) * img.width + ox + x) * 4;
        img.data[o] = (v >> 16) & 0xff;
        img.data[o + 1] = (v >> 8) & 0xff;
        img.data[o + 2] = v & 0xff;
        img.data[o + 3] = 255;
      }
    }
  });
  writeFileSync(join(ROOT, 'art/standard/peek.png'), encodePng(img));
}
const drawn = cells.slice(0, 512).filter((s) => !(s.px[4 * SIZE + 4] === rgba(0xff00ff))).length;
console.log(`${drawn} of 512 tiles drawn, ${cells.length - 512} extra frames`);
void P;
