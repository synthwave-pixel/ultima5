// web/tests/objectMigration.test.ts
// Saves from before the stores, and a new game's tables, bring their vehicles and things into the stores (#69).
import { describe, expect, it } from 'vitest';
import { actor, actorList, clearActors } from '../src/game/actors.ts';
import type { Game } from '../src/game/game.ts';
import { freshObjects, migrateActorTables } from '../src/game/objectMigration.ts';
import { itemsHere, vehiclesHere } from '../src/game/objectStores.ts';
import { journeyOnward } from '../src/game/run.ts';
import { parseSave, restore, serialize } from '../src/game/ultima5Saves.ts';
import { newGame } from './helpers.ts';

/** Slot `i` of a table's bytes (the live one, or BRIT.OOL / UNDER.OOL) set to an actor. */
function put(bytes: Uint8Array, i: number, tile: number, x: number, y: number, z: number, b5 = 0, b7 = 0): void {
  bytes.set([tile, tile, x, y, z, b5, 0, b7], i * 8);
}

/** A game on the surface at (100, 100), its tables empty. */
function surface(): Game {
  const { g } = newGame();
  journeyOnward(g);
  Object.assign(g.s, { mapId: 0, level: 0, x: 100, y: 100, partyTile: 0x1c });
  clearActors(g);
  g.ool.brit.fill(0);
  g.ool.under.fill(0);
  return g;
}

/** A save of `g` written before the stores (no `objects` field), loaded into a new game. */
function oldSaveOf(g: Game): Game {
  const d = serialize(g);
  delete d.objects;
  const { g: g2 } = newGame();
  restore(g2, parseSave(JSON.stringify(d)));
  return g2;
}

