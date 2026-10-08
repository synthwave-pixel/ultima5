/**
 * devStarts.ts
 *
 * Development starts that put the party straight into a battle, for the tiles page's view of a place (main.ts ?at=):
 * one of BRIT.CBT's sixteen arenas, fought against creatures that belong there, or a dungeon room, entered from its
 * door as the game enters one. And the look asked for on the address (?ux=, ?tiles=), for that page alone. Never
 * part of play.
 */

import { freeActor } from './actors.ts';
import { arenaFight } from './combat.ts';
import { entryRow } from './dungeon.ts';
import type { Game } from './game.ts';
import { PC_TILES, TILES, type Options, type PcTiles, type Tiles } from './settings.ts';

/** A frigate, north: the party aboard, for the arenas fought on a ship's deck (combat.ts attackCombat). */
const FRIGATE = 0x20;

/**
 * BRIT.CBT's arenas, as attackCombat chooses them - by the ground the foe stands on, the party aboard or not, the foe
 * a pirate or not - each named for that, with a creature (its actor tile) that belongs there; `aboard`, fought on the
 * party's frigate.
 */
export const ARENAS: readonly { name: string; foe: number; aboard?: boolean }[] = [
  { name: 'Camp', foe: 0xc0 }, // orcs; the camp's own arena, where an ambush is fought
  { name: 'Swamp', foe: 0xc8 }, // pythons
  { name: 'Grass', foe: 0xc0 }, // orcs
  { name: 'Scrub and brush', foe: 0xbc }, // insects
  { name: 'Desert', foe: 0xe0 }, // sand traps
  { name: 'Forest', foe: 0xf4 }, // corpsers
  { name: 'Hills and mountains', foe: 0xe4 }, // trolls
  { name: 'Bridge', foe: 0xe4 }, // trolls
  { name: 'Town', foe: 0xc4 }, // skeletons
  { name: 'Storeroom (never used)', foe: 0xc0 }, // barrels and a hidden door; attackCombat never chooses it
  { name: 'The Shadowlord', foe: 0xfc },
  { name: 'Aboard ship: sea creatures', foe: 0x88, aboard: true }, // sea serpents
  { name: 'Pirates, ashore', foe: 0x2c },
  { name: 'Aboard ship: land creatures', foe: 0xc0, aboard: true },
  { name: 'Aboard ship: pirates', foe: 0x2c, aboard: true },
  { name: 'At sea', foe: 0x84 }, // squids
];

/** The party at Lord British's castle, then in arena `n` against its creatures: the fight goes on until it is over. */
export async function startArena(g: Game, n: number): Promise<void> {
  const arena = ARENAS[n];
  if (!arena) return;
  Object.assign(g.s, { mapId: 0, level: 0, x: 86, y: 110 });
  if (arena.aboard) g.s.partyTile = FRIGATE;
  const foe = freeActor(g);
  Object.assign(g.s.actors[foe], { tile: arena.foe, anim: arena.foe, x: 86, y: 109, z: 0, b5: 0 });
  await arenaFight(g, n, foe);
}

/** Where room `room` of dungeon `d` (1-8) has its door in DUNGEON.DAT (`dat`): on `level`, else the first found. */
export function roomCell(dat: Uint8Array, d: number, room: number, level?: number): { level: number; x: number; y: number } | null {
  const base = (d - 1) * 0x200;
  for (let l = 0; l < 8; l++) {
    if (level !== undefined && l !== level) continue;
    for (let i = 0; i < 0x40; i++) if (dat[base + l * 0x40 + i] === (0xf0 | room)) return { level: l, x: i % 8, y: i >> 3 };
  }
  return null;
}

/**
 * Two rooms of each dungeon that has rooms, to show: the first door on its highest level with one, and the last on
 * its lowest - the way in and the depths (Shame's sealed cave, first).
 */
export function roomsToShow(dat: Uint8Array): { dungeon: number; room: number; level: number }[] {
  const out: { dungeon: number; room: number; level: number }[] = [];
  for (let d = 1; d <= 8; d++) {
    const doors: { room: number; level: number }[] = [];
    for (let l = 0; l < 8; l++)
      for (let i = 0; i < 0x40; i++) {
        const v = dat[(d - 1) * 0x200 + l * 0x40 + i];
        if (v >= 0xf0) doors.push({ room: v & 0xf, level: l });
      }
    if (!doors.length) continue;
    const [first, last] = [doors[0], doors[doors.length - 1]];
    out.push({ dungeon: d, ...first });
    if (last.room !== first.room || last.level !== first.level) out.push({ dungeon: d, ...last });
  }
  return out;
}

/**
 * How the party comes into room `room` of dungeon `d` (dungeon.ts enterRoom's d6602): down from above if the room has
 * a way in from there, else the first side it has one on - a room is entered only from where it has places for the
 * party to stand (dungeon.ts entryRow); from any other side, every member would stand on 0, 0.
 */
export function wayIn(g: Game, d: number, room: number): number {
  let n = d - 1;
  if (n >= 1) n--; // as enterRoom reads DUNGEON.CBT
  const at = 0x1600 * n + room * 0x160;
  const cbt = g.data.files.get('DUNGEON.CBT').subarray(at, at + 0x160);
  const facings = g.data.bytes(0x2c76, 6);
  const enters = (way: number): boolean => {
    const row = entryRow(facings[way]);
    return cbt[row * 32 + 11] !== 0 || cbt[row * 32 + 17] !== 0;
  };
  return [5, 0, 1, 2, 3, 4].find(enters) ?? 5;
}

/** The party on room `room`'s door in dungeon `d` (on `level`, if given), so the game enters it; false if none. */
export function startRoom(g: Game, dat: Uint8Array, d: number, room: number, level?: number): boolean {
  const at = roomCell(dat, d, room, level);
  if (!at) return false;
  g.s.dungeon.set(dat.subarray((d - 1) * 0x200, d * 0x200));
  Object.assign(g.s, { mapId: 0x20 + d, level: at.level, x: at.x, y: at.y, facing: 1, d6602: wayIn(g, d, room) });
  return true;
}

/**
 * The look asked for on the address, for this page alone - not saved (the tiles page's view follows its own choice):
 * ?ux=standard or original, ?tiles= a set that UX offers. Anything else is left as the settings have it.
 */
export function lookAsked(o: Options, q: URLSearchParams): void {
  const ux = q.get('ux');
  if (ux === 'standard' || ux === 'original') o.tileSet = ux;
  const tiles = q.get('tiles');
  if (o.tileSet === 'standard' && TILES.includes(tiles as Tiles)) o.tiles = tiles as Tiles;
  if (o.tileSet === 'original' && PC_TILES.includes(tiles as PcTiles)) o.pcTiles = tiles as PcTiles;
}
