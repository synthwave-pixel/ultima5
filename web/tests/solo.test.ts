import { describe, expect, it } from 'vitest';
import { charm, damage, leaveArena, poison, putToSleep } from '../src/game/combat.ts';
import { lootOffer } from '../src/game/loot.ts';
import { CF } from '../src/game/game.ts';
import { K, Pad, SOLO, SOLO_OFF } from '../src/game/io.ts';
import { commandMenu } from '../src/game/offers.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Status } from '../src/game/save.ts';
import { endSolo, setAutoCombat, startSolo } from '../src/game/solo.ts';
import { damageMember } from '../src/game/time.ts';
import { newGame } from './helpers.ts';
import { actor } from '../src/game/actors.ts';

/**
 * Solo Mode (solo.ts): with a controller, the member whose turn it is in a fight made the only one who moves - 1988's
 * active player, set from the command menu - until anyone is hurt, Cancel Solo is chosen, or the fight is left.
 */
describe('Solo Mode', () => {
  /** A fight of three members against one foe, member 0's turn, a controller in hand; `won`: the foe gone. */
  const fight = (won = false, room = false) => {
    const made = newGame();
    const { g } = made;
    journeyOnward(g);
    const s = g.s;
    g.options.input = 'controller';
    g.commandPrompt = 'combat';
    for (const c of g.combat) c.clear();
    for (let i = 1; i < 32; i++) actor(g, i).tile = 0;
    for (let m = 0; m < 3; m++) {
      Object.assign(s.members[m], { status: Status.Good });
      s.members[m].hp = 50;
      const c = g.combat[m];
      Object.assign(c, { flags: CF.Player, who: m, actor: 8 + m, x: 4 + m, y: 5 });
      Object.assign(actor(g, 8 + m), { tile: 0x80, anim: 0x80, x: 4 + m, y: 5, z: 0 });
    }
    if (!won) {
      const foe = g.combat[3];
      Object.assign(foe, { flags: CF.Monster, who: 0, actor: 12, x: 5, y: 1, hp: 30 });
      Object.assign(actor(g, 12), { tile: 0x40, anim: 0x40, x: 5, y: 1, z: 0 });
    }
    Object.assign(s, {
      mapId: 0xff,
      combatTurn: 0,
      activeMember: 0xff,
      battleWon: won ? 1 : 0,
      combatFlags: room ? 0x82 : 0,
      exitDir: 0,
      partySize: 3,
    });
    return made;
  };
  /** The command menu's lines, as shown, closed with B. */
  const labels = async (made: ReturnType<typeof fight>): Promise<string[]> => {
    let shown: string[] = [];
    made.p.next = () => {
      shown = [...made.g.menuShown!.labels];
      return Pad.B;
    };
    await commandMenu(made.g);
    return shown;
  };
  const standing = (g: ReturnType<typeof fight>['g']): number[] =>
    [0, 1, 2].filter((i) => (g.combat[i].flags & (CF.Player | CF.Dead)) === CF.Player);

  it('is offered on a member’s turn with a controller, foes standing or not, and Cancel Solo in its place once on', async () => {
    for (const won of [false, true]) {
      const made = fight(won);
      let shown = await labels(made);
      expect(shown).toContain('Solo Mode');
      expect(shown).not.toContain('Cancel Solo');
      made.g.s.activeMember = 0;
      shown = await labels(made);
      expect(shown).toContain('Cancel Solo');
      expect(shown).not.toContain('Solo Mode');
    }
  });

  it('is not offered with the keyboard’s letters, nor on a foe’s turn, nor out of a fight', async () => {
    const letters = fight();
    letters.g.options.input = 'letters';
    expect(await labels(letters)).not.toContain('Solo Mode');
    const foes = fight();
    foes.g.s.combatTurn = 3;
    expect(await labels(foes)).not.toContain('Solo Mode');
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.input = 'controller';
    expect(await labels({ g, p })).not.toContain('Solo Mode');
  });

  it('is chosen from the menu under keys of its own', async () => {
    const made = fight();
    made.p.next = () => {
      const m = made.g.menuShown!;
      const i = m.labels.indexOf('Solo Mode');
      if (i < 0) return Pad.B;
      return m.at === i ? Pad.A : m.at < i ? K.Down : K.Up;
    };
    expect(await commandMenu(made.g)).toBe(SOLO);
    made.g.s.activeMember = 0;
    made.p.next = () => {
      const m = made.g.menuShown!;
      const i = m.labels.indexOf('Cancel Solo');
      if (i < 0) return Pad.B;
      return m.at === i ? Pad.A : m.at < i ? K.Down : K.Up;
    };
    expect(await commandMenu(made.g)).toBe(SOLO_OFF);
  });

  it('makes the member whose turn it is the one who moves, and says so; Cancel Solo ends it', () => {
    const { g, p } = fight();
    const name = g.s.members[1].name;
    g.s.combatTurn = 1;
    startSolo(g);
    expect(g.s.activeMember).toBe(1);
    expect(p.log.replace(/\s+/g, ' ')).toContain(`Solo: ${name}`);
    endSolo(g);
    expect(g.s.activeMember).toBe(0xff);
    expect(p.log).toContain('Solo off');
  });

  it('ends when anyone is hurt in the fight - a member or a foe - saying who', async () => {
    const { g, p } = fight();
    const name = g.s.members[2].name;
    startSolo(g);
    await damage(g, 2, 5);
    expect(g.s.activeMember).toBe(0xff);
    expect(p.log.replace(/\s+/g, ' ')).toContain(`Solo off: ${name} is hit!`);
    startSolo(g);
    await damage(g, 3, 5); // the foe
    expect(g.s.activeMember).toBe(0xff);
    // A trap or a fall that hurts members in the fight ends it too.
    startSolo(g);
    await damageMember(g, 1, 3);
    expect(g.s.activeMember).toBe(0xff);
  });

  it('is not ended by a blow that does nothing, and the keyboard’s active player is not ended by a hit', async () => {
    const { g } = fight();
    startSolo(g);
    await damage(g, 2, 0);
    expect(g.s.activeMember).toBe(0);
    g.options.input = 'letters';
    await damage(g, 2, 5);
    expect(g.s.activeMember).toBe(0);
  });

  it('takes the whole party off a won field by the way the solo member walks off it, in a dungeon room too', async () => {
    for (const room of [false, true]) {
      const { g, p } = fight(true, room);
      startSolo(g);
      g.s.members[2].status = Status.Sleeping;
      g.combat[2].flags |= CF.Asleep;
      expect(await leaveArena(g, 0, K.Up)).toBe(true);
      expect(standing(g)).toEqual([]);
      expect(g.s.exitDir).toBe(K.Up);
      expect(g.s.activeMember).toBe(0xff);
      expect(p.log).toContain('Leave!');
    }
  });

  it('takes only the solo member off a field where foes stand, as 1988 did, and Solo Mode ends', async () => {
    const { g, p } = fight(false, true);
    startSolo(g);
    expect(await leaveArena(g, 0, K.Up)).toBe(true);
    expect(standing(g)).toEqual([1, 2]);
    expect(g.s.activeMember).toBe(0xff);
    expect(p.log).toContain('Solo off');
  });

  it('ends, saying so, when anyone is put to sleep - the solo member, another, or a foe the party slept', () => {
    for (const who of [0, 1, 3]) {
      const { g, p } = fight();
      startSolo(g);
      putToSleep(g, who);
      expect(g.s.activeMember).toBe(0xff);
      const name = who < 3 ? g.s.members[who].name : '';
      expect(p.log.replace(/\s+/g, '')).toMatch(new RegExp(`Solooff:${name}.*isasleep!`));
    }
  });

  it('ends when a healthy member is poisoned by a blow that does no damage', async () => {
    const { g, p } = fight();
    startSolo(g);
    await poison(g, 1, 3);
    expect(g.s.members[1].status).toBe(Status.Poisoned);
    expect(g.s.activeMember).toBe(0xff);
    expect(p.log.replace(/\s+/g, ' ')).toContain(`Solo off: ${g.s.members[1].name} is poisoned!`);
  });

  it('ends when anyone is charmed - the solo member, another, a foe by the party, the Chaos Sword - not a creature summoned', () => {
    for (const [who, by] of [
      [0, 3],
      [1, 3],
      [3, 0],
      [1, 'bound'],
    ] as [number, number | 'bound'][]) {
      const { g, p } = fight();
      startSolo(g);
      charm(g, who, by);
      expect(g.s.activeMember).toBe(0xff);
      expect(p.log.replace(/\s+/g, '')).toContain('ischarmed!');
    }
    const { g } = fight();
    startSolo(g);
    charm(g, 3, 'bound'); // a creature the party summoned, its for good
    expect(g.s.activeMember).toBe(0);
  });

  it('ends at any change to Auto combat', () => {
    for (const mode of ['allies', 'all', 'off'] as const) {
      const { g, p } = fight();
      g.options.autoCombat = mode === 'off' ? 'all' : 'off';
      startSolo(g);
      setAutoCombat(g, mode);
      expect(g.options.autoCombat).toBe(mode);
      expect(g.s.activeMember).toBe(0xff);
      expect(p.log).toContain('Solo off');
    }
  });

  it('does not take the party off, nor offer Leave combat or Loot and Leave, once a foe is back on a won field', async () => {
    // Won, and then a charmed member turned (the Chaos Sword) or a charmed creature broke free: a foe stands again.
    const made = fight(true);
    const { g } = made;
    Object.assign(g.combat[3], { flags: CF.Monster, who: 0, actor: 12, x: 5, y: 1, hp: 30 });
    Object.assign(actor(g, 12), { tile: 0x40, anim: 0x40, x: 5, y: 1, z: 0 });
    Object.assign(actor(g, 13), { tile: 2, anim: 2, x: 2, y: 2, z: 0 }); // gold lying there
    expect(lootOffer(g)).toBe('hide');
    const shown = await labels(made);
    expect(shown).not.toContain('Leave combat');
    expect(shown).not.toContain('Loot and Leave');
    startSolo(g);
    expect(await leaveArena(g, 0, K.Up)).toBe(true);
    expect(standing(g)).toEqual([1, 2]);
  });

  it('takes only the member who walks off when it is not the solo one, or with the keyboard', async () => {
    const other = fight(true, true);
    other.g.s.activeMember = 1;
    expect(await leaveArena(other.g, 0, K.Up)).toBe(true);
    expect(standing(other.g)).toEqual([1, 2]);
    const letters = fight(true, true);
    letters.g.options.input = 'letters';
    letters.g.s.activeMember = 0;
    expect(await leaveArena(letters.g, 0, K.Up)).toBe(true);
    expect(standing(letters.g)).toEqual([1, 2]);
  });
});

