import { describe, expect, it } from 'vitest';
import { journeyOnward } from '../src/game/run.ts';
import { itemLabel } from '../src/game/zstats.ts';
import { newGame } from './helpers.ts';

/** The Use list's lines (zstats.ts itemLabel): every scroll and potion, with any count, within the menu's 21. */
describe('the Use list', () => {
  it('keeps every line with its count within the width, the long name where it fits', () => {
    const { g } = newGame();
    journeyOnward(g);
    for (let i = 0; i < 0x10; i++)
      for (const count of [1, 2, 9, 12, 99]) {
        const { label } = itemLabel(g, i, 0x55, 0, count);
        expect(label.length, label).toBeLessThanOrEqual(21);
        if (count > 1) expect(label.endsWith(` x${count}`), label).toBe(true);
      }
    expect(itemLabel(g, 8 + 6, 0x55, 0, 2).label).toBe('Potion: Vanish x2'); // Invisibility does not fit
    expect(itemLabel(g, 8 + 2, 0x55, 0, 1).label).toBe('Potion: Cure poison');
  });
});
