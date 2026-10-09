import { describe, expect, it } from 'vitest';
import { autoKey, type AutoInterrupt } from '../src/game/autocombat.ts';
import { autoPlaysTurn, charm } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { normaliseOptions } from '../src/game/settings.ts';
import { newGame } from './helpers.ts';

/**
 * Auto combat's Allies (autocombat.ts): every turn on the party's side played but the Avatar's, which is the player's -
 * the other members, and the creatures summoned or charmed to its side.
 */
describe('auto combat: Allies', () => {
  /** The Avatar and Shamino, a rat beside Shamino (or none): `turn`'s turn. */
  const fight = (turn: number, rat = true) => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.mapId = 0xff;
    Object.assign(g.options, { autoCombat: 'allies', rules: 'modern' });
    g.commandPrompt = 'combat';
    for (const c of g.combat) c.flags = 0;
    Object.assign(g.combat[0], { who: 0, x: 3, y: 5, flags: CF.Player, actor: 1 });
    Object.assign(g.combat[1], { who: 1, x: 6, y: 5, flags: CF.Player, actor: 2 });
    if (rat) Object.assign(g.combat[6], { who: 0x14, x: 7, y: 5, flags: CF.Monster, hp: 10, actor: 3 });
    Object.assign(s, { combatTurn: turn, crosshair: 0, weapon: 0, battleWon: rat ? 0 : 1, combatFlags: 0 });
    return { g, p };
  };

  it("leaves the Avatar's turn to the player, the key pressed kept for it", async () => {
    const { g, p } = fight(0);
    p.keys.push(K.Up);
    expect(autoPlaysTurn(g)).toBe(false);
    expect(await autoKey(g)).toBe(0);
    expect(p.keys).toEqual([K.Up]); // not taken: it is the Avatar's move
    expect(g.options.autoCombat).toBe('allies');
  });

  it("plays an ally's turn, and stays on through a key pressed meanwhile", async () => {
    const { g, p } = fight(1);
    p.keys.push(K.Up);
    expect(autoPlaysTurn(g)).toBe(true);
    expect(await autoKey(g)).toBe(0x41); // Shamino strikes the rat beside him
    expect(g.options.autoCombat).toBe('allies');
  });

  it("plays a creature charmed to the party's side", async () => {
    const { g } = fight(6);
    Object.assign(g.combat[7], { who: 0x14, x: 8, y: 5, flags: CF.Monster, hp: 10, actor: 4 }); // a second rat beside it
    charm(g, 6, 0); // the first rat, turned to the party's side
    expect(await autoKey(g)).toBe(0x41);
  });

  it("passes an ally's turn on a won field, for the Avatar to leave it - unless the Avatar has fallen", async () => {
    const { g } = fight(1, false);
    expect(await autoKey(g)).toBe(K.Space);
    g.combat[0].flags |= CF.Dead;
    expect(await autoKey(g)).toBe(K.Escape); // as All does: the field left
  });

  it('hands a fight going nowhere back for that fight alone, Allies kept for the next', async () => {
    const { g } = fight(1);
    let turns = 0;
    while (!g.autoHeld && turns < 100) {
      await autoKey(g);
      turns++;
    }
    expect(g.autoHeld).toBe(true);
    expect(g.options.autoCombat).toBe('allies');
    expect(autoPlaysTurn(g)).toBe(false);
    expect(await autoKey(g)).toBe(0);
  });
});

/**
 * The player's keys in a turn auto combat plays (autocombat.ts keysPressed, input.ts autoCombatKey): Pause opens its
 * menu, where Auto combat is changed; B twice in quick succession turns it off; the rest are let go.
 */
