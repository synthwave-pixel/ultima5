import { describe, expect, it } from 'vitest';
import { aim, attackCommand, cycleSnap, placeCombatant, snapMark, snapTarget, snapTargets } from '../src/game/combat.ts';
import { CF, type Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { asPad } from '../src/game/input.ts';
import { gameplayLines, settingLines } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/**
 * Snap targets (the port's): the foe a snap attack (X, Snap attacks on) opens on - the nearest the first hand reaches,
 * the weaker of two as near, or the one the member last struck or chose with LB/RB while it is still in reach -
 * marked at the member's prompt; and LB/RB stepping the crosshair from one target to the next.
 */
describe('snap targets', () => {
  const SHORT_SWORD = 0x17;
  const BOW = 0x1a;

  /** A field with the Avatar at (5, 5), holding `weapon`, and foes where asked, each with its hit points. */
  const field = (weapon: number, ...foes: [number, number, number][]) => {
    const { g, p } = newGame(1);
    journeyOnward(g);
    for (const c of g.combat) c.flags = 0;
    for (const a of g.s.actors) a.tile = a.anim = 0;
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    const me = placeCombatant(g, 0, 1, 5, 5, 0);
    const m = g.s.members[g.combat[me].who];
    m.equips.fill(0xff);
    m.equips[2] = weapon;
    g.s.equipment[0x1b] = 20; // arrows: a bow with none marks no foe (zstats.ts unloaded)
    const at = foes.map(([x, y, hp]) => {
      const j = placeCombatant(g, rat, 0, x, y, 0);
      g.combat[j].hp = hp;
      return j;
    });
    g.s.combatTurn = me;
    g.snapMemory.fill(-1);
    return { g, p, me, at };
  };
  const prompt = (g: Game): void => {
    g.options.input = 'controller';
    g.commandPrompt = 'combat';
    g.s.crosshair = 0;
  };

  it('lists the foes the first hand reaches, the nearest first and the weaker of two as near', () => {
    const { g, me, at } = field(BOW, [8, 5, 5], [6, 5, 9], [5, 6, 3], [5, 9, 1]);
    expect(snapTargets(g, me)).toEqual([at[2], at[1], at[0], at[3]]);
    expect(snapTarget(g, me)).toBe(at[2]);
    // A sword reaches only its neighbours.
    const sword = field(SHORT_SWORD, [8, 5, 5], [6, 5, 9], [5, 6, 3]);
    expect(snapTargets(sword.g, sword.me)).toEqual([sword.at[2], sword.at[1]]);
  });

  it('passes over the dead, the charmed and the invisible', () => {
    const { g, me, at } = field(SHORT_SWORD, [6, 5, 1], [4, 5, 2], [5, 4, 3], [5, 6, 4]);
    g.combat[at[0]].flags |= CF.Dead;
    g.combat[at[1]].flags |= CF.Charmed;
    g.combat[at[2]].flags |= CF.Invisible;
    expect(snapTargets(g, me)).toEqual([at[3]]);
  });

  it('opens on the foe last struck or chosen while it stands in reach - else the nearest, the choice kept for later', () => {
    const { g, me, at } = field(SHORT_SWORD, [6, 5, 1], [4, 5, 9]);
    g.snapMemory[me] = at[1];
    expect(snapTarget(g, me)).toBe(at[1]);
    // Out of reach for now: the nearest, and the remembered foe again once it is back beside the member.
    g.combat[at[1]].x = 2;
    expect(snapTarget(g, me)).toBe(at[0]);
    expect(g.snapMemory[me]).toBe(at[1]);
    g.combat[at[1]].x = 4;
    expect(snapTarget(g, me)).toBe(at[1]);
  });

  it('steps with LB and RB through the targets, round from the last to the first, the choice the member keeps', () => {
    const { g, me, at } = field(BOW, [6, 5, 9], [5, 7, 3], [9, 5, 1]);
    expect(snapTarget(g, me)).toBe(at[0]);
    cycleSnap(g, 1);
    expect(snapTarget(g, me)).toBe(at[1]);
    cycleSnap(g, 1);
    expect(snapTarget(g, me)).toBe(at[2]);
    cycleSnap(g, 1);
    expect(snapTarget(g, me)).toBe(at[0]);
    cycleSnap(g, -1);
    expect(snapTarget(g, me)).toBe(at[2]);
    expect(g.snapMemory[me]).toBe(at[2]);
  });

  it("forgets a foe whose slot a newcomer takes (a rat's split, a daemon gated in)", () => {
    const { g, me, at } = field(SHORT_SWORD, [6, 5, 9], [4, 5, 9]);
    g.snapMemory[me] = at[1];
    g.combat[at[1]].flags = 0; // gone, its slot free
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    expect(placeCombatant(g, rat, 0, 4, 5, 0)).toBe(at[1]);
    expect(g.snapMemory[me]).toBe(-1);
  });

  it("is marked at the member's own prompt with Snap attacks and Snap targets on, and nowhere else", () => {
    const { g, at } = field(SHORT_SWORD, [6, 5, 9]);
    expect(snapMark(g)).toBe(-1); // no prompt
    prompt(g);
    expect(snapMark(g)).toBe(at[0]);
    g.options.snapTargets = false;
    expect(snapMark(g)).toBe(-1);
    g.options.snapTargets = true;
    g.options.autoAim = false;
    expect(snapMark(g)).toBe(-1);
    g.options.autoAim = true;
    g.s.crosshair = 1; // aiming by hand: the crosshair's own mark
    expect(snapMark(g)).toBe(-1);
    g.s.crosshair = 0;
    g.options.autoCombat = 'all';
    expect(snapMark(g)).toBe(-1);
    g.options.autoCombat = 'off';
    // The keyboard as letters has no X - but a gamepad's X is one with either input.
    g.options.input = 'letters';
    g.lastSource = 'keyboard';
    expect(snapMark(g)).toBe(-1);
    g.lastSource = 'gamepad';
    expect(snapMark(g)).toBe(at[0]);
    // Nothing the X would strike: nothing marked.
    g.combat[at[0]].x = 8;
    expect(snapMark(g)).toBe(-1);
  });

  it('reads [ and ] as LB and RB, with either input', () => {
    const { g } = newGame();
    for (const input of ['controller', 'letters'] as const) {
      g.options.input = input;
      expect(asPad(g, 0x5b)).toBe(Pad.LB);
      expect(asPad(g, 0x5d)).toBe(Pad.RB);
    }
  });

  it("steps the crosshair with LB and RB from foe to foe within the aim's range, and for a friend's spell, friend to friend", async () => {
    const { g, p, me, at } = field(BOW, [6, 5, 9], [5, 7, 3], [9, 5, 1], [5, 0, 1]);
    p.keys.push(Pad.RB, Pad.RB, K.Enter);
    expect(await aim(g, me, 4)).toBe(4);
    expect([g.s.crossX, g.s.crossY]).toEqual([g.combat[at[2]].x, g.combat[at[2]].y]);
    // Round from the last to the first, back with LB; the one beyond range (5, 0) passed over.
    p.keys.push(Pad.LB, K.Enter);
    await aim(g, me, 4);
    expect([g.s.crossX, g.s.crossY]).toEqual([9, 5]);
    // For a friend: the party's side alone.
    const friend = placeCombatant(g, 1, 1, 7, 7, 0);
    p.keys.push(Pad.RB, K.Enter);
    await aim(g, me, 4, true);
    expect([g.s.crossX, g.s.crossY]).toEqual([g.combat[friend].x, g.combat[friend].y]);
  });
  it('strikes the snap target with X: the foe chosen, not the nearest, and keeps the foe struck', async () => {
    const { g, me, at } = field(SHORT_SWORD, [6, 5, 1], [4, 4, 50]);
    cycleSnap(g, 1);
    expect(snapTarget(g, me)).toBe(at[1]);
    g.autoAim = true;
    await attackCommand(g, me, 1);
    expect([g.s.crossX, g.s.crossY]).toEqual([4, 4]);
    expect(g.combat[at[0]].hp).toBe(1); // the nearest untouched
    expect(g.snapMemory[me]).toBe(at[1]);
  });
  it('has Snap targets in Settings, on to begin with, and Snap attacks in Gameplay - each line within the menu', async () => {
    const { DEFAULTS } = await import('../src/game/settings.ts');
    expect(DEFAULTS.snapTargets).toBe(true);
    const { g } = newGame();
    const line = (lines: { label: string }[], name: string) => lines.find((l) => l.label.startsWith(name))!;
    for (const on of [true, false]) {
      g.options.snapTargets = g.options.autoAim = on;
      for (const label of [line(settingLines(g), 'Snap targets').label, line(gameplayLines(g), 'Snap attacks').label]) {
        expect(label).toMatch(on ? /: On$/ : /: Off$/);
        expect(label.length + 2, label).toBeLessThanOrEqual(21); // after the row's letter and its space (menu.ts row)
      }
    }
  });
  it('opens on a foe a stray shot might carry into a friend only where every foe is such, keeping to the choice', () => {
    const { g, me, at } = field(BOW, [8, 5, 9], [5, 8, 9]);
    placeCombatant(g, 1, 1, 8, 6, 0); // a friend beside each foe
    placeCombatant(g, 2, 1, 6, 8, 0);
    expect(snapTargets(g, me)).toEqual(at.slice(0, 2));
    expect(snapTarget(g, me)).toBe(at[0]);
    g.snapMemory[me] = at[1];
    expect(snapTarget(g, me)).toBe(at[1]);
  });
});
