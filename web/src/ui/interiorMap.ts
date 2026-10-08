/**
 * interiorMap.ts
 *
 * The maps of the places the party goes inside: a level of a town, keep
 * or castle drawn square by square from the tiles standing there, and a
 * dungeon's level drawn as the eight by eight grid of cells the original
 * keeps it in - a passage, a ladder, a door, a fountain, a pit, a room -
 * each in its own mark. Only what has been seen is drawn; the rest is
 * the dark it was before the party walked in.
 */

import { readTownLevel, TOWN_SIZE, type Location } from '../data/maps.ts';
import { EGA_PALETTE as EGA } from '../data/tiles.ts';
import type { Game } from '../game/game.ts';
import type { StandardArt } from './standardArt.ts';

/** Both maps are drawn this many pixels square, as the world's are. */
export const INTERIOR_PIXELS = 512;
const TOWN_CELL = INTERIOR_PIXELS / TOWN_SIZE; // 16
const DUNGEON_CELLS = 8;
const DUNGEON_CELL = INTERIOR_PIXELS / DUNGEON_CELLS; // 64

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

const COLOURS: Record<CellKind, [number, number]> = {
  // fill, mark
  wall: [0xff181818, 0xff181818],
  floor: [0xff4a4238, 0xff8a7c6a],
  up: [0xff4a4238, 0xfff0e0a0],
  down: [0xff4a4238, 0xfff0e0a0],
  updown: [0xff4a4238, 0xfff0e0a0],
  trap: [0xff4a4238, 0xff8a7c6a],
  fountain: [0xff4a4238, 0xff70c8f0],
  pit: [0xff332c26, 0xff101010],
  treasure: [0xff4a4238, 0xff60d8f8],
  room: [0xff56463a, 0xffc09050],
  door: [0xff4a4238, 0xff9a7040],
  rubble: [0xff3a332c, 0xff6a6460],
};

function fillRect(px: Uint32Array, x0: number, y0: number, w: number, h: number, v: number): void {
  for (let y = y0; y < y0 + h; y++) {
    if (y < 0 || y >= INTERIOR_PIXELS) continue;
    px.fill(v, y * INTERIOR_PIXELS + Math.max(0, x0), y * INTERIOR_PIXELS + Math.min(INTERIOR_PIXELS, x0 + w));
  }
}

/** A triangle pointing up or down, for a ladder. */
function triangle(px: Uint32Array, cx: number, cy: number, size: number, up: boolean, v: number): void {
  for (let i = 0; i < size; i++) {
    const w = up ? i * 2 + 1 : (size - i) * 2 - 1;
    fillRect(px, cx - (w >> 1), cy - (size >> 1) + i, w, 1, v);
  }
}

/**
 * One cell of a dungeon level: the floor it stands on, arms reaching to
 * the cells a party can walk to from it (so a corridor reads as a
 * corridor and not a row of boxes), and the mark that says what it is.
 * `links` has a bit a side, north, east, south, west.
 */
