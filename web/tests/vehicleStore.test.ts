// web/tests/vehicleStore.test.ts
// Vehicles live in their own store, never taken for a creature (#69).
import { describe, expect, it } from 'vitest';
import { actor, actorTileAt, clearActors, party, thingsAt } from '../src/game/actors.ts';
import { boardCommand, xitCommand } from '../src/game/cmds.ts';
import { takePrize } from '../src/game/combat.ts';
import type { Game } from '../src/game/game.ts';
import { leaveVehicle, vehicleAt, vehiclesHere } from '../src/game/objectStores.ts';
import { enterWorld, spawn } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { loadLevel } from '../src/game/town.ts';
import { Pad } from '../src/game/io.ts';
import { getCommand } from '../src/game/items.ts';
import { updateFrame } from '../src/game/frame.ts';
import { newGame } from './helpers.ts';

/** Out on the surface at (x, y) - else by Britain, on dry land - at 1 in the morning, in `vehicle`. */
function at(vehicle: number, x?: number, y?: number): Game {
  const { g } = newGame();
  journeyOnward(g);
  Object.assign(g.s, { mapId: 0, level: 0, hour: 1, minute: 0, partyTile: vehicle });
  Object.assign(g.s, { x: x ?? 86, y: y ?? 110 });
  clearActors(g);
  enterWorld(g);
  updateFrame(g);
  return g;
}

/** Every creature slot (1-23) a pirate ship out of sight, as the sea by the Codex fills in a night. */
function pirates(g: Game): void {
  for (let i = 1; i < 0x18; i++)
    Object.assign(actor(g, i), {
      tile: 0x2c,
      anim: 0x2c,
      x: (g.s.x - 14 + (i % 8)) & 0xff,
      y: (g.s.y - 12 + (i >> 3)) & 0xff,
      z: 0,
      b5: 100,
    });
}

