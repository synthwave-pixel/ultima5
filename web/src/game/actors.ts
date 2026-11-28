/**
 * actors.ts
 *
 * The 32 actors (D_5c5a): finding one at a square, taking a free slot for
 * a new one, and whether an actor of a kind can stand on a tile (u5d
 * 3000.c, 2000.c ULTIMA_2c4c_IsWalkableTile).
 */

import { Game } from './game.ts';
import { type Item, itemsHere, takeItem, type Vehicle, vehicleAt } from './objectStores.ts';
import { Actor, type Save } from './save.ts';
import { T } from './tiles.ts';

// --- The table itself -------------------------------------------------------------
// Only these functions reach the 32 slots (#69): slot 0 is the party, 1-31 creatures, townsfolk and (in a fight) the
// arena's combatants and what they leave. Vehicles and things lying about keep stores of their own (objectStores.ts).

/** How many slots the table has. */
export const ACTOR_SLOTS = 32;

/** The table's place in the save (D_5c5a), as an offset into `Save.b`. */
const TABLE_AT = 0x5c5a - 0x55a6;

/** Each save's 32 records, views over its bytes, made once per save. */
const tables = new WeakMap<Save, Actor[]>();

function table(s: Save): Actor[] {
  let t = tables.get(s);
  if (!t) {
    t = Array.from({ length: ACTOR_SLOTS }, (_, i) => new Actor(s.b.subarray(TABLE_AT + i * 8, TABLE_AT + i * 8 + 8)));
    tables.set(s, t);
  }
  return t;
}

/** The record in slot `i` (0-31); 0 is the party. */
export function actor(g: Game, i: number): Actor {
  return table(g.s)[i];
}

/** The party's record, slot 0. */
export function party(g: Game): Actor {
  return actor(g, 0);
}

/** Slots `from` up to (not including) `to`, in order, empty ones included. */
export function* actorSlots(g: Game, from = 0, to = ACTOR_SLOTS): IterableIterator<[number, Actor]> {
  for (let i = from; i < to; i++) yield [i, actor(g, i)];
}

/** The 32 records as a fresh array, index = slot (for scans that want an array's methods; the records are live). */
export function actorList(g: Game): Actor[] {
  return Array.from(actorSlots(g), ([, a]) => a);
}

/** Every slot from `from` up emptied. */
export function clearActors(g: Game, from = 1): void {
  for (let i = from; i < ACTOR_SLOTS; i++) actor(g, i).clear();
}

/** A copy of the whole table (256 bytes), to put back with restoreActorTable. */
export function copyActorTable(g: Game): Uint8Array {
  return g.s.b.slice(TABLE_AT, TABLE_AT + ACTOR_SLOTS * 8);
}

/** The table set from a copy made by copyActorTable. */
export function restoreActorTable(g: Game, bytes: Uint8Array): void {
  g.s.b.set(bytes.subarray(0, ACTOR_SLOTS * 8), TABLE_AT);
}

/** ULTIMA_368e: the first actor from 1 up standing at (x, y, z) in the table: its tile, its index in dx (0 if none). */
export function creatureTileAt(g: Game, x: number, y: number, z: number): number {
  const s = g.s;
  for (let i = 1; i < 32; i++) {
    const a = actor(g, i);
    if (a.x === (x & 0xff) && a.y === (y & 0xff) && (s.mapId > 0x7f || a.z === z)) {
      s.dx = i;
      return a.tile;
    }
  }
  s.dx = 32;
  return 0;
}

/**
 * What a square shows, as ULTIMA_368e did when everything stood in the table: a creature's tile (its slot in dx),
 * else what lies there in the stores (dx 32, not a slot), else 0.
 */
export function actorTileAt(g: Game, x: number, y: number, z: number): number {
  const t = creatureTileAt(g, x, y, z);
  if (t !== 0) return t;
  const stored = storedAt(g, x, y, z);
  if (stored) {
    g.s.dx = 32;
    return stored.tile;
  }
  return 0;
}

