import { describe, expect, it } from 'vitest';
import { K } from '../src/game/io.ts';
import { enterWorld, outdoorsLoop } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { tileAt } from '../src/game/world.ts';
import { newGame } from './helpers.ts';

/** The Underworld's dark round Doom: no way about in it without the Amulet, and no trap for a party that strays in. */
describe('the dark round Doom', () => {
  const at = (x: number, y: number) => {
    const made = newGame();
    const { g } = made;
    journeyOnward(g);
    Object.assign(g.s, { mapId: 0, level: 0xff, x, y, partyTile: 0x1c });
    enterWorld(g);
    for (let i = 1; i < 0x20; i++) g.s.actors[i].tile = 0; // nothing about
    return made;
  };
  const walk = async (g: ReturnType<typeof newGame>['g'], p: ReturnType<typeof newGame>['p'], key: number) => {
    p.keys.push(key);
    await outdoorsLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
  };

  it('keeps a party without the Amulet out of it: Blocked!', async () => {
    const { g, p } = at(122, 126);
    expect(tileAt(g, 123, 126)).toBe(0xff);
    await walk(g, p, K.Right);
    expect([g.s.x, g.s.y]).toEqual([122, 126]);
    expect(p.log).toMatch(/Blocked!/);
  });

  it('lets a party caught in it step back out to the light', async () => {
    const { g, p } = at(123, 126);
    expect(tileAt(g, 122, 126)).not.toBe(0xff);
    await walk(g, p, K.Left);
    expect([g.s.x, g.s.y]).toEqual([122, 126]);
  });

  it('shows the party standing in it, in the Standard look (the EGA look, as 1988, does not)', async () => {
    const { overlayActors } = await import('../src/game/world.ts');
    for (const look of ['standard', 'original'] as const) {
      const { g } = at(123, 126);
      g.options.tileSet = look;
      g.regalia = 0x0e;
      g.view[5 * 32 + 5] = 0xff; // the party's square, dark
      g.actorMap.fill(0);
      overlayActors(g);
      expect(g.actorMap[5 * 16 + 5] !== 0, look).toBe(look === 'standard');
    }
  });

  it('lets a party wearing the Amulet walk in', async () => {
    const { g, p } = at(122, 126);
    g.regalia = 0x0e;
    await walk(g, p, K.Right);
    expect([g.s.x, g.s.y]).toEqual([123, 126]);
  });
});
