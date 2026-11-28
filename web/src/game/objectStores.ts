/**
 * objectStores.ts
 *
 * What the party leaves in the world, kept apart from the creatures' 32-slot table (actors.ts) so that no creature
 * can take its place (#69): the vehicles left about (three of each kind in each place) and the things lying about to
 * be taken (24 in each place, let go by tier and distance; unique finds a slot each, never let go). Each place - the
 * surface, the Underworld, each settlement, each dungeon - has its own, kept across visits and in the saved game. Which
 * tiles are vehicles and items, and which finds are unique, is each game's own (ObjectRules; Ultima V's in
 * ultima5Objects.ts).
 */

import type { Game } from './game.ts';

/** A place with stores of its own; the combat arena (mapId 0x80 up) has none. */
export type PlaceKey = 'surface' | 'under' | `town:${number}` | `dungeon:${number}`;

export type VehicleKind = 'horse' | 'carpet' | 'skiff' | 'frigate';

/** A vehicle left in a place. */
export interface Vehicle {
  kind: VehicleKind;
  /** Its tile, facing and all. */
  tile: number;
  x: number;
  y: number;
  z: number;
  /** A frigate's hull (0-99), and the skiffs it carries; 0 for the rest. */
  hull: number;
  skiffs: number;
  /** In the order left, for letting the oldest go. */
  serial: number;
}

export type ItemTier = 'body' | 'food' | 'gold' | 'equipment' | 'chest';

/** A thing lying about to be taken, as the actor that stood for it held it. */
export interface Item {
  tile: number;
  x: number;
  y: number;
  z: number;
  /** What it holds (the actor's b5): how much food or gold, which arm, a chest's trap and lock. */
  amount: number;
  b6: number;
  b7: number;
  /** One of a kind: kept outside the 24, never let go. */
  unique: boolean;
  /** Which of the game's hidden things it is, -1 for none. */
  hidden: number;
}

/** What a game counts as a vehicle, an item and a unique find. */
export interface ObjectRules {
  vehicleKind(tile: number): VehicleKind | null;
  itemTier(tile: number): ItemTier | null;
  isUnique(hidden: number, tile: number, amount: number): boolean;
}

/** Three of each kind of vehicle in each place. */
export const MAX_PER_KIND = 3;
/** Twenty-four things lying about in each place, unique finds aside. */
export const MAX_ITEMS = 24;

/** The order things are let go when a place has too many: all of a tier before any of the next. */
const TIERS: readonly ItemTier[] = ['body', 'food', 'gold', 'equipment', 'chest'];

interface PlaceStore {
  vehicles: Vehicle[];
  items: Item[];
}

/** Every place's stores (Game.objects). */
export class ObjectStores {
  readonly places = new Map<PlaceKey, PlaceStore>();
  /** The next vehicle's serial. */
  serial = 1;
  /** The moonstones dug up and not taken, a bit each (items.ts). */
  uncovered = 0;
}

/** The place the party is in; null in the combat arena. */
export function placeKey(g: Game): PlaceKey | null {
  const { mapId, level } = g.s;
  if (mapId === 0) return level === 0 ? 'surface' : 'under';
  if (mapId <= 0x20) return `town:${mapId}`;
  if (mapId < 0x80) return `dungeon:${mapId}`;
  return null;
}

function storeOf(g: Game, key: PlaceKey): PlaceStore {
  let st = g.objects.places.get(key);
  if (!st) {
    st = { vehicles: [], items: [] };
    g.objects.places.set(key, st);
  }
  return st;
}

const EMPTY: PlaceStore = { vehicles: [], items: [] };

function here(g: Game): PlaceStore {
  const key = placeKey(g);
  return key ? (g.objects.places.get(key) ?? EMPTY) : EMPTY;
}

function hereForWriting(g: Game): PlaceStore {
  const key = placeKey(g);
  if (!key) throw new Error('No stores in the arena');
  return storeOf(g, key);
}

/** Squares from the party: around the edge on the 256-square worlds, plain elsewhere; on another level, far. */
function distance(g: Game, x: number, y: number, z: number): number {
  const s = g.s;
  const wrap = s.mapId === 0;
  const d = (a: number, b: number): number => {
    const n = Math.abs(a - b);
    return wrap ? Math.min(n, 256 - n) : n;
  };
  return Math.max(d(x, s.x), d(y, s.y)) + (z === s.level || s.mapId === 0 ? 0 : 256);
}

/** Within the 11-by-11 view, on the party's level. */
export function inSight(g: Game, x: number, y: number, z: number): boolean {
  const s = g.s;
  return ((x - s.x + 5) & 0xff) <= 10 && ((y - s.y + 5) & 0xff) <= 10 && (z === s.level || s.mapId === 0);
}

/** The farthest of `list` from the party (the first of equals), or undefined. */
function farthest<T extends { x: number; y: number; z: number }>(g: Game, list: readonly T[]): T | undefined {
  let best: T | undefined;
  let far = -1;
  for (const t of list) {
    const d = distance(g, t.x, t.y, t.z);
    if (d > far) {
      far = d;
      best = t;
    }
  }
  return best;
}

// --- Vehicles ---------------------------------------------------------------------

/** The vehicles left in the party's place. */
export function vehiclesHere(g: Game): readonly Vehicle[] {
  return here(g).vehicles;
}

/** The vehicle at a square of the party's place. */
export function vehicleAt(g: Game, x: number, y: number, z: number): Vehicle | undefined {
  return here(g).vehicles.find((v) => v.x === (x & 0xff) && v.y === (y & 0xff) && v.z === (z & 0xff));
}

