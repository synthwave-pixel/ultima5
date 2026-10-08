import { describe, expect, it } from 'vitest';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { keys, newGame } from './helpers.ts';

/**
 * Walking into a settlement's daemon (town.ts bump): one with nothing to say is spoken to, not struck - striking a
 * daemon in a settlement calls the guards. Windemere keeps two (its NPCs 10 and 11, no conversation).
 */
describe('walking into a silent daemon', () => {
  it('talks to it ("No response!") and calls no guards', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.mapId = g.data.locations.findIndex((l) => l.name === 'WINDEMERE') + 1;
    await enterTown(g, true);
    const npc = [10, 11].find((i) => s.npcs[i].f0 !== 0 && s.npcs[i].actor !== 0)!;
    const a = s.actors[s.npcs[npc].actor];
    expect(a.tile & 0xfc).toBe(0xd8);
    Object.assign(s, { x: a.x - 1, y: a.y, level: a.z });
    const karma = s.karma;
    p.keys.push(...keys(K.Right));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    expect(p.log).toContain('No response');
    expect(p.log).not.toContain('Attack');
    expect(s.karma).toBe(karma);
  });
});
