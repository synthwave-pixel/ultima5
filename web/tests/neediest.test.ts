import { describe, expect, it } from 'vitest';
import { neediest } from '../src/game/input.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Status } from '../src/game/save.ts';
import { newGame } from './helpers.ts';

/** Whom a healing, a cure, an awakening or a raising starts its choice on (input.ts neediest). */
describe('the member a healing is likeliest for', () => {
  const party = (hp: [number, number][], status: number[] = []) => {
    const { g } = newGame();
    journeyOnward(g);
    hp.forEach(([now, most], m) => Object.assign(g.s.members[m], { hp: now, maxHp: most, status: status[m] ?? Status.Good }));
    g.s.partySize = hp.length;
    return g;
  };

  it('is the living one with the least of their hit points left, by the share of them', () => {
    // 30 of 60 is a half; 40 of 90 is less than one.
    expect(
      neediest(
        party([
          [60, 60],
          [30, 60],
          [40, 90],
        ]),
      ),
    ).toBe(2);
  });

  it('passes over the dead for a healing, and is nobody where all are whole', () => {
    const g = party(
      [
        [0, 60],
        [60, 60],
      ],
      [Status.Dead],
    );
    expect(neediest(g)).toBeUndefined();
  });

  it('is the poisoned for a cure, the sleeping to be woken, the dead to be raised', () => {
    const g = party(
      [
        [10, 60],
        [50, 60],
        [60, 60],
        [0, 60],
      ],
      [Status.Good, Status.Poisoned, Status.Sleeping, Status.Dead],
    );
    expect(neediest(g, 'poisoned')).toBe(1);
    expect(neediest(g, 'asleep')).toBe(2);
    expect(neediest(g, 'dead')).toBe(3);
    expect(neediest(g, 'hurt')).toBe(0);
  });
});
