/**
 * interiorMap.ts
 *
 * The maps of the places the party goes inside: a level of a town, keep
 * or castle drawn square by square from the tiles standing there, and a
 * dungeon's level as the Enhanced map draws it (dungeonMap.ts): in the
 * look's own tiles, its passages unrolled from where the party stands, a
 * level that loops going on round it. Only what has been seen is drawn;
 * the rest is the dark it was before the party walked in.
 */

import { readTownLevel, TOWN_SIZE, type Location } from '../data/maps.ts';
import { EGA_PALETTE as EGA } from '../data/tiles.ts';
import type { Game } from '../game/game.ts';
import { levelCells, unrolled } from '../game/dungeonMap.ts';
import { cellLook, kindOf } from '../game/ultima5DungeonMap.ts';
import { tinted } from './colours.ts';
import type { StandardArt } from './standardArt.ts';

/** Both maps are drawn this many pixels square, as the world's are. */
export const INTERIOR_PIXELS = 512;
const TOWN_CELL = INTERIOR_PIXELS / TOWN_SIZE; // 16
const DUNGEON_CELLS = 8;

const DARK = 0xff0a0a0a;

/** One square of a settlement, from the tile art in use: the Standard cell halved, or the game's own tile. */
function tileBlock(tiles: Uint8Array, art: StandardArt | null, tile: number, out: Uint32Array, ox: number, oy: number): void {
  const figure = art?.figure(tile);
  const cell = figure ? Math.round(Math.sqrt(figure.length)) : 0;
  for (let y = 0; y < TOWN_CELL; y++) {
    for (let x = 0; x < TOWN_CELL; x++) {
      let v = DARK;
      if (figure) {
        // The 32-pixel cell at half its size: the four pixels of each block averaged.
        const sx = Math.floor((x * cell) / TOWN_CELL);
        const sy = Math.floor((y * cell) / TOWN_CELL);
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = 0; dy < cell / TOWN_CELL; dy++) {
          for (let dx = 0; dx < cell / TOWN_CELL; dx++) {
            const px = figure[(sy + dy) * cell + sx + dx];
            if (px >>> 24 < 128) continue;
            r += px & 0xff;
            g += (px >> 8) & 0xff;
            b += (px >> 16) & 0xff;
            n++;
          }
        }
        if (n) v = (0xff000000 | (Math.round(b / n) << 16) | (Math.round(g / n) << 8) | Math.round(r / n)) >>> 0;
      } else {
        const byte = tiles[tile * 128 + y * 8 + (x >> 1)];
        const rgb = EGA[x & 1 ? byte & 15 : byte >> 4];
        v = (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16)) >>> 0;
      }
      out[(oy + y) * INTERIOR_PIXELS + ox + x] = v;
    }
  }
}

/** A level of a settlement: every square the party has seen of it, the rest dark; the party's mark where `lit` (it blinks). */
export function townPicture(g: Game, loc: Location, level: number, tiles: Uint8Array, art: StandardArt | null, lit = true): Uint32Array {
  const px = new Uint32Array(INTERIOR_PIXELS * INTERIOR_PIXELS).fill(DARK);
  const seen = g.fog.placeSeen(loc.id, level);
  if (!seen) return px;
  const map = readTownLevel(g.data.files, loc, level);
  for (let y = 0; y < TOWN_SIZE; y++) {
    for (let x = 0; x < TOWN_SIZE; x++) {
      if (!seen[y * TOWN_SIZE + x]) continue;
      tileBlock(tiles, art, map.tiles[y * TOWN_SIZE + x], px, x * TOWN_CELL, y * TOWN_CELL);
    }
  }
  markParty(px, g.s.x * TOWN_CELL + TOWN_CELL / 2, g.s.y * TOWN_CELL + TOWN_CELL / 2, lit && g.s.mapId === loc.id && g.s.level === level);
  return px;
}

/** What a dungeon cell is, by the high nibble the original keeps it in (u5d dungeon.c). */
export type CellKind = 'wall' | 'floor' | 'up' | 'down' | 'updown' | 'trap' | 'fountain' | 'pit' | 'treasure' | 'room' | 'door' | 'rubble';

export function cellKind(cell: number): CellKind {
  switch (cell & 0xf0) {
    case 0x00:
      return 'floor';
    case 0x10:
      return 'up';
    case 0x20:
      return 'down';
    case 0x30:
      return 'updown';
    case 0x40:
      return 'trap';
    case 0x50:
      return 'fountain';
    case 0x60:
      return 'pit';
    case 0x70:
      return 'treasure';
    case 0x80:
    case 0x90:
      return 'room';
    case 0xa0:
    case 0xe0:
    case 0xf0:
      return 'door';
    case 0xc0:
      return 'rubble';
    default:
      // A wall, and a door still hidden in one: the map keeps the secret until it is found.
      return 'wall';
  }
}

/** The name the port gives each sort of cell, for the line printed when one is chosen. */
export const CELL_NAMES: Record<CellKind, string> = {
  wall: 'Rock',
  floor: 'A passage',
  up: 'A ladder up',
  down: 'A ladder down',
  updown: 'Ladders up and down',
  trap: 'A passage',
  fountain: 'A fountain',
  pit: 'A pit',
  treasure: 'Treasure',
  room: 'A room',
  door: 'A door',
  rubble: 'A caved in passage',
};