/** ULTIMA_3702: the same, searching the table from 31 down to 0 (the party included), then the stores (dx 32). */
export function actorTileAtRev(g: Game, x: number, y: number, z: number): number {
  const s = g.s;
  for (let i = 31; i >= 0; i--) {
    const a = actor(g, i);
    if (a.x === (x & 0xff) && a.y === (y & 0xff) && (s.mapId > 0x7f || a.z === z)) {
      s.dx = i;
      return a.tile;
    }
  }
  const stored = storedAt(g, x, y, z);
  s.dx = stored ? 32 : -1;
  return stored?.tile ?? 0;
}

/** Something on a square: a creature (or anything else the table holds), a vehicle, a thing lying about. */
export type Thing =
  | { kind: 'creature'; slot: number; tile: number }
  | { kind: 'vehicle'; v: Vehicle; tile: number }
  | { kind: 'moonstone'; stone: number; tile: number }
  | { kind: 'regalia'; which: number; tile: number }
  | { kind: 'item'; it: Item; tile: number };

/** The first of the stores' things at a square, in drawing order (vehicle, moonstone or regalia, then item). */
function storedAt(g: Game, x: number, y: number, z: number): Thing | undefined {
  const v = vehicleAt(g, x, y, z);
  if (v) return { kind: 'vehicle', v, tile: v.tile };
  const r = relicsHere(g).find((t) => t.x === (x & 0xff) && t.y === (y & 0xff) && t.z === (z & 0xff));
  if (r) return r.thing;
  const it = itemOnSquare(g, x, y, z);
  return it ? { kind: 'item', it, tile: it.tile } : undefined;
}

/** Where the Amulet lies in the Underworld (OUTSUBS_0566). */
const AMULET_AT = [0x69, 0xe1] as const;

/**
 * The moonstones dug up and not taken, and the Amulet and the shards where they wait in the Underworld: drawn and
 * taken from the records the save keeps of them (the stones' places and the uncovered bits, s.amulet, s.shards,
 * s.shadowlords), with no actor standing for them.
 */
export function relicsHere(g: Game): { x: number; y: number; z: number; thing: Thing }[] {
  const s = g.s;
  const out: { x: number; y: number; z: number; thing: Thing }[] = [];
  if (s.mapId > 0x7f) return out;
  for (let i = 0; i < 8; i++)
    if ((g.objects.uncovered & (1 << i)) !== 0 && s.moonstoneHeld[i] === s.mapId)
      out.push({ x: s.moonstoneX[i], y: s.moonstoneY[i], z: s.moonstoneZ[i], thing: { kind: 'moonstone', stone: i, tile: 0x19 } });
  if (s.mapId === 0 && s.level === 0xff) {
    if (s.amulet === 0) out.push({ x: AMULET_AT[0], y: AMULET_AT[1], z: 0xff, thing: { kind: 'regalia', which: 0, tile: 0xb7 } });
    const xs = g.data.bytes(0x3a06, 3);
    const ys = g.data.bytes(0x3a0a, 3);
    for (let i = 0; i < 3; i++)
      if (s.shards[i] === 0 && s.shadowlords[i] < 0x80)
        out.push({ x: xs[i], y: ys[i], z: 0xff, thing: { kind: 'regalia', which: 1 + i, tile: 0xb4 } });
  }
  return out;
}

/** What a regalia piece holds for Get (getObject's amount): the shard's number (D_3a0e), the Amulet's 0xf3. */
export function regaliaAmount(g: Game, which: number): number {
  return which === 0 ? 0xf3 : g.data.bytes(0x3a0e, 3)[which - 1];
}

/** The last placed of the things lying on a square. */
function itemOnSquare(g: Game, x: number, y: number, z: number): Item | undefined {
  const list = itemsHere(g);
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i];
    if (it.x === (x & 0xff) && it.y === (y & 0xff) && it.z === (z & 0xff)) return it;
  }
  return undefined;
}

