import { describe, expect, it } from 'vitest';
import { autoKey } from '../src/game/autocombat.ts';
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

/** Pause in the midst of auto combat (input.ts autoCombatKey): the Pause menu, where Auto combat is changed. */
describe('auto combat and the Pause menu', () => {
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
    return { g, p };
  };
  /** The Pause menu, as input.ts opens it for Start: what is chosen there, set. */
  const pauseTo = (g: ReturnType<typeof fight>['g'], to: 'off' | 'allies' | 'all') => async (key: number) => {
    if (key !== Pad.Start) return false;
    g.options.autoCombat = to;
    return true;
  };

  for (const mode of ['allies', 'all'] as const) {
    it(`opens it in an ally's turn with ${mode}, the Avatar fallen: turned off there, the turn is the player's`, async () => {
      const { g, p } = fight(mode);
      p.keys.push(Pad.Start);
      expect(await autoKey(g, pauseTo(g, 'off'))).toBe(0);
      expect(g.options.autoCombat).toBe('off');
    });

    it(`opens it in an ally's turn with ${mode}: left as it was, the turn is played`, async () => {
      const { g, p } = fight(mode);
      p.keys.push(Pad.Start);
      expect(await autoKey(g, pauseTo(g, mode))).toBe(0x41);
      expect(g.options.autoCombat).toBe(mode);
    });
  }

  it('hands the party back at any other key with All, and lets it go with Allies', async () => {
    const all = fight('all');
    all.p.keys.push(K.Up);
    expect(await autoKey(all.g, pauseTo(all.g, 'all'))).toBe(0);
    expect(all.g.options.autoCombat).toBe('off');
    const allies = fight('allies');
    allies.p.keys.push(K.Up);
    expect(await autoKey(allies.g, pauseTo(allies.g, 'allies'))).toBe(0x41);
    expect(allies.g.options.autoCombat).toBe('allies');
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