/**
 * Leave a vehicle in the party's place. A fourth of its kind lets one go: the farthest out of sight, or with all in
 * sight the oldest.
 */
export function leaveVehicle(g: Game, v: Omit<Vehicle, 'serial'>): Vehicle {
  const st = hereForWriting(g);
  const left: Vehicle = { ...v, x: v.x & 0xff, y: v.y & 0xff, z: v.z & 0xff, serial: g.objects.serial++ };
  st.vehicles.push(left);
  const same = st.vehicles.filter((o) => o.kind === left.kind);
  if (same.length > MAX_PER_KIND) {
    const away = same.filter((o) => !inSight(g, o.x, o.y, o.z));
    const go = away.length ? farthest(g, away) : same.reduce((a, b) => (b.serial < a.serial ? b : a));
    st.vehicles.splice(st.vehicles.indexOf(go!), 1);
  }
  return left;
}

/** Take a vehicle from the store (boarded, sunk, or let go). */
export function takeVehicle(g: Game, v: Vehicle): void {
  const list = here(g).vehicles;
  const i = list.indexOf(v);
  if (i >= 0) list.splice(i, 1);
}

// --- Items ------------------------------------------------------------------------

/** The things lying about in the party's place. */
export function itemsHere(g: Game): readonly Item[] {
  return here(g).items;
}

/** The thing at a square of the party's place (the last placed, if several). */
export function itemAt(g: Game, x: number, y: number, z: number): Item | undefined {
  const list = here(g).items;
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i];
    if (it.x === (x & 0xff) && it.y === (y & 0xff) && it.z === (z & 0xff)) return it;
  }
  return undefined;
}

/**
 * Place a thing in the party's place. A 25th (unique finds aside) lets one go: the first tier that has any, bodies
 * before food before gold before equipment before chests, and of that tier the farthest from the party.
 */
export function placeItem(g: Game, it: Item): Item {
  const st = hereForWriting(g);
  const placed: Item = { ...it, x: it.x & 0xff, y: it.y & 0xff, z: it.z & 0xff };
  st.items.push(placed);
  const common = st.items.filter((o) => !o.unique);
  if (common.length > MAX_ITEMS) {
    for (const tier of TIERS) {
      const of = common.filter((o) => g.objectRules.itemTier(o.tile) === tier);
      if (!of.length) continue;
      st.items.splice(st.items.indexOf(farthest(g, of)!), 1);
      return placed;
    }
    // None of the tiers (a game's own tile): the farthest of all.
    st.items.splice(st.items.indexOf(farthest(g, common)!), 1);
  }
  return placed;
}

/** Take a thing from the store. */
export function takeItem(g: Game, it: Item): void {
  const list = here(g).items;
  const i = list.indexOf(it);
  if (i >= 0) list.splice(i, 1);
}

// --- Saving -------------------------------------------------------------------------

/** The stores as the save record keeps them (ultima5Saves.ts `objects`). */
export interface ObjectsData {
  version: 1;
  serial: number;
  uncovered: number;
  places: Record<string, { vehicles: Vehicle[]; items: Item[] }>;
}

export function encodeObjects(g: Game): ObjectsData {
  const places: ObjectsData['places'] = {};
  for (const [key, st] of g.objects.places)
    if (st.vehicles.length || st.items.length)
      places[key] = { vehicles: st.vehicles.map((v) => ({ ...v })), items: st.items.map((it) => ({ ...it })) };
  return { version: 1, serial: g.objects.serial, uncovered: g.objects.uncovered, places };
}

const KEY = /^(surface|under|town:\d+|dungeon:\d+)$/;
const byte = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 0xff;
const KINDS: readonly VehicleKind[] = ['horse', 'carpet', 'skiff', 'frigate'];

function validVehicle(v: unknown): v is Vehicle {
  const o = v as Vehicle;
  return (
    typeof v === 'object' &&
    v !== null &&
    KINDS.includes(o.kind) &&
    [o.tile, o.x, o.y, o.z, o.hull, o.skiffs].every(byte) &&
    Number.isInteger(o.serial)
  );
}

function validItem(v: unknown): v is Item {
  const o = v as Item;
  return (
    typeof v === 'object' &&
    v !== null &&
    [o.tile, o.x, o.y, o.z, o.amount, o.b6, o.b7].every(byte) &&
    typeof o.unique === 'boolean' &&
    Number.isInteger(o.hidden)
  );
}

/** The stores set from a save record's field; anything malformed in it is left out. */
export function decodeObjects(g: Game, d: ObjectsData): void {
  const o = new ObjectStores();
  if (typeof d === 'object' && d !== null) {
    if (Number.isInteger(d.serial) && d.serial > 0) o.serial = d.serial;
    if (byte(d.uncovered)) o.uncovered = d.uncovered;
    const places = typeof d.places === 'object' && d.places !== null ? Object.entries(d.places) : [];
    for (const [key, st] of places) {
      if (!KEY.test(key) || typeof st !== 'object' || st === null) continue;
      const vehicles = Array.isArray(st.vehicles) ? st.vehicles.filter(validVehicle).map((v) => ({ ...v })) : [];
      const items = Array.isArray(st.items) ? st.items.filter(validItem).map((it) => ({ ...it })) : [];
      if (vehicles.length || items.length) o.places.set(key as PlaceKey, { vehicles, items });
      for (const v of vehicles) o.serial = Math.max(o.serial, v.serial + 1);
    }
  }
  g.objects = o;
}
