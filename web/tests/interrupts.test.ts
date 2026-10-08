import { describe, expect, it } from 'vitest';
import { CF } from '../src/game/game.ts';
import { interferes } from '../src/game/combat.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** A foe beside a member it last struck stops their casting or shooting (combat.ts interferes), saying which. */
describe('a foe that interrupts', () => {
  const fight = () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.mapId = 0xff;
    s.icon = 0;
    Object.assign(g.combat[0], { who: 0, x: 5, y: 5, flags: CF.Player });
    Object.assign(g.combat[1], { who: 0x30, x: 6, y: 6, flags: CF.Monster }); // diagonal: beside
    s.d58a8[0] = 1; // it struck member 0 last
    return { g, p, s };
  };

  it('says it interrupts casting, or a ranged attack', () => {
    const { g, p } = fight();
    expect(interferes(g, 0, 'casting')).toBe(true);
    expect(p.log.replace(/\s+/g, ' ')).toMatch(/interrupts casting!/);
    expect(interferes(g, 0, 'ranged attack')).toBe(true);
    expect(p.log.replace(/\s+/g, ' ')).toMatch(/interrupts ranged attack!/);
  });

  it('does not, a square further off, or asleep', () => {
    const { g } = fight();
    g.combat[1].x = 7;
    expect(interferes(g, 0, 'casting')).toBe(false);
    g.combat[1].x = 6;
    g.combat[1].flags |= CF.Asleep;
    expect(interferes(g, 0, 'casting')).toBe(false);
  });
});
