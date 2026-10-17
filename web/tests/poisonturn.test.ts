import { describe, expect, it } from 'vitest';
import { Status } from '../src/game/save.ts';
import { endTurn } from '../src/game/time.ts';
import { newGame } from './helpers.ts';

/** Poison at a turn's end (the port's): every poisoned member hurt together, under one flash and one hit. */
describe('poison at the end of a turn', () => {
  it('hurts each poisoned member by one, sounding the hit once for all of them', async () => {
    const { g } = newGame();
    const s = g.s;
    g.soundOff = false;
    let hits = 0;
    const noise = g.sound.noise.bind(g.sound);
    g.sound.noise = (...a: Parameters<typeof noise>) => {
      hits++;
      return noise(...a);
    };
    for (let i = 0; i < s.partySize; i++) s.members[i].status = Status.Poisoned;
    const before = s.members.slice(0, s.partySize).map((m) => m.hp);
    await endTurn(g);
    expect(s.members.slice(0, s.partySize).map((m) => m.hp)).toEqual(before.map((hp) => hp - 1));
    expect(hits).toBe(1);
    // None poisoned: no hit at all.
    for (let i = 0; i < s.partySize; i++) s.members[i].status = Status.Good;
    await endTurn(g);
    expect(hits).toBe(1);
  });
});