describe('an old save', () => {
  it("moves its vehicles and things into their places' stores, none left in the tables", () => {
    const g = surface();
    Object.assign(actor(g, 3), { tile: 0x25, anim: 0x25, x: 105, y: 100, z: 0, b5: 70, b7: 1 });
    Object.assign(actor(g, 4), { tile: 0x29, anim: 0x29, x: 106, y: 100, z: 0 });
    Object.assign(actor(g, 5), { tile: 0x1b, anim: 0x1b, x: 107, y: 100, z: 0 });
    Object.assign(actor(g, 6), { tile: 0x11, anim: 0x11, x: 108, y: 100, z: 0 });
    Object.assign(actor(g, 7), { tile: 0x0f, anim: 0x0f, x: 109, y: 100, z: 0, b5: 4 });
    Object.assign(actor(g, 8), { tile: 0x01, anim: 0x01, x: 110, y: 100, z: 0, b5: 0x85 });
    Object.assign(actor(g, 9), { tile: 0x84, anim: 0x84, x: 111, y: 100, z: 0 });
    put(g.ool.under, 23, 0x28, 20, 20, 0xff);
    const g2 = oldSaveOf(g);
    Object.assign(g2.s, { mapId: 0, level: 0 });
    expect(vehiclesHere(g2).map((v) => [v.kind, v.tile, v.x, v.hull, v.skiffs])).toEqual([
      ['frigate', 0x25, 105, 70, 1],
      ['skiff', 0x29, 106, 0, 0],
      ['carpet', 0x1b, 107, 0, 0],
      ['horse', 0x11, 108, 0, 0],
    ]);
    expect(itemsHere(g2).map((it) => [it.tile, it.x, it.amount])).toEqual([
      [0x0f, 109, 4],
      [0x01, 110, 0x85],
    ]);
    expect(
      actorList(g2)
        .slice(1)
        .filter((a) => a.tile !== 0)
        .map((a) => a.tile),
    ).toEqual([0x84]);
    g2.s.level = 0xff;
    expect(vehiclesHere(g2).map((v) => [v.kind, v.x, v.y])).toEqual([['skiff', 20, 20]]);
    expect([...g2.ool.under.subarray(23 * 8, 24 * 8)].every((b) => b === 0)).toBe(true);
  });

  it('keeps the nearest three of a kind', () => {
    const g = surface();
    for (let i = 0; i < 5; i++) Object.assign(actor(g, 1 + i), { tile: 0x24, anim: 0x24, x: 100 + 50 - i * 10, y: 100, z: 0, b5: 99 });
    const g2 = oldSaveOf(g);
    Object.assign(g2.s, { mapId: 0, level: 0 });
    expect(
      vehiclesHere(g2)
        .map((v) => v.x)
        .sort((a, b) => a - b),
    ).toEqual([110, 120, 130]);
  });

  it("migrates a towne save's own table, the place's people left as they are", () => {
    const { g } = newGame();
    journeyOnward(g);
    Object.assign(g.s, { mapId: 2, level: 0, x: 15, y: 15, partyTile: 0x1c });
    clearActors(g);
    Object.assign(actor(g, 3), { tile: 0x10, anim: 0x10, x: 10, y: 10, z: 0 }); // a horse the party left
    Object.assign(actor(g, 4), { tile: 0x10, anim: 0x10, x: 11, y: 10, z: 0 }); // one of the place's
    Object.assign(g.s.npcs[4], { actor: 4, f0: 1 });
    g.s.npcTypes[4] = 0x10;
    Object.assign(actor(g, 5), { tile: 0x0e, anim: 0x0e, x: 12, y: 10, z: 0 }); // the sandalwood box, the place's
    Object.assign(g.s.npcs[5], { actor: 5, f0: 1 });
    g.s.npcTypes[5] = 0x0e;
    Object.assign(actor(g, 6), { tile: 0x01, anim: 0x01, x: 13, y: 10, z: 0 }); // a chest
    migrateActorTables(g);
    expect(vehiclesHere(g).map((v) => [v.kind, v.x])).toEqual([['horse', 10]]);
    expect(itemsHere(g).map((it) => [it.tile, it.x])).toEqual([[0x01, 13]]);
    expect([actor(g, 3).tile, actor(g, 4).tile, actor(g, 5).tile, actor(g, 6).tile]).toEqual([0, 0x10, 0x0e, 0]);
  });

  it('marks a moonstone dug up as uncovered, and drops the regalia (drawn from their records now)', () => {
    const g = surface();
    Object.assign(g.s.moonstoneX, { 2: 104 });
    Object.assign(g.s.moonstoneY, { 2: 100 });
    Object.assign(g.s.moonstoneZ, { 2: 0 });
    Object.assign(g.s.moonstoneHeld, { 2: 0 });
    Object.assign(actor(g, 3), { tile: 0x19, anim: 0x19, x: 104, y: 100, z: 0, b5: 2 });
    put(g.ool.under, 28, 0xb7, 0x69, 0xe1, 0xff, 0xf3);
    put(g.ool.under, 29, 0xb4, 1, 2, 0xff, 0);
    const g2 = oldSaveOf(g);
    expect(g2.objects.uncovered).toBe(4);
    expect(actor(g2, 3).tile).toBe(0);
    expect(g2.ool.under[28 * 8]).toBe(0);
    expect(g2.ool.under[29 * 8]).toBe(0);
  });

  it("leaves a dungeon's own table alone: its creature's tile numbers are not the world's", () => {
    const { g } = newGame();
    journeyOnward(g);
    Object.assign(g.s, { mapId: 0x23, level: 2, x: 1, y: 1, partyTile: 0x1c });
    clearActors(g);
    Object.assign(actor(g, 1), { tile: 3, anim: 3, x: 5, y: 6, z: 2, b5: 0x10 }); // a wandering creature, kind 3
    const g2 = oldSaveOf(g);
    expect([actor(g2, 1).tile, actor(g2, 1).x, actor(g2, 1).b5]).toEqual([3, 5, 0x10]);
    Object.assign(g2.s, { mapId: 0x23, level: 2 });
    expect(itemsHere(g2)).toEqual([]);
  });

  it('a save with the field is left as it is', () => {
    const g = surface();
    Object.assign(actor(g, 3), { tile: 0x84, anim: 0x84, x: 105, y: 100, z: 0 });
    const { g: g2 } = newGame();
    restore(g2, parseSave(JSON.stringify(serialize(g))));
    expect(actor(g2, 3).tile).toBe(0x84);
  });
});

describe('a new game', () => {
  it("brings INIT.OOL's Underworld skiff and bodies into the Underworld's stores", () => {
    const { g } = newGame();
    journeyOnward(g);
    g.ool.brit.fill(0);
    g.ool.under.set(g.data.files.get('INIT.OOL').subarray(0, 256));
    const tiles = [...g.ool.under].filter((_, k) => k % 8 === 0);
    freshObjects(g);
    Object.assign(g.s, { mapId: 0, level: 0xff });
    expect(vehiclesHere(g).filter((v) => v.kind === 'skiff').length).toBe(tiles.filter((t) => (t & 0xfc) === 0x28).length);
    expect(vehiclesHere(g).length).toBeGreaterThan(0);
    expect(itemsHere(g).filter((it) => it.tile === 0x1e || it.tile === 0x1f).length).toBe(
      tiles.filter((t) => t === 0x1e || t === 0x1f).length,
    );
    const left = [...g.ool.under].filter((_, k) => k % 8 === 0);
    expect(left.some((t) => (t & 0xfc) === 0x28 || t === 0x1e || t === 0x1f)).toBe(false);
  });
});
