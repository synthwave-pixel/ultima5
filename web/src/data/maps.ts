/**
 * maps.ts
 *
 * The maps the party walks, from the player's files:
 *
 * - Britannia (BRIT.DAT): 256 by 256 tiles in 16 by 16 chunks of 256
 *   bytes. The chunk index is D_3876 in DATA.OVL, one byte per chunk,
 *   row-major; 0xFF marks an all-water chunk that is not stored
 *   (u5d outsubs.c OUTSUBS_0098 fills those with tile 1).
 * - The Underworld (UNDER.DAT): the same 16 by 16 chunks in the same
 *   order, every one stored, so a chunk is simply at chunk * 256
 *   (u5d outsubs.c OUTSUBS_0098 reads it at the offset it was given).
 * - Settlements (TOWNE, DWELLING, CASTLE and KEEP.DAT): 16 levels of 32
 *   by 32 tiles each. Map id 1-32; the file is by (id - 1) >> 3 and the
 *   first level's index is D_1e1a[id - 1]; a basement (level -1) is the
 *   level stored just before it (u5d town.c TOWN_0408).
 */

import { DataOvl } from './dataOvl.ts';
import { GameFiles } from './files.ts';

export const WORLD_SIZE = 256;
export const TOWN_SIZE = 32;

const CHUNK_INDEX = 0x3876;
const TOWN_FILES = ['TOWNE.DAT', 'DWELLING.DAT', 'CASTLE.DAT', 'KEEP.DAT'];
const LEVEL_START = 0x1e1a;
const LOCATION_NAMES = 0x1e3a;
const LOCATION_X = 0x1e8a;
const LOCATION_Y = 0x1eb2;
/** Map ids 1-32 are settlements; 33-40 the eight dungeons (u5d ultima.c main). */
export const SETTLEMENTS = 32;
export const DUNGEONS = 8;

/** A square map of tile numbers, row-major. */
export interface TileMap {
  size: number;
  tiles: Uint8Array;
}

export function tileAt(map: TileMap, x: number, y: number): number {
  return map.tiles[y * map.size + x];
}

/** Britannia, whole. */
export function readBritannia(files: GameFiles, ovl: DataOvl): TileMap {
  const brit = files.get('BRIT.DAT');
  const index = ovl.bytes(CHUNK_INDEX, 256);
  const tiles = new Uint8Array(WORLD_SIZE * WORLD_SIZE);
  for (let chunk = 0; chunk < 256; chunk++) {
    const cx = (chunk & 15) * 16;
    const cy = (chunk >> 4) * 16;
    const stored = index[chunk];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        tiles[(cy + y) * WORLD_SIZE + cx + x] = stored === 0xff ? 1 : brit[stored * 256 + y * 16 + x];
      }
    }
  }
  return { size: WORLD_SIZE, tiles };
}

/** The Underworld, whole. */
export function readUnderworld(files: GameFiles): TileMap {
  const under = files.get('UNDER.DAT');
  const tiles = new Uint8Array(WORLD_SIZE * WORLD_SIZE);
  for (let chunk = 0; chunk < 256; chunk++) {
    const cx = (chunk & 15) * 16;
    const cy = (chunk >> 4) * 16;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) tiles[(cy + y) * WORLD_SIZE + cx + x] = under[chunk * 256 + y * 16 + x];
    }
  }
  return { size: WORLD_SIZE, tiles };
}

export interface Location {
  /** Map id, 1-40. */
  id: number;
  /** The name DATA.OVL gives, or a description for the ones it leaves blank. */
  name: string;
  /** Where its entrance is on the surface (dungeons: in Britannia or the Underworld). */
  x: number;
  y: number;
  /** Settlements: the map file and the index of level 0 in it. */
  file?: string;
  firstLevel?: number;
  /** Settlements: the levels there are, lowest first (-1 is a basement). */
  levels?: number[];
}

/** Names for the settlements DATA.OVL leaves unnamed (it names them only in conversation). */
const UNNAMED: Record<number, string> = {
  14: "Sutek's hut",
  15: "Sin Vraal's hut",
  16: "Grendel's hut",
  17: "Lord British's castle",
  18: "Blackthorn's palace",
};

/**
 * Basements, found in the data: the level before these settlements'
 * first is theirs (it has only a ladder up and follows the previous
 * settlement's top floor).
 */
const HAS_BASEMENT = new Set([4, 17, 18, 32]);

export function readLocations(ovl: DataOvl): Location[] {
  const names = ovl.strings(LOCATION_NAMES, 40);
  const xs = ovl.bytes(LOCATION_X, 40);
  const ys = ovl.bytes(LOCATION_Y, 40);
  const starts = ovl.bytes(LEVEL_START, 32);
  const locations: Location[] = [];
  for (let i = 0; i < 40; i++) {
    const id = i + 1;
    const loc: Location = { id, name: names[i] || UNNAMED[id] || `Map ${id}`, x: xs[i], y: ys[i] };
    if (id <= SETTLEMENTS) {
      const group = i >> 3;
      const first = starts[i];
      const next = (i & 7) === 7 ? 16 : starts[i + 1];
      const top = next - 1 - (HAS_BASEMENT.has(id + 1) && (i & 7) !== 7 ? 1 : 0);
      const levels: number[] = [];
      for (let l = HAS_BASEMENT.has(id) ? -1 : 0; first + l <= top; l++) levels.push(l);
      loc.file = TOWN_FILES[group];
      loc.firstLevel = first;
      loc.levels = levels;
    }
    locations.push(loc);
  }
  return locations;
}

/** One level of a settlement: 32 by 32 tiles. */
export function readTownLevel(files: GameFiles, loc: Location, level: number): TileMap {
  if (!loc.file || loc.firstLevel === undefined) throw new Error(`${loc.name} is not a settlement`);
  // A basement's level is -1, kept in the save as its byte, 0xff (town.ts reads it so).
  const index = loc.firstLevel + (level > 0x7f ? level - 0x100 : level);
  const data = files.get(loc.file);
  return { size: TOWN_SIZE, tiles: data.slice(index * 1024, index * 1024 + 1024) };
}
