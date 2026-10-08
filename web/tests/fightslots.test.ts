import { describe, expect, it } from 'vitest';
import { canStrike, placeCombatant } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** A fight's field of floor, nobody on it. */
function field(rules: 'story' | 'modern' | 'classic' = 'modern') {
  const { g } = newGame();
  journeyOnward(g);
  g.options.rules = rules;
  g.s.mapId = 0xff;
  g.combatMap.fill(0x44);
  for (const c of g.combat) Object.assign(c, { flags: 0, x: 0x63, y: 0x63 });
  for (const a of g.s.actors) a.tile = a.anim = 0;
  return g;
}

describe('a fighter set down with no actor free', () => {
  it('is not placed, and leaves its slot empty: no phantom with another figure', () => {
    const g = field('classic');
    // Every actor held - by corpses, chests, loot, fields - and a fighter's slot free.
    g.s.actors.forEach((a, i) => Object.assign(a, { tile: 0x1f, anim: 0x1f, x: i % 11, y: 0 }));
    const gargoyle = g.data.table(0x18b6, 0x30).indexOf('GARGOYLE');
    expect(placeCombatant(g, gargoyle, 0, 5, 5, 0)).toBe(-1);
    expect(g.combat.filter((c) => c.flags !== 0)).toHaveLength(0);
  });

  it('forgets the charm of one taken off the field', async () => {
    const { removeCombatant } = await import('../src/game/combat.ts');
    const g = field();
    const rat = g.data.table(0x18b6, 0x30).indexOf('GIANT RATS');
    const i = placeCombatant(g, rat, 0, 5, 5, 0);
    g.combat[i].flags |= CF.Charmed;
    g.charmedBy.set(i, 0);
    removeCombatant(g, -i - 1); // as one that escapes leaves
    expect(g.charmedBy.has(i)).toBe(false);
  });

  it('forgets a charm on the slot’s last occupant', () => {
    const g = field();
    g.charmedBy.set(6, 0);
    const rat = g.data.table(0x18b6, 0x30).indexOf('GIANT RATS');
    expect(placeCombatant(g, rat, 0, 5, 5, 0)).toBe(6);
    expect(g.charmedBy.has(6)).toBe(false);
  });
});

describe('auto combat with a friend charmed against the party, by the Classic rules', () => {
  it('strikes only when the hand Attack asks first reaches: a spiked helm and a throwing axe', () => {
    const g = field('classic');
    const s = g.s;
    // Shamino (1): the spiked helm strikes, and is asked first; the magic axe in hand is thrown.
    s.members[1].equips.set([0x03, 0xff, 0x26, 0xff, 0xff, 0xff]);
    Object.assign(g.combat[1], { flags: CF.Player, who: 1, x: 5, y: 5, actor: 1 });
    Object.assign(s.actors[1], { tile: 0x48, anim: 0x48, x: 5, y: 5 });
    // Iolo (2), charmed against the party, two squares off: the axe reaches him, the helm does not.
    Object.assign(g.combat[2], { flags: CF.Player | CF.Charmed, who: 2, x: 5, y: 7, actor: 2 });
    Object.assign(s.actors[2], { tile: 0x44, anim: 0x44, x: 5, y: 7 });
    g.charmedBy.set(2, 'bound');
    expect(canStrike(g, 1, [2])).toBe(false); // closes in, rather than backing out of the helm's aim for ever
    Object.assign(g.combat[2], { y: 6 });
    s.actors[2].y = 6;
    expect(canStrike(g, 1, [2])).toBe(true);
  });
});
