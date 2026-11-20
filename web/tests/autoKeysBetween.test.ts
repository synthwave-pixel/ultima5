import { describe, expect, it } from 'vitest';
import { autoKey, heedKeys, type AutoInterrupt } from '../src/game/autocombat.ts';
import { CF } from '../src/game/game.ts';
import { Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/**
 * Issue #40: in a fight with many foes, a Pause, or B twice to stop auto combat, went unheard - the keys were read only
 * as the party's next turn began, many foes' turns later, and two Bs either side of that reading were read seconds
 * apart. Now the keys are heeded after every turn (heedKeys), and a B is timed by its press (Platform.pressedAt).
 */
describe("auto combat and the player's keys between turns", () => {
  /** The Avatar and Shamino against a rat; the foe's turn. `pressed`: when the key read was pressed. */
  const fight = (mode: 'allies' | 'all', avatarFallen = false) => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.mapId = 0xff;
    Object.assign(g.options, { autoCombat: mode, rules: 'modern' });
    g.commandPrompt = 'combat';
    for (const c of g.combat) c.flags = 0;
    Object.assign(g.combat[0], { who: 0, x: 3, y: 5, flags: CF.Player | (avatarFallen ? CF.Dead : 0), actor: 1 });
    Object.assign(g.combat[1], { who: 1, x: 6, y: 5, flags: CF.Player, actor: 2 });
    Object.assign(g.combat[6], { who: 0x14, x: 7, y: 5, flags: CF.Monster, hp: 10, actor: 3 });
    Object.assign(s, { combatTurn: 6, crosshair: 0, weapon: 0, battleWon: 0, combatFlags: 0 });
    const clock = { now: 0, pressed: 0 };
    p.now = () => clock.now;
    Object.assign(p, { pressedAt: () => clock.pressed });
    return { g, p, clock };
  };
  const paused: string[] = [];
  const keys =
    (g: ReturnType<typeof fight>['g'], to?: 'off' | 'allies' | 'all'): AutoInterrupt =>
    async (key) => {
      if (key === Pad.Start) {
        paused.push(g.options.autoCombat);
        if (to) g.options.autoCombat = to;
        return 'pause';
      }
      return key === Pad.B ? 'back' : 'other';
    };

  it('opens the Pause menu at the end of a foe’s turn with All, the key taken', async () => {
    const { g, p } = fight('all');
    paused.length = 0;
    p.keys.push(Pad.Start);
    await heedKeys(g, keys(g, 'off'));
    expect(paused).toEqual(['all']);
    expect(g.options.autoCombat).toBe('off');
    expect(p.keys).toEqual([]);
  });

  it('turns All off at B twice pressed during the foes’ turns', async () => {
    const { g, p } = fight('all');
    p.keys.push(Pad.B, Pad.B);
    await heedKeys(g, keys(g));
    expect(g.options.autoCombat).toBe('off');
    expect(p.log).toContain('Auto combat off');
  });

  it('heeds Allies with the Avatar fallen as All, every turn being auto combat’s', async () => {
    const { g, p } = fight('allies', true);
    paused.length = 0;
    p.keys.push(Pad.Start);
    await heedKeys(g, keys(g));
    expect(paused).toEqual(['allies']);
  });

  it('leaves the keys waiting with Allies and the Avatar standing, for the Avatar’s own turn', async () => {
    const { g, p } = fight('allies');
    p.keys.push(Pad.Start, Pad.B);
    await heedKeys(g, keys(g));
    expect(p.keys).toEqual([Pad.Start, Pad.B]);
    expect(g.options.autoCombat).toBe('allies');
  });

  it('does nothing with auto combat off', async () => {
    const { g, p } = fight('all');
    g.options.autoCombat = 'off';
    p.keys.push(Pad.B, Pad.B);
    await heedKeys(g, keys(g));
    expect(p.keys).toEqual([Pad.B, Pad.B]);
  });

  it('times a B by its press: two pressed 300 ms apart are a double press though read 2 s apart', async () => {
    const { g, p, clock } = fight('all');
    g.s.combatTurn = 1; // Shamino's turn, auto combat's
    p.keys.push(Pad.B);
    Object.assign(clock, { now: 0, pressed: 0 });
    await autoKey(g, keys(g));
    expect(g.options.autoCombat).toBe('all');
    p.keys.push(Pad.B);
    Object.assign(clock, { now: 2000, pressed: 300 }); // pressed soon after, read once the foes had moved
    expect(await autoKey(g, keys(g))).toBe(0);
    expect(g.options.autoCombat).toBe('off');
  });

  it('keeps on at two Bs pressed slowly, however soon they are read', async () => {
    const { g, p, clock } = fight('all');
    g.s.combatTurn = 1;
    p.keys.push(Pad.B);
    Object.assign(clock, { now: 0, pressed: 0 });
    await autoKey(g, keys(g));
    p.keys.push(Pad.B);
    Object.assign(clock, { now: 100, pressed: 1000 });
    await autoKey(g, keys(g));
    expect(g.options.autoCombat).toBe('all');
  });
});

describe('auto combat in a real fight, keys pressed while a foe acts', () => {
  it("turns off before the next combatant's turn, not at the party's next turn", async () => {
    const { g, p } = newGame(6);
    journeyOnward(g);
    const s = g.s;
    const { attackCombat } = await import('../src/game/combat.ts');
    const { enterTown, townLoop } = await import('../src/game/town.ts');
    const { K } = await import('../src/game/io.ts');
    await enterTown(g, true);
    p.keys.push(K.Down, K.Down, K.Down, 0x4f, K.Down, ...Array<number>(14).fill(K.Down), 0x59);
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    Object.assign(s.actors[1], { tile: 0x40 + rat * 4, anim: 0x40 + rat * 4, x: s.x + 1, y: s.y, z: 0 });
    Object.assign(g.options, { autoCombat: 'all', input: 'controller' });
    // The first thing said in a foe's turn: B twice pressed there and then. Which turn it was, and which turn's
    // was the first said once auto combat is off.
    let pressedIn = -1;
    let offIn = -1;
    const print = g.print.bind(g);
    g.print = (t: string) => {
      if (pressedIn < 0 && s.combatTurn >= 6 && s.combatTurn < 0x20 && s.mapId === 0xff) {
        pressedIn = s.combatTurn;
        p.keys.push(Pad.B, Pad.B);
      }
      if (offIn < 0 && /Auto combat off/.test(t)) offIn = s.combatTurn;
      print(t);
    };
    const stop = new Error('the player is asked');
    p.next = () => {
      throw stop;
    };
    await attackCombat(g, 1).catch((e: unknown) => {
      if (e !== stop) throw e;
    });
    expect(pressedIn).toBeGreaterThanOrEqual(6);
    expect(offIn).toBe(pressedIn); // heard as that foe's turn ended, before anyone else's
    expect(g.options.autoCombat).toBe('off');
  });
});
