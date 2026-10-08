import { describe, expect, it } from 'vitest';
import { attackCombat, combatantAt, onMonsterSide, removeCombatant } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { fighter, keys, newGame } from './helpers.ts';

/**
 * Bump to attack (controller play): walking into a foe strikes it. A member with a weapon in each hand - Iolo
 * starts with a main gauche and a short sword - strikes once with each, and neither blow stops to ask where it goes:
 * the foe walked into while it stands, else the nearest foe in reach, else none (followup.test.ts).
 */
describe('bump to attack', () => {
  for (const seed of [1, 2, 3])
    it(`asks no aim of any blow a bump gives (seed ${seed})`, async () => {
      const { g, p } = newGame(seed);
      journeyOnward(g);
      await enterTown(g, true);
      p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
      await townLoop(g).catch((e: Error) => {
        if (!e.message.includes('ran out')) throw e;
      });
      const s = g.s;
      const iolo = s.members.findIndex((m) => m.name === 'Iolo');
      expect(s.members[iolo].equips.filter((e) => e !== 0xff).length).toBeGreaterThanOrEqual(4); // two weapons, two armour
      const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
      const foe = s.actors[1];
      foe.tile = foe.anim = 0x40 + rat * 4;
      [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];

      // The shared fighter plays the keyboard (A for Attack, which a controller's keyboard reads as west): the bump is
      // made in controller play, everything else as the fighter would.
      const inner = fighter(g);
      const fight = (): number => {
        g.options.input = 'letters';
        return inner();
      };
      let bump: { turn: number; x: number; y: number } | null = null;
      let bumps = 0;
      let askedInBump = 0;
      p.next = () => {
        const me = g.combat[s.combatTurn];
        if (s.crosshair) {
          // Asked to aim in the turn of a bump: no blow of a bump asks.
          if (bump && bump.turn === s.combatTurn) askedInBump++;
          return fight();
        }
        bump = null;
        // A foe beside the member, across a side: walk into it.
        for (const [dx, dy, key] of [
          [1, 0, K.Right],
          [-1, 0, K.Left],
          [0, 1, K.Down],
          [0, -1, K.Up],
        ] as const) {
          const at = combatantAt(g, me.x + dx, me.y + dy);
          if (at >= 0 && onMonsterSide(g, at) && !(g.combat[at].flags & CF.Dead)) {
            bump = { turn: s.combatTurn, x: me.x + dx, y: me.y + dy };
            bumps++;
            g.options.input = 'controller';
            return key;
          }
        }
        return fight();
      };
      await attackCombat(g, 1);
      expect(p.log).toMatch(/VICTORY|BATTLE IS LOST/);
      expect(bumps).toBeGreaterThan(0);
      expect(askedInBump).toBe(0);
    });

  it('with Auto aim off, starts the crosshair on the foe walked into, and asks', async () => {
    const { g, p } = newGame(1);
    g.options.autoAim = false;
    journeyOnward(g);
    await enterTown(g, true);
    p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    const s = g.s;
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    const foe = s.actors[1];
    foe.tile = foe.anim = 0x40 + rat * 4;
    [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];
    const inner = fighter(g);
    const fight = (): number => {
      g.options.input = 'letters';
      return inner();
    };
    let bump: { turn: number; x: number; y: number } | null = null;
    const starts: { at: [number, number]; walkedInto: [number, number] }[] = [];
    p.next = () => {
      const me = g.combat[s.combatTurn];
      if (s.crosshair) {
        if (bump && bump.turn === s.combatTurn && starts.length === 0)
          starts.push({ at: [s.crossX, s.crossY], walkedInto: [bump.x, bump.y] });
        return fight();
      }
      bump = null;
      for (const [dx, dy, key] of [
        [1, 0, K.Right],
        [-1, 0, K.Left],
        [0, 1, K.Down],
        [0, -1, K.Up],
      ] as const) {
        const at = combatantAt(g, me.x + dx, me.y + dy);
        if (starts.length === 0 && at >= 0 && onMonsterSide(g, at) && !(g.combat[at].flags & CF.Dead)) {
          bump = { turn: s.combatTurn, x: me.x + dx, y: me.y + dy };
          g.options.input = 'controller';
          return key;
        }
      }
      return fight();
    };
    await attackCombat(g, 1);
    expect(starts.length).toBe(1);
    expect(starts[0].at).toEqual(starts[0].walkedInto);
  });

  it('with Auto aim on, strikes the foe a blow aimed by hand struck again with the next hand, without asking', async () => {
    const { g, p } = newGame(2);
    journeyOnward(g);
    await enterTown(g, true);
    p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    const s = g.s;
    const iolo = s.members.findIndex((m) => m.name === 'Iolo');
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    const foe = s.actors[1];
    foe.tile = foe.anim = 0x40 + rat * 4;
    [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];
    const fight = fighter(g);
    let phase = 0;
    let from = 0;
    // An aim asked: the crosshair put up, then a key waited for under it (a blow not asked puts it up and down again).
    let asked = 0;
    let up = false;
    const proto = Object.getPrototypeOf(s) as object;
    const field = Object.getOwnPropertyDescriptor(proto, 'crosshair')!;
    Object.defineProperty(s, 'crosshair', {
      get: () => field.get!.call(s) as number,
      set: (v: number) => {
        field.set!.call(s, v);
        up = v !== 0;
      },
    });
    const wait = p.waitKey.bind(p);
    p.waitKey = async () => {
      if (up && phase === 1) {
        asked++;
        up = false;
      }
      return wait();
    };
    p.next = () => {
      const me = g.combat[s.combatTurn];
      const mine = !!(me.flags & CF.Player) && me.who === iolo;
      if (phase === 0 && mine && !s.crosshair) {
        // A rat beside him too tough to fall to one blow: the second hand has it still to strike.
        const beside = g.combat.findIndex(
          (c, j) => c.flags && !(c.flags & CF.Dead) && onMonsterSide(g, j) && Math.max(Math.abs(c.x - me.x), Math.abs(c.y - me.y)) <= 1,
        );
        if (beside >= 0) {
          g.combat[beside].hp = 200;
          phase = 1;
          from = p.log.length;
          return 'A'.charCodeAt(0); // Attack, as the menu gives it: the first blow aimed by hand
        }
      }
      if (phase === 1 && !mine && !s.crosshair) phase = 2;
      return fight();
    };
    await attackCombat(g, 1).catch(() => {});
    const log = p.log.slice(from);
    expect(log).toContain('Main Gauche:');
    expect(log).toContain('Short Sword:');
    // His turn, to the next one's heading: one aim asked, the first blow's.
    const turn = log.slice(0, log.indexOf('armed with') < 0 ? undefined : log.indexOf('armed with'));
    expect(turn).toContain('Short Sword:');
    expect(asked).toBe(1); // the first blow's aim alone
  });

  /** A fight with Iolo (a weapon in each hand) about to take a turn; `choose` plays his Attack, the fighter the rest. */
  async function ioloAttacks(seed: number, backOutOf: 'first' | 'second'): Promise<{ after: number[]; log: string }> {
    const { g, p } = newGame(seed);
    g.options.autoAim = false; // every blow aimed by hand, the second too
    journeyOnward(g);
    await enterTown(g, true);
    p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    const s = g.s;
    const iolo = s.members.findIndex((m) => m.name === 'Iolo');
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    const foe = s.actors[1];
    foe.tile = foe.anim = 0x40 + rat * 4;
    [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];
    const fight = fighter(g);
    const isIolo = (): boolean => !!(g.combat[s.combatTurn].flags & CF.Player) && g.combat[s.combatTurn].who === iolo;
    // 0 not yet, 1 his Attack under way, 2 backed out: the turns that follow are noted.
    let phase = 0;
    let from = 0;
    const after: number[] = [];
    p.next = () => {
      if (phase === 2) {
        if (!s.crosshair && after.length < 1) after.push(s.combatTurn);
        return fight();
      }
      if (phase === 0) {
        const me = g.combat[s.combatTurn];
        const near = g.combat.some(
          (c, i) => c.flags && !(c.flags & CF.Dead) && onMonsterSide(g, i) && Math.max(Math.abs(c.x - me.x), Math.abs(c.y - me.y)) <= 1,
        );
        if (isIolo() && !s.crosshair && near) {
          phase = 1;
          from = p.log.length;
          return 'A'.charCodeAt(0);
        }
        return fight();
      }
      // His Attack: back out of the chosen hand's aim; the first hand strikes as the fighter aims it.
      const second = p.log.slice(from).includes('Short Sword:');
      if (s.crosshair && (backOutOf === 'first' || second)) {
        phase = 2;
        return K.Escape;
      }
      return fight();
    };
    await attackCombat(g, 1);
    return { after, log: p.log.slice(from) };
  }

  it('spends the turn when the second hand is backed out of, the first having struck', async () => {
    const { after, log } = await ioloAttacks(2, 'second');
    expect(log).toContain('Main Gauche:');
    expect(log).toContain('Short Sword:');
    expect(log.slice(0, log.indexOf('Short Sword:'))).toMatch(/killed!|missed!|wounded!|barely|heavily|critical|fleeing|lightly/);
    expect(after.length).toBe(1);
    const rest = log.slice(log.indexOf('Short Sword:'));
    expect(rest.slice(rest.indexOf('Nothing!'))).not.toMatch(/^Nothing!\s*\nIolo, armed/); // the next to act is not Iolo again // not asked again
  });

  it('spends no turn, and asks nothing of the second hand, when the first is backed out of', async () => {
    const { log } = await ioloAttacks(2, 'first');
    // The first hand named, its aim backed out of: no "Nothing!" as if a blow were spent, the second hand not asked,
    // and Iolo asked again.
    const cut = log.indexOf('Main Gauche:');
    expect(cut).toBeGreaterThan(-1);
    const after = log.slice(cut);
    expect(after).toMatch(/^Main Gauche:\s*\nIolo, armed/);
    expect(after.slice(0, after.indexOf('Iolo, armed'))).not.toMatch(/Nothing!|Short Sword:/);
  });

  it('does not ask the second hand where to strike when the first killed the only foe in its reach', async () => {
    let killed = 0;
    for (let seed = 1; seed <= 12 && killed === 0; seed++) {
      const { g, p } = newGame(seed);
      journeyOnward(g);
      await enterTown(g, true);
      p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
      await townLoop(g).catch((e: Error) => {
        if (!e.message.includes('ran out')) throw e;
      });
      const s = g.s;
      const iolo = s.members.findIndex((m) => m.name === 'Iolo');
      const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
      const foe = s.actors[1];
      foe.tile = foe.anim = 0x40 + rat * 4;
      [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];
      const fight = fighter(g);
      let from = -1;
      let turn = -1;
      p.next = () => {
        const me = g.combat[s.combatTurn];
        if (from < 0 && me.flags & CF.Player && me.who === iolo && !s.crosshair) {
          // One rat left, beside him and all but dead; the rest of the pack gone.
          const near = (c: (typeof g.combat)[number]): boolean => Math.max(Math.abs(c.x - me.x), Math.abs(c.y - me.y)) <= 1;
          const beside = g.combat.findIndex((c, j) => c.flags && !(c.flags & CF.Dead) && onMonsterSide(g, j) && near(c));
          if (beside >= 0) {
            g.combat.forEach((c, j) => {
              if (j !== beside && c.flags && !(c.flags & CF.Dead) && onMonsterSide(g, j)) removeCombatant(g, -j - 1);
            });
            g.combat[beside].hp = 1;
            from = p.log.length;
            turn = s.combatTurn;
            return 'A'.charCodeAt(0);
          }
        }
        return fight();
      };
      await attackCombat(g, 1).catch(() => {});
      if (from < 0) continue;
      const log = p.log.slice(from);
      const blow = log.slice(0, log.indexOf('Short Sword:') < 0 ? undefined : log.indexOf('Short Sword:'));
      if (!/killed!/.test(blow)) continue; // the first blow missed: the second hand is asked, rightly
      killed++;
      expect(log).toContain('Main Gauche:');
      expect(log).not.toContain('Short Sword:');
      void turn;
    }
    expect(killed).toBeGreaterThan(0);
  });

  /** A fight in which every member presses X at a foe beside them, across a corner too; the aim prompts X met. */
  async function yFight(seed: number, autoAim: boolean): Promise<{ yTurns: number; asked: number; log: string }> {
    const { g, p } = newGame(seed);
    journeyOnward(g);
    await enterTown(g, true);
    p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    const s = g.s;
    g.options.autoAim = autoAim;
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    const foe = s.actors[1];
    foe.tile = foe.anim = 0x40 + rat * 4;
    [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];
    const inner = fighter(g);
    const fight = (): number => {
      g.options.input = 'letters';
      return inner();
    };
    let yTurn = -1;
    let yTurns = 0;
    let asked = 0;
    let aiming = false;
    p.next = () => {
      if (s.crosshair) {
        if (yTurn === s.combatTurn && !aiming) asked++;
        const k = fight();
        aiming = k !== K.Enter && k !== K.Escape;
        return k;
      }
      aiming = false;
      yTurn = -1;
      const me = g.combat[s.combatTurn];
      const near = g.combat.some(
        (c, i) => c.flags && !(c.flags & CF.Dead) && onMonsterSide(g, i) && Math.max(Math.abs(c.x - me.x), Math.abs(c.y - me.y)) === 1,
      );
      if (near && me.flags & CF.Player) {
        yTurn = s.combatTurn;
        yTurns++;
        g.options.input = 'controller';
        return Pad.X;
      }
      return fight();
    };
    await attackCombat(g, 1);
    return { yTurns, asked, log: p.log };
  }

  it('strikes with X, Auto aim on, at a foe beside the member - across a corner too - without aiming', async () => {
    for (const seed of [1, 2, 3]) {
      const { yTurns, asked, log } = await yFight(seed, true);
      expect(log).toMatch(/VICTORY|BATTLE IS LOST/);
      expect(yTurns).toBeGreaterThan(0);
      expect(asked).toBe(0);
    }
  });

  it('aims X by hand with Auto aim off', async () => {
    let asked = 0;
    for (const seed of [1, 2, 3]) asked += (await yFight(seed, false)).asked;
    expect(asked).toBeGreaterThan(0);
  });

  /** A fight begun as yFight's, the rat set down `away` squares off; `next` answers every key asked for. */
  async function ratFight(seed: number, next: (g: ReturnType<typeof newGame>['g'], fight: () => number) => number): Promise<string> {
    const { g, p } = newGame(seed);
    journeyOnward(g);
    await enterTown(g, true);
    p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    const s = g.s;
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    const foe = s.actors[1];
    foe.tile = foe.anim = 0x40 + rat * 4;
    [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];
    const inner = fighter(g);
    p.next = () =>
      next(g, () => {
        g.options.input = 'letters';
        return inner();
      });
    await attackCombat(g, 1);
    return p.log;
  }

  it('says so when X has nothing in reach, and gives the member the turn back - no aim that could only be backed out of', async () => {
    let said = 0;
    for (const seed of [1, 2, 3]) {
      let tried = -1;
      let aimedAfterY = false;
      let againAfterY = 0;
      const log = await ratFight(seed, (g, fight) => {
        const s = g.s;
        if (tried >= 0) {
          if (s.crosshair) aimedAfterY = true;
          else if (s.combatTurn === tried) againAfterY++;
          tried = -2; // once a fight is enough to see
          return fight();
        }
        const me = g.combat[s.combatTurn];
        const inReach = g.combat.some(
          (c, i) => c.flags && !(c.flags & CF.Dead) && onMonsterSide(g, i) && Math.max(Math.abs(c.x - me.x), Math.abs(c.y - me.y)) <= 1,
        );
        if (
          tried === -1 &&
          !s.crosshair &&
          me.flags & CF.Player &&
          !inReach &&
          g.s.members[me.who].equips.every((w) => w === 0xff || g.data.bytes(0x1664, 0x38)[w] === 0)
        ) {
          tried = s.combatTurn;
          g.options.input = 'controller';
          g.options.autoAim = true;
          return Pad.X;
        }
        return fight();
      });
      if (tried === -2) {
        expect(aimedAfterY, `seed ${seed}`).toBe(false);
        expect(againAfterY, `seed ${seed}: the same member asked again`).toBe(1);
        expect(log).toContain('Out of reach!');
        said++;
      }
    }
    expect(said).toBeGreaterThan(0);
  });

  it('asks no hand to aim whose weapon reaches no foe, while another reaches one (a spiked helm, and a bow in hand)', async () => {
    let checked = 0;
    for (const seed of [1, 2, 3]) {
      let aimedWith = -1;
      let asked = false;
      await ratFight(seed, (g, fight) => {
        const s = g.s;
        const me = g.combat[s.combatTurn];
        if (asked && s.crosshair && aimedWith < 0) {
          aimedWith = s.weapon; // the first hand asked to aim; backed out of, and the fight goes on as it will
          return Pad.B;
        }
        if (!asked && !s.crosshair && me.flags & CF.Player && me.who === 0) {
          const foes = g.combat.filter((c, i) => c.flags && !(c.flags & CF.Dead) && onMonsterSide(g, i));
          const d = (c: (typeof foes)[number]): number => Math.max(Math.abs(c.x - me.x), Math.abs(c.y - me.y));
          if (foes.length && foes.every((c) => d(c) > 1)) {
            const e = s.members[0].equips;
            [e[0], e[2], e[3]] = [0x03, 0x24, 0xff]; // Spiked Helm; Magic Bow
            asked = true;
            g.options.input = 'controller';
            g.options.autoAim = false; // every blow aimed by hand, as auto combat's Attack is
            return Pad.X;
          }
        }
        return fight();
      });
      if (asked) {
        expect(aimedWith, `seed ${seed}`).toBe(0x24);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("takes no blow from Y at an attack's aim - Y is the spell's button - and the blow from X after it", async () => {
    let ignored = 0;
    for (const seed of [1, 2, 3]) {
      let yAt = -1;
      await ratFight(seed, (g, fight) => {
        const s = g.s;
        const me = g.combat[s.combatTurn];
        const near = g.combat.some(
          (c, i) => c.flags && !(c.flags & CF.Dead) && onMonsterSide(g, i) && Math.max(Math.abs(c.x - me.x), Math.abs(c.y - me.y)) === 1,
        );
        if (s.crosshair && me.flags & CF.Player && near) {
          g.options.input = 'controller';
          if (yAt !== s.combatTurn) {
            yAt = s.combatTurn;
            return Pad.Y;
          }
          ignored++; // asked again, still aiming, after the Y
          yAt = -1;
          return Pad.X;
        }
        if (!s.crosshair && near && me.flags & CF.Player) {
          g.options.input = 'controller';
          g.options.autoAim = false;
          return Pad.X;
        }
        return fight();
      });
    }
    expect(ignored).toBeGreaterThan(0);
  });

  it('strikes with X at the aim, as A does, and never opens the letter picker there', async () => {
    let yAtAim = 0;
    for (const seed of [1, 2, 3]) {
      const log = await ratFight(seed, (g, fight) => {
        const s = g.s;
        expect(g.menuShown?.title).not.toBe('Letters');
        const me = g.combat[s.combatTurn];
        const near = g.combat.some(
          (c, i) => c.flags && !(c.flags & CF.Dead) && onMonsterSide(g, i) && Math.max(Math.abs(c.x - me.x), Math.abs(c.y - me.y)) === 1,
        );
        if (s.crosshair && near && me.flags & CF.Player) {
          if (++yAtAim > 400) throw new Error('X at the aim does not strike');
          g.options.input = 'controller';
          return Pad.X;
        }
        if (!s.crosshair && near && me.flags & CF.Player) {
          g.options.input = 'controller';
          g.options.autoAim = false; // aimed by hand, so the aim is asked
          return Pad.X;
        }
        return fight();
      });
      expect(log).toMatch(/VICTORY|BATTLE IS LOST/);
    }
    expect(yAtAim).toBeGreaterThan(0);
  });
});
