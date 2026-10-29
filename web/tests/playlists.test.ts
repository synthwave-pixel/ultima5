import { describe, expect, it } from 'vitest';
import { fitCommand, plainName, playWidth } from '../src/game/menu.ts';
import { SPELL_EFFECTS } from '../src/game/magic.ts';
import { journeyOnward } from '../src/game/run.ts';
import { itemLabel } from '../src/game/zstats.ts';
import { newGame } from './helpers.ts';

/** The lists of play low in the view (menu.ts playRows): every line fitted to the box, none run over its frame. */
describe('the lists low in the view, every line fitting', () => {
  const game = (input: 'controller' | 'letters') => {
    const { g } = newGame();
    journeyOnward(g);
    g.options.input = input;
    return g;
  };

  it('gives a line 18 letters, 16 beside a letter', () => {
    expect(playWidth(game('controller'), true)).toBe(18);
    expect(playWidth(game('letters'), true)).toBe(16);
    expect(playWidth(game('letters'), false)).toBe(18); // the lists with no letters (Ready, Use, the spells)
  });

  it('fits every armament to Ready, worn, in hand or packed, however many', () => {
    const g = game('controller');
    const m = g.s.members[0];
    for (let i = 0; i < 0x30; i++)
      for (const n of [0, 1, 9, 99])
        for (const slot of [-1, 0, 2]) {
          m.equips.fill(0xff);
          if (slot >= 0) m.equips[slot] = i;
          const { label } = itemLabel(g, i, 0x52, 0, n, 18);
          expect(label.length, label).toBeLessThanOrEqual(18);
        }
  });

  it('fits every item to Use, the scrolls and potions by their short names where the long will not', () => {
    const g = game('controller');
    for (let i = 0; i < 0x26; i++) {
      const n = i < 0x10 ? 99 : 0xff;
      const { label } = itemLabel(g, i, 0x55, 0, n, 18);
      expect(label.length, label).toBeLessThanOrEqual(18);
    }
  });

  it('fits every command, its count and brackets let go and its words shortened only as far as needed', () => {
    const shorts = game('letters')
      .data.table(0x1962, 0x30)
      .map((x) => x.trim());
    const lines = [
      'Steal from chest',
      'Jimmy chest (x99)',
      'Ignite torch (x99)',
      'View a gem (x99)',
      'Jimmy (x99)',
      ...shorts.map((n) => `Attack (${n})`),
      ...SPELL_EFFECTS.map((e) => `Cast (${e})`),
    ];
    for (const input of ['controller', 'letters'] as const) {
      const g = game(input);
      const width = playWidth(g, true);
      for (const l of lines) {
        const shown = input === 'controller' ? plainName(g, l.replace(/ \(x99\)$/, '')) + (l.endsWith('(x99)') ? ' (x99)' : '') : l;
        const fitted = fitCommand(shown, width);
        expect(fitted.length, `${input}: ${shown} -> ${fitted}`).toBeLessThanOrEqual(width);
      }
    }
    expect(fitCommand('Ignite torch (x3)', 18)).toBe('Ignite torch (x3)'); // as it is where it fits
    expect(fitCommand('Ignite torch (x3)', 16)).toBe('Ignite torch x3');
    expect(fitCommand('Pick chest lock (x99)', 18)).toBe('Unlock chest x99');
    expect(fitCommand('Cast (Summon daemon)', 18)).toBe('Cast Summon daemon');
    expect(fitCommand('Cast (Summon daemon)', 16)).toBe('Summon daemon');
  });
});
