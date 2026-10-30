import { describe, expect, it } from 'vitest';
import { attackCommand, enemy, keepsLastThrown, spendAmmo, weaponLabel } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

const RAT = 0x14;
const [BOW, ARROWS, CROSSBOW, QUARRELS, SPEAR, OIL, SWORD] = [0x1a, 0x1b, 0x1c, 0x1d, 0x15, 0x13, 0x1e];

/** On the arena: the Avatar at (2, 5) holding `weapon`, a rat four squares off (combatant 6). */
function fight(weapon: number, seed = 1) {
  const { g, p } = newGame(seed);
  journeyOnward(g);
  const s = g.s;
  Object.assign(s, { mapId: 0xff, combatTurn: 0, townAir: 0xff });
  for (const c of g.combat) c.flags = 0;
  const put = (i: number, at: [number, number], flags: number, who: number, hp: number, tile: number): void => {
    Object.assign(g.combat[i], { who, x: at[0], y: at[1], flags, hp, dex: 10, actor: i + 1 });
    Object.assign(s.actors[i + 1], { tile, anim: tile, x: at[0], y: at[1], z: 0 });
  };
  put(0, [2, 5], CF.Player, 0, 0, 0x1c);
  put(6, [6, 5], CF.Monster, RAT, enemy(g, RAT).maxHp, 0x40 + RAT * 4);
  const e = s.members[0].equips;
  [e[0], e[2], e[3]] = [0xff, weapon, 0xff];
  g.options.autoAim = true;
  g.autoAim = true;
  return { g, p, s };
}

describe('what a weapon spends, before the blow', () => {
  it("names a bow's arrows and a crossbow's quarrels, the party's, as it shoots", async () => {
    const { g, p, s } = fight(BOW);
    s.equipment[ARROWS] = 23;
    await attackCommand(g, 0, 1);
    expect(p.log).toContain('Bow x23:');
    expect(s.equipment[ARROWS]).toBe(22);
    const c = fight(CROSSBOW);
    c.s.equipment[QUARRELS] = 1;
    c.s.members[0].equips[2] = CROSSBOW;
    await attackCommand(c.g, 0, 1);
    expect(c.p.log).toContain('Crossbow x1:');
    expect(c.p.log).toContain('Last quarrel!');
  });

  it('is the same short count for every weapon that spends, and fits the line', () => {
    const { g, s } = fight(BOW);
    s.equipment[ARROWS] = 23;
    s.equipment[0x16] = 2;
    expect(weaponLabel(g, 0x24)).toBe('Magic Bow x23:');
    expect(weaponLabel(g, 0x16)).toBe('Throwing Axe x3:');
    expect(weaponLabel(g, 0x16).length).toBeLessThanOrEqual(16);
    expect(weaponLabel(g, SWORD)).toBe('Long Sword:');
  });

  it('counts what a member has to throw: the one in hand and the spares', async () => {
    // (Y throws only at a neighbour - a spear there strikes from the hand; flaming oil is thrown.)
    const { g, p, s } = fight(SPEAR);
    g.combat[6].x = s.actors[7].x = 3;
    s.equipment[SPEAR] = 1;
    await attackCommand(g, 0, 1);
    expect(p.log).toContain('Spear x2:');
    const o = fight(OIL);
    o.g.combat[6].x = o.s.actors[7].x = 3;
    o.s.equipment[OIL] = 4;
    await attackCommand(o.g, 0, 1);
    expect(o.p.log).toContain('Flaming Oil x5:');
  });

  it('says nothing more for a weapon that spends nothing', async () => {
    const { g, p } = fight(SWORD);
    g.combat[6].x = g.s.actors[7].x = 3; // beside
    await attackCommand(g, 0, 1);
    expect(p.log).toContain('Long Sword:');
  });

  it('says so when the last arrow puts the bows away, with the Classic rules', async () => {
    const { g, p, s } = fight(BOW);
    g.options.rules = 'classic';
    s.equipment[ARROWS] = 1;
    s.members[1].equips[2] = 0x24; // Iolo's magic bow
    s.equipment[0x24] = 0;
    await attackCommand(g, 0, 1);
    expect(p.log).toContain('Bow x1:');
    expect(p.log.replace(/\s/g, '')).toContain('Lastarrow!Bowsputaway.'); // (wrapped as the log's lines fall)
    expect(s.members[0].equips[2]).toBe(0xff);
    expect(s.members[1].equips[2]).toBe(0xff);
    expect(p.log.indexOf('Last arrow!')).toBeGreaterThan(p.log.indexOf('Bow x1:'));
  });

  it('says the last arrow is gone and keeps the bows in hand with the Modern rules; the next Attack says so, no turn spent', async () => {
    const { g, p, s } = fight(BOW);
    s.equipment[ARROWS] = 1;
    s.members[1].equips[2] = 0x24; // Iolo's magic bow
    await attackCommand(g, 0, 1);
    expect(p.log.replace(/\s/g, '')).toContain('Lastarrow!');
    expect(p.log).not.toContain('put away');
    expect(s.members[0].equips[2]).toBe(BOW);
    expect(s.members[1].equips[2]).toBe(0x24);
    g.cancelled = false;
    p.log = '';
    await attackCommand(g, 0, 1);
    expect(p.log).toContain('No arrows!');
    expect(g.cancelled).toBe(true); // the turn given back (combat.ts playerTurn asks again)
    expect(s.equipment[ARROWS]).toBe(0);
    const c = fight(CROSSBOW);
    await attackCommand(c.g, 0, 1);
    expect(c.p.log).toContain('No quarrels!');
    expect(c.g.cancelled).toBe(true);
  });

  it('says the last flask of oil is gone as it leaves the hand empty', async () => {
    const { g, p, s } = fight(OIL);
    g.combat[6].x = s.actors[7].x = 3; // beside: a flask is thrown there too
    s.equipment[OIL] = 0;
    await attackCommand(g, 0, 1);
    expect(p.log).toContain('Flaming Oil x1:');
    expect(p.log.replace(/\s/g, '')).toContain('Lastflask!');
    expect(s.members[0].equips[2]).toBe(0xff);
  });

  it('keeps back the last throwing axe with the Modern rules, as the last dagger and spear; the Classic throw it away', () => {
    const AXE = 0x16;
    const { g, s } = fight(AXE);
    s.equipment[AXE] = 0;
    expect(keepsLastThrown(g, AXE)).toBe(true);
    s.equipment[AXE] = 1;
    expect(keepsLastThrown(g, AXE)).toBe(false); // a spare to throw
    s.equipment[AXE] = 0;
    g.options.rules = 'classic';
    expect(keepsLastThrown(g, AXE)).toBe(false);
    s.d588f = 0;
    spendAmmo(g, AXE, 3); // thrown at range, the last one
    expect(s.members[0].equips[2]).toBe(0xff);
  });
});
