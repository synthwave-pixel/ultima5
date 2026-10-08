import { describe, expect, it } from 'vitest';
import { campOutdoors, OLD_MAN_EVERY } from '../src/game/combat.ts';
import { serialize, restore } from '../src/game/storage.ts';
import { gameDay } from '../src/game/time.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Status } from '../src/game/save.ts';
import { newGame } from './helpers.ts';

/**
 * The old man at a camp outdoors that rested (combat.ts apparitionComes). The Classic rules: one time in four, as in
 * 1988. The Story and Modern rules: always when a member has a level due, else one time in four but not within two
 * weeks of his last.
 */
describe('the apparition at camp', () => {
  /**
   * A night's camp on the grass at Iolo's hut, the dice fixed: no ambush, and `roll` (0-99) for the old man. `set`
   * readies the party and the rules first.
   */
  const camp = async (roll: number, set: (g: ReturnType<typeof newGame>['g']) => void = () => {}) => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.d588c = 0;
    s.hour = 1; // a camp that ends the day it began, so that the days counted are the camp's
    s.minute = 0;
    g.oldManDay = -1; // he has yet to come
    set(g);
    const dice = g.random.bind(g);
    g.random = (lo: number, hi: number): number => (lo === 0 && hi === 99 ? roll : lo === 0 && hi === 0x3f ? 1 : dice(lo, hi));
    p.next = () => K.Space;
    await campOutdoors(g, -1, 9);
    return { g, log: p.log.replace(/\s+/g, ' ') };
  };
  const classic = (g: ReturnType<typeof newGame>['g']): void => {
    g.options.rules = 'classic';
  };
  const modern = (g: ReturnType<typeof newGame>['g']): void => {
    g.options.rules = 'modern';
  };

  it('comes one time in four with the Classic rules, as in 1988, whatever the karma or the month', async () => {
    expect((await camp(24, classic)).log).toContain('An apparition!');
    expect((await camp(25, classic)).log).not.toContain('An apparition!');
    const again = await camp(0, (g) => {
      classic(g);
      g.s.karma = 99;
      g.oldManDay = gameDay(g.s); // came today already
    });
    expect(again.log).toContain('An apparition!');
  });

  it('comes with the Story and Modern rules whenever a member has a level due, and grants it', async () => {
    const { g, log } = await camp(99, (g) => {
      modern(g);
      g.oldManDay = gameDay(g.s); // and though he came today
      Object.assign(g.s.members[0], { exp: 250, level: 1 });
    });
    expect(log).toContain('An apparition!');
    expect(log).toContain('Thou art now level 3');
    expect(g.s.members[0].level).toBe(3);
  });

  it('comes otherwise one time in four, but not within two weeks of his last', async () => {
    expect((await camp(24, modern)).log).toContain('An apparition!');
    expect((await camp(25, modern)).log).not.toContain('An apparition!');
    for (const [ago, comes] of [
      [0, false],
      [OLD_MAN_EVERY - 1, false],
      [OLD_MAN_EVERY, true],
      [400, true],
    ] as const) {
      const r = await camp(0, (g) => {
        modern(g);
        g.oldManDay = gameDay(g.s) - ago;
      });
      expect(r.log.includes('An apparition!'), `${ago} days after`).toBe(comes);
    }
    // Come, the day is noted, and kept with the saved game.
    const came = await camp(0, modern);
    expect(came.log).toContain('An apparition!');
    expect(came.g.oldManDay).toBe(gameDay(came.g.s));
    const { g: other } = newGame();
    restore(other, serialize(came.g));
    expect(other.oldManDay).toBe(came.g.oldManDay);
    const { oldManDay: _, ...older } = serialize(came.g);
    restore(other, older);
    expect(other.oldManDay).toBe(-1); // a save from before: he may come
    // A dead member's experience is no level due.
    const dead = await camp(99, (g) => {
      modern(g);
      Object.assign(g.s.members[0], { exp: 250, level: 1, status: Status.Dead });
    });
    expect(dead.log).not.toContain('An apparition!');
  });

  it('comes only to a camp that rested', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.s.d588c = 10; // rested four hours ago
    g.s.hour = 22;
    const dice = g.random.bind(g);
    g.random = (lo: number, hi: number): number => (lo === 0 && hi === 0x3f ? 1 : dice(lo, hi));
    p.next = () => K.Space;
    await campOutdoors(g, -1, 9);
    expect(p.log).toMatch(/No effect/);
    expect(p.log).not.toContain('An apparition!');
  });
});
