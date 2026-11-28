/**
 * objectMigration.ts
 *
 * A save from before the stores (no `objects` field), and a new game's tables (INIT.GAM, INIT.OOL), held their
 * vehicles and things lying about in the 32-slot actor tables (#69). Here they move to the stores (objectStores.ts):
 * each vehicle and item to its place's, a moonstone dug up to its uncovered bit, the regalia dropped (drawn from
 * their records now). What is left in the tables is the creatures'.
 */

import { ACTOR_SLOTS, copyActorTable, restoreActorTable } from './actors.ts';
import type { Game } from './game.ts';
import {
  distance,
  type Item,
  MAX_ITEMS,
  MAX_PER_KIND,
  ObjectStores,
  type PlaceKey,
  placeKey,
  placeStore,
  type Vehicle,
} from './objectStores.ts';

/** The map a place's things are recorded under (the hidden things' and the moonstones' records). */
function mapOf(key: PlaceKey): number {
  return key === 'surface' || key === 'under' ? 0 : Number(key.split(':')[1]);
}

/** Whether one of the place's people stands in slot `i` (a townsfolk record points at it): theirs, not moved. */
function tied(g: Game, i: number): boolean {
  const s = g.s;
  for (let n = 0; n < 0x20; n++) if (s.npcs[n].actor === i && s.npcTypes[n] !== 0 && s.npcs[n].f0 !== 0) return true;
  return false;
}

/** Which of the hidden things (DATA.OVL 0x3e78..) lies at a place's square as this tile, -1 for none. */
function hiddenAt(g: Game, map: number, tile: number, x: number, y: number, z: number): number {
  const tiles = g.data.bytes(0x3e78, 0x72);
  const maps = g.data.bytes(0x3f5c, 0x72);
  const zs = g.data.bytes(0x3fce, 0x72);
  const xs = g.data.bytes(0x4040, 0x72);
  const ys = g.data.bytes(0x40b2, 0x72);
  for (let i = 0; i < 0x71; i++) if (maps[i] === map && zs[i] === z && xs[i] === x && ys[i] === y && tiles[i] === tile) return i;
  return -1;
}

/**
 * One table's vehicles and things moved out of it into `key`'s stores (or, `keep` false, a stale copy's, simply
 * dropped). `near`: the place the party is in - where it holds more than a store keeps, the nearest are kept; else the
 * first found.
 */
function moveOut(g: Game, bytes: Uint8Array, key: PlaceKey, live: boolean, keep: boolean): void {
  const rules = g.objectRules;
  const map = mapOf(key);
  const vehicles: Omit<Vehicle, 'serial'>[] = [];
  const items: Item[] = [];
  for (let i = 1; i < ACTOR_SLOTS; i++) {
    const at = i * 8;
    const [tile, , x, y, z, b5, b6, b7] = bytes.subarray(at, at + 8);
    if (tile === 0 || (live && tied(g, i))) continue;
    const kind = rules.vehicleKind(tile);
    const tier = rules.itemTier(tile);
    if (kind) {
      const ship = kind === 'frigate';
      vehicles.push({ kind, tile, x, y, z, hull: ship ? b5 : 0, skiffs: ship ? b7 : 0 });
    } else if (tier) {
      const hidden = hiddenAt(g, map, tile, x, y, z);
      items.push({ tile, x, y, z, amount: b5, b6, b7, unique: hidden >= 0 && rules.isUnique(hidden, tile, b5), hidden });
    } else if (tile === 0x19) {
      if (keep && g.s.moonstoneHeld[b5 & 7] === map) g.objects.uncovered |= 1 << (b5 & 7);
    } else if (tile !== 0xb4 && tile !== 0xb7) {
      continue; // a creature: stays
    }
    bytes.fill(0, at, at + 8);
  }
  if (!keep) return;
  const near = live;
  const order = <T extends { x: number; y: number; z: number }>(list: T[]): T[] =>
    near ? [...list].sort((a, b) => distance(g, a.x, a.y, a.z) - distance(g, b.x, b.y, b.z)) : list;
  // Those kept, in the tables' order.
  const kept = new Set<object>();
  for (const kind of ['horse', 'carpet', 'skiff', 'frigate'] as const)
    for (const v of order(vehicles.filter((v) => v.kind === kind)).slice(0, MAX_PER_KIND)) kept.add(v);
  for (const it of order(items.filter((it) => !it.unique)).slice(0, MAX_ITEMS)) kept.add(it);
  const st = placeStore(g, key);
  for (const v of vehicles) if (kept.has(v)) st.vehicles.push({ ...v, serial: g.objects.serial++ });
  for (const it of items) if (it.unique || kept.has(it)) st.items.push(it);
}

/** Every table's vehicles and things moved into the stores: the live one (the party's place), BRIT.OOL, UNDER.OOL. */
export function migrateActorTables(g: Game): void {
  const here = placeKey(g);
  if (here) {
    const live = copyActorTable(g);
    moveOut(g, live, here, true, true);
    restoreActorTable(g, live);
  }
  // The world the party is in lives in the live table; its file is a stale copy, written over when the party leaves.
  moveOut(g, g.ool.brit, 'surface', false, here !== 'surface');
  moveOut(g, g.ool.under, 'under', false, here !== 'under');
}

/** A new game's stores: empty, then INIT.GAM's and INIT.OOL's vehicles and things brought in. */
export function freshObjects(g: Game): void {
  g.objects = new ObjectStores();
  migrateActorTables(g);
}
