// web/tests/objectStores.test.ts
// The stores for vehicles and things lying about, per place, and what each lets go when full (#69).
import { describe, expect, it } from 'vitest';
import {
  decodeObjects,
  encodeObjects,
  type ObjectsData,
  type Item,
  itemAt,
  itemsHere,
  leaveVehicle,
  MAX_ITEMS,
  MAX_PER_KIND,
  placeItem,
  placeKey,
  takeItem,
  takeVehicle,
  vehicleAt,
  vehiclesHere,
} from '../src/game/objectStores.ts';
import { ULTIMA5_OBJECTS } from '../src/game/ultima5Objects.ts';
import { parseSave, restore, serialize } from '../src/game/ultima5Saves.ts';
import { newGame } from './helpers.ts';

/** A game on the surface, the party at (100, 100). */
function surface() {
  const { g } = newGame();
  Object.assign(g.s, { mapId: 0, level: 0, x: 100, y: 100 });
  return g;
}

const skiff = (x: number, y: number) => ({ kind: 'skiff' as const, tile: 0x28, x, y, z: 0, hull: 0, skiffs: 0 });
const frigate = (x: number, y: number) => ({ kind: 'frigate' as const, tile: 0x24, x, y, z: 0, hull: 99, skiffs: 1 });
const item = (tile: number, x: number, y: number, extra: Partial<Item> = {}): Item => ({
  tile,
  x,
  y,
  z: 0,
  amount: 1,
  b6: 0,
  b7: 0,
  unique: false,
  hidden: -1,
  ...extra,
});

describe('places', () => {
  it('knows the place by map and level', () => {
    const g = surface();
    expect(placeKey(g)).toBe('surface');
    g.s.level = 0xff;
    expect(placeKey(g)).toBe('under');
    Object.assign(g.s, { mapId: 5, level: 1 });
    expect(placeKey(g)).toBe('town:5');
    Object.assign(g.s, { mapId: 0x23, level: 3 });
    expect(placeKey(g)).toBe('dungeon:35');
    g.s.mapId = 0x80;
    expect(placeKey(g)).toBeNull();
  });

  it("keeps each place's own", () => {
    const g = surface();
    leaveVehicle(g, skiff(101, 100));
    expect(vehiclesHere(g).length).toBe(1);
    g.s.level = 0xff;
    expect(vehiclesHere(g).some((v) => v.x === 101 && v.y === 100)).toBe(false); // the Underworld has its own
    Object.assign(g.s, { mapId: 5, level: 0 });
    expect(vehiclesHere(g).length).toBe(0);
    Object.assign(g.s, { mapId: 0, level: 0 });
    expect(vehicleAt(g, 101, 100, 0)?.kind).toBe('skiff');
  });
});

describe('vehicles', () => {
  it('keeps three of a kind', () => {
    const g = surface();
    expect(MAX_PER_KIND).toBe(3);
    for (const d of [10, 20, 30, 40]) leaveVehicle(g, skiff(100 + d, 100));
    expect(vehiclesHere(g).map((v) => v.x)).toEqual([110, 120, 140]); // the one just left is kept
  });

  it('never lets go of the one just placed: a ship bought at a dock out of sight, food just found', () => {
    const g = surface();
    for (const d of [10, 20, 30]) leaveVehicle(g, frigate(100 + d, 100));
    leaveVehicle(g, frigate(100, 160)); // bought, waiting at a far dock
    expect(vehiclesHere(g).map((v) => [v.x, v.y])).toEqual([
      [110, 100],
      [120, 100],
      [100, 160],
    ]);
    for (let i = 0; i < 24; i++) placeItem(g, item(0x01, 100 + i, 101)); // chests
    const food = placeItem(g, item(0x0f, 140, 140));
    expect(itemsHere(g)).toContain(food);
    expect(itemAt(g, 123, 101, 0)).toBeUndefined(); // the farthest chest instead
  });

  it('measures across the edge of the world', () => {
    const g = surface();
    Object.assign(g.s, { x: 2, y: 2 });
    leaveVehicle(g, skiff(250, 2)); // 8 away, around the edge
    leaveVehicle(g, skiff(40, 2)); // 38 away
    leaveVehicle(g, skiff(30, 2)); // 28 away
    leaveVehicle(g, skiff(20, 2)); // 18 away
    expect(vehiclesHere(g).map((v) => v.x)).toEqual([250, 30, 20]);
  });

  it('never lets go of one in sight', () => {
    const g = surface();
    leaveVehicle(g, frigate(102, 100));
    leaveVehicle(g, frigate(150, 100)); // 50 away, out of sight
    leaveVehicle(g, frigate(103, 101));
    leaveVehicle(g, frigate(101, 100)); // a fourth, in sight
    expect(vehiclesHere(g).map((v) => v.x)).toEqual([102, 103, 101]);
    // All in sight: the oldest goes.
    leaveVehicle(g, frigate(99, 100));
    expect(vehiclesHere(g).map((v) => v.x)).toEqual([103, 101, 99]);
  });

  it('counts each kind apart', () => {
    const g = surface();
    for (const d of [10, 20, 30]) leaveVehicle(g, skiff(100 + d, 100));
    for (const d of [10, 20, 30]) leaveVehicle(g, frigate(100, 100 + d));
    expect(vehiclesHere(g).length).toBe(6);
  });

  it('gives back what it was left as, and takes it away when boarded', () => {
    const g = surface();
    const v = leaveVehicle(g, { kind: 'frigate', tile: 0x26, x: 101, y: 100, z: 0, hull: 77, skiffs: 2 });
    expect(vehicleAt(g, 101, 100, 0)).toEqual({ ...v });
    expect([v.tile, v.hull, v.skiffs]).toEqual([0x26, 77, 2]);
    takeVehicle(g, v);
    expect(vehicleAt(g, 101, 100, 0)).toBeUndefined();
  });
});

