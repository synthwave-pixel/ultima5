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

  it('asks at the first bump on foot, and climbs at the next', async () => {
    const { g, p, at } = beside(0x1c, 1);
    await walk(g, p);
    expect(p.log).toContain('Confirm climb?');
    expect(p.log).not.toMatch(/Klimb|Blocked/);
    expect(g.s.x).toBe(at[0]);
    await walk(g, p);
    expect(p.log).toMatch(/Klimb/);
    expect(p.log).not.toMatch(/Blocked/);
    expect(g.s.x).toBe(at[0] + 1);
  });

  it('asks again where the bump that would confirm comes later than the next turn', async () => {
    const { g, p, at } = beside(0x1c, 1);
    await walk(g, p);
    g.turnsTaken += 2; // turns gone by: a pass, a look about
    await walk(g, p);
    expect(p.log.match(/Confirm climb\?/g)).toHaveLength(2);
    expect(g.s.x).toBe(at[0]);
  });

  it('hurts all who fall under one hit, each by their own fall', async () => {
    const { g, p, at } = beside(0x1c, 1);
    g.s.members.forEach((m) => (m.dex = 0)); // every one falls
    g.soundOff = false;
    let hits = 0;
    const noise = g.sound.noise.bind(g.sound);
    g.sound.noise = (...a: Parameters<typeof noise>) => {
      if (a.join() === '10,1600,2000') hits++; // the damage hit (time.ts damageMembers)
      return noise(...a);
    };
    const before = g.s.members.slice(0, g.s.partySize).map((m) => m.hp);
    await walk(g, p);
    await walk(g, p);
    expect(g.s.x).toBe(at[0] + 1);
    expect(p.log.match(/Fell!/g)).toHaveLength(g.s.partySize);
    const lost = g.s.members.slice(0, g.s.partySize).map((m, i) => before[i] - m.hp);
    for (const n of lost) expect(n >= 1 && n <= 5).toBe(true);
    expect(hits).toBe(1);
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
