// web/tests/itemStore.test.ts
// Things found and lying about keep their own store, unique finds a slot each (#69).
import { describe, expect, it } from 'vitest';
import { clearActors } from '../src/game/actors.ts';
import { updateFrame } from '../src/game/frame.ts';
import type { Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { getCommand, searchCommand } from '../src/game/items.ts';
import { type Item, itemAt, itemsHere, leaveVehicle, placeItem } from '../src/game/objectStores.ts';
import { enterWorld } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { loadLevel } from '../src/game/town.ts';
import { UNIQUE_FINDS } from '../src/game/ultima5Objects.ts';
import { type FakePlatform, newGame } from './helpers.ts';

/** In settlement `mapId` at (x, y), at ten in the morning, its people placed. */
function inTown(mapId: number, x: number, y: number): { g: Game; p: FakePlatform } {
  const { g, p } = newGame();
  journeyOnward(g);
  Object.assign(g.s, { mapId, level: 0, x, y, hour: 10, minute: 0, partyTile: 0x1c });
  loadLevel(g, true);
  updateFrame(g);
  return { g, p };
}

/** Away to the surface, and back into the settlement as it was left, its people placed afresh. */
function leaveAndCome(g: Game, mapId: number, x: number, y: number): void {
  Object.assign(g.s, { mapId: 0, level: 0, x: 50, y: 50 });
  clearActors(g);
  Object.assign(g.s, { mapId, level: 0, x, y });
  loadLevel(g, true);
  updateFrame(g);
}

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

describe('things found in a settlement', () => {
  it('a gem found in Moonglow is there on the next visit, its people placed around it, and taken with Get', async () => {
    const { g, p } = inTown(1, 8, 6);
    p.keys.push(K.Up, K.Enter); // north, by the Avatar
    await searchCommand(g);
    const gem = itemAt(g, 8, 5, 0);
    expect([gem?.tile, gem?.hidden, gem?.unique]).toEqual([8, 0x12, false]);
    leaveAndCome(g, 1, 8, 6);
    expect(itemAt(g, 8, 5, 0)?.tile).toBe(8);
    const gems = g.s.gems;
    p.keys.push(K.Up);
    await getCommand(g);
    expect(g.s.gems).toBe(gems + 1);
    expect(itemAt(g, 8, 5, 0)).toBeUndefined();
  });

  it('the HMS Cape plans survive 24 finds around them, and are taken with Get', async () => {
    const { g, p } = inTown(0x15, 15, 3);
    p.keys.push(K.Up, K.Enter); // north, by the Avatar
    await searchCommand(g);
    const plans = itemAt(g, 15, 2, 0);
    expect([plans?.tile, plans?.amount, plans?.unique]).toEqual([4, 0xff, true]);
    for (let i = 0; i < 24; i++) placeItem(g, item(0x0f, 2 + i, i < 12 ? 4 : 25));
    for (let i = 0; i < 24; i++) placeItem(g, item(0x02, 2 + i, i < 12 ? 5 : 26));
    expect(itemAt(g, 15, 2, 0)).toBe(plans);
    p.keys.push(K.Up);
    await getCommand(g);
    expect(g.s.hmsCapePlans).toBe(0xff);
  });

  it('a 25th find lets the farthest body go', async () => {
    const { g, p } = inTown(1, 8, 6);
    for (let i = 0; i < 24; i++) placeItem(g, item(0x1f, 2 + (i % 12), i < 12 ? 20 : 28));
    p.keys.push(K.Up, K.Enter); // north, by the Avatar
    await searchCommand(g);
    expect(itemsHere(g).length).toBe(24);
    expect(itemAt(g, 8, 5, 0)?.tile).toBe(8);
    expect(itemAt(g, 2, 28, 0)).toBeUndefined(); // of the farthest row (22 away), the first placed
    expect(itemAt(g, 3, 28, 0)?.tile).toBe(0x1f);
  });
});

describe('drawing what lies about', () => {
  it('shows a thing from the store, under a vehicle and a creature on its square', () => {
    const { g } = newGame();
    journeyOnward(g);
    Object.assign(g.s, { mapId: 0, level: 0, x: 86, y: 110, partyTile: 0x1c });
    clearActors(g);
    enterWorld(g);
    placeItem(g, item(0x02, 87, 110, { amount: 5 }));
    g.viewDirty = 1;
    updateFrame(g);
    expect(g.actorMap[5 * 16 + 6]).toBe(0x02);
    leaveVehicle(g, { kind: 'horse', tile: 0x10, x: 87, y: 110, z: 0, hull: 0, skiffs: 0 });
    g.viewDirty = 1;
    updateFrame(g);
    expect(g.actorMap[5 * 16 + 6] & 0xfe).toBe(0x10);
  });
});

describe('a body searched where it lies', () => {
  it('turns to food or gold in its place, in the store', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    Object.assign(g.s, { mapId: 0, level: 0, x: 86, y: 110, partyTile: 0x1c });
    clearActors(g);
    placeItem(g, item(0x1f, 86, 111, { amount: 0 }));
    // The one roll in eight that finds something, and food: one ration.
    const roll = g.random.bind(g);
    g.random = (low: number, high: number) => (low === 0 && (high === 7 || high === 3) ? 0 : low === 1 && high === 3 ? 1 : roll(low, high));
    p.keys.push(K.Down, K.Enter);
    await searchCommand(g);
    const found = itemAt(g, 86, 111, 0);
    expect([found?.tile, found?.amount]).toEqual([0x0f, 1]);
    expect(itemsHere(g).length).toBe(1);
  });
});

describe('the unique finds of Ultima V', () => {
  it('are the hidden things no shop sells that the game does not put back', () => {
    const { g } = newGame();
    const tiles = g.data.bytes(0x3e78, 0x72);
    const amounts = g.data.bytes(0x3eea, 0x72);
    const sold = new Set<number>();
    for (let shop = 0; shop < 9; shop++) for (const w of g.data.bytes(0x3ae2 + shop * 8, 8)) if (w !== 0xff) sold.add(w);
    const arms = new Set([5, 6, 9, 0xa, 0xb, 0xc]);
    const unique = new Set<number>();
    for (let i = 0; i < 0x71; i++) {
      if (i >= 0xd && i <= 0xf) continue; // put back when searched for again (items.ts hiddenIndex)
      if ((tiles[i] === 4 && amounts[i] === 0xff) || (arms.has(tiles[i]) && !sold.has(amounts[i]))) unique.add(i);
    }
    expect([...unique].sort((a, b) => a - b)).toEqual([...UNIQUE_FINDS].sort((a, b) => a - b));
  });
});
