import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkOffer } from '../src/game/targets.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { newGame, type FakePlatform } from './helpers.ts';

/** Iolo's hut, where a new game begins, the party just south of Smith in his pen (27, 3). */
async function bySmith(): Promise<{ g: Game; p: FakePlatform }> {
  const { g, p } = newGame();
  journeyOnward(g);
  await enterTown(g, true);
  const s = g.s;
  const smith = s.npcs.findIndex((n) => n.fa === 13);
  expect([s.npcs[smith].x, s.npcs[smith].y, s.npcs[smith].z]).toEqual([27, 3, 0]);
  expect(s.actors[s.npcs[smith].actor].tile & 0xfc).toBe(0x10); // a horse to look at, not a person's figure
  Object.assign(s, { x: 27, y: 4 });
  g.options.input = 'controller';
  return { g, p };
}

/**
 * Smith, the talking horse (DWELLING.TLK 13, issue #3): one of the hut's people with a conversation, though his figure
 * is a horse's. The command menu offers Talk beside him, and walking into him talks, as Talk typed always did.
 */
describe('Smith the talking horse', () => {
  it('is offered Talk beside him', async () => {
    const { g } = await bySmith();
    expect(talkOffer(g)).toBe('show');
  });

  it('is talked to when walked into', async () => {
    const { g, p } = await bySmith();
    p.keys.push(K.Up);
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    expect(p.log.replace(/\s+/g, ' ')).toMatch(/strangely familiar horse/);
    expect([g.s.x, g.s.y]).toEqual([27, 4]);
  });
});
