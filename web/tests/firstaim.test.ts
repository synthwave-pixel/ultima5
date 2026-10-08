import { describe, expect, it } from 'vitest';
import { aim, placeCombatant } from '../src/game/combat.ts';
import type { Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame, type FakePlatform } from './helpers.ts';

/**
 * Where the aim starts: at the foe last struck, while it stands; with none, at the nearest foe in reach, the weakest
 * of those as near (the port's); with none in reach, on the member.
 */
describe('where the aim starts', () => {
  /** A field with the member at (5, 8) and giant rats where asked, each with its hit points. */
  const field = (...foes: [number, number, number][]): { g: Game; p: FakePlatform; me: number; at: number[] } => {
    const { g, p } = newGame(1);
    journeyOnward(g);
    for (const c of g.combat) c.flags = 0;
    for (const a of g.s.actors) a.tile = a.anim = 0;
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    const me = placeCombatant(g, 0, 1, 5, 8, 0);
    g.s.actors[g.combat[me].actor].b7 = 0xff; // no foe struck yet
    const at = foes.map(([x, y, hp]) => {
      const j = placeCombatant(g, rat, 0, x, y, 0);
      g.combat[j].hp = hp;
      return j;
    });
    return { g, p, me, at };
  };
  /** The square the aim starts on (the aim then backed out of). */
  const start = async (g: Game, p: FakePlatform, me: number, range: number): Promise<[number, number]> => {
    p.keys.push(K.Escape);
    await aim(g, me, range);
    return [g.s.crossX, g.s.crossY];
  };

  it('starts on the nearest foe, the weakest of two as near', async () => {
    const { g, p, me } = field([5, 3, 1], [6, 6, 12], [4, 6, 4]);
    expect(await start(g, p, me, 8)).toEqual([4, 6]);
  });

  it('starts on the foe last struck while it stands, near or not', async () => {
    const { g, p, me, at } = field([5, 3, 1], [4, 6, 4]);
    g.s.actors[g.combat[me].actor].b7 = at[0];
    expect(await start(g, p, me, 8)).toEqual([5, 3]);
  });

  it('starts on the member where no foe is in reach', async () => {
    const { g, p, me } = field([5, 1, 3]);
    expect(await start(g, p, me, 2)).toEqual([5, 8]);
  });
});