describe("auto combat and the player's keys", () => {
  const fight = (mode: 'allies' | 'all') => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.mapId = 0xff;
    Object.assign(g.options, { autoCombat: mode, rules: 'modern' });
    g.commandPrompt = 'combat';
    for (const c of g.combat) c.flags = 0;
    Object.assign(g.combat[0], { who: 0, x: 3, y: 5, flags: CF.Player | CF.Dead, actor: 1 }); // the Avatar fallen
    Object.assign(g.combat[1], { who: 1, x: 6, y: 5, flags: CF.Player, actor: 2 });
    Object.assign(g.combat[6], { who: 0x14, x: 7, y: 5, flags: CF.Monster, hp: 10, actor: 3 });
    Object.assign(s, { combatTurn: 1, crosshair: 0, weapon: 0, battleWon: 0, combatFlags: 0 });
    let clock = 0;
    p.now = () => clock;
    return { g, p, at: (ms: number) => (clock = ms) };
  };
  /** The keys told apart as input.ts tells them: Start the Pause menu, where Auto combat is set to `to`; B; the rest. */
  const keys =
    (g: ReturnType<typeof fight>['g'], to?: 'off' | 'allies' | 'all'): AutoInterrupt =>
    async (key) => {
      if (key === Pad.Start) {
        if (to) g.options.autoCombat = to;
        return 'pause';
      }
      return key === Pad.B ? 'back' : 'other';
    };

  for (const mode of ['allies', 'all'] as const) {
    it(`opens the Pause menu with ${mode}, the Avatar fallen: turned off there, the turn is the player's`, async () => {
      const { g, p } = fight(mode);
      p.keys.push(Pad.Start);
      expect(await autoKey(g, keys(g, 'off'))).toBe(0);
      expect(g.options.autoCombat).toBe('off');
    });

    it(`opens the Pause menu with ${mode}: left as it was, the turn is played`, async () => {
      const { g, p } = fight(mode);
      p.keys.push(Pad.Start);
      expect(await autoKey(g, keys(g))).toBe(0x41);
      expect(g.options.autoCombat).toBe(mode);
    });

    it(`turns ${mode} off at B twice in quick succession, and says so`, async () => {
      const { g, p, at } = fight(mode);
      p.keys.push(Pad.B);
      expect(await autoKey(g, keys(g))).toBe(0x41); // once: the turn played
      at(300);
      p.keys.push(Pad.B);
      expect(await autoKey(g, keys(g))).toBe(0);
      expect(g.options.autoCombat).toBe('off');
      expect(p.log).toContain('Auto combat off');
    });

    it(`keeps ${mode} on at B twice slowly`, async () => {
      const { g, p, at } = fight(mode);
      p.keys.push(Pad.B);
      await autoKey(g, keys(g));
      at(1000);
      p.keys.push(Pad.B);
      expect(await autoKey(g, keys(g))).toBe(0x41);
      expect(g.options.autoCombat).toBe(mode);
    });

    it(`lets every other key go with ${mode}, none left over for a turn of the player's`, async () => {
      const { g, p } = fight(mode);
      p.keys.push(Pad.A, Pad.A, K.Up, Pad.X);
      expect(await autoKey(g, keys(g))).toBe(0x41);
      expect(g.options.autoCombat).toBe(mode);
      expect(p.keys).toEqual([]);
    });
  }

  it('puts "Auto" on the border while it plays a turn', async () => {
    const { g } = fight('allies');
    const titles: string[] = [];
    const print = g.print.bind(g);
    g.print = (t: string) => {
      titles.push(t);
      print(t);
    };
    await autoKey(g, keys(g));
    expect(g.autoShown).toBe(true);
    expect(titles).toContain('Auto');
  });
});

describe('auto combat in saved settings', () => {
  it('reads the old on or off as All or Off, and drops a value this build has not', () => {
    expect(normaliseOptions({ autoCombat: true }).autoCombat).toBe('all');
    expect(normaliseOptions({ autoCombat: false }).autoCombat).toBe('off');
    expect(normaliseOptions({ autoCombat: 'allies' }).autoCombat).toBe('allies');
    expect('autoCombat' in normaliseOptions({ autoCombat: 'some' as 'all' })).toBe(false);
  });
});
