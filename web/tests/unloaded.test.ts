import { describe, expect, it } from 'vitest';
import { autoKey } from '../src/game/autocombat.ts';
import { enemy, snapTargets } from '../src/game/combat.ts';
import { contextual } from '../src/game/menu.ts';
import { switchWeapon } from '../src/game/switchWeapon.ts';
import { CF } from '../src/game/game.ts';
import { journeyOnward } from '../src/game/run.ts';
import { canReady, readyPurchase } from '../src/game/zstats.ts';
import { newGame } from './helpers.ts';

const [BOW, ARROWS, CROSSBOW, QUARRELS, MAGIC_BOW] = [0x1a, 0x1b, 0x1c, 0x1d, 0x24];

/**
 * A bow or crossbow with nothing to shoot (zstats.ts unloadedRefused): with the Modern and Story rules readied all
 * the same, and kept in hand; with the Classic rules refused, as 1988 refused it.
 */
describe('a bow with no arrows', () => {
  it('is readied with the Modern rules - bought or from the pack - the crossbow and the magic bow too', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.members[1].str = 30;
    for (const item of [BOW, CROSSBOW, MAGIC_BOW]) {
      s.equipment[ARROWS] = s.equipment[QUARRELS] = 0;
      s.equipment[item] = 1;
      expect(canReady(g, 1, item)).toBe(true);
      p.log = '';
      expect(await readyPurchase(g, 1, item)).toBe(true);
      expect(s.members[1].equips[2]).toBe(item);
      expect(p.log).not.toContain('ammunition');
    }
  });

  it('is refused with the Classic rules, and nothing changes', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.rules = 'classic';
    const s = g.s;
    s.members[1].str = 30;
    s.equipment[ARROWS] = 0;
    s.equipment[BOW] = 1;
    const before = [...s.members[1].equips];
    expect(canReady(g, 1, BOW)).toBe(false);
    expect(await readyPurchase(g, 1, BOW)).toBe(false);
    expect(p.log.replace(/\s+/g, ' ')).toContain('no ammunition');
    expect([...s.members[1].equips]).toEqual(before);
    expect(s.equipment[BOW]).toBe(1);
  });

  it('in hand, with no melee arms to switch to, hands auto combat back to the player rather than Attack for ever', async () => {
    const { g } = newGame();
    journeyOnward(g);
    const s = g.s;
    Object.assign(s, { mapId: 0xff, combatTurn: 0, townAir: 0xff, partySize: 1 });
    for (const c of g.combat) c.flags = 0;
    Object.assign(g.combat[0], { who: 0, x: 2, y: 5, flags: CF.Player, actor: 1 });
    Object.assign(s.actors[1], { tile: 0x1c, anim: 0x1c, x: 2, y: 5, z: 0 });
    Object.assign(g.combat[6], { who: 0x14, x: 3, y: 5, flags: CF.Monster, hp: enemy(g, 0x14).maxHp, actor: 7 });
    Object.assign(s.actors[7], { tile: 0x90, anim: 0x90, x: 3, y: 5, z: 0 });
    s.equipment.fill(0);
    s.members[0].equips.fill(0xff);
    s.members[0].equips[2] = BOW;
    g.options.autoCombat = 'all';
    g.commandPrompt = 'combat';
    expect(await autoKey(g)).toBe(0);
    expect(g.options.autoCombat).toBe('off');
    expect(s.members[0].equips[2]).toBe(BOW);
  });

  it('marks no foe for a snap attack, and names Attack for what it lacks; with arrows, both as before', () => {
    const { g } = newGame();
    journeyOnward(g);
    const s = g.s;
    Object.assign(s, { mapId: 0xff, combatTurn: 0, townAir: 0xff });
    for (const c of g.combat) c.flags = 0;
    Object.assign(g.combat[0], { who: 0, x: 2, y: 5, flags: CF.Player, actor: 1 });
    Object.assign(s.actors[1], { tile: 0x1c, anim: 0x1c, x: 2, y: 5, z: 0 });
    Object.assign(g.combat[6], { who: 0x14, x: 6, y: 5, flags: CF.Monster, hp: enemy(g, 0x14).maxHp, actor: 7 });
    Object.assign(s.actors[7], { tile: 0x90, anim: 0x90, x: 6, y: 5, z: 0 });
    const e = s.members[0].equips;
    [e[0], e[2], e[3]] = [0xff, BOW, 0xff];
    g.commandPrompt = 'combat';
    s.equipment[ARROWS] = 0;
    expect(snapTargets(g, 0)).toEqual([]);
    expect(contextual(g)[0].label).toBe('Attack (no arrows)');
    e[2] = MAGIC_BOW;
    expect(snapTargets(g, 0)).toEqual([]);
    expect(contextual(g)[0].label).toBe('Attack (no arrows)');
    e[2] = CROSSBOW;
    s.equipment[ARROWS] = 5; // arrows are no use to it
    expect(snapTargets(g, 0)).toEqual([]);
    expect(contextual(g)[0].label).toBe('Attack (no quarrels)');
    expect(switchWeapon(g, 0).said).not.toMatch(/Crossbow/); // to melee arms, or nothing: never the empty crossbow
    s.equipment[QUARRELS] = 5;
    e.fill(0xff);
    e[2] = CROSSBOW;
    expect(snapTargets(g, 0)).toEqual([6]);
    s.equipment[ARROWS] = 0;
    e[2] = BOW;
    s.equipment[ARROWS] = 5;
    expect(snapTargets(g, 0)).toEqual([6]);
    expect(contextual(g)[0].label).toMatch(/^Attack \(Bow/);
  });
});