/** Deceit's bottom room, its foes slain at once: Solo Mode chosen from the menu, and only that member is asked after. */
it('leaves only the solo member to move in a dungeon room, chosen from the menu, without spending their turn', async () => {
  const { command: cmd, fly: flyTo, Landed: Done } = await import('./pilot.ts');
  const { runGame } = await import('../src/game/run.ts');
  const { g, p } = newGame();
  journeyOnward(g);
  const s = g.s;
  const { stashWorldActors } = await import('../src/game/outdoors.ts');
  stashWorldActors(g);
  const loc = g.data.locations[32];
  Object.assign(s, { mapId: 0, level: 0xff, x: loc.x, y: loc.y, facing: 0 });
  s.d58d0[0] = 0x80;
  g.autoKill = true;
  let solo = -1;
  const asked: number[] = [];
  flyTo(g, p, [
    cmd('Enter'),
    (game) => (game.commandPrompt === 'combat' && !game.menuShown ? undefined : game.menuShown ? Pad.B : Pad.A),
    (game) => {
      solo = game.combat[game.s.combatTurn].who;
      return undefined;
    },
    cmd('Solo Mode'),
    (game) => {
      if (game.menuShown) return Pad.B;
      if (game.commandPrompt !== 'combat') return undefined;
      asked.push(game.combat[game.s.combatTurn].who);
      return asked.length < 6 ? Pad.B : undefined; // pass
    },
  ]);
  await runGame(g).catch((e: unknown) => {
    if (!(e instanceof Done)) throw e;
  });
  expect(solo).toBeGreaterThanOrEqual(0);
  expect(p.log.replace(/\s+/g, ' ')).toContain(`Solo: ${s.members[solo].name}`);
  expect(asked.length).toBe(6);
  expect(new Set(asked)).toEqual(new Set([solo])); // the solo member asked again at once, and no one else after
});
