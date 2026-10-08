import { describe, expect, it } from 'vitest';
import { Status } from '../src/game/save.ts';
import { newGame } from './helpers.ts';

/** A kill's experience: all to whoever struck, or shared among the living. */
describe('balanced experience', () => {
  const party = (): ReturnType<typeof newGame> => {
    const made = newGame();
    const { g } = made;
    g.s.partySize = 4;
    for (let i = 0; i < 4; i++) {
      g.s.members[i].status = Status.Good;
      g.s.members[i].exp = 0;
    }
    return made;
  };
  const award = async (g: ReturnType<typeof newGame>['g'], who: number, worth: number): Promise<void> => {
    const { addExp } = await import('../src/game/combat.ts');
    addExp(g, who, worth);
  };

  it('shares among the living, the odd points to the one who struck', async () => {
    const { g } = party();
    g.options.rules = 'modern';
    g.s.members[3].status = Status.Dead;
    await award(g, 0, 10); // three alive: 3 each, 1 over
    expect([0, 1, 2, 3].map((i) => g.s.members[i].exp)).toEqual([4, 3, 3, 0]);
  });

  it('gives it all to the killer when it is off', async () => {
    const { g } = party();
    g.options.rules = 'classic';
    await award(g, 1, 10);
    expect([0, 1, 2, 3].map((i) => g.s.members[i].exp)).toEqual([0, 10, 0, 0]);
  });

  it('gives it all to the one left when nobody else stands', async () => {
    const { g } = party();
    g.options.rules = 'modern';
    for (let i = 1; i < 4; i++) g.s.members[i].status = Status.Dead;
    await award(g, 0, 7);
    expect(g.s.members[0].exp).toBe(7);
  });
});

/** The Throw setting: the party's last dagger or spear is not hurled away. */
describe('throwing the last one', () => {
  const armed = (weapon: number): ReturnType<typeof newGame> => {
    const made = newGame();
    made.g.s.equipment.fill(0);
    made.g.s.members[0].equips[2] = weapon;
    return made;
  };

  it('keeps the last dagger and the last spear', async () => {
    const { keepsLastThrown } = await import('../src/game/combat.ts');
    for (const weapon of [0x10, 0x15]) {
      const { g } = armed(weapon);
      g.options.rules = 'modern';
      expect(keepsLastThrown(g, weapon)).toBe(true);
      g.s.equipment[weapon] = 1; // a spare in the pack
      expect(keepsLastThrown(g, weapon)).toBe(false);
    }
  });

  it('lets everything else fly, spares or none', async () => {
    const { keepsLastThrown } = await import('../src/game/combat.ts');
    const { g } = armed(0x16);
    g.options.rules = 'modern';
    expect(keepsLastThrown(g, 0x16)).toBe(false); // throwing axe
    expect(keepsLastThrown(g, 0x13)).toBe(false); // flame oil
    expect(keepsLastThrown(g, 0x1a)).toBe(false); // bow
  });

  it('holds nothing back when throwing is All', async () => {
    const { keepsLastThrown } = await import('../src/game/combat.ts');
    const { g } = armed(0x10);
    g.options.rules = 'classic';
    expect(keepsLastThrown(g, 0x10)).toBe(false);
  });
});
