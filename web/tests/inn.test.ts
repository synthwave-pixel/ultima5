import { describe, expect, it } from 'vitest';
import { Status } from '../src/game/save.ts';
import { innNight } from '../src/game/shops.ts';
import { newGame } from './helpers.ts';

/**
 * A night at the inn (shops.ts innNight): healed to the full, mana back; the poisoned dead as in 1988 - or, with
 * Poison on Damage, which promises poison never kills, alive and still poisoned at half their hit points.
 */
describe('a night at the inn', () => {
  const guest = (hp: number, status: number, poison: 'damage' | 'deadly') => {
    const { g } = newGame();
    g.options.rules = poison === 'deadly' ? 'classic' : 'modern';
    const m = g.s.members[1];
    m.maxHp = 80;
    m.hp = hp;
    m.status = status;
    return { g, m };
  };

  it('heals the well to the full', () => {
    const { g, m } = guest(20, Status.Good, 'damage');
    expect(innNight(g, m)).toBe(false);
    expect(m.hp).toBe(80);
  });

  it('wakes the poisoned at half their hit points, still poisoned, where Poison is Damage: up from less, down from more', () => {
    for (const hp of [20, 60]) {
      const { g, m } = guest(hp, Status.Poisoned, 'damage');
      expect(innNight(g, m)).toBe(false);
      expect(m.hp).toBe(40);
      expect(m.status).toBe(Status.Poisoned);
    }
  });

  it('kills the poisoned where Poison is Deadly, as in 1988', () => {
    const { g, m } = guest(60, Status.Poisoned, 'deadly');
    expect(innNight(g, m)).toBe(true);
    expect(m.status).toBe(Status.Dead);
    expect(m.hp).toBe(0);
  });
});
