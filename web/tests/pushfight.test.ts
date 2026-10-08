import { describe, expect, it } from 'vitest';
import { pushCommand } from '../src/game/cmds.ts';
import { CF } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { T } from '../src/game/tiles.ts';
import { newGame } from './helpers.ts';

/**
 * Push in a fight (cmds.ts pushCommand): whoever pushes steps after the thing pushed, figure and all - a member, or a
 * creature charmed to the party's side, whose turn is asked as a member's is. Found by the monkey: a charmed creature
 * of a kind past 31 pushing a barrel threw, the figure moved being the actor its kind numbered.
 */
describe('push in a fight', () => {
  for (const kind of [0x24, 3])
    it(`moves the pusher's own figure (a charmed creature of kind ${kind})`, async () => {
      const { g, p } = newGame();
      journeyOnward(g);
      const s = g.s;
      s.mapId = 0xff;
      s.combatFlags = 0;
      for (let r = 0; r < 11; r++) g.combatMap.fill(T.T44, r * 32, r * 32 + 11);
      for (const a of s.actors) a.tile = 0;
      g.combat.forEach((c) => c.clear());
      const c = g.combat[6];
      Object.assign(c, { flags: CF.Monster | CF.Charmed, who: kind, actor: 7, x: 4, y: 5, hp: 10 });
      Object.assign(s.actors[7], { tile: 0x40 + kind * 4, anim: 0x40 + kind * 4, x: 4, y: 5, z: 0 });
      // Another figure, in the slot the kind would number: left where it stands.
      Object.assign(s.actors[3], { tile: 0x50, anim: 0x50, x: 1, y: 1, z: 0 });
      g.combatMap[5 * 32 + 5] = T.Barrel;
      s.combatTurn = 6;
      p.keys.push(K.Right);
      await pushCommand(g, true);
      expect(p.log).toContain('Pushed!');
      expect(g.combatMap[5 * 32 + 6]).toBe(T.Barrel);
      expect([c.x, c.y]).toEqual([5, 5]);
      expect([s.actors[7].x, s.actors[7].y]).toEqual([5, 5]);
      expect([s.actors[3].x, s.actors[3].y]).toEqual([1, 1]);
    });
});
