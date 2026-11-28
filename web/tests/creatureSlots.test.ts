// web/tests/creatureSlots.test.ts
// A new creature's slot: an empty one, else the farthest creature's, never one of the place's people (#69).
import { describe, expect, it } from 'vitest';
import { actor, actorList, clearActors, copyActorTable, freeActor } from '../src/game/actors.ts';
import type { Game } from '../src/game/game.ts';
import { encodeObjects, leaveVehicle, placeItem } from '../src/game/objectStores.ts';
import { enterWorld, spawn, stashWorldActors, unstashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** Out on the surface by Britain at 1 in the morning, the table empty. */
function night(): Game {
  const { g } = newGame();
  journeyOnward(g);
  Object.assign(g.s, { mapId: 0, level: 0, x: 86, y: 110, hour: 1, minute: 0, partyTile: 0x1c });
  clearActors(g);
  enterWorld(g);
  return g;
}

/** Slots 1-23 filled with sea serpents at the squares `at(i)` gives. */
function fill(g: Game, at: (i: number) => [number, number]): void {
  for (let i = 1; i < 0x18; i++) {
    const [x, y] = at(i);
    Object.assign(actor(g, i), { tile: 0x84, anim: 0x84, x, y, z: 0 });
  }
}

describe('a slot for a new creature', () => {
  it('is an empty one first', () => {
    const g = night();
    fill(g, (i) => [70 + i, 95]);
    actor(g, 9).tile = 0;
    expect(freeActor(g)).toBe(9);
  });

  it('lets the farthest out-of-sight creature go, not slot 1', () => {
    const g = night();
    fill(g, (i) => [(86 - 6 - i) & 0xff, 110]); // 7 to 29 squares west, all out of sight
    expect(freeActor(g)).toBe(23);
    actor(g, 5).x = 86 + 40; // 40 east, the farthest now
    expect(freeActor(g)).toBe(5);
  });

  it('measures around the edge of the world', () => {
    const g = night();
    Object.assign(g.s, { x: 3, y: 3 });
    fill(g, (i) => [3 + 6 + i, 3]); // 7 to 29 east
    actor(g, 2).x = 250; // 9 west, around the edge
    expect(freeActor(g)).toBe(23);
  });

  it('keeps a wandering monster away when every creature is in sight', () => {
    const g = night();
    fill(g, (i) => [81 + (i % 11), 106 + Math.floor(i / 11)]);
    const before = actorList(g).map((a) => [a.tile, a.x, a.y]);
    expect(freeActor(g)).toBe(0);
    for (let n = 0; n < 300; n++) spawn(g);
    expect(actorList(g).map((a) => [a.tile, a.x, a.y])).toEqual(before);
  });

  it('still makes room for the trolls, a Shadowlord or an ambush with every creature in sight (must)', () => {
    const g = night();
    fill(g, (i) => [81 + (i % 11), 106 + Math.floor(i / 11)]);
    actor(g, 1).x = 81; // (81, 106): 5 away, as far as any
    actor(g, 1).y = 106;
    const i = freeActor(g, true);
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(0x18);
  });

  it('never takes one of the place’s people', () => {
    const { g } = newGame();
    journeyOnward(g);
    Object.assign(g.s, { mapId: 2, level: 0, x: 15, y: 15 });
    clearActors(g);
    for (let i = 1; i < 0x18; i++) {
      Object.assign(actor(g, i), { tile: 0x88, anim: 0x88, x: (i * 3) & 0x1f, y: 1, z: 0 });
      Object.assign(g.s.npcs[i], { actor: i, f0: 1 });
      g.s.npcTypes[i] = 0x88;
    }
    expect(freeActor(g)).toBe(0);
    expect(freeActor(g, true)).toBe(0);
    g.s.npcTypes[4] = 0; // a creature of no record, out of sight
    actor(g, 4).y = 30;
    expect(freeActor(g)).toBe(4);
  });
});

describe('the world put aside and brought back', () => {
  it('relocating keeps the stores', () => {
    const g = night();
    leaveVehicle(g, { kind: 'skiff', tile: 0x28, x: 87, y: 111, z: 0, hull: 0, skiffs: 0 });
    placeItem(g, { tile: 2, x: 88, y: 111, z: 0, amount: 9, b6: 0, b7: 0, unique: false, hidden: -1 });
    const stores = JSON.stringify(encodeObjects(g));
    Object.assign(actor(g, 3), { tile: 0x84, anim: 0x84, x: 90, y: 90, z: 0 });
    const table = copyActorTable(g);
    stashWorldActors(g);
    clearActors(g);
    Object.assign(g.s, { mapId: 5, level: 0 });
    Object.assign(g.s, { mapId: 0, level: 0 });
    unstashWorldActors(g);
    expect([...copyActorTable(g)]).toEqual([...table]);
    expect(JSON.stringify(encodeObjects(g))).toBe(stores);
  });
});