describe('items', () => {
  it('lets items go by tier, then distance', () => {
    const g = surface();
    expect(MAX_ITEMS).toBe(24);
    placeItem(g, item(0x1e, 105, 100)); // a body at 5
    placeItem(g, item(0x1f, 109, 100)); // a body at 9
    for (let i = 0; i < 5; i++) placeItem(g, item(0x0f, 100, 106 + i)); // food, 6 to 10 away
    for (let i = 0; i < 5; i++) placeItem(g, item(0x02, 100, 115 + i)); // gold, 15 to 19 away
    for (let i = 0; i < 6; i++) placeItem(g, item(0x05, 100 + i, 130)); // equipment
    for (let i = 0; i < 6; i++) placeItem(g, item(0x01, 100 + i, 140)); // chests
    expect(itemsHere(g).length).toBe(24);
    placeItem(g, item(0x02, 101, 101)); // a 25th
    expect(itemsHere(g).length).toBe(24);
    expect(itemAt(g, 109, 100, 0)).toBeUndefined();
    expect(itemAt(g, 105, 100, 0)?.tile).toBe(0x1e);
    placeItem(g, item(0x02, 101, 102));
    expect(itemAt(g, 105, 100, 0)).toBeUndefined(); // the last body
    placeItem(g, item(0x02, 101, 103));
    expect(itemsHere(g).filter((it) => it.tile === 0x0f).length).toBe(4); // then food, the farthest first
    expect(itemAt(g, 100, 110, 0)).toBeUndefined();
    expect(itemAt(g, 100, 106, 0)?.tile).toBe(0x0f);
    for (let n = 0; n < 4; n++) placeItem(g, item(0x05, 102, 101 + n));
    expect(itemsHere(g).some((it) => it.tile === 0x0f)).toBe(false); // all the food before any gold
    placeItem(g, item(0x05, 103, 101));
    expect(itemsHere(g).filter((it) => it.tile === 0x02).length).toBe(7);
    expect(itemAt(g, 100, 119, 0)).toBeUndefined(); // the farthest gold
    expect(itemAt(g, 100, 118, 0)?.tile).toBe(0x02);
  });

  it('keeps unique finds outside the 24', () => {
    const g = surface();
    for (let i = 0; i < 24; i++) placeItem(g, item(0x0f, 100 + (i % 10), 101 + Math.floor(i / 10)));
    const plans = placeItem(g, item(0x04, 140, 140, { amount: 0xff, unique: true, hidden: 0x0c }));
    expect(itemsHere(g).length).toBe(25);
    for (let i = 0; i < 24; i++) placeItem(g, item(0x02, 100 + (i % 10), 104 + Math.floor(i / 10)));
    expect(itemsHere(g).length).toBe(25);
    expect(itemAt(g, 140, 140, 0)).toBe(plans);
    takeItem(g, plans);
    expect(itemAt(g, 140, 140, 0)).toBeUndefined();
  });

  it('knows the tiers and the unique finds of Ultima V', () => {
    const r = ULTIMA5_OBJECTS;
    expect([1, 2, 3, 0xd, 0xf, 0x1e, 0x1f, 0xe, 0x19].map((t) => r.itemTier(t))).toEqual([
      'chest',
      'gold',
      'equipment',
      'equipment',
      'food',
      'body',
      'body',
      null,
      null,
    ]);
    expect([0x10, 0x11, 0x1b, 0x28, 0x2b, 0x24, 0x27, 0x2c, 0x12].map((t) => r.vehicleKind(t))).toEqual([
      'horse',
      'horse',
      'carpet',
      'skiff',
      'skiff',
      'frigate',
      'frigate',
      null,
      null,
    ]);
  });
});

describe('saving', () => {
  it('saves and restores', () => {
    const g = surface();
    leaveVehicle(g, frigate(101, 100));
    placeItem(g, item(0x02, 102, 100, { amount: 30 }));
    Object.assign(g.s, { mapId: 2, level: 1 });
    placeItem(g, item(0x01, 5, 6, { z: 1, unique: false, hidden: 0x12 }));
    const { g: g2 } = newGame();
    decodeObjects(g2, JSON.parse(JSON.stringify(encodeObjects(g))) as ObjectsData);
    Object.assign(g2.s, { mapId: 2, level: 1 });
    expect(itemsHere(g2)).toEqual(itemsHere(g));
    Object.assign(g.s, { mapId: 0, level: 0 });
    Object.assign(g2.s, { mapId: 0, level: 0 });
    expect(vehiclesHere(g2)).toEqual(vehiclesHere(g));
    expect(itemsHere(g2)).toEqual(itemsHere(g));
    // A fourth frigate after the restore is numbered after the first.
    expect(leaveVehicle(g2, frigate(103, 100)).serial).toBeGreaterThan(vehiclesHere(g2)[0].serial);
  });

  it('goes with the save record', () => {
    const g = surface();
    leaveVehicle(g, skiff(101, 100));
    const text = JSON.stringify(serialize(g));
    const { g: g2 } = newGame();
    restore(g2, parseSave(text));
    Object.assign(g2.s, { mapId: 0, level: 0 });
    expect(vehicleAt(g2, 101, 100, 0)?.kind).toBe('skiff');
  });

  it('ignores a damaged field', () => {
    const { g } = newGame();
    decodeObjects(g, { version: 1, serial: 3, uncovered: 0, places: { surface: { vehicles: [{ kind: 'boat' }], items: 'x' } } } as never);
    Object.assign(g.s, { mapId: 0, level: 0 });
    expect(vehiclesHere(g)).toEqual([]);
    expect(itemsHere(g)).toEqual([]);
  });
});
