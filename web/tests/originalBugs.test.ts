import { describe, expect, it } from 'vitest';
import { armourClass, memberDefence, stat } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { usePotion } from '../src/game/magic.ts';
import { Status } from '../src/game/save.ts';
import { newGame } from './helpers.ts';

/** A combatant's defence, as the stat asked for by a blow (combat.ts stat: Q.Def is -4). */
const DEF = -4;

describe('worn armour, which the 1988 DOS game never counted', () => {
  // 1988 took a member's defence from their record's byte 0x18 alone, and its armour routine (ULTIMA_6da8) compared
  // each worn item's number with -1 in a way the DOS compiler made always false - so the armour never counted at all.
  it('counts each worn item, by the game’s own defence table, in a member’s defence', () => {
    const { g } = newGame();
    const def = g.data.bytes(0x1634, 0x30);
    const helm = def.findIndex((d, i) => i < 0x30 && d > 0);
    const body = def.findIndex((d, i) => i > helm && d > 0);
    const m = g.s.members[0];
    m.equips.fill(0xff);
    expect(armourClass(g, 0)).toBe(0);
    m.equips[0] = helm;
    m.equips[1] = body;
    expect(armourClass(g, 0)).toBe(def[helm] + def[body]);
    expect(armourClass(g, 0)).toBeGreaterThan(0);
  });

  it('is the defence a blow is struck against, in a fight', () => {
    const { g } = newGame();
    const m = g.s.members[0];
    m.equips.fill(0xff);
    const c = g.combat[0];
    c.flags = CF.Player;
    c.who = 0;
    const bare = stat(g, 0, DEF);
    m.equips[1] = g.data.bytes(0x1634, 0x30).findIndex((d) => d > 1);
    expect(stat(g, 0, DEF)).toBeGreaterThan(bare);
  });
});

describe('a member’s defence against a blow, as the Apple II reckons it', () => {
  // The Apple II's MAIN.COMBAT totals the six slots' defence and rolls a blow's damage less 1 to that total; the DOS
  // game took a byte of the record (7 for everyone) instead. The Combat setting adds to the armour before the roll.
  const dressed = () => {
    const { g } = newGame();
    const m = g.s.members[0];
    m.equips.fill(0xff);
    return { g, m };
  };

  it('is the armour worn alone on Hard - the record’s byte, 7 for everyone in 1988, plays no part', () => {
    const { g, m } = dressed();
    g.options.rules = 'classic';
    expect(m.x18).toBe(7); // the byte 1988's DOS game used, the same for all
    expect(memberDefence(g, 0)).toBe(0); // nothing worn: nothing soaked
    m.equips[1] = g.data.bytes(0x1634, 0x30).findIndex((d) => d === 7); // plate
    expect(memberDefence(g, 0)).toBe(7);
  });

  it('adds 3 on Normal and 10 on Story, to the armour before the roll', () => {
    const { g, m } = dressed();
    m.equips[1] = g.data.bytes(0x1634, 0x30).findIndex((d) => d === 2); // leather
    g.options.rules = 'modern';
    expect(memberDefence(g, 0)).toBe(2 + 3);
    g.options.rules = 'story';
    g.s.food = 50;
    expect(memberDefence(g, 0)).toBe(2 + 10);
    // Story's 10 while the party is well fed; with no food, Modern's 3
    g.s.food = 0;
    expect(memberDefence(g, 0)).toBe(2 + 3);
  });

  it('gains 2 from the Protection spell, as on the Apple II', () => {
    const { g } = dressed();
    g.options.rules = 'classic';
    g.s.icon = 80;
    expect(armourClass(g, 0)).toBe(2);
    expect(memberDefence(g, 0)).toBe(2);
  });
});

