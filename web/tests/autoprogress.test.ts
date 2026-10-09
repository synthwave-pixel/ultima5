import { describe, expect, it } from 'vitest';
import { autoKey } from '../src/game/autocombat.ts';
import { charm } from '../src/game/combat.ts';
import { K } from '../src/game/io.ts';
import { CF } from '../src/game/game.ts';
import { journeyOnward } from '../src/game/run.ts';
import { T } from '../src/game/tiles.ts';
import { setTileAt } from '../src/game/world.ts';
import { newGame } from './helpers.ts';

/** Auto combat hands the fight back when it goes nowhere (autocombat.ts): no foe hurt or down for 30 party turns. */
describe("auto combat's patience", () => {
  const fight = () => {
    const { g } = newGame();
    journeyOnward(g);
    g.s.mapId = 0xff;
    g.options.autoCombat = 'all';
    g.commandPrompt = 'combat';
    g.s.combatTurn = 0;
    g.s.crosshair = 0;
    Object.assign(g.combat[0], { who: 0, x: 5, y: 5, flags: CF.Player, actor: 1 });
    Object.assign(g.combat[1], { who: 0x30, x: 6, y: 5, flags: CF.Monster, hp: 50, actor: 2 }); // beside: struck at
    return g;
  };

  it('hands back after 30 party turns with the foes no worse off, though it strikes every turn', async () => {
    const g = fight();
    let turns = 0;
    while (g.options.autoCombat !== 'off' && turns < 100) {
      await autoKey(g);
      turns++;
    }
    expect(g.options.autoCombat).toBe('off');
    expect(turns).toBeGreaterThan(30);
    expect(turns).toBeLessThan(40);
  });

  it('keeps on while each turn or so the foe is hurt', async () => {
    const g = fight();
    for (let turn = 0; turn < 80; turn++) {
      await autoKey(g);
      if (turn % 10 === 0) g.combat[1].hp--;
    }
    expect(g.options.autoCombat).toBe('all');
  });
});

/** Auto combat and a friend charmed against the party, by the Effects setting (autocombat.ts). */
describe('auto combat and a charmed friend', () => {
  /** Shamino's turn, the Avatar charmed beside him, a rat three squares off (or none). */
  const fight = (effects: 'classic' | 'modern', rat = true) => {
    const { g } = newGame();
    journeyOnward(g);
    g.s.mapId = 0xff;
    Object.assign(g.options, { autoCombat: 'all', rules: effects });
    g.commandPrompt = 'combat';
    Object.assign(g.s, { combatTurn: 1, crosshair: 0, weapon: 0 });
    for (const c of g.combat) c.flags = 0;
    Object.assign(g.combat[0], { who: 0, x: 5, y: 5, flags: CF.Player, actor: 1 });
    Object.assign(g.combat[1], { who: 1, x: 6, y: 5, flags: CF.Player, actor: 2 });
    if (rat) Object.assign(g.combat[6], { who: 0x14, x: 9, y: 5, flags: CF.Monster, hp: 10, actor: 3 });
    charm(g, 0, 6); // the Avatar, turned against the party
    return g;
  };

  it('strikes the charmed Avatar beside it with the Classic effects, as a 1988 player had to', async () => {
    expect(await autoKey(fight('classic'))).toBe(0x41);
    expect(await autoKey(fight('classic', false))).toBe(0x41);
  });

  it('lets a charmed friend alone with the Modern effects: closes with the creature, or waits for the charm to wear off', async () => {
    const g = fight('modern');
    expect(await autoKey(g)).toBe(K.Right); // towards the rat, past the Avatar
    expect(await autoKey(fight('modern', false))).toBe(K.Space);
  });

  it('looses nothing at a charmed friend under the crosshair with the Modern effects', async () => {
    const aimed = (effects: 'classic' | 'modern') => {
      const g = fight(effects);
      Object.assign(g.s, { crosshair: 1, crossX: 5, crossY: 5 }); // on the Avatar
      return autoKey(g);
    };
    expect(await aimed('classic')).toBe(K.Enter);
    expect(await aimed('modern')).not.toBe(K.Enter);
  });
});

/** Auto combat climbs the rocks a fallen gargoyle leaves (autocombat.ts), where a walk onto them is blocked. */
describe('auto combat over rubble', () => {
  it('Klimbs the rocks between a member and the foe, that way', async () => {
    const { g } = newGame();
    journeyOnward(g);
    g.s.mapId = 0xff;
    g.options.autoCombat = 'all';
    g.commandPrompt = 'combat';
    Object.assign(g.s, { combatTurn: 0, crosshair: 0 });
    for (const c of g.combat) c.flags = 0;
    Object.assign(g.combat[0], { who: 0, x: 5, y: 4, flags: CF.Player, actor: 1 });
    Object.assign(g.combat[1], { who: 0x30, x: 5, y: 1, flags: CF.Monster, hp: 50, actor: 2 });
    for (let x = 0; x <= 10; x++) setTileAt(g, x, 3, T.T4C); // a wall of rocks across the field
    expect(await autoKey(g)).toBe(0x4b);
    expect(g.bumpDir).toBe(K.Up);
  });
});

/** Klimb with a way given - the rocks walked into, auto combat's climb - from a ladder in a dungeon room (combat.ts). */
describe('climbing rocks from a ladder', () => {
  it('climbs the rocks that way, rather than leaving the room by the ladder', async () => {
    const { klimbInCombat } = await import('../src/game/combat.ts');
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.mapId = 0xff;
    g.combatMap.fill(0x04);
    for (const c of g.combat) c.flags = 0;
    Object.assign(g.combat[0], { flags: CF.Player, who: 0, x: 5, y: 5, actor: 1 });
    Object.assign(s, { combatTurn: 0, x: 5, y: 5, combatFlags: 0x82 });
    setTileAt(g, 5, 5, T.LadderUp);
    setTileAt(g, 5, 4, T.T4C);
    g.bumpDir = K.Up;
    expect(await klimbInCombat(g)).toBe(true);
    expect([g.combat[0].x, g.combat[0].y]).toEqual([5, 4]);
    expect(p.log).not.toMatch(/Up!/);
  });
});
