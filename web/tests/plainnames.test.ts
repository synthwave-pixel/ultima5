import { describe, expect, it } from 'vitest';
import { plainName } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** 1988's names spelt for their letters, plain for a controller (menu.ts plainName); Classic keeps them. */
describe("a controller's names for 1988's commands", () => {
  it('are the plain words, X-it by what is left', () => {
    const { g } = newGame();
    journeyOnward(g);
    expect(['Klimb', 'Ztats', 'Jimmy', 'Jimmy chest', 'Look'].map((l) => plainName(g, l))).toEqual([
      'Climb',
      'Stats',
      'Pick lock',
      'Pick chest lock',
      'Look',
    ]);
    g.s.partyTile = 0x12; // on a horse
    expect(plainName(g, 'X-it')).toBe('Dismount');
    g.s.partyTile = 0x20; // aboard a frigate
    expect(plainName(g, 'X-it')).toBe('Disembark');
  });
});
