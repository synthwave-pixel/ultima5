import { describe, expect, it } from 'vitest';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { keys, newGame } from './helpers.ts';

describe('someone found asleep', () => {
  it('is noted in the journal with the hours they are up, from their own day', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    stashWorldActors(g);
    Object.assign(s, { mapId: 7, level: 0, x: 15, y: 30, hour: 12 });
    await enterTown(g, true);
    // The sickly bard of New Magincia is abed at noon: stand south of him and talk north.
    const abed = s.actors[s.npcs[6].actor];
    Object.assign(s, { x: abed.x, y: abed.y + 1 });
    p.keys.push(...keys('T', K.Up));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    expect(p.log).toContain('Zzzzzz');
    expect(p.log).toContain('Journal updated');
    const note = g.notes.find((n) => n.text.startsWith('Asleep.'));
    expect(note?.text).toBe('Asleep. Up and about from 17:00 to 19:00.');
    // Asked again, nothing new is written.
    const before = g.notes.length;
    p.keys.push(...keys('T', K.Up));
    await townLoop(g).catch(() => {});
    expect(g.notes.length).toBe(before);
  });
});