/** Everything on a square, top first: the table's from slot 1 up, then a vehicle, then the things lying there. */
export function thingsAt(g: Game, x: number, y: number, z: number): Thing[] {
  const s = g.s;
  const out: Thing[] = [];
  for (let i = 1; i < 32; i++) {
    const a = actor(g, i);
    if (a.tile !== 0 && a.x === (x & 0xff) && a.y === (y & 0xff) && (s.mapId > 0x7f || a.z === z))
      out.push({ kind: 'creature', slot: i, tile: a.tile });
  }
  const v = vehicleAt(g, x, y, z);
  if (v) out.push({ kind: 'vehicle', v, tile: v.tile });
  for (const r of relicsHere(g)) if (r.x === (x & 0xff) && r.y === (y & 0xff) && r.z === (z & 0xff)) out.push(r.thing);
  const list = itemsHere(g);
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i];
    if (it.x === (x & 0xff) && it.y === (y & 0xff) && it.z === (z & 0xff)) out.push({ kind: 'item', it, tile: it.tile });
  }
  return out;
}

/**
 * A thing lying on a square as Search, Open, Jimmy, Get and An Sanct act on it: a record of the table (the arena's in
 * a fight; elsewhere what the place's people hold, as the sandalwood box), or of the item store.
 */
export interface Lying {
  readonly tile: number;
  /** What it holds: a chest's trap and lock, how much food or gold, which arm (the actor's b5, an item's amount). */
  b5: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Its slot in the table; 32 for one in the item store. */
  readonly slot: number;
  /** Turned to another thing where it lies (a body searched to food or gold). */
  become(tile: number, b5: number): void;
  /** Gone from where it lay. */
  remove(): void;
}

/** The table's record in `slot` as a thing lying about. */
export function lyingSlot(g: Game, slot: number): Lying {
  const a = actor(g, slot);
  return {
    get tile() {
      return a.tile;
    },
    get b5() {
      return a.b5;
    },
    set b5(v: number) {
      a.b5 = v;
    },
    x: a.x,
    y: a.y,
    z: a.z,
    slot,
    become(tile: number, b5: number) {
      a.tile = a.anim = tile;
      a.b5 = b5;
    },
    remove() {
      setActor(g, slot, 0, 0, 0, 0, 0, 0);
    },
  };
}

/** An item of the store as a thing lying about. */
function lyingItem(g: Game, it: Item): Lying {
  return {
    get tile() {
      return it.tile;
    },
    get b5() {
      return it.amount;
    },
    set b5(v: number) {
      it.amount = v & 0xff;
    },
    x: it.x,
    y: it.y,
    z: it.z,
    slot: 32,
    become(tile: number, b5: number) {
      it.tile = tile;
      it.amount = b5 & 0xff;
    },
    remove() {
      takeItem(g, it);
    },
  };
}

/** The first thing on a square whose tile `test` passes: the table's (slot 1 up, or 31 down), then the item store's. */
export function lyingAt(g: Game, x: number, y: number, z: number, test: (tile: number) => boolean, down = false): Lying | undefined {
  const things = thingsAt(g, x, y, z);
  const table = things.filter((t) => t.kind === 'creature');
  if (down) table.reverse();
  for (const t of [...table, ...things.filter((t) => t.kind === 'item')]) {
    if (!test(t.tile)) continue;
    if (t.kind === 'creature') return lyingSlot(g, t.slot);
    if (t.kind === 'item') return lyingItem(g, t.it);
  }
  return undefined;
}