/**
 * Tile `tile` drawn `size` pixels square at (ox, oy) of `out` (INTERIOR_PIXELS wide): the look's own (`art`), else the
 * game's own (`tiles`), nearest - in `tint` where given (Remastered's dungeon light), clear pixels left as they were.
 */
function drawTile(
  tiles: Uint8Array,
  art: StandardArt | null,
  tile: number,
  out: Uint32Array,
  ox: number,
  oy: number,
  size: number,
  tint?: number,
): void {
  const figure = art?.figure(tile);
  const side = figure ? Math.round(Math.sqrt(figure.length)) : 16;
  for (let y = 0; y < size; y++) {
    const ty = oy + y;
    if (ty < 0 || ty >= INTERIOR_PIXELS) continue;
    const sy = Math.floor(((y + 0.5) * side) / size);
    for (let x = 0; x < size; x++) {
      const tx = ox + x;
      if (tx < 0 || tx >= INTERIOR_PIXELS) continue;
      const sx = Math.floor(((x + 0.5) * side) / size);
      let v: number;
      if (figure) {
        v = figure[sy * side + sx];
        if (v >>> 24 < 128) continue;
      } else {
        const byte = tiles[tile * 128 + sy * 8 + (sx >> 1)];
        const rgb = EGA[sx & 1 ? byte & 15 : byte >> 4];
        v = (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16)) >>> 0;
      }
      if (tint !== undefined) {
        const rgb = tinted(((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff), tint);
        v = (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff)) >>> 0;
      }
      out[ty * INTERIOR_PIXELS + tx] = v;
    }
  }
}

/** A box of EGA colour `c` (0-15) `size` pixels square, centred on (cx, cy). */
function box(out: Uint32Array, cx: number, cy: number, size: number, c: number): void {
  const rgb = EGA[c & 15];
  fillRect(out, cx - (size >> 1), cy - (size >> 1), size, size, (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16)) >>> 0);
}

function fillRect(px: Uint32Array, x0: number, y0: number, w: number, h: number, v: number): void {
  for (let y = y0; y < y0 + h; y++) {
    if (y < 0 || y >= INTERIOR_PIXELS) continue;
    px.fill(v, y * INTERIOR_PIXELS + Math.max(0, x0), y * INTERIOR_PIXELS + Math.min(INTERIOR_PIXELS, x0 + w));
  }
}

/**
 * A dungeon level, as the Enhanced map draws it (dungeonMap.ts cellLook, levelCells): the cells the party has seen in
 * the look's tiles (`art`, else the game's own `tiles`) - where the party is on it, its passages unrolled from where
 * it stands and the party's mark in the middle, steady, as many cells out as they reach (seven, on a level that loops,
 * round and round); else the level's own eight by eight.
 */
export function dungeonPicture(g: Game, mapId: number, level: number, tiles: Uint8Array, art: StandardArt | null): Uint32Array {
  const px = new Uint32Array(INTERIOR_PIXELS * INTERIOR_PIXELS).fill(DARK);
  const seen = g.fog.placeSeen(mapId, level);
  if (!seen) return px;
  const here = g.s.mapId === mapId && g.s.level === level;
  const cellAt = (x: number, y: number): number => g.s.dungeon[level * 0x40 + (y & 7) * 8 + (x & 7)];
  let cells: { i: number; j: number; x: number; y: number }[];
  let r: number;
  if (here) {
    cells = levelCells(g, seen, 12);
    r = unrolled(g) ? Math.max(4, ...cells.map((c) => Math.max(Math.abs(c.i), Math.abs(c.j)))) : 7;
    cells = cells.filter((c) => Math.abs(c.i) <= r && Math.abs(c.j) <= r);
  } else {
    // Another level, or the party elsewhere: the level's grid as it lies.
    r = 4;
    cells = [];
    for (let y = 0; y < DUNGEON_CELLS; y++)
      for (let x = 0; x < DUNGEON_CELLS; x++) if (seen[y * DUNGEON_CELLS + x]) cells.push({ i: x - 4, j: y - 4, x, y });
  }
  const size = Math.floor(INTERIOR_PIXELS / (r * 2 + 1));
  const at = (INTERIOR_PIXELS - size * (r * 2 + 1)) >> 1;
  for (const { i, j, x, y } of cells) {
    const [ox, oy] = [at + (i + r) * size, at + (j + r) * size];
    const cell = cellAt(x, y);
    const look = cellLook(g, kindOf(cell), cell);
    for (const t of look.tiles) drawTile(tiles, art, t.tile, px, ox, oy, size, t.tint);
    if (look.box !== undefined) box(px, ox + (size >> 1), oy + (size >> 1), Math.max(2, Math.round((size * 2) / 5)), look.box);
  }
  if (here) markParty(px, at + r * size + (size >> 1), at + r * size + (size >> 1), true, size);
  return px;
}

/** Where the party stands, if it is on this map: a white square about a red heart, a quarter of `cell` across. */
function markParty(px: Uint32Array, cx: number, cy: number, here: boolean, cell = 32): void {
  if (!here) return;
  const [outer, inner] = [Math.max(8, cell >> 2), Math.max(4, cell >> 3)];
  fillRect(px, cx - (outer >> 1), cy - (outer >> 1), outer, outer, 0xfffefefe);
  fillRect(px, cx - (inner >> 1), cy - (inner >> 1), inner, inner, 0xff5050ff);
}
