import { describe, expect, it } from 'vitest';
import { attackCommand, enemy, weaponLabel } from '../src/game/combat.ts';
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

  it('says so when the last arrow puts the bows away', async () => {
    const { g, p, s } = fight(BOW);
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
});
