import { describe, expect, it } from 'vitest';
import { addAmmo, ammoFull, ammoHeld, ARROWS, armCounts, QUARRELS, spendOne } from '../src/game/ammo.ts';
import { spendAmmo, weaponLabel } from '../src/game/combat.ts';
import { restore, serialize } from '../src/game/storage.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** Arrows and quarrels: 999 under the Modern and Story rules, 99 under Classic (ammo.ts). */
describe('the party’s ammunition', () => {
  const game = (rules: 'modern' | 'story' | 'classic' = 'modern') => {
    const { g } = newGame();
    journeyOnward(g);
    g.options.rules = rules;
    g.s.equipment[ARROWS] = g.s.equipment[QUARRELS] = 0;
    g.ammoExtra = {};
    return g;
  };

  it('carries 999 under the Modern rules, a bundle of 99 at a time, the last topping up', () => {
    const g = game();
    for (let i = 0; i < 10; i++) addAmmo(g, ARROWS, 99);
    expect(ammoHeld(g, ARROWS)).toBe(990);
    expect(ammoFull(g, ARROWS)).toBe(false);
    expect(addAmmo(g, ARROWS, 99)).toBe(9);
    expect(ammoHeld(g, ARROWS)).toBe(999);
    expect(ammoFull(g, ARROWS)).toBe(true);
    // The save's byte holds its 99; the rest is beside it.
    expect(g.s.equipment[ARROWS]).toBe(99);
    expect(g.ammoExtra[ARROWS]).toBe(900);
    // Story is the Modern rules eased: the same.
    const story = game('story');
    addAmmo(story, QUARRELS, 500);
    expect(ammoHeld(story, QUARRELS)).toBe(500);
  });

  it('spends from above the save’s 99 first, so the byte says there are arrows until the last', () => {
    const g = game();
    addAmmo(g, ARROWS, 101);
    spendOne(g, ARROWS);
    expect([g.s.equipment[ARROWS], g.ammoExtra[ARROWS]]).toEqual([99, 1]);
    spendOne(g, ARROWS);
    spendOne(g, ARROWS);
    expect([g.s.equipment[ARROWS], g.ammoExtra[ARROWS]]).toEqual([98, 0]);
  });

  it('under Classic fills to 99 as 1988 did, and keeps more brought from the Modern rules without adding to it', () => {
    const g = game('classic');
    addAmmo(g, ARROWS, 30);
    expect(addAmmo(g, ARROWS, 99)).toBe(69); // a bundle: the quiver filled
    expect(ammoHeld(g, ARROWS)).toBe(99);
    expect(ammoFull(g, ARROWS)).toBe(true);
    // Switched from the Modern rules with 300: none taken, none added.
    g.options.rules = 'modern';
    addAmmo(g, ARROWS, 201);
    g.options.rules = 'classic';
    expect(ammoHeld(g, ARROWS)).toBe(300);
    expect(addAmmo(g, ARROWS, 5)).toBe(0);
    expect(ammoHeld(g, ARROWS)).toBe(300);
    // Shot down below 99, it is a Classic quiver again.
    for (let i = 0; i < 205; i++) spendOne(g, ARROWS);
    expect(ammoHeld(g, ARROWS)).toBe(95);
    expect(addAmmo(g, ARROWS, 5)).toBe(4);
    expect(ammoHeld(g, ARROWS)).toBe(99);
  });

  it('is shown whole, on the weapon’s line and in the lists, and spent by a bow shot', () => {
    const g = game();
    addAmmo(g, ARROWS, 412);
    expect(weaponLabel(g, 0x1a)).toMatch(/ x412:$/); // a bow
    expect(armCounts(g)[ARROWS]).toBe(412);
    spendAmmo(g, 0x1a, 3);
    expect(ammoHeld(g, ARROWS)).toBe(411);
  });

  it('is kept by a save, and a save from before keeps none above 99', () => {
    const g = game();
    addAmmo(g, QUARRELS, 640);
    const saved = serialize(g);
    const h = game();
    restore(h, saved);
    expect(ammoHeld(h, QUARRELS)).toBe(640);
    const { ammo: _none, ...before } = saved;
    restore(h, before);
    expect(ammoHeld(h, QUARRELS)).toBe(99);
    restore(h, { ...saved, ammo: { [QUARRELS]: 5000 } }); // not a count this game keeps
    expect(ammoHeld(h, QUARRELS)).toBe(99);
  });
});
