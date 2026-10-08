import { describe, expect, it } from 'vitest';
import { placeCombatant, strike } from '../src/game/combat.ts';
import { CHEATS } from '../src/game/cheats.ts';
import { CF } from '../src/game/game.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Status } from '../src/game/save.ts';
import { newGame } from './helpers.ts';

/** The Glass Sword (combat.ts damageRoll): a sure kill that shatters - its wielder's, whoever of the party has fallen. */
describe('the Glass Sword', () => {
  it("shatters in its wielder's hand though the Avatar has fallen, the fallen taking no place in the fight", async () => {
    const { g } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.members[0].status = Status.Dead;
    s.members[1].equips[2] = 0x27; // Shamino wields it, first in the fight (combatant 0) with the Avatar fallen
    g.combat[0].flags = CF.Player;
    g.combat[0].who = 1;
    const foe = placeCombatant(g, 0, 0, 5, 5, 0);
    s.weapon = 0x27;
    await strike(g, foe, 0);
    expect([...s.members[1].equips]).not.toContain(0x27);
  });

  it('comes five at a time from the cheats', async () => {
    const { g } = newGame();
    const cheat = CHEATS.find((c) => c.label === 'Glass swords +5')!;
    g.s.equipment[0x27] = 0;
    await cheat.apply(g);
    expect(g.s.equipment[0x27]).toBe(5);
  });
});