describe('vehicles left in the world (#69)', () => {
  it('a frigate left at sea by the Codex outlasts a sea full of pirates', async () => {
    const g = at(0x24, 225, 225);
    party(g).b5 = 80;
    party(g).b7 = 1;
    await xitCommand(g); // into her skiff
    expect(g.s.partyTile).toBe(0x28);
    pirates(g);
    for (let n = 0; n < 500; n++) spawn(g);
    const ship = vehicleAt(g, 225, 225, 0);
    expect(ship?.kind).toBe('frigate');
    expect([ship?.hull, ship?.skiffs]).toEqual([80, 0]);
    for (let i = 1; i < 32; i++) expect(actor(g, i).tile & 0xfc).not.toBe(0x24);
  });

  it('leaves the carpet where it was, and boards it again', async () => {
    const g = at(0x14);
    const { x, y } = g.s;
    await xitCommand(g);
    expect(g.s.partyTile).toBe(0x1c);
    expect(vehicleAt(g, x, y, 0)?.kind).toBe('carpet');
    pirates(g);
    for (let n = 0; n < 500; n++) spawn(g);
    expect(vehicleAt(g, x, y, 0)?.kind).toBe('carpet');
    await boardCommand(g);
    expect(g.s.partyTile).toBe(0x14);
    expect(vehiclesHere(g)).toEqual([]);
  });

  it('a carpet left lying is taken up with Get', async () => {
    const g = at(0x1c);
    leaveVehicle(g, { kind: 'carpet', tile: 0x1b, x: g.s.x, y: g.s.y, z: 0, hull: 0, skiffs: 0 });
    const carpets = g.s.carpets;
    g.options.input = 'controller';
    (g.p as unknown as { keys: number[] }).keys.push(Pad.A); // A at the prompt: what lies underfoot
    await getCommand(g);
    expect(g.s.carpets).toBe(carpets + 1);
    expect(vehiclesHere(g)).toEqual([]);
  });

  it('boards and leaves a horse and a frigate, keeping facing, hull and skiffs', async () => {
    const g = at(0x24, 225, 225);
    leaveVehicle(g, { kind: 'frigate', tile: 0x26, x: 225, y: 225, z: 0, hull: 77, skiffs: 2 });
    g.s.partyTile = 0x1c;
    await boardCommand(g);
    expect([g.s.partyTile, party(g).b5, party(g).b7]).toEqual([0x26, 77, 2]);
    expect(vehiclesHere(g)).toEqual([]);
    const h = at(0x13); // riding, facing left
    await xitCommand(h);
    expect(vehicleAt(h, h.s.x, h.s.y, 0)?.tile).toBe(0x11);
    await boardCommand(h);
    expect(h.s.partyTile).toBe(0x13);
  });

  it('keeps a vehicle to its own level and world', () => {
    const g = at(0x1c, 225, 227);
    leaveVehicle(g, { kind: 'skiff', tile: 0x28, x: 224, y: 227, z: 0, hull: 0, skiffs: 0 });
    expect(actorTileAt(g, 224, 227, 0)).toBe(0x28);
    g.s.level = 0xff;
    expect(actorTileAt(g, 224, 227, 0xff)).toBe(0);
    Object.assign(g.s, { mapId: 5, level: 1 });
    leaveVehicle(g, { kind: 'horse', tile: 0x10, x: 10, y: 10, z: 1, hull: 0, skiffs: 0 });
    expect(actorTileAt(g, 10, 10, 1)).toBe(0x10);
    g.s.level = 0;
    expect(actorTileAt(g, 10, 10, 0)).toBe(0);
  });

  it('a creature over a parked horse is met first, the horse beneath it', () => {
    const g = at(0x1c);
    const x = g.s.x + 1;
    const y = g.s.y;
    const v = leaveVehicle(g, { kind: 'horse', tile: 0x11, x, y, z: 0, hull: 0, skiffs: 0 });
    Object.assign(actor(g, 5), { tile: 0x84, anim: 0x84, x, y, z: 0 });
    expect(thingsAt(g, x, y, 0)).toEqual([
      { kind: 'creature', slot: 5, tile: 0x84 },
      { kind: 'vehicle', v, tile: 0x11 },
    ]);
    expect(actorTileAt(g, x, y, 0)).toBe(0x84);
    expect(g.s.dx).toBe(5);
    g.viewDirty = 1;
    updateFrame(g);
    expect(g.actorMap[5 * 16 + 6] & 0xfc).toBe(0x84);
    actor(g, 5).tile = actor(g, 5).anim = 0;
    g.viewDirty = 1;
    updateFrame(g);
    expect(g.actorMap[5 * 16 + 6] & 0xfe).toBe(0x10);
  });

  it('a prize taken with three frigates in sight lets the oldest go', () => {
    const g = at(0x28, 225, 225);
    const first = leaveVehicle(g, { kind: 'frigate', tile: 0x24, x: 223, y: 225, z: 0, hull: 50, skiffs: 1 });
    leaveVehicle(g, { kind: 'frigate', tile: 0x24, x: 224, y: 224, z: 0, hull: 50, skiffs: 1 });
    leaveVehicle(g, { kind: 'frigate', tile: 0x24, x: 226, y: 224, z: 0, hull: 50, skiffs: 1 });
    Object.assign(actor(g, 7), { tile: 0x2e, anim: 0x2e, x: 226, y: 225, z: 0, b5: 10 });
    g.s.battleWon = 1;
    takePrize(g, 7);
    expect(actor(g, 7).tile).toBe(0);
    expect(vehiclesHere(g).length).toBe(3);
    expect(vehiclesHere(g)).not.toContain(first);
    const prize = vehicleAt(g, 226, 225, 0);
    expect([prize?.tile, prize?.hull, prize?.skiffs]).toEqual([0x26, 99, 2]);
  });

  it('a horse ridden into a towne is there on the next visit', async () => {
    const { g } = newGame();
    journeyOnward(g);
    Object.assign(g.s, { mapId: 2, level: 0, x: 15, y: 30, hour: 10, partyTile: 0x12 });
    loadLevel(g, true);
    updateFrame(g);
    await xitCommand(g);
    expect(vehicleAt(g, 15, 30, 0)?.kind).toBe('horse');
    Object.assign(g.s, { mapId: 0, level: 0, x: 50, y: 50 });
    clearActors(g);
    Object.assign(g.s, { mapId: 2, level: 0, x: 15, y: 29 });
    loadLevel(g, true);
    expect(actorTileAt(g, 15, 30, 0)).toBe(0x10);
  });
});
