import { describe, expect, it } from 'vitest';
import { charm, enemy, stat } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import type { Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { castCommand, mixCommand } from '../src/game/magic.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Status } from '../src/game/save.ts';
import { keys, newGame } from './helpers.ts';
import type { FakePlatform } from './helpers.ts';

const MANI = 4;
const AN_ZU = 2;
const AN_NOX = 3;
/** Monster kinds: giant rats (Int 5), a bard (Int 10), and the first of the sharpest wits in the table (Int 30). */
const RAT = 0x14;
const BARD = 1;
const WISE = 13;

/** The party at Iolo's hut, each a caster of every circle with mana to spare, nothing mixed. */
function hut(seed = 1234) {
  const { g, p } = newGame(seed);
  journeyOnward(g);
  const s = g.s;
  s.mixtures.fill(0);
  for (const m of s.members) {
    m.level = 8;
    m.mp = 50;
  }
  return { g, p, s };
}

/** `spell` mixed twice and cast by the Avatar (on member `on`, where it asks whom). */
async function cast(g: Game, spell: number, on?: number): Promise<void> {
  g.s.mixtures[spell] = 2;
  g.castPreset = { caster: 0, spell, on };
  await castCommand(g);
}

/** A fight on the arena: the Avatar at (5, 5) and one foe of `kind` beside, to the east. */
function fight(kind: number, seed = 1234) {
  const game = hut(seed);
  const { g, s } = game;
  s.mapId = 0xff;
  s.combatTurn = 0;
  Object.assign(g.combat[0], { who: 0, x: 5, y: 5, flags: CF.Player, actor: 1 });
  Object.assign(g.combat[6], { who: kind, x: 6, y: 5, flags: CF.Monster, hp: enemy(g, kind).maxHp, dex: 10, actor: 2 });
  Object.assign(s.actors[1], { tile: 0x1c, anim: 0x1c, x: 5, y: 5, z: 0 });
  Object.assign(s.actors[2], { tile: 0x40 + kind * 4, anim: 0x40 + kind * 4, x: 6, y: 5, z: 0 });
  return game;
}

/** Keys to tick the reagents of `mask` in the Mix list (the party holds all eight, in order), then M and the amount. */
function mixKeys(mask: number, amount: string): number[] {
  const ks: number[] = [];
  let row = 0;
  for (let r = 0; r < 8; r++) {
    if (!(mask & (0x80 >> r))) continue;
    while (row < r) {
      ks.push(K.Down);
      row++;
    }
    ks.push(K.Enter);
  }
  return [...ks, 'M'.charCodeAt(0), ...keys(amount), K.Enter];
}

/** What was printed, its line breaks as spaces. */
const said = (p: FakePlatform): string => p.log.replace(/\s+/g, ' ');

/** The spells of the party's casters, out of a fight (magic.ts castCommand): healing, cures, lights, lasting effects, mana and mixtures. */
describe('spells cast out of a fight', () => {
  it('Mani heals by a roll of hit points, never past the most the member can have, and costs a mixture and a point of mana', async () => {
    const { g, s } = hut();
    s.members[1].hp = 1;
    await cast(g, MANI, 1);
    expect(s.members[1].hp).toBeGreaterThan(1);
    expect(s.members[1].hp).toBeLessThanOrEqual(30);
    expect(s.mixtures[MANI]).toBe(1);
    expect(s.members[0].mp).toBe(49);
    s.members[1].hp = s.members[1].maxHp - 1;
    await cast(g, MANI, 1);
    expect(s.members[1].hp).toBe(s.members[1].maxHp);
  });

  it('Mani does not raise the dead, and says it failed', async () => {
    const { g, p, s } = hut();
    Object.assign(s.members[1], { status: Status.Dead, hp: 0 });
    await cast(g, MANI, 1);
    expect(s.members[1].hp).toBe(0);
    expect(s.members[1].status).toBe(Status.Dead);
    expect(p.log).toContain('Failed!');
  });

  it('An Zu wakes a sleeper, and fails on one who is awake', async () => {
    const { g, p, s } = hut();
    s.members[1].status = Status.Sleeping;
    await cast(g, AN_ZU, 1);
    expect(s.members[1].status).toBe(Status.Good);
    expect(p.log).not.toContain('Failed!');
    await cast(g, AN_ZU, 2);
    expect(p.log).toContain('Failed!');
    expect(s.members[2].status).toBe(Status.Good);
  });

  it('An Nox cures a poisoned member only, and the failed cast still spends its mana', async () => {
    const { g, p, s } = hut();
    s.members[1].status = Status.Poisoned;
    await cast(g, AN_NOX, 1);
    expect(s.members[1].status).toBe(Status.Good);
    expect(p.log).toContain('Success!');
    p.log = '';
    s.members[0].mp = 10;
    await cast(g, AN_NOX, 2);
    expect(p.log).toContain('Failed!');
    expect(s.members[0].mp).toBe(9);
  });

  it('a spell with too little mana is refused, does nothing, and keeps its mixture for later', async () => {
    const { g, p, s } = hut();
    s.members[0].mp = 0;
    s.members[1].hp = 5;
    await cast(g, MANI, 1); // with two mixed
    expect(p.log).toContain('M.P. too low!');
    expect(s.members[1].hp).toBe(5);
    expect(s.members[0].mp).toBe(0);
    expect(s.mixtures[MANI]).toBe(2);
  });

  it('charges a spell by its circle: Vas Lor is the third, the great light that lasts longest', async () => {
    const { g, s } = hut();
    await cast(g, 0); // In Lor
    expect([s.d58a6, s.members[0].mp]).toEqual([100, 49]);
    await cast(g, 12); // Vas Lor
    expect([s.d58a6, s.members[0].mp]).toEqual([0xff, 46]);
  });

  it('Mani Vas heals to the full, as the fifth circle, and leaves the dead dead', async () => {
    const { g, s } = hut();
    s.members[1].hp = 2;
    await cast(g, 27, 1);
    expect(s.members[1].hp).toBe(s.members[1].maxHp);
    expect(s.members[0].mp).toBe(45);
    Object.assign(s.members[2], { status: Status.Dead, hp: 0 });
    await cast(g, 27, 2);
    expect([s.members[2].hp, s.members[2].status]).toEqual([0, Status.Dead]);
  });

  it('In Sanct, In An and Rel Tym light the border with their lasting effect and its turns', async () => {
    const { g, s } = hut();
    await cast(g, 0x13); // In Sanct: protection
    expect([s.icon, s.protection]).toEqual([0x50, 0x14]);
    await cast(g, 0x20); // In An: negate magic
    expect([s.icon, s.protection]).toEqual([0x4e, 10]);
    await cast(g, 0x1d); // Rel Tym: quickness
    expect([s.icon, s.protection]).toEqual([0x51, 0x1e]);
  });

  it('An Tym stops time for ten turns, but is absorbed where a Shadowlord stands', async () => {
    const { g, p, s } = hut();
    await cast(g, 0x2f);
    expect([s.icon, s.protection]).toEqual([0x54, 10]);
    s.icon = s.protection = 0;
    s.actors[3].tile = 0xfc;
    p.log = '';
    await cast(g, 0x2f);
    expect(p.log).toContain('Magic absorbed!');
    expect([s.icon, s.protection]).toEqual([0, 0]);
  });
});

/** The spells that need a fight: missiles, charm, sleep, blinking, invisibility; the foe's wits against the caster's. */
describe('spells cast in a fight', () => {
  it('Grav Por, the magic missile, never misses and hurts the foe it is aimed at', async () => {
    const { g, p, s } = fight(RAT);
    const foe = g.combat[6];
    const hp = foe.hp;
    p.keys.push(K.Enter);
    await cast(g, 1);
    expect(s.members[0].mp).toBe(49);
    expect(foe.hp).toBeLessThan(hp);
  });

  it('An Ex Xen charms a foe who fails to resist it, and frees a member the foe had charmed', async () => {
    const { g, p, s } = fight(RAT);
    s.members[0].int = 99;
    p.keys.push(K.Enter);
    await cast(g, 0x22);
    expect(g.combat[6].flags & CF.Charmed).toBeTruthy();
    expect(g.charmedBy.get(6)).toBe(0);
    expect(said(p)).toContain('charmed!');

    const freed = fight(RAT);
    freed.s.members[0].int = 99;
    freed.g.combat[6].flags = 0; // no foe stands, so the aim starts on the caster
    Object.assign(freed.g.combat[1], { who: 1, x: 6, y: 5, flags: CF.Player, actor: 3 });
    Object.assign(freed.s.actors[3], { tile: 0x1c, anim: 0x1c, x: 6, y: 5, z: 0 });
    charm(freed.g, 1, 6);
    freed.s.members[1].status = Status.Sleeping;
    freed.p.keys.push(K.Right, K.Enter);
    await cast(freed.g, 0x22);
    expect(freed.g.combat[1].flags & CF.Charmed).toBe(0);
    expect(freed.g.charmedBy.has(1)).toBe(false);
    expect(freed.s.members[1].status).toBe(Status.Good);
  });

  it('a foe of sharper wits resists the charm, and Blackthorn and the Shadowlords shrug it off whatever the caster', async () => {
    const wise = fight(WISE);
    wise.s.members[0].int = 0;
    wise.p.keys.push(K.Enter);
    await cast(wise.g, 0x22);
    expect(wise.g.combat[6].flags & CF.Charmed).toBe(0);
    expect(said(wise.p)).toContain('Failed!');

    const lord = fight(0xe);
    lord.s.members[0].int = 99;
    lord.p.keys.push(K.Enter);
    await cast(lord.g, 0x22);
    expect(lord.g.combat[6].flags & CF.Charmed).toBe(0);
    expect(said(lord.p)).toContain('Failed!');
  });

  it('In Zu puts the foe before the caster to sleep, unless its wits resist', async () => {
    const { g, p, s } = fight(RAT, 5);
    s.members[0].int = 99;
    p.keys.push(K.Right);
    await cast(g, 0x1c);
    expect(g.combat[6].flags & CF.Asleep).toBeTruthy();
    expect(said(p)).toContain('slept!');

    const wise = fight(WISE, 5);
    wise.s.members[0].int = 0;
    wise.p.keys.push(K.Right);
    await cast(wise.g, 0x1c);
    expect(wise.g.combat[6].flags & CF.Asleep).toBe(0);
  });

  it('Bet Rel Xen turns a foe into a rat where it does not resist', async () => {
    const { g, p, s } = fight(BARD);
    s.members[0].int = 99;
    p.keys.push(K.Enter);
    await cast(g, 0x23);
    const foe = g.combat.find((c, i) => i > 0 && c.flags & CF.Monster && c.x === 6 && c.y === 5);
    expect(foe?.who).toBe(0x14);
  });

  it('In Por blinks the caster to another square, and not at all where the fight forbids it', async () => {
    const { g, s } = fight(RAT, 5);
    await cast(g, 0x11);
    const me = g.combat[0];
    expect([me.x, me.y]).not.toEqual([5, 5]);
    expect([s.actors[1].x, s.actors[1].y]).toEqual([me.x, me.y]);

    const held = fight(RAT, 5);
    held.s.combatFlags |= 2;
    await cast(held.g, 0x11);
    expect([held.g.combat[0].x, held.g.combat[0].y]).toEqual([5, 5]);
    expect(said(held.p)).toContain('Failed!');
  });

  it('Lor Sanct makes the caster invisible, and Quas Wis shows the foes who are', async () => {
    const { g, s } = fight(RAT);
    await cast(g, 0x24);
    expect(g.combat[0].flags & CF.Invisible).toBeTruthy();
    expect(s.actors[1].anim).not.toBe(s.actors[1].tile);
    g.combat[6].flags |= CF.Invisible;
    s.actors[2].anim = 0x1d;
    await cast(g, 0x17);
    expect(g.combat[6].flags & CF.Invisible).toBe(0);
    expect(s.actors[2].anim).toBe(s.actors[2].tile);
  });

  it('An Tym freezes the foes: a monster, while time is stopped, has a dexterity of one', async () => {
    const { g, s } = fight(RAT);
    expect(stat(g, 6, -2)).toBeGreaterThan(1);
    await cast(g, 0x2f);
    expect(s.icon).toBe(0x54);
    expect(stat(g, 6, -2)).toBe(1);
  });
});

/** Mix (magic.ts mixCommand): reagents spent, and the mixture made only from the spell's own recipe. */
describe('mixing', () => {
  const lorMask = (g: Game): number => g.data.bytes(0x1cc0, 0x30)[0];

  it('says there are no reagents when the party has none', async () => {
    const { g, p, s } = hut();
    s.reagents.fill(0);
    await mixCommand(g);
    expect(said(p)).toContain('No reagents owned!');
  });

  it('asks again how much, where there are not the reagents for so many', async () => {
    const { g, p, s } = hut();
    s.reagents.fill(5);
    p.keys.push(...keys('IL', K.Enter), ...mixKeys(lorMask(g), '9'), ...keys('2', K.Enter));
    await mixCommand(g);
    expect(said(p)).toContain('Insufficient reagents!');
    expect(said(p)).toContain('Done!');
    expect(s.mixtures[0]).toBe(2);
    for (let i = 0; i < 8; i++) expect(s.reagents[i]).toBe(lorMask(g) & (0x80 >> i) ? 3 : 5);
  });

  it('mixes nothing from no reagents ticked, and spends nothing', async () => {
    const { g, p, s } = hut();
    s.reagents.fill(5);
    p.keys.push(...keys('IL', K.Enter), ...mixKeys(0, '1'));
    await mixCommand(g);
    expect(said(p)).toContain('Nothing to mix!');
    expect(s.mixtures[0]).toBe(0);
    expect(s.reagents.every((r) => r === 5)).toBe(true);
  });

  it('spends the reagents of a wrong recipe all the same, and mixes nothing', async () => {
    const { g, p, s } = hut();
    s.reagents.fill(5);
    const mask = lorMask(g) ^ 0x01;
    p.keys.push(...keys('IL', K.Enter), ...mixKeys(mask, '1'));
    await mixCommand(g);
    expect(s.mixtures[0]).toBe(0);
    for (let i = 0; i < 8; i++) expect(s.reagents[i]).toBe(mask & (0x80 >> i) ? 4 : 5);
  });
});
