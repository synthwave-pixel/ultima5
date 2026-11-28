// web/tests/moonstoneStore.test.ts
// Moonstones and the Underworld's regalia drawn from their own records, needing no actor (#69).
import { describe, expect, it } from 'vitest';
import { actor, clearActors, thingsAt } from '../src/game/actors.ts';
import { updateFrame } from '../src/game/frame.ts';
import type { Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { getCommand, searchCommand } from '../src/game/items.ts';
import { enterWorld, spawn } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { type FakePlatform, newGame } from './helpers.ts';

/** Out in the world at (x, y), surface or Underworld, at `hour`. */
function outside(x: number, y: number, under = false, hour = 1): { g: Game; p: FakePlatform } {
  const { g, p } = newGame();
  journeyOnward(g);
  Object.assign(g.s, { mapId: 0, level: under ? 0xff : 0, x, y, hour, minute: 0, partyTile: 0x1c });
  clearActors(g);
  enterWorld(g);
  updateFrame(g);
  return { g, p };
}

describe('a moonstone', () => {
  it('dug up shows where it lies, stays through a crowded night, and is taken with Get', async () => {
    // By day: at night a moongate rises over a buried stone, and Search there finds the gate.
    const { g, p } = outside(90, 110, false, 10);
    const s = g.s;
    Object.assign(s.moonstoneX, { 3: 90 });
    Object.assign(s.moonstoneY, { 3: 111 });
    Object.assign(s.moonstoneZ, { 3: 0 });
    Object.assign(s.moonstoneHeld, { 3: 0 });
    p.keys.push(K.Down, K.Enter);
    await searchCommand(g);
    expect(p.log).toMatch(/strange rock/);
    expect(thingsAt(g, 90, 111, 0)).toEqual([{ kind: 'moonstone', stone: 3, tile: 0x19 }]);
    for (let i = 1; i < 0x18; i++) Object.assign(actor(g, i), { tile: 0x84, anim: 0x84, x: 70 + (i % 8), y: 96 + (i >> 3), z: 0 });
    for (let n = 0; n < 200; n++) spawn(g);
    expect(thingsAt(g, 90, 111, 0)).toEqual([{ kind: 'moonstone', stone: 3, tile: 0x19 }]);
    p.keys.push(K.Down);
    await getCommand(g);
    expect(s.moonstoneHeld[3]).toBe(0xff);
    expect(g.objects.uncovered & 8).toBe(0);
    expect(thingsAt(g, 90, 111, 0)).toEqual([]);
  });
});

describe('the Amulet and the shards', () => {
  it('lie in the Underworld until taken, leaving the creatures their slots', async () => {
    const { g, p } = outside(0x69, 0xe0, true);
    const s = g.s;
    expect(thingsAt(g, 0x69, 0xe1, 0xff)).toEqual([{ kind: 'regalia', which: 0, tile: 0xb7 }]);
    const xs = g.data.bytes(0x3a06, 3);
    const ys = g.data.bytes(0x3a0a, 3);
    for (let i = 0; i < 3; i++) expect(thingsAt(g, xs[i], ys[i], 0xff)).toEqual([{ kind: 'regalia', which: 1 + i, tile: 0xb4 }]);
    for (let i = 28; i < 32; i++) expect(actor(g, i).tile).toBe(0);
    p.keys.push(K.Down);
    await getCommand(g);
    expect(s.amulet).toBe(0xff);
    expect(thingsAt(g, 0x69, 0xe1, 0xff)).toEqual([]);
  });

  it('a shard used on its Shadowlord is not there again', () => {
    const { g } = newGame();
    journeyOnward(g);
    g.s.shadowlords[1] = 0x80;
    Object.assign(g.s, { mapId: 0, level: 0xff });
    const xs = g.data.bytes(0x3a06, 3);
    const ys = g.data.bytes(0x3a0a, 3);
    expect(thingsAt(g, xs[1], ys[1], 0xff)).toEqual([]);
    expect(thingsAt(g, xs[0], ys[0], 0xff).length).toBe(1);
  });
});