describe('a creature’s blow, rolled as the Apple II rolls it', () => {
  // The PC game took a creature's whole attack every blow (COMBAT_12b0); the Apple II rolls 1 to it ($A41D), as a
  // weapon's damage is rolled - a dragon's 30 is 1 to 30, not 30 every time.
  it('does 1 to the creature’s attack, less the armour’s roll, never the whole attack every time', async () => {
    const { damageRoll } = await import('../src/game/combat.ts');
    const { g } = newGame(5);
    const names = g.data.table(0x18b6, 0x30);
    const troll = names.indexOf('TROLLS');
    g.options.rules = 'classic';
    g.s.members[0].equips.fill(0xff);
    for (const c of g.combat) c.clear();
    Object.assign(g.combat[0], { flags: CF.Player, who: 0 });
    Object.assign(g.combat[8], { flags: CF.Monster, who: troll });
    const blows = Array.from({ length: 400 }, () => damageRoll(g, 8, 0));
    expect([Math.min(...blows), Math.max(...blows)]).toEqual([1, 15]);
  });

  it('does half to all of a heavy hitter’s attack with the Modern rules: a dragon 15 to 30', async () => {
    const { damageRoll } = await import('../src/game/combat.ts');
    const { g } = newGame(5);
    const names = g.data.table(0x18b6, 0x30);
    const dragon = names.indexOf('DRAGONS');
    g.options.rules = 'modern';
    const m = g.s.members[0];
    m.equips.fill(0xff); // no armour: the blow is the creature's roll alone
    for (const c of g.combat) c.clear();
    Object.assign(g.combat[0], { flags: CF.Player, who: 0 });
    Object.assign(g.combat[8], { flags: CF.Monster, who: dragon });
    const blows = Array.from({ length: 400 }, () => damageRoll(g, 8, 0));
    // 15 to 30, less the Modern rules' 3 of armour's roll (1 to 3): 12 to 29, about 20.5 - where 1 to 30 would
    // reach below 12 many times in 400.
    expect(Math.min(...blows)).toBeGreaterThanOrEqual(12);
    expect(Math.max(...blows)).toBeLessThanOrEqual(29);
    const mean = blows.reduce((a, b) => a + b) / blows.length;
    expect(mean).toBeGreaterThan(19);
    expect(mean).toBeLessThan(22);
  });

  it('does 1 to a heavy hitter’s attack with the Classic effects, as the Apple II rolls every creature’s', async () => {
    const { damageRoll } = await import('../src/game/combat.ts');
    const { g } = newGame(5);
    g.options.rules = 'classic';
    g.options.rules = 'classic';
    g.s.members[0].equips.fill(0xff);
    for (const c of g.combat) c.clear();
    Object.assign(g.combat[0], { flags: CF.Player, who: 0 });
    Object.assign(g.combat[8], { flags: CF.Monster, who: g.data.table(0x18b6, 0x30).indexOf('DRAGONS') });
    const blows = Array.from({ length: 400 }, () => damageRoll(g, 8, 0));
    expect([Math.min(...blows), Math.max(...blows)]).toEqual([1, 30]);
  });
});

describe('the sleep potion, which in 1988 could put the wrong one to sleep', () => {
  // 1988 passed the drinker's number in the party where their place in the fight is meant (CAST_135a to ULTIMA_68ae):
  // once someone ahead of them had fallen - the fallen take no place in a fight - it was another member, or a foe.
  it('puts its drinker to sleep, not whoever stands in the fight where their number in the party would be', async () => {
    const { g } = newGame();
    const s = g.s;
    s.mapId = 0xff; // a fight
    s.members[0].status = Status.Dead; // the Avatar fallen: not in the fight
    s.members[1].status = Status.Good; // the drinker, first in the fight
    s.members[2].status = Status.Good; // second in the fight: where the drinker's number, 1, points
    for (const c of g.combat) c.clear();
    Object.assign(g.combat[0], { flags: CF.Player, who: 1, actor: 0 });
    Object.assign(g.combat[1], { flags: CF.Player, who: 2, actor: 1 });
    s.combatTurn = 0;
    s.potions[4] = 1;
    g.random = (low: number) => Math.max(low, 5); // the potion is what it seems
    await usePotion(g, 4);
    expect(s.members[1].status).toBe(Status.Sleeping);
    expect(g.combat[0].flags & CF.Asleep).toBeTruthy();
    expect(s.members[2].status).toBe(Status.Good);
    expect(g.combat[1].flags & CF.Asleep).toBeFalsy();
  });
});
