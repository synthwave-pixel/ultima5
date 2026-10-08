import { describe, expect, it } from 'vitest';
import { spendAmmo } from '../src/game/combat.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** Arrows and bolts spent in a fight (combat.ts spendAmmo): the last one puts away what shoots it. */
describe('the last arrow', () => {
  it('puts away the magic bow with the plain ones, so none shoots on with none - and the count never wraps', () => {
    const { g } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.partySize = 2;
    s.d588f = 0;
    for (const m of [0, 1]) s.members[m].equips.fill(0xff);
    s.members[0].equips[2] = 0x1a; // a bow
    s.members[1].equips[2] = 0x24; // the magic bow
    s.equipment[0x1a] = s.equipment[0x24] = 0;
    s.equipment[0x1b] = 1; // one arrow left
    spendAmmo(g, 0x1a, 5);
    expect(s.equipment[0x1b]).toBe(0);
    expect(s.members[0].equips).not.toContain(0x1a);
    expect(s.members[1].equips).not.toContain(0x24);
    expect([s.equipment[0x1a], s.equipment[0x24]]).toEqual([1, 1]);
    spendAmmo(g, 0x24, 5); // (nothing in hand shoots now; were it to, the count stays at none)
    expect(s.equipment[0x1b]).toBe(0);
  });
});
