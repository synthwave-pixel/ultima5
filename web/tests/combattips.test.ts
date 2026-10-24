import { describe, expect, it } from 'vitest';
import { COMBAT_TIPS, combatTip } from '../src/game/tips.ts';
import { journeyOnward } from '../src/game/run.ts';
import { attackCombat } from '../src/game/combat.ts';
import { K } from '../src/game/io.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { fighter, keys, newGame } from './helpers.ts';

/**
 * A fight's tips (tips.ts COMBAT_TIPS): one a fight, in their order, each once a character - worded for the controller
 * or the keyboard read as one, and held while the keyboard is read as letters or Snap attacks or Snap targets is off.
 */
describe("a fight's tips", () => {
  const begun = () => {
    const { g } = newGame();
    journeyOnward(g);
    g.options.input = 'controller';
    g.lastSource = 'gamepad';
    return g;
  };

  it('come in their order, once each, then no more', () => {
    const g = begun();
    expect([combatTip(g), combatTip(g), combatTip(g), combatTip(g)]).toEqual([
      'Tip: Press X for a snap attack!',
      'Tip: Press Y to cast a spell!',
      'Tip: Press LB/RB to cycle snap targets!',
      null,
    ]);
    expect([...g.tipsShown]).toEqual(['nudge', ...COMBAT_TIPS.map((t) => t.id)]);
  });

  it("name the keyboard's keys when the keyboard was last pressed", () => {
    const g = begun();
    g.lastSource = 'keyboard';
    expect([combatTip(g), combatTip(g), combatTip(g)]).toEqual([
      'Tip: Press C for a snap attack!',
      'Tip: Press Y to cast a spell!',
      'Tip: Press [ or ] to cycle snap targets!',
    ]);
  });

  it('wait, the chain where it was, with letters, Snap attacks off or Snap targets off', () => {
    const g = begun();
    for (const off of [{ input: 'letters' as const }, { autoAim: false }, { snapTargets: false }]) {
      const was = { ...g.options };
      Object.assign(g.options, off);
      expect(combatTip(g)).toBeNull();
      Object.assign(g.options, was);
    }
    expect(combatTip(g)).toBe('Tip: Press X for a snap attack!');
  });

  it("hold the shoulders' tip for the touch pad, which has none", () => {
    const g = begun();
    g.lastSource = 'touch';
    expect(combatTip(g)).toBe('Tip: Press X for a snap attack!');
    expect(combatTip(g)).toBe('Tip: Press Y to cast a spell!');
    expect(combatTip(g)).toBeNull();
    g.lastSource = 'gamepad';
    expect(combatTip(g)).toBe('Tip: Press LB/RB to cycle snap targets!');
  });

  it('are kept with the saved game, a new character beginning them afresh', async () => {
    const { restore, serialize } = await import('../src/game/storage.ts');
    const g = begun();
    combatTip(g);
    const saved = serialize(g);
    expect(saved.tipsShown).toEqual(['nudge', 'snap-attack']);
    const again = begun();
    again.tipsShown = new Set();
    restore(again, saved);
    expect(combatTip(again)).toBe('Tip: Press Y to cast a spell!');
  });
  it("is given in the log at a real fight's first turn of the party's, one a fight, and never again once all are given", async () => {
    const fight = async (g: ReturnType<typeof newGame>['g'], p: ReturnType<typeof newGame>['p']): Promise<string> => {
      const from = p.log.length;
      const s = g.s;
      const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
      const foe = s.actors[1];
      foe.tile = foe.anim = 0x40 + rat * 4;
      [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];
      const inner = fighter(g);
      p.next = () => {
        g.options.input = 'letters'; // the shared fighter plays the keyboard's letters
        return inner();
      };
      g.options.input = 'controller';
      g.lastSource = 'gamepad';
      await attackCombat(g, 1);
      return p.log.slice(from).replace(/\s+/g, ''); // as the log wraps it
    };
    const { g, p } = newGame(1);
    journeyOnward(g);
    await enterTown(g, true);
    p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    const first = await fight(g, p);
    expect(first).toContain('Tip:PressXforasnapattack!');
    expect(first).not.toContain('PressY');
    const second = await fight(g, p);
    expect(second).toContain('Tip:PressYtocastaspell!');
    expect(second).not.toContain('PressXfor');
    const third = await fight(g, p);
    expect(third).toContain('Tip:PressLB/RBtocyclesnaptargets!');
    // Every tip given: no fight after has one, nor does the game taken up again from its save.
    for (let n = 0; n < 3; n++) expect(await fight(g, p)).not.toContain('Tip:');
    const { restore, serialize } = await import('../src/game/storage.ts');
    const again = newGame(1);
    journeyOnward(again.g);
    restore(again.g, serialize(g));
    expect(combatTip(again.g)).toBeNull();
  });
});
