import { describe, expect, it } from 'vitest';
import { DEV_CHEATS } from '../src/game/cheats.ts';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';
import { fly, Landed } from './pilot.ts';

/** The development build's auto kill: a fight is won the moment it is the party's turn, and nothing was pressed for it. */
describe('auto kill', () => {
  it('is a cheat of the development build that turns on and off', () => {
    const { g } = newGame();
    const on = DEV_CHEATS.find((c) => c.label === 'Auto kill: Off')!;
    const off = DEV_CHEATS.find((c) => c.label === 'Auto kill: On')!;
    expect(on.available(g)).toBe(true);
    expect(off.available(g)).toBe(false);
    void on.apply(g);
    expect(g.autoKill).toBe(true);
    expect(off.available(g)).toBe(true);
    void off.apply(g);
    expect(g.autoKill).toBe(false);
  });

  it('wins a fight with the giant rats before a blow is struck', async () => {
    const { g, p } = newGame(6);
    journeyOnward(g);
    const s = g.s;
    const { attackCombat } = await import('../src/game/combat.ts');
    const { enterTown, townLoop } = await import('../src/game/town.ts');
    await enterTown(g, true);
    p.keys.push(K.Down, K.Down, K.Down, 0x4f, K.Down, ...Array<number>(14).fill(K.Down), 0x59);
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    p.log = '';
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    Object.assign(s.actors[1], { tile: 0x40 + rat * 4, anim: 0x40 + rat * 4, x: s.x + 1, y: s.y, z: 0 });
    g.autoKill = true;
    // Pressed until the field is won - B, which strikes no blow; how the party then leaves it (by B, or past the
    // treasure a rat may have dropped) is not this test's.
    fly(g, p, [() => (/VICTORY/.test(p.log) ? undefined : Pad.B)], 400);
    try {
      await attackCombat(g, 1);
    } catch (e) {
      if (!(e instanceof Landed)) throw e;
    }
    expect(p.log).toMatch(/VICTORY/);
    expect(p.log).not.toMatch(/Attack/);
  });
});
