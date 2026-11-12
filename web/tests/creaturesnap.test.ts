import { describe, expect, it } from 'vitest';
import { aim, attackCommand, charm, cycleSnap, placeCombatant, snapMark, snapTarget, snapTargets } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/**
 * A creature on the party's side - summoned, or charmed to it - attacks as a member does (the port's): aimed by hand
 * within its own reach (a daemon's fire 9 squares, a python's spit 3, a rat's bite a neighbour), and with Snap attacks
 * at its snap target - marked at its prompt, stepped through with LB/RB, the foe it struck kept, a foe a stray might
 * carry into a friend passed over while another will do.
 */
describe("a creature on the party's side, attacking", () => {
  const DAEMON = 0x26; // fire, reach 9
  const PYTHON = 0x22; // spit, reach 3
  const RAT = 0x14; // a bite

  /** A field with `kind` on the party's side at (5, 5), the Avatar far off, and giant rats where asked, each with its hit points. */
  const field = (kind: number, ...foes: [number, number, number][]) => {
    const { g, p } = newGame(1);
    journeyOnward(g);
    g.s.mapId = 0xff; // in a fight
    for (const c of g.combat) c.flags = 0;
    for (const a of g.s.actors) a.tile = a.anim = 0;
    placeCombatant(g, 0, 1, 0, 0, 0); // the Avatar, in a corner
    const me = placeCombatant(g, kind, 0, 5, 5, 0);
    charm(g, me, 'bound');
    const at = foes.map(([x, y, hp]) => {
      const j = placeCombatant(g, RAT, 0, x, y, 0);
      g.combat[j].hp = hp;
      return j;
    });
    g.s.combatTurn = me;
    g.snapMemory.fill(-1);
    g.options.input = 'controller';
    return { g, p, me, at };
  };

  it('aims a ranged attack by hand anywhere within its own reach - the crosshair moved, not held on the nearest', async () => {
    const { g, p, me } = field(DAEMON, [7, 5, 50], [9, 5, 50]);
    p.keys.push(K.Right, K.Right, K.Enter);
    await attackCommand(g, me, 0);
    expect([g.s.crossX, g.s.crossY]).toEqual([9, 5]);
  });

  it("aims no further than its reach: a python's spit at 3 squares, not at a foe 4 off", async () => {
    // The crosshair starts on the python itself, no foe within reach, and stops at the reach's edge.
    const { g, p, me } = field(PYTHON, [9, 5, 50]);
    const keys = [K.Right, K.Right, K.Right, K.Right, K.Right, K.Escape];
    const seen: number[] = [];
    p.next = () => {
      seen.push(g.s.crossX);
      return keys.shift() ?? K.Escape;
    };
    await attackCommand(g, me, 0);
    expect(seen[0]).toBe(5);
    expect(Math.max(...seen)).toBe(8);
  });

  it('steps the crosshair with LB and RB only through the foes within its reach', async () => {
    const { g, p, me, at } = field(PYTHON, [6, 5, 9], [5, 7, 9], [9, 5, 9]);
    p.keys.push(Pad.RB, Pad.RB, K.Enter);
    expect(await aim(g, me, 3)).toBeGreaterThan(0);
    expect([g.s.crossX, g.s.crossY]).toEqual([g.combat[at[0]].x, g.combat[at[0]].y]); // round, (9, 5) passed over
  });

  it('lists as its snap targets the foes within its reach - along a clear line for what it throws - the nearest first', () => {
    const daemon = field(DAEMON, [9, 5, 9], [6, 5, 9], [5, 8, 3], [5, 0, 1]);
    expect(snapTargets(daemon.g, daemon.me)).toEqual([daemon.at[1], daemon.at[2], daemon.at[0], daemon.at[3]]);
    const python = field(PYTHON, [9, 5, 9], [6, 5, 9], [5, 8, 3]);
    expect(snapTargets(python.g, python.me)).toEqual([python.at[1], python.at[2]]);
    const rat = field(RAT, [7, 5, 9], [6, 6, 9], [5, 4, 3]);
    expect(snapTargets(rat.g, rat.me)).toEqual([rat.at[2], rat.at[1]]);
  });

  it('strikes its snap target with X, no crosshair asked for, and keeps the foe struck', async () => {
    const { g, p, me, at } = field(DAEMON, [6, 5, 200], [9, 9, 200]);
    cycleSnap(g, 1);
    expect(snapTarget(g, me)).toBe(at[1]);
    let asked = 0;
    p.next = () => {
      asked++;
      return K.Escape;
    };
    g.autoAim = true;
    await attackCommand(g, me, 0);
    expect(asked).toBe(0);
    expect([g.s.crossX, g.s.crossY]).toEqual([9, 9]);
    expect(g.combat[at[0]].hp).toBe(200); // the nearest untouched
    expect(g.snapMemory[me]).toBe(at[1]);
    expect(g.cancelled).toBe(false);
  });

  it('says "Out of reach!" with X where nothing is within its reach, the turn given back', async () => {
    const { g, p, me } = field(RAT, [8, 5, 9]);
    g.autoAim = true;
    await attackCommand(g, me, 0);
    expect(p.log).toContain('Out of reach!');
    expect(g.cancelled).toBe(true);
  });

  it('marks its snap target at its prompt', () => {
    const { g, at } = field(DAEMON, [8, 5, 9]);
    g.commandPrompt = 'combat';
    g.s.crosshair = 0;
    expect(snapMark(g)).toBe(at[0]);
  });

  it('opens on a foe its fire might carry into a friend only where every foe is such', () => {
    const { g, me, at } = field(DAEMON, [8, 5, 9], [5, 8, 9]);
    placeCombatant(g, 1, 1, 8, 6, 0); // a friend beside the nearer foe
    expect(snapTarget(g, me)).toBe(at[1]);
    // A bite strays nowhere: the nearest, friend or no friend.
    const rat = field(RAT, [6, 5, 9], [5, 6, 9]);
    placeCombatant(rat.g, 1, 1, 7, 5, 0);
    expect(snapTarget(rat.g, rat.me)).toBe(snapTargets(rat.g, rat.me)[0]);
  });

  it('says a miss on the line under its attack, with no empty line between', async () => {
    const { g, p, me, at } = field(DAEMON, [9, 5, 250]);
    for (let n = 0; n < 40; n++) {
      g.combat[at[0]].hp = 250;
      p.log = '';
      g.autoAim = true;
      await attackCommand(g, me, 0);
      if (!/missed!/.test(p.log)) continue;
      expect(p.log).toMatch(/Attack:\n\S/);
      return;
    }
    throw new Error('no miss in 40 shots');
  });

  it('with Snap attacks off, only starts its crosshair on a foe it walks into: every blow aimed by hand', async () => {
    const { g, p, me, at } = field(RAT, [6, 5, 9]);
    g.options.autoAim = false;
    g.bumpFoe = { x: 6, y: 5 };
    let asked = 0;
    p.next = () => {
      asked++;
      expect([g.s.crossX, g.s.crossY]).toEqual([6, 5]);
      return K.Escape;
    };
    await attackCommand(g, me, 0);
    expect(asked).toBe(1);
    expect(g.combat[at[0]].hp).toBe(9);
    // On, it strikes the foe walked into straight away.
    g.options.autoAim = true;
    g.bumpFoe = { x: 6, y: 5 };
    asked = 0;
    await attackCommand(g, me, 0);
    expect(asked).toBe(0);
  });

  it("lists no snap targets for a creature on the foes' side", () => {
    const { g, me } = field(DAEMON, [6, 5, 9]);
    g.combat[me].flags &= ~CF.Charmed;
    expect(snapTargets(g, me)).toEqual([]);
  });
});
