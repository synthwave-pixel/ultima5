import { describe, expect, it } from 'vitest';
import { Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { talkToNpc } from '../src/game/talk.ts';
import { enterTown } from '../src/game/town.ts';
import { newGame } from './helpers.ts';
import { fly, Landed } from './pilot.ts';

/**
 * The game answers a list of words itself before a townsman's own are looked at: name, job, bye - and a good many
 * it scolds the player for. A townsman's keyword that begins as one of those can never be reached, in 1988 or now,
 * so it is not offered: said, it would cost the player a scolding and never get the answer.
 */
describe('the words a townsman is offered', () => {
  it('leave out one the game would take for swearing', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const { stashWorldActors } = await import('../src/game/outdoors.ts');
    stashWorldActors(g);
    Object.assign(s, { mapId: 24, level: 0, x: 15, y: 30, hour: 12 });
    await enterTown(g, true);
    // The bard of Buccaneer's Den sings of a pirate "so crotchety and misbehav'd", and answers to both words.
    const bard = [...Array(32).keys()].find((i) => i > 0 && s.npcs[i].fa === 35)!;
    g.words.learn(g, 'He was so crotchety and misbehaved, that pirate.');
    let labels: string[] = [];
    fly(g, p, [(game) => (game.menuShown?.title === 'Say' ? ((labels = game.menuShown.labels), undefined) : Pad.A)], 50);
    await talkToNpc(g, bard).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    expect(labels).toContain('Misbehaved');
    expect(labels).not.toContain('Crotchety');
  });
});
