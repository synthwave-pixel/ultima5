import { describe, expect, it } from 'vitest';
import { lookInDungeon } from '../src/game/dungeon.ts';
import { Pad } from '../src/game/io.ts';
import { commandMenu } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';
import { fly, Landed, pick, press } from './pilot.ts';

/** A dungeon's fountain, by controller: Drink in the command menu, standing on it or facing it (the port's). */
describe('Drink at a fountain', () => {
  const at = (fountain: 'here' | 'ahead', lit = true) => {
    const made = newGame();
    const { g } = made;
    journeyOnward(g);
    Object.assign(g.s, { mapId: 0x21, level: 0, x: 1, y: 1, facing: 1, d58a7: lit ? 0xff : 0, d58a6: 0 });
    g.s.dungeon.fill(0x00);
    g.s.dungeon[fountain === 'here' ? 1 * 8 + 1 : 1 * 8 + 2] = 0x51; // a healing fountain, here or east
    g.s.actors[1].x = g.s.actors[1].y = 0xff; // no creature about
    g.s.members[0].hp = 3;
    return made;
  };

  /** The command menu's lines, then Drink chosen from it (or B, where it is not there to choose). */
  const drink = async (g: ReturnType<typeof at>['g'], p: ReturnType<typeof at>['p']): Promise<{ labels: string[]; key: number }> => {
    let labels: string[] = [];
    fly(g, p, [
      (game) => {
        labels = [...(game.menuShown?.labels ?? [])];
        return undefined;
      },
      pick('Commands', 'Drink'),
    ]);
    g.commandPrompt = 'dungeon';
    const key = await commandMenu(g).catch((e: unknown) => {
      if (e instanceof Landed) return -1;
      throw e;
    });
    return { labels, key };
  };

  it('is offered standing on a fountain, and drinks from it without asking the way or whether', async () => {
    const { g, p } = at('here');
    const { labels, key } = await drink(g, p);
    expect(labels).toContain('Drink');
    expect(key).toBe(0x4c); // Look, its way given
    fly(g, p, [press(Pad.A)]); // "Player:" the Avatar drinks
    await lookInDungeon(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(p.log).toContain('Here');
    expect(p.log).toContain('Healed!');
    expect(p.log).not.toContain('Will you drink?\nNo');
    expect(g.s.members[0].hp).toBe(g.s.members[0].maxHp);
  });

  it('is offered facing one, and drinks from the one ahead', async () => {
    const { g, p } = at('ahead');
    const { labels } = await drink(g, p);
    expect(labels).toContain('Drink');
    fly(g, p, [press(Pad.A)]);
    await lookInDungeon(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(p.log).toContain('Ahead');
    expect(g.s.members[0].hp).toBe(g.s.members[0].maxHp);
  });

  it('is grey in the dark, where Look sees nothing', async () => {
    const { g, p } = at('here', false);
    let enabled: boolean | undefined;
    fly(g, p, [
      (game) => {
        const m = game.menuShown!;
        enabled = m.enabled[m.labels.indexOf('Drink')];
        return Pad.B;
      },
    ]);
    g.commandPrompt = 'dungeon';
    await commandMenu(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(enabled).toBe(false);
  });

  it('is not offered away from a fountain', async () => {
    const { g, p } = at('ahead');
    g.s.facing = 2; // the fountain to the party's side now
    let labels: string[] = [];
    fly(g, p, [
      (game) => {
        labels = [...(game.menuShown?.labels ?? [])];
        return Pad.B;
      },
    ]);
    g.commandPrompt = 'dungeon';
    await commandMenu(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(labels).not.toContain('Drink');
  });
});