function drawCell(px: Uint32Array, kind: CellKind, cx: number, cy: number, links: number): void {
  const [ground, mark] = COLOURS[kind];
  const x0 = cx * DUNGEON_CELL;
  const y0 = cy * DUNGEON_CELL;
  if (kind === 'wall') {
    fillRect(px, x0, y0, DUNGEON_CELL, DUNGEON_CELL, ground);
    return;
  }
  const inset = 8;
  const arm = 22;
  const mid = DUNGEON_CELL / 2;
  fillRect(px, x0 + inset, y0 + inset, DUNGEON_CELL - inset * 2, DUNGEON_CELL - inset * 2, ground);
  if (links & 1) fillRect(px, x0 + mid - arm / 2, y0, arm, inset + 1, ground);
  if (links & 2) fillRect(px, x0 + DUNGEON_CELL - inset - 1, y0 + mid - arm / 2, inset + 1, arm, ground);
  if (links & 4) fillRect(px, x0 + mid - arm / 2, y0 + DUNGEON_CELL - inset - 1, arm, inset + 1, ground);
  if (links & 8) fillRect(px, x0, y0 + mid - arm / 2, inset + 1, arm, ground);
  const mx = x0 + DUNGEON_CELL / 2;
  const my = y0 + DUNGEON_CELL / 2;
  switch (kind) {
    case 'up':
      triangle(px, mx, my, 18, true, mark);
      break;
    case 'down':
      triangle(px, mx, my, 18, false, mark);
      break;
    case 'updown':
      triangle(px, mx, my - 10, 12, true, mark);
      triangle(px, mx, my + 10, 12, false, mark);
      break;
    case 'fountain':
      fillRect(px, mx - 12, my - 4, 24, 10, mark);
      fillRect(px, mx - 8, my + 6, 16, 4, mark);
      fillRect(px, mx - 2, my - 14, 4, 10, mark);
      break;
    case 'pit':
      for (let r = 0; r < 12; r++) fillRect(px, mx - 12 + r, my - 12 + r, 24 - r * 2, 1, mark);
      break;
    case 'treasure':
      fillRect(px, mx - 12, my - 8, 24, 16, mark);
      fillRect(px, mx - 12, my - 1, 24, 2, 0xff1e1a16);
      break;
    case 'room':
      fillRect(px, x0 + 8, y0 + 8, DUNGEON_CELL - 16, DUNGEON_CELL - 16, mark);
      fillRect(px, x0 + 14, y0 + 14, DUNGEON_CELL - 28, DUNGEON_CELL - 28, ground);
      break;
    case 'door':
      fillRect(px, mx - 10, my - 14, 20, 28, mark);
      fillRect(px, mx + 4, my - 2, 3, 4, 0xff1e1a16);
      break;
    case 'rubble':
      for (let i = 0; i < 5; i++) fillRect(px, mx - 14 + i * 6, my - 6 + ((i * 5) % 9), 5, 5, mark);
      break;
    case 'floor':
    case 'trap':
      fillRect(px, mx - 3, my - 3, 6, 6, mark);
      break;
  }
}

/** A dungeon level: the cells the party has seen of its eight by eight grid, and where the party stands, steady. */
export function dungeonPicture(g: Game, mapId: number, level: number): Uint32Array {
  const px = new Uint32Array(INTERIOR_PIXELS * INTERIOR_PIXELS).fill(DARK);
  const seen = g.fog.placeSeen(mapId, level);
  if (!seen) return px;
  const kindAt = (x: number, y: number): CellKind => cellKind(g.s.dungeon[level * 0x40 + (y & 7) * 8 + (x & 7)]);
  const open = (x: number, y: number): boolean => seen[(y & 7) * DUNGEON_CELLS + (x & 7)] !== 0 && kindAt(x, y) !== 'wall';
  for (let y = 0; y < DUNGEON_CELLS; y++) {
    for (let x = 0; x < DUNGEON_CELLS; x++) {
      if (!seen[y * DUNGEON_CELLS + x]) continue;
      let links = 0;
      if (open(x, y - 1)) links |= 1;
      if (open(x + 1, y)) links |= 2;
      if (open(x, y + 1)) links |= 4;
      if (open(x - 1, y)) links |= 8;
      drawCell(px, kindAt(x, y), x, y, links);
    }
  }
  markParty(
    px,
    (g.s.x & 7) * DUNGEON_CELL + DUNGEON_CELL / 2,
    (g.s.y & 7) * DUNGEON_CELL + DUNGEON_CELL / 2,
    g.s.mapId === mapId && g.s.level === level,
  );
  return px;
}

/** Where the party stands, if it is on this map: a white square about a red heart. */
function markParty(px: Uint32Array, cx: number, cy: number, here: boolean): void {
  if (!here) return;
  fillRect(px, cx - 4, cy - 4, 8, 8, 0xfffefefe);
  fillRect(px, cx - 2, cy - 2, 4, 4, 0xff5050ff);
}
