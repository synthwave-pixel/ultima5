import { describe, expect, it } from 'vitest';
import { K } from '../src/game/io.ts';
import { enterWorld, outdoorsLoop } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { T } from '../src/game/tiles.ts';
import { setTileAt } from '../src/game/world.ts';
import { newGame } from './helpers.ts';

/**
 * The grapple's mountains walked into (the port's): climbed on foot, as Klimb climbs them; ridden, flown or sailed into,
 * "Blocked" says what is in the way of the climb. Without the grapple, a mountain is "Blocked!" as ever.
 */
describe('a mountain walked into with the grapple', () => {
  const beside = (partyTile: number, grapple: number) => {
    const made = newGame();
    const { g } = made;
    journeyOnward(g);
    Object.assign(g.s, { mapId: 0, level: 0 });
    enterWorld(g);
    // A climbable mountain set east of the party, on grass.
    const at: [number, number] = [g.s.x, g.s.y];
    setTileAt(g, at[0], at[1], T.Grass);
    setTileAt(g, at[0] + 1, at[1], 0x0c);
    Object.assign(g.s, { partyTile, grapple });
    for (let i = 1; i < 0x20; i++) g.s.actors[i].tile = 0; // nothing about
    g.s.members.forEach((m) => (m.dex = 40)); // none falls
    return { ...made, at };
  };
  const walk = async (g: ReturnType<typeof newGame>['g'], p: ReturnType<typeof newGame>['p']) => {
    p.keys.push(K.Right);
    await outdoorsLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
  };

  it('climbs it on foot', async () => {
    const { g, p, at } = beside(0x1c, 1);
    await walk(g, p);
    expect(p.log).toMatch(/Klimb/);
    expect(p.log).not.toMatch(/Blocked/);
    expect(g.s.x).toBe(at[0] + 1);
  });

  it('says to dismount on horseback, and to leave the carpet', async () => {
    for (const [tile, why] of [
      [0x12, 'Blocked - dismount!'],
      [0x14, 'Blocked - off the carpet!'],
    ] as const) {
      const { g, p, at } = beside(tile, 1);
      await walk(g, p);
      expect(p.log.replace(/\s+/g, ' ')).toContain(why);
      expect(g.s.x).toBe(at[0]);
    }
  });

  it('is only Blocked! without the grapple', async () => {
    const { g, p, at } = beside(0x12, 0);
    await walk(g, p);
    expect(p.log).toMatch(/Blocked!/);
    expect(p.log).not.toMatch(/Blocked - /);
    expect(g.s.x).toBe(at[0]);
  });
});
