import { describe, expect, it } from 'vitest';
import { attackCommand, placeCombatant } from '../src/game/combat.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Status } from '../src/game/save.ts';
import { setView } from '../src/game/world.ts';
import { newGame } from './helpers.ts';

/**
 * Issue #40: auto combat shot at a foe behind rocks, the rocks taking the shot turn after turn, though another foe
 * stood in the open - even beside the archer. It struck because some foe could be shot along a clear line, then aimed
 * where the crosshair began: the foe last struck, or the nearest, whatever stood between. A member's shot is aimed at a
 * foe along a clear line, as a creature's on the party's side already was.
 */
describe('auto combat aims along a clear line', () => {
  for (const lastStruck of [false, true]) {
    it(`shoots the foe in the open, not the one behind the rocks${lastStruck ? ' it struck last' : ''}`, async () => {
      const { g, p } = newGame();
      journeyOnward(g);
      const s = g.s;
      s.mapId = 0xff;
      s.partySize = 1;
      g.combatMap.fill(0x44);
      for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) setView(g, x, y, 0x44);
      // Rocks between the archer and one foe.
      for (const [x, y] of [
        [4, 4],
        [4, 5],
        [4, 6],
      ]) {
        g.combatMap[y * 32 + x] = 0x4f;
        setView(g, x, y, 0x4f);
      }
      for (const a of s.actors) a.tile = a.anim = 0;
      for (const c of g.combat) Object.assign(c, { flags: 0, x: 0x63, y: 0x63 });
      const m = s.members[0];
      Object.assign(m, { status: Status.Good, hp: 50 });
      m.equips.fill(0xff);
      m.equips[2] = 0x1c; // a crossbow
      s.equipment[0x1d] = 20;
      const me = placeCombatant(g, 0, 1, 2, 5, 0);
      s.actors[g.combat[me].actor].tile = 0x48;
      const behind = placeCombatant(g, 0x10, 0, 6, 5, 0); // four squares off, behind the rocks
      const open = placeCombatant(g, 0x10, 0, 2, 9, 0); // four squares off, in the open
      s.actors[g.combat[behind].actor].tile = s.actors[g.combat[open].actor].tile = 0x90;
      // The one behind the rocks the weaker, so the nearest first (the aim's start) would be it.
      g.combat[behind].hp = 1;
      g.combat[open].hp = 30;
      if (lastStruck) s.actors[g.combat[me].actor].b7 = behind;
      s.combatTurn = me;
      Object.assign(g.options, { autoCombat: 'all', input: 'controller' });
      g.commandPrompt = 'combat';
      p.next = () => {
        throw new Error('asked');
      };
      await attackCommand(g, me, 1);
      expect([s.crossX, s.crossY]).toEqual([2, 9]);
    });
  }
});