/** ULTIMA_3868: an actor slot 1-23 whose tile is in [lo, hi] (and out of view, if asked). */
function slotWith(g: Game, lo: number, hi: number, outOfView: boolean): number {
  const s = g.s;
  for (let i = 1; i < 0x18; i++) {
    const t = actor(g, i).tile;
    if (t >= lo && t <= hi && t !== 0xb5) {
      if (!outOfView) return i;
      const vx = (actor(g, i).x - s.x + 5) & 0xff;
      const vy = (actor(g, i).y - s.y + 5) & 0xff;
      if (vx > 10 || vy > 10) return i;
    }
  }
  return 0;
}

/** ULTIMA_38e4: a slot for a new actor: an empty one, else one to reuse, least missed first. */
export function freeActor(g: Game): number {
  const tries: [number, number, boolean][] = [
    [0, 0, false],
    [1, 0xf, true],
    [0x80, 0xff, true],
    [0x10, 0x11, true],
    [0x30, 0x7f, true],
    [1, 0xf, false],
    [0x80, 0xff, false],
    [0x10, 0x11, false],
    [0x30, 0x7f, false],
    [0, 0xff, false],
  ];
  for (const [lo, hi, out] of tries) {
    const i = slotWith(g, lo, hi, out);
    if (i !== 0) return i;
  }
  return 0;
}

/** ULTIMA_3a74. */
export function setActor(g: Game, i: number, tile: number, anim: number, x: number, y: number, z: number, b5: number): void {
  const a = actor(g, i);
  a.tile = tile & 0xff;
  a.anim = anim & 0xff;
  a.x = x & 0xff;
  a.y = y & 0xff;
  a.z = z & 0xff;
  a.b5 = b5 & 0xff;
}

// --- Where actors can go --------------------------------------------------------

/** ULTIMA_2bd4: ordinary ground (D_54d4); only people sit in chairs. */
function walkable(g: Game, actor: number, tile: number): boolean {
  let ok = (g.data.blocked()[tile >> 3] & (0x80 >> (tile & 7))) === 0;
  if ((actor & 0xfe) !== 0x1c && (actor & 0xf0) !== 0x40 && (tile & 0xfc) === T.Chair90) ok = false;
  return ok;
}

/** ULTIMA_2c2e: water, for what swims or flies. */
const water = (tile: number): boolean => tile < 4 || (tile & 0xf0) === T.T60;

/** ULTIMA_2c4c_IsWalkableTile: can an actor of this tile enter this map tile. */
export function canEnter(g: Game, actor: number, tile: number): boolean {
  switch (g.data.moveKind()[actor >> 2]) {
    case 0:
      return walkable(g, actor, tile);
    case 1: // sea creatures
      return water(tile);
    case 2: // fliers
      return (tile & 0xf0) === T.T60 || water(tile) || walkable(g, actor, tile);
    case 3: // horses: not through lava or poison
      return walkable(g, actor, tile) && tile !== T.Lava && tile !== 4;
    case 4: // ghosts and Shadowlords: anything but water
      return !water(tile);
    case 5: // skiffs
      if ((tile & 0xfc) === T.T34) return ((8 >> (actor & 3)) & g.data.skiffBridge()[tile - T.T34]) !== 0;
      if (!water(tile)) return false;
      if (tile < T.T60) return true;
      return (g.data.skiffShore()[tile - T.T60] & (8 >> (actor & 3))) !== 0;
    case 6: // frigates: deep water only
      return tile <= 2;
    case 7: // rot worms
      return tile === T.Poison;
    case 8: // corpsers
      return tile === T.Grass;
    case 9: // whirlpools
      return tile === T.Water1;
    case 10: // sand traps
      return tile === T.T7;
    default:
      return false;
  }
}

/**
 * Whether anything worth taking lies on the field: a chest, or what came out of one (the things that lie about to
 * be picked up are tiles 1 to 15 - gold, a potion, a scroll, arms, a key, a gem, a torch, food).
 */
export function treasureLies(g: Game): boolean {
  for (const [, a] of actorSlots(g, 1)) if (a.tile >= 1 && a.tile <= 0xf) return true;
  return false;
}
