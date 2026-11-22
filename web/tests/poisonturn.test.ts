import { describe, expect, it } from 'vitest';
import { Status } from '../src/game/save.ts';
import { drawVitals } from '../src/game/frame.ts';
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

  /** A game with its first `n` members poisoned, its flash's timer held till `done` is called, its inversions noted. */
  const poisoned = (n: number) => {
    const { g } = newGame();
    for (let i = 0; i < n; i++) g.s.members[i].status = Status.Poisoned;
    const inverted: number[] = [];
    g.draw.invert = (_x1: number, y1: number) => void inverted.push((y1 - 8) / 8); // invertMember: row i at i*8+8
    let done = (): void => {};
    g.p.sleep = () => new Promise<void>((r) => (done = r));
    return { g, inverted, done: async () => (done(), await Promise.resolve(), await Promise.resolve()) };
  };

  it("does not wait for the hit's sound: the next move is taken at once", async () => {
    const { g } = poisoned(2);
    g.soundOff = false;
    g.sound.noise = () => new Promise<void>(() => {}); // a sound that never ends
    const ended = await Promise.race([endTurn(g).then(() => 'ended'), new Promise((r) => setTimeout(() => r('waited'), 50))]);
    expect(ended).toBe('ended');
  });

  it('flashes the poisoned rows once drawn, and puts them back as the flash ends', async () => {
    const { g, inverted, done } = poisoned(2);
    await endTurn(g);
    expect(inverted).toEqual([0, 1]);
    await done();
    expect(inverted).toEqual([0, 1, 0, 1]);
  });

  it('leaves the rows as drawn where the panel is drawn again before the flash ends', async () => {
    const { g, inverted, done } = poisoned(2);
    await endTurn(g);
    drawVitals(g); // the next move's: the rows drawn afresh, the flash gone with them
    await done();
    expect(inverted).toEqual([0, 1]);
  });
});
